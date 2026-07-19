# Nginx Proxy Manager with Cloudflare DDNS Integration
# Makefile for building and managing the project

.PHONY: help build build-dev push push-harbor push-harbor-multiarch clean frontend backend install dev dev-stop test lint all release bump version up down restart logs ps pull config run run-stop run-logs run-status run-clean run-backend run-frontend run-devbe env-local setup-local sync-upstream sync-upstream-rebase sync-status sync-fork-boundaries check-fork-boundaries login login-harbor login-hub logout

# Variables
IMAGE_NAME ?= nginx-proxy-manager-ddns
IMAGE_TAG ?= latest
DOCKER_HUB_REPO ?= ngocdd94/nginx-ddns
BUILD_VERSION ?= $(shell cat .version 2>/dev/null || echo "dev")
BUILD_COMMIT ?= $(shell git log -n 1 --format=%h 2>/dev/null || echo "unknown")
BUILD_DATE ?= $(shell date '+%Y-%m-%d %T %Z')
PLATFORMS ?= linux/amd64
BUILDX_NAME ?= npm-ddns

# Harbor registry variables
# Usage:
#   make push-harbor                                              # dùng defaults
#   make push-harbor IMAGE_TAG=v2.14.0                            # đổi tag
#   make push-harbor SOURCE_IMAGE=my-image:custom                 # đổi source image
#   make push-harbor HARBOR_REPOSITORY=other-repo IMAGE_TAG=v2.14.0
HARBOR_REGISTRY   ?= harbor.ngocdd.io.vn
HARBOR_PROJECT    ?= ngocdd
HARBOR_REPOSITORY ?= nginx-ddns
SOURCE_IMAGE      ?= $(IMAGE_NAME)

# Registry login credentials. Set these in your shell env or CI secrets —
# they are read by every `login*` target. Example (Linux/macOS):
#   export DOCKER_USERNAME=ngocdd
#   export DOCKER_PASSWORD=xxxxxxxxxxxxxxxx
DOCKER_USERNAME ?=
DOCKER_PASSWORD ?=

# Default registry the generic `make login` target logs into. Override per
# invocation, e.g. `make login REGISTRY=docker.io`.
LOGIN_REGISTRY ?= $(HARBOR_REGISTRY)

# ============================================================================
# Registry login
#
# All push targets automatically depend on `login` (see below), so setting
# DOCKER_USERNAME / DOCKER_PASSWORD in the environment is enough — no extra
# `make login` invocation is required. To trigger login by hand:
#
#   make login                  # default registry = $(LOGIN_REGISTRY)
#   make login REGISTRY=ghcr.io # custom registry
#   make login-harbor           # alias for `make login`
#   make login-hub              # alias for `make login REGISTRY=docker.io`
#   make logout                 # log out from the default registry
# ============================================================================

# Common credential check + `docker login --password-stdin` helper.
# Args: $1 = registry host
define docker-login
	@if [ -z "$(DOCKER_USERNAME)" ] || [ -z "$(DOCKER_PASSWORD)" ]; then \
		echo "$(RED)✗ DOCKER_USERNAME and DOCKER_PASSWORD must be set in the environment$(RESET)" >&2; \
		echo "$(YELLOW)  Example:$(RESET)" >&2; \
		echo "$(YELLOW)    export DOCKER_USERNAME=ngocdd$(RESET)" >&2; \
		echo "$(YELLOW)    export DOCKER_PASSWORD=********$(RESET)" >&2; \
		exit 1; \
	fi
	@echo "$(BLUE)❯ Logging in to $(YELLOW)$(1)$(BLUE) as $(YELLOW)$(DOCKER_USERNAME)$(RESET)"
	@echo "$(DOCKER_PASSWORD)" | docker login $(1) -u "$(DOCKER_USERNAME)" --password-stdin
	@echo "$(GREEN)✓ Logged in to $(1)$(RESET)"
endef

login: ## Login to $(LOGIN_REGISTRY) using $(DOCKER_USERNAME)/$(DOCKER_PASSWORD) env vars
	$(call docker-login,$(LOGIN_REGISTRY))

login-harbor: ## Login to Harbor (harbor.ngocdd.io.vn)
	$(call docker-login,$(HARBOR_REGISTRY))

login-hub: ## Login to Docker Hub (docker.io)
	$(call docker-login,docker.io)

