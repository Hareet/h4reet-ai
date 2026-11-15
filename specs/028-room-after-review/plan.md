# Implementation Plan: The Room After the Author's Review

**Approved provisionally by the Author's order of 2026-11-15**, in his words (2026-11-15, about 00:40 his time): "And we want you to use the night shift agent set up to accomplish all of these items. I'm going to bed for the night". His rule for it, word for word: "**Approval, given ahead.** The spec-writer takes the recommended answer at clarify and at the plan, as for nights 1 and 2, and records at the top of `plan.md` and `tasks.md`: "Approved provisionally by the Author's order of 2026-11-15", with his words above. Each question still goes on the morning page with its recommended answer; an answer he overturns is reworked before he merges."

His review, the words this plan carries out, is quoted whole in [spec.md](spec.md) ("Source: The Author's Words") and in [the intent](../../intent/028-room-after-review.md). Every decision below that isn't his is a recommended answer taken under that rule, or this plan's reading, marked as such.

**Branch**: `night/spec-028/spec-028` (documents). **Spec**: [spec.md](spec.md). **Tasks**: [tasks.md](tasks.md). Paths are under `apps/web/` unless they start otherwise.

## 1. Summary

Two groups of work, beside each other, from this branch's tip:

- **Group A, the layout and words** (`impl-028a`): the split layout placed beside the room's walls (a new pure wall box, a frame area for it, the panel and the column filling the grey bands, scaling with them); the portrait gone and the still no longer fetched in 3D; the list's key cap in its own slot; the three top-left labels off the screen, the likeness lines on the Credits page; "Around the room" visually hidden but in the stacked layout.
- **Group B, the behaviour** (`impl-028b`): the room's dog only in a dinosaur visit; the dinosaur's scene (call, enter, gather, take, leave) replacing spec 025's run, on the dinosaur's model alone (his Q247 condition, Q11); the eating only after the scene; a dog visitor's introduction line from a corpus slot (a proposal and patch for his hand); spec 026's petting dormant; RK5 and V1 following the dog's files; the two probes' findings merged and acted on.
- **Integration** (the last task): merges A then B, resolves the shared files as §6 says, edits V1's still sentence, runs the one full `make check`, and writes the stack's note.

## 2. Technical Context

TypeScript 5 (strict), Vite, three.js in the lazy 3D chunk, vitest with jsdom; no Python change but the disclosure's eval test (the PDF probe found no fix needed, FR-031). No new dependency. No cloud, no gateway, no model call. Performance: the scene's director allocates nothing per frame and costs under 0.2 ms a frame (spec 025's FR-029 bench pattern); the wall box is computed once per re-fit, not per frame.

## 3. Constitution Check

See spec.md's table. Gate: passes, with one named deviation (Principle II and Development Workflow 7 for the scene and the introduction, under ADR 0055's reason). Re-checked after design: unchanged.

## 4. Group A design

### R-A1. The wall box (`src/room/compose/wall.ts`, new, pure)

`wallBox(part, area: Box): Box`: take the `room-shell` placement's frame box from the composed bundle (the same boxes `compose/framing.ts`'s `framing` reads), the camera `framing(area.w / area.h, frameBoxes)`, and project the near face's four corners (`max[2]` as z, `min`/`max` of x and y) with `compose/project.ts`'s `project`, then `toStage` into the area's pixels, offset by `area.x`, `area.y`. The result is the wall box (spec FR-005, Q3). The shell's id is read from the bundle by its piece (`room-shell`), never a literal in the code but the one constant the catalog names (spec 002's FR-007 keeps ids out of code: the plan reads it as `part.shell`, which `compose/bundle.ts` already exposes for the floor if present; if not, `compose/floor.ts`'s shell lookup is factored out and shared).

### R-A2. The split layout's frame area (`compose/frame.ts`, `compose/hud.ts`)

`HUD_PLACEMENTS.wall` (new, in `compose/hud.ts`): `{ gapRem: 1, edgeRem: 1, panel: { minRem: 20, maxRem: 44 }, column: { minRem: 18, maxRem: 32 }, minHeightRem: 14, scaleMax: 1.375, tiles: { rows: 2, perRow: 3, gapRem: 0.25, padRem: 0.25 } }` (the `tiles` row added by T-A02, below).

