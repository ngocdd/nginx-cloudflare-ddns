import * as api from "./base";

export interface TriggerResult {
	success: boolean;
	exitCode?: number;
	output?: string;
	error?: string | null;
}

export async function triggerCloudflareDdns(id: number): Promise<TriggerResult> {
	return await api.post({
		url: `/cloudflare-ddns/${id}/trigger`,
	});
}
