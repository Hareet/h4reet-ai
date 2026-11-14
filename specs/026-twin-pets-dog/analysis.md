# Analysis: spec 026 (non-destructive; re-run 2026-11-14 after the second rework)

Cross-artifact check of `spec.md`, `plan.md`, `tasks.md`, the draft intent, the human-patches note, and the constitution, re-run by `rework2-spec-026` after the Opus review rv-rework-spec-026 (blocking: RB-1, RB-2; also I-2, I-3, N-1, N-2, N-4) and this rework. `/speckit-analyze`'s prerequisite script needs `SPECIFY_FEATURE_DIRECTORY=specs/026-twin-pets-dog` in this worktree (no `.specify/feature.json`); with it, it resolves the feature directory. Read against `main` at 3c0e4cd0 (`compose/floor.ts`, lines 121 to 147), spec 025's final tip (`night/rework2-spec-025/rework2-spec-025`, bb1240be: plan §3, §3.1, FR-008, FR-018, R-09), the line (`night/fix-020/fix-020`: `compose/pick.ts`, `scene/bundle3d.ts`'s picker, `build/room/checks/rg.ts`'s `pickSweep`, `src/choice/avatars.ts`, `room/scene.yaml`), and the decision page on `night/supervisor/2026-11-13` (Q149, Q152 to Q154, Q158 to Q162). The `before_analyze` and `after_analyze` hooks (`.specify/extensions.yml`) are optional commits; this task's save points are its own commits.

