import { migrate as logger } from "../logger.js";

const migrateName = "ddns-drop-cloudflare-legacy";

/**
 * Migrate - Drop the legacy `cloudflare_ddns` table once data has been
 * ported into `ddns_configs` and a release has shipped with the new
 * provider-agnostic backend.
 *
 * Skips silently if the table doesn't exist (e.g. fresh install on a
 * database that never had the legacy schema), so this migration is safe to
 * ship even on databases that pre-date the cloudflare-ddns feature.
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	const hasTable = await knex.schema.hasTable("cloudflare_ddns");
	if (!hasTable) {
		logger.info(`[${migrateName}] cloudflare_ddns table not present, nothing to drop`);
		return;
	}
	logger.info(`[${migrateName}] Dropping cloudflare_ddns table...`);
	await knex.schema.dropTable("cloudflare_ddns");
	logger.info(`[${migrateName}] cloudflare_ddns table dropped`);
};

/**
 * Undo Migrate - Recreate an empty `cloudflare_ddns` table so any code
 * still importing the legacy model does not crash on the next request.
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
	return knex.schema.createTable("cloudflare_ddns", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNull();
		table.dateTime("modified_on").notNull();
		table.integer("owner_user_id").notNull().unsigned();
		table.integer("is_deleted").notNull().unsigned().defaultTo(0);
		table.integer("enabled").notNull().unsigned().defaultTo(1);
		table.string("name").notNull().defaultTo("");
		table.string("cloudflare_api_token").notNull();
		table.string("domains").notNull().defaultTo("");
		table.string("ip4_domains").notNull().defaultTo("");
		table.string("ip6_domains").notNull().defaultTo("");
		table.string("ip4_provider").notNull().defaultTo("cloudflare.trace");
		table.string("ip6_provider").notNull().defaultTo("cloudflare.trace");
		table.string("update_cron").notNull().defaultTo("@every 5m");
		table.integer("update_on_start").notNull().unsigned().defaultTo(1);
		table.integer("delete_on_stop").notNull().unsigned().defaultTo(0);
		table.string("proxied").notNull().defaultTo("false");
		table.integer("ttl").notNull().unsigned().defaultTo(1);
		table.string("record_comment").notNull().defaultTo("");
		table.string("detection_timeout").notNull().defaultTo("5s");
		table.string("update_timeout").notNull().defaultTo("30s");
		table.string("cache_expiration").notNull().defaultTo("6h0m0s");
		table.json("meta").notNull();
	});
};

export { up, down };
