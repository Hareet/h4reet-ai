---

description: "Task list for spec 001, Cloud Elevation: EC2 as prod's default host, the laptop when the Author runs it"
---

# Tasks: Cloud Elevation — Terraform, One Account, EC2 as Prod's Default Host

**Input**: the documents in `specs/001-cloud-elevation/`:
- [spec.md](spec.md): FR-001 to FR-076, SC-001 to SC-018 (SC-015 moved), User Stories 1 to 8, and Clarifications, including the Author's answers to the plan's questions 1 to 4;
- [plan.md](plan.md): §1 to §17, the patches P-1 to P-5, the task groups of §16, and its risks;
- [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), and [quickstart.md](quickstart.md).

It replaces the September task list (`tasks.md` at 00309c47).

**Prerequisites**:
- **T000** (the Author's approval of spec.md and plan.md) comes before every other task. CLAUDE.md: "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`."
- **T016** (the Author applies the amended constitution 1.1.0) comes before any task that creates a file under `infra/`.
- **The provisional answers:** the plan's questions 5 to 7 were taken as the session's defaults, not his words. A different answer at T000 changes the tasks that cite that question before they start.

**Tests**: required. In each group the test tasks come first and must fail (RED) before the code that makes them pass (GREEN), and the branch's note records both runs. Terraform has no agent-run tests beyond the offline checks: `terraform test` is refused to agents (FR-006). Its proofs are the policy's fixtures, `make infra-check`, the redacted plan in the note, and the Author's quickstart runs.

**Organization**:
- **Eleven groups,** one feature branch each, as plan §16 lists them. Each branch is cut from `refs/heads/main` once the group before it has merged, in its own worktree, and the Author merges them in order.
- **User-story labels** mark which story a task serves; a group may serve several.
- **Parallel lanes:** tasks marked [P] touch files that no unfinished task of their group touches. Agents may take them in worktrees of their own, one per agent that writes, and the commits are cherry-picked onto the branch in task order. Agents never merge.
- **Each group ends** with a review by an agent that wrote none of it, then a merge-request note, `docs/merge-requests/<date>-feat-001-<group>.md`. It holds `make check ENGINE_MODE=none-yet`'s whole output, `gitleaks dir`'s output, and, for `infra/` changes, the Author's redacted plan blocks.

## Format: `[ID] [P?] [Story?] Description. Check: … (branch)`

- **[P]**: can run in parallel with the other [P] tasks of its group.
- **[USn]**: the spec's user story. Setup and Polish tasks carry none.
- **"Author:"** opens a task only the Author does, in his own terminal. Every `terraform apply`, `import`, and `init -migrate-state`; every IAM, budget, or alert-routing change; every secret; the constitution; and every paid or live run. Agents never run these, and the bash gate refuses them (FR-006, R-16).
- **Patches.** A human-only or protected path changes only by the Author's hand:
  - `.claude/**`, `CLAUDE.md`, `REVIEW.md`, and `tools/gates/**`;
  - `config/budgets.yaml`, `config/prices.yaml`, and `config/alerts.yaml`;
  - the protected Terraform files: `iam*.tf`, `budgets*.tf`, `alerts*.tf`, `killswitch*.tf`, `handover*.tf`, `failover*.tf`, `ec2-market*.tf`, `edge-limits*.tf`, and `infra/policy/**`.

  An agent task writes such a change as a `.patch` beside the branch's note. The plan's patches keep their names, P-1 to P-5 (plan §14); the protected Terraform arrives as P-I1 to P-I6, one per group that has any. It builds the patch from plain copies (`git show`, `git diff --no-index`), never by `git apply` or a write into any worktree.

## Path conventions

- **Infrastructure:** `infra/{bootstrap,account,prod}/`, `infra/modules/`, `infra/lambdas/<name>/`, `infra/policy/`.
- **Services:** `services/relay/` (new) and `services/gateway/` (`src/config/`, `src/meter/`, `src/core/`, `migrations/`, `test/`).
- **The stack:** `deploy/` (`compose.yaml`, `edge/`, `tunnel/`, `hosts/`, `otel/`, `scripts/`, `env.example/`); `scripts/operator.py`; `apps/web/`; `evals/`; `redteam/`; `docs/`.
- **References:** "§n" is plan.md's, "R-nn" research.md's, "FR-nnn" and "SC-nnn" the spec's. "Plan Qn" is the plan's question n.
- **Test values:** tests build key- and token-shaped values at run time, never as literals.

---

## Before any group

- [ ] T000 Author: approve spec.md and plan.md, and with them §13's spec amendments, which follow his answer to plan Q1. Confirm, or overturn, the provisional answers to plan Q5 (the resting words as a spec 002 follow-up in his words), Q6 ("it" is the laptop's stack), and Q7 (the IAM default with the guard's stop-only role and the start function's reads), and question 16's default with them. Then gate and merge `spec/001-cloud-elevation` (documents only) with `tools/gates/gate spec/001-cloud-elevation` from main's checkout. Check: the plan's Status and the spec's Clarifications record his approval and any answer of his in his words (main)

---

## Group 1: the guards (Setup) — `feat/001-guards`

**Purpose**: every deny, refusal, and protection lands before any `infra/` file, state, key, or secret exists (plan §2).

### Tests first

- [ ] T001 Create the worktree for `feat/001-guards` from `refs/heads/main` and record the base's full SHA. Make a fresh `git archive` export of `main` in a new, empty folder, as the patches' base. Check: `git rev-parse HEAD` is main's SHA, read from `refs/heads/main` (feat/001-guards)
- [ ] T002 [P] Write the forbidden-action matrix's new rows in a copy of `redteam/forbidden-actions.sh` and `tools/gates/matrix-required.txt`, on the export:
  - stage H rows for Terraform's state-changing commands in every spelling (R-16: `-chdir`, `TF_CLI_ARGS*`, `tofu`, `terragrunt`, wrappers, `bash -c`, subshells, a path to the binary);
  - stage H rows for the Author-only targets (R-32, R-16);
  - stage S rows for the denied paths and names (contracts/env-cloud.md §5);
  - rows for the protected files (contracts/infra-records.md §3, T5);
  - a gap row for any spelling found to get through.

  Check: RED, the rows fail on the unpatched export (feat/001-guards)
