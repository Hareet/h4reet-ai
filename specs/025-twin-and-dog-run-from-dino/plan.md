# Implementation Plan: The Twin and the Dog Run From the Dinosaur

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

His item, the letter and the title in his words: h) "twin and dog running from dino". (His orders file numbers it 8 and notes "Needs c, d, and e."; those are the file's, not his words.) And: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". The thirteen clarification answers are the recommended ones, each provisional and on the morning page, taken under the order's rule 1: Q1, Q4, Q7, and Q8 as the page's Q110 to Q112, Q11 as its Q139 (rv-rework-spec-025's BLOCKING-1), and Q12 and Q13 new. An overturned answer is reworked before he merges.

**Branch**: `night/spec-025/spec-025`, reworked on `night/rework-spec-025/rework-spec-025` and `night/rework2-spec-025/rework2-spec-025` | **Date**: 2026-11-13, reworked twice on 2026-11-14 | **Spec**: [spec.md](spec.md)

## 1. Summary

A pure "chase director" reads the visitor's figure, the dinosaur, from the walking view's pose, and gives the twin and the room's dog a pose each frame, away from it on spec 008's walkable floor. The twin's picture moves with spec 019's gait over its idle; the room's dog, a new figure this spec owns (spec 020's Q1), plays its `idle`, `walk`, and `run` by speed. Spec 016's state machine gains `fleeing`. Everything tunable is data in the scene's `figures.chase` and `figures.dog` blocks. No dependency is added, no new destination, no usage event; the room's dog's static files join the first visit, counted by RK5.

## Technical Context

**Language**: TypeScript 5 (`apps/web`); Python for the dashboard's test. **Dependencies**: three.js as pinned; none new. **Testing**: Vitest on numbers (fake floors, the room's own floor from `scene.yaml`, a scripted pose, the room's fake clock), no WebGL; the stage's fake for the dog figure. **Target**: desktop and phone with WebGL2 above ADR 0010's floor. **Performance**: FR-029, under 0.2 ms a frame, no per-frame allocation. **Constraints**: no cap change, no CSP change, no human-only path, no `assets/**`.

## Constitution Check

Same table as the spec's: passes before and after design, with one named deviation (spec Assumptions): Principle II's production telemetry and Development Workflow 7's graph, for the run alone, because an event would carry the visitor's avatar, which row V4 promises it never does (Q10). If he confirms it, an ADR (the docs role's) is on main before the implementation merges (Q13, as spec 024's page Q-R2c). Principle I: degraded mode first (spec §Degraded-Mode, User Story 2), row V1 amended for the room's dog's files. Principle VIII: the twin's line and answers are untouched; the dog's likeness line shows wherever the room's dog shows the model.

## 2. Decisions (research)

