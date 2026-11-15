# Group A's notes: spec 028, the layout and words (`impl-028a`, night of 2026-11-15, implementer, Opus 5.5)

Branch `night/impl-028a/impl-028a`, from spec-028's tip `9cf2f91f`. Paths are under `apps/web/` unless they start otherwise. Every departure from the plan is recorded in `plan.md` in the commit that made it (its "As built" paragraphs in §R-A2 to §R-A7, the table in §R-A3, and the "Found by T-A0n" lists in §R-B8).

## For group B: T-A06's commit

**T-A06: `33436c6e`** (`feat(028): T-A06 the top-left labels leave the screen; their words are Around the room's lines`). Merge it for `src/room/app.ts` (T-B05): `git merge 33436c6e`. It carries every `app.ts` edit of group A: T-A03's (the split's still fetch gone; the re-fit takes the wall from the stage's protector, or the 2D drawing's before a stage) and T-A06's (`showPlaceholders`, `showLine`, `showVisitorLine` write "Around the room" alone; `renderRoom` loses its `note`, `noteAvatar`, `standIn` parts). It also carries this branch's merge of T-B01 (`eeede9c0`). No later group A commit touches `app.ts`.

## The commits

| Task | RED | GREEN |
|---|---|---|
| T-A01, T-A02 | `7b5d07ed` | `bba736a2` |
| T-A03 | `2cc81c7a` | `055ec7fc` |
| T-A04 | `9faef931` | `3bffe241` |
| T-A05 | `bb3dc6f7` | `089d137c` |
| T-A06 | merge of T-B01 `0ceb765d`; RED `76d645f9` | `33436c6e` |
| T-A07 | `1821a07f` | `2efd91cf` |
| T-A08 | `edb441f8` | `b586b379`; fix `64111be2` (absolute, not fixed) |
| T-A09 | `34bf6a97` (T-A06 named), `b16bb225` (lint), the notes' draft | this note |

Tests ran with `../../node_modules/.bin/vitest run <files> --maxWorkers=1` from `apps/web/` (`cpu.max` 400000/100000 = 4 CPUs, ÷ 4 = 1 worker), after `npm ci --ignore-scripts`. Never bare `npx`.

## The page's question (asked, recommended answer taken)

Written to `/night/io/out/questions.md` during T-A05:

> ### Q: The split layout beside the room's walls leaves the room a narrower stage than spec 004's on windows under about 1359 px wide (1027 of the sweep's screens, the first 976 × 320: 304 × 292.5 under 571.2 × 208; 1280 × 720: 608 px wide under 686.4), which spec 005's floor (FR-054, "no check weakens") refuses. Should those windows keep today's column layout?
> Blocks: T-A05 (impl-028a) · Recommended: yes: the split layout is taken only where its frame area is at least 686.4 px wide, spec 004's widest stage (the reference desktop's before spec 005), so no split stage is under its screen's old stage; 1366 × 768 and wider take it, 1280 × 720 keeps the column layout · Others: smaller least widths (the panel 16rem, the column 15rem), which brings 1280 × 720 in but still leaves the narrower windows to the column layout; lower the floor for the split's stages (refused: his rule says never lower the floor)

It isn't RG7 (plan R-1): RG5 to RG7 passed at every stage, R-1 didn't happen. It was spec 005's stage floor, `test/room/stages-floor.test.ts`. The floor wasn't lowered; FR-009 (b) gained `HUD_PLACEMENTS.wall.minAreaWidthPx: 686.4`.

## T-A01, T-A02: the wall box and the geometry

New: `test/room/wall-box.test.ts`, `test/room/hud-wall-geometry.test.ts`; `src/room/compose/wall.ts`; `compose/hud.ts` (`HUD_PLACEMENTS.wall`, `wallArea`, `wallBoxes`, `splitBoxes` its alias, `compactBoxes`' split branch, the `wall` option); `compose/frame.ts` (the split's area, no ease; `Protect.wall`); `compose/protect.ts` (the protectors' `wall`: the 3D one's from the shell, the 2D one's the drawing's placed box).

RED (`7b5d07ed`): `Test Files 2 failed (2) · Tests 22 failed | 1 passed (23)` (the missing exports).

The table the first case prints (recorded in plan §R-A3; printed again after T-A05's rule):

```
| Window | Layout | Wall box | Panel w | Column w |
|---|---|---|---|---|
| 1920 × 1080 | split | 524.6, 137.5, 902.9 × 902.9 | 492.6 | 460.6 |
| 2560 × 1440 | split | 690.2, 175.2, 1211.7 × 1211.7 | 658.2 | 512 |
| 1920 × 1200 | split | 473.1, 150.1, 1005.8 × 1005.8 | 441.1 | 409.1 |
| 1680 × 1050 | split | 449.6, 164.1, 812.7 × 812.7 | 417.6 | 385.6 |
| 1280 × 720 | column | — | — | — |
| 1366 × 768 | split | 419.2, 139.8, 559.5 × 559.5 | 387.2 | 355.2 |
| 844 × 390 | column | — | — | — |
| 768 × 1024 | dock | — | — | — |
| 700 × 500 | column | — | — | — |
| 320 × 568 | dock | — | — | — |
```

GREEN: `wall-box`, `hud-wall-geometry`: `Tests 35 passed (35)`. T-A02's list (`hud-split-geometry`, `frame`, `room/hud`, `framing`, `ui/hud-split-model`, `ui/hud-model`, `eat-box`, `protect`, with T-A01's): `Test Files 10 passed (10) · Tests 107 passed (107)`.

## T-A03: the panel

New: `test/ui/split-no-still.test.ts`, `test/ui/hud-wall-dom.test.ts`. Code: `hud/split.ts`, `hud/split.css`, `layout.ts` (`--wall-*`), `app.ts`.

