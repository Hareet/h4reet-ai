# Feature Specification: The Room's Loading Screen — A Game-Style Progress Bar, the Page Faded Behind, and Hints

**Feature Branch**: `spec/012-loading-screen` (this spec, documents only), in a worktree cut from `feat/005-full-window-room` at 60b51de4, since spec 005, not yet merged, rewrote the room's HUD and its arrival, and this builds on both; the implementation branch is `feat/012-loading-screen` ([plan.md](plan.md) §13)

**Created**: 2026-11-09

**Status**: Clarified provisionally, planned, and tasked. Written from the intent beside it, which the session accepted provisionally on 2026-11-09 while the Author was away at dinner, at the main session's direction. Q1 to Q5 (Clarifications) were not put to him: each takes its recommended option, provisionally. So do the defaults D1 to D12, each his to overturn. One needs-clarification marker remains, in FR-035, which D6 settles provisionally so that nothing waits on it. [plan.md](plan.md) and [tasks.md](tasks.md) are beside it. Nothing is built before he approves this spec, the plan, and the provisional answers ([tasks.md](tasks.md) T000).

**Input**: [`intent.md`](intent.md) in this folder: the Author's words of 2026-11-09, verbatim. Also read, on this branch at 60b51de4: the [constitution](../../.specify/memory/constitution.md) 1.0.1 and `CLAUDE.md`; the Spec Kit templates in `.specify/templates/`; [spec 005](../005-full-window-room/spec.md), [its plan](../005-full-window-room/plan.md), and [its tasks](../005-full-window-room/tasks.md), and its note, `docs/merge-requests/2026-11-09-feat-005-full-window-room.md` (the entry chunk's size, the build's file list); [spec 010](../010-anthropic-provider/intent.md)'s intent, for the shape; [spec 002](../002-the-room/spec.md) (FR-005, FR-048, FR-054, SC-005) and its [room-scene.md](../002-the-room/contracts/room-scene.md) §1, §3, §4; [spec 004](../004-room-composition/spec.md) (User Story 9, FR-046 to FR-050, FR-057, FR-083), its [research.md](../004-room-composition/research.md) R-28, and its [room-data-files.md](../004-room-composition/contracts/room-data-files.md) §13.5 and §13.8 (RK1 to RK4); [spec 008](../008-visitor-movement/spec.md) (User Stories 2 and 3, FR-015, FR-038); [spec 009](../009-room-avatars/spec.md) (FR-019, FR-021, FR-022); [spec 007](../007-twin-conversation/spec.md) (FR-015); [spec 000](../000-local-foundations/spec.md) (FR-022, FR-023, FR-030 to FR-034) and its [telemetry.md](../000-local-foundations/contracts/telemetry.md) §7.8; [spec 003](../003-studio-assets/contracts/site-loading.md)'s site-loading contract; the [data-flow disclosure](../../docs/data-flow-disclosure.md), row V4; `config/budgets.yaml`, `config/prices.yaml`, `config/routing.yaml`, `config/twin-readiness.yaml`, `config/room-topics.yaml`, and `config/room-events.yaml`; and the room's code: `src/main.ts`, `src/choice/` (`choice.ts`, `choice.css`, `visit.ts`), `src/room/app.ts`, `layout.ts`, `room.css`, `quality.ts`, `handoff.ts`, `scene.ts`, `scene/loader.ts`, `compose/hud.ts`, `compose/bundle.ts`, `signals/turn-cost.ts`, `a11y.ts`'s announcer, `faces/fonts.ts`, `src/fonts.css`, `src/talk/talk.ts`, `room/ui-words.yaml`, `room/scene.yaml`, `room/topics.yaml`, `build/room/checks/rk.ts` (RK5) and `rt.ts` (RT9), `build/room/readiness.ts`, `index.html`, `vite.config.ts`, `nginx.conf`, the web image's `Dockerfile`, and `test/room/chunk.test.ts`'s budgets. Not read: the browsers' references for the Fetch standard's integrity handling and for the ARIA progress bar, which this session can't open; the facts below about them are the plan's to confirm (its T001).

Summary: from "Enter" until the room is ready, the room shows a loading screen like a game's, over its own page, dimmed. A wide bar fills by the first visit's files as each one ends, weighted by its bytes as served, with a percentage and a line naming what is still loading. Behind it the room draws in: the placeholder shapes first, then each figure and each studio piece as it is shown, since the room's models are now shown while the loader is up rather than only after the hand-off. Below the bar, hints rotate: the Author's three, verbatim, then the session's on talking with the twin, walking, the neon sign, and how costs are metered and capped, each with its source, any figure filled from the project's configuration at build. The loader gives way to the hand-off when every needed file has ended, when the room falls to 2D, or at a 7-second ceiling, which keeps spec 002's SC-005. Every failure takes the room's existing degraded path. The AI disclosure stays above the dimming. Cloud cost: $0. One usage event, sent when the ceiling cuts the loading short, is the only new byte that may leave the device (D1, provisional).

## Clarifications

### Session 2026-11-09 (`/speckit-clarify`, provisional)

The Author was away at dinner. The main session directed this session to take each question's recommended option. Each answer below is **taken provisionally by the session while the Author was away; his T000 approves or changes it.** The questions, their context, and every option are under Questions for `/speckit-clarify`, below.

