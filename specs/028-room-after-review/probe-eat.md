# Probe: does the dinosaur's eating work with its stand-in? (spec 028, group B)

**Task**: probe-eat-028 (implementer, night of 2026-11-15) · **Branch**: `night/probe-eat-028/probe-eat-028`, off `main` at a36f98ec · **Code changed**: none.

## His words

From his review of 2026-11-15, item 2, word for word:

> 2) The dinosaur doesn't load the model, or do any of the eating of assets.

The supervisor's item, word for word:

> item 2's eating: spec 024 eats by walking up to a piece in the walking view and pressing "Eat". Spec 028 finds out whether that works with the stand-in, and why not if it doesn't.

The model is his intake (human patch 021). This probe explains only the eating.

## Answer

**No.** On `main`, a visitor who chose the dinosaur, with no model under `assets/visitors/dinosaur/`, can't eat. The walking view never offers "Eat", key B does nothing, and nothing is eaten.

This isn't a bug in the eating. Spec 024 turns the eating off without the model on purpose, and his answer to page Q247 pinned that down. The code does what the spec says, and the tests that say so pass (below). The one cause is that the bundle carries no dinosaur model, at `apps/web/src/room/scene.ts:472`. A second gate, `apps/web/src/room/eat/available.ts:33`, would also stop it.

The sources, word for word:

- Spec 024, FR-001: "The eating MUST be offered only in the 3D walking view, only while the visitor's figure is the dinosaur and shows its model, …"
- Spec 024, US3 AS2: "**Given** the dinosaur has no model (spec 021's file absent or failed, so the flat fallback shows), **When** the figure walks, **Then** the eating is off: no tile, and B does nothing."
- Spec 024, Summary: "Every degraded path (2D room, reduced motion, a failed or missing model, a dinosaur still without its model) removes the eating and nothing else."
- His answer to page Q247 (2026-11-13, as `docs/merge-requests/2026-11-14-night-stack.md:4380` records it): "Yes, one condition for all three: a dinosaur visit reserves the Eat box, and the compositor checks and reports it, only when the bundle carries the dinosaur's model (the tile can't show without it, FR-001). …"
- Spec 025 uses the same condition for the twin and the dog running (its Q1, option A taken; option B, "the dinosaur's flat cut-out counts too, so the run works before the model arrives", was not), and its US1: "**Given** the dinosaur shows its flat cut-out (no model, or a failed one), **When** the visitor walks, **Then** nothing runs".

*My reading, beside those words:* what he saw ("or do any of the eating") is the behaviour spec 024 specified and he confirmed for a dinosaur with no model. The eating and the model are one item on screen: until his intake of the model lands, the eating can't show. Nothing on screen tells him that, and spec 028's group A is deleting the one note that hinted at it (below, "What a visitor is told").

## The path on `main`, step by step

All paths are under `apps/web/`. Line numbers are as of a36f98ec.

1. **The build: no dinosaur in the part.** `assets/visitors/` holds `dog/`, `man/`, and `woman/`, and no `dinosaur/`. `build/room/emit.ts:1548` `avatarsPart` writes an avatar only where `bundledFiles` gives a model (`emit.ts:1552–1553`, `if (!model) continue;`). `build/room/avatars.ts:471–474` `bundledFiles` returns `[]` without a bundled model. So the 3D part's `avatars` has no `dinosaur` key.
2. **The choice and the room.** `src/room/app.ts:1102–1122`: for `choice.avatar === "dinosaur"`, the room passes the `eating` option (`state`, `available`, `said`) to `createScene`. This holds with or without the model.
3. **The stage decides there is no eating.** `src/room/scene.ts:304`: `bundled(id)` is `Object.hasOwn(part.avatars, id)`. Then `scene.ts:472`:
   ```ts
   const eats = options.avatar === EATER && bundled(EATER) && part.placements.some((p) => p.edible !== null);
   ```
   `bundled("dinosaur")` is false, so `eats` is false. The other two terms hold: the avatar is the dinosaur (`EATER`, `eat/available.ts:27`), and `room/scene.yaml:45, 85, 91, 102` give `edible` to `work-desk` (6), `laptop` (4), `busy-sign` (4), and `chalkboard` (4).
