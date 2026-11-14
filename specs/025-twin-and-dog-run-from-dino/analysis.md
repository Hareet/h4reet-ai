# Analysis: spec 025 (non-destructive; re-run 2026-11-14 after the second rework)

Cross-artifact check of `spec.md`, `plan.md`, `tasks.md`, the draft intent, and the constitution, after the second rework for rv-rework-spec-025 (BLOCKING-1, the page's Q139; IMPORTANT-1; N-1 to N-5). `/speckit-analyze` is read-only. This report was written first, at the rework's intent commit (0c806c36). The fixes listed under "Applied after the report" went into the next commit, under the Author's order's rule 1, as in the first rework.

`.specify/extensions.yml` registers an optional `speckit.git.commit` hook before and after the analysis. Each is optional, so neither ran. The tree was clean at the save point before this report, and the report is committed on its own.

## Specification Analysis Report

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| D1 | Constitution | CRITICAL (named deviation; the Author's) | spec Assumptions, Q10, Q13; plan Constitution Check, R-08 | Principle II's "telemetry that makes it observable in production" and Workflow 7's "A feature without a graph is not done" are not met for the run: no usage event, no panel. It is named as a deviation because an event would carry the avatar, which row V4 says it never does. | Unchanged from the first analysis. The Author decides on the page (Q10). Q13 now adds the governance's ADR "if permanent", matching spec 024's Q-R2c. It doesn't block implementation under rule 1; it blocks the merge until he answers. |
| I2 | Inconsistency | MEDIUM | spec FR-004 ("so a corner is escaped and not entered"); spec Q12, Edge Cases; plan §3.1 | After Q12, the figures' refuge is the twin's corner, a dead end the dinosaur can't enter (FR-017 keeps the twin's obstacle on its floor). FR-004 reads as if every corner is to be avoided. | FR-004: a corner the dinosaur can enter is escaped, not entered; one it can't enter, such as the twin's corner, is a refuge. |
| I3 | Inconsistency | MEDIUM | spec FR-007 (a), FR-008; plan R-02 | The dog yields to the twin "along the perpendicular" (FR-008). That step can bring it closer to the dinosaur, which clause (a) forbids and clause (b) may. The precedence isn't stated. | FR-008 and R-02: the separation yields only among the headings FR-007 allows; FR-007's clauses outrank the separation. |
| A3 | Ambiguity | MEDIUM | plan R-02 (wall penalty "below 2 × `safe_m` of clearance") | At `safe_m` 0.4 the threshold is 0.8 m of clearance. That is more than anywhere on a strip 0.275 m deep, so the penalty is everywhere and stops being a wall term. | R-02: the penalty applies below a named constant, `WALL_M` in `chase-steer.ts`, which T002 tunes (start 0.1 m) and records in plan §3. |
| C1 | Coverage | MEDIUM | spec FR-018, US5 AS1 ("at the dog's height"); tasks T010 | N-3 put the dog's scaling in `instanceFor` by its `target`, but T010's test doesn't check the height. | T010: the dog's instance stands `AVATAR_SHAPES.dog.height` tall, through `instanceFor`, as the visitor's dog does. |
| A4 | Ambiguity | LOW | plan §3.1 | The room's numbers are the spec-writer's hand computation (the bicycle's turn especially). | Stated so. T001 prints the composed floors and T002 records them. No edit. |
| A5 | Ambiguity | LOW | plan R-02 ("with none, it takes the one that loses least") | The fallback the plan keeps is a case FR-007's clause (a) forbids. | The property test fails if it happens from any start it runs, which is the point. No edit. |
| A6 | Ambiguity | LOW | plan §3 (the dog's home `[0.36, 0.55]`) | The home is inside the twin's frame box, at the twin's side, so the two pictures may overlap. | His look (SC-008, Q12). No edit. |
| A1, A2, F1 | (carried) | LOW | as in the first analysis | The wall constant (now A3), the dog's home an estimate, and spec 021's code not on the line. | As before. |

Resolved since the first analysis:
- **I1 (cross-spec HIGH)**: spec 024's second rework took no usage event (its page Q117, over Q108). The two specs now answer row V4's conflict alike, and Q13 matches its Q-R2c.
- **U1 to U3**: applied in the first rework, unchanged.

## Coverage Summary

| Requirement | Plan | Task | Small test |
|---|---|---|---|
| FR-001 to FR-003 | R-01, R-06 | T005, T006 | chase-director |
| FR-004 to FR-009 (FR-007's two clauses, FR-009's facing) | R-02, R-03, §3.1 | T001, T002 | chase-steer |
| FR-010 | R-06 | T005, T006, T014 | chase-director, chase-figures |
| FR-011 (RI8 refuses `fleeing`; the emitted map) | R-04, §5 | T003, T004 | twin-states, chase-states, bundle, schema |
| FR-012 | R-04 | T005 | chase-director |
| FR-013 (the twin's height in metres) | R-05 | T014 | chase-figures (gait, gait-rig unchanged) |
| FR-014 | R-05 | T007, T008 | chase-degraded |
| FR-015 | R-04 | T003, T004 | chase-states |
| FR-016, FR-017 | R-06 | T014 | chase-figures |
| FR-018 to FR-021 (`instanceFor`, `wanting()`, lookdev) | R-10 | T010, T011 | dog-figure, likeness-line-anywhere, lookdev page |
| FR-022 | R-11 | T012 | dog-first-visit |
| FR-023, FR-024 | R-05, R-06 | T007, T008 | chase-degraded |
| FR-025 | R-07 | T009 | chase-notes |
| FR-026 | R-12 | T015 | test_dashboard.py |
| FR-027 | R-08 | T014 | chase-figures |
| FR-028 | R-12 | T015 | disclosure tests |
| FR-029 | R-01 | T016 | chase-bench |
| SC-001 (both clauses; the homes) | R-02, R-09 | T001, T002, T013 | chase-steer, chase-schema |
| SC-002 to SC-007 | as their FRs | T001 to T016 | as above |
| SC-008 | — | T018 | the Author's look (Q12) |

Unmapped tasks: none (T017 and T018 are the review and the Author's).

## Checks against rv-rework-spec-025

- **BLOCKING-1 (Q139, taken as recommended, provisional)**:
  - FR-007, SC-001, Q2's reading, and US1 scenario 1 are in two clauses, as are Q11 and the edge cases. Clause (a) also covers the dinosaur's jump to `floor.start` when the walking view is left or entered (`walking.ts:187`, `:270`).
  - FR-009 bounds the facing, not the step, so clause (a) can hold from a figure's first frame.
  - T001 starts the pursuer at `floor.start` and at seeded starts, with seeded jumps, and checks both clauses each frame.
  - R-09 and T013 check each home against `floor.start` and `safe_m`, and say why it is a test, not a build rule.
  - Plan §3.1 records the numbers, and the dog's home follows.
  - In recording them, the room's floor turned out too small for any `safe_m` near 1.5 m, so the defaults are fitted to it, and Q12 goes to the page.
- **IMPORTANT-1**:
  - RI8 in `ri.ts` refuses `fleeing` (FR-011, R-04, §5, T004). `schema.ts` doesn't change the clips map.
  - `emit.ts` and `reach.ts` are named as read, not changed.
  - T003 adds `bundle.test.ts`'s `fleeing: "idle"` at `:1403` and an RI8 case in `schema.test.ts`.
- **N-1**: `test/room/schema.test.ts` and `test/room/avatars-compose.test.ts` are in T011's and T013's lists, and in T004's.
- **N-2**: FR-013, R-05, and T014 give the twin's height in metres: the measured height for its own model (never `OWN`, -1), `figures.twin_height` for the stand-in.
- **N-3**: R-10 has `place`, `clip`, and `missed` over `wanting()`, with `both()` kept for the hand-off. FR-018 scales by `instanceFor` through `target`.
- **N-4**: `src/lookdev/stage.ts:587` is in §5 and T011.
- **N-5**: the spec's Input reads the gait's code at `fix-019`.

## Metrics

- Functional requirements: 29; success criteria: 8 (7 buildable).
- Tasks: 18 (16 for workers).
- Coverage: 100% of FRs and buildable SCs have a task and a small test.
- Ambiguities: 4 open, all low (A1, A2, A4 to A6, with A1 folded into A3), and A3 at medium, applied below. Duplications: 0. Critical: 1, the named deviation for the Author (D1).

## Next actions

- D1 stays on the page (Q10, Q13). Implementation may proceed under the order; the merge waits for his answers.
- Q12 (the room's floor) and Q11 (Q139 as taken) go to the page.
- I2, I3, A3, and C1 are applied in the commit after this report (below).

## Applied after the report

- I2: spec FR-004: a corner the dinosaur can enter is escaped, and one it can't, the twin's, is a refuge.
- I3: spec FR-008 and plan R-02: the separation yields only among the headings FR-007 allows.
- A3: plan R-02: the wall penalty below `WALL_M`, a named constant tuned at T002 (start 0.1 m).
- C1: tasks T010: the dog's height through `instanceFor`.
