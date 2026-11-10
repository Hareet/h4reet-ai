---

description: "Task list for spec 001, Cloud Elevation: EC2 as prod's default host, the laptop when the Author runs it"
---

# Tasks: Cloud Elevation — Terraform, One Account, EC2 as Prod's Default Host

**Input**: the documents in `specs/001-cloud-elevation/`:
- [spec.md](spec.md): FR-001 to FR-076, SC-001 to SC-018 (SC-015 moved), User Stories 1 to 8, and Clarifications, including the Author's answers to the plan's questions 1 to 4;
- [plan.md](plan.md): §1 to §17, the patches P-1 to P-6 and P-I1 to P-I6, the task groups of §16, and its risks;
- [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), and [quickstart.md](quickstart.md).

It replaces the September task list (`tasks.md` at 00309c47). Revised on 2026-11-09 after `/speckit-analyze` over 8acc2686: the tasks are renumbered, and the note's 2026-11-09 section maps the old numbers to the new.

**Prerequisites**:
- **T000** (the Author's approval of spec.md and plan.md) comes before every other task. CLAUDE.md: "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`."
- **T001** (the Author applies the amended constitution 1.1.0) comes next, before any group, as the default order he confirms at T000. Its check is a precondition of every group that touches `infra/` (groups 3 to 9). T020 writes the first file under `infra/`.
- **The provisional answers:** the plan's questions 5 to 7, and the spec's question 16, were taken as the session's defaults, not his words. His approval at T000 leaves them standing. A different answer later still changes the tasks that cite that question before they start.
- **Question 8** (the relay on spot, against the Cloud standard's "must be always-on") was asked at T000. His approval takes option A, so T001 applies his wording in the 1.1.0 patch, being added on `docs/001-ec2-default`.
- **The named deviation:** his approval directs group 1 to be built before T001 (spec.md Assumptions, "The constitution first"). Nothing merges and nothing is applied before T001, and groups 3 to 9 still check it first.

**Tests**: required. In each group the test tasks come first and must fail (RED) before the code that makes them pass (GREEN), and the branch's note records both runs. Terraform has no agent-run tests beyond the offline checks: `terraform test` is refused to agents (FR-006). Its proofs are the policy's fixtures, `make infra-check`, the redacted plan in the note, and the Author's quickstart runs.

**Organization**:
- **Eleven groups,** one feature branch each, as plan §16 lists them. Each branch is cut from `refs/heads/main` once the group before it has merged, in its own worktree, and the Author merges them in order.
- **The order inside each group** (plan §16):
  1. the tests, which fail first;
  2. the code, each feature with its span, its dashboard panel, its runbook, and its disclosure row (the constitution's Development Workflow step 7);
  3. for a group that touches `infra/`, the Author's plan block, pasted into the note on the branch;
  4. a review by an agent that wrote none of the group, and the note;
  5. the Author's patches on the branch, then the gate (`tools/gates/gate <branch>` from main's checkout), then his merge;
  6. his apply on `main`, and his other steps there.
- **The plan block before the patches.** The gate's `infra-plan-note` step ties the block to `infra/`'s tree hash on the branch, and the protected files reach the branch only with his patches, after the review. So he makes the block from a scratch clone of the branch, with the group's patches applied and committed there. He then commits the same patches, byte for byte, on the branch, and `infra/`'s tree hash is the one the block names.
- **User-story labels** mark which story a task serves; a group may serve several.
- **Parallel lanes:** tasks marked [P] touch files that no unfinished task of their group touches. Agents may take them in worktrees of their own, one per agent that writes, and the commits are cherry-picked onto the branch in task order. Agents never merge.
- **Each note,** `docs/merge-requests/<date>-feat-001-<group>.md`, holds `make check ENGINE_MODE=none-yet`'s whole output, `gitleaks dir`'s output, the RED and GREEN runs, and, for `infra/` changes, the Author's redacted plan blocks.

## Format: `[ID] [P?] [Story?] Description. Check: … (branch)`

- **[P]**: can run in parallel with the other [P] tasks of its group.
- **[USn]**: the spec's user story. Setup and Polish tasks carry none.
- **"Author:"** opens a task only the Author does, in his own terminal. Every `terraform apply`, `import`, and `init -migrate-state`; every IAM, budget, or alert-routing change; every secret; the constitution; prod's routes (ADR 0041); and every paid or live run. Agents never run these, and the bash gate refuses them (FR-006, R-16).
- **Patches.** A human-only or protected path changes only by the Author's hand:
  - `.claude/**`, `CLAUDE.md`, `REVIEW.md`, and `tools/gates/**`;
  - `config/budgets.yaml`, `config/prices.yaml`, and `config/alerts.yaml`;
  - the protected Terraform files: `iam*.tf`, `budgets*.tf`, `alerts*.tf`, `killswitch*.tf`, `handover*.tf`, `failover*.tf`, `ec2-market*.tf`, `edge-limits*.tf`, and `infra/policy/**`.

  An agent task writes such a change as a `.patch` beside the branch's note. The plan's patches keep their names, P-1 to P-6 (plan §14); the protected Terraform arrives as P-I1 to P-I6, one per group that has any. It builds the patch from plain copies (`git show`, `git diff --no-index`), never by `git apply` or a write into any worktree.

## Path conventions

- **Infrastructure:** `infra/{bootstrap,account,prod}/`, `infra/modules/`, `infra/lambdas/<name>/`, `infra/policy/`, `infra/test/`.
- **Services:** `services/relay/` (new) and `services/gateway/` (`src/config/`, `src/meter/`, `src/core/`, `migrations/`, `test/`).
- **The stack:** `deploy/` (`compose.yaml`, `edge/`, `tunnel/`, `hosts/`, `otel/`, `grafana/`, `scripts/`, `env.example/`); `scripts/operator.py`; `apps/web/`; `evals/`; `redteam/`; `docs/`.
- **References:** "§n" is plan.md's, "R-nn" research.md's, "FR-nnn" and "SC-nnn" the spec's. "Plan Qn" is the plan's question n.
- **Test values:** tests build key- and token-shaped values at run time, never as literals.

---

## Before any group

- [x] T000 Author: approve spec.md and plan.md, and with them §13's spec amendments, which follow his answer to plan Q1. Confirm, or overturn, the session's provisional answers to plan Q5 (the resting words as a spec 002 follow-up in his words), Q6 ("it" is the laptop's stack), and Q7 (the IAM default, with the guard's stop-only role, the start function's reads, `h4-laptop-bedrock`, the tunnel end's reads for the dashboard, and the tunnel end's `sns:Publish` on `h4-alerts`), and question 16's default with them. Answer plan Q8: A, his wording for the relay on spot in the 1.1.0 patch, or B, a deviation in spec.md's Assumptions citing ADR 0044. Confirm T001 as the default order. Then gate and merge `spec/001-cloud-elevation` (documents only) with `tools/gates/gate spec/001-cloud-elevation` from main's checkout. Check: the plan's Status and the spec's Clarifications record his approval and each answer of his in his words; with B, spec.md's Assumptions name the deviation before the merge (main)
  - **Recorded 2026-11-10.** His words, verbatim, as he went to bed: "Let's approve the t000 and spec 001 plan. Let's have you build it out but not push or try anything in the cloud yet, i will do that in the morning, but you can have everything ready and verified by then. Use the latest dependenices adn versions for aws services, plugins"
  - **What his approval takes** (spec.md Clarifications, Session 2026-11-10; plan.md Status): the spec and the plan, with §13's amendments and its list of the other specs' amendments; plan Q5, Q6, and Q7, and question 16, at their provisional defaults, the session's answers, which his approval leaves standing; plan Q8 as option A, his wording in the unapplied 1.1.0 patch, being added on `docs/001-ec2-default`; and, as the session's reading of his approval, T001 as the default order before any group touches `infra/`, the ADRs proposed until his merges, and T008's pins at the latest releases established on 2026-11-10, confirmed by him at T011.
  - **The deviation his words name:** "build it out … you can have everything ready and verified by then" has group 1 built before T001 (spec.md Assumptions). T001 stays his. Nothing merges and nothing is applied before it.
  - **What remains of T000:** the gate and merge of the documents. `feat/001-guards` was cut at `spec/001-cloud-elevation`'s tip, d3c7ee02, so its merge carries them; or he merges `spec/001-cloud-elevation` first. Either way, after T001.
- [ ] T001 Author: apply the constitution's amendment 1.1.0, as amended on `docs/001-ec2-default` with the two sentences he chose to add (plan Q3), and with his Q8 wording if he chose A (P-2). Accept ADR 0044. This is the default order, before any group; he confirms it at T000. Check: `.specify/memory/constitution.md` on `refs/heads/main` reads "**Version**: 1.1.0"; ADR 0044's Status reads accepted. Groups 3 to 9 each check this first (main)

---

## Group 1: the guards (Setup) — `feat/001-guards`

**Purpose**: every deny, refusal, and protection lands before any `infra/` file, state, key, or secret exists (plan §2).

### Tests first

- [x] T002 Create the worktree for `feat/001-guards` from `refs/heads/main` and record the base's full SHA. Make a fresh `git archive` export of `main` in a new, empty folder, as the patches' base. Check: `git rev-parse HEAD` is main's SHA, read from `refs/heads/main` (feat/001-guards)
  - **Done 2026-11-10, with a stand-in:** the worktree `/tmp/claude-1000/wt-001g1`, cut at `spec/001-cloud-elevation`'s tip d3c7ee02 (which holds this spec, its plan, and these tasks), stands in for the one this task names, and `git --no-replace-objects merge refs/heads/main` brought main in at 203bec3f. So `git rev-parse HEAD` is the branch's tip, not main's; the base is main at d0fac811ca297a6d9ead42022043d8a12fb4418e, read from `refs/heads/main` after the merge. The patches' base is a fresh `git archive` export of that commit, in a new, empty folder under `$TMPDIR`.
- [x] T003 [P] Write the forbidden-action matrix's new rows in a copy of `redteam/forbidden-actions.sh` and `tools/gates/matrix-required.txt`, on the export:
  - stage H rows for Terraform's state-changing commands in every spelling (R-16: `-chdir`, `TF_CLI_ARGS*`, `tofu`, `terragrunt`, wrappers, `bash -c`, subshells, a path to the binary);
  - stage H rows for the Author-only targets (R-32, R-16);
  - stage S rows for the denied paths and names (contracts/env-cloud.md §5);
  - rows for the protected files (contracts/infra-records.md §3, T5);
  - a gap row for any spelling found to get through.

  Check: RED, the rows fail on the unpatched export (feat/001-guards)
  - **Done 2026-11-10** in P-1 (`docs/merge-requests/2026-11-10-feat-001-p1-guards.patch`): 162 new stage H rows and 3 stage S rows, with 163 IDs in `tools/gates/matrix-required.txt` (the stage S marker among them); 8 of the stage H rows are gap rows (a name held in a variable, a shell function or alias, a copy of the binary, a name built at run time, `make plan $(echo ROOT)=…`, and a shell write to a protected file). RED on the unpatched export: 103 failures. GREEN on a patched export: 910 passed, 0 failed (the note).
- [x] T004 [P] Write `tools/gates/test/test_infra_policy.py`, `test_infra_redact.py`, `test_infra_plan_note.py`, and `test_disclosure_check.py` on the export. They need fixtures for rules T1 to T13 (each passing and failing), redaction (12-digit runs, emails, sensitive values, a secret pattern refused), the plan note's tree hash, and the disclosure against compose services, sshd permits, egress-proxy hosts, CloudFront origins, EventBridge targets, and open security-group rules. Check: RED (feat/001-guards)

### Implementation

  - **Done 2026-11-10** in P-1: 106 tests over the four checkers. RED: all four files fail to collect without their modules (the note).
- [x] T005 Write P-1 as `docs/merge-requests/<date>-feat-001-p1-guards.patch`, from plain copies of `main`'s files, by plan §2's list:
  - `.claude/hooks/bash-gate.sh`'s Terraform rules and Author-only targets;
  - `.claude/settings.json`'s denies (`*.tfstate*`, `*.tfplan`, `*.tfvars*`) and `credentials.envVars` (`TF_VAR_*`, `AWS_*`, `TF_CLI_ARGS*`, `GATEWAY_DB_URL`, `GATEWAY_DB_TLS_SERVERNAME`, `RELAY_TOKEN_*`, `SNAPSHOT_SINK_TOKEN`, `TELEMETRY_BLOCK_TOKEN`, `DB_*_PASSWORD`);
  - `.claude/hooks/protected-paths.sh`'s Terraform globs;
  - `tools/gates/infra_policy.py`, `infra_redact.py`, `infra_plan_note.py`, `disclosure_check.py`, and the compose policy's host rules;
  - the gate's `infra-plan-note` and `infra-check` steps;
  - T003's rows and T004's tests.

  Check: `patch -p1 --dry-run` applies it cleanly to a second fresh export; on a patched export, T003's rows and T004's tests pass, and the agent-config tiers pass (FR-004 to FR-006, FR-011, FR-012) (feat/001-guards)
  - **Done 2026-11-10:** P-1, 17 files. Two departures, in plan §2: the compose policy's host rules move to groups 5 and 7, and the gate runs no `terraform`. `patch -p1 --dry-run` applies it cleanly to a fresh export of `refs/heads/main` and to an export of the branch; on a patched export of the branch the matrix (910 passed, 0 failed), the 1,445 gate tests, `make toolchain-check`, and the static tier pass (the note).
- [x] T006 [P] Write P-3 as `docs/merge-requests/<date>-feat-001-p3-claude-md.patch`, with plan §14's three sentences of `CLAUDE.md` drafted and marked for his words: the infra line for the local phase's apply, the routing sentence per host, and the relay's line. Check: applies to a fresh export; `evals/agent-config`'s static tier passes on it (FR-062) (feat/001-guards)
  - **Done 2026-11-10:** P-3 (`docs/merge-requests/2026-11-10-feat-001-p3-claude-md.patch`), its three sentences shortened to fit CLAUDE.md's 6 KB cap. It applies to a fresh export, and the static tier passes on it (the note).
- [x] T007 [P] Write the ADRs plan §14 lists, status proposed, at the free numbers in `docs/adr/README.md` when this task runs, with their index rows:
  - 0007, 0008, and 0009;
  - the shared state in RDS;
  - the relay on the tunnel end, with the tunnel end on spot (plan Q1, Q2), and plan Q8's answer;
  - the tunnel;
  - EC2 on spot with stop, the start function, and the guard;
  - the route per host and rule R1;
  - the public cap (P-6).

  They stay proposed in the branch and become accepted when the Author merges group 1, after his approval at T000 (plan §14). Check: the docs-links check passes; each ADR quotes the Author's answers it rests on, in his words (FR-062, SC-014) (feat/001-guards)
  - **Done 2026-11-10:** ADRs 0007, 0008, 0009, and 0024 to 0029 (spec 001's own allocation since September), proposed, with their index rows. The docs-links check finds no broken link of theirs; four links inherited from `spec/001-cloud-elevation` point at `docs/001-ec2-default`'s files and resolve once it merges.
- [x] T008 Write `make infra-mirror` (seeds the provider mirror at the pinned versions) and `make aws-login` (starts the Author's SSO session for a named profile), both refused to agents by P-1 (R-32). Then write `.devcontainer/toolchain.vars`'s Terraform, `hashicorp/aws`, and AWS CLI pins, at the versions the Author chooses in his terminal. Check: `make toolchain-check` passes; on a patched export the bash gate refuses both targets (FR-004, FR-006) (feat/001-guards)

### Close

  - **Done 2026-11-10:** `make infra-mirror` (`scripts/infra/infra_mirror.py`), `make aws-login PROFILE=h4reet-…` (`deploy/scripts/aws-sso-profile.sh`), and the pins in `.devcontainer/toolchain.vars`: Terraform 1.17.1, `hashicorp/aws` 6.72.0, the AWS CLI 2.29.1 (research.md R-02). "At the versions the Author chooses in his terminal": his T000 words ask for the latest, and he confirms them at T011. On a patched export `make toolchain-check` passes and the bash gate refuses both targets (the note).
- [ ] T009 Review by an agent that wrote none of the group, and the note. Check: the note holds `make check`'s and `gitleaks dir`'s whole output, and lists P-1 and P-3 first under "For the Author" (feat/001-guards)
- [ ] T010 Author: apply P-1 and P-3 on the branch from the note's patch files, run `tools/gates/gate feat/001-guards` from main's checkout, and merge. Check: the gate passes; the matrix shows zero failures and no gap (feat/001-guards, then main)
- [ ] T011 Author: on `main`, run `make infra-mirror`, which seeds `~/.local/share/h4reet/terraform-providers`. Check: `make check`'s `infra-check` step reads PLANNED until `infra/` exists (quickstart §1) (main)

---

## Group 2: the measurement, and the Author's figure (Setup) — `feat/001-measure`

**Purpose**: the stack's memory and architectures measured, so the Author prices and sets the server budget's figure before any apply (FR-021; spec question 14's answer, "Measure, then you set it").

### Tests first

- [x] T012 [P] Write `deploy/scripts/test_measure_stack.py`. It needs fixtures of `docker stats` samples: the peak resident memory per service over a run; a refusal when a model-server service is running; and the record's shape (R-33). Check: RED (feat/001-measure)
  - **Done 2026-11-10** (daf4768b), with the load's tests, the probe image's copy of it, and `make measure-stack`'s. RED: the file fails to collect without its module (the note).
- [x] T013 [P] Write `deploy/scripts/test_arch_inventory.py`. It needs fixtures of image indexes: `linux/arm64` present or absent per service in `deploy/images.lock`, and the hosts each service runs on (contracts/env-cloud.md §3). Check: RED (feat/001-measure)
  - **Done 2026-11-10** (daf4768b), with a fake engine over HTTP. RED: the file fails to collect without its module (the note).

### Implementation

- [x] T014 Write `deploy/scripts/measure_stack.py`, `make measure-stack ENV=dev-cpu`, and a load script: hello and twin turns at the public cap, against a stub paid adapter, with the CPU model server stopped. Check: T012 passes (FR-021) (feat/001-measure)
  - **Done 2026-11-10:** the load script is `deploy/scripts/measure_load.py`, which `evals/Dockerfile.probe` copies into the breach probe. Three departures, in plan.md §16 (group 2's departures 2 to 4): the rate is the gateway's global metered limit, since the public cap's figures are blank until P-6; the stub is dev's synthetic adapter, inside dev's meters; and dev-cpu only. GREEN: T012's 62 tests pass (the note). Row S11 of `docs/data-flow-disclosure.md` names the load's two calls to `edge`, and `evals/test_disclosure.py` now reads the load's file too, as it reads the probe's.
- [x] T015 Write `deploy/scripts/arch_inventory.py`, offline against the seeded store (`docker buildx imagetools inspect`). Check: T013 passes (feat/001-measure)
  - **Done 2026-11-10,** with `make arch-inventory`. One departure (plan.md §16, group 2's departure 1): imagetools asks the registry, so the script reads the store through the Engine API's index view. GREEN: T013's tests pass, 21 here and the unix-socket one skipped, since the sandbox refuses unix sockets. The script also read the agents' engine's real store (the note).
- [ ] T016 Run the measurement on `dev-cpu` and the inventory. Record each service's peak memory, the disks' sizes, and which images lack arm64 in research.md R-33 and the note, with the run's length and load. Check: the record names the smallest instance types that fit, by memory alone; no price is written (R-33) (feat/001-measure)
  - **The inventory ran on 2026-11-10;** it is read-only. Every image EC2 runs has `linux/arm64` (research.md R-33's record).
  - **The measurement is pending,** for two reasons. The rule from the crash of 2026-10-08 runs heavy work only with at least 30 GB free on C:, and the drive had 29.0 GB. And dev-cpu runs from the main working tree, whose files the engine binds, not from this branch's worktree. The note's "For the Author" gives the morning's steps. research.md R-33 reads "pending the run" until then.
- [ ] T017 Author: price research.md R-05's lines from AWS's pages in his terminal:
  - EC2's measured types on spot, and an 8-to-12-hour day for the reserve;
  - the tunnel end's `t4g.micro` on spot, and its Elastic IP;
  - RDS's smallest Graviton class and its storage;
  - the Route 53 health check;
  - the fault-injection service for the rehearsals;
  - the rehearsal `t4g.nano`, `h4-rehearsal-instance`;
  - the "to confirm" lines, the tunnel end's Elastic IP among them.

  Then set the server budget's figure as `TF_VAR_server_budget_usd` in `~/.config/h4reet-ai/infra/bootstrap.env`. He records his prices on the branch, in his own commit. Check: research.md R-05's lines carry his prices and their dates, with the figure where he chooses to record it (FR-021, FR-022) (feat/001-measure)

### Close

- [ ] T018 Review and note. Check: as T009 (feat/001-measure)
- [ ] T019 Author: gate and merge. Check: the gate passes (feat/001-measure, then main)

---

## Group 3: the bootstrap (US1, US2) — `feat/001-us1-bootstrap`

**Goal**: Terraform's state, and the budgets, applied first (FR-001 to FR-008, FR-022). **Independent test**: quickstart §3.

**Precondition**: T001's check holds. The branch's first commit records it.
  - **Recorded 2026-11-10: unmet.** `.specify/memory/constitution.md` on `refs/heads/main` (d0fac811) reads "**Version**: 1.0.1", not 1.1.0, and ADR 0044 reads "Status: proposed", on `docs/001-ec2-default` (a633f542). The group is built anyway, at the main session's direction, as its reading of the Author's T000 words, "build it out … you can have everything ready and verified by then": the agent work on `feat/001-us1-bootstrap` and its patch, P-I1. Nothing of it merges, and nothing is applied, before T001. That extends the deviation spec.md's Assumptions name for group 1 ("The constitution first"), which now says so; it is the session's reading, not a word of his, and his to overturn.

### Tests first

- [x] T020 [P] [US1] Write `infra/test/fixtures/bootstrap/` and `infra/test/test_bootstrap.py`, the first files under `infra/`, which parse the root's HCL with group 1's standard-library reader, `tools/gates/infra_policy.py`'s, from the guard patch P-1 (plan.md Technical Context; research.md R-14):
  - the state bucket: versioned, encrypted, public access blocked, TLS-only;
  - `h4-model-month` at $20 and `h4-model-day` at $5, on Bedrock's cost, with notifications at 70% and 100%;
  - `h4-server-month` at `var.server_budget_usd`, on every cost but Bedrock's, at 70% and 100%;
  - the anomaly monitor with its $1 subscription;
  - `h4-alerts` with its email subscription from a sensitive variable;
  - the tags.

  Check: RED (FR-001 to FR-003, FR-022) (feat/001-us1-bootstrap)
  - **Done 2026-11-10** (56d7a044): ten checks over the root, and 24 fixtures, one defect each, which must each find exactly their problem. Until P-1 is applied the module reads PLANNED (T010); until P-I1 is, it reads `budgets.tf` and `alerts.tf` from P-I1's patch file (plan.md §16, group 3's departure 1). RED on a patched export: every check fails on the missing root (the note).
- [x] T021 [P] [US1] Write `scripts/infra/test_infra_verify.py` and `test_infra_record.py`, with a stub `terraform show -json`. They cover `infra-verify`'s refusals (`not_main`, `dirty`, `no_reviewed_plan`, `plan_missing`, `plan_stale`, `plan_not_reviewed`, `plan_differs`, `credential_finding`, `state_locked`) and the record's fields: addresses and actions only, redacted. Check: RED (FR-005, FR-007, FR-010) (feat/001-us1-bootstrap)
  - **Done 2026-11-10** (56d7a044), with a scratch repository, a merged note, and a fake terraform and aws in `scripts/infra/infra_testkit.py`; each refusal has its test, and the record its fields, its redaction, and its branch. RED on a patched export: every test fails or errors without the scripts (the note).
- [x] T022 [P] [US1] Write `infra/lambdas/credential_audit/test_audit.py`, with a stub IAM. Its findings: user access keys; root keys; outside trust; OIDC providers; the laptop's permission set, or `h4-laptop-bedrock`, not being Terraform's, or the permission set holding anything but `sts:AssumeRole` on that role; and a start, guard, or stop policy naming anything but the tagged instance. Nothing may name a key's ID. Check: RED (FR-008, FR-013, SC-004) (feat/001-us1-bootstrap)
  - **Done 2026-11-10** (56d7a044), with a stub AWS for IAM, STS, Identity Center, SNS, and S3, and a fake AWS CLI for the terminal's run. RED: it fails to collect without `audit.py` (the note).

### Implementation

- [ ] T023 [US1] Write `infra/bootstrap/{main,variables,versions,outputs}.tf` and its lockfile from the mirror. Write `budgets.tf` and `alerts.tf` as P-I1 (`docs/merge-requests/<date>-feat-001-pi1-bootstrap.patch`), since they are protected. Check: on a patched copy, T020 passes, and `make infra-check` passes (feat/001-us1-bootstrap)
  - **Built 2026-11-10, but for the lockfile,** which is the Author's step (plan.md §16, group 3's departure 3). The four files, `redact.txt`, and P-I1 (`docs/merge-requests/2026-11-10-feat-001-pi1-bootstrap.patch`, two new files from plain copies, `diff -u`). On a patched copy T020 passes, from P-I1's patch and from the tree, and the policy's one finding is T10, no lockfile; fmt and validate need Terraform and his mirror, so they run in his `make plan ROOT=bootstrap` (the note). Three things to confirm at T027 are in the note's "For the Author".
- [x] T024 [US1] Write `make plan ROOT=…`, `make infra-verify`, `make infra-record`, `make infra-audit`, and `make secrets-check` (`scripts/infra/*.py`), each refused to agents by P-1. Check: T021 passes (feat/001-us1-bootstrap)
  - **Done 2026-11-10:** `scripts/infra/infra_plan.py`, `infra_verify.py`, `infra_record.py`, and `secrets_check.py`, sharing `infra_common.py`, and the five targets, each refusing in the sandbox before its script runs. GREEN: T021's tests, the plan's and the secrets check's, and the targets' pass on a patched export (the note). Departures 2, 4, 9, and 10 of plan.md §16's group 3 are theirs.
- [x] T025 [P] [US1] Write `infra/lambdas/credential_audit/` (stdlib Python, Dockerfile) and `infra/README.md`. Check: T022 passes (feat/001-us1-bootstrap)
  - **Done 2026-11-10, but for the Dockerfile,** which moves to group 4 with the function's deployment and its base's digest (plan.md §16, group 3's departure 7). `audit.py` runs in the Author's terminal through the AWS CLI, and as the Lambda's handler on `python3.14`, arm64, from group 4. GREEN: T022 passes (the note).
- [x] T026 [P] [US2] Add the disclosure rows C8 (its email half) and C9, in the same commit as T023. Check: `disclosure_check` passes (FR-040) (feat/001-us1-bootstrap)
  - **Done 2026-11-10,** in T023's commit: spec 001's section of `docs/data-flow-disclosure.md`, with C8's email half and C9 in the spec's words. `disclosure_check` passes on a patched export (the note).

### The Author's plan block

- [ ] T027 Author: in a scratch clone of the branch, apply P-I1 and commit it there; run `make plan ROOT=bootstrap`; paste the redacted block into the note's draft on the branch. Check: the block's `tree` is the tree hash `infra/` will have on the branch once P-I1 is committed byte for byte (T029); no account ID, address, or email in it (FR-005, FR-010) (feat/001-us1-bootstrap)

### Close

- [ ] T028 Review and note. Check: as T009 (feat/001-us1-bootstrap)
- [ ] T029 Author: apply P-I1 on the branch, byte for byte as in T027; gate; merge. Check: the gate's `infra-plan-note` step passes (feat/001-us1-bootstrap, then main)
- [ ] T030 Author: on `main`:
  1. run `make infra-verify ROOT=bootstrap`, apply the saved plan, and run `make infra-record`;
  2. migrate the state (`terraform init -migrate-state`) and record it;
  3. activate the cost-allocation tags in the Billing console;
  4. confirm SNS's email subscription.

  Check: quickstart §3's checks; the apply record is on `ops/apply-bootstrap-<date>` (FR-003, FR-007, FR-022; SC-012) (main)
  - **As built (group 3):** step 2 needs `versions.tf`'s backend to read `s3`, a change on a branch of its own after this one merges, so it runs from that branch's checkout, not from `main` (plan.md §16, group 3's departure 4).

---

## Group 4: the safety net (US2) — `feat/001-us2-safety-net`

**Goal**: the alert path, the model action on the laptop's Bedrock role, both actions' rehearsals against targets of the same shape, the probe, the registry, and releases' bucket (FR-013, FR-022 to FR-026, FR-061). **Independent test**: quickstart §4.

**Precondition**: T001's check holds.
  - **Recorded 2026-11-10: unmet.** `.specify/memory/constitution.md` on `refs/heads/main` (d0fac811) reads "**Version**: 1.0.1", not 1.1.0, and ADR 0044 reads "Status: proposed", on `docs/001-ec2-default` (a633f542). The group is built anyway, at the main session's direction, as its reading of the Author's T000 words, "build it out … you can have everything ready and verified by then", as group 3 was: the agent work on `feat/001-us2-safety-net`, stacked on groups 1 to 3, and its patch, P-I2. Nothing of it merges, and nothing is applied, before T001. That extends the deviation spec.md's Assumptions name for groups 1 and 3 ("The constitution first"), which now says so; it is the session's reading, not a word of his, and his to overturn.

### Tests first

- [ ] T031 [P] [US2] Write `infra/lambdas/alert_bridge/test_bridge.py`: every kind in contracts/aws-alerts.md §2 gives its message, in the `[hareet.ai aws]` format, `ec2_stopped_server_budget`, `tunnel_end_interruption`, and `tunnel_end_back` among them; no secret, account ID, key ID, payload, or client identifier ever appears; retries and failure destination. Check: RED (FR-022) (feat/001-us2-safety-net)
- [ ] T032 [P] [US2] Write `infra/lambdas/probe/test_probe.py`: the two checks with `X-H4-Probe: 1`; a pass needs a 200 within 5 s and, for status, a `serving` field; it never calls hello or a turn. Check: RED (FR-061) (feat/001-us2-safety-net)
- [ ] T033 [P] [US2] Write `infra/test/fixtures/account/` and `infra/test/test_account.py`. They cover:
  - the laptop's Bedrock permission set, imported, allowing only `sts:AssumeRole` on `h4-laptop-bedrock`;
  - `h4-laptop-bedrock`, an ordinary IAM role: `bedrock:InvokeModel*` on the one inference profile only, trusting only the permission set's role;
  - the model action's settings, `h4-deny-paid-models`, and its targets: ordinary roles only, never a role under the path Identity Center gives the roles it makes for permission sets (`/aws-reserved/sso.amazonaws.com/`, to confirm);
  - its execution role, which may attach and detach only that policy on those roles;
  - while `rehearsal = true`, the two $0.01 budgets; `h4-rehearsal-target`, an ordinary role of the same shape as `h4-laptop-bedrock` that no one assumes (to confirm); and `h4-rehearsal-instance`;
  - the probe's and the credential audit's EventBridge schedules only in `alerts.tf`, the probe's disabled, and no EventBridge rule in `lambdas.tf` (rule T5).

  Check: RED (FR-012, FR-013, FR-023, FR-026) (feat/001-us2-safety-net)

### Implementation

- [ ] T034 [US2] Write `infra/account/{main,lambdas,registry}.tf`: the bridge's, the probe's, and the audit's functions, ECR, the release bucket, and the rehearsal instance. Write `killswitch.tf`, `iam.tf` (the permission set, for import and narrowing; `h4-laptop-bedrock`; `h4-rehearsal-target`), and `alerts.tf` (with the probe's schedule, disabled until group 8's P-I5, and the audit's weekly schedule) as P-I2. Check: on a patched copy, T033 passes, and `make infra-check` passes (feat/001-us2-safety-net)
- [ ] T035 [P] [US2] Write `infra/lambdas/alert_bridge/` and `infra/lambdas/probe/`. Check: T031 and T032 pass (feat/001-us2-safety-net)
- [ ] T036 [P] [US2] Add F2's change (the laptop's `sts:AssumeRole` on `h4-laptop-bedrock`), C8's Telegram half, C10, and C11, in the same commit as T034. Write the runbooks `docs/runbooks/aws-budget.md`, `aws-budget-action.md` (the deny on `h4-laptop-bedrock` and on `h4-prod-gateway` from group 7), `server-budget.md`, `aws-anomaly.md`, and `credential-audit.md`, and the laptop runbook's Bedrock profile, which chains from his SSO session to `h4-laptop-bedrock` (the form to confirm). Check: `disclosure_check` passes; each alert kind of this group names its runbook (FR-040, FR-056) (feat/001-us2-safety-net)

### The Author's plan block

- [ ] T037 Author: as T027, for `ROOT=account` with P-I2, the permission set's import shown in the plan. Check: as T027 (feat/001-us2-safety-net)

### Close

- [ ] T038 Review and note. Check: as T009 (feat/001-us2-safety-net)
- [ ] T039 Author: apply P-I2 on the branch, as in T037; gate; merge. Check: as T029 (feat/001-us2-safety-net, then main)
- [ ] T040 Author: on `main`:
  1. verify, import the laptop's Bedrock permission set, apply, and record;
  2. point the laptop's Bedrock profile at `h4-laptop-bedrock`, as the runbook says;
  3. write the Telegram parameters;
  4. set `rehearsal = true`, plan, and apply; start `h4-rehearsal-instance` before the trip, since stopping a stopped instance proves nothing;
  5. record each action's timings (contracts/aws-alerts.md §4; September §3.4), and, for the server action, the SSM run's status from the action's history and the instance's state after it;
  6. set `rehearsal = false`, plan, and apply.

  Check: SC-009, both channels got each alert, and each action took effect on its rehearsal target: the policy attached to `h4-rehearsal-target`, and the SSM run succeeded with `h4-rehearsal-instance` going from `running` to `stopped`; `aws sts get-caller-identity` with the laptop's Bedrock profile names `h4-laptop-bedrock`, with no paid call; spec 000's "made by hand" deviation ends for the laptop (FR-013) (main)

---

## Group 5: the tunnel end and the tunnel (US4) — `feat/001-tunnel-end`

**Goal**: the laptop reaches the cloud only by dialing out, to a spot instance in the account that runs around the clock (FR-052 to FR-055, FR-076's instance and warning). **Independent test**: quickstart §5.

**Precondition**: T001's check holds.

### Tests first

- [ ] T041 [P] [US4] Write `deploy/tunnel/test_tunnel.py`: two containers on the agents' engine. Only 2201, 2202, and 2203 may be listened on, and only the stub store and the sink opened. No shell or command opens. A wrong host key is refused. The forward to the store reaches only the store. Check: RED (FR-052, FR-053, FR-055) (feat/001-tunnel-end)
- [ ] T042 [P] [US4] Write `deploy/edge/test_tunnel_blocks.py` (spec 000's edge tests' style):
  - 8085 needs its bearer token, 401 otherwise, logged with no address; it moves `X-H4-Viewer` into the one `X-Forwarded-For` and keeps `traceparent`;
  - 8086 needs its own token;
  - 8087 serves `GET /health` only, with an empty body, 200 or 503 as the gateway's health says, and is rate-limited;
  - every other path gets 404.

  Check: RED (FR-053, FR-054) (feat/001-tunnel-end)
- [ ] T043 [P] [US4] Extend `services/gateway/test/unit/health.test.ts`: the health answer carries the store's readability, and reads unhealthy while the store can't be read. Check: RED (FR-054) (feat/001-tunnel-end)
- [ ] T044 [P] [US4] Write `deploy/hosts/test_hosts.py` and extend `deploy/scripts/test_preflight.py` and the compose policy's tests:
  - the tunnel end's nftables and security-group text admits 2222 from anywhere, 8087 from Route 53's ranges, and 8080 only privately;
  - its egress allowlist matches the disclosure, ECR (its deployer's pulls) and SNS (its alerts) among it;
  - the `tunnel-end` class selects `tunnel-end`, `relay`, `snapshot-sink`, and the collector only, with `H4_HOST=tunnel-end`;
  - the laptop's prod has the `tunnel` profile.

  Check: RED (FR-051, FR-052) (feat/001-tunnel-end)
- [ ] T045 [P] [US4] Write `deploy/otel/test_collector_tunnel_end.py`, on the configuration's text: the routing connector sends `laptop` to the tunnel's 2202 forward and `ec2` and `none` to EC2's collector; the file-backed queue; spec 000's redaction applied again, so no payload, address, or client identifier leaves; the queue's and the exporters' counters exported. Check: RED (FR-060; row C15) (feat/001-tunnel-end)
- [ ] T046 [P] [US4] Write `infra/test/fixtures/prod-tunnel-end/` and `infra/test/test_prod_network.py`. They cover the VPC and its subnets, the tunnel end with two interfaces, its Elastic IP, IMDSv2 with hop limit 1 (T13), spot persistent with `stop` (T11), its role (R-15: ECR pulls, its Parameter Store path, `sns:Publish` on `h4-alerts`, Session Manager), and the `h4-tunnel-end-spot-warning` rule to `h4-alerts`. Check: RED (FR-076) (feat/001-tunnel-end)

### Implementation

- [ ] T047 [US4] Write `deploy/tunnel/` (Dockerfile, `sshd_config`, `ssh_config`, entrypoint) per contracts/tunnel.md, and `tunnel` and `tunnel-end` in `deploy/compose.yaml`. Check: T041 passes (feat/001-tunnel-end)
- [ ] T048 [US4] Add the three blocks to `deploy/edge/nginx.conf` and the store field to the gateway's health. Check: T042 and T043 pass (feat/001-tunnel-end)
- [ ] T049 [US4] Write `deploy/hosts/` for the tunnel end (cloud-init, systemd units, nftables, `daemon.json`), `deploy/scripts/write_env.py`, `egress_proxy.py`, and the deployer's host part. Extend preflight and the compose policy's `tunnel-end` class. Check: T044 passes (feat/001-tunnel-end)
- [ ] T050 [US4] Write `deploy/otel/collector-tunnel-end.yaml` and the collector's service in the `tunnel-end` profile. Check: T045 passes (FR-060) (feat/001-tunnel-end)
- [ ] T051 [US4] Write `infra/prod/{main,network,tunnel-end,ssm}.tf`. Write `ec2-market.tf` (the tunnel end's spot options), `iam.tf` (its role), and the warning rule in `infra/account/handover.tf` as P-I3. Check: on a patched copy, T046 passes, and `make infra-check` passes (feat/001-tunnel-end)
- [ ] T052 [P] [US4] Write `make tunnel-keys` (the client key, the host key, the relay's host tokens, `SNAPSHOT_SINK_TOKEN`, and `TELEMETRY_BLOCK_TOKEN`), `make tunnel-revoke`, and `make cloud-session HOST=ec2|tunnel-end` (a Systems Manager port-forwarding session; FR-050), all Author-only, and `h4.tunnel.up` and `h4.tunnel.reconnects` from both ends. Check: their unit tests pass; the bash gate refuses them in an agent session (FR-050, FR-055, FR-060) (feat/001-tunnel-end)
- [ ] T053 [P] [US4] Add the "Hosts" row's first panels to the provisioned dashboard: the tunnel's state and reconnects, and telemetry delayed or lost (the tunnel end's collector's queue and drop counters) (plan §11). Check: the dashboard's provisioning test passes with them (FR-060) (feat/001-tunnel-end)
- [ ] T054 [P] [US4] Add the disclosure rows S16, S17, and C3, and S1's change, in the same commit as T047; C15 in the same commit as T050; the tunnel end's egress rows and C7's tunnel-end part (its deployer, ECR, the secrets store, Systems Manager, and SNS) in the same commit as T049. Write `docs/runbooks/tunnel-end.md` (a restart; a crash, a failed deploy, or a revoked key; a key's revocation; its loss; a spot interruption; a move to another zone) and the laptop runbook's tunnel part. Check: `disclosure_check` passes (FR-040, FR-056) (feat/001-tunnel-end)

### The Author's plan block

- [ ] T055 Author: as T027, with P-I3, for `ROOT=prod` (the network and the tunnel end) and `ROOT=account` (the warning rule). Check: as T027 (feat/001-tunnel-end)

### Close

- [ ] T056 Review and note. Check: as T009 (feat/001-tunnel-end)
- [ ] T057 Author: apply P-I3 on the branch, as in T055; gate; merge. Check: as T029 (feat/001-tunnel-end, then main)
- [ ] T058 Author: on `main`, verify, apply, and record both roots; run `make tunnel-keys` and write the parameters; `make secrets-check`; start the laptop's prod with the `tunnel` profile; run the scans; run `make tunnel-revoke` and restore. Check: quickstart §5, SC-006 (main)

---

## Group 6: the shared state, and the route per host (US2, US5) — `feat/001-shared-state`

**Goal**: one meter and one kill switch in RDS for both hosts, a route per host, the placeholder gate over every host route, and operator actions whichever host serves (FR-017 to FR-020, FR-067, FR-068, FR-074). **Independent test**: quickstart §6.

**Precondition**: T001's check holds. `feat/010-anthropic-switch` is on `main`: `config/routing.yaml` names `prod: { primary: local, fallback: anthropic }`, and row F3 holds the Author's adopted words, quoted in that branch's note with his weighing, "We can say nothing is retained when running local models. Refer to Anthropic if cloud models are on."

### Tests first

- [ ] T059 [P] [US2] Extend `services/gateway/test/integration/migrations.test.ts` for `0007_hosts.sql`: `host` on `ledger` and `audit_log`; `handover_events` with its checks; `relay_ro` and `relay_rw` with exactly their grants; `v_handovers` for `grafana_ro`; 0001 to 0006 byte-identical. Check: RED (data-model.md §1.2) (feat/001-shared-state)
- [ ] T060 [P] [US2] Write `services/gateway/test/integration/shared-state.test.ts`: two gateway processes against one Postgres. Paid admission at the global limit never passes a ceiling beyond spec 000's in-flight bound. One rollover at the UTC boundary, one alert per crossing, and the kill switch seen by both within 10 s. Check: RED (FR-017, FR-019; data-model.md §1.3) (feat/001-shared-state)
- [ ] T061 [P] [US2] Extend `test/unit/validate-config.test.ts` and write `test/unit/routes-per-host.test.ts`:
  - schema 2, R1 amended, H1, H2, and A1;
  - `H4_HOST` selection, and exit 78 on `ec2` with a `primary`, `laptop` with a `first`, or `ec2` with no `envs.prod.hosts.ec2` (`route_missing`);
  - EC2's calls attributed `metered`, with `fallback_day` untouched;
  - the laptop's fallback attributed `fallback`;
  - spec 010's refusals on the `ec2` route (`price_missing`, `adapter_cap_missing`, `missing_env`), tested on a fixture, since the file's `ec2` line is the Author's (T095).

  Check: RED (FR-067, FR-068) (feat/001-shared-state)
- [ ] T062 [P] [US5] Extend `evals/test_disclosure.py` with cases for `placeholder_gate`, using schema-2 routing fixtures in `evals/fixtures/routing/`: with F3 holding its placeholder, the gate fails when any host route names the Anthropic API as `first`, `second`, or `fallback`, and on schema 1's `envs.prod.fallback`; with F3 holding his adopted words, it passes on each. Check: RED, since today's gate reads `envs.prod.fallback` only (FR-068; spec 010 FR-039) (feat/001-shared-state)
- [ ] T063 [P] [US2] Extend `deploy/scripts/test_preflight.py` and `test_env_files.py`:
  - `GATEWAY_DB_URL` must use TLS on prod, and the local store is refused on `laptop` and `ec2`;
  - `GATEWAY_DB_TLS_SERVERNAME` is required with it;
  - the templates;
  - `H4_HOST` per class, and its mismatches.

  Check: RED (FR-019; contracts/env-cloud.md §2) (feat/001-shared-state)
- [ ] T064 [P] [US2] Write `scripts/test_operator_shared.py`, with a stub laptop prod and a stub store:
  - while the laptop's prod runs, `ENV=shared` uses its admin listener on `127.0.0.1:18003` and starts no stack; otherwise it composes an admin-only stack (the tunnel's `-L 5432` only, the gateway's admin listener on the same port, no relay block); it never starts that stack while prod's gateway holds the port;
  - it refuses `init` unless the store is `uninitialized`;
  - `restore` refuses unless EC2 is stopped and the laptop's prod isn't running; it prints the restored meters, sets the store `uninitialized` under the initialization lock, and keeps the ledger and the audit log; `init` then accepts the store, and refuses values lower than the printed meters;
  - each action writes an audit row with `host`.

  Check: RED (FR-019, FR-074; contracts/shared-state.md §7, §8) (feat/001-shared-state)
- [ ] T065 [P] [US3] Extend `evals/test_twin_readiness.py`: the evidence names both host routes' adapters, the laptop's local model and fallback and EC2's Anthropic API and Bedrock, read from schema 2. Check: RED (spec 010 FR-026 and spec 007 FR-031, amended by name) (feat/001-shared-state)
- [ ] T066 [P] [US2] Write `infra/test/fixtures/prod-rds/` and `infra/test/test_prod_rds.py`: rule T12, the subnet group, the parameter group (`rds.force_ssl`, no statement logging), the security group admitting only EC2's and the tunnel end's groups, and no `password` argument. Check: RED (FR-019; contracts/shared-state.md §1) (feat/001-shared-state)

### Implementation

- [ ] T067 [US2] Write `migrations/0007_hosts.sql`, and set `host` on each ledger and audit row from `H4_HOST`. Check: T059 passes (feat/001-shared-state)
- [ ] T068 [US2] Make the gateway's store connection take `GATEWAY_DB_URL` with TLS verified against the pinned RDS bundle and a server name. Emit `h4.shared_state.latency` and `h4.shared_state.errors`, labelled with `h4.host`. Check: T060 passes (FR-060) (feat/001-shared-state)
- [ ] T069 [US5] Make `placeholder_gate` read every host route's `first`, `second`, and `fallback`, as well as schema 1's `envs.prod.fallback`, before schema 2 lands. Check: T062 passes; `make test` passes on main's routing file with his adopted F3 words (FR-068) (feat/001-shared-state)
- [ ] T070 [US2] Add schema 2, the route per host, R1, H1, H2, and A1 to `src/config/validate.ts` and the router. Write `config/routing.yaml` as schema 2 with the laptop's line only, `laptop: { primary: local, fallback: anthropic }`, as main names prod's route, and no `ec2` line, which is the Author's (T095; ADR 0041). Check: T061 passes; T062 still passes on the schema-2 file; every existing gateway test passes (feat/001-shared-state)
- [ ] T071 [US2] Extend preflight, the env templates, `operator.py`'s `ENV=shared` with its choice of admin listener, the gateway's admin action for `restore`, and `make shared-state-roles` and `make operator-restore` (both Author-only). Check: T063 and T064 pass (feat/001-shared-state)
- [ ] T072 [P] [US3] Change `evals/twin_readiness.py`. Check: T065 passes; `make evals`'s exit status is unchanged by the report (feat/001-shared-state)
- [ ] T073 [US2] Write `infra/prod/rds.tf`, and the RDS endpoint's permit in the tunnel's server configuration. Check: T066 passes; `make infra-check` passes (feat/001-shared-state)
- [ ] T074 [P] [US2] Amend the other specs by name, in this branch, since its code needs them (plan §13), each passage marked "(spec 001)":
  - spec 000's FR-030 (the sub-budget is the laptop's fallback rule) and FR-031 (one shared meter for prod, in the account), its contracts/config-files.md (R1), contracts/env-files.md (`H4_HOST`, `GATEWAY_DB_URL`), its operator actions (`restore`), and data-model.md (§2 to §7: the shared store, `host`);
  - spec 010's FR-001 and FR-026, and its Out list;
  - spec 007's FR-031's evidence.

  Check: the docs-links check passes; the reviewer reads each against the FRs it serves (plan §13); the note lists every amended passage for the Author (feat/001-shared-state)
- [ ] T075 [P] [US2] Add the shared state's panel to the "Hosts" row: latency and errors per host (plan §11). Check: the dashboard's provisioning test passes (FR-060) (feat/001-shared-state)
- [ ] T076 [P] [US2] Add the disclosure rows C2 and C13, and S2's shared-state change, in the same commit as T068. Write `docs/runbooks/shared-state.md` (unreachable; the move; a restore from backup, with contracts/shared-state.md §8's five steps), and the laptop runbook's sentence that prod needs the network and an offline demo runs `make up ENV=dev` (plan Q4). Check: `disclosure_check` passes (FR-040, FR-056) (feat/001-shared-state)

### The Author's plan block

- [ ] T077 Author: run `make plan ROOT=prod` on the branch itself, since the group has no protected file, and paste the block into the note's draft. Check: as T027 (feat/001-shared-state)

### Close

- [ ] T078 Review and note, with T060's run. Check: as T009 (feat/001-shared-state)
- [ ] T079 Author: gate and merge. Check: as T029 (feat/001-shared-state, then main)
- [ ] T080 Author: on `main`, verify, apply, and record RDS; write the role passwords to Parameter Store and the laptop's env file; run `make shared-state-roles`. Then the move (data-model.md §1.5):
  1. stop the laptop's paid route, by his route change (ADR 0041);
  2. run `make operator-status ENV=prod` and record its values;
  3. run `make operator-init ENV=shared` with them and a reason;
  4. release the cutover.

  Check: quickstart §6; nothing that wasn't zero starts at zero (FR-019) (main)

---

## Group 7: EC2 (US6, US3) — `feat/001-us6-ec2`

**Goal**: the very same compose stack on a spot EC2 without the model server, with the Anthropic API first and Bedrock second; the server action; releases on three hosts (FR-013, FR-023, FR-043 to FR-051, FR-067 to FR-069, FR-073). **Independent test**: quickstart §7.

**Precondition**: T001's check holds.

### Tests first

- [ ] T081 [P] [US6] Extend `deploy/scripts/test_preflight.py`, `test_write_env.py`, and the compose policy's tests for the `ec2` class:
  - no model-server profile and no local `gateway-state`;
  - the IMDSv2 tag check, against a stub;
  - `write_env.py` refuses on a missing name, naming it, never a value;
  - the relay block bound only to EC2's private address, a literal.

  Check: RED (FR-043, FR-044, FR-050) (feat/001-us6-ec2)
- [ ] T082 [P] [US6] Extend `deploy/scripts/test_deployer.py` for three hosts:
  - EC2's boot run before the stack starts, and on a bucket it can't reach, its last release plus an alert;
  - digests per host's services;
  - the hold, rollback, and the record's `host`;
  - `h4.deploy.events` and `h4.release.info`, with who started a stack (FR-049).

  Check: RED (FR-046 to FR-049) (feat/001-us6-ec2)
- [ ] T083 [P] [US6] Write `deploy/scripts/test_release.py`:
  - one build for `linux/amd64`, and for `linux/arm64` where the `hosts` field names a Graviton host;
  - upstream copies by index digest;
  - the red-team gate on all four adapters when a release makes hello or turns public;
  - a site build with drafts refused.

  Check: RED (FR-039, FR-048) (feat/001-us6-ec2)
- [ ] T084 [P] [US6] Write `infra/test/fixtures/prod-ec2/` and `infra/test/test_prod_ec2.py`:
  - EC2's launch template, spot persistent with `stop` (T11), and standard credits if burstable;
  - IMDSv2 (T13);
  - its single interface, and the security group admitting only the tunnel end;
  - the roles `h4-prod-ec2` and `h4-prod-gateway`, both ordinary roles (R-15);
  - the model action's second target, `h4-prod-gateway`, and the server action (`AWS-StopEC2Instance` on the tag), with its execution role allowed only that document on that instance.

  Check: RED (FR-013, FR-023, FR-069) (feat/001-us6-ec2)
- [ ] T085 [P] [US3] Write `evals/sc017_ec2_routes.py`'s test, with stand-ins for both paid APIs:
  - 100 turns with both healthy, answered by the Anthropic adapter;
  - with it failing, every admitted turn answered by Bedrock;
  - `fallback_day` unchanged;
  - provider, model, tokens, and cost on each span and ledger row.

  Check: RED (SC-017) (feat/001-us6-ec2)
- [ ] T086 [P] [US6] Extend the egress proxy's allowlist test for EC2's hosts: `api.anthropic.com`, Bedrock's endpoint, Telegram, the SMTP host, and the AWS endpoints (ECR, S3, Systems Manager, STS, Budgets, and SNS for its alerts), generated from the disclosure. Check: RED (FR-051) (feat/001-us6-ec2)

### Implementation

- [ ] T087 [US6] Write `deploy/hosts/` for EC2: cloud-init, systemd units (the deployer at boot, the egress proxy, the credential timer for `h4-prod-gateway`), nftables, and `daemon.json`. Add the `ec2` class to compose and preflight, and extend `write_env.py`. Check: T081 and T086 pass (feat/001-us6-ec2)
- [ ] T088 [US6] Extend `deploy/scripts/deployer.py` and `release.py`. Check: T082 and T083 pass (feat/001-us6-ec2)
- [ ] T089 [US6] Write `infra/prod/ec2.tf`. Write `ec2-market.tf` (EC2's spot), `iam.tf` (EC2's roles), and `killswitch.tf` (the model action's second target, the server action) as P-I4. Check: on a patched copy, T084 passes, and `make infra-check` passes (feat/001-us6-ec2)
- [ ] T090 [P] [US3] Write the SC-017 harness, `evals/sc017_ec2_routes.py`, reading a routing fixture with EC2's route until the Author's line is in. Check: T085 passes against stand-ins (feat/001-us6-ec2)
- [ ] T091 [P] [US6] Add the release panel to the "Hosts" row: the release on each host, and who started a hand-started stack (plan §11; FR-049). Check: the dashboard's provisioning test passes (FR-060) (feat/001-us6-ec2)
- [ ] T092 [P] [US5] Make the disclosure's EC2 changes in the same commit as T087:
  - S2's EC2 part (EC2's allowlist, C2), F1 (EC2's second route), and F3's EC2 part (its trigger, default, and switch-off), beside his adopted words, which stay verbatim;
  - A1 and A2 from EC2, and D1's sentence;
  - V2's Why, Default, and switch-off;
  - C7's EC2 and laptop parts (EC2's deployer, ECR, the secrets store, Systems Manager, and SNS; the laptop's local release directory).

  Write `docs/runbooks/ec2.md` and `deploy.md`. Check: `disclosure_check` passes; row F3's adopted words are byte-identical to main's (feat/001-us6-ec2)

### The Author's plan block

- [ ] T093 Author: as T027, with P-I4, for `ROOT=prod` (EC2) and `ROOT=account` (the model action's second target and the server action). Check: as T027 (feat/001-us6-ec2)

### Close

- [ ] T094 Review and note. Check: as T009 (feat/001-us6-ec2)
- [ ] T095 Author: apply P-I4 on the branch, as in T093. Then add EC2's route line to `config/routing.yaml`, `ec2: { first: anthropic, second: bedrock }` (contracts/env-cloud.md §4), in his own commit on the branch: ADR 0041 makes prod's route change his, so no agent writes it. Gate; merge. Check: the gate passes, `make test`'s placeholder gate among it, over the `ec2` route with his adopted F3 words (FR-068) (feat/001-us6-ec2, then main)
- [ ] T096 Author: on `main`, verify, apply, and record both roots. Write EC2's secrets, among them the Anthropic key in Parameter Store. Set the Anthropic account's monthly spend limit at or under $20 where the account offers one, and record that it is set (FR-073). Run the first `make release`, then start EC2 from the console (`make ec2-start` arrives in group 9). Check: quickstart §7 (FR-068) (main)
- [ ] T097 Author: run SC-017's recorded run, then destroy and recreate EC2. Check: SC-017; SC-005, the digests match and the shared state is unchanged (main)

---

## Group 8: the edge and the relay (US3, US5) — `feat/001-us3-us5-edge`

**Goal**: hareet.ai over TLS from the edge, the relay on the tunnel end picking the host, the disclosure live (FR-027 to FR-042, FR-061, FR-066, FR-075). **Independent test**: quickstart §8. The site stays unannounced until group 9 ends.

**Precondition**: T001's check holds.

### Tests first

- [ ] T098 [P] [US3] Write `services/relay/test/**`, contracts/relay-http.md's suite, with stub hosts and a stub store:
  - the listeners and the peer rule;
  - the order of §3: the probe mark, the address, the cap, the kill switch's 10 s rule, the host, the forward and its headers;
  - the cap sized from a `public` section in a test fixture, and a refusal to start while the section is missing or a figure is blank;
  - the host choice's thresholds, and the retry on the other host only before the request was sent;
  - `no_host_serving`; a host's 502 or 504 becoming a 503 with its cause;
  - `handover_events` rows and the gap;
  - the status document;
  - no body kept, no address logged;
  - the kill switch reaching the relay within 10 s.

  Check: RED (FR-029 to FR-037, FR-054, FR-066; SC-008) (feat/001-us3-us5-edge)
- [ ] T099 [P] [US3] Extend `evals/breach.py` and its test: the relay, in `dev-relay` on dev-cpu, answers degraded within 10 s of the trip, and forwards again after the reset. Check: RED (FR-025) (feat/001-us3-us5-edge)
- [ ] T100 [P] [US5] Extend `apps/web/test_site.py`: no absolute URL to another host; the disclosure page matches the Markdown, with the new rows; `/_degraded/api.json` is spec 000's degraded body with `no_host_serving` and `stack` null. Check: RED (FR-038, FR-041, FR-066) (feat/001-us3-us5-edge)
- [ ] T101 [P] [US5] Write `evals/visitor_scan.py`'s test. It scans every store on each host, plus the shared state, the relay's logs, and the tunnel end's, for a marker message and address after a scripted visit. Check: RED (FR-042, SC-011) (feat/001-us3-us5-edge)
- [ ] T102 [P] [US3] Add red-team cases for hello and twin turns on the paid adapters, in `redteam/cases/`: claiming to be the Author, disparaging, revealing configuration. They run on the laptop's local model and fallback and on EC2's Anthropic API and Bedrock. Check: the cases load, and RED against a stub that fails them (FR-039) (feat/001-us3-us5-edge)
- [ ] T103 [P] [US3] Extend `apps/web`'s tier tests: `no_host_serving` and `host_error` show `cannot_talk.resting`, and `public_cap` shows `turn_refused.slow_down`. Check: RED (FR-066; spec 002's contract §3, amended by name) (feat/001-us3-us5-edge)
- [ ] T104 [P] [US3] Write `infra/test/fixtures/prod-edge/` and `infra/test/test_prod_edge.py`:
  - the zone and its records; the certificate;
  - the distribution's aliases, behaviors, origins (OAC; the VPC origin to the tunnel end's private interface), policies, and headers;
  - error responses (502 and 504 to 503 with `/_degraded/api.json`, TTL 0);
  - no access logs;
  - CloudFront's policies only in `edge-limits.tf` (rule T5);
  - the probe's schedule enabled in `infra/account/alerts.tf`.

  Check: RED (FR-027 to FR-029, FR-061) (feat/001-us3-us5-edge)

### Implementation

- [ ] T105 [US3] Write P-6 as `docs/merge-requests/<date>-feat-001-p6-public-cap.patch`, before the relay's code: `config/budgets.yaml`'s new `public` section, with keys for the per-address requests a minute, burst, and requests a day, and the global in-flight limit, each figure left blank and marked as the Author's (FR-033; plan §14). The ADR for the public cap (T007) names it. Check: the patch applies to a fresh export; on a patched copy, the gateway's validator refuses the blank figures, naming each key (feat/001-us3-us5-edge)
- [ ] T106 [US3] Write `services/relay/` (Fastify on Node 24, a second npm workspace, the gateway's pins), and `relay` in compose's `tunnel-end` and `dev-relay` profiles. Make the gateway's validator accept the `public` section. Add the relay's spans and metrics (`relay.request`, `h4.relay.host`, `h4.relay.requests`, `h4.relay.host_healthy`, `h4.serving_host`, `h4.cap.refused`, `h4.handover.events`, `h4.handover.gap_seconds`). Check: T098 and T099 pass, with test figures in the tests' own fixtures (FR-060) (feat/001-us3-us5-edge)
- [ ] T107 [US3] Write `infra/prod/{edge,dns,site}.tf`. Write P-I5: CloudFront's policies in `infra/prod/edge-limits.tf`, which rule T5 protects, and the one line in `infra/account/alerts.tf` that enables the probe's schedule. Check: on a patched copy, T104 passes, and `make infra-check` passes (feat/001-us3-us5-edge)
- [ ] T108 [US5] Change `apps/web`: the status page's links, the disclosure page's new rows, and `/_degraded/api.json` built from spec 000's schema. Amend spec 002's contract §3 by name, with the tier mapping. Check: T100 and T103 pass (feat/001-us3-us5-edge)
- [ ] T109 [P] [US5] Write the visitor scan, and the red-team runner's support for the four adapters. Check: T101 and T102 pass (feat/001-us3-us5-edge)
- [ ] T110 [P] [US3] Add the relay's panels to the "Hosts" row: which host serves (a state timeline), the handovers and their gaps (from `v_handovers`), the relay's requests by host and outcome, and the cap's refusals (plan §11). Check: the dashboard's provisioning test passes (FR-060) (feat/001-us3-us5-edge)
- [ ] T111 [P] [US5] Add the disclosure rows V1, V2's path, V4, V6 to V9, C1, C14, and S15, in the same commit as T106 and T107. Check: `disclosure_check` passes (FR-040) (feat/001-us3-us5-edge)

### The Author's plan block

- [ ] T112 Author: as T027, with P-I5, for `ROOT=prod` (the edge) and `ROOT=account` (the probe's schedule). Check: as T027 (feat/001-us3-us5-edge)

### Close

- [ ] T113 Review and note. Check: as T009 (feat/001-us3-us5-edge)
- [ ] T114 Author: write his figures into P-6 and into the public cap's ADR, and apply P-6 on the branch; apply P-I5, as in T112; gate; merge. Check: the gate passes, and the gateway's validator accepts his figures (FR-033) (feat/001-us3-us5-edge, then main)
- [ ] T115 Author: on `main`, point the registrar's name servers at the zone and record it (contracts/infra-records.md §2). Verify, apply, and record both roots (the edge, and the probe's schedule); deploy the relay to the tunnel end. Run the red-team cases on all four adapters, and record that they pass. Confirm the tunnel end's measured memory on its `t4g.micro` (R-33). Check: quickstart §8 (FR-039) (main)

---

## Group 9: the handover (US4, US7) — `feat/001-us4-us7-handover`

**Goal**:
- one host at a time;
- EC2 woken when the laptop goes, and stopped when it serves;
- EC2's restarts guarded, the server budget's action among the reasons;
- the autostart switch (`on` lets EC2 start automatically);
- both instances' spot interruptions handled;
- the handover's and the server's state on the dashboard.

(FR-060, FR-063 to FR-066, FR-069 to FR-072, FR-076.) **Independent test**: quickstart §9.

**Precondition**: T001's check holds.

### Tests first

- [ ] T116 [P] [US4] Write `infra/lambdas/ec2_start/test_start.py`, with stub SSM, Budgets, EC2, and Route 53:
  - step 1 refuses with `paused` while the autostart switch is `off`;
  - step 2 with `server_budget_stopped`;
  - step 3 with `tunnel_end_down`;
  - step 4 with `laptop_serving`, when invoked by hand or `from: tunnel_end_back`;
  - step 5 starts only the tagged instance, and `start_failed` carries AWS's code;
  - one attempt per invocation;
  - one alert and one embedded-metric log line per outcome.

  Check: RED (FR-065, FR-070, FR-076) (feat/001-us4-us7-handover)
- [ ] T117 [P] [US7] Write `infra/lambdas/ec2_guard/test_guard.py`, with stub SSM, Budgets, EC2, and Route 53:
  - it stops EC2 when the health check is healthy (`ec2_stopped_laptop_serving`);
  - when the autostart switch is `off` (`ec2_stopped_paused`);
  - when the server budget's action has run and isn't reversed (`ec2_stopped_server_budget`);
  - it does nothing otherwise, and stops only the tagged instance;
  - one alert and one embedded-metric log line per stop.

  Check: RED (FR-071) (feat/001-us4-us7-handover)
- [ ] T118 [P] [US4] Write `deploy/scripts/test_handover.py`, with a stub status and a stub EC2:
  - waiting reads `serving`, then stops EC2 once it is `laptop` and records the window;
  - serving stops EC2 again after a flap, and after a start on the tunnel end's return while the laptop was reconnecting;
  - an expired session alerts once and keeps serving;
  - `make up` never fails on a failed stop.

  Check: RED (FR-063, FR-064) (feat/001-us4-us7-handover)
- [ ] T119 [P] [US4] Write `infra/test/fixtures/handover/` and `infra/test/test_handover.py`:
  - the health check on the tunnel end's address, port 8087, `/health`;
  - the alarm;
  - the rules: the alarm's change, EC2's warning, EC2's `running`, and the tunnel end's `running` to the start function and the alert;
  - the two functions' roles, the guard's with its read of the server action's status (`budgets:DescribeBudgetActionsForBudget` on `h4-server-month`);
  - the tunnel end's role, with its reads for the dashboard and its one-key write for `site/status/latest.json` (R-15);
  - the autostart switch's parameter with `ignore_changes`;
  - each of these only in protected files.

  Check: RED (FR-012, FR-065, FR-071, FR-072) (feat/001-us4-us7-handover)
- [ ] T120 [P] [US7] Write the tests of `make ec2-status`, `ec2-start`, `ec2-stop`, `ec2-autostart`, and `server-budget-restore`, with stubs: each is refused in an agent session; `ec2-start` invokes the function with `manual: true`; `ec2-autostart STATE=on` writes the switch, invokes the start once, and writes the audit row. Check: RED (FR-012, FR-065) (feat/001-us4-us7-handover)
- [ ] T121 [P] [US7] Write `deploy/scripts/test_snapshot_cloud.py`, with stub EC2, SSM, Route 53, Budgets, and CloudWatch: each of the sink's cloud reads (contracts/public-view.md §2) becomes its metric; a failed read is counted as an error, never shown as a fresh value; no secret, account ID, or address in a label. Check: RED (FR-060, FR-065) (feat/001-us4-us7-handover)

### Implementation

- [ ] T122 [US4] Write `infra/lambdas/ec2_start/` and `ec2_guard/`. Check: T116 and T117 pass (feat/001-us4-us7-handover)
- [ ] T123 [US4] Write `deploy/scripts/handover.py`, started by `make up ENV=prod` and stopped by `make down ENV=prod`, with `h4.handover.window_seconds`. Check: T118 passes (FR-060) (feat/001-us4-us7-handover)
- [ ] T124 [US4] Write `infra/prod/failover.tf`, `infra/account/handover.tf`, and the roles' changes in `iam.tf` as P-I6. Check: on a patched copy, T119 passes, and `make infra-check` passes (feat/001-us4-us7-handover)
- [ ] T125 [P] [US7] Write the `make ec2-*` and `server-budget-restore` targets. Check: T120 passes (feat/001-us4-us7-handover)
- [ ] T126 [US7] Write the sink's cloud reads in `deploy/scripts/snapshot_sink.py`, and `snapshot-sink` in the `tunnel-end` profile, exporting the metrics through the tunnel end's collector (C15). Check: T121 passes (FR-060) (feat/001-us4-us7-handover)
- [ ] T127 [P] [US7] Add the handover's and the server's panels to the "Hosts" row: EC2's state and interruptions; its starts and refusals and the guard's stops; the autostart switch; the health check's status; the handover window; and the server's month against its budget beside model spend against the ceilings and the adapter's month (plan §11; User Story 7). Check: the dashboard's provisioning test passes (FR-060, FR-065) (feat/001-us4-us7-handover)
- [ ] T128 [P] [US4] Write `docs/runbooks/handover.md` (with EC2 started on the tunnel end's return while the laptop reconnects, and stopped by the loop) and `spot-interruption.md`, and update `tunnel-end.md` and `server-budget.md` (the guard's `ec2_stopped_server_budget`). Add the disclosure row C6 and C5's change. Check: each alert kind of contracts/aws-alerts.md §2 names its runbook; `disclosure_check` passes (FR-040, FR-056) (feat/001-us4-us7-handover)

### The Author's plan block

- [ ] T129 Author: as T027, with P-I6, for `ROOT=prod` (the health check, the tunnel end's role) and `ROOT=account` (the alarm, the rules, the functions, their roles, the autostart switch). Check: as T027 (feat/001-us4-us7-handover)

### Close

- [ ] T130 Review and note. Check: as T009 (feat/001-us4-us7-handover)
- [ ] T131 Author: apply P-I6 on the branch, as in T129; gate; merge. Check: as T029 (feat/001-us4-us7-handover, then main)
- [ ] T132 Author: on `main`, verify, apply, and record both roots; set the autostart switch `on`, so EC2 may start automatically; release the tunnel end's new `snapshot-sink`. Check: User Story 1's scenario 10, a fresh plan after a handover shows no change (FR-072) (main)
- [ ] T133 Author: rehearse the handover and the interruptions, as quickstart §9 lists them:
  - ten handovers each way (SC-007);
  - the autostart switch and the guard;
  - five spot interruptions of EC2 and three of the tunnel end (SC-018), through AWS's fault-injection service or the console's interruption test, as priced in T017.

  Check: SC-007, SC-018 (main)
- [ ] T134 Author: write the resting message's new words through spec 002's follow-up (plan Q5, provisional; P-5), or keep them. Then make the first public release. Check: SC-001 over a day; SC-010 with the browser's network log; SC-011's visitor scan (main)

---

## Group 10: the public view (US8) — `feat/001-us8-public-view`

**Goal**: the public view never goes dark (FR-057 to FR-059). **Independent test**: quickstart §10. The dashboard's panels arrived with their features, in groups 5 to 9.

### Tests first

- [ ] T135 [P] [US8] Write `deploy/scripts/test_snapshot.py`:
  - the sink refuses each forbidden kind of field;
  - it writes the cloud part while no host serves;
  - a stale host part keeps its time;
  - the publisher posts only while its host serves, read from the relay's status.

  Check: RED (FR-057 to FR-059) (feat/001-us8-public-view)
- [ ] T136 [P] [US8] Extend `apps/web`'s tests for `/status/`: it renders each part with its time, names `none` while no host serves, shows the handovers and their gaps, and shows the server's month beside its budget and model spend beside the ceilings. It names `none` when `latest.json` names a host but `/api/status` gives the edge's degraded answer (503, `no_host_serving`, `stack` null) or none, as while the tunnel end is gone, and shows the document's values as last-known. Check: RED (SC-013; FR-057) (feat/001-us8-public-view)

### Implementation

- [ ] T137 [US8] Write `snapshot_publisher.py` and the sink's document part in `snapshot_sink.py`, and the publisher's compose service on both hosts. The sink's write uses the tunnel end's one-key grant from group 9 (T124). Check: T135 passes (feat/001-us8-public-view)
- [ ] T138 [US8] Write `/status/`, taking the serving host from `/api/status` first (contracts/public-view.md §3). Check: T136 passes (FR-057, FR-059) (feat/001-us8-public-view)

### Close

- [ ] T139 Review and note. Check: as T009 (feat/001-us8-public-view)
- [ ] T140 Author: gate and merge. Check: the gate passes (feat/001-us8-public-view, then main)
- [ ] T141 Author: on `main`, release; then, with both hosts off for an hour, check `/status/`; then start a host and check that the values are fresh within 5 minutes. Check: SC-013 (main)

---

## Group 11: the close (Polish) — `feat/001-close`

- [ ] T142 [P] Write the success-criteria table in spec.md's merge-request note, with each SC, its run, and its record. Complete the runbooks: every alert of this spec names one (FR-056). Check: the docs-links check passes (feat/001-close)
- [ ] T143 [P] Link the README to the ADRs, the public view, and the disclosure. Check: SC-014, two clicks from the README (feat/001-close)
- [ ] T144 [P] Bring the matrix to zero planned rows. Check: `make check`'s matrix summary shows zero failures and zero planned rows (feat/001-close)
- [ ] T145 Review and the final note. Check: as T009 (feat/001-close)
- [ ] T146 Author: gate and merge. Check: the gate passes (feat/001-close, then main)
- [ ] T147 Author: after the first full month, read AWS's cost data and the meter. Check: SC-002, the server's cost against his figure; SC-003, model spend against the ceilings, with Bedrock's and the Anthropic account's usage each at or under the meter; SC-016, from `handover_events` and EC2's state history (main)
- [ ] T148 Author: the credential audit's weekly results, and every infrastructure change's block and record. Check: SC-004, SC-012. Spec 001 is done when SC-001 to SC-018 pass (but SC-015, moved) and the matrix shows zero failures and zero planned rows (main)
- [ ] T149 Author: apply P-4, his own words for intent 000's cost and hosting constraints and this folder's intent's cost lines, whenever he chooses (spec Assumptions, "The intents' lines"). Check: the intents read as he wrote them (main)

---

## Dependencies and execution order

- **T000** first, then **T001**, the constitution, as the default order he confirms at T000. Then the groups in order: each branch is cut from `refs/heads/main` after the one before it merges.
- **T001's check** is a precondition of groups 3 to 9. T020, group 3's first test task, writes the first file under `infra/`.
- **Within a group** (plan §16): the tests, which fail; the code, each feature with its span, panel, runbook, and disclosure row; the Author's plan block on the branch (groups 3 to 9); the review and the note; his patches, the gate, and the merge; his apply and other steps on `main`.
- **Inside group 6,** T069 (the placeholder gate) lands before T070 (schema 2). **Inside group 8,** T105 (P-6's draft) comes before T106 (the relay).
- **Cross-group dependencies:**
  - group 5 needs group 4's alert path for the tunnel end's warning;
  - group 6 needs group 5's tunnel for the laptop's connection to the store, and `feat/010-anthropic-switch` on `main`;
  - group 7's server action and model-action target need EC2's role, and its first release needs group 6's store;
  - group 8's relay needs groups 5 to 7;
  - group 9's loop reads the relay's public status, and its sink reads export through group 5's collector;
  - group 10's document needs group 9's cloud reads and write grant, and the relay and the shared state.
- **What can run in parallel:** inside a group, the [P] tasks. Across groups, nothing, since each group's branch builds on the last.

## The Author's tasks, in one list

| Task | What |
|---|---|
| T000 | approve the spec and the plan; confirm or overturn plan Q5 to Q7 and question 16; answer plan Q8; confirm T001's order |
| T001 | apply the constitution 1.1.0 as amended, with his Q8 wording if A; accept ADR 0044 |
| T008, T010, T011 | choose the Terraform pins (the agent writes them, with `make infra-mirror` and `make aws-login`); apply P-1 and P-3, gate, merge; seed the mirror |
| T017, T019 | price the lines; set the server budget's figure; gate, merge |
| T027, T029, T030 | the bootstrap's plan block; P-I1, gate, merge; apply: state, budgets, alerts; migrate the state; the tags; the email subscription |
| T037, T039, T040 | the safety net's plan block; P-I2, gate, merge; apply and import; the laptop's Bedrock profile; the Telegram parameters; the rehearsals, with the rehearsal instance started first |
| T055, T057, T058 | the tunnel end's plan block; P-I3, gate, merge; apply both roots; the tunnel keys; the scans |
| T077, T079, T080 | RDS's plan block; gate, merge; apply; the role passwords; move the meter |
| T093, T095 to T097 | EC2's plan block; P-I4 and EC2's route line, gate, merge; apply; the secrets; the Anthropic account's limit; the first release; SC-017; SC-005 |
| T112, T114, T115 | the edge's plan block; P-6 with his figures, P-I5 (CloudFront's policies and the probe's schedule), gate, merge; the name servers; apply both roots; the red-team runs |
| T129, T131 to T134 | the handover's plan block; P-I6, gate, merge; apply; the rehearsals; the resting words; the first public release |
| T140, T141 | gate, merge; the public view's hour |
| T146 to T149 | gate, merge; the month's measurements; the audit; the intents' words |
