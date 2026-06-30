# Nginx Proxy Manager with Cloudflare DDNS Integration
# Makefile for building and managing the project

.PHONY: help build build-dev push clean frontend backend install dev dev-stop test lint all release bump version

# Variables
IMAGE_NAME ?= nginx-proxy-manager-ddns
IMAGE_TAG ?= latest
DOCKER_HUB_REPO ?= ngocdd94/nginx-ddns
BUILD_VERSION ?= $(shell cat .version 2>/dev/null || echo "dev")
BUILD_COMMIT ?= $(shell git log -n 1 --format=%h 2>/dev/null || echo "unknown")
BUILD_DATE ?= $(shell date '+%Y-%m-%d %T %Z')
PLATFORMS ?= linux/amd64,linux/arm64
BUILDX_NAME ?= npm-ddns

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

push: frontend ## Build and push Docker image to Docker Hub (ngocdd94/nginx-ddns)
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

push-simple: ## Tag and push existing image to Docker Hub (single arch, faster)
	@echo "$(BLUE)❯ Tagging and pushing: $(YELLOW)$(DOCKER_HUB_REPO):$(IMAGE_TAG)$(RESET)"
	docker tag $(IMAGE_NAME):$(IMAGE_TAG) $(DOCKER_HUB_REPO):$(IMAGE_TAG)
	docker push $(DOCKER_HUB_REPO):$(IMAGE_TAG)
	@echo "$(GREEN)✓ Image pushed to $(DOCKER_HUB_REPO):$(IMAGE_TAG)$(RESET)"

# ============================================================================
# Docker Run
# ============================================================================

run: ## Run the container with docker-compose
	@echo "$(BLUE)❯ Starting container...$(RESET)"
	@docker compose up -d
	@echo "$(GREEN)✓ Container started$(RESET)"
	@echo "$(YELLOW)  Admin UI: http://localhost:81$(RESET)"
	@echo "$(YELLOW)  Default login: admin@example.com / changeme$(RESET)"

stop: ## Stop the container
	@echo "$(BLUE)❯ Stopping container...$(RESET)"
	@docker compose down
	@echo "$(GREEN)✓ Container stopped$(RESET)"

logs: ## Show container logs
	@docker compose logs -f

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

all: ## Full pipeline: install deps, build FE+BE, build multiarch image, push to registry
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)"
	@echo "$(BLUE)  Full build & push pipeline$(RESET)"
	@echo "$(BLUE)  Image : $(YELLOW)$(DOCKER_HUB_REPO):$(IMAGE_TAG)$(RESET)"
	@echo "$(BLUE)  Platforms : $(YELLOW)$(PLATFORMS)$(RESET)"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)"
	@$(MAKE) install
	@$(MAKE) frontend
	@echo "$(BLUE)❯ Building and pushing multiarch image to registry...$(RESET)"
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
		-t $(DOCKER_HUB_REPO):$(BUILD_VERSION) \
		--push \
		.
	docker buildx rm "$(BUILDX_NAME)" 2>/dev/null || true
	@echo "$(GREEN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)"
	@echo "$(GREEN)✓ Pipeline complete!$(RESET)"
	@echo "$(GREEN)  Pushed $(DOCKER_HUB_REPO):$(IMAGE_TAG)$(RESET)"
	@echo "$(GREEN)  Pushed $(DOCKER_HUB_REPO):$(BUILD_VERSION)$(RESET)"
	@echo "$(GREEN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)"

.DEFAULT_GOAL := help
