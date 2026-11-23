# Implementation Plan: The resume PDF, redone with links from the films

**Approved provisionally by the Author's order of 2026-11-13**, which reads, in his words: "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog." And on how far the night goes: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over". Each answer below is the recommended one; he confirms or overturns them on the morning page, and an overturned answer is reworked before he merges.

**Branches** (the night's): this plan on `night/spec-023/spec-023`, reworked on `night/rework-spec-023/rework-spec-023` after rv-spec-023, and on `night/rework2-spec-023/rework2-spec-023` after rv-rework-spec-023; the code on `night/impl-023/impl-023`, from impl-022's tip in the night's one stack (`feat/018-hud-to-dino-stack`, named by the supervisor), with this branch merged first | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

## Summary

Four claims in the Author's PDF become links to their films. The night builds a candidate file by appending link annotations to his approved PDF, checks it with the room's existing PDF checks and this plan's own, and prepares the approval request. It never replaces the file the room serves and never writes an approval. He publishes with a `git mv` and one entry on `main`, after the repository is public. The checks pass before he publishes and after, with no test edited (FR-013).

## Technical context

- **Language**: TypeScript (the room's build code, vitest). No new service, endpoint, container, or model call. No provider SDK, so the gateway rules don't apply.
- **The reader**: `readPdf` in `apps/web/build/resume-pdf.ts` already reads link annotations through `pdfjs-dist` (a dependency of `apps/web`). PDFKit is a dev dependency for test fixtures.
- **The writer**: nothing in the tree edits an existing PDF. R-1 below decides how.
- **Constitution check**: I (local-first): static file, no run-time dependency. VII/VIII: no new claim about him; links only. Data flow: V1's Trigger gets a sentence (FR-011). Cost: $0. Degraded mode: none. Telemetry/dashboard: none new (link clicks happen in the reader's viewer; downloads are already counted). Human-only paths: none edited; one patch for his hand described in `docs/merge-requests/human-patches/023.md`.

## Design

### 1. One table (FR-003, FR-012)

`films/resume-links.json`:

```json
{"schema": 1, "repo": "https://github.com/hareet/h4reet-ai", "pdf_sha256": "",
 "links": [
  {"claim": "Local models first", "film": "local-first", "media": "media/local-first.mp4"},
  {"claim": "A real-time cost meter", "film": "cost-meter", "media": "media/cost-meter.mp4"},
  {"claim": "A $5-a-day kill switch", "film": "kill-switch-b2", "media": "media/kill-switch.mp4"},
  {"claim": "Every data flow disclosed", "film": "data-flows", "media": "media/data-flows.mp4"}]}
```

The claim strings shown are RESUME-LINKS-PLAN step 1's casing; T002 reads the approved PDF's text to set them exactly (SmallCaps may be stored as upper or lower case, which the locator handles case-blind). `media` is each film's MP4 as its README links it ("Watch the film"); `kill-switch-b2`'s is `media/kill-switch.mp4`, and no film file is renamed (rv-spec-023 B1). **Amended 2026-11-23** (spec FR-012): the MP4s leave git in the history rewrite before the push and become assets of the GitHub release `films-v1`, so `media` keeps its value and its file name is the release's asset: the README's "Download the film" link is `repo + "/releases/download/films-v1/" + ` that file name. The URL of a link is `repo + "/tree/main/films/" + film`. `pdf_sha256` is the candidate's SHA-256, written once by T007 and the only place the tree records it: the human patch and the stack note quote it, and a case checks they match (§3, case 9). This table is the stand-in for spec 022's film list.

### 2. The locator and the writer (FR-001, FR-006)

`apps/web/build/film-links.ts` exports:

- `locateClaims(pdf, table)`: with pdfjs `getTextContent`, finds each claim's text items and returns, per claim, one rectangle per line, in page space. Fails naming the claim when not found or found twice.
- `addLinks(pdf, claims)`: an incremental update appended to the file. It appends the page object under its own object number with `/Annots` extended (the existing entries kept, in order), and one `/Annot /Link` object per claim: `/Rect` the union of its lines, `/QuadPoints` one quad per line, `/Border [0 0 0]` (no box), `/A << /S /URI /URI (…) >>`, and no `/AP`, `/C`, `/JS`, or `/Launch`; then a new xref section and a trailer with `/Prev`. The appended trailer copies the original trailer's `/ID`, `/Root`, and `/Info` (when it has them) unchanged, and the update writes nothing time-based: no `/ModDate`, no new `/ID`, no changed `/Info`. So the same input gives the same bytes, and case 7 (the committed candidate equals what `addLinks` writes) is deterministic. The original bytes stay as they were, so SC-004's prefix holds by construction.
- `c0002Sha(policy)`: reads C-0002's SHA-256 from `assets/policy/content-approvals.json` (read-only; the hash isn't copied anywhere). `addLinks` refuses a file whose SHA-256 isn't that. The guard binds the writer only (FR-006); no check requires the served file to be C-0002's (§3's states).
- There is no command-line script. The candidate is written by one vitest case (an explicit opt-in, `WRITE_CANDIDATE=1`), so nothing the Author runs executes agent-written code (CLAUDE.md, "Things Claude gets wrong"). He verifies the candidate with `sha256sum` and `pdfinfo -url`, which are his own tools.

**R-1 (the risk).** An incremental update needs the original's xref to be one the update can chain to. rv-spec-023's own read found the approved file a classic xref table, with four links and no script, and the four claims each one text run; T003's spike confirms it and records it. If it uses xref streams after all, the update writes an xref stream too (more code, same idea). If both fail, the fallback is a pinned dependency (`pdf-lib`), which is a new dependency and the Author's to allow, so the plan stops there and the night ends with the edit text for his source (route (b), FR-007), the table, the checks, and the approval request with its hash left blank. The page's Q28 (the spec's Q5) carries the route; a new question would carry the dependency.

