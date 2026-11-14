# Analysis: spec 026 (non-destructive; re-run 2026-11-14 after the rework)

Cross-artifact check of `spec.md`, `plan.md`, `tasks.md`, the draft intent, the human-patches note, and the constitution, re-run by `rework-spec-026` after the Opus review rv-spec-026 (blocking: B1 to B4) and this rework. `/speckit-analyze`'s prerequisite script needs `SPECIFY_FEATURE_DIRECTORY=specs/026-twin-pets-dog` in this worktree (no `.specify/feature.json`); with it, it resolves the feature directory. Read against `main` at 3c0e4cd0 and the branches the spec's Input names: spec 025 as reworked (`night/rework2-spec-025/rework2-spec-025` at 7ead9819, still running; its earlier tip c73cee1d), spec 020 as reworked, spec 022 as reworked twice, spec 027 and ADR 0054 (proposed), and the line (`night/rework-018/rework-018`, `night/fix-019/fix-019`, `night/fix-020/fix-020`). The `before_analyze` and `after_analyze` hooks are optional commits; the save points are this task's own commits.

## Specification Analysis Report

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| F1 | Inconsistency | MEDIUM | tasks.md T007; plan.md R-02 | T007 still tests "the active conversation's own piece ignored (R-02)" in the director, but the rework moved that check to `app.ts`'s `selectObject` (`talk.active`), which T013 tests; the director never sees `talk`. | Drop it from T007; T013 owns it. **Fixed after this pass** (tasks.md T007). |
| F2 | Terminology | LOW | spec.md FR-001, FR-003, FR-004 | "free" (FR-001, FR-003) and "not occupied" (FR-004, R-08) name one condition. | Read "free" as "not occupied"; FR-003 defines both. Left as is. |
| F3 | Inconsistency | LOW | spec.md User Story 2, scenario 5; FR-004 | The scenario says "the dog goes home" for a spot off the floor or occupied; FR-004 says that at the selection no petting starts and the dog stays at home. Same outcome, the dog at home. | Left; T007 tests FR-004's wording. |
| A1 | Dependency | MEDIUM | spec.md A025; plan.md R-06, R-07, §4; tasks.md T011 | Spec 025 is still being reworked (`rework2-spec-025` running). This spec's A025 is read from its latest tip: `FigureId` `dog`, `pictureOf`/`legsOf`, `figures.dog: { home, footprint_m }`, `chase-figures.ts` the one writer of both pictures, phases `home`/`fleeing`/`returning`, no `goTo`, no head point. | One adapter file, fakes first; `visiting` and `faceTwin` added to spec 025's files by T011, test first in this spec's own `chase-visiting.test.ts`. If 025's final text differs, only §4's adapter and T011 change. |
| A2 | Human gate | MEDIUM | spec.md Q7, FR-022, User Story 4, Assumptions; plan.md §7; human patch 026 | Applying the patch closes all three ready topics (mission, work projects, hobbies and travel): the "Do not claim" line is in every topic's hash (`twin-pack.ts`, line 17, `topicHashInput`). Taken (Q141, provisional): keep the line; apply back to back with spec 022's patch; evaluate once. Named at the proposal's top (T018), in human patch 026's lead and items 1 and 5, and in §Degraded-Mode. | None further. |
| A3 | Human gate | MEDIUM | spec.md FR-019; tasks.md T019 | The corpus patch waits on spec 020's approval line (his photo move, concept, studio round, intake, look approval). | T019 stops with a recorded gap; the code merges without the `dog` piece. |
| A4 | Capacity | MEDIUM | spec.md Assumptions (ADR 0054's T1), FR-022; plan.md §7 | The patch takes hobbies and travel past ADR 0054's T1 (20,916 of 21,182 on `main`; the new lines exceed the 266 left). Taken (Q144, provisional): nothing more built; the record reads "stage 1 due"; spec 007's FR-008 drops the topic's last sections (its Golden Q&A) in long conversations only. | Stage 1's spec is queued once either corpus patch is applied (Q144). The exact figures are the regenerated record's. |
| A5 | Constitution | MEDIUM (named deviation) | spec.md Assumptions, Constitution table row II, New Endpoint list; plan.md R-11 | Principle II ("telemetry that makes it observable in production") and Development Workflow 7 ("A feature without a graph is not done") are not met for the petting: no usage event, no panel or count (Q142, provisional), because `cut` would reveal the dinosaur (row V4). Named per CLAUDE.md; no ADR reversed. | None; his to overturn on the page (Q142's other answer brings an event of `done` and `skipped` only, its events line, and a panel). Not CRITICAL: the deviation is named, as the constitution's process allows and spec 025 did for the run. |
| A6 | Honesty | LOW | spec.md FR-018, FR-020, FR-023; plan.md R-13; tasks.md T017, T019 | Golden Q&A 9 and the slot take only his own words; a page entry reading "Answered: recommended" is refused by the checker (Q143). T017 has the failing fixture. | None. |
| A7 | Wording | LOW | spec.md FR-021 | C9's key phrase stops at the first clause break; the "Do not claim" line now puts its one claim before the colon, so its key phrase is "the dog in the room is a real dog", and "a photo" or "a recording" never becomes a forbidden phrase that could hit the narration or the resume. | None; T019's `content:check` on the export confirms. |
| A8 | Shared files | LOW | plan.md §5 conflict watch | `stage.ts`, `chase.ts`, `chase-figures.ts`, `app.ts` (spec 018 on the line), `src/talk/talk.ts` (spec 018's getters), `twin-states.ts`, `avatars.ts`, `scene.ts`, `bundle3d.ts`, `schema.ts`, `scene.yaml`, `frame-log.ts`, `ui-words.yaml`, and the generated corpus files (spec 022's patch). | This branch's code merges last of them; pins of closed lists change in the same commit. |
| A9 | Reading | LOW | spec.md Assumptions (RG6) | RG6 doesn't measure the dog figure's pick area (it moves). | Named as a reading; the sign is measured; no control dropped. |
| A10 | Reach | LOW | spec.md FR-003; plan.md R-08 | The spot is now computed from the dog's home at `reach_m` (≥ 025's `separation_m`); whether the twin's arm reaches a 0.62 m dog at 0.55 m is SC-002's test on the real rigs, with the spine lean. | T003's test; his look sets `reach_m`. The new derivation is on the page (RQ1). |
| A11 | First visit | INFO | spec.md FR-025, §Data-Flow; plan.md R-14 | An approved `petting.glb` is a first-visit twin file: row V1 already names "the twin's model and clips"; RK5 counts it. | None; T020's brief says so. |
| A12 | Flaky test | INFO | plan.md §6; tasks.md T006 | `twin-2d.test.ts` is flaky under load. | Rerun alone; report with evidence. |

## Coverage Summary

| Requirement | Plan | Tasks | Small test |
|---|---|---|---|
| FR-001, FR-002 | R-01, R-02, R-08 | T007, T008, T009 | pet-director, pet-degraded |
| FR-003, FR-004 | R-06, R-08 | T007, T008, T011, T012 | pet-director, chase-visiting, pet-spot |
| FR-005, FR-010 | R-07 | T007, T008, T011, T014 | pet-director, chase-visiting |
| FR-006 | R-05 | T007, T014 | pet-director, pet-reach-rig |
| FR-007, FR-008 | R-03, R-04 | T001 to T004 | pet-reach, pet-reach-rig |
| FR-009 | R-05 | T005, T006 | pet-states, twin-states |
| FR-011 | R-06 | T007, T009, T011 | pet-director, pet-degraded, chase-visiting |
| FR-012 | R-01 | T007 | pet-director |
| FR-013 to FR-015 | R-02, R-09 | T013 | dog-selectable, talk, talk-activity, dog-figure |
| FR-016 | §3, §7 | rules header, T012, T019 | data-only (no `dog` on the line) |
| FR-017 to FR-022 | §3, §7, R-13 | T017, T018, T019 | the checker; `check_corpus.py`; `content:check`; twin-pack, narration |
| FR-023 | R-13 | T017 | test_dog_intro_proposal |
| FR-024 | R-10 | T010 | pet-notes |
| FR-025 | R-01, R-14 | T009, T020 | pet-degraded (fetch spy); the brief |
| FR-026 | R-11 | T010 | pet-notes (frame log; no event) |
| FR-027 | R-04 | T016 | pet-bench |
| SC-001 to SC-007 | as their FRs | as their FRs | as their FRs |
| SC-008 | R-12 | T015, T023 | the Author's look and evaluation |

**Constitution alignment**: one named deviation (A5), no unnamed one; no constitution MUST violated without its clause named. **Unmapped tasks**: none (T021 to T023 are the stack's gate, review, and the Author's).

**Metrics**: 27 functional requirements, 8 success criteria (7 buildable); 23 tasks; coverage 100% (every FR has a plan decision, a task, and a small test); ambiguity 1 (F2); duplication 0; critical 0.

## Review findings, checked

B1 (Q140): A025, FR-001 (quality level 0), FR-003 (spot from the home; fits, overlap, occupied), FR-014 and M5, R-06 to R-09, plan §4 and §5, T011, T013, T014. B2 (Q142): FR-026, the deviation in Assumptions, the New Endpoint list, the Constitution row II, R-11, T010, T020, A5. B3 (Q141, Q144): Q7, FR-021, FR-022, User Story 4, §Degraded-Mode, Assumptions, A2, A4, T018, plan §7, human patch items 1 and 5. B4 (Q143): FR-018, FR-020, FR-023, R-13, T017, T019. I1: T019, FR-022, SC-005, plan §3, patch item 1. I2: FR-019, plan §3, patch item 1. I3: FR-018, T018, patch item 1. I4: FR-019, FR-023, R-13, T017. I5: FR-025, §Data-Flow, patch item 3. I6: the spec's Input. Q145: FR-022, patch item 1. N1: the intent's Author line. N2: Assumptions. N3: FR-021. N4: FR-023, R-13. N5: FR-026, R-11.

Nothing is stated about the Author or his dog beyond `corpus/04-hobbies-and-travel.md`, its filled slots, and his words in the brief and on `main` (`specs/017-the-night-shift/spec.md`, line 48). Q140 to Q145 are the page's "Answered: recommended", taken provisionally under the orders file's rule, never as his answers.

## Next actions

No CRITICAL issue. F1 fixed after this pass; F2 and F3 left (LOW). Implementation may proceed on the line after spec 025's code (plan §9).
