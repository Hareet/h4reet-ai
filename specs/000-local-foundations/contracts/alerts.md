# Contract: alerts and incident drafts

This contract defines every alert the gateway sends: its kind, trigger, dedupe key, text, and delivery (FR-032, FR-033, FR-034). It also defines the incident `intent.md` a breach drafts (FR-035). The outbox and incident rows are in [data-model.md §2.7–§2.8](../data-model.md#27-alert_outbox-alerts-committed-with-their-cause). The channel settings are in [config-files.md §4](config-files.md#4-configalertsyaml), and the channel credentials in [env-files.md](env-files.md). [plan.md §5.6](../plan.md#56-alerts-and-incidents), [research.md R-18](../research.md#r-18-alerts-a-transactional-outbox-telegram-then-smtp-adr-0005), and [ADR 0005](../../../docs/adr/0005-telegram-and-smtp-alerting.md) summarize the decisions.

## 1. Principles

- **Detection is deterministic,** in the gateway's own transactions, and never involves a model (lifecycle.md, "The first control band").
- **Degradation never waits on delivery** (the constitution's Alerting standard). An alert row is committed in the same transaction as the crossing, trip, exhaustion, or operator action that caused it. The dispatcher sends it afterwards. A crash can't lose it, and a slow channel can't delay a request.
- **Two free channels,** each attempted on its own: Telegram (primary) and email over SMTP (secondary).
- **Operational facts only:** which threshold, the meter values, the runtime state, the time, and the alert's ID. Never payloads, client identifiers, or secrets (FR-032; §5).

## 2. Kinds, triggers, and dedupe keys

A dedupe key has the form `<stack>:<kind>:<meter or subject>:<period>`, with `:g<n>` added for a fallback grant. The stack is `H4_STACK`. The outbox's `UNIQUE (dedupe_key)` makes each key alert once.

| Kind | Trigger | Written by | Dedupe key | Example key |
|---|---|---|---|---|
| `warn` (day) | committed day spend crosses 70% of the daily ceiling ($3.50) | the commit transaction | `<stack>:warn:day:<YYYY-MM-DD>` | `prod:warn:day:2026-10-28` |
| `warn` (month) | committed month spend crosses 70% of the monthly ceiling ($14.00) | the commit transaction | `<stack>:warn:month:<YYYY-MM>` | `prod:warn:month:2026-10` |
| `warn` (fallback grant) | committed fallback spend crosses 70% of the current $2 grant: the allowance minus $0.60 | the commit transaction | `<stack>:warn:fallback_day:<YYYY-MM-DD>:g<n>` | `prod:warn:fallback_day:2026-10-28:g1` |
| `trip` | committed spend reaches the daily or monthly ceiling, and `degraded` is set in the same transaction (FR-033) | the commit transaction | `<stack>:trip:<day\|month>:<period>` | `prod:trip:day:2026-10-29` |
| `fallback_exhausted` | committed fallback spend reaches the allowance, and the renewal flag is set (FR-030) | the commit transaction | `<stack>:fallback_exhausted:fallback_day:<YYYY-MM-DD>:g<n>` | `prod:fallback_exhausted:fallback_day:2026-10-28:g1` |
| `operator_action` | an accepted `reset`, `renew`, or `init` (FR-034), so an unexpected one gets noticed | the operator transaction | `<stack>:operator_action:<action>:<audit id>` | `prod:operator_action:reset:41` |
| `credentials_expiring` | the paid adapter's SSO session ends within `credentials_warn_before_s` (2 h) | the 10 s ticker | `<stack>:credentials_expiring:<adapter>:<session end, YYYY-MM-DDTHH:MMZ>` | `prod:credentials_expiring:bedrock:2026-10-29T18:00Z` |
| `fallback_unavailable` | the paid fallback adapter's effective health turns unhealthy: credentials missing or expired, or the circuit opened | the 10 s ticker | `<stack>:fallback_unavailable:<adapter>:<YYYY-MM-DDTHHZ>` (at most one an hour) | `prod:fallback_unavailable:bedrock:2026-10-29T16Z` |
| `auth_failed` | the third failed authentication in a 10-minute window, counted in memory ([operator-admin.md §1.1](operator-admin.md#11-authentication)) | the admin listener | `<stack>:auth_failed:admin:<start of the 10-minute window, YYYY-MM-DDTHH:M0Z>` | `prod:auth_failed:admin:2026-10-29T16:00Z` |
| `store_unreachable` | the store has been unreachable for 60 s straight | in memory: the outbox is in the unreachable store | `<stack>:store_unreachable:store:<outage start, to the second>`, deduplicated in memory | `prod:store_unreachable:store:2026-10-29T16:01:00Z` |
| `reminder` | 09:00 UTC by the gateway clock, while the stack is degraded or awaiting renewal (from a condition that began before that day's 09:00: a trip later in the day is reminded of the next morning, as §3's example shows; tasks.md T077) | the 10 s ticker | `<stack>:reminder:daily:<YYYY-MM-DD>` | `prod:reminder:daily:2026-10-30` |

Notes:
- **Grants.** The grant number `<n>` is the `fallback_day` row's `grant_no`: 1 for the day's own $2, plus one for each renewal that day. Warnings and exhaustion therefore alert once per grant (ADR 0001).
- **Periods** are the ones the call was charged to: its reservation's.
- **No alert of their own:** the test endpoints, the live adapter endpoint, and alert-delivery failures. Delivery failures are a metric and a dashboard panel (§4.4).
- **Outside prod.** `credentials_expiring` and `fallback_unavailable` can only fire in prod, because only prod routes a paid adapter.
- **When `fallback_unavailable` fires** (tasks.md T152). The paid fallback's effective health enters one of the two reasons: `credentials`, or `circuit_open`. That happens on a flip to unhealthy, at the first probe that finds it so after startup's `not_ready`, or on a change to one of them while unhealthy. A timeout or a refused connection alerts through the circuit, once it opens. The row isn't queued while the store is empty or down, since the store's own state answers for the stack then. The hourly dedupe key, on the gateway clock, holds it to one an hour per adapter.

**(spec 010, Amendment 0-8)** The adapter month's two kinds reuse `warn` and `fallback_exhausted`: the warning, keyed `<stack>:warn:adapter_month:<adapter>:<YYYY-MM>`, when committed spend on a capped adapter's month crosses the cap × `warn_ratio`; the exhaustion, keyed `<stack>:fallback_exhausted:adapter_month:<adapter>:<YYYY-MM>`, when it crosses the cap. `fallback_unavailable` names an `anthropic-messages` adapter by its type's label, "the Anthropic API".

## 3. Message format

Plain text, UTF-8, at most 1,000 characters:

```text
<prefix> <HEADLINE>: <one-line summary>
Daily: <spent> / <ceiling> USD (warning <w>) · Month: <spent> / <ceiling> (warning <w>) · Fallback today: <spent> / <allowance> (grant <n>)
Runtime: <normal | degraded since <time>> · Fallback: <available | awaiting renewal since <time> | none> · <time> · id <dedupe key>
<one fixed sentence for the kind, where it has one>
Runbook: docs/runbooks/<page>.md
```

- **Telegram** gets the whole text. **Email** gets line 1 as its subject and the whole text as its body.
- **The prefix** comes from `config/alerts.yaml`: `[h4reet.ai prod]`, `[dev]`, or `[dev-cpu]`.
- **Amounts** are in USD with two decimals, truncated toward zero, so a display never shows more than was spent. The outbox row's `facts` keep the exact micro-USD values.
- **Times** are RFC 3339 in UTC, to the second, on the gateway clock. In dev, with a test-clock offset, a time is followed by ` (test clock)`.
- **Dev-class stacks** end the meters line with ` (synthetic spend)`.
- **Missing lines.** A kind with no meter facts, such as `store_unreachable`, omits the meters line.

One example per kind:

**`warn`, day:**

```text
[h4reet.ai prod] WARNING: daily meter at 70%
Daily: 3.50 / 5.00 USD (warning 3.50) · Month: 9.10 / 20.00 (warning 14.00) · Fallback today: 0.40 / 2.00 (grant 1)
Runtime: normal · Fallback: available · 2026-10-28T14:02:11Z · id prod:warn:day:2026-10-28
Runbook: docs/runbooks/cost-warning.md
```

**`warn`, month:**

```text
[h4reet.ai prod] WARNING: monthly meter at 70%
Daily: 1.20 / 5.00 USD (warning 3.50) · Month: 14.03 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 1)
Runtime: normal · Fallback: available · 2026-10-29T10:15:00Z · id prod:warn:month:2026-10
Runbook: docs/runbooks/cost-warning.md
```

**`warn`, fallback grant:**

```text
[h4reet.ai prod] WARNING: fallback sub-budget at 70% of grant 1
Daily: 2.10 / 5.00 USD (warning 3.50) · Month: 11.20 / 20.00 (warning 14.00) · Fallback today: 1.40 / 2.00 (grant 1, warning 1.40)
Runtime: normal · Fallback: available · 2026-10-28T11:40:52Z · id prod:warn:fallback_day:2026-10-28:g1
Runbook: docs/runbooks/cost-warning.md
```

**`trip`:**

```text
[h4reet.ai prod] KILL SWITCH TRIPPED: daily ceiling reached
Daily: 5.00 / 5.00 USD (warning 3.50) · Month: 13.40 / 20.00 (warning 14.00) · Fallback today: 2.00 / 4.00 (grant 2)
Runtime: degraded since 2026-10-29T16:40:03Z · Fallback: available · 2026-10-29T16:40:03Z · id prod:trip:day:2026-10-29
Every request now gets the degraded response, local answers included. Only an operator reset restores service.
Runbook: docs/runbooks/kill-switch-trip.md
```

**`fallback_exhausted`:**

```text
[h4reet.ai prod] FALLBACK EXHAUSTED: grant 1 of today's sub-budget is spent
Daily: 3.60 / 5.00 USD (warning 3.50) · Month: 12.10 / 20.00 (warning 14.00) · Fallback today: 2.00 / 2.00 (grant 1)
Runtime: normal · Fallback: awaiting renewal since 2026-10-28T12:05:37Z · 2026-10-28T12:05:37Z · id prod:fallback_exhausted:fallback_day:2026-10-28:g1
Fallback stays refused, across days and restarts, until the operator renews it.
Runbook: docs/runbooks/fallback-renewal.md
```

**`operator_action`.** The headline names the action and the actor's fingerprint, never the reason:

```text
[h4reet.ai prod] OPERATOR ACTION: reset by operator #<8 hex>
Daily: 5.00 / 5.00 USD (warning 3.50) · Month: 13.40 / 20.00 (warning 14.00) · Fallback today: 2.00 / 4.00 (grant 2)
Runtime: normal · Fallback: available · 2026-10-29T17:05:12Z · id prod:operator_action:reset:41
Local answers resume. Metered calls stay refused while a meter is at or above its ceiling: day.
Runbook: docs/runbooks/kill-switch-reset.md
```

| Action | Headline | Fixed sentence | Runbook |
|---|---|---|---|
| `reset` | `OPERATOR ACTION: reset by operator #<8 hex>` | Local answers resume. Metered calls stay refused while a meter is at or above its ceiling: `<meters>`. (The second sentence is omitted when no meter is at its ceiling.) | `kill-switch-reset.md` |
| `renew` | `OPERATOR ACTION: fallback renewed by operator #<8 hex>` | $2.00 more fallback is available now, within the daily ceiling (grant `<n>`). | `fallback-renewal.md` |
| `init` | `OPERATOR ACTION: store initialized by operator #<8 hex>` | Meters rebuilt from `<sources>`; renewal `<pending \| granted>`. | `store-initialization.md` |

**`credentials_expiring`:**

```text
[h4reet.ai prod] CREDENTIALS EXPIRING: the Bedrock SSO session ends at 2026-10-29T18:00:00Z
Daily: 0.30 / 5.00 USD (warning 3.50) · Month: 13.70 / 20.00 (warning 14.00) · Fallback today: 0.30 / 2.00 (grant 1)
Runtime: normal · Fallback: available · 2026-10-29T16:00:04Z · id prod:credentials_expiring:bedrock:2026-10-29T18:00Z
Fallback to Bedrock stops then. Run make aws-login in your terminal.
Runbook: docs/runbooks/bedrock-credentials-expiring.md
```

**`fallback_unavailable`:**

```text
[h4reet.ai prod] FALLBACK UNAVAILABLE: bedrock is unhealthy (circuit open)
Daily: 0.30 / 5.00 USD (warning 3.50) · Month: 13.70 / 20.00 (warning 14.00) · Fallback today: 0.30 / 2.00 (grant 1)
Runtime: normal · Fallback: available · 2026-10-29T16:12:44Z · id prod:fallback_unavailable:bedrock:2026-10-29T16Z
If the local model goes down, hello answers degraded with fallback_unavailable.
Runbook: docs/runbooks/bedrock-unavailable.md
```

The parenthesis names the health reason: `credentials` or `circuit open`.

**`auth_failed`:**

```text
[h4reet.ai prod] AUTH FAILURES: 3 failed operator authentications in 10 minutes
Runtime: normal · Fallback: available · 2026-10-29T16:02:11Z · id prod:auth_failed:admin:2026-10-29T16:00Z
The admin listener refused them (last: wrong prefix). No action was taken.
Runbook: docs/runbooks/operator-auth-failures.md
```

The class in the sentence is `missing`, `malformed`, `wrong prefix`, or `mismatch`. The token is never shown.

**`store_unreachable`:**

```text
[h4reet.ai prod] STORE UNREACHABLE: the kill-switch store hasn't answered for 60 s
Runtime: unknown, treated as degraded since 2026-10-29T16:01:00Z · 2026-10-29T16:02:00Z · id prod:store_unreachable:store:2026-10-29T16:01:00Z
Every request gets 503 store_unreachable (fail closed). Meters and alerts resume when the store answers.
Runbook: docs/runbooks/store-unreachable.md
```

**`reminder`:**

```text
[h4reet.ai prod] REMINDER: still degraded since 2026-10-29T16:40:03Z (daily ceiling, 2026-10-29)
Daily: 0.00 / 5.00 USD (warning 3.50) · Month: 13.40 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 1)
Runtime: degraded since 2026-10-29T16:40:03Z · Fallback: available · 2026-10-30T09:00:00Z · id prod:reminder:daily:2026-10-30
Only an operator reset restores service.
Runbook: docs/runbooks/kill-switch-trip.md
```

While renewal is pending, the sentence adds "Only a renewal restores fallback." One reminder covers both conditions.

(Added by tasks.md T069, which needed the cases the example leaves out.) Several crossed ceilings are listed in `crossed`'s order, separated by `; `: `(daily ceiling, 2026-10-29; monthly ceiling, 2026-10)`. While the stack is normal and only renewal is pending, the headline is `REMINDER: fallback still awaiting renewal since <time>`, the sentence is "Only a renewal restores fallback.", and the runbook is `fallback-renewal.md` (§6). A reset's sentence names both meters as `day and month` when both are at their ceiling.

**A dev example** (the breach test, on the test clock):

```text
[dev] WARNING: daily meter at 70%
Daily: 3.50 / 5.00 USD (warning 3.50) · Month: 3.50 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 1) (synthetic spend)
Runtime: normal · Fallback: available · 2026-10-27T08:01:30Z (test clock) · id dev:warn:day:2026-10-27
Runbook: docs/runbooks/cost-warning.md
```

**(spec 010)** The adapter month's texts name the adapter by its type's label ("the Anthropic API's month"), the month, its spend, and its cap, and say what stops: the warning, "the paid fallback stops at its cap; local answers go on"; the exhaustion, "the Anthropic API is refused until the month rolls over or the cap is raised, and the paid fallback awaits a renewal". The meters line and the canary rules are unchanged.

## 4. Channels, delivery, and retries

### 4.1 The dispatcher

- **Where it runs:** in the gateway process, so no second service needs egress ([plan.md §1](../plan.md#1-topology)).
- **When it wakes:** on `LISTEN alert_outbox`, or every 2 s. It claims due rows with `SELECT … FOR UPDATE SKIP LOCKED`. When the LISTEN connection ends on its own, as when Postgres restarts under the running gateway, the next pass listens again on a fresh connection, and the 2 s poll covers the gap (tasks.md T077, review).
- **Independent channels.** One channel's failure never delays or stops the other.

| Channel | Request | Timeout | Success | Recorded reference |
|---|---|---|---|---|
| Telegram | `POST {base}/bot<TELEGRAM_BOT_TOKEN>/sendMessage` over `node:http(s)`, its host resolved through c-ares, JSON `{chat_id, text, disable_web_page_preview: true}`, with no `parse_mode` (plain text). `base` is `TELEGRAM_API_BASE`, which prod requires to be `https://api.telegram.org`. No redirect is followed. | 5 s, from the lookup to the answer's last byte | HTTP 200 with `"ok": true` | `result.message_id` |
| Email | nodemailer 10.0.16 to `SMTP_HOST:SMTP_PORT`, over a connection the gateway makes through c-ares: implicit TLS on 465 (`secure: true`) or STARTTLS on 587 (`requireTLS: true`), certificates verified, AUTH with `SMTP_USER` and `SMTP_PASSWORD`. From `ALERT_EMAIL_FROM` to `ALERT_EMAIL_TO`, `text/plain` only, with the headers `Auto-Submitted: auto-generated` and `X-H4-Alert-Id: <dedupe key>`. | 10 s | a 250 reply to the message | the reply code and the server's queue ID |

**The Telegram URL contains the bot token.** The dispatcher never logs a request URL, never stores one, and records only an error class: `timeout`, `connect`, `tls`, `http_<status>`, `telegram_<error_code>`, `smtp_<reply code>`, `smtp_<nodemailer code>`.

(Tasks.md T156.) The email reference comes from the server's own reply line: its 2xx code and, when the reply names one, its queue ID. A message nodemailer reports accepted with a reply that can't be read is delivered with no reference: `email_ref` and `alert.delivered`'s `provider_ref` are null, never an assumed `250`.

(Tasks.md T188.) The Telegram channel sends over `node:http(s)`, as the local adapter does, not `fetch`, with its host resolved through c-ares (provider-adapter.md §3.1's departure). At T084's pre-run, while the model server was stopped, the gateway's lookups of it held the two threads libuv gives lookups, and every Telegram send timed out waiting for its own lookup in the queue behind them. A redirect is `http_<status>`, since nothing follows it; at most 64 KiB of an answer is kept. A host that doesn't resolve is `connect`, as a refused connection is, and a peer that doesn't speak TLS on an `https` base is `tls` (`EPROTO`).

(Tasks.md T189.) nodemailer resolves a host name through c-ares, but falls back to `getaddrinfo` whenever c-ares finds no address, a SERVFAIL or a timeout included, and a `getaddrinfo` the resolver doesn't answer holds one of the two threads libuv gives lookups. So the email channel connects to `SMTP_HOST` itself, through c-ares alone (`core/resolve.ts`), and hands nodemailer the connected socket through its `getSocket` hook. nodemailer resolves nothing, and speaks SMTP and TLS over that socket. TLS asks for the host's name and checks the certificate against it, on 465 and after STARTTLS alike. Against nodemailer's own resolving:
- **Kept:** every address the host has is tried, within the same attempt. The addresses c-ares last found for the host are used when a lookup fails, as nodemailer's cache was through a resolver outage. A host with no address, now or before, is `connect`, as nodemailer's own `EDNS` was.
- **Changed:** the addresses are tried in the resolver's order, each for 250 ms before the next but the last, as net does for the Telegram channel. nodemailer picked one at random first, and moved to the next only after a failed connect. On 465 that included a failed TLS handshake, since nodemailer connected with TLS from the start; now only a failed TCP connect moves to the next address, and a TLS failure ends the attempt. The host is looked up at every attempt, where nodemailer reused an answer for 5 minutes. The connection timeout now bounds the lookup and the connect together; nodemailer started it after the lookup, which ran under its own 30 s DNS timeout. When every address fails, the class is `connect`, as nodemailer reported its last address's failure.
- **Lost:** `/etc/hosts` and resolv.conf's search domains. c-ares asks for the name as given. In stand-in mode `SMTP_HOST` is Mailpit's compose name, which the engine's DNS answers. In real mode it is assumed to be a full name; config validation checks only that it is set. A short name that resolved only through the search domains now gives `connect` (the runbook says so). Compose gives the gateway no `extra_hosts`, so `/etc/hosts` holds nothing it needs.

(Tasks.md T190.) On email, `tls` is a failed TLS handshake on 465 or after STARTTLS: a certificate that doesn't verify or doesn't name the host, a server that doesn't speak TLS there, or a connection dropped once the server had begun its handshake. A connection dropped before the server sent a byte had no handshake to fail, and keeps `smtp_ESOCKET` (T190's review: a load balancer with no backend drops one on 465). nodemailer reports these as `ESOCKET`, overwriting the error's code (a close during a STARTTLS upgrade can be its own `ETLS`, the same class), so the class comes from what the gateway sees first. Its own TCP socket marks the errors it raises itself, and `getSocket` hands nodemailer the transport's TLS options with Node's host-name check wrapped to note that the certificate passed. An `ESOCKET` the TCP socket didn't raise, before the certificate passed and after the server sent a byte (the TCP socket's `bytesRead`), is rethrown as a fresh `ETLS` error with nothing of the certificate or Node's message in it. A refused STARTTLS is `smtp_<reply code>` (`smtp_454`), and a reset before STARTTLS or after the handshake is `smtp_ESOCKET`.

(Departures and readings, tasks.md T077.) nodemailer writes the header's name as `X-H4-Alert-ID`, normalizing the case of every header it sends; header names are case-insensitive, so it is the same header. `telegram_<error_code>` is for an HTTP 200 whose body says `"ok": false`; any other status is `http_<status>`. A claimed row's due time moves past its attempt's timeout before the attempt (a lease), so a stalled process can't send it twice; an outcome the store can't take while it is down is kept in memory and written once it answers, without sending again.

### 4.2 The retry schedule

- **When attempts are due.** Attempt k of a channel is due at `enqueued_at` plus the k-th offset: 0, 5, 20, 50, 110, and 230 s. Those are the running sums of `retry.schedule_s` (5, 15, 30, 60, 120). An attempt that would start before the previous one ended starts right after it.
- **Every attempt starts within 300 s.** The last starts at 230 s and runs at most 10 s, so all fall within FR-032's 5 minutes.
- **Giving up.** A channel still undelivered when the next attempt would pass `give_up_after_s` (300 s) is marked `failed` for that alert.
- **Real time.** The schedule uses real time, so a dev test-clock jump neither speeds it up nor stalls it.

### 4.3 Prefixes and receivers

| Stack | Prefix | `ALERT_DELIVERY` | Where alerts go |
|---|---|---|---|
| prod | `[h4reet.ai prod]` | `real`, required: prod refuses `standin` (exit 78) | the Author's Telegram chat and the alerts mailbox |
| dev | `[dev]` | `standin` by default | the in-network stand-ins: `telegram-standin` (a stdlib server mimicking `/bot<token>/sendMessage`, with `GET /messages`) and Mailpit (SMTP on 1025), from `config/alerts.yaml` `standin`, under the compose profile `dev-receivers` |
| dev, `--delivery real` | `[dev]` | `real`, set by the second env file the Author's recorded run adds ([plan.md §8](../plan.md#8-the-breach-test)) | the same bot and chat as prod, with the `[dev]` prefix. The run asserts Telegram's `message_id` and SMTP's 250 in the `alert.delivered` log records within 300 s (SC-002). |
| dev-cpu | `[dev-cpu]` | `standin` | the stand-ins inside the agents' engine. The engine has no route to Telegram or SMTP. |

In stand-in mode, the gateway sends the stand-in a fixed dummy token (`standin`) and chat ID `0`, never the real bot token. (Added by tasks.md T077, since this table gives no stand-in addresses.) Email in stand-in mode goes from `alerts@h4reet.local` to `operator@h4reet.local`, dev-cpu.vars' own dummies, with no SMTP AUTH and no TLS, to Mailpit inside the stack.

### 4.4 Outcomes and when something is down

- **Metrics:** `h4.alerts` (`h4.channel`, `h4.alert.kind`, `h4.outcome`) and `h4.alert.delivery_lag`, measured from `enqueued_at` to delivery ([telemetry.md](telemetry.md)). They feed the dashboard's alert panel and the "alert channel down" runbook.
- **Logs:** `alert.delivered` (dedupe key, channel, attempt, lag, provider reference) and `alert.failed` (dedupe key, channel, attempts, error class). The breach test's L assertions read them ([plan.md §8](../plan.md#8-the-breach-test)).

| What is down | What happens |
|---|---|
| Telegram | Email continues. Telegram's attempts follow the schedule; if none succeeds it is marked `failed`, counted, and shown on the alert panel. Enforcement is unaffected (the spec's edge case "Alert channel down"). |
| SMTP | The same, the other way round. |
| Both channels | Both are marked `failed`. The trip or exhaustion is already committed, and degradation holds. While degraded or awaiting renewal, the 09:00 reminder tries again each day. |
| The store | No new outbox row can be written. Nothing that writes one can happen either: every request fails closed with `store_unreachable`. The dispatcher keeps attempting the rows it has claimed, since it holds their text, and writes the outcomes when the store answers again. After 60 s, one in-memory `store_unreachable` alert goes out on both channels, with the same schedule. If the process restarts during the outage, it may be sent once more. |
| The gateway process | Pending rows wait in the outbox. After a restart the dispatcher resumes them. A channel whose 300 s window has passed is marked `failed` without another attempt. |
| The collector | Delivery is unaffected. Only the metrics and logs about delivery are lost. |

## 5. What never appears

These never appear in an alert's text, its `facts`, its delivery columns, or the logs about its delivery:
- **Payloads:** prompts, completions, the hello message, the system prompt.
- **Client identifiers:** source addresses and `X-H4-Client` labels. Request IDs and trace IDs are left out too; the incident draft carries trace IDs (§7).
- **Secrets:** the Telegram bot token (§4.1), the SMTP credentials, any operator token or its full hash (only the 8-hex fingerprint), and AWS credentials.
- **The operator's reason text.** It is in the audit log and on the dashboard's audit panel, not in a message sent to a phone.
- **Provider or channel response bodies.** Only error classes are kept.

How this is enforced:
- The formatter (`src/alerts/format.ts`) takes a typed `Facts` object holding only numbers, states, times, the dedupe key, and the fingerprint. It has no field a payload or a client label could arrive through.
- A unit test renders every kind from facts while canaries sit in the ledger, the client label, and the audit reason. It asserts that no canary appears in the output.
- pino's redaction and the collector's redaction processor mask token shapes as a further layer (FR-029, [plan.md §6](../plan.md#6-observability)).

## 6. Runbooks

Each alert, and each degraded cause, points at one page in `docs/runbooks/`, every one listed in [plan.md §16](../plan.md#16-documentation-deliverables).

| Alert or cause | Runbook |
|---|---|
| `warn` | `cost-warning.md` |
| `trip`; the cause `kill_switch_tripped`; `reminder` while degraded | `kill-switch-trip.md` |
| `operator_action` (`reset`); the cause `meter_at_ceiling` | `kill-switch-reset.md` |
| `fallback_exhausted`; `operator_action` (`renew`); the causes `fallback_awaiting_renewal` and `fallback_spent_today`; `reminder` while awaiting renewal | `fallback-renewal.md` |
| `operator_action` (`init`); the cause `store_uninitialized` | `store-initialization.md` |
| `credentials_expiring` | `bedrock-credentials-expiring.md` |
| failed deliveries (the alert panel) | `alert-channel-down.md` |
| the cause `no_fallback_in_stack`; local down in prod | `model-server-down.md` |
| `fallback_unavailable`; the cause `fallback_unavailable` | `bedrock-unavailable.md` |
| `auth_failed` | `operator-auth-failures.md` |
| `store_unreachable`; the cause `store_unreachable` | `store-unreachable.md` |
| the cause `journal_unwritable` | `journal-unwritable.md` |
| the cause `api_unavailable` | `gateway-down.md` |

**(spec 010)** The adapter month's warning and exhaustion map to `docs/runbooks/fallback-renewal.md`, and `fallback_unavailable` for the Anthropic API to `docs/runbooks/anthropic-unavailable.md`.

## 7. Incident drafts (FR-035)

**Trigger.** A trip, a day or month ceiling reached, queues an `incidents` row in the commit transaction ([data-model.md §7.3](../data-model.md#73-commit-of-a-metered-call)).

**Writing the draft.**
- **When:** a background task writes it once both channels of the trip alert are final, or 300 s after the trip, whichever comes first, so the draft can record the alert outcomes.
- **How:** from a deterministic template, with no model call. A breach is the worst moment to spend, and detection never involves a model.
- **Where:** `${GATEWAY_STATE_DIR}/incidents/YYYY-MM-DD-<stack>-<ceiling>.intent.md`. The date is the crossing's UTC date on the gateway clock, and the ceiling is `day` or `month`. On the host that is `~/.local/state/h4reet/<stack>/gateway/incidents/`, which survives the store's volume.
- **The file:**
  - If the name is taken, `-2`, `-3`, … goes before `.intent.md`.
  - It is written under a temporary name and renamed, with mode 0640.
  - Its SHA-256 and relative path go into the row.
  - A write failure leaves the row `queued`, with the error class, and is retried every 10 s.
- **Reading it:** `GET /admin/incidents` ([operator-admin.md §4.3](operator-admin.md#43-get-adminincidents)) and `make operator-incidents ENV=<stack>`.

**Template.** It follows the format of `intent/README.md` ([intent/README.md](../../../intent/README.md)), and adds an Evidence section. Values in braces are filled from the store. Amounts are in USD with six decimals, which is exact.

```markdown
# Intent: Respond to the {daily|monthly} ceiling breach on {stack}, {period_key}
Author: the gateway (automated draft). Status: draft. Created: {YYYY-MM-DD}.

## Problem
The {stack} stack's {daily|monthly} meter reached its ceiling of {ceiling} USD at {crossed_at}.
The kill switch set `degraded` at {degraded_at}, with no human action (FR-033). Every request gets the
degraded response until an operator resets it (FR-034). The evidence below is what the gateway recorded.

## Proposed outcome
To be written by the Author.

## Affected users and systems
The {stack} stack: its hello endpoint, its gateway, and its fallback ({fallback adapter, or "none"}).
No visitor data flows in spec 000.

## Constraints
Principle V: the system degraded itself, and a human must consciously restore it. The constitution's
Incidents rule: an incident note in docs/incidents/ within seven days, and an eval that would have caught
this. A change to a ceiling, the sub-budget, or a limit needs an ADR and the Author's approval.

## Expected cost impact
Metered spend at the crossing: day {day_spent} USD, month {month_spent} USD. Overshoot past the ceiling:
{overshoot} USD, against the bound of 4 calls in flight times the maximum cost per call.

## Data-flow impact
None. This draft was generated inside the stack. It holds no payloads, client identifiers, or secrets.

## Open questions
- What drove the spend? See the hourly totals.
- Did a configuration change or an operator action contribute? See the configuration and the audit trail.
- Which eval or alert would have caught it sooner?

## Evidence

### Meters at the crossing
| Meter | Period | Spent | Reserved | Ceiling or allowance | Warning |
|---|---|---|---|---|---|
| day | {day} | … | … | … | … |
| month | {month} | … | … | … | … |
| fallback_day | {day} | … | … | {allowance} (grant {n}) | … |

### The crossing
- Ceiling: {day|month} {period_key}. Spend before the call: {old} USD; after: {new} USD.
- The crossing call: ledger {ledger_id}, trace {trace_id}, {provider} {model}, attribution {attribution}, cost {cost} USD.
- Crossed at {crossed_at}. `degraded` was set at {degraded_at}, in the same transaction.

### The last 10 metered calls
| Time | Route | Provider | Model | Attribution | Cost (USD) | Trace |
|---|---|---|---|---|---|---|

### Hourly totals, the 24 hours before the crossing (UTC)
| Hour | Provider | Model | Route | Calls | Input tokens | Output tokens | Cost (USD) |
|---|---|---|---|---|---|---|---|

### Daily totals this month (monthly ceiling only)
| Day | Calls | Cost (USD) |
|---|---|---|

### Audit trail, this {day|month}
| Time | Actor | Action | Reason |
|---|---|---|---|

### Configuration
- Routing: config/routing.yaml, SHA-256 {routing_sha}
- Prices: version {price_version}, effective from {effective_from}
- Budgets: day {daily} USD, month {monthly} USD, fallback {fallback_daily} USD a grant, warning ratio {warn_ratio}

### Alerts
| Alert | Telegram | Email |
|---|---|---|
| {trip key} | delivered at {time} (message {message_id}), or failed after {n} attempts ({class}) | delivered at {time} ({reply}), or failed after {n} attempts ({class}) |
| {each warning this period} | … | … |

### Links
- Grafana: http://localhost:{H4_GRAFANA_PORT}/d/h4-runtime?from={crossing − 2 h, ms}&to={crossing + 30 min, ms}&tz=UTC
- The crossing call in Langfuse: http://localhost:{H4_LANGFUSE_PORT}/project/h4reet-{stack}/traces/{trace_id}
```

**The evidence fields** breach step 8 asserts are the Evidence sub-headings above, each with at least the crossing call's row filled ([plan.md §8](../plan.md#8-the-breach-test)):
- the meters and the crossing time;
- the crossing call's trace ID and the last 10 metered calls;
- hourly totals by provider, model, and route, with no client identifiers;
- the audit trail, the routing SHA, and the price version;
- the alert outcomes, and the Grafana link.

The gateway reads `H4_GRAFANA_PORT` and `H4_LANGFUSE_PORT` from its environment for the links ([env-files.md](env-files.md)).

(Departures and readings, tasks.md T078.)
- **Determinism.** `Created` is the crossing's UTC date on the gateway clock, as in the file name, so the same evidence gives the same bytes and the row's SHA-256 identifies the draft.
- **Departures from the template's text.** The daily totals' heading is `### Daily totals this month`, on a monthly draft only; a daily draft has no such section. A ceiling crossed on a stack that was degraded already says "`degraded` was set already, at {since}, by an earlier crossing." in place of "was set at {degraded_at}, in the same transaction", which would be false there; the Problem's `{degraded_at}` is that `since`.
- **What each table holds.** The last 10 metered calls (attribution other than `none`) at or before the crossing, newest first. The hourly totals cover every route, local included, in the 24 hours up to and including the crossing; the daily totals count every call of the month up to the crossing. The audit trail is the period's rows up to the crossing. The Model columns are the request model, which a failed call has too. The Alerts rows are the trip's, then the period's warnings: the crossed meter's, and on a daily draft that day's fallback grant warnings.
- **Clocks.** Every time is the gateway clock's, except the alert outcomes' delivery times, which are the outbox's real time, and the Grafana window, 2 h before to 30 min after the trip audit row's `recorded_at`, since Grafana's series are on the real clock. A draft is due 300 s after the trip alert's `enqueued_at` (real time).
- **The file.** The temporary name is `incidents/.draft-<uuid>.tmp`. The first free name of `…-N.intent.md` is taken at the rename. If the row can't be updated afterwards, the file is removed, so the retry writes the same name again. A write failure logs `incident.draft_failed` when it starts or its class changes. A trip whose own audit row or ledger row is missing, which its transaction rules out, leaves the row `failed` with `no_trip_audit` or `no_crossing_call`.
- **The links' ports.** When the environment doesn't carry them, the stack's fixed values in env-files.md stand in.

**What never goes into a draft:**
- payloads;
- client identifiers: the totals are grouped by provider, model, and route only, never by client;
- secrets.

The audit trail's reasons are the operator's own words, and stay in them.

**How the Author moves a draft into `intent/`.** Agents never write a stack's state directory, and only the Author's own action makes a draft an intent:
1. Read it with `make operator-incidents ENV=prod`, or open the file under `~/.local/state/h4reet/prod/gateway/incidents/`.
2. Copy it to `intent/NNN-<short-name>.md`, using the next free number. Keep `Author: the gateway (automated draft)` and `Status: draft`.
3. Write the Proposed outcome, correct anything the template got wrong, and commit it on a branch, as for any intent (`intent/README.md`, lifecycle step 3: "a breached control band or an incident produces an intent in this format for triage").
4. Follow the runbook (`kill-switch-trip.md`), which carries the constitution's rule: an incident note in `docs/incidents/` within seven days, and an eval that would have caught the breach.

Drafts from dev and dev-cpu, such as every breach test's, stay where they are. They aren't production incidents.
