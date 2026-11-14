# Implementation Plan: A Better HUD, From the Author's Examples, and a Load Screen to Match

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over"

and: "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", …". The order's rule 1: the spec-writer takes the recommended answer at clarify and at the plan. Q1 to Q5 and D1 to D8 stand as taken; each is on the morning page, and an overturned answer is reworked before he merges.

**Branch**: `night/hud-spec/spec-018` | **Spec**: [spec.md](spec.md) | **Created**: 2026-11-14

## Summary

Add a fourth HUD layout, **split**, to `compose/hud.ts`: from a landscape window of 48rem, the conversation panel on the left and the selection list on the right, in the room's own type and colours, with a frame and strokes drawn by a seeded path generator and key caps drawn in code. Restyle spec 012's loader card in the same frame. No layout under 48rem changes. No request, no telemetry, no disclosure entry.

## Technical Context

TypeScript, Vite, Three.js (existing); vitest with jsdom for the room's tests (`apps/web`); eslint and `tsc` through `make lint`. No new dependency (FR-011, D4). Storage: none. Target: the room's browsers, 320 px to a large monitor. Constraints: the CSP's `style-src 'self'` (sizes through `style.setProperty`, classes only, as `layout.ts` does); `img-src 'self'` (the frame and strokes are inline SVG elements built by script, no data: image); spec 005's FR-022 (the text box never collapsed); spec 012's behaviour unchanged.

## Constitution Check

As the spec's: I, V, VI, VII untouched or satisfied; II is met by the tests below, with the telemetry deviation named in the spec (presentation only); III by the provisional record above; IV: no human-only path is touched (`.claude/**`, `corpus/**`, `tools/gates/**` and the rest are not in the file map); VIII: the stand-in line and the AI disclosure are never covered (§4, geometry test).

## Project Structure

Documentation: `spec.md`, `plan.md`, `tasks.md`, `analysis.md`, this folder; the intent in `intent/018-better-hud-and-load-screen.md`.

Source (all under `apps/web/`; **new** marked):
- `src/room/compose/hud.ts`: `HudLayout` gains `"split"`; `HUD_PLACEMENTS.split`; `layoutFor`, `hudBoxes`, `fitsHud`.
- `src/room/hud/frame.ts` **new**: `roughFramePath(w, h, seed)`, `brushStrokePath(w, seed)`: pure, deterministic.
- `src/room/hud/keycap.ts` **new**: `keycap(doc, name)`.
- `src/room/hud/stats.ts` **new**: `statsFrom(tier, cost, words)`: the three stats' labels and values.
- `src/room/hud/split.ts` **new**: builds the panel's parts (title, hint, emblem, stats, portrait slot) and the list's parts (label, Back, strokes, confirm cap), and the selected-entry logic.
- `src/room/layout.ts`, `src/talk/talk.ts`, `src/room/app.ts`: wire the parts; panel states `bar`/`open`; Escape's added step (FR-009).
- `src/room/hud/split.css` **new**, `room.css`, `loading/loading.css`, `loading/view.ts`: styles; the loader's frame and title.
- `room/ui-words.yaml`, `src/room/ui-keys.ts`: new words (§6).
- Tests: `test/room/hud-split-geometry.test.ts`, `hud-frame.test.ts`, `hud-stats.test.ts`, `test/ui/hud-split.test.ts`, `hud-split-a11y.test.ts`, `hud-split-fallback.test.ts`, `loading-style.test.ts`, `hud-split-contrast.test.ts` (all **new**).

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| P1 | A fourth layout, not a rewrite of the column | Spec 005/014's layouts are pinned by many tests and are the degraded mode (FR-001); the new one adds beside them. |
| P2 | Panel states `bar` and `open`, one DOM | One text box, one log, one Tab stop; the bar is a CSS state, so the log and text survive a resize (edge case). |
| P3 | Frame and strokes are SVG built by script from a seeded path | CSP-safe, no file, no filter, testable by string (D3, D6). |
| P4 | Key caps are small spans in code, `aria-hidden`, their names in the buttons' accessible names | FR-013, FR-016. |
| P5 | The stats read the signals the neon sign reads (`signals/turn-cost.ts`, the tier signal) | FR-010, no new source. |
| P6 | The portrait is spec 016's still, fetched through its existing verified path | Q4; no new byte. At this writing the still is fetched inside `flat.ts`'s `renderFlat` (its `fetch` option), with no export of its own: T010 either extracts that fetch-and-verify into a shared function with `twin-2d.test.ts` as its guard, or, if that needs a new network path, stops and uses the silhouette (analysis.md, finding F3). |
| P7 | The selected entry is focus, else hover, else the open piece; rows keep their size, the enlarged type sits in a fixed-height row | FR-008, no layout shift. |

## 2. Geometry (`HUD_PLACEMENTS.split`)

`minWidthRem: 48`, landscape; `panel: { shareMax: 0.5, maxRem: 40 }` (the bar's height is the text box row's, `HUD_PLACEMENTS.talk`), `list: { widthRem: 24 }`. The panel's box is anchored left under the strip, above the bar; the list's right, under the strip, above the bar; `clearArea` is what remains. `fitsHud` holds the least clear area (304 × 196) as today; where it doesn't fit, the column layout is tried, then dock, then stacked. The notes' reserve and the walking control are in the clear area, so no sheet reaches them (spec 005). One table: the CSS and the geometry test read the same numbers.

## 3. The panel (`hud/split.ts`, `talk.ts`)

