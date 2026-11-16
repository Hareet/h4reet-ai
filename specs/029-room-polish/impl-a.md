# impl-029a: group A, the side panels see-through (T-A01 to T-A03)

Branch `night/impl-029a/impl-029a`, from spec-029's tip `c743e2da`. Plan §R-A1 to §R-A4; spec FR-001 to FR-008, SC-001, SC-002.

## Log

- Started: reading plan §5, spec group A, and the code (`layout.ts`, `compose/frame.ts`, `compose/hud.ts`, `room.css`, `hud/split.css`).
- Setup: the worktree had no `node_modules`. My first `npx vitest run …` from `apps/web/` found no local vitest, so npx **fetched `vitest@5.1.0` from the registry** and ran it. It stopped at the config ("Cannot find package 'vitest'"), and none of the repository's tests ran under it. I then ran `make setup` (`npm ci --ignore-scripts`; 431 packages; "git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks"). Every run below uses the lockfile's vitest. That fetch is on the page as a refusal-class note: worth a guard (npx `--no-install`), his call.

## T-A01 (RED)

Files: `apps/web/test/ui/hud-over-room.test.ts`, `apps/web/test/ui/hud-over-contrast.test.ts`.

```
$ npx vitest run --maxWorkers=2 test/ui/hud-over-room.test.ts test/ui/hud-over-contrast.test.ts   # from apps/web/
 FAIL  test/ui/hud-over-room.test.ts [ test/ui/hud-over-room.test.ts ]
Error: Cannot find module '../../src/room/compose/over' imported from …/apps/web/test/ui/hud-over-room.test.ts
 × reads its alphas from room.css's :root, the glass's below the plate's   (expected NaN to be greater than 0)
 × takes the lowest 5% step for the glass at which the tiles' faces hold (FR-006)
 × takes the lowest 5% step for the plate at which every pair holds over that glass (FR-003)
 × drops a marked part's glass to --over-glass-alpha, the split layout's too
 × puts every run of words on a plate of the glass at --over-plate-alpha   (.talk-entry: expected false to be true)
 × draws the focus ring inside its control over the room, never on the bare glass
 × makes both alphas 1 under prefers-reduced-transparency:\s*reduce
 × makes both alphas 1 under prefers-contrast:\s*more
 × makes both alphas 1 under forced-colors:\s*active
 Test Files  2 failed (2)
      Tests  9 failed | 2 passed (11)
```

The two passing cases are vacuous until the alphas exist: "every text and mark at the stylesheet's alphas" (a NaN ratio fails no floor, and the first case catches the NaN) and "no over-alpha outside a marked rule". `make lint` isn't run at RED: tsc can't resolve `compose/over` until T-A02.

## T-A02 (GREEN)

Files: `apps/web/src/room/compose/over.ts` (new), `apps/web/src/room/layout.ts`, `apps/web/src/room/app.ts` (a departure, below), `apps/web/src/room/room.css` (`:root`'s `--over-glass-alpha: 0.3`, `--over-plate-alpha: 0.5`; a block at the file's end), and `apps/web/src/room/hud/split.css` (one block appended after its last rule; no rule above it edited, line 273 untouched for group B).

What it does:

- `overRoom(parts, room)` marks a part whose box meets the room's box with positive area, with no threshold. `roomBox` gives the stage while walking, else the wall box, else the frame area. `hudParts` reads the parts' boxes from what `applyHud` already takes, so nothing is measured in the DOM.
- `applyHud` stores the layout and marks `data-over="room"` on each part's element (removing it from the others); `setWalking` re-runs the flag.
- A marked part's glass drops through its custom property (`--glass-alpha` or `--split-glass-alpha` → `var(--over-glass-alpha)`), so every existing `background` declaration is unchanged. Each run of words sits on a plate: `rgb(var(--glass) / var(--over-plate-alpha))`, its shadow 0.25rem past its box, no box moved. The tiles' rings are drawn inside the tile (`outline-offset: -4px`). Under `prefers-reduced-transparency: reduce`, `prefers-contrast: more`, and `forced-colors: active`, both alphas are 1.

What the marks are on the real room (a scratch run, deleted, not committed): none at 1366 × 768, 1440 × 900, and 1920 × 1080 at rest, in 3D and 2D (all three take the split layout); walking there, the toolbar, the walking control, the list, and the panel. At 390 × 844 (dock): the sheet's reach at rest; walking, the toolbar, the walking control, the dock, and the sheet. At 1280 × 720 in 2D: the bar, the column, and the sheet at rest.

### Departures (plan.md updated in the same commit, `020d6e9d`: §R-A1, §R-A2, §R-A3, §9)

