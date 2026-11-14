---
description: "Task list for spec 025, the twin and the dog run from the dinosaur"
---

# Tasks: The Twin and the Dog Run From the Dinosaur

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

His item, the letter and the title in his words: h) "twin and dog running from dino". (His orders file numbers it 8 and notes "Needs c, d, and e."; those are the file's, not his words.) And: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over".

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Prerequisites**: specs 019, 020, 021, and 024 on the line (plan §9); this branch merged first.

**Tests**: required, test-first: each RED task's tests are written and seen to fail before its GREEN task. A task runs only the test files it names, plus those covering files it changes (`vitest run <files>`, `pytest <files>`), and `make lint`, and pastes them into its notes. The full `make check` runs once, in T016. No test file is edited in a fix task except by the task that owns it. `apps/web/test/room/twin-2d.test.ts` is flaky under load: rerun it alone before reporting a failure.

**Rules for every task**: no edit to `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`, `assets/**`, `assets/policy/**`; a departure from the plan updates `plan.md` in the same commit. The implementer never reviews. Paths below are under `apps/web/` unless they start otherwise.

## Phase 1: Core (pure, no three.js)

- [ ] T001 [US1] RED: write `test/room/chase-steer.test.ts`. It covers:
  - heading choice away from the dinosaur, the lookahead, a corner escaped, an obstacle slid, the dead band, and standing beyond `flee_m`;
  - the turn rate bounding the facing and not the step (FR-009);
  - separation between twin and dog.

  First, a case prints the room's composed floors (the visitor's and the chase floor: bounds, obstacles, `start`) for plan §3.1. Then the `safe_m` property in two clauses (FR-007, SC-001, Q11):
  - An adversarial pursuer (straight at the nearer figure, and seeded random turns) is moved by spec 008's movement at `walking.speed_mps` on the visitor's floor. It starts at `floor.start` and at 200 seeded walkable points of the visitor's floor, with seeded leaves and re-entries of the walking view that jump it to `floor.start`.
  - The figures start at their homes, and each start runs 600 frames.
  - This runs on the room's own floor (`floorOfPart` of the composed `scene.yaml`; the chase floor with the twin's obstacle filtered out) and on fake floors (open, a corner, an obstacle).
  - Each frame checks clause (a), a figure under `safe_m` after a start, a resume, or a jump never closer than the frame before until it reaches `safe_m`, and clause (b), a figure at or above `safe_m` never below it.

  Small test: `vitest run test/room/chase-steer.test.ts`.
- [ ] T002 [US1] GREEN: `src/room/scene/chase-steer.ts` (R-02, R-03; FR-004 to FR-009). Tune plan §3's defaults until both clauses hold on the room's floor, with `safe_m` never below 0.3 m. Record any change and the composed floor's exact numbers in plan §3.1. If the property can't hold at 0.3 m, stop and put the numbers on the page; the run waits for the Author (Q12). Small test: T001's file.
- [ ] T003 [US4] RED: extend `test/room/twin-states.test.ts` with `fleeing` (first in precedence, its clip `idle`, timers kept running, answering resumes after; `TWIN_CLIP_ROLES` unchanged) and write `test/room/chase-states.test.ts`. Change `test/room/bundle.test.ts`: the emitted twin block's `toEqual` (`:1403` on `fix-020`) gains `fleeing: "idle"`. Change `test/room/schema.test.ts`'s "RI8 over the twin block": `{ clips: { fleeing: "idle" } }` is refused at `figures.twin.clips.fleeing` (FR-011). Small test: the four files.
- [ ] T004 [US4] GREEN: `src/room/scene/twin-states.ts`: `fleeing`, the `flee` activity, `TWIN_CLIPS_DEFAULT.fleeing = "idle"`; no `walk` or `run` in `TWIN_CLIP_ROLES` (R-04; FR-011, FR-015). `build/room/checks/ri.ts`: RI8's `twinBlock` refuses `fleeing` as a key. `build/room/emit.ts` and `build/room/reach.ts` aren't changed (they loop over `TWIN_STATES`). Record the twin-states contract's amendment in plan §4 (already there; update on departure). Small test: T003's files, and those covering `twin-states.ts`, `ri.ts`, `emit.ts`, and `reach.ts`: `vitest run test/room/twin-2d.test.ts test/room/twin-handoff.test.ts test/room/twin-figure.test.ts test/room/twin-reach.test.ts test/room/twin-compose.test.ts test/room/bundle.test.ts test/room/schema.test.ts test/room/avatars-compose.test.ts test/room/stages-checks.test.ts test/ui/avatars.test.ts test/ui/hud-notes.test.ts test/ui/loading-notes.test.ts`.

