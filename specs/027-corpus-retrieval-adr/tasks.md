# Tasks: When the Twin's File Context Stops Being Enough (Corpus Retrieval ADR)

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> And if you finish early, I want you to continue for all the remaining items through to implmeentation and merging and choose your recommendations. Keep goign! You got this!

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His answer to the morning page (2026-11-13):

> We want the agents to continue with their reocmmendation and go through to implementation and then testing and then integration and merging

**Input**: [plan.md](plan.md), [spec.md](spec.md), [ADR 0054](../../docs/adr/0054-when-file-context-stops-being-enough.md). **Tests**: required, written first, RED then GREEN, one commit each. A save point per task: `git commit -m "wip(spec-027): T0nn"`.

**Rules for every task** (the order's rule 4): run only the test files the task adds or changes, plus those covering the files it changes, and `make lint`; paste them into the task's notes. The full `make check` runs once, at the end of the stack, by one task the supervisor names, and goes in the stack's merge-request note. A failure in a test this stack doesn't touch is reported with the evidence (it passes alone; the stack doesn't touch it), not chased. `apps/web/test/room/twin-2d.test.ts` is flaky under load. No human-only path is written (`corpus/**`, `config/budgets.yaml`, `.claude/**`, and the rest main's settings deny); this spec needs none (`docs/merge-requests/human-patches/027.md`).

**The small tests** (plan §5), run in `apps/web`: `npx vitest run test/corpus-size.test.ts` (with `test/twin-pack.test.ts` where a task says so). Every `apps/web` vitest run makes the workspace's two site builds first; that is per run, not per file.

## Phase 0: the Author's answers

- [ ] T000 The Author confirms or overturns Q1 to Q8 on the morning page (`/night/io/out/questions.md`). Overturned Q1 or Q3: a stage-1 spec replaces T002 to T004's scope before he merges; overturned Q2, Q4, Q6, Q7, or Q8: T002, T003, and T005 are reworked to the new answer. Not a blocker for T001 to T007.

## Phase 1: Setup

- [ ] T001 Merge `night/spec-027/spec-027` onto the line after item h (spec 025). Record in the task's notes what moved since 3c0e4cd0 in what the record measures: `git diff --stat 3c0e4cd0 -- corpus/ config/twin/ config/budgets.yaml` (expected: nothing, since spec 022 delivers a patch, not a corpus change). Tests: none (no code); `make lint`.

## Phase 2: User Story 2, the record (P1), test-first

- [ ] T002 [US2] Write `apps/web/test/corpus-size.test.ts` with every case of plan §5 (fresh, deterministic, room parity, T1 boundary, not selectable, T2 boundary, T3 boundary, defaults, reads only, words), building fixture packs as `TwinPack` objects and a fixture `PackReader`. RED (no module). Covers FR-008 to FR-012; SC-002. Tests: `npx vitest run test/corpus-size.test.ts` (expected to fail); `make lint`.
- [ ] T003 [US2] [US3] Write `apps/web/build/corpus-size.ts` (plan §4: `THRESHOLDS`, `RECORD_PATH`, `measureFiles`, `measurePack`, `stageOf`, `buildRecord`, `recordJson`, `main`), importing from `./twin-pack.ts` only what plan §4 lists, and changing nothing in `twin-pack.ts`. GREEN for every case but "fresh". Covers FR-008 to FR-011; US3's scenarios. Tests: `npx vitest run test/corpus-size.test.ts test/twin-pack.test.ts`; `make lint`.
- [ ] T004 [US2] Set `apps/web/package.json`'s `"twin:pack"` to `"node --import tsx build/twin-pack.ts && node --import tsx build/corpus-size.ts"`. Run `npm run twin:pack -w apps/web`; commit `docs/corpus-size.json`. Confirm `git diff --exit-code -- config/twin/ evals/product/cases/` (the pack and the cases didn't move: SC-004, FR-013) and paste the command's stdout and stderr (expected at 3c0e4cd0's figures: T1 in band for mission and for hobbies and travel, stage 0). Covers FR-008, FR-012, FR-013; SC-004. Tests: `npx vitest run test/corpus-size.test.ts test/twin-pack.test.ts` (now all GREEN); `make lint`.

## Phase 3: User Story 1, the ADR (P1)

- [ ] T005 [US1] Finalize ADR 0054's figures from `docs/corpus-size.json`: every figure in "Today's corpus, measured", Decision 1's and Decision 2's figures (the "Today" column included), Alternatives' and Consequences' figures, and the index row in `docs/adr/README.md`. Where the record differs from the replica's figure, the ADR takes the record's, and plan §9 records each difference. Rerun the ADR's two shell commands and paste their output; their totals must equal the record's `files`. Covers FR-001 to FR-007, FR-014; SC-001. Tests: `npx vitest run test/corpus-size.test.ts` (the record the ADR cites is fresh); `make lint`.

## Phase 4: Review and hand-off

- [ ] T006 Review by a worker that didn't write T002 to T005 (the reviewer role; Opus re-reviews what Sonnet wrote, rule 6), against `REVIEW.md`, spec.md, plan.md, ADR 0054, and the constitution. Findings are fixed by the implementer, with the same small tests rerun. Covers every FR. Tests: the reviewer runs `npx vitest run test/corpus-size.test.ts` once to confirm GREEN.
- [ ] T007 The task's notes and the line's merge-request note: what was built, the small tests' output, the Q answers taken, the record's stage and its notes, that spec 022's patch regenerates the record (and may cross T1 for mission), and that no human-only path is touched. The full `make check` is the stack's last task, not this one. Tests: none new; `make lint`.

## Coverage

| Requirement | Tasks | Small test |
|---|---|---|
| FR-001 the ADR and its index row | drafted on the spec's branch; T005 | `test/corpus-size.test.ts` (fresh record) and T005's pasted commands |
| FR-002 the measured size, methods, commands | drafted; T005 | T005's pasted commands; fresh |
| FR-003 tokens as the gateway counts them | drafted; T005 | review (T006) |
| FR-004 the routed models' context | drafted | review (T006) |
| FR-005 why file context is enough | drafted | review (T006) |
| FR-006 T1, T2, T3 | drafted; T003 (constants) | T1, T2, T3 boundary cases |
| FR-007 how the corpus gains answers or questions | drafted | review (T006) |
| FR-008 the record, deterministic, reads only | T002, T003, T004 | deterministic; reads only |
| FR-009 the record's fields | T002, T003 | fresh; defaults |
| FR-010 the fit check's rendering | T002, T003 | room parity |
| FR-011 a crossing is a note | T002, T003 | T1 boundary (one note, exit 0) |
| FR-012 stale record fails, naming the command | T002, T004 | fresh |
| FR-013 nothing at run time changes | T004 | T004's `git diff --exit-code` |
| FR-014 quotes in their sources' words | drafted; T005 | review (T006) |
| SC-001 rerunnable figures | T005 | T005's pasted commands |
| SC-002 one character flips the stage | T002 | T1 boundary |
| SC-003 a small test | T002 | the run itself |
| SC-004 readiness hashes unchanged | T004 | T004's `git diff --exit-code` |

## Order

T000 runs on the Author's time. T001 → T002 → T003 → T004 → T005 → T006 → T007, one after another: each reads the one before it. Nothing here runs in parallel with another of this spec's tasks.
