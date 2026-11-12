# Data model: the shared state, the routes per host, the handover, and the records

Phase 1 output of `/speckit-plan`, drafted on 2026-11-09 for the Author's review. It replaces the September data model (`data-model.md` at 00309c47), whose `cloud` stack, `prod-cloud` route class, and `infra` attribution this design doesn't need. It defines:
- **the shared state:** spec 000's store, moved to Postgres in a container on the tunnel end (amended 2026-11-12; spec.md Assumptions, "The shared state on the tunnel end"), and migration 0007;
- **the route per host** and the environment key that selects it;
- **the relay's memory;**
- **the records:** handovers, releases, deployments, plans, applies, audits, and the public view's document;
- **the state machines:** the serving host, EC2's instance, the tunnel end's instance, and the autostart switch.

The relay runs on the tunnel end and picks the host, by the Author's answer to the plan's question 1. The tunnel end runs on spot, by his answer to question 2.

## 1. The shared state (spec FR-017, FR-019; research.md R-20)

### 1.1 Where it lives

(amended 2026-11-12; spec.md Assumptions, "The shared state on the tunnel end") One Postgres 17, the tunnel end's `shared-state` service, on spec 000's pinned image and its own encrypted data volume (contracts/shared-state.md §1), holding spec 000's `gateway` schema (`services/gateway/migrations/0001` to `0006`) and 0007 below. Both production hosts use it with `H4_STACK=prod` (research.md R-28), so `gateway.stack_state`'s one row (`CHECK (id = 1)`) is the one kill switch, and `gateway.meters` holds the one `day`, `month`, and `fallback_day` per period. Dev and dev-cpu keep their own local `gateway-state`, unchanged.

| Who | Role | Reaches it |
|---|---|---|
| EC2's gateway | `gateway` (spec 000's owner role) | in the VPC, at the tunnel end's private address, TLS verified against the shared state's CA, as `shared-state` |
| The laptop's gateway | `gateway` | through the tunnel's `-L 5432` to `shared-state:5432`, TLS verified against the same CA, as `shared-state` |
| The relay, on the tunnel end | `relay_ro`, `relay_rw` (new) | over the tunnel end's compose network, TLS verified the same way |
| Grafana on each host | `grafana_ro` (spec 000's) | as its gateway does |
| The operator's commands | `gateway` | through the laptop prod's admin listener while it runs, else an admin-only stack through the tunnel (research.md R-32; contracts/shared-state.md §7) |

### 1.2 Migration 0007 (`services/gateway/migrations/0007_hosts.sql`)

| Change | Why |
|---|---|
| `gateway.ledger` gains `host text NULL CHECK (host IN ('laptop', 'ec2'))`, set by the gateway from `H4_HOST` on each row it writes; rows from before 0007 stay `NULL` | spend by host (spec Expected Cost Impact, "the ledger's rows by provider and host") |
| `gateway.audit_log` gains the same `host` column | each reset, renewal, initialization, restore, and autostart switch change says where it was made (FR-074) |
| `gateway.handover_events` (new): `id bigserial`, `at timestamptz`, `from_host text` and `to_host text`, each `CHECK (… IN ('laptop', 'ec2', 'none'))`, `reason text CHECK (reason IN ('laptop_healthy', 'laptop_unhealthy', 'ec2_healthy', 'ec2_unhealthy'))`, and `gap_ms integer NULL`, set on a move out of `none` | spec SC-007, SC-016, SC-018; the dashboard's handover panel |
| Role `relay_ro`: `SELECT` on `gateway.v_state`, nothing else; `default_transaction_read_only = on`; `statement_timeout = '250ms'` | the relay's kill-switch read (FR-030) |
| Role `relay_rw`: `INSERT` on `gateway.handover_events` and `USAGE` on its sequence, nothing else | the relay records each change of serving host |
| `grafana_ro` gains `SELECT` on a view `gateway.v_handovers` (the last 30 days of `handover_events`) | the dashboard |

Nothing else changes. Attribution keeps spec 000's set: the `ec2` route's calls are `metered`, and the laptop's fallback calls stay `fallback` (research.md R-27). The adapter's month (spec 010, `0005_adapter_month.sql`) counts every call to the adapter on either host.

### 1.3 Two writers on one store

| Guarantee | Holds through | Proof |
|---|---|---|
| Migrations run once | `pg_advisory_lock` in `services/gateway/src/meter/store.ts` | existing |
| Initialization runs once | `pg_advisory_xact_lock` in `meter/init.ts` | existing |
| An alert is sent once | the dispatcher claims outbox rows `FOR UPDATE SKIP LOCKED` (`alerts/dispatcher.ts`) | existing |
| Admission and commit can't pass a ceiling beyond spec 000's in-flight bound across two gateways | the admission transaction on the shared rows | **new test:** two gateways on one store, both admitting paid calls at the global limit; the day's ceiling is never passed beyond the bound (plan §10) |
| The day's and month's rollover happens once | the background sweep's transaction | **new test:** two sweeps racing at the UTC boundary |
| Both hosts see the same kill switch at request start | one row | spec SC-008's test, on each host |

### 1.4 Unknown is degraded, on each host

A host whose gateway can't read the shared state, or can't confirm it within 10 seconds, counts the state as unknown and answers degraded (spec FR-019; spec 000 FR-031). On the laptop that includes a tunnel that is down, since the store is reached through it. The relay on the tunnel end applies the same rule to its own read (spec FR-030).

### 1.5 The move (research.md R-20)

| Step | Who | State of the shared store |
|---|---|---|
| 1. The tunnel end's release starts `shared-state` (amended 2026-11-12; spec.md Assumptions, "The shared state on the tunnel end"); the Author's roles target sets the four passwords; the first gateway to start runs 0001–0007 | the Author's apply, release, and roles target; the gateway | `uninitialized` (spec 000's empty-store rule): degraded everywhere |
| 2. The laptop's prod stops its paid route, so nothing more lands on its local meter | the Author: his route change (ADR 0041 makes prod's route change his) and `make up` (tasks.md T080) | unchanged |
| 3. The Author reads the local meter | `make operator-status ENV=prod` | unchanged |
| 4. The Author initializes the shared meter with the carried values | `make operator-init ENV=shared DAY_USD=… MONTH_USD=… FALLBACK_TODAY_USD=… ADAPTER_MONTH_USD=… [RENEW=…]` | `normal`, or `degraded` with the carried crossed ceilings |
| 5. The laptop's prod points at the shared store and gets its paid route back | the Author: the cutover release, with his route change undone | as step 4 |

