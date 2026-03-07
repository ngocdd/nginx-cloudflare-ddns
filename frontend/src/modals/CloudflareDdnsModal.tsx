import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, Loading } from "src/components";
import { useCloudflareDdns, useSetCloudflareDdns } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showCloudflareDdnsModal = (id: number | "new") => {
	EasyModal.show(CloudflareDdnsModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const CloudflareDdnsModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useCloudflareDdns(id);
	const { mutate: setCloudflareDdns } = useSetCloudflareDdns();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = {
			id: id === "new" ? undefined : id,
			...values,
		};

		setCloudflareDdns(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess("cloudflare-ddns", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
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
					initialValues={
						{
							name: data?.name ?? "",
							cloudflareApiToken: data?.cloudflareApiToken ?? "",
							domains: data?.domains ?? "",
							unproxiedDomains: data?.unproxiedDomains ?? "",
							ip4Domains: data?.ip4Domains ?? "",
							ip6Domains: data?.ip6Domains ?? "",
							ip4Provider: data?.ip4Provider ?? "cloudflare.trace",
							ip6Provider: data?.ip6Provider ?? "cloudflare.trace",
							updateCron: data?.updateCron ?? "@every 5m",
							updateOnStart: data?.updateOnStart ?? true,
							deleteOnStop: data?.deleteOnStop ?? false,
							proxied: data?.proxied ?? "false",
							ttl: data?.ttl ?? 1,
							recordComment: data?.recordComment ?? "",
							detectionTimeout: data?.detectionTimeout ?? "5s",
							updateTimeout: data?.updateTimeout ?? "30s",
							cacheExpiration: data?.cacheExpiration ?? "6h0m0s",
							meta: data?.meta || {},
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ setFieldValue }: any) => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T
										id={data?.id ? "cloudflare-ddns.edit" : "cloudflare-ddns.add"}
									/>
								</Modal.Title>
							</Modal.Header>
							<Modal.Body className="p-0">
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>

								<div className="card m-0 border-0">
									<div className="card-header">
										<ul className="nav nav-tabs card-header-tabs" data-bs-toggle="tabs">
											<li className="nav-item" role="presentation">
												<a
													href="#tab-basic"
													className="nav-link active"
													data-bs-toggle="tab"
													aria-selected="true"
													role="tab"
												>
													<T id="cloudflare-ddns.tab.basic" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-domains"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="cloudflare-ddns.tab.domains" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-providers"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="cloudflare-ddns.tab.providers" />
												</a>
											</li>
											<li className="nav-item" role="presentation">
												<a
													href="#tab-advanced"
													className="nav-link"
													data-bs-toggle="tab"
													aria-selected="false"
													tabIndex={-1}
													role="tab"
												>
													<T id="cloudflare-ddns.tab.advanced" />
												</a>
											</li>
										</ul>
									</div>
									<div className="card-body">
										<div className="tab-content">
											{/* Basic Tab */}
											<div className="tab-pane active show" id="tab-basic" role="tabpanel">
												<Field name="name">
													{({ field, form }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="name">
																<T id="cloudflare-ddns.config-name" />
															</label>
															<input
																id="name"
																type="text"
																className={`form-control ${form.errors.name && form.touched.name ? "is-invalid" : ""}`}
																placeholder={intl.formatMessage({ id: "cloudflare-ddns.config-name.placeholder" })}
																{...field}
															/>
														</div>
													)}
												</Field>
												<Field name="cloudflareApiToken" validate={validateString(1, 500)}>
													{({ field, form }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="cloudflareApiToken">
																<T id="cloudflare-ddns.api-token" />
																<span className="text-danger ms-1">*</span>
															</label>
															<input
																id="cloudflareApiToken"
																type="password"
																className={`form-control ${form.errors.cloudflareApiToken && form.touched.cloudflareApiToken ? "is-invalid" : ""}`}
																required
																placeholder={intl.formatMessage({ id: "cloudflare-ddns.api-token.placeholder" })}
																{...field}
															/>
															{form.errors.cloudflareApiToken && form.touched.cloudflareApiToken ? (
																<div className="invalid-feedback">
																	{form.errors.cloudflareApiToken}
																</div>
															) : null}
															<small className="form-hint">
																<T id="cloudflare-ddns.api-token.hint" />
															</small>
														</div>
													)}
												</Field>
												<Field name="updateCron">
													{({ field }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="updateCron">
																<T id="cloudflare-ddns.update-cron" />
															</label>
															<input
																id="updateCron"
																type="text"
																className="form-control"
																placeholder="@every 5m"
																{...field}
															/>
															<small className="form-hint">
																<T id="cloudflare-ddns.update-cron.hint" />
															</small>
														</div>
													)}
												</Field>
											</div>

											{/* Domains Tab */}
											<div className="tab-pane" id="tab-domains" role="tabpanel">
												<Field name="domains">
													{({ field }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="domains">
																<T id="cloudflare-ddns.domains-proxied" />
															</label>
															<input
																id="domains"
																type="text"
																className="form-control"
																placeholder={intl.formatMessage({ id: "cloudflare-ddns.domains-proxied.placeholder" })}
																{...field}
															/>
															<small className="form-hint">
																<T id="cloudflare-ddns.domains-proxied.hint" />
															</small>
														</div>
													)}
												</Field>
												<Field name="unproxiedDomains">
													{({ field }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="unproxiedDomains">
																<T id="cloudflare-ddns.domains-unproxied" />
															</label>
															<input
																id="unproxiedDomains"
																type="text"
																className="form-control"
																placeholder={intl.formatMessage({ id: "cloudflare-ddns.domains-unproxied.placeholder" })}
																{...field}
															/>
															<small className="form-hint">
																<T id="cloudflare-ddns.domains-unproxied.hint" />
															</small>
														</div>
													)}
												</Field>
												<Field name="ip4Domains">
													{({ field }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="ip4Domains">
																<T id="cloudflare-ddns.ip4-domains" />
															</label>
															<input
																id="ip4Domains"
																type="text"
																className="form-control"
																placeholder={intl.formatMessage({ id: "cloudflare-ddns.ip4-domains.placeholder" })}
																{...field}
															/>
															<small className="form-hint">
																<T id="cloudflare-ddns.ip4-domains.hint" />
															</small>
														</div>
													)}
												</Field>
												<Field name="ip6Domains">
													{({ field }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="ip6Domains">
																<T id="cloudflare-ddns.ip6-domains" />
															</label>
															<input
																id="ip6Domains"
																type="text"
																className="form-control"
																placeholder={intl.formatMessage({ id: "cloudflare-ddns.ip6-domains.placeholder" })}
																{...field}
															/>
															<small className="form-hint">
																<T id="cloudflare-ddns.ip6-domains.hint" />
															</small>
														</div>
													)}
												</Field>
											</div>

											{/* Providers Tab */}
											<div className="tab-pane" id="tab-providers" role="tabpanel">
												<Field name="ip4Provider">
													{({ field }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="ip4Provider">
																<T id="cloudflare-ddns.ip4-provider" />
															</label>
															<select
																id="ip4Provider"
																className="form-select"
																{...field}
															>
																<option value="cloudflare.trace">cloudflare.trace (default)</option>
																<option value="cloudflare.doh">cloudflare.doh</option>
																<option value="local">local</option>
																<option value="none">none (disable IPv4)</option>
															</select>
															<small className="form-hint">
																<T id="cloudflare-ddns.ip4-provider.hint" />
															</small>
														</div>
													)}
												</Field>
												<Field name="ip6Provider">
													{({ field }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="ip6Provider">
																<T id="cloudflare-ddns.ip6-provider" />
															</label>
															<select
																id="ip6Provider"
																className="form-select"
																{...field}
															>
																<option value="cloudflare.trace">cloudflare.trace (default)</option>
																<option value="cloudflare.doh">cloudflare.doh</option>
																<option value="local">local</option>
																<option value="none">none (disable IPv6)</option>
															</select>
															<small className="form-hint">
																<T id="cloudflare-ddns.ip6-provider.hint" />
															</small>
														</div>
													)}
												</Field>
											</div>

											{/* Advanced Tab */}
											<div className="tab-pane" id="tab-advanced" role="tabpanel">
												<Field name="ttl">
													{({ field }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="ttl">
																<T id="cloudflare-ddns.ttl" />
															</label>
															<input
																id="ttl"
																type="number"
																min={1}
																max={86400}
																className="form-control"
																{...field}
															/>
															<small className="form-hint">
																<T id="cloudflare-ddns.ttl.hint" />
															</small>
														</div>
													)}
												</Field>
												<Field name="recordComment">
													{({ field }: any) => (
														<div className="mb-3">
															<label className="form-label" htmlFor="recordComment">
																<T id="cloudflare-ddns.record-comment" />
															</label>
															<input
																id="recordComment"
																type="text"
																className="form-control"
																placeholder={intl.formatMessage({ id: "cloudflare-ddns.record-comment.placeholder" })}
																{...field}
															/>
														</div>
													)}
												</Field>
												<div className="row">
													<div className="col-md-4">
														<Field name="detectionTimeout">
															{({ field }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="detectionTimeout">
																		<T id="cloudflare-ddns.detection-timeout" />
																	</label>
																	<input
																		id="detectionTimeout"
																		type="text"
																		className="form-control"
																		placeholder="5s"
																		{...field}
																	/>
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-4">
														<Field name="updateTimeout">
															{({ field }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="updateTimeout">
																		<T id="cloudflare-ddns.update-timeout" />
																	</label>
																	<input
																		id="updateTimeout"
																		type="text"
																		className="form-control"
																		placeholder="30s"
																		{...field}
																	/>
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-4">
														<Field name="cacheExpiration">
															{({ field }: any) => (
																<div className="mb-3">
																	<label className="form-label" htmlFor="cacheExpiration">
																		<T id="cloudflare-ddns.cache-expiration" />
																	</label>
																	<input
																		id="cacheExpiration"
																		type="text"
																		className="form-control"
																		placeholder="6h0m0s"
																		{...field}
																	/>
																</div>
															)}
														</Field>
													</div>
												</div>
												<div className="my-3">
													<h3 className="py-2">
														<T id="cloudflare-ddns.flags" />
													</h3>
													<div className="divide-y">
														<div>
															<label className="row" htmlFor="updateOnStart">
																<span className="col">
																	<T id="cloudflare-ddns.update-on-start" />
																	<small className="d-block text-muted">
																		<T id="cloudflare-ddns.update-on-start.hint" />
																	</small>
																</span>
																<span className="col-auto">
																	<Field name="updateOnStart" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					id="updateOnStart"
																					className="form-check-input"
																					type="checkbox"
																					name={field.name}
																					checked={field.value}
																					onChange={(e: any) => {
																						setFieldValue(field.name, e.target.checked);
																					}}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
														<div>
															<label className="row" htmlFor="deleteOnStop">
																<span className="col">
																	<T id="cloudflare-ddns.delete-on-stop" />
																	<small className="d-block text-muted">
																		<T id="cloudflare-ddns.delete-on-stop.hint" />
																	</small>
																</span>
																<span className="col-auto">
																	<Field name="deleteOnStop" type="checkbox">
																		{({ field }: any) => (
																			<label className="form-check form-check-single form-switch">
																				<input
																					id="deleteOnStop"
																					className="form-check-input"
																					type="checkbox"
																					name={field.name}
																					checked={field.value}
																					onChange={(e: any) => {
																						setFieldValue(field.name, e.target.checked);
																					}}
																				/>
																			</label>
																		)}
																	</Field>
																</span>
															</label>
														</div>
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									actionType="primary"
									className="ms-auto"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									<T id="save" />
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
});

export { showCloudflareDdnsModal };
