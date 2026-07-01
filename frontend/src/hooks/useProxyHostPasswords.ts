import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	getProxyHostPasswords,
	type ProxyHostPassword,
	setProxyHostPasswords,
	type SetProxyHostPasswordsPayload,
} from "src/api/backend";

const useProxyHostPasswords = (hostId: number, options = {}) => {
	return useQuery<ProxyHostPassword[], Error>({
		queryKey: ["proxy-host-passwords", hostId],
		queryFn: () => getProxyHostPasswords(hostId),
		staleTime: 60 * 1000, // 1 minute
		enabled: hostId > 0,
		...options,
	});
};

const useSetProxyHostPasswords = (hostId: number) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SetProxyHostPasswordsPayload) => setProxyHostPasswords(hostId, payload),
		onSuccess: async (data: ProxyHostPassword[]) => {
			queryClient.setQueryData(["proxy-host-passwords", hostId], data);
			queryClient.invalidateQueries({ queryKey: ["proxy-host", hostId] });
		},
	});
};

export { useProxyHostPasswords, useSetProxyHostPasswords };