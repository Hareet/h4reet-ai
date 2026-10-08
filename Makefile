# h4reet.ai: one command per thing agents, the Author, and the gate need (spec 000, plan §4, §9, §11).
# Targets exit non-zero on failure. There is deliberately no `apply` target: Terraform apply is a human action,
# in the protected environment, after the Author approves.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

# The stack (plan §4): prod and dev on the 5090, dev-cpu on the agents' engine.
ENV ?= prod
ifeq ($(filter $(ENV),prod dev dev-cpu),)
$(error ENV must be prod, dev, or dev-cpu, not "$(ENV)")
endif
ifeq ($(ENV),dev-cpu)
ENVFILE := deploy/env.agents/dev-cpu.vars
RUNFILE :=
TREE := .
else
ENVFILE := $(HOME)/.config/h4reet-ai/env/$(ENV).env
# A host stack runs the commit `make up` exported, which its run file names (contracts/env-files.md §12).
# Before the stack's first `make up` there is no run file, and the stack targets say so.
RUNFILE := $(HOME)/.local/state/h4reet/$(ENV)/run.env
TREE := $(shell sed -n 's/^H4_TREE=//p' "$(RUNFILE)" 2>/dev/null)
endif
COMPOSE = docker compose -p h4reet-$(ENV) -f $(TREE)/deploy/compose.yaml --env-file $(ENVFILE)$(if $(RUNFILE), --env-file $(RUNFILE))

# Every Python a recipe runs: isolated, and blind to bytecode an agent could plant, by script path and never with -m
# (research.md R-35). -I alone still loads __pycache__; the empty prefix keeps that out too.
PY_HOST := python3 -I -X pycache_prefix=$$(mktemp -d)

# Node for make's own recipes: the pinned version from nvm, first on PATH, without changing the shell's default
# Node or the Claude Code installed under it (plan §9).
NODE_PIN := $(shell sed -n 's/^NODE_VERSION=//p' .devcontainer/toolchain.vars)
NVM_NODE_BIN := $(wildcard $(or $(NVM_DIR),$(HOME)/.nvm)/versions/node/v$(NODE_PIN)/bin)
ifneq ($(NVM_NODE_BIN),)
export PATH := $(NVM_NODE_BIN):$(PATH)
endif

# Inside the agent sandbox, npm's default cache can't be written (plan §11).
ifeq ($(SANDBOX_RUNTIME),1)
export npm_config_cache := $(or $(TMPDIR),/tmp)/npm-cache
endif
# pytest from the toolchain when present (make tools, the devcontainer); otherwise an ephemeral uv environment.
# uv's default cache is read-only inside the agent sandbox, which made that fallback fail. Only where the
# default cache can't be written (the sandbox) does uv use the session's temporary directory instead.
# Never a cache inside the repository: agents can write there, and the Author's terminal would run its code.
ifeq ($(origin UV_CACHE_DIR),undefined)
UV_SANDBOX_CACHE := $(shell d="$${XDG_CACHE_HOME:-$$HOME/.cache}/uv"; mkdir -p "$$d" 2>/dev/null; [ -w "$$d" ] || echo "$${TMPDIR:-/tmp}/uv-cache")
ifneq ($(UV_SANDBOX_CACHE),)
export UV_CACHE_DIR := $(UV_SANDBOX_CACHE)
endif
endif
# The fallback pins the system interpreter and skips uv's config files: a planted .venv (gitignored) or uv.toml is
# agent-writable, and without these flags uv would run or obey it in the Author's terminal.
PYTEST := $(shell command -v pytest >/dev/null 2>&1 && echo pytest || echo uv run --no-project --no-config --python "$$(command -v python3)" --quiet --with pytest==9.1.1 --with pyyaml==6.0.3 pytest)
PYTEST_ARGS := -q -p no:cacheprovider --import-mode=importlib
PYTEST_DIRS := $(wildcard corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts)

