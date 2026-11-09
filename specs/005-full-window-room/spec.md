# Feature Specification: The Room Fills the Browser Window — A Full-Window Scene, a Translucent HUD, and Full Screen

**Feature Branch**: `spec/005-full-window-room` (this spec, documents only), in a worktree cut from `main` at e324771e; the implementation branch is the plan's, once the Author has answered the questions below and approved this spec

**Created**: 2026-11-09 (the intent: 2026-10-26)

**Status**: Draft, for `/speckit-clarify`. Written from the intent beside it, which the Author accepted on 2026-11-09 with his words of that day and two answers (Clarifications, answered), and from his further words of the same day on what "the whole window" means, as the main session relays them. Five questions wait for him (Clarifications, pending; asked in full under Open Questions), each with a recommended option and none taken; each `[NEEDS CLARIFICATION]` marker names its question. Eleven smaller defaults wait for his yes or no (Open Questions, D1 to D11). No plan or tasks exist yet, and nothing is built before he approves this spec and its plan.

**Input**: [`intent.md`](intent.md) in this folder: the Author's words of 2026-10-24, 2026-10-26, and 2026-11-09, verbatim, with his two answers of 2026-11-09; and his clarification of 2026-11-09, as the main session relays it. Also read, on `main` at e324771e: the [constitution](../../.specify/memory/constitution.md) 1.0.1 and `CLAUDE.md`; [spec 002](../002-the-room/spec.md) (FR-004, FR-038 to FR-048, FR-054) and its contracts [room-scene.md](../002-the-room/contracts/room-scene.md) (whole) and [room-events.md](../002-the-room/contracts/room-events.md) §1 and §4; [spec 004](../004-room-composition/spec.md) (FR-009, FR-052 to FR-056, FR-059 to FR-065, FR-067, FR-081, and the D4 answer of its Clarifications, Session 2026-10-26) and its [room-data-files.md](../004-room-composition/contracts/room-data-files.md) §13.3 (the supported stages, RG5 to RG7); [spec 007](../007-twin-conversation/spec.md) (FR-032 to FR-042); [spec 008](../008-visitor-movement/spec.md) (whole); [spec 009](../009-room-avatars/spec.md) (FR-007, FR-013, FR-029, FR-030, FR-039); the room's code: `room.css`, `compose/stages.ts` and `test/room/stages.test.ts`, `compose/framing.ts`, `layout.ts`, `a11y.ts`, `stage.ts`, `scene.ts` (its resize and its walking wiring), `scene/levels.ts`, `scene/bundle3d.ts`'s backdrop, `scene/highlight.ts`'s widths, `quality.ts`, `walk/input.ts`, `objects.ts`'s listeners, `flat.ts`'s sizing, `src/talk/talk.ts` and `talk.css`, `ui-words.yaml`, `index.html`, and `style.css`; `apps/web/nginx.conf`'s headers; and the [data-flow disclosure](../../docs/data-flow-disclosure.md), row V4. Not read: the studio's own files (`/srv/studio`), which this spec doesn't need, since the studio's models are built in metres and nothing here changes them (FR-014); and the browsers' references for the Fullscreen API, which this session can't reach: the facts below about which browsers offer it are the plan's to confirm.

Summary: the room's canvas becomes the browser window itself, at every size and shape, and follows it live: a resize, a turned phone, a pixel ratio that changes, and full screen re-fit the scene on the next frame, with the room framed whole into the part of the window the panels leave clear, never stretched, its buffer capped for speed. The interface becomes a HUD: translucent panels laid over the scene with large game-style buttons, always reachable, legible over the scene's brightest and darkest pixels, and isolated from the scene, so a press on a panel never reaches the room and a drag that starts in the room never activates a panel. A full-screen control, with a shortcut, puts the whole page in full screen, leaving Escape to the browser. Spec 004's checks keep running against the real stages, which become the clear areas of the new layout and may only grow. The 2D room fills the window the same way. Cloud cost: $0. One usage event, once a visit, is the only new byte that may leave the device (D1).

## Clarifications

### Session 2026-11-09: the Author's answers (answered)

Recorded in his words, as the intent records them. Each question is the session's; each answer is the option he chose, and the option's text is as it read.

- Q: "The full-window room is already intent 005 (you drafted it on 26 Oct, choosing a slide-in drawer, with 'panels laid over the scene, always visible' as the later alternative). You now want the room to fill the window with the interface laid over it as game-style buttons. Which overlay style should the spec take?" → A (the Author): "Translucent HUD (Recommended)". The option read: "The room fills the window; the list and the talk panel float over it as semi-transparent panels with large game-style buttons, always reachable; a full-screen button; the scene stays visible behind the panels." Reading: User Stories 1, 2, and 6; it supersedes his answer of 2026-10-26 to spec 004's D4, the drawer (Amendment H24).
- Q: "Start spec 005 (the full-window room) now, while you get the avatars' records from the studio?" → A (the Author): "Accept and specify now (Recommended)". The option read: "Intent 005 is accepted with your new words, a spec-writer drafts the spec, and its clarify questions come to you; nothing is built before your approval." Reading: this draft; the questions below go to him, and nothing is built before he approves this spec and its plan.

**His clarification, later on 2026-11-09**, in his words as the main session relays them:

> "When we say the "room fills the whole window", i don't mean the little window inside the browser page, we were meaning the browser window. Is it possible that the assets and game are responsive, so if someone makes the browswer window larger, it fills out appropriately"

Reading: "the little window inside the browser page" is today's stage, the box inside the page's column of at most 72rem (about 686 × 640 CSS pixels on a 1920 × 1200 window); "the browser window" is the viewport itself, so the canvas fills it from edge to edge with no page frame, maximum width, or panel around it (FR-008). "Is it possible that the assets and game are responsive": yes; the studio's models are built in metres and need no change, and only the camera, the canvas, and the page around the room adapt (FR-014). "If someone makes the browswer window larger, it fills out appropriately": the room re-fits live on every change of the window (FR-012, SC-001); what "fills out" means on a window much wider or taller than the room is Q5.

### Pending for `/speckit-clarify`

Asked in full, with their context and options, under Open Questions. None is taken.

- **Q1** (FR-019, FR-020): Where do the panels sit in each layout, which collapse, and where does "Around the room" go? Recommended: A, today's places laid over the scene, the list and the conversation's log collapsible, "Around the room" below the room as now.
- **Q2** (FR-025, FR-026): How see-through are the panels, and how is their game look made and approved? Recommended: A, dark glass at or above the computed contrast floor, a blur only at the two higher quality levels, buttons in CSS alone, approved by the Author at lookdev.
- **Q3** (FR-028): Does the conversation panel grow into a larger conversation view while the twin speaks? Recommended: A, a larger view the visitor opens and closes, never on its own.
- **Q4** (FR-042): What does the full-screen control do on an iPhone, whose browsers can't put a page in full screen? Recommended: A, not shown where the browser reports no support.
- **Q5** (FR-016): On a much wider or taller window, does the visitor see more of the room's surroundings, or does the view zoom to keep the same framing? Recommended: A, contain: the whole room always in view, the frame widening, which is what spec 004's RG5 checks.

## Source: The Author's Words

Quoted as the intent and the main session record them, typing included. The reading beside each is this spec's, to correct where it's wrong; it never replaces the words.

- **After his first visit to the live room, 2026-11-09:**

  > "Okay, walk around is wokring but it's still the placeholders and not the full avatars with rigging? And how do i see it in full screen, or is this how we envisioned it with the interface tabs laid out next to them? Let's organize the interface better, should we make the room responisive, as in the room takes up the whole browser window and the interface is laid over top of it with opaque and make it more game click-able buttons? Everything else is working good, the highlight, the clicking."

  Reading, phrase by phrase:
  - "it's still the placeholders and not the full avatars with rigging?" is spec 009's and the studio's, whose records the main session is getting; nothing here waits for them or changes them (Assumptions, Scope).
  - "how do i see it in full screen" is User Story 6: a full-screen control and a shortcut (FR-036 to FR-042).
  - "or is this how we envisioned it with the interface tabs laid out next to them?" No: the columns beside the stage were spec 002's layout; this spec lays the interface over the scene (User Story 2).
  - "Let's organize the interface better" is the HUD and its places per layout (FR-019 to FR-023; Q1).
  - "should we make the room responisive, as in the room takes up the whole browser window" is User Story 1 (FR-008 to FR-018).
  - "the interface is laid over top of it with opaque" reads as panels opaque enough to read over the scene. The option he then chose says "semi-transparent panels", so the panels are translucent, with an opacity floor that a contrast check computes (FR-024), and how translucent is Q2; Q2's option C is fully opaque panels, for the case where "opaque" meant that.
  - "make it more game click-able buttons" is FR-026: large, clearly bounded buttons with their words on them; their look is Q2.
  - "Everything else is working good, the highlight, the clicking." Spec 008's highlight and the room's selection stay exactly as they are, at every window size (FR-035, SC-014).
- **His two answers, 2026-11-09**, under Clarifications above.
- **His clarification, 2026-11-09**, under Clarifications above.
- **2026-10-24**, as the intent records it:

  > "Everything now seems appropriate scale, and the final product experience will be responsive? Like how big their browser window is, it should take up the space as a responsive design. Is that a complete re-write that we should wait to spec and plan when our rate limit is reset or is that already part of the intention and how the experience will work?"

  Reading: "it should take up the space" is FR-008, the canvas filling the window. "Everything now seems appropriate scale": the room's scale in metres and its framing rule stay (FR-014, FR-015). "Is that a complete re-write": no; the room's composition, its checks, and its scene are kept, and only the page around the room, the camera's framing into the window, and the stages the checks run at change (Amendments).
- **2026-10-26**, his answer to spec 004's D4, as the intent records it: he took the recommendation, D4 (a), "A drawer that slides in from the right on desktop, and a sheet that slides up on phones", adding:

  > "Okay, for your 5 questions go with the recommendation but note that we may change D4 to "panels laid over the scene, always visible" at a later point in time."

  Reading: his answer of 2026-11-09 is that change. The drawer was never built, and this spec doesn't build it. "Always visible" survives as FR-021 (the AI disclosure and the stand-in line never hide) and FR-022 (the text box never hides); how far the other panels may collapse is Q1, since the option he chose says "always reachable".

## User Scenarios & Testing *(mandatory)*

The users are visitors on every screen, from a 320-pixel phone held either way to large monitors and ultrawide displays, by pointer, touch, keyboard, and screen reader, with or without reduced motion, reduced transparency, more contrast, or forced colours; and the Author, who judges the HUD's look. User Story 7, the degraded mode, is P1 and ships with User Story 1, as Principle I asks ("Every user-facing capability MUST define its degraded mode before its happy path"); it is listed last only because it adds no new view, only the proof that the layout depends on nothing that can be off. User Story 5's accessibility applies to every story as it ships; it is also its own test pass.

### User Story 1 - The Room Fills the Browser Window, and Follows It (Priority: P1)

As a visitor, I want the room to take up my whole browser window, whatever its size and shape, and to fill it again at once when I resize the window, turn my phone, or go full screen.

**Why this priority**: The Author's "the room takes up the whole browser window" and his clarification, "we were meaning the browser window ... if someone makes the browswer window larger, it fills out appropriately". Every other story lays itself over this one.

