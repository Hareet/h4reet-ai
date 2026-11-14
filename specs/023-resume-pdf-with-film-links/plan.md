# Implementation Plan: The resume PDF, redone with links from the films

**Approved provisionally by the Author's order of 2026-11-13**, which reads, in his words: "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog." And on how far the night goes: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". Each answer below is the recommended one; he confirms or overturns them on the morning page, and an overturned answer is reworked before he merges.

**Branch**: `spec/023-resume-pdf-with-film-links` (this plan), then `feat/023-resume-pdf-with-film-links` (the build) | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

## Summary

Four claims in the Author's PDF become links to their films. The night builds a candidate file by adding link annotations to his approved PDF, checks it with the room's existing PDF checks, and prepares the approval request. It never replaces the file the room serves and never writes an approval. He publishes with a `git mv` and one entry on `main`, after the repository is public.

## Technical context

- **Language**: TypeScript (the room's build code, vitest). No new service, endpoint, container, or model call. No provider SDK, so the gateway rules don't apply.
- **The reader**: `readPdf` in `apps/web/build/resume-pdf.ts` already reads link annotations through `pdfjs-dist` (a dependency of `apps/web`). PDFKit is a dev dependency for test fixtures.
- **The writer**: nothing in the tree edits an existing PDF. R-1 below decides how.
- **Constitution check**: I (local-first): static file, no run-time dependency. VII/VIII: no new claim about him; links only. Data flow: V1 gets a sentence (FR-011). Cost: $0. Degraded mode: none. Telemetry/dashboard: none new (link clicks happen in the reader's viewer; downloads are already counted). Human-only paths: none edited; one patch for his hand described in `docs/merge-requests/human-patches/023.md`.

## Design

### 1. One table (FR-003, FR-012)

`films/resume-links.json`: `{"schema": 1, "repo": "https://github.com/hareet/h4reet-ai", "links": [{"claim": "Local models first", "film": "local-first"}, …]}`. The claim strings are the PDF's own wording; the first task reads the approved PDF's text to set them exactly (SmallCaps may be stored as upper or lower case, which the locator handles case-blind). The URL of a link is `repo + "/tree/main/films/" + film`. This table is the stand-in for spec 022's film list.

### 2. The locator and the writer (FR-001, FR-006)

`apps/web/build/film-links.ts` exports:

- `locateClaims(pdf, table)`: with pdfjs `getTextContent`, finds each claim's text items and returns one rectangle per line, in page space. Fails naming the claim when not found or found twice.
- `addLinks(pdf, rects)`: an incremental update appended to the file: one `/Link` annotation per rectangle (`/Border [0 0 0]`, so no box is drawn; `/A << /S /URI /URI (…) >>`), the page's `/Annots` extended, a new xref section and trailer with `/Prev`. The original bytes stay as they were, so SC-004 holds by construction. It refuses a file whose SHA-256 isn't C-0002's.
- There is no command-line script. The candidate is written by one vitest case (an explicit opt-in, `WRITE_CANDIDATE=1`), so nothing the Author runs executes agent-written code (CLAUDE.md, "Things Claude gets wrong"). He verifies the candidate with `sha256sum` and `pdfinfo -url`, which are his own tools.

**R-1 (the risk).** An incremental update needs the original's xref to be one the update can chain to. Chromium's PDF output is, as far as the night can tell, a classic xref table without object streams, but the spike (task T003) confirms it on the real file. If it uses xref streams, the update writes an xref stream too (more code, same idea). If both fail, the fallback is a pinned dependency (`pdf-lib`), which is a new dependency and the Author's to allow, so the plan stops there and the night ends with the edit text for his source (route (b), FR-007), the table, the checks, and the approval request with its hash left blank. Q-D in questions.md carries that.

### 3. The checks (FR-009, FR-012)

`apps/web/test/content/film-links.test.ts` (new). Cases, each its own `it`:
1. the table's four entries are well-formed and the URLs match `repo/tree/main/films/<film>`;
2. each film's `README.md` and `media/<film>.mp4` are tracked on this tree (`git ls-files`);
3. `locateClaims` over a PDFKit fixture with the claims, including one that wraps, returns the right rectangles; a missing claim fails naming it;
4. `addLinks` over the fixture keeps the original bytes as a prefix, and `readPdf` then lists the four URLs;
5. over the real approved file (when the tree holds it; the existing test reads it the same way): the SHA-256 guard, then the candidate passes `pdfProblems` (PDF1 to PDF9) under a header like `main`'s, has one page, and the page's content stream is unchanged;
6. every link passes `allowedUrl`; a link to another owner fails PDF5.
7. the committed candidate equals what `addLinks` writes from the approved file (so no one can hand-edit it unseen).

### 4. The candidate and the approval request (FR-008, FR-010)

The candidate is committed at `apps/web/content/candidates/resume-author-links.pdf`. The note in `docs/merge-requests/` and `docs/merge-requests/human-patches/023.md` carry its SHA-256 and the entry's text: id C-0005, kind `resume`, path when approved `apps/web/content/resume-author.pdf`, the SHA-256, the date left for him, and his reason left for him (his words only). Not on main before the gate: the entry goes on `main` after the merge (ADR 0034; spec 003's rule A9 refuses a branch that changes `assets/policy/`).

### 5. His route (FR-007)

A section in the merge note gives, as text, the edit to `resume/source/twin.html` from `films/RESUME-LINKS-PLAN.md` step 1 with the final URLs, and its steps 2 to 4. `films/RESUME-LINKS-PLAN.md` step 5 is corrected (the room serves the render, not C-0002's file, if the file at the served path changes without an entry) and its open decisions are marked answered provisionally.

### 6. Disclosure (FR-011)

One sentence in V1's "what it never carries" cell or its trigger cell. The data-flow checks that read the file (`deploy/scripts/preflight.py`, `apps/web/test/site.test.ts`) run as the small tests.

## Files expected to be touched

New: `films/resume-links.json`; `apps/web/build/film-links.ts`; `apps/web/test/content/film-links.test.ts`; `apps/web/content/candidates/resume-author-links.pdf`; `docs/merge-requests/<date>-feat-023-resume-pdf-with-film-links.md`.
Edited: `docs/data-flow-disclosure.md` (V1, one sentence); `films/RESUME-LINKS-PLAN.md` (step 5; open decisions); `specs/023-…/` (tasks tick-offs).
Not touched: `apps/web/build/resume-pdf.ts` (the allowlist, unchanged: FR-005), `apps/web/content/resume-author.pdf`, `resume.yaml`, `resume.lock.json`, `corpus/**`, `assets/policy/**`, `.claude/**`.
Merge order: this branch (spec only) merges first into the implementer's; the only shared file another night spec might also edit is `docs/data-flow-disclosure.md`. This spec edits V1's row alone, so a conflict would be local to that row.

## Small tests (rule 4)

Each task runs `vitest run <its files>` from `apps/web` and `make lint`. The files: `test/content/film-links.test.ts`; `test/content/author-pdf.test.ts` (covers `resume-pdf.ts`, which the plan doesn't change but the new code imports); `test/site.test.ts` for the disclosure sentence; `pytest deploy/scripts/test_preflight.py` (the preflight reads the disclosure). The full `make check` runs once at the stack's end, by one task, and goes in the merge note (rule 4).

## Departures from other documents

- `films/RESUME-LINKS-PLAN.md` step 5 (the room "keeps serving the approved C-0002 file"): see Q6 in the spec; corrected in the same commit as the note.
- Spec 002's contract §7 is unchanged. If the Author takes route (b), nothing in the contract changes either.
