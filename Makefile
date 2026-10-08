# h4reet.ai — one command per thing Claude and CI need. Targets exit non-zero on failure.
# There is deliberately no `apply` target: Terraform apply runs in the protected CI environment after the Author approves.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
ENV ?= local
# pytest from the toolchain when present (the devcontainer); otherwise an ephemeral uv environment.
# uv's default cache (~/.cache/uv) is read-only inside the agent sandbox, so uv caches inside the
# repository instead (.cache/ is gitignored). A UV_CACHE_DIR already set in the environment wins.
export UV_CACHE_DIR ?= $(CURDIR)/.cache/uv
PYTEST :=$(shell command -v pytest >/dev/null 2>&1 && echo pytest || echo uv run --no-project --quiet --with pytest --with pyyaml pytest)

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

setup: git-hooks ## Install toolchain deps (devcontainer already has them)
	npm ci && pip install -r requirements.txt --break-system-packages
	pre-commit install

build: ## Build all packages and container images; prints BUILD OK
	npm run build --workspaces && docker compose -f deploy/compose.yaml build
	@echo BUILD OK

test: corpus-check ## Full test suite (includes corpus-check)
	npm test --workspaces && pytest -q

test-fast: ## Pre-commit subset
	npm run test:unit --workspaces && pytest -q -m "not slow"

corpus-check: ## Public-corpus gate: attested facts slots, no amounts, local denylist
	python3 corpus/tools/check_corpus.py

lint: ## Zero warnings or fail
	npm run lint --workspaces && ruff check . && shellcheck .claude/hooks/*.sh redteam/forbidden-actions.sh

git-hooks: ## Install the git hook that keeps main the Author's, once per clone (ADR 0013)
	install -m 0755 .claude/git-hooks/reference-transaction "$$(git rev-parse --git-path hooks)/reference-transaction"
	git config gc.packRefs false

check: corpus-check ## Every gate that runs today, before spec 000 adds the rest: git hook, tests, lint, hook matrix
	@hook="$$(git rev-parse --git-path hooks)/reference-transaction"; \
	if cmp -s .claude/git-hooks/reference-transaction "$$hook" && [ -z "$$(git config --get core.hooksPath)" ] \
	  && [ "$$(git config --get gc.packRefs)" = false ]; then echo "git hook guarding main: installed"; \
	elif [ -n "$${CI:-}" ]; then echo "git hook guarding main: not checked in CI"; \
	else echo "git hook guarding main: missing, modified, or bypassed; run make git-hooks" >&2; exit 1; fi
	$(PYTEST) -q -p no:cacheprovider corpus/tools
	ruff check .
	shellcheck .claude/hooks/*.sh redteam/forbidden-actions.sh
	bash redteam/forbidden-actions.sh

fmt: ## Format everything
	npm run fmt --workspaces && ruff format .

# The file name arrives in the environment and is read by the shell as "$$FILE", never as $(FILE):
# make would expand $(...) inside it. Call these as FILE=path make fmt-file, not make fmt-file FILE=path.
fmt-file: ## Format one file: FILE=path make fmt-file
	@case "$$FILE" in *.ts|*.tsx|*.js|*.json|*.md) npx prettier --write "$$FILE" >/dev/null ;; *.py) ruff format "$$FILE" >/dev/null ;; esac

lint-file: ## Lint one file: FILE=path make lint-file
	@case "$$FILE" in *.ts|*.tsx|*.js) npx eslint "$$FILE" ;; *.py) ruff check "$$FILE" ;; *.sh) shellcheck "$$FILE" ;; esac

evals: ## Product evals (twin, gateway) against the configured adapter; agent-config evals when .claude changed
	python -m evals.run --suite product --adapter $${ADAPTER:-local}
	@# Compared with main's merge base, so changes already committed on the branch count too (FR-011).
	@base="$$(git merge-base HEAD main 2>/dev/null || git rev-parse HEAD)"; \
	if git diff --quiet "$$base" -- CLAUDE.md REVIEW.md .claude; then :; else python -m evals.run --suite agent-config; fi

redteam: ## Adversarial suite + forbidden-action matrix
	python -m redteam.run && bash redteam/forbidden-actions.sh

up: ## Whole production topology on this machine, local models (ENV=local|dev|staging|prod)
	docker compose -f deploy/compose.yaml --env-file deploy/env/$(ENV).env up -d --wait

down: ## Stop the stack
	docker compose -f deploy/compose.yaml --env-file deploy/env/$(ENV).env down

plan: ## Terraform plan for ENV (never apply from here)
	cd infra && terraform init -input=false && terraform workspace select $(ENV) && terraform plan -input=false -out=tf.plan

breach-test: ## Synthetic budget breach against dev; asserts every step of spec 000 US1
	@[ "$(ENV)" = "dev" ] || { echo "breach-test runs against dev only (ENV=dev)"; exit 1; }
	python -m evals.breach --env dev

.PHONY: help setup git-hooks build corpus-check test test-fast lint check fmt fmt-file lint-file evals redteam up down plan breach-test
