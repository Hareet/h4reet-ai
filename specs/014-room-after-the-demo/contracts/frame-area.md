# Contract: the frame area, its ease, the HUD's compact boxes, and the walking hold's edge (spec 014)

The kernel's interface that the room, the compositor, the walking view, and the tests share, so the room the visitor sees is framed exactly where spec 004's checks judged it (spec 014 FR-016; spec 005's PD-7). Pure TypeScript in `apps/web/src/room/compose/`, with no DOM, no three.js, and no clock. Sizes are CSS pixels unless named otherwise; boxes are `{ x, y, w, h }` from the window's top left (`compose/hud.ts`'s `Box`).

A file named here that doesn't exist yet is in a code span: `compose/frame.ts` is new; `compose/hud.ts`, `compose/stages.ts`, `compose/framing.ts`, `compose/pick.ts`, and `fit.ts` exist on `main`.

## 1. The HUD's boxes (`compose/hud.ts`; FR-017 to FR-021)

The placements table, `HUD_PLACEMENTS`, keeps every entry spec 005 gave it, and gains the compact clusters' entries (plan.md §3). Two kinds of box come out of it:

| Function | Gives | Used for |
|---|---|---|
| `hudBoxes(screen, state, metrics)` (spec 005's, unchanged) | the bands: `strip`, `bar`, `column` or `dock`, and `clear`, spec 005's clear area | the ease's far end (§2), the floor (FR-061), the notes' and the walking control's places, and the CSS properties spec 012 reads (`--clear-*`, `--notes-h`, `--column-w`) |
| `compactBoxes(screen, state, metrics)` (new) | the HUD boxes the visitor sees at rest, each taking its own pointer: `strip` (as wide as its words, centred, at the top), `bar` (the tiles' cluster at the foot, its place along the foot the table's: plan PD-6), `column` (its content's height at its band's foot) or `dock` (spec 005's, unchanged), and `walk` (spec 008's control in the clear area's bottom-right corner) | the protection (§2), RG6's reserved boxes (§5), the coverage (§3), the walking hold's edge (§6), and `room.css`'s sizes |

Rules:
- Each compact box lies inside its band: `compactBoxes(...).column` inside `hudBoxes(...).column`, and so on. The stages test pins it.
- The dock layout's compact boxes are its bands (FR-020).
- The column's content height is computed from the table, as the dock's is today: the list's rows by the width bands, its header, the conversation's header, the log's rest height (`log.restRem`, plan PD-7), the label, and the text box's row, with the panels' padding.
- The strip's width is its words' measured width plus its padding, at most the window less the safe areas; its lines by spec 005's bands where the words wrap. The bar's width is the sum of its tiles' widths and gaps, at most the window; its rows by spec 005's bands.
- A sheet, the larger view, and the resume are not compact boxes: they never enter the ease, the coverage, or the hold's edge (the room never re-frames for them: spec 005 FR-027, FR-028).

## 2. The frame area and its ease (`compose/frame.ts`; FR-009 to FR-013)

```ts
interface Protect {
  /** The protected boxes on the canvas, in CSS pixels from the window's top left, when the room is framed into `area`
   *  with the production framing at `area`'s aspect: each pressable selectable's 44 × 44 core part, and each figure's
   *  framed box. A selectable that is list-only at spec 005's frame is absent. */
  boxes(area: Box): readonly Box[];
}

interface FrameArea {
  readonly area: Box;    // the box the room is framed into
  readonly ease: number; // k / 16, k in 0..16
  readonly fellBack: boolean; // true when §4's fallback chose it
}

function frameArea(screen, state, metrics, protect: Protect): FrameArea;
```

- **The step.** For k = 0, 1, …, 16, with t = k / 16 and `clear` the bands' clear area: `area(t) = { x: t·clear.x, y: t·clear.y, w: W + t·(clear.w − W), h: H + t·(clear.h − H) }`, the window being `{0, 0, W, H}`. The first k at which every box of `protect.boxes(area(t))` lies outside every compact box by at least `0.5 × metrics.rem` is chosen. At k = 16 the area is `clear`, spec 005's frame; it is chosen whether or not the test holds there, since spec 005's own checks already judged it.
- **"Outside by at least m"**: the two boxes, the HUD box grown by m on each side, don't overlap. Boxes that only touch don't overlap.
- **Holding the clear area.** `area(t)` holds `clear` for every t in [0, 1], since each edge moves monotonically from the window's toward the clear area's. So the room's scale at the chosen area is at least spec 005's (FR-012).
- **Cost.** At most 17 calls of `protect.boxes`, each one framing (`framing.ts`) and one projection of the selectables' and the figures' boxes (`pick.ts`'s areas). No allocation beyond the boxes.
- **Determinism.** The same inputs give the same `FrameArea`, in Node and in the browser, so the compositor's stages are the room's.

## 3. The coverage (`compose/hud.ts`; FR-019)

`alwaysOnCoverage(screen, metrics)`: the area of the union of `compactBoxes(screen, OPENING, metrics)` (with the log at its rest height, and the walking control) and the notes' reserve (`notesReserve`, at the clear area's top left, as wide as the notes' longest words allow) over `W × H`. The layout model (`test/ui/hud-model.ts`, real text widths) supplies the strip's and the bar's measured widths, as it does the bands' line and row counts today. The test holds it at most 0.25 on every landscape screen of the sweep from 1280 × 720 to 3840 × 2160 in the column layout.

## 4. The fallback (FR-004)

`frameArea` never throws to the room: if `protect.boxes` throws, or gives a box that isn't finite, at any step, the result is `{ area: clear, ease: 1, fellBack: true }`. The room frames into it and, in a drafts build, logs the fallback (FR-064).

## 5. The stages and the checks (`compose/stages.ts`, `build/room/checks/rg.ts`; FR-060, FR-061)

- **A supported stage** becomes `{ w, h, reserved }`: the frame area's size for a screen and a docked-panel state, and the compact boxes that overlap it, plus the walking control's, translated into the area's own pixels and clipped to it. `stageFor(screen)` keeps its name and gives the opening state's.
- **The protector the compositor passes** is built from the composed scene, as the runtime's is from the bundle: the framed boxes for the framing, the selectables' members for the pick areas, and the figures' framed boxes.
- **RG6** reserves every reserved box, as it reserves the walking control's today. RG5 and RG7 are unchanged.
- **The floor** (spec 005 FR-054): every screen's frame area holds its clear area, which holds its stage before spec 005 (`test/room/legacy-stages.ts`), so `test/room/stages-floor.test.ts` holds unchanged.
- **The list-only set** (spec 005 FR-057): at each screen, the selectables RG6 finds list-only at the frame area are a subset of those at the clear area.
- **The report** (spec 004 FR-073) gains a line per screen class: the ease, and the room's scale over spec 005's frame.
- **Data edits.** The stages now depend on the scene's selectables and figures through the protector. A data edit that moves a piece can change a screen's ease, never below spec 005's frame (§2) and never with a pressable piece under a panel (§2's test), so no check can be weakened by it.

## 6. The walking hold's edge (`walk/hold.ts`; FR-032)

`nearsEdge(figureBox, hud, window, rem)`: true when the figure's framed box, projected at the current camera onto the canvas, comes within `0.5 × rem` of any compact box or of the window's edge. At the room's view the frame's protection keeps the figure's box at least that far from every compact box, so entering the walking view never ends the hold at once; the window's edge is beyond the frame's margin.

## 7. The runtime (`scene.ts`, `fit.ts`)

- `SceneOptions.clear()` becomes `SceneOptions.frame()`: `{ window, area, ease, hud }`, the frame area for the window it was computed for, and the compact boxes. The 3D stage frames into `area` only while its canvas is that window, within a pixel; otherwise into the whole canvas, as spec 005's departure B6 has it.
- The projection's shift is `fit.ts`'s `viewOffsetFor(area, canvas)`, unchanged in form.
- A canvas point moves into the area's pixels by `fit.ts`'s `canvasToClear(ndc, canvas, area)` (renamed in place or kept, the plan's choice); a point inside a compact box never reaches the canvas, since the box takes its own pointer (spec 005 FR-030).

## 8. Proof

| Proof | How | Covers |
|---|---|---|
| The step's formula | `test/room/frame.test.ts`: `area(0)` is the window, `area(1)` is the clear area, every `area(t)` holds the clear area, at 1,000 random screens | FR-009, FR-012 |
| The least ease | a protector stub that clears at a chosen k; the result is that k, for every k | FR-009 |
| The real scene | the composed scene's protector over the sweep: every protected box clear by 0.5rem; the ease per screen in the report | FR-009, FR-010, SC-001 |
| The fallback | a protector that throws, and one that gives NaN: `ease` 1, `fellBack` true | FR-004 |
| The compact boxes | each inside its band; `room.css`'s rules read their properties; one-rule changes fail | FR-017, FR-021, SC-002 |
| The coverage | the model over the landscape sweep from 1280 × 720 | FR-019, SC-003 |
| The checks | RG5 to RG7 at the frame areas, the floor, and the list-only subset | FR-060, FR-061, SC-002 |
| The edge | `test/room/walk-hold.test.ts`: a figure box at each side of each compact box and the window | FR-032, SC-005 |
