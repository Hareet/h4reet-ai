# Feature Specification: The Room After the Demo — The Room Framed Under the HUD, a Newer Game Look, Walking From the Room's View, the Paper in the Hand, the Neon's Glow, the Chalkboard, the Placeholder Note, and the Sign's Proof

**Feature Branch**: `spec/014-room-after-the-demo` (this spec, documents only), cut from `main` at b335b9b2, with the accepted intent at cc282c63; the implementation branch is `feat/014-room-after-the-demo`, cut from `refs/heads/main` after spec 012's `feat/012-loading-screen` has merged ([plan.md](plan.md) §15)

**Created**: 2026-11-10

**Status**: Clarified provisionally, planned, tasked, and analyzed, all on 2026-11-10. Written from the intent beside it, which the Author accepted on 2026-11-10 in his words, "I accept the intent with your recommendations. go for it!", after three answers that are final ("Overlay only", "Start from the room's view (Recommended)", "One spec for all") and one addition at acceptance, the neon sign's glow. The five clarify questions (Q1 to Q5) were not put to him: each takes its recommended option under his acceptance, provisionally, and the defaults D1 to D12 likewise. Each is his to overturn; every question keeps its options below. No needs-clarification marker remains. [plan.md](plan.md) and [tasks.md](tasks.md) are beside it, with the analyze pass at the plan's end. Nothing is built before he approves this spec and the plan ([tasks.md](tasks.md) T000). **Approved 2026-11-10**: "You can go ahead and start the build of the spec." (T000).

**Input**: [`intent.md`](intent.md) in this folder, the Author's words of 2026-11-10 verbatim, with his three answers and his addition. Also read, on `main` at b335b9b2: the [constitution](../../.specify/memory/constitution.md) 1.1.0, `CLAUDE.md`, and `REVIEW.md`; [spec 005](../005-full-window-room/spec.md) (whole), [its plan](../005-full-window-room/plan.md) (PD-1 to PD-25, §2, §3, §5, §6, the departures B1 to B12), and [its tasks](../005-full-window-room/tasks.md)' tail; [spec 004](../004-room-composition/spec.md) (FR-013, FR-017, FR-022, FR-046, FR-082), its [research.md](../004-room-composition/research.md) R-35, its [room-data-files.md](../004-room-composition/contracts/room-data-files.md) §3.4, §4, §9, and §13.3, its [turn-cost.md](../004-room-composition/contracts/turn-cost.md) (whole), and its tasks' T203; [spec 008](../008-visitor-movement/spec.md) (FR-020 to FR-025, FR-036, FR-044); [spec 009](../009-room-avatars/spec.md) (FR-011 to FR-019, FR-029, FR-037, D10) and [its plan](../009-room-avatars/plan.md)'s R-09; ADRs 0039 and 0043; and the room's code and data: `compose/hud.ts`, `compose/framing.ts`, `compose/stages.ts`, `fit.ts`, `scene.ts` (its clear area, its shift, its resize, its walking loop), `scene/walking.ts`, `walk/camera.ts`, `scene/avatars.ts` (`PAPER_LIFT`, `findHand`, `paperAt`, `keepPaper`), `scene/glows.ts`, `faces/neon.ts`, `signals/turn-cost.ts`, `room.css`, `talk/talk.css`, `src/fonts.css`, `src/choice/avatars.ts`, `room/scene.yaml`, `room/ui-words.yaml`, `room/catalog/neon-sign.yaml`, `content/room/chalk-denverlocal.yaml`, `build/approvals.ts`, `build/room/emit.ts`'s `avatarsPlaceholder`, `assets/policy/content-approvals.json`, `corpus/05-mission.md` and `corpus/07-denver-local-ai.md` (read, not changed), `config/routing.yaml`, `services/gateway/src/routes/room-turn.ts`'s route field, `evals/breach.py`'s header, `deploy/compose.yaml`'s services, `deploy/env.agents/dev-cpu.vars`, and the `Makefile`'s `breach-test`. Spec 012 read on `feat/012-loading-screen` at 2e1e0563 (its spec, its plan's file list, `loading.css`'s properties, `hints.yaml`). The game UI guidance read as data from the Author's untracked copy, `docs/research/game-ui-frontend-openai-skill.md` in main's checkout, a copy of <https://github.com/openai/plugins/tree/HEAD/plugins/game-studio/skills/game-ui-frontend>; it is cited by that URL, quoted only in short lines, and not copied here. Not read: the studio's files, which nothing here changes; the browsers' references, which this session can't open.

Summary: eight changes to the room the Author saw at his demo, built and gated together, as he chose. The room is framed into the whole window with the HUD laid over it, so it recentres and grows, and it eases back toward spec 005's clear area only as far as it must to keep every pressable piece and both figures out from under a panel; it is never smaller than today. The HUD becomes compact clusters in the places he chose for spec 005, covering at most a quarter of a desktop window, and every control takes one game look made from the room's own materials and the site's own fonts. "Walk around" starts from the room's view, level and centred, and the camera moves only when the visitor turns, tilts, or zooms it, or the figure nears a panel or the window's edge. The resume's sheet sits between the fingers and the thumb by a grip that is data, never along the forearm. The neon sign glows along its tube and its letters, not as a disc behind it. The chalkboard shows "denverlocal.ai" once the Author approves its words, by a patch for his hand. The placeholder note says what is missing. And a check on the dev stacks proves, end to end with the local model stopped, that a paid-route turn reaches the sign as a paid reading, with no paid call. Cloud cost: $0. Model cost: $0. No byte newly leaves the visitor's device.

## Clarifications

### Session 2026-11-10: the Author's answers before the spec, final

Recorded in his words, as the intent records them. The options he was shown live in the session that drafted the intent, not in this folder; the reading beside each is this spec's, his to correct, and never replaces the words.

- **The bands** → the Author: "Overlay only". The intent's outcome beside it: "The room is framed into the whole window with the interface laid over it, so it recentres and grows. A wide window may still show plain sides; no new scenery and no cropping." Reading: User Story 1. The room's frame is the window, not spec 005's clear area, wherever no pressable piece or figure would fall under a panel (Q1); spec 005's Q5 answer, "Whole room, more around (Recommended)", stands, so nothing is stretched or cropped (FR-011).
- **Walking** → the Author: "Start from the room's view (Recommended)". The intent's outcome beside it: "Walking begins at the starting camera, level and centred, and the camera moves only when the visitor turns, tilts or zooms it, or the figure nears an edge." Reading: User Story 3 (FR-030 to FR-037); Q4 settles "nears an edge" and the hand-over.
- **The plan** → the Author: "One spec for all". The intent's outcome beside it: "One spec covers every item above, built and gated together." Reading: one spec, one implementation branch, one gate; the user stories' priorities only order the work.
- **His addition at acceptance**: "One small change, i think the glow around the neon sign is a big circle, and the glowing part should be the actual neon letters and neon part that frames the arrow in the sign." Reading: User Story 5 (FR-044 to FR-049).
- **His acceptance**: "I accept the intent with your recommendations. go for it!" Reading: the intent's recommendations hold, and the clarify step takes each question's recommended option under his acceptance, as the next session records.

### Session 2026-11-10 (`/speckit-clarify`), taken under his acceptance, provisional

Each answer below is the question's recommended option, **taken under his acceptance ("I accept the intent with your recommendations. go for it!"), provisionally; his to overturn at T000 or after.** The questions, their context, and every option are under [Questions for `/speckit-clarify`](#questions-for-speckit-clarify-answered-provisionally-2026-11-10), below.

- Q: With the HUD laid over the room, how is the room framed, and how does a piece under a panel stay pressable? → A (recommended, taken under his acceptance, provisional): framed into the whole window, eased back toward spec 005's clear area only as far as it must so that no pressable piece and neither figure lies under a panel; never smaller than spec 005's frame (FR-009 to FR-016).
- Q: How much of the window may the always-on interface cover, and where does the conversation sit? → A (recommended, taken under his acceptance, provisional): compact clusters in the places of spec 005's "Bottom bar, plus one column on the right": the bar's tiles one cluster at the foot, the column sized to its content at the foot of its band with the conversation's log a few lines that scroll, the AI disclosure a compact strip at the top; the always-on interface at most 25% of a landscape desktop window; phones keep spec 005's dock (FR-017 to FR-021).
- Q: What should "newer" and "like part of the game" mean for the panels and buttons? → A (recommended, taken under his acceptance, provisional): the room's own materials on the dark glass: every HUD control a tile like the bar's, the notes as glass chips, headings in the chalkboard's hand-lettered face, words in the site's sans, figures in its mono, the neon's warm colour as the accent, the highlight's yellow kept for focus, transitions of at most 150 ms and none under reduced motion, the same tiles on phones (FR-022 to FR-029).
- Q: When walking starts from the room's view, when does the camera start to follow the figure, and how does it hand over? → A (recommended, taken under his acceptance, provisional): the view holds until the visitor turns, tilts, or zooms, or the figure's box comes within 0.5rem of a panel or the window's edge; then spec 008's follow camera takes over within 500 ms, a cut under reduced motion, its orbit starting where the room's view stands (FR-030 to FR-037).
- Q: What should the placeholder note say, and when should it show? → A (recommended, taken under his acceptance, provisional): say what is missing: its present words only while a room piece shows its placeholder shape; a new line while the visitor's own figure shows its flat shape in 3D; the twin's stand-in keeps spec 009's line alone (FR-053 to FR-055).
- **The defaults D1 to D12** (under the questions): each taken under his acceptance, provisionally, his to overturn.

## Source: The Author's Words

Quoted as the intent records them, typing included. The reading beside each is this spec's.

> "The room does get resized, but see how the actual room is smaller in the browser window size with grey area next to the brick. We can move the interface to lay over that grey area. We could make the game buttons and interface look newer, perhaps this skill could help: https://github.com/openai/plugins/tree/HEAD/plugins/game-studio/skills/game-ui-frontend . The langfuse meter did not display the cost of the current conversation when we definitely had the local model down and were using anthropic. The resume paper goes into the arm area and doesnt neatly stay in the hand. When we click walk around, the camera shifts to an angled perspective, is that necessary or can we just have walk around from the initial angle the room starts in. denverlocal.ai is not written on the chalkboard."

