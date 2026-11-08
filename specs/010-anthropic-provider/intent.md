# Intent: The Anthropic API as a second paid adapter, and the live runs on Bedrock or on it
Author: the Author (drafted by Claude from the Author's words of 2026-11-08, as the main session's brief relays them, and from intent 000). Status: draft. Specified the same night while he was away, at the main session's direction ("take the recommended answer for each clarification, record each as provisional and his to overturn"); he accepts or closes it. Created: 2026-11-08, in the spec's folder rather than `intent/`, as the intents of specs 008 and 009 were, so it moves nowhere when accepted.

## The Author's words

Verbatim, as the main session's brief relays them:

> "Then on the prod stack, i want to run everything pointing to aws bedrock as well as an option of using the anthropic api directly, since we get $200 of free credits per month there."

The context, as the brief gives it: he said it while asking for the steps after spec 007's merge, "when you say 'then your live runs and readiness marks'".

Claude's reading, as a list for the spec, beside his words and never in their place, to correct where it's wrong:

- **"Then on the prod stack"**: after spec 007's merge, on prod, the only stack that spends (spec 000, FR-031).
- **"i want to run everything pointing to aws bedrock"**: read with the context as the live runs and readiness marks he was asking about: the product evaluations, the red-team runs, and the contract run, on Bedrock. Those exist (spec 007's T075 and T077; spec 000's T103), and Bedrock stays prod's paid fallback as it is today. The other reading, every prod call going to Bedrock first, would end local-first routing; the spec records it as his open decision and builds nothing for it (its Q1).
- **"as well as an option of using the anthropic api directly"**: a second paid adapter that calls Anthropic's own API rather than Bedrock, which he can choose in Bedrock's place as prod's paid fallback, and run the same live runs on. "Directly" reads as "not through AWS": Bedrock's model today, `us.anthropic.claude-haiku-5-5`, is Claude Haiku 5.5, which Anthropic's API serves as `claude-haiku-5-5`.
- **"since we get $200 of free credits per month there"**: his reason, kept in his words. This draft states no credit, balance, price, or term as fact. They are not the corpus's Anthropic credits (`corpus/03-grants-and-credits.md`, which records credits Medic received), and nothing here puts them in the corpus.

## The promise this keeps (intent 000, verbatim)

From `intent/000-ai-twin-portfolio.md`, Constraints:

> $5/day and $20/month cloud ceiling. Local models on my own hardware are how the cloud bill stays near zero, and that is part of the story, not a workaround.

Expected cost impact:

> Cloud: near-zero idle (static site, edge, thin relay, alerting), Bedrock only as capped fallback.

Data-flow impact:

> Visitor text and audio leave the browser only when the twin's brain or speech cannot run in the browser; each such flow is disclosed on the site with its reason. The engineer/non-engineer choice is a session preference, not stored. Nothing is retained beyond the session without explicit consent.

Reading: the Anthropic API joins as the same kind of capped fallback, one paid adapter at a time, so local models stay first and the ceilings stay the Author's. A visitor's turn that reaches Anthropic is a new flow off the stack, disclosed before it can happen, and what Anthropic keeps of it has to be read against "Nothing is retained beyond the session without explicit consent" and the corpus's "their conversation is not saved" (`corpus/08-hareet-ai.md`, the Author's words). That reading is the Author's.

## Problem

