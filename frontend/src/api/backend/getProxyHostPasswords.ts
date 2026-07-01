import * as api from "./base";
import type { ProxyHostPassword } from "./models";

export async function getProxyHostPasswords(hostId: number): Promise<ProxyHostPassword[]> {
	return await api.get({
		url: `/nginx/proxy-hosts/${hostId}/passwords`,
	});
}