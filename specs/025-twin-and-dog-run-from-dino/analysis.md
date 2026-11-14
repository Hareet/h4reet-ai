# Analysis: spec 025 (non-destructive; re-run 2026-11-14 after the rework)

Cross-artifact check of `spec.md`, `plan.md`, `tasks.md`, the draft intent, and the constitution, after the rework for rv-spec-025 (B1 to B3, I1 to I4, N1 to N5). `/speckit-analyze` is read-only: this report was written first, at the rework's tasks commit, and the fixes it lists under "Applied after the report" were made in the next commit, under the Author's order's rule 1, as on specs 020 and 021.

## Specification Analysis Report

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| D1 | Constitution | CRITICAL (named deviation; the Author's) | spec Assumptions, Q10; plan Constitution Check, R-08 | Principle II's "telemetry that makes it observable in production" and Workflow 7's "A feature without a graph is not done" are not met for the run: no usage event, no panel. Named as a deviation because an event sent only when the run happens tells the stack the visitor chose the dinosaur, which row V4 says the usage events never carry ("avatar"). | Keep the deviation named; the Author decides on the page (Q10). It doesn't block implementation under his order's rule 1; it blocks the merge until he answers. On option B, the event, V4's amendment in his words, and a use panel come with it. |
| I1 | Inconsistency (cross-spec) | HIGH | spec Q10; spec 024 (the page's Q108) | Spec 024's Q108 takes a usage event for the eating, which, like this one, is sent only when the visitor is the dinosaur; the same V4 conflict applies there, and the two specs answer it differently. | A question on the page (questions.md) so one answer covers both; not this spec's to edit. |
| U1 | Coverage | MEDIUM | spec FR-027; tasks | FR-027's "no network request, no model call, no usage event" had no test. | Applied: T014 asserts, with a fetch and event-sink spy, that a whole run sends nothing. |
| U2 | Underspecification | MEDIUM | spec FR-021; plan R-10 | How the loading screen (spec 012) counts the room's dog's files wasn't said; a slow dog file could hold the loader. | Applied: FR-021 and R-10: the dog's entries are figure entries the loading screen counts as the other figures' (spec 012, its ceiling included); T011 runs `test/ui/loading-notes.test.ts` and `test/room/loading-progress.test.ts`. |
| U3 | Underspecification | MEDIUM | spec FR-024, Edge Cases | Reduced motion switched on, or the room paused, mid-run: FR-024's "holds at home" can't hold for a figure already away. | Applied: an edge case and FR-024: under reduced motion a figure away from home is put back at once (a cut, as reduced motion cuts clips); while paused, figures stay where they are and walk back after the resume; T007 tests both. |
| A1 | Ambiguity | LOW | plan R-02 | The wall penalty's constant k isn't data. | A named constant in `chase-steer.ts`, tuned in T002 with the defaults; recorded in plan §3 if it changes. No edit now. |
| A2 | Ambiguity | LOW | spec FR-018, plan §3 | The dog's home is an estimate chosen at T011. | Stated as such, marked `# estimated` in `scene.yaml`, his at lookdev (SC-008). No edit. |
| F1 | Inconsistency | LOW | spec Interfaces on the Line | Spec 021's code isn't on the line (no `impl-021` branch). | Stated in the spec; the tests use a fixture dinosaur model; the Author's look waits for the model. No edit. |

## Coverage Summary

| Requirement | Plan | Task | Small test |
|---|---|---|---|
| FR-001 to FR-003 | R-01, R-06 | T005, T006 | chase-director |
| FR-004 to FR-009 | R-02, R-03 | T001, T002 | chase-steer |
| FR-010 | R-06 | T005, T006, T014 | chase-director, chase-figures |
| FR-011 | R-04, R-09 | T003, T004, T013 | twin-states, chase-states, chase-schema |
| FR-012 | R-04 | T005 | chase-director |
| FR-013 | R-05 | T014 | chase-figures (gait, gait-rig unchanged) |
| FR-014 | R-05 | T007, T008 | chase-degraded |
| FR-015 | R-04 | T003, T004 | chase-states |
| FR-016, FR-017 | R-06 | T014 | chase-figures |
| FR-018 to FR-021 | R-10 | T010, T011 | dog-figure, likeness-line-anywhere |
| FR-022 | R-11 | T012 | dog-first-visit |
| FR-023, FR-024 | R-05, R-06 | T007, T008 | chase-degraded |
| FR-025 | R-07 | T009 | chase-notes |
| FR-026 | R-12 | T015 | test_dashboard.py |
| FR-027 | R-08 | T014 (U1) | chase-figures |
| FR-028 | R-12 | T015 | disclosure tests |
| FR-029 | R-01 | T016 | chase-bench |
| SC-001 to SC-007 | as their FRs | T001 to T016 | as above |
| SC-008 | — | T018 | the Author's look |

Unmapped tasks: none (T017 and T018 are the review and the Author's).

## Checks against the review

- **B1**: no `DinoPresence`, no A021; FR-001 starts the run from the visitor's figure as the dinosaur in the walking view; FR-005 and FR-007 use `walking.speed_mps` and a property test with no footprint assumption; Q1 and Q4 rewritten; R-06 reads the visitor's pose; §Interplay with Spec 024.
- **B2**: FR-018 to FR-022; `FigureId` and `wants` (FR-019); the line through `likeness-line.ts` via `app.ts` (FR-020) with `likeness-line-anywhere.test.ts` (T010); `run` from `CLIP_ROLES` (FR-010); row VIII; RK5 and phase 3's 25,000,000 (FR-022); every file in plan §5 and the tasks.
- **B3**: FR-013, FR-014; `TWIN_CLIP_ROLES` unchanged (FR-011, R-04, T004); `scene/gait.ts` named; FR-009's sentence blocking the twin gone.
- **I1** quotes; **I2** Q10 (the deviation, with the event as option B); **I3** Q8, FR-010; **I4** plan §5 by file, §7 without the patch case; **N1** item i is spec 024 (Q2); **N2** the intent's author line; **N3** T004's and T009's covering tests; **N4** FR-024, FR-025, US2 scenario 4, US3 scenario 2; **N5** Key Entities.

## Metrics

- Functional requirements: 29; success criteria: 8 (7 buildable).
- Tasks: 18 (16 for workers).
- Coverage: 100% of FRs and buildable SCs have a task and a small test.
- Ambiguities: 2 (low); duplications: 0; critical: 1, a named deviation for the Author (D1).

## Next actions

- D1 and I1 go to the morning page (questions.md). Implementation may proceed under the order; the merge waits for his answer to Q10.
- U1 to U3 applied in the commit after this report (below).

## Applied after the report

- U1: tasks.md T014 adds the fetch and event-sink spy.
- U2: spec FR-021 and plan R-10 name the loading screen's count; T011's small tests add `test/ui/loading-notes.test.ts` and `test/room/loading-progress.test.ts` (the latter already listed).
- U3: spec FR-024 and an edge case; T007 adds both cases.
