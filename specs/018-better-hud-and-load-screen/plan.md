# Implementation Plan: A Better HUD, From the Author's Examples, and a Load Screen to Match

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over"

and: "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", …". The order's rule 1, the supervisor's statement of his order and not his words: the spec-writer takes the recommended answer at clarify and at the plan. Q1 to Q5 and D1 to D8 stand as taken. Q53 to Q60 are recorded on the night's page as "Answered: recommended, the Author 2026-11-13", and R1 to R7 are taken at their recommended answers. Each is on the morning page, and an overturned answer is reworked before he merges.

**Reworked 2026-11-14 by rule 6** (the Opus re-reviews rv-spec-018 and rv2-impl-018, both blocking), on `night/rework-spec-018/rework-spec-018` from impl-018's tip (b9378980). What changed is in §2, §3, §7, §13, and the rework's decisions, R-1 to R-7. The code it needs is tasks.md's T021 to T030, on `night/rework-018/rework-018`.

**Branch**: `night/hud-spec/spec-018` (first documents), `night/impl-018/impl-018` (code), this rework | **Spec**: [spec.md](spec.md) | **Created**: 2026-11-14

## Summary

Refine the column layout into a **split** layout (D-I1, Q53), on the windows FR-001 selects: those where the open conversation panel still leaves spec 005's floor, 304 × 196, beside it, and the HUD at rest covers at most 25%. At the compositor's metrics that is from 1392 px wide. On those windows the conversation rests as one row at the bottom bar's left and opens as a panel over the scene's left. The list stands at the column band's top right and the walking control at its foot. The type and colours are the room's own. The frame and strokes come from a seeded path generator, and the key caps are drawn in code. Restyle spec 012's loader card in the same frame. The clear area, the frame area, and the stages stay the column layout's at every window. No layout on another window changes. The one request is the twin's still, now also fetched in 3D (row V1). No telemetry.

## Technical Context

TypeScript, Vite, Three.js (existing); vitest with jsdom for the room's tests (`apps/web`); eslint and `tsc` through `make lint`. No new dependency (FR-011, D4). Storage: none. Target: the room's browsers, 320 px to a large monitor. Constraints:
- the CSP's `style-src 'self'`: sizes go through `style.setProperty` and classes only, as `layout.ts` does;
- `img-src 'self'`: the frame and strokes are inline SVG elements built by script, with no data: image except the still's verified data: URL, which spec 016's 2D drawing already uses;
- spec 005's FR-022: the text box is never collapsed;
- spec 012's behaviour is unchanged;
- spec 014's FR-016: one kernel function gives the frame area to the room and the compositor.

## Constitution Check

As the spec's: I (one disclosed same-origin fetch in 3D, row V1), V, VI, VII satisfied. II is met by the tests below, and its telemetry and cost-measurement deviation is named in the spec's Assumptions, with Workflow step 7's. III by the provisional record above. IV: no human-only path is in the file map. VIII: the stand-in line and the AI disclosure are never covered (§2, geometry test).

## Project Structure

Documentation: `spec.md`, `plan.md`, `tasks.md`, `analysis.md`, this folder; the intent in `intent/018-better-hud-and-load-screen.md`.

**The file map**: every file a task changes, T001 to T030, under `apps/web/` unless named. **new** marks a file a task creates; (impl-018) marks a file T001 to T020 changed; (rework) marks a file T021 to T030 change.

