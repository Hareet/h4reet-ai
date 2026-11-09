# services/gateway: the model gateway

Every model call the stack makes goes through this service: one provider-agnostic gateway, with the routing, the
kill switch, and the cost meter in front of each provider (spec 000, `specs/000-local-foundations/`). Its HTTP
contract is [gateway-http.md](../../specs/000-local-foundations/contracts/gateway-http.md), its admin listener's is
[operator-admin.md](../../specs/000-local-foundations/contracts/operator-admin.md), and its routing is configuration,
`config/routing.yaml`: local first, then the one paid fallback prod's route names (Bedrock, or the Anthropic API
since spec 010) within its sub-budget and caps, then degraded.

## The layout

- `src/core/`: the gateway itself (`gateway.ts`: the state read, the kill switch, local, then the metered fallback,
  in FR-022's order), the router, the clock, and the per-client limits.
- `src/adapters/`: one adapter per provider (the local OpenAI-compatible model server, Bedrock's Converse, the
  Anthropic API's Messages, and dev's synthetic fallback). No other file calls a provider, or names one.
- `src/meter/`: the store (PostgreSQL; PGlite in tests), admission, reservations, the ledger, and the journal.
- `src/routes/`: the public routes (`/hello`, `/room/events`, `/room/turn`) and the admin listener's.
- `src/twin/` and `src/config/twin.ts`: the twin's conversation core (spec 007, below).
- `src/telemetry/`: the spans and the instruments, with no payloads unless `TELEMETRY_PAYLOAD_SAMPLING` is on.
- `migrations/`: the store's schema, applied in order at start.
- `test/`: vitest, `unit/` and `integration/` (Fastify inject on PGlite, with stub providers; no test calls a real
  model or uses a credential).

## The paid fallback: Bedrock or the Anthropic API (spec 010)

Prod's paid fallback is one line in `config/routing.yaml`, `envs.prod.fallback`: `bedrock`, as at spec 010's merge,
or `anthropic`, the Author's choice. Dev and dev-cpu never route a paid adapter.

- **The adapter**, `src/adapters/anthropic-messages.ts`, type `anthropic-messages`, calls Claude Haiku 5.5
  (`claude-haiku-5-5`) through Anthropic's official SDK, `@anthropic-ai/sdk`, pinned at 1.3.0 and vetted (spec 010's
  plan, D2, B1). Every client option is explicit: the key, the fixed origin `https://api.anthropic.com` (a constant,
  never configuration), no SDK retries, the settings' timeout, the SDK's logging and spans off. Its transport,
  `_anthropic-transport.ts`, resolves through c-ares, times the connect, refuses any other origin, and sets every
  header itself, so no variable the SDK reads on its own changes what is sent (plan B3).
- **Its settings**: `model`, `api_key_env`, `thinking: disabled`, `temperature: model_default` (Haiku 5.5 takes no
  temperature but its default), `timeouts` (connect plus request at most 5 s, rule R8), `retry`, `circuit`, and
  `health` (the model lookup, `GET /v1/models/{model}`, once a minute, which spends no tokens).
- **The key**: `GATEWAY_ANTHROPIC_API_KEY`, in prod's env file only, empty until the Author chooses the Anthropic
  API. Compose passes it to the gateway alone; no container holds an `ANTHROPIC_*` variable. The registry hands the
  adapter that one key, and the redactors know its shape.
- **The cost**: every call counts at its list price toward prod's $5 daily and $20 monthly ceilings, and a fallback
  call toward the $2-a-day sub-budget, whatever credits the account holds. `config/budgets.yaml`'s
  `adapter_monthly_usd` caps the adapter's month: at the cap its calls are refused with `adapter_month_spent`, the
  paid fallback awaits a renewal, and local answers go on; the adapter stays refused until the next UTC month or a
  raised cap.
- **What refuses an early switch**: with the route on `anthropic`, the gateway won't start without its key
  (`missing_env`), its price (`price_missing`), or its cap (`adapter_cap_missing`); preflight names the same first;
  and `make test` fails while the disclosure's row F3 holds the placeholder for the Author's words about what
  Anthropic keeps.