4. **Nothing of the eating is built.** With `eats` false:
   - `scene.ts:473`: `edible` is `[]`.
   - `scene.ts:485–499`: no `meal`, no `eat3d`.
   - `scene.ts:513`: `eatReached` returns null.
   - `scene.ts:578`: the walking view gets no `eat` callback.
   - `scene.ts:861`: the protector is `{ eat: false }`, so there is no Eat box.
   - `scene.ts:699–702`: no stacked Eat reserve.
   - `scene.ts:913`: the stage has no `eat` (`Stage3D.eat` is undefined).
5. **What shows.** The flat cut-out, at the walking view. The walking view works as for any visitor. The "Eat" tile is never shown: `scene.ts:531–532` `eatFrame` returns at once (`if (!meal || !eat3d) return;`), so `eating.available` (`app.ts:1109–1112`) is never called. `app.ts:427` `eatOffered` stays false, and `app.ts:428–429` `offerEat` keeps `setEatOffered(false)` (`src/room/layout.ts:364`). The HUD gets no Eat box either (`app.ts:255`, `protect?.eat` false).
6. **Walking up to a piece offers nothing.** Reach for the eating (`eat/press.ts:24–30`, over `edibleTargets`, `press.ts:14–21`) is never asked, since `eatReached` is null without `eats` (step 4).
7. **Pressing "Eat" (key B) eats nothing.**
   - `src/room/walk/input.ts:102–104` sets the `eat` intent on B.
   - `src/room/scene/walking.ts:169` and `:263` call `options.eat?.(pose)`, which is undefined here (step 4), so nothing runs.
   - The tile is hidden. Even a click on it would go through `app.ts:895–897` `(stage as Stage3D).eat?.press()`, which is undefined, so nothing runs.
8. **The second gate.** If step 3 let it through, `eat/available.ts:33` (`s.figureModel &&`) would still refuse every bite and every offer. `scene.ts:506` sets `figureModel: figures?.shows("visitor") ?? false`, which is false while the visitor's figure shows its cut-out fallback.
9. **The compositor, to match.** `build/room/checks/rg.ts:767–768` `dinosaurVisit` and `build/room/report.ts:239` read `carriesModel` (`build/room/avatars.ts:478–481`). They judge and report a dinosaur visit's Eat box only with the model, which is page Q247's "one condition for all three".

What isn't in the way:

- **The mouth.** `src/room/eat/mouth.ts:27–35` `mouthWorldPoint` falls back to an estimate when no `Jaw` bone exists: 0.8 of the height up and 0.3 of it ahead of the figure's root. `scene.ts:490` gives it `room.visitor` as the root, which is there with the cut-out too.
- **The pieces' models.** `assets/room/` holds `work-desk.glb`, `laptop.glb`, `busy-sign.glb`, and `chalkboard.glb`, so `reached.model` (`press.ts:43`) holds wherever those models load.
- **The eating itself.** It runs with a model: `eat-model.test.ts`'s "reserves the Eat box and gives the eating with the model", and `eat-scene.test.ts`'s bites over the fixture dinosaur (`helpers/room-dinosaur.ts`) and the real busy sign.

## Checked by running

The worktree had no `node_modules`. The first command's `npx` downloaded an unpinned `vitest@5.1.0` from the registry and failed to load the config. I then installed the lockfile's packages the way `make setup` does (its first line, without the git hooks) and ran the pinned `vitest` 5.0.3. `maxWorkers` is 4: `/sys/fs/cgroup/cpu.max` reads `400000 100000`.

```
$ cat /sys/fs/cgroup/cpu.max
400000 100000

$ cd apps/web && npx vitest run --maxWorkers=4 test/room/eat-*.test.ts test/ui/eat-*.test.ts test/room/input.test.ts test/room/walking.test.ts test/ui/walking.test.ts test/ui/notes-causes.test.ts
npm warn exec The following package was not found and will be installed: vitest@5.1.0
vitest.config.ts (5:29) [UNRESOLVED_IMPORT] Could not resolve 'vitest/config' in vitest.config.ts
failed to load config from /home/h4reet/h4reet-ai/night/2026-11-15/probe-eat-028/apps/web/vitest.config.ts
⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest' imported from …/apps/web/vitest.config.ts.timestamp-….mjs

$ npm ci --ignore-scripts
… (ends with npm audit's advice; exit 0)

$ cd apps/web && npx vitest --version
vitest/5.0.3 linux-x64 node-v24.21.0

$ npx vitest run --maxWorkers=4 test/room/eat-*.test.ts test/ui/eat-*.test.ts test/room/input.test.ts test/room/walking.test.ts test/ui/walking.test.ts test/ui/notes-causes.test.ts
 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-15/probe-eat-028/apps/web

 Test Files  23 passed (23)
      Tests  238 passed (238)
   Start at  07:50:37
   Duration  145.82s (import 54%, tests 45%, transform 1%)
```

