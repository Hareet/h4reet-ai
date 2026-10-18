# Data model: the meter of record's changes, and the records spec 001 adds

Phase 1 output of `/speckit-plan`. This file defines:
- **what changes in the gateway's state** (spec 000's [data-model.md](../000-local-foundations/data-model.md)), for the fourth stack and for infrastructure cost on the meter;
- **the relay's in-memory state;**
- **the records this spec adds:** releases, deployments, plan blocks, apply records, credential audits, the public view's document, and the tunnel's keys;
- **their state machines.**

Everything in spec 000's data model holds unless a section here changes it. [plan.md §3.3](plan.md#33-the-meter-of-record-and-infrastructure-on-it-fr-017-to-fr-020-r-20-r-21) summarizes the gateway's part. Where this file and plan.md disagree on a detail, this file is right and plan.md is fixed.

Related contracts: [relay-http.md](contracts/relay-http.md), [tunnel.md](contracts/tunnel.md), [releases-deployer.md](contracts/releases-deployer.md), [infra-records.md](contracts/infra-records.md), [public-view.md](contracts/public-view.md), [env-cloud.md](contracts/env-cloud.md), and [aws-alerts.md](contracts/aws-alerts.md).

**Conventions** are spec 000's: money is integer micro-USD, periods are UTC, and the gateway clock is real time (no test offset outside dev). **Attribution** gains one value:

| Attribution | Made by | Counts toward |
|---|---|---|
| `none`, `fallback`, `metered`, `test` | as in spec 000 | as in spec 000 |
| `infra` | the meter of record's daily booking and its correction (§4) | the estimate: `day` and `month`. The correction: `month` only. Never `fallback_day` |

Telemetry's `h4.meter.attribution` takes the new value too.

## 1. Where state lives

| Store | Holds | Survives | Role |
|---|---|---|---|
| The cloud stack's `gateway-state`, on the meter's 2 GiB gp3 volume at `/var/lib/h4reet/cloud` | the meter of record: spec 000's schema, with §2's migration | restarts, `make down`, and the VM's replacement. Terraform guards the volume with `prevent_destroy`, and it is snapshotted daily (FR-019) | the one enforcement point for production spend (FR-017) |
| The cloud stack's journal, `${H4_STATE_DIR}/gateway/journal/` | spec 000's records, plus `infra` (§4) | the same volume | the rebuild source for initialization (spec 000's §8) |
| The local prod stack's `gateway-state` | spec 000's schema. After group 4 it books no paid call; its kill switch still stops local prod's own answers | as in spec 000 | local only. The relay never reads it |
| The relay's process memory | the cap, the local path's health, the in-flight count (§5) | nothing | soft limits; the meter is the bound |
| `s3://<release bucket>/` | `releases/<commit>.json`, `releases/latest.json`, `trees/<commit>.tar`, `audits/credential/<date>.json` | the account | the release source for the VM, and the audit's history |
| `~/.local/state/h4reet/releases/` | the same release records | the local tier | the release source for the local tier |
| `${H4_STATE_DIR}/deployments.jsonl`, on each host | deployment records (§6.2) | as the state directory | FR-046's record, and the dashboard's |
| `${H4_STATE_DIR}/run.env` | spec 000's run file, plus §6.3's keys | as the state directory | what a host stack runs, and who started it |
| `docs/merge-requests/*.md` | plan blocks (§6.4) | git | FR-005's reviewed plan |
| `docs/infra/applies/*.md` | apply records (§6.5) | git | FR-007's record |
| `s3://<site bucket>/site/status/latest.json` | the public view's document (§6.7) | the account | FR-057's last-known values |
| `~/.config/h4reet-ai/tunnel/`; Parameter Store `/h4reet/cloud/*` | the tunnel's keys and tokens (§6.8), and the cloud stack's secrets, which the Author creates outside Terraform (research.md R-26) | the Author's machine; the account | the tunnel's credentials (FR-055) |
| Terraform's state, `s3://h4reet-ai-tfstate-<suffix>/<root>.tfstate` | every cloud resource's state | versioned | the infrastructure's truth (FR-001). Agents never read it (FR-011) |

## 2. The gateway's schema: migration `0004_infra.sql`

It is numbered after spec 003's `0003_studio_window.sql` (the studio's GPU window, implemented on 2026-10-18 on `feat/003-us6-gpu-window`), and takes the next free number when task group 3 starts.

