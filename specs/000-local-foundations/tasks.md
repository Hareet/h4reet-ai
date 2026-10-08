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

- **[P]**: can run in parallel (different files, no dependency on an unfinished task).
- **[USn]**: the user story the task serves.
- **Author**: only the Author runs it, in their own terminal, because it needs sudo, the GPU, the host's Docker, Bedrock, real alert delivery, or the operator token. Heavy Author steps (big downloads, model loads, stack bring-ups, anything ending in `wsl --shutdown`) are their own step, taken when no agents are working and the branch is committed, after the disk preflight (research.md R-32).
- **Patch**: changes to `.claude/**`, `CLAUDE.md`, `config/budgets*`, or `config/alert*` can't be made by agents (FR-008). A task marked Patch writes its change into a patch file under `docs/merge-requests/`, and the Author applies it with `git apply` at merge.

## Path conventions

- The gateway is `services/gateway/` (`src/`, `test/unit/`, `test/contract/`, `test/integration/`, `migrations/`).
- Compose and its configuration are in `deploy/`; the gateway's configuration in `config/`; Author-run gates in `tools/gates/`; the agents' engine in `deploy/agents-engine/`; harnesses in `evals/` and `redteam/`.
- "§" refers to plan.md unless another file is named.

---

## Phase 1: Setup (shared toolchain) — branch `feat/000-setup`

**Purpose**: one toolchain for humans and agents, the workspace, and the local gate's skeleton.

- [ ] T001 Rework the head of `Makefile` per §4:
  - `ENV ?= prod`, with a check that refuses anything but `prod`, `dev`, or `dev-cpu`;
  - `ENVFILE`: `deploy/env.agents/dev-cpu.vars` for dev-cpu, `$(HOME)/.config/h4reet-ai/env/$(ENV).env` otherwise;
  - `COMPOSE := docker compose -p h4reet-$(ENV) -f deploy/compose.yaml --env-file $(ENVFILE)`.

  Keep the existing UV_CACHE_DIR and PYTEST logic, pinning pytest to `--with pytest==9.1.1 --with pyyaml==6.0.3`.
- [ ] T002 [P] Create the root `package.json`: private, `workspaces: ["services/*"]`, `engines.node ">=24.21 <25"`, scripts that delegate to the workspaces. Generate `package-lock.json` with `npm install --ignore-scripts` (the registry is allowlisted). Commit no `.npmrc`.
- [ ] T003 [P] Create `tsconfig.base.json` (strict, ES2023, NodeNext), `eslint.config.js` (eslint 10.12.0, typescript-eslint 8.71.1, eslint-config-prettier 10.1.8, globals 17.13.0), `.prettierrc.json`, and `.prettierignore` (§9).
- [ ] T004 [P] Create `.dockerignore`, excluding `.git`, `deploy/env`, `*.env`, `**/node_modules`, `**/dist`, `corpus/intake/private`, `.cache`, and `.pytest_cache`.
- [ ] T005 Update these targets in `Makefile` per §9 and §11:
  - `setup`: `npm ci --ignore-scripts`, then `make git-hooks`. Remove the `pip install -r requirements.txt` and `pre-commit install` lines.
  - `lint`: `eslint --max-warnings 0`, `tsc --noEmit` per workspace, `prettier --check`, `ruff check` and `ruff format --check --no-cache`, and `shellcheck` on every tracked `*.sh`, `.claude/hooks/*.sh`, and `.claude/git-hooks/*`.
  - `fmt`.
  - `test`: `corpus-check`, `npm test --workspaces --if-present`, and pytest with `-q -p no:cacheprovider` over `corpus/tools`, `evals`, `redteam`, `tools/gates`, `deploy/scripts`, `deploy/agents-engine`, and `scripts`.
  - `test-fast`.
- [ ] T006 Restructure `make check` in `Makefile` per §11.
  - It runs `githooks-check toolchain-check policy validate-config lint test secrets evals redteam matrix image` in that order and keeps going after a failure.
  - It prints PASS, FAIL, SKIP (with a reason), or PENDING per target, then a summary line, and exits non-zero on any FAIL or PENDING.
  - Inside the sandbox (`SANDBOX_RUNTIME=1`), it exports `npm_config_cache=$TMPDIR/npm-cache`.
  - A target that doesn't exist yet prints `SKIP (added by Tnnn)`.
  - `githooks-check` keeps the existing reference-transaction check, and reports `.claude/git-hooks/pre-commit` as PENDING until the closing patch adds it (T113, T114).
- [ ] T007 [P] Create `.devcontainer/Dockerfile`, `.devcontainer/devcontainer.json`, `.devcontainer/toolchain.env`, and `.devcontainer/requirements-tools.txt` per §9.
  - **Base:** `public.ecr.aws/docker/library/ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55`.
  - **Tools:**
    - Node 24.21.0 from the nodejs.org tarball, checked against SHASUMS256;
    - uv 0.8.22 and ruff 0.16.10, copied from their pinned images (research.md R-02);
    - gitleaks 8.30.1, from its pinned image;
    - pytest 9.1.1 and pyyaml 6.0.3, with `--require-hashes` (hashes from pypi.org), into `/opt/tools`.
  - **Users:** the `ubuntu` user is replaced by `dev` (uid 1000) with no sudo.
  - **Build arguments:** `WITH_CLAUDE=0` and `WITH_TERRAFORM=0`.
  - **`devcontainer.json`:** no `features`, no `initializeCommand`, no socket or home mounts; `runArgs ["--cap-drop=ALL","--security-opt=no-new-privileges"]`; `postCreateCommand: make setup`.
- [ ] T008 [P] Create `tools/gates/toolchain_check.py` (stdlib, `python3 -I`) and `tools/gates/test/test_toolchain_check.py`. The check compares installed versions against `.devcontainer/toolchain.env`: Node, uv, ruff, shellcheck, jq, Python, gitleaks, pytest, the lint toolchain, and Claude Code. It prints a table and exits 1 on drift. Wire `make toolchain-check` (§9).
- [ ] T009 [P] Create `tools/gates/lint-node/package.json`, its `package-lock.json`, `eslint.config.mjs`, and `prettier.config.json`: the human-only lint toolchain for the post-edit hook, with versions as in T003 plus typescript 6.0.3 (research.md R-25). Add `make tools` (Author), which installs:
  - Node 24.21.0 through `fnm`;
  - `uv tool install pytest==9.1.1 --with pyyaml==6.0.3`;
  - gitleaks into `~/.local/bin`, with `docker cp` from the pinned image;
  - this toolchain into `~/.local/share/h4reet/lint-node`, with `npm ci --ignore-scripts`.
- [ ] T010 [P] Create the eval scaffold in `evals/` per §14:
  - `evals/__init__.py`;
  - `evals/run.py`: stdlib plus pyyaml; suites in `evals/<suite>/cases/*.yaml`; adapters `fake`, `local`, `bedrock`; deterministic scoring; history only for real runs; the repository root appended to `sys.path`, not prepended;
  - `evals/product/cases/hello-fake.yaml`, one case that passes on `fake`;
  - `evals/test_run.py`.

  `make evals` runs `python3 -m evals.run --suite product --adapter fake` unless `ADAPTER` is set.
