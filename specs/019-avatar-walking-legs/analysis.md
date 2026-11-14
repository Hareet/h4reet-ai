# Analysis: Avatar Walking Legs (spec 019), 2026-11-14, re-run after the rework

Read-only cross-check of spec.md, plan.md, tasks.md, and the intent, against the constitution and CLAUDE.md, after the rework by the recommended answers to the page's Q61 to Q63 (spec.md Q6 to Q8), taken under the orders file's rule ("any new one: the recommended answer stands"), not said by him, each provisional and his to confirm or overturn on the morning page, Q62 (the hips) first: the hips bone lowered by the standing leg's lift, no time scale on a `walk` clip, and no allocation in a frame's gait. The first run's findings (2026-11-14, at d4d2f6bc) are kept below where they still stand. Nothing here changes code.

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| D1 | Constitution | LOW | spec.md Assumptions, Constitution Check; first analysis | The spec named cost "Principle IV" and privacy "V/VIII"; the constitution has cost as V, data-local and disclosure as I, and IV is least privilege. | **Resolved in this rework**: relabelled in spec.md; the check now also names II's measurement (SC-004 by T019) and IV (the implementer doesn't review). |
| F1 | Inconsistency | MEDIUM | spec.md Q5, plan R-01, README, `gait.ts` | "So the feet don't skate" claimed more than distance-driven phase gives: the standing foot lifted about 7 cm (Q62), and its slide along the floor isn't zero. | **Resolved in the artifacts**: Q5's reading and R-01 corrected; the README's and `gait.ts`'s wording is T015's. |
| F2 | Inconsistency | MEDIUM | plan §2.3, §5; tasks T007 | `signals/frame-log.ts` and `app.ts` changed in T007 but weren't in plan §5 or T007, and T007's small runs didn't cover them. | **Resolved**: named in §2.3, §5, T007; the signal set (`test/ui/avatars.test.ts`, `test/room/live.test.ts`) runs in T016 and T018. |
| F3 | Inconsistency | LOW | plan §2.4, §5 | Lookdev was called T010; it is T009 (dropped). | **Resolved**: §2.4 and §5 say T009. |
| C1 | Coverage | MEDIUM | tasks T004 | R-07's sign was asserted on the left leg only. | T013 adds the right leg's check; T004's text says so. |
| C2 | Coverage | MEDIUM | spec FR-011, SC-004; first analysis finding 4 | FR-011's allocation had no test and SC-004 was left to the stack's end. | T017/T018 (allocation, SC-007) and T019 (the chunk's gzip size against b9378980, plan §2.8). |
| A1 | Ambiguity | LOW | spec SC-006; page Q62 | The page says "no standing foot rises more than 2 cm"; SC-006 also fails a foot that sinks more than 2 cm (an over-lowered hips bone). That half is the spec-writer's reading, marked as such in SC-006. | Asked on the page with the recommended answer "both ways" (questions.md; Q74 as fix-019 reads it), which stands under the orders file's rule, provisional; a "rise only" answer drops one assertion in T014. |
| W1 | Inconsistency | MEDIUM | spec.md Status, Clarifications, Open Questions; plan.md, tasks.md headers; intent; the stack note (rv-rework-019's I-1) | Q61 to Q63 were called his answers ("his answers on the morning page", "answered by the Author"); they were taken under the orders file's rule. | **Resolved in fix-019**: each artifact says so, provisional and his to confirm, Q62 first; Q74, Q89, Q101 the same. |
| S1 | Inconsistency | LOW | spec.md SC-007, FR-015, Key Entities (rv-rework-019's N-2) | SC-007 still read "no more minor collections than the same run with the gait off", and FR-015 and Key Entities named only the thigh's and shin's lengths; the build checks by identity and the source (plan §2.7) and uses each leg's rest angles too (plan §2.6, `LegShape`). | **Resolved in fix-019** (Q101's "the spec's next pass"): SC-007 states the identity and source checks; FR-015 and Key Entities name each leg's shape, lengths and rest angles. |
| C3 | Coverage | LOW | `gait-alloc.test.ts`; FR-011, FR-015 (rv-rework-019's I-2, N-1) | The source check read only `applyGait`'s and `clearGait`'s bodies; nothing asserted the "exactly" of the hips' lowering at the controller. | **Resolved in fix-019**: `gait-frame-path.test.ts` (the whole frame path, from `stepGait`) and `avatar-gait-lift.test.ts`. |
| A2 | Ambiguity | LOW | plan §2.7 | A gc-count test can be unsteady on a loaded runner. | The identity assertions are deterministic and stand alone; removing the count is a departure written into plan §2.7, never a loosened bound in a fix. |
| U1 | Underspecification | LOW | plan §2.6 | "The avatar's down" in the hips bone's parent space, and the thigh's and shin's lengths, are measured at `findLegRig`, in the bind pose. | Stated in §2.6 and R-08; the real-GLB test (T014) checks it. |
| T1 | Terminology | LOW | spec.md Amendments | Spec 009's SC-007 is amended, and spec 019 now has its own SC-007. | Always prefixed ("Spec 009, … SC-007"); no change. |
| O1 | Ordering | LOW | tasks.md | T013 to T020 are appended after T012 but run before it. | Dependencies say so: T012, the one full `make check`, is last. |
| O2 | Ordering | LOW | tasks T011 | T011 (the review) is unchecked; review-019 and rv2-impl-019 are the night's reviews of T001 to T010, and T020 reviews the rework. | The supervisor ticks T011 with review-019's verdict; no edit here. |

Still standing from the first run: finding 2 (`gait.ts` holds the pure part and the applier; the pure functions take `import type` only, so FR-014 holds, and `standingLift` is pure too); finding 6 (shared ground in `avatars.ts` and `stage.ts` with specs 020, 021, 024, 025; the rework's edits are inside `stepGait`, `driver.frame`, `update`, and `gait.ts`); finding 7 (T010's smoke test is thin; the docs check in the lint run is the real gate for the README).

## Coverage: requirement to task to small test

| Requirement | Task(s) | Small test |
|---|---|---|
| FR-001 gait on while walking | T006, T007 | `avatar-gait.test.ts` |
| FR-002 phase by distance | T002, T003 | `gait.test.ts` |
| FR-003 amplitude by speed, ease | T002, T003 | `gait.test.ts` |
| FR-004 legs apart, knee limits | T002, T003, T013 (sign per leg) | `gait.test.ts`, `gait-rig.test.ts` |
| FR-005 legs only, the hips' one exception | T006, T007, T014, T015 | `avatar-gait.test.ts` |
| FR-006 no residue, the hips' position too | T005, T006, T007, T014, T015 | `gait-rig.test.ts`, `avatar-gait.test.ts` |
| FR-007 walk clip wins, at its own speed | T006, T007, T016 | `avatar-gait.test.ts` |
| FR-008 no leg bones or hips: slide, signal | T004 to T007, T014, T015 | `gait-rig.test.ts`, `avatar-gait.test.ts` |
| FR-009 reduced motion, level 1 | T006, T007 | `avatar-gait.test.ts` |
| FR-010 pure, deterministic | T002, T003, T014 | `gait.test.ts` |
| FR-011 no allocation, size, no asset | T017, T018, T019, T021 | `gait-alloc.test.ts`, `gait-frame-path.test.ts`; the build's report |
| FR-012 no DOM, key, setting | none needed | review at T011, T020 |
| FR-013 no `assets/**` edit | the tasks' rules | the repo's hooks; review |
| FR-014 reusable pure part | T003, T015 | `gait.test.ts` imports nothing from the controller |
| FR-015 hips lowered by the standing leg's lift | T014, T015, T021 | `gait.test.ts`, `gait-rig.test.ts`, `avatar-gait.test.ts`, `avatar-gait-lift.test.ts` |
| SC-001, SC-003 | T002 | `gait.test.ts` |
| SC-002 | T005, T014 | `gait-rig.test.ts` |
| SC-004 | T019 | the build's report, two tips |
| SC-005 | the Author | morning page, in the room |
| SC-006 (2 cm, real rigs) | T014, T015 | `gait-rig.test.ts` |
| SC-007 (no allocation, by identity and the source) | T017, T018, T021 | `gait-alloc.test.ts`, `gait-frame-path.test.ts` |
| US3 lookdev | T009, dropped | plan §2.5 |

Every task maps to a requirement or a story; none is unmapped.

## Constitution and policy check

- Principle I: no byte leaves the device, no disclosure row; degraded modes in the spec's table, the hips' row included (FR-008). Principle II: RED then GREEN per task; determinism by FR-010; the rework adds SC-006 and SC-007 tests and measures SC-004 (T019). Principle III: the rework follows the page's recommended answers, taken under the orders file's rule and provisional, recorded so in Clarifications and at the top of plan.md and tasks.md. Principle IV: no implementer reviews its own work (T011, T020). Principle V: no spend. No clause is deferred or dropped, so no deviation is named.
- CLAUDE.md's "new feature" list: telemetry (the frame-log signal), dashboard panel (none, stated), cost (none), degraded mode (done), data-flow row (none). No provider call.
- Human-only paths: none changes (docs/merge-requests/human-patches/019.md stands).
- Words: the page's questions and recommendations are quoted, not paraphrased, and its line "Answered: recommended, the Author 2026-11-13." is named as what it is, the orders file's rule taking the recommended answer, not his word (fix-019); SC-006's "either way" is marked as the spec-writer's reading, and asked.

## Metrics

- Requirements: 15 FR, 7 SC (22). Tasks: 21 (T001 to T021; T009 dropped).
- Coverage: 21 of 22 with a task (SC-005 is the Author's look approval).
- Ambiguities: 2 (A1, A2), both low. Duplications: 0. Critical: 0.

## Verdict

Ready for the code rework: no blocking finding. What's left: T013 to T020, then T012 at the stack's end; the Author's look approval in the room (SC-005); his confirmation or overturn of Q1 to Q8 (Q62, the hips, first), Q74 (the SC-006 question), Q89, and Q101, each taken under the orders file's rule.
