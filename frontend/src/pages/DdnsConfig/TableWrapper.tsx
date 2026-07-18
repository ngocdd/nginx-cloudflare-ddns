import { IconHelp, IconSearch } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteDdnsConfig, toggleDdnsConfig, triggerDdnsConfig } from "src/api/backend";
import { Button, HasPermission, LoadingPage } from "src/components";
import { useDdnsConfigList } from "src/hooks";
import { intl, T } from "src/locale";
import { showDdnsConfigModal, showDeleteConfirmModal, showHelpModal } from "src/modals";
import { ADMIN, MANAGE } from "src/modules/Permissions";
import { showError, showObjectSuccess, showSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useDdnsConfigList(["owner"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteDdnsConfig(id);
		showObjectSuccess("ddns-config", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleDdnsConfig(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["ddns-config-list"] });
		queryClient.invalidateQueries({ queryKey: ["ddns-config", id] });
		showObjectSuccess("ddns-config", enabled ? "enabled" : "disabled");
	};

	const handleTrigger = async (id: number) => {
		showSuccess(intl.formatMessage({ id: "ddns-config.trigger.started" }));
		try {
			const result = await triggerDdnsConfig(id);
			queryClient.invalidateQueries({ queryKey: ["ddns-config-list"] });
			queryClient.invalidateQueries({ queryKey: ["ddns-config", id] });
			if (result.success) {
				showSuccess(intl.formatMessage({ id: "ddns-config.trigger.success" }));
			} else {
				const detail = result.error ? `: ${result.error}` : "";
				showError(intl.formatMessage({ id: "ddns-config.trigger.failed" }) + detail);
			}
		} catch (err) {
			console.warn("DDNS trigger failed:", err);
			const detail = err instanceof Error && err.message ? `: ${err.message}` : "";
			showError(intl.formatMessage({ id: "ddns-config.trigger.failed" }) + detail);
		}
	};

	let filtered = null;
	if (search && data) {
		filtered = data.filter((item) => {
			const q = search;
			return (
				(item.name || "").toLowerCase().includes(q) ||
				(item.provider || "").toLowerCase().includes(q) ||
				(item.domain || "").toLowerCase().includes(q)
			);
		});
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-orange" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="ddns-config" />
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
								<Button size="sm" onClick={() => showHelpModal("DDNS", "orange")}>
									<IconHelp size={20} />
								</Button>
								<HasPermission section={ADMIN} permission={MANAGE} hideError>
									{data?.length ? (
										<Button
											size="sm"
											className="btn-orange"
											onClick={() => showDdnsConfigModal("new")}
										>
											<T id="ddns-config.add" />
										</Button>
									) : (
										<Button
											size="sm"
											className="btn-orange"
											onClick={() => showDdnsConfigModal("new")}
										>
											<T id="ddns-config.add" />
										</Button>
									)}
								</HasPermission>
							</div>
						</div>
					</div>
				</div>
				<Table
					data={filtered ?? data ?? []}
					isFetching={isFetching}
					isFiltered={!!filtered}
					onEdit={(id: number) => showDdnsConfigModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="ddns-config.delete" />,
							onConfirm: () => handleDelete(id),
							invalidations: [["ddns-config-list"], ["ddns-config", id]],
							children: <T id="ddns-config.delete.content" />,
						})
					}
					onDisableToggle={handleDisableToggle}
					onTrigger={handleTrigger}
					onNew={() => showDdnsConfigModal("new")}
				/>
			</div>
		</div>
	);
}
