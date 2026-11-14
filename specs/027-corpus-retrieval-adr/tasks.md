# Tasks: When the Twin's File Context Stops Being Enough (Corpus Retrieval ADR)

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> And if you finish early, I want you to continue for all the remaining items through to implmeentation and merging and choose your recommendations. Keep goign! You got this!

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His answer to the morning page (2026-11-13):

> We want the agents to continue with their reocmmendation and go through to implementation and then testing and then integration and merging

**Reworked 2026-11-14** after the Opus review rv-spec-027 (blocking B1; I1 to I4; N1 to N4): T001 (the line's order, after item f), T002 and T003 (T1 per pack topic, the lead), T005 (the measurement's commit), T007 (both pending corpus patches), and a new T008 after T004 (Q145). Task IDs T001 to T007 keep their numbers so the review's references hold; the order is under "Order". Q144 and Q145 are taken under the orders file's rule ("Every question, new ones included: the recommended answer stands"), provisional.

**Reworked again 2026-11-14** after the Opus review rv-rework-spec-027 (not blocking): T005 takes the pending patches' final figures from T008's records and corrects each place they appear (I-1); T007 and T008 carry the figures from 026's patch at b12ac0ba (136; mission 1; hobbies and travel −7); T008 drops its order clause (nit 5) and says what it writes under `corpus/proposals/` (I-2); T000 adds Q157 (nit 3).

**Input**: [plan.md](plan.md), [spec.md](spec.md), [ADR 0054](../../docs/adr/0054-when-file-context-stops-being-enough.md). **Tests**: required, written first, RED then GREEN, one commit each. A save point per task: `git commit -m "wip(spec-027): T0nn"`.

