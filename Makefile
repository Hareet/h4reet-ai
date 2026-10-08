# h4reet.ai: one command per thing agents, the Author, and the gate need (spec 000, plan §4, §9, §11).
# Targets exit non-zero on failure. There is deliberately no `apply` target: Terraform apply is a human action,
# in the protected environment, after the Author approves.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

# The stack (plan §4): prod and dev on the 5090, dev-cpu on the agents' engine. Only the command line picks it
# (make up ENV=dev): POSIX shells export ENV to name a startup file, and that must never choose a stack. A stack's
# name in the environment is refused rather than ignored, so `ENV=dev make down` can't act on prod.
ifneq ($(origin ENV),command line)
ifneq ($(filter prod dev dev-cpu,$(ENV)),)
$(error ENV=$(ENV) comes from the environment, which never picks a stack: run make $(MAKECMDGOALS) ENV=$(ENV))
endif
ENV := prod
endif
# Sub-makes get a command-line ENV through MAKEFLAGS; the environment's ENV stays out of every recipe.
unexport ENV
# Exactly one word, and one of the three. $(filter) would read ENV as a pattern, so "%" or "prod junk" would pass.
ifneq ($(filter-out prod dev dev-cpu,$(ENV))$(filter-out 1,$(words $(ENV))),)
$(error ENV must be prod, dev, or dev-cpu, not "$(ENV)")
endif
ifeq ($(ENV),dev-cpu)
ENVFILE := deploy/env.agents/dev-cpu.vars
RUNFILE :=
TREE := .
else
ENVFILE := $(HOME)/.config/h4reet-ai/env/$(ENV).env
# A host stack runs the commit `make up` exported, which its run file names (contracts/env-files.md §12). The run
# file is in the stack's H4_STATE_DIR, which preflight holds to this path, so make never reads the env file.
# TREE is read when a recipe runs, not when make starts. So once the export runs as its own target that `make up`
# depends on, up's recipe sees the run file the export has just written (tasks.md T036); a line inside the same
# recipe would still see the old one, because make expands a whole recipe before running it. Before the stack's first `make up` there is no run file, and the stack targets say so.
RUNFILE := $(HOME)/.local/state/h4reet/$(ENV)/run.env
TREE = $(shell sed -n 's/^H4_TREE=//p' "$(RUNFILE)" 2>/dev/null)
endif
COMPOSE = docker compose -p h4reet-$(ENV) -f $(TREE)/deploy/compose.yaml --env-file $(ENVFILE)$(if $(RUNFILE), --env-file $(RUNFILE))

# Every Python a recipe runs: isolated, and blind to bytecode an agent could plant, by script path and never with -m
# (research.md R-35). -I alone still loads a planted __pycache__/*.pyc. Under /dev/null, which can never hold a
# directory, Python finds no bytecode and compiles the source, and -B keeps it from trying to write any. A mktemp
# prefix comes out empty when mktemp fails, and an empty prefix loads the planted file.
PY_HOST := python3 -I -B -X pycache_prefix=/dev/null

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
PYTEST := $(shell command -v pytest >/dev/null 2>&1 && echo pytest || echo uv run --no-project --no-config --python "$$(command -v python3)" --quiet --with-requirements .devcontainer/requirements-tools.txt pytest)
PYTEST_ARGS := -q -p no:cacheprovider --import-mode=importlib
PYTEST_DIRS := $(wildcard corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts)

# node_modules and pytest, with any conftest.py, run code that agents can write and git doesn't show. The targets
# that run them work only in the agent sandbox or the devcontainer. In your own terminal, read the merge-request
# note's make check output, or run the gate (tools/gates/gate, tasks.md T092; plan §11).
CONTAINED = @if [ "$${SANDBOX_RUNTIME:-}" != 1 ] && [ "$${H4_DEVCONTAINER:-}" != 1 ]; then \
  echo "make $@ runs node_modules or pytest, which agents can write: run it in the devcontainer, or read the merge-request note's make check output (plan §11)" >&2; exit 2; fi

