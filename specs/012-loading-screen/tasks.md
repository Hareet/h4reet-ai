---

description: "Task list for spec 012, the room's loading screen"
---

# Tasks: The Room's Loading Screen — A Game-Style Progress Bar, the Page Faded Behind, and Hints

**Input**: the documents in `specs/012-loading-screen/`: [spec.md](spec.md) (FR-001 to FR-055, SC-001 to SC-011, the Clarifications taken provisionally, Amendments L1 to L11, The Hint Copy, and its Data-Flow Disclosure Entries), [plan.md](plan.md) (decisions PD-1 to PD-25, §2 to §15, the risks R-1 to R-12, and its Revision section), and the contracts [loading-progress.md](contracts/loading-progress.md) and [hints.md](contracts/hints.md).

**Prerequisites**: the Author accepts the intent and approves the spec, the plan, and the provisional answers (T000). He did, as taken, on 2026-11-09 (T000). Until then no task below starts: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`." The intent was accepted provisionally by the session on 2026-11-09 while the Author was away; Q1 to Q5 and D1 to D13 are the session's, and provisional.

**Revision**: revised on 2026-11-09 after a `/speckit-analyze` pass over e2d4d3e1 (plan.md's Revision section). The task numbers stand; the one task the revision adds, T041, sits in its phase out of numeric order.

**Tests**: required. In each phase the test tasks come first and must fail (RED) before the code that makes them pass (GREEN); the branch's note records both runs. A task that only proves an existing rule passes at once, and the note says so. Every check runs inside `make test` or `make check`, so no `CHECK_GATES` entry is added.

**Organization**:
- **One branch**, `feat/012-loading-screen`, in its own worktree, cut from `feat/005-full-window-room`'s tip, or from `refs/heads/main` once spec 005 has merged (plan §13).
- **The phases**: Setup; Foundational, which holds the progress model, the gates, the motion hold, and the room's sequence with its ceiling and every degraded path, before any look (Principle I); User Story 1 (the bar, P1); User Story 2 (the page behind, P1); User Story 3 (the hints, P1); User Story 4 (accessibility, P1); User Story 5 (the faults end to end, P1); User Story 6 (the event, the row, and the panel, P2); then Polish, the review, the note, and the Author's steps.
- **Parallel lanes**: tasks marked [P] touch files no unfinished task of their phase touches, so agents can take them in worktrees of their own, one per agent that writes, the commits cherry-picked onto the branch in task order. Agents never merge.
- **The branch ends** with a review by an agent that wrote none of it, then a merge-request note, `docs/merge-requests/<date>-feat-012-loading-screen.md`, holding `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s.

## Format: `[ID] [P?] [Story?] Description (branch)`

- **[P]**: can run in parallel with the other [P] tasks of its group: different files, no dependency on an unfinished task.
- **[USn]**: the user story of a story phase. Setup, Foundational, and Polish tasks carry none.
- **"Author:"** opens a task only the Author does: in his own terminal, on `main`, in his browser, or on his devices. Agents never do these steps.
- **Check** ends each task: what proves it done. **The branch** ends each task.

## Path conventions

- The room: `apps/web/src/room/` (`loading/`, `app.ts`, `layout.ts`, `motion.ts`, `quality.ts`, `stage.ts`, `scene.ts`, `scene/loader.ts`, `scene/avatars.ts`, `faces/fonts.ts`, `events.ts`, `ui-keys.ts`, `signals/frame-log.ts`, `compose/bundle.ts`), `apps/web/room/` (`hints.yaml`, `ui-words.yaml`), `apps/web/build/room/`, `apps/web/test/`.
- "PD-n", "§n", and "R-n" are plan.md's; "Qn", "Dn", "FR-nnn", "SC-nnn", and "Ln" are the spec's; "contract §n" is loading-progress.md's, and "hints §n" is hints.md's.
- jsdom lays nothing out: the card's place, the tints, and the reflow are proven by their CSS rules, read by the tests, by the geometry model, and by the Author's runs (T039).
- **Every layout**: where a test says "in each layout", it runs with `data-hud` set to `column`, `dock`, and `stacked`, through spec 005's stubbed viewport at a window that gives each.

---

## Before any phase

