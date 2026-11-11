---

description: "Task list for spec 016, the twin's own avatar"
---

# Tasks: The Twin's Own Avatar

**Input**: [spec.md](spec.md), [plan.md](plan.md), [contracts/twin-data.md](contracts/twin-data.md), [contracts/twin-states.md](contracts/twin-states.md)

**Prerequisites**: the branch `feat/016-the-twins-own-avatar` at the Author's intake commit 6821d121, with this folder committed at its base; `main` at 0d2e3247 or later.

**Approved to build** (the Author, 2026-11-10, after the session told him the spec, plan and tasks were being written and that the build would follow): "I want you to keep going and build it!". Q1 to Q5 and D1 to D12 stand as taken, still provisional: his to overturn at lookdev or after.

**Tests**: required. Every story is test-first: each RED task's tests are written and seen to fail before its GREEN tasks begin, and a GREEN task ends with its RED tests passing. A test that pins today's behaviour, which a requirement here changes, changes in the same commit as the code (plan.md R-18); no other existing test is edited.

**Rules for every task**: agents edit nothing under `assets/**`, `assets/policy/**`, `corpus/`, `.claude/**`, or `tools/gates/**`, and read no studio folder; `make check` runs in the worktree as `make check ENGINE_MODE=none-yet` after `npm ci --cache $TMPDIR`, its whole output pasted; a departure from the plan updates `plan.md` in the same commit. The implementer never reviews.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 to US10, spec.md's user stories

---

## Phase 1: Setup

**Purpose**: record the base and bring in the lettering's sources.

- [x] T001 Record the base: in the worktree, `npm ci --cache $TMPDIR`, then `make check ENGINE_MODE=none-yet`, and paste the whole output into the draft note `docs/merge-requests/2026-11-10-feat-016-the-twins-own-avatar.md`. Expect RK3 to fail, the twin's model counted at its own size, about 215,109,289 of 200,000,000 (plan.md R-02, K1); note any other failure as a finding before going on.
- [x] T002 The session that commits, not the implementer: copy `twin-shirt-lettering.svg` and `twin-shirt-lettering.json` byte for byte from the hand-back folder into `apps/web/content/lettering/`, check each SHA-256 against the hand-back's `SHA256SUMS` (`8344c745…` and `50be0e72…`), and commit them alone. The brief, `HANDBACK.md`, and the previews stay out. No studio folder is read (spec D3; plan.md K9).
- [x] T003 [P] Add `apps/web/content/lettering/` to `.prettierignore`, beside `apps/web/content/room/outlines/`, so the delivered bytes are never reformatted.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the policy's fourth file, the twin's files read and checked, RK3 green again, the bundle's types, and serving. No story starts before this phase ends.

### Tests first (RED)

- [x] T004 [P] RED: in `apps/web/test/room/policy.test.ts`, the likeness approvals are read from `ROOM_POLICY_DIR/approvals.json`, else `refs/heads/main:assets/policy/approvals.json`, else the tree's `assets/policy/approvals.json`, in that order; a malformed file is no approvals; and `build/approvals.ts`'s `POLICY_FILES` lists four files with `approvals.json` last, the digest covering all four (contracts/twin-data.md §5).
- [x] T005 [P] RED: in `deploy/scripts/test_web_image.py`, `approvals.json` is among the policy context's files and the label's digest, in `POLICY_FILES`' order; a tree whose `assets/twin` is a directory of its own is handed over as the named context `twin-assets`, and one that is a link, or absent, isn't.
- [x] T006 [P] RED: new `apps/web/test/room/twin-compose.test.ts`, the reading: `readTwin` over a fixture tree and over this branch's tree finds `twin.glb`, the five clips, and `still.png` by the convention, computed from the tree, never listed (spec 009 FR-043); RA1, RA2, RA4, and RA5 over the twin each refuse their known-bad fixture under `apps/web/test/fixtures/room/bad/` (new `RA1-twin`, `RA2-twin`, `RA4-twin`, `RA5-twin`) in a strict build and leave the file out in a lenient one.
- [x] T007 [P] RED: in `twin-compose.test.ts`, RA6: a fixture policy with no approval for the model's hash, one for an older hash, and one with an empty `disclosure_line` each refuse a strict build naming RA6 and leave all the twin's files out in a lenient one; with the fixture approval, the index's `twin.line` equals its `disclosure_line`; and no file under `apps/web/src/` or `apps/web/room/` holds the line's text (SC-003).
- [x] T008 [P] RED: in `twin-compose.test.ts`, RK3 counts the twin as the larger of its model at `figures.twin.texture_px` and the stand-in's files at `texture_px`, and RK5 counts the room's served files, the twin's served GLBs, and the largest of the four visitor folders; the default scene with this branch's tree passes both; new fixtures `bad/RK3-twin` and `bad/RK5-twin` are refused (SC-008).
- [x] T009 [P] RED: in `apps/web/test/room/schema.test.ts`, the `figures.twin` block's schema and defaults (contracts/twin-data.md §1), and RI8 refusing an unknown state, an unknown clip role, and a `lean.against` that isn't a `work-desk` placement.
- [x] T010 [P] RED: in `apps/web/test/room/bundle.test.ts`, the index's `twin` (`line`, `still`) and the 3D part's `twin` (`model`, `clips`, `block`), null without the twin's files; the copy holds `{twin_line: true}` where it held `{line: "twin.stand_in"}`, the pinned copy-order assertion changing in this commit (plan.md R-18); and in `apps/web/test/room/dist.test.ts`, the served names `a/twin.<hash16>.glb`, `a/twin-<role>.<hash16>.glb` (gzip-9 copies, each gunzipping to its plain file's bytes, so the IPTC mark reaches the visitor, FR-017), and `a/twin-still.<hash16>.png` (plain); a build with no `assets/twin/` builds, its index's and 3D part's `twin` null (FR-048).