1. **`app.ts`, four lines in `refit`.** `HudApplied` gains optional `room` (the protector's wall box at the frame area) and `stage` (the window). `layout.ts` has no protector, so FR-001's "spec 028's wall box at the room's framing" can't be computed there outside the split layout. No other group edits `app.ts`. On the page as a question with its recommended answer (keep).
2. **The walking view's switch is `setWalking`**, not `layout.ts:329` (`setWalkOffered`, the offer's `data-walk`).
3. **The sheet's and the larger view's boxes are their reach** (the clear area below the notes' reserve): their own height is their words', which no table holds.
4. **Plates as built:** the whole `.talk-form`, not its label (so the text box's ring lies on a plate); `.split-top`, not `.split-stats > *` (the emblem too); the list's rows (`.room-list li`), not `li button` (the strokes and the cap too); `.talk-status:not(:empty)`. The tiles' words take no plate: the tile's face is their plate (FR-006). The walking control and the "Eat" tile keep today's glass as their face, since they're tiles over the scene; only their ring moves inside.
5. **Forced colours** sets both alphas to 1 beside the two asks (forced colours keeps a background's alpha).

### The alphas (T-A03's record)

The contrast test computes 0.3 and 0.5, the plan's estimate, so §R-A3's numbers stand. I recorded the bound in §R-A3 anyway: at glass 0.25, white on a tile over white is 4.37:1 (4.83 at 0.3); at plate 0.45, `--split-muted` on a plate over white is 4.01:1 (4.53 at 0.5; white 5.74).

### My own RED tests, edited before GREEN (named: old → new)

Neither is a fix task's test. Each edit is in `020d6e9d`; the RED commit `21902f95` has the first version.

- `hud-over-contrast.test.ts`: "draws the focus ring inside its control over the room, never on the bare glass" → "draws the focus ring inside its control over the room, or on a plate, never on the bare glass". The first version required every over-room `outline-offset` to be ≤ −4px. That would draw the ring through the glyphs of the text-like buttons (`.talk-link`). The case now requires the ring inside the tiles, allows 2 px only for `.talk-link`, and requires every plate but the rows to carry the 0.25rem shadow the ring lies on.
- `hud-over-contrast.test.ts`, "puts every run of words on a plate of the glass at --over-plate-alpha" (name unchanged). It now reads each selector without its `[data-over="room"]`, so a part marked itself (`.room-list[data-over="room"] li`) reads as `.room-list li`.

### Runs (from `apps/web/`)

```
$ npx vitest run --maxWorkers=2 test/ui/hud-over-room.test.ts test/ui/hud-over-contrast.test.ts
 Test Files  2 passed (2)
      Tests  27 passed (27)

$ npx vitest run --maxWorkers=2 test/ui/hud-over-room.test.ts test/ui/hud-over-contrast.test.ts \
    test/ui/hud-split-contrast.test.ts test/room/hud-contrast.test.ts test/ui/hud-split*.test.ts \
    test/ui/hud-look.test.ts test/ui/hud-a11y.test.ts test/ui/resize.test.ts test/room/stages*.test.ts \
    test/ui/hud-wall-dom.test.ts test/ui/eat-place.test.ts test/ui/walking.test.ts test/ui/hud.test.ts \
    test/ui/hud-pointer.test.ts
 RUN  v5.0.3 …/impl-029a/apps/web
 Test Files  22 passed (22)
      Tests  250 passed (250)
   Duration  216.65s (tests 55%, import 44%)
```

That run is plan §R-A4's list (`hud-split*` expands to `hud-split-a11y`, `-contrast`, `-dog`, `-fallback`, `-list`, `-model`, `-rest-row`, `hud-split`; `stages*` to `stages-checks`, `stages-floor`, `stages`), plus the files covering `layout.ts` and the walking view's switch (`hud-wall-dom`, `eat-place`, `walking`, `hud`, `hud-pointer`). `app.ts` is covered by most of the suite; the full run is T-INT's `make check`.

```
$ make lint      # from the worktree's root
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
878 files already formatted
… shellcheck -- … (no output)
exit 0
```

## T-A03 (the look's check)

```
$ npm run room:check -w apps/web
> @h4reet/web@0.1.0 room:check
> node --import tsx build/room/cli.ts check

room: 0 findings in 0 files
exit 0
```

`check` composes in strict mode with drafts, RG5 to RG7 at the reference stages included, and holds the generated files fresh: no finding, so no box moved. Group A changes no kernel box (`compose/hud.ts`, `frame.ts` untouched), and `test/room/stages*.test.ts` pass above.

## Not run here, by the night's rule 4

`make test`, `make evals`, and `make check` are T-INT's, once, on the merged tree (plan R-3: `hud-over-contrast.test.ts` reruns there, after group B's line-273 fix takes the frame out of flow). No refusal from a hook or the bash gate this task.

## For T-INT and his look

- Merge order: B, then A. `split.css`: B's line 273, then A's block at the end. They don't overlap.
- His look (FR-008, SC-008): the panels over the room while walking, and on 1280 × 720 and phone windows. The two alphas are data in `room.css`'s `:root`, his to tune within the test's bound. Risk R-4: the plates may read striped on a busy panel. The list's rows are plated whole.
- On the page: the `app.ts` departure (recommended: keep it) and the npx fetch at setup (recommended: `make setup` first and `npx --no-install`).

## rework-029a: S-10, after rv-spec-029 (T-A04)

Branch `night/rework-029a/rework-029a`, based on `night/impl-029a/impl-029a` (`a93fa34c`, checked: `git merge-base --is-ancestor refs/heads/night/impl-029a/impl-029a HEAD` true). Then I merged `night/rework-spec-029ab/rework-spec-029ab` (`e1212330`) at `f2797c2a`. plan.md conflicted twice, in §R-A1 and in §9. Each conflict keeps both sides: the rework's paragraph first, then impl-029a's as-built record. Spec and tasks merged clean.

### What S-10 found, and what the code already did

- **The walking view's switch.** impl-029a's `layout.ts` already runs the flag from `setWalking(on)` (`walking = on; markOver()`), not from `setWalkOffered`. That is its departure 2 above. No code change.
- **The wall box outside the split layout.** impl-029a's `app.ts` re-fit already passes `room: framed ? (hudOption.wall.wall?.(framed.area) ?? null) : null` and `stage` into `applyHud`, through `HudApplied`'s optional fields. That is its departure 1. It differs from the reworked §R-A1 (`… ?? boxes.clear`) only in the stacked layout, where `framed` is null. That layout has no parts (`hudParts`), so nothing changes. I recorded this in plan §R-A2. No code change.
- **What was missing: tests pinning both points.** T-A01's walking cases click the control on and off, but nothing in them separates "offered" from "walking", or a walk the stage ends itself from one the visitor ends. T-A01's non-split cases use the stand-in 3D stage, which has no protector, or the 2D drawing. At most windows the drawing's wall box and the frame area mark the same parts, so a re-fit that passed no `room` would still pass them, except at 390 × 844 (below).

### The tests (new file; T-A01's files unedited)

`apps/web/test/ui/hud-over-walking.test.ts`, 14 cases, through the real room (`test/helpers/room.ts`), `layout.ts`, and `app.ts`'s re-fit:

- **The walk, not its offer** (3D, at 1366 × 768, 1440 × 900, 1920 × 1080, 1280 × 720, 390 × 844). Offered (`data-walk="on"`, the control shown, no `enter` call): the rest's parts. Walking by the control: the parts meeting the stage. Ended by the stage (`endWalk("escape")`, then again `endWalk("failed")`), with the offer unchanged: the rest's parts again. At the three split windows, offered alone marks nothing.
- **The re-fit's wall box** (3D, the same five windows). A stage protector whose wall box is a 2rem strip at the frame area's top, too short for the split layout, so each window takes the column or the dock layout. The case first asserts that the frame area would mark other parts than the wall box does (it discriminates). The marks are the wall box's at rest, the stage's while walking, and the wall box's after.
- 1280 × 720 in 2D (column layout, the drawing's wall box). The stacked layout (300 × 400), in 3D and 2D: nothing marked, walking or not.

I put the new cases in a new file by choice, so T-A01's committed tests stay as they are. No hook refused anything.

### RED: each S-10 fault put back in scratch, then restored (`git checkout --`, never committed)

The new file passes on impl-029a's code. So I showed RED on the two faults S-10 names, one at a time, running the new file and T-A01's:

```
# Mutation 1: layout.ts runs the flag from setWalkOffered (walking = offered), not setWalking
$ npx vitest run --maxWorkers=2 test/ui/hud-over-walking.test.ts test/ui/hud-over-room.test.ts   # from apps/web/
 FAIL  test/ui/hud-over-room.test.ts > … > marks exactly the parts that meet the room at 1366 × 768 in 3D, in the room and walking
 FAIL  test/ui/hud-over-room.test.ts > … > … at 1440 × 900 …   (and 1920 × 1080, 390 × 844, and "follows a re-fit")
 FAIL  test/ui/hud-over-walking.test.ts > the walking view itself, not its offer, moves the flag (S-10; FR-001) > at 1366 × 768 in 3D: offered marks the rest's parts; walking, the stage's; Escape, the rest's
       (and 1440 × 900, 1920 × 1080, 1280 × 720, 390 × 844)
 FAIL  test/ui/hud-over-walking.test.ts > … > offers the walk at the split windows with nothing marked: the offer isn't the walk
 FAIL  test/ui/hud-over-walking.test.ts > outside the split layout the room's box is the re-fit's wall box (S-10; FR-001) > at 1366 × 768 in 3D with a stage protector, at rest and walking
       (and 1440 × 900, 1920 × 1080, 1280 × 720, 390 × 844)
 Test Files  2 failed (2)
      Tests  16 failed | 14 passed (30)

# Mutation 2: app.ts's re-fit passes no `room` (layout.ts falls back to the frame area)
$ npx vitest run --maxWorkers=2 test/ui/hud-over-walking.test.ts test/ui/hud-over-room.test.ts
 FAIL  test/ui/hud-over-room.test.ts > … > marks exactly the parts that meet the room at 390 × 844 in 3D, in the room and walking
 FAIL  test/ui/hud-over-room.test.ts > … > marks exactly the parts that meet the room at 390 × 844 in 2D
 FAIL  test/ui/hud-over-room.test.ts > … > follows a re-fit: a window that leaves the split layout marks its parts, and one that returns unmarks them
 FAIL  test/ui/hud-over-walking.test.ts > the walking view itself, … > at 390 × 844 in 3D: offered marks the rest's parts; …
 FAIL  test/ui/hud-over-walking.test.ts > outside the split layout … > at 1366 × 768 in 3D with a stage protector, at rest and walking
       (and 1440 × 900, 1920 × 1080, 1280 × 720, 390 × 844)
 Test Files  2 failed (2)
      Tests  9 failed | 21 passed (30)
```

Under mutation 2 the 2D 1280 × 720 case passes: there the drawing's wall box and the frame area mark the same parts. The stage-protector cases are the ones that catch this fault at every window.

### Runs (GREEN, on this branch's tree; from `apps/web/`)

First, `make setup` (the worktree had no `node_modules`). My first `npx --no-install vitest …` stopped: "npm error npx canceled due to missing packages and no YES option: ["vitest@5.1.0"]". That stop was npm's, not a hook's, and nothing was fetched. Then `make setup`: exit 0, last line "git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks".

```
$ npx --no-install vitest run --maxWorkers=2 test/ui/hud-over-walking.test.ts
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Duration  80.75s

$ npx --no-install vitest run --maxWorkers=2 test/ui/hud-over-walking.test.ts test/ui/hud-over-room.test.ts \
    test/ui/hud-over-contrast.test.ts test/ui/eat-place.test.ts test/ui/walking.test.ts test/ui/hud-wall-dom.test.ts
 RUN  v5.0.3 …/rework-029a/apps/web
 Test Files  6 passed (6)
      Tests  56 passed (56)
   Duration  121.61s (tests 72%, import 27%, transform 1%)
```

This rework changes no source file, only a new test and the documents. So the covering set is group A's three files plus the files that exercise the walking view and `applyHud` directly. impl-029a's wider §R-A4 run (22 files, 250 tests) stands for the unchanged code.

```
$ make lint      # from the worktree's root
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
879 files already formatted
… shellcheck -- … (no output)
exit 0
```

`make test`, `make evals`, and `make check` are T-INT's, once, on the merged tree (the night's rule 4).

### Departures and the page

- No departure from the reworked plan beyond the one recorded in §R-A2: the stacked layout's `room` is null. No new question for the page. impl-029a's two are still open there (the `app.ts` edit, recommended: keep; `npx --no-install`).
- For the reviewer: in the stacked layout the walking control and the "Eat" tile are `position: absolute` in the stage's corner, so they lie over the room, and they are not marked. That follows plan §R-A3 as built: these two tiles keep their opaque white face over the scene in every layout, and only their focus ring would change when marked. The stacked layout has no `[data-over]` rule, so a mark there would change nothing. His look (SC-008) can say otherwise.

## rework2-029a: rv-029a-1's R-1, R-2, R-7, and R-5 (T-A05)

Branch `night/rework2-029a/rework2-029a`, based on `refs/heads/night/rework-029a/rework-029a` (tip `4022f482`, impl-029a then rework-029a). Before running anything: `make setup` (exit 0, last line "git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks"). Every run used `npx --no-install`.

### Why T-A01's test passed

`hud-over-contrast.test.ts`'s `pairs()` puts every plate on the 0.3 glass and has no key cap. The split layout's title row has no glass under its plate. impl-029a's over-room rule `.talk[data-over="room"] .talk-head` has the specificity of the row's own glass (`split.css`'s `.talk[data-panel="open"] .talk-head`), and it comes later, so it replaced the glass. `.talk` is `background: none`, the sheet is `display: contents`, and the frame starts at the row's foot. The 12 px caps were in no pair at all.

### RED (`b048c5ea`): `apps/web/test/ui/hud-over-layers.test.ts`, new

A new file by choice: T-A01's two files stay as committed, and no hook refused anything. The file takes each backdrop from the stylesheets' own layers, not from a model of them. It runs a cascade over `room.css`, `talk.css`, and `hud/split.css`, in the order the page loads them. It covers importance, specificity, order, the style attribute, `var()` through inherited custom properties, `display: contents`, and the browser's ButtonFace and Field faces. It runs on the real room's DOM (`test/helpers/room.ts`), walking, in a conversation, with the "Eat" tile offered, at 1366 × 768, 1440 × 900, 1920 × 1080 (split), 1280 × 720 (column), and 390 × 844 (dock).

- Text: its element's and its ancestors' backgrounds up to the outermost marked part, plus the panel's frame under its rows but the title row, over white and black. The floor is 4.5:1, or 3:1 at 24 px.
- Marks, 3:1: every focus ring, every border (against either side), and every icon's and stroke's paint.
- The plate's step: `--over-plate-alpha` lower by 5% must fail a pair.
- R-7: the title row's corners and shadow must be the same walking as at rest.

Two flaws in my first draft of the model, fixed before the RED commit; neither is in the CSS. SVG `fill` and `stroke` inherit, so the emblem's 1.08 was wrong. A text box with no rule has the white Field face, and a part marked inside another (the column's sheet) takes the outer part's layers. The "Eat" tile shows with the drawing's protector as the stage's, plus `eat: true`. `PROTECT_SCENE`'s protector took the split layout away.

```
$ npx --no-install vitest run --maxWorkers=2 test/ui/hud-over-layers.test.ts      # from apps/web/, at b048c5ea
 × holds every ratio at 1366 × 768 (split), walking, in a conversation, the key caps included
 × holds every ratio at 1440 × 900 (split), …      × … at 1920 × 1080 (split), …
   + "span.hud-keycap \"B\" text over white: 3.81 under 4.5",
   + "span.hud-keycap \"Esc\" text over white: 4.39 under 4.5",
   + "span.hud-keycap.split-confirm \"Enter\" text over white: 4.39 under 4.5",
   + "button.hud-toggle.talk-log-toggle \"Conversation\" focus ring over white: 2.41 under 3",
   + "span. \"Conversation\" text over white: 3.48 under 4.5",
   + "button.split-hint \"EscClose\" focus ring over white: 2.41 under 3",
 × holds every ratio at 1280 × 720 (column), …   + "span.hud-keycap \"B\" text over white: 3.81 under 4.5"
 × holds every ratio at 390 × 844 (dock), …      (the same one)
 × takes --over-plate-alpha's step as the lowest at which all of them hold (FR-003)   (the six above, at 0.5)
 × keeps the title row's own corners and shadow while walking (R-7; FR-002)
   - [ "0.75rem 0.75rem 0 0", "none" ]   + [ "0.25rem", "0 0 0 0.25rem rgb(var(--glass) / var(--over-plate-alpha))" ]
 ✓ models the split layout's frame as the paint beneath the rows but the title row
 Test Files  1 failed (1)
      Tests  7 failed | 1 passed (8)
```

The review's numbers come back exactly: 3.48, 2.41, and 4.39 (and 2.91 for "Esc" on the lone plate, by the same formula). One failure the review didn't name: the "Eat" tile's "B" cap while walking, 3.81:1 over white, in every layout. It lies on the tile's own glass (`--glass-alpha` 0.6), not on a plate. It is R-2's class, so the same fix takes it.

### GREEN (`6f003f2e`), group A's CSS only (plan §9)

- `hud/split.css`'s appended block: the plates move from `.talk-head` to its words, `.talk-log-toggle` and `.split-hint`, each with the 0.25rem shadow its ring lies on. A new last rule gives the row `box-shadow: none` over the room, so `room.css`'s `.talk-head` plate shadow (the other layouts') doesn't reach it. The row keeps its glass (at `--over-glass-alpha`, through `--split-glass-alpha`) and its corners. That undoes R-7. No rule above the block is edited.
- `room.css`'s over-room block: `[data-over="room"] .hud-keycap` takes the palette's `--tile-face` (column and dock; the split layout is `data-hud="column"` too). The cap's border and lip are unchanged.
- No alpha changes, and no new one. I chose the cap's face over raising the plate: at 0.55 the plates' caps reach 5.02:1, but "B" is on no plate. `--over-plate-alpha` stays 0.5, still the lowest step with the caps counted (`--split-muted` is 4.01:1 at 0.45).

| over white | before | after |
|---|---|---|
| the title, on its toggle's plate on the row's glass | 3.48 (a lone plate) | 5.74 |
| the toggle's and the hint's focus rings | 2.41 | 3.98 |
| "Esc" (hint, "Back"), "Enter" | 4.39 (hint's "Esc": 2.91) | 10.32 |
| the "Eat" tile's "B" | 3.81 | 9.24 |
| a cap's border against its plate | 3.88 | 3.88 |

Over black, every pair is above 13:1 before and after. plan.md §R-A3 (a "Reworked by rework2-029a" paragraph), §R-A4, and tasks.md's T-A05 record this in `0f9874db`.

### R-5

`HudApplied.stage` (the window the walking view fills; RA-2, impl-029a's) is now named in plan §R-A1's S-10 paragraph, in T-A02, and in §9's ownership line (`0f9874db`).

### For the item's note (not code), as the brief asks

- **R-3 (Important, backlog).** In the column layout the closed conversation's sheet is marked from the larger view's reach (`compose/over.ts`, `hudParts`: `parts.set("larger", reach)`, mapped to `.talk-sheet`). So its lines may take plates where the column stands beside the room, not over it. The reviewer couldn't show a real window where it differs, and neither did this session. The cost is a look, not a contrast: an extra plate only darkens the backdrop. `hud-over-layers.test.ts` judges the sheet at 1280 × 720 and 390 × 844 with the column's or dock's layers, and both pass. It belongs to his look (SC-008) or a later spec.
- **R-4 (nit).** The stacked layout's comment (`over.ts`'s `hudParts`, "The stacked layout lays nothing over the stage: no part") and `hud-over-walking.test.ts`'s case name ("… which lays no part over the stage") say more than holds. The walking control and the "Eat" tile are `position: absolute` in the stage's corner there, so they lie over the room, unmarked. They keep their opaque tile faces (plan §R-A3), and the stacked layout has no `[data-over]` rule, so a mark would change nothing. The words should read "marks no part: the stacked layout's tiles over the stage keep their own faces". Left as is: the test file is rework-029a's, and the brief keeps this to the note. His look can say otherwise.
- **R-6 (nit).** rework-029a's RED for S-10 was shown by putting each fault back in scratch, never committed, because impl-029a's code already did what S-10 asked. Its output is in the section above. This rework's RED is a commit: `b048c5ea` fails 7 of 8, and `6f003f2e` passes them.
- **For the integration (T-INT).** Until group B's S-1 fix lifts the sheet's rows above the frame, `.split-top` and the log sit under the frame's fill: the frame is positioned with `z-index: 0`, the sheet is `display: contents`, and its rows are in flow. Group B's paint-order test holds that. `hud-over-layers.test.ts` takes the paint order B's fix sets (the frame under the rows), as its header says. On this branch alone, the stats and the log are seen through the frame's 0.3 fill. T-INT reruns this file on the merged tree.

### Runs (from `apps/web/`, GREEN at `6f003f2e`)

```
$ npx --no-install vitest run --maxWorkers=2 test/ui/hud-over-layers.test.ts test/ui/hud-over-contrast.test.ts
 Test Files  2 passed (2)
      Tests  19 passed (19)
   Duration  82.05s (tests 92%, transform 5%, import 4%)
```

The files covering the two changed sheets: every test file that reads `room.css`, `split.css`, or the helpers' `stylesheets()` (37, found by `grep -lE 'split\.css|room\.css|stylesheets\(\)' apps/web/test/*/*.test.ts`), plus plan §R-A4's list and the walking view's files not among them (`hud-over-walking`, `hud-split-fallback`, `hud-split-model`, `stages-checks`, `stages-floor`, `resize`, `walking`):

```
$ npx --no-install vitest run --maxWorkers=2 test/room/events.test.ts test/room/flat.test.ts test/room/hud-contrast.test.ts test/room/hud-wall-geometry.test.ts \
    test/room/loading-contrast.test.ts test/room/objects.test.ts test/room/stages.test.ts test/ui/a11y.test.ts \
    test/ui/around.test.ts test/ui/avatars.test.ts test/ui/degraded.test.ts test/ui/eat-button.test.ts \
    test/ui/eat-place.test.ts test/ui/flat-frame.test.ts test/ui/hud-a11y.test.ts test/ui/hud-look.test.ts \
    test/ui/hud-notes.test.ts test/ui/hud-over-contrast.test.ts test/ui/hud-over-layers.test.ts test/ui/hud-over-room.test.ts \
    test/ui/hud-pointer.test.ts test/ui/hud-split-a11y.test.ts test/ui/hud-split-contrast.test.ts test/ui/hud-split-dog.test.ts \
    test/ui/hud-split-list.test.ts test/ui/hud-split-rest-row.test.ts test/ui/hud-split.test.ts test/ui/hud-wall-dom.test.ts \
    test/ui/hud.test.ts test/ui/loading-a11y.test.ts test/ui/loading-notes.test.ts test/ui/loading-page.test.ts \
    test/ui/loading-style.test.ts test/ui/narration-room.test.ts test/ui/pick.test.ts test/ui/resume-room.test.ts \
    test/ui/text-copy.test.ts test/ui/hud-over-walking.test.ts test/ui/hud-split-fallback.test.ts test/ui/hud-split-model.test.ts \
    test/room/stages-checks.test.ts test/room/stages-floor.test.ts test/ui/resize.test.ts test/ui/walking.test.ts
 RUN  v5.0.3 …/rework2-029a/apps/web
 Test Files  44 passed (44)
      Tests  610 passed (610)
   Duration  466.81s (tests 66%, import 33%)
exit 0
```

`twin-2d.test.ts` (the flaky one) isn't among them. No source file but the two sheets changed, so no other file covers this rework.

```
$ make lint      # from the worktree's root
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
879 files already formatted
… shellcheck -- … (no output)
exit 0
```

`make test`, `make evals`, and `make check` are T-INT's, once, on the merged tree (the night's rule 4). The image stage fails in the workers' containers (night 3's Q46 and Q48); that is left to his gate.

### Departures and the page

- No departure from the plan beyond what §R-A3's rework paragraph records: the cap's face over the room, not a raised plate step, and the title row's words plated in place of the row.
- No hook or bash-gate refusal of a command. One refusal by the permission layer: a Monitor whose script waited on the covering run's log with a shell loop needed approval. I didn't rephrase it; I waited for the background run's own notice. It goes on the page.
- No new question.

## rework3-029a: rv-029a-2's RR-1, and RR-2 to the note (T-A06)

Branch `night/rework3-029a/rework3-029a`, based on `refs/heads/night/rework2-029a/rework2-029a` (tip `a4c8af8d`). The worktree had no `node_modules`, so `make setup` first (exit 0, last line "git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks"). Every run used `npx --no-install`.

### Why rework2's test passed

`hud-over-layers.test.ts` judged a ring outside its control on the control's own shadow, then on the parent's layers: it took the ring to lie inside the parent's box. The title row's hint is `min-height: 2.75em`, which is the row's `--wall-title-h` track (`split.css`'s grid row 1). The title's toggle is 44 px (`.room button`), taller than the row wherever `scaleLeft` is under 1, and within 4 px of its edge under 1.18. So both rings lay 2 to 4 px above the panel's top, where only the plate's 0.25rem shadow lies over the bare room.

### RED (`23888e5b`): `hud-over-layers.test.ts`, edited

I edited the existing file (rework2-029a's, not a fix task's given test). No hook refused the edit, so no new file was needed. The ring's band (offset plus width) is now set against the parent's box from the declared sizes. The parent's height comes from a fixed grid track (display: contents passed through), else its `height`, raised to its `min-height`. The control's height is its `min-height` or `height`. The control is centred where the parent is a row that centres its items, else it sits at the parent's padding top (`padding-top` or the shorthand). A parent with no fixed height grows around its controls, so the band is taken to fit. Where the band leaves the parent, the ring is judged over the control's own shadow, if that reaches past the ring, and then the layers beyond the parent: its ancestors' up to the part, the split frame not counted (the frame starts at the title row's foot). Only the vertical axis is checked: the title row pads its sides by 0.25rem, the band. A new case pins the sizes: at 1366 × 768 both controls' bands leave the row.

