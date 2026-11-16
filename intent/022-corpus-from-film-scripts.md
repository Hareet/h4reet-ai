# Intent: hareet.ai's corpus from the film scripts
Author: Hareet (the Author), through the night order of 2026-11-13; drafted by the spec-writer for spec 022. Status: draft. Created: 2026-11-14.

His answer on the decision page accepts this, or corrects it, before any of it reaches main.

## Problem

His item, in his words, from his order of 2026-11-13:

> g) "hareet-ai corpus from film scripts"

His orders file lists it as item 5 and adds "Corpus changes are proposals in `corpus/proposals/`, for his hand." That sentence is the orders file's, not his words; it restates the night's rule 2, under "What still waits for him": "corpus changes, which are proposals in `corpus/proposals/`".

What the repository shows, which is the drafter's reading and not his words: `corpus/08-hareet-ai.md` holds the project's topic, and the twin answers only from the corpus (Constitution VIII). The repository's film scripts (`films/SCRIPTS.md`, and `films/kill-switch-b2/script.txt`, which `SCRIPTS.md` has no section for) say more about how hareet.ai is built than `08` does. The films' note records his approval of the scripts (`docs/merge-requests/2026-11-11-feat-015-explainer-films.md:4`). Whether the twin can say it depends on the corpus holding it. The reading of "film scripts" as these scripts is the drafter's; question Q1 of the clarifications keeps the other reading open.

## Proposed outcome

A proposal in `corpus/proposals/`, for his hand, that carries what the film scripts say about hareet.ai into the corpus, in the corpus's own tags and slots. Nothing under `corpus/` changes except by his hand.

## Affected users and systems

The Author (he applies the proposal), the twin (a visitor's answers), the evals generated from the corpus, the resume's lock on `08`. No visitor-facing code.

## Constraints

- The corpus is human-only; agents propose (`corpus/README.md`, "Who edits the corpus"; the night's rule 2).
- His own words stay in his words (`CLAUDE.md`, "Things Claude gets wrong").
- No fact about him that isn't in the corpus or a filled `facts/` slot.
- Constitution VII and VIII.

## Expected cost impact

None at run time. The spec-writer's tokens only.

## Data-flow impact

None. No byte leaves the visitor's device or the local tier.

## Open questions

Carried in `specs/022-corpus-from-film-scripts/spec.md`, under Clarifications.
