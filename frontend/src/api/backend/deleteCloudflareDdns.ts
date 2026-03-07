import * as api from "./base";

export async function deleteCloudflareDdns(id: number): Promise<boolean> {
	return await api.del({
		url: `/cloudflare-ddns/${id}`,
	});
}