Reading, phrase by phrase:
- "The room does get resized, but see how the actual room is smaller in the browser window size with grey area next to the brick." Spec 005 frames the room into its clear area, the window less the strip, the bar, and the column (`compose/hud.ts`'s `hudBoxes`, spec 005 FR-015 and FR-016). The room's front is about square (its shell 2.13 m wide and tall, `room-shell.yaml`), so on a landscape window its height binds and the extra width shows the plain backdrop: the "grey area". User Story 1.
- "We can move the interface to lay over that grey area." His answer, "Overlay only": the room is framed into the window and the interface lies over it (Q1). Where the window is wide enough, the column then lies over the backdrop beside the room, as he describes.
- "We could make the game buttons and interface look newer, perhaps this skill could help: [the URL]". User Story 2. The bar's tiles are dark glass, as spec 005 built them (`room.css`'s `.hud-tile`), but the list's buttons, the conversation's buttons, and the two notes at the top left still take the page's base button and note, white with dark text (`room.css`'s `.room button`, `.room-note`). The guidance is read for its points (Assumptions, Readings), and Q2 and Q3 settle what "newer" means.
- "The langfuse meter did not display the cost of the current conversation when we definitely had the local model down and were using anthropic." User Story 8. The intent records the cause, confirmed by his own words: "yes, make up put the local model bakc", then "Yup, it's working now! ive clicked the snowboard and the cost is changing". No bug is found; the sign reads only each turn's reply (spec 004's turn-cost.md, unchanged). This spec adds the check from end to end that the intent asks for.
- "The resume paper goes into the arm area and doesnt neatly stay in the hand." User Story 4. The sheet hangs from the hand bone's origin, the wrist, lifted straight up in world space by half its height (`scene/avatars.ts`'s `PAPER_LIFT`, `paperAt`, `keepPaper`), so with the arm hanging it lies along the forearm.
- "When we click walk around, the camera shifts to an angled perspective, is that necessary or can we just have walk around from the initial angle the room starts in." User Story 3. Not necessary: the follow camera starts at its pitch limit, 35° down (`scene/walking.ts`, `pitch: limits.pitchMax`), and spec 008 allows level. His answer, "Start from the room's view (Recommended)".
- "denverlocal.ai is not written on the chalkboard." User Story 6. The board's words are a draft until he approves their digest as `room-text` on `main` (spec 004's T203), so a release build leaves the slate plain.
- His addition, "the glow around the neon sign is a big circle, and the glowing part should be the actual neon letters and neon part that frames the arrow in the sign": User Story 5. The sign's glow is one additive disc, 0.3 m in radius at scale 1 and so about 0.78 m at the sign's stylized scale of 2.6 (`neon-sign.yaml`'s `tube-glow`; `scene/glows.ts`'s `CircleGeometry`).
- The intent's "Also seen" item, the note "Placeholder shapes stand in for the room's pieces until their models arrive": User Story 7. Its trigger is set by missing avatar models (`emit.ts`'s `avatarsPlaceholder`), not by the room's pieces.

## User Scenarios & Testing *(mandatory)*

The users are visitors on every window from a 320-pixel phone to an ultrawide monitor, by pointer, touch, keyboard, and screen reader, with or without reduced motion, reduced transparency, more contrast, or forced colours; and the Author, who approves the board's words, looks at the room at lookdev and live, and runs the sign's check on his dev stack. User Story 9, the degraded modes, is P1 and ships with User Story 1, as Principle I asks ("Every user-facing capability MUST define its degraded mode before its happy path"). The Author's "One spec for all" makes one branch and one gate; the priorities order the work only.

### User Story 1 - The Room Fills the Window, Under the HUD (Priority: P1)

As a visitor, I want the room itself to fill my window, with the interface laid over it, so that I see the room, not grey bands beside it.

**Why this priority**: His first words: "see how the actual room is smaller in the browser window size with grey area next to the brick", and his answer, "Overlay only".

**Independent Test**: In the kernel's tests, over spec 005's sweep: the frame area holds the clear area; the room's scale is at least spec 005's; every protected box lies outside every HUD box by at least 0.5rem; and the ease is the least that does so. In the room's jsdom tests, on a 1920 × 1200 window: the camera's view offset centres the frame area, a press on each pressable selectable's core selects it, and a press on a panel selects nothing. On a desktop browser by hand, drag the window from 1280 × 720 to 2560 × 1440: the room is centred where the panels allow and grows with the window.

**Acceptance Scenarios**:

1. **Given** a 2560 × 1440 window in the column layout, **When** the room shows, **Then** it is framed into the whole window, its centre at the window's centre, the panels over the plain sides, and no pressable piece or figure under a panel.
2. **Given** a 1920 × 1200 window, **When** the room shows, **Then** the room is at least as large as spec 005's frame in both directions and larger in the direction that binds, and no pressable piece or figure lies under a panel.
3. **Given** a window where the column would cover the bicycle's pressable core at the whole window's frame, **When** the room shows, **Then** the frame eases toward spec 005's clear area by the least step that clears it, and the bicycle stays pressable.
4. **Given** a 5120 × 1440 window, **When** the room shows, **Then** the whole room is in view, unstretched and uncropped, and the extra width shows plain sides (his "A wide window may still show plain sides").
5. **Given** a phone at 390 × 844 held upright, **When** the room shows, **Then** it is never smaller than spec 005's frame and no figure or pressable piece lies under the dock.
6. **Given** the room on any window, **When** the window is resized, the list collapsed, or full screen entered, **Then** the frame is recomputed on the next frame (spec 005 FR-012) and the visit's state is kept.
7. **Given** the 2D room, **When** it shows, **Then** its drawing is framed by the same rule, its hit areas clear of every panel.

---

### User Story 2 - A HUD That Looks Like Part of the Game and Keeps the Room Clear (Priority: P2)

As a visitor, I want the buttons and panels to look newer and like part of the game, every one alike, and to cover as little of the room as they can.

**Why this priority**: His "We could make the game buttons and interface look newer, perhaps this skill could help". It is a "could", so it follows the framing; the budget makes the overlay of User Story 1 cover less.