- [ ] T011 [P] Create the red-team scaffold: `redteam/__init__.py`, `redteam/run.py` (one benign case passes, and one planted unsafe response must be detected), `redteam/cases/*.yaml`, and `redteam/test_run.py`. Keep `make redteam` as `python -m redteam.run`, and add `make matrix` for `bash redteam/forbidden-actions.sh` (§13, §14).
- [ ] T012 [P] Create the static agent-config checks per §14: `evals/agent-config/static.py`, `tools/gates/roles.expected`, and `evals/agent-config/test_static.py`. They check:
  - CLAUDE.md has at most 60 lines and 6 KB (FR-006);
  - CLAUDE.md and REVIEW.md name the constitution as superseding (FR-002);
  - each `.claude/agents/*.md` `tools:` line equals `tools/gates/roles.expected`;
  - the hooks are registered in `.claude/settings.json`;
  - every FR-007 variable is denied (contracts/env-files.md §8).

  `make evals` runs it.
- [ ] T013 Write the merge-request note `docs/merge-requests/<date>-feat-000-setup.md`, with `make check`'s full output and a reviewer agent's REVIEW.md passes.

**Checkpoint**: `make check` runs every target, with SKIPs named, and `make toolchain-check` reports drift until the Author runs `make tools`.

---

## Phase 2: Foundational (blocking) — branch `feat/000-foundations`

**Purpose**: the gateway's skeleton, the store, the compose skeleton, the env files and preflight, and the agents' engine. The engine is foundational: agents can't run containers to test US1 and US2 until it exists and its sandbox opening is applied (FR-039). Its proofs belong to US3.

**⚠️ CRITICAL**: no user-story work starts until this phase is merged.

### Gateway skeleton and store

- [ ] T014 Create the gateway package in `services/gateway/`:
  - `services/gateway/package.json`, with the exact runtime and dev versions in plan.md's Technical Context, including @types/node 24.19.1;
  - `tsconfig.json`, `tsconfig.build.json`, and `vitest.config.ts`;
  - scripts `build`, `test`, `test:unit`, `lint`, `fmt`, `validate-config`, and `contract:replay`.
- [ ] T015 [P] Create `services/gateway/src/core/types.ts` exactly as contracts/provider-adapter.md §2: `ProviderAdapter`, `CompletionRequest`, `AdapterResult`, `HealthStatus`, the `ProviderError` kinds, `DegradedCause`, and `RouteDecision`, with attribution `none|fallback|metered|test` and the `fixedUsage`, `type`, `server`, and `retry` members.
- [ ] T016 [P] Create `services/gateway/src/core/clock.ts` and its test `test/unit/clock.test.ts`.
  - The gateway clock is real UTC time plus `stack_state.test_clock_offset_ms`.
  - Day keys are `YYYY-MM-DD` and month keys `YYYY-MM`, in UTC.
  - Timeouts, retries, rate limits, and health intervals use the real clock (data-model.md, Conventions).
- [ ] T017 Write `services/gateway/test/unit/config.test.ts` first. It covers every validation error and exit-78 refusal in contracts/config-files.md §1.3–§1.4, §2.4–§2.5, §3.3, and §4.3–§4.4, and a pin test for prod's thresholds: 3,500,000, 14,000,000, and a first-grant warning at 1,400,000 micro-USD.
- [ ] T018 Implement `services/gateway/src/config/load.ts` and `validate.ts` (zod) for the four config files, making T017 pass. Then implement `npm run validate-config` (contracts/config-files.md §5) and `make validate-config`.
- [ ] T019 [P] Create `config/routing.yaml` per contracts/config-files.md §1.2, with one difference for now: the prod route is `{primary: local}` with **no fallback**. US5 adds `fallback: bedrock` once the Author has confirmed the model and its price (T102), so prod can start before Bedrock is set up.
- [ ] T020 [P] Create `config/prices.yaml` per contracts/config-files.md §2.2: version `2026-10-08.1`, local at 0, dev's synthetic at an output price of 100 per million tokens, and no Bedrock entry yet (the Author adds it in T102).
- [ ] T021 **Patch**: write `config/budgets.yaml` and `config/alerts.yaml` exactly as contracts/config-files.md §3.2 and §4.2, as the patch file `docs/merge-requests/<date>-feat-000-foundations-config.patch`. Both paths are protected (FR-008), so the Author applies it. The unit tests use fixtures in `services/gateway/test/fixtures/`.
- [ ] T022 Write `services/gateway/test/unit/validate-env.test.ts` first, then implement `services/gateway/src/config/validate-env.ts` per contracts/env-files.md §4 and §11 and §5.8. Exit 78 with a named reason when:
  - `H4_STACK` and `H4_ENV` disagree;
  - a dev-only switch is set outside `H4_ENV=dev`;
  - prod's `ALERT_DELIVERY` isn't `real`, its `TELEGRAM_API_BASE` isn't `https://api.telegram.org`, or `SMTP_TLS` isn't on;
  - `OPERATOR_TOKEN_SHA256` doesn't match `^[0-9a-f]{64}$`, or equals the dev-cpu dummy's hash on prod (a constant in the source, checked against `deploy/env.agents/dev-cpu.vars` by a test);
  - prod's `GATEWAY_AWS_PROFILE` is unset.
- [ ] T023 Write `services/gateway/migrations/0001_state.sql` and `0002_grafana_ro.sql` with every table, column, CHECK, key, index, trigger, and the view exactly as data-model.md §2.1–§2.9. Among others:
  - `stack_state.id` `CHECK (id = 1)`;
  - `CHECK ((state = 'degraded') = (cardinality(crossed) > 0))`;
  - `meters` primary key (`meter`, `period_key`), with `allowance_micro` and `grant_no` set only on `fallback_day`;
  - `ledger.reservation_id` `UNIQUE`;
  - `cost_basis IN ('usage','reservation','expired','none')` and `outcome IN ('ok','error','unknown')`;
  - the append-only trigger on `audit_log`;
  - `alert_outbox.dedupe_key` `UNIQUE`;
  - `incidents` `UNIQUE (ceiling, period_key)`;
  - `v_state`, and `grafana_ro` with SELECT on `audit_log` and `v_state` only.
- [ ] T024 Write `services/gateway/test/integration/migrations.test.ts` on PGlite first. It covers applying both migrations, the `schema_migrations` SHA-256 check (exit 1 on a changed file), the audit trigger refusing UPDATE and DELETE, and `grafana_ro` refused on every other table. Then implement `services/gateway/src/meter/store.ts`:
  - the `pg` pool with `statement_timeout=250ms`, `lock_timeout=250ms`, `idle_in_transaction_session_timeout=2s`, and `connectionTimeoutMillis=500`, at most 10 connections plus one LISTEN connection;
  - migrations under a fixed advisory lock;
  - a store that is down at startup retried every 5 s, with every request answered `store_unreachable` meanwhile (data-model.md §2.1);
  - the `grafana_ro` password set from `GATEWAY_GRAFANA_RO_PASSWORD` as a SCRAM verifier (§2.9).
- [ ] T025 [P] Create the gateway's telemetry, `services/gateway/src/telemetry/otel.ts`, `metrics.ts`, `log.ts`, and `redact.ts`, per contracts/telemetry.md §2, §3.1, §4.1, and §5:
  - the OTLP/HTTP exporters, with metrics every 10 s, cumulative temporality, and explicit buckets up to 120 s;
  - every canonical instrument, with units `{USD}` and `{flag}` as §4.1 gives them;
  - pino `redact` paths for `authorization`, `*token*`, `*password*`, and `messages`;
  - no client identifier in any metric attribute.

  Test it in `test/unit/telemetry.test.ts` with in-memory exporters.
