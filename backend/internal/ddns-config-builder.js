/**
 * Pure functions to convert DB rows into the JSON config file format that
 * the qdm12/ddns-updater binary consumes.
 *
 * The qdm12 binary reads either an env-var CONFIG or a config.json file. We
 * write the latter because it's easier to debug from inside the container
 * (`docker exec ... cat /data/ddns/config.json`).
 *
 * Each entry in the top-level `settings` array is one (provider, domain)
 * pair. Provider-specific credentials and knobs (proxied, ttl, token,
 * password, key+secret, zone_identifier, etc.) live alongside the
 * `provider` field with the names that qdm12 expects.
 *
 * See https://github.com/qdm12/ddns-updater for the canonical schema.
 */

const DEFAULT_GLOBAL_CRON = "@every 5m";

/**
 * Build the full config.json object from the given enabled rows.
 *
 * @param {Array<Object>} rows - DB rows from ddns_configs (enabled=1, is_deleted=0).
 * @param {Object} [opts]
 * @param {string} [opts.globalCron] - Cron expression for the ddns-updater process.
 *                                       Defaults to DEFAULT_GLOBAL_CRON.
 * @returns {{settings: Array<Object>}}
 */
const buildConfigFile = (rows, opts = {}) => {
	const globalCron = opts.globalCron || process.env.DDNS_GLOBAL_CRON || DEFAULT_GLOBAL_CRON;
	const settings = rows.filter((row) => row?.provider && row.domain).map((row) => buildProviderSetting(row));

	return {
		settings,
		// We don't write a "cron" at the top level — qdm12/ddns-updater reads
		// the cron via the UPDATE_CRON env var. Callers should pass it
		// separately when spawning the binary.
		__cron: globalCron, // informational; the binary itself is started with
		// UPDATE_CRON=<this value> so we keep it round-trippable
	};
};

/**
 * Build a single settings entry for the ddns-updater config.
 *
 * @param {Object} row - DB row from ddns_configs.
 * @returns {Object}
 */
const buildProviderSetting = (row) => {
	const cfg = row.config_json && typeof row.config_json === "object" ? row.config_json : {};
	const base = {
		provider: row.provider,
		domain: row.domain,
		ip_version: row.ip_version === "ipv6" ? "ipv6" : "ipv4",
	};

	// Provider-specific fields. The names mirror qdm12/ddns-updater's JSON
	// schema (see internal/provider/providers/<name>/provider.go).
	switch (row.provider) {
		case "cloudflare":
			return {
				...base,
				token: cfg.api_token || cfg.token || "",
				zone_identifier: cfg.zone_identifier || "",
				proxied: cfg.proxied === true || cfg.proxied === "true",
				ttl: Number.isFinite(Number(cfg.ttl)) ? Number(cfg.ttl) : 1,
			};
		case "duckdns":
			return { ...base, token: cfg.token || "" };
		case "namecheap":
		case "noip":
		case "dynu":
		case "selfhostde":
			return { ...base, password: cfg.password || "" };
		case "godaddy":
		case "dreamhost":
		case "gandi":
			return { ...base, key: cfg.key || "", secret: cfg.secret || "" };
		case "hetzner":
			return { ...base, token: cfg.token || "" };
		case "hetznercloud":
			return { ...base, api_token: cfg.api_token || cfg.token || "" };
		case "route53":
			return {
				...base,
				access_key_id: cfg.access_key_id || "",
				secret_access_key: cfg.secret_access_key || "",
				zone_identifier: cfg.zone_identifier || "",
			};
		case "gcp":
			return {
				...base,
				credentials_json: cfg.credentials_json || "",
				project: cfg.project || "",
				zone_identifier: cfg.zone_identifier || "",
			};
		default:
			// Unknown provider: pass through every config field verbatim so
			// the operator can supply whatever the binary expects. This lets
			// the integration work with all 50+ providers without us having
			// to enumerate them here.
			return { ...base, ...cfg };
	}
};

/**
 * Compute the set of required credential keys for a given provider, given
 * the config_json payload the user provided. Handles the special case of
 * Cloudflare (where multiple auth modes are valid).
 *
 * @param {string} provider
 * @param {Object} cfg - config_json content (may be {})
 * @returns {Array<string>} keys that are required and missing/empty.
 */
const missingRequiredFields = (provider, cfg = {}) => {
	const has = (k) => {
		const v = cfg[k];
		return v !== undefined && v !== null && (typeof v !== "string" || v.trim() !== "");
	};
	switch (provider) {
		case "cloudflare":
			// token | (key + email) | user_service_key
			if (has("api_token") || has("token")) return [];
			if (has("key") && has("email")) return [];
			if (has("user_service_key")) return [];
			return ["api_token (or key+email, or user_service_key)"];
		case "duckdns":
			return has("token") ? [] : ["token"];
		case "namecheap":
		case "noip":
		case "dynu":
		case "selfhostde":
			return has("password") ? [] : ["password"];
		case "godaddy":
		case "dreamhost":
		case "gandi": {
			const missing = [];
			if (!has("key")) missing.push("key");
			if (!has("secret")) missing.push("secret");
			return missing;
		}
		case "hetzner":
		case "hetznercloud":
			return has("api_token") || has("token") ? [] : ["api_token"];
		case "route53": {
			const missing = [];
			if (!has("access_key_id")) missing.push("access_key_id");
			if (!has("secret_access_key")) missing.push("secret_access_key");
			if (!has("zone_identifier")) missing.push("zone_identifier");
			return missing;
		}
		default:
			// Unknown provider — pass-through. The ddns-updater binary will
			// raise a clear runtime error if a required field is missing.
			return [];
	}
};

/**
 * Validate that a config_json payload has the credentials required by the
 * given provider. Throws an Error with `.status = 400` and `.missingFields`
 * if any required field is missing.
 *
 * @param {string} provider
 * @param {Object} cfg - config_json content (may be {})
 * @throws {Error}
 */
const validateProviderFields = (provider, cfg = {}) => {
	const missing = missingRequiredFields(provider, cfg);
	if (missing.length > 0) {
		const err = new Error(`Provider '${provider}' is missing required field(s): ${missing.join(", ")}`);
		err.status = 400;
		err.missingFields = missing;
		throw err;
	}
};

/**
 * Build the shell command-line args for the ddns-updater binary given the
 * resolved config file path and listening port.
 *
 * @param {Object} opts
 * @param {string} opts.configPath - absolute path to the config.json file.
 * @param {string|number} [opts.port] - HTTP server port (default 8000).
 * @param {string} [opts.period] - fallback update period (default @every 5m).
 * @returns {{args: Array<string>, env: Object}}
 */
const buildSpawnSpec = ({ configPath, port = 8000, period } = {}) => {
	const args = ["--config", configPath, "--listen-address", `:${port}`];
	const env = {
		// Tell the binary the global cron. The binary reads UPDATE_CRON from
		// the environment; the config.json file itself does not carry cron.
		UPDATE_CRON: period || process.env.DDNS_GLOBAL_CRON || DEFAULT_GLOBAL_CRON,
		HOME: process.env.HOME || "/tmp",
		// INFO by default — the backend pipes stdout into the logger and
		// operators can run `make run-logs` to see live output.
		LOG_LEVEL: process.env.DDNS_LOG_LEVEL || "info",
	};
	return { args, env };
};

export default {
	buildConfigFile,
	buildProviderSetting,
	missingRequiredFields,
	validateProviderFields,
	buildSpawnSpec,
	DEFAULT_GLOBAL_CRON,
};
