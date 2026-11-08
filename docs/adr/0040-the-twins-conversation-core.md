# ADR 0040: The twin's conversation core: a gateway route, a committed pack, deterministic guards, and readiness by hash (spec 007)

Status: proposed, 2026-11-07 · Spec: 007 (FR-001 to FR-054; its Clarifications, each provisional; plan §1 to §6, §13) · Number: 0039 is allocated to spec 008's walking view (its plan, ADR 0039), so this ADR takes 0040.

## Context

Every surface of the room answers with a fixed message, and spec 002's Phase 7 waits for "a spec of the twin's conversation core". The Author, on 2026-11-07, as the main session's brief relays it:

> And when can we click on the items and have the conversation?

And then, asked to start:

> The conversation: Keep going! draft the intent, spec, and give me the final merge commands. I am stepping away for the night.

Spec 007 answers it under the project's relaxed lifecycle for the Author's absences: its five clarifications took the recommended options, and each is provisional and his to overturn. Its constraints are intent 000's, in his words: "The twin is always disclosed as AI, speaks only from the corpus, refuses bad-faith requests, and never inflates my role. Guardrails and evals are public." And `CLAUDE.md`'s: "Model calls go through `services/gateway` only."

## Decision

Proposed, as `feat/007-twin-conversation` builds it:

- **The route lives in the gateway**, as `POST /room/turn` and the module `src/twin/`, calling `Gateway.complete` in-process with the purpose `twin`. The stack's edge forwards the room's `POST /api/room/turn` on x005 to it. Routing, the kill switch, the meter, the ledger, and the spans are the ones hello uses; no service, port, network, or store is added. The kill switch is read before the grounding or the prompt is built: the prompt is a function the gateway calls only after its state read passes.
- **Grounding is a committed pack**, `config/twin/corpus.json`, compiled deterministically from the corpus's public topic files and filled slots by the room's build (`apps/web/build/twin-pack.ts`, `npm run twin:pack -w apps/web`), and checked fresh by `make test`. A topic's turn reads the rules, `00-profile.md`, and the topic's files; free talk adds the sections an in-process BM25 ranking scores highest. No embeddings, no vector store, no second model call.
- **One completion per turn**, local first, the Bedrock fallback on prod inside the sub-budget, degraded otherwise: `config/routing.yaml` is unchanged. A turn's per-turn limits are `config/budgets.yaml`'s `limits.twin`, the Author's (his patch P-2); a twin call's reservation counts its own input bound and output cap.
- **Eight deterministic guards** run on the whole answer before any word leaves: numbers, amounts, disclosure, the prompt, secret-shaped text, links, ownership verbs, and the privacy promise and the agents' share in the corpus's words. A failing answer is replaced whole by a fixed line, or for G8 by the corpus's own Golden Q&A answer, with no retry; its cost stays counted, and the withholding is counted by guard. No model judges another.
- **Readiness by hash, in a human-only file**, `config/twin-readiness.yaml`, created with its deny in the Author's patch P-1. A topic, or free talk, is ready only while its entry says so and both its hashes, the pack's for the topic and the prompt's, equal the running ones. The gateway and the room's build read the same file by the same rule. A missing file makes nothing ready, and the gateway still starts.
- **The Author's evaluation route**, `POST /admin/twin/turn` on the admin listener, runs the same pipeline on one named adapter whatever readiness says, never failing over, a paid adapter attributed `test` inside the ceilings, with an audit row. His live product and red-team runs go through it.

The five provisional answers this rests on, each the Author's to overturn: the answer arrives whole after the guards (Q1); the Author marks readiness by hand at the hashes his live runs passed (Q2); a guard's failure replaces the answer, with no retry (Q3); a ready piece's selection makes one generated opening (Q4); and the twin may state a filled, public-safe slot's amount from its grounding, never a live cost (Q5).

## Alternatives considered

- **A `services/twin` container calling the gateway over HTTP.** A new service row, an internal endpoint that takes arbitrary prompts, a second hop, and telemetry split in two. Rejected.
- **Grounding in the browser.** The visitor's device would download the pack and the instructions, and the guards would run where the visitor controls them; the model can't run there anyway (row V2's reason). Rejected.
- **A vector store with embeddings.** A model and a store to run and evaluate, for nine files whose topic turns need no retrieval at all. Rejected.
- **Streaming the answer** (Q1's options B and C): a later sentence can't take back an earlier one, and G8's replacement can't apply. Rejected provisionally.
- **An agent-editable readiness file, or readiness that follows the evaluation history** (Q2's B and C): a branch could open a topic. Rejected provisionally.
- **A retry with a stricter instruction** (Q3's B): double cost and latency, and a second sample can pass by chance. Rejected provisionally.

## Consequences

- The route merges dormant: on prod, every turn answers `twin_unavailable` until P-2 sets `limits.twin`, and every piece keeps its fixed message until the Author marks a topic ready.
- Any change to a topic's corpus files, the prompt, or the fixed lines closes that topic until the Author's runs test the new hashes: friction by design (spec 007's R-6).
- G7 and G8 match words, so they can withhold a good answer; the live runs count withholdings by guard, and their triggers are refined with fixtures (R-3).
