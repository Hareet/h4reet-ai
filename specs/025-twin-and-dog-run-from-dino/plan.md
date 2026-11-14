# Implementation Plan: The Twin and the Dog Run From the Dinosaur

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

His item, the letter and the title in his words: h) "twin and dog running from dino". (His orders file numbers it 8 and notes "Needs c, d, and e."; those are the file's, not his words.) And: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". The ten clarification answers are the recommended ones, each provisional and on the morning page (Q1, Q4, Q7, and Q8 as the page's Q110 to Q112, taken under the order's rule 1); an overturned answer is reworked before he merges.

**Branch**: `night/spec-025/spec-025`, reworked on `night/rework-spec-025/rework-spec-025` | **Date**: 2026-11-13, reworked 2026-11-14 | **Spec**: [spec.md](spec.md)

## 1. Summary

A pure "chase director" reads the visitor's figure, the dinosaur, from the walking view's pose, and gives the twin and the room's dog a pose each frame, away from it on spec 008's walkable floor. The twin's picture moves with spec 019's gait over its idle; the room's dog, a new figure this spec owns (spec 020's Q1), plays its `idle`, `walk`, and `run` by speed. Spec 016's state machine gains `fleeing`. Everything tunable is data in the scene's `figures.chase` and `figures.dog` blocks. No dependency is added, no new destination, no usage event; the room's dog's static files join the first visit, counted by RK5.

## Technical Context

**Language**: TypeScript 5 (`apps/web`); Python for the dashboard's test. **Dependencies**: three.js as pinned; none new. **Testing**: Vitest on numbers (fake floors, the room's own floor from `scene.yaml`, a scripted pose, the room's fake clock), no WebGL; the stage's fake for the dog figure. **Target**: desktop and phone with WebGL2 above ADR 0010's floor. **Performance**: FR-029, under 0.2 ms a frame, no per-frame allocation. **Constraints**: no cap change, no CSP change, no human-only path, no `assets/**`.

## Constitution Check

Same table as the spec's: passes before and after design, with one named deviation (spec Assumptions): Principle II's production telemetry and Development Workflow 7's graph, for the run alone, because an event would carry the visitor's avatar, which row V4 promises it never does (Q10). Principle I: degraded mode first (spec §Degraded-Mode, User Story 2), row V1 amended for the room's dog's files. Principle VIII: the twin's line and answers are untouched; the dog's likeness line shows wherever the room's dog shows the model.

## 2. Decisions (research)

