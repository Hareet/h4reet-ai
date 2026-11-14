# Implementation Plan: The Twin and the Dog Run From the Dinosaur

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

His item: "8. h) "twin and dog running from dino". Needs c, d, and e." And: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". The six clarification answers are the recommended ones, each also on the morning page; an overturned answer is reworked before he merges.

**Branch**: `night/spec-025/spec-025` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

## 1. Summary

A pure "chase director" reads the dinosaur's presence and gives the twin and the dog a pose each frame, away from the dinosaur on spec 008's walkable floor. Each figure's existing driver (`FigureDriver`, `scene/figure.ts`) shows it: the twin's walk clip (spec 019), the dog's run (spec 020). Spec 016's state machine gains `fleeing`. Everything tunable is data in the scene's `figures.chase` block. No dependency is added, no file is served, nothing leaves the device.

## Technical Context

**Language**: TypeScript 5 (`apps/web`). **Dependencies**: three.js as pinned; none new. **Testing**: Vitest on numbers (fake floor, fake figures, the room's fake clock), no WebGL. **Target**: desktop and phone with WebGL2 above ADR 0010's floor. **Performance**: FR-019, under 0.2 ms a frame, no per-frame allocation. **Constraints**: no cap change, no CSP change, no human-only path, no `assets/**`.

## Constitution Check

Same table as the spec's: passes before and after design. Principle I: degraded mode first (spec §Degraded-Mode, User Story 2). Principle VIII: the twin's line and answers are untouched. No deviation.

## 2. Decisions (research)

- **R-01 Pure core, thin shell.** `scene/chase-steer.ts` (math: no three.js import, like `twin-states.ts`) and `scene/chase.ts` (the director: presence in, poses out, the live-region notes, the telemetry record). The shell wires drivers. Rationale: rule 4 of the Author's order, small tests that run on numbers.
- **R-02 Steering.** For a figure at p and the dinosaur at d: flee = normalize(p − d); open-space pull = toward the farthest corner of the bounds minus obstacles, weighted by 1/(dist) so it only matters when near an edge; the sum is slid by spec 008's `slide`; a dead band (0.05 m/s) stops jitter. Chosen over path-finding: the room is one floor with few rectangles (`compose/floor.ts`); rectangles and slide are enough, and the property test (SC-001) covers corners.
- **R-03 Speed rule.** Base speed per figure from data; raised to dinosaur speed + margin inside SAFE_M + 1 m (FR-007). A cornered figure holds.
- **R-04 State.** `twin-states.ts` gains `fleeing` first in `TWIN_STATES`, clip default `walk`; `fleeing` is set by an input `{kind:"flee", on:boolean}` to `signal`, not by the machine reading the director, so the machine stays pure. Its timers keep running, so a leftover `answering` time plays after the run (spec User Story 4, scenario 2). The `TwinClipRole` list gains `walk` and `run`, **if spec 019 hasn't added them**: the plan's adapter (R-06) uses 019's names.
- **R-05 Reduced motion and pause.** The director reads the motion store's `animate`; when false it reports phase `home` for every figure.
- **R-06 The adapter.** One file, `scene/chase-adapters.ts`, turns specs 019 to 021's real interfaces into the three this spec assumes (spec §Assumed Interfaces): `getDinoPresence()`, `twinFigure()`, `dogFigure()`. When their code lands, only this file and its test change. Chosen so this spec can be implemented before the other three, with fakes, and still merge.
- **R-07 Live region.** Uses a11y.ts's existing polite `role="status"` region; messages are strings in `apps/web/src/room/text-copy.ts`'s style table (data, not code). Once per start and end; the director holds a `announced` flag.
- **R-08 Telemetry.** A `room.chase` record in the existing frame log: start, end, duration, minimum distance. No payload. The dashboard panel's description is a docs edit.
- **R-09 No new scene schema break.** `figures.chase` is optional; its absence means the defaults compiled into `chase-steer.ts`, and zod validation (build/room/schema.ts) accepts it. The build's data-only test (`data-only.test.ts`) must pass with the block.

## 3. Data model

`figures.chase`: `{ flee_end_delay_s: 2, safe_m: 1.5, separation_m: 0.5, twin_run_mps: 3.0, dog_run_mps: 4.0, speed_margin_mps: 0.5, turn_rate_rad_s: 8, clip_thresholds: { walk_mps: 0.3, run_mps: 2.0 } }`. Placeholders; the Author's look sets them (spec Assumptions).

Per figure: `{ home: {x, z, heading}, pose: Pose, phase: "home" | "fleeing" | "returning" }`, `Pose` is spec 008's.

## 4. Interface contracts

- `steer(floor, figure, dino, config, dt) → Pose` (chase-steer.ts), pure.
- `createChase({floor, config, dino, twin, dog, notes, animate, now}) → { frame(dt), flee: boolean }` (chase.ts).
- `TwinActivity` gains `{ kind: "flee"; on: boolean }`; `TWIN_STATES` gains `"fleeing"`; amends spec 016's twin-states contract §1 and §2 (the contract file stays spec 016's; the amendment is recorded here and in tasks T006).
- The adapters (chase-adapters.ts) per R-06.

