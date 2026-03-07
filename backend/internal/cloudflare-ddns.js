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
	create: (access, data) => {
		return access
			.can("admin:settings", data)
			.then(() => {
				data.owner_user_id = access.token.getUserId(1);

				if (typeof data.meta === "undefined") {
					data.meta = {};
				}

				return cloudflareDdnsModel.query().insertAndFetch(data).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				// Start the process if enabled
				if (row.enabled) {
					internalDdnsProcess.start(row);
				}

				return row;
			})
			.then((row) => {
				// Add to audit log
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "cloudflare-ddns",
						object_id: row.id,
						meta: _.omit(data, ["cloudflare_api_token"]),
					})
					.then(() => {
						return row;
					});
			});
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
			.then((row) => {
				if (row.id !== data.id) {
					throw new errs.InternalValidationError(
						`Cloudflare DDNS config could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
					);
				}

				return cloudflareDdnsModel
					.query()
					.patchAndFetchById(row.id, data)
					.then(utils.omitRow(omissions()))
					.then((saved_row) => {
						// Restart the process with new config
						internalDdnsProcess.stop(saved_row.id);
						if (saved_row.enabled) {
							internalDdnsProcess.start(saved_row);
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

				// Attach process status
				const status = internalDdnsProcess.getStatus(row.id);
				row.process_status = status || { running: false };

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
	delete: (access, data) => {
		return access
			.can("admin:settings", data.id)
			.then(() => {
				return internalCloudflareDdns.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				// Stop any running process
				internalDdnsProcess.stop(row.id);

				return cloudflareDdnsModel
					.query()
					.where("id", row.id)
					.patch({
						is_deleted: 1,
					})
					.then(() => {
						return internalAuditLog.add(access, {
							action: "deleted",
							object_type: "cloudflare-ddns",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @returns {Promise}
	 */
	enable: (access, data) => {
		return access
			.can("admin:settings", data.id)
			.then(() => {
				return internalCloudflareDdns.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (row.enabled) {
					throw new errs.ValidationError("Cloudflare DDNS config is already enabled");
				}

				return cloudflareDdnsModel
					.query()
					.where("id", row.id)
					.patch({ enabled: 1 })
					.then(() => {
						// Start the process
						row.enabled = true;
						internalDdnsProcess.start(row);

						return internalAuditLog.add(access, {
							action: "enabled",
							object_type: "cloudflare-ddns",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @returns {Promise}
	 */
	disable: (access, data) => {
		return access
			.can("admin:settings", data.id)
			.then(() => {
				return internalCloudflareDdns.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (!row.enabled) {
					throw new errs.ValidationError("Cloudflare DDNS config is already disabled");
				}

				// Stop the process
				internalDdnsProcess.stop(row.id);

				return cloudflareDdnsModel
					.query()
					.where("id", row.id)
					.patch({ enabled: 0 })
					.then(() => {
						return internalAuditLog.add(access, {
							action: "disabled",
							object_type: "cloudflare-ddns",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * All DDNS configs
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, expand, search_query) => {
		return access
			.can("admin:settings")
			.then((access_data) => {
				const query = cloudflareDdnsModel
					.query()
					.where("is_deleted", 0)
					.groupBy("id")
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

				return query.then(utils.omitRows(omissions()));
			})
			.then((rows) => {
				// Attach process status to each row
				return rows.map((row) => {
					const status = internalDdnsProcess.getStatus(row.id);
					row.process_status = status || { running: false };
					return row;
				});
			});
	},

	/**
	 * Start all enabled DDNS configs
	 * Called on server startup
	 *
	 * @returns {Promise}
	 */
	startAllEnabled: () => {
		return cloudflareDdnsModel
			.query()
			.where("is_deleted", 0)
			.andWhere("enabled", 1)
			.then((rows) => {
				for (const row of rows) {
					internalDdnsProcess.start(row);
				}
			});
	},

	/**
	 * Trigger a one-time DDNS update
	 *
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @returns {Promise}
	 */
	trigger: (access, data) => {
		return access
			.can("admin:settings", data.id)
			.then(() => {
				return internalCloudflareDdns.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				return internalDdnsProcess.trigger(row).then((result) => {
					// Update the lastRun status of the running process
					internalDdnsProcess.updateLastRun(row.id, result.success);

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

					return internalAuditLog
						.add(access, {
							action: "triggered",
							object_type: "cloudflare-ddns",
							object_id: row.id,
							meta,
						})
						.then(() => result);
				});
			});
	},
};

export default internalCloudflareDdns;
