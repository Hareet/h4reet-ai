# Feature Specification: The resume PDF, redone with links from the films

**Feature Branch**: `feat/023-resume-pdf-with-film-links` · **Created**: 2026-11-14 · **Status**: Draft, clarified provisionally (see Clarifications) · **Intent**: [intent/023](../../intent/023-resume-pdf-with-film-links.md)

**Input**, the Author's item, word for word (night order of 2026-11-13, item 6): "6. b) "re-do PDF resume with links from films""

**Builds on**: spec 002 (the PDF, FR-013 to FR-019; the amendment of 2026-11-09; contracts/resume-source.md §7), ADR 0034 (approvals by hash), `films/RESUME-LINKS-PLAN.md` (the plan the Author's session wrote for this change), intent 015 (the films). Spec 022's proposals (corpus from the film scripts) feed the film list; they aren't on main yet, so the list is a stand-in (Assumptions).

## Clarifications

### Session 2026-11-14 (spec-writer, under the Author's order of 2026-11-13)

His order: take each recommended answer at clarify and at the plan; each still goes to the morning page. The answers below are the recommended ones, taken provisionally. None is his words; his only words here are the item above and the corpus quotes in Assumptions.

- Q: What does "links from films" mean (Q1)? → A (recommended, taken): each film-backed claim on the PDF's twin section becomes a clickable link to that film's landing page in the repository. Others: link straight to the MP4; put a QR code or a written URL beside each claim; films embedded in the room's resume (not the PDF).
  Reading: FR-001 to FR-004. The room's on-screen resume stays as approved (C-0001): its contract has no links (resume-source.md §4), and "PDF resume" is his word.
- Q: Link to the landing page or to the MP4 (Q2)? → A (recommended, taken): the landing page, `https://github.com/hareet/h4reet-ai/tree/main/films/<name>`. Others: the MP4's blob URL.
  Reading: `films/RESUME-LINKS-PLAN.md` gives the reason: a GitHub file view may offer the MP4 as a download; the landing page always renders and links the MP4, script, and sources. FR-002.
- Q: Which host and path (Q3)? → Not a question: the corpus has it in his words (`corpus/08-hareet-ai.md`: "https://github.com/hareet/h4reet-ai"). That passes PDF5 unchanged: the allowlist admits `github.com` when the first path segment is `hareet`, case-blind (`PDF_LINKS`), so no allowlist change and no corpus change (FR-005).
- Q: Four claims or five (Q4)? → A (recommended, taken): keep the four the PDF carries (local models first, real-time cost meter, $5-a-day kill switch, every data flow disclosed). Others: add "tested every time it changes" (the evals film), which changes his layout and needs his re-render.
  Reading: FR-001. The evals film stays in `films/`, linked from nowhere on the PDF.
- Q: How is the new PDF built (Q5)? → A (recommended, taken): two routes, one check. (a) The night builds a candidate by adding link annotations over the claims' text in his approved file, leaving every other byte of the page as it is. (b) The Author may instead edit his source and re-render in his terminal, as `films/RESUME-LINKS-PLAN.md` steps 1 to 4 say; the night gives him the exact edit as text. Either file passes the same checks (PDF1 to PDF9 plus this spec's link checks) and is approved by its own hash. Others: only (b), leaving the night with the plan and no PDF; (a) only.
  Reading: his source, `resume/source/twin.html`, is untracked in his checkout and Chrome can't start in an agent's sandbox, so agents can't re-render. FR-006, FR-007; risk R-1 in plan.md.
- Q: Where does the candidate sit until he approves (Q6)? → A (recommended, taken): at `apps/web/content/candidates/resume-author-links.pdf`, which the build doesn't read. Others: replace `apps/web/content/resume-author.pdf` on the branch.
  Reading: ADR 0034 and spec 002's amendment: the room serves the committed file only when `main` approves its SHA-256; "unapproved … the PDF is the render". So replacing the file on a merged branch would make the room serve the render, not the approved C-0002 file, until his entry lands. `films/RESUME-LINKS-PLAN.md` step 5 reads otherwise ("The room keeps serving the approved C-0002 file until then"); this spec corrects it. The Author's publishing step is the `git mv` plus the entry. FR-008, FR-010.