The 23 files are the 11 eat tests under `test/room/` and the 8 under `test/ui/`, plus four that cover the path's other files: `test/room/input.test.ts` imports `walk/input.ts`; `test/room/walking.test.ts` imports `scene/walking.ts`; `test/ui/walking.test.ts` drives the walking view through the room; and `test/ui/notes-causes.test.ts` covers the stand-in's figure cause in `app.ts`.

The cases that decide the answer, run alone with verbose output (timings cut):

```
$ npx vitest run --maxWorkers=4 --reporter=verbose test/room/eat-model.test.ts test/room/eat-available.test.ts
 ✓ test/room/eat-available.test.ts > eatingAvailable (FR-001) > is true with all clear
 ✓ … > is false for the 2D room (US3 AS1)
 ✓ … > is false for the woman
 ✓ … > is false for the man
 ✓ … > is false for the dog
 ✓ … > is false for no avatar
 ✓ test/room/eat-available.test.ts > eatingAvailable (FR-001) > is false for the dinosaur without its model, on its flat fallback (US3 AS2)
 ✓ … > is false for nothing reached
 ✓ … > is false for a piece that isn't edible (US1 AS3)
 ✓ … > is false for a piece on its stand-in (US3 AS3)
 ✓ … > is false for no chunk the meal lets it eat (US1 AS4)
 ✓ … > is false for paused (US3 AS5)
 ✓ … > is false for the loader showing (FR-009)
 ✓ … > is false for the eating failed (Degraded Mode)
 ✓ test/room/eat-model.test.ts > whether the bundle carries the dinosaur's model > is the 3D part's avatars.dinosaur: not without the folder, and with it
 ✓ … > is what the compositor's checks read for a compose (rg.ts's dinosaurVisit)
 ✓ test/room/eat-model.test.ts > the report's dinosaur visit lines (report.ts) > prints none without the model: the report names no dinosaur
 ✓ … > prints them with the model, after the frame lines
 ✓ test/room/eat-model.test.ts > RG6's refusals found in the variant sweep alone (rg.ts's spacingReasons) > names the dinosaur visit's refusal with the model, and leaves only the plain visit's without it
 ✓ test/room/eat-model.test.ts > the 3D stage (scene.ts's eats) > reserves no Eat box and gives no eating to a dinosaur visit whose bundle has no dinosaur's model
 ✓ test/room/eat-model.test.ts > the 3D stage (scene.ts's eats) > reserves the Eat box and gives the eating with the model
 Test Files  2 passed (2)
      Tests  21 passed (21)
```

`eat-model.test.ts:213–225` is main's case exactly. It builds the real `createScene` over the repository's own bundle (`repositoryBundle()`), asserts `Object.hasOwn(part.avatars, "dinosaur")` is false and that an edible placement exists, and reads `stage.protect?.eat` not true and `stage.eat` undefined. So the stage gives neither key B nor the tile anything to press.

**No headless run.** The tests already show the answer on the real stage over the real bundle. A browser run on `ENV=dev-cpu` would show the same cut-out and no tile, and would add only a screenshot of an absence. He already has that screenshot.

## Finding for spec 028's group B

**B-eat: the eating is off with the stand-in, by spec 024's FR-001 and page Q247, not by a defect.**

