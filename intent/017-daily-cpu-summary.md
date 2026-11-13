# Intent: a daily CPU summary, with alerts on it
Author: the Author. Status: draft. Created: 2026-11-11.

## Problem

Only the gateway sends alerts today (Telegram, then email; ADR 0004, ADR 0005). Prometheus has no alert rules and Grafana's alerting is off (`deploy/compose.yaml`, `GF_UNIFIED_ALERTING_ENABLED: "false"`), so the stack's CPU use is visible on the dashboard but nothing reports or alerts on it. In the Author's words (2026-11-10, while revising the stack film): "We will get a daily summary on cpu metrics and alerts based off those too. That will be set up by the time someone is viewing this video, so should add it now."

## Proposed outcome

Every day, a summary of the stack's CPU metrics reaches the Author, and an alert fires when those metrics cross a threshold. The stack film (`films/stack`, narration ¶9) already says so, as the Author describes it.

## Affected users and systems

The Author (a new daily message and a new alert); Prometheus and Grafana (rules or alerting turned on); possibly the gateway's alert channels; the dashboard; the runbooks (one page for the new alert).

## Constraints

- The budget's alerts and the kill switch stay the gateway's and never wait on a dashboard (ADR 0004, 0005, 0042).
- A new channel or host is a new data flow: a row in `docs/data-flow-disclosure.md` first.
- Thresholds and the summary's time are configuration, and the summary carries no payloads (`TELEMETRY_PAYLOAD_SAMPLING`).

## Expected cost impact

None in model spend; a little CPU for the rule evaluation.

## Data-flow impact

Depends on the channel: through the gateway's existing Telegram and email (no new flow), or Grafana's own contact points (a new flow to disclose).

## Open questions

- Which metrics beyond CPU (memory, GPU, disk)?
- Which channel, and what time of day?
- Which thresholds, per container or for the host?
