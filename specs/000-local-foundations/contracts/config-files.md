# Contract: the gateway's configuration files

This contract defines the four files in `config/` the gateway loads:
- `routing.yaml`: adapters and routes (FR-021, FR-022);
- `prices.yaml`: the versioned price table (FR-023);
- `budgets.yaml`: ceilings, the sub-budget, and limits (FR-025, FR-030, FR-031);
- `alerts.yaml`: channels, retries, and the reminder (FR-032).

For each file it gives every field, the rules, an example, the validation errors, the exit-78 refusals, and who may edit it. How the gateway uses the loaded values is in [data-model.md §4](../data-model.md#4-configuration-the-gateway-loads), and [plan.md §5.3](../plan.md#53-configuration-routing-prices-budgets-alerts) summarizes the files.

## 0. Rules for every file

- **Format:** YAML 1.2, parsed with `yaml` 2.9.1: one document per file, duplicate keys refused. Each file starts with `schema: 1`.
- **Validation:** a strict zod schema per file, so an unknown key is an error, not a warning.
- **Loading:**
  - The gateway reads the files once, at startup, from `/app/config`, a read-only bind of `${H4_TREE}/config`. On a host stack, `H4_TREE` is the export of the commit `make up` started, so a committed change takes effect at the next `make up` ([env-files.md §12](env-files.md#12-the-run-file-host-stacks)); on dev-cpu, which runs the live tree, at the next gateway restart.
  - Any validation failure stops startup with **exit 78**, the configuration-error code. The gateway prints every error, one per line, as `config/<file>: <path>: <rule> (<requirement>)`, for example `config/routing.yaml: envs.prod.primary: names "bedrock", a paid adapter; every primary must be local (FR-022)`.
- **Money:** a USD amount is a number or a decimal string, at least 0, with at most 6 decimal places. It is converted exactly to integer micro-USD, never through a float, and more decimals are an error. Prices are per million tokens and become integer micro-USD per million tokens.
- **Placeholders:**
  - A string of the form `<…>` marks a value only the Author can supply, such as `"<inference-profile ID the Author confirms>"`.
  - `validate-config` reports each one as a NOTE and still passes.
  - A gateway whose own route uses a placeholder value refuses to start (exit 78, `placeholder_value`). In spec 000 that is prod's Bedrock model and price until the Author fills them, so dev and dev-cpu run on the committed files.
- **Who edits what:**

  | File | Edited by | Enforced by |
  |---|---|---|
  | `config/routing.yaml` | agents, reviewed in the merge-request note | the schema below: local-first, paid only in prod, synthetic only in dev |
  | `config/prices.yaml` | the Author only (human-only) | `protected-paths.sh`, `permissions.deny`, and sandbox `denyWrite`, from the closing patch ([plan.md §15](../plan.md#15-the-enforcement-layer-patch)) |
  | `config/budgets.yaml` | the Author only (already protected by `config/budgets*`) | the same; the closing patch adds `denyWrite` |
  | `config/alerts.yaml` | the Author only (already protected by `config/alert*`) | the same; the closing patch adds `denyWrite` |

  A change to budgets, alerting, or the kill switch needs an ADR and the Author's approval (the spec's edge cases). Agents propose such changes in a merge-request note, never in the file.

## 1. `config/routing.yaml`

It says which adapters exist and which one each environment class routes to. The gateway selects the route by `H4_ENV`: `prod` for prod, and `dev` for dev and dev-cpu. Its SHA-256 goes on every span and ledger row as `h4.routing.sha`.

### 1.1 Fields

| Field | Type | Rule |
|---|---|---|
| `schema` | integer | `1` |
| `deadline_ms` | integer | 5,000 to 25,000: the whole request's deadline, counted from arrival. It must be at least the primary's `request_ms`, plus the fallback's `request_ms` × (1 + `retry.max`), plus `retry.backoff_ms`, plus 500. The ceiling stays under edge's 30 s read timeout ([gateway-http.md §6](gateway-http.md#6-edges-body-when-the-gateway-cant-answer-api_unavailable)). |
| `adapters` | map | key: an adapter ID matching `^[a-z][a-z0-9-]{0,31}$`; value: an adapter, below |
| `adapters.<id>.type` | string | a registered type: `openai-compatible`, `bedrock-converse`, or `synthetic` ([provider-adapter.md §4](provider-adapter.md#4-the-registry-and-adding-an-adapter)) |
| `adapters.<id>.kind` | string | `local`, `paid`, or `synthetic`, and only a kind the type allows: `openai-compatible` → `local` (in spec 000); `bedrock-converse` → `paid`; `synthetic` → `synthetic` |
| `envs` | map | exactly the keys `prod` and `dev` |
| `envs.<env>.primary` | string | an adapter ID whose `kind` is `local` (local-first, FR-022) |
| `envs.<env>.fallback` | string, optional | in `prod`, an adapter whose `kind` is `paid`; in `dev`, one whose `kind` is `synthetic`. Without it, the class has no fallback (`no_fallback_in_stack`). |

Settings by type:

| Type | Field | Type | Rule |
|---|---|---|---|
| `openai-compatible` | `provider` | string | `local` when `kind` is `local` |
| | `base_url_env` | string | the name of an env key (`^[A-Z][A-Z0-9_]*$`) holding the base URL: `LOCAL_MODEL_BASE_URL` |
| | `model_env` | string | the name of an env key holding the model name: `LOCAL_MODEL_NAME` |
| | `timeouts.connect_ms` | integer | 100 to 5,000 |
| | `timeouts.request_ms` | integer | 1,000 to 60,000 |
| | `health.path` | string | starts with `/` |
| | `health.interval_ms` | integer | 250 to 60,000 |
| | `health.timeout_ms` | integer | at least 100 and less than `interval_ms` |
| | `health.unhealthy_after`, `health.healthy_after` | integer | 1 to 10 |
| `bedrock-converse` | `region` | string | `us-east-1`, the region the data-flow disclosure lists (FR-040). A new region needs the disclosure changed first. |
| | `model` | string | an inference-profile or model ID matching `^[a-z0-9][a-z0-9.:-]{2,127}$`, or a placeholder |
| | `additional_request_fields` | map | passed to Converse as `additionalModelRequestFields`, at most 1 KB as JSON: whatever keeps extended thinking off for the confirmed model, or `{}` when off is the default |
| | `timeouts.connect_ms` | integer | 100 to 2,000 |
| | `timeouts.request_ms` | integer | 1,000 to 4,000. Connect plus request must stay within SC-005's 5 s. |
| | `retry.on` | list | ProviderError kinds; spec 000 uses `[rate_limited]` |
| | `retry.max` | integer | 0 or 1 |
| | `retry.backoff_ms` | integer | 0 to 2,000 |
| | `circuit.failures` | integer | 1 to 10 |
| | `circuit.open_s` | integer | 5 to 600 |
| | `health.interval_ms` | integer | 1,000 to 60,000 |
| | `credentials_warn_before_s` | integer | 600 to 86,400: when `credentials_expiring` fires before the SSO session ends |
| `synthetic` | `model` | string | `^[a-z0-9-]{1,64}$` |
| | `output_tokens` | integer | 1 to 100,000: the usage every call reports |

### 1.2 Example (the committed file)

```yaml
schema: 1
deadline_ms: 20000

adapters:
  local:
    type: openai-compatible
    kind: local
    provider: local
    base_url_env: LOCAL_MODEL_BASE_URL      # http://model-server:8080/v1 in every env file
    model_env: LOCAL_MODEL_NAME             # the stack's MODEL_ALIAS
    timeouts: { connect_ms: 1000, request_ms: 10000 }
    health: { path: /models, interval_ms: 1000, timeout_ms: 800, unhealthy_after: 1, healthy_after: 3 }

  bedrock:
    type: bedrock-converse
    kind: paid
    region: us-east-1
    model: "<inference-profile ID the Author confirms>"   # aws bedrock list-inference-profiles
    additional_request_fields: {}           # what keeps extended thinking off for that model, if anything
    timeouts: { connect_ms: 1000, request_ms: 4000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 250 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 10000 }
    credentials_warn_before_s: 7200

  synthetic:
    type: synthetic
    kind: synthetic
    model: metered-test
    output_tokens: 1000                     # 1,000 tokens at dev's $100 per million = $0.10 a call

envs:
  prod: { primary: local, fallback: bedrock }
  dev:  { primary: local, fallback: synthetic }   # synthetic only with GATEWAY_TEST_SYNTHETIC_SPEND=1
```

**It reaches this form in steps,** so every adapter it defines is registered when it lands, and rule R6 holds on every branch ([tasks.md](../tasks.md) T020, T073, T102, T105):
1. the foundations branch: `local` alone, and no fallback in either route;
2. US2 adds `synthetic` and dev's fallback, with the synthetic adapter's code;
3. US5 adds `bedrock`, with its placeholder model and the adapter's code; prod's route doesn't name it yet, so prod starts;
4. the Author fills the model and adds prod's fallback, after confirming the model and its price.

### 1.3 Validation errors

| Rule | Error | Requirement |
|---|---|---|
| R1 | `envs.<env>.primary: names "<id>", a <kind> adapter; every primary must be local` | FR-022 (local-first) |
| R2 | `envs.dev.fallback: names "<id>", a paid adapter; a paid adapter may be routed only in envs.prod` | FR-031 |
| R3 | `envs.prod.fallback: names "<id>", a synthetic adapter; synthetic spend exists only in dev` | FR-036 |
| R4 | `envs.<env>.<role>: names "<id>", which isn't defined under adapters` | |
| R5 | `adapters.<id>.kind: "<kind>" isn't allowed for type "<type>"` | FR-031 (no paid service declared local) |
| R6 | `adapters.<id>.type: "<type>" isn't a registered adapter type` | FR-021 |
| R7 | `adapters.<id>.region: must be us-east-1, the region docs/data-flow-disclosure.md lists` | FR-040 |
| R8 | `adapters.<id>.timeouts: connect_ms + request_ms must be at most 5000` (paid adapters) | SC-005 |
| R9 | `deadline_ms: <n> is shorter than the route's timeouts allow (<m>)` | |
| R10 | `envs: must have exactly the keys prod and dev` | |
| R11 | any unknown key, wrong type, or out-of-range value, named by its path | |

### 1.4 Startup refusals (exit 78)

These are checked with the stack's environment:

| Reason | When |
|---|---|
| `paid_route_outside_prod` | the route selected by `H4_ENV` names a `paid` adapter and `H4_ENV` isn't `prod`. R2 already makes this impossible in a valid file; the gateway checks it again against its own environment ([plan.md §5.8](../plan.md#58-startup-refusals)). |
| `synthetic_in_prod` | a `prod` route names a `synthetic` adapter |
| `placeholder_value` | the route uses an adapter with a placeholder value |
| `local_url_not_in_stack` | the URL in `base_url_env` isn't `http://<single-label host>[:port][/path]`, so it isn't an in-stack service |
| `missing_env` | a key named by `base_url_env` or `model_env` is unset |
| `invalid_config` | any §1.3 error |

## 2. `config/prices.yaml`

This is the versioned price table every cost is computed from (FR-023). It is human-only, because a price is cost configuration. It is append-only: a new price is a new version, and a published version never changes.

### 2.1 Fields

| Field | Type | Rule |
|---|---|---|
| `schema` | integer | `1` |
| `currency` | string | `USD` |
| `unit` | string | `per_million_tokens` |
| `versions` | list | not empty, in strictly increasing `effective_from` order |
| `versions[].id` | string | unique; `^\d{4}-\d{2}-\d{2}\.\d+$`, such as `2026-10-08.1`. It is recorded on every call as `h4.price.version`. |
| `versions[].effective_from` | string | an RFC 3339 time in UTC (`Z`) |
| `versions[].source` | string | not empty: where the Author read the prices, and when |
| `versions[].entries` | list | not empty; no two entries with the same (`provider`, `model`) |
| `entries[].provider` | string | a `gen_ai.provider.name`: `aws.bedrock`, `local`, `synthetic`, … |
| `entries[].model` | string | the exact model ID the adapter sends, or `*` (any model of that provider) only when every price in the entry is 0 |
| `entries[].input`, `entries[].output` | USD per million tokens | required; 0 to 1,000, with at most 6 decimal places; or a placeholder |
| `entries[].cache_read_input` | USD per million tokens | optional. When absent, cache-read tokens are priced at the `input` price, which never undercounts. |

**The active version** is the latest one whose `effective_from` is at or before the gateway clock. It is looked up on every call, so a version with a future date takes over by itself. **Lookup** tries the exact (`provider`, `model`) first, then (`provider`, `*`).

### 2.2 Example

The foundations branch commits the first version. The Author appends the second in US5, once the Bedrock model and its price are confirmed: a published version never changes (P5), so the Bedrock price arrives as a new, complete version that repeats the other entries.

```yaml
schema: 1
currency: USD
unit: per_million_tokens
versions:
  - id: "2026-10-08.1"
    effective_from: "2026-10-08T00:00:00Z"
    source: "spec 000: local and synthetic only"
    entries:
      - provider: local
        model: "*"                                                   # zero marginal cost
        input: 0
        output: 0
      - provider: synthetic
        model: metered-test                                          # dev's synthetic spend: $0.10 a call
        input: 0
        output: 100
  - id: "<YYYY-MM-DD>.1"                                             # appended by the Author (tasks.md T105)
    effective_from: "<that day, 00:00:00Z or later>"
    source: "<where and when the Author read the Bedrock prices: the pricing page, us-east-1 on-demand>"
    entries:
      - provider: aws.bedrock
        model: "<inference-profile ID the Author confirms>"          # the same string as routing.yaml
        input: "<USD per million input tokens, from the Bedrock pricing page>"
        output: "<USD per million output tokens, from the Bedrock pricing page>"
        cache_read_input: "<USD per million cache-read tokens, from the Bedrock pricing page>"
      - provider: local
        model: "*"
        input: 0
        output: 0
      - provider: synthetic
        model: metered-test
        input: 0
        output: 100
```

The placeholders show what the Author fills before committing the second version; a committed version holds none.

### 2.3 How cost is computed

```text
P_in, P_out, P_cache = the entry's prices in integer micro-USD per million tokens
cost_micro = ceil( (input_tokens × P_in + output_tokens × P_out + cache_read_tokens × P_cache) / 1,000,000 )
```

- **Arithmetic** is BigInt. The sum is rounded up to the next micro-USD once, never per term.
- **Example, the synthetic call:** $100 per million tokens is 100,000,000 micro-USD per million. 1,000 × 100,000,000 / 1,000,000 = 100,000 micro-USD, exactly $0.10.
- **Example, rounding up.** These prices are illustrative, not any provider's: input $0.123456 and output $0.654321 per million tokens, so P_in = 123,456 and P_out = 654,321. A call with 41 input tokens and 18 output tokens: 41 × 123,456 + 18 × 654,321 = 5,061,696 + 11,777,778 = 16,839,474. Divided by 1,000,000 that is 16.84, so it costs 17 micro-USD.
- **Where cost goes:** the meter, the ledger, and every span's `h4.cost.usd`. The span's value is 0 for local calls, so Langfuse never prices from its own table ([plan.md §5.7](../plan.md#57-telemetry)).

### 2.4 Validation errors

| Rule | Error |
|---|---|
| P1 | `versions: effective_from must strictly increase, and ids must be unique` |
| P2 | `versions[<i>].entries[<j>].<price>: at most 6 decimal places, from 0 to 1000` |
| P3 | `versions[<i>].entries[<j>].model: "*" is allowed only when every price in the entry is 0` |
| P4 | `versions[<i>].entries: provider and model "<p>/<m>" appear twice` |
| P5 | append-only, checked by `validate-config` in a git checkout: `versions[<i>]: differs from the same version on main; published versions never change`. When `main` has the file, its versions must open this file's list unchanged and in order. Without git or without the file on `main`, this is a NOTE. |
| P6 | any unknown key, wrong type, or bad timestamp, named by its path |
| P7 | `versions[<i>].entries[<j>]`: the model of a `paid` adapter in routing.yaml is priced at 0 for input or output; a paid model is never free (checked across files) |

### 2.5 Startup refusals (exit 78)

| Reason | When |
|---|---|
| `no_active_price_version` | no version's `effective_from` is at or before the gateway clock |
| `price_missing` | a routed `paid` or `synthetic` adapter's (`provider`, `model`) has no entry in the active version, or in any later version. An unknown cost can't be metered ([plan.md §5.3](../plan.md#53-configuration-routing-prices-budgets-alerts)). |
| `placeholder_value` | an entry the route uses still holds a placeholder |
| `invalid_config` | any §2.4 error other than P5 |

## 3. `config/budgets.yaml`

It sets the ceilings, the fallback sub-budget, the warning ratio, the request limits, and the timing (FR-025, FR-030, FR-031). It is human-only. The thresholds are keyed by `H4_ENV`: dev and dev-cpu share `dev`, whose meter applies the same numbers to synthetic spend (FR-036).

### 3.1 Fields

| Field | Type | Rule |
|---|---|---|
| `schema` | integer | `1` |
| `timing.timezone` | string | `UTC`, and nothing else (FR-031; Clarifications, 2026-10-08) |
| `timing.reservation_ttl_s` | integer | 30 to 600, and more than twice `routing.yaml`'s `deadline_ms` in seconds, so a reservation outlives its call and the commit retries ([data-model.md §7.3](../data-model.md#73-commit-of-a-metered-call)) |
| `envs` | map | exactly the keys `prod` and `dev` |
| `envs.<env>.daily_usd` | USD | more than 0 |
| `envs.<env>.monthly_usd` | USD | at least `daily_usd` |
| `envs.<env>.fallback_daily_usd` | USD | more than 0 and at most `daily_usd`: the sub-budget counts inside the daily ceiling (FR-030) |
| `envs.<env>.warn_ratio` | number | more than 0 and less than 1, with at most 4 decimal places |
| `limits.per_client.requests_per_minute` | integer | 1 to 600 |
| `limits.per_client.burst` | integer | 1 to `requests_per_minute` |
| `limits.per_client.requests_per_day` | integer | at least `requests_per_minute` |
| `limits.per_client.metered_in_flight` | integer | 1 to `limits.global.metered_in_flight` |
| `limits.global.metered_in_flight` | integer | 1 to 32 |
| `limits.global.metered_per_minute` | integer | 1 to 600 |
| `limits.per_call.max_input_chars` | integer | 100 to 4,000: all messages of one call together, and the reservation's input bound ([data-model.md §7.2](../data-model.md#72-admission-for-a-metered-call)) |
| `limits.per_call.hello_max_output_tokens` | integer | 1 to `max_output_tokens` |
| `limits.per_call.max_output_tokens` | integer | 1 to 4,096 |

**Derived thresholds,** in micro-USD:
- a ceiling = the amount × 1,000,000;
- a day or month warning = the ceiling × `warn_ratio`, rounded down, so a warning never comes later than the ratio says;
- a fallback grant's warning = its allowance − (`fallback_daily` − `fallback_daily` × `warn_ratio`): the allowance minus $0.60 here.

### 3.2 Example (the plan's values)

```yaml
schema: 1

timing:
  timezone: UTC
  reservation_ttl_s: 120

envs:
  prod:                       # the only class that spends real money (FR-031)
    daily_usd: 5.00
    monthly_usd: 20.00
    fallback_daily_usd: 2.00  # per grant; a renewal grants a fresh $2 inside the daily ceiling (FR-030)
    warn_ratio: 0.70
  dev:                        # dev and dev-cpu: the same thresholds, applied to synthetic spend (FR-036)
    daily_usd: 5.00
    monthly_usd: 20.00
    fallback_daily_usd: 2.00
    warn_ratio: 0.70

limits:
  per_client:  { requests_per_minute: 20, burst: 5, requests_per_day: 500, metered_in_flight: 1 }
  global:      { metered_in_flight: 4, metered_per_minute: 60 }
  per_call:    { max_input_chars: 2000, hello_max_output_tokens: 128, max_output_tokens: 512 }
```

A unit test pins prod's derived warnings at 3,500,000, 14,000,000, and 1,400,000 micro-USD: $3.50, $14.00, and $1.40, as FR-030 states them.

### 3.3 Validation errors

| Rule | Error |
|---|---|
| B1 | `timing.timezone: must be UTC (FR-031)` |
| B2 | `envs.<env>.fallback_daily_usd: must be at most daily_usd; the sub-budget counts inside the daily ceiling (FR-030)` |
| B3 | `envs.<env>.monthly_usd: must be at least daily_usd` |
| B4 | `envs.<env>.warn_ratio: must be more than 0 and less than 1` |
| B5 | `limits.<path>: <rule above>` |
| B6 | `timing.reservation_ttl_s: must be more than twice routing.yaml's deadline_ms in seconds` (checked across files) |
| B7 | any unknown key, wrong type, or more than 6 decimal places, named by its path |
| B8 | `envs.dev: must equal envs.prod`: FR-031's "the dev stack's meter applies the same thresholds", so the breach test always rehearses prod's ceilings |

Any of these at startup is exit 78 (`invalid_config`).

## 4. `config/alerts.yaml`

It sets the channel order, the retry schedule, the daily reminder, the subject prefixes, and the stand-in endpoints (FR-032). It is human-only, because alert routing is a prohibited-without-a-human change in the constitution. The channels' credentials and addresses are secrets, so they live in the stack's env file, never here ([env-files.md](env-files.md)).

### 4.1 Fields

| Field | Type | Rule |
|---|---|---|
| `schema` | integer | `1` |
| `channels.order` | list | exactly `[telegram, email]` in spec 000: Telegram primary, email secondary (FR-032). The field exists so a later spec can add a channel with an ADR. |
| `channels.telegram.timeout_ms` | integer | 1,000 to 10,000 |
| `channels.email.timeout_ms` | integer | 1,000 to 30,000 |
| `retry.schedule_s` | list of integers | 1 to 8 entries, each 1 to 300, never decreasing: the waits between attempts |
| `retry.give_up_after_s` | integer | at most 300 (FR-032's 5 minutes). Also, the sum of `schedule_s` plus the slowest channel's timeout, in seconds, must be at most this value, so every attempt falls inside the window. |
| `reminder.at_utc` | string | `HH:MM`, 24-hour, UTC |
| `store_unreachable_after_s` | integer | 10 to 600: how long the store must be unreachable before its in-memory alert |
| `auth_failed.threshold` | integer | 1 to 100 |
| `auth_failed.window_s` | integer | 60 to 3,600 |
| `prefixes` | map | exactly the keys `prod`, `dev`, and `dev-cpu`; each value 1 to 32 characters, all distinct |
| `standin.telegram_base` | string | `http://<single-label host>[:port]`, the in-network Telegram stand-in |
| `standin.smtp_host` | string | a single-label host, the in-network Mailpit |
| `standin.smtp_port` | integer | 1 to 65,535 |

The stand-in endpoints must be single-label, in-network hosts, so stand-in mode can't be pointed at a real service.

### 4.2 Example (the plan's values)

```yaml
schema: 1

channels:
  order: [telegram, email]
  telegram: { timeout_ms: 5000 }
  email:    { timeout_ms: 10000 }

retry:
  schedule_s: [5, 15, 30, 60, 120]   # attempts at 0, 5, 20, 50, 110, and 230 s
  give_up_after_s: 300               # 230 s + the 10 s email timeout = 240 s, inside 300

reminder:
  at_utc: "09:00"                    # daily, while degraded or awaiting renewal

store_unreachable_after_s: 60
auth_failed: { threshold: 3, window_s: 600 }

prefixes:
  prod: "[h4reet.ai prod]"
  dev: "[dev]"
  dev-cpu: "[dev-cpu]"

standin:                             # ALERT_DELIVERY=standin: dev's default, never prod
  telegram_base: "http://telegram-standin:8080"
  smtp_host: mailpit
  smtp_port: 1025
```

### 4.3 Validation errors

| Rule | Error |
|---|---|
| A1 | `channels.order: must be [telegram, email] (FR-032: Telegram primary, email secondary)` |
| A2 | `retry: the last attempt starts at <n> s and can run <t> s; both must fit in give_up_after_s (<g> s)` |
| A3 | `retry.give_up_after_s: at most 300 (FR-032: within 5 minutes)` |
| A4 | `reminder.at_utc: must be HH:MM` |
| A5 | `prefixes: needs prod, dev, and dev-cpu, each distinct` |
| A6 | `standin.<field>: must be an in-network host (a single-label name)` |
| A7 | any unknown key, wrong type, or out-of-range value, named by its path |

### 4.4 Startup refusals (exit 78) that combine this file with the environment

| Reason | When |
|---|---|
| `alert_delivery_not_real` | prod's `ALERT_DELIVERY` isn't `real`. Prod refuses `standin`. |
| `telegram_base_not_bot_api` | `ALERT_DELIVERY=real` and `TELEGRAM_API_BASE` isn't exactly `https://api.telegram.org` |
| `smtp_without_tls` | `ALERT_DELIVERY=real` and `SMTP_TLS` is neither `implicit` (port 465) nor `starttls` (587, with `requireTLS`) |
| `missing_alert_env` | `ALERT_DELIVERY=real` and any of `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` is unset |
| `invalid_config` | any §4.3 error |

With `ALERT_DELIVERY=standin`, the gateway uses `standin.*` and ignores the real channel keys. The delivery behavior is in [alerts.md §4](alerts.md#4-channels-delivery-and-retries).

## 5. `validate-config`

`npm run -w services/gateway validate-config` runs as the `validate-config` target of `make check` ([plan.md §11](../plan.md#11-local-gates-fr-041)). It runs the same validators the gateway runs at startup, from the same module (`src/config/validate.ts`), so the gate and the runtime can't disagree. It needs no daemon and no network, so it runs in the sandbox.

1. **The four files:** every rule in §1.3, §2.4, §3.3, and §4.3, plus the cross-file checks: every routed adapter has a price, `deadline_ms` against `reservation_ttl_s`, and the synthetic adapter's price entry.
2. **Every env template,** against the environment-dependent startup checks of §1.4, §2.5, and §4.4 and [plan.md §5.8](../plan.md#58-startup-refusals):
   - `deploy/env.example/prod.env.example` as `H4_ENV=prod`;
   - `deploy/env.example/dev.env.example` as `H4_ENV=dev`;
   - `deploy/env.agents/dev-cpu.vars` as `H4_ENV=dev`.

   `__GENERATE__` and `__ASK__` count as present values of the right shape. The prod template must:
   - enable no dev-only switch and no payload sampling (FR-036);
   - set `ALERT_DELIVERY=real`, `TELEGRAM_API_BASE=https://api.telegram.org`, and `SMTP_TLS` to `implicit` or `starttls`.

   The key list is in [env-files.md](env-files.md).
3. **The append-only check** of `config/prices.yaml` against `main` (P5), when run in a git checkout.

It prints one line per error or note, then a summary:

```text
NOTE config/routing.yaml: adapters.bedrock.model: placeholder; no route names it until the Author fills it
validate-config: 0 errors, 1 note
```

It exits 0 when there are no errors, notes or not, and 78 when there is any error. `make check` shows the result as PASS or FAIL.
