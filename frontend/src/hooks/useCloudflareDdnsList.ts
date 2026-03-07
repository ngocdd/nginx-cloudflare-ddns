import { useQuery } from "@tanstack/react-query";
import { getCloudflareDdnsList, type CloudflareDdns } from "src/api/backend";

const fetchCloudflareDdnsList = (expand?: string[]) => {
	return getCloudflareDdnsList(expand);
};

const useCloudflareDdnsList = (expand?: string[], options = {}) => {
	return useQuery<CloudflareDdns[], Error>({
		queryKey: ["cloudflare-ddns-list", { expand }],
		queryFn: () => fetchCloudflareDdnsList(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchCloudflareDdnsList, useCloudflareDdnsList };
