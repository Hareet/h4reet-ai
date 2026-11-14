# Intent: hareet.ai's corpus from the film scripts
Author: Hareet (the Author), through the night order of 2026-11-13; drafted by the spec-writer for spec 022. Status: draft. Created: 2026-11-14.

His answer on the decision page accepts this, or corrects it, before any of it reaches main.

## Problem

His item, word for word, from his order of 2026-11-13 (item 5 in the order's numbering):

> 5. g) "hareet-ai corpus from film scripts". Corpus changes are proposals in `corpus/proposals/`, for his hand.

What the repository shows, which is the drafter's reading and not his words: `corpus/08-hareet-ai.md` holds the project's topic, and the twin answers only from the corpus (Constitution VIII). The repository's film scripts (`films/SCRIPTS.md` and each film's `script.txt`) say more about how hareet.ai is built than `08` does. Whether the twin can say it depends on the corpus holding it. The reading of "film scripts" as these scripts is the drafter's; question Q1 of the clarifications keeps the other reading open.

## Proposed outcome

A proposal in `corpus/proposals/`, for his hand, that carries what the film scripts say about hareet.ai into the corpus, in the corpus's own tags and slots. Nothing under `corpus/` changes except by his hand.

## Affected users and systems

The Author (he applies the proposal), the twin (a visitor's answers), the evals generated from the corpus, the resume's lock on `08`. No visitor-facing code.

## Constraints

- The corpus is human-only; agents propose (`corpus/README.md`, "Who edits the corpus").
- His own words stay in his words (`CLAUDE.md`, "Things Claude gets wrong").
- No fact about him that isn't in the corpus or a filled `facts/` slot.
- Constitution VII and VIII.

## Expected cost impact

None at run time. The spec-writer's tokens only.

## Data-flow impact

None. No byte leaves the visitor's device or the local tier.

## Open questions

Carried in `specs/022-corpus-from-film-scripts/spec.md`, under Clarifications.