My first draft read only `padding-top`, so it also failed "Back" (`button.split-back … 2.41`). Its parent is the list itself, with `padding: 0.5rem 0.75rem` (shorthand) and `flex-direction: column`. That was a flaw in the model, not a finding: Back's ring lies 4 px inside the list's 8 px padding, on its own plate over the list's glass. I fixed the model (the shorthand, and the column's `align-items` being the horizontal axis) before the RED commit. Run at `a4c8af8d`'s CSS:

```
$ npx --no-install vitest run --maxWorkers=2 test/ui/hud-over-layers.test.ts      # from apps/web/
 ❯ test/ui/hud-over-layers.test.ts (9 tests | 4 failed) 30450ms
     × holds every ratio at 1366 × 768 (split), walking, in a conversation, the key caps included 26627ms
     × holds every ratio at 1440 × 900 (split), walking, in a conversation, the key caps included 849ms
     × holds every ratio at 1920 × 1080 (split), walking, in a conversation, the key caps included 857ms
     × takes --over-plate-alpha's step as the lowest at which all of them hold (FR-003) 887ms
AssertionError: expected [ …(2) ] to deeply equal []
+   "button.hud-toggle.talk-log-toggle \"Conversation\" focus ring over white: 2.41 under 3",
+   "button.split-hint \"EscClose\" focus ring over white: 2.41 under 3",
 Test Files  1 failed (1)
      Tests  4 failed | 5 passed (9)
   Duration  114.88s (tests 95%, transform 3%, import 2%)
```

