# This is a Dockerfile intended to be built using `docker buildx`
# for multi-arch support. Building with `docker build` may have unexpected results.

# IMPORTANT: this file assumes the frontend has been built via `make frontend`.
# Building this Dockerfile directly without `frontend/dist/index.html` will
# fail with a clear error (see the sentinel check below). Use the `make build`
# or `make build-multiarch` targets, which build the frontend first.

FROM nginxproxymanager/testca AS testca
# ===== FORK START: ddns binary (currently cloudflare-ddns; will be swapped for qdm12/ddns-updater) =====
FROM favonia/cloudflare-ddns:1.15.0 AS cloudflare-ddns
# ===== FORK END =====
FROM nginxproxymanager/nginx-full:certbot-node

ARG TARGETPLATFORM
ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG BUILD_DATE

# See: https://github.com/just-containers/s6-overlay/blob/master/README.md
ENV SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=1 \
	S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 \
	S6_FIX_ATTRS_HIDDEN=1 \
	S6_KILL_FINISH_MAXTIME=10000 \
	S6_VERBOSITY=1 \
	NODE_ENV=production \
	NPM_BUILD_VERSION="${BUILD_VERSION}" \
	NPM_BUILD_COMMIT="${BUILD_COMMIT}" \
	NPM_BUILD_DATE="${BUILD_DATE}" \
	NODE_OPTIONS="--openssl-legacy-provider"

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends jq logrotate \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# s6 overlay
COPY docker/scripts/install-s6 /tmp/install-s6
RUN /tmp/install-s6 "${TARGETPLATFORM}" && rm -f /tmp/install-s6

# ===== FORK START: ddns binary (currently cloudflare-ddns; will be swapped for qdm12/ddns-updater) =====
# cloudflare-ddns binary (from official Docker image)
COPY --from=cloudflare-ddns /bin/ddns /usr/local/bin/cloudflare-ddns
# ===== FORK END =====

EXPOSE 80 81 443

COPY backend       /app
# Frontend dist is built by `make frontend` before `make build`. If you run
# `docker build` directly without it, fail loudly so the missing build step
# isn't silently discovered at runtime.
COPY frontend/dist /app/frontend
RUN test -f /app/frontend/index.html || (echo "ERROR: frontend/dist is empty or missing. Run 'make frontend' (or 'make build') before 'docker build'." >&2 && false)

WORKDIR /app
RUN yarn install \
	&& yarn cache clean

# add late to limit cache-busting by modifications
COPY docker/rootfs /
COPY --from=testca /home/step/certs/root_ca.crt /etc/ssl/certs/NginxProxyManager.crt

# Remove frontend service not required for prod, dev nginx config as well
RUN rm -rf /etc/s6-overlay/s6-rc.d/user/contents.d/frontend /etc/nginx/conf.d/dev.conf \
	&& chmod 644 /etc/logrotate.d/nginx-proxy-manager

VOLUME [ "/data" ]
ENTRYPOINT [ "/init" ]

LABEL org.label-schema.schema-version="1.0" \
	org.label-schema.license="MIT" \
	org.label-schema.name="nginx-proxy-manager" \
	org.label-schema.description="Docker container for managing Nginx proxy hosts with a simple, powerful interface " \
	org.label-schema.url="https://github.com/jc21/nginx-proxy-manager" \
	org.label-schema.vcs-url="https://github.com/jc21/nginx-proxy-manager.git" \
	org.label-schema.cmd="docker run --rm -ti jc21/nginx-proxy-manager:latest"