**As built (T-A02, impl-028a; departures from the text below, each this plan's reading):**

- **Where the wall comes from.** `wallBoxes` takes the wall through its option, `{ eat, wall }`, where `wall` is the frame area's protector (`compose/frame.ts`'s `Protect`, which gains `wall?(area): Box | null`), not a `part` argument: the protector is already what the room (`scene.ts`, unchanged), lookdev, and the compositor share for the frame area, so the wall box reaches all three by one path and `wallBoxes` keeps `splitBoxes`'s signature. `protectSceneOf` adds the `shell` (the one placement mounted on nothing, as `compose/floor.ts` finds it) to the protector's input; `protectorFor`'s `wall` is `compose/wall.ts`'s `wallBox` on it. Without a wall source (no protector, a protector without `shell`), there is no split layout: `splitBoxes(screen)` alone is null, and the window takes the column layout (spec 018's rest-row split is gone everywhere).
- **The 2D room.** The 2D drawing's protector (`flatProtectorFor`) gives as its wall the drawing's view box as placed in the area (`flatPlacement`, contain, centred): the room as the 2D drawing shows it. Before any stage draws, `app.ts` uses the 2D protector's wall (T-A03), so the first re-fit already takes the split layout.
- **The tiles' block.** The column's foot holds the toolbar's tiles in `tiles.rows` rows of `tiles.perRow`, `bar.tileRem` × the right scale tall, then the walking control (`WALK_CONTROL` × the scale) and the "Eat" tile beside it on its right; `tilesH = 2 × padRem + rows × (tile + gapRem) + walk`; the list is the column above it, `gapRem` apart. The panel's `title` is `split.panel.titleRem` × the left scale; `frame` is the panel (no rest row).
- **The panel's top** is the wall box's top (SC-001: "as tall as it"); the notes that still show (FR-014) are placed by CSS at the panel's top in the split layout (T-A06), not by the kernel's `notesH`.
- **The area's foot** is the window's less the bottom safe area, as FR-006 says (no edge); at plan §R-A3's windows the wall box's foot is still at least 1rem above it (SC-001, tested).

`wallArea(screen, metrics)`: the window less the strip's row at the top (`stripLines` × its line height, as the column layout's strip), less `panel.minRem + gapRem + edgeRem` at the left and `column.minRem + gapRem + edgeRem` at the right, less the safe areas. The room is framed into it (contain, 6% margin) and the wall box computed (R-A1).

`wallBoxes(screen, part, state, metrics, option)` replaces `splitBoxes` (its name kept as an alias for the tests that call it, so spec 018's fallbacks keep working): returns null unless FR-009 holds; else `{ area, wall, panel, title, frame, list, tiles, walk, eat, column }`:

- panel: `x = max(safe.left + edge, wall.x − gap − maxW)`, `w = wall.x − gap − x` (≥ `panel.minRem`), `y = wall.y + notesH`, `h = wall.y + wall.h − y`;
- column: `x = wall.x + wall.w + gap`, `w = min(maxW, screen.w − safe.right − edge − x)`, `y = wall.y`, `h = wall.h`; inside it, the tiles' block at the foot (the toolbar's tiles wrapped in rows of three, then the walking control and the "Eat" tile side by side), its height from the tile size × the scale; the list above it, `h = column.h − tilesH − gap`.

`compactBoxes` in the split layout returns `[strip, panel, column]` as `all` (the panel is now always there, Q2). `frameArea` in the split layout returns `wallArea` with ease 0 and no easing (spec FR-006): the protect check still runs, and a protector that refuses (a selectable pressable at spec 005's frame left to the list) makes the window fall back to the column layout, so the room never shows a framing its checks didn't judge.

The scale: `scaleLeft = 1 + (scaleMax − 1) × (panel.w − minW) / (maxW − minW)`, the same for the right; written as `--wall-scale-left` and `--wall-scale-right` (FR-008).

### R-A3. The table (recorded by T-A01)

FR-009's windows are computed by the geometry test, which prints each window's layout, wall box, and the two columns' widths, and T-A01 records them here before T-A02. Expected from the rule (this plan's reading, to be replaced by the printed numbers): 1920 × 1080, 2560 × 1440, 1920 × 1200, 1680 × 1050 take the split layout; 1280 × 720 and 1366 × 768 depend on the wall box's width at the framing and are recorded as printed; 844 × 390, 768 × 1024, 700 × 500, 320 × 568 keep today's layouts.

Printed by `test/room/hud-wall-geometry.test.ts`'s first case (T-A01, printed again after T-A05's rule) on the room's own bundle at the compositor's metrics (16-pixel root, no safe areas), after T-A02's code (the table can't print before the function exists). The wall box is `x, y, w × h` in CSS pixels; the shell's opening is square (2.13 m × 2.13 m).

