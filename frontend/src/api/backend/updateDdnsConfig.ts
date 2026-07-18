import * as api from "./base";
import type { DdnsConfig } from "./models";

export async function updateDdnsConfig(item: DdnsConfig): Promise<DdnsConfig> {
	const { id, createdOn: _, modifiedOn: __, ...data } = item;
	return await api.put({
		url: `/ddns/${id}`,
		data,
	});
}
