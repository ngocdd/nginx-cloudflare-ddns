import { migrate as logger } from "../logger.js";

const migrateName = "proxy-host-passwords";

/**
 * Migrate - Create proxy_host_password table for per-domain password protection
 *
 * Each row protects one domain of a proxy host with its own htpasswd line.
 * The htpasswd_line is the raw "user:$apr1$..." string written verbatim into
 * /data/proxy_host_passwords/<proxy_host_id>/<domain>.htpasswd and consumed
 * by Nginx via auth_basic_user_file.
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("proxy_host_password", (table) => {
			table.increments("id").primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table
				.integer("proxy_host_id")
				.notNull()
				.unsigned()
				.references("id")
				.inTable("proxy_host")
				.onDelete("CASCADE");
			table.string("domain").notNull();
			table.string("username").notNull().defaultTo("admin");
			// htpasswd file line, e.g. "admin:$apr1$XYZ$abcdef..."
			table.text("htpasswd_line").notNull();
			table.integer("enabled").notNull().unsigned().defaultTo(1);
			table.json("meta").notNull();
			// One password per (proxy_host_id, domain)
			table.unique(["proxy_host_id", "domain"]);
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host_password Table created`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTableIfExists("proxy_host_password");
};

export { up, down };