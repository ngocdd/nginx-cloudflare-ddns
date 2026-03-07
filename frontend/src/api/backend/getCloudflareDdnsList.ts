import * as api from "./base";
import type { CloudflareDdns } from "./models";

export async function getCloudflareDdnsList(expand?: string[], params = {}): Promise<CloudflareDdns[]> {
	return await api.get({
		url: "/cloudflare-ddns",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
