# Feature Specification: Visitor Movement and Target Highlighting

**Feature Branch**: `spec/008-visitor-movement` (this spec; implementation on `feat/008-visitor-movement`, stacked on line R's User Story 9 tip, f9524081, then `feat/008-walking` on its tip: [plan.md](plan.md))

**Created**: 2026-11-07

**Status**: Draft. Specified overnight on 2026-11-07, while the Author was away, from the draft intent beside it. Clarified the same night: five questions, each taken with its recommended option at the Author's word "Keep going!", each provisional and his to overturn (Clarifications). Eight smaller defaults were taken the same way and wait for his yes or no (Open Questions). No needs-clarification marker is left open in the requirements; every provisional answer is named where it lands. Nothing is implemented before the Author accepts the intent and approves this spec and its plan (Assumptions, Deviations).

**Input**: [`intent.md`](intent.md) in this folder, with the Author's words as the main session relayed them on 2026-11-07. Also read: the [constitution](../../.specify/memory/constitution.md) 1.0.1 and `CLAUDE.md`; [spec 004](../004-room-composition/spec.md) and its plan and contracts (room-data-files, room-bundle, plain-model-fit) on `main` (ea9fc7ad); [spec 002](../002-the-room/spec.md) and its contracts room-scene and room-events on `main`; the room's code at line R's User Story 9 tip (f9524081, `feat/004-us9-neon-sign`): `app.ts`, `stage.ts`, `scene.ts`, `objects.ts`, `a11y.ts`, `layout.ts`, `motion.ts`, `flat.ts`, `room.css`, `compose/pick.ts`, `compose/framing.ts`, `compose/project.ts`, `compose/stages.ts`, `scene/bundle3d.ts`, `scene/look.ts`, `scene/levels.ts`, `signals/frame-log.ts`, the scene file, the catalog, the looks, and the UI words; the gateway's room-events route; ADR 0010 and ADR 0036; the [data-flow disclosure](../../docs/data-flow-disclosure.md); and spec 000's contracts/telemetry.md §7.8.

Summary: the room gains a target and a walk. One piece at a time is the target: what the visitor's pointer hovers, what a finger presses, what keyboard focus picks in the "In the room" list, or, while walking, what the visitor's figure walks up to and faces. The target shows a two-tone border until it's clicked, and the click opens what it opens today. A "Walk around" control turns the fixed camera into a third-person follow camera, and the visitor's figure walks the cube's floor, kept off the walls and furniture, by keys, mouse, trackpad, or touch; "Stop walking" puts everything back at the production framing, where spec 004's checks judge the room. Nothing new leaves the device but one usage event, once a visit.

## Clarifications

### Session 2026-11-07, taken while the Author was away, at his word: "Keep going!"

The main session relayed that the Author is away for the night and, asked to start, wrote "Keep going!"; it directed: "Wherever you'd ask, take the recommended answer and record it as his to overturn." So each question below took its recommended option. None is the Author's answer. Each is provisional and his to overturn, and a no changes the requirements it names. The questions, as asked, with their options, are under Open Questions.

- Q1: Does the visitor see the room through their own eyes (first person), or watch their figure walk (third person)? → Taken, not answered: third person (option A). The visitor's figure walks on the cube's floor, and a follow camera looks at it from the open front's side. Reading: the figure is what the twin hands the paper to and what the visitor chose at the door, and ADR 0010's rig will animate it (the Author's "the full rigging"); in a cube 1.22 m deep, a camera at the figure's eyes would stand within about a metre of every wall, and the visitor would never see the avatar they chose. (FR-023 to FR-025, FR-034.) On a no: the figure is hidden while walking, the camera is its eyes, and a centre reticle targets (FR-033 changes).
- Q2: Is walking on by default, or entered by a control? → Taken, not answered: entered by a control (option A), "Walk around", left by "Stop walking" or Escape. Reading: the production framing stays what every visitor sees first and what spec 004's checks judge; on a phone the page keeps scrolling under a finger until the visitor asks to walk; and the walking keys never compete with the text box. (FR-020 to FR-022, FR-031.) On a no: walking starts at the first movement key, drag, or floor tap after the hand-off, the stage takes touch gestures from the start, and FR-020 to FR-022 and FR-031 change.
- Q3: Do the walls and the furniture stop the figure? → Taken, not answered: yes, solid (option A). The figure stays on the floor and out of the walls, the desk, the twin, and every piece within its height, sliding along them, and the camera never stands behind a wall. (FR-024, FR-026, FR-027, FR-032.) On a no (option B, walls only): the figure walks through the furniture, and FR-026's obstacles go.
- Q4: How is a piece targeted? → Taken, not answered: by the inputs the room already has, a hovering pointer, a press, and keyboard focus on the piece's button in the "In the room" list, and, in the walking view, by walking up to a piece and facing it ("reach"); no centre reticle (option A). The highlight lasts while the piece is the target, goes when it's clicked, and comes back only when the piece is targeted again. Reading: with the figure in third person, a centre reticle would sit on the figure itself; walking up to a thing is how a third-person game picks what's at hand; and a press gives touch a highlight with no hover, as spec 002's FR-046 asks ("no cue SHALL depend on hover alone"). (FR-007 to FR-013, FR-033.) On a no (option B, a centre reticle): a mark at the view's centre targets the piece under it while the camera moves, and the follow camera shifts the figure aside to keep the centre clear.
- Q5: What colour is the highlight? → Taken, not answered: a warm yellow band, `#ffd23f`, framed on its outer side by the look's ink, `#1a1a1a`, 3 and 1.5 CSS pixels wide, as look data that lookdev judges (option A). Reading: the yellow gives at least 3:1 against any colour darker than a relative luminance of about 0.19, and the ink against any lighter than about 0.13, so one of the two always does, against every colour of the palette and of any studio texture; no single colour can, and option B, the page's focus blue framed in white, falls under 3:1 on both tones against the cement floor and the figures' grey. (FR-015 to FR-017, FR-057.) On a no: the colours change in each look's `highlight`, a data edit, still held to FR-016's check.

## Source: The Author's Words

Quoted as the main session relayed them, typing included. The reading beside each is this spec's, to correct where it's wrong; it never replaces the words.

- **The request**, 2026-11-07:

  > "The visitor should be able to move around the room, and when targeting on an object, the object gains a highlight border until the user clicks on it. Also finish this out, and see what can be done in parallel"

  Reading: the visitor's figure walks the floor and the view follows it (User Stories 2 and 3); one piece at a time is the target and shows a border (User Story 1); the click opens what a click opens today and the border goes (FR-011, FR-012). "Also finish this out" reads as the whole feature, with its accessibility, 2D room, degraded mode, telemetry, and phone runs, not a prototype (User Stories 4 to 6; SC-013). "See what can be done in parallel" reads as the plan's parallel lanes and the tasks' [P] marks (plan.md §4).
- **The question before it** (the relay gives no date):

  > "Now i want to see the full rigging and game movement that is allowed, when will that be there in the demo?"

  Reading: "game movement" is this spec. "The full rigging" is ADR 0010's rigged avatars, which wait for the Author's acceptance of that ADR, the studio's avatars, and spec 003's avatar loader; this spec doesn't wait for them, and makes the flat cut-out walk through an interface a rigged avatar takes over (FR-034). "When will that be there in the demo?" is answered in order of work, not dates: the highlight first, then walking on the desktop, then on the phone (plan.md §4).
- **Asked to start**, 2026-11-07:

  > "Keep going!"

  Reading: the direction under which the clarifications and defaults below were taken provisionally. It isn't the Author's acceptance of the intent, nor his approval of this spec (Assumptions, Deviations).
- **Earlier words this spec relies on**, as spec 004 records them: "Inked cel was the best look so far" (2026-10-23), "Those are fine." (2026-10-30, the answer to the look checks put to him, among them the session's note that the chalk writing is seen at a steep angle), and "Move further left" (2026-10-30, the visitor's place, FR-080). Reading: the highlight is drawn in every look, inked cel's included (FR-017); walking lets a visitor see the side-wall boards nearly face-on, which the production framing can't (Assumptions, "What walking adds"); and the figure's place in the scene is where walking starts and ends (FR-022).

## User Scenarios & Testing *(mandatory)*

The users are visitors on desktop and phone, in 3D and in the 2D room, by pointer, touch, keyboard, and screen reader; and the Author, who judges the look and the phone. User Story 6, the degraded mode, is P1 and ships with User Story 1, as Principle I asks ("Every user-facing capability MUST define its degraded mode before its happy path"); it is listed last only because it adds no new input or view, only the proof that none of this depends on anything that can be off. User Story 4's accessibility applies to every story as it ships; it is also its own test pass.

### User Story 1 - The Target Shows a Highlight Border, on Today's Camera (Priority: P1)

As a visitor, I want the piece I'm about to open to show a border, so I can see what a click will do before I click.

**Why this priority**: The Author's "when targeting on an object, the object gains a highlight border until the user clicks on it". It needs no movement, so it lands first, on the production framing every visitor sees.

**Independent Test**: In 3D at the production framing, hover each selectable with a mouse, press each with a finger, and Tab through the "In the room" list: each time one piece shows the border; click or press Enter: its topic or the resume opens as today and the border goes; nothing is sent but today's `object_selected`.

**Acceptance Scenarios**:

1. **Given** the room after the hand-off and its offer, **When** a mouse hovers the bicycle's pick area, **Then** the bicycle shows the highlight border and no other piece does.
2. **Given** the bicycle is highlighted, **When** the mouse moves onto the floor, where no pick area is, **Then** the border goes.
3. **Given** the bicycle is highlighted, **When** the visitor clicks it, **Then** the room sends one `object_selected` with the ID `bicycle`, opens its topic as today, and the border goes in the same moment; **When** the mouse rests where it is, **Then** the border stays off until the pointer leaves the bicycle and returns.
4. **Given** a phone, **When** a finger presses the laptop and lifts within the tap slop, **Then** the laptop shows the border while the finger is down, and the lift opens "Laptop and screen" and clears it; **When** the finger slides away beyond the slop instead, **Then** the border goes and nothing opens.
5. **Given** keyboard focus moves to the "Chalkboard" button in the "In the room" list, **When** it lands, **Then** the chalkboard shows the border in the scene, even at a stage where spec 004's FR-064 carve-out leaves the chalkboard to the list; **When** focus moves on, **Then** the next button's piece shows it instead.
6. **Given** a stage where the chalkboard is list-only, **When** a mouse hovers its picture, **Then** nothing is highlighted, as a click there selects nothing (spec 004's Reading R3).
7. **Given** the hand-off is playing or its offer shows, **When** the pointer moves over a piece, **Then** nothing is highlighted.
8. **Given** quality level 3, where the look draws no ink lines, or the painted or flat look, **When** a piece is the target, **Then** its border is drawn as at quality 0 in inked cel.

---

### User Story 2 - Walking Around the Room on the Desktop (Priority: P2)

As a visitor at a desktop, I want to step into the room and walk my figure around it, as in a game, to look at the pieces from where I choose.

**Why this priority**: The Author's "The visitor should be able to move around the room" and his "game movement". It builds on User Story 1's target, which walking extends with reach.

**Independent Test**: Press "Walk around"; walk with W, A, S, D and the arrows, turn with Q and E, tilt with R and F, zoom with + and −, and with the mouse drag, wheel, and click on the floor; walk into the desk, the twin, and the walls; walk up to the snowboard and press Enter; press Escape: the camera and the figure are back at the production framing, and focus is on "Walk around".

**Acceptance Scenarios**:

1. **Given** the room in 3D after the hand-off's offer, **When** the visitor presses "Walk around", **Then** the follow camera starts from the production framing and settles behind and above the figure, the walking view has keyboard focus, the control reads "Stop walking", and the status region says the walking view is on.
2. **Given** the walking view has focus, **When** W is held, **Then** the figure walks away from the camera at 1.0 m/s from the next frame, facing where it walks, and stops on the first frame after W is released.
3. **Given** the figure walks into the desk, the twin, or a wall at an angle, **When** the move would overlap it, **Then** the figure slides along it and never passes through.
4. **Given** the walking view, **When** the visitor drags on the stage, turns with Q and E, or zooms with the wheel, **Then** the camera turns about the figure no further than 60° either side of straight into the room, tilts no further than 35° down, zooms no nearer than 1.2 m and no farther than the production framing's distance, never stands behind a wall, and the figure doesn't move.
5. **Given** the walking view, **When** the visitor clicks the floor, **Then** the figure walks to that point, sliding along anything in the way, and stops there, or after 0.5 s without progress.
6. **Given** the figure walks up to the snowboard and faces it, **When** it comes within reach, **Then** the snowboard shows the border and the status region says "Snowboard" with what Enter does; **When** Enter is pressed, **Then** the snowboard's topic opens as a click would, and the border goes.
7. **Given** the walking view, **When** the visitor presses "Stop walking", or Escape while the walking view has focus, **Then** the camera returns to the production framing within 500 ms, the figure stands at its place in the scene with the resume's paper in its hand, and focus is on "Walk around".
8. **Given** the walking view is entered for the first time in a visit, **When** it starts, **Then** one `walk_started` usage event is sent; **When** it's entered again in that visit, **Then** none is.

---

### User Story 3 - Walking on the Phone by Touch (Priority: P3)

As a visitor on a phone, I want to walk my figure with my finger without losing the page's scrolling.

**Why this priority**: The intent's phones, and spec 002's answer 6 ("I don't see how the room should interact differently on a landscape phone?"): the same room on every screen, with only input and framing changing. It comes after the desktop because it reuses its movement, camera, and reach.

**Independent Test**: On a touch screen, scroll the page with a drag that starts on the stage; press "Walk around"; tap the floor, drag to turn, pinch to zoom, tap a piece; press "Stop walking"; scroll the page from the stage again.

**Acceptance Scenarios**:

1. **Given** the walking view is off, **When** a finger drags on the stage, **Then** the page scrolls as today, and a tap selects as today.
2. **Given** the walking view is on, **When** a finger taps the floor, **Then** the figure walks there; **When** one finger drags, **Then** the camera turns and tilts within its limits; **When** two fingers pinch, **Then** it zooms within its limits; and the page neither scrolls nor zooms.
3. **Given** the walking view is on, **When** a finger taps a piece's pick area, **Then** that piece opens as a tap opens it today, highlighted while the finger is down.
4. **Given** the figure walks up to a piece and faces it, **When** it's within reach, **Then** the piece shows the border, and a tap on it opens it.
5. **Given** the smallest supported phone screen, 320 × 568, **When** the room shows, **Then** the walking control is at least 44 × 44 CSS pixels, the text box and the talk button are on screen without scrolling, and the toolbar has no new row.

---

### User Story 4 - Every Visitor Can Target, Walk, or Choose Without Walking (Priority: P2)

As a visitor using a keyboard, a screen reader, or reduced motion, I want the highlight and the walk to work for me, and the "In the room" list to stay the way to choose any piece without moving.

**Why this priority**: Specs 002 and 004 hold the room to WCAG 2.2 AA and to "Pause the room" and reduced motion (spec 004's FR-059, FR-060, FR-065). A new view must not be the only way to anything.

**Independent Test**: A keyboard-only run: Tab through the list (each piece highlighted), enter the walking view, walk, turn, tilt, zoom, open a piece with Enter, Tab out (no trap), and leave with Escape. A screen-reader run: hear the walking control's name, the walking view's name and instructions, and each piece reach finds; choose every piece from the list without walking. With reduced motion, and with the room paused: no glide, inertia, or bob, and the walk still works. An automated check: 0 violations.

**Acceptance Scenarios**:

1. **Given** a keyboard only, **When** the visitor Tabs through the "In the room" list, **Then** each button's piece is highlighted in the scene while it has focus, and Enter or Space opens it and clears the border.
2. **Given** a screen reader, **When** the visitor never enters the walking view, **Then** every selectable is still reachable and operable from the list, with its name and topic.
3. **Given** the walking view has focus, **When** the visitor presses Tab, **Then** focus moves on as anywhere else, and the walking keys stop acting until the walking view has focus again.
4. **Given** the walking view has focus, **When** reach finds a new piece, **Then** the status region says its name and that Enter opens it, once; **When** a mouse hovers a piece, **Then** nothing is announced.
5. **Given** the device asks for reduced motion, or the room is paused, **When** the visitor walks, turns, or leaves the walking view, **Then** the camera and the figure move only as the input moves them, the return to the production framing is immediate, the figure has no step bob, and the border never animates.
6. **Given** the walking control and the walking view on the page, **When** the automated check runs, in each state, **Then** it reports 0 WCAG 2.2 AA violations.

---

### User Story 5 - The 2D Room Highlights, and Doesn't Walk (Priority: P3)

As a visitor on a device without 3D, I want the same highlight on the 2D drawing, and nothing that pretends to walk.

**Why this priority**: Spec 004's FR-058: the 2D room shows the same pieces, states, and words as the 3D room. Walking is a 3D view.

**Independent Test**: In the 2D room, hover, press, and Tab through the list: the target's dashed cue becomes the two-tone border; there is no walking control. In 3D, start walking and press "2D view": the walk ends and the 2D room shows, with the conversation and the resume as they were.

**Acceptance Scenarios**:

1. **Given** the 2D room, **When** a mouse hovers a selectable's hit area, a finger presses it, or keyboard focus lands on its list button, **Then** its cue is drawn as the highlight border, in the look's two tones and widths, and no other cue is.
2. **Given** the 2D room at a stage where a side-wall selectable is list-only, **When** its list button has focus, **Then** the border is drawn around its hit rectangles, though its cue is hidden there.
3. **Given** the 2D room, **When** it shows, **Then** there is no walking control.
4. **Given** the walking view is on in 3D, **When** the room falls to 2D (the visitor's "2D view", the frame floor, or a lost context), **Then** the walking view ends at once, the target clears, and the conversation, the resume, and the visit's state are kept.

---

### User Story 6 - Nothing About Moving or Targeting Ever Degrades (Priority: P1)

As a visitor, I want to move and see what I'm about to open whatever state the Author's machine, the budget, or the network is in.

**Why this priority**: Principle I, quoted above. Every input and view here runs on the device, so the degraded mode is that nothing changes; this story proves it, and covers the failures that are the walking view's own.

**Independent Test**: With the live source off, the tier unknown, the local tier off, the budget spent, and the kill switch `degraded` (stubbed), target and walk: all of it works, only what a selection opens degrades, and the network log shows no request beyond today's. Inject an error into the walking step: the room returns to the production framing and goes on.

**Acceptance Scenarios**:

1. **Given** the kill switch is `degraded`, **When** the visitor targets the bicycle and clicks it, **Then** the border shows and clears as always, and the conversation shows its fixed message as today.
2. **Given** any of the degraded states, **When** the visitor walks, **Then** the walking view behaves exactly as in the happy path, and no request is made for it.
3. **Given** the walking view is on, **When** its movement step throws, **Then** the walking view ends, the camera is at the production framing, the figure at its place, and the room keeps drawing.
4. **Given** the 3D context is lost while walking, **When** it's restored, **Then** the walking view goes on from where it was; **When** it isn't restored in time, **Then** the room falls to 2D as today, and the walking view ends.
5. **Given** the 2D drawing can't be drawn, **When** the room shows `flat-failed`'s line, **Then** no highlight is drawn, and the "In the room" list still selects every piece.

---

### Edge Cases

- **Two inputs at once:** a mouse rests over the laptop while keyboard focus moves to the "Snowboard" button. The latest input wins: the snowboard is the target. When the mouse moves again over the laptop, the laptop is. A pointer leaving the stage doesn't clear a target that keyboard focus set (FR-007).
- **A click on a piece that isn't the target:** on touch, or after the pointer jumped there; it selects as today, since the press itself targets it first (FR-008, FR-011).
- **A selection that can't run:** during the hand-off or its offer the room takes no input, so there is no target to clear (FR-010).
- **The target's model arrives, or fails, while highlighted:** the border follows what the member draws now, the model or its stand-in (FR-019).
- **The figure is blocked every way:** it can't be at its start, which the compositor checks (FR-058); wherever every move is blocked, the figure stays where it is, and "Stop walking" always works.
- **A floor tap under the desk:** the figure walks as far as the desk lets it and stops after 0.5 s without progress (FR-032).
- **The stage is resized while walking:** the camera's farthest distance follows the new aspect's production framing, and the camera moves in if it was farther (FR-023).
- **Reach and hover disagree:** each sets the target when it changes; the latest wins (FR-007).
- **A side-wall board in the walking view:** reach can target it, and a click picks it wherever its core fits at the follow camera, though it is list-only at the production framing on that stage (FR-033, FR-035).
- **"Pause the room" while walking:** the visitor's own movement goes on; glides and the step bob stop (FR-044).
- **The page is hidden, or the window loses focus, while walking:** every held key and drag is dropped, so nothing moves; on return, the walking view is where it was, with nothing held (FR-029).
- **The resume opens while walking:** the walking view stays on behind it; focus is in the resume, so the walking keys don't act until the walking view has focus again.
- **A reload:** a new visit at the choice; the walking view is off, and `walk_started` may be sent once more in the new visit (FR-051).

## Requirements *(mandatory)*

### Functional Requirements

Terms used below, beside spec 004's (a selectable, a pick area and its exclusive core, the production framing, the reference phone and desktop, the supported stages, a side-wall selectable, the "In the room" list, "Around the room", a drafts build). **Target**: the one selectable the latest targeting input names, or none. **Targeting input**: one of FR-008's four. **Highlight**: the border the target shows (FR-015). **The walking view**: the 3D room's second view, entered by the walking control, in which the visitor's figure walks and the follow camera follows it. **The walking control**: the button that enters and leaves it. **The follow camera**: the walking view's camera. **The tap slop**: spec 002's 10 CSS pixels (`objects.ts`'s `TAP_SLOP_PX`), within which a press that ends is a tap or a click. **Obstacle**: FR-026's. **Reach**: FR-033's. **The figure's pose**: its place on the floor, its heading, its speed, and whether it walks (FR-034). **The walking data**: the scene file's `walking` block (FR-056). **The highlight data**: each look's `highlight` (FR-057). **The motion store animates**: spec 004's motion store, true only while the room isn't paused, the device doesn't ask for reduced motion, and the page is visible.

**Degraded mode** (defined before the happy paths, Principle I)

- **FR-001**: Moving, targeting, and highlighting SHALL run on the visitor's device alone: THE ROOM SHALL make no request, call no model, and store nothing for them, apart from FR-051's one usage event.
- **FR-002**: WHILE the local tier is off, the budget is spent, the kill switch is `degraded` or unknown, the live source is off, or the tier is unknown, THE ROOM SHALL offer the walking view, the targeting, and the highlight exactly as at any other time, and only what a selection opens SHALL degrade, as it does today (spec 002 FR-039; spec 004 FR-037, FR-062).
- **FR-003**: IF the device can't render 3D, or the room falls to 2D, THEN THE ROOM SHALL offer no walking view, SHALL end one that is on at once, keeping the conversation, the resume, and the visit's state, and SHALL highlight targets in the 2D drawing (FR-046).
- **FR-004**: IF the 2D drawing can't be drawn (spec 004 FR-081), THEN THE ROOM SHALL draw no highlight, and the "In the room" list SHALL still select every selectable as today.
- **FR-005**: IF a step of the walking view fails (an error in its input, its movement, its reach, or its camera), THEN THE ROOM SHALL end the walking view, put the camera at the production framing and the figure at its place, and go on drawing; it SHALL never leave a blank or frozen scene (spec 004 FR-062).
- **FR-006**: WHILE the 3D context is lost, THE ROOM SHALL draw no highlight and move nothing. WHEN the context is restored, THE WALKING VIEW SHALL go on from where it was. IF it isn't restored, THEN THE ROOM SHALL fall to 2D as today (spec 002's contracts/room-scene.md §4), and FR-003 applies.

**The target** (Clarifications, Q4)

- **FR-007**: THE ROOM SHALL have at most one target at a time: the selectable the most recent targeting input names. AN INPUT THAT NAMES NO SELECTABLE SHALL clear the target only WHERE the target came from that same input.
- **FR-008**: THE TARGETING INPUTS SHALL be:
  - (a) a hovering pointer over the stage (a mouse, a trackpad, or a pen that hovers), naming the selectable a pick at its point gives, each time it moves, and nothing when it leaves the stage;
  - (b) a press on the stage (a finger, a pen's contact, or a mouse's main button), naming the selectable a pick at its start gives, until it ends, or nothing once it moves beyond the tap slop;
  - (c) keyboard focus on a button of the "In the room" list, naming that button's selectable, and nothing when focus leaves the list;
  - (d) in the walking view, reach (FR-033), each time it changes.
- **FR-009**: Inputs (a) and (b) SHALL pick with the same function and the same pick areas as a selection does (spec 004's `compose/pick.ts`, and FR-035 in the walking view): a point that would select nothing SHALL target nothing, and a side-wall selectable that spec 004's FR-064 leaves to the list at the stage SHALL NOT be targeted by a pointer or a press there. Input (c) SHALL target any selectable, held or not.
- **FR-010**: WHILE the hand-off plays or its offer shows, THE ROOM SHALL have no target, and the walking control SHALL be inert, as the room's other controls are.
- **FR-011**: WHEN the visitor selects a selectable (a click or a tap within the tap slop, Enter or Space on its list button, or Enter in the walking view on the target), THE ROOM SHALL run today's selection unchanged (spec 004 FR-071 and FR-036 to FR-038: one `object_selected` event with its ID, then its topic or the resume) and SHALL clear the highlight in the same call.
- **FR-012**: WHEN a selectable has been selected, THE ROOM SHALL NOT make it the target again until a targeting input has named something else or nothing: the pointer leaves its pick area, focus leaves its button, or reach loses it.
- **FR-013**: A hover alone SHALL never select. A target or a highlight SHALL send nothing: no event, request, or log line, outside a drafts build's frame log (FR-054).

**The highlight**

- **FR-014**: WHILE a selectable is the target, ITS MEMBERS SHALL show the highlight, and no other piece SHALL. A member's highlight SHALL cover what its placement draws, its studio model or its stand-in, and none of the placements mounted on it that aren't members (the neon sign on the monitor, the charger's plug on the laptop).
- **FR-015**: THE HIGHLIGHT SHALL be a border outside the target's outline on screen (in 3D, around the visible silhouettes of its members; in 2D, around its hit rectangles): a band of the highlight colour, at least 2 CSS pixels wide, framed on its outer side by a dark edge at least 1 CSS pixel wide. ITS COLOURS AND WIDTHS SHALL be look data (FR-057), by default Q5's: a band of `#ffd23f`, 3 CSS pixels, and an edge of the look's ink, `#1a1a1a`, 1.5 CSS pixels (Clarifications, Q5).
- **FR-016**: THE HIGHLIGHT'S TWO TONES SHALL give, against every colour of the look's palette, a contrast ratio of at least 3:1 for at least one of the two (WCAG 2.2's 1.4.11), so the border reads on the room's light surfaces and on its dark ones. THE COMPOSITOR SHALL refuse a look whose highlight doesn't (FR-058).
- **FR-017**: THE HIGHLIGHT SHALL be drawn in every look (inked cel, painted, and flat) and at every quality level, including the levels and looks that draw no ink lines (spec 004's R-35 turns the lines off at quality 2 and 3).
- **FR-018**: THE HIGHLIGHT SHALL be still, in every mode: no pulse, fade, or motion. IT SHALL appear on the first frame drawn after its target is set, in 3D, or at once in 2D, and go in the same way when the target clears.
- **FR-019**: THE HIGHLIGHT SHALL change nothing else: no piece moves, changes colour, or changes its state (a switch's case, a face's words), and a stand-in's label stays as it is. WHEN a member's studio model swaps in, or falls back to its stand-in, while it is highlighted, THE HIGHLIGHT SHALL follow what the member draws now.

**The walking view**

- **FR-020**: THE ROOM SHALL offer the walking control in 3D only, from the end of the hand-off's offer. ITS WORDS SHALL be the UI word `walk.enter`, "Walk around", and, in the walking view, `walk.leave`, "Stop walking". WHEN it is pressed, THE ROOM SHALL enter or leave the walking view (Clarifications, Q2).
- **FR-021**: THE WALKING CONTROL SHALL sit in the stage, not in the toolbar, so that spec 004's FR-065 holds on a 320 × 568 screen with no new toolbar row; it SHALL be at least 44 × 44 CSS pixels at every supported stage; and at the production framing it SHALL cover no selectable's exclusive core at any supported stage, which the compositor checks (FR-058).
- **FR-022**: WHEN the visitor enters the walking view, THE ROOM SHALL start the follow camera from the production framing and give the walking view keyboard focus (FR-042). WHEN the visitor leaves it, by the walking control or by Escape while the walking view has focus, THE ROOM SHALL put the camera at the production framing and the figure at its place in the scene (spec 004 FR-080), with what it holds, and give focus to the walking control. THE CAMERA'S MOVE into or out of the walking view SHALL take at most 500 ms, and be immediate WHILE the motion store doesn't animate (FR-044).
- **FR-023**: THE FOLLOW CAMERA SHALL look at the visitor's figure, at the walking data's focus height above its feet (1.1 m by default), from the open front's side (third person; Clarifications, Q1), and SHALL follow the figure as it walks. THE VISITOR SHALL turn it about the figure up to the walking data's yaw limit either side of straight into the room (60° by default), tilt it from level down to the pitch limit (35° by default), and zoom it between the minimum distance (1.2 m by default) and the production framing camera's distance from the figure at the stage's aspect, so the walking view never shows the room smaller than the production framing does. WHEN the stage's aspect changes, THE FOLLOW CAMERA SHALL keep within the new farthest distance.
- **FR-024**: THE FOLLOW CAMERA SHALL stay in front of the cube's open face, within the side walls' width, and above the floor, so that no wall ever stands between it and the room. WHERE a turn or a zoom would take it outside that region, IT SHALL turn or zoom only as far as the region allows at its distance. THE REGION SHALL come from the room shell's bounds in the composed scene (Clarifications, Q3).
- **FR-025**: THE FIGURE SHALL move by movement input alone, never by the camera's turns, tilts, or zooms. MOVEMENT SHALL be relative to the camera's view, along the floor: forward is away from the camera. WHILE the figure walks, IT SHALL face the way it walks; at entry it faces into the room.
- **FR-026**: THE FIGURE'S FOOTPRINT, a circle about its feet with the walking data's radius (0.12 m by default), SHALL stay on the floor, at least its radius from each wall, with its centre no further forward than the floor's open edge less the figure's half-depth from its catalog bounds, so it can stand where the scene places it now; and SHALL never overlap an obstacle: the floor-plane extent of the frame box of each placement that reaches into the figure's height above the floor, other than the shell and the visitor's own figure (the desk, the twin's figure, and the pieces on the floor and the walls are among them). WHERE a move would break this, THE FIGURE SHALL slide along what blocks it, and SHALL never pass through it (Clarifications, Q3).
- **FR-027**: THE OBSTACLES AND THE WALKABLE FLOOR SHALL come from the composed scene's frame boxes, so moving, adding, or removing a piece in the scene file moves, adds, or removes its obstacle with no source change (spec 004 FR-006).
- **FR-028**: THE FIGURE SHALL walk at the walking data's speed, 1.0 m/s by default. THE KEYS SHALL turn the camera at its turn rate, 90° a second by default, and tilt it at its tilt rate, 45° a second by default. THE FIGURE SHALL start moving on the first frame drawn after a movement input begins, and stop on the first frame after it ends.
- **FR-029**: WHILE the walking view has keyboard focus, THE KEYS SHALL act as follows: W or ↑ walks forward, S or ↓ back, A or ← left, and D or → right; Q and E turn the camera left and right; R and F tilt it up and down; + and − zoom it in and out (= counting as +); Enter selects the target; and Escape leaves the walking view. THESE KEYS SHALL act only while the walking view has focus (WCAG 2.2's 2.1.4), the arrow keys SHALL NOT scroll the page then, and Tab SHALL move focus on as anywhere else (2.1.2). WHEN the walking view or the window loses focus, or the page is hidden, EVERY HELD KEY AND DRAG SHALL be dropped, so nothing moves until a new input begins.
- **FR-030**: IN THE WALKING VIEW, with a mouse or a trackpad: a drag beyond the tap slop SHALL turn and tilt the camera; the wheel, or a trackpad's pinch, over the stage SHALL zoom it; and a click within the slop SHALL select the selectable a pick at its point gives (FR-035), or, where none is, walk the figure toward the floor point under it (FR-032).
- **FR-031**: IN THE WALKING VIEW, by touch: a one-finger drag beyond the tap slop SHALL turn and tilt the camera, a two-finger pinch SHALL zoom it, and a tap SHALL select or walk as FR-030's click does. WHILE the walking view is on, a gesture that starts on the stage SHALL neither scroll nor zoom the page. WHILE it is off, gestures on the stage SHALL behave as today: a tap selects, and a drag scrolls the page.
- **FR-032**: WHEN the visitor clicks or taps a point of the floor that no pick area holds, THE FIGURE SHALL walk toward it in a straight line at its speed, sliding along obstacles, and SHALL stop when it arrives, when it has made no progress for 0.5 s, or when another movement input begins. A click or a tap off the floor (a wall, the backdrop) SHALL walk nothing.
- **FR-033**: IN THE WALKING VIEW, REACH SHALL name the selectable one of whose members lies within the walking data's reach distance of the figure's footprint (0.8 m by default) and within its facing cone (60° either side of the figure's heading by default), measured on the floor's plane, the nearest such, ties going to scene order; or nothing. REACH SHALL be computed at entry and again only when the figure moves or turns, and SHALL cover a side-wall selectable that spec 004's FR-064 leaves to the list at the production framing (Clarifications, Q4).
- **FR-034**: THE ROOM SHALL move the visitor's figure through one interface that takes the figure's pose: its place on the floor, its heading, its speed, and whether it walks. THE FLAT CUT-OUT SHALL show the pose by standing at that place, turned to face the camera and mirrored toward its heading, with a step bob of at most 2 cm while it walks, and none WHILE the motion store doesn't animate. WHEN a rigged avatar (ADR 0010) takes the cut-out's place, IT SHALL take the same pose, turning to its heading and playing walk and idle clips, with no change to movement, collisions, reach, targeting, or the camera. WHAT THE FIGURE HOLDS (the resume's paper, after the hand-off) SHALL move with it.
- **FR-035**: WHILE the walking view is on, a pointer's targeting and selection SHALL pick from the pick areas at the follow camera (spec 004's `pick.ts`, the boxes projected at that camera), recomputed when the camera has moved since the last pick and at most once a frame, with FR-064's carve-out applied at that camera: a side-wall selectable has a pick area wherever its core fits there, and none where it doesn't.

**The production framing's guarantees**

- **FR-036**: THE PRODUCTION FRAMING SHALL stay the room's default view and the one spec 004's checks judge: the room opens there, the hand-off plays there, the 2D drawing is projected as it is today, and the walking view starts and ends there. THE COMPOSITOR'S legibility check (spec 004 FR-052, RG7) and pick-area check (FR-064, RG6) SHALL run as they do now, at the production framing, with the walking control's box added to the pick-area check (FR-021).
- **FR-037**: WHILE the walking view is on, THE ROOM SHALL make no promise of legibility beyond the production framing's: every drawn word stays in "Around the room" (spec 004 FR-034, FR-063), and the camera never goes farther than the production framing's distance (FR-023).
- **FR-038**: THE "IN THE ROOM" LIST SHALL reach every selectable in every view, the walking view included. WHERE a piece in the walking view is smaller on screen than 44 × 44 CSS pixels, THE LIST'S BUTTON SHALL be its equivalent control, as WCAG 2.2's 2.5.8 allows ("Equivalent"), so spec 002's FR-046 and spec 004's FR-064 keep their 44-pixel guarantee at the production framing.

**Accessibility and reduced motion**

- **FR-039**: THE "IN THE ROOM" LIST SHALL stay the complete way to choose every selectable without moving, by keyboard, pointer, touch, and screen reader, in 3D, in 2D, and in the walking view (spec 004 FR-063, FR-065).
- **FR-040**: WHEN a button of the list receives keyboard focus, ITS SELECTABLE SHALL be the target (FR-008 (c)): its piece shows the highlight, in 3D and in 2D, until focus leaves the button or the button is pressed (FR-011).
- **FR-041**: THE WALKING CONTROL SHALL be a button named by its words, reachable by Tab after the toolbar and before the list, with the room's visible focus ring (a 2-pixel outline at 3:1 or better, spec 002's contracts/room-scene.md §5); its words SHALL say what pressing it does.
- **FR-042**: WHILE the walking view is on, A FOCUSABLE ELEMENT that isn't hidden from assistive technology SHALL take its keys, with an accessible name (the UI word `walk.region`) and instructions a screen reader reads (`walk.help`). WHILE it is off, that element SHALL NOT be focusable. The canvas stays hidden from assistive technology (spec 002's contracts/room-scene.md §5).
- **FR-043**: WHEN the visitor enters or leaves the walking view, THE ROOM'S POLITE STATUS REGION SHALL say so once (`walk.entered`, `walk.left`). WHILE the walking view has keyboard focus, WHEN reach names a new selectable, THE REGION SHALL say its name and that Enter opens it (`walk.target`), once per change. A hover or a press SHALL announce nothing.
- **FR-044**: WHILE the motion store doesn't animate (reduced motion, "Pause the room", or a hidden page; spec 004 FR-059, FR-060), THE WALKING VIEW SHALL move the camera and the figure only as the visitor's input moves them: no easing, inertia, glide, or step bob, and the camera's move into or out of the walking view is immediate. "PAUSE THE ROOM" SHALL NOT stop the visitor's own movement.
- **FR-045**: COLOUR SHALL never carry meaning alone (the highlight is a border, a change of shape as well as colour), and THE ROOM SHALL meet WCAG 2.2 level AA with the walking control and the walking view present, on and off (spec 004 FR-065).

**The 2D room**

- **FR-046**: IN THE 2D ROOM, targeting inputs (a) to (c) SHALL work, and THE TARGET'S HIGHLIGHT SHALL be drawn around its hit rectangles in the highlight's two tones and widths, in place of its dashed cue, and around a side-wall selectable's hit rectangles where list focus targets it at a stage that hides its cue. THE 2D DRAWING'S ALLOWLIST (spec 004's `flat.ts`) SHALL gain only what the highlight needs.
- **FR-047**: THE 2D ROOM SHALL show no walking control and offer no walking view.

**Performance**

- **FR-048**: ON THE REFERENCE PHONE, THE WALKING VIEW SHALL hold spec 002's FR-048: a median of at least 30 frames a second, with at least 95% of frames within 33 ms, over the lookdev page's 2-minute scripted walk (FR-050), the quality controller stepping down as it does today where it must.
- **FR-049**: THE HIGHLIGHT SHALL draw nothing while there is no target, and at most two extra passes over the target's members' meshes while there is. THE WALKING VIEW SHALL recompute pick areas, reach, and collisions only when the camera or the figure has moved since the last frame.
- **FR-050**: THE LOOKDEV PAGE, in drafts builds only (spec 004 FR-066), SHALL offer the walking view; a scripted walk, in which the figure walks a fixed loop of the walkable floor for 2 minutes with the camera following and a target set and cleared on the way; and a highlight on any selectable it names, reporting the frame figures it reports for the static view (spec 004 FR-067).

**Telemetry**

- **FR-051**: WHEN the visitor first enters the walking view in a visit, THE ROOM SHALL send one usage event of the new kind `walk_started`, with no identifier and nothing else, on today's beacon (spec 002 FR-054 and its contracts/room-events.md §1, as Amendments M2 and M3 extend them). LATER ENTRIES in the same visit SHALL send none.
- **FR-052**: THE ROOM SHALL send no event for a target, a highlight, a step, the figure's place, or the camera, and a selection SHALL send today's `object_selected` with no new field (spec 004 FR-071).
- **FR-053**: THE DASHBOARD'S "Room" row SHALL gain the panel "Visits that walked": `walk_started` over `resume_opened` plus `resume_kept`, read as the 2D share is read (spec 000's contracts/telemetry.md §7.8, as Amendment M1 extends it).
- **FR-054**: IN A DRAFTS BUILD, THE FRAME LOG (spec 004's R-70) SHALL record the walking view's entries and exits and each change of target with the input that made it, in page memory only. A release build SHALL keep no log.

**Data flow**

- **FR-055**: THE DATA-FLOW DISCLOSURE'S ROW V4 SHALL name `walk_started`'s trigger, the visitor first entering the walking view in a visit, in the change that sends it (Amendment M4). IF the room would send it without that row, THEN it SHALL NOT be deployed. NOTHING ELSE this spec adds SHALL leave the visitor's device.

**As data** (spec 004's FR-001 and FR-006; the Author's "features should be modeled with that abstract perspective rather than one-off hard-coded")

- **FR-056**: THE WALKING VIEW'S PARAMETERS SHALL be data, in the scene file's `walking` block: the speed, the turn and tilt rates, the figure's radius, the reach and its cone, the camera's yaw and pitch limits, its minimum distance, and its focus height, each with this spec's default and a range the compositor checks. Changing one SHALL be a data edit.
- **FR-057**: THE HIGHLIGHT'S COLOURS AND WIDTHS SHALL be data, in each look's `highlight`, with Q5's defaults. Changing them SHALL be a data edit.
- **FR-058**: THE COMPOSITOR SHALL refuse, naming the rule, file, and path (spec 004 FR-009): a scene whose visitor figure stands off the walkable floor (FR-026), so the walking view always starts free; a `walking` block outside its ranges; a look whose highlight fails FR-016; and, at any supported stage, the walking control's box over the exclusive core of a selectable at the production framing, except a side-wall selectable's, which the carve-out then leaves to the list at that stage, as it does any core that can't fit.
- **FR-059**: THE UI WORDS this spec adds (`walk.enter`, `walk.leave`, `walk.region`, `walk.help`, `walk.entered`, `walk.left`, and `walk.target`, whose one slot is `{name}`) SHALL join spec 004's closed list (its contracts/room-data-files.md §9) and pass its checks. They state nothing about the Author.

### Key Entities

- **Target**: a selectable's ID or none, with the input that set it, and the ID last selected, which can't be the target again until an input names something else (FR-007 to FR-012).
- **Highlight data**: per look, the band's colour and width and the edge's colour and width, colours as palette names or `#rrggbb` (FR-015, FR-057).
- **Walking data**: per scene, FR-056's parameters with their defaults.
- **The figure's pose**: the figure's place on the floor, its heading, its speed, and whether it walks: what movement gives, and what a figure driver, the cut-out's now and a rigged avatar's later, shows (FR-034).
- **The walkable floor and its obstacles**: the floor's rectangle shrunk by the figure's radius at the walls, with its open edge, less each obstacle's floor-plane extent grown by the radius, all from the composed scene (FR-026, FR-027).
- **The follow camera's state**: its yaw, pitch, and distance about the figure, within FR-023's limits and FR-024's region.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Over the targeting tests (every sequence of hover, press, list focus, reach, and selection the tests build, by table), at most one selectable is highlighted at any time, the one the latest input names, in 100% of steps; a selection clears the highlight in the same call in 100% of cases, and the selected piece isn't highlighted again until an input names something else, in 100% of cases; and the tests count 0 requests, 0 storage writes, and 0 model calls.
- **SC-002**: Every look's highlight passes FR-016 against every colour of its palette (100%, the compositor's check); the highlight's passes are drawn at all four quality levels and in all three looks in the 3D stage's tests; and the Author judges the border at lookdev, on both reference stages, against the room's light and dark surfaces, in each look, with the studio's pieces in place.
- **SC-003**: Over seeded random walks of 10,000 steps each on the default scene and on three data copies with the desk, the twin, and the snowboard moved, the figure's footprint leaves the walkable floor or overlaps an obstacle in 0 steps; every blocked diagonal move slides; and a walk to an unreachable point stops within 0.5 s of its last progress, in 100% of cases.
- **SC-004**: Over 10,000 seeded camera requests (yaw, pitch, and distance, at random figure places and stage aspects), 100% of the follow camera's positions are in front of the open face, within the side walls' width, and above the floor, within the yaw and pitch limits, and no farther from the figure than the production framing's camera at that aspect.
- **SC-005**: Leaving the walking view puts the camera at the production framing within 1e-9 and the figure at its scene place, with the paper in its hand, in 100% of tests; the move takes at most 500 ms, and 0 ms while the motion store doesn't animate; and focus is on the walking control.
- **SC-006**: Each data-only change of the proof set (the walking speed, a camera limit, the reach, a highlight colour, and the desk moved) passes `make check` with 0 source files changed, and after the desk's move the walkable floor and the obstacles follow it in 100% of the movement tests.
- **SC-007**: The compositor's legibility (RG7) and pick-area (RG6) results for the default scene, at the production framing, are the same before and after this feature, apart from the walking control's box, which covers no exclusive core at any supported stage.
- **SC-008**: A keyboard-only tester and a screen-reader tester each target every piece from the list, enter, walk, turn, tilt, zoom, open a piece with Enter, Tab out, and leave the walking view unaided; each chooses every piece from the list without walking; and the automated check reports 0 WCAG 2.2 AA violations with the walking view on and off.
- **SC-009**: In the jsdom tests' synthetic pointer, touch, wheel, and key events, each input of FR-029 to FR-032 does what its requirement says in 100% of cases, and outside the walking view a tap on the stage selects and a drag on it is left to the page's scrolling, as before, in 100% of cases.
- **SC-010**: With reduced motion, with the room paused, and with the page hidden, the walking view shows 0 frames of easing, inertia, glide, or step bob, the visitor's input still moves the figure, and the highlight shows 0 frames of animation, in 100% of tests.
- **SC-011**: In the 2D room, 100% of hover, press, and list-focus targets draw the border and only theirs; 0 walking controls are shown; and every fall to 2D during a walk ends the walk with the conversation, the resume, and the visit's state kept, in 100% of the fault-injection runs.
- **SC-012**: In fault-injection runs over FR-002's states, a failing walking step, a lost and a restored context, and a 2D drawing that can't be drawn, 100% end with the room usable, the AI disclosure visible, and the "In the room" list selecting every piece; 0 end blank or frozen; and the network log of each run holds no request beyond today's but FR-051's one event.
- **SC-013**: On the reference phone, the lookdev page's 2-minute scripted walk holds a median of at least 30 frames a second with at least 95% of frames within 33 ms, and its report gives the quality level it settles at beside the static view's on the same phone (the Author's run).
- **SC-014**: `walk_started` is sent once in 100% of visits that walk and 0 times in visits that don't; a second entry in a visit sends 0; 0 events are sent for targets, highlights, steps, or the camera; the gateway's route answers 204 to `{"kind": "walk_started"}` and counts it, and 400 to the same kind with an `id`; the dashboard's "Visits that walked" panel holds the contract's exact query; and the disclosure's row V4 names the trigger in the commit that adds the kind.

## Amendments to Specs 000, 002, and 004

As spec 004 did, this spec names the clauses it amends; their text stays as it is, and each amendment supersedes the clause it names from this spec's approval. Clauses were checked against `main` (ea9fc7ad) and, for the room's code, against line R's User Story 9 tip (f9524081).

| ID | Spec and clause | Change | Why |
|---|---|---|---|
| M1 | Spec 000, contracts/telemetry.md §7.8, "The room (spec 002)" | The row gains the panel "Visits that walked", a stat as a share, `sum(increase(h4_room_events_total{kind="walk_started"}[$__range])) / sum(increase(h4_room_events_total{kind=~"resume_opened\|resume_kept"}[$__range]))`, and a bullet reading it as the 2D share is read. The dashboard gains the panel in the same change, since §7.8 is required. | FR-053; Principle II, "A feature without a graph is not done." |
| M2 | Spec 002, FR-054 | Its list of moments gains "or first enters the walking view in a visit"; the event carries only its kind, as `mode_2d` does. | FR-051. |
| M3 | Spec 002, contracts/room-events.md §1 (the kinds' table) and §3 (the kinds that take an ID); data-model.md §8 | The table gains `walk_started`, with no `id`, "sent when the visitor first enters the walking view in a visit". §3 is unchanged: only `object_selected` and `item_selected` take an ID, so the gateway refuses `walk_started` with one. `config/room-events.yaml`, generated from the room's event kinds, gains it, and the gateway reads it from its next start. | FR-051, FR-052. |
| M4 | `docs/data-flow-disclosure.md`, row V4 (spec 002's), its Trigger | The trigger gains "and the visitor first entering the walking view in a visit". Carries, Never carries, and Why stay spec 002's words. | FR-055; Principle I. |
| M5 | Spec 002, FR-046 ("every target SHALL be at least 44 by 44 CSS pixels, and no cue SHALL depend on hover alone") and contracts/room-scene.md §5 ("Touch targets") | The 44-pixel guarantee holds at the production framing, where spec 004's RG6 measures it; in the walking view a piece may be smaller, and the list's button is its equivalent control (FR-038). The highlight depends on hover alone nowhere: a press, list focus, and reach target too. | FR-008, FR-038. |
| M6 | Spec 002, contracts/room-scene.md §2 ("All three paths call `selectObject(id)`") and §5 (the Tab order; the canvas) | A fourth path, Enter on the target in the walking view, calls the same selection. The Tab order gains the walking control after the toolbar and the walking view's focusable element, while it is on; the canvas stays `aria-hidden`. | FR-011, FR-041, FR-042. |
| M7 | Spec 002, contracts/room-scene.md §4 (modes) | Entering `2d`, by any road, ends the walking view. The walking view isn't a mode: the mode stays `3d` or `reduced`. | FR-003. |
| M8 | Spec 004, FR-064, and contracts/room-data-files.md §5.5's pick area and §13.3's RG6 | The guarantee and RG6 hold at the production framing, now with the walking control's box reserved: no exclusive core under it at any supported stage, a side-wall selectable's core under it being one the carve-out leaves to the list there. The walking view picks at its own camera, with the carve-out applied there (FR-035). | FR-021, FR-035, FR-058. |
| M9 | Spec 004, FR-052, and RG7 | Unchanged, at the production framing; the walking view makes no promise beyond it, and every word stays in "Around the room". | FR-037. |
| M10 | Spec 004, FR-080 | The figure's place in the scene is where the walking view starts and where leaving it puts the figure back; the compositor refuses a place off the walkable floor. | FR-022, FR-058. |
| M11 | Spec 004, FR-008 | The hand-off stays code and plays at the production framing; after it, the paper moves with the figure. | FR-010, FR-034. |
| M12 | Spec 004, contracts/room-data-files.md §5 (the scene), §9 (UI words), §10 (looks), §13 (rules); contracts/room-bundle.md §3.1 (the index) and §3.2 (the 3D part) | The scene gains the optional `walking` block (FR-056); the UI words gain FR-059's seven keys; each look gains `highlight` (FR-057); §13 gains the rules of FR-058 (plan.md §3 names them); the index gains the highlight's resolved colours and widths for the 2D drawing; the 3D part gains `walking` and the look's `highlight`. | FR-056 to FR-059. |
| M13 | Spec 004, research.md R-70 (the frame log's events) | The log's events gain `walk` (entered, left) and `target` (set or cleared, with its input). | FR-054. |
| M14 | Spec 004, FR-067 (the lookdev page) | The page gains the walking view, the scripted walk, and a highlight on any selectable it names. | FR-050. |

## Assumptions

**Scope and order**

- **Scope.** This spec owns the target and its highlight, the walking view (its input, movement and collisions, follow camera, and reach), the figure's driver interface, their data, the compositor's new checks, the telemetry, and the amendments above. It depends on, without specifying, spec 004's composition and spec 002's room as line R builds them. Outside it: the rigged avatars and their clips (ADR 0010, spec 003's avatar loader), the twin turning its gaze to follow the visitor, gamepads, running and jumping, and intent 005's full-window layout.
- **The base.** The room's code this spec changes is line R's, at User Story 9's tip (f9524081), not yet merged into `main`. The implementation stacks on it, and merges only after line R's stack has merged, in order (plan.md §4).
- **The rig.** ADR 0010's first set gives each visitor avatar an idle animation and a preview image, and no walk. A rigged avatar that walks needs a walk clip, for the rig's spec to add; until then, a rigged avatar standing in would slide in its idle clip. Movement doesn't wait for either (FR-034).
- **Intent 005** (the room filling the window, a draft). If it lands first, it re-measures the walking control's place, as it re-measures the supported stages; the walking view itself doesn't depend on the layout.

**Readings of the inputs**

- **"Until the user clicks on it."** One target at a time, its border shown while it is the target, cleared by the click, and shown again only when it is targeted anew (FR-007, FR-011, FR-012). The other reading, a border that stays on the last piece pointed at after the pointer leaves it, is Q4's option C (Open Questions).
- **"Both themes."** The main session's brief asked for the highlight's legibility "in both themes"; the Author's words don't mention themes, and the site has one colour scheme (`apps/web/src/style.css`: `color-scheme: light`). So the highlight is held to the room's light surfaces and its dark ones, in each of the three looks (FR-016), which covers a dark scheme if one ever comes.
- **The cube is small.** At the default radius and the scene's estimated positions, the walkable floor is a strip about 1.2 m wide and 0.27 m deep in front of the desk, ending at the twin on the right, with a short way along the left wall up to the snowboard. The walking view is a walk around a diorama, not a level. Lookdev measures it.
- **What walking adds.** From the follow camera, the side-wall boards, which the production framing sees at a steep angle, can be seen within about 25° of face-on, and reach can target a side-wall board that is list-only at the production framing on a small stage. Nothing is promised about either (FR-037, FR-038).
- **The production framing keeps its name in the requirements;** visitors see only "Walk around" and "Stop walking".
- **Hover on a phone** doesn't exist; the press is touch's hover (FR-008 (b)).

**Deviations** (named, as the constitution's Governance requires)

- **Principle III**: "Every change begins as an `intent.md` in the originator's own words … accepted or closed by the Author. An accepted intent becomes a specification". The intent beside this spec is a draft: this spec was written on the Author's "Keep going!" before he accepted it, as spec 006's was written beside a draft intent. Nothing is implemented, and nothing merges, before the Author accepts the intent and approves this spec and its plan (`CLAUDE.md`: "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`"). If he closes the intent, this folder closes with it.
- **Inherited: local until publication** (ADR 0013). This spec is reviewed as a branch with a note in `docs/merge-requests/`, as the earlier specs are.
- **Not a deviation:** the one usage event kind rides an existing flow, is disclosed in row V4 in the same change, and carries no identifier (FR-051, FR-055). No permission, allowlist, sandbox domain, CSP, budget, or human-only file changes.

**Defaults taken** under "Keep going!", each the Author's to overturn (Open Questions, D1 to D8): the event kind (D1); the walking parameters' figures (D2); the control's place and words (D3); touch without an on-screen stick (D4); the figure's return to its place (D5); no walking in 2D (D6); "Pause the room" not stopping the visitor's own walk (D7); and list focus highlighting held boards (D8).

## Expected Cost Impact

- **Model spend: $0.** Moving, targeting, and highlighting call no model (FR-001), and a selection costs what it costs today.
- **Cloud, requests.** At most one usage event per visit that walks: a beacon of about 25 bytes of body, on the room's own origin. At 1,000 visits a month, at most 1,000 small requests, well under a cent at typical edge request prices, inside spec 001's caps once it serves the room.
- **Cloud, transfer.** The walking modules and the highlight pass are code in the lazy 3D chunk, an estimated 10 to 20 KB gzipped; the targeting module and the 2D highlight add an estimated 2 to 4 KB to the entry chunk, inside spec 002's 150 KB budget, which the build's check measures. No new asset or typeface.
- **Before publication:** $0 in the cloud; the Author is the only visitor (ADR 0013).
- **Local:** no new service, container, or port; `make up` is unchanged. The Author's time: the lookdev judgement of the highlight and the phone runs, about an hour.
- **Dev time:** the Claude Team plan.
- **Measurement:** the build's chunk-size check for the bytes; the "Visits that walked" panel for use (FR-053).

## Degraded-Mode Behavior

| What is gone or off | Targeting and the highlight | The walking view | The rest of the room |
|---|---|---|---|
| The live source is off, the tier unknown, the local tier off, the budget spent, or the kill switch `degraded` or unknown | work, unchanged | works, unchanged | as today; a selection shows its fixed message where the conversation degrades |
| No WebGL 2, or the room falls to 2D | on the 2D drawing's cues (FR-046) | not offered; one that is on ends at once (FR-003) | the 2D room, the visit kept |
| The 2D drawing can't be drawn | none in the stage; the list still selects (FR-004) | not offered | `flat-failed`'s line; the list, "Around the room", and the conversation work |
| The 3D context is lost | none until it's restored | holds still; goes on after a restore, or ends with the fall to 2D (FR-006) | as spec 002 |
| A step of the walking view fails | as always | ends; the camera and the figure are back at the production framing (FR-005) | keeps drawing |
| The frame rate falls below the floor | as always | the controller steps down as today, and may fall to 2D | as today |
| Reduced motion, or "Pause the room" | still, as always | moves only with input: no glide, inertia, or bob; the return is immediate (FR-044) | final frames |
| The page is hidden | nothing to show | input stops, so nothing moves | as today |
| A piece's studio model fails to load | the border on its stand-in (FR-019) | obstacles from the frame boxes, unchanged (FR-027) | the stand-in stays |
| The beacon is refused or fails | – | `walk_started` isn't retried, queued, or stored (spec 002's contracts/room-events.md §1) | as today |

## Data-Flow Disclosure Entries

For `docs/data-flow-disclosure.md`, in the same change as the flow (FR-055).

| Row | From → To | Trigger | Carries | Never carries | Why | Default; how to switch it off |
|---|---|---|---|---|---|---|
| Spec 002's V4, amended (M4) | as before: the visitor's browser → the site's own origin, `POST /api/room/events`, a beacon | as before, and now the visitor first entering the walking view in a visit | as before: usage events, kind, identifier, time; `walk_started` has no identifier | as before: text, audio, path, avatar, client address, visit identifier; and nothing about where the figure walked, where the camera looked, or what was highlighted | as before: the dashboard's use panels, now with "Visits that walked" (FR-053) | as before |

Not new rows: targeting, the highlight, reach, the walk, and the camera send nothing (FR-052). The walking modules are same-origin static code (spec 002's V1).

## Constitution Check

Applied with the `constitution-check` skill's questions against constitution 1.0.1.

| Principle | Touched | How it complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | One new event kind on an existing flow, disclosed in row V4 in the same change, with no identifier (FR-051, FR-055); nothing else leaves the device, and nothing is stored (FR-001, FR-052). No biometrics. The degraded mode is defined first (FR-001 to FR-006; User Story 6, P1) and is that nothing changes. |
| II. Production-grade or not shipped | Yes | SC-001 to SC-014, each with tests or the Author's run; telemetry with no payloads and a dashboard panel (FR-051 to FR-054); the cost estimate above and its measurement; no alert, so no runbook entry; no model, so no evals; ADR 0039 and the room's README for a cold reader (plan.md). |
| III. Intent before spec, spec before code, humans merge | Yes | From the intent beside it, in the Author's words, with readings marked; amendments named, not edited in. Deviation: the intent is a draft, and the spec was written on "Keep going!"; nothing is implemented or merged before the Author accepts it and approves the spec and plan (Assumptions, Deviations). The clarifications are taken, not answered, and named as provisional where they land. |
| IV. Least privilege | No | No permission, allowlist, sandbox domain, CSP, credential, or human-only path changes, and no hook, IAM rule, or gate is touched. The compositor gains refusals (FR-058), which only narrow what a scene may hold. |
| V. Cost is a first-class signal | Yes | $0 model spend; at most one beacon per visit that walks (Expected Cost Impact). |
| VI. Build in public, including failures | Yes | The spec, its provisional answers, and the walking data are public; nothing private is added. |
| VII. Own the whole product, and say exactly what you owned | Yes | The product reasoning is in the spec: why third person, why a control, why reach, why yellow and ink, and what walking adds (Clarifications; Assumptions). The Author's words are quoted, never paraphrased. |
| VIII. Honest AI | Yes, lightly | The AI disclosure stays visible in every view and mode (spec 004 FR-062; SC-012); no new word speaks for the Author (FR-059); no model call. |
| Security & Agent Governance | No | No agent configuration changes; the implementer doesn't review its own work (plan.md). |

## Open Questions for `/speckit-clarify`

The five questions were taken with their recommended options on 2026-11-07 (Clarifications); each stays open for the Author's yes or no, as asked here. The eight defaults after them were taken the same way.

### Q1: First person or third person? (FR-023 to FR-025, FR-033, FR-034)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | Third person: the figure walks, the camera follows it from the open front's side | The visitor's avatar stays in view, as the hand-off and ADR 0010's rig need; a rigged avatar later takes the cut-out's place (FR-034). |
| B | First person: the camera is the figure's eyes; the figure is hidden while walking | Closer views of every piece; a centre reticle targets; a camera within about a metre of every wall; the chosen avatar unseen while walking. |
| C | No walking figure: the camera alone turns and zooms | Simplest; not "move around the room". |

### Q2: On by default, or entered by a control? (FR-020 to FR-022, FR-031)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | Entered by "Walk around", left by "Stop walking" or Escape | The production framing stays the first view and the judged one; a phone's page keeps scrolling from the stage until the visitor walks; no key competes with the text box. |
| B | On by default after the hand-off: the first movement key, drag, or floor tap starts walking | One step fewer; the stage takes touch gestures from the start, so a phone's page scrolls only outside the stage; the keys need the stage to be focusable from the start. |

### Q3: Collisions (FR-024, FR-026, FR-027, FR-032)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | Solid: walls, desk, twin, and pieces within the figure's height; the figure slides along them; the camera never behind a wall | The figure can't stand in the desk or the twin; obstacles follow the scene's data. |
| B | Walls only | Simpler; the figure walks through the furniture and the twin. |
| C | The floor's edges only | Simplest; the figure walks through walls too. |

### Q4: How is a piece targeted, and when does its border go? (FR-007 to FR-013, FR-033)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | Hover, press, and list focus everywhere; reach in the walking view; the border lasts while targeted and goes at the click | Every input has a highlight; no reticle to draw; walking up to a piece targets it. |
| B | As A, but a centre reticle in place of reach | Needs the follow camera to keep the figure off the view's centre (Q1). |
| C | As A, but the border stays on the last piece pointed at until it's clicked, even after the pointer leaves it | A reading of "until the user clicks on it" closer to the letter; a border on a piece the pointer has left. |

### Q5: The highlight's colour (FR-015 to FR-017, FR-057)

| Option | Answer | Implications |
|---|---|---|
| A (recommended; taken) | Warm yellow `#ffd23f`, framed in the look's ink `#1a1a1a`; 3 and 1.5 CSS px | One tone always gives at least 3:1, on any colour; the familiar game border. |
| B | The page's focus blue `#0b4f9c`, framed in white | Matches the focus ring; under 3:1 on both tones against the cement floor and the figures' grey, so FR-016 refuses it with today's palette. |
| Custom | Another pair | Held to FR-016's check; a data edit in each look. |

### Defaults taken, for a yes or a no

- **D1. The event.** One usage event kind, `walk_started`, once a visit, with no identifier; none for targets or highlights (FR-051, FR-052). On a no: no event, so no panel for walking, a named deviation from Principle II's telemetry and workflow step 7.
- **D2. The figures.** Speed 1.0 m/s; turning 90°/s; tilting 45°/s; radius 0.12 m; reach 0.8 m, within 60° either side of the heading; yaw 60°; pitch 0° to 35°; minimum distance 1.2 m; focus height 1.1 m: all data, which lookdev may tune (FR-023, FR-026, FR-028, FR-033, FR-056). The camera's move into and out of the walking view, at most 500 ms, and the 0.5 s a walk waits without progress, are constants in code (FR-022, FR-032).
- **D3. The control.** In the stage's corner, not the toolbar, with the words "Walk around" and "Stop walking", both UI words (FR-020, FR-021).
- **D4. Touch.** Tap the floor to walk, drag to turn, pinch to zoom; no on-screen stick (FR-031).
- **D5. The return.** Leaving the walking view puts the figure back at its place, so the production framing's composition and checks hold (FR-022).
- **D6. 2D.** No walking in the 2D room; the highlight works there (FR-046, FR-047).
- **D7. The pause.** "Pause the room" stops the walking view's automatic motion, not the visitor's own movement (FR-044).
- **D8. Held boards.** List focus highlights a side-wall board even where the carve-out leaves it to the list (FR-009, FR-040, FR-046).
