import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import cloudflareDdnsModel from "../models/cloudflare_ddns.js";
import internalAuditLog from "./audit-log.js";
import internalDdnsProcess from "./ddns-process.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted"];
};

const internalCloudflareDdns = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		await access.can("admin:settings", data);

		// Defense in depth: strip server-managed fields that should never be settable from the client.
		// The schema also enforces additionalProperties:false but a leaked field is not worth a runtime
		// primary-key collision or a forged owner.
		for (const k of ["id", "created_on", "modified_on", "is_deleted", "owner_user_id"]) {
			if (k in data) delete data[k];
		}

		data.owner_user_id = access.token.getUserId(1);

		if (typeof data.meta === "undefined") {
			data.meta = {};
		}

		const row = await cloudflareDdnsModel.query().insertAndFetch(data).then(utils.omitRow(omissions()));

		// Start the process if enabled
		let startOk = true;
		if (row.enabled) {
			startOk = internalDdnsProcess.start(row);
		}

		if (!startOk) {
			// Roll back the insert so we don't leave a stranded DB row
			await cloudflareDdnsModel.query().where("id", row.id).patch({ is_deleted: 1 });
			throw new errs.ValidationError(
				"cloudflare-ddns binary failed to start. Check that it is installed and reachable.",
			);
		}

		await internalAuditLog.add(access, {
			action: "created",
			object_type: "cloudflare-ddns",
			object_id: row.id,
			meta: _.omit(data, ["cloudflare_api_token"]),
		});

		return row;
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		return access
			.can("admin:settings", data.id)
			.then(() => {
				return internalCloudflareDdns.get(access, { id: data.id });
			})
			.then(async (row) => {
				if (row.id !== data.id) {
					throw new errs.InternalValidationError(
						`Cloudflare DDNS config could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
					);
				}

				const saved_row = await cloudflareDdnsModel
					.query()
					.patchAndFetchById(row.id, data)
					.then(utils.omitRow(omissions()));

				// Restart the process with new config
				await internalDdnsProcess.stop(saved_row.id);
				let startOk = true;
				if (saved_row.enabled) {
					startOk = internalDdnsProcess.start(saved_row);
				}

				if (!startOk) {
					throw new errs.ValidationError(
						"Config saved, but cloudflare-ddns binary failed to start. Check that it is installed and reachable.",
					);
				}

				return internalAuditLog
					.add(access, {
						action: "updated",
						object_type: "cloudflare-ddns",
						object_id: row.id,
						meta: _.omit(data, ["cloudflare_api_token"]),
					})
					.then(() => {
						return saved_row;
					});
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: (access, data) => {
		const thisData = data || {};

		return access
			.can("admin:settings", thisData.id)
			.then((access_data) => {
				const query = cloudflareDdnsModel
					.query()
					.where("is_deleted", 0)
					.andWhere("id", thisData.id)
					.allowGraph("[owner]")
					.first();

				if (access_data.permission_visibility !== "all") {
					query.andWhere("owner_user_id", access.token.getUserId(1));
				}

				if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
					query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}

				// Attach process status. Even when there's no runtime entry yet,
				// expose a state so the UI can render "never started" rather than
				// leaving the column blank.
				const status = internalDdnsProcess.getStatus(row.id);
				row.process_status = status || { state: "never-started", running: false };

				if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
					return _.omit(row, thisData.omit);
				}
				return row;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("admin:settings", data.id);

		const row = await internalCloudflareDdns.get(access, { id: data.id });
		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		// Stop any running process and wait for it to exit
		await internalDdnsProcess.stop(row.id);

		await cloudflareDdnsModel
			.query()
			.where("id", row.id)
			.patch({
				is_deleted: 1,
			});

		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "cloudflare-ddns",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		return true;
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @returns {Promise}
	 */
	enable: async (access, data) => {
		await access.can("admin:settings", data.id);

		const row = await internalCloudflareDdns.get(access, { id: data.id });
		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (row.enabled) {
			throw new errs.ValidationError("Cloudflare DDNS config is already enabled");
		}

		await cloudflareDdnsModel
			.query()
			.where("id", row.id)
			.patch({ enabled: 1 });

		row.enabled = true;
		const startOk = internalDdnsProcess.start(row);
		if (!startOk) {
			throw new errs.ValidationError(
				"Config enabled, but cloudflare-ddns binary failed to start. Check that it is installed and reachable.",
			);
		}

		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "cloudflare-ddns",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		return true;
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @returns {Promise}
	 */
	disable: async (access, data) => {
		await access.can("admin:settings", data.id);

		const row = await internalCloudflareDdns.get(access, { id: data.id });
		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (!row.enabled) {
			throw new errs.ValidationError("Cloudflare DDNS config is already disabled");
		}

		// Stop the process and wait for it to exit
		await internalDdnsProcess.stop(row.id);

		await cloudflareDdnsModel
			.query()
			.where("id", row.id)
			.patch({ enabled: 0 });

		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "cloudflare-ddns",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		return true;
	},

	/**
	 * All DDNS configs
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, search_query) => {
		const access_data = await access.can("admin:settings");
		const query = cloudflareDdnsModel
			.query()
			.where("is_deleted", 0)
			.allowGraph("[owner]")
			.orderBy("name", "ASC");

		if (access_data.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		if (typeof search_query === "string" && search_query.length > 0) {
			query.where(function () {
				this.where("name", "like", `%${search_query}%`)
					.orWhere("domains", "like", `%${search_query}%`)
					.orWhere("ip4_domains", "like", `%${search_query}%`)
					.orWhere("ip6_domains", "like", `%${search_query}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const rows = await query.then(utils.omitRows(omissions()));
		// Attach process status to each row. Always include at least `state`
		// so the UI can render a "never started" placeholder consistently.
		return rows.map((row) => {
			const status = internalDdnsProcess.getStatus(row.id);
			row.process_status = status || { state: "never-started", running: false };
			return row;
		});
	},

	/**
	 * Start all enabled DDNS configs
	 * Called on server startup
	 *
	 * @returns {Promise<{started: number, failed: number}>}
	 */
	startAllEnabled: async () => {
		const rows = await cloudflareDdnsModel
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1);

		let started = 0;
		let failed = 0;
		for (const row of rows) {
			const ok = internalDdnsProcess.start(row);
			if (ok) started += 1;
			else failed += 1;
		}
		return { started, failed, total: rows.length };
	},

	/**
	 * Trigger a one-time DDNS update
	 *
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @returns {Promise}
	 */
	trigger: async (access, data) => {
		await access.can("admin:settings", data.id);

		const row = await internalCloudflareDdns.get(access, { id: data.id });
		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		const result = await internalDdnsProcess.trigger(row);

		// Track manual trigger time independently from the running scheduled process
		internalDdnsProcess.updateLastTrigger(row.id, result.success);

		// Add to audit log with detailed information
		const meta = {
			success: result.success,
			exitCode: result.exitCode,
			name: row.name || `#${row.id}`,
		};

		// Include output/error details for troubleshooting
		if (result.output) {
			meta.output = result.output.substring(0, 500); // Limit to 500 chars
		}
		if (result.error) {
			meta.error = result.error.substring(0, 500); // Limit to 500 chars
		}

		await internalAuditLog.add(access, {
			action: "triggered",
			object_type: "cloudflare-ddns",
			object_id: row.id,
			meta,
		});

		return result;
	},
};

export default internalCloudflareDdns;
