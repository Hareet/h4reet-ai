---

description: "Task list for spec 009, The Room's Avatars"
---

# Tasks: The Room's Avatars

**Input**: the documents in `specs/009-room-avatars/`: spec.md (FR-001 to FR-043, SC-001 to SC-014, Amendments M1 to M21), plan.md (decisions R-01 to R-19, §3's data and interfaces, §4's branches and lanes, §5's tests, the Author's runs L1 to L5, and the tests that pin today's state, §5.4; the consistency check at its end).

**Prerequisites**: the Author accepts the intent and approves the spec and the plan (T000). Until then no task below starts but the Author's own intake (Phase A), which is his to begin whenever he likes: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`." The spec's answers Q1 to Q5 and defaults D1 to D10 were taken provisionally under the Author's "Let's finish this and keep going until you can" (2026-11-08); a no to any of them changes the FRs it names, and the tasks that build them, before those tasks start.

**Tests**: required. The constitution's workflow writes tests with or before code. In each phase the test tasks come first and must fail (RED) before the code that makes them pass (GREEN); the branch's note records both runs. Every check runs inside `make test`.

**Organization**:
- **Two lines of work** (plan §4.1). The Author's intake, `feat/009-avatar-intake` from `main`, holds Phase A and merges on its own, before or after the code. `feat/009-room-avatars`, from `feat/008-walking`'s tip, holds Phases 1 to 5 and merges after `feat/008-walking`.
- **If the night ends after Phase 1**, T043 and T044 run for Phase 1 alone, and Phases 2 to 5 continue on `feat/009-avatar-handoff`, from Phase 1's tip, which merges after it.
- **The phases**: A, the Author's intake (User Story 7); 1, both avatars at their places (User Stories 1 and 2, with User Story 6's checks; the MVP); 2, the hand-off between the avatars (User Story 3); 3, walking with the avatar (User Story 4); 4, the phone and the lighter tiers (User Story 5); 5, polish.
- **Parallel lanes** (plan §4.2): tasks marked [P] touch files no unfinished task of their phase touches, so agents can take them in worktrees of their own, one per agent that writes, the commits cherry-picked onto the branch in task order. Agents never merge.
- **The branch ends** with a review by an agent that wrote none of it, then a merge-request note, `docs/merge-requests/<date>-feat-009-room-avatars.md`, in spec 002's notes' form, holding `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s.

## Format: `[ID] [P?] [Story?] Description (branch)`

- **[P]**: can run in parallel with the other [P] tasks of its group.
- **[USn]**: the user story of a story phase.
- **"Author:"** opens a task only the Author does, in his own terminal, on his devices, or on `main`. Agents never do these steps, and never write under `assets/`.
- **Check** ends each task: what proves it done.
- **The branch** ends each task.

## Path conventions

- The room's workspace is `apps/web/`: data in `room/`, the compositor in `build/room/`, the shared kernel in `src/room/compose/`, the 3D runtime in `src/room/scene/`, the lookdev page in `src/lookdev/`, and tests in `test/room/` (Node), `test/ui/` (jsdom), and `test/lookdev/`. Test GLBs come from `test/helpers/glb.ts`, built at run time.
- "R-nn" is plan.md §1's decision; "§" is plan.md's section; "L1" to "L5" are plan.md §5.3's runs; "M-nn" is the spec's amendment; "D-n" its default.
- Files that exist only on `feat/008-walking` (`src/room/scene/figure.ts`, `scene/walking.ts`) are named as that branch has them; T009 confirms them.

---

## Before any phase

- [ ] T000 Author: accept or close the intent (`specs/009-room-avatars/intent.md`); answer Q1 to Q5 and D1 to D10, or let the provisional answers stand; approve spec.md and plan.md; gate and merge `spec/009-room-avatars` (documents only) with `tools/gates/gate spec/009-room-avatars` from main's checkout and the merge command it prints. Check: the intent's Status line reads accepted, and the Author's answers are recorded in the spec's Clarifications in his words (main)

---

## Phase A: The Author's Intake of the Woman and the Man (User Story 7, P1; beside Phase 1)

**Goal**: the woman's and the man's files on `main`, through the arrival check, with nothing that fails the gate.

**Independent Test**: spec.md User Story 7's.

- [ ] T001 Author: L4, before anything is committed: from each folder's `HANDBACK.md` and records, the facts plan §5.3 lists: the source type (a prompt or a design, never a photo), `likeness: false`, every model, tool, library, and hosted service with its license and version, the bone names (ADR 0010's `mixamorig:` names), which hand "idle-holding" and "take" use, the facing (+z), the origin at the feet, the rest pose, and each clip's length. `HANDBACK.md` and `SHA256SUMS` stay out of the repository's asset folders (rule A3 refuses any file there but PNG, JPEG, WebP, GLB, `records.json`, and `LICENSE.md`). Check: the facts in the intake note's "Facts" section, a fact that differs from the spec's Assumptions marked for a session to record in plan.md §10 (the Author's devices)
- [ ] T002 Author: every license and version the records name is in `main`'s `assets/policy/licenses.json`, reading yes on FR-013's three terms, public distribution among them, since the files will sit in a public repository; any missing entry by his own commit on `main` first (rule A9 refuses a branch that changes `assets/policy/`). No approval is needed in `approvals.json` for a visitor avatar from a prompt or a design (rule P1); one recorded as a likeness or from a photo can't be the stand-in (FR-014). Check: rule L1 passes in T003's run (main)
- [ ] T003 Author: on `feat/009-avatar-intake`, from `main`: the eight files at their repository names, `assets/visitors/woman/woman.glb`, `woman-idle.glb`, `woman-idle-holding.glb`, `woman-take.glb`, and the man's alike (plan R-02), each scrubbed with `make assets-scrub FILE=<path>`; each folder's `LICENSE.md`, copied from `assets/visitors/LICENSE.md` with its copyright line filled as `assets/room/LICENSE.md` fills it (rule N1 refuses a placeholder); each folder's `records.json` (`directory` the folder, the model's kind `avatar` and each clip's `animation`, `likeness: false`, a prompt or design source by an opaque ID, every step with its models and tools, `models_checked`, the media license, and any hosted service with its `disclosure_row`); where a step used a hosted service, its row in `docs/data-flow-disclosure.md` in the same commit (spec 003 FR-040(c); an agent may draft the row from T001's facts if he asks); and `make assets-credits`. Check: `tools/gates/arrival_check.py` over the two folders reports 0 findings, and its size table and first visit go in the note (feat/009-avatar-intake)
- [ ] T004 Author: commit; `make check ENGINE_MODE=none-yet` in that worktree; `npm run room:report -w apps/web`, pasted into `docs/merge-requests/<date>-feat-009-avatar-intake.md` with T003's lines. Check: `make check` passes; the report's RK3 line is under its cap with the largest visitor avatar counted, and its first visit under 25,000,000 bytes (feat/009-avatar-intake)
- [ ] T005 A reviewer agent's `REVIEW.md` "Arriving assets" pass over `feat/009-avatar-intake`, at the Author's request, in a session that wrote none of it: each record against its file, FR-017's original characters resembling no real person, nothing that locates anyone, and the licenses the records name. Check: the verdict in the intake's note (feat/009-avatar-intake)
- [ ] T006 Author: gate `feat/009-avatar-intake` from main's checkout and merge it with the command the gate prints, before or after `feat/009-room-avatars` (plan §4.1). Check: `refs/heads/main` holds the branch's tip (main)

**Checkpoint**: the files are on `main`; the room shows them once the code branch merges.

---

## Phase 1: Both Avatars in the Room, at Their Places (User Stories 1 and 2, P1, with User Story 6's checks) 🎯 MVP

**Goal**: the chosen avatar in the visitor's figure and the stand-in in the twin's, standing, scaled, on the floor, playing their idles, with their fallbacks, the stand-in line, the event, its panel, and the disclosure; the hand-off as today, the avatars swapping in when it ends (D4).

**Independent Test**: spec.md User Stories 1, 2, and 6's.

### Setup

- [x] T007 Make the worktree: `git worktree add -b feat/009-room-avatars <new folder> feat/008-walking`; then `npm ci --ignore-scripts --cache "$TMPDIR/npm"` in it. Commit before any pause, since `/tmp` is wiped when WSL restarts. Check: `git -C <folder> rev-parse HEAD` prints `feat/008-walking`'s tip, and `git -C <folder> status --short` prints nothing (feat/009-room-avatars)
- [x] T008 Cherry-pick `spec/009-room-avatars`'s commits, oldest first, so `specs/009-room-avatars/plan.md` is in the branch's tree and a departure updates it in the same commit; resolve a conflict in an index file by keeping both sides' lines, never by changing a document's words. Check: the four documents are in the tree, byte-identical to the spec branch's (feat/009-room-avatars)
- [x] T009 Read the base: `src/room/scene/figure.ts`'s driver interface, `scene/walking.ts`, `stage.ts`'s `Stage3D`, `events.ts`'s kinds with spec 008's `walk_started`, and §7.8 with spec 008's panel, as `feat/008-walking` has them; record any difference from plan §3.6 and R-16 in plan.md §10. Check: §10 holds the differences, or "none at T009" (feat/009-room-avatars)

### Tests for User Stories 1, 2, and 6 (first, RED)

- [x] T010 [P] [US1] [US2] Extend `apps/web/test/room/schema.test.ts`, `compose.test.ts`, `budgets.test.ts`, `report.test.ts`, and `data-only.test.ts`, with avatar fixtures from `test/helpers/glb.ts` (a skinned model with `mixamorig:`-named bones, and animation-only clips), extended to build them (FR-009, FR-011, FR-012, FR-014, FR-024, FR-037, FR-038, FR-040; plan §3.1, §3.2, §3.5; SC-003, SC-008 to SC-010): the `figures` block's defaults and ranges (RD2, RD3); RI8 refusing a stand-in outside the table in every build; RA1 to RA4, each with a known-bad fixture, refused in a strict build and left out in a lenient one with its figure on its fallback; RA5 reported, never refused; the 3D part's `figures` resolved and `avatars` with each file's URL, SHA-256, bytes, and decoded texture memory; the copy's `twin.stand_in` line first; RK3 with the stand-in term and decoded sizes, and a fixture over the cap; RK5 with a fixture over phase 3, strict and lenient; the report's lines; a tree spy that sees no read under `assets/twin/` to bundle the stand-in; two builds byte-identical; data-only: the stand-in to `woman`, `texture_px` to 512, `wait_ms` to 0, with no source file changed; a tree with no avatar files composing with both fallbacks. Check: RED (feat/009-room-avatars)
- [x] T011 [P] [US1] [US2] Write `apps/web/test/room/avatars.test.ts`, Node, three's objects and no renderer (FR-002, FR-003, FR-008, FR-015 to FR-018, FR-025, FR-026; R-04 to R-09; SC-001, SC-005): an avatar in its figure's picture group, the fallback's meshes hidden, and back on `null`; the origin at the placement, the lowest point within 0.5 cm of the floor, the height within 1% of 1.58 m for the woman and 1.75 m for the twin's man, the facing within 1° of the placement's turn; a model in centimetres placed as one in metres, and a degenerate height treated as a failed parse; the camera and the pick areas unchanged by a swap; two instances of one avatar with their own skeletons, sharing geometry and textures; the idle looping while the motion store animates, and the first frame held, with no crossfade, while it doesn't; a failing idle leaving the rest pose; the holding hand found from the clips, the right on a tie, the nearer hand with no "idle-holding", none with no hand bone; the kept paper attached to the holding hand after the hand-off and moving with "idle-holding"; a clip bound across three's name sanitizing (`mixamorig:Hips`). Check: RED (feat/009-room-avatars)
- [x] T012 [P] [US1] [US6] Extend `apps/web/test/room/loader.test.ts` (FR-002, FR-004 to FR-006, FR-015, FR-021, FR-022, FR-024, FR-031; R-03, R-11): avatar and clip entries with `integrity`, the 10-second timeout, one retry, and the fallback after it; the ledger's skip; clips fetched after their model; the room's models fetched only once both figures' files have settled; parse and swap after the hand-off; asset events keyed by the file's stem, `bytes` the copy's length; `stop()` skipping each avatar load that hadn't ended; below the floor, nothing fetched; one fetch for a file both figures show; images decoded at most `texture_px` a side, and half that at quality 1; the reload after a restored context. Check: RED (feat/009-room-avatars)
- [x] T013 [P] [US2] [US6] Write `apps/web/test/ui/avatars.test.ts`, jsdom with `test/helpers/room.ts`'s stand-in scene, and extend `test/room/live.test.ts` (FR-004, FR-010, FR-013, FR-029, FR-030, FR-032, FR-033, FR-035; SC-003, SC-004, SC-011): the stand-in line in the stage's note and first in "Around the room", in 3D and in 2D, as text a screen reader reads; spec 003's likeness line nowhere; the note passing a tap to the stage; `avatar_failed` sent once in a visit with a failed avatar file, and never for a skip, a missing file, below the floor, or in 2D; a visit in 2D from the start requesting no avatar file; the requests holding only the chosen avatar's and the stand-in's files; the frame log's `figure` and `clip` entries in a drafts build, and no log in a release build. Check: RED (feat/009-room-avatars)
- [x] T014 [P] [US6] Extend `apps/web/test/ui/degraded.test.ts` (FR-001, FR-002, FR-007; SC-002): with the live source off, the tier unknown, and the stubbed kill switch `degraded`, the avatars load and show as always; with a failing avatar the room stays usable, the AI disclosure and the stand-in line visible, and the list selecting every piece; the spies record no request but the avatar files and `avatar_failed`. Check: RED where it depends on Phase 1's code (feat/009-room-avatars)
- [x] T015 [P] The pinned and cross-cutting tests, plan §5.4 (FR-023, FR-029, FR-032, FR-036, FR-043; SC-011, SC-012): `apps/web/test/room/dist.test.ts` (each `a/*.glb.gz` a room model's or a bundled avatar file's copy, computed from the 3D part); `test/serving.test.ts` (a fixture avatar's copies under `a/`, their header, hash, and length); `test/manifest.test.ts` (the event kinds with `avatar_failed` after `walk_started`); `test/room/generated.test.ts` (the committed `config/room-events.yaml`); `test/disclosure.test.ts` (row V1's Carries names the avatar files and that their paths show the choice; row V4's Trigger names `avatar_failed`'s); `services/gateway/test/integration/room-events.test.ts` and `unit/room-events-config.test.ts` (204 to `{"kind": "avatar_failed"}`, counted with `id="-"`, and 400 with an `id`); `deploy/scripts/test_web_image.py` (the `visitor-assets` context exactly when the folder is the tree's own and no link; the Dockerfile's stage and copy before the build's `RUN`); `test/ui/a11y.test.ts` (axe with the note's line; the 320 × 568 model keeping the text box and the talk button on screen). The lookdev page's own requests change only when it loads avatars, in T035. Check: RED (feat/009-room-avatars)

### Implementation for User Stories 1, 2, and 6

- [x] T016 [US1] [US2] Add the avatars to the bundle (plan §3.1, §3.2; R-01, R-02, R-12): `apps/web/build/room/avatars.ts` (new: the folders, records, reader, measures, and the bundled set), `build/room/schema.ts` (the optional `figures` block), `build/room/emit.ts` (the 3D part's `figures` resolved and `avatars`; the copy's line first), `build/room/policy.ts` (`main`'s `per_asset.avatar` and `per_asset.animation`), `src/room/compose/bundle.ts`'s types, `src/choice/avatars.ts` (the clip roles; its header comment, M3), and `apps/web/room/scene.yaml` writing the block out (`twin_stand_in: man`, `texture_px: 1024`, `wait_ms: 1500`). Lanes B, C, and E start from these. Check: T010's schema and bundle cases pass; the index stays under 16 KB (feat/009-room-avatars)
- [x] T017 [US1] [US2] Add the checks and the report (plan §3.5; R-19): `build/room/checks/ra.ts` (new: RA1 to RA5), RI8's stand-in in `checks/ri.ts`, RK3's figures and RK5 in `checks/rk.ts`, the RA family and RK5 in `checks/family.ts`, `ra` before `rk` in `build/room/compose.ts`'s `FAMILY_ORDER`, and FR-040's lines in `build/room/report.ts`. Check: T010 passes (feat/009-room-avatars)
- [x] T018 [P] [US1] After T023, so row V1 precedes the flow: write each bundled avatar file's `.glb.gz` copy into `dist/a/` from `apps/web/build/room/plugin.ts`, with the room's pako call (R-15). Check: T015's dist and serving cases pass (feat/009-room-avatars)
- [x] T019 [US1] [US2] Write `apps/web/src/room/scene/avatars.ts` (R-04 to R-09): the figures' controllers, placement and scale, the instances (`SkeletonUtils.clone`), the mixer and clips, the still pose, the holding hand, and the kept paper's parent. Check: T011 passes (feat/009-room-avatars)
- [x] T020 [US1] [US6] Extend `apps/web/src/room/scene/loader.ts` (R-03: the entry kinds, `loadFigures`, the figures promise the room's models wait on, the clip path) and `src/room/scene/gltf-images.ts` (R-11: the decode cap). Check: T012 passes, and the loader's existing cases pass (feat/009-room-avatars)
- [x] T021 [US1] [US2] Wire the avatars into the 3D stage: `apps/web/src/room/scene.ts` (the figures' controllers and loader entries from the 3D part, the chosen avatar, and the stand-in; the mixers advanced by the motion store; disposal; the reload after a restore), `src/room/stage.ts` (the outcomes the stage reports), and the stand-in scene in `apps/web/test/helpers/room.ts`. Check: T011 and T012 pass; the existing scene tests pass (feat/009-room-avatars)
- [x] T022 [US2] Say the stand-in, and send the event (R-13, R-14): `twin.stand_in` in `apps/web/src/room/ui-keys.ts` and `apps/web/room/ui-words.yaml`; the note's second paragraph in `src/room/layout.ts` and its style, with `pointer-events: none`, in `src/room/room.css`; the copy's line in `src/room/text-copy.ts`; in `src/room/app.ts`, the line from the index's `copy`, `avatar_failed` once a visit from the stage's outcomes, and the `figure` and `clip` events in `src/room/signals/frame-log.ts`. Check: T013 and T014 pass; the compositor's UI-word checks (RT12) pass (feat/009-room-avatars)
- [x] T023 [P] [US1] In one commit, before T018 and T025: `avatar_failed` in `apps/web/src/room/events.ts`'s `EVENT_KINDS` after `walk_started`; `config/room-events.yaml` regenerated by the build; rows V1 and V4 in `docs/data-flow-disclosure.md` (Amendment M6); spec 002's contracts left as they are, the amendment being this spec's M4. Check: T015's event, generated, disclosure, and gateway cases pass (feat/009-room-avatars)
- [ ] T024 [P] In one commit (FR-034): §7.8's panel "Visits whose avatar failed" and its bullet in `specs/000-local-foundations/contracts/telemetry.md` (Amendment M1), and the panel in `deploy/grafana/dashboards/h4-runtime.json`. Check: `deploy/scripts/test_dashboard.py` passes in `make test` (feat/009-room-avatars)
- [x] T025 [P] [US1] After T023: the `visitor-assets` named context in `deploy/scripts/web_image.py`, and the empty stage with its copy to `/src/assets/visitors/` in `apps/web/Dockerfile` (R-15; Amendment M19). Check: T015's web-image case passes (feat/009-room-avatars)
- [ ] T026 [P] The figures' catalog text: the comments and `work_order.method` of `apps/web/room/catalog/twin-figure.yaml` (the stand-in avatar; still no model, RI8) and `visitor-figure.yaml` (the chosen avatar's model, or its flat shape), and the work orders regenerated in the same commit. Check: `test/room/generated.test.ts` passes (feat/009-room-avatars)
- [ ] T027 Record the entry and lazy chunks' gzipped sizes before and after, the report's RK3 and first-visit lines, and any departure in `specs/009-room-avatars/plan.md` §10, in the commit that makes it. Check: the entry chunk within spec 002's 150 KB and the index within 16 KB; `make lint` reports zero warnings (feat/009-room-avatars)

**Checkpoint**: both avatars stand in the room, with their fallbacks and the stand-in line; the panel counts failures. If the night ends here, T043 and T044 run for Phase 1 (Organization).

---

## Phase 2: The Hand-Off Between the Two Avatars (User Story 3, P2)

**Goal**: the room waits at most `wait_ms` for both avatars, then plays the hand-off hand to hand, with "idle-holding" and "take".

**Independent Test**: spec.md User Story 3's.

- [ ] T028 [P] [US3] Write `apps/web/test/room/avatar-handoff.test.ts`, Node, three's objects (FR-019, FR-020; R-10; SC-006): with both avatars ready, the sheet starts in the twin's holding hand and ends within 2 cm of the visitor's, tracking it; the visitor's "take" ends as the hand-off ends, then "idle-holding"; the twin's "idle-holding" until progress 0, then its idle; the turns and the 4.5-second length as today; reduced motion: 1 s, no turn, no clip motion, the crossfade, and cuts at the start and the end; one avatar late, its figure's anchor used and the avatar swapping in after. Check: RED (feat/009-room-avatars)
- [ ] T029 [P] [US3] Write `apps/web/test/ui/handoff-wait.test.ts`, jsdom (FR-019; SC-006): the hand-off starts when both figures are ready, or at `wait_ms` after the mount, whichever comes first; at once when no avatar loads or the device is below the floor; its line announced at its start; within spec 002's SC-005 bound. Check: RED (feat/009-room-avatars)
- [ ] T030 [US3] Build the rigged hand-off (R-10): `Stage3D.figures` in `apps/web/src/room/stage.ts` and `src/room/scene.ts`; the parse gate in `src/room/scene/loader.ts`; the hand ends in `src/room/scene/bundle3d.ts`'s `showHandoff`; "take" and the twin's holding in `src/room/scene/avatars.ts`; the wait in `src/room/app.ts`; and the stand-in scene's `figures` in `apps/web/test/helpers/room.ts`. Check: T028 and T029 pass; Phase 1's tests pass (feat/009-room-avatars)

**Checkpoint**: the hand-off plays between the avatars on the Author's machine; a slow device waits at most 1.5 s.

---

## Phase 3: Walking With the Avatar (User Story 4, P2)

**Goal**: the avatar takes spec 008's pose through its own driver, turned to its heading, sliding or walking, with the paper in its hand.

**Independent Test**: spec.md User Story 4's.

- [ ] T031 [P] [US4] Write `apps/web/test/room/avatar-driver.test.ts` (FR-028; R-16; SC-007): over seeded walks of 10,000 steps, the avatar at the pose's place, its heading within 1°, no mirror and no bob in any step, the paper within 2 cm of its holding hand; a walk clip weighted by speed where the avatar has one, and the slide in "idle-holding" or the idle where it has none; no clip motion while the motion store doesn't animate. Check: RED (feat/009-room-avatars)
- [ ] T032 [P] [US4] Extend `apps/web/test/room/walking.test.ts` (FR-028): the orchestrator using the avatar's driver while the avatar shows and the cut-out's on its fallback, switching on the next frame with the same pose when the picture changes mid-walk; leaving puts the avatar at its place, facing its placement's turn, with the paper. Check: RED (feat/009-room-avatars)
- [ ] T033 [US4] Add the avatar's driver beside the cut-out's in `apps/web/src/room/scene/figure.ts`, and the driver by picture in `src/room/scene/walking.ts` (R-16). Check: T031 and T032 pass; spec 008's walking tests pass (feat/009-room-avatars)

**Checkpoint**: the visitor walks as their avatar.

---

## Phase 4: The Phone and the Lighter Tiers (User Story 5, P3)

**Goal**: one avatar animating in the reduced tier; the lookdev page showing the avatars, for the Author's desktop and phone runs.

**Independent Test**: spec.md User Story 5's.

- [ ] T034 [P] [US5] Extend `apps/web/test/room/avatars.test.ts` and `test/room/quality.test.ts` (FR-024, FR-027; R-11, R-17; SC-005): at quality 1 or more only the twin's mixer advances and the visitor's holds its frame; textures decoded at half the cap; the controller holding through an avatar's swap. Check: RED (feat/009-room-avatars)
- [ ] T035 [P] [US5] Extend `apps/web/test/lookdev/page.test.ts` and `builds.test.ts` (FR-041, FR-043; R-18; plan §5.4): the page's own requests are the bundle's room models and avatar files, computed, never listed; the page shows the avatars in the figures from the bundle; its controls choose the visitor's avatar and the stand-in, play the hand-off normally and under reduced motion, and show each clip by role; its file picker takes an avatar's model and clips as candidates in memory only; drafts builds only. Check: RED (feat/009-room-avatars)
- [ ] T036 [US5] Pass the quality level to the avatars from `apps/web/src/room/scene.ts`'s `setQuality`, and animate one in `src/room/scene/avatars.ts` (R-17). Check: T034 passes (feat/009-room-avatars)
- [ ] T037 [US5] Show the avatars on the lookdev page: `apps/web/src/lookdev/stage.ts`, `controls.ts`, and `candidate.ts` (R-18). Check: T035 passes (feat/009-room-avatars)
- [ ] T038 Author: L1, lookdev on both reference stages (SC-001): each avatar's size, feet, facing, and rest pose; its idle; the holding hand and the paper's offset; the hand-off, normal and under reduced motion; the stand-in line; keep the defaults or change them as data (`texture_px`, `wait_ms`, the stand-in). Check: his verdict in the note's For the Author, or in a follow-up (the Author's devices)
- [ ] T039 Author: L2, the phone (SC-013): the lookdev phone copy with the avatars' files copied as candidates, the 2-minute run with both avatars animating: the median, the share of frames over 33 ms, and the settled quality. Check: SC-013's figures in the note (the Author's devices)

**Checkpoint**: the phone holds its frame rate, or the run says where it doesn't.

---

## Phase 5: Polish

- [ ] T040 [P] Write the ADR, "The room's avatars", status proposed, as `docs/adr/<the next free number>-the-rooms-avatars.md` (0039 and 0040 may be taken by specs 007 and 008 first; check `docs/adr/README.md` on the base), with its row in the index: the decision (the avatars through the room's bundle and loader; the stand-in as data, said plainly; the room's sizes with the boxes unchanged; the hand-off's wait; the clips by convention beside their model; the texture cap; the RA family) and its alternatives (the spec's Q1 to Q5 options). Check: `evals/docs_links.py`'s checks pass in `make test` (feat/009-room-avatars)
- [ ] T041 [P] Document the `figures` block, the avatars' convention, and the stand-in in `apps/web/room/README.md`. Check: `make test`'s docs checks pass (feat/009-room-avatars)
- [ ] T042 Record the chunks' gzipped sizes against T027's, the report's RK3 and first-visit lines, and any departure in `specs/009-room-avatars/plan.md` §10. Check: the entry chunk within 150 KB and the index within 16 KB; `make lint` reports zero warnings (feat/009-room-avatars)
- [ ] T043 Review `feat/009-room-avatars` with the reviewer agent (`.claude/agents/reviewer.md`) in a session that wrote none of it: every pass `REVIEW.md` holds, over the branch's diff from `feat/008-walking`'s tip (the cherry-picked documents apart); the implementing session fixes blockers test-first, and the reviewer re-reads the fix. Check: the verdict, for T044's note (feat/009-room-avatars)
- [ ] T044 Write `docs/merge-requests/<date>-feat-009-room-avatars.md`: what changed and why; the acceptance criteria; the constitution check; the cost and data-flow impact (rows V1 and V4); the RED and GREEN runs of T010 to T015, T028, T029, T031, T032, T034, and T035; the report; T027's and T042's chunk sizes; the review; the backlog; For the Author (L1 to L3 and L5; the merge after `feat/008-walking`; the ADR; M13's offered F3 patch; M14's texts; ADR 0010's status line against `caps.json`); `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s from this worktree. Check: the note is committed on the branch (feat/009-room-avatars)
- [ ] T045 Author: L3, spec 004's Q9 runs with the avatars: a keyboard-only visit, and a screen-reader visit that hears the stand-in line and chooses every piece from the list (SC-012). Check: his verdicts in the note (the Author's devices)
- [ ] T046 Author: L5, the demo: after the merges, `make up ENV=prod` from main's checkout; at the door choose the woman; watch the hand-off between the woman and the man; walk; select a piece and talk to the twin; read the stand-in line; then "2D view". Check: his verdict in a follow-up note (main)
- [ ] T047 Author: once `feat/008-walking` has merged, gate `feat/009-room-avatars` from main's checkout and merge it with the command the gate prints; accept the ADR or leave it proposed. Check: `refs/heads/main` holds the branch's tip (main)

---

## Dependencies & Execution Order

### Phase dependencies

- **T000** blocks every phase but Phase A, which is the Author's to start when he likes.
- **Phase A** (T001 to T006) needs nothing from the code; it merges on its own, before or after `feat/009-room-avatars` (plan §4.1).
- **Phase 1** (T007 to T027) needs T000 and `feat/008-walking`'s tip; it lands first.
- **Phases 2, 3, and 4** run in that order after Phase 1; Phase 3 needs Phase 1 only, so it can run beside Phase 2 in a lane of its own.
- **Phase 5** needs every story's phase.

### Within each phase

- Tests first, RED; then the code; a test task's check names the code task that turns it GREEN.
- Types before modules: T016 before T017 to T022 and T025.
- **The disclosure before the flow:** T023 lands before T018's copies and T025's web image, so row V1 is in the tree before any avatar is served (the plan's consistency check, A1).
- T015's pinned tests are RED before the code that changes what they pin (plan §5.4).

### Parallel opportunities

- Phase 1: T010 to T015 together; then T016 and T023, T024 together; after T016, T017, T019, T020, T022, T026 together, with T018 and T025 after T023; then T021; T027 last.
- Phase 2: T028 and T029 together; then T030.
- Phase 3: T031 and T032 together; then T033. Phase 3 can run beside Phase 2.
- Phase 4: T034 and T035 together; then T036 and T037; the Author's T038 and T039 after them.
- Phase A runs beside Phase 1 throughout.

## Parallel Example: Phase 1

```text
Agent A, worktree wt-009-compose:  T010, then T016, then T017
Agent B, worktree wt-009-runtime:  T011 and T012, then T019 and T020 (after T016)
Agent C, worktree wt-009-dom:      T013 and T014, then T022 (after T016)
Agent D, worktree wt-009-signals:  T015's event, disclosure, and dashboard cases, then T023 and T024
Agent E, worktree wt-009-serving:  T015's dist, serving, and web-image cases, then T018 and T025 (after T023)
The phase's session cherry-picks A to E in task order, then T021, T026, and T027.
The Author, beside them: T001 to T006 on feat/009-avatar-intake.
```

## Implementation Strategy

- **MVP first**: Phase 1 alone is the Author's "put in one of the visitors as my twin as a stand-in": both avatars stand in the room, with the line that says what the twin's figure is; stop and validate it with the intake's files before the hand-off.
- **Then the hand-off**, which is what makes the two figures a scene, then walking, then the phone.
- **The answer to "Is that possible for you to get to by the time I wake up?"**, in order of work: Phase 1 shows the woman and the man in the room once both the code and the Author's intake are in; Phase 2 adds the hand-off between them; Phase 3, walking. Every step stands on `feat/008-walking`'s tip, and the files on the Author's intake.
