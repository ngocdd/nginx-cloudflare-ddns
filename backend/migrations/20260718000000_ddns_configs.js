import { migrate as logger } from "../logger.js";

const migrateName = "ddns-configs";

/**
 * Migrate - Create ddns_configs table (provider-agnostic DDNS).
 *
 * Replaces the legacy Cloudflare-only `cloudflare_ddns` table with a generic
 * one that supports any DNS provider via the qdm12/ddns-updater binary.
 *
 * Each row maps 1:1 to a single (provider, domain) pair. Provider-specific
 * credentials and options live in the `config_json` JSON column so adding a
 * new provider requires zero schema changes.
 *
 * Runtime state (last run, last trigger, last error) is persisted in the
 * row so the UI survives backend restarts.
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("ddns_configs", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("owner_user_id").notNull().unsigned();
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.integer("enabled").notNull().unsigned().defaultTo(1);
			table.string("name").notNull().defaultTo("");
			// Lower-case provider key as defined by qdm12/ddns-updater
			// (e.g. "cloudflare", "duckdns", "namecheap", "godaddy", ...).
			table.string("provider").notNull().defaultTo("");
			// Single FQDN — one row per (provider, domain) pair.
			table.string("domain").notNull().defaultTo("");
			// "ipv4" | "ipv6" — controls which record type is updated.
			table.string("ip_version").notNull().defaultTo("ipv4");
			// Cron expression in qdm12/ddns-updater syntax, e.g. "@every 5m".
			table.string("update_cron").notNull().defaultTo("@every 5m");
			// Provider-specific configuration: credentials, proxied, ttl,
			// detection_timeout, etc. Anything not common across providers
			// lives here so the schema doesn't need to grow when a new
			// provider is added.
			table.json("config_json").notNull();
			// Runtime state — updated by internal/ddns-manager.js after each
			// scheduled run and after each manual trigger.
			table.dateTime("last_run_at").nullable();
			table.integer("last_run_success").notNull().unsigned().defaultTo(0);
			table.dateTime("last_trigger_at").nullable();
			table.integer("last_trigger_success").notNull().unsigned().defaultTo(0);
			table.text("last_error").nullable();
			table.json("meta").notNull();
		})
		.then(() => {
			logger.info(`[${migrateName}] ddns_configs Table created`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
	return knex.schema.dropTableIfExists("ddns_configs");
};

export { up, down };
