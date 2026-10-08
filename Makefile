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
# REF picks the commit a host stack runs (make up REF=<sha> is the rollback), from the command line only, like ENV.
# The shell reads it as "$REF", so make never splices it into a command line, and --ref= keeps it a value.
REF_ARG = $(if $(filter command line,$(origin REF)), --ref="$$REF")

# The agents' engine (plan §10). Inside the agent sandbox, a target that touches containers runs itself again
# through deploy/agents-engine/docker-relay, which points DOCKER_HOST at the engine, and only for ENV=dev-cpu: the
# host's engine and stacks are out of an agent's reach (FR-039). ENGINE_CERT is the agents' client certificate,
# which deploy/agents-engine/engine.sh setup writes (tasks.md T042, T046); before it exists there is no engine.
RELAY := deploy/agents-engine/docker-relay
RELAY_HOST := tcp://127.0.0.1:2376
ENGINE_CERT := $(HOME)/.config/h4reet/agents-engine/docker/cert.pem
ifeq ($(SANDBOX_RUNTIME),1)
ifneq ($(DOCKER_HOST),$(RELAY_HOST))
VIA_RELAY := 1
endif
endif
# Where compose images can be built: relay (the sandbox, with an engine), none-yet (the sandbox, before T046),
# direct (a docker CLI: already relayed, or outside the sandbox), or no-cli (the devcontainer).
ENGINE_MODE := $(if $(VIA_RELAY),$(if $(and $(wildcard $(RELAY)),$(wildcard $(ENGINE_CERT))),relay,none-yet),$(if $(shell command -v docker 2>/dev/null),direct,no-cli))

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
CHECK_GATES := githooks-check toolchain-check policy validate-config@T019 lint test secrets@T091 evals redteam=redteam-suite matrix image

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

build: ## Build the workspaces, then the compose images on the agents' engine, where there is one; prints BUILD OK
	$(CONTAINED)
	$(call NPM_WS,run build)
ifeq ($(ENGINE_MODE),relay)
	@$(RELAY) make --no-print-directory compose-images ENV=dev-cpu || { echo "build: the agents' engine didn't build the images; if it's down, ask the Author: deploy/agents-engine/engine.sh up" >&2; exit 1; }
else ifeq ($(ENGINE_MODE),direct)
	@$(MAKE) --no-print-directory compose-images
else
	@echo "compose images: $(if $(filter none-yet,$(ENGINE_MODE)),no agents' engine yet (tasks.md T046),no docker CLI here; the Author's gate builds them on the agents' engine)"
endif
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

# ---------------------------------------------------------------------------------------------------------------
# The stacks (plan §4; contracts/env-files.md §10 and §12). prod and dev run on the host's engine, from the
# read-only export of the commit make up started, so make runs that export's own preflight, status, and redact
# scripts; dev-cpu runs on the agents' engine, from the working tree.
#
# A host stack with no run file wasn't started by make up: down, logs, and status say so and succeed (§12).
NOT_STARTED = [ -z "$(RUNFILE)" ] || [ -f "$(RUNFILE)" ] || { echo "h4reet-$(ENV) wasn't started by make up (no $(RUNFILE)): nothing to $(1)"; exit 0; }
# deploy/scripts/pull-models.sh (tasks.md T057) takes --stack S --env-file F [--all]; on the agents' engine it only
# verifies the seeded model. $(1) is the tree it runs from: the export on a host stack.
PULL_MODELS = if [ -f $(1)/deploy/scripts/pull-models.sh ]; then bash $(1)/deploy/scripts/pull-models.sh --stack $(ENV) --env-file $(ENVFILE) $(2); \
  else echo "models: deploy/scripts/pull-models.sh arrives with tasks.md T057"; fi

