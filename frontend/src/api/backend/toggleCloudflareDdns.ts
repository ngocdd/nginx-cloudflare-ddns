import * as api from "./base";

export async function toggleCloudflareDdns(id: number, enabled: boolean): Promise<boolean> {
	return await api.post({
		url: `/cloudflare-ddns/${id}/${enabled ? "enable" : "disable"}`,
	});
}
