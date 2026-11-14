# Analysis: spec 026 (non-destructive, 2026-11-14)

Cross-artifact check of `spec.md`, `plan.md`, `tasks.md`, the draft intent, the human-patches note, and the constitution, against `main` at 3c0e4cd0 and the branches the spec reads (020 as reworked, 025, 019 as reworked, 022).

## Coverage

| Requirement | Plan | Task | Small test |
|---|---|---|---|
| FR-001, FR-002 | R-01, R-02 | T007, T008, T009 | pet-director, pet-degraded |
| FR-003, FR-004 | R-06, R-08 | T007, T008, T011, T012 | pet-director, pet-spot, pet-adapters |
| FR-005, FR-010 | R-07 | T007, T008, T014 | pet-director |
| FR-006 | R-05 | T007, T014 | pet-director, pet-reach-rig |
| FR-007, FR-008 | R-03, R-04 | T001 to T004 | pet-reach, pet-reach-rig |
| FR-009 | R-05 | T005, T006 | pet-states, twin-states |
| FR-011 | R-06 | T007, T009 | pet-director, pet-degraded |
| FR-012 | R-01 | T007 | pet-director |
| FR-013 to FR-015 | R-02, R-09 | T013 | dog-selectable, talk, talk-activity |
| FR-016 | §3, §7 | rules header, T012, T019 | data-only (no `dog` on the line) |
| FR-017 to FR-022 | §3, §7, R-13 | T018, T019 | the checker; `check_corpus.py`; twin-pack |
| FR-023 | R-13 | T017 | test_dog_intro_proposal |
| FR-024 | R-10 | T010 | pet-notes |
| FR-025 | R-01 | T009 | pet-degraded (fetch spy) |
| FR-026 | R-11 | T010, T020 | pet-notes |
| FR-027 | R-04 | T016 | pet-bench |
| SC-008 | R-12 | T015, T023 | the Author's look |

Every FR has a plan decision, a task, and a small test; every task names its tests (rule 4). Only T021 runs `make check`, and only if the supervisor names it.

## Findings

- **A1 (medium) The interfaces from spec 025 are assumed, and two aren't in its plan.** Spec 025's director has phases `home`, `fleeing`, `returning`, a pose, and a home, but no `goTo` and no head point. Mitigated: one adapter file (plan §4), fakes first (T011), R-06's fallback (`visiting` in `chase.ts`, tested in a new file, no spec 025 test edited), and the head point computed in the adapter from the dog's pose and its table height (0.62 m, `AVATAR_SHAPES.dog`) where 025 exposes no bounds. Recorded in spec §Assumed Interfaces, A025.
- **A2 (medium) Applying the patch closes the hobbies-and-travel topic.** The snowboard, the bicycle, and the dog show `topic_not_ready` until he re-runs his evaluations and marks the new hashes (`config/twin-readiness.yaml`, his). Taken: one patch, one closing (Q7); named at the proposal's top (T018), in human patch 026 items 1 and 5, and in spec §Degraded-Mode.
- **A3 (medium) The corpus patch waits on a long chain.** FR-019 quotes spec 020's approval line, which waits on his photo move, his concept image, a studio round, his intake, and his look approval (human patch 020). Until then, T019 stops with a recorded gap; the code still merges; the dog-intro has no selectable on the line. Named in the tasks and the human-patches note.
- **A4 (resolved in this pass) A placeholder Golden answer would become generated cases.** `npm run twin:pack` turns each Golden Q&A into cases (`anchorsOf(answer)`), so `<his answer>` in the patch would test for a placeholder. Fixed: Golden Q&A 9 enters the patch only with his answer from the morning page, verbatim; else it stays in the proposal alone (FR-020, FR-023, R-13, T017 to T019, a new page question).
- **A5 (low) Collisions on shared files**: `twin-states.ts` (019, 025), `avatars.ts` (019, 020, 025), `chase.ts` (025), `scene.ts`, `bundle3d.ts`, `schema.ts`, `scene.yaml`, `frame-log.ts`, and the generated `config/twin/corpus.json` (spec 022's patch). Plan §5's conflict watch and §9's order; this branch merges last of them; the pins of closed lists change in the same commit.
- **A6 (low) RG6 doesn't measure the dog figure's pick area.** It measures placements at the framing; the figure moves. Named as a reading in spec Assumptions; the selectable's member, the sign, is measured; no control is dropped.
- **A7 (low) The twin stands near the shell's right wall** (spec 016's T082, RA8). The pet spot is chosen on the walkable floor toward the open middle and pinned by a test (R-08, T012); the reach follows the dog's side. The runtime reach isn't measured by RA8 (the studio clip is, at intake); the reach aims at a point over the floor, inside the room. Nothing checks the arm against the desk's meshes: his look (SC-008).
- **A8 (low) Talking waits for the petting.** An answer arriving during the petting shows in the panel at once; its talking clip plays after, for what is left of its speaking time (FR-009, as spec 025's `fleeing`). At most `pet_s` (3.5 s). His look.
- **A9 (low) Spec 025's Q2 calls item i "spec 026's".** Item i's spec is not this one (this is item f). Outside this spec; noted for spec 025's next rework and in the notes.
- **A10 (info) Telemetry is the room's local frame log** (`room.pet`), as spec 025's `room.chase` and spec 019's records are; no usage event kind is added (spec 020's FR-015 made the same choice). The dog-intro's turn carries the gateway's existing spans and its `object_selected` event. Consistent with `CLAUDE.md`'s "new feature" list as the room's earlier specs read it.
- **A11 (info) A new "Do not claim" line changes 04's cases and the narration cases that read 04** (`forbiddenFor` reads a case's file and `00`); all regenerated in the patch (FR-022). The empty slot adds a "don't know" case, which is intended (Q5).
- **A12 (info) `twin-2d.test.ts` is flaky under load**; T006 names it with the rerun-alone rule.

No contradiction found between spec, plan, and tasks after A4's fix. No constitution violation: no control deferred or dropped; no deviation to name. No new data flow. The intent holds only his words, attributed (the orders file's sentences are marked as its own, not his), with the readings marked as readings. Nothing is stated about the Author or his dog beyond `corpus/04-hobbies-and-travel.md`, its filled slots, and his words in the brief; which dog the room's dog is stays an open slot.

## Open items for the Author

Nine questions on the morning page, each with its recommended answer: Q1 to Q8 (taken provisionally) and his Golden Q&A 9 answer. Human patch 026 lists what is his: the corpus patch, the clip's intake and approval, and his readiness marks.
