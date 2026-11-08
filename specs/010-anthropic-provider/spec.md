# Feature Specification: The Anthropic API as a Second Paid Adapter, and the Live Runs on Either Paid Adapter

**Feature Branch**: `spec/010-anthropic-provider` (documents only), in a worktree cut from `feat/009-room-avatars` at 953ad7ea, the top of the night's group B stack, which holds spec 007's conversation code; the implementation branch is `feat/010-anthropic-provider`, which merges after group B ([plan.md](plan.md) §14)

**Created**: 2026-11-08

**Status**: Draft. Specified on 2026-11-08 while the Author was away, from the draft intent beside it. Clarified the same night at the main session's direction, "take the recommended answer for each clarification, record each as provisional and his to overturn, and mark nothing as needing clarification": six questions, each taken with its recommended option, none of them the Author's answer (Clarifications). No needs-clarification marker remains; each FR that rests on a provisional answer names it as "(provisional, Qn)". Nothing is built before the Author accepts the intent and approves this spec and its plan ([tasks.md](tasks.md) T000).

**Input**: [`intent.md`](intent.md) in this folder, with the Author's words of 2026-11-08 as the main session's brief relays them. Also read, at 953ad7ea: the [constitution](../../.specify/memory/constitution.md) 1.0.1 and `CLAUDE.md`; [ADR 0001](../../docs/adr/0001-local-first-routing-with-capped-bedrock-fallback.md) and the ADR index; spec 000's [spec](../000-local-foundations/spec.md) (FR-021 to FR-024, FR-030, FR-031, FR-033, FR-040), [data model](../000-local-foundations/data-model.md) §2.2 to §2.5, §3, §6, and §7, and its contracts [provider-adapter](../000-local-foundations/contracts/provider-adapter.md) (whole), [config-files](../000-local-foundations/contracts/config-files.md) §0 to §3, [gateway-http](../000-local-foundations/contracts/gateway-http.md) §3, [telemetry](../000-local-foundations/contracts/telemetry.md) §3.1, §3.3, §4.1, and §7.2, [env-files](../000-local-foundations/contracts/env-files.md) §1, §4, §8, and §10, [alerts](../000-local-foundations/contracts/alerts.md) §2 and §6, and [operator-admin](../000-local-foundations/contracts/operator-admin.md) §5 and §8; spec 007's [spec](../007-twin-conversation/spec.md), [plan](../007-twin-conversation/plan.md), and [tasks](../007-twin-conversation/tasks.md), and its merge-request note; spec 009's spec, plan, and tasks, for form; `config/routing.yaml`, `config/prices.yaml`, and `config/budgets.yaml` (read, not changed); the gateway's `src/adapters/bedrock-converse.ts`, `_settings.ts`, `src/routes/admin-twin.ts`, `src/twin/turn.ts`, `guards.ts`, and `readiness.ts`, `test/unit/provider-names.test.ts`, `test/contract/replay.test.ts`, and `package.json`; the room build's `build/room/readiness.ts` and `src/room/signals/tier.ts`; `evals/twin_readiness.py`, `evals/run.py`, and `evals/test_disclosure.py`; `redteam/run.py`; `scripts/operator.py`; the `Makefile`; `deploy/compose.yaml` and prod's env template; `tools/gates/compose_policy.py`, `matrix_canary.py`, and `gate` (read, not changed); `.claude/settings.json` and its bash and protected-paths hooks (read, not changed); the corpus's `08-hareet-ai.md` and `03-grants-and-credits.md` (read, not changed); and the [data-flow disclosure](../../docs/data-flow-disclosure.md). The facts about the Anthropic API (its model ID, prices, thinking, endpoint, usage fields, stop reasons, and SDK) are the brief's, from the claude-api skill's reference as cached on 2026-10-06; the Author confirms the prices and the terms when he applies his patches ([plan.md](plan.md) §13).

Summary: prod's paid fallback becomes the Author's choice, one line in `config/routing.yaml`: Bedrock, as today, or Anthropic's own API, which this spec adds as a second paid adapter, `anthropic`, calling Claude Haiku 5.5, the model Bedrock serves. Local stays first, and dev keeps its synthetic spend. The adapter speaks the gateway's adapter contract through Anthropic's official TypeScript SDK, pinned and vetted, with every option explicit, its retries off, and its lookups through the gateway's resolver; the gateway's own retry, circuit, deadline, meter, and kill switch govern it, as they govern Bedrock. Its spend counts at list price on the same ceilings, and a monthly cap the Author sets stops it on its own while local answers go on. The live runs take `ADAPTER=anthropic`; readiness asks for evidence on prod's local model and on the paid adapter the route names, and only complete runs count, which closes the gap found tonight. A refusal from the model shows the twin's fixed line. The new flow is disclosed before any call can reach it, with what Anthropic keeps in the Author's own words. At the merge prod's route still names Bedrock, so nothing changes until he chooses.

## Clarifications

### Session 2026-11-08, taken while the Author was away, at the main session's direction

The main session's brief: "He's away. Take the recommended answer for each clarification, record each as provisional and his to overturn, and mark nothing as needing clarification." That is an agent's direction, never the Author's answer: each answer below is provisional and his to overturn, and a no changes the FRs its bullet names, before the tasks that build them start. The questions, with their options, are under Open Questions.

- Q1: What does "run everything pointing to aws bedrock" mean? → Taken, not answered: Option A, "The live runs he asked about, the product evaluations, the red-team runs, and the contract run, on Bedrock, which already exist (spec 007's T075 and T077; spec 000's T103), with Bedrock staying prod's paid fallback as it is today. A Bedrock-first or Anthropic-first prod is his open decision: it would end local-first routing, so it needs a constitution amendment and an ADR replacing ADR 0001, and nothing here builds it." (FR-001, FR-002; Assumptions, "Scope".)
- Q2: How does the Anthropic API join? → Taken, not answered: Option A, "A second paid adapter, `anthropic`, defined in `config/routing.yaml` beside `bedrock`. Prod's route names one paid fallback at a time, `bedrock` or `anthropic`, as `envs.prod.fallback`: his choice, in one line. Dev's route stays synthetic. The live runs use the paid adapter the route names." (FR-001 to FR-003, FR-024.)
- Q3: Does the Anthropic API's spend count against the ceilings, given "$200 of free credits per month"? → Taken, not answered: Option A, "Yes. Every Anthropic call counts at its list-price estimate toward prod's $5 daily and $20 monthly ceilings, and a fallback call toward the $2-a-day sub-budget, whatever credits his account holds: the meter reads no balance. A monthly cap for the adapter, his value, sits inside the monthly ceiling. Raising the ceilings to use the credits is his separate budget decision, with an ADR." (FR-020, FR-021.)
- Q4: When the Anthropic adapter's monthly cap is reached, what stops, and who restores it? → Taken, not answered: Option A, "That adapter alone. Its calls are refused with a new degraded cause, `adapter_month_spent`, which the room reads as its budget class, while local answers go on; an alert and an audit row record it. The paid fallback then awaits his renewal, across rollovers and restarts, as the sub-budget's exhaustion makes it do, and the adapter itself stays refused until the next UTC month or his patch raising the cap." (FR-022, FR-023.)
- Q5: Under what name does the Anthropic API key reach the gateway? → Taken, not answered: Option A, "`GATEWAY_ANTHROPIC_API_KEY`, in prod's env file only, which compose passes to the gateway alone and the adapter reads through its `api_key_env` setting; the container holds no variable the SDK reads on its own. The brief named the key `ANTHROPIC_API_KEY`; the env-file key differs for the reason `GATEWAY_AWS_PROFILE` differs from `AWS_PROFILE` (contracts/env-files.md §4): preflight refuses a template key that the Author's shell also sets (its P5), and compose would let the shell's value win." (FR-030 to FR-032.)
- Q6: When prod's route names a paid adapter that a ready topic's evidence didn't run on, does the topic close? → Taken, not answered: Option A, "No. The evidence rule names the paid adapter the route names, so `make evals`'s report says what's missing; readiness at run time stays spec 007's FR-030, the flag and the two hashes, so a switch of the fallback closes no topic; and the switch's merge note lists the runs to make. A runtime binding of readiness to the paid adapter is his to ask for." (FR-026, FR-029.)

## Source: The Author's Words, and the Record

Quoted as the sources record them. The reading beside each is this spec's, to correct where it's wrong; it never replaces the words.

- **The Author, 2026-11-08**, as the main session's brief relays it:

  > "Then on the prod stack, i want to run everything pointing to aws bedrock as well as an option of using the anthropic api directly, since we get $200 of free credits per month there."

  The context, as the brief gives it: he said it while asking for the steps after spec 007's merge, "when you say 'then your live runs and readiness marks'".

  Reading: "run everything pointing to aws bedrock" is read with its context as the live runs and readiness marks: on Bedrock, they exist (Q1; User Story 2). "an option of using the anthropic api directly" is the second paid adapter, chosen in Bedrock's place (Q2; User Story 1). "since we get $200 of free credits per month there" is his reason, kept in his words: this spec states no credit, balance, or term as fact, and the meter counts list price either way (Q3; User Story 3). These credits are not the corpus's Anthropic credits (`corpus/03-grants-and-credits.md`, which records credits Medic received), and nothing here touches the corpus.

