---

description: "Task list for spec 000, Local Foundations"
---

# Tasks: Local Foundations — The Whole Production Stack in Compose, Governed and Metered

**Input**: the design documents in `specs/000-local-foundations/`: plan.md, research.md, data-model.md, contracts/, quickstart.md.

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, the eight contracts, quickstart.md.

**Tests**: required. The constitution's workflow writes tests with or before code, and the spec requires the adapter contract suite (FR-024), the breach test (FR-036), and the forbidden-action matrix (SC-003). In each story, the test tasks come first and must fail before the code that makes them pass.

**Organization**:
- Tasks are grouped by user story, in the spec's priority order: US1, US2, US3 (P1), US5 (P2), US6 (P3). User Story 4 moved to the publication spec and has no tasks.
- Each phase is one feature branch. Its last task is a merge-request note in `docs/merge-requests/` carrying `make check`'s output and a reviewer agent's REVIEW.md passes (FR-041). The Author merges the branches in phase order.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task). Several [P] tasks also add their own make target; each target is its own block in the Makefile, so those edits don't conflict.
- **[USn]**: the user story the task serves.
- **Author**: only the Author runs it, in their own terminal, because it needs sudo, the GPU, the host's Docker, Bedrock, real alert delivery, or the operator token. Heavy Author steps (big downloads, model loads, stack bring-ups, anything ending in `wsl --shutdown`) are their own step, taken when no agents are working and the branch is committed, after the disk preflight (research.md R-32).
- **Patch**: changes to `.claude/**`, `CLAUDE.md`, `config/budgets*`, or `config/alert*`, or to a path an earlier patch made human-only, can't be made by agents (FR-008). A task marked Patch writes its change into a patch file under `docs/merge-requests/`, and the Author applies it with `git apply` at merge.

## Path conventions

- The gateway is `services/gateway/` (`src/`, `test/unit/`, `test/contract/`, `test/integration/`, `migrations/`).
- Compose and its configuration are in `deploy/`; the gateway's configuration in `config/`; Author-run gates in `tools/gates/`; the agents' engine in `deploy/agents-engine/`; harnesses in `evals/` and `redteam/`.
- "§" refers to plan.md unless another file is named.

---

## Phase 1: Setup (shared toolchain) — branch `feat/000-setup`

**Purpose**: one toolchain for humans and agents, the workspace, and the local gate's skeleton.