### Implementation (GREEN)

- [x] T011 Per plan.md R-02, in `apps/web/build/room/checks/rk.ts`: RK3's twin term at the twin's decoded side and RK5's count; `make check` is green on RK3 again (T008).
- [x] T012 Per plan.md R-03, in `apps/web/build/room/policy.ts`, `apps/web/build/approvals.ts`, and `apps/web/build/policy.ts`: the likeness approvals and the policy's fourth file (T004).
- [x] T013 Per plan.md R-03 and R-04, in `deploy/scripts/web_image.py`, `apps/web/Dockerfile`, and `.dockerignore`: `approvals.json` in the policy context and its digest; the tree's `assets/policy/approvals.json` copied beside `caps.json`; the `twin-assets` named context copied to `/src/assets/twin/` (T005).
- [x] T014 Per plan.md R-01, `readTwin` in `apps/web/build/room/avatars.ts`, read once a compose as `avatarsOf` is; `TWIN_CLIP_ROLES` and `TWIN_STATES` exported from new `apps/web/src/room/scene/twin-states.ts` (types and lists only for now) (T006).
- [x] T015 In `apps/web/build/room/checks/ra.ts` and `checks/family.ts`: RA1, RA2, RA4, and RA5 over the twin; RA6 registered as lenient-warns, strict-refuses (contracts/twin-data.md §7) (T006, T007).
- [x] T016 In `apps/web/build/room/schema.ts` and `checks/ri.ts`: the `figures.twin` block with `FIGURES_DEFAULTS`, and RI8's twin cases (T009).
- [x] T017 In `apps/web/src/room/compose/bundle.ts` and `apps/web/build/room/emit.ts`: the index's `twin` with the line, the 3D part's `twin`, the copy's `{twin_line: true}`, and `figures.twin_height` from the catalog (T010).
- [x] T018 In `apps/web/build/room/plugin.ts`: the twin's served copies and names (T010).
- [x] T019 In `apps/web/build/room/report.ts`: the twin's lines, the line's approval and source, RK3's and RK5's figures with the twin (contracts/twin-data.md §8), asserted in `twin-compose.test.ts`.
- [x] T020 Run `make check ENGINE_MODE=none-yet`; paste the output in the note. Checkpoint: the twin's files are read, checked, counted, and bundled with the line; nothing shows them yet.

---

## Phase 3: User Stories 1 and 2 - The Twin's Own Figure, and Nothing Breaks (Priority: P1) 🎯 MVP

**Goal**: the twin's model at its place and size with its line, the stand-in as its fallback, every fault ending in a working room.

**Independent Test**: spec.md User Stories 1 and 2.

### Tests first (RED)

