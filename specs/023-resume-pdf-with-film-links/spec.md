# Feature Specification: The resume PDF, redone with links from the films

**Feature Branch**: the night's branches: this spec on `night/spec-023/spec-023`, reworked on `night/rework-spec-023/rework-spec-023`; its code on the implementer's `night/impl-023/impl-023`, in the night's one stack (`feat/018-hud-to-dino-stack`, named by the supervisor) · **Created**: 2026-11-14 · **Status**: Draft, clarified provisionally (see Clarifications); reworked 2026-11-14 after rv-spec-023 (B1 to B3, I1, I2, N1 to N5, two nits) · **Intent**: [intent/023](../../intent/023-resume-pdf-with-film-links.md)

**Input**, the Author's item, word for word (night order of 2026-11-13, item 6): "6. b) "re-do PDF resume with links from films""

**Builds on**: spec 002 (the PDF, FR-013 to FR-019; the amendment of 2026-11-09; contracts/resume-source.md §7), ADR 0034 (approvals by hash), `films/RESUME-LINKS-PLAN.md` (the plan the Author's session wrote for this change), intent 015 (the films). Spec 022's proposals (corpus from the film scripts) feed the film list; they aren't on main yet, so the list is a stand-in (Assumptions).

## Clarifications

### Session 2026-11-14 (spec-writer, under the Author's order of 2026-11-13)

His order: take each recommended answer at clarify and at the plan; each still goes to the morning page. The answers below are the recommended ones, taken provisionally. None is his words; his only words here are the item above and the corpus quotes in Assumptions. On the night's page these are Q25 to Q31 (Q3 was settled by the corpus and not asked), and Q98 below.

- Q: What does "links from films" mean (Q1)? → A (recommended, taken): each film-backed claim on the PDF's twin section becomes a clickable link to that film's landing page in the repository. Others: link straight to the MP4; put a QR code or a written URL beside each claim; films embedded in the room's resume (not the PDF).
  Reading: FR-001 to FR-004. The room's on-screen resume stays as approved (C-0001): its contract has no links (resume-source.md §4), and "PDF resume" is his word.
- Q: Link to the landing page or to the MP4 (Q2)? → A (recommended, taken): the landing page, `https://github.com/hareet/h4reet-ai/tree/main/films/<name>`. Others: the MP4's blob URL.
  Reading: `films/RESUME-LINKS-PLAN.md` gives the reason: a GitHub file view may offer the MP4 as a download; the landing page always renders and links the MP4, script, and sources. FR-002.
- Q: Which host and path (Q3)? → Not a question: the corpus has it in his words (`corpus/08-hareet-ai.md`: "https://github.com/hareet/h4reet-ai"). That passes PDF5 unchanged: the allowlist admits `github.com` when the first path segment is `hareet`, case-blind (`PDF_LINKS`), so no allowlist change and no corpus change (FR-005).
- Q: Four claims or five (Q4)? → A (recommended, taken): keep the four the PDF carries (local models first, real-time cost meter, $5-a-day kill switch, every data flow disclosed). Others: add "tested every time it changes" (the evals film), which changes his layout and needs his re-render.
  Reading: FR-001. The evals film stays in `films/`, linked from nowhere on the PDF.
- Q: How is the new PDF built (Q5)? → A (recommended, taken): two routes, one check. (a) The night builds a candidate by adding link annotations over the claims' text in his approved file, leaving every other byte of the page as it is. (b) The Author may instead edit his source and re-render in his terminal, as `films/RESUME-LINKS-PLAN.md` steps 1 to 4 say; the night gives him the edit, as RESUME-LINKS-PLAN step 1 gives it, with the table's URLs. Either file passes the same checks (PDF1 to PDF9 plus this spec's link checks) and is approved by its own hash. Others: only (b), leaving the night with the plan and no PDF; (a) only.
  Reading: his source, `resume/source/twin.html`, is untracked in his checkout and Chrome can't start in an agent's sandbox, so agents can't re-render. FR-006, FR-007; risk R-1 in plan.md.
- Q: Where does the candidate sit until he approves (Q6)? → A (recommended, taken): at `apps/web/content/candidates/resume-author-links.pdf`, which the build doesn't read. Others: replace `apps/web/content/resume-author.pdf` on the branch.
  Reading: ADR 0034 and spec 002's amendment: the room serves the committed file only when `main` approves its SHA-256; "unapproved … the PDF is the render". So replacing the file on a merged branch would make the room serve the render, not the approved C-0002 file, until his entry lands. `films/RESUME-LINKS-PLAN.md` step 5 reads otherwise ("The room keeps serving the approved C-0002 file until then"); a dated note beside it says so (Q98). The Author's publishing step is the `git mv` plus the entry. FR-008, FR-010.
- Q: When may it be published (Q7)? → A (recommended, taken): only after the repository is public, since the links resolve only then (`corpus/08`: "It isn't public yet"; his words, "the repo will be public very soon"), and after he has clicked each link from the PDF (RESUME-LINKS-PLAN step 6). Others: publish now with links that 404 until publication.
  Reading: FR-010; the approval request says so.
- Q: Does the disclosure change (Q8)? → A (recommended, taken): one sentence under V1: links in the downloaded PDF open only when the reader clicks one, on the reader's device; the site's origin isn't involved. Others: no change.
  Reading: FR-011, which gives the sentence's exact text and its place: V1's Trigger cell (reworked after rv-spec-023's B3; the other cells are spec 002's and spec 016's words, which `apps/web/test/disclosure.test.ts` and `evals/test_disclosure.py` hold cell for cell).

### Session 2026-11-14, rework (rv-spec-023's findings and Q98)

- Q98 (asked by rv-spec-023, on the page): rewrite `films/RESUME-LINKS-PLAN.md`'s step 5 and its open decisions in place, or add a dated note beside each? → A (recommended; answered "recommended", the Author 2026-11-13, by his order): add a dated note beside step 5 and beside each open decision, keeping his session's text as written. Reading: T009.
- rv-spec-023's B1 (`kill-switch-b2`'s media is `media/kill-switch.mp4`), B2 (the checks' states before and after publication), and B3 (the disclosure sentence's cell) are findings, not questions: each is fixed in FR-003, FR-006, FR-011, FR-012, US1, and the plan, with no film file renamed.

## User Scenarios & Testing

### User Story 1 - A visitor goes from a claim to its film (Priority: P1)

As a visitor reading the downloaded PDF, I want to click a claim in the twin section and land on the film that explains it, so that I can see how the claim is built.

**Why this priority**: It is the item. **Independent Test**: read the candidate's link annotations with `pdfinfo -url` or the build's reader; each of the four claims has one link, to the URL its row of `films/resume-links.json` gives.

**Acceptance Scenarios**:
1. **Given** the candidate PDF, **When** its links are read, **Then** exactly four film links are there, one over each of the four claims' text, each to `https://github.com/hareet/h4reet-ai/tree/main/films/<film>`, plus the links the approved file already has, unchanged.
2. **Given** each row of `films/resume-links.json`, **When** this tree is read, **Then** `films/<film>/README.md` and `films/<film>/<media>` (the row's `media`, under `films/<film>/media/`) are tracked in git, and the README's "Watch the film" link is that `<media>`. For `kill-switch-b2`, `<media>` is `media/kill-switch.mp4`.
3. **Given** the candidate, **When** its bytes are read, **Then** its look is the approved file's: the approved file's bytes are its prefix, so the page's content (one page, same text, same colours) is unchanged; and the appended section holds only the page object (same object number, `/Annots` extended) and four `/Annot /Link` objects, one per claim (a wrapped claim's lines as its `/QuadPoints`), each with `/Border [0 0 0]` and a `/URI` from the table, and none with `/AP`, `/C`, `/JS`, or `/Launch`, so nothing is drawn: no box, no underline.

### User Story 2 - The Author can publish it with one decision (Priority: P2)

As the Author, I want the candidate, its checks, and the approval request ready, so that publishing is my `git mv` and a one-line entry, not work.

**Independent Test**: `human-patches/023.md` holds the entry's text with the candidate's SHA-256, equal to `films/resume-links.json`'s `pdf_sha256`; the candidate passes PDF1 to PDF9 under a header like `main`'s.

**Acceptance Scenarios**:
1. **Given** the branch is merged, **When** nothing else happens, **Then** the room serves exactly what it served before (C-0002's file), and the link checks run their "before" cases.
2. **Given** he moves the candidate to `apps/web/content/resume-author.pdf` and adds the entry on `main`, **When** the room is built, **Then** it serves the candidate, byte for byte, under the room's download name, and the link checks pass in their "published" state with no edit to any test.
3. **Given** he moves it without the entry, **Then** the build serves the render, and says so (existing behaviour; spec 002).

### User Story 3 - The film list has one source (Priority: P3)

As the Author and the agents, we want the claim-to-film table in one file, so that spec 022's film proposals change a line, not code.

**Acceptance Scenarios**:
1. **Given** `films/resume-links.json`, **When** a claim, film, or media path is renamed there, **Then** the writer and the checks follow it with no code change; the edit text for his source (prose in the stack note) is rewritten from the table by hand, and a check fails while any of the table's URLs is missing from it.

### Edge Cases

- A claim's text wraps across two lines in the PDF: its link has one rectangle per line (quad points), not one box over both.
- A claim's text can't be found in the approved PDF (his layout moved): the writer fails, naming the claim, and writes nothing.
- The repository's URL changes (a rename at publication): one constant in `films/resume-links.json`; the allowlist still admits any repo under `/hareet`.
- The film's folder is renamed or its media is removed or renamed without the table: FR-012's check fails on this tree.
- The PDF is more than 2 pages or over 1,000,000 bytes after the edit: PDF2 fails it (the approved file is about 240 KB; links add under 2 KB).
- The room's header slots are empty: the PDF isn't served anyway (existing rule).
- A link target outside the allowlist (a typo, a different owner): PDF5 fails the candidate.
- The served file is neither C-0002's nor the table's recorded candidate (someone replaced it by hand, or route (b)'s render without the table's hash updated): the checks fail, naming the three hashes (FR-013).

## Requirements

### Functional Requirements

- **FR-001**: The candidate carries four film links, one per claim: LOCAL MODELS FIRST, A REAL-TIME COST METER, A $5-A-DAY KILL SWITCH, EVERY DATA FLOW DISCLOSED, in the PDF's own wording of them.
- **FR-002**: Each link targets its film's landing page under `https://github.com/hareet/h4reet-ai/tree/main/films/`: `local-first`, `cost-meter`, `kill-switch-b2`, `data-flows`.
- **FR-003**: The claim-to-film table lives once, in `films/resume-links.json`: the repository's URL, per film its claim text, folder, and `media` (the MP4's path inside the folder), and the candidate's recorded SHA-256 (`pdf_sha256`), the hash's only home in the tree. Every script and test reads it; the notes quote it.
- **FR-004**: The room's on-screen resume, `resume.yaml`, its lock, and the narration are unchanged.
- **FR-005**: No allowlist change, no corpus change. Every link passes PDF5 under `PDF_LINKS` as it is.
- **FR-006**: A writer makes the candidate from the approved file and the table: it adds link annotations only, as an appended section (US1-AC3), changes no byte of the original, and refuses to run on a file whose SHA-256 isn't C-0002's in `assets/policy/content-approvals.json`, or whose claim text it can't find. The C-0002 guard binds the writer only; the checks don't require the served file to be C-0002's (FR-013).
- **FR-007**: The Author gets, as text, the edit to his source (`resume/source/twin.html`), as RESUME-LINKS-PLAN step 1 gives it, with the table's URLs, and its render steps 2 to 4, for the route that doesn't use the writer. The file he renders is checked by the same checks, as the "published" state of FR-013 once he records its hash in the table.
- **FR-008**: The candidate sits at `apps/web/content/candidates/resume-author-links.pdf`, which no build step reads. No agent writes `apps/web/content/resume-author.pdf` or `assets/policy/`.
- **FR-009**: A test runs the existing PDF1 to PDF9 against the candidate under a header like `main`'s, a link test (FR-001, FR-002, FR-010) against the table, and a structure test of the appended section (US1-AC3).
- **FR-010**: The approval request names the candidate's SHA-256, the entry's text (kind `resume`, the next free ID on `main` when he adds it, C-0005 today), and the two things that must be true first: the repository is public, and each link has been clicked from the PDF. It says the entry goes on `main` after the merge, as ADR 0034 orders it.
- **FR-011**: `docs/data-flow-disclosure.md` row V1's Trigger cell gains this sentence, inserted right after `following the PDF link` and before `, and following "Credits"` (the cell must still end with spec 016's words, which `evals/test_disclosure.py` checks), word for word, between the fences (its backticks are part of it):

  ```text
   (a link in the downloaded PDF, such as a claim's link to its film's page in the repository on `github.com`, isn't this row's flow: only when the visitor clicks it does the visitor's own PDF viewer send the request, from the visitor's device to that host; the site's origin isn't involved)
  ```

  It starts with one space and holds no pipe. No other cell of V1 changes. The disclosure's checks still pass: `apps/web/test/disclosure.test.ts`, `apps/web/test/site.test.ts`, `evals/test_disclosure.py`, and the preflight's.
- **FR-012**: For each row of the table, the tree holds `films/<film>/README.md` and `films/<film>/<media>`, with `<media>` under `media/` and ending `.mp4`, both tracked in git, and the README's "Watch the film" link is `<media>`; a test fails when one isn't so. No film file is renamed.
- **FR-013**: The checks know three states of the tree, read from the served file's SHA-256, C-0002's in the approvals file, the table's `pdf_sha256`, and whether the candidate exists:
  - **before** (served file is C-0002's, candidate present, and its hash is `pdf_sha256`): every case runs, the candidate's (5, 7, 8) included;
  - **published** (served file's hash is `pdf_sha256`, `candidates/` gone): the candidate's cases skip, each with the reason stated ("published: the served file is the candidate"), and a published case reads the served file's links and checks them against the table; the build's own PDF checks (spec 002; `author-pdf.test.ts` covers their mechanism) check the file at every build;
  - **neither**: the checks fail, naming the three hashes.

### Key Entities

- **Film link table** (`films/resume-links.json`): `{schema: 1, repo: <URL>, pdf_sha256: <hex or "">, links: [{claim, film, media}]}`; the URL of each is `repo/tree/main/films/<film>`; its MP4 is `films/<film>/<media>`.
- **Candidate PDF**: the approved PDF plus an appended section of four link annotations, one per claim; never served until moved and approved.

## Success Criteria

- **SC-001**: All four links are in the candidate and each lands on a page that exists in the published repository (checked by the Author after publication; by file existence before).
- **SC-002**: The candidate passes PDF1 to PDF9 and one page.
- **SC-003**: Until the Author acts, the served PDF is byte-identical to C-0002's.
- **SC-004**: The approved file's bytes are the candidate's prefix, and the appended section holds only what US1-AC3 lists.
- **SC-005**: The approval request needs one command and one entry from him.

## Assumptions

- **Film list stand-in.** Spec 022's proposals aren't on main (its intent is a draft). The table is `films/RESUME-LINKS-PLAN.md`'s, which is the Author's session's plan. If 022's proposals or his answers change the films' names, claims, or media, `films/resume-links.json` changes and nothing else does (the stack note's edit text is redone from it, FR-007).
- **The repository URL** is his: `https://github.com/hareet/h4reet-ai`, in `corpus/08-hareet-ai.md`, in his words ("And share the GitHub repo: https://github.com/hareet/h4reet-ai ."). It isn't public yet (`corpus/08`); until it is, the links 404 and the candidate can't be approved (FR-010).
- **Films' media are in git** (ADR 0050): `git ls-files films` lists seven MP4s and a README per film on this base. The kill switch's film is `kill-switch-b2`, as `films/RESUME-LINKS-PLAN.md` says, and its MP4 is `films/kill-switch-b2/media/kill-switch.mp4`, which its README links; the other three are `media/<film>.mp4`. RESUME-LINKS-PLAN's "What has to be true first" item 1 names `films/<name>/media/<name>.mp4`, which `kill-switch-b2` doesn't follow; the table's `media` field records each file as it is, and no film file is renamed.
- **No constitution control is deferred or dropped.** Principle VII and VIII: no new claim about him is written; the claims are the PDF's own, already approved as C-0002's text. The links add pointers, not statements. If the Author's reading of his claims differs, he sees it at the approval.
- **Cost**: $0 at run time; dev-time tokens only. **Degraded mode**: none; a static file. **Telemetry/dashboard**: PDF downloads are already counted (spec 002); link clicks happen in the reader's PDF viewer and aren't visible to the site, by design (no new telemetry, no new panel).
- **Human-only paths**: this spec touches none; the approval entry is described in `docs/merge-requests/human-patches/023.md`.
