import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, Loading } from "src/components";
import { useDdnsConfig, useSetDdnsConfig } from "src/hooks";
import { DDNS_PROVIDERS, type DdnsProviderField, getProvider } from "src/lib/ddnsProviders";
import { intl, T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

const showDdnsConfigModal = (id: number | "new") => {
	EasyModal.show(DdnsConfigModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}

const DdnsConfigModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useDdnsConfig(id);
	const { mutate: setDdnsConfig, isPending, error: mutationError } = useSetDdnsConfig();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const isEdit = id !== "new";
	// When editing, the API masks config_json sensitive keys. The user must
	// explicitly opt in to replace any of them.
	const [replaceSecrets, setReplaceSecrets] = useState<Record<string, boolean>>({});

	const submitting = isPending;

	const renderProviderField = (field: DdnsProviderField) => {
		const replaceKey = `replace_${field.key}`;
		const showReplaceToggle = isEdit && (field.type === "password" || field.type === "text");
		// If the existing value is empty (backend redacted), require opt-in.
		const currentValue = (data?.configJson as any)?.[field.key];
		const currentValueEmpty = currentValue === undefined || currentValue === null || currentValue === "";
		const showReplace = showReplaceToggle && (currentValueEmpty || replaceSecrets[field.key]);

		return (
			<div className="mb-3" key={field.key}>
				<label className="form-label">
					{field.label}
					{field.required ? " *" : ""}
				</label>
				{field.type === "boolean" ? (
					<Field type="checkbox" name={`configJson.${field.key}`} className="form-check-input ms-2" />
				) : (
					<Field
						type={field.type === "password" ? "password" : "text"}
						name={`configJson.${field.key}`}
						className="form-control"
						min={field.min}
						max={field.max}
						placeholder={field.placeholder}
						disabled={showReplaceToggle && !showReplace}
					/>
				)}
				{showReplaceToggle && (
					<div className="form-check mt-1">
						<input
							type="checkbox"
							className="form-check-input"
							id={replaceKey}
							checked={!!replaceSecrets[field.key]}
							onChange={(e) => setReplaceSecrets((s) => ({ ...s, [field.key]: e.target.checked }))}
						/>
						<label className="form-check-label" htmlFor={replaceKey}>
							<T id="ddns-config.replace-secret" />
						</label>
					</div>
				)}
				{field.hint && <small className="form-hint">{field.hint}</small>}
			</div>
		);
	};

	return (
		<Modal show={visible} onHide={remove} size="lg">
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading && <Loading noLogo />}
			{!isLoading && data && (
				<Formik
					initialValues={{
						id: data?.id ?? 0,
						name: data?.name ?? "",
						provider: data?.provider ?? "cloudflare",
						domain: data?.domain ?? "",
						ipVersion: data?.ipVersion ?? "ipv4",
						updateCron: data?.updateCron ?? "@every 5m",
						enabled: data?.enabled ?? true,
						configJson: (data?.configJson as any) ?? {},
					}}
					enableReinitialize
					onSubmit={(values, { setSubmitting }) => {
						setErrorMsg(null);
						const payload: Record<string, unknown> = {
							name: values.name,
							provider: values.provider,
							domain: values.domain,
							ip_version: values.ipVersion,
							update_cron: values.updateCron,
							enabled: values.enabled,
							config_json: values.configJson,
						};
						if (isEdit) payload.id = data.id;

						// Strip out secrets the user did NOT opt in to replace.
						if (isEdit) {
							const cfg = (values.configJson as Record<string, unknown>) ?? {};
							for (const k of Object.keys(cfg)) {
								if (replaceSecrets[k] === false && typeof cfg[k] === "string" && cfg[k] === "") {
									delete cfg[k];
								}
							}
							payload.config_json = cfg;
						}

						setDdnsConfig(
							{ ...data, ...(payload as any) },
							{
								onError: (err: any) => setErrorMsg(<T id={err.message} />),
								onSuccess: () => {
									showObjectSuccess("ddns-config", "saved");
									remove();
								},
								onSettled: () => setSubmitting(false),
							},
						);
					}}
				>
					{({ values }) => {
						const provider = getProvider(values.provider) ?? DDNS_PROVIDERS[0];
						return (
							<Form>
								<Modal.Header closeButton>
									<Modal.Title>
										<T id={isEdit ? "ddns-config.edit" : "ddns-config.add"} />
									</Modal.Title>
								</Modal.Header>
								<Modal.Body>
									{errorMsg && (
										<Alert variant="danger" className="mb-3">
											{errorMsg}
										</Alert>
									)}
									{mutationError && (
										<Alert variant="danger" className="mb-3">
											{mutationError.message}
										</Alert>
									)}
									<div className="mb-3">
										<label className="form-label">
											<T id="ddns-config.name" />
										</label>
										<Field
											type="text"
											name="name"
											className="form-control"
											placeholder={intl.formatMessage({
												id: "ddns-config.name.placeholder",
											})}
										/>
									</div>
									<div className="mb-3">
										<label className="form-label">
											<T id="ddns-config.provider" /> *
										</label>
										<Field as="select" name="provider" className="form-select">
											{DDNS_PROVIDERS.map((p) => (
												<option key={p.value} value={p.value}>
													{p.label}
												</option>
											))}
										</Field>
										<small className="form-hint">
											<T id="ddns-config.provider.hint" />
										</small>
									</div>
									<div className="mb-3">
										<label className="form-label">
											<T id="ddns-config.domain" /> *
										</label>
										<Field
											type="text"
											name="domain"
											className="form-control"
											placeholder="home.example.com"
											required
										/>
									</div>
									<div className="mb-3">
										<label className="form-label">
											<T id="ddns-config.ip-version" />
										</label>
										<Field as="select" name="ipVersion" className="form-select">
											<option value="ipv4">IPv4 (A)</option>
											<option value="ipv6">IPv6 (AAAA)</option>
										</Field>
									</div>
									<div className="mb-3">
										<label className="form-label">
											<T id="ddns-config.update-cron" />
										</label>
										<Field
											type="text"
											name="updateCron"
											className="form-control"
											placeholder="@every 5m"
										/>
										<small className="form-hint">
											<T id="ddns-config.update-cron.hint" />
										</small>
									</div>

									<hr />
									<h5>
										<T id="ddns-config.provider-config" />
									</h5>
									{provider.fields.length === 0 ? (
										<p className="text-muted">
											<T id="ddns-config.provider-config.empty" />
										</p>
									) : (
										provider.fields.map(renderProviderField)
									)}
								</Modal.Body>
								<Modal.Footer>
									<Button type="submit" className="btn-orange" disabled={submitting}>
										<T id={submitting ? "loading" : "action.save"} />
									</Button>
								</Modal.Footer>
							</Form>
						);
					}}
				</Formik>
			)}
		</Modal>
	);
});

export { DdnsConfigModal, showDdnsConfigModal };