- **Intent 000**, its constraint: "$5/day and $20/month cloud ceiling. Local models on my own hardware are how the cloud bill stays near zero, and that is part of the story, not a workaround." Its expected cost: "Cloud: near-zero idle (static site, edge, thin relay, alerting), Bedrock only as capped fallback." Its data flow: "Visitor text and audio leave the browser only when the twin's brain or speech cannot run in the browser; each such flow is disclosed on the site with its reason. The engineer/non-engineer choice is a session preference, not stored. Nothing is retained beyond the session without explicit consent." Reading: the ceilings stay (FR-020); the Anthropic API joins as the same capped fallback, one paid adapter at a time (FR-001); its flow is disclosed before it can happen (FR-038), and what Anthropic keeps is the Author's to read against "Nothing is retained beyond the session without explicit consent" (FR-039).
- **The constitution's Model access standard**: "a single provider-agnostic gateway with adapters: a local OpenAI-compatible endpoint, Amazon Bedrock, direct vendor APIs, OpenRouter. Routing policy is configuration; the initial policy is local-first with Bedrock as fallback inside a capped sub-budget. Evaluations run against any adapter." Reading: a direct vendor API is one of the standard's adapters, and choosing it as the fallback changes the initial policy by configuration, which the standard provides for (Assumptions, "Readings"); "Evaluations run against any adapter" is User Story 2.
- **Principle V**: "When spend crosses a threshold the system degrades itself without waiting for a human, and a human must consciously restore it." Reading: Q4; FR-022, FR-023.
- **Spec 000's FR-021**: "A single gateway interface MUST exist with adapters for a local OpenAI-compatible endpoint, Amazon Bedrock, direct vendor APIs, and OpenRouter. This spec ships local and Bedrock." Reading: `anthropic-messages` is the first direct vendor API, added as spec 000's provider-adapter contract §4 says a new type is added.
- **ADR 0001's alternatives**: "Bedrock first, local second. Rejected: every request would spend money." Reading: Q1's option B stays rejected unless the Author decides otherwise.
- **`CLAUDE.md`**: "Model calls go through `services/gateway` only. Never call a provider SDK directly. Every call carries provider, model, tokens, cost." And: "Routing is configuration (`config/routing.yaml`): local-first, Bedrock fallback within sub-budget, then degraded. Check kill-switch state at request start; unknown state = degraded." Reading: the SDK is imported by the adapter's module alone (FR-004), and every call carries the four (FR-019); the routing sentence changes in the Author's patch, since the constitution supersedes it (FR-041).
- **`config/routing.yaml`'s header**: "its schema keeps every primary local, a paid adapter in prod's route only, and synthetic spend in dev's only." Reading: FR-001; dev stays synthetic.
- **Spec 000's live contract case `temperature-one`** (contracts/provider-adapter.md §5.4): "It was 0, which Claude Haiku 5.5 refuses with a 400: it takes no temperature but its default, 1." Reading: the twin's turn sends 0.3 (`services/gateway/src/twin/turn.ts`), and no live twin call has reached Haiku 5.5 yet, on Bedrock or anywhere; FR-017.
- **The corpus's promise** (`corpus/08-hareet-ai.md`, the Author's words of 2026-11-06): "We disclose every data flow, their conversation is not saved and they can look at the GitHub repo for how all the code works." Reading: row F3 carries the Author's own reading of Anthropic's terms, and he weighs it against this promise before his route names the Anthropic API (FR-039).
- **The brief's facts about the Anthropic API** (the claude-api skill's reference, cached 2026-10-06), for the Author to confirm: the first-party model ID `claude-haiku-5-5`, the same model as Bedrock's `us.anthropic.claude-haiku-5-5`; $0.10 per million input tokens and $0.50 per million output, for prompts up to 100K tokens ($0.50 and $2.50 beyond); thinking adaptive and on by default, with `thinking: {type: "disabled"}` accepted only at effort `high` or below, the default effort being `medium`; `POST https://api.anthropic.com/v1/messages`; usage as `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`; stop reasons `end_turn`, `max_tokens`, `refusal` ("Haiku 5.5 has no server-side fallback for refusals"), and others; the official SDK `@anthropic-ai/sdk`, which retries twice by default with a 10-minute timeout and raises typed errors by status. The brief's rule: "in a TypeScript project, call Claude through the official SDK, not raw fetch."

## User Scenarios & Testing *(mandatory)*

The users are the Author, who chooses the fallback, applies his patches, runs the live evaluations, and marks topics ready; visitors, whose turn the paid fallback answers when the local model can't (until spec 001 publishes the site, the only visitor is the Author, on loopback); and the agents that build the adapter. Principle I asks for the degraded mode before the happy path: every degraded behaviour is defined here (User Story 4, the FRs, and the Degraded-Mode Behavior table) and built in the foundation, before User Story 1's happy path ([tasks.md](tasks.md) Phase 2).

### User Story 1 - The Author Chooses the Anthropic API as Prod's Paid Fallback (Priority: P1)

As the Author, I want prod's paid fallback to be Bedrock or the Anthropic API, my choice in one line of configuration, so that a turn the local model can't answer goes to the provider I pick, metered, capped, and disclosed.

**Why this priority**: His words, "as well as an option of using the anthropic api directly". It is the smallest slice that makes the option real, and every other story needs the adapter.

**Independent Test**: On the gateway's test stack, with prod's configuration naming `anthropic` as the fallback and the API stubbed, stop the local model: hello and a twin turn are answered by the stub with `route: "fallback"`, and each call carries provider `anthropic`, the model, its tokens, and its cost on its span and ledger row; with the local model healthy, no request reaches the stub; with the route naming `bedrock`, the anthropic adapter isn't built.

**Acceptance Scenarios**:

1. **Given** prod's route names `anthropic` and its key, its price entry, and its monthly cap are in place, **When** the local model is down and a turn arrives inside the sub-budget, **Then** the Anthropic API answers it, the reply says `route: "fallback"`, and the ledger row names provider `anthropic`, model `claude-haiku-5-5`, the call's tokens, and its cost at the price table's entry.
2. **Given** the same, **When** the local model is healthy, **Then** no request reaches the Anthropic API.
3. **Given** prod's route names `bedrock`, **When** the gateway starts, **Then** the anthropic adapter isn't built, no request reaches `api.anthropic.com`, and nothing about Bedrock's calls changes but FR-017's temperature.
4. **Given** dev's route, **When** it names `anthropic`, **Then** validation refuses it (rule R2), and a gateway outside prod won't start with it (`paid_route_outside_prod`).
5. **Given** prod's route names `anthropic` while its key, its price entry, or its monthly cap is missing, **When** `make up ENV=prod` runs, **Then** preflight or the gateway refuses with a named reason (`missing_env`, `price_missing`, `adapter_cap_missing`), and no call is made.
6. **Given** any call to the Anthropic API, **When** it leaves the gateway, **Then** it carries the system message as `system` and the other messages in order, the output cap as `max_tokens`, and thinking disabled; it carries no temperature, nothing that names who asked, no trace context, and no header outside the transport's allowlist.

---

### User Story 2 - The Live Runs on the Paid Adapter Prod's Route Names, and Readiness That Counts Only Complete Runs (Priority: P1)

As the Author, I want to run my live evaluations, red-team runs, and contract run on Bedrock today and on the Anthropic API when I choose it, and I want readiness to ask for the evidence my route needs, complete for each topic, path, and adapter.

**Why this priority**: His question was about "your live runs and readiness marks", and his answer, "i want to run everything pointing to aws bedrock as well as an option of using the anthropic api directly". The readiness gap found tonight would let an incomplete run open a topic.

**Independent Test**: `make evals ADAPTER=anthropic`, `make redteam-live ADAPTER=anthropic ENV=prod`, and `make contract-live ADAPTER=anthropic ENV=prod REASON=…` reach their runners as typed outside the sandbox and are refused inside it; the runners send each case to the anthropic adapter and name it in their history; and `evals/twin_readiness.py` reads every row of a fixture matrix correctly.

**Acceptance Scenarios**:

1. **Given** prod's route names `anthropic`, **When** the Author runs `make evals ADAPTER=anthropic`, **Then** each case goes through prod's admin routes to the anthropic adapter, never failing over, attributed `test`, and the history file is `<UTC>-anthropic.json`, naming the adapter and the provider.
2. **Given** an agent session, **When** it runs any of the three targets with `ADAPTER=anthropic`, **Then** the target refuses it in the sandbox; and the bash gate refuses the text of `make contract-live`, as it does today, and, from the Author's patch, of `make evals` or `make check` naming `anthropic`.
3. **Given** prod's route names `bedrock`, **When** the Author runs a live run with `ADAPTER=anthropic`, **Then** the admin route answers 404 `unknown_adapter` for each case, and nothing is charged.
4. **Given** a ready topic whose evidence is a local and a Bedrock run, **When** prod's route names `anthropic`, **Then** the report says the topic's evidence lacks a product run and a red-team run on `anthropic`.
5. **Given** a product run that holds none of a topic's cases, or only one path's, or misses one of its gap cases, **When** the report reads it as that topic's evidence, **Then** it reads "evidence missing", naming the topic, the path, and how many cases are missing.
6. **Given** complete runs on prod's local model and on the route's paid adapter that pass the thresholds at the running hashes, **When** the report runs, **Then** it reads the topic ready, and `make evals` exits as it would without the report.
7. **Given** Bedrock as the fallback, **When** spec 007's live runs (its T075 and T077) send the twin's turns, **Then** Bedrock receives no temperature, the model's default applies, and no call is refused for its temperature.

---

### User Story 3 - The Anthropic Adapter's Month Stays Inside Its Cap and the Ceilings (Priority: P2)

As the Author, I want the Anthropic API's spend counted at its list price on the same ceilings as Bedrock's, and held to a monthly cap I set, so that, credits or not, the bill and the meter stay mine to decide.

