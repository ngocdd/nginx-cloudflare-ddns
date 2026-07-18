import * as api from "./base";

export interface DdnsBinaryStatus {
	available: boolean;
	error: string | null;
}

export interface DdnsConfigStatusEntry {
	id: number;
	name: string;
	provider: string;
	domain: string;
	state: string;
	reason: string;
}

export interface DdnsStatus {
	binary: DdnsBinaryStatus;
	total: number;
	enabled: number;
	running: number;
	failed: DdnsConfigStatusEntry[];
	statuses: Record<string, { state: string; running: boolean; [k: string]: unknown }>;
}

export async function getDdnsConfigStatus(): Promise<DdnsStatus> {
	return await api.get({
		url: "/ddns/status",
	});
}
