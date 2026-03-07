<p align="center">
	<img src="https://nginxproxymanager.com/github.png">
	<br><br>
	<img src="https://img.shields.io/badge/version-2.14.0--ddns-green.svg?style=for-the-badge">
</p>

# Nginx Proxy Manager with Cloudflare DDNS

A fork of [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) with **integrated Cloudflare Dynamic DNS** support. Manage your reverse proxy hosts and automatically update your Cloudflare DNS records when your IP address changes - all from a single, beautiful web interface.

## ✨ Features

### Original NPM Features
- 🎨 Beautiful and Secure Admin Interface based on [Tabler](https://tabler.github.io/)
- 🔀 Easily create forwarding domains, redirections, streams and 404 hosts
- 🔒 Free SSL using Let's Encrypt or custom SSL certificates
- 🛡️ Access Lists and basic HTTP Authentication
- ⚙️ Advanced Nginx configuration for power users
- 👥 User management, permissions and audit log

### New DDNS Features
- ☁️ **Cloudflare DDNS Integration** - Built-in Dynamic DNS updater for Cloudflare
- 🌐 **Domains with Proxy** - Specify domains that use Cloudflare's proxy (CDN/WAF)
- 🔓 **Domains without Proxy** - Specify domains with direct DNS (no Cloudflare proxy)
- 🕐 **Flexible Update Schedule** - Configure update intervals using cron expressions
- 📊 **Process Monitoring** - View DDNS process status directly in the UI
- 🔄 **IPv4 & IPv6 Support** - Separate domain configurations for A and AAAA records

## 📸 Screenshots

### DDNS Configuration
The new Cloudflare DDNS menu allows you to:
- Configure multiple DDNS entries
- Set domains with and without Cloudflare proxy
- Monitor running DDNS processes
- View update status and logs

## 🚀 Quick Setup

### Using Docker Compose (Recommended)

1. Create a `docker-compose.yml` file:

```yaml
services:
  npm-ddns:
    image: ngocdd94/nginx-ddns:latest  # Local image (or ngocdd94/nginx-ddns:latest for Docker Hub)
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
    # environment:
    #   DB_SQLITE_FILE: "/data/database.sqlite"
    #   DISABLE_IPV6: "false"
    #   X_FRAME_OPTIONS: "deny"
    healthcheck:
      test: ["CMD", "/usr/bin/check-health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

2. Start the container:

```bash
docker compose up -d
```

3. Access the Admin UI at [http://localhost:81](http://localhost:81)

**Default credentials:**
- Email: `admin@example.com`
- Password: `changeme`

## 🔧 Building from Source

### Prerequisites
- Docker with BuildKit support
- Node.js 18+ and npm
- Make

### Build Commands

```bash
# Show all available commands
make help

# Install dependencies
make install

# Build frontend
make frontend

# Build Docker image (current platform)
make build

# Build multi-arch Docker image (amd64 + arm64)
make build-multiarch

# Build and push to Docker Hub (ngocdd94/nginx-ddns)
make push

# Push with custom tag
make push IMAGE_TAG=v1.0.0
```

### Development

```bash
# Start development environment
make dev

# Stop development environment
make dev-stop

# Run tests
make test
```

## ☁️ Cloudflare DDNS Configuration

### Setting Up DDNS

1. Navigate to **Cloudflare DDNS** in the admin menu
2. Click **Add DDNS Configuration**
3. Configure your settings:

| Field | Description |
|-------|-------------|
| **Configuration Name** | A friendly name for this DDNS entry |
| **Cloudflare API Token** | Token with `Zone:DNS:Edit` permissions |
| **Domains with Proxy** | Domains using Cloudflare proxy (comma-separated) |
| **Domains without Proxy** | Domains with direct DNS (comma-separated) |
| **Update Schedule** | Cron expression (e.g., `@every 5m`) |

### Cloudflare API Token

Create a token at [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) with:
- **Permissions:** Zone → DNS → Edit
- **Zone Resources:** Include → Specific zone → Your domain

### Domain Configuration Examples

**Web servers (with proxy):**
```
www.example.com, app.example.com
```

**Direct services (without proxy):**
```
mail.example.com
```

### Update Schedule Examples

| Expression | Description |
|------------|-------------|
| `@every 5m` | Every 5 minutes |
| `@every 1h` | Every hour |
| `@every 30s` | Every 30 seconds |
| `0 */6 * * *` | Every 6 hours |

## 🏠 Home Network Setup

1. **Port Forwarding:** Forward ports 80 and 443 to your NPM server
2. **Domain Setup:** Point your domain to your home IP (via Cloudflare)
3. **DDNS Configuration:** Set up Cloudflare DDNS in NPM to automatically update your IP
4. **Proxy Hosts:** Create proxy hosts for your internal services

## 🛠️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_SQLITE_FILE` | SQLite database path | `/data/database.sqlite` |
| `DISABLE_IPV6` | Disable IPv6 support | `false` |
| `X_FRAME_OPTIONS` | X-Frame-Options header | `deny` |

## 📁 Project Structure

```
nginx-ddns/
├── backend/           # Node.js backend with DDNS integration
│   ├── internal/      # Internal modules (including ddns-process.js)
│   ├── models/        # Database models
│   ├── routes/        # API routes
│   └── migrations/    # Database migrations
├── frontend/          # React frontend with DDNS UI
│   ├── src/
│   │   ├── pages/CloudflareDdns/   # DDNS page components
│   │   └── modals/CloudflareDdnsModal.tsx
├── docker/            # Docker configuration
├── scripts/           # Build and dev scripts
└── Makefile          # Build automation
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) - The original project
- [Cloudflare DDNS](https://github.com/favonia/cloudflare-ddns) - DDNS implementation inspiration
- All contributors to both projects

## 📞 Support

- [GitHub Issues](https://github.com/your-repo/nginx-ddns/issues) - Bug reports and feature requests
- [Discussions](https://github.com/your-repo/nginx-ddns/discussions) - Questions and community support
