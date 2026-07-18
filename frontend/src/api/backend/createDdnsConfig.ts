import * as api from "./base";
import type { DdnsConfig } from "./models";

export async function createDdnsConfig(item: DdnsConfig): Promise<DdnsConfig> {
	return await api.post({
		url: "/ddns",
		data: item,
	});
}