- [ ] T026 Create `services/gateway/src/app.ts` and `src/server.ts`:
  - two listeners, the api on 8080 and admin on 8081, and graceful shutdown;
  - startup order: validate env and config (exit 78 on failure), connect the store (retrying), then start the listeners and background tasks;
  - `GET /health/live` in `src/routes/health.ts` (contracts/gateway-http.md §4).
- [ ] T027 Create `services/gateway/Dockerfile`, built from the repository root as its context:
  - build stage on `public.ecr.aws/docker/library/node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66`: `npm ci --ignore-scripts`, with the `H4_BUILD_PROXY` build arguments passed through as `HTTP(S)_PROXY`, then `npm run build -w services/gateway`, then the dev dependencies pruned;
  - runtime stage on the same base, as `USER node`, running `node dist/server.js`.

### Compose skeleton, env files, preflight

- [ ] T028 Create `deploy/compose.yaml` with the networks `internal` (`internal: true`), `edge`, and `egress`, and the services `edge`, `gateway`, and `gateway-state`, with the images, binds, health checks, limits, and every-service rules of §1 and §2.
  - Only `edge` publishes ports, on literal `127.0.0.1`, mapping `${H4_API_PORT}` through `${H4_OTLP_PORT}` to 8080–8084.
  - Only `gateway` joins `egress`.
  - Bind sources come from `${H4_TREE}`, `${H4_STATE_DIR}`, and `${H4_AWS_DIR}`.
  - There is no `container_name`, no `env_file:`, and no `external:`.
- [ ] T029 [P] Create `deploy/edge/nginx.conf` per §2's edge paragraph and contracts/gateway-http.md §6:
  - five server blocks: 8080 to `gateway:8080`, 8081 to `langfuse-web:3000`, 8082 to `grafana:3000`, 8083 to `gateway:8081`, and 8084 forwarding only `POST /v1/metrics` to `otel-collector:4319`;
  - `resolver 127.0.0.11 valid=10s`;
  - `X-Forwarded-For $remote_addr`, replacing any the client sent;
  - `error_page 502 504 = @api_unavailable`, with the JSON body and `X-H4-Degraded-Cause: api_unavailable`;
  - body limits of 16 KB on 8080 and 4 KB on 8083;
  - access logs without payloads;
  - `/ping` on 8090.
- [ ] T030 [P] Create the env files with every key in contracts/env-files.md §2–§6, using the values, placeholders (`__GENERATE__`, `__ASK__`, `__REPO__`, `__HOME__`), and dummies the contract gives:
  - `deploy/env.example/prod.env.example`;
  - `deploy/env.example/dev.env.example`;
  - `deploy/env.agents/dev-cpu.vars`, with dummies only (§6.1);
  - `deploy/aws-none/README.md`.
- [ ] T031 [P] Create `deploy/scripts/init_env.py` (stdlib, `python3 -I`) and `deploy/scripts/test_init_env.py` per contracts/env-files.md §9. It writes `~/.config/h4reet-ai/env/<stack>.env` at 0600 in a 0700 directory, generates each `__GENERATE__` value in the shape §9.2 gives, refuses to overwrite, prints the names of the `__ASK__` keys left, and supports `SYNC=1`. Wire `make init-env` (Author).
- [ ] T032 Create `deploy/scripts/preflight.py` (stdlib, `python3 -I`; env files parsed as data, never sourced) and `deploy/scripts/test_preflight.py`, with fixture env files and a stubbed `df` and `docker`. It implements checks P1–P20 of contracts/env-files.md §10, including:
  - the free space on the Windows drive holding the vhdx (`df` on `H4_VHDX_MOUNT`, default `/mnt/c`) and on ext4, for the bytes the run will write plus 20 GB;
  - a dev-cpu run from a linked worktree (P20).