- **R-01 Pure core, thin shell.** `scene/chase-steer.ts` (math: no three.js import, like `twin-states.ts`) and `scene/chase.ts` (the director: the visitor's pose and figure in, poses, phases, and the run's notes out). `scene/chase-figures.ts` is the shell: it places the twin's picture and the dog's group from the poses and drives their legs and clips. Rationale: rule 4 of the Author's order, small tests that run on numbers.
- **R-02 Steering.** For a figure at p, the dinosaur at d, within `flee_m`: for each of `headings` unit directions u, the step q = slide(p, u · v · dt) on the chase floor; its score is |q − d′| where d′ = d moved toward q by `walking.speed_mps · lookahead_s`, less a wall penalty (k / clearance(q), `compose/floor.ts`'s `clearance`) below `WALL_M` of clearance, a named constant in `chase-steer.ts` that T002 tunes (start 0.1 m) and records in §3. The first threshold, 2 × `safe_m`, would cover a whole strip 0.275 m deep (§3.1); the best scoring heading wins, ties to the lowest index; a dead band (0.05 m/s) stops jitter. Chosen over a potential field (the first version's flee + pull): sampled headings with a lookahead don't drive a figure into a corner, which the property test (SC-001) on the room's own floor checks, and they stay cheap (16 headings × 2 figures × one slide). The chase floor is `floorOfPart`'s floor with the twin's obstacle filtered from `obstacles` by its ID (`part.figures.twin`); `compose/floor.ts` doesn't change. The dinosaur's floor is the visitor's, which keeps the twin's obstacle (FR-017), so the twin's corner is the chase floor's alone (§3). A figure under `safe_m` (FR-007's clause a) scores only the headings whose step ends at least min(`safe_m`, the distance it ended its last frame at) from the dinosaur's position this frame, which is clause (a)'s own measure, frame end to frame end; at a start, a resume, or a jump, the last distance is the one before the step (rv-rework2-spec-025's Nit-2; T002). Among those, the lookahead's score picks; with none, it takes the one that loses least, which the property test proves never happens from the homes on the room's floor. The step takes the chosen heading at once, and the turn rate bounds only the picture's facing (FR-009). The separation (FR-008) is applied last, and only among the headings FR-007's clauses allow: the dog yields along the perpendicular where that keeps clause (a) or (b), else it keeps its heading and the twin's own step opens the gap.

  **As built (T002, a departure):** the score isn't |q − d′|. It is the least margin along the path the heading would run for `lookahead_s`, sampled `LOOK_SAMPLES` = 4 times, from the dinosaur's reach (anywhere within `walking.speed_mps` × t of where it is), less `WALL_K` × (`WALL_M` − clearance) below `WALL_M` = 0.1 m (`WALL_K` = 0.5): with |q − d′| a figure ran along the strip's front edge into the dinosaur's path, and the path's margin sees that coming. The separation isn't a perpendicular step: among the headings FR-007 allows, a step that keeps `separation_m` from the twin, or opens the gap, ranks first, then the score; standing (a figure at or above `safe_m`) wins where no step beats it by the dead band. A figure stuck on its way home is put home (a cut), so SC-002 always holds. Two of T001's cases changed in T002, neither weakened in what it checks: the dead-band case's still window starts at frame 10, not 5, since the pocket's corner is 8 mm farther than its end and the figure walks there in 8 frames before it stands; and the corner case keeps its static-dinosaur form beside a new one with the dinosaur walking at it.