- [ ] T003 [P] Write `tools/gates/test/test_infra_policy.py`, `test_infra_redact.py`, `test_infra_plan_note.py`, and `test_disclosure_check.py` on the export. They need fixtures for rules T1 to T13 (each passing and failing), redaction (12-digit runs, emails, sensitive values, a secret pattern refused), the plan note's tree hash, and the disclosure against compose services, sshd permits, egress-proxy hosts, CloudFront origins, EventBridge targets, and open security-group rules. Check: RED (feat/001-guards)

### Implementation

- [ ] T004 Write P-1 as `docs/merge-requests/<date>-feat-001-p1-guards.patch`, from plain copies of `main`'s files, by plan §2's list:
  - `.claude/hooks/bash-gate.sh`'s Terraform rules and Author-only targets;
  - `.claude/settings.json`'s denies (`*.tfstate*`, `*.tfplan`, `*.tfvars*`) and `credentials.envVars` (`TF_VAR_*`, `AWS_*`, `TF_CLI_ARGS*`, `GATEWAY_DB_URL`, `GATEWAY_DB_TLS_SERVERNAME`, `RELAY_TOKEN_*`, `DB_*_PASSWORD`);
  - `.claude/hooks/protected-paths.sh`'s Terraform globs;
  - `tools/gates/infra_policy.py`, `infra_redact.py`, `infra_plan_note.py`, `disclosure_check.py`, and the compose policy's host rules;
  - the gate's `infra-plan-note` and `infra-check` steps;
  - T002's rows and T003's tests.

  Check: `patch -p1 --dry-run` applies it cleanly to a second fresh export; on a patched export, T002's rows and T003's tests pass, and the agent-config tiers pass (FR-004 to FR-006, FR-011, FR-012) (feat/001-guards)
- [ ] T005 [P] Write P-3 as `docs/merge-requests/<date>-feat-001-p3-claude-md.patch`, with plan §14's three sentences of `CLAUDE.md` drafted and marked for his words: the infra line for the local phase's apply, the routing sentence per host, and the relay's line. Check: applies to a fresh export; `evals/agent-config`'s static tier passes on it (FR-062) (feat/001-guards)
- [ ] T006 [P] Write the ADRs plan §14 lists, status proposed, at the free numbers in `docs/adr/README.md` when this task runs, with their index rows:
  - 0007, 0008, and 0009;
  - the shared state in RDS;
  - the relay on the tunnel end, with the tunnel end on spot (plan Q1, Q2);
  - the tunnel;
  - EC2 on spot with stop, the start function, and the guard;
  - the route per host and rule R1;
  - the public cap.

  Check: the docs-links check passes; each ADR quotes the Author's answers it rests on, in his words (FR-062, SC-014) (feat/001-guards)
- [ ] T007 Author: choose the Terraform and `hashicorp/aws` versions in his terminal. The agent then writes them to `.devcontainer/toolchain.vars`, with the AWS CLI's pin, in the branch. Check: `make toolchain-check` passes (FR-004) (feat/001-guards)
- [ ] T008 Author: apply P-1 and P-3 in his terminal, then run `make infra-mirror`, which seeds `~/.local/share/h4reet/terraform-providers`. Check: the matrix shows zero failures and no gap; `make check`'s `infra-check` step reads PLANNED until `infra/` exists (quickstart §1) (main)
- [ ] T009 Close the group: a review pass by an agent that wrote none of it, and the note. Check: the note holds `make check`'s and `gitleaks dir`'s whole output, and lists P-1 and P-3 first under "For the Author" (feat/001-guards)

---

## Group 2: the measurement, and the Author's figure (Setup) — `feat/001-measure`