### 3. The checks (FR-009, FR-012, FR-013)

`apps/web/test/content/film-links.test.ts` (new). A helper, `treeState()`, reads four things and names one of three states (FR-013). It tests the candidate file, `apps/web/content/candidates/resume-author-links.pdf`, for existence; it never reads whether the `candidates/` folder exists (git tracks no empty folder, but a checkout may keep one).

| State | Served file's SHA-256 | Candidate file (`candidates/resume-author-links.pdf`) | Outcome |
|---|---|---|---|
| **before** | C-0002's (read from the approvals file) | present, its SHA-256 equals the table's `pdf_sha256` | cases 0 to 9 run; cases 5, 7, 8 read the candidate; case 10 skips, its title stating "before: not published yet" |
| **published** | the table's `pdf_sha256` | absent | cases 5, 7, 8, 9 skip with `it.skipIf`, their title stating "published: the served file is the candidate"; cases 0 to 4, 6, and 10 run |
| **neither** | anything else, or any other combination | – | case 0 fails, naming the three hashes and whether the candidate file exists; cases 5, 7, 8, 9, and 10 skip with `it.skipIf`, each title stating "neither: see case 0", so the failure is case 0's alone and points at the cause; cases 1 to 4 and 6, which read no state, run. The run fails (case 0), so nothing skips silently |

