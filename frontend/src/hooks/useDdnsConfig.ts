import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDdnsConfig, type DdnsConfig, getDdnsConfig, updateDdnsConfig } from "src/api/backend";

const fetchDdnsConfig = (id: number | "new") => {
	if (id === "new") {
		return Promise.resolve({
			id: 0,
			enabled: true,
			name: "",
			provider: "cloudflare",
			domain: "",
			ipVersion: "ipv4",
			updateCron: "@every 5m",
			configJson: {},
			meta: {},
		} as DdnsConfig);
	}
	return getDdnsConfig(id, ["owner"]);
};

const useDdnsConfig = (id: number | "new", options = {}) => {
	return useQuery<DdnsConfig, Error>({
		queryKey: ["ddns-config", id],
		queryFn: () => fetchDdnsConfig(id),
		staleTime: 60 * 1000,
		...options,
	});
};

const useSetDdnsConfig = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: DdnsConfig) => (values.id ? updateDdnsConfig(values) : createDdnsConfig(values)),
		onMutate: (values: DdnsConfig) => {
			if (!values.id) return;
			const previousObject = queryClient.getQueryData(["ddns-config", values.id]);
			queryClient.setQueryData(["ddns-config", values.id], (old: DdnsConfig) => ({
				...old,
				...values,
			}));
			return () => queryClient.setQueryData(["ddns-config", values.id], previousObject);
		},
		onError: (_err, _values, rollback) => rollback?.(),
		onSuccess: async ({ id }: DdnsConfig) => {
			queryClient.invalidateQueries({ queryKey: ["ddns-config", id] });
			queryClient.invalidateQueries({ queryKey: ["ddns-config-list"] });
			queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
		},
	});
};

export { useDdnsConfig, useSetDdnsConfig };
