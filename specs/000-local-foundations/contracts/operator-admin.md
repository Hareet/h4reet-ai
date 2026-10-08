# Contract: the operator interface (the admin listener and `scripts/operator.py`)

This contract covers how a human restores service and changes what the meter allows:
- reset (FR-034), renewal of the fallback sub-budget (FR-030), and store initialization (FR-031);
- the reads that show state, audit, and incidents;
- the dev-only test machinery (FR-036);
- live calls to a named adapter, for the contract test and Bedrock evals (FR-024, FR-031);
- the stdlib CLI and make targets the Author runs.

The state these endpoints change is in [data-model.md](../data-model.md), and the alerts they send are in [alerts.md](alerts.md). [plan.md §5.5](../plan.md#55-operator-interface) summarizes the interface.

## 1. The admin listener and authentication

- **Where it listens.** The gateway listens on port 8081 in its container. Edge publishes it as the stack's x003 port on `127.0.0.1` only: 18003 for prod, 18103 for dev, and 18303 for dev-cpu (published by the agents' engine on the host's `127.0.0.1`, which the Author's terminal can reach and the sandbox can't). In-network callers (the breach probe, the CLI's dev-cpu hop) use `http://gateway:8081`.
- **Edge's limits on x003:** bodies up to 4 KB (413 `{"error":"body_too_large","limit_bytes":4096}`), 2 s to connect, and 30 s to read. When the gateway can't answer, edge serves 503 `{"error":"admin_unavailable"}`. The gateway's own body limit on this listener is also 4 KB.
- **Common rules:** JSON in and out (`Content-Type: application/json`, else 415), `Cache-Control: no-store`, and `X-Request-Id` on every response, as in [gateway-http.md §1](gateway-http.md#1-listener-reachability-and-common-rules). An endpoint that needs the store answers 503 `{"error":"store_unreachable"}` when the store can't be read.

### 1.1 Authentication

Every endpoint, reads included, requires `Authorization: Bearer <token>`. The gateway checks in this order and stops at the first failure:

| Step | Check | Failure class |
|---|---|---|
| 1 | The header is present, with the `Bearer` scheme. | `missing` |
| 2 | The token matches `^h4op_(prod\|dev\|devcpu)_[A-Za-z0-9_-]{43}$`. | `malformed` |
| 3 | The prefix is this stack's: `h4op_prod_` on prod, `h4op_dev_` on dev, `h4op_devcpu_` on dev-cpu. This is checked before hashing, so a prod gateway never hashes a dev token. | `wrong_prefix` |
| 4 | SHA-256 over the token's UTF-8 bytes equals `OPERATOR_TOKEN_SHA256`, compared as 32-byte digests with `crypto.timingSafeEqual`. | `mismatch` |

- **Authentication comes first,** before validation, before the store, and before the dev-only checks. An unauthenticated caller learns nothing about the stack.
- **A failure** answers 401 `{"error":"unauthorized"}` with `WWW-Authenticate: Bearer realm="h4reet-admin"`. The body is the same for every class, so there is no oracle.
- **Auditing, without a write per failure.** Failures are counted in memory, by class, in fixed 10-minute windows of real time, and each increments `h4.operator.auth_failures` ([telemetry.md §4.1](telemetry.md#41-the-gateways-instruments)). The first failure of each class in a window writes one `audit_log` row: action `auth_failed`, actor `unknown`, `detail` `{"class": …, "route": …, "window_start": …}`, where `route` is the route template (`/admin/reset`), or `other` for a path the listener doesn't serve, never the raw path. So a flood of bad tokens costs at most four rows per window and no store round trip per request, and hello's state reads keep their pool. The token is never stored or logged, in any part. If the store is unreachable, the failure is only counted and logged.
- **Alerting.** When a window's in-memory count reaches 3, the gateway queues one `auth_failed` alert, deduplicated per 10-minute window ([alerts.md §2](alerts.md#2-kinds-triggers-and-dedupe-keys)).
- **The actor.** On success the actor is `operator:<stack>#<first 8 hex of the hash>`, as in `operator:prod#<8 hex>`. The credential itself is defined in [data-model.md §5](../data-model.md#5-the-operator-credential).

### 1.2 The reason rule

Every `POST` takes `reason`, the "why" of FR-034's audit:
- a string of at least 10 and at most 500 Unicode code points after trimming;
- with no control characters, newlines included.

Otherwise the answer is 400 `{"error":"invalid_request","field":"reason","detail":"at least 10 characters"}`. The reason goes into the audit row, which the dashboard's audit panel shows. It never goes into an alert ([alerts.md §5](alerts.md#5-what-never-appears)).

### 1.3 What each write produces

| Endpoint | Audit row (`action`) | Journal record | Alert |
|---|---|---|---|
| `POST /admin/reset` | `reset` | `operator` | `operator_action` |
| `POST /admin/renew` | `renew` | `operator` | `operator_action` |
| `POST /admin/init` | `init` | `operator` | `operator_action` |
| `POST /admin/test/clock` (dev) | `test_clock` | `clock` | none |
| `POST /admin/test/synthetic` (dev) | `test_synthetic` | each call's `reserve` and `commit` | none of its own; its crossings alert as usual |
| `POST /admin/adapters/{id}/complete` | `adapter_call` | for a paid adapter, the call's `reserve` and `commit` | none of its own; its crossings alert as usual |

- **Atomicity.** The audit row and the alert are written in the same transaction as the change ([data-model.md §7.5](../data-model.md#75-operator-transactions)). The journal record follows the commit. A failed append is reported as `"journal": "unwritable"` in the response and in the audit row, and doesn't undo the action.
- **Confirmation alerts.** Only the three operator writes send one, so an unexpected reset, renewal, or initialization gets noticed. The test and adapter endpoints are audited but not confirmed. Otherwise a breach run or a contract run would send dozens of confirmations.
- **Metrics.** Each accepted write increments `h4.operator.actions`, with `h4.action` set to its audit action ([telemetry.md](telemetry.md)).

## 2. Operator writes

### 2.1 `POST /admin/reset`

It restores `normal` after a trip (FR-034, US2-4).

Request: `{"reason": "Breach rehearsal done; restoring local answers."}`

200:

```json
{
  "action": "reset",
  "audit_id": 41,
  "state": "normal",
  "since": "2026-10-29T17:05:12Z",
  "meters_at_ceiling": ["day"],
  "note": "Local answers resume now. Metered calls stay refused while these meters are at or above their ceiling: day.",
  "journal": "ok"
}
```

| Status | `error` | When |
|---|---|---|
| 409 | `store_uninitialized` | there is no `stack_state` row: use `init` |
| 409 | `not_degraded` | the state is already `normal` |
| 400, 401, 503 | as in §1 | |

What a reset leaves alone:
- the meters: admission checks levels, so `meter_at_ceiling` holds until the tripped meter rolls over;
- the renewal flag: a reset is not a renewal (ADR 0001);
- `crossed` history: the audit row's `before` keeps it.

### 2.2 `POST /admin/renew`

It approves a fresh $2 of fallback (FR-030; binding decision 13; [data-model.md §6.2](../data-model.md#62-the-fallback-sub-budget-fallback_awaiting_renewal-and-todays-fallback_day-row)).

Request: `{"reason": "Model server down for a driver update; renewing fallback."}`

200:

```json
{
  "action": "renew",
  "audit_id": 42,
  "fallback": {
    "day": "2026-10-28",
    "grant": 2,
    "allowance_micro_usd": 4000000,
    "spent_micro_usd": 2000000,
    "reserved_micro_usd": 0,
    "available_micro_usd": 2000000
  },
  "day_ceiling_room_micro_usd": 1000000,
  "note": "Fallback passes again now: $2.00 more is available today, within the daily ceiling ($1.00 of room left).",
  "journal": "ok"
}
```

- **The new allowance** is today's fallback spend plus reservations plus 2,000,000, so `available_micro_usd` is exactly 2,000,000 at that moment.
- **The daily ceiling still binds.** `day_ceiling_room_micro_usd` is what remains under it; whichever of the two is smaller limits fallback.
- **The audit row and the journal record** carry the new allowance and grant number.

| Status | `error` | When |
|---|---|---|
| 409 | `not_awaiting_renewal` | the flag isn't set. The body adds `"detail": "The fallback sub-budget isn't awaiting renewal; there is nothing to renew."` and today's `fallback` object. `init` with `renew` is the only other way to clear the flag. |
| 409 | `store_uninitialized` | no `stack_state` row |
| 400, 401, 503 | as in §1 | |

On a degraded stack, a renewal is allowed: it clears the flag, and fallback stays refused with `kill_switch_tripped` until a reset.

### 2.3 `POST /admin/init`

It initializes an empty store (FR-031). The procedure is [data-model.md §8](../data-model.md#8-initialization-fr-031).

Request:

```json
{
  "reason": "New host; the journal survived on the bind mount.",
  "stated": { "day_usd": "1.20", "month_usd": "9.40", "fallback_today_usd": "0.30" },
  "confirm_zero": false,
  "renew": false
}
```

| Field | Type | Rule |
|---|---|---|
| `reason` | string | §1.2 |
| `stated` | object, optional | `day_usd`, `month_usd`, and `fallback_today_usd`, each optional: a decimal string or number, at least 0, with at most 6 decimal places, converted exactly to micro-USD. These are FR-031's "starting values the operator states". |
| `confirm_zero` | boolean, default `false` | required when no record survives and nothing is stated |
| `renew` | boolean, default `false` | renews the fallback sub-budget in the same action; without it, renewal stays pending |

200:

```json
{
  "action": "init",
  "audit_id": 1,
  "state": "normal",
  "fallback_awaiting_renewal": true,
  "periods": { "day": "2026-10-28", "month": "2026-10" },
  "meters": {
    "day":          { "spent_micro_usd": 1500000, "sources": { "ledger": 0, "journal": 1500000, "stated": 1200000 } },
    "month":        { "spent_micro_usd": 9400000, "sources": { "ledger": 0, "journal": 8100000, "stated": 9400000 } },
    "fallback_day": { "spent_micro_usd": 300000, "allowance_micro_usd": 2000000, "grant": 1,
                      "sources": { "ledger": 0, "journal": 300000, "stated": 300000 } }
  },
  "journal": { "files_read": ["journal/2026-10.jsonl", "journal/2026-09.jsonl"], "records": 214, "lines_skipped": 0 },
  "confirm_zero": false,
  "renewed": false,
  "clock_offset_ms": null
}
```

- **Each meter takes the largest source.** A stated value can raise a meter, never lower it.
- **The allowance** is today's last renewal's value, or 2,000,000 when there was none. With `renew`, it is the rebuilt fallback spend plus 2,000,000, and the grant number goes up by 1.
- **The dev clock.** In dev, `clock_offset_ms` is the offset restored from the journal's newest `clock` record.

| Status | `error` | When |
|---|---|---|
| 409 | `already_initialized` | a `stack_state` row exists |
| 409 | `confirm_zero_required` | no ledger rows this month, no journal records in the files read, nothing stated, and `confirm_zero` false. Nothing is zeroed silently. |
| 409 | `journal_unreadable` | the journal directory exists but can't be read |
| 400, 401, 503 | as in §1 | |

## 3. Dev-only test machinery

FR-036's synthetic metered source and controllable clock exist only in dev, because they would get around FR-034. They are guarded in three layers:
- **At startup:** prod and any non-dev class refuse to start if `GATEWAY_TEST_CLOCK` or `GATEWAY_TEST_SYNTHETIC_SPEND` is set (exit 78, [plan.md §5.8](../plan.md#58-startup-refusals)). Preflight refuses the same, and so does the compose policy on the prod template.
- **Per request:** each endpoint needs `H4_ENV=dev` and its own switch: `GATEWAY_TEST_CLOCK=1` for the clock, `GATEWAY_TEST_SYNTHETIC_SPEND=1` for synthetic spend. Otherwise it answers 403 `{"error":"test_machinery_refused"}` and increments `h4.test_machinery.refused`.
- **In the matrix:** rows prove the refusals ([plan.md §13](../plan.md#13-the-forbidden-action-matrix)).

### 3.1 `POST /admin/test/clock`

It moves dev's gateway clock forward, persisted as an offset.

Request, with exactly one of `set` and `advance_s`:

```json
{ "set": "2026-10-27T08:00:00Z", "reason": "breach test step 1: clock to the 27th" }
```

```json
{ "advance_s": 86400, "reason": "breach test step 6: next UTC day" }
```

| Field | Rule |
|---|---|
| `set` | an RFC 3339 time in UTC (`Z`), at or after the current gateway time |
| `advance_s` | an integer from 1 to 31,622,400 (366 days) |

200: `{"gateway_time": "2026-10-27T08:00:00.000Z", "real_time": "2026-10-08T16:20:31.204Z", "offset_ms": 1611568796, "audit_id": 3}`

| Status | `error` | When |
|---|---|---|
| 409 | `clock_backwards` | `set` is earlier than the current gateway time. The clock is forward only. |
| 409 | `store_uninitialized` | the offset lives in `stack_state` |
| 403 | `test_machinery_refused` | outside dev, or `GATEWAY_TEST_CLOCK` isn't `1` |

**Effect.** New period keys, reservation expiry, and the 09:00 reminder follow the new time at once. Meters roll over lazily, at the next admission. `state` and the renewal flag are never touched, which is exactly what breach steps 5, 6, and 10 assert.

### 3.2 `POST /admin/test/synthetic`

It drives synthetic metered calls, $0.10 each, through the real pipeline.

Request: `{"attribution": "fallback", "count": 6, "reason": "breach test step 5: fallback to the allowance"}`

| Field | Rule |
|---|---|
| `attribution` | `fallback` or `metered` |
| `count` | an integer from 1 to 50 |

The calls run one at a time, each with a fixed prompt (`synthetic spend`) and no client content:
- **`fallback`** runs exactly as a hello would, in FR-022's order:
  - the state read;
  - the local adapter, if it is healthy, which answers free with `route: "local"`;
  - otherwise fallback admission with attribution `fallback`, the synthetic adapter, and the commit.

  Breach step 4 stops the model server first, so these calls reach the fallback.
- **`metered`** skips the local step: the state read, admission with attribution `metered` (the ceilings only), the synthetic adapter, and the commit. This is how dev spends while the local model is up (breach steps 2, 3, 7, 10).

**Limits.** Per-client limits don't apply, because the caller is the operator. The global metered limits do: pace at most 60 metered calls a minute.

The route stops at the first call that isn't answered. 200:

```json
{
  "requested": 6,
  "answered": 5,
  "calls": [
    { "n": 1, "status": 200, "route": "fallback", "cost_micro_usd": 100000, "trace_id": "5a2c9e1b7d3f4a6c8e0b2d4f6a8c0e1b" },
    { "n": 5, "status": 200, "route": "fallback", "cost_micro_usd": 100000, "trace_id": "7e4a0c2b9d1f3e5a7c9b0d2f4e6a8c1d" }
  ],
  "stopped": { "n": 6, "status": 503, "cause": "fallback_awaiting_renewal" },
  "meters": { "day": { "spent_micro_usd": 2000000 }, "month": { "spent_micro_usd": 5500000 },
              "fallback_day": { "spent_micro_usd": 2000000, "allowance_micro_usd": 2000000, "grant": 1 } },
  "audit_id": 17
}
```

- **`calls`** lists every answered call; the example shortens it to the first and the fifth. `stopped` is null when all were answered.
- **When the route stops,** `stopped` names the 503 `cause` or the 429 `error`, with `retry_after_s` for a 429. `meters` has the same shape as in `GET /admin/status` (§4.1), shortened here.

| Status | `error` | When |
|---|---|---|
| 403 | `test_machinery_refused` | outside dev, or `GATEWAY_TEST_SYNTHETIC_SPEND` isn't `1` |
| 409 | `store_uninitialized` | |

## 4. Reads

### 4.1 `GET /admin/status`

It returns everything `GET /health` reports ([gateway-http.md §5](gateway-http.md#5-get-health)), plus the meters, limits, journal, and alert backlog:

```json
{
  "stack": "prod", "env": "prod",
  "time": "2026-10-28T14:02:11.004Z", "real_time": "2026-10-28T14:02:11.004Z",
  "store": "ok", "initialized_at": "2026-10-20T09:12:40Z", "initialized_by": "operator:prod#<8 hex>",
  "state": "normal", "since": "2026-10-20T09:12:40Z", "crossed": [],
  "degraded_cause": null,
  "periods": { "day": "2026-10-28", "month": "2026-10" },
  "meters": {
    "day":   { "spent_micro_usd": 3520000, "reserved_micro_usd": 0, "ceiling_micro_usd": 5000000,  "warn_micro_usd": 3500000 },
    "month": { "spent_micro_usd": 9100000, "reserved_micro_usd": 0, "ceiling_micro_usd": 20000000, "warn_micro_usd": 14000000 },
    "fallback_day": { "spent_micro_usd": 400000, "reserved_micro_usd": 0, "allowance_micro_usd": 2000000,
                      "warn_micro_usd": 1400000, "grant": 1, "available_micro_usd": 1480000 }
  },
  "fallback": { "adapter": "bedrock", "awaiting_renewal": false, "awaiting_since": null },
  "adapters": [ "… as in GET /health …" ],
  "limits": { "metered_in_flight": 0, "metered_last_minute": 2 },
  "journal": { "status": "ok", "file": "journal/2026-10.jsonl" },
  "alerts": { "pending": 0, "failed_last_24h": 0 },
  "config": { "routing_sha": "<64 hex>", "price_version": "<the active version's id>" },
  "test_machinery": { "clock": false, "synthetic": false, "clock_offset_ms": null }
}
```

- **`available_micro_usd`** is the smallest of three rooms: the allowance minus fallback spend and reservations, the day ceiling minus day spend and reservations, and the month ceiling minus month spend and reservations. It is never below 0, and it is 0 while degraded or awaiting renewal. The example's 1,480,000 is the day ceiling's room.
- **A period with no row yet** shows 0 spend and the configured allowance.

### 4.2 `GET /admin/audit`

Query: `limit` (1 to 200, default 50), `before_id` (for paging), and `action` (one audit action).

Response: `{"entries": [{"id", "ts", "recorded_at", "actor", "action", "reason", "before", "after", "detail"}], "next_before_id": 12}`, newest first. Grafana's audit panel reads the same table directly, through `grafana_ro`.

### 4.3 `GET /admin/incidents`

Query: `limit` (1 to 20, default 5) or `id`.

Response:

```json
{
  "incidents": [
    { "id": 2, "created_at": "2026-10-29T16:40:03Z", "ceiling": "day", "period_key": "2026-10-29", "status": "written",
      "path": "incidents/2026-10-29-dev-day.intent.md", "sha256": "<64 hex>", "sha256_matches": true,
      "written_at": "2026-10-29T16:40:09Z", "content": "# Intent: Respond to the daily ceiling breach on dev, 2026-10-29\n…" }
  ]
}
```

`content` is the draft's Markdown, read from the file. `sha256_matches` says whether the file is still what the gateway wrote. A `queued` draft has no content yet. Breach step 8 asserts the evidence fields in `content` ([alerts.md §7](alerts.md#7-incident-drafts-fr-035)).

## 5. Live adapter calls: `POST /admin/adapters/{id}/complete`

This endpoint calls one named adapter directly, for the live contract test (FR-024, [provider-adapter.md §5](provider-adapter.md#5-the-contract-suite)) and the Bedrock evals ([plan.md §14](../plan.md#14-evals-and-red-team-scaffolds-agent-configuration-evals)).

**Which adapters.** `{id}` names the primary or the fallback adapter of this stack's route, never a synthetic one. Any other ID gets 404 `{"error":"unknown_adapter"}`.
- On prod, that is `local` and `bedrock`. So `POST /admin/adapters/bedrock/complete` exists only on prod, as plan.md says: only prod's route has a paid adapter.
- On dev and dev-cpu, it is `local`.

Request:

```json
{
  "messages": [
    { "role": "system", "content": "You are a contract test. Answer in one word." },
    { "role": "user", "content": "Count from one to one hundred in words." }
  ],
  "max_output_tokens": 8,
  "purpose": "contract",
  "reason": "contract-live bedrock, 2026-10-28"
}
```

| Field | Rule |
|---|---|
| `messages` | 1 to 8 messages; at most one `system` message, and first; roles `system`, `user`, `assistant`; contents together at most `per_call.max_input_chars` (2,000) code points |
| `max_output_tokens` | 1 to `per_call.max_output_tokens` (512) |
| `temperature` | optional, 0 to 1 |
| `purpose` | `contract` or `eval` |
| `reason` | §1.2 |

**Pipeline.**
- The state read comes first: 503 with the degraded body of [gateway-http.md §2.5.2](gateway-http.md#252-503-degraded) for `store_unreachable`, `store_uninitialized`, or `kill_switch_tripped`.
- **A paid adapter** goes through the global metered limits (429 `metered_capacity_exceeded`). Then admission with attribution **`test`**: the day and month ceilings only, not the sub-budget (FR-031, FR-037). Then the journal, the call, and the commit. Admission refusals get 503 with their cause.
- **The local adapter** is called directly, with attribution `none` and no admission.
- **The endpoint never fails over.** It calls the named adapter and nothing else.

200:

```json
{
  "adapter": "bedrock",
  "attribution": "test",
  "result": {
    "text": "One, two,",
    "usage": { "input_tokens": 31, "output_tokens": 8, "cache_read_input_tokens": 0 },
    "finish_reason": "length",
    "response_model": "<inference-profile ID the Author confirms>",
    "response_id": "<provider request ID>",
    "latency_ms": 811
  },
  "cost_micro_usd": "<from prices.yaml>",
  "cost_basis": "usage",
  "price_version": "<the active version's id>",
  "span": { "name": "chat <inference-profile ID the Author confirms>", "kind": "client", "attribute_keys": ["gen_ai.operation.name", "…"] },
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "audit_id": 52
}
```

- **`span`** describes the client span this call produced: its name, its kind, and its attribute keys (keys only, never values). The live contract test compares them with the canonical set in [telemetry.md](telemetry.md).
- **A provider error** answers 502:

  ```json
  { "error": "provider_error", "kind": "rate_limited", "retryable": true, "possibly_billed": false, "status": 429,
    "cost_micro_usd": 0, "trace_id": "…", "span": { "…": "…" } }
  ```

  `kind` is one of the `ProviderError` kinds ([provider-adapter.md §2.5](provider-adapter.md#25-provider-errors)). The message never carries a payload.
- **Each call** writes an `adapter_call` audit row with the adapter, purpose, cost, and ledger ID. It sends no confirmation alert. Its spend crosses thresholds like any other: the warnings and trips alert.

## 6. The operator CLI, `scripts/operator.py`

**How it runs.**
- Python 3.12, standard library only, run as `python3 -I -X pycache_prefix=$(mktemp -d) scripts/operator.py …`.
- Isolated mode ignores `PYTHON*` variables, the user's site directory, and the script's directory on `sys.path`. It still loads bytecode from `__pycache__`, which an agent could plant and git doesn't show; the empty `pycache_prefix` makes Python read and write bytecode only in a new temporary directory. Together, nothing an agent could plant in the tree, a cache, or a virtualenv runs with the Author's token ([research.md R-16](../research.md#r-16-the-operator-credential-a-bearer-token-per-stack-the-author)).
- The file is agent-editable and reviewed. Every merge-request note lists changes to it first, because it runs in the Author's terminal ([research.md R-14](../research.md#r-14-human-only-paths-gates-only-adr-0017-the-author); ADR 0017).

**Where the token comes from:**

| Stack | Source |
|---|---|
| `prod`, `dev` | `~/.config/h4reet-ai/operator/<stack>.token`. The CLI refuses, with exit 5, a file not owned by the user or with a mode other than 0600 or 0400, or a directory with a mode other than 0700. |
| `dev-cpu` | `H4_DEVCPU_OPERATOR_TOKEN` in `deploy/env.agents/dev-cpu.vars`, parsed as `KEY=VALUE` data and never sourced |
| any, inside the dev-cpu hop | `--token-stdin`: one line on standard input |

- **Never from the environment or the command line.** The variable name `H4_OPERATOR_TOKEN` is denied to agents by name all the same (FR-007).
- **Never printed.** The CLI shows only the fingerprint.

**Transport.**
- **prod and dev:** `http://127.0.0.1:18003` and `http://127.0.0.1:18103`, through urllib with an empty `ProxyHandler`, so `HTTP_PROXY` settings can't send the token to a proxy. A `--url` override must name `127.0.0.1`, `localhost`, or a single-label in-network host, or the CLI refuses with exit 2.
- **dev-cpu:** a session can't reach its ports (they are on the host's loopback, which the sandbox's proxy refuses), so the CLI makes one hop through a one-off probe container on the stack's `internal` network:

  ```text
  docker compose -p h4reet-dev-cpu -f deploy/compose.yaml --env-file deploy/env.agents/dev-cpu.vars \
    --profile breach run --rm -T breach-probe \
    python3 -I /app/operator.py --stack dev-cpu --url http://gateway:8081 --token-stdin <command> <arguments>
  ```

  The dummy token goes in on standard input. The probe image (`evals/Dockerfile.probe`) copies `scripts/operator.py` to `/app/operator.py`. Inside the sandbox (`SANDBOX_RUNTIME=1`), the command runs through `deploy/agents-engine/docker-relay`.

**Commands.** Every command takes `--stack prod|dev|dev-cpu`, and `--json` to print the response body instead of a summary.

| Command | Arguments | Calls |
|---|---|---|
| `mint` | `--stack prod\|dev` | nothing: writes the token file (below) |
| `status` | | `GET /admin/status` |
| `reset` | `--reason TEXT` | `POST /admin/reset` |
| `renew` | `--reason TEXT` | `POST /admin/renew` |
| `init` | `--reason TEXT [--renew] [--confirm-zero] [--day-usd X] [--month-usd X] [--fallback-today-usd X]` | `POST /admin/init` |
| `audit` | `[--limit N] [--action A]` | `GET /admin/audit` |
| `incidents` | `[--limit N] [--id N] [--show]` | `GET /admin/incidents`; `--show` prints the newest draft's Markdown, ready to redirect into a file |
| `contract-record` | `--adapter ID --cases FILE --out FILE --reason TEXT` | `GET /admin/status`, then `POST /admin/adapters/{ID}/complete` for each case, then `GET /admin/status` again; writes the recording for the live contract run ([provider-adapter.md §5.3](provider-adapter.md#53-three-run-modes)) |

**`mint`**, which `make operator-token ENV=<stack>` runs:
1. It refuses `dev-cpu` with exit 2: that token is the committed dummy.
2. It creates `~/.config/h4reet-ai/operator/` with mode 0700 if missing. It refuses a looser existing mode with exit 5.
3. It refuses with exit 5 if `<stack>.token` exists: delete the file first to rotate.
4. It generates 32 bytes from `secrets.token_bytes`, encodes them as unpadded base64url (43 characters), and adds the `h4op_<scope>_` prefix.
5. It writes the token and a newline with `O_WRONLY|O_CREAT|O_EXCL`, mode 0600, then fsyncs.
6. It prints the path, the SHA-256, the fingerprint, and the next step: "Set OPERATOR_TOKEN_SHA256=<hash> in ~/.config/h4reet-ai/env/<stack>.env, then restart the stack's gateway."

**`status`**, as a summary:

```text
prod  state normal since 2026-10-20T09:12:40Z · store ok · time 2026-10-28T14:02:11Z
day            3.52 / 5.00 USD   (warning 3.50)
month          9.10 / 20.00 USD  (warning 14.00)
fallback today 0.40 / 2.00 USD   (grant 1, warning 1.40, available 1.48) · awaiting renewal: no
adapters       local healthy · bedrock healthy, SSO session ends 2026-10-28T18:00Z
```

**For other tools.** `operator.py` also exposes an `AdminClient` class. `evals/run.py` (its `bedrock` adapter) and `evals/breach.py` import it by path, so the token is handled in one reviewed file. Both are launched the same way in the Author's terminal: by path, with the same flags, never with `-m` ([plan.md §4](../plan.md#4-environment-files-preflight-and-the-stack-targets)).

### 6.1 Make targets

| Target | Variables | Runs | Who may run it |
|---|---|---|---|
| `operator-token` | `ENV` (`prod` or `dev`) | `mint` | the Author |
| `operator-status` | `ENV` | `status` | the Author; agents for `ENV=dev-cpu` only |
| `operator-reset` | `ENV`, `REASON` | `reset` | the same |
| `operator-renew` | `ENV`, `REASON` | `renew` | the same |
| `operator-init` | `ENV`, `REASON`, `RENEW=1`, `CONFIRM_ZERO=1`, `DAY_USD=`, `MONTH_USD=`, `FALLBACK_TODAY_USD=` | `init` | the same |
| `operator-audit` | `ENV`, `LIMIT=` | `audit` | the same |
| `operator-incidents` | `ENV`, `ID=` | `incidents --show` | the same |

- **The reason.** Recipes pass it as `--reason "$$REASON"`, so make never splices the text into a shell line. A write target without `REASON` fails before any call, with exit 2.
- **The flags.** `RENEW=1` and `CONFIRM_ZERO=1` become `--renew` and `--confirm-zero`. `DAY_USD`, `MONTH_USD`, and `FALLBACK_TODAY_USD` become the stated values.
- **dev-cpu** recipes use the probe hop.
- **Agents** are kept off every stack but dev-cpu: bash-gate blocks the `operator-*` targets and admin URLs for any other stack (FR-008, in the closing patch, [plan.md §15](../plan.md#15-the-enforcement-layer-patch)).

Examples, from the Author's terminal:

```console
$ make operator-token ENV=prod
$ make operator-init ENV=prod REASON="First start on this host; no earlier records." CONFIRM_ZERO=1 RENEW=1
$ make operator-reset ENV=prod REASON="Ceiling breach investigated; see the incident draft."
$ make operator-renew ENV=prod REASON="Model server down for a driver update; renewing fallback."
```

### 6.2 Exit codes

| Code | Meaning |
|---|---|
| 0 | done |
| 1 | the gateway refused: a 400, 403, 404, or 409. The CLI prints its `error` and `detail`. |
| 2 | usage: bad arguments, a missing reason, `mint` for dev-cpu, or a `--url` outside the allowed hosts |
| 3 | 401: authentication failed. Check the token file against the env file's `OPERATOR_TOKEN_SHA256`. |
| 4 | no usable answer: connection refused, a timeout (30 s), or a 5xx, including 503 `store_unreachable` and edge's `admin_unavailable` |
| 5 | a token problem: the file is missing, has the wrong owner or mode, or is malformed; or `mint` found an existing file |

Make reports any non-zero exit as its own error 2, so the CLI's last line names the code and its meaning.

## 7. What keeps agents away from the operator credential (FR-007, FR-008)

- **Denied by name** in the early patch (tasks.md T045), before the first token exists: the token files (`~/.config/h4reet-ai`, read and write) and the variable `H4_OPERATOR_TOKEN`.
- **No route to the listener.** The sandbox can't reach the host's `127.0.0.1` stack and admin ports (matrix stage S).
- **bash-gate** blocks `make operator-*` and admin URLs for prod and dev.
- **The prefix check.** Prod's gateway refuses any token without `h4op_prod_`, and refuses at startup an `OPERATOR_TOKEN_SHA256` equal to the dev-cpu dummy's hash.
- **Matrix rows** test each of these ([plan.md §13](../plan.md#13-the-forbidden-action-matrix)). The positive row: the dev-cpu dummy resets the agents' own stack.
