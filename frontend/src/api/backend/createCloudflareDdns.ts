import * as api from "./base";
import type { CloudflareDdns } from "./models";

export async function createCloudflareDdns(item: CloudflareDdns): Promise<CloudflareDdns> {
	return await api.post({
		url: "/cloudflare-ddns",
		data: item,
	});
}
