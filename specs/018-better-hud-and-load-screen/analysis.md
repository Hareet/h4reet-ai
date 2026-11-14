# Analysis: spec 018 (`/speckit-analyze`, read-only over spec.md, plan.md, tasks.md)

**Re-run 2026-11-14 for rule 6's rework**, on `night/rework-spec-018/rework-spec-018`, after the spec, plan, and tasks were reworked against rv-spec-018's and rv2-impl-018's blocking findings. The run was by the spec-writer that did the rework, which is a limit. The rework's code gets T030's review by a worker that wrote none of it, and the supervisor queues rv-rework-018. The `before_analyze` and `after_analyze` hooks (`speckit.git.commit`, optional) were not run; the session commits its own save points.

## Specification Analysis Report

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| C1 | Constitution | CRITICAL by the skill's rule; named deviation | spec.md Assumptions; plan.md Constitution Check | Principle II ("telemetry that makes it observable in production … a cost measurement") and Workflow step 7 ("A feature without a graph is not done") are not met: the split layout adds no event and no panel. The spec names both as deviations, as CLAUDE.md requires, but a deviation from a MUST is the Author's to accept, not this analysis's. | On the page as R7, recommended: accept the deviation. The other answer is a once-a-visit usage event (`split_opened`, no id), a use panel, and a V4 entry, which would be tasks T031 to T033. |
| F1 | Inconsistency (rv-spec-018, resolved) | was HIGH | spec.md FR-001, Q5; plan.md §2; impl-018 `splitBoxes` | The 48rem rule broke the 304 × 196 floor. At 1280 × 720 the 40rem panel left 192 px. At 844 × 390 and at 768 × 432 (48rem), impl-018's panel left 144 px, all of it the walking control's corner, so the scene beside it was 0. | Resolved: FR-001 (a) to (e), computed; the FR-001 table and plan §2 give the numbers at 1280 × 720, 1920 × 1080, 844 × 390, 768 × 432, and four more. |
| F2 | Inconsistency (rv-spec-018, resolved) | was HIGH | spec.md H-5, H-6, H-7 | Spec 005's FR-054 and spec 014's FR-019 and framing answer were amended by implication, not by name. | Resolved: Amendments H-1 to H-11, each by name, with the clause quoted where it changes. |
| F3 | Underspecification (rv-spec-018, resolved) | was HIGH | plan.md Project Structure | The file map missed files the tasks change (`flat.ts`, `test/ui/hud-model.ts`, the tests, the disclosure, the stack note). | Resolved: one table, every file T001 to T030 change, with the task. `compose/stages.ts` and `compose/frame.ts` are listed as unchanged in code, with the reason (R-4). The brief's `compose/framing.ts` is the camera's framing and is unchanged. |
| F4 | Attribution (rv-spec-018, resolved) | was HIGH | analysis.md (first run) F2; spec.md Clarifications | The first run called "fills the left half" the Author's. It is the supervisor's description of his screenshot, not his words. The first spec quoted the order's rule 1 as his words. | Resolved: this run quotes neither as his. Rule 1 is "the order's rule 1, the supervisor's statement of his order". |
| F5 | Data flow (rv-spec-018, resolved) | was HIGH | spec.md FR-003, H-11; tasks.md T029 | impl-018 fetches the twin's still in 3D when the panel opens, and row V1 says only "in a visit that shows the 2D room". | Resolved in the spec; the disclosure's words change in T029, on the code's branch. Until T029 lands, impl-018's tip under-discloses: the note must say so if T029 slips. |
| F6 | Inconsistency (resolved) | MEDIUM | spec.md FR-009; plan.md §3 | FR-009 sent focus to the selected entry, against spec 005's FR-045. | Resolved: FR-045 followed (opener first), R5 on the page. |
| F7 | Underspecification (resolved) | MEDIUM | spec.md FR-005; `hud/icons.ts` | Q60's answer names "the open piece's icon from the room's `hud/icons.ts`", and `icons.ts` has no piece icon and no speech glyph. | Resolved: T026 draws them (R6, R-7). |
| A1 | Ambiguity | MEDIUM | plan.md §2 (`split.rest.minRem`) | The rest row's least width is the layout model's finding and not yet a number. The plan takes 30rem for its arithmetic, non-binding at every window in its tables (the row is 640 px there). | T021/T023 fix it from the model; if it binds anywhere the FR-001 table names, the task notes say so. |
| U1 | Risk | MEDIUM | plan.md §13; `test/room/stages.test.ts` | "The walking control's box is always among them" depends on the frame area's ease being under 1 at 1920 × 1200, 2560 × 1440, and 5120 × 1440. That can't be computed without the composed scene's protector. | T023 has a stop rule: report, don't edit. |
| U2 | Risk | MEDIUM | tasks.md T022 | T022 edits spec 014's `frame.test.ts`, a test file. CLAUDE.md's hook blocks test edits in fix tasks. T022 is a spec-driven RED task, but the hook may not tell them apart. | If refused, record it under Interruptions (rule 5) and ask on the page. Don't respell. |
| I1 | Inconsistency | MEDIUM, open to the Author | spec.md R1; the page's Q57 | Q57's accepted text says "about 83rem"; the computed bound is 87rem (1392 px), since D-I1 keeps the column's 28rem band. | R1 on the page, recommended 87rem. |
| I2 | Terminology (resolved) | LOW | plan.md P2; `split.ts` | The spec says "rest row"; the code's state value is `data-panel="bar"`. | Resolved: P2 keeps the code's value, named. |
| I3 | Inconsistency | LOW | tasks.md T001 to T020 | The done tasks still say "48rem", "bar", and "1280 × 720". They record what impl-018 did, and Phase 8 supersedes them. | Leave them as history; plan.md's D-I1 notes the reconciliation. |
| D1 | Duplication | LOW | spec.md FR-001 table; plan.md §2 table | The geometry numbers are in two tables. | The spec holds the review's windows and the plan the others, with no window in both except by reference. |