| Window | Layout | Wall box | Panel w | Column w |
|---|---|---|---|---|
| 1920 × 1080 | split | 524.6, 137.5, 902.9 × 902.9 | 492.6 | 460.6 |
| 2560 × 1440 | split | 690.2, 175.2, 1211.7 × 1211.7 | 658.2 | 512 |
| 1920 × 1200 | split | 473.1, 150.1, 1005.8 × 1005.8 | 441.1 | 409.1 |
| 1680 × 1050 | split | 449.6, 164.1, 812.7 × 812.7 | 417.6 | 385.6 |
| 1280 × 720 | column (T-A05: the area, 608 px wide, is under 686.4 px) | — | — | — |
| 1366 × 768 | split | 419.2, 139.8, 559.5 × 559.5 | 387.2 | 355.2 |
| 844 × 390 | column | — | — | — |
| 768 × 1024 | dock | — | — | — |
| 700 × 500 | column | — | — | — |
| 320 × 568 | dock | — | — | — |

### R-A4. The DOM and CSS (`src/room/layout.ts`, `hud/split.ts`, `hud/split.css`)

- `layout.ts`'s `applyHud` writes `--wall-*` (the panel's, the column's, the list's, the tiles' boxes, and the two scales) in place of the split's `--split-panel-*`, `--split-rest-*`, `--split-list-*`; `data-split="on"` stays the switch, so spec 018's look rules (`split.css`) keep their selectors.
- The toolbar's tiles move, in the split layout only, into the column's tiles block by CSS placement (the bar stays the same element in the DOM, so the Tab order, toolbar first, doesn't change; spec 005's order).
- `hud/split.ts`: `build()` makes no `.split-portrait`, and `DEFAULT_DRAW.portrait` and the `still` option go; the panel's `data-panel` is `"open"` in the split layout at all times (FR-003); "Larger conversation" is hidden there (`[data-split="on"] .talk-larger { display: none }`).
- `app.ts`: the `fetchStill` call for the split (lines 870 to 875 on `main`) goes (FR-002). The 2D room's still fetch (`flat.ts`) stays.
- **As built (T-A03, impl-028a):** `hud/split.ts`'s `open` now means "a conversation is open": the panel's decoration (the frame, the emblem and the stats) is built when the split layout becomes active and `data-panel` is `"open"` while it is; the hint and "Back" show only while a conversation is open, and closing it (the hint, "Back", Escape) leaves the panel standing. `split.ts` hides "Larger conversation" (`hidden`) while active, beside the CSS rule. The `portrait` and `speaker` options and the silhouette are gone. The tiles' block, the panel's and the list's placement, and the scales are in `hud/split.css` (all under `data-split="on"`), not `room.css`. `app.ts`'s re-fit takes the wall from the stage's protector, or before a stage frames the room the 2D drawing's protector's; a stage whose protector has no wall keeps spec 014's framing; in the split layout the frame area is the split's area with no ease.
- The list (FR-011): `split.css`'s `li` becomes a two-column grid, `grid-template-columns: 1fr var(--cap-slot)`, `--cap-slot` the width of "Enter"'s key cap measured once from `hud/keycap.ts`'s metrics (3.25rem at the scale); `.split-confirm` sits in the second cell, `position: static`; the strokes span the first cell; the selected size fits the row (`height` from the selected line height). The `room.css` rules at the `button[aria-current]` and `:hover` inset ring gain `:not([data-split="on"] .room-list button)`. **As built (T-A04):** not by `:not(...)` in `room.css`, which would break spec 014's selector pins (`test/ui/hud-look.test.ts` reads `… .hud-panels button:hover` as one run of text), but by a reset in `hud/split.css`, `… .room-list li button:hover` and `…[aria-current="true"]` (`box-shadow: none`, `border-color: transparent`, `background: none`), which outranks `room.css`'s rules; `room.css` is unchanged. The cap slot is `--cap-slot: 3.25em` on the list, whose type is `1rem × --wall-scale-right`; `hud/keycap.ts` gains `KEYCAP` and `keycapWidthRem` ("Enter": 3.125rem), which `split.css`'s `.hud-keycap` matches.

### R-A5. The notes and the lines (`layout.ts`, `app.ts`, `text-copy.ts`, `build/credits.ts`)

