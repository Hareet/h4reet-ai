# Intent: the resume PDF, redone with links from the films
Author: Hareet (the Author), through the night order of 2026-11-13; drafted by the spec-writer for spec 023. Status: draft. Created: 2026-11-14.

His answer on the decision page accepts this, or corrects it, before any of it reaches main.

## Problem

His item, word for word, from his order of 2026-11-13 (item 6 in the order's numbering):

> 6. b) "re-do PDF resume with links from films"

What the repository shows, which is the drafter's reading and not his words: the PDF the room serves is his designed file, `apps/web/content/resume-author.pdf`, approved by hash as C-0002 (spec 002's amendment of 2026-11-09). Its twin section lists four claims; `films/RESUME-LINKS-PLAN.md` already plans making each a link to its film. The explainer films exist in `films/` (intent 015) with their media in git. A visitor who reads a claim on the PDF can't get from it to the film that explains it. The reading of "links from films" as links from the PDF's claims to the films is the drafter's; question Q1 of the clarifications keeps the other readings open.

## Proposed outcome

A re-done PDF whose film-backed claims are links to their films, built and checked by the night, with the approval request for it ready. Publishing it, which needs his approval entry, stays his.

## Affected users and systems

Visitors who download the PDF (a hiring manager reading it later); the Author (he approves the new hash and re-renders from his own source if he chooses); the room's PDF checks (PDF1 to PDF9); `films/`.

## Constraints

- The PDF is his designed file; any edit needs a new hash (spec 002 amendment; ADR 0034). Agents don't approve, publish, or replace the approved file.
- The PDF's links go only to hosts the corpus names (PDF5).
- His own words stay in his words (`CLAUDE.md`, "Things Claude gets wrong").
- No fact about him that isn't in the corpus or a filled `facts/` slot.

## Expected cost impact

None at run time. The spec-writer's and implementer's tokens only.

## Data-flow impact

None from the site. A link in a downloaded PDF opens only when the reader clicks it, from the reader's own device; the room sends nothing. The PDF already links `github.com/Hareet`.

## Open questions

Carried in `specs/023-resume-pdf-with-film-links/spec.md`, under Clarifications.
