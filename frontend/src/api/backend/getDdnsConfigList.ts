import * as api from "./base";
import type { DdnsConfig } from "./models";

export async function getDdnsConfigList(expand?: string[], params: { query?: string } = {}): Promise<DdnsConfig[]> {
	return await api.get({
		url: "/ddns",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