- [x] T021 [P] [US1] RED: new `apps/web/test/room/twin-figure.test.ts`: the twin's instance unscaled, lowest point within 0.5 cm of the floor, height within 1% of the measured 1.82 m, root within 0.5 cm of the placement, facing within 1° (SC-001); shown only once its model and idle have ended; with the visitor's choice of the man, the visitor shows the man and the twin the twin; the line slot says the twin's line while the model shows and the stand-in line before (SC-003, contracts/twin-states.md §4); every mesh of the instance has no morph attribute after `model()` (SC-009); its textures decode at most `figures.twin.texture_px` a side, half at quality 1.
- [x] T022 [P] [US2] RED: new `apps/web/test/room/twin-faults.test.ts`: for each of FR-002's faults on the model, the capsule at once, the stand-in's files requested then and not before, the stand-in shown once ready, at the catalog's new height within 1% (FR-011), the stand-in line throughout, one `avatar_failed` in the visit; each of the twin's files' asset events recorded with its served stem and sent only while `live.asset_events` is `site` (FR-049); with the twin left out of the bundle, the stand-in fetched at once as spec 009 has it (FR-044); the stand-in failing too keeps the capsule with no second event; a failing clip plays the idle in its state's place; a failing idle stands the model still; a fall to 2D stops the 3D loads, recording them skipped; a lost and restored context shows the twin again from the cache; the kill switch `degraded`, the tier off or unknown, and the live source off change nothing for the twin (SC-002).
- [x] T023 [P] [US1] RED: new `apps/web/test/room/twin-network.test.ts`: in a 3D visit, the twin's files requested once each, same-origin, with integrity, the model and the chosen avatar's model first, then the clips; the stand-in's files 0 times unless the model failed or the visitor chose them; a visit below the floor or 2D from the start requests none of the twin's 3D files (SC-011).
- [x] T024 [P] [US1] RED: in `apps/web/test/ui/hud-notes.test.ts` and `apps/web/test/ui/loading-notes.test.ts`, the pinned "the stand-in line always shows" assertions become the line rule of contracts/twin-states.md §4, changed in the commit of T029 (plan.md R-18); in `apps/web/test/ui/avatars.test.ts`, the twin figure's height and placement become 1.82 m and z 0.469, changed in the commit of T030.

### Implementation (GREEN)

- [x] T025 [US1] Per plan.md R-05, in `apps/web/src/room/scene/loader.ts`: `twinEntries`, `figureEntries`' order with the twin's model in the stand-in's place, and `standInEntries`, which the stage calls only after the twin's model reports `failed` (T023).
- [x] T026 [US1] In `apps/web/src/room/scene/avatars.ts`: the twin's source keyed `"twin"`; the twin figure wanting `"twin"`, else the stand-in; `instanceFor` unscaled for the twin; the morph strip before cloning (plan.md R-07); the decode side from the block (T021).
- [x] T027 [US2] In `apps/web/src/room/scene/avatars.ts` and `apps/web/src/room/scene.ts`: the fallback chain, the twin's failure switching the figure to the stand-in, the stage fetching `standInEntries` then, `avatar_failed` once, the context's restore (T022).
- [x] T028 [US1] In `apps/web/src/room/stage.ts` and `apps/web/src/room/scene.ts`: `Stage3D.expected` with the twin's entries and the chosen avatar's (spec 012; contracts/twin-data.md §4).
- [x] T029 [US1] In `apps/web/src/room/layout.ts`, `apps/web/src/room/app.ts`, and `apps/web/src/room/text-copy.ts`: the one line slot and `{twin_line: true}`, swapped on each picture signal (contracts/twin-states.md §4), with T024's pinned note tests changed in this commit.
- [x] T030 [US1] Data edits, per plan.md R-06: in `apps/web/room/catalog/twin-figure.yaml`, `size.h` and `origin.bounds` from the model's measured rest pose in the report, z extended back by 0.1 m, `standin` and `drawing` scaled to the new height; in `apps/web/room/scene.yaml`, the `twin-figure` offset `[0.78, 0, 0.469]`, an estimate; T024's pinned figure test changed in this commit. Run `make check` and paste RG5's, RG6's, and spec 014's protection lines (plan.md K2).
- [x] T031 [US1] Run `make check ENGINE_MODE=none-yet`; paste. Checkpoint: the MVP; the twin shows, falls back, and says the right line.

---

