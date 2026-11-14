# Notes: rework2-spec-023 (2026-11-14), rule 6's second rework after rv-rework-spec-023 (blocking)

Branch `night/rework2-spec-023/rework2-spec-023`, from `night/rework-spec-023/rework-spec-023` (563822ea). Opus 5.5, high effort. No code written. Files changed: `specs/023-resume-pdf-with-film-links/` (spec, plan, tasks, analysis, these notes) and `docs/merge-requests/human-patches/023.md`. `intent/023-*` unchanged: no finding touches it.

The review file wasn't readable from this container; the findings fixed are the brief's lines, every one (R1, I-1, N1 to N5, the nit). `analysis.md` maps each to where it's fixed.

## The first rework's notes, kept

- `evals/test_disclosure.py:408` holds V1's Trigger to end with spec 016's `, and following "Credits"` (`endswith`), and `apps/web/test/disclosure.test.ts:121` to contain it. So FR-011's sentence goes inside the Trigger cell, after `following the PDF link`, not at its end.
- `apps/web/test/content/author-pdf.test.ts` runs over fixtures, not the served file. In the "published" state the served file is checked by the build's own PDF checks and by case 10 (its links against the table), not by that test (FR-013, plan §3).

## What this rework checked in the tree

- R1: `tools/gates/disclosure_check.py` (`TICKED`, `Rows.read`) takes every backticked token of a row line as a disclosed name. No row has `github.com` in backticks today. FR-011's sentence now has the host as plain text; the three copies (spec FR-011, plan §7, T010) are byte-identical, with no backtick and no pipe.
- `following the PDF link` occurs in rows V1 and V4; `following the PDF link, and following "Credits"` occurs once, in V1. T010 says so.
- N1: `git ls-files films/kill-switch-b2` lists `media/kill-switch.gif` (blob 2eb9955c, 7,038,051 bytes, first in 8bc0788c). The earlier bullet saying it was untracked was wrong and is gone, as is analysis F3.
- The gate's own test and a read-only run, which T010 now names, pass on this tree as it is:

```
$ python3 -I -B -X pycache_prefix=/dev/null tools/gates/disclosure_check.py
disclosure-check: PASS, every outward thing the tree holds has its row
$ python3 -I -B -X pycache_prefix=/dev/null -m pytest -q -p no:cacheprovider tools/gates/test/test_disclosure_check.py
13 passed in 0.13s
```

## Small runs (rule 4)

Tests that read a file this rework changes: `evals/docs_links.py` reads `specs/**` and `docs/**`.

