import { IconDotsVertical, IconEdit, IconPower, IconRefresh, IconTrash } from "@tabler/icons-react";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { DdnsConfig } from "src/api/backend";
import { EmptyData, GravatarFormatter, HasPermission, TrueFalseFormatter } from "src/components";
import { TableLayout } from "src/components/Table/TableLayout";
import { intl, T } from "src/locale";
import { ADMIN, MANAGE } from "src/modules/Permissions";

interface Props {
	data: DdnsConfig[];
	isFiltered?: boolean;
	isFetching?: boolean;
	onEdit?: (id: number) => void;
	onDelete?: (id: number) => void;
	onDisableToggle?: (id: number, enabled: boolean) => void;
	onTrigger?: (id: number) => void;
	onNew?: () => void;
}

const stateMeta: Record<string, { cls: string; labelKey: string }> = {
	"missing-binary": { cls: "bg-red text-red-fg", labelKey: "ddns-config.state.missing-binary" },
	broken: { cls: "bg-red text-red-fg", labelKey: "ddns-config.state.broken" },
	"running-ok": { cls: "bg-green text-green-fg", labelKey: "ddns-config.state.running-ok" },
	"running-failed": { cls: "bg-red text-red-fg", labelKey: "ddns-config.state.running-failed" },
	"running-pending": { cls: "bg-yellow text-yellow-fg", labelKey: "ddns-config.state.running-pending" },
	stopped: { cls: "bg-secondary text-secondary-fg", labelKey: "ddns-config.state.stopped" },
	"never-started": { cls: "bg-secondary text-secondary-fg", labelKey: "ddns-config.state.never-started" },
};

const renderTime = (iso: string | null | undefined) => {
	if (!iso) return null;
	const date = new Date(iso);
	const hours = date.getHours().toString().padStart(2, "0");
	const minutes = date.getMinutes().toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const year = date.getFullYear();
	return `${hours}:${minutes} ${day}/${month}/${year}`;
};

export default function Table({
	data,
	isFetching,
	isFiltered,
	onEdit,
	onDelete,
	onDisableToggle,
	onTrigger,
	onNew,
}: Props) {
	const columnHelper = createColumnHelper<DdnsConfig>();
	const columns = useMemo(
		() => [
			columnHelper.accessor((row: any) => row.owner, {
				id: "owner",
				cell: (info: any) => {
					const value = info.getValue();
					return <GravatarFormatter url={value ? value.avatar : ""} name={value ? value.name : ""} />;
				},
				meta: { className: "w-1" },
			}),
			columnHelper.accessor((row: any) => row, {
				id: "name",
				header: intl.formatMessage({ id: "ddns-config.name" }),
				cell: (info: any) => {
					const value = info.getValue();
					return (
						<span>
							<strong>{value.name || "(unnamed)"}</strong>
							<br />
							<small className="text-muted">
								{value.provider} · {value.domain} · {value.ipVersion}
							</small>
						</span>
					);
				},
			}),
			columnHelper.accessor((row: any) => row.updateCron, {
				id: "updateCron",
				header: intl.formatMessage({ id: "ddns-config.update-cron" }),
				cell: (info: any) => <span className="text-muted">{info.getValue()}</span>,
			}),
			columnHelper.accessor((row: any) => row, {
				id: "lastRun",
				header: intl.formatMessage({ id: "ddns-config.last-run" }),
				cell: (info: any) => {
					const value = info.getValue();
					const status = value.processStatus || {};
					const state = status.state || "never-started";
					const meta = stateMeta[state] || stateMeta["never-started"];
					const lastRunLabel = status.lastRunAt
						? `${renderTime(status.lastRunAt)}${status.lastTriggerAt ? ` · ${renderTime(status.lastTriggerAt)}` : ""}`
						: "";
					return (
						<span className="d-inline-flex align-items-center gap-2">
							<span className={`badge ${meta.cls}`} title={status.lastError || undefined}>
								<T id={meta.labelKey} />
							</span>
							{lastRunLabel ? <span className="text-muted small">{lastRunLabel}</span> : null}
						</span>
					);
				},
			}),
			columnHelper.accessor((row: any) => row.enabled, {
				id: "enabled",
				header: intl.formatMessage({ id: "column.status" }),
				cell: (info: any) => (
					<TrueFalseFormatter value={info.getValue()} trueLabel="online" falseLabel="offline" />
				),
			}),
			columnHelper.display({
				id: "id",
				cell: (info: any) => (
					<span className="dropdown">
						<button
							type="button"
							className="btn dropdown-toggle btn-action btn-sm px-1"
							data-bs-boundary="viewport"
							data-bs-toggle="dropdown"
						>
							<IconDotsVertical />
						</button>
						<div className="dropdown-menu dropdown-menu-end">
							<span className="dropdown-header">
								<T
									id="ddns-config.actions-title"
									tData={{ name: info.row.original.name || `#${info.row.original.id}` }}
								/>
							</span>
							<a
								className="dropdown-item"
								href="#"
								onClick={(e) => {
									e.preventDefault();
									onEdit?.(info.row.original.id);
								}}
							>
								<IconEdit size={16} />
								<T id="action.edit" />
							</a>
							<HasPermission section={ADMIN} permission={MANAGE} hideError>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onTrigger?.(info.row.original.id);
									}}
								>
									<IconRefresh size={16} />
									<T id="ddns-config.trigger" />
								</a>
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onDisableToggle?.(info.row.original.id, !info.row.original.enabled);
									}}
								>
									<IconPower size={16} />
									<T id={info.row.original.enabled ? "action.disable" : "action.enable"} />
								</a>
								<div className="dropdown-divider" />
								<a
									className="dropdown-item"
									href="#"
									onClick={(e) => {
										e.preventDefault();
										onDelete?.(info.row.original.id);
									}}
								>
									<IconTrash size={16} />
									<T id="action.delete" />
								</a>
							</HasPermission>
						</div>
					</span>
				),
				meta: { className: "text-end w-1" },
			}),
		],
		[columnHelper, onEdit, onTrigger, onDisableToggle, onDelete],
	);

	const tableInstance = useReactTable<DdnsConfig>({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		rowCount: data.length,
		meta: { isFetching },
		enableSortingRemoval: false,
	});

	return (
		<TableLayout
			tableInstance={tableInstance}
			emptyState={
				<EmptyData
					object="ddns-config"
					objects="ddns-configs"
					tableInstance={tableInstance}
					onNew={onNew}
					isFiltered={isFiltered}
					color="orange"
					permissionSection={ADMIN}
				/>
			}
		/>
	);
}
