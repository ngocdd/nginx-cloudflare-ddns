import * as api from "./base";

export async function deleteDdnsConfig(id: number): Promise<boolean> {
	return await api.del({
		url: `/ddns/${id}`,
	});
}