- **R-03 Speed rule.** Base speed per figure from data; the schema refuses a run speed not above `walking.speed_mps + speed_margin_mps` (FR-005). No catch-up rule is needed beyond it: the pursuer's speed is bounded by spec 008's movement.
- **R-04 State.** `twin-states.ts` gains `fleeing` first in `TWIN_STATES`, `TWIN_CLIPS_DEFAULT.fleeing = "idle"`, and `TwinActivity` `{ kind: "flee"; on: boolean }`; `fleeing` is set through `signal`, not by the machine reading the director, so the machine stays pure. Its timers keep running, so a leftover `answering` plays after the run (User Story 4, scenario 2). `TWIN_CLIP_ROLES` doesn't change (Q7): the twin's legs are spec 019's gait over `idle`. The map's closed lists are RI8's, not the schema's (`schema.ts`'s `twinBlock` takes `z.record(z.string(), z.string())`, "so a key or value outside them is RI8's, never RD2's"). So `build/room/checks/ri.ts`'s `twinBlock` refuses `fleeing` as a key ("a state the run sets, whose clip is the idle"): `isTwinState` accepts it once it joins `TWIN_STATES`, and RI8 isn't lenient (`family.ts`), so no build carries it. `emit.ts`'s `twinBlockOf` and `reach.ts`'s `playedRoles` loop over `TWIN_STATES` and don't change. The emitted map gains `fleeing: "idle"` and the played roles don't change, since the idle is played already.
- **R-05 The twin's legs.** `scene/avatars.ts`'s gait, now the visitor's alone (its `gait` object, `resetGait`, `figures.visitor.legs`), becomes per figure: the twin's figure gets its `legs` from `findLegRig` on its shown instance, as the visitor's does, and its own gait state, written in place (spec 019's FR-011). While the twin moves for the run, its gait advances by the distance its picture moved (`advance`, `legOffsets`, `cycleLength` at the twin figure's height in metres, `applyGait`, the hips' lowering by `standingLift`, as `fix-019`'s `stepGait` has it). The height isn't `cycleLength(f.target)`, the visitor's call: the twin's own model has `target` `OWN` = -1 (`scene/avatars.ts:243` on `fix-020`), so its height is the shown instance's measured height (`instanceFor`'s box height at scale 1). The stand-in's is `part.figures.twin_height`. Each is kept on the figure when its instance is placed. with spec 019's conditions: its clip `idle`, motion animating, quality level 0. When it stops, swaps, falls back, or the run ends, `clearGait`. With no `legs`, the director marks the twin `held` for the run (FR-014).
- **R-06 The pursuer and the wiring.** `scene/chase-figures.ts` reads, each frame, the walking view's `on` and `pose` (`WalkingView`, unchanged), the visitor's chosen avatar (`options.chosen`), and `AvatarFigures.shows("visitor")`, and gives the director `{ present, x, z, speed }` with `present` FR-001's condition. It reads the twin's and the dog's pictures and `legs` through two small getters `scene/avatars.ts` adds (`pictureOf(figure)`, `legsOf(figure)`), and sets the dog's clip by role through the controller's existing play path with `clipOf("dog", role)`.
- **R-07 Live region.** The stage reports the run's start and end as a `FigureSignal` `{ kind: "chase"; state: "started" | "ended"; who: "both" | "twin" | "dog" }`; `app.ts`'s `figureSignal` says the UI word (`chase.started_<who>`, `chase.ended_<who>`) through its `announcer`. Once per start and end; the director holds an `announced` flag, and says nothing where no figure moves.
- **R-08 Telemetry.** No usage event, no panel for the run (Q10; the spec's named deviation). The draft build's frame log takes the stage's `chase` signal with the least distance kept, a development aid. The room's dog figure's failure reaches `avatar_failed` through the existing `failed` signal; the "Visits whose avatar failed" panel's description names it (FR-026).
- **R-09 Scene data.** `figures.chase` and `figures.dog` are optional; absent, the chase's defaults compiled into `chase-steer.ts` and no room dog. `build/room/schema.ts` validates both (FR-005's speed refine; `home.at` two numbers; `footprint_m` above 0), and `compose/bundle.ts` carries them into `RoomScene.figures`. A test (`chase-schema.test.ts`) checks the room's data (Q11):
- each home (the twin's placement's position, and `figures.dog.home.at`) is at least `safe_m` from `floor.start`;
- the dog's home is walkable on the chase floor and at least `separation_m` from the twin's home.

It is a test over the shipped `scene.yaml`, not a build rule. With clause (a), a home under `safe_m` is safe (the figure moves away), so the data isn't wrong, only a run that starts with a step. The twin's placement is spec 009's and 016's data, which a build rule for the run shouldn't refuse. At the defaults, both homes pass (§3).
- **R-10 The room's dog.** `scene/avatars.ts`: `FigureId`'s `dog` gets a figure record with `wants: bundled("dog")` where the bundle has the dog and `part.figures.dog` exists, else null; its picture is a `Group` the controller adds at the home (on the floor, turned by `heading_deg`), holding the instance; it plays `idle` once ready; `update` advances its mixer only at quality level 0 (the visitor's rule). Its `target` is `AVATAR_SHAPES.dog.height`, which `instanceFor` scales to, as the visitor's figure's (FR-018); the loader doesn't scale. It isn't in `both()` (the hand-off's two) or `settle()`. The source's paths that read `both()` today read a new `wanting()` list, `both()` plus the room's dog where it wants a model:
- `place` (`avatars.ts:771` on `fix-020`), so one parsed model is placed in every figure that wants it, the visitor's dog and the room's dog alike;
- `clip` and `missed` (`:840-870`), so a clip binds, and a failure falls back, in the room's dog as in the others.