## Specification Analysis Report

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| A1 | Dependency | MEDIUM | spec.md A025, FR-003; plan.md R-07, R-08, §3; tasks.md T011, T012 | Spec 025 is final at bb1240be, but its code isn't on the line, and the dog's home this spec writes against is the page's Q158's move (about [0.30, 0.45], 0.36 m from the twin's home), made by impl-025's T011. | One adapter file, fakes first; `faceTwin` added to `chase.ts` by T011, test first in `chase-face.test.ts`. `pet-homes.test.ts` reads whatever home `scene.yaml` holds: both the old estimate (0.311 m) and Q158's (0.36 m) are within the default `reach_m`, 0.55 m. |
| A2 | Human gate | MEDIUM | spec.md Q7, FR-022, User Story 4, Assumptions; plan.md §7; human patch 026 | Applying the patch closes all three ready topics (the "Do not claim" line is in every topic's hash). Taken (Q141, provisional): keep the line; apply back to back with spec 022's patch; evaluate once. | None further. Unchanged from the first rework. |
| A3 | Human gate | MEDIUM | spec.md FR-019; tasks.md T019 | The corpus patch waits on spec 020's approval line. | T019 stops with a recorded gap; the code merges without the `dog` piece. Unchanged. |
| A4 | Capacity | MEDIUM | spec.md Assumptions (ADR 0054's T1), FR-022; plan.md §7 | The patch takes hobbies and travel past ADR 0054's T1 (Q144, provisional). | Unchanged; the exact figures are the regenerated record's. |
| A5 | Constitution | MEDIUM (named deviation) | spec.md Assumptions, Constitution row II, New Endpoint list; plan.md R-11, §9; tasks.md T020, T023; human patch 026 | Principle II's production telemetry and Development Workflow 7's graph are not met for the petting (Q142, provisional). The governance's "an ADR if permanent" is now met by the one ADR for specs 024, 025, and 026 (Q161, provisional, with Q149 and Q152): the docs role drafts it on the line; he merges it on `main` before this implementation merges. | None; named, with its ADR route. Not CRITICAL: the clause is named and the ADR is scheduled before the merge, by the hands that may write it. |
| A6 | Honesty | LOW | spec.md FR-018, FR-020, FR-021, FR-023; plan.md §3, R-13; tasks.md T017, T018 | Golden Q&A 9 and the slot take only his own words (Q143). N-1: `04`'s "None named for this topic:" framing (the file's words; only "No" is his) becomes "None named by him for this topic:", marked as the spec's. N-2: a digit inside a quoted span found verbatim in its named source (`approvals.json`'s `disclosure_line`, his consent) is allowed, with T017's fixtures for both sides. | None. |
| A7 | Wording | LOW | spec.md FR-021 | The "Do not claim" line's claim before the colon (Q154, provisional): key phrase "the dog in the room is a real dog". | None; T019's `content:check` confirms. |
| A8 | Shared files | LOW | plan.md §5 conflict watch | Added by this rework: `compose/pick.ts`, `bundle3d.ts`'s picker, and `build/room/checks/rg.ts`, which spec 024's Eat box also touches (the page's Q150: RG6's second sweep with the Eat box on). Removed: `chase-figures.ts` (no longer changed). | This spec's code merges last of them; the `front` field is optional, so no existing call changes. |
| A9 | Pick and RG6 | MEDIUM | spec.md FR-014, M4, Assumptions (RG6), User Story 3 scenario 5; plan.md R-09; tasks.md T013a | RB-2 (Q160, provisional): the dog's rectangle is a front-only member (only `pick`'s "frontmost member under the point" rule and RG6's "a core over another's member" see it), out of the "Dog" piece's union and core, and RG6 measures it at the dog's home beside the twin's figure. Whether the shipped scene passes RG6 with the piece added can't be known before the code: the dog stands in the twin's corner, in front of the twin's lower body and beside the desk's front edge, where other pieces' cores may lie. | T013a runs the sweep on the shipped scene with the piece added in memory and records the result; a refusal goes to the page, with a recommendation, before T019 builds the patch (the dependencies say so). |
| A10 | Reach | MEDIUM | spec.md FR-003, FR-007, SC-002; plan.md R-03, R-08, §3; tasks.md T003 | RB-1 and I-3: the dog stays at its home (Q159), 0.36 m from the twin at Q158's estimate; a 0.62 m dog's head is about 0.53 m above the floor, likely beyond a standing figure's arm at the first default lean, 35°. T003 now measures both rigs first and sets `lean_max_deg` from the lean the default home needs (Q162, provisional), capped at 75°, recorded in plan §3; if 75° isn't enough, it stops RED with the numbers and a page question; no worker relaxes SC-002. | None further; his look sets the numbers. |
| A11 | Aim | LOW | spec.md FR-005; plan.md R-08; tasks.md T012 | The twin's mount has no turn, and the dog's home lies on the twin's side (about −x of it), so the aim may meet the `turn_max_deg` clamp (60°), leaving the dog off the twin's facing, reached by the arm on its side. | `pet-homes.test.ts` prints the aim's heading and side on the shipped scene for his look; `turn_max_deg` is data. |
| A12 | First visit | INFO | spec.md FR-025, §Data-Flow; plan.md R-14 | An approved `petting.glb` is a first-visit twin file; row V1 covers it; RK5 counts it. | Unchanged. |
| A13 | Flaky test | INFO | plan.md §6; tasks.md T006 | `twin-2d.test.ts` is flaky under load. | Rerun alone; report with evidence. |
| A14 | Wording | LOW | spec.md Expected Cost Impact | "some twenty small tasks (tasks.md T001 to T021)": T013 is now T013a and T013b, so there are 24 task entries. | Left; the estimate holds ("some twenty"). |

The first rework's F1 was fixed; its F2 ("free" and "not occupied") and F3 (User Story 2, scenario 5's "the dog goes home") are resolved by RB-1: "free", "occupied", and the spot are gone, and scenario 5 now reads as FR-004 does (no petting, nothing moves). A search of all six files for `visiting`, `visit(`, `occupied`, `approach`, `walk_mps`, `pet-spot`, and `chase-visiting` finds them only where the rework says they were dropped and why.

## Coverage Summary

