import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted", "enabled", "last_run_success", "last_trigger_success"];

/**
 * Objection model for the `ddns_configs` table.
 *
 * Mirror of `cloudflare_ddns.js` for the new provider-agnostic schema.
 *
 * Credentials live in `config_json` which is treated as **write-only**:
 * GET responses redact the field so users must explicitly opt in to
 * replacing it. The frontend uses the empty-string sentinel to detect
 * "no value present" and prompt the user.
 */
class DdnsConfig extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();

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
		// Redact provider-specific credentials on the way out.
		if ("config_json" in converted && converted.config_json && typeof converted.config_json === "object") {
			// We do NOT strip the whole object — the frontend needs to see
			// non-sensitive fields (proxied, ttl, etc.) to render the form.
			// Sensitive keys are redacted explicitly here.
			const sensitiveKeys = ["api_token", "token", "password", "key", "secret", "access_token", "credentials"];
			const redacted = { ...converted.config_json };
			for (const k of sensitiveKeys) {
				if (k in redacted) {
					redacted[k] = "";
				}
			}
			converted.config_json = redacted;
		}
		return converted;
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "DdnsConfig";
	}

	static get tableName() {
		return "ddns_configs";
	}

	static get jsonAttributes() {
		return ["meta", "config_json"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "ddns_configs.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
		};
	}
}

export default DdnsConfig;
