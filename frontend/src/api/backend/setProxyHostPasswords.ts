import * as api from "./base";
import type { ProxyHostPassword } from "./models";

export interface SetProxyHostPasswordsPayload {
	passwords: ProxyHostPassword[];
}

export async function setProxyHostPasswords(
	hostId: number,
	payload: SetProxyHostPasswordsPayload,
): Promise<ProxyHostPassword[]> {
	return await api.put({
		url: `/nginx/proxy-hosts/${hostId}/passwords`,
		data: payload,
	});
}