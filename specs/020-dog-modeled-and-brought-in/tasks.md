> **Approved provisionally by the Author's order of 2026-11-13**, in his words: "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog." And: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". Q1 to Q5 and D1 to D5 stand as taken, his to confirm or overturn on the morning page.

> **Reworked** 2026-11-14 on Opus 5.5 (rule 6), after rv-spec-020, with the decision page's Q67 to Q70 ("Answered: recommended, the Author 2026-11-13"): Q1 and Q2 reworked, Q6 added, D3 reworked. impl-020 was past T005 on the line (T007 at c169da96) when this landed, so T001 to T008 stand as written, and the rework's code is **T014 to T019**, appended after T013, test-first, each with its small run. T009 to T011, not yet started, are edited in place (the `run` clip; no photo path; the round from step 2). T013 still runs last, after T019.

---
description: "Task list for spec 020, the dog modeled and brought in"
---

# Tasks: Dog Modeled and Brought In

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Prerequisites**: `main` at 3c0e4cd0 or later with this branch merged first (plan §6).

**Tests**: required, test-first. Each RED task's tests are written and seen to fail before its GREEN task begins. A test pinning behaviour a requirement here changes changes in the same commit as the code (plan R-04); no other existing test is edited.

**Rules for every task**: agents edit nothing under `assets/**`, `assets/policy/**`, `corpus/`, `.claude/**`, `tools/gates/**`, `evals/agent-config/**`, or `redteam/forbidden-actions.sh`, and read no photo or studio folder. **Small tests only** (the Author's order, rule 4): a task runs the test files it adds or changes plus those covering what it changes (`npx vitest run <files>` from `apps/web`), and `make lint`, and pastes them into its notes. `make check` runs once, in T013. A failure in an untouched test is reported with evidence (passes alone; the stack doesn't touch it), not chased; `twin-2d.test.ts` is known flaky under load. A departure from the plan updates `plan.md` in the same commit. The implementer never reviews.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: The gate (US2), the bundle (US1)

### Tests first (RED)

- [ ] T001 [US2] Write `apps/web/test/room/likeness-visitor.test.ts`: on the fixture tree with `avatarFolder("dog", …)` (test/helpers/room-avatars.ts) and a model recorded `likeness: true`, `source.type: "photo"`: (a) no approval → strict build finds RA9, lenient build bundles none of the dog's files, `scene.avatars.dog` undefined; (b) an approval with `disclosure_line` null or `""` → same; (c) an approval for another SHA-256 → same; (d) a matching approval with a line → model, idle, walk bundled, the entry's `line` equal to it; (e) a clip of an unbundled model is not bundled; (f) a non-likeness avatar (the man) is unaffected, no approval needed; (g) the stand-in avatar recorded as likeness still fails RA3, not RA9. Run: `npx vitest run test/room/likeness-visitor.test.ts` fails. Covers FR-002, FR-003, SC-001.

### Implementation (GREEN)