# npm runs a workspace script only once a workspace exists; with none, it fails with "No workspaces found".
WORKSPACES := $(wildcard services/*/package.json)
WORKSPACE_DIRS := $(patsubst %/package.json,%,$(WORKSPACES))
NPM_WS = $(if $(WORKSPACES),npm $(1) --workspaces --if-present,@echo "npm $(1): no workspaces yet")
# Every shell script but Spec Kit's vendored ones (ruff skips .specify/ the same way), NUL-separated, so no name is
# split or read by the shell. The gate lints a git archive export, which has no .git, so outside a repository the
# list comes from the files themselves. The git hooks are added by name: .claude/git-hooks is human-only.
LIST_SH = { git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/'
GIT_HOOKS := $(wildcard .claude/git-hooks/*)

# Cleared once the early patch adds the pre-commit hook (tasks.md T045, T046); githooks-check fails while both exist.
PRE_COMMIT_PLANNED := T045

# make check's gates, in order (plan §11). label=target runs another target under the gate's name; @Tnnn names the
# task that adds the target, so its absence is SKIP rather than FAIL. That task removes the mark: a mark whose target
# exists fails, so a later rename can't turn a gate into a silent SKIP.
CHECK_GATES := githooks-check toolchain-check policy validate-config@T019 lint test secrets@T091 evals redteam=redteam-suite matrix image@T036

help: ## List the targets
	@grep -E '^[a-zA-Z_-][a-zA-Z_ -]*:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

setup: ## Install the workspace's dependencies, then the git hooks (the devcontainer runs this)
	npm ci --ignore-scripts
	@$(MAKE) --no-print-directory git-hooks

tools: ## (the Author) Install the pinned host tools where agents can't write: Node, pytest, gitleaks, the lint toolchain
	bash tools/gates/install-tools.sh

toolchain-check: ## Compare the installed tools with .devcontainer/toolchain.vars (ADR 0018)
	$(PY_HOST) tools/gates/toolchain_check.py

check: ## Every local gate (FR-041): PASS, FAIL, SKIP, PENDING, or PLANNED for each, then a summary
	@$(PY_HOST) tools/gates/run_checks.py $(CHECK_GATES)

policy: ## The compose and file policy, over each committed env file; needs the docker CLI, not a daemon (plan §11)
	$(PY_HOST) tools/gates/compose_policy.py

githooks-check: ## The git hooks are installed and match .claude/git-hooks/, and main is a loose ref (plan §11)
	@hooks="$$(git rev-parse --git-path hooks)"; ok=1; \
	if [ -n "$${CI:-}" ]; then echo "SKIP: git hooks aren't installed in CI"; exit 0; fi; \
	if cmp -s .claude/git-hooks/reference-transaction "$$hooks/reference-transaction" \
	  && [ -z "$$(git config --get core.hooksPath)" ] && [ "$$(git config --get gc.packRefs)" = false ]; then \
	  echo "reference-transaction: installed"; \
	else echo "reference-transaction: missing, modified, or bypassed: run make git-hooks" >&2; ok=0; fi; \
	if [ -f .claude/git-hooks/pre-commit ]; then \
	  if [ -n "$(PRE_COMMIT_PLANNED)" ]; then echo "pre-commit: the hook exists now, so clear PRE_COMMIT_PLANNED in the Makefile (tasks.md T046)" >&2; ok=0; fi; \
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
	@set -e; hooks="$$(git rev-parse --git-path hooks)"; \
	if [ ! -w "$$hooks" ]; then echo "git hooks: $$hooks isn't writable here (the agent sandbox); the Author runs make git-hooks"; exit 0; fi; \
	install -m 0755 .claude/git-hooks/reference-transaction "$$hooks/reference-transaction"; \
	if [ -f .claude/git-hooks/pre-commit ]; then install -m 0755 .claude/git-hooks/pre-commit "$$hooks/pre-commit"; fi; \
	git config gc.packRefs false; \
	echo "git hooks: installed in $$hooks"

build: ## Build the workspaces, and the compose images once deploy/compose.yaml exists; prints BUILD OK
	$(CONTAINED)
	$(call NPM_WS,run build)
	@if [ -f deploy/compose.yaml ]; then docker compose -f deploy/compose.yaml build; else echo "compose images: none yet (tasks.md T029, T036)"; fi
	@echo BUILD OK

lint: ## Zero warnings: ESLint, tsc, Prettier, ruff, shellcheck (plan §9)
	$(CONTAINED)
	@[ -x node_modules/.bin/eslint ] || { echo "node_modules is missing: run make setup" >&2; exit 1; }
	node_modules/.bin/eslint --max-warnings 0 .
	@# tsc itself, per workspace: a workspace without a typecheck script would otherwise skip it silently.
	$(if $(WORKSPACE_DIRS),for ws in $(WORKSPACE_DIRS); do node_modules/.bin/tsc --noEmit -p "$$ws" || exit 1; done,@echo "tsc: no workspaces yet")
	node_modules/.bin/prettier --check .
	ruff check .
	@# corpus/ is human-authored and agents can't edit it, so ruff lints it but doesn't hold it to ruff's format.
	ruff format --check --no-cache --extend-exclude corpus .
	@[ "$$($(LIST_SH) | tr -cd '\0' | wc -c)" -gt 0 ] || { echo "lint: found no shell scripts to check" >&2; exit 1; }
	$(LIST_SH) | xargs -0 -t shellcheck -- $(GIT_HOOKS)

fmt: ## Format what Prettier and ruff own (not the human-authored documents or the corpus)
	$(CONTAINED)
	node_modules/.bin/prettier --write .
	ruff format --no-cache --extend-exclude corpus .

# The file name arrives in the environment and is read by the shell as "$$FILE", never as $(FILE):
# make would expand $(...) inside it. Call these as FILE=path make fmt-file, not make fmt-file FILE=path.
fmt-file: ## Format one file: FILE=path make fmt-file
	$(CONTAINED)
	@case "$$FILE" in *.ts|*.tsx|*.js|*.json|*.md) npx prettier --write "$$FILE" >/dev/null ;; *.py) ruff format "$$FILE" >/dev/null ;; esac

lint-file: ## Lint one file: FILE=path make lint-file
	$(CONTAINED)
	@case "$$FILE" in *.ts|*.tsx|*.js) npx eslint "$$FILE" ;; *.py) ruff check "$$FILE" ;; *.sh) shellcheck "$$FILE" ;; esac

test: corpus-check ## Every test: the corpus gate, the workspaces' tests, and pytest
	$(CONTAINED)
	$(call NPM_WS,test)
	$(PYTEST) $(PYTEST_ARGS) $(PYTEST_DIRS)

test-fast: ## The quick subset
	$(CONTAINED)
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

.PHONY: help setup tools toolchain-check check policy githooks-check git-hooks build lint fmt fmt-file lint-file test test-fast \
	corpus-check evals redteam redteam-suite matrix up down logs status pull pin-images init-env isolation-check \
	breach-test plan
