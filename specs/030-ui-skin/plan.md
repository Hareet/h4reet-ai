# Implementation Plan: The Interface's Skin

**Approved provisionally by the Author's order of 2026-11-16 (night 5)**, with his words. His review of the live site, 2026-11-16 about 19:15 his time, verbatim:

> 1. You can see from one of our latest two screenshots in the resume/ that the right side panel UI is not transparent, it is more blurred. We also want to change the UI buttons to look more like the screenshot in resume/ (the other one that is the latest). Let's separate the right-side panel UI into two halves, making the separation a horizontal slice. Then use the buttons, and let's create them in css and data so we can swap them out. 2) Let's make the character selection screen, the credits, the data flow all dark themed web pages, and use the same button styling if appropriate on the character selection screen. Maybe use the studio pipeline to create the buttons for UI? https://www.sprungstudios.com/how-to-design-a-ui-button-for-video-games/

His answer to the page's Q1, 2026-11-16 about 19:50 his time, verbatim:

> Let's use studio image skins now

His rule for night 5, from the brief's words: "**Approval, given ahead.** The spec-writer takes the recommended answer at clarify and at the plan, and records at the top of `plan.md` and `tasks.md`: "Approved provisionally by the Author's order of 2026-11-16 (night 5)", with his words above. F's tasks take the same approval for their designs. Each question goes on the morning page with its recommended answer." Every decision below that isn't his is a recommended answer taken under that rule (spec.md, Q1 to Q16), or this plan's reading, marked as such.

**Branch**: `night/spec-030/spec-030` (documents), from `b6b4d847`. **Spec**: [spec.md](spec.md). **Tasks**: [tasks.md](tasks.md). **The round**: [studio-round-1.md](studio-round-1.md). Paths are under `apps/web/` unless they start otherwise.

## 1. Summary

- **T-A, the right column**: the HUD's backdrop blur goes everywhere; the right column becomes two panels split by a slice, in the split layout, the column layout, and the dock, at rest and walking; both halves at spec 029's over-room alphas everywhere, AA computed as 029 computes it.
- **T-B, the buttons**: one component in CSS over the controls' existing classes, read from a skin file (`content/ui-skins.yaml`) turned into custom properties at build; two CSS skins, `metal` and `plain`; every state and variant tested for AA, 44 × 44, wrapping, reduced motion, forced colours, and the swap by data alone.
- **T-C, the dark pages**: one dark stylesheet of the room's tokens for the selection screen, `/credits/`, and `/disclosure/`; "Enter" the primary button; spec 029's selection-screen behaviour unchanged.
- **T-DJ, the judge**: `line.py` gains the still set's checks, test-first.
- **The round** (R-1 to R-4, studio-round-1.md): the brief, the studio's run, the judge and the record, then his intake (his patch).
- **T-DS, the image skin**: the `metal-image` entry, inlined `data:` URIs through `border-image`, the fallback to `metal`, tested both ways; after T-B.
- **T-INT**: merges A, B, C, DJ, DS in that order, removes the declarations B's rules leave dead in `room.css` and `split.css`, runs the one `make check`, writes the stack's note.

## 2. Technical Context

TypeScript 5 (strict), Vite, vitest with jsdom and axe; `yaml` (already a dependency of the build, as `build/content.ts` reads `messages.yaml`); Python 3 standard library for `line.py` (PNG decoding by `zlib`, as the arrival check does). No new dependency, no browser download, no font. No cloud, no gateway change, no model call at run time. Performance: one fewer compositing pass per panel at quality levels 0 and 1 (no blur); the skin's stylesheet is static; the halves' boxes are computed in the re-fit that computes the others, never per frame.

## 3. Constitution Check

See spec.md's table. Gate: passes, with one named deviation (Principle II and Development Workflow 7: no telemetry span or panel; the build's fallback line in their place) and the departures spec.md's Assumptions name. Re-checked after design: unchanged.

## 4. Group A design

### R-A1. No blur (FR-001)

Removed: `room.css`'s `--hud-blur` (`:104`), `html[data-blur="on"] .hud-glass` (`:678-681`), and the `:root[data-blur] .hud-glass` selectors in the four fallbacks (`:170`, `:183`, `:196`, `:1142`; the fallbacks keep their `--glass-alpha: 1` and their `.hud-glass` reset, now redundant but harmless; T-INT may fold them); `split.css`'s `[data-blur="on"]` rule (`:79-82`); `layout.ts`'s `setBlur` (`:121`, `:485-487`) and the root's `data-blur`; `app.ts`'s `blurAt` (`:210`) and its two calls (`:295`, `:1149`); the header comment of `room.css` (`:5`). `src/lookdev/stage.ts:440-460` sets `data-blur` on the lookdev page's own root: it stays (lookdev is not the HUD), but its comment names that the room no longer reads it. A test (`test/ui/hud-no-blur.test.ts`) reads every rule of `room.css`, `hud/split.css`, `talk/talk.css`, and `bubble.css` and refuses a `backdrop-filter` or `-webkit-backdrop-filter` other than `none`, and runs the real room at quality levels 0 to 3 to find no `data-blur` on the root.