- [X] T001 Rework the head of `Makefile` per §4:
  - `ENV`, from the command line only and defaulting to `prod`, with a check that refuses anything but exactly `prod`, `dev`, or `dev-cpu`, and refuses a stack's name from the environment;
  - `ENVFILE`: `deploy/env.agents/dev-cpu.vars` for dev-cpu, `$(HOME)/.config/h4reet-ai/env/$(ENV).env` otherwise;
  - `COMPOSE`, per §4: `docker compose -p h4reet-$(ENV) -f $(TREE)/deploy/compose.yaml --env-file $(ENVFILE)`, plus `--env-file $(H4_STATE_DIR)/run.env` on host stacks, where `TREE` is the running export (from the run file) on host stacks and `.` on dev-cpu;
  - `PY_HOST := python3 -I -B -X pycache_prefix=/dev/null` (Phase 1's review replaced the `mktemp -d` prefix, which loads planted bytecode when mktemp fails), for every Python a recipe runs in the Author's terminal, by script path and never with `-m` (research.md R-35).

  Keep the existing UV_CACHE_DIR and PYTEST logic, pinning pytest to `--with pytest==9.1.1 --with pyyaml==6.0.3` (round 2 of Phase 1's review: `--with-requirements .devcontainer/requirements-tools.txt`, the devcontainer's six pinned packages).
- [X] T002 [P] Create the root `package.json`: private, `workspaces: ["services/*"]`, `engines.node ">=24.21 <25"`, scripts that delegate to the workspaces. Generate `package-lock.json` with `npm install --ignore-scripts` (the registry is allowlisted). Commit no `.npmrc`.
- [X] T003 [P] Create `tsconfig.base.json` (strict, ES2023, NodeNext), `eslint.config.js` (eslint 10.12.0, typescript-eslint 8.71.1, eslint-config-prettier 10.1.8, globals 17.13.0), `.prettierrc.json`, and `.prettierignore` (§9).
- [X] T004 [P] Create `.dockerignore`, excluding `.git`, `deploy/env`, `*.env`, `**/node_modules`, `**/dist`, `**/__pycache__`, `corpus/intake/private`, `.cache`, and `.pytest_cache`.
- [X] T005 Update these targets in `Makefile` per §9 and §11:
  - `setup`: `npm ci --ignore-scripts`, then `make git-hooks`. Remove the `pip install -r requirements.txt` and `pre-commit install` lines.
  - `lint`: `eslint --max-warnings 0`, `tsc --noEmit` per workspace, `prettier --check`, `ruff check` and `ruff format --check --no-cache`, and `shellcheck` on every tracked `*.sh`, `.claude/hooks/*.sh`, and `.claude/git-hooks/*`.
  - `fmt`.
  - `test`: `corpus-check`, `npm test --workspaces --if-present`, and pytest with `-q -p no:cacheprovider` over `corpus/tools`, `evals`, `redteam`, `tools/gates`, `deploy/scripts`, `deploy/agents-engine`, and `scripts`.
  - `test-fast`.
- [X] T006 Restructure `make check` in `Makefile` per §11.
  - It runs `githooks-check toolchain-check policy validate-config lint test secrets evals redteam matrix image` in that order and keeps going after a failure.
  - It prints PASS, FAIL, SKIP (with a reason), PENDING, or PLANNED (naming the task that writes the patch) per target, then a summary line, and exits non-zero on any FAIL or PENDING. PLANNED doesn't fail the run (§11).
  - Inside the sandbox (`SANDBOX_RUNTIME=1`), it exports `npm_config_cache=$TMPDIR/npm-cache`.
  - A target that doesn't exist yet prints `SKIP (added by Tnnn)`.
  - `githooks-check` keeps the existing reference-transaction check, and reports `.claude/git-hooks/pre-commit` as PLANNED (T045) until the early patch adds it and clears the mark (T046).
- [X] T007 [P] Create `.devcontainer/Dockerfile`, `.devcontainer/devcontainer.json`, `.devcontainer/toolchain.vars`, and `.devcontainer/requirements-tools.txt` per §9.
  - **Base:** `public.ecr.aws/docker/library/ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55`.
  - **Tools:**
    - Node 24.21.0, copied from the digest-pinned official Node image, which installs and checks nodejs.org's release tarball (plan §9);
    - uv 0.8.22 and ruff 0.16.10, copied from their pinned images (research.md R-02);
    - gitleaks 8.30.1, from its pinned image;
    - pytest 9.1.1 and pyyaml 6.0.3, with `--require-hashes` (hashes from pypi.org), into `/opt/tools`.
  - **Users:** the `ubuntu` user is replaced by `dev` (uid 1000) with no sudo.
  - **Build arguments:** `WITH_CLAUDE=0` and `WITH_TERRAFORM=0`.
  - **`devcontainer.json`:** no `features`, no `initializeCommand`, no socket or home mounts; `runArgs ["--cap-drop=ALL","--security-opt=no-new-privileges"]`; `postCreateCommand: make setup`.
- [X] T008 [P] Create `tools/gates/toolchain_check.py` (stdlib, `python3 -I`) and `tools/gates/test/test_toolchain_check.py`. The check compares installed versions against `.devcontainer/toolchain.vars`: Node, uv, ruff, shellcheck, jq, Python, gitleaks, pytest, the lint toolchain, and Claude Code. It prints a table and exits 1 on drift. Wire `make toolchain-check` (§9).
- [X] T009 [P] Create `tools/gates/lint-node/package.json`, its `package-lock.json`, `eslint.config.mjs`, and `prettier.config.json`: the human-only lint toolchain for the post-edit hook, with versions as in T003 plus typescript 6.0.3 (research.md R-25). Add `make tools` (Author), through `tools/gates/install-tools.sh`, which installs:
  - Node 24.21.0 through nvm, leaving the shell's default Node alone;
  - `uv tool install --no-config --python "$(command -v python3)" pytest==9.1.1 --with pyyaml==6.0.3`;
  - gitleaks into `~/.local/bin`, with `docker cp` from the pinned image;
  - this toolchain into `~/.local/share/h4reet/lint-node`, with `npm ci --ignore-scripts`.
- [X] T010 [P] Create the eval scaffold in `evals/` per §14:
  - `evals/__init__.py`;
  - `evals/run.py`: stdlib plus pyyaml; suites in `evals/<suite>/cases/*.yaml`; adapters `fake`, `local`, `bedrock`; deterministic scoring; history only for real runs; the repository root appended to `sys.path`, not prepended;
  - `evals/product/cases/hello-fake.yaml`, one case that passes on `fake`;
  - `evals/test_run.py`.

  `make evals` runs `python3 evals/run.py --suite product --adapter fake` in the sandbox, and `$(PY_HOST) evals/run.py` for the Author's `ADAPTER=local` or `bedrock` runs: by path, never `-m`.
- [X] T011 [P] Create the red-team scaffold: `redteam/__init__.py`, `redteam/run.py` (one benign case passes, and one planted unsafe response must be detected), `redteam/cases/*.yaml`, and `redteam/test_run.py`. Make `make redteam-suite` run it through `PY_HOST`, add `make matrix` for `bash redteam/forbidden-actions.sh`, and make `make redteam` run both (§11, §13, §14).
- [X] T012 [P] Create the static agent-config checks per §14: `evals/agent-config/static.py`, `tools/gates/roles.expected`, and `evals/agent-config/test_static.py`. They check:
  - CLAUDE.md has at most 60 lines and 6 KB (FR-006);
  - CLAUDE.md and REVIEW.md name the constitution as superseding (FR-002);
  - each `.claude/agents/*.md` `tools:` line equals `tools/gates/roles.expected`;
  - the hooks are registered in `.claude/settings.json`;
  - every FR-007 variable is denied (contracts/env-files.md §8). A name whose deny a patch hasn't applied yet is reported as PLANNED, naming the task that writes the patch (T045), not as FAIL.

  `make evals` runs it.
- [X] T013 **Author**, on this branch, before its note: quickstart.md §0.3. `make tools`, which installs Node 24.21.0 through nvm and leaves your default Node alone, then `make toolchain-check`, which must pass, and `gitleaks version`, which must print 8.30.1. Tools that `make tools` doesn't install (uv, ruff, shellcheck, jq, Python, and Claude Code) must already match their pins in `toolchain.vars`. T007 writes those pins from the host's versions; Claude Code updates itself until the early patch sets `DISABLE_AUTOUPDATER`, so if it moved since T007, update its pin on this branch. The early patch's hooks fail closed without gitleaks (T045).
- [X] T014 Write the merge-request note `docs/merge-requests/<date>-feat-000-setup.md`, with `make check`'s full output and a reviewer agent's REVIEW.md passes.

**Checkpoint**: `make check` runs every target, with SKIPs and PLANNED items named, and `make toolchain-check` passes once the Author has run `make tools` (T013).

---

## Phase 2: Foundational (blocking) — branch `feat/000-foundations`

**Purpose**: the gateway's skeleton, the store, the compose skeleton, the env files and preflight, and the agents' engine. The engine is foundational: agents can't run containers to test US1 and US2 until it exists and its sandbox opening is applied (FR-039). Its proofs belong to US3.

**⚠️ CRITICAL**: no user-story work starts until this phase is merged.

### Gateway skeleton and store

- [X] T015 Create the gateway package in `services/gateway/`:
  - `services/gateway/package.json`, with the exact runtime and dev versions in plan.md's Technical Context, including @types/node 24.19.1;
  - `tsconfig.json`, `tsconfig.build.json`, and `vitest.config.ts`;
  - scripts `build`, `test`, `test:unit`, `lint`, `fmt`, `validate-config`, and `contract:replay`.
- [X] T016 [P] Create `services/gateway/src/core/types.ts` exactly as contracts/provider-adapter.md §2: `ProviderAdapter`, `CompletionRequest`, `AdapterResult`, `HealthStatus`, the `ProviderError` kinds, `DegradedCause`, and `RouteDecision`, with attribution `none|fallback|metered|test` and the `fixedUsage`, `type`, `server`, and `retry` members.
- [X] T017 [P] Create `services/gateway/src/core/clock.ts` and its test `test/unit/clock.test.ts`.
  - The gateway clock is real UTC time plus `stack_state.test_clock_offset_ms`.
  - Day keys are `YYYY-MM-DD` and month keys `YYYY-MM`, in UTC.
  - Timeouts, retries, rate limits, and health intervals use the real clock (data-model.md, Conventions).
- [X] T018 Write `services/gateway/test/unit/config.test.ts` first. It covers every validation error and exit-78 refusal in contracts/config-files.md §1.3–§1.4, §2.4–§2.5, §3.3, and §4.3–§4.4 (P7's paid price above 0 and B8's dev thresholds equal to prod's among them), and a pin test for prod's thresholds: 3,500,000, 14,000,000, and a first-grant warning at 1,400,000 micro-USD.
- [X] T019 Implement `services/gateway/src/config/load.ts` and `validate.ts` (zod) for the four config files, making T018 pass. Then implement `npm run validate-config` (contracts/config-files.md §5) and `make validate-config`. A protected file that a patch hasn't applied yet (`budgets.yaml` and `alerts.yaml`, before T022's patch) is reported PLANNED (T022), not FAIL (§11).
- [X] T020 [P] Create `config/routing.yaml` at the first of contracts/config-files.md §1.2's steps: the `local` adapter alone, and no fallback in either route (`prod: {primary: local}`, `dev: {primary: local}`). Every adapter the file defines must be registered when it lands (rule R6), so T073 adds `synthetic` and dev's fallback, T102 adds `bedrock` with its placeholder model, and the Author adds prod's fallback (T105).
- [X] T021 [P] Create `config/prices.yaml` per contracts/config-files.md §2.2: version `2026-10-08.1`, local at 0, dev's synthetic at an output price of 100 per million tokens, and no Bedrock entry. The Author appends a new version for Bedrock (T105), because a published version never changes (P5).
- [X] T022 **Patch**: write `config/budgets.yaml` and `config/alerts.yaml` exactly as contracts/config-files.md §3.2 and §4.2, as the patch file `docs/merge-requests/<date>-feat-000-foundations-config.patch`. Both paths are protected (FR-008), so the Author applies it. The unit tests use fixtures in `services/gateway/test/fixtures/`.
- [X] T023 Write `services/gateway/test/unit/validate-env.test.ts` first, then implement `services/gateway/src/config/validate-env.ts` per contracts/env-files.md §4 and §11 and §5.8. Exit 78 with a named reason when:
  - `H4_STACK` and `H4_ENV` disagree;
  - a dev-only switch is set outside `H4_ENV=dev`;
  - prod's `ALERT_DELIVERY` isn't `real`, its `TELEGRAM_API_BASE` isn't `https://api.telegram.org`, or `SMTP_TLS` isn't `implicit` or `starttls`;
  - `OPERATOR_TOKEN_SHA256` doesn't match `^[0-9a-f]{64}$`, or equals the dev-cpu dummy's hash on prod (a constant in the source, checked against `deploy/env.agents/dev-cpu.vars` by a test);
  - prod's `GATEWAY_AWS_PROFILE` is unset.
- [X] T024 Write `services/gateway/migrations/0001_state.sql` and `0002_grafana_ro.sql` with every table, column, CHECK, key, index, trigger, and the view exactly as data-model.md §2.1–§2.9. Among others:
  - `stack_state.id` `CHECK (id = 1)`;
  - `CHECK ((state = 'degraded') = (cardinality(crossed) > 0))`;
  - `meters` primary key (`meter`, `period_key`), with `allowance_micro` and `grant_no` set only on `fallback_day`;
  - `ledger.reservation_id` `UNIQUE`;
  - `cost_basis IN ('usage','reservation','expired','none')` and `outcome IN ('ok','error','unknown')`;
  - the append-only trigger on `audit_log`;
  - `alert_outbox.dedupe_key` `UNIQUE`;
  - `incidents` `UNIQUE (ceiling, period_key)`;
  - `v_state`, and `grafana_ro` with SELECT on `audit_log` and `v_state` only.
- [X] T025 Write `services/gateway/test/integration/migrations.test.ts` on PGlite first. It covers applying both migrations, the `schema_migrations` SHA-256 check (exit 1 on a changed file), the audit trigger refusing UPDATE and DELETE, and `grafana_ro` refused on every other table. Then implement `services/gateway/src/meter/store.ts`:
  - the `pg` pool with `statement_timeout=250ms`, `lock_timeout=250ms`, `idle_in_transaction_session_timeout=2s`, and `connectionTimeoutMillis=500`, at most 10 connections plus one LISTEN connection;
  - migrations under a fixed advisory lock;
  - a store that is down at startup retried every 5 s, with every request answered `store_unreachable` meanwhile (data-model.md §2.1);
  - exit 78 `schema_newer_than_code` when the store records a migration this build doesn't have, the way a rollback across a migration fails closed (§2.1);
  - the `grafana_ro` password set from `GATEWAY_GRAFANA_RO_PASSWORD` as a SCRAM verifier (§2.9).
- [X] T026 [P] Create the gateway's telemetry, `services/gateway/src/telemetry/otel.ts`, `metrics.ts`, `log.ts`, and `redact.ts`, per contracts/telemetry.md §2, §3.1, §4.1, and §5:
  - the OTLP/HTTP exporters, with metrics every 10 s, cumulative temporality, and explicit buckets up to 120 s;
  - every canonical instrument, with units `{USD}` and `{flag}` as §4.1 gives them;
  - pino `redact` paths for `authorization`, `*token*`, `*password*`, and `messages`;
  - no client identifier in any metric attribute;
  - `instrumentation-undici`'s `ignoreRequestHook` skipping the Telegram API host, whose URL carries the bot token (contracts/telemetry.md §3.1).

  Test it in `test/unit/telemetry.test.ts` with in-memory exporters.
- [X] T027 Create `services/gateway/src/app.ts` and `src/server.ts`:
  - two listeners, the api on 8080 and admin on 8081, and graceful shutdown;
  - startup order: validate env and config (exit 78 on failure), connect the store (retrying), then start the listeners and background tasks;
  - `GET /health/live` in `src/routes/health.ts` (contracts/gateway-http.md §4).
- [X] T028 Create `services/gateway/Dockerfile`, built from the repository root as its context: in `deploy/compose.yaml` the gateway's `build.context` is `..`, relative to the compose file, so on a host stack it resolves inside the export, and on dev-cpu inside the working tree (the compose policy, T037, refuses any other context):
  - build stage on `public.ecr.aws/docker/library/node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66`: `npm ci --ignore-scripts`, with the `H4_BUILD_PROXY` build arguments passed through as `HTTP(S)_PROXY`, then `npm run build -w services/gateway`, then the dev dependencies pruned;
  - runtime stage on the same base, as `USER node`, running `node dist/server.js`.

### Compose skeleton, env files, preflight

- [X] T029 Create `deploy/compose.yaml` with the networks `internal` (`internal: true`), `edge`, and `egress`, and the services `edge`, `gateway`, and `gateway-state`, with the images, binds, health checks, limits, and every-service rules of §1 and §2.
  - Only `edge` publishes ports, on literal `127.0.0.1`, mapping `${H4_API_PORT}` through `${H4_OTLP_PORT}` to 8080–8084.
  - Only `gateway` joins `egress`.
  - Bind sources come from `${H4_TREE}`, `${H4_STATE_DIR}`, and `${H4_AWS_DIR}`.
  - There is no `container_name`, no `env_file:`, and no `external:`.
- [X] T030 [P] Create `deploy/edge/nginx.conf` per §2's edge paragraph and contracts/gateway-http.md §6:
  - five server blocks: 8080 to `gateway:8080`, 8081 to `langfuse-web:3000`, 8082 to `grafana:3000`, 8083 to `gateway:8081`, and 8084 forwarding only `POST /v1/metrics` to `otel-collector:4319`;
  - `resolver 127.0.0.11 valid=10s`;
  - `X-Forwarded-For $remote_addr`, replacing any the client sent;
  - `traceparent`, `tracestate`, and `baggage` cleared on 8080 (contracts/gateway-http.md §1);
  - `error_page 502 504 = @api_unavailable`, with the JSON body and `X-H4-Degraded-Cause: api_unavailable`;
  - body limits of 16 KB on 8080 and 4 KB on 8083;
  - access logs without payloads;
  - `/ping` on 8090.
- [X] T031 [P] Create the env files with every key in contracts/env-files.md §2–§6, using the values, placeholders (`__GENERATE__`, `__ASK__`, `__REPO__`, `__HOME__`), and dummies the contract gives:
  - `deploy/env.example/prod.env.example`;
  - `deploy/env.example/dev.env.example`;
  - `deploy/env.agents/dev-cpu.vars`, with dummies only (§6.1). Only it has `H4_TREE`; host stacks get theirs from the run file (§12);
  - `deploy/aws-none/README.md`.
- [X] T032 [P] Create `deploy/scripts/init_env.py` (stdlib, `python3 -I`) and `deploy/scripts/test_init_env.py` per contracts/env-files.md §9. Run through `PY_HOST`. It writes `~/.config/h4reet-ai/env/<stack>.env` at 0600 in a 0700 directory, and for prod creates `~/.config/h4reet-ai/aws-home/.aws` (0700, empty), generates each `__GENERATE__` value in the shape §9.2 gives, refuses to overwrite, prints the names of the `__ASK__` keys left, and supports `SYNC=1`. Wire `make init-env` (Author).
- [X] T033 Create `deploy/scripts/preflight.py` (stdlib, `python3 -I`; env files parsed as data, never sourced) and `deploy/scripts/test_preflight.py`, with fixture env files and a stubbed `df` and `docker`. Run through `PY_HOST`. It implements checks P1–P21 of contracts/env-files.md §10, including:
  - the free space on the Windows drive holding the vhdx (`df` on `H4_VHDX_MOUNT`, default `/mnt/c`) and on ext4, for the bytes the run will write plus 20 GB;
  - a dev-cpu run from a linked worktree (P20).
- [X] T034 [P] Create `deploy/scripts/redact.sh` (ops.md's filter, verbatim), `deploy/scripts/status.py`, and its test. `status.py` shows the running commit, its branch, and the previous commit, from the run file, and reports a host stack with no run file as not started by `make up` (contracts/env-files.md §12). Wire `make logs` (through `redact.sh`) and `make status` (§4).
- [X] T035 [P] Create `deploy/scripts/pin_images.py` and its test, which uses recorded `docker buildx imagetools inspect` output. It resolves tags to index digests, rewrites `deploy/compose.yaml` and `deploy/images.lock`, and prints the table. Create `deploy/images.lock` with research.md R-02's pins. Wire `make pin-images` (Author).
- [X] T036 Implement `make up`, `make down`, `make build`, `make pull`, and `make image` in `Makefile` per §4, and create `deploy/scripts/export_tree.py` and its test:
  - `up`, on a host stack: `export_tree.py` resolves `REF` (default `HEAD`), exports the commit with `git archive` into `${H4_STATE_DIR}/tree/<sha>`, read-only, and writes `${H4_STATE_DIR}/run.env` (contracts/env-files.md §12). It keeps the running and the previous commit's exports, and at most three in all. Then preflight; then `pull-models.sh` for the stack; then `up -d --build --wait --wait-timeout 600`, with the export's compose file and both env files; then `status.py`, with §4's exit codes. `make up REF=<previous sha>` is the rollback. The export runs as its own target, which `up` depends on: make expands a recipe just before running it, and the Makefile reads `TREE` from the run file then, so the compose call uses the commit just exported;
  - `up`, on dev-cpu: the same from the working tree and `dev-cpu.vars`, with no export;
  - `down`: `down --timeout 30`, never `-v`, with the running export's compose file. With no run file, `down` and `logs` say the stack wasn't started by `make up`, and do nothing (§12);
  - `build`: ends with `BUILD OK`. It refuses outside the sandbox and the devcontainer (§11), so the gate's host phase builds images with `make image`, never `make build`. The devcontainer has no Docker, so there `build` builds the workspaces and says the images are the gate's;
  - `pull`: Docker Hub images one at a time, with 5, 15, and 45 s backoff, naming an HTTP 429 (research.md R-29);
  - `image`, §11's gate: the compose images built on the current engine. It reports SKIP ("no engine yet: tasks.md T046") before the engine exists, and FAIL ("ask the Author: deploy/agents-engine/engine.sh up") once it exists and is down.
- [X] T037 [P] Create `tools/gates/compose_policy.py` and `tools/gates/test/test_compose_policy.py` (fixture configs), implementing every refusal in §11's policy list, build contexts included. Wire `make policy`, which runs it over `docker compose config --no-interpolate` for each env file and template; it needs no daemon.

- [X] T038 [P] Start `docs/data-flow-disclosure.md` with the columns of §16, and rows for every service this branch's compose file defines (edge, gateway, gateway-state), for image pulls, and for the phone-homes switched off (§17). The compose policy requires a row per service, so every later task that adds a service adds its row.

### The agents' engine (FR-039)

- [X] T039 [P] Write `deploy/agents-engine/test/test_authz.py` first, on recorded Docker API request bodies, with a case for every rule A0–A35 of contracts/agents-engine.md §3. Then implement `deploy/agents-engine/authz.py`, a stdlib Docker authorization plugin on a Unix socket in `h4agents`' plugin directory:
  - the allowed bind roots are `/run/h4agents/tree` (read-only), `/run/h4agents/models` (read-only), and `/var/lib/h4agents/state`;
  - `CapAdd` is allowed only within Docker's default capability set;
  - the audit record follows §3.5.
- [X] T040 [P] Write `deploy/agents-engine/test/test_egress_proxy.py` first, then implement `deploy/agents-engine/egress-proxy.py` (stdlib) per contracts/agents-engine.md §4:
  - CONNECT to 443, and absolute-form GET to 80, only for the hosts in `.claude/settings.json` `sandbox.network.allowedDomains`, read at start;
  - IP literals refused, and names that resolve to non-global addresses refused;
  - a missing, unreadable, or invalid settings file, or an empty list, refuses every request (`no_list`): fail closed;
  - every decision logged.
- [X] T041 [P] Create `deploy/agents-engine/daemon.json`, `deploy/agents-engine/systemd/*`, and `deploy/agents-engine/docker-relay` per contracts/agents-engine.md §2 and §5:
  - `daemon.json`: the containerd image store, `authorization-plugins: ["h4-authz"]`, and no BuildKit entitlements;
  - the systemd units: the dummy interface `h4agents0` holding `198.18.0.1/32`, the tree and models binds mounted `nosymfollow`, the `/dev/dxg` group, the `h4agents` slice limits, and the user services for `dockerd-rootless`, `h4-authz`, and the egress proxy;
  - `docker-relay`: socat through the sandbox proxy, `DOCKER_HOST=tcp://127.0.0.1:2376`, `DOCKER_TLS_VERIFY=1`; it runs only `docker` or `make` as its command, and refuses anything else with exit 2 (§2.2);
  - `tree-masks.txt`: `deploy/env`, `corpus/intake/private`, `secrets`, and `.git` (H8).
- [X] T042 Create `deploy/agents-engine/setup-host.sh` (sudo, idempotent) per contracts/agents-engine.md §5 (H1–H14). It sets up:
  - the `h4agents` user, its own subuid and subgid range, and lingering, and lingering for the Author's user too (the egress proxy is the Author's user service);
  - the slice limits: `CPUQuota=400%`, `MemoryMax=16G`, `TasksMax=4096` (H12);
  - the `h4gpu` group and `/dev/dxg` mode 0660;
  - the nftables `skuid` table, allowing established traffic and `198.18.0.1:3128` only;
  - `/etc/wsl.conf` automount `umask=077,fmask=077`, printing the `wsl --shutdown` it needs;
  - `/var/lib/h4agents/models` (root-owned) and `/var/lib/h4agents/state` (owned by `h4agents`);
  - root-owned installed copies of `authz.py` and `egress-proxy.py`;
  - the PKI: a CA, a server certificate with SANs `198.18.0.1` and `127.0.0.1`, and a client certificate in `~/.config/h4reet/agents-engine/docker/`.
- [X] T043 Create `deploy/agents-engine/engine.sh` with the subcommands `setup`, `up`, `down`, `reset`, `destroy`, `seed`, `status`, `prove`, and `smoke` (contracts/agents-engine.md §8). The Author runs it directly; the Makefile gets only `make engine-smoke` and `make engine-status`, for agents.
  - `up` checks `tree-masks.txt` against the sandbox's read denies inside the tree, creates any masked directory that doesn't exist, and refuses while a file matching a denied glob sits outside a mask, naming it (H8).
  - `seed` checks the host's image store and the disk preflight, then moves each digest in `images.lock` with `docker save | docker load`, and copies the stand-in into `/var/lib/h4agents/models`.
  - `up` chowns the state directory through the rootless namespace.
- [X] T044 Create `deploy/agents-engine/prove-limits.sh`, implementing rows E1–E14 of contracts/agents-engine.md §7. Its report goes into the merge-request note. `engine.sh prove` runs it (Author; Heavy).
- [X] T045 **Patch**: write the early patch, `docs/merge-requests/<date>-feat-000-foundations-enforcement.patch`, per §10 and §15. It must be applied before any real secret exists (T065), so it carries the engine opening, the credential denies, and secret scanning:
  - `.claude/settings.json`:
    - `sandbox.network.allowedDomains` gains `"198.18.0.1:2376"`;
    - `env` gains `DOCKER_CONFIG=~/.config/h4reet/agents-engine/docker` and `DISABLE_AUTOUPDATER=1`;
    - every credential deny of §15: `~/.config/h4reet-ai` (read and write), `~/.local/state/h4reet` (write), the other credential stores, the shell histories, `/mnt/c/Users`, and `/etc/h4agents/pki`, with `Edit(...)` denies for the first two;
    - every FR-007 variable name of contracts/env-files.md §8, in `credentials.envVars`;
    - `Read(~/.config/h4reet-ai/**)` in `permissions.deny`, and `~/.config/h4reet-ai` in `credentials.files`;
    - `denyWrite` on `./config/prices.yaml`, `./config/budgets.yaml`, `./config/alerts.yaml`, `./GNUmakefile`, `./makefile`, `./deploy/agents-engine`, `./.gitleaks.toml`, and `./.gitleaksignore`, with the matching `Edit(...)` denies.
  - `.claude/agents/ops.md`: grants `Bash(deploy/agents-engine/docker-relay docker *)`, points its diagnostic commands at `make status ENV=$ENV` and `make logs ENV=$ENV`, which pass the export's compose file and the run file (plan §4), and at `docker ps` filtered by the project label for ports; and drops the paragraph saying no engine exists. `tools/gates/roles.expected` is updated to match, in the same patch.
  - `.claude/hooks/bash-gate.sh`: blocks `deploy/agents-engine/engine.sh` for agents, by any spelling, except its `smoke` and `status` subcommands: after a wrapper or a leading assignment, past options with an argument and bare durations, and dot-sourced.
  - `.claude/hooks/protected-paths.sh`: `config/prices*`, `GNUmakefile`, `makefile`, `deploy/agents-engine/**`, and `.gitleaks*`.
  - The secret scanners (FR-008, FR-012):
    - `.gitleaks.toml`: the default rules, plus `h4op_prod_` and `h4op_dev_` tokens and `sk-lf-` keys, allowlisting `deploy/env.agents/dev-cpu.vars`, and ADR 0004's false positive scoped to commit 8c15b95, that file, and that rule (a departure, plan §11);
    - the new `.claude/hooks/content-scan.sh`, a PreToolUse check on Edit, Write, and MultiEdit. It writes the edit's text into a fresh directory under its own path relative to the project and runs `gitleaks dir` there, rather than `gitleaks stdin`, so the config's one path allowlist (dev-cpu.vars) applies. It refuses any `.gitleaksignore` outright;
    - `.claude/git-hooks/pre-commit`, which runs gitleaks on the staged changes, with `make git-hooks` installing it.

    Each passes `--config` with the main tree's `.gitleaks.toml`, `--gitleaks-ignore-path` naming a fresh empty directory, and `--ignore-gitleaks-allow`, refuses to run while a `.gitleaksignore` exists at its scan source (research.md R-36), and fails closed when gitleaks is missing (§11).
  - CLAUDE.md: the engine line and the test line rewritten in place, and the "Things Claude gets wrong" line on deny timing added (§15), for 57 lines.
  - The matrix rows for all of these, in `redteam/forbidden-actions.sh`, and the PLANNED marks they clear: `githooks-check`'s for `pre-commit` (T006) and the static tier's for the FR-007 names (T012). The patch itself carries those edits: it deletes `evals/agent-config/static.py`'s PLANNED entries and clears the Makefile's `PRE_COMMIT_PLANNED`, so `make check` passes right after `git apply` (a stale mark fails).
- [ ] T046 **Author** (Heavy, after this branch merges): check `gitleaks version` (T013 installed it). Apply the two patches from T022 and T045, then run `claude doctor`, `make git-hooks`, and `make evals` (the static agent-config tier: the early patch's only agent-config eval, spec Assumptions). This comes before T065: no real secret may exist before the credential denies do (Principle IV). Then quickstart.md §0.4 and §0.5:
  - switch the host's Docker to the containerd image store, pruning first and checking the disk;
  - `deploy/agents-engine/engine.sh setup`, then `wsl --shutdown`;
  - `deploy/agents-engine/engine.sh up`, then `make engine-status`.

  The seed and the engine's proofs come later (T063 and T099), once the models' lock and the last image pin exist. Record the results in the next branch's note.
- [X] T047 Update `docs/how-we-build/lifecycle.md`'s enforcement table with the early patch's layers (T111 completes it), then write the merge-request note `docs/merge-requests/<date>-feat-000-foundations.md`. It lists every change to anything that runs in the Author's terminal under its own heading, first: the Makefile, `deploy/scripts/**`, `deploy/agents-engine/**`, and `tools/gates/**` (ADR 0017).

**Checkpoint**: the gateway starts and refuses bad configuration with exit 78. Once T046 is done, agents reach the engine through the relay (`make engine-status`). dev-cpu's first run waits for the seed (T063).

---

## Phase 3: User Story 1 — the whole production stack runs locally (P1) 🎯 MVP — branch `feat/000-us1-local-stack`

**Goal**: one command brings up the complete topology on the 5090 host. hello answers from the local model, with a complete trace in Langfuse and a panel in Grafana.

**Independent test**: quickstart.md §1, run cold on the 5090: `make up`, then `make operator-init`, a local hello, the trace, the panel, `make isolation-check`, and `make down`.

### Tests for User Story 1

- [X] T048 [P] [US1] Create `services/gateway/test/contract/adapter-contract.ts`, exporting `describeAdapterContract(name, makeAdapter, mode)` with assertions C1–C12 of contracts/provider-adapter.md §5.2. Create `test/contract/local-openai.contract.test.ts`, running it against an in-process stub OpenAI server on the sandbox's own loopback.
- [X] T049 [P] [US1] Create `services/gateway/test/integration/hello-local.test.ts` (Fastify `inject`, PGlite). It covers:
  - `store_uninitialized` before init;
  - after init, a 200 body exactly as contracts/gateway-http.md §2.5.1;
  - a ledger row with attribution `none`, cost 0, and cost basis `none`;
  - the server, `gateway.route`, and `chat {model}` spans;
  - the `/health` JSON exactly as §5;
  - 400 and 415 per §2.5.4.
- [X] T050 [P] [US1] Create `services/gateway/test/integration/init.test.ts`, covering data-model.md §8:
  - candidates from the ledger, the journal, and stated values, with the max rule;
  - the newest `init` record in the journal as a floor (data-model.md §3, step 6): a second wipe after a stated start rebuilds the stated value plus later spend;
  - 409 `confirm_zero_required`, then success with `confirm_zero`;
  - renewal pending unless `renew`;
  - 409 `already_initialized`;
  - the journal's torn last line skipped and counted;
  - the dev clock restored from the newest `clock` record.

### Implementation for User Story 1

- [X] T051 [US1] Implement `services/gateway/src/adapters/local-openai.ts` and `src/adapters/registry.ts` per contracts/provider-adapter.md §3.1 and §4:
  - `fetch` to `POST {base}/chat/completions`, with a connect timeout of 1 s, a request timeout of 10 s, and no retries;
  - health from `GET {base}/models` every 1 s with an 800 ms timeout, unhealthy after 1 failure and healthy again after 3 passes;
  - the error mapping of §2.5.
- [X] T052 [US1] Implement `services/gateway/src/core/router.ts` and `src/core/gateway.ts` per contracts/gateway-http.md §2.4. A request starts with the state read of data-model.md §7.1, then the kill switch, then local. A stack without a fallback answers `no_fallback_in_stack`. Ledger rows for local calls follow data-model.md §7.4.
- [X] T053 [US1] Implement `services/gateway/src/routes/hello.ts` and `src/core/limits.ts` per contracts/gateway-http.md §2:
  - at most 500 characters of `message`;
  - the fixed system prompt of §2.2, with 128 output tokens;
  - client identity from edge's `X-Forwarded-For` plus an optional `X-H4-Client` label matching `^[a-z0-9-]{1,32}$`;
  - the per-client cap: 20 a minute, burst 5, 500 a day, then 429 `client_cap_exceeded`;
  - responses 200, 503 (with `X-H4-Degraded-Cause`), 429, 400, 415, and 502 `local_error`.
- [X] T054 [US1] Implement `GET /health` in `services/gateway/src/routes/health.ts`, exactly as contracts/gateway-http.md §5.
- [X] T055 [US1] Implement the admin listener's authentication and initialization per contracts/operator-admin.md §1, §2.3, and §4.1:
  - in `services/gateway/src/routes/admin.ts`, bearer authentication with the prefix check before hashing and `timingSafeEqual`. Failures are counted in memory, in 10-minute windows, with at most one `auth_failed` audit row per class per window, carrying the route template, never the raw path (contracts/operator-admin.md §1.1), and an `auth_failed` alert at 3 failures in a window. In US1, alerts are queued as `alert_outbox` rows; US2 adds their delivery (T077);
  - `POST /admin/init` and `GET /admin/status`;
  - `src/meter/init.ts`, following data-model.md §8;
  - `src/meter/journal.ts`, following §3: `O_APPEND`, `fsync`, monthly files at 0600 in a 0700 directory, and the `operator` and `clock` record kinds.
- [X] T056 [US1] Create `scripts/operator.py` (stdlib, run through `PY_HOST`) with `mint`, `status`, and `init`, per contracts/operator-admin.md §6. It reads the token only from `~/.config/h4reet-ai/operator/<stack>.token` and follows §6.2's exit codes. Add `scripts/test_operator.py`, and the Makefile targets `operator-token`, `operator-init`, and `operator-status` (§6.1).
- [X] T057 [US1] Add `model-server-gpu` and `model-server-cpu` to `deploy/compose.yaml` per §3: the profiles `gpu` and `cpu`, the commands and flags, the GPU reservation in `gpu` only, and the health checks. Create `deploy/models.lock` with both models' pins from research.md R-03, one model per line with its file name and sha256 on that line: `engine.sh seed_model` reads it that way, and refuses a model it can't find a sha256 for (review round 2). Create `deploy/scripts/pull-models.sh`:
  - it runs the disk preflight first;
  - it downloads with `curl -fL -C -` and no token;
  - it verifies the sha256, renames atomically, and sets mode 0444;
  - on the engine it only verifies.

  Add the model servers' and the model downloads' rows to `docs/data-flow-disclosure.md`: the compose policy requires a row for every service.
- [X] T058 [US1] Add the observability services to `deploy/compose.yaml`, with the switches of §6:
  - `otel-collector`, with `deploy/otel/collector.yaml` per contracts/telemetry.md §6 (the receivers `otlp` on 4317 and 4318 and `otlp/devtime` on 4319; the traces, metrics, logs, and `metrics/devtime` pipelines; every processor in §6.3; the exporters in §6.4);
  - `prometheus`, with `deploy/prometheus/prometheus.yml` per §6.6;
  - `loki`, with `deploy/loki/loki.yaml`;
  - `grafana`, with `deploy/grafana/provisioning/datasources/*.yaml` (prom, loki, and `gateway` through `grafana_ro`) and `deploy/grafana/provisioning/dashboards/*.yaml`.

  Add their rows to `docs/data-flow-disclosure.md`.
- [X] T059 [US1] Add Langfuse 4.54.0 to `deploy/compose.yaml`: `langfuse-web`, `langfuse-worker`, `langfuse-db`, `clickhouse` (with `deploy/clickhouse/{low-memory,no-crash-reports,prometheus}.xml`), `valkey`, and `seaweedfs` (with `deploy/seaweedfs/entrypoint.sh`, which renders `s3.json` from env and creates the `langfuse` bucket idempotently). Give each the keys of contracts/env-files.md §5 and §6, the off-switches of research.md R-08, and heap caps. Add their rows to `docs/data-flow-disclosure.md`.
- [X] T060 [US1] Create `deploy/grafana/dashboards/h4-runtime.json` (uid `h4-runtime`, a 10 s refresh, UTC, `allowUiUpdates: false`). Give it the US1 panels with the exact queries of contracts/telemetry.md §7.3, §7.4, and §7.6: request count, latency p50 and p95, error rate, model-server health, and telemetry health.
- [X] T061 [US1] Create `deploy/scripts/isolation-check.sh` and `make isolation-check` (Author) per §4.
- [X] T062 [P] [US1] Create the runbooks `docs/runbooks/model-server-down.md`, `docs/runbooks/store-initialization.md`, and `docs/runbooks/rollback.md`, each with Symptoms · Impact · Act · Verify · Undo · Record.
- [ ] T063 [US1] **Author** (Heavy, with no agents working). First, once T046 has applied the config patch and the early patch on main, bring this branch up to date with main (`git switch feat/000-us1-local-stack && git merge main`): without them every gateway exits 78, and the sandbox lacks the engine opening and the credential denies (T143). Then quickstart.md §0.7–§0.8 for prod and dev: `make init-env`, `make operator-token`, the Telegram bot and the mailbox, and every `__ASK__` filled, because `make pull`'s preflight needs complete env files (T146). Then `make pin-images`, which also pins SeaweedFS (quickstart.md §1.6, item 4); `make pull MODELS=all`; then `deploy/agents-engine/engine.sh seed` (quickstart.md §0.9). Commit the pins on this branch. The agents' engine can then run dev-cpu.
- [ ] T064 [US1] Agent session, on the engine: `make up ENV=dev-cpu` comes up healthy, `make operator-init ENV=dev-cpu` with the dummy token, hello answers from the stand-in (`make hello ENV=dev-cpu`, which makes the probe hop, T147), then `make down ENV=dev-cpu`. Paste the output into `docs/merge-requests/<date>-feat-000-us1-local-stack.md`.
- [ ] T065 [US1] **Author** (Heavy): run `quickstart.md` §1 (§0.7–§0.8 are done at T063's start, after the early patch):
  - the first stack task's measurements (§1.6): the prod model's load time and VRAM, whether the internal network blocks egress, and whether an internal-only container can publish a port;
  - a cold `make up ENV=prod`, timed (SC-001);
  - `make operator-init`, the hello, the trace, the US1 panels, `make isolation-check` with dev up, and the port scan from another machine;
  - the rollback rehearsal on dev (§1.12).

  The results go into `docs/merge-requests/<date>-feat-000-us1-local-stack.md`, with no secrets.
- [ ] T066 [US1] Write the merge-request note `docs/merge-requests/<date>-feat-000-us1-local-stack.md`.

**Checkpoint**: US1 runs on the 5090 and on the agents' engine. This is the MVP.

---

## Phase 4: User Story 2 — the kill switch fires before anyone can run up a bill (P1) — branch `feat/000-us2-kill-switch`

**Goal**: metered spend is attributed, alerted on, and capped by the in-stack meter, with fallback limited by the sub-budget and its renewal. It is proven by the 12-step breach test.

**Independent test**: `make breach-test ENV=dev-cpu` (an agent session) passes all 12 steps; `make breach-test ENV=dev DELIVERY=real` is the Author's recorded run (quickstart.md §2).

### Tests for User Story 2

- [X] T067 [P] [US2] Create `services/gateway/test/unit/meter.test.ts`. It covers:
  - `max_micro`, including `fixedUsage`;
  - cost rounded up once, on the sum (data-model.md §7.2);
  - crossings fired only when old < threshold ≤ new;
  - rollover never touching `state`, `crossed`, or `fallback_awaiting_renewal`;
  - reset semantics;
  - every worked case of the renewal allowance in data-model.md §6.2;
  - the sweep settling an expired reservation at its maximum, with `cost_basis` `expired` and `outcome` `unknown`.
- [X] T068 [P] [US2] Create `services/gateway/test/integration/meter.test.ts` (PGlite). It follows the admission and commit transactions step by step (data-model.md §7.2–§7.3): the locking order, the refusal precedence, outbox rows in the same transaction as each crossing, an idempotent commit retry, the sweep, and the reserved-micro invariant (§2.3).
- [X] T069 [P] [US2] Create `services/gateway/test/unit/alerts.test.ts`. It covers:
  - every message in contracts/alerts.md §3, rendered with no payloads, client labels, or secrets (§5);
  - dedupe keys, including `:g<n>`;
  - retries at 5, 15, 30, 60, and 120 s, all within 300 s;
  - the 09:00 UTC reminder;
  - the `[dev]` and `[dev-cpu]` prefixes.
- [X] T070 [P] [US2] Create `services/gateway/test/integration/operator.test.ts`. It covers reset (409 `not_degraded`), renew (409 `not_awaiting_renewal`, and the allowance rule), the reason rule (10–500 characters), the audit rows, the confirmation alerts, and the dev-only test endpoints refused outside dev (403, with `h4.test_machinery.refused`).
- [X] T071 [P] [US2] Create `evals/test_breach_helpers.py` for the probe's assertion helpers: the T, M, and L sources, and the timing windows.

### Implementation for User Story 2

- [X] T072 [US2] Implement metered admission and its upkeep in `services/gateway/src/meter/`:
  - `services/gateway/src/meter/admission.ts`, per data-model.md §7.2: the in-memory slots with 429 `metered_capacity_exceeded` (4 in flight, 60 a minute), the transaction, and the `reserve` journal append, compensated with `journal_unwritable`;
  - `src/meter/commit.ts`, per §7.3 and its crossings table. The slots are released in a `finally` on every way out of a call, and `h4.cost.usd` grows only when this transaction inserted the ledger row;
  - `src/meter/rollover.ts`, per §7.6;
  - the sweep (§2.4) and the 10 s background tasks (§7.7).
  - init's lost acknowledgement (US1's review, deferred here): if COMMIT succeeds on the server but the connection drops before its acknowledgement, `meter/init.ts` answers 503 `store_unreachable` and never appends the journal's `init` record, so a later rebuild loses this init's floor. On a failed COMMIT, re-read `stack_state`; if this actor wrote it, append the record and return the result. `isStoreFailure` also counts a CHECK violation inside the transaction as an outage: count only connection failures. It must land with the first reservation.
- [X] T073 [US2] Implement `services/gateway/src/adapters/synthetic.ts` (dev only, `fixedUsage` of 1,000 output tokens, requires `GATEWAY_TEST_SYNTHETIC_SPEND=1`) and `test/contract/synthetic.contract.test.ts`, which runs the same contract suite (provider-adapter.md §3.3). Add the `synthetic` adapter and dev's `fallback: synthetic` to `config/routing.yaml` (contracts/config-files.md §1.2, step 2). Dev's `fallback: synthetic` arrives with this task, and T074 removes `createServices`' `fallback_not_supported` refusal (plan §5.8, T148), so T073 and T074 land together: until T074, a route with a fallback stops the gateway with exit 78.
- [X] T074 [US2] Complete FR-022 in `services/gateway/src/core/gateway.ts`: the fallback branch with every admission cause (`meter_at_ceiling`, `fallback_awaiting_renewal`, `fallback_spent_today`, `fallback_unavailable`, `journal_unwritable`), in data-model.md §7.2's precedence, and the degraded counter and log (contracts/gateway-http.md §3). It removes `createServices`' temporary `fallback_not_supported` refusal, with its plan §5.8 bullet and its contracts/config-files.md §1.4 row, and lands with T073 (T148).
- [X] T075 [US2] Implement the operator writes and reads in `services/gateway/src/routes/admin.ts`, per contracts/operator-admin.md §2.1, §2.2, §4.2, and §4.3, and data-model.md §7.5: `POST /admin/reset`, `POST /admin/renew`, `GET /admin/audit`, and `GET /admin/incidents`. A journal append that fails after the commit writes a `journal_failed` audit row carrying the action's `audit_id` (data-model.md §7.5). Extend `scripts/operator.py` with `reset`, `renew`, `audit`, and `incidents`, and add the Makefile targets `operator-reset`, `operator-renew`, `operator-audit`, and `operator-incidents`.
- [X] T076 [US2] Implement `services/gateway/src/routes/test.ts` per contracts/operator-admin.md §3 (dev only):
  - `POST /admin/test/clock`: forward only, 409 `clock_backwards`, and a `clock` journal record;
  - `POST /admin/test/synthetic`: attribution `fallback` or `metered`, a count, $0.10 per call, through the real pipeline.
- [X] T077 [US2] Implement `services/gateway/src/alerts/outbox.ts`, `dispatcher.ts`, `telegram.ts`, `smtp.ts`, and `format.ts`, per contracts/alerts.md §2–§4:
  - the dispatcher wakes on `LISTEN alert_outbox` or every 2 s, and treats each channel independently;
  - Telegram: the Bot API `sendMessage` in plain text, with a 5 s timeout;
  - email: nodemailer, implicit TLS on 465 or STARTTLS on 587, with a 10 s timeout;
  - failures are recorded as error classes only;
  - the in-memory `store_unreachable` alert after 60 s;
  - the daily reminder;
  - `ALERT_DELIVERY` selects real or stand-in endpoints.
- [X] T078 [US2] Implement the incident drafts in `services/gateway/src/incidents/draft.ts` per contracts/alerts.md §7: a deterministic template, no model call, the evidence fields, no client identifiers, written under `${GATEWAY_STATE_DIR}/incidents/`, with the `incidents` row updated.
- [X] T079 [US2] Create the stand-ins in `evals/standins/` and `deploy/compose.yaml`:
  - `evals/standins/telegram_standin.py` (stdlib; `/bot<token>/sendMessage`, `GET /messages`, `/healthz`) and `evals/standins/Dockerfile`, on the pinned Python base;
  - the `telegram-standin` and `mailpit` services in `deploy/compose.yaml`, under the `dev-receivers` profile.
- [X] T080 [US2] Create the breach test in `evals/breach.py` and `evals/breach_probe.py`, steps 1–12 of §8, each assertion tagged T, M, or L, with a summary table and a non-zero exit on any miss. T144 brought the probe's image (`evals/Dockerfile.probe`, with `scripts/operator.py` in it) and the `breach-probe` service under the `breach` profile forward for T064; what is left is the breach test's own:
  - `evals/breach.py`, the client-side orchestrator, run through `PY_HOST` in the Author's terminal;
  - `evals/breach_probe.py`, copied into the probe image beside `scripts/operator.py`;
  - `make breach-test ENV=dev|dev-cpu [DELIVERY=real]`, refusing any other stack, and applying the delivery overlay of contracts/env-files.md §7.2 for `DELIVERY=real`.
- [X] T081 [US2] Add the US2 panels to `deploy/grafana/dashboards/h4-runtime.json`, with the exact queries of contracts/telemetry.md §7.1, §7.2, and §7.5: spend today and month-to-date with thresholds, fallback remaining, the kill-switch state timeline, the degraded cause, the audit log (through `grafana_ro`), and alerts.
- [X] T082 [P] [US2] Create the runbooks in `docs/runbooks/`, each with Symptoms · Impact · Act · Verify · Undo · Record: `cost-warning.md`, `kill-switch-trip.md`, `kill-switch-reset.md`, `fallback-renewal.md`, `alert-channel-down.md`, `store-unreachable.md`, `journal-unwritable.md`, `operator-auth-failures.md`, and `gateway-down.md`.
- [X] T083 [P] [US2] Add the Telegram and SMTP rows to `docs/data-flow-disclosure.md` (§17).
- [ ] T084 [US2] Agent session, on the engine: `make breach-test ENV=dev-cpu` passes all 12 steps. Paste the summary table into `docs/merge-requests/<date>-feat-000-us2-kill-switch.md`.
- [ ] T085 [US2] **Author** (Heavy): `make breach-test ENV=dev DELIVERY=real`, recorded with asciinema into `docs/recordings/` (scanned with gitleaks before commit), with the phone on camera (SC-002, quickstart.md §2.2).
- [ ] T086 [US2] Write the merge-request note `docs/merge-requests/<date>-feat-000-us2-kill-switch.md`.

**Checkpoint**: US1 and US2 both work. The kill switch trips with no human action, and only a reset restores it.

---

## Phase 5: User Story 3 — role-scoped agents can't do what the policy forbids (P1) — branch `feat/000-us3-governance`

**Goal**: the enforcement points are proven by the matrix: the hooks, the sandbox, and the agents' engine. Plus the local gates, publish-check, and the agent-configuration evals.

**Independent test**: quickstart.md §3. Matrix stage H runs anywhere, stage S in a session, and stage E from the host; then `make engine-smoke` and the canary.

**Can start in parallel with Phase 3 and Phase 4**: T087–T096 touch none of the gateway's files. T094's panel extends the dashboard US1 creates, so it rebases on US1's branch. T097 needs US2.

### Tests for User Story 3 (the matrix is the test)

- [ ] T087 [P] [US3] Grow stage H in `redteam/forbidden-actions.sh` per §13:
  - role rows generated from each `.claude/agents/*.md` `tools:` line, with `agent_type` in the hook input;
  - writes denied to a subagent with an `agent_id` but no `agent_type`;
  - edits to every human-only path, plus `GNUmakefile`, `makefile`, `.mcp.json`, and `config/prices*`;
  - `--no-verify` and `-n`, `claude mcp add`, `make operator-*` and admin URLs outside dev-cpu, and every Author-only target;
  - secret-content rows, with keys assembled at run time;
  - the settings rows;
  - the FR-007 rows, one per secret in contracts/env-files.md §8;
  - one indirect variant per prohibited action (the spec's edge case): a script, `bash -c`, a subshell, quoting, or a config or API equivalent;
  - the relay: `docker-relay` with `sh -c`, `bash -c`, `python3 -c`, or a path, refused with exit 2; for ops, `docker-relay make …` refused by its grant;
  - `engine.sh`'s Author subcommands, by any spelling;
  - a planted `__pycache__/*.pyc` for `scripts/operator.py`, in a scratch copy, that doesn't run under `PY_HOST`;
  - gitleaks bypasses that must fail: a planted `.gitleaksignore` naming a fake finding's fingerprint, at the scan source's root, a `gitleaks:allow` comment, and a `.gitleaks.toml` in the scanned directory.

  T045's patch already added the rows for its own changes; T087 adds the rest, plus the indirect variants of those. Rows whose enforcement waits for a patch are `planned`: reported, but not failing.
- [ ] T088 [US3] Create `tools/gates/matrix-required.txt`, listing every row ID, and make the matrix fail when a listed row is missing.
- [ ] T089 [US3] Add stage S rows to `redteam/forbidden-actions.sh` per §13, after T087 (the same file). They run when `SANDBOX_RUNTIME=1` is set and `.git/hooks` isn't writable, and are skipped with a notice otherwise. Every row only probes (`test -w`, `test -r`, or a connection attempt). The `main` row is `test -w` on the ref's path, never `update-ref`, and a planned row whose test would write is skipped, not run. The unwritable rows cover the three config files, `GNUmakefile`, `makefile`, `.gitleaks.toml`, `.gitleaksignore`, and `deploy/agents-engine`.
- [ ] T090 [US3] Make `redteam/forbidden-actions.sh` report stage E, after T089 (the same file). On the host, after `deploy/agents-engine/engine.sh prove`, it reads `prove-limits.sh`'s report and folds rows E1–E16 into its summary.

### Implementation for User Story 3

- [ ] T091 [P] [US3] Create `make secrets` per §11 (make the fresh empty directory for `--gitleaks-ignore-path` with a checked `mktemp -d`, and refuse an empty path: an unchecked `mktemp` failing gave an empty `pycache_prefix`, which loaded planted bytecode, research.md R-35): `gitleaks git --pre-commit` with and without `--staged`, plus `$(git merge-base main HEAD)..HEAD`, each with `--config` (the main tree's `.gitleaks.toml`, from T045's patch), `--gitleaks-ignore-path` naming a fresh empty directory, and `--ignore-gitleaks-allow (and refusing to run while a `.gitleaksignore` exists at its scan source (research.md R-36))`. Missing gitleaks fails closed.
- [ ] T092 [P] [US3] Create `tools/gates/gate` (the Author's clean-room gate, §11) and `tools/gates/test/test_gate.py`:
  - export the ref with `git archive`;
  - build the devcontainer image, tagged by `.devcontainer/`'s hash;
  - the container phase: `npm ci --ignore-scripts`, then lint, test, the scaffolds, and stage H with `--network none`;
  - the host phase: githooks, toolchain, policy, `corpus-check` with the denylist through `PY_HOST`, gitleaks, the image build on the engine, and stage E plus the behavioral evals when triggered;
  - every gitleaks call with the flags of §11;
  - the push of the agent-config eval history as the `h4.devtime.eval.*` metrics to prod's x004 (§4.4);
  - a summary line for the merge commit;
  - `gate --host`, marked DEGRADED.
- [ ] T093 [P] [US3] Create `tools/gates/publish_check.py` per §12 (exit codes 0, 1, 3; it refuses with 3 while a `.gitleaksignore` exists at the repository root, research.md R-36) and `tools/gates/test/test_publish_check.py`, with fixture repositories:
  - a fake secret assembled at run time in an old commit;
  - a denylisted phrase in a removed file;
  - a currency amount in corpus Markdown;
  - a denylisted author email.

  Wire `make publish-check` (Author).
- [ ] T094 [P] [US3] Create the dev-time usage panel (FR-037) and the behavioral agent-config evals. The panel goes in `deploy/grafana/dashboards/h4-runtime.json`, with contracts/telemetry.md §7.7's queries, fed by the gate's push (T092). The evals follow §14: `evals/agent-config/behavioral.py`, about 12 cases in `evals/agent-config/cases/*.yaml`, `evals/agent-config/thresholds.yaml`, and the history format under `evals/agent-config/history/`. `make evals-agent-config` (Author) runs them. `make evals` shows PENDING with the command when the trigger hash has no passing entry. A case whose enforcement waits for a patch reports PLANNED, naming the patch's task (§14).
- [ ] T095 [P] [US3] Add `make matrix-canary` (Author): `claude -p --setting-sources project` with fake values for every FR-007 variable, asserting that none appears in the session's environment or transcript (§13).
- [ ] T096 [US3] Agent session: run stage H and stage S of `redteam/forbidden-actions.sh`, and paste the matrix report, planned rows listed, into `docs/merge-requests/<date>-feat-000-us3-governance.md`.
- [ ] T097 [US3] Agent session, after Phase 4 has merged: `make engine-smoke` (`deploy/agents-engine/engine.sh smoke`), meaning `make up ENV=dev-cpu` comes up healthy and `make breach-test ENV=dev-cpu` passes (US3-9's positive half, quickstart.md §3.4).
- [ ] T098 **Patch**: write the governance patch, `docs/merge-requests/<date>-feat-000-us3-governance-enforcement.patch`, per §15: `sandbox.filesystem.denyWrite` on `./tools/gates` and `./evals/agent-config`, the matching `Edit(...)` denies, the `protected-paths.sh` rules, and their matrix rows.
- [ ] T099 [US3] **Author** (Heavy, after T097, with no agent session using the engine):
  - `deploy/agents-engine/engine.sh prove` (stage E, rows E1–E16);
  - `tools/gates/gate` on the branch;
  - `make evals-agent-config`, committing its history entry (SC-008);
  - the SC-007 timing of quickstart.md §6.2 (Heavy): a fresh clone, then the devcontainer with an empty build cache, `make setup`, and `make test`, in under 30 minutes.

  The results go into `docs/merge-requests/<date>-feat-000-us3-governance.md`. After this branch merges, apply the governance patch (T098), then run `claude doctor`.
- [ ] T100 [US3] Write the merge-request note `docs/merge-requests/<date>-feat-000-us3-governance.md`.

**Checkpoint**: every FR-039 limit is proven from the host, and every hook row passes except the planned ones.

---

## Phase 6: User Story 5 — local-first, with a capped Bedrock fallback, fully traced (P2) — branch `feat/000-us5-fallback`

**Goal**: production falls back to Bedrock inside the sub-budget, and both adapters pass one contract suite.

**Independent test**: quickstart.md §4 and §6.1. A local answer; Bedrock within 5 s with the model server stopped, on prod, in the Author's terminal; both adapters passing the same suite.

### Tests for User Story 5

- [ ] T101 [P] [US5] Create `services/gateway/test/contract/bedrock-converse.contract.test.ts`, running every assertion C1–C12 with `aws-sdk-client-mock` and `aws-sdk-client-mock-vitest`. Create `test/contract/replay.test.ts`, which replays a recording made by `operator.py contract-record` (contracts/provider-adapter.md §5.3 and §5.4).

### Implementation for User Story 5

- [ ] T102 [US5] Implement `services/gateway/src/adapters/bedrock-converse.ts` per contracts/provider-adapter.md §3.2: Its circuit breaker sets `circuit_open` through `AdapterHealth.set`, so T152's `fallback_unavailable` alert fires when the circuit opens (Phase 4's last review).
  - `ConverseCommand` in us-east-1, `maxAttempts: 1`, `NodeHttpHandler({connectionTimeout: 1000, requestTimeout: 4000})`;
  - one retry, only on `ThrottlingException`;
  - a timeout counts as `possiblyBilled`;
  - health never spends: credential expiry plus a circuit breaker (3 failures, 30 s open);
  - a `credentials_expiring` outbox row 2 h before the SSO session ends.

  Add the `bedrock` adapter to `config/routing.yaml` with its placeholder model (contracts/config-files.md §1.2, step 3); prod's route doesn't name it yet.
- [ ] T103 [US5] Implement `POST /admin/adapters/{id}/complete` per contracts/operator-admin.md §5: local on any stack, bedrock on prod only, attribution `test`, through admission. Add `scripts/operator.py contract-record` and `make contract-live ENV=prod ADAPTER=local|bedrock`, which records in the Author's terminal and replays in the devcontainer image with `--network none` (§7).
- [ ] T104 [US5] Create `deploy/scripts/aws-login.sh` and `make aws-login` (Author): `HOME=~/.config/h4reet-ai/aws-home aws sso login --profile h4reet-bedrock`. Wire the gateway's `${H4_AWS_DIR}` mount and `GATEWAY_AWS_PROFILE` in `deploy/compose.yaml` (§5.2).
- [ ] T105 [US5] **Author**: set up Bedrock and fill `config/prices.yaml` and `config/routing.yaml` (research.md R-12 and R-17, quickstart.md §0.6):
  - in IAM Identity Center, create the permission set allowing only `bedrock:InvokeModel` on the confirmed inference profile and the foundation models it routes to, and the dedicated user `h4reet-runtime` if you confirmed it. This is the spec's named deviation from "Infrastructure exclusively via Terraform" (spec Assumptions);
  - confirm the model with `aws bedrock list-inference-profiles`: Claude Haiku 5.5 in us-east-1, otherwise Claude Haiku 4.5's `us.` profile;
  - append a new version to `config/prices.yaml` with its entry from the Bedrock pricing page, repeating the local and synthetic entries (P5: a published version never changes);
  - set its ID in `config/routing.yaml`, and add `fallback: bedrock` to the prod route;
  - commit both, then `make up ENV=prod`; preflight P19 now checks the AWS profile.
- [ ] T106 [US5] Add the Bedrock panels (cost by provider, adapter health) to `deploy/grafana/dashboards/h4-runtime.json` (contracts/telemetry.md §7.2 and §7.4); the Bedrock and AWS SSO rows to `docs/data-flow-disclosure.md`; and the runbooks `docs/runbooks/bedrock-credentials-expiring.md` and `docs/runbooks/bedrock-unavailable.md`.
- [ ] T107 [US5] **Author** (Heavy): run `quickstart.md` §4 and §6.1:
  - a local answer;
  - stop the model server, and Bedrock answers within 5 s, with the fallback cost on the dashboard within 60 s (SC-005);
  - `make contract-live` for local and for bedrock (SC-006);
  - `tools/gates/gate` on the branch.

  The results go into `docs/merge-requests/<date>-feat-000-us5-fallback.md`.
- [ ] T108 [US5] Write the merge-request note `docs/merge-requests/<date>-feat-000-us5-fallback.md`.

**Checkpoint**: US5's fallback works on prod, and both adapters pass one suite.

---

## Phase 7: User Story 6 — the repository explains itself (P3) — branch `feat/000-us6-docs`

**Goal**: a stranger finds the reasoning, the process, and the running stack from the README.

**Independent test**: quickstart.md §5.1 and §5.2. The README's links, and every ADR within two clicks (SC-009).

- [ ] T109 [P] [US6] Update `README.md`:
  - the status and a devcontainer quickstart;
  - links to the constitution, `intent/`, the spec index, the ADR index, `docs/how-we-build/`, `SECURITY.md`, the MIT license, `docs/data-flow-disclosure.md`, `docs/runbooks/`, and `docs/recordings/`, with the breach recording on the non-engineer path.
- [ ] T110 [P] [US6] Complete `docs/data-flow-disclosure.md` with every row of §17, closing with "No visitor data flows in this spec.". Link it from `SECURITY.md`.
- [ ] T111 [P] [US6] Create `docs/runbooks/README.md`, an index of every runbook, and the runbooks for the agents' engine and the local gate. Update `docs/how-we-build/lifecycle.md`'s enforcement table with the new layers.
- [ ] T112 [P] [US6] Update `docs/START-HERE.md` per §16:
  - §1: the NVIDIA runtime step, the disk check, `make tools` (Node 24 through nvm, the default Node left alone), and `deploy/agents-engine/engine.sh setup` with its `wsl --shutdown`;
  - a new "Before you merge" section;
  - §4's gotchas;
  - §6 step 1: `make publish-check`.
- [ ] T113 [US6] Add the new human-only paths to `.github/CODEOWNERS` (FR-001): `tools/gates/**`, `evals/agent-config/**`, `.gitleaks.toml`, `deploy/agents-engine/**`, `.mcp.json`, and `config/prices*`.
- [ ] T114 [US6] Add a docs-link check, `evals/docs_links.py`, run by `make evals` (outside `evals/agent-config/`, which is human-only by now): every relative link in `README.md`, `docs/**`, and `specs/**` resolves; the README links the ADR index; and the index links every ADR file (SC-009).
- [ ] T115 [US6] **Author**: `tools/gates/gate` on the branch, and `make evals-agent-config` if the behavioral tier's trigger fired, committing its history entry. The summary goes into the note.
- [ ] T116 [US6] Write the merge-request note `docs/merge-requests/<date>-feat-000-us6-docs.md`.

---

## Phase 8: Polish and cross-cutting — branch `feat/000-enforcement`

**Purpose**: the closing enforcement patch, the switch from planned rows to enforced rows, and the final validation.

- [ ] T117 **Patch**: write the closing enforcement patch, `docs/merge-requests/<date>-feat-000-enforcement-enforcement.patch`, per §15:
  - `.claude/settings.json`: `denyWrite` on `./.mcp.json`, `./.git/info`, and `./.git/refs/heads/main`, their `Edit(...)` denies, and the Claude Code telemetry `env` entries. Every credential deny, and the denies on the files prod reads and the code the Author runs, came with T045; the gate's came with T098;
  - `.claude/hooks/bash-gate.sh`: `operator-*` and admin URLs outside dev-cpu, `make breach-test` and `evals/breach.py` on any stack but dev-cpu, in every spelling, with `SANDBOX_RUNTIME=0` or `env -u SANDBOX_RUNTIME` in front (FR-008; plan §13 and §15, the nine planned rows from T080's review), the Author-only targets, `--no-verify`, `claude mcp add`, git-alias expansion, and the `terraform` global-flag pattern; and, keyed on `agent_type`, the reviewer's and red-teamer's refusals: `git diff --output`, `git diff` or `git log` with a redirection, `tee`, `make -f`, and any `ADAPTER=` but `fake`;
  - `.claude/hooks/protected-paths.sh`: `.mcp.json`, role write scopes from `agent_type`, and writes denied when `agent_id` comes without `agent_type`;
  - `.claude/hooks/post-edit-check.sh`: TypeScript, JSON, YAML, and Markdown through `~/.local/share/h4reet/lint-node` with its own configs;
  - `.claude/hooks/subagent-report-check.sh` (FR-010): the payload's `last_assistant_message` checked first, every result logged with the `agent_type`, and instruction-shaped text flagged rather than any mention of `settings.json`;
  - the CLAUDE.md lines of §15, each folded into an existing line except one, keeping it under 60 lines;
  - in `redteam/forbidden-actions.sh`, every planned row switched to block or allow, and in `make check`, every PLANNED mark cleared.
- [ ] T118 **Author**: apply `docs/merge-requests/<date>-feat-000-enforcement-enforcement.patch`, then run `claude doctor`, `make git-hooks`, and `tools/gates/gate` on the branch, not `make check` in your own terminal (§11). The result must be 0 failures, 0 planned rows, no PLANNED line, and no SKIP that names a task (SC-003). The trigger fires, so run `make evals-agent-config` and commit its history entry (SC-008).
- [ ] T119 **Author** (Heavy, with no agents working): run quickstart.md §7's done-when table end to end, and fill the success-criteria table (SC-001, 002, 003, 005, 006, 007, 008, 009) in `docs/merge-requests/<date>-feat-000-enforcement.md`.
- [ ] T120 Write the merge-request note `docs/merge-requests/<date>-feat-000-enforcement.md`. `make publish-check` runs later, before the first push (START-HERE §6), not at this merge.

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup. It blocks every story. T046 (the Author's patches and engine setup) blocks every agent-run container task and T065, which creates the first real secrets: the early patch's credential denies must already be in place (Principle IV). T063 (the seed) blocks T064, T084, and T097.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1. It extends the gateway US1 builds, and the breach test runs the US1 stack.
- **US3 (Phase 5)**: after Foundational. T087–T096 can run in parallel with US1 and US2. T097 needs US2 merged, and T099 runs after T097. The governance patch is applied right after US3 merges.
- **US5 (Phase 6)**: after US2, which supplies the meter and the fallback branch. T105 (the Author's IAM and price steps) blocks T107.
- **US6 (Phase 7)**: after US1. It can run in parallel with US2, US3, and US5, but its link check (T114) is final only after them.
- **Polish (Phase 8)**: after every story. The closing patch switches every planned row and clears every PLANNED mark left.

### Within each story

- Tests first; they fail, then the code that makes them pass.
- The store and its transactions before the routes that use them; the routes before the compose wiring; the compose wiring before the Author's runs.
- Each phase ends with its merge-request note.

### Parallel opportunities

- **Phase 1:** T002, T003, T004, T007, T008, T009, T010, T011, and T012 touch different files.
- **Phase 2:** the gateway track (T015–T028) and the engine track (T039–T044) are independent. Within them, T016, T017, T020, T021, T026, T030, T031, T032, T034, T035, T037, T038, T039, T040, and T041.
- **US1:** the tests T048, T049, and T050 together; then T062 beside the compose work.
- **US2:** the tests T067–T071 together; T082 and T083 beside the code.
- **US3:** T087, then T089 and T090 in turn (they share the matrix file); T091–T095 in parallel; all alongside Phases 3 and 4.

## Parallel example: User Story 2

```bash
# Tests first, together:
Task: "Create services/gateway/test/unit/meter.test.ts (T067)"
Task: "Create services/gateway/test/integration/meter.test.ts (T068)"
Task: "Create services/gateway/test/unit/alerts.test.ts (T069)"
Task: "Create services/gateway/test/integration/operator.test.ts (T070)"
Task: "Create evals/test_breach_helpers.py (T071)"

# Docs beside the code:
Task: "Create the US2 runbooks in docs/runbooks/ (T082)"
Task: "Add Telegram and SMTP rows to docs/data-flow-disclosure.md (T083)"
```

## Implementation strategy

### MVP first (User Story 1)

1. Phase 1 (Setup), then Phase 2 (Foundational), including the Author's engine setup (T046).
2. Phase 3 (US1). **Stop and validate**: quickstart.md §1 on the 5090 (SC-001).

### Incremental delivery

1. US1, the stack, then US2, the kill switch with the breach test (SC-002), then US5, the Bedrock fallback (SC-005, SC-006).
2. US3, governance, beside US1 and US2; its engine smoke follows US2.
3. US6, the docs, then the closing patch. Spec 000 is done when every success criterion passes on the 5090, and the matrix shows 0 failures and 0 planned rows.

### Agents and the Author

- Agents implement every unmarked task on the phase's branch, in the sandbox, with containers on the agents' engine once T046 is done.
- The Author runs the tasks marked **Author**, applies the **Patch** files, and merges each branch after reading its note. Changes to anything that runs in the Author's terminal are listed first.
- Heavy Author steps are their own step, with no agents working, after the disk preflight.

## Notes

- [P] tasks touch different files and depend on nothing unfinished.
- Marks expire (plan §11). A task that adds a make target named with `@Tnnn` in the Makefile's `CHECK_GATES` removes the mark in the same commit. A patch carries the edits that clear its own marks: T045's patch deletes its PLANNED entries in `evals/agent-config/static.py` and clears `PRE_COMMIT_PLANNED`. `make check` fails on a stale mark.
- Every task names its file, and the section of the contract or plan it implements. Where a detail is in a contract, the contract governs, and plan.md is fixed if they disagree.
- No task edits `.claude/**`, `REVIEW.md`, `CLAUDE.md`, the constitution, `config/budgets*`, or `config/alert*` directly, nor, once a patch protects them, `config/prices*`, `deploy/agents-engine/**`, `tools/gates/**`, `evals/agent-config/**`, or the gitleaks files. Those go through Patch tasks.

## Phase 9: Convergence

- [X] T121 Correct plan.md §11's image-gate row on feat/000-setup: the devcontainer build needs Ubuntu's mirrors, not nodejs.org, because `.devcontainer/Dockerfile` copies Node from the digest-pinned official image (T007) per plan §11 (partial)
- [X] T122 Record `--import-mode=importlib` (Makefile `PYTEST_ARGS`) in plan.md §11's test row, with its reason: pytest then never puts a test's folder or the repository root at the front of `sys.path`, as §14 requires of the `run.py` scaffolds, per plan §11 (partial)
- [X] T123 Add `tools/gates/run_checks.py`, `tools/gates/install-tools.sh`, and `.devcontainer/requirements-tools.in` to plan.md's Source Code tree per plan: Project Structure (partial)
- [X] T124 Name files.pythonhosted.org in plan.md §17's `make tools` row, where uv downloads pytest's and PyYAML's wheels (`tools/gates/install-tools.sh`), as the devcontainer row already does, per FR-040 (partial)

## Phase 10: Convergence

- [X] T125 Make row E9 of `deploy/agents-engine/prove-limits.sh` prove the opening on feat/000-foundations: verify the server with the engine's `ca.pem`; show that the handshake fails with no client certificate and with one from another CA; and show that only RootlessKit, as `h4agents`, and the proxy listen on `198.18.0.1`, per T044 and contracts/agents-engine.md §7 E9 (partial)
- [X] T126 Add the probes rows E4, E5, and E8 still lack to `deploy/agents-engine/prove-limits.sh`, per T044 and §7 E4, E5, E8 (partial):
  - E4: from the WSL address, the rootful bridges' gateways, and prod's container addresses;
  - E5c: binds through a symbolic link (`ELOOP`), and a `mount` inside a probe container;
  - E8: the CONNECTs to `198.18.0.1:2376`, `10.0.0.1:443`, and `169.254.169.254:80`; a BuildKit `RUN --network=host` build, refused by the daemon's entitlements; E8d's list comparison; and the refusals in the proxy's log.
- [X] T127 Run `prove-limits.sh`'s API probes with the agents' certificate (`~/.config/h4reet/agents-engine/docker`), so they test what a session can do, per T044 and §7's preamble (contradicts)
- [X] T128 Bring rows E1, E3, E7, E10, and E11 of `prove-limits.sh` up to §7, per T044 and §7 (partial):
  - E1: who owns the containers' processes;
  - E3: `/dev/nvidia*`;
  - E7: `.env.*` files, every in-tree read deny masked, and a refusal that names the file;
  - E10: no file of the Author's under the data root, and the seeded images back;
  - E11: a file inside `~/.config/h4reet-ai`, not the directory itself.
- [X] T129 Normalize each sandbox read deny in `deploy/agents-engine/engine.sh`'s mask check before comparing it with `tree-masks.txt`: drop a leading `./`, a project-relative leading `/`, and a trailing `/**`, and skip only `~/` and `//` paths, per T043 and §5 H8 (partial)
- [X] T130 Make `engine.sh seed` refuse unless the host's `docker info` names the containerd snapshotter, and run its disk check before any pull on the host, counting only the images still to seed, per T043 and §6.1–§6.2 (partial)
- [X] T131 Have `deploy/agents-engine/egress-proxy.py` record its list's digest when it starts, and make `engine.sh status` print that digest beside the settings' digest, both computed by the proxy's own code, per T040, T043, §4, and §8 (missing)
- [X] T132 Widen the early patch's `engine.sh` rule in `docs/merge-requests/2026-10-08-feat-000-foundations-enforcement.patch` to a leading `VAR=value`, wrapper options that take an argument (`nice -n`, `watch -n`), and a leading `. `, with a matrix row for each, per T045 and plan §13 (partial)
- [X] T133 Point the early patch's `ops.md` compose commands at `make status ENV=…` and `make logs ENV=…`, which pass the run file and the export's compose file, and amend plan §15 and T045 to match plan §4, per T045 (contradicts)
- [X] T134 Record the `.gitleaks.toml` allowlist for ADR 0004 at 8c15b95 as a departure in plan §11 and T045, per plan §11 and FR-012 (contradicts)
- [X] T135 Have `deploy/agents-engine/setup-host.sh` write `~/.config/h4reet/agents-engine/docker/config.json` as `{}`, mode 0444, per contracts/agents-engine.md §2.3 (missing)
- [X] T136 Match only subdomains for a `*.` entry in `egress-proxy.py`, per T040 and §4 (contradicts)
- [X] T137 In `egress-proxy.py`, per T040 and §4 (partial):
  - log `no_list` once a minute;
  - forward a GET's query and headers;
  - give a failed upstream connect and the tunnel cap their own logged reasons;
  - treat a settings file that isn't a JSON object as `no_list`.
- [X] T138 Refuse, in `setup-host.sh`, a subordinate-ID range that overlaps one already in `/etc/subuid` or `/etc/subgid`, per T042 and §5 H2 (partial)
- [X] T139 Resolve the main working tree in the early patch's `content-scan.sh` as `pre-commit` does, for both the config and the allowlisted path, per T045 (partial)
- [X] T140 In `deploy/scripts/init_env.py`'s SYNC mode, list every `__ASK__` key the updated file still holds, per T032 and contracts/env-files.md §9.1 (partial)
- [X] T141 Point `deploy/scripts/redact.sh`'s comment at `deploy/scripts/test_status.py`, which keeps its filter equal to ops.md's, per T034 (partial)
- [X] T142 Add the host image build's npm flow to plan §17's table, per T038 and FR-040 (partial)

## Phase 11: Convergence

- [X] T143 Say in T063 and in this branch's note that, once T046 has applied the config patch and the early patch on main, the Author brings this branch up to date with main before T063 and before any agent session runs on it: without them every gateway exits 78 (no `budgets.yaml` or `alerts.yaml`), and the sandbox lacks the engine opening and the credential denies, per T046 and Constitution IV (missing)
- [X] T144 Bring forward the slice of T080 that T064 needs: `evals/Dockerfile.probe` (the pinned `base:python`, `scripts/operator.py` at `/app/operator.py`, a non-root user, no package installs) and the `breach-probe` service (profile `breach`, `internal` only, read-only with a tmpfs `/tmp`, 0.25 CPU and 128 MiB, no ports or binds), with its disclosure row and the compose tests; narrow T080 and operator-admin.md §6's T080 line to the rest, per T064 and plan §1–§2 (missing)
- [X] T145 Make `deploy/agents-engine/engine.sh`'s `chown_state` create `/var/lib/h4agents/state/dev-cpu/gateway`, owned by the container's uid 1000, through the engine alone: the state root is `h4agents`' and 0700, so its host-side check as the Author always fails and skips the step without a word. Name its base image by digest from `images.lock`, and run it after `seed` too, per plan §10 and T043 (missing)
- [X] T146 Move quickstart §0.7–§0.8 (the env files, the operator tokens, the Telegram bot, and the mailbox) from T065 to the start of T063, because `make pull`'s preflight needs a complete env file and the token file, per contracts/env-files.md §10 (partial)
- [X] T147 Give T064 a hello an agent session can send on dev-cpu: `make hello ENV=…`, through the probe container inside the sandbox and straight to the stack's api port on 127.0.0.1 from the Author's terminal; name it in T064, per T064 (missing)
- [X] T148 Record the gateway's `fallback_not_supported` refusal (`createServices`) in plan §5.8 and contracts/config-files.md §1.4 as temporary until T074 builds the metered fallback, note it in T073, and test it, per Development Workflow step 4 (unrequested)
- [ ] T149 After T065, apply the first stack run's findings: the collector's one cost attribute; gzip for `otlphttp/langfuse`, if Langfuse accepts it; the `llamacpp:` metric names in telemetry.md and `h4-runtime.json`, if they differ; the `LANGFUSE_LLM_CONNECTION_WHITELISTED_*` keys, set empty in compose.yaml; research.md's R-03, R-06, and R-09; and disclosure row B1's browser hosts, per T065 and plan §6 (missing)
- [X] T150 Give the listeners' 400 for a body that doesn't parse `field: "body"`, as gateway-http.md §2.5.4's body has, and test it exactly, per contracts/gateway-http.md §1 (partial)
- [X] T151 Test the local adapter's mappings of 404, 413, 422, 502, and 504, a DNS failure, and the 1 s connect watchdog, per T051 and contracts/provider-adapter.md §2.5 and §3.1 (partial)

## Phase 12: Convergence

- [X] T152 Queue a `fallback_unavailable` outbox row, at most one an hour per adapter, when a paid fallback adapter's health turns unhealthy (`core/gateway.ts`'s `healthChanged`; the text and dedupe key already exist in `alerts/format.ts` and `alerts/outbox.ts`), tested with a fake paid adapter, per alerts.md §2 and data-model.md §7.7 (missing)
- [X] T153 Add planned rows to `redteam/forbidden-actions.sh` for the breach test's dev route in the spellings the nine rows miss: `make ENV=dev breach-test`, `(make breach-test ENV=dev)`, `make breach-test ENV="dev"`, and `env -u SANDBOX_RUNTIME python3 -m evals.breach --stack dev`, so T117's rule is tested against every spelling, per plan §13 ("by any spelling") and FR-008 (partial)
- [X] T154 Report dev's synthetic adapter as `disabled` in `/health` and `h4.adapter.healthy` while `GATEWAY_TEST_SYNTHETIC_SPEND` is off, instead of leaving it out (`adapters/registry.ts`), or drop `disabled` from provider-adapter.md §2.4 and §3.3 and `HealthReason`, per provider-adapter.md §2.4 and §3.3 (partial)
- [X] T155 Count a synthetic run that a limit stops under its own route decision, `metered` for metered spend, in `h4.gateway.requests` (`routes/test.ts`), and test it, per telemetry.md §4.1 (contradicts)
- [X] T156 Record the email delivery's reference only from the SMTP server's own reply, never an assumed `250` (`alerts/smtp.ts`), and test an unreadable reply, per alerts.md §4.1 and SC-002's evidence (contradicts)
- [X] T157 Make the contract suite's C10 timing check robust to a loaded host. Its stub case failed once at 1,093 ms against a 100 ms limit, while the call still ended as `timeout`, so `make check` can fail at random. Use the approach round 3 took for C3: keep what the check proves, widen only the margin, per T051 and provider-adapter.md §5.3 (partial)