ifeq ($(VIA_RELAY),1)
# Inside the sandbox: the same target again, through the relay, on the agents' engine. MAKEFLAGS carries the rest of
# the command line (SERVICE=, TAIL=) into the relayed make.
up down logs status:
	@[ "$(ENV)" = dev-cpu ] || { echo "make $@ ENV=$(ENV): agent sessions run dev-cpu only, on their own engine (FR-039); the Author runs prod and dev" >&2; exit 2; }
	@[ -x $(RELAY) ] && [ -f "$(ENGINE_CERT)" ] || { echo "make $@: the agents' engine isn't set up yet (tasks.md T046); ask the Author" >&2; exit 2; }
	$(RELAY) make --no-print-directory $@ ENV=dev-cpu
else
up: $(if $(RUNFILE),up-export) ## Start the stack: the commit (REF=, default HEAD), preflight, the model, then every service, healthy
	@$(if $(RUNFILE),:,[ "$(origin REF)" != "command line" ] || { echo "make up: dev-cpu runs the working tree; REF= is for prod and dev" >&2; exit 2; })
	$(PY_HOST) $(TREE)/deploy/scripts/preflight.py --stack $(ENV) --env-file $(ENVFILE)$(if $(RUNFILE), --run-file $(RUNFILE)) --repo $(CURDIR)$(REF_ARG)
	@$(call PULL_MODELS,$(TREE),)
	@# Every service healthy, or status names the one that isn't, with its health output and error lines, redacted;
	@# the rest keep running, and hello answers degraded (plan §4). --remove-orphans retires a service the commit dropped.
	@$(COMPOSE) up -d --build --remove-orphans --wait --wait-timeout 600; up=$$?; \
	$(PY_HOST) $(TREE)/deploy/scripts/status.py --stack $(ENV) --env-file $(ENVFILE)$(if $(RUNFILE), --run-file $(RUNFILE)) --root $(TREE) --after-up; status=$$?; \
	[ "$$up" -eq 0 ] && [ "$$status" -eq 0 ]

down: ## Stop the stack: its volumes, meters, and journal stay, because it never passes -v (FR-031)
	@$(call NOT_STARTED,stop) && $(COMPOSE) down --timeout 30 --remove-orphans

# SERVICE= and TAIL= come from the command line, read by the shell, and checked before compose sees them.
logs: ## The stack's logs, redacted: SERVICE=name TAIL=200; the model server shows warnings and errors only
	@set -eo pipefail; $(call NOT_STARTED,show); \
	tail="$(if $(filter command line,$(origin TAIL)),$$TAIL,200)"; service="$(if $(filter command line,$(origin SERVICE)),$$SERVICE)"; \
	case "$$tail" in ''|*[!0-9]*) echo "TAIL is a number of lines" >&2; exit 2 ;; esac; \
	case "$$service" in *[!a-z0-9-]*) echo "SERVICE is one service's name" >&2; exit 2 ;; esac; \
	redact=$(TREE)/deploy/scripts/redact.sh; \
	[ -f "$$redact" ] || { echo "the running commit has no deploy/scripts/redact.sh, so its logs aren't shown" >&2; exit 1; }; \
	$(COMPOSE) logs --timestamps --tail "$$tail" $${service:+"$$service"} 2>&1 \
	  | awk '{ split($$0, f, "|") } f[1] ~ /model-server-/ && tolower($$0) !~ /warn|error|fail/ { next } { print }' \
	  | bash "$$redact"

status: ## The running commit and the one before, each service's health and pin, the gateway's /health, disk use
	@$(call NOT_STARTED,report) && $(PY_HOST) $(TREE)/deploy/scripts/status.py --stack $(ENV) --env-file $(ENVFILE)$(if $(RUNFILE), --run-file $(RUNFILE)) --root $(TREE)
endif

# make up's first step on a host stack: its own target, so up's recipe, which make expands only once this has run,
# reads TREE from the run file it has just written (tasks.md T036). It runs from the working tree: it makes the export.
up-export:
	$(PY_HOST) deploy/scripts/export_tree.py --stack $(ENV) --repo $(CURDIR)$(REF_ARG)