- `layout.ts`: the notes' stand-in `p.room-stand-in`, the visitor's line, and the placeholder `p.room-note` are no longer made in `.room-notes`; `setLine`, `setVisitorLine`, `setPlaceholders` write to "Around the room" only (its slots exist: `text-copy.ts`'s `setTwinOwn` and the visitor slot), and the placeholder words join "Around the room" as a line of their own where they apply. `notesReserve` counts only the notes that still show (FR-014).
- `build/credits.ts`: `renderCredits` gains `lines: readonly string[]`, the `disclosure_line`s of the models the bundle carries, read by the `creditsPage` plugin from the build's approvals reader (`build/approvals.ts`), in the order twin, then visitors' (woman, man, dog, dinosaur, as `AVATARS`), each line once; rendered as a `section` with an `h2` from `credits.likeness`, one `p` per line, escaped as the page's other text. **As built (T-A07, impl-028a):** the lines are read from the room's composed bundle, not `build/approvals.ts` (which reads the content approvals, not the likeness ones): `build/credits.ts`'s pure `likenessLines(composed)` takes `index.twin.line` and each `scene.avatars.<id>.line`, the words the room's build already read from main's approvals; `build/room/plugin.ts`'s `roomBundle` exposes its compose as `api.composed()`, and `vite.config.ts` names the room plugin and gives `creditsPage` a `likeness` callback. `AVATARS`' order is woman, man, dinosaur, dog (the list above had the last two swapped; `AVATARS` governs). The section is `section.credits-likeness`, first in `main`, before the contents.
- UI word `credits.likeness: The AI-made figures` (added by group B's first task, §6).
- **As built (T-A06, impl-028a):** `layout.ts` makes none of the three notes and loses `setPlaceholders`, `setLine`, `setVisitorLine`, and `renderRoom`'s `note`, `noteAvatar`, `standIn` parts; the notes' box (`.room-notes`) stays, empty. `text-copy.ts` marks its slots (`data-line="twin"`, `"visitor"`) and gains `setPlaceholders(words)` and the pure `placeholderWords(ui, on)` (spec 014's join, moved from `layout.ts`), whose line (`data-line="placeholders"`) follows the visitor's slot; `app.ts` writes the twin's, the visitor's, and the placeholder lines there alone. **`notesReserve` is unchanged** (a departure from the line above): the reserve's place stays, empty, so the larger view, the dock's sheet, and the loader keep spec 014's boxes, and the twenty-odd tests that pin it stand; in the split layout the panel's top is the wall box's, so the reserve takes nothing from it. Reclaiming it is left for a later spec. "Around the room" gains the placeholder line (FR-015 says it carries it; on `main` it didn't).

### R-A6. "Around the room" (`room.css`)

A rule `[data-hud]:not([data-hud="stacked"]) .room-around` applying the `.visually-hidden` declarations (clip, 1px, overflow hidden), and `tabindex="0"` kept, so the Tab order keeps it last and a screen reader reads it; in the stacked layout, today's rule. Focusing it in the hidden layouts shows it as a focused overlay at the window's foot centre (WCAG 2.4.7 and 2.4.11: a focused element must be visible) — this plan's reading of "hide, keep for readers", since a keyboard user tabbing to it must see where focus is.

### R-A7. The compositor (`compose/stages.ts`, `build/room/checks/`)

`stageFor` and `framedStages` take the split layout's area and reserved boxes (the panel and the column don't overlap the area, so `reserved` holds only the strip where it overlaps) for each swept screen that takes it, so RG5 to RG7 judge them; the dinosaur variant (spec 024's Q150) puts the "Eat" tile in the column, outside the area. `stages-floor.test.ts` keeps every screen at least spec 005's floor. **Risk R-1**: RG7's legibility floor at the reference stages may fail, since the room is now framed in a narrower area on the wide reference window. T-A05 runs the compositor first; if RG7 fails, it stops and asks on the page (recommended: smaller `minRem`s, then the column layout at that window), never lowering the floor.

**As built (T-A05, impl-028a).** RG5 to RG7 pass at every stage (`room:check`: 0 findings; `room:report`: "Findings: none."; RG7's faces readable at the reference desktop's split stage, 1248 × 1172.5). But spec 005's stage floor (its FR-054, `test/room/stages-floor.test.ts`: every screen's stage at least its stage before spec 005) failed at 1,027 swept windows from 976 to 1,344 px wide, where the split's area (the window less 42rem) is narrower than spec 004's widest stage, 686.4 px (the first: 976 × 320, 304 × 292.5 under 571.2 × 208; heights never failed). Asked on the page, the recommended answer taken (never lowering the floor): FR-009 (b) gains `HUD_PLACEMENTS.wall.minAreaWidthPx: 686.4`: the split layout is taken only where its area is at least that wide, so 1366 × 768 and wider take it and 1280 × 720 keeps the column layout. `compose/stages.ts`'s `stageFor` passes the protector as the wall source to `compactBoxes`, so a split stage reserves the strip, the panel, and the column that overlap it; `build/room/checks/rg.ts`'s protector input gains the shell (the one placement mounted on nothing), so the compositor's stages are the room's. The dinosaur variant's Eat tile stays in the column and reserves nothing more. `build/room/report.ts`'s prose isn't changed: its "Frame" lines count the split stages among the column layout's from 1280 × 720 at ease 0.

## 5. Group B design

### R-B1. The room's dog only in a dinosaur visit (`scene/avatars.ts`, `scene/loader.ts`)

`createAvatarFigures`: `dogWants = dogHome && options.chosen === "dinosaur" && bundled("dinosaur") ? bundled("dog") : null` (`avatars.ts:347` on `main`); `loader.ts`'s `roomDog(taken)` adds the same two conditions (Q11: with the cut-out, no scene and no room's dog). The dog's group starts hidden and is shown by the scene (R-B2) at its entry; `tryShow` keeps the hand-off's two figures (spec 009) and doesn't show the dog. `scene.yaml`'s `figures.dog.home` stays (spec 025's schema needs it) and is the dog's point inside the room only as `meet`'s default if `figures.leave.meet` is absent.

### R-B2. The scene's director (`src/room/scene/dino-scene.ts`, new, pure)

Phases `idle → call → enter → gather → take → leave → gone`, or `cut`, from the inputs `{ chosen, handedOff, modelShown, view3d, motion, quality, twinCanWalk, dogShown, dogHasWalk, paused, dt }` (it leaves `idle` at the first frame with `chosen === "dinosaur"`, `handedOff`, and `modelShown`; FR-019); each frame writes into reused records `{ twin, dog, bicycle }` of `{ x, z, heading, visible, clip }` and a `{ phase, said }` record. Durations: `call` the twin's speaking time for `figures.dino_call` (spec 016's `speak_wpm` within `speak_s`), at least the greeting clip's length; `enter` the path's length over `dog_mps`; `gather` the walk to `under_bicycle` by `walk_mps`; `take` `take_s`; `leave` the path's length over `walk_mps`. Movement along the path is by arc length, written into reused vectors (no allocation per frame), with spec 019's gait advanced by the distance for the twin (`scene/gait.ts`'s pure part, as spec 025's R-05 uses it). The cut (spec FR-026): the director goes straight from `call` to `cut` (all three hidden) when its inputs say so at the start, or at once when reduced motion or quality ≥ 1 begins.

