# h4reet.ai: one command per thing agents, the Author, and the gate need (spec 000, plan §4, §9, §11).
# Targets exit non-zero on failure. There is deliberately no `apply` target: Terraform apply is a human action,
# in the protected environment, after the Author approves.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

# A command-line variable is make code: make expands its value wherever it's used, and again when it exports it to a
# recipe, so "$5" vanishes and "$(shell ...)" runs. So before anything else, each one the targets read is rebound to
# the literal text typed, and exported (ENV aside: it stays out of recipes, below). CLI_VARS names the ones given on
# the command line, which the targets check, since an override's origin is no longer "command line" (T056's review).
LITERAL_VARS := ENV REF FILE REASON DAY_USD MONTH_USD FALLBACK_TODAY_USD RENEW CONFIRM_ZERO ONLY TAG DRY_RUN SERVICE TAIL MODELS SYNC DELIVERY MESSAGE ADAPTER LIMIT ID
CLI_VARS := $(foreach v,$(LITERAL_VARS),$(if $(filter command line,$(origin $(v))),$(v)))
$(foreach v,$(CLI_VARS),$(eval override $(v) := $$(value $(v))))
$(foreach v,$(filter-out ENV,$(CLI_VARS)),$(eval export $(v)))
from_cli = $(filter $(1),$(CLI_VARS))

# The stack (plan §4): prod and dev on the 5090, dev-cpu on the agents' engine. Only the command line picks it
# (make up ENV=dev): POSIX shells export ENV to name a startup file, and that must never choose a stack. A stack's
# name in the environment is refused rather than ignored, so `ENV=dev make down` can't act on prod.
ifeq ($(call from_cli,ENV),)
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
REF_ARG = $(if $(call from_cli,REF), --ref="$$REF")

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
# Only a plain x.y.z, so nothing else in toolchain.vars can reach PATH.
NODE_PIN := $(shell sed -n 's/^NODE_VERSION=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$$/\1/p' .devcontainer/toolchain.vars)
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