During T001 to T006, before the candidate exists and while `pdf_sha256` is empty, the tree is in "neither"; case 0 is part of T006's RED and goes GREEN with T007. In the published state the served file is also checked at every build by the room's own PDF checks (spec 002; their mechanism is `author-pdf.test.ts`'s, over fixtures).

Cases, each its own `it`:
0. the tree is in "before" or "published" (FR-013);
1. the table's four entries are well-formed (`claim`, `film`, `media` under `media/` and ending `.mp4`) and the URLs match `repo/tree/main/films/<film>`;
2. ~~each film's `README.md` and `<media>` are tracked on this tree (`git ls-files`), and the README's "Watch the film" link is `<media>` (FR-012; `kill-switch-b2` → `media/kill-switch.mp4`);~~ **amended 2026-11-23:** each film's `README.md` is tracked on this tree (`git ls-files`), its "Download the film" link is `repo + "/releases/download/films-v1/" + <media's file name>`, and it links no MP4 in the tree (FR-012, amended; `kill-switch-b2` → `kill-switch.mp4`);
3. `locateClaims` over a PDFKit fixture with the claims, including one that wraps, returns the right rectangles; a missing claim fails naming it;
4. `addLinks` over the fixture keeps the original bytes as a prefix, and `readPdf` then lists the four URLs; `addLinks` refuses bytes whose SHA-256 isn't the given C-0002 hash;
5. (before) over the real approved file: the guard passes, the candidate passes `pdfProblems` (PDF1 to PDF9) under a header like `main`'s, has one page, the approved file's bytes are its prefix, and the approved file's own links are among its links, unchanged (US1-AC1);
6. every link passes `allowedUrl`; a link to another owner fails PDF5;
7. (before) the committed candidate equals what `addLinks` writes from the approved file (so no one can hand-edit it unseen);
8. (before) the appended section, parsed: only the page object (the approved file's page object number, `/Annots` = the old entries plus four new references) and four `/Annot /Link` objects, each `/Border [0 0 0]`, a `/URI` that is one of the table's, and none of `/AP`, `/C`, `/JS`, `/Launch` (US1-AC3, SC-004; rv-spec-023 I1);
9. (before) the SHA-256 that `docs/merge-requests/human-patches/023.md` and the stack note's item for 023 quote equals the table's `pdf_sha256`, and the stack note's edit text for his source holds each of the table's URLs (T008; US3-AC1). It skips once published: the notes quote the night's candidate, and under route (b) the table holds his render's hash;
10. (published) the served file's links, read by `readPdf`, include the table's four URLs, one per claim (US2-AC2).

Each case is written RED first (T001, T004, T006, T008) and goes GREEN with its task's code or file.

### 4. The candidate and the approval request (FR-008, FR-010)

The candidate is committed at `apps/web/content/candidates/resume-author-links.pdf`, and its SHA-256 in the table's `pdf_sha256` in the same commit. The stack note's item for 023 and `docs/merge-requests/human-patches/023.md` quote the hash and give the entry's text: the next free ID on `main` when he adds it (C-0005 today), kind `resume`, path when approved `apps/web/content/resume-author.pdf`, the SHA-256, the date left for him, and his reason left for him (his words only). Not on main before the gate: the entry goes on `main` after the merge (ADR 0034; spec 003's rule A9 refuses a branch that changes `assets/policy/`).

### 5. His route (FR-007)

A section of the stack note's item for 023 gives, as text, the edit, as RESUME-LINKS-PLAN step 1 gives it, with the table's URLs in place of `OWNER/REPO`, and its steps 2 to 4. If he takes this route, the commit that moves his render onto the served path also sets the table's `pdf_sha256` to his render's hash and removes the candidate file, `candidates/resume-author-links.pdf`, which puts the tree in the "published" state; the human patch says so.

### 6. `films/RESUME-LINKS-PLAN.md` (Q98)

His session's text stays as written. T009 adds a dated note (2026-11-14, the night's spec 023) beside step 5 (with an unapproved file at the served path the room serves the render, not C-0002's file; the candidate waits in `candidates/`; C-0004 is taken, the next free ID on `main` is his) and beside each open decision (the URL: the corpus's; the fifth claim: four kept, provisionally; landing pages: kept, provisionally, until his step 6), each naming its source (this spec's Q2, Q3, Q4, Q6, and the page's Q98).

### 7. Disclosure (FR-011)

The sentence FR-011 gives goes in V1's Trigger cell, right after `following the PDF link` and before `, and following "Credits"`, word for word, between the fences (it starts with one space and holds no pipe and no code span):

```text
 (a link in the downloaded PDF, such as a claim's link to its film's page in the repository on github.com, isn't this row's flow: only when the visitor clicks it does the visitor's own PDF viewer, or the browser it opens, send the request, from the visitor's device to that host; the site's origin isn't involved)
```

The host is plain text, not backticked: `tools/gates/disclosure_check.py`'s `Rows.read` takes every backticked token in a row as a name the row discloses, so a backticked `github.com` in V1 would let a later egress line to that host pass the gate without a row of its own (rv-rework-spec-023 R1). Not in the other cells: V1's Carries, Never carries, and Why are spec 002's words plus spec 016's M17, which `apps/web/test/disclosure.test.ts:113-121` and `evals/test_disclosure.py` hold word for word; its Trigger is held only to contain M17's words (`toContain`) and to end with them (`endswith`), so the sentence goes before them. The small tests: `test/disclosure.test.ts`, `test/site.test.ts`, `evals/test_disclosure.py`, and `deploy/scripts/test_preflight.py`; and the gate's own, which is human-only to edit and fine to run, read-only: `python3 -I -B -X pycache_prefix=/dev/null -m pytest -q -p no:cacheprovider tools/gates/test/test_disclosure_check.py` and `python3 -I -B -X pycache_prefix=/dev/null tools/gates/disclosure_check.py` (it reads files as data and runs nothing; it must print PASS).

## Files expected to be touched

New: `films/resume-links.json`; `apps/web/build/film-links.ts`; `apps/web/test/content/film-links.test.ts`; `apps/web/content/candidates/resume-author-links.pdf`.
Edited: `docs/merge-requests/2026-11-14-night-stack.md` (the stack note: its item for 023); `docs/merge-requests/human-patches/023.md` (the hash and the entry's text, filled from the table); `docs/data-flow-disclosure.md` (V1's Trigger, one sentence); `films/RESUME-LINKS-PLAN.md` (dated notes beside step 5 and the open decisions; his text unchanged); `specs/023-…/` (tasks tick-offs).
Not touched: `apps/web/build/resume-pdf.ts` (the allowlist, unchanged: FR-005), `apps/web/content/resume-author.pdf`, `resume.yaml`, `resume.lock.json`, any film file, `corpus/**`, `assets/policy/**`, `.claude/**`.
Merge order: this branch (spec only) merges into impl-023's before its code. Another night spec may also edit `docs/data-flow-disclosure.md` (spec 020 edited D1); this spec edits V1's Trigger cell alone, so a conflict would be local to that cell.

## Small tests (rule 4)

Each task runs `vitest run <its files>` from `apps/web` and `make lint`. The files: `test/content/film-links.test.ts`; `test/content/author-pdf.test.ts` (covers `resume-pdf.ts`, which the plan doesn't change but the new code imports); `test/disclosure.test.ts` and `test/site.test.ts` for the disclosure sentence; `pytest evals/test_disclosure.py deploy/scripts/test_preflight.py` (both read the disclosure; the first holds V1's cells), and the disclosure gate's test and a read-only run of the gate (§7). Read-only runs of human-only tools, which agents may run but not edit: after the candidate is written, `python3 -I -B -X pycache_prefix=/dev/null tools/gates/arrival_check.py apps/web/content/candidates/resume-author-links.pdf` (T007). Every edit to the stack note, including T012's paste of the full run and T013's finishing, is followed by `vitest run test/content/film-links.test.ts` (case 9 reads the note's hash and URLs) and `python3 -I evals/docs_links.py` (it reads `docs/**`). The full `make check` runs once at the stack's end, by one task, and goes in the stack note (rule 4).

## Departures from other documents

- `films/RESUME-LINKS-PLAN.md` step 5 (the room "keeps serving the approved C-0002 file", and "C-0004"): see Q6 in the spec; a dated note beside it, his text kept (Q98, §6).
- RESUME-LINKS-PLAN's "What has to be true first" item 1 names `films/<name>/media/<name>.mp4`; `kill-switch-b2`'s file is `media/kill-switch.mp4`. The table records it as it is (§1).
- Spec 002's contract §7 is unchanged. If the Author takes route (b), nothing in the contract changes either.

## Departures in the implementation (impl-023, 2026-11-14)

- **Case 11, added** (`film-links.test.ts`, T010's RED): FR-011's sentence, its three copies here (spec FR-011, §7, T010) alike, is in V1's Trigger right after `following the PDF link` and before `, and following "Credits"`. §3 had no case for T010; the task was test-first like the others.
- **FR-011's sentence, reworded by rv-rework2-spec-023's nit** (not blocking; with the page's Q31): "only when the visitor clicks it does the visitor's own PDF viewer, or the browser it opens, send the request". The same words in its three copies, in T010's commit; case 11 holds them alike.
- **The claim strings are the PDF's capitals** (T002): `LOCAL MODELS FIRST`, `A REAL-TIME COST METER`, `A $5-A-DAY KILL SWITCH`, `EVERY DATA FLOW DISCLOSED`, as pdf.js reads the approved file; §1 showed step 1's sentence case. The locator compares case-blind with whitespace removed, so either matches.
- **No `/ID` to copy** (T003): the approved file's trailer is `<</Size 539 /Root 142 0 R /Info 1 0 R>>`. The writer copies `/ID` only when the original has one (the PDFKit fixture does, and case 4 checks it is copied unchanged), so the candidate's trailer has none. rv-rework2-spec-023's nit on the second `/ID` is moot for this file.
- **`pdfinfo` isn't installed** in the agents' container: T007's link listing is the build's reader (case 5) and the appended section read as text (case 8); the Author's check stays `pdfinfo -url` in his terminal.
- **Case 2 in the gate's export**: the gate runs the suite in a `git archive` export with no `.git`, where `git ls-files` can't answer. There, case 2 takes a file's presence as its being tracked, since an export holds only the commit's files; in a checkout it asks git, as §3 says. Run in an export: 11 passed, 2 skipped.
- **The writer case doesn't create `candidates/`**: T007 ran `mkdir -p apps/web/content/candidates` first. Git keeps the folder only through the file, and the state never reads the folder (FR-013).
