# `back-029c`'s notes: the sheet's back (spec 029, group C, T-C07)

Night 4 (2026-11-16). This is an implementer's work on group C's line, from `impl-029c`'s tip `f2686864`, beside `bind-029c`. I don't touch its files (`room/scene.yaml`, `piece-words.test.ts`, `impl-c.md`). `verify-029c` merges this tip into bind-029c's later. Paths are under `apps/web/` unless they start otherwise.

## What and why

- **The finding (rv-impl-029c's C-1).** `src/room/scene/bundle3d.ts` put one canvas map on a `DoubleSide` material. `scene/grip.ts` turns the held sheet's +Z to the figure's front, and the walking view's follow camera stands behind the figure, so it sees the sheet's back. There, "RESUME" read mirrored, upper left to lower right, against FR-020's "lower left to upper right".
- **The answer, provisional.** Under the Author's rule 1, I took the page's Q38 recommended answer: "RESUME" readable from both sides, with the back showing the same drawing unmirrored. If he overturns Q38, this is reworked before he merges.
- **The fix** (`scene/bundle3d.ts` only):
  - A drawn sheet's two materials (`atTwin`, `atVisitor`) now draw its front only (`FrontSide`).
  - Each sheet, the travelling one and the kept one, holds a back of its own: a child mesh on the same plane, `BackSide`, white and transparent.
  - The back's map is a clone of the front's `CanvasTexture` with `repeat.x = -1` and `offset.x = 1`. The clone shares the one canvas (one `Source`, so one upload).
  - A chalk-face redraw marks both maps.
  - The back's `opacity` is an accessor that reads its front material's. The hand-off (`showHandoff`) and the avatars' keeping of the paper (`scene/avatars.ts`'s `keepPaper`) write only the front materials, and `avatars.ts` is no group's file (plan §9), so the back follows without anything else changing.
  - A plain sheet (no document) stays one white `DoubleSide` mesh, as before.
- **Why a child mesh, and not a shader patch.** The other route was `onBeforeCompile`, flipping u where `!gl_FrontFacing`. It would keep one material per sheet, but nothing in Node can show what it draws: jsdom has no WebGL. With a mesh and a map transform, a test can follow the real drawing's word through the map and the plane's UVs to a viewer on each side. Being a child, the back moves with its sheet into any hand or picture.
- **Unchanged:** the front's look, the 2D paper (`flat.ts`), the sheet's colour, opacities and size, and the word. The word stays room data (`paper.word`, read through `uiWord`), never a literal.
- **N-3.** `scene.ts:234-240` (the document into `buildRoom`) is now held by `paper-back.test.ts`'s `createScene` case. The drawn scene's two sheets carry the drawn `CanvasTexture` (512 × 724), "RESUME" is drawn on it, and both read from both sides.
- **Recorded in:** plan.md §R-C7, as a bullet of its own ("back-029c, the sheet's back …"), and tasks.md as T-C07, marked done. Neither touches another line.

## Commits

| Commit | Step |
|---|---|
| `b7fc18df` | save point: `make setup`, then the RED |
| `a040d412` | save point: `paper-back.test.ts` written and seen failing |
| `1ccfbfa5` | RED: `paper-back.test.ts` (new), `paper-sheet.test.ts` (rewritten test-first), seen failing |
| `b97f52da` | save point: GREEN next |
| `435f111a` | GREEN: `scene/bundle3d.ts`; plan §R-C7's bullet; tasks.md T-C07. No test file is in this commit. |
| `2d8fdb16` | save point: the tuple typing |
| `74d192a3` | test-only: `paper-back.test.ts`'s screen points typed as tuples, because `tsc` (`noUncheckedIndexedAccess`) refused a destructured `.map`. No assertion changed, and it isn't the fix commit. |
| (this one) | the note |

## The tests

`test/room/paper-back.test.ts` (new):

- "draws the word once on the sheet's canvas, through paper.ts": the real `drawPaper`'s calls, recorded on a stand-in 2D context for the paper-sized canvas only.
- "reads RESUME lower left to upper right, unmirrored, from the front and the back of both sheets": through the real `buildRoom`. For each mesh that draws a side (by `side` and the normal matrix), the word's two ends and a point along its letters' up are followed from the canvas, through the map's matrix (inverted) and the plane's UVs, to the world. A viewer on that side, with the sheet's +Y up, sees them. Checked: the run goes right and up, along the diagonal, and the letters' up lies to the left of the run (a mirror image reverses that). Both sheets are checked as built and turned (0.3, π/2, −0.2).
- "draws the back from the front's one drawing, white and transparent, at the front's opacity": the back shows the same canvas and follows `showHandoff` and direct writes to the front materials, as `avatars.ts` makes them.
- "draws the held paper with the drawn canvas texture, RESUME on it, readable from both sides" (N-3): through `createScene`, with a stand-in renderer and the repository's part.

`test/room/paper-sheet.test.ts`, rewritten test-first (seen failing in `1ccfbfa5`):

- The case "gives both materials one canvas texture of the drawing, keeping their colour, opacities, and both sides" becomes "gives both materials one canvas texture of the drawing, keeping their colour and opacities, on the front". It expects `FrontSide` where it expected `DoubleSide`.
- "is plain without a document, as before" (name unchanged) also checks `DoubleSide` and that neither sheet has children.
- "draws the word in the chalk face's family, and again when that family changes" (name unchanged) checks that every map under both sheets grows in version, the backs' too, where it checked only `atTwin`'s.
- The header comment says the same.

### RED (on `f2686864`'s code, tests of `1ccfbfa5`)

```
$ cd apps/web && npx --no-install vitest run --maxWorkers=2 test/room/paper-back.test.ts test/room/paper-sheet.test.ts
 ❯ test/room/paper-sheet.test.ts (9 tests | 2 failed) 23456ms
   ❯ the sheet in 3D (scene/bundle3d.ts; FR-020) (3)
     × gives both materials one canvas texture of the drawing, keeping their colour and opacities, on the front 2614ms
     × draws the word in the chalk face's family, and again when that family changes 19ms
 ❯ test/room/paper-back.test.ts (4 tests | 3 failed) 2726ms
   ❯ the sheet from both sides, in buildRoom (Q38; C-1; FR-020) (3)
 FAIL  test/room/paper-back.test.ts > the sheet from both sides, in buildRoom (Q38; C-1; FR-020) > reads RESUME lower left to upper right, unmirrored, from the front and the back of both sheets
AssertionError: the travelling sheet, as built, seen from its back: the word runs left to right: expected -0.14699999999999996 to be greater than 0
 FAIL  test/room/paper-back.test.ts > the sheet from both sides, in buildRoom (Q38; C-1; FR-020) > draws the back from the front's one drawing, white and transparent, at the front's opacity
AssertionError: a back of its own: expected undefined to be defined
 FAIL  test/room/paper-back.test.ts > the sheet through createScene (N-3; scene.ts gives buildRoom the document) > draws the held paper with the drawn canvas texture, RESUME on it, readable from both sides
AssertionError: a sheet of the drawn scene, seen from its back: the word runs left to right: expected -0.1469999999999999 to be greater than 0
 FAIL  test/room/paper-sheet.test.ts > the sheet in 3D (scene/bundle3d.ts; FR-020) > gives both materials one canvas texture of the drawing, keeping their colour and opacities, on the front
AssertionError: expected 2 to be +0 // Object.is equality
 FAIL  test/room/paper-sheet.test.ts > the sheet in 3D (scene/bundle3d.ts; FR-020) > draws the word in the chalk face's family, and again when that family changes
AssertionError: expected 1 to be greater than 1
 Test Files  2 failed (2)
      Tests  5 failed | 8 passed (13)
exit 1
```

How to read the RED:

- C-1 as the review gave it: the front read correctly and the back ran right to left (−0.147 m). This is in buildRoom and in the scene `createScene` draws.
- N-3's front assertions passed on the old code (two sheets, a `CanvasTexture` of 512 × 724, "RESUME" drawn), as they should. It is a coverage test, and its case failed only at the back.
- `2` is `DoubleSide`; `0` is `FrontSide`.

The jsdom notice "Not implemented: HTMLCanvasElement's getContext() … canvas npm package" is printed by the tests that leave jsdom's own `getContext`, as before.

### GREEN

```
$ cd apps/web && npx --no-install vitest run --maxWorkers=2 test/room/paper-back.test.ts test/room/paper-sheet.test.ts
 Test Files  2 passed (2)
      Tests  13 passed (13)
exit 0
```

That run was on `435f111a`, and again after `74d192a3`: 13 passed both times.

The tests covering the changed files: every test that imports `scene/bundle3d`, `src/room/scene`, or `scene/grip`, or reads `room.paper`. That's 60 files, run on `435f111a`. `74d192a3` changes only the new test's typing.

```
$ cd apps/web && npx --no-install vitest run --maxWorkers=2 test/lookdev/page.test.ts test/room/avatar-driver.test.ts test/room/avatar-gait-lift.test.ts test/room/avatar-gait.test.ts test/room/avatar-handoff.test.ts test/room/avatar-hands.test.ts test/room/avatar-scene.test.ts test/room/avatars.test.ts test/room/cables.test.ts test/room/camera.test.ts test/room/chase-face.test.ts test/room/chase-figures.test.ts test/room/chase-stage.test.ts test/room/data-only.test.ts test/room/dino-cutout-visit.test.ts test/room/dino-scene-wiring.test.ts test/room/dog-avatar.test.ts test/room/dog-figure.test.ts test/room/dog-line.test.ts test/room/dog-pick.test.ts test/room/dog-run.test.ts test/room/dog-selectable.test.ts test/room/eat-after-scene.test.ts test/room/eat-checks.test.ts test/room/eat-model.test.ts test/room/eat-scene.test.ts test/room/events.test.ts test/room/faces.test.ts test/room/fit.test.ts test/room/flat.test.ts test/room/gait-alloc.test.ts test/room/geometry.test.ts test/room/grip.test.ts test/room/highlight.test.ts test/room/loader.test.ts test/room/monitor-cursor.test.ts test/room/objects.test.ts test/room/paper-back.test.ts test/room/paper-sheet.test.ts test/room/pet-bench.test.ts test/room/pet-dormant.test.ts test/room/pet-shell.test.ts test/room/pet-wiring.test.ts test/room/pick.test.ts test/room/quality.test.ts test/room/ray.test.ts test/room/scene-fit.test.ts test/room/scene.test.ts test/room/stage-walk.test.ts test/room/twin-faults.test.ts test/room/twin-figure.test.ts test/room/twin-handoff.test.ts test/room/twin-network.test.ts test/room/walking.test.ts test/ui/a11y.test.ts test/ui/around.test.ts test/ui/degraded.test.ts test/ui/eat-input.test.ts test/ui/highlight.test.ts test/ui/pick.test.ts
 Test Files  60 passed (60)
      Tests  1083 passed (1083)
exit 0
```

### `make lint`

The first run, on `435f111a`, failed in `tsc` on the new test file only:

```
apps/web/test/room/paper-back.test.ts(154,15): error TS18048: 'e' is possibly 'undefined'.
… (six lines, 'e', 's', 'u' at 154 and 155)
make: *** [Makefile:230: lint] Error 1
exit 2
```

After `74d192a3`:

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
880 files already formatted
{ git ls-files -z '*.sh' … } | … xargs -0 -t shellcheck -- …
shellcheck -- .claude/git-hooks/pre-commit … tools/gates/secrets.sh
exit 0
```

What I didn't run, as the brief has it: the full `make check`, which is T-INT's, and `make test` and `make evals`. The image stage fails in the workers' containers (night 3's Q46 and Q48), so it is left to his gate. `twin-2d.test.ts` covers none of these files and wasn't run.

## What his look should check

- **The walking view, the sheet from behind.** This is the case C-1 is about. After the hand-off, walk with an avatar that has a holding hand, so the follow camera sees the held sheet's back. "RESUME" should read lower left to upper right, not mirrored. Check the same in the hand-off itself, when the twin turns the sheet.
- **The front, unchanged:** the sheet from the front, at the twin's hand before the hand-off and while it travels.
- **No ghost in the cross-fade.** Watch the reduced-motion and "appear" hand-offs, where the two sheets cross-fade: only one side of each sheet should draw from any viewpoint, with no doubled or mirrored word.
- **A drafts build isn't needed.** The paper's word isn't held by an approval, so a release build shows it.
- **Not this task's, but seen while reading (for the reviewer and the backlog).** With a cut-out visitor (no avatar model, or a model that has no holding hand), `keepPaper` puts the kept sheet in the cut-out's picture, which `scene/figure.ts:107` mirrors (`scale.x = -1`) when the figure walks toward the camera's left. Then both faces of the sheet read mirrored, as the front already did before this change. I didn't change it: it isn't C-1, and the picture's mirror is spec 008's. If his look finds it, it's a small follow-up: the sheet can undo its parent's mirror.

## Refusals

- The **Monitor** tool, for waiting on the covering run (`until grep -q "^exit " …; do sleep 5; done; grep …`), was refused by the permission layer: "This Bash command contains multiple operations. The following part requires approval". I didn't run it another way. I waited for the background run's own notice instead.
- No hook and no bash-gate refusal.

## Questions

None new. Q38 is already on the page, and this work takes its recommended answer, provisionally.