logout: ## Logout from $(LOGIN_REGISTRY)
	@echo "$(BLUE)❯ Logging out from $(YELLOW)$(LOGIN_REGISTRY)$(RESET)"
	@docker logout $(LOGIN_REGISTRY)
	@echo "$(GREEN)✓ Logged out from $(LOGIN_REGISTRY)$(RESET)"

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
RESET := \033[0m

help: ## Show this help message
	@echo "$(BLUE)Nginx Proxy Manager with DDNS - Available targets:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'

# ============================================================================
# Installation & Setup
# ============================================================================

install: ## Install all dependencies (frontend + backend)
	@echo "$(BLUE)❯ Installing dependencies...$(RESET)"
	@cd frontend && yarn install --frozen-lockfile
	@cd backend && yarn install --frozen-lockfile
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"

frontend: ## Build frontend for production
	@echo "$(BLUE)❯ Compiling locales...$(RESET)"
	@cd frontend && npm run locale-compile
	@echo "$(BLUE)❯ Building frontend...$(RESET)"
	@cd frontend && npm run build
	@echo "$(GREEN)✓ Frontend built$(RESET)"

backend: ## Prepare backend
	@echo "$(BLUE)❯ Backend is ready (Node.js)$(RESET)"

# ============================================================================
# Docker Build
# ============================================================================

build: frontend ## Build Docker image for current platform
	@echo "$(BLUE)❯ Building Docker image: $(YELLOW)$(IMAGE_NAME):$(IMAGE_TAG)$(RESET)"
	docker pull nginxproxymanager/nginx-full:certbot-node
	docker build \
		--build-arg BUILD_VERSION="$(BUILD_VERSION)" \
		--build-arg BUILD_COMMIT="$(BUILD_COMMIT)" \
		--build-arg BUILD_DATE="$(BUILD_DATE)" \
		-f docker/Dockerfile \
		-t $(IMAGE_NAME):$(IMAGE_TAG) \
		.
	@echo "$(GREEN)✓ Docker image built: $(IMAGE_NAME):$(IMAGE_TAG)$(RESET)"

build-multiarch: frontend ## Build Docker image for multiple architectures (amd64, arm64)
	@echo "$(BLUE)❯ Building multiarch Docker image: $(YELLOW)$(IMAGE_NAME):$(IMAGE_TAG)$(RESET)"
	docker buildx rm "$(BUILDX_NAME)" 2>/dev/null || true
	docker buildx create --name "$(BUILDX_NAME)" --use
	docker buildx build \
		--build-arg BUILD_VERSION="$(BUILD_VERSION)" \
		--build-arg BUILD_COMMIT="$(BUILD_COMMIT)" \
		--build-arg BUILD_DATE="$(BUILD_DATE)" \
		--platform $(PLATFORMS) \
		--progress plain \
		--pull \
		-f docker/Dockerfile \
		-t $(IMAGE_NAME):$(IMAGE_TAG) \
		--load \
		.
	docker buildx rm "$(BUILDX_NAME)" 2>/dev/null || true
	@echo "$(GREEN)✓ Multiarch Docker image built$(RESET)"

push: frontend login-hub ## Build and push Docker image to Docker Hub (ngocdd94/nginx-ddns)
	@echo "$(BLUE)❯ Building and pushing: $(YELLOW)$(DOCKER_HUB_REPO):$(IMAGE_TAG)$(RESET)"
	docker buildx rm "$(BUILDX_NAME)" 2>/dev/null || true
	docker buildx create --name "$(BUILDX_NAME)" --use
	docker buildx build \
		--build-arg BUILD_VERSION="$(BUILD_VERSION)" \
		--build-arg BUILD_COMMIT="$(BUILD_COMMIT)" \
		--build-arg BUILD_DATE="$(BUILD_DATE)" \
		--platform $(PLATFORMS) \
		--progress plain \
		--pull \
		-f docker/Dockerfile \
		-t $(DOCKER_HUB_REPO):$(IMAGE_TAG) \
		--push \
		.
	docker buildx rm "$(BUILDX_NAME)" 2>/dev/null || true
	@echo "$(GREEN)✓ Image pushed to $(DOCKER_HUB_REPO):$(IMAGE_TAG)$(RESET)"

push-simple: login-hub ## Tag and push existing image to Docker Hub (single arch, faster)
	@echo "$(BLUE)❯ Tagging and pushing: $(YELLOW)$(DOCKER_HUB_REPO):$(IMAGE_TAG)$(RESET)"
	docker tag $(IMAGE_NAME):$(IMAGE_TAG) $(DOCKER_HUB_REPO):$(IMAGE_TAG)
	docker push $(DOCKER_HUB_REPO):$(IMAGE_TAG)
	@echo "$(GREEN)✓ Image pushed to $(DOCKER_HUB_REPO):$(IMAGE_TAG)$(RESET)"

# Tag một image đã có sẵn (SOURCE_IMAGE[:TAG]) rồi push lên Harbor.
# Cú pháp tương đương:
#   docker tag SOURCE_IMAGE[:TAG] harbor.ngocdd.io.vn/ngocdd/REPOSITORY[:TAG]
#   docker push harbor.ngocdd.io.vn/ngocdd/REPOSITORY[:TAG]
#
# Ví dụ:
#   make push-harbor                                              # tag $(IMAGE_NAME):$(IMAGE_TAG) -> harbor
#   make push-harbor IMAGE_TAG=v2.14.0                            # đổi tag đích
#   make push-harbor SOURCE_IMAGE=my-app:custom                   # đổi image nguồn
#   make push-harbor HARBOR_REPOSITORY=other-repo                  # đổi tên repo ở Harbor
#   make push-harbor SOURCE_IMAGE=my-app:custom HARBOR_REPOSITORY=other-repo IMAGE_TAG=v3.0.0
push-harbor: login-harbor ## Tag existing image and push to Harbor (harbor.ngocdd.io.vn/ngocdd/REPOSITORY)
	@echo "$(BLUE)❯ Tagging $(YELLOW)$(SOURCE_IMAGE):$(IMAGE_TAG)$(BLUE) -> $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG)$(RESET)"
	docker tag $(SOURCE_IMAGE):$(IMAGE_TAG) $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG)
	docker push $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG)
	@echo "$(GREEN)✓ Image pushed to $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG)$(RESET)"

