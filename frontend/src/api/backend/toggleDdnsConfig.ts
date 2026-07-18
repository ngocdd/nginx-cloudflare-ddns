import * as api from "./base";

export async function toggleDdnsConfig(id: number, enabled: boolean): Promise<boolean> {
	return await api.post({
		url: `/ddns/${id}/${enabled ? "enable" : "disable"}`,
	});
}
