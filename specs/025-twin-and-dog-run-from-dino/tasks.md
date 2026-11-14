---
description: "Task list for spec 025, the twin and the dog run from the dinosaur"
---

# Tasks: The Twin and the Dog Run From the Dinosaur

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

His item: "8. h) "twin and dog running from dino". Needs c, d, and e." And: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over".

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Prerequisites**: specs 019, 020, 021 on the line (plan §9); this branch merged first.

**Tests**: required, test-first: each RED task's tests are written and seen to fail before its GREEN task. A task runs only the test files it names, plus those covering files it changes (`vitest run <files>`), and `make lint`, and pastes them into its notes. The full `make check` runs once, in T013. No test file is edited in a fix task except by the task that owns it.

**Rules for every task**: no edit to `.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, `corpus/**`, `tools/gates/**`, `evals/agent-config/**`, `redteam/forbidden-actions.sh`, `assets/**`, `assets/policy/**`; a departure from the plan updates `plan.md` in the same commit. The implementer never reviews.

## Phase 1: Core (pure, no three.js)

- [ ] T001 [US1] RED: write `apps/web/test/room/chase-steer.test.ts`: flee direction, corner escape, obstacle slide, dead band, speed rule, SAFE_M property over seeded 600-frame runs (open, corner, obstacle), separation between twin and dog. Small test: `vitest run apps/web/test/room/chase-steer.test.ts`.
- [ ] T002 [US1] GREEN: `apps/web/src/room/scene/chase-steer.ts` (R-02, R-03; FR-004 to FR-008). Small test: the same file as T001, plus `vitest run apps/web/test/room/movement.test.ts` (it reuses `step`/`slide`).
- [ ] T003 [US4] RED: extend `apps/web/test/room/twin-states.test.ts` with the `fleeing` state (precedence first, timers kept running, answering resumes after) and write `chase-states.test.ts`. Small test: both files.
- [ ] T004 [US4] GREEN: `scene/twin-states.ts`: `fleeing`, `{kind:"flee"}` activity, `walk`/`run` roles unless 019 added them (R-04; FR-010, FR-011). Small test: T003's files plus `vitest run apps/web/test/room/twin-2d.test.ts apps/web/test/room/twin-handoff.test.ts` (they import the lists; the first is flaky under load, rerun it alone before reporting a failure).

## Phase 2: Director and adapters

- [ ] T005 [US1] RED: `apps/web/test/room/chase-director.test.ts`: start on presence, end after the delay, a flicker inside the delay continues (FR-003), return home, clip by speed with the run-clip fallback (FR-009), the `room.chase` record (FR-018), SC-002. Small test: that file.
- [ ] T006 [US1] GREEN: `scene/chase.ts` (R-01, R-08). Includes recording the twin-states contract's amendment in this plan's §4 (already there; update on departure). Small test: T005's file.
- [ ] T007 [US2] RED: `chase-degraded.test.ts`: each of dinosaur, dog, twin walking clip missing, failing, loading; reduced motion; paused; 2D; lost context; no exception (FR-013 to FR-015, SC-003). Small test: that file.
- [ ] T008 [US2] GREEN: the missing-piece and motion handling in `scene/chase.ts` (R-05). Small test: T007's file and T005's.
- [ ] T009 [US3] RED+GREEN: `chase-notes.test.ts` then the two strings in `room/text-copy.ts` and the once-per-start-and-end notes in `chase.ts` (R-07; FR-016, SC-006). Small test: `vitest run apps/web/test/room/chase-notes.test.ts apps/web/test/room/text.test.ts`.

## Phase 3: Wiring, data, schema

- [ ] T010 [US1] RED+GREEN: `chase-adapters.test.ts` then `scene/chase-adapters.ts` (R-06): fakes of A019 to A021 first; the one place that names the real ones. Small test: that file.
- [ ] T011 [US1] The optional `figures.chase` block in `build/room/schema.ts` and the scene data (§3, R-09), the director's one-line frame call from the walking view (plan §5). Small test: `vitest run apps/web/test/room/schema.test.ts apps/web/test/room/data-only.test.ts apps/web/test/room/scene.test.ts`. If the data file is under a denied path, write the patch (plan §7) and stop at the schema.
- [ ] T012 [US1] Integration with the real 019 to 021 code: replace the fakes in the adapters' test with the real drivers' shapes; one test that runs the director over a real twin driver and a real dog driver with a stubbed dinosaur. Small test: `chase-adapters.test.ts`, `chase-director.test.ts`. If any of the three isn't on the line, record the gap in the notes and stop here; T013 still runs.
- [ ] T013 Perf and the one full run: `chase-bench.test.ts` (FR-019, SC-005; `vitest run` that file), the dashboard panel's description (docs), the merge-request note `docs/merge-requests/<date>-feat-025-twin-and-dog-run-from-dino.md`; then the stack's one `make check`, pasted in whole, with any failure outside this stack's files reported with its evidence (passes alone; not touched), not chased.

## Phase 4: Review and the Author

- [ ] T014 A reviewer that did not write the code reviews against `REVIEW.md`, the spec, and the plan.
- [ ] T015 The Author's: the look at the run (SC-007), the placeholders (§3), the six answers on the morning page; merge. Not a worker's.

## Dependencies

T001 → T002; T003 → T004; T002 and T004 → T005 → T006 → T007 → T008; T006 → T009; T006 → T010 → T011 → T012 → T013 → T014 → T015. T001 and T003 are parallel; so are T009 and T010 after T006.
