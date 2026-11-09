# services/gateway: the model gateway

Every model call the stack makes goes through this service: one provider-agnostic gateway, with the routing, the
kill switch, and the cost meter in front of each provider (spec 000, `specs/000-local-foundations/`). Its HTTP
contract is [gateway-http.md](../../specs/000-local-foundations/contracts/gateway-http.md), its admin listener's is
[operator-admin.md](../../specs/000-local-foundations/contracts/operator-admin.md), and its routing is configuration,
`config/routing.yaml`: local first, the Bedrock fallback within its sub-budget, then degraded.

## The layout

- `src/core/`: the gateway itself (`gateway.ts`: the state read, the kill switch, local, then the metered fallback,
  in FR-022's order), the router, the clock, and the per-client limits.
- `src/adapters/`: one adapter per provider (the local OpenAI-compatible model server, Bedrock's Converse, and dev's
  synthetic fallback). No other file calls a provider.
- `src/meter/`: the store (PostgreSQL; PGlite in tests), admission, reservations, the ledger, and the journal.
- `src/routes/`: the public routes (`/hello`, `/room/events`, `/room/turn`) and the admin listener's.
- `src/twin/` and `src/config/twin.ts`: the twin's conversation core (spec 007, below).
- `src/telemetry/`: the spans and the instruments, with no payloads unless `TELEMETRY_PAYLOAD_SAMPLING` is on.
- `migrations/`: the store's schema, applied in order at start.
- `test/`: vitest, `unit/` and `integration/` (Fastify inject on PGlite, with stub providers; no test calls a real
  model or uses a credential).

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
Author, a number or an amount the grounding doesn't hold (in words too), a link it doesn't hold, an ownership verb the
rulings don't give, a sentence naming Seva, or holding a place word, that isn't the grounding's own, word for word, a
surname given or confirmed, and the privacy promise or the agents' share without the corpus's own words. An answer
that fails one is replaced whole by the fixed line, its cost still counted.

`POST /admin/twin/turn` (operator-admin.md §8) runs the same pipeline on one named adapter, never failing over and
never checking readiness, for the Author's live product and red-team runs (`make evals ADAPTER=…`,
`make redteam-live ADAPTER=…`); each call writes an audit row with a reason.

## Commands

| What | Command |
|---|---|
| Tests | `npm test -w services/gateway` (and `make test`) |
| Typecheck and lint | `make lint` |
| The image | `make gateway-image` (built in CI and promoted unchanged) |