| File | Tasks | What |
|---|---|---|
| `src/room/compose/hud.ts` | T007 (impl-018), T023 (rework) | `HUD_PLACEMENTS.split`; `splitBoxes` with FR-001's rule (a) to (e); the rest row, list, and walking control boxes (FR-004); `compactBoxes` split-aware (its `split` field, `all`, `walk`); `alwaysOnCoverage` follows |
| `src/room/compose/frame.ts` | none | Spec 014's frame area. It takes the HUD boxes at rest through `compactBoxes(…).all`, so T023 changes what it eases against with no edit here. The brief names `compose/framing.ts`, which is the camera's framing (spec 004) and doesn't change. |
| `src/room/compose/stages.ts` | none | `stageFor`'s reserved boxes come through `compactBoxes(…).all` and follow T023; its sweep and stages are unchanged, since the clear area is (Q53, Q59) |
| `src/room/hud/frame.ts` **new** | T002 (impl-018) | `roughFramePath`, `brushStrokePath` |
| `src/room/hud/keycap.ts` **new** | T003 (impl-018) | `keycap(doc, name)` |
| `src/room/hud/stats.ts` **new** | T004 (impl-018) | `statsFrom(tier, cost, words)` |
| `src/room/hud/split.ts` **new** | T009, T010, T012, T015, T018 (impl-018); T025, T026 (rework) | the panel's and the list's parts; Escape's order (FR-009); focus to the opener (FR-045); the emblem from `hud/icons.ts` (Q60) |
| `src/room/hud/split.css` **new** | T012, T014 (impl-018); T025, T027, T028 (rework) | the split layout's rules; the rest row in the bar's band; glass behind the title row (B2); the keyboard inset (B1) |
| `src/room/layout.ts` | T009 (impl-018), T025 (rework) | `--split-*` properties (the rest row's replace the bar's); `data-split`; the walking control's place from `compact.walk` |
| `src/room/app.ts` | T009, T018 (impl-018); T025, T028 (rework) | wiring; a sent turn opens the panel; the opener recorded; the keyboard inset passed to the split layout |
| `src/talk/talk.ts` | T009 (impl-018); T025 (rework) if the opener needs a hook | `onConversation`, `onLarger`; the sent turn's hook |
| `src/room/flat.ts` | T010 (impl-018) | `fetchStill` exported, spec 016's verified fetch, the panel's only path (D-I4); no behaviour change |
| `src/room/loading/view.ts`, `loading/loading.css` | T017 (impl-018) | the loader's frame and title |
| `src/room/hud/icons.ts` | T026 (rework) | gains an icon for each of the scene's four pieces and a speech glyph, keyed by the selectable's id, the speech glyph for any id without one (Q60, R6) |
| `room/ui-words.yaml`, `src/room/ui-keys.ts` | T005 (impl-018) | §6's words |
| `test/fixtures/room/good/apps/web/room/ui-words.yaml` | T005 (impl-018) | the fixture's words, kept equal to the room's |
| `room.css` | none | named by the first plan; impl-018 didn't need it, and the rework doesn't |
| `test/room/hud-frame.test.ts`, `hud-stats.test.ts` **new** | T001, T004 (impl-018) | |
| `test/room/hud-split-geometry.test.ts` **new** | T006 (impl-018), T021 (rework) | FR-001, FR-004, SC-001 (§13) |
| `test/ui/hud-split-model.test.ts` **new** | T021 (rework) | the rest row's least width and the list's height, from the words |
| `test/ui/hud-model.ts` | T023 (rework) | the layout model's helper gains the split layout's measures (§2) |
| `test/room/frame.test.ts` | T022 (rework) | spec 014's: two cases measured from the list's box (R4, §13) |
| `test/ui/hud-split.test.ts` **new** | T003, T008, T010, T011 (impl-018); T024, T026, T028 (rework) | |
| `test/ui/hud-split-a11y.test.ts`, `hud-split-contrast.test.ts` **new** | T013 (impl-018); T024, T027 (rework) | |
| `test/ui/hud-split-fallback.test.ts`, `loading-style.test.ts` **new** | T015, T016 (impl-018) | |
| `test/ui/hud-look.test.ts` | T012 (impl-018) | D-I3, Q55 |
| `test/room/vocabulary.test.ts` | T005 (impl-018) | the new words' keys |
| `docs/data-flow-disclosure.md` | T029 (rework) | row V1's **Carries** (FR-003, H-11) |
| `docs/merge-requests/2026-11-14-night-stack.md` | T019 (impl-018), T029 (rework) | the stack note's item 1 section |

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| P1 | A refinement of the column layout, not a fourth layout or a rewrite (as D-I1 settled, Q53) | Spec 005/014's layouts are pinned by many tests and are the degraded mode (FR-001). |
| P2 | Panel states `data-panel="bar"` (the rest row; impl-018's attribute value, kept) and `"open"`, one DOM | One text box, one log, one Tab stop. The rest row is a CSS state, so the log and text survive a resize (edge case). |
| P3 | Frame and strokes are SVG built by script from a seeded path | CSP-safe, no file, no filter, testable by string (D3, D6). |
| P4 | Key caps are small spans in code, `aria-hidden`, their names in the buttons' accessible names | FR-013, FR-016. |
| P5 | The stats read the signals the neon sign reads (`signals/turn-cost.ts`, the tier signal) | FR-010, no new source. |
| P6 | The portrait is spec 016's still, through `flat.ts`'s `fetchStill` (D-I4) | Q4. One fetch, disclosed in row V1 (FR-003). |
| P7 | The selected entry is focus, else hover, else the open piece. Rows keep their size, and the enlarged type sits in a fixed-height row. | FR-008, no layout shift. |

## 2. Geometry (`HUD_PLACEMENTS.split`, `splitBoxes`), reworked

All sizes in rem of the window's root font size, except the floor's pixels. `t` is the table, `clear`, `band`, `bar` the column layout's boxes from `hudBoxes`, unchanged (D-I1).

The table: `split: { panel: { shareMax: 0.5, maxRem: 40, minWidthRem: 18, minHeightRem: 14, titleRem: 2.75 }, rest: { minRem: <the model's finding>, gapRem: 0.25 }, list: { widthRem: 24, heightRem: 22 }, walkGapRem: 0.25, coverMax: 0.25 }`. impl-018's `minWidthRem: 48` and `panel.gapRem` go. The first is replaced by the rule, and the second, which kept the panel off the walking control's corner, is subsumed by (c): the floor's 304 px is wider than the corner's 9rem.

`splitBoxes(screen, state, metrics)` returns null unless every condition holds, in this order:
1. **(a)** `layoutFor` is "column" and `fitsHud` holds.
2. **The panel**: `x = clear.x`, `y = clear.y + notesReserve(clear)`, `w = min(40rem, 0.5 · screen.w − clear.x)`, `h = clear.y + clear.h − y`. **(b)** `w ≥ 18rem` and `h ≥ 14rem`.
3. **(c)** `clear.w − panel.w ≥ minimum.w` (304) and `clear.h ≥ minimum.h` (196).
4. **The rest row**: `x = safe.left`, `y = bar.y`, `h = bar.h`, `w = min(panel.w, cluster.x − 0.25rem − safe.left)`, with `cluster` the bar's tile cluster from the compact boxes. **(d)** `w ≥ rest.minRem`.
5. **The walking control**: `x = band.x + band.w − safe.right − 0.25rem − 8rem`, `y = band.y + band.h − 0.25rem − 2.75rem`, `w = 8rem`, `h = 2.75rem`.
6. **The list**: `w = min(24rem, band.w − safe.right)`, `x = band.x + band.w − safe.right − w`, `y = band.y`, `h = min(22rem, walk.y − 0.25rem − band.y)`.
7. **(e)** `unionArea([strip, cluster, rest, list, walk, notesBox(clear)]) / (screen.w · screen.h) ≤ coverMax`, with the strip and cluster from the compact boxes.

`SplitBoxes` is `{ panel, rest, frame, list, walk }`, where `frame` is the panel's box with the rest row below it (`panel.y` to `rest.y + rest.h`), the box the open panel's frame is drawn round. `compactBoxes` calls `splitBoxes` and, where it isn't null, returns `split`, `walk` (the split walk), `walkPlace: "column"`, and `all: [strip, cluster, rest, list, walk]`. `column` stays the column layout's compact box, computed but not shown, so spec 014's `hud-model.test.ts` case on the column's content holds as written. `frameArea`, `stageFor`, `framedStage`, and `alwaysOnCoverage` take the split boxes through `all`, with no edit of their own.

The model (`test/ui/hud-model.ts`): `rest.minRem` is the rest row's contents at their sizes, rounded up to a whole rem: the title toggle's words, the "Larger conversation" tile, the label's words inline, the text box's least width (`talk.inputMinRem`), Send's words, and the talk tile, with their gaps. `list.heightRem` must hold the label, "Back", and every entry at its 3.25rem row. `test/ui/hud-split-model.test.ts` holds both to the words.

**Computed at the compositor's metrics** (16-pixel root, no safe areas). The review's windows are in spec FR-001's table. The rest of SC-001's:

| Window | Panel (open) | Scene beside it | Rest row | List | Walking control | At rest |
|---|---|---|---|---|---|---|
| 1392 × 783 | (0, 109.5) 640 × 621.5 | 304 × 703.5 | (0, 731) 640 × 52 | (1008, 27.5) 384 × 352 | (1260, 683) | 23.0% |
| 1920 × 1080 | (0, 109.5) 640 × 918.5 | 832 × 1000.5 | (0, 1028) 640 × 52 | (1536, 27.5) 384 × 352 | (1788, 980) | 12.1% |
| 1920 × 1200 | (0, 109.5) 640 × 1038.5 | 832 × 1120.5 | (0, 1148) 640 × 52 | (1536, 27.5) 384 × 352 | (1788, 1100) | 10.9% |
| 2560 × 1440 | (0, 109.5) 640 × 1278.5 | 1472 × 1360.5 | (0, 1388) 640 × 52 | (2176, 27.5) 384 × 352 | (2428, 1340) | 6.8% |

These are the spec-writer's arithmetic from the table, with `rest.minRem` taken as 30 (non-binding at these windows: the rest row is 640 wide). T021 writes them as the geometry test's expectations, and T023 makes the kernel give them. A difference is the kernel's to explain in the task's notes, not the test's to absorb.

## 3. The panel (`hud/split.ts`, `talk.ts`), reworked

DOM, in order: the title (a heading-less `div` label at the panel's top-left, with the panel's glass behind it, B2; the room's h1 is unchanged); the frame (`svg`, `aria-hidden`, drawn round `SplitBoxes.frame`); the hint (a button: key cap + "Close"); the emblem (the open piece's icon from `hud/icons.ts`, or the speech glyph in free talk, Q60) and the stats (`dl`: label `dt`, value `dd`); the body (the log, spec 002's, restyled); the portrait slot. The rest row is the existing text box row, with the conversation's head (the title toggle and "Larger conversation") inline before it, placed by CSS at `--split-rest-*` in the bar's band. The log, text box, Send, and talk button are the existing elements, moved by CSS and never recreated (`talk.ts` keeps its API).

**Opening and closing (FR-006)**: `open` when a piece is chosen (list or scene), a turn is sent (free talk included), a line arrives in the log, or "Larger conversation" is pressed (D-I2). `rest` on Back, the hint, Escape's step 7, or "Smaller conversation". The opener is recorded at each opening (the entry, the toggle, or the text box) for FR-045's focus return.

**Escape (FR-009)**: one listener, at capture on the document, as impl-018's. It returns at once on `defaultPrevented` or `browserOwnsEscape(doc)`. It leaves the event to its owner when a turn is out, the walking view is on, the resume is open, or the larger view is on with focus in the conversation. Else, with the panel open, it closes the panel and calls `preventDefault`.

**The keyboard (B1)**: the rest row and the panel's foot take the inset `layout.ts` already applies to the column's text box row (`m.keyboard`), so they stay above it.

## 4. The list (`hud/split.ts`)

The list's existing buttons keep their handlers; the label, "Back", and the strokes are added around them. `aria-current` follows P7 (Q56). The strokes are two `svg` elements positioned above and below the selected row by CSS classes. Arrow keys: no roving behaviour is added, since the tab order is spec 005's.

## 5. The look and the loader

Type and colours from `room.css`'s variables; `split.css` holds the rules. The loader card (`loading/view.ts`) gains the frame element and the title, and `loading.css` the type. The bar, tints, hints, and timing code is not edited, so spec 012's tests are its guard. Contrast: `hud-split-contrast.test.ts` follows `loading-contrast.test.ts`, and gains the title row's glass (B2).

## 6. Words

New keys, plain and about the machine only: `hud.select`, "Select a piece"; `hud.back`, "Back"; `hud.close`, "Close"; `key.esc`, "Esc"; `key.enter`, "Enter"; `stat.serving`, "Serving"; `stat.call`, "This call"; `stat.visit`, "This visit"; `stat.unknown`, "—"; and `stat.tier.local|cloud|resting|budget|unavailable|unknown`: "Local", "Cloud", "Resting", "Budget", "Unavailable", "Unknown". Labels are capitals by CSS; the words are sentence case. They are added to `ui-words.yaml` and `ui-keys.ts`'s closed list; `test/room/words.test.ts` and `vocabulary.test.ts` are their guards. The rework adds none.

## 7. Telemetry, cost, disclosure

No telemetry (spec D7; the deviation named in its Assumptions). Cost: $0. Disclosure: row V1's **Carries** gains "or, in a 3D visit, once, when the conversation panel first opens in the split layout (spec 018)" (FR-003, H-11). It is written by T029 in the same branch as the code that fetches the still. impl-018 shipped that fetch without the row, which rv-spec-018 found.

## 8. Accessibility

As FR-016 to FR-018. `hud-split-a11y.test.ts` runs axe on the open and rest states and asserts the Tab order and the accessible names. FR-045's focus return is asserted for each opener (T024).

## 9. Fault handling

`split.ts` builds each decoration (frame, strokes, portrait, key caps, emblem) in its own try, which falls back to the plain form (FR-002). `hud-split-fallback.test.ts` forces each to throw.

## 10. Tests

Test-first. Small runs, per task: `cd apps/web && npx vitest run <files>` and `make lint`. The covering existing tests are run with the task that changes their subject: `test/room/hud.test.ts`, `stages.test.ts`, `frame.test.ts`, `test/ui/hud-notes.test.ts`, `hud-model.test.ts` for `hud.ts`; `test/ui/hud.test.ts`, `hud-a11y.test.ts`, `hud-pointer.test.ts`, `hud-look.test.ts`, `pause.test.ts` for `layout.ts`, `split.ts`, `split.css`, and `app.ts`; `loading-*.test.ts` for the loader's files. The full suite is **not** run in this item: the stack's last task runs it once (the order's rule 4). `twin-2d.test.ts` is known flaky under load.

## 11. The Author's look approval

A dev-cpu stack (`make up ENV=dev-cpu`) shows the room. The implementer records screenshots' paths in the note if its sandbox can take them, at 1920 × 1080 (split, rest and open) and 1280 × 720 (column). His look approval is his, at the morning; a change from it is rework.

## 12. Stack and gate

This is item 1: its tip, after rework-018 and its review (rv-rework-018), is the base the line merges before impl-021 (the supervisor's queue). The note, `docs/merge-requests/2026-11-14-night-stack.md`, carries this item's section; the last item names the stack once. No human-only patch comes from this item.

## 13. Existing tests whose expectations change, and what each then holds

The test files spec 018 itself added change where FR-001's rule moved 1280 × 720 out of the split layout. Of the other specs' tests, only spec 014's `frame.test.ts` changes. Every other covering test keeps its expectations: that is SC-002.

| Test | Today (impl-018) | After the rework, it holds |
|---|---|---|
| `test/room/hud-split-geometry.test.ts` (018) | split for every landscape window ≥ 48rem whose left half holds a panel; split at 1280 × 720; boxes at 1280 × 720, 800 × 500, 1024 × 600; the rest bar inside the panel | over the sweep, split exactly where FR-001's (a) to (e) hold, the column layout's boxes elsewhere; null at 1280 × 720, 1366 × 768, 844 × 390, 768 × 432, 800 × 500, 1024 × 600, 700 × 400; §2's boxes at 1392 × 783, 1920 × 1080, 1920 × 1200, 2560 × 1440; the scene beside the panel ≥ 304 × 196; the rest row in the bar's band, clear of the cluster; the list above the walking control; at rest ≤ 25%; the clear area equal to `hudBoxes`' |
| `test/ui/hud-split.test.ts` (018) | `WIDE` = 1280 × 720; the bar's contents inside the panel's foot; "a resize under 48rem and back" | `WIDE` = 1920 × 1080; the rest row's contents in the bar's band; "a resize to 1280 × 720 (no split) and back" keeps the log and the text; a sent turn opens the panel; focus returns to the opener |
| `test/ui/hud-split-a11y.test.ts` (018) | viewport 1280 × 720; 200% zoom as 640 × 360 under 48rem; `t.minWidthRem` is 48 | viewport 1920 × 1080; 200% zoom as 960 × 540, where `splitBoxes` is null; no `minWidthRem` |
| `test/room/frame.test.ts` (**spec 014**) | at 1920 × 1200, `UNDER` is the column's compact box's centre, and the 0.5rem case measures 7.9 and 8 px (10 and 9 px at a 20-pixel root) from the column's compact box | the same rules, measured from the HUD box at the column's place, the list (`compactBoxes(SCREEN).split.list`), at 1920 × 1200 and at a 20-pixel root, where the split layout also holds (R4). Its other cases are unchanged, since the clear area is |
| `test/room/stages.test.ts` (spec 005, 014) | "the walking control's box is always among them" (reserved ≥ 1) at 1920 × 1200, 2560 × 1440, 5120 × 1440 | expected unchanged. The case passes today, and at those windows no compact box overlaps the clear area, so the frame area's ease there is under 1 and it reaches into the band, where the list and the walking control now stand. If T023's run shows an ease of 1 there, the reserved list is empty. Then the task **stops** and reports the ease, and does not edit the case. |
| `test/ui/hud-look.test.ts` (014, amended by D-I3) | its skip at `data-split="on"`, run at 1920 × 1200 | unchanged: 1920 × 1200 still takes the split |
| `test/ui/hud.test.ts`, `hud-a11y.test.ts`, `hud-pointer.test.ts`, `pause.test.ts` (005) at 1280 × 720 | passed with the split layout on | unchanged, and now in the column layout as before spec 018 |
| `test/ui/hud-model.test.ts` (014, FR-019) | the cap over landscape windows 1280 × 720 to 3840 × 2160 | unchanged: on split windows `alwaysOnCoverage` is the split's, ≤ 25% by FR-001 (e); the column's compact box is still computed for its content case |
| `test/room/legacy-stages.test.ts`, `stages-checks.test.ts`, `test/lookdev/page.test.ts`, `fit.test.ts`, `flat-frame.test.ts` | the reference desktop's 1472 × 1120.5 | unchanged: the clear area and the stages are the column layout's (H-5) |

## Departures from this plan (the implementation's, recorded with the commit that makes them)

- **D-I1 (T007): the split layout is a refinement of the column layout, not a fourth `HudLayout`.** `layoutFor` and `HudLayout` are unchanged. `compose/hud.ts` gains `HUD_PLACEMENTS.split` and `splitBoxes(screen, state, metrics)`, which returns the panel's, its resting bar's, and the list's boxes, or null. It returns null for a window under 48rem, a portrait one, a non-column one, or one whose left half can't hold an 18rem × 14rem panel clear of the notes' reserve and the walking control. Why: `data-hud="column"` at 1280 × 720 is pinned by spec 005's and 014's tests, which T007 requires to pass unchanged. The bands, the clear area, and the compositor's checks (`stages.ts`) then stay the column layout's and need no new sweep. The root carries `data-split="on"` beside `data-hud="column"`. The open panel is within the clear area's left, under the notes' reserve; the list is within the column's right 24rem, at most 22rem tall. **Reconciled by the rework (Q53, R-1, R-2)**: the refinement, `layoutFor`, the bands, the clear area, and the stages stand. Its selection rule (48rem) and its resting bar inside the clear area do not. The rule is FR-001's, and the rest row is in the bar's band (§2). So the clear area really is unchanged at rest, which D-I1's own reason needs.
- **D-I2 (T009): the title is the log's own toggle, unchanged, and the panel opens from the bar by the larger toggle.** §3 had the title toggle the panel. Spec 005's tests (`hud.test.ts`, `hud-a11y.test.ts`) pin the log toggle's collapse at 1280 × 720, then in the split layout, and require them to pass unchanged. So the toggle keeps collapsing the log. The panel opens by a conversation starting, a line in the log, a piece chosen, or the existing "Larger conversation" toggle (`talk.onLarger`). It closes by Back, the hint, Escape, or "Smaller conversation". The panel's decoration (hint, emblem, stats, frame, portrait) exists only while it is open. Kept by Q54. After the rework, 1280 × 720 is no longer split, but the toggle's role stays as Q54 answered.
- **D-I3 (T012): one pinned test is amended.** `test/ui/hud-look.test.ts` (spec 014's FR-022: every HUD control a tile) now skips the list's entries and the conversation's title where the root says `data-split="on"`. Spec 018's FR-007 and FR-008 make them right-aligned text on the glass, selected by colour and strokes. Every other control in the split layout, and every control in the other layouts, is still checked. Accepted by Q55; named as the spec's Amendment H-9.
- **D-I4 (T010, T018): the portrait is the silhouette in 2D.** §P6 and T010 say the panel fetches the still "if the room is in 3D". In 2D the drawing already shows the twin, so the panel keeps the silhouette there. `fetchStill` (spec 016's verified fetch) is now exported from `flat.ts` and is the panel's only path. No new network path was needed, so T010's stop condition did not apply. **Rework**: the 3D fetch is a new moment for a disclosed flow, and row V1 is amended (FR-003, T029).
- **D-I5 (T018): the review's fixes.** Escape outside the conversation closes the panel even with the larger view on. The panel's parts are each built in their own try and recorded as added. `aria-current` is the target's alone once the split layout goes. A resize redraws the frame in place. A conversation in a window the split layout doesn't take leaves the bar for a later, wider window. Left as it is, named in the note: the loader's frame scrolls with the card where the card scrolls (short windows), and `Split.dispose()` has no caller (the room has no teardown).

## The rework's decisions (rule 6; tasks T021 to T030)

- **R-1 (FR-001; Q57, R1)**: the split layout's rule is computed (§2 (a) to (e)), not a width. At the compositor's metrics it starts at 1392 px (87rem). Q57's "about 83rem" counted the list's 24rem as the right band, and D-I1 keeps the column's 28rem.
- **R-2 (FR-004; Q53, Q59, R2)**: the conversation's rest form is one row in the bar's band at its left, not a 7.4rem bar inside the clear area. So the clear area, the frame area's end, and every stage are unchanged, and spec 014's framing answer holds at rest by construction.
- **R-3 (FR-004; R3)**: the walking control in the split layout is at the band's foot, at its right, and the list ends above it. impl-018 left it at the head of a column content the split layout doesn't show, under the list at 1366 × 768.
- **R-4 (FR-004, H-6, H-7)**: `compactBoxes` is the one place that knows the split layout's boxes at rest, so the frame area, the stages' reserved boxes, the coverage, and `layout.ts` take them from one kernel function (spec 014's FR-016). `frame.ts` and `stages.ts` need no edit.
- **R-5 (FR-009; R5)**: Escape's order is written out (defaultPrevented, `browserOwnsEscape`, the turn, walking, the resume, the larger view, the panel). Focus follows spec 005's FR-045 to the opener.
- **R-6 (FR-003, H-11)**: row V1 is amended in the same branch as the fetch's code.
- **R-7 (FR-005; Q60, R6)**: the emblem's icons are drawn in `hud/icons.ts`, one per selectable id of the scene and a speech glyph, which also stands in for any piece without one.

## Complexity Tracking

One refinement beside three layouts, and one more input to `compactBoxes`: the cost, named, of P1 and R-4, for the degraded mode, the tests' stability, and one kernel function for the frame.
