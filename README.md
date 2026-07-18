<p align="center">
	<img src="https://nginxproxymanager.com/github.png">
	<br><br>
	<img src="https://img.shields.io/badge/version-2.15.0--ddns-green.svg?style=for-the-badge">
</p>

# Nginx Proxy Manager with DDNS

A fork of [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager)
with **integrated multi-provider Dynamic DNS** support. Manage your reverse proxy
hosts and automatically update DNS records when your IP address changes — all from
a single, beautiful web interface.

Powered by [qdm12/ddns-updater](https://github.com/qdm12/ddns-updater).

## ✨ Features

### Original NPM Features
- 🎨 Beautiful and Secure Admin Interface based on [Tabler](https://tabler.github.io/)
- 🔀 Easily create forwarding domains, redirections, streams and 404 hosts
- 🔒 Free SSL using Let's Encrypt or custom SSL certificates
- 🛡️ Access Lists and basic HTTP Authentication
- ⚙️ Advanced Nginx configuration for power users
- 👥 User management, permissions and audit log

### DDNS Features (new in this fork)
- 🌐 **50+ DNS providers** out of the box — Cloudflare, Namecheap, DuckDNS, GoDaddy,
  Route53, Hetzner, Gandi, GCP, and many more (see [docs/ddns-providers.md](docs/ddns-providers.md))
- 🔐 **Provider-agnostic schema** — each row stores one (provider, domain) pair
- 🕐 **Global cron** — all configs share a single ddns-updater process (configurable
  via `DDNS_GLOBAL_CRON` env var, default `@every 5m`)
- 📊 **Runtime monitoring** — view per-config process status, last run, last trigger
  directly in the UI
- 🔄 **Manual trigger** — run a single update on demand
- 🔒 **Write-only credentials** — secrets are never echoed back in GET responses
- 🌐 **IPv4 + IPv6** — choose A or AAAA per config

## 🚀 Quick Setup

### Using Docker Compose (Recommended)

```yaml
services:
  npm-ddns:
    image: ngocdd94/nginx-ddns:latest
    container_name: npm-ddns
    pull_policy: always
    restart: unless-stopped
    ports:
      - '80:80'     # HTTP
      - '81:81'     # Admin UI
      - '443:443'   # HTTPS
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    environment:
      DB_SQLITE_FILE: "/data/database.sqlite"
      DISABLE_IPV6: "false"
      X_FRAME_OPTIONS: "deny"
      # Optional: override the default update cron (defaults to @every 5m)
      # DDNS_GLOBAL_CRON: "@every 2m"
      # Optional: log level for the ddns-updater child process (debug|info|warn|error)
      # DDNS_LOG_LEVEL: "info"
    healthcheck:
      test: ["CMD", "/usr/bin/check-health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

```bash
docker compose up -d
```

Visit the Admin UI at [http://localhost:81](http://localhost:81) and navigate to
**DDNS**.

**Default credentials:**
- Email: `admin@example.com`
- Password: `changeme`

## 🔧 Building from Source

```bash
make help        # list available targets
make install     # install backend + frontend deps
make frontend    # build frontend (writes to frontend/dist)
make build       # build Docker image
make check-fork-boundaries  # verify FORK delimiter integrity
```

## ☁️ DDNS Configuration

1. Navigate to **DDNS** in the admin menu
2. Click **Add DDNS Configuration**
3. Fill in:
   - **Configuration Name** — friendly label
   - **Provider** — pick from the dropdown (Cloudflare, Namecheap, DuckDNS, …)
   - **Domain** — single FQDN this entry manages
   - **IP Version** — IPv4 (A) or IPv6 (AAAA)
   - **Provider Configuration** — provider-specific credentials (API token,
     password, key+secret, etc.)

Per-provider field schemas are defined in
[`frontend/src/lib/ddnsProviders.ts`](frontend/src/lib/ddnsProviders.ts).

### Example: Cloudflare

| Field | Value |
|-------|-------|
| API Token | Token with Zone:DNS:Edit |
| Zone ID | Cloudflare Zone ID |
| Proxied | true / false |
| TTL | 1 = automatic |

Create a Cloudflare API token at
[Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
with:
- **Permissions:** Zone → DNS → Edit
- **Zone Resources:** Include → Specific zone → Your domain

### Example: DuckDNS

| Field | Value |
|-------|-------|
| Token | DuckDNS API token (UUID) |

The DuckDNS domain you manage is entered in the **Domain** field
(e.g. `home.duckdns.org`).

### Example: Namecheap

| Field | Value |
|-------|-------|
| Dynamic DNS Password | From Namecheap dashboard |

See [docs/ddns-providers.md](docs/ddns-providers.md) for the full list and the
fields each provider requires.

## 🏠 Home Network Setup

1. **Port Forwarding:** Forward ports 80 and 443 to your NPM server
2. **Domain Setup:** Point your domain at your home IP via a supported DNS provider
3. **DDNS Configuration:** Create a DDNS config in NPM to keep the IP updated
4. **Proxy Hosts:** Create proxy hosts for your internal services

## 🛠️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_SQLITE_FILE` | SQLite database path | `/data/database.sqlite` |
| `DISABLE_IPV6` | Disable IPv6 support | `false` |
| `X_FRAME_OPTIONS` | X-Frame-Options header | `deny` |
| `DDNS_GLOBAL_CRON` | Cron for the ddns-updater process | `@every 5m` |
| `DDNS_LOG_LEVEL` | Log level for the ddns-updater child | `info` |
| `DDNS_CONFIG_DIR` | Where the binary reads/writes config.json + updates.json | `/data/ddns` |

## 🔍 Verifying DDNS at runtime

```bash
# Health check
docker exec <container> which ddns-updater
# /usr/local/bin/ddns-updater

# Status endpoint (requires session cookie from /api/tokens)
curl -s -b "your-session-cookie" http://localhost:81/api/ddns/status | jq
```

A healthy response:
```json
{
  "binary": { "available": true, "error": null },
  "total": 3,
  "enabled": 3,
  "running": 1,
  "failed": [],
  "statuses": { ... }
}
```

If `binary.available` is `false`, the `ddns-updater` binary is missing from the
image — check the Dockerfile build step.

## 🔄 Syncing with upstream

This fork tracks upstream Nginx Proxy Manager's `develop` branch. See
[CONTRIBUTING.md → Syncing with upstream](CONTRIBUTING.md#syncing-with-upstream)
for the workflow.

```bash
make sync-status        # show how many commits behind upstream
make sync-upstream      # merge upstream/develop into local develop
make check-fork-boundaries  # verify FORK delimiters survived
```

## 📁 Project Structure

```
nginx-ddns/
├── backend/
│   ├── internal/
│   │   ├── ddns-config.js         # CRUD
│   │   ├── ddns-config-builder.js # pure DB rows → qdm12 JSON config
│   │   └── ddns-manager.js        # child process lifecycle
│   ├── models/ddns_config.js
│   ├── routes/ddns.js             # /api/ddns/*
│   ├── schema/paths/ddns/         # request/response schemas
│   └── migrations/
│       ├── 20260718000000_ddns_configs.js                # schema
│       ├── 20260718000001_ddns_migrate_cloudflare.js     # data
│       └── 20260718000002_ddns_drop_cloudflare_legacy.js  # table drop
├── frontend/
│   ├── src/api/backend/{create,get,getList,update,delete,toggle,trigger}DdnsConfig.ts
│   ├── src/hooks/useDdnsConfig{,List}.ts
│   ├── src/lib/ddnsProviders.ts
│   ├── src/pages/DdnsConfig/
│   ├── src/modals/DdnsConfigModal.tsx
│   └── src/locale/src/en.json   # ddns-config.* keys
├── docker/Dockerfile            # FROM ghcr.io/qdm12/ddns-updater
└── Makefile                      # sync-upstream, check-fork-boundaries, …
```

## 📝 License

MIT — see [LICENSE](LICENSE).

## 🙏 Acknowledgments

- [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager)
  — the original project this fork extends
- [qdm12/ddns-updater](https://github.com/qdm12/ddns-updater)
  — the Go-based DDNS binary that powers 50+ provider integrations
- [favonia/cloudflare-ddns](https://github.com/favonia/cloudflare-ddns)
  — the original Cloudflare-only binary that inspired the first iteration of
  this fork
- All contributors to both projects
