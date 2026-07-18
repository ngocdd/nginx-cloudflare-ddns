/**
 * Static catalog of DNS providers supported by qdm12/ddns-updater, plus
 * the per-provider field schema used by DdnsConfigModal to render a
 * dynamic form.
 *
 * The list mirrors the directories under
 * https://github.com/qdm12/ddns-updater/tree/master/internal/provider/providers
 * Adding a new provider here is a frontend-only change — the backend
 * (ddns-config-builder.js) passes the config through verbatim for unknown
 * providers.
 *
 * This module is deliberately not fetched at runtime to keep the form
 * rendering snappy; providers are added by editing this file.
 */

export type DdnsProviderFieldType = "text" | "password" | "boolean" | "number";

export interface DdnsProviderField {
	key: string;
	label: string;
	type: DdnsProviderFieldType;
	required: boolean;
	hint?: string;
	placeholder?: string;
	min?: number;
	max?: number;
}

export interface DdnsProvider {
	value: string;
	label: string;
	fields: DdnsProviderField[];
}

export const DDNS_PROVIDERS: DdnsProvider[] = [
	{
		value: "cloudflare",
		label: "Cloudflare",
		fields: [
			{
				key: "api_token",
				label: "API Token",
				type: "password",
				required: true,
				hint: "Token with Zone:DNS:Edit permissions. Write-only.",
			},
			{
				key: "zone_identifier",
				label: "Zone ID",
				type: "text",
				required: true,
				hint: "Cloudflare zone ID for the domain (findable in the dashboard).",
			},
			{
				key: "proxied",
				label: "Proxied (orange cloud)",
				type: "boolean",
				required: false,
				hint: "Routes traffic through Cloudflare. Ignored by other providers.",
			},
			{
				key: "ttl",
				label: "TTL (seconds)",
				type: "number",
				required: false,
				min: 1,
				max: 86400,
				hint: "1 = automatic. Use larger values for low-traffic domains.",
			},
		],
	},
	{
		value: "duckdns",
		label: "DuckDNS",
		fields: [{ key: "token", label: "Token", type: "password", required: true }],
	},
	{
		value: "namecheap",
		label: "Namecheap",
		fields: [{ key: "password", label: "Dynamic DNS Password", type: "password", required: true }],
	},
	{
		value: "noip",
		label: "No-IP",
		fields: [{ key: "password", label: "Password", type: "password", required: true }],
	},
	{
		value: "dynu",
		label: "Dynu",
		fields: [{ key: "password", label: "Password", type: "password", required: true }],
	},
	{
		value: "selfhostde",
		label: "Selfhost.de",
		fields: [{ key: "password", label: "Password", type: "password", required: true }],
	},
	{
		value: "godaddy",
		label: "GoDaddy",
		fields: [
			{ key: "key", label: "Key", type: "password", required: true },
			{ key: "secret", label: "Secret", type: "password", required: true },
		],
	},
	{
		value: "dreamhost",
		label: "Dreamhost",
		fields: [{ key: "key", label: "API Key", type: "password", required: true }],
	},
	{
		value: "gandi",
		label: "Gandi",
		fields: [{ key: "key", label: "API Key", type: "password", required: true }],
	},
	{
		value: "hetzner",
		label: "Hetzner (legacy DNS)",
		fields: [{ key: "token", label: "API Token", type: "password", required: true }],
	},
	{
		value: "hetznercloud",
		label: "Hetzner Cloud",
		fields: [{ key: "api_token", label: "API Token", type: "password", required: true }],
	},
	{
		value: "route53",
		label: "AWS Route 53",
		fields: [
			{ key: "access_key_id", label: "Access Key ID", type: "text", required: true },
			{ key: "secret_access_key", label: "Secret Access Key", type: "password", required: true },
			{ key: "zone_identifier", label: "Hosted Zone ID", type: "text", required: true },
		],
	},
	{
		value: "gcp",
		label: "Google Cloud DNS",
		fields: [
			{ key: "project", label: "GCP Project", type: "text", required: true },
			{ key: "zone_identifier", label: "DNS Zone Name", type: "text", required: true },
			{
				key: "credentials_json",
				label: "Service Account JSON",
				type: "password",
				required: true,
				hint: "Paste the contents of the service account JSON file.",
			},
		],
	},
	// Catch-all / advanced providers. We surface a small subset; new
	// providers should be added with their fields above for a nicer UX.
	{ value: "aliyun", label: "Aliyun", fields: [] },
	{ value: "allinkl", label: "AllInkl", fields: [] },
	{ value: "changeip", label: "ChangeIP", fields: [] },
	{ value: "dd24", label: "DD24", fields: [] },
	{ value: "ddnss", label: "DDNSS.de", fields: [] },
	{ value: "desec", label: "deSEC", fields: [] },
	{ value: "digitalocean", label: "DigitalOcean", fields: [] },
	{ value: "dnsomatic", label: "DNSOMatic", fields: [] },
	{ value: "dnspod", label: "DNSPod", fields: [] },
	{ value: "domeneshop", label: "Domeneshop", fields: [] },
	{ value: "dondominio", label: "DonDominio", fields: [] },
	{ value: "dyn", label: "DynDNS", fields: [] },
	{ value: "dynv6", label: "DynV6", fields: [] },
	{ value: "easydns", label: "EasyDNS", fields: [] },
	{ value: "freedns", label: "FreeDNS", fields: [] },
	{ value: "goip", label: "GoIP.de", fields: [] },
	{ value: "he", label: "HE.net", fields: [] },
	{ value: "infomaniak", label: "Infomaniak", fields: [] },
	{ value: "inwx", label: "INWX", fields: [] },
	{ value: "ionos", label: "Ionos", fields: [] },
	{ value: "ipv64", label: "ipv64", fields: [] },
	{ value: "linode", label: "Linode", fields: [] },
	{ value: "loopia", label: "Loopia", fields: [] },
	{ value: "luadns", label: "LuaDNS", fields: [] },
	{ value: "myaddr", label: "Myaddr", fields: [] },
	{ value: "namecom", label: "Name.com", fields: [] },
	{ value: "namesilo", label: "NameSilo", fields: [] },
	{ value: "netcup", label: "Netcup", fields: [] },
	{ value: "njalla", label: "Njalla", fields: [] },
	{ value: "nowdns", label: "Now-DNS", fields: [] },
	{ value: "opendns", label: "OpenDNS", fields: [] },
	{ value: "ovh", label: "OVH", fields: [] },
	{ value: "porkbun", label: "Porkbun", fields: [] },
	{ value: "scaleway", label: "Scaleway", fields: [] },
	{ value: "servercow", label: "Servercow.de", fields: [] },
	{ value: "spaceship", label: "Spaceship", fields: [] },
	{ value: "spdyn", label: "Spdyn", fields: [] },
	{ value: "strato", label: "Strato.de", fields: [] },
	{ value: "variomedia", label: "Variomedia.de", fields: [] },
	{ value: "vercel", label: "Vercel", fields: [] },
	{ value: "vultr", label: "Vultr", fields: [] },
	{ value: "zoneedit", label: "Zoneedit", fields: [] },
	{ value: "custom", label: "Custom (raw JSON)", fields: [] },
	{ value: "example", label: "Example (no-op)", fields: [] },
];

export const DDNS_PROVIDER_MAP: Record<string, DdnsProvider> = Object.fromEntries(
	DDNS_PROVIDERS.map((p) => [p.value, p]),
);

export const getProvider = (value: string): DdnsProvider | undefined => DDNS_PROVIDER_MAP[value];
