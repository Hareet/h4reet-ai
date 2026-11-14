# Tasks: Avatar Walking Legs

**Input**: [plan.md](plan.md), [spec.md](spec.md)

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

**Tests**: required, RED then GREEN, one commit each (Principle II). Every task runs only its own small tests, from `apps/web` (`vitest run <files>`), plus `make lint`, and pastes both into its notes (the order's rule 4). The full `make check` runs once, at the stack's end (T012).

**Rules for every task**: no edit to `.claude/**`, CLAUDE.md, REVIEW.md, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`, `assets/**`, `assets/policy/**`. A save-point commit before each step. The implementer doesn't review; a reviewer who didn't write the code does (T011). Test paths below are under `apps/web/`.

## Phase 1: Fixture

- [ ] T001 [US1] Add an opt-in `legs` option to the fixture rig in `test/helpers/glb.ts` (near line 1174) that adds the six leg bones, `mixamorig:LeftUpLeg`, `LeftLeg`, `LeftFoot`, and the right three, under `Hips`, at plausible rest offsets; the default rig stays byte-identical. Small tests: `vitest run test/room/avatar-driver.test.ts test/room/avatar-hands.test.ts test/room/avatar-loader.test.ts` (they use the rig and must not change).

## Phase 2: The pure gait (US1, FR-002 to FR-004, FR-010)

- [ ] T002 [P] [US1] RED `test/room/gait.test.ts`: `cycleLength(h)` = 0.7·h; `advance` adds distance/cycle mod 1 and never time; amp eases to `min(1, share)` in `EASE_S` and out to 0; dt clamped to `DT_MAX_S`; `legOffsets` has the legs half a cycle apart, knees never negative, every angle within its constant, zero at amp 0; a seeded 10,000-frame walk is identical on two runs (SC-001); N cycles' distance advances phase by N (SC-003). Small test: `vitest run test/room/gait.test.ts`.
- [ ] T003 [US1] GREEN `src/room/scene/gait.ts`, the pure part (§2.1). Small test: `vitest run test/room/gait.test.ts`.

## Phase 3: The rig and the applier (US1, US2, FR-005, FR-006, FR-008)

- [ ] T004 [P] [US1] RED `test/room/gait-rig.test.ts`: from the real `assets/visitors/man/man.glb` and `woman/woman.glb`, read the GLB's JSON chunk and build the leg chain from its node data (translation, rotation, scale; no textures, no renderer); `findLegRig` finds the six bones on both (spec.md Assumptions); a positive hip offset moves the ankle toward +z and a positive knee offset bends the shin backward (R-07); a model missing one bone gives `null`. Small test: `vitest run test/room/gait-rig.test.ts`.
- [ ] T005 [US1] GREEN `findLegRig`, `applyGait`, `clearGait` in `src/room/scene/gait.ts` (§2.2), with the base/applied tracking; the axis and sign are those T004 fixes. Adds to T004's test a residue case: after `clearGait`, every bone equals the clip's rotation to 1e-9 (SC-002), also after a frame the mixer didn't write. Small tests: `vitest run test/room/gait-rig.test.ts test/room/gait.test.ts`.

## Phase 4: The controller (US1, US2, FR-001, FR-007, FR-008, FR-009)

- [ ] T006 [US1] [US2] RED `test/room/avatar-gait.test.ts`, over the fixture room and the `legs` rig, as `avatar-driver.test.ts` does: over a seeded walk the legs differ from the clip's pose while walking and equal it after the ease-out; the holding hand, arms, spine, and head never differ (FR-005); no gait under reduced motion, paused, hidden, or level 1 (FR-009); no gait while `take` plays; a model without leg bones slides and emits one `gait` signal (FR-008); a loaded `walk` clip plays with `timeScale` = clamp(speed/speed_mps, 0.5, 1.5) and no gait (FR-007); a fallback or swap mid-walk leaves no residue (FR-006). Small test: `vitest run test/room/avatar-gait.test.ts`.
- [ ] T007 [US1] [US2] GREEN `src/room/scene/avatars.ts`: the wiring of plan §2.3 (leg rig on ready, distance from the pose, `update` after the mixer, the gates, `clearGait` on fallBack, swap, and `rest`, the walk clip's time scale), and `src/room/stage.ts`'s `FigureSignal` type (`gait`). Small tests: `vitest run test/room/avatar-gait.test.ts test/room/avatar-driver.test.ts test/room/avatars.test.ts test/room/stage-walk.test.ts`.
- [ ] T008 [US2] Amend `test/room/avatar-driver.test.ts`'s expectations that an avatar with no walk clip slides, so they hold for a model without leg bones, and add the fixture with legs, where the legs move (spec 009's FR-028 amended). Small test: `vitest run test/room/avatar-driver.test.ts`.

## Phase 5: Look and docs (US3)

- [ ] T009 [P] [US3] [P3, may be dropped with a note] `src/lookdev/*`: a "walk" pose that drives `driver.frame` with a synthetic walking pose, if its structure allows it in a few lines (plan §2.4). Small tests: `vitest run test/lookdev/page.test.ts test/lookdev/builds.test.ts`.
- [ ] T010 [P] Docs: a short note in `apps/web/README.md` (what the gait is, the constants and where to tune them, that a studio `walk` clip takes precedence); spec 009's amendment is recorded in this spec already. Small test: `vitest run test/smoke.test.ts` and the repository's docs check that `make lint` runs.

## Phase 6: Review and the full suite

- [ ] T011 A reviewer who didn't write the code reviews the diff against REVIEW.md, spec.md, and plan.md, and the constitution check; a failure goes back to a fix task, with no test file edited in a fix. Its notes list SC-001 to SC-004 each as met or not.
- [ ] T012 The one full `make check` of the night's stack, run by the stack's last task, not by this stack's tasks one by one; its output goes into the stack's merge-request note in `docs/merge-requests/` with SC-004's chunk size from `make build` (`BUILD OK`) and `make lint`. A failure in a test this stack doesn't touch is reported with the evidence (passes alone; the stack doesn't touch it), not chased; `test/room/twin-2d.test.ts` is known flaky under load.

## Dependencies

T001 → T006. T002 → T003 → T005 → T007. T004 → T005. T006 → T007 → T008. T009 and T010 after T007. T011 after T010. T012 last.

## After this stack, for the Author

His look approval of the gait on the real models (SC-005); his confirmation or overturn of Q1 to Q5 on the morning page; a studio `walk` clip, if he wants one, by his intake and the studio's tools list (P-7).