## 5. Files expected to touch

The implementer merges this branch first. Expected:

- New: `apps/web/src/room/scene/chase-steer.ts`, `scene/chase.ts`, `scene/chase-adapters.ts`.
- Changed: `apps/web/src/room/scene/twin-states.ts` (state, activity, clip roles if 019 hasn't), `scene/walking.ts` or `scene.ts` (the director's frame call, one line each), `scene/avatars.ts` (only if the twin/dog driver hook isn't exposed by 019/020), `room/text-copy.ts` (two strings), `build/room/schema.ts` (optional `figures.chase`), the room's scene data file that carries `figures` (found at implementation; not a human-only path, else it becomes a patch, see §7).
- New tests: `apps/web/test/room/chase-steer.test.ts`, `chase-director.test.ts`, `chase-degraded.test.ts`, `chase-notes.test.ts`, `chase-states.test.ts`, `chase-adapters.test.ts`, `chase-bench.test.ts`. Changed: `twin-states.test.ts` (adds the new state; the existing cases stay).
- Docs: `docs/dashboards` panel description (if one exists for the figures; located at implementation), `docs/merge-requests/<date>-feat-025-*.md`.
- Conflict watch: specs 019 to 021 also touch `twin-states.ts`, `figure.ts`, `avatars.ts`, `loader.ts`. This branch merges after them, in the order 019, 020, 021, 025; the adapter exists so those files need only the small edits above.

## 6. Test plan (small tests first; rule 4)

| Test file | Covers | Run |
|---|---|---|
| `chase-steer.test.ts` | R-02, R-03, FR-004 to FR-008, SC-001 | `vitest run apps/web/test/room/chase-steer.test.ts` |
| `chase-director.test.ts` | FR-001 to FR-003, FR-009, FR-018, SC-002 | likewise |
| `chase-degraded.test.ts` | FR-013 to FR-015, SC-003 | likewise |
| `chase-notes.test.ts` | FR-016, SC-006 | likewise |
| `chase-states.test.ts`, `twin-states.test.ts` | FR-010, FR-011, SC-004 | likewise |
| `chase-adapters.test.ts` | R-06 | likewise |
| `chase-bench.test.ts` | FR-019, SC-005 | likewise |

`make lint` after each task. The full `make check` runs once, at the end of the stack, by one task (the Author's rule 4), not by this one.

## 7. Human-only paths

None expected: `docs/merge-requests/human-patches/025.md` says so, and names the one case: if the scene's data file that carries `figures` turns out to sit under a denied path, its `figures.chase` block (§3) becomes a plain-copy patch for the Author's hand, "not on main before the gate".

## 8. Validation

Run the §6 files, `make lint`; the Author's look at the run (SC-007), at lookdev with the three models in.

## 9. Order

Implementation runs on one line after 019, 020, 021 are on it: this branch merges first for its artifacts, then T001 onward.
