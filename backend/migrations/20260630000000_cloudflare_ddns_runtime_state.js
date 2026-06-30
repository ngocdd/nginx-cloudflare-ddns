import { migrate as logger } from "../logger.js";

const migrateName = "cloudflare-ddns-runtime-state";

/**
 * Migrate - Persist runtime state of each DDNS config to the row.
 *
 * Previously these lived only in process memory (`lastRunData` Map),
 * which meant the UI showed "never run" after every restart until the
 * next cron tick. Adding them to the row makes status survive restarts
 * and lets us audit runtime history.
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.alterTable("cloudflare_ddns", (table) => {
			table.dateTime("last_run_at").nullable();
			table.integer("last_run_success").notNull().unsigned().defaultTo(0);
			table.dateTime("last_trigger_at").nullable();
			table.integer("last_trigger_success").notNull().unsigned().defaultTo(0);
			table.text("last_error").nullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] runtime state columns added to cloudflare_ddns`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
	return knex.schema.alterTable("cloudflare_ddns", (table) => {
		table.dropColumn("last_run_at");
		table.dropColumn("last_run_success");
		table.dropColumn("last_trigger_at");
		table.dropColumn("last_trigger_success");
		table.dropColumn("last_error");
	});
};

export { up, down };