DOM, in order: title (a heading-less `div` label above the frame; the room's h1 is unchanged); the frame (`svg`, `aria-hidden`); the hint (a button: key cap + short label, "Esc"/"Close" wording from the words); emblem + stats (`dl`: label `dt`, value `dd`); the body (the log, spec 002's, restyled); the text box row; the portrait slot. The log, text box, Send, and talk button are the existing elements, moved by CSS, not recreated (`talk.ts` keeps its API). State `open` is set when a conversation starts or the bar's title, the log's existing toggle (`hud.log_toggle`), is pressed; `bar` on Back/Escape. Escape's order: abort the turn; else stop walking; else close the panel (FR-009).

## 4. The list (`hud/split.ts`)

The list's existing buttons keep their handlers; the label, "Back", and the strokes are added around them. `aria-current` follows P7. The strokes are two `svg` elements positioned above and below the selected row by CSS classes. Arrow keys: the existing roving behaviour, if any, stays; none is added (tab order is spec 005's).

## 5. The look and the loader

Type and colours from `room.css`'s variables; `split.css` holds the rules. The loader card (`loading/view.ts`) gains the frame element and the title, and `loading.css` the type; the bar, tints, hints, and timing code is not edited, so spec 012's tests are its guard. Contrast: `hud-split-contrast.test.ts` follows `loading-contrast.test.ts`.

## 6. Words

New keys, plain and about the machine only: `hud.select`, "Select a piece"; `hud.back`, "Back"; `hud.close`, "Close"; `key.esc`, "Esc"; `key.enter`, "Enter"; `stat.serving`, "SERVING" (labels are capitals by CSS, the words are sentence case); `stat.call`, "This call"; `stat.visit`, "This visit"; `stat.unknown`, "—"; `stat.tier.local|cloud|resting|budget|unavailable|unknown`: "Local", "Cloud", "Resting", "Budget", "Unavailable", "Unknown". Added to `ui-words.yaml` and `ui-keys.ts`'s closed list; `test/room/words.test.ts` is their guard.

## 7. Telemetry, cost, disclosure

None (spec; D7). Cost: $0.

## 8. Accessibility

As FR-016 to FR-018; `hud-split-a11y.test.ts` runs axe on the open and bar states and asserts the Tab order and the accessible names.

## 9. Fault handling

`split.ts` wraps the decoration (frame, strokes, portrait, key caps) in one try/catch per part that falls back to the plain form (FR-002); `hud-split-fallback.test.ts` forces each to throw.

## 10. Tests

Test-first. Small runs, per task: `cd apps/web && npx vitest run <files>` and `make lint`. Covering existing tests, run with the task that changes their subject: `hud.test.ts`, `hud-notes.test.ts`, `hud-a11y.test.ts`, `stages.test.ts`, `words.test.ts` (for `hud.ts`, `ui-words.yaml`); `loading-*.test.ts` (for the loader's files). The full suite is **not** run in this item: the stack's last task runs it once (the order's rule 4). `twin-2d.test.ts` is known flaky under load.

## 11. The Author's look approval

A dev-cpu stack (`make up ENV=dev-cpu`) shows the room; the implementer records screenshots' paths in the note if its sandbox can take them. His look approval is his, at the morning; a change from it is rework.

## 12. Stack and gate

This is item 1: its tip is the base for the next item (avatar walking leg animations). The note, `docs/merge-requests/2026-11-14-night-stack.md`, gets this item's section; the last item names the stack once. No human-only patch comes from this item.

## Departures from this plan (the implementation's, recorded with the commit that makes them)

- **D-I1 (T007): the split layout is a refinement of the column layout, not a fourth `HudLayout`.** `layoutFor` and `HudLayout` are unchanged; `compose/hud.ts` gains `HUD_PLACEMENTS.split` and `splitBoxes(screen, state, metrics)`, which returns the panel's, its resting bar's, and the list's boxes, or null (a window under 48rem, a portrait one, a non-column one, or one whose left half can't hold an 18rem × 14rem panel clear of the notes' reserve and the walking control). Why: `data-hud="column"` at 1280 × 720 is pinned by spec 005's and 014's tests, which T007 requires to pass unchanged; the bands, the clear area, and the compositor's checks (`stages.ts`) then stay the column layout's and need no new sweep. The root carries `data-split="on"` beside `data-hud="column"`. The panel (open) is within the clear area's left, under the notes' reserve; the list within the column's right 24rem, at most 22rem tall.
- **D-I2 (T009): the title is the log's own toggle, unchanged, and the panel opens from the bar by the larger toggle.** §3 had the title toggle the panel. Spec 005's tests (`hud.test.ts`, `hud-a11y.test.ts`) pin the log toggle's collapse at 1280 × 720, now in the split layout, and require them to pass unchanged; so the toggle keeps collapsing the log, and the panel opens by a conversation starting, a line in the log, a piece chosen, or the existing "Larger conversation" toggle (`talk.onLarger`), and closes by Back, the hint, Escape, or "Smaller conversation". The bar's height gains the title row (`split.panel.titleRem`). The panel's decoration (hint, emblem, stats, frame, portrait) exists only while it is open.
- **D-I3 (T012): one pinned test is amended.** `test/ui/hud-look.test.ts` (spec 014's FR-022: every HUD control a tile) now skips the list's entries and the conversation's title where the root says `data-split="on"`, because spec 018's FR-007 and FR-008 make them right-aligned text on the glass, selected by colour and strokes. Every other control in the split layout, and every control in the other layouts, is still checked. This is the one existing test the stack edits; the Author may overturn it at the morning page.

## Complexity Tracking

One new layout beside three: the cost, named, of P1, for the degraded mode and the tests' stability.
