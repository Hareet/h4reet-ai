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
| `POST /admin/alert-samples` **(spec 011, Amendment 0-8)** | `alert_samples` | none: nothing changes state | none: the samples, each naming the requester's fingerprint, are its notice (§2.4) |

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
  "journal": { "files_read": ["journal/2026-10.jsonl", "journal/2026-09.jsonl"], "records": 214, "lines_skipped": 0,
               "append": "ok" },
  "confirm_zero": false,
  "renewed": false,
  "clock_offset_ms": null
}
```

- **Each meter takes the largest source.** A stated value can raise a meter, never lower it.
- **The journal's source** is what data-model.md §3 rebuilds: the paired call records, or the newest `init` record's floor when that is larger. The audit row's `detail` keeps the two apart (`journal_calls`, `journal_floor`), and the ledger's source includes any reservations left in the table, at their maximum.
- **The allowance** is today's last renewal's value, or 2,000,000 when there was none. With `renew`, it is the rebuilt fallback spend plus 2,000,000, and the grant number goes up by 1.
- **The dev clock.** In dev, `clock_offset_ms` is the offset restored from the journal's newest `clock` record.
- **`journal.append`** is the result of appending the `operator` record after the commit, `ok` or `unwritable`: §1.3's `"journal": "unwritable"`, which this response's `journal` object carries since the key is already the read's summary (tasks.md T055). A failed append also writes a `journal_failed` audit row and doesn't undo the initialization.

| Status | `error` | When |
|---|---|---|
| 409 | `already_initialized` | a `stack_state` row exists. If it is the row of an init whose acknowledgement was lost, so the init answered 503 and never wrote its journal record, this answer appends that record first ([data-model.md §8](../data-model.md#8-initialization-fr-031) step 9; tasks.md T072) |
| 409 | `confirm_zero_required` | no ledger rows this month, no `reserve` or `commit` record in the files read, nothing stated, and `confirm_zero` false. Nothing is zeroed silently. (This row first said "no journal records"; data-model.md §8 step 7, the procedure, counts only call records, and an `init` record's floor still applies when the operator confirms.) |
| 409 | `journal_unreadable` | the journal directory exists but can't be read |
| 400, 401, 503 | as in §1 | |

### 2.4 `POST /admin/alert-samples` (spec 011)

**(spec 011, Amendment 0-8)** A marked sample of each alert catalogue entry, or of one kind's, sent wherever the stack's alerts go ([alerts.md §3.1](alerts.md#31-three-forms-from-the-same-facts-spec-011-amendment-0-1)), so the Author sees each design before a real alert needs it. Served on every stack.

Request: `{"reason": "…", "kind": "trip"}`, the reason under §1.2's rule, the kind optional: one of the catalogue's kinds (`warn`, `trip`, `fallback_exhausted`, `operator_action`, `credentials_expiring`, `fallback_unavailable`, `auth_failed`, `store_unreachable`, `reminder`), or absent for all 19 entries. Any other key is refused.

In order: authentication (§1.1); JSON (415 otherwise); the body; the in-flight check; one transaction writing the audit row (action `alert_samples`, [data-model.md §2.6](../data-model.md#26-audit_log-who-when-why-fr-034)); after the commit, the dispatcher takes the samples into its memory ([alerts.md §4.4](alerts.md#44-outcomes-and-when-something-is-down)); and the answer, at once, before any delivery:

```json
{
  "action": "alert_samples",
  "audit_id": 57,
  "delivery": "standin",
  "samples": [{ "entry": "warn-day", "key": "dev-cpu:sample:warn-day:57" }]
}
```

with one object for each entry, in the catalogue's order, and `delivery` the stack's mode, `real` or `standin`.

- **Each sample** renders its entry's fixed facts, never the stack's meters, state, or store, with the stack's own prefix, its key `<stack>:sample:<entry>:<audit id>`, and the requester's fingerprint, and goes through the same renderers, senders, schedule, and fallbacks as a real alert. Every form says it is a sample, and that nothing happened on the stack.
- **No state changes**: no meter, flag, journal record, or real alert, and no `operator_action` alert (§1.3). `h4.operator.actions` counts `alert_samples`, and the server span carries `h4.action: alert_samples`.
- **A real alert first:** samples go one at a time on each channel, at most one a second, and never before a real alert that is due.

| Status | `error` | When |
|---|---|---|
| 409 | `samples_in_flight` | an earlier request's samples are still pending on a channel, or its audit row is still being written: the check holds from before that row's transaction until the samples are queued or the request fails |
| 400 | `invalid_request` | a reason outside §1.2's rule, a kind outside the catalogue's, or any other key |
| 503 | `store_unreachable` | the store can't take the audit row; nothing is queued |
| 401, 415 | as in §1 | |

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

200: `{"gateway_time": "2026-10-27T08:00:00.000Z", "real_time": "2026-10-08T16:20:31.204Z", "offset_ms": 1611568796, "audit_id": 3}`, and `"journal": "ok"` or `"unwritable"`, as §1.3 reports every write's append (added by tasks.md T076). The audit row and the `clock` record are both stamped at the new gateway time, so the record goes into that month's journal file.

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
- **When the route stops,** `stopped` names the 503 `cause` or the 429 `error`, with `retry_after_s` for a 429. `meters` has the same shape as in `GET /admin/status` (§4.1), shortened here. (Added by tasks.md T076: a `fallback` call that local answered with a rejection stops with `{"n", "status": 502, "error": "local_error", "kind"}`, as hello's 502 does; `audit_id` is null if the audit row couldn't be written after the calls; and a call refused by the global limits stops the run, which doesn't wait for the minute to pass, so a caller paces itself.)

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
- **The keys** are the example's, with `GET /health`'s `status` and `version` first among them (`status`, `stack`, `env`, `version`, `time`, …), and `journal` as the object above in place of `/health`'s string.
- **It reports, as `/health` does** (tasks.md T055): with the store unreachable or empty it answers 200, with `store` saying which, and `initialized_at`, `initialized_by`, `state`, `since`, `crossed`, and `meters` null; `periods` comes from the gateway clock. The CLI's summary line shows the store's state for that reason (§6). Only a read that fails after the state read answers 503 `store_unreachable` (§1).

### 4.2 `GET /admin/audit`

Query: `limit` (1 to 200, default 50), `before_id` (for paging), and `action` (one audit action).

Response: `{"entries": [{"id", "ts", "recorded_at", "actor", "action", "reason", "before", "after", "detail"}], "next_before_id": 12}`, newest first. Grafana's audit panel reads the same table directly, through `grafana_ro`. (Added by tasks.md T075.) `next_before_id` is null on the last page. A parameter out of its range, an action that isn't one, or a parameter other than these three answers 400 `invalid_request`, naming it in `field` (`query` for an unknown one); `ts` and `recorded_at` are RFC 3339 with milliseconds.

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

`content` is the draft's Markdown, read from the file. `sha256_matches` says whether the file is still what the gateway wrote. A `queued` draft has no content yet. Breach step 8 asserts the evidence fields in `content` ([alerts.md §7](alerts.md#7-incident-drafts-fr-035)). (Added by tasks.md T075.) A `queued` draft's `content` and `sha256_matches` are null; a written draft whose file is gone or unreadable has null `content` and `sha256_matches: false`. Both `limit` and `id`, a value out of range, or another parameter answers 400 `invalid_request`.

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
| `temperature` | optional, 0 to 1. A paid adapter whose `temperature` setting is `model_default` sends none, whatever the request carries, so its model applies its own default: Bedrock's, in the committed `config/routing.yaml` (spec 007's plan, D22; spec 010's FR-017). The local adapter sends it as given |
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

(Readings, tasks.md T103.)
- **Costs** are decimal strings of micro-USD in both answers, as BigInt can't travel in JSON: the 502's `0` above is `"0"`.
- **`response_id`** is null when the provider names none.
- **The span** described is the call's last attempt's: a throttled call retried once describes the retry.
- **The audit row's detail** holds the adapter, the purpose, the attribution, the outcome and its error kind, the number of attempts, the cost, and `ledger_ref`, the key of the call's ledger rows: the metered call's reservation, whose one ledger row has it as `reservation_id`, or the local attempts' own row IDs. A metered commit still pending when the answer leaves writes its row under that reservation later.
- **The local call** happens whatever the adapter's health, since the endpoint is how the Author checks it. Its spans carry `h4.route.decision` `local` and `h4.route.reason` `local_healthy`, the one reason [telemetry.md](telemetry.md) gives a local call.

## 6. The operator CLI, `scripts/operator.py`

**How it runs.**
- Python 3.12, standard library only, run as `python3 -I -B -X pycache_prefix=/dev/null scripts/operator.py …`.
- Isolated mode ignores `PYTHON*` variables, the user's site directory, and the script's directory on `sys.path`. It still loads bytecode from `__pycache__`, which an agent could plant and git doesn't show. With the cache under `/dev/null`, which can never hold a directory, Python reads no bytecode and compiles the source, and `-B` keeps it from writing any. Together, nothing an agent could plant in the tree, a cache, or a virtualenv runs with the Author's token ([research.md R-16](../research.md#r-16-the-operator-credential-a-bearer-token-per-stack-the-author)).
- The file is agent-editable and reviewed. Every merge-request note lists changes to it first, because it runs in the Author's terminal ([research.md R-14](../research.md#r-14-human-only-paths-gates-only-adr-0017-the-author); ADR 0017).

**Where the token comes from:**

| Stack | Source |
|---|---|
| `prod`, `dev` | `~/.config/h4reet-ai/operator/<stack>.token`. The CLI refuses, with exit 5, a file not owned by the user or with a mode other than 0600 or 0400, or a directory with a mode other than 0700. |
| `dev-cpu` | `H4_DEVCPU_OPERATOR_TOKEN` in `deploy/env.agents/dev-cpu.vars`, parsed as `KEY=VALUE` data and never sourced |
| any, inside the dev-cpu hop | `--token-stdin`: one line on standard input |

- **Never from the environment or the command line.** The variable name `H4_OPERATOR_TOKEN` is denied to agents by name all the same (FR-007).
- **Never printed.** The CLI shows only the fingerprint.
- **Not for an agent session.** Inside the sandbox (`SANDBOX_RUNTIME=1`) the CLI and `AdminClient` refuse prod and dev with exit 2, as the make targets do, so a direct call is kept off them too (FR-008).

**Transport.**
- **prod and dev:** `http://127.0.0.1:18003` and `http://127.0.0.1:18103`, through urllib with an empty `ProxyHandler`, so `HTTP_PROXY` settings can't send the token to a proxy. Redirects are refused, and `Authorization` is an unredirected header, so no `Location` takes the token anywhere else.
- **A `--url` override** names one of two things, or the CLI refuses it with exit 2:
  - `127.0.0.1` or `localhost`, at the stack's own port (18003, 18103, or 18303) and no other. Another port may be another stack's listener: 18303 is dev-cpu's, whose gateway agents build, so a prod or dev token must never reach it. `localhost` is connected as `127.0.0.1`, where edge publishes, and never looked up: a lookup may give `::1` first. The agents' engine can't publish on prod's or dev's ports, so a stopped stack's port can't be squatted ([agents-engine.md](agents-engine.md) A21; T056's review, round 2).
  - With `--token-stdin` only, and for dev and dev-cpu only, a single-label in-network host, at the admin listener's port, 8081, and no other. On the host a single label would resolve through the search domains, so a token read from its file never goes to one; inside a container on the stack's network, where the token comes on standard input, it names a service. The label must start with a letter, so the resolver can't read it as an address (`2130706433`). No prod caller runs in a container, while dev's breach probe and dev-cpu's hop do, so prod never takes one.
  - T056 narrowed this rule, which first allowed a single label with any token. T056's review narrowed it again: before it, any loopback port was allowed, and a single label for prod.
