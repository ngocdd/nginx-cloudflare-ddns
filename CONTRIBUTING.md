# Contributing

Thanks for your interest in improving `nginx-ddns`! This fork extends
[Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager)
with an integrated Cloudflare DDNS feature.

## Ground rules

- This is a fork, not a rewrite. Keep the upstream NPM behavior intact unless
  the change is required to support the DDNS integration.
- Bug reports for upstream Nginx Proxy Manager components (Nginx, certificate
  issuance, base UI without DDNS) belong at
  [NginxProxyManager/nginx-proxy-manager](https://github.com/NginxProxyManager/nginx-proxy-manager),
  not here.
- For DDNS-specific bugs, please use the
  [Cloudflare DDNS issue template](.github/ISSUE_TEMPLATE/cloudflare-ddns.md).

## Development setup

Prerequisites:
- Docker with BuildKit
- Node.js 20+
- Yarn (canonical — see "Package manager" below)

```bash
# Install deps
make install

# Build the frontend for production
make frontend

# Start the dev stack (Postgres + DNSRouter + StepCA + fullstack)
make dev

# Stop it
make dev-stop

# Tear it down (removes volumes)
make dev-destroy

# Run tests + lint
make test
make lint
```

The backend listens on `:3000`, the dev proxy on `:3081`, the docs on `:3081`
alongside, and the swagger UI on `:3001`.

## Package manager

This project uses **yarn** as the canonical package manager:
- `yarn.lock` is the source of truth for dependency versions.
- The Dockerfile runs `yarn install --frozen-lockfile`.
- The CI workflow runs `yarn install --frozen-lockfile`.
- `make install` runs `yarn install --frozen-lockfile`.

`package-lock.json` is gitignored. Don't add it.

## Versioning

`.version` is the single source of truth for the project version. Both the
Docker build (`BUILD_VERSION` arg) and the `make bump` / `make release` targets
read from this file.

To bump the version:

```bash
make bump PART=patch   # 2.14.0 -> 2.14.1
make bump PART=minor   # 2.14.0 -> 2.15.0
make bump PART=major   # 2.14.0 -> 3.0.0
```

To cut a release (bumps + builds + pushes the multi-arch image):

```bash
make release PART=minor
```

This writes the new version to `.version` and then runs `make push` with that
version as the image tag.

## Project layout

```
backend/
  internal/
    cloudflare-ddns.js   # CRUD + lifecycle for the DDNS feature
    ddns-process.js      # Spawns/stops child cloudflare-ddns binaries
  migrations/            # Knex migrations (newest at the bottom)
  models/                # Objection models
  routes/                # Express routes
  schema/                # OpenAPI JSON schemas (used for request validation)

frontend/
  src/
    api/backend.ts       # Backend API client (camelCase mapper)
    pages/CloudflareDdns # DDNS UI page
    modals/              # Edit modals
    locale/lang/en.json  # English source for translations
```

## Backend conventions

- `internal/<feature>.js` follows the upstream pattern of access-controlled
  CRUD over Objection models, returning rows run through `utils.omitRow` so
  `is_deleted` and similar fields never leak.
- Migrations are dated `YYYYMMDDhhmmss_<description>.js`. **Never use a future
  date** — Knex sorts migrations lexically by filename.
- Schema validation uses `ajv` against the JSON schemas in
  `backend/schema/components/`. Run `yarn validate-schema` to check.
- Lint with `yarn lint` (Biome).

## Frontend conventions

- React + TypeScript. State management via `@tanstack/react-query`.
- Form state via `formik`. Mutations via `useMutation`.
- Locale strings live in `frontend/src/locale/lang/<lang>.json`. Reference
  them with `<T id="..." />` from `src/locale`. The English file is the
  source of truth.
- Lint with `yarn lint` (Biome).

## Adding a DDNS migration

```bash
cd backend
# Knex won't run on its own without a config tweak — use a current timestamp.
touch migrations/$(date +%Y%m%d%H%M%S)_my_change.js
```

Write `up` and `down` functions. Keep `up` additive whenever possible to
support rolling back. The model in `models/cloudflare_ddns.js` handles
`boolFields` conversion between SQLite (0/1) and JS (true/false); if you add
a new boolean column, add it to the `boolFields` array too.

## Testing

Backend tests live in `backend/test/` and run via `yarn test`. When adding
DDNS-related logic, add unit tests for the pure helpers (`buildEnv`,
`buildProxiedExpression`) and integration tests for `internalCloudflareDdns`
against a mocked model.

Frontend tests use Vitest and live next to the components.

## Pull request checklist

- [ ] `make lint` passes
- [ ] `make test` passes
- [ ] `yarn validate-schema` passes (backend)
- [ ] `yarn build` succeeds (frontend)
- [ ] New locale keys added to `frontend/src/locale/lang/en.json` (and other
      languages if you can — we accept PRs that add only `en.json` and the
      maintainers will run `yarn locale-compile` for the rest)
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] PR title starts with `[DDNS]` if it's a DDNS-specific change