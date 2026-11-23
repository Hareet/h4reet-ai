# Intent: Langfuse dashboards we can use
Author: the Author (Hareet), in his words below; written up by Claude Code (a subagent of his session). Status: accepted, provisionally, under his direction of 2026-11-22 to take it through the whole lifecycle in one session; his merge confirms it. Created: 2026-11-22.

The Author's words, 2026-11-22, verbatim:

> "Let's create Langfuse dashboards that we can use"

## Problem

Every stack runs Langfuse 4.54.0 (spec 000, ADR 0004), and every model call reaches it as a trace with its provider,
model, tokens, and cost (contracts/telemetry.md §3). But its project holds no dashboard of the project's own: the Author
opens Langfuse to read one trace at a time. Questions he can't answer there at a glance:

- What did the model calls cost, per model and per day, and which endpoint spent it?
- How slow are the model calls, per model, at p50 and p95, and how are their latencies spread?
- How often does the laptop answer from a paid model instead of the local one (the fallback)?
- How many provider attempts fail, and on which model?
- Which turns were the most expensive or the slowest, so that he can open their traces?

Grafana's `h4-runtime` answers the meter's questions from the gateway's metrics: spend against the ceilings, the kill
switch, the degraded causes, the request rates (contracts/telemetry.md §7). It is the authoritative view of spend, and
stays so. What it can't do is lead from a number to the trace behind it, or show a call's latency and tokens one call
at a time. Langfuse holds exactly that.

## Proposed outcome

A few Langfuse dashboards in each stack's project, made from files in the repository and put there by one command, that
answer the questions above and point at Grafana where Grafana holds the authoritative number. Changing a dashboard is a
commit; putting it back is the same command. No dashboard shows a prompt, an answer, or anything that identifies a
visitor.

## Affected users and systems

The Author (the operator); Langfuse in each stack's project (`h4reet-<stack>`); `deploy/` (the dashboards as data);
`scripts/` (the command); the Makefile; `docs/runbooks/`. Visitors: none. The gateway, the collector, and the traces:
unchanged.

## Constraints

- No payloads in telemetry unless `TELEMETRY_PAYLOAD_SAMPLING` is on (`CLAUDE.md`; telemetry.md §3.4); dashboards show
  aggregates of the attributes the traces already carry, never an input, an output, or metadata.
- No new data flow and no new secret: the command uses the project keys the stack's env file already holds, on the
  stack's own `127.0.0.1` port.
- Agents can't reach the Author's Langfuse; the command is his, and its tests run against a stand-in.
- Langfuse is pinned at 4.54.0; whatever API the command uses must exist in that version, and the command must find out
  before it writes anything if it doesn't.
- Grafana stays the authoritative view of spend, the ceilings, and the degraded causes (Principle V's meter); Langfuse's
  dashboards complement it rather than repeat it.
- Principle V: every dashboard shows spend next to latency and errors.

## Expected cost impact

None in the cloud, and no model spend: the dashboards query the stack's own ClickHouse when they are opened. Dev-time
model spend for this session only.

## Data-flow impact

None new. The command runs in the Author's terminal and calls his stack's Langfuse on `127.0.0.1` (edge's x001); he
reads the dashboards in his browser on the same port (disclosure rows S9 and B1). Nothing reaches a visitor's device or
leaves the host.

## Open questions

- How do dashboards get into Langfuse: its API, or its UI by hand, or Grafana panels over Langfuse's store?
- Which stacks: the laptop's, and EC2's?
- Which dashboards and widgets, and which of Grafana's panels must they not repeat?
- Cost per conversation or per visit: the traces carry no visit or conversation identifier, by design.
- Eval and red-team scores: are they in Langfuse at all?
- What happens to a dashboard the Author edits in Langfuse's UI?
