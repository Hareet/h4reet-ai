---

description: "Task list for spec 014, the room after the demo"
---

# Tasks: The Room After the Demo — The Room Framed Under the HUD, a Newer Game Look, Walking From the Room's View, the Paper in the Hand, the Neon's Glow, the Chalkboard, the Placeholder Note, and the Sign's Proof

**Input**: the documents in `specs/014-room-after-the-demo/`: [spec.md](spec.md) (FR-001 to FR-068, SC-001 to SC-016, the Clarifications, amendments W1 to W18), [plan.md](plan.md) (decisions PD-1 to PD-24, §2 to §14, the risks R-1 to R-11, and the analyze pass at its end), [contracts/frame-area.md](contracts/frame-area.md), and [contracts/sign-check.md](contracts/sign-check.md).

**Prerequisites**: the Author approves the spec and the plan (T000). Until then no task below starts: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`." The intent was accepted by the Author on 2026-11-10 ("I accept the intent with your recommendations. go for it!"); "Overlay only", "Start from the room's view (Recommended)", and "One spec for all" are his final answers; Q1 to Q5 and D1 to D12 are taken under his acceptance, provisionally. The code starts only once spec 012's `feat/012-loading-screen` has merged (plan §15).

**Tests**: required. In each phase the test tasks come first and must fail (RED) before the code that makes them pass (GREEN); the branch's note records both runs. A task that only proves an existing rule passes at once, and the note says so. Every check but the sign's runs inside `make test` or `make check`; the sign's runs on a stack (T045, T051).

**Organization**:
- **One branch**, `feat/014-room-after-the-demo`, in its own worktree, cut from `refs/heads/main` after spec 012's merge (plan §15). The Author's "One spec for all": one gate, one merge.
- **The phases**: Setup; Foundational, the kernel and the degraded paths first (Principle I); User Story 1 (the frame, P1); User Story 9 (the faults, P1); User Story 2 (the HUD's page and look, P2); User Story 3 (walking, P2); User Story 4 (the grips, P2); User Story 5 (the glow, P2); User Story 6 (the board, P2); User Story 7 (the note, P3); User Story 8 (the sign's check, P2); then Polish, the review, the Author's lookdev check, and his patch and merge steps.
- **Parallel lanes**: tasks marked [P] touch files no unfinished task of their phase touches, so agents can take them in worktrees of their own, one per agent that writes, the commits cherry-picked onto the branch in task order. Agents never merge.
- **The branch ends** with a review by an agent that wrote none of it, then the Author's lookdev check, then his patch, gate, and merge.

## Format: `[ID] [P?] [Story?] Description (branch)`

- **[P]**: can run in parallel with the other [P] tasks of its group: different files, no dependency on an unfinished task.
- **[USn]**: the user story of a story phase. Setup, Foundational, and Polish tasks carry none.
- **"Author:"** opens a task only the Author does: in his own terminal, on `main`, in his browser, or on his devices. Agents never do these steps.
- **Check** ends each task: what proves it done. **The branch** ends each task.

## Path conventions

- The room: `apps/web/src/room/` (`compose/`, `walk/`, `scene/`, `scene.ts`, `fit.ts`, `flat.ts`, `layout.ts`, `app.ts`, `room.css`), `apps/web/src/talk/`, `apps/web/src/lookdev/`, `apps/web/build/room/`, `apps/web/room/`, `apps/web/test/`.
- "PD-n", "§n", and "R-n" are plan.md's; "Qn", "Dn", "FR-nnn", "SC-nnn", and "Wn" are the spec's.
- `test/room/legacy-stages.ts` (spec 005's frozen floor) is never changed.
- jsdom lays nothing out and draws nothing: layout facts are proven by `test/ui/hud-model.ts` (real text widths), geometry by the kernel's and the ribbon's tests, and the look by the Author's lookdev check and live look.
- No committed file holds a 64-hex value: a test computes a digest from its file at run time (plan §8).

---

## Before any phase

- [x] T000 Author: approve spec.md and plan.md, and say whether `spec/014-room-after-the-demo` merges on its own after its gate or travels at the base of `feat/014-room-after-the-demo`. Say yes or no to Q1 to Q5 and D1 to D12 as taken, or name the ones to change. Check: his answer is recorded here in his words, beside the spec's Clarifications; the spec's Status reads approved (spec/014-room-after-the-demo)
  - **Done 2026-11-10.** His words, after the session's summary of this spec and its question "Do you approve spec 014 and its plan as written, or do you want to read them first?": "You can go ahead and start the build of the spec." Q1 to Q5 and D1 to D12 stand as taken, still provisional, and T060 is where he can overturn any of them.
  - **The spec travels at the base of `feat/014-room-after-the-demo`, one gate for both.** This is the session's reading of his words of the same day: "Let's gropu them together to make them minimal and hand-merge if we have to".

---

## Phase 1: Setup

**Purpose**: the base confirmed after spec 012, the outside facts read, the ADR and the contract passages written down, and the fixtures in place.

- [x] T001 Create the worktree with `git worktree add -b feat/014-room-after-the-demo <new folder> refs/heads/main`, after reading `refs/heads/main`'s SHA and checking it holds spec 012's merge; run `npm ci --ignore-scripts --cache "$TMPDIR/npm"`; cherry-pick `spec/014-room-after-the-demo`'s commits if main lacks them. Then read and record in the note:
  - **The base**: spec 012's tests (`test/room/loading-*.test.ts`, `test/ui/loading*.test.ts`) pass; `npm run room:check`'s time and supported stage count; the entry chunk's gzip size.
  - **The twin's turn on dev-cpu** (R-4): from `services/gateway/src/routes/room-turn.ts` and the gateway's admission for the `twin` purpose, whether a turn with the local adapter unhealthy reaches dev's synthetic fallback and answers `route: "fallback"` with a cost above 0.
  - **The edge** (R-5): x005's rate limit for `POST /api/room/turn` in `deploy/edge/nginx.conf`, and its port on the internal network.
  - **The page's request**: the body `src/talk/turn-client.ts` sends for a selected piece, its `path` value for the engineer path.
  - **The rule IDs**: the next free RD and RG IDs for the glow's and the grip's rules (PD-16); the next free ADR number (D10); the next free content-approval id on main (FR-050).
  - **The hand bones**: the bone names under `mixamorig:RightHand` and `mixamorig:LeftHand` in the man's and the woman's models, read from the bundle the build emits (no file under `assets/` is opened for writing).

  Check: `git rev-parse HEAD` prints the base's full SHA; each item is recorded. Any item that differs from plan PD-2, PD-13, PD-16, PD-20, or §10 is a departure recorded in plan.md in the same commit, before any task builds on it (feat/014-room-after-the-demo)
- [x] T002 [P] Write ADR 0046 (or the next free number), status proposed, `docs/adr/00NN-the-room-framed-under-the-hud.md`, by plan §12, quoting "Overlay only", "Start from the room's view (Recommended)", "One spec for all", his addition, and his acceptance in his words, amending ADR 0043's decisions 2 to 4 by name, with its row in `docs/adr/README.md`. Check: `make test`'s docs-links check passes (FR-068) (feat/014-room-after-the-demo)
- [x] T003 [P] Amend the living interfaces, each passage marked "(spec 014)", by plan §13: spec 004's `contracts/room-data-files.md` §4 (`glows[]`: `path` and `spread`), §5 (the `figures` block's `grips`), §9 (`standin.avatar`), and §13 (the glow's and the grip's rules; §13.3's stages as frame areas, as spec 005's H10 left it), and its `contracts/lookdev.md` §6 (`ease`, `frame_css`, the hands view). Check: `make test`'s docs-links check passes; the reviewer (T052) reads each passage against the FRs it serves (feat/014-room-after-the-demo)
- [x] T004 [P] Write the fixtures: `apps/web/test/fixtures/room/skeleton.ts`, two skeletons of ADR 0010's bone names (the forearm, the hand, `…HandMiddle1`, `…HandThumb1`, and a finger chain for each hand) in the man's and the woman's proportions, and in a rest pose and an "idle-holding"-like pose; and `apps/web/test/fixtures/room/protect-scene.ts`, a composed scene with a selectable on each side wall, one at the desk's right, and the two figures where the scene places them. Check: each fixture builds in a test that only loads it (feat/014-room-after-the-demo)

**Checkpoint**: the facts are recorded, the ADR and the contracts carry the decision, and the fixtures exist.

---

## Phase 2: Foundational (the kernel and the degraded paths)

**Purpose**: the HUD's compact boxes and coverage, the frame area with its fallback, the protector, the stages at the frame areas, and the 2D drawing's area: everything the stories lay over. No story starts before this phase ends.

### Tests (RED)

- [x] T005 [P] Write `apps/web/test/room/hud.test.ts`'s new cases: `compactBoxes(screen, state, metrics)` gives `strip`, `bar`, `column` or `dock`, and `walk`; each compact box lies inside its band; the dock layout's compact boxes are its bands; the column sits at its band's foot (D8) and the bar at the foot's right (PD-6); the window's centre lies in no compact box at any screen of the sweep, so the follow camera's figure, centred in a frame area, is never under one (plan §5); `alwaysOnCoverage` is the union's area over the window's, the notes' reserve included (contracts/frame-area.md §1, §3). Check: the tests fail for want of the functions (FR-017, FR-019, FR-021) (feat/014-room-after-the-demo)
- [x] T006 [P] Extend `apps/web/test/ui/hud-model.ts` and `hud-model.test.ts`: measure, with the index's words and fontkit, the strip's one-line width, the bar's six tiles in one row, the notes' widest words (the three causes and `twin.stand_in`), and the column's content height with the log's rest height by PD-7's band; assert the table's bounds hold them (PD-4), and that `alwaysOnCoverage` is at most 0.25 on every landscape screen of the sweep from 1280 × 720 to 3840 × 2160 in the column layout. Check: the tests fail for want of the table's entries (FR-019, SC-003; D7, D12) (feat/014-room-after-the-demo)
- [x] T007 [P] Write `apps/web/test/room/frame.test.ts` by contracts/frame-area.md §2, §4, §8: `area(0)` is the window and `area(1)` the clear area; every `area(t)` holds the clear area at 1,000 random screens; with a stub protector that clears first at k, the result's ease is k ÷ 16, for every k; a protector that throws, and one that gives NaN, give the clear area with `fellBack`; at most 17 protector calls per call. Check: the tests fail for want of `compose/frame.ts` (FR-004, FR-009, FR-012, FR-013; D5) (feat/014-room-after-the-demo)
- [x] T008 [P] Write `apps/web/test/room/protect.test.ts`: over T004's scene, `protectorFor(scene).boxes(area)` gives each pressable selectable's 44 × 44 core part and each figure's projected framed box, in the window's pixels, as RG6 measures them; a selectable list-only at the clear area's frame is absent; the boxes for the room's own composed scene at the reference desktop's window are recorded in the test's snapshot. Check: the tests fail for want of `compose/protect.ts` (FR-010, FR-016; D6) (feat/014-room-after-the-demo)
- [x] T009 [P] Extend `apps/web/test/room/stages.test.ts` and `stages-floor.test.ts`, and add `apps/web/test/room/stages-checks.test.ts`'s cases: every supported stage is the frame area of its screen and state with the overlapping compact boxes as `reserved`; every frame area holds its clear area, so the legacy floor holds; RG6 reserves each `reserved` box (a fixture where a reserved box covers a core fails RG6 by name); each side-wall selectable's list-only stages are a subset of spec 005's. Check: the tests fail for want of the new stages (FR-060, FR-061, SC-002) (feat/014-room-after-the-demo)
- [x] T010 [P] Write `apps/web/test/room/flat-frame.test.ts`: `flatScale(area)` and the drawing's centre in the area; the 2D protector (the drawing's hit areas and its figures' drawn boxes) and its ease, by the same rule. Check: the tests fail for want of the 2D's area (FR-003; PD-23) (feat/014-room-after-the-demo)

### Code (GREEN)

- [x] T011 Add to `apps/web/src/room/compose/hud.ts` the table's compact entries (`strip.maxRem`, `bar.maxRem`, `bar.align`, `column.anchor`, `log.restRem` and its band, `notes.maxRem`) at the values T006's model finds, and `compactBoxes` and `alwaysOnCoverage`; keep `hudBoxes` and every band as they are (PD-3). If 1280 × 720's coverage is over 0.25, take plan §3.3's ladder, each step a departure in plan.md. Check: T005 and T006 pass; spec 005's and spec 012's tests pass unchanged (feat/014-room-after-the-demo)
- [x] T012 Write `apps/web/src/room/compose/frame.ts` (`frameArea`, the step, the 0.5rem test, the fallback) and `apps/web/src/room/compose/protect.ts` (`protectorFor`, from a composed scene or a bundle, with "pressable at spec 005's frame" computed once per call), by contracts/frame-area.md §2, §4 and plan §2.1, §2.2. Check: T007 and T008 pass (feat/014-room-after-the-demo)
- [x] T013 Change `apps/web/src/room/compose/stages.ts` (`Stage.reserved`, `stageFor`, `supportedStages(protect)`, the reference stages and `SMALLEST` as frame areas), `apps/web/build/room/checks/rg.ts` (RG6 from each stage's `reserved`; RG5's aspects extended if a frame area's aspect lies outside them), and `apps/web/build/room/report.ts` (the "Frame" line: the ease's distribution and the reference stages' ease and growth), by plan §11. Run `npm run room:check`, and record its time and stage count beside T001's and the report's "Frame" line in the note; replace plan §2.3's estimates with the report's figures. Over twice the time, take §11's coarse-grid step, a departure. Check: T009 passes; RG5 to RG7 pass on the room's data; the floor holds (feat/014-room-after-the-demo)
- [x] T014 Change `apps/web/src/room/compose/stages.ts`'s `flatScale` and the 2D's centring to take the frame area, and add the 2D protector beside `protectorFor` (PD-23). Check: T010 passes (feat/014-room-after-the-demo)

**Checkpoint**: the kernel frames the room into its frame area, falls back to spec 005's frame, and the checks judge the frame areas.

---

## Phase 3: User Story 1 - The Room Fills the Window, Under the HUD (Priority: P1)

**Goal**: the room's frame is the frame area at run time, in 3D and 2D, with the picker, the hand-off, and the walking view's start and end on it.

**Independent Test**: spec.md's User Story 1 Independent Test.

- [x] T015 [P] [US1] Write `apps/web/test/room/scene-fit.test.ts`'s and `apps/web/test/ui/resize.test.ts`'s new cases: at 1920 × 1200 and 2560 × 1440, `SceneOptions.frame()` gives the frame area, the camera's aspect is the area's and its view offset `viewOffsetFor(area, canvas)`; a press at each pressable selectable's core selects it and a press on each compact box selects nothing; a resize, a collapse, and full screen recompute the area on the next frame with at most 17 protector calls; a `frame()` that throws frames into the clear area and logs `frame_fallback` in a drafts build; the hand-off and the walking view's start and end use the room's view; the frame log's `refit` carries `frame` and `ease`. Check: the tests fail for want of `frame()` (FR-004, FR-013 to FR-015, FR-064) (feat/014-room-after-the-demo)
- [x] T016 [P] [US1] Write `apps/web/test/ui/flat-frame.test.ts`: the 2D drawing's view element at `--frame-*`, its hit areas pressable, the figures under no compact box, the backdrop across the window. Check: the test fails (FR-003) (feat/014-room-after-the-demo)
- [x] T017 [US1] Change `apps/web/src/room/app.ts` (`refit` computes `frameArea` with `protectorFor(bundle)` and passes `frame()`), `apps/web/src/room/scene.ts` (`clear` to `area`, the shift, the picker, `inArea`), `apps/web/src/room/fit.ts` (the area in place of the clear area's box, names kept), and `apps/web/src/room/signals/frame-log.ts` (`refit`'s `frame` and `ease`, `frame_fallback`), by plan §2.4. Check: T015 passes; spec 005's, spec 008's, and spec 012's room tests pass with only their framing expectations changed, each listed in the note (feat/014-room-after-the-demo)
- [x] T018 [US1] Change `apps/web/src/room/flat.ts`, `apps/web/src/room/layout.ts` (the `--frame-x`, `--frame-y`, `--frame-w`, `--frame-h` properties), and `apps/web/src/room/room.css` (the 2D view's place at the frame area; `--clear-*` kept), by plan §2.5. Check: T016 passes (feat/014-room-after-the-demo)
- [x] T019 [P] [US1] Extend `apps/web/test/lookdev/page.test.ts`: the window run's results carry `ease` and `frame_css` (contracts/lookdev.md §6, "(spec 014)"). Check: the test fails (FR-063) (feat/014-room-after-the-demo)
- [x] T020 [US1] Change `apps/web/src/lookdev/stage.ts` and `metrics.ts` to frame the window run into its frame area and report `ease` and `frame_css`. Check: T019 passes (feat/014-room-after-the-demo)

**Checkpoint**: the room fills the window under the HUD wherever no piece or figure would fall under a panel.

---

## Phase 4: User Story 9 - Every Change Keeps Its Degraded Mode (Priority: P1)

**Goal**: the faults of FR-001, FR-002, and FR-004 end with the room filling the window, the HUD usable, and no new request. The grip's and the glow's faults join in their stories (T031, T035), and T046 reruns the whole set.

**Independent Test**: spec.md's User Story 9 Independent Test.

- [x] T021 [US9] Extend `apps/web/test/ui/hud-faults.test.ts`: over FR-002's states (the live source off, the tier unknown, the local tier off, the budget spent, the kill switch `degraded`, stubbed), with no WebGL 2, and with the frame computation throwing: the room fills the window, the frame is the frame area or the clear area, the HUD works, the AI disclosure and the stand-in line are in view, only the conversation's answers degrade, and the network log holds no request beyond today's (spies on `fetch`, `sendBeacon`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `Image`). Check: the new cases fail where T017 left a gap, or pass at once, which the note records (FR-001, FR-002, FR-065, SC-011) (feat/014-room-after-the-demo)
- [x] T022 [US9] Fix what T021 finds, in the module it names. Check: T021 passes (feat/014-room-after-the-demo)

**Checkpoint**: the frame never degrades the room.

---

## Phase 5: User Story 2 - A HUD That Looks Like Part of the Game and Keeps the Room Clear (Priority: P2)

**Goal**: the page draws the compact boxes the kernel gives, and every HUD control and note takes the look.

**Independent Test**: spec.md's User Story 2 Independent Test.

- [x] T023 [P] [US2] Extend `apps/web/test/room/stages.test.ts`: `room.css`'s column-layout rules for `.disclosure`, `.hud-bar`, and `.hud-panels` read `--strip-w`, `--bar-w`, and `--column-h`, set no length of their own for a compact box, and keep `--clear-*`, `--notes-h`, and `--column-w`'s meanings; a one-rule change to either fails. Check: the test fails (FR-021, SC-002) (feat/014-room-after-the-demo)
- [x] T024 [P] [US2] Write `apps/web/test/ui/hud-look.test.ts`: in the column and dock layouts, every HUD control (the bar's tiles, the list's buttons and toggle, Send or Stop, the talk button, the log's toggle, the larger-view control, the offer's buttons, the walking and full-screen controls) matches the tile rule set and none takes `.room button`'s white face, while the resume's panel keeps spec 005's look, by the stylesheets' parsed rules and the DOM's classes; the notes take the chip; the headings take `--heading-font` and the figures `--figure-font`; no `@font-face`, `url(`, or package is added beyond `src/fonts.css`'s; every transition sits under `prefers-reduced-motion: no-preference`; the stacked layout keeps the page's buttons; reduced transparency, more contrast, forced colours, and no blur make every tile, chip, and panel opaque; the column's log at rest is held to `--log-rest` and scrolls, and the larger view opens only on its control's press. Check: the test fails (FR-007, FR-008, FR-018, FR-022 to FR-025, FR-027, FR-028, SC-004) (feat/014-room-after-the-demo)
- [x] T025 [P] [US2] Extend `apps/web/test/room/hud-contrast.test.ts`: the chip's face, the accent edge against the glass and the tile face, the selected tile, and the headings' words, each over white and over black beneath, at WCAG's floors; the glass's opacity is still the lowest 5% step that passes. Check: the new pairs fail for want of their properties (FR-026, SC-004) (feat/014-room-after-the-demo)
- [x] T026 [US2] Change `apps/web/src/room/layout.ts` (set `--strip-w`, `--bar-w`, `--column-h`, `--log-rest` from `compactBoxes`) and `apps/web/src/room/room.css` (the column layout's compact strip, bar, and column, by plan §3.2), keeping spec 012's properties' meanings. Check: T023 passes; spec 012's loader tests pass unchanged (feat/014-room-after-the-demo)
- [x] T027 [US2] Change `apps/web/src/room/room.css` and `apps/web/src/talk/talk.css`: PD-9's tile rule set, the states (PD-8's `--accent-neon`), the chips, the type, the transitions, the opaque fallbacks, and the column's log at `--log-rest`, by plan §4. Check: T024 and T025 pass; `test/room/hud-contrast.test.ts`'s spec 005 pairs and spec 012's `loading-contrast.test.ts` pass unchanged (feat/014-room-after-the-demo)
- [x] T028 [US2] Verify the compact page against the rules that stay: spec 005's HUD tests (`test/ui/hud.test.ts`, `hud-notes.test.ts`, `hud-pointer.test.ts`, the 320 × 568 model of its SC-012) and spec 012's loader tests, on the compact page: the AI disclosure, the stand-in line, the text box, Send, and the talk button in view in every layout and state (spec 005 FR-021, FR-022; spec FR-020). List each changed expectation in the note, with the FR that changed it. Check: they pass, with only listed expectations changed (feat/014-room-after-the-demo)

**Checkpoint**: the HUD covers at most a quarter of a landscape desktop window, and every control is a tile.

---

## Phase 6: User Story 3 - Walking Starts From the Room's View (Priority: P2)

**Goal**: the walking view holds the room's view until a camera intent or the edge, then hands over.

**Independent Test**: spec.md's User Story 3 Independent Test.

- [x] T029 [US3] Write `apps/web/test/room/walk-hold.test.ts` (`nearsEdge` at each side of each compact box and the window; `orbitFrom` puts the camera at the room's view within 1 mm and 0.01°; `release` on each camera intent, never on the movement keys alone) and extend `apps/web/test/room/walking.test.ts` (entry leaves the camera at `production(stage)`, 0 changes through a scripted walk that stays clear, taps pick and walk-to at the room's view; the first turn, tilt, or zoom and the edge each hand over, the first frame equal to the room's view, the move within 500 ms or a cut while the motion store is still; leaving from the hold moves nothing; a re-fit while held re-frames; at entry the figure at its start place doesn't trip the edge (R-11); the frame log's `walk` entries `hold` and `follow` with their cause). Check: the tests fail (FR-030 to FR-037, FR-064, SC-005) (feat/014-room-after-the-demo)
- [x] T030 [US3] Write `apps/web/src/room/walk/hold.ts` (`nearsEdge`, `release`, `orbitFrom`) and change `apps/web/src/room/scene/walking.ts` (the held start, the hand-over, PD-10), `apps/web/src/room/scene.ts` (the compact boxes and the window to the walking view each frame; the figure's box, PD-11), and `apps/web/src/room/signals/frame-log.ts` (the `walk` entries), by plan §5. `scene.yaml`'s `walking` block is unchanged (FR-037). Check: T029 passes; spec 008's walking tests pass with only their entry expectations changed, each listed in the note (feat/014-room-after-the-demo)

**Checkpoint**: "Walk around" keeps the room's view until the visitor moves the camera or the figure nears a panel.

---

## Phase 7: User Story 4 - The Resume's Sheet Sits in the Hand (Priority: P2)

**Goal**: the kept sheet sits at the hand's grip, from data or the computed default, never along the forearm.

**Independent Test**: spec.md's User Story 4 Independent Test.

- [x] T031 [US4] Write `apps/web/test/room/grip.test.ts` (over T004's skeletons: for each avatar and hand, at rest and in the holding pose, with a data grip and with none, the held edge's middle within 1 cm of the grip's point and 0 sheet points within the forearm's 4 cm capsule; the default from `…HandMiddle1`, or the hand bone without it; a non-finite grip falls back to the anchor), extend `apps/web/test/room/schema.test.ts` (`figures.grips`: an unknown avatar, a hand other than `right` and `left`, an `at` past ±0.15, a turn past ±180, each refused with T001's rule IDs; the good fixture's grips accepted), and extend `apps/web/test/room/avatar-scene.test.ts` (`keepPaper`, `paperAt`, and `holdSheet` place the sheet by the grip; the hand-off's sheet runs grip to grip; a walk keeps it at the grip; `PAPER_LIFT` is gone). Check: the tests fail (FR-005, FR-038 to FR-041, SC-006) (feat/014-room-after-the-demo)
- [x] T032 [US4] Write `apps/web/src/room/scene/grip.ts` (PD-12, PD-13) and change `apps/web/src/room/scene/avatars.ts`, `apps/web/src/room/compose/bundle.ts` (`RoomScene.figures.grips`), `apps/web/build/room/schema.ts` and `checks/rd.ts` (the grips' rules), the good fixture's `scene.yaml`, and `apps/web/room/scene.yaml` (the man's and the woman's grips, estimated from the default's frame, each marked an estimate in a comment), by plan §6. Nothing under `assets/` changes (FR-043). Check: T031 passes; `npm run room:check` passes; `git diff --stat refs/heads/main -- assets/` is empty (feat/014-room-after-the-demo)
- [x] T033 [P] [US4] Extend `apps/web/test/lookdev/page.test.ts`: in a drafts build, the hands view lists the man and the woman, each hand, at rest, in "idle-holding", and mid-walk, with the forearm's capsule drawn; a release build has no lookdev page. Check: the test fails (FR-042) (feat/014-room-after-the-demo)
- [x] T034 [US4] Change `apps/web/src/lookdev/stage.ts` and `apps/web/room/lookdev.yaml` (the hands view's avatars, under room-data-files.md §12's rules), by PD-24. Check: T033 passes (feat/014-room-after-the-demo)

**Checkpoint**: the sheet sits in the hand, ready for the Author's lookdev check.

---

## Phase 8: User Story 5 - The Neon Sign Glows Along Its Tube and Letters (Priority: P2)

**Goal**: the catalog's glow can be a path; the sign's is its tube's.

**Independent Test**: spec.md's User Story 5 Independent Test.

- [x] T035 [US5] Extend `apps/web/test/room/schema.test.ts` (a glow with both `radius` and `path`, with neither, with one point, with a point outside the piece's bounds, and with a `spread` of 0 or above 0.05, each refused with T001's rule IDs; a bad fixture under `test/fixtures/room/bad/RD-glow-path/`), and write `apps/web/test/room/glows.test.ts`, new (a path glow is one mesh with one additive material, at most 2,000 triangles; every vertex within the spread plus 1 mm of the path; the alpha 1 on the path and 0 at the edges; the mitre capped at twice the spread (R-8); `flicker` while animating and full strength while still; none drawn at quality 2 and 3; a degenerate path gives no glow and no disc; a disc glow unchanged). Check: the tests fail (FR-006, FR-044 to FR-049, SC-007) (feat/014-room-after-the-demo)
- [x] T036 [US5] Change `apps/web/build/room/schema.ts`, `checks/rd.ts`, and the bounds rule beside RG's (PD-16), `apps/web/src/room/compose/bundle.ts` (`Glow.path`, `Glow.spread`), and `apps/web/src/room/scene/glows.ts` (the ribbon, PD-14), by plan §7. Check: T035 passes; the laptop's and the screens' glows' tests pass unchanged (feat/014-room-after-the-demo)
- [x] T037 [US5] Change `apps/web/room/catalog/neon-sign.yaml`'s `tube-glow` to PD-15's path and spread (a data edit, its comment saying why), and the good fixture's catalog to match; extend `apps/web/test/room/data-only.test.ts` so the sign's glow is a path and no disc. Check: `npm run room:check` passes; the sign has 0 disc cards in `test/room/scene.test.ts`'s built room; its glow covers less of the reference desktop's screen than the disc did, by the projected areas (SC-007) (feat/014-room-after-the-demo)

**Checkpoint**: the sign glows along its tube; the letters keep their own glow.

---

## Phase 9: User Story 6 - The Chalkboard Shows denverlocal.ai (Priority: P2)

**Goal**: the release board draws its line once main approves it; the approval itself is the Author's (T049, T056).

**Independent Test**: spec.md's User Story 6 Independent Test.

- [x] T038 [US6] Extend `apps/web/test/approvals.test.ts`: a policy directory written by the test, approving `chalk-denverlocal.yaml`'s digest computed by the test from the file under the kind `room-text`, makes a release build publish the line and the slate's region draw it as words; without the entry, a release build leaves the slate plain and a drafts build draws it marked "Draft". Check: the test passes at once, proving the existing rule, which the note records; or fails where the build doesn't, and T039 fixes it (FR-050, SC-008) (feat/014-room-after-the-demo)
- [x] T039 [US6] If T038 failed, fix the module it names; otherwise record in the note that the board needs only the Author's approval. Leave `apps/web/content/room/chalk-denverlocal.yaml`'s bytes as they are (FR-051), and `corpus/` untouched (FR-052). Check: T038 passes; `git diff --stat refs/heads/main -- apps/web/content/room/ corpus/` is empty (feat/014-room-after-the-demo)

**Checkpoint**: the build is ready for the Author's approval.

---

## Phase 10: User Story 7 - The Placeholder Note Says What Is Missing (Priority: P3)

**Goal**: the note's causes, from the room's pieces and the visitor's figure, in one slot.

**Independent Test**: spec.md's User Story 7 Independent Test.

- [x] T040 [US7] Write `apps/web/test/ui/notes-causes.test.ts` (the table: a room piece a placeholder or not, by the bundle or a run-time `failed` or `skipped`; the visitor's avatar with or without a model, or failing mid-visit; 3D and 2D; the twin's stand-in; each case's exact words, or no note; one slot; the pointer passes through) and extend `apps/web/test/room/compose.test.ts` and `bundle.test.ts`, where the index's `build` is tested (`build.placeholders` is true only with a stand-in piece, never for a missing avatar model), and `apps/web/test/room/words.test.ts` (`standin.avatar` in the closed list, no slots, RT's checks). Check: the tests fail (FR-053 to FR-055, FR-066, SC-009) (feat/014-room-after-the-demo)
- [x] T041 [US7] Change `apps/web/build/room/emit.ts` (PD-17: `avatarsPlaceholder` deleted), `apps/web/src/room/app.ts` (the pieces' run-time cause from the loader, the figure's from the avatars' controller), `apps/web/src/room/layout.ts` (`setPlaceholders({ pieces, figure })`, PD-18), `apps/web/src/room/ui-keys.ts`, `apps/web/room/ui-words.yaml` (D11's words), the good fixture's `ui-words.yaml`, and the notes' band in `compose/hud.ts` if T006's model finds the joined words need it. Check: T040 passes; `test/ui/hud-notes.test.ts` and spec 012's `loading-notes.test.ts` pass (feat/014-room-after-the-demo)

**Checkpoint**: the note is true in every case.

---

## Phase 11: User Story 8 - The Sign's Cost Proven From End to End (Priority: P2)

**Goal**: `make sign-check` on the dev stacks, by contracts/sign-check.md.

**Independent Test**: spec.md's User Story 8 Independent Test.

- [x] T042 [P] [US8] Write `evals/test_sign_check.py` (pytest, docker and the probe stubbed): each refusal of contracts/sign-check.md §2 exits 2 and calls nothing; the steps run in §3's order; each step's miss exits 1 with its row; the model server is started in a `finally` whatever the outcome, Ctrl-C and SIGTERM included; the output holds no fixture reply's `text`. Check: the tests fail for want of the script (FR-056 to FR-058) (feat/014-room-after-the-demo)
- [x] T043 [P] [US8] Write `apps/web/test/room/sign-reading.test.ts`: `build/room/sign-reading.ts` given a fallback reply's three facts prints `sign.estimated`'s reading with the cost, a local reply's `sign.local` with $0, a degraded 503's and an invalid route's `sign.unavailable`, each equal to `turn-cost.test.ts`'s expectations for the same outcome. Check: the test fails for want of the script (FR-056 (d), FR-059) (feat/014-room-after-the-demo)
- [x] T044 [US8] Write `evals/sign_check.py` and `evals/sign_probe.py` (PD-20), `apps/web/build/room/sign-reading.ts` and `apps/web/package.json`'s `room:sign` script (PD-21), and the `Makefile`'s `sign-check` target with `breach-test`'s guards and relay (plan §10), in its `.PHONY` list and wherever `evals/test_repository_docs.py` requires a new target to be named. `CLAUDE.md`'s command list is the Author's to extend; the note offers him the line. Check: T042 and T043 pass; `make sign-check ENV=prod` exits 2 before anything runs, by the Makefile's guard and by the script's (feat/014-room-after-the-demo)
- [ ] T045 [US8] On the agents' engine: `make up ENV=dev-cpu`, `make sign-check ENV=dev-cpu`, `make down ENV=dev-cpu`, each through the relay; paste the whole output into the note. If T001 found the dev-cpu twin turn can't reach the synthetic fallback (R-4), record the departure and the local half's and the refusals' pass, and hand the paid half to the Author's T059. Check: the run passes, or the departure is recorded (SC-010) (feat/014-room-after-the-demo)

**Checkpoint**: the sign's chain is proven on the stack, with no paid call.

---

## Phase 12: Polish, the review, the Author's lookdev check, and his patch and merge steps

- [x] T046 Extend `apps/web/test/ui/hud-a11y.test.ts`: axe in every layout, panel state, and mode, in 3D and 2D, in and out of full screen, with the compact HUD, the new look, the held walking view, and each note's cause; the Tab order unchanged; no control hidden entirely by a compact box when focused. Rerun T021's faults with T031's and T035's faults added (the hand bone missing, the glow's path missing). Fix what they find in the module they name. Check: 0 violations; the faults pass (FR-062, SC-011, SC-012) (feat/014-room-after-the-demo)
- [x] T047 Run `make lint`, `make test`, and `make check ENGINE_MODE=none-yet` in the worktree, and `gitleaks dir`. Paste each whole output into the note. Also record: the entry chunk's gzip size beside T001's (SC-015); `npm run room:check`'s time and stage count beside T001's; that `package-lock.json`'s diff is empty; that the response headers' tests are unchanged; and that `make up ENV=dev-cpu`'s compose config is unchanged (FR-067). Check: all pass (feat/014-room-after-the-demo)
- [x] T048 Write `apps/web/room/README.md`'s "The frame under the HUD", "The grips", and "The path glow" (plan §12), finish ADR 0046 with any departure, and bring plan.md's departures section up to date. Check: `make test`'s docs-links check passes (feat/014-room-after-the-demo)
- [x] T049 Build the board's approval patch by plan §8 and PD-19, from main's checkout's plain copies, never `git apply` and never a write into any worktree: `git show refs/heads/main:assets/policy/content-approvals.json` into two scratch copies outside every worktree, one edited by hand with the next id, the block's path, `room-text`, the digest from `sha256sum` of the block at the branch's tip, the date left for him, and `"reason": "<your words>"`; then `diff -u` of the two, saved as `docs/merge-requests/<date>-room-text-chalkboard.patch`. Check it against a third scratch copy with `patch --dry-run`, outside every worktree; run `gitleaks dir` and the content scan over it (R-10). Check: the dry run applies cleanly, the patch adds exactly one entry, its digest equals the block's, and its path is in the note (FR-050, FR-051, SC-008) (feat/014-room-after-the-demo)
- [x] T050 Draft the merge-request note, `docs/merge-requests/<date>-feat-014-room-after-the-demo.md`, and commit it as a save point. It holds: what changed and why, with the Author's words quoted; each FR's status; the departures; the RED and GREEN runs; T013's frame line and T045's and T047's outputs; the changed test expectations; the board's patch, its digest, and its command; and the Author's steps as short, wrap-proof lines (each 45 characters or fewer, with variables and a separate SHA guard). Check: the note exists on the branch (feat/014-room-after-the-demo)
- [ ] T051 Rehearse the merge: rebase the branch onto `refs/heads/main`'s current tip (re-read it first), run `make check ENGINE_MODE=none-yet` and `gitleaks dir` on the rebased tree, rebuild T049's patch if main's `content-approvals.json` moved, and rerun `make sign-check ENV=dev-cpu` (as T045). Replace the note's outputs with these. Check: all pass on the rebased tree (feat/014-room-after-the-demo)
- [ ] T052 Review by an agent that wrote none of the work: `REVIEW.md`'s passes (bugs, security, compliance with spec.md, plan.md, and the constitution, and cost and telemetry) and its Room data pass for `scene.yaml`, `neon-sign.yaml`, `ui-words.yaml`, and `lookdev.yaml`; it also confirms that no file holds copied text of the game UI guidance beyond the spec's short quotes (FR-029), and recomputes the board's digest. Findings go in the note. Check: the findings are recorded; the reviewer is named (feat/014-room-after-the-demo)
- [ ] T053 Fix the review's findings, each in its own commit with a test where it changes behaviour, and finish the note. Check: T047's commands pass again, their outputs replaced in the note (feat/014-room-after-the-demo)
- [ ] T054 Author: the lookdev check. In his terminal, bring the branch's drafts build up on dev (`make up ENV=dev REF=feat/014-room-after-the-demo`), open the lookdev page, and look at: the hands view, the man and the woman, each hand, at rest, in "idle-holding", and mid-walk (SC-006); the sign's glow in the vignette, along the tube and the letters with no circle (SC-007); the window run's frame at the reference desktop, the room under the panels; and the HUD's look on the glass. He records a yes, or the grips, spread, or tones to change, in the note's follow-up. Check: his answer is in the note (dev)
- [ ] T055 Apply the data edits the Author named in T054, if any (`scene.yaml`'s grips, `neon-sign.yaml`'s spread, the palette's accent), each with its test rerun, and rerun T047's commands. Check: T047's commands pass; the note lists each edit beside his words (feat/014-room-after-the-demo)
- [ ] T056 Author: after spec 012 and gate 4 have merged, read the board's block, run `sha256sum apps/web/content/room/chalk-denverlocal.yaml` himself, fill the entry's date and `reason` in his words, and commit the approval on `main` from T049's patch (his `git apply` or his editor). Check: `refs/heads/main`'s `assets/policy/content-approvals.json` holds the entry, its digest the block's (main)
- [ ] T057 Author: from main's checkout, run `tools/gates/gate feat/014-room-after-the-demo`, and merge with the command it prints. Check: `refs/heads/main` holds the branch's tip, and the gate's content check passes with the board's line published (main)
- [ ] T058 Author: bring the room up as he does, and look at the live room in his browser (SC-014): resize from small to large; see the room under the panels and the plain sides on a wide window; use every control; walk around and turn the view; take the resume and watch the sheet in the hand; look at the sign's glow and the board; read the notes with the man chosen and with the dog. Run the lookdev page's 2-minute window runs on the reference phone, the reference desktop, and a large monitor, recording each median frame rate, its share within 33 ms, its settled level, its ease, and its frame (SC-013). He records a yes or a no for each in a follow-up note. Check: his note exists (main)
- [ ] T059 Author, if he wants: in his terminal, `make sign-check ENV=dev` on his dev stack, the whole output into the follow-up note; required only if T045 recorded R-4's departure. Check: the run's table is in his note (dev)
- [ ] T060 Author: accept ADR 0046 or leave it proposed; give a yes or a no to Q1 to Q5 and to D1 to D12, each provisional. A no becomes a fix branch from its option's text. Check: his answers are recorded beside T000's (main)

---

## Dependencies and execution order

- **T000** before everything, and spec 012's merge before T001. **Setup** (T001 to T004): T001 first; T002 to T004 in parallel after it.
- **Foundational** (T005 to T014): the tests T005 to T010 in parallel, then T011, then T012 (it needs the compact boxes), then T013 and T014 in parallel. Every story waits for this phase.
- **User Story 1** (T015 to T020) before every other story, which lays its parts over the frame. **User Story 9** (T021, T022) right after it.
- **User Story 2** (T023 to T028) after User Story 1: its tests T023 to T025 in parallel, then T026, T027, and T028. **User Story 3** (T029, T030) after User Story 2, since its edge test reads the compact boxes the page draws.
- **User Stories 4 to 8** after User Story 1, in any order or in parallel lanes: their files don't meet, but for `compose/bundle.ts` (T032 and T036) and `schema.ts` (T032 and T036), which land in task order, and `app.ts` and `layout.ts` (T041 after T026).
- **Polish** last: T046 and T047, then T048, T049, and T050, then T051, then T052 by a reviewer that has written none of T001 to T051, then T053. The Author's T054 follows the review; T055 his edits; then his T056 and T057, then T058 to T060.

## Parallel lanes, by example

- Phase 2's tests: T005 to T010 touch six different test files.
- After Phase 4: one lane for User Story 2 (`room.css`, `talk.css`, `layout.ts`); one for User Story 4 (`scene/grip.ts`, `scene/avatars.ts`, lookdev); one for User Story 5 (`scene/glows.ts`, the catalog); one for User Story 8 (`evals/`, the Makefile, `build/room/sign-reading.ts`).
- In Phase 11: T042 and T043 touch a Python test and a TypeScript test.

## Implementation strategy

- **The minimum that ships**: Phases 1 to 4: the room framed under the HUD with its degraded paths. That alone answers his first words.
- **"One spec for all"**: every story ships in the one branch and gate; the order above is the risk's: the kernel and the checks first, since a frame the checks refuse would change the table before anything is built on it (R-1 to R-3).
- **The Author's eye**: the look, the grips, and the glow are judged at his lookdev check before the gate (T054), so a data edit, not a fix branch, tunes them.