## Phase 2: Director

- [ ] T005 [US1] RED: `test/room/chase-director.test.ts`: on only while the visitor is the dinosaur with its model shown in the walking view (FR-001); off for the woman, the man, the dog, and the dinosaur's cut-out; end after the delay; leaving and re-entering inside the delay continues (FR-003); return home at `walking.speed_mps`; `fleeing` on only while the twin moves (FR-012); the dog's clip by speed, `walk` at time scale 1 for a missing `run`, the dog held with neither (FR-010); SC-002. Small test: that file.
- [ ] T006 [US1] GREEN: `src/room/scene/chase.ts` (R-01). Small test: T005's file.
- [ ] T007 [US2] RED: `test/room/chase-degraded.test.ts`: the dinosaur's model missing, failing, loading; the dog's; a twin model without the leg bones or the hips bone, and the twin's capsule (FR-014: the twin held, the dog alone); reduced motion; paused; quality level 1; 2D; below the floor; lost context; reduced motion or quality level 1 beginning mid-run (figures cut back home) and a pause mid-run (figures stay, then walk back); no exception (FR-023, FR-024, SC-003). Small test: that file.
- [ ] T008 [US2] GREEN: the missing-piece, motion, and quality handling in `src/room/scene/chase.ts`. Small test: T007's file and T005's.
- [ ] T009 [US3] RED+GREEN: `test/room/chase-notes.test.ts` (once at start and end, by who moves; nothing when no figure moves or under reduced motion; FR-025, SC-006), then the six keys in `src/room/ui-keys.ts`, their words in `room/ui-words.yaml` and `test/fixtures/room/good/apps/web/room/ui-words.yaml`, the `chase` signal in `src/room/stage.ts`, the notes in `src/room/scene/chase.ts`, and the announcer's line in `src/room/app.ts` (R-07). Small test: `vitest run test/room/chase-notes.test.ts test/ui/text-copy.test.ts test/room/scene.test.ts test/room/vocabulary.test.ts test/ui/notes-causes.test.ts test/ui/a11y.test.ts`.

## Phase 3: The room's dog (spec 020's Q1 leaves it here)

