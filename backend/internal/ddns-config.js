/**
 * CRUD for the `ddns_configs` table.
 *
 * Follows the same access-controlled pattern as the other internals
 * (`internal/proxy-host.js`, etc.):
 *   - All entry points run `access.can("admin:settings", data)` first
 *   - Mutations are mirrored to the audit log
 *   - Process lifecycle (start/stop/reload) is delegated to `internalDdnsManager`
 *   - Sensitive fields are stripped from GET responses by the model's
 *     `$parseDatabaseJson` hook (see models/ddns_config.js)
 */

import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import DdnsConfigModel from "../models/ddns_config.js";
import internalAuditLog from "./audit-log.js";
import internalDdnsBuilder from "./ddns-config-builder.js";
import internalDdnsManager from "./ddns-manager.js";

const omissions = () => ["is_deleted", "owner.is_deleted"];

/**
 * Normalize a config_json payload: accept either an object or a JSON string
 * (the model can return either depending on jsonAttributes handling) and
 * return an object.
 *
 * @param {Object|string|null|undefined} cfg
 * @returns {Object}
 */
const normalizeConfigJson = (cfg) => {
	if (!cfg) return {};
	if (typeof cfg === "string") {
		try {
			return JSON.parse(cfg);
		} catch (_) {
			return {};
		}
	}
	if (typeof cfg === "object") return cfg;
	return {};
};

/**
 * Strip server-managed fields from a request body before insert/update.
 *
 * @param {Object} data
 */
const stripServerFields = (data) => {
	for (const k of [
		"id",
		"created_on",
		"modified_on",
		"is_deleted",
		"owner_user_id",
		"last_run_at",
		"last_run_success",
		"last_trigger_at",
		"last_trigger_success",
		"last_error",
	]) {
		if (k in data) delete data[k];
	}
	return data;
};

/**
 * Fetch all enabled, non-deleted rows from the DB. Used as a callback for
 * the manager's debounced reload.
 *
 * @returns {Promise<Array<Object>>}
 */
const fetchEnabledRows = async () => {
	return DdnsConfigModel.query().where("is_deleted", 0).andWhere("enabled", 1);
};