### R-A2. The halves' boxes (FR-002 to FR-004; `src/room/compose/hud.ts`, `src/room/compose/halves.ts` new)

- `HUD_PLACEMENTS.wall.sliceRem: 0.75` (the split layout's slice, scaled by `scaleRight`), and `HUD_PLACEMENTS.sliceRem: 0.75` for the column layout and the dock (unscaled), beside the other table values, so moving the slice is one edit of the table.
- `wallBoxes`: `list.h = column.h - tilesH - slice` in place of `- tgap` (`:723`); `WallBoxes` gains `slice: Box` (the gap's box, for the tests); no other box moves.
- `hudBoxes`, column layout: the column band's height less the slice (`column.h = screen.h - strip.h - bar.h - slice`), the column's content box (`compactBoxes`, `:500`) inside it, so the slice lies between the column's foot and the bar's cluster; the clear area unchanged (it is beside the column). Dock: `dock.y = bar.y - dockH - slice`, and the clear area's height less the slice.
- `compose/halves.ts` (new, pure): `halves(applied: CompactBoxes): { top: Box; bottom: Box; slice: Box } | null`: split, `top = list`, `bottom = tiles`; column, `top = column`, `bottom = the bar's cluster ∪ the walking control where its place is the column`; dock, `top = dock`, `bottom = bar`; stacked, null.
- The layout's tests (`test/room/stages.test.ts`, `hud-wall-geometry.test.ts`, `eat-box.test.ts`, `test/ui/hud-model.ts`) pin the old gap and heights where they compute them from the table; T-A01 rewrites those cases test-first (spec.md's Assumptions), each named in `impl-a.md`. Spec 014's cover cap and the "no box overlaps another" rule are re-run unchanged.

### R-A3. The halves' look (FR-005 to FR-007; `room.css`, `hud/split.css`, `layout.ts`)

- Each half's element carries `data-half="top"` or `data-half="bottom"` (set by `applyHud`, removed in the stacked layout), the hook group D's frame image and the tests use (analysis A-4). The top half is the element that already has a box and glass: `.room-list` (split), `.hud-panels` (column, dock). In the column layout and the dock the top half holds the conversation too, so there the conversation takes the over-room look at rest as well (spec.md FR-005; analysis A-3). The bottom half is a new decorative element, `div.hud-half[data-half="bottom"]`, `aria-hidden="true"`, `pointer-events: none`, created once in `layout.ts` beside the bar and placed by `applyHud` at `halves().bottom` through `--half-bottom-x/y/w/h`; it carries the glass, so the bar's own glass becomes `background: none` where a half holds it (the bar's box still takes the pointer, rv-028a-1's A1-1, unchanged).
- Both halves take spec 029's over-room look in every layout and view (Q2): `applyHud` sets `data-over="room"` on both halves always (the right column's parts join `markOver`'s set unconditionally; the left panel keeps 029's geometry), so 029's rules, plates, key caps, and rings apply as written, with no new alpha.
- Corners and border: each half `border-radius: 0.75rem` and a 1 px `--tile-border` at the over-room alpha, the same in both, so they read as two panels.
- Reduced transparency, more contrast, forced colours: 029's media rule makes both alphas 1; forced colours draws both halves `Canvas` with a `CanvasText` border.
- Tests: `test/ui/hud-halves.test.ts` (new): through the real room (`test/helpers/room.ts`'s `intoRoom`) at 1366 × 768, 1440 × 900, 1920 × 1080 (split), 1280 × 720 (column), 390 × 844 (dock), at rest and walking in 3D, and 1366 × 768 and 390 × 844 in 2D at rest: two halves, the top holding exactly "Back", "In the room", the heading, and the entries (split), the bottom exactly the six tiles, the walking control, and "Eat" where offered; their boxes from `halves()`, the slice between, no overlap; both marked `data-over="room"`. `test/ui/hud-halves-contrast.test.ts` (new): spec 029's layers model (`hud-over-layers.test.ts`'s cascade, imported through a helper extracted to `test/helpers/layers.ts` by T-A01, the original file untouched but for that import) over both halves at the same windows: every text 4.5:1 (3:1 large), every mark 3:1, over white and black.

### R-A4. Files (A's alone)

`src/room/room.css`, `src/room/hud/split.css`, `src/room/layout.ts`, `src/room/app.ts` (the three `blurAt` lines only), `src/room/compose/hud.ts`, `src/room/compose/halves.ts` (new), `src/lookdev/stage.ts` (its comment), and A's tests: `test/ui/hud-no-blur.test.ts`, `test/ui/hud-halves.test.ts`, `test/ui/hud-halves-contrast.test.ts`, `test/helpers/layers.ts` (new, extracted), and the rewritten cases of R-A2 and of the blur tests (`test/room/hud-contrast.test.ts`, `test/ui/hud.test.ts`, `test/ui/hud-faults.test.ts`, `test/ui/degraded.test.ts`, and the rest `grep -l blur test/` names: `test/room/input.test.ts`, `test/ui/loading-a11y.test.ts`, `test/ui/highlight.test.ts`, `test/ui/around.test.ts`, `test/lookdev/page.test.ts`, each only where it pins the HUD's blur).

## 5. Group B design

### R-B1. The skin file (FR-009; `content/ui-skins.yaml`, new)

```yaml
# The interface's button skins (spec 030, FR-009). Features as data: a swap is an edit of `active`.
active: metal
skins:
  metal:
    kind: css
    tokens:
      font: { family: "IBM Plex Sans", weight: 700, case: upper, tracking: 0.06em }
      chamfer: 0.5rem
      radius: 0
      frame: "#2a3038"
      bevel: { light: "rgb(255 255 255 / 0.28)", dark: "rgb(0 0 0 / 0.55)" }
      highlight: "rgb(255 255 255 / 0.18)"
      glow: { radius: 0.5rem }
      primary:   { normal: { face: "#f2c230", label: "#14171c", border: "#ffe27a" }, hover: {…}, pressed: {…}, disabled: {…}, selected: {…, glow: "#ffd23f"} }
      secondary: { normal: { face: "#16323c", label: "#e6fbff", border: "#46d7f0" }, hover: {…}, pressed: {…}, disabled: {…}, selected: {…, glow: "#46d7f0"} }
  plain:
    kind: css
    tokens: { … square corners, 1 px border, no glow, case: as-written … }
```

The values are this plan's estimates, chosen so FR-012's ratios hold (T-B01 computes them; T-B02 adjusts until they do, by 5% steps of lightness, and records each change). The schema (in `build/ui-skins.ts`) refuses an unknown key, a missing token, a state missing from a variant, or a colour that isn't `#rrggbb` or `rgb(r g b / a)`.

**As built (impl-030b, T-B02).** The file is `apps/web/content/ui-skins.yaml`. Departures from the sketch above:

- Each variant gains `ring`, the focus ring's colour. The ring is drawn inside the face (§R-B3, as built), and the HUD's yellow ring on the primary's yellow face is under 3:1, so `metal` primary's ring is `#14171c` and secondary's `#ffd23f`. `plain` uses `#10141a` and `#ffd23f`.
- A length always carries its unit (`radius: 0rem`, `tracking: 0em`). The schema also refuses a font family with anything but letters, digits, spaces, and hyphens (it is written into a declaration), a weight off 100 to 900 in hundreds, a case other than `upper` or `as-written`, an `active` naming no skin, and an image skin whose `fallback` isn't a CSS skin of the file.
- The states the sketch left as `…` are this task's estimates. `plain` in full: IBM Plex Sans 400, the words' own case, no chamfer, square corners, a bevel of `rgb(255 255 255 / 0.2)` and `rgb(0 0 0 / 0.4)` (visible, so hover's lift and pressed's inversion show beyond colour), no highlight, a glow radius of `0rem` (selected shows by its 2 px border). Primary is a light face (`#e8e4dc`) with dark words and border; secondary is the glass's colour, opaque (`#10141a`), with white words and a light border.
- **The steps (T-B02).** The ratios are test/ui-skins.test.ts's (§R-B4, as built). One step is ±5% of HSL lightness, hue and saturation kept. The test failed 19 pairs of `metal` and 1 of `plain` on the estimates (pasted in `impl-b.md`). Each failing token was moved away from what it failed against, one step at a time, until every pair held:
  - `metal` primary borders, every state, from `#ffe27a` (1.10 to 2.57 against their yellow faces). Going lighter reached `#ffffff` in 6 steps and still failed (1.68 on the normal face), so they were taken back to `#ffe27a` and moved darker: `#ffdc61`, `#ffd647`, `#ffd02d`, `#ffca14`, `#fac100`, `#e1ad00`, `#c89900`, `#af8500`, `#967200`, `#7d5f00` (hover holds here, 10 steps), `#634c00`, `#4a3800`, `#312500` (normal, pressed, disabled, and selected hold here, 13 steps; at `#4a3800` the normal edge against the 0.6 glass over white was still 2.88).
  - `metal` primary disabled face, `#a08c55` → `#ac9863` (1 step lighter). With the border at `#312500` the edge against the 0.78 glass over white was 2.80 by the face and 1.63 by the border, and a darker border, down to `#000000`, didn't reach 3:1, so the face moved.
  - `metal` secondary border, normal, hover, and selected, `#46d7f0` → `#5edcf2` → `#76e1f4` (2 steps lighter; 2.81 against the 0.6 glass over white). Pressed keeps `#46d7f0`.
  - `metal` secondary disabled border, `#7d8b91` → `#8b979d` (1 step lighter; 2.63 against the 0.78 glass over white).
  - `plain` secondary disabled border, `#6b737d` → `#77808b` → `#858d97` → `#939aa3` (3 steps lighter; 2.00 against the 0.78 glass over white).
  - Every other token holds as estimated: the faces (but the one above), the labels, the rings, the highlight, the bevels.

### R-B2. The build (FR-010; `build/ui-skins.ts`, new; `vite.config.ts`; `src/main.ts`)

- `readSkins(text): Skins` (the schema), `skinCss(skins): string` (one rule, `:root[data-skin="<id>"] { --btn-…: …; }`, from the active skin alone), and a Vite plugin `uiSkins({ source })` serving `virtual:ui-skin.css` and setting `data-skin="<id>"` on `index.html`'s `<html>` by `transformIndexHtml` (no edit of `index.html`). `src/main.ts` imports `virtual:ui-skin.css` and `./ui/button.css` before `room.css`'s import, so the component's rules come first and its winners are by specificity (R-B3).
- An image skin (`kind: image`) is accepted by the schema and, until T-DS, resolved to its `fallback` whole with the line "<id>: falling back to <fallback> (image skins not built)"; T-DS replaces that one case (§7, the one sequential share).
- **As built (impl-030b, T-B02).** `build/ui-skins.ts` exports `readSkins`, `resolveSkin` (the active CSS skin, or an image skin's fallback, with its line), `skinProperties`, `skinCss`, `skinHtml`, `uiSkins`, `SKIN_MODULE`, and the types. An image skin's `files` (and `slices`) are accepted unread, as T-DS's to validate. The build prints one line at `buildStart`: `ui-skins: <id> (css)` for a CSS skin, or the fallback line above. A fallen-back build writes the fallback's ID as `data-skin`, the skin the page draws. `data-skin` goes after `<html>`'s own attributes (`<html lang="en" data-skin="metal">`). The virtual module resolves to `\0virtual:ui-skin.css`, a CSS module ID, so Vite's CSS pipeline takes it into the page's stylesheet. `src/main.ts`'s two imports land one per commit: the skin's here, `./ui/button.css` with the file in T-B03, so no commit imports a file it doesn't hold.

### R-B3. The component (FR-008, FR-011 to FR-014; `src/ui/button.css`, new)

- No DOM change (this plan's choice, so B edits no file of A's or C's): the component is a rule set over the controls' existing selectors: `.hud-bar .hud-tile`, `.room-walk`, `.room-eat`, `.split-back`, `.talk-larger`, `.talk-log-toggle`, `.talk-form button[type="submit"]`, `.choice-enter`, and the class `.ui-button` for any later control. Primary: `.talk-form button[type="submit"]`, `.choice-enter`, `[data-variant="primary"]`; the rest secondary.
- Each rule names `:root[data-skin]` and the root attributes of the rule it replaces (`[data-hud]`, `[data-split="on"]`), so it outranks room.css's and split.css's whatever the order, as split.css's header does (`split.css:9`). The properties the component owns: `color`, `background`, `border`, `border-image`, `border-radius`, `box-shadow`, `clip-path` (the chamfer, an octagon inset by `--btn-chamfer`), `font-family`, `font-weight`, `text-transform`, `letter-spacing`, `transition`, `white-space`, `min-height`, `min-width`. It never sets `outline` (the focus ring stays room.css's and 029's) or a box's position or size beyond the minimums.
- States: `:hover` (bevel lifted), `:focus-visible` (the ring, unchanged), `:active` (bevel inverted), `:disabled, [aria-disabled="true"]` (dashed border, no glow), `[aria-pressed="true"]` (the glow by `box-shadow` and a 2 px border); `@media (prefers-reduced-motion: no-preference)` alone holds the 120 ms `transition` on `background-color, box-shadow, border-color`; `@media (forced-colors: active)`: `border-image: none; clip-path: none; background: ButtonFace; color: ButtonText; border: 1px solid ButtonText` (2 px when pressed).
- The chamfer's `clip-path` cuts inside the element's box, whose `min-height`/`min-width` stay 44 px (FR-013); the focus ring, an outline, isn't clipped by `clip-path` in the HUD where 029 draws it inside (`outline-offset: -4px`); elsewhere a `clip-path` would clip an outside ring, so where the ring is outside (the selection screen's "Enter"), the chamfer is drawn by a `::before` layer behind the label instead of `clip-path` on the element (T-B02 picks per control and records it).
- **As built (impl-030b, T-B03), `apps/web/src/ui/button.css`.** Departures from the bullets above, each recorded in `impl-b.md` too:
  - *Selectors.* Each rule is `:root[data-skin][data-hud][data-split] :is(<the room's controls>)` or `:root[data-skin] :is(.choice .choice-enter, .ui-button)`, one `:is()` list in place of a rule per competitor's root attributes. `:is()` takes its most specific argument, so every room control's base rule is (0,7,1), above the most specific competitor for an owned property (spec 029's `html[data-split="on"][data-hud="column"] .room-list[data-over="room"] .split-back`, (0,5,1)). It also clears whatever A's and C's new rules add short of that; T-INT re-runs `button-skin.test.ts` to be sure. "Send" is `.talk-form .talk-row > button:not(.talk-voice)`, not `button[type="submit"]`, because the same button turns `type="button"` while it reads "Stop" (`talk.ts:291`) and would otherwise drop the skin mid-turn.
  - *States by private properties.* The state rules set `--_face`, `--_label`, `--_border`, `--_ring`, the bevel's width and its two colours, the glow's colour and radius, and the border's width and style; one paint rule reads them. Of equal specificity, they come in the order hover, pressed, selected, disabled, so disabled wins over the rest. Pressed inverts the bevel and narrows it (3 px to 2 px), so it differs from normal by geometry, not only by which edge is light.
  - *The ring, drawn inside.* The component sets the focus ring (`outline-width: 2px; outline-style: solid; outline-color: var(--_ring); outline-offset: calc(-2px - var(--btn-chamfer) / 2)`), against "it never sets outline". `clip-path` clips any outline drawn outside the box, and the HUD's yellow on the primary's yellow face is under 3:1. So the ring is drawn inside on every control, past the chamfer's corners (its outer corner at half the chamfer's leg from each edge), in the variant's `ring` token. No control needs the `::before` chamfer, and no control is positioned for one. Under forced colours the ring is `Highlight`.
  - *The glow, inside.* `clip-path` clips an outer shadow too, so the selected glow is an inset shadow (`inset 0 0 var(--btn-glow-radius) 0 <glow>`), with the 2 px border.
  - *The chamfer's edges.* `clip-path` cuts the border off the four diagonals, so four `linear-gradient` layers (135°, 225°, 315°, 45°) paint the border's colour from each corner to one line-width past the cut (`calc(var(--btn-chamfer) * 0.7071 + var(--_line-w))`). Above them, the inner highlight (`linear-gradient(to bottom, var(--btn-highlight), transparent 50%)`); beneath, the face (`background-color`); and the frame, a 1 px inset ring in `--btn-frame` inside the border, the bevel inside that.
  - *Owned properties, added:* `opacity` (room.css's disabled tile at 0.75 would take the label under its ratio), `transform` (room.css's `:active` `translateY(1px)` is a movement FR-014 refuses), and the outline's four properties at `:focus-visible`. Written as longhands (`background-color`, `background-image`, `border-width`, `border-style`, `border-color`), never a shorthand holding `var()`.
  - *Selected, the walking control.* The walking control carries no `aria-pressed` (`layout.ts`'s `setWalking` changes its words and the view's role), and B changes no DOM, so its selected state is `.room-stage-view[role="application"] + .room-clear .room-walk`. That view is the room's while walking (`layout.ts:381-394`), and `.room-clear` follows it (`:269-270`).
  - *Disabled under forced colours:* `GrayText` and a dashed border, as the system draws a disabled button.

### R-B4. Tests (B's)

- `test/ui-skins.test.ts` (new, a build test): the schema on fixtures (each refusal); `skinCss` for `metal` and `plain`; **FR-012's ratios** for every skin, variant, and state: the label against the face composited over white and black; the border against the glass of the half beneath (029's over-room glass, over white and black); the glow's not counted as a boundary; **the swap** (SC-004): a fixture tree with `active: plain` builds a stylesheet whose `data-skin` and values are `plain`'s, and `git diff --stat` over `src/` and `build/` is empty (the test compares the two builds' inputs: only the YAML differs).
- `test/ui/button-skin.test.ts` (new): through the real room and the real selection screen with the built skin stylesheet inserted (spec 029's way: `room.css`, `talk.css`, `split.css`, `button.css`, the skin's CSS as `<style>` elements in the bundle's order), each control of Q5 has the component's winning declarations by the cascade, read by jsdom's `getComputedStyle` as spec 029's `talk-answer-shows.test.ts` reads `position` and `z-index` (never by importing a `.test.ts` file, which would register its cases; A's `test/helpers/layers.ts` is on A's branch only until T-INT; analysis A-5), its variant right, 44 × 44 minimums, `white-space` not `nowrap`.
- `test/ui/button-states.test.ts` (new): each state's selector reaches each control (a pressed toggle, a disabled control, the walking control while walking), differs from normal by more than colour (a property of the list in FR-012 other than `color`/`background-color` changes), reduced motion leaves no `transition` or `animation`, forced colours sets `border-image: none`, a label doubled wraps (no `nowrap`, no `text-overflow: ellipsis`).
- **As built (impl-030b, T-B01), where it departs from the bullets above:**
  - *The cascade's reader.* jsdom's `getComputedStyle` applies no `@media` (so it can't show reduced motion or forced colours), can't enter `:hover`, `:active`, or `:focus-visible`, drops a `border-color` holding `var()`, and keys a shorthand holding `var()` (room.css's `background: var(--tile-face)`) apart from its longhands, so a later shorthand of lower specificity resets a longhand in jsdom alone (its `computed-style.js`, read at `jsdom` 30.1.1; probes in `impl-b.md`). B's tests read winners with a cascade of their own, `test/helpers/button-cascade.ts` (importance, Selectors 4 specificity, order, `@media` by the window's features, the states by selector, `var()` resolved), over the stylesheets in the bundle's order, and cross-check against jsdom's `getComputedStyle` every owned property jsdom computes as declared (`color`, `clip-path`, `white-space`, `min-height`, `min-width`, `text-transform`). The room and the selection screen with the skin in place are `test/helpers/button-room.ts`. Neither imports a `.test.ts` (A-5).
  - *The boundary's ratio, two-tone.* A single border colour can't reach 3:1 against glass over white and over black at once and keep the reference's bright edges (between 0.3 glass over white, L ≈ 0.49, and over black, L ≈ 0.002, only L 0.106 to 0.127 holds). The test reads the boundary as spec 029 reads a tile's and its focus ring's ("one of which reaches 3:1 over any scene pixel"): the border 3:1 against the face (the states' marks, dashed and doubled, are drawn in it), and the edge, the border or the face, 3:1 against what lies beside it. Beside it: the glass at every alpha the room draws (spec 029's 0.3, spec 005's 0.6, spec 018's 0.78, and 1), each over white and over black, and the dark pages' ground; not the over-room glass alone, since on B's branch, before A, the controls stand on all four. The focus ring, drawn inside the face (§R-B3, as built), 3:1 against the face and its highlight; the label 4.5:1 against the face and against the face under the skin's inner highlight.
  - *The swap.* Through the plugin's own hooks (`buildStart`, `resolveId`, `load`, `transformIndexHtml`), as `test/room/plugin.test.ts` calls the room's, over two copies of the file whose one differing line is `active:`; the same code serves both, so nothing under `src/` or `build/` differs by construction. T-B04's two real builds show it end to end.
  - *Earlier tests.* None is rewritten. Every earlier test builds its window from the source `index.html`, which carries no `data-skin` (the build writes it), and every rule of `button.css` names `:root[data-skin]`, so their cascades are unchanged and they keep testing the unskinned page (spec 014's tiles), a page the build no longer serves; `hud-look.test.ts`, `hud-contrast.test.ts`, `hud-over-contrast.test.ts`, and `highlight.test.ts` (the `grep` below) pin those colours there. B's tests are the skinned page's; T-INT02 removes the declarations the skin leaves dead and decides then what those tests pin.

### R-B5. Files (B's alone)

`content/ui-skins.yaml` (new), `build/ui-skins.ts` (new), `src/ui/button.css` (new), `src/ui/skin.d.ts` (new: the virtual module's type), `vite.config.ts` (the plugin), `src/main.ts` (two imports), `test/ui-skins.test.ts`, `test/ui/button-skin.test.ts`, `test/ui/button-states.test.ts`, and the rewritten cases of earlier tests that pin the tiles' or buttons' colours (T-B01 names them; `grep -ln "tile-face\|#555555\|#1a1a1a" test/` is the start). As built: also `test/helpers/button-cascade.ts` and `test/helpers/button-room.ts` (new, §R-B4); no earlier test rewritten (§R-B4, as built).

## 6. Group C design

### R-C1. The dark tokens (FR-015, FR-016; `src/pages/dark.css`, new)

```css
/* The dark pages (spec 030, FR-015): the room's own panel palette, opaque. Values held equal to room.css's and
   hud/split.css's :root by test/ui/dark-pages.test.ts. */
:root.dark-page, body.dark-page {
  color-scheme: dark;
  --glass: 16 20 26; --hud-text: #ffffff; --split-muted: #e8e4dc; --accent-neon: #ffc8a8; --hud-focus: #ffd23f;
  color: var(--hud-text); background: rgb(var(--glass));
}
.dark-page a { color: var(--accent-neon); text-decoration: underline; }
.dark-page a:focus-visible, .dark-page button:focus-visible, .dark-page input:focus-visible { outline: 2px solid var(--hud-focus); outline-offset: 2px; }
.dark-page .disclosure { background: rgb(var(--glass)); border-bottom-color: var(--split-muted); }
.dark-page th, .dark-page td, .dark-page header { border-color: #8a8f98; }
```

The selection screen: `choice.ts` imports `../pages/dark.css` and adds `dark-page` to `body` while the screen shows, removed at "Enter" (the room has its own look); `choice.css`'s light colours (`#555555` borders, `#3a3a3a` instruction, the cards' faces) become the tokens', with the cards drawn in the skin's tokens where B's properties exist (`var(--btn-frame, …)`, `var(--btn-chamfer, 0)`, the selected glow `var(--btn-secondary-selected-glow, var(--hud-focus))`), so C works before B merges and takes B's look after it. The two built pages: `build/credits.ts` and `build/disclosure.ts` read `src/pages/dark.css` at build (`readFileSync` beside their existing reads) and emit it before their own `STYLE`, which keeps only layout rules (its colours gone), with `class="dark-page"` on `<html>`.

### R-C2. Tests (C's)

`test/ui/dark-pages.test.ts` (new): each page's ground, text, link, focus ring, borders, and disclosure at their ratios (FR-016), computed from the stylesheets; `dark.css`'s values equal to `room.css`'s and `split.css`'s `:root` (read from the files); the selection screen's body carries `dark-page` before "Enter" and not after; `/credits/`'s and `/disclosure/`'s emitted `style.css` starts with `dark.css`. Run beside it unchanged: `choice-cards.test.ts`, `choice.test.ts`, `a11y.test.ts` (axe on the dark screen in three states), and the "nothing before Enter" case. `credits.test.ts` and `disclosure.test.ts` are rewritten test-first only where they pin the light `STYLE`.

### R-C3. Files (C's alone)

`src/pages/dark.css` (new), `src/choice/choice.css`, `src/choice/choice.ts` (the import and the body class), `build/credits.ts`, `build/disclosure.ts`, `test/ui/dark-pages.test.ts`, and the rewritten cases of `test/ui/credits.test.ts` and `test/disclosure.test.ts`.

## 7. Group D design

### R-D1. The judge's still checks (FR-022; T-DJ; `scripts/studio/line.py`, `scripts/studio/test_line.py`)

- In `candidate_findings`, after the bytes check (`line.py:1052`), for a brief of kind `still`: each `.png` file's IHDR read (`image_size`, `:679`, already there); a finding where a side exceeds `limits.texture_px`, where the colour type isn't 6 (RGBA) or 4 (grey and alpha) and no `tRNS` chunk is present, or where any pixel of the outermost one-pixel ring has alpha > 0 (decoding the IDAT stream by `zlib` and the five PNG filters, 8-bit depth only; another depth is a finding).
- For a brief whose asset starts with `ui-`: `slices.json` must be a regular file in the folder, never listed in `files` (as `note.md`), `{"schema": 1, "files": {"<name>": {"top": n, "right": n, "bottom": n, "left": n}}, "labels": {"primary": "#rrggbb", "secondary": "#rrggbb"}}`, naming every PNG in `files` and nothing else; each inset a whole number ≥ 1 with `left + right < width` and `top + bottom < height`; for the files `btn-<variant>-<state>.png`, every two states of a variant: the mean sRGB colour of each centre region (inside the insets, alpha-weighted) at least ΔE76 15 apart in CIELAB; and the variant's label colour at 4.5:1 against every centre pixel with alpha ≥ 0.5 composited over white and over black.
- Each check's finding line in `line.py`'s form (`<check>: <value> (limit: <limit>)`), so `--record` records them; the docstring's `candidate:` paragraph gains one sentence. `test_line.py` gains cases first, seen failing: an RGB PNG, a PNG with an opaque corner, one over `texture_px`, a `ui-` folder without `slices.json`, an inset outside the image, two states too close, a label at 4.4:1, and a passing set (fixtures written by the test itself with `zlib`, no binary committed). Every existing case of `test_line.py` passes unchanged.
- Files: `scripts/studio/line.py`, `scripts/studio/test_line.py` (T-DJ's alone).

### R-D2. The round (FR-019 to FR-023; studio-round-1.md)

The round runs as spec 021's round 2 did, by four night tasks and his hand: R-1 `brief-ui-r1` writes the brief (studio-round-1.md, "The brief, verbatim") to `/srv/studio/briefs/ui-buttons/1.json` and runs `line.py brief`; R-2 the studio task (`studio-ui-r1`, on his machine) runs it and hands back to `/srv/studio/handoff/ui-buttons/1/`; R-3 `judge-ui-r1` runs `line.py candidate` from a branch holding T-DJ, dry, then `--record` once; R-4 his look and his intake (his patch, R-D3). R-1 needs no code (the brief's shape is today's); R-3 needs T-DJ's commits.

### R-D3. His intake (FR-023; a patch for his hand, `docs/merge-requests/2026-11-17-030-ui-buttons-intake.md`)

Written by R-3 after a pass, never applied by an agent:

- the eleven PNGs copied byte for byte from `/srv/studio/handoff/ui-buttons/<n>/` to `assets/ui/buttons/`, with the handoff's `records.json` (its `directory` `assets/ui/buttons`) and `LICENSE.md` (the shipped assets' five lines);
- `assets/CREDITS.md`'s section for `assets/ui/buttons`, by `scripts/assets/credits.py` as for every asset directory;
- the arrival check (`tools/gates/arrival_check.py --staged`) clean: rules A (PNG only, in an asset directory), M (only the admitted chunks; the one `iTXt` XMP packet holding the IPTC digital source type, `trainedAlgorithmicMedia` for an all-model record), B, R (the record's shape, `source: {type: design, id: D-0006}`), N (the notice), L and P (every model and tool on main's list; P1 asks no approval of a file outside the room and the twin, not a likeness, not from a photo: spec 004's C1), F (`still`, 300,000 bytes);
- his look approval, which the line asks before any intake (spec 017), recorded in the stack's note; no `assets/policy/approvals.json` entry is needed by the check (P1, above), and none is written;
- `content/ui-skins.yaml`'s `metal-image` entry already holds the hashes and insets from the record (T-DS, after R-3), so his intake changes no data; if his files differ from the record, the build falls back and says which (FR-025).

### R-D4. The image skin (FR-024, FR-025; T-DS, after T-B; `build/ui-skins-image.ts` new, `build/ui-skins.ts`'s image case, `content/ui-skins.yaml`'s entry, `src/ui/button-image.css` new)

- `content/ui-skins.yaml` gains `metal-image: { kind: image, fallback: metal, files: { primary: { normal: { file: assets/ui/buttons/btn-primary-normal.png, sha256: …, slice: [t, r, b, l] }, … }, secondary: {…}, panel: {…} } }` and `active: metal-image` (Q15). Until R-3's record, the hashes are the placeholder `pending`, which the schema accepts only with a fallback and which always falls back ("hash pending").
- `resolveImageSkin(entry, read)`: for each file, `read` (from the repository's root), size ≤ 48,000 and total ≤ 96,000, SHA-256 equal; else the fallback whole, with the first reason. Passing, the CSS: the fallback's tokens, then per variant and state `--btn-<variant>-<state>-image: url("data:image/png;base64,…")` and `--btn-<variant>-<state>-slice: t r b l`; `src/ui/button-image.css`'s rules (under `:root[data-skin-kind="image"]`) set `border-image-source`, `border-image-slice` (the numbers, `fill`), `border-image-width` (each inset ÷ 2, in px: the images are drawn at twice the CSS size), `border-image-repeat: stretch`, and `border-style: solid` with `border-width` equal to the widths, over the fallback's face; the panel frame on both halves through `--half-frame-image` (A's elements, styled from D's file by their `[data-half]` attribute, §R-A3: no edit of A's files). The border the frame takes (its insets ÷ 2, 24 CSS px) lies inside each half's box, so the list's and the controls' content boxes shrink by it; T-DS checks with A's `hud-halves.test.ts` that no control leaves its half, and if one does, draws the frame with `border-image-outset` instead, recorded here (analysis A-8). Forced colours: `border-image: none`.
- The one sequential share: `build/ui-skins.ts`'s `image` case (R-B2), replaced by a call to `resolveImageSkin`. T-DS branches from T-B's merged tip, so nothing runs beside it in that file.
- Tests: `test/ui-skin-image.test.ts` (new): files absent → `metal` and the line; fixtures (PNGs the test writes, with their hashes in a fixture YAML) → the `data:` URIs, slices, and widths; one hash wrong → fallback naming the file; a file over 48,000 bytes → fallback; the total over 96,000 → fallback; `pending` → fallback. `test/ui/button-image-skin.test.ts` (new): with the fixture skin built, every control's `border-image-source` is its state's URI, the label is the element's text and its accessible name unchanged, forced colours `none`; the "nothing before Enter" case of `choice-cards.test.ts` passes with the image skin active (the URIs are `data:`, no request).

## 8. The round's timing

R-1 can run tonight from this branch (no code). R-2 waits for his machine's studio, as every round. R-3 needs T-DJ. T-DS's entry holds `pending` hashes until R-3's record, then a one-commit data edit (the hashes and insets from the record), which T-DS or a follow-up task makes. Three failed rounds put the set on his page; the CSS skin `metal` is the fallback whatever happens.

## 9. Files and owners

| Group | Files (alone) |
|---|---|
| A | `src/room/room.css`, `src/room/hud/split.css`, `src/room/layout.ts`, `src/room/app.ts` (the `blurAt` lines), `src/room/compose/hud.ts`, `src/room/compose/halves.ts`, `src/lookdev/stage.ts` (comment), `test/ui/hud-no-blur.test.ts`, `test/ui/hud-halves*.test.ts`, `test/helpers/layers.ts`, the blur and geometry tests R-A4 names |
| B | `content/ui-skins.yaml` (its `metal` and `plain`, `active`), `build/ui-skins.ts`, `src/ui/button.css`, `src/ui/skin.d.ts`, `vite.config.ts`, `src/main.ts`, `test/ui-skins.test.ts`, `test/ui/button-*.test.ts` (but `button-image-skin`), `test/helpers/button-cascade.ts`, `test/helpers/button-room.ts`, the colour tests R-B5 names |
| C | `src/pages/dark.css`, `src/choice/choice.css`, `src/choice/choice.ts`, `build/credits.ts`, `build/disclosure.ts`, `test/ui/dark-pages.test.ts`, `test/ui/credits.test.ts`, `test/disclosure.test.ts` |
| DJ | `scripts/studio/line.py`, `scripts/studio/test_line.py` |
| DS (after B) | `build/ui-skins-image.ts`, `src/ui/button-image.css`, `test/ui-skin-image.test.ts`, `test/ui/button-image-skin.test.ts`; sequentially after B: `build/ui-skins.ts`'s image case, `content/ui-skins.yaml`'s `metal-image` entry and `active` |
| The round | `specs/030-ui-skin/studio-round-1.md`, `/srv/studio/briefs/ui-buttons/*`, `docs/merge-requests/2026-11-17-030-ui-buttons-intake.md` |
| INT | the merges; `room.css` and `split.css`'s declarations B's rules leave dead (each removal with the cascade test proving no winner changes); `docs/adr/0056-no-backdrop-blur.md` (by the docs agent); `docs/merge-requests/2026-11-17-030-ui-skin.md` |

Cross-group reads, never edits: B's rules name A's and C's classes; C's `choice.css` reads B's custom properties with fallbacks; D's `button-image.css` styles A's `.hud-half` by class. A selector renamed by A or C after B is a T-INT finding, caught by B's `button-skin.test.ts`.

## 10. Risks and their answers

- **The cascade fight** (B's rules against room.css's and split.css's): B's rules name the root's attributes and the cascade test pins each winner; T-INT removes the dead declarations behind them.
- **The chamfer and the focus ring**: `clip-path` clips an outside outline; R-B3's per-control choice keeps the ring visible, which `button-states.test.ts` asserts for each control (the ring's control has no `clip-path`, or its ring is inside).
- **Contrast over the room with clearer glass**: FR-005's rule raises one alpha in 5% steps if a ratio fails, recorded.
- **The round fails three times**: the CSS `metal` ships; the image skin stays `pending` and falls back; his page decides.
- **The studio needs a tool off the list**: the brief stops the round and hands back a note (as 021's brief does); a new tool is his to add.
