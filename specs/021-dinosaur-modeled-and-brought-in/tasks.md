---
description: "Task list for spec 021, the dinosaur modeled and brought in"
---

# Tasks: The Dinosaur, Modeled and Brought In

**Approved provisionally by the Author's order of 2026-11-13**:

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

(The spec's seven answers are the recommended ones, taken under rule 1, each on the morning page. An overturned answer is reworked before he merges.)

**Input**: [spec.md](spec.md), [plan.md](plan.md), [contracts/dinosaur-rig.md](contracts/dinosaur-rig.md), [contracts/dinosaur-brief.md](contracts/dinosaur-brief.md)

**Prerequisites**: this branch merged first by the implementer (one line); `main` at 3c0e4cd0 or later. The studio round and the asset are not tasks here (plan §6).

**Tests**: test-first. Each task's tests are written and seen to fail before its code. **A task runs only its own files** (below), `vitest run <files>` from `apps/web` or `pytest <file>`, and `make lint`, and pastes both into its notes. The full `make check` runs once, in T010. A failure in a test the stack doesn't touch is reported with evidence (passes alone; the stack doesn't touch it), not chased; `apps/web/test/room/twin-2d.test.ts` is a known flaky test.

**Rules for every task**: agents edit nothing under `assets/**`, `assets/policy/**`, `corpus/`, `.claude/**`, `tools/gates/**`, `REVIEW.md`, or CLAUDE.md; no test lists the dinosaur's files (spec 009's FR-043); commit one save point per task, `wip(spec-021): T0NN`.

## Format: `[ID] [P?] [Story] Description` — **Tests**: the small files the task runs.

## Phase 1: Setup and the proof

- [ ] T001 Record the base: `npm ci --cache $TMPDIR`; run the avatar test files only (`vitest run test/room/avatars.test.ts test/room/avatars-compose.test.ts test/room/avatar-hands.test.ts test/room/avatar-scene.test.ts test/ui/avatars.test.ts`) and `pytest scripts/studio/test_line.py`; paste into the draft note `docs/merge-requests/2026-11-14-feat-021-dinosaur.md`. **Tests**: those files, unchanged.
- [ ] T002 [US1] Prove the handless path first (plan R-07). RED: add `dinosaurGlb()` and `dinosaurClip(role)` to `apps/web/test/helpers/glb.ts` (a model with the contract's eighteen bones, no `mixamorig:` bone, 1.2 m high, 1.0 m long; clips `idle`, `walk`, `take`); add tests to `avatar-hands.test.ts` (no hand bone, paper at the anchor, no console error) and `avatar-scene.test.ts` (idle loops, walk plays weighted by speed, take plays once in the hand-off, a missing `take` stays in the idle). If they pass unchanged, say so in the note (the expected result); if one fails, stop, paste the failure into the note, and leave a task for converge (FR-008). **Tests**: `test/room/avatar-hands.test.ts test/room/avatar-scene.test.ts`.

## Phase 2: The rules (US1, US2)

- [ ] T003 [US2] RED then GREEN: the rig table and RA10. In `avatars.test.ts` add: a dinosaur model missing `Jaw` fails `RA10` naming it; a full model passes; `woman` and `man` are unaffected (table `null`). Add the generators `glb:dinosaur`, `glb:dinosaur-no-jaw`, `glb:dinosaur-idle`, `glb:dinosaur-walk` to `test/helpers/room-fixtures.ts` and the case `test/fixtures/room/bad/RA10-no-jaw/expect.yaml`. Then `RIG_BONES` and RA10 in `apps/web/build/room/avatars.ts`, the rule union widened, and `RA10` (and, with T004, T005, `RA9`, `RA11`) in `checks/family.ts`'s `RULES`, lenient, with the pinned lenient list in `compose.test.ts` extended in the task that adds each rule. **Tests**: `test/room/avatars.test.ts test/room/compose.test.ts`.
- [ ] T004 [P] [US2] RED then GREEN: RA9. Fixtures at 1.2 m high with 1.0 m and 1.3 m of length: the first passes, the second fails with the extent in the reason; a model in centimetres is scaled by its measured height first (plan R-03); `glb:dinosaur-long` and `bad/RA9-long/expect.yaml`; `RULES.RA9`. **Tests**: `test/room/avatars.test.ts test/room/compose.test.ts`.
- [ ] T005 [P] [US2] RED then GREEN: RA11. A model without `walk`, then without `idle`, is refused strictly and left out leniently (cut-out stays); a missing `take` is fine; a clip refused by RA2 counts as missing; `bad/RA11-no-walk/expect.yaml`; `RULES.RA11`. **Tests**: `test/room/avatars.test.ts test/room/compose.test.ts`.
- [ ] T006 [US1, US2] The bundle: a temp tree with `assets/visitors/dinosaur/` (built from T002's fixture, records and licence made in the test, never the asset) is bundled, in the 3D part's avatars and the report; a tree without the folder gives the output it gave before (SC-001, SC-005's report line). **Tests**: `test/room/avatars-compose.test.ts` (and `test/room/determinism.test.ts` only if T006 touches `report.ts`).
- [ ] T007 [US2] FR-010: the placeholder note shows while any choice lacks its model, whether or not the dinosaur has one; with all four present it is gone. Add to `test/ui/avatars.test.ts`; code only if the test fails. **Tests**: `test/ui/avatars.test.ts`.

## Phase 3: The studio's side (US3)

- [ ] T008 [US3] RED then GREEN: in `scripts/studio/test_line.py` add a test that reads the first `json` block of `contracts/dinosaur-brief.md` and passes it to `line.py brief` on the test's scratch repo (with `main`'s tools list), and a second that adds a tool with `outputs_ship: false` (or Qwen-Image-2.1) and expects a finding. The fixture repo's tools list is the real `assets/policy/studio-tools.json`, not the stand-in's (plan R-06). No change to `line.py` unless the brief fails for a reason the contract should fix (then fix the contract, not the check). **Tests**: `scripts/studio/test_line.py`.
- [ ] T009 [P] Docs check (FR-017, FR-018): read row V1 of `docs/data-flow-disclosure.md` and the "Visits whose avatar failed" panel's description in `deploy/grafana/dashboards/h4-runtime.json`; confirm each already covers an avatar file by its path and by its failure, and write the confirmation (with the lines read) into the note. Edit neither unless one is wrong, and say so. **Tests**: `test/disclosure.test.ts` (run only, no change expected).

## Phase 4: Close

- [ ] T010 The stack's note and the one full run: `make lint`, then `make check` once (CLAUDE.md "Verifying your work"); paste both whole into `docs/merge-requests/2026-11-14-feat-021-dinosaur.md`, with: what is built, what waits on the studio's round and his look approval (plan §6), `human-patches/021.md`, the seven provisional answers and that the morning page holds them, and the shared-file note for the dog's spec. A failure in an untouched test is reported with the evidence. **Tests**: the full suite, by this task only.

## Dependencies

T001 → T002 → T003 → {T004, T005} → T006 → T007; T008 and T009 are independent of T003 to T007 after T001; T010 last. One line, one implementer.