**Why this priority**: His reason, "since we get $200 of free credits per month there", and Principle V: the meter is the enforcement point, so the cap ships with the adapter, before anything routes to it.

**Independent Test**: In the gateway's integration tests, on the store's test engine (PGlite, as spec 000's tests use it) with the test clock and a stub paid adapter: spend crosses the cap's warning, then the cap; the alert, the audit row, the refusal, the flag across a restart and a rollover, and the renewal behave as FR-022 and FR-023 say; local answers continue throughout.

**Acceptance Scenarios**:

1. **Given** a monthly cap for the adapter, **When** committed spend crosses its warning (the cap times `warn_ratio`), **Then** one warning alert, keyed by the adapter and the month, is sent.
2. **Given** the cap, **When** a commit reaches it, **Then** the adapter's calls are refused with `adapter_month_spent`, the paid fallback awaits renewal, an alert and an audit row record it, and local answers go on.
3. **Given** that state, **When** the UTC month rolls over or the gateway restarts, **Then** the paid fallback stays refused until the Author renews it.
4. **Given** a renewal in the same month, **When** a fallback call arrives, **Then** it is still refused with `adapter_month_spent`, until the month rolls over or the Author's patch raises the cap.
5. **Given** any call to the Anthropic API, **When** it commits, **Then** its cost counts toward the day and month ceilings, and a fallback call's toward the day's sub-budget, at the price table's figures, whatever credits his account holds.
6. **Given** prod's route names `anthropic` and `config/budgets.yaml` has no cap for it, **When** prod starts, **Then** it refuses with `adapter_cap_missing`.

---

### User Story 4 - When the Paid Fallback Can't Answer, the Room Says Why and Keeps Working (Priority: P3)

As a visitor, I want a plain fixed message when the Anthropic API can't answer, and the room, the resume, and the PDF to keep working.

**Why this priority**: Principle I's degraded mode, defined before the happy path and built in the foundation; this story is its end-to-end proof.

**Independent Test**: On the anthropic-routed test configuration, with the local model down, drive each condition of the Degraded-Mode Behavior table: each answers with its named cause or line, the room shows its fixed message, and the stub counts no Messages request where the table says none.

**Acceptance Scenarios**:

1. **Given** the kill switch has tripped, or its state is unknown, **When** a turn arrives, **Then** no request reaches Anthropic, and the room shows `cannot_talk.budget` or `cannot_talk.unavailable`.
2. **Given** the adapter's monthly cap is reached, **When** a turn arrives, **Then** the room shows `cannot_talk.budget`, and no request reaches Anthropic.
3. **Given** the health check finds the key refused, or the circuit is open, **When** a turn arrives, **Then** the room shows `cannot_talk.resting`, and no Messages request is made.
4. **Given** the API answers overloaded, unavailable, or past the request timeout, **When** a turn arrives, **Then** the room shows `cannot_talk.resting`, a timed-out call is charged its reserved maximum, and the others nothing.
5. **Given** the API answers rate-limited, **When** a turn arrives, **Then** the gateway retries once if the deadline allows, and otherwise the room shows `cannot_talk.resting`.
6. **Given** the model stops with `refusal`, **When** the turn ends, **Then** the visitor reads the fixed line `withheld`, the withholding is counted under `refusal`, and the call's cost stays counted.
7. **Given** any of the above, **When** the visitor opens the resume, downloads the PDF, or selects a piece, **Then** each works (spec 002, FR-038).

### Edge Cases

- **A switch of the fallback while prod runs:** the running gateway keeps its route until `make up ENV=prod` restarts it with the new commit; a turn in flight completes on the adapter it started with.
- **The same model through two providers:** Bedrock's and Anthropic's Haiku 5.5 may answer differently (stop reasons, defaults), so readiness counts evidence per adapter (FR-026).
- **A refusal with partial text:** withheld whole; no part of it reaches the visitor (FR-018).
- **A thinking block in an answer, though thinking is off:** never shown; only text blocks become the answer (FR-008).
- **Cache tokens reported, though no cache is asked for:** counted, cache reads at the price entry's cache price or else its input price, cache writes as input tokens, and logged, so the Author sees an answer the request never asked for ([plan.md](plan.md) §2.4).
- **The account can't pay** (its credits spent, or its billing refused): whatever status the API answers is mapped by FR-009's table; each fallback turn shows `cannot_talk.resting`; the monthly cap is set to stop first; the runbook says what to check.
- **The month rolls over during a call:** the call keeps its month's keys through its commit (spec 000's data model §7.6).
- **Both paid adapters spent money in one month** (after a switch): each adapter's month counts its own calls; the ceilings count both.
- **A switch back to Bedrock after the Anthropic cap:** Bedrock's calls aren't held by Anthropic's cap, but the fallback flag that the cap set holds every paid fallback until the Author renews it.
- **A key with a line break or a space:** the env file's grammar refuses it unquoted (contracts/env-files.md §1.1), and preflight names the key, never the value.
- **A response with more than 100,000 input tokens:** can't happen within the gateway's input bounds; if one is reported, it is logged and counted ([plan.md](plan.md) §4.1).

## Requirements *(mandatory)*

### Functional Requirements

**Routing: what "run everything pointing to aws bedrock" changes, and what it doesn't**

- **FR-001**: Routing SHALL stay local-first (spec 000, FR-022): every route's primary SHALL be local (rule R1), prod's route SHALL name at most one paid fallback, `bedrock` or `anthropic`, as `envs.prod.fallback` in `config/routing.yaml`, and dev's route, which dev and dev-cpu share, SHALL name no paid adapter (rule R2) and keep `synthetic` (provisional, Q1, Q2). The schema's refusals SHALL hold for `anthropic` as they hold for `bedrock`.
- **FR-002**: AT this spec's merge, `config/routing.yaml` SHALL define `anthropic` beside `bedrock`, and `envs.prod.fallback` SHALL stay `bedrock`. Choosing the Anthropic API SHALL be the one line `fallback: anthropic`, the Author's decision, made only once FR-019's price entry, FR-021's cap, FR-030's key, and FR-039's words are in place. No route SHALL name a paid primary (provisional, Q1).
- **FR-003**: THE GATEWAY SHALL build a paid adapter only when its stack's route names it (contracts/provider-adapter.md §4), and the admin routes SHALL call only the route's primary or fallback (contracts/operator-admin.md §5 and §8). WHEN a live run names a paid adapter the route doesn't name, each call SHALL get 404 `unknown_adapter`, reach no provider, and charge nothing (provisional, Q2).

**The adapter, `anthropic-messages`**

