# Tasks: The resume PDF, redone with links from the films

**Approved provisionally by the Author's order of 2026-11-13**, which reads, in his words: "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog." And: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over".

**Input**: [plan.md](plan.md), [spec.md](spec.md); reworked 2026-11-14 after rv-spec-023, and again after rv-rework-spec-023. **Branch**: `night/impl-023/impl-023`, from impl-022's tip, with `night/rework2-spec-023/rework2-spec-023` (which holds both reworks) merged first. **Tests**: required, test-first: each test task is committed RED, then the code GREEN, one commit each. Small tests run from `apps/web` as `vitest run <files>`. Each task pastes its small-test output and `make lint` into its notes. The full `make check` runs once, in T012. Case numbers are plan §3's.

**Rules**: no write to `apps/web/content/resume-author.pdf`, any film file, `assets/policy/**`, `corpus/**`, `.claude/**`. No command-line script an Author's terminal runs. No push, no merge.

## Phase 1: Table and facts

- [x] T001 [US3] RED: `apps/web/test/content/film-links.test.ts`, cases 1 and 2 (table shape: `claim`, `film`, `media` under `media/` ending `.mp4`; URLs; each film's `README.md` and `films/<film>/<media>` tracked, and the README's "Watch the film" link is `<media>`, so `kill-switch-b2` → `media/kill-switch.mp4`). Small tests: `vitest run test/content/film-links.test.ts`. Covers FR-003, FR-012.
- [x] T002 [US3] GREEN: `films/resume-links.json` as plan §1 gives it (`pdf_sha256` empty), the claim strings read from the approved PDF's text (read-only; record them in the note). Renames no film file. Same small tests. Covers FR-002, FR-003, FR-012.

## Phase 2: Locate and write

- [x] T003 Spike (no commit of code): read the approved PDF's trailer, xref kind, page object number, `/Annots`, and the four claims' text positions with pdfjs; record what R-1 needs (classic or stream xref; claims wrap or not). Output in the note. If neither an incremental update nor a stream update is workable, stop: ask the Author on the page whether to add `pdf-lib` (recommended: no; the night ends at route (b)), and add no dependency. Small tests: none (a read).
- [x] T004 [US1] RED: `film-links.test.ts` cases 3, 4, 6 over a PDFKit fixture (wrapped claim, missing claim, original bytes as prefix, URLs read back by `readPdf`, the guard refusing other bytes, an out-of-allowlist owner fails PDF5). Small tests: `vitest run test/content/film-links.test.ts test/content/author-pdf.test.ts`. Covers FR-001, FR-006, FR-009.
- [x] T005 [US1] GREEN: `apps/web/build/film-links.ts` (`locateClaims`, `addLinks`, `c0002Sha`, the guard on the writer only). Same small tests. Covers FR-001, FR-005, FR-006.

## Phase 3: The candidate

- [x] T006 [US1][US2] RED: `treeState()` and cases 0, 5, 7, 8, 10 (plan §3's table: "before" runs 5, 7, 8 and skips 10, its title stating "before: not published yet"; "published" skips 5, 7, 8 (and T008's 9) by `it.skipIf`, each title stating "published: the served file is the candidate", and runs 10; "neither" fails case 0, naming the three hashes and whether the candidate file exists, and skips 5, 7, 8, 9, 10, each title stating "neither: see case 0", while 1 to 4 and 6 run; nothing skips silently). `treeState()` tests the candidate file's existence, never the `candidates/` folder's. Case 5: guard, PDF1 to PDF9 under a header like `main`'s, one page, the approved bytes as prefix, the approved file's links kept. Case 7: the committed candidate equals what `addLinks` writes (deterministic: the appended trailer copies the original `/ID`, and nothing time-based is written; plan §2). Case 8: the appended section holds only the page object (same number, `/Annots` extended) and four `/Annot /Link` objects, each `/Border [0 0 0]`, a `/URI` from the table, no `/AP`, `/C`, `/JS`, `/Launch`. RED now: the tree is in "neither" (no candidate, `pdf_sha256` empty). Same small tests. Covers FR-009, FR-013, US1-AC1, US1-AC3, US2-AC2, SC-002, SC-004.
- [x] T007 [US1][US2] GREEN: write the candidate with the opt-in case (`WRITE_CANDIDATE=1 vitest run test/content/film-links.test.ts`) to `apps/web/content/candidates/resume-author-links.pdf`, and its SHA-256 into the table's `pdf_sha256`; commit both together. The tree is now "before". Record the SHA-256 and `pdfinfo -url` output in the note. Same small tests, and a read-only run of the human-only arrival check on the new file: `python3 -I -B -X pycache_prefix=/dev/null tools/gates/arrival_check.py apps/web/content/candidates/resume-author-links.pdf`. Covers FR-003, FR-008, SC-001 (by file existence), SC-003.

## Phase 4: The Author's side