- Q: When may it be published (Q7)? → A (recommended, taken): only after the repository is public, since the links resolve only then (`corpus/08`: "It isn't public yet"; his words, "the repo will be public very soon"), and after he has clicked each link from the PDF (RESUME-LINKS-PLAN step 6). Others: publish now with links that 404 until publication.
  Reading: FR-010; the approval request says so.
- Q: Does the disclosure change (Q8)? → A (recommended, taken): one sentence under V1: links in the downloaded PDF open only when the reader clicks one, on the reader's device; the site's origin isn't involved. Others: no change.
  Reading: FR-011.

## User Scenarios & Testing

### User Story 1 - A visitor goes from a claim to its film (Priority: P1)

As a visitor reading the downloaded PDF, I want to click a claim in the twin section and land on the film that explains it, so that I can see how the claim is built.

**Why this priority**: It is the item. **Independent Test**: read the candidate's link annotations with `pdfinfo -url` or the build's reader; each of the four claims has one link, to the URL in `films/resume-links.json`.

**Acceptance Scenarios**:
1. **Given** the candidate PDF, **When** its links are read, **Then** exactly four film links are there, one over each of the four claims' text, each to `https://github.com/hareet/h4reet-ai/tree/main/films/<name>`, plus the links the approved file already has.
2. **Given** each link's film folder, **When** this tree is read, **Then** the folder holds `README.md` and `media/<name>.mp4`, tracked in git.
3. **Given** the candidate, **When** it is rendered, **Then** its look is the approved file's: still one page, same text, same colours, no underline added.

### User Story 2 - The Author can publish it with one decision (Priority: P2)

As the Author, I want the candidate, its checks, and the approval entry ready, so that publishing is my `git mv` and a one-line entry, not work.

**Independent Test**: `human-patches/023.md` holds the entry's text with the candidate's SHA-256; the candidate passes PDF1 to PDF9 under `main`'s header.