**Rules for every task** (the order's rule 4): run only the test files the task adds or changes, plus those covering the files it changes, and `make lint`; paste them into the task's notes. The full `make check` runs once, at the end of the stack, by one task the supervisor names, and goes in the stack's merge-request note. A failure in a test this stack doesn't touch is reported with the evidence (it passes alone; the stack doesn't touch it), not chased. `apps/web/test/room/twin-2d.test.ts` is flaky under load. No human-only path is written (`corpus/**` outside `proposals/`, `config/budgets.yaml`, `.claude/**`, and the rest main's settings deny; under `corpus/proposals/`, only T008's recorded blob IDs and SHA-256s); this spec needs none (`docs/merge-requests/human-patches/027.md`).

**The small tests** (plan §5), run in `apps/web`: `npx vitest run test/corpus-size.test.ts` (with `test/twin-pack.test.ts` where a task says so). Every `apps/web` vitest run makes the workspace's two site builds first; that is per run, not per file.

## Phase 0: the Author's answers

- [ ] T000 The Author confirms or overturns Q1 to Q8, Q144, Q145, and Q157 on the morning page (`/night/io/out/questions.md`). Overturned Q1, Q3, or Q144: a stage-1 spec replaces T002 to T004's scope before he merges; overturned Q2, Q4, Q6, Q7, Q8, or Q157 (the lead in T1): T002, T003, and T005 are reworked to the new answer; overturned Q145: T008 is reworked or dropped. Not a blocker for T001 to T008.

## Phase 1: Setup

- [x] T001 Merge `night/spec-027/spec-027` (as reworked) onto the line after item f (spec 026), which follows item h (spec 025). Record in the task's notes what moved since 3c0e4cd0 in what the record measures: `git diff --stat 3c0e4cd0 -- corpus/ config/twin/ config/budgets.yaml` (expected: nothing but `corpus/proposals/`, since specs 022 and 026 deliver patches, not corpus changes), and which of the two pending corpus patches are on the line's tip: spec 022's `docs/merge-requests/2026-11-14-corpus-film-scripts.patch` and spec 026's `docs/merge-requests/<date>-corpus-dog-intro.patch` (plan §7; Q144). Tests: none (no code); `make lint`.

## Phase 2: User Story 2, the record (P1), test-first

- [x] T002 [US2] Write `apps/web/test/corpus-size.test.ts` with every case of plan §5 (fresh, deterministic, room parity with a two-file fixture topic, T1 boundary, not selectable, lead, T2 boundary, T3 boundary, defaults, reads only, words), building fixture packs as `TwinPack` objects and a fixture `PackReader`. RED (no module). Covers FR-008 to FR-012; SC-002. Tests: `npx vitest run test/corpus-size.test.ts` (expected to fail); `make lint`.
- [x] T003 [US2] [US3] Write `apps/web/build/corpus-size.ts` (plan §4: `THRESHOLDS`, `RECORD_PATH`, `measureFiles`, `measurePack` with `topics` per pack topic and `by_file` and `lead` as information, `stageOf` with T1 on `topics` alone, `buildRecord` with `model`, `recordJson`, `main`), importing from `./twin-pack.ts` only what plan §4 lists, and changing nothing in `twin-pack.ts`. GREEN for every case but "fresh". Covers FR-008 to FR-011; US3's scenarios. Tests: `npx vitest run test/corpus-size.test.ts test/twin-pack.test.ts`; `make lint`.
- [x] T004 [US2] Set `apps/web/package.json`'s `"twin:pack"` to `"node --import tsx build/twin-pack.ts && node --import tsx build/corpus-size.ts"`. Run `npm run twin:pack -w apps/web`; commit `docs/corpus-size.json`. Confirm `git diff --exit-code -- config/twin/ evals/product/cases/` (the pack and the cases didn't move: SC-004, FR-013) and paste the command's stdout and stderr (expected at 3c0e4cd0's figures: T1 in band for mission and for hobbies and travel, stage 0; the T1 band notes print after `twin:pack`'s own lines, and no fit note prints, since no topic is past the room). Covers FR-008, FR-012, FR-013; SC-004. Tests: `npx vitest run test/corpus-size.test.ts test/twin-pack.test.ts` (now all GREEN); `make lint`.

- [ ] T008 [US2] [US3] (after T004, before T005; Q145) On the line's tip, add `docs/corpus-size.json` to both pending corpus patches' regenerated sets, under spec 026's rule that the patch he applies second is rebuilt on the first (`docs/merge-requests/human-patches/026.md`, last paragraph). For each of spec 022's `docs/merge-requests/2026-11-14-corpus-film-scripts.patch` and spec 026's `docs/merge-requests/<date>-corpus-dog-intro.patch`: on a fresh plain export of the line's tip (`git archive`), apply the patch alone (`patch -p1 --dry-run`, then `patch -p1`), run `npm run twin:pack -w apps/web` there, and rebuild the patch from plain copies with `diff -u` (`a/`, `b/` labels), its regenerated set now holding `docs/corpus-size.json`; never `git apply`, never a write into a checkout's `corpus/`. Each patch is applied alone, on its own fresh plain export of the line's tip; the order the two are processed in doesn't matter. Update each proposal's recorded blob ID and SHA-256 where it records them (the only write under `corpus/`, and only under `corpus/proposals/`) (a refused write under `corpus/proposals/`: the proposal's fallback path under `docs/merge-requests/` where its spec names one, said in this task's notes; otherwise the refusal goes on the page under Interruptions, the order's rule 5). Add to `docs/merge-requests/human-patches/022.md` and `026.md` a row for `docs/corpus-size.json` (regenerated by `npm run twin:pack -w apps/web`, the same patch) and a line naming the stage its record shows and its notes (expected, from 026's patch read at `night/rework2-spec-026/rework2-spec-026`, b12ac0ba: spec 026's "stage 1 due", T1 crossed for hobbies and travel at −7, mission in band at 1 character, its `rules` 136 more than the line tip's; spec 022's, mission past T1 if its five lines' cost passes 137), and paste each record's `topics`, `base`, and `stage` into this task's notes for T005, and that the patch he applies second is rebuilt on the first and then carries the record of both. A patch not on the line's tip yet: noted in this task's notes; its own build, once 027's code is on the line, writes the record through `twin:pack`. Covers FR-008, FR-012; Q144, Q145. Tests: `npx vitest run test/corpus-size.test.ts` on each export (the record fresh there; "fresh" is the case that proves it), each patch's own checker as its spec names it (`python3 -m pytest -q scripts/corpus/test_film_claims.py`, `python3 -m pytest -q scripts/corpus/test_dog_intro_proposal.py`) where the rebuild changed its inputs; `make lint`.

## Phase 3: User Story 1, the ADR (P1)

- [ ] T005 [US1] Finalize ADR 0054's figures from `docs/corpus-size.json`: every figure in "Today's corpus, measured", Decision 1's and Decision 2's figures (the "Today" column included), Alternatives' and Consequences' figures, the leads' figures, and the index row in `docs/adr/README.md`. Where the record differs from the replica's figure, the ADR takes the record's, and plan §9 records each difference. Move "Measured on `main` at 3c0e4cd0" (the status line, "Today's corpus, measured", "How to rerun it", the routed models' table) to the line's commit that carries the check and its record (T004's, by its short hash), keeping 3c0e4cd0 only where it says the file figures were first taken there; "How to rerun it" says the two shell commands rerun at either commit, and `npm run twin:pack -w apps/web` only from the check's commit on. Rerun the ADR's two shell commands and paste their output; their totals must equal the record's `files`. Then the pending patches' figures (plan §7, "The projected figures are final only from T008's records"): take each from the record T008 measured on that patch's export (the `04` block's characters as the difference in `base.rules`, each topic's `margin`, the stage) and correct each place the projected figures appear before the line is named for his merge: ADR 0054's Decision 1 and Consequences; spec.md's Q144, Edge Cases, and Assumptions; plan §7 and R-3; this file's T007 and T008; `docs/merge-requests/human-patches/027.md`; analysis.md; notes.md. Each corrected figure names the record it comes from (the patch and the line's commit); a patch T008 couldn't build keeps its projected figures, marked as projected, with the commit of its spec that was read. Where a record differs from the projection, plan §9 records the difference. Covers FR-001 to FR-007, FR-014; SC-001; Q144. Tests: `npx vitest run test/corpus-size.test.ts` (the record the ADR cites is fresh); `make lint`.

## Phase 4: Review and hand-off

- [ ] T006 Review by a worker that didn't write T002 to T005 (the reviewer role; Opus re-reviews what Sonnet wrote, rule 6), against `REVIEW.md`, spec.md, plan.md, ADR 0054, and the constitution. Findings are fixed by the implementer, with the same small tests rerun. Covers every FR. Tests: the reviewer runs `npx vitest run test/corpus-size.test.ts` once to confirm GREEN.
- [ ] T007 The task's notes and the line's merge-request note: what was built, the small tests' output, the Q answers taken (Q1 to Q8, Q144, Q145, Q157), the record's stage and its notes, the two pending corpus patches with the stage and figures each patch's record shows (T008's records, as T005 put them in the ADR; projected from 026 at b12ac0ba: spec 026's takes hobbies and travel past T1, to −7, and leaves mission 1 character; spec 022's takes mission past T1 after 026's), that ADR 0054's measurement commit is in `main`'s history only if he merges the line without squash or rebase (FR-002), that the patch he applies second is rebuilt on the first, that stage 1's spec is the next item once he applies either and the record reads "stage 1 due" (Q144), and that no human-only path is touched. The full `make check` is the stack's last task, not this one. Tests: none new; `make lint`.

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
| FR-008 the record, deterministic, reads only | T002, T003, T004, T008 | deterministic; reads only |
| FR-009 the record's fields | T002, T003 | fresh; defaults |
| FR-010 the fit check's model, and what it leaves out | T002, T003; drafted (the ADR) | room parity (two-file topic); lead |
| FR-011 a crossing is a note | T002, T003 | T1 boundary (one note, exit 0) |
| FR-012 stale record fails, naming the command | T002, T004, T008 | fresh (on the line, and on each patch's export) |
| FR-013 nothing at run time changes | T004 | T004's `git diff --exit-code` |
| FR-014 quotes in their sources' words | drafted; T005 | review (T006) |
| SC-001 rerunnable figures | T005 | T005's pasted commands |
| SC-002 one character flips the stage | T002 | T1 boundary |
| SC-003 a small test | T002 | the run itself |
| SC-004 readiness hashes unchanged | T004 | T004's `git diff --exit-code` |
| Q144, Q145 the pending patches' stage, and the record in them | T008, T005 (final figures), T007 | `test/corpus-size.test.ts` on each patch's export |

## Order

T000 runs on the Author's time. T001 → T002 → T003 → T004 → T008 → T005 → T006 → T007, one after another: each reads the one before it (T008 needs T004's `twin:pack` line; T005's figures and T007's note need T008's stages). Nothing here runs in parallel with another of this spec's tasks.

## Notes

- 2026-11-14, spec-writer (spec-027): intent (draft), spec, clarifications Q1 to Q8 (recommended answers taken), plan, ADR 0054 (proposed, with its index row), tasks, analysis, and `docs/merge-requests/human-patches/027.md` (none needed) are on `night/spec-027/spec-027`. Questions Q1 to Q10 are on `/night/io/out/questions.md`. No requests to the runner, no refusals hit, no test run (no code written). **What's left**: T000 (the Author's answers), then T001 to T007 on the line after spec 025, with T005 replacing the ADR's replica figures by the check's.
- 2026-11-14, spec-writer (rework-spec-027), on `night/rework-spec-027/rework-spec-027` after rv-spec-027: B1 (spec 026's corpus patch named beside 022's in the spec, plan §7 and §8, T001, T007, ADR 0054's Decision 1 and Consequences; the line's order after item f; T008 in place of plan §7's "rewrites `docs/corpus-size.json` too"), I1 to I4, N1 to N4; Q144 and Q145 taken, provisional. Analysis rerun (analysis.md). No code; no runner request. **What's left**: T000 (his answers, Q144 and Q145 included), then T001 to T008 on the line after spec 026, in the order above.
- 2026-11-14, spec-writer (rework2-spec-027), on `night/rework2-spec-027/rework2-spec-027` after rv-rework-spec-027: I-1 (026's patch reread at b12ac0ba: the `04` block 136, mission 1, hobbies and travel 130 then −7, in the ADR, spec, plan, tasks, human-patch note, analysis, notes; T005 extended), I-2, nits 1 to 5. No code; no runner request. **What's left**: T000 (Q1 to Q8, Q144, Q145, Q157), then T001 to T008 on the line after spec 026.