- [ ] T002 [US2] In `apps/web/build/room/avatars.ts` and `build/room/checks/family.ts` (RA9 beside RA6; `lineFor`'s parameter loosened to anything with a `sha256`; `Avatar` gains `line`), with `checks/ra.ts`'s header comment: add RA9 to `readAvatars` as plan R-01 has it, reusing `lineFor`; put `line` on the avatar's entry; leave RA3 and the twin's RA6 as they are. Run `likeness-visitor.test.ts`, `avatars-compose.test.ts`, `twin-compose.test.ts`, `compose.test.ts` (rule table; change only a pin RA9 moves), `avatars.test.ts`, and `make lint`.
- [ ] T003 [US1] In `apps/web/src/room/compose/bundle.ts` and `build/room/emit.ts`: the bundle's `avatars.<id>.line` (optional); `build/room/report.ts`: the dog's lines (files, bytes, texture memory, whether an approval holds, RA9's reason). Tests: extend `likeness-visitor.test.ts` with the bundle's shape and `report.test.ts`'s cases for the lines (new cases in a new file `test/room/dog-report.test.ts` if `report.test.ts` pins a whole report). Run those, `avatars-compose.test.ts`, `report.test.ts`, `make lint`.

**Checkpoint**: the compose holds the gate; no runtime change yet.

---

## Phase 2: The dog in the scene (US1)

### Tests first (RED)

- [ ] T004 [P] [US1] Write `apps/web/test/room/dog-avatar.test.ts` on spec 009's fake stage and generated GLBs (test/helpers/glb.ts): a quadruped fixture (four legs, a tail above the back, no hand bone) scaled to 0.62 m by its rest pose's precise bounds (the fixture's tail stays under its head's top, as FR-012 asks of the studio's model), lowest point on the floor, facing +z (FR-001); `walk` plays while walking, the idle with the slide where no walk clip (FR-005); no hand bone: the paper stays at the anchor, no throw, the idle plays through the hand-off (FR-008); a model failing in each way of spec 009's FR-002 leaves the cut-out and one `avatar_failed` (FR-006, SC-003); reduced motion plays no walk. Run: fails where behaviour is missing; where it already passes, it is a pin and says so in its header.

### Implementation (GREEN)

- [ ] T005 [US1] Make T004 pass. Expected: no change in `src/room/scene/avatars.ts` or `figure.ts` beyond what a failing case shows; any change lands with its case, and plan R-03 is updated in the same commit. Run `dog-avatar.test.ts`, `avatar-scene.test.ts`, `avatar-loader.test.ts`, `avatar-handoff.test.ts`, `make lint`.

**Checkpoint**: the dog's files, once approved and bundled, show.

---

## Phase 3: The line (US3)

### Tests first (RED)

- [ ] T006 [P] [US3] Write `apps/web/test/room/dog-line.test.ts`: the copy carries the visitor-line slot (`{visitor_line: true}`) after the twin's; the room fills it with the bundle's line while the visitor's figure shows the dog model and leaves it empty and hidden otherwise (cut-out shown, avatar failed, visitor chose another); the text is in the room's note and in "Around the room" as text a screen reader reads; the 320 × 568 layout adds no line while the cut-out shows. Run: fails.

### Implementation (GREEN)

- [ ] T007 [US3] `build/room/emit.ts` (the slot, after `twin_line`), `src/room/compose/bundle.ts` (the type), `src/room/text-copy.ts` (fills it). Change the compose tests that pin the copy's order in the same commit, the pin only (plan R-04). Run `dog-line.test.ts`, `compose.test.ts`, `text.test.ts`, `likeness-visitor.test.ts`, `make lint`.
- [ ] T008 [US3] Wire the visitor figure's picture signal to the slot: `src/room/scene/avatars.ts` (signal), `src/room/stage.ts`, `src/room/app.ts`, as far as T006 needs. Run `dog-line.test.ts`, `avatar-scene.test.ts`, `mount.test.ts`, `stages.test.ts`, `make lint`.

**Checkpoint**: US1 to US3 pass on fixtures.

---

## Phase 4: The Author's look (lookdev), the studio's brief, the human patch

- [ ] T009 [P] [US4] Write `apps/web/test/lookdev/avatars-view.test.ts` (RED): `lookdev.yaml`'s `avatars: [dog]` lists the dog; the view draws it at rest, at its idle's first frame, and at its walk's and its run's middle frames (each where the clip exists; `run` from T017), beside the man at the table's heights; a missing model, clip, or skeleton says why; it measures nothing; RI10-style validation holds each name to the avatar table. Run: fails.
- [ ] T010 [US4] Build the Avatars view: `src/lookdev/avatars.ts` (sharing `hands.ts`'s drawing where it can), `page.ts`, `stage.ts`, `apps/web/room/lookdev.yaml` (`avatars: [dog]`; the file's schema check updated if it has one). Run `avatars-view.test.ts`, `page.test.ts`, `test/room/schema.test.ts`, `make lint`. If this runs long, drop it with a named note in the stack's note and plan R-05's fallback (he judges the model in a glTF viewer); T009 is dropped with it.
- [ ] T011 [P] [US4] Write `docs/studio/avatar-dog.md`: the round's brief as plan §5 has it, starting at step 2: what must be true before it is queued (his reviewed concept image in the studio's inbox, after patch 020's items 1 and 2), inputs (that concept image only), outputs (`dog.glb`, `dog-idle.glb`, `dog-walk.glb`, `dog-run.glb`, the records: the model `likeness: true`, `source.type: "photo"`, the clips `likeness: false`), the tools and models by their ids from main's list, the model's rules (FR-012, FR-013, caps from `assets/policy/caps.json`), what stops the round (FR-010), and the hand-back. **It names no photo, no photo's path, and no folder holding photos** (spec FR-011; REVIEW.md's room-data pass reads `docs/studio/`); the photos are "his photos, in the photos folder", by role, as the photo guide names folders. Check it with `git grep -n "photos/" -- docs/studio/avatar-dog.md` (no match). Run `make lint`.
- [ ] T012 [P] Read `docs/data-flow-disclosure.md` and add one sentence only if the dog changes a row's account (plan §5): the likeness reaching Anthropic when a session reads the file. Check `docs/merge-requests/human-patches/020.md` lists every human-only change (it exists from the spec step). Run `make lint`.

---

## Phase 5: The close

- [ ] T013 The one full run, after T019: `make check` in the stack's worktree after the stack's merges, its whole output in `docs/merge-requests/<date>-spec-020-dog.md` (the stack's note: what was built by task, the questions with their recommended answers and where each is taken, the C5 conflict (spec Assumptions; Q6), what waits for him: items 1 to 7 of patch 020, his look approval, his intake). A failure in an untouched test is reported with the evidence, not chased. Then `/speckit-converge` against the spec, and the review by a worker that wrote none of it (REVIEW.md).

---

## Phase 6: The rework (rv-spec-020; Q69, Q70), appended after T013 and done before it

Each RED task's tests are written and seen to fail before its GREEN task begins. Small runs only (rule 4), from `apps/web` unless said.

### The line wherever the model shows (US3; FR-007; plan R-02)

- [ ] T014 [US3] (RED, after T008) Write `apps/web/test/room/likeness-line-anywhere.test.ts` on `src/room/likeness-line.ts`'s holder (not yet written) and on `app.ts` with the text copy, as `dog-line.test.ts` mounts it: (a) a picture signal carrying a line from a figure other than the visitor's (a test key standing in for spec 025's dog figure) shows the line, with the visitor on another avatar; (b) the visitor's and that figure's signals both carrying the line show it once, one entry in "Around the room" and one in the stage's note; (c) one of them dropping it (its next picture signal with no `line`: the fallback, a failure) keeps it while the other holds; (d) both dropping it takes it away, no element left; (e) the twin's line slot is unchanged throughout; (f) a 2D room shows no line. Run `npx vitest run test/room/likeness-line-anywhere.test.ts` (fails).
- [ ] T015 [US3] (GREEN) Write `src/room/likeness-line.ts` (the pure holder: each figure's latest line or none; the line while any holds one) and feed it every figure's picture signal in `src/room/app.ts`, where T008 feeds only the visitor's; `showVisitorLine` takes the holder's line. Update the slot's doc comment in `src/room/compose/bundle.ts` and `src/room/text-copy.ts` (the likeness line of any visitor-avatar model the room shows; the name `visitor_line` stays, plan R-02). Run `test/room/likeness-line-anywhere.test.ts`, `test/room/dog-line.test.ts`, `test/ui/text-copy.test.ts`, `test/room/mount.test.ts`, `test/room/stages.test.ts`, and `make lint`.

### The `run` role (FR-012, FR-017; plan R-03)

- [ ] T016 [US1] (RED) Write `apps/web/test/room/dog-run.test.ts`: (a) `CLIP_ROLES` ends `"walk", "run"`; (b) a `dog` folder (`avatarFolder`, test/helpers/room-avatars.ts) with `dog-run.glb` and a matching approval composes `run` among the dog's clips, after `walk`, counted and capped as the others (RA4) and refused for a bone its model lacks (RA2); (c) with no approval, `run` is not bundled (RA9, only with its model); (d) the loader fetches `dog-run.glb` only when the visitor chose the dog, with its other clips; (e) on the fake stage, the visitor's dog plays `walk` while walking, never `run`, and the idle with the slide where there is no walk clip even if `run` exists; (f) the loaded instance holds the `run` clip by its role, for spec 025's figure; (g) the man's and woman's bundles are unchanged. Run `npx vitest run test/room/dog-run.test.ts` (fails).
- [ ] T017 [US1] (GREEN) Add `"run"` after `"walk"` to `CLIP_ROLES` in `src/choice/avatars.ts`, and whatever T016 shows is still missing in `build/room/avatars.ts`, `src/room/scene/loader.ts`, or `src/room/scene/avatars.ts` (expected: none beyond the list). A test pinning the closed list's entries changes that pin only, in the same commit (plan R-04); name each in the commit message. Update `docs/studio/avatar-dog.md` if T011 is done. Run `test/room/dog-run.test.ts`, `test/room/avatars.test.ts`, `test/room/avatars-compose.test.ts`, `test/room/likeness-visitor.test.ts`, `test/room/avatar-loader.test.ts`, `test/room/avatar-scene.test.ts`, `test/room/avatar-driver.test.ts`, `test/room/avatar-gait.test.ts`, `test/room/dog-avatar.test.ts`, and `make lint`.

### The credit (FR-014; Q6; plan R-08)

- [ ] T018 [P] [US4] (RED) Write `scripts/assets/test_credits_likeness.py`: (a) an entry with `likeness: true` in a record whose directory is `assets/visitors/dog` renders "- A likeness of the Author's dog: yes", and no line says "A likeness of the Author: yes"; (b) the same entry with `likeness: false` renders "- A likeness of the Author's dog: no"; (c) entries of `assets/twin`, `assets/visitors` (the man's, the woman's), and a room directory render exactly as today; (d) `credits.py --check` passes on the committed tree (no committed credit changes). Run, from the repository's root, `pytest scripts/assets/test_credits_likeness.py` (fails).
- [ ] T019 [P] [US4] (GREEN) In `scripts/assets/credits.py`: the likeness line's subject by the record's directory, from a small table (`assets/visitors/dog` → "the Author's dog"; otherwise "the Author"), passed to `entry_lines`. Run `pytest scripts/assets/test_credits_likeness.py scripts/assets/test_credits.py` and `make lint`.

**Checkpoint**: the line follows the model to any figure; `run` is bundled and loaded for spec 025; the credit names the dog.

## Dependencies

T001 → T002 → T003. T004 → T005 (independent of T001 to T003 except for the fixture helper). T006 → T007 → T008 (needs T003's bundle type). T009 → T010 (T009's run frame needs T017). T011 and T012 are parallel. T008 → T014 → T015. T016 → T017. T018 → T019 (parallel with the rest). T013 last, after T019.

## Parallel lanes (if the line splits)

Lane A: T001 to T003, then T006 to T008 (the build and the line). Lane B: T004 and T005 (the scene). Lane C: T009 to T012 (lookdev and docs). From the rework: T014 and T015 join lane A after T008; T016 and T017 join lane B; T018 and T019 touch only `scripts/assets/` and run beside any lane. Lanes A and B touch no common file but `avatars.ts` under `build/` and `scene/`, which differ.

## Not tasks (waits for him; plan §5; human-patches/020.md)

Moving the photos into the photos folder, and saying whether any session read them (patch 020, item 1); the concept image from them, reviewed, in the studio's inbox (item 2); the studio round, queued only after item 2; the intake of `assets/visitors/dog/**`; his look approval; the approval entry; the tools list if a tool is needed; C5's words, if he wants them changed (item 7). The room's dog figure and the run are spec 025's.
