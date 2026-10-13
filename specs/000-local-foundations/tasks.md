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
- [X] T046 **Author** (Heavy, after this branch merges): check `gitleaks version` (T013 installed it). Apply the two patches from T022 and T045, then run `claude doctor`, `make git-hooks`, and `make evals` (the static agent-config tier: the early patch's only agent-config eval, spec Assumptions). This comes before T065: no real secret may exist before the credential denies do (Principle IV). Then quickstart.md §0.4 and §0.5:
  - switch the host's Docker to the containerd image store, pruning first and checking the disk;
  - `deploy/agents-engine/engine.sh setup`, then `wsl --shutdown`;
  - `deploy/agents-engine/engine.sh up`, then `make engine-status`.

  The seed and the engine's proofs come later (T063 and T099), once the models' lock and the last image pin exist. Record the results in the next branch's note.

  On 2026-10-09 the daemon first refused to start, then `up` stalled at its TLS wait. The bring-up's two patches fix both, along with what their review found (T158–T163, T168; `docs/merge-requests/2026-10-09-fix-000-engine-bringup.md`). Apply them, then run `make git-hooks`, `deploy/agents-engine/engine.sh setup`, `engine.sh down`, and `engine.sh up`. No `wsl --shutdown` is needed.

  Done on 2026-10-09: `engine.sh up` reached "== engine up" with `plugins=[h4-authz]`, and `make engine-status` reached the engine. That took the plugin's spec file in `~h4agents/.local/lib/docker/plugins`, put back by hand. From T171 on, setup writes it. The Author confirmed the containerd image store. The results are in `docs/merge-requests/2026-10-09-fix-000-engine-plugin-spec.md`.
- [X] T158 **Patch**: name the child address in RootlessKit's publish, `--publish 198.18.0.1:2376:127.0.0.1:2376/tcp`, in `deploy/agents-engine/systemd/docker.service.d/override.conf`, so the forward reaches the daemon instead of dialing `198.18.0.1` inside the namespace, where H4 drops it, per contracts/agents-engine.md §2.1 (contradicts)
- [X] T159 **Patch**: write the admission plugin's spec file, `~h4agents/.config/docker/plugins/h4-authz.spec`, from `deploy/agents-engine/setup-host.sh`, as `h4agents`, like every file setup writes into `h4agents`' home. Rootless dockerd didn't find the socket alone, and refused to start; and root writing there could follow a link `h4agents` made, per contracts/agents-engine.md §3.1 and H13 (missing)
- [X] T160 **Patch**: give `h4agents` the decision log's directory in `deploy/agents-engine/setup-host.sh`. Have `deploy/agents-engine/authz.py` report a record it can't write in the journal, once a minute. Have the status command and `prove-limits.sh` read the log as `h4agents` and say why when they read nothing. Under root, every record was lost unseen, and the Author's readers printed nothing, per contracts/agents-engine.md §3.5 and SC-003 (contradicts)
- [X] T161 **Patch**: refuse `engine.sh setup` under sudo in `deploy/agents-engine/engine.sh`, and name `SUDO_USER`'s value in `setup-host.sh`'s refusal, where the foundations note's `sudo … setup` ended, per contracts/agents-engine.md §8 (partial)
- [X] T162 **Patch**: stop each of `wait_for_tls`'s tries after 5 s, give up after a minute, take only whole seconds, and name the journals that show why, in `deploy/agents-engine/engine.sh`: an accepted, unanswered connection held `up` for minutes, silently, per contracts/agents-engine.md §8 (partial)
- [X] T163 **Patch**: reload both user managers in `engine.sh up` before it starts their units. Have `setup-host.sh` ask for `wsl --shutdown` while a change that needs one still waits for it, through a marker under the boot's ID. So a re-run of setup takes effect, and never skips a shutdown still owed, per contracts/agents-engine.md §8 (partial)
- [ ] T164 Bind the daemon's TCP listener to `127.0.0.1:2376` inside the namespace (`daemon.json`'s `hosts`), with a stage E row proving a container can't reach it at its bridge gateway. It listens on every address there now, so a container can likely reach the TLS listener (unproven; mutual TLS refuses it either way), per contracts/agents-engine.md §2.1 and H4 (partial)
- [ ] T165 Have `engine.sh up` apply a re-run of setup to the system units it only starts, `h4agents-nft.service` among them (a oneshot that stays active), so a changed ruleset doesn't wait for the next boot, per contracts/agents-engine.md §5 H4 and §8 (partial)
- [ ] T166 Fold §8's bring-up paragraph into the table's `setup` and `up` rows in `specs/000-local-foundations/contracts/agents-engine.md`, once `feat/000-us1-local-stack` has merged (it changes the `up` row), per contracts/agents-engine.md §8 (partial)
- [ ] T167 Bound the image gate's wait for the agents' engine in the `Makefile`: probe it first with a timeout, as `wait_for_tls` now does. The relay has no timeout, and while the forward took connections without answering, `make check` waited at `image` with no end, per plan §11 and FR-041 (partial)
- [X] T168 **Patch** (the hooks patch): refuse, in `.claude/git-hooks/pre-commit`, only a main-tree `.gitleaksignore` that could hold an entry. `/dev/null` itself, the sandbox's mask of the denied path, passes, and so does an empty regular file, which a killed session leaves. A link, a FIFO, and anything with content are refused. In a worktree of its own, anything at all is refused, as before. `redteam/forbidden-actions.sh` has a row for each. The first hook refused anything that existed, and so refused every commit from a session, per research.md R-36 (contradicts)
- [ ] T169 Add a stage E row to `deploy/agents-engine/prove-limits.sh` that proves a refused probe leaves its decision record in the plugin's log, read as `h4agents`, per SC-003 and contracts/agents-engine.md §3.5 (missing)
- [X] T170 Let `.claude/hooks/bash-gate.sh` pass a read-only command that only names the engine script (`grep`, `sed -n`, `cat`), with matrix rows, in the closing patch (T117). The false positive pushed a session to respell around it, per plan §15 and contracts/agents-engine.md §8 (partial)
- [X] T171 **Patch** (the plugin-spec patch): write the plugin's spec file in both rootless spec directories, `~h4agents/.config/docker/plugins` and `~h4agents/.local/lib/docker/plugins`, from `deploy/agents-engine/setup-host.sh`. With a correct copy in the first alone, as T159 wrote it, dockerd 28.3.3 refused to start; with one in each, it started, per contracts/agents-engine.md §3.1 (contradicts)
- [X] T172 **Patch** (the plugin-spec patch): name each unit in the status command's list, and ask the user manager about the Author's proxy, in `deploy/agents-engine/engine.sh`. Asked of the system manager, the proxy always read "inactive", even while it served, per contracts/agents-engine.md §8 (contradicts)
- [X] T173 Let a session commit in the main tree through `.claude/git-hooks/pre-commit`, in the closing patch (T117). gitleaks opens its source's `.gitleaksignore`, and inside the sandbox the mask there refuses to open ("permission denied"), so the hook fails closed. For example, scan the staged diff with `gitleaks stdin` from a fresh empty directory, which R-36 already uses for `stdin`. Keep matrix rows for every refusal T168 holds, per research.md R-36 and FR-008 (partial)
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
- [X] T063 [US1] **Author** (Heavy, with no agents working). First, once T046 has applied the config patch and the early patch on main, bring this branch up to date with main (`git switch feat/000-us1-local-stack && git merge main`): without them every gateway exits 78, and the sandbox lacks the engine opening and the credential denies (T143). Then quickstart.md §0.7–§0.8 for prod and dev: `make init-env`, `make operator-token`, the Telegram bot and the mailbox, and every `__ASK__` filled, because `make pull`'s preflight needs complete env files (T146). Then `make pin-images`, which also pins SeaweedFS (quickstart.md §1.6, item 4); `make pull MODELS=all`; then `deploy/agents-engine/engine.sh seed` (quickstart.md §0.9). Commit the pins on this branch. The agents' engine can then run dev-cpu.

  On 2026-10-09 the pins (da3a10c, with the probe's `FROM` in 5c2a089) and the pull passed, and the seed failed on all 19 images. T174 fixes it: the seed's second run, at e745177, seeded 18 images and found `ubuntu:24.04` already present. Marked done with T065's fix: no pin is open any more, so the compose policy's allowance for one has nothing left to allow.
- [X] T174 [US1] **Patch** (the seed-transfer patch): in `deploy/agents-engine/engine.sh`'s seed, save every platform the host holds, never `--platform`, then `docker tag` the pinned digest with its repository:tag on the engine, and print each failure's own last line under its row. With `--platform linux/amd64`, the engine got the amd64 manifest's ID, not the pinned index digest. And docker load names nothing saved by digest, so `repository:tag@digest` never resolved. `deploy/agents-engine/test/test_engine_sh.py`'s fake engine now loads as the real one does, per contracts/agents-engine.md §6.2 (contradicts)
- [X] T175 [US1] Give two tests their own fixtures: `deploy/scripts/test_pin_images.py`'s no-release-tag test, and `deploy/scripts/test_preflight.py`'s P18 test. They read the repository's `images.lock` and the engine's real model mount. T063 changed both on 2026-10-09 (SeaweedFS's pin, the seeded stand-in model), so both failed on correct code. The pin test now unpins SeaweedFS in its copy, and the P18 test points dev-cpu's `H4_MODEL_DIR` inside the test, per FR-041 (partial)
- [X] T176 [US1] Run `seaweedfs` as its image's own user, `1000:1000`, in `deploy/compose.yaml`. The image sets no `USER`: its own entrypoint chowns `/data` and drops to `seaweed`, uid 1000. Ours replaces that entrypoint, and root with every capability dropped can't write `/data`, which `seaweed` owns. At T065's second `make up ENV=prod` (2026-10-09) the master died at "mkdir /data/m9333: permission denied", and Langfuse never started. The user was proven on the agents' engine with the pinned image first; `deploy/scripts/test_compose_env.py` asserts it, and plan §1 now names the two services that run as their images' own users, per plan §1 and §2 (contradicts)
- [X] T177 [US1] Remove Loki's health check from `deploy/compose.yaml`. The 3.7.8 image is distroless, with no shell and no wget, so the check could never run: "exec: "wget": executable file not found in $PATH" at T065's second `make up ENV=prod`. As with the collector, Prometheus's scrape shows that Loki answers, though not that it's ready, and nothing waits on it. Plan §2's row said the image's busybox was checked at pin time, per plan §2 (contradicts)
- [X] T178 [US1] Compare an image's pin by the short name Docker prints, in `deploy/scripts/status.py`. `docker image inspect` gives `valkey/valkey@sha256:…`, not the lock's `docker.io/valkey/valkey@…`, so at both of T065's prod starts every service whose image comes from Docker Hub (ClickHouse, Valkey, SeaweedFS, Loki, Grafana) read "differs from the pin", with a WARN line each. `familiar()` drops Docker Hub's host and an official image's `library/` on both sides. `deploy/scripts/test_status.py`'s fake now prints RepoDigests as Docker does, and gives a service with no health check no health; its old defaults, `docker.io/` names and every service healthy, are why no test caught this. It tests the short names, a short name with another digest, an image with no digests, and `familiar()` itself, per plan §4 (contradicts)
- [ ] T179 [US1] **Patch**: in `deploy/agents-engine/setup-host.sh`, set `nvidia-container-cli.user` in `/etc/nvidia-container-runtime/config.toml` (`nvidia-ctk config --in-place --set`) to the least privileged user that works. Try `nobody:h4gpu` first, which the device admits without uid 0 (`nvidia-container-cli --user=65534:<h4gpu's gid> info`), and fall back to `root:h4gpu`, the value set by hand, only if it fails (Principle IV; the fix's reviewer). Then report it in `engine.sh status`, and correct H6 in contracts/agents-engine.md, plan §10, and quickstart.md §0.2 and §0.5: "Rootful Docker runs as root and keeps the GPU" was wrong. The NVIDIA hook's CLI runs its driver step as another user, by default one outside `h4gpu`, and with `/dev/dxg` at 0660 root:`h4gpu` (H6) NVML can't open the device. T065's first `make up ENV=prod` (2026-10-09) failed at model-server-gpu with "nvidia-container-cli: initialization error: nvml error: not supported". The CLI's `info` failed as nobody and worked as root and as root:`h4gpu`. The Author set the value by hand on this host, and the second start ran the GPU, per contracts/agents-engine.md H6 (contradicts)

  The patch is ready (2026-10-09): `docs/merge-requests/2026-10-09-fix-000-engine-gpu-user.patch`, with the docs on its branch. `ensure_nvidia_cli_user` tries nobody only while `/dev/dxg` has H6's mode, naming each user as the config will.
  - **Before the first boot after setup** the device is 0666, and a try would prove nothing. So setup sets `root:h4gpu`, and its last lines ask for one more run after the shutdown.
  - **A later boot without the mode** keeps a proved `nobody:h4gpu`, with a warning, and never raises it to root.
  - **A host with no `/dev/dxg`** is left alone, and a GPU that answers neither user gets a warning, since the agents' engine runs CPU-only.

  Its reviewer's S1–S3 are applied: tests whose fakes check arguments and change state, including three runs on a fresh host. The Author applies it, then runs `engine.sh setup` once; the box stays open until then.
- [X] T180 [US1] Set `HOSTNAME=0.0.0.0` for `langfuse-worker` too, in `deploy/compose.yaml`'s shared Langfuse settings, and move it in contracts/env-files.md §5 from "on web only" to "on web and worker". The worker calls `app.listen(PORT, HOSTNAME)`, and `HOSTNAME` falls back to `0.0.0.0` only when it is unset, but Docker sets it to the container's ID. So the worker bound only the container's network address, and at T065's third `make up ENV=prod` (2026-10-09, at a6b0e80) its health check failed: "wget: can't connect to remote host (127.0.0.1): Connection refused". On the agents' engine, with the pinned worker image and its Node, the same listen bound `172.17.0.2` and 127.0.0.1 gave `ECONNREFUSED`; with `HOSTNAME=0.0.0.0` it answered 200. `deploy/scripts/test_compose_env.py` moves the key to the shared set, per contracts/env-files.md §5 and plan §2 (contradicts)
- [X] T181 [US1] Warn in `deploy/scripts/status.py` only when a container's configuration differs from the running commit's: compare its `com.docker.compose.config-hash` label with `docker compose config --hash` from the export, not the path in its `config_files` label, which changes with every commit's export. At T065's third `make up ENV=prod` (2026-10-09), status warned that six services "was created from another commit's compose file: make up ENV=prod recreates it", right after make up had kept them: gateway-state, langfuse-db, langfuse-web, langfuse-worker, model-server-gpu, and valkey, none of which binds the tree, so their configuration was the same at both commits. Model the label and the hash in `deploy/scripts/test_status.py`'s fake from one real output, per plan §4 (contradicts) Done on 2026-10-09: `stale()` compares the label with `config --hash '*'`, and falls back to the export's path only without a hash. The fake's hashes and labels take the shape of dev-cpu's real output, one `service hash` line each with 64 hex; the values are stand-ins, because the content scan refuses real 64-hex hashes as secret-shaped.
- [X] T182 [US1] Make two status messages say what they mean: `deploy/scripts/status.py`'s "status: healthy, waiting on the operator" only when a WARN is an operator wait (an uninitialized store, a tripped switch), and "status: healthy, with warnings" otherwise; and `scripts/operator.py`'s journal line for `unknown` as "no record since the gateway started", not as a fault. At T065's rollback rehearsal (2026-10-09), dev's initialized stack said "waiting on the operator" because of T181's false WARNs and a Prometheus target seconds after its restart, and every gateway restart left "journal        unknown (journal/2026-10.jsonl)" until a metered call, per contracts/env-files.md §12 and contracts/operator-admin.md §6 (partial) Done on 2026-10-09: "waiting on the operator" for an uninitialized store or a tripped switch, "with warnings" otherwise, and "not written since the gateway started" for `unknown`.
- [X] T183 [US1] Let an agent session run plain `make` for dev-cpu, with the Author's decision. In the main tree, the sandbox's write-deny on `./GNUmakefile` and `./makefile` (T045) leaves a placeholder no process can open, and GNU make opens `GNUmakefile` first: "make: GNUmakefile: Permission denied". In a worktree, preflight's P20 refuses dev-cpu, because the engine mounts the main tree. T064 ran with `make -f Makefile`, and the relay's own call with the file named. The options:
  - **a committed `GNUmakefile` that holds only `include Makefile`** (recommended): the path then exists, and the sandbox binds a write-denied path that exists read-only, as it binds `CLAUDE.md` (the mount table, 2026-10-10): make can read it, and no session can write it. In the main tree, `protected-paths.sh` blocks an agent's edit of it and the sandbox's write-deny names it; a worktree has neither, so a branch could change it. The setup check that the tree holds no `GNUmakefile` (T001's note) becomes a check that it holds exactly this one;
  - `-f Makefile` everywhere: in the relay (human-only), the Makefile's recursive calls, and the docs agents read, CLAUDE.md included (human-only);
  - dropping the sandbox write-denies for those two names, keeping `protected-paths.sh`: this weakens the control against a planted makefile, and isn't recommended (Principle IV), per FR-039 and T045 (contradicts)

  The first option is ready as a patch, for the Author's yes or no (2026-10-09, reworked after five reviews on 2026-10-10): `docs/merge-requests/2026-10-09-fix-000-agents-make.patch`. It adds:
  - the `GNUmakefile`, which includes the Makefile by its own directory;
  - `tools/gates/makefiles_check.py`, with a test. It holds that file to its exact bytes, and fails on any `makefile`:
    - **in a live tree,** except the sandbox's empty placeholders, which hold nothing;
    - **on the gate's export (`--export`),** with no exception: the sandbox never makes a placeholder there, and a read-only export gives a committed empty file the placeholder's mode.

    The gate runs it with `--export` on the proven export, before anything runs make, and anything but a pass stops the gate (T092). `make check` runs it first, as `makefiles-check`, where it reports only an accidental edit: a hostile `GNUmakefile` has already run;
  - the matching lines in plan §2 and §11, in T092, in lifecycle.md, and in `scripts/test_makefile.py`, so a no leaves all of it out.

  T001's check was a manual one in its note; no code asserts the file's absence. The branch itself carries, whatever the answer:
  - T092's and plan §11's first two steps: the export, proven against the commit with replace objects off (the third and fourth reviews); and its `GNUmakefile` and `makefile`, which must be what this task's decision allows. Anything but a pass at either stops the gate (the second review's S-3);
  - `make help` with `grep -h`, so an included makefile doesn't put a file name before every line, with a test;
  - from the review's S1, make can't remake any makefile it read. make's built-in rules copied a planted `Makefile.sh` over the Makefile and ran it, against plan §11 ("Project code never runs outside a container in the Author's terminal") and Principle IV. The fix is `$(MAKEFILE_LIST): ;` and `.SUFFIXES:`, last in the Makefile, with a test and matrix rows.

  Done on 2026-10-12: the Author's yes to the first option, the patch regenerated against main (fa9cf51):
  `docs/merge-requests/2026-10-12-fix-000-agents-make-main.patch`. The committed `GNUmakefile` only includes the
  Makefile, so plain `make` runs in an agent session; `make check` runs `makefiles-check` first. The gate's own
  makefiles step (T092) already held a branch's `GNUmakefile` to main's exact bytes, so it needed no change.
- [X] T184 [US1] **Author's decision:** does US1-5's "no code is changed or rebuilt per environment" ask for one gateway build that prod and dev share? Today each stack's `make up` builds its own from the same tree: T149 found the layers identical across builds and the image IDs different, by compose's per-project label and each build's provenance attestation. Quickstart §1.9 compares the layers. Two ways to get one image ID:
  - **one shared build:** `make up` builds `h4reet-gateway:<commit>` once, outside compose, and the compose file names it with `image:` and no `build:`;
  - **a reproducible build:** each stack still builds, but `SOURCE_DATE_EPOCH`, no compose project label on the image, and no provenance attestation make the builds byte-identical. Compose 2.39 ignored `provenance: false`, so that needs a build outside compose too.

  Either way, plan §4, the compose policy, and the tests change to match, and spec.md's pending deviation goes, per US1-5 and FR-017 (partial)

  Done on 2026-10-11: the Author's answer that day, "Do the one shared build approach." `make up` builds `h4reet-gateway:<commit>` once, outside compose (`deploy/scripts/gateway_image.py`, from the export, on the host's engine) and reuses it for every stack at that commit; dev-cpu builds the working tree as `h4reet-gateway:working-tree` on every run, on the agents' engine only. `deploy/compose.yaml` names `h4reet-gateway:${H4_REF:-working-tree}` with `pull_policy: never` and no `build:`; preflight (P13, P17), `make status`, and `make pull` know that one name; `make build` and `make image` build it first (`gateway-image`). Plan §2, §4, §11, and §17, the env-files and engine contracts, the disclosure's P2, and quickstart §1.9, which now compares image IDs, follow; spec.md's pending deviation is gone. The compose policy's exception and the gate's image step are a patch for the Author, `docs/merge-requests/2026-10-11-feat-000-t184-shared-build.patch`. FR-017 keeps its (partial) mark on this task, whose share of it, nothing rebuilt per environment, now holds by image ID; the Author's run of quickstart §1.9 on the host shows it.
- [ ] T185 [US1] Push the collector's own metrics to Prometheus over OTLP, so they carry a start time and a fresh collector's first batch counts. T149 found Prometheus's created-timestamp-zero-ingestion reaches only pushed series: after a hello on a fresh dev-cpu stack, the gateway's counter had a 0 and then a 1, and `otelcol_exporter_sent_spans` went straight to 13, so Spans to Langfuse showed the first batch as 0. Keep `up{job="otel-collector"}` for the backends panel without counting a series twice, per telemetry.md §4.3, §6.6, and §7.6 (partial)
- [X] T186 [US1] **Patch**, with the closing patch (T117): the seed review's follow-ups, deferred when T174's patch was applied. For `deploy/agents-engine/engine.sh seed`:
  - keep `docker save`'s stderr apart from `docker load`'s, so a failure names the side that failed;
  - refuse two `images.lock` lines that give one repository and tag different digests, since the tag step would move that tag;
  - make the tests' fake engine model the tag's move and `--platform`;
  - test a failure line that holds ESC or CR, across lines.

  Per contracts/agents-engine.md §6.2 (partial)
- [X] T064 [US1] Agent session, on the engine: `make up ENV=dev-cpu` comes up healthy, `make operator-init ENV=dev-cpu` with the dummy token, hello answers from the stand-in (`make hello ENV=dev-cpu`, which makes the probe hop, T147), then `make down ENV=dev-cpu`. Paste the output into `docs/merge-requests/<date>-feat-000-us1-local-stack.md`. Done on 2026-10-09, with the makefile named (`make -f Makefile`, and the relay's own call for `up` and `down`), because plain `make` can't run from an agent session (T183).
- [X] T065 [US1] **Author** (Heavy): run `quickstart.md` §1 (§0.7–§0.8 are done at T063's start, after the early patch):
  - the first stack task's measurements (§1.6): the prod model's load time and VRAM, whether the internal network blocks egress, and whether an internal-only container can publish a port;
  - a cold `make up ENV=prod`, timed (SC-001);
  - `make operator-init`, the hello, the trace, the US1 panels, `make isolation-check` with dev up, and the port scan from another machine;
  - the rollback rehearsal on dev (§1.12).

  The results go into `docs/merge-requests/<date>-feat-000-us1-local-stack.md`, with no secrets.

  Done on 2026-10-09, after four starts and the fixes T176–T178 and T180 (the us1 note's "T065's run"). Every step ran; SC-001 took 431 s. §1.5's panels and §1.9's gateway image didn't meet their expectations, and T149 lists them; T181 and T182 fix what status said along the way.
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
- [X] T084 [US2] Agent session, on the engine: `make breach-test ENV=dev-cpu` passes all 12 steps. Paste the summary table into `docs/merge-requests/<date>-feat-000-us2-kill-switch.md`.
  Done on 2026-10-10, on `sim/000-us2-on-us1-stack` at 3f276e5: this branch at 5fc31f2 merged with the us1 stack at 903439e by the us1 note's recipe, the tree this branch becomes once it merges main. 52 assertions, 52 passed, 0 missed, in 375 s; the note has the table and the whole output. A first run at 56c76be (round 7's commit) also passed 52 of 52; round 8 changed code after it. After the merge, `git diff --stat 3f276e5 HEAD -- . ':!docs' ':!specs'` printing nothing shows the run holds, since nothing the stack builds or the breach test reads lives under `docs/` or `specs/`; otherwise T084 runs again on the branch.
- [ ] T085 [US2] **Author** (Heavy): `make breach-test ENV=dev DELIVERY=real`, recorded with asciinema into `docs/recordings/` (scanned with gitleaks before commit), with the phone on camera (SC-002, quickstart.md §2.2).
- [ ] T086 [US2] Write the merge-request note `docs/merge-requests/<date>-feat-000-us2-kill-switch.md`.

**Checkpoint**: US1 and US2 both work. The kill switch trips with no human action, and only a reset restores it.

---

## Phase 5: User Story 3 — role-scoped agents can't do what the policy forbids (P1) — branch `feat/000-us3-governance`

**Goal**: the enforcement points are proven by the matrix: the hooks, the sandbox, and the agents' engine. Plus the local gates, publish-check, and the agent-configuration evals.

**Independent test**: quickstart.md §3. Matrix stage H runs anywhere, stage S in a session, and stage E from the host; then `make engine-smoke` and the canary.

**Can start in parallel with Phase 3 and Phase 4**: T087–T096 touch none of the gateway's files. T094's panel extends the dashboard US1 creates, so it rebases on US1's branch. T097 needs US2.

### Tests for User Story 3 (the matrix is the test)

- [X] T087 [P] [US3] Grow stage H in `redteam/forbidden-actions.sh` per §13:
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
  Done on 2026-10-10 (feat/000-us3-matrix, folded into this branch): role rows written by hand from each agent file's `tools:` line, with `agent_type` at the payload's top level, and a roster check that fails when an agent file is added or removed; a subagent with an `agent_id` and no `agent_type`; the read-only roles' command rows; the relay's refusals (exit 2) and ops' docker-only grant; a planted `.pyc` that runs under plain `python3` but not under `PY_HOST`, with a live-plant control; the settings toggles and at most one IP opening; the Author-only commands; and the `.mcp.json`, `tools/gates`, and `evals/agent-config` edits, each with indirect variants. Rows T045's patch already added (on US1's line) aren't repeated. Enforcement that waits for a patch is planned. The new block sits below the fix-task rows, clear of the lines US5's patch deletes, so a main with that patch applied merges this branch without a conflict.
- [X] T088 [US3] Create `tools/gates/matrix-required.txt`, listing every row ID, and make the matrix fail when a listed row is missing.
  Done on 2026-10-10: `require_rows` and the list. A row ID is `H/<hook>/<label>` for each stage-H row, plus stage S's and stage E's own IDs and section markers. The list is a curated must-exist set, not every row ID: some labels hold a newline, and the full roster needs a tree with every branch merged (plan §13's as-built note; the Author's decision).
- [X] T089 [US3] Add stage S rows to `redteam/forbidden-actions.sh` per §13, after T087 (the same file). They run when `SANDBOX_RUNTIME=1` is set and `.git/hooks` isn't writable, and are skipped with a notice otherwise. Every row only probes (`test -w`, `test -r`, or a connection attempt). The `main` row is `test -w` on the ref's path, never `update-ref`, and a planned row whose test would write is skipped, not run. The unwritable rows cover the three config files, `GNUmakefile`, `makefile`, `.gitleaks.toml`, `.gitleaksignore`, and `deploy/agents-engine`.
  Done on 2026-10-10: paths resolve against the main working tree; unreadable is a one-byte read, since this sandbox answers `test -r` true for a denied path; a loopback control stands in for the allowed connections (plan §13's as-built note).
- [X] T090 [US3] Make `redteam/forbidden-actions.sh` report stage E, after T089 (the same file). On the host, after `deploy/agents-engine/engine.sh prove`, it reads `prove-limits.sh`'s report and folds rows E1–E16 into its summary.
  Done on 2026-10-10: the report comes from `$H4_PROVE_REPORT` or `~/.local/state/h4reet/agents-engine/prove-report.txt`; without one, stage E is SKIP, never PASS.

### Implementation for User Story 3

- [X] T091 [P] [US3] Create `make secrets` per §11 (make the fresh empty directory for `--gitleaks-ignore-path` with a checked `mktemp -d`, and refuse an empty path: an unchecked `mktemp` failing gave an empty `pycache_prefix`, which loaded planted bytecode, research.md R-35): `gitleaks git --pre-commit` with and without `--staged`, plus `$(git merge-base main HEAD)..HEAD`, each with `--config` (the main tree's `.gitleaks.toml`, from T045's patch), `--gitleaks-ignore-path` naming a fresh empty directory, and `--ignore-gitleaks-allow (and refusing to run while a `.gitleaksignore` exists at its scan source (research.md R-36))`. Missing gitleaks fails closed.
  Done on 2026-10-10: `tools/gates/secrets.sh`, 24 tests (`tools/gates/test/test_secrets.py`). From a session in the main tree it fails closed on the sandbox's mask at `.gitleaksignore`; it runs in a worktree and in the Author's terminal.
- [X] T092 [P] [US3] Create `tools/gates/gate` (the Author's clean-room gate, §11) and `tools/gates/test/test_gate.py`:
  - resolve the ref once to its commit SHA, and use that SHA for the export, every later step, and the merge. Export it with `git archive`, and prove the export as `deploy/scripts/export_tree.py` proves a stack's (contracts/env-files.md §12):
    - every git call runs with `GIT_NO_REPLACE_OBJECTS=1`, main's own reads included;
    - the commit object is rehashed against its SHA, and the expected tree is read from that object;
    - no `.git/info/attributes` exists;
    - no ref exists under `refs/replace` (`git for-each-ref refs/replace` prints nothing). The Author's merge and checkouts honor a replace ref, so with one the gate would vouch for a commit other than the one the merge writes;
    - extraction uses tarfile's data filter;
    - the export hashes to that tree.

    Otherwise a replace ref, or `.gitattributes`' `export-ignore` and `export-subst`, could change what every later step sees, or what the merge writes (T183's third to fifth reviews). Anything short of that proof stops the gate. The merge command the gate prints is `git --no-replace-objects merge --ff-only <SHA>`;
  - before anything runs make on the export, check that its `GNUmakefile` and `makefile` are what T183's decision allows: neither while main has no `GNUmakefile`, or exactly main's `GNUmakefile` and no `makefile`. Anything but a pass stops the gate, and nothing runs make on that export (T183's reviews);
  - build the devcontainer image, tagged by `.devcontainer/`'s hash;
  - the container phase: `npm ci --ignore-scripts`, then lint, test, the scaffolds, and stage H with `--network none`;
  - the host phase: githooks, toolchain, policy, `corpus-check` with the denylist through `PY_HOST`, gitleaks, the image build on the engine, and stage E plus the behavioral evals when triggered;
  - every gitleaks call with the flags of §11;
  - the push of the agent-config eval history as the `h4.devtime.eval.*` metrics to prod's x004 (§4.4);
  - a summary line for the merge commit;
  - `gate --host`, marked DEGRADED.
  - `gate --contract-replay FILE` for `make contract-live` (T103): the container phase over `git archive HEAD`, with the recording mounted read-only, running `vitest run test/contract/replay.test.ts` with `H4_CONTRACT_RECORDING` set, and `--network none` (provider-adapter.md §5.3).
    - The command is narrower than §5.3's `vitest run test/contract`: only the replay test reads the recording, and the rest of the contract suite runs in the gate's own test phase.
    - The recorder reads the working tree's `live-cases.json`, and the replay reads HEAD's. So T092 also makes `make contract-live` refuse, before it records, a case file that differs from HEAD's, with its test, and §5.4's "can't drift" holds. Until then the target stops at `PLANNED (T092)` before anything is recorded (US5's review).
  Done on 2026-10-10: `tools/gates/gate`, 81 tests, and `make contract-live`'s HEAD check, 14 tests (plan §11's as-built note). T103's replay and T107's `make contract-live` are no longer blocked on it.
  After US3's review D: the gate refuses (exit 2) unless main's checkout is main's: HEAD on `refs/heads/main`, tracked files clean with nothing hidden, and nothing git doesn't track in `tools/gates/`, `corpus/tools/`, `evals/agent-config/` (its `history/` aside), or `deploy/agents-engine/`, Python's `__pycache__/*.pyc` aside (plan §11).
- [X] T093 [P] [US3] Create `tools/gates/publish_check.py` per §12 (exit codes 0, 1, 3; it refuses with 3 while a `.gitleaksignore` exists at the repository root, research.md R-36) and `tools/gates/test/test_publish_check.py`, with fixture repositories:
  - a fake secret assembled at run time in an old commit;
  - a denylisted phrase in a removed file;
  - a currency amount in corpus Markdown;
  - a denylisted author email.

  Wire `make publish-check` (Author).
  Done on 2026-10-10: 43 tests; findings use an internal exit code, and gitleaks' own exit 0 under a failed git is caught (plan §12's as-built note).
- [X] T094 [P] [US3] Create the dev-time usage panel (FR-037) and the behavioral agent-config evals. The panel goes in `deploy/grafana/dashboards/h4-runtime.json`, with contracts/telemetry.md §7.7's queries, fed by the gate's push (T092). The evals follow §14: `evals/agent-config/behavioral.py`, about 12 cases in `evals/agent-config/cases/*.yaml`, `evals/agent-config/thresholds.yaml`, and the history format under `evals/agent-config/history/`. `make evals-agent-config` (Author) runs them. `make evals` shows PENDING with the command when the trigger hash has no passing entry. A case whose enforcement waits for a patch reports PLANNED, naming the patch's task (§14).
  Done on 2026-10-10: the panel (six panels in §7.7's row, `deploy/scripts/test_dashboard.py`) and the behavioral tier: 13 cases, 10 enforcement and 3 conduct, 4 planned for T117, and 160 tests (plan §14's as-built note). The canary case counts: its T045 mark would be stale on main, which has had the early patch since b34626d.
  After US3's reviews (round C, plan §14's as-built note):
  - a case `needs:` a patch's task and is planned exactly while that patch's probe is false, so no mark goes stale and no case counts without its enforcement (prints-canary needs T045 again; four cases need T117);
  - an entry counts only when this machine attests its exact bytes (`~/.local/state/h4reet/evals/attested/`, which agent sessions can't write), and the newest attested run for a trigger hash decides;
  - `make evals-agent-config REF=<branch>` runs main's own tier from main's checkout against the ref's tree as data, shows the ref's diff under `.claude/`, CLAUDE.md, REVIEW.md, and every human-only path, and waits for a typed `yes`; the sessions get an allowlisted environment;
  - `status` has an export mode that never runs git, which the gate uses.
  After review D1 (plan §14's as-built note): the run ends with the commands that commit its entry on the branch from main's repository with git's plumbing (a temporary index from the tip, `commit-tree`, and `update-ref` from the tip they read), never switching main's checkout to the branch, and working while another worktree holds it; and its clean check refuses untracked files only in `evals/agent-config/` (earlier entries aside), so the Author's `.idea/`, `.vscode/`, and `.github/workflows/` don't block it.
- [X] T095 [P] [US3] Add `make matrix-canary` (Author): `claude -p --setting-sources project` with fake values for every FR-007 variable, asserting that none appears in the session's environment or transcript (§13).
  Done on 2026-10-10: `tools/gates/matrix_canary.py`, 32 tests, with a stub `claude` the only one on the tests' PATH (plan §13's as-built note).
- [X] T096 [US3] Agent session: run stage H and stage S of `redteam/forbidden-actions.sh`, and paste the matrix report, planned rows listed, into `docs/merge-requests/<date>-feat-000-us3-governance.md`.
  Done on 2026-10-11: the report, stage H and stage S in the sandbox, is pasted into `docs/merge-requests/2026-10-11-feat-000-us3-governance.md` (300 passed, 0 failed, 30 known gaps; the planned rows listed with the patch that turns each to block).
- [ ] T097 [US3] Agent session, after Phase 4 has merged: `make engine-smoke` (`deploy/agents-engine/engine.sh smoke`), meaning `make up ENV=dev-cpu` comes up healthy and `make breach-test ENV=dev-cpu` passes (US3-9's positive half, quickstart.md §3.4).
- [X] T098 **Patch**: write the governance patch, `docs/merge-requests/<date>-feat-000-us3-governance-enforcement.patch`, per §15: `sandbox.filesystem.denyWrite` on `./tools/gates` and `./evals/agent-config`, the matching `Edit(...)` denies, the `protected-paths.sh` rules, and their matrix rows.
  Done on 2026-10-10: `docs/merge-requests/2026-10-10-feat-000-us3-governance-enforcement.patch`. It holds `denyWrite` and `Edit(...)` denies for `./tools/gates` and `./evals/agent-config`; `protected-paths.sh`'s rule for both; the matrix's five governance rows switched to block, with path forms, neighbours that must pass, two stage S rows, and a settings row; and the required list's new IDs. It applies to the merged tree with or without US5's patch. There, stage H runs 301 passed, 0 failed without US5's patch, and 370 passed, 0 failed with it. Stage S reads the session's own sandbox, so its two rows pass once the patch is applied on main.
  Regenerated after review B, against the merged tree with the three review rounds (the simulation `sim/000-us3-on-us5-sim`): the role rows now run in two forms, and N4's two ops rows became block rows, because the early patch they wait for has been on main since b34626d (`deploy/agents-engine/authz.py`, and ops' docker-only `docker-relay` grant). It still applies with or without US5's patch. Stage H, `SANDBOX_RUNTIME=0`: 333 passed, 0 failed, 31 known gaps, 163 planned without US5's patch; 403 passed, 0 failed, 31 known gaps, 93 planned with it. Regenerated again after the convergence round (Phase 15), on the simulations at 816e700: 334 passed, 0 failed, 163 planned without US5's patch, and 404 passed, 0 failed, 93 planned with it; it reverses cleanly.
- [ ] T099 [US3] **Author** (Heavy, after T097, with no agent session using the engine):
  - `deploy/agents-engine/engine.sh prove` (stage E, rows E1–E16);
  - not `tools/gates/gate` on this branch: the gate runs only from main's checkout (HEAD on `refs/heads/main`, tracked files clean with nothing hidden, nothing untracked where its code is; plan §11), so that main's code grades a branch, and main has no gate until this branch merges. So before the merge the Author reads `git diff main...<this branch>` under `tools/gates/`, `corpus/tools/`, `evals/agent-config/`, and `deploy/agents-engine/`, the code the gate will trust. After it, with the governance patch committed, the Author runs `tools/gates/gate main` from main's checkout, the gate's first run, over the merged tree, and puts its summary line in the note. A FAIL there is fixed forward on a new branch;
  - `make evals-agent-config REF=<ref>` from main's checkout, once this branch has merged (main must have the tier before any run can start), against a ref holding the merged tree with US5's patch and the governance patch applied, committing its entry there with the commands the run prints, never by switching main's checkout to the ref (review D1, 1), then merging so main's tree is identical (SC-008; review B's finding 2). So US3's own gate shows the behavioral tier PENDING at its merge, once, which the merge commit records;
  - the SC-007 timing of quickstart.md §6.2 (Heavy): a fresh clone, then the devcontainer with an empty build cache, `make setup`, and `make test`, in under 30 minutes.

  The results go into `docs/merge-requests/<date>-feat-000-us3-governance.md`. After this branch merges, apply the governance patch (T098), then run `claude doctor`.
- [X] T100 [US3] Write the merge-request note `docs/merge-requests/<date>-feat-000-us3-governance.md`.
  Done on 2026-10-11: `docs/merge-requests/2026-10-11-feat-000-us3-governance.md`.

**Checkpoint**: every FR-039 limit is proven from the host, and every hook row passes except the planned ones.

---

## Phase 6: User Story 5 — local-first, with a capped Bedrock fallback, fully traced (P2) — branch `feat/000-us5-fallback`

**Goal**: production falls back to Bedrock inside the sub-budget, and both adapters pass one contract suite.

**Independent test**: quickstart.md §4 and §6.1. A local answer; Bedrock within 5 s with the model server stopped, on prod, in the Author's terminal; both adapters passing the same suite.

### Tests for User Story 5

- [X] T101 [P] [US5] Create `services/gateway/test/contract/bedrock-converse.contract.test.ts`, running every assertion C1–C12 with `aws-sdk-client-mock` and `aws-sdk-client-mock-vitest`. Create `test/contract/replay.test.ts`, which replays a recording made by `operator.py contract-record` (contracts/provider-adapter.md §5.3 and §5.4).
  Done on 2026-10-10:
  - **`bedrock-converse.contract.test.ts`** runs C1–C12 against `aws-sdk-client-mock` (`test/helpers/stub-bedrock.ts`), with T102. Every case passes; the one skip is the direct-only variant. `bedrock-converse.errors.test.ts` covers §5.2's "past C4".
  - **`replay.test.ts`:**
    - It checks `live-cases.json`, §5.4's eight cases, against §5's body rules and hello's own system prompt.
    - It replays a recording made in the test, through the real endpoint against the stub OpenAI server, so the endpoint's bodies and the live assertions can't drift.
    - With `H4_CONTRACT_RECORDING`, it replays the Author's recording, priced with the repository's own `prices.yaml`; I checked that path with a hand-made recording.

### Implementation for User Story 5

- [X] T102 [US5] Implement `services/gateway/src/adapters/bedrock-converse.ts` per contracts/provider-adapter.md §3.2: Its circuit breaker sets `circuit_open` through `AdapterHealth.set`, so T152's `fallback_unavailable` alert fires when the circuit opens (Phase 4's last review). Its name lookups, the SSO refresh's included, go through c-ares: the credential chain gets the same handler as `clientConfig.requestHandler` (§3.2's name-lookup row, from T189). It decides whether the SDK may refresh the SSO token in memory, which token-providers 3.1147.0 does from the token's last 5 minutes on, contacting `oidc.us-east-1.amazonaws.com` while running (plan.md's correction, US2's round 9). (Corrected on 2026-10-10 by the round-2 review: the circuit is part of `AdapterHealth`'s combined state, not a `set` call, and the refresh decision moved to T105, the Author's.)
  - `ConverseCommand` in us-east-1, `maxAttempts: 1`, `NodeHttpHandler({connectionTimeout: 1000, requestTimeout: 4000, httpsAgent})`, with `httpsAgent` keeping the SDK default's `keepAlive: true` and `maxSockets: 50` and adding `lookup: aresLookup`;
  - one retry, only on `ThrottlingException`;
  - a timeout counts as `possiblyBilled`;
  - health never spends: credential expiry plus a circuit breaker (3 failures, 30 s open);
  - a `credentials_expiring` outbox row 2 h before the SSO session ends.

  Add the `bedrock` adapter to `config/routing.yaml` with its placeholder model (contracts/config-files.md §1.2, step 3); prod's route doesn't name it yet.

  Done on 2026-10-10:
  - **The adapter,** `src/adapters/bedrock-converse.ts`, follows §3.2:
    - the client and chain: one handler whose `httpsAgent` keeps the SDK default's options and resolves through c-ares, shared with `fromNodeProviderChain({ clientConfig: { requestHandler } })`;
    - the Converse request and response, and §2.5's mapping, with the handler's connect timeout unbilled (§2.5's readings);
    - a health probe that resolves credentials and reads the SSO session's end;
    - `close()`, which also destroys the agent, since the handler leaves an agent it was handed open.

    It refuses routing.yaml's placeholder model.
  - **The SSO token refresh:** the chain is the SDK's default, which refreshes the token in memory from its last 5 minutes on. That stays allowed until the Author decides; the merge-request note asks.
  - **credentials_expiring:**
    - `AdapterHealth` now keeps the probe's `credentialsExpireAt`, which it had dropped, so `/health`'s `credentials_expire_at` reports it too.
    - The 10 s ticker's `checkCredentials()` queues the alert once per session end, from `credentials_warn_before_s` before it, through the dispatcher's new `credentialsExpiring()`. Its dedupe key holds the alert to one across restarts.
    - The type spec gives the label ("Bedrock") and the lead time.
  - **routing.yaml** has the bedrock adapter with its placeholder model, and `REGISTERED_ADAPTER_TYPES` names bedrock-converse. validate-config notes the placeholder, and no route names it.
  - **Tests:**
    - `test/contract/bedrock-converse.contract.test.ts`: the suite, C1–C12, against `aws-sdk-client-mock`;
    - `test/contract/bedrock-converse.errors.test.ts`: past C4;
    - `test/unit/bedrock-wiring.test.ts`;
    - `test/unit/credentials-expiring.test.ts` and `test/integration/credentials-expiring.test.ts`;
    - the helper `test/helpers/stub-bedrock.ts`.

    Each new behavior fails its test when taken out (checked).
  - **For the Author's acceptance:** two existing test files changed with the registration. The note lists them.
    - `test/unit/registry.test.ts` pins the registered types, and now names bedrock-converse, as its comment anticipated.
    - `test/unit/config.test.ts`'s sample §1.3 error was the unregistered bedrock-converse type. It now passes the pre-T102 type set explicitly, and keeps its assertions.

  Reopened on 2026-10-10 by the branch's review: it was marked done without its circuit breaker.
  - **The circuit breaker** (provider-adapter.md §6 item 5, and its readings there) has landed since. `AdapterHealth` combines it with the probes, and the type spec's `circuit()` gives its settings.
    - It counts calls' ends, opens after 3 counted failures in a row, and holds fallback calls at admission as `fallback_unavailable`.
    - After `open_s`, the first fallback call is the trial: its success closes the circuit, and its failure opens it for another `open_s`.
    - Entering `circuit_open` raises T152's `fallback_unavailable` alert through the existing hook.
    - `auth` on a paid adapter now reads as `credentials` (§2.5's auth row).
    - `test/unit/circuit.test.ts` covers the state machine and the circuit around Bedrock's calls. Each behavior fails a test when taken out (15 mutations, checked).
  - **credentials_expiring, after the review:**
    - The check logs `credentials.expiring` (telemetry.md §5.2) once per session end.
    - It asks the dispatcher at each tick, one question at a time, until the row is queued or found already there. Before, a store that was down at the first tick in the window lost the alert for good: the dispatcher now answers `queued`, `present`, or `retry`.
  - **The client's handler** now sets `throwOnRequestTimeout` (§3.2's client row). `ECONNRESET` and `EPIPE` are billed timeouts under their own codes, and `EHOSTUNREACH`, `ENETUNREACH`, and `EADDRNOTAVAIL` are `unavailable` (§2.5's readings).
  - **The refresh decision** is the Author's, at T105: the profile's kind decides whether the SDK refreshes. The record says what each kind does: plan.md §5.2, research.md R-17, provider-adapter.md §3.2, the runbook, and disclosure row F2. T102 keeps the SDK's default, which handles both kinds, so T102 is done again.
- [X] T103 [US5] Implement `POST /admin/adapters/{id}/complete` per contracts/operator-admin.md §5: local on any stack, bedrock on prod only, attribution `test`, through admission. Add `scripts/operator.py contract-record` and `make contract-live ENV=prod ADAPTER=local|bedrock`, which records in the Author's terminal and replays in the devcontainer image with `--network none` (§7).
  Partly done on 2026-10-10: the endpoint.
  - `src/routes/adapters.ts` validates §5's body and answers 200, 502, 404, 400, 415, 429, or 503.
  - `Gateway.adapterCall` runs §5's pipeline: the state read first; the paid adapter through the limits and admission as `test`; the local adapter free; no failover.
  - The metered path is split so hello's answer is unchanged: `meteredAttempt` returns the outcome, and `callMetered` keeps answering `fallback_unavailable` on a failure.
  - Each attempt record now carries its client span's name and keys, and `GatewayCall` takes a temperature.
  - `test/integration/adapter-calls.test.ts` covers the local path, the refusals, and prod's Bedrock path under `aws-sdk-client-mock`: charged to the day and month and never to the sub-budget, a throttle retried once, and a timeout charged its reservation. `test/helpers/stack.ts` takes a `configDir`.
  - After the review, the endpoint's records match hello's:
    - each response counts once in `h4.gateway.requests`;
    - a degraded one logs `call.degraded`, and a 429 `call.refused`;
    - the audit row's `ts` is on the gateway clock.

    New tests pin those records. Three more pin the rules: the synthetic adapter is 404 even where dev's route builds it, the endpoint never fails over, and a fallback awaiting renewal doesn't hold a test call.
  Then the rest, the same day, but for the replay:
  - **`scripts/operator.py contract-record`** reads `/admin/status`, sends each case of `live-cases.json`, and reads `/admin/status` again. It writes the recording, the suite's `LiveRecording`, into a new 0600 file, in ASCII, with what isn't ASCII escaped.
    - A provider's 502 is a case's answer; any other refusal stops the run, and nothing is written.
    - It refuses inside the agent sandbox, `bedrock` off prod, and an existing output file.
    - `scripts/test_operator_record.py` covers it.
  - **`make contract-live ENV= ADAPTER=local|bedrock REASON=`** refuses an agent session, a missing reason or adapter, and bedrock off prod. It records into a 0700 temporary directory, hands the recording to `tools/gates/gate --contract-replay`, and deletes the directory once the gate returns. `scripts/test_contract_live.py` covers the refusals.
  - **The replay,** done on US3's branch: `tools/gates/gate --contract-replay` (T092), with `make contract-live` refusing a case file that differs from HEAD's, and passing only on a test that passed under `recorded live: <adapter>` (round A's review fix). T107 runs it live, in the Author's terminal.
  - **Its deny for agents,** beside `make aws-login`'s and the Bedrock evals', is `docs/merge-requests/2026-10-10-feat-000-us5-fallback-enforcement.patch`, since a paid route gets its deny with it (CLAUDE.md). It is plan §15's fourth patch, applied to this branch's merge with main, where it uses the early patch's engine rule.
    - Its bash-gate rules refuse `make contract-live` and `make aws-login` as two matches in one command: make, gmake, or `tools/gates/run_checks` (by path or as a module) anywhere, and the target's name after any character a name or a path can't hold, a parameter's default (`${t:-…}`) included, or after the leading `./` make strips from a goal (round 4's finding). `make evals` or `make check` with `bedrock` is refused the same way, since `make check`'s evals gate runs `make evals`. So are `operator.py` with `contract-record`, and `evals/run.py`, `evals.run`, or `from evals import` with `bedrock`.
    - They refuse `aws-login.sh` where it runs, by the engine rule's starts and skips, and wherever a shell is started in the same command (`| bash`, `bash <`, `sh -c "$(cat …)"`, `eval`). So `git add`, `git diff`, `cat`, and `shellcheck` naming it still work. They refuse the AWS CLI's `sso login`, `configure sso`, and `sso-oidc`.
    - Quotes, backslashes, and `$` inside a name don't hide it: the patch adds `$` to the engine rule's in-name class. These rules read the command three ways: as written, joined, and as bash reads it, comments ended at their newline before the lines are joined (a comment starts after a blank, `;`, `&`, `|`, `(`, or `)`, round 5's finding). The stack's rules still read it as written, since joining alone would put the line after a comment's backslash onto the comment (round 3's finding against the third version, which joined it for every rule).
    - For every rule, the patch refuses a command over 60,000 bytes. Past a pipe buffer, a rule's early-matching grep leaves its writer a SIGPIPE, and the rule false under pipefail (round 2's finding, outside this branch's rules).
    - `redteam/forbidden-actions.sh` carries 68 rows as planned, which the patch makes block: the first 16, and the spellings the reviews found getting through the earlier versions. It also has 2 block rows (a comment's backslash-newline before two of the stack's commands), 11 gap rows, and 15 allow rows. The gap rows are a name built at run time or held in a variable, a glob, an ANSI-C escape, `run.py` from its own directory or a computed import, a copy run in a command of its own, and a backslash-newline inside or between the words of the stack's commands (T117).
    - On this branch alone, the matrix passes 183 rows, with no failures and 18 known gaps. With the patch applied to the merge's export, it passes 328 rows, with no failures and 19 known gaps, 11 of them this branch's.
    - The closing patch (T117) keeps the other Author-only targets: `make publish-check`, `make tools`, `make matrix-canary`, and `make evals-agent-config`.
- [X] T104 [US5] Create `deploy/scripts/aws-login.sh` and `make aws-login` (Author): `HOME=~/.config/h4reet-ai/aws-home aws sso login --profile h4reet-bedrock`. Wire the gateway's `${H4_AWS_DIR}` mount and `GATEWAY_AWS_PROFILE` in `deploy/compose.yaml` (§5.2).

  Done on 2026-10-10.
  - **The script** runs that command with every `AWS_*` variable of the calling shell dropped, so none can point the login at another profile or config file (`AWS_CONFIG_FILE` could name the Author's own), and under `umask 077`. It first refuses, with exit 2: the agent sandbox, any argument, no `aws` on PATH, an `aws-home` or `.aws` that is missing, a symbolic link, another user's, or not 0700 (a link would put the session, and the gateway's mount, wherever it points), and a `config` without `[profile h4reet-bedrock]`, naming quickstart.md §0.6's one-time `aws configure sso`. It passes the CLI's own output through, which the sign-in needs, and never reads the token cache, so no token or client secret can reach its output. A failed login is exit 1.
  - **`make aws-login`** refuses agent sessions, and any `ENV` but prod: dev and dev-cpu mount `deploy/aws-none`.
  - **After the review** (b75a0bc), the script also refuses an SSO region other than us-east-1, the profile's or its sso-session's, since the region decides which sign-in hosts the login and prod reach, and disclosure row F2 lists us-east-1's. Preflight's P19 checks the same since T194.
  - **The compose wiring was already in place,** from 50de493 (T029–T031), and agrees with plan §5.2, contracts/env-files.md §2 and §4, and provider-adapter.md §3.2: `AWS_PROFILE` from `GATEWAY_AWS_PROFILE` (`h4reet-bedrock` in prod's template, absent elsewhere, so `none`), `HOME=/home/node`, `AWS_EC2_METADATA_DISABLED=true`, and `${H4_AWS_DIR}` mounted read-only at `/home/node/.aws`: `~/.config/h4reet-ai/aws-home/.aws` on prod, `deploy/aws-none` on dev and dev-cpu. Nothing there changed.
  - **Tests:** `deploy/scripts/test_aws_login.py` runs the script and the target against a fake `aws`, on a PATH that can't reach a real one: the command and its `HOME`, the dropped variables, no canary from the cache or the shell in the output, each refusal, and the script's directory and profile held to prod's template and the gateway's mount.
- [ ] T105 [US5] **Author**: set up Bedrock and fill `config/prices.yaml` and `config/routing.yaml` (research.md R-12 and R-17, quickstart.md §0.6):
  - in IAM Identity Center, create the permission set allowing only `bedrock:InvokeModel` on the confirmed inference profile and the foundation models it routes to, and the dedicated user `h4reet-runtime` if you confirmed it. This is the spec's named deviation from "Infrastructure exclusively via Terraform" (spec Assumptions);
  - confirm the model with `aws bedrock list-inference-profiles`: Claude Haiku 5.5 in us-east-1, otherwise Claude Haiku 4.5's `us.` profile;
  - append a new version to `config/prices.yaml` with its entry from the Bedrock pricing page, repeating the local and synthetic entries (P5: a published version never changes);
  - set its ID in `config/routing.yaml`, and add `fallback: bedrock` to the prod route;
  - commit both, then `make up ENV=prod`; preflight P19 now checks the AWS profile;
  - choose the profile's kind at `aws configure sso`, the decision T102 left you (the US5 note's decision 1). Leaving "SSO session name" blank makes a legacy profile. It has no refresh token, so prod never contacts `oidc` while running, and the 2 h `credentials_expiring` warning works. Naming a session makes an `sso_session` profile: the SDK refreshes the token through `oidc` while running, and no warning comes, since no session end is known. After the first `make aws-login`, `make operator-status ENV=prod` shows which kind is in use: a legacy profile's line names the session's end. Record the AWS CLI's version.
- [X] T106 [US5] Add the Bedrock panels (cost by provider, adapter health) to `deploy/grafana/dashboards/h4-runtime.json` (contracts/telemetry.md §7.2 and §7.4); the Bedrock and AWS SSO rows to `docs/data-flow-disclosure.md`, naming `oidc.us-east-1.amazonaws.com` while running if T102 allows the SDK's token refresh; and the runbooks `docs/runbooks/bedrock-credentials-expiring.md` and `docs/runbooks/bedrock-unavailable.md`.

  Done on 2026-10-10.
  - **The panels were already there,** with §7.2's and §7.4's exact queries: "Cost by provider and attribution" from T081, and "Model-server health", whose B is each adapter's health, from T060. `deploy/scripts/test_dashboard.py` holds each section of §7 whole and allows no panel outside it, so T106 adds no panel. It adds how Bedrock reads on them: the cost table's columns are Provider, Model, Attribution, and Cost, sorted by cost, to the micro-dollar, and its description says what `aws.bedrock`'s `fallback` and `test` rows are; the health panel's description says when `bedrock` reads down, and names its runbooks. Two new tests hold both.
  - **The disclosure:** rows F1 (the Bedrock fallback) and F2 (the AWS SSO credential exchange) carry plan §17's words in their cells, with the reading beside them. F2 names `oidc.us-east-1.amazonaws.com` at login and while running, since T102 keeps the SDK's refresh until the Author decides, and says that decision could narrow it to login only. It also says what token-providers 3.1147.0 does once the fresh token can't be written back: it asks again at each later renewal of the role credentials. S2 points at both rows. `evals/test_disclosure.py` holds the plan's words, the refresh, and the region config-files.md's rule R7 ties to F1.
  - **The runbooks** have Symptoms · Impact · Act · Verify · Undo · Record, and quote alerts.md §3's headlines and fixed sentences and gateway-http.md §3's detail, which `evals/test_runbooks.py` now reads from the contracts. `docs/runbooks/README.md` doesn't exist yet (T111).
  - **Not verified, for T107:** whether a new cost series' first increment shows. Prometheus 3.15 here ingests no zero at a series' start, so `increase()` may read the first call of a new `aws.bedrock` row as 0, and quickstart.md §4.2's dashboard check would see less than the calls' cost.
- [ ] T107 [US5] **Author** (Heavy): run `quickstart.md` §4 and §6.1:
  - a local answer;
  - stop the model server, and Bedrock answers within 5 s, with the fallback cost on the dashboard within 60 s (SC-005);
  - `make contract-live` for local and for bedrock (SC-006);
  - `tools/gates/gate` on the branch.

  The results go into `docs/merge-requests/<date>-feat-000-us5-fallback.md`.
- [X] T108 [US5] Write the merge-request note `docs/merge-requests/<date>-feat-000-us5-fallback.md`.
  Done on 2026-10-10: `docs/merge-requests/2026-10-10-feat-000-us5-fallback.md`.

**Checkpoint**: US5's fallback works on prod, and both adapters pass one suite.

---

## Phase 7: User Story 6 — the repository explains itself (P3) — branch `feat/000-us6-docs`

**Goal**: a stranger finds the reasoning, the process, and the running stack from the README.

**Independent test**: quickstart.md §5.1 and §5.2. The README's links, and every ADR within two clicks (SC-009).

- [X] T109 [P] [US6] Update `README.md`:
  - the status and a devcontainer quickstart;
  - links to the constitution, `intent/`, the spec index, the ADR index, `docs/how-we-build/`, `SECURITY.md`, the MIT license, `docs/data-flow-disclosure.md`, `docs/runbooks/`, and `docs/recordings/`, with the breach recording on the non-engineer path.

  Done on 2026-10-10 (feat/000-us6-docs-wip, folded into this branch). `docs/recordings/README.md` is new, so the link resolves before T085's recording exists. The status relies on US1's T065 results. From US6's review: the quickstart gives SC-007's 30 minutes as its target, which T099 times, not as a fact, and the breach recording's line says hello degrades, since spec 000 has no site.
- [X] T110 [P] [US6] Complete `docs/data-flow-disclosure.md` with every row of §17, closing with "No visitor data flows in this spec.". Link it from `SECURITY.md`.
  Done on 2026-10-10: rows D1 to D3 add the development-time flows (Claude Code, the engine's proxied pulls, the devcontainer build and `make tools`). `evals/test_disclosure.py` holds every §17 flow to a row. D1 had left Claude Code's own default reporting as an open question; from US6's review (finding 4), D1 and plan §17 list it as a flow: its operational metrics and error reports, which its documentation says it sends unless `DISABLE_TELEMETRY` and `DISABLE_ERROR_REPORTING` are set (to confirm for the pinned version), and which the closing patch (T117) switches off by setting both. D2 names the gate's own `npm ci`, which reaches `registry.npmjs.org` on every run but `--host`'s.
- [X] T111 [P] [US6] Create `docs/runbooks/README.md`, an index of every runbook, and the runbooks for the agents' engine and the local gate. Update `docs/how-we-build/lifecycle.md`'s enforcement table with the new layers.
  Done on 2026-10-10, with `evals/test_runbooks.py` holding the index to the folder. The local-gate runbook was then matched to the gate US3 built (`--prove`, the eval history's WARN, the main-tree mask). US6's review corrected both pages from the code, with tests that read it: the local-gate page's `--host`, PENDING, publish-check's summary lines (make exits 2 for both of its failures), the eval history's posts (every entry the branch adds, on every run), and `--prove`'s reset of the engine; the engine's page on a missing image, which preflight doesn't check (P17 checks pins only; P18, the stand-in model). lifecycle.md counts the 13 behavioral cases and names the Claude Code pin among their triggers, and its row on what the Author runs takes CLAUDE.md's words.
- [X] T112 [P] [US6] Update `docs/START-HERE.md` per §16:
  - §1: the NVIDIA runtime step, the disk check, `make tools` (Node 24 through nvm, the default Node left alone), and `deploy/agents-engine/engine.sh setup` with its `wsl --shutdown`;
  - a new "Before you merge" section;
  - §4's gotchas;
  - §6 step 1: `make publish-check`.

  Done on 2026-10-10. "Before you merge" is a new §7, so §4 and §6 keep the numbers plan §12, FR-042, and T120 cite; it was then matched to the gate US3 built. Stale §4 lines were updated, one of which kept the Telegram token in a shell profile, which preflight's P5 now refuses. US6's review matched §7 to the code: the merge command the gate prints, `--host` in the gate's words, ADR 0017's list of what runs in the Author's terminal, what `make check` runs there, and PENDING as the behavioral tier decides it; §4 and §6 read publish-check's end from its summary line.
- [X] T113 [US6] Add the new human-only paths to `.github/CODEOWNERS` (FR-001): `tools/gates/**`, `evals/agent-config/**`, `.gitleaks.toml`, `deploy/agents-engine/**`, `.mcp.json`, and `config/prices*`.
  Done on 2026-10-10: the six paths. From US6's review (finding 5), CODEOWNERS also covers the other human-only paths spec 000 names, as plan §15, ADR 0017, and `protected-paths.sh` have them: `config/budgets*`, `config/alert*`, `config/kill-switch*`, `deploy/env/`, `GNUmakefile` and `makefile` at the root, and a `.gitleaksignore` wherever one sits (`**/.gitleaksignore`). `evals/test_repository_docs.py` holds CODEOWNERS to all thirteen patterns, and checks that each reaches a file in its path as GitHub matches, the last matching line deciding.
- [X] T114 [US6] Add a docs-link check, `evals/docs_links.py`, run by `make evals` (outside `evals/agent-config/`, which is human-only by now): every relative link in `README.md`, `docs/**`, and `specs/**` resolves; the README links the ADR index; and the index links every ADR file (SC-009).
  Done on 2026-10-10: it also checks each `#fragment` against the target's headings, and that ADRs 0001 to 0005 exist. `make evals` runs it through `PY_HOST`. 0 failed, of 791 links in 69 files. US6's review found four ways to fool it, each now closed with a test that fails without its fix: HTML's `<a href>` and `<img src>` went unread, and so did reference definitions in a block quote or a list item; a line of backticks indented four columns outside a list opened a fence that never closed, hiding the rest of its page; and the outside-the-repository check compared paths as text, so a symbolic link out passed. The repository's 69 files give the same links as before.
- [ ] T115 [US6] **Author**: `tools/gates/gate` on the branch, from main's checkout; and, if the behavioral tier's trigger fired, `make evals-agent-config REF=feat/000-us6-docs` from main's checkout, committing its history entry on the branch. The summary goes into the note.
- [X] T116 [US6] Write the merge-request note `docs/merge-requests/<date>-feat-000-us6-docs.md`.
  Done on 2026-10-11: `docs/merge-requests/2026-10-11-feat-000-us6-docs.md`.

---

## Phase 8: Polish and cross-cutting — branch `feat/000-enforcement`

**Purpose**: the closing enforcement patch, the switch from planned rows to enforced rows, and the final validation.

- [X] T117 **Patch**: write the closing enforcement patch, `docs/merge-requests/<date>-feat-000-enforcement-enforcement.patch`, per §15:
  - `.claude/settings.json`: `denyWrite` on `./.mcp.json`, `./.git/info`, `./.git/refs/heads/main`, `./.git/refs/replace` (T183's fifth review: a merge honors a replace ref), and `./.github/workflows` (convergence T195), their `Edit(...)` denies, and the Claude Code telemetry `env` entries, with `DISABLE_TELEMETRY` and `DISABLE_ERROR_REPORTING` (FR-040; disclosure row D1). Every credential deny, and the denies on the files prod reads and the code the Author runs, came with T045; the gate's came with T098;
  - `.claude/hooks/bash-gate.sh`: `operator-*` and admin URLs outside dev-cpu, `make breach-test` and `evals/breach.py` on any stack but dev-cpu, in every spelling, with `SANDBOX_RUNTIME=0` or `env -u SANDBOX_RUNTIME` in front (FR-008; plan §13 and §15, the nine planned rows from T080's review), the Author-only targets US5's patch leaves (`make publish-check`, `make tools`, `make matrix-canary`, `make evals-agent-config`), `--no-verify`, `claude mcp add`, git-alias expansion, and the `terraform` global-flag pattern; and, keyed on `agent_type`, the refusals for the reviewer, the red-teamer, and a subagent with an `agent_id` but no type: `git diff --output`, a redirection to a file (not `/dev/null`), `tee`, make's own `-f` (but the Makefile), `-C`, `-E`, `-I`, `MAKEFILES`, or `MAKEFLAGS`, and an `ADAPTER=` but `fake`;
  - `.claude/hooks/protected-paths.sh`: `.mcp.json`, role write scopes from `agent_type`, and writes denied when `agent_id` comes without `agent_type`;
  - `.claude/hooks/post-edit-check.sh`: TypeScript, JSON, YAML, and Markdown through `~/.local/share/h4reet/lint-node` with its own configs;
  - `.claude/hooks/subagent-report-check.sh` (FR-010): the payload's `last_assistant_message` checked first, every result logged with the `agent_type`, and instruction-shaped text flagged rather than any mention of `settings.json`;
  - the CLAUDE.md lines of §15, each folded into an existing line except one, keeping it under 60 lines;
  - in `redteam/forbidden-actions.sh`, every planned row switched to block or allow, and in `make check`, every PLANNED mark cleared.
- [ ] T118 **Author**: apply `docs/merge-requests/<date>-feat-000-enforcement-enforcement.patch`, then run `make tools` (the lint toolchain's own Node, which the patch's `lint: node` row checks), `claude doctor`, `make git-hooks`, and `tools/gates/gate` on the branch, not `make check` in your own terminal (§11). The result must be 0 failures, 0 planned rows, no PLANNED line, and no SKIP that names a task (SC-003). The trigger fires, so run `make evals-agent-config` and commit its history entry (SC-008).
- [ ] T119 **Author** (Heavy, with no agents working): run quickstart.md §7's done-when table end to end, and fill the success-criteria table (SC-001, 002, 003, 005, 006, 007, 008, 009) in `docs/merge-requests/<date>-feat-000-enforcement.md`.
- [X] T120 Write the merge-request note `docs/merge-requests/<date>-feat-000-enforcement.md`. `make publish-check` runs later, before the first push (START-HERE §6), not at this merge.

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup. It blocks every story. T046 (the Author's patches and engine setup) blocks every agent-run container task and T065, which creates the first real secrets: the early patch's credential denies must already be in place (Principle IV). T063 (the seed) blocks T064, T084, and T097.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1. It extends the gateway US1 builds, and the breach test runs the US1 stack.
- **US3 (Phase 5)**: after Foundational. T087–T096 can run in parallel with US1 and US2. T097 needs US2 merged, and T099 runs after T097. The governance patch is applied right after US3 merges.
- **US5 (Phase 6)**: after US2, which supplies the meter and the fallback branch. T105 (the Author's IAM and price steps) blocks T107. T092 (the gate's `--contract-replay` mode) blocks T103's replay and T107's `make contract-live`. US5's enforcement patch lands before T105's `fallback: bedrock`, the first paid route.
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
- [X] T149 After T065, apply the first stack run's findings: the collector's one cost attribute; gzip for `otlphttp/langfuse`, if Langfuse accepts it; the `llamacpp:` metric names in telemetry.md and `h4-runtime.json`, if they differ; the `LANGFUSE_LLM_CONNECTION_WHITELISTED_*` keys, set empty in compose.yaml; research.md's R-03, R-06, and R-09; and disclosure row B1's browser hosts, per T065 and plan §6 (missing). T065's §1.5 (2026-10-09) adds two:
  - **The collector's own metric names.** Prometheus 3 scrapes them as UTF-8 names without `_total` (`otelcol_exporter_sent_spans`, `otelcol_receiver_refused_spans`, `otelcol_processor_filter_spans.filtered`). `h4-runtime.json` and telemetry.md §7 name them with `_total`, so the Spans-to-Langfuse, export-failure, queue-drop, and receiver-refusal panels can't show. Either pin the scrape's naming or follow the names; the failure and drop counters exist only after their first count.
  - **A counter's first increment.** A new series starts at 1, so `rate()` and `increase()` never see it, and one hello after a start doesn't show in the request and latency panels (quickstart §1.5 expects it to).
  - **The gateway's image, per stack.** Compose builds it once per stack (`h4reet-prod-gateway`, `h4reet-dev-gateway`), so §1.9's "the same gateway image ID: nothing was rebuilt for an environment" can't hold: prod's was `277d65399ae9…` and dev's `c06649f69d8b…`, though at different commits. On the agents' engine, build one commit twice and compare the IDs and the layers; then either build once per commit under one tag both stacks use, or make the build reproducible (`SOURCE_DATE_EPOCH`), and recheck §1.9 (US1-5, FR-017).

  Done on 2026-10-09, on `fix/000-us1-t149-findings`, each part checked on dev-cpu or the agents' engine, then end to end on dev-cpu at the branch's tip (the us1 note's "T149's run"):
  - **The cost attribute:** Langfuse 4.54.0 reads `gen_ai.usage.cost` and `langfuse.observation.cost_details` alike; the collector keeps the plain number. **gzip:** Langfuse takes it, and `otlphttp/langfuse` compresses.
  - **The `llamacpp:` names:** all as written; nothing changed.
  - **The allowlists:** `_HOST`, `_IPS`, and `_IP_SEGMENTS`, set to `""`, which Langfuse reads as unset: an empty list of exceptions to its block on internal addresses.
  - **research.md and row B1:** R-03, R-06, R-08, and R-09 hold T065's and T149's results, and B1 lists no host.
  - **The collector's names:** the dashboard and telemetry.md follow them. Pinning the scrape's format can't bring `_total` back: the collector serves its counters without it in the classic text format too.
  - **The first increment:** Prometheus's `created-timestamp-zero-ingestion` writes a 0 at each series' start.
  - **The gateway's image:** four builds of one tree gave four IDs over one list of layers. Compose labels each image with its project, and each build has its own provenance attestation; Compose 2.39 ignored `provenance: false`. Quickstart §1.9 now compares the layers, and T184 asks the Author whether US1-5 wants one shared build.
- [X] T150 Give the listeners' 400 for a body that doesn't parse `field: "body"`, as gateway-http.md §2.5.4's body has, and test it exactly, per contracts/gateway-http.md §1 (partial)
- [X] T151 Test the local adapter's mappings of 404, 413, 422, 502, and 504, a DNS failure, and the 1 s connect watchdog, per T051 and contracts/provider-adapter.md §2.5 and §3.1 (partial)

## Phase 12: Convergence

- [X] T152 Queue a `fallback_unavailable` outbox row, at most one an hour per adapter, when a paid fallback adapter's health turns unhealthy (`core/gateway.ts`'s `healthChanged`; the text and dedupe key already exist in `alerts/format.ts` and `alerts/outbox.ts`), tested with a fake paid adapter, per alerts.md §2 and data-model.md §7.7 (missing)
- [X] T153 Add planned rows to `redteam/forbidden-actions.sh` for the breach test's dev route in the spellings the nine rows miss: `make ENV=dev breach-test`, `(make breach-test ENV=dev)`, `make breach-test ENV="dev"`, and `env -u SANDBOX_RUNTIME python3 -m evals.breach --stack dev`, so T117's rule is tested against every spelling, per plan §13 ("by any spelling") and FR-008 (partial)
- [X] T154 Report dev's synthetic adapter as `disabled` in `/health` and `h4.adapter.healthy` while `GATEWAY_TEST_SYNTHETIC_SPEND` is off, instead of leaving it out (`adapters/registry.ts`), or drop `disabled` from provider-adapter.md §2.4 and §3.3 and `HealthReason`, per provider-adapter.md §2.4 and §3.3 (partial)
- [X] T155 Count a synthetic run that a limit stops under its own route decision, `metered` for metered spend, in `h4.gateway.requests` (`routes/test.ts`), and test it, per telemetry.md §4.1 (contradicts)
- [X] T156 Record the email delivery's reference only from the SMTP server's own reply, never an assumed `250` (`alerts/smtp.ts`), and test an unreadable reply, per alerts.md §4.1 and SC-002's evidence (contradicts)
- [X] T157 Make the contract suite's C10 timing check robust to a loaded host. Its stub case failed once at 1,093 ms against a 100 ms limit, while the call still ended as `timeout`, so `make check` can fail at random. Use the approach round 3 took for C3: keep what the check proves, widen only the margin, per T051 and provider-adapter.md §5.3 (partial)

## Phase 13: Convergence

From T084's pre-run (2026-10-10): `make breach-test ENV=dev-cpu` on the agents' engine, from the main tree detached at `sim/000-us2-on-us1-stack` (222a58c), a squashed simulation of this branch merged with the us1 stack's tip. 52 assertions: 45 passed, 7 missed (T 0/2, M 25/25, L 20/25), in 1,405 s. This branch's merge-request note has the run.

- [X] T187 [US2] Read traces in `evals/breach_probe.py` through Langfuse v4's `/api/public/v2/observations?traceId=<id>&fields=…`. Langfuse v4 runs in events_only mode, where `/api/public/traces/{id}` and `/api/public/observations` answer 404 (research.md, from T149). So the pre-run missed both trace assertions:
  - 2a: "the metered call's trace carries h4.cost.usd = 0.10 (observed None, in 57.253 s)";
  - 9c: hello's trace as a local call at 0 USD.

  On the pre-run's stack, `fields=core,basic,usage,cost` answered 200 with the trace's observations. Its GENERATION carried `totalCost` 0.1 and `costDetails` `{"total":0.1}`, which `COST_FIELDS` reads; without `fields=`, no cost comes back. 9c also reads `gen_ai.provider.name` from the observation's metadata, which those fields didn't return: find, on a dev-cpu run, the field group that does. Model the probe's fake on one real v2 response, per FR-036, plan §8, and research.md (contradicts)

  Done on 2026-10-10.
  - **The query:** the probe reads `/api/public/v2/observations` with `traceId`, `fields=core,basic,usage,cost,metadata`, `expandMetadata=attributes`, and `limit=1000`, and follows the list's cursor for at most 10 pages. Langfuse's docs give the groups: cost is in `usage`, and the span's metadata in its own `metadata` group. `cost` stays because the only v2 query a stack has answered named it (research.md R-08); the review's N4.
  - **Two choices the docs led to:** the metadata group cuts any value over 200 characters unless `expandMetadata` names the key, and with OTel ingestion the span's attributes are one key. So the probe asks for `attributes` whole, and reads metadata, or its attributes, given as JSON text.
  - **What a check sees:** until the trace is ingested the list is empty, so the check polls as before. Any status but 200 is a source error, and a miss that names the status.
  - **Tests:** `evals/test_breach_helpers.py`'s fake answers in the v2 list's shape, with the keys of the real answer above. There are four new tests: the cursor, metadata as JSON text, a 500, and a trace too long to page through. With the old probe, seven of the trace tests fail.
  - **Not verified yet:** these come from Langfuse's docs, and no stack has answered them: the metadata group and its shape, `expandMetadata`, `limit=1000`, and `meta.cursor`. The fake's keys are those of the real answer above, whose values weren't saved. T084's run on the engine checks them.
  - **For the Author's acceptance:** this task edited `evals/test_breach_helpers.py`, a test file, during a fix. The note's round 5 lists every test-file edit these fixes made.
- [X] T188 [US2] Keep alert delivery from waiting on another service's DNS lookups (`services/gateway/src/alerts/telegram.ts`, and the local adapter's probes).
  - **What failed:** every Telegram attempt timed out from 07:39:04 to 07:57:00 UTC, exactly while steps 4 to 7 kept `model-server-cpu` stopped: 32 `alert.retry` and 8 `alert.failed`, all with error class `timeout`. The fallback alerts reached email only, so 4b, 4c, 5c, 5d, and 6c missed. The stand-in logged no failed request.
  - **Reproduced** in the gateway container, with the model server stopped. `dns.lookup("model-server")` failed with `EAI_AGAIN` after 8,007 ms. `dns.lookup("telegram-standin")` took 2 ms alone, and 17,409 ms behind five of them.
  - **The cause:** Node runs `getaddrinfo` on libuv's threadpool, which gives lookups at most half its threads, two of the default four (corrected by round 4's confirming review: this line said four). The local adapter's lookups fill both, so Telegram's `AbortSignal.timeout` fires before its own lookup runs. The reproduction fits two slots: 17,409 ms behind five 8,007 ms lookups is two batches ahead. Email's longer timeouts ride it out; one email took 41 s.
  - **The options:**
    - resolve alert channels' hosts without the threadpool: an undici `Agent` whose `connect.lookup` uses `dns.promises`, which is c-ares;
    - keep the local adapter's probes single-flight while it's unhealthy;
    - raise `UV_THREADPOOL_SIZE`.

  Test that a held lookup doesn't delay a delivery. Whether the host's engine hangs the same way is unverified. Per FR-032 ("Telegram (primary) and email (secondary) within 5 minutes") and contracts/alerts.md §4 (contradicts)

  Done on 2026-10-10. The same run's gateway log showed the starvation reached the store too: 73 of its 77 `state.unknown` (`store_unreachable`) records fell while the model server was stopped, so the kill switch failed closed every 10 to 20 s. The other four were steps 1 and 11, which stop the store on purpose. The fix removes the cause and frees the alerts:
  - **`services/gateway/src/core/resolve.ts`,** new: a lookup with `dns.lookup`'s contract, answered through c-ares, which holds no thread (1 s a try, two tries). It answers IP literals and `localhost` itself. Like `getaddrinfo`, it honors `ADDRCONFIG`, which net passes for a connect that names no family, so a container without IPv6 is never handed an AAAA address (the review's S1). After a failed A query it asks for AAAA only after `ENODATA`, and reports the error that says more.
  - **The local adapter** resolves its host through it, so the probe's lookups of a stopped server hold no thread.
  - **The Telegram channel** sends over `node:http(s)` with the same lookup, not `fetch`. One deadline covers the whole send, no redirect is followed, and at most 64 KiB of an answer is kept. A peer that doesn't speak TLS on an `https` base is `tls` (`EPROTO`).
  - **Tests:** `test/unit/resolve.test.ts` (the lookup) and `test/unit/telegram.test.ts` (the transport) are new. Among them is this task's own criterion: with all four of libuv's threads held by four opens of a FIFO with no writer, more than hung lookups can hold, `dns.lookup` waits and a Telegram delivery still arrives. Without `ADDRCONFIG`, three tests fail.
  - **The T151 tests changed in one respect:** `test/contract/local-openai.errors.test.ts` faked `dns.lookup`, which the adapter no longer calls. They now fake c-ares's A and AAAA answers, with its codes (`ENOTFOUND`, `ETIMEOUT`, `ENODATA`), in an IPv4-only container. Their assertions about the adapter's behavior are unchanged, and each names every query the adapter made. All four fail without the adapter's new lookup. The constitution counts a test edit during a fix as the Author's to accept. The note's round 5 lists every one these fixes made: this file, `test/unit/telegram.test.ts`, `test/unit/resolve.test.ts`, and the probe's `evals/test_breach_helpers.py`.
  - **Contracts:** provider-adapter.md §3.1 records the departure, alerts.md §4.1 the Telegram transport, and telemetry.md §3.1 the HTTP instrumentation's skip of the Telegram hosts.

  The other two options weren't needed for this cause: with the probe's lookups off the threadpool, their overlap and its size don't matter. Other `getaddrinfo` users can still fill it, so this task frees the model server's lookups and the alert channel, not the threadpool: T189 takes the rest (the review's S2). T084's run on the engine checks the fix end to end.
- [X] T189 [US2] Keep the gateway's other `getaddrinfo` users from starving the store, as T188 did for the local adapter's (T188's review, S2). These still resolve through `getaddrinfo`, on the two threads libuv gives lookups:
  - **pg:** `gateway-state`, on every new connection, with `connectionTimeoutMillis: 500` (`services/gateway/src/meter/store.ts`). It is the first victim, and itself a source while the store is stopped (steps 1 and 11);
  - **the three OTLP exporters** (`src/telemetry/otel.ts`): a keep-alive agent with the default lookup, retrying on `ENOTFOUND`, `EAI_AGAIN`, and `ETIMEDOUT`;
  - **`src/core/edge.ts`:** `dns/promises.lookup("edge")` with no timeout, which hello's onRequest awaits before the kill-switch read whenever the 30 s cache is due;
  - **nodemailer 10.0.16:** its fallback to `dns.lookup` when c-ares finds no address;
  - **later,** T102's Bedrock calls and their SSO refresh.

  The reviewer's estimate, not measured: with the collector stopped on the agents' engine, each export holds a thread for the 8 s lookup, the exporters keep about three of the four busy, and a burst of pg reconnects queues past 500 ms. The kill switch then fails closed because of a telemetry outage, against telemetry.md's "Telemetry failures never touch enforcement: the meter and the kill switch live in the store, and nothing in the request path waits on an export." Round 4's confirming review corrected the mechanism: libuv runs at most half its threads on lookups, two of the default four, so two hung exports already queue every other lookup, pg's included. The risk is larger than the estimate says, and a `UV_THREADPOOL_SIZE` of N buys (N + 1) / 2 lookup slots, not N. The options:
  - `UV_THREADPOOL_SIZE` in the gateway's environment (T188's third option);
  - `httpAgentOptions: { keepAlive: true, lookup: aresLookup }` for the exporters;
  - c-ares, or a timeout, in `edge.ts`.

  Prove it on the engine with the collector stopped. Whether the host's engine hangs on stopped names the same way is unverified. Per contracts/telemetry.md §3 ("Telemetry failures never touch enforcement") and FR-031 ("A store that is unreachable counts as unknown, which is `degraded` (fail closed)") (partial)

  Done on 2026-10-10, in two parts and an engine test. The first part, the exporters and edge:
  - **The three OTLP exporters** use `EXPORT_AGENT`: keep-alive, as their default is, with the collector's name resolved through c-ares. It also reads no `/etc/hosts`, makes a c-ares `ETIMEOUT` or `ESERVFAIL` non-retryable for the exporter, and would ignore the environment's certificate settings on https (the collector is plain http). `test/unit/otel-export.test.ts` sends a span, a metric export, and a log record through `buildSdkConfiguration`'s own processors to a collector only c-ares can name. Its wiring test fails when any one exporter loses the agent (the review's S1).
  - **`edge.ts`'s default resolver** is c-ares. A lookup that doesn't answer now gives up after c-ares's own tries, about 3 s at most, instead of waiting in libuv's queue. `test/unit/edge.test.ts` shows the path and its exact queries, and that a name c-ares can't resolve believes no one; gateway-http.md §7 has the row.

  The second part, pg and nodemailer:
  - **pg:** `buildPoolConfig` gives pg a `stream`, `aresSocket` (`core/resolve.ts`), a socket whose connect passes `lookup: aresLookup`. pg calls connect(port, host) on it, so the pool's connections, the LISTEN connection, and the migrations' connection resolve `gateway-state` through c-ares. pg-pool drops an idle client after 10 s and `store.ts` sets no `idleTimeoutMillis`, so in a quiet stack most requests open a connection; while the store is stopped (steps 1 and 11), those lookups no longer hold a thread. `test/integration/ares-lookups.test.ts` connects `pgDatabase` to a store only c-ares can name, and shows that a name c-ares can't resolve fails with c-ares's error and no call to `dns.lookup`. data-model.md §2.1 records it.
  - **nodemailer 10.0.16:** it falls back to `dns.lookup` whenever c-ares finds no address for the SMTP host, a SERVFAIL or a timeout included. The email channel's default transport now connects to the host itself, through c-ares alone, and hands nodemailer the socket through its `getSocket` hook, so nodemailer resolves nothing. Every address the host has is tried within the attempt, and the addresses c-ares last found are used when a lookup fails, as nodemailer did. alerts.md §4.1 lists what's kept, what's changed, and what's lost. The same test file delivers to a host only c-ares can name over a connection made by that name, shows that a SERVFAIL is `connect` with no call to `dns.lookup`, that a refusing address gives way to the next, that the last addresses found carry a failed lookup, and that the name reaches TLS as its SNI on 465 and after STARTTLS. Round 8 added three more: the connection timeout is `timeout` and leaves no socket connecting, a failure across several addresses is `connect` though the first attempt timed out, and a fresh answer wins over the addresses kept.

  Beside the code:
  - **Still on `getaddrinfo` until T102 lands:** Bedrock's calls and their SSO refresh. T102 now carries them.
  - **`UV_THREADPOOL_SIZE` stays at libuv's default,** the Author's call on 2026-10-10: "Okay, i agree with you for the default adn we can look at it later". N threads would give (N + 1) / 2 lookup slots.
  - **The test files:** the first part added `test/unit/otel-export.test.ts` and edited `test/unit/edge.test.ts`; the second added `test/integration/ares-lookups.test.ts`. They are test files, added or edited during a fix; all three only add tests, and no assertion was weakened. The Author accepted them on 2026-10-10, at c904034: "Yes, accepted." Rounds 7 and 8 of the note's reviews then changed `ares-lookups.test.ts` again, which the note puts to the Author.

  The engine test passed on the simulated merge at 56c76be. With `otel-collector` stopped, every `/health` read over two minutes answered "store ok" in 3 to 62 ms. The store's session counter rose from 40 to 69 meanwhile, and the gateway logged no `store_unreachable`. On that engine, `getaddrinfo` for the stopped collector failed after 8,006 ms, and c-ares after 3,003 ms. Whether the host's engine hangs on stopped names the same way is still unverified. Bedrock's calls and their SSO refresh go to T102, which provider-adapter.md §3.2's name-lookup row now binds.
- [X] T190 [US2] Class a TLS certificate failure on the email channel as `tls`, not `smtp_ESOCKET` (round 8's review, outside its diff). Two causes: nodemailer 10.0.16 sends a TLS socket's error through `_onSocketError`, whose `_formatError` overwrites the error's code with `ESOCKET` on the error object itself; and `smtpErrorClass` tests for `ERR_TLS_`, `CERT_`, and the rest only in `cause.code`, which nodemailer never sets. So no change to `smtpErrorClass` alone can fix it: the TLS failure has to be caught before nodemailer formats it. Only a refused STARTTLS, or a connection closed during the upgrade, gives `ETLS`, and so `tls`. docs/runbooks/alert-channel-down.md's `tls` guidance then never fires for the most common TLS failure. Prove it with a certificate that fails to verify, on 465 and after STARTTLS, and keep the class to `tls` with no certificate detail. Per contracts/alerts.md §4.1's error classes.
  Done on 2026-10-10 (fix/000-us2-tls-class: dd8ca3c, the tests; b8745d2, the fix).
  - **The fix:** nodemailer gives no way to listen on the TLS socket it puts over the connection, so the class comes from what the gateway can see. The TCP socket it connects marks the errors it raises itself, ahead of nodemailer's listeners, and `getSocket` hands nodemailer TLS options of the connection's own: the transport's, with Node's `checkServerIdentity` wrapped to note that the certificate passed. An `ESOCKET` the TCP socket didn't raise came from the TLS socket. Before the certificate passed, it is a failed handshake, rethrown as a fresh `ETLS` error with nothing of the certificate in it, so `tls`.
  - **Unchanged:** a reset before STARTTLS, or after the certificate passed, stays `smtp_ESOCKET`.
  - **A correction to this task's text:** a refused STARTTLS is `smtp_454`, not `tls`. nodemailer attaches the reply, and the reply code comes first. That is unchanged.
  - **The tests:** `test/integration/smtp-tls.test.ts` (12 tests) runs SMTP servers on loopback with certificates made at run time (`test/helpers/test-certs.ts`, from `node:crypto`; nothing committed). They cover `tls` on 465 and after STARTTLS, the class alone in the outbox and the log, and the unchanged classes, with a delivery as the control. They came first: 6 of 12 fail at dd8ca3c. Each of seven targeted mutations of the fix, and its full revert, fails at least one of them.
  - **After the review:** a connection the server drops on 465 before sending a byte keeps `smtp_ESOCKET`, as before T190, since no handshake was started (the TCP socket's `bytesRead` is 0); two tests (a FIN and a reset, 30 ms after the accept) failed with `tls` first. The 14 tests pass on Node 22.18 and on 24.21, the image's.
  - **The runbook:** `alert-channel-down.md`'s `tls` entry says what it covers now, and contracts/alerts.md §4.1 has a paragraph for it.

## Phase 14: Convergence

From US5's convergence pass (2026-10-10): a read-only agent over Phase 6's scope at b75a0bc. It checked 17 requirements and criteria (US5's seven scenarios, FR-013, FR-021 to FR-024, FR-030, FR-031, FR-040, SC-005, SC-006), 13 plan decisions, 12 contract sections, and principles I, IV, V, and Governance. It made five findings, none CRITICAL or HIGH. The first, the unfinished merge-request note, is T108's own remaining work, so it has no task here.

- [X] T191 [US5] Write a zero `h4.cost.usd` increment at the gateway's start for each routed metered adapter, under each attribution it can be charged: `fallback` for the fallback, and `test` for a paid adapter (`metered` for the synthetic one). A paid call's series is first written at its commit with a non-zero value, and Prometheus 3.15 ingests no zero at a series' start, so `increase()` would read the first Bedrock call as 0 and miss quickstart.md §4.2's and §6.1's checks. Test that the series exist, at zero, before any call. Per SC-005 and telemetry.md §7.2 (partial)
  Done on 2026-10-10: `Gateway.start()` writes the zeros once (`seedCostSeries`), and telemetry.md §4.1's `h4.cost.usd` row says so. `test/unit/cost-series.test.ts` reads the series from an in-memory exporter before any call: prod's Bedrock under `fallback` and `test`, dev's synthetic under `fallback` and `metered`, and none for a local-only route. Whether Prometheus then counts the first call is T107's to see on prod.
- [X] T192 [US5] Test the real Bedrock adapter on hello's fallback path: a prod `POST /hello` with local down, answered through `bedrock-converse` under `aws-sdk-client-mock`, charged to `fallback_day`, with its client span. Add a `TokenProviderError` → `auth` case, per US5's scenario 2, T101, and provider-adapter.md §2.5 (partial)
  Done on 2026-10-10. `test/integration/hello-bedrock.test.ts` runs prod's stack with `bedrock-converse` built for real. Its health check resolves the credential chain from short-lived credentials put in the environment at run time, and Converse answers from `aws-sdk-client-mock`. Hello falls back and is charged 65 micro-USD to the day, the month, and `fallback_day`, with the Converse request, the client span, and the ledger row checked. Three provider errors then open the circuit, and the fourth hello is refused without a request. `test/helpers/bedrock-config.ts` now holds the Bedrock route both this test and `adapter-calls.test.ts` use. `bedrock-converse.errors.test.ts` covers `TokenProviderError`.
- [X] T193 [US5] Make an open circuit last `open_s` and then read as its probes do, half-open, as provider-adapter.md §6 item 5 ("open it for 30 s") and `docs/runbooks/bedrock-unavailable.md`'s Verify step have it. The first fallback call after that is the trial, one at a time, and a failed trial opens it for another `open_s`. As built, an open circuit held Bedrock unhealthy until some call succeeded, so with local up it read `circuit_open` indefinitely, and quickstart.md §4.2's prerequisite couldn't be met without a paid call. Rewrite §6's readings, and drop the stale "T102 may tighten" remark in `src/adapters/_settings.ts`, per provider-adapter.md §6 item 5 (contradicts)
  Done on 2026-10-10. `AdapterHealth` reads the circuit's phase from the clock: closed, open for `open_s`, then half-open. A timer turns it half-open for the gauge and the log, and every read sees the phase at once. `admitCall()` gives a fallback call its pass, while half-open as the trial, and `wouldAdmit()` is the dry run's view. The code followed the contract and the runbook, which already said so. `test/unit/circuit.test.ts` was rewritten for it (26 tests). The round-2 reviewer asked for gateway-level cases, and they're in: the trial given back when admission refuses it, throws, or loses its caller, and not spent on a test call. Each of 19 mutations of the circuit fails a test, or `hello-bedrock.test.ts`. Later the same day, the real-clock test failed once under `make check`'s load: the half-open timer had fired before `Date.now()` said the time was up, since a timer's clock isn't the wall clock, and nothing rescheduled it. It now waits out the rest, and a test on a clock at half speed pins that.
- [X] T194 [US5] Make preflight's P19 refuse a symbolic link for `H4_AWS_DIR` and an SSO region other than us-east-1, as `aws-login.sh` does. Have Bedrock's health check read credentials with no expiry, which only a long-term key gives, as `credentials`. Record the region refusal in T104's note and env-files.md, per FR-013, plan §5.2 ("credentials resolve and expire"), and FR-040's row F2 (partial)
  Done on 2026-10-10. P19 refuses a link at `H4_AWS_DIR` or its parent, and reads the profile's SSO region as the CLI does, its sso-session's when it names one (env-files.md's P19 row). Bedrock's health check fails credentials with no expiry as `credentials` (provider-adapter.md §3.2's health row). `deploy/scripts/test_preflight.py` gains a test, and its P19 test's last config names its region now, since a session without one fails. A new case in `bedrock-converse.errors.test.ts` covers the probe. T104's note records the region refusal. After round 3's review, a config that doesn't parse is reported as such, not as a missing region.

## Phase 15: Convergence

From `/speckit-converge` on `feat/000-us3-governance` at 68b74cc (Phase 5's scope), on 2026-10-11.

- [X] T195 [US3] Add a stage S row for `.github/workflows`, which the settings name only in an Edit deny, and put `./.github/workflows` in the closing patch's `denyWrite` (the closing patch also adds it to T117's and plan §15's lists, which the us1 stack edits too, so this branch leaves those lines alone and its merge keeps one conflict); a `config/kill-switch*` file gets its `denyWrite` entry, by its exact path, in the patch that creates it, because Linux ignores glob denies (ADR 0006), and spec 000 creates none, per US3/AC6, FR-008 (missing)
- [X] T196 [US3] Write the prove patch, `docs/merge-requests/2026-10-10-feat-000-us3-governance-prove.patch`, with which `engine.sh prove` writes its rows under the `H4-PROVE-REPORT` header to `~/.local/state/h4reet/agents-engine/prove-report.txt`, with tests, per T090, FR-039 (missing)
- [X] T197 [US3] Name in the spec's Assumptions that US5's patch and the governance patch, like the early patch, change `.claude/**` before the behavioral tier's first run can start, and that T099's run covers them, per Constitution (Security & Agent Governance), FR-011, SC-008 (missing)
- [X] T198 In the closing patch (T117, `docs/merge-requests/2026-10-11-feat-000-enforcement-enforcement.patch`), where the early patch's denies are present, add stage H rows per FR-007 secret: each variable denied by name, each file covered by `denyRead` and `denyWrite`, and an Edit to each file blocked, with their IDs in `matrix-required.txt`. Until then the aggregate rows and stage S's folder rows cover them. Per FR-007, env-files.md §8 (partial)
- [X] T199 [US3] Rework the planted-bytecode rows to plant a `.pyc` where the Author's code loads modules: through `spec_from_file_location`, as `evals/run.py` loads `scripts/operator.py`, and from a folder on `sys.path`. Add a control under `python3 -I -B` without the prefix, which must run the planted file. Per plan §13, research.md R-35 (partial)
- [ ] T200 In the closing patch (T117), move `require_rows` to the matrix's end, after every row, and list every row ID in `matrix-required.txt`, or record the Author's acceptance of the curated list, per T088, SC-003 (partial)
  Done in part by the closing patch: `require_rows` runs last, after every row. Listing every row ID waits on the Author's decision, the curated list or the full roster (the enforcement note's decision 3).
- [X] T201 [US3] Print a `PLANNED (Tnnn):` summary line for the planned role, relay, and stage S rows, the form `run_checks.py` and the gate count, per plan §11 (partial)
- [X] T202 [US3] Bring quickstart.md §3.2's Expected in line with stage S as built: the folders that hold the FR-007 files, the refused connections beside a loopback control, and the engine's allowed path left to stage E and `make engine-smoke`, per plan §13 (contradicts)
- [X] T203 [US3] Say "written by hand, with a roster check" for the role rows in T087's note and the matrix's header, per plan §13 (contradicts)
- [X] T204 [US3] Record in plan §14 what the trigger hash leaves out (`evals/agent-config/history/`, `.claude/audit/`, `.claude/worktrees/`, caches, and `.pyc` files), and that it hashes each file's kind, its executable bit and links included, per plan §14 (contradicts)
