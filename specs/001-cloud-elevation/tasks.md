---

description: "Task list for spec 001, Cloud Elevation (a draft, with the plan, for the Author's approval)"
---

> **Superseded on 2026-11-09.** Spec 001 was reworked that day around the Author's decisions (ADR 0044, proposed: EC2 is prod's default host); these tasks are the September design's (the laptop serves, the cloud is a thin control plane) and wait for a re-plan, kept unedited below as the record.

# Tasks: Cloud Elevation — Terraform, One Account, Same Compose Stack

**Status**: **A draft, generated on 2026-10-18 from the draft plan, before the Author's approval.** It assumes each recommended answer of the plan interview ([research.md](research.md#the-plan-interview-to-ask)). A task an answer could change carries that question's tag, **[Q1]** to **[Q9]**: a different answer changes those tasks and no others. No task starts before the Author approves the plan (CLAUDE.md: "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`").

**Input**: the design documents in `specs/001-cloud-elevation/`: plan.md, research.md, data-model.md, contracts/ (eight), quickstart.md.

**Prerequisites**: the Author's approval of plan.md, with the interview's answers recorded; spec 000's SC-001 re-run and SC-002 before Phase 4 ([Q1]).

**Tests**: required. The constitution's workflow writes tests with or before code. In each phase, the test tasks come first and must fail before the code that makes them pass; each merge-request note records that RED run.

**Organization**:
- One phase per task group of plan §14, each one feature branch, merged by the Author in phase order. The user stories map onto them: US1 in Phases 1–2, US2 in Phase 3, US5 in Phase 4, US6 in Phase 5, US3 and US4 in Phase 6, US7 in Phase 7.
- Each phase's last task is its merge-request note in `docs/merge-requests/`, carrying `make check`'s whole output and a reviewer agent's REVIEW.md passes (spec 000 FR-041). Each phase that changes `infra/` also carries the Author's redacted plan block (FR-005).

## Format: `[ID] [P?] [Story?] [Qn?] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task).
- **[USn]**: the user story the task serves.
- **[Qn]**: the plan-interview question whose answer could change the task.
- **Author**: only the Author runs it, in their own terminal: anything that needs AWS, the registrar, the host's Docker, the GPU, real alert delivery, or an operator token. **Heavy** marks the ones that load a model or bring up a stack.
- **Patch**: a change to a human-only path (`.claude/**`, `CLAUDE.md`, `tools/gates/**`, `config/budgets*`, `config/alert*`, `config/prices*`, `deploy/agents-engine/**`, `evals/agent-config/**`, and this spec's protected Terraform files once Phase 1's patch protects them). The task writes the change into a patch file under `docs/merge-requests/`, verified in a scratch worktree, and the Author applies it.

## Path conventions

- Terraform: `infra/{bootstrap,account,prod}/`, `infra/modules/`, `infra/lambdas/`, `infra/policy/`.
- The relay: `services/relay/` (`src/`, `test/unit/`, `test/contract/`, `test/integration/`). The gateway: `services/gateway/`.
- Compose and host files: `deploy/` (`tunnel/`, `vm/`, `otel/`, `edge/`, `scripts/`). The site: `apps/web/`.
- "§" means plan.md unless another file is named.

---

## Phase 1: The guards, before any infra file — branch `feat/001-guards`