- **Prod has one paid adapter.** The gateway's adapter types are `openai-compatible` (local), `bedrock-converse`, and `synthetic` (`services/gateway/src/adapters/`). Spec 000's FR-021 asks for adapters for "direct vendor APIs" and ships none, so the Anthropic API can't be chosen at all.
- **The live runs know two adapters.** `make evals`, `make redteam-live`, and `make contract-live` take `ADAPTER=local` or `ADAPTER=bedrock` and refuse anything else (`Makefile`; `evals/run.py`, `redteam/run.py`, `scripts/operator.py`).
- **Readiness names Bedrock.** `evals/twin_readiness.py`'s `NEEDED` asks for "a local and a Bedrock product run, and a red-team run on each", so evidence on another paid adapter can't count, whatever prod routes to.
- **The readiness rule passes a run that never asked.** `_check` in `evals/twin_readiness.py` keeps a product run's results for the entry's topic, and when there are none, every check it then makes is over an empty list and passes. A run filtered to other cases, or cut short of the topic's, reads as evidence for a topic it never asked about. Spec 007's FR-031 asks for the thresholds "per topic, per path, per adapter" (its plan §6's readiness file).
- **The twin's temperature, found while reading.** The twin's turn sends `temperature: 0.3` (`services/gateway/src/twin/turn.ts`), while spec 000's live contract case records that Claude Haiku 5.5 "takes no temperature but its default, 1". No live twin call has been made on Bedrock yet, and the same model sits behind the Anthropic API.
- **The disclosure says the stack never calls Anthropic.** Row D1 of `docs/data-flow-disclosure.md`: "never from the stack, which holds no Anthropic credential and calls no Anthropic endpoint". That stops being true with this change.

## Proposed outcome

- Prod's paid fallback is the Author's choice, in one line of configuration: Bedrock, as today, or the Anthropic API. Local stays first, dev stays on its synthetic spend, and nothing routes to a paid model while the local one answers.
- The live runs take `ADAPTER=anthropic` as they take `ADAPTER=bedrock`: the Author's alone, on prod, through its admin routes, inside the ceilings.
- Readiness asks for evidence on prod's local model and on the paid adapter prod's route names, and only complete runs count: every one of a topic's cases, on both paths, on each adapter.
- The Anthropic API's spend counts at its list price on the same ceilings, and a monthly cap the Author sets bounds it; at the cap the adapter stops on its own, local answers go on, and he restores it.
- A refusal from the model shows the twin's fixed line, as a guard's withholding does.
- Every flow to Anthropic is disclosed, with what Anthropic keeps in the Author's words from its published terms, before any visitor's turn can reach it.

## Affected users and systems

- The Author: his choice of fallback; his patches to the human-only files (prices, budgets, the enforcement layer, `CLAUDE.md`'s routing sentence); the key in prod's env file; the live runs; the readiness marks; his reading of Anthropic's terms.
- Visitors, once spec 001 publishes the site: a turn the local model can't answer may reach Anthropic instead of Bedrock. Until then the only visitor is the Author, on loopback.
- `services/gateway` (a new adapter module and its transport, the meter's per-adapter month, a degraded cause, a guard, telemetry), `config/routing.yaml`, `deploy/compose.yaml` and prod's env template, `deploy/scripts/preflight.py`, the runners (`evals/run.py`, `redteam/run.py`, `scripts/operator.py`), `evals/twin_readiness.py`, the `Makefile`, the room's cause classes (`apps/web/src/room/signals/tier.ts`), the dashboard, the alerts and runbooks, and `docs/data-flow-disclosure.md`.
- Specs 000, 002, and 007, and ADR 0001, whose clauses the spec amends by name.

## Constraints

- **Gateway only** (`CLAUDE.md`): "Model calls go through `services/gateway` only. Never call a provider SDK directly. Every call carries provider, model, tokens, cost."
- **Local first** (the constitution's Model access standard; ADR 0001): "Routing policy is configuration; the initial policy is local-first with Bedrock as fallback inside a capped sub-budget." `config/routing.yaml`'s schema "keeps every primary local, a paid adapter in prod's route only".
- **Cost is the meter's** (Principle V): "When spend crosses a threshold the system degrades itself without waiting for a human, and a human must consciously restore it." `config/prices.yaml` and `config/budgets.yaml` are the Author's alone.
- **No secret anywhere** (Principle IV): the key lives in prod's env file, outside the repository, and gets its deny in the same patch that creates it, or an earlier one (`CLAUDE.md`).
- **Every new flow disclosed** (Principle I; `CLAUDE.md`): a telemetry span, a dashboard panel, a cost estimate, degraded-mode behaviour, and a disclosure entry, since a visitor's typed text can leave the stack for Anthropic.
- **The source's words**: the Author's words, and what Anthropic's terms say, stay in their own words; a reading goes beside them.

## Expected cost impact

The same model at the same list price on either paid adapter, by the brief's reference: Claude Haiku 5.5 at $0.10 per million input tokens and $0.50 per million output, est., which the Author confirms. A twin turn the fallback answers costs about $0.001; an evaluation run about $0.20; the contract run under $0.05. Nothing changes the $5 daily and $20 monthly ceilings or the $2-a-day sub-budget; a monthly cap for the Anthropic adapter, his value, sits inside them. If his account's credits pay the invoice, the bill could be lower than the meter, which counts list price either way. Development time runs on the Team plan.

## Data-flow impact

Yes, once the Author chooses the Anthropic API. On prod, while its route names it: a turn the local model can't answer, admitted inside the caps, leaves the stack for `api.anthropic.com` with the twin's instructions, the turn's corpus excerpts, the conversation with the visitor's words, and the path as a depth instruction, as it leaves for Bedrock today (row F1); the Author's live runs send their cases; a health check sends the key and the model's name. Nothing that names who asked goes with any of it. The new row, with the Author's words about what Anthropic keeps, lands with the code, before any call can be made, and row D1's sentence changes in the same change.

## Open questions

For the spec to answer, or to carry forward to the Author:
1. Does "run everything pointing to aws bedrock" mean the live runs, or every prod call?
2. Is the Anthropic API a second fallback after Bedrock, or one choice in Bedrock's place?
3. Do "$200 of free credits per month" change what the meter counts, or the ceilings?
4. When the Anthropic API's month reaches its cap, what stops, and who restores it?
5. Under what name does the key reach the gateway?
6. When prod's route names a paid adapter a ready topic wasn't evaluated on, does the topic close?