- [x] T000 Author: accept or close the intent, and approve spec.md and plan.md and the provisional answers, or change any of them:
  - the intent, in the spec's folder rather than `intent/` (the spec's Deviations);
  - Q1 to Q5, each taken as option A (the spec's Clarifications);
  - D1 to D13 (the spec's defaults), each the session's;
  - FR-035: whether his hints 1 and 2 show always, as he wrote them (D6), or only while free talk is ready (`when: free_talk_ready`);
  - the session's twelve hints, 4 to 15 (The Hint Copy): approve, rewrite, reorder, or remove;
  - and whether `spec/012-loading-screen-r2` merges on its own after its gate or travels at the base of `feat/012-loading-screen`.

  **Approved on 2026-11-09, as taken.** His words, as the main session relays them, verbatim: "Also we aprove of the spec 012: the loading screen". In the session's words: he accepts the intent, in the spec's folder as the spec's Deviations name it; he approves spec.md, plan.md, Q1 to Q5 (each option A) and D1 to D13 as taken, and The Hint Copy as written, his three hints and the session's twelve; and FR-035 is answered as D6 took it, so his hints 1 and 2 show always, with no `when`, and its marker is resolved that way. He changed none of them. On the documents' road: the main session cut `feat/012-loading-screen` at `spec/012-loading-screen-r2`'s tip, b0bd247e, so the documents travel at the branch's base and one gate covers both; that is the main session's direction, not an answer of his. Before his approval this read, as history: the intent accepted provisionally by the session on 2026-11-09 while the Author was away; Q1 to Q5 and D1 to D13 the session's, and provisional.

  Check: his answers are recorded here, in the session's words, as spec 005's T000 records his; the intent's and the spec's Status say which answers he confirmed and which he changed, and FR-035's marker is resolved by his answer (spec/012-loading-screen-r2)

---

## Phase 1: Setup

**Purpose**: the base confirmed, the numbers read, and the ADR and the contract passages written down.

- [x] T001 Create the worktree with `git worktree add -b feat/012-loading-screen <new folder> <base>`, the base `feat/005-full-window-room`'s tip if spec 005 hasn't merged, else `refs/heads/main`, after reading the base's SHA; run `npm ci --ignore-scripts --cache "$TMPDIR/npm"`; cherry-pick `spec/012-loading-screen-r2`'s commits if the base lacks them. Then read and record in the note:
  - **The base's spec 005 rules** that plan R-10 lists, re-read at the base; any that moved since af82c6c5 is a departure recorded before T014 and T017.
  - **`fix/007-image-readiness`**: whether it is in the base; the file of its test of the room's build reads, and the list's constant, which T041 extends.
  - **Numbers**: the next free ADR number, read across every `refs/heads/*` (0044 is taken on `docs/001-ec2-default`; D10 expects 0045); the release build's entry chunk and its stylesheet, gzipped, as `test/room/chunk.test.ts` measures them; and the index, serialized and gzipped at level 9 as that test measures it, by a scratch script outside the repository, since the test's index assertion sits behind `main`'s failing digest check (R-11).

  The browsers' and the screen readers' facts (plan §6.1, PD-4) are the Author's, in T039's checklist. Check: `git rev-parse HEAD` prints the base's full SHA; each item is recorded; any difference from plan PD-10, PD-17, PD-21, or R-10 is a departure recorded in plan.md in the same commit, before any task builds on it (feat/012-loading-screen)
- [x] T002 [P] Write ADR 0045 (or the next free number T001 found), status proposed, `docs/adr/00NN-the-room-loads-behind-a-loader.md`, by plan §10, quoting the Author's words, with its row in `docs/adr/README.md`. Check: `make test`'s docs-links check passes (FR-054) (feat/012-loading-screen)
- [x] T003 [P] Amend the living interfaces, each passage marked "(spec 012)", by plan §11: spec 002's `contracts/room-scene.md` §1 and §3 (L1, L2); spec 004's `research.md` R-28, a note under step 4 worded as spec 009's FR-022 words it for avatars (L6); spec 004's `contracts/room-bundle.md` §3.1 (L7); and spec 004's `contracts/room-data-files.md` §1, §9, and §13.5, each new rule with its lenient and strict behaviour (L8, L9). The event's passages change with its code (T030 to T032). Check: `make test`'s docs-links check passes; the reviewer (T036) reads each passage against the FRs it serves (feat/012-loading-screen)

**Checkpoint**: the base and the numbers are recorded, and the decisions are written down.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the progress model, the 3D stage's side, the motion hold, and the room's sequence with its ceiling, with every degraded path, before any look. No user story starts before this phase passes.

### Tests for Foundational (first)

- [x] T004 [P] Write `apps/web/test/room/loading-progress.test.ts` (FR-010 to FR-014; SC-001; contract §1, §2):
  - the shares sum to 100; `code` 10, `text` 2, `typefaces` 3, `files` 85;
  - a file counts its served bytes as a share of the expected total on `loaded`, `failed`, or `skipped`, once, and nothing on `retried` or for an asset not expected;
  - **ends before `expected` count once it arrives**: `skipped` for every file, heard before `expected`, counts in full the moment `expected` is called, and the files' part has then ended; a mix of ends before and after counts each once;
  - before `expected`, the files' part counts 0; an empty list or a total of 0 ends it at once; a second `expected` is ignored; duplicate assets count once;
  - over 200 seeded random orders of ends, and the adversarial orders (the largest file last, the smallest file last, the three steps last), of a room with the repository's 21 model sizes, two avatars' files, and the three steps, some ends heard before `expected`: the value equals the ended shares' sum rounded down after each end, never goes down, is at most 99 until complete, and is 100 once complete;
  - the stage is `code`, then `pieces` with `done` and `total`, then `finishing`, then `done`;
  - no method throws on an unknown part, asset, or outcome.

  Check: RED before T008 (feat/012-loading-screen)
- [x] T005 [P] Extend `apps/web/test/room/loader.test.ts` and `test/room/scene.test.ts` (FR-015, FR-021; SC-003; contract §3):
  - with `modelGate` open (the loader showing), a set model parses and swaps as soon as its file arrives;
  - once `gaveWay` resolves, before the hand-off's first frame, the gate is closed: a file arriving then parses only after the hand-off ends;
  - a parse begun before `gaveWay` finishes, and its swap waits at `swapGate` for the hand-off's end;
  - `stop()` during a `swapGate` wait swaps nothing and lets the hold go; a lost context's `reload()` during it works as today;
  - with no `gaveWay` (the lookdev page), the gate closes at the first `showHandoff`, as figures' does today;
  - `scene/avatars.ts`'s show-after-the-hand-off rule follows the same `closed`;
  - the fetch's options are unchanged (`integrity`, `redirect: "error"`, same-origin, the timeout), and so are the order, the slots, and the events;
  - `Stage3D.expected` resolves with each model and figure entry as `{ asset, bytes }`; with `[]` where nothing loads; with the list below the floor, each then `skipped`; and with `[]` when the loader chunk fails to import; it never rejects.

  Check: RED before T009 (feat/012-loading-screen)
- [x] T006 [P] Write `apps/web/test/ui/loading-degraded.test.ts` (FR-001 to FR-009, FR-011, FR-017 to FR-023, FR-049; SC-002), through `startRoom` with the 3D stage stubbed and a stub clock:
  - no WebGL 2: no loader, and the 2D hand-off starts as today;
  - the 3D chunk late at `SCENE_WAIT_MS`, or failing: the loader says `loading.ready` once, gives way at once (`2d`), and the 2D hand-off plays;
  - the frame floor, and a lost context that doesn't restore, while it shows: it says `loading.ready` and gives way (`2d`);
  - every part ended: it gives way (`ready`) and the hand-off starts once spec 009's figures wait has ended too, never before;
  - a file still loading at 7 s: it gives way (`ceiling`), saying `loading.cut_short`, and the hand-off starts no later than 7 s after "Enter";
  - a failed and a skipped file: each counts as ended, and the placeholder note shows as today;
  - below the floor, every file skipped before the list arrives: it gives way when the steps end, well before 7 s, and sends no event;
  - no `roomData`: the text's step is ended at once;
  - the view throwing as it is built: no card, and the hand-off starts no later than the ceiling;
  - the motion store is held while the loader shows (`animate` false, `paused` false, no "Paused at") and released at give-way;
  - each of the local tier off, the budget spent, the kill switch `degraded` and unknown, the live source off, and the tier unknown: the loader behaves the same;
  - the hand-off never starts before the loader gives way, in every run;
  - a fetch and beacon spy sees no request beyond today's;
  - in a drafts build, the frame log records `loading` with `shown`, `ended`, and `gave_way` and its `why`; in a release build, nothing.

  Check: RED before T011 (feat/012-loading-screen)
- [x] T007 [P] Extend `apps/web/test/room/faces.test.ts`, `test/room/quality.test.ts`, and `test/room/motion.test.ts` (FR-010, FR-020, FR-024): `TypefaceLoader.settled()` resolves once every typeface has arrived or failed, or at `TYPEFACE_WAIT_MS`, and with no `document.fonts` at `TYPEFACE_WAIT_MS`; `LOADING_CEILING_MS` is at most 7,000 and at least `SCENE_WAIT_MS` plus 1,500; `motion.hold()` makes `animate` false, leaves `paused` and `pausedAt` as they were, counts two holds, and its release is idempotent. Check: RED before T010 (feat/012-loading-screen)

### Implementation for Foundational

- [x] T008 [P] Write `apps/web/src/room/loading/progress.ts` by contract §2 and plan §2, keeping ends heard before `expected` (PD-22). Check: T004 passes (feat/012-loading-screen)
- [x] T009 [P] Change `apps/web/src/room/scene/loader.ts` (`modelGate`, `swapGate` raced with `stop()`, its header's step 4, L6), `scene.ts` (`expected`; `closed` from `gaveWay` or the first `showHandoff`; both gates from it; comments naming spec 009's FR-019 (a) and FR-022 as L11 amends them), `scene/avatars.ts` (its hand-off test reads `closed`), and `stage.ts` (`Stage3D.expected`, `ExpectedFile`, `SceneOptions.gaveWay`), by plan §3. Check: T005 passes; the existing loader, scene, avatars, and lookdev tests pass, or change only for the gates, which the note lists (feat/012-loading-screen)
- [x] T010 [P] Add `settled()` to `apps/web/src/room/faces/fonts.ts` (PD-15), `LOADING_CEILING_MS` to `quality.ts` (PD-7), and `hold()` to `motion.ts` (PD-20). Check: T007 passes (feat/012-loading-screen)
- [x] T011 Build the room's sequence by contract §4 and plan §4:
  - `app.ts`: the model, the timer, the motion hold, `gaveWay` handed to the 3D stage, `recordAsset` feeding the model from "Enter", the parts' ends (the text's at once with no `roomData`), `giveWay(why)` once from any road, the hand-off on the loader and the figures' wait together, `toFlat` giving way first, and the frame log's `loading` entries (`signals/frame-log.ts` gains the event);
  - `layout.ts`: `setLoading(on)`, which sets `data-loading` on the page's root and toggles `inert` on "Around the room" (PD-18);
  - `loading/view.ts` as a skeleton: the section, its heading, and the progress bar with its ARIA values, no look and no hints yet.

  Check: T006 passes; `test/ui/handoff.test.ts`, `test/ui/handoff-wait.test.ts`, `test/ui/degraded.test.ts` (its "Loading the room…" expectations become the loader's), and `test/ui/a11y.test.ts` (its Tab order at "Enter" becomes the loader's controls) pass, or change only where the hand-off now waits for the loader, each change listed in the note (feat/012-loading-screen)

**Checkpoint**: the room waits for its files within the ceiling, gives way on every road, shows its models while it waits and none from its giving way to the hand-off's end, holds the scene still, and never holds the hand-off; no look yet.

---

## Phase 3: User Story 1 — A Game-Style Progress Bar From "Enter" Until the Room Is Ready (Priority: P1)

**Goal**: the card, the bar, the percentage, the stage line, and the room's announcements.

**Independent Test**: spec.md User Story 1's.

### Tests for User Story 1 (first)

- [x] T012 [P] [US1] Write `apps/web/test/ui/loading.test.ts` (FR-013, FR-016, FR-018, FR-022, FR-037 to FR-039, FR-052; contract §5):
  - the DOM as contract §5 draws it, in its place in the room's element;
  - **the first value** (FR-013): with the scene module resolved behind the choice, the bar's first `aria-valuenow` is at least 10; with it pending, 0;
  - the progress bar's `role`, name, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext` ("64%: Loading the room's pieces: 12 of 21") after each end;
  - the stage line's words in each stage, from the UI words; the percentage;
  - the fill's fraction set by `style.setProperty` on the bar, by spy, never `setAttribute("style", …)`;
  - focus on the loader's heading at the start, and the room's status region saying nothing then, so "Loading the room" is said once; `loading.ready` or `loading.cut_short` once at the end; nothing for a change of value;
  - **the fade** (FR-022): at give-way the card is `inert` at once, the hand-off's first `show` comes in the same turn, and the card is gone by 250 ms on the stub clock; under reduced motion, gone at once;
  - focus on the room's heading at give-way, from anywhere in the card.

  Check: RED before T014 (feat/012-loading-screen)
- [x] T013 [P] [US1] Extend `apps/web/test/room/vocabulary.test.ts` and the fixture room's words (FR-051): the twelve keys join the closed list, `loading.pieces` with `{done}` and `{total}`, `hints.position` with `{n}` and `{total}`, the rest with no slot; RT3 and RT12 pass. Check: RED before T015 (feat/012-loading-screen)

### Implementation for User Story 1

- [x] T014 [US1] Finish `apps/web/src/room/loading/view.ts`'s bar, stage line, and fade, and write `loading/loading.css`'s card in each layout and its bar (PD-10, PD-11, PD-19, PD-23): the card's own background and colour, its fixed place below `--clear-y` plus `--notes-h` in the column and dock layouts, its grid row in the stacked one, its focus rings, no fixed text heights, no sheen. Check: T012 passes (feat/012-loading-screen)
- [x] T015 [US1] Add the twelve words to `apps/web/src/room/ui-keys.ts`, `apps/web/room/ui-words.yaml` (D8's texts), and the fixture room's words; name the loader in `layout.ts`'s header (L10). Check: T013 passes (feat/012-loading-screen)

**Checkpoint**: the bar fills from "Enter" and says when the room is ready or cut short.

---

## Phase 4: User Story 2 — The Room's Page Behind the Loader, Dimmed, Drawing In (Priority: P1)

**Goal**: the tints by element in each layout, the card clear of the strip and the notes, nothing behind taking input, the scene held still, and the room's pieces shown behind the loader as they arrive.

**Independent Test**: spec.md User Story 2's.

- [x] T016 [P] [US2] Write `apps/web/test/ui/loading-page.test.ts` and `apps/web/test/ui/loading-notes.test.ts` (FR-024 to FR-027, FR-042; SC-003):
  - **the tints, per layout**, from `loading.css`'s rules under `html[data-loading="on"]`: in the column and dock layouts they name only `.room-stage-view`, `.hud-bar`, `.hud-panels`, and `.room-around`; in the stacked layout only `.room-stage-view`, `.hud-bar`, `.room-list`, `.talk`, and `.room-around`, never `.hud-panels`; each is a `::after` with `position: absolute`, `inset: 0`, and `pointer-events: none`; each tinted element is positioned in its layout, by `room.css`'s rules or `loading.css`'s `position: relative` (`.room-around` in every layout; `.hud-bar`, `.room-list`, and `.talk` in the stacked one), and `.talk` is never given a position in the dock layout; no rule names `.disclosure`, `.room-clear`, `.room-notes`, `.room-note`, `.room-stand-in`, or `.room-loader`;
  - **the card, per layout**: `.room-loader` carries its own `color` and `background` outside any `data-hud` rule; in the column and dock layouts it is `fixed`, `z-index: 4` (under the strip's 5), with `top: calc(var(--clear-y) + var(--notes-h))`; in the stacked layout it is `static` with `grid-area: loader`, and both stacked templates under `data-loading="on"` put `loader` first, before `stage`;
  - **the geometry** (`loading-notes.test.ts`, as `test/ui/hud-notes.test.ts` is one): the card's box from `loading.css`'s formulas over `compose/hud.ts`'s numbers, and the notes' box from the model's real text widths, never meet at the windows spec 005's review measured nor across `sweepScreens()`; and the card's top is at or below the strip's measured box at each;
  - `data-loading` is `on` while the loader shows and gone after;
  - "Around the room" is inert while it shows and not after; the room's other parts stay inert until the hand-off ends, as today;
  - a pointer move and a press over the tinted stage reach no target or selection, by spy;
  - the motion store's `animate` is false while the loader shows;
  - with the 3D stage's loader stubbed, each set model and figure's file that ends before the loader gives way is swapped in before it gives way, and none from its giving way to the hand-off's end.

  Check: RED before T017 for the CSS and geometry cases; the inert, motion, and swap cases may pass after T011, and the note says which (feat/012-loading-screen)
- [x] T017 [US2] Write the tints in `apps/web/src/room/loading/loading.css` (PD-9) per layout, with the stacked grid's `loader` row, and the tints' reduced-motion, reduced-transparency, more-contrast, and forced-colours rules. Check: T016 passes (feat/012-loading-screen)

**Checkpoint**: the visitor sees the room come together, dimmed and still, with the AI disclosure and the stand-in line untouched in every layout.

---

## Phase 5: User Story 3 — Hints Below the Bar (Priority: P1)

**Goal**: the hints file, its checks and their modes, its slots and their road into the image, the index's field, the copy, the rotation, and the hint area.

**Independent Test**: spec.md User Story 3's.

### Tests for User Story 3 (first)

- [x] T018 [P] [US3] Write `apps/web/test/room/hints-compose.test.ts`, with fixtures under `apps/web/test/fixtures/room/hints/` (FR-032 to FR-035; hints §1 to §4):
  - the shape (RD): unknown keys, a duplicate `id`, a bad `by`, a `when` other than `free_talk_ready`, a list outside 1 to 20, `words_from` on a session hint, `sources` on an Author's;
  - RT2 over a hint's text and RT3 on a digit outside a slot, refused in both modes;
  - RT9 on a quote not in its intent and RT14 on a session hint with no source or one the tree doesn't hold: refused in strict mode, not run in lenient mode, so a lenient build of a tree with no `specs/` passes;
  - RT15: an Author's hint whose text differs from its quote by one character, or one space, refused in both modes;
  - RT16: a hint over 160 characters or over 25 words once filled, refused in both modes;
  - RT17: an unknown slot, a `{ui:…}` key off the list or holding a slot, and a slot whose configuration file or key is missing: left out with a `warn` in lenient mode, refused in strict;
  - `family.ts`'s catalogue registers RT14 to RT17 with those modes;
  - `when: free_talk_ready`: built in with readiness's `freeTalk` true, left out with it false, with no report;
  - the slots filled from fixture copies of `config/budgets.yaml`, `config/routing.yaml`, and `config/prices.yaml` (the last version's entry for prod's fallback model), and the amounts written `$5`, `$0.10`, `$0.50`, and `$0.075`;
  - the index's `hints` in the file's order; empty with no file.

  Check: RED before T022 (feat/012-loading-screen)
- [x] T019 [P] [US3] Write `apps/web/test/room/hints.test.ts` over the repository's `apps/web/room/hints.yaml` (FR-029, FR-033, FR-034; SC-004; hints §5): fifteen hints in The Hint Copy's order; the Author's three equal his quotes in `specs/012-loading-screen/intent.md` exactly, with no `when` (D6); "Send", the path names, hint 7's keys, "local", and "est." pinned to their sources; each filled figure equal to the repository's configuration; each at most 160 characters and 25 words. Check: RED before T023 (feat/012-loading-screen)
- [x] T020 [P] [US3] Write `apps/web/test/room/loading-hints.test.ts` (FR-030; SC-005; contract §6): with a stub clock, the machine advances every 6 seconds while `running`; never while `hovered`, `paused`, `hidden`, or `stopped`; focus entering the controls stops it, and moving focus between them doesn't stop it again after "Play hints"; "Play hints" leaves both `paused` and `stopped`; the rotation control's words follow the state; "Previous hint" and "Next hint" wrap and work in every state; the timer restarts at each change. Check: RED before T024 (feat/012-loading-screen)
- [x] T021 [P] [US3] Extend `apps/web/test/ui/loading.test.ts` with the hint area (FR-028, FR-030, FR-031, FR-036): the live region is empty when the card is built and holds the first hint after the next tick; `hints.position` reads its place; the rotation control reads "Pause hints" or "Play hints" and has no `aria-pressed`; each new hint reaches the live region once; the controls never move focus; a hint's text reaches the DOM as text, by a hint holding `<b>`; no hint area when the index's `hints` is empty; nothing of the hints left in the room after give-way. Check: RED before T024 (feat/012-loading-screen)

### Implementation for User Story 3

- [x] T022 [US3] Build the hints in the compositor (plan §7.1 to §7.4): the schema with `when` in `build/room/schema.ts`; the read in `build/room/load.ts`; the filler, `build/room/hints.ts`, with its exported path constants and `when`; RT2, RT3, and RT9 extended and RT14 to RT17 in `build/room/checks/rt.ts`, registered in `family.ts` with their modes (PD-13); the index's `hints` in `compose/bundle.ts` and `build/room/emit.ts`. Check: T018 passes; `npm run room:check` passes on the repository's room (feat/012-loading-screen)
- [ ] T041 [US3] The image's reads (PD-21; FR-033), once `fix/007-image-readiness` is in the base (T001 records it; until then this task waits, and the note says so): add `build/room/hints.ts`'s three path constants to that branch's list of the files the room's build reads, and to the `Dockerfile`'s build stage the copies its test then asks for: `config/routing.yaml`, `config/prices.yaml`, and `config/budgets.yaml`, each where the list doesn't already hold it. Check: that branch's test passes with the new paths; a built web image's index holds hints 12 to 14, read through the agents' engine as `make` relays it, or, where the session can't, by one batched script for the Author that returns only the index's `hints` (`CLAUDE.md`) (feat/012-loading-screen)
- [x] T023 [US3] Write `apps/web/room/hints.yaml` from The Hint Copy, verbatim, with each hint's slots, its `words_from` or its sources (hints §1), as T000's answers leave the copy and FR-035's `when`. Check: T019 passes; `npm run room:check` prints no RT warning for it (feat/012-loading-screen)
- [x] T024 [US3] Write `apps/web/src/room/loading/hints.ts` (the rotation, PD-12) and the hint area in `loading/view.ts` and `loading.css`, the live region filled on the next tick (PD-24), the clock's timer set from the machine's state. Check: T020 and T021 pass (feat/012-loading-screen)

**Checkpoint**: the hints show, rotate, pause, restart, and step, from data the compositor has checked, in a checkout and in the image alike.

---

## Phase 6: User Story 4 — Every Visitor Can Follow the Loading (Priority: P1)

**Goal**: keyboard, screen reader, reduced motion, contrast, zoom, text size, and text spacing, in every state of the loader and every layout.

**Independent Test**: spec.md User Story 4's.

- [x] T025 [P] [US4] Write `apps/web/test/ui/loading-a11y.test.ts` and `apps/web/test/room/loading-contrast.test.ts` (FR-008, FR-022, FR-039 to FR-043; SC-006), in each layout:
  - **Tab order**: Tab and Shift+Tab reach the rotation control, "Previous hint", and "Next hint" and nothing behind the tint, "Around the room" included; nothing traps;
  - **During the fade** (FR-022): from the moment give-way starts, Tab reaches no card control, and a press on one does nothing;
  - **Focus return**: from each hint control, focus lands on the room's heading at give-way;
  - **Focus rings**: `loading.css`'s rule names `.room-loader button:focus-visible` and `.room-loader [tabindex]:focus-visible` under `:root`, with `outline: 2px solid var(--hud-focus)`, outside any `data-hud` rule, so it holds in the stacked layout; its forced-colours rule names the same with `Highlight`;
  - **Reduced motion**: under `prefers-reduced-motion: reduce`, `loading.css` sets no transition or animation on the fill, the hint, or the card, and no rule anywhere draws a sheen;
  - **Text spacing** (WCAG 1.4.12): no rule gives a text element of the card a fixed `height`, `overflow: hidden`, or `overflow: clip`; their sizes are `min-height`;
  - **Reflow**: in the column and dock layouts, the card's `max-height` and `overflow-y: auto`; at 320 × 256 and at a 32-pixel root on 320 × 568, the room is in the stacked layout and the card is in the flow;
  - **The fallbacks** (FR-008): under `prefers-reduced-transparency: reduce`, `prefers-contrast: more`, and `@supports not (backdrop-filter …)`, the card's glass is opaque with no blur, in every layout; under `forced-colors: active`, the card, the track, and the fill take `Canvas`, `CanvasText`, and `Highlight`;
  - **Contrast**: white text on the card's glass over white and over black at 4.5:1 or more; the fill against the track, the track's border against the glass, and the focus ring at 3:1 or more, by `hud-contrast.test.ts`'s compositing;
  - **Axe**: 0 violations while showing, with each hint, paused, cut short, and after give-way, in each layout.

  Check: RED before T026 for any case the code doesn't yet meet (feat/012-loading-screen)
- [x] T026 [US4] Fix what T025 finds, in `loading/view.ts`, `loading/hints.ts`, `loading.css`, or `app.ts`. Check: T025 passes (feat/012-loading-screen)

**Checkpoint**: no visitor loses track of the loading, or is trapped by it, in any layout.

---

## Phase 7: User Story 5 — The Loader Never Holds the Room Back (Priority: P1)

**Goal**: the faults end to end, with nothing sent but today's requests and the one event.

**Independent Test**: spec.md User Story 5's.

- [x] T027 [P] [US5] Write `apps/web/test/ui/loading-faults.test.ts` (FR-001 to FR-009; SC-007), fault-injection runs over: every file slow past the ceiling; a stall with no file ending; every studio file failing; the 3D chunk late and failing; a device below ADR 0010's floor; no WebGL 2; the frame floor and a lost context while the loader shows; the view throwing; no room text; the page hidden while it shows; the stacked layout; and each server state of FR-002. Each run must end with the hand-off started within 7 seconds of "Enter", the AI disclosure in view, the stand-in line in view while it applies, the room usable, the motion hold released, and no loader left on screen; a fetch and beacon spy must see no request beyond today's but at most one `loading_cut_short`. Check: RED for any fault the code doesn't yet meet, then GREEN after T028 (feat/012-loading-screen)
- [x] T028 [US5] Fix what T027 finds, in the module it names. Check: T027 passes (feat/012-loading-screen)

**Checkpoint**: the loader never holds the room back.

---

## Phase 8: User Story 6 — The Author Sees How Often Loading Is Cut Short (Priority: P2)

**Goal**: one usage event, disclosed and graphed.

**Independent Test**: spec.md User Story 6's.

### Tests for User Story 6 (first)

- [x] T029 [P] [US6] Extend the event's tests (FR-046 to FR-048, FR-050; SC-008):
  - `apps/web/test/ui/loading-degraded.test.ts`: `loading_cut_short` emitted once a visit at the ceiling with a file not ended, and never on `ready`, on `2d`, in 2D from the start, below the floor with every file skipped early, or when every file ended in the ceiling's own tick;
  - `apps/web/test/events.test.ts` and `test/manifest.test.ts`: the kinds' list with `loading_cut_short` last;
  - `services/gateway/test/unit/room-events-config.test.ts`: the pinned kinds;
  - `services/gateway/test/integration/room-events.test.ts`: 204 and a count with `id="-"`, and 400 with an `id`;
  - `apps/web/test/disclosure.test.ts`: V4's trigger names the loader giving way at its ceiling while the room's files are still loading, once a visit, before spec 009's closing clause;
  - `deploy/scripts/test_dashboard.py`: the "Visits whose loading was cut short" panel, its query's kind, and its description, which says 2D visits count in the denominator.

  Check: RED before T030 to T032 (feat/012-loading-screen)

### Implementation for User Story 6

- [x] T030 [US6] Add `loading_cut_short` to `apps/web/src/room/events.ts` and the emit in `app.ts`'s `giveWay`; run `npm run manifest` to regenerate `config/room-events.yaml` and the manifest; mark spec 002's room-events.md §1 and data-model.md §8 "(spec 012)" (L3). In the same commit, change row V4 (T031). Check: T029's web and gateway cases pass (feat/012-loading-screen)
- [x] T031 [US6] Row V4's Trigger in `docs/data-flow-disclosure.md` gains ", the loader giving way at its ceiling while the room's files are still loading, once a visit" before spec 009's closing clause (L5), in T030's commit, so the room never sends the kind without the row (FR-050). Check: T029's disclosure case passes (feat/012-loading-screen)
- [x] T032 [US6] In one commit: spec 000's contracts/telemetry.md §7.8 gains "Visits whose loading was cut short" with the spec's query and its reading of the denominator, marked "(spec 012)"; `deploy/grafana/dashboards/h4-runtime.json` gains the panel beside "Visits in full screen", with that description (L4). Check: T029's dashboard case passes (feat/012-loading-screen)

**Checkpoint**: the ceiling's bite is counted, graphed, and disclosed.

---

## Phase 9: Polish, the review, the note, and the Author's steps

- [ ] T033 Run `make lint`, `make test`, and `make check ENGINE_MODE=none-yet` in the worktree, and `gitleaks dir`. Paste each whole output into the note. Also record:
  - the entry chunk's gzip size beside T001's (FR-044; SC-009; at most 8 KB of growth by plan §9);
  - the index's size, serialized and gzipped at level 9 as `test/room/chunk.test.ts` measures it, beside T001's, under 16,384 bytes (R-11);
  - that `package-lock.json`'s diff is empty (FR-045);
  - that the response headers' tests are unchanged (FR-052);
  - `npm run room:check`'s result on the repository's room, with no RT warning for the hints.

  Check: all pass; `make up ENV=dev-cpu`'s compose config is unchanged (FR-053) (feat/012-loading-screen)
- [x] T034 Write `apps/web/room/README.md`'s "The loader and its hints" (plan §10), and finish ADR 0045 with any departure. Bring plan.md's departures section up to date. Check: `make test`'s docs-links check passes (feat/012-loading-screen)
- [x] T035 Draft the merge-request note, `docs/merge-requests/<date>-feat-012-loading-screen.md`, and commit it as a save point. It holds:
  - what changed and why, with the Author's words quoted;
  - his T000 answers, and which provisional answers stand;
  - each FR's status;
  - the departures;
  - the RED and GREEN runs;
  - T033's outputs and figures;
  - the hints as the built index holds them, in a checkout and in the image (T041);
  - the list of changed test expectations;
  - the Author's checklist for T039, and his steps, as short, wrap-proof lines.

  Check: the note exists on the branch (feat/012-loading-screen)
- [ ] T036 Review by an agent that wrote none of the work: `REVIEW.md`'s passes (bugs, security, compliance with spec.md, plan.md, and the constitution, and cost and telemetry), with the findings in the note. Check: the findings are recorded; the reviewer is named (feat/012-loading-screen)
- [ ] T037 Fix the review's findings, each in its own commit with a test where it changes behaviour, and finish the note. Check: T033's commands pass again, their outputs replaced in the note (feat/012-loading-screen)
- [ ] T038 Author: after `feat/005-full-window-room` and `fix/007-image-readiness` have merged, from main's checkout, run `tools/gates/gate feat/012-loading-screen`, and merge with the command it prints. Check: `refs/heads/main` holds the branch's tip (main)
- [ ] T039 Author: bring the room up as he does, and run the note's checklist on the live room, in one batch:
  - **The browsers** (plan PD-4, R-1): in desktop Chrome, Firefox, and Safari, and Android's Chrome, with the network throttled in the developer tools, whether the bar moves only as whole files end (expected), or within one;
  - **The screen readers** (plan §6.1): what NVDA, JAWS, and VoiceOver say when the loader shows, as the bar's value changes, and as each hint appears; expected: "Loading the room" once, the hint once, and no running count;
  - **A keyboard-only run and a screen-reader run** (SC-006), on a wide window, a phone held upright, and the stacked layout (a 400% zoom): each hears or sees that the room is loading, reads its percentage and stage, reads every hint by its controls, and lands on the room's heading when it gives way, unaided and never trapped;
  - **Reflow and text size** (SC-006): at 400% zoom on a 1280 × 1024 window (320 × 256 CSS pixels) and at 200% text on a phone-sized window, 0 parts of the card clipped or overlapping, the page scrolling only vertically;
  - **The look** (SC-010): enter once with the network throttled and once without; watch the bar fill and the room come together behind it, still; read the hints, pause them, and step through them; try a phone held upright.

  He records a yes or a no for each in a follow-up note, naming anything that doesn't read, doesn't fill, or doesn't feel like a game's loader. A change to the look is a new intent; a failed check is a fix branch. Check: his note exists (main)
- [ ] T040 Author: accept ADR 0045 or leave it proposed; any change to Q1 to Q5 or D1 to D13 after seeing the loader live is a fix branch. Check: his answers are recorded beside T000's (main)

---

## Dependencies and execution order

- **T000** before everything. **Setup** (T001 to T003): T001 first; T002 and T003 in parallel after it.
- **Foundational** (T004 to T011): the tests T004 to T007 in parallel; then T008, T009, and T010 in parallel; then T011, which needs all three. Every story waits for this phase.
- **User Story 1** (T012 to T015) after Phase 2. **User Story 2** (T016, T017) after T014, since the tints sit beside the card's stylesheet. **User Story 3** (T018 to T024, T041): its compositor lane (T018, T019, T022, T041, T023) can run beside User Stories 1 and 2 once Phase 2 is done, T041 once `fix/007-image-readiness` is in the base; its view lane (T020, T021, T024) after T014.
- **User Story 4** (T025, T026) after User Stories 1 to 3: it tests their parts.
- **User Story 5** (T027, T028) after User Stories 1 to 3.
- **User Story 6** (T029 to T032) after Phase 2; within it, T030 and T031 land in one commit, and T032 in another.
- **Polish** last. T036's reviewer has written none of T001 to T035 or T041. The Author's T038 to T040 follow the note.

## Parallel lanes, by example

- Phase 2's tests: T004, T005, T006, and T007 touch different test files.
- After Phase 2: one lane for the view (T012 to T017, then T020, T021, T024), one for the compositor's hints (T018, T019, T022, T041, T023), and one for the event (T029 to T032), which touch different files but for `app.ts`'s one emit line, which T030 adds after T011.

## Implementation strategy

- **The minimum that ships**: Phases 1 to 4 and 7. The room waits for its files within the ceiling, shows a bar over its dimmed page in every layout, and never holds the hand-off. User Stories 3 and 4 make it what the Author asked for and fit to merge; User Story 6 adds its graph.
- **The order is the risk's**: T001's records come first, since spec 005's rules (R-10) and `fix/007-image-readiness`'s place in the base (R-4) change what T014, T017, and T041 build; then the degraded paths, before any look.