The laptop's local `gateway-state` volume for prod is kept, unchanged, as the record of the meter before the move.

A store restored from a backup goes back to `uninitialized` through `make operator-restore ENV=shared`, with both hosts stopped, and is initialized again as in step 4, never lower than its restored meters (contracts/shared-state.md §8).

## 2. The route per host (research.md R-27, R-28)

### 2.1 `config/routing.yaml`'s schema 2

```yaml
schema: 2
envs:
  prod:
    hosts:
      laptop: { primary: local, fallback: anthropic }   # as main's prod route names it (feat/010-anthropic-switch)
      ec2:    { first: anthropic, second: bedrock }     # the Author's line, in group 7 (ADR 0041)
  dev: { primary: local, fallback: synthetic }
```

| Rule | Text |
|---|---|
| R1 (amended) | Every `primary` names a local adapter. A route with `first` names only paid adapters, in `first` and an optional `second`, and appears only as `envs.prod.hosts.ec2`. |
| R2 (spec 010, unchanged) | Dev's route names no paid adapter. |
| H1 (new) | `envs.prod.hosts` has `laptop`, and may have `ec2`, and no other host. A gateway with `H4_HOST=ec2` refuses to start while `ec2` is missing (exit 78, `route_missing`). |
| H2 (new) | The gateway selects `envs.<H4_ENV>.hosts.<H4_HOST>` where `hosts` exists, else `envs.<H4_ENV>`. |
| A1 (new) | Calls on a `first` or `second` route are attributed `metered`; calls on a `fallback` route are attributed `fallback`, as today. |

Spec 010's refusals hold for each named paid adapter: its price version, its cap where it is `anthropic-messages`, and its key. `evals/test_disclosure.py`'s `placeholder_gate` reads every host route's `first`, `second`, and `fallback` (group 6, test-first), so F3's placeholder fails `make test` whichever route names the Anthropic API.

### 2.2 The environment keys

