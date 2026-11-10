---

description: "Task list for spec 012, the room's loading screen"
---

# Tasks: The Room's Loading Screen — A Game-Style Progress Bar, the Page Faded Behind, and Hints

**Input**: the documents in `specs/012-loading-screen/`: [spec.md](spec.md) (FR-001 to FR-055, SC-001 to SC-011, the Clarifications taken provisionally, Amendments L1 to L11, The Hint Copy, and its Data-Flow Disclosure Entries), [plan.md](plan.md) (decisions PD-1 to PD-19, §2 to §15, the risks R-1 to R-10), and the contracts [loading-progress.md](contracts/loading-progress.md) and [hints.md](contracts/hints.md).

**Prerequisites**: the Author approves the spec, the plan, and the provisional answers (T000). Until then no task below starts: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`." The intent was accepted provisionally by the session on 2026-11-09 while the Author was away; Q1 to Q5 and D1 to D12 are provisional.

**Tests**: required. In each phase the test tasks come first and must fail (RED) before the code that makes them pass (GREEN); the branch's note records both runs. A task that only proves an existing rule passes at once, and the note says so. Every check runs inside `make test` or `make check`, so no `CHECK_GATES` entry is added.

**Organization**:
- **One branch**, `feat/012-loading-screen`, in its own worktree, cut from `feat/005-full-window-room`'s tip, or from `refs/heads/main` once spec 005 has merged (plan §13).
- **The phases**: Setup; Foundational, which holds the progress model, the gates, and the room's sequence with its ceiling and every degraded path, before any look (Principle I); User Story 1 (the bar, P1); User Story 2 (the page behind, P1); User Story 3 (the hints, P1); User Story 4 (accessibility, P1); User Story 5 (the faults end to end, P1); User Story 6 (the event, the row, and the panel, P2); then Polish, the review, the note, and the Author's steps.
- **Parallel lanes**: tasks marked [P] touch files no unfinished task of their phase touches, so agents can take them in worktrees of their own, one per agent that writes, the commits cherry-picked onto the branch in task order. Agents never merge.
- **The branch ends** with a review by an agent that wrote none of it, then a merge-request note, `docs/merge-requests/<date>-feat-012-loading-screen.md`, holding `make check ENGINE_MODE=none-yet`'s whole output and `gitleaks dir`'s.

## Format: `[ID] [P?] [Story?] Description (branch)`

- **[P]**: can run in parallel with the other [P] tasks of its group: different files, no dependency on an unfinished task.
- **[USn]**: the user story of a story phase. Setup, Foundational, and Polish tasks carry none.
- **"Author:"** opens a task only the Author does: in his own terminal, on `main`, in his browser, or on his devices. Agents never do these steps.
- **Check** ends each task: what proves it done. **The branch** ends each task.

## Path conventions

- The room: `apps/web/src/room/` (`loading/`, `app.ts`, `layout.ts`, `quality.ts`, `stage.ts`, `scene.ts`, `scene/loader.ts`, `faces/fonts.ts`, `events.ts`, `ui-keys.ts`, `signals/frame-log.ts`, `compose/bundle.ts`), `apps/web/room/` (`hints.yaml`, `ui-words.yaml`), `apps/web/build/room/`, `apps/web/test/`.
- "PD-n", "§n", and "R-n" are plan.md's; "Qn", "Dn", "FR-nnn", "SC-nnn", and "Ln" are the spec's; "contract §n" is loading-progress.md's, and "hints §n" is hints.md's.
- jsdom lays nothing out: the card's reflow and the tints are proven by their CSS rules, read by the tests, and by the Author's look at the live room.

---

## Before any phase

- [ ] T000 Author: approve spec.md and plan.md, and the provisional answers, or change any of them:
  - Q1 to Q5, each taken as option A (the spec's Clarifications);
  - D1 to D12 (the spec's defaults);
  - FR-035: whether his hints 1 and 2 show always, as he wrote them (D6), or only while free talk is ready;
  - the session's eleven hints, 4 to 14 (The Hint Copy): approve, rewrite, reorder, or remove;
  - and whether `spec/012-loading-screen` merges on its own after its gate or travels at the base of `feat/012-loading-screen`.

  Check: his answers are recorded here, in the session's words, as spec 005's T000 records his; the spec's Status and Clarifications say which answers he confirmed and which he changed, and FR-035's marker is resolved by his answer (spec/012-loading-screen)

---

## Phase 1: Setup

**Purpose**: the base confirmed, the outside facts read, and the ADR and the contract passages written down.

- [ ] T001 Create the worktree with `git worktree add -b feat/012-loading-screen <new folder> <base>`, the base `feat/005-full-window-room`'s tip if spec 005 hasn't merged, else `refs/heads/main`, after reading the base's SHA; run `npm ci --ignore-scripts --cache "$TMPDIR/npm"`; cherry-pick `spec/012-loading-screen`'s commits if the base lacks them. Then read and record in the note:
  - **Integrity and streaming**: whether a `fetch` with `integrity` resolves only after its whole body is read and checked, in desktop Chrome, Firefox, and Safari, and Android's Chrome (expected: yes, by the Fetch standard's main fetch). A difference is recorded against PD-4 and R-1.
  - **The progress bar**: what NVDA, JAWS, and VoiceOver say for a `role="progressbar"` whose value changes while it isn't focused (plan §6.1).
  - **The web image and `config/`** (plan §7.2, R-4): whether the web image's build stage sees any file under `config/`. Build the dev-cpu web image through the agents' engine as `make` relays it, or, where the session can't, ask the Author with one batched script that returns only what the diagnosis needs (`CLAUDE.md`), and read the built `room-data.json`'s and the index's topics' `ready`. If the build sees no `config/`, report it to the Author as a finding of its own, and record the departure §7.2 names before T022 builds on it.
  - **Numbers**: the next free ADR number; the release build's entry chunk and its stylesheet, gzipped, as `test/room/chunk.test.ts` measures them; and the index's size.

  Check: `git rev-parse HEAD` prints the base's full SHA; each item is recorded. Any item that differs from PD-4, plan §6.1, or §7.2 is a departure recorded in plan.md in the same commit, before any task builds on it (feat/012-loading-screen)
- [ ] T002 [P] Write ADR 0044 (or the next free number), status proposed, `docs/adr/00NN-the-room-loads-behind-a-loader.md`, by plan §10, quoting the Author's words, with its row in `docs/adr/README.md`. Check: `make test`'s docs-links check passes (FR-054) (feat/012-loading-screen)
- [ ] T003 [P] Amend the living interfaces, each passage marked "(spec 012)", by plan §11: spec 002's `contracts/room-scene.md` §1 and §3 (L1, L2); spec 004's `research.md` R-28, a note under step 4 (L6); spec 004's `contracts/room-bundle.md` §3.1 (L7); and spec 004's `contracts/room-data-files.md` §1, §9, and §13.5 (L8, L9). The event's passages change with its code (T030 to T032). Check: `make test`'s docs-links check passes; the reviewer (T036) reads each passage against the FRs it serves (feat/012-loading-screen)

**Checkpoint**: the facts are recorded, and the decisions are written down.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the progress model, the 3D stage's side, and the room's sequence with its ceiling, with every degraded path, before any look. No user story starts before this phase passes.

### Tests for Foundational (first)

- [ ] T004 [P] Write `apps/web/test/room/loading-progress.test.ts` (FR-010 to FR-013; SC-001; contract §1, §2):
  - the shares sum to 100; `code` 10, `text` 2, `typefaces` 3, `files` 85;
  - a file counts its served bytes as a share of the expected total on `loaded`, `failed`, or `skipped`, once, and nothing on `retried` or for an asset not expected;
  - before `expected`, the files' part counts 0; an empty list or a total of 0 ends it at once; a second `expected` is ignored; duplicate assets count once;
  - over every order of ends of a room with the repository's 21 model sizes, two avatars' files, and the three steps, the value equals the ended shares' sum rounded down after each end, never goes down, is at most 99 until complete, and is 100 once complete;
  - the stage is `code`, then `pieces` with `done` and `total`, then `finishing`, then `done`;
  - no method throws on an unknown part, asset, or outcome.

  Check: RED before T008 (feat/012-loading-screen)
- [ ] T005 [P] Extend `apps/web/test/room/loader.test.ts` and `test/room/scene.test.ts` (FR-015, FR-021; SC-003; contract §3):
  - with `modelGate` open (the hand-off not started), a set model parses and swaps as soon as its file arrives; with it closed (started), it waits for the hand-off's end, as without the gate today;
  - a parse begun before the hand-off starts finishes, and its swap waits for `swapGate`;
  - `stop()` during a `swapGate` wait swaps nothing and lets the hold go; a lost context's `reload()` during it works as today;
  - the fetch's options are unchanged (`integrity`, `redirect: "error"`, same-origin, the timeout), and so are the order, the slots, and the events;
  - `Stage3D.expected` resolves with each model and figure entry as `{ asset, bytes }`; with `[]` where nothing loads; with the list below the floor, each then `skipped`; and with `[]` when the loader chunk fails to import; it never rejects.

  Check: RED before T009 (feat/012-loading-screen)
- [ ] T006 [P] Write `apps/web/test/ui/loading-degraded.test.ts` (FR-001 to FR-009, FR-017 to FR-023, FR-049; SC-002), through `startRoom` with the 3D stage stubbed and a stub clock:
  - no WebGL 2: no loader, and the 2D hand-off starts as today;
  - the 3D chunk late at `SCENE_WAIT_MS`, or failing: the loader gives way at once (`2d`), saying `loading.ready`, and the 2D hand-off plays;
  - the frame floor, and a lost context that doesn't restore, while it shows: it gives way (`2d`);
  - every part ended: it gives way (`ready`) and the hand-off starts once spec 009's figures wait has ended too, never before;
  - a file still loading at 7 s: it gives way (`ceiling`), saying `loading.cut_short`, and the hand-off starts no later than 7 s after "Enter";
  - a failed and a skipped file: each counts as ended, and the placeholder note shows as today;
  - the view throwing as it is built: no card, and the hand-off starts no later than the ceiling;
  - each of the local tier off, the budget spent, the kill switch `degraded` and unknown, the live source off, and the tier unknown: the loader behaves the same;
  - the hand-off never starts before the loader gives way, in every run;
  - a fetch and beacon spy sees no request beyond today's;
  - in a drafts build, the frame log records `loading` with `shown`, `ended`, and `gave_way` and its `why`; in a release build, nothing.

  Check: RED before T011 (feat/012-loading-screen)
- [ ] T007 [P] Extend `apps/web/test/room/faces.test.ts` and `test/room/quality.test.ts` (FR-010, FR-020): `TypefaceLoader.settled()` resolves once every typeface has arrived or failed, or at `TYPEFACE_WAIT_MS`, and with no `document.fonts` at `TYPEFACE_WAIT_MS`; `LOADING_CEILING_MS` is at most 7,000 and at least `SCENE_WAIT_MS` plus 1,500. Check: RED before T010 (feat/012-loading-screen)

### Implementation for Foundational

- [ ] T008 [P] Write `apps/web/src/room/loading/progress.ts` by contract §2 and plan §2. Check: T004 passes (feat/012-loading-screen)
- [ ] T009 [P] Change `apps/web/src/room/scene/loader.ts` (`modelGate`, `swapGate`, its header's step 4, L6), `scene.ts` (`expected`; both gates from the same function as `figureGate`; comments naming spec 009's FR-019 (a) and FR-022 as L11 amends them), and `stage.ts` (`Stage3D.expected`, `ExpectedFile`), by plan §3. Check: T005 passes; the existing loader, scene, avatars, and lookdev tests pass, or change only for the gates, which the note lists (feat/012-loading-screen)
- [ ] T010 [P] Add `settled()` to `apps/web/src/room/faces/fonts.ts` (PD-15) and `LOADING_CEILING_MS` to `quality.ts` (PD-7). Check: T007 passes (feat/012-loading-screen)
- [ ] T011 Build the room's sequence by contract §4 and plan §4:
  - `app.ts`: the model, the timer, `recordAsset` feeding the model, the parts' ends, `giveWay(why)` once from any road, the hand-off on the loader and the figures' wait together, `toFlat` giving way first, and the frame log's `loading` entries (`signals/frame-log.ts` gains the event);
  - `layout.ts`: `setLoading(on)`, which sets `data-loading` on the page's root and toggles `inert` on "Around the room" (PD-18);
  - `loading/view.ts` as a skeleton: the section, its heading, and the progress bar with its ARIA values, no look and no hints yet.

  Check: T006 passes; `test/ui/handoff.test.ts` and `test/ui/handoff-wait.test.ts` pass, or change only where the hand-off now waits for the loader, which the note lists (feat/012-loading-screen)

**Checkpoint**: the room waits for its files within the ceiling, gives way on every road, shows its models while it waits, and never holds the hand-off; no look yet.

---

## Phase 3: User Story 1 — A Game-Style Progress Bar From "Enter" Until the Room Is Ready (Priority: P1)

**Goal**: the card, the bar, the percentage, the stage line, and the room's announcements.

**Independent Test**: spec.md User Story 1's.

### Tests for User Story 1 (first)

- [ ] T012 [P] [US1] Write `apps/web/test/ui/loading.test.ts` (FR-016, FR-018, FR-037 to FR-039, FR-052; contract §5):
  - the DOM as contract §5 draws it, in its place in the room's element;
  - the progress bar's `role`, name, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext` ("64%: Loading the room's pieces: 12 of 21") after each end;
  - the stage line's words in each stage, from the UI words; the percentage;
  - the fill's fraction set by `style.setProperty` on the bar, by spy, never `setAttribute("style", …)`;
  - the room's status region says `loading.heading` once at the start, `loading.ready` or `loading.cut_short` once at the end, and nothing for a change of value;
  - focus on the loader's heading at the start, and on the room's heading at give-way, from anywhere in the card.

  Check: RED before T014 (feat/012-loading-screen)