**Independent Test**: In the room's tests, with the window stubbed, step it 1280 × 720 → 2560 × 1440 → 3440 × 1440 → 390 × 844 → 844 × 390 at pixel ratios 1, 2, and 1.5, in 3D and in 2D: after each step the canvas fills the window, its buffer is within the cap with the canvas's aspect, the room is framed whole into the clear area, the HUD is placed, a press on each selectable selects it, the highlight's band is 3 CSS pixels, and the visit's state is unchanged (SC-001). On a desktop browser, drag the window's corner from small to large: the room fills it throughout.

**Acceptance Scenarios**:

1. **Given** a 1920 × 1200 window at a pixel ratio of 1, **When** the room shows after the hand-off, **Then** the canvas is 1920 × 1200 CSS pixels from the window's top-left corner, with no margin, border, page column, or panel around it, and the room is framed into the clear area, at least as large as today's 686 × 640 stage in both directions.
2. **Given** the room on a 1280 × 720 window, **When** the window is resized to 2560 × 1440, **Then** on the next frame the canvas is 2560 × 1440, its buffer at the capped ratio, the room re-framed into the new clear area with nothing stretched, the HUD in its places, and the conversation, the text box's text, the target, and the open resume as they were.
3. **Given** a 3440 × 1440 window, **When** the room shows, **Then** every framed box of the room is in view inside the clear area, unstretched, and the extra width shows more of the scene beside the room (Q5's recommended option).
4. **Given** a phone at 390 × 844 in portrait, **When** it is turned to 844 × 390, **Then** the room re-fits on the next frame, the HUD takes the landscape layout, and the visit's state is kept, the walking view and the figure's pose included.
5. **Given** the window moves to a screen with another pixel ratio, from 1 to 2, **When** the next frame is drawn, **Then** the buffer follows the new ratio within the level's cap, and the highlight's band and edge stay 3 and 1.5 CSS pixels wide on screen.
6. **Given** the walking view is on, **When** the window is resized, **Then** the walking view stays on, the follow camera stays within the new farthest distance (spec 008 FR-023), a click on the floor still walks, and a held key still moves the figure.
7. **Given** a phone whose browser bars hide or show, **When** the visible height changes, **Then** the canvas follows it, with no gap below it and nothing drawn under the bars.
8. **Given** a window dragged continuously for 10 seconds, **When** the drag ends, **Then** the quality level is the one it was before the drag.

---

### User Story 2 - The Interface Floats Over the Scene as a Translucent HUD (Priority: P1)

As a visitor, I want the room's controls, the list of things in it, and the conversation to float over the scene as see-through panels with big, clear buttons, so the room fills the window and I can still reach everything.

**Why this priority**: The option the Author chose: "the list and the talk panel float over it as semi-transparent panels with large game-style buttons, always reachable; ... the scene stays visible behind the panels."

**Independent Test**: In each layout class and panel state: every part of the interface is a panel over the canvas, the scene shows through the panels, every text and control passes the contrast floor computed over white and over black, every control is at least 44 × 44, the AI disclosure and the stand-in line are in view, and a collapsed panel opens in one action. With reduced transparency, more contrast, and forced colours, the panels are opaque.

**Acceptance Scenarios**:

1. **Given** the room on a wide window, **When** it shows, **Then** the toolbar, the "In the room" list, and the conversation panel are panels over the canvas, in the places Q1's answer gives, with the scene visible through them, and none sits beside the canvas or pushes it.
2. **Given** any panel, **When** its colour is composited at its opacity over pure white and over pure black, **Then** every text on it contrasts at 4.5:1 or more (3:1 for large text), and every control's boundary, icon, and focus ring at 3:1 or more.
3. **Given** a collapsible panel, **When** the visitor collapses it, **Then** its header button stays in view, says it is collapsed, and opens it in one action; and **where** the panel was docked, **then** the room re-frames at once into the space it freed.
4. **Given** the conversation's log is collapsed, **When** the twin's answer arrives, **Then** it is announced once with its speaker, as spec 007's FR-040 has it.
5. **Given** any layout class, panel state, mode, or full screen, **When** the room shows, **Then** the AI disclosure is in view, and, while the twin's figure shows a stand-in, so is the stand-in line.
6. **Given** a 320 × 568 window, **When** the room shows, **Then** the text box, Send, and the talk button are on screen without scrolling, and every control is at least 44 × 44 CSS pixels.
7. **Given** the device asks for reduced transparency, more contrast, or forced colours, **When** the room shows, **Then** every panel is opaque and the contrast floor holds.
8. **Given** the visitor presses "Resume", **When** the resume opens, **Then** it opens over the room as an opaque panel with focus on its heading, and "Close" or Escape returns focus to "Resume" (spec 002's room-scene.md §1).

---

### User Story 3 - Spec 004's Checks Run Against the Real Stages, and Only Get Easier (Priority: P1)

As the Author, I want the compositor's spacing and legibility checks to keep judging the room at the stages visitors really see, so a bigger window can only make them easier to pass, never quietly weaker.

**Why this priority**: The intent's constraint, "Spec 004's checks keep running against the real stages: a larger stage may only make the spacing and legibility checks easier to pass, never weaken them."

**Independent Test**: Run `test/room/stages.test.ts` and the compositor on the new layout: every supported stage is a clear area of the new `room.css`, pinned by the test; every screen of today's sweep gets a stage at least today's in width and height; RG5 to RG7 pass across the extended sweep with their floors unchanged; and the report's list-only stages for each side-wall selectable are a subset of today's.

**Acceptance Scenarios**:

1. **Given** a change to the HUD's rules in `room.css`, **When** `compose/stages.ts` isn't changed with it, **Then** the stages test fails, naming the rule.
2. **Given** every screen of today's sweep, 320 × 568 to 1920 × 1200, **When** its new stage is computed in the room's opening panel state, **Then** it is at least today's stage for that screen, in width and in height.
3. **Given** the extended sweep, up to 3840 × 2160 and 5120 × 1440, **When** the compositor runs, **Then** RG5 passes at the extended framing aspects, and RG6 and RG7 pass with their 44-pixel and 9-pixel floors unchanged.
4. **Given** a HUD control whose box overlaps the clear area at a supported stage, **When** RG6 runs, **Then** it reserves that box, as it reserves the walking control's today.
5. **Given** the reference phone's new stage, **When** the compositor totals the texture memory, the live faces' canvases included, **Then** it is within spec 004's FR-053 cap of 96 MB.

---

### User Story 4 - A Press Reaches One Place: the HUD or the Scene (Priority: P1)

As a visitor, I want a press on a panel to do only what the panel does, and a press in the room to do only what the room does, so I never select a piece or turn the camera by accident.

**Why this priority**: Panels laid over the scene put two surfaces under one finger. The Author's "Everything else is working good, the highlight, the clicking" is the baseline this keeps.

**Independent Test**: In the jsdom tests' synthetic pointer, touch, wheel, and key events: every press, drag, wheel, and hover that starts on a panel reaches no targeting, selection, or walking; every drag that starts on the scene and crosses a panel keeps turning the camera and activates nothing; walking's keys act only while the walking view has focus (SC-004).

**Acceptance Scenarios**:

1. **Given** the mouse hovers the bicycle and it shows the highlight, **When** the mouse moves onto a panel over the scene, **Then** the highlight goes; **When** it clicks a button there, **Then** the button acts and nothing in the room is selected.
2. **Given** the walking view is on, **When** a drag that starts on the scene crosses the conversation panel and is released over it, **Then** the camera turns throughout and nothing in the panel activates.
3. **Given** the walking view is on, **When** a press starts on a panel and drags, **Then** the camera doesn't turn and the figure doesn't walk.
4. **Given** the walking view is on, **When** the wheel turns over the conversation's log, **Then** the log scrolls and the camera doesn't zoom.
5. **Given** the walking view is on and the text box has focus, **When** W is typed, **Then** it goes into the box and the figure doesn't move; **When** the visitor then clicks the scene, **Then** the walking view has focus and W walks.
6. **Given** the stand-in line lies over the scene, **When** a finger taps a piece through it, **Then** the piece is selected, as spec 009's FR-029 has it.

---

### User Story 5 - Every Visitor Keeps Every Way In (Priority: P1)

As a visitor using a keyboard, a screen reader, a large text size, zoom, or reduced motion, I want the HUD and full screen to work for me as the columns did.

**Why this priority**: Specs 002, 004, 007, and 008 hold the room to WCAG 2.2 level AA. Panels fixed over a full-window scene are where reflow, focus-obscured, and keyboard-trap failures come from, so each is a requirement here.

**Independent Test**: A keyboard-only run and a screen-reader run on a wide window and on a phone in portrait, in and out of full screen; a reduced-motion run; a 200% text run; a 400% zoom run on a 1280 × 1024 window (320 × 256 CSS pixels); and the automated check in every layout class, panel state, and mode.

**Acceptance Scenarios**:

1. **Given** a keyboard only, **When** the visitor Tabs through the room, **Then** focus moves through the toolbar, the walking control, the list, the conversation panel, and "Around the room" in that order, which is the order they appear in, and each list button highlights its piece while it has focus (spec 008 FR-040).
2. **Given** a screen reader, **When** the visitor moves through the HUD, **Then** each panel has its name, each header button its expanded state, each list button its piece and topic, and the conversation's answers are announced once.
3. **Given** the device asks for reduced motion, **When** a panel opens or collapses or the window is resized, **Then** nothing slides or fades, and the re-frame is immediate.
4. **Given** a 1280 × 1024 window at 400% zoom, **When** the room shows, **Then** it uses the stacked layout: every control and every selectable is reachable, nothing is clipped or overlaps, and the page scrolls only vertically.
5. **Given** focus moves to any control, **When** it lands, **Then** no panel or bar hides it entirely (WCAG 2.2's 2.4.11).
6. **Given** a phone with the text box focused and its on-screen keyboard open, **When** the visitor types, **Then** the text box and Send are in view above the keyboard.
7. **Given** every layout class, panel state, and mode, in and out of full screen, **When** the automated check runs, **Then** it reports 0 WCAG 2.2 AA violations.

---

### User Story 6 - Full Screen, by a Button and a Shortcut (Priority: P2)

As a visitor on a desktop, a laptop, a tablet, or an Android phone, I want one press to put the room on my whole screen, and to leave full screen the way I always do.

**Why this priority**: The Author's "how do i see it in full screen" and the option's "a full-screen button". The full-window room stands without it, so it comes second.

**Independent Test**: With the Fullscreen API stubbed in the tests, and on a desktop browser by hand: press the control, press Alt+Enter, press Escape, press the control again, while walking, with a turn in flight, and with the resume open; make the request fail; and run on a browser that reports no support (Q4).

**Acceptance Scenarios**:

1. **Given** a desktop browser, **When** the visitor presses "Full screen", **Then** the whole page fills the screen, the room re-fits, the AI disclosure and every panel are in view, focus stays on the control, and the control reads "Leave full screen".
2. **Given** full screen, **When** the visitor presses Escape, **Then** the browser leaves full screen, the control reads "Full screen", and the walking view, a turn in flight, and an open resume are as they were.
3. **Given** full screen and the walking view focused, **When** the visitor presses Escape twice, **Then** the first press leaves full screen and the second leaves the walking view, with focus on the walking control.
4. **Given** focus anywhere in the room, the text box included, **When** the visitor presses Alt+Enter (Option+Return on a Mac), **Then** full screen toggles, no turn is sent, and the figure doesn't move.
5. **Given** the browser refuses the request, **When** the visitor presses the control, **Then** the room stays as it was, focus stays on the control, and the status region says once that full screen isn't available.
6. **Given** a browser that reports no full screen for the page, as an iPhone's do, **When** the room shows, **Then** Q4's answer applies; by its recommended option, the control isn't there, and the room fills the window as on any browser.
7. **Given** a visit, **When** the visitor first enters full screen, **Then** one `fullscreen_entered` event is sent (D1), and later entries in the visit send none.

---

### User Story 7 - Nothing About the Layout Ever Degrades (Priority: P1)

As a visitor, I want the room to fill my window and its HUD to work whatever state the Author's machine, the budget, the network, or my device is in.

**Why this priority**: Principle I, quoted above. The layout runs on the device alone, so its degraded mode is that nothing changes; this story proves it and covers the failures that are the layout's own.

**Independent Test**: With the live source off, the tier unknown, the local tier off, the budget spent, and the kill switch `degraded` (stubbed); with no WebGL 2; with the 2D drawing failing; with full screen refused; and with no backdrop blur: the room fills the window, the HUD works, only what the conversation answers degrades, and the network log shows no request beyond today's but D1's one event.

**Acceptance Scenarios**:

1. **Given** the kill switch is `degraded`, **When** the visitor sends a turn, **Then** the conversation panel shows its fixed message, in its place in the HUD, and the layout is unchanged.
2. **Given** no WebGL 2, **When** the room shows, **Then** the 2D drawing fills the window the same way: the backdrop across the window, the drawing at its 8:5 shape centred in the clear area at the largest scale that fits, the same HUD, and no walking control.
3. **Given** the 2D drawing can't be drawn, **When** the room shows `flat-failed`'s line, **Then** the line is centred in the clear area, and the list, "Around the room", and the conversation work.
4. **Given** full screen on a desktop, **When** the frame rate falls to the floor and the room goes to 2D, **Then** it stays in full screen, the 2D drawing fills the screen the same way, and the visit's state is kept.
5. **Given** a browser that draws no backdrop blur, **When** the panels show, **Then** their tint alone carries the contrast floor.

---

### Edge Cases

- **A window too small for the HUD:** narrower than 320, or too short for its layout class at a large text size or a high zoom. The room uses the stacked layout, the panels in the page's flow below a canvas block, so nothing is lost (FR-007, FR-049).
- **Browser zoom:** it changes the window's CSS size and its pixel ratio together. The room re-fits on both; the HUD's sizes are in rem, so its panels grow with the visitor's text size and the clear area shrinks, down to the stacked layout (FR-012, FR-007).
- **A continuous drag of the window's corner:** the room re-fits each frame, and the quality controller is held until the drag settles, so it never steps down for it (FR-013).
- **Moving the window between monitors** of different pixel ratios: the buffer follows the ratio within the cap (FR-010).
- **A very wide window** (5120 × 1440, about 3.6:1, or wider in full screen): by Q5's recommended option, the room is sized by the clear area's height, and more of the scene shows at its sides. The scene beyond the room's shell is spec 002's backdrop, `#20252b`.
- **A very tall phone** (about 0.45:1, or a folding phone's cover screen): the room is sized by the clear area's width, with more of the scene above and below it.
- **The browser's own full-screen view** (F11, or a window's full-screen button): the page isn't in full screen, so the control still reads "Full screen"; the window got larger, and the room re-fits to it (FR-012). Pressing the control then asks for the page's full screen as usual.
- **Full screen during the hand-off:** the room takes no input while the hand-off plays or its offer shows (spec 002's room-scene.md §3), so the control is inert and the shortcut does nothing. A full-screen view the browser makes by itself re-fits the room, and the hand-off goes on.
- **Leaving full screen by switching tabs, by a system gesture, or by the browser's own exit button** (iPad, Android): the control's words follow, and the room re-fits (FR-040).
- **The page scrolled down to "Around the room" while walking** (Q1's recommended option): the walking view stays on; its keys act only while it has focus, as always. The AI disclosure stays in view at the window's top (FR-021).
- **The on-screen keyboard on a phone:** the text box and Send stay in view above it. The scene may sit partly under the keyboard, and the visit's state is kept (FR-050).
- **A long stand-in line at 200% text:** it wraps and stays in view. Its box counts against the clear area where it is docked, or lets the pointer through where it lies over the scene (FR-021, FR-033).
- **A docked panel's content taller than its box:** the panel scrolls inside itself; a wheel over it scrolls it and never zooms the camera (FR-032).
- **The live faces on a window larger than the reference desktop:** their canvases keep spec 004's FR-054 size at the reference stages, so they are drawn larger from the same pixels and may look softer; their glyphs only grow, so legibility holds (FR-056; D11).
- **A device pixel ratio of 3 or more:** the level's pixel ratio caps it (2 at level 0), and the pixel cap may lower it further (FR-010).
- **Framed in another site:** never. The site sends `frame-ancestors 'none'`, so the page is always the top-level document that full screen asks for (FR-066).

## Requirements *(mandatory)*

### Functional Requirements

Terms used below, beside spec 004's and spec 008's (a selectable, a pick area and its exclusive core, the production framing, the reference stages, the supported stages, the walking view, the target, the highlight, "Around the room").
- **The window**: the browser's viewport in CSS pixels: its width, and the height the browser's bars leave visible on a phone (the dynamic viewport height); in full screen, the screen.
- **The canvas**: the element the 3D scene or the 2D drawing is drawn on.
- **The HUD**: everything the room shows over the canvas: the AI disclosure, the toolbar, the walking and full-screen controls, the "In the room" list, the conversation panel, the stage's notes (the placeholder note and the stand-in line), the hand-off's offer, the status lines (loading, `flat-failed`, full screen refused), and the resume while it's open.
- **A panel**: a part of the HUD with its own box: the top bar, the list, the conversation panel, the resume.
- **Docked**: a panel whose open box the layout reserves at the window's edge, so the room is framed beside it.
- **A sheet**: a panel that opens over the scene without re-framing the room.
- **Collapsed**: a panel shown as its header button alone.
- **The clear area**: the canvas less the boxes of the docked panels in their current state. The room is framed into it, and it is what spec 004's checks now call the stage.
- **A layout class**: one of the HUD's arrangements, chosen by the window's shape and size (by Q1's recommended option: wide, phone portrait, and phone landscape). Its bounds are the plan's, pinned by the stages test.
- **The stacked layout**: FR-007's fallback.
- **Today's stage**: the stage `compose/stages.ts`'s `stageFor` gives a screen at e324771e, before this change, kept in the tests as a floor.
- **The pixel cap**: FR-011's.
- **Full screen**: the Fullscreen API's full screen of the page's root element.
- **The full-screen control**: FR-036's button.

**Degraded mode** (defined before the happy paths, Principle I)

- **FR-001**: The layout, the HUD, and full screen SHALL run on the visitor's device alone: THE ROOM SHALL make no request, call no model, and store nothing for them, apart from FR-060's one usage event (D1).
- **FR-002**: WHILE the local tier is off, the budget is spent, the kill switch is `degraded` or unknown, the live source is off, or the tier is unknown, THE ROOM SHALL fill the window and show the HUD exactly as at any other time, and only what the conversation answers SHALL degrade, as it does today (spec 002 FR-039; spec 004 FR-062; spec 007 FR-036).
- **FR-003**: IF the device can't render 3D, or the room falls to 2D, THEN THE 2D ROOM SHALL fill the window the same way: the canvas's backdrop across the window, the drawing at its 8:5 view box, centred in the clear area at the largest scale that fits it (FR-017), its hit areas at that scale, under the same HUD, with no walking control (spec 008 FR-047). A fall to 2D SHALL keep full screen, the panels' states, and the visit's state.
- **FR-004**: IF the 2D drawing can't be drawn (spec 004 FR-081), THEN THE `flat-failed` LINE SHALL be centred in the clear area, as text a screen reader reads, and the HUD, the list, "Around the room", and the conversation SHALL work. Its words SHALL no longer say the list is "below" (Amendment H14; D9).
- **FR-005**: IF a request for full screen fails (the browser refuses it, or it rejects for any reason), THEN THE ROOM SHALL stay as it was, filling the window, SHALL keep focus on the control, and SHALL say once, in the room's polite status region, the UI word `fullscreen.refused` ("Full screen isn't available here. The room still fills the window."). It SHALL NOT retry on its own.
- **FR-006**: WHERE the browser draws no backdrop blur, the panels' tint alone SHALL carry FR-024's contrast floor. WHILE the device asks for reduced transparency or more contrast, or forces its colours, EVERY PANEL SHALL be opaque, with no blur, and in forced colours SHALL take the system's colours.
- **FR-007**: WHILE the window can't hold its layout class's HUD with a clear area at least the smallest supported stage of today's sweep (304 × 196 CSS pixels), as at a high zoom, a large text size, or a window under 320 CSS pixels wide, THE ROOM SHALL use the stacked layout. In it, the canvas is a block of the page at least 9rem tall, the panels follow it in the page's flow in the Tab order's order, and the page scrolls vertically, so nothing is clipped, covered, or lost (WCAG 2.2's 1.4.4 and 1.4.10).

**The window, and live resize**

- **FR-008**: IN THE ROOM, THE CANVAS SHALL fill the window: 100% of its width and of its visible height, from its top-left corner, with no page frame, margin, padding, maximum width, border, or panel around it, in 3D and in 2D. This SHALL hold on every window from the smallest supported (320 × 568, and 568 × 320) to large monitors and ultrawide displays (his clarification, 2026-11-09). WHERE a phone's browser bars show or hide, THE CANVAS SHALL follow the visible height, never drawing under the bars or leaving a gap below.
- **FR-009**: WHERE the browser lets the page draw under a display's cutouts and rounded corners, THE CANVAS SHALL extend there, and THE HUD SHALL keep every control and every line of text inside the safe area, so none sits under a notch, a rounded corner, or a home indicator.
- **FR-010**: THE CANVAS'S DRAWING BUFFER SHALL be its CSS size times one ratio: the device's pixel ratio, capped by the quality level's (`scene/levels.ts`: 2, 1.25, 1, and 0.75 at levels 0 to 3), and lowered further WHERE the buffer would otherwise hold more device pixels than the level's pixel cap (FR-011). The buffer's aspect SHALL equal the canvas's within one device pixel, so nothing is stretched. The canvas's CSS size SHALL stay the window's: the browser scales a capped buffer up, and nothing is cropped.
- **FR-011**: THE PIXEL CAP SHALL be a number of device pixels for each quality level, which the plan sets from lookdev's measurements (FR-059) so that spec 002's FR-048 floors hold on both reference stages at the full window. Each SHALL be one edit, with its value recorded in the plan and pinned by a test (D7).
- **FR-012**: WHEN the window's size or shape changes, THE ROOM SHALL re-fit, on the next frame it draws in 3D or at its next paint in 2D. The changes include: a resize; a turned device; the browser's bars showing or hiding; full screen entered or left; a docked panel collapsed or opened; and the pixel ratio changing, as when the window moves to another screen or the browser's zoom changes. THE ROOM SHALL then:
  - (a) size the canvas and its buffer by FR-008 and FR-010;
  - (b) recompute the clear area, and frame the room into it (FR-015);
  - (c) place the HUD by its layout class;
  - (d) recompute the pick areas; the highlight's widths in buffer pixels, so its band and edge stay spec 008's FR-015 CSS pixels on screen; and the look's line width, so the lines keep their width relative to the room;
  - (e) keep the visit's state: the conversation, the text box's text, the resume and its place, the target, the walking view and the figure's pose, the quality level, the mode, the panels' states, and focus.
- **FR-013**: A RE-FIT SHALL never step the quality controller down. From a resize until `SETTLE_FRAMES` frames after the last one, THE CONTROLLER SHALL be held, as loads hold it (spec 004 FR-055; `quality.ts`'s hold).
- **FR-014**: THE STUDIO'S MODELS, THE SCENE'S DATA, AND THE CATALOG SHALL need no change for this spec. They are built in metres, and only the camera, the canvas, and the page around the room adapt to the window (the intent: "The studio's models are not affected"; his clarification: "the assets and game are responsive").

**Framing**

- **FR-015**: THE ROOM SHALL be framed into the clear area by spec 004's framing (`compose/framing.ts`) at the clear area's aspect, with the frame's centre at the clear area's centre. One camera SHALL draw the whole canvas, its projection shifted so the scene continues behind the docked panels in the same perspective: the scene stays visible through them (the option's "the scene stays visible behind the panels").
- **FR-016**: ON A WINDOW much wider or taller than the room, THE FRAMING SHALL [NEEDS CLARIFICATION: Q5, contain or zoom]. By Q5's recommended option, contain: every framed box stays inside the clear area with spec 004's 6% margin, the binding dimension sets the room's size, and the extra width or height shows the scene around the room. Under every option the room is never stretched.
- **FR-017**: THE 2D DRAWING SHALL keep its 8:5 view box, centred in the clear area at the scale min(W ÷ 320, H ÷ 200) of the clear area's width W and height H, with the canvas's backdrop across the rest of the window.
- **FR-018**: THE HAND-OFF, the walking view's start and end, and spec 004's checks SHALL use the production framing into the clear area (spec 008 FR-036). WHILE the walking view is on, THE FOLLOW CAMERA'S farthest distance SHALL follow the clear area's aspect (spec 008 FR-023).

**The HUD**

- **FR-019**: THE HUD SHALL lay every part of the room's interface over the canvas. That is the AI disclosure; the toolbar ("Resume", "2D view", "Pause the room", the full-screen control, "How data flows", and spec 003's "Credits" once it lands); the walking control; the "In the room" list; the conversation panel; the stage's notes; the hand-off's offer; the status lines; and the resume while it's open. No part SHALL sit beside the canvas or move it. "AROUND THE ROOM" SHALL [NEEDS CLARIFICATION: Q1, below the room or in the HUD]. By Q1's recommended option, it stays below the room in the page, outside the canvas, open, with nothing to expand, so spec 004's FR-063 holds as written.
- **FR-020**: THE PANELS' PLACES SHALL be data: one table, the HUD's placements, giving for each layout class each panel's dock (top, right, bottom, left, or a sheet), its size bounds in rem, whether it starts open, and whether it collapses. `room.css`'s rules and `compose/stages.ts`'s stages SHALL both follow it, and the stages test SHALL pin them to it, so moving a panel is one edit and the checks follow it (spec 004 FR-006; the Author's "features should be modeled with that abstract perspective rather than one-off hard-coded", as spec 008 quotes him). The table's first values SHALL be [NEEDS CLARIFICATION: Q1, the panels' places and collapse states], held to FR-021, FR-022, and FR-054 whatever the answer.
- **FR-021**: WHILE the room shows, in every layout class, panel state, mode, and scroll position, and in full screen, THE AI DISCLOSURE ("You're talking with an AI representation of the Author, not the Author.") SHALL stay in view and legible to FR-024's floor. WHILE the twin's figure shows a stand-in, THE STAND-IN LINE (spec 009 FR-013) SHALL stay in view wherever the scene is in view, and stay first in "Around the room". No control SHALL collapse, cover, or hide either (spec 002 FR-004; spec 004 FR-062; spec 009 FR-007, FR-013; Principle VIII).
- **FR-022**: THE CONVERSATION PANEL'S text box, Send or Stop, and talk button SHALL stay in view in every layout class and panel state, and on a 320 × 568 window without scrolling (spec 002 FR-047; spec 004 FR-065). Only the conversation's log MAY collapse (Q1) or grow (Q3).
- **FR-023**: A PANEL THAT COLLAPSES SHALL keep a header button in view, at least 44 × 44 CSS pixels, named by its panel, with its state in `aria-expanded`, which opens it in one action. A collapsed list SHALL put every selectable within that one action. A collapsed log SHALL never silence the conversation's announcements (spec 007 FR-040): the log stays in the accessibility tree, or its announcements reach the room's status region.
- **FR-024**: EVERY TEXT IN THE HUD SHALL contrast with its panel at 4.5:1 or more, or 3:1 for large text. EVERY CONTROL'S boundary, icon, state mark, and focus ring SHALL contrast at 3:1 or more (WCAG 2.2's 1.4.3 and 1.4.11). The contrast SHALL be computed against the panel's colour composited at its opacity over pure white and over pure black, the brightest and darkest a scene pixel can be, so the floor holds over any part of any look, in 3D and 2D, with or without the blur. A test SHALL compute it from the HUD's palette, as spec 008's FR-016 and spec 011's FR-020 compute theirs.
- **FR-025**: THE PANELS' TRANSLUCENCY AND BLUR SHALL be [NEEDS CLARIFICATION: Q2, how see-through, and the blur]. Whatever the answer, the blur SHALL be decoration only: FR-024 never relies on it, it is off at quality levels 2 and 3 (D8), and FR-006 turns it off.
- **FR-026**: EVERY HUD CONTROL SHALL be at least 44 × 44 CSS pixels in every layout class (spec 002 FR-046), with its words visible on it; an icon, where it has one, sits beside its words and never replaces them. Its states (pressed, expanded, inert, focused) SHALL show by more than colour (WCAG 1.4.1). ITS GAME LOOK SHALL be [NEEDS CLARIFICATION: Q2, the buttons' look and its approval].
- **FR-027**: THE RESUME SHALL open over the room as an opaque panel: within the clear area, or as a sheet where the clear area is too small to read it. It SHALL keep spec 002's behaviour: focus on its heading, "Close" and Escape, and focus back on "Resume" (room-scene.md §1: "beside or over the room"; D5).
- **FR-028**: THE CONVERSATION PANEL SHALL [NEEDS CLARIFICATION: Q3, a larger conversation view]. By Q3's recommended option, a control in its header opens a larger view of the log over the scene and closes it again, only when the visitor asks, never re-framing the room, and with the newest line always in view. Under every option, it SHALL never move focus on its own (spec 007 FR-040).
- **FR-029**: THE HUD AND FULL SCREEN SHALL add no dependency: no package, font, icon set, or image file from outside the repository. They use the site's own stylesheet and code, and the browser's own APIs.

**Pointer and keys**

- **FR-030**: A PRESS, a drag, a wheel, or a hover that starts on a HUD part with a control SHALL never target, highlight, select, walk, turn, tilt, or zoom. The scene sees none of it, and a pointer over such a part targets nothing, as a pointer off the stage does (spec 008 FR-008 (a)).
- **FR-031**: A PRESS THAT STARTS ON THE SCENE SHALL stay the scene's until it ends, wherever the pointer goes. A drag that crosses a panel SHALL keep turning the camera while walking; its release over a panel SHALL activate nothing there; and a tap SHALL select as today, by its start and end on the scene within the tap slop (spec 008 FR-030, FR-031).
- **FR-032**: THE WHEEL OR A PINCH over a panel SHALL scroll that panel where it scrolls, and SHALL never zoom the walking view's camera. Over the scene, it SHALL do what it does today.
- **FR-033**: THE STAGE'S NOTES, which hold no control, SHALL let a pointer or a touch through to the scene (spec 009 FR-029). Every other HUD part SHALL take its own pointer.
- **FR-034**: WALKING'S KEYS SHALL act only WHILE the walking view has focus (spec 008 FR-029). A press on the scene while walking SHALL give the walking view focus. Keys typed in a panel, the text box among them, SHALL never reach the walking view, and walking's keys SHALL never activate a panel.
- **FR-035**: SPEC 008'S TARGETING, ITS HIGHLIGHT, AND THE ROOM'S SELECTION SHALL behave as they do today, at every window size and ratio and in full screen. The highlight's band and edge SHALL keep their CSS widths on screen (the Author: "Everything else is working good, the highlight, the clicking").

**Full screen**

- **FR-036**: THE ROOM SHALL offer the full-screen control in the toolbar, after "Pause the room" (D10), WHERE the browser reports that the page can enter full screen (FR-042 for elsewhere). It SHALL be a button at least 44 × 44 CSS pixels, its words the UI word `fullscreen.enter` ("Full screen") and, in full screen, `fullscreen.leave` ("Leave full screen"), saying what pressing it does. It SHALL be inert while the hand-off plays or its offer shows, as the room's other controls are.
- **FR-037**: WHEN the visitor presses the control, or presses Alt+Enter (Option+Return on a Mac) while focus is anywhere in the room (D2), THE ROOM SHALL ask the browser to put the page's root in full screen, or to leave it. The shortcut SHALL carry a modifier, so no single character key toggles it (WCAG 2.1.4). It SHALL NOT collide with walking's keys, which ignore modified keys (spec 008 FR-029; `walk/input.ts`). Pressed in the text box, it SHALL send no turn. The control SHALL expose the shortcut to assistive technology and name it in its description.
- **FR-038**: FULL SCREEN SHALL hold the whole page (D4): the AI disclosure, every panel, the resume, the status regions, and "Around the room" stay in it, reachable as outside it. Focus SHALL stay where it was when full screen begins or ends, by any means.
- **FR-039**: WHILE in full screen, ESCAPE SHALL be the browser's, which leaves full screen. THE ROOM SHALL NOT lock the keyboard, intercept Escape, or re-enter full screen on its own. The walking view, a turn in flight, a sheet, and the resume SHALL be kept as they were, and an Escape the page then receives SHALL do what it does today, where focus is: leave the walking view, stop a turn, close a sheet, or close the resume (D3). WHILE in full screen, THE WALKING VIEW'S instructions SHALL add the UI word `walk.help_fullscreen` ("In full screen, Escape first leaves full screen. Press it again to stop walking."), and entering the walking view SHALL announce `walk.entered_fullscreen` ("Walking. Escape leaves full screen first, then stops walking.") in place of `walk.entered`.
- **FR-040**: WHEN full screen begins or ends by any means (the control, the shortcut, Escape, the browser's or the system's own exit, or a tab switch), THE CONTROL'S words SHALL follow at once, and THE ROOM SHALL re-fit (FR-012).
- **FR-041**: THE ROOM SHALL lock no orientation, keyboard, or pointer (WCAG 1.3.4, 2.1.2), and SHALL never enter full screen without the visitor's press.
- **FR-042**: WHERE the browser reports that the page can't enter full screen, as an iPhone's browsers do today (the plan confirms per browser), THE CONTROL SHALL [NEEDS CLARIFICATION: Q4, hidden or shown]. By Q4's recommended option, it isn't shown, and nothing else changes. The decision SHALL come from what the browser reports, never from its name or user agent.

**Accessibility and reduced motion**

- **FR-043**: EVERY CONTROL AND EVERY SELECTABLE SHALL stay reachable and operable by keyboard alone and by screen reader, in every layout class, panel state, and mode, and in full screen. THE TAB ORDER SHALL stay spec 002's and spec 008's: the toolbar (the full-screen control after "Pause the room"), the walking control, the walking view while it's on, the list, the conversation panel, "Around the room", and the resume while it's open. Each collapsible panel's header button SHALL come first in its panel. THE HUD'S VISUAL ORDER SHALL match the Tab order (WCAG 1.3.2, 2.4.3).
- **FR-044**: WHEN any element receives focus, NO HUD PART SHALL hide it entirely (WCAG 2.2's 2.4.11). This covers "Around the room" under the AI disclosure, and the stacked layout.
- **FR-045**: FOCUS SHALL return where the visitor expects it: closing a sheet or the resume returns it to the control that opened it; collapsing a panel that holds focus moves it to the panel's header button; leaving the walking view puts it on the walking control (spec 008 FR-022); and entering or leaving full screen leaves it where it was.
- **FR-046**: NO PART OF THE ROOM SHALL trap the keyboard, in full screen or out of it. Tab and Shift+Tab SHALL leave every panel and the walking view, and leaving full screen SHALL need only Escape, the control, or the shortcut (WCAG 2.1.2).
- **FR-047**: A PANEL'S opening or collapse, a sheet's slide, and the larger conversation view (Q3) SHALL take at most 200 ms, and none at all WHILE the device asks for reduced motion (spec 004 FR-059). A re-frame, on a resize, a collapse, or full screen, SHALL be immediate in every mode, with no camera glide (D8). "Pause the room" stops the room's motion (spec 004 FR-060), not these short transitions, which only the visitor's own action starts.
- **FR-048**: EVERY HUD CONTROL AND EVERY LIST BUTTON SHALL be at least 44 × 44 CSS pixels in every layout class, the stacked layout included (spec 002 FR-046).
- **FR-049**: THE PAGE SHALL NOT disable the browser's zoom. At 200% text, at 400% zoom, and with WCAG's text-spacing overrides, nothing SHALL be clipped, covered, or lost: FR-007's stacked layout takes over wherever the HUD can't fit (WCAG 1.4.4, 1.4.10, 1.4.12).
- **FR-050**: WHILE the text box has focus and a phone's on-screen keyboard is open, THE TEXT BOX AND SEND OR STOP SHALL stay in view above the keyboard.
- **FR-051**: THE ROOM SHALL meet WCAG 2.2 level AA with the HUD in every layout class, panel state, and mode, in 3D and 2D, and in full screen (spec 002 FR-045; spec 004 FR-065).

**Spec 004's checks, and the stages they run at**

- **FR-052**: THE SUPPORTED STAGES (`compose/stages.ts`) SHALL be the clear areas the new `room.css` gives each screen, for each layout class and each state of its docked panels. `test/room/stages.test.ts` SHALL keep pinning `stages.ts`'s constants to `room.css`'s rules and to FR-020's table, so a change to the layout's CSS fails the test until `stages.ts` follows it, as today (spec 004 FR-064; its R-18, R-19).
- **FR-053**: THE SWEEP SHALL extend from 320 × 568 to large monitors and ultrawide windows: at least 3840 × 2160 and 5120 × 1440 CSS pixels, and portrait screens up to 2160 × 3840, at steps the plan sets. RG5's framing aspects SHALL cover the narrowest and widest clear-area aspects the supported stages give, spec 002's six among them.
- **FR-054**: NO CHECK SHALL weaken. For every screen of today's sweep (320 × 568 to 1920 × 1200), the stage in the room's opening panel state SHALL be at least today's stage for that screen, in width and in height; a test SHALL hold every such screen to it, against today's `stageFor` kept as the floor. THE REFERENCE STAGES SHALL keep their screens (the desktop's 1920 × 1200 at a pixel ratio of 1; the phone's 384 × 740 at 2.8125), and their stages SHALL become those screens' clear areas, at least today's ≈ 686 × 640 and 368 × 368. RG5 to RG7's rules and floors SHALL stay as written: the 44-pixel hit areas and exclusive cores, the 9-pixel cap-height legibility floor, and the counter faces' one exemption. Only the stages they run at change, and those only grow.
- **FR-055**: RG6 SHALL reserve the box of every HUD control that overlaps the clear area at a supported stage, as it reserves the walking control's today (spec 008 FR-021, FR-058; its Amendment M8). WHERE every control sits outside the clear area, nothing needs reserving.
- **FR-056**: THE LIVE FACES' CANVASES (spec 004 FR-054) SHALL be sized at the new reference stages, and spec 004's FR-053 texture-memory cap for a phone, 96 MB, SHALL hold at the new reference phone stage; the compositor refuses a scene that breaks it. On a window larger than the reference desktop, THE FACES SHALL be drawn from their canvases at that size (D11).
- **FR-057**: THE COMPOSITOR'S REPORT (spec 004 FR-073) SHALL give the new reference stages, the sweep's extent, and, for each side-wall selectable, the stages where only the list reaches it. That set SHALL be no larger than today's.

**Performance**

- **FR-058**: AT THE FULL WINDOW, with the HUD and its blur shown, THE ROOM SHALL hold spec 002's FR-048: at least 30 frames a second on the reference phone and 60 on the reference desktop. Where it can't, it SHALL step quality down as today, the blur going at level 2 (FR-025), and fall to 2D at the floor as today.
- **FR-059**: THE LOOKDEV PAGE, in drafts builds only (spec 004 FR-066, FR-067), SHALL run the room at the full window with the HUD, at both reference stages and at a large monitor's window. Each run SHALL report the drawing buffer's size, the ratio and the pixel cap in force, and the figures it reports today.

**Telemetry and the dashboard** (D1)

- **FR-060**: WHEN the visitor first enters full screen in a visit, THE ROOM SHALL send one usage event of the new kind `fullscreen_entered`, with no identifier and nothing else, on today's beacon (spec 002 FR-054; its room-events.md §1). LATER ENTRIES in the visit SHALL send none.
- **FR-061**: THE ROOM SHALL send no event for a resize, a layout class, a panel's state, a larger conversation view, a refused request, or leaving full screen. Nothing about the window's size, the pixel ratio, the orientation, the display, or the panels SHALL leave the device.
- **FR-062**: THE DASHBOARD'S "Room" row SHALL gain the panel "Visits in full screen": `fullscreen_entered` over `resume_opened` plus `resume_kept`, read as "Visits that walked" is read (spec 000's contracts/telemetry.md §7.8; Amendment H8).
- **FR-063**: IN A DRAFTS BUILD, THE FRAME LOG (spec 004's R-70) SHALL record each re-fit with its window, clear area, buffer size, and layout class; each panel's state change; and each full-screen entry, exit, and refusal, in page memory only. A release build SHALL keep no log.

**Data flow**

- **FR-064**: THE DATA-FLOW DISCLOSURE'S ROW V4 SHALL name `fullscreen_entered`'s trigger, the visitor first entering full screen in a visit, in the change that sends it (Amendment H9). IF the room would send it without that row, THEN it SHALL NOT be deployed. NOTHING ELSE this spec adds SHALL leave the visitor's device.

**Words, serving, the local stack, and the record**

- **FR-065**: THE UI WORDS this spec adds SHALL join spec 004's closed list (its room-data-files.md §9) and pass its checks: `fullscreen.enter`, `fullscreen.leave`, `fullscreen.refused`, `walk.help_fullscreen`, `walk.entered_fullscreen`, each collapsible panel's header words, and the larger view's words (Q3). So SHALL `flat-failed`'s new words (FR-004). They state nothing about the Author.
- **FR-066**: THE CHANGE SHALL alter no response header. The HUD styles by classes from the site's own stylesheet, which the CSP's `style-src 'self'` allows, and never by a `style` attribute in markup. Full screen is allowed to the top-level page by the Permissions Policy's default, which the plan confirms; the site's `frame-ancestors 'none'` keeps the page top-level.
- **FR-067**: WHEN the operator runs `make up` on any stack, IT SHALL start as before: no new service, container, port, env key, or secret.
- **FR-068**: A NEW ADR, proposed, at the next free number, SHALL record the decision: the canvas as the window; the HUD laid over it; the room framed into the clear area; full screen of the page's root, with Escape left to the browser; and the supported stages as the clear areas. It supersedes the Author's D4 answer of 2026-10-26, a drawer, with his answer of 2026-11-09, in his words, "Translucent HUD (Recommended)".

### Key Entities

- **The window**: the viewport's CSS width and visible height, and the device's pixel ratio.
- **The HUD's placements**: per layout class, each panel's dock, size bounds, opening state, and whether it collapses (FR-020).
- **The clear area**: the canvas less the docked panels' boxes in their current state; the room's frame and spec 004's stage (FR-015, FR-052).
- **A panel's state**: open or collapsed, and, for the conversation panel, whether its larger view is open (FR-023, FR-028).
- **The pixel cap**: per quality level, the most device pixels the buffer holds (FR-011).
- **Today's stage**: `stageFor` at e324771e, the floor every new stage is held to (FR-054).
- **The full-screen state**: whether the page's root is in full screen, and whether the browser offers it (FR-036 to FR-042).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the room's tests, in 3D and in 2D, over the resize steps 1280 × 720 → 2560 × 1440 → 3440 × 1440 → 390 × 844 → 844 × 390, at pixel ratios of 1, 2, and 1.5, and full screen entered and left on a 1920 × 1200 window, the following hold after each step, by the next frame or paint, in 100% of steps:
  - the canvas's CSS box equals the window;
  - the buffer's aspect is within one device pixel of the canvas's, and its pixels are within the level's cap;
  - the camera's aspect is the clear area's, and every framed box is inside the clear area with the margin;
  - a press at each selectable's exclusive core selects it;
  - the highlight's band and edge measure 3 and 1.5 CSS pixels on screen;
  - the HUD's panels are in their layout class's places;
  - the conversation, the text box's text, the resume, the target, the walking view and pose, the quality level, the mode, the panels' states, and focus are unchanged.

  And the steps cause 0 quality step-downs.
- **SC-002**: For 100% of today's sweep's screens, the new stage is at least today's in width and in height. RG5, RG6, and RG7 pass at every supported stage of the extended sweep with their floors unchanged. Each side-wall selectable's list-only stages are a subset of today's. The stages test pins `stages.ts` to `room.css` and to the placements table, and fails on a one-rule change to either.
- **SC-003**: For 100% of the HUD's pairs of text and panel, composited over white and over black, contrast is at least 4.5:1, or 3:1 for large text, and 100% of its non-text marks reach 3:1. With reduced transparency, more contrast, and forced colours, 100% of panels are opaque.
- **SC-004**: In the jsdom tests' synthetic events, 0 presses, drags, wheels, or hovers that start on a panel with a control reach targeting, selection, or walking. 100% of drags that start on the scene and cross a panel keep turning the camera and activate nothing there. 100% of walking-key presses typed in the text box leave the figure still.
- **SC-005**: A keyboard-only tester and a screen-reader tester complete a full set of tasks unaided, on a wide window and on a phone in portrait, and in and out of full screen. The tasks: choose every selectable from the list, use every control, collapse and open each panel, enter and leave full screen where it's offered, walk and leave the walking view in and out of full screen, and open and close the resume. Neither is ever trapped. The automated check reports 0 WCAG 2.2 AA violations in every layout class, panel state, and mode, in 3D and 2D, in and out of full screen.
- **SC-006**: With reduced motion, 0 frames of panel animation and 0 camera glides on a re-frame, in 100% of tests.
- **SC-007**: With the Fullscreen API stubbed, all of these hold in 100% of tests:
  - the control and the shortcut enter and leave full screen;
  - a refusal leaves the room unchanged, says `fullscreen.refused` once, and keeps focus on the control;
  - an exit the page didn't ask for keeps the walking view, a turn in flight, and the resume, and updates the control's words;
  - the room makes 0 keyboard-lock and 0 orientation-lock calls;
  - on a browser that reports no support, Q4's answer holds.
- **SC-008**: Over the lookdev page's 2-minute run at the full window with the HUD, the reference phone holds a median of at least 30 frames a second with at least 95% of frames within 33 ms, and the reference desktop holds a median of 60. The reports give the settled quality level, the buffer's size, and the pixel cap. The Author's run on a large monitor is reported beside them.
- **SC-009**: In fault-injection runs over FR-002's states, with no WebGL 2, with the 2D drawing failing, with full screen refused, and with no backdrop blur, 100% end with the room filling the window, the HUD usable, the AI disclosure in view, and the stand-in line in view while it applies. 0 runs end blank or frozen. The network log holds no request beyond today's but FR-060's one event.
- **SC-010**: At 320 × 256 CSS pixels (WCAG 1.4.10's reflow size), and at 200% text on a 320 × 568 window, 100% of controls and selectables are reachable, with 0 clipped or overlapping, and the page scrolls only vertically.
- **SC-011**: `fullscreen_entered` is sent once in 100% of visits that enter full screen, and 0 times in visits that don't. A second entry in a visit sends 0, and resizes and panel changes send 0 events. The gateway's route answers 204 to `{"kind": "fullscreen_entered"}` and counts it, and 400 to the same kind with an `id`. The "Visits in full screen" panel holds the contract's exact query, and row V4 names the trigger in the commit that adds the kind.
- **SC-012**: On a 320 × 568 window, the text box, Send, and the talk button are on screen without scrolling, every control is at least 44 × 44 CSS pixels, and the clear area is at least 304 × 196.
- **SC-013**: The Author judges the HUD at lookdev on both reference stages and on a large monitor, over the scene's light and dark parts, in each look. He also judges the full-window room in his own browser, resizing it from small to large ("if someone makes the browswer window larger, it fills out appropriately"). He records a yes or a no, naming anything that doesn't read or doesn't fill.
- **SC-014**: Spec 008's targeting and selection tests pass unchanged at every step of SC-001, and the room's existing tests of the list, the conversation, the resume, the walking view, and the 2D room pass with only their layout expectations changed.
- **SC-015**: The change adds 0 packages. `make up ENV=dev-cpu` starts unchanged. The build's chunk-size check holds the entry chunk within spec 002's 150 KB budget, and the change's measured cloud cost is $0.

## Amendments to Specs 000, 002, 004, 007, 008, and 009

As specs 004 and 008 do, the amended text stays as it is; each amendment supersedes the clause it names from this spec's approval. Clauses were read on `main` at e324771e. Rows H7 to H9 depend on D1 and fall away on a no. Row H13 depends on Q1.

| ID | Spec and clause | Change | Why |
|---|---|---|---|
| H1 | Spec 002, FR-046 and FR-047, and contracts/room-scene.md §6 (Layout) | The room's canvas fills the window, and the interface is a HUD laid over it. The portrait guarantee (the twin, the desk, the snowboard, the bicycle, the text box, and the talk button on screen without scrolling) holds in the HUD. A resize, a turned device, full screen, and a change of pixel ratio each re-fit the room and keep the visit's state. | FR-008, FR-012, FR-019, FR-022 |
| H2 | Spec 002, contracts/room-scene.md §1 (Screens: the Room's row; the Resume's "beside or over the room") | The Room screen gains the full-screen control. The resume opens over the room, as an opaque panel. | FR-027, FR-036 |
| H3 | Spec 002, contracts/room-scene.md §5 (the Tab order; touch targets), as spec 004's B8 and spec 008's M6 extend it | The toolbar gains the full-screen control after "Pause the room". Each collapsible panel's header button comes first in its panel. The visual order matches the Tab order. 44 × 44 holds in every layout class. | FR-043, FR-048 |
| H4 | Spec 002, contracts/room-scene.md §4 (modes and quality) and FR-042 | `reduced` also turns the HUD's blur off from level 2, and caps the buffer at each level's pixel cap. `2d` fills the window the same way, under the same HUD. | FR-003, FR-010, FR-025 |
| H5 | Spec 002, FR-048 | The floors hold at the full window, with the HUD shown. | FR-058 |
| H6 | Spec 002, FR-004, and `room.css`'s sticky AI disclosure (room-scene.md §1, "always visible") | The AI disclosure is in the HUD's top bar: always in view, in every layout class, at every scroll position, and in full screen. | FR-021, FR-038 |
| H7 | Spec 002, FR-054; contracts/room-events.md §1 (the kinds' table); data-model.md §8; `config/room-events.yaml` | Gains `fullscreen_entered`, with no `id`, "sent when the visitor first enters full screen in a visit". §3 is unchanged, so the gateway refuses the kind with an `id`. (D1) | FR-060 |
| H8 | Spec 000, contracts/telemetry.md §7.8, "The room (spec 002)" | The row gains "Visits in full screen": `sum(increase(h4_room_events_total{kind="fullscreen_entered"}[$__range])) / sum(increase(h4_room_events_total{kind=~"resume_opened\|resume_kept"}[$__range]))`. The dashboard gains the panel in the same change. (D1) | FR-062; workflow step 7 |
| H9 | `docs/data-flow-disclosure.md`, row V4, its Trigger | Gains "and the visitor first entering full screen in a visit". Carries, Never carries, and Why stay spec 002's words. (D1) | FR-064; Principle I |
| H10 | Spec 004, FR-064, contracts/room-data-files.md §13.3 (the supported stages, the reference stages, and the sweep to 1920 × 1200), and its R-18 and R-19 | The supported stages are the clear areas of the new layout, per layout class and docked-panel state. The sweep extends to 3840 × 2160, 5120 × 1440, and portrait screens up to 2160 × 3840. The reference stages keep their screens and take their clear areas. Every screen of today's sweep gets a stage at least today's. | FR-052 to FR-054 |
| H11 | Spec 004, FR-009, and RG5 ("spec 002's six aspects (0.45, 0.6, 0.8, 1.15, 1.5, 2.4)") | The framing aspects cover the supported stages' narrowest and widest clear areas, the six among them. | FR-053 |
| H12 | Spec 004, FR-052 and RG7; FR-053 and FR-054 | The rules and the floors are unchanged, measured at the new reference stages. The live faces' canvases are sized there, and the phone's texture memory is totalled there. | FR-054, FR-056 |
| H13 | Spec 004, FR-063 ("after the conversation panel and outside the stage") | Unchanged under Q1's recommended option: "Around the room" stays below the room in the page. Amended only if the Author takes Q1's option D, which makes it a collapsible HUD panel. | FR-019 |
| H14 | Spec 004, FR-081, the UI word `flat-failed` ("This drawing of the room could not be shown. The list below still works.") | Its words lose "below", since the list is no longer below the stage. The default is "This drawing of the room could not be shown. The list of things in the room still works.", a data edit and the Author's to change (D9). | FR-004 |
| H15 | Spec 004, FR-065 (the 320 × 568 guarantee, "Credits" included) | Holds in the HUD with the full-screen control added, and the clear area there is at least 304 × 196. | FR-022, FR-054 |
| H16 | Spec 004, FR-067 (the lookdev page) | The page runs the full window with the HUD, at both reference stages and a large monitor's window, and reports the buffer's size and the pixel cap. | FR-059 |
| H17 | Spec 004, contracts/room-data-files.md §9 (UI words) and research.md R-70 (the frame log) | The words of FR-065. The log's events gain `refit`, `panel`, and `fullscreen`. | FR-063, FR-065 |
| H18 | Spec 007, FR-039 and FR-042 (the conversation panel's accessibility and its reflow at 320 and 200%) | The panel is in the HUD. It reflows through the stacked layout where the HUD can't fit. Its log may collapse (Q1) and open a larger view (Q3). In full screen, Escape leaves full screen first. | FR-007, FR-022, FR-028, FR-039 |
| H19 | Spec 008, FR-021 and Amendment M8 (the walking control in the stage's bottom-right corner; `compose/stages.ts`'s `WALK_CONTROL`) | The walking control is a HUD control, placed by the placements table (Q1). RG6's reservation covers every HUD control over the clear area. | FR-020, FR-055 |
| H20 | Spec 008, FR-022, FR-029, FR-042, and FR-043 (Escape leaves the walking view; `walk.help`; `walk.entered`) | In full screen, the browser takes the first Escape; the walking view keeps its own for the next. `walk.help_fullscreen` and `walk.entered_fullscreen` speak while in full screen. | FR-039 |
| H21 | Spec 008, FR-023 (the farthest distance at "the stage's aspect") and FR-036 | The stage is the clear area. | FR-018 |
| H22 | Spec 009, FR-013 (a) (the stand-in line in the stage's note) and FR-029 | The line is in the HUD and stays in view wherever the scene is. It is never collapsed, and it still lets a pointer through. | FR-021, FR-033 |
| H23 | Spec 002, FR-045, and spec 004, FR-065 (WCAG 2.2 AA) | Named for the HUD's own failure modes: reflow, focus not obscured, and no keyboard trap in full screen. | FR-044, FR-046, FR-049 |
| H24 | Spec 004's Clarifications, Session 2026-10-26, D4's answer ("A drawer that slides in from the right on desktop, and a sheet that slides up on phones") | Superseded by the Author's answer of 2026-11-09, "Translucent HUD (Recommended)", and recorded in FR-068's ADR. | Clarifications |

**Spec 003** is not amended: its "Credits" link joins the toolbar when it lands. **The studio's records** are not touched (FR-014).

## Assumptions

**Scope**

- **In:** the canvas as the window, and its live re-fit, buffer, and pixel cap; the framing into the clear area; the HUD, its placements, its collapse states, its legibility, and its look; the pointer and key isolation; the full-screen control and shortcut; the stacked layout; the 2D room's fill; the stages and their tests, and the compositor's extended sweep; the lookdev page's runs; the UI words; the event, the panel, and row V4's trigger (D1); the frame log's events; the ADR; and the amendments above.
- **Out:** the rigged avatars and the studio's records (spec 009, and the main session's request to the studio); the choice screen at the door, which keeps its page; the room's composition, scene, catalog, looks, and models; a web app manifest or a home-screen mode (Q4's option C, a later intent); surroundings beyond the room's shell (Q5's option C, a later studio intent); gamepads; a dark scheme for the site's pages outside the room; and any change to the twin, the corpus, the gateway's routing, or a model.

**Readings**

- **"Translucent HUD" and "with opaque".** The panels are translucent, with an opacity floor the contrast check computes; how translucent is Q2, whose option C is opaque (Source).
- **"Both themes."** The site has one colour scheme (`style.css`: `color-scheme: light`), as spec 008 found. So the HUD's legibility is checked against the extremes beneath it, white and black, which covers every look, both the scene's light and dark surfaces, and any dark scheme to come (FR-024).
- **"The scene stays visible behind the panels"** reads as one camera drawing the whole window, its projection shifted so the room is centred in the clear area and the scene continues behind the docked panels (FR-015). Spec 002's backdrop, `#20252b`, fills what lies beyond the shell.
- **The clear area as the stage.** A pick area under a docked panel couldn't be pressed, so spec 004's checks are only honest at the part of the window the room is framed into. Framing into the clear area keeps every selectable's pick area pressable, and the list stays every selectable's equivalent (spec 008 FR-038).
- **"No weakening"** is read two ways, and both are required: the checks' rules and floors stay as written (FR-054), and every screen's stage is at least today's, so no check that passes today can fail for this layout (SC-002).
- **The intent's open questions** map as follows:
  - "does the drawer start open or closed" and "how tall is the phone's sheet at rest" become Q1's collapse states;
  - "do the list and the talk panel share one drawer" becomes Q1's places (option A keeps them in one column, as today);
  - "while the twin is speaking, does the talk panel need to stay visible" becomes FR-022, FR-023's announcements, and Q3;
  - "does the 2D room fill the window the same way" is answered yes (FR-003, FR-017), as the brief asked and Principle I needs;
  - "which parts of the layout should be configuration" is FR-020's placements table.
- **The intent's constraints about the drawer** carry over to collapse and sheets: focus moves into a sheet when it opens and back when it closes (FR-045); no slide when motion is reduced (FR-047); no new dependency (FR-029); the smallest stages fit their controls (FR-022, SC-012).
- **iPhone's browsers.** As documented when this was written, Safari on iPhone offers full screen to video elements only, and every iPhone browser uses its engine; iPad's Safari, Android's browsers, and desktop browsers offer it to a page. This session couldn't open the references, so the plan confirms each before FR-042 is built.
- **The shortcut.** Alt+Enter is the toggle many games on Windows use. It is modified, so it meets WCAG 2.1.4, and walking's input ignores modified keys. The plan confirms that no supported browser or screen reader takes it on a page (D2).
- **The reference stages keep their screens.** Spec 002's FR-048 names devices, not boxes: the reference desktop is a 1920 × 1200 window at a pixel ratio of 1, and the reference phone a 384 × 740 viewport at 2.8125. Their stages change with the layout, as spec 004's R-18 expects stages to be re-measured.
- **Dates.** The Author's words and answers are dated 2026-11-09, as the intent and the main session give them.

**Dependencies**

- **The room's code on `main`** at e324771e: specs 004, 008, and 009 as merged. Spec 009's avatars and their records may land in `apps/web/src/room/` at the same time; the plan orders the branches.
- **Spec 003's "Credits" link**, when it lands, joins the toolbar inside FR-022 and FR-054's floors.
- **The Author's own steps:** his answers to Q1 to Q5 and D1 to D11; his approval of this spec and the plan; his lookdev judgement (SC-013) and his large-monitor run (SC-008); and the merges.

**Deviations** (named, as the constitution's Governance requires: "Deviations require a written justification in the spec and an ADR if permanent.")

- **Inherited: local until publication** (ADR 0013). This spec and its branch are reviewed with a note in `docs/merge-requests/`, not a pull request, and the Author's gate stands in for CI.
- **The intent's "Data-flow impact: None. No byte leaves the visitor's device that didn't before."** D1 adds one usage event kind, so this spec departs from that line on purpose. The intent was written for the drawer, before the full-screen button existed. Principle II ("telemetry that makes it observable in production") and workflow step 7 ("A feature without a graph is not done") ask for a graph, and the constitution supersedes other guidance where they conflict. The event follows spec 008's `walk_started`, which row V4 already carries. It is the Author's to refuse: on a no, the room sends nothing new, the intent's line holds, and the full-screen control ships without a graph, a named deviation from Principle II and step 7 for it alone. The layout's own production risk, more pixels per frame, shows on the existing 2D-share panel either way (`mode_2d`).
- **No other.** No permission, allowlist, sandbox domain, header, budget, credential, or human-only file changes.

**Defaults taken**, each the Author's to overturn (Open Questions, D1 to D11): the event (D1); the shortcut (D2); Escape in full screen (D3); full screen of the page's root (D4); the resume over the room (D5); the stacked layout (D6); the pixel cap from lookdev (D7); immediate re-frames and the blur's levels (D8); `flat-failed`'s words (D9); the control's place (D10); and the faces' canvases on large windows (D11).

## Expected Cost Impact

- **Model spend: $0.** Nothing here calls a model, and a turn costs what it costs today.
- **Cloud, requests (D1).** At most one usage event per visit that enters full screen: a beacon of about 30 bytes of body, on the site's own origin. At 1,000 visits a month that is at most 1,000 small requests, well under a cent at typical edge request prices, inside spec 001's caps once it serves the room. Before publication the cloud cost is $0, since the Author is the only visitor (ADR 0013).
- **Cloud, transfer.** The HUD's CSS and code, and the full-screen and re-fit code, are an estimated 3 to 8 KB gzipped in the entry chunk, inside spec 002's 150 KB budget, which the build's check measures. No new asset, typeface, icon file, or package.
- **The visitor's device.** More pixels per frame. At a ratio of 1, the reference desktop's buffer grows from about 0.44 million pixels (686 × 640) to about 2.3 million (1920 × 1200). At its level-0 ratio of 2, the reference phone's grows from about 0.54 million (736 × 736) to about 1.1 million (768 × 1480). The blur adds a pass under each panel on every frame while it's on. The pixel cap, the blur's levels, and the quality controller bound all of this, and the lookdev runs measure it (FR-011, FR-025, FR-059).
- **Local:** no new service, container, or port; `make up` is unchanged. The Author's time is about an hour for the lookdev judgement and the large-monitor run.
- **Development time:** agent sessions on the Author's existing plan, with no metered API spend.
- **Measurement:** the chunk-size check for the bytes; the lookdev reports for the pixels and the frame rates; the "Visits in full screen" panel for use (D1); and the 2D-share panel for falls to 2D.

## Degraded-Mode Behavior

Defined before the happy path, as Principle I asks.

| What is gone or off | The canvas and the framing | The HUD | Full screen | The rest of the room |
|---|---|---|---|---|
| The live source is off, the tier unknown, the local tier off, the budget spent, or the kill switch `degraded` or unknown | fill the window, unchanged | unchanged | unchanged | only the conversation degrades, to its fixed messages (spec 007 FR-036) |
| No WebGL 2, or the room falls to 2D | the 2D drawing at 8:5 in the clear area, the backdrop across the window (FR-003) | unchanged, no walking control | kept | the 2D room, the visit kept |
| The 2D drawing can't be drawn | `flat-failed`'s line centred in the clear area (FR-004) | unchanged | kept | the list, "Around the room", and the conversation work |
| The frame rate falls below the floor | the buffer drops with each level and its pixel cap | the blur goes at level 2 | kept | as today; at the floor, 2D |
| The browser draws no backdrop blur | unchanged | the tint alone carries the contrast (FR-006) | – | – |
| Reduced transparency, more contrast, or forced colours | unchanged | opaque panels; forced colours take the system's (FR-006) | – | – |
| Reduced motion | re-frames immediate (as always) | no slides or fades (FR-047) | – | final frames, as spec 004 |
| The window can't hold the HUD (zoom, text size, under 320 wide) | a block of the page, at least 9rem tall | the stacked layout, the page scrolling (FR-007) | kept | – |
| Full screen refused or failing | unchanged | the control keeps focus; `fullscreen.refused` once | not entered | – |
| The browser offers no full screen (iPhone) | fills the window under the browser's bars | by Q4's answer | – | – |
| The 3D context is lost | as spec 002: held, then restored or 2D | unchanged | kept | as today |
| The beacon is refused or fails (D1) | – | – | – | `fullscreen_entered` isn't retried, queued, or stored (room-events.md §1) |

## Telemetry and the Dashboard

- **Spans:** none new. The room has no tracing in the browser; the beacon's request is the gateway's existing `POST /room/events` server span, which carries no event (spec 002's room-events.md §3).
- **The counter** (D1): `h4_room_events_total{kind="fullscreen_entered"}`, through the existing route and `config/room-events.yaml` (Amendment H7).
- **The panel** (D1): "Visits in full screen" in the "Room" row, beside "Visits that walked" and the 2D share (FR-062). The 2D share already shows the layout's main production risk, falls to 2D at the frame floor.
- **The frame log**, drafts builds only: re-fits, panel states, and full screen (FR-063).
- **Never in telemetry:** the window's size, the pixel ratio, the orientation, the display, the layout class, the panels' states, or whether full screen was refused or left (FR-061).
- **Runbook:** none. Nothing here can page a human.

## Data-Flow Disclosure Entries

For `docs/data-flow-disclosure.md`, in the change that sends `fullscreen_entered` (FR-064). Only the Trigger changes. On a no to D1, no row changes and nothing new leaves the device.

| Row | From → To | Trigger | Carries | Never carries | Why | Default; how to switch it off |
|---|---|---|---|---|---|---|
| Spec 002's V4, amended (H9) | as before: the visitor's browser → the site's own origin, `POST /api/room/events`, a beacon | as before, and the visitor first entering full screen in a visit | as before | as before | as before | as before |

Not new rows: the HUD, the re-fit, and full screen send nothing else (FR-061). The HUD's code is same-origin static code (spec 002's V1). Nothing about the window or the display leaves the device.

## Constitution Check

Applied with the `constitution-check` skill's eight questions against constitution 1.0.1.

| Principle | Touched | How it complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | One event kind on an existing flow (D1). It has no identifier, is disclosed in row V4's trigger in the same change, and is refused deployment without it (FR-060, FR-064). Nothing about the window or the display leaves the device (FR-061). No biometrics. The degraded mode comes first, and it is that nothing changes (FR-001 to FR-007; User Story 7, P1). The whole topology still runs locally with one command (FR-067). |
| II. Production-grade or not shipped | Yes | Every requirement has a test or the Author's run behind it (SC-001 to SC-015). Telemetry with a panel (D1; FR-060 to FR-063); the cost estimate above and its measurement; an ADR (FR-068). No model, so no evals; nothing pages a human, so no runbook. A named deviation only on a no to D1: the full-screen control then ships without a graph. |
| III. Intent before spec, spec before code, humans merge | Yes | From the accepted intent, in the Author's words, with his two answers and his clarification, verbatim beside their readings. The amendments are named, not edited in. Five questions and eleven defaults wait for him. No code on this branch, and the Author merges. |
| IV. Least privilege | No | No permission, allowlist, sandbox domain, header, credential, or human-only path changes (FR-066). No hook, gate, or IAM rule is touched. The compositor's checks only widen their coverage (FR-053). |
| V. Cost is a first-class signal | Yes | $0 model spend; at most one beacon per visit that enters full screen (Expected Cost Impact). The device-side cost of more pixels is bounded by the pixel cap and the quality controller, and measured at lookdev. |
| VI. Build in public, including failures | Yes | The spec, its questions, its defaults, and the placements table are public; nothing private is added. |
| VII. Own the whole product, and say exactly what you owned | Yes | The product reasoning sits beside the systems reasoning: why the clear area, why contain, why Escape stays the browser's, and why the columns' places are the recommended start (Readings; Open Questions). The Author's words are quoted, never paraphrased. |
| VIII. Honest AI | Yes | The AI disclosure stays in view in every layout, panel state, scroll position, and in full screen. The stand-in line stays in view wherever the scene is, and no control can collapse either (FR-021). No new word speaks for the Author (FR-065), and no model call. |
| Security & Agent Governance | No | No agent configuration changes. The implementer doesn't review its own work (the plan's tasks). No new dependency (FR-029). |
| Technology Standards, Frontend | Yes | The 3D room in the browser, unchanged in kind, now at the window's size. |
| Workflow step 7, "A feature without a graph is not done." | Yes | "Visits in full screen" ships with the control (D1), or the deviation above. |

## Open Questions for `/speckit-clarify` (pending)

Five questions, none answered. Each has a recommended option; the requirements it touches carry its marker. After them, eleven defaults this spec took, each for the Author's yes or no.

### Q1: Where do the panels sit in each layout, which collapse, and where does "Around the room" go? (FR-019 to FR-023, FR-054)

**Context**: Today (`room.css`), a landscape screen puts the stage in three fifths of a page at most 72rem wide. Beside it is one column, two fifths and at least 15rem, holding the list above the conversation panel, and the toolbar sits above both. In portrait, the toolbar, the stage, the list, and the conversation stack in turn. "Around the room" and the resume follow below in every layout. FR-054 holds every screen's new stage to at least today's: with today's column laid over the scene, it holds by construction. Two docked columns, one each side, would make the room narrower than today's stage on windows from 1,024 to about 1,165 CSS pixels wide. The option the Author chose says the panels are "always reachable", and D4's earlier alternative said "always visible". FR-021 and FR-022 keep the AI disclosure, the stand-in line, and the text box in view under every option.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Today's places, laid over the scene. On wide windows and phones held sideways, a top bar holds the AI disclosure and the toolbar, and one docked column on the right, as wide as today's (two fifths, at least 15rem, and at most 28rem on large monitors), holds the list above the conversation panel. On phones held upright, the top bar, and docked at the foot the list as a strip above the conversation panel. The walking control stays in the clear area's bottom-right corner, reserved by RG6, as spec 008 put it. The list and the conversation's log collapse to their header buttons, and start open. The room re-frames into the space a collapse frees. "Around the room" stays below the room in the page, so FR-063 holds as written; the resume opens over the room. | FR-054 holds by construction, so it carries the least risk to spec 004's checks. Familiar to anyone who has visited. A scroll, or Tab after the conversation, reaches "Around the room". |
| B | A game's split. On windows from about 1,165 CSS pixels wide, the list is docked on the left edge and the conversation panel on the right, the room centred between them; narrower windows and phones as A. Collapse and "Around the room" as A. | Closer to a game's HUD. The room stays centred. Below 1,165 pixels it falls back to A, so the layout table has one more class to test. |
| C | Minimal. Only the top bar and the text box with its buttons start in view. The list and the conversation's log start collapsed, and open as sheets over the scene. A "Hide the interface" control collapses everything but the AI disclosure, the stand-in line, the text box, and itself. | The largest view of the room, the most game-like. One more action to reach the list. Open sheets cover part of the scene, whose pieces stay reachable from the list. |
| D | As A, but "Around the room" becomes a collapsible HUD panel too | No page scroll at all. Amends spec 004's FR-063, "with nothing to expand, ... outside the stage", whose visible, open text copy the Author chose on 2026-10-22 ("okay go with recommendation"). |

### Q2: How see-through are the panels, and how is their game look made and approved? (FR-024 to FR-026, SC-003, SC-013)

**Context**: The Author's words: "laid over top of it with opaque and make it more game click-able buttons". His chosen option: "semi-transparent panels with large game-style buttons". FR-024 computes the contrast over white and black beneath a panel. A dark tint behind white text needs an opacity of about 60% at least, and a light tint behind dark text about 50%; the test fixes the exact floor from the palette. Around the room's shell is spec 002's dark backdrop, `#20252b`, so most of what lies behind a docked panel is dark. A backdrop blur over a moving 3D scene is redrawn every frame and costs most on phones, so it goes from quality level 2 (D8). No design source for a HUD exists in the repository. The studio's pipeline stays outside, and only its outputs come in, with records (spec 003).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Dark glass: a dark tint at or above the computed floor, with light text, a backdrop blur at quality 0 and 1, and opaque panels where FR-006 says. Game-style buttons in CSS alone: large, rounded, raised, with bold words and, where it helps, a simple icon drawn as inline SVG in the repository. The Author approves the look at lookdev on both reference stages and a large monitor before merge (SC-013). | Reads as a game's HUD over the dark backdrop. No new file type and no package. The Author sees it before it ships. |
| B | Light glass in the site's colours (a white tint, dark text, the site's blue focus ring), with the blur as A. Words-only buttons. Approved at review, from screenshots in the merge-request note. | Matches the choice screen and the site's pages. Stands out more against the dark backdrop. Less game-like. |
| C | Opaque panels: no translucency and no blur. Game-style buttons as A, approved at lookdev. | The plainest to read and the cheapest to draw. The scene no longer shows through the panels, unlike the option's "semi-transparent". It fits "with opaque" read literally. |
| D | A design source first: the studio makes the HUD's button and icon art as outputs with records, through spec 003's arrival check, and the HUD is built to it, with A's translucency rules | The most designed look. The HUD waits for the studio's work and its records, and its art needs licence and provenance records like any studio output. |

### Q3: Does the conversation panel grow into a larger conversation view while the twin speaks? (FR-022, FR-028, FR-047)

**Context**: Today the log shows about three lines (4.75rem) and scrolls inside its panel (spec 007 FR-042); the panel never moves focus (FR-040). The twin has no voice yet: the talk button says `voice_unavailable`. A panel that changes size by itself either re-frames the room mid-answer or covers more of the scene without being asked.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Only when asked. A control in the panel's header ("Larger conversation", then "Smaller conversation") opens the log as a larger view over the scene, up to about half the window on wide windows and most of it on phones, and closes it. It never opens on its own, never re-frames the room, and keeps the newest line in view. | Long answers are easy to read on a phone. Nothing moves without the visitor. Two more UI words. |
| B | By itself. The log grows while a turn is out and its answer arrives, and shrinks after the visitor's next action or 20 seconds. | The answer is prominent without a press. Unexpected movement over the scene; a timer to test; reduced motion makes it a jump. |
| C | Never. The log keeps its size and scrolls, as today. | The smallest change. Long answers need scrolling in a few lines, especially on phones. |

### Q4: What does the full-screen control do on an iPhone? (FR-036, FR-042)

**Context**: As documented when this was written, Safari on iPhone puts only video in full screen, and every iPhone browser uses its engine. A page can't enter full screen there, whatever it asks. iPad's Safari, Android's browsers, and desktop browsers can, and the plan confirms each. On an iPhone, the room still fills the window under the browser's bars (FR-008).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Not shown where the browser reports that the page can't enter full screen, decided by what the browser reports and never by its name. Nothing else changes. | No dead button. iPhone visitors see the full-window room. A toolbar slot is free on the smallest phones. |
| B | Shown everywhere. On a browser that can't, a press says once that full screen isn't available there (FR-005), and the room stays as it is. | One toolbar on every device. A button that can't work on iPhones. |
| C | As A, and add a web app manifest so "Add to Home Screen" opens the room in its own window without the browser's bars | The nearest thing to full screen on an iPhone. A new file and a new display mode to serve, test, and disclose. Larger than this spec: an intent of its own. |

### Q5: On a much wider or taller window, does the visitor see more of the room's surroundings, or does the view zoom to keep the same framing? (FR-015, FR-016, FR-053)

**Context**: Spec 004's framing (`compose/framing.ts`) puts the camera as close as it can be while every framed box fits with a 6% margin. On a shape wider than the room, the height binds and more of the scene shows at the sides; on a taller one, the width binds and more shows above and below. That is "contain". RG5 refuses a framed box outside the view at each framing aspect. RG6 and RG7 measure pick areas and glyphs at that framing. Spec 002's FR-047 asks for the twin, the desk, the snowboard, and the bicycle on screen in portrait. Ultrawide windows reach aspects of 3 to 4 (5120 × 1440), beyond spec 002's widest, 2.4. Beyond the shell is the backdrop, `#20252b`.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Contain, so the frame widens. The whole room is always in view, sized by the clear area's binding side, never stretched or cropped. A wider window shows more of the scene at the room's sides, a taller one above and below, and the room grows with the window. RG5's aspects extend to the widest and narrowest clear areas. | Spec 004's checks support it best. It is exactly what RG5 checks, at the framing RG6 and RG7 measure. Every selectable stays on screen for a pointer, and FR-047 holds by construction. On an ultrawide window, the sides show the backdrop. |
| B | Cover, so the view zooms. The room fills the clear area's longer side and keeps the same framing feel at every shape, cropping the rest: the top and the floor on an ultrawide window, and the side walls, with the snowboard and the bicycle, on a tall phone. | The room looks bigger on extreme shapes. RG5 fails by design and must be amended. Cropped pieces leave the pointer's reach and are reached only from the list. FR-047 is amended. The checks would need a new framing rule. |
| C | As A, and a later studio intent gives the room surroundings beyond its shell (its outer walls, a corridor, the view out of the window), so a wide window shows more of a place rather than the backdrop | A's rule with a richer edge. The surroundings are new studio work and new data, outside this spec, and would follow it. |

### Defaults taken, for a yes or a no

- **D1. The event.** One usage event kind, `fullscreen_entered`, once a visit, with no identifier; row V4's trigger gains it; the dashboard gains "Visits in full screen" (FR-060 to FR-064). It departs from the intent's "Data-flow impact: None" (Deviations). On a no: no event, no panel, and the intent's line holds, with Principle II's deviation named for the control.
- **D2. The shortcut.** Alt+Enter (Option+Return on a Mac), beside the button. No single-key shortcut: F, the usual one, is walking's tilt key, and a single key fails WCAG 2.1.4 (FR-037).
- **D3. Escape in full screen.** The browser's. The room never locks the keyboard, and a second Escape does what Escape does today. Walking's words say so while in full screen (FR-039).
- **D4. What goes full screen.** The page's root, so the AI disclosure, every panel, the resume, the live regions, and "Around the room" stay with it (FR-038).
- **D5. The resume.** It opens over the room as an opaque panel, or as a sheet on small windows (FR-027).
- **D6. The stacked layout.** Below the HUD's minimum, the room becomes a block and the panels flow below it (FR-007).
- **D7. The pixel cap.** One figure per quality level, set from lookdev's runs and recorded in the plan (FR-011).
- **D8. Motion and the blur.** Re-frames are always immediate. Panel transitions take at most 200 ms, and none under reduced motion. The blur is off from quality level 2 (FR-025, FR-047).
- **D9. `flat-failed`'s words.** "This drawing of the room could not be shown. The list of things in the room still works." (FR-004; Amendment H14).
- **D10. The control's place.** In the toolbar, after "Pause the room". Where that would add a toolbar row on a 320 × 568 window, the plan may put it beside the walking control in the clear area, reserved by RG6 (FR-036, FR-055).
- **D11. The live faces on large windows.** Their canvases keep spec 004's FR-054 size at the reference stages: no extra texture memory, and possibly softer beyond the reference desktop. On a no, a desktop's faces may grow with the window, within a texture-memory budget of their own that the plan sets (FR-056).