- [ ] T033 [P] Create `deploy/scripts/redact.sh` (ops.md's filter, verbatim), `deploy/scripts/status.py`, and its test. Wire `make logs` (through `redact.sh`) and `make status` (§4).
- [ ] T034 [P] Create `deploy/scripts/pin_images.py` and its test, which uses recorded `docker buildx imagetools inspect` output. It resolves tags to index digests, rewrites `deploy/compose.yaml` and `deploy/images.lock`, and prints the table. Create `deploy/images.lock` with research.md R-02's pins. Wire `make pin-images` (Author).
- [ ] T035 Implement `make up`, `make down`, `make build`, and `make pull` in `Makefile` per §4:
  - `up`: preflight, then `pull-models.sh` for the stack, then `up -d --wait --wait-timeout 600`, then `status.py`, with §4's exit codes;
  - `down`: `down --timeout 30`, never `-v`;
  - `build`: ends with `BUILD OK`;
  - `pull`: Docker Hub images one at a time, with 5, 15, and 45 s backoff, naming an HTTP 429 (research.md R-29).
- [ ] T036 [P] Create `tools/gates/compose_policy.py` and `tools/gates/test/test_compose_policy.py` (fixture configs), implementing every refusal in §11's policy list. Wire `make policy`, which runs it over `docker compose config --no-interpolate` for each env file and template; it needs no daemon.

### The agents' engine (FR-039)

- [ ] T037 [P] Write `deploy/agents-engine/test/test_authz.py` first, on recorded Docker API request bodies, with a case for every rule A0–A35 of contracts/agents-engine.md §3. Then implement `deploy/agents-engine/authz.py`, a stdlib Docker authorization plugin on a Unix socket in `h4agents`' plugin directory:
  - the allowed bind roots are `/run/h4agents/tree` (read-only), `/run/h4agents/models` (read-only), and `/var/lib/h4agents/state`;
  - `CapAdd` is allowed only within Docker's default capability set;
  - the audit record follows §3.5.
- [ ] T038 [P] Write `deploy/agents-engine/test/test_egress_proxy.py` first, then implement `deploy/agents-engine/egress-proxy.py` (stdlib) per contracts/agents-engine.md §4:
  - CONNECT to 443, and absolute-form GET to 80, only for the hosts in `.claude/settings.json` `sandbox.network.allowedDomains`, read at start;
  - IP literals refused, and names that resolve to non-global addresses refused;
  - every decision logged.
- [ ] T039 [P] Create `deploy/agents-engine/daemon.json`, `deploy/agents-engine/systemd/*`, and `deploy/agents-engine/docker-relay` per contracts/agents-engine.md §2 and §5:
  - `daemon.json`: the containerd image store, `authorization-plugins: ["h4-authz"]`, and no BuildKit entitlements;
  - the systemd units: the dummy interface `h4agents0` holding `198.18.0.1/32`, the tree and models binds mounted `nosymfollow`, the `/dev/dxg` group, the `h4agents` slice limits, and the user services for `dockerd-rootless`, `h4-authz`, and the egress proxy;
  - `docker-relay`: socat through the sandbox proxy, `DOCKER_HOST=tcp://127.0.0.1:2376`, `DOCKER_TLS_VERIFY=1`.
- [ ] T040 Create `deploy/agents-engine/setup-host.sh` (sudo, idempotent) per contracts/agents-engine.md §5 (H1–H14). It sets up:
  - the `h4agents` user, its own subuid and subgid range, and lingering;
  - the `h4gpu` group and `/dev/dxg` mode 0660;
  - the nftables `skuid` table, allowing established traffic and `198.18.0.1:3128` only;
  - `/etc/wsl.conf` automount `umask=077,fmask=077`, printing the `wsl --shutdown` it needs;
  - `/var/lib/h4agents/models` (root-owned) and `/var/lib/h4agents/state` (owned by `h4agents`);
  - root-owned installed copies of `authz.py` and `egress-proxy.py`;
  - the PKI: a CA, a server certificate with SANs `198.18.0.1` and `127.0.0.1`, and a client certificate in `~/.config/h4reet/agents-engine/docker/`.
- [ ] T041 Create `deploy/agents-engine/engine.sh` with the subcommands `setup`, `up`, `down`, `reset`, `destroy`, `seed`, `status`, `prove`, and `smoke`, and the matching `make engine-*` targets (contracts/agents-engine.md §8).
  - `seed` checks the host's image store and the disk preflight, then moves each digest in `images.lock` with `docker save | docker load`, and copies the stand-in into `/var/lib/h4agents/models`.
  - `up` chowns the state directory through the rootless namespace.
- [ ] T042 Create `deploy/agents-engine/prove-limits.sh`, implementing rows E1–E14 of contracts/agents-engine.md §7. Its report goes into the merge-request note. Wire `make engine-prove` (Author).
- [ ] T043 **Patch**: write the engine-opening patch, `docs/merge-requests/<date>-feat-000-foundations-enforcement.patch`, per §10 and §15. It holds:
  - `.claude/settings.json`: `sandbox.network.allowedDomains` gains `"198.18.0.1:2376"`, and `env` gains `DOCKER_CONFIG=~/.config/h4reet/agents-engine/docker` and `DISABLE_AUTOUPDATER=1`;
  - `.claude/agents/ops.md`: grants `Bash(deploy/agents-engine/docker-relay *)` and drops the paragraph saying no engine exists;
  - `.claude/hooks/bash-gate.sh`: blocks `make engine-*` except `engine-smoke` and `engine-status`;
  - the matrix rows for these, in `redteam/forbidden-actions.sh`.
- [ ] T044 **Author** (Heavy, after this branch merges): apply the two patches from T021 and T043, then run `claude doctor`. Then quickstart.md §0.4 and §0.5:
  - switch the host's Docker to the containerd image store, pruning first and checking the disk;
  - `make engine-setup`, then `wsl --shutdown`;
  - `make engine-seed`;
  - `make engine-prove`.

  Record the results in the next branch's note.
- [ ] T045 Write the merge-request note `docs/merge-requests/<date>-feat-000-foundations.md`. It lists every change to anything that runs in the Author's terminal under its own heading, first: the Makefile, `deploy/scripts/**`, `deploy/agents-engine/**`, and `tools/gates/**` (ADR 0017).

**Checkpoint**: the gateway starts and refuses bad configuration with exit 78; `make up ENV=dev-cpu` passes preflight; and once T044 is done, agents reach the engine through the relay.

---

## Phase 3: User Story 1 — the whole production stack runs locally (P1) 🎯 MVP — branch `feat/000-us1-local-stack`

**Goal**: one command brings up the complete topology on the 5090 host. hello answers from the local model, with a complete trace in Langfuse and a panel in Grafana.

**Independent test**: quickstart.md §1, run cold on the 5090: `make up`, then `make operator-init`, a local hello, the trace, the panel, `make isolation-check`, and `make down`.

### Tests for User Story 1

- [ ] T046 [P] [US1] Create `services/gateway/test/contract/adapter-contract.ts`, exporting `describeAdapterContract(name, makeAdapter, mode)` with assertions C1–C12 of contracts/provider-adapter.md §5.2. Create `test/contract/local-openai.contract.test.ts`, running it against an in-process stub OpenAI server on the sandbox's own loopback.
- [ ] T047 [P] [US1] Create `services/gateway/test/integration/hello-local.test.ts` (Fastify `inject`, PGlite). It covers:
  - `store_uninitialized` before init;
  - after init, a 200 body exactly as contracts/gateway-http.md §2.5.1;
  - a ledger row with attribution `none`, cost 0, and cost basis `none`;
  - the server, `gateway.route`, and `chat {model}` spans;
  - the `/health` JSON exactly as §5;
  - 400 and 415 per §2.5.4.
- [ ] T048 [P] [US1] Create `services/gateway/test/integration/init.test.ts`, covering data-model.md §8:
  - candidates from the ledger, the journal, and stated values, with the max rule;
  - 409 `confirm_zero_required`, then success with `confirm_zero`;
  - renewal pending unless `renew`;
  - 409 `already_initialized`;
  - the journal's torn last line skipped and counted;
  - the dev clock restored from the newest `clock` record.

### Implementation for User Story 1

- [ ] T049 [US1] Implement `services/gateway/src/adapters/local-openai.ts` and `src/adapters/registry.ts` per contracts/provider-adapter.md §3.1 and §4:
  - `fetch` to `POST {base}/chat/completions`, with a connect timeout of 1 s, a request timeout of 10 s, and no retries;
  - health from `GET {base}/models` every 1 s with an 800 ms timeout, unhealthy after 1 failure and healthy again after 3 passes;
  - the error mapping of §2.5.
- [ ] T050 [US1] Implement `services/gateway/src/core/router.ts` and `src/core/gateway.ts` per contracts/gateway-http.md §2.4. A request starts with the state read of data-model.md §7.1, then the kill switch, then local. A stack without a fallback answers `no_fallback_in_stack`. Ledger rows for local calls follow data-model.md §7.4.
- [ ] T051 [US1] Implement `services/gateway/src/routes/hello.ts` and `src/core/limits.ts` per contracts/gateway-http.md §2:
  - at most 500 characters of `message`;
  - the fixed system prompt of §2.2, with 128 output tokens;
  - client identity from edge's `X-Forwarded-For` plus an optional `X-H4-Client` label matching `^[a-z0-9-]{1,32}$`;
  - the per-client cap: 20 a minute, burst 5, 500 a day, then 429 `client_cap_exceeded`;
  - responses 200, 503 (with `X-H4-Degraded-Cause`), 429, 400, 415, and 502 `local_error`.
- [ ] T052 [US1] Implement `GET /health` in `services/gateway/src/routes/health.ts`, exactly as contracts/gateway-http.md §5.
- [ ] T053 [US1] Implement the admin listener's authentication and initialization per contracts/operator-admin.md §1, §2.3, and §4.1:
  - in `services/gateway/src/routes/admin.ts`, bearer authentication with the prefix check before hashing and `timingSafeEqual`, auditing `auth_failed`, with an `auth_failed` alert after 3 failures in 10 minutes;
  - `POST /admin/init` and `GET /admin/status`;
  - `src/meter/init.ts`, following data-model.md §8;
  - `src/meter/journal.ts`, following §3: `O_APPEND`, `fsync`, monthly files at 0600 in a 0700 directory, and the `operator` and `clock` record kinds.
- [ ] T054 [US1] Create `scripts/operator.py` (stdlib, `python3 -I`) with `mint`, `status`, and `init`, per contracts/operator-admin.md §6. It reads the token only from `~/.config/h4reet-ai/operator/<stack>.token` and follows §6.2's exit codes. Add `scripts/test_operator.py`, and the Makefile targets `operator-token`, `operator-init`, and `operator-status` (§6.1).
- [ ] T055 [US1] Add `model-server-gpu` and `model-server-cpu` to `deploy/compose.yaml` per §3: the profiles `gpu` and `cpu`, the commands and flags, the GPU reservation in `gpu` only, and the health checks. Create `deploy/models.lock` with both models' pins from research.md R-03. Create `deploy/scripts/pull-models.sh`:
  - it runs the disk preflight first;
  - it downloads with `curl -fL -C -` and no token;
  - it verifies the sha256, renames atomically, and sets mode 0444;
  - on the engine it only verifies.
- [ ] T056 [US1] Add the observability services to `deploy/compose.yaml`, with the switches of §6:
  - `otel-collector`, with `deploy/otel/collector.yaml` per contracts/telemetry.md §6 (the receivers `otlp` on 4317 and 4318 and `otlp/devtime` on 4319; the traces, metrics, logs, and `metrics/devtime` pipelines; every processor in §6.3; the exporters in §6.4);
  - `prometheus`, with `deploy/prometheus/prometheus.yml` per §6.6;
  - `loki`, with `deploy/loki/loki.yaml`;
  - `grafana`, with `deploy/grafana/provisioning/datasources/*.yaml` (prom, loki, and `gateway` through `grafana_ro`) and `deploy/grafana/provisioning/dashboards/*.yaml`.
- [ ] T057 [US1] Add Langfuse 4.54.0 to `deploy/compose.yaml`: `langfuse-web`, `langfuse-worker`, `langfuse-db`, `clickhouse` (with `deploy/clickhouse/{low-memory,no-crash-reports,prometheus}.xml`), `valkey`, and `seaweedfs` (with `deploy/seaweedfs/entrypoint.sh`, which renders `s3.json` from env and creates the `langfuse` bucket idempotently). Give each the keys of contracts/env-files.md §5 and §6, the off-switches of research.md R-08, and heap caps.
- [ ] T058 [US1] Create `deploy/grafana/dashboards/h4-runtime.json` (uid `h4-runtime`, a 10 s refresh, UTC, `allowUiUpdates: false`). Give it the US1 panels with the exact queries of contracts/telemetry.md §7.3, §7.4, and §7.6: request count, latency p50 and p95, error rate, model-server health, and telemetry health.
- [ ] T059 [US1] Create `deploy/scripts/isolation-check.sh` and `make isolation-check` (Author) per §4.
- [ ] T060 [P] [US1] Start `docs/data-flow-disclosure.md` with the columns of §16 and the rows of §17 for image pulls, model downloads, the phone-homes switched off, and the Author's browser. The compose policy requires a row per service.
- [ ] T061 [P] [US1] Create the runbooks `docs/runbooks/model-server-down.md` and `docs/runbooks/store-initialization.md`, each with Symptoms · Impact · Act · Verify · Undo · Record.
- [ ] T062 [US1] Agent session, on the engine: `make up ENV=dev-cpu` comes up healthy, `make operator-init ENV=dev-cpu` with the dummy token, hello answers from the stand-in, then `make down ENV=dev-cpu`. Paste the output into `docs/merge-requests/<date>-feat-000-us1-local-stack.md`.
- [ ] T063 [US1] **Author** (Heavy): run `quickstart.md` §0.8–§0.9 and §1:
  - the first stack task's measurements (§1.6): the prod model's load time and VRAM, whether the internal network blocks egress, whether an internal-only container can publish a port, and the SeaweedFS tag through `make pin-images`;
  - `make init-env ENV=prod` and `make operator-token ENV=prod`;
  - a cold `make up ENV=prod`, timed (SC-001);
  - `make operator-init`, the hello, the trace, the panel, `make isolation-check` with dev up, and the port scan from another machine.

  The results go into `docs/merge-requests/<date>-feat-000-us1-local-stack.md`, with no secrets.
- [ ] T064 [US1] Write the merge-request note `docs/merge-requests/<date>-feat-000-us1-local-stack.md`.

**Checkpoint**: US1 runs on the 5090 and on the agents' engine. This is the MVP.

---

## Phase 4: User Story 2 — the kill switch fires before anyone can run up a bill (P1) — branch `feat/000-us2-kill-switch`

**Goal**: metered spend is attributed, alerted on, and capped by the in-stack meter, with fallback limited by the sub-budget and its renewal. It is proven by the 12-step breach test.

**Independent test**: `make breach-test ENV=dev-cpu` (an agent session) passes all 12 steps; `make breach-test ENV=dev DELIVERY=real` is the Author's recorded run (quickstart.md §2).

### Tests for User Story 2

- [ ] T065 [P] [US2] Create `services/gateway/test/unit/meter.test.ts`. It covers:
  - `max_micro`, including `fixedUsage`;
  - cost rounded up once, on the sum (data-model.md §7.2);
  - crossings fired only when old < threshold ≤ new;
  - rollover never touching `state`, `crossed`, or `fallback_awaiting_renewal`;
  - reset semantics;
  - every worked case of the renewal allowance in data-model.md §6.2;
  - the sweep settling an expired reservation at its maximum, with `cost_basis` `expired` and `outcome` `unknown`.
- [ ] T066 [P] [US2] Create `services/gateway/test/integration/meter.test.ts` (PGlite). It follows the admission and commit transactions step by step (data-model.md §7.2–§7.3): the locking order, the refusal precedence, outbox rows in the same transaction as each crossing, an idempotent commit retry, the sweep, and the reserved-micro invariant (§2.3).
- [ ] T067 [P] [US2] Create `services/gateway/test/unit/alerts.test.ts`. It covers:
  - every message in contracts/alerts.md §3, rendered with no payloads, client labels, or secrets (§5);
  - dedupe keys, including `:g<n>`;
  - retries at 5, 15, 30, 60, and 120 s, all within 300 s;
  - the 09:00 UTC reminder;
  - the `[dev]` and `[dev-cpu]` prefixes.
- [ ] T068 [P] [US2] Create `services/gateway/test/integration/operator.test.ts`. It covers reset (409 `not_degraded`), renew (409 `not_awaiting_renewal`, and the allowance rule), the reason rule (10–500 characters), the audit rows, the confirmation alerts, and the dev-only test endpoints refused outside dev (403, with `h4.test_machinery.refused`).
- [ ] T069 [P] [US2] Create `evals/test_breach_helpers.py` for the probe's assertion helpers: the T, M, and L sources, and the timing windows.

### Implementation for User Story 2

- [ ] T070 [US2] Implement metered admission and its upkeep in `services/gateway/src/meter/`:
  - `services/gateway/src/meter/admission.ts`, per data-model.md §7.2: the in-memory slots with 429 `metered_capacity_exceeded` (4 in flight, 60 a minute), the transaction, and the `reserve` journal append, compensated with `journal_unwritable`;
  - `src/meter/commit.ts`, per §7.3 and its crossings table;
  - `src/meter/rollover.ts`, per §7.6;
  - the sweep (§2.4) and the 10 s background tasks (§7.7).
- [ ] T071 [US2] Implement `services/gateway/src/adapters/synthetic.ts` (dev only, `fixedUsage` of 1,000 output tokens, requires `GATEWAY_TEST_SYNTHETIC_SPEND=1`) and `test/contract/synthetic.contract.test.ts`, which runs the same contract suite (provider-adapter.md §3.3).
- [ ] T072 [US2] Complete FR-022 in `services/gateway/src/core/gateway.ts`: the fallback branch with every admission cause (`meter_at_ceiling`, `fallback_awaiting_renewal`, `fallback_spent_today`, `fallback_unavailable`, `journal_unwritable`), in data-model.md §7.2's precedence, and the degraded counter and log (contracts/gateway-http.md §3).
- [ ] T073 [US2] Implement the operator writes and reads in `services/gateway/src/routes/admin.ts`, per contracts/operator-admin.md §2.1, §2.2, §4.2, and §4.3, and data-model.md §7.5: `POST /admin/reset`, `POST /admin/renew`, `GET /admin/audit`, and `GET /admin/incidents`. Extend `scripts/operator.py` with `reset`, `renew`, `audit`, and `incidents`, and add the Makefile targets `operator-reset`, `operator-renew`, `operator-audit`, and `operator-incidents`.
- [ ] T074 [US2] Implement `services/gateway/src/routes/test.ts` per contracts/operator-admin.md §3 (dev only):
  - `POST /admin/test/clock`: forward only, 409 `clock_backwards`, and a `clock` journal record;
  - `POST /admin/test/synthetic`: attribution `fallback` or `metered`, a count, $0.10 per call, through the real pipeline.
- [ ] T075 [US2] Implement `services/gateway/src/alerts/outbox.ts`, `dispatcher.ts`, `telegram.ts`, `smtp.ts`, and `format.ts`, per contracts/alerts.md §2–§4:
  - the dispatcher wakes on `LISTEN alert_outbox` or every 2 s, and treats each channel independently;
  - Telegram: the Bot API `sendMessage` in plain text, with a 5 s timeout;
  - email: nodemailer, implicit TLS on 465 or STARTTLS on 587, with a 10 s timeout;
  - failures are recorded as error classes only;
  - the in-memory `store_unreachable` alert after 60 s;
  - the daily reminder;
  - `ALERT_DELIVERY` selects real or stand-in endpoints.
- [ ] T076 [US2] Implement the incident drafts in `services/gateway/src/incidents/draft.ts` per contracts/alerts.md §7: a deterministic template, no model call, the evidence fields, no client identifiers, written under `${GATEWAY_STATE_DIR}/incidents/`, with the `incidents` row updated.
- [ ] T077 [US2] Create the stand-ins in `evals/standins/` and `deploy/compose.yaml`:
  - `evals/standins/telegram_standin.py` (stdlib; `/bot<token>/sendMessage`, `GET /messages`, `/healthz`) and `evals/standins/Dockerfile`, on the pinned Python base;
  - the `telegram-standin` and `mailpit` services in `deploy/compose.yaml`, under the `dev-receivers` profile.
- [ ] T078 [US2] Create the breach test in `evals/breach.py`, `evals/breach_probe.py`, and `evals/Dockerfile.probe`, steps 1–12 of §8, each assertion tagged T, M, or L, with a summary table and a non-zero exit on any miss:
  - `evals/breach.py`, the client-side orchestrator;
  - `evals/breach_probe.py` and `evals/Dockerfile.probe`, with `scripts/operator.py` in the image;
  - the `breach-probe` service under the `breach` profile;
  - `make breach-test ENV=dev|dev-cpu [DELIVERY=real]`, refusing any other stack, and applying the delivery overlay of contracts/env-files.md §7.2 for `DELIVERY=real`.
- [ ] T079 [US2] Add the US2 panels to `deploy/grafana/dashboards/h4-runtime.json`, with the exact queries of contracts/telemetry.md §7.1, §7.2, and §7.5: spend today and month-to-date with thresholds, fallback remaining, the kill-switch state timeline, the degraded cause, the audit log (through `grafana_ro`), and alerts.
- [ ] T080 [P] [US2] Create the runbooks in `docs/runbooks/`, each with Symptoms · Impact · Act · Verify · Undo · Record: `cost-warning.md`, `kill-switch-trip.md`, `kill-switch-reset.md`, `fallback-renewal.md`, `alert-channel-down.md`, `store-unreachable.md`, `journal-unwritable.md`, `operator-auth-failures.md`, and `gateway-down.md`.
- [ ] T081 [P] [US2] Add the Telegram and SMTP rows to `docs/data-flow-disclosure.md` (§17).
- [ ] T082 [US2] Agent session, on the engine: `make breach-test ENV=dev-cpu` passes all 12 steps. Paste the summary table into `docs/merge-requests/<date>-feat-000-us2-kill-switch.md`.
- [ ] T083 [US2] **Author** (Heavy): `make breach-test ENV=dev DELIVERY=real`, recorded with asciinema into `docs/recordings/` (scanned with gitleaks before commit), with the phone on camera (SC-002, quickstart.md §2.2).
- [ ] T084 [US2] Write the merge-request note `docs/merge-requests/<date>-feat-000-us2-kill-switch.md`.

**Checkpoint**: US1 and US2 both work. The kill switch trips with no human action, and only a reset restores it.

---

## Phase 5: User Story 3 — role-scoped agents can't do what the policy forbids (P1) — branch `feat/000-us3-governance`

**Goal**: the enforcement points are proven by the matrix: the hooks, the sandbox, and the agents' engine. Plus the local gates, publish-check, and the agent-configuration evals.

**Independent test**: quickstart.md §3. Matrix stage H runs anywhere, stage S in a session, and stage E from the host; then `make engine-smoke` and the canary.

**Can start in parallel with Phase 3 and Phase 4**: T085–T094 touch none of the gateway's or the stack's files. T095 needs US2.

### Tests for User Story 3 (the matrix is the test)

- [ ] T085 [P] [US3] Grow stage H in `redteam/forbidden-actions.sh` per §13:
  - role rows generated from each `.claude/agents/*.md` `tools:` line, with `agent_type` in the hook input;
  - writes denied to a subagent with an `agent_id` but no `agent_type`;
  - edits to every human-only path, plus `GNUmakefile`, `makefile`, `.mcp.json`, and `config/prices*`;
  - `--no-verify` and `-n`, `claude mcp add`, `make operator-*` and admin URLs outside dev-cpu, and every Author-only target;
  - secret-content rows, with keys assembled at run time;
  - the settings rows;
  - the FR-007 rows, one per secret in contracts/env-files.md §8.

  Rows whose enforcement waits for the closing patch are `planned`: reported, but not failing.
- [ ] T086 [US3] Create `tools/gates/matrix-required.txt`, listing every row ID, and make the matrix fail when a listed row is missing.
- [ ] T087 [P] [US3] Add stage S rows to `redteam/forbidden-actions.sh` per §13. They run when `SANDBOX_RUNTIME=1` is set and `.git/hooks` isn't writable, and are skipped with a notice otherwise. All are non-destructive.
- [ ] T088 [P] [US3] Make `redteam/forbidden-actions.sh` report stage E. On the host, after `make engine-prove`, it reads `prove-limits.sh`'s report and folds rows E1–E14 into its summary.

### Implementation for User Story 3

- [ ] T089 [P] [US3] Create `.gitleaks.toml` (the default rules, plus `h4op_prod_` and `h4op_dev_` tokens and `sk-lf-` keys, allowlisting only `deploy/env.agents/dev-cpu.vars`) and `make secrets` per §11: `gitleaks git --pre-commit` with and without `--staged`, plus `$(git merge-base main HEAD)..HEAD`. Missing gitleaks fails closed.
- [ ] T090 [P] [US3] Create `tools/gates/gate` (the Author's clean-room gate, §11) and `tools/gates/test/test_gate.py`:
  - export the ref with `git archive`;
  - build the devcontainer image, tagged by `.devcontainer/`'s hash;
  - the container phase: `npm ci --ignore-scripts`, then lint, test, the scaffolds, and stage H with `--network none`;
  - the host phase: githooks, toolchain, policy, `corpus-check` with the denylist through `python3 -I -X pycache_prefix=…`, gitleaks, the image build on the engine, and stage E plus the behavioral evals when triggered;
  - a summary line for the merge commit;
  - `gate --host`, marked DEGRADED.
- [ ] T091 [P] [US3] Create `tools/gates/publish_check.py` per §12 (exit codes 0, 1, 3) and `tools/gates/test/test_publish_check.py`, with fixture repositories:
  - a fake secret assembled at run time in an old commit;
  - a denylisted phrase in a removed file;
  - a currency amount in corpus Markdown;
  - a denylisted author email.

  Wire `make publish-check` (Author).
- [ ] T092 [P] [US3] Create the behavioral agent-config evals per §14: `evals/agent-config/behavioral.py`, about 12 cases in `evals/agent-config/cases/*.yaml`, `evals/agent-config/thresholds.yaml`, and the history format under `evals/agent-config/history/`. `make evals-agent-config` (Author) runs them. `make evals` shows PENDING with the command when the trigger hash has no passing entry.
- [ ] T093 [P] [US3] Add `make matrix-canary` (Author): `claude -p --setting-sources project` with fake values for every FR-007 variable, asserting that none appears in the session's environment or transcript (§13).
- [ ] T094 [US3] Agent session: run stage H and stage S of `redteam/forbidden-actions.sh`, and paste the matrix report, planned rows listed, into `docs/merge-requests/<date>-feat-000-us3-governance.md`.
- [ ] T095 [US3] Agent session, after Phase 4 has merged: `make engine-smoke` (`deploy/agents-engine/engine.sh smoke`), meaning `make up ENV=dev-cpu` comes up healthy and `make breach-test ENV=dev-cpu` passes (US3-9's positive half, quickstart.md §3.4).
- [ ] T096 [US3] **Author**: run `make engine-prove`, `tools/gates/gate`, and quickstart.md §6.2:
  - `make engine-prove` (stage E, rows E1–E14);
  - `tools/gates/gate` on the branch;
  - the SC-007 timing of quickstart.md §6.2: a fresh clone, then the devcontainer with an empty build cache, `make setup`, and `make test`, in under 30 minutes.

  The results go into `docs/merge-requests/<date>-feat-000-us3-governance.md`.
- [ ] T097 [US3] Write the merge-request note `docs/merge-requests/<date>-feat-000-us3-governance.md`.

**Checkpoint**: every FR-039 limit is proven from the host, and every hook row passes except the planned ones.

---

## Phase 6: User Story 5 — local-first, with a capped Bedrock fallback, fully traced (P2) — branch `feat/000-us5-fallback`

**Goal**: production falls back to Bedrock inside the sub-budget, and both adapters pass one contract suite.

**Independent test**: quickstart.md §4 and §6.1. A local answer; Bedrock within 5 s with the model server stopped, on prod, in the Author's terminal; both adapters passing the same suite.

### Tests for User Story 5

- [ ] T098 [P] [US5] Create `services/gateway/test/contract/bedrock-converse.contract.test.ts`, running every assertion C1–C12 with `aws-sdk-client-mock` and `aws-sdk-client-mock-vitest`. Create `test/contract/replay.test.ts`, which replays a recording made by `operator.py contract-record` (contracts/provider-adapter.md §5.3 and §5.4).

### Implementation for User Story 5

- [ ] T099 [US5] Implement `services/gateway/src/adapters/bedrock-converse.ts` per contracts/provider-adapter.md §3.2:
  - `ConverseCommand` in us-east-1, `maxAttempts: 1`, `NodeHttpHandler({connectionTimeout: 1000, requestTimeout: 4000})`;
  - one retry, only on `ThrottlingException`;
  - a timeout counts as `possiblyBilled`;
  - health never spends: credential expiry plus a circuit breaker (3 failures, 30 s open);
  - a `credentials_expiring` outbox row 2 h before the SSO session ends.
- [ ] T100 [US5] Implement `POST /admin/adapters/{id}/complete` per contracts/operator-admin.md §5: local on any stack, bedrock on prod only, attribution `test`, through admission. Add `scripts/operator.py contract-record` and `make contract-live ENV=prod ADAPTER=local|bedrock`, which records in the Author's terminal and replays in the devcontainer image with `--network none` (§7).
- [ ] T101 [US5] Create `deploy/scripts/aws-login.sh` and `make aws-login` (Author): `HOME=~/.config/h4reet-ai/aws-home aws sso login --profile h4reet-bedrock`. Wire the gateway's `${H4_AWS_DIR}` mount and `GATEWAY_AWS_PROFILE` in `deploy/compose.yaml` (§5.2).
- [ ] T102 [US5] **Author**: set up Bedrock and fill `config/prices.yaml` and `config/routing.yaml` (research.md R-12 and R-17, quickstart.md §0.6):
  - in IAM Identity Center, create the permission set allowing only `bedrock:InvokeModel` on the confirmed inference profile and the foundation models it routes to, and the dedicated user `h4reet-runtime`;
  - confirm the model with `aws bedrock list-inference-profiles`: Claude Haiku 5.5 in us-east-1, otherwise Claude Haiku 4.5's `us.` profile;
  - add its entry to `config/prices.yaml` from the Bedrock pricing page;
  - set its ID in `config/routing.yaml`, and add `fallback: bedrock` to the prod route.
- [ ] T103 [US5] Add the Bedrock panels (cost by provider, adapter health) to `deploy/grafana/dashboards/h4-runtime.json` (contracts/telemetry.md §7.2 and §7.4); the Bedrock and AWS SSO rows to `docs/data-flow-disclosure.md`; and the runbooks `docs/runbooks/bedrock-credentials-expiring.md` and `docs/runbooks/bedrock-unavailable.md`.
- [ ] T104 [US5] **Author** (Heavy): run `quickstart.md` §4 and §6.1:
  - a local answer;
  - stop the model server, and Bedrock answers within 5 s, with the fallback cost on the dashboard within 60 s (SC-005);
  - `make contract-live` for local and for bedrock (SC-006).

  The results go into `docs/merge-requests/<date>-feat-000-us5-fallback.md`.
- [ ] T105 [US5] Write the merge-request note `docs/merge-requests/<date>-feat-000-us5-fallback.md`.

**Checkpoint**: US5's fallback works on prod, and both adapters pass one suite.

---

## Phase 7: User Story 6 — the repository explains itself (P3) — branch `feat/000-us6-docs`

**Goal**: a stranger finds the reasoning, the process, and the running stack from the README.

**Independent test**: quickstart.md §5.1 and §5.2. The README's links, and every ADR within two clicks (SC-009).

- [ ] T106 [P] [US6] Update `README.md`:
  - the status and a devcontainer quickstart;
  - links to the constitution, `intent/`, the spec index, the ADR index, `docs/how-we-build/`, `SECURITY.md`, the MIT license, `docs/data-flow-disclosure.md`, `docs/runbooks/`, and `docs/recordings/`, with the breach recording on the non-engineer path.
- [ ] T107 [P] [US6] Complete `docs/data-flow-disclosure.md` with every row of §17, closing with "No visitor data flows in this spec.". Link it from `SECURITY.md`.
- [ ] T108 [P] [US6] Create `docs/runbooks/README.md`, an index of every runbook, and the runbooks for the agents' engine and the local gate. Update `docs/how-we-build/lifecycle.md`'s enforcement table with the new layers.
- [ ] T109 [P] [US6] Update `docs/START-HERE.md` per §16:
  - §1: the NVIDIA runtime step, Node 24 through `fnm`, the disk check, `make tools`, and `make engine-setup` with its `wsl --shutdown`;
  - a new "Before you merge" section;
  - §4's gotchas;
  - §6 step 1: `make publish-check`.
- [ ] T110 [US6] Add the new human-only paths to `.github/CODEOWNERS` (FR-001): `tools/gates/**`, `evals/agent-config/**`, `.gitleaks.toml`, `deploy/agents-engine/**`, `.mcp.json`, and `config/prices*`.
- [ ] T111 [US6] Add a docs-link check to `evals/agent-config/static.py`: every relative link in `README.md`, `docs/**`, and `specs/**` resolves; the README links the ADR index; and the index links every ADR file (SC-009).
- [ ] T112 [US6] Write the merge-request note `docs/merge-requests/<date>-feat-000-us6-docs.md`.

---

## Phase 8: Polish and cross-cutting — branch `feat/000-enforcement`

**Purpose**: the closing enforcement patch, the switch from planned rows to enforced rows, and the final validation.

- [ ] T113 **Patch**: write the closing enforcement patch, `docs/merge-requests/<date>-feat-000-enforcement-enforcement.patch`, per §15:
  - `.claude/settings.json`: the `denyWrite` and `denyRead` additions, the FR-007 variable names, the `Edit(...)` denies for the human-only paths, and the Claude Code telemetry `env` entries;
  - `.claude/hooks/bash-gate.sh`: `operator-*` and admin URLs outside dev-cpu, the Author-only targets, `--no-verify`, `claude mcp add`, git-alias expansion, and the `terraform` global-flag pattern;
  - `.claude/hooks/protected-paths.sh`: the new human-only paths, `GNUmakefile` and `makefile`, role write scopes from `agent_type`, and writes denied when `agent_id` comes without `agent_type`;
  - the new `.claude/hooks/content-scan.sh` (PreToolUse, `gitleaks stdin`, failing closed);
  - `.claude/hooks/post-edit-check.sh`: TypeScript, JSON, YAML, and Markdown through `~/.local/share/h4reet/lint-node` with its own configs;
  - `.claude/git-hooks/pre-commit`;
  - the CLAUDE.md lines, keeping it under 60 lines;
  - in `redteam/forbidden-actions.sh`, every planned row switched to block or allow.
- [ ] T114 **Author**: apply `docs/merge-requests/<date>-feat-000-enforcement-enforcement.patch`, then run `claude doctor`, `make git-hooks`, and `make check`. The result must be 0 failures and 0 planned rows (SC-003). The trigger fires, so run `make evals-agent-config` and commit its history entry (SC-008).
- [ ] T115 **Author**: run quickstart.md §7's done-when table end to end, and fill the success-criteria table (SC-001, 002, 003, 005, 006, 007, 008, 009) in `docs/merge-requests/<date>-feat-000-enforcement.md`.
- [ ] T116 Write the merge-request note `docs/merge-requests/<date>-feat-000-enforcement.md`. `make publish-check` runs later, before the first push (START-HERE §6), not at this merge.

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup. It blocks every story. T044 (the Author's engine setup) blocks every agent-run container task: T062, T082, and T095.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1. It extends the gateway US1 builds, and the breach test runs the US1 stack.
- **US3 (Phase 5)**: after Foundational. T085–T094 can run in parallel with US1 and US2. T095 needs US2 merged.
- **US5 (Phase 6)**: after US2, which supplies the meter and the fallback branch. T102 (the Author's IAM and price steps) blocks T104.
- **US6 (Phase 7)**: after US1. It can run in parallel with US2, US3, and US5, but its link check (T111) is final only after them.
- **Polish (Phase 8)**: after every story. The closing patch switches every planned row.

### Within each story

- Tests first; they fail, then the code that makes them pass.
- The store and its transactions before the routes that use them; the routes before the compose wiring; the compose wiring before the Author's runs.
- Each phase ends with its merge-request note.

### Parallel opportunities

- **Phase 1:** T002, T003, T004, T007, T008, T009, T010, T011, and T012 touch different files.
- **Phase 2:** the gateway track (T014–T027) and the engine track (T037–T042) are independent. Within them, T015, T016, T019, T020, T025, T029, T030, T031, T033, T034, T036, T037, T038, and T039.
- **US1:** the tests T046, T047, and T048 together; then T060 and T061 beside the compose work.
- **US2:** the tests T065–T069 together; T080 and T081 beside the code.
- **US3:** T085, T087–T093 in parallel, and alongside Phases 3 and 4.

## Parallel example: User Story 2

```bash
# Tests first, together:
Task: "Create services/gateway/test/unit/meter.test.ts (T065)"
Task: "Create services/gateway/test/integration/meter.test.ts (T066)"
Task: "Create services/gateway/test/unit/alerts.test.ts (T067)"
Task: "Create services/gateway/test/integration/operator.test.ts (T068)"
Task: "Create evals/test_breach_helpers.py (T069)"

# Docs beside the code:
Task: "Create the US2 runbooks in docs/runbooks/ (T080)"
Task: "Add Telegram and SMTP rows to docs/data-flow-disclosure.md (T081)"
```

## Implementation strategy

### MVP first (User Story 1)

1. Phase 1 (Setup), then Phase 2 (Foundational), including the Author's engine setup (T044).
2. Phase 3 (US1). **Stop and validate**: quickstart.md §1 on the 5090 (SC-001).

### Incremental delivery

1. US1, the stack, then US2, the kill switch with the breach test (SC-002), then US5, the Bedrock fallback (SC-005, SC-006).
2. US3, governance, beside US1 and US2; its engine smoke follows US2.
3. US6, the docs, then the closing patch. Spec 000 is done when every success criterion passes on the 5090, and the matrix shows 0 failures and 0 planned rows.

### Agents and the Author

- Agents implement every unmarked task on the phase's branch, in the sandbox, with containers on the agents' engine once T044 is done.
- The Author runs the tasks marked **Author**, applies the **Patch** files, and merges each branch after reading its note. Changes to anything that runs in the Author's terminal are listed first.
- Heavy Author steps are their own step, with no agents working, after the disk preflight.

## Notes

- [P] tasks touch different files and depend on nothing unfinished.
- Every task names its file, and the section of the contract or plan it implements. Where a detail is in a contract, the contract governs, and plan.md is fixed if they disagree.
- No task edits `.claude/**`, `REVIEW.md`, `CLAUDE.md`, the constitution, `config/budgets*`, or `config/alert*` directly. Those go through Patch tasks.