## Coverage Summary

| Requirement | Has task? | Task IDs | Notes |
|---|---|---|---|
| FR-001 | yes | T006, T007; T021, T023 | rule (a) to (e) |
| FR-002 | yes | T015; T026 (emblem) | |
| FR-003 | yes | T010; T029 | row V1 |
| FR-004 | yes | T006, T007; T021, T023, T025 | |
| FR-005 | yes | T008, T009; T026 | emblem per Q60 |
| FR-006 | yes | T008, T009; T024, T025, T028 | sent turn; keyboard |
| FR-007, FR-008 | yes | T011, T012 | |
| FR-009 | yes | T008, T009, T018; T024, T025 | order and focus |
| FR-010 | yes | T004, T005 | |
| FR-011 to FR-013 | yes | T001 to T003, T014 | |
| FR-014 | yes | T013, T014; T027 | title row's glass |
| FR-015 | yes | T016, T017 | |
| FR-016 to FR-018 | yes | T013, T014; T024 | |
| FR-019 | none by design | none | nothing is added (C1) |
| SC-001 | yes | T021, T023 | |
| SC-002 | yes | T022, T023, T025 (covering runs) | plan §13 |
| SC-003 | yes | T013, T027 | |
| SC-004 | yes | T013, T024 | |
| SC-005 | the Author's | none | |

**Unmapped tasks**: none. T019, T020, T029 (note, build, docs) and T018, T030 (review) are process tasks.

**Metrics**: 19 functional requirements, 5 success criteria; 30 tasks (20 done, 10 appended); coverage 18 of 19 FRs with a task (FR-019 adds nothing by design), and 4 of 5 SCs (SC-005 is the Author's); ambiguities 1 (A1); duplications 1 (D1, LOW); CRITICAL 1 (C1), a named deviation, his to accept.

## Constitution

Checked against I to VIII. I: one disclosed same-origin fetch in 3D (FR-003, F5). II and Workflow step 7: C1. III: provisional by the order's rule 1. IV: no human-only path in the file map. V: $0. VI to VIII: as the spec's Constitution Check. Nothing is stated about the Author, the dog, or the dinosaur.

## Next actions

- C1, I1, and R1 to R6 go on the morning page with their recommended answers, taken here. The line goes on to rework-018 (T021 to T030), as rule 1 allows. An overturned answer is reworked before he merges.
- No artifact edit is needed before T021 beyond this run's (the I2 fix to plan.md P2).