- **Q1** (what the bar measures, and whether the room waits for its models) → A (recommended), taken provisionally by the session while the Author was away; his T000 approves or changes it. The bar measures the first visit's files: the 3D code, the room's text, the faces' typefaces, the figures' files, and the room's studio models. A file whose size the build records counts its bytes as served once its load has ended; a part whose size the page can't know counts as a step. The room's models are shown while the loader is up, so the room is whole when it gives way (FR-010 to FR-016, FR-021).
- **Q2** ("the web page faded in the background") → A (recommended), taken provisionally by the session while the Author was away; his T000 approves or changes it. The room's own page, behind the loader, dimmed: the HUD's panels and the scene, inert, the scene drawing in as its pieces arrive; the AI disclosure and the stand-in line above the dimming (FR-024 to FR-027).
- **Q3** (how the loader meets the door's choice screen) → A (recommended), taken provisionally by the session while the Author was away; his T000 approves or changes it. The choice screen stays the door, unchanged. "Enter" is the game's "Start": the loader shows from it, over the room's page, and gives way to the hand-off. The bar starts at what already arrived behind the choice (FR-013, FR-017 to FR-023).
- **Q4** (how the hints cycle) → A (recommended), taken provisionally by the session while the Author was away; his T000 approves or changes it. One hint at a time, a new one every 6 seconds (D4), paused while the pointer is over it, stopped once focus is on its controls, with "Pause hints", "Previous hint", and "Next hint", each new hint said once, politely (FR-028 to FR-031).
- **Q5** (what happens when a file is slow, stalls, or fails) → A (recommended), taken provisionally by the session while the Author was away; his T000 approves or changes it. The loader gives way at its ceiling, 7 seconds after "Enter" (D2), or at once when the room falls to 2D; after it, the room's existing paths carry on: pieces still loading are shown after the hand-off, a failed piece keeps its placeholder shape and the placeholder note, a figure keeps its fallback, and a late or failed 3D chunk is the 2D room. No control skips the loader (FR-004 to FR-007, FR-019, FR-020, FR-023).
- **The defaults D1 to D12** (under the questions): each taken provisionally, his to overturn. D6 answers FR-035's needs-clarification marker for now.

## Source: The Author's Words

Quoted as the intent records them, typing included. The reading beside each is this spec's, to correct where it's wrong; it never replaces the words.

> "We may as well get you working on a progress bar as the web assets are downloading, make it like a game progress bar with the web page faded in the background. We should have hints below the progress bar on how to interact with the twin, and what the neon sign displays, how we evaluate costs. "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure." "Ask about the latest work" "click on objects to have the twin start discussing them" . Add this as a complete item to your work to start as I'm away for dinner. You can do it!"

Reading, phrase by phrase:
- "a progress bar as the web assets are downloading" is User Story 1. "The web assets" are read as the first visit's files, the set spec 009's RK5 calls the first visit with the code beside it (Q1; FR-010).
- "make it like a game progress bar" is the bar's form: wide, filling, with a percentage and a line naming what is loading (FR-016), between choosing a character and the level starting (Q3), with tips below (User Story 3).
- "with the web page faded in the background" is User Story 2: the room's own page, dimmed (Q2).
- "We should have hints below the progress bar on how to interact with the twin, and what the neon sign displays, how we evaluate costs." is User Story 3; the session's hints cover the three groups he names, from the repository's facts, each cited (The Hint Copy).
- "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure." "Ask about the latest work" "click on objects to have the twin start discussing them" are his hints 1 to 3, shown as he typed them (FR-029; RT15).
- "Add this as a complete item to your work to start as I'm away for dinner." Read as the whole lifecycle item, started tonight; code waits for his T000.

## User Scenarios & Testing *(mandatory)*

The users are visitors whose device draws the room in 3D, on every screen from a 320-pixel phone to a large monitor, by pointer, touch, keyboard, and screen reader, with or without reduced motion, reduced transparency, more contrast, or forced colours; and the Author, who reads the dashboard and looks at the loader on the live room. User Story 5, the degraded mode, is P1 and ships with User Story 1, as Principle I asks ("Every user-facing capability MUST define its degraded mode before its happy path"); it is listed after the happy paths only because it adds no view, only the proof that the loader never holds the room back. User Story 4's accessibility applies to every story as it ships.

### User Story 1 - A Game-Style Progress Bar From "Enter" Until the Room Is Ready (Priority: P1)

As a visitor, I want to see how far along the room is after I press "Enter", as a game shows its loading bar, so the wait has a shape and an end.

**Why this priority**: The Author's "a progress bar as the web assets are downloading, make it like a game progress bar".

**Independent Test**: In the room's tests, with the 3D chunk, the room's text, the typefaces, and the loader's files stubbed so each ends on command: press "Enter", end the parts one by one in several orders, and read the bar after each: its value is the sum of the ended shares, it never goes back, it reads 100 only when every part has ended, its line names what is left, and the hand-off starts only once it has given way. On a desktop browser with the network throttled, by hand: the bar fills as the room's pieces appear behind it.

**Acceptance Scenarios**:

1. **Given** a device that draws the room in 3D, **When** the visitor presses "Enter", **Then** the loader shows at once over the room's page, with a heading, the bar, its percentage, a line naming what is still loading, and a hint, in place of "Loading the room…".
2. **Given** the 3D code arrived behind the choice screen, **When** the loader shows, **Then** the bar already holds the code's share.
3. **Given** 21 studio files of different sizes, **When** they end one by one, **Then** each adds its bytes as served, as a share of the files' total, and the line reads "Loading the room's pieces: N of 21" with N the files ended.
4. **Given** every needed file has ended, **When** the last one is shown in the room, **Then** the bar reads 100, the line "The room is ready." is said once, the loader fades out, and the hand-off starts.
5. **Given** a piece whose file failed after its retry, **When** it ends, **Then** its share counts as ended, it keeps its placeholder shape, and the placeholder note shows, as today.
6. **Given** the bar reads 64, **When** any part ends, **Then** it reads 64 or more.

---

### User Story 2 - The Room's Page Behind the Loader, Dimmed, Drawing In (Priority: P1)

As a visitor, I want to see the room I'm about to enter, faded behind the loader, and watch it come together, so the wait shows me something real.

**Why this priority**: The Author's "with the web page faded in the background".

**Independent Test**: In the room's tests, with the 3D stage stubbed: while the loader shows, the room's page is built and inert under the dimming layer, the AI disclosure and the stand-in line sit above it, a model whose file ends is shown in the stub stage before the loader gives way, and no parse begins during the hand-off. By hand: the scene behind the loader turns from placeholder shapes into the studio's models as the bar fills.

**Acceptance Scenarios**:

1. **Given** the loader shows, **When** the room's page is drawn, **Then** the HUD's panels and the scene are behind a dimming layer, inert, and visible through it.
2. **Given** the loader shows, **When** the visitor looks at the window's top, **Then** the AI disclosure is above the dimming, undimmed, and legible; and while the twin's figure shows a stand-in, the stand-in line is above it too.
3. **Given** the bicycle's file ends while the loader shows, **When** it is parsed, **Then** the bicycle's model replaces its placeholder in the scene behind the loader, before the loader gives way.
4. **Given** the snowboard's file is still loading when the loader gives way, **When** the hand-off plays, **Then** nothing is parsed or swapped during it, and the snowboard is shown after it ends, as today.
5. **Given** the loader shows, **When** the pointer moves over the dimmed scene, **Then** nothing is targeted or highlighted, and a click does nothing.

---

### User Story 3 - Hints Below the Bar (Priority: P1)

As a visitor, I want short hints while I wait, on how to talk with the twin, what the neon sign shows, and how the project keeps its costs, so I know what to do once I'm in.

**Why this priority**: The Author's "We should have hints below the progress bar on how to interact with the twin, and what the neon sign displays, how we evaluate costs", and his three hints.

**Independent Test**: In the room's tests, with the clock stubbed: the first hint is the Author's first; after 6 seconds the next shows; with the pointer over the hint, it doesn't change; once focus is on a hint control, it never changes on its own again; "Pause hints" stops and "Play hints" restarts; "Previous hint" and "Next hint" wrap; each new hint is said once in a polite region. In the compositor's tests: his three hints equal his quotes exactly, every session hint's source exists, no hint holds a digit outside a slot, and every slot is filled from the configuration or the UI words.

**Acceptance Scenarios**:

1. **Given** the loader shows, **When** its first hint appears, **Then** it reads "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure."
2. **Given** a hint has shown for 6 seconds, the pointer not over it and focus not in its controls, **When** the next tick comes, **Then** the next hint replaces it, and is said once.
3. **Given** the visitor presses "Next hint" on the last hint, **When** it acts, **Then** the first hint shows, and rotation stays stopped.
4. **Given** the cost hints, **When** the build fills their slots, **Then** they read the ceilings and prices that `config/budgets.yaml`, `config/prices.yaml`, and `config/routing.yaml` hold, and a hint whose slot can't be filled is left out and reported, never shown with a gap.
5. **Given** the loader gives way, **When** the room opens, **Then** no hint is shown in the room.

---

### User Story 4 - Every Visitor Can Follow the Loading (Priority: P1)

As a visitor using a keyboard, a screen reader, a large text size, zoom, or reduced motion, I want to know the room is loading, how far along it is, and what the hints say, and never be trapped.

**Why this priority**: Specs 002, 004, 005, and 008 hold the room to WCAG 2.2 level AA. A progress bar, a rotating hint, and a dimmed page are where status, timing, and focus failures come from.

**Independent Test**: A keyboard-only run and a screen-reader run on a wide window and a phone held upright; a reduced-motion run; a 200% text run; a 400% zoom run on a 1280 × 1024 window; the contrast test over white and black; and the automated check in each of the loader's states.

**Acceptance Scenarios**:

1. **Given** a screen reader, **When** the loader shows, **Then** "Loading the room" is said, focus is on the loader's heading, the bar is a progress bar with its value and a text naming the stage, and the hint is said once.
2. **Given** a keyboard only, **When** the visitor presses Tab, **Then** focus moves through "Pause hints", "Previous hint", and "Next hint", and reaches nothing behind the dimming.
3. **Given** focus is on "Next hint", **When** the loader gives way, **Then** focus moves to the room's heading, as at "Enter" today, never to the page's body.
4. **Given** the device asks for reduced motion, **When** the bar's value changes, a hint changes, or the loader gives way, **Then** nothing slides, glows, shimmers, or fades.
5. **Given** a 1280 × 1024 window at 400% zoom, **When** the loader shows, **Then** its heading, bar, line, hint, and controls are all reachable, nothing is clipped, and it scrolls only vertically.
6. **Given** every state of the loader, **When** the automated check runs, **Then** it reports 0 WCAG 2.2 AA violations.

---

### User Story 5 - The Loader Never Holds the Room Back (Priority: P1)

As a visitor on a slow, failing, or limited connection or device, I want the room to open within its usual time whatever the loader is waiting for.

**Why this priority**: Principle I, and spec 002's SC-005: "the hand-off begins no later than 10 seconds after the page was opened" on a typical 4G connection.

**Independent Test**: Fault-injection runs: every file slow past the ceiling; a stall with no file ending; every studio file failing; the 3D chunk late and failing; a device below ADR 0010's floor; no WebGL 2; the frame floor and a lost context while the loader shows; the loader's own view throwing; and each of the server states (the local tier off, the budget spent, the kill switch `degraded` or unknown). Each run ends with the hand-off started no later than 7 seconds after "Enter", the AI disclosure in view, and no request beyond today's but at most one `loading_cut_short`.

**Acceptance Scenarios**:

1. **Given** the room's studio files are still loading 7 seconds after "Enter", **When** the ceiling passes, **Then** the loader says "The room opens now. Some pieces are still on their way and appear as they arrive." once, gives way, the hand-off starts, and those pieces are shown after it ends.
2. **Given** the 3D chunk hasn't arrived 4 seconds after "Enter", **When** the room goes to 2D, **Then** the loader gives way at once and the 2D hand-off plays, as today.
3. **Given** no WebGL 2, **When** the visitor presses "Enter", **Then** no loader shows, and the 2D hand-off starts as today.
4. **Given** the loader's own view throws while building, **When** "Enter" is pressed, **Then** the room goes on without it, and the hand-off starts no later than the ceiling.
5. **Given** the kill switch is `degraded`, **When** the visitor enters, **Then** the loader behaves exactly as at any other time, and only the conversation answers with its fixed messages afterwards.

---

### User Story 6 - The Author Sees How Often Loading Is Cut Short (Priority: P2)

As the Author, I want a graph of how often visitors enter before the room has finished loading, so I know whether the first visit is too heavy for their connections.

**Why this priority**: Principle II ("telemetry that makes it observable in production") and workflow step 7 ("A feature without a graph is not done."). The room loads without it, so it comes second.

**Independent Test**: In the room's tests, with the beacon stubbed: a visit cut short by the ceiling sends one `loading_cut_short` and nothing else; a visit that finishes, falls to 2D, or is in 2D from the start sends none. The gateway's route answers 204 to the kind and counts it, and 400 to the kind with an `id`. The dashboard has the panel with the contract's query. Row V4 names the trigger in the commit that adds the kind.

**Acceptance Scenarios**:

1. **Given** a visit whose loader gives way at the ceiling with a file still loading, **When** it gives way, **Then** one `loading_cut_short` is sent, with no identifier.
2. **Given** a visit whose files all end before the ceiling, **When** the loader gives way, **Then** no event is sent.
3. **Given** the dashboard's "Room" row, **When** the Author opens it, **Then** "Visits whose loading was cut short" shows `loading_cut_short` over `resume_opened` plus `resume_kept`.

---

### Edge Cases

- **A warm cache on a second visit**: the files come from the browser's cache in milliseconds, and parsing is most of the wait; the loader shows for about as long as the parses take, and gives way when the last piece is shown (FR-019).
- **A device below ADR 0010's floor**: every studio file is skipped at once, as today; each counts as ended, and the loader gives way when the code, the text, and the typefaces have settled (FR-006).
- **No studio model and no avatar set at all**: the files' part has nothing to wait for and counts as ended at once (FR-011).
- **The 3D chunk loaded behind the choice, but its loader chunk fails**: the room's models and figures are failed or skipped at once, as today (`scene.ts`), and the files' part ends (FR-006).
- **The texture ledger is full**: a piece that would take it over its limit is skipped, as today, and counts as ended (FR-006).
- **A switch's piece** (a model several poses show): it loads once and counts once, as the loader's entries do (FR-011).
- **The page hidden while the loader shows**: the hints stop rotating; the ceiling runs on the room's clock, as the hand-off's timeline does today, so a visitor returning after it may find the room already open (FR-009).
- **The visitor resizes the window or turns the phone while the loader shows**: the room re-fits behind it, by spec 005's FR-012; the loader's card stays centred in the window and keeps its state (FR-042).
- **Full screen during the loader**: the room takes no input then, as during the hand-off (spec 005's edge case), so the control is inert and Alt+Enter does nothing; a full screen the browser makes by itself re-fits the room behind the loader.
- **A hint whose slot can't be filled**, because a configuration file is missing or its value is absent: the build leaves the hint out and reports it; the others show (FR-033).
- **Long hints at 200% text on a 320-pixel phone**: the hint wraps; the card scrolls inside the window if it must; nothing is clipped (FR-042).
- **The visitor presses "Previous hint" on the first hint**: the last one shows (FR-030).
- **Every file ends in the same frame as the ceiling**: the loader gives way once; it is not cut short if every needed file had ended by then, so no event is sent (FR-046).

## Requirements *(mandatory)*

### Functional Requirements

Terms used below, beside spec 005's (the window, the HUD, the clear area, the stand-in line) and spec 004's (a selectable, a set model, the index):
- **The loader**: the loading screen of this spec: its card (a heading, the bar, the stage line, and the hint area) and the dimming layer under it.
- **The scrim**: the dimming layer over the room's page while the loader shows.
- **The bar**: the loader's progress bar, its value a whole percentage from 0 to 100.
- **The needed files**: FR-010's list.
- **Ended**: a file's load has ended when it is shown in the room, or has failed after its retry, or has been skipped, as the room's loader records each today (`scene/loader.ts`'s outcomes `loaded`, `failed`, and `skipped`); a step has ended when it has settled, arrived or failed.
- **Gives way**: the loader's end, after which the hand-off starts.
- **The ceiling**: FR-020's time after "Enter".
- **The hints**: FR-029's list, in `apps/web/room/hints.yaml`.

**Degraded mode** (defined before the happy paths, Principle I)

- **FR-001**: THE LOADER SHALL run on the visitor's device alone: it SHALL make no request, call no model, and store nothing, and SHALL read only the room's own loading state in page memory, apart from FR-046's one usage event (D1).
- **FR-002**: WHILE the local tier is off, the budget is spent, the kill switch is `degraded` or unknown, the live source is off, or the tier is unknown, THE LOADER SHALL behave exactly as at any other time. Only what the conversation answers SHALL degrade, after the hand-off, as it does today (spec 002 FR-039; spec 007 FR-036).
- **FR-003**: WHERE the room is in 2D from "Enter" (no WebGL 2, or the 3D chunk failed or was refused before "Enter"), THE ROOM SHALL show no loader and SHALL start the 2D hand-off as today (D7).
- **FR-004**: IF the room goes to 2D while the loader shows (the 3D chunk late at `SCENE_WAIT_MS` or failed, its part refused, the frame floor, or a lost context that doesn't restore), THEN THE LOADER SHALL give way at once, saying `loading.ready` once, and the room SHALL take spec 002's path to the 2D hand-off unchanged.
- **FR-005**: WHEN the ceiling passes and a needed file hasn't ended, THE LOADER SHALL say `loading.cut_short` once and give way. The room SHALL then open as it does today with what has arrived: each file still loading goes on, and its piece or figure is shown after the hand-off ends (FR-021); a failed piece keeps its placeholder shape and the placeholder note shows (spec 004 FR-057); a figure keeps its fallback (spec 009 FR-019 (e)).
- **FR-006**: IF a needed file fails after its one retry, or is skipped (below ADR 0010's floor, the texture ledger full, or its loader chunk failing), THEN ITS SHARE SHALL count as ended, and the room SHALL show its piece or figure as today. THE LOADER SHALL NOT retry a file beyond today's one retry, nor wait for a retry again.
- **FR-007**: THE LOADER SHALL never be the only way to the hand-off. The ceiling's timer SHALL belong to the room (`app.ts`), not to the loader's view, so IF the loader's view or its progress model throws, THEN THE ROOM SHALL go on without it and SHALL start the hand-off no later than the ceiling.
- **FR-008**: WHILE the device asks for reduced transparency or more contrast, or forces its colours, or WHERE the browser draws no backdrop blur, THE LOADER'S CARD SHALL be opaque with no blur, and in forced colours SHALL take the system's colours, the bar's fill drawn in the system's highlight colour (spec 005 FR-006).
- **FR-009**: WHILE the page is hidden, THE HINTS SHALL not rotate. The ceiling SHALL run on the room's clock, as the hand-off's timeline does today.

**What the bar measures** (Q1, provisional)

- **FR-010**: WHERE the room draws in 3D, THE NEEDED FILES SHALL be: (a) the 3D code, the scene's chunk the room imports behind the choice screen (spec 002's room-scene.md §4); (b) the room's text, room-data.json's first load at "Enter" (spec 004 FR-061); (c) the faces' typefaces, which the room loads from "Enter" (`faces/fonts.ts`); (d) the figures' files, the stand-in avatar's and the chosen avatar's (spec 009 FR-021); and (e) the room's set models, in `load_order` (spec 004's R-28). Nothing else, and none of them in 2D.
- **FR-011**: EACH PART SHALL count as follows. A figure's file or a set model, whose served size the build records (the 3D part's `bytes`), SHALL count its served bytes, as a share of all such files' total, once its load has ended. A part whose size the page can't know (the 3D code, the room's text, and the typefaces) SHALL count as a step of a fixed share the plan sets, once it has settled. A file several placements or poses share SHALL count once. WHERE no figure's file and no set model is to load, the files' share SHALL count as ended at once.
- **FR-012**: THE BAR'S VALUE SHALL be the sum of the ended shares, as a whole percentage rounded down, SHALL never go down, and SHALL read 100 only when every needed file has ended.
- **FR-013**: AT "ENTER", THE BAR SHALL already count each part that ended behind the choice screen, so it starts where the loading is.
- **FR-014**: THE BAR SHALL read only the loading state the room already keeps: the 3D code's import, the room's text's load, the typefaces' load, and the asset events the room's loader records, in page memory, whether or not row V6's route sends them. IT SHALL add no request, fetch nothing again, and read no response header.
- **FR-015**: THE ROOM'S FILES SHALL keep the browser's integrity check (spec 004's R-28, step 3; spec 009 FR-022). The bar SHALL count a file when its load has ended, and SHALL never read a file's body around that check.
- **FR-016**: THE STAGE LINE SHALL name what is still loading, in UI words: `loading.code` ("Loading the room's code") while the 3D code hasn't arrived; `loading.pieces` ("Loading the room's pieces: {done} of {total}") while a figure's file or a set model hasn't ended; and `loading.finishing` ("Finishing the room") while only the text or the typefaces remain (D8).

**The door, the loader, and the hand-off** (Q3, provisional)

- **FR-017**: THE CHOICE SCREEN SHALL stay as it is (spec 002 FR-001 to FR-004). Behind it, the 3D code SHALL keep loading as today, and nothing else the loader counts SHALL start before "Enter".
- **FR-018**: WHEN the visitor presses "Enter" and the room draws in 3D, THE ROOM SHALL build its page as today and SHALL show the loader over it at once, in place of the stage's line "Loading the room…" (D9).
- **FR-019**: THE LOADER SHALL give way at the first of: every needed file ended; the ceiling; the room in 2D (FR-004). THE HAND-OFF SHALL start once the loader has given way and spec 009's wait for the figures (its FR-019 (a)) has ended, and never before.
- **FR-020**: THE CEILING SHALL be a time after "Enter", on the room's clock, which the plan sets at no more than 7 seconds (D2), so that spec 002's SC-005 holds by construction: the choice screen usable within 3 seconds of the page opening, and the hand-off begun within 10.
- **FR-021**: A SET MODEL AND A FIGURE'S FILE SHALL parse and swap while the loader shows, as their files arrive, or after the hand-off ends, and never during the hand-off. A parse begun before the hand-off starts MAY finish, and its swap SHALL wait for the hand-off's end, as spec 009's FR-022 has it for avatars (Amendments L6, L11).
- **FR-022**: WHEN the loader gives way, IT SHALL fade out in at most 200 ms, and the hand-off SHALL start as the fade begins. WHILE the device asks for reduced motion, there SHALL be no fade (D9).
- **FR-023**: NO CONTROL SHALL skip the loader, as none skips the hand-off (spec 002's room-scene.md §3; Q5).

**The page behind** (Q2, provisional)

- **FR-024**: WHILE the loader shows, THE ROOM'S PAGE SHALL be shown behind it, under the scrim: the HUD's panels and the stage, inert as during the hand-off, and the 3D scene drawing from its first frame, its placeholder shapes first, then each figure and each piece as it is shown (FR-021).
- **FR-025**: WHILE the loader shows, THE AI DISCLOSURE ("You're talking with an AI representation of the Author, not the Author.") SHALL stay above the scrim, undimmed, in view, and legible to spec 005's FR-024 floor; and WHILE the twin's figure shows a stand-in, so SHALL the stand-in line (spec 005 FR-021; spec 009 FR-013; Principle VIII).
- **FR-026**: THE SCRIM SHALL be a tint, with no blur over the moving scene. THE CARD SHALL be the HUD's dark glass (spec 005 FR-025), its blur following the HUD's quality levels.
- **FR-027**: WHILE the loader shows, NOTHING BEHIND IT SHALL take input or focus: a pointer over the scrim targets, highlights, and selects nothing (spec 008 FR-008 (a)), and keys reach only the loader's controls. "Around the room", which the hand-off leaves reachable today, SHALL be inert and tinted too while the loader shows, and reachable again once it gives way, so scrolling the page shows nothing that takes input. The card SHALL stay fixed in the window while the page scrolls.

**The hints** (Q4, provisional)

- **FR-028**: BELOW THE BAR, THE LOADER SHALL show one hint at a time, beginning with the first of the list each visit (D3), with its position, `hints.position` ("Hint {n} of {total}").
- **FR-029**: THE HINTS SHALL be, in order (D3): the Author's three, exactly as he typed them; then the session's, on talking with the twin, the neon sign, and costs, as The Hint Copy below gives them.
- **FR-030**: THE HINTS SHALL rotate, a new one every 6 seconds (D4), WHILE the pointer isn't over the hint area, focus has never been on a hint control during this loader, the visitor hasn't paused them, and the page is visible. "Pause hints" (`hints.pause`) SHALL stop the rotation and become "Play hints" (`hints.play`), which restarts it. "Previous hint" (`hints.previous`) and "Next hint" (`hints.next`) SHALL step through the list, wrapping at its ends. Focus moving onto any hint control SHALL stop the rotation for the rest of the loader (the WAI-ARIA carousel pattern; WCAG 2.2's 2.2.2).
- **FR-031**: EACH HINT SHALL be said once, in a polite live region, as it appears. The hint controls SHALL never move focus.
- **FR-032**: THE HINTS SHALL be data, `apps/web/room/hints.yaml`, which the compositor checks and the bundle's index carries ([contracts/hints.md](contracts/hints.md)). A hint of the Author's SHALL name its words in `words_from` (spec 004's RT9), and its text SHALL equal that quote exactly. A hint of the session's SHALL name its sources, each a file the tree holds. Changing, adding, removing, or reordering a hint SHALL be a data edit. WHERE the file is absent, or every hint is left out (FR-033), THE LOADER SHALL show its bar with no hint area.
- **FR-033**: A HINT SHALL state a figure or a UI word only through a slot, filled at build from `config/budgets.yaml`, `config/prices.yaml`, `config/routing.yaml`, or the room's UI words (D5), and SHALL hold no digit outside a slot (spec 004's RT3). IF a slot can't be filled, THEN THE BUILD SHALL leave that hint out and report it, in lenient mode, or refuse the build, in strict mode. Each hint, filled, SHALL be at most 160 characters.
- **FR-034**: NO HINT SHALL state anything about the Author beyond what the corpus or the repository says, or any figure about him. The Author's hints are his words, quoted, and claim nothing. Spec 004's RT2 SHALL run over every hint.
- **FR-035**: THE AUTHOR'S HINTS 1 AND 2 SHALL be shown [NEEDS CLARIFICATION: whether they show before the twin can take the questions they invite. Free talk isn't ready (`config/twin-readiness.yaml`: `free_talk: { ready: false }`), so a typed question reaches the twin only inside a piece's conversation; and the site's own corpus file, `corpus/08-hareet-ai.md`, is in no topic's pack (`config/room-topics.yaml`). D6 takes "always, as he wrote them" provisionally; the alternative shows them only while the build reads free talk as ready, a data condition the build can already evaluate (`build/room/readiness.ts`).]
- **FR-036**: THE HINTS SHALL show only on the loader. Nothing of them SHALL stay in the room once it gives way.

**Accessibility and reduced motion**

- **FR-037**: THE BAR SHALL be an element with `role="progressbar"`, named by the loader's heading, `loading.heading` ("Loading the room"), with `aria-valuemin` 0, `aria-valuemax` 100, `aria-valuenow` its value, and `aria-valuetext` its value as a percentage and the stage line's words.
- **FR-038**: THE ROOM SHALL say, in its polite status region, `loading.heading` once when the loader shows, and `loading.ready` or `loading.cut_short` once when it gives way. It SHALL NOT announce each change of the value.
- **FR-039**: WHEN the loader shows, FOCUS SHALL move to its heading. Tab and Shift+Tab SHALL reach the hint controls and nothing behind the scrim. WHEN the loader gives way, FOCUS SHALL move to the room's heading, as at "Enter" today, wherever it was, and SHALL never be left on the page's body. NOTHING SHALL trap the keyboard (WCAG 2.1.2).
- **FR-040**: WHILE the device asks for reduced motion, THE LOADER SHALL show no animation: the bar's value jumps to each new value, no glow, shimmer, or fade plays, and a hint changes without a transition (spec 004 FR-059).
- **FR-041**: EVERY LOADER CONTROL SHALL be at least 44 × 44 CSS pixels, with its words visible (spec 002 FR-046), and its states shown by more than colour. EVERY TEXT ON THE CARD SHALL contrast with it at 4.5:1 or more (3:1 for large text), and THE BAR'S FILL against its track, the track's edge against the card, and every focus ring SHALL contrast at 3:1 or more, computed over white and over black beneath, as spec 005's FR-024 computes the HUD's.
- **FR-042**: THE CARD SHALL stay centred in the window below the AI disclosure, re-fitting with it (spec 005 FR-012). At 320 CSS pixels wide, at 200% text, and at 400% zoom on a 1280 × 1024 window, NOTHING SHALL be clipped or overlap: the card SHALL scroll vertically inside the window where it must (WCAG 1.4.4, 1.4.10).
- **FR-043**: THE LOADER SHALL meet WCAG 2.2 level AA in every state: showing, cut short, given way, paused, and with each hint.

**Size and dependencies**

- **FR-044**: THE LOADER'S CODE, STYLES, WORDS, AND HINTS SHALL be in the entry chunk, since the loader shows before the 3D chunk may have arrived, and the entry SHALL stay within spec 002's 150 KB compressed budget, the index within its 16 KB (`test/room/chunk.test.ts`). The plan records the growth.
- **FR-045**: THE LOADER SHALL add no dependency: no package, font, icon set, or image file from outside the repository.

**Telemetry and the dashboard** (D1, provisional)

- **FR-046**: WHEN the loader gives way at the ceiling with a needed file not ended, THE ROOM SHALL send one usage event of the new kind `loading_cut_short`, with no identifier and nothing else, on today's beacon (spec 002 FR-054; its room-events.md §1), at most once a visit. A loader that gives way because every file ended, or because the room went to 2D, SHALL send none.
- **FR-047**: THE ROOM SHALL send no event for the loader's value, its time, its stages, a hint, a hint control, or a file. Nothing about the loading, its duration, or the visitor's connection SHALL leave the device but FR-046's event.
- **FR-048**: THE DASHBOARD'S "Room" row SHALL gain the panel "Visits whose loading was cut short": `loading_cut_short` over `resume_opened` plus `resume_kept`, read as "Visits that walked" is read (spec 000's contracts/telemetry.md §7.8).
- **FR-049**: IN A DRAFTS BUILD, THE FRAME LOG (spec 004's R-70) SHALL record the loader's showing, each part's end with its share, its giving way and why (`ready`, `ceiling`, or `2d`), and each hint shown, in page memory only. A release build SHALL keep no log.

**Data flow**

- **FR-050**: THE DATA-FLOW DISCLOSURE'S ROW V4 SHALL name `loading_cut_short`'s trigger, the loader giving way at its ceiling while the room's files are still loading, once a visit, in the change that sends it (Amendment L5). IF the room would send it without that row, THEN it SHALL NOT be deployed. NOTHING ELSE this spec adds SHALL leave the visitor's device.

**Words, serving, the local stack, and the record**

- **FR-051**: THE UI WORDS this spec adds SHALL join spec 004's closed list (its room-data-files.md §9) and pass its checks (D8): `loading.heading`, `loading.code`, `loading.pieces` (slots `{done}`, `{total}`), `loading.finishing`, `loading.ready`, `loading.cut_short`, `hints.label`, `hints.position` (slots `{n}`, `{total}`), `hints.pause`, `hints.play`, `hints.previous`, and `hints.next`. They state nothing about the Author.
- **FR-052**: THE CHANGE SHALL alter no response header. The loader styles by classes from the site's own stylesheet and by CSS properties the room sets through the CSS object model, which the CSP's `style-src 'self'` allows, never by a `style` attribute (spec 005 FR-066).
- **FR-053**: WHEN the operator runs `make up` on any stack, IT SHALL start as before: no new service, container, port, env key, or secret.
- **FR-054**: A NEW ADR, proposed, at the next free number, SHALL record the decision: the loader from "Enter" to the hand-off, over the room's page; the room's models shown while it shows, never during the hand-off; the ceiling held to spec 002's SC-005; and the hints as data with their figures filled from configuration.
- **FR-055**: THE LOADER'S LOOK SHALL ship without a lookdev approval before the merge, judged by FR-041's contrast test and the review; the Author looks at it on the live room afterwards (SC-010), and a change to it goes through an intent (D12).

### Key Entities

- **The needed files**: per visit, the parts of FR-010, each with its kind (a step or a file), its share, and whether it has ended.
- **The progress**: the ended shares' sum, the bar's value, the stage, and the counts `{done}` and `{total}` of the figures' files and set models.
- **The loader's state**: showing, then given way with its reason (`ready`, `ceiling`, or `2d`).
- **A hint**: its text with slots, who wrote it (the Author or the session), its `words_from` or its sources, and its place in the list.
- **The hints' rotation**: the current hint, and whether the rotation is running, paused by the pointer, paused by the visitor, or stopped by focus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the progress model's tests, over every order of ends of a room with the 3D code, the text, the typefaces, two avatars' files (a model and its clips each), and 21 set models of the repository's sizes, the bar's value equals the ended shares' sum rounded down after every end, never goes down, and reads 100 in 100% of runs exactly when the last part ends, and in 0% before.
- **SC-002**: In the room's tests with every file stubbed, in 100% of runs: the hand-off starts only after the loader gives way; the loader gives way no later than 7 seconds after "Enter" on the room's clock; and with spec 002's 3-second choice screen, the hand-off begins within 10 seconds of the page opening (spec 002's SC-005, by construction).
- **SC-003**: In the room's tests with the 3D stage's loader stubbed, every set model and figure's file that ends before the loader gives way is shown before it gives way, in 100% of runs; 0 parses begin and 0 swaps happen during the hand-off.
- **SC-004**: In the compositor's tests, the Author's three hints equal his quotes in the intent exactly, character for character; 100% of the session's hints cite files the tree holds; 0 hints hold a digit outside a slot; every filled figure equals the configuration's value; and every hint, filled, is at most 160 characters.
- **SC-005**: In the hints' tests, with the clock stubbed, in 100% of runs: a new hint every 6 seconds while nothing pauses it; 0 changes while the pointer is over it, after focus reaches a control, after "Pause hints", or while the page is hidden; "Previous hint" and "Next hint" wrap; each hint said once; and 0 transitions under reduced motion.
- **SC-006**: A keyboard-only tester and a screen-reader tester, on a wide window and a phone held upright, each hear or see that the room is loading, read its percentage and stage, read every hint by its controls, and land on the room's heading when it gives way, unaided and never trapped. The automated check reports 0 WCAG 2.2 AA violations in each loader state. The contrast test passes over white and black. At 320 × 256 CSS pixels and at 200% text on a 320 × 568 window, 0 parts are clipped or overlap.
- **SC-007**: In fault-injection runs over User Story 5's faults, 100% end with the hand-off started within 7 seconds of "Enter", the AI disclosure in view, the stand-in line in view while it applies, and the room usable; 0 end with the loader frozen or the page blank.
- **SC-008**: Over every test run, the network log holds no request beyond today's but at most one `loading_cut_short` per visit, sent in 100% of visits cut short at the ceiling and 0% of others. The gateway's route answers 204 to `{"kind": "loading_cut_short"}` and counts it, and 400 to the same kind with an `id`. The panel holds the contract's exact query, and row V4 names the trigger in the commit that adds the kind.
- **SC-009**: The build's chunk-size check holds the entry within 150 KB and the index within 16 KB, compressed, with the growth recorded in the note. The change adds 0 packages; `make up ENV=dev-cpu` starts unchanged; and its measured cloud cost is $0.
- **SC-010**: After the merge, the Author opens the live room in his own browser, with the network throttled once and not once, and on a phone. He watches the loader fill, reads the hints, and steps through them, and records a yes or a no, naming anything that doesn't read or doesn't feel like a game's loader. A change to the look that follows goes through an intent.
- **SC-011**: Spec 009's hand-off and figures tests, spec 004's loader tests, and spec 005's room tests pass with only the expectations this spec's amendments change, each listed in the note.

## Amendments to Specs 000, 002, 004, 005, and 009

As specs 004, 005, and 008 do, the amended text stays as it is; each amendment supersedes the clause it names from this spec's approval. Clauses were read on this branch at 60b51de4. Rows L3 to L5 depend on D1, provisional, and fall away on a no. [plan.md](plan.md) §11 names the files and the tasks that carry each row.

| ID | Spec and clause | Change | Why |
|---|---|---|---|
| L1 | Spec 002, contracts/room-scene.md §1 (Screens) | A **Loading** screen between **Choice** and **Hand-off**: the loader over the room's page, dimmed, from "Enter" until it gives way, in 3D only. | FR-018, FR-024 |
| L2 | Spec 002, contracts/room-scene.md §3 (the hand-off) and FR-007 | The hand-off starts once the loader has given way. "No skip" covers the loader too. | FR-019, FR-023 |
| L3 | Spec 002, FR-054; contracts/room-events.md §1 (the kinds' table); data-model.md §8; `config/room-events.yaml` | Gains `loading_cut_short`, with no `id`, "sent when the loader gives way at its ceiling with files still loading, once a visit". §3 is unchanged, so the gateway refuses the kind with an `id`. (D1) | FR-046 |
| L4 | Spec 000, contracts/telemetry.md §7.8, "The room (spec 002)" | The row gains "Visits whose loading was cut short": `sum(increase(h4_room_events_total{kind="loading_cut_short"}[$__range])) / sum(increase(h4_room_events_total{kind=~"resume_opened\|resume_kept"}[$__range]))`. The dashboard gains the panel in the same change. (D1) | FR-048; workflow step 7 |
| L5 | `docs/data-flow-disclosure.md`, row V4, its Trigger | Gains "the loader giving way at its ceiling while the room's files are still loading, once a visit". Carries, Never carries, and Why stay spec 002's words. (D1) | FR-050; Principle I |
| L6 | Spec 004, research.md R-28, step 4 ("Two at a time, only after the hand-off (fetches may run during it)") and its rationale; `scene/loader.ts`'s header | A set model parses and swaps while the loader shows, or after the hand-off ends, never during it; a parse begun before the hand-off finishes, its swap waiting for the hand-off's end. The rationale, "the hand-off, which nothing may skip, stays smooth", holds. | FR-021 |
| L7 | Spec 004, contracts/room-bundle.md §3.1 (RoomIndex) | Gains `hints`, the filled hints in order. | FR-032 |
| L8 | Spec 004, contracts/room-data-files.md §1 (the room's data files) and §13.5 (RT) | `apps/web/room/hints.yaml` joins the room's data files. RT2, RT3, and RT9 run over it; RT14 to RT17 are new ([contracts/hints.md](contracts/hints.md) §4). | FR-032 to FR-034 |
| L9 | Spec 004, contracts/room-data-files.md §9 (UI words) | The words of FR-051 join the closed list, with the slots `{done}`, `{total}`, and `{n}`. | FR-016, FR-051 |
| L10 | Spec 005, FR-019 and its terms (the HUD's "status lines (loading, `flat-failed`, full screen refused)") | The loading line is replaced by the loader, laid over the HUD while it shows. Spec 005's FR-021, the AI disclosure and the stand-in line always in view, holds above the scrim. | FR-018, FR-025 |
| L11 | Spec 009, FR-019 (a) and FR-022 ("before the hand-off only within FR-019's wait") | The hand-off also waits for the loader to give way. An avatar may parse and swap while the loader shows, as a set model may. | FR-019, FR-021 |

**Spec 002's SC-005** is not amended: the ceiling holds it (FR-020). **Spec 003's site-loading contract** is not amended: its order and failures stand, and the loader only shows them.

## Assumptions

**Scope**

- **In:** the loader from "Enter" to the hand-off, in 3D; its progress model and its stage line; its card and the scrim; when the room's models and figures parse; the ceiling; the hints, their data file, their checks, and their slots; the UI words; the event, the panel, and row V4's trigger (D1); the frame log's entries; the ADR; and the amendments above.
- **Out:** a loader in 2D, where nothing loads (D7); a boot loader before the choice screen (Q3's option B); downloading the room's models behind the choice (Q3's option D); a control that skips the loader (Q5's option B); streaming bytes within a file around the integrity check (Q1's option D); the hints anywhere in the room after it opens; changes to the hand-off itself, the choice screen, the twin, its readiness, its corpus, its routing, or a model; a service worker or any offline cache.

**Readings**

- **"The web assets"** are the first visit's files: what spec 009's RK5 counts as the first visit (the room's set models and the figures' files), with the code, the room's text, and the typefaces beside them. The site's static page (`index.html`, the entry chunk, its stylesheet, and the page's own font) loads before any script can draw a bar, and the choice screen shows within spec 002's 3 seconds; the bar starts after it (Q3).
- **"Make it like a game progress bar"** reads as a game's loading screen: the bar fills, a percentage, a line naming what is loading ("pieces: 12 of 21"), and tips below. "Enter" is the "Start" a player presses after choosing a character (Q3).
- **Why the room now waits for its models.** In the build of 2026-11-09, the studio models are 6,593,757 bytes as served of a first visit's roughly 6.9 MB, and the code that the hand-off waits for today is about 200 KB, usually loaded behind the choice. A bar over today's waits alone would measure almost nothing and show almost never (Q1's option B). So the loader waits for the models, within the ceiling, and the room is whole when the hand-off plays.
- **Why 7 seconds.** Spec 002's SC-005 allows the choice screen 3 seconds and the hand-off 10 from the page opening; a test presses "Enter" at once, so 7 seconds after "Enter" is the most the loader can take and keep SC-005 by construction. Today's longest wait from "Enter" is `SCENE_WAIT_MS` (4 s) plus `wait_ms` (1.5 s), 5.5 seconds, inside it.
- **Bytes as each file ends, not within it.** As this session understands the Fetch standard, a fetch with `integrity` reads the whole body and checks it before the response resolves, so the page can't watch the bytes of a file the browser is checking. The room keeps that check (FR-015), so a file counts when it has ended. With 21 files of 11 KB to 1 MB and three step parts, the bar moves in about two dozen steps; the plan confirms the standard's behaviour in its T001.
- **Ended, not arrived.** A file counts when its piece or figure is shown, or it failed or was skipped, so the bar reaches 100 when the room is whole, never while parses still run behind a full bar.
- **"Faded"** reads as dimmed by a dark tint, with the room still visible and moving behind it (Q2).
- **The Author's hints as typed.** His hint 3 begins with a lower-case "click", and his hint 2 has no full stop. The caller's brief says his quoted hints are "his copy, verbatim on screen", so they show as typed; the capitals and the punctuation are his to change, as a data edit (RT15 then follows his new words in the intent).
- **Hints 1 and 2 and the twin's readiness** (FR-035). His hint 1 asks the visitor to ask "how this web site is built, how we evaluated outputs, designed and made it secure", and hint 2 to "Ask about the latest work". Today a typed question reaches the twin only inside a piece's conversation, since free talk isn't ready, and the site's own corpus file is in no topic's pack. Inside the laptop's topic, "the latest work" can be asked; the site's own story may get "I don't know", which the twin says when it doesn't (Principle VIII). The session shows both as he wrote them (D6) and puts the choice to him.
- **The hints' order.** Most loads end within one or two hints, so the first hint is the one most visitors read. The order starts with his, in his order (D3).
- **The session's hints** state facts about the room and the project, never about the Author: each cites the repository file it comes from (The Hint Copy). Their figures (the ceilings, the fallback's allowance, the prices) are filled at build from the configuration, so a change to a ceiling or a price changes the hint with it.
- **Dates.** The Author's words are dated 2026-11-09, as the main session's brief gives them.

**Dependencies**

- **Spec 005's branch**, `feat/005-full-window-room`, at 60b51de4, not yet merged: its HUD, its arrival, and its stages. The implementation branch is cut from it, or from `main` once it merges (plan §13).
- **Spec 009's avatars**: no avatar file is bundled on this branch, so the figures' files are 0 bytes today; the loader counts them when they land, with no change.
- **The Author's own steps**: his approval of this spec, the plan, Q1 to Q5, and D1 to D12 (T000); the gate and the merge; his look at the live room (SC-010); his answer to FR-035.

**Deviations** (named, as the constitution's Governance requires: "Deviations require a written justification in the spec and an ADR if permanent.")

- **Inherited: local until publication** (ADR 0013). This spec and its branch are reviewed with a note in `docs/merge-requests/`, not a pull request, and the Author's gate stands in for CI.
- **No other.** The intent states the one event; no permission, allowlist, sandbox domain, header, budget, credential, or human-only file changes; the integrity check stays.

**Defaults taken**, each provisional and the Author's to overturn (Questions, D1 to D12): the event (D1); the ceiling (D2); the hints' order (D3); the rotation's interval (D4); figures as slots (D5); his hints always shown (D6); no loader in 2D (D7); the loader's words (D8); no show delay and a 200 ms fade (D9); the ADR (D10); focus (D11); the look reviewed on the live room (D12).

## Expected Cost Impact

- **Model spend: $0.** Nothing here calls a model, and a turn costs what it costs today.
- **Cloud, transfer: $0 change.** The same files load at the same moments; the loader only watches them. No new file, request, or byte of transfer. No model is downloaded behind the choice (Q3's option D, rejected for its cost).
- **Cloud, requests (D1).** At most one usage-event beacon per visit cut short at the ceiling, about 30 bytes of body, on the site's own origin. At 1,000 visits a month, at most 1,000 small requests, well under a cent at typical edge request prices, inside spec 001's caps once it serves the room. Before publication, $0 (ADR 0013).
- **The entry chunk.** The loader's code, its styles, its words, and the filled hints: an estimated 3 to 8 KB compressed, inside spec 002's 150 KB, of which 40,599 bytes were used after spec 005; the hints, about 2 KB of text, inside the index's 16 KB.
- **The visitor's device.** The same parsing as today, done while the loader shows rather than after the hand-off, under the quality controller's holds, as today. The scrim is a flat tint; the card's blur follows the HUD's quality levels.
- **Local:** no new service, container, or port; `make up` is unchanged. The Author's time: about half an hour for his look at the live room.
- **Development time:** agent sessions on the Author's existing plan, with no metered API spend.
- **Measurement:** the chunk-size check for the bytes; the "Visits whose loading was cut short" panel for how often the ceiling binds (D1); spec 003's asset events, where row V6's route is on, for each file's time.

## Degraded-Mode Behavior

Defined before the happy path, as Principle I asks.

| What is gone or off | The loader | The bar | The hand-off and the room |
|---|---|---|---|
| The local tier off, the budget spent, the kill switch `degraded` or unknown, the live source off, or the tier unknown | unchanged | unchanged | unchanged; only the conversation degrades, after the hand-off (FR-002) |
| No WebGL 2 at "Enter" | not shown (FR-003) | – | the 2D hand-off, as today |
| The 3D chunk late (`SCENE_WAIT_MS`) or failing, or its part refused | gives way at once (FR-004) | – | the 2D hand-off, as today |
| The frame floor, or a lost context that doesn't restore, while it shows | gives way at once (FR-004) | – | the 2D hand-off, as today |
| A file slow past the ceiling, or a stall | gives way at the ceiling, saying `loading.cut_short` (FR-005) | as far as it got | the hand-off within 7 s of "Enter"; the rest shown after it; one `loading_cut_short` (D1) |
| A file failing after its retry | goes on | counts it as ended (FR-006) | its placeholder shape and the placeholder note, or the figure's fallback, as today |
| Below ADR 0010's floor, the ledger full, or the loader chunk failing | goes on | counts each skipped file as ended (FR-006) | placeholder shapes, as today |
| The loader's own view or model throws | gone | gone | the hand-off no later than the ceiling (FR-007) |
| Reduced motion | no fade, glow, shimmer, or transition (FR-040) | jumps | the 1-second hand-off, as today |
| Reduced transparency, more contrast, forced colours, or no backdrop blur | an opaque card; system colours in forced colours (FR-008) | the system's highlight colour in forced colours | – |
| A hint's slot can't be filled | the other hints | – | – (the build reports it, FR-033) |
| The page hidden | the hints stop rotating (FR-009) | unchanged | the room's clock runs, as today |
| The beacon refused or failing (D1) | – | – | `loading_cut_short` isn't retried, queued, or stored (room-events.md §1) |

## Telemetry and the Dashboard

- **Spans:** none new. The room has no tracing in the browser; the beacon's request is the gateway's existing `POST /room/events` server span, which carries no event (spec 002's room-events.md §3).
- **The counter** (D1): `h4_room_events_total{kind="loading_cut_short"}`, through the existing route and `config/room-events.yaml` (Amendment L3).
- **The panel** (D1): "Visits whose loading was cut short" in the "Room" row, beside "Visits that walked", "Visits in full screen", and the 2D share (FR-048). It shows how often the ceiling binds, which says whether the first visit is too heavy for visitors' connections.
- **The frame log**, drafts builds only: the loader's showing, each part's end, its giving way and why, and each hint (FR-049).
- **Never in telemetry:** the bar's value, the loading's duration, a stage, a hint, a control pressed, a file's name or time, or anything about the visitor's connection (FR-047). Spec 003's asset events, row V6, are unchanged: they leave only while `live.asset_events` is `site`, as today.
- **Runbook:** none. Nothing here can page a human.

## Data-Flow Disclosure Entries

For `docs/data-flow-disclosure.md`, in the change that sends `loading_cut_short` (FR-050). Only the Trigger changes. On a no to D1, no row changes and nothing new leaves the device.

| Row | From → To | Trigger | Carries | Never carries | Why | Default; how to switch it off |
|---|---|---|---|---|---|---|
| Spec 002's V4, amended (L5) | as before: the visitor's browser → the site's own origin, `POST /api/room/events`, a beacon | as before, and the loader giving way at its ceiling while the room's files are still loading, once a visit | as before | as before | as before | as before |

Not new rows: the loader reads the room's own state in page memory and sends nothing else (FR-047). Its code and the hints are same-origin static content (row V1).

## The Hint Copy

As it will appear, in order (D3). Slots are filled at build: the figures below are what the configuration on this branch holds, and a change to it changes them (D5). The source column is for review; it isn't shown to visitors. The Author's three are his words, as typed; the session's eleven are written from the repository's facts only, and are his to rewrite.

| # | By | As it will appear | Slots | Source of each fact |
|---|---|---|---|---|
| 1 | the Author | Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure. | – | his words, [intent.md](intent.md) |
| 2 | the Author | Ask about the latest work | – | his words, [intent.md](intent.md) |
| 3 | the Author | click on objects to have the twin start discussing them | – | his words, [intent.md](intent.md) |
| 4 | the session | As you point at a piece you can talk about, a border lights up around it. Each one is also in the "In the room" list, for a keyboard or a screen reader. | `{ui:list.heading}` | spec 008 FR-015 (the highlight's border) and FR-038 (the list reaches every selectable); `apps/web/room/ui-words.yaml` (`list.heading`) |
| 5 | the session | Once a piece has started a conversation, type a question in the conversation's box and press Send. | – | `apps/web/src/talk/talk.ts` (a typed turn goes to the open conversation; the "Send" button); `config/twin-readiness.yaml` (`free_talk: { ready: false }`, so a question needs a piece's conversation first) |
| 6 | the session | Your path at the door sets how deep the twin goes: "Engineer" for each topic's detail, "Not an engineer" for the overview, with the same facts on both. | – | `apps/web/src/choice/visit.ts` (`PATHS`); spec 007 FR-015 ("the corpus's "Role at a glance" layer for the non-engineer path, its topic sections' depth for the engineer path, with the same facts on both") |
| 7 | the session | Press "Walk around" to move: W, A, S, D or the arrow keys walk, Q and E turn, a click on the floor walks there, and Escape stops. On a phone, tap the floor. | `{ui:walk.enter}` | `apps/web/room/ui-words.yaml` (`walk.enter`, `walk.help`); spec 008 User Story 2, scenario 5 (a click on the floor), and User Story 3, scenario 2 (a tap on the floor) |
| 8 | the session | The twin speaks only from a curated, versioned corpus about the Author's real work, and says so when it doesn't know. | – | the constitution, Principle VIII ("It speaks only from a curated, versioned corpus about the Author's real work and says so when it does not know.") |
| 9 | the session | The neon sign on the monitor counts what your conversation costs: "this call" for the latest answer, "this visit" for all of them. | `{ui:sign.call_label}`, `{ui:sign.visit_label}` | spec 004 FR-046 (the sign on the monitor's top edge) and FR-047 (the two counters); `apps/web/room/ui-words.yaml` |
| 10 | the session | On the sign, an answer from the Author's own machine is marked "local" at no cost. A paid cloud answer shows its estimated cost, marked "est.". | – | spec 004 FR-048 ("local · $0"; a paid call's cost "marked "est.""); `apps/web/room/ui-words.yaml` (`sign.local`, `sign.estimated`, `tier.local`) |
| 11 | the session | The sign's figures live only in this page: nothing stores or sends them, and a reload starts them again. An unknown cost reads "cost unavailable". | `{ui:sign.unavailable}` | spec 004 FR-047 ("summed as integer micro-dollars in page memory, never stored or sent, and SHALL start again on reload"), FR-048, and FR-050; `apps/web/src/room/signals/turn-cost.ts` (its header) |
| 12 | the session | The gateway prices every answer from a versioned table: the paid fallback costs $0.10 per million input tokens and $0.50 per million output tokens. | `{price.input}`, `{price.output}` | `config/prices.yaml` (the versioned table, "USD per million tokens"; the latest version's entry for prod's fallback model); `config/routing.yaml` (`envs.prod.fallback`); spec 000 FR-023; `CLAUDE.md` ("Every call carries provider, model, tokens, cost") |
| 13 | the session | The Author's machine answers first, at no marginal cost. A paid cloud model answers only when it can't, inside a $2 daily allowance. | `{budget.fallback_daily_usd}` | `config/routing.yaml` (`envs.prod`: `primary: local`); `config/prices.yaml` (local, "zero marginal cost"); `config/budgets.yaml` (`fallback_daily_usd`); spec 000 FR-022 and FR-030 |
| 14 | the session | A real-time meter caps spend at $5 a day and $20 a month. At a ceiling the twin switches to fixed messages on its own, until the Author resets it. | `{budget.daily_usd}`, `{budget.monthly_usd}` | `config/budgets.yaml` (`envs.prod`); spec 000 FR-031 ("A real-time meter"), FR-033, and FR-034 (an operator reset); the constitution, Principle V ("the system degrades itself without waiting for a human, and a human must consciously restore it") |

Where a hint shows words in quotation marks that are the room's UI words, the slot fills them, so a renamed control renames the hint. "Send", the path names, "local", and "est." are typed, and the plan's tests pin each to its source (plan §7.4).

## Constitution Check

Applied with the `constitution-check` skill's eight questions against constitution 1.0.1.

| Principle | Touched | How it complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | No new request or destination; the bar reads page memory (FR-001, FR-014). One event kind on an existing flow (D1, provisional), with no identifier, disclosed in row V4's trigger in the same change, and refused deployment without it (FR-046, FR-050). Nothing about the loading or the connection leaves the device (FR-047). The degraded mode comes first (FR-001 to FR-009; User Story 5, P1). The whole topology still runs locally with one command (FR-053). |
| II. Production-grade or not shipped | Yes | Every requirement has a test or the Author's look behind it (SC-001 to SC-011). Telemetry with a panel (FR-046 to FR-049); the cost estimate above and its measurement; an ADR (FR-054). No model, so no evals; nothing pages a human, so no runbook. A named deviation only on a no to D1: the loader then ships without a graph. |
| III. Intent before spec, spec before code, humans merge | Yes | From the intent, in the Author's words, verbatim, with the readings beside them. Q1 to Q5 and D1 to D12 are provisional, his to approve or change at T000; FR-035's marker is named. The amendments are named, not edited in. No code on this branch, and the Author merges. |
| IV. Least privilege | No | No permission, allowlist, sandbox domain, header, credential, or human-only path changes (FR-052, FR-053). The browser's integrity check on the room's files stays (FR-015); Q1's option D, which would move it into the page, is rejected. |
| V. Cost is a first-class signal | Yes | $0 model spend; no transfer change; at most one beacon per visit cut short (Expected Cost Impact). Three hints teach the meter, the price table, and the ceilings, their figures read from the configuration that enforces them (D5). |
| VI. Build in public, including failures | Yes | The spec, its provisional answers, the hints' sources, and the cut-short panel are public. |
| VII. Own the whole product, and say exactly what you owned | Yes | The product reasoning beside the systems reasoning: why the room waits for its models, why 7 seconds, why "Enter" is the start (Readings; Questions). The Author's words are quoted, never paraphrased, his hints shown as typed. No hint says what the Author owned or did. |
| VIII. Honest AI | Yes | The AI disclosure and the stand-in line stay above the scrim, undimmed (FR-025). Hint 8 states the twin's limits in the constitution's words. No hint speaks for the Author beyond the repository (FR-034); FR-035 puts to him the hints that invite questions the twin may not yet answer. |
| Security & Agent Governance | No | No agent configuration changes. No new dependency (FR-045). The implementer doesn't review its own work (tasks.md T036). |
| Technology Standards, Frontend | Yes | The 3D room in the browser, unchanged in kind; it now opens whole. |
| Workflow step 7, "A feature without a graph is not done." | Yes | "Visits whose loading was cut short" ships with the loader (D1), or the deviation above. |

## Questions for `/speckit-clarify` (taken provisionally, 2026-11-09)

Five questions, each where the answer changes the design. Each takes its option A, recommended, provisionally (Clarifications); the Author approves or changes each at T000. After them, the twelve defaults, each provisional.

### Q1: What does the bar measure, and does the room wait for its studio models before the hand-off? (FR-010 to FR-016, FR-021)

Taken provisionally: option A.

**Context**: The first visit's files, in the build recorded in spec 005's note on 2026-11-09: the entry chunk and its stylesheet, 40,599 bytes compressed, which load with the page; the 3D code, about 200 KB compressed in four chunks (named `scene`, `ledger`, `loader`, and `avatars` in the build's output), imported behind the choice screen or by the 3D stage as it mounts; the room's text, `room-data.json`, about 3 KB; the faces' typefaces, IBM Plex Mono and Patrick Hand, about 85 KB; no avatar files yet; and 21 studio models, 6,593,757 bytes as served, from 11 KB (the busy sign) to about 1 MB (the room's shell). Today the hand-off waits only for the 3D code (at most 4 s) and the figures (at most 1.5 s). The models are fetched from the 3D stage's mount and are parsed and shown only after the hand-off (spec 004's R-28, step 4: "the hand-off, which nothing may skip, stays smooth"), so the room turns from placeholder shapes into models after the visitor is in. Each model is fetched with the browser's integrity check, which, as this session understands the Fetch standard, delivers the body whole once it has been checked.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | The first visit's files: the 3D code, the room's text, the typefaces, the figures' files, and the set models. Each figure's file and set model counts its bytes as served, once its load has ended (shown, failed, or skipped); the code, the text, and the typefaces count as steps of fixed shares. The room's models parse and swap while the loader shows, never during the hand-off, so the room is whole when the hand-off plays, within Q5's ceiling. | The bar measures the room's real weight, and the room opens whole on a good connection. Amends R-28's step 4 and spec 009's FR-022 (L6, L11). The bar moves in about two dozen steps, one per file and one per step part, not smoothly within a file. On slow connections the visitor waits up to the ceiling before the hand-off, where today it starts within about 1.5 s of the scene's mount. |
| B | Only what the room waits for today: the 3D code and the figures' files, within today's 4 s and 1.5 s. The models keep loading after the hand-off, as today. | Nothing about the hand-off's timing changes. With no avatar files bundled, the bar measures little but code that usually arrived behind the choice, so most visitors would never see it, and the room still changes after the hand-off. |
| C | Stages, not bytes: code, text, figures, pieces, ready, each a fixed share, with "N of M pieces". The room waits as in A. | No sizes needed. The bar moves unevenly: an 11 KB sign counts as much as the 1 MB shell. |
| D | As A, but within each file: the room reads each file's body as it streams and checks its SHA-256 itself, in place of the browser's integrity check. | The smoothest bar. Moves a security check from the browser into the room's code (Principle IV; the review's security pass), for a smoother line. |

### Q2: What is "the web page faded in the background"? (FR-024 to FR-027)

Taken provisionally: option A.

**Context**: At "Enter" today, the room builds its whole page at once (`app.ts`'s `arrive`): spec 005's HUD over the stage, every control inert until the hand-off ends, and the line "Loading the room…" in the stage until the 3D scene mounts. The 3D scene draws from its first frame, with its placeholder shapes, before the hand-off starts. The AI disclosure is the HUD's strip at the window's top (spec 005 FR-021).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | The room's own page behind the loader, dimmed by a dark tint: the HUD's panels and the scene, inert, the scene drawing in as its pieces arrive. The AI disclosure, and the stand-in line while it applies, stay above the tint, undimmed. | The visitor sees the room they are about to enter come together. Nothing new is drawn; the page is today's. The scene's frames cost what they cost today. |
| B | The choice screen, faded, behind the loader, until it gives way. | Keeps the page the visitor was on. The room appears all at once at the hand-off; nothing draws in. |
| C | A still picture of the room behind the loader, shipped with the site, dimmed and blurred. | A new image file every visitor downloads (bytes, and a row in V1's assets). It goes stale whenever the room changes. |
| D | No page: a dark screen with the bar and the hints. | The simplest. Not "the web page faded in the background". |

### Q3: Where does the loader meet the door's choice screen? (FR-013, FR-017 to FR-023)

Taken provisionally: option A.

**Context**: The choice screen is the door (spec 002 FR-001; `src/choice/choice.ts`): the path, the avatar, the PDF link, the data-flow link, and "Enter". Behind it, the room runs the WebGL 2 check and imports the 3D code (`app.ts`); nothing else downloads, since the 3D stage fetches the figures and models when it mounts, after "Enter", and the chosen avatar is known only then. Spec 002's SC-005 gives the choice screen 3 seconds. The smallest change that feels like a game is the one that uses the moment a game uses: after the character is chosen and "Start" pressed.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | The door unchanged. "Enter" is the game's "Start": the loader shows from it, over the room's page, and gives way to the hand-off. The bar starts at what already arrived behind the choice. | The smallest change: today's "Loading the room…" becomes the loader, and nothing new downloads or happens before "Enter". The choice screen keeps its 3 seconds. |
| B | A boot loader before the door: the page opens on the loader while the code arrives, then the choice. | Like a game's boot screen. Delays the choice screen (SC-005's 3 s) and puts the PDF link and the AI disclosure's first screen behind it. |
| C | As A, and a slim bar on the choice screen showing the 3D code's download behind it. | Two bars and one more state to test, for about 200 KB that usually finishes before a visitor has chosen. |
| D | As A, and the room's models start downloading behind the choice, so the loader after "Enter" is shorter. | About 6.6 MB for every visitor who opens the page, entering or not: transfer cost after publication, and data on phones. A new start for downloads that today wait for "Enter". |

### Q4: How do the hints cycle? (FR-028 to FR-031)

Taken provisionally: option A.

**Context**: Fourteen hints (The Hint Copy). The loader shows for as long as the files take, at most 7 seconds (Q5), so most loads show one or two hints, and the first is the one most visitors read (D3). WCAG 2.2's 2.2.2 asks that content which updates on its own can be paused, stopped, or hidden. The WAI-ARIA carousel pattern stops a rotation when focus enters it and pauses it under the pointer, with a control that stops and starts it.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | One hint at a time, a new one every 6 seconds; paused while the pointer is over it; stopped once focus reaches its controls; "Pause hints" and "Play hints"; "Previous hint" and "Next hint", wrapping; each new hint said once, politely; no transition under reduced motion. | A game's rotating tips, with every control WCAG asks for. Three buttons on the card. Most visitors see one or two hints; the controls let a curious visitor read them all. |
| B | One hint a visit, no rotation, with "Next hint". | Nothing moves on its own, so there is nothing to pause. On a short load, the same as A. |
| C | Every hint at once, as a list below the bar. | Competes with the bar, and runs long on a phone. |
| D | A timed rotation with no controls. | Fails WCAG 2.2's 2.2.2. |

### Q5: What happens when a file is slow, stalls, or fails? (FR-004 to FR-007, FR-019, FR-020, FR-023)

Taken provisionally: option A.

**Context**: Today's bounds: the 3D code has `SCENE_WAIT_MS`, 4 s from "Enter", or the room goes to 2D; the figures have `wait_ms`, 1.5 s from the mount, or they keep their fallbacks; each studio file has a 10-second timeout and one retry, then its placeholder shape and the placeholder note. Spec 002's SC-005 puts the hand-off within 10 seconds of the page opening on a typical 4G connection, the choice screen within 3.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | The loader gives way at the first of: every needed file ended; the room in 2D; or the ceiling, 7 seconds after "Enter", saying once that pieces are still on their way. After it, the room's existing paths carry on: pieces still loading are shown after the hand-off, a failed piece keeps its placeholder, a figure its fallback, a late 3D chunk is the 2D room. No skip control. | SC-005 holds by construction. No new failure path: each is today's. On a typical 4G connection the ceiling may bind, and the largest pieces arrive after the hand-off, as all of them do today. |
| B | As A, with an "Enter now" control on the loader from its start. | A visitor who'd rather not wait can go in; one more control and one more event case, for a wait of at most 7 seconds. |
| C | A longer ceiling, 15 seconds, amending SC-005. | Slower connections see a whole room more often, after a longer wait. |
| D | No ceiling of the loader's own: it waits for every file to end, each with its 10-second timeout and one retry. | The room is always as whole as it will get before the hand-off. A stalled file can hold the hand-off for about 20 seconds; amends SC-005. |

### Defaults taken, each provisional, for a yes or a no

- **D1. The event.** One usage-event kind, `loading_cut_short`, once a visit, with no identifier, when the loader gives way at its ceiling with files still loading; row V4's trigger gains it; the dashboard gains "Visits whose loading was cut short" (FR-046 to FR-050). On a no: no event, no panel, and Principle II's deviation named for the loader.
- **D2. The ceiling.** 7 seconds after "Enter" (FR-020).
- **D3. The hints' order.** The Author's three first, in his order, then the session's: talking with the twin (4 to 8), the neon sign (9 to 11), and costs (12 to 14). Each visit starts at hint 1. The alternative: each visit starts at a random hint, so all of them are read across visits, and his "Make sure to ask" is read first by fewer visitors.
- **D4. The rotation's interval.** 6 seconds, about the time to read a hint of 25 words (FR-030).
- **D5. Figures as slots.** The ceilings, the fallback's allowance, and the prices are filled at build from `config/budgets.yaml` (`envs.prod`), `config/routing.yaml` (prod's fallback), and `config/prices.yaml` (its latest version's entry for that model); UI words from the room's own; never typed (FR-033).
- **D6. His hints 1 and 2 shown always, as he wrote them** (FR-035). On a no: they show only while the build reads free talk as ready, and the loader starts at his hint 3.
- **D7. No loader in 2D**, where nothing loads (FR-003).
- **D8. The loader's words**: "Loading the room"; "Loading the room's code"; "Loading the room's pieces: {done} of {total}"; "Finishing the room"; "The room is ready."; "The room opens now. Some pieces are still on their way and appear as they arrive."; "Hint"; "Hint {n} of {total}"; "Pause hints"; "Play hints"; "Previous hint"; "Next hint". Data edits (FR-016, FR-051).
- **D9. Timing.** The loader shows at once at "Enter", with no delay and no minimum time; it fades out in at most 200 ms as the hand-off begins, with no fade under reduced motion (FR-018, FR-022).
- **D10. The ADR.** Proposed, at the next free number: 0044, unless another branch has taken it when the work starts (FR-054).
- **D11. Focus.** On the loader's heading when it shows; on the room's heading when it gives way (FR-039).
- **D12. The look.** A wide bar in the highlight's yellow on a dark track, with the percentage, on the HUD's dark glass, in CSS alone; shipped without a lookdev approval, as the Author's answer to spec 005's Q2 had it for the HUD; he looks on the live room after the merge (FR-055, SC-010).

## Open Questions for the Author (T000)

What the session couldn't settle and the Author should see before the build starts. None blocks it: each has a provisional answer above.

1. **Q1 to Q5**, each taken as option A. Q1's A changes when the hand-off starts: on a slow connection the visitor now waits up to 7 seconds for a whole room, where today the hand-off starts sooner over placeholder shapes.
2. **FR-035 and D6**: his hints 1 and 2 invite questions the twin can't take on its own yet (free talk isn't ready, and the site's own corpus file is in no topic's pack). With D3's order, hint 1 is the one most visitors read. Show them always (D6), or only while free talk is ready?
3. **The session's eleven hints** (4 to 14): his to approve, rewrite, reorder, or remove, as data.
4. **D1 to D12**.
