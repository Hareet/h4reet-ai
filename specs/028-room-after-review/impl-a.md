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
| T-A08 | `edb441f8` | `b586b379` |
| T-A09 | `34bf6a97` (T-A06 named), `b16bb225` (lint) | this note |

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

TIP_RUN

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

**My own new tests, changed after their RED commit** (each before or in its task's GREEN commit, none weakened to pass): `wall-box`'s "lies inside the frame area …" holds where the shell is framed (the fixture's isn't: its near face is in front of the camera); `hud-wall-geometry`'s table pin and oracle gained `minAreaWidthPx` (T-A05's RED, after the page's question), and its wall-less protector lost an unused binding (lint); `split-no-still`'s still case is a 3D visit (jsdom gives 2D without WebGL, where the 2D room rightly fetches the still) and its Back case answers the turn so the log has a line; `hud-wall-dom`'s Tab-order comparison leaves out spec 018's own "Back" and hint; `hud-split`'s finding 2 deactivates the first split before the second (both now build at activation); `hud-split-list`'s ring case checks a `split.css` reset that outranks `room.css`'s rules, not a `:not(...)` in `room.css` (which broke spec 014's selector pin in `hud-look`); `credits`' order case follows `AVATARS` (woman, man, dinosaur, dog).

## Refusals

None. No hook, bash-gate, or permission refusal this session.

## `make lint`

LINT_RUN

`make test` and `make evals` were not run here: his rule 4 ("Small tests, and the full suite once") gives the one full `make check` to the integration task, T-INT.

## What's left

- **His answer** to the page's question above (the 686.4 px area); the rest of Q1 to Q19 are the spec's.
- **T-INT**: merge `impl-028b` and T-DOC; `app.ts` as plan §6 says (B's T-B05 merges `33436c6e` first); row V1's still sentence (FR-002, FR-030); the one `make check`. The site's global build now carries the Credits page's section (`vite.config.ts` names the room plugin), so `test/serving.test.ts` and `test/site.test.ts`, not run here, may see a larger `credits/index.html`.
- **His look** (SC-008): the columns beside the walls and their sizes (`HUD_PLACEMENTS.wall`, data in code), the tiles' block, the list's cap slot, the focused "Around the room". His screenshot is in his checkout, out of this container's reach; nothing here was compared with it.
- **Not done, named**: `build/room/report.ts`'s "Frame" prose doesn't name the split layout (its stages count among "the column layout from 1280 × 720" at ease 0); `notesReserve` still reserves the empty notes' place (plan §R-A5); `room.css`'s `.room-note` and `.room-stand-in` rules and `HUD_PLACEMENTS.split`'s unused entries (`shareMax`, `rest`, `list`, `coverMax`, `walkGapRem`) stay, unused, for a later clean-up with their pins; the empty `.room-notes` box stays in the DOM.
- **Windows under about 1359 px wide** keep the column layout (the question): on such a window the Author would see today's column layout (which never had the thumbnail), the labels gone, and "Around the room" hidden; the panel and the column beside the walls only from about 1359 px.
