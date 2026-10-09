# Contract: the gateway's HTTP API (`POST /hello`, `GET /health/live`, `GET /health`)

This contract covers the api listener of `services/gateway`: the hello endpoint (FR-038), the routing decision it exposes (FR-022), the per-client cap (FR-025), the two health endpoints, and the body edge serves when the gateway can't answer. The admin listener is in [operator-admin.md](operator-admin.md). The state behind every answer is in [data-model.md](../data-model.md), and the span, metric, and log names are in [telemetry.md](telemetry.md). [plan.md §5.1](../plan.md#51-layout-and-request-flow) summarizes the flow.

## 1. Listener, reachability, and common rules

- **Where it listens.** The gateway listens on port 8080 in its container. Edge publishes it as the stack's x000 port on `127.0.0.1` only: 18000 for prod, 18100 for dev, and 18300 for dev-cpu (published by the agents' engine on the host's `127.0.0.1`, which the Author's terminal can reach and the sandbox can't; [plan.md §1](../plan.md#1-topology)). Containers on the stack's `internal` network, such as the breach probe, call `http://gateway:8080` directly.
- **Headers on every response:**
  - `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`.
  - `X-Request-Id`. Edge sets `X-Request-Id` to its `$request_id`, overwriting any client value. The gateway adopts it when it is 32 lowercase hex characters, and otherwise generates one. The same ID is in the body as `request_id`.
  - No CORS headers. Spec 000 has no browser clients; spec 001's relay sits in front.