### R-B3. Its adapter (`src/room/scene/dino-scene-figures.ts`, new)

Reuses `chase-figures.ts`'s `place` for the twin's and the dog's pictures (only the pictures move; spec 025's FR-017), the twin's gait adapter (`stepGait`), and `chase.ts`'s `dogRole` for the dog's clip (`walk`, else `run`, else hold → the scene's cut). The bicycle: its placement node's picture group (`bundle3d.ts`'s piece group) is re-parented under a carrier group whose pose is the twin's plus `carry`, after a lerp of `take_s` from its wall pose; hidden at `gone`. The twin's state `arriving` is asked once at `call` (`createTwinStates`'s `arrive()`, which is once a visit on `main`: it gains a `wave()` input that plays the greeting once more, recorded in `twin-states.ts`'s contract as an amendment). Wired in `scene.ts` where the run's shell was (`scene.ts:784-798` on `main`): `shellDue` is no longer called; `createDinoScene` is, for a 3D dinosaur visit (FR-019).

### R-B4. The data (`apps/web/room/scene.yaml`, `build/room/schema.ts`, a new check)

```yaml
  # Spec 028 (FR-021, FR-022; Q13): the dinosaur's scene; each an estimate the Author's look places.
  leave:
    meet: [0.4, 0.35]          # beside the twin's home (0.66, 0.469)
    under_bicycle: [0.8, 0.25] # the floor in front of the bicycle on the right wall
    carry: [0.3, 0, 0.05]      # the bicycle's offset from the twin's picture
    path: [[0.8, 0.5], [1.0, 0.75], [1.6, 0.9]]  # out of the open front, past the right wall's front edge
    dog_mps: 1.2
    walk_mps: 1.0
    take_s: 0.8
```

The estimates are this plan's, from the shell's bounds (`room-shell.yaml`: x ±1.0668, z ±0.6096) and the twin's and the bicycle's mounts; T-B03 prints the composed points (the bicycle's floor point from its mount) and records them here before its GREEN step. The schema adds the block (optional; absent, no scene: the room is as with a cut, the eating offered at once). A new check in `build/room/checks/` (the next free code of the family that holds the figures' checks, `RI` or `RD`, the task names it) refuses FR-022's cases.

### R-B5. The speech bubble (`src/room/bubble.ts`, `src/room/bubble.css`, new)