- **R-01 Pure core, thin shell.** `scene/chase-steer.ts` (math: no three.js import, like `twin-states.ts`) and `scene/chase.ts` (the director: the visitor's pose and figure in, poses, phases, and the run's notes out). `scene/chase-figures.ts` is the shell: it places the twin's picture and the dog's group from the poses and drives their legs and clips. Rationale: rule 4 of the Author's order, small tests that run on numbers.
- **R-02 Steering.** For a figure at p, the dinosaur at d, within `flee_m`: for each of `headings` unit directions u, the step q = slide(p, u · v · dt) on the chase floor; its score is |q − d′| where d′ = d moved toward q by `walking.speed_mps · lookahead_s`, less a wall penalty (k / clearance(q), `compose/floor.ts`'s `clearance`) below 2 × `safe_m` of clearance; the best scoring heading wins, ties to the lowest index; a dead band (0.05 m/s) stops jitter. Chosen over a potential field (the first version's flee + pull): sampled headings with a lookahead don't drive a figure into a corner, which the property test (SC-001) on the room's own floor checks, and they stay cheap (16 headings × 2 figures × one slide). The chase floor is `floorOfPart`'s floor with the twin's obstacle filtered from `obstacles` by its ID (`part.figures.twin`); `compose/floor.ts` doesn't change.
- **R-03 Speed rule.** Base speed per figure from data; the schema refuses a run speed not above `walking.speed_mps + speed_margin_mps` (FR-005). No catch-up rule is needed beyond it: the pursuer's speed is bounded by spec 008's movement.
- **R-04 State.** `twin-states.ts` gains `fleeing` first in `TWIN_STATES`, `TWIN_CLIPS_DEFAULT.fleeing = "idle"`, and `TwinActivity` `{ kind: "flee"; on: boolean }`; `fleeing` is set through `signal`, not by the machine reading the director, so the machine stays pure. Its timers keep running, so a leftover `answering` plays after the run (User Story 4, scenario 2). `TWIN_CLIP_ROLES` doesn't change (Q7): the twin's legs are spec 019's gait over `idle`. The schema's `figures.twin.clips` keeps its keys and refuses `fleeing`.
- **R-05 The twin's legs.** `scene/avatars.ts`'s gait, now the visitor's alone (its `gait` object, `resetGait`, `figures.visitor.legs`), becomes per figure: the twin's figure gets its `legs` from `findLegRig` on its shown instance, as the visitor's does, and its own gait state, written in place (spec 019's FR-011). While the twin moves for the run, its gait advances by the distance its picture moved (`advance`, `legOffsets`, `cycleLength` at the twin figure's room height, `applyGait`, the hips' lowering), with spec 019's conditions: its clip `idle`, motion animating, quality level 0. When it stops, swaps, falls back, or the run ends, `clearGait`. With no `legs`, the director marks the twin `held` for the run (FR-014).
- **R-06 The pursuer and the wiring.** `scene/chase-figures.ts` reads, each frame, the walking view's `on` and `pose` (`WalkingView`, unchanged), the visitor's chosen avatar (`options.chosen`), and `AvatarFigures.shows("visitor")`, and gives the director `{ present, x, z, speed }` with `present` FR-001's condition. It reads the twin's and the dog's pictures and `legs` through two small getters `scene/avatars.ts` adds (`pictureOf(figure)`, `legsOf(figure)`), and sets the dog's clip by role through the controller's existing play path with `clipOf("dog", role)`.
- **R-07 Live region.** The stage reports the run's start and end as a `FigureSignal` `{ kind: "chase"; state: "started" | "ended"; who: "both" | "twin" | "dog" }`; `app.ts`'s `figureSignal` says the UI word (`chase.started_<who>`, `chase.ended_<who>`) through its `announcer`. Once per start and end; the director holds an `announced` flag, and says nothing where no figure moves.
- **R-08 Telemetry.** No usage event, no panel for the run (Q10; the spec's named deviation). The draft build's frame log takes the stage's `chase` signal with the least distance kept, a development aid. The room's dog figure's failure reaches `avatar_failed` through the existing `failed` signal; the "Visits whose avatar failed" panel's description names it (FR-026).
- **R-09 Scene data.** `figures.chase` and `figures.dog` are optional; absent, the chase's defaults compiled into `chase-steer.ts` and no room dog. `build/room/schema.ts` validates both (FR-005's speed refine; `home.at` two numbers; `footprint_m` above 0), and `compose/bundle.ts` carries them into `RoomScene.figures`. A test (`chase-schema.test.ts`) checks that the dog's home in `scene.yaml` is on the walkable floor (`isWalkable`).
- **R-10 The room's dog.** `scene/avatars.ts`: `FigureId`'s `dog` gets a figure record with `wants: bundled("dog")` where the bundle has the dog and `part.figures.dog` exists, else null; its picture is a `Group` the controller adds at the home (on the floor, turned by `heading_deg`), holding the instance; it plays `idle` once ready; `update` advances its mixer only at quality level 0 (the visitor's rule). It isn't in `both()` (the hand-off's two) or `settle()`. Its picture signals carry `part.avatars.dog.line` as the visitor's do, so `app.ts`'s existing route (`signal.figure !== "twin"`) gives them to `likeness-line.ts`; `placeholders.figure` stays the visitor's alone. `scene/loader.ts`'s `figureEntries` adds the dog's entries (model, `idle`, `walk`, `run`) after the twin's and the visitor's where `part.figures.dog` exists and the bundle has the dog, and once where the visitor chose the dog.
- **R-11 First visit.** `build/room/checks/rk.ts`'s `figures` and `firstVisit` add a `dog` share: the `assets/visitors/dog` folder's bytes WHERE the scene has `figures.dog`, counted once, the largest-other-visitor share then excluding the dog's folder with the stand-in's. The report line names the room's dog's bytes. RK5's message gains "… in the room's dog's files".
- **R-12 Disclosure and dashboard.** `docs/data-flow-disclosure.md` row V1's avatar-file list gains "the room's dog's model and clips in every 3D visit above the floor where the bundle has them, the same for every visitor"; row V4 unchanged. `deploy/grafana/dashboards/h4-runtime.json` panel "Visits whose avatar failed": its description names the room's dog's files.

## 3. Data model

`figures.chase`: `{ flee_end_delay_s: 2, flee_m: 3, safe_m: 1.5, separation_m: 0.5, twin_run_mps: 2.0, dog_run_mps: 2.5, speed_margin_mps: 0.5, turn_rate_rad_s: 8, lookahead_s: 0.5, headings: 16, clip_thresholds: { walk_mps: 0.3, run_mps: 1.5 } }`. Placeholders; the Author's look sets them (spec Assumptions); T002 tunes them until SC-001 holds on the room's floor and records any change here.

`figures.dog`: `{ home: { at: [x, z], heading_deg }, footprint_m: 0.3 }`, the home an estimate on the walkable floor beside the twin, chosen at T011 and marked `# estimated` in `scene.yaml`.

Per figure: `{ home: {x, z, heading}, pose: Pose, phase: "home" | "fleeing" | "returning", held: boolean }`; `Pose` is spec 008's.

## 4. Interface contracts

- `steer(floor, figure, dino, config, dt, out) → void` (chase-steer.ts), pure, writing into `out`.
- `createChase({ floor, config, walkMps, figures: { twin?, dog? }, now }) → { frame(dino, dt, motion): void; poses; phase; notes }` (chase.ts), pure.
- `createChaseFigures({ chase, avatars, walking, chosen, signal }) → { frame(dt, animate, level): void }` (chase-figures.ts).
- `FigureId = "twin" | "visitor" | "dog"`; `FigureSignal` gains `{ kind: "chase"; state: "started" | "ended"; who: "both" | "twin" | "dog" }` (stage.ts).
- `AvatarFigures` gains `pictureOf(figure: FigureId): Object3D | null` and `legsOf(figure: FigureId): LegRig | null` (avatars.ts).
- `TwinActivity` gains `{ kind: "flee"; on: boolean }`; `TWIN_STATES` gains `"fleeing"` first; `TWIN_CLIPS_DEFAULT.fleeing = "idle"`; `TWIN_CLIP_ROLES` unchanged. This amends spec 016's twin-states contract §1 and §2 (the contract file stays spec 016's; the amendment is recorded here and in T004).
- UI words: `chase.started_both`, `chase.started_twin`, `chase.started_dog`, `chase.ended_both`, `chase.ended_twin`, `chase.ended_dog`, no slots.

## 5. Files expected to touch

The implementer merges this branch first. Each file by its path; none is human-only.

**New source**
- `apps/web/src/room/scene/chase-steer.ts`
- `apps/web/src/room/scene/chase.ts`
- `apps/web/src/room/scene/chase-figures.ts`

**Changed source**
- `apps/web/src/room/stage.ts`: `FigureId` gains `"dog"`; `FigureSignal` gains `chase`.
- `apps/web/src/room/scene/avatars.ts`: the dog figure (R-10), `wants.dog`, per-figure gait (R-05), `pictureOf`, `legsOf`.
- `apps/web/src/room/scene/loader.ts`: `figureEntries` adds the room dog's entries (R-10).
- `apps/web/src/room/scene/twin-states.ts`: `fleeing`, `flee`, `TWIN_CLIPS_DEFAULT` (R-04).
- `apps/web/src/room/scene.ts`: creates the chase figures once the avatar module and the walking view exist; calls `frame` each frame after the walking view's frame and before `figures.update`.
- `apps/web/src/room/app.ts`: `figureSignal` says the `chase` signal's UI word (R-07).
- `apps/web/src/room/ui-keys.ts`: the six keys.
- `apps/web/src/room/compose/bundle.ts`: `RoomScene.figures` carries `dog` and `chase`.
- `apps/web/build/room/schema.ts`: `figures.dog`, `figures.chase` with FR-005's refine; `figures.twin.clips` refuses `fleeing`.
- `apps/web/build/room/checks/rk.ts`: RK5's dog share (R-11).
- `apps/web/build/room/report.ts`: the report's figures line names the room's dog's bytes (R-11).

**Changed data**
- `apps/web/room/scene.yaml`: `figures.dog`, `figures.chase` (not a human-only path).
- `apps/web/room/ui-words.yaml`: the six words.
- `apps/web/test/fixtures/room/good/apps/web/room/ui-words.yaml`: the six words (every key of the closed list).

**New tests** (`apps/web/test/room/`)
- `chase-steer.test.ts`, `chase-director.test.ts`, `chase-degraded.test.ts`, `chase-notes.test.ts`, `chase-states.test.ts`, `chase-figures.test.ts`, `chase-schema.test.ts`, `chase-bench.test.ts`, `dog-figure.test.ts`, `dog-first-visit.test.ts`.

**Changed tests**
- `apps/web/test/room/twin-states.test.ts`: the new state; the existing cases stay.
- `apps/web/test/room/likeness-line-anywhere.test.ts` (spec 020's): its `ROOM_DOG` stand-in key becomes the real `"dog"` `FigureId`, and a case drives the line from the stage's dog picture signal.
- `deploy/scripts/test_dashboard.py`: the avatar-failure panel's description names the room's dog.

**Docs**
- `docs/data-flow-disclosure.md`: row V1 (R-12).
- `deploy/grafana/dashboards/h4-runtime.json`: the "Visits whose avatar failed" panel's description (R-12).
- `docs/merge-requests/2026-11-14-feat-025-twin-and-dog-run-from-dino.md`: the merge-request note (T014).

**Not touched**: `apps/web/src/room/scene/walking.ts` (its `on` and `pose` already exist), `apps/web/src/room/compose/floor.ts` (R-02 filters its output), `apps/web/src/room/scene/gait.ts` (spec 019's FR-014), `apps/web/src/room/likeness-line.ts` (spec 020's holder takes any figure), `config/room-events.yaml`, `apps/web/src/room/events.ts`.

**Conflict watch**: specs 019 to 021 and 024 also touch `scene/avatars.ts`, `scene/loader.ts`, `build/room/schema.ts`, `scene.yaml`, `ui-keys.ts`, and `ui-words.yaml`. This branch's code goes after them on the line, in the order 019, 020, 021, 024, 025; spec 024's eating and this spec's run share FR-001's condition and nothing else (spec §Interplay with Spec 024).

## 6. Test plan (small tests first; rule 4)

| Test file | Covers | Run |
|---|---|---|
| `chase-steer.test.ts` | R-02, R-03, FR-004 to FR-009, SC-001 | `vitest run apps/web/test/room/chase-steer.test.ts` |
| `chase-director.test.ts` | FR-001 to FR-003, FR-010, FR-012, SC-002 | likewise |
| `chase-degraded.test.ts` | FR-014, FR-023, FR-024, SC-003 | likewise |
| `chase-notes.test.ts` | FR-025, SC-006 | likewise |
| `chase-states.test.ts`, `twin-states.test.ts` | FR-011, FR-015, SC-004 | likewise |
| `chase-figures.test.ts` | R-05, R-06, FR-013, FR-016, FR-017 | likewise |
| `chase-schema.test.ts` | R-09, FR-005's refine, the dog's home on the floor | likewise |
| `dog-figure.test.ts`, `likeness-line-anywhere.test.ts` | R-10, FR-018 to FR-021, SC-007 | likewise |
| `dog-first-visit.test.ts` | R-11, FR-022 | likewise |
| `chase-bench.test.ts` | FR-029, SC-005 | likewise |
| `deploy/scripts/test_dashboard.py`, `apps/web/test/disclosure.test.ts`, `evals/test_disclosure.py` | FR-026, FR-028 | `pytest deploy/scripts/test_dashboard.py evals/test_disclosure.py`; `vitest run apps/web/test/disclosure.test.ts` |

Each task also runs the tests covering the files it changes (tasks.md names them). `make lint` after each task. The full `make check` runs once, at the end of the stack, by one task (the Author's rule 4), here T014.

## 7. Human-only paths

None: every file of §5 is outside `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`, and `assets/policy/**`. `apps/web/room/scene.yaml` is the room's data, not a human-only path. `docs/merge-requests/human-patches/025.md` says so.

## 8. Validation

Run the §6 files and `make lint`; the Author's look at the run (SC-008), at lookdev or a dev-cpu stack with the three models in.

## 9. Order

Implementation runs on one line after 019, 020, 021, and 024 are on it: this branch merges first for its artifacts, then T001 onward.
