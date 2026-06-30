import { describe, expect, it } from "vitest";
import internalDdnsEnv from "../internal/ddns-env.js";

describe("internalDdnsEnv.buildProxiedExpression", () => {
	it("returns 'false' for empty/null input", () => {
		expect(internalDdnsEnv.buildProxiedExpression("")).toBe("false");
		expect(internalDdnsEnv.buildProxiedExpression("   ")).toBe("false");
		expect(internalDdnsEnv.buildProxiedExpression(null)).toBe("false");
		expect(internalDdnsEnv.buildProxiedExpression(undefined)).toBe("false");
	});

	it("returns 'false' for comma-only input", () => {
		expect(internalDdnsEnv.buildProxiedExpression(",,,,")).toBe("false");
	});

	it("returns is(x) for a single domain", () => {
		expect(internalDdnsEnv.buildProxiedExpression("example.com")).toBe(
			"is(example.com)",
		);
	});

	it("joins multiple domains with ||", () => {
		expect(
			internalDdnsEnv.buildProxiedExpression("a.example.com, b.example.com, c.example.com"),
		).toBe("is(a.example.com) || is(b.example.com) || is(c.example.com)");
	});

	it("trims whitespace around each domain", () => {
		expect(internalDdnsEnv.buildProxiedExpression("  a.com  ,  b.com  ")).toBe(
			"is(a.com) || is(b.com)",
		);
	});

	it("skips empty segments between commas", () => {
		expect(internalDdnsEnv.buildProxiedExpression("a.com,,b.com,")).toBe(
			"is(a.com) || is(b.com)",
		);
	});
});

describe("internalDdnsEnv.buildEnv", () => {
	const baseRow = {
		cloudflare_api_token: "secret-token",
		domains: "proxied.example.com",
		unproxied_domains: "direct.example.com",
		ip4_domains: "ipv4.example.com",
		ip6_domains: "ipv6.example.com",
		ip4_provider: "cloudflare.trace",
		ip6_provider: "cloudflare.doh",
		update_cron: "@every 5m",
		update_on_start: true,
		delete_on_stop: false,
		ttl: 60,
		record_comment: "managed by npm",
		detection_timeout: "5s",
		update_timeout: "30s",
		cache_expiration: "6h0m0s",
	};

	it("includes every required variable", () => {
		const env = internalDdnsEnv.buildEnv(baseRow);
		expect(env.CLOUDFLARE_API_TOKEN).toBe("secret-token");
		expect(env.IP4_PROVIDER).toBe("cloudflare.trace");
		expect(env.IP6_PROVIDER).toBe("cloudflare.doh");
		expect(env.UPDATE_CRON).toBe("@every 5m");
		expect(env.UPDATE_ON_START).toBe("true");
		expect(env.DELETE_ON_STOP).toBe("false");
		expect(env.PROXIED).toBe("is(proxied.example.com)");
		expect(env.TTL).toBe("60");
		expect(env.RECORD_COMMENT).toBe("managed by npm");
		expect(env.DETECTION_TIMEOUT).toBe("5s");
		expect(env.UPDATE_TIMEOUT).toBe("30s");
		expect(env.CACHE_EXPIRATION).toBe("6h0m0s");
	});

	it("combines proxied + unproxied domains into DOMAINS", () => {
		const env = internalDdnsEnv.buildEnv(baseRow);
		expect(env.DOMAINS).toBe("proxied.example.com,direct.example.com");
		expect(env.IP4_DOMAINS).toBe("ipv4.example.com");
		expect(env.IP6_DOMAINS).toBe("ipv6.example.com");
	});

	it("uses 'none' for IP6_PROVIDER when ip6_domains is empty", () => {
		const env = internalDdnsEnv.buildEnv({
			...baseRow,
			ip6_domains: "",
		});
		expect(env.IP6_PROVIDER).toBe("none");
	});

	it("does not emit IP6_DOMAINS when ip6_domains is empty", () => {
		const env = internalDdnsEnv.buildEnv({ ...baseRow, ip6_domains: "" });
		expect("IP6_DOMAINS" in env).toBe(false);
	});

	it("falls back to defaults when fields are missing", () => {
		const env = internalDdnsEnv.buildEnv({
			cloudflare_api_token: "t",
			domains: "only.example.com",
		});
		expect(env.IP4_PROVIDER).toBe("cloudflare.trace");
		expect(env.IP6_PROVIDER).toBe("none");
		expect(env.UPDATE_CRON).toBe("@every 5m");
		expect(env.UPDATE_ON_START).toBe("false");
		expect(env.DELETE_ON_STOP).toBe("false");
		expect(env.TTL).toBe("1");
	});

	it("uses supplied ip6_provider when set", () => {
		const env = internalDdnsEnv.buildEnv({
			...baseRow,
			ip6_provider: "local",
		});
		expect(env.IP6_PROVIDER).toBe("local");
	});

	it("does not emit DOMAINS when both proxied and unproxied are empty", () => {
		const env = internalDdnsEnv.buildEnv({
			cloudflare_api_token: "t",
			domains: "",
			unproxied_domains: "",
		});
		expect("DOMAINS" in env).toBe(false);
		expect(env.PROXIED).toBe("false");
	});
});