```
$ python3 -I evals/docs_links.py
PASS  every relative link resolves: 2401 links in 384 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 50 of 50
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2401 relative links in 384 files
$ python3 -I -B -X pycache_prefix=/dev/null -m pytest -q -p no:cacheprovider evals/test_docs_links.py
44 passed in 0.90s
$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this worktree: `node_modules` is missing (in the root and in `apps/web`), and `make setup` would fetch from the network, which this task doesn't need. Every path changed here is under `specs/` or `docs/`, both in `.prettierignore`, and ESLint, tsc, ruff, and shellcheck don't read Markdown, so the lint has nothing here to check.

## Questions and refusals

No new question: every finding was a fix, not a choice. Q25 to Q31 and Q98 stay on the page as they were, each with its recommended answer taken provisionally under his order of 2026-11-13. No hook or bash-gate refusal hit, so nothing under Interruptions.

## What's left

- A reviewer that didn't write this reviews the branch; then impl-023 starts from impl-022's tip with this branch merged first.
- For the Author on the page: Q25 to Q31 (this spec's Q1, Q2, Q4 to Q8) and Q98, each with its recommended answer taken provisionally; the approval entry and the `git mv` (`human-patches/023.md`) after the repository is public and each link has been clicked.

# Notes: impl-023 (2026-11-14), spec 023's code

Branch `night/impl-023/impl-023`, from `night/rework2-spec-023/rework2-spec-023` (885befce), with `night/verify2-020/verify2-020` (3767859f, the line's verified tip, items 1 to 3) merged first: no conflict. `make setup` ran first (no `node_modules`).

## T001 (RED)

`apps/web/test/content/film-links.test.ts`, cases 1 and 2. RED: both failed, `films/resume-links.json is missing` (2 failed).

## T002 (GREEN): the claim strings, read from the approved PDF

pdf.js's text of the approved file (`apps/web/content/resume-author.pdf`, SHA-256 `5523e532…549d6d`, C-0002's), the twin section's four runs, read-only:

```
16 "LO C A L M O D E LS F I R S T"            x 64.81  y 580.33  size 7.17  width 89.52
18 "A R E A L- T I M E C O S T M E T E R"     x 173.54 y 580.33  size 7.17  width 109.19
20 "A $ 5 - A - D AY K I LL S WI T C H"       x 302.05 y 580.33  size 7.17  width 104.22
22 "E V E R Y D ATA F LO W D I S C LO S E D"  x 425.37 y 580.33  size 7.17  width 126.78
```

The glyphs are stored as capitals, letter-spaced (pdf.js puts spaces between some letters). The table's claims are the PDF's own wording, in its capitals: `LOCAL MODELS FIRST`, `A REAL-TIME COST METER`, `A $5-A-DAY KILL SWITCH`, `EVERY DATA FLOW DISCLOSED` (plan §1 showed step 1's sentence case; the locator compares case-blind and with whitespace removed, so either matches). Cases 1 and 2: 2 passed.

## T003 (spike, a read): what R-1 needs

Read with a scratch script outside the repository (`/tmp/spike023`, pdf.js from `apps/web/node_modules`, and Python's `re` over the bytes), nothing committed but these lines:

- `%PDF-1.4`, 243,644 bytes, one page (612 × 792), one `xref` keyword and one `trailer`: a classic xref table, no `/XRef` stream, no `/ObjStm`. `startxref 232782`.
- Trailer: `<</Size 539 /Root 142 0 R /Info 1 0 R>>`. **No `/ID`**, no `/Encrypt`. So the update has no `/ID` to copy (rv-rework2-spec-023's nit on the second `/ID`: moot for this file; the writer copies one only when the original has it, unchanged, so the output stays deterministic either way).
- Page object `2 0 obj`, its `/Annots` an inline array, `[20 0 R 21 0 R 22 0 R 23 0 R]`: the four existing links (`mailto:` contact, `https://github.com/Hareet`, `https://hareet.ai/` twice), each `/Border [0 0 0]`, `/F 4`, and a `/StructParent` (the file is tagged: `/StructParents 0`, `/Tabs /S`).
- The four claims: one text run each, on one line (y 580.33), none wraps (T002's table).

R-1's answer: an incremental update over a classic xref is workable; no stream xref, no `pdf-lib`, no question. The new links get no `/StructParent` (the structure tree is the original's, unchanged: adding to it would rewrite more objects than US1-AC3 allows); a screen reader still reads the claims' text, as before.

## T004 (RED) and T005 (GREEN): the locator and the writer

