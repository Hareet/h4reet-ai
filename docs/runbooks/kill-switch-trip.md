# Runbook: the kill switch tripped

Committed spend reached a ceiling, $5.00 for the UTC day or $20.00 for the month, and the gateway set the kill switch to `degraded` in the same transaction, with no human action (FR-033). This page covers the `trip` alert, the degraded cause `kill_switch_tripped`, and the daily `reminder` while degraded ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-033, FR-034, FR-035; [data-model.md §6.1](../../specs/000-local-foundations/data-model.md#61-the-kill-switch-stack_statestate); ADR 0001.

## Symptoms

- **The alert**, on Telegram and by email: "KILL SWITCH TRIPPED: daily ceiling reached" or "monthly ceiling reached", id `<stack>:trip:day:<YYYY-MM-DD>` or `<stack>:trip:month:<YYYY-MM>`, ending "Only an operator reset restores service."
- **hello** answers 503 with `X-H4-Degraded-Cause: kill_switch_tripped`, local answers included.
- **The dashboard:** "Kill switch" reads degraded, in red; "Why responses are degraded" reads `kill_switch_tripped`; "Spend today" or "Spend month-to-date" is at its ceiling.
- **`make operator-status ENV=<stack>`** shows `state degraded since <time>`, with the ceilings crossed.
- **Each day at 09:00 UTC** while it stays degraded, a `reminder`: "REMINDER: still degraded since <time>".
- **An incident draft** is written once the trip alert's two channels are final, or 300 s after the trip.

## Impact

- Every request gets the degraded response, and nothing more can be spent. The state lives in the store, so a restart or `make down` and `make up` changes nothing.
- It doesn't recover by itself: a new day or a new month starts fresh meters, but the state stays `degraded` (FR-033, Principle V). Only an operator reset restores service (FR-034).
- Enforcement never waited on the alert: the trip was committed before any delivery was attempted, so a failed alert changes nothing here (the runbook `alert-channel-down.md`).

## Act

In your own terminal. On dev and dev-cpu a trip is the breach test's expected step, and the test resets it itself.

1. **Confirm, and see which ceiling:** `make operator-status ENV=<stack>`.
2. **Read the incident draft:**

   ```bash
   make operator-incidents ENV=<stack>
   ```

   It prints the newest draft's Markdown. Its Evidence section has the meters at the crossing, the crossing call's trace, the last 10 metered calls, hourly totals by provider, model, and route, the audit trail, the routing SHA and price version, the alerts' outcomes, and links to the dashboard and to the call in Langfuse ([contracts/alerts.md §7](../../specs/000-local-foundations/contracts/alerts.md#7-incident-drafts-fr-035)).
3. **On prod, make it an intent.** The file is under `~/.local/state/h4reet/prod/gateway/incidents/`. Copy it to `intent/NNN-<short-name>.md`, with the next free number, keeping `Author: the gateway (automated draft)` and `Status: draft`; write the Proposed outcome, correct anything the template got wrong, and commit it on a branch. Drafts from dev and dev-cpu stay where they are: they aren't production incidents.
4. **Stop the cause before you reset:** fallback spending while the local model is down (the runbook `model-server-down.md`), your own test calls, or traffic you don't expect (`make down ENV=prod` until you have decided).
5. **When service may resume,** reset it: the runbook `kill-switch-reset.md`.

## Verify

- `make operator-incidents ENV=<stack>` shows the written draft, and on prod the intent is committed on a branch.
- After the reset, the checks in `kill-switch-reset.md`.

## Undo

A trip has no undo but a reset, by design. Never edit the store or the journal to clear it: they are the audit trail, and what the meters are rebuilt from.

## Record

The constitution's Incidents rule: an incident note in `docs/incidents/` within seven days, and an eval that would have caught the breach. The note gives the ceiling and its period, the crossing time and the time `degraded` was set (both in the draft), what spent, how the alerts went, what you changed, and the reset's audit ID. Never a token or a payload.
