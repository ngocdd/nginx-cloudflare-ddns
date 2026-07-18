export interface AppVersion {
	major: number;
	minor: number;
	revision: number;
}

export interface UserPermissions {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	userId?: number;
	visibility: string;
	proxyHosts: string;
	redirectionHosts: string;
	deadHosts: string;
	streams: string;
	accessLists: string;
	certificates: string;
}

export interface User {
	id: number;
	createdOn: string;
	modifiedOn: string;
	isDisabled: boolean;
	email: string;
	name: string;
	nickname: string;
	avatar: string;
	roles: string[];
	permissions?: UserPermissions;
}

export interface AuditLog {
	id: number;
	createdOn: string;
	modifiedOn: string;
	userId: number;
	objectType: string;
	objectId: number;
	action: string;
	meta: Record<string, any>;
	// Expansions:
	user?: User;
}

export interface AccessList {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	ownerUserId: number;
	name: string;
	meta: Record<string, any>;
	satisfyAny: boolean;
	passAuth: boolean;
	proxyHostCount?: number;
	// Expansions:
	owner?: User;
	items?: AccessListItem[];
	clients?: AccessListClient[];
}

export interface AccessListItem {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	accessListId?: number;
	username: string;
	password: string;
	meta?: Record<string, any>;
	hint?: string;
}

export type AccessListClient = {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	accessListId?: number;
	address: string;
	directive: "allow" | "deny";
	meta?: Record<string, any>;
};

export interface Certificate {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	provider: string;
	niceName: string;
	domainNames: string[];
	expiresOn: string;
	meta: Record<string, any>;
	owner?: User;
	proxyHosts?: ProxyHost[];
	deadHosts?: DeadHost[];
	redirectionHosts?: RedirectionHost[];
}

export interface ProxyLocation {
	path: string;
	advancedConfig: string;
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
}

export interface ProxyHostPassword {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	proxyHostId?: number;
	domain: string;
	username: string;
	enabled: boolean;
	hint?: string;
	password?: string;
	meta?: Record<string, any>;
}

export interface ProxyHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
	accessListId: number;
	certificateId: number;
	sslForced: boolean;
	cachingEnabled: boolean;
	blockExploits: boolean;
	advancedConfig: string;
	meta: Record<string, any>;
	allowWebsocketUpgrade: boolean;
	http2Support: boolean;
	enabled: boolean;
	locations?: ProxyLocation[];
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	trustForwardedProto: boolean;
	// Expansions:
	owner?: User;
	accessList?: AccessList;
	certificate?: Certificate;
	passwords?: ProxyHostPassword[];
}

export interface DeadHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	certificateId: number;
	sslForced: boolean;
	advancedConfig: string;
	meta: Record<string, any>;
	http2Support: boolean;
	enabled: boolean;
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
}

export interface RedirectionHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	forwardDomainName: string;
	preservePath: boolean;
	certificateId: number;
	sslForced: boolean;
	blockExploits: boolean;
	advancedConfig: string;
	meta: Record<string, any>;
	http2Support: boolean;
	forwardScheme: string;
	forwardHttpCode: number;
	enabled: boolean;
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
}

export interface Stream {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	incomingPort: number;
	forwardingHost: string;
	forwardingPort: number;
	tcpForwarding: boolean;
	udpForwarding: boolean;
	meta: Record<string, any>;
	enabled: boolean;
	certificateId: number;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
}

export interface Setting {
	id: string;
	name?: string;
	description?: string;
	value: string;
	meta?: Record<string, any>;
}

export interface DNSProvider {
	id: string;
	name: string;
	credentials: string;
}

export interface DdnsConfig {
	id: number;
	createdOn?: string;
	modifiedOn?: string;
	ownerUserId?: number;
	enabled: boolean;
	name: string;
	provider: string;
	domain: string;
	ipVersion: "ipv4" | "ipv6";
	updateCron?: string;
	// Provider-specific configuration. Sensitive keys (api_token, token,
	// password, key, secret, etc.) are stripped by the backend on GET, so
	// they show up as empty strings here until the user explicitly replaces
	// them.
	configJson: {
		api_token?: string;
		token?: string;
		password?: string;
		key?: string;
		secret?: string;
		email?: string;
		user_service_key?: string;
		access_key_id?: string;
		secret_access_key?: string;
		credentials_json?: string;
		zone_identifier?: string;
		project?: string;
		proxied?: boolean;
		ttl?: number;
		record_comment?: string;
		detection_timeout?: string;
		update_timeout?: string;
		cache_expiration?: string;
		update_on_start?: boolean;
		delete_on_stop?: boolean;
		ip4_provider?: string;
		ip6_provider?: string;
		[key: string]: unknown;
	};
	meta?: Record<string, any>;
	processStatus?: {
		state: string;
		running: boolean;
		lastRunAt?: string | null;
		lastRunSuccess?: boolean | null;
		lastTriggerAt?: string | null;
		lastTriggerSuccess?: boolean | null;
		lastError?: string | null;
	};
	// Expansions:
	owner?: User;
}