`both()` stays the hand-off's and `settle()`'s. **As built (T011), with rv-rework2-spec-025's I-1:** `wanting()` is read by `place`, `clip`, and `missed`, and also by `handoffEnded()`'s retry (a dog ready during the hand-off waits for its end to show, as the others do, since `tryShow` is shared), `update()`'s mixers (the dog's advances at quality level 0 only), and `reset()`'s fallback (a restored context's reload shows it again); `dispose()` takes its group out of the scene. The dog's picture group is `DOG_NODE` (`"room-dog"`), added to the room's scene only where it wants a model, at its home's [x, z] and the visitor's placement's floor height, turned by spec 008's heading + π (the avatar faces glTF's +z). It has no fallback meshes; with no room dog no signal is sent for it. `AvatarFigures` gains `dogPlays(role)`, the run's path to its clip (R-06), its idle for a role it hasn't. `findHand`, the kept paper, and the sheet aren't the dog's. `wants` carries `dog: null` where there is no room dog (FR-019), so the tests that pin `wants` whole gain it: `avatars.test.ts` (three cases) and `twin-figure.test.ts` (two), and `avatars-compose.test.ts`'s committed figures keys gain `dog`. T010's file changed in T011 in three measurements, none weakened: the dog's height is its rest pose's times its scale (the idle moves the hips, so the posed box isn't the measure), the wait is awaited rather than raced against a resolved promise, and the mixer's time is read from the hips' place (the idle's one track). `footprint_m` is validated and carried, and nothing reads it yet (rv-rework2-spec-025's Nit-4): it is the Author's look's figure for a later check. Its picture signals carry `part.avatars.dog.line` as the visitor's do, so `app.ts`'s existing route (`signal.figure !== "twin"`) gives them to `likeness-line.ts`; `placeholders.figure` stays the visitor's alone. `scene/loader.ts`'s `figureEntries` adds the dog's entries (model, `idle`, `walk`, `run`) after the twin's and the visitor's where `part.figures.dog` exists and the bundle has the dog, and once where the visitor chose the dog; the loading screen counts them as the other figures' entries (spec 012, its ceiling included). `figureEntries` has a third caller, `src/lookdev/stage.ts:587` (the hands case's files). It passes `{ ...part.figures, stand_in: null }`, which would carry `figures.dog` through, so it also passes `dog: undefined`: the lookdev page fetches only the avatars its hands case lists.
- **R-11 First visit.** `build/room/checks/rk.ts`'s `figures` and `firstVisit` add a `dog` share: the `assets/visitors/dog` folder's bytes WHERE the scene has `figures.dog`, counted once, the largest-other-visitor share then excluding the dog's folder with the stand-in's. The report line names the room's dog's bytes. RK5's message gains "… in the room's dog's files".
- **R-12 Disclosure and dashboard.** `docs/data-flow-disclosure.md` row V1's avatar-file list gains "the room's dog's model and clips in every 3D visit above the floor where the bundle has them, the same for every visitor"; row V4 unchanged. `deploy/grafana/dashboards/h4-runtime.json` panel "Visits whose avatar failed": its description names the room's dog's files.

## 3. Data model

`figures.chase`: `{ flee_end_delay_s: 2, flee_m: 1.0, safe_m: 0.4, separation_m: 0.3, twin_run_mps: 2.0, dog_run_mps: 2.5, speed_margin_mps: 0.5, turn_rate_rad_s: 8, lookahead_s: 1.0, headings: 16, clip_thresholds: { walk_mps: 0.3, run_mps: 1.5 } }`. These are placeholders the Author's look sets (spec Assumptions). The second rework fitted `flee_m` (was 3), `safe_m` (was 1.5), and `separation_m` (was 0.5) to the room below (Q12). T002 tunes them until SC-001 holds on the room's floor, never `safe_m` below 0.3 m, and records any change here. T002's one change: `lookahead_s` 0.5 → 1.0 (at 0.5 the property failed in the room's strip; at 1.0 it holds, `safe_m` 0.4 unchanged).