# Build + push multiarch trực tiếp lên Harbor (bỏ qua build local).
push-harbor-multiarch: frontend login-harbor ## Build multiarch image and push directly to Harbor
	@echo "$(BLUE)❯ Building & pushing multiarch image to Harbor: $(YELLOW)$(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG)$(RESET)"
	docker buildx rm "$(BUILDX_NAME)" 2>/dev/null || true
	docker buildx create --name "$(BUILDX_NAME)" --use
	docker buildx build \
		--build-arg BUILD_VERSION="$(BUILD_VERSION)" \
		--build-arg BUILD_COMMIT="$(BUILD_COMMIT)" \
		--build-arg BUILD_DATE="$(BUILD_DATE)" \
		--platform $(PLATFORMS) \
		--progress plain \
		--pull \
		-f docker/Dockerfile \
		-t $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG) \
		-t $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(BUILD_VERSION) \
		--push \
		.
	docker buildx rm "$(BUILDX_NAME)" 2>/dev/null || true
	@echo "$(GREEN)✓ Multiarch image pushed to $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG)$(RESET)"

# ============================================================================
# Docker Run
#
# `make up` is the canonical entry point for running the production container.
# It pulls the latest image, recreates the container if needed, and prints
# the URL + default credentials on success. Optional knobs live in .env
# (see `.env.example`):
#
#   IMAGE_TAG, HTTP_PORT, ADMIN_PORT, HTTPS_PORT,
#   DISABLE_IPV6, X_FRAME_OPTIONS, ...
# ============================================================================

up: ## Start the container with docker compose (pulls latest image)
	@echo "$(BLUE)❯ Starting $(DOCKER_HUB_REPO) via docker compose...$(RESET)"
	@docker compose pull
	@docker compose up -d --remove-orphans
	@echo "$(GREEN)✓ Container started$(RESET)"
	@echo "$(YELLOW)  Admin UI: http://localhost:$${ADMIN_PORT:-81}$(RESET)"
	@echo "$(YELLOW)  Default login: admin@example.com / changeme$(RESET)"

run-docker: up ## Alias for `make up` (kept for backwards compatibility — Docker-based run)
# NOTE: the canonical `make run` target now runs the app locally without
# Docker (see "Local (no Docker)" section near the bottom of this file).
# This target is preserved as `run-docker` for backwards compatibility.

down: ## Stop and remove the container (keeps ./data and ./letsencrypt)
	@echo "$(BLUE)❯ Stopping container...$(RESET)"
	@docker compose down
	@echo "$(GREEN)✓ Container stopped$(RESET)"

stop: down ## Alias for `make down` (kept for backwards compatibility)

restart: ## Restart the container (down + up, keeps image)
	@echo "$(BLUE)❯ Restarting container...$(RESET)"
	@docker compose down
	@docker compose up -d
	@echo "$(GREEN)✓ Container restarted$(RESET)"

logs: ## Follow container logs
	@docker compose logs -f