**Purpose**: every deny lands before its risk (§2; spec 000 plan §15's rule). No `infra/` file exists until the Author has applied this phase's patch.

**Independent test**: an agent session's `make check` shows every new matrix row passing and `infra-check` PLANNED (quickstart §1).

### Tests for the guards (write first; they fail until the patch)

- [ ] T001 [P] [US1] Add stage H rows to `redteam/forbidden-actions.sh` for each FR-006 spelling in research.md R-16: the subcommands (`refresh`, `taint`, `untaint`, `force-unlock`, `test`, `state replace-provider`, `workspace new|delete`, `init -migrate-state|-force-copy|-reconfigure`), and the spellings (`-chdir`, `tofu`, `terragrunt`, a path to the binary, `command`/`exec`/`env`/`nice`/`timeout`/`xargs`, `bash -c`, `sh -c`, a subshell, quoting, `TF_CLI_ARGS*`), each as PLANNED until T005 lands; add a gap row for any spelling the new rule can't catch, per FR-006 and CLAUDE.md's bash-gate rule
- [ ] T002 [P] [US1] Add stage H and Edit rows to `redteam/forbidden-actions.sh` for FR-011's list in contracts/env-cloud.md §8 (each variable name, each path in `denyRead` and `denyWrite`) and FR-012's protected files (`infra/**/{iam,budgets,alerts,killswitch,edge-limits}*.tf`, `infra/policy/**`), and stage S rows that read each path from inside the sandbox, per FR-011, FR-012
- [ ] T003 [P] [US1] Add rows refusing the Author-only targets (`infra-verify`, `infra-record`, `infra-audit`, `infra-mirror`, `secrets-check`, `release`, `rollback ENV=cloud`, `cloud-session`, `tunnel-keys`, `tunnel-revoke`, and `operator-* ENV=cloud`) to `redteam/forbidden-actions.sh`, per §2
- [ ] T004 [P] [US1] Add the canary's new names (contracts/env-cloud.md §8) to `make matrix-canary`'s fake environment, per spec 000 FR-007

### The patch

- [ ] T005 [US1] **Patch** `docs/merge-requests/<date>-feat-001-guards.patch`, part 1, `.claude/hooks/bash-gate.sh`: extend the `tf_sub` rule and its prefix matching to every spelling of T001, and refuse T003's targets, per research.md R-16 and §2
- [ ] T006 [US1] **Patch**, part 2, `.claude/settings.json`: the `denyRead`, `denyWrite`, `Read(...)`, and `Edit(...)` denies on `*.tfstate*`, `*.tfplan`, `*.tfvars*`, and the write-deny on `~/.local/share/h4reet/terraform-providers`; `credentials.envVars` gains contracts/env-cloud.md §8's names, per FR-011
- [ ] T007 [US1] **Patch**, part 3, `.claude/hooks/protected-paths.sh`: `infra/**/{iam,budgets,alerts,killswitch,edge-limits}*.tf` and `infra/policy/**`, per FR-012 and research.md R-14
- [ ] T008 [P] [US1] **Patch**, part 4, `tools/gates/infra_policy.py` with `tools/gates/test/test_infra_policy.py` and fixtures in `infra/policy/fixtures/` (HCL and plan JSON, passing and failing), per contracts/infra-records.md §5 and research.md R-14: default tags, the protected resource types only in protected files, no public bucket, no open security group but the tunnel's port, no provisioner or `external`/`http` data source, exact provider pins, no account-ID, email, or key literal, and (T9) no Terraform-managed SecureString parameter and no data source that reads a secret (FR-009, research.md R-26)
- [ ] T009 [P] [US1] **Patch**, part 5, `tools/gates/infra_redact.py` and its tests, per contracts/infra-records.md §2
- [ ] T010 [P] [US1] **Patch**, part 6, `tools/gates/infra_plan_note.py` and its tests, and the `infra-plan-note` step in `tools/gates/gate` and in `make check`'s runner list, per contracts/infra-records.md §3 and FR-005
- [ ] T011 [P] [US1] **Patch**, part 7, `tools/gates/disclosure_check.py` and its tests: each disclosure row's machine-readable tag against compose services on `egress` or in the `tunnel`/`cloud` profiles, sshd's `PermitListen`/`PermitOpen`, the egress allowlist, and Terraform's outward resources, per §8.2 and FR-040
- [ ] T012 [US1] **Patch**, part 8, `tools/gates/matrix-required.txt`: the row IDs of T001–T004; and `CLAUDE.md`'s infra line and its "Things Claude gets wrong" entry, per §2
- [ ] T013 [P] [US1] Add `python-hcl2` to `.devcontainer/requirements-tools.in` and regenerate the hashed `requirements-tools.txt`; add the Terraform and AWS CLI pins to `.devcontainer/toolchain.vars` and the devcontainer's `Dockerfile` (the versions T016 records), with `tools/gates/toolchain_check.py`'s knowledge of them in the patch, per FR-004
- [ ] T014 [P] [US1] Add `make infra-mirror` (Author), `make infra-check` (fmt, `init -backend=false`, validate, and the policy against the mirror; PLANNED until the mirror exists, naming T016), `make plan` without `ROOT` running `infra-check`, and `make plan ROOT=<root>` running `infra_policy.py` on the root's HCL before `terraform init`, refusing on a finding, then again on the saved plan's JSON, to `Makefile`, per contracts/infra-records.md §1 and §5
- [ ] T015 [US1] Verify the patch in a detached scratch worktree: `git apply --check`, then `make check` on the patched tree and `gitleaks dir` on it (the rehearsal rule), recording the T001–T004 rows going from PLANNED to PASS
- [ ] T016 [US1] **Author**: choose and record the Terraform and `hashicorp/aws` versions (from the Author's terminal, the only place with registry access); apply the patch; `claude doctor`; `make git-hooks`; `make tools`; `make infra-mirror`; the agent-config evals once, per quickstart §1
- [ ] T017 [US1] Merge-request note `docs/merge-requests/<date>-feat-001-guards.md`, with the patch's verification, `make check`'s whole output, and the reviewer's passes

**Checkpoint**: the guards are live; `infra/` may now be written.

---

## Phase 2: The bootstrap and the first apply (User Story 1, Priority P1) — branch `feat/001-us1-bootstrap`

**Goal**: the state bucket, the budgets, the anomaly monitor, and the alert topic, in one first apply; the plan-in-note and the recorded apply working end to end.

**Independent test**: quickstart §2: the gate's `infra-plan-note` passes with the Author's block; the apply creates exactly the plan; the state migrates; the record matches; the audit is clean.

### Tests for User Story 1 (first)

- [ ] T018 [P] [US1] **Patch** `tools/gates/test/test_infra_verify.py` and `test_infra_record.py`: the saved plan's tree hash and redacted rendering against a note's block (match, stale tree, edited block, unredacted value); the record's fields and redaction; refusal off `main` or on a dirty tree, per contracts/infra-records.md §4 and §6
- [ ] T019 [P] [US1] `infra/lambdas/credential_audit/test_audit.py`, with stubbed IAM responses: each finding of contracts/infra-records.md §7, a clean run, no key ID in the output, per FR-008 and data-model.md §6.6

### Implementation for User Story 1

- [ ] T020 [US1] **Patch** `tools/gates/infra_verify.py` and `tools/gates/infra_record.py`, and the `make infra-verify` and `make infra-record` targets (agent-editable Makefile lines calling the human-only scripts through `PY_HOST`), per contracts/infra-records.md §4 and §6, FR-007
- [ ] T021 [P] [US1] `infra/lambdas/credential_audit/` (stdlib Python, a Lambda container image on arm64) and `make infra-audit`, per contracts/infra-records.md §7; and `make secrets-check` (the Author's terminal: `ssm:DescribeParameters` over the expected `/h4reet/cloud/*` names, by name and type only, never a value), per contracts/env-cloud.md §1 and research.md R-26
- [ ] T022 [P] [US1] `infra/bootstrap/{main,variables,outputs,versions}.tf`: the provider with `default_tags`, the local backend with its migration comment, the state bucket (versioning, SSE-S3, Block Public Access, the TLS-only and Author-only bucket policy, S3's lock file), per research.md R-03 and FR-001, FR-003
- [ ] T023 [US1] `infra/bootstrap/budgets.tf` and `alerts.tf` (protected; written in this branch as new files, then protected by T007's rule from the next change on): the five budgets, the anomaly monitor and its subscription, the `h4-alerts` topic and its email subscription from a sensitive variable, per §3.1, research.md R-22 and R-23, FR-022
- [ ] T024 [P] [US1] `infra/README.md`: the roots, the state, the plan block, the apply sequence, the records, the protected files, per §1
- [ ] T025 [P] [US1] `docs/runbooks/infra-apply.md` (a failed apply, a held lock, a stale plan) and `docs/runbooks/credential-audit.md`, per FR-056
- [ ] T026 [US1] Write `.terraform.lock.hcl` for `infra/bootstrap` from the mirror (`terraform providers lock` against it), and run `make infra-check` to PASS
- [ ] T027 [US1] **Author**: quickstart §2: the run-time values file, `make plan ROOT=bootstrap` and its block into this phase's note, then after the merge `make infra-verify`, the apply, `init -migrate-state`, `make infra-record`, the SNS confirmation, the cost-allocation tags, `make infra-audit`
- [ ] T028 [US1] Merge-request note `docs/merge-requests/<date>-feat-001-us1-bootstrap.md`, with the plan block, `make check`, and the reviewer's passes

**Checkpoint**: the safety net's first half is applied before anything else that costs money (FR-022).

---

## Phase 3: One ceiling for everything (User Story 2, Priority P1) — branch `feat/001-us2-safety-net`

**Goal**: the provider-side kill switch and its rehearsal, AWS-side alerts on Telegram, the probe, the registry and release bucket, and infrastructure cost on the meter.

**Independent test**: quickstart §3: the rehearsal attaches the deny to its target and alerts on both channels (SC-009); the gateway books a daily `infra` row and a correction.

### Tests for User Story 2 (first)

- [ ] T029 [P] [US2] Gateway integration tests on PGlite in `services/gateway/test/integration/infra-booking.test.ts`: the daily `infra` row at the first admission or sweep of a UTC day, `cost_basis = estimate`; the correction booked upward only, to the month meter only; admission refusing metered calls when metered plus infra reaches $5 for the day or $20 for the month; `fallback_day` untouched, per data-model.md §2.2 and §4, FR-020
- [ ] T030 [P] [US2] `services/gateway/test/unit/budgets-config.test.ts`: the new `infra` and `public` sections of `config/budgets.yaml` validated, and refused when malformed, per data-model.md §4
- [ ] T031 [P] [US2] `infra/lambdas/alert_bridge/test_bridge.py`: each SNS notice of contracts/aws-alerts.md §2 becomes one Telegram message in spec 000's format, against a stub Bot API; no token or chat ID in its logs
- [ ] T032 [P] [US2] `infra/lambdas/probe/test_probe.py`: the probe's header, its 5 s bound, a failure raising so the function's `Errors` metric counts it, per contracts/aws-alerts.md §4 and FR-061

### Implementation for User Story 2

- [ ] T033 [US2] `services/gateway/migrations/0004_infra.sql`: the `infra` attribution, the `estimate` and `billing_correction` cost bases, and the view's two columns, per data-model.md §2.1–§2.3
- [ ] T034 [US2] The daily booking and the correction in `services/gateway/src/meter/` (the sweep, admission, and a new `infra.ts`), reading `h4-infra-actual` through `budgets:DescribeBudget` with the SDK's default credential chain, per data-model.md §4 and research.md R-21
- [ ] T035 [US2] **Patch** `config/budgets.yaml`: `infra.month_estimate_usd` (from research.md R-05, [Q3]) and the relay's `public` section (contracts/relay-http.md §4's defaults); the schema version and the gateway's validator change in this branch, per data-model.md §4
- [ ] T036 [P] [US2] `infra/account/killswitch.tf` (protected): `h4-deny-paid-models`, the budget action on `h4-account-month`, its execution role, the rehearsal budget and target behind `rehearsal`, per contracts/aws-alerts.md §3 and FR-023, FR-026
- [ ] T037 [P] [US2] `infra/lambdas/alert_bridge/` and its subscription and permissions in `infra/account/{lambdas,iam,alerts}.tf`; the EventBridge rule for ACM's expiry events, per contracts/aws-alerts.md §1–§2 and research.md R-23
- [ ] T038 [P] [US2] `infra/lambdas/probe/`, its schedule (disabled until Phase 6) and its alarm, per contracts/aws-alerts.md §4 and research.md R-24
- [ ] T039 [P] [US2] `infra/account/registry.tf`: the ECR repositories (one per service, and `upstream/`), the lifecycle rule keeping each repository's last 3 releases' images, and the release bucket with its Author-write, VM-read policy, per contracts/releases-deployer.md §2
- [ ] T040 [P] [US2] `infra/modules/lambda-image/`, used by T037, T038, and T021's function, per §1.1
- [ ] T041 [P] [US2] Runbooks: `docs/runbooks/aws-budget.md` (warning, breach, the action executed, restoring after the incident note), `aws-anomaly.md`, `probe-failing.md`, `certificate-expiry.md`, per contracts/aws-alerts.md §3.3 and FR-056
- [ ] T042 [US2] **Author**: quickstart §3: the Telegram parameters, the `budgets.yaml` patch, apply `account` with `rehearsal = true`, the rehearsal's record (SC-009), apply with `rehearsal = false`, the probe's early alarm
- [ ] T043 [US2] Merge-request note `docs/merge-requests/<date>-feat-001-us2-safety-net.md`, with the plan block, the rehearsal's record, `make check`, and the reviewer's passes

**Checkpoint**: an AWS-side breach revokes paid models at the provider, rehearsed; infrastructure cost counts against the ceilings.

---

## Phase 4: The same compose stack on a cloud VM (User Story 5, Priority P1) — branch `feat/001-us5-cloud-vm`

**Goal**: the VM runs `deploy/compose.yaml` as the `cloud` stack, with the fallback gateway holding the meter of record, the relay (not yet public), the egress proxy, releases, and the deployer.

**Independent test**: quickstart §4: the first release comes up by pull; the meter moves with carried values; hello answers through the relay with a full trace; destroy and recreate gives the same digests and meters (SC-005); the breach test asserts the relay's side (SC-008).

**Waits for**: spec 000's SC-001 re-run and SC-002 ([Q1]).

### Tests for User Story 5 (first)

- [ ] T044 [P] [US5] Gateway tests: the `cloud` stack name with `H4_ENV=prod` (and exit 78 otherwise); `prod-cloud` with no primary going straight to the fallback's admission and recording the relay's reason; FR-018's refusals (a paid route anywhere but `prod-cloud`); the relay as a trusted `X-Forwarded-For` peer on `cloud` only, per data-model.md §3 and contracts/env-cloud.md §6
- [ ] T045 [P] [US5] The relay's contract suite in `services/relay/test/contract/` with a stub store, a stub fallback gateway, and a stub local path: contracts/relay-http.md §11's cases (the order of §3, the cap, the kill switch's 10 s rule and fail-closed, the path's fallback-once, a local 502 answered as a degraded 503 and never a 502 or 504, `X-H4-Path`, the status document, the edge listener's peer rule on `H4_STACK=cloud`, the internal listener's fixed identity, no body kept, no address in any log line)
- [ ] T046 [P] [US5] `deploy/scripts/test_deployer.py` with a stub engine and a stub source: only changed services restart; a failed health check returns to the previous release and alerts; the hold (FR-049); the record's fields; a digest mismatch refused, per contracts/releases-deployer.md §3–§5
- [ ] T047 [P] [US5] `deploy/scripts/test_release.py`: `make release`'s refusals (not `main`, dirty, not gated, a lock digest that differs), its record, and the `<account>` redaction, against stubs, per contracts/releases-deployer.md §1–§2
- [ ] T048 [P] [US5] `deploy/scripts/test_egress_proxy.py`: CONNECT allowed only to the allowlist's hosts; the allowlist generated from the disclosure's tagged rows, per research.md R-10 and contracts/tunnel.md §8
- [ ] T049 [P] [US5] Preflight and compose-policy tests (`deploy/scripts/test_preflight.py`; **Patch** for `tools/gates/test/test_compose_policy.py`): the cloud class's profiles (P6), the `local` profile on prod, dev, and dev-cpu, the literal bindings allowed only on cloud's three services, FR-018, per contracts/env-cloud.md §3 and §5
- [ ] T050 [P] [US5] Extend `evals/breach.py` with the relay's assertions on dev-cpu: degraded within 10 s of the trip without forwarding, forwarding after the reset, 100% degraded with the store stopped, per FR-025 and quickstart §4.4

### Implementation for User Story 5

- [ ] T051 [US5] The gateway's `cloud` stack, `prod-cloud`, and the trusted relay peer (`services/gateway/src/config/`, `src/core/router.ts`, `src/routes/hello.ts`), per data-model.md §3
- [ ] T052 [US5] `config/routing.yaml`: `prod-cloud: { fallback: bedrock }`; `prod` keeps `primary: local` with no fallback; the schema's comment restated, per research.md R-20 and FR-017
- [ ] T053 [US5] `services/relay/`: the workspace, `src/` per contracts/relay-http.md §1–§10 (the two listeners, the edge listener's peer rule, the internal listener's fixed test identity, the address from `CloudFront-Viewer-Address`, the cap, the kill switch through `relay_ro`, the path and its health state machine of data-model.md §7.1, the status document, telemetry), the `Dockerfile` building on the build platform, per research.md R-18
- [ ] T054 [US5] The role `relay_ro` and its grant (`services/gateway/migrations/0004_infra.sql` or a `0005`), per data-model.md §2.4
- [ ] T055 [US5] `deploy/compose.yaml`: the `relay` (profiles `cloud`, `dev-relay`), `tunnel-end` and `snapshot-sink` (profile `cloud`) services; the heavy services into the `local` profile; the cloud literal bindings; the cloud `edge` config (admin only), per contracts/env-cloud.md §3 and §6.2
- [ ] T056 [US5] `deploy/env.example/cloud.env.example`, and each local template's `COMPOSE_PROFILES` gaining `local`, per contracts/env-cloud.md §1–§3
- [ ] T057 [US5] `deploy/scripts/preflight.py`: the cloud class (P6 and the bindings), and FR-018's refusal; **Patch** for `tools/gates/compose_policy.py`'s cloud rules, per contracts/env-cloud.md §5
- [ ] T058 [US5] `deploy/otel/collector-cloud.yaml`: the file-backed queue on the meter's volume, export through the tunnel's 2202, and spec 000's redaction, per research.md R-25
- [ ] T059 [P] [US5] `deploy/scripts/egress_proxy.py` and its allowlist generator, per research.md R-10
- [ ] T060 [P] [US5] `deploy/scripts/deployer.py`, `release.py` (copying only the upstream images the cloud stack runs), and `assume_gateway_role.py`, and the `make release`, `make rollback`, `make deployer-resume`, and `make deployer-install` targets, per contracts/releases-deployer.md and contracts/env-cloud.md §7
- [ ] T061 [P] [US5] `deploy/vm/`: cloud-init, `write-env.py` (refusing while an expected parameter is missing), `daemon.json` (`userland-proxy: false`, the fixed address pool), the systemd units (the deployer's timer, the egress proxy, the credentials timer, the aws-events poller), and the nftables rules in two chains, with `deploy/vm/test_vm.py` on the rules' text first, per §6.2–§6.3, contracts/env-cloud.md §1 and §7, and contracts/tunnel.md §8
- [ ] T062 [US5] [Q2] [Q3] [Q6] `infra/prod/{main,network,vm,volumes,ssm}.tf` and `iam.tf` (protected): the VPC, the private and public subnets, the two interfaces with fixed addresses and the Elastic IP, the security groups, the spot launch template with standard CPU credits, the meter's volume with `prevent_destroy` and its snapshots, the instance and gateway roles (FR-013's replacement) with the instance role's read grant on `/h4reet/cloud/*`, and the two bucket-name `String` parameters; no secret parameter, which the Author creates outside Terraform, per §6 and research.md R-04, R-07, R-15, R-26
- [ ] T063 [US5] `scripts/operator.py`'s cloud ports (18500–18504), `make cloud-session`, and `make hello ENV=cloud`, per data-model.md §2.5 and contracts/env-cloud.md §7
- [ ] T064 [US5] The disclosure's rows for this phase's flows (C2, C6, C7, C9, C10, C13, C14, and F1, F2, A1, A2's changes), with their machine-readable tags, per §8.2 and FR-040
- [ ] T065 [US5] Telemetry: `h4.relay.*`, `h4.deploy.events`, `h4.release.info`, and the "Cloud" dashboard row's first panels in `deploy/grafana/dashboards/h4-runtime.json`, per §9
- [ ] T066 [P] [US5] Runbooks: `docs/runbooks/cloud-vm.md` (a spot interruption, a replacement, the egress proxy, a failed deploy and rollback), per FR-056
- [ ] T067 [US5] **Author** (Heavy): quickstart §4: QEMU once; apply `prod` without the edge; the secrets with `aws ssm put-parameter` and `make secrets-check`; the VM's firewall checks; `make release`; local prod without a fallback, then the meter's move with carried values; delete the hand-made identity ([Q6]); destroy and recreate (SC-005); the memory fit ([Q3])
- [ ] T068 [US5] Merge-request note `docs/merge-requests/<date>-feat-001-us5-cloud-vm.md`, with the plan block, the breach test, `make check`, and the reviewer's passes

**Checkpoint**: the meter of record lives on the VM; the cloud stack answers through the relay, by fallback, to the Author's session only.

---

## Phase 5: The local tier joins without opening a port (User Story 6, Priority P2) — branch `feat/001-us6-tunnel`

**Goal**: the outbound tunnel, the local `edge`'s tunnel blocks, the relay's local path, and the local deployer.

**Independent test**: quickstart §5: a hello answers locally through the tunnel; the scan finds no open port (SC-006); the cut falls back within 5 s and recovers after three checks (SC-007); revocation works in one action.

### Tests for User Story 6 (first)

- [ ] T069 [P] [US6] `deploy/tunnel/test_tunnel.py`, two containers on the agents' engine: a permitted forward works; a forward outside `PermitListen`/`PermitOpen` is refused; no shell, command, or subsystem opens; a wrong host key is refused; a revoked key is refused, per contracts/tunnel.md §3–§4 and §7
- [ ] T070 [P] [US6] `deploy/scripts/test_edge_tunnel.py`: the local `edge`'s 8085 and 8086 blocks accept only their routes and their own token, carry `X-H4-Viewer` into `X-Forwarded-For` after the check, drop `X-H4-Client`, and refuse without the token, per contracts/tunnel.md §5
- [ ] T071 [P] [US6] The relay's local-path tests: the health state machine (unhealthy after one failure, healthy after three), fallback once on failure, timeout, or degraded, with `X-H4-Local-Path`, per contracts/relay-http.md §6 and data-model.md §7.1

### Implementation for User Story 6

- [ ] T072 [US6] `deploy/tunnel/`: the `Dockerfile` (one image, two roles), `sshd_config`, `ssh_config`, and the entrypoints, per contracts/tunnel.md §2–§4
- [ ] T073 [US6] `deploy/compose.yaml`: the `tunnel` and `snapshot-publisher` services in the `tunnel` profile; `deploy/edge/nginx.conf`'s 8085 and 8086 blocks, per contracts/tunnel.md §5 and contracts/env-cloud.md §4
- [ ] T074 [US6] The relay's local path in `services/relay/src/path/`, per contracts/relay-http.md §6
- [ ] T075 [US6] `make tunnel-keys` and `make tunnel-revoke` (Author), per contracts/tunnel.md §7
- [ ] T076 [US6] The local deployer's user units (`make deployer-install ENV=prod`), its hold for `make up REF=`, per contracts/releases-deployer.md §3 and FR-049
- [ ] T077 [US6] Telemetry: `h4.tunnel.up` and `h4.tunnel.reconnects` from both ends, and the Cloud row's tunnel panel, per contracts/tunnel.md §6
- [ ] T078 [US6] The disclosure's rows C1, C3, C4, C5, and S1, S2's changes, with their tags, per FR-040
- [ ] T079 [P] [US6] `docs/runbooks/local-tier.md` (wake, WSL2 restart, `make up`, the tunnel's recovery, the local deployer) and `docs/runbooks/tunnel.md` (down, revoked, rotation), per FR-056
- [ ] T080 [US6] **Author** (Heavy): quickstart §5: `make tunnel-keys`, prod up with the tunnel, a hello through it, the scan (SC-006), the cut (SC-007), revocation, the runbook after a `wsl --shutdown`
- [ ] T081 [US6] Merge-request note `docs/merge-requests/<date>-feat-001-us6-tunnel.md`, with `make check`, the timings, and the reviewer's passes

**Checkpoint**: visitors' requests can be answered locally; nothing listens on the local tier.

---

## Phase 6: The site answers, and says what leaves the device (User Stories 3 and 4, Priority P1) — branch `feat/001-us3-us4-public`

**Goal**: the domain, the certificate, the distribution with its VPC origin, the placeholder site with the disclosure, and hello public after its red-team cases.

**Independent test**: quickstart §6: SC-001 (the local tier off), SC-010 (the browser's hosts), SC-011 (nothing kept).

### Tests for User Stories 3 and 4 (first)

- [ ] T082 [P] [US4] `apps/web/test_site.py`: no absolute URL to another host in the built site; the disclosure page's rows equal `docs/data-flow-disclosure.md`'s; every page links the disclosure; no cookie or storage API in the site's script, per FR-038, FR-041, FR-042
- [ ] T083 [P] [US3] `redteam/cases/hello-*.yaml`: claiming to be the Author or the twin, disparaging, revealing configuration, per FR-039
- [ ] T084 [P] [US4] `evals/test_visitor_scan.py`: the scan's store list and its counts-only output, against fixtures, per quickstart §6.6
- [ ] T085 [P] [US3] `deploy/scripts/test_release.py` grows: from this phase on, `make release` refuses without a passing hello record for the commit, per FR-039

### Implementation for User Stories 3 and 4

- [ ] T086 [US3] [Q2] [Q4] `infra/prod/{edge,dns,site}.tf` and `edge-limits.tf` (protected, empty unless WAF): the zone, the certificate, the distribution (behaviors, the VPC origin, the origin request and response headers policies with the CSP, the custom error responses), the site's bucket with origin access control, per contracts/edge.md
- [ ] T087 [US3] `apps/web/`: `/`, `/disclosure/`, the notice when the local tier can't be reached, the hello form naming hello as a test of the gateway, `build.py`, and `_degraded/api.json`, per §8.1 and contracts/edge.md §5
- [ ] T088 [US4] The disclosure's rows V1–V5 and C8, C11, with their tags; spec 000's "No visitor data flows" line retired, per §8.2 and FR-040
- [ ] T089 [US3] `make release`'s site step and `make site-rollback`, per contracts/releases-deployer.md §2 and contracts/edge.md §4
- [ ] T090 [US4] `evals/visitor_scan.py` (`visit` and `scan`), per quickstart §6.6
- [ ] T091 [US3] The edge's metrics poller (the host service), and the Cloud row's edge panels, per §9
- [ ] T092 [US3] **Author**: quickstart §6: apply the edge, the name servers and their record ([Q4]), hello's red-team run, the first public release, the probe on; then quickstart §6.5's two measurements (CloudFront replaces a forged `CloudFront-Viewer-Address`; the security group's prefix list admits the VPC origin's traffic, and the relay's peer rule refuses none of it), SC-001, SC-010, and SC-011, and R-08's measurement (whether a CloudFront Function can add the cause header to an error response)
- [ ] T093 [US3] Merge-request note `docs/merge-requests/<date>-feat-001-us3-us4-public.md`, with the plan block, the three criteria's records, `make check`, and the reviewer's passes

**Checkpoint**: h4reet.ai answers whether or not the machine is awake, and says what it carries.

---

## Phase 7: The public view never goes dark (User Story 7, Priority P2) — branch `feat/001-us7-public-view`

**Goal**: the snapshot publisher and sink, and `/status/`.

**Independent test**: quickstart §7: SC-013 (the local tier off for an hour).

### Tests for User Story 7 (first)

- [ ] T094 [P] [US7] `deploy/scripts/test_snapshot.py`: the publisher's queries read from the dashboard's public panels; the sink refuses a document with any field outside contracts/public-view.md §3's schema, a payload, an identifier, or a reason; the merge with the meter of record's own values, per FR-059
- [ ] T095 [P] [US7] `apps/web/test_status.py`: the page shows each value's time, the local tier's live status from `/api/status`, and no write action, per FR-057, FR-058

### Implementation for User Story 7

- [ ] T096 [US7] [Q9] `deploy/scripts/snapshot_publisher.py` and `snapshot_sink.py`, their images, and the sink's role and bucket prefix in `infra/prod/iam.tf` (protected), per contracts/public-view.md §1–§3 and research.md R-19
- [ ] T097 [US7] `apps/web/status/`, per contracts/public-view.md §4
- [ ] T098 [P] [US7] `docs/runbooks/public-view-stale.md`, per FR-056
- [ ] T099 [US7] **Author**: quickstart §7: the view live, then SC-013
- [ ] T100 [US7] Merge-request note `docs/merge-requests/<date>-feat-001-us7-public-view.md`, with `make check`, SC-013's record, and the reviewer's passes

---

## Phase 8: The close — branch `feat/001-close`

**Purpose**: the success criteria, the ADRs' reachability, and the matrix with no planned rows.

- [ ] T101 [P] `docs/START-HERE.md` §3 and §5, and the root `README.md`'s links (the ADRs, the public view, the disclosure), per SC-014
- [ ] T102 [P] `docs/runbooks/` index: every alert this spec adds names its runbook, per FR-056
- [ ] T103 Switch every remaining PLANNED matrix row this spec added; `make check` shows zero, per SC-003's rule in spec 000
- [ ] T104 **Author**: quickstart §8, after the first full month: SC-002, SC-003, SC-004, SC-012, SC-014
- [ ] T105 The success-criteria table, in the spec's words, in `docs/merge-requests/<date>-feat-001-close.md`, with `make check` and the reviewer's passes

---

## Dependencies & Execution Order

- **Phase order is merge order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Each phase's Author task follows its merge, and the next phase branches from the merged `main`.
- **Hard dependencies:**
  - Phase 1's patch before any `infra/` file (§2).
  - Phase 2's apply (the budgets) before any resource that costs money (FR-022).
  - Phase 3's booking and kill switch before the VM exists (FR-020, FR-023).
  - Phase 4 waits for spec 000's SC-001 re-run and SC-002 ([Q1]).
  - Phase 5 (the tunnel) before Phase 6 makes hello public, so visitors are answered locally from the first day.
  - Phase 6's disclosure rows before the first visitor byte (US4).
- **Within a phase:** tests first (they must fail), then the code, then the Author's task, then the note.

## Parallel opportunities

- **Phase 1:** T001–T004 together; T008–T011 together; T013 and T014 beside them.
- **Phase 3:** the gateway's booking (T029, T033, T034) beside the account root (T036–T040) beside the Lambdas (T031, T032).
- **Phase 4:** the relay (T045, T053), the deployer and release (T046, T047, T060), and the VM's host files (T048, T059, T061) are separate workstreams; the Terraform (T062) follows the host files' names.
- **Phase 6:** the site (T082, T087) beside the edge's Terraform (T086) beside the red-team cases (T083).

## Implementation strategy

- **MVP:** Phases 1–3. The account is under Terraform, plans go through notes, applies are recorded, and the safety net is live and rehearsed, before any compute exists. Stop and validate there: quickstart §1–§3.
- **Then:** Phase 4 (the VM, the meter's move) and Phase 5 (the tunnel) bring production into the cloud without visitors. Phase 6 opens the site, Phase 7 the view.
- **Each phase is a complete, reviewable increment,** with its note and its Author runs.