| Key | Laptop prod | EC2 | Tunnel end | Dev, dev-cpu | Checked by |
|---|---|---|---|---|---|
| `H4_HOST` (new) | `laptop` | `ec2` | `tunnel-end` | `laptop` | preflight; the gateway (exit 78 on a mismatch); EC2's preflight against IMDSv2 |
| `H4_STACK` | `prod` | `prod` | `prod` | `dev`, `dev-cpu` | as spec 000 |
| `H4_ENV` | `prod` | `prod` | `prod` | `dev` | as spec 000 |
| `GATEWAY_DB_URL` (new; spec 000's local default otherwise) (amended 2026-11-12; spec.md Assumptions, "The shared state on the tunnel end") | the tunnel's forward, `tunnel:5432`, with `shared-state` as the name for TLS | the tunnel end's private address, `10.42.1.10:5432`, with the same name | — | local | preflight: TLS required on `prod` |
| `GATEWAY_ANTHROPIC_API_KEY` | prod's env file, as spec 010 | written at boot from Parameter Store, never to the root volume | — | absent | spec 010's preflight |

[contracts/env-cloud.md](contracts/env-cloud.md) has the full tables.

## 3. The relay's memory (research.md R-18)

| Item | Kept | For how long |
|---|---|---|
| Per-address token bucket and UTC-day count | the address and two numbers | at most one UTC day (FR-042) |
| Each host's health: the last check, consecutive passes or failures, healthy or not | per host | while the relay runs |
| The serving host | `laptop`, `ec2`, or `none`, and since when | while the relay runs; each change also goes to `handover_events` |
| The last kill-switch read | state, since, crossed, read at | replaced each request; older than 10 s counts as unknown |
| EC2's instance state | as the sink last read it (research.md R-19) | 2 minutes |

No message, answer, or address is written anywhere (FR-031, FR-042).

## 4. The records

| Record | Where | Fields | Written by |
|---|---|---|---|
| Handover event | `gateway.handover_events` (§1.2) | at, from, to, reason, gap | the relay |
| Start or guard outcome | `h4-alerts` (Telegram and email), and the function's CloudWatch log | the action (started, refused, stopped), why (`paused`, `server_budget_stopped`, `laptop_serving`), the instance's tag, the time | `h4-ec2-start`, `h4-ec2-guard` |
| Autostart switch change | the Parameter Store value; CloudTrail; an audit row in the shared state | the value, the time, the operator's fingerprint | `make ec2-autostart` |
| Release | `release.json` in the release bucket and the Author's release directory | commit, each service's index digest per platform, time, who built it (September R-17) | `make release` |
| Deployment | a JSON line in each host's state directory, and a log event the dashboard shows | host, release, digests, time, who started it, outcome | each host's deployer |
| Plan block, apply record, credential audit | as September ([contracts/infra-records.md](contracts/infra-records.md)) | — | `make plan`, `make infra-record`, `h4-credential-audit` |
| Budget action execution | AWS Budgets' action history; `h4-alerts` | budget, action, time, status | AWS |

## 5. The public view's document (`site/status/latest.json`; research.md R-19)

| Part | Fields | Source |
|---|---|---|
| `serving` | `host` (`laptop`, `ec2`, `none`), `since`, `ec2_state` (`running`, `stopped`, `pending`, `stopping`, `interrupted`) | the relay's status; `ec2:DescribeInstances` |
| `spend` | `today_usd`, `month_usd`, the warnings, `fallback_remaining_usd` (laptop), `adapter_months` | the shared state |
| `server` | `month_to_date_usd`, `budget_usd`, `as_of` | `budgets:DescribeBudget`, hourly |
| `host_panels` | spec 000's FR-028 panels from the serving host: requests, latency p50 and p95, errors, model-server health (laptop only), degraded causes | that host's publisher |
| `handovers` | the last 10 events and their gap lengths | `gateway.v_handovers` |
| `taken_at` | per part | each writer |

Numbers, states, and times only. No payload, client identifier, operator reason, or secret (spec FR-059). The sink refuses anything else.

## 6. State machines

### 6.1 The serving host (the relay)

| From | Event | To |
|---|---|---|
| any | the laptop passes three checks in a row | `laptop` |
| `laptop` | the laptop fails one check, and EC2 is healthy | `ec2` |
| `laptop` | the laptop fails one check, and EC2 isn't healthy | `none` |
| `none` | EC2 passes three checks in a row, and the laptop isn't healthy | `ec2` |
| `ec2` | EC2 fails one check, and the laptop isn't healthy | `none` |

The laptop wins whenever it is healthy. Each move writes a handover event; a move out of `none` records the gap.

### 6.2 EC2's instance

| From | Event | To | By |
|---|---|---|---|
| stopped | the health check's alarm turns to alarm, the autostart switch is `on`, and the server action isn't executed | pending, then running | `h4-ec2-start` |
| stopped | `make ec2-start`, refused while the autostart switch is `off` or the laptop serves | running | the Author |
| running | the relay serves the laptop | stopping, then stopped (a user stop) | `h4-handover` |
| running | `make ec2-stop` | stopped (a user stop) | the Author |
| running | a spot interruption | stopped (an interruption), with the warning alert | AWS |
| stopped (an interruption) | capacity returns | running | AWS |
| running | started while the laptop serves, the autostart switch is `off`, or the server budget's action has run | stopped (a user stop), with `ec2_stopped_laptop_serving`, `ec2_stopped_paused`, or `ec2_stopped_server_budget` | `h4-ec2-guard` |
| any | the server budget's action | stopped; the start function refuses until `make server-budget-restore` | AWS Budgets |
| stopped | the tunnel end returns while the laptop isn't serving (one run of the start function) | running | `h4-ec2-start` |
| running (started on the tunnel end's return while the laptop was reconnecting) | the relay serves the laptop again | stopped (a user stop), within the handover window | `h4-handover` |

The start function also refuses while the tunnel end isn't running (`tunnel_end_down`).

### 6.2a The tunnel end's instance (spec FR-076)

| From | Event | To | By |
|---|---|---|---|
| running | a spot interruption | stopped (an interruption); `tunnel_end_interruption` alerted at the warning | AWS |
| stopped (an interruption) | capacity returns | running; its services start; the laptop's tunnel reconnects; `tunnel_end_back` alerted; the start function runs once | AWS, then systemd and the deployer |

While it is stopped, the relay's memory is gone. The edge answers `no_host_serving`, and the relay's caps restart empty on its return.

### 6.3 The autostart switch

`on` (the default) lets EC2 start automatically; `off` stops that. Only `make ec2-autostart` changes it. While it is `off`, the start function refuses (code `paused`), the guard stops any start (`ec2_stopped_paused`), and `make ec2-start` refuses, so the switch is the one control: the Author sets it `on` to let EC2 run again.