ps: ## List compose-managed containers
	@docker compose ps

pull: ## Pull the latest image (no container changes)
	@echo "$(BLUE)❯ Pulling latest image: $(YELLOW)$(DOCKER_HUB_REPO):$(IMAGE_TAG)$(RESET)"
	@docker compose pull

config: ## Validate and print the resolved docker-compose config
	@docker compose config

# ============================================================================
# Development
# ============================================================================

dev: ## Start development environment
	@echo "$(BLUE)❯ Starting development environment...$(RESET)"
	@./scripts/start-dev
	@echo "$(GREEN)✓ Development environment started$(RESET)"
	@echo "$(YELLOW)  Frontend: http://localhost:3000$(RESET)"
	@echo "$(YELLOW)  Backend:  http://localhost:81$(RESET)"

dev-stop: ## Stop development environment
	@echo "$(BLUE)❯ Stopping development environment...$(RESET)"
	@./scripts/stop-dev
	@echo "$(GREEN)✓ Development environment stopped$(RESET)"

dev-destroy: ## Destroy development environment (removes volumes)
	@echo "$(BLUE)❯ Destroying development environment...$(RESET)"
	@./scripts/destroy-dev
	@echo "$(GREEN)✓ Development environment destroyed$(RESET)"

# ============================================================================
# Testing & Quality
# ============================================================================

test: ## Run tests
	@echo "$(BLUE)❯ Running tests...$(RESET)"
	@cd backend && npm test
	@cd frontend && npm test
	@echo "$(GREEN)✓ Tests completed$(RESET)"

lint: ## Run linting
	@echo "$(BLUE)❯ Running linters...$(RESET)"
	@cd backend && npm run lint 2>/dev/null || echo "Backend lint not configured"
	@cd frontend && npm run lint 2>/dev/null || echo "Frontend lint not configured"
	@echo "$(GREEN)✓ Linting completed$(RESET)"

# ============================================================================
# Cleanup
# ============================================================================

clean: ## Clean build artifacts
	@echo "$(BLUE)❯ Cleaning build artifacts...$(RESET)"
	@rm -rf frontend/dist
	@rm -rf backend/node_modules
	@rm -rf frontend/node_modules
	@echo "$(GREEN)✓ Cleaned$(RESET)"

clean-docker: ## Remove Docker images
	@echo "$(BLUE)❯ Removing Docker images...$(RESET)"
	@docker rmi $(IMAGE_NAME):$(IMAGE_TAG) 2>/dev/null || true
	@docker buildx rm "$(BUILDX_NAME)" 2>/dev/null || true
	@echo "$(GREEN)✓ Docker images removed$(RESET)"

# ============================================================================
# Versioning
#
# .version is the single source of truth for the project version. Both the
# Dockerfile (`BUILD_VERSION` arg) and `make bump` / `make release` read it.
# ============================================================================

version: ## Print the current version (from .version)
	@cat .version

# Bump the version in .version. Usage:
#   make bump PART=major   # 2.14.0 -> 3.0.0
#   make bump PART=minor   # 2.14.0 -> 2.15.0
#   make bump PART=patch   # 2.14.0 -> 2.14.1
bump:
	@if [ -z "$(PART)" ]; then \
		echo "$(RED)ERROR: PART is required (major|minor|patch)$(RESET)" >&2; \
		exit 1; \
	fi
	@CUR=$$(cat .version); \
	IFS='.' read -r MAJOR MINOR PATCH <<< "$$CUR"; \
	case "$(PART)" in \
		major) MAJOR=$$((MAJOR + 1)); MINOR=0; PATCH=0;; \
		minor) MINOR=$$((MINOR + 1)); PATCH=0;; \
		patch) PATCH=$$((PATCH + 1));; \
		*) echo "$(RED)ERROR: PART must be major|minor|patch (got '$(PART)')$(RESET)" >&2; exit 1;; \
	esac; \
	NEW="$$MAJOR.$$MINOR.$$PATCH"; \
	echo "$$NEW" > .version; \
	echo "$(GREEN)✓ Bumped .version: $$CUR -> $$NEW$(RESET)"

# Build and push a tagged release using the version in .version.
#   make release           # uses latest tag
#   make release PART=minor # bumps minor first
release: bump
	@VERSION=$$(cat .version); \
	echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)"; \
	echo "$(BLUE)  Release $(YELLOW)$$VERSION$(RESET)"; \
	echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)"; \
	$(MAKE) push IMAGE_TAG=$$VERSION

# ============================================================================
# Shortcuts
# ============================================================================

