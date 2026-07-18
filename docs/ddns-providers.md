# Supported DNS Providers

The DDNS integration in this fork is powered by
[qdm12/ddns-updater](https://github.com/qdm12/ddns-updater), which supports 50+
DNS providers. Below is a curated list of providers with the credentials each
one requires.

> **Note:** The backend (`backend/internal/ddns-config-builder.js`) and the
> frontend (`frontend/src/lib/ddnsProviders.ts`) define which fields each
> provider needs. Adding a new provider in the frontend list improves the UI;
> unknown providers fall through to a "pass-through" mode where the operator
> supplies raw JSON.

## Common providers

| Provider | Required credentials |
| --- | --- |
| Cloudflare | API token (`api_token`), Zone ID (`zone_identifier`), optional Proxied + TTL |
| DuckDNS | Token |
| Namecheap | Dynamic DNS password |
| No-IP | Password |
| Dynu | Password |
| Selfhost.de | Password |
| GoDaddy | Key + Secret |
| Dreamhost | API key |
| Gandi | API key |
| Hetzner (legacy DNS) | API token |
| Hetzner Cloud | API token |
| AWS Route 53 | Access Key ID + Secret Access Key + Hosted Zone ID |
| Google Cloud DNS | Project + DNS Zone Name + Service Account JSON |

## Other supported providers (raw JSON config)

The following providers are supported by qdm12/ddns-updater but their UI doesn't
have dedicated field schemas. The config_json field accepts raw JSON to pass
through to the binary — refer to qdm12/ddns-updater's documentation for the
exact field names.

- Aliyun
- AllInkl
- ChangeIP
- DD24
- DDNSS.de
- deSEC
- DigitalOcean
- DNSOMatic
- DNSPod
- Domeneshop
- DonDominio
- DynDNS
- DynV6
- EasyDNS
- FreeDNS
- GoIP.de
- HE.net
- Infomaniak
- INWX
- Ionos
- ipv64
- Linode
- Loopia
- LuaDNS
- Myaddr
- Name.com
- NameSilo
- Netcup
- Njalla
- Now-DNS
- OpenDNS
- OVH
- Porkbun
- Scaleway
- Servercow.de
- Spaceship
- Spdyn
- Strato.de
- Variomedia.de
- Vercel
- Vultr
- Zoneedit

## Per-provider examples

### Cloudflare

```json
{
  "settings": [
    {
      "provider": "cloudflare",
      "domain": "home.example.com",
      "ip_version": "ipv4",
      "token": "<your-api-token>",
      "zone_identifier": "<your-zone-id>",
      "proxied": true,
      "ttl": 1
    }
  ]
}
```

### DuckDNS

```json
{
  "settings": [
    {
      "provider": "duckdns",
      "domain": "myhome.duckdns.org",
      "ip_version": "ipv4",
      "token": "<your-duckdns-token>"
    }
  ]
}
```

### Namecheap

```json
{
  "settings": [
    {
      "provider": "namecheap",
      "domain": "home.example.com",
      "ip_version": "ipv4",
      "password": "<dynamic-dns-password>"
    }
  ]
}
```

### AWS Route 53

```json
{
  "settings": [
    {
      "provider": "route53",
      "domain": "home.example.com",
      "ip_version": "ipv4",
      "access_key_id": "<aws-access-key>",
      "secret_access_key": "<aws-secret>",
      "zone_identifier": "<hosted-zone-id>"
    }
  ]
}
```

## Caveats

- The **global cron** is shared by all DDNS configs. If you want different
  crons for different configs, run multiple containers (one per cron value).
- IPv6 support depends on your host having an IPv6 address reachable by the
  ddns-updater binary's public IP detection.
- AWS / GCP / Azure providers need network egress to their respective APIs.
- Credentials are write-only: GET responses strip the values. To update a
  secret you must explicitly check "Replace existing value" in the modal.
