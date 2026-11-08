# Intent: The twin's conversation core — click a piece, or type, and the twin answers from the corpus
Author: the Author (drafted by Claude from the Author's words, as the main session's brief of 2026-11-07 relays them, and from intent 000). Status: draft. Created: 2026-11-07.

## The Author's words

Quoted as the main session's brief of 2026-11-07 records them. The reading beside each is this draft's, to correct where it's wrong; it never replaces the words.

> And when can we click on the items and have the conversation?

Then, asked to start:

> The conversation: Keep going! draft the intent, spec, and give me the final merge commands. I am stepping away for the night.

Reading: "the items" are the room's selectables (spec 004's bicycle, snowboard, chalkboard, and "Laptop and screen"), which today answer only with a fixed message. "Keep going!" is the direction under which this draft, its spec, and the spec's five questions go ahead tonight, each recommended answer taken provisionally and left for the Author to overturn. The merge commands are the main session's to give; this folder holds documents only.

## The promise this keeps (intent 000, verbatim)

From `intent/000-ai-twin-portfolio.md`, Proposed outcome:

> A visitor lands on h4reet.ai and meets an animated AI twin of me — disclosed as AI, speaking in my cloned voice (my choice, and a disclosure item) — that they can talk to by text or voice about my real work.

> Early on, the twin asks whether the visitor wants the engineer's version or the non-engineer's version, and both are ready.

> A "job and role / task corpus" I will provide later is the twin's only source for this; it says so when it does not know.

Constraints:

> $5/day and $20/month cloud ceiling. Local models on my own hardware are how the cloud bill stays near zero, and that is part of the story, not a workaround.

> The twin is always disclosed as AI, speaks only from the corpus, refuses bad-faith requests, and never inflates my role. Guardrails and evals are public.

> Everything containerized; the entire production stack runs on my local machine calling local models. First phase is the compose stack; Terraform in AWS elevates it afterward.

Expected cost impact:

> Cloud: near-zero idle (static site, edge, thin relay, alerting), Bedrock only as capped fallback.

Data-flow impact:

> Visitor text and audio leave the browser only when the twin's brain or speech cannot run in the browser; each such flow is disclosed on the site with its reason. The engineer/non-engineer choice is a session preference, not stored. Nothing is retained beyond the session without explicit consent.

Reading: this intent covers the text half of "by text or voice". The voice half (push-to-talk and the cloned voice) stays with spec 002's own groups. The path the visitor picks at entry (spec 002's replacement for the voice question) travels with each turn and is never stored.

## Problem

Today every surface of the room answers with a fixed message. Selecting a piece shows "The twin can't talk about {topic} yet."; a typed turn shows "The twin can't talk right now. The service is unavailable."; nothing is sent anywhere (`apps/web/src/talk/talk.ts`). The room's half of the conversation is specced and built to a seam: spec 002's `POST /api/room/turn` contract, its fixed messages by cause class, and spec 004's neon sign, which waits for each turn's cost. Spec 002's Phase 7 (T065 to T071, T047, T081) is marked "Waits for a spec of the twin's conversation core". No such spec exists, so no visitor can have the conversation the portfolio exists for, and the Author's corpus (nine topic files, about seventy Golden Q&A) is read by nothing but the resume and its narration.

## Proposed outcome

A visitor clicks a piece, or types, and the twin answers from the corpus.

- Clicking a piece whose topic is ready opens a short, grounded answer about that topic (the snowboard leading with winter hobbies), and the visitor carries on by typing.
- A visitor who types without clicking can ask about anything the corpus holds, and hears "I don't know" for anything it doesn't.
- The twin stays disclosed as AI, refuses bad-faith requests, never states a number the corpus doesn't hold, keeps the Author's role, the agents' share of the work, and the privacy promise in the corpus's words, and holds to turn and rate limits.
- When the local tier is off, the budget is spent, or the kill switch has tripped, the room says why in a fixed message and keeps working.
- The Author sees each turn's cost, route, latency, and outcome on the dashboard, and decides, from evaluation runs, when each topic opens.

## Affected users and systems

- Visitors on either path, desktop and phone, keyboard and screen reader. Until spec 001 publishes the site, the only visitor is the Author, on each stack's loopback.
- The Author: the corpus's final reads, the live evaluation runs on his GPU and on Bedrock, the patches to the human-only files, and the decision to open each topic.
- `services/gateway` (a new turn route; routing, the kill switch, and the meter as they are), `apps/web` (the talk panel and the manifest), `deploy/edge` (one location on the room's listener), `config/` (the generated grounding pack, the twin's prompt, the readiness file, the per-turn limits), `evals/product`, `redteam/`, the dashboard's "Room" row, and `docs/data-flow-disclosure.md`.
- Specs 000, 002, and 004, whose clauses the spec amends by name; spec 001, which later carries the turn to public visitors.

## Constraints

- **Corpus only** (Principle VIII; the corpus README): "The twin speaks about the Author's work only from these files." Agents never edit `corpus/`.
- **Gateway only, local first** (CLAUDE.md): "Model calls go through `services/gateway` only." Routing stays `config/routing.yaml`'s; the kill switch is read at request start, and unknown means degraded.
- **The source's words** (CLAUDE.md): "recorded answers, quotes, and anything about the Author's role, the agents' share of the work, or a privacy promise stay in the source's words".
- **The corpus's own promise about this conversation** (`corpus/08-hareet-ai.md`, the Author's words): "We disclose every data flow, their conversation is not saved and they can look at the GitHub repo for how all the code works." and "Only costs and usage, and say we use Masking."
- **Every new endpoint** (CLAUDE.md): a telemetry span, a dashboard panel, a cost estimate, degraded-mode behaviour, and a disclosure entry, since a visitor's typed turn leaves their device.
- **The local stack doesn't wait for spec 001.** The turn goes through each stack's own edge to the gateway; the cloud relay comes later.
- **Withheld details stay out** of every file this work adds, prompts and test cases included.

## Expected cost impact

Local answers cost $0. On prod, a turn the Bedrock fallback answers costs about $0.001 (spec 002's estimate: about 8,000 input and 300 output tokens at Claude Haiku 5.5's price), inside the $2-a-day fallback sub-budget and the $5 and $20 ceilings, with no new budget. Before publication the only visitor is the Author, so cloud spend stays near $0. The Author's evaluation runs on Bedrock cost cents each, on prod's meter. Development time runs on the Team plan.

## Data-flow impact

Yes. Each conversation turn leaves the visitor's device for the stack: the visitor's typed text, the conversation so far, the path, and the piece that started it. The reply brings back the twin's words, the turn's estimated cost, and its route. On prod, when the local model can't answer and the sub-budget allows, the turn's prompt (the twin's instructions, corpus excerpts, the conversation) goes on to Bedrock. Spec 002's planned row V2 and its change to F1 are written with the change that serves the turn.

## Open questions

For the spec to answer, or to carry forward to the Author:
1. Does the answer stream to the room, or arrive whole after the guards have checked it?
2. Who marks a topic ready, and on what evidence?
3. When an answer breaks a rule, is it replaced or retried?
4. Does clicking a piece make a model call, or show a prepared line?
5. Spec 004 says the twin states no amount, while the corpus holds two amounts the Author made public: may the twin say them?
