# Tasks: Spot with Interchangeable Instance Types

Approved provisionally by the Author's direction of 2026-11-22: "Go with your recommendations. Let's have you build it out in this session"

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md). Test-first: each RED task commits failing tests with their output pasted in the commit message; its GREEN task makes them pass. Protected files change only through the two patches (T020, T021); the infra tests read the tree as the patches leave it (`infra/test/patches.py`).

Format: `[ID] [P?] [Story] Description` · FR it serves.

## Phase 1: Setup

- [x] T001 Commit the accepted intent (`specs/032-spot-flexibility/intent.md`).
- [x] T002 spec.md with Clarifications; research.md; plan.md; this file; the analysis in plan.md.

## Phase 2: The start function (US1, US2, US4) — FR-005 to FR-014, FR-018

- [x] T010 [US1] RED: `infra/lambdas/ec2_start/test_start.py`: the replace on a capacity code (FR-005), on a capacity stop and a missing or earlier-generation instance (FR-006), the order and skip (FR-007), `no_capacity` (FR-008), the lock and `busy` (FR-011), the cancel before the terminate (FR-012), `type`/`replaced`/`tried` facts and the new outcomes (FR-018); the two tests that held "one attempt, start_failed" on `InsufficientInstanceCapacity` become the replace's.
- [x] T011 [US2] RED, same file: `tunnel_end_check` (FR-013: none, running, by user, young, old capacity stop), the re-point and `tunnel_end_replaced` and EC2's start after it (FR-014), the hand replace with `skip` (FR-009).
- [x] T012 [US1][US2] GREEN: `infra/lambdas/ec2_start/start.py`.
- [x] T013 [P] [US1] The guard: `infra/lambdas/ec2_guard/test_guard.py`, a replaced instance the parameter names isn't stopped and the old one isn't listed (characterization; the guard's code doesn't change).
- [x] T014 [P] [US3] Spec 001's `contracts/aws-alerts.md` §2: the new facts and codes on the existing kinds (the bridge, protected as `infra/*alert*`, doesn't change; its contract test still passes). As built: this replaces the first draft's new kinds.
- [x] T015 [P] [US4] RED then GREEN: `scripts/infra/ec2_ops.py` and its test: `start --replace ec2|tunnel_end [--skip TYPE ...]`; the Makefile's `ec2-start` passes `REPLACE=` and `SKIP=`.

## Phase 3: Infra (US1, US2) — FR-001 to FR-004, FR-010, FR-015 to FR-017

- [x] T016 RED: the infra suites (`infra/test/test_prod_ec2.py`, `test_prod_network.py`, `test_prod_cdn.py`, `test_handover.py`, `test_prod_shared_state.py`, `test_account.py`) and `deploy/hosts/test_hosts.py` to the new model: lists and ceilings (FR-001, FR-002), templates (FR-003, FR-004), removed instances and attachments, data sources, the ID parameter, the rules, the server action, the VPC origin (FR-015), the start role's grants (FR-016), the timeout and the schedule (FR-013).
- [x] T017 GREEN, unprotected: `infra/prod/ec2.tf`, `tunnel-end.tf`, `shared-state.tf`, `edge.tf`, `ssm.tf`; `infra/parameters.txt`.
- [x] T020 GREEN, protected, patch `docs/merge-requests/human-patches/2026-11-22-032-prod.patch`: `infra/prod/ec2-market.tf`, `handover.tf`, `killswitch.tf`; verified on exports of main and of the branch's tip.
- [x] T021 GREEN, protected, patch `docs/merge-requests/human-patches/2026-11-22-032-account.patch`: `infra/account/iam.tf`, `handover.tf`; verified the same way.
- [x] T022 `infra/test/patches.py`'s `PATCHES` names T020's and T021's patches.
- [x] T023 [P] RED then GREEN: `infra/lambdas/credential_audit/` (FR-016; research R-10).
- [x] T024 The offline checks on an export with both patches applied: `make -f Makefile plan`.

## Phase 4: Observability (US3) — FR-018

- [x] T030 RED then GREEN: `deploy/scripts/snapshot_sink.py` writes `h4.host.type` for both hosts; its test.
- [x] T031 `deploy/grafana/dashboards/h4-runtime.json`: "Host types" beside EC2's state; the dashboard tests.

## Phase 5: Docs — FR-019, FR-020

- [x] T040 [P] `docs/adr/0057-spot-with-interchangeable-types.md` and its row in `docs/adr/README.md`.
- [x] T041 [P] Runbooks: `docs/runbooks/handover.md` (`no_capacity`, `busy`, the type facts, the re-point at the next plan), `ec2.md` (a replace, a generation's roll, the hand replace), `tunnel-end.md` (`tunnel_end_replaced`, `tunnel_end_replace_failed`, the VPC origin's fallback, an OS update by hand replace).
- [x] T042 [P] Spec 001's `contracts/handover.md` §3: step 6 amended by spec 032.
- [x] T043 The merge-request note, `docs/merge-requests/2026-11-22-feat-032-spot-flexibility.md`, with "For the Author" (plan.md §6) and the CloudTrail step for Q5 (FR-019).

## Phase 6: Verify

- [x] T050 `make -f Makefile lint`; the suites touched; `make -f Makefile check ENGINE_MODE=none-yet` in the background; outputs in the note.

## Phase 7: Rework after the reviews of 52308132

- [x] T060 RED then GREEN: `start.py`'s repairs (adopt, attach before every start, the tunnel end's repair), the dry runs and the hand dry run, the waits bounded by Lambda's time, generations for a stopped EC2, `Unsupported` refused; the fake corrected.
- [x] T061 RED then GREEN: the guard's `not_ec2` and `budget_check`.
- [x] T062 RED then GREEN: the audit's `run_holds`; the account patch's RunInstances conditions; `local.tunnel_end_check_state`; `h4-ec2-budget-check`; the prod patch's `h4-ec2-running` with no instance; the infra suites.
- [x] T063 RED then GREEN: `ec2_ops.py status` types; `start --dry-run`; the Makefile's `DRY_RUN`.
- [x] T064 The spec, plan, ADR 0057, runbooks, contracts, and the note.

## Dependencies

T010, T011 → T012. T016 → T017, T020, T021, T022. T020, T021 → T024. T012 → T014 (kinds used). All → T043 → T050.

## FR coverage

| FR | Tasks |
|---|---|
| FR-001, FR-002 | T016, T017 |
| FR-003, FR-004 | T016, T020 |
| FR-005 to FR-012 | T010, T011, T012, T013 |
| FR-013 | T011, T012, T016, T021 |
| FR-014 | T011, T012, T017 |
| FR-015 | T016, T017, T020 |
| FR-016 | T016, T021, T023 |
| FR-017 | T010 (checks unchanged), T016 |
| FR-018 | T010, T014, T030, T031 |
| FR-019 | T043 |
| FR-020 | T040, T041, T042 |