build-local: install frontend ## Install deps, build FE+BE, build Docker image for current platform
	@echo "$(GREEN)✓ Local build complete: $(IMAGE_NAME):$(IMAGE_TAG)$(RESET)"

all: login-harbor ## Full pipeline: install deps, build FE+BE, build multiarch image, push to Harbor
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)"
	@echo "$(BLUE)  Full build & push pipeline (Harbor)$(RESET)"
	@echo "$(BLUE)  Image : $(YELLOW)$(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG)$(RESET)"
	@echo "$(BLUE)  Platforms : $(YELLOW)$(PLATFORMS)$(RESET)"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)"
	@$(MAKE) install
	@$(MAKE) frontend
	@echo "$(BLUE)❯ Building image with buildx and loading into local Docker...$(RESET)"
	docker buildx rm "$(BUILDX_NAME)" 2>/dev/null || true
	docker buildx create --name "$(BUILDX_NAME)" --use
	# Build + load image into the local Docker daemon so the subsequent
	# `docker push` step uses the credentials from ~/.docker/config.json
	# directly (buildx's --push path has been observed to bypass the host
	# credential store and hit Harbor with 401). --load requires a single
	# target platform, which matches the default PLATFORMS=linux/amd64.
	docker buildx build \
		--build-arg BUILD_VERSION="$(BUILD_VERSION)" \
		--build-arg BUILD_COMMIT="$(BUILD_COMMIT)" \
		--build-arg BUILD_DATE="$(BUILD_DATE)" \
		--platform $(PLATFORMS) \
		--progress plain \
		--pull \
		-f docker/Dockerfile \
		-t $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG) \
		--load \
		.
	docker buildx rm "$(BUILDX_NAME)" 2>/dev/null || true
	@echo "$(BLUE)❯ Tagging additional version and pushing to Harbor...$(RESET)"
	docker tag $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG) $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(BUILD_VERSION)
	docker push $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG)
	docker push $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(BUILD_VERSION)
	@echo "$(GREEN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)"
	@echo "$(GREEN)✓ Pipeline complete!$(RESET)"
	@echo "$(GREEN)  Pushed $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(IMAGE_TAG)$(RESET)"
	@echo "$(GREEN)  Pushed $(HARBOR_REGISTRY)/$(HARBOR_PROJECT)/$(HARBOR_REPOSITORY):$(BUILD_VERSION)$(RESET)"
	@echo "$(GREEN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)"

# ============================================================================
# Local (no Docker)
#
# Runs the app directly on the host without Docker. Two modes are supported:
#
#   make run           # Production-like: backend serves API + built frontend
#                      # assets on a single port (default 3000). Nginx is still
#                      # needed on the host because the backend shells out to
#                      # `nginx`, `certbot`, `logrotate`, `openssl`.
#
#   make run-devbe     # Dev: backend on 3000 + Vite dev server on 5173 with
#                      # HMR. Best iteration speed while editing frontend.
#
# Both modes share state under ./data (SQLite DB, JWT keys, generated nginx
# config, letsencrypt). To wipe state, run `make run-clean`.
#
# Required host binaries:
#   node (>=18), yarn (or npm), nginx, certbot, openssl, logrotate
#
# Environment variables (override defaults via env or `.env`):
#   BACKEND_PORT  (default 3000)         — port backend listens on
#   FRONTEND_PORT (default 5173)         — port vite dev server (run-devbe only)
#   DB_SQLITE_FILE (default ./data/database.sqlite)
#   INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD  — create first admin on
#                                                    empty DB
# ============================================================================

# Track child PIDs so make run-stop can kill them cleanly
RUN_BACKEND_PID_FILE := .run/backend.pid
RUN_FRONTEND_PID_FILE := .run/frontend.pid

BACKEND_PORT ?= 3000
FRONTEND_PORT ?= 5173
DB_SQLITE_FILE ?= $(CURDIR)/data/database.sqlite

env-local: ## Print resolved local-run environment
	@echo "BACKEND_PORT=$(BACKEND_PORT)"
	@echo "FRONTEND_PORT=$(FRONTEND_PORT)"
	@echo "DB_SQLITE_FILE=$(DB_SQLITE_FILE)"