- **The Author's order**: P-A (the denies for both key names, the bash gate's `anthropic` rules, the compose policy,
  and `CLAUDE.md`'s routing sentence) on his branch cut from a tip that holds spec 010's, gated with it, and merged;
  then `make init-env ENV=prod SYNC=1`; then P-C (the cap, $20 a month, his answer) and P-B (the price); then, if he
  chooses the Anthropic API, his words in F3, the key in prod's env file, the one line, and `make up ENV=prod`. The patches are in
  `docs/merge-requests/`, beside spec 010's note.

## The live runs, on either paid adapter (spec 010)

The Author's live runs take `ADAPTER=local`, `ADAPTER=bedrock`, or `ADAPTER=anthropic`: `make evals`,
`make redteam-live ENV=prod`, and `make contract-live ENV=prod REASON="…"`. Each refuses itself inside the agents'
sandbox, and a paid adapter runs on prod alone, through prod's admin routes with the operator token, attributed
`test` inside the ceilings and the adapter's cap, never failing over. A run naming a paid adapter prod's route doesn't
name gets 404 `unknown_adapter` for each case and spends nothing, so the Anthropic runs follow the switch. Each run's
history is `<UTC>-<adapter>.json`, naming the adapter and its provider.

Readiness evidence (`evals/twin_readiness.py`, spec 010's FR-026 and FR-027): a ready topic needs a product run and a
red-team run on prod's local model and on the paid adapter prod's route names, each complete: every Golden Q&A case of
the topic on both paths and every gap case, and every live red-team case. A run filtered short, or holding none of a
topic's cases, reads "evidence missing", naming the topic, the path, and how many cases are missing. The report
informs and fails nothing.

## The twin's turn route (spec 007)

`POST /room/turn` answers one turn of a visitor's conversation in the room
([plan](../../specs/007-twin-conversation/plan.md), §2; [ADR 0040](../../docs/adr/0040-the-twins-conversation-core.md);
gateway-http.md §10). The edge serves it as `/api/room/turn`. Each turn passes, in order:

1. the client's identity and the turn's own per-client cap (429 `client_cap_exceeded`);
2. validation: JSON only (415), and the body's feature, path, and turns within `limits.twin` (400 naming the field);
3. the twin's files: a missing or invalid pack, prompt, or fixed lines, or prod without `limits.twin`, answers 503
   `twin_unavailable` (plan.md D6);
4. readiness: a topic, or free talk, the Author hasn't marked ready at the running hashes answers 409 `not_ready`;
5. one gateway completion, which reads the kill-switch state first (unknown state is degraded: 503 with the cause)
   and carries the provider, model, tokens, and cost, purpose `twin`, with the piece and its topic on the ledger row;
6. the guards, then the 200: `{text, feature, cost_micro_usd, route}`.

The twin's files, all committed and read once at start:

- [`config/twin/corpus.json`](../../config/twin/corpus.json): the grounding pack, built from the corpus by
  `npm run twin:pack -w apps/web`, hashed per topic and whole; `make test` fails while it's stale.
- [`config/twin/prompt.md`](../../config/twin/prompt.md) and [`config/twin/lines.yaml`](../../config/twin/lines.yaml):
  the instructions, with one depth section per path, and the fixed line a withheld answer shows.
- `config/twin-readiness.yaml`: the Author's alone (a human-only path; patch P-1 creates it with its deny). Each
  ready entry binds the pack's and the prompt's hashes its live runs passed at; without the file nothing is ready.

A turn's grounding (`src/twin/grounding.ts`) is the corpus's rules, `00-profile.md`, a selected piece's topic files
with its lead, and, for free talk or a piece's follow-up while free talk is ready, the sections a BM25 ranking scores
for the newest visitor turn, all within the input bound, the same on either path (D14). The conversation enters the
prompt as quoted data, never as instructions or as the model's own turns (`src/twin/prompt.ts`).

The guards (`src/twin/guards.ts`) run on every answer, in code, with no model judging another: a `length` finish
trimmed to its last sentence, then secret-shaped text, the instructions or their canary, a claim to be human or the
Author, a number or an amount the grounding doesn't hold (in words too), and any amount in the answer to a turn that
asks what a turn, the visit, the site, or the room's sign costs, a link the grounding doesn't hold, an ownership verb
the rulings don't give, a sentence naming Seva that isn't the turn's sections' own, word for word, a place word in the
answer to a turn that asks where the Author or the room is, a surname given or confirmed, and the privacy promise or
the agents' share without the corpus's own words. The guards that port a red-team detector read the answer folded, as
the detectors do (NFKC, no format character, curly quotes and dashes as straight ones); the gateway's own read it
plain, dashes and the ellipsis as written. An answer that fails one is replaced whole by the fixed line, its cost still
counted. In a turn that asks the twin to confirm a claim, an answer that passes them all loses its opening agreement
("Yes, ..."), and what's left meets them again before it's delivered.

`POST /admin/twin/turn` (operator-admin.md §8) runs the same pipeline on one named adapter, never failing over and
never checking readiness, for the Author's live product and red-team runs (`make evals ADAPTER=…`,
`make redteam-live ADAPTER=…`); each call writes an audit row with a reason.

