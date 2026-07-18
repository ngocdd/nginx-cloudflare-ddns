import * as api from "./base";

export interface TriggerResult {
	success: boolean;
	exitCode?: number;
	output?: string;
	error?: string | null;
}

export async function triggerDdnsConfig(id: number): Promise<TriggerResult> {
	return await api.post({
		url: `/ddns/${id}/trigger`,
	});
}