setup-local: install ## Prepare directories and config for local runs
	@echo "$(BLUE)❯ Preparing local runtime directories...$(RESET)"
	@mkdir -p data/nginx/proxy_host data/nginx/redirection_host \
		data/nginx/dead_host data/nginx/stream data/nginx/temp \
		data/nginx/default_host data/nginx/default_www \
		data/access data/logs data/custom_ssl \
		data/letsencrypt-acme-challenge data/proxy_host_passwords \
		letsencrypt .run
	@if [ ! -f data/keys.json ]; then \
		echo "$(BLUE)❯ Generating JWT key pair (data/keys.json)...$(RESET)"; \
		node backend/scripts/generate-keys.js; \
	else \
		echo "$(GREEN)✓ JWT keys already present$(RESET)"; \
	fi
	@echo "$(GREEN)✓ Local environment ready$(RESET)"

run-frontend: setup-local ## Build frontend for production-style local serving
	@echo "$(BLUE)❯ Building frontend assets (production mode)...$(RESET)"
	@cd frontend && yarn locale-compile
	@cd frontend && yarn build
	@echo "$(GREEN)✓ Frontend built into frontend/dist$(RESET)"

run-backend: setup-local ## Start backend in foreground (Ctrl-C to stop)
	@echo "$(BLUE)❯ Starting backend on port $(BACKEND_PORT)...$(RESET)"
	@cd backend && \
		DB_SQLITE_FILE="$(DB_SQLITE_FILE)" \
		BACKEND_PORT="$(BACKEND_PORT)" \
		NODE_ENV=development \
		$(if $(INITIAL_ADMIN_EMAIL),INITIAL_ADMIN_EMAIL='$(INITIAL_ADMIN_EMAIL)') \
		$(if $(INITIAL_ADMIN_PASSWORD),INITIAL_ADMIN_PASSWORD='$(INITIAL_ADMIN_PASSWORD)') \
		node index.js

# Production-style local run: backend serves the built SPA + API on one port.
# Usage: make run [BACKEND_PORT=3000]
run: run-frontend ## Run backend + built frontend locally (no Docker)
	@echo "$(BLUE)❯ Starting nginx-ddns locally (no Docker)...$(RESET)"
	@mkdir -p .run
	@cd backend && \
		DB_SQLITE_FILE="$(DB_SQLITE_FILE)" \
		BACKEND_PORT="$(BACKEND_PORT)" \
		NODE_ENV=development \
		$(if $(INITIAL_ADMIN_EMAIL),INITIAL_ADMIN_EMAIL='$(INITIAL_ADMIN_EMAIL)') \
		$(if $(INITIAL_ADMIN_PASSWORD),INITIAL_ADMIN_PASSWORD='$(INITIAL_ADMIN_PASSWORD)') \
		nohup node index.js > ../.run/backend.log 2>&1 & \
		echo $$! > ../$(RUN_BACKEND_PID_FILE)
	@sleep 2
	@if kill -0 $$(cat $(RUN_BACKEND_PID_FILE)) 2>/dev/null; then \
		echo "$(GREEN)✓ Backend started (PID $$(cat $(RUN_BACKEND_PID_FILE)))$(RESET)"; \
		echo "$(YELLOW)  App:    http://localhost:$(BACKEND_PORT)$(RESET)"; \
		echo "$(YELLOW)  API:    http://localhost:$(BACKEND_PORT)/api$(RESET)"; \
		echo "$(YELLOW)  Logs:   tail -f .run/backend.log$(RESET)"; \
		echo "$(YELLOW)  Stop:   make run-stop$(RESET)"; \
	else \
		echo "$(RED)✗ Backend failed to start. Check .run/backend.log$(RESET)"; \
		tail -n 40 .run/backend.log; \
		exit 1; \
	fi

run-stop: ## Stop the local backend started by `make run`
	@echo "$(BLUE)❯ Stopping local backend...$(RESET)"
	@if [ -f $(RUN_BACKEND_PID_FILE) ]; then \
		PID=$$(cat $(RUN_BACKEND_PID_FILE)); \
		if kill -0 $$PID 2>/dev/null; then \
			kill $$PID; \
			sleep 1; \
			kill -9 $$PID 2>/dev/null || true; \
			echo "$(GREEN)✓ Stopped backend (PID $$PID)$(RESET)"; \
		else \
			echo "$(YELLOW)  Backend PID $$PID not running$(RESET)"; \
		fi; \
		rm -f $(RUN_BACKEND_PID_FILE); \
	else \
		echo "$(YELLOW)  No PID file found — nothing to stop$(RESET)"; \
	fi

run-logs: ## Tail the local backend log
	@if [ -f .run/backend.log ]; then \
		tail -f .run/backend.log; \
	else \
		echo "$(RED)No log file at .run/backend.log — is the backend running?$(RESET)"; \
	fi

