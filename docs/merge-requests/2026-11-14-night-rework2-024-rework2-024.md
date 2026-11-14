# night/rework2-024/rework2-024
Spec: specs/024-dino-eats-room-assets/ · Intent: intent/024-dino-eats-room-assets.md · Written by: implementer (night shift), rework2-024 on Opus 5.5 · Date: 2026-11-14
Session: /home/h4reet/h4reet-ai/night/2026-11-13/rework2-024 · Repo hooks active: yes, the commit hooks (gitleaks, arrival check) ran on every commit
Authorized by: the Author's order of 2026-11-13 (rules 1, 2, 4, 5), the supervisor's brief for rework2-024, spec 024's plan as approved provisionally, and page Q232 (answered recommended). Base: `night/rework-024/rework-024` at b472e391.

This branch closes rv-rework-024's important finding I-A and its four nits on item 7 (spec 024). Its full record is item 7's "Rule 6's second rework" section of [2026-11-14-night-stack.md](2026-11-14-night-stack.md), which carries the same runs. This note is the branch's own, as the brief asks.

## What changed and why

rv-rework-024 (Opus) found rework-024's B-1, B-2, I-1, and rv-impl-024's nits closed, not blocking, and raised one important finding, I-A, and four nits. This branch closes them from rework-024's tip (b472e391). Page Q232 (I-A) is answered recommended. Each code fix's test was RED before its GREEN, one commit per fix, with plan.md in the same commit. rv-rework2-024 reviews it. The review file (`/home/h4reet/h4reet-ai/night/.io/rv-rework-024/out/review.md`) isn't in this container, so the fixes follow the brief's account of each finding.

| Finding | RED | GREEN | What changed (plan.md) |
|---|---|---|---|
| I-A (FR-009, Q232) | d2a98fa9 | ee366364 | §5.4: the meal pauses and resumes when the room's held state changes, not at the next frame. `Stage3D.eat.sync()`; `app.ts`'s `eatHeld()` calls it from the motion listener (the toggle; the page hidden and shown) and at the loader's `on` and `leaving`; `eatFrame`'s read stays as a backstop |
| N-1 | n/a | 4fd45406 | §5.5's B-2 departure names 2c87c414's edit of `eat-place.test.ts` (a `let` made a `const` for `no-useless-assignment`; the RED file fails `eslint` at 53:9) |
| N-2 | n/a | this note | item 7's recorded figures are marked "recorded, not pasted", and its two elided lint pastes are marked; the whole lint run is below |
| N-3 | 3bd6613b | 18252336 | §5.5: the stacked Eat box's reserve reads the layout (the room gives no frame and no clear area), not a frame that doesn't fit; a HUD layout mid-resize reserves as a plain visit's |
| N-4 | n/a | 9d3f0a85 | `free()`'s comment, and §5.4's nit 3 line: the attributes' arrays are the source's; their GPU buffers go with a split's dispose (three.js's `WebGLGeometries` removes every attribute of a disposed geometry) and are uploaded again at the source's next draw |

**I-A's RED** (d2a98fa9), pasted:

```
npx vitest run test/room/eat-scene.test.ts test/ui/eat-hidden.test.ts
 FAIL  test/room/eat-scene.test.ts > … > doesn't count a hidden page's time: no landing and no regrowth at the first frame back (I-A, page Q232)
TypeError: s.stage.eat?.sync is not a function
 FAIL  test/room/eat-scene.test.ts > … > holds the meal at once for every state the room counts, with frames stopped: the toggle, hidden, the loader
TypeError: s.stage.eat?.sync is not a function
 FAIL  test/ui/eat-hidden.test.ts > the room tells the eating of a held state at once (FR-009; I-A) > calls the stage's eat.sync on the loader's end, the toggle, and the page hidden and shown, reading each in state()
AssertionError: the loader's end, told: expected undefined to deeply equal { paused: false, loading: false }
 Test Files  2 failed (2)
      Tests  3 failed | 7 passed (10)
```

That RED fails on the missing method. To show the bug itself, the GREEN code was run once with `sync` stubbed to a no-op (`sync: () => undefined`, then restored, not committed). The scene's two new cases then fail on the landing:

```
npx vitest run test/room/eat-scene.test.ts -t "hidden|every state"
AssertionError: the flight hasn't landed at the first frame back: expected 3 to be 4 // Object.is equality
AssertionError: paused: no landing at the first frame back: expected 3 to be 4 // Object.is equality
      Tests  2 failed | 7 skipped (9)
```

GREEN (ee366364): `npx vitest run test/room/eat-scene.test.ts test/ui/eat-hidden.test.ts`, 2 files, 10 passed.

**N-3's RED** (3bd6613b), pasted:

```
npx vitest run test/room/eat-scene.test.ts -t "N-3|I-1"
     × reserves no stacked Eat box in a HUD layout mid-resize, whose frame was given for another window (N-3) 21ms
AssertionError: the picker's fallback, as a plain visit's: expected [ [ 824, 548, 128, 44 ], …(1) ] to be undefined
      Tests  1 failed | 1 passed | 8 skipped (10)
```

GREEN (18252336): `eat-scene.test.ts`, 10 passed.

What the I-A tests reach:
- `eat-scene.test.ts` runs at `createScene`'s level with frames stopped (`clock.advance(ms, ms + 1)`, so the clock moves and no frame is drawn). Hidden through a flight, then shown, then one frame: the flight hasn't landed, and it lands after the rest of its flight. Hidden past `regrow_s` after a landing: no regrowth is due at the first frame back. The toggle and the loader each pass the same check.
- `eat-hidden.test.ts` (new) runs at the room's level, through the stand-in stage: the room calls `eat.sync()` at the loader's end, at each toggle, and when the page is hidden and shown, at once, and `state()` reads each change then.
- The class: the toggle and the loader drew frames, so B-1's poll already caught them, and the call now makes them exact. Hidden was the bug. The fall to 2D disposes the stage and its loop, so no meal is left to hold, and `eat-fall.test.ts` pins the tile's side of it.

