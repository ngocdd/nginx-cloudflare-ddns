import { IconHelp, IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteCloudflareDdns, toggleCloudflareDdns, triggerCloudflareDdns } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useCloudflareDdnsList } from "src/hooks";
import { intl, T } from "src/locale";
import { showCloudflareDdnsModal, showDeleteConfirmModal, showHelpModal } from "src/modals";
import { ADMIN, MANAGE } from "src/modules/Permissions";
import { showObjectSuccess, showSuccess, showError } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useCloudflareDdnsList(["owner"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteCloudflareDdns(id);
		showObjectSuccess("cloudflare-ddns", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleCloudflareDdns(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["cloudflare-ddns-list"] });
		queryClient.invalidateQueries({ queryKey: ["cloudflare-ddns", id] });
		showObjectSuccess("cloudflare-ddns", enabled ? "enabled" : "disabled");
	};

	const handleTrigger = async (id: number) => {
		showSuccess(intl.formatMessage({ id: "cloudflare-ddns.trigger.started" }));
		try {
			const result = await triggerCloudflareDdns(id);
			queryClient.invalidateQueries({ queryKey: ["cloudflare-ddns-list"] });
			queryClient.invalidateQueries({ queryKey: ["cloudflare-ddns", id] });
			if (result.success) {
				showSuccess(intl.formatMessage({ id: "cloudflare-ddns.trigger.success" }));
			} else {
				showError(intl.formatMessage({ id: "cloudflare-ddns.trigger.failed" }));
			}
		} catch {
			showError(intl.formatMessage({ id: "cloudflare-ddns.trigger.failed" }));
		}
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return (
				item.name.toLowerCase().includes(search) ||
				item.domains.toLowerCase().includes(search) ||
				item.unproxiedDomains.toLowerCase().includes(search) ||
				item.ip4Domains.toLowerCase().includes(search) ||
				item.ip6Domains.toLowerCase().includes(search)
			);
		});
	} else if (search !== "") {
		setSearch("");
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-orange" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="cloudflare-ddns" />
							</h2>
						</div>
						<div className="col-md-auto col-sm-12">
							<div className="ms-auto d-flex flex-wrap btn-list">
								{data?.length ? (
									<div className="input-group input-group-flat w-auto">
										<span className="input-group-text input-group-text-sm">
											<IconSearch size={16} />
										</span>
										<input
											id="advanced-table-search"
											type="text"
											className="form-control form-control-sm"
											autoComplete="off"
											onChange={(e: any) => setSearch(e.target.value.toLowerCase().trim())}
										/>
									</div>
								) : null}
								<Button size="sm" onClick={() => showHelpModal("Cloudflare DDNS", "orange")}>
									<IconHelp size={20} />
								</Button>
								<HasPermission section={ADMIN} permission={MANAGE} hideError>
									{data?.length ? (
										<Button
											size="sm"
											className="btn-orange"
											onClick={() => showCloudflareDdnsModal("new")}
										>
											<T id="cloudflare-ddns.add" />
										</Button>
									) : null}
								</HasPermission>
							</div>
						</div>
					</div>
				</div>
				<Table
					data={filtered ?? data ?? []}
					isFetching={isFetching}
					isFiltered={!!filtered}
					onEdit={(id: number) => showCloudflareDdnsModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="cloudflare-ddns.delete" />,
							onConfirm: () => handleDelete(id),
							invalidations: [["cloudflare-ddns-list"], ["cloudflare-ddns", id]],
							children: <T id="cloudflare-ddns.delete.content" />,
						})
					}
					onDisableToggle={handleDisableToggle}
					onTrigger={handleTrigger}
					onNew={() => showCloudflareDdnsModal("new")}
				/>
			</div>
		</div>
	);
}
