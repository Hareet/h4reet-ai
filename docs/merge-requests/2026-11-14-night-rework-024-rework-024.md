# night/rework-024/rework-024
Spec: specs/024-dino-eats-room-assets/ · Intent: intent/024-dino-eats-room-assets.md · Written by: implementer (night shift), rework-024 on Opus 5.5, over two sessions (the second resumed at B-2's GREEN from the branch's working tree) · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/rework-024 · Repo hooks active: yes, the commit hooks (gitleaks, arrival check) ran on every commit
Authorized by: the Author's order of 2026-11-13 (rules 1, 2, 4, 5), the supervisor's brief for rework-024, spec 024's plan as approved provisionally, and page Q215 (answered recommended). Base: `night/impl-024/impl-024` at bbe55c0d.

This branch reworks item 7 (spec 024) after rv-impl-024's Opus review. Its full record is item 7's "Rule 6's rework" section of [2026-11-14-night-stack.md](2026-11-14-night-stack.md), which carries the same runs; this note is the branch's own, as the brief asks.

## What changed and why

rv-impl-024's two blocking findings, its important finding I-1, and its four nits, each test first (RED committed, then GREEN), one commit per fix, plan.md's departure in the GREEN commit:

- **B-1** (FR-009, US3 AS5): the eating ran on wall time while paused. Now everything of it runs on the meal's pausable clock, nothing moves, lands, grows, splits, or starts while paused, and the meal is paused while the loader shows too. Plan §5.4's departure.
- **B-2** (FR-012): `html[data-hud] .room-eat` placed the tile at unset `--eat-x/-y` in the stacked layout. The placing rule is now scoped to `column`/`dock` with `data-eat-place="on"`, and the tile is offered only where a rule places it. Plan §5.5's departure.
- **I-1** (page Q215): a dinosaur visit's stacked stage reserves the Eat box beside the walking control (`scene.ts`). Plan §5.5's T011a sentence corrected.
- **Nits**: (1) leaving walking (Escape, the walking control, a failed step) lands a flight at once, at the resume while paused; (2) a held B, or a held Enter or Space on the tile, is one press; (3) the stage's dispose frees every split's geometries and cut materials, in the scene or not, and a reloaded model's split is freed at once; (4) 59eced2c's test edit named in plan §5.5.

## Acceptance criteria

FR-009, FR-012, the spec's Escape edge case, FR-015 (no GPU leak across a visit), US3 AS5. See the stack note's table for the rest of item 7.

## Constitution check

No change to a human-only path, the gateway, routing, telemetry, or the data flow. `git diff --stat bbe55c0d HEAD -- .claude tools/gates corpus assets CLAUDE.md REVIEW.md .specify/memory/constitution.md evals/agent-config redteam/forbidden-actions.sh` is empty.

## Review

rv-rework-024, a worker that wrote none of this, reviews it.

## Verification

Small runs only (the order's rule 4); the stack's last task runs the full check once. From `apps/web`, at 76d01be0 (code unchanged since): every `eat-*` file in `test/room` and `test/ui` (the added `eat-place`, `eat-pause`, `eat-scene`, `eat-key-repeat`, `eat-fall` among them), `vocabulary`, `bundle`, and the tests covering the changed files (`layout.ts`, `room.css`, `scene.ts`, `walk/input.ts`, `eat/eat3d.ts`); the stack note's item 7 rework section lists them:

```
npx vitest run test/room/eat-*.test.ts test/ui/eat-*.test.ts test/room/vocabulary.test.ts test/room/bundle.test.ts
  test/room/events.test.ts test/room/flat.test.ts test/room/hud-contrast.test.ts test/room/loading-contrast.test.ts
  test/room/objects.test.ts test/room/stages.test.ts test/ui/a11y.test.ts test/ui/flat-frame.test.ts test/ui/hud-*.test.ts
  test/ui/loading-*.test.ts test/ui/pick.test.ts test/ui/text-copy.test.ts test/lookdev/page.test.ts
  test/room/stage-walk.test.ts test/room/highlight.test.ts test/room/avatar-scene.test.ts test/room/faces.test.ts
  test/room/quality.test.ts test/room/twin-network.test.ts test/room/scene-fit.test.ts test/room/scene.test.ts
  test/room/chunk.test.ts test/room/input.test.ts test/room/walking.test.ts test/ui/walking.test.ts test/ui/fullscreen.test.ts
 Test Files  61 passed (61)
      Tests  952 passed (952)
   Duration  444.66s (tests 61%, import 39%)
```

The lint target:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
785 files already formatted
… shellcheck …
exit 0
```

RED before GREEN for each fix: the commits and what each RED showed are in the stack note's section.

Interruptions: the brief's review path (`/home/h4reet/h4reet-ai/night/.io/rv-impl-024/out/review.md`) doesn't exist in this container; the fixes follow the brief's account of each finding. No hook or bash-gate refusal.

## Cost and data-flow impact

$0, no model call, no byte leaves the visitor's device.

## For the Author

Three questions on the page (`/night/io/out/questions.md`), each with its recommended answer, as built: the tile hidden in a HUD layout with no Eat box; the walking control's held Enter (spec 008's, left as it is); a leave while paused lands the flight at the resume.
