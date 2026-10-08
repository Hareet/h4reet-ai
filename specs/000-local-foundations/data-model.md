# Data model: the gateway's state, journal, and configuration (spec 000)

Phase 1 output of `/speckit-plan`. This file defines everything `services/gateway` persists or reads:
- the Postgres schema `gateway`, with every table, key, constraint, and index;
- the fsync'd JSONL journal;
- the configuration it loads, and the operator credential;
- the two state machines, the kill switch and the fallback sub-budget;
- the admission, commit, operator, and initialization transactions, step by step.

[plan.md §5.4](plan.md#54-state-store-meter-and-kill-switch) summarizes it. [ADR 0020](../../docs/adr/0020-gateway-state-store-and-meter.md) and [ADR 0001](../../docs/adr/0001-local-first-routing-with-capped-bedrock-fallback.md) record the decisions. Where this file and plan.md disagree on a detail, this file is right and plan.md is fixed.

Related contracts: [gateway-http.md](contracts/gateway-http.md) (what a request sees), [operator-admin.md](contracts/operator-admin.md) (the operator's writes), [provider-adapter.md](contracts/provider-adapter.md) (what a call returns), [config-files.md](contracts/config-files.md) (the file schemas), [alerts.md](contracts/alerts.md) (outbox rows and incident drafts), and [telemetry.md](contracts/telemetry.md) (the canonical metric, span, and log names this file cites).

**Conventions**
- **Money** is an integer count of micro-USD in `bigint`: $1 is 1,000,000. Nothing is a float. JSON bodies and metrics convert to USD only for display.
- **Periods** are UTC (FR-031; Clarifications, 2026-10-08). A day key is `YYYY-MM-DD`, a month key `YYYY-MM`.
- **The gateway clock** is real UTC time plus `stack_state.test_clock_offset_ms`. The offset exists only in dev (FR-036) and is null everywhere else. These use the gateway clock: period keys, reservation expiry, the 09:00 reminder, and every record's `ts`. These use the process's real clock: timeouts, retries, rate limits, circuit breakers, health intervals, and alert delivery. A dev clock jump therefore never shortens a timeout.
- **Attribution** says which meters a call counts toward:

  | Attribution | Made by | Counts toward |
  |---|---|---|
  | `none` | local calls | nothing (cost 0) |
  | `fallback` | the FR-022 fallback: Bedrock in prod, the synthetic adapter in dev | `day`, `month`, `fallback_day` |
  | `metered` | dev's synthetic metered-primary calls (`POST /admin/test/synthetic`) | `day`, `month` |
  | `test` | prod's live contract test and Bedrock evals (`POST /admin/adapters/{id}/complete`) | `day`, `month`, not the sub-budget (FR-031) |

  Telemetry's `h4.meter.attribution` takes the same four values.

## 1. Where state lives

| Store | Holds | Survives | Role |
|---|---|---|---|
| `gateway-state` (Postgres 17), database `gateway`, schema `gateway` | the kill switch, meters, reservations, ledger, audit log, alert outbox, incidents | restarts and `make down` (named volume `gateway-state-data`, one per compose project) | the enforcement point, read on every request (FR-031) |
| The journal, `${GATEWAY_STATE_DIR}/journal/YYYY-MM.jsonl` | reservations, completions, operator actions, dev clock changes | also `docker compose down -v` and the loss of the store's volume (a host bind, not a Docker volume) | the rebuild source for initialization (§8) |
| Incident drafts, `${GATEWAY_STATE_DIR}/incidents/` | FR-035 drafts | same as the journal | evidence for the Author ([alerts.md](contracts/alerts.md#7-incident-drafts-fr-035)) |
| `config/*.yaml`, mounted read-only at `/app/config` | routing, prices, budgets, alerts | the repository | loaded at startup (§4) |
| The container's environment, from the stack's env file | the stack's identity, the operator token's hash, channel credentials, the dev-only switches | the env file ([env-files.md](contracts/env-files.md)) | loaded at startup |
| Process memory | adapter health, circuit breakers, per-client buckets, the global metered counters, the store-outage timer | nothing | soft limits only; no ceiling is ever enforced from memory |

`GATEWAY_STATE_DIR` is `/var/lib/h4-gateway` inside the container. The bind source is `${H4_STATE_DIR}/gateway`: `~/.local/state/h4reet/<stack>/gateway` for prod and dev, and `/var/lib/h4agents/state/dev-cpu/gateway` on the agents' engine ([plan.md §4](plan.md#4-environment-files-preflight-and-the-stack-targets)).

## 2. The Postgres schema `gateway`

### 2.1 Migrations, roles, and connections

- **Files:** `services/gateway/migrations/0001_state.sql` (every table, trigger, and the view) and `0002_grafana_ro.sql` (the read-only role). Migrations are append-only: a new change is a new file.
- **Applying them:** at startup, in file order, one transaction each, under a fixed `pg_advisory_lock` key. Each is recorded in `gateway.schema_migrations (version integer PRIMARY KEY, name text NOT NULL, sha256 text NOT NULL, applied_at timestamptz NOT NULL)`. If a recorded migration's file no longer matches its SHA-256, the gateway stops (exit 1).
- **A store that is down at startup** doesn't stop the gateway. It starts, answers every request with `store_unreachable`, and retries the migrations every 5 s.
- **Roles:**
  - `gateway`, the database owner, used by the gateway with `GATEWAY_DB_PASSWORD`.
  - `grafana_ro`, read-only (§2.9).
- **Pool** (`pg` 8.23.1): `statement_timeout=250ms`, `lock_timeout=250ms`, `idle_in_transaction_session_timeout=2s`, `connectionTimeoutMillis=500`, at most 10 connections, plus one dedicated connection for `LISTEN alert_outbox`. Any error or timeout on a request's path means `store_unreachable` (fail closed, FR-031).
- **Locking order:** every transaction that changes `stack_state` or `meters` first takes `SELECT … FROM gateway.stack_state WHERE id = 1 FOR UPDATE`. That serializes metered admissions, commits, and operator actions (they are rare), and rules out deadlocks.

### 2.2 `stack_state`: the kill switch (one row)

The row's absence means the store is uninitialized (`store_uninitialized`, FR-031).

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `id` | `smallint` | PRIMARY KEY, `DEFAULT 1`, `CHECK (id = 1)` | singleton |
| `stack` | `text` | NOT NULL, `CHECK (stack IN ('prod','dev','dev-cpu'))` | `H4_STACK` at initialization |
| `env` | `text` | NOT NULL, `CHECK (env IN ('prod','dev'))` | `H4_ENV` at initialization |
| `state` | `text` | NOT NULL, `CHECK (state IN ('normal','degraded'))` | the kill switch (FR-033) |
| `since` | `timestamptz` | NOT NULL | when `state` last changed |
| `crossed` | `text[]` | NOT NULL, `DEFAULT '{}'`, `CHECK ((state = 'degraded') = (cardinality(crossed) > 0))` | the ceilings that tripped since the last reset, as `day:YYYY-MM-DD` or `month:YYYY-MM` (FR-031's "which ceilings have been crossed") |
| `fallback_awaiting_renewal` | `boolean` | NOT NULL | FR-030's renewal flag |
| `fallback_awaiting_since` | `timestamptz` | `CHECK (fallback_awaiting_renewal = (fallback_awaiting_since IS NOT NULL))` | when the flag was set |
| `initialized_at` | `timestamptz` | NOT NULL | |
| `initialized_by` | `text` | NOT NULL | the actor of the `init` (§2.6) |
| `test_clock_offset_ms` | `bigint` | `CHECK (test_clock_offset_ms IS NULL OR (env = 'dev' AND test_clock_offset_ms >= 0))` | dev only, forward only. Prod refuses to start if it isn't null ([plan.md §5.8](plan.md#58-startup-refusals)). |
| `updated_at` | `timestamptz` | NOT NULL | |

Metrics derived from it (every 10 s, [telemetry.md](contracts/telemetry.md)): `h4.kill_switch.state` (one-hot `h4.state`), `h4.fallback.awaiting_renewal`, and `h4.degraded.cause`. When the store is unreachable or uninitialized, the state gauge reports `degraded`, because unknown counts as degraded (FR-022), and the cause gauge names the store condition.

### 2.3 `meters`: spend per UTC period

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `meter` | `text` | `CHECK (meter IN ('day','month','fallback_day'))` | |
| `period_key` | `text` | `CHECK` on the format: `YYYY-MM-DD` for `day` and `fallback_day`, `YYYY-MM` for `month` | the UTC period |
| `spent_micro` | `bigint` | NOT NULL, `DEFAULT 0`, `CHECK (spent_micro >= 0)` | committed metered spend |
| `reserved_micro` | `bigint` | NOT NULL, `DEFAULT 0`, `CHECK (reserved_micro >= 0)` | the sum of the live reservations charged to this row |
| `allowance_micro` | `bigint` | `CHECK ((meter = 'fallback_day') = (allowance_micro IS NOT NULL))`, `CHECK (allowance_micro > 0)` | `fallback_day` only: starts at `fallback_daily_usd` (2,000,000); only a renewal changes it (§6.2) |
| `grant_no` | `integer` | `CHECK ((meter = 'fallback_day') = (grant_no IS NOT NULL))`, `CHECK (grant_no >= 1)` | `fallback_day` only: 1 for the day's own $2, plus 1 for each renewal that day; it numbers the per-grant alerts (`:g<n>`) |
| `warned_at` | `timestamptz` | | the last warning crossing on this row |
| `reached_at` | `timestamptz` | | `day`, `month`: when the ceiling was reached. `fallback_day`: when committed spend last reached the allowance. |
| `created_at`, `updated_at` | `timestamptz` | NOT NULL | |

- **Primary key:** (`meter`, `period_key`).
- **Rows a call touches:** `fallback` touches `day`, `month`, and `fallback_day`. `metered` and `test` touch `day` and `month`. `none` touches none.
- **Invariant**, checked by an integration test: `reserved_micro` equals the sum of `max_micro` over the live `reservations` charged to the row.
- **Thresholds** aren't stored. They come from `config/budgets.yaml` (§4): ceilings of 5,000,000 a day and 20,000,000 a month, warnings at 3,500,000 and 14,000,000, and each fallback grant's warning at its allowance minus 600,000.
- **Metrics** (the 10 s ticker, [telemetry.md](contracts/telemetry.md)): `h4.meter.spend_usd`, `h4.meter.ceiling_usd`, and `h4.meter.warn_usd`, each with `h4.meter` = `day`, `month`, `fallback_day`; and `h4.fallback.allowance_usd`. A period with no row yet reports 0 spend and the configured allowance.

### 2.4 `reservations`: metered calls in flight

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PRIMARY KEY. It becomes the ledger row's `reservation_id`. |
| `attribution` | `text` | `CHECK (attribution IN ('fallback','metered','test'))` |
| `adapter_id`, `provider`, `model` | `text` | NOT NULL |
| `price_version` | `text` | NOT NULL |
| `max_micro` | `bigint` | NOT NULL, `CHECK (max_micro >= 0)`: the call's maximum cost (§7.2) |
| `period_day`, `period_month` | `text` | NOT NULL: the periods the call is charged to, fixed at admission |
| `created_at` | `timestamptz` | NOT NULL |
| `expires_at` | `timestamptz` | NOT NULL: `created_at` plus `reservation_ttl_s` (120 s) |

- **Index:** (`expires_at`).
- **Expiry:** a reservation that outlives its TTL never committed: the gateway crashed, or the store was down for the whole retry window (§7.3). The call may have been billed, so a **sweep settles it at its maximum**, failing safe. The sweep runs in the admission and renewal transactions and in the 10 s background task (§7.7). For each expired row it:
  - deletes the row and subtracts it from `reserved_micro`;
  - inserts a ledger row with `cost_micro = max_micro`, `cost_basis = 'expired'`, and `outcome = 'unknown'`;
  - adds the cost to `spent_micro`, and evaluates the crossings exactly like a commit (§7.3 step 6).

  A late commit for the same reservation then finds that ledger row and is a no-op (§7.3 step 2). The live meter never counts less than was spent, and the journal's `reserve` record with no `commit` still counts at its maximum in a rebuild (§8).

### 2.5 `ledger`: the Model Call Record (FR-023)

One row per provider attempt. A request that fails over from local to Bedrock writes two rows. A degraded response makes no provider call and writes no row; its cause is in the span, the counter, and the log (FR-022, FR-038).

| Column | Type | Constraints | FR-023 field |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY | |
| `reservation_id` | `uuid` | `UNIQUE`; NULL for unmetered calls | makes a commit idempotent |
| `ts` | `timestamptz` | NOT NULL: completion time | |
| `started_at` | `timestamptz` | NOT NULL | |
| `stack` | `text` | NOT NULL | |
| `request_id` | `text` | NOT NULL | |
| `trace_id` | `text` | NOT NULL, `CHECK (trace_id ~ '^[0-9a-f]{32}$')` | |
| `purpose` | `text` | `CHECK (purpose IN ('hello','contract','eval','synthetic'))` | |
| `route_decision` | `text` | `CHECK (route_decision IN ('local','fallback','metered'))` | routing decision |
| `route_reason` | `text` | `CHECK (route_reason IN ('local_unhealthy','local_failed'))`, NULL unless `fallback` | routing decision |
| `attribution` | `text` | `CHECK (attribution IN ('none','fallback','metered','test'))` | |
| `adapter_id` | `text` | NOT NULL | |
| `provider` | `text` | NOT NULL (`gen_ai.provider.name`: `local`, `aws.bedrock`, `synthetic`) | provider |
| `request_model`, `response_model` | `text` | `request_model` NOT NULL | model |
| `input_tokens`, `output_tokens`, `cache_read_tokens` | `integer` | `CHECK (… >= 0)`; NULL when an error returned no usage | tokens |
| `latency_ms` | `integer` | NOT NULL, `CHECK (latency_ms >= 0)` | latency |
| `finish_reason` | `text` | `CHECK (finish_reason IN ('stop','length','content_filter','error','other'))` | |
| `outcome` | `text` | `CHECK (outcome IN ('ok','error','unknown'))`; `unknown` only with `cost_basis = 'expired'` | |
| `error_kind` | `text` | a `ProviderError` kind; `CHECK ((outcome = 'error') = (error_kind IS NOT NULL))` | |
| `cost_micro` | `bigint` | NOT NULL, `CHECK (cost_micro >= 0)` | estimated cost |
| `cost_basis` | `text` | `CHECK (cost_basis IN ('usage','reservation','expired','none'))` | how the cost was found |
| `price_version` | `text` | NOT NULL | the versioned price table |
| `routing_sha` | `text` | NOT NULL, `CHECK (routing_sha ~ '^[0-9a-f]{64}$')` | |
| `period_day`, `period_month` | `text` | NOT NULL; for metered calls, the reservation's | |
| `client_label` | `text` | `CHECK (client_label ~ '^[a-z0-9-]{1,32}$')`; NULL without an `X-H4-Client` header | |

- **Row rules:**
  - `attribution = 'none'` means `cost_micro = 0`, `cost_basis = 'none'`, and no `reservation_id`.
  - `cost_basis = 'reservation'` means the call failed as `possiblyBilled` and was charged its reserved maximum.
  - `cost_basis = 'none'` with a paid attribution means the call failed before anything could be billed.
  - `cost_basis = 'expired'` means the reservation outlived its TTL without a commit, and a sweep charged its maximum (§2.4). The row's tokens, latency, and finish reason are NULL or 0, and its `trace_id` is the reservation's.
- **Indexes:** (`ts`), (`period_day`, `attribution`), (`period_month`, `attribution`), (`trace_id`).
- **Never stored:** prompts, completions, the system prompt, and the client's source address. `client_label` stays in the store: no alert, metric attribute, span, or incident draft carries it (FR-032).
- **Metrics:** each committed row adds its cost to `h4.cost.usd` (`gen_ai.provider.name`, `gen_ai.request.model`, `h4.meter.attribution`). The matching client span carries the same fields ([telemetry.md](contracts/telemetry.md)).

### 2.6 `audit_log`: who, when, why (FR-034)

| Column | Type | Constraints |
|---|---|---|
| `id` | `bigint` | PRIMARY KEY, `GENERATED ALWAYS AS IDENTITY` |
| `ts` | `timestamptz` | NOT NULL: the gateway clock |
| `recorded_at` | `timestamptz` | NOT NULL, `DEFAULT now()`: real time |
| `stack` | `text` | NOT NULL |
| `actor` | `text` | NOT NULL: `operator:<stack>#<first 8 hex of the token's SHA-256>`, `gateway`, or `unknown` |
| `action` | `text` | `CHECK (action IN ('init','reset','renew','trip','fallback_exhausted','auth_failed','test_clock','test_synthetic','adapter_call'))` |
| `reason` | `text` | required, 10 to 500 characters, for `init`, `reset`, `renew`, `test_clock`, `test_synthetic`, and `adapter_call`; NULL otherwise (a `CHECK` enforces both) |
| `before`, `after` | `jsonb` | the state the action changed, where it changed one |
| `detail` | `jsonb` | NOT NULL, `DEFAULT '{}'` |

- **Append-only:** a trigger raises on `UPDATE`, `DELETE`, and `TRUNCATE`. The gateway owns the table, so the trigger guards against bugs, not against the owner.
- **Indexes:** (`ts` DESC), (`action`, `recorded_at`).
- **What each action records:**

  | Action | Actor | `before` → `after` | `detail` |
  |---|---|---|---|
  | `init` | operator | null → the new `stack_state` and meter rows | the candidates from each source, the chosen values, `confirm_zero`, `renewed`, journal lines skipped (§8) |
  | `reset` | operator | `state`, `since`, `crossed` | the meters still at or above a ceiling |
  | `renew` | operator | `fallback_day`'s `allowance_micro`, `grant_no`, `spent_micro`, `reserved_micro`, and the flag | |
  | `trip` | `gateway` | `state`, `crossed` | the ceiling, the period, the crossing ledger ID |
  | `fallback_exhausted` | `gateway` | the flag | the grant, the allowance, the crossing ledger ID |
  | `auth_failed` | `unknown` | – | `{"class": "missing" \| "malformed" \| "wrong_prefix" \| "mismatch", "path": …}` |
  | `test_clock` | operator (dev) | the offset | the new gateway time |
  | `test_synthetic` | operator (dev) | – | attribution, count requested, calls answered |
  | `adapter_call` | operator | – | adapter, purpose, cost, the ledger ID |

- **Readers:** Grafana's audit panel reads this table through `grafana_ro` (FR-034; [research.md R-10](research.md#r-10-grafanas-audit-panel-reads-the-store-not-telemetry)), so it still works when telemetry is down.
- **Metrics and logs:** each accepted operator write increments `h4.operator.actions` (`h4.action`) and logs a record with `event.name=h4.audit` ([telemetry.md](contracts/telemetry.md)).

### 2.7 `alert_outbox`: alerts committed with their cause

| Column | Type | Constraints |
|---|---|---|
| `id` | `bigint` | PRIMARY KEY, identity |
| `dedupe_key` | `text` | NOT NULL, `UNIQUE` ([alerts.md §2](contracts/alerts.md#2-kinds-triggers-and-dedupe-keys)) |
| `kind` | `text` | `CHECK (kind IN ('warn','trip','fallback_exhausted','operator_action','credentials_expiring','fallback_unavailable','auth_failed','reminder'))`. `store_unreachable` is never stored: the store is down when it fires. |
| `stack` | `text` | NOT NULL |
| `created_at` | `timestamptz` | NOT NULL: the gateway clock, the event's time as the message shows it |
| `enqueued_at` | `timestamptz` | NOT NULL, `DEFAULT now()`: real time, the base of the retry schedule and of delivery lag |
| `subject`, `body` | `text` | NOT NULL: the rendered plain text ([alerts.md §3](contracts/alerts.md#3-message-format)) |
| `facts` | `jsonb` | NOT NULL: the values the text was rendered from, in micro-USD |
| `telegram_status`, `email_status` | `text` | `CHECK (… IN ('pending','delivered','failed'))` |
| `telegram_attempts`, `email_attempts` | `smallint` | NOT NULL, `DEFAULT 0` |
| `telegram_next_at`, `email_next_at` | `timestamptz` | real time; NULL once final |
| `telegram_delivered_at`, `email_delivered_at` | `timestamptz` | |
| `telegram_ref`, `email_ref` | `text` | Telegram's `message_id`; the SMTP reply code and queue ID |
| `telegram_error`, `email_error` | `text` | an error class only (`timeout`, `connect`, `tls`, `http_429`, `smtp_535`, …), never a URL (Telegram's carries the bot token) or a response body |

- **Indexes:** partial indexes on `telegram_next_at WHERE telegram_status = 'pending'` and on `email_next_at WHERE email_status = 'pending'`.
- **Writes:** `INSERT … ON CONFLICT (dedupe_key) DO NOTHING`, so a crossing alerts once. A row is written in the same transaction as the crossing, trip, exhaustion, or operator action that caused it, and that transaction ends with `NOTIFY alert_outbox`.
- **Metrics:** `h4.alerts` (`h4.channel`, `h4.alert.kind`, `h4.outcome`) and `h4.alert.delivery_lag` ([telemetry.md](contracts/telemetry.md)).

### 2.8 `incidents`: drafts queued by a trip (FR-035)

| Column | Type | Constraints |
|---|---|---|
| `id` | `bigint` | PRIMARY KEY, identity |
| `created_at` | `timestamptz` | NOT NULL: the crossing time |
| `stack` | `text` | NOT NULL |
| `ceiling` | `text` | `CHECK (ceiling IN ('day','month'))` |
| `period_key` | `text` | NOT NULL |
| `ledger_id` | `uuid` | NOT NULL: the crossing call |
| `trip_alert_key` | `text` | NOT NULL |
| `status` | `text` | `CHECK (status IN ('queued','written','failed'))` |
| `path` | `text` | relative to `GATEWAY_STATE_DIR`; NULL until written |
| `sha256` | `text` | of the written file; NULL until written |
| `written_at` | `timestamptz` | |
| `error` | `text` | an error class |

`UNIQUE (ceiling, period_key)`: within one store's life a period's ceiling is crossed once, because spend never decreases. The draft's file and template are in [alerts.md §7](contracts/alerts.md#7-incident-drafts-fr-035).

### 2.9 The view `v_state` and the role `grafana_ro`

`grafana_ro` can read exactly two objects: `gateway.audit_log` and `gateway.v_state`. The view joins the state row to the current periods' meters, computed with the gateway clock, so it never shows yesterday's row as today's.

```sql
CREATE VIEW gateway.v_state AS
WITH s AS (
  SELECT st.*,
         (now() + make_interval(secs => coalesce(st.test_clock_offset_ms, 0) / 1000.0))
           AT TIME ZONE 'UTC' AS gateway_time
  FROM gateway.stack_state st
  WHERE st.id = 1
)
SELECT s.stack, s.env, s.state, s.since, s.crossed,
       s.fallback_awaiting_renewal, s.fallback_awaiting_since, s.initialized_at,
       s.test_clock_offset_ms,
       to_char(s.gateway_time, 'YYYY-MM-DD')  AS day_key,
       to_char(s.gateway_time, 'YYYY-MM')     AS month_key,
       coalesce(d.spent_micro, 0)    AS day_spent_micro,
       coalesce(d.reserved_micro, 0) AS day_reserved_micro,
       coalesce(m.spent_micro, 0)    AS month_spent_micro,
       coalesce(m.reserved_micro, 0) AS month_reserved_micro,
       coalesce(f.spent_micro, 0)    AS fallback_spent_micro,
       coalesce(f.reserved_micro, 0) AS fallback_reserved_micro,
       f.allowance_micro             AS fallback_allowance_micro,  -- NULL until today's row exists
       f.grant_no                    AS fallback_grant_no
FROM s
LEFT JOIN gateway.meters d ON d.meter = 'day'          AND d.period_key = to_char(s.gateway_time, 'YYYY-MM-DD')
LEFT JOIN gateway.meters m ON m.meter = 'month'        AND m.period_key = to_char(s.gateway_time, 'YYYY-MM')
LEFT JOIN gateway.meters f ON f.meter = 'fallback_day' AND f.period_key = to_char(s.gateway_time, 'YYYY-MM-DD');
```

`0002_grafana_ro.sql`:
- creates `grafana_ro` if missing: `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`;
- sets `default_transaction_read_only = on` and `statement_timeout = '2s'` on the role;
- grants `CONNECT` on the current database, `USAGE` on schema `gateway`, and `SELECT` on `gateway.audit_log` and `gateway.v_state`, and nothing else. The view runs with its owner's rights, so `grafana_ro` needs no grant on the tables behind it. Neither object exposes `client_label`.

**The role's password:** at every startup the gateway sets it from `GATEWAY_GRAFANA_RO_PASSWORD`. It sends a SCRAM-SHA-256 verifier computed in the gateway (`ALTER ROLE grafana_ro PASSWORD 'SCRAM-SHA-256$4096:…'`), so the plaintext never reaches Postgres or its logs.

## 3. The journal

**Purpose.** It holds the call records that FR-031's initialization rebuilds from, somewhere the store's volume can't take with it. It is a host bind mount, so even `docker compose down -v` leaves it ([ADR 0020](../../docs/adr/0020-gateway-state-store-and-meter.md)).

**File handling:**
- One file per gateway-clock month: `${GATEWAY_STATE_DIR}/journal/YYYY-MM.jsonl`, mode 0600, in a 0700 directory. A record goes into the file of the month of its own `ts`.
- One JSON object per line, UTF-8, under 4 KB. There is one writer per stack: an in-process queue serializes appends.
- Each append is one `write()` on a descriptor opened with `O_APPEND`, then `fsync()`. The first append to a new file also fsyncs the directory. Only a record whose `fsync` returned has been written.

**Common fields:** `v` (1), `kind`, `ts` (the gateway clock, RFC 3339 with milliseconds, `Z`), and `stack`.

| Kind | Written | Fields |
|---|---|---|
| `reserve` | after the admission transaction commits, before the provider call (§7.2 step 8). A failed append refuses the call with `journal_unwritable`. | `reservation_id`, `attribution`, `adapter`, `provider`, `model`, `price_version`, `max_micro`, `period_day`, `period_month`, `expires_at` |
| `commit` | after the commit transaction (§7.3 step 8). A failed append doesn't undo the commit. | `reservation_id`, `ledger_id`, `cost_micro`, `cost_basis`, `outcome`, `error_kind`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `attribution`, `period_day`, `period_month`, `trace_id` |
| `operator` | after an `init`, `reset`, or `renew` commits | `action`, `audit_id`, `actor`, `period_day`; for `renew`, and for `init` with `renewed: true`: `allowance_micro`, `grant_no`; for `init`: the chosen meter values and `confirm_zero` |
| `clock` | dev only, after `POST /admin/test/clock` commits | `offset_ms`, `gateway_time`, `audit_id` |

Example lines, from dev's synthetic spend:

```json
{"v":1,"kind":"reserve","ts":"2026-10-28T10:15:02.114Z","stack":"dev","reservation_id":"7d3f0c52-4a1e-4b8e-9f61-2c5a8e0d9b17","attribution":"fallback","adapter":"synthetic","provider":"synthetic","model":"metered-test","price_version":"2026-10-08.1","max_micro":100000,"period_day":"2026-10-28","period_month":"2026-10","expires_at":"2026-10-28T10:17:02.114Z"}
{"v":1,"kind":"commit","ts":"2026-10-28T10:15:02.131Z","stack":"dev","reservation_id":"7d3f0c52-4a1e-4b8e-9f61-2c5a8e0d9b17","ledger_id":"c4e2a9d1-8f3b-4c6e-a2d7-5b9f1e3c7a40","cost_micro":100000,"cost_basis":"usage","outcome":"ok","error_kind":null,"input_tokens":0,"output_tokens":1000,"cache_read_tokens":0,"attribution":"fallback","period_day":"2026-10-28","period_month":"2026-10","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736"}
```

**Writability.** No separate flag decides it: every metered admission attempts its `reserve` append, and a failure refuses that call. `GET /health` reports the result of the last append (`journal: ok | unwritable`). An unwritable journal never affects local answers (FR-022; [plan.md §19](plan.md#19-degraded-modes)).

**What a rebuild reads** (initialization, §8):
1. **The files.** The file of the current gateway-clock month and the one before it. Lines that don't parse are skipped and counted; at a crash, only the last line can be torn. Records whose `stack` isn't this stack's are skipped and counted.
2. **Pairing.** It pairs `reserve` and `commit` records by `reservation_id`. A reservation with a `commit` counts that commit's `cost_micro`. A reservation without one counts its `max_micro`, because the call may have been billed. A `commit` without its `reserve` counts its own `cost_micro`.
3. **Which meters.** A record counts toward a meter only if its `period_day` or `period_month` is a current period. `fallback` counts toward `day`, `month`, and `fallback_day`; `metered` and `test` toward `day` and `month`.
4. **The allowance.** It takes `allowance_micro` and `grant_no` from the last `operator` record that set them for today (a `renew`, or an `init` with `renewed: true`). With none, they are 2,000,000 and 1.
5. **The dev clock.** In dev only, the newest `clock` record gives the offset to restore before the current periods are computed (§8).

**Retention.** None in spec 000. At test-traffic volume a month's file stays in the kilobytes.

## 4. Configuration the gateway loads

The file schemas, examples, and validation errors are in [config-files.md](contracts/config-files.md). The four files are read once, at startup, from the read-only mount `/app/config`. A change takes effect at the next gateway start (`docker compose restart gateway`). Any validation failure stops startup with exit 78.

| File | Edited by | Becomes | Recorded on every call as |
|---|---|---|---|
| `config/routing.yaml` | agents, reviewed | the adapter set and this `H4_ENV`'s route: `primary` (always a `local` adapter) and an optional `fallback` (`paid` only in prod, `synthetic` only in dev) | `routing_sha`: SHA-256 of the file's bytes (`h4.routing.sha`) |
| `config/prices.yaml` | the Author | integer micro-USD per million tokens, per version. The active version is the latest whose `effective_from` is at or before the gateway clock, looked up per call. | `price_version` (`h4.price.version`) |
| `config/budgets.yaml` | the Author | this class's thresholds in micro-USD, and the limits and timing (§7) | – |
| `config/alerts.yaml` | the Author | channel order, retry schedule, reminder time, prefixes, stand-in endpoints ([alerts.md](contracts/alerts.md)) | – |

**Thresholds for prod**, pinned by a unit test:

| Meter | Ceiling | Warning (`warn_ratio` 0.70, rounded down to the micro-USD) |
|---|---|---|
| `day` | 5,000,000 | 3,500,000 |
| `month` | 20,000,000 | 14,000,000 |
| `fallback_day` | the row's `allowance_micro` (2,000,000 at the start of a day) | `allowance_micro` − (2,000,000 − 1,400,000), so 1,400,000 for the first grant |

Dev and dev-cpu (`H4_ENV=dev`) apply the same numbers to synthetic spend (FR-031, FR-036).

**From the environment.** Read at startup ([env-files.md](contracts/env-files.md)): `H4_STACK` and `H4_ENV` (the stack and its class, which must agree), `OPERATOR_TOKEN_SHA256` (§5), and the dev-only switches `GATEWAY_TEST_CLOCK`, `GATEWAY_TEST_SYNTHETIC_SPEND`, and `TELEMETRY_PAYLOAD_SAMPLING`. Any of these switches set outside `H4_ENV=dev` stops startup with exit 78 ([plan.md §5.8](plan.md#58-startup-refusals)).

## 5. The operator credential

| Property | Value |
|---|---|
| Format | `h4op_<scope>_` followed by 43 base64url characters (256 random bits, unpadded). The scope is `prod`, `dev`, or `devcpu`, for the stacks `prod`, `dev`, and `dev-cpu`. Pattern: `^h4op_(prod\|dev\|devcpu)_[A-Za-z0-9_-]{43}$`. Example shape: `h4op_prod_<43 base64url characters>`. |
| Where the token lives | prod and dev: `~/.config/h4reet-ai/operator/<stack>.token`, the token and a newline, mode 0600 in a 0700 directory, outside the repository. `make operator-token ENV=<stack>` writes it ([operator-admin.md §6](contracts/operator-admin.md#6-the-operator-cli-scriptsoperatorpy)). dev-cpu: the public dummy `H4_DEVCPU_OPERATOR_TOKEN` in `deploy/env.agents/dev-cpu.vars`. |
| Where the hash lives | `OPERATOR_TOKEN_SHA256` in the stack's env file: SHA-256 over the token's UTF-8 bytes, without the newline, as 64 lowercase hex characters. The gateway holds only this hash: never the token, in the store, the journal, logs, or telemetry. |
| Scope check | The gateway accepts only its own stack's prefix, checked before hashing. Then it compares the 32-byte digests with `crypto.timingSafeEqual` ([operator-admin.md §1](contracts/operator-admin.md#1-the-admin-listener-and-authentication)). |
| Fingerprint | The first 8 hex characters of the hash. They name the actor in `audit_log` (`operator:prod#<8 hex>`) and in confirmation alerts. |
| Startup refusals (exit 78) | `OPERATOR_TOKEN_SHA256` isn't 64 lowercase hex characters. On prod, it equals the published dev-cpu dummy's hash. The gateway source carries that hash as a constant, and a unit test checks it against `dev-cpu.vars`. |
| Who can use it | The Author's terminal only, through `scripts/operator.py`, stdlib Python run with `python3 -I`, so the token never passes through `node_modules` or `dist/` ([research.md R-16](research.md#r-16-the-operator-credential-a-bearer-token-per-stack-the-author)). The file and the variable name `H4_OPERATOR_TOKEN` are denied to agents (FR-007), and the collector masks `h4op_` tokens (FR-029). |
| Rotation | Delete the token file, mint again, put the new hash in the env file, restart the gateway. |

## 6. State machines

### 6.1 The kill switch (`stack_state.state`)

At request start the gateway reads the row with no cache. An unreachable store counts as unknown, and a missing row as uninitialized; both are treated as `degraded` (fail closed, FR-022, FR-031).

| From | Event | Guard | To | Who or what triggers it | Written in the same transaction |
|---|---|---|---|---|---|
| no row | `POST /admin/init` | a reason of at least 10 characters; records, stated values, or `confirm_zero` (§8) | `normal` | the operator (FR-031: initialization is a reset under FR-034) | `stack_state`, the rebuilt meter rows, the audit row, the `operator_action` alert |
| `normal` | a commit crosses the day or month ceiling | old spend < ceiling ≤ new spend | `degraded` | the gateway, with no human action (FR-033) | `since`, `crossed`, the meter's `reached_at`, the `trip` alert, the `incidents` row, the `trip` audit row |
| `degraded` | a commit crosses the other ceiling | the same | `degraded` (`since` unchanged) | the gateway | `crossed` gains the second ceiling; its own trip alert and incident |
| `degraded` | `POST /admin/reset` | a reason of at least 10 characters | `normal` | the operator (FR-034) | `since`, `crossed` emptied, the audit row, the `operator_action` alert |
| `normal` | `POST /admin/reset` | – | refused: 409 `not_degraded` | – | nothing |
| any | the UTC day or month rolls over | – | unchanged | nothing: rollover is lazy (§7.6) | new meter rows only, at the next admission |
| any | restart, `make down` and `make up` | – | unchanged | – | nothing: the row is on the store's volume |
| any | the store is unreachable | – | unknown, treated as `degraded` (`store_unreachable`) | – | nothing can be written; one in-memory alert after 60 s ([alerts.md](contracts/alerts.md)) |
| any | the store's volume is lost | – | no row, treated as `degraded` (`store_uninitialized`) | – | the journal survives for the rebuild |

**What a reset does and doesn't do:**
- It restores `normal`, so local answers resume at once.
- It doesn't touch the meters, so a metered call is still refused with `meter_at_ceiling` while any meter is at or above its ceiling. Admission checks levels, not the state (FR-034, US2-4).
- It doesn't renew fallback: renewal is a separate action (ADR 0001).
- Crossing is edge-triggered (old < threshold ≤ new), so spend that is already above a ceiling can't trip again after a reset. A new period can.

**What a rollover does and doesn't do:**
- It starts new `day`, `month`, and `fallback_day` rows at zero, and a new `fallback_day` row at `allowance_micro` 2,000,000 and `grant_no` 1.
- It never changes `state`, `crossed`, or `fallback_awaiting_renewal` (FR-030, FR-033, US2-5).

### 6.2 The fallback sub-budget (`fallback_awaiting_renewal` and today's `fallback_day` row)

The states:
- **available:** the flag is false. A fallback call is admitted while today's fallback spend plus reservations is below `allowance_micro`.
- **awaiting renewal:** the flag is true. Every fallback call is refused with `fallback_awaiting_renewal`, across rollovers and restarts.

The renewal rule is binding decision 13 ([research.md R-15](research.md#r-15-same-day-renewal-grants-a-fresh-2-at-once-the-author)): a renewal sets today's allowance to today's fallback spend plus reservations plus 2,000,000. Exactly $2 more is then available from that moment, whatever the day, and always inside the $5 daily ceiling (FR-030).

| From | Event | Guard | To | Who or what | Effects, in the same transaction |
|---|---|---|---|---|---|
| available | a fallback commit | old < allowance − 600,000 ≤ new | available | the gateway | a `warn` alert for grant n (`…:fallback_day:<day>:g<n>`) and `warned_at` |
| available | a fallback commit | old < allowance ≤ new | awaiting renewal | the gateway (FR-030) | flag true, `fallback_awaiting_since`, `reached_at`, the `fallback_exhausted` alert (`:g<n>`), the audit row |
| available | a fallback admission | spent + reserved ≥ allowance (reservations fill the rest of the grant) | available, call refused with `fallback_spent_today` | – | nothing: in-flight calls commit or expire, and the commit that reaches the allowance sets the flag |
| awaiting renewal | `POST /admin/renew` | a reason of at least 10 characters | available | the operator (FR-030, FR-034) | today's row: `allowance_micro` = spent + reserved + 2,000,000, `grant_no` + 1; the flag cleared; the audit row; the `operator_action` alert |
| available | `POST /admin/renew` | – | refused: 409 `not_awaiting_renewal` | – | nothing. `init --renew` is the only other way to clear the flag. |
| no row | `POST /admin/init` | without `renew` | awaiting renewal | the operator (FR-031) | flag true |
| no row | `POST /admin/init` | with `renew` | available | the operator | allowance = the rebuilt fallback spend + 2,000,000 |
| available | the UTC day rolls over | – | available, with $2 | nothing | a new row at 2,000,000, grant 1: "a day that ends without running it out starts the next with the full $2" (FR-030) |
| awaiting renewal | the UTC day rolls over | – | awaiting renewal | nothing | a new row, but the flag still refuses fallback |
| any | restart | – | unchanged | – | today's spend and the flag come from the store (US5-6, US5-7) |

Worked cases (ADR 0001):

| Case | `allowance_micro` | Available |
|---|---|---|
| A day starts | 2,000,000 | $2.00 |
| $2.00 spent; the flag is set; a same-day renewal | 2,000,000 + 0 + 2,000,000 = 4,000,000 | $2.00, at once |
| A renewal on a later day, before any fallback spend | 0 + 0 + 2,000,000 = 2,000,000 | $2.00, not $4.00 |
| $4.00 of fallback spent after one renewal; a second same-day renewal | 6,000,000 | $1.00 in practice: the $5 daily ceiling trips first |
| 1,950,000 spent, 100,000 reserved, then a renewal (an overshoot) | 4,050,000 | $2.00 measured from spend plus reservations, so the overshoot doesn't shrink the next grant |

Warnings fire once per grant, at 70% of it: 1,400,000 for grant 1, then the new allowance minus 600,000 after each renewal (3,400,000 in the second case).

## 7. Transactions and background work

### 7.1 Request start

```sql
SELECT state, since, crossed, fallback_awaiting_renewal, fallback_awaiting_since, test_clock_offset_ms
FROM gateway.stack_state WHERE id = 1;
```

- No cache, on every `/hello`, every admin call, and every metered admission (US2-7).
- An error or timeout is `store_unreachable`. No row is `store_uninitialized`. `state = 'degraded'` is `kill_switch_tripped`.
- The read also yields the gateway clock for the request.
- A request in flight when the state flips completes: the state was read at its start (the spec's edge case).

### 7.2 Admission for a metered call

Used for `fallback`, `metered`, and `test` calls. Local calls are never admitted, because they are free (§7.4).

**The maximum cost.** Before the transaction, the gateway computes the call's maximum cost, `max_micro`, at the active price version:

```text
cost(usage)  = ceil((input × p_in + output × p_out + cache_read × p_cache) / 1,000,000)
               (BigInt; prices in micro-USD per million tokens; rounded up once, on the sum)
max_micro    = max( cost({input: per_call.max_input_chars, output: req.maxOutputTokens, cache_read: 0}),
                    cost(adapter.fixedUsage)   when the adapter declares one (the synthetic adapter) )
```

The input cap counts each of the 2,000 input characters allowed as one token. The output cap is the request's `maxOutputTokens`: 128 for hello, at most 512. The synthetic adapter always reports 1,000 output tokens at $100 per million, so it declares that usage and each of its calls reserves exactly 100,000, its real cost ([provider-adapter.md §2](contracts/provider-adapter.md#2-the-typescript-interface)). If a provider reports more usage than was reserved, the commit charges what it reports. The reservation bounds only concurrency at a ceiling: overshoot stays within 4 calls in flight times the maximum per call ([plan.md §5.4](plan.md#54-state-store-meter-and-kill-switch)).

**In memory, before the transaction.** Each check takes its slot at once (the event loop makes check-and-take atomic), and a refusal or compensation gives it back:
1. Hello only: this client has fewer than `per_client.metered_in_flight` (1) metered calls in flight. Otherwise 429 `client_cap_exceeded`.
2. Fewer than `global.metered_in_flight` (4) metered calls are in flight across all clients. Otherwise 429 `metered_capacity_exceeded`.
3. Fewer than `global.metered_per_minute` (60) metered admissions in the last 60 s of real time. Otherwise 429 `metered_capacity_exceeded`.

**The transaction:**

```text
BEGIN
 1. SELECT * FROM gateway.stack_state WHERE id = 1 FOR UPDATE
      no row → ROLLBACK; store_uninitialized
 2. now := real time + test_clock_offset_ms;  day := YYYY-MM-DD(now);  month := YYYY-MM(now)
 3. Sweep: DELETE FROM gateway.reservations WHERE expires_at <= now RETURNING *
      settle each returned row at its maximum (§2.4): subtract it from reserved_micro, insert its
      ledger row (cost_basis 'expired'), add max_micro to spent_micro, and evaluate the crossings (§7.3 step 6)
 4. INSERT INTO gateway.meters (meter, period_key, allowance_micro, grant_no) VALUES
        ('day', day, NULL, NULL), ('month', month, NULL, NULL), ('fallback_day', day, 2000000, 1)
      ON CONFLICT (meter, period_key) DO NOTHING             -- 2000000 = budgets' fallback_daily_usd
    SELECT * FROM gateway.meters WHERE (meter, period_key) IN (…) FOR UPDATE
 5. Refuse with the first cause that applies, and ROLLBACK:
      state <> 'normal'                                                      → kill_switch_tripped
      day.spent + day.reserved >= ceiling(day)  or  month.spent + month.reserved >= ceiling(month)
                                                                             → meter_at_ceiling
                     (ceilings from budgets.yaml: 5000000 and 20000000 for both classes)
      fallback only: fallback_awaiting_renewal                               → fallback_awaiting_renewal
      fallback only: fb.spent + fb.reserved >= fb.allowance                  → fallback_spent_today
      the adapter's cached health is unhealthy, or its circuit is open       → fallback_unavailable
 6. INSERT INTO gateway.reservations (id, attribution, adapter_id, provider, model, price_version,
        max_micro, period_day, period_month, created_at, expires_at)
      VALUES (…, now, now + reservation_ttl_s)
 7. UPDATE gateway.meters SET reserved_micro = reserved_micro + max_micro, updated_at = now
      on day and month, and on fallback_day when attribution = fallback
COMMIT
 8. Append the journal's `reserve` record and fsync it (§3).
      On failure: BEGIN; lock stack_state; DELETE the reservation; subtract it from its rows; COMMIT;
      refuse with journal_unwritable.
 9. Call the adapter within the request's deadline, then commit (§7.3).
```

- **Precedence.** The order in step 5, followed by `journal_unwritable`, is the precedence of the degraded causes when more than one applies. The `kill_switch_tripped` check repeats the request-start read under the lock, which catches a trip that landed in between.
- **The level checks** use the existing reservations, not the new one. The first call admitted near a ceiling can therefore pass it. That is the bounded overshoot, and the commit that crosses the ceiling trips the switch.

### 7.3 Commit of a metered call

The cost depends on how the call settled:

| The call | `cost_micro` | `cost_basis` |
|---|---|---|
| returned a result | `cost(usage)` at the reservation's price version | `usage` |
| failed with `possiblyBilled` (any timeout) | `max_micro` | `reservation` |
| failed otherwise | 0 | `none` |

```text
BEGIN
 1. SELECT * FROM gateway.stack_state WHERE id = 1 FOR UPDATE
 2. IF a ledger row with reservation_id = $rid exists → COMMIT (already committed; the retry is a no-op)
 3. DELETE FROM gateway.reservations WHERE id = $rid RETURNING max_micro
      if a row came back, subtract it from reserved_micro on its rows
      (if it is gone, a sweep already settled it and step 2 has returned)
 4. INSERT INTO gateway.ledger (…, reservation_id = $rid, cost_micro, cost_basis,
        period_day, period_month = the reservation's)
 5. UPDATE gateway.meters SET spent_micro = spent_micro + cost_micro, updated_at = now
      on the reservation's rows, keeping each row's old and new spend
 6. Evaluate the crossings below, writing each effect.
 7. NOTIFY alert_outbox, if step 6 inserted an outbox row.
COMMIT
 8. Append the journal's `commit` record and fsync it. A failed append doesn't undo the commit.
      The next metered admission's `reserve` append fails too, so metered calls stop until the journal
      is writable again.
 9. Release the in-memory slots, and add cost_micro to h4.cost.usd.
```

Crossings in step 6. Each fires only when the old value is below the threshold and the new one is at or above it:

| Meter | Threshold | Effect |
|---|---|---|
| `day` | warning, 3,500,000 | `warn` alert `<stack>:warn:day:<day>`; `warned_at` |
| `month` | warning, 14,000,000 | `warn` alert `<stack>:warn:month:<month>`; `warned_at` |
| `fallback_day` | grant warning, allowance − 600,000 | `warn` alert `<stack>:warn:fallback_day:<day>:g<grant_no>`; `warned_at` |
| `day` or `month` | ceiling, 5,000,000 or 20,000,000 | **trip**: `reached_at`; if `state = 'normal'`, then `state = 'degraded'` and `since = now`; `crossed` gains `<meter>:<period_key>`; a `trip` alert `<stack>:trip:<meter>:<period_key>`; an `incidents` row (`queued`); a `trip` audit row (actor `gateway`) |
| `fallback_day` | the allowance, while the flag is false | **exhaustion**: `reached_at`; flag true; `fallback_awaiting_since = now`; a `fallback_exhausted` alert `<stack>:fallback_exhausted:fallback_day:<day>:g<grant_no>`; a `fallback_exhausted` audit row |

Degradation is committed before any delivery is attempted: the alert rows are in the same transaction, and the dispatcher reads them afterwards (FR-032, FR-033; [plan.md §5.6](plan.md#56-alerts-and-incidents)).

**If the commit transaction fails.** This happens when the store becomes unreachable during the call. The gateway keeps the settled call in memory and retries the commit every 2 s until the reservation's `expires_at`. The commit is idempotent (step 2). It doesn't need the reservation row, so a late retry still charges the call. Meanwhile:
- hello returns the answer it already has: the call happened, and new requests fail closed on `store_unreachable` anyway;
- the span and the log record the pending commit.

If the process stops first, the reservation stays counted as reserved, which still refuses admissions at a ceiling. Once it expires, the sweep charges its maximum (§2.4), within 10 s of `expires_at`.

### 7.4 Local and other unmetered calls

`INSERT INTO gateway.ledger (…, attribution = 'none', cost_micro = 0, cost_basis = 'none', reservation_id = NULL)` runs in its own transaction, without the state lock. This covers successful local calls, failed local attempts before a failover (`outcome = 'error'`), and local calls through the admin endpoint. If the insert fails, the answer is still returned and the failure is logged. The call cost nothing, and its span still carries the FR-023 fields.

### 7.5 Operator transactions

Each locks `stack_state` first. Each writes its audit row and its `operator_action` alert in the same transaction, then appends an `operator` journal record. A failed journal append is reported in the response and in the audit row's `detail`, and doesn't undo the action. The HTTP side, with its 409s, is in [operator-admin.md §2](contracts/operator-admin.md#2-operator-writes).

- **Reset:**
  1. No row means 409 `store_uninitialized`. `state = 'normal'` means 409 `not_degraded`.
  2. `UPDATE stack_state SET state = 'normal', since = now, crossed = '{}'`.
  3. The audit row's `detail` lists the meters still at or above a ceiling. The response says metered calls stay refused while they are.
- **Renew:**
  1. No row means 409 `store_uninitialized`. A false flag means 409 `not_awaiting_renewal`.
  2. Sweep expired reservations (§7.2 step 3), and upsert today's `fallback_day` row.
  3. `UPDATE meters SET allowance_micro = spent_micro + reserved_micro + <fallback_daily>, grant_no = grant_no + 1` on today's `fallback_day` row, where `<fallback_daily>` is `fallback_daily_usd` in micro-USD (2,000,000).
  4. `UPDATE stack_state SET fallback_awaiting_renewal = false, fallback_awaiting_since = NULL`.
  5. The audit row and the journal record both carry the new allowance and grant (ADR 0020).
  6. A renewal doesn't need `state = 'normal'`. On a degraded stack it clears the flag, but fallback stays refused by `kill_switch_tripped` until a reset.
- **Test clock** (dev only, [operator-admin.md §3](contracts/operator-admin.md#3-dev-only-test-machinery)):
  1. The new gateway time must be at or after the current one, else 409 `clock_backwards`.
  2. `test_clock_offset_ms` = new time − real time. It never decreases.
  3. The audit row is `test_clock`, and a `clock` journal record follows. No alert.

### 7.6 Rollover

Rollover is lazy. Period keys come from the gateway clock in UTC at each admission and renewal. A new period's rows are created by the upsert in §7.2 step 4. Nothing runs at midnight, and nothing in rollover touches `state`, `crossed`, or the renewal flag (FR-030, FR-033). A call charged to a period keeps that period's keys through its commit, even if the commit lands after midnight.

### 7.7 Background work in the gateway process

| Task | Every | Reads | Writes |
|---|---|---|---|
| Gauges | 10 s | `stack_state`, the current meter rows, adapter health | the `h4.*` gauges in §2.2 and §2.3 |
| Reservation sweep | 10 s | `reservations` past `expires_at` | the settlement in §2.4, under the state lock, only when an expired row exists |
| Local health check | 1 s ([provider-adapter.md §3](contracts/provider-adapter.md#3-the-shipped-adapters)) | the model server | in-memory health, `h4.adapter.healthy` |
| Paid adapter health | 10 s | credentials, the circuit breaker | in-memory health. On a transition to unhealthy, a `fallback_unavailable` outbox row; at 2 h before the SSO session ends, a `credentials_expiring` row. |
| Reminder | 10 s | `stack_state`, the gateway clock | at or after 09:00 UTC, while degraded or awaiting renewal, one `reminder` row a day |
| Dispatcher | `LISTEN alert_outbox`, or 2 s | due outbox rows | delivery columns ([alerts.md §4](contracts/alerts.md#4-channels-delivery-and-retries)) |
| Incident drafts | 10 s | `incidents` rows still `queued` | the draft file, then `status`, `path`, `sha256` ([alerts.md §7](contracts/alerts.md#7-incident-drafts-fr-035)) |
| Store outage | each failed store access | – | after 60 s of continuous failure, one in-memory `store_unreachable` alert |
| Migrations | 5 s, only until they have run | – | §2.1 |

## 8. Initialization (FR-031)

A store found empty (no `stack_state` row) leaves the runtime degraded with `store_uninitialized` until the operator initializes it. `make up` prints the command and never initializes anything itself ([plan.md §4](plan.md#4-environment-files-preflight-and-the-stack-targets)). Initialization is a reset under FR-034: the operator credential, a reason, an audit row. Nothing sets the meters to zero silently.

**Request:** `POST /admin/init` with `reason`, optional `stated` values (`day_usd`, `month_usd`, `fallback_today_usd`), `confirm_zero`, and `renew` ([operator-admin.md §2.3](contracts/operator-admin.md#23-post-admininit)).

**Steps:**
1. **Preconditions.** An existing row means 409 `already_initialized`. A journal directory that exists but can't be read means 409 `journal_unreadable`; fix its permissions first. A missing directory means a new host: no records.
2. **The clock** (dev only). The newest `clock` record in the journal sets `test_clock_offset_ms`. The rebuilt periods are then the ones the journal was written in, which is what breach-test step 11 needs. Prod has no `clock` records; if one appears there, it is skipped and counted.
3. **Current periods**, from the gateway clock: today and this month.
4. **Candidates** for each meter (`day`, `month`, `fallback_day`):

   | Source | Candidate |
   |---|---|
   | the surviving ledger | the sum of `cost_micro` for the current periods by attribution, plus any rows left in `reservations` at their `max_micro` |
   | the journal (§3) | committed calls at their cost, and reservations with no commit at their maximum |
   | the operator's stated values | `day_usd`, `month_usd`, `fallback_today_usd`, converted exactly to micro-USD |

5. **The max rule.** Each meter takes the largest candidate. A stated value can raise a meter but never lower it below what was rebuilt.
6. **The allowance** is neither summed nor maxed ([ADR 0020](../../docs/adr/0020-gateway-state-store-and-meter.md)). It is the value of today's last renewal, with its grant number, from the journal (or the surviving audit log). With no renewal today, it is 2,000,000 and grant 1.
7. **Zero needs confirming.** Suppose the ledger has no rows this month, the journal has no `reserve` or `commit` records in the files read, and nothing is stated. Then initialization refuses with 409 `confirm_zero_required` unless `confirm_zero` is true. `confirm_zero` goes into the audit row's `detail`.
8. **The write**, in one transaction:
   - `stack_state`: `state = 'normal'`, `crossed = '{}'`, `since = initialized_at = now`, `initialized_by` = the actor, `fallback_awaiting_renewal = NOT renew`, and in dev the restored clock offset;
   - the current meter rows, with `spent_micro` from the max rule and `reserved_micro = 0`;
   - with `renew`: today's `allowance_micro` = the rebuilt fallback spend + 2,000,000, and `grant_no` + 1;
   - the `init` audit row, with every candidate by source, the chosen values, `confirm_zero`, `renewed`, and the journal lines skipped;
   - the `operator_action` alert.
9. **The journal.** After the commit, an `operator` record with action `init`.

**Results:**
- Renewal stays pending unless `renew` was given, whatever the fallback spend. A wipe never grants fallback by itself (FR-031).
- A meter rebuilt at or above its ceiling refuses metered calls with `meter_at_ceiling`. It isn't a trip, because no commit crossed it.

**A journal from an earlier run.** A dev journal outlives the store, so a breach test that wipes the store and initializes again rebuilds the meters of the last run's periods. The test therefore sets its clock to a month after the gateway's current time (read from `GET /health`), whose periods have no records. [plan.md §8](plan.md#8-the-breach-test) and [quickstart.md](quickstart.md) carry the steps.

## 9. The spec's Key Entities in spec 000

The spec lists these entities "as defined in the constitution and `docs/how-we-build/lifecycle.md`". Here is where each one lives concretely.

| Entity | Where it lives in spec 000 | Contract or section |
|---|---|---|
| Agent Role | `.claude/agents/*.md`, each with an explicit `tools:` allowlist (FR-006). The patch adds hook-enforced write scopes from `agent_type`. `tools/gates/roles.expected` pins each role's tools for the static agent-config eval. | [plan.md §13](plan.md#13-the-forbidden-action-matrix), [plan.md §15](plan.md#15-the-enforcement-layer-patch) |
| Policy Hook | `.claude/hooks/` (`bash-gate.sh`, `protected-paths.sh`, the new `content-scan.sh`, `post-edit-check.sh`), `.claude/git-hooks/` (`reference-transaction`, `pre-commit`), and the forbidden-action matrix that proves them (FR-008, SC-003) | [plan.md §13](plan.md#13-the-forbidden-action-matrix) |
| Provider Adapter | the `ProviderAdapter` interface in `services/gateway/src/core/types.ts`. Its modules are `src/adapters/local-openai.ts`, `bedrock-converse.ts`, and `synthetic.ts`, found by `src/adapters/registry.ts`. The contract suite is `test/contract/adapter-contract.ts` (FR-021, FR-024). | [provider-adapter.md](contracts/provider-adapter.md) |
| Routing Policy | `config/routing.yaml`, executed by `Gateway.complete` in `src/core/gateway.ts` and `src/core/router.ts` in FR-022's order | [config-files.md §1](contracts/config-files.md#1-configroutingyaml), [gateway-http.md §2](contracts/gateway-http.md#2-post-hello) |
| Model Call Record | a `gateway.ledger` row (§2.5), the `chat {gen_ai.request.model}` client span with the same fields, and, for metered calls, the journal's `reserve` and `commit` records (FR-023) | §2.5, §3, [telemetry.md](contracts/telemetry.md) |
| Budget | the thresholds in `config/budgets.yaml` and the prices in `config/prices.yaml` (both human-only), enforced through the `gateway.meters` rows and today's `fallback_day` allowance (FR-030, FR-031) | §2.3, §4, [config-files.md](contracts/config-files.md) |
| Kill Switch State | the `gateway.stack_state` row: `state`, `crossed`, and the renewal flag. It is read at every request start, and unknown counts as `degraded` (FR-022, FR-031, FR-033). | §2.2, §6.1 |
| Control Band | the first band, cost. Detection is deterministic, in the commit transaction (§7.3). At 70%, a `warn` alert. At 100%, `degraded`, a `trip` alert, and an incident `intent.md` draft. Restoring service takes an operator reset. Detection never involves a model (lifecycle.md). | §7.3, [alerts.md](contracts/alerts.md) |
| Dashboard | Grafana's `h4-runtime`, provisioned from `deploy/grafana/dashboards/h4-runtime.json`. It reads Prometheus for spend, state, and requests, Loki for logs, and `gateway.audit_log` and `v_state` through `grafana_ro` (FR-028, FR-034, FR-037). | [telemetry.md](contracts/telemetry.md), §2.9 |