- **Where**: `apps/web/src/room/scene.ts:472` (`bundled(EATER)` in `eats`), and behind it `apps/web/src/room/eat/available.ts:33` (`s.figureModel`, set at `scene.ts:506`).
- **What fixes his item 2's eating with no code change**: his intake of the dinosaur's model (human patch 021). With `assets/visitors/dinosaur/dinosaur.glb` bundled, `eats` holds, the figure shows its model, and the path runs as `eat-model.test.ts:227` and `eat-scene.test.ts` exercise it. SC-007's look by hand on the dev-cpu stack is still to come.
- **If he wants the stand-in to eat** (page question below, not recommended), a spec 028 task would change:
  1. `scene.ts:472`: drop `bundled(EATER)`. This also turns on, for every 3D dinosaur visit, the Eat box in the protector (`:861`), the stacked reserve (`:701`), the walking view's `eat` (`:578`), and `Stage3D.eat` (`:913`).
  2. `eat/available.ts:33` or `scene.ts:506`: accept the 3D cut-out as the figure. `figureModel` would become "the figure shows in 3D", model or cut-out. The 2D room stays off through `view`.
  3. `build/room/checks/rg.ts:767–768` and `build/room/report.ts:239`: judge and report the variant for every dinosaur visit, not only with `carriesModel`, so the compositor judges the framing the room shows (spec 014's FR-016; spec 024's FR-012). This overturns his own answer to Q247.
  4. Apply `docs/merge-requests/proposed/024-data-only-eat-box.patch` (it is a test file, a patch for the Author). As Q247's answer says, it "stays for the day the folder lands", and the variant would then judge the repository's room.
  5. The tests that pin the off state change by their own subject, in that spec 028 task, not in a fix task: `eat-available.test.ts:31`, `eat-model.test.ts:107` and `:213` (and `:100`, `:179` with the compositor), and `dinosaur-compose.test.ts:323`'s dinosaur-free report (`not.toMatch(/dinosaur|extent/)`).
  6. Spec 024's FR-001, US3 AS2, and Summary are amended, and so is spec 025's shared condition (its Q1), or the eating and the run no longer start from one condition. `mouth.ts` needs no change: its estimate serves a figure with no `Jaw`.
- **Interplay with his new item 4**: "if someone selects the dinosaur, then the twin should wave, scream that there is a dinosaur in the room, then the dog enters the room and the twin adn the dog grab the bicycle and leave, and the dinosaur can then eat the assets." *My reading:* the eating then follows that sequence. On `main`, the eating starts as soon as the walking view reaches a piece, and spec 025's run is gated on the model too. Whether eating waits for the sequence's end is spec 028's to specify. It doesn't change this finding.
- **What a visitor is told**: nothing on screen says why the dinosaur can't eat. The only hint today is the placeholder note `standin.avatar` ("Your figure is a flat placeholder until its model arrives.", spec 014's FR-054). His answer to the top-left labels deletes it ("delete the three top-left labels (the twin's likeness line, the dog's line, the placeholder note)"). *My reading:* after spec 028, a dinosaur visit without the model shows a flat cut-out that can't eat, with no line explaining it. Spec 028 may want that line somewhere he hasn't deleted (the Credits page, beside the likeness lines, is one place). That's for spec 028 to decide, not this probe.

## Question for the Author

On `/night/io/out/questions.md`:

```
### Q: The dinosaur's eating is off while it shows its flat stand-in, by spec 024's FR-001 and your Q247 answer ("only when the bundle carries the dinosaur's model"); should spec 028 keep that, so the eating arrives with your intake of the model (human patch 021)?
Blocks: probe-eat-028 (spec 028 group B, B-eat) · Recommended: Keep it: the eating arrives with the model; spec 028 changes no eating code, and the stand-in shows no Eat tile · Others: Let the stand-in eat (scene.ts:472, available.ts:33, rg.ts:767, report.ts:239, the data-only patch, and spec 025's shared condition change; overturns Q247); Let the stand-in eat in the room only, the compositor still judging with the model only (the room would reserve an Eat box the checks never judged, against spec 014's FR-016)
```

## Lint and refusals

`make lint`, run on this branch with this file written (output below, as run):

LINT_OUTPUT_PLACEHOLDER

**Refusals**: none. No hook or bash-gate refusal happened in this session. Two things to note that weren't refusals:

- The first save point's `git commit` returned exit code 1 after the gitleaks and arrival-check hooks printed "no leaks found" and "0 findings". The commit landed (257115fb). I didn't retry it.
- The first test command's `npx` fetched an unpinned `vitest@5.1.0` from the registry before `npm ci` had run. Its run failed to load the config and ran nothing. Every test result above is from the lockfile's `vitest` 5.0.3.
