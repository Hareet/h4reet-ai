# Analysis: spec 025 (non-destructive, 2026-11-13)

Cross-artifact check of `spec.md`, `plan.md`, `tasks.md`, the draft intent, and the constitution.

## Coverage

| Requirement | Plan | Task | Small test |
|---|---|---|---|
| FR-001 to FR-003 | R-01, §4 | T005, T006 | chase-director |
| FR-004 to FR-008 | R-02, R-03 | T001, T002 | chase-steer |
| FR-009 | R-01, §3 | T005, T006 | chase-director |
| FR-010, FR-011 | R-04 | T003, T004 | twin-states, chase-states |
| FR-012 | untouched visitor path | T004 (twin-2d, twin-handoff rerun) | chase-states |
| FR-013 to FR-015 | R-05 | T007, T008 | chase-degraded |
| FR-016 | R-07 | T009 | chase-notes |
| FR-017 | no network by design | T011 (data-only) | data-only |
| FR-018 | R-08 | T005, T013 | chase-director |
| FR-019 | R-01 | T013 | chase-bench |
| SC-007 | — | T015 | the Author's look |

Every FR has a task and a small test; every task names its tests (rule 4). Only T013 runs the full `make check`.

## Findings

- **F1 (medium) The assumed interfaces are unverified.** Specs 019 to 021 weren't on this branch. Mitigated: spec §Assumed Interfaces, one adapter file (R-06), a fakes-first test (T010), and T012 to reconcile; T012 stops with a recorded gap if one isn't on the line.
- **F2 (medium) Collision with 019 to 021 on `twin-states.ts`, `figure.ts`, `avatars.ts`.** The plan's §5 lists the order of merge (019, 020, 021, 025) and keeps this spec's edits small; the walk/run roles are added here only if 019 hasn't.
- **F3 (low) FR-007 depends on spec 021's dinosaur not entering a figure's footprint.** This spec doesn't move the dinosaur. Stated in FR-007; the property test has the case where A021 is broken (reported, not hidden).
- **F4 (low) The scene data file's location.** Plan §5 says it's found at implementation and may be a human-only path; §7 and T011 provide the patch route and the human-patches note says so.
- **F5 (low) Speeds and distances are placeholders.** Data, the Author's at lookdev (spec Assumptions; T015).
- **F6 (info) `twin-2d.test.ts` is a known flaky test under load**; T004 says to rerun it alone.
- No contradictions found between spec, plan, and tasks. No constitution violation: no control deferred; no deviation to name. No new data flow. The intent holds only the Author's words and the spec's reading beside them, marked as such.

## Open items for the Author

Six questions, each with its recommended answer, in `/night/io/out/questions.md`, taken provisionally. Nothing human-only is changed.