- **The answer's stack.** An answer whose `stack` field names another stack came from another stack's listener, and so did a `GET /admin/status` answer with no `stack` field (§4.1 always names it). Either is no usable answer, exit 4. The CLI never shows the name the answer gave, and with `--json` it prints no body. (Added by T056's review.)
- **dev-cpu, from the Author's terminal:** `http://127.0.0.1:18303`, where the agents' engine publishes the listener, with the dummy read from `dev-cpu.vars`, and the transport as for prod and dev. There is no hop and no Docker: the docker CLI there drives the host's rootful engine, where nothing built from the live working tree, and nothing of dev-cpu's, may be built or run (FR-039), and a hop would skip preflight's P11. The host stacks' own images are built there only from a commit's export (plan §4), and `make image` refuses any other engine than the agents' (round 3's review). (T056's review made this change. Before it, the hop ran wherever the docker CLI pointed.)
- **dev-cpu, inside the sandbox (`SANDBOX_RUNTIME=1`):** a session can't reach that port (it is on the host's loopback, which the sandbox's proxy refuses). So the CLI makes one hop through a one-off probe container on the stack's `internal` network, always through `deploy/agents-engine/docker-relay`, so only on the agents' engine:

  ```text
  deploy/agents-engine/docker-relay docker compose -p h4reet-dev-cpu -f deploy/compose.yaml \
    --env-file deploy/env.agents/dev-cpu.vars --profile breach run --build --rm -T breach-probe \
    python3 -I /app/operator.py --stack dev-cpu --url http://gateway:8081 --token-stdin <command> <arguments>
  ```

  `--build` rebuilds the probe's image from the tree first, a cached `COPY` when nothing changed, so the copy in the probe is the code being run, as `make up` rebuilds dev-cpu's images, the gateway's included, so a stale image never certifies code (plan §4; tasks.md T184; round 3's review). The dummy token goes in on standard input. The probe image (`evals/Dockerfile.probe`) copies `scripts/operator.py` to `/app/operator.py`, and `scripts/hello.py`, which makes the same hop for `make hello` with no token ([gateway-http.md §9](gateway-http.md#9-the-hello-client-make-hello)), to `/app/hello.py`. It is the pinned `base:python` with a non-root user and nothing installed, and the `breach-probe` service runs it on `internal` alone, read-only, with no ports or binds. Its only variables are the stack's two Langfuse API keys, which the breach test's trace assertions read (tasks.md T080; [plan.md §2](../plan.md#2-compose-services-and-pinned-images), §8).
  - The hop's docker client keeps only the variables docker and the relay need, so no `COMPOSE_*`, `H4_*`, or template key in the shell can override `dev-cpu.vars` ([env-files.md §10](env-files.md#10-make-up-preflight), P5).
  - The CLI in the probe names its exit code on its last line, and the CLI outside passes that code on. A hop that fails before the CLI in the probe answers is exit 4.
  - tasks.md T144 brought the probe's image and its service forward from T080, for T064. T080 adds the breach test's own parts: `evals/breach.py`, `evals/breach_probe.py` (in the same image), the steps of [plan.md §8](../plan.md#8-the-breach-test), `make breach-test`, and the delivery overlay. A tree without `evals/Dockerfile.probe` makes the hop exit 4 and say so; the Author's terminal reaches dev-cpu's listener directly. (Departure, tasks.md T080: the `breach-probe` service now takes two variables from the env file, Langfuse's `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`, which the breach test's trace assertions read Langfuse's public API with, as [env-files.md §5](env-files.md#5-langfuse-4540s-keys) names the probe their reader; so the service above has no ports or binds, and only those two variables. On dev-cpu they are public dummies; the hops never read them.)

**Commands.** Every command takes `--stack prod|dev|dev-cpu`, and `--json` to print the response body instead of a summary.

| Command | Arguments | Calls |
|---|---|---|
| `mint` | `--stack prod\|dev` | nothing: writes the token file (below) |
| `status` | | `GET /admin/status` |
| `reset` | `--reason TEXT` | `POST /admin/reset` |
| `renew` | `--reason TEXT` | `POST /admin/renew` |
| `init` | `--reason TEXT [--renew] [--confirm-zero] [--day-usd X] [--month-usd X] [--fallback-today-usd X]` | `POST /admin/init` |
| `audit` | `[--limit N] [--action A]` | `GET /admin/audit` |
| `incidents` | `[--limit N] [--id N] [--show]` | `GET /admin/incidents`; `--show` prints the newest draft's Markdown, ready to redirect into a file. (Added by tasks.md T075: with `--id`, that draft's; with no written draft, it prints nothing on standard output, says why, and exits 1, as for a 404.) |
| `contract-record` | `--adapter ID --cases FILE --out FILE --reason TEXT` | `GET /admin/status`, then `POST /admin/adapters/{ID}/complete` for each case, then `GET /admin/status` again; writes the recording for the live contract run ([provider-adapter.md §5.3](provider-adapter.md#53-three-run-modes)) |
| `alert-samples` **(spec 011, Amendment 0-8)** | `--reason TEXT [--kind KIND]` | `POST /admin/alert-samples` (§2.4); prints each entry and key and where they went. No option begins `--s`, which the bash gate reads as `--stack`; the kind is passed as given, and the gateway checks it |

**`mint`**, which `make operator-token ENV=<stack>` runs:
1. It refuses `dev-cpu` with exit 2: that token is the committed dummy. It refuses inside the sandbox (`SANDBOX_RUNTIME=1`) with exit 2 too, as `make init-env` does.
2. It creates `~/.config/h4reet-ai/operator/` with mode 0700 if missing. It refuses a looser existing mode with exit 5.
3. It refuses with exit 5 if `<stack>.token` exists: delete the file first to rotate.
4. It generates 32 bytes from `secrets.token_bytes`, encodes them as unpadded base64url (43 characters), and adds the `h4op_<scope>_` prefix.
5. It writes the token and a newline with `O_WRONLY|O_CREAT|O_EXCL`, mode 0600, then fsyncs.
6. It prints the path, the SHA-256, the fingerprint, and the next step: "Set OPERATOR_TOKEN_SHA256=<hash> in ~/.config/h4reet-ai/env/<stack>.env, then run make up ENV=<stack>, which recreates the gateway with the new hash."

**`status`**, as a summary:

```text
prod  state normal since 2026-10-20T09:12:40Z · store ok · time 2026-10-28T14:02:11Z
day            3.52 / 5.00 USD   (warning 3.50)
month          9.10 / 20.00 USD  (warning 14.00)
fallback today 0.40 / 2.00 USD   (grant 1, warning 1.40, available 1.48) · awaiting renewal: no
adapters       local healthy · bedrock healthy, SSO session ends 2026-10-28T18:00Z
```

Below these lines it adds one for each thing that needs a look: the journal when it isn't `ok` (`unknown`, the state until the gateway's first record since it started, reads "not written since the gateway started", T182), alerts pending or failed in the last 24 hours, dev's test machinery when it is on, and, for an uninitialized store, the `make operator-init` command.

The `status` and `init` summaries name the CLI's own `--stack`, in the first line and in any command they suggest. They never use the answer's `stack` field (T056's review).

**For other tools.** `operator.py` also exposes an `AdminClient` class:
- `AdminClient(stack, *, url=None, token_stdin=False)` reads the stack's token as above, and talks to its admin listener as above. `url` and `token_stdin` are the CLI's `--url` and `--token-stdin`, for a caller inside a container on the stack's network.
- `.adapter_complete(adapter_id, messages, *, max_output_tokens, purpose, reason, temperature=None)` calls §5 and returns its 200 body as a dict: the answer is `result["text"]`, the cost `cost_micro_usd`.
- Every other answer raises `AdminError`, with `.status` (the HTTP status) and `.error` (the body's `error` field). It never holds the token or a payload. So does an answer from another stack's listener (Transport, above), with `.error` `wrong_stack`.

 `evals/run.py` (its `bedrock` adapter) and `evals/breach.py` import it by path, so the token is handled in one reviewed file. Both are launched the same way in the Author's terminal: by path, with the same flags, never with `-m` ([plan.md §4](../plan.md#4-environment-files-preflight-and-the-stack-targets)).

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
| `operator-alert-samples` **(spec 011, Amendment 0-8)** | `ENV`, `REASON`, `KIND=` | `alert-samples` | the Author; agents for `ENV=dev-cpu` only |

(spec 001) **The shared state's actions** (spec 001 contracts/shared-state.md §7, §8): `ENV=shared` takes the operator's targets alone, `status`, `init`, `reset`, `renew`, `audit`, and the new `restore`, through the laptop prod's admin listener while it runs, else an admin-only stack. `POST /admin/restore`, prod's alone, with a reason: after a backup's load, it answers the restored meters, sets the store uninitialized under the initialization lock, and keeps the ledger, the meters, and the audit log; `init` then refuses a stated value below a restored meter, `below_restored_meters`. Each action's audit row carries `host`.

- **The reason.** Recipes pass it as `--reason="$$REASON"`, so make never splices the text into a shell line, and the `=` keeps a reason that starts with `-` a value. A write target without `REASON` on the command line fails before any call, with exit 2.
- **The flags.** `RENEW=1` and `CONFIRM_ZERO=1` become `--renew` and `--confirm-zero`. `DAY_USD`, `MONTH_USD`, and `FALLBACK_TODAY_USD` become the stated values, as `--day-usd="$$DAY_USD"` and so on.
- **The command line only.** Like `ENV` and `REF`, each of these is taken only from make's command line, so a value left in the shell's environment never renews or states anything. `RENEW` or `CONFIRM_ZERO` with any value but `1` stops make before the recipe runs.
- **dev-cpu** recipes run the same CLI command. It goes straight to `127.0.0.1:18303` from the Author's terminal, and makes the probe hop inside the sandbox (§6, Transport).
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
| 1 | the gateway refused: a 400, 403, 404, or 409, or any other 4xx but 401 (edge's 413, a 415). The CLI prints its `error` and `detail`. |
| 2 | usage: bad arguments, a missing reason or one outside §1.2's rule, a stated value out of shape, `mint` for dev-cpu, prod or dev inside the sandbox, or a `--url` outside the allowed hosts and ports |
| 3 | 401: authentication failed. Check the token file against the env file's `OPERATOR_TOKEN_SHA256`, which must start with the fingerprint the CLI prints. |
| 4 | no usable answer: connection refused, a timeout (30 s), a redirect (never followed), a body that isn't a JSON object, an answer from another stack's listener, or a 5xx, including 503 `store_unreachable` and edge's `admin_unavailable`; for dev-cpu, a hop that fails before the CLI in the probe answers |
| 5 | a token problem: the file is missing, has the wrong owner or mode, or is malformed; or `mint` found an existing file |

Make reports any non-zero exit as its own error 2, so the CLI's last line names the code and its meaning.

## 7. What keeps agents away from the operator credential (FR-007, FR-008)

- **Denied by name** in the early patch (tasks.md T045), before the first token exists: the token files (`~/.config/h4reet-ai`, read and write) and the variable `H4_OPERATOR_TOKEN`.
- **No route to the listener.** The sandbox can't reach the host's `127.0.0.1` stack and admin ports (matrix stage S).
- **bash-gate** blocks `make operator-*` and admin URLs for prod and dev.
- **The prefix check.** Prod's gateway refuses any token without `h4op_prod_`, and refuses at startup an `OPERATOR_TOKEN_SHA256` equal to the dev-cpu dummy's hash.
- **Matrix rows** test each of these ([plan.md §13](../plan.md#13-the-forbidden-action-matrix)). The positive row: the dev-cpu dummy resets the agents' own stack.

## 8. The twin's evaluation calls: `POST /admin/twin/turn` (spec 007, Amendment 0-4)

The Author's live product and red-team runs ([spec 007](../../007-twin-conversation/spec.md) FR-050; its [plan](../../007-twin-conversation/plan.md) §2 and §8). Authenticated as every admin route (§1.1), with the reason rule (§1.2).

Request: the turn's body (`feature`, `path`, `turns`, as [gateway-http.md §10](gateway-http.md#10-post-roomturn-spec-007-amendment-0-3) gives it), plus `adapter`, the ID of the stack's primary or fallback adapter (never a synthetic one: any other is 404 `{"error":"unknown_adapter"}`), and `reason`.

It runs the twin's whole pipeline, the grounding, the prompt, and the guards, whatever `config/twin-readiness.yaml` says, since evaluation comes before readiness, and calls the named adapter through §5's pipeline: the state read first; a paid adapter through the global metered limits and admission attributed `test` (the ceilings, not the sub-budget); the local adapter directly and free; never a failover. Each call writes a `twin_call` audit row with its reason and counts in `h4.operator.actions{h4.action="twin_call"}`, never in `h4.twin.turns` or `h4.twin.withheld`.

Its 200 is the turn's, plus what the runners record and a visitor never sees: `guard` (the guard that withheld, replaced, or repaired the answer, or null), `redacted` (the guards that removed a sentence from the answer delivered, or its claim tags, in the guards' order, `[]` when none did, or when the answer was withheld; spec 007's plan, D42), `model`, `usage` (`input_tokens`, `output_tokens`), `cost_micro_usd`, `trace_id`, `pack_sha256`, and `prompt_sha256`. A degraded state is 503 with gateway-http.md §2.5.2's body; a refusal before the call 429.
