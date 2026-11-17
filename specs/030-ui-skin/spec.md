# Feature Specification: The Interface's Skin

**Feature Branch**: `night/spec-030/spec-030`, cut from `b6b4d847` (F's first finished commit, `impl-f3`'s tip; `main`'s `f6baef8c` beneath it). Documents only. The implementation is four groups, A to D, each on its own branch from this branch's tip, then one integration task, T-INT ([tasks.md](tasks.md)); B's image skin (group D's code) follows B.

**Created**: 2026-11-17 (night 5)

**Status**: Draft. Specified, clarified, planned, tasked, and analyzed in one session from the draft intent [`intent/030-ui-skin.md`](../../intent/030-ui-skin.md). Every clarification answer below is the recommended one, taken under the Author's rule 1 for night 5 ("Approval, given ahead"), provisional and his to confirm or overturn on the morning page; none is his answer but the two quoted as his. Each question is also in `/night/io/out/questions.md`.

**Input**: the intent; the [constitution](../../.specify/memory/constitution.md); `CLAUDE.md`; the specs this changes: [005](../005-full-window-room/spec.md) (the dark glass and its blur, FR-006, FR-024, FR-025, FR-058), [018](../018-better-hud-and-load-screen/spec.md) (the split layout's glass, FR-014), [028](../028-room-after-review/spec.md) (the right column beside the wall, FR-007, FR-008), [029](../029-room-polish/spec.md) (the over-room glass and plates, FR-001 to FR-008; the selection screen, FR-024 to FR-035), [002](../002-the-room/spec.md) (targets, FR-046), [016](../016-the-twins-own-avatar/spec.md) (the credits page, FR-042), [017](../017-the-night-shift/spec.md) (the studio line), [021](../021-dinosaur-modeled-and-brought-in/studio-round-2.md) (a round's shape); [024](../024-dino-eats-room-assets/spec.md) and [026](../026-twin-pets-dog/spec.md) read for the "Eat" tile and the dog's controls (no clause of theirs changes). The code, read at `b6b4d847`: `apps/web/src/room/room.css` (the palette, `--hud-blur`, `html[data-blur="on"] .hud-glass` at `:678`), `src/room/hud/split.css` (the split layout; its blur at `:79-82`; 029's appended block), `src/talk/talk.css`, `src/room/layout.ts` (`setBlur`, `:485`; the tiles, `:152`), `src/room/app.ts` (`blurAt`, `:210`), `src/room/compose/hud.ts` (`wallBoxes`, the list and the tiles' block, `:672-731`; `hudBoxes`; `compactBoxes`), `src/choice/` (`choice.ts`, `cards.ts`, `choice.css`), `src/style.css`, `build/credits.ts` and `build/disclosure.ts` (each page's `STYLE`), `vite.config.ts`, `nginx.conf` (the CSP), `scripts/studio/line.py`, `tools/gates/arrival_check.py` (read only), `assets/policy/caps.json` and `studio-tools.json` (read only; equal to `main`'s).

**Not seen**: `resume/` isn't in this worktree, so neither screenshot was read. This spec works from the orders' descriptions of them, which are not his words, and says so where it leans on them (Assumptions).

## Source: The Author's Words

His review of the live site, 2026-11-16 about 19:15 his time, verbatim:

> 1. You can see from one of our latest two screenshots in the resume/ that the right side panel UI is not transparent, it is more blurred. We also want to change the UI buttons to look more like the screenshot in resume/ (the other one that is the latest). Let's separate the right-side panel UI into two halves, making the separation a horizontal slice. Then use the buttons, and let's create them in css and data so we can swap them out. 2) Let's make the character selection screen, the credits, the data flow all dark themed web pages, and use the same button styling if appropriate on the character selection screen. Maybe use the studio pipeline to create the buttons for UI? https://www.sprungstudios.com/how-to-design-a-ui-button-for-video-games/

His answer to the page's Q1, 2026-11-16 about 19:50 his time, verbatim:

> Let's use studio image skins now

The orders' descriptions of his screenshots (theirs, not his):

- `resume/Screenshot 2026-11-16 191154.png`: "the live room at a wide window. The left panel holds a conversation with answers (THIS CALL $0.001079 est.; SERVING "Unknown", item F7). The right column, from "Back" and "In the room" down through the piece list (Snowboard to Dog, "Laptop and screen" selected) and the six buttons (Resume, 2D view, Pause the room, Full screen, How data flows, Credits) and "Stop walking", sits over the room with a strong blur behind it: the room is smeared, not seen."
- `resume/Screenshot 2026-11-16 191244.png`: "his reference, a sci-fi pause menu (PAUSED, then RESUME, RESTART, OPTIONS, EXIT): a dark metal frame with chamfered corners and bolts; the selected button yellow with a glow, the others cyan, each with a bevel and an inner highlight. It is likely someone's game art: a style reference only. Draw our own in its spirit; copy nothing from it."

The orders' summary of the guide he linked (theirs): "fit the theme while keeping the purpose clear, every state, legibility, plan for longer text, set a visual target, and stop there."

**Readings, beside his words, never in their place.**