# npm runs a workspace script only once a workspace exists; with none, it fails with "No workspaces found". The
# services, then the apps (spec 002's room, apps/web), as the root package.json's workspaces list them.
WORKSPACES := $(wildcard services/*/package.json apps/*/package.json)
WORKSPACE_DIRS := $(patsubst %/package.json,%,$(WORKSPACES))
NPM_WS = $(if $(WORKSPACES),npm $(1) --workspaces --if-present,@echo "npm $(1): no workspaces yet")
# Every shell script but Spec Kit's vendored ones (ruff skips .specify/ the same way), NUL-separated, so no name is
# split or read by the shell. The gate lints a git archive export, which has no .git, so outside a repository the
# list comes from the files themselves. Scripts without .sh are added by name: the git hooks (human-only), and
# the engine's relay, which runs by name.
LIST_SH = { git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/'
NAMED_SCRIPTS := $(wildcard .claude/git-hooks/*) $(wildcard deploy/agents-engine/docker-relay)

# Cleared once the early patch adds the pre-commit hook (tasks.md T045, T046); githooks-check fails while both exist.
PRE_COMMIT_PLANNED :=

# make check's gates, in order (plan §11). label=target runs another target under the gate's name; @Tnnn names the
# task that adds the target, so its absence is SKIP rather than FAIL. That task removes the mark: a mark whose target
# exists fails, so a later rename can't turn a gate into a silent SKIP.
CHECK_GATES := makefiles-check githooks-check toolchain-check policy validate-config lint test content-check secrets evals redteam=redteam-suite matrix image

# -h: with a GNUmakefile that includes this file (tasks.md T183), MAKEFILE_LIST names two files, and grep would put a
# file name before every line.
help: ## List the targets
	@grep -hE '^[a-zA-Z_-][a-zA-Z_ -]*:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

setup: ## Install the workspace's dependencies, then the git hooks (the devcontainer runs this)
	npm ci --ignore-scripts
	@$(MAKE) --no-print-directory git-hooks

tools: ## (the Author) Install the pinned host tools where agents can't write: Node, pytest, gitleaks, the lint toolchain
	bash tools/gates/install-tools.sh

toolchain-check: ## Compare the installed tools with .devcontainer/toolchain.vars (ADR 0018)
	$(PY_HOST) tools/gates/toolchain_check.py

makefiles-check: ## GNUmakefile holds only its include, and there is no makefile (T183; the gate runs it directly)
	$(PY_HOST) tools/gates/makefiles_check.py

check: ## Every local gate (FR-041): PASS, FAIL, SKIP, PENDING, or PLANNED for each, then a summary
	@$(PY_HOST) tools/gates/run_checks.py $(CHECK_GATES)

validate-config: ## The gateway's config files and env templates, through the gateway's own validators (contracts/config-files.md §5)
	$(CONTAINED)
	npm run --silent -w services/gateway validate-config -- --root "$(CURDIR)"

engine-status: ## The agents' engine: reachable, rootless, its plugin, its images (contracts/agents-engine.md §8)
	@# In the sandbox the engine is reached only through the relay, which sets DOCKER_HOST, so the nested run is direct.
	@if [ "$${SANDBOX_RUNTIME:-}" = 1 ] && [ -z "$${DOCKER_HOST:-}" ]; then deploy/agents-engine/docker-relay make engine-status; \
	else deploy/agents-engine/engine.sh status; fi

engine-smoke: ## dev-cpu up, its breach test, and down, on the agents' engine (contracts/agents-engine.md §8)
	deploy/agents-engine/engine.sh smoke

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

build: ## Build the workspaces, then the gateway's, the room's, and the compose images on the agents' engine, where there is one; prints BUILD OK
	$(CONTAINED)
	$(call NPM_WS,run build)
ifeq ($(ENGINE_MODE),relay)
	@$(RELAY) make --no-print-directory gateway-image web-image compose-images ENV=dev-cpu || { echo "build: the agents' engine didn't build the images; if it's down, ask the Author: deploy/agents-engine/engine.sh up" >&2; exit 1; }
else ifeq ($(ENGINE_MODE),direct)
	@$(MAKE) --no-print-directory gateway-image web-image compose-images
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
	$(LIST_SH) | xargs -0 -t shellcheck -- $(NAMED_SCRIPTS)

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

# The published-content check (spec 002, T080; contracts/resume-source.md §5): the room built without drafts, whatever
# the shell's ROOM_DRAFTS, its prebuild reading main's policy; then tools/gates/content_check.py, human-only, which
# reads main's approvals itself and fails when room-data.json publishes a content file main doesn't approve. The
# build's approvals code is agent-editable; the check isn't. PLANNED until the approvals patch adds the script. The
# Author's gate runs the same check from main's tree, over a build in its container phase.
content-check: ## The room's published content against main's approvals, after a build without drafts (spec 002, T080)
	$(CONTAINED)
	@# One shell: the PLANNED exit must end the recipe, not only its own line.
	@if [ ! -f tools/gates/content_check.py ]; then echo "PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch"; exit 0; fi; \
	set -x; ROOM_DRAFTS= npm run build -w apps/web && \
	$(PY_HOST) tools/gates/content_check.py --tree . --room-data apps/web/dist/room-data.json --repo .

corpus-check: ## Public-corpus gate: attested facts slots, no amounts, the local denylist
	$(PY_HOST) corpus/tools/check_corpus.py

# gitleaks with only the main working tree's .gitleaks.toml, a fresh empty ignore directory, and
# --ignore-gitleaks-allow, refusing while a .gitleaksignore could hold an entry at its source (research.md R-36).
secrets: ## gitleaks over the unstaged and staged changes and every commit since main (plan §11)
	bash tools/gates/secrets.sh

evals: ## The product evals (ADAPTER=fake; local and bedrock are the Author's), the agent-config static tier, the behavioral tier's status, and the docs' links
	@case "$${ADAPTER:-fake}" in fake) ;; \
	  local|bedrock) if [ "$${SANDBOX_RUNTIME:-}" = 1 ]; then echo "ADAPTER=$$ADAPTER runs in the Author's terminal" >&2; exit 2; fi ;; \
	  *) echo "ADAPTER must be fake, local, or bedrock" >&2; exit 2 ;; esac
	$(PY_HOST) evals/run.py --suite product --adapter $${ADAPTER:-fake} $$([ "$${ADAPTER:-}" = local ] && echo --stack $(ENV))
	$(PY_HOST) evals/agent-config/static.py
	$(PY_HOST) evals/agent-config/behavioral.py status
	@# Every relative link in README.md, docs/, and specs/ resolves, and every ADR is two clicks from the README (SC-009).
	$(PY_HOST) evals/docs_links.py

# The behavioral agent-config evals (plan §14; FR-011, SC-008; tasks.md T094): real Claude Code sessions on the Team
# plan, never the API, each in a scratch clone of the branch REF names, with the git hooks installed. The Author's,
# from main's checkout, on main with its tracked files clean and nothing untracked or ignored in evals/agent-config/
# but earlier entries and __pycache__/*.pyc (untracked files elsewhere don't matter): main's behavioral.py reads the branch's cases and thresholds as
# data, shows its diff under the human-only paths, and starts nothing until the Author types yes. It ends with the
# commands that commit the entry on the branch from main's checkout, never switching it to the branch (review D1, 1).
# make evals shows PENDING with this command until a passing run's entry, attested and committed, has the trigger
# hash. ONLY= names cases to try alone, and writes no history. The closing patch's bash-gate rule refuses it to agents
# too (§15).
evals-agent-config: ## (the Author) The behavioral agent-config evals of a branch, from main's checkout, on the Team plan; paste the commands it prints to commit the entry on the branch: REF=<branch> [ONLY=id,...]
	@[ "$${SANDBOX_RUNTIME:-}" != 1 ] || { echo "make evals-agent-config is the Author's: it starts real Claude Code sessions on the Team plan, which an agent session can't (plan §14)" >&2; exit 2; }
	$(PY_HOST) evals/agent-config/behavioral.py run$(if $(call from_cli,REF), --ref="$$REF")$(if $(call from_cli,ONLY), --only="$$ONLY")

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
# deploy/scripts/pull-models.sh takes --stack S --env-file F [--all]: on a host stack it fetches and verifies the
# stack's model (every model in deploy/models.lock with --all), and on the agents' engine it only verifies the seeded
# one. $(1) is the tree it runs from: the export on a host stack. A commit older than the model server, which a
# rollback can run, has neither the script nor a model to fetch.
PULL_MODELS = if [ -f $(1)/deploy/scripts/pull-models.sh ]; then bash $(1)/deploy/scripts/pull-models.sh --stack $(ENV) --env-file $(ENVFILE) $(2); \
  else echo "models: the commit being run has no deploy/scripts/pull-models.sh, and no model server to fetch for"; fi
# The gateway's one image per commit (tasks.md T184): deploy/scripts/gateway_image.py, from $(1), the tree being
# started, builds h4reet-gateway:<commit> outside compose on a host stack's engine, once: prod and dev at one commit
# share it, so they run one image ID. On dev-cpu it builds the working tree as h4reet-gateway:working-tree, every run.
# compose names that image and never pulls it. A commit older than the script, which a rollback can run, builds its
# gateway in compose, as its compose file says.
GATEWAY_IMAGE = if [ -f $(1)/deploy/scripts/gateway_image.py ]; then $(PY_HOST) $(1)/deploy/scripts/gateway_image.py --stack $(ENV) --env-file $(ENVFILE)$(if $(RUNFILE), --run-file $(RUNFILE)); \
  else echo "gateway image: the commit being run has no deploy/scripts/gateway_image.py, so its compose file builds the gateway"; fi
# The room's image (spec 002, contracts/web-serving.md §1): deploy/scripts/web_image.py, from $(1), the tree being
# started, builds h4reet-web:<ref><H4_WEB_SUFFIX> outside compose, on every run, with ROOM_DRAFTS only in a -drafts
# build, and main's policy files read from this working tree (--repo, as preflight's) with git show. A commit older
# than the script, which a rollback can run, has no web service either.
WEB_IMAGE = if [ -f $(1)/deploy/scripts/web_image.py ]; then $(PY_HOST) $(1)/deploy/scripts/web_image.py --stack $(ENV) --env-file $(ENVFILE)$(if $(RUNFILE), --run-file $(RUNFILE)) --repo $(CURDIR); \
  else echo "web image: the commit being run has no deploy/scripts/web_image.py, and no web service"; fi

ifeq ($(VIA_RELAY),1)
# Inside the sandbox: the same target again, through the relay, on the agents' engine. MAKEFLAGS carries the rest of
# the command line (SERVICE=, TAIL=) into the relayed make.
up down logs status:
	@[ "$(ENV)" = dev-cpu ] || { echo "make $@ ENV=$(ENV): agent sessions run dev-cpu only, on their own engine (FR-039); the Author runs prod and dev" >&2; exit 2; }
	@[ -x $(RELAY) ] && [ -f "$(ENGINE_CERT)" ] || { echo "make $@: the agents' engine isn't set up yet (tasks.md T046); ask the Author" >&2; exit 2; }
	$(RELAY) make --no-print-directory $@ ENV=dev-cpu
else
up: $(if $(RUNFILE),up-export) ## Start the stack: the commit (REF=, default HEAD), preflight, the model, the gateway's and the room's images, then every service, healthy
	@$(if $(RUNFILE),:,[ -z "$(call from_cli,REF)" ] || { echo "make up: dev-cpu runs the working tree; REF= is for prod and dev" >&2; exit 2; })
	$(PY_HOST) $(TREE)/deploy/scripts/preflight.py --stack $(ENV) --env-file $(ENVFILE)$(if $(RUNFILE), --run-file $(RUNFILE)) --repo $(CURDIR)$(REF_ARG)
	@$(call PULL_MODELS,$(TREE),)
	@$(call GATEWAY_IMAGE,$(TREE))
	@$(call WEB_IMAGE,$(TREE))
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
	tail="$(if $(call from_cli,TAIL),$$TAIL,200)"; service="$(if $(call from_cli,SERVICE),$$SERVICE)"; \
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
image: ## The image gate: the gateway's, the room's, and the compose images built on the agents' engine (plan §11)
ifeq ($(ENGINE_MODE),relay)
	@$(RELAY) make --no-print-directory gateway-image web-image compose-images ENV=dev-cpu || { echo "image: the agents' engine didn't build the images; if it's down, ask the Author: deploy/agents-engine/engine.sh up" >&2; exit 1; }
else ifeq ($(ENGINE_MODE),none-yet)
	@echo "SKIP: no agents' engine yet: tasks.md T046"
else ifeq ($(ENGINE_MODE),no-cli)
	@echo "SKIP: no docker CLI here (the devcontainer); the Author's gate builds the images on the agents' engine"
else
	@$(MAKE) --no-print-directory gateway-image web-image compose-images
endif

# The images this tree builds, on the agents' engine only: through the relay in a session (DOCKER_HOST is the relay's),
# or the Author's gate on 198.18.0.1 (T092). They are the live working tree's, which agents write, so the host's rootful
# engine, where nothing of the working tree's may be built or run (FR-039), never builds them (round 3's review). The
# agents' engine builds through its proxy (H4_BUILD_PROXY).
AGENTS_ENGINE_ONLY = case "$${DOCKER_HOST:-}" in \
	  $(RELAY_HOST)) [ "$${SANDBOX_RUNTIME:-}" = 1 ] || { echo "make $@: $(RELAY_HOST) is the relay's only inside the sandbox; from here, set DOCKER_HOST=tcp://198.18.0.1:2376 (the agents' engine)" >&2; exit 2; } ;; \
	  tcp://198.18.0.1:2376) ;; \
	  *) echo "make $@ builds the working tree's images on the agents' engine only, never on this shell's engine (FR-039): through the relay in an agent session, or with DOCKER_HOST=tcp://198.18.0.1:2376" >&2; exit 2 ;; \
	esac

# The gateway's image, h4reet-gateway:working-tree, outside compose, as make up ENV=dev-cpu builds it (tasks.md T184).
gateway-image:
	@$(AGENTS_ENGINE_ONLY)
	$(PY_HOST) deploy/scripts/gateway_image.py --stack dev-cpu --env-file deploy/env.agents/dev-cpu.vars

# The room's image, h4reet-web:working-tree-drafts, outside compose, as make up ENV=dev-cpu builds it (spec 002), with
# main's policy files read from this working tree.
web-image:
	@$(AGENTS_ENGINE_ONLY)
	$(PY_HOST) deploy/scripts/web_image.py --stack dev-cpu --env-file deploy/env.agents/dev-cpu.vars --repo $(CURDIR)

# compose's own images (the Telegram stand-in and the breach probe), in every profile, with dev-cpu's env file.
compose-images:
	@$(AGENTS_ENGINE_ONLY)
	docker compose -p h4reet-dev-cpu -f deploy/compose.yaml --env-file deploy/env.agents/dev-cpu.vars --profile '*' build

# Both host stacks up on the host's engine; it runs from the working tree, like pull and pin-images (plan §4, FR-020).
isolation-check: ## (the Author) With prod and dev up: neither reaches the other's names, addresses, ports, or volumes
	@[ "$${SANDBOX_RUNTIME:-}" != 1 ] || { echo "make isolation-check is the Author's: it inspects prod and dev on the host's engine, which agent sessions can't reach" >&2; exit 2; }
	bash deploy/scripts/isolation-check.sh

init-env: ## (the Author) Write ~/.config/h4reet-ai/env/ENV.env from its template; SYNC=1 adds new keys
	$(PY_HOST) deploy/scripts/init_env.py --stack $(ENV) $(if $(filter 1,$(SYNC)),--sync)

# prod's Bedrock session (plan §4 and §5.2; research.md R-17; tasks.md T104): aws sso login for the runtime identity's
# profile, with HOME at ~/.config/h4reet-ai/aws-home, whose .aws prod's gateway mounts read-only. Only prod has one:
# dev and dev-cpu mount deploy/aws-none. Agent sessions can't read that directory, and the script refuses them too.
aws-login: ## (the Author) A new SSO session for prod's Bedrock identity: aws sso login --profile h4reet-bedrock
	@[ "$${SANDBOX_RUNTIME:-}" != 1 ] || { echo "make aws-login is the Author's: it writes prod's Bedrock session to ~/.config/h4reet-ai, which agent sessions can't read" >&2; exit 2; }
	@[ "$(ENV)" = prod ] || { echo "make aws-login ENV=$(ENV): the session is prod's alone; dev and dev-cpu mount deploy/aws-none and route no paid adapter" >&2; exit 2; }
	bash deploy/scripts/aws-login.sh

# The operator CLI (contracts/operator-admin.md §6, §6.1): scripts/operator.py, by path through PY_HOST, because it
# holds the operator token. prod and dev are the Author's, with ~/.config/h4reet-ai/operator/<stack>.token. dev-cpu's
# token is the committed public dummy. The CLI reaches dev-cpu's admin listener at 127.0.0.1:18303 from your terminal,
# and inside the sandbox with one hop, through the relay, in a breach-probe container on the agents' engine, so the
# recipes are the same for every stack. Agent sessions run them for dev-cpu only (FR-008); bash-gate's rule for the
# other stacks arrives with the closing patch (plan §13, §15).
# Every value comes from the command line only and reaches the CLI as "$$NAME", read by the shell, so make never
# splices it into a command line; the --name= form keeps a value that starts with - a value.
OPERATOR = $(PY_HOST) scripts/operator.py --stack $(ENV)
OPERATOR_AGENTS = @[ "$${SANDBOX_RUNTIME:-}" != 1 ] || [ "$(ENV)" = dev-cpu ] || { echo "make $@ ENV=$(ENV): agent sessions reach dev-cpu's admin listener only; prod and dev are the Author's (FR-008)" >&2; exit 2; }
# $(call OPERATOR_FLAG,RENEW,--renew): 1 adds the flag, unset or empty adds nothing, and anything else stops make
# before the recipe runs.
OPERATOR_FLAG = $(if $(call from_cli,$(1)),$(if $(filter-out 1,$($(1))),$(error $(1) is 1 or unset, not "$($(1))"),$(if $($(1)), $(2))))
# $(call OPERATOR_VALUE,DAY_USD,--day-usd): the value as the shell reads it; the CLI checks its shape.
OPERATOR_VALUE = $(if $(call from_cli,$(1)), $(2)="$$$(1)")

operator-token: ## (the Author) Mint ENV's operator token (prod or dev); prints the SHA-256 for its env file
	$(OPERATOR_AGENTS)
	$(OPERATOR) mint

operator-status: ## ENV's state, meters, and adapters, from its admin listener (agent sessions: dev-cpu only)
	$(OPERATOR_AGENTS)
	$(OPERATOR) status

operator-init: ## Initialize ENV's empty store: REASON="..." [CONFIRM_ZERO=1] [RENEW=1] [DAY_USD= MONTH_USD= FALLBACK_TODAY_USD=]
	$(OPERATOR_AGENTS)
	@[ -n "$(call from_cli,REASON)" ] && [ -n "$$REASON" ] || { echo 'make operator-init needs REASON="<why, at least 10 characters>" on the command line' >&2; exit 2; }
	$(OPERATOR) init --reason="$$REASON"$(call OPERATOR_FLAG,RENEW,--renew)$(call OPERATOR_FLAG,CONFIRM_ZERO,--confirm-zero)$(call OPERATOR_VALUE,DAY_USD,--day-usd)$(call OPERATOR_VALUE,MONTH_USD,--month-usd)$(call OPERATOR_VALUE,FALLBACK_TODAY_USD,--fallback-today-usd)

# The operator's other writes and reads (contracts/operator-admin.md §2.1, §2.2, §4.2, §4.3; tasks.md T075).
operator-reset: ## Restore ENV's kill switch to normal after a trip: REASON="..." (metered calls stay refused at a ceiling)
	$(OPERATOR_AGENTS)
	@[ -n "$(call from_cli,REASON)" ] && [ -n "$$REASON" ] || { echo 'make operator-reset needs REASON="<why, at least 10 characters>" on the command line' >&2; exit 2; }
	$(OPERATOR) reset --reason="$$REASON"
.PHONY: operator-reset

operator-renew: ## Renew ENV's fallback sub-budget, two dollars more at once: REASON="..."
	$(OPERATOR_AGENTS)
	@[ -n "$(call from_cli,REASON)" ] && [ -n "$$REASON" ] || { echo 'make operator-renew needs REASON="<why, at least 10 characters>" on the command line' >&2; exit 2; }
	$(OPERATOR) renew --reason="$$REASON"
.PHONY: operator-renew

operator-audit: ## ENV's audit log, newest first: [LIMIT=50]
	$(OPERATOR_AGENTS)
	$(OPERATOR) audit$(call OPERATOR_VALUE,LIMIT,--limit)
.PHONY: operator-audit

operator-incidents: ## ENV's newest incident draft as Markdown, or one draft by ID=: [ID=]
	$(OPERATOR_AGENTS)
	$(OPERATOR) incidents --show$(call OPERATOR_VALUE,ID,--id)
.PHONY: operator-incidents

# The live contract run (contracts/provider-adapter.md §5.3; tasks.md T103), the Author's: operator.py records each case
# of live-cases.json through ENV's POST /admin/adapters/ADAPTER/complete into a 0700 temporary directory, then the
# replay runs in tools/gates/gate's container phase, the devcontainer image with --network none on an exported tree,
# and the directory is deleted. Bedrock is prod's alone, and its calls are charged to prod's meters as test. The
# recorder reads the working tree's live-cases.json and the replay HEAD's, so the target refuses, before it records, a
# case file that differs from HEAD's (provider-adapter.md §5.4; T092). Without the gate it calls nothing, so no live
# call is made without its replay. The gate refuses to run from a linked worktree, so this runs in the main tree.
contract-live: ## (the Author) The live contract run: ENV= ADAPTER=local|bedrock REASON="..." (provider-adapter.md §5.3)
	@[ "$${SANDBOX_RUNTIME:-}" != 1 ] || { echo "make contract-live is the Author's: it calls a live adapter with ENV's operator token (provider-adapter.md §5.3)" >&2; exit 2; }
	@[ -n "$(call from_cli,REASON)" ] && [ -n "$$REASON" ] || { echo 'make contract-live needs REASON="<why, at least 10 characters>" on the command line' >&2; exit 2; }
	@case "$(if $(call from_cli,ADAPTER),$$ADAPTER)" in \
	  local) ;; \
	  bedrock) [ "$(ENV)" = prod ] || { echo "make contract-live ADAPTER=bedrock: bedrock is prod's adapter, so ENV=prod" >&2; exit 2; } ;; \
	  *) echo "make contract-live needs ADAPTER=local or ADAPTER=bedrock on the command line" >&2; exit 2 ;; \
	esac
	@[ -x tools/gates/gate ] || { echo "make contract-live replays in tools/gates/gate's container phase, and there is no gate here; nothing was called" >&2; exit 2; }
	@cases=services/gateway/test/contract/live-cases.json; \
	if ! GIT_NO_REPLACE_OBJECTS=1 git cat-file -e "HEAD:$$cases" 2>/dev/null \
	  || ! GIT_NO_REPLACE_OBJECTS=1 git cat-file blob "HEAD:$$cases" | cmp -s - "$$cases"; then \
	  echo "make contract-live: $$cases differs from HEAD's, and the replay reads HEAD's (provider-adapter.md §5.4): commit or restore it; nothing was called" >&2; exit 2; \
	fi
	@dir=$$(mktemp -d) && chmod 700 "$$dir" && trap 'rm -rf "$$dir"' EXIT && \
	  $(OPERATOR) contract-record --adapter "$$ADAPTER" --out "$$dir/recording.json" --reason="$$REASON" && \
	  tools/gates/gate --contract-replay "$$dir/recording.json"
.PHONY: contract-live

# The history scan before the first push (spec 000 FR-042; plan §12; tasks.md T093), the Author's, in a full clone:
# tools/gates/publish_check.py, through PY_HOST, runs gitleaks over every commit, and the denylist and corpus-check's
# currency rule over every blob, path, and message. It exits 0 clean, 1 with findings, and 3 when it can't certify,
# and make shows any of those as error 2, so its summary line says which. It names commits, paths, lines, and rules,
# never a phrase or a matching line.
publish-check: ## (the Author) Every commit's secrets, denylisted phrases, and corpus amounts, before the first push (FR-042)
	@[ "$${SANDBOX_RUNTIME:-}" != 1 ] || { echo "make publish-check is the Author's: an agent session can't certify the history for publication (plan §12)" >&2; exit 2; }
	$(PY_HOST) tools/gates/publish_check.py
.PHONY: publish-check

# FR-007's canary (plan §13; contracts/env-files.md §8; tasks.md T095), the Author's: tools/gates/matrix_canary.py,
# through PY_HOST, starts one claude -p session with the project's settings alone and a fake value, made at run time,
# for every FR-007 variable, and checks that none reaches the session's environment or its transcript. It runs on the
# Team plan: ANTHROPIC_API_KEY is unset for the session, and API-key auth stops it at its init event. It exits 0
# passed, 1 leaked, and 3 when it can't tell, and prints names, never values.
matrix-canary: ## (the Author) FR-007's canary: a claude -p session with a fake value for every FR-007 variable (plan §13)
	@[ "$${SANDBOX_RUNTIME:-}" != 1 ] || { echo "make matrix-canary is the Author's: it starts a Claude Code session with the project's settings, from your own terminal (plan §13)" >&2; exit 2; }
	$(PY_HOST) tools/gates/matrix_canary.py
.PHONY: matrix-canary

# hello (contracts/gateway-http.md §2 and §9): scripts/hello.py, by path through PY_HOST, sends POST /hello to ENV's
# gateway and prints the status and the body. It sends no token, since hello needs none. From your terminal it goes
# straight to the stack's api port on 127.0.0.1 (18000, 18100, or 18300); inside the sandbox, for dev-cpu only, the
# script makes the operator CLI's hop, through the relay, in a breach-probe container that calls the gateway
# in-network. Agent sessions are kept off prod and dev here and in the script, as the operator targets are. MESSAGE
# comes from the command line only and reaches the script as "$$MESSAGE", read by the shell; without it the gateway
# answers "Hello.".
HELLO = $(PY_HOST) scripts/hello.py --stack $(ENV)

hello: ## POST /hello to ENV's gateway, and print the status and body: [MESSAGE="..."] (agent sessions: dev-cpu only)
	@[ "$${SANDBOX_RUNTIME:-}" != 1 ] || [ "$(ENV)" = dev-cpu ] || { echo "make $@ ENV=$(ENV): agent sessions send hello to dev-cpu only; prod and dev are the Author's (FR-008, FR-039)" >&2; exit 2; }
	$(HELLO)$(if $(call from_cli,MESSAGE), --message="$$MESSAGE")

# The Author's terminal: it reaches the registries. ONLY=svc,... limits it; TAG="svc=tag ..." pins a tag (an open
# one, such as seaweedfs's, otherwise gets the newest release); DRY_RUN=1 prints the table and writes nothing.
# The values reach the script through the environment, quoted by the shell, never spliced into the command line.
pin-images: ## (the Author) Resolve deploy/images.lock's tags to digests, and rewrite it and compose.yaml (plan §2)
	@set -f; set --; for tag in $${TAG:-}; do set -- "$$@" --tag "$$tag"; done; \
	$(PY_HOST) deploy/scripts/pin_images.py $${ONLY:+--only "$$ONLY"} $${DRY_RUN:+--dry-run} "$$@"

# The breach test (plan §8; contracts/env-files.md §7.2; FR-036's only entry point): evals/breach.py, by path through
# PY_HOST, trips the kill switch on purpose and prints a table of every assertion. dev and dev-cpu only. dev is the
# Author's, on the host's engine, from the export of the commit its make up started, so the probe it builds is that
# commit's too; DELIVERY=real, dev only, is SC-002's recorded run with the real channels. dev-cpu is an agent
# session's: inside the sandbox make runs itself again through the relay, so the run is on the agents' engine only,
# and the script refuses any other engine (FR-039). DELIVERY comes from the command line only, read by the shell.
breach-test: ## The kill-switch rehearsal on dev or dev-cpu (plan §8); DELIVERY=real is dev's recorded run, the Author's
	@case "$(ENV)" in dev|dev-cpu) ;; *) echo "make breach-test runs on dev or dev-cpu, never $(ENV) (FR-036)" >&2; exit 2 ;; esac
	@[ -z "$(call from_cli,DELIVERY)" ] || [ "$(ENV)" = dev ] || { echo "make breach-test DELIVERY=real is dev's recorded run, in the Author's terminal (contracts/env-files.md §7.2)" >&2; exit 2; }
ifeq ($(VIA_RELAY),1)
	@[ "$(ENV)" = dev-cpu ] || { echo "make breach-test ENV=$(ENV): agent sessions run dev-cpu only, on their own engine (FR-039); the Author runs dev" >&2; exit 2; }
	@[ -x $(RELAY) ] && [ -f "$(ENGINE_CERT)" ] || { echo "make breach-test: the agents' engine isn't set up yet (tasks.md T046); ask the Author" >&2; exit 2; }
	$(RELAY) make --no-print-directory breach-test ENV=dev-cpu
else
	@[ "$${SANDBOX_RUNTIME:-}" != 1 ] || [ "$(ENV)" = dev-cpu ] || { echo "make breach-test ENV=$(ENV): agent sessions run dev-cpu only, on their own engine (FR-039); the Author runs dev" >&2; exit 2; }
	@[ -z "$(RUNFILE)" ] || [ -f "$(RUNFILE)" ] || { echo "make breach-test ENV=$(ENV): h4reet-$(ENV) wasn't started by make up (no $(RUNFILE))" >&2; exit 2; }
	@[ -f "$(TREE)/evals/breach.py" ] || { echo "make breach-test ENV=$(ENV): the commit being run has no evals/breach.py" >&2; exit 2; }
	$(PY_HOST) $(TREE)/evals/breach.py --stack $(ENV) --env-file $(ENVFILE)$(if $(RUNFILE), --run-file $(RUNFILE))$(if $(call from_cli,DELIVERY), --delivery="$$DELIVERY")
endif

plan: ## Terraform plan for ENV (never apply from here); infra/ arrives with spec 001
	cd infra && terraform init -input=false && terraform workspace select $(ENV) && terraform plan -input=false -out=tf.plan

.PHONY: help setup tools toolchain-check makefiles-check check policy githooks-check git-hooks build lint fmt fmt-file lint-file test test-fast content-check \
	corpus-check secrets validate-config engine-status engine-smoke evals evals-agent-config redteam redteam-suite matrix up up-export down logs status pull image gateway-image web-image compose-images pin-images \
	init-env aws-login operator-token operator-status operator-init hello isolation-check breach-test plan

# Before it runs a target, make remakes each makefile it has read, with its built-in rules: a Makefile.sh or
# GNUmakefile.sh planted beside one is copied over it (cat $< >$@), and make then runs the copy (T183's review; plan
# §11, Principle IV). An empty rule for every makefile read before this line, which stays the last, leaves make nothing
# to remake them with, whatever path it read them by; and with no suffixes, no suffix rule is left for any target.
$(MAKEFILE_LIST): ;
.SUFFIXES:
