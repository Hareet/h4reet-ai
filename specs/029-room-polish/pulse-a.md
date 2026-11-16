# pulse-029a: the waiting status over the room doesn't pulse (rv-line-029's L-1; the page's Q59)

Night 2026-11-16 · implementer `pulse-029a` (wrote none of spec 029's groups or the line's merges) · branch `night/pulse-029a/pulse-029a` · base `c315c5d5` (the line's tip: A, B, C, D merged; `merge-2.md`) · task T-A07 (`tasks.md`), plan §R-A3 and §R-A4.

## The finding

rv-line-029's L-1 (Important, not blocking under rule 11, because no turn goes until the Author re-marks readiness, Q17): spec 007's waiting status pulses. `apps/web/src/talk/talk.css:77-86` sets `.talk-status:not(:empty) { animation: talk-waiting 1.6s ease-in-out infinite; }` and `@keyframes talk-waiting { 50% { opacity: 0.6; } }` inside `@media (prefers-reduced-motion: no-preference)`. Opacity fades the whole element, so over group A's see-through panel the status's plate (`room.css`, `[data-over="room"] .talk-status:not(:empty)` at `--over-plate-alpha` 0.5) fades along with its words, and so does the panel's glass beneath (`--over-glass-alpha` 0.3). At the pulse's low point, over a white pixel, the words fall to 2.79:1, under FR-003's 4.5:1 (5.74:1 at opacity 1). Spec 007's requirement is FR-034 ("The status SHALL have no motion under reduced motion"); the pulse itself is talk.css's, under that rule.

Why no test caught it: `test/ui/hud-over-layers.test.ts`'s header says its cascade reads "their top-level rules only". `parseCss` (`test/helpers/room.ts:840`) puts every `@media` block and `@keyframes` in `atRules`, so neither the pulse's rule nor its keyframes reached the cascade.

The night took Q59's recommended answer: stop the pulse over the room.

## The test (red on `c315c5d5`)

As the brief preferred, the case went into `apps/web/test/ui/hud-over-layers.test.ts`, as a section with its own harness. No hook refused the edit. The one change to the existing harness: `declared()` takes an optional rule list, defaulting to `RULES`, so every existing call behaves as before. A line in the header points to the new section.

What the section does:
- **Reads every rule in order.** It walks every style rule and every `@keyframes` of `room.css`, `talk.css`, and `hud/split.css`, in the page's order, with the at-rules each one sits in.
- **Evaluates the media at the window.** No visitor setting is on (reduced motion, reduced transparency, more contrast, forced colours), so motion is `no-preference`. `orientation`, `min-width`, and `max-width` come from the window's size. `hover` and `@supports` count as "can't tell".
- **Finds the lowest opacity from the stylesheet.** The status's lowest opacity comes from the keyframes of the infinite animation the cascade gives it in that state, not from a copied 0.6.
- **Judges the plate and words faded together.** Both fade to that opacity over the layers beneath the status (`layersUnder`, as the file's other cases use). The words must reach 4.5:1, or 3:1 at 24 px, over white and over black.
- **Runs these windows.** A topic's opening turn is in flight (the sender never answers), so the status shows "The twin is answering.". 3D, in the room and walking: 1366 × 768, 1440 × 900, 1920 × 1080, and 390 × 844 (FR-007's windows), plus 1280 × 720, where the column layout shows outside the split layout. 2D, in the room: 1366 × 768 and 390 × 844.
- **Checks each status.** Wherever a part marked `data-over="room"` holds the status, its words must meet AA. Elsewhere it must keep `talk-waiting` with a low point under 1 (spec 007's pulse, unchanged).
- **Checks coverage.** One case checks that the status was judged in the split layout's walking view, the column's walking view, the dock's walking view, and the dock at rest, and that his three windows at rest in 3D kept the pulse in the split layout.
- **Checks reduced motion.** One case checks that reduced motion leaves the status at opacity 1, at rest and walking.
- **Guards the model.** The top-level rules the walker reads equal `RULES`. talk.css's pulse sits only in the `no-preference` block, with opacity keyframes. No at-rule in the state sets a layer property (background, colour, display, fill, opacity) on the status or any ancestor. No "can't tell" rule animates one. No ancestor rests below opacity 1.

Run on the test commit `8637bdbe` (the CSS is `c315c5d5`'s), from `apps/web` after `make setup`:

```
$ npx --no-install vitest run test/ui/hud-over-layers.test.ts --maxWorkers=4
exit 1
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-16/pulse-029a/apps/web

 ❯ test/ui/hud-over-layers.test.ts (24 tests | 8 failed) 35401ms
   ❯ the waiting status over the room, at its pulse's lowest opacity (pulse-029a; L-1, Q59; FR-003, FR-007) (15)
     × keeps the status's words at AA at 1366 × 768 in 3d, walking 72ms
     × keeps the status's words at AA at 1440 × 900 in 3d, walking 60ms
     × keeps the status's words at AA at 1920 × 1080 in 3d, walking 56ms
     × keeps the status's words at AA at 390 × 844 in 3d, in the room 45ms
     × keeps the status's words at AA at 390 × 844 in 3d, walking 58ms
     × keeps the status's words at AA at 1280 × 720 in 3d, in the room 82ms
     × keeps the status's words at AA at 1280 × 720 in 3d, walking 67ms
     × keeps the status's words at AA at 390 × 844 in 2d, in the room 72ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/ui/hud-over-layers.test.ts > the waiting status over the room, at its pulse's lowest opacity (pulse-029a; L-1, Q59; FR-003, FR-007) > keeps the status's words at AA at 1366 × 768 in 3d, walking
 FAIL  test/ui/hud-over-layers.test.ts > the waiting status over the room, at its pulse's lowest opacity (pulse-029a; L-1, Q59; FR-003, FR-007) > keeps the status's words at AA at 1440 × 900 in 3d, walking
 FAIL  test/ui/hud-over-layers.test.ts > the waiting status over the room, at its pulse's lowest opacity (pulse-029a; L-1, Q59; FR-003, FR-007) > keeps the status's words at AA at 1920 × 1080 in 3d, walking
AssertionError: expected [ Array(1) ] to deeply equal []
+   "p.talk-status \"The twin is answering.\" in split at opacity 0.6 over white: 2.79 under 4.5",

 FAIL  test/ui/hud-over-layers.test.ts > the waiting status over the room, at its pulse's lowest opacity (pulse-029a; L-1, Q59; FR-003, FR-007) > keeps the status's words at AA at 390 × 844 in 3d, in the room
 FAIL  test/ui/hud-over-layers.test.ts > the waiting status over the room, at its pulse's lowest opacity (pulse-029a; L-1, Q59; FR-003, FR-007) > keeps the status's words at AA at 390 × 844 in 2d, in the room
AssertionError: expected [ Array(1) ] to deeply equal []
+   "p.talk-status \"The twin is answering.\" in dock at opacity 0.6 over white: 2.79 under 4.5",

 FAIL  test/ui/hud-over-layers.test.ts > the waiting status over the room, at its pulse's lowest opacity (pulse-029a; L-1, Q59; FR-003, FR-007) > keeps the status's words at AA at 390 × 844 in 3d, walking
AssertionError: expected [ Array(1) ] to deeply equal []
+   "p.talk-status \"The twin is answering.\" in dock at opacity 0.6 over white: 3.78 under 4.5",

 FAIL  test/ui/hud-over-layers.test.ts > the waiting status over the room, at its pulse's lowest opacity (pulse-029a; L-1, Q59; FR-003, FR-007) > keeps the status's words at AA at 1280 × 720 in 3d, in the room
 FAIL  test/ui/hud-over-layers.test.ts > the waiting status over the room, at its pulse's lowest opacity (pulse-029a; L-1, Q59; FR-003, FR-007) > keeps the status's words at AA at 1280 × 720 in 3d, walking
AssertionError: expected [ Array(1) ] to deeply equal []
+   "p.talk-status \"The twin is answering.\" in column at opacity 0.6 over white: 2.79 under 4.5",

 Test Files  1 failed (1)
      Tests  8 failed | 16 passed (24)
   Start at  17:12:41
   Duration  130.67s (tests 95%, transform 3%, import 3%)
```

(Each failure's diff header, `- Expected`, `+ Received`, and the source frame at `hud-over-layers.test.ts:935:24` are left out. Every failure is the same `expect(failures).toEqual([])`.)

Reading: the opacity, 0.6, is read from `talk-waiting`'s keyframes. The 2.79:1 over white is rv-line-029's number. The dock's walking view reads 3.78:1 because more layers lie beneath its status. His three windows at rest (the split layout, the panel in the grey band) and 1366 × 768 in 2D were outside the room, kept the pulse, and passed.

## The fix (green)

`apps/web/src/room/room.css`, group A's over-room block, directly after the plates rule:

```css
html[data-hud="column"] [data-over="room"] .talk-status,
html[data-hud="dock"] [data-over="room"] .talk-status {
  animation: none;
}
```

Checked against the code: the split layout sets `data-hud="column"` (and `data-split="on"`), and the parts that hold the status, `.talk` (split), `.hud-panels`, and `.talk-sheet` (column, dock), are the ones `layout.ts` marks. At specificity (0,3,1), the rule outranks talk.css's `.talk-status:not(:empty)` at (0,2,0), whatever order the sheets load in. `split.css` sets no animation on the status. Outside the room nothing matches, so spec 007's pulse is unchanged. Under reduced motion there was already none (talk.css's block doesn't apply, and `room.css`'s `prefers-reduced-motion: reduce` rule sets `animation: none !important`). No other file outside A's CSS and the test changed. `plan.md` §R-A3 (the rule and why) and §R-A4 (the test), and `tasks.md`'s T-A07 (done), are in the same commit as the fix.

```
$ npx --no-install vitest run test/ui/hud-over-layers.test.ts --maxWorkers=4
exit 0

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-16/pulse-029a/apps/web


 Test Files  1 passed (1)
      Tests  24 passed (24)
   Start at  17:15:17
   Duration  138.81s (tests 95%, transform 3%, import 2%)
```

After prettier's line breaks (`945b2ff4`, below), the file ran again: `Test Files  1 passed (1)`, `Tests  24 passed (24)`, `Start at  17:27:41`, `Duration  101.97s`, exit 0.

## The covering runs

Workers: `/sys/fs/cgroup/cpu.max` reads `400000 100000`, so quota ÷ period = 400000 / 100000 = 4, and `--maxWorkers=4`. `make setup` exited 0 (vitest is hoisted to the workspace's `node_modules`, so `npx --no-install` from `apps/web` finds it; Q25).

The list, run from `apps/web`:
- every `test/ui/hud-over*` file: `hud-over-contrast`, `hud-over-layers`, `hud-over-room`, `hud-over-walking`;
- `test/ui/talk-answer-shows.test.ts`;
- `git grep -l -E 'talk\.css|room\.css|split\.css' -- test`;
- the test files that import the two helpers that grep finds, `test/room/legacy-stages.ts` and `test/ui/hud-model.ts`, which aren't test files themselves (`git grep -l -E 'legacy-stages|hud-model' -- test`).

`git grep -l -E 'talk\.css|room\.css|split\.css' -- test`:

```
test/room/events.test.ts
test/room/flat.test.ts
test/room/hud-contrast.test.ts
test/room/hud-wall-geometry.test.ts
test/room/legacy-stages.ts
test/room/loading-contrast.test.ts
test/room/objects.test.ts
test/room/stages.test.ts
test/ui/a11y.test.ts
test/ui/around.test.ts
test/ui/choice-cards.test.ts
test/ui/eat-button.test.ts
test/ui/eat-place.test.ts
test/ui/flat-frame.test.ts
test/ui/hud-a11y.test.ts
test/ui/hud-look.test.ts
test/ui/hud-model.ts
test/ui/hud-notes.test.ts
test/ui/hud-over-contrast.test.ts
test/ui/hud-over-layers.test.ts
test/ui/hud-over-room.test.ts
test/ui/hud-pointer.test.ts
test/ui/hud-split-a11y.test.ts
test/ui/hud-split-contrast.test.ts
test/ui/hud-split-dog.test.ts
test/ui/hud-split-list.test.ts
test/ui/hud-split-rest-row.test.ts
test/ui/hud-split.test.ts
test/ui/hud-wall-dom.test.ts
test/ui/hud.test.ts
test/ui/loading-a11y.test.ts
test/ui/loading-page.test.ts
test/ui/loading-style.test.ts
test/ui/pick.test.ts
test/ui/talk-answer-shows.test.ts
test/ui/talk-turns.test.ts
test/ui/text-copy.test.ts
```

The 44 files run (the union, de-duplicated):

```
test/room/events.test.ts test/room/flat.test.ts test/room/hud-contrast.test.ts test/room/hud-wall-geometry.test.ts test/room/legacy-stages.test.ts test/room/loading-contrast.test.ts test/room/objects.test.ts test/room/stages-checks.test.ts test/room/stages-floor.test.ts test/room/stages.test.ts test/ui/a11y.test.ts test/ui/around.test.ts test/ui/choice-cards.test.ts test/ui/credits.test.ts test/ui/degraded.test.ts test/ui/eat-button.test.ts test/ui/eat-place.test.ts test/ui/flat-frame.test.ts test/ui/hud-a11y.test.ts test/ui/hud-look.test.ts test/ui/hud-model.test.ts test/ui/hud-notes.test.ts test/ui/hud-over-contrast.test.ts test/ui/hud-over-layers.test.ts test/ui/hud-over-room.test.ts test/ui/hud-over-walking.test.ts test/ui/hud-pointer.test.ts test/ui/hud-split-a11y.test.ts test/ui/hud-split-contrast.test.ts test/ui/hud-split-dog.test.ts test/ui/hud-split-list.test.ts test/ui/hud-split-model.test.ts test/ui/hud-split-rest-row.test.ts test/ui/hud-split.test.ts test/ui/hud-wall-dom.test.ts test/ui/hud.test.ts test/ui/loading-a11y.test.ts test/ui/loading-notes.test.ts test/ui/loading-page.test.ts test/ui/loading-style.test.ts test/ui/pick.test.ts test/ui/talk-answer-shows.test.ts test/ui/talk-turns.test.ts test/ui/text-copy.test.ts
```

On the fix commit `1b3ed2bc` (the test file before the line-break commit), started in the background with a 90-minute limit and read after its own completion notice:

```
$ npx --no-install vitest run <the 44 files> --maxWorkers=4 --reporter=verbose
exit 0
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-16/pulse-029a/apps/web
...
 ↓ test/room/legacy-stages.test.ts > the frozen stages of e324771e (spec 005, T004) > give exactly the shipped module's stages while it holds the base's formulas
...
 Test Files  44 passed (44)
      Tests  709 passed | 1 skipped (710)
   Start at  17:18:12
   Duration  461.65s (tests 65%, import 34%)
```

No failures, so there are no failure lines to paste. The one skip is the existing `it.runIf("ROOM_CSS" in shipped)` at `test/room/legacy-stages.test.ts:40`, not something this change caused. The new section's 15 cases are among the 709 passes, each `✓` (for example, `✓ … keeps the status's words at AA at 390 × 844 in 3d, walking 42ms`).

### make lint

The first run, on `35a3d05b`, failed on prettier in the new section:

```
make lint exit 2
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
[warn] apps/web/test/ui/hud-over-layers.test.ts
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
make: *** [Makefile:231: lint] Error 1
```

I didn't let prettier or `make fmt` write the file (Q40). I printed prettier's output as a diff against the file and applied its four line breaks with the Edit tool (`945b2ff4`). Then:

```
make lint exit 0
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
894 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
```

The line breaks change no behaviour. After them, `hud-over-layers.test.ts` ran 24/24 (above). The other 43 files don't depend on that file, so they weren't rerun.

### Not run

- The whole `apps/web` suite: merge-029-3's.
- The full `make check`: int-029's, the stack's one run (rule 4).
- The image stage: it fails in the workers' containers (Q46, Q48) and is left to the Author's gate.
- `make test` and `make evals` on their own: the brief limits this task to the files above and `make lint`.
- `twin-2d.test.ts`: not in the list.

## Commits

| SHA | What |
|---|---|
| `7b9f46a5` | wip: reading |
| `baeafb26` | wip: the red case |
| `8637bdbe` | test: the pulse section in `hud-over-layers.test.ts`, red (8 failed, 16 passed) |
| `bb9827ca` | wip: the fix, plan, tasks |
| `1b3ed2bc` | fix: `room.css`'s rule; `plan.md` §R-A3 and §R-A4; `tasks.md` T-A07 |
| `35a3d05b` | wip: the covering runs and `make lint` |
| `945b2ff4` | style: prettier's line breaks in the test, by Edit |
| `2283941a` | wip: this note |
| this note's commit | `pulse-a.md` |

To overturn Q59, revert `1b3ed2bc` alone. The test section will then turn red again, which is the evidence for L-1.

## Refusals and questions

No hook, bash-gate, or permission-layer refusal this task. No question went to the page: Q59's answer covers the change.

## Seen, not changed

- **rv-line-029's N-1 to N-4** stay for the item's note and backlog, as the brief says. The new section doesn't judge an answer line or a failure message over A's layers (N-1). Only the status is judged.
- **The dock puts the status over the room at rest, not only while walking.** 390 × 844 at rest, 3D and 2D, failed red at 2.79:1. L-1 named "the column layout … and the dock layout over the room"; this note makes the at-rest case explicit.
- **The split panel's opening fade.** `split.css`'s `split-fade` on `.talk[data-panel="open"]` is a one-shot 160 ms fade from opacity 0 when the panel opens, under `no-preference` motion, and it applies over the room too. The test treats it as transient (finite, no forwards fill, so the panel rests at opacity 1) and doesn't judge its first frames. It isn't a sustained state like the pulse. Left as is; it's for the item's backlog if the reviewer reads it otherwise.
- **The model's limits.** `hover` and `@supports` count as "can't tell". The guard fails the case if such a rule ever animates the status or an ancestor, or sets a layer property on them. The opacity's low point ignores timing functions that overshoot; the sheets use `ease-in-out` and `ease-out`, which don't.