Append-only, as spec 000's migrations. One transaction, under the same advisory lock, recorded in `gateway.schema_migrations` as version 3. Each widened `CHECK` is dropped and added again by the name `0001_state.sql` gave it. A gateway at a commit before this migration refuses a store that has it (spec 000's `schema_newer_than_code`, exit 78).

### 2.1 `stack_state`

| Column | Change |
|---|---|
| `stack` | `CHECK (stack IN ('prod','dev','dev-cpu','cloud'))` |
| `env` | unchanged: `cloud` initializes with `env = 'prod'` |

### 2.2 `ledger` and `reservations`

| Column | `ledger` | `reservations` |
|---|---|---|
| `attribution` | `CHECK (attribution IN ('none','fallback','metered','test','infra'))` | unchanged: an infra booking never reserves |
| `purpose` | `CHECK (purpose IN ('hello','contract','eval','synthetic','infra'))` | unchanged |
| `route_decision` | `CHECK (route_decision IN ('local','fallback','metered','infra'))` | – |
| `route_reason` | `CHECK (route_reason IN ('local_unhealthy','local_failed','local_path_unhealthy','local_path_failed','local_path_degraded'))`, NULL unless `route_decision = 'fallback'` | the same list, NULL unless `attribution = 'fallback'` |
| `cost_basis` | `CHECK (cost_basis IN ('usage','reservation','expired','none','estimate','billing_correction'))` | – |

**Row rules for `attribution = 'infra'`,** as `CHECK`s:

| Column | Value |
|---|---|
| `purpose`, `route_decision`, `adapter_id` | `infra` |
| `provider` | `aws` |
| `request_model` | `infrastructure` |
| `response_model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `finish_reason`, `error_kind`, `client_label`, `route_reason`, `reservation_id` | NULL. Spec 000's row rule that every attribution but `none` has a reservation gains this exception |
| `latency_ms` | 0 |
| `outcome` | `ok` |
| `cost_basis` | `estimate` or `billing_correction`, and only for this attribution |
| `price_version` | `budgets:<the first 12 hex characters of config/budgets.yaml's SHA-256>`, so the estimate's source is traceable |
| `request_id` | `infra-estimate-<YYYY-MM-DD>` or `infra-correction-<YYYY-MM-DD>` |
| `trace_id` | the background task's span's trace ID |
| `stack` | `cloud`: only the meter of record books infrastructure. Any other stack's gateway refuses to book (§4) |

**New indexes:**
- `CREATE UNIQUE INDEX ledger_infra_estimate_once ON gateway.ledger (period_day) WHERE attribution = 'infra' AND cost_basis = 'estimate';`
- `CREATE UNIQUE INDEX ledger_infra_correction_once ON gateway.ledger (period_day) WHERE attribution = 'infra' AND cost_basis = 'billing_correction';`

