import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = [
	"is_deleted",
	"enabled",
	"update_on_start",
	"delete_on_stop",
	"last_run_success",
	"last_trigger_success",
];

class CloudflareDdns extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();

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
		const converted = convertIntFieldsToBool(thisJson, boolFields);
		// Never expose the raw API token in API responses. The token is
		// writeOnly — clients must POST/PUT the value, GET returns empty
		// so the frontend can detect "no value present" and prompt the user.
		if ("cloudflare_api_token" in converted) {
			converted.cloudflare_api_token = "";
		}
		return converted;
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "CloudflareDdns";
	}

	static get tableName() {
		return "cloudflare_ddns";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "cloudflare_ddns.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
		};
	}
}

export default CloudflareDdns;