That is the review's number, at all three split windows. The column (1280 × 720) and dock (390 × 844) cases pass: their title row is a plated `.talk-head` whose buttons' rings are already inside (`room.css`'s `.hud-panels[data-over="room"] button:focus-visible`).

### GREEN (`d2897e05`), in group A's CSS only (plan §9)

`split.css`'s appended block, two rules after its last one (no rule above edited, `room.css` untouched):

- `.talk[data-over="room"] .talk-log-toggle:focus-visible` and `… .split-hint:focus-visible`: `outline-offset: -4px`. The ring lies on the control's plate over the row's glass: 3.98:1 over white, the figure rework2's table gives for a ring on that plate.
- `.talk[data-over="room"] .talk-log-toggle` and `… .split-hint`: `box-shadow: none`. No ring needs the shadow now, so the review's optional step is taken: the plate's shadow no longer overhangs the row. The plates keep their background and corners. The selector-list rule above (`background` with the shadow) is unedited, so `hud-over-contrast.test.ts`'s check (every plate rule carries its shadow) reads it as before.

Both rules name `[data-over="room"]` (FR-005). No alpha changes; the alphas stay data in `room.css`'s `:root`. plan.md §R-A3 (a "Reworked by rework3-029a" paragraph), §R-A4, and tasks.md's T-A06 record this in the same commit.

### For the item's note (not code)

- **RR-2 (nit, his look).** Over the room the title toggle and "Close" lose spec 014's hover cue. The plate rule in `split.css`'s block (`.talk[data-over="room"] .talk-log-toggle`, `… .split-hint`, at (0,5,1), `background`) outranks `room.css`'s hover rule (`html[data-hud="column"] .hud-panels button:hover`, (0,3,2): `background: var(--tile-face-lit)` and an inset 1 px neon `box-shadow`; the toggle has no border, so `border-color` shows nothing). So walking, the pointer over either control changes nothing. That was rework2's code. This rework's `box-shadow: none` outranks the inset shadow as well, the same way, and changes nothing the visitor sees. A fix would be a `:hover` variant in the same block, which his look can ask for.
- **Seen while fixing, for his look.** At `scaleLeft` under 1, the toggle's 44 px box is taller than the row, so its plate (now with no shadow) still reaches (44 − row) / 2 px above the panel's top. The ring is inside it, and the title's words are inside the row. It's a sliver of 0.5 glass at most a few px tall. Changing the target size is outside group A's CSS (FR-046's 44 px).