| Requirement | Plan | Tasks | Small test |
|---|---|---|---|
| FR-001, FR-002 | R-01, R-02, R-08 | T007, T008, T009 | pet-director, pet-degraded |
| FR-003, FR-004 | R-06, R-08 | T007, T008, T012 | pet-director, pet-homes |
| FR-005, FR-010 | R-07, R-08 | T007, T008, T011, T014 | pet-director, chase-face |
| FR-006 | R-05 | T007, T014 | pet-director, pet-reach-rig |
| FR-007, FR-008 | R-03, R-04 | T001 to T004 (T003's measure first) | pet-reach, pet-reach-rig |
| FR-009 | R-05 | T005, T006 | pet-states, twin-states |
| FR-011 | R-07 | T007, T009, T011 | pet-director, pet-degraded, chase-face |
| FR-012 | R-01 | T007 | pet-director |
| FR-013, FR-015 | R-02 | T013b | dog-selectable, talk, talk-activity |
| FR-014 | R-09 | T013a, T013b | dog-pick, pick, stages-checks, dog-selectable, dog-figure |
| FR-016 | §3, §7 | rules header, T012, T013a (in memory only), T019 | data-only (no `dog` on the line) |
| FR-017 to FR-022 | §3, §7, R-13 | T017, T018, T019 | the checker; `check_corpus.py`; `content:check`; twin-pack, narration |
| FR-023 | R-13 | T017 | test_dog_intro_proposal |
| FR-024 | R-10 | T010 | pet-notes |
| FR-025 | R-01, R-14 | T009, T020 | pet-degraded (fetch spy); the brief |
| FR-026 | R-11 | T010 | pet-notes (frame log; no event) |
| FR-027 | R-04 | T016 | pet-bench |
| SC-001 to SC-007 | as their FRs | as their FRs | as their FRs |
| SC-008 | R-12 | T015, T023 | the Author's look and evaluation |

**Constitution alignment**: one named deviation (A5), now with its ADR route (Q161); no unnamed one; no constitution MUST violated without its clause named. **Unmapped tasks**: none (T021 to T023 are the stack's gate, review, and the Author's).

**Metrics**: 27 functional requirements, 8 success criteria (7 buildable); 24 task entries (T001 to T012, T013a, T013b, T014 to T023); coverage 100% (every FR has a plan decision, a task, and a small test); ambiguity 0 (F2 resolved); duplication 0; critical 0.

## Review findings, checked

RB-1 (Q159, with Q158): Q3, the second rework's session, User Stories 1 and 2, edge cases, FR-001, FR-003 to FR-005, FR-010, FR-011, Key Entities, A025, SC-001, SC-002, M3, §Degraded-Mode; plan R-01, R-06, R-07, R-08, §3, §4, §5, §6, §9, §10; tasks T007, T009, T011, T012, T014, dependencies; A1, A10. RB-2 (Q160): Q4, FR-014, M4, User Story 3 scenarios 4 and 5, Assumptions' RG6 paragraph; plan R-09, §4, §5, §6; tasks T013a, T013b; human patch item 1; A9. I-2 (Q161): Assumptions' deviation paragraph, Constitution row II; plan's Constitution Check, R-11, §9; tasks T020, T023; human patch's "Also yours"; A5. I-3 (Q162): FR-007, SC-002; plan R-03, §3; tasks T003; A10. N-1: FR-021, plan §3, §7, T018, human patch item 1. N-2: FR-023, R-13, T017. N-4: the spec's Input cites bb1240be; the first rework's RQ1 and RQ2 are named as the page's Q153 and Q154 (spec Clarifications and Open Questions). I-1 is spec 022's (rework3-spec-022); this spec's side is unchanged. N-3 is spec 027's; not touched.

Nothing is stated about the Author or his dog beyond `corpus/04-hobbies-and-travel.md`, its filled slots, and his words in the brief and on `main` (`specs/017-the-night-shift/spec.md`, line 48). Q158 to Q162 are the page's "Answered: recommended", taken provisionally under the orders file's rule, never as his answers.

## Next actions

No CRITICAL issue. MEDIUM A9 and A10 each have a task that measures first and stops at the page if the numbers fail (T013a, T003); A1 waits on impl-025. Implementation may proceed on the line after spec 025's code (plan §9), once rv-rework2-spec-026 has read this rework.
