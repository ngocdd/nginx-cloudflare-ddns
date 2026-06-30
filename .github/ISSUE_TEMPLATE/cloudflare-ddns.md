---
name: Cloudflare DDNS issue
about: Problems with the Cloudflare DDNS integration
title: "[DDNS] "
labels: ddns
assignees: ''
---

<!--
Before opening a ticket, please:

1. Confirm the `cloudflare-ddns` binary is installed in your container:
   `docker exec <container> which cloudflare-ddns`
   It should print `/usr/local/bin/cloudflare-ddns`.

2. Hit the runtime status endpoint:
   `curl -b "<your-session-cookie>" http://localhost:81/api/cloudflare-ddns/status | jq`
   Look at `binary.available`, each config's `process_status.state`, and any
   `failed` entries.

3. Check the relevant container logs for `[DDNS #N]` lines:
   `docker logs <container> | grep "DDNS #"`
-->

**Cloudflare DDNS Config ID(s)**

<!-- From the URL in the admin UI or `cloudflare_ddns.id` in the DB. -->

**Checklist**

- [ ] `which cloudflare-ddns` succeeds inside the container
- [ ] `/api/cloudflare-ddns/status` returns `binary.available: true`
- [ ] The config's `process_status.state` is `running-ok` or `running-pending`
- [ ] I have searched existing issues (open and closed)

**What `process_status.state` do you see?**
<!-- e.g. missing-binary / broken / running-failed / stopped / never-started -->

**Describe what's happening**

<!-- Be specific: is the process not starting, the trigger failing, the UI
showing the wrong timestamp? -->

**Steps to reproduce**

1.
2.
3.

**Relevant log lines**

<!-- Paste any `[DDNS #N]` lines from `docker logs`. Mask your API token! -->

**Container image**

<!-- e.g. `ngocdd94/nginx-ddns:2.14.0` or your custom build commit -->

**Anything else**

<!-- DNS provider, network setup, IPv6 only, etc. -->