**The cloud stack's `route_reason`** comes from the relay's `X-H4-Local-Path` ([relay-http.md §6.2](contracts/relay-http.md#62-choosing-and-falling-back-once)):

| Header | `route_reason` |
|---|---|
| `unhealthy` | `local_path_unhealthy` |
| `failed` | `local_path_failed` |
| `degraded` | `local_path_degraded` |

The same value is in hello's 200 body and on the spans (`h4.route.reason`). On the cloud stack, hello requires the header from its trusted peer: a hello without it, or from another peer, answers 400 `{"error":"invalid_request","field":"X-H4-Local-Path"}`. The local stacks keep spec 000's two values.

### 2.3 The view `v_state` grows two columns

`gateway.v_state` (spec 000's §2.9) adds, for the gateway clock's current periods:
- `infra_day_micro`: the sum of `cost_micro` over the ledger's `infra` rows with this `period_day`;
- `infra_month_micro`: the same for this `period_month`.

Both are 0 on stacks that book none. `grafana_ro`'s grant is unchanged, since the view is one object. The dashboard and the public view read idle cost beside metered spend from these (FR-059).

### 2.4 The role `relay_ro`

`0004_infra.sql` also creates `relay_ro`, on spec 000's `grafana_ro` pattern:
- `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`;
- `default_transaction_read_only = on`, and `statement_timeout = '1s'` on the role. The relay sets 250 ms per session;
- `CONNECT`, `USAGE` on schema `gateway`, and `SELECT` on `gateway.v_state` only. It can't read `audit_log`.

The gateway sets its password from `GATEWAY_RELAY_RO_PASSWORD` at every start, as a SCRAM-SHA-256 verifier, as for `grafana_ro`. On a stack without the variable, the role has no password and can't log in.

### 2.5 The operator credential on the cloud stack

Spec 000's §5, with one more scope:
- **Format:** `h4op_cloud_` and 43 base64url characters. Pattern: `^h4op_(prod|dev|devcpu|cloud)_[A-Za-z0-9_-]{43}$`.
- **Where it lives:** the token in `~/.config/h4reet-ai/operator/cloud.token`; its hash in Parameter Store `/h4reet/cloud/OPERATOR_TOKEN_SHA256`.
- **The actor in `audit_log`:** `operator:cloud#<8 hex>`.
- **Its own prefix only:** the cloud gateway accepts `h4op_cloud_` only, so prod's token can't act on the meter of record, and the reverse.

## 3. Routing: the cloud stack's class

`config/routing.yaml` goes to `schema: 2`:

```yaml
envs:
  prod: { primary: local }                    # the local tier: no paid route after group 4 (FR-017, FR-018)
  dev: { primary: local, fallback: synthetic }
  prod-cloud: { fallback: bedrock }           # the fallback gateway: the meter of record (FR-017)
```

- **Which route a stack takes:** `prod-cloud` when `H4_STACK=cloud`; otherwise the `H4_ENV` key, as in spec 000.
- **Validation** (`validate-config` and the gateway, exit 78, [env-cloud.md §6](contracts/env-cloud.md#6-what-the-gateway-checks-for-itself)):
  - `prod-cloud` has no `primary` and a `kind: paid` fallback;
  - every other class's primary is `kind: local`;
  - a `paid` adapter appears only in `prod-cloud` (`paid_route_outside_cloud`), and `synthetic` only in `dev`.

  The file's header comment says so. Spec 000's "keeps every primary local" becomes "every route with a primary keeps it local; only `prod-cloud` has none".
- **Which adapters exist:** only those the resolved route names are built. The cloud gateway builds no `local` adapter and needs no `LOCAL_MODEL_*` keys.
- **The order on `prod-cloud`:** spec 000's FR-022 order with step 5.1 skipped. The router goes straight to the fallback's admission, with the route reason from §2.2. Every degraded cause from spec 000's §3 still applies, except `no_fallback_in_stack`, which can't arise.
- **Trusted peer:** on the cloud stack, the gateway believes `X-Forwarded-For` only when its TCP peer is the `relay` service, looked up and cached as spec 000's `edge` is. On every other stack, only `edge`, as before.

## 4. Infrastructure on the meter (FR-020)

**Configuration** (`config/budgets.yaml`, the Author's patch, schema version raised):

```yaml
infra:
  month_estimate_usd: 8.00      # research.md R-05's idle estimate; the Author sets it
  correction_after_utc: "06:00" # AWS's daily data is usually there by then
```

The gateway refuses a `cloud` stack whose `budgets.yaml` has no `infra` section (`infra_estimate_missing`, exit 78). It ignores the section on every other stack.

**The daily estimate.** It runs once per UTC day, in the 10 s background task and at the first admission of the day, whichever comes first:
1. **Skip:** if the store is unreachable or uninitialized, try again on the next tick.
2. **Journal first:** append and fsync `{"type":"infra","basis":"estimate","period_day":…,"cost_micro":…}`. If that fails, skip, try again, and count `journal_unwritable` as spec 000 does.
3. **The transaction:** take `stack_state FOR UPDATE`. If the unique index already holds today's estimate, stop. Otherwise:
   - insert the ledger row, with `cost_micro = ceil(month_estimate_micro / days_in_month)`, rounded up so the meter never counts less;
   - add it to the `day` and `month` meters' `spent_micro`;
   - evaluate the crossings exactly as spec 000's commit does (its §7.3 step 6): a warning, or a trip that sets `degraded` in the same transaction.

**The correction.** Once per UTC day, after `correction_after_utc`:
1. **Read AWS:** with the fallback gateway's role, `budgets:DescribeBudget` on `h4-infra-actual`, which excludes Amazon Bedrock. Take `CalculatedSpend.ActualSpend` for the month to date, and convert it to micro-USD, rounded up.
2. **Compare:** `booked` = the sum of this month's `infra` ledger rows.
3. **Book upward only:** if `actual > booked`, journal first, then book a row with `cost_basis = 'billing_correction'` and `cost_micro = actual − booked`, against the `month` meter only, and evaluate the crossings. The correction is for past days, so it never charges today's `day` meter. If `actual <= booked`, book nothing: the meter never counts less than was spent.
4. **If the API call fails:** log it, and count `h4.infra.correction` with `outcome=failed`. The dashboard shows the last correction's date. Nothing degrades on a failed read: the meter stays the control (FR-024).

**What a booking can cause.** An infra booking that crosses a ceiling trips the kill switch, as a model call would. That's FR-020's "Metered calls SHALL stop when metered spend plus infrastructure reaches $5 for the day or $20 for the month". The relay then answers degraded on both paths until the Author resets (spec Clarifications, 2026-10-12).

**Initialization** (spec 000's §8) counts `infra` journal records like any other: each meter takes the maximum of the ledger's, the journal's, and the operator's stated values.

## 5. The relay's memory

| State | Shape | Bounds | Lost on restart |
|---|---|---|---|
| The public cap, per address | `{tokens, refilled_at, day_key, day_count}`, keyed by the address | at most 50,000 entries, least recently seen evicted; idle entries dropped after one UTC day | yes. Acceptable: the meter bounds spend |
| The status cap, per address | the same shape, its own bucket | the same | yes |
| In flight | one integer | at most 8 (`public.global_in_flight`) | yes |
| The local path's health | `{state: healthy\|unhealthy, passes_in_a_row, since, last_check_at}` | – | yes, and it starts unhealthy (§7.1) |
| The fallback gateway's last `degraded_cause` | `{cause, read_at}` | cached 5 s, for `/api/status` | yes |
| The kill switch, for `/api/status` only | `{state, since, read_at}` | cached 5 s; hello never uses it | yes |

No address is ever written: not to a log, a span, a metric, or a store (FR-042).

## 6. Records

### 6.1 `release.json`

| Field | Type | Rule |
|---|---|---|
| `schema` | integer | 1 |
| `commit` | 40 lowercase hex | a commit on `main` |
| `made_at` | RFC 3339 UTC | |
| `made_by` | `author` before publication; `ci` after | |
| `gate` | `{summary, at}` | the gate's summary line from the merge commit's message |
| `redteam_hello` | `{commit, result, at}` or null | required from group 6 on; `result` must be `pass` |
| `images` | map of service → `{repository, index_digest, platforms?, upstream?}` | `index_digest` is `sha256:` and 64 hex; `platforms` for the project's own images; `upstream` for copies |
| `site` | `{tree, files}` | the git tree hash of `apps/web` at the commit |
| `previous` | 40 hex, or null for the first release | |

Immutable: `make release` refuses a commit that already has a record.

### 6.2 The deployment record

One JSON line per deployer run that acted ([releases-deployer.md §5](contracts/releases-deployer.md#5-the-deployment-record)):

| Field | Type | Rule |
|---|---|---|
| `ts` | RFC 3339 UTC | when the run finished |
| `host` | `cloud` or `local` | |
| `stack` | `cloud` or `prod` | |
| `release`, `previous` | 12 hex | |
| `started_by` | `deployer` or `author` | `author` for `make up` by hand, and for `make rollback` |
| `services` | array of service names | only those restarted |
| `outcome` | `deployed`, `rolled_back`, `rollback_failed`, `refused`, `held` | |
| `reason` | null, or a fixed reason: `health`, `digest_mismatch`, `record_invalid`, `author`, `hold` | never free text |
| `duration_s` | integer | |

### 6.3 The run file's new keys

Spec 000's run file (`${H4_STATE_DIR}/run.env`; its env-files.md §12) gains:

| Key | Values | Written by |
|---|---|---|
| `H4_RELEASE` | 40 hex, or empty for a stack started from a commit that isn't a release | the deployer; `make up` leaves it empty |
| `H4_STARTED_BY` | `deployer` or `author` | the deployer; `make up` and `make rollback` write `author` |
| `H4_DEPLOYER_HOLD` | `0` or `1` | `make up` and `make rollback` write `1`; `make deployer-resume` writes `0` |

### 6.4 The plan block

In a merge-request note, delimited by `<!-- h4-plan … -->` and `<!-- /h4-plan -->` ([infra-records.md §2](contracts/infra-records.md#2-the-plan-block-fr-005)):

| Attribute | Type | Rule |
|---|---|---|
| `root` | `bootstrap`, `account`, `prod` | |
| `tree` | 40 hex | `git rev-parse HEAD:infra` when made; must equal the branch's at the gate |
| `sha256` | 64 hex | of the saved plan file |
| `terraform` | a version | the pinned one |
| `made` | RFC 3339 UTC | |
| the body | a `terraform-plan` code block | `terraform show -no-color`, redacted; no 12-digit run, email address, or secret pattern |

### 6.5 The apply record

`docs/infra/applies/<YYYY-MM-DD>[-n]-<root>.md` ([infra-records.md §6](contracts/infra-records.md#6-the-apply-record)):

| Field | Rule |
|---|---|
| Root | as the block's |
| Commit | the `main` commit applied |
| Plan | the block's `sha256` and `tree`, and the note that holds it |
| Applied by | "the Author, from the Author's terminal" until publication |
| Started, finished | RFC 3339 UTC |
| Outcome | `ok` or `failed`, with Terraform's exit status when failed |
| Terraform | the version |
| Resources changed | address and action (`create`, `update`, `delete`, `replace`), with no attribute values |

### 6.6 The credential audit result

`s3://<release bucket>/audits/credential/<YYYY-MM-DD>.json`, and the Lambda's log:

```json
{ "schema": 1, "run_at": "2026-11-02T06:00:04Z", "source": "lambda",
  "clean": false, "findings": [ { "check": "iam_user_access_key", "resource": "h4reet-runtime" } ] }
```

| Field | Rule |
|---|---|
| `source` | `lambda` (weekly) or `terminal` (`make infra-audit`, `make infra-verify`) |
| `findings[].check` | one of `iam_user_access_key`, `root_access_key`, `role_foreign_trust`, `oidc_provider_present`, `handmade_identity_present` |
| `findings[].resource` | a user, role, or provider name. Never a key ID or an ARN with the account in it |

### 6.7 The public view's document

The schema is [public-view.md §3](contracts/public-view.md#3-the-document). It is strict: unknown fields are refused, and every string comes from a closed set. Only `snapshot-sink` writes it.

### 6.8 The tunnel's keys and state

| Item | Where | Mode | Who |
|---|---|---|---|
| The client's private key, `id_ed25519` | `~/.config/h4reet-ai/tunnel/` | 0600, directory 0700 | `make tunnel-keys`; read by `tunnel` through a read-only mount |
| The pinned host key, `known_hosts` | the same | 0644 | the same |
| The server's host key | Parameter Store `/h4reet/cloud/H4_TUNNEL_HOST_KEY` (SecureString) | – | `make tunnel-keys`; read by `write-env.py` at boot, then by `tunnel-end` from tmpfs |
| The authorized key | `/h4reet/cloud/H4_TUNNEL_AUTHORIZED_KEY` | – | the same; `revoked` after `make tunnel-revoke` |
| The three tokens | `/h4reet/cloud/H4_TUNNEL_API_TOKEN`, `H4_TUNNEL_OTLP_TOKEN`, `H4_SNAPSHOT_TOKEN`; and the prod env file | 0600 (the file) | `make tunnel-keys` |
| The tunnel's state | `h4.tunnel.up`, from both ends | – | [tunnel.md §6](contracts/tunnel.md#6-state-and-telemetry) |

## 7. State machines

### 7.1 The local path, in the relay

```text
           start
             │
             ▼
        ┌──────────┐  3 passing checks in a row  ┌──────────┐
        │unhealthy │ ───────────────────────────►│ healthy  │
        └──────────┘ ◄───────────────────────────└──────────┘
                     1 failed check, or a failed or
                     timed-out hello on the local path
```

A degraded answer from the local path sends that request to the fallback gateway, but doesn't change the state: the next check decides it ([relay-http.md §6.2](contracts/relay-http.md#62-choosing-and-falling-back-once)).

### 7.2 A deployment

```text
 idle ──(a new release)──► verifying ──(digests match)──► starting ──(healthy)──► deployed
   ▲                           │                              │
   │                       (mismatch)                    (unhealthy)
   │                           ▼                              ▼
   └─────────────────────── refused               rolling back ──(healthy)──► rolled_back
                                                          │
                                                     (unhealthy)
                                                          ▼
                                                   rollback_failed (stays; alerts)
 held: entered from idle when H4_DEPLOYER_HOLD=1; left by make deployer-resume
```

### 7.3 The budget action

```text
 standby ──(AWS: actual at 100% of $20)──► executed: h4-deny-paid-models attached
    ▲                                              │
    └──────(the Author: REVERSE_BUDGET_ACTION)─────┘
```

AWS keeps an executed action executed until it is reversed. The next month's budget period re-arms it. The rehearsal's action follows the same machine against its own target, and is deleted with `rehearsal = false`.

### 7.4 The tunnel

`down` → `up` when the client connects and every forward is granted (`ExitOnForwardFailure`). `up` → `down` when the connection ends: 3 missed keep-alives, a restart, or a revoked key. The client's loop reconnects with backoff (1, 2, 5, 10, then every 30 s).

### 7.5 The kill switch of record

Spec 000's machine (its §6.1), unchanged, on the cloud stack. What's new is who reads it: the relay, on every hello ([relay-http.md §5](contracts/relay-http.md#5-the-kill-switch-of-record-fr-030)). And there is one new way in: an infra booking that crosses a ceiling (§4).

## 8. The spec's Key Entities in spec 001

| Entity | Where |
|---|---|
| Environment | a stack (`prod`, `dev`, `dev-cpu`, `cloud`) and its Terraform root and budget; [env-cloud.md](contracts/env-cloud.md) |
| Release | §6.1 |
| Deployment record | §6.2 |
| Plan record | §6.4 |
| Apply record | §6.5 |
| Meter of record | the cloud stack's `gateway-state` (§1, §2, §4) |
| Cloud budget | `infra/bootstrap/budgets.tf`, `infra/account/killswitch.tf`; [aws-alerts.md §3](contracts/aws-alerts.md#3-the-budget-action-fr-023-fr-026) |
| Tunnel | §6.8; [tunnel.md](contracts/tunnel.md) |
| Public view | §6.7; [public-view.md](contracts/public-view.md) |
| Data-flow disclosure entry | `docs/data-flow-disclosure.md`, each row tagged for `disclosure_check.py` (plan §8.2) |