T004: cases 3, 4, 6 over a PDFKit fixture (the four claims, the second wrapping onto two lines, one existing link, PDFKit's `/ID` in the trailer). RED: `Error: Cannot find module '../../build/film-links'` (the file failed to load).

T005: `apps/web/build/film-links.ts` (`locateClaims`, `addLinks`, `c0002Sha`, `filmUrl`, `readTable`). The locator compares the claim with whitespace removed and case-blind against whole text runs (whitespace-only runs skipped), so a letter-spaced or wrapped claim is found; it fails naming the claim when it's absent or there twice. The writer reads only a classic xref (R-1) and refuses an encrypted file, a hybrid (`/XRefStm`), or bytes that aren't C-0002's. Each link: `/Type /Annot /Subtype /Link /F 4 /Border [0 0 0] /Rect /QuadPoints /A <</Type /Action /S /URI /URI (…)>>`, the same keys as the approved file's own four links, plus `/QuadPoints`.

```
$ (apps/web) npx vitest run test/content/film-links.test.ts test/content/author-pdf.test.ts
 Test Files  2 passed (2)
      Tests  33 passed (33)
$ make lint
… All matched files use Prettier code style! · ruff: All checks passed! · 778 files already formatted · shellcheck clean
lint exit 0
```

## T006 (RED): the tree's state and cases 0, 5, 7, 8, 10

`treeState()` reads the served file's SHA-256, C-0002's (`c0002Sha` over `assets/policy`), the table's `pdf_sha256`, and the candidate file's SHA-256 or its absence (never the folder's). A skipped case's title says why, as `(skipped: neither: see case 0)`, `(skipped: published: the served file is the candidate)`, or `(skipped: before: not published yet)`. The opt-in writer case runs only with `WRITE_CANDIDATE=1`, its title saying so. RED, verbose:

```
 × 0. the tree is in the "before" or the "published" state (FR-013)
   AssertionError: neither "before" nor "published": the served file's SHA-256 is 5523e532…549d6d, C-0002's is 5523e532…549d6d, the table's pdf_sha256 is (empty), and the candidate file (apps/web/content/candidates/resume-author-links.pdf) is absent
 ↓ 5. … (skipped: neither: see case 0)
 ↓ 7. … (skipped: neither: see case 0)
 ↓ 8. … (skipped: neither: see case 0)
 ↓ 10. … (skipped: neither: see case 0)
 ↓ writes the candidate … (WRITE_CANDIDATE=1 only)
      Tests  1 failed | 5 passed | 5 skipped (11)
```

## T007 (GREEN): the candidate

`mkdir -p apps/web/content/candidates`, then `WRITE_CANDIDATE=1 npx vitest run test/content/film-links.test.ts -t "writes the candidate"` (1 passed, 10 skipped). It wrote the candidate and set the table's `pdf_sha256`:

- `apps/web/content/candidates/resume-author-links.pdf`: 245,437 bytes (the approved file's 243,644 plus 1,793), SHA-256 **`5de0e7eeaed34587d4d79e29f0cbfb7c577a224ce31616f1d75fcbe4e0ff21fb`**.
- `pdfinfo` (poppler-utils) isn't installed in this container, so the links are read with the build's reader instead (case 5: the approved file's four, then the table's four, in that order) and the appended section as text (case 8). The four new annotations, as written:

```
539 0 obj  /Rect [64.814 578.89 154.337 586.782]   /URI (https://github.com/hareet/h4reet-ai/tree/main/films/local-first)
540 0 obj  /Rect [173.541 578.89 282.736 586.782]  /URI (https://github.com/hareet/h4reet-ai/tree/main/films/cost-meter)
541 0 obj  /Rect [302.054 578.89 406.276 586.782]  /URI (https://github.com/hareet/h4reet-ai/tree/main/films/kill-switch-b2)
542 0 obj  /Rect [425.369 578.89 552.15 586.782]   /URI (https://github.com/hareet/h4reet-ai/tree/main/films/data-flows)
page 2 0 obj: /Annots [20 0 R 21 0 R 22 0 R 23 0 R 539 0 R 540 0 R 541 0 R 542 0 R], every other line as the approved file's
trailer <</Size 543 /Root 142 0 R /Info 1 0 R /Prev 232782>>   (the original has no /ID, so none is written)
```

Small tests and the arrival check (human-only, run read-only):

```
$ (apps/web) npx vitest run test/content/film-links.test.ts --reporter=verbose
 ✓ 1. … ✓ 2. … ✓ 3. … ✓ 4. … ✓ 6. …
 ✓ 0. the tree is in the "before" or the "published" state (FR-013)
 ✓ 5. the candidate passes PDF1 to PDF9 under the tree's header, keeps the approved file as its prefix and its links
 ✓ 7. the committed candidate is what addLinks writes from the approved file and the table
 ✓ 8. the appended section holds only the page object and four invisible link annotations
 ↓ 10. the served file's links hold the table's four URLs, one over each claim (skipped: before: not published yet)
 ↓ writes the candidate from the approved file and records its SHA-256 in the table (WRITE_CANDIDATE=1 only)
      Tests  9 passed | 2 skipped (11)
$ python3 -I -B -X pycache_prefix=/dev/null tools/gates/arrival_check.py apps/web/content/candidates/resume-author-links.pdf
arrival-check: 0 findings in 1 file
```

The build doesn't read `apps/web/content/candidates/`: `contentFiles` (`build/approvals.ts`) lists `resume.yaml`, `narration/`, `room/`, and `room/outlines/` only, and `resumePart` reads `AUTHOR_PDF_PATH` only.

## T008: case 9, then the notes

RED (case 9 alone failing): `AssertionError: docs/merge-requests/human-patches/023.md: expected '<filled by impl-023's T008 from film…' to be '5de0e7eeaed34587d4d79e29f0cbfb7c577a2…'` (1 failed, 9 passed, 2 skipped).

GREEN: the hash filled in `human-patches/023.md` (with the candidate's path and size, and his `sha256sum` / `pdfinfo -url` check), and the stack note's item 6 written: the table, "For the Author" (the two preconditions, route (a)'s `git mv` and entry, route (b)'s edit with the table's URLs, steps 2 to 4, and his commit's `pdf_sha256` and the candidate's removal). Route (b)'s `<a>` text is sentence case, as RESUME-LINKS-PLAN step 1's example; the note tells him to keep his source's words and take only the `href`.

```
$ (apps/web) npx vitest run test/content/film-links.test.ts
      Tests  10 passed | 2 skipped (12)
$ python3 -I evals/docs_links.py
docs links: 0 failed, 2434 relative links in 401 files
```

## A lint failure in my own test, fixed

`make lint` after T009's edit failed on tsc, in the test T006 added: `apps/web/test/content/film-links.test.ts(284,67): error TS2488: Type 'ArrayLike<number>' must have a '[Symbol.iterator]()' method`. Case 10's helper now uses `Array.from(…)`; its own commit, before T009's. Same tests: 10 passed, 2 skipped; `make lint` exit 0.

## T009: dated notes in `films/RESUME-LINKS-PLAN.md` (Q98)

Four added lines, his session's text unchanged: `git diff --word-diff films/RESUME-LINKS-PLAN.md` shows no removed word (`grep -c '\[-'` gives 0; `git diff --stat`: 4 insertions). Beside step 5: the render-not-C-0002 reading, the candidate's place, C-0004 taken and the next free ID his (spec Q6, the page's Q29; Q98). Beside each open decision: the URL (Q3, the corpus's), four claims kept (Q4, the page's Q27), landing pages (Q2, the page's Q26). `make lint`: exit 0 (eslint, tsc for three workspaces, prettier, ruff, 778 files formatted, shellcheck).

## T010: FR-011's sentence in V1's Trigger

RED first: case 11 (added; plan "Departures in the implementation"), `AssertionError: expected ' opening the room, which loads its pa…' to contain 'following the PDF link (a link in the…'` (1 failed).

GREEN: rv-rework2-spec-023's nit taken: "the visitor's own PDF viewer, or the browser it opens, send the request", in its three copies (spec FR-011, plan §7, T010), then the sentence into V1's Trigger, after `following the PDF link` and before `, and following "Credits"` (the place occurs once; V4's `following the PDF link` untouched). No backtick, no pipe: the host is plain text.

Small runs, from the root and `apps/web`:

```
$ (apps/web) npx vitest run test/content/film-links.test.ts test/disclosure.test.ts test/site.test.ts
     × gives the room's rows what the spec's entries carry, never carry, and why, in the spec's own words
     × names the avatar files in V1, whose paths show the choice, and avatar_failed's trigger in V4 (spec 009, M6)
 Test Files  1 failed | 2 passed (3)
      Tests  2 failed | 36 passed | 2 skipped (40)
$ pytest -q -p no:cacheprovider --import-mode=importlib evals/test_disclosure.py deploy/scripts/test_preflight.py
FAILED evals/test_disclosure.py::test_the_rooms_rows_are_in_its_own_section_with_the_specs_words
1 failed, 204 passed in 1.64s
$ python3 -I -B -X pycache_prefix=/dev/null -m pytest -q -p no:cacheprovider tools/gates/test/test_disclosure_check.py
13 passed in 0.18s
$ python3 -I -B -X pycache_prefix=/dev/null tools/gates/disclosure_check.py
disclosure-check: PASS, every outward thing the tree holds has its row
```

The three failures are **D-V2's** (Q164, carried under Q165): V1's **Carries** cell, which item 1's T029 changed (H-11, "or, in a 3D visit, once, when the conversation panel first opens in the split layout (spec 018)"), against tests that pin it to spec 002's and 016's words. Not this item's. The evidence:

- The same three fail with the disclosure file as it was before T010 (`git show HEAD:docs/data-flow-disclosure.md` put in place, run, and mine restored): `Tests 2 failed | 9 passed (11)` for `test/disclosure.test.ts`; `1 failed, 35 passed` for `evals/test_disclosure.py`, the same three names.
- In a copy of the tree (`git archive HEAD` into `mktemp -d`, my disclosure copied in, `node_modules` linked) with `docs/merge-requests/proposed/018-verify-test-amendments.patch` applied **to the copy only** (never to this branch): `test/disclosure.test.ts test/site.test.ts`: `Test Files 2 passed (2) · Tests 27 passed (27)`; `evals/test_disclosure.py`: `36 passed`. So the sentence breaks nothing those tests hold.

## Case 2 in the gate's export, and the "published" rehearsal

The gate runs the suite in a `git archive` export with no `.git` (`tools/gates/gate`), where case 2's `git ls-files` would fail. Case 2 now takes a file's presence as tracked there (an export holds only the commit's files); in a checkout it still asks git. Its own commit; plan "Departures in the implementation". In a `git archive HEAD` export (`mktemp -d`, `node_modules` linked): `Tests 11 passed | 2 skipped (13)`. Then, in that copy only, the candidate moved onto the served path, which is his `git mv`: the state reads "published", cases 5, 7, 8, 9 skip with "published: the served file is the candidate", and case 10 and `author-pdf.test.ts`'s "the Author's PDF in this tree" pass (`Test Files 2 passed (2) · Tests 36 passed | 5 skipped (41)`), with no test edited.

## T011, T012, T013

T011 is rv-impl-023's (the reviewer follows this branch). T012 isn't this task's: the stack's one `make check` is another task's (the supervisor's instruction). T013: item 6 of `docs/merge-requests/2026-11-14-night-stack.md` finished, with the small runs pasted there. verify-021 isn't merged: its stack note (68f1eced) doesn't end item 4 with "verify-021: green".

No question for the page: every question about spec 023 (Q25 to Q31, Q98) is answered, and this session raised none. No hook or bash-gate refusal.