## Alerts (spec 011)

Every alert has three forms, rendered from the same typed facts ([contracts/alerts.md
§3.1](../../specs/000-local-foundations/contracts/alerts.md#31-three-forms-from-the-same-facts-spec-011-amendment-0-1);
ADR 0042):

- **The plain text** (`src/alerts/format.ts`), unchanged since spec 000: rendered with its cause, in the cause's
  transaction, and stored in the outbox row with its facts, version 2 (`src/alerts/facts.ts`). It is the email's text
  part, and each channel's fallback.
- **Telegram's designed message** (`src/alerts/telegram-design.ts`): short labelled lines, the severity's and the
  kind's emoji (`src/alerts/marks.ts`), message entities with UTF-16 offsets, and never `parse_mode`.
- **The email's HTML part** (`src/alerts/email-design.ts`): hand-written tables that load nothing, light and dark,
  each meter a bar, under a subject that leads with the two emoji.

The designed forms render at each delivery attempt, in the dispatcher, from the row's facts; `src/alerts/forms.ts`
chooses each channel's form, and a refusal, a failed render, a form past its bound, or a row from before the facts'
version 2 sends the plain form at once, in the same attempt, counted on `h4.alert.fallbacks` and shown on the
dashboard's "Alerts sent as plain text by fallback" (the runbook: `docs/runbooks/alert-channel-down.md`, "Alerts
arrive as plain text"). `config/alerts.yaml`'s optional `formats` keeps a channel plain, the Author's switch.

- **The catalogue** (`src/alerts/catalogue.ts`): 19 entries, one for each kind and variant, spec 010's included, with
  fixed facts. **The golden files**, `test/fixtures/alerts/<case>/` (`plain.txt`, `telegram.txt`, `subject.txt`,
  `email.html`), pin every entry's forms and the further cases; `test/unit/alert-goldens.test.ts` writes them, only
  with vitest's `-u` in the change that alters a design. Each `email.html` opens offline in a browser.
- **Samples**: `make operator-alert-samples ENV=<stack> REASON="…" [KIND=<kind>]` sends a marked sample of each entry
  wherever the stack's alerts go, through `POST /admin/alert-samples`: one audit row, the samples in the dispatcher's
  memory, never the outbox, after any real alert, one a second on each channel; agents run it on dev-cpu only.
- **Telemetry**: each attempt is an `alert.deliver` span, a root of its own, which Langfuse shows as a trace with no
  generation; `h4.alerts` carries `h4.alert.form`, and samples count under the kind `sample` alone.

## Commands

| What | Command |
|---|---|
| Tests | `npm test -w services/gateway` (and `make test`) |
| Typecheck and lint | `make lint` |
| The image | `make gateway-image` (built in CI and promoted unchanged) |