- [ ] T010 [US5] RED: `test/room/dog-figure.test.ts`: with a fixture dog bundle (model, `idle`, `walk`, `run`, an approval's line) and `figures.dog`, the controller wants the dog for each of the four chosen avatars, shows it at its home `AVATAR_SHAPES.dog.height` tall (its `target`, through `instanceFor`) playing `idle`, not in the hand-off's wait; no `figures.dog` or no bundled dog: `wants.dog` null and nothing at its home; a failure: `failed` once, nothing at its home; the loader lists the dog's entries after the figures', once where the visitor chose the dog (FR-018, FR-019, FR-021). Change `test/room/likeness-line-anywhere.test.ts`: `ROOM_DOG` becomes the `"dog"` `FigureId`, and a case drives the line from the stage's dog picture signal through the room (FR-020, SC-007). Small test: both files.
- [ ] T011 [US5] GREEN: `src/room/stage.ts` (`FigureId`), `src/room/scene/avatars.ts` (the dog figure, R-10: its `target` `AVATAR_SHAPES.dog.height` through `instanceFor`; `place`, `clip`, and `missed` over `wanting()`, `both()` kept the hand-off's), `src/room/scene/loader.ts` (`figureEntries`), `src/lookdev/stage.ts` (its `figureEntries` call passes `dog: undefined`), `src/room/compose/bundle.ts` and `build/room/schema.ts` (`figures.dog`), and `room/scene.yaml`'s `figures.dog`. Its home is plan §3's estimate in the twin's corner, `[0.36, 0.55]`, marked `# estimated`; T011 may move it within R-09's checks. Small test: T010's files, and those covering the files changed: `vitest run test/room/schema.test.ts test/room/avatars-compose.test.ts test/room/avatar-driver.test.ts test/room/avatar-gait.test.ts test/room/avatar-handoff.test.ts test/room/avatar-hands.test.ts test/room/avatar-scene.test.ts test/room/avatars.test.ts test/room/dog-avatar.test.ts test/room/dog-line.test.ts test/room/dog-run.test.ts test/room/twin-faults.test.ts test/room/twin-figure.test.ts test/room/twin-handoff.test.ts test/room/twin-network.test.ts test/room/twin-reach.test.ts test/room/avatar-loader.test.ts test/room/bundle.test.ts test/room/loader.test.ts test/room/loading-progress.test.ts test/room/scene.test.ts test/room/highlight.test.ts test/room/data-only.test.ts test/room/standins.test.ts test/ui/degraded.test.ts test/ui/twin-loading.test.ts test/ui/loading-notes.test.ts test/lookdev/page.test.ts`.
- [ ] T012 [US5] RED+GREEN: `test/room/dog-first-visit.test.ts` (RK5 counts the room's dog's files once, with `figures.dog`, and not without it; the largest other visitor's share leaves the dog's folder out; the report names the dog's bytes; FR-022), then `build/room/checks/rk.ts` and `build/room/report.ts` (R-11). Small test: that file, and `vitest run test/room/avatars-compose.test.ts test/room/budgets.test.ts test/room/bundle.test.ts test/room/geometry.test.ts test/room/report.test.ts test/room/stages-checks.test.ts test/room/twin-compose.test.ts test/room/compose.test.ts`.

## Phase 4: Data and wiring

- [ ] T013 [US1] RED+GREEN: `test/room/chase-schema.test.ts`, then `build/room/schema.ts`, `src/room/compose/bundle.ts`, and `room/scene.yaml`'s `figures.chase` with plan §3's defaults (R-09). The test covers:
  - the optional `figures.chase`;
  - a run speed not above `walking.speed_mps + speed_margin_mps`, refused (FR-005);
  - in the shipped `scene.yaml`, each home (the twin's placement's position, `figures.dog.home.at`) at least `safe_m` from `floor.start`, and the dog's home walkable on the chase floor and at least `separation_m` from the twin's (Q11).

  `fleeing` in `figures.twin.clips` is T003's RI8 case, not this file's. Small test: that file, and `vitest run test/room/schema.test.ts test/room/avatars-compose.test.ts test/room/bundle.test.ts test/room/data-only.test.ts test/room/standins.test.ts test/room/scene.test.ts test/room/twin-compose.test.ts test/room/floor.test.ts`.
- [ ] T014 [US1] RED+GREEN: `test/room/chase-figures.test.ts` (the pursuer from the walking view's `on` and `pose`, the chosen avatar, and `shows("visitor")`, R-06; the twin's picture moves and its placement, pick area, and reach target stay, FR-017; the twin's gait advances by the distance moved and clears at the end, through `scene/gait.ts` unchanged, FR-013, with `cycleLength` at the twin's height in metres for both its own model, the measured height and never `OWN`, and the stand-in, `figures.twin_height`, R-05; the visitor's pose and floor untouched, FR-016; with a fetch spy and an event-sink spy, a whole run sends no request and no event, FR-027), then `src/room/scene/chase-figures.ts`, the per-figure gait and `pictureOf`/`legsOf` in `src/room/scene/avatars.ts` (R-05), and the frame call in `src/room/scene.ts`. Small test: that file, `vitest run test/room/gait.test.ts test/room/gait-rig.test.ts test/room/stage-walk.test.ts test/room/walking.test.ts`, and the `avatars.ts` set of T011.

## Phase 5: Docs, performance, and the one full run

- [ ] T015 [US5] Docs: `docs/data-flow-disclosure.md` row V1 (FR-028); `deploy/grafana/dashboards/h4-runtime.json`'s "Visits whose avatar failed" description and its case in `deploy/scripts/test_dashboard.py` (FR-026). Small test: `pytest deploy/scripts/test_dashboard.py evals/test_disclosure.py evals/test_docs_links.py`, `python3 -I evals/docs_links.py`, `vitest run test/disclosure.test.ts`.
- [ ] T016 Perf and the one full run: `test/room/chase-bench.test.ts` (FR-029, SC-005; `vitest run` that file), the merge-request note `docs/merge-requests/2026-11-14-feat-025-twin-and-dog-run-from-dino.md` (with the named deviation, Q10, the ADR it waits on if confirmed, Q13, the room's numbers, Q12, and the non-blocking findings), then the stack's one `make check`, pasted in whole, with any failure outside this stack's files reported with its evidence (passes alone; not touched), not chased.

## Phase 6: Review and the Author

- [ ] T017 A reviewer that did not write the code reviews against `REVIEW.md`, the spec, and the plan.
- [ ] T018 The Author's: the look at the run in the room's small floor and the dog's home (SC-008, Q12), the placeholders (plan §3), the thirteen answers on the morning page (Q10's deviation and Q13's ADR among them); merge. Not a worker's.

## Dependencies

T001 → T002; T003 → T004; T002 and T004 → T005 → T006 → T007 → T008; T006 → T009; T010 → T011 → T012; T011 → T013; T008, T009, T011, and T013 → T014 → T015 → T016 → T017 → T018. T001, T003, and T010 are parallel; so are T009 and T012.
