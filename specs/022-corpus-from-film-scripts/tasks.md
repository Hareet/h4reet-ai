# Tasks: hareet.ai's Corpus from the Film Scripts

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

**Input**: [plan.md](plan.md), [spec.md](spec.md). Reworked 2026-11-14 after rv-spec-022 (B-1 to B-3, C-1 to C-6; Q95 to Q97). **Tests**: required, written first, RED then GREEN, one commit each. A save point per task: `git commit -m "wip(impl-022): T0nn"`.

**Rules for every task** (the order's rule 4): run only the test files the task adds or changes, plus those covering the files it changes, and `make lint`; paste them into the task's notes. The full `make check` runs once, in T012, and goes in the stack's merge-request note. A failure in a test this stack doesn't touch is reported with the evidence (passes alone; not touched here), not chased. `apps/web/test/room/twin-2d.test.ts` is flaky under load.
Protected paths (`corpus/` except `proposals/`, `apps/web/content/resume.lock.json`, and the rest main's settings deny) are never written: patches from plain copies, verified with `patch -p1 --dry-run` then `patch -p1` on a fresh `git archive` export; never `git apply` into a worktree. No heredoc whose text names a bash-gate word: write files with the Write tool.

## Phase 0: The Author (waits; the build goes on with the recommended answers)

- [ ] T000 The Author confirms or overturns Q1 to Q6 (the page's Q19 to Q24) and the rework's question on `[P]` before publication, on the morning page (`/night/io/out/questions.md`); Q95 to Q97 are answered. Overturned: T004 to T010 are reworked before he merges. Not a blocker for T001 to T012.

## Phase 1: The checker (test first)

- [ ] T001 Write `scripts/corpus/test_film_claims.py` and its fixtures `scripts/corpus/fixtures/`: a small `SCRIPTS`-shaped file with a normal line, a "Not in the repository yet" line, and a "didn't hold up" line; a small `script.txt`-shaped file of a few sentences, one of them a quoted message; a good proposal; one bad proposal per rule. R4's fixtures: a stray digit; "fifteen containers" outside a slot (fails as a number); "ten cents" (fails as currency); "metered to the millionth of a dollar" (fails as currency); and, passing, a claim tag `` `[A 2026-11-06]` ``, an ISO date, a repository path and URL, "one command", and the F3 quote "up to 30 days" inside quotation marks R5 accepts. R2's fixture: a `script.txt` sentence missing from the table. RED. Covers FR-003, FR-004, FR-006, FR-007, FR-012; SC-001, SC-003. Tests: `pytest scripts/corpus/test_film_claims.py` (expected to fail, no module yet); `make lint`.
- [ ] T002 Write `scripts/corpus/film_claims.py` (R1 to R7, plan §3): GREEN. Includes the parity tests that read `corpus/tools/check_corpus.py` and `services/gateway/src/twin/guards.ts` as text and hold the checker's copies of `CURRENCY`, `AMOUNT_WORDS_PY_SOURCE`, and G1's `UNITS`, `TENS`, `SCALES` keys equal to them. Tests: `pytest scripts/corpus/test_film_claims.py corpus/tools/test_check_corpus.py`; `make lint`.
- [ ] T003 Harden the checker against the real scripts: a test reads `films/SCRIPTS.md` and `films/kill-switch-b2/script.txt` (read-only) and asserts the checker finds every numbered line in `SCRIPTS.md` §1 to §6 and every sentence of `script.txt` (the count for SC-003; the seventh section's sentence split as plan §3 R1 gives it), the not-built and retracted markers, and the "about you" lines; and that each `kill-switch-b2` source the table may cite is a path `films/kill-switch-b2/materials.md` lists. Tests: `pytest scripts/corpus/test_film_claims.py`; `make lint`.

## Phase 2: The proposal

- [ ] T004 [US1, US3] Draft the table of carried and left-out lines for the seven sections (`SCRIPTS.md` §1 to §6 and `films/kill-switch-b2/script.txt`; FR-006; the closed list of reasons), with each line's repository source and, where the films' note changed the line after his approval (`docs/merge-requests/2026-11-11-feat-015-explainer-films.md:41-48`), that mark. For `kill-switch-b2` (plan §2's first row): "five dollars" and "three fifty" left out (currency), the daily figure as `site.kill_switch_daily`, "And only Hareet runs the final gate." left out as a duplicate of `08`'s "only I merge". Tests: `python3 -I scripts/corpus/film_claims.py corpus/proposals/film-scripts-2026-11-14.md` (R1, R2, R3 only at this point); `pytest scripts/corpus/test_film_claims.py`.
- [ ] T005 [US2] Write the new `08` text for the seven sections (plan §2), the one new slot `site.prod_containers` (plan §2; no case-count or red-team-count slot), the Golden Q&A (about nine), the "Do not claim" lines (FR-008), and the gap lines (FR-007, among them the case and red-team counts), in the proposal, tagged. Tests: the checker, all rules; `make lint`.
- [ ] T006 [US2] Add Q6's two quotes "to confirm" (FR-010), the Haiku reason from `SCRIPTS.md` and the F3 sentence as the suggested second sentence of Golden Q&A 5, his existing sentence unchanged (Q97, plan §2), and the Author's reading guide at the top of the proposal, which attributes "Corpus changes are proposals in `corpus/proposals/`, for his hand" to the orders file and the night's rule 2, not to him. Tests: the checker (R5).
- [ ] T007 Review pass by a worker that didn't write T004 to T006: each carried line against `SCRIPTS.md`, `films/kill-switch-b2/script.txt`, and the repository file by hand; each left-out reason; each changed-after-approval mark; Principle VII's check (no ownership beyond `01`'s rulings). Findings go to the proposal; the reviewer's notes into the branch's notes. Tests: the checker.

## Phase 3: The patch

- [ ] T008 [US1] Build the patch from plain copies of `main`'s `corpus/08-hareet-ai.md` and `corpus/facts/hareet-ai.yaml` (`git show refs/heads/main:<path>`, edit outside any checkout, `diff -u` with `a/`, `b/`). Verify on a fresh `git archive` export: `patch -p1 --dry-run` then `patch -p1` clean; `python3 corpus/tools/check_corpus.py` OK. Tests: that; `pytest corpus/tools/test_check_corpus.py`.
- [ ] T009 [US1, US2] On the same export, regenerate with `npm run twin:pack -w apps/web` and `npm run content:lock -w apps/web`, and fold the changed `config/twin/corpus.json`, `apps/web/content/resume.lock.json`, and the product and narration cases into the patch (FR-009). Check C9 on the export: the new "Do not claim" key phrases join the forbidden list the resume's items and header, its PDF, and the narration are held to; a clash is reworded in the proposal (T005) and the patch rebuilt. Tests on the export: `npm run content:check -w apps/web`; `vitest run apps/web/test/twin-pack.test.ts apps/web/test/content/narration.test.ts`; `pytest evals/test_twin_readiness.py`; the lock's own test or check mode. If the export can't run node (no `node_modules`; the Author's host installs them), write down which commands the Author runs, and keep the patch to the corpus files with the regeneration and `content:check` as his first step, in the note.
- [ ] T010 Update `docs/merge-requests/human-patches/022.md` (the patch's paths, the intended change, why, and "not on `main` before the gate: the Author applies it on a short branch and merges, then the gate"; the lock and C9 overlap with the resume stack, plan §6) and record the patch's blob ID and SHA-256 in the proposal.

## Phase 4: Close

- [ ] T011 Write the branch's merge-request note (`docs/merge-requests/2026-11-14-night-spec-022-spec-022.md`, the template's sections), with the per-task test output, and rv-spec-022's non-blocking findings and how each was handled.
- [ ] T012 The stack's one full `make check`, by one task, at the end of the stack (the supervisor names it): paste its output into the stack's merge-request note; a failure in a test this stack doesn't touch is reported with the evidence, not chased.

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012. T000 is the Author's and parallel to all.

## Coverage

| Requirement | Tasks | Small test |
|---|---|---|
| FR-001 | T005, T008 | the checker; `patch -p1` on an export |
| FR-002 | T005, T007 | the checker; the reviewer |
| FR-003, FR-004 | T001, T002, T005 | `pytest scripts/corpus/test_film_claims.py` (R4's fixtures and parity tests); `check_corpus.py` on the export |
| FR-005, FR-010 | T006 | the checker (R5) |
| FR-006, FR-007 | T003, T004 | the checker (R2, R3) |
| FR-008 | T005, T009 | the product cases on the export; `content:check` (C9) |
| FR-009 | T009 | `twin-pack.test.ts`; `narration.test.ts`; `content:check`; `test_twin_readiness.py` |
| FR-011, FR-012 | T002 | the checker (R6, R7) |
| FR-013 | T011 | the note |
| SC-001 to SC-004 | T002, T003, T008, T009 | as above |
