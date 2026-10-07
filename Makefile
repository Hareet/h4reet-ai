# h4reet.ai — one command per thing Claude and CI need. Targets exit non-zero on failure.
# There is deliberately no `apply` target: Terraform apply runs in the protected CI environment after the Author approves.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
ENV ?= local
FILE ?=

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

setup: ## Install toolchain deps (devcontainer already has them)
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
	npm run lint --workspaces && ruff check . && shellcheck .claude/hooks/*.sh

fmt: ## Format everything
	npm run fmt --workspaces && ruff format .

fmt-file: ## Format one file (used by the post-edit hook): make fmt-file FILE=path
	@case "$(FILE)" in *.ts|*.tsx|*.js|*.json|*.md) npx prettier --write "$(FILE)" >/dev/null ;; *.py) ruff format "$(FILE)" >/dev/null ;; esac

lint-file: ## Lint one file (used by the post-edit hook): make lint-file FILE=path
	@case "$(FILE)" in *.ts|*.tsx|*.js) npx eslint "$(FILE)" ;; *.py) ruff check "$(FILE)" ;; *.sh) shellcheck "$(FILE)" ;; esac

evals: ## Product evals (twin, gateway) against the configured adapter; agent-config evals when .claude changed
	python -m evals.run --suite product --adapter $${ADAPTER:-local}
	@if git diff --quiet HEAD -- CLAUDE.md REVIEW.md .claude; then :; else python -m evals.run --suite agent-config; fi

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

.PHONY: help setup build corpus-check test test-fast lint fmt fmt-file lint-file evals redteam up down plan breach-test
