# Runbook: the Anthropic API is unavailable

Prod's paid fallback, the `anthropic` adapter, can't serve: its key is missing or refused, its circuit breaker opened after three failed calls, or a call failed. This page covers the `fallback_unavailable` alert for the Anthropic API, and the degraded cause `fallback_unavailable` while prod's route names it ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 010: FR-009, FR-011, FR-012, FR-037; spec 000's [contracts/provider-adapter.md §2.5](../../specs/000-local-foundations/contracts/provider-adapter.md#25-provider-errors), §3.4, and [§6](../../specs/000-local-foundations/contracts/provider-adapter.md#6-around-an-adapter-call-what-the-gateway-does). It applies only after you chose the Anthropic API as prod's fallback (`fallback: anthropic` in `config/routing.yaml`); while the route names Bedrock, the anthropic adapter isn't built, and `bedrock-unavailable.md` is the page.

## Symptoms

- **The alert**, on Telegram and by email: "FALLBACK UNAVAILABLE: the Anthropic API is unhealthy (credentials)", or "(circuit open)", id `prod:fallback_unavailable:anthropic:<YYYY-MM-DDTHHZ>`, at most one an hour, with the sentence "If the local model goes down, hello answers degraded with fallback_unavailable."
- **hello or a room turn, with the local model down,** answers 503 with `X-H4-Degraded-Cause: fallback_unavailable`: "The local model is unavailable, and so is the fallback." The room shows `cannot_talk.resting`.
- **`make operator-status ENV=prod`**: `anthropic unhealthy (credentials)` or `anthropic unhealthy (circuit_open)` on the adapters line.
- **The dashboard** (`http://localhost:18002/d/h4-runtime`): "Model-server health" shows `adapter anthropic` down.
- **The gateway's log:** an `adapter.health_changed` record for `anthropic` with `healthy` false and the reason, and a `call.completed` record for each failed call, with `"adapter":"anthropic"` and its `error_kind`. Never the key: the redactors mask its shape.
- **Only prod**: the other stacks route no paid adapter.

## Impact

- **While the local model is up:** none. Local answers first, and the Anthropic API serves only when local can't.
- **While the local model is down too:** hello and the room's turns answer 503 `fallback_unavailable`. A failed call costs nothing, except one that timed out or lost its connection after the request went out: it may have reached the model, so the meter charges its reserved maximum.
- **The circuit** opens for 30 s after 3 failures in a row; then one trial call is allowed. The health check, the model lookup `GET /v1/models/claude-haiku-5-5`, runs once a minute and spends no tokens.
- The meter, the kill switch, the sub-budget, and the adapter's monthly cap are unaffected; the cap has its own page, `fallback-renewal.md`.

## Act

In your own terminal.

1. **Find the reason:**

   ```bash
   make operator-status ENV=prod                  # anthropic unhealthy (credentials) or (circuit_open)
   make logs ENV=prod SERVICE=gateway TAIL=2000   # adapter.health_changed, and call.completed for anthropic
   ```

   Each failed call's `call.completed` names its `error_kind`, and its span's `error.type` the SDK's error class (`AuthenticationError`, `RateLimitError`, `InternalServerError`) or the transport's code, never the provider's text or the key.
2. **By the reason:**
   - **`credentials`** (401 or 403 from the model lookup, or `auth` calls): the key in `~/.config/h4reet-ai/env/prod.env`, `GATEWAY_ANTHROPIC_API_KEY`, is wrong, revoked, or missing. Check the key in Anthropic's console, with your own session; if you replace it, edit prod's env file in an editor, never on a command line, then `make up ENV=prod`, which restarts the gateway with it.
   - **The account can't pay** (its credits spent, or its billing refused): whatever status the API answers maps to a kind (spec 010, FR-009), and each fallback call fails. Check the account's billing and usage in Anthropic's console. The adapter's monthly cap is set to stop spend first.
   - **`circuit_open`:** three calls failed in a row; their `error_kind` says how: `rate_limited` (429; the gateway retries once, and the circuit lets a trial through every 30 s), `timeout` (no answer within 4 s, charged at its maximum), or `unavailable` (529 overloaded, 502, 503, or the connection). Check Anthropic's status page. Nothing in the stack needs changing, and the circuit closes once a trial call succeeds.
   - **`bad_request`** (400, 404, 413, 422) opens no circuit and sends no alert: usually the model, `adapters.anthropic.model` in `config/routing.yaml`, which must be one Anthropic serves.
3. **While you work,** bring the local model back if it's down (the runbook `model-server-down.md`): local answers again, whatever the Anthropic API's state.
4. **To go back to Bedrock,** for a long outage or a key that has to wait: put `fallback: bedrock` back in `envs.prod` in `config/routing.yaml`, commit, then `make up ENV=prod`. Bedrock's credentials need to be current (`bedrock-credentials-expiring.md`).

## Verify

- `make operator-status ENV=prod` shows `anthropic healthy`: within a minute after a key fix (the health check's cadence), and once an open circuit's 30 s are over.
- The dashboard's "Model-server health" shows `adapter anthropic` up.
- To prove a real call end to end, `make contract-live ENV=prod ADAPTER=anthropic REASON="…"` records ten small calls and replays them in the gate's container phase; it costs a few cents.

## Undo

- Put back what you changed: the route's fallback or the model's ID, commit, then `make up ENV=prod`.
- A key you replaced in Anthropic's console is undone there, with your own session; the old key stays revoked.

## Record

In the next merge-request note, or in an incident note in `docs/incidents/` when prod answered degraded because of it: when it started and ended, the health reason, the failed calls' `error_kind` and how many (from `make logs`, so redacted), what they cost (the dashboard's "Cost by provider and attribution"), and what you changed, by name, never a value. Never the key, the account's ID, or anything from Anthropic's console beyond its usage figures.