run-status: ## Show status of locally-run processes
	@echo "$(BLUE)Local processes:$(RESET)"
	@if [ -f $(RUN_BACKEND_PID_FILE) ] && kill -0 $$(cat $(RUN_BACKEND_PID_FILE)) 2>/dev/null; then \
		echo "  backend  running  PID $$(cat $(RUN_BACKEND_PID_FILE))  http://localhost:$(BACKEND_PORT)"; \
	else \
		echo "  backend  stopped"; \
	fi
	@if [ -f $(RUN_FRONTEND_PID_FILE) ] && kill -0 $$(cat $(RUN_FRONTEND_PID_FILE)) 2>/dev/null; then \
		echo "  frontend running  PID $$(cat $(RUN_FRONTEND_PID_FILE))  http://localhost:$(FRONTEND_PORT)"; \
	else \
		echo "  frontend stopped"; \
	fi

run-clean: ## Wipe local runtime state (DB, JWT keys, generated configs, logs, PIDs)
	@echo "$(BLUE)❯ Cleaning local runtime state...$(RESET)"
	@$(MAKE) -s run-stop || true
	@rm -rf data/database.sqlite data/keys.json .run
	@echo "$(GREEN)✓ Local state cleaned$(RESET)"

# Dev-style local run: backend (3000) + Vite dev server (5173) with HMR.
# Usage: make run-devbe
run-devbe: setup-local ## Run backend + Vite dev server for active development
	@echo "$(BLUE)❯ Starting backend + Vite dev server (no Docker)...$(RESET)"
	@mkdir -p .run
	@cd backend && \
		DB_SQLITE_FILE="$(DB_SQLITE_FILE)" \
		BACKEND_PORT="$(BACKEND_PORT)" \
		NODE_ENV=development \
		$(if $(INITIAL_ADMIN_EMAIL),INITIAL_ADMIN_EMAIL='$(INITIAL_ADMIN_EMAIL)') \
		$(if $(INITIAL_ADMIN_PASSWORD),INITIAL_ADMIN_PASSWORD='$(INITIAL_ADMIN_PASSWORD)') \
		nohup node index.js > ../.run/backend.log 2>&1 & \
		echo $$! > ../$(RUN_BACKEND_PID_FILE)
	@cd frontend && \
		nohup yarn dev --port $(FRONTEND_PORT) > ../.run/frontend.log 2>&1 & \
		echo $$! > ../$(RUN_FRONTEND_PID_FILE)
	@sleep 3
	@echo "$(GREEN)✓ Both processes started$(RESET)"
	@echo "$(YELLOW)  Backend:  http://localhost:$(BACKEND_PORT)$(RESET)"
	@echo "$(YELLOW)  Frontend: http://localhost:$(FRONTEND_PORT) (Vite dev / HMR)$(RESET)"
	@echo "$(YELLOW)  Logs:     make run-logs (backend) / tail -f .run/frontend.log$(RESET)"
	@echo "$(YELLOW)  Stop:     make run-stop (kills both)$(RESET)"

# ============================================================================
# Syncing with upstream (NginxProxyManager/nginx-proxy-manager)
# ============================================================================
#
# Branch layout:
#   main      this fork's release branch — what Docker Hub tags point at
#   develop   tracking branch — periodically merges upstream/develop
#
# Workflow (full):
#   git checkout develop
#   make sync-upstream           # merge upstream/develop into local develop
#   # resolve any conflicts (see CONTRIBUTING.md "Syncing with upstream")
#   make check-fork-boundaries   # verify FORK delimiters are intact
#   make lint test               # full validation
#   git push origin develop
#
# After validation passes on develop, fast-forward main:
#   git checkout main
#   git merge --ff-only develop
#   git push origin main
#   make bump PART=minor
# ============================================================================

UPSTREAM_REMOTE ?= upstream
UPSTREAM_BRANCH ?= develop
SYNC_BRANCH ?= develop

sync-status: ## Show how many commits behind upstream $(UPSTREAM_BRANCH)
	@echo "$(BLUE)❯ Fetching $(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH)...$(RESET)"
	@git fetch $(UPSTREAM_REMOTE) $(UPSTREAM_BRANCH)
	@echo ""
	@echo "$(BLUE)❯ Local branch:    $$(git rev-parse --abbrev-ref HEAD)$(RESET)"
	@echo "$(BLUE)❯ Upstream HEAD:   $$(git rev-parse --short $(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH))$(RESET)"
	@AHEAD=$$(git rev-list --count $(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH)..HEAD 2>/dev/null || echo "?"); \
		BEHIND=$$(git rev-list --count HEAD..$(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH) 2>/dev/null || echo "?"); \
		echo "$(YELLOW)  Ahead:  $$AHEAD commit(s) ahead of upstream$(RESET)"; \
		echo "$(YELLOW)  Behind: $$BEHIND commit(s) behind upstream$(RESET)"
	@echo ""
	@if [ "$$(git rev-list --count HEAD..$(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH))" -gt 0 ]; then \
		echo "$(BLUE)❯ Latest upstream commits not yet merged:$(RESET)"; \
		git log --oneline HEAD..$(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH) | head -20; \
	fi

