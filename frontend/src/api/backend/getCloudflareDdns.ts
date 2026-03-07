import * as api from "./base";
import type { CloudflareDdns } from "./models";

export async function getCloudflareDdns(id: number, expand?: string[], params = {}): Promise<CloudflareDdns> {
	return await api.get({
		url: `/cloudflare-ddns/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
