# Tasks: Avatar Walking Legs

**Input**: [plan.md](plan.md), [spec.md](spec.md)

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

**Reworked on 2026-11-14** (rule 6's Opus reviews rv-spec-019 and review-019, neither blocking) by the Author's answers to Q61 to Q63 on the morning page, each "Answered: recommended, the Author 2026-11-13." (spec.md Q6 to Q8): T013 to T020 below, appended after T012 and done before it (Dependencies). T001 to T010 stay checked; where the rework changes what they built, a new task does it.

**Small sets** named once here, every path under `apps/web/`:
- *the gait set*: `test/room/gait.test.ts test/room/gait-rig.test.ts test/room/avatar-gait.test.ts` (and `test/room/gait-alloc.test.ts` once T017 adds it);
- *the controller set*, every test that imports `src/room/scene/avatars.ts`: `test/room/avatar-driver.test.ts test/room/avatar-handoff.test.ts test/room/avatar-hands.test.ts test/room/avatar-scene.test.ts test/room/avatars.test.ts test/room/twin-faults.test.ts test/room/twin-figure.test.ts test/room/twin-handoff.test.ts test/room/twin-network.test.ts test/room/twin-reach.test.ts`;
- *the signal set*, the tests that read the frame log through `app.ts` and `signals/frame-log.ts`: `test/ui/avatars.test.ts test/room/live.test.ts test/ui/loading-degraded.test.ts` (the last added in the rework, by rv2-impl-019's nit).

**Tests**: required, RED then GREEN, one commit each (Principle II). Every task runs only its own small tests, from `apps/web` (`vitest run <files>`), plus `make lint`, and pastes both into its notes (the order's rule 4). The full `make check` runs once, at the stack's end (T012).

**Rules for every task**: no edit to `.claude/**`, CLAUDE.md, REVIEW.md, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`, `assets/**`, `assets/policy/**`. A save-point commit before each step. The implementer doesn't review; a reviewer who didn't write the code does (T011). Test paths below are under `apps/web/`.

## Phase 1: Fixture

- [x] T001 [US1] Add an opt-in `legs` option to the fixture rig in `test/helpers/glb.ts` (near line 1174) that adds the six leg bones, `mixamorig:LeftUpLeg`, `LeftLeg`, `LeftFoot`, and the right three, under `Hips`, at plausible rest offsets; the default rig stays byte-identical. Small tests: `vitest run test/room/avatar-driver.test.ts test/room/avatar-hands.test.ts test/room/avatar-loader.test.ts` (they use the rig and must not change).

## Phase 2: The pure gait (US1, FR-002 to FR-004, FR-010)

- [x] T002 [P] [US1] RED `test/room/gait.test.ts`: `cycleLength(h)` = 0.7·h; `advance` adds distance/cycle mod 1 and never time; amp eases to `min(1, share)` in `EASE_S` and out to 0; dt clamped to `DT_MAX_S`; `legOffsets` has the legs half a cycle apart, knees never negative, every angle within its constant, zero at amp 0; a seeded 10,000-frame walk is identical on two runs (SC-001); N cycles' distance advances phase by N (SC-003). Small test: `vitest run test/room/gait.test.ts`.
- [x] T003 [US1] GREEN `src/room/scene/gait.ts`, the pure part (§2.1). Small test: `vitest run test/room/gait.test.ts`.

## Phase 3: The rig and the applier (US1, US2, FR-005, FR-006, FR-008)

- [x] T004 [P] [US1] RED `test/room/gait-rig.test.ts`: from the real `assets/visitors/man/man.glb` and `woman/woman.glb`, read the GLB's JSON chunk and build the leg chain from its node data (translation, rotation, scale; no textures, no renderer); `findLegRig` finds the six bones on both (spec.md Assumptions); a positive hip offset moves the ankle toward +z and a positive knee offset bends the shin backward (R-07), asserted for each leg on its own; a model missing one bone gives `null`. Small test: `vitest run test/room/gait-rig.test.ts`. (Rework: as built, the sign is asserted on the left leg only; T013 adds the right's.)
- [x] T005 [US1] GREEN `findLegRig`, `applyGait`, `clearGait` in `src/room/scene/gait.ts` (§2.2), with the base/applied tracking; the axis and sign are those T004 fixes. Adds to T004's test a residue case: after `clearGait`, every bone equals the clip's rotation to 1e-9 (SC-002), also after a frame the mixer didn't write. Small tests: `vitest run test/room/gait-rig.test.ts test/room/gait.test.ts`.

## Phase 4: The controller (US1, US2, FR-001, FR-007, FR-008, FR-009)

- [x] T006 [US1] [US2] RED `test/room/avatar-gait.test.ts`, over the fixture room and the `legs` rig, as `avatar-driver.test.ts` does: over a seeded walk the legs differ from the clip's pose while walking and equal it after the ease-out; the holding hand, arms, spine, and head never differ (FR-005); no gait under reduced motion, paused, hidden, or level 1 (FR-009); no gait while `take` plays; a model without leg bones slides and emits one `gait` signal (FR-008); a loaded `walk` clip plays with `timeScale` = clamp(speed/speed_mps, 0.5, 1.5) and no gait (FR-007; the time scale is dropped by Q8, T016); a fallback or swap mid-walk leaves no residue (FR-006). Small test: `vitest run test/room/avatar-gait.test.ts`.
- [x] T007 [US1] [US2] GREEN `src/room/scene/avatars.ts`: the wiring of plan §2.3 (leg rig on ready, distance from the pose, `update` after the mixer, the gates, `clearGait` on fallBack, swap, and `rest`, the walk clip's time scale, dropped by Q8 in T016), `src/room/stage.ts`'s `FigureSignal` type (`gait`), `src/room/signals/frame-log.ts`'s event kind `gait`, and `src/room/app.ts`'s record of it in the frame log. Small tests: `vitest run test/room/avatar-gait.test.ts test/room/avatar-driver.test.ts test/room/avatars.test.ts test/room/stage-walk.test.ts`. (Rework: those runs didn't cover `frame-log.ts` and `app.ts`, nor every importer of `avatars.ts`: they should have included `test/room/live.test.ts` and `test/ui/loading-degraded.test.ts`, rv2-impl-019's nit; T016, T018 run the gait, controller, and signal sets, which do, and they passed.)
- [x] T008 [US2] Amend `test/room/avatar-driver.test.ts`'s expectations that an avatar with no walk clip slides, so they hold for a model without leg bones, and add the fixture with legs, where the legs move (spec 009's FR-028 amended). Small test: `vitest run test/room/avatar-driver.test.ts`.

## Phase 5: Look and docs (US3)

- [ ] T009 [P] [US3] **Dropped, not done** (plan §2.5's note: lookdev's hands page drives its own mixer, not the room's controller); P3. `src/lookdev/*`: a "walk" pose that drives `driver.frame` with a synthetic walking pose, if its structure allows it in a few lines (plan §2.4). Small tests: `vitest run test/lookdev/page.test.ts test/lookdev/builds.test.ts`.
- [x] T010 [P] Docs: a short note in `apps/web/README.md` (what the gait is, the constants and where to tune them, that a studio `walk` clip takes precedence); spec 009's amendment is recorded in this spec already. Small test: `vitest run test/smoke.test.ts` and the repository's docs check that `make lint` runs.

## Phase 6: Review and the full suite

- [ ] T011 A reviewer who didn't write the code reviews the diff against REVIEW.md, spec.md, and plan.md, and the constitution check; a failure goes back to a fix task, with no test file edited in a fix. Its notes list SC-001 to SC-004 each as met or not.
- [ ] T012 The one full `make check` of the night's stack, run by the stack's last task, not by this stack's tasks one by one; its output goes into the stack's merge-request note in `docs/merge-requests/` with SC-004's chunk size from `make build` (`BUILD OK`) and `make lint`. A failure in a test this stack doesn't touch is reported with the evidence (passes alone; the stack doesn't touch it), not chased; `test/room/twin-2d.test.ts` is known flaky under load.

## Phase 7: The rework, by the Author's answers to Q61 to Q63 (2026-11-14)

Each task is RED then GREEN, one commit each, runs only its small runs plus `make lint`, and pastes both into its notes. The code goes on this spec's line (impl-019's branch); a departure from plan §2.6 to §2.8 is written into plan.md in the same commit.

- [x] T013 [US1] The flexion sign per leg (R-07, plan §3): in `test/room/gait-rig.test.ts`, the right leg's check beside the left's, on both real models: a positive hip offset moves the right ankle toward +z, and a positive knee offset bends the right shin backward. Expected to pass at once (`applyGait` turns both sides alike); if it fails, the fix is a per-side sign in `src/room/scene/gait.ts`, recorded in plan §2.5. Small test: `vitest run test/room/gait-rig.test.ts`.
- [x] T014 [US1] [US2] RED, the hips lowered by the standing leg's lift (Q7; FR-005, FR-006, FR-008, FR-015, SC-002, SC-006; plan §2.6):
  - `test/room/gait.test.ts`: `standingLift(offsets, thighM, shinM)` is 0 at amplitude 0, never negative, the smaller of the two legs' lifts by plan §2.6's formula, `(thigh + shin)(1 − cos θ)` for straight legs at hip angle θ, and the same on two runs of a seeded walk.
  - `test/room/gait-rig.test.ts`: on the real man and woman, `findLegRig` also finds `mixamorigHips` and gives a model without it `null`; its thigh and shin lengths match the GLBs' node data; SC-006: at each model's room height (`AVATAR_SHAPES`), through one cycle at amplitude 1 in 1/64 steps, with the lowering, the lower ankle's height in the instance root's frame is within 2 cm of its standing height, and without the lowering it rises more than 2 cm (the control); after `clearGait` the hips bone's position equals the clip's to 1e-9, also when the mixer wrote it between two `applyGait`s.
  - `test/room/avatar-gait.test.ts`: while walking, the hips bone's position differs from the clip's only along the avatar's down, and its rotation and every bone above it (spine, arms, the holding hand, head) equal the clip's (FR-005 as amended); after `rest()` or a fallback mid-walk the hips' position is the clip's (FR-006).
  - Small test: `vitest run` the gait set. RED: the new cases fail, the others pass.
- [x] T015 [US1] [US2] GREEN, the hips (plan §2.6): `standingLift`; `findLegRig` with the hips bone, the measured thigh and shin, and the avatar's down in the hips bone's parent space; `applyGait(rig, offsets, lift)` with base/applied tracking on the hips' position; `clearGait` giving it back; `stepGait` in `src/room/scene/avatars.ts` passing the lift. Reword `gait.ts`'s "feet don't skate" and `apps/web/README.md`'s gait section ("Nothing above the hips moves", "feet don't skate") to what the code gives (plan §2.6's last item). Small tests: `vitest run` the gait set and the controller set, and `vitest run test/smoke.test.ts` for the README.
- [x] T016 [US2] The walk clip's time scale removed (Q8; FR-007; plan §2.3, R-09): RED, `test/room/avatar-gait.test.ts`'s FR-007 case: a loaded `walk` clip plays at its own speed, `clipScale("visitor")` 1 at half and at one and a half times `walking.speed_mps`, with no gait; GREEN, `src/room/scene/avatars.ts`'s `update` sets no `timeScale`, and the README's line on it goes. `clipScale` stays (plan §2.5). Small tests: `vitest run` the gait set, the controller set, and the signal set (it also covers T007's `frame-log.ts` and `app.ts`), and `test/smoke.test.ts`.
- [x] T017 [US1] RED, no allocation in a frame's gait (Q6; FR-011, SC-007; plan §2.7): new `test/room/gait-alloc.test.ts`: with an `out`, `advance` and `legOffsets` return it, its `left` and `right` the same objects frame after frame, values equal to the fresh-object calls'; the gc count over 200,000 frames of `advance` → `legOffsets` → `standingLift` → `applyGait` (and `clearGait` every tenth) on the fixture rig with legs is at most one minor collection, and the control loop that makes one `{}` a frame counts several; through the controller, `driver.frame` then `update` with the gait on counts no more minor collections than with a model without leg bones, within one. Small test: `vitest run test/room/gait-alloc.test.ts`. (As built: the gc count, then a heap-growth measure, couldn't tell an object from V8's boxed numbers; plan §2.7's escape hatch: the identity checks stand, with the controller's objects read through `gaitFrame()` and the applier's source checked for array literals.)
- [x] T018 [US1] GREEN, no allocation (plan §2.7): the optional `out` on `advance` and `legOffsets`; `applyGait` and `clearGait` with no array literal; in `src/room/scene/avatars.ts`, `gait.state`, `gait.offsets`, and `gait.last` (`{ x, z }` with `has`) made once and written in place by `driver.frame` and `stepGait`, `resetGait` included. Small tests: `vitest run` the gait set (with `gait-alloc.test.ts`), the controller set, and the signal set.
- [x] T019 SC-004 measured (plan §2.8): the web app's build at this line's tip and at impl-018's tip (b9378980), the same way; the 3D chunk's gzip bytes from Vite's report at each, and the difference, written into plan §2.8 and the stack note. Over 2 KB is a fix task, not a change to SC-004. No test run beyond `make lint`.
- [ ] T020 A reviewer who didn't write T013 to T019 reviews their diff against REVIEW.md, spec.md (Q6 to Q8, FR-005, FR-007, FR-011, FR-015, SC-006, SC-007), and plan §2.6 to §2.8; a blocking finding goes back to a fix task on this branch, with no test file edited in a fix.

## Dependencies

T001 → T006. T002 → T003 → T005 → T007. T004 → T005. T006 → T007 → T008. T009 and T010 after T007. T011 after T010.
Rework: T013 → T014 → T015 → T016. T017 → T018, after T016 (both edit `avatars.ts`'s `stepGait` and `gait.ts`'s signatures). T019 after T018. T020 after T019. T012 last, after T020: the stack's one full `make check`.

## After this stack, for the Author

His look approval of the gait on the real models, in the room (SC-005), now with the hips' lowering; his confirmation or overturn of Q1 to Q5 on the morning page (Q6 to Q8 are his answers already); a studio `walk` clip, if he wants one, by his intake and the studio's tools list (P-7).
