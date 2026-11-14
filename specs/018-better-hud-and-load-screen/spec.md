# Feature Specification: A Better HUD, From the Author's Examples, and a Load Screen to Match

**Feature Branch**: `night/hud-spec/spec-018` (this spec's first documents), first of the night's linear stack of 2026-11-13; the implementation is `night/impl-018/impl-018`, and this rework is `night/rework-spec-018/rework-spec-018`, from impl-018's tip (b9378980). Each later item's branch starts from the previous item's tip ([plan.md](plan.md) §12). Based on `main` at 3c0e4cd0.

**Created**: 2026-11-14 · **Reworked**: 2026-11-14, by rule 6 of the Author's orders (the Opus re-reviews rv-spec-018 and rv2-impl-018, both blocking).

**Status**: Clarified provisionally, planned, and tasked under the order's rule 1 ([plan.md](plan.md) and [tasks.md](tasks.md) open with the line and his words). Written from the intent in this folder, `Status: draft`: his answer on the decision page accepts it or corrects it. Q1 to Q5 and D1 to D8 took their recommended answers; Q53 to Q60, raised by the reviews, are recorded on the night's page as "Answered: recommended, the Author 2026-11-13", and this rework writes them in (Clarifications, below). The rework's own questions, R1 to R7, are on the morning page with their recommended answers, taken here. An overturned answer is reworked before he merges.

**Input**: [`intent/018-better-hud-and-load-screen.md`](../../intent/018-better-hud-and-load-screen.md) (`Status: draft`; it moves here as `intent.md` when he accepts it): the Author's words of 2026-11-13 and the supervisor's description of his two example screenshots. **This session did not see the screenshots**: they stay in `~/night-inputs/hud/`, outside the repository and out of the night-shift container's reach, because the art and branding aren't ours. This spec works from the supervisor's description alone, which is not his words, and says so wherever it leans on it. Also read: the [constitution](../../.specify/memory/constitution.md) 1.0.1 and `CLAUDE.md`; [spec 005](../005-full-window-room/spec.md) (its Q1 answer, FR-019 to FR-022, FR-028, FR-045, FR-054), [spec 014](../014-room-after-the-demo/spec.md) (its Clarifications' framing answer, FR-009 to FR-019, FR-022, Amendment W19), [spec 012](../012-loading-screen/spec.md) (the loader) and its [loading-progress contract](../012-loading-screen/contracts/loading-progress.md), [spec 016](../016-the-twins-own-avatar/spec.md) (the twin's still); [ADR 0043](../../docs/adr/0043-the-room-fills-the-window.md) (proposed); the [data-flow disclosure](../../docs/data-flow-disclosure.md), row V1; and the room's code at impl-018's tip: `apps/web/src/room/compose/{hud.ts,frame.ts,stages.ts}`, `layout.ts`, `app.ts`, `flat.ts` (`fetchStill`), `hud/{split.ts,split.css,frame.ts,keycap.ts,stats.ts,icons.ts}`, `src/talk/talk.ts`, `fullscreen.ts` (`browserOwnsEscape`), `loading/{view.ts,loading.css}`, `room/ui-words.yaml`, and the tests under `test/ui/hud-*`, `test/room/{hud-split-geometry,frame,stages,legacy-stages}.test.ts`, and `test/ui/hud-model.{ts,test.ts}`. **Spec 011 is not this**: it is the alert messages (Telegram and email), and shares only the word "design"; nothing here amends it. Spec 012 is: its loader is restyled here.

Summary: on a wide landscape window, the room's HUD takes the placement and patterns of his two examples. **The conversation on the left**: at rest, one row at the left of the bottom bar; when a conversation runs, a translucent dark panel over the scene's left, with a soft, rough-edged frame, a title above it, one action hint at its top-right, the open piece's icon and a row of three stats at its top-left, the twin's words as body text, and the twin's still at its right edge, overlapping the frame. **Choosing on the right**: a right-aligned list under a small capitals label ("Select a piece"), "Back" at its top-right, the selected entry larger and in the accent colour between two hand-drawn strokes with the confirm key cap at its right, the others muted. Everything is the room's own: its type (Patrick Hand, IBM Plex), its colours, and glyphs and strokes drawn in code. The loader takes the same frame and type. A window takes this **split layout** only where the open panel still leaves the scene spec 005's least clear area, 304 × 196, and the HUD at rest covers at most a quarter of it. At the compositor's metrics that is from 1392 pixels wide (87rem). 1280 × 720 and phones keep today's column, dock, and stacked layouts. The clear area, the room's frame, and every stage the compositor checks stay the column layout's. The only byte that moves is the twin's still, same-origin and verified, now also fetched in 3D (row V1). Cloud cost: $0.

## Clarifications

### Session 2026-11-14 (`/speckit-clarify`), provisional

Taken provisionally by the spec-writer under the order's rule 1, which is the supervisor's statement of his order and not his words: the spec-writer takes the recommended answer at clarify and at the plan. His words that the rule rests on are quoted at the top of [plan.md](plan.md). The questions are under Questions, below, and each is on the morning page with its recommended answer. He confirms or overturns each there.

- **Q1** (which "choosing" is the right-hand list) → A (recommended): the room's "In the room" list, its entries the selectable pieces and "the resume". The door's choice screen stays as spec 012's Q3 left it.
- **Q2** (how much of the left half the conversation takes, and when) → A: on a window that takes the split layout, the conversation is a compact rest row when no conversation runs: its title and the text box row, never collapsed, as spec 005's FR-022 requires. It opens to the full panel when a conversation starts; "Back" closes it to the rest row. *Rework*: the rest row now sits at the bottom bar's left, outside the clear area (FR-004; R2).
- **Q3** (what the emblem and three stats show) → A: the emblem is the open piece's icon; the stats are the room's own facts: SERVING (the tier), THIS CALL, and THIS VISIT (the cost signals). Nothing about the Author.
- **Q4** (the speaking character) → A: the twin's still (spec 016) at the panel's right edge, with the stand-in line kept; a flat silhouette where the still isn't there.
- **Q5** (which windows get the new placement) → A as taken was "landscape windows at least 48rem wide". **Superseded by Q57's answer** (below): at 48rem (768 px), the 40rem-or-half panel leaves 76.8 px of a 460.8 px clear area. impl-018's code capped the panel at the walking control's corner, which left 144 px, all of it that corner (0.5rem + 8rem + 0.5rem), so the scene beside the panel was 0.
- **D1 to D8** (below): taken as written.

### Session 2026-11-14, rule 6's rework: Q53 to Q60, recorded on the night's page as "Answered: recommended, the Author 2026-11-13"

Each answer below is the recommended answer from the night's page (`docs/night-shift/2026-11-13.md` on `night/supervisor/2026-11-13`). The recommendations are the workers' words, not his. His word is "recommended", recorded by the supervisor. This rework's reading is under each answer.

- **Q53** (is the split layout a refinement of the column layout, plan.md's D-I1?) → "yes: spec 005's and 014's pinned tests and the compositor's stage checks stay valid, `data-split="on"` rides beside `data-hud="column"`". Reading: `layoutFor` and `HudLayout` stay as they are. The bands, the clear area, the frame area's ease, and the supported stages stay the column layout's at every window. That is why the rest row moves out of the clear area (FR-004).
- **Q54** (the panel opens from the bar by "Larger conversation", and "Smaller" closes it, D-I2) → "yes, keep D-I2, since spec 005's tests pin the title as the log's collapse". Reading: FR-006.
- **Q55** (amending `test/ui/hud-look.test.ts` to skip the list's entries and the conversation's title where `data-split="on"`, D-I3) → "accept the amendment; it is the narrowest change, recorded as D-I3, and every other control still has to be a tile". Reading: a departure from spec 014's FR-022 in the split layout, named under Amendments.
- **Q56** (does `aria-current` follow hover?) → "keep it as FR-008 and FR-016 say for now, and revisit after a screen-reader pass at the morning look". Reading: FR-008 and FR-016 unchanged.
- **Q57** (does the split layout replace his spec 005 answer, "Bottom bar, plus one column on the right", on wide landscape windows?) → "yes, on landscape windows wide enough to keep the 304 × 196 clear area with the panel (about 83rem and up); narrower windows keep the column and dock as today". Reading: FR-001 (c). The "about 83rem" took the right-hand band to be the list's 24rem. Under D-I1 (Q53) the band stays the column's 28rem, so the computed bound is 87rem: 1392 px at a 16-pixel root (R1). The reversal is named under Amendments.
- **Q58** (does spec 014's cap, the always-on HUD at most 25% of a desktop window, hold for the split layout?) → "yes at rest (the conversation's rest row plus the list sized to its entries), and not while the conversation panel is open, as the larger conversation view is exempt today". Reading: FR-001 (e) and FR-004. The list is counted at its table height, 22rem, the most its entries take (plan §2).
- **Q59** (should the room reframe when the panel opens?) → "no; the open panel lies over the scene like the larger view (spec 005's FR-028), the clear area and frame stay the at-rest ones, every piece stays reachable from the list, and D-I1 and FR-004's wording say so". Reading: FR-004 and FR-006, and spec 014's framing answer amended by name.
- **Q60** (the emblem: the open piece's icon or one fixed glyph?) → "the open piece's icon from the room's `hud/icons.ts`, with the fixed speech glyph only for free talk, as Q3 was answered". Reading: FR-005.
- **R1 to R7**: this rework's own questions, each taken at its recommended answer (Questions, below).

## Source: The Author's Words

> "better HUD with examples provided, and load screen"
> "I will give you the examples of the HUD and placement of the interface layout"

His answer to spec 005's Q1, which this spec departs from on the windows that take the split layout (Amendments):

> "Bottom bar, plus one column on the right"

Reading: "better HUD" is User Stories 1 and 2. "examples provided" are the two screenshots, which this session hasn't seen; the description is the supervisor's. "placement of the interface layout" is FR-001 to FR-004, the left/right placement. "load screen" is User Story 3. "it's okay that we use the likeness of my dog" belongs to item d, not this one. His order on the night shapes [tasks.md](tasks.md): "keep going beyond the plan and approval and finish implementation … small tests that can be run instead of the whole suite".

## User Scenarios & Testing *(mandatory)*

Users: visitors on a window from 320 px to a large monitor, by pointer, touch, keyboard, and screen reader, with or without reduced motion, transparency, or more contrast; and the Author, who judges the look. **The degraded mode is User Story 4 and ships first** (Principle I).

### User Story 1 - The Conversation on the Left (Priority: P1)

As a visitor on a wide window, I want the conversation in a panel on the left, like the game's, so the twin's words read as a scene and the room stays visible on the right.

**Independent Test**: In jsdom at 1920 × 1080, start a conversation. The panel has the title, the hint, the emblem, the three stats, the body, and the portrait. Its box is within the left half. The scene beside it is at least 304 × 196. The list's box and the walking control are clear of it.

**Acceptance Scenarios**:
1. **Given** a window 1920 × 1080 and no conversation, **When** the room opens, **Then** the bottom bar's left shows the conversation's rest row: the title, the "Larger conversation" toggle, and the text box row (label, text box, Send, the talk button). There is no frame, no stats, and no portrait.
2. **Given** the visitor picks a piece, or sends a turn with no piece open, **When** the conversation starts, **Then** the panel opens over the scene's left. It has a title above it, "Close" with its Esc key cap at its top-right, the emblem and the three stats at its top-left, the log as body text in its left two-thirds, the twin's still at its right edge overlapping the frame, and the rest row as its foot, inside the same frame. The room isn't re-framed (Q59).
3. **Given** the panel is open and a turn is out, **When** the twin's words arrive, **Then** they show as plain text in the body, as spec 007's FR-035 says, and focus stays where it was.
4. **Given** the panel is open, **When** the visitor presses Escape and nothing earlier in FR-009's order takes it, **Then** the panel closes to the rest row and focus returns to the control that opened it (spec 005's FR-045).

### User Story 2 - Choosing on the Right (Priority: P1)

As a visitor, I want a right-aligned list of what I can talk about, the chosen entry standing out, so choosing feels like a menu.

**Independent Test**: In jsdom at 1920 × 1080, the list's entries are right-aligned buttons under "Select a piece". The selected entry (focused, hovered, or the open piece) is larger and in the accent colour, with the two strokes and the confirm key cap. Enter opens the piece.

**Acceptance Scenarios**:
1. **Given** the room at rest, **When** it is drawn, **Then** the right shows the label "Select a piece", then the entries with generous spacing, muted off-white, right-aligned on one edge.
2. **Given** focus or the pointer is on an entry, **When** it is the selected one, **Then** it is larger and in the accent colour, with a stroke above, one below, and the confirm key cap, "Enter", to its right. No other entry moves.
3. **Given** the panel is open, **When** the visitor presses "Back" at the list's top-right, **Then** it closes the panel as Escape does (User Story 1, scenario 4).
4. **Given** a touch device, **When** an entry is tapped, **Then** it opens the piece at once (one tap), the key caps being labels there.

### User Story 3 - A Load Screen in the Same Style (Priority: P2)

As a visitor, I want the loader to look like it belongs to the same game.

**Independent Test**: Spec 012's loader tests still pass, their behaviour unchanged. The card is in the panel's frame, with the title and the Patrick Hand type, and its hint is the body text.

**Acceptance Scenarios**:
1. **Given** "Enter", **When** the loader shows, **Then** it takes the panel's frame, title, and type, in the same colours, with spec 012's bar, percentage, stage line, and hint rotation, and its ceiling and giving way unchanged.
2. **Given** reduced transparency or more contrast, **When** it shows, **Then** it is opaque, as spec 012's FR-008 says.

### User Story 4 - Other Windows and Failures Keep Working (Priority: P1)

**Independent Test**: At 1280 × 720, 844 × 390, 768 × 1024, 700 × 500, 320 × 568, and with the frame's drawing failing, the column, dock, or stacked layout shows exactly as before spec 018, every panel reachable.

**Acceptance Scenarios**:
1. **Given** a window that doesn't take the split layout (FR-001), **When** the room opens, **Then** today's layout shows, unchanged, with `data-split="off"`.
2. **Given** the rough frame can't be drawn (SVG unsupported, a script error in the decoration), **When** the panel shows, **Then** a plain 1 px border stands in and every control works.
3. **Given** the twin's still failed to load, **When** the panel shows, **Then** the silhouette stands in, and the stand-in line shows as spec 009 requires.

### User Story 5 - Every Visitor Can Use It (Priority: P1)

Keyboard, screen reader, reduced motion, forced colours, 200% zoom, and text spacing: the Tab order is the toolbar, the list, then the conversation (spec 005), whatever their place on screen. The list is a group of buttons, as today. The decorative strokes, the frame, the emblem, the portrait, and the key caps are hidden from assistive technology. The selected entry says so with `aria-current`.

### Edge Cases

- A window resized across the split layout's bound while the panel is open: the room re-lays out and keeps the conversation's log and the text box's text. A conversation that starts where the split layout isn't taken leaves the panel closed for a later, wider window (D-I5).
- The soft keyboard: the rest row, and the open panel's foot, stay above its inset, as the column's text box row does (spec 005's keyboard handling; rv2-impl-018's B1).
- The 3D room behind: the rest row, the list, and the walking control lie outside the clear area. So the frame area eases against them, as spec 014 eases against the column. The open panel lies over the scene's left like the larger view and never re-frames the room (Q59). A piece or figure under it stays reachable from the list.
- Many entries: the list scrolls inside itself; its label and "Back" stay.
- A long answer: the body scrolls inside the panel; the stats and the foot stay.
- The twin's still and the dog (a later item): the portrait is a slot keyed by the speaker, so item d adds the dog's without rework.
- 200% zoom: a 1920 × 1080 window at 200% is 960 × 540 CSS pixels, which doesn't take the split layout; the column or dock layout reflows as spec 005 requires.

## Requirements *(mandatory)*

Terms: **the split layout**: the refinement of the column layout that FR-001 selects (D-I1, Q53); **the panel**: the conversation's open panel; **the rest row**: the conversation's form at rest in the split layout; **the list**: the selectable entries; **the frame**: the panel's soft, rough-edged border; **a key cap**: a drawn glyph of a key's name, `Esc` or `Enter`, beside a label; **the floor**: spec 005's least clear area, `HUD_PLACEMENTS.minimum`, 304 × 196 CSS pixels; **the scene beside the panel**: the part of the clear area to the panel's right, as wide as the clear area less the panel and as tall as the clear area.

**Degraded mode**
- **FR-001**: THE ROOM SHALL use the split layout exactly where (a) the window takes the column layout and holds its HUD (`layoutFor` is "column", `fitsHud` is true); (b) the panel of FR-004 is at least 18rem wide and 14rem tall; (c) the scene beside the panel is at least the floor (Q57); (d) the rest row is at least as wide as its contents' least width, `split.rest.minRem`, the layout model's finding (plan §2); and (e) the always-on interface at rest, as FR-004 places it, covers at most 25% of the window (Q58). Elsewhere it SHALL use today's column, dock, or stacked layout, unchanged. The rule is computed from the table, not a width bound. At the compositor's metrics it holds from 1392 px wide at every aspect from 4:3 to 16:9, the bound (c) gives: 68rem plus 304 px, 87rem (R1). On wider, shorter windows (e) binds first: at 21:9 the split starts at 1530 × 656. The windows named in the review:

  | Window | Layout | Why (FR-004's boxes at the compositor's metrics) |
  |---|---|---|
  | 1280 × 720 | column, as today | clear area 832 × 640.5; a 40rem panel leaves 192 × 640.5 beside it, under the floor |
  | 1920 × 1080 | **split** | clear area 1472 × 1000.5; panel 640 × 918.5 at (0, 109.5); scene beside it 832 × 1000.5; at rest 12.1% covered |
  | 844 × 390 | column, as today | clear area 506.4 × 310.5; a half-window panel, 422, leaves 84.4; even an 18rem one leaves 218.4, under the floor |
  | 768 × 432 (48rem) | column, as today | clear area 460.8 × 352.5; impl-018's panel, 316.8 wide, left 144 px, all of it the walking control's corner, so the scene beside it was 0 |
  | 1366 × 768 | column, as today | the panel leaves 278 × 688.5 |
  | 1392 × 783 | **split** | the panel leaves 304 × 703.5; at rest 23.0% covered |
  | 1920 × 1200 | **split** | panel 640 × 1038.5; the scene beside it 832 × 1120.5; at rest 10.9% covered |

- **FR-002**: IF anything of the split layout's decoration fails (frame, strokes, portrait, key caps, emblem), THEN THE ROOM SHALL show the plain forms: a 1 px border, no strokes, the silhouette, text labels, no emblem. Every control SHALL work.
- **FR-003**: THE HUD SHALL make no request, call no model, and store nothing for this feature, apart from the twin's still. The still is the same-origin file spec 016 serves, fetched through `flat.ts`'s `fetchStill` with its integrity (D-I4). Before spec 018 the room fetched it only in a visit that shows the 2D room. Now it is also fetched **in a 3D visit, when the panel first opens in the split layout**. Disclosure row V1's **Carries** SHALL say so, in the same change as the code (Data-Flow Disclosure Entries).

**Placement**
- **FR-004**: IN the split layout, at a window's metrics (`rem`, safe areas), with `clear` the column layout's clear area, `band` its column, and `bar` its bar (unchanged, D-I1):
  - the panel SHALL be at `clear.x`, from the notes' reserve's foot to the clear area's foot, at most 40rem wide and at most half the window less `clear.x`;
  - the rest row SHALL be in the bar's band at its left: from `safe.left`, as tall as the bar, as wide as the panel, and short of the bar's tile cluster by 0.25rem. While the panel is open, the rest row is its foot, inside the frame;
  - the list SHALL be in the band's right 24rem, from the strip down, at most 22rem tall, and ending 0.25rem above the walking control;
  - the walking control SHALL be at the band's foot, at its right, 0.25rem in from each. With the column's content moved out, that is where W19 put it, the column's head;
  - the clear area, the frame area, and the stages SHALL be the column layout's (Q53, Q59). The open panel lies over the scene and never re-frames the room, like spec 005's larger view (FR-028). The notes' reserve stays above the panel.
  `compactBoxes` SHALL give these boxes as the always-on interface at rest: the strip, the bar's cluster, the rest row, the list, and the walking control. So the frame area, the stages' reserved boxes, and the coverage take them through the one kernel function, as spec 014's FR-016 requires.
- **FR-005**: THE PANEL SHALL hold, in order: a title at the top-left, above the frame's content (ui word `hud.log_toggle`, "Conversation"); one action hint at the top-right, a key cap and a short label; inside the frame at its top-left the emblem, the open piece's icon from `hud/icons.ts`, or the fixed speech glyph in free talk and for a piece with no icon yet (Q60; `hud/icons.ts` has none of either at impl-018's tip, so they are drawn in code like its others, keyed by the selectable's id, R6); beside it the row of three stats, each a small capitals label over a large value; below them the body, within the frame's left two-thirds; and the rest row as its foot. The twin's still SHALL stand at the frame's right edge, overlapping it (Q4), never covering the body or a control.
- **FR-006**: THE CONVERSATION SHALL be the rest row at rest. The panel SHALL open when a conversation starts: a piece chosen from the list or the scene, or a turn sent, free talk included. It SHALL also open when a line arrives in the log, or when "Larger conversation" is pressed (D-I2, Q54). It SHALL close by "Back", the hint, Escape (FR-009), or "Smaller conversation". The text box SHALL never be collapsed (spec 005's FR-022). The rest row and the open panel's foot SHALL stay above the soft keyboard's inset.
- **FR-007**: THE LIST SHALL be right-aligned on one edge: "Back" with its key cap at its top-right, shown while the panel is open; a small capitals label, "Select a piece", above the entries; the entries muted off-white with generous spacing.
- **FR-008**: THE SELECTED ENTRY (the one focused, else hovered, else the open piece) SHALL be larger and in the accent colour, with a hand-drawn stroke above and below and the confirm key cap to its right. The rows SHALL keep their size, so no entry moves when the selection does (Q56: hover kept).
- **FR-009**: ESCAPE SHALL be taken in this order, and only the first that applies acts:
  1. an event whose default is already prevented (`defaultPrevented`) is left alone;
  2. in full screen, the browser owns Escape (`browserOwnsEscape`) and nothing in the room acts (spec 005's FR-039);
  3. a turn out stops (`talk.ts`);
  4. the walking view ends (spec 008);
  5. the resume, while open, closes (spec 005);
  6. the larger view, where the conversation holds focus, ends, and the panel closes with it (`talk.ts`, D-I5);
  7. else, with the panel open, the panel closes to the rest row.
  "Back" and the hint do what step 7 does. Focus SHALL then go where spec 005's FR-045 sends it, which this spec follows: back to the control that opened the panel. That is the list's entry where a piece opened it, "Larger conversation" where that did, and the text box where a sent turn or an arriving line did. Where that control is gone or hidden, focus goes to the list's selected entry. The log SHALL be kept (D1).
- **FR-010**: THE STATS SHALL be: SERVING, the tier's short word (spec 005's tier signal); THIS CALL and THIS VISIT, the cost signals' amounts as the neon sign says them (`sign.*` words), with their "est." and "at least" forms. A value that isn't known SHALL read "—". THE STATS SHALL say nothing about the Author (Q3).

**Look**
- **FR-011**: THE LOOK SHALL use the room's own art: Patrick Hand for the title, the stats' labels, and the selected entry; IBM Plex Sans for the body; IBM Plex Mono for the stats' values (`--figure-font`); the HUD's glass (`--glass`), `--hud-text`, and the accent colour. It SHALL use no image, font, or colour from the examples (D4).
- **FR-012**: THE FRAME and THE STROKES SHALL be drawn in code, as inline SVG from a seeded, deterministic path generator, with no raster image and no file. The frame is a rough-edged rounded rectangle, and the strokes are two brush lines (D3, D6).
- **FR-013**: THE KEY CAPS SHALL be drawn in code (a small rounded box with the key's name), never a gamepad button, and never an image from the examples (D2).
- **FR-014**: EVERY TEXT SHALL meet 4.5:1 over the glass behind it, at the darkest and lightest scene behind, tested as spec 012's `loading-contrast` test is. That includes the open panel's title row, which SHALL have the panel's glass behind it (rv2-impl-018's B2). The accent entry SHALL meet 3:1 as large text, and 4.5:1 where it is not large.

**Loader**
- **FR-015**: THE LOADER SHALL take the panel's frame, title, and type (D5). Its bar, percentage, stage line, hints, ceiling, tints, and giving way SHALL be spec 012's, unchanged.

**Accessibility and motion**
- **FR-016**: THE TAB ORDER SHALL stay spec 005's: toolbar, the list, the conversation. The list stays a group of buttons. The selected entry SHALL carry `aria-current="true"`. The frame, strokes, emblem, portrait, and key caps SHALL be `aria-hidden`, and the key caps' names SHALL be in the buttons' accessible names ("Back, Escape").
- **FR-017**: THE PANEL'S OPENING and THE STROKES' DRAWING SHALL be a fade, or nothing under reduced motion, never a movement. The focus ring SHALL be the HUD's yellow (`--hud-focus`).
- **FR-018**: THE LAYOUT SHALL reflow with no clipped text at 200% zoom and with WCAG 1.4.12's text spacing, as spec 012's FR-043 requires.

**Telemetry and cost**
- **FR-019**: THE SPLIT LAYOUT SHALL add no span and no event: it is presentation, and every number it shows is a signal the room already has. Nothing is added to an existing event either (D7; Assumptions name the deviation).

## Success Criteria

- **SC-001**: The split layout's geometry test passes over the whole sweep. Every window that takes the split layout meets FR-001 (a) to (e). Every window that doesn't has the column layout's boxes. At 1392 × 783, 1920 × 1080, 1920 × 1200, and 2560 × 1440 the boxes are FR-004's. The panel is within the left half. The scene beside it is at least the floor. The rest row is in the bar's band, clear of the tile cluster. The list and the walking control are in the band and clear of each other. None of them overlaps the strip or the notes' reserve. At 1280 × 720, 1366 × 768, 844 × 390, and 768 × 432, `splitBoxes` is null.
- **SC-002**: Spec 012's loader tests, and spec 005's and 014's HUD, frame, and stage tests, pass with no change to their expectations, except the ones the plan's §13 names, each with what it holds: in spec 014's `test/room/frame.test.ts`, two cases measured from the list's box at 1920 × 1200 (and at a 20-pixel root); in spec 014's `test/room/hud.test.ts`, the count of boxes at rest and W19's place where the split layout holds (FR-004, H-8); and spec 014's `test/room/__snapshots__/protect.test.ts.snap`, re-recorded at 1920 × 1200.
- **SC-003**: The contrast test passes for every text in the panel (its title row included), the rest row, the list, and the loader (FR-014).
- **SC-004**: axe finds no violation in the split layout, open and at rest.
- **SC-005**: The Author's look approval, at the morning: his, not a test (D7).

## Amendments

Each amends an accepted spec by name. [ADR 0043](../../docs/adr/0043-the-room-fills-the-window.md), which records spec 005's placements, is proposed, so no accepted ADR is reversed and none is needed here. The stack's note records the change for his merge.

| # | Amends | Change | By |
|---|---|---|---|
| H-1 | **Spec 005, its Q1 answer**, the Author's "Bottom bar, plus one column on the right", as FR-019 and FR-020 build it | **Reversed in part, on the windows that take the split layout** (FR-001: from 1392 px at the compositor's metrics). There, the conversation leaves the right column. At rest it is one row at the bottom bar's left, and open it is a panel over the scene's left. The column's band keeps only the list and the walking control. The bottom bar stays at the foot, and the strip at the top. On every other window his answer stands as spec 005 and spec 014 built it. | Q57's answer |
| H-2 | Spec 005, FR-019 (the layouts) and FR-020 (the one table) | The table gains `split`, a refinement of the column layout. `layoutFor` and `HudLayout` are unchanged (D-I1). FR-020's "every panel starts open" holds with the conversation's rest row as its resting form, and FR-022 holds (FR-006). | Q53 |
| H-3 | Spec 005, FR-028 (the larger view) | In the split layout, "Larger conversation" opens the panel and "Smaller conversation" closes it (D-I2). The panel reaches at most half the window's width, FR-028's own bound in the column layout. Like the larger view, it opens only when asked or when a conversation starts (FR-006), and never re-frames the room. | Q54, Q59 |
| H-4 | Spec 005, FR-045 (focus) | Followed, not amended. Closing the panel returns focus to the control that opened it (FR-009). Spec 018's first FR-009, focus always to the selected entry, is withdrawn. | this rework |
| H-5 | **Spec 005, FR-054** ("the stage in the room's opening panel state SHALL be at least today's stage … THE REFERENCE STAGES … SHALL become those screens' clear areas") | Its floor and its reference stages hold as written. The clear area and the stages are the column layout's at every window (FR-004), so the reference desktop's stage stays 1472 × 1120.5. The amendment: **the split layout's open panel is not a panel state FR-054 counts**, as the larger view isn't. What the open panel leaves of the clear area is held to spec 005's own floor instead, 304 × 196 (FR-001 (c)). | Q57, Q59 |
| H-6 | **Spec 014, its framing answer** ("framed into the whole window, eased back toward spec 005's clear area only as far as it must so that no pressable piece and neither figure lies under a panel; never smaller than spec 005's frame") and FR-009 | In the split layout, "a panel" there means the HUD boxes at rest that FR-004 gives: the strip, the bar's cluster, the rest row, the list, and the walking control. The frame area eases against them. **The open conversation panel is not one.** It lies over the scene and never re-frames the room, so a piece or figure may be under it while it is open, reachable from the list. "Never smaller than spec 005's frame" holds, since the clear area is unchanged. | Q59 |
| H-7 | **Spec 014, FR-019** (the always-on interface at most 25% of every landscape window from 1280 × 720 to 3840 × 2160 in the column layout) | In the split layout the always-on interface is the union of the strip, the bar's cluster, the rest row, the list at its table height, the walking control, and the notes' reserve. The cap holds at rest and is part of FR-001's rule (e), so a window where it wouldn't hold keeps the column layout. The open panel is not counted, as the larger view isn't (spec 014's definition of the always-on interface). | Q58 |
| H-8 | Spec 014, FR-017 and Amendment W19 (the compact clusters; the walking control at the column's head) | In the split layout the column's compact box isn't shown. The list stands at the band's top right, and the walking control at the band's foot, at its right: the column's head with the column's content moved out. Spec 014's `test/room/hud.test.ts` (the count at rest, W19's place) and `protect.test.ts`'s snapshot are amended to match (plan.md D-R4, §13). | R3; Q94 |
| H-9 | Spec 014, FR-022 (every HUD control a tile) | Departed from in the split layout, for the list's entries and the conversation's title, which are text on the glass (FR-007, FR-008). The departure is recorded as plan.md's D-I3, `test/ui/hud-look.test.ts` skips exactly those, and every other control is still a tile. | Q55 |
| H-10 | Spec 012, the card's look | The card takes the panel's frame, title, and type (FR-015). Its behaviour and its Amendments L1 to L10 stand. | D5 |
| H-11 | Data-flow disclosure, row V1 | **Carries** gains the still in a 3D visit, when the split layout's panel first opens (FR-003). | FR-003 |

## Assumptions

- The two screenshots are as the supervisor describes them; the spec doesn't claim to have seen them. Where his images differ from that description, his word wins and the spec is reworked.
- D1 to D8:
  - **D1**: Back keeps the log. The panel opens again by a conversation, a line, or "Larger conversation" (FR-006).
  - **D2**: key caps, not gamepad glyphs: the room's inputs are the keyboard, the pointer, and touch; the examples' glyphs are another game's.
  - **D3**: hand-drawn strokes are our own SVG brush lines (two seeded paths in the accent colour), decorative.
  - **D4**: type: Patrick Hand for the display words, IBM Plex for the rest; colours from `room.css`'s variables; no new font file.
  - **D5**: the loader keeps its card and its place; it takes the frame, title, and type.
  - **D6**: the frame's rough edge is a path from a seeded generator in `src/room/hud/frame.ts`, not an SVG filter, so it is deterministic and testable.
  - **D7**: no new telemetry. The look is approved by the Author at the morning, from the dev-cpu stack's screenshots (`make up ENV=dev-cpu`). The approval is his.
  - **D8**: nothing about the Author, the dog, or the dinosaur is in this item.
- **Deviations from the constitution, named**:
  - **Principle II** ("telemetry that makes it observable in production, a cost estimate and a cost measurement"). The split layout adds no telemetry and measures no cost. It is presentation with no endpoint and no model call, and it spends nothing to measure: the estimate is $0 cloud (Expected Cost Impact). The tests, the review, and the Author's look are its proof. Whether the split layout is used in production is not observable. If he wants it to be, it needs a new usage event's kind and a disclosure row V4 entry, which this item does not add.
  - **Development Workflow, step 7** ("dashboards, alerts, and control bands updated in the same PR as the feature. A feature without a graph is not done."). No dashboard panel and no band change. There is no number to graph without the telemetry above. CLAUDE.md's "telemetry span, dashboard panel" for a new feature is the same deviation.
- No corpus change and no human-only path change, so no patch for the Author's hand. `docs/data-flow-disclosure.md` is not a human-only path; its row V1 changes with the code (FR-003).

## Expected Cost Impact

$0 cloud. Dev-time model spend: the night's spec-writer, implementer, and reviewer sessions, a few dollars. No new request. The still is spec 016's existing file, now also fetched once in a 3D visit when the panel first opens (FR-003). It is about the size of one room texture, and same-origin.

## Degraded-Mode Behavior

| Failure | Behaviour |
|---|---|
| Window that doesn't meet FR-001 | Today's column, dock, or stacked layout, `data-split="off"` |
| Frame or strokes can't be drawn | A 1 px border; no strokes (FR-002) |
| The twin's still fails, is refused by its integrity, or isn't served | The silhouette; the stand-in line shows (US4) |
| Local tier off, budget spent, kill switch unknown | The panel behaves as at any time; the stats read "—" or their tier words |
| Reduced transparency, more contrast, forced colours | Opaque panel, system colours, a visible border |
| Soft keyboard open | The rest row and the panel's foot above its inset (FR-006) |

## Telemetry and the Dashboard

None new (D7). The room's existing usage events and dashboard panels stand. The deviation is named in Assumptions (Principle II; Workflow step 7).

## Data-Flow Disclosure Entries

One amendment, to row V1 (H-11). No new destination: the still is served from the site's own origin, as spec 016 already discloses. What changes is when it is fetched. Row V1's **Carries** reads "the twin's still in a visit that shows the 2D room". It SHALL read: "the twin's still in a visit that shows the 2D room, or, in a 3D visit, once, when the conversation panel first opens in the split layout (spec 018)".

## Constitution Check

- **I** (data-local): one byte moves that didn't before in a 3D visit, the still, same-origin and disclosed (FR-003). **II**: tests per FR, listed in tasks.md; no model-driven behaviour, so no eval; no runbook, since nothing pages; telemetry and a cost measurement deviate, named in Assumptions. **III**: the intent is draft; the spec, plan, and tasks are provisional by the order's rule 1. **IV**: no human-only path touched. **V**: $0. **VI**: the spec is public; the examples aren't, for the stated reason. **VII**: nothing about the Author's work is stated. **VIII**: the twin's stand-in line is kept (FR-005, US4); the panel's title and the disclosure strip are never covered.

## Questions (each on the morning page with its recommended answer)

### Q1: Which "choosing" is the right-hand list?
Recommended: the room's "In the room" list. Others: the door's character choice as well; the door's only.
### Q2: How much of the left half does the conversation take, and when?
Recommended: a rest row when no conversation runs, the full panel once one starts. Others: always the full panel (covers half the room at rest, and conflicts with spec 005's FR-020 intent that the scene be visible); only while a turn is out.
### Q3: What do the emblem and the three stats show?
Recommended: the piece's icon; SERVING, THIS CALL, THIS VISIT. Others: turn count, topic, and corpus file; the Author supplies three.
### Q4: Who is the speaking character, and from what image?
Recommended: the twin's still (spec 016), silhouette fallback. Others: a new 2D portrait drawn by the studio; no portrait.
### Q5: Which windows get the new placement?
Superseded by Q57 (Clarifications).
### R1: Q57's answer said "about 83rem and up"; computed against the column's 28rem band (D-I1), the bound is 87rem (1392 px). Take 87rem?
Recommended: yes. The panel keeps its 40rem-or-half width, and 1280 × 720 and 1366 × 768 keep the column layout. Others: a panel that narrows to keep the floor, from 18rem, which takes the split from about 62rem (996 × 560 at 16:9; 1280 × 720 gets a 33rem panel); narrow the right band to the list's 24rem in the split layout (83rem), which changes the clear area and every stage at those windows.
### R2: The conversation's rest form in the bottom bar's left, one row, instead of impl-018's 7.4rem bar inside the clear area?
Recommended: yes. It keeps the clear area, the frame area, and every stage as they are (Q53, Q59), keeps spec 014's framing answer at rest, and puts the conversation at rest in his "Bottom bar". Others: keep the bar inside the clear area and ease the frame to the clear area less its row (the reference desktop's stage goes from 1472 × 1120.5 to 1472 × 1001.5, and the tests that pin it change); keep it there and accept a piece or a figure under it at rest.
### R3: The walking control in the split layout at the foot of the column's band, at its right?
Recommended: yes: the column's head, where W19 put it, with the column's content moved out; the list ends above it. Others: the clear area's corner, spec 008's place; the column's head computed as if the column's content were there (impl-018's, which puts it under the list at 1366 × 768).
### R4: Spec 014's `test/room/frame.test.ts` measures two cases from the column's compact box at 1920 × 1200, which the split layout no longer shows. Measure them from the list's box there?
Recommended: yes: the same rules (the step k ÷ 16; the 0.5rem margin; 10 px at a 20-pixel root), from the HUD box at the column's place. Others: move those cases to a window without the split, 1280 × 720, with new literal numbers; keep the column's box among the HUD boxes in the split layout although it isn't shown.
### R6: `hud/icons.ts` has no icon for a piece and no speech glyph. Draw one for each of the scene's four pieces (snowboard, bicycle, laptop and screen, chalkboard) and a speech glyph, keyed by the selectable's id, with the speech glyph for any piece without its own?
Recommended: yes: Q60's answer needs them, drawn in code as the HUD's other icons, and a piece added as data shows the speech glyph until its icon is drawn. Others: one glyph per topic (three); the fixed speech glyph for all, Q60's other answer, recorded as a departure.
### R5: On closing the panel, should focus return to the control that opened it (spec 005's FR-045), not always to the list's selected entry?
Recommended: yes, with the selected entry where the opener is gone or hidden. Others: always the selected entry, amending FR-045 by name; always the text box.
### R7: Accept spec 018's named deviations from Principle II and Workflow step 7: no usage event, no dashboard panel, no cost measurement for the split layout?
Recommended: yes: presentation only, $0, no endpoint; the tests, the review, and his look are its proof. Others: a once-a-visit usage event (`split_opened`, no id), a use panel, and a row V4 entry, as three more tasks; a span on the room's existing refit record.
