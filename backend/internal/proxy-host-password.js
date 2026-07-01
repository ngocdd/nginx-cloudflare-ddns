import fs from "node:fs";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { access as logger } from "../logger.js";
import proxyHostModel from "../models/proxy_host.js";
import ProxyHostPassword from "../models/proxy_host_password.js";
import internalNginx from "./nginx.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const omissions = () => {
	return ["htpasswd_line"];
};

// Domain regex mirrored from backend/schema/components/common.json#/properties/domain_names
const DOMAIN_REGEX = /^[^&| @!#%^();:/\\}{=+?<>,~`'"]+$/;

const getDirectory = (hostId) => {
	return `/data/proxy_host_passwords/${hostId}`;
};

const getPageDirectory = () => {
	return "/data/proxy_host_passwords/page";
};

const getHtpasswdPath = (hostId, domain) => {
	return path.join(getDirectory(hostId), `${domain}.htpasswd`);
};

const getPagePath = (hostId) => {
	return path.join(getPageDirectory(), `${hostId}.html`);
};

const isHostnameSafe = (domain) => {
	if (typeof domain !== "string" || !domain) {
		return false;
	}
	if (domain.length > 255) {
		return false;
	}
	return DOMAIN_REGEX.test(domain);
};

const maskItem = (item) => {
	if (!item) {
		return item;
	}
	const masked = _.omit(item, ["htpasswd_line"]);
	if (masked.username) {
		masked.hint = masked.username.charAt(0) + "****";
	} else {
		masked.hint = "****";
	}
	return masked;
};

const maskItems = (items) => {
	if (!Array.isArray(items)) {
		return items;
	}
	return items.map((it) => maskItem(it));
};

const internalProxyHostPassword = {
	/**
	 * @param   {Object}  item
	 * @param   {String}  item.domain
	 * @param   {String}  item.username
	 * @param   {String}  item.password
	 * @returns {Promise<String>}
	 */
	hashPassword: async (item) => {
		if (!item || typeof item.password !== "string" || !item.password) {
			throw new errs.ValidationError("Password is required");
		}
		const hashed = await utils.execFile("openssl", ["passwd", "-apr1", item.password]);
		return `${item.username || "admin"}:${hashed}`;
	},

	/**
	 * @param   {Access}  access
	 * @param   {Integer} hostId
	 * @returns {Promise<Object>}
	 */
	getHost: async (access, hostId) => {
		return proxyHostModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", hostId)
			.first();
	},

	/**
	 * @param   {Access}  access
	 * @param   {Integer} hostId
	 * @returns {Promise<Array>}
	 */
	getAll: async (access, hostId) => {
		await access.can("proxy_hosts:get", hostId);
		const rows = await ProxyHostPassword.query()
			.where("proxy_host_id", hostId)
			.orderBy("domain", "ASC");
		return maskItems(rows);
	},

	/**
	 * Bulk-sync password entries for a proxy host.
	 *
	 * Each entry may contain:
	 *   { domain, username?, password?, enabled? }
	 * - If `password` is empty AND row already exists, the existing htpasswd_line is kept.
	 * - If `enabled === false`, the row is kept but the htpasswd file for that domain is removed.
	 * - Entries whose domain is not in the host's domain_names are rejected.
	 * - Entries whose domain is missing or unsafe are rejected.
	 *
	 * After persisting, rebuild htpasswd files + HTML page, then reload Nginx.
	 *
	 * @param   {Access}  access
	 * @param   {Integer} hostId
	 * @param   {Array}   entries
	 * @returns {Promise<Array>}
	 */
	syncAll: async (access, hostId, entries) => {
		await access.can("proxy_hosts:update", hostId);

		if (!Array.isArray(entries)) {
			entries = [];
		}

		const host = await internalProxyHostPassword.getHost(access, hostId);
		if (!host) {
			throw new errs.ItemNotFoundError(hostId);
		}

		const allowedDomains = new Set(host.domain_names || []);

		// Validate every entry first; collect any errors.
		const errors = [];
		entries.forEach((entry, idx) => {
			if (!entry || typeof entry.domain !== "string" || !entry.domain) {
				errors.push(`passwords[${idx}].domain is required`);
				return;
			}
			if (!isHostnameSafe(entry.domain)) {
				errors.push(`passwords[${idx}].domain "${entry.domain}" contains invalid characters`);
				return;
			}
			if (!allowedDomains.has(entry.domain)) {
				errors.push(`passwords[${idx}].domain "${entry.domain}" is not in proxy_host.domain_names`);
			}
			if (entry.username && (typeof entry.username !== "string" || entry.username.length > 255)) {
				errors.push(`passwords[${idx}].username is invalid`);
			}
			if (
				typeof entry.password !== "undefined" &&
				entry.password !== null &&
				typeof entry.password !== "string"
			) {
				errors.push(`passwords[${idx}].password must be a string`);
			}
		});

		if (errors.length) {
			throw new errs.ValidationError(errors.join("; "));
		}

		// Load existing rows for this host (we'll diff against the new list)
		const existingRows = await ProxyHostPassword.query().where("proxy_host_id", hostId);
		const existingByDomain = new Map(existingRows.map((r) => [r.domain, r]));

		const submittedDomains = new Set();
		const toInsert = [];
		const toPatch = [];

		for (const entry of entries) {
			if (!entry || !entry.domain) continue;
			submittedDomains.add(entry.domain);

			const existing = existingByDomain.get(entry.domain);
			const wantsEnabled = entry.enabled === false ? 0 : 1;

			if (!existing) {
				// New row. A password is required.
				if (!entry.password) {
					throw new errs.ValidationError(
						`password for "${entry.domain}" is required when adding a new entry`,
					);
				}
				toInsert.push({
					domain: entry.domain,
					username: entry.username || "admin",
					password: entry.password,
					enabled: wantsEnabled,
				});
				continue;
			}

			// Existing row. Patch fields as needed.
			const patch = {};
			if (entry.username && entry.username !== existing.username) {
				patch.username = entry.username;
			}
			if (entry.password) {
				// password update → hash it
				patch.htpasswd_line = await internalProxyHostPassword.hashPassword({
					username: entry.username || existing.username,
					password: entry.password,
				});
			}
			if (typeof entry.enabled !== "undefined" && wantsEnabled !== existing.enabled) {
				patch.enabled = wantsEnabled;
			}
			if (Object.keys(patch).length > 0) {
				patch.modified_on = new Date();
				toPatch.push({ domain: entry.domain, patch });
			}
		}

		// Apply inserts
		if (toInsert.length) {
			const insertPromises = toInsert.map((row) =>
				internalProxyHostPassword.hashPassword(row).then((htpasswd_line) =>
					ProxyHostPassword.query().insert({
						proxy_host_id: hostId,
						domain: row.domain,
						username: row.username,
						htpasswd_line,
						enabled: row.enabled,
						meta: {},
					}),
				),
			);
			await Promise.all(insertPromises);
		}

		// Apply patches
		for (const { domain, patch } of toPatch) {
			await ProxyHostPassword.query().where({ proxy_host_id: hostId, domain }).patch(patch);
		}

		// Delete rows whose domains were removed from the submitted list.
		const toDelete = existingRows.filter((r) => !submittedDomains.has(r.domain));
		for (const row of toDelete) {
			await ProxyHostPassword.query().deleteById(row.id);
		}

		// Rebuild htpasswd files + HTML page
		await internalProxyHostPassword.buildHtpasswd(hostId);
		await internalProxyHostPassword.renderPasswordPage(hostId);

		// Reload Nginx only if the host is enabled (otherwise its config is not active)
		if (host.enabled) {
			try {
				await internalNginx.reload();
			} catch (err) {
				logger.warn(`Nginx reload failed after password sync for host ${hostId}: ${err.message}`);
			}
		}

		const updated = await ProxyHostPassword.query()
			.where("proxy_host_id", hostId)
			.orderBy("domain", "ASC");
		return maskItems(updated);
	},

	/**
	 * Write htpasswd files for all enabled rows of a host.
	 * Removes files for domains that no longer have an enabled row.
	 * If no enabled rows remain, removes the host directory entirely.
	 *
	 * @param   {Integer} hostId
	 * @returns {Promise<void>}
	 */
	buildHtpasswd: async (hostId) => {
		const dir = getDirectory(hostId);
		const rows = await ProxyHostPassword.query()
			.where("proxy_host_id", hostId)
			.andWhere("enabled", 1);

		try {
			fs.mkdirSync(dir, { recursive: true });
		} catch (err) {
			if (err.code !== "EEXIST") {
				throw err;
			}
		}

		const expected = new Set(rows.map((r) => r.domain));

		// Remove stale files
		try {
			const existing = fs.readdirSync(dir);
			for (const f of existing) {
				const m = f.match(/^(.+)\.htpasswd$/);
				if (m && !expected.has(m[1])) {
					try {
						fs.unlinkSync(path.join(dir, f));
					} catch (_err) {
						// ignore
					}
				}
			}
		} catch (_err) {
			// ignore - dir may not exist
		}

		// Write each row's htpasswd file
		for (const row of rows) {
			fs.writeFileSync(
				path.join(dir, `${row.domain}.htpasswd`),
				`${row.htpasswd_line}\n`,
				{ encoding: "utf8" },
			);
		}

		// If nothing left, remove the host directory (and the page file will be cleaned separately)
		if (rows.length === 0) {
			try {
				const remaining = fs.readdirSync(dir);
				if (remaining.length === 0) {
					fs.rmdirSync(dir);
				}
			} catch (_err) {
				// ignore
			}
		}
	},

	/**
	 * Render the static custom password page for a host.
	 * Reads the template, renders with the host id, writes to the page directory.
	 *
	 * @param   {Integer} hostId
	 * @returns {Promise<void>}
	 */
	renderPasswordPage: async (hostId) => {
		const rows = await ProxyHostPassword.query()
			.where("proxy_host_id", hostId)
			.andWhere("enabled", 1);

		// Only render if at least one enabled password row exists
		if (rows.length === 0) {
			try {
				fs.unlinkSync(getPagePath(hostId));
			} catch (_err) {
				// ignore - may not exist
			}
			return;
		}

		const renderEngine = utils.getRenderEngine();
		let template;
		try {
			template = fs.readFileSync(`${__dirname}/../templates/password_page.html.liquid`, {
				encoding: "utf8",
			});
		} catch (_err) {
			logger.warn("password_page.html.liquid template missing, skipping password page render");
			return;
		}

		const rendered = await renderEngine.parseAndRender(template, {
			id: hostId,
			title: "Protected Site",
			orig_path: "/",
			orig_query: "",
		});

		fs.mkdirSync(getPageDirectory(), { recursive: true });
		fs.writeFileSync(getPagePath(hostId), rendered, { encoding: "utf8" });
	},

	/**
	 * Remove all on-disk state AND DB rows for a proxy host
	 * (htpasswd files + custom HTML page + proxy_host_password rows).
	 *
	 * Called when the parent proxy_host is deleted. Note: the parent uses
	 * is_deleted=1 (soft delete) so the FK CASCADE does NOT fire automatically;
	 * we must delete the password rows explicitly here.
	 *
	 * @param   {Integer} hostId
	 * @returns {Promise<void>}
	 */
	deleteAll: async (hostId) => {
		// Delete DB rows
		try {
			await ProxyHostPassword.query().where("proxy_host_id", hostId).delete();
		} catch (_err) {
			// ignore - rows may not exist
		}

		// Remove on-disk state
		const dir = getDirectory(hostId);
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch (_err) {
			// ignore
		}
		try {
			fs.unlinkSync(getPagePath(hostId));
		} catch (_err) {
			// ignore
		}
	},

	// Helpers exported for tests / reuse
	getDirectory,
	getPageDirectory,
	getHtpasswdPath,
	getPagePath,
	maskItem,
	maskItems,
	isHostnameSafe,
};

export default internalProxyHostPassword;