`createBubble(doc, stageEl)`: one `div.room-bubble[aria-hidden="true"]` in the stage, absolutely placed at a point the 3D stage gives each frame while it shows (`stage3d.twinHead()`: the twin's placement's top projected by the room's camera, clamped inside the frame area, which the 3D stage already holds), with `show(text, seconds)` and `hide()`. Its CSS: the room's type, a tail toward the point, a contrast of at least 4.5:1, no animation under reduced motion. The live region gets the same words through `app.ts`'s `announcer.say`.

### R-B6. The eating after the scene (`src/room/scene.ts`, `src/room/eat/available.ts`)

The model gates stay as his Q247 answer set them (`scene.ts:472`'s `bundled(EATER)`, `available.ts:33`'s `figureModel`, `rg.ts`'s `dinosaurVisit`, `report.ts`'s dinosaur lines; Q11). One input joins `eatingAvailable`'s conditions: `sceneDone`, true once the director is `gone` or `cut`, or where the scene has no `figures.leave` (spec FR-025). The Eat box stays reserved for the visit from its start (spec 024's FR-012, Q150), so the framing doesn't move when the tile appears. `probe-eat-028`'s finding is T-B06's input: it names no cause beyond the model gates.

### R-B7. The introduction (`build/room/`, `src/room/app.ts`, the proposal)

- The room's build reads `readFacts(root)` (`build/content.ts`) and bundles `part.figures.dog_visitor_intro: string | null`: the slot `hobbies.dog_visitor_intro`'s value where `public_safe === true`, else null. The 3D part and the 2D part both carry it.
- `app.ts`: in a dog visit, when the hand-off ends (3D) or the room shows (2D), once: `bubble.show(line, speakingTime(line))` in 3D, `announcer.say(line)` in both. Nothing is added to `talk.ts`'s log or history.
- **Which facts file** (spec Q15): T-B08's first step regenerates the twin pack on a scratch copy with the slot added null in (a) `corpus/facts/hobbies-and-travel.yaml` and (b) a new `corpus/facts/room.yaml`, and records whether each changes a topic's hash and the gap cases. It takes the one that leaves every topic's hash unchanged; if both change one, (a), and the human-patch note says the topic closes until his evaluation, as spec 026's patch does.
- The proposal `corpus/proposals/dog-intro-2026-11-15.md`: his item 4b quoted whole, the slot (`id`, `label` "The twin's one introduction sentence to a visitor who chose the dog, in his words", `value: null`, `tag: null`, `source: null`, `public_safe: null`, `phrasing: "{value}"`), the steps for his hand, and Q15 and Q16. The patch: `docs/merge-requests/2026-11-15-corpus-dog-visitor-intro.patch`, built from plain copies of `refs/heads/main`, checked with `patch -p1 --dry-run` on a fresh export, with whatever the slot regenerates (§4 of spec 026's FR-022 pattern). If the container refuses a write to `corpus/proposals/`, the proposal goes to `docs/merge-requests/2026-11-15-corpus-dog-visitor-intro-proposal.md` and the note says so.

### R-B8. The run and the petting unwired; the tests that pin them

`scene.ts` no longer calls `shellDue` or makes the run's shell (FR-028); `pet.ts`'s selection hook stays wired (`app.ts:1300-1303`) and returns false, since `allowed` needs the dog at home. **Departure from specs 025's and 026's "no test edited" rules**, named here, each rewritten test-first in the task that changes its subject, with Q9, Q10, Q17 as the reason:

- `test/room/dog-figure.test.ts`: "is wanted and shows for a visitor who chose the {woman, man, dog, dinosaur}" becomes: wanted only for the dinosaur, hidden until the scene's entry; "shows two dogs where the visitor chose the dog" becomes one dog.
- `test/room/pet-shell.test.ts` and `test/room/chase-stage.test.ts`: the shell is never made.
- `test/room/dog-first-visit.test.ts`, `dog-disclosure.test.ts`, `dog-report.test.ts`: RK5 and V1 as FR-029, FR-030.
- Group A's own: `test/ui/hud-split.test.ts` (the portrait cases, the rest row), `hud-split-rest-row.test.ts`, `hud-split-model.test.ts`, `test/room/hud-split-geometry.test.ts`, `test/ui/a11y.test.ts` ("Around the room" not hidden), `test/ui/text-copy.test.ts` (its heading not hidden), `test/ui/hud.test.ts` ("what never hides": the stand-in line), `test/ui/avatars.test.ts` (the twin's line in the note), `test/room/dog-line.test.ts`, `test/room/likeness-line-anywhere.test.ts`, `test/room/likeness-visitor.test.ts` (the line in the room's note), `test/ui/notes-causes.test.ts`, `test/ui/hud-notes.test.ts`, `test/ui/loading-notes.test.ts`, `test/ui/hud-look.test.ts`, `test/room/stages.test.ts` (pins `room.css` values).

- **Found by T-A02 (impl-028a), beyond the list above**, each pinning spec 018's rest-row split, which a window without a wall source no longer takes: `test/room/eat-box.test.ts` (spec 024: `today()`'s `rest` field; "lies inside its band or the clear area, …" restricted to the layouts outside the split; "ends the split layout's list above it …" and "takes the split layout with the option exactly where it does without" rewritten for the tiles' block and the absent cover rule; its snapshot rewritten, the 20 windows where spec 018's split was taken now the column layout); `test/room/frame.test.ts` (spec 014: `UNDER` and the "7.9 pixels" case read the column's compact box, not the split's list); `test/room/protect.test.ts` (spec 014: its snapshot's `compact` part, the column layout's boxes at 1920 × 1200 without a wall).