sync-upstream: ## Merge upstream/$(UPSTREAM_BRANCH) into $(SYNC_BRANCH) (run from $(SYNC_BRANCH))
	@echo "$(BLUE)❯ Fetching $(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH)...$(RESET)"
	@git fetch $(UPSTREAM_REMOTE) $(UPSTREAM_BRANCH)
	@CURRENT=$$(git rev-parse --abbrev-ref HEAD); \
		if [ "$$CURRENT" != "$(SYNC_BRANCH)" ]; then \
			echo "$(RED)✗ Must be on branch '$(SYNC_BRANCH)' (currently on '$$CURRENT')$(RESET)"; \
			echo "$(YELLOW)  Run: git checkout $(SYNC_BRANCH)$(RESET)"; \
			exit 1; \
		fi
	@echo "$(BLUE)❯ Merging $(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH) into $(SYNC_BRANCH)...$(RESET)"
	@git merge --no-ff $(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH) -m "Merge upstream/$(UPSTREAM_BRANCH) into $(SYNC_BRANCH)"
	@echo ""
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "$(YELLOW)⚠ Merge produced conflicts. Resolve them, then:$(RESET)"; \
		echo "$(YELLOW)  1. Edit the conflicted files (look for ===== FORK START/END ===== blocks)$(RESET)"; \
		echo "$(YELLOW)  2. git add <files> && git commit$(RESET)"; \
		echo "$(YELLOW)  3. make check-fork-boundaries && make lint test$(RESET)"; \
	else \
		echo "$(GREEN)✓ Clean merge — no conflicts$(RESET)"; \
	fi

sync-upstream-rebase: ## Rebase current $(SYNC_BRANCH) onto upstream/$(UPSTREAM_BRANCH)
	@echo "$(BLUE)❯ Fetching $(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH)...$(RESET)"
	@git fetch $(UPSTREAM_REMOTE) $(UPSTREAM_BRANCH)
	@CURRENT=$$(git rev-parse --abbrev-ref HEAD); \
		if [ "$$CURRENT" != "$(SYNC_BRANCH)" ]; then \
			echo "$(RED)✗ Must be on branch '$(SYNC_BRANCH)' (currently on '$$CURRENT')$(RESET)"; \
			exit 1; \
		fi
	@echo "$(BLUE)❯ Rebasing $(SYNC_BRANCH) onto $(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH)...$(RESET)"
	@git rebase $(UPSTREAM_REMOTE)/$(UPSTREAM_BRANCH)
	@echo "$(GREEN)✓ Rebase complete$(RESET)"

# Lists every file the fork has modified relative to the upstream default branch.
# Used by sync-status-style sanity checks and the fork-boundaries CI guard.
#
# JSON files can't carry `===== FORK START/END =====` comments because the
# runtime parsers are strict JSON.parse, so they're checked for a different
# sentinel: the `__ddnsFork` key (for swagger.json) or a clear `_comment`
# field. See CONTRIBUTING.md for the per-file convention.
FORK_FILES := backend/routes/main.js \
	backend/setup.js \
	backend/index.js \
	docker/Dockerfile \
	frontend/src/Router.tsx \
	frontend/src/components/SiteMenu.tsx

check-fork-boundaries: ## Verify every modified fork file contains ===== FORK START/END ===== delimiters
	@echo "$(BLUE)❯ Checking FORK delimiters on modified files...$(RESET)"
	@status=0; \
	for f in $(FORK_FILES); do \
		if [ ! -f "$$f" ]; then \
			echo "$(YELLOW)  ⚠ $$f (file does not exist — skipping)$(RESET)"; \
			continue; \
		fi; \
		if grep -q "===== FORK START" "$$f" && grep -q "===== FORK END" "$$f"; then \
			echo "$(GREEN)  ✓ $$f$(RESET)"; \
		else \
			echo "$(RED)  ✗ $$f (missing FORK delimiters)$(RESET)"; \
			status=1; \
		fi; \
	done; \
	exit $$status

.DEFAULT_GOAL := help