## Phase 4: User Story 3 - The Twin Moves With the Conversation (Priority: P1)

**Goal**: the five states, from the panel's activity, playing the block's clips, with the lean against the desk.

**Independent Test**: spec.md User Story 3.

### Tests first (RED)

- [x] T032 [P] [US3] RED: new `apps/web/test/room/twin-states.test.ts`, on the fake clock: FR-021's order over a table of activities; `arriving` once, with `arrive` again doing nothing; the speaking time at 0.4 s a word clamped to 3 s and 20 s, within 50 ms, restarted by a new answer; `resting` at 20 s of quiet, within 50 ms, left on a draft, a turn, a selection, or an answer (SC-004).
- [x] T033 [P] [US3] RED: new `apps/web/test/ui/talk-activity.test.ts`: `onActivity` reports `draft` on input and on send, `turn` out and ended (answered, failed, stopped), `answer` with its word count only for the twin's answers, never for `cannot_talk`, `topic_not_ready`, a failure's message, or `turn_stopped`, and `selected` on a piece's selection; no activity carries a word, a topic, or a cost (contracts/twin-states.md §1).
- [x] T034 [P] [US3] RED: in `twin-figure.test.ts`, each state plays the block's clip; the greeting at the hand-off's start, or at the first show after it, once, and not again after a context's restore; crossfades of 0.25 s, and 0.4 s into and out of the lean, within one frame; cuts to the first frame with 0 clip motion under reduced motion, a pause, or a hidden page (SC-005); at quality 1 the twin animates and the visitor holds; the block's map changed to give the lean to `listening` plays it there; no clip moves the twin's placement node (FR-018); with the stand-in shown, the states don't apply and spec 009's clips play (FR-026).
- [x] T035 [P] [US3] RED: in `twin-compose.test.ts`, RA7: the default scene's twin within 1 cm and 1° of the lean's spot and with at least 0.45 m of desk to its right; fixtures `bad/RA7-moved-desk`, `bad/RA7-short-desk`, and `bad/RA7-turned` refused in a strict build, the lean left out in a lenient one; the report's lean line (SC-017).
- [x] T036 [P] [US3] RED: in `apps/web/test/room/data-only.test.ts`, the proof set (the lean given to `listening`, `rest_after_s` 10, `speak_wpm` 120, the twin's `texture_px` 512) builds with no source file read or changed (SC-014).

### Implementation (GREEN)

- [x] T037 [US3] `apps/web/src/room/scene/twin-states.ts`: `createTwinStates`, per contracts/twin-states.md §2 (T032).
- [x] T038 [US3] `apps/web/src/talk/talk.ts`: `onActivity` per contracts/twin-states.md §1 (T033).
- [x] T039 [US3] `apps/web/src/room/app.ts`, `apps/web/src/room/stage.ts`, and `apps/web/src/room/scene.ts`: the activity's path to the controller; nothing in 2D.
- [x] T040 [US3] `apps/web/src/room/scene/avatars.ts`: the twin's actions by role, the state's clip, the greeting's `finished`, the crossfade durations, cuts while the motion store doesn't animate (plan.md R-09) (T034).
- [x] T041 [US3] `apps/web/build/room/checks/ra.ts` and `checks/family.ts`: RA7; `apps/web/build/room/report.ts`: the lean line (T035).
- [x] T042 [US3] Data edit: `apps/web/room/scene.yaml`'s `figures.twin` block with the lean, `against: work-desk`, and the defaults written out with a comment naming spec 016's provisional answers (T035, T036).
- [x] T043 [US3] Run `make check ENGINE_MODE=none-yet`; paste. Checkpoint: the twin greets, listens, talks, idles, and rests.

---

## Phase 5: User Story 4 - The Paper Appears With the Visitor (Priority: P2)

**Goal**: with the twin's own picture, the paper fades in at the visitor's hand.

**Independent Test**: spec.md User Story 4.

- [x] T044 [P] [US4] RED: new `apps/web/test/room/twin-handoff.test.ts`: with the twin's model shown at the hand-off's start, 0 frames with the twin's sheet visible, the visitor's sheet's opacity equal to the progress, ending within 2 cm of the visitor's grip, the visitor in `idle-holding` from the start with no `take`, the twin in `arriving`, both figures turning as spec 002's turns have them (FR-027), the hand-off ending within 5 s and its announcement unchanged; under reduced motion, 1 s, no turns; with the stand-in at the start, `apps/web/test/room/avatar-handoff.test.ts`'s cases still pass unchanged; in 2D with the still, the paper appears too (SC-006).
- [x] T045 [US4] `apps/web/src/room/scene/bundle3d.ts`: `showHandoff`'s `mode` (contracts/twin-states.md §5).
- [x] T046 [US4] `apps/web/src/room/scene/avatars.ts`: the mode decided at the hand-off's first frame; the visitor's `idle-holding` from the start with no `take` in `appear`.
- [x] T047 [US4] `apps/web/src/room/flat.ts`: the 2D hand-off's `appear` mode while the still shows (T044).

---

## Phase 6: User Story 5 - The 2D Room Shows the Twin's Still (Priority: P2)

**Goal**: the still in the twin's place in 2D, with its line, and its fallback.

**Independent Test**: spec.md User Story 5.

- [x] T048 [P] [US5] RED: new `apps/web/test/room/twin-2d.test.ts`: the still fetched once with its integrity when the 2D room shows, never in a visit that stays in 3D; drawn as an SVG `image` with a `data:` URL, under the twin's box's `clipPath`, at the block's rectangle, `xMidYMin slice`; the twin's drawing hidden while it shows; the line slot the twin's; on a failure after one retry, the drawing and the stand-in line; the hit areas and the figures' boxes unchanged (SC-010).
- [x] T049 [US5] `apps/web/build/room/emit.ts`: the index's `twin.still` with its default rectangle (contracts/twin-data.md §1).
- [x] T050 [US5] `apps/web/src/room/flat.ts`: the still's fetch, its `data:` image, its clip, its fallback (plan.md R-11) (T048).

---

## Phase 7: User Story 6 - The Shirt's Lettering (Priority: P2)

**Goal**: the outline converted, drawn into the skinned face, behind the Author's approval.

**Independent Test**: spec.md User Story 6.

### Tests first (RED)

- [x] T051 [P] [US6] RED: new `apps/web/test/room/lettering.test.ts`: the committed `apps/web/content/room/outlines/twin-shirt-lettering.outline.json` equals `build/room/lettering.ts`'s conversion of the committed SVG and JSON, field for field; the converter refuses a foreign element, an `href`, another fill, and another view box, naming the element's index; the outline passes RT13 strict, its words inside the quotation marks of `intent-016` (SC-018).
- [x] T052 [P] [US6] RED: in `schema.test.ts`, `live_faces[].surface` with `quad` the default, `print` in the renderers' closed list, and RI8 refusing a `surface: model` face on a piece that isn't a figure's.
- [x] T053 [P] [US6] RED: new `apps/web/test/room/twin-shirt.test.ts`: the `print` renderer's canvas has ink only where the outline does and alpha 0 elsewhere; reading the face's `POSITION` and `TEXCOORD_0` from `assets/twin/twin.glb`, the vertex at the top-left as seen from the front receives the canvas's top-left texel under the texture's `flipY` (plan.md K3); the face's material, after the look's `Ink.prepare`, has `outlineParameters.visible` false and `alphaTest` 0.5; a drafts build's face carries the draft badge and "Around the room" marks the words; no quad is built for a `surface: model` face; with the stand-in, the capsule, or the 2D still showing, nothing is drawn for the shirt (FR-041) (SC-007).
- [x] T054 [P] [US6] RED: in `dist.test.ts`, a release build with a fixture policy that doesn't approve the outline leaves the face unbound and holds "Denver Local AI Solutions" as no string of `dist/`; with the fixture approval, the words are in the text copy, unmarked.

### Implementation (GREEN)

- [x] T055 [US6] `apps/web/build/room/lettering.ts` and the script `room:lettering` in `apps/web/package.json` (plan.md R-13) (T051).
- [x] T056 [US6] Run `npm run room:lettering -w apps/web` to write `apps/web/content/room/outlines/twin-shirt-lettering.outline.json` with D4's provisional `source` and `tool`, and paste its SHA-256 in the note (T051).
- [x] T057 [US6] `apps/web/build/room/schema.ts` and `checks/ri.ts`: `surface` and `print` (T052).
- [x] T058 [US6] New `apps/web/src/room/faces/print.ts` and its entry in `apps/web/src/room/faces/registry.ts` (T053).
- [x] T059 [US6] `apps/web/src/room/scene/faces3d.ts`: a `surface: model` face drawn into the twin instance's mesh `twin-shirt-lettering`, its material cloned, `map`, `alphaTest`, `flipY` as T053 found; `apps/web/src/room/scene/look.ts`: `Ink.prepare` leaving a face-surface material unlined (plan.md R-12) (T053).
- [x] T060 [US6] Data edits: `apps/web/room/catalog/twin-figure.yaml`'s live face (contracts/twin-data.md §2); `apps/web/room/scene.yaml`'s binding (§3); `apps/web/room/ui-words.yaml`'s `label.twin-shirt`, "The twin's shirt" (T052 to T054).
- [x] T061 [US6] Run `make check ENGINE_MODE=none-yet`; paste, with RG7's line for the face reported as atmosphere and RK3's canvas line.

---

## Phase 8: User Story 7 - The Credits Reach the Twin's Record (Priority: P2)

**Goal**: a toolbar link to a same-origin credits page.

**Independent Test**: spec.md User Story 7.

- [x] T062 [P] [US7] RED: new `apps/web/test/ui/credits.test.ts`: the build writes `credits/index.html` from `assets/CREDITS.md`, its first part a list of each `##` directory linking to its section's anchor; from the room, in 3D and 2D, by pointer and keyboard, "Credits" then the twin's entry reach the twin's records in 2 activations (SC-012); the HUD's compact bar holds the tile at every stage of spec 014's sweep (`apps/web/test/ui/hud-model.test.ts`'s budgets) (plan.md K5).
- [x] T063 [US7] New `apps/web/build/credits.ts`, registered in `apps/web/vite.config.ts` as `build/disclosure.ts` is (plan.md R-14).
- [x] T064 [US7] `apps/web/src/room/layout.ts`: the `toolbar.credits` tile with the `credits` icon after "How data flows" (T062). If T062's budget test can't hold it, D9's fallback, a link in "Around the room", and `plan.md` updated in the same commit.