- [x] T008 [US2][US3] RED: case 9, "before" only (the SHA-256 that `docs/merge-requests/human-patches/023.md` and the stack note's item for 023 quote equals the table's `pdf_sha256`; the stack note's edit text holds each of the table's URLs). Then GREEN: fill the hash in `human-patches/023.md`, and write the stack note's item for 023 (`docs/merge-requests/2026-11-14-night-stack.md`): its "For the Author" with the two preconditions (repository public; each link clicked), the `git mv` step and the entry's text, and his route (b): the edit, as RESUME-LINKS-PLAN step 1 gives it, with the table's URLs, its steps 2 to 4, and that his commit sets `pdf_sha256` to his render's hash and removes the candidate file, `candidates/resume-author-links.pdf`. Small tests: `vitest run test/content/film-links.test.ts` and `python3 -I evals/docs_links.py`, after the note is written. Covers FR-007, FR-010, SC-005, US3-AC1.
- [x] T009 [P] `films/RESUME-LINKS-PLAN.md`, by the page's Q98 (recommended, taken provisionally under his order of 2026-11-13; he confirms or overturns it on the page): add a dated note (2026-11-14, the night's spec 023) beside step 5 and beside each of the three open decisions, each naming its source (spec 023's Q2, Q3, Q4, Q6; Q98), and keep his session's text as written, word for word. Small tests: none (prose); `make lint`; `git diff --word-diff` shows only added lines.
- [x] T010 [P] FR-011: in `docs/data-flow-disclosure.md` V1's Trigger cell, right after `following the PDF link` and before `, and following "Credits"`, this sentence, word for word, between the fences (it starts with one space and holds no pipe and no code span: the host is plain text, since `tools/gates/disclosure_check.py` reads every backticked token in a row as a disclosed name); no other cell changes. Row V4 also holds `following the PDF link`; the place is V1's, where it is followed by `, and following "Credits"`, which occurs once in the file:

  ```text
   (a link in the downloaded PDF, such as a claim's link to its film's page in the repository on github.com, isn't this row's flow: only when the visitor clicks it does the visitor's own PDF viewer, or the browser it opens, send the request, from the visitor's device to that host; the site's origin isn't involved)
  ```

  Small tests: `vitest run test/disclosure.test.ts test/site.test.ts`, `pytest evals/test_disclosure.py deploy/scripts/test_preflight.py`, and the disclosure gate, human-only to edit and run read-only here: `python3 -I -B -X pycache_prefix=/dev/null -m pytest -q -p no:cacheprovider tools/gates/test/test_disclosure_check.py` and `python3 -I -B -X pycache_prefix=/dev/null tools/gates/disclosure_check.py` (must print PASS).

## Phase 5: Review and the full run

- [ ] T011 Review by a reviewer that didn't write the code: `REVIEW.md`, the spec, this plan. Findings and their fixes in the note.
- [ ] T012 One run of `make check` at the stack's end (rule 4); paste its summary into the stack note. A failure in a test this stack doesn't touch is reported with the evidence, not chased (`apps/web/test/room/twin-2d.test.ts` is a known flaky test under load). After the paste, since case 9 reads the stack note's hash and URLs and `evals/docs_links.py` reads `docs/**`: `vitest run test/content/film-links.test.ts` and `python3 -I evals/docs_links.py`, their output in the notes.
- [ ] T013 The stack note's item for 023, finished from the template: what changed, FR/SC coverage, constitution check, review, verification (the small runs), cost and data flow, for the Author. Then the same two small runs as T012's paste, after the edit: `vitest run test/content/film-links.test.ts` and `python3 -I evals/docs_links.py`. Ends the branch; no merge.

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008. T009 and T010 are independent of T004 to T008. T011 after T008 to T010; T012 after T011; T013 last.

## Coverage

FR-001 T004/T005 · FR-002 T002 · FR-003 T001/T002/T007 · FR-004 untouched (no task; T012 shows it) · FR-005 T005 · FR-006 T004/T005 · FR-007 T008 · FR-008 T007 · FR-009 T004/T006 · FR-010 T008 · FR-011 T010 · FR-012 T001/T002 · FR-013 T006/T007 · SC-001 T007 · SC-002 T006 · SC-003 T007 · SC-004 T006 · SC-005 T008 · US1-AC3 T006 (case 8) · US2-AC2 T006 (case 10) · US3-AC1 T008 (case 9).

## Files touched

New: `films/resume-links.json`, `apps/web/build/film-links.ts`, `apps/web/test/content/film-links.test.ts`, `apps/web/content/candidates/resume-author-links.pdf`. Edited: `docs/merge-requests/2026-11-14-night-stack.md` (item for 023), `docs/merge-requests/human-patches/023.md`, `docs/data-flow-disclosure.md` (V1's Trigger), `films/RESUME-LINKS-PLAN.md` (dated notes only), `specs/023-resume-pdf-with-film-links/tasks.md`.
