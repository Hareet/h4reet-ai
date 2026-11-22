# Tasks: Langfuse Dashboards

Approved provisionally by the Author's direction of 2026-11-22: "Let's create Langfuse dashboards that we can use"

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md). Tests first: the RED task's tests are run and their failure pasted before the GREEN tasks.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: RED

- [ ] T001 [US1] [US2] [US3] `scripts/test_langfuse_dashboards.py`: the stand-in Langfuse (plan Proof) and the tests of FR-001 to FR-014: the files load and validate, with the ceilings from `config/budgets.yaml` and the Grafana panel titles from `h4-runtime.json` (FR-013, FR-014); the validator's refusals (FR-002); the bodies and the mark (FR-006); the metrics queries (plan D3.2); the API description's reader, YAML and JSON (D3.1); the plan's create, update, keep, delete, and the unmarked object left alone (FR-004 to FR-006); the env file's three keys, no value echoed (FR-003, FR-008); 429, the 404 lag, no answer (FR-007, FR-009); the read-only run, the apply, the second apply (SC-001); a missing operation, a missing field, a refused query (SC-002); no key in any output (SC-003); the recipe (FR-010); the address (FR-012); the make target (FR-011).
- [ ] T002 [P] `evals/test_runbooks.py`: admits the page plan D8's "Runbooks" line names, as for specs 010 and 017 (FR-015).
- [ ] T003 Run T001 and T002, paste the failures.

## Phase 2: GREEN

- [ ] T004 [US1] D1: `deploy/langfuse/dashboards/model-calls.json` and `traces.json`.
- [ ] T005 [US2] [US3] D2 to D6: `scripts/langfuse_dashboards.py`. T001 passes but the target's test.
- [ ] T006 D7: the Makefile's `langfuse-dashboards` and `APPLY`. T001's target test and `scripts/test_makefile.py` pass.
- [ ] T007 [P] D8: `docs/runbooks/langfuse-dashboards.md` and the index's row. T002 and `evals/test_runbooks.py` pass.
- [ ] T008 [P] D8: ADR 0058 and the ADR index's row; the disclosure's row S9 (FR-016).

## Phase 3: Verify and hand over

- [ ] T009 `make -f Makefile lint`; T001's tests; `scripts/test_makefile.py`; `evals/test_runbooks.py`, `evals/test_docs_links.py`, `evals/test_disclosure.py`; `--recipe` run once; pasted.
- [ ] T010 `docs/merge-requests/2026-11-22-feat-034-langfuse-dashboards.md`, with the Author's steps (SC-004).

## Dependencies

T001 and T002 before T003; T003 before T004 to T008; T004 and T005 before T006's run of T001; T009 after all; T010 last.

## Analysis (`/speckit-analyze`, 2026-11-22, after these tasks and before code)

Non-destructive: spec.md, plan.md, research.md, and this file read against each other and the constitution. (Kept here rather than in a file of its own, as spec 033 does.)

| ID | Category | Severity | Where | Finding | Resolution |
|---|---|---|---|---|---|
| A-1 | Underspecification | High | spec Assumptions; plan D3, D4; research R-2 | The REST bodies, the update method, pagination, a placement's ID rule, and `defaultSort`'s fields were not in any source the session could read, and no Langfuse was reachable | Accepted as the feature's main risk: D3's API check (operations and field names, from the instance's own description) and its read-only metrics checks run before any write; the update method is picked from the description; a refused write names Langfuse's reason; runs are idempotent; SC-004 is the Author's run against 4.54.0, and the note lists what to paste back if it fails |
| A-2 | Coverage | Medium | spec SC-004 | No test can run against the real Langfuse here | The note's steps; the stand-in implements research R-2's reading, so a difference shows as D3's message |
| A-3 | Consistency | Low | spec FR-013; plan D1 | FR-013 lists widgets by name; D1 fixes their measures and places | Consistent; T001 holds the files to D1's list |
| A-4 | Constitution | none | spec FR-013; plan D1 | Principle V's "every dashboard shows spend next to latency and errors" | Each dashboard has spend, latency, and failed calls; T001 checks each dashboard has a `totalCost`, a `latency`, and a `level` `ERROR` widget |
| A-5 | Ambiguity | Low | spec Q3; FR-013 "endpoint" | "Endpoint" is the trace's name, which assumes Langfuse names a trace after its root span | research R-6 and spec Assumptions; the Author's look (SC-004) confirms the names he sees |
| A-6 | Coverage | Low | spec FR-016 | S9's words have no test | Prose the reviewer reads; `evals/test_disclosure.py` still runs |
| A-7 | Security | none | plan D2, D7 | The command reads secrets from the env file | Only the two keys and the port, never printed (FR-008, T001); the sandbox can't read the env file; the target refuses in the sandbox; no new deny is needed (plan's Constitution Check) |

Coverage: FR-001, FR-002 by T001 and T004/T005; FR-003 to FR-010 and FR-012 by T001 and T005; FR-011 by T001 and T006; FR-013, FR-014 by T001 and T004; FR-015 by T002 and T007; FR-016 by T008. SC-001 to SC-003 by T001; SC-004 by T010's steps. Every FR has a task, every task an FR or a verification step. 16 requirements, 4 success criteria, 10 tasks; one high finding (A-1), accepted with its mitigation as the design itself; no needs-clarification marker.