---

## Phase 9: User Story 8 - The First Visit, the Loader, and the Phone (Priority: P3)

**Goal**: the loader counts the twin; lookdev shows it all.

**Independent Test**: spec.md User Story 8.

- [x] T065 [P] [US8] RED: new `apps/web/test/ui/twin-loading.test.ts`: the loader's expected files include the twin's by their served bytes; a stand-in fetched after the twin fails counts for nothing; the progress reaches 100 only when every expected file has ended.
- [x] T066 [US8] `apps/web/src/room/stage.ts`: any gap T065 finds after T028.
- [ ] T067 [P] [US8] RED: in `apps/web/test/lookdev/` (its stage's tests), the lookdev page plays each twin state, shows the lean, plays the hand-off normally and under reduced motion with the paper appearing, shows the shirt marked, and shows the 2D still with its line (FR-057).
- [ ] T068 [US8] `apps/web/src/lookdev/stage.ts` and `apps/web/src/lookdev/controls.ts`: FR-057's controls and views (T067).

---

## Phase 10: User Story 9 - The Scrub's Mark for the Twin (Priority: P3, backlog)

**Goal**: `scrub.py --record` writes the mark the arrival check wants under `assets/twin/`.

**Independent Test**: spec.md User Story 9.

- [x] T069 [P] [US9] RED: in `scripts/assets/test_scrub.py`, a `records.json` fixture with `"directory": "assets/twin"` and mixed model and hand steps gives `trainedAlgorithmicMedia`; `"assets/twin/sub"` and `"docs/research/images"` too; `"assets/room"` with the same steps still gives `compositeWithTrainedAlgorithmicMedia` (SC-015). Fixtures use no 64-hex values.
- [x] T070 [US9] `scripts/assets/scrub.py`: `term_from_record` reads `directory` first (plan.md R-16); the module's docstring updated (T069).

---

## Phase 11: Polish and cross-cutting concerns

- [x] T071 [P] RED: in `deploy/scripts/test_dashboard.py`, the "Visits whose avatar failed" panel's description names the twin's files; GREEN in `deploy/grafana/dashboards/h4-runtime.json` (FR-051).
- [x] T072 [P] RED then GREEN: in `twin-figure.test.ts`, the drafts build's frame log records the twin's pictures, states, and clips, and a release build keeps none; in `apps/web/src/room/signals/frame-log.ts` and `scene/avatars.ts` (FR-052).
- [x] T073 [P] `docs/data-flow-disclosure.md`: row V1's wording (spec.md's Data-Flow Disclosure Entries), in this branch, which first serves the files (FR-053).
- [x] T074 [P] RED then GREEN: in `apps/web/test/ui/a11y.test.ts`, 0 WCAG 2.2 AA violations with the twin, the line, the shirt's copy, and the Credits link; the 320 × 568 model keeps the text box and the talk button on screen (SC-016).
- [x] T075 [P] `apps/web/room/README.md`: how to remap the twin's states, tune the lean, move the twin, and change the still's rectangle as data; and the twin's files' roles.
- [x] T076 Build the Author's approval patch for the shirt from plain copies, per plan.md §5 step 2: `git show refs/heads/main:assets/policy/content-approvals.json` into the scratch folder, a second plain copy with C-0004 added (the outline's path, its SHA-256 from T056, the kind `room-text`, `"<the day you apply it>"`, `"<your words>"`), and `git diff --no-index` between them into `docs/merge-requests/2026-11-10-room-text-twin-shirt.patch`. Never `git apply`, and no write into any worktree's `assets/policy/`. Check it applies to a fresh plain copy and adds exactly one entry (SC-018).
- [x] T077 The merge-request note `docs/merge-requests/2026-11-10-feat-016-the-twins-own-avatar.md`: what changed by story; the five provisional answers and twelve defaults with their options; the report's RK3, RK5, first-visit, line, and lean lines; the outline's SHA-256 and D4's provisional provenance for his yes or no; ADR 0010's offered words (spec M26); the optional gate patch (plan.md R-03); his steps as short wrap-proof lines (plan.md §5); and `make check ENGINE_MODE=none-yet`, `make lint`, `make test`, and `make evals` (or `make check` where `make evals` can't run), each output pasted whole.

---

## Phase 12: Review, the Author's lookdev, his approval, and the gate

- [x] T078 Review: a reviewer agent that wrote none of this branch runs `REVIEW.md`'s passes over `git diff main...feat/016-the-twins-own-avatar`: Bugs, Security, Compliance against this spec, plan, and the constitution, Cost & telemetry, Arriving assets (the intake's files at the base), and Room data (the scene, the catalog, the UI word, the outline, and the lettering's sources). Its findings go in the note; Important findings are fixed by the implementer, test-first, and reviewed again.
- [ ] T079 [US10] **Author**: lookdev L1 to L5 (plan.md §8) on a drafts build: the twin's place, height, and line; no morph memory; the lean against the desk with nothing through him; the phone run; the shirt, marked. His yes or no to each provisional answer and default; a no changes the branch before the gate.
- [ ] T080 [US10] **Author**: his yes or no to D4's outline provenance; then he applies `docs/merge-requests/2026-11-10-room-text-twin-shirt.patch` on `main` himself (before or after the gate; a release build leaves the shirt plain until then).
- [ ] T081 [US10] **Author**: the one gate, `tools/gates/gate feat/016-the-twins-own-avatar`, from `main`'s checkout, covering the intake, this spec, and the code; then his merge.

## Phase 13: The Author's lookdev findings (T079, 2026-11-11)

His words: "the right arm bends inverted when leaning on the desk, and the twin's left foot and arm can sometimes go thru the wall. Everything else looks good". plan.md R-19 measures both and records the fix.

- [x] T082 RED: in a new `apps/web/test/room/twin-reach.test.ts`, the twin's reach (plan.md R-19): `build/room/reach.ts`'s measure of each sampled frame equals three's own skinning of the delivered model, along each direction, for the rest pose and every clip; this branch's room passes RA8, with the report's reach line, and the placement the lookdev saw, 12 cm to the twin's left, crosses the right wall; in fixtures, a clip's turn past a side wall, the rest pose past the back, and a clip the twin doesn't play, each as RA8 reads it, strict and lenient; no RA8 where RA6 leaves the twin's own model out, or where the shell names no side wall.
- [x] T083 GREEN: `apps/web/build/room/reach.ts` (the rest pose and each clip the twin plays, every 1/30 s, skinned as three skins them, exactly, against the shell's side walls and back), RA8 in `checks/ra.ts` and `checks/family.ts` (lenient: a lenient build warns and keeps the twin), and the report's reach line in `report.ts`.
- [x] T084 Data: the twin's placement 12 cm to its left in `apps/web/room/scene.yaml` (x 0.78 to 0.66), so every sampled frame stays at least 2.5 cm inside the right wall, the lean's desk still behind it; the pinned tests that hold its place, and `room/README.md`.
- [x] T085 The right elbow's inversion in the lean (plan.md R-19): measured, not patched; baked in `desk-lean.glb`, so the Author chooses between the lean off for this release (a data edit) and the studio's re-export through his intake. The merge-request note records the evidence and the choice.
- [ ] T086 RED: the Author's answer of 2026-11-11, "Lean off for now (Recommended)": in `twin-compose.test.ts` and `twin-reach.test.ts`, the default scene with no lean (the block's lean null, the report's no-lean line, the map's resting clip kept), RA8 sampling four clips, not the lean; and the lean's data line put back (`test/helpers/room-twin.ts`'s `withLean`) still passing RA7 and RA8 at the twin's place, for its return with the studio's re-export.
- [ ] T087 GREEN: `figures.twin.lean` out of `apps/web/room/scene.yaml`, its comment saying why; spec.md's Q1 answered; plan.md R-19 with his words; `desk-lean.glb` stays bundled and untouched in `assets/twin/`, since FR-009 bundles every recorded clip and the room plays the idle in the lean's place (FR-029).

