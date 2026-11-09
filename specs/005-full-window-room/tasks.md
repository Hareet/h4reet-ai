---

description: "Task list for spec 005, the room fills the browser window"
---

# Tasks: The Room Fills the Browser Window — A Full-Window Scene, a Translucent HUD, and Full Screen

**Input**: the documents in `specs/005-full-window-room/`: [spec.md](spec.md) (FR-001 to FR-068, SC-001 to SC-015, the Clarifications with the Author's answers, Amendments H1 to H24, and its Data-Flow Disclosure Entries) and [plan.md](plan.md) (decisions PD-1 to PD-25, §2 to §15, the risks R-1 to R-12, and the analyze pass at its end).

**Prerequisites**: the Author approves the spec and the plan (T000). Until then no task below starts: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`." The intent was accepted, and Q1, Q2, Q3, and Q5 answered, by the Author on 2026-11-09; Q4 and D1 to D11 are provisional.

**Tests**: required. In each phase the test tasks come first and must fail (RED) before the code that makes them pass (GREEN); the branch's note records both runs. A task that only proves an existing rule (parts of T029) passes at once, and the note says so. Every check runs inside `make test` or `make check`, so no `CHECK_GATES` entry is added.

**Organization**:
- **One branch**, `feat/005-full-window-room`, in its own worktree, cut from `refs/heads/main` (plan §16).
- **The phases**: Setup; Foundational, which holds the kernel and the degraded paths (the placements table, the stages, the floor, the 2D room in the clear area, `flat-failed`, the opaque fallbacks, the stacked layout) before any HUD look (Principle I); User Story 1 (the window and the re-fit, P1); User Story 2 (the HUD, P1); User Story 3 (spec 004's checks and lookdev, P1); User Story 4 (one place for each press, P1); User Story 5 (accessibility, P1); User Story 6 (full screen and its event, P2); User Story 7 (the faults end to end, P1); then Polish, the merge, and the Author's steps.
- **Parallel lanes**: tasks marked [P] touch files no unfinished task of their phase touches, so agents can take them in worktrees of their own, one per agent that writes, the commits cherry-picked onto the branch in task order. Agents never merge.
- **The branch ends** with a review by an agent that wrote none of it, then a merge-request note, `docs/merge-requests/<date>-feat-005-full-window-room.md`, holding `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s.

## Format: `[ID] [P?] [Story?] Description (branch)`

- **[P]**: can run in parallel with the other [P] tasks of its group: different files, no dependency on an unfinished task.
- **[USn]**: the user story of a story phase. Setup, Foundational, and Polish tasks carry none.
- **"Author:"** opens a task only the Author does: in his own terminal, on `main`, in his browser, or on his devices. Agents never do these steps.
- **Check** ends each task: what proves it done. **The branch** ends each task.

## Path conventions

- The room: `apps/web/src/room/` (`compose/hud.ts`, `compose/stages.ts`, `fit.ts`, `hud/`, `fullscreen.ts`, `scene.ts`, `scene/`, `layout.ts`, `a11y.ts`, `app.ts`, `room.css`), `apps/web/src/talk/`, `apps/web/src/lookdev/`, `apps/web/build/room/`, `apps/web/test/`.
- "PD-n", "§n", and "R-n" are plan.md's; "Qn", "Dn", "FR-nnn", "SC-nnn", and "Hn" are the spec's.
- `test/room/legacy-stages.ts` is written once, in T004, and never changed after: it is the floor.
- jsdom lays nothing out: layout facts are proven by the model in `test/ui/hud-model.ts` (real text widths, from the index's words), and by the Author's look at the live room.

---

## Before any phase

- [ ] T000 Author: approve spec.md and plan.md, and say whether `spec/005-full-window-room` merges on its own after its gate or travels at the base of `feat/005-full-window-room`. Check: his answer is recorded here, in the session's words, as spec 011's T000 records his; the spec's Status reads clarified (spec/005-full-window-room)

---

## Phase 1: Setup

**Purpose**: the base confirmed, the outside facts read, the floor frozen, and the ADR and the contract passages written down.

- [ ] T001 Create the worktree with `git worktree add -b feat/005-full-window-room <new folder> refs/heads/main`, after reading `refs/heads/main`'s SHA; run `npm ci --ignore-scripts --cache "$TMPDIR/npm"`; cherry-pick `spec/005-full-window-room`'s commits if main lacks them. Then read and record in the note:
  - **Full screen**: the Fullscreen API's names and support in desktop Chrome, Edge, Firefox, and Safari, Android's Chrome and Firefox, iPadOS Safari (prefixed or unprefixed), and iOS Safari (expected: none for a page). Whether each browser delivers to the page the Escape that leaves full screen.
  - **CSS support**: `prefers-reduced-transparency`; `backdrop-filter` and its `-webkit-` form; `dvh`; `env(safe-area-inset-*)` with `viewport-fit=cover`.
  - **The keyboard**: whether the on-screen keyboard resizes the visual viewport alone in iOS Safari and Android Chrome.
  - **The shortcut**: whether Alt+Enter, or Option+Return, is taken on a page by any of those browsers, by NVDA, JAWS, or VoiceOver.
  - **three**: `PerspectiveCamera.updateProjectionMatrix`'s view-offset math in three 0.186.1 (from `node_modules`), with a negative offset.
  - **Numbers**: the next free ADR number; `npm run room:check`'s time and its supported stage count; the entry chunk's gzip size.

  Check: `git rev-parse HEAD` prints the base's full SHA; each item is recorded. Any item that differs from plan PD-12, PD-19 to PD-21, §6.7, or §6.8 is a departure recorded in plan.md in the same commit, before any task builds on it (analyze A8, A9) (feat/005-full-window-room)
- [ ] T002 [P] Write ADR 0043 (or the next free number), status proposed, `docs/adr/00NN-the-room-fills-the-window.md`, by plan §13, quoting the Author's answers in his words, with its row in `docs/adr/README.md`. Check: `make test`'s docs-links check passes (FR-068) (feat/005-full-window-room)
- [ ] T003 [P] Amend the living interfaces, each passage marked "(spec 005)", by plan §13 and §14: spec 002's `contracts/room-scene.md` §1, §4, §5, and §6 (H1 to H4, H6), and spec 004's `contracts/room-data-files.md` §9 and §13.3 (H10, H11, H14, H17, H19). The event's passages change with its code (T037, T039). Check: `make test`'s docs-links check passes; the reviewer (T045) reads each passage against the FRs it serves (feat/005-full-window-room)
- [ ] T004 [P] Write `apps/web/test/room/legacy-stages.ts`: today's `ROOM_CSS`, `stageFor`, `SMALLEST`, and `sweepScreens` copied verbatim from `apps/web/src/room/compose/stages.ts` at the base, with the base's SHA in its first comment. Add a test that, at the base, the copy gives exactly what the shipped module gives for every sweep screen. Check: the test passes before T011; the file is never changed after this task (plan §3.2, PD-8) (feat/005-full-window-room)

**Checkpoint**: the facts are recorded, and the floor is frozen.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the kernel and the degraded paths before any look. These come first: the placements table, the clear area, the stages and the floor, the buffer's ratio and the view offset as pure functions, the room block with its clear box, the 2D room in it, `flat-failed`, the opaque fallbacks, and the stacked layout. No user story starts before this phase passes.

### Tests for Foundational (first)

- [ ] T005 [P] Write `apps/web/test/room/hud.test.ts` (FR-020, FR-007; plan §2):
  - `layoutFor` gives the column layout for a window wider than tall and at least 32rem wide, the dock layout otherwise, a square window among them.
  - `hudBoxes` and `clearArea` for each layout and the dock's list state: the strip at the top, the bar at the foot, the column `clamp(15rem, 40%, 28rem)` between them on the right, and the dock above the bar.
  - The column layout's clear area doesn't change when the list or the log collapses; the dock layout's grows when the list collapses.
  - A collapsed state's clear area is never smaller than the open one.
  - `fitsHud` is false below 304 × 196, at 320 × 256, and at a 32-pixel root on 320 × 568.
  - The safe-area insets narrow the clear area.
  - `reservedBoxes(clear)` is the walking control's box in the clear area's bottom-right corner.

  Check: RED before T011 (feat/005-full-window-room)
- [ ] T006 [P] Extend `apps/web/test/room/stages.test.ts` (FR-052, FR-053, FR-054; plan §3.1):
  - `stageFor` is the clear area in the opening state.
  - The reference stages keep their screens and ratios; their stages are at least 686.4 × 640 and 368 × 368.
  - `SMALLEST`'s stages are at least 304 × 196 and 304 × 208.
  - `sweepScreens` is today's 16-pixel grid, plus PD-9's coarser grid and named screens.
  - `supportedStages` holds every dock screen's collapsed stage.
  - `ASPECTS` holds spec 002's six and covers every supported stage's aspect.
  - `room.css`'s docked rules read `--strip-h`, `--bar-h`, `--column-w`, and `--dock-h`, and set no length of their own for a docked box.
  - `.room`'s height is `100dvh` after `100vh`; `body.in-room` has no `max-width` and no padding.
  - `.flat`'s container rule and `.room-walk`'s box are unchanged.

  Check: RED before T011 (feat/005-full-window-room)
- [ ] T007 [P] Write `apps/web/test/room/stages-floor.test.ts` (FR-054; SC-002): every screen of `legacy-stages.ts`'s sweep gets a new stage at least its legacy stage in width and in height, the first failure named with both stages. Check: RED before T011, then GREEN (feat/005-full-window-room)
- [ ] T008 [P] Write `apps/web/test/ui/hud-model.ts`, moving `test/ui/a11y.test.ts`'s portrait model into it and generalizing it to the HUD (plan §3.3), and `apps/web/test/ui/hud-model.test.ts` (FR-007, FR-022, FR-054; SC-010, SC-012):
  - at every sweep screen, with the index's words and IBM Plex Sans's widths, the strip's lines, the bar's rows (six controls, "Credits" and the full-screen control counted), the list strip's rows, and the text box's row fit the table's bands;
  - every landscape screen's bar is one row;
  - on 320 × 568, the text box and the talk button are on screen and the clear area is at least 304 × 196;
  - at 320 × 256, and at a 32-pixel root, the model gives the stacked layout, with every control in the page's flow.

  Check: RED before T011 and T013 (feat/005-full-window-room)
- [ ] T009 [P] Write `apps/web/test/room/fit.test.ts` (FR-010, FR-011, FR-015; plan §4.2, §5):
  - `bufferRatio` is `min(dpr, level ratio, √(cap ÷ area))`, never below 0.5, at the four levels and ratios of 1, 1.5, 2, and 3;
  - the buffer's aspect is within one device pixel of the canvas's;
  - `scene/levels.ts`'s caps are the plan's starting figures, falling with each level;
  - `viewOffsetFor(clear, canvas)` gives `(clear.w, clear.h, −clear.x, −clear.y, canvas.w, canvas.h)`, and every framed box's corners, through that projection, land inside the clear area with the margin, at SC-001's windows;
  - `canvasToClear` maps a canvas point into the clear area's pixels, and a point outside it picks nothing.

  Check: RED before T012 (feat/005-full-window-room)
- [ ] T010 [P] Extend `apps/web/test/ui/degraded.test.ts` (FR-001 to FR-007):
  - in each of FR-002's states, the room block, the HUD's data attributes, and its properties are as in the happy path, and only the conversation's fixed message changes;
  - with no WebGL 2, the 2D drawing sits in the clear box, with the backdrop on the room block and no walking control;
  - with the drawing failing, `flat-failed`'s new words (D9) sit in the clear box, as text a screen reader reads;
  - `room.css` sets the glass's alpha to 1 and no blur under `prefers-reduced-transparency: reduce`, `prefers-contrast: more`, and `@supports not (backdrop-filter …)`, and leaves system colours under `forced-colors: active`;
  - the stacked layout's rules are today's grid at e324771e.

  Check: RED before T013 (feat/005-full-window-room)

### Implementation for Foundational

- [ ] T011 Write `apps/web/src/room/compose/hud.ts` (the table, `layoutFor`, `hudBoxes`, `clearArea`, `fitsHud`, `reservedBoxes`) by plan §2, and change `compose/stages.ts` by plan §3.1. Check: T005, T006, and T007 pass; every existing test that reads the stages passes, or names only a stage that moved, which the note lists (feat/005-full-window-room)
- [ ] T012 Write `apps/web/src/room/fit.ts` (`bufferRatio`, `viewOffsetFor`, `canvasToClear`) and add `pixelCap` to `scene/levels.ts`'s levels at the plan's starting figures (D7). Check: T009 passes (feat/005-full-window-room)
- [ ] T013 Build the room block and its fallbacks:
  - `room.css`: `body.in-room`'s frame gone; `.room` at the window; the clear box at `--clear-*`; the strip, the bar, the column, and the dock positioned from §2.3's properties; the opaque rules; today's grid under `[data-hud="stacked"]`.
  - `layout.ts`: the room's structure in Tab order (plan §6.1); `applyHud(boxes, clear, layout, state)`, which sets the data attributes and the properties through `style.setProperty`; the clear box holding the notes, the offer, the walking control, and the 2D stage.
  - `app.ts`'s `show()` and `toFlat()`: the 2D element and `flat-failed` go into the clear box.
  - `index.html`'s viewport meta gains `viewport-fit=cover`.
  - `apps/web/room/ui-words.yaml`'s `flat-failed` (D9), and the fixture room's words.

  Check: T008 and T010 pass; the existing room tests pass, or change only their layout expectations, which the note lists (feat/005-full-window-room)
- [ ] T014 Align the compositor (plan §10.1 to §10.3):
  - `build/room/checks/rg.ts`: RG6 reserves `reservedBoxes(stage)`, and `pickSweep` takes a stages argument;
  - `scene/bundle3d.ts`'s `selectablePicker` holds the same boxes;
  - `build/room/report.ts`: the "Stages" and "Reserved boxes" lines;
  - `test/fixtures/room/bad/RG6*/expect.yaml`: the reasons whose first stage or count moved, each listed in the note;
  - `test/room/data-only.test.ts`'s free-spot finder clears `reservedBoxes`.

  Record `npm run room:check`'s time and stage count beside T001's. Check: `npm run room:check` passes on the repository's room; the compositor's tests pass; the time is at most twice T001's, or §3.6's smallest-stage-per-aspect rule is applied and recorded (R-7) (feat/005-full-window-room)

**Checkpoint**: the kernel decides the layout and the stages, the floor holds, and the room's degraded paths fill the window; no glass yet.

---

## Phase 3: User Story 1 — The Room Fills the Browser Window, and Follows It (Priority: P1)

**Goal**: the canvas is the window, the buffer follows the ratio within its cap, the room is framed into the clear area by a shifted camera, and every change of the window re-fits it on the next frame, keeping the visit.

**Independent Test**: spec.md User Story 1's.

### Tests for User Story 1 (first)

- [ ] T015 [P] [US1] Extend `apps/web/test/room/scene.test.ts`, `test/room/walking.test.ts`, and `test/ui/pick.test.ts` and `test/ui/highlight.test.ts` (FR-012, FR-014 to FR-018, FR-035; SC-001, SC-014). The 3D stage, with a stub renderer, over SC-001's windows and ratios:
  - `setPixelRatio(bufferRatio(…))` and `setSize(w, h, false)` at the window's CSS size;
  - the camera's aspect is the clear area's, and `setViewOffset` takes `viewOffsetFor`'s numbers;
  - `ink.setStageHeight` gets the canvas's height, and `highlight.setStage` the canvas's size (the initial `REFERENCE_DESKTOP` values are overwritten, so the look doesn't change);
  - a press at each selectable's core selects it;
  - while walking, the follow camera takes the same offset, its farthest distance follows the clear area's aspect, and a missed click walks to the floor point under the pointer;
  - spec 008's targeting and selection cases pass at every step;
  - the bundle's 3D part and the scene's data are unchanged (FR-014).

  Check: RED before T017 (feat/005-full-window-room)
- [ ] T016 [P] [US1] Write `apps/web/test/ui/resize.test.ts` (FR-008, FR-012, FR-013; SC-001), through the room with `hud/viewport.ts` stubbed, in 3D (stub stage) and 2D, over SC-001's steps and full screen entered and left:
  - the room's data attributes and properties are those of `hud.ts` at each window;
  - the conversation, the text box's text, the open resume, the target, the walking view, the quality level, the mode, the panels' states, and focus are unchanged;
  - over 10 s of 20-frame-a-second frames during a continuous resize, the controller holds and steps down 0 times;
  - a keyboard inset changes only `--keyboard`, never the clear area.

  Check: RED before T018 (feat/005-full-window-room)

### Implementation for User Story 1

- [ ] T017 [US1] Change `scene.ts` (the resize with `bufferRatio`; `SceneOptions.clear()`; the shifted camera; `ink` and `highlight` at the canvas), `scene/bundle3d.ts` (`frameCamera(camera, clear, canvas, boxes)`; the picker's points through `canvasToClear`), and `scene/walking.ts` (the production framing at the clear area; taps moved into it) by plan §4.4 and §5. Check: T015 passes (feat/005-full-window-room)
- [ ] T018 [US1] Write `apps/web/src/room/hud/viewport.ts` (plan §4.3) and `app.ts`'s `refit`: the layout and `fitsHud`, the boxes to `layout.ts`, the clear area to the stage, the controller held until `SETTLE_FRAMES` after the last re-fit, and `refit` entries in a drafts build's frame log (`signals/frame-log.ts` gains the event). Check: T016 passes; `test/room/live.test.ts`'s frame-log cases pass with the new event (feat/005-full-window-room)

**Checkpoint**: the room fills any window and follows it; picking, walking, and the highlight hold at every size.

---

## Phase 4: User Story 2 — The Interface Floats Over the Scene as a Translucent HUD (Priority: P1)

**Goal**: the bar at the foot, the column on the right, the dock on an upright phone, in dark glass at the computed floor, with tiles, icons, the collapse toggles, the log's sheet and its larger view, and the resume over the room.

**Independent Test**: spec.md User Story 2's.

### Tests for User Story 2 (first)

- [ ] T019 [P] [US2] Write `apps/web/test/room/hud-contrast.test.ts` (FR-006, FR-024, FR-025; SC-003; plan §6.7):
  - it reads `room.css`'s palette properties, composites the glass over white and black, and the tile face over that, in sRGB;
  - every text pair is at least 4.5:1, and every border, focus ring, and pressed mark at least 3:1;
  - the glass's alpha is the lowest 5% step at which all pass, so the step below fails at least one pair;
  - the fallback rules set the alpha to 1.

  Check: RED before T023 (feat/005-full-window-room)
- [ ] T020 [P] [US2] Write `apps/web/test/ui/hud.test.ts` (FR-019 to FR-023, FR-026 to FR-028, FR-066):
  - **Places**: in the column layout, the bar is the room's foot panel holding the toolbar's tiles in order, and the column holds the list then the conversation; in the dock layout, the dock holds the list's strip, the text box's row, then the bar; the strip is `index.html`'s header, fixed in the room, and the stand-in line sits in the clear box's top left.
  - **Toggles**: the list's header button (`list.heading`) and the log's (`hud.log_toggle`) have `aria-expanded` and `aria-controls` and toggle in one press. A collapsed list keeps every selectable one press away; a collapsed log keeps `role="log"` in the accessibility tree and still announces an answer once.
  - **Always in view**: neither the strip nor the stand-in line can be collapsed, made inert, or hidden in any state.
  - **The resume**: it opens in the clear box, opaque, focus on its heading; "Close" and Escape return focus to "Resume".
  - **The larger view**: `talk.larger` and `talk.smaller` toggle it with `aria-expanded`; answers, failures, and Stop never open or close it; it never changes the clear area; the newest line stays in view.
  - **The blur**: `data-blur` is `on` at quality 0 and 1, and `off` from 2.
  - **The tiles**: every control has its words visible; every icon is SVG, `aria-hidden`, built with no `innerHTML`; every control is at least 44 × 44 in the CSS.
  - **Styles**: `layout.ts` sets properties only through `style.setProperty`, by spy, never `setAttribute("style", …)`.

  Check: RED before T024 (feat/005-full-window-room)
- [ ] T021 [P] [US2] Change `apps/web/test/ui/a11y.test.ts` and `test/ui/narration-room.test.ts` (FR-021, FR-043, FR-048, FR-051): the 320 × 568 cases read `hud-model.ts`; the AI disclosure in the room is the fixed strip, never inert or hidden; the walking control is in the clear box's bottom-right corner; axe reports 0 violations in each layout and panel state, in 3D and 2D. Check: RED before T024 (feat/005-full-window-room)
- [ ] T022 [P] [US2] Extend `apps/web/test/room/vocabulary.test.ts` and the fixture room's words (FR-065): `hud.log_toggle`, `talk.larger`, and `talk.smaller` join the closed list with no slot, and pass RT3 and RT12. Check: RED before T024 (feat/005-full-window-room)

### Implementation for User Story 2

- [ ] T023 [US2] Write the look in `room.css` (the palette's properties at the plan's starting values; the glass; the tiles; the focus ring `#ffd23f`; the pressed and expanded marks; the blur under `[data-blur="on"]` with its `-webkit-` form; 150 ms transitions) and `apps/web/src/room/hud/icons.ts` by plan §6.2, §6.6, and §6.7. Adjust the starting values until T019 passes, and record the final ones in plan.md §6.7 as a departure if they differ. Check: T019 passes (feat/005-full-window-room)
- [ ] T024 [US2] Build the HUD's parts:
  - `layout.ts`: the bar's tiles, the column and the dock, the toggles;
  - `a11y.ts`: the list's header button;
  - `talk.ts` and `talk.css`: the log's toggle, its sheet in the dock layout, and the larger view;
  - `app.ts`: the resume in the clear box, and `data-blur` from the controller's level;
  - `ui-keys.ts` and `apps/web/room/ui-words.yaml`: the new words.

  Check: T020, T021, and T022 pass; `test/ui/talk.test.ts`, `test/ui/resume-room.test.ts`, and `test/ui/walking.test.ts` pass with only their layout expectations changed, listed in the note (feat/005-full-window-room)

**Checkpoint**: the HUD is whole, legible over any part of the scene, and every part of it reachable.

---

## Phase 5: User Story 3 — Spec 004's Checks Run Against the Real Stages (Priority: P1)

**Goal**: RG5 to RG7, RK3, and the report at the new stages, no check weakened, and the lookdev page's window view.

**Independent Test**: spec.md User Story 3's.

### Tests for User Story 3 (first)

- [ ] T025 [P] [US3] Extend `apps/web/test/room/legibility.test.ts`, `budgets.test.ts`, `bundle.test.ts`, and `report.test.ts` (FR-054 to FR-057; SC-002):
  - each readable face's smallest cap height on each new reference stage is at least its height on the legacy stage, and at least the floor;
  - the index's `screen_css` comes from the new reference stages;
  - RK3's total texture memory on the reference phone is at most 96 MB, and the note gives it;
  - the report names the stages and the reserved boxes;
  - with `pickSweep` run at `legacy-stages.ts`'s stages and at the new ones, each side-wall selectable's list-only stages at the new ones are a subset of today's.

  Check: RED before T027 where the report's lines are new; the rest prove T011 and T014 (feat/005-full-window-room)
- [ ] T026 [P] [US3] Extend `apps/web/test/lookdev/page.test.ts` and `phone.test.ts` (FR-059): the "window" view sizes its canvas at the reference screen's full size and shifts the camera into its clear area; the static HUD panels carry the room's classes, with the blur at levels 0 and 1; the metrics panel shows the buffer's size, the ratio, and the cap; the phone copy's own stage is its device's clear area. Check: RED before T028 (feat/005-full-window-room)

### Implementation for User Story 3

- [ ] T027 [US3] Finish `build/room/report.ts`'s lines and any `rg.ts` change T025 asks for (plan §10.1, §10.2). If RK3 is over the cap, record R-6's departure here for the Author. Check: T025 passes; `npm run room:check` and `npm run room:report` pass on the repository's room, the report's new lines in the note (feat/005-full-window-room)
- [ ] T028 [US3] Change `apps/web/src/lookdev/stage.ts` (the window view; `fit()` with `bufferRatio`), `phone.ts`, and `metrics.ts` by plan §10.4. Check: T026 passes; the page stays out of the release build (spec 004's FR-066 test) (feat/005-full-window-room)

**Checkpoint**: every check runs at the stages visitors see, and only gets easier.

---

## Phase 6: User Story 4 — A Press Reaches One Place (Priority: P1)

**Goal**: panels and scene never share a press.

**Independent Test**: spec.md User Story 4's.

- [ ] T029 [P] [US4] Write `apps/web/test/ui/hud-pointer.test.ts` (FR-030 to FR-034; SC-004), with spies on the target store, the selection, and the walking input:
  - a press, drag, wheel, and hover on each panel reach none of them;
  - a hover that moves from the canvas onto a panel clears the pointer's target;
  - a drag from the scene across the conversation panel keeps turning the camera and releases over it with nothing activated;
  - a wheel over the log scrolls it, with no zoom;
  - W typed in the text box leaves the figure still;
  - a press on the scene while walking focuses the walking view;
  - a tap through the stand-in line selects the piece under it.

  Check: the cases that already hold pass at once (the note says which); the rest are RED before T030 (feat/005-full-window-room)
- [ ] T030 [US4] Add what T029 finds missing, by plan §7: `pointer-events: auto` and `overscroll-behavior: contain` on the panels and the strip in `room.css`; the walking view's focus on a scene press in `app.ts`. Check: T029 passes (feat/005-full-window-room)

**Checkpoint**: a press reaches one place.

---

## Phase 7: User Story 5 — Every Visitor Keeps Every Way In (Priority: P1)

**Goal**: keyboard, screen reader, reduced motion, zoom, text size, and the on-screen keyboard, in every layout and in full screen.

**Independent Test**: spec.md User Story 5's.

- [ ] T031 [P] [US5] Write `apps/web/test/ui/hud-a11y.test.ts` (FR-008, FR-009, FR-043 to FR-051; SC-005, SC-006, SC-010):
  - **Tab order**: Tab and Shift+Tab walk spec 002's and 008's order, in both layouts, with each part collapsed and open, in 3D and 2D, in and out of full screen (stubbed), and leave the room's last stop for the page; nothing traps.
  - **Focus return**: as plan §6.4, §6.5, and §8.
  - **Focus not obscured**: `scroll-padding-top` follows `--strip-h`, the panels carry `scroll-margin`, and no fixed element but the strip sits over the page's flow.
  - **Reduced motion**: no transition in the HUD, and a re-fit with no glide.
  - **Zoom**: the viewport meta has no `maximum-scale` or `user-scalable`.
  - **The keyboard**: a visual-viewport keyboard inset lifts the HUD's foot and leaves the clear area.
  - **Safe areas**: the panels pad by `env(safe-area-inset-*)`, and a notched landscape phone's insets (844 × 390, 47 px each side) still give a clear area at least today's stage there.
  - **Axe**: 0 violations in every layout, panel state, mode, and full-screen state.

  Check: RED before T032 (feat/005-full-window-room)
- [ ] T032 [US5] Add what T031 asks for, by plan §6.3, §6.8, §6.9, and §9: the scroll padding and margins, the keyboard's inset in `hud/viewport.ts` and `layout.ts`, the safe areas, and the focus-return wiring in `layout.ts`, `talk.ts`, and `app.ts`. Check: T031 passes (feat/005-full-window-room)

**Checkpoint**: no visitor loses a way in.

---

## Phase 8: User Story 6 — Full Screen, by a Button and a Shortcut (Priority: P2)

**Goal**: the control where the browser offers full screen, Alt+Enter, Escape left to the browser, and the one usage event with its panel and its row.

**Independent Test**: spec.md User Story 6's.

### Tests for User Story 6 (first)

- [ ] T033 [P] [US6] Write `apps/web/test/room/fullscreen.test.ts` (FR-036, FR-041, FR-042; plan §8.1), with a stubbed document:
  - `supported` is true from the unprefixed or WebKit-prefixed names, and false from neither;
  - `toggle()` asks for the root element's full screen with `navigationUI: "hide"`, or leaves it;
  - a rejected request or a `fullscreenerror` calls `onRefused`;
  - `onChange` follows both events' names;
  - `browserOwnsEscape` is true only while in full screen;
  - spies on `navigator.keyboard.lock`, `screen.orientation.lock`, and `requestPointerLock` see 0 calls.

  Check: RED before T036 (feat/005-full-window-room)
- [ ] T034 [P] [US6] Write `apps/web/test/ui/fullscreen.test.ts` (FR-005, FR-036 to FR-040; SC-007):
  - **The control**: it is the bar's tile after "Pause the room" where supported, absent where not (Q4, provisional), and its words follow every change.
  - **The shortcut**: Alt+Enter from every focus place, the text box included, toggles, sends no turn, and moves no figure; nothing happens during the hand-off and its offer.
  - **A refusal** says `fullscreen.refused` once and leaves focus where it was.
  - **Escape**: while in full screen, Escape leaves the walking view, a turn in flight, the resume, and the larger view as they were; after the stubbed exit, the next Escape acts as today.
  - **The words**: `walk.help_fullscreen` and `walk.entered_fullscreen` speak only while in full screen.
  - **The event**: `fullscreen_entered` is emitted once in a visit, on the first entry, and never for a second entry, an exit, a refusal, or a resize.

  Check: RED before T036 (feat/005-full-window-room)
- [ ] T035 [P] [US6] Extend the event's tests (FR-060 to FR-064; SC-011):
  - `apps/web/test/events.test.ts` and `test/manifest.test.ts`: the kinds' list with `fullscreen_entered` last;
  - `services/gateway/test/unit/room-events-config.test.ts`: the pinned kinds;
  - `services/gateway/test/integration/room-events.test.ts`: 204 and a count with `id="-"`, and 400 with an ID;
  - `apps/web/test/disclosure.test.ts`: V4's trigger names the visitor first entering full screen in a visit, before spec 009's closing clause;
  - `deploy/scripts/test_dashboard.py`: the "Visits in full screen" panel, its query's kind, and its description.

  Check: RED before T037 to T039 (feat/005-full-window-room)

### Implementation for User Story 6

- [ ] T036 [US6] Write `apps/web/src/room/fullscreen.ts`. In `app.ts`: the control, the shortcut's listener, `onRefused`, and the event once a visit. Add the guard to `walk/input.ts`, `talk.ts`, `app.ts`'s resume panel, and the larger view. Add the `fullscreen.*` and `walk.*_fullscreen` words to `ui-keys.ts`, `ui-words.yaml`, and the fixture, and `fullscreen` entries to the frame log. All by plan §8. Check: T033 and T034 pass (feat/005-full-window-room)
- [ ] T037 [US6] Add `fullscreen_entered` to `apps/web/src/room/events.ts`, run `npm run manifest` to regenerate `config/room-events.yaml` and the manifest, and mark spec 002's room-events.md §1 and data-model.md §8 "(spec 005)" (H7). In the same commit, change `docs/data-flow-disclosure.md`'s row V4 (T038). Check: T035's web and gateway cases pass (feat/005-full-window-room)
- [ ] T038 [US6] Row V4's Trigger gains ", the visitor first entering full screen in a visit" before spec 009's closing clause (H9), in T037's commit, so the room never sends the kind without the row (FR-064). Check: T035's disclosure case passes (feat/005-full-window-room)
- [ ] T039 [US6] In one commit: spec 000's contracts/telemetry.md §7.8 gains "Visits in full screen" with the spec's query, marked "(spec 005)"; `deploy/grafana/dashboards/h4-runtime.json` gains the panel beside "Visits that walked" (H8). Check: T035's dashboard case passes (feat/005-full-window-room)

**Checkpoint**: full screen works where the browser offers it, Escape stays the browser's, and its one event is counted, graphed, and disclosed.

---

## Phase 9: User Story 7 — Nothing About the Layout Ever Degrades (Priority: P1)

**Goal**: the faults end to end, with nothing sent but today's requests and the one event.

**Independent Test**: spec.md User Story 7's.

- [ ] T040 [P] [US7] Write `apps/web/test/ui/hud-faults.test.ts` (FR-001 to FR-007; SC-009), fault-injection runs over:
  - FR-002's states;
  - no WebGL 2;
  - the 2D drawing failing;
  - full screen refused;
  - no backdrop blur (`CSS.supports` stubbed);
  - a fall to 2D at the frame floor while in full screen;
  - a lost context while in full screen.

  Each must end with the room filling the window, the HUD usable, the AI disclosure in view, and the stand-in line in view while it applies, with 0 blank or frozen scenes. A fetch and beacon spy must see no request beyond today's but one `fullscreen_entered`. Check: RED for any fault the code doesn't yet meet, then GREEN after T041 (feat/005-full-window-room)
- [ ] T041 [US7] Fix what T040 finds, in the module it names. Check: T040 passes (feat/005-full-window-room)

**Checkpoint**: the layout never degrades.

---

## Phase 10: Polish, the review, the note, and the Author's steps

- [ ] T042 Run `make lint`, `make test`, and `make check ENGINE_MODE=none-yet` in the worktree, and `gitleaks dir`. Paste each whole output into the note. Also record:
  - the entry chunk's gzip size beside T001's (SC-015);
  - `npm run room:check`'s time and stage count beside T001's;
  - that `package-lock.json`'s diff is empty (FR-029);
  - that the response headers' tests are unchanged (FR-066).

  Check: all pass; `make up ENV=dev-cpu`'s compose config is unchanged (FR-067) (feat/005-full-window-room)
- [ ] T043 Write `apps/web/room/README.md`'s "The HUD and the window" (plan §13), and finish ADR 0043 with any departure. Bring plan.md's departures section up to date. Check: `make test`'s docs-links check passes (feat/005-full-window-room)
- [ ] T044 Draft the merge-request note, `docs/merge-requests/<date>-feat-005-full-window-room.md`, and commit it as a save point. It holds:
  - what changed and why, with the Author's words quoted;
  - each FR's status;
  - the departures;
  - the RED and GREEN runs;
  - T042's outputs;
  - the stages and the floor's result, and the list of changed test expectations;
  - the Author's steps as short, wrap-proof lines.

  Check: the note exists on the branch (feat/005-full-window-room)
- [ ] T045 Review by an agent that wrote none of the work: `REVIEW.md`'s passes (bugs, security, compliance with spec.md, plan.md, and the constitution, and cost and telemetry), with the findings in the note. Check: the findings are recorded; the reviewer is named (feat/005-full-window-room)
- [ ] T046 Fix the review's findings, each in its own commit with a test where it changes behaviour, and finish the note. Check: T042's commands pass again, their outputs replaced in the note (feat/005-full-window-room)
- [ ] T047 Author: from main's checkout, run `tools/gates/gate feat/005-full-window-room`, and merge with the command it prints. Check: `refs/heads/main` holds the branch's tip (main)
- [ ] T048 Author: bring the room up as he does, and look at the live room in his browser (SC-013; Q2's answer):
  - resize the window from small to large;
  - look at the glass over the scene's light and dark parts;
  - use the bar and the column;
  - try a phone held upright and sideways, and full screen where the browser offers it;
  - with a keyboard-only and a screen-reader run, walk the note's checklist (SC-005).

  He records a yes or a no in a follow-up note, naming anything that doesn't read or doesn't fill. A change to the look is a new intent. Check: his note exists (main)
- [ ] T049 Author: from a drafts build, run the lookdev page's 2-minute window run on the reference phone, on the reference desktop, and on a large monitor (SC-008). Record each run's median frame rate, its share of frames within 33 ms, its settled level, its buffer, and its cap. A cap to tune is a fix branch. Check: his figures are in the follow-up note (main)
- [ ] T050 Author: accept ADR 0043 or leave it proposed; give a yes or a no to Q4 and to D1 to D11, each provisional. A no to D1 removes the event, the panel, and the row's words in one fix branch, the deviation then named in the ADR. Check: his answers are recorded beside T000's (main)

---

## Dependencies and execution order

- **T000** before everything. **Setup** (T001 to T004): T001 first; T002 to T004 in parallel after it. T004 must run before T011.
- **Foundational** (T005 to T014): the tests T005 to T010 in parallel, then T011 and T012 in parallel, then T013, then T014 (it needs the new stages and the clear box). Every story waits for this phase.
- **User Story 1** (T015 to T018) before User Stories 2 and 4 to 6, which lay their parts over a re-fitting room. **User Story 3** (T025 to T028) can run beside User Story 2 once Phase 2 is done.
- **User Stories 4 and 5** after User Story 2: they test the HUD's parts.
- **User Story 6** after User Story 2: its control sits in the bar. Within it, T037 and T038 land in one commit, and T039 in another.
- **User Story 7** after User Stories 1, 2, and 6: its faults cross all three.
- **Polish** last. T045's reviewer has written none of T001 to T044. The Author's T047 to T050 follow the note.

## Parallel lanes, by example

- Phase 2's tests: T005, T006, T007, T008, T009, and T010 touch six different test files.
- After Phase 3: one lane for User Story 2 (`room.css`, `layout.ts`, `talk/`), and one for User Story 3 (`build/room/`, `src/lookdev/`).
- In Phase 8: T033, T034, and T035's tests touch different files, and T035's gateway and dashboard tests are outside `apps/web`.

## Implementation strategy

- **The minimum that ships**: Phases 1 to 4 and 9. The room fills the window under the HUD, with the degraded paths. User Stories 3 to 5 make it fit to merge, by the constitution and spec 004's checks. User Story 6 adds full screen.
- **The order is the risk's**: the floor and the model (T007, T008) come first, since §3.5's ladder may change the table before anything is built on it.
