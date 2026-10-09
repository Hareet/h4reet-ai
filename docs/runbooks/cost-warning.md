# Runbook: a cost warning

A meter crossed 70% of its limit: the day's $5.00 ceiling at $3.50, the month's $20.00 at $14.00, or the current fallback grant at its allowance less $0.60 ($1.40 for the day's first $2). This page covers the `warn` alert ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-028, FR-030, FR-031, FR-032; [data-model.md §7.3](../../specs/000-local-foundations/data-model.md#73-commit-of-a-metered-call); ADR 0001.

## Symptoms

- **An alert** on Telegram and by email, once per period and per grant:
  - "WARNING: daily meter at 70%", id `<stack>:warn:day:<YYYY-MM-DD>`;
  - "WARNING: monthly meter at 70%", id `<stack>:warn:month:<YYYY-MM>`;
  - "WARNING: fallback sub-budget at 70% of grant <n>", id `<stack>:warn:fallback_day:<YYYY-MM-DD>:g<n>`.
- **The dashboard** (`http://localhost:<x002>/d/h4-runtime`): "Spend today" or "Spend month-to-date" at or above its warning line, or "Fallback sub-budget remaining" down to its warning.
- **`make operator-status ENV=<stack>`** shows the meter at or past the warning figure beside it.
- On dev and dev-cpu the alerts start with `[dev]` or `[dev-cpu]`, and the spend is synthetic, normally the breach test's (`make breach-test`).

## Impact

- Nothing is refused yet, and local answers are free: they never count toward a meter.
- At 100%, the stack acts without you: the day's or the month's ceiling trips the kill switch, and every request is refused until you reset it (the runbook `kill-switch-trip.md`); a spent fallback grant stops fallback until you renew it (the runbook `fallback-renewal.md`).
- Past a ceiling, spend can overshoot by at most the calls already in flight: 4, each at its reserved maximum (plan §5.4).

## Act

In your own terminal. On dev and dev-cpu there is usually nothing to do: the spend is synthetic.

1. **See what is spending:**

   ```bash
   make operator-status ENV=<stack>
   ```

   and, on the dashboard, "Cost by provider and attribution" (which provider, which attribution) and "Request count" (which route).

2. **Stop the source, if it shouldn't be spending:**
   - **`fallback` on prod** means Bedrock is answering because the local model is down: bring it back (the runbook `model-server-down.md`), and fallback stops by itself.
   - **`test` on prod** is your own live contract run or a Bedrock eval: stop it.
   - **Traffic you don't expect:** hello is capped per client (20 a minute, 500 a day) and globally (4 metered calls in flight, 60 a minute), so the meter is the real bound. To stop every answer at once, `make down ENV=prod`.
3. **Don't raise a limit to get past a warning.** `config/budgets.yaml` is human-only, and changing a ceiling, the sub-budget, or a limit needs an ADR and the Author's approval (Principle V).

## Verify

- The meter stops climbing: "Spend today" or "Spend month-to-date" goes flat, and `make operator-status ENV=<stack>` a few minutes later shows the same figure.
- The same warning doesn't come again: its id alerts once per period, and once per grant for fallback ([contracts/alerts.md §2](../../specs/000-local-foundations/contracts/alerts.md#2-kinds-triggers-and-dedupe-keys)).

## Undo

- A warning changes no state, so there is nothing to undo. It clears with its period: at 00:00 UTC for the day, on the 1st for the month. A fallback grant's warning belongs to that grant; a renewal starts a new grant with its own.
- If you stopped the stack, `make up ENV=prod` starts it again.

## Record

In the next merge-request note, or in an incident note in `docs/incidents/` when prod's spend was unexpected: the alert's id, the meter figures it gave, what was spending (provider, model, attribution), and what you did. Never a token or a payload.