- His item 1 holds three asks: the right column not blurred (group A), two halves split by a horizontal slice (group A), and buttons in the reference's spirit, made "in css and data so we can swap them out" (group B). His item 2 holds two: the three pages dark, with the buttons on the selection screen "if appropriate" (group C), and the studio pipeline for the buttons, which his answer to Q1 makes tonight's (group D).
- "the right side panel UI is not transparent, it is more blurred" names the backdrop blur, not the tint: spec 005's FR-025 draws `--hud-blur` (12 px) behind the glass at quality levels 0 and 1 (`room.css:678`), and spec 018 draws it behind the split layout's list and bar (`split.css:79-82`). Spec 029 kept it (its FR-002: "the blur (`data-blur`) applies as today"). It isn't 029's addition; it is 005's, kept by 018 and 029 (Q1).
- "the right-side panel UI" is the split layout's right column (spec 028's `WallBoxes.column`): the list (`.room-list`: "Back", the label "In the room", the list's heading, the entries) at its top and the tiles' block (the bar's six tiles, the walking control, "Eat") at its foot, today two glass boxes 0.25rem apart (`compose/hud.ts:715`), with the walking control and "Eat" on no glass of their own (Q3, Q4).
- The described screenshot puts the column "over the room" at a wide window. Spec 029's geometry marks no part over the room in the split layout at the room's framing (its FR-005); the description can't say whether the stage draws the room behind the column there, or the screenshot was the walking view. Q2's answer holds for both.
- "the UI buttons" are the room's controls (the bar's six tiles, the walking control, "Eat"), the panels' buttons, and, by item 2, the selection screen's "Enter" (Q5).
- "in css and data so we can swap them out" is read with his standing rule, "features as data" (the orders' words): a skin is an entry of a data file, read at build into CSS custom properties; a swap is an edit of that file (Q7).
- "Maybe use the studio pipeline to create the buttons for UI?" then "Let's use studio image skins now": a studio round makes the buttons' images tonight, through `scripts/studio/line.py` as spec 021's round 2 ran; the CSS skins stay as the fallback and the plain skin (the orders' words: "B's CSS skins stay as the fallback and the plain skin").

## Clarifications

### Session 2026-11-17, taken under the Author's rule 1 for night 5

His rule, from the brief's words: "**Approval, given ahead.** The spec-writer takes the recommended answer at clarify and at the plan, and records at the top of `plan.md` and `tasks.md`: "Approved provisionally by the Author's order of 2026-11-16 (night 5)", with his words above. F's tasks take the same approval for their designs. Each question goes on the morning page with its recommended answer." Each answer below is taken that way; the others are kept.

**Group A, the right column**

- **Q1: What does "not transparent, it is more blurred" remove?** → Taken: **every backdrop blur in the HUD, at every quality level and in every layout and view** (option A): `--hud-blur`, `html[data-blur="on"] .hud-glass`, and the split layout's `[data-blur="on"]` rule go; `data-blur` is no longer set (`layout.setBlur` and `app.ts`'s `blurAt` go with it). Others: (B) no blur only on parts spec 029 marks over the room; (C) a lighter blur (4 px). Reading: a blur over the room smears it whatever the tint, and spec 005 made it decoration only ("FR-024 never relies on it"), so no contrast changes when it goes; a frame-rate gain at levels 0 and 1 besides.
- **Q2: How clear is the glass, and where?** → Taken: **the right column's two halves take spec 029's over-room look in every layout and view, at rest too**: glass at `--over-glass-alpha` (0.3), every run of words on its plate at `--over-plate-alpha` (0.5), the button faces their labels' plates; the alphas stay 029's, re-checked by its tests without the blur and with group B's buttons (option A). Others: (B) only where spec 029 marks a part over the room, so at the room's framing the column keeps spec 018's 0.78 glass, less the blur (029's FR-005 kept); (C) no glass at all, only plates and button faces. Reading: the description puts the column over the room at a wide window, where 029's flag says it isn't; a column that is clear everywhere answers both readings, and his night-4 words asked for it ("an opaque or transparent background"). The conversation panel on the left is unchanged: he named the right side.
- **Q3: What are "two halves"?** → Taken: **two panels, each with its own glass, corners, and border, split by a horizontal slice where the room shows through** (option A): the top panel holds "Back", the label "In the room", the list's heading, and the entries, and takes the column's height less the bottom panel and the slice; the bottom panel holds the controls (the bar's six tiles, the walking control, "Eat") at its content's height; the slice is `0.75rem × --wall-scale-right` tall, nothing drawn in it. Others: (B) two equal halves (the list scrolls in its half, the controls padded to fill theirs); (C) one panel with a drawn rule across it. Reading: "halves" read as the two parts he named, not as equal heights: equal heights would squeeze the list on a short window or leave the controls' half half empty on a tall one.
- **Q4: Where do the halves apply?** → Taken: **wherever the right column's two parts exist** (option A): the split layout (the list; the tiles' block, which becomes one panel holding the bar, the walking control, and "Eat"); the column layout (the column, holding the list and the conversation as today; the controls' cluster at its foot); the dock (the dock's sheet; the bar below it); each in the walking view as at rest. The stacked layout lays nothing over the stage and is unchanged. Others: (B) the split layout only; (C) the column layout's conversation as a third panel. Reading: the orders: "at every layout the column has (split, column, dock) and in the walking view."

**Group B, the buttons**

- **Q5: Which controls take the button component?** → Taken: **the bar's six tiles, the walking control, "Eat", the list's "Back", the conversation's header buttons (its larger-view toggle and its log toggle) and "Send", and the selection screen's "Enter"** (option A). Not the list's entries (rows of a list, with spec 028's selection strokes), the key caps, the text box, or links in running text. Others: (B) the room's controls only, not the panels' or "Send"; (C) every button, the list's entries too. Reading: the orders: "One button component for the room's controls, the panels' Back and Close, and the selection screen"; "Close" is read as the conversation's header toggles, which close what they opened (the split layout has no other close).
- **Q6: Which buttons are primary (yellow) and which secondary (cyan); what is "selected"?** → Taken: **primary is the one action a view asks for next, "Enter" and "Send"; every other control secondary; "selected" is a control's on state** (`aria-pressed="true"`: "Pause the room" pressed, the 2D view on, the walking control while walking), drawn with the glow in either variant (option A). Others: (B) as the reference reads: every control cyan, the focused or selected one yellow, no primary variant; (C) every room control primary. Reading: the orders ask for "primary and secondary" with "yellow primary, cyan secondary"; the reference's yellow marks its selected entry, which this answer gives the glow.
- **Q7: What is a skin, and how is one swapped?** → Taken: **one file, `apps/web/content/ui-skins.yaml`: `active:` names the skin in use, and `skins:` holds one entry per skin, each with its tokens; the build reads it into a generated stylesheet of custom properties (`--btn-*`) and sets `data-skin` on the page's root; a swap is an edit of `active`, or of a skin's tokens, never of code** (option A). Others: (B) one file per skin under `content/ui-skins/`, `active` in a third; (C) a visitor-facing switch at run time (not asked for).
- **Q8: The first skin's face and label case?** → Taken: **IBM Plex Sans Bold, already vendored (`fonts/fonts.lock`), labels set uppercase by CSS (`text-transform`) with 0.06em tracking, so the words in the data, the accessible names, and translations stay as written** (option A). Others: (B) Patrick Hand, the room's heading face; (C) a new display face (a new vendored font: his approval, a licence row). The plain skin: IBM Plex Sans, the words' own case, a 1 px border, no chamfer, no glow.

