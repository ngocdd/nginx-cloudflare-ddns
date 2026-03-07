import * as api from "./base";
import type { CloudflareDdns } from "./models";

export async function updateCloudflareDdns(item: CloudflareDdns): Promise<CloudflareDdns> {
	const { id, createdOn: _, modifiedOn: __, ...data } = item;

	return await api.put({
		url: `/cloudflare-ddns/${id}`,
		data: data,
	});
}
