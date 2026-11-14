# Intent: When the twin's file context stops being enough (corpus retrieval ADR)
Author: Hareet (the Author), through the night order of 2026-11-13; drafted by the spec-writer for spec 027. Status: draft. Created: 2026-11-14.

His answer on the decision page accepts this, or corrects it, before any of it reaches main.

## Problem

His item, as his orders file lists it; his own words are the quoted letter and title:

> j) "future knowledge corpus gains answers or more questions as we go to RAG then we go to vector DB and answers to why we are okay using file context as of now and this size"

The orders file's line under it, which is the orders file's wording and not a quote of his:

> Its first step is an ADR on when file context stops being enough, with the measured size of today's corpus. It's built only as far as that ADR decides.

What the repository shows, which is the drafter's reading and not his words: the twin answers from a committed pack compiled from `corpus/` (ADR 0040), and no ADR records how big the corpus is, how much of it a turn can hold, or at what size the design would have to change.

## Proposed outcome

An ADR that answers "why we are okay using file context as of now and this size", with today's corpus measured, and that names the measured thresholds at which RAG, then a vector DB, would start, and how the corpus "gains answers or more questions as we go". Anything built is built only as far as that ADR decides.

## Affected users and systems

The Author (he reads and accepts the ADR), the twin's grounding (`config/twin/corpus.json`, `services/gateway/src/twin/`), the corpus (read only), the agents who change either.

## Constraints

- The corpus is human-only; agents read it and propose (`corpus/README.md`, "Who edits the corpus").
- Constitution VIII (the twin speaks only from the corpus) and V (cost is a first-class signal).
- Model calls go through `services/gateway` only (`CLAUDE.md`).

## Expected cost impact

Carried by the spec: the drafter expects none at run time unless the ADR decides to build a retrieval step.

## Data-flow impact

Carried by the spec: the drafter expects none unless the ADR decides to build a retrieval step.

## Open questions

Carried in `specs/027-corpus-retrieval-adr/spec.md`, under Clarifications.