### Runs (from `apps/web/`, GREEN at `d2897e05`)

```
$ npx --no-install vitest run --maxWorkers=2 test/ui/hud-over-layers.test.ts test/ui/hud-over-contrast.test.ts
 Test Files  2 passed (2)
      Tests  20 passed (20)
   Duration  100.68s (tests 91%, transform 5%, import 4%)
```

The files covering `split.css`: the same set as rework2-029a's covering run. That is every test file reading `room.css`, `split.css`, or the helpers' `stylesheets()` (`grep -lE 'split\.css|room\.css|stylesheets\(\)' test/*/*.test.ts`), plus plan §R-A4's list and the walking view's files: 44 files, sorted, the same 44 as rework2-029a's. The one extra test is this rework's new case.

```
$ npx --no-install vitest run --maxWorkers=2 test/room/events.test.ts test/room/flat.test.ts test/room/hud-contrast.test.ts \
    test/room/hud-wall-geometry.test.ts test/room/loading-contrast.test.ts test/room/objects.test.ts test/room/stages-checks.test.ts \
    test/room/stages-floor.test.ts test/room/stages.test.ts test/ui/a11y.test.ts test/ui/around.test.ts test/ui/avatars.test.ts \
    test/ui/degraded.test.ts test/ui/eat-button.test.ts test/ui/eat-place.test.ts test/ui/flat-frame.test.ts test/ui/hud-a11y.test.ts \
    test/ui/hud-look.test.ts test/ui/hud-notes.test.ts test/ui/hud-over-contrast.test.ts test/ui/hud-over-layers.test.ts \
    test/ui/hud-over-room.test.ts test/ui/hud-over-walking.test.ts test/ui/hud-pointer.test.ts test/ui/hud-split-a11y.test.ts \
    test/ui/hud-split-contrast.test.ts test/ui/hud-split-dog.test.ts test/ui/hud-split-fallback.test.ts test/ui/hud-split-list.test.ts \
    test/ui/hud-split-model.test.ts test/ui/hud-split-rest-row.test.ts test/ui/hud-split.test.ts test/ui/hud-wall-dom.test.ts \
    test/ui/hud.test.ts test/ui/loading-a11y.test.ts test/ui/loading-notes.test.ts test/ui/loading-page.test.ts \
    test/ui/loading-style.test.ts test/ui/narration-room.test.ts test/ui/pick.test.ts test/ui/resize.test.ts \
    test/ui/resume-room.test.ts test/ui/text-copy.test.ts test/ui/walking.test.ts
 RUN  v5.0.3 …/rework3-029a/apps/web
 Test Files  44 passed (44)
      Tests  611 passed (611)
   Duration  572.35s (tests 67%, import 33%)
exit 0
```

`twin-2d.test.ts` (the flaky one) isn't among them. No source file but `split.css` changed.

```
$ make lint      # from the worktree's root
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
879 files already formatted
… shellcheck -- … (no output)
exit 0
```

`make test`, `make evals`, and `make check` belong to T-INT, run once on the merged tree (the night's rule 4). The image stage fails in the workers' containers (night 3's Q46 and Q48), so it's left to his gate.

### Departures and the page

- No departure from the plan beyond what §R-A3's rework3 paragraph records.
- No hook, bash-gate, or permission refusal this task. I waited on the background run by its own notice, never with a Monitor or a shell loop.
- No new question.