**Runs (the order's rule 4)**, from `apps/web`, at 18252336 (code unchanged since). First, every `eat-*` file:

```
npx vitest run test/room/eat-*.test.ts test/ui/eat-*.test.ts
 Test Files  18 passed (18)
      Tests  194 passed (194)
   Duration  122.63s (tests 66%, import 33%, transform 1%)
```

Then the tests covering the files this branch changes, 132 files. `app.ts` is imported by `test/helpers/room.ts`, so every file importing that helper counts. `scene.ts` and `stage.ts` add the files importing them, plus every `eat-*` file. `twin-2d` is left out, as the order allows:

```
npx vitest run \
  test/asset-events.test.ts test/lookdev/builds.test.ts test/lookdev/metrics.test.ts test/lookdev/page.test.ts
  test/lookdev/results.test.ts test/lookdev/start.test.ts test/manifest.test.ts test/room/avatar-driver.test.ts
  test/room/avatar-gait.test.ts test/room/avatar-hands.test.ts test/room/avatar-loader.test.ts
  test/room/avatar-scene.test.ts test/room/avatars-compose.test.ts test/room/avatars.test.ts test/room/bundle.test.ts
  test/room/camera.test.ts test/room/chunk.test.ts test/room/data-only.test.ts test/room/dinosaur-compose.test.ts
  test/room/dist.test.ts test/room/dog-avatar.test.ts test/room/dog-line.test.ts test/room/eat-3d.test.ts
  test/room/eat-available.test.ts test/room/eat-box.test.ts test/room/eat-checks.test.ts
  test/room/eat-chunker.test.ts test/room/eat-data.test.ts test/room/eat-meal.test.ts test/room/eat-mouth.test.ts
  test/room/eat-pause.test.ts test/room/eat-scene.test.ts test/room/emblem-data.test.ts test/room/events.test.ts
  test/room/faces.test.ts test/room/fit.test.ts test/room/flat-frame.test.ts test/room/flat.test.ts
  test/room/floor.test.ts test/room/gait-rig.test.ts test/room/generated.test.ts test/room/geometry.test.ts
  test/room/gltf-images.test.ts test/room/highlight.test.ts test/room/hints.test.ts test/room/hud-contrast.test.ts
  test/room/hud-stats.test.ts test/room/lettering.test.ts test/room/likeness-line-anywhere.test.ts
  test/room/live.test.ts test/room/loader.test.ts test/room/loading-contrast.test.ts test/room/loading-hints.test.ts
  test/room/loading-progress.test.ts test/room/motion.test.ts test/room/movement.test.ts test/room/objects.test.ts
  test/room/protect.test.ts test/room/quality.test.ts test/room/ray.test.ts test/room/reach.test.ts
  test/room/scene-fit.test.ts test/room/scene.test.ts test/room/stage-walk.test.ts test/room/stages-checks.test.ts
  test/room/stages-floor.test.ts test/room/stages.test.ts test/room/status-poller.test.ts test/room/text.test.ts
  test/room/turn-cost.test.ts test/room/twin-compose.test.ts test/room/twin-faults.test.ts
  test/room/twin-figure.test.ts test/room/twin-handoff.test.ts test/room/twin-network.test.ts
  test/room/twin-reach.test.ts test/room/twin-shirt.test.ts test/room/vocabulary.test.ts test/room/walk-hold.test.ts
  test/room/walking.test.ts test/smoke.test.ts test/talk/turn-client.test.ts test/ui/a11y.test.ts
  test/ui/around.test.ts test/ui/avatars.test.ts test/ui/choice.test.ts test/ui/credits.test.ts
  test/ui/degraded.test.ts test/ui/eat-button.test.ts test/ui/eat-degraded.test.ts test/ui/eat-fall.test.ts
  test/ui/eat-hidden.test.ts test/ui/eat-input.test.ts test/ui/eat-key-repeat.test.ts test/ui/eat-place.test.ts
  test/ui/eat-reduced.test.ts test/ui/flat-frame.test.ts test/ui/fullscreen.test.ts test/ui/handoff-wait.test.ts
  test/ui/handoff.test.ts test/ui/highlight.test.ts test/ui/hud-a11y.test.ts test/ui/hud-faults.test.ts
  test/ui/hud-look.test.ts test/ui/hud-model.test.ts test/ui/hud-notes.test.ts test/ui/hud-pointer.test.ts
  test/ui/hud-split-a11y.test.ts test/ui/hud-split-contrast.test.ts test/ui/hud-split-model.test.ts
  test/ui/hud-split-rest-row.test.ts test/ui/hud-split.test.ts test/ui/hud.test.ts test/ui/loading-a11y.test.ts
  test/ui/loading-degraded.test.ts test/ui/loading-faults.test.ts test/ui/loading-notes.test.ts
  test/ui/loading-page.test.ts test/ui/loading-style.test.ts test/ui/loading.test.ts test/ui/narration-room.test.ts
  test/ui/notes-causes.test.ts test/ui/pause.test.ts test/ui/pdf-download.test.ts test/ui/pick.test.ts
  test/ui/resize.test.ts test/ui/resume-room.test.ts test/ui/talk-activity.test.ts test/ui/talk-turns.test.ts
  test/ui/talk.test.ts test/ui/text-copy.test.ts test/ui/walking.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/room/data-only.test.ts > the proof set, each change a data edit (FR-006, SC-001) > an addition: a catalog entry, a placement, a selectable, and a topic become a labelled, selectable stand-in
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "RG6 apps/web/room/scene.yaml:selectables[4]: its exclusive core lies under a panel's box, the walking control's box, or the \"Eat\" tile's box in 3D at 320 × 250 and 334 others for a 3D dinosaur visit",
+ ]

 ❯ expectDataOnly test/room/data-only.test.ts:149:58
    147| /** A data edit: no finding, only data changed, and only §1's paths re…
    148| function expectDataOnly(c: Change): void {
    149|   expect(c.result.findings.map((f) => formatFinding(f))).toEqual([]);
       |                                                          ^
    150|   expect(c.changed.length).toBeGreaterThan(0);
    151|   expect(c.changed.filter((path) => !DATA.test(path))).toEqual([]);
 ❯ test/room/data-only.test.ts:548:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  test/room/dinosaur-compose.test.ts > the dinosaur's folder in the bundle and the report (FR-001, FR-012, SC-001) > without the folder, names no dinosaur and carries no new measure in the 3D part, dist/a/, or the report
AssertionError: expected '## Room report\n\nBundle 33f4a8729152…' not to match /dinosaur|extent/

- Expected:
/dinosaur|extent/

+ Received:
… (89 lines of the received report elided here; the line that matches /dinosaur/ is:)
A 3D dinosaur visit (spec 024, Q150): the \"Eat\" tile's box, 8rem × 2.75rem beside the walking control, reserved for the whole visit; 7,461 stages over the same screens, checked by RG6 and RG7 and not emitted; 9,230 screens and states, 4,122 at ease 0, 3,033 between, 2,075 at ease 1.
…

 ❯ test/room/dinosaur-compose.test.ts:323:40
    321|     expect(result.scene.avatars.dinosaur).toBeUndefined();
    322|     expect(result.avatars.some((a) => a.url.includes("dinosaur"))).toB…
    323|     expect(result.report.markdown).not.toMatch(/dinosaur|extent/);
       |                                        ^
    324|     expect(JSON.stringify(result.scene)).not.toMatch(/extent_[xz]/);
    325|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  2 failed | 130 passed (132)
      Tests  2 failed | 2107 passed (2109)
   Duration  902.28s (tests 70%, import 30%)
```

The two failures are in files this branch doesn't touch, and neither is chased (the order's rule 4). The same two fail with this branch's `src` set back to b472e391's (`git checkout b472e391 -- apps/web/src`, the two files run, `git checkout HEAD -- apps/web/src`), with the same messages:

```
npx vitest run test/room/data-only.test.ts test/room/dinosaur-compose.test.ts
     × without the folder, names no dinosaur and carries no new measure in the 3D part, dist/a/, or the report 311ms
     × an addition: a catalog entry, a placement, a selectable, and a topic become a labelled, selectable stand-in 11014ms
AssertionError: expected [ Array(1) ] to deeply equal []
+   "RG6 apps/web/room/scene.yaml:selectables[4]: its exclusive core lies under a panel's box, the walking control's box, or the \"Eat\" tile's box in 3D at 320 × 250 and 334 others for a 3D dinosaur visit",
AssertionError: expected '## Room report\n\nBundle 33f4a8729152…' not to match /dinosaur|extent/
 Test Files  2 failed (2)
      Tests  2 failed | 53 passed (55)
```

- `data-only.test.ts` is plan §5.5's met risk: the variant refuses that test's data edit, and `docs/merge-requests/proposed/024-data-only-eat-box.patch` is on the page, recommended "apply".
- `dinosaur-compose.test.ts:323` (spec 021: without the dinosaur's folder, the report names no dinosaur) fails on T011a's dinosaur-visit report lines, which print with or without the folder. It wasn't recorded before. It is on the page, recommended: the report prints those lines only with the folder bundled, a fix task on item 7 with the test left as it is.

The lint target, at this branch's tip, whole:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
786 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

SC-006: `git diff --stat b472e391 HEAD -- .claude tools/gates corpus assets CLAUDE.md REVIEW.md .specify/memory/constitution.md evals/agent-config redteam/forbidden-actions.sh` is empty. No full suite here: the stack's last task runs it once.

For the Author: two questions on the page, each with its recommended answer. One is N-3's choice (a HUD layout mid-resize reserves as a plain visit's, as built). The other is `dinosaur-compose.test.ts`'s failure (the report's dinosaur-visit lines only with the folder).

Interruptions: no hook or bash-gate refusal. One harness block, not a hook: a Monitor watch needed an approval it didn't have, so I waited with a background shell loop instead. The setup target ran first (no `node_modules` in the worktree); its one notice was that the git hooks' folder isn't writable in the sandbox, which is the Author's step. A `git archive` copy of b472e391 with `node_modules` symlinked couldn't load vite's config (pako's named export), so the base comparison used the checkout above instead.

## Constitution check

No change to a human-only path, the gateway, routing, telemetry, or the data flow. `git diff --stat b472e391 HEAD -- .claude tools/gates corpus assets CLAUDE.md REVIEW.md .specify/memory/constitution.md evals/agent-config redteam/forbidden-actions.sh` is empty.

## Review

rv-rework2-024, a worker that wrote none of this, reviews it.

## Cost and data-flow impact

$0, no model call, no byte leaves the visitor's device.
