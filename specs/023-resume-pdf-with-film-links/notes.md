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