---

## Dependencies and execution order

### Phase dependencies

- **Setup (T001 to T003)**: none. T002 is the committing session's.
- **Foundational (T004 to T020)**: after Setup; blocks every story. T011 first among the GREEN tasks: it turns RK3 green.
- **US1 and US2 (T021 to T031)**: after Foundational; the MVP.
- **US3 (T032 to T043)**: after US1 (it drives the twin's instance).
- **US4 (T044 to T047)**, **US5 (T048 to T050)**, **US6 (T051 to T061)**, **US7 (T062 to T064)**: after US1; independent of each other. US4's 2D half (T047) after US5's T050.
- **US8 (T065 to T068)**: after US1; T067 and T068 after US3 to US6 for what lookdev shows.
- **US9 (T069, T070)**: independent of everything; can run first.
- **Polish (T071 to T077)**: after the stories it touches; T076 after T056.
- **The end (T078 to T081)**: in that order, after Polish.

### Within each story

RED before GREEN; a GREEN task ends with its RED tests passing and `make check` pasted at the story's checkpoint.

### Parallel opportunities

- T003 with T001; T004 to T010, all RED, in parallel; T069 and T070 at any time.
- After US1: US4, US5, US6, and US7 by different agents in their own worktrees (the hand-off and the 2D still touch `flat.ts` in order: T050 before T047).
- Within US6: T051 to T054 in parallel.

## Parallel example: User Story 6

```bash
Task: "RED lettering.test.ts (T051)"
Task: "RED schema.test.ts's surface and print (T052)"
Task: "RED twin-shirt.test.ts (T053)"
Task: "RED dist.test.ts's release absence (T054)"
```

## Implementation strategy

### MVP first

Setup, Foundational, then US1 with US2: the twin shows, at its size and place, with its line, and falls back. Stop and run the checkpoint. That alone ships the Author's likeness honestly.

### Incremental delivery

US3 (the states and the lean), then US4 to US7 in any order, then US8 and US9, then Polish, the review, his lookdev and approval, and the gate. The shirt can ship unapproved, plain, and light up when his patch lands on `main`.

## Notes

- Total: 87 tasks. By story: Setup 3; Foundational 17; US1 and US2 11; US3 12; US4 4; US5 3; US6 11; US7 3; US8 4; US9 2; Polish 7; the end 4; the lookdev's findings 6. Ticked on 2026-11-11, with the lookdev's fixes: every task done but T067 and T068 (plan.md §9) and the Author's T079 to T081.
- Test files new in this spec: `twin-compose`, `twin-figure`, `twin-faults`, `twin-network`, `twin-states`, `twin-handoff`, `twin-2d`, `twin-shirt`, `lettering` (under `apps/web/test/room/`), `talk-activity`, `credits`, `twin-loading` (under `apps/web/test/ui/`).
- Pinned tests changed with their code: T010's copy order, T024's notes and figure (plan.md R-18).