RED (`2cc81c7a`): `Tests 37 failed` over the four files (the cases that weren't rewritten failed only because the room took no split until `app.ts` passed the wall).

GREEN, T-A03's list (`split-no-still`, `hud-wall-dom`, `hud-split`, `hud-split-rest-row`, `hud-split-fallback`, `hud-split-a11y`, `hud-split-contrast`, `resize`, `room/flat`, `flat-frame`, `room/hud`, `eat-button`): `Test Files 12 passed (12) · Tests 176 passed (176)`; then `hud-look`, `avatars`, `twin-compose`, `eat-place`, `hud-a11y`, `ui/hud`, `hud-pointer`: `Test Files 2 passed (2) · Tests 34 passed (34)` for the two that had failed, the rest passing in the run before.

## T-A04: the list

New: `test/ui/hud-split-list.test.ts`. Code: `hud/keycap.ts` (`KEYCAP`, `keycapWidthRem`), `hud/split.css`. RED: `Tests 5 failed | 3 passed (8)`. GREEN (`hud-split-list`, `hud-split`, `hud-look`, `hud-a11y`, `hud-split-contrast`): `Test Files 5 passed (5) · Tests 98 passed (98)`.

## T-A05: the compositor

Code: `compose/stages.ts`, `compose/hud.ts` (`minAreaWidthPx`), `compose/wall.ts` (inputs on the bundle's 1e-6 m grid), `build/room/checks/rg.ts` (the protector's input gains the shell). RED (`bb3dc6f7`): `Tests 6 failed | 21 passed (27)` in `stages`, `stages-floor`.

GREEN: `stages`, `stages-floor`, `hud-wall-geometry`, `wall-box`, `hud-split-geometry`, `eat-box`, `protect`, `frame`: `Test Files 8 passed (8) · Tests 94 passed (94)`. The stage-reading files (`lookdev/candidate`, `lookdev/page`, `lookdev/phone`, `cli`, `data-only`, `determinism`, `dinosaur-compose`, `eat-checks`, `eat-model`, `geometry`, `legacy-stages`, `legibility`, `report`, `stages-checks`, `twin-reach`, `ui/pick`, `eat-box`, `protect`, `frame`): first `Test Files 5 failed | 14 passed (19) · Tests 9 failed | 368 passed | 1 skipped (378)`, each failure a pin of the old stages, rewritten (below); then the five: `Test Files 5 passed (5) · Tests 133 passed (133)`.

The compositor's checks on the room's data:

```
$ npm run room:check -w apps/web
> @h4reet/web@0.1.0 room:check
> node --import tsx build/room/cli.ts check

room: 0 findings in 0 files
(exit 0)
```

`npm run room:report -w apps/web` (exit 0), its stages and frame lines and its end:

```
Stages (spec 005, FR-052 to FR-054): the clear areas of the HUD's column and dock layouts, a dock screen's with its list open and collapsed, over 7,241 screens from 320 × 320 to 5120 × 3840, 7,291 stages; the reference desktop's 1472 × 1120.5 (1920 × 1200 at a pixel ratio of 1) and the reference phone's 384 × 422 (384 × 740 at 2.8125).

Frame (spec 014, FR-060, FR-061): the frame areas over the same screens, eased from the window toward each clear area only as far as keeps every pressable selectable's core and both figures 0.5rem clear of the HUD's compact boxes; 7,671 stages, each with the HUD boxes over it reserved.
- the dock layout: 3,972 screens and states, 1,648 at ease 0, 954 between, 1,370 at ease 1; the median 7/16.
- the column layout under 1280 × 720: 2,821 screens and states, 1,050 at ease 0, 1,473 between, 298 at ease 1; the median 13/16.
- the column layout from 1280 × 720: 2,437 screens and states, 2,279 at ease 0, 158 between, 0 at ease 1; the median 0.
- The reference desktop (1920 × 1200): ease 0, a frame area of 1248 × 1172.5 over spec 005's 1472 × 1120.5, the room 4.6% larger on screen.
- The reference phone (384 × 740): ease 1, a frame area of 384 × 422 over spec 005's 384 × 422, the room 0.0% larger on screen.
…
Findings: none.
```

RG5 (aspects), RG6 (spacing), RG7 (legibility: every readable face "readable" at the reference desktop's split stage, the counters exempt on the phone as before): no finding. (This report was run before `wall.ts`'s grid change; `room:check` was run again after it: 0 findings, exit 0.)

## T-A06: the notes

Merged T-B01 (`eeede9c0`) first (`0ceb765d`). New: `test/ui/notes-gone.test.ts`. Code: `layout.ts`, `text-copy.ts` (`setPlaceholders`, `placeholderWords`, `data-line` on the slots), `app.ts`. `notesReserve` unchanged (plan §R-A5, "As built"). RED: `notes-gone`, `notes-causes`: `Tests 13 failed | 3 passed (16)`.

GREEN: `notes-gone`, `avatars`, `ui/hud`, `dog-line`, `likeness-line-anywhere`, `likeness-visitor`, `notes-causes`, `hud-notes`, `loading-notes`, `text-copy`: `Test Files 10 passed (10) · Tests 88 passed (88)`; `hud-faults`, `loading-faults`, `loading-page`, `twin-compose`, `loading-degraded`, `eat-key-repeat`, `eat-place`, `eat-button`, `hud-pointer`, `hud-contrast`: `Test Files 1 failed | 9 passed (10) · Tests 1 failed | 143 passed (144)`, the one `hud-faults`' frame check (rewritten, below), then `Tests 17 passed (17)`; `a11y`, `hud-a11y`: `Test Files 2 passed (2) · Tests 57 passed (57)`.

## T-A07: the Credits page

Code: `build/credits.ts` (`likenessLines`, the section), `build/room/plugin.ts` (`api.composed()`), `vite.config.ts`. RED: `Tests 3 failed | 2 passed`. GREEN: `test/ui/credits.test.ts`: `Test Files 1 passed (1) · Tests 12 passed (12)` (with the release and drafts builds of vitest's global setup); `pytest -q scripts/assets/test_credits.py`: `11 passed in 1.80s`. The built page's section, from the failing run before the build case was rewritten:

```html
<section class="credits-likeness" aria-labelledby="the-ai-made-figures">
<h2 id="the-ai-made-figures">The AI-made figures</h2>
<p>The twin is an AI-made, stylized likeness of the Author, shown by his choice.</p>
<p>The dog is an AI-made, stylized Nova Scotia Duck Tolling Retriever, a dog of the breed and not a likeness of the Author&#39;s dog, shown by his choice.</p>
</section>
```

## T-A08: "Around the room"

Code: `room.css`. RED: `Tests 2 failed | 4 passed` (the Tab order and stacked cases already held). GREEN: `around`, `a11y`, `text-copy`: `Test Files 3 passed (3) · Tests 60 passed (60)`; `room/text`, `pause`, `room/live`, `hud-contrast`, `loading-a11y`, `hud-look`: `Test Files 6 passed (6) · Tests 116 passed (116)`.

## Every test file this branch changed, at its tip

All 39 files (the 38 test files `git diff --name-only 9cf2f91f` lists, but `vocabulary.test.ts`, which is T-B01's, and `test/room/protect.test.ts`, whose snapshot changed), at `b16bb225`:

```
$ ../../node_modules/.bin/vitest run <the 39 files> --maxWorkers=1
     × lays no fixed part but the strip over the page's flow, and scrolls focus clear of the strip and in the panels 5ms
 FAIL  test/ui/hud-a11y.test.ts > focus is never hidden (FR-044) > lays no fixed part but the strip over the page's flow, and scrolls focus clear of the strip and in the panels
+ [
+   "html[data-hud=\"column\"] .room-around:focus",
+   "html[data-hud=\"dock\"] .room-around:focus",
+ ]
 Test Files  1 failed | 38 passed (39)
      Tests  1 failed | 581 passed (582)
```

T-A08's focused overlay was `position: fixed`, which spec 005's FR-044 pin refuses; T-A08's run hadn't included `hud-a11y`. Fixed in the code (`64111be2`: `position: absolute`), the test untouched; my own `around.test.ts` case that pinned `fixed` now pins `absolute`. Then:

```
$ ../../node_modules/.bin/vitest run test/ui/hud-a11y.test.ts test/ui/around.test.ts test/room/wall-box.test.ts test/room/hud-wall-geometry.test.ts --maxWorkers=1
 Test Files  4 passed (4)
      Tests  69 passed (69)
```

(`wall-box` and `hud-wall-geometry` are in it because `b16bb225`, the lint fix, touched them while the tip run was going.)

## Every rewritten case (old name → new name)

Each in the task that changed its subject, test-first in that task's RED commit unless said otherwise, and named in plan §R-B8.

**T-A02** (spec 018's rest-row split, which no window takes without a wall)
- `test/room/hud-split-geometry.test.ts`, rewritten whole, as the plan says: "is chosen at exactly the sweep's windows where (a) to (e) hold, with the oracle's boxes", "agrees with the oracle at a 20-pixel root and with safe areas", "gives plan.md §2's boxes at 1392 x 783 / 1920 x 1080 / 1920 x 1200 / 2560 x 1440" → (spec 028's rule and boxes are `hud-wall-geometry`'s) "is spec 028's wallBoxes under spec 018's name", "is a refinement of the column layout: never chosen where the window takes the dock layout", "gives compactBoxes the strip, the panel, and the column at rest where chosen (FR-003)"; "is not chosen at the review's narrower windows" → "is not chosen at the review's narrowest windows"; "leaves compactBoxes the column or dock layout's where it isn't chosen" and "keeps every chosen window's parts apart over the sweep" kept their names, their bodies the new parts.
- `test/room/eat-box.test.ts` (spec 024): `today()` without `rest`; "lies inside its band or the clear area, apart from every other box of `all`, listed right after `walk`" → "…, outside the split layout"; "ends the split layout's list above it where it sits above `walk`, its height still positive" → "sits beside `walk` in the split layout's tiles' block, the list and every other box unchanged (spec 028)"; "takes the split layout with the option exactly where it does without" → "… (spec 028: no cover rule)"; the snapshot of "gives every compact box, `all`, `walkPlace`, the split's choice, and the reserved boxes as before" rewritten (`-u`), its 20 windows where spec 018's split was taken now the column layout.
- `test/room/frame.test.ts` (spec 014): `UNDER`, and "keeps a protected box 0.5rem clear: 7.9 pixels from the column is too near, 8 is clear" (name kept), read the column's compact box. Edited in the GREEN commit, after T-A02's code showed them.
- `test/room/protect.test.ts` (spec 014): the snapshot of "records the boxes at the reference desktop's window and clear area", its `compact` part only (`-u`). In the GREEN commit.

**T-A03** (the portrait, the bar state, and the column layout at windows that now take the split)
- `test/ui/hud-split.test.ts`: "opens as the bar: the title, the text box row, Send, and talk; no frame, stats, or portrait" → "stands open at rest (spec 028): the title, the frame, the emblem and stats, the text box row; no portrait, no hint shown"; "opens the panel when a conversation starts: the hint with its key cap, the emblem, the three stats, the portrait slot" → "shows the hint with its key cap when a conversation starts, beside the emblem and the three stats; no portrait (spec 028)"; "opens from the bar by the larger toggle, and the hint closes it, ending the larger view" → "the hint closes the open conversation, ending the larger view, the panel standing (spec 028)"; "with a turn out, Escape stops the turn first; then Escape closes to the bar and focuses the selected entry" → "…; then Escape closes the conversation, the panel standing, and focuses the selected entry"; "keeps the log and the typed text across a resize to 1280 x 720, which takes no split, and back" → "… to 844 x 390, …"; "shows the still where the fetch gives one, the silhouette until then and where it fails" → "shows no portrait, still or silhouette, at rest, open, or closed (spec 028)"; "fetches once, at the first opening, never while a bar" → "fetches nothing at any opening (spec 028)"; "has the label, and Back only while the panel is open, named with its key" → "has the label, and Back only while a conversation is open, named with its key; Back leaves the panel standing (spec 028)"; "Escape outside the conversation closes the panel and ends the larger view (finding 1)" → "Escape outside the conversation closes the open conversation and ends the larger view, the panel standing (finding 1; spec 028)"; "a part that throws midway leaves no stray part behind, and the next opening builds one set (finding 2)" → "…, and one set stands, its hint hidden once closed (finding 2; spec 028)"; "keeps the focus and the portrait when the window changes size while the panel is open (finding 5)" → "keeps the focus and the panel's parts when the window changes size while a conversation is open (finding 5; spec 028)"; "does not open for a conversation in a window the split layout doesn't take (finding 6)" → "opens no conversation's parts for a conversation in a window the split layout doesn't take (finding 6; spec 028)"; "is in the bar's band at its left, at --split-rest-*, holding the head and the text box row" → "is gone: the panel holds the head and the text box row, at --wall-panel-* (spec 028)"; "opens the panel round the frame's box, its title row at --split-title-h, the frame below it" → "stands at the panel's box, its title row at --wall-title-h, the frame below it (spec 028)"; "opens the panel for a sent turn with no piece open, free talk included" → "opens the conversation for a sent turn with no piece open, free talk included (spec 028: the panel stands open)"; "goes back to Larger conversation where that opened it" → "… , the panel standing (spec 028)"; "goes back to the text box where a sent turn opened it" → "… , the panel standing (spec 028)"; "draws and fetches the speaker's portrait, the twin's by default" → "draws no portrait for any speaker, the twin's or another (spec 028, FR-001)"; "keeps the rest row and the open panel's foot above the keyboard's inset, at a landscape tablet in the split layout" → "keeps the panel's foot above the keyboard's inset, at a landscape tablet in the split layout (spec 028: no rest row)".
- `test/ui/hud-split-rest-row.test.ts`: "keeps the rest row on one line" → "keeps the panel's text box row on one line (spec 028: the rest row is gone)"; "gives the rest row's text box a least width of 0, so it can shrink inside the glass" → "gives the panel's text box a least width of 0, so it can shrink inside the glass (spec 028)".
- `test/ui/hud-split-a11y.test.ts`: "sizes in rem, so 200% text takes twice the window, and falls back to today's layouts where the half is too small" → "… (spec 028)"; "lifts the rest row and the open panel's foot by the keyboard's inset" → "lifts the panel's foot by the keyboard's inset, its top where the kernel puts it (spec 028)". Found by T-A03's GREEN run.
- `test/ui/hud-split-fallback.test.ts`: "the portrait: nothing in its slot, the body and the controls untouched" → "the portrait: none since spec 028 (FR-001), the body and the controls untouched"; "the frame: the panel's plain border, and every control still there" → "…; the hint closes the conversation, the panel standing (spec 028)"; "everything at once: still opens, closes, selects, and Escape closes" (name kept; no portrait drawer). Found by `tsc` in GREEN.
- `test/room/hud.test.ts`: "puts it at the column's head, in the column's band, on landscape windows from 1280 × 720" (name kept; its split branch's `all`). Found by `tsc`.
- `test/ui/eat-button.test.ts`: "lies off the notes and the stand-in line, and off the AI disclosure's panels, at every swept window" (name kept; the split's list without `rest`). Found by `tsc`.
- `test/ui/hud-look.test.ts`: "sets --strip-x, --strip-w, --bar-w, --column-h, and --log-rest from compactBoxes" → "…, the room's wall included (spec 028)"; "places the control at the column's head on a wide window, and in the clear area's corner on a phone" → "… (spec 028: the room's wall)"; "opens the larger conversation as tall as spec 005 drew it, above the compact column" → "… (spec 028: at a column window without the split)". Found by T-A03's GREEN run.
- `test/ui/hud-a11y.test.ts`: "hides the log's header buttons with the dock's empty sheet, and shows them with its first line; the column keeps them" → "… (spec 028: 1024 x 600)". Found by T-A03's GREEN run.

**T-A05** (the stages)
- `test/room/stages-floor.test.ts`: "holds every screen of spec 004's sweep to its old stage at its frame area, in width and in height" → "…; outside the split layout, to its clear area (spec 028)".
- `test/room/stages.test.ts`: the "stages as frame areas" block's `reservedOf` takes the room's wall (its cases' names kept).
- `test/room/eat-checks.test.ts`: "gives stages whose reserved boxes hold the Eat box; the plain sweep's stages hold none" → "gives stages whose reserved boxes hold the Eat box, or its column in the split layout; the plain sweep's stages hold none". In the GREEN commit.
- `test/lookdev/page.test.ts`: "draws %s at its full size, the camera shifted into its clear area, the HUD over it" (name kept; the frame area is the wall area where the split is taken). In GREEN.
- `test/room/legibility.test.ts`: "exempts a readable face whose regions are all turn-cost under the floor on the phone, when the desktop meets it", "holds the same face to the floor on the desktop", "holds a face whose regions are all turn-cost to the floor on the phone where the catalog doesn't mark it readable" (names kept; the counters fixture's desktop caps 52.7 → 52 and 23.4 → 23.1, its unframed shell taking no split). In GREEN.
- `test/room/report.test.ts`: "marks the counter face exempt on the phone, and the word face readable" (name kept; 23.4 → 23.1, 52.7 → 52.1). In GREEN.
- `test/room/stages-checks.test.ts`: "gives the index's screen_css from the new reference stages" (name kept; the reference desktop's stage at least spec 004's 686.4 × 640, not spec 005's 1472). In GREEN.

**T-A06** (the notes no longer drawn)
- `test/ui/notes-causes.test.ts`: its `note` helper reads "Around the room"'s placeholder line; "shows no note when every piece and the visitor's figure show their models" → "shows no placeholder words when every piece and the visitor's figure show their models; the stage holds no note (spec 028)".
- `test/ui/avatars.test.ts`: its `standInLine` helper reads "Around the room"'s first line; "shows in the stage's note and first in Around the room in 3D, as text a screen reader reads" → "shows first in Around the room in 3D, as text a screen reader reads, and nowhere on the stage (spec 028)"; "keeps the placeholder note its own paragraph beside it, shown only while stand-ins are in use" → "keeps the placeholder words a line of their own in Around the room, only while stand-ins are in use; no note on the stage (spec 028)"; "stays usable with an avatar failed: the disclosure and the stand-in line visible, the list selecting every piece" → "stays usable with an avatar failed: the disclosure visible, the stand-in line in Around the room, the list selecting every piece (spec 028)".
- `test/ui/hud.test.ts`: "lays the bar at the foot holding the toolbar's tiles in order, and the column the list then the conversation" → "…; no note on the stage (spec 028)"; "keeps the AI disclosure and the stand-in line in view in every panel state" → "keeps the AI disclosure in view in every panel state, and the stand-in line in Around the room, in no panel (spec 028)".
- `test/room/dog-line.test.ts`: its `noteLine` helper reads "Around the room"'s visitor slot; "shows in the stage's note and after the twin's line in Around the room while the dog's model shows" → "shows after the twin's line in Around the room, and not on the stage, while the dog's model shows (spec 028)"; "adds no line to the 320 × 568 layout while the cut-out shows" → "…; the stage holds no note (spec 028)".
- `test/room/likeness-line-anywhere.test.ts`: its `notes` helper and three reads of the twin's slot read "Around the room" (names kept).
- `test/ui/hud-faults.test.ts`, `test/ui/loading-faults.test.ts`: their whole-room helpers' stand-in line check (no case renamed); `hud-faults`' `expectFramed` takes the split's wall area where the split shows, which "frames the room with the live source off, and with no WebGL 2 in its 2D frame area" needed (found by T-A06's GREEN run; caused by T-A03).
- `test/ui/a11y.test.ts`: "has 0 axe violations with the twin's line shown, in 3D and after the switch to 2D" (name kept; reads the slot).
- `test/ui/loading-degraded.test.ts`: "counts a failed and a skipped file as ended, and shows the placeholder note as today" → "counts a failed and a skipped file as ended, and gives the placeholder words as today, in Around the room (spec 028)".
- `test/ui/hud-a11y.test.ts`: the axe case at each layout reads the placeholder line (name kept).
- `test/ui/text-copy.test.ts`: "sits after the conversation panel, outside the stage, in 3D and 2D, with each switch's state" and "is whole from Enter, while the 3D chunk hasn't loaded and neither drawing is on the stage" (names kept; the placeholder line expected after the line slot); "shows the placeholder note, the UI word standin.note, only while stand-ins are in use" → "gives the placeholder words, the UI word standin.note, a line of Around the room only while stand-ins are in use (spec 028)".
- `test/ui/eat-key-repeat.test.ts`, `eat-place.test.ts`, `eat-button.test.ts`: `renderRoom`'s `note: "note"` argument dropped (no case changed).
- Not changed though on the list: `test/room/likeness-visitor.test.ts`, `test/ui/hud-notes.test.ts`, `test/ui/loading-notes.test.ts` (the reserve stands).

**T-A07**
- `test/ui/credits.test.ts`: "is in the %s build at credits/index.html, rendered from the file" → "… rendered from the file and the bundle's likeness lines (spec 028)". In GREEN.

**T-A08**
- `test/ui/a11y.test.ts`: "is visible in %s after the conversation panel, outside the stage, open with nothing to expand, with the tier's sentence" → "is in %s after the conversation panel, outside the stage, open to a screen reader with nothing to expand, with the tier's sentence (spec 028: visually hidden in the HUD's layouts)" (its assertions unchanged). `test/ui/text-copy.test.ts`: a comment only. `test/ui/around.test.ts`: new cases only.

**My own new tests, changed after their RED commit** (each before or in its task's GREEN commit, none weakened to pass): `wall-box`'s "lies inside the frame area …" holds where the shell is framed (the fixture's isn't: its near face is in front of the camera); `hud-wall-geometry`'s table pin and oracle gained `minAreaWidthPx` (T-A05's RED, after the page's question), and its wall-less protector lost an unused binding (lint); `split-no-still`'s still case is a 3D visit (jsdom gives 2D without WebGL, where the 2D room rightly fetches the still) and its Back case answers the turn so the log has a line; `hud-wall-dom`'s Tab-order comparison leaves out spec 018's own "Back" and hint; `hud-split`'s finding 2 deactivates the first split before the second (both now build at activation); `hud-split-list`'s ring case checks a `split.css` reset that outranks `room.css`'s rules, not a `:not(...)` in `room.css` (which broke spec 014's selector pin in `hud-look`); `credits`' order case follows `AVATARS` (woman, man, dinosaur, dog); `around`'s focus case pins `absolute`, not `fixed`, after the tip run found spec 005's FR-044 pin refusing `fixed` (`64111be2`).

## Refusals

None. No hook, bash-gate, or permission refusal this session.

## `make lint`

At `64111be2`:

```
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
855 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

`make test` and `make evals` were not run here: his rule 4 ("Small tests, and the full suite once") gives the one full `make check` to the integration task, T-INT.

## What's left

- **His answer** to the page's question above (the 686.4 px area); the rest of Q1 to Q19 are the spec's.
- **T-INT**: merge `impl-028b` and T-DOC; `app.ts` as plan §6 says (B's T-B05 merges `33436c6e` first); row V1's still sentence (FR-002, FR-030); the one `make check`. The site's global build now carries the Credits page's section (`vite.config.ts` names the room plugin), so `test/serving.test.ts` and `test/site.test.ts`, not run here, may see a larger `credits/index.html`.
- **His look** (SC-008): the columns beside the walls and their sizes (`HUD_PLACEMENTS.wall`, data in code), the tiles' block, the list's cap slot, the focused "Around the room". His screenshot is in his checkout, out of this container's reach; nothing here was compared with it.
- **Not done, named**: `build/room/report.ts`'s "Frame" prose doesn't name the split layout (its stages count among "the column layout from 1280 × 720" at ease 0); `notesReserve` still reserves the empty notes' place (plan §R-A5); `room.css`'s `.room-note` and `.room-stand-in` rules and `HUD_PLACEMENTS.split`'s unused entries (`shareMax`, `rest`, `list`, `coverMax`, `walkGapRem`) stay, unused, for a later clean-up with their pins; the empty `.room-notes` box stays in the DOM.
- **Windows under about 1359 px wide** keep the column layout (the question): on such a window the Author would see today's column layout (which never had the thumbnail), the labels gone, and "Around the room" hidden; the panel and the column beside the walls only from about 1359 px.

## rework-028a (night of 2026-11-15, implementer, Opus 5.5)

Branch `night/rework-028a/rework-028a`, from group A's tip `14162126` (`impl-028a`'s last commit). Tests ran from `apps/web/` with `../../node_modules/.bin/vitest run <files> --maxWorkers=1` (`cpu.max` 400000/100000, 4 CPUs, ÷ 4 = 1), after `npm ci --ignore-scripts` (exit 0). Never bare `npx`.

### The merge

`718dddc4` merges `night/rework-spec-028/rework-spec-028` (`e4d29ff1`). Conflicts in `plan.md` (§R-A5's first two bullets, §R-A6) and `tasks.md` (group A's list), resolved toward the reworked spec: its text taken whole; impl-028a's "As built (T-A07)" sentence kept on §R-A5's credits bullet, its "As built (T-A08)" paragraph kept under §R-A6 marked "before the rework; superseded below"; group A's checkboxes kept `[x]`, the **Changed** notes kept beside them. `spec.md`, `analysis.md`, `notes.md`, and the intent merged with no conflict.

### The commits

| Finding | Task | RED | GREEN |
|---|---|---|---|
| N-4 (rv-spec-028), A1-2 (rv-028a-1) | T-A01, T-A02 | `9f26a218` | `eb82b711` |
| A1-1, A1-3 (rv-028a-1) | T-A02, T-A03 | `d8943aaf` | `3c4c9b66` |
| A2-1 (rv-028a-2) | T-A05 | `2736157a` | `ed8486ee` |
| B-2, I-1 (rv-spec-028), N-1 (rv-rework-spec-028) | T-A06 | `9cc443d2` | `8e3596c5` |
| B-1, N-2 (rv-spec-028) | T-A08 | `3cb76a09` | `c0f4818c` |
| A1-4 = A2-4 | (lint) | — | already fixed by impl-028a's `b16bb225`; `make lint` exit 0 below |

Each GREEN commit updates `plan.md` (§R-A2, §R-A5, §R-A6, §6) beside the code.

**For group B and T-INT:** `src/room/app.ts` changes once more after T-A06's `33436c6e`, in `8e3596c5` (`showPlaceholders` calls `copy?.setPlaceholders({ pieces, figure })`; `placeholderWords` is no longer imported there). It's a three-line hunk inside `showPlaceholders`, which T-B05 doesn't touch.

### Each finding, reworked

- **N-4, A1-2 (the panel's top; SC-001 as reworked).** `compose/hud.ts`: `HudOption` gains `notes?: boolean`; in `wallBoxes` the panel runs from `wall.y + notesReserve(clear)` while a note shows, from `wall.y` otherwise, to the wall box's foot; the column, the list, the tiles' block, and the walk don't move. Since T-A06 no note is drawn on the stage, so `app.ts` passes none and the panel's top is the wall box's (plan §R-A2, reworked bullet). The geometry test's SC-001 case now asserts the column's top and foot and the panel's foot at the wall box's, and the panel's top at the wall's with no note; a new case pushes it below the reserve with one.
- **A1-1 (Blocking: the bar over the walking control and the Eat tile).** `wallBoxes` gains `bar`, the toolbar's tile rows only, at the tiles' block's top; `walk` (and `eat` beside it) sit a gap below it, outside it. `layout.ts` writes `--wall-bar-*`; `split.css` places `.hud-bar` there (it was at `--wall-tiles-*`, the whole block, walk row included). Tested: `bar` overlaps neither `walk` nor `eat` at every table window, with and without the Eat option.
- **A1-3 (tile words wrapping into the next row).** A row is `HUD_PLACEMENTS.wall.tiles.tileRem` (3.75rem, new) × the right scale, an icon over two lines of words; `split.css`'s `grid-auto-rows` and the tile's `min-height` follow. A new case measures every tile's words with the model's text widths at every split window of the sweep: at most two lines, and the row holds the icon, the gap, the lines, the padding, and the border. A second case confirms a word does wrap at 1366 × 768 (so one-line rows wouldn't hold it).
- **A2-1 (the report's split class).** `build/room/report.ts`'s `frameLines` (now exported, over the geometry's `protect` and `framed`) gives the split layout's screens a class of their own, chosen as the room chooses it (`wallBoxes(…, { wall: protect }) !== null`), its head prose saying they are the wall area with no ease; the column classes take the rest ("from 1280 × 720" is now "(no split)"). Pinned in a new spec-028 file, `test/room/report-split.test.ts`, not in spec 004's `test/room/report.test.ts`, which this rework's tasks don't name (the supervisor's rule; plan §6 records it, and names `report.ts` as group A's).
- **B-2 (the notes' test against "Around the room").** `test/ui/notes-gone.test.ts` reads the page outside "Around the room" (the body with the section taken out of a copy) and the stage's notes (`.room-notes`, `p.room-stand-in`, `.room-visitor-line`, `p.room-note`); a new block checks that where "Around the room" shows (the dock and stacked layouts), its lines show with it. It passed before the code change (the stage held no note since T-A06); its point is that it and `around.test.ts` now both pass with the dock showing the section.
- **I-1, N-1 (the placeholder words' item).** `text-copy.ts`'s `setPlaceholders` takes `{ pieces, figure }` as plan §R-A5 gives it and joins main's stage-note words itself (`placeholderWords`, still exported); `app.ts` calls it beside the other line writers with main's argument, `figure && visit.mode !== "2d"` (N-1: `app.ts`, not `layout.ts`). A unit case in `test/ui/text-copy.test.ts` pins one item right after the visitor's line (after its slot where no line shows), main's join, and its removal when neither applies.
- **B-1, N-2 ("Around the room" in the dock layout; the focus overlay).** `room.css`: `html[data-hud="column"] .room-around:not(:focus-within)` takes the visually hidden declarations; `…:focus-within` shows it at the window's foot centre (left, right, bottom 1rem, `margin: 0 auto`, `max-width: 48rem`, `z-index: 6`, the glass), out of the layout's flow; the dock's and the stacked layout's rules are main's, so 390 × 844 and 320 × 568 show it. **Departure from plan §R-A6's text:** `position: absolute`, not `fixed`, since spec 005's FR-044 pin (`hud-a11y.test.ts`) refuses any fixed part but the strip (impl-028a's `64111be2` found it); recorded in §R-A6's "As built (`rework-028a`)".

### The runs

T-A01 (N-4) RED, `hud-wall-geometry`: `Tests 1 failed | 23 passed (24)`. GREEN, `hud-wall-geometry`, `wall-box`, `hud-split-geometry`: `Test Files 3 passed (3) · Tests 42 passed (42)`.

A1-1, A1-3 RED, `hud-wall-geometry`, `hud-wall-dom`: `Test Files 2 failed (2) · Tests 13 failed | 20 passed (33)`. GREEN, the same two: `Tests 33 passed (33)`; then the kernel's, the layout's, and `split.css`'s files (`hud-wall-geometry`, `wall-box`, `hud-split-geometry`, `frame`, `room/hud`, `framing`, `protect`, `stages`, `stages-floor`, `eat-box`, `eat-checks`, `hud-split-model`, `hud-model`, `hud-wall-dom`, `split-no-still`, `hud-split`, `hud-split-rest-row`, `hud-split-fallback`, `hud-split-a11y`, `hud-split-contrast`, `hud-split-list`, `resize`, `hud-look`, `hud-a11y`, `hud-pointer`, `eat-button`, `eat-place`, `hud-faults`): `Test Files 28 passed (28) · Tests 332 passed (332)`.

A2-1 RED, `report-split`: `TypeError: frameLines is not a function · Tests no tests`. GREEN, `report`, `report-split`, `stages-checks`, `dog-report`, `determinism`: `Test Files 5 passed (5) · Tests 50 passed (50)`. The compositor on the room's data, its frame lines:

```
$ npm run room:report -w apps/web
Frame (spec 014, FR-060, FR-061; spec 028, FR-006): the frame areas over the same screens: in the split layout (spec 028, FR-006), the wall area beside the room's walls, with no ease; elsewhere eased from the window toward each clear area only as far as keeps every pressable selectable's core and both figures 0.5rem clear of the HUD's compact boxes; 7,671 stages, each with the HUD boxes over it reserved.
- the split layout (spec 028): 3,329 screens and states, 3,329 at ease 0, 0 between, 0 at ease 1; the median 0.
- the dock layout: 3,972 screens and states, 1,648 at ease 0, 954 between, 1,370 at ease 1; the median 7/16.
- the column layout under 1280 × 720: 1,771 screens and states, 0 at ease 0, 1,473 between, 298 at ease 1; the median 14/16.
- the column layout from 1280 × 720 (no split): 158 screens and states, 0 at ease 0, 158 between, 0 at ease 1; the median 13/16.
- The reference desktop (1920 × 1200): ease 0, a frame area of 1248 × 1172.5 over spec 005's 1472 × 1120.5, the room 4.6% larger on screen.
- The reference phone (384 × 740): ease 1, a frame area of 384 × 422 over spec 005's 384 × 422, the room 0.0% larger on screen.
Findings: none.
exit 0
```

(Before, the column classes held the split's: "under 1280 × 720" 2,821 with 1,050 at ease 0, "from 1280 × 720" 2,437 with 2,279 at ease 0; the column and split rows together, 5,258, are the same.)

T-A06 RED, `text-copy`, `notes-gone`: `Test Files 1 failed | 1 passed (2) · Tests 1 failed | 17 passed (18)`. GREEN, T-A06's list (`notes-gone`, `text-copy`, `avatars`, `ui/hud`, `dog-line`, `likeness-line-anywhere`, `likeness-visitor`, `notes-causes`, `hud-notes`, `loading-notes`, `hud-faults`, `loading-faults`, `loading-page`, `twin-compose`, `loading-degraded`, `a11y`, `hud-a11y`): `Test Files 17 passed (17) · Tests 257 passed (257)`.

T-A08 RED, `around`: `Test Files 1 failed (1) · Tests 5 failed | 15 passed (20)`. GREEN, T-A08's list (`around`, `a11y`, `text-copy`, `notes-gone`, `room/text`, `pause`, `room/live`, `hud-a11y`, `loading-a11y`, `hud-look`): `Test Files 10 passed (10) · Tests 199 passed (199)`; `room/hud-contrast`: `Test Files 1 passed (1) · Tests 12 passed (12)`.

RUN_AT_TIP

### Every rewritten test case (old name → new name)

Spec 028's own files (impl-028a's, reworked here):

- `test/room/hud-wall-geometry.test.ts`: `` `at ${s.w} x ${s.h}: each column 1rem off the wall box, as tall as it, 1rem inside the window, apart` `` → `` `at ${s.w} x ${s.h}: each column 1rem off the wall box, 1rem inside the window, apart; the column's top and foot and the panel's foot the wall box's, the panel's top the wall box's with no note (SC-001 as reworked)` `` (N-4; it also checks the bar off the walk and the Eat tile, A1-1); "holds spec 028's numbers" (name kept; `tiles.tileRem: 3.75` added); the oracle gains the note and the bar, its rows 3.75rem. New: "pushes the panel's top below the notes' reserve while a note shows, its foot and the column the wall box's (FR-004, FR-014; SC-001 as reworked, N-4)"; "holds every tile's words in at most two lines, inside its row, at every split window of the sweep"; "wraps a tile's words at the narrowest split window, 1366 × 768 (so one line would not hold them)".
- `test/ui/hud-wall-dom.test.ts`: "puts the toolbar's tiles in the column's tiles' block, three to a row, and the walking control and Eat tile at their boxes" → "puts the toolbar's tiles in the column's tiles' block, three to a row, in the bar's box above the walking control and Eat tile (rv-028a-1's A1-1)"; "writes the split layout's boxes and scales, the wall from the room's protector (the 2D drawing's before a 3D one)" and "scales the panel's type by --wall-scale-left and the column's type and tiles by --wall-scale-right" (names kept; `--wall-bar-*` and the rows' 3.75rem added).
- `test/ui/notes-gone.test.ts`: `` `draws none of the four in the ${name} layout, whichever pictures show` `` → `` `puts none of the four in the stage's notes or anywhere outside Around the room in the ${name} layout, whichever pictures show (B-2)` ``; the block '"Around the room" keeps the lines (FR-015)' → '"Around the room" keeps main\'s lines, plus the placeholder words while stand-ins show (FR-015; I-1)' (its three cases' names kept). New block "where Around the room shows, its lines show with it (FR-012, FR-016; B-2, B-1)": `` `holds the stand-in line and the placeholder words in the ${name} layout, where it shows` `` for the dock and stacked layouts.
- `test/room/report-split.test.ts`: new (A2-1), four cases.

Earlier specs' files, each named by the reworked `tasks.md` (T-A06, T-A08):

- `test/ui/around.test.ts` (spec 004; T-A08): the block '"Around the room" hidden from view, kept for readers (spec 028, T-A08; FR-016)' → '"Around the room" hidden from view in the split and column layouts, kept for readers (spec 028, T-A08; FR-016)'; "takes the room's visually hidden declarations in the column and dock layouts (the split layout's among them)" → "takes the room's visually hidden declarations in the column layout (the split layout's among them), not in the dock layout (B-1)"; "shows when it has focus there, at the window's foot, over the room" → "shows while it holds focus in the column and split layouts, at the window's foot centre, over the room, taking no layout space (N-2, Q22)"; "shows in the stacked layout: no rule there hides it" → "shows in the dock and stacked layouts: no rule there hides it (B-1, Q7 as reworked)". New: "is hidden from view in the split layout, and shown while it holds focus (B-1, N-2)", the same for the column layout; "is shown in the dock (390 × 844) layout (B-1, N-2)", "… dock (320 × 568) …", "… stacked …". `` `is the room's last Tab stop in the ${name} layout, in the accessibility tree, its lines whole` `` kept. All of these are impl-028a's T-A08 cases; spec 004's own cases are untouched.
- `test/ui/a11y.test.ts` (spec 004; T-A08): "is in %s after the conversation panel, outside the stage, open to a screen reader with nothing to expand, with the tier's sentence (spec 028: visually hidden in the HUD's layouts)" → "… (spec 028: visually hidden in the split and column layouts)", and its comment; assertions unchanged.
- `test/ui/text-copy.test.ts` (spec 004; T-A06's RED case): new, "keeps the placeholder words one item right after the visitor's line, main's stage-note join, removed when neither applies (spec 028, FR-015, Q23)"; one comment changed ("in the HUD's layouts" → "in the split and column layouts").

No test was weakened, and no floor, threshold, or tolerance was loosened.

### Refusals

- **The bash gate refused one command**, a heredoc appending this section to `impl-a.md`: "Blocked by .claude/hooks/bash-gate.sh — running the agents' engine's Author commands. Route: the Author runs deploy/agents-engine/engine.sh directly (contracts/agents-engine.md §8); agents use make engine-status or make engine-smoke". This was a false match: the text being written was the pasted `make lint` output below, whose `shellcheck` line names the engine's script; nothing ran it. By his rule 5 it wasn't respelled; the section was written with the Edit tool. It's named here for the page (his rule 5: every refusal goes on the page).

### `make lint`

At `c0f4818c`:

```
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
855 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

`make test` and `make evals` weren't run here. His rule 4 ("Small tests, and the full suite once") gives the one full `make check` to T-INT.

### What's left

- **The reviewers' nits, no code here** (the supervisor's instruction):
  - rv-028a-1:
    - **A1-N1**: `compose/protect.ts` isn't in plan §6's owner table (group A edited it; name it as A's).
    - **A1-N2**: `test/ui/hud-split-a11y.test.ts:119` asserts only `if (big)`.
    - **A1-N3**: `app.ts`'s comment on `wall: protect ?? flatProtect` vs `scene.ts:861` always giving a protector.
    - **A1-N4**: `test/room/hud.test.ts:396`'s `if (c.split)` branch can't run.
    - **A1-N5**: `test/room/eat-box.test.ts` no longer checks spec 024's "listed right after `walk`" (name it in §R-B8, or check `eat` lies in `column`).
  - rv-028a-2:
    - **A2-3**: `test/room/eat-checks.test.ts:93-98` counts `held` without asserting the column in `stage.reserved`.
    - **A2-5**: `hud-wall-geometry.test.ts`'s scale case skips 1366 × 768 and 1280 × 720 (`TABLE[4]`, `TABLE[5]`), Q34's two windows.
    - **A2-6**: plan.md's two T-A05 bullets should be merged, with both renamed cases' old and new names in T-A05's notes.
    - **A2-7**: the counters fixture no longer takes the split, so RG7's unit cases cover no split stage.
  - **A2-2** went to `docfix2-028` (done there).
- **Files group A edited that plan §6 doesn't name** (for T-INT's list, N-5): `build/room/plugin.ts` (T-A07's `api.composed()`), `compose/protect.ts` (T-A02), `hud/keycap.ts` (T-A04). None of the files §6 gives to B (`stage.ts`, `compose/bundle.ts`, `scene/bundle3d.ts`, `scene/highlight.ts`) was edited by group A. `ui-keys.ts` changed only through the merge of T-B01.
- **The notes' option is in the kernel only.** No stage note exists since T-A06, so `app.ts` passes none. A note that comes back passes `notes: true` and a re-fit when it shows.
- **His look** (SC-008): the tiles' block is taller by the two-line rows. At 1920 × 1080 (right scale about 1.29) a row is about 77 px, against about 57 px before, so the list above it is about 45 px shorter. Also for his look: the dock layout's "Around the room" below the room, and the focused overlay.
- From impl-028a's list, still standing: `notesReserve`'s empty reserve, `room.css`'s unused `.room-note` and `.room-stand-in` rules, `HUD_PLACEMENTS.split`'s unused entries, the empty `.room-notes` box.

## verify-028a (night of 2026-11-15, implementer, Opus 5.5)

Branch `night/verify-028a/verify-028a`, from group A's reviewed tip `1ff6b9eb` (rework-028a's fixes; reviewed by rv-028a-3 and rv-028a-4, both not blocking). This session wrote none of group A. No code or test was changed here. The reviewers' nits (A3-1 to A3-3, A4-1, A4-N1 to A4-N4) and `RUN_AT_TIP` above are left as they are, for the line's note and T-INT.

### The merge

`0e06e268` merges the 028 line's tip `ba2b6028` (`git merge --no-ff ba2b6028`): **no conflict**. It brings documents only (`git diff --name-only 1ff6b9eb 0e06e268`, 15 files): `docs/adr/0055-no-usage-event-for-what-only-the-dinosaur-causes.md`, `docs/adr/README.md`, `docs/merge-requests/2026-11-15-night-028-line.md`, `docs/merge-requests/2026-11-15-night-record2-dino-r2-record2-dino-r2.md`, `docs/merge-requests/human-patches/023.md`, `specs/021-dinosaur-modeled-and-brought-in/studio-round-2.md`, and in `specs/028-room-after-review/`: `analysis.md`, `docfix2.md`, `docfix3.md`, `notes.md`, `plan.md`, `probe-eat.md`, `probe-pdf.md`, `spec.md`, `tasks.md`. rework-028a's notes commits after `1ff6b9eb` weren't merged; the merge task takes them.

### `git diff --name-only a36f98ec HEAD`, by area (79 files)

- **`apps/web`** (62):
  - build: `build/credits.ts`, `build/room/checks/rg.ts`, `build/room/plugin.ts`, `build/room/report.ts`, `vite.config.ts`
  - room data: `room/ui-words.yaml`
  - source: `src/room/app.ts`, `src/room/compose/frame.ts`, `src/room/compose/hud.ts`, `src/room/compose/protect.ts`, `src/room/compose/stages.ts`, `src/room/compose/wall.ts`, `src/room/hud/keycap.ts`, `src/room/hud/split.css`, `src/room/hud/split.ts`, `src/room/layout.ts`, `src/room/room.css`, `src/room/text-copy.ts`, `src/room/ui-keys.ts`
  - tests: `test/fixtures/room/good/apps/web/room/ui-words.yaml`, `test/lookdev/page.test.ts`, `test/room/__snapshots__/eat-box.test.ts.snap`, `test/room/__snapshots__/protect.test.ts.snap`, `test/room/{dog-line,eat-box,eat-checks,frame,hud-split-geometry,hud-wall-geometry,hud,legibility,likeness-line-anywhere,report-split,report,stages-checks,stages-floor,stages,vocabulary,wall-box}.test.ts`, `test/ui/{a11y,around,avatars,credits,eat-button,eat-key-repeat,eat-place,hud-a11y,hud-faults,hud-look,hud-split-a11y,hud-split-fallback,hud-split-list,hud-split-rest-row,hud-split,hud-wall-dom,hud,loading-degraded,loading-faults,notes-causes,notes-gone,split-no-still,text-copy}.test.ts`
- **docs** (5): `docs/adr/0055-no-usage-event-for-what-only-the-dinosaur-causes.md`, `docs/adr/README.md`, `docs/merge-requests/2026-11-15-night-028-line.md`, `docs/merge-requests/2026-11-15-night-record2-dino-r2-record2-dino-r2.md`, `docs/merge-requests/human-patches/023.md`
- **intent** (1): `intent/028-room-after-review.md`
- **specs** (11): `specs/021-dinosaur-modeled-and-brought-in/studio-round-2.md`; `specs/028-room-after-review/{analysis,docfix2,docfix3,impl-a,notes,plan,probe-eat,probe-pdf,spec,tasks}.md`

No Python file changed, so the only pytest runs are the docs tests and the Credits tests, as the brief names them. No human-only path is in the list.

### The runs

`npm ci --ignore-scripts` once, in the worktree (exit 0). `cpu.max` is `400000 100000`, so n = 4.

**`apps/web`'s whole vitest suite**, from `apps/web/`:

```
$ ../../node_modules/.bin/vitest run --maxWorkers=4
 Test Files  249 passed (249)
      Tests  4486 passed | 3 skipped (4489)
   Start at  16:00:25
   Duration  1577.76s (tests 71%, import 29%)
exit 0
```

The three skips are `test/content/film-links.test.ts`'s `it.skipIf(skipped("before") !== "")` cases. They run only before the resume is published (`skipped()`, `film-links.test.ts:266-273`), so they skip by the tree's state, not because of this branch. `twin-2d.test.ts` passed, so it wasn't rerun alone.

**An earlier attempt, not counted:** the same command, run while `room:report` and `make lint` ran beside it, was stopped by the session's 10-minute background limit before vitest printed its totals. In that run, `test/room/bundle.test.ts` › "the placeholders flag (spec 014, T040)" › "is the room's stand-ins alone, never an avatar's missing model" (`bundle.test.ts:1338-1344`, two repository bundles in one case) failed at 63241 ms against `testTimeout: 60_000` (`apps/web/vitest.config.ts:19`). This looks like a timeout from the shared CPU, not a fault: in the run above, alone on the machine, the whole file passed. It still deserves a note for T-INT: this case runs close to its time limit when the CPU is shared.

**The room, the compositor, and the content:**

```
$ npm run room:check -w apps/web
room: 0 findings in 0 files
exit 0

$ npm run room:report -w apps/web
Frame (spec 014, FR-060, FR-061; spec 028, FR-006): the frame areas over the same screens: in the split layout (spec 028, FR-006), the wall area beside the room's walls, with no ease; elsewhere eased from the window toward each clear area only as far as keeps every pressable selectable's core and both figures 0.5rem clear of the HUD's compact boxes; 7,671 stages, each with the HUD boxes over it reserved.
- the split layout (spec 028): 3,329 screens and states, 3,329 at ease 0, 0 between, 0 at ease 1; the median 0.
- the dock layout: 3,972 screens and states, 1,648 at ease 0, 954 between, 1,370 at ease 1; the median 7/16.
- the column layout under 1280 × 720: 1,771 screens and states, 0 at ease 0, 1,473 between, 298 at ease 1; the median 14/16.
- the column layout from 1280 × 720 (no split): 158 screens and states, 0 at ease 0, 158 between, 0 at ease 1; the median 13/16.
- The reference desktop (1920 × 1200): ease 0, a frame area of 1248 × 1172.5 over spec 005's 1472 × 1120.5, the room 4.6% larger on screen.
- The reference phone (384 × 740): ease 1, a frame area of 384 × 422 over spec 005's 384 × 422, the room 0.0% larger on screen.
Findings: none.
exit 0

$ npm run content:check -w apps/web
content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); the lock and the eval cases are current
exit 0
```

`room:report`'s frame lines match rework-028a's run line for line. Only the frame and findings lines of its 130 are pasted; the rest shows no finding. `content:check`'s "(denylist missing)": the private denylist (`corpus/intake/private/.none/denylist.txt`, `build/narration.ts:220`) can't be read from this checkout, so N3 checked the public list only.

**Docs, specs, and the Credits page:**

```
$ python3 -I -m pytest evals/test_repository_docs.py evals/test_docs_links.py -q
61 passed in 1.35s
exit 0

$ python3 -I evals/docs_links.py
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 52 of 52
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2524 relative links in 474 files
exit 0

$ python3 -I -m pytest scripts/assets/test_credits.py -q
11 passed in 2.47s
exit 0
```

### `make lint`

```
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
861 files already formatted
{ git ls-files -z '*.sh' … } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- … (30 scripts)
exit 0
```

`make test` and `make evals` weren't run here: the supervisor's brief names this task's runs, and the full `make check` is T-INT's (as rework-028a's section above records it).

### Refusals

- A `Monitor` watch on the vitest log, `until grep -qE "Test Files|Error:|FAIL" /tmp/verify-028a-vitest.log && ! pgrep -f "vitest run --maxWorkers=4" >/dev/null; do sleep 5; done; echo done`, was refused by the tool harness: "grep in '/tmp/verify-028a-vitest.log' was blocked. For security, Claude Code may only search for patterns in files from the allowed working directories for this session: '/home/h4reet/h4reet-ai/night/2026-11-15/verify-028a'." I didn't rebuild it another way; I waited for the background run's own end notice instead.
- No hook or bash-gate refusal. Nothing in `/tmp` was deleted; the second run wrote a new log (`/tmp/verify-028a-vitest2.log`) and kept the first.

### Questions

None.

Result: green
