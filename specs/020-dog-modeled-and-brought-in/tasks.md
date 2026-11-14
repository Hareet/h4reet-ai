> **Approved provisionally by the Author's order of 2026-11-13**, in his words: "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog." And: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". Q1 to Q5 and D1 to D5 stand as taken, his to confirm or overturn on the morning page.

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

- [ ] T009 [P] [US4] Write `apps/web/test/lookdev/avatars-view.test.ts` (RED): `lookdev.yaml`'s `avatars: [dog]` lists the dog; the view draws it at rest, at its idle's first frame, and at its walk's middle frame, beside the man at the table's heights; a missing model, clip, or skeleton says why; it measures nothing; RI10-style validation holds each name to the avatar table. Run: fails.
- [ ] T010 [US4] Build the Avatars view: `src/lookdev/avatars.ts` (sharing `hands.ts`'s drawing where it can), `page.ts`, `stage.ts`, `apps/web/room/lookdev.yaml` (`avatars: [dog]`; the file's schema check updated if it has one). Run `avatars-view.test.ts`, `page.test.ts`, `test/room/schema.test.ts`, `make lint`. If this runs long, drop it with a named note in the stack's note and plan R-05's fallback (he judges the model in a glTF viewer); T009 is dropped with it.
- [ ] T011 [P] [US4] Write `docs/studio/avatar-dog.md`: the round's brief as plan §5 has it: inputs (his concept image, handed back; no photo path in the repo), outputs (`dog.glb`, `dog-idle.glb`, `dog-walk.glb`, the records), the tools and models by their ids from main's list, the model's rules (FR-012, FR-013, caps from `assets/policy/caps.json`), what stops the round (FR-010), and the hand-back. Run `make lint`.
- [ ] T012 [P] Read `docs/data-flow-disclosure.md` and add one sentence only if the dog changes a row's account (plan §5): the likeness reaching Anthropic when a session reads the file. Check `docs/merge-requests/human-patches/020.md` lists every human-only change (it exists from the spec step). Run `make lint`.

---

## Phase 5: The close

- [ ] T013 The one full run: `make check` in the stack's worktree after the stack's merges, its whole output in `docs/merge-requests/<date>-spec-020-dog.md` (the stack's note: what was built by task, the questions with their recommended answers and where each is taken, what waits for him: items 1 to 5 of patch 020, his look approval, his intake). A failure in an untouched test is reported with the evidence, not chased. Then `/speckit-converge` against the spec, and the review by a worker that wrote none of it (REVIEW.md).

## Dependencies

T001 → T002 → T003. T004 → T005 (independent of T001 to T003 except for the fixture helper). T006 → T007 → T008 (needs T003's bundle type). T009 → T010. T011 and T012 are parallel. T013 last.

## Parallel lanes (if the line splits)

Lane A: T001 to T003, then T006 to T008 (the build and the line). Lane B: T004 and T005 (the scene). Lane C: T009 to T012 (lookdev and docs). Lanes A and B touch no common file but `avatars.ts` under `build/` and `scene/`, which differ.

## Not tasks (waits for him; plan §5; human-patches/020.md)

The studio round; the intake of `assets/visitors/dog/**`; his look approval; the approval entries; the tools list if a tool is needed.
