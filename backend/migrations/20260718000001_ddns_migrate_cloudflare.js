import { migrate as logger } from "../logger.js";

const migrateName = "ddns-migrate-cloudflare";

/**
 * Migrate - Copy rows from the legacy `cloudflare_ddns` table into the new
 * `ddns_configs` table so existing user configurations are preserved.
 *
 * One legacy row can hold multiple comma-separated domains across several
 * columns (`domains`, `unproxied_domains`, `ip4_domains`, `ip6_domains`).
 * The new schema is 1:1 (provider, domain), so this migration splits the
 * legacy row into N new rows — one per unique domain across all four columns.
 *
 * Provider-specific fields (api_token, proxied, ttl, ...) are folded into
 * `config_json` keyed by the qdm12/ddns-updater field names so the new
 * backend can reconstruct the same on-the-wire config.
 *
 * The legacy table is NOT dropped in this migration — see the next one for
 * the drop. Keeping the old table around for one release gives operators
 * a fallback in case the conversion goes sideways.
 *
 * Idempotent: if `ddns_configs` already has rows, this migration skips.
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	const hasCloudflareDdns = await knex.schema.hasTable("cloudflare_ddns");
	if (!hasCloudflareDdns) {
		logger.info(`[${migrateName}] cloudflare_ddns table not present, nothing to migrate`);
		return;
	}

	const existing = await knex("ddns_configs").count({ c: "*" }).first();
	if (existing && Number(existing.c) > 0) {
		logger.info(`[${migrateName}] ddns_configs already has ${existing.c} row(s), skipping migration`);
		return;
	}

	const rows = await knex("cloudflare_ddns").where("is_deleted", 0);
	logger.info(`[${migrateName}] Found ${rows.length} legacy cloudflare_ddns row(s)`);

	const splitDomains = (csv) =>
		(csv || "")
			.split(",")
			.map((d) => d.trim())
			.filter(Boolean);

	const now = new Date().toISOString();
	let inserted = 0;

	for (const row of rows) {
		const proxiedDomains = new Set(splitDomains(row.domains));
		const unproxiedDomains = new Set(splitDomains(row.unproxied_domains));
		const ip4Domains = new Set(splitDomains(row.ip4_domains));
		const ip6Domains = new Set(splitDomains(row.ip6_domains));

		const allDomains = new Set([...proxiedDomains, ...unproxiedDomains, ...ip4Domains, ...ip6Domains]);

		// Build the provider-specific config block (Cloudflare keys).
		const configJson = {
			api_token: row.cloudflare_api_token,
			proxied: false,
			ttl: row.ttl || 1,
			record_comment: row.record_comment || "",
			detection_timeout: row.detection_timeout || "5s",
			update_timeout: row.update_timeout || "30s",
			cache_expiration: row.cache_expiration || "6h0m0s",
			update_on_start: !!row.update_on_start,
			delete_on_stop: !!row.delete_on_stop,
			ip4_provider: row.ip4_provider || "cloudflare.trace",
			ip6_provider: row.ip6_provider || "cloudflare.trace",
		};

		for (const domain of allDomains) {
			// Determine ip_version: prefer ip6 if the domain only appears in
			// ip6_domains, otherwise ipv4 (matches the old behavior where
			// ip6_domains took precedence over ip4_domains).
			let ipVersion = "ipv4";
			if (ip6Domains.has(domain) && !ip4Domains.has(domain)) {
				ipVersion = "ipv6";
			}

			// Proxied only applies to Cloudflare A/AAAA records; for our
			// migration we fold it into config_json so the same config can
			// drive multiple domains with different proxy states.
			configJson.proxied = proxiedDomains.has(domain);

			await knex("ddns_configs").insert({
				created_on: row.created_on || now,
				modified_on: row.modified_on || now,
				owner_user_id: row.owner_user_id,
				is_deleted: 0,
				enabled: row.enabled,
				name: row.name,
				provider: "cloudflare",
				domain,
				ip_version: ipVersion,
				update_cron: row.update_cron || "@every 5m",
				config_json: JSON.stringify(configJson),
				last_run_at: row.last_run_at || null,
				last_run_success: row.last_run_success || 0,
				last_trigger_at: row.last_trigger_at || null,
				last_trigger_success: row.last_trigger_success || 0,
				last_error: row.last_error || null,
				meta: JSON.stringify(row.meta || {}),
			});
			inserted += 1;
		}
	}

	logger.info(`[${migrateName}] Inserted ${inserted} ddns_configs row(s)`);
};

/**
 * Undo Migrate - This migration is data-only; rolling it back means removing
 * the rows we inserted (we cannot reconstruct which rows were original).
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (knex) => {
	const hasTable = await knex.schema.hasTable("ddns_configs");
	if (!hasTable) return;
	// Only delete rows we created (provider='cloudflare' and not deleted).
	// This is best-effort — operators who hand-created cloudflare rows in
	// the new table will lose them on rollback.
	const deleted = await knex("ddns_configs").where("provider", "cloudflare").where("is_deleted", 0).delete();
	logger.info(`[${migrateName}] Rolled back ${deleted} migrated row(s)`);
};

export { up, down };