**Group C, the dark pages**

- **Q9: What is "dark themed"?** → Taken: **the room's own panel palette, opaque**: the page's ground the glass colour (`--glass`, `rgb(16 20 26)`), text `--hud-text` (white), secondary text `--split-muted`, links in the neon accent (`--accent-neon`) and underlined, the focus ring `--hud-focus` (yellow), `color-scheme: dark`; one shared stylesheet of these tokens for the three pages, its values held equal to `room.css`'s by a test (option A). Others: (B) a dark grey of its own; (C) follow the visitor's `prefers-color-scheme`, so a light preference keeps the light pages.
- **Q10: What do the selection screen's cards take from the buttons?** → Taken: **"Enter" is the skin's primary button; the role and avatar cards keep spec 029's design (native radio labels with a picture, a name, a line, the check mark, and "Selected"), drawn with the skin's frame, chamfer, and colours, the chosen card with the "selected" glow** (option A). Others: (B) "Enter" alone takes the skin; (C) the cards become buttons (against the orders' "Keyboard, screen reader, forced colours and the phone layout stay as 029 left them"). Reading: "use the same button styling if appropriate".

**Group D, the studio image skin**

- **Q11: How does the studio draw the set?** → Taken: **in Blender 5.2.3, by the studio agent's script: one chamfered plate with a bevel, an inner highlight, a dark brushed-metal frame, and the glow as an emissive rim, rendered orthographically with a transparent background to PNG at twice the CSS size, each state a change of material on the same geometry, so the slice insets are the geometry's own numbers** (option A). Tools: `blender`, `numpy-bundled-with-blender`, `claude-opus-5.5`. Others: (B) FLUX.2 [klein] 4B in ComfyUI from a recorded prompt, BiRefNet for the alpha, then sliced by script (insets measured, not built; marks that look like text to be judged out); (C) Blender's geometry with a FLUX.2 [klein] texture for the metal's grain. Reading: "dark metal, chamfered corners, bevels and an inner highlight", exact insets, and "nothing taken from the reference image" are easiest held by geometry made from words.
- **Q12: Does the set fit main's caps?** → Taken: **yes, as `still`**: main's `per_asset.still` is `{"bytes": 300000}`; the brief asks at most 48,000 bytes and 512 px a side per file, eleven files; no `assets/policy/` patch (option A). Others: (B) a new `ui` kind in `caps.json` with a pixel limit (his patch); (C) `preview`, also 300,000 bytes.
- **Q13: How do the images reach the selection screen, which fetches no file before "Enter" (spec 029, FR-029)?** → Taken: **inlined into the built stylesheet as `data:` URIs**, which the site's CSP admits (`img-src 'self' data:`, `nginx.conf:49`): no request is added on any screen, row V1 stays true as written, and the set's raw bytes are capped at 96,000 together (option A). Others: (B) hashed files under `dist/` fetched with the page (row V1 gains "images"; 029's FR-029 amended); (C) the image skin in the room only, the selection screen keeping the CSS skin.
- **Q14: Where do the slice insets live?** → Taken: **in the handoff beside the set as `slices.json` (never listed in `files`), judged with it, and, at his intake, in the image skin's entry of `ui-skins.yaml` with each file's SHA-256**; an asset directory holds only images, `records.json`, and `LICENSE.md` (the arrival check's rule A), and a record holds no other key (option A). Others: (B) the insets in each file's name; (C) a fixed inset for every file, written in the brief alone.
- **Q15: Which skin is active once this lands?** → Taken: **`metal-image`, the image skin, with `fallback: metal`**: until his intake brings the files, the build falls back to the CSS skin `metal` and says so in its output; once the files arrive with matching hashes, the images show with no further edit (option A). Others: (B) `metal` active until his intake, then his edit of `active`; (C) `plain` until his look.
- **Q16: How does the judge check what `line.py` doesn't?** → Taken: **`line.py` gains a still set's checks, test-first**: for a brief of kind `still`, each PNG within the brief's `texture_px`, with an alpha channel and a transparent outermost ring; for an asset named `ui-*`, `slices.json` required and its insets inside each image with a non-empty centre; each two states of a variant distinguishable (their centre regions' mean colours at least ΔE76 15 apart); and the label colour `slices.json` names at 4.5:1 against every pixel of each centre composited over white and over black. A finding fails the round, so `--record` records it (option A). Others: (B) a separate script run beside `line.py`, its verdict outside the record; (C) the look alone, at his review.

## User Scenarios & Testing *(mandatory)*

Users: visitors on a window from 320 px to a large monitor, by pointer, touch, keyboard, and screen reader, with or without reduced motion, more contrast, reduced transparency, or forced colours; the Author, who judges the look, takes the studio's files in, and swaps a skin by data.

### User Story 1 - The Room Seen Through the Right Column (Priority: P1, group A)

As a visitor, I see the room through the right column, which stands as two panels split by a slice, and I can read every word on it.

**Why this priority**: his first sentence; the blur hides the room.

**Independent Test**: `vitest run test/ui/hud-no-blur.test.ts test/ui/hud-halves.test.ts test/ui/hud-halves-contrast.test.ts`.

**Acceptance Scenarios**:

1. **Given** any layout, view, and quality level, **When** the HUD shows, **Then** no element has a computed `backdrop-filter` or `-webkit-backdrop-filter` other than `none`, and the root has no `data-blur`.
2. **Given** the split layout (1366 × 768, 1440 × 900, 1920 × 1080), **When** the room shows, at rest or walking, **Then** the right column is two panels, the top holding "Back", "In the room", the list's heading, and the entries, the bottom holding the six tiles, the walking control, and "Eat" where offered, with a slice of `0.75rem × --wall-scale-right` between them, each panel at `--over-glass-alpha`.
3. **Given** the column layout (1280 × 720) and the dock (390 × 844), **When** the room shows, at rest or walking, **Then** the column (or the dock's sheet) and the controls are two panels with the slice between.
4. **Given** either half, **When** each text and mark is measured over white and over black beneath, **Then** text reaches 4.5:1 (3:1 large), and borders, icons, and focus rings 3:1.
5. **Given** reduced transparency, more contrast, or forced colours, **When** the HUD shows, **Then** both halves are opaque, as spec 029's FR-004 has it.

### User Story 2 - Buttons as a Skin (Priority: P1, group B)

As a visitor, I see buttons in a dark-metal style with chamfered corners, yellow for the main action and cyan for the rest, whose every state I can tell apart; as the Author, I swap the skin by editing one data file.

**Why this priority**: his second sentence and "in css and data so we can swap them out".

**Independent Test**: `vitest run test/ui/button-skin.test.ts test/ui/button-states.test.ts test/ui-skins.test.ts`.

**Acceptance Scenarios**:

1. **Given** `active: metal`, **When** the room shows, **Then** each control of Q5 carries the button component, "Send" primary and the rest secondary, with the `metal` tokens in effect.
2. **Given** each variant and state (normal, hover, focus-visible, pressed, disabled, selected), **When** measured, **Then** the label reaches 4.5:1 against the face, composited over white and black beneath; the boundary and the focus ring 3:1; each state differs from normal by more than colour (a border, the glow, an inset, or the label's decoration).
3. **Given** `active: plain` and no other edit, **When** the site is built, **Then** every such button draws the `plain` tokens, and no source file differs.
4. **Given** a label twice its English length (a translation), **When** it shows, **Then** it wraps within the button, which grows, and nothing is cut off; every button's hit area is at least 44 × 44 CSS px.
5. **Given** reduced motion, **When** a button is hovered, pressed, or selected, **Then** nothing moves or fades; **Given** forced colours, **Then** the button draws in system colours with a visible border.

### User Story 3 - The Dark Pages (Priority: P2, group C)

As a visitor, I meet the selection screen, the credits page, and the data-flow page dark, in the room's palette, with the selection screen's "Enter" a skin button.

**Why this priority**: his item 2.

**Independent Test**: `vitest run test/ui/dark-pages.test.ts test/ui/choice-cards.test.ts test/ui/choice.test.ts test/ui/credits.test.ts test/disclosure.test.ts`.

**Acceptance Scenarios**:

1. **Given** the selection screen, `/credits/`, and `/disclosure/`, **When** each shows, **Then** its ground is the glass colour, its text the HUD's white, every text pair at 4.5:1 (3:1 large), links underlined and 4.5:1, the focus ring 3:1, and `color-scheme: dark`.
2. **Given** the selection screen, **When** it shows, **Then** "Enter" is the skin's primary button (disabled until both steps hold a choice), the cards keep spec 029's structure and states, drawn in the skin's tokens.
3. **Given** the selection screen, **When** the visitor chooses by pointer, keyboard, or screen reader, at 320 px, under forced colours or reduced motion, **Then** every assertion of spec 029's `choice-cards.test.ts` and `choice.test.ts` holds, and nothing is fetched or sent before "Enter".
4. **Given** each dark page, **When** it shows, **Then** the AI disclosure stays in view and legible at 4.5:1.

### User Story 4 - A Studio Image Skin (Priority: P2, group D)

As the Author, I get a set of button images from a studio round tonight, judged and recorded by the line, and when I take them in, the buttons show them with no further edit; until then, the CSS skin.

**Why this priority**: his answer, "Let's use studio image skins now".

**Independent Test**: `python3 -I -B scripts/studio/test_line.py`; `vitest run test/ui-skin-image.test.ts test/ui/button-image-skin.test.ts`.

**Acceptance Scenarios**:

1. **Given** [studio-round-1.md](studio-round-1.md)'s brief at `/srv/studio/briefs/ui-buttons/1.json`, **When** `line.py brief` runs, **Then** it passes.
2. **Given** the studio's candidate, **When** `line.py candidate --record` runs, **Then** it judges the bytes, the pixel sizes, the transparency, the insets, the states' distinctness, and the label's contrast, and records `pass` or `fail` with its findings.
3. **Given** `active: metal-image` and no files in `assets/ui/buttons/`, **When** the site is built, **Then** the build uses `metal` and its output says "metal-image: falling back to metal (files absent)".
4. **Given** the files in `assets/ui/buttons/` with the hashes the entry records, **When** the site is built, **Then** each button draws its state's image through `border-image` with the recorded insets, inlined as `data:` URIs, and the label stays text.
5. **Given** a file whose hash differs from the entry's, **When** the site is built, **Then** the build falls back to `metal` and names the file.

### Edge Cases

- A window between layouts during a resize: the halves follow the layout the re-fit takes; the slice never overlaps either panel.
- The split layout's column too short for the list's least height above the controls: the list scrolls in its panel (its entries only, as today); the controls' panel keeps its height.
- "Eat" not offered: the bottom panel holds the tiles and the walking control only, its height unchanged (the row is the walking control's).
- The walking control not offered (2D): the bottom panel keeps the row's height, so nothing jumps when it is offered.
- An image skin with a state's file missing: the whole skin falls back (never a mix of images and CSS).
- An image that fails to decode in the browser: `border-image` draws nothing, and the CSS skin's background and border, declared beneath it, show.
- The button's label longer than two lines: it wraps further; the button grows; no ellipsis.
- A disabled button over the room: its label still reaches 4.5:1 (WCAG exempts it; this spec doesn't), its state shown by a dashed border and no glow.
- Forced colours: `border-image: none`, system colours, the selected state by a thicker border.
- No script: `index.html`'s static fallback, unchanged, light as today (it is outside the three pages' scripts).

## Requirements *(mandatory)*

Terms: **a half**: one of the right column's two panels (Q3, Q4); **the slice**: the gap between them; **the button component**: the class `ui-button` and its variant (`data-variant="primary|secondary"`), on a native `button` or a link styled as one; **a skin**: an entry of `ui-skins.yaml`; **a token**: one custom property of a skin.

### Group A: the right column, two halves, no blur

- **FR-001**: THE HUD SHALL draw no backdrop blur: no rule of `room.css`, `hud/split.css`, or `talk/talk.css` sets `backdrop-filter` or `-webkit-backdrop-filter` to anything but `none`; `--hud-blur`, `layout.setBlur`, `app.ts`'s `blurAt`, and the root's `data-blur` go (Q1). Spec 005's quality levels keep their other effects (FR-058's frame rate floor holds with less work).
- **FR-002**: THE RIGHT COLUMN SHALL be two panels split by a horizontal slice in the split layout, the column layout, and the dock, at rest and in the walking view (Q3, Q4): each panel its own box with its glass, corners, and border; the slice `0.75rem × --wall-scale-right` tall (the dock's and the column layout's: `0.75rem`), drawn as nothing.
- **FR-003**: IN THE SPLIT LAYOUT the top panel SHALL be the list's box, from the column's top to the slice; the bottom panel SHALL be the tiles' block (`WallBoxes.tiles`), one panel holding the bar's tiles, the walking control, and "Eat", at its content's height; `compose/hud.ts`'s `wallBoxes` SHALL compute the list's height as the column's less the tiles' block and the slice; no other box of `WallBoxes` moves, and the column's box is unchanged (spec 014's cover cap, spec 028's FR-006 hold).
- **FR-004**: IN THE COLUMN LAYOUT the top panel SHALL be the column (`.hud-panels`, the list and the conversation, as today) and the bottom panel the controls' cluster (the bar, and the walking control where its place is the column); IN THE DOCK the top panel SHALL be the dock's sheet and the bottom panel the bar; the slice between each, taken from the clear area, so no box overlaps another (`test/room/stages.test.ts`'s rule).
- **FR-005**: BOTH HALVES SHALL take spec 029's over-room look in every layout and view (Q2): glass at `--over-glass-alpha`, every run of words on its plate at `--over-plate-alpha`, the button faces their labels' plates; the alphas keep 029's values (0.3, 0.5) unless FR-006's test finds a ratio under its floor with group B's buttons in place, in which case the plan's rule raises the one alpha concerned by 5% steps and records it. The conversation panel on the left (the split layout) keeps 029's rule (over the room only); in the column layout and the dock, where the conversation sits inside the top half, it takes the half's look.
- **FR-006**: EVERY TEXT AND MARK of both halves SHALL meet WCAG 2.2 AA over white and over black beneath (text 4.5:1, large 3:1; borders, icons, focus rings 3:1), computed from the stylesheets by the cascade, as spec 029's `test/ui/hud-over-layers.test.ts` does, at 1366 × 768, 1440 × 900, 1920 × 1080 (split), 1280 × 720 (column), 390 × 844 (dock), each at rest and walking, in 3D, and 1366 × 768 and 390 × 844 in 2D at rest.
- **FR-007**: WHERE the visitor asks for reduced transparency or more contrast, or forced colours are on, BOTH HALVES SHALL be opaque, as spec 029's FR-004 has it.

### Group B: the buttons, a skin in CSS and data

- **FR-008**: ONE BUTTON COMPONENT SHALL style every control of Q5: the class `ui-button`, `data-variant` `primary` ("Enter", "Send") or `secondary` (the rest) (Q6); its states: normal, hover, focus-visible, pressed (`:active`), disabled (`:disabled` or `aria-disabled="true"`), and selected (`aria-pressed="true"`); its structure unchanged (a tile keeps its icon over its words; the accessible name, role, and order unchanged).
- **FR-009**: A SKIN SHALL be data (Q7): `apps/web/content/ui-skins.yaml`, `active: <id>`, and `skins: { <id>: { kind: css | image, tokens: {…}, fallback?: <id>, files?: {…}, slices?: {…} } }`; the tokens: the face, label, and border colours for primary and secondary in each state, the frame colour, the chamfer size, the bevel (light and dark edges), the inner highlight, the glow (colour and radius), the font family and weight, the label case and tracking, the radius; a schema SHALL refuse an unknown key, a missing token, or a colour that isn't `#rrggbb` or `rgb(r g b / a)`.
- **FR-010**: THE BUILD SHALL read the active skin into one generated stylesheet of custom properties (`--btn-…`) on `:root[data-skin="<id>"]`, and the page SHALL carry `data-skin="<id>"` from the build; the component's rules SHALL read only those properties; a swap (an edit of `active`, or of a token) SHALL change no source file and need no code (SC-004).
- **FR-011**: TWO CSS SKINS SHALL ship: `metal` (dark brushed-metal face, chamfered corners by `clip-path`, a bevel by inset shadows, an inner highlight, primary yellow, secondary cyan, the selected glow; IBM Plex Sans Bold, uppercase by CSS, Q8) and `plain` (flat dark face, a 1 px border, square corners, no glow, the words' own case). Their values are estimates for his look (SC-008).
- **FR-012**: IN EVERY SKIN, VARIANT, AND STATE, the label SHALL reach 4.5:1 against the face composited over white and over black beneath (the face is the label's plate over the room); the button's boundary and its focus ring 3:1 against what lies beside it; each state SHALL differ from normal by more than colour (WCAG 1.4.1): hover by the bevel's lift, focus-visible by the 2 px ring (`--hud-focus`), pressed by an inverted bevel, disabled by a dashed border and no glow, selected by the glow and a thicker border; a build test SHALL refuse a skin that fails one.
- **FR-013**: EVERY BUTTON'S HIT AREA SHALL be at least 44 × 44 CSS px (spec 002, FR-046), its chamfer cut from inside that box, never from the hit area; labels SHALL wrap (no `white-space: nowrap`, no ellipsis) and the button grow to hold them, tested with a label twice its length; the bar's tiles in the split layout grow within the two lines of words their fixed row holds (spec 028's A1-3, `compose/hud.ts`'s `tileRem`), and a label longer than that is a layout change for a later spec, not this one's (analysis A-6).
- **FR-014**: UNDER `prefers-reduced-motion: reduce` NO BUTTON SHALL transition, animate, or move; otherwise a state change may fade for at most 120 ms, never move; UNDER forced colours a button SHALL use system colours with a 1 px `ButtonText` border (2 px when selected) and `border-image: none`.

### Group C: dark pages

- **FR-015**: THE SELECTION SCREEN, THE CREDITS PAGE (`/credits/`, `build/credits.ts`), AND THE DATA-FLOW PAGE (`/disclosure/`, `build/disclosure.ts`) SHALL be dark (Q9), from one shared stylesheet of the room's tokens (`apps/web/src/pages/dark.css`), whose values a test holds equal to `room.css`'s and `hud/split.css`'s `:root`: ground `rgb(var(--glass))`, text `--hud-text`, secondary text `--split-muted`, links `--accent-neon` underlined, the focus ring `--hud-focus`, `color-scheme: dark`; the two built pages emit it into their `style.css` before their own layout rules.
- **FR-016**: ON EACH DARK PAGE every text SHALL reach 4.5:1 (3:1 large) against its ground, links 4.5:1 and 3:1 against the text beside them (or underlined), the focus ring 3:1; the AI disclosure (`index.html`'s `.disclosure` on the selection screen; each built page's own header) SHALL stay in view and dark at 4.5:1; tables (the data-flow page) keep 3:1 borders.
- **FR-017**: THE SELECTION SCREEN'S "ENTER" SHALL be group B's primary button; ITS CARDS SHALL keep spec 029's structure, names, states, keyboard behaviour, and layout (its FR-024 to FR-035), drawn with the skin's frame colour, chamfer, and the selected glow (Q10); the chosen card still shows the check mark and "Selected"; forced colours, reduced motion, and the 320 px layout as spec 029 left them.
- **FR-018**: NOTHING SHALL be fetched or sent before "Enter" (spec 029, FR-029; spec 009, FR-010): the dark stylesheet, the skin's stylesheet, and any image skin arrive in the stylesheets the page already loads.

### Group D: a studio image skin

- **FR-019**: A STUDIO ROUND SHALL make the set, through the studio line as spec 021's round 2 ran (`scripts/studio/line.py`: the brief, the studio task, the judge, the record, then his intake), its brief, its checks, and its record in [studio-round-1.md](studio-round-1.md): asset `ui-buttons`, kind `still` (Q12), for spec `030-ui-skin`.
- **FR-020**: THE SET SHALL be eleven PNGs with a transparent background: for each of `primary` (yellow) and `secondary` (cyan), one per state `normal`, `hover`, `pressed`, `disabled`, `selected` (`btn-<variant>-<state>.png`), and one panel frame for the right column's halves (`panel-frame.png`); each a 9-slice image with its insets in `slices.json` (Q14), at most 512 px a side and 48,000 bytes, 96,000 bytes together; no label, letter, glyph, or mark baked in (the label is the button's text); dark metal, chamfered corners, a bevel, and an inner highlight in the reference's spirit, from the brief's words alone, with nothing taken from the reference image, which the studio never receives (Q11).
- **FR-021**: THE STUDIO SHALL use only main's `assets/policy/studio-tools.json` tools with `outputs_ship: true`, and of those only the brief's (`blender`, `numpy-bundled-with-blender`, `claude-opus-5.5`); no Qwen-Image, FLUX.1 [dev], or `UNREVIEWED` node, whatever the list says.
- **FR-022**: THE JUDGE (`line.py candidate`) SHALL check, besides its checks today, the still set's (Q16): each PNG's size within the brief's `texture_px`, an alpha channel, a transparent outermost ring (alpha 0); `slices.json` present for an asset `ui-*`, naming every file, its insets whole numbers inside the image with a centre at least 1 px each way; each two states of a variant at least ΔE76 15 apart in their centres' mean colours; the label colour `slices.json` names for each variant at 4.5:1 against every opaque centre pixel composited over white and over black. Each is a finding that fails the round; the checks land test-first in `scripts/studio/test_line.py`, `line.py`'s other answers unchanged.
- **FR-023**: THE RECORD SHALL be `line.py --record`'s, once, with the files' SHA-256s pasted in `studio-round-1.md`; a pass goes to his look, and only his intake brings the files into `assets/ui/buttons/` (with `records.json`, `LICENSE.md`, and `assets/CREDITS.md`'s section), named in the plan with its arrival and approval needs.
- **FR-024**: THE IMAGE SKIN SHALL be an entry of `ui-skins.yaml`, `metal-image`, `kind: image`, `fallback: metal`, naming the eleven files with their SHA-256s and insets; the build SHALL inline each file as a `data:` URI and draw each state through `border-image` (`border-image-source`, `-slice` from the insets, `-width` in CSS px at half the image's pixels, `-repeat: stretch`), the fallback's tokens beneath it, the label real text (Q13, Q15).
- **FR-025**: THE BUILD SHALL fall back to the image skin's `fallback`, whole, when any named file is absent, unreadable, over its bytes, or of another hash, and SHALL print one line naming the skin, the fallback, and the first reason; a test SHALL build both ways (files absent; files present from fixtures with matching hashes) and one with a hash that differs.
- **FR-026**: NO PART of this spec SHALL write `assets/**`, `assets/policy/**`, `.claude/**`, `tools/gates/**`, or `corpus/**`; a change there is a patch for his hand (`docs/merge-requests/`).

### Key Entities

- **The skin file**: `apps/web/content/ui-skins.yaml` (FR-009).
- **A skin**: id, kind, tokens, and for an image skin its fallback, files, hashes, and insets.
- **The generated skin stylesheet**: custom properties on `:root[data-skin]` (FR-010).
- **The dark tokens**: `apps/web/src/pages/dark.css` (FR-015).
- **The set**: eleven PNGs and `slices.json` in the handoff; at his intake, `assets/ui/buttons/` and the skin's entry (FR-020, FR-023).

## Success Criteria *(mandatory)*

- **SC-001**: No HUD element has a backdrop filter in any layout, view, or quality level; the root never carries `data-blur`.
- **SC-002**: At the five windows, at rest and walking, the right column is two panels with the slice, and every text and mark on them meets AA over white and black, computed from the stylesheets.
- **SC-003**: Every control of Q5 carries the component; every skin, variant, and state meets FR-012, in a build test over both CSS skins.
- **SC-004**: Changing `active` from `metal` to `plain` in `ui-skins.yaml` changes the built buttons and nothing under `src/` or `build/`, in a test.
- **SC-005**: The three pages are dark and meet AA; spec 029's selection-screen tests pass unchanged but those named in the Assumptions.
- **SC-006**: The round's brief passes `line.py brief`; the candidate is judged and recorded once; the record's hashes are in `studio-round-1.md`.
- **SC-007**: The build falls back to `metal` without the files and draws the images with them, tested both ways and with a wrong hash.
- **SC-008**: The Author's look, in the morning: the two halves without blur, the `metal` and `plain` skins, the dark pages, and, once judged, the studio's set.
- **SC-009**: `make check` passes once, in T-INT.

## Amendments to Earlier Specs

| Spec, clause | Amended to | By |
|---|---|---|
| 005, FR-025 ("A backdrop blur SHALL be drawn behind the panels at quality levels 0 and 1 only"), FR-058 ("with the HUD and its blur shown"), FR-006 (its blur fallbacks); ADR 0043 decision 5's blur clause | No backdrop blur at any level; FR-006's opaque fallbacks kept. ADR 0043 is "proposed" in its own header; a new ADR (0056) records the change | His item 1; Q1; FR-001 |
| 018, FR-014 (the split layout's 0.78 glass for the list and the bar) | The right column's halves at spec 029's over-room alphas in every layout and view | Q2; FR-005 |
| 028, FR-007, FR-008 (the column's list at its top and the tiles' block at its foot, 0.25rem apart) | Two panels with a `0.75rem × scale` slice; the tiles' block one panel holding the bar, the walking control, and "Eat" | Q3; FR-002, FR-003 |
| 029, FR-002 ("the blur (`data-blur`) applies as today"), FR-005 (a part beside the room looks as on `f411d8e1`) | No blur; the right column's halves take the over-room look everywhere; the left panel keeps FR-005 | Q1, Q2 |
| 029, FR-028 (the chosen card's look), the cards' colours (light) | The skin's frame, chamfer, and glow on a dark page; structure and states unchanged | Q9, Q10; FR-017 |
| 016, FR-042 (the credits page) and the data-flow page's look (light) | Dark, the room's tokens | Q9; FR-015 |
| 017, the studio line's candidate checks (`contracts/studio-line.md`; `line.py`) | Also the still set's checks | Q16; FR-022 |
| 014, the compact bar's tiles in the column layout and the dock (its FR-017 to FR-021; `compose/hud.ts`'s `HUD_PLACEMENTS.bar`: six in one row of 35rem, the dock's two) | Not amended: they keep spec 014's metrics (the words' own case, weight 400, no tracking) under every skin, and take the skin's colours, chamfer, bevel, ring and glow; this spec's FR-011 (`metal`'s Bold, uppercase, tracking) applies to every other control and to the split layout's tiles | `rv-030b`'s R-1; the page's Q89 (rework-030b) |

## Assumptions

- **`resume/` unreachable**: neither screenshot was read; the spec works from the orders' descriptions (theirs, quoted above), and the reference's look is taken from the description's words alone. The studio receives no image of it (FR-020).
- **Deviation named** (Principle II, "telemetry that makes it observable in production"; Development Workflow 7, "A feature without a graph is not done"): no telemetry span or dashboard panel: the change is a look and a build input, with no new route or call; the build's output names the active skin and any fallback (FR-025), and a usage event for a skin would carry nothing about the visit. No accepted ADR is reversed (ADR 0055 untouched).
- **Departure named** (spec 029's FR-005 and FR-002; spec 018's FR-014; spec 005's FR-025; spec 028's FR-007 and FR-008): the table above; each by his item 1 and the recommended answers taken under his rule 1. If he overturns Q1 to Q4, group A is reworked before he merges.
- **Departure named** (CLAUDE.md, "Do not edit test files during a fix task"): groups A to D are feature tasks; each rewrites, test-first, the earlier tests that pin what it changes, in a test commit of its own seen failing before its code, and names each in its notes: for A, the tests that pin the blur (`test/room/hud-contrast.test.ts`, `test/ui/hud.test.ts`, `test/ui/hud-faults.test.ts`, `test/ui/degraded.test.ts`, and any other `grep -l blur test/` finds) and the right column's geometry (`test/room/hud-wall-geometry.test.ts`, `test/room/stages.test.ts`, `test/room/eat-box.test.ts`, `test/ui/hud-model.ts`, where they pin the 0.25rem gap or the list's height); for B, the tests that pin the tiles' or buttons' colours; for C, `test/ui/credits.test.ts` and `test/disclosure.test.ts` where they pin the light `STYLE`, and `choice-cards.test.ts` where it pins a light colour. No test of spec 029's selection-screen behaviour changes.
- **The studio's tools**: the round needs no tool off main's list (Q11's answer); its source is a design of this spec's words (`source: {type: design, id: D-0006}`, the next free design ID at `b6b4d847`: `D-0001` to `D-0005` are taken; the brief task searches again).
- **His hand**: the intake into `assets/ui/buttons/` (FR-023), his look, and every merge. No `assets/policy/` patch is needed (Q12); if he takes Q12's option B, the caps change is his patch.
- The skin's token values, the slice's size, and the dark pages' look are estimates, data, his at his look (SC-008).
- `make check` runs once, in T-INT; each group runs its own files and `make lint`.

## Expected Cost Impact

Cloud: none. No model call at run time. The first visit: the skin's stylesheet (a few KB) and, once the images land, at most 96,000 bytes raw inlined (about 128,000 base64), well inside phase 2's 10,000,000 first-visit bytes (`caps.json`). Dev-time: four implementer sessions, one studio round on his machine with local tools and the studio agent's session (row D4), one integration, a review.

## Degraded-Mode Behavior

Written first (Principle I). No blur means nothing to degrade at low quality. Halves: opaque under the visitor's asks and forced colours. Buttons: the CSS skin always; the image skin falls back whole at build (FR-025) and, at run time, a failed image leaves the CSS skin's face beneath it; forced colours draw system buttons. Pages: dark with no script for the two built pages (static CSS); the selection screen without script keeps `index.html`'s static fallback.

## Data-Flow Disclosure Entries

None, because no byte leaves the visitor's device that didn't on `b6b4d847`: the skin, the dark tokens, and the images arrive inside the stylesheets the page already loads from the site's own origin (row V1's "styles"; Q13), and nothing is fetched before "Enter". The studio round is row D4's (the studio's Claude Code session: the brief's descriptions and renders of its own models), as every round is.

## The "New Endpoint or Feature" List (`CLAUDE.md`)

- Telemetry span: none (Assumptions, the deviation named); the build's fallback line.
- Dashboard panel: none.
- Cost estimate: above.
- Degraded-mode behavior: above.
- Data-flow disclosure entry: none, because the images and styles come inside the page's own stylesheets (above).

## Constitution Check

| Principle | How this complies |
|---|---|
| I. Data-Local | No new request; nothing before "Enter"; degraded modes first (the fallback skin). |
| II. Production-Grade | Tests first; contrast computed, not eyeballed; telemetry a named deviation, the build's line in its place. |
| III. Intent, Spec, Code, Humans Merge | The intent is a draft for his acceptance; he merges and takes the files in. |
| IV. Least Privilege | No human-only path written; the intake is his patch. |
| V. Cost | None in the cloud; the first visit's bytes stated. |
| VI. Build in Public | Questions on the morning page; the round's record in the spec. |
| VII. Own the Whole Product | The studio's own tools; nothing from the reference image; the record names every step. |
| VIII. Honest AI | The disclosure banner stays in view on every dark page; the set's record carries the AI-made mark. |

## Open Questions

Q1 to Q16 above, each with its recommended answer taken provisionally, each on the morning page (`/night/io/out/questions.md`).
