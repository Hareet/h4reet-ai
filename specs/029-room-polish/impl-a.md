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
