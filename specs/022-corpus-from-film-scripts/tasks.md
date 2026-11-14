# Tasks: hareet.ai's Corpus from the Film Scripts

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

**Input**: [plan.md](plan.md), [spec.md](spec.md). **Tests**: required, written first, RED then GREEN, one commit each. A save point per task: `git commit -m "wip(spec-022): T0nn"`.

**Rules for every task** (the order's rule 4): run only the test files the task adds or changes, plus those covering the files it changes, and `make lint`; paste them into the task's notes. The full `make check` runs once, in T012, and goes in the stack's merge-request note. A failure in a test this stack doesn't touch is reported with the evidence (passes alone; not touched here), not chased. `apps/web/test/room/twin-2d.test.ts` is flaky under load.
Protected paths (`corpus/` except `proposals/`, `apps/web/content/resume.lock.json`, and the rest main's settings deny) are never written: patches from plain copies, verified with `patch -p1` on a fresh `git archive` export; never `git apply` into a worktree. No heredoc whose text names a bash-gate word: write files with the Write tool.

## Phase 0: The Author (waits; the build goes on with the recommended answers)

- [ ] T000 The Author confirms or overturns Q1 to Q6 on the morning page (`/night/io/out/questions.md`). Overturned: T004 to T008 are reworked before he merges. Not a blocker for T001 to T012.

## Phase 1: The checker (test first)

- [ ] T001 Write `scripts/corpus/test_film_claims.py` and its fixtures `scripts/corpus/fixtures/` (a small `SCRIPTS`-shaped file with a normal line, a "Not in the repository yet" line, and a "didn't hold up" line; a good proposal; one bad proposal per rule). RED. Covers FR-003, FR-004, FR-006, FR-007, FR-012; SC-001, SC-003. Tests: `pytest scripts/corpus/test_film_claims.py` (expected to fail, no module yet); `make lint`.
- [ ] T002 Write `scripts/corpus/film_claims.py` (R1 to R7, plan §3): GREEN. Includes the parity test that runs the checker's currency pattern and `corpus/tools/check_corpus.py`'s on the same strings. Tests: `pytest scripts/corpus/test_film_claims.py corpus/tools/test_check_corpus.py`; `make lint`.
- [ ] T003 Harden the checker against the lines the real `films/SCRIPTS.md` holds: a test reads the real file (read-only) and asserts the checker finds every numbered line in §1 to §6 (the count for SC-003), the not-built and retracted markers, and the "about you" lines. Tests: `pytest scripts/corpus/test_film_claims.py`; `make lint`.

## Phase 2: The proposal

- [ ] T004 [US1, US3] Draft the table of carried and left-out lines for all six sections of `SCRIPTS.md` (FR-006; the closed list of reasons), with each line's repository source. Tests: `python3 -I scripts/corpus/film_claims.py corpus/proposals/film-scripts-2026-11-14.md` (R1, R2, R3 only at this point); `pytest scripts/corpus/test_film_claims.py`.
- [ ] T005 [US2] Write the new `08` text for the six sections (plan §2), the new slots, the Golden Q&A (about eight), the "Do not claim" lines (FR-008), and the gap lines (FR-007), in the proposal, tagged. Tests: the checker, all rules; `make lint`.
- [ ] T006 [US2] Add Q6's two quotes "to confirm" (FR-010) and the Author's reading guide at the top of the proposal. Tests: the checker (R5).
- [ ] T007 Review pass by a worker that didn't write T004 to T006: each carried line against `SCRIPTS.md` and the repository file by hand; each left-out reason; Principle VII's check (no ownership beyond `01`'s rulings). Findings go to the proposal; the reviewer's notes into the branch's notes. Tests: the checker.

## Phase 3: The patch

- [ ] T008 [US1] Build the patch from plain copies of `main`'s `corpus/08-hareet-ai.md` and `corpus/facts/hareet-ai.yaml` (`git show refs/heads/main:<path>`, edit outside any checkout, `diff -u` with `a/`, `b/`). Verify on a fresh `git archive` export: `patch -p1` clean; `python3 corpus/tools/check_corpus.py` OK. Tests: that; `pytest corpus/tools/test_check_corpus.py`.
- [ ] T009 [US1, US2] On the same export, regenerate with `npm run twin:pack -w apps/web` and `npm run content:lock -w apps/web`, and fold the changed `config/twin/corpus.json`, `apps/web/content/resume.lock.json`, and the product and narration cases into the patch (FR-009). Tests on the export: `vitest run apps/web/test/twin-pack.test.ts`; `pytest evals/test_twin_readiness.py`; the lock's own test or check mode. If the export can't run node (no `node_modules`; the Author's host installs them), write down which commands the Author runs, and keep the patch to the corpus files with the regeneration as his first step, in the note.
- [ ] T010 Write `docs/merge-requests/human-patches/022.md` (the patch's paths, the intended change, why, and "not on `main` before the gate: the Author applies it on a short branch and merges, then the gate"; the lock overlap with the resume stack, plan §6) and record the patch's blob ID and SHA-256 in the proposal.

## Phase 4: Close

- [ ] T011 Write the branch's merge-request note (`docs/merge-requests/2026-11-14-night-spec-022-spec-022.md`, the template's sections), with the per-task test output.
- [ ] T012 The stack's one full `make check`, by one task, at the end of the stack (this task or the stack's last, whichever is later): paste its output into the stack's merge-request note; a failure in a test this stack doesn't touch is reported with the evidence, not chased.

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012. T000 is the Author's and parallel to all.

## Coverage

| Requirement | Tasks | Small test |
|---|---|---|
| FR-001 | T005, T008 | the checker; `patch -p1` on an export |
| FR-002 | T005, T007 | the checker; the reviewer |
| FR-003, FR-004 | T002, T005 | `pytest scripts/corpus/test_film_claims.py`; `check_corpus.py` on the export |
| FR-005, FR-010 | T006 | the checker (R5) |
| FR-006, FR-007 | T003, T004 | the checker (R2, R3) |
| FR-008 | T005 | the product cases on the export |
| FR-009 | T009 | `twin-pack.test.ts`; `test_twin_readiness.py` |
| FR-011, FR-012 | T002 | the checker (R6, R7) |
| FR-013 | T011 | the note |
| SC-001 to SC-004 | T002, T003, T008, T009 | as above |