- **FR-004**: THE GATEWAY SHALL gain one adapter type, `anthropic-messages`, of kind `paid` only and provider `anthropic`, in its own module, `services/gateway/src/adapters/anthropic-messages.ts`, with its transport in a helper module beside it. Those modules alone SHALL import `@anthropic-ai/sdk`, and no file outside `src/adapters/` SHALL name the provider or the SDK, which `test/unit/provider-names.test.ts` holds (spec 000, SC-006).
- **FR-005**: THE ADAPTER'S settings in `config/routing.yaml` SHALL be exactly: `model` (`claude-haiku-5-5`, or a placeholder until the Author confirms it); `api_key_env` (the env key that holds the API key: `GATEWAY_ANTHROPIC_API_KEY`); `thinking` (`disabled`, its only value); `temperature` (FR-017); `timeouts` (`connect_ms` 100 to 2,000, `request_ms` 1,000 to 4,000, their sum at most 5,000 by rule R8); `retry`; `circuit`; and `health` (`interval_ms`). Any other key SHALL be refused. THE ENDPOINT SHALL be fixed in the adapter's code, `https://api.anthropic.com`, and never configuration or an environment variable, as rule R7 fixes Bedrock's region to the disclosed one.
- **FR-006**: WHEN the adapter makes a call, IT SHALL send one Messages request: the request's system message as `system`; its other messages as `messages`, in order; its output cap as `max_tokens`; `thinking: {type: "disabled"}`; no effort, so the API's default (`medium`, at which disabled thinking is accepted) applies; and a temperature only as FR-017 allows. IT SHALL send nothing else: no streaming, tools, cache breakpoint, stop sequence, `metadata` (and so no user ID), service tier, or beta header.
- **FR-007**: THE ADAPTER SHALL build its SDK client with every option it relies on given explicitly: the API key read from the env key `api_key_env` names (the adapter's context holds only that key, contracts/provider-adapter.md §4); the fixed base URL; `maxRetries: 0`; the timeout from its settings; and the SDK's own logging off. No variable the SDK reads by default (among them `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and its logging switch) SHALL change what a call does, where it goes, or what is logged; and the gateway's container SHALL hold none of them.
- **FR-008**: WHEN a call returns, THE ADAPTER SHALL map the answer to the gateway's result (contracts/provider-adapter.md §2.1): `text`, the answer's text blocks joined, never a thinking block's content; the usage, from `input_tokens`, `output_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens`; the finish reason, `end_turn` and `stop_sequence` as `stop`, `max_tokens` as `length`, `refusal` as `content_filter`, and any other as `other`; the response's model and message ID. A 200 whose body has no content list or no usage SHALL be a `provider_error`.
- **FR-009**: WHEN a call fails, THE ADAPTER SHALL reject with one `ProviderError` (contracts/provider-adapter.md §2.5): 400, 404, 413, and 422 as `bad_request`; 401 and 403 as `auth`; 429 as `rate_limited`; 529 (overloaded), 502, and 503 as `unavailable`; 504 as `timeout`; any other 5xx as `provider_error`; a connection that was never made (refused, unreachable, a failed lookup, the connect timeout) as `unavailable`, not billed; a connection lost after the request went out, the request timeout, or the deadline as `timeout`, possibly billed. Each SHALL carry `retryable` and `possiblyBilled` as §2.5's kinds give them, and a `code` from the SDK's error class name, the HTTP status, or the Node error code; never the provider's text, the request, the key, or the original error.
- **FR-010**: THE ADAPTER SHALL hold each call to its connect and request timeouts and to the request's deadline, and settle exactly once (checks C10 and C11). Its name lookups SHALL go through the gateway's c-ares resolver (`core/resolve.ts`), as the local and Bedrock adapters' do, so a lookup that hangs holds no libuv thread (contracts/provider-adapter.md §3.1's departure for T188).
- **FR-011**: THE GATEWAY'S attempt wrapper SHALL govern the adapter's retries and circuit from its settings, as it governs Bedrock's: `retry {on: [rate_limited], max: 1, backoff_ms: 250}` and `circuit {failures: 3, open_s: 30}` by default; the SDK SHALL never retry a call itself.
- **FR-012**: THE ADAPTER'S health check SHALL never make a Messages call. It SHALL ask the API's model lookup, `GET /v1/models/{model}`, which counts no tokens, every `health.interval_ms` (60,000 by default), within the shorter of 5 seconds and the interval: healthy WHEN it answers 200 naming the configured model; `credentials` WHEN it answers 401 or 403; `timeout` WHEN it doesn't answer in time; `unreachable` otherwise. One failure SHALL make the adapter unhealthy and one pass healthy, combined with the circuit (contracts/provider-adapter.md §6). IF the pinned SDK or the API offers no such lookup, or the Author finds it billed, THEN the check SHALL be local, the key present and well-formed, and calls refused with `auth` SHALL mark the adapter unhealthy, as §6 has a paid adapter's `auth` do.
- **FR-013**: THE ADAPTER SHALL be called only through the gateway's attempt wrapper, after the request-start state read and, for a paid call, admission (spec 000, FR-022; its data model §7.1 and §7.2). WHILE the kill switch is `degraded` or its state is unknown, no request SHALL reach Anthropic (`CLAUDE.md`: "unknown state = degraded").
- **FR-014**: THE ADAPTER SHALL run on prod alone: a route naming it outside `H4_ENV=prod` SHALL stop the gateway's start (`paid_route_outside_prod`, exit 78); WHILE prod's route names it, an unset or empty key SHALL stop the start with `missing_env`, naming the env key and never its value.
- **FR-015**: THE ADAPTER SHALL pass spec 000's contract suite in stub mode, checks C1 to C12, with the same span key set as the other adapters (C8), and the Author's live run, `make contract-live ENV=prod ADAPTER=anthropic REASON=…`, SHALL record and replay as Bedrock's does (contracts/provider-adapter.md §5.3).
- **FR-016**: EVERY request to Anthropic SHALL carry only the headers the adapter's transport allows (the key, the API version, the content type and length, `accept`, and the user agent), so no platform header the SDK adds by default leaves the stack; no `traceparent`, `tracestate`, or `baggage` header (contracts/telemetry.md §3.1); and no client identifier, request ID, or user field (contracts/provider-adapter.md §1).

**Both paid adapters: the temperature**

- **FR-017**: A paid adapter's settings SHALL say whether its model takes the request's temperature: `temperature: as_requested`, or `temperature: model_default`, under which the adapter sends no temperature, whatever the request carries. `config/routing.yaml` SHALL set `model_default` for `anthropic` and for `bedrock`, so the twin's 0.3 reaches the local model alone and Haiku 5.5 its default, 1, on either provider (Source, "Spec 000's live contract case"). `as_requested` SHALL be the default when the key is absent, so a configuration without it behaves as before (Amendment 7-4).

**The twin's answer when the model refuses**

- **FR-018**: WHEN an answer ends with the finish reason `content_filter` (the Anthropic API's `refusal`; a Converse `content_filtered` or `guardrail_intervened`; an OpenAI-compatible `content_filter`), THE TWIN'S ROUTE SHALL replace it whole with the fixed line `withheld`, count the withholding under the guard `refusal`, keep the call's cost counted, and not retry (spec 007, FR-021 and its Q3), and the admin twin route SHALL report the guard to the runners (Amendment 7-3).

**Cost: the price, the ceilings, and the monthly cap**

- **FR-019**: EVERY call to the Anthropic API SHALL carry, on its spans and its ledger row, provider `anthropic`, the model, the input and output tokens, and the estimated cost from the price table (spec 000, FR-023). THE PRICE ENTRY, `anthropic`/`claude-haiku-5-5`, SHALL arrive in a new version of `config/prices.yaml` by the Author's patch, with the figures he confirms, marked "est." until he does; WHILE prod's route names `anthropic` and no active or later version prices it, prod SHALL refuse to start (`price_missing`). The entry SHALL be the tier for prompts up to 100,000 tokens, which every call stays under within the gateway's input bounds.
- **FR-020**: EVERY call to the Anthropic API SHALL count, at its estimated cost, toward prod's day and month ceilings, and a fallback call toward the day's fallback sub-budget, exactly as a call to Bedrock does (spec 000, FR-030, FR-031), whatever credits the Author's Anthropic account holds; THE METER SHALL read no balance, credit, or invoice. The ceilings, the sub-budget, and their renewal SHALL not change (provisional, Q3).
- **FR-021**: `config/budgets.yaml`, the Author's file, SHALL accept `envs.<env>.adapter_monthly_usd`, an optional map from a paid adapter's ID in `config/routing.yaml` to a monthly cap in USD, more than 0 and at most `monthly_usd`, counted inside the monthly ceiling as the sub-budget counts inside the daily one; `envs.dev` SHALL still equal `envs.prod` (rule B8). THE AUTHOR'S PATCH SHALL set `anthropic`'s cap to his value. WHILE prod's route names an `anthropic-messages` adapter that has no cap, prod SHALL refuse to start (`adapter_cap_missing`) (provisional, Q3, Q4).
- **FR-022**: THE METER SHALL count each capped adapter's spend per UTC month on a meter of its own: every metered call to the adapter, `fallback` and `test` alike, SHALL reserve against it and commit to it. Admission SHALL refuse a call to the adapter WHILE its month's spend plus reservations is at or above its cap, with the degraded cause `adapter_month_spent`, checked after the day and month ceilings and before the sub-budget's checks (spec 000's data model §7.2). The month SHALL roll over lazily, survive a restart, and be rebuilt by initialization from the journal's records of the adapter's calls (provisional, Q4).
- **FR-023**: WHEN a commit's spend on an adapter's month crosses the cap times `warn_ratio`, THE METER SHALL send a warning alert keyed by the adapter and the month. WHEN it crosses the cap, it SHALL, in the same transaction, set the paid fallback awaiting renewal WHERE the adapter is the route's fallback, queue a `fallback_exhausted` alert keyed by the adapter and the month, and write an audit row. The Author's renewal SHALL restore the paid fallback, while the adapter's own calls stay refused until the next UTC month or his patch raising the cap; no rollover SHALL restore either on its own (Principle V; provisional, Q4).

**The live runs on either paid adapter**

- **FR-024**: `make evals ADAPTER=anthropic`, `make redteam-live ADAPTER=anthropic ENV=prod`, and `make contract-live ADAPTER=anthropic ENV=prod REASON=…` SHALL run as their Bedrock forms do: the Author's alone, refused in the agent sandbox, through prod's admin routes with the operator token, attributed `test` inside the ceilings and the adapter's cap, never failing over. The targets SHALL refuse any `ADAPTER` but `local`, `bedrock`, and `anthropic` (and `fake` for `make evals`); `make redteam-live` and `make contract-live` SHALL refuse a paid adapter with any `ENV` but prod, and `make evals` SHALL send a paid adapter's cases to prod whatever `ENV` says, as it sends Bedrock's.
- **FR-025**: THE RUNNERS (`evals/run.py`, `redteam/run.py`, and `scripts/operator.py`'s `contract-record`) SHALL take `anthropic` as an adapter, send each case to it by its ID, refuse a paid adapter on any stack but prod, and record each run as `<UTC>-anthropic.json` with the adapter and its provider named; nothing SHALL infer the provider from a file name alone.

**Readiness evidence (spec 007's FR-031 and `NEEDED`, amended)**

- **FR-026**: THE EVIDENCE a ready entry needs SHALL be a product run and a red-team run on prod's local model, and a product run and a red-team run on the paid adapter that `config/routing.yaml`'s `envs.prod.fallback` names when the report runs, or none WHERE prod's route names no fallback. `evals/twin_readiness.py`'s `NEEDED` SHALL read that adapter from the file rather than naming Bedrock, and identify each run by its record's `adapter` as well as its file's name (Amendment 7-2; provisional, Q6).
- **FR-027**: EACH product run in an entry's evidence SHALL hold a result for every Golden Q&A case of the entry's topic on both paths, and for every gap case of the topic, as the committed suite generates them (`evals/product/cases/twin-*.yaml`; for free talk, every twin case); a run missing any SHALL read "evidence missing", naming the topic, the path, and how many cases are missing, and the golden share and the safety rule SHALL be computed over the complete set. EACH red-team run SHALL likewise hold a result for every committed live case. (The gap found on 2026-11-08; spec 007's FR-031, "per topic, per path, per adapter".)
- **FR-028**: THE REPORT SHALL stay information that fails nothing (spec 007, FR-031; spec 006's lesson). The fix SHALL land in `evals/twin_readiness.py` alone, since no mirror of the evidence rule exists: the gateway's `src/twin/readiness.ts` and the room build's `apps/web/build/room/readiness.ts` apply spec 007's FR-030 (the flag and the two hashes) and parse `evidence` only as a list of strings. `evals/test_twin_readiness.py` SHALL pin each case of SC-005's matrix.
- **FR-029**: READINESS at run time SHALL stay spec 007's FR-030: a switch of prod's paid fallback SHALL close no topic; the report SHALL name what the newly routed adapter's evidence lacks; and the merge note of a branch that switches the fallback SHALL list the runs to make (provisional, Q6).

**Secrets**

- **FR-030**: THE ANTHROPIC API KEY SHALL live only in prod's env file, `~/.config/h4reet-ai/env/prod.env`, as `GATEWAY_ANTHROPIC_API_KEY` (provisional, Q5). `deploy/compose.yaml` SHALL pass it to the gateway alone, as `${GATEWAY_ANTHROPIC_API_KEY:-}`. Prod's template SHALL list it, empty; preflight SHALL allow it empty WHILE prod's route names no `anthropic-messages` adapter, and refuse it empty WHILE it does; dev's template and dev-cpu's vars SHALL not hold it.
- **FR-031**: THE KEY SHALL appear in no file of the repository, log record, span, metric, alert, incident draft, audit row, error, contract recording, or history entry. The gateway's redaction patterns (`src/telemetry/redact.ts`), the collector's (contracts/telemetry.md §6.3, `deploy/otel/collector.yaml`), guard G5, and the red-team suite's secret pattern SHALL recognize an Anthropic key's shape; tests SHALL build any key-shaped value at run time, never as a literal.
- **FR-032**: THE AUTHOR'S enforcement patch SHALL land before this spec's branch merges, so the key and the paid route have their denies before they exist (`CLAUDE.md`: "a secret, a paid route, or a file prod reads gets its deny in the same patch that creates it, or an earlier one"): `GATEWAY_ANTHROPIC_API_KEY` and `ANTHROPIC_API_KEY` in the sandbox's `credentials.envVars` and in `evals/agent-config/static.py`'s FR-007 list, which the canary reads; the bash gate refusing `make evals` and `make check` with `anthropic`, and `evals/run.py` with `anthropic`, in every spelling its Bedrock rule catches; their matrix rows; the compose policy refusing an Anthropic key or any `ANTHROPIC_*` variable on any service but the gateway's named key; and `CLAUDE.md`'s routing sentence (FR-041).

**The route out**

- **FR-033**: THE GATEWAY SHALL reach `api.anthropic.com` on port 443 through its `egress` network, as it reaches Bedrock, with no new network, service, port, or compose policy rule for the route itself (the `egress` bridge has no destination allowlist; row S2), and the adapter SHALL connect to no other host.

**Telemetry, the dashboard, and alerts**

- **FR-034**: EACH attempt's client span, `chat claude-haiku-5-5`, SHALL carry `gen_ai.provider.name: anthropic`, `server.address: api.anthropic.com`, `server.port: 443`, and spec 000's canonical key set (contracts/telemetry.md §3.3), with no payload on prod.
- **FR-035**: THE GATEWAY'S instruments SHALL gain the adapter's month as gauges (its spend, its cap, and its warning, by `h4.adapter`), the cause `adapter_month_spent` in `h4.degraded.cause`, `h4.degraded.responses`, and `h4.twin.turns`, and the guard `refusal` in `h4.twin.withheld`; `h4.adapter.healthy` and `h4.cost.usd` SHALL carry the adapter as they carry Bedrock, with the zero series at start for the routed paid adapter (contracts/telemetry.md §4.1, tasks.md T191 of spec 000).
- **FR-036**: THE DASHBOARD'S Spend row SHALL gain "Paid adapter's month against its cap", spend beside cap and warning, next to the existing spend panels; the panels that already group by provider or adapter (cost by provider and attribution, provider latency, tokens by provider, adapter health) SHALL show the adapter with no change; and a table beside the authoritative store-state panel SHALL show each paid adapter's month as the store holds it (Principle V: "every dashboard shows spend next to latency and errors").
- **FR-037**: THE ALERTS SHALL name the adapter's month in its warning and its exhaustion, and "the Anthropic API" in `fallback_unavailable`; a runbook, `docs/runbooks/anthropic-unavailable.md`, SHALL say what to check (the key, the account, the API's status, the circuit) and how to go back to Bedrock; `docs/runbooks/fallback-renewal.md` SHALL cover the adapter's month; and contracts/alerts.md §6 SHALL map both (Principle II: "a runbook entry if it can page a human").

**Disclosure**

- **FR-038**: THE DATA-FLOW DISCLOSURE SHALL gain row F3, in a section of its own, "Spec 010: the Anthropic API", in this spec's words (Data-Flow Disclosure Entries), in the change that adds the adapter, before any call can reach Anthropic; in the same change row S2 SHALL name F3, row D1's sentence that the stack "calls no Anthropic endpoint" SHALL change as the entries give it, and row V2's **Why** SHALL name the paid fallback's rows (Amendment 7-5).
- **FR-039**: F3's words about what Anthropic keeps of a request, where, for how long, and whether it trains on it SHALL be the Author's, from Anthropic's published commercial terms as he reads them; until he writes them, F3 SHALL hold the marked placeholder the entries give. `make test` SHALL fail WHILE `config/routing.yaml`'s prod route names an `anthropic-messages` adapter and F3 still holds that placeholder, so no visitor's turn can reach Anthropic before his words are in. BEFORE his route names the Anthropic API, THE AUTHOR SHALL weigh his words against intent 000's "Nothing is retained beyond the session without explicit consent" and the corpus's "their conversation is not saved" ([tasks.md](tasks.md) T059); no agent decides it.

**The local stack first, and the documents**

- **FR-040**: WHEN the operator runs `make up` on any stack, IT SHALL start with this change as before: dev and dev-cpu never build the adapter, and their env files gain nothing; prod builds it only while its route names it, and a prod env file whose key is empty passes preflight while its route names Bedrock.
- **FR-041**: THIS SPEC'S AMENDMENTS SHALL be made by name, never by editing another spec's text (the Amendments below); spec 000's contracts and data model, and spec 002's room-conversation contract, which are living interfaces, SHALL carry each changed passage marked "(spec 010)"; a new ADR SHALL record the decision, extending ADR 0001; and the Author's patch SHALL change `CLAUDE.md`'s routing sentence to "local-first, then the one paid fallback prod's route names (Bedrock or the Anthropic API) within its sub-budget and caps, then degraded".

### Key Entities

- **Paid adapter**: an adapter of kind `paid`, prod's alone: `bedrock` (Bedrock's Converse API) or `anthropic` (the Anthropic API's Messages endpoint); prod's route names at most one, as its fallback.
- **The anthropic adapter**: `adapters.anthropic` in `config/routing.yaml`, type `anthropic-messages`, model `claude-haiku-5-5`, its key read from `GATEWAY_ANTHROPIC_API_KEY`.
- **Adapter month**: one paid adapter's metered spend and reservations in one UTC month, held to its cap from `adapter_monthly_usd`.
- **Monthly cap**: the Author's figure for one paid adapter's month, at most the monthly ceiling.
- **Live run**: one of the Author's evaluation, red-team, or contract runs, on one named adapter through prod's admin routes, with its committed history entry.
- **Evidence**: the history entries a ready topic's line names: complete product and red-team runs on prod's local model and on the paid adapter the route names.
- **Row F3**: the disclosure's row for the gateway's calls to Anthropic, with the Author's words about what Anthropic keeps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a recorded run of at least 100 turns on the test stack with prod's route naming `anthropic` and the local model stopped, 100% of answered turns are answered by the anthropic adapter, each call with provider, model, tokens, and cost on its span and its ledger row, and each reply's `cost_micro_usd` equal to its ledger rows' sum; with the local model healthy, 0 requests reach the stub.
- **SC-002**: The adapter passes all 12 of the contract suite's checks in stub mode, its span key set identical to the local and Bedrock adapters'; the Author's live recording passes the live checks (C1, C2, C3, C6, C7, C8).
- **SC-003**: Across the test suite, 0 occurrences of a run-time fake key in any captured log record, span, metric, alert text, audit row, error, or recording, and in no request header but `authorization`, which carries it as a bearer token (the pinned SDK's form; [plan.md](plan.md), departure B2); 0 `traceparent`, `tracestate`, or `baggage` headers on the wire.
- **SC-004**: In the integration tests, the commit that reaches the cap writes the alert, the audit row, and the flag in its transaction; the next call to the adapter is refused with `adapter_month_spent` and makes 0 requests; 100% of local turns are answered meanwhile; the flag survives a restart and a rollover until a renewal; after a same-month renewal the adapter stays refused until the month rolls over.
- **SC-005**: Across the readiness fixture matrix (a run holding none of the topic's cases; one path only; a gap case missing; a red-team run missing a live case; the paid run on an adapter the route doesn't name; the route naming no fallback; a complete, passing set), the report gives 0 false "ready" lines and reads the complete set ready, and `make evals`'s exit status is the same with and without the report in 100% of cases.
- **SC-006**: Every row of the Degraded-Mode Behavior table answers with its named cause or line in tests, with 0 Messages requests where the row says none.
- **SC-007**: 100% of tested `refusal` endings show the fixed line `withheld`, counted under `refusal`, with the call's cost counted.
- **SC-008**: `make up ENV=dev-cpu` starts and hello answers as before; prod's preflight passes with the key empty while the route names Bedrock, and refuses it empty while the route names `anthropic` (fixtures).
- **SC-009**: Before the Author marks a topic ready while prod's route names `anthropic`, his product run on it meets spec 007's thresholds at the running hashes, and his red-team run on it is clean; the measured cost per turn is recorded beside this spec's estimate.
- **SC-010**: `make test` fails in 100% of the tested combinations in which `config/routing.yaml` names `anthropic` as prod's fallback while F3 holds the placeholder, and passes once the Author's words replace it; F3 stands in its own section, in this spec's words.

## Amendments to Specs 000, 002, and 007, and to ADR 0001

As specs 004, 006, and 007 do, the amended text stays as it is; each amendment supersedes the clause it names from this spec's approval, and the amended spec's later work reads it beside its own text. Spec 000's contracts and data model, and spec 002's room-conversation contract, are living interfaces: their passages change in the branch, each marked "(spec 010)" (FR-041). The IDs carry the amended spec's number. Clauses were read at 953ad7ea.

**Spec 000 (local foundations)**

| ID | Clause | Change | Why |
|---|---|---|---|
| 0-1 | spec.md FR-022 ("route to Bedrock, but only in a stack that has it") and FR-030 ("Its Bedrock fallback sub-budget … limits the calls routed to Bedrock as fallback") | "Bedrock" reads "the paid fallback prod's route names, Bedrock or the Anthropic API"; the order, the sub-budget's figures, and its renewal are unchanged | FR-001, FR-020 |
| 0-2 | contracts/provider-adapter.md §2.5 (the table's columns), §3 (the shipped adapters), §4 (the registry), §5.3 (the run modes) | an Anthropic column; §3.4, `anthropic-messages`; the type registered; "Live, Anthropic" beside "Live, Bedrock" | FR-004 to FR-016 |
| 0-3 | contracts/config-files.md §1.1 (types, kinds, settings by type), §1.3, §1.4 | `anthropic-messages` → `paid`, its settings and rules; `temperature` on both paid types; `missing_env` for `api_key_env`; `adapter_cap_missing` | FR-005, FR-014, FR-017, FR-021 |
| 0-4 | contracts/config-files.md §3.1 and §3.3 (`budgets.yaml`) | `envs.<env>.adapter_monthly_usd`, its derived warning, and a rule B9 for its keys and bounds | FR-021 |
| 0-5 | data-model.md §2.3, §2.4, §3 ("What a rebuild reads"), §6.2, §7.2, §7.3 | the meter kind `adapter_month`; the rows a call touches; the admission check and its precedence; the crossings; the flag set by the cap; the rebuild | FR-022, FR-023 |
| 0-6 | contracts/gateway-http.md §3 (the causes) | the cause `adapter_month_spent`, with its fixed detail | FR-022 |
| 0-7 | contracts/telemetry.md §3.3, §4.1, §7.1, §7.2 | provider and server values; the adapter month's gauges; the cause in every cause list; the guard `refusal`; the cap's panel; a table of the adapters' months beside the store-state panel | FR-034 to FR-036 |
| 0-8 | contracts/alerts.md §2, §3, §6 | the adapter month's warning and exhaustion keys and texts; the Anthropic label; the runbooks' map | FR-037 |
| 0-9 | contracts/env-files.md §4, §8, §10 | `GATEWAY_ANTHROPIC_API_KEY`; its row in FR-007's deny list; P3's allowed-empty key; P19 scoped to `bedrock-converse`; the key's check while routed | FR-030, FR-032, FR-040 |
| 0-10 | contracts/provider-adapter.md §4, "An ESLint `no-restricted-imports` rule refuses `@aws-sdk/*` outside `src/adapters/`" | reads as the rule the base holds: `test/unit/provider-names.test.ts`, which reads every string and module specifier, refuses `@aws-sdk/*` and `@anthropic-ai/sdk` outside `src/adapters/`; no ESLint rule of that name exists in `eslint.config.js` at 953ad7ea | FR-004 |

**Spec 002 (the room)**

| ID | Clause | Change | Why |
|---|---|---|---|
| 2-1 | contracts/room-conversation.md §3 (the cause classes) and `apps/web/src/room/signals/tier.ts`'s `BUDGET_CAUSES` | `adapter_month_spent` is of the budget class | FR-022; User Story 4 |

**Spec 007 (the twin's conversation core)**

| ID | Clause | Change | Why |
|---|---|---|---|
| 7-1 | FR-024 ("on prod, the Bedrock fallback only while …") and FR-050 ("(local on prod or dev; Bedrock on prod)") | "the paid fallback prod's route names"; "a paid adapter on prod, the one its route names" | FR-001, FR-003 |
| 7-2 | FR-031 ("on prod's local model and on the Bedrock fallback, and its live red-team run is clean on both"); plan §6 ("the evidence a local product run, a Bedrock product run, and a live red-team run on each adapter"); `evals/twin_readiness.py`'s `NEEDED`; SC-001 and SC-004 ("on both adapters") | the paid adapter prod's route names, and only complete runs | FR-026, FR-027 |
| 7-3 | FR-021 and FR-023 (the guards and the trim); FR-044's withheld count, and the telemetry contract's `h4.twin.guard` values | a `content_filter` finish is withheld whole as `withheld`, under the guard `refusal` | FR-018 |
| 7-4 | plan §2 step 4, `temperature: 0.3` (plan choice) | reaches the local model only; a paid adapter set to `model_default` sends none | FR-017 |
| 7-5 | Data-Flow Disclosure Entries, row V2's **Why** | names the paid fallback's rows, F1 or F3 | FR-038 |

**ADR 0001 (local-first routing with capped Bedrock fallback)** is extended, not replaced, by a new ADR, proposed, at the next free number: "The Anthropic API as a second paid adapter, prod's fallback one at a time". It extends ADR 0001's Decision, item 3 ("Bedrock, if local is unhealthy, the stack has a paid route …"), to the paid fallback the route names, and its "Bedrock model" line with the Anthropic API's model, and records the adapter's monthly cap. Local-first stays intact under Q1's answer, so no ADR replaces 0001; ADR 0001's own text stays, and its index row gains "(one Decision extended by 00NN)".

**`CLAUDE.md`** changes by the Author's hand (FR-041), as the constitution's Governance has it: "where they conflict, the constitution wins and the other document is fixed". **The constitution** needs no amendment under Q1's answer (Assumptions, "Readings").

## Assumptions

**Scope**

- **In:** the adapter, its transport, and its contract tests; its routing entry; the temperature setting for both paid adapters; the twin's refusal guard; the meter's adapter month, its cause, alerts, gauges, and panel; `budgets.yaml`'s schema for the cap; the live runs' targets and runners; the readiness evidence's amended rule and its fix; compose, prod's template, and preflight for the key; the disclosure's rows; the runbooks; the ADR; and the Author's patches, drafted.
- **Out:** a paid primary (Q1's option B); a chain of two paid fallbacks (Q2's option B); building an unrouted paid adapter so either can be evaluated (Q2's option C); raising the ceilings for the credits (Q3's option B); streaming, tools, prompt caching, and batch calls; the Anthropic adapter on dev; any change to the kill switch, the sub-budget's figures, or the alert channels; spec 001's cloud.

**Readings**

- **"run everything pointing to aws bedrock"** reads as the live runs on Bedrock, which exist, with Bedrock as the fallback (Q1). The live runs on the Anthropic API need prod's route to name it first, since the admin routes call only the route's adapters (FR-003); before spec 001 the only visitor is the Author, so no visitor's turn reaches an unevaluated adapter in between.
- **The constitution's "initial policy"**: "Routing policy is configuration; the initial policy is local-first with Bedrock as fallback inside a capped sub-budget." A direct vendor API is one of the standard's named adapters, and the Anthropic API as the capped fallback keeps local first and the cap, so choosing it is a configuration change the standard provides for, not a deviation. A paid primary would be a deviation.
- **"$200 of free credits per month"** is the Author's statement about his Anthropic account, unverified here. The meter counts list price, which never undercounts what a call costs; whether the credits pay the invoice is his to see in Anthropic's console.
- **"a paid adapter in prod's route only"**: dev stays synthetic; the adapter's tests run against a stub, in the sandbox, with no credential.
- **The refusal** maps to `content_filter`, the contract's finish reason for an answer a provider filtered (contracts/provider-adapter.md §2.5: "A filtered answer is not an error"), so FR-018 applies to every adapter's filtered answer, not only Anthropic's.
- **"a run filtered with ONLY or LIMIT"** (the brief): `evals/run.py` and `redteam/run.py` offer no case filter at 953ad7ea; the fix doesn't rely on one never being added, nor on a run never being cut short.
- **The facts about the API** are the brief's, from a reference cached on 2026-10-06; the plan's first task confirms each against the pinned SDK, and the Author confirms the prices and the terms.

**Dependencies**

- **Group B merged** (spec 007's code on `main`), and spec 007's P-1 (the readiness file) and P-2 (`limits.twin`), without which prod answers every twin turn `twin_unavailable`, on any adapter.
- **The Author's patches** ([plan.md](plan.md) §13): P-A, the enforcement layer and `CLAUDE.md`'s sentence, before this branch merges; P-B, the price version, and P-C, the cap, after it, since `main`'s strict schemas refuse the cap's key until then.
- **The Author's own steps**: the key in prod's env file; his words in F3, read from Anthropic's published terms and weighed against intent 000's and the corpus's promises; his decision to switch the fallback; his live runs; his readiness marks.
- **His Anthropic account**, its key, and its billing, which no agent sees.

**Deviations** (named, as the constitution's Governance requires: "Deviations require a written justification in the spec and an ADR if permanent.")

- **Principle III**: "Every change begins as an `intent.md` in the originator's own words … accepted or closed by the Author. An accepted intent becomes a specification". The intent beside this spec is a draft, and this spec was written at the main session's direction while the Author was away, as specs 006, 008, and 009 were written beside draft intents. Nothing is built or merged before the Author accepts the intent and approves this spec and its plan; if he closes the intent, this folder closes with it.
- **Inherited: local until publication** (ADR 0013). This spec and its branch are reviewed with a note in `docs/merge-requests/`, not a pull request, and the Author's gate stands in for CI (spec 000, FR-041).
- **Inherited: the behavioral tier as evidence, not a gate** (spec 006's interim, ADR 0038, proposed). This branch changes no trigger path; the Author's P-A changes `.claude/` and `CLAUDE.md`, so its run follows the rule `main` has then.

## Expected Cost Impact

- **A turn the Anthropic API answers** (prod, only while its route names it): at the brief's price, $0.10 per million input tokens and $0.50 per million output, est., the same as Bedrock's version `2026-10-12.1`: typically 5,000 to 8,000 input tokens and up to 300 output, about $0.0007 to $0.00095 a twin turn (spec 007's estimate), with a reservation of at most $0.00335. A hello turn, under $0.0002.
- **The live runs on it**: one product run, about 200 turns, roughly $0.20; one red-team run, about 40 turns, under $0.05; one contract run, about 10 calls, under $0.05; each on prod's meter as `test`, inside the ceilings and the cap.
- **The health check**: the model lookup counts no tokens, by the API's reference, to confirm (FR-012); about 1,440 requests a day while the route names the adapter, at no metered cost.
- **Against the caps**: no ceiling, sub-budget, or renewal changes (FR-020). The monthly cap's proposed value, $10.00, half the monthly ceiling, lets the paid fallback stop on its own before the ceiling, whose trip stops local answers too, comes within its reach ([plan.md](plan.md) §4.3); it is the Author's to set.
- **The credits**: if his account's credits pay the invoice, Anthropic may bill less than the meter counts; the meter counts list price either way (Q3).
- **Before publication**: the only visitor is the Author, so visitor spend is about $0; the live runs are the cost.
- **Local and development**: no new model or service; the gateway's image grows by the SDK and its dependencies (measured in the branch's note); development time on the Claude Team plan (spec 000, FR-037).
- **Measurement**: the ledger's rows with provider `anthropic`; `h4_cost_usd_total` by provider and attribution; the adapter month's gauges against the cap; each live run's history totals; the first live run's measured cost per turn, recorded beside this estimate.

## Degraded-Mode Behavior

Defined before the happy path, as Principle I asks, and built in the foundation. Each row is for prod with its route naming `anthropic` and the local model unable to answer, but the first.

| What is gone or off | What the visitor sees | Anthropic requests | Cost |
|---|---|---|---|
| The local model is up | the local answer, as today | none | $0 |
| The kill switch has tripped, or a day or month ceiling is reached | `cannot_talk.budget` | none | $0 |
| The state is unknown (the store unreachable or empty), or the journal is unwritable | `cannot_talk.unavailable` | none | $0 |
| The sub-budget is spent, or awaits renewal | `cannot_talk.budget` | none | $0 |
| The adapter's monthly cap is reached (`adapter_month_spent`) | `cannot_talk.budget` | none | $0 |
| The health check finds the key refused, or the circuit is open | `cannot_talk.resting` (`fallback_unavailable`) | health checks only | $0 |
| The API is overloaded, unavailable, or unreachable | `cannot_talk.resting` | the call that failed | $0 |
| The API rate-limits the call | one retry if the deadline allows, then `cannot_talk.resting` | at most two | $0 |
| The call passes its request timeout or the deadline | `cannot_talk.resting` | the call | its reserved maximum |
| The account can't pay | `cannot_talk.resting`, as the API's status maps (FR-009) | the call | as the API reports |
| The model stops with `refusal` | the fixed line `withheld` | the call | counted |
| The answer reaches `max_tokens` | trimmed to its last sentence, or withheld (spec 007, FR-023) | the call | counted |
| The route names `anthropic` without its key, price, or cap | prod doesn't start; preflight names the reason first | none | $0 |
| The route names `anthropic` while F3 holds its placeholder | the branch fails `make test`, so it can't pass the gate | none | $0 |
| Any of the above | the resume, the PDF, the pieces, and the room keep working (spec 002, FR-038) | — | — |

## Telemetry and the Dashboard

- **The spans** (FR-034): each attempt's `chat claude-haiku-5-5` client span, with `gen_ai.provider.name: anthropic`, `server.address: api.anthropic.com`, `server.port: 443`, the cost and route attributes every call carries, and the canonical key set C8 checks; no payload on prod; no HTTP client span or trace header for the call itself, which the instrumentations' ignore hooks keep from leaving the stack.
- **The instruments** (FR-035): the adapter month's spend, cap, and warning gauges by `h4.adapter`; `adapter_month_spent` among `h4.degraded.cause`'s values and in `h4.degraded.responses` and `h4.twin.turns`; `refusal` among `h4.twin.withheld`'s guards; `h4.adapter.healthy` and `h4.cost.usd` for the adapter, as for Bedrock.
- **The panels** (FR-036): "Paid adapter's month against its cap" in the Spend row, and the adapters' months from the store beside the store-state panel; the provider panels, which show the adapter with the data they already read.
- **The alerts** (FR-037): the adapter month's warning and exhaustion; `fallback_unavailable` naming the Anthropic API; each mapped to a runbook.
- **Never in telemetry**: the key, a payload on prod, or anything that names who asked (FR-031).

## Data-Flow Disclosure Entries

For `docs/data-flow-disclosure.md`, in the change that adds the adapter (FR-038, FR-039). F3 is new, in a section of its own after the room's; S2, D1, and V2 change. The `<…>` in F3's **From → To** is the marked placeholder for the Author's words, which only he writes (FR-039).

| ID | From → To | Trigger | Carries | Never carries | Why | Default | How to switch it off |
|---|---|---|---|---|---|---|---|
| F3 (new) | `gateway`, on prod only → `api.anthropic.com`, the Anthropic API, over HTTPS through `egress`: `POST /v1/messages` for a call, and `GET /v1/models/claude-haiku-5-5` for the health check. The gateway connects to no other Anthropic host: the endpoint is fixed in the adapter's code, never configuration or an environment variable (spec 010, FR-005 and FR-007). The model is Claude Haiku 5.5, `claude-haiku-5-5`, the model F1's inference profile names. What Anthropic keeps of a request, where, for how long, and whether it trains on it, in the Author's words from Anthropic's published commercial terms: <the Author's words: what Anthropic's commercial terms say it keeps of an API request, for how long, where it processes it, and whether it trains on it, as he read them, with the date> | prod only, and only while `config/routing.yaml` names `anthropic` as prod's fallback, which it doesn't at spec 010's merge: a `POST /hello` or a room turn the local model can't answer, admitted inside the fallback sub-budget, the ceilings, and the adapter's monthly cap; the Author's live runs on it, attributed `test` inside the ceilings and the cap (`make contract-live ENV=prod ADAPTER=anthropic`, `make evals ADAPTER=anthropic`, `make redteam-live ADAPTER=anthropic ENV=prod`); and the health check, once a minute while the route names it | for hello, the fixed system prompt, the message, and an output cap of 128 tokens; for a room turn, the twin's instructions (`config/twin/prompt.md`), the turn's corpus excerpts, the conversation so far with the visitor's words, the path as a depth instruction, and an output cap of 300 tokens; for the Author's runs, their committed cases. And the model ID; thinking switched off; the API key, as a bearer token in the `authorization` header; the API version header; the SDK's user agent, which names the SDK and its version; the host's IP address. Back come the completion, its token counts, its stop reason, and the message's ID. For the health check: the key and the model ID; back comes the model's description | anything that names who asked: the edge-supplied address and any `X-H4-Client` label stay in the gateway, and no `metadata` user ID is sent; a temperature; the operator token, the AWS session, the alert channels' credentials, and the store's contents; trace context: no `traceparent`, `tracestate`, or `baggage` header; the SDK's platform headers, since the transport sends an allowlist (spec 010, FR-016) | the paid fallback keeps hello and the twin answering while the local model is down, inside the capped sub-budget and the adapter's own monthly cap, as F1 does; the Author chooses which of the two serves it, in his words "an option of using the anthropic api directly" (2026-11-08), and "Routing policy is configuration" (the constitution's Model access standard) | off: on only once the Author changes prod's route to `fallback: anthropic`, after his price, his cap, his key, and his words in this row (spec 010, FR-002 and FR-039); never on dev or dev-cpu, whose routes can name no paid adapter (`paid_route_outside_prod`) and whose env files hold no Anthropic key | put `fallback: bedrock` back in `envs.prod` in `config/routing.yaml`, or take the fallback out, commit, and run `make up ENV=prod`; or `make down ENV=prod`. Until then the meter bounds it: $2 of fallback a day for each grant, the $5 daily and $20 monthly ceilings, and the adapter's monthly cap. Marking every topic and free talk not ready stops the room's share of it, and the Author's live runs happen only when he starts them |
| S2 (changed) | as before | as before, and: on prod, while its route names it, the Anthropic API, F3 (spec 010) | what A1, A2, F1, F2, and F3 say | as before | as before | as before | as before |
| D1 (changed) | as before | as before | as before | as before | as before | as before, but for one sentence: "never from the stack, which holds no Anthropic credential and calls no Anthropic endpoint: the gateway reaches Bedrock's models through AWS (F1)" becomes "never from the stack as a session: the stack's only calls to Anthropic are F3's, prod's gateway with its own key, while prod's route names the Anthropic API (spec 010), and otherwise it reaches Bedrock's models through AWS (F1)" | as before |
| V2 (changed) | as before | as before | as before | as before | as before, and: on prod, that fallback is the paid adapter prod's route names: Bedrock (F1) or the Anthropic API (F3) | as before | as before |

The new section's lead, for the disclosure: "The row of spec 010 (specs/010-anthropic-provider/, FR-038 and FR-039): the gateway's calls to Anthropic's own API, prod's paid fallback when the Author's route names it in Bedrock's place. Its cells are the spec's words (its Data-Flow Disclosure Entries), and its words about what Anthropic keeps are the Author's."

Not new rows: the key itself leaves the stack only in F3's own request header, and sits in prod's env file outside the repository, as the alert channels' credentials do; the image's new package comes through P2's `npm ci`, whose row already names `registry.npmjs.org` and the lockfile.

## Constitution Check

Applied with the `constitution-check` skill's eight questions against constitution 1.0.1.

| Principle | Touched | How it complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | One new flow off the stack, F3, with its reason, in the change that adds the adapter and before any call can reach it (FR-038); what Anthropic keeps is the Author's words, and `make test` holds the route back until they're in (FR-039). Local first stays (FR-001); the whole topology still runs locally with one command (FR-040). The degraded mode is defined first and built in the foundation (User Story 4; the table above). No biometrics. |
| II. Production-grade or not shipped | Yes | Tests for every FR, test-first ([tasks.md](tasks.md)); the contract suite and the Author's live runs (FR-015, FR-024); the readiness evidence made complete (FR-027); the spans, instruments, panel, alerts, and runbooks (FR-034 to FR-037); the cost estimate above and its measurement; an ADR and the gateway's README for a cold reader. |
| III. Intent before spec, spec before code, humans merge | Yes | From the intent beside it, in the Author's words; specs 000, 002, and 007 amended by name, ADR 0001 extended by a new ADR; the provisional answers left his to overturn; no agent merges. Deviation: the intent is a draft and the spec was written at the main session's direction while he was away (Deviations). |
| IV. Least privilege | Yes | The key lives in prod's env file, denied by name before it exists, and never reaches an agent, a log, or a trace (FR-030 to FR-032); the paid route's live runs are the Author's, refused in the sandbox and by the bash gate (FR-024, FR-032); the prices and the cap are his files (FR-019, FR-021); no permission, allowlist, or sandbox domain is widened (the npm registry the SDK comes from is already allowed). |
| V. Cost is a first-class signal | Yes | Every call through the gateway with provider, model, tokens, and cost (FR-004, FR-019); the meter counts list price whatever the credits (FR-020); the cap stops the adapter on its own, and the Author restores it (FR-022, FR-023); the kill switch read first, unknown as degraded (FR-013); spend beside latency and errors on the dashboard (FR-036). |
| VI. Build in public, including failures | Yes | The adapter, its contract tests, the live runs' history, and the readiness rule's fix are committed; refusals are counted on a public panel (FR-035); the gap found tonight is recorded in the spec that fixes it. |
| VII. Own the whole product, and say exactly what you owned | Yes | The product reasoning (why one paid adapter at a time, why the meter ignores the credits, why the cap stops only the adapter) is in the spec and the ADR. |
| VIII. Honest AI | Yes | The twin's guards run on every answer from either provider; a refusal shows the fixed line (FR-018); a topic opens only on complete evidence from the adapters that would answer it (FR-026, FR-027). |
| Security & Agent Governance | Yes | "a secret … gets its deny in the same patch that creates it, or an earlier one" (FR-032); the runtime still treats visitor input as adversarial (spec 007, unchanged); the implementer never reviews ([tasks.md](tasks.md)); the new dependency is pinned, vetted, and installed without scripts ([plan.md](plan.md) §1, D2). |
| Model access standard | Yes | A direct vendor API through the one gateway; routing as configuration; evaluations against any routed adapter (FR-003, FR-024). |

## Open Questions for `/speckit-clarify`

All six were taken provisionally on 2026-11-08, each with its recommended option, at the main session's direction while the Author was away (Clarifications). They stay as they were asked, because the Clarifications quote them; the Author can overturn any, and each names what it would change.

### Question 1: What does "run everything pointing to aws bedrock" mean? (FR-001, FR-002)

Taken provisionally: A.

**Context**: His words came as he asked for "your live runs and readiness marks" after spec 007's merge. Spec 007's T075 and T077 are its live product and red-team runs on Bedrock; spec 000's T103 is Bedrock's contract run. ADR 0001 rejected "Bedrock first, local second" because "every request would spend money", and `config/routing.yaml`'s schema refuses a paid primary (rule R1).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | The live runs, on Bedrock, which exist; Bedrock stays prod's paid fallback | Nothing changes for Bedrock but FR-017's temperature; local first stays |
| B | Every prod call to Bedrock first, the local model as the fallback, or never | Ends local-first: a constitution amendment (Principle I's "prefer on-device or self-hosted inference", the Model access standard's policy), an ADR replacing 0001, rule R1 changed, and every turn paid; not built |
| C | Every prod call to the Anthropic API first | As B, on the other provider |

### Question 2: How does the Anthropic API join? (FR-001 to FR-003, FR-024)

Taken provisionally: A.

**Context**: The schema gives each route one optional fallback; the registry builds only the adapters a route names; the admin routes call only those.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | A second paid adapter; prod's route names one paid fallback at a time, his choice in one line; dev synthetic | One small config change to choose; the live runs on a provider need it routed first |
| B | Both, chained: local, then Bedrock, then the Anthropic API | A second fallback in FR-022's order, a schema change, two providers' meters in one turn |
| C | Both built on prod, one routed: either can be evaluated while the other serves | Spec 000's registry and admin contracts change; an unrouted paid adapter's health is checked all the time |

### Question 3: Does the Anthropic API's spend count against the ceilings, given "$200 of free credits per month"? (FR-020, FR-021)

Taken provisionally: A.

**Context**: Intent 000 sets "$5/day and $20/month cloud ceiling". Principle V makes the meter the enforcement point. The meter can't see a provider's balance, and the credits are his statement, unverified here.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Counts at list price on the same ceilings and sub-budget, with a monthly cap inside the monthly ceiling; raising the ceilings is his separate decision | The meter never undercounts; the credits lower the invoice, not the meter; the fallback spends no more than today's caps allow |
| B | Counts only against the adapter's own monthly cap, outside the $5 and $20 ceilings | Uses the credits fully; changes intent 000's ceiling for one provider: his words and an ADR |
| C | Not metered, as free | Against Principle V's "Every model call carries … estimated cost" and the meter as the enforcement point |

### Question 4: When the Anthropic adapter's monthly cap is reached, what stops, and who restores it? (FR-022, FR-023)

Taken provisionally: A.

**Context**: The day and month ceilings trip the kill switch, which stops local answers too, until the Author's reset (spec 000, FR-033). The sub-budget's exhaustion stops only the fallback, until his renewal (FR-030). Principle V: "a human must consciously restore it".

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | That adapter alone, with a cause of its own; local goes on; the paid fallback awaits his renewal; the adapter waits for the next month or a raised cap | A new cause in every cause list; the existing flag, alert kinds, and renewal reused |
| B | A trip of the kill switch, like the ceilings | The least new machinery; a provider's cap stops local answers until his reset |
| C | The adapter refused until the month rolls over, with no human step | Simple; against Principle V's "a human must consciously restore it" |

### Question 5: Under what name does the Anthropic API key reach the gateway? (FR-030 to FR-032)

Taken provisionally: A.

**Context**: The brief named the key `ANTHROPIC_API_KEY`, the SDK's default variable, which Claude Code also reads. Preflight refuses any template key the calling shell also sets (contracts/env-files.md §10, P5), and compose lets the shell's value win over the env file's, which is why prod's AWS profile is `GATEWAY_AWS_PROFILE` (§4).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | `GATEWAY_ANTHROPIC_API_KEY` in prod's env file, read through `api_key_env`; no `ANTHROPIC_*` variable in the container | His shell's own key can never stand in for prod's, nor stop `make up`; the SDK finds nothing to read on its own |
| B | `ANTHROPIC_API_KEY`, as the brief named it | `make up ENV=prod` refused whenever his shell exports it, and, without P5, his personal key would win |

### Question 6: When prod's route names a paid adapter that a ready topic's evidence didn't run on, does the topic close? (FR-026, FR-029)

Taken provisionally: A.

**Context**: Spec 007's readiness at run time is the flag and two hashes; its evidence check is information that fails nothing, by design. `config/routing.yaml` is agent-editable, reviewed in a note, and merged by the Author.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | No: the report names the missing evidence; the switch's note lists the runs | No runtime change; before publication only he visits; after it, his order of steps carries the guarantee |
| B | Yes: each ready entry records its paid adapter, and the gateway closes it while the route names another | A runtime guarantee; a schema change to his readiness file; every switch closes every topic until he re-runs and re-marks |
| C | The twin's turns never fail over while the route's paid adapter lacks evidence | A finer guarantee; the gateway reads the evidence, which it doesn't today |
