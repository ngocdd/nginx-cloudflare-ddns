/**
 * Build environment variables and PROXIED expressions for a cloudflare-ddns
 * child process. Pure functions, no I/O — easy to unit test.
 */

const internalDdnsEnv = {
	/**
	 * Build a PROXIED expression for domain-dependent proxy settings.
	 * Uses cloudflare-ddns template syntax: is(domain1) || is(domain2)
	 *
	 * @param {string} proxiedDomains - comma-separated proxied domains
	 * @returns {string} PROXIED expression or "false" if no proxied domains
	 */
	buildProxiedExpression: (proxiedDomains) => {
		if (!proxiedDomains || proxiedDomains.trim() === "") {
			return "false";
		}

		const domains = proxiedDomains
			.split(",")
			.map((d) => d.trim())
			.filter(Boolean);
		if (domains.length === 0) {
			return "false";
		}

		// Build expression like: is(domain1) || is(domain2) || is(domain3)
		return domains.map((d) => `is(${d})`).join(" || ");
	},

	/**
	 * Build environment variables from a DDNS config row.
	 *
	 * @param {Object} row - cloudflare_ddns database row
	 * @returns {Object} environment variables for the ddns process
	 */
	buildEnv: (row) => {
		// Combine proxied and unproxied domains into a single DOMAINS list
		const allDomains = [row.domains, row.unproxied_domains]
			.filter(Boolean)
			.map((d) => d.trim())
			.filter(Boolean)
			.join(",");

		// Build PROXIED expression based on which domains should be proxied
		const proxiedExpression = internalDdnsEnv.buildProxiedExpression(row.domains);

		// Skip IPv6 if ip6_domains is empty - use 'none' provider to disable
		const ip6Provider =
			row.ip6_domains && row.ip6_domains.trim() !== ""
				? row.ip6_provider || "cloudflare.trace"
				: "none";

		const env = {
			CLOUDFLARE_API_TOKEN: row.cloudflare_api_token,
			IP4_PROVIDER: row.ip4_provider || "cloudflare.trace",
			IP6_PROVIDER: ip6Provider,
			UPDATE_CRON: row.update_cron || "@every 5m",
			UPDATE_ON_START: row.update_on_start ? "true" : "false",
			DELETE_ON_STOP: row.delete_on_stop ? "true" : "false",
			PROXIED: proxiedExpression,
			TTL: String(row.ttl || 1),
			RECORD_COMMENT: row.record_comment || "",
			DETECTION_TIMEOUT: row.detection_timeout || "5s",
			UPDATE_TIMEOUT: row.update_timeout || "30s",
			CACHE_EXPIRATION: row.cache_expiration || "6h0m0s",
			EMOJI: "false",
			QUIET: "false",
		};

		if (allDomains) {
			env.DOMAINS = allDomains;
		}
		if (row.ip4_domains) {
			env.IP4_DOMAINS = row.ip4_domains;
		}
		if (row.ip6_domains) {
			env.IP6_DOMAINS = row.ip6_domains;
		}

		return env;
	},
};

export default internalDdnsEnv;