- **Trace context.** Edge clears `traceparent`, `tracestate`, and `baggage` on the api port, x000, so a client can neither switch off sampling for its own call (the sampler is parent-based, [telemetry.md §3.1](telemetry.md#31-sdk-setup)) nor choose the trace ID the ledger and the body record. The gateway starts every hello trace itself.
- **Body size.** Edge caps request bodies at 16 KB and answers 413 `{"error":"body_too_large","limit_bytes":16384}`. The gateway's own body limit is also 16 KB.
- **Unknown routes and methods** get 404 `{"error":"not_found","request_id":"…"}`.
- **Unexpected failures** get 500 `{"error":"internal_error","request_id":"…"}`, and the log names the error's class (`request.failed`), never its message. A body that isn't JSON gets 415, malformed JSON 400 `invalid_request`, and one over the gateway's own limit 413 `body_too_large`; each body carries the `request_id`.
- **Health probes** (`/health/live`, `/health`) produce no spans ([plan.md §5.7](../plan.md#57-telemetry)).

## 2. `POST /hello`

hello is a test endpoint, not the twin (Principle VIII). It sends one fixed system prompt and one short message through the gateway, so routing, metering, and tracing can be proven on something trivial (User Stories 1, 2, and 5).

### 2.1 Request

| Part | Rule |
|---|---|
| Method and path | `POST /hello` |
| `Content-Type` | `application/json`. Anything else gets 415 `{"error":"unsupported_media_type"}`. |
| `X-H4-Client` (optional) | a client label matching `^[a-z0-9-]{1,32}$`. Any other value gets 400 (`field: "X-H4-Client"`). See §2.3. |
| Body | a JSON object with at most one field, `message`. Unknown fields get 400. |
| `message` (optional) | a string of 1 to 500 Unicode code points after trimming whitespace. When absent, it defaults to `Hello.` |

The client sets nothing else. The gateway builds the call:
- **messages:** `[{role: "system", content: <the fixed prompt>}, {role: "user", content: <message>}]`;
- **output cap:** `maxOutputTokens` = `limits.per_call.hello_max_output_tokens` from `config/budgets.yaml` (128);
- **purpose:** `hello`, with no temperature override.

### 2.2 The fixed system prompt

The prompt is a constant in `src/routes/hello.ts`, normative as written here:

```text
You are the hello endpoint of the h4reet.ai stack, a test of its model gateway. You are not the Author and not the Author's AI twin, and you know nothing about the Author. Reply to the message in at most two short sentences.
```

- **Its role.** It names the endpoint as the stack's hello test, so no answer can present itself as the Author or the twin (Principle VIII). It also keeps every answer short, so a hello call's output stays well under the 128-token cap.
- **Every adapter gets the same prompt,** so local and fallback answers are comparable (US5-4).
- **It is a payload.** Like the message and the answer, it leaves the process only on a dev span that opts into payload sampling, after redaction (FR-029; [research.md R-30](../research.md#r-30-payload-sampling-is-dev-only-the-author)).

### 2.3 Client identity and the per-client cap (FR-025)

- **The client** is the pair (source address, label):
  - **The source address** is the value edge puts in `X-Forwarded-For`. Edge drops whatever the client sent and sets exactly its own `$remote_addr`, so the header always has one value. An in-network caller without the header is identified by its TCP peer address.
  - **The label** is the `X-H4-Client` value, or none.
- **The cap**, from `config/budgets.yaml` `limits.per_client`, is counted in memory per client:
  - a token bucket of capacity `burst` (5), refilled at `requests_per_minute` (20 a minute, one token every 3 s);
  - a count of at most `requests_per_day` (500) per UTC day of the gateway clock;
  - at most `metered_in_flight` (1) metered call in flight. This is checked only when the request reaches the metered path (§2.4 step 5.5).
- **Over the cap,** the answer is 429 `client_cap_exceeded` (§2.5.3). It is a refusal, not a degraded state, so it carries no `X-H4-Degraded-Cause`.
- **Every hello request counts,** including one that ends in a 400 or a 503. The cap runs before validation, as plan.md orders it.
- **Bounds on the cap's memory:** at most 10,000 tracked clients, evicting the least recently seen; idle entries dropped after one UTC day; everything lost on restart. That's acceptable because the cap isn't the cost bound.
- **The real bounds.** The label can be spoofed, and in spec 000 every client on the host reaches edge from the same address. The global metered limits (4 calls in flight, 60 a minute) and the meter are therefore what bound spend. Spec 001's relay will set a verified identity.
- **Where the identity never goes.** No metric attribute, span, alert, or incident draft carries the client's address or label (FR-032). Only the ledger keeps the label ([data-model.md §2.5](../data-model.md#25-ledger-the-model-call-record-fr-023)).

### 2.4 Processing order

Each step either passes or answers.

1. **Client identity.** An invalid `X-H4-Client` gets 400.
2. **Per-client cap.** Over it gets 429 `client_cap_exceeded` with `limit` `per_minute` or `per_day`.
3. **Validation.** The wrong content type gets 415; an invalid body gets 400.
4. **The state** (`stack_state`, read with no cache, [data-model.md §7.1](../data-model.md#71-request-start)):
   - a read error or timeout gets 503 `store_unreachable`;
   - no row gets 503 `store_uninitialized`;
   - `degraded` gets 503 `kill_switch_tripped`.
5. **`Gateway.complete`**, in FR-022's order:
   1. **If the local adapter is healthy,** call it within its own timeouts.
      - A result gets 200 with `route: "local"`. The local ledger row is written, free and without a reservation.
      - An error of kind `unavailable` or `timeout` marks local unhealthy at once. Processing continues at 5.3 with `route_reason: "local_failed"`.
      - Any other error kind gets 502 `local_error` (§2.5.5), with no failover.
   2. **If local was unhealthy** before the call, the route reason is `local_unhealthy`.
   3. **No fallback.** A stack with no fallback adapter gets 503 `no_fallback_in_stack`. That covers a route without one, and dev's synthetic fallback when `GATEWAY_TEST_SYNTHETIC_SPEND` isn't `1`.
   4. **Fallback health.** If the fallback adapter's cached health is unhealthy or its circuit is open, the call is refused inside admission (5.6) with `fallback_unavailable`, unless an earlier cause applies.
   5. **Metered limits, in memory:**
      - this client already has a metered call in flight: 429 `client_cap_exceeded` with `limit: "metered_in_flight"`;
      - 4 metered calls are in flight across all clients, or 60 were admitted in the last minute: 429 `metered_capacity_exceeded`.
   6. **Admission,** one transaction ([data-model.md §7.2](../data-model.md#72-admission-for-a-metered-call)). Refusals get 503 with, in this precedence: `kill_switch_tripped`, `meter_at_ceiling`, `fallback_awaiting_renewal`, `fallback_spent_today`, `fallback_unavailable`.
   7. **The journal.** The `reserve` record is appended and fsync'd. A failure gets 503 `journal_unwritable`, after the reservation is withdrawn.
   8. **The fallback call,** within the request's remaining deadline. Then the commit ([data-model.md §7.3](../data-model.md#73-commit-of-a-metered-call)):
      - a result gets 200 with `route: "fallback"`;
      - an error is committed at its cost basis (a timeout at the reserved maximum, other errors at 0) and gets 503 `fallback_unavailable`.

**Notes on the order:**
- **The deadline.** The whole request runs within `deadline_ms` (20,000) from `config/routing.yaml`, counted from arrival. The local call can use at most its 10 s, so the fallback always starts with time for one call.
- **In-flight requests.** A request that has read the state completes on what it read, even if the state flips meanwhile (the spec's edge case).
- **A commit that fails** after a successful fallback call still returns 200 with the answer. The gateway keeps retrying the commit ([data-model.md §7.3](../data-model.md#73-commit-of-a-metered-call)), and the next request fails closed on `store_unreachable`.

### 2.5 Responses

#### 2.5.1 200: answered

```json
{
  "answer": "Hello! This is the h4reet.ai stack's hello test answering.",
  "route": "local",
  "route_reason": null,
  "provider": "local",
  "model": "<the stack's MODEL_ALIAS>",
  "usage": { "input_tokens": 71, "output_tokens": 14 },
  "cost_usd": 0,
  "cost_micro_usd": 0,
  "price_version": "2026-10-08.1",
  "latency_ms": 212,
  "stack": "prod",
  "request_id": "9c1e5b0a3f2d4e6b8a7c1d2e3f4a5b6c",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

| Field | Type | Meaning |
|---|---|---|
| `answer` | string | the model's text. It returns to the caller; it isn't telemetry. |
| `route` | `"local"` or `"fallback"` | the FR-022 decision that answered |
| `route_reason` | null, `"local_unhealthy"`, or `"local_failed"` | why a fallback answered |
| `provider` | string | `gen_ai.provider.name`: `local`, `aws.bedrock`, or `synthetic` |
| `model` | string | the response model |
| `usage` | object | `input_tokens` and `output_tokens`, non-negative integers |
| `cost_micro_usd` | integer | the authoritative cost from the active price version (FR-023): 0 for local |
| `cost_usd` | number | the same cost in USD, for display |
| `price_version` | string | the price version used |
| `latency_ms` | integer | the whole request, as the gateway measured it |
| `stack`, `request_id`, `trace_id` | string | `trace_id` is 32 lowercase hex characters and opens the trace in Langfuse |

In dev, a synthetic fallback answers `"answer": "synthetic response"` with `provider: "synthetic"`, `model: "metered-test"`, and `cost_micro_usd: 100000` ([provider-adapter.md §3.3](provider-adapter.md#33-synthetic-type-synthetic-dev-only)).

#### 2.5.2 503: degraded

The status is 503, and the header `X-H4-Degraded-Cause: <cause>` carries the same value as the body's `cause`.

```json
{
  "state": "degraded",
  "cause": "fallback_awaiting_renewal",
  "detail": "The local model is unavailable, and the fallback sub-budget ran out. It stays refused until the operator renews it.",
  "ceilings": null,
  "stack": "prod",
  "since": "2026-10-28T14:02:11Z",
  "request_id": "0d4f6e8a2b1c3d5e7f9a0b1c2d3e4f5a",
  "trace_id": "5a2c9e1b7d3f4a6c8e0b2d4f6a8c0e1b"
}
```

| Field | Type | Meaning |
|---|---|---|
| `state` | `"degraded"` | always |
| `cause` | string | one of the causes in §3 |
| `detail` | string | the fixed text for the cause in §3. It never carries a payload, a client identifier, or a secret. |
| `ceilings` | null, or an array of `"day"` and `"month"` | which ceilings, for `kill_switch_tripped` (from `crossed`) and `meter_at_ceiling` (the meters at or above their ceiling) |
| `stack` | string, or null | `H4_STACK`. Null in edge's `api_unavailable` body. |
| `since` | RFC 3339 string, or null | when the condition began, where the gateway knows it (§3) |
| `request_id` | string | |
| `trace_id` | string, or null | null in edge's body |

Every degraded response records its cause three ways (FR-022, FR-038):
- the attribute `h4.degraded.cause` on the request's spans;
- the counter `h4.degraded.responses`, with `h4.cause`;
- a log record.

There is no `Retry-After`: most causes last until a human acts.

#### 2.5.3 429: refused by a limit

```json
{ "error": "client_cap_exceeded", "limit": "per_minute", "retry_after_s": 3, "request_id": "…" }
```

| `error` | `limit` | Meaning | `retry_after_s` |
|---|---|---|---|
| `client_cap_exceeded` | `per_minute` | the client's bucket is empty | until its next token |
| `client_cap_exceeded` | `per_day` | the client used its 500 for this UTC day | until 00:00 UTC |
| `client_cap_exceeded` | `metered_in_flight` | the client already has a metered call in flight | 1 |
| `metered_capacity_exceeded` | `global_in_flight` | 4 metered calls are in flight across all clients | 1 |
| `metered_capacity_exceeded` | `global_per_minute` | 60 metered calls were admitted in the last minute | until the oldest leaves the window |

The response also carries the header `Retry-After: <retry_after_s>`. These are refusals, not degraded states: no `X-H4-Degraded-Cause`, and no count in `h4.degraded.responses`. They are counted in `h4.gateway.requests` with the outcome [telemetry.md](telemetry.md) defines for refusals.

#### 2.5.4 400 and 415: invalid requests

```json
{ "error": "invalid_request", "field": "message", "detail": "at most 500 characters", "request_id": "…" }
```

`field` names the body field or the header (`X-H4-Client`). The `detail` never echoes the submitted value.

#### 2.5.5 502: the local model returned an error

```json
{ "error": "local_error", "kind": "provider_error", "request_id": "…", "trace_id": "…" }
```

This answer covers a local error that isn't about availability: `provider_error`, `bad_request`, `auth`, `rate_limited`, or `content_filtered` ([provider-adapter.md §2.5](provider-adapter.md#25-provider-errors)). The gateway doesn't fail over on it: retrying a request the local model rejected would spend money for nothing, and FR-022 fails over on an unhealthy adapter, not a rejected request. Local stays healthy. The 502 counts in the dashboard's error rate, which counts 5xx answers that aren't degraded (FR-028).

## 3. Degraded causes

| Cause | Meaning | FR-022 condition it reports | `since` | `detail` (fixed text) |
|---|---|---|---|---|
| `store_unreachable` | the store didn't answer: an error, a 250 ms statement timeout, or a 500 ms connect timeout | the kill switch is unknown: fail closed (FR-031, US2-7) | when the current outage began | The kill-switch store can't be read, so the stack fails closed. |
| `store_uninitialized` | the store answered, but has no `stack_state` row: a new host, or its data was removed | the kill switch is unknown until the operator initializes it (FR-031) | null | The kill-switch store is empty. The operator must initialize it: make operator-init. |
| `kill_switch_tripped` | `state` is `degraded`: a ceiling was reached and no reset has followed. Local answers are refused too. | the kill switch is `degraded` (FR-033) | `stack_state.since` | The kill switch set degraded when a spending ceiling was reached. Only an operator reset restores service. |
| `no_fallback_in_stack` | local is unhealthy or failed, and this stack has no fallback adapter | local is unhealthy, and the stack doesn't have Bedrock (FR-031: only prod spends) | when local became unhealthy | The local model is unavailable, and this stack has no fallback. |
| `meter_at_ceiling` | local is unhealthy, and a day or month meter is at or above its ceiling, counting reservations; typically after a reset | "while no meter is at or above its ceiling" fails (FR-034, US5-3) | the meter's `reached_at` | The local model is unavailable, and metered calls are refused while a meter is at or above its ceiling. |
| `fallback_awaiting_renewal` | local is unhealthy, and the sub-budget ran out and awaits the operator's renewal | "the fallback sub-budget hasn't run out" fails (FR-030, US5-6) | `stack_state.fallback_awaiting_since` | The local model is unavailable, and the fallback sub-budget ran out. It stays refused until the operator renews it. |
| `fallback_spent_today` | local is unhealthy, and calls in flight hold the rest of today's allowance before any commit has reached it | the same condition, counting reservations (ADR 0001) | null | The local model is unavailable, and calls in flight hold the rest of today's fallback sub-budget. |
| `fallback_unavailable` | local is unhealthy, and the fallback adapter can't serve: credentials missing or expired, the circuit open, or the call itself failed | the otherwise branch: there is no healthy route | when the fallback became unhealthy; null when the call failed | The local model is unavailable, and so is the fallback. |
| `journal_unwritable` | local is unhealthy, and the metered call's `reserve` record couldn't be fsync'd | the otherwise branch: a metered call must leave a durable record (FR-031) | when the current run of failed appends began | The local model is unavailable, and metered calls are refused because the call journal can't be written. |
| `api_unavailable` | edge couldn't reach the gateway: connection refused, a DNS failure, or a timeout. Edge sends it, never the gateway. | outside FR-022's decision: the gateway itself is down | null | The gateway is not answering. The stack edge proxy answered instead. |

Every cause except `api_unavailable` also feeds the one-hot gauge `h4.degraded.cause`, which shows the cause a hello would get now on the "why degraded" panel (FR-028). The runbooks for each cause are listed in [alerts.md §6](alerts.md#6-runbooks).

## 4. `GET /health/live`

| Aspect | Contract |
|---|---|
| Answer | 200 `{"status":"live"}` while the process's event loop answers |
| Reads | nothing: no store, no adapter |
| Used by | the compose health check, a `node -e` probe of `http://127.0.0.1:8080/health/live` inside the container ([plan.md §2](../plan.md#2-compose-services-and-pinned-images)) |
| Telemetry | none: no span |

The process is live even while the stack is degraded. Liveness never depends on the model server or the store, so neither can trap the gateway in a restart loop.

## 5. `GET /health`

200 with a JSON report, whatever the state: it reports, it doesn't gate. It reads `stack_state` live (with the store's timeouts) and uses the adapters' cached health, so it never calls a provider.

```json
{
  "status": "degraded",
  "stack": "dev",
  "env": "dev",
  "version": "0.1.0",
  "time": "2026-10-27T09:12:04.512Z",
  "real_time": "2026-10-08T16:31:40.019Z",
  "store": "ok",
  "state": "normal",
  "since": "2026-10-08T16:20:02Z",
  "crossed": [],
  "degraded_cause": "fallback_awaiting_renewal",
  "fallback": { "adapter": "synthetic", "awaiting_renewal": true, "awaiting_since": "2026-10-27T08:40:00Z" },
  "adapters": [
    { "id": "local", "role": "primary", "provider": "local", "kind": "local", "model": "<the stack's MODEL_ALIAS>",
      "healthy": false, "reason": "unreachable", "checked_at": "2026-10-27T09:12:04Z" },
    { "id": "synthetic", "role": "fallback", "provider": "synthetic", "kind": "synthetic", "model": "metered-test",
      "healthy": true, "reason": null, "checked_at": "2026-10-27T09:12:00Z" }
  ],
  "journal": "ok",
  "config": { "routing_sha": "<64 hex>", "price_version": "2026-10-08.1" },
  "test_machinery": { "clock": true, "synthetic": true, "clock_offset_ms": 1528824493 }
}
```

| Field | Type | Meaning |
|---|---|---|
| `status` | `"ok"` or `"degraded"` | `ok` when a hello would be answered now |
| `stack`, `env` | string | `H4_STACK` and `H4_ENV`. The breach test refuses unless `env` is `dev` and both test switches are on ([plan.md §8](../plan.md#8-the-breach-test)). |
| `version` | string | the gateway package's version |
| `time` | string | the gateway clock (the test clock in dev); `real_time` is the process's real UTC time |
| `store` | `"ok"`, `"unreachable"`, or `"uninitialized"` | `status.py` prints the one-time `make operator-init ENV=<stack> REASON=…` command when this is `uninitialized` ([plan.md §4](../plan.md#4-environment-files-preflight-and-the-stack-targets)) |
| `state`, `since`, `crossed` | from `stack_state` | null unless `store` is `ok` |
| `degraded_cause` | string, or null | the cause a hello would get now. It comes from a dry run of §2.4 step 4 onward, with no reservation and no provider call. |
| `fallback` | object | the fallback adapter's ID (or null), and the renewal flag and its time (null unless `store` is `ok`) |
| `adapters` | array | each routed adapter: `id`, `role` (`primary` or `fallback`), `provider`, `kind`, `model`, `healthy`, `reason` (a `HealthStatus` reason, [provider-adapter.md §2.4](provider-adapter.md#24-health)), and `checked_at`. A paid adapter adds `credentials_expire_at`: the SSO session's end, not a secret. |
| `journal` | `"ok"`, `"unwritable"`, or `"unknown"` | the result of the last append; `unknown` before the first one |
| `config` | object | `routing_sha` (SHA-256 of `config/routing.yaml`) and the active `price_version` |
| `test_machinery` | object | whether `GATEWAY_TEST_CLOCK` and `GATEWAY_TEST_SYNTHETIC_SPEND` are on, and the clock offset. In prod these are always `false`, `false`, null. |

`/health` shows no meter amounts. The authenticated `GET /admin/status` adds them ([operator-admin.md §4](operator-admin.md#4-reads)).

## 6. Edge's body when the gateway can't answer (`api_unavailable`)

Edge, nginx in `deploy/edge/nginx.conf`, serves this body itself, at once, when its upstream `gateway:8080` refuses the connection, fails DNS resolution, or times out ([plan.md §19](../plan.md#19-degraded-modes)).

```json
{"state":"degraded","cause":"api_unavailable","detail":"The gateway is not answering. The stack edge proxy answered instead.","ceilings":null,"stack":null,"since":null,"request_id":"<nginx $request_id>","trace_id":null}
```

- **Status and headers:** 503, with `X-H4-Degraded-Cause: api_unavailable`, `Content-Type: application/json`, and `Cache-Control: no-store`.
- **The mechanism:** `error_page 502 504 = @api_unavailable` applies to errors nginx generates itself. `proxy_intercept_errors` stays off, so the gateway's own 502 `local_error` and 503 degraded answers pass through unchanged.
- **The shape** matches §2.5.2. The fields edge can't know are null. Its `request_id` is the same one edge forwards to the gateway, so edge's access log and the gateway's logs correlate.
- **Edge's timeouts on x000:** 2 s to connect and 30 s to read. The read timeout is longer than the gateway's 20 s request deadline, so edge never cuts a request the gateway would still answer.
- **No payloads in edge's logs.** Its access log records only method, path, status, and duration ([plan.md §2](../plan.md#2-compose-services-and-pinned-images)).

## 7. Timeouts and limits

| Limit | Value | Source | On breach |
|---|---|---|---|
| Request body on x000 | 16 KB | `deploy/edge/nginx.conf`; the gateway's body limit | 413 |
| `message` | 500 code points | the hello route (a constant) | 400 |
| Per client: rate | 20 a minute, burst 5 | `config/budgets.yaml` `limits.per_client` | 429 `client_cap_exceeded` |
| Per client: day | 500 per UTC day | `config/budgets.yaml` `limits.per_client` | 429 `client_cap_exceeded` |
| Per client: metered calls in flight | 1 | `config/budgets.yaml` `limits.per_client` | 429 `client_cap_exceeded` |
| Global: metered calls in flight | 4 | `config/budgets.yaml` `limits.global` | 429 `metered_capacity_exceeded` |
| Global: metered calls a minute | 60 | `config/budgets.yaml` `limits.global` | 429 `metered_capacity_exceeded` |
| Input cap per call, all messages | 2,000 characters; also the reservation's input bound | `config/budgets.yaml` `limits.per_call.max_input_chars` | hello stays far below it |
| Output cap for hello | 128 tokens | `config/budgets.yaml` `limits.per_call.hello_max_output_tokens` | the model stops: `finish_reason` `length` |
| Output cap for any call | 512 tokens | `config/budgets.yaml` `limits.per_call.max_output_tokens` | admin calls get 400 |
| Reservation lifetime | 120 s | `config/budgets.yaml` `timing.reservation_ttl_s` | expired reservations are swept ([data-model.md §2.4](../data-model.md#24-reservations-metered-calls-in-flight)) |
| Request deadline | 20 s from arrival | `config/routing.yaml` `deadline_ms` | the fallback call is cut, and a throttling retry is skipped |
| Local model | connect 1 s, request 10 s, no retry | `config/routing.yaml` `adapters.local.timeouts` | failover (§2.4 step 5.1) |
| Local health | every 1 s, 800 ms timeout; unhealthy after 1 failure, healthy after 3 passes | `config/routing.yaml` `adapters.local.health` | failover within 1.8 s at worst (SC-005) |
| Bedrock | connect 1 s, request 4 s; one retry, on throttling only, while the deadline allows | `config/routing.yaml` `adapters.bedrock` | `fallback_unavailable` |
| Bedrock circuit | opens after 3 failures, for 30 s | `config/routing.yaml` `adapters.bedrock.circuit` | `fallback_unavailable` |
| Store | 250 ms per statement and per lock wait, 500 ms to connect | the gateway's pool (code) | `store_unreachable` |
| Edge to gateway | 2 s connect, 30 s read | `deploy/edge/nginx.conf` | 503 `api_unavailable` |

## 8. Examples

From the Author's terminal, against prod (x000 = 18000):

```console
$ curl -sS -X POST http://127.0.0.1:18000/hello \
    -H 'Content-Type: application/json' -H 'X-H4-Client: author-laptop' \
    -d '{"message":"Say hello."}'
{"answer":"Hello! This is the h4reet.ai stack's hello test answering.","route":"local", … ,"cost_micro_usd":0, … }

$ docker compose -p h4reet-prod -f deploy/compose.yaml --env-file ~/.config/h4reet-ai/env/prod.env stop model-server-gpu
$ curl -sS -i -X POST http://127.0.0.1:18000/hello -H 'Content-Type: application/json' -d '{}'
HTTP/1.1 200 OK
…
{"answer":"…","route":"fallback","route_reason":"local_failed","provider":"aws.bedrock","model":"<inference-profile ID the Author confirms>", … }

$ curl -sS http://127.0.0.1:18000/health
{"status":"ok","stack":"prod","env":"prod", … ,"store":"ok","state":"normal", … }
```

[quickstart.md](../quickstart.md) has the validation runs that use these endpoints, story by story.
