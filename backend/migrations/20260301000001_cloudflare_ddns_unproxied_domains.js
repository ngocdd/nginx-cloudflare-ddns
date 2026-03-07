import { migrate as logger } from "../logger.js";

const migrateName = "cloudflare-ddns-unproxied-domains";

/**
 * Migrate - Add unproxied_domains column
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
			table.string("unproxied_domains").notNull().defaultTo("");
		})
		.then(() => {
			logger.info(`[${migrateName}] unproxied_domains column added to cloudflare_ddns`);
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
		table.dropColumn("unproxied_domains");
	});
};

export { up, down };
