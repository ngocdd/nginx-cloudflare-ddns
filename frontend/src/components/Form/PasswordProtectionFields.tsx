import { IconShieldLock, IconX } from "@tabler/icons-react";
import { useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import type { ProxyHostPassword } from "src/api/backend";
import { intl, T } from "src/locale";

interface Props {
	domainNames: string[];
	initialValues?: ProxyHostPassword[];
	name?: string;
}

const newEntry = (domain: string): ProxyHostPassword => ({
	domain,
	username: "admin",
	password: "",
	enabled: false,
});

export function PasswordProtectionFields({ domainNames, initialValues = [], name = "passwords" }: Props) {
	const { setFieldValue } = useFormikContext();

	const initialByDomain = useMemo(() => {
		const map = new Map<string, ProxyHostPassword>();
		(initialValues || []).forEach((p) => {
			if (p.domain) map.set(p.domain, p);
		});
		return map;
	}, [initialValues]);

	const [values, setValues] = useState<ProxyHostPassword[]>(() => {
		return (domainNames || []).map((d) => {
			const existing = initialByDomain.get(d);
			if (existing) {
				return {
					domain: d,
					username: existing.username || "admin",
					password: "",
					enabled: !!existing.enabled,
				};
			}
			return newEntry(d);
		});
	});

	// Sync entries when domainNames change (e.g. user adds/removes domains in the same modal session).
	// Preserve edits (username, password, enabled) for domains that still exist; drop entries for removed domains.
	useEffect(() => {
		setValues((prev) => {
			const prevByDomain = new Map(prev.map((v) => [v.domain, v]));
			return (domainNames || []).map((d) => {
				const fromPrev = prevByDomain.get(d);
				if (fromPrev) return fromPrev;
				const fromInitial = initialByDomain.get(d);
				if (fromInitial) {
					return {
						domain: d,
						username: fromInitial.username || "admin",
						password: "",
						enabled: !!fromInitial.enabled,
					};
				}
				return newEntry(d);
			});
		});
	}, [domainNames.join("|")]);

	// Keep Formik value synced
	useEffect(() => {
		setFieldValue(name, values);
	}, [name, setFieldValue, values]);

	const handleChange = (idx: number, patch: Partial<ProxyHostPassword>) => {
		setValues((prev) =>
			prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
		);
	};

	const handleRemove = (idx: number) => {
		// "Remove" actually disables the entry and clears the password.
		setValues((prev) =>
			prev.map((v, i) =>
				i === idx ? { ...v, enabled: false, password: "" } : v,
			),
		);
	};

	return (
		<div className="card mt-3">
			<div className="card-header">
				<IconShieldLock size={16} className="me-2" />
				<strong>
					<T id="password-protection" />
				</strong>
			</div>
			<div className="card-body">
				<p className="text-muted small">
					<T id="password-protection.help" />
				</p>

				{(domainNames || []).length === 0 ? (
					<div className="text-muted">
						<T id="password-protection.no-domains" />
					</div>
				) : (
					values.map((item, idx) => (
						<div className="row align-items-center mb-3" key={item.domain}>
							<div className="col-3">
								<input
									type="text"
									className="form-control form-control-sm"
									value={item.domain}
									disabled
									readOnly
								/>
							</div>
							<div className="col-2">
								<input
									type="text"
									autoComplete="off"
									className="form-control form-control-sm"
									placeholder={intl.formatMessage({ id: "username" })}
									value={item.username}
									onChange={(e) => handleChange(idx, { username: e.target.value })}
								/>
							</div>
							<div className="col-4">
								<input
									type="password"
									autoComplete="new-password"
									className="form-control form-control-sm"
									placeholder={initialByDomain.has(item.domain) ? "••••••••" : intl.formatMessage({ id: "password" })}
									value={item.password || ""}
									onChange={(e) => handleChange(idx, { password: e.target.value })}
								/>
							</div>
							<div className="col-2">
								<div className="form-check form-switch">
									<input
										className="form-check-input"
										type="checkbox"
										role="switch"
										id={`password-enabled-${idx}`}
										checked={!!item.enabled}
										onChange={(e) => handleChange(idx, { enabled: e.target.checked })}
									/>
									<label className="form-check-label small" htmlFor={`password-enabled-${idx}`}>
										<T id={item.enabled ? "enabled" : "disabled"} />
									</label>
								</div>
							</div>
							<div className="col-1">
								<button
									type="button"
									className="btn btn-sm btn-ghost-danger"
									title={intl.formatMessage({ id: "action.remove" })}
									onClick={() => handleRemove(idx)}
								>
									<IconX size={16} />
								</button>
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}