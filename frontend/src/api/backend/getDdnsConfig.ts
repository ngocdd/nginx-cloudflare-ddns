import * as api from "./base";
import type { DdnsConfig } from "./models";

export async function getDdnsConfig(id: number, expand?: string[], params = {}): Promise<DdnsConfig> {
	return await api.get({
		url: `/ddns/${id}`,
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