- **T-A06 (impl-028a)**, each reading a stage note that no longer exists, rewritten to read "Around the room"'s slot or to hold the note off the stage: `test/ui/notes-causes.test.ts` (its `note` helper; one case), `test/ui/avatars.test.ts` (its `standInLine` helper; three cases), `test/ui/hud.test.ts` (two cases), `test/room/dog-line.test.ts` (its `noteLine` helper; two cases), `test/room/likeness-line-anywhere.test.ts` (its `notes` helper and three reads of the twin's slot), `test/ui/hud-faults.test.ts` and `test/ui/loading-faults.test.ts` (their stand-in line checks; `hud-faults`' frame check takes the split's wall area too, found by this run and caused by T-A03), `test/ui/a11y.test.ts`, `test/ui/loading-degraded.test.ts`, `test/ui/hud-a11y.test.ts` (one read each), `test/ui/text-copy.test.ts` (two room cases expect the placeholder line; one case rewritten); and `renderRoom`'s `note` argument dropped from `test/ui/eat-key-repeat.test.ts`, `eat-place.test.ts`, `eat-button.test.ts` (no case changed). `test/room/likeness-visitor.test.ts`, `test/ui/hud-notes.test.ts`, and `test/ui/loading-notes.test.ts`, on the list above, needed no change (the reserve stands).
- **Found by T-A05 (impl-028a)**, after its GREEN: `test/room/eat-checks.test.ts` (spec 024: "gives stages whose reserved boxes hold the Eat box …" takes the wall and, in the split layout, holds the Eat box in the column); `test/lookdev/page.test.ts` (spec 005/014: the window views' frame area is the wall area where the split is taken); `test/room/legibility.test.ts` (spec 004/014/018: three cases' desktop caps on the counters fixture, 52.7 → 52 and 23.4 → 23.1, since the fixture's unframed shell takes no split layout and its reference desktop is the column layout's frame area again); `test/room/report.test.ts` (the same fixture's report rows, 23.4 → 23.1 and 52.7 → 52.1); `test/room/stages-checks.test.ts` (spec 014: the reference desktop's stage holds spec 004's 686.4 × 640, not spec 005's 1472 wide clear area). And `compose/wall.ts` puts its inputs on the bundle's 1e-6 m grid (`emit.ts`'s `m6`), since the compositor measures in float32 and the split's boxes follow the wall box continuously: without it the room's and the compositor's split stages differed in their tenth decimal.
- **Found by T-A05 (impl-028a)**: `test/room/stages-floor.test.ts` (spec 014: "holds every screen of spec 004's sweep to its old stage at its frame area" keeps the clear-area clause outside the split layout only; the legacy floor stays for every screen); `test/room/stages.test.ts` (spec 014: "the stages as frame areas"' `reservedOf` takes the room's wall).
- **Found by T-A03 (impl-028a)**, each pinning the rest row, the portrait, or the column layout at a window that now takes the split layout: `test/ui/hud-split-a11y.test.ts` (spec 018: "sizes in rem, …" takes the room's wall and drops the 32-pixel-root equivalence, which the area's floor in CSS pixels breaks; "lifts the rest row and the open panel's foot …" becomes the panel's foot); `test/ui/hud-split-fallback.test.ts` (spec 018: "the portrait: …"; "the frame: …"'s hint closes the conversation, the panel standing; "everything at once" draws no portrait); `test/room/hud.test.ts` (spec 014: the split branch's `all`); `test/ui/eat-button.test.ts` (spec 024: the split's list without the rest row); `test/ui/hud-look.test.ts` (spec 014: two cases compare against `compactBoxes` with the room's wall, the larger view's case moves to 1024 × 600); `test/ui/hud-a11y.test.ts` (spec 005: the column's larger view at 1024 × 600).

Each rewrite keeps every other case of its file unchanged and is listed in the task's notes with the case's old and new name.

### R-B9. RK5, V1, the dashboard

`build/room/checks/rk.ts`: the room's dog's files join the dinosaur's set as one visitor set ("dinosaur + room's dog") for the largest-visitor term, only where the bundle carries the dinosaur's model, and leave the always-counted terms (FR-029). `docs/data-flow-disclosure.md` row V1: the sentence spec 025's FR-028 added ("the room's dog's model and clips in every 3D visit above the floor … the same for every visitor") becomes: "the room's dog's model and clips only in a 3D visit whose visitor chose the dinosaur, so, like the chosen avatar's files, their paths show that choice". `deploy/grafana/dashboards/h4-runtime.json`'s "Visits whose avatar failed" description: the room's dog's files "in dinosaur visits".

## 6. Shared files, and who edits first

Each group edits only the files its tasks list. Where both touch a file:

| File | First | Second | How |
|---|---|---|---|
| `apps/web/room/ui-words.yaml`, `src/room/ui-keys.ts`, `test/fixtures/room/good/apps/web/room/ui-words.yaml` | **B** (T-B01 adds every key spec 028 needs, group A's `credits.likeness` among them) | A uses the key; it doesn't edit these files | A's T-A06 starts by merging B's branch at T-B01's commit (named in B's notes) |
| `src/room/app.ts` | **A** (T-A03: the still fetch; T-A06: the notes' writers) | **B** (T-B05, T-B08: the scene's wiring, the bubble, the introduction) | B does its pure tasks first; T-B05 starts by merging A's branch at T-A06's commit. If A hasn't reached it, B's edits stay in the regions it names (the figure signal and the stage's options) and the integration task resolves the merge |
| `docs/data-flow-disclosure.md` | **B** (T-B07: the dog's files, V1) | **integration** (T-INT: the still's sentence, FR-002) | so V1 changes once per group's code, and never conflicts |
| `test/room/stages.test.ts`, `compose/hud.ts` (`EAT_CONTROL`'s box) | **A** (T-A02, T-A05) | B doesn't edit them; B's Eat condition is in `scene.ts` (`eats`) | — |

Group A owns: `compose/wall.ts`, `compose/hud.ts`, `compose/frame.ts`, `compose/stages.ts`, `layout.ts`, `hud/split.ts`, `hud/split.css`, `room.css`, `text-copy.ts`, `a11y.ts`, `build/credits.ts`, `talk/talk.ts` (if the toggle needs it). Group B owns: `scene.ts`, `scene/avatars.ts`, `scene/loader.ts`, `scene/dino-scene*.ts`, `scene/twin-states.ts`, `eat/*`, `bubble.ts`, `bubble.css`, `room/scene.yaml`, `build/room/schema.ts`, `build/room/checks/*`, `build/room/emit.ts` (the slot), `h4-runtime.json`, the corpus proposal and patch, and the PDF's note (no code: `probe-pdf-028` found the annotations in place; FR-031).

## 7. What waits for his hand

- The corpus slot (FR-027): the proposal and the patch; he fills the slot in his own words, regenerates, and evaluates (human-patch note `docs/merge-requests/human-patches/028.md`, written by T-B08).
- The candidate PDF's publishing (human patch 023, P8; `probe-pdf-028`: its four links already sit on the four claims), and his answer to that probe's question; the dinosaur's model (human patch 021, P9), which turns on the scene and then the eating (Q11). Spec 028 adds no step to either; its notes point to them.
- His look: the columns beside the walls, the scene's path and timing, the bubble.
- ADR 0055's amendment (spec 028's two cases) is the docs role's, in the stack, his to accept with it.

## 8. Risks

- **R-1** RG7 at the reference stages (§R-A7): stop and ask, never lower the floor.
- **R-2** The bicycle's re-parenting may break its frame-box highlight while away (`scene/highlight.ts`): the highlight is skipped for a hidden picture, tested in T-B04.
- **R-3** The greeting clip once a visit (`arrive()`): `wave()` is an amendment of spec 016's twin-states contract; its tests are added, none of spec 016's edited.
- **R-4** `apps/web/test/room/twin-2d.test.ts` flakes under load: rerun it alone before reporting a failure.
- **R-5** The shared `app.ts`: §6's order; the integration task resolves what remains.

## 9. Tests run per task

Each task runs the test files it adds or changes, those covering the files it changes, and `make lint`, and pastes them in its notes (his rule 4). The integration task runs the one full `make check` and pastes it in the stack's note.
