---

description: "Task list for spec 001, Cloud Elevation: EC2 as prod's default host, the laptop when the Author runs it"
---

# Tasks: Cloud Elevation — Terraform, One Account, EC2 as Prod's Default Host

**Input**: the documents in `specs/001-cloud-elevation/`:
- [spec.md](spec.md): FR-001 to FR-076, SC-001 to SC-018 (SC-015 moved), User Stories 1 to 8, and Clarifications, including the Author's answers to the plan's questions 1 to 4;
- [plan.md](plan.md): §1 to §17, the patches P-1 to P-6, P-I1 to P-I7, P-G1, P-G2, and P-W2, the task groups and four gates of §16, and its risks;
- [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), and [quickstart.md](quickstart.md).

It replaces the September task list (`tasks.md` at 00309c47). Revised on 2026-11-09 after `/speckit-analyze` over 8acc2686: the tasks are renumbered, and the note's 2026-11-09 section maps the old numbers to the new. **Regrouped on 2026-11-12,** in W1's first commit, for the Author's four gates (Organization; plan.md §16, "Four gates"; the note `docs/merge-requests/2026-11-13-spec-001-w1-regroup.md`). No ID is renumbered. New tasks start at T156.

**Prerequisites**:
- **T000** (the Author's approval of spec.md and plan.md) comes before every other task. CLAUDE.md: "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`."
- **T001** (the Author applies the amended constitution 1.1.0) comes next, before any group, as the default order he confirms at T000. Its check is a precondition of every group that touches `infra/` (groups 3 to 9). T020 writes the first file under `infra/`.
- **The provisional answers:** the plan's questions 5 to 7, and the spec's question 16, were taken as the session's defaults, not his words. His approval at T000 leaves them standing. A different answer later still changes the tasks that cite that question before they start.
- **Question 8** (the relay on spot, against the Cloud standard's "must be always-on") was asked at T000. His approval chooses neither option; the session takes option A provisionally, as it took Q5 to Q7, so T001 applies his wording in the 1.1.0 patch, on `docs/001-ec2-default`, which he writes or confirms then. Done: T001 applied it (3c89a8b0).
- **The named deviation:** his approval directs group 1 to be built before T001 (spec.md Assumptions, "The constitution first"). Nothing merges and nothing is applied before T001, and groups 3 to 9 still check it first. Ended at T001 (3c89a8b0).
- **Groups 1 to 4 land together** (2026-11-10). The Author's words: "Let's gropu them together to make them minimal and hand-merge if we have to". He merged the four branches by hand into `feat/001-cloud-elevation` (13ba1a0f), and the session merged `main` and re-applied group 1's text where `-X ours` took the later groups' (plan.md §16, "Groups 1 to 4, as one branch"). So T010, T019, T029, and T039 are one gate and one merge, of his branch `feat/001-cloud-elevation-p` with P-1, P-3, P-I1, P-I2, and both lockfiles; the open review passes are one review; T011's mirror comes before the lockfiles; and T037 waits for T030, the deviation spec.md's Assumptions name ("One gate for groups 1 to 4"; his answer: "One gate, named deviation (Recommended)"). The combined note, `docs/merge-requests/2026-11-10-feat-001-cloud-elevation.md`, holds his steps; each group's own note stays as its record.

**Tests**: required. In each group the test tasks come first and must fail (RED) before the code that makes them pass (GREEN), and the branch's note records both runs. Terraform has no agent-run tests beyond the offline checks: `terraform test` is refused to agents (FR-006). Its proofs are the policy's fixtures, `make infra-check`, the redacted plan in the note, and the Author's quickstart runs.

**Organization** (regrouped 2026-11-12):
- **Eleven groups, four gates.** The groups stay as plan §16 lists them, built in that order. They merge through four gates, by the Author's answers: "Let's do the least amount of gates as possible", then "4 gates in all (Recommended)", and, on building later groups in parallel, "Might as well do it in our original order" (spec.md Assumptions, "Four gates for spec 001"):
  - **Gate A:** groups 1 to 4, merged and applied on 2026-11-12, with the fixes after it (T150 to T156).
  - **W1:** groups 5 to 10. Each group's branch is stacked on the one before, starting from this regrouping commit (`spec/001-w1-regroup`), each in its own worktree. One gate takes the Author's `-p` copy of group 10's tip, with W1's patches (T171, T172). A resource that needs an earlier apply waits behind a switch, `local.wired = false` (plan §16, "Why a switch").
  - **W2:** the Author's switch-on patch, P-W2, and the new functions' image digests, planned after W1's applies (T174 to T178).
  - **Close:** group 11 and the records (T142 to T149).
- **The order inside W1** (plan §16):
  1. each group in turn: its tests, which fail first; its code, each feature with its span, its dashboard panel, its runbook, and its disclosure row (the constitution's Development Workflow step 7); a review by an agent that wrote none of the group; and its note. The next group's branch starts from this one's reviewed tip;
  2. the tunnel end's measurement and the Author's prices (T166, T167), since the tunnel end's instance type is in prod's block;
  3. the Author's patches on a scratch clone, and his plan blocks, one per root: bootstrap, account, and prod (T171);
  4. his patches on the `-p` branch, byte for byte, his route line, the gate (`tools/gates/gate <branch>` from main's checkout), and his merge (T172);
  5. his applies on `main`, in the order bootstrap, then account, then prod (T173), and his steps there, in "Dependencies" order.
- **The per-group tasks that become W1's or W2's.** Each group's plan-block, gate, and apply tasks keep their IDs, and each says **Combined (W1)** and where its part went. The plans that read another root's resources before that root is applied, T055, T093, T112, and T129, were impossible as written. What names an instance or a health check moves into prod, beside it, and is W1's; what needs an earlier apply waits behind the switch and is W2's (plan §16, W1's departures 2 and 3).
- **The plan block before the patches.** The gate's `infra-plan-note` step ties the block to `infra/`'s tree hash on the branch, and the protected files reach the branch only with his patches, after the review. So he makes the block from a scratch clone of the branch, with the gate's patches applied and committed there. He then commits the same patches, byte for byte, on the branch, and `infra/`'s tree hash is the one the block names.
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

  An agent task writes such a change as a `.patch` beside the branch's note. The plan's patches keep their names, P-1 to P-6 (plan §14); the protected Terraform arrives as P-I1 to P-I6, one per group that has any. From W1 there are five more: P-I7, group 6's, which had none before (T073); P-G1, the policy's list of taggable types (T158); P-G2, the guards for W1's new Author-only targets (T165); P-G3, the compose policy's host classes (group 5, T044 and T049; plan.md §16, group 5's departure 5); and P-W2, the switch-on (T175). It builds the patch from plain copies (`git show`, `git diff --no-index`), never by `git apply` or a write into any worktree.

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
  - **What his approval takes** (spec.md Clarifications, Session 2026-11-10; plan.md Status): the spec and the plan, with §13's amendments and its list of the other specs' amendments; plan Q5, Q6, and Q7, and question 16, at their provisional defaults, the session's answers, which his approval leaves standing; plan Q8 at option A, taken provisionally under the session's reading of his approval, as Q5 to Q7 are, with the wording in the unapplied 1.1.0 patch his to write or confirm at T001; and, as the session's reading of his approval, T001 as the default order before any group touches `infra/`, the ADRs proposed until his merges, and T008's pins at the latest releases established on 2026-11-10, confirmed by him at T011.
  - **The deviation his words name:** "build it out … you can have everything ready and verified by then" has group 1 built before T001 (spec.md Assumptions). T001 stays his. Nothing merges and nothing is applied before it. T001 is done (3c89a8b0).
  - **Open: T000's gate and merge of the documents,** so the task stays unticked. `feat/001-guards` was cut at `spec/001-cloud-elevation`'s tip, d3c7ee02, so its merge carries them; or he merges `spec/001-cloud-elevation` first. Either way, after T001. **Combined (2026-11-10):** `feat/001-cloud-elevation` holds `feat/001-guards`, so its one merge carries them. **Done:** gate A's merge carried them (the applies of 2026-11-12 ran from `main` after it).
- [x] T001 Author: apply the constitution's amendment 1.1.0, as amended on `docs/001-ec2-default` with the two sentences he chose to add (plan Q3), and with his Q8 wording if he chose A (P-2). Accept ADR 0044. This is the default order, before any group; he confirms it at T000. Check: `.specify/memory/constitution.md` on `refs/heads/main` reads "**Version**: 1.1.0"; ADR 0044's Status reads accepted. Groups 3 to 9 each check this first (main)
  - **Done by the Author:** constitution 1.1.0 applied (3c89a8b0), with question 8's option A in the Cloud standard's words "the thin API/relay on spot capacity where the Author accepts the gap (ADR 0044)"; ADR 0044 accepted (67028747).

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
  - **Done 2026-11-10** in P-1 (`docs/merge-requests/2026-11-10-feat-001-p1-guards.patch`): 162 new stage H rows and 3 stage S rows, with 163 IDs in `tools/gates/matrix-required.txt` (the stage S marker among them); 8 of the stage H rows are gap rows (a name held in a variable, a shell function or alias, a copy of the binary, a name built at run time, `make plan $(echo ROOT)=…`, and a shell write to a protected file). RED on the unpatched export: 103 failures. GREEN on a patched export: 910 passed, 0 failed. T009's review (B6, nit 5) added 18 stage H rows, for 180 and 181 IDs: RED 14 failures before their rules, GREEN 928 passed, 0 failed. Group 3's `TF_VAR_bedrock_service_names` added one settings row, for 181 and 182 IDs: RED 1 failure before its deny, GREEN 929 passed, 0 failed (the note).
- [x] T004 [P] Write `tools/gates/test/test_infra_policy.py`, `test_infra_redact.py`, `test_infra_plan_note.py`, and `test_disclosure_check.py` on the export. They need fixtures for rules T1 to T13 (each passing and failing), redaction (12-digit runs, emails, sensitive values, a secret pattern refused), the plan note's tree hash, and the disclosure against compose services, sshd permits, egress-proxy hosts, CloudFront origins, EventBridge targets, and open security-group rules. Check: RED (feat/001-guards)
  - **Done 2026-11-10** in P-1: 106 tests over the four checkers, and T009's I1 added 14, and group 3's three post-review findings 12 more, for 132. RED: all four files fail to collect without their modules; I1's fixtures fail 12 of 14 before its code, and group 3's 8 of 12 (the note).

### Implementation

- [x] T005 Write P-1 as `docs/merge-requests/<date>-feat-001-p1-guards.patch`, from plain copies of `main`'s files, by plan §2's list:
  - `.claude/hooks/bash-gate.sh`'s Terraform rules and Author-only targets;
  - `.claude/settings.json`'s denies (`*.tfstate*`, `*.tfplan`, `*.tfvars*`) and `credentials.envVars` (`TF_VAR_*`, `AWS_*`, `TF_CLI_ARGS*`, `GATEWAY_DB_URL`, `GATEWAY_DB_TLS_SERVERNAME`, `RELAY_TOKEN_*`, `SNAPSHOT_SINK_TOKEN`, `TELEMETRY_BLOCK_TOKEN`, `DB_*_PASSWORD`);
  - `.claude/hooks/protected-paths.sh`'s Terraform globs;
  - `tools/gates/infra_policy.py`, `infra_redact.py`, `infra_plan_note.py`, `disclosure_check.py`, and the compose policy's host rules;
  - the gate's `infra-plan-note` and `infra-check` steps;
  - T003's rows and T004's tests.

  Check: `patch -p1 --dry-run` applies it cleanly to a second fresh export; on a patched export, T003's rows and T004's tests pass, and the agent-config tiers pass (FR-004 to FR-006, FR-011, FR-012) (feat/001-guards)
  - **Done 2026-11-10:** P-1, 17 files. Two departures, in plan §2: the compose policy's host rules move to groups 5 and 7, and the gate runs no `terraform`. `patch -p1 --dry-run` applies it cleanly to a fresh export of `refs/heads/main` and to an export of the branch; on a patched export of the branch the matrix (929 passed, 0 failed), the 1,471 gate tests, `make toolchain-check`, and the static tier pass (the note).
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
  - **Done 2026-11-10:** `make infra-mirror` (`scripts/infra/infra_mirror.py`), `make aws-login PROFILE=h4reet-…` (`deploy/scripts/aws-sso-profile.sh`), and the pins in `.devcontainer/toolchain.vars`: Terraform 1.17.1, `hashicorp/aws` 6.72.0, the AWS CLI 2.29.1 (research.md R-02). "At the versions the Author chooses in his terminal": his T000 words ask for the latest, and he confirms them at T011. On a patched export `make toolchain-check` passes and the bash gate refuses both targets (the note).

### Close

- [x] T009 Review by an agent that wrote none of the group, and the note. Check: the note holds `make check`'s and `gitleaks dir`'s whole output, and lists P-1 and P-3 first under "For the Author" (feat/001-guards)
  - **Done:** group 1's review, and the combined review of 2026-11-10 with group 4's second pass of 2026-11-11 (`docs/merge-requests/2026-11-10-feat-001-cloud-elevation.md`, Review).
- [x] T010 Author: apply P-1 and P-3 on the branch from the note's patch files, run `tools/gates/gate feat/001-guards` from main's checkout, and merge. Check: the gate passes; the matrix shows zero failures and no gap beyond the listed gap rows (feat/001-guards, then main)
  - **Combined (2026-11-10):** one gate with groups 2 to 4, of `feat/001-cloud-elevation-p` (Prerequisites). P-E, the agents' engine's half of P-1 (`docs/merge-requests/2026-11-10-feat-001-pe-engine.patch`), is applied after P-1 there (plan.md §16, "Groups 1 to 4, as one branch", 7).
  - **Done:** gate A, merged; the bootstrap's apply of 2026-11-12 ran from `main` at 0ada646b (`docs/infra/applies/2026-11-12-bootstrap.md`).
- [x] T011 Author: on `main`, run `make infra-mirror`, which seeds `~/.local/share/h4reet/terraform-providers`. Check: `make check`'s `infra-check` step reads PLANNED until `infra/` exists (quickstart §1) (main)
  - **Combined:** the mirror is seeded before the gate, from his branch's checkout, since both lockfiles need it; the checks run on `main` after the merge, where `infra/` now exists, so `infra-check` runs its checks instead of reading PLANNED (plan.md §16, "Groups 1 to 4, as one branch", 4).
  - **Done:** both lockfiles and the plans of 2026-11-11 and 2026-11-12 were made from the seeded mirror.

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
  - **After T018's review** (eb0d3495 RED, c1e313c0 GREEN; the note's Review): the turns open the three ready pieces instead of free talk; the rates fit the turns' client inside its daily cap; Ctrl-C, SIGTERM, and SIGHUP all put the stack back; and the record puts the stub's answered share beside the peaks. T012's file now holds 72 tests.
- [x] T015 Write `deploy/scripts/arch_inventory.py`, offline against the seeded store (`docker buildx imagetools inspect`). Check: T013 passes (feat/001-measure)
  - **Done 2026-11-10,** with `make arch-inventory`. One departure (plan.md §16, group 2's departure 1): imagetools asks the registry, so the script reads the store through the Engine API's index view. GREEN: T013's tests pass, 21 here and the unix-socket one skipped, since the sandbox refuses unix sockets. The script also read the agents' engine's real store (the note). After T018's review it refuses a named docker context, as its docstring says (23 tests, one skipped here).
- [x] T016 Run the measurement on `dev-cpu` and the inventory. Record each service's peak memory, the disks' sizes, and which images lack arm64 in research.md R-33 and the note, with the run's length and load. Check: the record names the smallest instance types that fit, by memory alone; no price is written (R-33) (feat/001-measure)
  - **The inventory ran on 2026-11-10;** it is read-only. Every image EC2 runs has `linux/arm64` (research.md R-33's record).
  - **The measurement ran on 2026-11-11** (06962036): research.md R-33 holds the record. It had waited for 30 GB free on C:, 16 GB of memory, an engine with no other session, and the Author's checkout on the branch, since dev-cpu runs from the main working tree.
- [x] T017 Author: price research.md R-05's lines from AWS's pages in his terminal:
  - EC2's measured types on spot, and an 8-to-12-hour day for the reserve;
  - the tunnel end's `t4g.micro` on spot, and its Elastic IP;
  - RDS's smallest Graviton class and its storage;
  - the Route 53 health check;
  - the fault-injection service for the rehearsals;
  - the rehearsal `t4g.nano`, `h4-rehearsal-instance`;
  - the "to confirm" lines, the tunnel end's Elastic IP among them.

  Then set the server budget's figure as `TF_VAR_server_budget_usd` in `~/.config/h4reet-ai/infra/bootstrap.env`. He records his prices on the branch, in his own commit. Check: research.md R-05's lines carry his prices and their dates, with the figure where he chooses to record it (FR-021, FR-022) (feat/001-measure)
  - **Done 2026-11-11, but for the confirmations** (2d6cdc4c; the combined note's status). The figure, in his words: "$45, with 12 h a day", confirmed "Keep 12 h a day, $45" (research.md R-05). R-05's prices of 2026-11-11 come from trackers and summaries, not AWS's pages, and are each marked "to confirm". Those confirmations move to T167, with the lines W1 adds. RDS's line is gone since his answer "Postgres in a container on the tunnel end".

### Close

- [x] T018 Review and note. Check: as T009 (feat/001-measure)
  - **Done:** T018's two rounds, and the combined review (T009).
- [x] T019 Author: gate and merge. Check: the gate passes (feat/001-measure, then main)
  - **Combined (2026-11-10):** T010's one gate (Prerequisites). **Done** with T010.

---

## Group 3: the bootstrap (US1, US2) — `feat/001-us1-bootstrap`

**Goal**: Terraform's state, and the budgets, applied first (FR-001 to FR-008, FR-022). **Independent test**: quickstart §3.

**Precondition**: T001's check holds. The branch's first commit records it.
  - **Recorded 2026-11-10: unmet.** `.specify/memory/constitution.md` on `refs/heads/main` (d0fac811) reads "**Version**: 1.0.1", not 1.1.0, and ADR 0044 reads "Status: proposed", on `docs/001-ec2-default` (a633f542). The group is built anyway, at the main session's direction, as its reading of the Author's T000 words, "build it out … you can have everything ready and verified by then": the agent work on `feat/001-us1-bootstrap` and its patch, P-I1. Nothing of it merges, and nothing is applied, before T001. That extends the deviation spec.md's Assumptions name for group 1 ("The constitution first"), which now says so; it is the session's reading, not a word of his, and his to overturn.
  - **Met at T001** (3c89a8b0), before anything of the group merged or was applied: `refs/heads/main` reads "**Version**: 1.1.0", and ADR 0044 is accepted (67028747).

### Tests first

- [x] T020 [P] [US1] Write `infra/test/fixtures/bootstrap/` and `infra/test/test_bootstrap.py`, the first files under `infra/`, which parse the root's HCL with group 1's standard-library reader, `tools/gates/infra_policy.py`'s, from the guard patch P-1 (plan.md Technical Context; research.md R-14):
  - the state bucket: versioned, encrypted, public access blocked, TLS-only;
  - `h4-model-month` at $20 and `h4-model-day` at $5, on Bedrock's cost, with notifications at 70% and 100%;
  - `h4-server-month` at `var.server_budget_usd`, on every cost but Bedrock's (from T150, every cost tagged `project = h4reet-ai` but Bedrock's; ADR 0047), at 70% and 100%;
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

- [x] T023 [US1] Write `infra/bootstrap/{main,variables,versions,outputs}.tf` and its lockfile from the mirror. Write `budgets.tf` and `alerts.tf` as P-I1 (`docs/merge-requests/<date>-feat-001-pi1-bootstrap.patch`), since they are protected. Check: on a patched copy, T020 passes, and `make infra-check` passes (feat/001-us1-bootstrap)
  - **Built 2026-11-10, but for the lockfile,** which is the Author's step (plan.md §16, group 3's departure 3). The four files, `redact.txt`, and P-I1 (`docs/merge-requests/2026-11-10-feat-001-pi1-bootstrap.patch`, two new files from plain copies, `diff -u`). On a patched copy T020 passes, from P-I1's patch and from the tree, and the policy's one finding is T10, no lockfile; fmt and validate need Terraform and his mirror, so they run in his `make plan ROOT=bootstrap` (the note). Three things to confirm at T027 are in the note's "For the Author".
  - **After T028's review** (plan.md §16, group 3's departures 5, 6, and 12): Bedrock's cost is `var.bedrock_service_names`, the names his Cost Explorer shows, his step before the lockfile and T027 (B3); the model budgets count usage, not cost net of credits (nit 4); the state bucket's TLS deny is for every principal (nit 2). P-I1 was rebuilt from plain copies and dry-run again (the note).
  - **Done:** the Author's lockfile, and the bootstrap applied on 2026-11-12 (`docs/infra/applies/2026-11-12-bootstrap.md`).
- [x] T024 [US1] Write `make plan ROOT=…`, `make infra-verify`, `make infra-record`, `make infra-audit`, and `make secrets-check` (`scripts/infra/*.py`), each refused to agents by P-1. Check: T021 passes (feat/001-us1-bootstrap)
  - **Done 2026-11-10:** `scripts/infra/infra_plan.py`, `infra_verify.py`, `infra_record.py`, and `secrets_check.py`, sharing `infra_common.py`, and the five targets, each refusing in the sandbox before its script runs. GREEN: T021's tests, the plan's and the secrets check's, and the targets' pass on a patched export (the note). Departures 2, 4, 9, and 10 of plan.md §16's group 3 are theirs. After T028's review, `make plan ROOT=…` also runs `terraform fmt -check` before `init`, and never replaces a saved plan of its tree (departure 12).
- [x] T025 [P] [US1] Write `infra/lambdas/credential_audit/` (stdlib Python, Dockerfile) and `infra/README.md`. Check: T022 passes (feat/001-us1-bootstrap)
  - **Done 2026-11-10, but for the Dockerfile,** which moves to group 4 with the function's deployment and its base's digest (plan.md §16, group 3's departure 7). `audit.py` runs in the Author's terminal through the AWS CLI, and as the Lambda's handler on `python3.14`, arm64, from group 4. GREEN: T022 passes (the note). After T028's review (I4), it finds any IAM user, whatever it holds (departure 11).
- [x] T026 [P] [US2] Add the disclosure rows C8 (its email half) and C9, in the same commit as T023. Check: `disclosure_check` passes (FR-040) (feat/001-us1-bootstrap)
  - **Done 2026-11-10,** in T023's commit: spec 001's section of `docs/data-flow-disclosure.md`, with C8's email half and C9 in the spec's words. `disclosure_check` passes on a patched export (the note).

### The Author's plan block

- [x] T027 Author: in a scratch clone of the branch, apply P-I1 and commit it there; run `make plan ROOT=bootstrap`; paste the redacted block into the note's draft on the branch. Check: the block's `tree` is the tree hash `infra/` will have on the branch once P-I1 is committed byte for byte (T029); no account ID, address, or email in it (FR-005, FR-010) (feat/001-us1-bootstrap)
  - **Combined (2026-11-10):** on a clone of `feat/001-cloud-elevation-p` once P-1, P-3, P-I1, P-I2, and both lockfiles are committed there, so the clone needs no patch; the block's `tree` is all of `infra/`, the account's files included (plan.md §16, "Groups 1 to 4, as one branch", 5).
  - **T027's finding (2026-11-11):** hashicorp/aws 6.72.0 needs `metrics` beside `filter_expression`, so the two budgets that use it, `h4-server-month` and `h4-rehearsal-server`, carry `metrics = ["UnblendedCost"]`, since the account has no credits (plan.md §16, group 3's departure 6). Any later budget with a `filter_expression` carries it too.
  - **Done:** the block of 2026-11-11, and the second of 2026-11-12 at the shared account's tree, in `docs/merge-requests/2026-11-12-fix-001-shared-account.md` (T153), which the bootstrap's apply names.

### Close

- [x] T028 Review and note. Check: as T009 (feat/001-us1-bootstrap)
  - **Done:** T028's review, and the combined review (T009).
- [x] T029 Author: apply P-I1 on the branch, byte for byte as in T027; gate; merge. Check: the gate's `infra-plan-note` step passes (feat/001-us1-bootstrap, then main)
  - **Combined (2026-11-10):** T010's one gate. Main's gate predates P-1, so its `infra-plan-note` step doesn't run for it; the session's run on a patched export stands in (spec.md Assumptions, "One gate for groups 1 to 4"). **Done** with T010.
- [ ] T030 Author: on `main`:
  1. run `make infra-verify ROOT=bootstrap`, apply the saved plan, and run `make infra-record`;
  2. migrate the state (`terraform init -migrate-state`) and record it;
  3. activate the cost-allocation tags in the Billing console;
  4. confirm SNS's email subscription.

  Check: quickstart §3's checks; the apply record is on `ops/apply-bootstrap-<date>` (FR-003, FR-007, FR-022; SC-012) (main)
  - **As built (group 3):** step 2 needs `versions.tf`'s backend to read `s3`, a change on a branch of its own after this one merges, so it runs from that branch's checkout, not from `main` (plan.md §16, group 3's departure 4).
  - **Step 1, done 2026-11-12:** verified, applied from `main` at 0ada646b, and recorded (`docs/infra/applies/2026-11-12-bootstrap.md`), after T153 let the audit read his allowlist.
  - **Step 2, open:** the state's move to S3 is on the session's next branch, with `rehearsal = false` (T040 step 6). W1's blocks wait for it (plan §16, W1's departure 8).
  - **Steps 3 and 4, not in the record:** the cost-allocation tags' activation, and the email subscription's confirmation. The Author says whether he has done them; ADR 0047's tag filter counts nothing until `project` is an active cost-allocation tag. So the task stays open.

---

## Group 4: the safety net (US2) — `feat/001-us2-safety-net`

**Goal**: the alert path, the model action on the laptop's Bedrock role, both actions' rehearsals against targets of the same shape, the probe, the registry, and releases' bucket (FR-013, FR-022 to FR-026, FR-061). **Independent test**: quickstart §4.

**Precondition**: T001's check holds.
  - **Recorded 2026-11-10: unmet.** `.specify/memory/constitution.md` on `refs/heads/main` (d0fac811) reads "**Version**: 1.0.1", not 1.1.0, and ADR 0044 reads "Status: proposed", on `docs/001-ec2-default` (a633f542). The group is built anyway, at the main session's direction, as its reading of the Author's T000 words, "build it out … you can have everything ready and verified by then", as group 3 was: the agent work on `feat/001-us2-safety-net`, stacked on groups 1 to 3, and its patch, P-I2. Nothing of it merges, and nothing is applied, before T001. That extends the deviation spec.md's Assumptions name for groups 1 and 3 ("The constitution first"), which now says so; it is the session's reading, not a word of his, and his to overturn.
  - **Met at T001** (3c89a8b0), before anything of the group merged or was applied: `refs/heads/main` reads "**Version**: 1.1.0", and ADR 0044 is accepted (67028747).

### Tests first

- [x] T031 [P] [US2] Write `infra/lambdas/alert_bridge/test_bridge.py`: every kind in contracts/aws-alerts.md §2 gives its message, in the `[hareet.ai aws]` format, `ec2_stopped_server_budget`, `tunnel_end_interruption`, and `tunnel_end_back` among them; no secret, account ID, key ID, payload, or client identifier ever appears; retries and failure destination. Check: RED (FR-022) (feat/001-us2-safety-net)
  - **Done 2026-11-10** (7fdf7ff0), in P-I2 (`docs/merge-requests/2026-11-10-feat-001-pi2-account.patch`): spec 000's protected names (`infra/*alert*`) hold the bridge's folder, so its test, its code, and its Dockerfile reach the branch only by the Author's hand (plan.md §16, group 4's departure 1). The kinds and their runbooks are read from §2's table; one notice of each source's shape each. RED: it fails to collect without `bridge.py` (the note).
- [x] T032 [P] [US2] Write `infra/lambdas/probe/test_probe.py`: the two checks with `X-H4-Probe: 1`; a pass needs a 200 within 5 s and, for status, a `serving` field; it never calls hello or a turn. Check: RED (FR-061) (feat/001-us2-safety-net)
  - **Done 2026-11-10** (7fdf7ff0), with a stub fetch and clock, and the real fetch against a server on 127.0.0.1: no redirect followed, a bounded body, a timeout. RED: it fails to collect without `probe.py` (the note).
- [x] T033 [P] [US2] Write `infra/test/fixtures/account/` and `infra/test/test_account.py`. They cover:
  - the laptop's Bedrock permission set, imported, allowing only `sts:AssumeRole` on `h4-laptop-bedrock`;
  - `h4-laptop-bedrock`, an ordinary IAM role: `bedrock:InvokeModel*` on the one inference profile only, trusting only the permission set's role;
  - the model action's settings, `h4-deny-paid-models`, and its targets: ordinary roles only, never a role under the path Identity Center gives the roles it makes for permission sets (`/aws-reserved/sso.amazonaws.com/`, to confirm);
  - its execution role, which may attach and detach only that policy on those roles;
  - while `rehearsal = true`, the two $0.01 budgets; `h4-rehearsal-target`, an ordinary role of the same shape as `h4-laptop-bedrock` that no one assumes (to confirm); and `h4-rehearsal-instance`;
  - the probe's and the credential audit's EventBridge schedules only in `alerts.tf`, the probe's disabled, and no EventBridge rule in `lambdas.tf` (rule T5).

  Check: RED (FR-012, FR-013, FR-023, FR-026) (feat/001-us2-safety-net)
  - **Done 2026-11-10** (7fdf7ff0): fourteen checks over the root, read with P-1's reader, and 32 fixtures, one defect each, which must each find exactly their problems. Until P-1 is applied the module reads PLANNED (T010); until P-I2 is, it reads `iam.tf`, `killswitch.tf`, and `alerts.tf` from P-I2's patch file, as `test_bootstrap.py` does P-I1's. Identity Center's path is `/aws-reserved/sso.amazonaws.com/`, with a Region after it in some accounts; the trust's pattern takes both. `h4-rehearsal-target`'s "no one assumes" is built as a trust in the account's root user alone, who holds no key. RED on a patched export: 46 of 52 fail on the missing root (the note).

### Implementation

- [x] T034 [US2] Write `infra/account/{main,lambdas,registry}.tf`: the bridge's, the probe's, and the audit's functions, ECR, the release bucket, and the rehearsal instance. Write `killswitch.tf`, `iam.tf` (the permission set, for import and narrowing; `h4-laptop-bedrock`; `h4-rehearsal-target`), and `alerts.tf` (with the probe's schedule, disabled until group 8's P-I5, and the audit's weekly schedule) as P-I2. Check: on a patched copy, T033 passes, and `make infra-check` passes (feat/001-us2-safety-net)
  - **Built 2026-11-10, but for the lockfile and the functions' images,** which are the Author's (plan.md §16, group 4's departures 3 and 4): `infra/account/{versions,variables,main,lambdas,registry,outputs}.tf`, and P-I2's `iam.tf`, `killswitch.tf`, and `alerts.tf`, from plain copies with `diff -u`. On a patched copy T033 passes, from P-I2's patch and from the tree, and the policy's one finding on the root is T10, no lockfile; fmt and validate need Terraform and his mirror, so they run in his `make plan ROOT=account`. Four things to confirm at T037 are in the note's "For the Author".
  - **The set's name, 2026-11-11** (the combined note, For the Author, 2): the Author's `h4reet-ai-cloud` in P-I2's `iam.tf`, test-first on a patched export, and his count of 16 characters after `AWSReservedSSO_h4reet-ai-cloud_`, which the trust's 16 `?` match; three things are left to confirm at T037.
  - **The base's digest, 2026-11-11** (the same section): `deploy/images.lock`'s `base:lambda-python` line, by `make pin-images`' own renderer, its hosts row in `deploy/scripts/arch_inventory.py`, and the three Dockerfiles, the bridge's in P-I2, held to the pin by `infra/lambdas/test_images.py`, RED, then GREEN; P-I2 rebuilt from plain copies and dry-run again. The lockfile stays the Author's.
  - **Done 2026-11-12:** the lockfile; the account applied without the functions (`docs/infra/applies/2026-11-12-account.md`); the three images pushed, and their digests in `local.lambda_images` (`feat/001-rehearsal-on`, merged at 4785107e).
- [x] T035 [P] [US2] Write `infra/lambdas/alert_bridge/` and `infra/lambdas/probe/`. Check: T031 and T032 pass (feat/001-us2-safety-net)
  - **Done 2026-11-10, but for the Dockerfiles,** which follow the base's digest (plan.md §16, group 4's departure 3; `infra/lambdas/test_images.py` read PLANNED until then; the Dockerfiles came on 2026-11-11, under T034): `infra/lambdas/probe/probe.py`, and the bridge's `bridge.py` in P-I2, both stdlib, the bridge reading Parameter Store with the AWS SDK the runtime's base carries, as the credential audit does. GREEN: T031 and T032 pass (the note).
- [x] T036 [P] [US2] Add F2's change (the laptop's `sts:AssumeRole` on `h4-laptop-bedrock`), C8's Telegram half, C10, and C11, in the same commit as T034. Write the runbooks `docs/runbooks/aws-budget.md`, `aws-budget-action.md` (the deny on `h4-laptop-bedrock` and on `h4-prod-gateway` from group 7), `server-budget.md`, `aws-anomaly.md`, and `credential-audit.md`, and the laptop runbook's Bedrock profile, which chains from his SSO session to `h4-laptop-bedrock` (the form to confirm). Check: `disclosure_check` passes; each alert kind of this group names its runbook (FR-040, FR-056) (feat/001-us2-safety-net)
  - **Done 2026-11-10,** in T034's commit: F2's change, C8's Telegram half, C10, and C11 in spec 001's words in `docs/data-flow-disclosure.md`; the five runbooks, and `docs/runbooks/laptop.md`, the laptop's page, whose first part is the Bedrock profile. The profile chains `h4reet-bedrock` to `h4-laptop-bedrock` from an SSO profile, `h4reet-bedrock-sso`, one hop; spec 000's preflight P19, the adapter's session end, and `make aws-login` now follow it, test-first (plan.md §16, group 4's departure 8). `disclosure_check` passes on a patched export, and `evals/test_runbooks.py` holds each kind of this group to its page and the index (the note).

### The Author's plan block

- [x] T037 Author: as T027, for `ROOT=account` with P-I2, the permission set's import shown in the plan. Check: as T027 (feat/001-us2-safety-net)
  - **Combined (2026-11-10):** after the merge and T030, since the account's state is in the bucket T030 makes. Its block reaches `main` in a later merge's note, and `make infra-verify ROOT=account` refuses the apply until it does (spec.md Assumptions, "One gate for groups 1 to 4").
  - **Done 2026-11-12:** its first run found the untagged budget action (T155); the block is in `docs/merge-requests/2026-11-12-fix-001-action-tags.md`, which the account's apply names. The rehearsal's block followed, in `docs/merge-requests/2026-11-12-feat-001-rehearsal-on.md`.

### Close

- [x] T038 Review and note. Check: as T009 (feat/001-us2-safety-net)
  - **The first pass, 2026-11-10,** over 5a82fcf5..af7d66be: not ready, with three blockers and two Important findings (I1 to I5) and five nits. Each is fixed on the branch, test-first for the code, in its own commits, with P-I2 rebuilt and dry-run again (the note's Review). **A second, short pass** reads what For the Author's section 2 then adds (the set's name in P-I2, the base's lock line, the Dockerfiles, P-I2 rebuilt with the bridge's), and its tip is the merge guard's anchor (T039).
  - **Done:** both passes (the combined note, Review).
- [x] T039 Author: apply P-I2 on the branch, as in T037; gate; merge. Check: as T029 (feat/001-us2-safety-net, then main)
  - **Combined (2026-11-10):** T010's one gate, with P-I2 applied on `feat/001-cloud-elevation-p` before T027. **Done** with T010.
- [ ] T040 Author: on `main`:
  1. verify, import the laptop's Bedrock permission set, apply, and record;
  2. point the laptop's Bedrock profile at `h4-laptop-bedrock`, as the runbook says;
  3. write the Telegram parameters, and the credential audit's allowlist, `/h4reet/audit/IAM_ALLOW`, a SecureString holding the same lines as `~/.config/h4reet-ai/infra/iam-allow.txt` (ADR 0047; `infra/parameters.txt`), before the function's first run;
  4. set `rehearsal = true`, plan, and apply; start `h4-rehearsal-instance` before the trip, since stopping a stopped instance proves nothing;
  5. record each action's timings (contracts/aws-alerts.md §4; September §3.4), and, for the server action, the SSM run's status from the action's history and the instance's state after it;
  6. set `rehearsal = false`, plan, and apply.

  Check: SC-009, both channels got each alert, and each action took effect on its rehearsal target: the policy attached to `h4-rehearsal-target`, and the SSM run succeeded with `h4-rehearsal-instance` going from `running` to `stopped`; `aws sts get-caller-identity` with the laptop's Bedrock profile names `h4-laptop-bedrock`, with no paid call; spec 000's "made by hand" deviation ends for the laptop (FR-013) (main)
  - **Step 1, done 2026-11-12:** the import and the apply, without the functions or the rehearsal (`docs/infra/applies/2026-11-12-account.md`).
  - **Step 2, done:** the profile chains to `h4-laptop-bedrock`, and the hand-made policy is detached, as `feat/001-rehearsal-on`'s note records ("T040b's follow-up").
  - **Step 3:** the rehearsal's note takes "T040 d to f", so it reads steps 1 to 3 as done. The repository holds no record of the Telegram parameters or of `/h4reet/audit/IAM_ALLOW`, which are his, so he confirms them.
  - **Step 4, in progress 2026-11-12:** `rehearsal = true` and the functions' digests merged (4785107e); the account's apply and the trip are tonight's.
  - **Steps 5 and 6, open.** Step 6's `rehearsal = false` rides on the session's next branch with the bootstrap's state move (T030 step 2). W1's plan blocks wait for that branch (plan §16, W1's departure 8).

---

## Group 5: the tunnel end and the tunnel (US4) — `feat/001-tunnel-end`

**Goal**: the laptop reaches the cloud only by dialing out, to a spot instance in the account that runs around the clock (FR-052 to FR-055, FR-076's instance and warning). **Independent test**: quickstart §5.

**Precondition**: T001's check holds. **W1's first group** (Organization): its branch starts from this regrouping commit, and it carries gate A's backlog first (T157 to T161).

### Gate A's backlog, first

- [x] T157 [P] Extend `infra/test/test_account.py`'s tag check to `aws_sqs_queue` and `aws_ssoadmin_permission_set`. The policy's `TAGGABLE` lacks both, as it lacked `aws_budgets_budget_action`, which the test's own list, `TAGGABLE_HERE`, already adds (T155). Add the fixtures `queue-untagged` and `set-untagged`, one defect each. The tree's `h4-alert-bridge-failed` and the laptop's set already carry `component`. Check: RED, each fixture passes the check before its type is in the list; GREEN after; the tree passes (FR-002) (feat/001-tunnel-end)
  - **Done** (ec9c3b12): RED 2 failed with the two fixtures alone; GREEN with both types in `TAGGABLE_HERE`.
- [x] T158 [P] Write P-G1 for the Author's hand, `docs/merge-requests/<date>-feat-001-pg1-taggable.patch`, from plain copies: `tools/gates/infra_policy.py`'s `TAGGABLE` gains `aws_budgets_budget_action`, `aws_sqs_queue`, and `aws_ssoadmin_permission_set`, with a fixture each in `tools/gates/test/test_infra_policy.py`. It's the gate tool's change, so the Author's (plan.md §16, "After the bootstrap's apply"). Once it's applied, T157's own list and `TAGGABLE_HERE` can go. Check: the patch applies to a fresh export; on a patched export the new fixtures fail rule T2 and the tree passes (feat/001-tunnel-end)
  - **Done:** `docs/merge-requests/2026-11-13-feat-001-pg1-taggable.patch`. On a patched export the new cases fail T2 untagged and pass tagged; the policy passes the tree.
- [x] T159 [P] Extend `infra/test/test_account.py` with two alarms to `h4-alerts`, only in `alerts.tf`, both with missing data not breaching:
  - `h4-credential-audit-errors`, on the function's `Errors`, at one or more;
  - `h4-alert-bridge-failed`, on the failure queue's visible messages, at one or more (group 4's Backlog: "the bridge's failure queue without an alarm").

  Add their alert kinds to contracts/aws-alerts.md §2, and their runbooks' sections to `docs/runbooks/credential-audit.md` and the alert bridge's page, `docs/runbooks/alert-bridge.md`, new. The two rows reach §2 in P-I3, with the bridge that knows them: the bridge's own test holds every kind there to a notice, and the bridge is protected. Check: RED; `evals/test_runbooks.py` holds each kind to its page (FR-022, FR-056) (feat/001-tunnel-end)
  - **Done:** the checks in `test_account.py`, the runbooks' sections, and the new page; the alarms, the bridge, and §2's rows in P-I3.
- [x] T160 [P] Extend `infra/test/test_bootstrap.py`: `h4-alerts`' policy also lets CloudWatch alarms (`cloudwatch.amazonaws.com`) and EventBridge (`events.amazonaws.com`) publish, each for this account alone (`aws:SourceAccount`), and grants nothing else. Group 4's departure 2 put the CloudWatch publisher in group 8; W1's first alarm (T159) and the tunnel end's warning rule (T046) come earlier. Check: RED (FR-022) (feat/001-tunnel-end)
  - **Done:** the check in `test_bootstrap.py`; the statements in P-I3.
- [x] T161 Write T159's two alarms in `infra/account/alerts.tf` and T160's two statements in `infra/bootstrap/alerts.tf`, into P-I3 with group 5's protected files (T051). Check: on a patched copy, T159 and T160 pass, and `make infra-check` passes on both roots (feat/001-tunnel-end)
  - **Done:** in P-I3. On a patched export T159 and T160 pass, and the policy and `terraform fmt -check` pass both roots; `terraform validate` can't start its provider in an agent session, so the Author's gate runs it.

### Tests first

- [x] T041 [P] [US4] Write `deploy/tunnel/test_tunnel.py`: two containers on the agents' engine. Only 2201, 2202, and 2203 may be listened on, and only the stub store and the sink opened. No shell or command opens. A wrong host key is refused. The forward to the store reaches only the store. Check: RED (FR-052, FR-053, FR-055) (feat/001-tunnel-end)
  - **From W1:** the store is the tunnel end's own `shared-state:5432` (group 6), not RDS's endpoint, so `PermitOpen` names `shared-state:5432` and `snapshot-sink:8080`; the stub store takes that name (plan.md §16, "The shared state on the tunnel end").
  - **Done:** the files' checks run everywhere; the containers' checks skip on the agents' engine, which can't build the image (plan.md §16, group 5's departure 4), and the Author's engine runs them.
- [x] T042 [P] [US4] Write `deploy/edge/test_tunnel_blocks.py` (spec 000's edge tests' style):
  - 8085 needs its bearer token, 401 otherwise, logged with no address; it moves `X-H4-Viewer` into the one `X-Forwarded-For` and keeps `traceparent`;
  - 8086 needs its own token;
  - 8087 serves `GET /health` only, with an empty body, 200 or 503 as the gateway's health says, and is rate-limited;
  - every other path gets 404.

  Check: RED (FR-053, FR-054) (feat/001-tunnel-end)
  - **Done:** with the health block on edge's 8088 (plan.md §16, group 5's departure 1).
- [x] T043 [P] [US4] Extend `services/gateway/test/unit/health.test.ts`: the health answer carries the store's readability, and reads unhealthy while the store can't be read. Check: RED (FR-054) (feat/001-tunnel-end)
  - **Done:** and `GET /health/serving` (group 5's departure 2).
- [x] T044 [P] [US4] Write `deploy/hosts/test_hosts.py` and extend `deploy/scripts/test_preflight.py` and the compose policy's tests:
  - the tunnel end's nftables and security-group text admits 2222 from anywhere, 8087 from Route 53's ranges, and 8080 only privately;
  - its egress allowlist matches the disclosure, ECR (its deployer's pulls) and SNS (its alerts) among it;
  - the `tunnel-end` class selects `tunnel-end`, `relay`, `snapshot-sink`, and the collector only, with `H4_HOST=tunnel-end`;
  - the laptop's prod has the `tunnel` profile.

  Check: RED (FR-051, FR-052) (feat/001-tunnel-end)
  - **From W1:** group 6 adds `shared-state` to the class, and 5432 on the private interface from EC2's group only, test-first (T163).
  - **Done:** with `deploy/scripts/test_write_env.py`, `test_egress_proxy.py`, and `test_deployer.py`; the compose policy's own tests are P-G3's.
- [x] T045 [P] [US4] Write `deploy/otel/test_collector_tunnel_end.py`, on the configuration's text: the routing connector sends `laptop` to the tunnel's 2202 forward and `ec2` and `none` to EC2's collector; the file-backed queue; spec 000's redaction applied again, so no payload, address, or client identifier leaves; the queue's and the exporters' counters exported. Check: RED (FR-060; row C15) (feat/001-tunnel-end)
  - **Done.**
- [x] T046 [P] [US4] Write `infra/test/fixtures/prod-tunnel-end/` and `infra/test/test_prod_network.py`. They cover the VPC and its subnets, the tunnel end with two interfaces, its Elastic IP, IMDSv2 with hop limit 1 (T13), spot persistent with `stop` (T11), its role (R-15: ECR pulls, its Parameter Store path, `sns:Publish` on `h4-alerts`, Session Manager), and the `h4-tunnel-end-spot-warning` rule to `h4-alerts`. Check: RED (FR-076) (feat/001-tunnel-end)
  - **From W1** (plan.md §16, "No root holds another root's instance or health-check ID"):
    - the warning rule is prod's, in `infra/prod/handover.tf`, with the instance's ID from the same root, not the account's;
    - `infra/prod/handover.tf` and `infra/account/handover.tf` each hold `local.wired = false`;
    - **both directions:** nothing under `infra/account` names a prod instance or health-check ID, nor reads prod's state; and nothing in `infra/prod` reads, by a data source or a remote state, what the account's W1 apply makes. Prod names the account's repositories only by their name-built ARNs. The account's own rehearsal instance, `h4-rehearsal-instance`, and its references in the account's `killswitch.tf` are the account's, and exempt;
    - **the tunnel end's type** is a named local, `local.tunnel_end_type`, in the unprotected `infra/prod/tunnel-end.tf`, holding the placeholder `"measure-in-T166"`. The instance in the protected `ec2-market.tf` reads it, and no other file sets a type. A `precondition` on that instance refuses the placeholder, so prod's plan (T171) fails until T166 sets the local. The test checks the local's place, the reference, and the precondition. Group 5 asserts no measured type.
  - **Done:** `infra/test/test_prod_network.py`, 20 fixtures.

### Implementation

- [x] T047 [US4] Write `deploy/tunnel/` (Dockerfile, `sshd_config`, `ssh_config`, entrypoint) per contracts/tunnel.md, and `tunnel` and `tunnel-end` in `deploy/compose.yaml`. Check: T041 passes (feat/001-tunnel-end)
  - **Done:** T041's files' checks pass; its containers' checks are the Author's engine's (departure 4).
- [x] T048 [US4] Add the three blocks to `deploy/edge/nginx.conf` and the store field to the gateway's health. Check: T042 and T043 pass (feat/001-tunnel-end)
  - **Done.**
- [x] T049 [US4] Write `deploy/hosts/` for the tunnel end (cloud-init, systemd units, nftables, `daemon.json`), `deploy/scripts/write_env.py`, `egress_proxy.py`, and the deployer's host part. Extend preflight and the compose policy's `tunnel-end` class. Check: T044 passes (feat/001-tunnel-end)
  - **Done:** P-G3 for the compose policy (departure 5).
- [x] T050 [US4] Write `deploy/otel/collector-tunnel-end.yaml` and the collector's service in the `tunnel-end` profile. Check: T045 passes (FR-060) (feat/001-tunnel-end)
  - **Done.**
- [x] T051 [US4] Write `infra/prod/{main,network,tunnel-end,ssm}.tf`. Write `ec2-market.tf` (the tunnel end's spot options), `iam.tf` (its role), and the warning rule in `infra/account/handover.tf` as P-I3. Check: on a patched copy, T046 passes, and `make infra-check` passes (feat/001-tunnel-end)
  - **From W1:** the warning rule goes in `infra/prod/handover.tf`, with `local.wired = false`. `infra/account/handover.tf` starts with the account's `local.wired = false`. P-I3 also carries T161's two files.
  - **The repositories the tunnel end pulls from** (the review's I4): `infra/account/registry.tf`'s `stack` list gains `tunnel` (both ends' image), `relay` (group 8), and `snapshot` (the sink and the publisher, groups 9 and 10). The deployer's first pull needs them before those groups' images exist. Test-first in `infra/test/test_account.py`: each image a `tunnel-end`-class service runs has its repository, tagged, with the lifecycle policy the others have.
  - **Done:** P-I3 whole. On a patched copy T046 passes; the policy's one finding is T10, prod's lockfile, the Author's step (departure 13).
  - **After group 5's review ("Missing"):** FR-076's return alert in W1, as contracts/handover.md §2 places it: `h4-tunnel-end-running` and its `h4-alerts` target, `tunnel_end_back`, in P-I3's `infra/prod/handover.tf`, test-first in `infra/test/test_prod_network.py` (`check_return_rule`). Its start-function target stays group 9's, behind the switch.
- [x] T052 [P] [US4] Write `make tunnel-keys` (the client key, the host key, the relay's host tokens, `SNAPSHOT_SINK_TOKEN`, and `TELEMETRY_BLOCK_TOKEN`), `make tunnel-revoke`, and `make cloud-session HOST=ec2|tunnel-end` (a Systems Manager port-forwarding session; FR-050), all Author-only, and `h4.tunnel.up` and `h4.tunnel.reconnects` from both ends. Check: their unit tests pass; the bash gate refuses them in an agent session (FR-050, FR-055, FR-060) (feat/001-tunnel-end)
  - **Done.**
- [x] T053 [P] [US4] Add the "Hosts" row's first panels to the provisioned dashboard: the tunnel's state and reconnects, and telemetry delayed or lost (the tunnel end's collector's queue and drop counters) (plan §11). Check: the dashboard's provisioning test passes with them (FR-060) (feat/001-tunnel-end)
  - **Done:** the panels' queries in contracts/tunnel.md §7.
- [x] T054 [P] [US4] Add the disclosure rows S16, S17, and C3, and S1's change, in the same commit as T047; C15 in the same commit as T050; the tunnel end's egress rows and C7's tunnel-end part (its deployer, ECR, the secrets store, Systems Manager, and SNS) in the same commit as T049. Write `docs/runbooks/tunnel-end.md` (a restart; a crash, a failed deploy, or a revoked key; a key's revocation; its loss; a spot interruption; a move to another zone) and the laptop runbook's tunnel part. Check: `disclosure_check` passes (FR-040, FR-056) (feat/001-tunnel-end)
  - **Done.**

### The Author's plan block

- [ ] T055 Author: as T027, with P-I3, for `ROOT=prod` (the network and the tunnel end) and `ROOT=account` (the warning rule). Check: as T027 (feat/001-tunnel-end)
  - **Impossible as written:** the account's half read the tunnel end's instance before prod's apply made it, and both blocks must be at one tree before either apply. **Combined (W1):** the warning rule moves to prod, beside the instance (T046, T051), so the group's part is prod's block and the bootstrap's (T160), both in T171. The account's block in T171 holds only T159's alarms.

### Close

- [ ] T056 Review and note. Check: as T009 (feat/001-tunnel-end)
- [ ] T057 Author: apply P-I3 on the branch, as in T055; gate; merge. Check: as T029 (feat/001-tunnel-end, then main)
  - **Combined (W1):** P-I3 and P-G1 on W1's `-p` branch, and W1's one gate (T172).
- [ ] T058 Author: on `main`, verify, apply, and record both roots; run `make tunnel-keys` and write the parameters; `make secrets-check`; start the laptop's prod with the `tunnel` profile; run the scans; run `make tunnel-revoke` and restore. Check: quickstart §5, SC-006 (main)
  - **Combined (W1):** the applies are T173's. The rest follows them, once the tunnel end runs its release (T080 makes it, with the shared state).
  - **First, the interfaces and the way out** (B-6, option C; the review of 59dfdc4a; docs/runbooks/tunnel-end.md, "The interfaces and the way out (T058)"): on the tunnel end, `ip -br -4 addr`, `ip -4 route` (two default routes, `ens6`'s at metric 100 and `ens5`'s at amazon-ec2-net-utils' 512, which this confirms or corrects; the host route to `10.42.0.20` on `ens5`), `ip -4 route get 192.0.2.1` naming `dev ens6`, and `cloud-init status --long` reading `done`; from EC2, `pg_isready -h 10.42.1.10` and a request to `10.42.1.10:2301`, each answered, so the replies come back by `ens5`.

---

## Group 6: the shared state, and the route per host (US2, US5) — `feat/001-shared-state`

**Goal**: one meter and one kill switch for both hosts, in Postgres in a container on the tunnel end (RDS until W1's regrouping), a route per host, the placeholder gate over every host route, and operator actions whichever host serves (FR-017 to FR-020, FR-067, FR-068, FR-074). **Independent test**: quickstart §6.

**Precondition**: T001's check holds. `feat/010-anthropic-switch` is on `main`: `config/routing.yaml` names `prod: { primary: local, fallback: anthropic }`, and row F3 holds the Author's adopted words, quoted in that branch's note with his weighing, "We can say nothing is retained when running local models. Refer to Anthropic if cloud models are on." **W1:** the branch stacks on group 5's reviewed tip.

**The shared state on the tunnel end** (spec.md Assumptions; plan.md §16, "The shared state on the tunnel end"). The Author's answer of 2026-11-11: "Postgres in a container on the tunnel end". FR-017 to FR-020's requirements stand. T066, T068, T073, T076, and T080 are rewritten below, and T162 to T165 are new. T163's backup cases, and T066's kept days, wait for the Author's answer to the regrouping note's question 4. **Answered:** option A, a `pg_dump` every hour kept 7 days, as the main session relayed (plan.md §16, group 6's departure 1).

### Documents first

- [x] T162 [US2] Amend the documents that name RDS, before the code, each passage marked "(amended 2026-11-12; spec.md Assumptions, "The shared state on the tunnel end")":
  - contracts/shared-state.md: §1 becomes the `shared-state` service and its volume; §2's roles without `h4admin`; §3's TLS against the shared state's CA; §8's restore from the last backup, fetched by a presigned GET made in the Author's terminal (T164);
  - contracts/tunnel.md: `PermitOpen` `shared-state:5432`;
  - contracts/env-cloud.md: `GATEWAY_DB_URL`'s host, `GATEWAY_DB_TLS_SERVERNAME`, and the CA certificate's name in each env file;
  - data-model.md §1;
  - research.md R-11, R-20 (as built), and R-28's "no gateway and no store";
  - spec.md:
    - FR-052's list of the tunnel end's services gains the shared state, and the Terms;
    - the Data-Flow Disclosure Entries' C2, "→ the shared state in RDS", becomes "→ the shared state, Postgres in a container on the tunnel end": from EC2 to its private address, from the relay over its compose network, and from the laptop through the tunnel's forward, with TLS inside it;
    - a new row, C16: the tunnel end's backup timer → the backups' bucket, in the account. It carries the dump: meter amounts, call records, the kill switch, handover events, and audit rows. It never carries payloads, client identifiers, addresses, or secrets;
    - the Degraded Modes row "The shared state, unreachable from every host and the relay (RDS down, or being restored)" names the tunnel end's `shared-state` instead. Its visitor and operator columns stand, the operator's with "the restore from the last backup";
  - quickstart.md §6.

  Check: the docs-links check passes; no passage outside the September record names RDS as the shared state; FR-017 to FR-020 read as before (feat/001-shared-state)
  - **Done** (e3b0e5f4): each passage marked; the docs-links check passes; FR-017 to FR-020 read as before.

### Tests first

- [x] T059 [P] [US2] Extend `services/gateway/test/integration/migrations.test.ts` for `0007_hosts.sql`: `host` on `ledger` and `audit_log`; `handover_events` with its checks; `relay_ro` and `relay_rw` with exactly their grants; `v_handovers` for `grafana_ro`; 0001 to 0006 byte-identical. Check: RED (data-model.md §1.2) (feat/001-shared-state)
  - **Done:** RED in ab282a06, GREEN in 9e7bea8d.
- [x] T060 [P] [US2] Write `services/gateway/test/integration/shared-state.test.ts`: two gateway processes against one Postgres. Paid admission at the global limit never passes a ceiling beyond spec 000's in-flight bound. One rollover at the UTC boundary, one alert per crossing, and the kill switch seen by both within 10 s. Check: RED (FR-017, FR-019; data-model.md §1.3) (feat/001-shared-state)
  - **Done:** two whole gateways on one PGlite (plan.md §16, group 6's departure 14). At RED its first case failed, on 0007's host; its other two held already, since the meter's two-writer rules are spec 000's (data-model.md §1.3, "existing"); GREEN in 9e7bea8d.
- [x] T061 [P] [US2] Extend `test/unit/validate-config.test.ts` and write `test/unit/routes-per-host.test.ts`:
  - schema 2, R1 amended, H1, H2, and A1;
  - `H4_HOST` selection, and exit 78 on `ec2` with a `primary`, `laptop` with a `first`, or `ec2` with no `envs.prod.hosts.ec2` (`route_missing`);
  - EC2's calls attributed `metered`, with `fallback_day` untouched;
  - the laptop's fallback attributed `fallback`;
  - spec 010's refusals on the `ec2` route (`price_missing`, `adapter_cap_missing`, `missing_env`), tested on a fixture, since the file's `ec2` line is the Author's (T095).

  Check: RED (FR-067, FR-068) (feat/001-shared-state)
  - **Done:** in `test/unit/routes-per-host.test.ts`; GREEN in d8a90065. `validate-config.test.ts` needed no case of its own: the committed file's schema 2 runs through `config.test.ts`'s.
- [x] T062 [P] [US5] Extend `evals/test_disclosure.py` with cases for `placeholder_gate`, using schema-2 routing fixtures in `evals/fixtures/routing/`: with F3 holding its placeholder, the gate fails when any host route names the Anthropic API as `first`, `second`, or `fallback`, and on schema 1's `envs.prod.fallback`; with F3 holding his adopted words, it passes on each. Check: RED, since today's gate reads `envs.prod.fallback` only (FR-068; spec 010 FR-039) (feat/001-shared-state)
  - **Done:** fixtures in `evals/fixtures/routing/`; GREEN in 892d1532.
- [x] T063 [P] [US2] Extend `deploy/scripts/test_preflight.py` and `test_env_files.py`:
  - `GATEWAY_DB_URL` must use TLS on prod, and the local store is refused on `laptop` and `ec2`;
  - `GATEWAY_DB_TLS_SERVERNAME` is required with it;
  - the templates;
  - `H4_HOST` per class, and its mismatches.

  Check: RED (FR-019; contracts/env-cloud.md §2) (feat/001-shared-state)
  - **Done:** P23 and the templates; GREEN in 8a83a217.
- [x] T064 [P] [US2] Write `scripts/test_operator_shared.py`, with a stub laptop prod and a stub store:
  - while the laptop's prod runs, `ENV=shared` uses its admin listener on `127.0.0.1:18003` and starts no stack; otherwise it composes an admin-only stack (the tunnel's `-L 5432` only, the gateway's admin listener on the same port, no relay block); it never starts that stack while prod's gateway holds the port;
  - it refuses `init` unless the store is `uninitialized`;
  - `restore` refuses unless EC2 is stopped and the laptop's prod isn't running; it prints the restored meters, sets the store `uninitialized` under the initialization lock, and keeps the ledger and the audit log; `init` then accepts the store, and refuses values lower than the printed meters;
  - each action writes an audit row with `host`.

  Check: RED (FR-019, FR-074; contracts/shared-state.md §7, §8) (feat/001-shared-state)
  - **Done:** GREEN in 8a83a217.
- [x] T065 [P] [US3] Extend `evals/test_twin_readiness.py`: the evidence names both host routes' adapters, the laptop's local model and fallback and EC2's Anthropic API and Bedrock, read from schema 2. Check: RED (spec 010 FR-026 and spec 007 FR-031, amended by name) (feat/001-shared-state)
  - **Done:** GREEN in 14373d31.
- [x] T163 [P] [US2] Write `deploy/hosts/test_shared_state.py` and extend the compose policy's and preflight's tests:
  - `shared-state` is in the `tunnel-end` profile and class, on spec 000's pinned Postgres 17 image, with its data on the volume's mount;
  - its configuration: `ssl = on`, with the key and certificate from tmpfs; `hostssl` lines only, with `scram-sha-256`, for `gateway`, `grafana_ro`, `relay_ro`, and `relay_rw`; the superuser through the local socket alone; `log_statement = none` and `log_min_duration_statement = -1`; listening on the compose network and the private interface only;
  - the backup timer, with a stub store and a stub S3: a dump over the socket, put under its prefix; a failed dump or put alerts `shared_state_backup_failed` once, and keeps the last good dump; `h4.shared_state.backup_age_seconds` is exported;
  - `make shared-state-tls`, `make shared-state-roles`, and `make shared-state-restore` are each refused in an agent session; the roles' target reads the four passwords from Parameter Store and runs on the tunnel end through Systems Manager;
  - the tunnel end's preflight refuses a store without its certificate, and the laptop's and EC2's refuse a `GATEWAY_DB_URL` without the CA certificate.

  Check: RED (FR-019, FR-060; plan.md §16, "The shared state on the tunnel end") (feat/001-shared-state)
  - **Done:** RED in ab282a06; GREEN in efd3f14c; the compose policy's own cases are P-G4's (group 6's departure 11).
- [x] T066 [P] [US2] Write `infra/test/fixtures/prod-rds/` and `infra/test/test_prod_rds.py`: rule T12, the subnet group, the parameter group (`rds.force_ssl`, no statement logging), the security group admitting only EC2's and the tunnel end's groups, and no `password` argument. Check: RED (FR-019; contracts/shared-state.md §1) (feat/001-shared-state)
  - **Rewritten for W1:** `infra/test/fixtures/prod-shared-state/` and `infra/test/test_prod_shared_state.py`. They cover:
    - no `aws_db_*` or `aws_rds_*` resource;
    - the data volume: encrypted gp3, `prevent_destroy`, attached to the tunnel end, in its zone, tagged;
    - 5432 admitted on the tunnel end's private interface from EC2's security group only;
    - the backups' bucket: versioned, encrypted, public access blocked, objects expiring after the kept days (question 4), tagged;
    - the tunnel end's role: `s3:PutObject` on the bucket's one prefix, and nothing that reads or deletes there;
    - the shared state's Parameter Store paths, read by the tunnel end's role, and no SecureString or secret in Terraform (rule T9).

    Check: RED.
  - **Done:** 15 fixtures; GREEN in 4f916025, with P-I7.

### Implementation

- [x] T067 [US2] Write `migrations/0007_hosts.sql`, and set `host` on each ledger and audit row from `H4_HOST`. Check: T059 passes (feat/001-shared-state)
  - **Done** (9e7bea8d): the host from the session's `h4.host` (group 6's departure 4).
- [x] T068 [US2] Make the gateway's store connection take `GATEWAY_DB_URL` with TLS verified against the pinned RDS bundle and a server name. Emit `h4.shared_state.latency` and `h4.shared_state.errors`, labelled with `h4.host`. Check: T060 passes (FR-060) (feat/001-shared-state)
  - **Rewritten for W1:** TLS is verified against the shared state's CA certificate, read from the file the env names, and the server name `GATEWAY_DB_TLS_SERVERNAME`, not a pinned RDS bundle. The relay's connection does the same (T106). The metrics stand.
  - **Done** (9e7bea8d), with C2, C13, and S2's change.
- [x] T069 [US5] Make `placeholder_gate` read every host route's `first`, `second`, and `fallback`, as well as schema 1's `envs.prod.fallback`, before schema 2 lands. Check: T062 passes; `make test` passes on main's routing file with his adopted F3 words (FR-068) (feat/001-shared-state)
  - **Done** (892d1532).
- [x] T070 [US2] Add schema 2, the route per host, R1, H1, H2, and A1 to `src/config/validate.ts` and the router. Write `config/routing.yaml` as schema 2 with the laptop's line only, `laptop: { primary: local, fallback: anthropic }`, as main names prod's route, and no `ec2` line, which is the Author's (T095; ADR 0041). Check: T061 passes; T062 still passes on the schema-2 file; every existing gateway test passes (feat/001-shared-state)
  - **Done** (d8a90065).
- [x] T071 [US2] Extend preflight, the env templates, `operator.py`'s `ENV=shared` with its choice of admin listener, the gateway's admin action for `restore`, and `make shared-state-roles` and `make operator-restore` (both Author-only). Check: T063 and T064 pass (feat/001-shared-state)
  - **Done** (8a83a217): with POST /admin/restore and the admin-only stack (group 6's departures 3 and 13).
- [x] T072 [P] [US3] Change `evals/twin_readiness.py`. Check: T065 passes; `make evals`'s exit status is unchanged by the report (feat/001-shared-state)
  - **Done** (14373d31).
- [x] T073 [US2] Write `infra/prod/rds.tf`, and the RDS endpoint's permit in the tunnel's server configuration. Check: T066 passes; `make infra-check` passes (feat/001-shared-state)
  - **Rewritten for W1:** write `infra/prod/shared-state.tf` (the data volume, its attachment, the backups' bucket, and 5432's rule), and the tunnel end role's bucket and Parameter Store grants in prod's `iam.tf`, as P-I7, group 6's protected patch: the group had no protected file before, and the number comes after P-I6 so that no other patch is renamed. No `rds.tf`. The tunnel's permit is `shared-state:5432` (T041). Check: T066 passes; `make infra-check` passes.
  - **Done** (4f916025): P-I7, after P-I3 (group 6's departures 7, 8, 11).
- [x] T164 [US2] Write the `shared-state` service in `deploy/compose.yaml`'s `tunnel-end` profile, its configuration, and the tunnel end's host parts: the volume's mount, the certificate's write to tmpfs from Parameter Store, and the backup timer. Write `make shared-state-tls` (the CA in `~/.config/h4reet-ai/shared-state/`, the server's key and certificate for Parameter Store, the CA certificate for each env file), `make shared-state-roles` (rewritten for the tunnel end), and `make shared-state-restore`, each Author-only. Add `shared_state_backup_failed` to contracts/aws-alerts.md §2 with its runbook section. Check: T163 passes (FR-019, FR-056, FR-060) (feat/001-shared-state)
  - **The repository** (the review's I4): `infra/account/registry.tf`'s `stack` list gains `shared-state`, the copy of spec 000's pinned Postgres image by its index digest, test-first in `infra/test/test_account.py`.
  - **The restore's fetch** (the review's I8; plan.md §16, "The shared state on the tunnel end", Restore):
    - `make shared-state-restore` runs in the Author's terminal. It lists the backups' prefix with his session and picks the dump he names, or the latest;
    - it makes a presigned GET for that one object, valid for 15 minutes, and passes it to the tunnel end in a Systems Manager command;
    - the command fetches the dump, empties `shared-state`, and loads the dump over the socket. It prints neither the URL nor the dump.

    The tunnel end's role still only puts. T163's cases gain: the URL's expiry at 15 minutes; one object only; nothing of the URL in the target's output; and a refusal while EC2 runs or the laptop's prod does (contracts/shared-state.md §8, step 1).
  - **Done** (efd3f14c): with P-G4 and C16 (group 6's departures 5, 6, 9, 11).
- [x] T165 [US2] List every secret, secret name, and Author-only target groups 5 and 6 add, and check each against `.claude/settings.json`'s denies and `credentials.envVars`, the bash gate, and P-1's matrix rows. The design adds no new environment name: the superuser has no password over TCP, and the four role passwords are P-1's `DB_*_PASSWORD` names. The note's table holds at least these:

  | Item | Where it lives | Deny status |
  |---|---|---|
  | the shared state's CA key | `~/.config/h4reet-ai/shared-state/`, in the Author's terminal | denied: spec 000's `Read(~/.config/h4reet-ai/**)` and the sandbox's deny of that folder |
  | the server's TLS private key | made there by `make shared-state-tls`; written by him to the SecureString `/h4reet/tunnel-end/SHARED_STATE_TLS_KEY` | the folder is denied; Parameter Store is AWS's, which agent sessions don't reach (`AWS_*` in `credentials.envVars`, no cloud call); Terraform never reads it (rule T9) |
  | the same key on the tunnel end | `/run/h4reet/shared-state/server.key`, on tmpfs, mode 0400, owned by the container's user, written by the host script at each boot | outside any agent's reach: a cloud host. Not in any image, log, or env file |
  | the server's certificate and the CA certificate | `/h4reet/tunnel-end/SHARED_STATE_TLS_CERT`; the CA certificate in each env file | public material; no deny needed |
  | `make shared-state-tls`, `make shared-state-restore` | new Author-only targets | **not yet guarded:** no bash-gate rule or matrix row names them. Hence P-G2 |
  | the restore's presigned URL | the Author's terminal, then one Systems Manager command | a 15-minute bearer credential, never written to a file or printed |

  Write **P-G2** for the Author's hand, from plain copies: both new targets' rules in `.claude/hooks/bash-gate.sh`, and their rows in `redteam/forbidden-actions.sh` and `tools/gates/matrix-required.txt`, in every spelling the gate already covers, with a gap row for any that gets through. It applies before W1's gate (T171). If the build finds a new environment name after all, its deny by name goes in P-G2 too, before he writes its value (CLAUDE.md: a secret "gets its deny in the same patch that creates it, or an earlier one"). Check: the note holds the table; on a patched export the matrix refuses both targets in each spelling (FR-006, FR-011) (feat/001-shared-state)
  - **Done** (71dfc21d): the table is in W1's note; P-G2, with no gap row.
- [x] T074 [P] [US2] Amend the other specs by name, in this branch, since its code needs them (plan §13), each passage marked "(spec 001)":
  - spec 000's FR-030 (the sub-budget is the laptop's fallback rule) and FR-031 (one shared meter for prod, in the account), its contracts/config-files.md (R1), contracts/env-files.md (`H4_HOST`, `GATEWAY_DB_URL`), its operator actions (`restore`), and data-model.md (§2 to §7: the shared store, `host`);
  - spec 010's FR-001 and FR-026, and its Out list;
  - spec 007's FR-031's evidence.

  Check: the docs-links check passes; the reviewer reads each against the FRs it serves (plan §13); the note lists every amended passage for the Author (feat/001-shared-state)
  - **Done** (56d57875).
- [x] T075 [P] [US2] Add the shared state's panel to the "Hosts" row: latency and errors per host (plan §11). Check: the dashboard's provisioning test passes (FR-060) (feat/001-shared-state)
  - **From W1:** and the last good backup's age, `h4.shared_state.backup_age_seconds`.
  - **Done** (a9f6892d): the panels' queries in contracts/shared-state.md §10.
- [x] T076 [P] [US2] Add the disclosure rows C2 and C13, and S2's shared-state change, in the same commit as T068.
  - **From W1:** C2 in T162's words, and C16, the backups, in the same commit as T164's backup timer; the tunnel end's egress rows gain S3 for the backups' bucket. `docs/runbooks/shared-state.md`'s restore is from the last backup (contracts/shared-state.md §8, as T162 amends it), and its move of the tunnel end to another zone is that restore. The data volume's `prevent_destroy` blocks a plan that replaces it, so the move is a reviewed change: a second volume in the new zone, filled from the last backup, with the old one kept until a later change lifts its `prevent_destroy` (plan.md §16). Write `docs/runbooks/shared-state.md` (unreachable; the move; a restore from backup, with contracts/shared-state.md §8's five steps), and the laptop runbook's sentence that prod needs the network and an offline demo runs `make up ENV=dev` (plan Q4). Check: `disclosure_check` passes (FR-040, FR-056) (feat/001-shared-state)
  - **Done** (2fbc100e); C2 and C16 landed with their code (9e7bea8d, efd3f14c).

### The Author's plan block

- [ ] T077 Author: run `make plan ROOT=prod` on the branch itself, since the group has no protected file, and paste the block into the note's draft. Check: as T027 (feat/001-shared-state)
  - **Combined (W1):** prod's one block in T171, which holds this group's resources. The group now has a protected patch, P-I7 (T073).

### Close

- [ ] T078 Review and note, with T060's run. Check: as T009 (feat/001-shared-state)
- [ ] T079 Author: gate and merge. Check: as T029 (feat/001-shared-state, then main)
  - **Combined (W1):** T172.
- [ ] T080 Author: on `main`, verify, apply, and record RDS; write the role passwords to Parameter Store and the laptop's env file; run `make shared-state-roles`. Then the move (data-model.md §1.5):
  1. stop the laptop's paid route, by his route change (ADR 0041);
  2. run `make operator-status ENV=prod` and record its values;
  3. run `make operator-init ENV=shared` with them and a reason;
  4. release the cutover.

  Check: quickstart §6; nothing that wasn't zero starts at zero (FR-019) (main)
  - **Rewritten for W1** (after T173's applies; no RDS):
    1. run `make shared-state-tls`, and write the server's key and certificate, and the four role passwords, to Parameter Store; put the CA certificate and the laptop's passwords in the laptop's prod env file;
    2. `make secrets-check`, then `make release` for the tunnel end, whose deployer starts `shared-state` with the rest;
    3. run `make shared-state-roles`;
    4. check that the first backup arrived, and record its time;
    5. the move, steps 1 to 4 above, unchanged.

---

## Group 7: EC2 (US6, US3) — `feat/001-us6-ec2`

**Goal**: the very same compose stack on a spot EC2 without the model server, with the Anthropic API first and Bedrock second; the server action; releases on three hosts (FR-013, FR-023, FR-043 to FR-051, FR-067 to FR-069, FR-073). **Independent test**: quickstart §7.

**Precondition**: T001's check holds.

### Tests first

- [x] T081 [P] [US6] Extend `deploy/scripts/test_preflight.py`, `test_write_env.py`, and the compose policy's tests for the `ec2` class:
  - no model-server profile and no local `gateway-state`;
  - the IMDSv2 tag check, against a stub;
  - `write_env.py` refuses on a missing name, naming it, never a value;
  - the relay block bound only to EC2's private address, a literal.

  Check: RED (FR-043, FR-044, FR-050) (feat/001-us6-ec2)
- [x] T082 [P] [US6] Extend `deploy/scripts/test_deployer.py` for three hosts:
  - EC2's boot run before the stack starts, and on a bucket it can't reach, its last release plus an alert;
  - digests per host's services;
  - the hold, rollback, and the record's `host`;
  - `h4.deploy.events` and `h4.release.info`, with who started a stack (FR-049).

  Check: RED (FR-046 to FR-049) (feat/001-us6-ec2)
  - **As built:** EC2's part and the tunnel end's. The laptop's deployer waits: the laptop's stack is started by hand meanwhile, which is FR-049's case (plan.md §16, "Group 7, as built", 11).
- [x] T083 [P] [US6] Write `deploy/scripts/test_release.py`:
  - one build for `linux/amd64`, and for `linux/arm64` where the `hosts` field names a Graviton host;
  - upstream copies by index digest;
  - the red-team gate on all four adapters when a release makes hello or turns public;
  - a site build with drafts refused.

  Check: RED (FR-039, FR-048) (feat/001-us6-ec2)
- [x] T084 [P] [US6] Write `infra/test/fixtures/prod-ec2/` and `infra/test/test_prod_ec2.py`:
  - EC2's launch template, spot persistent with `stop` (T11), and standard credits if burstable;
  - IMDSv2 (T13);
  - its single interface, and the security group admitting only the tunnel end;
  - the roles `h4-prod-ec2` and `h4-prod-gateway`, both ordinary roles (R-15);
  - the model action's second target, `h4-prod-gateway`, and the server action (`AWS-StopEC2Instance` on the tag), with its execution role allowed only that document on that instance.

  Check: RED (FR-013, FR-023, FR-069) (feat/001-us6-ec2)
  - **From W1** (plan.md §16, "Four gates"):
    - the server action and its execution role are prod's, in `infra/prod/killswitch.tf`, with EC2's ID from the same root, so a replace updates them in its own plan;
    - the model action for `h4-prod-gateway` is prod's too, in the same file (T180). The account's model action gains no target;
    - `aws_ec2_instance_state.ec2_w1`, `state = "stopped"`, with `count = local.wired ? 0 : 1`, so W1's apply makes EC2 stopped (spec.md Assumptions, "From W1 to W2");
    - `/h4reet/prod/ec2-instance-id`, a String parameter holding EC2's ID, in `infra/prod/handover.tf`;
    - `terraform_data.ec2_generation`, from `local.ec2_generation = 1`, is in EC2's `replace_triggered_by` (T097);
    - the data volume is a resource of its own, kept across a replace;
    - EC2's root and data volumes carry `project` and `component` (T154).
- [x] T085 [P] [US3] Write `evals/sc017_ec2_routes.py`'s test, with stand-ins for both paid APIs:
  - 100 turns with both healthy, answered by the Anthropic adapter;
  - with it failing, every admitted turn answered by Bedrock;
  - `fallback_day` unchanged;
  - provider, model, tokens, and cost on each span and ledger row.

  Check: RED (SC-017) (feat/001-us6-ec2)
- [x] T086 [P] [US6] Extend the egress proxy's allowlist test for EC2's hosts: `api.anthropic.com`, Bedrock's endpoint, Telegram, the SMTP host, and the AWS endpoints (ECR, S3, Systems Manager, STS, Budgets, and SNS for its alerts), generated from the disclosure. Check: RED (FR-051) (feat/001-us6-ec2)

### Implementation

- [x] T087 [US6] Write `deploy/hosts/` for EC2: cloud-init, systemd units (the deployer at boot, the egress proxy, the credential timer for `h4-prod-gateway`), nftables, and `daemon.json`. Add the `ec2` class to compose and preflight, and extend `write_env.py`. Check: T081 and T086 pass (feat/001-us6-ec2)
- [x] T088 [US6] Extend `deploy/scripts/deployer.py` and `release.py`. Check: T082 and T083 pass (feat/001-us6-ec2)
- [x] T089 [US6] Write `infra/prod/ec2.tf`. Write `ec2-market.tf` (EC2's spot), `iam.tf` (EC2's roles), and `killswitch.tf` (the model action's second target, the server action) as P-I4. Check: on a patched copy, T084 passes, and `make infra-check` passes (feat/001-us6-ec2)
  - **From W1:** P-I4 holds `infra/prod/killswitch.tf`, with the server action, EC2's model action, and their two execution roles (T180), and `infra/prod/handover.tf`'s parameter. `ec2.tf` holds the generation's `terraform_data`, `aws_ec2_instance_state.ec2_w1`, and the volumes' tags. The account's `killswitch.tf` doesn't change.
  - **As built:** P-I4 (`docs/merge-requests/2026-11-13-feat-001-pi4-ec2.patch`) after P-I3 and P-I7, and P-G5, the compose policy's `ec2` class, after P-G4 (plan.md §16, "Group 7, as built", 2).
  - **Every image a host runs has its repository** (the review's I4): a test in `infra/test/test_account.py` reads each host class's services from `deploy/compose.yaml`, EC2's among them, and checks each image in `registry.tf`'s lists. T051 and T164 add the tunnel end's, and T122 the functions'.
- [x] T180 [US2] EC2's model action, in prod (FR-023; plan.md §16, W1's departure 10; ADR 0049, proposed). Tests first, in `infra/test/test_prod_ec2.py`, with fixtures:
  - an `aws_budgets_budget_action` on `h4-model-month` by its name, at 100% of actual, automatic, `APPLY_IAM_POLICY`, attaching `h4-deny-paid-models` to `h4-prod-gateway` alone, tagged;
  - its own execution role, which may attach and detach that one policy on that one role, and trusts `budgets.amazonaws.com` for this account alone;
  - both in `infra/prod/killswitch.tf`, made in the same plan as `h4-prod-gateway`;
  - no target added to the account's model action.

  Then write it into P-I4, and a runbook line in `docs/runbooks/aws-budget-action.md`: the reverse of each of the two model actions. Check: RED, then GREEN on a patched copy; `make infra-check` passes. In W1's prod apply, confirm that one budget may hold two actions of the same type (a plan never calls Budgets, group 7's review B, nit 2); if it may not, the apply fails at that action alone, EC2 is checked stopped, and the fallback is the account's second target behind the switch (`docs/runbooks/aws-budget-action.md`, "A partly failed apply") (feat/001-us6-ec2)
- [x] T090 [P] [US3] Write the SC-017 harness, `evals/sc017_ec2_routes.py`, reading a routing fixture with EC2's route until the Author's line is in. Check: T085 passes against stand-ins (feat/001-us6-ec2)
- [x] T091 [P] [US6] Add the release panel to the "Hosts" row: the release on each host, and who started a hand-started stack (plan §11; FR-049). Check: the dashboard's provisioning test passes (FR-060) (feat/001-us6-ec2)
- [x] T092 [P] [US5] Make the disclosure's EC2 changes in the same commit as T087:
  - S2's EC2 part (EC2's allowlist, C2), F1 (EC2's second route), and F3's EC2 part (its trigger, default, and switch-off), beside his adopted words, which stay verbatim;
  - A1 and A2 from EC2, and D1's sentence;
  - V2's Why, Default, and switch-off;
  - C7's EC2 and laptop parts (EC2's deployer, ECR, the secrets store, Systems Manager, and SNS; the laptop's local release directory).

  Write `docs/runbooks/ec2.md` and `deploy.md`. Check: `disclosure_check` passes; row F3's adopted words are byte-identical to main's (feat/001-us6-ec2)

### The Author's plan block

- [ ] T093 Author: as T027, with P-I4, for `ROOT=prod` (EC2) and `ROOT=account` (the model action's second target and the server action). Check: as T027 (feat/001-us6-ec2)
  - **Impossible as written:** the account's half named EC2's instance, for the server action, and `h4-prod-gateway`, for the second target, before prod's apply made either. **Combined (W1):** the server action moves to prod, beside EC2 (T084). EC2's model action is a second action on `h4-model-month`, also prod's (T180), in place of a second target. So the group's resources are all in prod's block in T171, and the account's block gains nothing from this group.

### Close

- [ ] T094 Review and note. Check: as T009 (feat/001-us6-ec2)
- [ ] T095 Author: apply P-I4 on the branch, as in T093. Then add EC2's route line to `config/routing.yaml`, `ec2: { first: anthropic, second: bedrock }` (contracts/env-cloud.md §4), in his own commit on the branch: ADR 0041 makes prod's route change his, so no agent writes it. Gate; merge. Check: the gate passes, `make test`'s placeholder gate among it, over the `ec2` route with his adopted F3 words (FR-068) (feat/001-us6-ec2, then main)
  - **Combined (W1):** P-I4 on W1's `-p` branch, and his route line in his own commit there, before T171's blocks; W1's one gate (T172).
- [ ] T096 Author: on `main`, verify, apply, and record both roots. Write EC2's secrets, among them the Anthropic key in Parameter Store. Set the Anthropic account's monthly spend limit at or under $20 where the account offers one, and record that it is set (FR-073). Run the first `make release`, then start EC2 from the console (`make ec2-start` arrives in group 9). Check: quickstart §7 (FR-068) (main)
  - **Combined (W1):** the applies are T173's; prod's makes EC2 stopped (`aws_ec2_instance_state.ec2_w1`; spec.md Assumptions, "From W1 to W2"). Then the secrets, the limit, and the release, after the move (T080). He starts EC2 from the console, inside the hours, for T097's SC-017 and T115's red-team runs, and its deployer takes the release at boot. The task ends with `make ec2-stop` (plan.md §16, "Between W1's applies and W2's").
- [ ] T097 Author: run SC-017's recorded run, then destroy and recreate EC2. Check: SC-017; SC-005, the digests match and the shared state is unchanged (main)
  - **Impossible as written:** nothing could destroy and recreate EC2. `make infra-verify` applies only a saved plan whose block a merged note holds for `infra/`'s tree, and a `-replace` plan of an unchanged tree is a second block for the same tree, which no note can hold (plan.md §16, group 4's departure 4). And had the account root named EC2's ID, the replace would have left it on a gone instance.
  - **Fixed (plan.md §16, W1's departure 6):** SC-017's run stays in W1, after T096. The replace is a reviewed change in W2: `local.ec2_generation` from 1 to 2 (T175), so W2's prod block shows EC2 replaced and the server action updated with it, and nothing in the account changes. Check SC-005 after W2's apply (T178): the new EC2's digests match the release's, and `make operator-status ENV=shared` matches its reading before the apply.
  - **The old spot request** (the review's I6; plan.md §16, W1's departure 13). Whether the provider cancels a persistent spot request when it destroys the instance is to confirm. If it doesn't, AWS may launch a second instance from it, which Terraform doesn't manage. So the runbook's step after the replace, in `docs/runbooks/ec2.md` (T128):
    1. find the old instance's spot request (`aws ec2 describe-spot-instance-requests`, by the old instance's ID from the apply record), and cancel it if it is still open;
    2. check that exactly one instance carries `h4-prod-ec2`, the one `/h4reet/prod/ec2-instance-id` names, and that no instance the request launched is left, tagged or not;
    3. record both in the apply record.

    The guard also stops any running tagged instance the parameter doesn't name, and alerts `ec2_unrecognised_instance` (T117).
    That kind arrives with the guard, test-first: its row in contracts/aws-alerts.md §2 (who sends it: `h4-ec2-guard`; a running instance tagged `h4-prod-ec2` that `/h4reet/prod/ec2-instance-id` doesn't name, stopped; the page `ec2.md`) and its notice in the alert bridge, in P-I6. The bridge's test holds every kind the contract lists to a notice, so the row can't land before the bridge's patch (W1's `make check`, 2026-11-12).

---

## Group 8: the edge and the relay (US3, US5) — `feat/001-us3-us5-edge`

**Goal**: hareet.ai over TLS from the edge, the relay on the tunnel end picking the host, the disclosure live (FR-027 to FR-042, FR-061, FR-066, FR-075). **Independent test**: quickstart §8. The site stays unannounced until group 9 ends.

**Precondition**: T001's check holds.

### Tests first

- [x] T098 [P] [US3] Write `services/relay/test/**`, contracts/relay-http.md's suite, with stub hosts and a stub store:
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
- [x] T099 [P] [US3] Extend `evals/breach.py` and its test: the relay, in `dev-relay` on dev-cpu, answers degraded within 10 s of the trip, and forwards again after the reset. Check: RED (FR-025) (feat/001-us3-us5-edge)
- [x] T100 [P] [US5] Extend `apps/web/test_site.py`: no absolute URL to another host; the disclosure page matches the Markdown, with the new rows; `/_degraded/api.json` is spec 000's degraded body with `no_host_serving` and `stack` null. Check: RED (FR-038, FR-041, FR-066) (feat/001-us3-us5-edge)
- [x] T101 [P] [US5] Write `evals/visitor_scan.py`'s test. It scans every store on each host, plus the shared state, the relay's logs, and the tunnel end's, for a marker message and address after a scripted visit. Check: RED (FR-042, SC-011) (feat/001-us3-us5-edge)
- [x] T102 [P] [US3] Add red-team cases for hello and twin turns on the paid adapters, in `redteam/cases/`: claiming to be the Author, disparaging, revealing configuration. They run on the laptop's local model and fallback and on EC2's Anthropic API and Bedrock. Check: the cases load, and RED against a stub that fails them (FR-039) (feat/001-us3-us5-edge)
- [x] T103 [P] [US3] Extend `apps/web`'s tier tests: `no_host_serving` and `host_error` show `cannot_talk.resting`, and `public_cap` shows `turn_refused.slow_down`. Check: RED (FR-066; spec 002's contract §3, amended by name) (feat/001-us3-us5-edge)
- [x] T104 [P] [US3] Write `infra/test/fixtures/prod-edge/` and `infra/test/test_prod_edge.py`:
  - the zone and its records; the certificate;
  - the distribution's aliases, behaviors, origins (OAC; the VPC origin to the tunnel end's private interface), policies, and headers;
  - error responses (502 and 504 to 503 with `/_degraded/api.json`, TTL 0);
  - no access logs;
  - CloudFront's policies only in `edge-limits.tf` (rule T5);
  - the probe's schedule enabled in `infra/account/alerts.tf`.

  Check: RED (FR-027 to FR-029, FR-061) (feat/001-us3-us5-edge)
  - **From W1** (plan.md §16, "Four gates"; T115's fix):
    - the zone and its name servers' output are made without the switch;
    - from W1 without the switch, since the Author's answer "Yes w1 can create the vpc origin": the VPC origin (plan.md §16, "B-6: option C, and the VPC origin from W1");
    - behind prod's `local.wired`: the certificate, its validation records and `aws_acm_certificate_validation`, the distribution, the alias records, and the site's and the public view's bucket policies, whose `aws:SourceArn` is the distribution's. The buckets themselves, and their public access blocks, don't wait;
    - behind the account's: the probe's schedule enabled, and the probe's alarm with missing data breaching (group 4's departure 2).

    The checks pass with each switch off and on.

### Implementation

- [x] T105 [US3] Write P-6 as `docs/merge-requests/<date>-feat-001-p6-public-cap.patch`, before the relay's code: `config/budgets.yaml`'s new `public` section, with keys for the per-address requests a minute, burst, and requests a day, and the global in-flight limit, each figure left blank and marked as the Author's (FR-033; plan §14). The ADR for the public cap (T007) names it. Check: the patch applies to a fresh export; on a patched copy, the gateway's validator refuses the blank figures, naming each key (feat/001-us3-us5-edge)
- [x] T106 [US3] Write `services/relay/` (Fastify on Node 24, a second npm workspace, the gateway's pins), and `relay` in compose's `tunnel-end` and `dev-relay` profiles. Make the gateway's validator accept the `public` section. Add the relay's spans and metrics (`relay.request`, `h4.relay.host`, `h4.relay.requests`, `h4.relay.host_healthy`, `h4.serving_host`, `h4.cap.refused`, `h4.handover.events`, `h4.handover.gap_seconds`). Check: T098 and T099 pass, with test figures in the tests' own fixtures (FR-060) (feat/001-us3-us5-edge)
- [x] T107 [US3] Write `infra/prod/{edge,dns,site}.tf`. Write P-I5: CloudFront's policies in `infra/prod/edge-limits.tf`, which rule T5 protects, and the one line in `infra/account/alerts.tf` that enables the probe's schedule. Check: on a patched copy, T104 passes, and `make infra-check` passes (feat/001-us3-us5-edge)
  - **From W1:** the resources T104 names wait behind the switches. The probe's line reads `local.wired`, so P-I5 enables nothing in W1, and P-W2 enables it in W2. `infra/prod/edge.tf` is under spec 000's protected names, so it's in P-I5 too (plan.md §16, "Groups 1 to 4, as one branch", 6).
- [x] T108 [US5] Change `apps/web`: the status page's links, the disclosure page's new rows, and `/_degraded/api.json` built from spec 000's schema. Amend spec 002's contract §3 by name, with the tier mapping. Check: T100 and T103 pass (feat/001-us3-us5-edge)
- [x] T109 [P] [US5] Write the visitor scan, and the red-team runner's support for the four adapters. Check: T101 and T102 pass (feat/001-us3-us5-edge)
- [x] T110 [P] [US3] Add the relay's panels to the "Hosts" row: which host serves (a state timeline), the handovers and their gaps (from `v_handovers`), the relay's requests by host and outcome, and the cap's refusals (plan §11). Check: the dashboard's provisioning test passes (FR-060) (feat/001-us3-us5-edge)
- [x] T111 [P] [US5] Add the disclosure rows V1, V2's path, V4, V6 to V9, C1, C14, and S15, in the same commit as T106 and T107. Check: `disclosure_check` passes (FR-040) (feat/001-us3-us5-edge)

### The tunnel end, measured, and the new lines priced (W1)

- [ ] T166 Measure the tunnel end's five services on dev-cpu, as T016 measured the stack: `tunnel-end`, `relay`, `snapshot-sink`, the collector, and `shared-state`, under the relay's load at the gateway's global metered limit, against a stub host. Record each service's peak, and the data volume's size after the run, in research.md R-33 and the note. Name the smallest arm64 type that fits by memory alone (R-20 expects `t4g.small`, 2 GiB), and write no price. Set `local.tunnel_end_type` in `infra/prod/tunnel-end.tf` to it, in place of T046's placeholder. That file isn't protected, so no patch changes: `ec2-market.tf` only reads the local. This replaces T115's "Confirm the tunnel end's measured memory on its `t4g.micro`", since the type is in prod's block (plan.md §16, W1's departure 7). Check: the record names the type and the run's length and load; T046 passes with the local set (FR-021, FR-052) (feat/001-us3-us5-edge)
- [x] T167 Author: price, from AWS's pages in his terminal, the lines W1 adds or changes in research.md R-05:
  - the tunnel end at T166's type, on spot, in place of `t4g.micro`;
  - its data volume, and the backups' storage (question 4);
  - the "to confirm" lines W1's resources use: the health check, the alarms, CloudFront's VPC origin, Scheduler, and EventBridge's rules on AWS events;
  - T017's confirmations: each R-05 line priced on 2026-11-11 from trackers or summaries, `t4g.large`'s spot price among them, read again from AWS's pages or `aws ec2 describe-spot-price-history`.

  Then confirm that the $45 figure holds, or set a new one in `~/.config/h4reet-ai/infra/bootstrap.env`, as at T017. RDS's lines and its secret go. Check: R-05's lines carry his prices and their dates, and none is still "to confirm" (FR-021) (feat/001-us3-us5-edge)
  - **Done** (2026-11-13): his figures in research.md R-05, "The server budget's lines, the Author's figures (T167)", each read 2026-11-13, his words "yes t167 confirmed"; the month about $27 to $29 against $45, which he didn't change.
- [x] T179 Amend spec.md's Expected Cost Impact with T167's prices: the server budget's paragraph and the rows for EC2, the tunnel end, and the shared state's store. They already name the hours, the larger tunnel end, the data volume, and the backups, since the regrouping (2026-11-12), but without prices. Check: each row's figure is T167's, with its date; the figure is the Author's (FR-021) (feat/001-us3-us5-edge)
  - **Done** (2026-11-13): spec.md's Expected Cost Impact, the server budget's paragraph and the rows for EC2, the tunnel end, and the shared state's store, with T167's figures and their date, as his.

### The Author's plan block

- [ ] T112 Author: as T027, with P-I5, for `ROOT=prod` (the edge) and `ROOT=account` (the probe's schedule). Check: as T027 (feat/001-us3-us5-edge)
  - **Impossible as written:** the edge's plan held the certificate and the distribution, which need the name servers to point at a zone that only this apply makes (T115). And enabling the probe before the site answers would page every five minutes. **Combined (W1):** the zone, the buckets, and CloudFront's policies are in prod's block in T171. The certificate, the distribution, the records, the buckets' policies, and the probe are W2's (T176).

### Close

- [ ] T113 Review and note. Check: as T009 (feat/001-us3-us5-edge)
- [ ] T114 Author: write his figures into P-6 and into the public cap's ADR, and apply P-6 on the branch; apply P-I5, as in T112; gate; merge. Check: the gate passes, and the gateway's validator accepts his figures (FR-033) (feat/001-us3-us5-edge, then main)
  - **Combined (W1):** P-6 with his figures and P-I5 on W1's `-p` branch, before T171's blocks; W1's one gate (T172).
- [ ] T115 Author: on `main`, point the registrar's name servers at the zone and record it (contracts/infra-records.md §2). Verify, apply, and record both roots (the edge, and the probe's schedule); deploy the relay to the tunnel end. Run the red-team cases on all four adapters, and record that they pass. Confirm the tunnel end's measured memory on its `t4g.micro` (R-33). Check: quickstart §8 (FR-039) (main)
  - **Impossible as written:** its first step points the name servers at a zone that doesn't exist until its second step's apply.
  - **Reordered:**
    1. W1's prod apply makes the zone (T173);
    2. then he points the registrar's name servers at the zone's four, read from the root's output, and records it (contracts/infra-records.md §2). Before that, the records hareet.ai holds today are the regrouping note's question 6;
    3. the relay runs on the tunnel end from T080's release;
    4. he runs the red-team cases on all four adapters, on the laptop's stack and on EC2's while it runs for T097's SC-017, and records that they pass;
    5. W2's apply makes the certificate, which validates through the delegated zone, then the distribution, the records, and the probe (T178).

    The tunnel end's memory is T166's.

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

**Precondition**: T001's check holds. **From W1,** the group also builds EC2's 12 hours a day (spec.md Assumptions, "EC2 on 12 hours a day"; ADR 0048, proposed; plan.md §16). The Author's hours: "12 hours, from 7am to 7pm Mountain Standard Time" (2026-11-12; spec.md Clarifications). T116 and T117's hours cases wait for his answers to the regrouping note's questions 1a (the zone), 2 (a hand start outside the hours), and 3 (alerts on routine scheduled starts and stops).

### The hours, first

- [x] T168 Write ADR 0048, proposed, at the next free number in `docs/adr/README.md` (0048 at 4785107e), with its index row: EC2 on 12 hours a day, two schedules that invoke the start function and the guard, and the hours as a check in both. It quotes the Author's three answers verbatim, extends ADR 0027's decision 1, and leaves the zone to question 1a. Check: the docs-links check passes; the ADR quotes his words (FR-062, FR-069) (spec/001-w1-regroup)
  - **Done** in W1's first commit, 2026-11-12. It's accepted with W1's merge, once it holds his answers.
- [x] T169 Amend spec.md by name, after his answers to questions 1a, 2, and 3, each passage marked "(amended; ADR 0048)":
  - **Done** (W1's step 4, 2026-11-12): his answers, "W1 answers: 1a A, 1b A, 2 A, 3 A, 4 A, W-9 A, B-3 A, G10-1 A, G10-2 A, G10-3 A", each the option built; the passages applied as W1's note wrote them for option A;
  - FR-065: the start function also refuses outside the hours;
  - FR-069: the list of what starts and stops EC2 gains the two schedules, which act only through the functions;
  - FR-071: the guard also stops EC2 outside its hours;
  - FR-070's provisional reading: the guard's role reads "the health check's status" as the alarm `h4-laptop-away`'s state, by its name, and both functions read `/h4reet/prod/ec2-instance-id`; the guard may stop any instance tagged `h4-prod-ec2`, to stop one it doesn't recognise (research.md R-15, amended);
  - FR-059 and FR-065's dashboard: the hours, and each scheduled start and stop;
  - Degraded Modes: a row, "EC2 outside its hours, and the laptop off": the site, the resting message, and the public view's "no host serving"; for the operator, the scheduled outcomes on the dashboard;
  - Edge Cases: a start at the hours' open that fails for want of spot capacity;
  - the hours in contracts/handover.md §3 and §4, and research.md R-29 and R-30. Where the moved resources live is amended already, in W1's first commit (contracts/handover.md §2, contracts/aws-alerts.md §4, research.md R-02, R-15, and R-22).

  Check: the docs-links check passes; ADR 0048 and the spec agree (feat/001-us4-us7-handover)
- [x] T170 [US8] Only if his answer to question 1b is that the site states the hours: extend `services/relay/test/**` and `apps/web`'s `/status/` tests so that the status document carries the hours, in the zone his answer names, read from `local.ec2_hours` only. No second copy is kept in the release's configuration: `snapshot-sink`'s cloud part reads the two schedules, `scheduler:GetSchedule` on their names, which `local.ec2_hours` sets, and the tunnel end's role gains that one read. The room's resting words stay spec 002's, in his words (P-5). Then make them pass. Check: RED, then GREEN; FR-038 holds, since the hours are the system's, not a fact about the Author (feat/001-us4-us7-handover)
  - **Done** (53d2a842 RED, the Author's; the GREEN after it): on `/status/` alone, by his answer "Only /status/ (Recommended)", a named deviation from 1b's wording (plan.md §16, "T170: /status/ alone"; spec.md Assumptions); the role's read is P-I6's, not the tunnel end's P-I3, since the sink's other reads are P-I6's.

### Tests first

- [x] T116 [P] [US4] Write `infra/lambdas/ec2_start/test_start.py`, with stub SSM, Budgets, EC2, and Route 53:
  - **Done** (dc6884a3 RED, 58a94715 GREEN; W1's note, group 9). Questions 1a, 2, and 3 at their recommended options, **provisionally, until the Author's answers**, each one constant (the note's table). The base's time-zone database couldn't be confirmed, so the functions carry the two zones' rules.
  - step 1 refuses with `paused` while the autostart switch is `off`;
  - step 2 with `server_budget_stopped`;
  - step 3 with `tunnel_end_down`;
  - step 4 with `laptop_serving`, when invoked by hand or `from: tunnel_end_back`;
  - step 5 starts only the tagged instance, and `start_failed` carries AWS's code;
  - one attempt per invocation;
  - one alert and one embedded-metric log line per outcome.

  Check: RED (FR-065, FR-070, FR-076) (feat/001-us4-us7-handover)
  - **From W1** (ADR 0048):
    - `outside_hours` after `paused` and before `server_budget_stopped`, for every trigger, and for a hand start as question 2's answer says;
    - `from: hours_open` runs the `laptop_serving` check;
    - the window comes from one environment value, which `local.ec2_hours` sets. The cases cover both of question 1a's zones, a day on each side of each daylight-saving change, and each edge of the window. Whether the base carries the time-zone database is to confirm here;
    - EC2's ID is read at run time from `/h4reet/prod/ec2-instance-id`, by its path, and the start acts on that instance only if it carries `h4-prod-ec2`. The laptop's serving is read from `h4-laptop-away`, by `cloudwatch:DescribeAlarms` on its name-built ARN (the review's I7). So no ID from prod is in the function's configuration;
    - alerts follow question 3's answer.
- [x] T117 [P] [US7] Write `infra/lambdas/ec2_guard/test_guard.py`, with stub SSM, Budgets, EC2, and Route 53:
  - it stops EC2 when the health check is healthy (`ec2_stopped_laptop_serving`);
  - when the autostart switch is `off` (`ec2_stopped_paused`);
  - when the server budget's action has run and isn't reversed (`ec2_stopped_server_budget`);
  - it does nothing otherwise, and stops only the tagged instance;
  - one alert and one embedded-metric log line per stop.

  Check: RED (FR-071) (feat/001-us4-us7-handover)
  - **From W1** (ADR 0048):
    - `ec2_stopped_outside_hours` on `running` outside the window;
    - `from: hours_close` stops EC2 if it runs, and writes only its log line if it doesn't;
    - the same window value as T116's;
    - alerts follow question 3's answer.
  - **From W1** (the review's I7 and I6; contracts/handover.md §2 and §4, amended):
    - "the health check is healthy" is read as `h4-laptop-away` in `OK`, by `cloudwatch:DescribeAlarms` on its name-built ARN, since Route 53's health checks can't be scoped by tag in IAM and the check's ID is prod's. The stub is CloudWatch's, not Route 53's;
    - **more than one tagged instance:** with two running instances tagged `h4-prod-ec2`, it stops the one `/h4reet/prod/ec2-instance-id` doesn't name, alerts `ec2_unrecognised_instance` with its ID, and then applies its table to the named one. It never stops the named one for being a second;
    - with the parameter unreadable, it stops nothing, and alerts once.
- [x] T118 [P] [US4] Write `deploy/scripts/test_handover.py`, with a stub status and a stub EC2:
  - waiting reads `serving`, then stops EC2 once it is `laptop` and records the window;
  - serving stops EC2 again after a flap, and after a start on the tunnel end's return while the laptop was reconnecting;
  - an expired session alerts once and keeps serving;
  - `make up` never fails on a failed stop.

  Check: RED (FR-063, FR-064) (feat/001-us4-us7-handover)
- [x] T119 [P] [US4] Write `infra/test/fixtures/handover/` and `infra/test/test_handover.py`:
  - **Done** (e53db111 RED, 6cefd8ff GREEN): `infra/test/test_handover.py`, fourteen fixtures, P-I6.
  - the health check on the tunnel end's address, port 8087, `/health`;
  - the alarm;
  - the rules: the alarm's change, EC2's warning, EC2's `running`, and the tunnel end's `running` to the start function and the alert;
  - the two functions' roles, the guard's with its read of the server action's status (`budgets:DescribeBudgetActionsForBudget` on `h4-server-month`);
  - the tunnel end's role, with its reads for the dashboard and its one-key write for `site/status/latest.json` (R-15);
  - the autostart switch's parameter with `ignore_changes`;
  - each of these only in protected files.

  Check: RED (FR-012, FR-065, FR-071, FR-072) (feat/001-us4-us7-handover)
  - **From W1** (plan.md §16, "Four gates"; ADR 0048):
    - **in prod:** the health check and `h4-laptop-away` in `failover.tf`; the four instance rules in `handover.tf`, each naming its instance from the same root;
    - **in the account:** the functions, their roles and permissions, the autostart switch, `h4-laptop-away-rule` matching the alarm by name, and in `handover.tf`, `local.ec2_hours` and the two schedules, `h4-ec2-hours-open` and `h4-ec2-hours-close`, in its zone, with a role that may invoke only the two functions;
    - **behind `local.wired`:** the functions, their permissions, the schedules, `h4-laptop-away-rule`, and the two rules' function targets. The rules' SNS targets don't wait;
    - **no ID across roots:** nothing under `infra/account` names a prod instance or health-check ID, nor reads `infra/prod`'s state (the rehearsal instance, the account's own, is exempt);
    - **the functions' roles** (research.md R-15, amended): each reads `h4-laptop-away` by its name-built ARN, and `/h4reet/prod/ec2-instance-id` by its path. Neither reads a Route 53 health check. The guard may stop any instance tagged `h4-prod-ec2`, and the start function may start only the one that carries the tag;
    - **the parameter:** `/h4reet/prod/ec2-instance-id`, a String in `infra/prod/handover.tf`, takes its value from EC2's resource, so a replace updates it in the same plan;
    - each check passes with the switch off and on.
- [x] T120 [P] [US7] Write the tests of `make ec2-status`, `ec2-start`, `ec2-stop`, `ec2-autostart`, and `server-budget-restore`, with stubs: each is refused in an agent session; `ec2-start` invokes the function with `manual: true`; `ec2-autostart STATE=on` writes the switch, invokes the start once, and writes the audit row. Check: RED (FR-012, FR-065) (feat/001-us4-us7-handover)
  - **From W1:** `ec2-status` shows the hours and whether it is inside them; `ec2-stop` works in W1, before the functions exist, since its permission set is on the tag (plan.md §16, "Between W1's applies and W2's").
- [x] T121 [P] [US7] Write `deploy/scripts/test_snapshot_cloud.py`, with stub EC2, SSM, Route 53, Budgets, and CloudWatch: each of the sink's cloud reads (contracts/public-view.md §2) becomes its metric; a failed read is counted as an error, never shown as a fresh value; no secret, account ID, or address in a label. Check: RED (FR-060, FR-065) (feat/001-us4-us7-handover)

### Implementation

- [x] T122 [US4] Write `infra/lambdas/ec2_start/` and `ec2_guard/`. Check: T116 and T117 pass (feat/001-us4-us7-handover)
  - **From W1** (the review's I4): `infra/account/registry.tf`'s `lambda` list gains `h4-ec2-start` and `h4-ec2-guard`, made by W1's account apply so the Author can push to them before W2 (T174), test-first in `infra/test/test_account.py`. The functions themselves read `local.lambda_images`, empty until W2, so the account's W1 plan makes the repositories without the functions. Each function's Dockerfile is held to `deploy/images.lock`'s base by `infra/lambdas/test_images.py`.
- [x] T123 [US4] Write `deploy/scripts/handover.py`, started by `make up ENV=prod` and stopped by `make down ENV=prod`, with `h4.handover.window_seconds`. Check: T118 passes (FR-060) (feat/001-us4-us7-handover)
- [x] T124 [US4] Write `infra/prod/failover.tf`, `infra/account/handover.tf`, and the roles' changes in `iam.tf` as P-I6. Check: on a patched copy, T119 passes, and `make infra-check` passes (feat/001-us4-us7-handover)
  - **From W1:** P-I6 also holds `infra/prod/handover.tf`'s rules, the schedules, their role, and `local.ec2_hours`, in the zone his answer to question 1a names. That is FR-069's "by the Author's patch, with an ADR", with ADR 0048.
- [x] T125 [P] [US7] Write the `make ec2-*` and `server-budget-restore` targets. Check: T120 passes (feat/001-us4-us7-handover)
- [x] T126 [US7] Write the sink's cloud reads in `deploy/scripts/snapshot_sink.py`, and `snapshot-sink` in the `tunnel-end` profile, exporting the metrics through the tunnel end's collector (C15). Check: T121 passes (FR-060) (feat/001-us4-us7-handover)
  - **Done as a module** (plan.md §16, "Group 9, as built", 15): its service, and the credentials its reads need, are group 10's (T137).
- [x] T127 [P] [US7] Add the handover's and the server's panels to the "Hosts" row: EC2's state and interruptions; its starts and refusals and the guard's stops; the autostart switch; the health check's status; the handover window; and the server's month against its budget beside model spend against the ceilings and the adapter's month (plan §11; User Story 7). Check: the dashboard's provisioning test passes (FR-060, FR-065) (feat/001-us4-us7-handover)
  - **From W1:** and the hours, with each scheduled start and stop, and `outside_hours`' refusals.
- [x] T128 [P] [US4] Write `docs/runbooks/handover.md` (with EC2 started on the tunnel end's return while the laptop reconnects, and stopped by the loop) and `spot-interruption.md`, and update `tunnel-end.md` and `server-budget.md` (the guard's `ec2_stopped_server_budget`). Add the disclosure row C6 and C5's change. Check: each alert kind of contracts/aws-alerts.md §2 names its runbook; `disclosure_check` passes (FR-040, FR-056) (feat/001-us4-us7-handover)
  - **From W1:** `docs/runbooks/ec2.md` and `handover.md` gain the hours: what happens at the open and the close, a failed start at the open, and how the Author changes the hours (his patch). Each new kind, `outside_hours` and `ec2_stopped_outside_hours`, names its runbook. No new flow leaves a device: the schedules invoke functions inside the account.
  - **From W1** (the review's I6): `docs/runbooks/ec2.md` gains the step after any replace of EC2, T097's three, and the page for `ec2_unrecognised_instance`: what the guard stopped, then the spot request to cancel.

### The Author's plan block

- [ ] T129 Author: as T027, with P-I6, for `ROOT=prod` (the health check, the tunnel end's role) and `ROOT=account` (the alarm, the rules, the functions, their roles, the autostart switch). Check: as T027 (feat/001-us4-us7-handover)
  - **Impossible as written:**
    - the account's alarm needed prod's health check, and its rules prod's instances, before prod's apply made them;
    - the functions needed image digests that exist only after the account's apply makes their repositories and the Author pushes.

    **Combined (W1):**
    - in T171: prod's block holds the health check, its alarm, and the instance rules' SNS targets; the account's holds the roles, the permission set, and the autostart switch;
    - in W2 (T176): the functions, their permissions, `h4-laptop-away-rule`, the schedules, and the rules' function targets.

### Close

- [ ] T130 Review and note. Check: as T009 (feat/001-us4-us7-handover)
- [ ] T131 Author: apply P-I6 on the branch, as in T129; gate; merge. Check: as T029 (feat/001-us4-us7-handover, then main)
  - **Combined (W1):** T172.
- [ ] T132 Author: on `main`, verify, apply, and record both roots; set the autostart switch `on`, so EC2 may start automatically; release the tunnel end's new `snapshot-sink`. Check: User Story 1's scenario 10, a fresh plan after a handover shows no change (FR-072) (main)
  - **Split:** the applies are T173's (W1) and T178's (W2). The tunnel end's `snapshot-sink` comes with T080's release. The switch goes `on` after W2's apply, when the start function exists (T178). Scenario 10's check runs after T133's first handover.
- [ ] T133 Author: rehearse the handover and the interruptions, as quickstart §9 lists them:
  - ten handovers each way (SC-007);
  - the autostart switch and the guard;
  - five spot interruptions of EC2 and three of the tunnel end (SC-018), through AWS's fault-injection service or the console's interruption test, as priced in T017.

  Check: SC-007, SC-018 (main)
  - **After W2's apply** (T178), inside the hours, and one open and one close of the hours, with the laptop off and on. A tunnel end's interruption now also stops the shared state, whose values must come back unchanged (SC-018's third point).
- [ ] T134 Author: write the resting message's new words through spec 002's follow-up (plan Q5, provisional; P-5), or keep them. Then make the first public release. Check: SC-001 over a day; SC-010 with the browser's network log; SC-011's visitor scan (main)
  - **After T133.** SC-001's day includes the hours' close and open: the window outside them is "EC2 stopped on purpose".

---

## Group 10: the public view (US8) — `feat/001-us8-public-view`

**Goal**: the public view never goes dark (FR-057 to FR-059). **Independent test**: quickstart §10. The dashboard's panels arrived with their features, in groups 5 to 9.

### Tests first

- [x] T135 [P] [US8] Write `deploy/scripts/test_snapshot.py`:
  - the sink refuses each forbidden kind of field;
  - it writes the cloud part while no host serves;
  - a stale host part keeps its time;
  - the publisher posts only while its host serves, read from the relay's status.

  Check: RED (FR-057 to FR-059) (feat/001-us8-public-view)
- [x] T136 [P] [US8] Extend `apps/web`'s tests for `/status/`: it renders each part with its time, names `none` while no host serves, shows the handovers and their gaps, and shows the server's month beside its budget and model spend beside the ceilings. It names `none` when `latest.json` names a host but `/api/status` gives the edge's degraded answer (503, `no_host_serving`, `stack` null) or none, as while the tunnel end is gone, and shows the document's values as last-known. Check: RED (SC-013; FR-057) (feat/001-us8-public-view)

### Implementation

- [x] T137 [US8] Write `snapshot_publisher.py` and the sink's document part in `snapshot_sink.py`, and the publisher's compose service on both hosts. The sink's write uses the tunnel end's one-key grant from group 9 (T124). Check: T135 passes (feat/001-us8-public-view)
- [x] T138 [US8] Write `/status/`, taking the serving host from `/api/status` first (contracts/public-view.md §3). Check: T136 passes (FR-057, FR-059) (feat/001-us8-public-view)

### Close

- [ ] T139 Review and note. Check: as T009 (feat/001-us8-public-view)
- [ ] T140 Author: gate and merge. Check: the gate passes (feat/001-us8-public-view, then main)
  - **Combined (W1):** group 10 is W1's last group, and its `-p` copy is the one W1's gate takes (T172).
- [ ] T141 Author: on `main`, release; then, with both hosts off for an hour, check `/status/`; then start a host and check that the values are fresh within 5 minutes. Check: SC-013 (main)
  - **After W2's apply** (T178), since `/status/` is served from the distribution W2 makes. An hour outside EC2's hours, with the laptop off, is such an hour.

---

## W1: the plan blocks, the gate, and the applies

**Purpose**: groups 5 to 10 through one gate (Organization; plan.md §16, "Four gates"). **Precondition:** groups 5 to 10 are each reviewed; T166 and T167 are done; the session's next branch (`rehearsal = false`, the bootstrap's state in S3; T030 step 2, T040 step 6) is on `main` and merged into W1's last branch; the Author has answered the regrouping note's questions 1a, 2, 3, and 4, which T116, T117, T124, and T163 build on.

- [ ] T171 Author: make W1's `-p` branch, a copy of group 10's reviewed tip. In a scratch clone of it, commit W1's patches (P-I3 to P-I7, P-6 with his figures, P-G1, P-G2) and his route line (T095). Then run `make plan` for each of the three roots, with both switches off: `ROOT=bootstrap` (T160's publishers), `ROOT=account`, and `ROOT=prod`. Paste each redacted block into W1's note on the `-p` branch. Read them: prod makes EC2 with `aws_ec2_instance_state.ec2_w1` stopped, and two actions on `h4-model-month` exist, the account's and prod's. Check: as T027, for each root; each block's `tree` is the one `infra/` will have once the same patches are committed byte for byte; neither root's plan reads the other's resources (main's checkout, then W1's `-p`)
- [ ] T172 Author: commit the same patches and his route line on W1's `-p` branch, byte for byte; run `tools/gates/gate` on it from main's checkout; merge. Check: the gate passes, its `infra-plan-note` step on all three roots, and `make test`'s placeholder gate over the `ec2` route with his adopted F3 words (FR-005, FR-068) (W1's `-p`, then main)
- [ ] T173 Author: on `main`, verify, apply, and record the three roots, in order: bootstrap, then account, then prod. Each apply's record is on its `ops/apply-<root>-<date>` branch, which W2's branch carries to its gate. Then his steps, in "Dependencies" order: T058, T080, T096, T097's SC-017, T115's steps 2 to 4, and `make ec2-stop`. EC2 runs only for SC-017 and the red-team runs, started by his hand inside the hours (spec.md Assumptions, "From W1 to W2"). Check: quickstart §5 to §8's W1 parts; SC-006; SC-017; `make ec2-status` shows EC2 stopped; Budgets shows both model actions and the server action on their budgets; Cost Explorer filtered on `project` shows the new resources (T154) (main)

## W2: the switch-on and the digests

**Purpose**: what W1's applies made possible (plan.md §16, "Why a switch"). **Precondition:** T173 is done.

- [ ] T174 Author: build and push the new functions' images to the repositories W1's account apply made: `h4-ec2-start` and `h4-ec2-guard`, and the alert bridge and the credential audit if W1 changed them (T159, T164). Use the base's digest from `deploy/images.lock`, and tell the session each pushed digest. Check: each image's digest is in the registry (main)
- [ ] T175 On a branch from `main`, carrying T173's apply records:
  - the digests from T174 in `infra/account/main.tf`'s `local.lambda_images`;
  - `local.ec2_generation = 2` in `infra/prod/ec2.tf` (T097);
  - P-W2 for the Author's hand, built from plain copies: `local.wired = true` in `infra/account/handover.tf` and `infra/prod/handover.tf`;
  - with P-W2 on a patched copy, T046's, T084's, T104's, T119's, and T159's checks pass with both switches on;
  - **after group 5's review (I8):** T046's checks hold each switch to a boolean literal either way, and "off in W1" is its own W1-only test, `infra/test/test_prod_network.py::test_w1_holds_both_switches_off`, which this branch flips to `is True`, test-first, with P-W2.

  Then a review by an agent that wrote none of it, and the note. Check: RED with the switches off for the wired checks, GREEN with them on; `make check`'s and `gitleaks dir`'s whole output in the note (W2's branch)
- [ ] T176 Author: **Group 9's review A, nit 7:** at T178's first sink run in W2, check one `h4.ec2.outcomes_last_hour` series in the serving host's Prometheus: its `function` label names a function (`h4-ec2-start` or `h4-ec2-guard`), its `outcome` an outcome, and its `trigger` a trigger. Another order means CloudWatch's `SEARCH` labels differ from `Function Outcome Trigger`; then `read_outcomes` in `deploy/scripts/snapshot_sink.py` changes, test-first. **Precondition (group 8's review B, I6), met in W1:** his answer to W1's note's question B-6, "We aren't building option A, we went with Option C", built in W1 before its apply (the private interface is the tunnel end's primary), and `infra/test/test_prod_cdn.py::test_the_vpc_origin_reaches_the_interface_the_relay_publishes_on` passing without its `xfail` marker (plan.md §16, "B-6: option C, and the VPC origin from W1"). **The fallback** (the review of 59dfdc4a, I2): if W2's `/api/*` answers 503 for want of the origin's reach, a second-phase rule from `CloudFront-VPCOrigins-Service-SG`, which CloudFront makes once the origin exists, goes into the private group, behind the switch (AWS's "Restrict access with VPC origins", https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html). Then, with EC2 stopped, in a scratch clone of W2's `-p` branch with P-W2 committed, `make plan ROOT=prod`, then `ROOT=account`, after W1's applies. Paste both blocks into the note. Read them:
  - prod makes the certificate and its validation, the distribution (W1 made its VPC origin), the records, the buckets' policies, and the rules' function targets. It replaces EC2, updating the server action, EC2's model action, and the ID parameter with it, and drops `aws_ec2_instance_state.ec2_w1`, which leaves the instance as it is (to confirm);
  - the account makes the functions, their permissions, `h4-laptop-away-rule`, the schedules, and the probe's schedule and alarm, and nothing that reads prod.

  Check: as T027, for each root (W2's `-p`)
- [ ] T177 Author: commit P-W2 on W2's `-p` branch byte for byte; gate; merge. Check: the gate passes, its `infra-plan-note` step on both roots (W2's `-p`, then main)
- [ ] T178 Author: on `main`, inside the hours, read `make operator-status ENV=shared` and record it. Verify, apply, and record **prod first, then the account** (plan.md §16, "W2's order"; the review's I3), so the probe starts against a site that answers. If EventBridge refuses prod's function targets before the account's apply makes the functions, apply the account first instead, and record the probe's alarm during prod's apply as expected. Then:
  1. the certificate is issued; then a release with `SITE_BUCKET=` and `DISTRIBUTION=`, between prod's apply and the account's (group 8's review B, nit 5), and hareet.ai loads from the edge;
  2. the probe passes;
  3. T097's step after the replace: the old spot request cancelled, and exactly one instance tagged `h4-prod-ec2`, the parameter's;
  4. SC-005: the new EC2's digests match its release, and `make operator-status ENV=shared` matches the reading before the apply;
  5. set the autostart switch `on` (T132);
  6. watch one open and one close of the hours.

  Check: quickstart §8 and §9's W2 parts; SC-005; the apply records are on `ops/apply-*` branches, which Close's branch carries (main)

---

## Group 11: the close (Polish) — `feat/001-close`

- [ ] T142 [P] Write the success-criteria table in spec.md's merge-request note, with each SC, its run, and its record. Complete the runbooks: every alert of this spec names one (FR-056). Check: the docs-links check passes (feat/001-close)
- [ ] T143 [P] Link the README to the ADRs, the public view, and the disclosure. Check: SC-014, two clicks from the README (feat/001-close)
- [ ] T144 [P] Bring the matrix to zero planned rows. Check: `make check`'s matrix summary shows zero failures and zero planned rows (feat/001-close)
- [ ] T145 Review and the final note. Check: as T009 (feat/001-close)
- [ ] T146 Author: gate and merge. Check: the gate passes (feat/001-close, then main)
  - **Close, the fourth gate:** its branch carries W2's apply records and the records of T133, T134, and T141, so one merge takes group 11 and the records. Whether it also waits for T147's month is the regrouping note's question 7.
- [ ] T147 Author: after the first full month, read AWS's cost data and the meter. Check: SC-002, the server's cost against his figure; SC-003, model spend against the ceilings, with Bedrock's and the Anthropic account's usage each at or under the meter; SC-016, from `handover_events` and EC2's state history (main)
- [ ] T148 Author: the credential audit's weekly results, and every infrastructure change's block and record. Check: SC-004, SC-012. Spec 001 is done when SC-001 to SC-018 pass (but SC-015, moved) and the matrix shows zero failures and zero planned rows (main)
- [ ] T149 Author: apply P-4, his own words for intent 000's cost and hosting constraints and this folder's intent's cost lines, whenever he chooses (spec Assumptions, "The intents' lines"). Check: the intents read as he wrote them (main)

---

## After gate A: the shared account — `fix/001-shared-account`

The Author's answers of 2026-11-11, "Share it, scope the checks" and "Allow it too", and of 2026-11-12, "Keep them out of the repo" (spec.md Assumptions, "One account, shared with the Author's other work"; ADR 0047).

- [x] T150 Tests first. Each fails on main:
  - the credential audit's allowlist (`infra/lambdas/credential_audit/test_audit.py`): allowed findings listed apart, each kind apart, four kinds only and never this project's names, a refused line a finding; the terminal's file under the Author's home; the function's parameter;
  - the account (`infra/test/test_account.py`): the audit's role reads that one parameter, and its environment names it; `h4-rehearsal-server` on the project's filter;
  - `h4-server-month`'s two `and` terms (`infra/test/test_bootstrap.py`).
- [x] T151 The audit reads the Author's allowlist: his file in the terminal, his SecureString in the function. `lambdas.tf` names it, and `infra/parameters.txt` lists it.
- [x] T152 P-S1, `docs/merge-requests/2026-11-12-fix-001-ps1-shared-account.patch`, for the Author's hand, built from plain copies:
  - `budgets.tf`'s and `killswitch.tf`'s budgets on the project tag;
  - `iam.tf`'s read of the parameter.
- [x] T153 Author:
  - writes `~/.config/h4reet-ai/infra/iam-allow.txt` (mode 0600);
  - applies P-S1 on `fix/001-shared-account-p`;
  - plans the bootstrap again, with its block in the branch's note;
  - runs the gate, merges;
  - runs T030's apply.

  Once the project tag is active, Cost Explorer filtered on it shows the project's costs, and `h4-server-month`'s actual matches. At T040, his SecureString `/h4reet/audit/IAM_ALLOW` holds the same lines, before the function's first run.
  - **Done 2026-11-12:** the bootstrap's apply names this branch's block, from `main` at 0ada646b, and its verify passed the audit with his file (`docs/infra/applies/2026-11-12-bootstrap.md`). Two checks stay open with T030's steps 3 and 4: Cost Explorer on the active tag, and the SecureString at T040 step 3.
- [ ] T154 Group 7: EC2's volumes and its public address carry the `project` tag, and the server budget counts them. FR-021 says "EC2's while stopped included", which a tag-scoped budget sees only if the volumes are tagged. Check it in Cost Explorer after group 7's first apply.
  - **W1:** the volumes' tags are in T084's test, since `default_tags` don't reach an instance's root volume by themselves. An address AWS assigns at each start (research.md R-04) is no resource of the root, and can't carry a tag, so its charge may fall outside the budget's filter. The regrouping note's question 5 asks how to treat it. Checked in Cost Explorer after T173.

- [x] T155 The budget actions tagged: the Author's T037 plan (2026-11-12) found `aws_budgets_budget_action.model`'s `tags_all` without `component` (rule T2 on the saved plan).
  - **RED:** `infra/test/test_account.py`'s tag check now covers `aws_budgets_budget_action`, which the policy's source list lacks, with the fixture `action-untagged`.
  - **GREEN:** P-A1 tags the three actions.
  - **Split on 2026-11-12:** the Author's half is T156; the policy's own list is T158 (P-G1); and the same check over two more types is T157.
- [x] T156 Author: P-A1 on `fix/001-action-tags-p`, T037's account block in that branch's note, one gate for that and the bootstrap's apply record, and the merge. Check: `make infra-verify ROOT=account` passes on `main` (main)
  - **Done 2026-11-12:** the account's apply ran from `main` at d0a34d44, and names the block in `docs/merge-requests/2026-11-12-fix-001-action-tags.md` (`docs/infra/applies/2026-11-12-account.md`); `infra/account/killswitch.tf` on `main` tags each action.

## Dependencies and execution order

- **T000** first, then **T001**, the constitution, as the default order he confirms at T000. Then the four gates in order: gate A (done), W1, W2, and Close (Organization).
- **T001's check** is a precondition of groups 3 to 9. T020, group 3's first test task, writes the first file under `infra/`.
- **Within a group** (plan §16): the tests, which fail; the code, each feature with its span, panel, runbook, and disclosure row; the review and the note. In W1 the next group's branch starts from this one's reviewed tip, and the plan blocks, patches, gate, merge, and applies come once, for all six (T171 to T173).
- **Inside group 5,** gate A's backlog (T157 to T161) comes first. **Inside group 6,** T162 (the documents) comes before its tests, and T069 (the placeholder gate) lands before T070 (schema 2). **Inside group 8,** T105 (P-6's draft) comes before T106 (the relay), and T166 (the tunnel end's measurement) after T106. **Inside group 9,** T169 follows the Author's answers to questions 1a, 2, and 3, and T116 and T117's hours cases follow T169.
- **The Author's answers each task waits for** (the regrouping note): questions 1a, 2, and 3 before T116 and T117's hours cases; question 1b before T170; question 4 before T163's backup cases; question 5 before T154's check closes; question 6 before T115's step 2; question 7 before T146. Questions 8 (T180), 9 (T084, T089, T096), and 10 (T097, T117) are taken on their recommended options, which the tasks build; a different answer changes those tasks before they start.
- **W1's steps on `main`, in order** (T173): the three applies, bootstrap, then account, then prod; then T058's tunnel keys and the parameters; T080's TLS, role passwords, `make secrets-check`, the tunnel end's release, and `make shared-state-roles`; T058's laptop prod on the tunnel, the scans, and the revocation; T080's move; T096's EC2 secrets, the Anthropic limit, and the release; T097's SC-017 with T115's red-team runs; `make ec2-stop`; and T115's name servers.
- **W2** follows T173: T174 (his push), T175 (the digests, the generation, and P-W2), T176, T177, and T178, whose applies run prod first, then the account. Then T133, T134, and T141, and Close. T179 follows T167.
- **Cross-group dependencies:**
  - group 5 needs group 4's alert path for the tunnel end's warning;
  - group 6 needs group 5's tunnel for the laptop's connection to the store, and `feat/010-anthropic-switch` on `main`;
  - group 7's server action and model-action target need EC2's role, and its first release needs group 6's store;
  - group 8's relay needs groups 5 to 7;
  - group 9's loop reads the relay's public status, and its sink reads export through group 5's collector;
  - group 10's document needs group 9's cloud reads and write grant, and the relay and the shared state.
  - from W1, nothing in one root reads another root's resources that the same gate's applies make (plan §16, "Why a switch"); a cross-root reference is a fixed name.
- **What can run in parallel:** inside a group, the [P] tasks. Across groups, nothing, since each group's branch builds on the last, as the Author chose: "Might as well do it in our original order".

## The Author's tasks, in one list

| Task | What |
|---|---|
| T000 | approve the spec and the plan; confirm or overturn plan Q5 to Q7 and question 16; answer plan Q8; confirm T001's order |
| T001 | apply the constitution 1.1.0 as amended, with his Q8 wording if A; accept ADR 0044 |
| T008, T010, T011 | choose the Terraform pins (the agent writes them, with `make infra-mirror` and `make aws-login`); apply P-1 and P-3, gate, merge; seed the mirror |
| T017, T019 | price the lines; set the server budget's figure; gate, merge |
| T027, T029, T030 | the bootstrap's plan block; P-I1, gate, merge; apply: state, budgets, alerts; migrate the state; the tags; the email subscription |
| T037, T039, T040 | the safety net's plan block; P-I2, gate, merge; apply and import; the laptop's Bedrock profile; the Telegram parameters; the rehearsals, with the rehearsal instance started first |
| T153, T156 | the shared account's and the action tags' gates and applies (done) |
| T167 | price W1's new lines; confirm the server budget's figure |
| T171, T172, T173 (W1) | the plan blocks of bootstrap, account, and prod, with P-I3 to P-I7, P-6 with his figures, P-G1, and his route line; the gate and merge; the three applies |
| T058 | the tunnel keys; the scans; the revocation |
| T080 | the shared state's TLS and role passwords; the tunnel end's release; the roles; move the meter |
| T095 to T097 | EC2's route line (in T172); the secrets; the Anthropic account's limit; the first release; SC-017; `make ec2-stop` |
| T114, T115 | P-6's figures (in T172); the name servers; the red-team runs |
| T174, T176, T177, T178 (W2) | push the functions' images; the account's and prod's blocks with P-W2; the gate and merge; the applies; SC-005; the autostart switch `on` |
| T132 to T134, T141 | the rehearsals; the resting words; the first public release; the public view's hour |
| T146 to T149 (Close) | gate, merge; the month's measurements; the audit; the intents' words |