pull: ## (the Author) Pull every image by digest, Docker Hub's one at a time with backoff; then the models (MODELS=all)
	@[ "$${SANDBOX_RUNTIME:-}" != 1 ] || { echo "make pull is the Author's: the agents' engine is seeded instead (deploy/agents-engine/engine.sh seed)" >&2; exit 2; }
	@[ "$(ENV)" != dev-cpu ] || { echo "make pull ENV=dev-cpu: the agents' engine is seeded instead (deploy/agents-engine/engine.sh seed)" >&2; exit 2; }
	$(PY_HOST) deploy/scripts/preflight.py --stack $(ENV) --env-file $(ENVFILE) --for pull --repo $(CURDIR)$(if $(filter all,$(MODELS)), --models all)
	$(PY_HOST) deploy/scripts/pull_images.py --stack $(ENV) --env-file $(ENVFILE)
	@$(call PULL_MODELS,.,$(if $(filter all,$(MODELS)),--all))

# The image gate (plan §11): SKIP before the agents' engine exists (tasks.md T046), and FAIL once it exists and
# doesn't build them. The devcontainer has no docker CLI; the Author's gate builds the images on the engine.
image: ## The image gate: the compose images built on the agents' engine (plan §11)
ifeq ($(ENGINE_MODE),relay)
	@$(RELAY) make --no-print-directory compose-images ENV=dev-cpu || { echo "image: the agents' engine didn't build the images; if it's down, ask the Author: deploy/agents-engine/engine.sh up" >&2; exit 1; }
else ifeq ($(ENGINE_MODE),none-yet)
	@echo "SKIP: no agents' engine yet: tasks.md T046"
else ifeq ($(ENGINE_MODE),no-cli)
	@echo "SKIP: no docker CLI here (the devcontainer); the Author's gate builds the images on the agents' engine"
else
	@$(MAKE) --no-print-directory compose-images
endif

# Every image this tree builds (the gateway; the stand-ins and the probe once they exist), in every profile, on the
# current engine, with dev-cpu's env file: the agents' engine builds through its proxy (H4_BUILD_PROXY).
compose-images:
	docker compose -p h4reet-dev-cpu -f deploy/compose.yaml --env-file deploy/env.agents/dev-cpu.vars --profile '*' build

isolation-check: ## (the Author) prod and dev can't reach each other, which arrives with feat/000-us1-local-stack
	@echo "make isolation-check arrives with feat/000-us1-local-stack (tasks.md T061, plan §4)" >&2; exit 2

init-env: ## (the Author) Write ~/.config/h4reet-ai/env/ENV.env from its template; SYNC=1 adds new keys
	$(PY_HOST) deploy/scripts/init_env.py --stack $(ENV) $(if $(filter 1,$(SYNC)),--sync)

# The Author's terminal: it reaches the registries. ONLY=svc,... limits it; TAG="svc=tag ..." pins a tag (an open
# one, such as seaweedfs's, otherwise gets the newest release); DRY_RUN=1 prints the table and writes nothing.
# The values reach the script through the environment, quoted by the shell, never spliced into the command line.
pin-images: ## (the Author) Resolve deploy/images.lock's tags to digests, and rewrite it and compose.yaml (plan §2)
	@set -f; set --; for tag in $${TAG:-}; do set -- "$$@" --tag "$$tag"; done; \
	$(PY_HOST) deploy/scripts/pin_images.py $${ONLY:+--only "$$ONLY"} $${DRY_RUN:+--dry-run} "$$@"

breach-test: ## The kill-switch rehearsal on dev or dev-cpu, which arrives with feat/000-us2-kill-switch
	@echo "make breach-test arrives with feat/000-us2-kill-switch (tasks.md T080)" >&2; exit 2

plan: ## Terraform plan for ENV (never apply from here); infra/ arrives with spec 001
	cd infra && terraform init -input=false && terraform workspace select $(ENV) && terraform plan -input=false -out=tf.plan

.PHONY: help setup tools toolchain-check check policy githooks-check git-hooks build lint fmt fmt-file lint-file test test-fast \
	corpus-check evals redteam redteam-suite matrix up up-export down logs status pull image compose-images pin-images \
	init-env isolation-check breach-test plan
