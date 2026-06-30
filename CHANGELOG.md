# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New `GET /api/cloudflare-ddns/status` endpoint exposing binary availability,
  per-config runtime state, and a list of broken configs (`backend/routes/cloudflare-ddns.js`).
- Per-row runtime state columns (`last_run_at`, `last_run_success`,
  `last_trigger_at`, `last_trigger_success`, `last_error`) on `cloudflare_ddns`,
  persisted by `ddns-process.js` so the UI survives backend restarts.
- Derived `processStatus.state` field with values:
  `missing-binary | broken | running-pending | running-ok | running-failed |
  stopped | never-started`. Frontend table maps these to colored badges.
- Frontend opt-in toggle "Replace API token" so users can update the
  Cloudflare API token without accidentally clearing it on every edit.
- `make bump PART=patch|minor|major` and `make release` targets that read/write
  `.version` (the single source of truth for the project version).
- `.github/workflows/ci.yml` running backend lint, schema validation,
  frontend lint, and frontend build on PRs.
- `CONTRIBUTING.md` documenting yarn as the canonical package manager,
  the `.version` SoT, and `make bump`/`make release` workflow.

### Changed
- `cloudflare_api_token` is now write-only — never returned by GET. Existing
  rows render an empty token in the modal until the user explicitly opts in
  to replacing it.
- `internalCloudflareDdns.{create,update,delete,enable,disable,trigger,getAll,startAllEnabled}`
  are now async functions; they `await` child-process start/stop instead of
  firing-and-forgetting.
- `stop()` waits for the process to exit (with SIGKILL escalation after 5s)
  and is `await`ed by all callers (`update`, `delete`, `disable`,
  `startAllEnabled`, and the SIGTERM/SIGINT shutdown handler).
- SIGTERM/SIGINT now run a graceful shutdown that stops all running
  `cloudflare-ddns` child processes before closing the HTTP server, with a
  10s force-exit safety net.
- Frontend `CloudflareDdnsModal` uses `useMutation` `isPending` instead of a
  hand-rolled `useState` flag.
- Removed dead `setSearch("")` side effect in `TableWrapper.tsx` and added
  error detail to the trigger-failed toast.
- DDNS migrations renamed from `20260301...` to `20260228...` to match the
  convention of dates ≤ today.
- `yarn` is the canonical package manager; `package-lock.json` files removed
  and `**/package-lock.json` added to `.gitignore`.
- All `scripts/*` shell scripts upgraded to `set -euo pipefail`.
- Dockerfile now fails loudly if `frontend/dist` is missing, with a hint to
  run `make frontend` first.
- Dropped fragile substring heuristics on `cloudflare-ddns` stdout/stderr
  that previously tried to detect success/error by looking for "Updated" or
  "error" — these could be false-positive on user-supplied domain names.
  Runtime status now relies on `last_run_at` / `last_run_success` persisted
  to the row.

### Fixed
- `start()` failures (e.g. missing binary) now surface as
  `ValidationError` to the caller instead of silently succeeding.
- Trigger flow no longer overwrites the running scheduled-run state with the
  manual-trigger result; manual triggers have their own `lastTriggerAt` /
  `lastTriggerSuccess` fields.
- `getAll()` no longer emits `GROUP BY id` (broke on Postgres).
- `proxy-host.js` `getAll()` no longer emits `GROUP BY id` either (same bug).
- `trigger()` 60s timeout now correctly `clearTimeout`s on exit and
  escalates to SIGKILL after 5s; the timer no longer leaks.
- Manual trigger failures now show the actual error message in the toast.

## [2.14.0] - 2026-02-28

### Added
- Initial fork of [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager)
  with integrated Cloudflare DDNS support.
- Per-config Cloudflare DDNS process management with cron scheduling.
- React UI at "Cloudflare DDNS" with enable/disable/trigger actions and
  per-row process status.
- IPv4/IPv6 domain splitting and provider configuration.