# Contract: the studio's GPU window

Spec 003's FR-035 and SC-011; plan §6; research R-14. Builds on spec 000's operator interface (its contracts/operator-admin.md): the same token, listener, audit, and refusals. Where this file and spec 000's contracts would disagree, spec 000's conventions hold, and this file follows them (§5 lists what it adds to spec 000's lists).

(Updated by tasks.md T034 to T036, on `feat/003-us6-gpu-window`, where building it met spec 000's rules: the answer carries `action`, `audit_id`, and `journal`, as every operator write's does; the gauge carries no attribute, since the stack is every series' resource attribute; the window's state is the store's newest `studio_window` audit row; the panel reads a view of the store through `grafana_ro`; and `end` waits for the gateway to see the local model healthy before its one hello. The first draft's 200 was `{ "window", "since" }`, and its gauge `h4_studio_window{stack}`. The plan's review, on `spec/003-studio-assets` at 0f1e8b1, gave the server span its `h4.studio_window.state`, and the matrix its spellings; both are kept below.)

## 1. The endpoint

`POST /admin/studio-window` on the gateway's admin listener, on prod, and on dev-cpu for rehearsals and tests. dev's listener doesn't serve it, so after authentication it answers as for any path it doesn't serve, 404 `{"error":"not_found"}`: dev routes no fallback to hand hello to.

| Body field | Allowed |
|---|---|
| `state` | `start` or `end` |
| `reason` | spec 000's reason rule (operator-admin.md §1.2): 10 to 500 code points after trimming, no control characters |

No other field: anything else is 400 with `"field": "body"`.

| Answer | When |
|---|---|
| 200, below | recorded |
| 409 `already_open` | `start` while a window is open; the body adds `detail` and `since`, the open window's start |
| 409 `not_open` | `end` while none is open; the body adds `detail` |
| 409 `store_uninitialized` | no `stack_state` row, as for every operator write (operator-admin.md §2.1) |
| 400 `invalid_request`, 401, 415, 503 `store_unreachable` | as spec 000's operator writes (operator-admin.md §1) |

200 for `start`:

```json
{
  "action": "studio_window",
  "audit_id": 57,
  "state": "start",
  "window": "open",
  "since": "2026-11-02T20:14:03Z",
  "note": "The window is open. Hello falls back within the sub-budget, or degrades, once the model server stops.",
  "journal": "ok"
}
```

200 for `end`:

```json
{
  "action": "studio_window",
  "audit_id": 58,
  "state": "end",
  "window": "closed",
  "since": "2026-11-02T21:02:40Z",
  "opened": "2026-11-02T20:14:03Z",
  "fallback": { "spent_micro_usd": 2700, "calls": 1 },
  "note": "The window is closed. Its fallback spend: $0.0027 in 1 call.",
  "journal": "ok"
}
```

- **`since`** is when the window took its new state, on the gateway clock, to the second. **`opened`** is the closed window's start.
- **`fallback`** is the ledger's fallback spend inside the window: the rows with `attribution = fallback` from the start's own time up to the end's, in micro-USD and calls, the same sum §3's panel shows.
- **`journal`** is the append's result, `ok` or `unwritable`, as every operator write reports it (operator-admin.md §1.3).

**The window's state** is the store's newest `studio_window` audit row: `open` after a `start`, `closed` after an `end`, and closed when there is none. There is no state column: the audit log is already the record, and it survives a restart, so a prod restarted inside a window (as `end` does) still reads open. Each write locks `stack_state` first, as every operator write does (spec 000's data-model.md §2.1), so two writes can't both open a window.

**Effects of a 200**, as spec 000's operator writes have them (operator-admin.md §1.3):

| What | Value |
|---|---|
| Audit row | `action = studio_window`, the actor, the reason; `before` and `after`: `{"window": "closed"}` and `{"window": "open", "since": …}` for a start, the reverse for an end; `detail`: `{"state"}`, and for an end `opened`, `fallback_micro`, and `fallback_calls`. In the same transaction as the alert. |
| Journal record | `kind = operator`, `action = studio_window`, `state`, `audit_id`, `actor`, `period_day`, `period_month`, after the commit. A rebuild (spec 000's data-model.md §8) reads it and counts nothing from it. |
| Alert | `operator_action`, dedupe key `<stack>:operator_action:studio_window:<audit_id>`, with the meters line; the headline "OPERATOR ACTION: studio GPU window opened by operator #<fingerprint>", or "… closed …"; the runbook `docs/runbooks/studio-gpu-window.md`. Never the reason. |
| Gauge | `h4.studio.window` (Prometheus `h4_studio_window`), unit `{flag}`, no attributes: 1 while a window is open, 0 otherwise. The stack is the resource's `deployment.environment.name`, promoted to `deployment_environment_name`, as on every gateway series (spec 000's telemetry.md §2). Like the meter gauges, it isn't observed while the store can't be read; the 10 s refresh and each operator write update it. |
| Counter | `h4.operator.actions` with `h4.action = studio_window` |
| Log | `operator.studio_window`, `event.name = h4.audit`, with `audit_id`, `actor`, `action`, `reason`, `before`, and `after` |
| Span | the server span spec 000's telemetry.md §3.3 gives "`POST /hello` and the admin routes": `http.route = /admin/studio-window`, `http.response.status_code`, `h4.stack`, and `h4.outcome`: `ok` for a 200, `refused` for a 409, `invalid` for a 400 or 415, `unauthorized` for a 401, and `error` with `error.type = store_unreachable` for a 503. It adds `h4.studio_window.state`, `start` or `end`, once the body has a valid state, so a refused start reads apart from a refused end; a 401, a 415, and a body with no valid state have none. Never the reason's text, which goes to the audit row and the `h4.audit` log record only; no body, and no query string. |

It changes no meter, budget, ceiling, or routing.

## 2. The command

`make studio-window ENV=prod STATE=start|end REASON="…"`, the Author's. Agent sessions run it on dev-cpu only: the recipe refuses any other stack inside the sandbox, as the operator targets do, and bash-gate refuses it for any stack but dev-cpu, as it refuses `operator-*` (this branch's patch). `ENV=dev` is refused with exit 2. `STATE` and `REASON` come from the command line only.

- **`start`:**
  1. The operator CLI's `studio-window start` records the window.
  2. Only once it is recorded, `docker compose … stop` stops the model server: `model-server-gpu` on prod, `model-server-cpu` on dev-cpu (through the relay, inside the sandbox). Hello then falls back within the sub-budget, or degrades, as spec 000 routes it.
  3. A refused record (409 `already_open`, a 401, no answer) stops nothing. A stop that fails leaves the window open and says so: close it with `STATE=end`, which brings the stack back, then start again.
- **`end`:**
  1. prod starts again at its run file's commit, `make up ENV=prod REF=<H4_REF>` (dev-cpu: `make up ENV=dev-cpu`), which waits for every service's health, the model server's included.
  2. It waits, up to 60 s, until the gateway sees the local model healthy (`operator.py status` reads `local healthy`), so the one hello isn't spent on fallback.
  3. It sends one hello (`scripts/hello.py`), and goes on only when the answer is a 2xx whose top-level `route` is `local`.
  4. Then the CLI's `studio-window end` records the end.
  5. Any step that fails leaves the window open, says which step, and records nothing.

The CLI command: `operator.py --stack prod|dev-cpu studio-window start|end --reason TEXT [--json]`. It refuses `--stack dev` with exit 2, checks the reason before any call, and inside the sandbox makes the dev-cpu hop, as every command does. Its exit codes are operator-admin.md §6.2's: a 409 is exit 1. The state is a positional, not a `--state` option: bash-gate reads any `--s…` option on this CLI's command line as an abbreviation of `--stack`, so `--state end` would have refused even dev-cpu's command (found by the matrix's allow row while this was built).

## 3. The dashboard

`deploy/grafana/dashboards/h4-runtime.json`, in its own row, "Studio GPU windows", above the dev-time row:

- **An annotation,** "Studio GPU windows", on every time series of the dashboard, from the gauge: `max(h4_studio_window) > 0` on `prom`, so a window shows as a shaded region from its start to its end.
- **A panel,** from the store, so it still answers when telemetry is down:

| Panel | Type | Query |
|---|---|---|
| Fallback spend in studio windows (FR-035, SC-011) | table (SQL) | `SELECT started_at AS "time", ended_at, fallback_micro / 1e6 AS fallback_usd, fallback_calls FROM gateway.v_studio_windows WHERE started_at <= $__timeTo() AND (ended_at IS NULL OR ended_at >= $__timeFrom()) ORDER BY started_at DESC LIMIT 50` |

- **`gateway.v_studio_windows`** (migration `0003_studio_window`): one row per window, from the `studio_window` audit rows, each start with the end that follows it: `started_at`, `ended_at` (null while open), and the ledger's `attribution = fallback` rows in between, as `fallback_micro` and `fallback_calls`. It runs with its owner's rights, as `v_state` does, and `grafana_ro` gets SELECT on it and nothing more. It shows no client label and no reason.
- `deploy/scripts/test_dashboard.py` reads this section's table and annotation, as it reads spec 000's telemetry.md §7.

## 4. Tests

- **The gateway's integration tests** (`services/gateway/test/integration/studio-window.test.ts`): start, end, both 409s, the audit row, the journal record, the alert, the gauge, the view, and no meter, budget, or state changed; the reason and body rules; dev's 404; and the SERVER span, with its state and outcome and no reason text (`test/integration/telemetry-sdk.test.ts`).
- **The operator CLI's tests** (`scripts/test_studio_window.py`): the command's arguments, the reason's length, the stack refusals, and the dev-cpu hop; and the make target's refusals and order, with stand-ins for docker and Python.
- **The matrix** (`redteam/forbidden-actions.sh`): `make studio-window` refused for prod and dev in its plain spelling and in others (`make -C . studio-window ENV=prod …`, `bash -c 'make studio-window ENV=dev …'`, a variable carrying the stack, no `ENV` at all, which is prod, and a quoted part of the name), and the operator CLI's command called directly, which the existing rule already refuses; allowed for dev-cpu; planned until the bash-gate patch lands; and gap rows for the spellings the rule can't see (a target name built at run time, or held in a variable), as CLAUDE.md asks of every bash-gate rule.
- **SC-011** is the Author's rehearsal ([quickstart.md §4](../quickstart.md#4-group-4-the-gpu-window-fr-035-sc-011)).

## 5. What this adds to spec 000's lists

Spec 000's contracts name closed lists. This window adds one entry to each, here rather than in spec 000's files:

| Spec 000's list | Adds |
|---|---|
| data-model.md §2.6, the audit actions, and the operator writes that carry a reason | `studio_window`, through migration `0003_studio_window` |
| data-model.md §3, the journal's `operator` record actions | `studio_window`, with `state` |
| operator-admin.md §1.3, what each write produces | §1's effects table |
| operator-admin.md §4.2 and §6, the audit actions `GET /admin/audit` and `operator.py audit --action` take | `studio_window` |
| operator-admin.md §6, the CLI's commands, and §6.1, the make targets | `studio-window`, and `make studio-window` |
| alerts.md §2 and §3, the `operator_action` alert's actions | `studio_window` |
| telemetry.md §4.1, the gateway's instruments, and `h4.operator.actions`' values | `h4.studio.window`, and `studio_window` |
| telemetry.md §3.3, the server span's attributes | `h4.studio_window.state`, on this route's span only |
| telemetry.md §5.2, the log events | `operator.studio_window` |
| data-model.md §2.9, what `grafana_ro` reads | `gateway.v_studio_windows` |
