import { useQuery } from "@tanstack/react-query";
import { type DdnsConfig, getDdnsConfigList } from "src/api/backend";

const fetchDdnsConfigList = (expand?: string[]) => {
	return getDdnsConfigList(expand);
};

const useDdnsConfigList = (expand?: string[], options = {}) => {
	return useQuery<DdnsConfig[], Error>({
		queryKey: ["ddns-config-list", { expand }],
		queryFn: () => fetchDdnsConfigList(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchDdnsConfigList, useDdnsConfigList };