`figures.dog`: `{ home: { at: [0.36, 0.55], heading_deg: 0 }, footprint_m: 0.3 }`, an estimate in the twin's corner, at the twin's side. It is marked `# estimated` in `scene.yaml` at T011, which may move it within R-09's checks. **As built (T011, Q158):** `{ home: { at: [0.30, 0.45], heading_deg: 180 }, footprint_m: 0.3 }`. `separation_m` is centre to centre, so at [0.36, 0.55] the dog's and the twin's bodies touched (rv-rework2-spec-025's Nit-3); [0.30, 0.45] is 0.361 m from the twin's home and 1.008 m from `floor.start`. `heading_deg` is spec 008's heading in degrees (0 faces into the room, −z), so 180 faces the room's front, the visitor; at 0 the dog faced the back wall.

### 3.1 The room's numbers (Q11, Q12)

The spec-writer computed these by hand on `fix-020`, from the catalog's `bounds` and `scene.yaml`'s mounts, by `compose/floor.ts`'s rule: every placement but the shell and the visitor whose box meets the figure's height is an obstacle, grown by `walking.radius_m`, 0.12 m. They are approximate. T001's first case prints the composed floors (bounds, obstacles, `start`) and T002 records the exact ones here.

**The floor**

| What | Where (x, z in metres, the room's floor anchor) |
|---|---|
| Shell (`room-shell.yaml`, 2.1336 × 1.2192 m) | x ±1.067, z ±0.610 |
| Bounds (less the radius; the front less the visitor's half-depth, 0.025) | x [−0.947, 0.947], z [−0.490, 0.585] |
| Work desk (1.5 × 0.8 m, back wall + 0.4) | obstacle x [−0.870, 0.870], z [−0.730, 0.310] |
| Twin's figure (box x [−0.37, 0.36], z [−0.324, 0.2] at its mount) | obstacle x [0.170, 1.140], z [0.025, 0.789] |
| Chalkboard (left wall, y 1.33 to 1.97) | obstacle x ≤ −0.907, z about [−0.07, 0.65] |
| Bicycle (right wall, its turn read by hand) | obstacle x ≥ about 0.77, over most of the strip |

**Positions and distances**

| What | Where (x, z in metres, the room's floor anchor) |
|---|---|
| `floor.start` (`visitor-figure`'s mount, `[-0.7, 0, 0.58]`) | (−0.700, 0.580) |
| The twin's home (`twin-figure`'s mount, `[0.66, 0, 0.469]`) | (0.660, 0.469), 1.364 m from `floor.start` |
| The dog's home (the estimate above) | (0.36, 0.55), 1.060 m from `floor.start`, 0.311 m from the twin's home |
| The dinosaur's floor in front of the desk | x [−0.907, 0.170], z [0.310, 0.585]: about 1.08 × 0.275 m |
| The chase floor adds the twin's corner | x (0.170, about 0.77], the same z: about 0.6 m long |

What follows:
- From the strip's middle the dinosaur is within about 1.1 m of every point of the chase floor, so the first `safe_m`, 1.5 m, can't hold anywhere. It also failed on frame 0 at the twin's home, 1.364 m from the start (BLOCKING-1).
- The dinosaur can't enter the twin's corner, so the farthest a figure can be from it is about 0.6 m, at the corner's end.
- With two figures in the corner, the second stands `separation_m` from the first across a strip 0.275 m deep. That is about 0.2 m from the dinosaur's reach at `separation_m` 0.5, and about 0.48 m at 0.3. So the defaults are `safe_m` 0.4 and `separation_m` 0.3.
- Both homes are at least 0.4 m from `floor.start` (R-09 passes). With `flee_m` 1.0, neither figure moves when a walk begins: the dinosaur has to walk toward them.
- The dog's home is 0.19 m from the dinosaur's reach. When the dinosaur stands at the corner's mouth, the dog takes clause (a) and moves deeper in, beside the twin.
- The run in this room is a step or two into the corner, facing the dinosaur (Q12).

**As composed (T001's print, T002; the exact numbers):** the visitor's floor's bounds are x [−0.947, 0.947], z [−0.490, 0.585], its start (−0.700, 0.580). Its obstacles (x; z): work-desk [−0.870, 0.870]; [−0.730, 0.312] · desk-screen [−0.766, 0.458]; [−0.695, −0.169] · neon-sign [−0.942, 0.845]; [−0.637, −0.309] · laptop-stand [0.300, 0.800]; [−0.550, −0.070] · laptop [0.274, 0.826]; [−0.561, −0.080] · busy-sign [−0.839, −0.261]; [−0.431, −0.048] · dog-sign [0.025, 0.515]; [−0.428, −0.071] · chalkboard [−1.187, −0.887]; [−0.190, 0.765] · snowboard [−1.187, −0.749]; [−0.676, −0.124] · bicycle [0.769, 1.185]; [−0.407, 0.601] · wall-window [−1.120, 1.120]; [−0.730, −0.429] · window-view [−1.080, 1.080]; [−0.718, −0.470] · split-keyboard [−0.491, 0.209]; [−0.278, 0.250] · vertical-mouse [−0.007, 0.328]; [−0.162, 0.203] · notebook [−0.836, −0.239]; [−0.247, 0.282] · helmet [0.559, 1.149]; [−0.347, 0.191] · bag [−0.092, 0.710]; [−0.578, 0.075] · wall-outlet [0.902, 1.187]; [−0.556, −0.244] · twin-figure [0.170, 1.140]; [0.025, 0.789]. The chase floor is the same less twin-figure (18 obstacles). So the dinosaur's strip is x [−0.887, 0.170], z [0.312, 0.585], and the twin's corner runs to the bicycle at x 0.769 (rv-rework2-spec-025's Nit-1: the chalkboard's row is x [−1.187, −0.887], z [−0.190, 0.765], not "x ≤ −0.907, z about [−0.07, 0.65]"). With the defaults and `lookahead_s` 1.0, FR-007's property holds on this floor, 201 starts × 600 frames, 0 violations, the least distance kept 0.141 m (a seeded start beside the dog's home, under clause (a), moving away).

Per figure: `{ home: {x, z, heading}, pose: Pose, phase: "home" | "fleeing" | "returning", held: boolean }`; `Pose` is spec 008's.

## 4. Interface contracts

- `steer(floor, figure, dino, config, dt, out) → void` (chase-steer.ts), pure, writing into `out`; `out` carries the step's heading and the picture's facing apart (FR-009).
- `createChase({ floor, config, walkMps, figures: { twin?, dog? }, now }) → { frame(dino, dt, motion): void; poses; phase; notes }` (chase.ts), pure. **As built (T006):** `createChase({ floor, config, walkMps, figures: { twin?, dog? }, note? }) → { frame(dino, dt, motion), on, runner(id), phase(id), moving(id), hold(id, held) }`: no `now`, the delay counts the room's clock's `dt`; the poses are the runners, written in place; the notes go through the `note` callback, once a start and once an end, with nothing kept a frame. Two pure helpers beside it: `pursuerPresent({ chosen, shows, walking })` (FR-001, which chase-figures.ts calls) and `dogRole(speed, clip_thresholds, { walk, run })` (FR-010). `moving(id)`, FR-012's `fleeing`, is the figure off its home's spot or stepping, in the run's or the return's phase; a figure that only turns at home to watch the dinosaur isn't moving. **As built (T008):** a paused room stops the run's clock, the delay with it, and the next frame that moves is a resume (clause (a)); reduced motion or quality level 1 or more cuts every figure home and ends the run with nothing said, the started line's pair included (FR-025: "WHILE no figure can move … nothing is said"; SC-006); a figure held mid-run (`hold`) is cut home. The 2D room, the floor below ADR 0010's, and a lost context never make the run (chase-figures.ts's), so T007's file leaves them to T014's.
- `createChaseFigures({ chase, avatars, walking, chosen, signal }) → { frame(dt, animate, level): void }` (chase-figures.ts).
- `FigureId = "twin" | "visitor" | "dog"`; `FigureSignal` gains `{ kind: "chase"; state: "started" | "ended"; who: "both" | "twin" | "dog" }` (stage.ts).
- `AvatarFigures` gains `pictureOf(figure: FigureId): Object3D | null` and `legsOf(figure: FigureId): LegRig | null` (avatars.ts).
- `TwinActivity` gains `{ kind: "flee"; on: boolean }`; `TWIN_STATES` gains `"fleeing"` first; `TWIN_CLIPS_DEFAULT.fleeing = "idle"`; `TWIN_CLIP_ROLES` unchanged. This amends spec 016's twin-states contract §1 and §2 (the contract file stays spec 016's; the amendment is recorded here and in T004).
- UI words: `chase.started_both`, `chase.started_twin`, `chase.started_dog`, `chase.ended_both`, `chase.ended_twin`, `chase.ended_dog`, no slots. **As built (T009):** their words end with a full stop, as the room's other lines do; the one-figure ended forms are "The twin is back in its place." and "The dog is back in its place." `test/room/vocabulary.test.ts`, which pins the closed list whole (77 keys), gains the six (83): a changed test §5 didn't list. The frame log's `FrameEvent` gains `chase` (`state`, `who`; R-08), without the least distance. The started line waits for a figure that moves (`moving`), not one that turns to watch.

## 5. Files expected to touch

The implementer merges this branch first. Each file by its path; none is human-only.

**New source**
- `apps/web/src/room/scene/chase-steer.ts`
- `apps/web/src/room/scene/chase.ts`
- `apps/web/src/room/scene/chase-figures.ts`

**Changed source**
- `apps/web/src/room/stage.ts`: `FigureId` gains `"dog"`; `FigureSignal` gains `chase`.
- `apps/web/src/room/scene/avatars.ts`: the dog figure (R-10: its `target`, the `wanting()` list `place`, `clip`, and `missed` read), `wants.dog`, per-figure gait with the twin's height in metres (R-05), `pictureOf`, `legsOf`.
- `apps/web/src/room/scene/loader.ts`: `figureEntries` adds the room dog's entries (R-10).
- `apps/web/src/lookdev/stage.ts`: its `figureEntries` call (`:587`) passes `dog: undefined` beside `stand_in: null` (R-10).
- `apps/web/src/room/scene/twin-states.ts`: `fleeing`, `flee`, `TWIN_CLIPS_DEFAULT` (R-04).
- `apps/web/src/room/scene.ts`: creates the chase figures once the avatar module and the walking view exist; calls `frame` each frame after the walking view's frame and before `figures.update`.
- `apps/web/src/room/app.ts`: `figureSignal` says the `chase` signal's UI word (R-07).
- `apps/web/src/room/ui-keys.ts`: the six keys.
- `apps/web/src/room/compose/bundle.ts`: `RoomScene.figures` carries `dog` and `chase`.
- `apps/web/build/room/schema.ts`: `figures.dog`, `figures.chase` with FR-005's refine. `figures.twin.clips` doesn't change: its closed lists are RI8's.
- `apps/web/build/room/checks/ri.ts`: RI8's `twinBlock` (`:414` on `fix-020`) refuses `fleeing` as a key of `figures.twin.clips` (R-04).
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
- `apps/web/test/room/bundle.test.ts`: the emitted twin block's `toEqual` (`:1403` on `fix-020`) gains `fleeing: "idle"`. The `toMatchObject` at `:1441` needs no change.
- `apps/web/test/room/schema.test.ts`: an RI8 case beside `:1242`'s, `{ clips: { fleeing: "idle" } }` refused at `figures.twin.clips.fleeing`.
- `apps/web/test/room/avatars.test.ts`, `twin-figure.test.ts`, `avatars-compose.test.ts`: `wants` gains `dog: null`, the committed figures keys `dog` (T011; added on departure).
- `apps/web/test/room/vocabulary.test.ts`: the closed list's six new keys and its count (T009; added on departure).
- `apps/web/test/room/likeness-line-anywhere.test.ts` (spec 020's): its `ROOM_DOG` stand-in key becomes the real `"dog"` `FigureId`, and a case drives the line from the stage's dog picture signal.
- `deploy/scripts/test_dashboard.py`: the avatar-failure panel's description names the room's dog.

**Docs**
- `docs/data-flow-disclosure.md`: row V1 (R-12).
- `deploy/grafana/dashboards/h4-runtime.json`: the "Visits whose avatar failed" panel's description (R-12).
- `docs/merge-requests/2026-11-14-feat-025-twin-and-dog-run-from-dino.md`: the merge-request note (T016).

**Read, not changed**: `apps/web/build/room/emit.ts` (`twinBlockOf`, `:1165`, loops over `TWIN_STATES`: the emitted map gains `fleeing: "idle"`) and `apps/web/build/room/reach.ts` (`playedRoles`, `:574`, likewise: the played roles don't change).

**Not touched**: `apps/web/src/room/scene/walking.ts` (its `on` and `pose` already exist), `apps/web/src/room/compose/floor.ts` (R-02 filters its output), `apps/web/src/room/scene/gait.ts` (spec 019's FR-014), `apps/web/src/room/likeness-line.ts` (spec 020's holder takes any figure), `config/room-events.yaml`, `apps/web/src/room/events.ts`.

**Conflict watch**: specs 019 to 021 and 024 also touch `scene/avatars.ts`, `scene/loader.ts`, `build/room/schema.ts`, `scene.yaml`, `ui-keys.ts`, and `ui-words.yaml`. This branch's code goes after them on the line, in the order 019, 020, 021, 024, 025; spec 024's eating and this spec's run share FR-001's condition and nothing else (spec §Interplay with Spec 024).

## 6. Test plan (small tests first; rule 4)

| Test file | Covers | Run |
|---|---|---|
| `chase-steer.test.ts` | R-02, R-03, FR-004 to FR-009, SC-001 (both clauses; the pursuer from `floor.start` and seeded starts and jumps) | `vitest run apps/web/test/room/chase-steer.test.ts` |
| `chase-director.test.ts` | FR-001 to FR-003, FR-010, FR-012, SC-002 | likewise |
| `chase-degraded.test.ts` | FR-014, FR-023, FR-024, SC-003 | likewise |
| `chase-notes.test.ts` | FR-025, SC-006 | likewise |
| `chase-states.test.ts`, `twin-states.test.ts`, `bundle.test.ts`, `schema.test.ts` | FR-011 (RI8 refuses `fleeing`; the emitted map's `fleeing: "idle"`), FR-015, SC-004 | likewise |
| `chase-figures.test.ts` | R-05 (the twin's height in metres for both models), R-06, FR-013, FR-016, FR-017 | likewise |
| `chase-schema.test.ts` | R-09, FR-005's refine, each home against `floor.start` and `safe_m`, the dog's on the chase floor and apart from the twin's | likewise |
| `dog-figure.test.ts`, `likeness-line-anywhere.test.ts` | R-10, FR-018 to FR-021, SC-007 | likewise |
| `dog-first-visit.test.ts` | R-11, FR-022 | likewise |
| `chase-bench.test.ts` | FR-029, SC-005 | likewise |
| `deploy/scripts/test_dashboard.py`, `apps/web/test/disclosure.test.ts`, `evals/test_disclosure.py` | FR-026, FR-028 | `pytest deploy/scripts/test_dashboard.py evals/test_disclosure.py`; `vitest run apps/web/test/disclosure.test.ts` |

Each task also runs the tests covering the files it changes (tasks.md names them). `make lint` after each task. The full `make check` runs once, at the end of the stack, by one task (the Author's rule 4), here T016.

## 7. Human-only paths

None: every file of §5 is outside `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`, and `assets/policy/**`. `apps/web/room/scene.yaml` is the room's data, not a human-only path. `docs/merge-requests/human-patches/025.md` says so.

## 8. Validation

Run the §6 files and `make lint`; the Author's look at the run (SC-008), at lookdev or a dev-cpu stack with the three models in.

## 9. Order

Implementation runs on one line after 019, 020, 021, and 024 are on it: this branch merges first for its artifacts, then T001 onward.
