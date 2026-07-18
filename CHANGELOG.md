# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Multi-provider DDNS** powered by [qdm12/ddns-updater](https://github.com/qdm12/ddns-updater):
  50+ DNS providers including Cloudflare, Namecheap, DuckDNS, GoDaddy,
  Route53, Hetzner, Gandi, GCP, etc. (see [`docs/ddns-providers.md`](docs/ddns-providers.md)).
- New `/api/ddns` endpoint group with full CRUD, enable/disable, manual
  trigger, and a `/api/ddns/status` aggregate health endpoint.
- New `ddns_configs` table (provider-agnostic, 1:1 with (provider, domain))
  with runtime state columns (`last_run_at`, `last_run_success`,
  `last_trigger_at`, `last_trigger_success`, `last_error`).
- Backend `internal/ddns-manager.js` owns a single long-running
  `ddns-updater` child process with debounced reload, persistent runtime
  state, and graceful SIGTERM/SIGKILL shutdown.
- Backend `internal/ddns-config-builder.js` translates DB rows to the
  qdm12/ddns-updater JSON config format.
- Frontend `pages/DdnsConfig/` and `modals/DdnsConfigModal.tsx` with a
  dynamic per-provider form, write-only credentials with
  "Replace existing value" opt-in, and per-row enable/disable/trigger.
- Frontend `lib/ddnsProviders.ts` enumerates supported providers and their
  field schemas (Cloudflare, DuckDNS, Namecheap, GoDaddy, Route53, Hetzner,
  GCP, plus a pass-through list).
- Migration `20260718000000_ddns_configs.js` creates the new table.
- Migration `20260718000001_ddns_migrate_cloudflare.js` copies existing
  rows from the legacy `cloudflare_ddns` table into `ddns_configs`,
  splitting comma-separated domains into one row per (provider, domain).
- Migration `20260718000002_ddns_drop_cloudflare_legacy.js` drops the legacy
  `cloudflare_ddns` table once the new backend has shipped.
- `docs/ddns-providers.md` lists every supported provider and the
  credentials each one needs, with concrete JSON examples.
- Sync-with-upstream workflow: `make sync-status`, `make sync-upstream`,
  `make sync-upstream-rebase`, `make check-fork-boundaries` — all fork
  modifications in upstream-owned files are wrapped in
  `===== FORK START/END =====` delimiters to keep merge conflicts tiny.

### Changed
- **BREAKING**: The Cloudflare-only DDNS UI is gone. Routes are now
  `/api/ddns/*` (not `/api/cloudflare-ddns/*`) and the menu item is "DDNS"
  (not "Cloudflare DDNS"). Existing rows are auto-migrated.
- **BREAKING**: All DDNS configs share a single global cron (env var
  `DDNS_GLOBAL_CRON`, default `@every 5m`). The per-row `update_cron`
  field is kept for display purposes but the ddns-updater binary doesn't
  honor per-setting crons — different crons require different containers.
- Docker image now uses `ghcr.io/qdm12/ddns-updater` instead of
  `favonia/cloudflare-ddns:1.15.0`.
- All fork modifications are wrapped in `===== FORK START/END =====` blocks
  for easy upstream sync.

### Removed
- All Cloudflare-only application code:
  `backend/internal/{cloudflare-ddns,ddns-process,ddns-state,ddns-env}.js`,
  `backend/models/cloudflare_ddns.js`, `backend/routes/cloudflare-ddns.js`,
  `frontend/src/pages/CloudflareDdns/`, `frontend/src/modals/CloudflareDdnsModal.tsx`,
  plus the 7 corresponding `*CloudflareDdns*.ts` files under
  `frontend/src/api/backend/` and `frontend/src/hooks/`.
- 60 `cloudflare-ddns.*` locale strings from
  `frontend/src/locale/src/en.json`.
- Legacy schema paths under `backend/schema/paths/cloudflare-ddns/`.

## [2.14.0] - 2026-02-28

### Added
- Initial fork of [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager)
  with integrated Cloudflare DDNS support.
- Per-config Cloudflare DDNS process management with cron scheduling.
- React UI at "Cloudflare DDNS" with enable/disable/trigger actions and
  per-row process status.
- IPv4/IPv6 domain splitting and provider configuration.
- Per-row runtime state columns (`last_run_at`, `last_run_success`,
  `last_trigger_at`, `last_trigger_success`, `last_error`).
- Derived `processStatus.state` field with values:
  `missing-binary | broken | running-pending | running-ok | running-failed |
  stopped | never-started`.
- Write-only Cloudflare API token with opt-in "Replace API token" toggle.
- Graceful shutdown handler that stops DDNS child processes before exiting.
- `make bump PART=patch|minor|major` and `make release` targets.
- `.github/workflows/ci.yml` (lint + schema validation + build).
- `CONTRIBUTING.md` (yarn, .version, make workflow).