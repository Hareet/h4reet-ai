# ADR 0005: Telegram primary / email secondary alerting; no SNS SMS

Status: proposed, 2026-10-08 · Spec: 000 (FR-007, FR-032, FR-033, FR-034, FR-036; SC-002; User Story 2 scenarios 2 to 4; Edge cases, "Alert channel down")

## Context

FR-032: a warning threshold alerts through Telegram (primary) and email (secondary) within 5 minutes. Alerts carry operational facts only. The constitution sets the same channels: "Telegram bot as primary channel, email as secondary; both free. Automated degradation never depends on an alert being delivered."

The Author's answer on the email channel, from spec.md's Clarifications of 2026-10-07: "Over SMTP from a dedicated alerts mailbox (a free account used only to send alerts), with its app password in a local environment file outside the repository and outside agent context."

Taken literally: the password, like every other secret the host stacks run with, sits in `~/.config/h4reet-ai/env/<stack>.env`, outside the repository's directory, mode 0600 in a 0700 directory, never committed, and denied to agents by name and by path (FR-007). The operator tokens and the runtime AWS identity live in the same directory, so one deny covers all three. `deploy/env/` inside the working tree stays empty and denied, as a tripwire.

## Decision

- One outbox. The gateway writes the alert row in the same transaction as the crossing, the trip, or the fallback exhaustion. The dispatcher sends afterwards. Degradation is committed before any delivery is tried.
- Telegram through the Bot API (plain text), and email through SMTP with TLS (nodemailer). Retries at 5, 15, 30, 60, and 120 seconds, so every attempt falls inside 300 seconds. A channel still failing at 300 seconds is marked failed.
- Dedupe key `stack:kind:meter:period`. For the fallback meter, the period is the UTC day plus the grant number, because warnings and exhaustion alerts are per grant (ADR 0001).
- One reminder a day at 09:00 UTC while the runtime is degraded or awaiting renewal. One confirmation for every operator action (FR-034).
- Content: threshold, meter values, runtime state, time, and an alert ID. Never payloads, client identifiers, or secrets.
- Dev and dev-cpu alerts carry a `[dev]` or `[dev-cpu]` prefix and go to stand-in receivers: a Telegram stand-in and Mailpit, under profile `dev-receivers`. The exception is `--delivery real`, the Author's recorded run (SC-002).
- The secret names `TELEGRAM_BOT_TOKEN` and `SMTP_PASSWORD` are denied to agents by name (FR-007).
- If the store is unreachable, the outbox cannot be written. The gateway then sends one deduplicated in-memory alert after 60 seconds.

## Alternatives considered

- SNS or SES. Rejected: cloud resources in a spec that creates none, and a cost.
- SNS SMS. Rejected: a paid cloud channel. The constitution wants both channels free.
- PagerDuty. Rejected: not free, and the constitution names Telegram and email.
- ntfy. Rejected: the constitution names Telegram and email as the two channels.
- Sending inline from the request path. Rejected: a crash loses the alert, and a slow channel delays the answer.

## Consequences

- Cost: $0. Telegram is free. The alerts mailbox is a free account used only for alerts.
- Degraded mode: one channel down means the other still sends, and the failure shows in `h4_alerts_total` and on a dashboard panel. With both down, the state change is still committed, and degradation holds. The gateway never waits on delivery.
- Tests: the dev breach test asserts delivery against the stand-ins. The Author's recorded run asserts Telegram's message ID and SMTP's 250 reply, within 5 minutes (SC-002).

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md), [ADR 0020](0020-gateway-state-store-and-meter.md), [ADR 0014](0014-github-side-requirements-to-a-publication-spec.md)
