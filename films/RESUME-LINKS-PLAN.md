# Plan: the resume's claims linking to their films

The resume's twin section (`resume/source/twin.html`, untracked in the main checkout) lists four claims in small caps: LOCAL MODELS FIRST · A REAL-TIME COST METER · A $5-A-DAY KILL SWITCH · EVERY DATA FLOW DISCLOSED. This plan makes each one a link to its film in the published repository, and rebuilds the two places the PDF lives: the copy you send, and the copy the room serves (`apps/web/content/resume-author.pdf`, approved by hash as C-0002).

## What has to be true first

1. The films' media are in git: `films/<name>/media/<name>.mp4` (and the kill switch's GIF), after the media gate patch (ADR 0050) is on `main` and the media commit is merged.
2. The repository is pushed and public, so the links resolve. Confirm its URL before editing (`OWNER`/`REPO` below; the corpus's golden answer uses `https://github.com/hareet/h4reet-ai`, and the resume's contact line shows `github.com/Hareet`).
3. Each film has a landing page, `films/<name>/README.md`: the film's one-line summary, "Watch the film" (the MP4), and its script, captions, and sources. GitHub renders that page at a stable URL whatever happens to the file names later.

## The link targets

| Claim on the resume | Link (the film's landing page) |
|---|---|
| LOCAL MODELS FIRST | `https://github.com/OWNER/REPO/tree/main/films/local-first` |
| A REAL-TIME COST METER | `https://github.com/OWNER/REPO/tree/main/films/cost-meter` |
| A $5-A-DAY KILL SWITCH | `https://github.com/OWNER/REPO/tree/main/films/kill-switch-b2` |
| EVERY DATA FLOW DISCLOSED | `https://github.com/OWNER/REPO/tree/main/films/data-flows` |
| optional fifth: TESTED EVERY TIME IT CHANGES | `https://github.com/OWNER/REPO/tree/main/films/evals` |

Why the landing page and not the MP4 itself: a GitHub file view may offer the MP4 as a download rather than play it, depending on its size and the browser; the landing page always renders, shows what the film covers, and links the MP4, the script, and the sources. Check after publication (step 6); if the MP4 plays inline in GitHub's file view on desktop and phone, the links can point straight at `…/blob/main/films/<name>/media/<name>.mp4` instead.

## Steps

1. **Edit the source** (`resume/source/twin.html`): wrap each claim's text in its link, keeping the look (same colour, no underline; the PDF keeps `<a href>` as a clickable link):

   ```html
   <li><a href="https://github.com/OWNER/REPO/tree/main/films/local-first">Local models first</a></li>
   ```

   and add `.twin__proof a { color: inherit; text-decoration: none; }` to its style. Decide whether to add the fifth claim; the line wraps at four today, so a fifth may need the letter-spacing or size nudged (render and look).
2. **Render** with your existing script (`resume/source/render.sh twin`, which prints with headless Chrome and reports pages and spare room). Check it's still one page.
3. **Check the links survive in the PDF**: `pdfinfo -url out/twin.pdf` (poppler-utils) should list the four (or five) URLs; or open it and click each.
4. **The copy you send**: export it as you did for `Hareet-Sandhu-Resume-hareet-ai.pdf`.
5. **The copy the room serves** (spec 002): an agent session puts the new PDF at `apps/web/content/resume-author.pdf` on a branch (with its `make test` and the room's resume checks), and you approve its new SHA-256 in `assets/policy/content-approvals.json` on `main` (a new entry, C-0004, kind `resume`), then gate and merge that branch. The room keeps serving the approved C-0002 file until then (ADR 0034). A link in the PDF opens only when a reader clicks it, so it adds no data flow from the room; the PDF already links `github.com/Hareet`.
   > **Note, 2026-11-14 (the night's spec 023: its Q6, the page's Q29; this note by the page's Q98):** with an unapproved file at `apps/web/content/resume-author.pdf`, the room serves the render, not C-0002's file (ADR 0034; spec 002's amendment: "unapproved … the PDF is the render"). So the night's candidate waits at `apps/web/content/candidates/resume-author-links.pdf`, which the build doesn't read, and publishing is your `git mv` onto the served path in the same commit as the entry, on `main` after the merge. C-0004 is taken (the twin's shirt lettering); the entry takes the next free ID on `main` when you add it (C-0005 today). The steps: `docs/merge-requests/human-patches/023.md`.
6. **After publication, test every link** on desktop and on a phone, from the PDF itself: each lands on its film's page, and the film plays.

## Open decisions

- The repository's public URL (OWNER/REPO).
  - *Note, 2026-11-14 (spec 023's Q3, not asked: the corpus has it):* `https://github.com/hareet/h4reet-ai`, in your words in `corpus/08-hareet-ai.md`; it is `repo` in `films/resume-links.json`.
- A fifth claim for the evals film, or keep four.
  - *Note, 2026-11-14 (spec 023's Q4, the page's Q27; recommended, taken provisionally under your order of 2026-11-13):* four kept; the evals film is linked from nowhere on the PDF.
- Landing pages or direct MP4 links (decide after step 6's test).
  - *Note, 2026-11-14 (spec 023's Q2, the page's Q26; recommended, taken provisionally):* landing pages, until your step 6 test says the MP4 plays inline.
