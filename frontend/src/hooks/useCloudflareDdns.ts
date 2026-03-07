import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCloudflareDdns, getCloudflareDdns, updateCloudflareDdns, type CloudflareDdns } from "src/api/backend";

const fetchCloudflareDdns = (id: number | "new") => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			createdOn: "",
			modifiedOn: "",
			ownerUserId: 0,
			enabled: true,
			name: "",
			cloudflareApiToken: "",
			domains: "",
			ip4Domains: "",
			ip6Domains: "",
			ip4Provider: "cloudflare.trace",
			ip6Provider: "cloudflare.trace",
			updateCron: "@every 5m",
			updateOnStart: true,
			deleteOnStop: false,
			proxied: "false",
			ttl: 1,
			recordComment: "",
			detectionTimeout: "5s",
			updateTimeout: "30s",
			cacheExpiration: "6h0m0s",
			meta: {},
		} as CloudflareDdns);
	}
	return getCloudflareDdns(id, ["owner"]);
};

const useCloudflareDdns = (id: number | "new", options = {}) => {
	return useQuery<CloudflareDdns, Error>({
		queryKey: ["cloudflare-ddns", id],
		queryFn: () => fetchCloudflareDdns(id),
		staleTime: 60 * 1000,
		...options,
	});
};

const useSetCloudflareDdns = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: CloudflareDdns) =>
			values.id ? updateCloudflareDdns(values) : createCloudflareDdns(values),
		onMutate: (values: CloudflareDdns) => {
			if (!values.id) {
				return;
			}
			const previousObject = queryClient.getQueryData(["cloudflare-ddns", values.id]);
			queryClient.setQueryData(["cloudflare-ddns", values.id], (old: CloudflareDdns) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["cloudflare-ddns", values.id], previousObject);
		},
		onError: (_err, _values, rollback) => rollback?.(),
		onSuccess: async ({ id }: CloudflareDdns) => {
			queryClient.invalidateQueries({ queryKey: ["cloudflare-ddns", id] });
			queryClient.invalidateQueries({ queryKey: ["cloudflare-ddns-list"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

export { useCloudflareDdns, useSetCloudflareDdns };