**Independent Test**: The layout model (spec 005's `test/ui/hud-model.ts`, real text widths) gives each HUD box at each landscape window from 1280 × 720 up; their union in the opening state and at the log's rest height covers at most 25% of the window. A stylesheet test finds no HUD control in the column or dock layout with the page's white base button, and the contrast test passes every new pair over white and over black. With reduced motion, no HUD transition runs.

**Acceptance Scenarios**:

1. **Given** a 1920 × 1200 window, **When** the room shows, **Then** the AI disclosure is a compact strip at the top, the bar is one cluster of tiles at the foot, and the column holds the list above the conversation sized to its content at the foot of its band, together covering at most 25% of the window.
2. **Given** the conversation has many lines, **When** the log is at rest, **Then** it shows its rest height and scrolls inside, and "Larger conversation" opens the larger view only when pressed (spec 005's Q3).
3. **Given** any HUD control in the column or dock layout (the list's buttons, Send or Stop, the talk button, the header toggles, the offer's buttons), **When** it shows, **Then** it is a tile on dark glass, at least 44 × 44 CSS pixels, with its words visible; the resume, a document, stays as spec 005 made it.
4. **Given** the placeholder note or the stand-in line, **When** it shows, **Then** it is a glass chip, legible to the contrast floor, letting a pointer through to the scene.
5. **Given** a tile, **When** it is hovered, pressed, or selected, **Then** its state shows by the neon's warm edge and by more than colour, within 150 ms, and at once under reduced motion; **When** it has focus, **Then** the highlight's yellow ring shows.
6. **Given** a phone held upright, **When** the room shows, **Then** the dock takes the same tiles and chips.
7. **Given** the device asks for reduced transparency, more contrast, or forced colours, **When** the room shows, **Then** every tile, chip, and panel is opaque (spec 005 FR-006).

---

### User Story 3 - Walking Starts From the Room's View (Priority: P2)

As a visitor, I want "Walk around" to keep the view the room opened with, and the camera to move only when I move it or my figure would leave the clear part of the window.

**Why this priority**: His "can we just have walk around from the initial angle the room starts in", and his answer, "Start from the room's view (Recommended)".

**Independent Test**: In the walking orchestrator's tests, with a scripted input: entering leaves the camera exactly at the room's view; a walk that stays clear leaves it there; the first turn, tilt, or zoom, or the figure's box nearing a panel or the window's edge, hands over to the follow camera within 500 ms, at once under reduced motion; leaving returns to the room's view.

**Acceptance Scenarios**:

1. **Given** the room's view, **When** the visitor presses "Walk around", **Then** the camera doesn't move: level and centred, as the room opened, and the walking view takes focus (spec 008 FR-042).
2. **Given** the walking view holding the room's view, **When** the visitor walks the figure with the keys or a tap on the floor and its box stays clear of every panel and the window's edge, **Then** the camera doesn't move.
3. **Given** the held view, **When** the visitor turns (Q or E, or a drag), tilts (R or F), or zooms (plus or minus, the wheel, or a pinch), **Then** the follow camera takes over from where the view stands, the turn continuing from it with no jump, within 500 ms.
4. **Given** the held view, **When** the figure's box comes within 0.5rem of a panel or the window's edge, **Then** the follow camera takes over the same way and keeps the figure in view.
5. **Given** reduced motion or "Pause the room", **When** the camera hands over, **Then** it cuts at once (spec 008 FR-044).
6. **Given** the walking view, held or following, **When** the visitor leaves it, **Then** the camera is at the room's view and the figure at its place (spec 008 FR-022); where the view was held, nothing moves.

---

### User Story 4 - The Resume's Sheet Sits in the Hand (Priority: P2)

As a visitor, I want my figure to hold the resume's sheet in its hand, not through its arm.

**Why this priority**: His "The resume paper goes into the arm area and doesnt neatly stay in the hand." The hand-off is the room's opening moment.

**Independent Test**: In the avatars' tests, with a skeleton fixture of ADR 0010's bones: for each hand, the sheet's held edge sits at the grip, between the thumb's and the fingers' bones, and no point of the sheet lies within the forearm's volume, at rest, in "idle-holding", and while walking. The lookdev page shows the man and the woman holding the sheet in each hand for the Author's look.

**Acceptance Scenarios**:

1. **Given** the hand-off has ended and the visitor's figure shows the man or the woman, **When** the sheet is kept, **Then** it sits in the holding hand at that avatar's grip for that hand, its held edge between the thumb and the fingers, and the sheet extending away from the forearm.
2. **Given** an avatar with hand bones and no grip in the data, **When** the sheet is kept, **Then** it takes the grip computed from the hand's bones, never the wrist lifted by half the sheet.
3. **Given** the visitor walks, **When** the hand moves, **Then** the sheet moves with it and stays at the grip.
4. **Given** the twin holds the sheet before the hand-off, **When** it shows, **Then** the twin's grip places it the same way, and the hand-off's sheet runs from grip to grip (spec 009 FR-019).
5. **Given** a figure showing its fallback, or an avatar with neither hand bone, **When** the sheet is kept, **Then** it stays at the figure's hand anchor, as today.

---

### User Story 5 - The Neon Sign Glows Along Its Tube and Letters (Priority: P2)

As a visitor, I want the neon sign to glow where its neon is, the letters and the tube that frames the arrow, not as a big circle behind it.

**Why this priority**: His addition at acceptance.

**Independent Test**: In the glows' tests, the sign's glow is built from the catalog's path: no disc card on the sign; every vertex of its glow within its spread of the path; its motion and level as before; none at quality 2 and 3. At lookdev and live, the Author sees the glow along the tube and the letters.

**Acceptance Scenarios**:

1. **Given** the room in 3D at quality 0 or 1, **When** the sign shows, **Then** a glow follows the tube around the arrow, within its spread of the tube, and the letters glow by their own tube pass, with no disc behind the sign.
2. **Given** the room animates, **When** the sign glows, **Then** the glow flickers as before; **Given** reduced motion, "Pause the room", or a hidden page, **Then** it holds still at full strength (spec 004 FR-059, FR-060).
3. **Given** quality 2 or 3, **When** the sign shows, **Then** no glow is drawn, and the tube's flat colour and the letters remain.
4. **Given** the laptop's charge light or a screen's glow, **When** it shows, **Then** it keeps its disc, as today.

---

### User Story 6 - The Chalkboard Shows denverlocal.ai (Priority: P2)

As a visitor, I want the chalkboard to show what the twin says it shows.

**Why this priority**: His "denverlocal.ai is not written on the chalkboard", and the twin's claim from the corpus, which reads true only once the board shows it.

**Independent Test**: With a fixture policy that approves the block's digest under `room-text`, a release build publishes the line and the slate draws it; without the approval, the slate is plain. The patch for his hand applies cleanly to main's current `assets/policy/content-approvals.json` and adds exactly one entry whose digest equals the block's.

**Acceptance Scenarios**:

1. **Given** main approves `apps/web/content/room/chalk-denverlocal.yaml`'s digest under `room-text`, **When** a release build is served, **Then** the slate shows "denverlocal.ai", as words, never a link (spec 004 FR-082).
2. **Given** no such approval, **When** a release build is served, **Then** the slate is plain, and a drafts build draws the line marked "Draft", as today.
3. **Given** the branch is ready, **When** the Author reads its note, **Then** the approval is a patch for his hand, the next entry after main's last, built from plain copies, which no agent applies.

---

### User Story 7 - The Placeholder Note Says What Is Missing (Priority: P3)

As a visitor, I want the room's notes to be true: to say a piece is a placeholder only when it is, and to say what is.

**Why this priority**: The intent's "Also seen". A wrong note is small, but it is the room saying something untrue.

**Independent Test**: Over a table of cases (a room piece a placeholder or not; the visitor's avatar with or without a model in 3D, or in 2D; the twin's stand-in), the note shows exactly the words for what is missing, or nothing.

**Acceptance Scenarios**:

1. **Given** every room piece shows its model and the visitor chose the man, **When** the room shows, **Then** no placeholder note shows; the twin's stand-in line shows (spec 009 FR-013).
2. **Given** the visitor chose the dog, which has no model, **When** the 3D room shows, **Then** the note says the visitor's figure is a flat placeholder until its model arrives, and nothing about the room's pieces.
3. **Given** a room piece's model failed and kept its stand-in, **When** the room shows, **Then** the note says placeholder shapes stand in for the room's pieces.
4. **Given** both, **When** the room shows, **Then** one note says both, in that order.

---

### User Story 8 - The Sign's Cost Proven From End to End (Priority: P2)

*Amended after the review (T053, Amendment X1): the stack check is dropped, the Author's answer of 2026-11-10, "Drop the make target". What proves the chain is the room's unit tests of the sign's readings (`test/room/turn-cost.test.ts`) and the gateway's of the turn route's route and cost, with his live reading on prod on 2026-11-10: "Yup, it's working now! ive clicked the snowboard and the cost is changing".*

As the Author, I want a check that, with the local model stopped, a real turn through the edge and the page's own code reaches the sign as a paid reading, with no paid call.

**Why this priority**: The intent: "A check from end to end, with the local model down, from the gateway through the edge and the page to the sign, would keep it proven."

**Independent Test**: `make sign-check ENV=dev-cpu` on the agents' engine: it stops the model server, sends one turn through the edge as the page sends it, reads the 200 reply's route and cost, gives them to the room's own turn-cost code, and asserts the sign's counters read a paid estimate; then starts the model server and asserts a local turn reads "local · $0". It refuses prod.

**Acceptance Scenarios**:

1. **Given** dev-cpu with its model server stopped, **When** the check sends a turn through the edge, **Then** the reply is 200 with route `fallback` and a cost above 0, from the stack's synthetic adapter, and the room's code reads "this call" as that cost with "est.".
2. **Given** the model server started again, **When** the check sends a turn, **Then** the reply's route is `local` with cost 0, and "this call" reads "local · $0".
3. **Given** `ENV=prod`, **When** the check is asked to run, **Then** it refuses before anything changes, and no paid call is made.
4. **Given** a run, **When** it prints, **Then** it shows statuses, routes, costs, and the sign's readings, and never the twin's words.

---

### User Story 9 - Every Change Keeps Its Degraded Mode (Priority: P1)

As a visitor, I want the framing, the HUD, walking, the paper, the glow, the board, and the note to work whatever state the Author's machine, the budget, the network, or my device is in.

**Why this priority**: Principle I. All of this runs on the device, so its degraded mode is that nothing changes beyond what the conversation answers; this story proves it and covers the failures that are its own.

**Independent Test**: With the live source off, the tier unknown, the local tier off, the budget spent, and the kill switch `degraded` (stubbed); with no WebGL 2; with the frame computation throwing; with an avatar's hand missing; with the sign's path missing; and with no approval: the room fills the window, the HUD works, the AI disclosure is in view, only the conversation's answers degrade, and the network log holds no request beyond today's.

**Acceptance Scenarios**:

1. **Given** the kill switch `degraded`, **When** the visitor sends a turn, **Then** the conversation shows its fixed message and the sign reads "cost unavailable" (turn-cost.md §5), and the framing and the HUD are unchanged.
2. **Given** the frame computation throws or gives no finite frame, **When** the room re-fits, **Then** it frames into spec 005's clear area, as before this spec.
3. **Given** the sign's glow path is missing or degenerate, **When** the sign shows, **Then** it has no glow, never the disc.
4. **Given** the grip can't be applied, **When** the sheet is kept, **Then** it stays at the figure's hand anchor.

---

### Edge Cases

- **An ultrawide window** (5120 × 1440): the room is height-bound and centred; the sides show the backdrop, `#20252b`, with the column over the right side's backdrop (his "A wide window may still show plain sides").
- **A landscape window narrower than the room plus the column** (1024 × 768, 1280 × 720): the column would cover the right wall's pieces at the whole window's frame; the frame eases toward the clear area by the least step that clears every protected box (FR-009), at worst to spec 005's frame.
- **A phone held upright**: the dock covers the foot; centring the room in the window would put its lower part under the dock, so the frame eases, usually to spec 005's; nothing is smaller than before.
- **The list collapsed in the dock**: the clear area grows and the frame is recomputed (spec 005 FR-012).
- **200% text or a high zoom**: the HUD's boxes grow, the ease grows with them, and below the HUD's minimum the stacked layout takes over (spec 005 FR-007), where the room frames into its block as before.
- **The larger conversation view, the resume, a sheet, or spec 012's loader**: none re-frames the room (spec 005 FR-028, FR-027; spec 012); the frame is the one the docked boxes give.
- **The always-on interface with a long conversation**: the log stays at its rest height and scrolls; only the visitor's "Larger conversation" covers more (FR-018).
- **Walking while the figure starts near a panel**: the frame's protection keeps the figure's box at least 0.5rem from every panel at the room's view, so entering never hands over at once; the first step that brings it nearer does.
- **Walking entered again while the camera is still returning**: the walking view starts at the room's view, as it ends there.
- **A re-fit while the view is held**: the held view is the room's view at the new frame; a re-fit while following keeps spec 008's follow camera within the new farthest distance.
- **The left hand holds the sheet** (spec 009 FR-018's rule picks it): that hand's grip applies.
- **The visitor's avatar swaps or arrives after the hand-off**: the grip is applied when the sheet is kept by the new hand.
- **The sign without its model** (its stand-in shapes): the glow follows the same path, which the catalog gives, and the stand-in's tubes lie along it.
- **Gate 4 not yet merged when the patch is built**: the approval takes the next free id after main's last entry; the patch is rebuilt against main as it is when the Author applies it.
- **The visitor's avatar fails to load mid-visit**: the note appears with the figure's words at once (FR-054).
- **The 2D room**: every figure is flat by design, so the visitor's figure note doesn't show; the room pieces' note shows as FR-053 says.
- **The sign's check on a stack without synthetic spend**: it refuses with the reason; it never falls through to a paid adapter.

## Requirements *(mandatory)*

### Functional Requirements

Terms used below, beside spec 004's, spec 005's, and spec 008's (a selectable, a pick area and its exclusive core, the production framing, the window, the HUD, a panel, the clear area, the column and dock layouts, the walking view, the follow camera).
- **A HUD box** (the plan's "compact boxes"): the box of a docked part of the HUD drawn over the canvas that takes its own pointer, at its size at rest: the strip, the bar's cluster, the column's box or the dock, and the walking control. What the visitor opens over the scene (the larger view, a sheet, the resume) is not a HUD box: it never re-frames the room (spec 005 FR-027, FR-028). The notes, which let a pointer through, are not HUD boxes.
- **The bands**: spec 005's docked boxes, the strip, the bar, and the column's full band or the dock, whose complement in the window is spec 005's clear area. They stay the floor's definition.
- **The frame area**: the box the room is framed into. Under this spec, between the window and spec 005's clear area (FR-009).
- **The ease**: how far the frame area moves from the window toward the clear area, a share from 0 (the window) to 1 (the clear area).
- **A protected box**: what must never lie under a HUD box at the room's view (FR-010): a pressable selectable's core, and each figure's framed box.
- **The room's view**: the production framing into the frame area, level and centred, as the room opens; spec 008's production framing, now in the frame area.
- **The visible scene**: the window less every HUD box.
- **The always-on interface**: the HUD boxes and the stage's notes shown in the opening state with the log at its rest height, not counting what the visitor opens (the larger view, a sheet, the resume).
- **A tile**: a HUD control in spec 005's game look: dark tile face on the glass, light border, light words, rounded, at least 44 × 44 CSS pixels.
- **A grip**: where and how a hand holds the sheet: a point and a turn in the hand bone's frame (FR-038 to FR-040).
- **A path glow**: a glow drawn along a polyline in its piece's frame, within its spread of it (FR-044, FR-045).

**Degraded mode** (defined before the happy paths, Principle I)

- **FR-001**: EVERYTHING THIS SPEC CHANGES IN THE ROOM SHALL run on the visitor's device alone: the framing, the HUD, its look, walking's start, the grip, the glow, the board's words, and the note SHALL make no request, call no model, and store nothing. The sign's check (FR-056) runs on the dev stacks only, never in a visitor's browser and never on prod.
- **FR-002**: WHILE the local tier is off, the budget is spent, the kill switch is `degraded` or unknown, the live source is off, or the tier is unknown, THE ROOM SHALL frame, lay out, look, walk, hold the sheet, glow, and note exactly as at any other time; only what the conversation answers SHALL degrade (spec 007 FR-036), and the sign SHALL read as turn-cost.md §5 says.
- **FR-003**: IF the device can't render 3D, or the room falls to 2D, THEN THE 2D DRAWING SHALL be framed into a frame area by the same rule (FR-009 to FR-012), its 8:5 view box at the largest scale that fits, with the drawing's hit areas and its two figures taking the protected boxes' place; with no walking control (spec 008 FR-047) and no glow (the 2D drawing draws none).
- **FR-004**: IF the frame computation throws, or gives a frame area or a camera that isn't finite, THEN THE ROOM SHALL frame into spec 005's clear area, as before this spec, and SHALL carry on; in a drafts build the frame log records why (FR-064).
- **FR-005**: IF a grip can't be applied (the figure shows its fallback, the avatar has neither hand bone, or the grip's numbers aren't finite), THEN THE SHEET SHALL stay at the figure's hand anchor, as spec 009 FR-018 has it.
- **FR-006**: IF a path glow can't be built (no path, fewer than two points, or a spread outside its bounds, which the compositor refuses in a strict build), THEN THE PIECE SHALL show no glow, never a disc in its place. AT QUALITY LEVELS 2 AND 3, NO GLOW SHALL be drawn, as spec 004's R-35 has it for every glow.
- **FR-007**: WHERE the browser draws no backdrop blur, and WHILE the device asks for reduced transparency or more contrast, or forces its colours, EVERY TILE, CHIP, AND PANEL this spec adds or restyles SHALL behave as spec 005's FR-006 says: the tint alone carries the contrast, or the panel is opaque, in the system's colours under forced colours.
- **FR-008**: IN spec 005's stacked layout (its FR-007), THE ROOM SHALL frame into its canvas block as before, with no ease, and the panels SHALL keep the page's buttons, as spec 005's departure B8 has it.

**The frame: the room under the HUD** ("Overlay only"; Q1)

- **FR-009**: THE ROOM SHALL be framed into the frame area, chosen as the least ease, in steps of 1/16 from 0 to 1 (D5), at which every protected box lies outside every HUD box by at least 0.5rem (D6). At ease t, the frame area's left, top, right, and bottom edges SHALL each lie the share t of the way from the window's edge to spec 005's clear area's edge. At ease 1 the frame is spec 005's, so a frame always exists.
- **FR-010**: THE PROTECTED BOXES SHALL be, at the room's view and at the frame area's framing: (a) for each selectable that has a pressable core at spec 005's frame (a part of its exclusive core at least 44 × 44 CSS pixels, by RG6's measure), a 44 × 44 part of its exclusive core; and (b) each figure's framed box, as spec 004 frames it (spec 009 FR-017: never an avatar's geometry). A selectable that is list-only at spec 005's frame needs no protection.
- **FR-011**: THE FRAMING INTO THE FRAME AREA SHALL be spec 004's (`compose/framing.ts`) at the frame area's aspect, contain, with its 6% margin: every framed box inside the frame area, the binding dimension setting the room's size, never stretched or cropped (spec 005's Q5 answer, "Whole room, more around (Recommended)", and the Author's "no new scenery and no cropping"). The extra width or height SHALL show the scene around the room.
- **FR-012**: THE FRAME AREA SHALL hold spec 005's clear area, so THE ROOM SHALL never be smaller on screen than at spec 005's frame. One camera SHALL draw the whole canvas, its projection shifted so the frame area's frustum spans the canvas (spec 005's PD-12), and the scene continues behind every panel in the same perspective.
- **FR-013**: WHEN the room re-fits (spec 005 FR-012: a resize, a turned device, the bars, full screen, a docked panel's state, the pixel ratio), THE ROOM SHALL recompute the frame area and the camera on the next frame it draws, with at most 17 framings for one re-fit, and SHALL keep the visit's state and hold the quality controller as spec 005's FR-013 has it.
- **FR-014**: THE PICKER SHALL measure its areas in the frame area's pixels. A press inside a HUD box SHALL reach that box, never the scene (spec 005 FR-030); a press on the canvas outside every HUD box SHALL pick as it does today, inside the clear area or not.
- **FR-015**: THE HAND-OFF, the walking view's start and end, the follow camera's shift and farthest distance (spec 005 FR-018; spec 008 FR-023), and spec 004's checks SHALL use the production framing into the frame area: the room's view.
- **FR-016**: THE COMPOSITOR AND THE ROOM SHALL compute the frame area with one kernel function, from the screen, the docked panels' state, the metrics, and the composed scene's protected boxes, so the room the visitor sees is framed exactly where the checks judged it (spec 005's PD-7; [contracts/frame-area.md](contracts/frame-area.md)).

**The HUD's places and budget** (Q2)

- **FR-017**: IN THE COLUMN LAYOUT, THE HUD SHALL lay its parts as compact clusters in the places of spec 005's Q1 answer, "Bottom bar, plus one column on the right": (a) the AI disclosure, a strip at the window's top, as wide as its words need, never truncated, always in view (spec 005 FR-021); (b) the bar's tiles, one cluster at the window's foot sized to its tiles, its place along the foot the table's (plan PD-6); (c) the column, on the right within its band, sized to its content at the band's foot: the list above the conversation, the text box, Send or Stop, and the talk button at its foot (spec 005 FR-022); the walking control where spec 005 put it (spec 008 FR-021; spec 005 FR-020); *amended after the review (T053, Amendment W19; the Author's answer of 2026-11-10, "Move the walk control (Recommended)")*: on a column window wide enough for the bar's tiles and the walking control in one row, the control is a tile at the bar cluster's left end, in the bar's band, and the compact bar box holds it; on a narrower column window and in the dock layout it stays where spec 008 put it, in the clear area's bottom-right corner. The band's width is spec 005's, two fifths of the window between 15rem and 28rem.
- **FR-018**: THE CONVERSATION'S LOG, in the column at rest, SHALL show at most its rest height (plan PD-7) and scroll inside; "LARGER CONVERSATION" SHALL open the larger view only when pressed (spec 005 FR-028). The log SHALL never grow the always-on interface beyond its rest height on its own.
- **FR-019**: THE ALWAYS-ON INTERFACE SHALL cover at most 25% of the window's area, as the union of its HUD boxes and the notes' reserve in the opening state and with the log at its rest height, on every landscape window from 1280 × 720 to 3840 × 2160 in the column layout, at the compositor's metrics (a 16-pixel root, no safe areas), as the layout model with real text widths measures it (D7). (The guidance: "no more than roughly 20-25% of the viewport covered by persistent HUD on desktop".)
- **FR-020**: IN THE DOCK LAYOUT, THE HUD SHALL keep spec 005's dock (its FR-020), with the look of FR-022 to FR-028. The coverage cap doesn't apply there.
- **FR-021**: THE HUD'S PLACEMENTS TABLE (`compose/hud.ts`, spec 005 FR-020) SHALL hold the compact boxes beside the bands, in the kernel, so moving a cluster is one edit and the checks follow it; `room.css` SHALL take every box's size from it through the room's CSS properties, and the stages test SHALL pin them. THE BANDS AND THE PROPERTIES spec 005 and spec 012 read (`--clear-x`, `--clear-y`, `--clear-w`, `--clear-h`, `--notes-h`, `--column-w`, the palette's properties) SHALL keep their meanings.

**The look** (Q3)

- **FR-022**: IN THE COLUMN AND DOCK LAYOUTS, EVERY HUD CONTROL SHALL be a tile: the bar's tiles; the list's buttons and its header toggle; the conversation's Send or Stop, talk button, header toggle, and larger-view control; the hand-off's offer's buttons; the walking and full-screen controls. NO HUD CONTROL in those layouts SHALL take the page's base button (`.room button`: white face, dark words). THE RESUME'S PANEL stays the opaque document spec 005 made it (its FR-027), its controls and heading as they are.
- **FR-023**: THE STAGE'S NOTES (the placeholder note and the stand-in line) SHALL be glass chips with light words, legible to spec 005's FR-024 floor, and SHALL still let a pointer or a touch through to the scene (spec 005 FR-033; spec 009 FR-029). The hand-off's offer and the status lines SHALL sit on the glass too.
- **FR-024**: THE HUD'S HEADINGS (the list's "In the room" and the conversation's header) SHALL be set in the chalkboard's hand-lettered face, Patrick Hand; ITS WORDS in the site's sans, IBM Plex Sans; and ITS FIGURES in the site's mono, IBM Plex Mono: the files the site already serves (`src/fonts.css`). Each SHALL fall back to its generic family until its file arrives, and the HUD SHALL add no font, icon set, image, or package from outside the repository (spec 005 FR-029).
- **FR-025**: A TILE'S STATES SHALL show by more than colour (WCAG 1.4.1): hover and selection by an edge in the neon's warm colour (`neon.ts`'s tube colour) beside a change of face; pressed by spec 005's inset ring and underline; inert by spec 005's mark; focus by spec 005's yellow ring, `#ffd23f`, 2 pixels (its PD-16), unchanged.
- **FR-026**: EVERY NEW PAIR of words and face, and every new mark, SHALL meet spec 005's FR-024 floor composited over pure white and over pure black: 4.5:1 for text (3:1 large), 3:1 for boundaries, icons, state marks, and the focus ring. `test/room/hud-contrast.test.ts` SHALL compute them from the stylesheets' palette, and the glass's opacity SHALL stay the lowest 5% step at which every pair passes.
- **FR-027**: A TILE'S, A CHIP'S, OR A PANEL'S TRANSITION SHALL take at most 150 ms, and none WHILE the device asks for reduced motion (spec 005 FR-047). THE HUD SHALL have no idle animation: nothing in it moves unless the visitor's action or the conversation changes it. (The guidance: "Respect reduced-motion settings for non-essential animation.")
- **FR-028**: THE LOOK SHALL be the room's own: no logo, wordmark, brand colour, or third party's art (spec 004 FR-046's rule), and nothing that names or imitates the guidance's source.
- **FR-029**: THE GAME UI GUIDANCE SHALL be cited by its URL only. Its text SHALL NOT be committed, quoted beyond short lines, or copied into any file, unless its licence, which this session couldn't confirm, allows it.

**Walking from the room's view** ("Start from the room's view (Recommended)"; Q4)

- **FR-030**: WHEN the visitor enters the walking view, THE CAMERA SHALL stay at the room's view, level and centred, with no move and no transition, and the walking view SHALL take focus (spec 008 FR-022, FR-042). The picker SHALL keep its areas.
- **FR-031**: WHILE the walking view holds the room's view, THE CAMERA SHALL NOT move when the figure walks, by the keys or by a tap's walk-to. Taps SHALL pick, and walk-to the floor, at the room's view, as spec 008's FR-030 and FR-031 have them.
- **FR-032**: THE HOLD SHALL end at the first of: (a) a turn, a tilt, or a zoom, by any of spec 008's inputs (Q and E, R and F, plus and minus, a drag, the wheel, or a pinch); or (b) the figure's framed box, at the current camera, coming within 0.5rem of a HUD box or of the window's edge. The figure's movement keys alone SHALL NOT end it.
- **FR-033**: WHEN the hold ends, THE FOLLOW CAMERA SHALL take over from the room's view: its orbit starting at the room's view's position as seen from the figure's focus, held to spec 008's limits and region (its FR-023, FR-024), the triggering turn, tilt, or zoom applied to it. THE CAMERA'S MOVE SHALL take at most 500 ms, and SHALL be a cut WHILE the motion store doesn't animate (spec 008 FR-022, FR-044).
- **FR-034**: ONCE IT HAS TAKEN OVER, THE FOLLOW CAMERA SHALL behave as spec 008's FR-023 and FR-024 say, its view shifted into the frame area as the room's view is (FR-015), until the visitor leaves the walking view.
- **FR-035**: WHEN the visitor leaves the walking view, THE CAMERA SHALL return to the room's view and the figure to its place (spec 008 FR-022); WHERE the view was held, NOTHING SHALL move.
- **FR-036**: WHEN the room re-fits WHILE the view is held, THE HELD VIEW SHALL be the room's view at the new frame, and the hold SHALL continue.
- **FR-037**: THE WALKING DATA'S LIMITS (`scene.yaml`'s `walking.camera`: the yaw, the pitch from 0 to 35°, the distances, the focus height) SHALL stay as they are; the hold and its 0.5rem margin are code, as spec 008's transition time is.

**The paper in the hand** (D1)

- **FR-038**: WHEN the visitor's figure keeps the sheet in its holding hand (spec 009 FR-018), THE SHEET SHALL sit at that avatar's grip for that hand: its held edge's middle at the grip's point, between the thumb and the fingers, and the sheet extending away from the forearm. NO POINT OF THE SHEET SHALL lie within the forearm's volume: the segment from the forearm's bone to the hand bone, at 4 cm around it in the room's metres. The sheet SHALL move with the hand, walking included (spec 009 FR-028).
- **FR-039**: THE GRIPS SHALL be data: the scene's `figures` block (spec 009 FR-037) SHALL hold an optional `grips` map, from an avatar of the room's avatar table to `right` and `left`, each `{ at: [x, y, z], turn: { x, y, z } }`: the held edge's middle in the hand bone's frame, in metres at the avatar's room scale, each coordinate within 0.15; and the sheet's turn from the hand bone's axes, in degrees, each within ±180. CHANGING ONE SHALL be a data edit. THE COMPOSITOR SHALL refuse a grip outside those bounds or for an avatar not in the table.
- **FR-040**: WHERE an avatar with hand bones has no grip for its holding hand, THE SHEET SHALL take the grip computed from the hand's bones: its held edge's middle at the midpoint of the hand bone and the middle finger's first bone (`mixamorig:RightHandMiddle1` or `mixamorig:LeftHandMiddle1`), or at the hand bone where that bone is missing; the sheet extending from there along the hand's direction, away from the forearm, its face toward the figure's front. NEVER SHALL it take the wrist lifted by half the sheet.
- **FR-041**: THE TWIN'S SHEET before the hand-off, and the hand-off's sheet at its start and its end, SHALL take each holding hand's grip the same way (spec 009 FR-019 (b) and (c)).
- **FR-042**: THE LOOKDEV PAGE, in drafts builds only, SHALL show the man and the woman holding the sheet in each hand, at rest, in "idle-holding", and mid-walk, for the Author's look (D1).
- **FR-043**: NOTHING under `assets/` SHALL change for the grips: the avatars' files under `assets/visitors/` and their records stay as they are, and no patch for them is needed.

**The neon sign's glow** (the Author's addition; D3)

- **FR-044**: THE NEON SIGN'S GLOW SHALL follow its neon: a path glow along the tube that frames the arrow, and the letters' own tube pass (spec 004's neon renderer). NO GLOW SHALL be drawn farther from the tube's path than its spread, and NO DISC SHALL be drawn behind the sign.
- **FR-045**: A CATALOG GLOW (room-data-files.md §4) MAY give a `path` instead of a `radius`: at least two points `[x, y, z]` in the piece's frame at scale 1, each inside the piece's bounds, read in order, closed when the last equals the first; and a `spread`, the glow's half-width in metres at scale 1, above 0 and at most 0.05. A glow SHALL give exactly one of `radius` and `path`. THE COMPOSITOR SHALL refuse anything else in a strict build. THE NEON SIGN'S `tube-glow` SHALL become a path along its tube, the arrow's outline as the catalog's stand-in tubes trace it (a data edit).
- **FR-046**: THE LETTERS' GLOW SHALL stay their face's own pass, drawn inside the face's panel (spec 004 FR-046, FR-047), at a strength lookdev sets; no glow card SHALL be drawn over the faces.
- **FR-047**: A PATH GLOW'S STRENGTH, TONE, LEVEL, AND MOTION SHALL be a disc's (spec 004's `glows.ts`): its tone's colour and intensity from the look, its level from its piece or the shown pose, `flicker` wavering while the room animates and holding still at full strength while it doesn't (spec 004 FR-059, FR-060). Its strength SHALL fall from the path to its spread's edge, so it reads as light along the tube, not a band.
- **FR-048**: EVERY OTHER GLOW (the laptop's charge light, the screens') SHALL keep its disc.
- **FR-049**: A PATH GLOW SHALL draw as one mesh with one material per glow, at most 2,000 triangles, with no post-processing pass; the sign's glow SHALL cover less of the screen than the disc it replaces.

**The chalkboard** (D2)

- **FR-050**: THE CHALKBOARD SHALL show "denverlocal.ai" in a release build once `main` approves the digest of `apps/web/content/room/chalk-denverlocal.yaml` under the kind `room-text` (spec 004's T203). THIS SPEC'S BRANCH SHALL carry that approval as a patch for the Author's hand: one new entry, the next id after main's last (C-0003 where gate 4's C-0002 is the last), with the block's path, the kind `room-text`, its SHA-256, the date, and a `reason` for his words; built from plain copies of main's file (`git show`, `diff -u`), never with `git apply` or a write into any worktree; and never applied by an agent (`assets/policy/` is human-only).
- **FR-051**: THE BLOCK'S BYTES SHALL NOT change on this branch after the patch's digest is taken. WHERE they must, THE PATCH SHALL be rebuilt in the same commit, and the note SHALL give the digest the reviewer recomputes.
- **FR-052**: THE CORPUS SHALL NOT change: `corpus/05-mission.md`'s line, the interviewer's note that he "said the chalkboard now lists "denverlocal.ai"", stands, and becomes true on the live board with his approval. A corpus proposal under `corpus/proposals/` SHALL be written only on his word (D2).

**The placeholder note** (Q5)

- **FR-053**: THE PLACEHOLDER NOTE'S PRESENT WORDS, the UI word `standin.note` ("Placeholder shapes stand in for the room's pieces until their models arrive"), SHALL show only WHILE a room piece shows its placeholder shape: a stand-in in the composed scene, or a model that failed or was skipped at run time (spec 004 FR-057). THE BUILD'S FLAG for it SHALL count the room's pieces alone, never an avatar's missing model.
- **FR-054**: WHILE the 3D room shows the visitor's figure as its flat shape because its chosen avatar has no model or its model failed, THE NOTE SHALL say the UI word `standin.avatar` (D11: "Your figure is a flat placeholder until its model arrives."). WHERE both causes hold, THE ONE NOTE SHALL say both, `standin.note` first. In the 2D room, the visitor's figure's words SHALL NOT show.
- **FR-055**: THE TWIN'S STAND-IN SHALL keep spec 009's FR-013 line alone, `twin.stand_in`, unchanged. THE NOTES SHALL stay two at most, the placeholder note and the stand-in line, in the clear area's top left, in view wherever the scene is (spec 005 FR-021), each letting a pointer through.

**The sign's proof** (D4)

- **FR-056** *(withdrawn by Amendment X1, the Author's answer of 2026-11-10: "Drop the make target")*: A CHECK, `make sign-check ENV=dev-cpu` (agent sessions, on the agents' engine through the relay) or `ENV=dev` (the Author's terminal), SHALL, on a running stack, as [contracts/sign-check.md](contracts/sign-check.md) gives it: (a) stop the model server and wait until the gateway reports the local adapter unhealthy; (b) send one conversation turn through the edge's site listener, `POST /api/room/turn`, with the body the page sends for a selected piece; (c) read the 200 reply's `route` and `cost_micro_usd` and nothing else of it; (d) give the status and those two fields to the room's own code, `signals/turn-cost.ts`'s classification, cost channel, and readings, with the index's UI words, and read "this call" and "this visit" as the sign would; (e) start the model server, wait for it to be healthy, and repeat (b) to (d) once. It SHALL pass only WHEN the first reply is 200 with `route` `fallback` and a cost above 0, its readings the paid estimate (`sign.estimated`), and the second is 200 with `route` `local` and cost 0, reading `sign.local` with $0.
- **FR-057** *(withdrawn by Amendment X1, the Author's answer of 2026-11-10: "Drop the make target")*: THE CHECK SHALL refuse, before anything changes, any stack but dev and dev-cpu, dev-cpu off the agents' engine, a stack whose gateway reports no synthetic spend (`GATEWAY_TEST_SYNTHETIC_SPEND`), and a stack whose kill switch isn't `normal` ([contracts/sign-check.md](contracts/sign-check.md) §2). IT SHALL never call a paid adapter: dev's route has none (`config/routing.yaml`). IT SHALL leave the model server running whatever the outcome.
- **FR-058** *(withdrawn by Amendment X1, the Author's answer of 2026-11-10: "Drop the make target")*: THE CHECK SHALL print a table of each step with its status, route, cost, and the two readings, and SHALL never print or store the twin's words, the request's text, a token, or a secret. It SHALL exit 0 on a pass, 1 on a miss, and 2 on a refusal.
- **FR-059**: THE SIGN SHALL keep reading only each turn's reply, never Langfuse (spec 004's turn-cost.md §1, unchanged), and the turn route's reply SHALL keep its two fields as they are.

**Spec 004's checks, at the frame areas**

- **FR-060**: THE SUPPORTED STAGES SHALL be the frame areas the kernel gives each screen of spec 005's sweep, for each layout and docked-panel state, each with the HUD boxes that overlap it, in its pixels, as its reserved boxes. RG6 SHALL reserve every such box, as it reserves the walking control's (spec 005 FR-055). RG5'S AND RG7'S RULES AND FLOORS, and RG6'S 44-pixel and exclusive-core rules, SHALL stay as written.
- **FR-061**: NO CHECK SHALL weaken: spec 005's FR-054 floor SHALL hold (every frame area holds the clear area, which holds its stage before spec 005), and spec 005's FR-057 SHALL hold (each side-wall selectable's list-only stages no more than before). THE COMPOSITOR'S REPORT SHALL give, for each screen, the ease and the room's scale over spec 005's frame.

**Accessibility**

- **FR-062**: SPEC 005'S FR-043 TO FR-051 SHALL hold with the compact HUD, the new look, and the held walking view: the Tab order unchanged; 44 × 44 targets in every layout; no keyboard trap; focus never hidden entirely by a HUD box (WCAG 2.2's 2.4.11), a figure or piece under no panel included; reflow at 320 CSS pixels and 200% text through the stacked layout; and WCAG 2.2 AA in every layout, panel state, and mode, in 3D and 2D, in and out of full screen. THE NEW WORDS SHALL be text a screen reader reads, and the held view's hand-over SHALL announce nothing new.

**Performance**

- **FR-063**: THE ROOM SHALL hold spec 002's FR-048 floors at the full window with the compact HUD, the frame area, and the path glow: 30 frames a second on the reference phone and 60 on the reference desktop, stepping quality down as today where it can't. A re-fit's frame computation SHALL make at most 17 framings (FR-013). The lookdev page's runs SHALL report the ease and the frame area beside spec 005's figures.

**Telemetry, data flow, words, the stack, and the record**

- **FR-064**: IN A DRAFTS BUILD, THE FRAME LOG (spec 004's R-70; spec 005 FR-063) SHALL record each re-fit's frame area and ease, a frame computation that fell back (FR-004), and the walking view's hold and hand-over with its cause (turn, tilt, zoom, or edge), in page memory only. A release build SHALL keep no log. THIS SPEC SHALL add no usage event, no span, and no dashboard panel: nothing it changes is seen by a server, and the room's 2D-share panel already shows the frame cost's risk (Telemetry).
- **FR-065**: NOTHING THIS SPEC CHANGES SHALL send a byte off the visitor's device: no event, request, or new third-party fetch. The fonts are the site's own files, already served from its origin under spec 002's row V1. The data-flow disclosure SHALL NOT change.
- **FR-066**: THE UI WORD `standin.avatar` SHALL join spec 004's closed list (its room-data-files.md §9) and pass its checks; it states nothing about the Author.
- **FR-067**: THE CHANGE SHALL alter no response header, keep the CSP's `style-src 'self'` (classes and CSS properties set through the CSS object model, never a `style` attribute), and add no package. WHEN the operator runs `make up` on any stack, IT SHALL start as before: no new service, container, port, env key, or secret. `make sign-check` SHALL be the only new target, and SHALL run nothing on prod.
- **FR-068**: A NEW ADR, proposed, at the next free number (D10), SHALL record the frame area and its ease, the protected boxes, the compact clusters and their budget, and the look's materials, amending ADR 0043's decisions 2 to 4 by name, with the Author's words quoted.

### Key Entities

- **The frame area and its ease**: a box between the window and spec 005's clear area, and the share t that places it; computed per screen, docked-panel state, and metrics from the scene's protected boxes (FR-009, FR-016).
- **The protected boxes**: the pressable selectables' 44 × 44 cores and both figures' framed boxes, at the room's view (FR-010).
- **The HUD's compact boxes**: per layout, the strip's, the bar cluster's, and the column's boxes beside spec 005's bands, in the kernel's table (FR-017, FR-021).
- **The walking hold**: held or following, and the cause of the hand-over (FR-030 to FR-036).
- **A grip**: per avatar and hand, a point and a turn in the hand bone's frame, or the computed default (FR-039, FR-040).
- **A path glow**: a polyline, a spread, a tone, a motion, and a level, in a piece's catalog entry (FR-045).
- **The board's approval**: one entry of kind `room-text` in main's `content-approvals.json`, the Author's (FR-050).
- **The placeholder note's causes**: room pieces, the visitor's figure, both, or none (FR-053, FR-054).
- **The sign check's run**: two turns, their statuses, routes, costs, and readings (FR-056 to FR-058).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Over 100% of spec 005's sweep, in the opening state and each docked-panel state: the frame area holds the clear area; the room's on-screen scale is at least spec 005's; every protected box lies outside every HUD box by at least 0.5rem; and no smaller ease in 1/16 steps would do. On the reference desktop (1920 × 1200) the room is larger than spec 005's frame in the binding dimension, and the compositor's report gives every screen's ease.
- **SC-002**: RG5, RG6, and RG7 pass at 100% of the supported stages with their floors unchanged; every side-wall selectable's list-only stages are a subset of spec 005's; the stages test pins the table, the bands, and the compact boxes to `room.css`, and fails on a one-rule change to either.
- **SC-003**: The always-on interface covers at most 25% of the window on 100% of the landscape windows from 1280 × 720 to 3840 × 2160 in the column layout, by the layout model.
- **SC-004**: 0 HUD controls in the column or dock layouts take the page's base button; 100% of the HUD's text and mark pairs, the new ones included, pass the contrast floor over white and black; 0 font, icon, image, or package files are added; and under reduced motion, 0 HUD transitions run.
- **SC-005**: In the walking tests: on entry and through a scripted walk that stays clear, the camera changes 0 times; the first turn, tilt, or zoom, and the figure nearing a HUD box or the window's edge, each hand over in 100% of runs, the first frame of the hand-over equal to the room's view within 1 mm and 0.01°, the move ending within 500 ms, or at once with the motion store still.
- **SC-006**: For the man and the woman, each hand, at rest, in "idle-holding", and mid-walk, in the skeleton fixtures' tests: the held edge's middle within 1 cm of the grip's point, and 0 of the sheet's points within the forearm's volume. The Author's lookdev look records a yes or a no for each.
- **SC-007**: The neon sign has 0 disc glow cards; 100% of its glow's vertices lie within the spread plus 1 mm of the path; its glow's screen area at the reference desktop is less than the disc's; and at quality 2 and 3, 0 glows are drawn.
- **SC-008**: With a fixture policy approving the block's digest, 100% of release builds publish the line and draw it on the slate; without it, 0 do. The Author's patch adds exactly one entry, whose digest equals the block's, and applies to main's file as it is.
- **SC-009**: Over the note's table of causes, 100% of cases show exactly the words for what is missing, or no note.
- **SC-010** *(withdrawn by Amendment X1: "Drop the make target"; his live reading on prod is the evidence)*: `make sign-check ENV=dev-cpu` passes: a paid-estimate reading with the model server stopped and `local · $0` with it running; 0 paid calls (the route has none); 0 of the twin's words in its output; and it refuses `ENV=prod` with exit 2.
- **SC-011**: In fault-injection runs over FR-002's states, with no WebGL 2, with the frame computation throwing, with a hand bone missing, with the glow's path missing, and with no approval, 100% end with the room filling the window, the HUD usable, the AI disclosure in view, and the stand-in line in view while it applies; the network log holds 0 requests beyond today's.
- **SC-012**: The automated check reports 0 WCAG 2.2 AA violations in every layout, panel state, and mode, in 3D and 2D, in and out of full screen; a keyboard-only and a screen-reader run complete spec 005's SC-005 tasks with the held walking view.
- **SC-013**: Over the lookdev page's 2-minute runs at the full window, the reference phone holds a median of at least 30 frames a second with at least 95% within 33 ms, and the reference desktop a median of 60, with the reports giving the ease and the frame area. The Author runs them after the merge.
- **SC-014**: After the merge, the Author looks at the live room and records a yes or a no for each: the room filling the window under the panels, the new look, walking from the room's view, the paper in the hand, the neon's glow, the board's words once his approval is on main, and the note.
- **SC-015**: The change adds 0 packages; `make up ENV=dev-cpu` starts unchanged; the entry chunk stays within spec 002's 150 KB budget; and the measured cloud and model cost is $0.
- **SC-016**: The sign's reading on prod's live stack is the Author's, recorded in his words in the intent: "Yup, it's working now! ive clicked the snowboard and the cost is changing". No further live run is required by this spec.

## Amendments to Specs 004, 005, 008, and 009, and to ADR 0043

As specs 004, 005, and 008 do, the amended text stays as it is; each row supersedes the clause it names from this spec's approval. Clauses were read on `main` at b335b9b2. [plan.md](plan.md) §13 names the files and tasks that carry each row.

| ID | Spec and clause | Change | Why |
|---|---|---|---|
| W1 | Spec 005, FR-015 and FR-016 (framed into the clear area, its centre at the clear area's centre; contain in the clear area) | Framed into the frame area, the least ease from the window toward the clear area that keeps every protected box out from under a HUD box; contain, its margin, never stretched or cropped, unchanged | FR-009 to FR-012; "Overlay only" |
| W2 | Spec 005, FR-003 and FR-017 (the 2D drawing centred in the clear area) | The 2D drawing framed into a frame area by the same rule, its hit areas and figures protected | FR-003 |
| W3 | Spec 005, FR-018, and spec 008, FR-023's "at the stage's aspect" | The hand-off, the walking view, and the follow camera use the production framing into the frame area, the follow camera's view shifted into it | FR-015, FR-034 |
| W4 | Spec 005, FR-020 (the column from the strip to the bar; the strip and the bar across the window) | In the column layout, compact clusters inside spec 005's bands: the strip as wide as its words, the bar's tiles one centred cluster, the column sized to its content at its band's foot; the bands stay the floor's definition; the dock layout unchanged | FR-017 to FR-021; Q2 |
| W5 | Spec 005, FR-025 and FR-026 (the game look, on the bar's tiles) | Every HUD control a tile; the notes glass chips; the headings' face, the sans, and the mono; the neon's warm accent for hover and selection; transitions at most 150 ms | FR-022 to FR-028; Q3 |
| W6 | Spec 005, FR-052 and FR-055 (the supported stages are the clear areas; RG6 reserves the HUD controls over the clear area) | The supported stages are the frame areas, each with every overlapping HUD box reserved | FR-060, FR-061 |
| W7 | Spec 005, FR-063 (the frame log's re-fits) | Each re-fit also records its frame area and ease; the walking view's hold and hand-over join | FR-064 |
| W8 | Spec 004, contracts/room-data-files.md §13.3, as spec 005's H10 amended it | The stages are the frame areas, with their reserved boxes; the report gives each screen's ease | FR-060, FR-061 |
| W9 | Spec 004, contracts/room-data-files.md §4 (`glows[]`: `radius` required) and §13 (its rule for a glow) | A glow gives `radius` or `path` with `spread`, exactly one; the compositor's rules for a path | FR-045 |
| W10 | Spec 004, the neon sign's catalog entry (`neon-sign.yaml`, `tube-glow`) | A path along the tube, the arrow's outline; a data edit under W9's rule | FR-044, FR-045 |
| W11 | Spec 004, FR-013's manifest flag as `emit.ts` computes it (`build.placeholders`, which counts the avatars' models) | The flag counts the room's pieces alone; the room adds a piece that falls back at run time | FR-053 |
| W12 | Spec 004, contracts/room-data-files.md §9 (the UI words' closed list) | Gains `standin.avatar` | FR-054, FR-066 |
| W13 | Spec 008, FR-022 ("THE ROOM SHALL start the follow camera from the production framing"; the move into the walking view within 500 ms) | The walking view starts held at the room's view, with no move; the follow camera takes over at the hold's end, within 500 ms | FR-030 to FR-033; "Start from the room's view (Recommended)" |
| W14 | Spec 008, FR-023 ("SHALL follow the figure as it walks") | It follows once it has taken over; while held, the camera stays | FR-031, FR-034 |
| W15 | Spec 009, FR-018 (the kept paper in the holding hand) and its plan's R-09 ("given a fixed offset so the hand holds its lower edge"; "The offset is a constant in code that lookdev judges") | The sheet sits at the hand's grip: from data, or computed from the hand's bones; never along the forearm | FR-038 to FR-041 |
| W16 | Spec 009, FR-037 (the `figures` block) | Gains the optional `grips` map | FR-039 |
| W17 | Spec 009, D10 ("The placeholder note. Its trigger and words stay spec 002's and spec 004's") | The note counts the room's pieces, and says the visitor's figure's words where that is what is missing | FR-053 to FR-055; Q5 |
| W18 | ADR 0043, decisions 2 to 4 (the placements; the clear area as the stage; contain framing into the clear area) | Amended by FR-068's ADR: the frame area and its ease; the stages as frame areas; the compact clusters. ADR 0043 is proposed, so no accepted decision is reversed | FR-068 |
| W19 | Spec 008, FR-021 ("THE WALKING CONTROL SHALL sit in the stage, not in the toolbar ..."), and this spec's FR-017 (c) | In the column layout, on a window wide enough for the bar's six tiles and the walking control in one row (`compose/hud.ts`'s `walkInBar`), the control is a tile at the bar cluster's left end, in the bar's band, not over the stage; no toolbar row is added, it stays at least 44 × 44 (8rem by 2.75rem), RG6 still reserves it wherever it lies over a stage, and its behaviour (FR-030 to FR-036), focus, contrast, and reduced motion are unchanged. On a narrower column window and in the dock layout, phones among them, it stays in the clear area's bottom-right corner. Added after the review (T053) | The Author's answer of 2026-11-10, "Move the walk control (Recommended)": the review found that the control's box over the twin's framed box at the clear area's corner bound the reference desktop's frame at 10/16 |

**Spec 002** is not amended beyond what spec 005 did. **Spec 007's** conversation and **spec 004's** turn-cost.md are unchanged (FR-059). **Spec 012's** loader is unchanged; this spec keeps the properties it reads (FR-021).

## Amendments After the Review (T053)

The review of e40b875f (T052) put two questions to the Author on 2026-11-10. His answers, verbatim: "Drop the make target" and "Move the walk control (Recommended)".

| ID | Clause | Change | Why |
|---|---|---|---|
| X1 | This spec's FR-056 to FR-058, SC-010, User Story 8's stack check, plan PD-20 and PD-21, contracts/sign-check.md, and tasks T045 and T059 | Withdrawn. No stack runs the sign's check: no `make sign-check`, no `evals/sign_check.py` or `evals/sign_probe.py`, no `build/room/sign-reading.ts`. FR-059 stands. The chain is held by the unit tests (`test/room/turn-cost.test.ts`, the room's readings of each turn's outcome; the gateway's turn-route tests, its route and cost) and the Author's manual live check | The Author's answer, "Drop the make target". The review's blocker: the target ran `node --import tsx` from the working tree with no `$(CONTAINED)`, so agent-writable `node_modules` would have run in his terminal. His live reading on prod, 2026-11-10, is the evidence: "Yup, it's working now! ive clicked the snowboard and the cost is changing" |
| W19 | Spec 008, FR-021, and FR-017 (c) | In the table above | The Author's answer, "Move the walk control (Recommended)" |

## Assumptions

**Scope**

- **In:** the frame area, its ease, and its protected boxes, in 3D and 2D; the compact HUD and its budget; the look of every HUD control and note; walking's held start and hand-over; the grips, their data, and the computed default; the path glow and the sign's entry; the board's approval patch; the note's causes and its new word; the sign's end-to-end check and its make target; the stages and the compositor's report; the lookdev page's views; the frame log's entries; the ADR; and the amendments above.
- **Out:** new scenery beyond the room's shell (his "no new scenery"); any change to the studio's models or the avatars' files (FR-043); the corpus (FR-052); the turn route, the gateway's routing, prices, or caps (FR-059); a new usage event, span, or panel (FR-064); a dark scheme for the site's pages outside the room; studio-made HUD art (Q3's option C, a later intent); and the choice screen.

**Readings**

- **"Overlay only"** reads as the room's frame moving from spec 005's clear area to the window. Read literally, a column over the room's right wall would put the bicycle under glass, where a press can't reach it, and the twin's figure under the conversation. The ease keeps his "recentres and grows" wherever the panels lie over the backdrop or the room's walls, and falls back no further than spec 005's frame where they would cover a piece or a figure (Q1).
- **"Protect the playfield"**, from the guidance, is read as the protected boxes: the pieces a visitor presses and the two figures. The walls, the floor, and the backdrop may lie under glass, which they do today behind the panels.
- **The guidance's points** read here, each in its own short words: "Protect the playfield first, especially in 3D."; "Default to one primary persistent HUD cluster and at most one small secondary cluster."; "no more than roughly 20-25% of the viewport covered by persistent HUD on desktop"; "Menus feel native to the game world, not like a SaaS admin panel."; and its anti-pattern, "Full-width top-and-bottom chrome with large always-on center or body panels in 3D play", which spec 005's full-width strip and bar and full-height column are. Q2 and Q3 take them as far as his spec 005 answers allow: the bar stays at the foot and the column on the right, compacted, rather than moving.
- **"Newer" and "like part of the game"** read as one look on every control, the room's own materials (the chalkboard's lettering, the neon's warm tone) on the dark glass his spec 005 answer chose, and the site's own fonts (Q3). The resume's panel is read as a document, not a control surface, and stays as it is; gate 4 is changing its download at the same time.
- **"Start from the room's view"** reads as the camera staying exactly at the production framing into the frame area, not a follow camera that starts level about the figure: "the camera moves only when the visitor turns, tilts or zooms it, or the figure nears an edge".
- **"Nears an edge"** reads as nearing the edge of the visible scene: a panel or the window's edge (Q4).
- **"Sits in the hand"** reads as held between the thumb and the fingers, extending away from the forearm. Spec 009's "lifted so the hand holds its lower edge" stood the sheet up from the wrist; with the arm hanging, that is the forearm (W15).
- **The stages now read the scene.** Spec 004 keeps the supported stages out of the room's data files so that a data edit can't weaken the checks (its room-data-files.md §13.3). Under this spec a stage is a frame area, which the scene's pieces and figures shape through the protection. A data edit can then change a screen's ease, but never below spec 005's frame, and never with a pressable piece under a panel, since the ease is chosen by exactly that test; so no check can pass that would have failed before (FR-060, FR-061; contracts/frame-area.md §5).
- **Where the grips live.** The avatars' files under `assets/visitors/` are protected (`assets/**`), so the grips live in the room's data, `apps/web/room/scene.yaml`'s `figures` block, which spec 009 made for the figures' tunables, and no patch for the Author's hand is needed (D1). They are presentation, tuned at lookdev, like the figures' other values.
- **"The actual neon letters and neon part that frames the arrow"** reads as the word's lettering and the tube around the arrow's outline. The letters already glow by their face's tube pass (`faces/neon.ts`); the disc behind them is what goes. The counters' figures are plain readings, not neon, and keep their look.
- **The board's claim.** The twin says the board shows "denverlocal.ai" because the corpus records his word that it does. Until his approval is on `main`, a release board is plain and the claim reads ahead of the room. The fix is his approval, which this spec's branch carries as a patch, so no corpus change is proposed (D2).
- **The sign.** No bug: his words record that the turns he watched were local, then that the cost changed once the paid route answered. The check proves the chain on the dev stacks with the synthetic adapter; prod's live reading is his, already given (SC-016).
- **Dates.** The Author's words are dated 2026-11-10, as the intent gives them.

**Dependencies**

- **Spec 012** (the loading screen), branch `feat/012-loading-screen` at 2e1e0563, merges first. It changes `layout.ts`, `app.ts`, `scene.ts`, `scene/avatars.ts`, `build/room/emit.ts`, `ui-words.yaml`, and the room's README, and its loader reads spec 005's CSS properties. This spec's branch is cut from `main` after it, keeps those properties' meanings (FR-021), and reruns spec 012's tests unchanged.
- **Gate 4** (the resume's PDF) adds C-0002 to `content-approvals.json`; the board's approval is the next entry (FR-050). The shutdown test's fix merges independently and touches no room file.
- **The Author's own steps:** his approval of this spec and the plan (T000); applying the board's patch on `main`; the gate and the merge; the lookdev look (FR-042, SC-006) and the live look (SC-014); the performance runs (SC-013); and his yes or no on Q1 to Q5 and D1 to D12.

**Deviations** (named, as the constitution's Governance requires: "Deviations require a written justification in the spec and an ADR if permanent.")

- **Inherited: local until publication** (ADR 0013). This spec and its branch are reviewed with a note in `docs/merge-requests/`, and the Author's gate stands in for CI.
- **Departures from accepted specs**, each an amendment row above, justified by the Author's words: spec 005's framing, placements, look, stages, and frame log (W1 to W7), by "Overlay only" and his request for a newer look; spec 004's stages, glow schema, sign entry, note flag, and words (W8 to W12), by "Overlay only", his addition, and the note's untruth; spec 008's start and follow (W13, W14), by "Start from the room's view (Recommended)"; spec 009's paper, figures block, and note default (W15 to W17), by his words on the paper and the note. None reverses an accepted ADR: ADR 0043 and ADR 0039 are proposed, and FR-068's ADR records the change.
- **Workflow step 7, "A feature without a graph is not done."** Read as met by the room's existing "Room" row, not as a deviation: nothing here is a new capability or control a server sees, and the risk the changes carry, a heavier frame, shows on the 2D-share panel. A graph of its own would need a usage event, which the intent's "Data-flow impact: None. No new byte leaves the visitor's device or the local tier." rules out. On the Author's word (D9), an event and a panel can be added, which would then be a named deviation from that line, as spec 005's D1 was from its intent's.
- **No constitution deviation.** No permission, allowlist, sandbox domain, header, budget, credential, or human-only file changes; the board's approval is the Author's patch; the corpus is untouched.

**Defaults taken**, each provisional and the Author's to overturn (Questions, D1 to D12): the grips (D1); the board (D2); the glow's form (D3); the sign's check (D4); the ease's step (D5); the protected boxes and their margin (D6); the coverage's measure (D7); the column's anchor (D8); no event or panel (D9); the ADR's number (D10); the figure note's words (D11); and the column's rest height (D12).

## Expected Cost Impact

- **Model spend: $0.** Nothing here calls a model at runtime. The sign's check uses dev's synthetic adapter, which spends no money (its "$0.10" is dev's test meter, never a provider's bill), and refuses prod.
- **Cloud: $0.** No new request, route, event, or asset; the fonts are already served. Transfer: the HUD's added CSS and the kernel's frame function, an estimated 3 to 6 KB gzipped in the entry chunk, inside spec 002's 150 KB budget, which the build's check measures.
- **The visitor's device.** The canvas is the same size as under spec 005, so the pixels drawn don't change. A re-fit adds at most 17 framings, each a projection of a few boxes: well under a millisecond. The path glow covers less of the screen than the disc, so its additive fill cost falls.
- **Local:** no new service, container, or port; `make up` unchanged. The sign check stops and starts dev's or dev-cpu's model server for a minute or two.
- **Development time:** agent sessions on the Author's existing plan; the Author's time is about an hour for the patch, the lookdev look, and the live look.
- **Measurement:** the chunk-size check for the bytes; the lookdev reports for the frame rates and the ease; the compositor's report for the ease per screen; the room's 2D-share panel for falls to 2D.

## Degraded-Mode Behavior

Defined before the happy path, as Principle I asks.

| What is gone or off | The frame | The HUD and its look | Walking | The sheet | The sign's glow | The board and the note |
|---|---|---|---|---|---|---|
| Local tier off, budget spent, kill switch `degraded` or unknown, live source off, tier unknown | unchanged | unchanged; the conversation shows its fixed message, the sign "cost unavailable" | unchanged | unchanged | unchanged | unchanged |
| No WebGL 2, or the room falls to 2D | the 2D drawing in its frame area by the same rule (FR-003) | unchanged, no walking control | none | the 2D room's figure | none in 2D | the pieces' note as FR-053; the figure's words don't show |
| The frame computation fails | spec 005's clear area (FR-004) | unchanged | the room's view at that frame | unchanged | unchanged | unchanged |
| The frame rate falls | unchanged | the blur goes at level 2 (spec 005) | unchanged | unchanged | none at levels 2 and 3 (FR-006) | unchanged |
| Reduced motion, "Pause the room", hidden page | unchanged | no transitions (FR-027) | the hand-over is a cut (FR-033) | still, at its grip | still, at full strength (FR-047) | unchanged |
| Reduced transparency, more contrast, forced colours, no blur | unchanged | opaque, or the tint alone (FR-007) | unchanged | unchanged | unchanged | unchanged |
| The window can't hold the HUD | the stacked layout's block (FR-008) | the page's buttons | as today | unchanged | unchanged | unchanged |
| An avatar has no hand bone, or a grip isn't finite | – | – | – | at the hand anchor (FR-005) | – | – |
| The glow's path is missing or degenerate | – | – | – | – | no glow, never the disc (FR-006) | – |
| The board isn't approved on `main` | – | – | – | – | – | a plain slate in a release build; "Draft" in a drafts build |
| The visitor's avatar model fails mid-visit | unchanged | unchanged | the cut-out walks | at the anchor | – | the figure's words appear (FR-054) |

## Telemetry and the Dashboard

- **Spans:** none new. The room has no tracing in the browser, and nothing here reaches a server. The sign check reads the turn route's existing server span only through the reply.
- **Events and panels:** none new (D9). The changes are presentation on the device; the room's existing "Room" row shows the risks that matter: the 2D share for the frame cost, and "Visits that walked" for walking.
- **The frame log**, drafts builds only: each re-fit's frame area and ease, a fallback, and the walking hold and hand-over with their cause (FR-064).
- **Never in telemetry:** the window's size, the frame area, the ease, the HUD's state, the grip, or anything about walking's hold.
- **Runbook:** none. Nothing here can page a human. The sign check's failures print their reason.

## Data-Flow Disclosure Entries

None. No byte newly leaves the visitor's device or the local tier (FR-065). The fonts are the site's own static files, fetched from its origin under spec 002's row V1, as the live faces already fetch them. The sign check runs on the dev stacks inside their internal network.

## Constitution Check

Applied with the `constitution-check` skill's eight questions against constitution 1.1.0.

| Principle | Touched | How it complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | No new byte leaves the device (FR-065); no biometrics; the degraded modes come first (FR-001 to FR-008; User Story 9, P1); `make up` unchanged (FR-067). |
| II. Production-grade or not shipped | Yes | Every FR has a test or the Author's run behind it (SC-001 to SC-016); the sign's chain gains an end-to-end check (FR-056); the frame log's entries (FR-064); the cost above; the ADR (FR-068). No model, so no evals; nothing pages, so no runbook; no new graph, by the Telemetry section's reasoning. |
| III. Intent before spec, spec before code, humans merge | Yes | From the accepted intent, his three final answers and his addition quoted verbatim beside their readings; Q1 to Q5 and D1 to D12 taken under his acceptance and kept with their options; amendments named, not edited in; no code here; he merges. |
| IV. Least privilege | Yes, at one point | The board's approval is a patch for his hand; agents never write `assets/policy/` (FR-050). The sign check refuses prod and paid routes (FR-057). No permission, allowlist, or human-only file changes. |
| V. Cost is a first-class signal | Yes | $0 model and cloud spend; the check never calls a paid adapter; the sign keeps reading the gateway's own estimate (FR-059). |
| VI. Build in public, including failures | Yes | The demo's findings, the misread of the sign and its cause, and the provisional answers are public in the spec. |
| VII. Own the whole product, and say exactly what you owned | Yes | The product reasoning beside the systems reasoning: why the ease, why the protected boxes, why compact clusters, why the board waits for his approval. His words are quoted, never paraphrased. |
| VIII. Honest AI | Yes | The AI disclosure and the stand-in line stay in view (spec 005 FR-021). The board's claim becomes true by his approval, not by changing the corpus. The note stops saying something untrue (FR-053). No new word speaks for the Author (FR-066). |
| Security & Agent Governance | Yes | No agent configuration changes; the implementer doesn't review; the check runs on the agents' engine through the relay and never on prod; the guidance is third-party data, cited, not followed as instructions. |
| Technology Standards, Frontend | Yes | The 3D room in the browser, unchanged in kind. |

## Questions for `/speckit-clarify` (answered provisionally, 2026-11-10)

Each question was answered by its recommended option, taken under the Author's acceptance ("I accept the intent with your recommendations. go for it!"), provisionally, his to overturn (Clarifications). The questions stay as written, with every option, so he can choose another.

### Q1: With the HUD laid over the room, how is the room framed, and how does a piece under a panel stay pressable? (FR-009 to FR-016, FR-060, FR-061)

**Why it matters**: framed into the whole window, the column covers the right wall's pieces and the twin on narrower windows, and spec 005's checks require every piece the pointer can reach today to stay reachable.

**Context**: His answer, "Overlay only", with the intent's "The room is framed into the whole window with the interface laid over it, so it recentres and grows." On a 1920 × 1200 window, spec 005's clear area is 1472 × 1120.5; framed into the whole window, the room grows by about 7% (1200 ÷ 1120.5) and moves 224 pixels right, so its right edge, about 54 pixels of it, falls under a 448-pixel column. On a 1280 × 720 window the overlap is about 150 pixels; on 2560 × 1440, none. The bicycle hangs on the right wall, the laptop sits at the desk's right, and the twin stands front right. Spec 005's FR-057 holds each side-wall selectable's list-only stages to no more than before.

**Recommended:** Option A. It gives "recentres and grows" wherever the panels lie over the backdrop or the walls, keeps every piece pressable that is pressable today, and can never make the room smaller than spec 005's.

| Option | Description |
|---|---|
| A (recommended) | Framed into the whole window, eased back toward spec 005's clear area, in sixteenths, only as far as it must so that no pressable piece and neither figure lies under a panel. Never smaller than spec 005's frame. The checks run at the eased frames, with every panel's box reserved. |
| B | Framed into the whole window always. A piece under a panel is reached from the "In the room" list alone; spec 005's FR-057 is amended so the list-only set may grow, a weakened check, with an ADR. |
| C | Framed into the window less the strip and the bar, so only the column lies over the room. It recentres sideways but doesn't grow on landscape windows, where the height binds. Pieces under the column as in A. |

### Q2: How much of the window may the always-on interface cover, and where does the conversation sit? (FR-017 to FR-021)

**Why it matters**: the guidance caps persistent HUD at about a quarter of a desktop window, and today's full-height column with full-width strip and bar covers about 28% of a 1920 × 1200 window, and more of the room once it is framed under them.

**Context**: Spec 005's Q1 answer, "Bottom bar, plus one column on the right", is the Author's and stands. The guidance: "Default to one primary persistent HUD cluster and at most one small secondary cluster."; "no more than roughly 20-25% of the viewport covered by persistent HUD on desktop"; and its anti-pattern, "Full-width top-and-bottom chrome with large always-on center or body panels in 3D play". The conversation is the room's main verb, and spec 005's FR-022 keeps the text box, Send, and the talk button always in view.

**Recommended:** Option A. It keeps his places and the conversation in view, and meets the guidance's budget by sizing each part to its content.

| Option | Description |
|---|---|
| A (recommended) | Compact clusters in his places: the AI disclosure a strip at the top as wide as its words; the bar's tiles one cluster at the foot; the column on the right sized to its content at its band's foot, the list above the conversation, the log a few lines that scroll, "Larger conversation" on request. The always-on interface at most 25% of every landscape window from 1280 × 720 in the column layout. Phones keep spec 005's dock. |
| B | The conversation in a drawer: at rest, only the text box's row and a "Conversation" tile show; the log and the list open when the visitor asks, sends a turn, or selects a piece. At most about 12%. |
| C | Spec 005's places as they are: full-width strip and bar, full-height column; only the look changes; no cap. |

### Q3: What should "newer" and "like part of the game" mean for the panels and buttons? (FR-022 to FR-029)

**Why it matters**: the look is judged by the Author's eye, but the contrast floors, the fonts, and the files it may use are testable, and the answer sets which of them change.

**Context**: Spec 005's Q2 answer, "Use the dark glass recommendation and just go ahead with putting everything in instead of approval at lookdev first", gave the bar dark glass tiles; the list's buttons, the conversation's buttons, and the notes kept the page's white style. The site already serves IBM Plex Sans, IBM Plex Mono, and Patrick Hand (the chalkboard's face). The neon sign's tube is a warm `#ffb08a`; the highlight and the focus ring are `#ffd23f`. The guidance: "Menus feel native to the game world, not like a SaaS admin panel."

**Recommended:** Option A. One look on every control, from the room's own chalk and neon, with no new file and the contrast floors held by the test.

| Option | Description |
|---|---|
| A (recommended) | The room's own materials on the dark glass: every HUD control a tile like the bar's, the notes as glass chips, headings in the chalkboard's hand-lettered face, words in the site's sans, figures in its mono; the neon's warm colour as the accent for hover and selection, the highlight's yellow kept for focus; transitions at most 150 ms, none under reduced motion; the same tiles on phones. |
| B | The bar's tiles everywhere, nothing else: every control takes the existing dark tile; no new type or accent. |
| C | Diegetic panels: the list on a chalk slate, the conversation on a screen, the bar as neon tubes, from studio art with records (spec 003): a later intent. |

### Q4: When walking starts from the room's view, when does the camera start to follow the figure, and how does it hand over? (FR-030 to FR-037)

**Why it matters**: his answer says the camera moves when "the figure nears an edge", and a test needs that edge and the hand-over defined.

**Context**: His answer, "Start from the room's view (Recommended)", with the intent's "the camera moves only when the visitor turns, tilts or zooms it, or the figure nears an edge". The room's view frames the whole room, so the figure can't leave it, but it can walk under a panel. Spec 008's follow camera orbits the figure and blends in over 500 ms, or cuts while the motion store is still.

**Recommended:** Option A. The view holds as he asked, the figure never disappears under glass, and the follow camera takes over from exactly where the view stands.

| Option | Description |
|---|---|
| A (recommended) | The view holds until the visitor turns, tilts, or zooms, or the figure's box comes within 0.5rem of a panel or the window's edge. Then spec 008's follow camera takes over within 500 ms, a cut under reduced motion, its orbit starting where the room's view stands, so a turn continues from it. |
| B | Only the visitor's turn, tilt, or zoom hands over; the figure may walk under a panel while the view holds. |
| C | As A, but the figure must leave the visible scene entirely before the camera follows. |

### Q5: What should the placeholder note say, and when should it show? (FR-053 to FR-055)

**Why it matters**: today it says the room's pieces are placeholders when they aren't, because the build sets it for the avatars' missing models.

**Context**: The note, "Placeholder shapes stand in for the room's pieces until their models arrive", shows whenever the twin has no model under `assets/twin/` or any avatar choice lacks one (`emit.ts`'s `avatarsPlaceholder`): the twin never has one (spec 009's stand-in), and the dog and the dinosaur have none. The twin's stand-in has its own line (spec 009 FR-013). The notes share two slots at the clear area's top left (`compose/hud.ts`'s `notes.count`).

**Recommended:** Option A. Each note then says exactly what is missing, and the twin keeps the line spec 009 gave it.

| Option | Description |
|---|---|
| A (recommended) | Say what is missing: the present words only while a room piece shows its placeholder shape; a new line, "Your figure is a flat placeholder until its model arrives.", while the visitor's own figure shows its flat shape in 3D; the twin's stand-in keeps spec 009's line alone; one note slot. |
| B | Count only the room's pieces: the note shows only for them, and nothing for the avatars beyond the twin's line. |
| C | One note, reworded for both: "Placeholder shapes stand in for some pieces and figures until their models arrive.", on either cause. |

### Defaults taken, each provisional, for a yes or a no

- **D1. The grips.** In `scene.yaml`'s `figures` block, per avatar and hand, tuned at lookdev for the man and the woman in each hand; a computed default from the hand's bones for any other avatar with hands (FR-039, FR-040). The avatars' files are untouched, so no patch is needed (FR-043).
- **D2. The board.** No corpus change; his approval, C-0003 or the next free id, comes as a patch for his hand (FR-050 to FR-052). On his word, a corpus proposal instead or as well.
- **D3. The glow's form.** A path glow along the tube from the catalog, a spread of 1.5 cm at scale 1 (about 4 cm at the sign's 2.6), falling to nothing at its edge; the letters keep their face's pass; none at quality 2 and 3 (FR-044 to FR-049).
- **D4. The sign's check.** `evals/sign_check.py` with its probe on the stack's internal network, as the breach test's, behind `make sign-check ENV=dev-cpu|dev`, using dev's synthetic adapter (FR-056 to FR-058).
- **D5. The ease's step.** Sixteenths, so at most 17 framings a re-fit (FR-009, FR-013).
- **D6. The protected boxes and their margin.** The pressable selectables' 44 × 44 cores and both figures' framed boxes, 0.5rem clear of every HUD box (FR-010).
- **D7. The coverage's measure.** The union of the always-on interface's boxes over the window's area, at the compositor's metrics, on landscape windows from 1280 × 720 to 3840 × 2160 in the column layout (FR-019).
- **D8. The column's anchor.** At its band's foot, so the text box stays just above the bar, where it is today (FR-017).
- **D9. No event or panel.** Nothing here is seen by a server; the frame log covers drafts builds (FR-064).
- **D10. The ADR's number.** The next free one when T002 runs: 0046 if spec 012's 0045 has merged.
- **D11. The figure note's words.** "Your figure is a flat placeholder until its model arrives.", a UI word, a data edit (FR-054).
- **D12. The column's rest height.** The log at most 8rem at rest in the column, about five lines, tuned by the layout model so FR-019 holds at 1280 × 720 (FR-018).