- [ ] T013 [P] [US1] Extend `apps/web/test/room/vocabulary.test.ts` and the fixture room's words (FR-051): the twelve keys join the closed list, `loading.pieces` with `{done}` and `{total}`, `hints.position` with `{n}` and `{total}`, the rest with no slot; RT3 and RT12 pass. Check: RED before T015 (feat/012-loading-screen)

### Implementation for User Story 1

- [ ] T014 [US1] Finish `apps/web/src/room/loading/view.ts`'s bar and stage line, and write `loading/loading.css`'s card and bar (PD-10, PD-11, PD-19), the card carrying `.hud-glass`. Check: T012 passes (feat/012-loading-screen)
- [ ] T015 [US1] Add the twelve words to `apps/web/src/room/ui-keys.ts`, `apps/web/room/ui-words.yaml` (D8's texts), and the fixture room's words; name the loader in `layout.ts`'s header (L10). Check: T013 passes (feat/012-loading-screen)

**Checkpoint**: the bar fills from "Enter" and says when the room is ready or cut short.

---

## Phase 4: User Story 2 — The Room's Page Behind the Loader, Dimmed, Drawing In (Priority: P1)

**Goal**: the tints by layer, nothing behind taking input, and the room's pieces shown behind the loader as they arrive.

**Independent Test**: spec.md User Story 2's.

- [ ] T016 [P] [US2] Write `apps/web/test/ui/loading-page.test.ts` (FR-024 to FR-027; SC-003):
  - `loading.css`'s rules under `html[data-loading="on"]` name only `.room-stage-view`, `.room-toolbar`, `.hud-panels`, and `.room-around`, each a `::after` with `pointer-events: none`, and none names `.disclosure`, `.room-notes`, `.room-note`, or `.room-stand-in`;
  - `data-loading` is `on` while the loader shows and gone after;
  - "Around the room" is inert while it shows and not after; the room's other parts stay inert until the hand-off ends, as today;
  - a pointer move and a press over the tinted stage reach no target or selection, by spy;
  - with the 3D stage's loader stubbed, each set model and figure's file that ends before the loader gives way is swapped in before it gives way, and none during the hand-off.

  Check: RED before T017 for the CSS cases; the inert and swap cases may pass after T011, and the note says which (feat/012-loading-screen)
- [ ] T017 [US2] Write the tints in `apps/web/src/room/loading/loading.css` (PD-9), with their reduced-motion, reduced-transparency, more-contrast, and forced-colours rules. Check: T016 passes (feat/012-loading-screen)

**Checkpoint**: the visitor sees the room come together, dimmed, with the AI disclosure and the stand-in line untouched.

---

## Phase 5: User Story 3 — Hints Below the Bar (Priority: P1)

**Goal**: the hints file, its checks and slots, the index's field, the copy, the rotation, and the hint area.

**Independent Test**: spec.md User Story 3's.

### Tests for User Story 3 (first)

- [ ] T018 [P] [US3] Write `apps/web/test/room/hints-compose.test.ts`, with fixtures under `apps/web/test/fixtures/room/hints/` (FR-032 to FR-034; hints §1 to §4):
  - the shape (RD): unknown keys, a duplicate `id`, a bad `by`, a list outside 1 to 20, `words_from` on a session hint, `sources` on an Author's;
  - RT2 over a hint's text; RT3 on a digit outside a slot; RT9 on a quote not in its intent;
  - RT14: a session hint with no source, or one the tree doesn't hold;
  - RT15: an Author's hint whose text differs from its quote by one character, or one space;
  - RT16: a hint over 160 characters once filled;
  - RT17: an unknown slot, a `{ui:…}` key off the list or holding a slot, and a slot whose configuration file or key is missing, left out with a `warn` in lenient mode and refused in strict;
  - the slots filled from fixture copies of `config/budgets.yaml`, `config/routing.yaml`, and `config/prices.yaml` (the last version's entry for prod's fallback model), and the amounts written `$5`, `$0.10`, `$0.50`, and `$0.075`;
  - the index's `hints` in the file's order; empty with no file.

  Check: RED before T022 (feat/012-loading-screen)
- [ ] T019 [P] [US3] Write `apps/web/test/room/hints.test.ts` over the repository's `apps/web/room/hints.yaml` (FR-029, FR-033, FR-034; SC-004; hints §5): fourteen hints in The Hint Copy's order; the Author's three equal his quotes in `specs/012-loading-screen/intent.md` exactly; "Send", the path names, "local", and "est." pinned to their sources; each filled figure equal to the repository's configuration; each at most 160 characters. Check: RED before T023 (feat/012-loading-screen)
- [ ] T020 [P] [US3] Write `apps/web/test/room/loading-hints.test.ts` (FR-030; SC-005; contract §6): with a stub clock, the machine advances every 6 seconds while `running`; never while `hovered`, `paused`, `hidden`, or `stopped`; focus on a control stops it for good; "Previous hint" and "Next hint" wrap and work in every state; the timer restarts at each change. Check: RED before T024 (feat/012-loading-screen)
- [ ] T021 [P] [US3] Extend `apps/web/test/ui/loading.test.ts` with the hint area (FR-028, FR-031, FR-036): the first hint is the index's first; `hints.position` reads its place; the three controls' words and "Pause hints"'s `aria-pressed`; the polite region gets each new hint once; the controls never move focus; a hint's text reaches the DOM as text, by a hint holding `<b>`; no hint area when the index's `hints` is empty; nothing of the hints left in the room after give-way. Check: RED before T024 (feat/012-loading-screen)

### Implementation for User Story 3

- [ ] T022 [US3] Build the hints in the compositor (plan §7.1 to §7.4): the schema in `build/room/schema.ts`; the read in `build/room/load.ts`; the filler, `build/room/hints.ts`; RT2, RT3, and RT9 extended and RT14 to RT17 in `build/room/checks/rt.ts`, registered in `family.ts`; the index's `hints` in `compose/bundle.ts` and `build/room/emit.ts`. Check: T018 passes; `npm run room:check` passes on the repository's room (feat/012-loading-screen)
- [ ] T023 [US3] Write `apps/web/room/hints.yaml` from The Hint Copy, verbatim, with each hint's slots, its `words_from` or its sources (hints §1), as T000's answers leave the copy. Check: T019 passes; `npm run room:check` prints no RT warning for it (feat/012-loading-screen)
- [ ] T024 [US3] Write `apps/web/src/room/loading/hints.ts` (the rotation, PD-12) and the hint area in `loading/view.ts` and `loading.css`, the clock's timer set from the machine's state. Check: T020 and T021 pass (feat/012-loading-screen)

**Checkpoint**: the hints show, rotate, pause, and step, from data the compositor has checked.

---

## Phase 6: User Story 4 — Every Visitor Can Follow the Loading (Priority: P1)

**Goal**: keyboard, screen reader, reduced motion, contrast, zoom, and text size, in every state of the loader.

**Independent Test**: spec.md User Story 4's.

- [ ] T025 [P] [US4] Write `apps/web/test/ui/loading-a11y.test.ts` and `apps/web/test/room/loading-contrast.test.ts` (FR-039 to FR-043; SC-006):
  - **Tab order**: Tab and Shift+Tab reach "Pause hints", "Previous hint", and "Next hint" and nothing behind the tint, "Around the room" included; nothing traps;
  - **Focus return**: from each hint control, focus lands on the room's heading at give-way;
  - **Reduced motion**: under `prefers-reduced-motion: reduce`, `loading.css` sets no transition, animation, or sheen on the fill, the hint, or the card, and give-way removes the card at once;
  - **Reflow**: the card's `max-height` and `overflow-y: auto`, its width rule, and its offset below `--strip-h`;
  - **Forced colours**: the card, the track, and the fill take `Canvas`, `CanvasText`, and `Highlight`;
  - **Contrast**: white text on the card's glass over white and over black at 4.5:1 or more; the fill against the track, the track's border against the glass, and the focus ring at 3:1 or more, by `hud-contrast.test.ts`'s compositing;
  - **Axe**: 0 violations while showing, with each hint, paused, cut short, and after give-way.

  Check: RED before T026 for any case the code doesn't yet meet (feat/012-loading-screen)
- [ ] T026 [US4] Fix what T025 finds, in `loading/view.ts`, `loading/hints.ts`, `loading.css`, or `app.ts`. Check: T025 passes (feat/012-loading-screen)

**Checkpoint**: no visitor loses track of the loading, or is trapped by it.

---

## Phase 7: User Story 5 — The Loader Never Holds the Room Back (Priority: P1)

**Goal**: the faults end to end, with nothing sent but today's requests and the one event.

**Independent Test**: spec.md User Story 5's.

- [ ] T027 [P] [US5] Write `apps/web/test/ui/loading-faults.test.ts` (FR-001 to FR-009; SC-007), fault-injection runs over: every file slow past the ceiling; a stall with no file ending; every studio file failing; the 3D chunk late and failing; a device below ADR 0010's floor; no WebGL 2; the frame floor and a lost context while the loader shows; the view throwing; the page hidden while it shows; and each server state of FR-002. Each run must end with the hand-off started within 7 seconds of "Enter", the AI disclosure in view, the stand-in line in view while it applies, the room usable, and no loader left on screen; a fetch and beacon spy must see no request beyond today's but at most one `loading_cut_short`. Check: RED for any fault the code doesn't yet meet, then GREEN after T028 (feat/012-loading-screen)
- [ ] T028 [US5] Fix what T027 finds, in the module it names. Check: T027 passes (feat/012-loading-screen)

**Checkpoint**: the loader never holds the room back.

---

## Phase 8: User Story 6 — The Author Sees How Often Loading Is Cut Short (Priority: P2)

**Goal**: one usage event, disclosed and graphed.

**Independent Test**: spec.md User Story 6's.

### Tests for User Story 6 (first)

- [ ] T029 [P] [US6] Extend the event's tests (FR-046 to FR-048, FR-050; SC-008):
  - `apps/web/test/ui/loading-degraded.test.ts`: `loading_cut_short` emitted once a visit at the ceiling with a file not ended, and never on `ready`, on `2d`, in 2D from the start, or when every file ended in the ceiling's own tick;
  - `apps/web/test/events.test.ts` and `test/manifest.test.ts`: the kinds' list with `loading_cut_short` last;
  - `services/gateway/test/unit/room-events-config.test.ts`: the pinned kinds;
  - `services/gateway/test/integration/room-events.test.ts`: 204 and a count with `id="-"`, and 400 with an `id`;
  - `apps/web/test/disclosure.test.ts`: V4's trigger names the loader giving way at its ceiling while the room's files are still loading, once a visit, before spec 009's closing clause;
  - `deploy/scripts/test_dashboard.py`: the "Visits whose loading was cut short" panel, its query's kind, and its description.

  Check: RED before T030 to T032 (feat/012-loading-screen)

### Implementation for User Story 6

- [ ] T030 [US6] Add `loading_cut_short` to `apps/web/src/room/events.ts` and the emit in `app.ts`'s `giveWay`; run `npm run manifest` to regenerate `config/room-events.yaml` and the manifest; mark spec 002's room-events.md §1 and data-model.md §8 "(spec 012)" (L3). In the same commit, change row V4 (T031). Check: T029's web and gateway cases pass (feat/012-loading-screen)
- [ ] T031 [US6] Row V4's Trigger in `docs/data-flow-disclosure.md` gains ", the loader giving way at its ceiling while the room's files are still loading, once a visit" before spec 009's closing clause (L5), in T030's commit, so the room never sends the kind without the row (FR-050). Check: T029's disclosure case passes (feat/012-loading-screen)
- [ ] T032 [US6] In one commit: spec 000's contracts/telemetry.md §7.8 gains "Visits whose loading was cut short" with the spec's query, marked "(spec 012)"; `deploy/grafana/dashboards/h4-runtime.json` gains the panel beside "Visits in full screen" (L4). Check: T029's dashboard case passes (feat/012-loading-screen)

**Checkpoint**: the ceiling's bite is counted, graphed, and disclosed.

---

## Phase 9: Polish, the review, the note, and the Author's steps

- [ ] T033 Run `make lint`, `make test`, and `make check ENGINE_MODE=none-yet` in the worktree, and `gitleaks dir`. Paste each whole output into the note. Also record:
  - the entry chunk's and the index's gzip sizes beside T001's (FR-044; SC-009; at most 8 KB of growth by plan §9);
  - that `package-lock.json`'s diff is empty (FR-045);
  - that the response headers' tests are unchanged (FR-052);
  - `npm run room:check`'s result on the repository's room, with no RT warning for the hints.

  Check: all pass; `make up ENV=dev-cpu`'s compose config is unchanged (FR-053) (feat/012-loading-screen)
- [ ] T034 Write `apps/web/room/README.md`'s "The loader and its hints" (plan §10), and finish ADR 0044 with any departure. Bring plan.md's departures section up to date. Check: `make test`'s docs-links check passes (feat/012-loading-screen)
- [ ] T035 Draft the merge-request note, `docs/merge-requests/<date>-feat-012-loading-screen.md`, and commit it as a save point. It holds:
  - what changed and why, with the Author's words quoted;
  - his T000 answers, and which provisional answers stand;
  - each FR's status;
  - the departures;
  - the RED and GREEN runs;
  - T033's outputs;
  - the hints as the built index holds them, and any T001 finding about `config/` in the web image;
  - the list of changed test expectations;
  - the Author's steps as short, wrap-proof lines.

  Check: the note exists on the branch (feat/012-loading-screen)
- [ ] T036 Review by an agent that wrote none of the work: `REVIEW.md`'s passes (bugs, security, compliance with spec.md, plan.md, and the constitution, and cost and telemetry), with the findings in the note. Check: the findings are recorded; the reviewer is named (feat/012-loading-screen)
- [ ] T037 Fix the review's findings, each in its own commit with a test where it changes behaviour, and finish the note. Check: T033's commands pass again, their outputs replaced in the note (feat/012-loading-screen)
- [ ] T038 Author: after `feat/005-full-window-room` has merged, from main's checkout, run `tools/gates/gate feat/012-loading-screen`, and merge with the command it prints. Check: `refs/heads/main` holds the branch's tip (main)
- [ ] T039 Author: bring the room up as he does, and look at the loader on the live room (SC-010):
  - enter once with the network throttled in the browser's developer tools and once without;
  - watch the bar fill and the room come together behind it;
  - read the hints, pause them, and step through them;
  - try a phone held upright.

  He records a yes or a no in a follow-up note, naming anything that doesn't read or doesn't feel like a game's loader. A change to the look is a new intent. Check: his note exists (main)
- [ ] T040 Author: accept ADR 0044 or leave it proposed; any change to Q1 to Q5 or D1 to D12 after seeing the loader live is a fix branch. Check: his answers are recorded beside T000's (main)

---

## Dependencies and execution order

- **T000** before everything. **Setup** (T001 to T003): T001 first; T002 and T003 in parallel after it.
- **Foundational** (T004 to T011): the tests T004 to T007 in parallel; then T008, T009, and T010 in parallel; then T011, which needs all three. Every story waits for this phase.
- **User Story 1** (T012 to T015) after Phase 2. **User Story 2** (T016, T017) after T014, since the tints sit beside the card's stylesheet. **User Story 3** (T018 to T024): its compositor lane (T018, T019, T022, T023) can run beside User Stories 1 and 2 once Phase 2 is done; its view lane (T020, T021, T024) after T014.
- **User Story 4** (T025, T026) after User Stories 1 to 3: it tests their parts.
- **User Story 5** (T027, T028) after User Stories 1 to 3.
- **User Story 6** (T029 to T032) after Phase 2; within it, T030 and T031 land in one commit, and T032 in another.
- **Polish** last. T036's reviewer has written none of T001 to T035. The Author's T038 to T040 follow the note.

## Parallel lanes, by example

- Phase 2's tests: T004, T005, T006, and T007 touch four different test files.
- After Phase 2: one lane for the view (T012 to T017, then T020, T021, T024), one for the compositor's hints (T018, T019, T022, T023), and one for the event (T029 to T032), which touch different files but for `app.ts`'s one emit line, which T030 adds after T011.

## Implementation strategy

- **The minimum that ships**: Phases 1 to 4 and 7. The room waits for its files within the ceiling, shows a bar over its dimmed page, and never holds the hand-off. User Stories 3 and 4 make it what the Author asked for and fit to merge; User Story 6 adds its graph.
- **The order is the risk's**: T001's facts come first, since the `config/` road (R-4) and the integrity reading (R-1) change what T009 and T022 build; then the degraded paths, before any look.