const internalDdnsConfig = {
	/**
	 * @param {Access} access
	 * @param {Object} data
	 * @returns {Promise<Object>}
	 */
	create: async (access, data) => {
		await access.can("admin:settings", data);

		stripServerFields(data);
		data.owner_user_id = access.token.getUserId(1);

		// Normalize + validate config_json
		data.config_json = normalizeConfigJson(data.config_json);
		internalDdnsBuilder.validateProviderFields(data.provider, data.config_json);

		if (typeof data.meta === "undefined") {
			data.meta = {};
		}
		if (typeof data.ip_version === "undefined" || !data.ip_version) {
			data.ip_version = "ipv4";
		}
		if (typeof data.update_cron === "undefined" || !data.update_cron) {
			data.update_cron = "@every 5m";
		}

		const row = await DdnsConfigModel.query().insertAndFetch(data).then(utils.omitRow(omissions()));

		// If the new row is enabled, ask the manager to reload.
		if (row.enabled) {
			internalDdnsManager.reload(fetchEnabledRows);
		}

		await internalAuditLog.add(access, {
			action: "created",
			object_type: "ddns-config",
			object_id: row.id,
			meta: _.omit(data, ["config_json"]),
		});

		return row;
	},

	/**
	 * @param {Access} access
	 * @param {Object} data — must include `id`.
	 * @returns {Promise<Object>}
	 */
	update: async (access, data) => {
		await access.can("admin:settings", data.id);

		const existing = await internalDdnsConfig.get(access, { id: data.id });
		if (!existing || !existing.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		stripServerFields(data);

		// Reconstitute config_json from existing + patch so a partial PUT
		// doesn't wipe the credentials.
		const newCfg = normalizeConfigJson(data.config_json);
		const existingCfg = normalizeConfigJson(existing.config_json);

		// The frontend sends "" (empty string) for fields it wants to leave
		// unchanged, see model.js. Merge by falling back to the existing
		// value when the incoming value is empty.
		const merged = { ...existingCfg, ...newCfg };
		for (const k of Object.keys(newCfg)) {
			if (newCfg[k] === "" || newCfg[k] === null) {
				merged[k] = existingCfg[k];
			}
		}
		data.config_json = merged;
		internalDdnsBuilder.validateProviderFields(data.provider || existing.provider, merged);

		const updated = await DdnsConfigModel.query()
			.patchAndFetchById(existing.id, data)
			.then(utils.omitRow(omissions()));

		internalDdnsManager.reload(fetchEnabledRows);

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "ddns-config",
			object_id: existing.id,
			meta: _.omit(data, ["config_json"]),
		});

		return updated;
	},

	/**
	 * @param {Access} access
	 * @param {Object} data — `{ id }`.
	 * @returns {Promise<Object>}
	 */
	get: async (access, data) => {
		const thisData = data || {};
		const accessData = await access.can("admin:settings", thisData.id);

		const query = DdnsConfigModel.query()
			.where("is_deleted", 0)
			.andWhere("id", thisData.id)
			.allowGraph("[owner]")
			.first();

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		const row = await query.then(utils.omitRow(omissions()));
		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}

		const status = internalDdnsManager.getStatus(row.id);
		row.process_status = status || { state: "never-started", running: false };
		return row;
	},

	/**
	 * @param {Access} access
	 * @param {Object} data — `{ id }`.
	 * @returns {Promise<boolean>}
	 */
	delete: async (access, data) => {
		await access.can("admin:settings", data.id);
		const existing = await internalDdnsConfig.get(access, { id: data.id });
		if (!existing || !existing.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		await DdnsConfigModel.query().where("id", existing.id).patch({ is_deleted: 1 });

		// After delete, reload — if the deleted row was enabled, the manager
		// picks a new config on its next start.
		internalDdnsManager.reload(fetchEnabledRows);

		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "ddns-config",
			object_id: existing.id,
			meta: _.omit(existing, omissions()),
		});
		return true;
	},

	/**
	 * @param {Access} access
	 * @param {Object} data — `{ id }`.
	 */
	enable: async (access, data) => {
		await access.can("admin:settings", data.id);
		const existing = await internalDdnsConfig.get(access, { id: data.id });
		if (!existing || !existing.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (existing.enabled) {
			throw new errs.ValidationError("DDNS config is already enabled");
		}
		await DdnsConfigModel.query().where("id", existing.id).patch({ enabled: 1 });
		internalDdnsManager.reload(fetchEnabledRows);

		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "ddns-config",
			object_id: existing.id,
			meta: _.omit(existing, omissions()),
		});
		return true;
	},

	/**
	 * @param {Access} access
	 * @param {Object} data — `{ id }`.
	 */
	disable: async (access, data) => {
		await access.can("admin:settings", data.id);
		const existing = await internalDdnsConfig.get(access, { id: data.id });
		if (!existing || !existing.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (!existing.enabled) {
			throw new errs.ValidationError("DDNS config is already disabled");
		}
		await DdnsConfigModel.query().where("id", existing.id).patch({ enabled: 0 });
		internalDdnsManager.reload(fetchEnabledRows);

		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "ddns-config",
			object_id: existing.id,
			meta: _.omit(existing, omissions()),
		});
		return true;
	},

	/**
	 * @param {Access} access
	 * @param {Array<string>} [expand]
	 * @param {string} [searchQuery]
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("admin:settings");
		const query = DdnsConfigModel.query().where("is_deleted", 0).allowGraph("[owner]").orderBy("name", "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where("name", "like", `%${searchQuery}%`)
					.orWhere("provider", "like", `%${searchQuery}%`)
					.orWhere("domain", "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const rows = await query.then(utils.omitRows(omissions()));
		return rows.map((row) => {
			const status = internalDdnsManager.getStatus(row.id);
			row.process_status = status || { state: "never-started", running: false };
			return row;
		});
	},

	/**
	 * Start the manager with all currently enabled rows. Called once at boot.
	 *
	 * @returns {Promise<{started: number, failed: number, total: number}>}
	 */
	startAllEnabled: async () => {
		const rows = await fetchEnabledRows();
		const ok = await internalDdnsManager.start(rows);
		return { started: ok ? 1 : 0, failed: ok ? 0 : 1, total: rows.length };
	},

	/**
	 * Preload in-memory cache from a list of rows. Called once at boot
	 * after migration.
	 *
	 * @param {Array<Object>} rows
	 */
	preloadFromDatabase: async (rows) => {
		// Inject the dbPatcher so runtime state writes (last_run, etc.) work.
		internalDdnsManager.setDbPatcher((id, patch) => DdnsConfigModel.query().where("id", id).patch(patch));
		return internalDdnsManager.preloadFromDatabase(rows || []);
	},

	/**
	 * Trigger a one-shot run for a single row.
	 *
	 * @param {Access} access
	 * @param {Object} data — `{ id }`.
	 */
	trigger: async (access, data) => {
		await access.can("admin:settings", data.id);
		const row = await internalDdnsConfig.get(access, { id: data.id });
		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		const result = await internalDdnsManager.trigger(row);
		internalDdnsManager.updateLastTrigger(row.id, result.success);

		const meta = {
			success: result.success,
			exitCode: result.exitCode,
			name: row.name || `#${row.id}`,
		};
		if (result.output) meta.output = result.output.substring(0, 500);
		if (result.error) meta.error = result.error.substring(0, 500);

		await internalAuditLog.add(access, {
			action: "triggered",
			object_type: "ddns-config",
			object_id: row.id,
			meta,
		});
		return result;
	},
};

export default internalDdnsConfig;