**Purpose**: the stack's memory and architectures measured, so the Author prices and sets the server budget's figure before any apply (FR-021; plan Q14's answer, "Measure, then you set it").

- [ ] T010 [P] Write `deploy/scripts/test_measure_stack.py`. It needs fixtures of `docker stats` samples: the peak resident memory per service over a run; a refusal when a model-server service is running; and the record's shape (R-33). Check: RED (feat/001-measure)
- [ ] T011 [P] Write `deploy/scripts/test_arch_inventory.py`. It needs fixtures of image indexes: `linux/arm64` present or absent per service in `deploy/images.lock`, and the hosts each service runs on (contracts/env-cloud.md §3). Check: RED (feat/001-measure)
- [ ] T012 Write `deploy/scripts/measure_stack.py`, `make measure-stack ENV=dev-cpu`, and a load script: hello and twin turns at the public cap, against a stub paid adapter, with the CPU model server stopped. Check: T010 passes (FR-021) (feat/001-measure)
- [ ] T013 Write `deploy/scripts/arch_inventory.py`, offline against the seeded store (`docker buildx imagetools inspect`). Check: T011 passes (feat/001-measure)
- [ ] T014 Run the measurement on `dev-cpu` and the inventory. Record each service's peak memory, the disks' sizes, and which images lack arm64 in research.md R-33 and the note, with the run's length and load. Check: the record names the smallest instance types that fit, by memory alone; no price is written (R-33) (feat/001-measure)
- [ ] T015 Author: price research.md R-05's lines from AWS's pages in his terminal:
  - EC2's measured types on spot, and an 8-to-12-hour day for the reserve;
  - the tunnel end's `t4g.micro` on spot, and its Elastic IP;
  - RDS's smallest Graviton class and its storage;
  - the Route 53 health check;
  - the fault-injection service for the rehearsals;
  - the "to confirm" lines.

  Then set the server budget's figure as `TF_VAR_server_budget_usd` in `~/.config/h4reet-ai/infra/bootstrap.env`. Check: research.md R-05's lines carry his prices and their dates, with the figure where he chooses to record it (FR-021, FR-022) (feat/001-measure)
- [ ] T016 Author: apply the constitution's amendment 1.1.0, as amended on `docs/001-ec2-default` with the two sentences he chose to add (plan Q3; P-2), and accept ADR 0044. Check: `.specify/memory/constitution.md` reads "**Version**: 1.1.0"; ADR 0044's Status reads accepted (main)
- [ ] T017 Close the group: review and note. Check: as T009 (feat/001-measure)

---

## Group 3: the bootstrap (US1, US2) — `feat/001-us1-bootstrap`

**Goal**: Terraform's state, and the budgets, applied first (FR-001 to FR-008, FR-022). **Independent test**: quickstart §3.

### Tests first

- [ ] T018 [P] [US1] Write `infra/test/fixtures/bootstrap/` and `infra/test/test_bootstrap.py`, which parses the root's HCL with `python-hcl2`:
  - the state bucket: versioned, encrypted, public access blocked, TLS-only;
  - `h4-model-month` at $20 and `h4-model-day` at $5, on Bedrock's cost, with notifications at 70% and 100%;
  - `h4-server-month` at `var.server_budget_usd`, on every cost but Bedrock's, at 70% and 100%;
  - the anomaly monitor with its $1 subscription;
  - `h4-alerts` with its email subscription from a sensitive variable;
  - the tags.

  Check: RED (FR-001 to FR-003, FR-022) (feat/001-us1-bootstrap)
- [ ] T019 [P] [US1] Write `scripts/infra/test_infra_verify.py` and `test_infra_record.py`, with a stub `terraform show -json`. They cover `infra-verify`'s refusals (`not_main`, `dirty`, `no_reviewed_plan`, `plan_missing`, `plan_stale`, `plan_not_reviewed`, `plan_differs`, `credential_finding`, `state_locked`) and the record's fields: addresses and actions only, redacted. Check: RED (FR-005, FR-007, FR-010) (feat/001-us1-bootstrap)
- [ ] T020 [P] [US1] Write `infra/lambdas/credential_audit/test_audit.py`, with a stub IAM. Its findings: user access keys, root keys, outside trust, OIDC providers, the laptop's permission set not being Terraform's, and a start, guard, or stop policy naming anything but the tagged instance. Nothing may name a key's ID. Check: RED (FR-008, SC-004) (feat/001-us1-bootstrap)

### Implementation

- [ ] T021 [US1] Write `infra/bootstrap/{main,variables,versions,outputs}.tf` and its lockfile from the mirror. Write `budgets.tf` and `alerts.tf` as P-I1 (`docs/merge-requests/<date>-feat-001-pi1-bootstrap.patch`), since they are protected. Check: on a patched copy, T018 passes, and `make infra-check` passes (feat/001-us1-bootstrap)
- [ ] T022 [US1] Write `make plan ROOT=…`, `make infra-verify`, `make infra-record`, `make infra-audit`, and `make secrets-check` (`scripts/infra/*.py`), each refused to agents by P-1. Check: T019 passes (feat/001-us1-bootstrap)
- [ ] T023 [P] [US1] Write `infra/lambdas/credential_audit/` (stdlib Python, Dockerfile) and `infra/README.md`. Check: T020 passes (feat/001-us1-bootstrap)
- [ ] T024 Author: apply P-I1, then:
  1. run `make plan ROOT=bootstrap` and paste the block into the note; the gate passes; merge;
  2. on `main`, run `make infra-verify ROOT=bootstrap`, apply the saved plan, and run `make infra-record`;
  3. migrate the state (`terraform init -migrate-state`) and record it;
  4. activate the cost-allocation tags in the Billing console;
  5. confirm SNS's email subscription.

  Check: quickstart §3's checks; the apply record is on `ops/apply-bootstrap-<date>` (FR-003, FR-007, FR-022; SC-012) (main)
- [ ] T025 Close the group: review and note. Check: as T009 (feat/001-us1-bootstrap)

---

## Group 4: the safety net (US2) — `feat/001-us2-safety-net`

**Goal**: the alert path, the model action on the laptop's Bedrock identity, both actions' rehearsals, the probe, the registry, and releases' bucket (FR-022 to FR-026, FR-061). **Independent test**: quickstart §4.

### Tests first

- [ ] T026 [P] [US2] Write `infra/lambdas/alert_bridge/test_bridge.py`: every kind in contracts/aws-alerts.md §2 gives its message, in the `[hareet.ai aws]` format; no secret, account ID, key ID, payload, or client identifier ever appears; retries and failure destination. Check: RED (FR-022) (feat/001-us2-safety-net)
- [ ] T027 [P] [US2] Write `infra/lambdas/probe/test_probe.py`: the two checks with `X-H4-Probe: 1`; a pass needs a 200 within 5 s and, for status, a `serving` field; it never calls hello or a turn. Check: RED (FR-061) (feat/001-us2-safety-net)
- [ ] T028 [P] [US2] Write `infra/test/fixtures/account/` and `infra/test/test_account.py`. They cover the model action's settings, `h4-deny-paid-models`, its execution role scoped to its targets, the rehearsal budgets at $0.01 with their targets while `rehearsal = true`, and the imported Bedrock permission set allowing only `bedrock:InvokeModel*` on the one inference profile. Check: RED (FR-013, FR-023, FR-026) (feat/001-us2-safety-net)

### Implementation

- [ ] T029 [US2] Write `infra/account/{main,lambdas,registry}.tf` (the bridge, the probe with its schedule disabled until group 8, the audit's weekly schedule, ECR, the release bucket, the rehearsal instance). Write `killswitch.tf`, `iam.tf` (the laptop's permission set, for import), and `alerts.tf` as P-I2. Check: on a patched copy, T028 passes, and `make infra-check` passes (feat/001-us2-safety-net)
- [ ] T030 [P] [US2] Write `infra/lambdas/alert_bridge/` and `infra/lambdas/probe/`. Check: T026 and T027 pass (feat/001-us2-safety-net)
- [ ] T031 [P] [US2] Write the runbooks `docs/runbooks/aws-budget.md`, `aws-budget-action.md`, `server-budget.md`, `aws-anomaly.md`, and `credential-audit.md`. Check: each alert kind of this group names its runbook (FR-056) (feat/001-us2-safety-net)
- [ ] T032 Author: apply P-I2, then:
  1. plan and verify, and import the laptop's Bedrock identity (`terraform import`); apply and record;
  2. write the Telegram parameters;
  3. set `rehearsal = true`, plan, and apply;
  4. record each action's timings (contracts/aws-alerts.md §4; September §3.4);
  5. set `rehearsal = false`, plan, and apply.

  Check: SC-009, both channels got each alert and each action took effect on its rehearsal target; spec 000's "made by hand" deviation ends for the laptop (FR-013) (main)
- [ ] T033 Close the group: review and note. Check: as T009 (feat/001-us2-safety-net)

---

## Group 5: the tunnel end and the tunnel (US4) — `feat/001-tunnel-end`

**Goal**: the laptop reaches the cloud only by dialing out, to an always-on spot instance in the account (FR-052 to FR-055, FR-076's instance and warning). **Independent test**: quickstart §5.

### Tests first

- [ ] T034 [P] [US4] Write `deploy/tunnel/test_tunnel.py`: two containers on the agents' engine. Only 2201, 2202, and 2203 may be listened on, and only the stub store and the sink opened. No shell or command opens. A wrong host key is refused. The forward to the store reaches only the store. Check: RED (FR-052, FR-053, FR-055) (feat/001-tunnel-end)
- [ ] T035 [P] [US4] Write `deploy/edge/test_tunnel_blocks.py` (spec 000's edge tests' style):
  - 8085 needs its bearer token, 401 otherwise, logged with no address; it moves `X-H4-Viewer` into the one `X-Forwarded-For` and keeps `traceparent`;
  - 8086 needs its own token;
  - 8087 serves `GET /health` only, with an empty body, 200 or 503 as the gateway's health says, and is rate-limited;
  - every other path gets 404.

  Check: RED (FR-053, FR-054) (feat/001-tunnel-end)
- [ ] T036 [P] [US4] Extend `services/gateway/test/unit/health.test.ts`: the health answer carries the store's readability, and reads unhealthy while the store can't be read. Check: RED (FR-054) (feat/001-tunnel-end)
- [ ] T037 [P] [US4] Write `deploy/hosts/test_hosts.py` and extend `deploy/scripts/test_preflight.py` and the compose policy's tests:
  - the tunnel end's nftables and security-group text admits 2222 from anywhere, 8087 from Route 53's ranges, and 8080 only privately;
  - its egress allowlist matches the disclosure;
  - the `tunnel-end` class selects `tunnel-end`, `relay`, `snapshot-sink`, and the collector only, with `H4_HOST=tunnel-end`;
  - the laptop's prod has the `tunnel` profile.

  Check: RED (FR-051, FR-052) (feat/001-tunnel-end)
- [ ] T038 [P] [US4] Write `infra/test/fixtures/prod-tunnel-end/` and `infra/test/test_prod_network.py`. They cover the VPC and its subnets, the tunnel end with two interfaces, its Elastic IP, IMDSv2 with hop limit 1 (T13), spot persistent with `stop` (T11), its role (R-15), and the `h4-tunnel-end-spot-warning` rule to `h4-alerts`. Check: RED (FR-076) (feat/001-tunnel-end)

### Implementation

- [ ] T039 [US4] Write `deploy/tunnel/` (Dockerfile, `sshd_config`, `ssh_config`, entrypoint) per contracts/tunnel.md, and `tunnel` and `tunnel-end` in `deploy/compose.yaml`. Check: T034 passes (feat/001-tunnel-end)
- [ ] T040 [US4] Add the three blocks to `deploy/edge/nginx.conf` and the store field to the gateway's health. Check: T035 and T036 pass (feat/001-tunnel-end)
- [ ] T041 [US4] Write `deploy/hosts/` for the tunnel end (cloud-init, systemd units, nftables, `daemon.json`), `deploy/scripts/write_env.py`, `egress_proxy.py`, and the deployer's host part. Extend preflight and the compose policy's `tunnel-end` class. Check: T037 passes (feat/001-tunnel-end)
- [ ] T042 [US4] Write `infra/prod/{main,network,tunnel-end,ssm}.tf`. Write `ec2-market.tf` (the tunnel end's spot options), `iam.tf` (its role), and the warning rule in `infra/account/handover.tf` as P-I3. Check: on a patched copy, T038 passes, and `make infra-check` passes (feat/001-tunnel-end)
- [ ] T043 [P] [US4] Write `make tunnel-keys` and `make tunnel-revoke` (Author-only), and `h4.tunnel.up` and `h4.tunnel.reconnects` from both ends. Check: their unit tests pass; the bash gate refuses them in an agent session (FR-055, FR-060) (feat/001-tunnel-end)
- [ ] T044 [P] [US4] Add the disclosure rows S16, S17, and C3, the S1 change, and the tunnel end's egress rows, in the same commit as T039. Write `docs/runbooks/tunnel-end.md` (a restart, a key's revocation, its loss, a spot interruption, a move to another zone) and the laptop runbook's tunnel part. Check: `disclosure_check` passes; FR-040 (feat/001-tunnel-end)
- [ ] T045 Author: apply P-I3; plan, verify, apply, and record `infra/prod`'s network and the tunnel end; run `make tunnel-keys` and write the parameters; `make secrets-check`; start the laptop's prod with the `tunnel` profile; run the scans; run `make tunnel-revoke` and restore. Check: quickstart §5, SC-006 (main)
- [ ] T046 Close the group: review and note. Check: as T009 (feat/001-tunnel-end)

---

## Group 6: the shared state, and the route per host (US2) — `feat/001-shared-state`

**Goal**: one meter and one kill switch in RDS for both hosts, a route per host, and operator actions whichever host serves (FR-017 to FR-020, FR-067, FR-074). **Independent test**: quickstart §6.

### Tests first

- [ ] T047 [P] [US2] Extend `services/gateway/test/integration/migrations.test.ts` for `0007_hosts.sql`: `host` on `ledger` and `audit_log`; `handover_events` with its checks; `relay_ro` and `relay_rw` with exactly their grants; `v_handovers` for `grafana_ro`; 0001 to 0006 byte-identical. Check: RED (data-model.md §1.2) (feat/001-shared-state)
- [ ] T048 [P] [US2] Write `services/gateway/test/integration/shared-state.test.ts`: two gateway processes against one Postgres. Paid admission at the global limit never passes a ceiling beyond spec 000's in-flight bound. One rollover at the UTC boundary, one alert per crossing, and the kill switch seen by both within 10 s. Check: RED (FR-017, FR-019; data-model.md §1.3) (feat/001-shared-state)
- [ ] T049 [P] [US2] Extend `test/unit/validate-config.test.ts` and write `test/unit/routes-per-host.test.ts`:
  - schema 2, R1 amended, H1, H2, and A1;
  - `H4_HOST` selection, and exit 78 on `ec2` with a `primary` or `laptop` with a `first`;
  - EC2's calls attributed `metered`, with `fallback_day` untouched;
  - the laptop's fallback attributed `fallback`;
  - spec 010's refusals on the `ec2` route (`price_missing`, `adapter_cap_missing`, `missing_env`).

  Check: RED (FR-067, FR-068) (feat/001-shared-state)
- [ ] T050 [P] [US2] Extend `deploy/scripts/test_preflight.py` and `test_env_files.py`:
  - `GATEWAY_DB_URL` must use TLS on prod, and the local store is refused on `laptop` and `ec2`;
  - `GATEWAY_DB_TLS_SERVERNAME` is required with it;
  - the templates;
  - `H4_HOST` per class, and its mismatches.

  Check: RED (FR-019; contracts/env-cloud.md §2) (feat/001-shared-state)
- [ ] T051 [P] [US2] Write `scripts/test_operator_shared.py`: `ENV=shared` composes an admin-only stack (the tunnel's `-L 5432` only, the gateway's admin listener on loopback, no relay block); it refuses `init` unless the store is `uninitialized`; each action writes an audit row with `host`. Check: RED (FR-074) (feat/001-shared-state)
- [ ] T052 [P] [US2] Extend `evals/test_twin_readiness.py`: the evidence names both host routes' adapters, the laptop's local model and fallback and EC2's Anthropic API and Bedrock, read from schema 2. Check: RED (spec 010 FR-026 and spec 007 FR-031, amended by name) (feat/001-shared-state)
- [ ] T053 [P] [US2] Write `infra/test/fixtures/prod-rds/` and `infra/test/test_prod_rds.py`: rule T12, the subnet group, the parameter group (`rds.force_ssl`, no statement logging), the security group admitting only EC2's and the tunnel end's groups, and no `password` argument. Check: RED (FR-019; contracts/shared-state.md §1) (feat/001-shared-state)

### Implementation

- [ ] T054 [US2] Write `migrations/0007_hosts.sql`, and set `host` on each ledger and audit row from `H4_HOST`. Check: T047 passes (feat/001-shared-state)
- [ ] T055 [US2] Make the gateway's store connection take `GATEWAY_DB_URL` with TLS verified against the pinned RDS bundle and a server name. Check: T048 passes (feat/001-shared-state)
- [ ] T056 [US2] Add schema 2, the route per host, R1, H1, H2, and A1 to `src/config/validate.ts` and the router, and write `config/routing.yaml` (agent-editable) as schema 2 with prod's laptop route keeping `fallback: bedrock`. Check: T049 passes; every existing gateway test passes (feat/001-shared-state)
- [ ] T057 [US2] Extend preflight, the env templates, `operator.py`'s `ENV=shared`, and `make shared-state-roles` (Author-only). Check: T050 and T051 pass (feat/001-shared-state)
- [ ] T058 [P] [US2] Change `evals/twin_readiness.py`. Check: T052 passes; `make evals`'s exit status is unchanged by the report (feat/001-shared-state)
- [ ] T059 [US2] Write `infra/prod/rds.tf`, and the RDS endpoint's permit in the tunnel's server configuration. Check: T053 passes; `make infra-check` passes (feat/001-shared-state)
- [ ] T060 [P] [US2] Amend the other specs' living interfaces by name, each passage marked "(spec 001)":
  - spec 000's contracts/config-files.md (R1), contracts/env-files.md (`H4_HOST`, `GATEWAY_DB_URL`), and data-model.md (§2 to §7: the shared store, `host`);
  - spec 010's FR-001 and FR-026, and its Out list;
  - spec 007's FR-031's evidence.

  Check: the docs-links check passes; the reviewer reads each against the FRs it serves (plan §13) (feat/001-shared-state)
- [ ] T061 [P] [US2] Add the disclosure rows C2 and C13, and S2's shared-state change. Write `docs/runbooks/shared-state.md` (unreachable, the move, a restore from backup). Check: `disclosure_check` passes (FR-040, FR-056) (feat/001-shared-state)
- [ ] T062 Author: plan, verify, apply, and record RDS; write the role passwords to Parameter Store and the laptop's env file; run `make shared-state-roles`. Then the move (data-model.md §1.5):
  1. stop the laptop's paid route;
  2. run `make operator-status ENV=prod` and record its values;
  3. run `make operator-init ENV=shared` with them and a reason;
  4. release the cutover.

  Check: quickstart §6; nothing that wasn't zero starts at zero (FR-019) (main)
- [ ] T063 Close the group: review and note, with T048's run. Check: as T009 (feat/001-shared-state)

---

## Group 7: EC2 (US6, US3) — `feat/001-us6-ec2`

**Goal**: the very same compose stack on a spot EC2 without the model server, with the Anthropic API first and Bedrock second; the server action; releases on three hosts (FR-013, FR-023, FR-043 to FR-051, FR-067 to FR-069, FR-073). **Independent test**: quickstart §7.

### Tests first

- [ ] T064 [P] [US6] Extend `deploy/scripts/test_preflight.py`, `test_write_env.py`, and the compose policy's tests for the `ec2` class:
  - no model-server profile and no local `gateway-state`;
  - the IMDSv2 tag check, against a stub;
  - `write_env.py` refuses on a missing name, naming it, never a value;
  - the relay block bound only to EC2's private address, a literal.

  Check: RED (FR-043, FR-044, FR-050) (feat/001-us6-ec2)
- [ ] T065 [P] [US6] Extend `deploy/scripts/test_deployer.py` for three hosts:
  - EC2's boot run before the stack starts, and on a bucket it can't reach, its last release plus an alert;
  - digests per host's services;
  - the hold, rollback, and the record's `host`.

  Check: RED (FR-046 to FR-049) (feat/001-us6-ec2)
- [ ] T066 [P] [US6] Write `deploy/scripts/test_release.py`:
  - one build for `linux/amd64`, and for `linux/arm64` where the `hosts` field names a Graviton host;
  - upstream copies by index digest;
  - the red-team gate on all four adapters when a release makes hello or turns public;
  - a site build with drafts refused.

  Check: RED (FR-039, FR-048) (feat/001-us6-ec2)
- [ ] T067 [P] [US6] Write `infra/test/fixtures/prod-ec2/` and `infra/test/test_prod_ec2.py`:
  - EC2's launch template, spot persistent with `stop` (T11), and standard credits if burstable;
  - IMDSv2 (T13);
  - its single interface, and the security group admitting only the tunnel end;
  - the roles `h4-prod-ec2` and `h4-prod-gateway` (R-15);
  - the model action's second target, and the server action (`AWS-StopEC2Instance` on the tag).

  Check: RED (FR-013, FR-023, FR-069) (feat/001-us6-ec2)
- [ ] T068 [P] [US3] Write `evals/sc017_ec2_routes.py` and its test, with stand-ins for both paid APIs:
  - 100 turns with both healthy, answered by the Anthropic adapter;
  - with it failing, every admitted turn answered by Bedrock;
  - `fallback_day` unchanged;
  - provider, model, tokens, and cost on each span and ledger row.

  Check: RED (SC-017) (feat/001-us6-ec2)
- [ ] T069 [P] [US6] Extend the egress proxy's allowlist test for EC2's hosts: `api.anthropic.com`, Bedrock's endpoint, Telegram, the SMTP host, and the AWS endpoints, generated from the disclosure. Check: RED (FR-051) (feat/001-us6-ec2)

### Implementation

- [ ] T070 [US6] Write `deploy/hosts/` for EC2: cloud-init, systemd units (the deployer at boot, the egress proxy, the credential timer for `h4-prod-gateway`), nftables, and `daemon.json`. Add the `ec2` class to compose and preflight, and extend `write_env.py`. Check: T064 and T069 pass (feat/001-us6-ec2)
- [ ] T071 [US6] Extend `deploy/scripts/deployer.py` and `release.py`. Check: T065 and T066 pass (feat/001-us6-ec2)
- [ ] T072 [US6] Write `infra/prod/ec2.tf`. Write `ec2-market.tf` (EC2's spot), `iam.tf` (EC2's roles), and `killswitch.tf` (the model action's second target, the server action) as P-I4. Check: on a patched copy, T067 passes, and `make infra-check` passes (feat/001-us6-ec2)
- [ ] T073 [P] [US3] Write the SC-017 harness. Check: T068 passes against stand-ins (feat/001-us6-ec2)
- [ ] T074 [P] [US5] Make the disclosure's EC2 changes in the same commit as T070:
  - S2 (EC2's allowlist, C2), F1 (EC2's second route), F3 (EC2's first route, its trigger, default, and switch-off, the Author's words still required);
  - A1 and A2 from EC2, and D1's sentence;
  - V2's From, Why, Default, and switch-off;
  - C7.

  Write `docs/runbooks/ec2.md` and `deploy.md`. Check: `disclosure_check` passes; `make test` still fails while F3 holds its placeholder and a route names the Anthropic API (spec 010 FR-039) (feat/001-us6-ec2)
- [ ] T075 Author: apply P-I4; plan, verify, apply, and record EC2. Write its secrets, among them the Anthropic key in Parameter Store. Write his words into row F3 (spec 010). Set the Anthropic account's monthly spend limit at or under $20 where the account offers one, and record that it is set (FR-073). Run the first `make release`, then `make ec2-start` once group 9 exists, or the console before it. Check: quickstart §7 (FR-068) (main)
- [ ] T076 Author: run SC-017's recorded run, then destroy and recreate EC2. Check: SC-017; SC-005, the digests match and the shared state is unchanged (main)
- [ ] T077 Close the group: review and note. Check: as T009 (feat/001-us6-ec2)

---

## Group 8: the edge and the relay (US3, US5) — `feat/001-us3-us5-edge`

**Goal**: hareet.ai over TLS from the edge, the relay on the tunnel end picking the host, the disclosure live (FR-027 to FR-042, FR-061, FR-066, FR-075). **Independent test**: quickstart §8. The site stays unannounced until group 9 ends.

### Tests first

- [ ] T078 [P] [US3] Write `services/relay/test/**`, contracts/relay-http.md's suite, with stub hosts and a stub store:
  - the listeners and the peer rule;
  - the order of §3: the probe mark, the address, the cap, the kill switch's 10 s rule, the host, the forward and its headers;
  - the host choice's thresholds, and the retry on the other host only before the request was sent;
  - `no_host_serving`; a host's 502 or 504 becoming a 503 with its cause;
  - `handover_events` rows and the gap;
  - the status document;
  - no body kept, no address logged;
  - the kill switch reaching the relay within 10 s.

  Check: RED (FR-029 to FR-037, FR-054, FR-066; SC-008) (feat/001-us3-us5-edge)
- [ ] T079 [P] [US3] Extend `evals/breach.py` and its test: the relay, in `dev-relay` on dev-cpu, answers degraded within 10 s of the trip, and forwards again after the reset. Check: RED (FR-025) (feat/001-us3-us5-edge)
- [ ] T080 [P] [US5] Extend `apps/web/test_site.py`: no absolute URL to another host; the disclosure page matches the Markdown, with the new rows; `/_degraded/api.json` is spec 000's degraded body with `no_host_serving` and `stack` null. Check: RED (FR-038, FR-041, FR-066) (feat/001-us3-us5-edge)
- [ ] T081 [P] [US5] Write `evals/visitor_scan.py` and its test. It scans every store on each host, plus the shared state, the relay's logs, and the tunnel end's, for a marker message and address after a scripted visit. Check: RED (FR-042, SC-011) (feat/001-us3-us5-edge)
- [ ] T082 [P] [US3] Add red-team cases for hello and twin turns on the paid adapters, in `redteam/cases/`: claiming to be the Author, disparaging, revealing configuration. They run on the laptop's local model and fallback and on EC2's Anthropic API and Bedrock. Check: the cases load, and RED against a stub that fails them (FR-039) (feat/001-us3-us5-edge)
- [ ] T083 [P] [US3] Extend `apps/web`'s tier tests: `no_host_serving` and `host_error` show `cannot_talk.resting`, and `public_cap` shows `turn_refused.slow_down`. Check: RED (FR-066; spec 002's contract §3, amended by name) (feat/001-us3-us5-edge)
- [ ] T084 [P] [US3] Write `infra/test/fixtures/prod-edge/` and `infra/test/test_prod_edge.py`:
  - the zone and its records; the certificate;
  - the distribution's aliases, behaviors, origins (OAC; the VPC origin to the tunnel end's private interface), policies, and headers;
  - error responses (502 and 504 to 503 with `/_degraded/api.json`, TTL 0);
  - no access logs.

  Check: RED (FR-027 to FR-029) (feat/001-us3-us5-edge)

### Implementation

- [ ] T085 [US3] Write `services/relay/` (Fastify on Node 24, a second npm workspace, the gateway's pins), and `relay` in compose's `tunnel-end` and `dev-relay` profiles. Add its spans and metrics (`relay.request`, `h4.relay.host`, `h4.relay.requests`, `h4.relay.host_healthy`, `h4.serving_host`, `h4.cap.refused`). Check: T078 and T079 pass (FR-060) (feat/001-us3-us5-edge)
- [ ] T086 [US3] Write `infra/prod/{edge,dns,site}.tf`, and CloudFront's policies as P-I5 if the policy puts them in a protected file. Check: on a patched copy, T084 passes, and `make infra-check` passes (feat/001-us3-us5-edge)
- [ ] T087 [US5] Change `apps/web`: the status page's links, the disclosure page's new rows, and `/_degraded/api.json` built from spec 000's schema. Amend spec 002's contract §3 by name, with the tier mapping. Check: T080 and T083 pass (feat/001-us3-us5-edge)
- [ ] T088 [P] [US5] Write the visitor scan, and the red-team runner's support for the four adapters. Check: T081 and T082 pass (feat/001-us3-us5-edge)
- [ ] T089 [P] [US5] Add the disclosure rows V1, V2, V4, V6 to V9, C1, C14, and S15, in the same commit as T085 and T086. Enable the probe's schedule. Check: `disclosure_check` passes (FR-040, FR-061) (feat/001-us3-us5-edge)
- [ ] T090 Author: point the registrar's name servers at the zone and record it (contracts/infra-records.md §2). Apply P-I5 if any; plan, verify, apply, and record the edge; deploy the relay to the tunnel end. Run the red-team cases on all four adapters, and record that they pass. Confirm the tunnel end's measured memory on its `t4g.micro` (R-33). Check: quickstart §8 (FR-039) (main)
- [ ] T091 Close the group: review and note. Check: as T009 (feat/001-us3-us5-edge)

---

## Group 9: the handover (US4, US7) — `feat/001-us4-us7-handover`

**Goal**:
- one host at a time;
- EC2 woken when the laptop goes, and stopped when it serves;
- EC2's restarts guarded;
- the pause switch;
- both instances' spot interruptions handled.

(FR-063 to FR-066, FR-069 to FR-072, FR-076.) **Independent test**: quickstart §9.

### Tests first

- [ ] T092 [P] [US4] Write `infra/lambdas/ec2_start/test_start.py`, with stub SSM, Budgets, EC2, and Route 53:
  - step 1 refuses with `paused`;
  - step 2 with `server_budget_stopped`;
  - step 3 with `tunnel_end_down`;
  - step 4 with `laptop_serving`, when invoked by hand or `from: tunnel_end_back`;
  - step 5 starts only the tagged instance, and `start_failed` carries AWS's code;
  - one attempt per invocation;
  - one alert per outcome.

  Check: RED (FR-065, FR-070, FR-076) (feat/001-us4-us7-handover)
- [ ] T093 [P] [US7] Write `infra/lambdas/ec2_guard/test_guard.py`: it stops EC2 when the health check is healthy or the switch is off, does nothing otherwise, stops only the tagged instance, and alerts on each stop. Check: RED (FR-071) (feat/001-us4-us7-handover)
- [ ] T094 [P] [US4] Write `deploy/scripts/test_handover.py`, with a stub status and a stub EC2:
  - waiting reads `serving`, then stops EC2 once it is `laptop` and records the window;
  - serving stops EC2 again after a flap;
  - an expired session alerts once and keeps serving;
  - `make up` never fails on a failed stop.

  Check: RED (FR-063, FR-064) (feat/001-us4-us7-handover)
- [ ] T095 [P] [US4] Write `infra/test/fixtures/handover/` and `infra/test/test_handover.py`:
  - the health check on the tunnel end's address, port 8087, `/health`;
  - the alarm;
  - the rules: the alarm's change, EC2's warning, EC2's `running`, and the tunnel end's `running` to the start function and the alert;
  - the two functions' roles;
  - the pause parameter with `ignore_changes`;
  - each of these only in `failover*.tf` or `handover*.tf`.

  Check: RED (FR-012, FR-065, FR-072) (feat/001-us4-us7-handover)
- [ ] T096 [P] [US7] Write the tests of `make ec2-status`, `ec2-start`, `ec2-stop`, `ec2-autostart`, and `server-budget-restore`, with stubs: each is refused in an agent session; `ec2-start` invokes the function with `manual: true`; `ec2-autostart STATE=on` writes the switch, invokes the start once, and writes the audit row. Check: RED (FR-012, FR-065) (feat/001-us4-us7-handover)

### Implementation

- [ ] T097 [US4] Write `infra/lambdas/ec2_start/` and `ec2_guard/`. Check: T092 and T093 pass (feat/001-us4-us7-handover)
- [ ] T098 [US4] Write `deploy/scripts/handover.py`, started by `make up ENV=prod` and stopped by `make down ENV=prod`, with `h4.handover.window_seconds`. Check: T094 passes (FR-060) (feat/001-us4-us7-handover)
- [ ] T099 [US4] Write `infra/prod/failover.tf` and `infra/account/handover.tf` as P-I6. Check: on a patched copy, T095 passes, and `make infra-check` passes (feat/001-us4-us7-handover)
- [ ] T100 [P] [US7] Write the `make ec2-*` and `server-budget-restore` targets. Check: T096 passes (feat/001-us4-us7-handover)
- [ ] T101 [P] [US4] Write `docs/runbooks/handover.md` and `spot-interruption.md`, and update `tunnel-end.md`. Add the disclosure row C6 and C5's change. Check: each alert kind of contracts/aws-alerts.md §2 names its runbook; `disclosure_check` passes (FR-040, FR-056) (feat/001-us4-us7-handover)
- [ ] T102 Author: apply P-I6; plan, verify, apply, and record; set the pause switch `on`. Check: User Story 1's scenario 10, a fresh plan after a handover shows no change (FR-072) (main)
- [ ] T103 Author: rehearse the handover and the interruptions, as quickstart §9 lists them:
  - ten handovers each way (SC-007);
  - the pause and the guard;
  - five spot interruptions of EC2 and three of the tunnel end (SC-018), through AWS's fault-injection service or the console's interruption test, as priced in T015.

  Check: SC-007, SC-018 (main)
- [ ] T104 Author: write the resting message's new words through spec 002's follow-up (plan Q5, provisional; P-5), or keep them. Then make the first public release. Check: SC-001 over a day; SC-010 with the browser's network log; SC-011's visitor scan (main)
- [ ] T105 Close the group: review and note, with the rehearsals' records. Check: as T009 (feat/001-us4-us7-handover)

---

## Group 10: the public view and the dashboard (US8) — `feat/001-us8-public-view`

**Goal**: the public view never goes dark, and the "Hosts" row shows the design running (FR-057 to FR-060). **Independent test**: quickstart §10.

- [ ] T106 [P] [US8] Write `deploy/scripts/test_snapshot.py`:
  - the sink refuses each forbidden kind of field;
  - it writes the cloud part while no host serves;
  - a stale host part keeps its time;
  - the publisher posts only while its host serves, read from the relay's status.

  Check: RED (FR-057 to FR-059) (feat/001-us8-public-view)
- [ ] T107 [P] [US8] Extend `apps/web`'s tests for `/status/`: it renders each part with its time, names `none` while no host serves, shows the handovers and their gaps, and shows the server's month beside its budget and model spend beside the ceilings. Check: RED (SC-013) (feat/001-us8-public-view)
- [ ] T108 [US8] Write `snapshot_publisher.py` and `snapshot_sink.py`, their compose services (the publisher on both hosts, the sink on the tunnel end), and the sink's write grant. Check: T106 passes (feat/001-us8-public-view)
- [ ] T109 [US8] Write `/status/`, and the Grafana "Hosts" row of plan §11:
  - which host serves, the handovers, EC2's state and interruptions, the health check, and the tunnel;
  - the shared state's latency and errors by host, and the relay's requests;
  - the server's month against its budget beside model spend, and the adapter's month;
  - the release per host, and telemetry delayed or lost.

  Check: T107 passes; the dashboard's provisioning test passes (FR-059, FR-060) (feat/001-us8-public-view)
- [ ] T110 Author: with both hosts off for an hour, check `/status/`; then start a host and check that the values are fresh within 5 minutes. Check: SC-013 (main)
- [ ] T111 Close the group: review and note. Check: as T009 (feat/001-us8-public-view)

---

## Group 11: the close (Polish) — `feat/001-close`

- [ ] T112 [P] Write the success-criteria table in spec.md's merge-request note, with each SC, its run, and its record. Complete the runbooks: every alert of this spec names one (FR-056). Check: the docs-links check passes (feat/001-close)
- [ ] T113 [P] Link the README to the ADRs, the public view, and the disclosure. Check: SC-014, two clicks from the README (feat/001-close)
- [ ] T114 [P] Bring the matrix to zero planned rows. Check: `make check`'s matrix summary shows zero failures and zero planned rows (feat/001-close)
- [ ] T115 Author: after the first full month, read AWS's cost data and the meter. Check: SC-002, the server's cost against his figure; SC-003, model spend against the ceilings, with Bedrock's and the Anthropic account's usage each at or under the meter; SC-016, from `handover_events` and EC2's state history (main)
- [ ] T116 Author: the credential audit's weekly results, and every infrastructure change's block and record. Check: SC-004, SC-012 (main)
- [ ] T117 Author: apply P-4, his own words for intent 000's cost and hosting constraints and this folder's intent's cost lines, whenever he chooses (spec Assumptions, "The intents' lines"). Check: the intents read as he wrote them (main)
- [ ] T118 Close: review and the final note. Check: spec 001 is done when SC-001 to SC-018 pass (but SC-015, moved) and the matrix shows zero failures and zero planned rows (feat/001-close)

---

## Dependencies and execution order

- **T000** first, then the groups in order: each branch is cut from `refs/heads/main` after the one before it merges.
- **T016** (the constitution) comes before T021, the first file under `infra/`.
- **Within a group,** the tests come first and fail, then the code, then the Author's steps, then the close.
- **Cross-group dependencies:**
  - group 5 needs group 4's alert path for the tunnel end's warning;
  - group 6 needs group 5's tunnel for the laptop's connection to the store;
  - group 7's server action and model-action target need EC2's role, and its first release needs group 6's store;
  - group 8's relay needs groups 5 to 7;
  - group 9's loop reads the relay's public status;
  - group 10's sink needs the relay and the shared state.
- **What can run in parallel:** inside a group, the [P] tasks. Across groups, nothing, since each group's branch builds on the last.

## The Author's tasks, in one list

| Task | What |
|---|---|
| T000 | approve the spec and the plan; confirm or overturn plan Q5 to Q7 |
| T007, T008 | choose the Terraform pins; apply P-1 and P-3; seed the mirror |
| T015 | price the lines; set the server budget's figure |
| T016 | apply the constitution 1.1.0 as amended; accept ADR 0044 |
| T024 | apply the bootstrap: state, budgets, alerts; migrate the state; the tags; the email subscription |
| T032 | apply the safety net; import the laptop's Bedrock identity; the Telegram parameters; the rehearsals |
| T045 | apply the tunnel end; the tunnel keys; the scans |
| T062 | apply RDS; the role passwords; move the meter |
| T075, T076 | apply EC2 and its IAM; the secrets; his F3 words; the Anthropic account's limit; the first release; SC-017; SC-005 |
| T090 | the name servers; apply the edge; the red-team runs |
| T102 to T104 | apply the handover's IAM and functions; the rehearsals; the resting words; the first public release |
| T110 | the public view's hour |
| T115 to T117 | the month's measurements; the audit; the intents' words |
