# Feature Specification: A Better HUD, From the Author's Examples, and a Load Screen to Match

**Feature Branch**: `night/hud-spec/spec-018` (this spec's documents), first of the night's linear stack of 2026-11-13; the implementation continues on the same stack, each later item's branch starting from the previous item's tip ([plan.md](plan.md) §12). Based on `main` at 3c0e4cd0.

**Created**: 2026-11-14

**Status**: Clarified provisionally, planned, and tasked, by the Author's order of 2026-11-13 ([plan.md](plan.md) and [tasks.md](tasks.md) open with the line and his words). Written from the intent in this folder, `Status: draft`: his answer on the decision page accepts it or corrects it. Q1 to Q5 and D1 to D8 each take their recommended answer; each is on the morning page, and an overturned answer is reworked before he merges.

**Input**: [`intent/018-better-hud-and-load-screen.md`](../../intent/018-better-hud-and-load-screen.md) (`Status: draft`; it moves here as `intent.md` when he accepts it): the Author's words of 2026-11-13 and the supervisor's description of his two example screenshots. **This session did not see the screenshots**: they stay in `~/night-inputs/hud/`, outside the repository and not reachable from the night-shift container, because the art and branding aren't ours. This spec works from the supervisor's description alone, which is not his words, and says so wherever it leans on it. Also read: the [constitution](../../.specify/memory/constitution.md) 1.0.1 and `CLAUDE.md`; [spec 005](../005-full-window-room/spec.md) (the HUD, its layouts, FR-019 to FR-022), [spec 014](../014-room-after-the-demo/spec.md) (the compact boxes), [spec 012](../012-loading-screen/spec.md) (the loader) and its [loading-progress contract](../012-loading-screen/contracts/loading-progress.md), [spec 016](../016-the-twins-own-avatar/spec.md) (the twin's still); and the room's code: `apps/web/src/room/layout.ts`, `room.css`, `compose/hud.ts` (`HUD_PLACEMENTS`), `hud/icons.ts`, `loading/{view.ts,loading.css}`, `src/talk/talk.ts`, `flat.ts`, `room/ui-words.yaml`, `src/fonts.css`, and the tests under `test/ui/hud-*.test.ts` and `loading-*.test.ts`. **Spec 011 is not this**: it is the alert messages (Telegram and email), and shares only the word "design"; nothing here amends it. Spec 012 is: its loader is restyled here.

Summary: on a wide landscape window, the room's HUD takes the placement and patterns of his two examples: **the conversation on the left**, a translucent dark panel with a soft, rough-edged frame, a title above it, one action hint at its top-right, a small emblem and a row of three stats at its top-left, the twin's words as body text, and the twin's still standing at its right edge, overlapping the frame; **choosing on the right**, a right-aligned list under a small capitals label ("Select a piece"), "Back" at its top-right, the selected entry larger and in the accent colour between two hand-drawn strokes with the confirm glyph at its right, the others muted. Everything is the room's own: its type (Patrick Hand, IBM Plex), its colours, glyphs and strokes drawn in code. The loader takes the same frame and type. Narrower windows keep today's column, dock, and stacked layouts. No new byte leaves the device. Cloud cost: $0.

## Clarifications

### Session 2026-11-14 (`/speckit-clarify`, provisional)

Taken provisionally by the spec-writer, by the Author's order of 2026-11-13 ("the spec-writer takes the recommended answer at clarify and at the plan"). The questions are under Questions, below, and each is on the morning page with its recommended answer. He confirms or overturns each there.

- **Q1** (which "choosing" is the right-hand list) → A (recommended): the room's "In the room" list, its entries the selectable pieces and "the resume". The door's choice screen stays as spec 012's Q3 left it.
- **Q2** (how much of the left half the conversation takes, and when) → A: on a wide landscape window the panel is a compact conversation bar at rest (title and the text box row, never collapsed, as spec 005's FR-022 requires) and opens to the full left-half panel when a conversation starts; "Back" closes it to the bar.
- **Q3** (what the emblem and three stats show) → A: the emblem is the open piece's icon; the stats are the room's own facts: SERVING (the tier), THIS CALL, and THIS VISIT (the cost signals). Nothing about the Author.
- **Q4** (the speaking character) → A: the twin's still (spec 016) at the panel's right edge, with the stand-in line kept; a flat silhouette where the still isn't there.
- **Q5** (which windows get the new placement) → A: landscape windows at least 48rem wide get it; narrower ones keep the column, dock, and stacked layouts unchanged.
- **D1 to D8** (below): taken as written.

## Source: The Author's Words

> "better HUD with examples provided, and load screen"
> "I will give you the examples of the HUD and placement of the interface layout"

Reading: "better HUD" is User Stories 1 and 2; "examples provided" are the two screenshots (not seen by this session; the description is the supervisor's); "placement of the interface layout" is FR-001 to FR-004, the left/right placement; "load screen" is User Story 3. "it's okay that we use the likeness of my dog" belongs to item d, not this one. His order on the night ("keep going beyond the plan and approval and finish implementation … small tests that can be run instead of the whole suite") shapes [tasks.md](tasks.md).

## User Scenarios & Testing *(mandatory)*

Users: visitors on a window from 320 px to a large monitor, by pointer, touch, keyboard, and screen reader, with or without reduced motion, transparency, or more contrast; and the Author, who judges the look. **The degraded mode is User Story 4 and ships first** (Principle I).

### User Story 1 - The Conversation on the Left (Priority: P1)

As a visitor on a wide window, I want the conversation in a panel on the left, like the game's, so the twin's words read as a scene and the room stays visible on the right.

**Independent Test**: In jsdom at 1280 × 720, start a conversation: the panel has the title, the hint, the emblem, the three stats, the body, and the portrait; its box is within the left half; the list's box and the walking control are clear of it.

**Acceptance Scenarios**:
1. **Given** a window 1280 × 720 and no conversation, **When** the room opens, **Then** the left shows the compact conversation bar: the title and the text box row, Send, and the talk button, and no frame, stats, or portrait.
2. **Given** the visitor picks a piece, **When** the conversation starts, **Then** the panel opens to the left half: a title above it, "Back" with its Esc key cap at its top-right, the emblem and the three stats at its top-left, the log as body text in its left two-thirds, the text box row at its foot, and the twin's still at its right edge, overlapping the frame.
3. **Given** the panel is open and a turn is out, **When** the twin's words arrive, **Then** they show as plain text, as spec 007's FR-035 says, in the body, and focus stays where it was.
4. **Given** the panel is open, **When** the visitor presses Escape (no turn out, not walking), **Then** the panel closes to the bar and focus goes to the list's selected entry.

### User Story 2 - Choosing on the Right (Priority: P1)

As a visitor, I want a right-aligned list of what I can talk about, the chosen entry standing out, so choosing feels like a menu.

**Independent Test**: In jsdom at 1280 × 720, the list's entries are right-aligned buttons under "Select a piece"; the selected entry (focused, hovered, or the open piece) is larger, in the accent colour, with the two strokes and the confirm key cap; arrowing moves it; Enter opens the piece.

**Acceptance Scenarios**:
1. **Given** the room at rest, **When** it is drawn, **Then** the right shows the label "Select a piece", then the entries with generous spacing, muted off-white, right-aligned on one edge.
2. **Given** focus or the pointer is on an entry, **When** it is the selected one, **Then** it is larger and in the accent colour, a stroke above and one below, and the confirm key cap, "Enter", to its right; no other entry moves.
3. **Given** the panel is open, **When** the visitor presses "Back" at the list's top-right, **Then** it does what Escape does (User Story 1, scenario 4).
4. **Given** a touch device, **When** an entry is tapped, **Then** it opens the piece at once (one tap), the key caps being labels there.

### User Story 3 - A Load Screen in the Same Style (Priority: P2)

As a visitor, I want the loader to look like it belongs to the same game.

**Independent Test**: Spec 012's loader tests still pass unchanged in behaviour; the card is in the panel's frame, with the title and the Patrick Hand type; its hint is the body text.

**Acceptance Scenarios**:
1. **Given** "Enter", **When** the loader shows, **Then** it takes the panel's frame, title, and type, in the same colours, with spec 012's bar, percentage, stage line, and hint rotation, and its ceiling and giving way unchanged.
2. **Given** reduced transparency or more contrast, **When** it shows, **Then** it is opaque, as spec 012's FR-008 says.

### User Story 4 - Narrow Windows and Failures Keep Working (Priority: P1)

**Independent Test**: At 768 × 1024 (portrait), 700 × 500 (landscape, under 48rem), 320 × 568, and with the frame's drawing failing, the column, dock, or stacked layout shows exactly as before, every panel reachable.

**Acceptance Scenarios**:
1. **Given** a window narrower than 48rem, or portrait, **When** the room opens, **Then** today's layout shows, unchanged.
2. **Given** the rough frame can't be drawn (SVG filter unsupported, script error in the decoration), **When** the panel shows, **Then** a plain 1 px border stands in and every control works.
3. **Given** the twin's still failed to load, **When** the panel shows, **Then** the silhouette stands in, and the stand-in line shows as spec 009 requires.

### User Story 5 - Every Visitor Can Use It (Priority: P1)

Keyboard, screen reader, reduced motion, forced colours, 200% zoom, and text spacing: the Tab order is the toolbar, the list, then the conversation (spec 005), whatever their place on screen; the list is a group of buttons, as today; decorative strokes, the frame, the emblem, and the portrait are hidden from assistive technology; the selected entry says so with `aria-current`.

### Edge Cases

- A window resized across 48rem while the panel is open: the room re-lays out and keeps the conversation's log and the text box's text.
- The soft-keyboard inset: the panel's text box row stays above it.
- The 3D room behind: the panel and list cover the room's left half and right edge, so the placement keeps the scene's centre clear (FR-004); the walking control and the stage's notes keep their reserves.
- Many entries: the list scrolls inside itself; its label and "Back" stay.
- A long answer: the body scrolls inside the panel; the stats and the foot stay.
- The twin's still and the dog (a later item): the portrait is a slot keyed by the speaker, so item d adds the dog's without rework.

## Requirements *(mandatory)*

Terms: **the split layout**: the new layout of FR-001; **the panel**: the conversation's panel; **the list**: the selectable entries; **the frame**: the panel's soft, rough-edged border; **a key cap**: a drawn glyph of a key's name, `Esc` or `Enter`, beside a label.

**Degraded mode**
- **FR-001**: THE ROOM SHALL use the split layout only where the window is landscape and at least 48rem wide; elsewhere it SHALL use today's column, dock, or stacked layout, unchanged (Q5; spec 005's FR-019 amended).
- **FR-002**: IF anything of the split layout's decoration fails (frame, strokes, portrait, key caps), THEN THE ROOM SHALL show the plain forms: a 1 px border, no strokes, the silhouette, text labels; and every control SHALL work.
- **FR-003**: THE HUD SHALL make no request, call no model, and store nothing for this feature, apart from the twin's still, a same-origin file spec 016 already serves with its integrity.

**Placement**
- **FR-004**: IN the split layout the panel SHALL be on the left, within the left half of the window, at most 40rem wide, and the list on the right, within the right 24rem; the clear area between them is the scene, and the walking control and the stage's notes keep their reserves (spec 005, spec 014).
- **FR-005**: THE PANEL SHALL hold, in order: a title above its frame at the top-left (ui word `hud.log_toggle`, "Conversation"); one action hint at the frame's top-right, a key cap and a short label; inside the frame at its top-left the emblem, and beside it the row of three stats, each a small capitals label over a large value; below them the body, within the frame's left two-thirds; and the text box row at the foot. The twin's still SHALL stand at the frame's right edge, overlapping it (Q4), never covering the body or a control.
- **FR-006**: THE PANEL SHALL be the compact conversation bar at rest, and open to the full panel when a conversation starts; the text box SHALL never be collapsed (spec 005's FR-022; Q2).
- **FR-007**: THE LIST SHALL be right-aligned on one edge: "Back" with its key cap at its top-right, shown while the panel is open; a small capitals label, "Select a piece", above the entries; the entries muted off-white with generous spacing.
- **FR-008**: THE SELECTED ENTRY (the one focused, else hovered, else the open piece) SHALL be larger and in the accent colour, with a hand-drawn stroke above and below and the confirm key cap to its right. The rows SHALL keep their size, so no entry moves when the selection does.
- **FR-009**: "Back", and Escape with no turn out and the room not walking, SHALL close the panel to the bar and move focus to the selected entry; the open conversation's log SHALL be kept (D1).
- **FR-010**: THE STATS SHALL be: SERVING, the tier's short word (spec 005's tier signal); THIS CALL and THIS VISIT, the cost signals' amounts as the neon sign says them (`sign.*` words), with their "est." and "at least" forms; a value that isn't known SHALL read "—". THE STATS SHALL say nothing about the Author (Q3).

**Look**
- **FR-011**: THE LOOK SHALL use the room's own art: Patrick Hand for the title, the stats' labels, and the selected entry; IBM Plex Sans for the body; IBM Plex Mono for the stats' values (`--figure-font`); the HUD's glass (`--glass`), `--hud-text`, and the accent colour; no image, font, or colour from the examples (D4).
- **FR-012**: THE FRAME and THE STROKES SHALL be drawn in code, as inline SVG from a seeded, deterministic path generator (no raster image, no file): the frame a rough-edged rounded rectangle, the strokes two brush lines (D3, D6).
- **FR-013**: THE KEY CAPS SHALL be drawn in code (a small rounded box with the key's name), never a gamepad button, and never an image from the examples (D2).
- **FR-014**: EVERY TEXT SHALL meet 4.5:1 over the panel's glass at its darkest and lightest scene behind, tested as spec 012's `loading-contrast` test is; the accent entry SHALL meet 3:1 as large text, and 4.5:1 where it is not large.

**Loader**
- **FR-015**: THE LOADER SHALL take the panel's frame, title, and type (D5); its bar, percentage, stage line, hints, ceiling, tints, and giving way SHALL be spec 012's, unchanged.

**Accessibility and motion**
- **FR-016**: THE TAB ORDER SHALL stay spec 005's: toolbar, the list, the conversation; the list stays a group of buttons; the selected entry SHALL carry `aria-current="true"`; the frame, strokes, emblem, portrait, and key caps SHALL be `aria-hidden`, and the key caps' names SHALL be in the buttons' accessible names ("Back, Escape").
- **FR-017**: THE PANEL'S OPENING and THE STROKES' DRAWING SHALL be a fade or none under reduced motion, never a movement; the focus ring SHALL be the HUD's yellow (`--hud-focus`).
- **FR-018**: THE LAYOUT SHALL reflow with no clipped text at 200% zoom and with WCAG 1.4.12's text spacing, as spec 012's FR-043 requires.

**Telemetry and cost**
- **FR-019**: THE SPLIT LAYOUT SHALL add no span and no event: it is presentation, and every number it shows is a signal the room already has. Nothing is added to an existing event either (D7; Telemetry, below).

## Success Criteria

- **SC-001**: At 1280 × 720 and 1920 × 1080 the split layout's geometry test passes: the panel's box within the left half, the list's within the right 24rem, none overlapping the other, the notes' reserve, or the walking control.
- **SC-002**: Spec 012's loader tests, and spec 005's and 014's HUD tests for windows under 48rem, pass with no change to their expectations.
- **SC-003**: The contrast test passes for every text in the panel, the list, and the loader (FR-014).
- **SC-004**: axe finds no violation in the split layout, open and at rest.
- **SC-005**: The Author's look approval, at the morning: his, not a test (D7).

## Amendments

- **To spec 005**: FR-019 (the layouts) gains the split layout (FR-001); FR-020's "every panel starts open" holds, with the panel's bar as its resting form; FR-022 holds (FR-006).
- **To spec 012**: the card's look (FR-015); its behaviour and its Amendments L1 to L10 stand.
- **To spec 014**: the compact boxes are used below 48rem only.

## Assumptions

- The two screenshots are as the supervisor describes them; the spec doesn't claim to have seen them. Where his images differ from that description, his word wins and the spec is reworked.
- D1 to D8:
  - **D1**: Back keeps the log; the panel can be re-opened from the bar's "Conversation" title, which is the log's existing toggle (ui word `hud.log_toggle`, `src/talk/talk.ts`), or by picking a piece.
  - **D2**: key caps, not gamepad glyphs: the room's inputs are the keyboard, the pointer, and touch; the examples' glyphs are another game's.
  - **D3**: hand-drawn strokes are our own SVG brush lines (two seeded paths in the accent colour), decorative.
  - **D4**: type: Patrick Hand for the display words, IBM Plex for the rest; colours from `room.css`'s variables; no new font file.
  - **D5**: the loader keeps its card and its place; it takes the frame, title, and type.
  - **D6**: the frame's rough edge is a path from a seeded generator in `src/room/hud/frame.ts`, not an SVG filter, so it is deterministic and testable.
  - **D7**: no new telemetry; the look is approved by the Author at the morning, from the dev-cpu stack's screenshots (`make up ENV=dev-cpu`); the approval is his.
  - **D8**: nothing about the Author, the dog, or the dinosaur is in this item.
- No corpus change; no human-only path change; so no patch for the Author's hand.

## Expected Cost Impact

$0 cloud. Dev-time model spend: one night-shift implementer and one reviewer, order of a few dollars at the local tier. No new request; the still is spec 016's existing file.

## Degraded-Mode Behavior

| Failure | Behaviour |
|---|---|
| Window under 48rem or portrait | Today's column, dock, or stacked layout (FR-001) |
| Frame or strokes can't be drawn | A 1 px border; no strokes (FR-002) |
| The twin's still fails or isn't served | The silhouette; the stand-in line shows (US4) |
| Local tier off, budget spent, kill switch unknown | The panel behaves as at any time; the stats read "—" or their tier words |
| Reduced transparency, more contrast, forced colours | Opaque panel, system colours, a visible border |

## Telemetry and the Dashboard

None new (D7). The room's existing usage events and dashboard panels stand. The deviation from CLAUDE.md's "telemetry span, dashboard panel" for a new feature is named here: it is presentation only, no endpoint, and an unmeasured look has no number to put on a panel.

## Data-Flow Disclosure Entries

None: no byte leaves the visitor's device, and the still is served from the site's own origin as spec 016 already discloses.

## Constitution Check

- **I** (data-local): no new byte. **II**: tests per FR, listed in tasks.md; no model-driven behaviour, so no eval; a runbook isn't needed, nothing pages. **III**: the intent is draft; the spec, plan, and tasks are provisional by order. **IV**: no human-only path touched. **V**: $0. **VI**: the spec is public; the examples aren't, for the stated reason. **VII**: nothing about the Author's work is stated. **VIII**: the twin's stand-in line is kept (FR-005, US4); the panel's title and the disclosure strip are never covered.

## Questions (each on the morning page with its recommended answer)

### Q1: Which "choosing" is the right-hand list?
Recommended: the room's "In the room" list. Others: the door's character choice as well; the door's only.
### Q2: How much of the left half does the conversation take, and when?
Recommended: a bar at rest, the full panel once a conversation starts. Others: always the full panel (covers half the room at rest, and conflicts with spec 005's FR-020 intent that the scene be visible); only while a turn is out.
### Q3: What do the emblem and the three stats show?
Recommended: the piece's icon; SERVING, THIS CALL, THIS VISIT. Others: turn count, topic, and corpus file; the Author supplies three.
### Q4: Who is the speaking character, and from what image?
Recommended: the twin's still (spec 016), silhouette fallback. Others: a new 2D portrait drawn by the studio; no portrait.
### Q5: Which windows get the new placement?
Recommended: landscape, at least 48rem wide. Others: every landscape window the column layout covers (from 32rem); every window.