**Acceptance Scenarios**:
1. **Given** the branch is merged, **When** nothing else happens, **Then** the room serves exactly what it served before (C-0002's file).
2. **Given** he moves the candidate to `apps/web/content/resume-author.pdf` and adds the entry on `main`, **When** the room is built, **Then** it serves the candidate, byte for byte, under the room's download name.
3. **Given** he moves it without the entry, **Then** the build serves the render, and says so (existing behaviour; spec 002).

### User Story 3 - The film list has one source (Priority: P3)

As the Author and the agents, we want the claim-to-film table in one file, so that spec 022's film proposals change a line, not code.

**Acceptance Scenarios**:
1. **Given** `films/resume-links.json`, **When** a claim or film is renamed there, **Then** the build script, the checks, and the edit text for his source all follow it.

### Edge Cases

- A claim's text wraps across two lines in the PDF: its link has one rectangle per line (quad points), not one box over both.
- A claim's text can't be found in the approved PDF (his layout moved): the script fails, naming the claim, and writes nothing.
- The repository's URL changes (a rename at publication): one constant in `films/resume-links.json`; the allowlist still admits any repo under `/hareet`.
- The film's folder is renamed or its media is removed: the check fails on this tree.
- The PDF is more than 2 pages or over 1,000,000 bytes after the edit: PDF2 fails it (the approved file is about 240 KB; links add under 2 KB).
- The room's header slots are empty: the PDF isn't served anyway (existing rule).
- A link target outside the allowlist (a typo, a different owner): PDF5 fails the candidate.

## Requirements

### Functional Requirements

- **FR-001**: The candidate carries four film links, one per claim: LOCAL MODELS FIRST, A REAL-TIME COST METER, A $5-A-DAY KILL SWITCH, EVERY DATA FLOW DISCLOSED, in the PDF's own wording of them.
- **FR-002**: Each link targets its film's landing page under `https://github.com/hareet/h4reet-ai/tree/main/films/`: `local-first`, `cost-meter`, `kill-switch-b2`, `data-flows`.
- **FR-003**: The claim-to-film table lives once, in `films/resume-links.json` (claim text, film folder, URL). Every script and test reads it.
- **FR-004**: The room's on-screen resume, `resume.yaml`, its lock, and the narration are unchanged.
- **FR-005**: No allowlist change, no corpus change. Every link passes PDF5 under `PDF_LINKS` as it is.
- **FR-006**: A build script writes the candidate from the approved file and the table: it adds link annotations only, changes no page content, and refuses to run on a file whose SHA-256 isn't C-0002's, or whose claim text it can't find.
- **FR-007**: The Author gets, as text, the exact edit to his source (`resume/source/twin.html`) and its render steps, for the route that doesn't use the script. The file he renders is checked by the same checks.
- **FR-008**: The candidate sits at `apps/web/content/candidates/resume-author-links.pdf`, which no build step reads. No agent writes `apps/web/content/resume-author.pdf` or `assets/policy/`.
- **FR-009**: A test runs the existing PDF1 to PDF9 against the candidate under a header like `main`'s, and a link test (FR-001, FR-002, FR-010) against the table.
- **FR-010**: The approval request names the candidate's SHA-256, the entry's text (kind `resume`), and the two things that must be true first: the repository is public, and each link has been clicked from the PDF. It says the entry goes on `main` after the merge, as ADR 0034 orders it.
- **FR-011**: `docs/data-flow-disclosure.md` row V1 gains the sentence in Q8; the data-flow check that reads the file still passes.
- **FR-012**: For each film in the table, the tree holds `films/<name>/README.md` and `films/<name>/media/<name>.mp4`, tracked in git; a test fails when one is missing.

### Key Entities

- **Film link table** (`films/resume-links.json`): `{schema: 1, repo: <URL>, links: [{claim, film}]}`; the URL of each is `repo/tree/main/films/<film>`.
- **Candidate PDF**: the approved PDF plus four link annotations; never served until moved and approved.

## Success Criteria

- **SC-001**: All four links are in the candidate and each lands on a page that exists in the published repository (checked by the Author after publication; by file existence before).
- **SC-002**: The candidate passes PDF1 to PDF9 and one page.
- **SC-003**: Until the Author acts, the served PDF is byte-identical to C-0002's.
- **SC-004**: Rendering the candidate's page 1 to an image differs from the approved file's only inside the claims' rectangles by nothing visible: it's identical.
- **SC-005**: The approval request needs one command and one entry from him.

## Assumptions

- **Film list stand-in.** Spec 022's proposals aren't on main (its intent is a draft). The table is `films/RESUME-LINKS-PLAN.md`'s, which is the Author's session's plan. If 022's proposals or his answers change the films' names or claims, `films/resume-links.json` changes and nothing else does.
- **The repository URL** is his: `https://github.com/hareet/h4reet-ai`, in `corpus/08-hareet-ai.md`, in his words ("And share the GitHub repo: https://github.com/hareet/h4reet-ai ."). It isn't public yet (`corpus/08`); until it is, the links 404 and the candidate can't be approved (FR-010).
- **Films' media are in git** (ADR 0050): `git ls-files films` lists seven MP4s and a README per film on this base. The kill switch's film is `kill-switch-b2`, as `films/RESUME-LINKS-PLAN.md` says.
- **No constitution control is deferred or dropped.** Principle VII and VIII: no new claim about him is written; the claims are the PDF's own, already approved as C-0002's text. The links add pointers, not statements. If the Author's reading of his claims differs, he sees it at the approval.
- **Cost**: $0 at run time; dev-time tokens only. **Degraded mode**: none; a static file. **Telemetry/dashboard**: PDF downloads are already counted (spec 002); link clicks happen in the reader's PDF viewer and aren't visible to the site, by design (no new telemetry, no new panel).
- **Human-only paths**: this spec touches none; the approval entry is described in `docs/merge-requests/human-patches/023.md`.