# npm runs a workspace script only once a workspace exists; with none, it fails with "No workspaces found".
WORKSPACES := $(wildcard services/*/package.json)
NPM_WS = $(if $(WORKSPACES),npm $(1) --workspaces --if-present,@echo "npm $(1): no workspaces yet")
# Every tracked shell script but Spec Kit's vendored ones (ruff skips .specify/ the same way), and the git hooks.
SHELL_SCRIPTS := $(shell git ls-files '*.sh' | grep -v '^\.specify/') $(wildcard .claude/git-hooks/*)

# Removed by the early patch when it adds the pre-commit hook (tasks.md T045, T046).
PRE_COMMIT_PLANNED := T045

# make check's gates, in order (plan §11). label=target runs another target under the gate's name; @Tnnn names the
# task that adds the target, so its absence is SKIP rather than FAIL.
CHECK_GATES := githooks-check toolchain-check policy@T037 validate-config@T019 lint test secrets@T091 evals redteam=redteam-suite matrix image@T036

help: ## List the targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

setup: ## Install the workspace's dependencies, then the git hooks (the devcontainer runs this)
	npm ci --ignore-scripts
	@$(MAKE) --no-print-directory git-hooks

tools: ## (the Author) Install the pinned host tools where agents can't write: Node, pytest, gitleaks, the lint toolchain
	bash tools/gates/install-tools.sh

toolchain-check: ## Compare the installed tools with .devcontainer/toolchain.vars (ADR 0018)
	$(PY_HOST) tools/gates/toolchain_check.py

check: ## Every local gate (FR-041): PASS, FAIL, SKIP, PENDING, or PLANNED for each, then a summary
	@$(PY_HOST) tools/gates/run_checks.py $(CHECK_GATES)

githooks-check: ## The git hooks are installed and match .claude/git-hooks/, and main is a loose ref (plan §11)
	@hooks="$$(git rev-parse --git-path hooks)"; ok=1; \
	if [ -n "$${CI:-}" ]; then echo "SKIP: git hooks aren't installed in CI"; exit 0; fi; \
	if cmp -s .claude/git-hooks/reference-transaction "$$hooks/reference-transaction" \
	  && [ -z "$$(git config --get core.hooksPath)" ] && [ "$$(git config --get gc.packRefs)" = false ]; then \
	  echo "reference-transaction: installed"; \
	else echo "reference-transaction: missing, modified, or bypassed: run make git-hooks" >&2; ok=0; fi; \
	if [ -f .claude/git-hooks/pre-commit ]; then \
	  if cmp -s .claude/git-hooks/pre-commit "$$hooks/pre-commit"; then echo "pre-commit: installed"; \
	  else echo "pre-commit: missing or modified: run make git-hooks" >&2; ok=0; fi; \
	elif [ -n "$(PRE_COMMIT_PLANNED)" ]; then \
	  echo "PLANNED ($(PRE_COMMIT_PLANNED)): .claude/git-hooks/pre-commit arrives with the early patch"; \
	else echo "pre-commit: .claude/git-hooks/pre-commit is missing" >&2; ok=0; fi; \
	if [ -f "$$(git rev-parse --git-path refs/heads/main)" ]; then echo "main: a loose ref, which the git hook guards"; \
	elif git show-ref --verify --quiet refs/heads/main; then echo "main: packed, out of the git hook's reach" >&2; ok=0; \
	else echo "main: no such branch in this clone"; fi; \
	[ "$$ok" = 1 ]

git-hooks: ## Install the git hooks that keep main the Author's, once per clone (ADR 0013)
	@hooks="$$(git rev-parse --git-path hooks)"; \
	if [ ! -w "$$hooks" ]; then echo "git hooks: $$hooks isn't writable here (the agent sandbox); the Author runs make git-hooks"; exit 0; fi; \
	install -m 0755 .claude/git-hooks/reference-transaction "$$hooks/reference-transaction"; \
	if [ -f .claude/git-hooks/pre-commit ]; then install -m 0755 .claude/git-hooks/pre-commit "$$hooks/pre-commit"; fi; \
	git config gc.packRefs false; \
	echo "git hooks: installed in $$hooks"

build: ## Build the workspaces, and the compose images once deploy/compose.yaml exists; prints BUILD OK
	$(call NPM_WS,run build)
	@if [ -f deploy/compose.yaml ]; then docker compose -f deploy/compose.yaml build; else echo "compose images: none yet (tasks.md T029, T036)"; fi
	@echo BUILD OK

lint: ## Zero warnings: ESLint, tsc, Prettier, ruff, shellcheck (plan §9)
	@[ -x node_modules/.bin/eslint ] || { echo "node_modules is missing: run make setup" >&2; exit 1; }
	node_modules/.bin/eslint --max-warnings 0 .
	$(call NPM_WS,run typecheck)
	node_modules/.bin/prettier --check .
	ruff check .
	@# corpus/ is human-authored and agents can't edit it, so ruff lints it but doesn't hold it to ruff's format.
	ruff format --check --no-cache --exclude corpus .
	shellcheck $(SHELL_SCRIPTS)

fmt: ## Format what Prettier and ruff own (not the human-authored documents or the corpus)
	node_modules/.bin/prettier --write .
	ruff format --no-cache --exclude corpus .

# The file name arrives in the environment and is read by the shell as "$$FILE", never as $(FILE):
# make would expand $(...) inside it. Call these as FILE=path make fmt-file, not make fmt-file FILE=path.
fmt-file: ## Format one file: FILE=path make fmt-file
	@case "$$FILE" in *.ts|*.tsx|*.js|*.json|*.md) npx prettier --write "$$FILE" >/dev/null ;; *.py) ruff format "$$FILE" >/dev/null ;; esac

lint-file: ## Lint one file: FILE=path make lint-file
	@case "$$FILE" in *.ts|*.tsx|*.js) npx eslint "$$FILE" ;; *.py) ruff check "$$FILE" ;; *.sh) shellcheck "$$FILE" ;; esac

test: corpus-check ## Every test: the corpus gate, the workspaces' tests, and pytest
	$(call NPM_WS,test)
	$(PYTEST) $(PYTEST_ARGS) $(PYTEST_DIRS)

test-fast: ## The quick subset
	$(call NPM_WS,run test:unit)
	$(PYTEST) $(PYTEST_ARGS) -m "not slow" $(PYTEST_DIRS)

corpus-check: ## Public-corpus gate: attested facts slots, no amounts, the local denylist
	$(PY_HOST) corpus/tools/check_corpus.py

evals: ## The product evals (ADAPTER=fake; local and bedrock are the Author's) and the agent-config static tier
	@case "$${ADAPTER:-fake}" in fake) ;; \
	  local|bedrock) if [ "$${SANDBOX_RUNTIME:-}" = 1 ]; then echo "ADAPTER=$$ADAPTER runs in the Author's terminal" >&2; exit 2; fi ;; \
	  *) echo "ADAPTER must be fake, local, or bedrock" >&2; exit 2 ;; esac
	$(PY_HOST) evals/run.py --suite product --adapter $${ADAPTER:-fake} $$([ "$${ADAPTER:-}" = local ] && echo --stack $(ENV))
	$(PY_HOST) evals/agent-config/static.py

redteam: redteam-suite matrix ## The red-team suite and the forbidden-action matrix (plan §13, §14)

redteam-suite: ## The adversarial scaffold alone (plan §14)
	$(PY_HOST) redteam/run.py

matrix: ## The forbidden-action matrix alone (plan §13)
	bash redteam/forbidden-actions.sh

up down logs status pull pin-images init-env isolation-check: ## The stack targets arrive with feat/000-foundations
	@echo "make $@ arrives with feat/000-foundations (tasks.md T032 to T036, plan §4)" >&2; exit 2

breach-test: ## The kill-switch rehearsal on dev or dev-cpu, which arrives with feat/000-us2-kill-switch
	@echo "make breach-test arrives with feat/000-us2-kill-switch (tasks.md T080)" >&2; exit 2

plan: ## Terraform plan for ENV (never apply from here); infra/ arrives with spec 001
	cd infra && terraform init -input=false && terraform workspace select $(ENV) && terraform plan -input=false -out=tf.plan

.PHONY: help setup tools toolchain-check check githooks-check git-hooks build lint fmt fmt-file lint-file test test-fast \
	corpus-check evals redteam redteam-suite matrix up down logs status pull pin-images init-env isolation-check \
	breach-test plan
