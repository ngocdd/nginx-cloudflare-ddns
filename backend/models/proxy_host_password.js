// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import ProxyHost from "./proxy_host.js";

Model.knex(db());

const boolFields = ["enabled"];

class ProxyHostPassword extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();

		// Default for username
		if (typeof this.username === "undefined" || !this.username) {
			this.username = "admin";
		}

		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "ProxyHostPassword";
	}

	static get tableName() {
		return "proxy_host_password";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			proxy_host: {
				relation: Model.HasOneRelation,
				modelClass: ProxyHost,
				join: {
					from: "proxy_host_password.proxy_host_id",
					to: "proxy_host.id",
				},
				modify: (qb) => {
					qb.where("proxy_host.is_deleted", 0);
				},
			},
		};
	}
}

export default ProxyHostPassword;