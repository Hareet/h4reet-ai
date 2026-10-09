# Runbook: renewing the fallback sub-budget

Today's fallback grant is spent, and fallback stays refused until the operator renews it, across days and restarts (FR-030). This page covers the `fallback_exhausted` alert, the `operator_action` alert for a `renew`, the degraded causes `fallback_awaiting_renewal` and `fallback_spent_today`, and the daily `reminder` while renewal is awaited ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-030, FR-031, FR-034; [data-model.md §6.2](../../specs/000-local-foundations/data-model.md#62-the-fallback-sub-budget-fallback_awaiting_renewal-and-todays-fallback_day-row); [contracts/operator-admin.md §2.2](../../specs/000-local-foundations/contracts/operator-admin.md#22-post-adminrenew); ADR 0001.

## Symptoms

- **The alert**, on Telegram and by email: "FALLBACK EXHAUSTED: grant <n> of today's sub-budget is spent", id `<stack>:fallback_exhausted:fallback_day:<YYYY-MM-DD>:g<n>`.
- **hello, with the local model down,** answers 503 with `X-H4-Degraded-Cause: fallback_awaiting_renewal`: "…the fallback sub-budget ran out. It stays refused until the operator renews it." Or, briefly, `fallback_spent_today`: "…calls in flight hold the rest of today's fallback sub-budget."
- **The dashboard:** "Fallback sub-budget remaining" reads "awaiting renewal", in red.
- **`make operator-status ENV=<stack>`** shows `awaiting renewal: yes, since <time>`.
- **Each day at 09:00 UTC** while renewal is awaited, a `reminder`, which adds "Only a renewal restores fallback."
- **After `make operator-init` without `RENEW=1`,** the flag is set by design: a wiped store never grants fallback by itself (FR-031).
- **The confirmation alert after your renewal:** "OPERATOR ACTION: fallback renewed by operator #<8 hex>".

## Impact

- Local answers continue. Only fallback is refused, so hello answers degraded only while the local model is down too.
- The flag holds across the day's rollover and across restarts, until you renew (US5-6).
- `fallback_spent_today` is different: no flag is set. Calls in flight hold the rest of today's allowance; it clears within seconds as they settle, and the call that reaches the allowance sets the flag.

## Act

In your own terminal. On dev-cpu an agent session may run the same target.

1. **Do you need fallback?** It runs only while the local model is down: bring that back first (the runbook `model-server-down.md`), and hello answers locally without any renewal.
2. **Decide to spend.** A renewal grants exactly $2.00 more from now: today's allowance becomes today's fallback spend, plus calls in flight, plus $2.00. It stays inside the $5.00 daily ceiling, whichever binds first. A renewal on a later day, before any fallback spend that day, grants $2.00, not $4.00 (ADR 0001).
3. **Renew, with your reason:**

   ```bash
   make operator-renew ENV=<stack> REASON="<why, 10 to 500 characters>"
   ```

   The answer gives the new allowance, the grant number, what is available, and the day's room under its ceiling.
4. **If it is refused:**
   - 409 `not_awaiting_renewal`: there is nothing to renew. For `fallback_spent_today`, wait for the calls in flight to settle.
   - 409 `store_uninitialized`: the runbook `store-initialization.md`, where `RENEW=1` renews in the same action.
   - 401: the token file doesn't match the env file's `OPERATOR_TOKEN_SHA256`.
5. **On a degraded stack,** the renewal clears the flag, but fallback stays refused with `kill_switch_tripped` until a reset (the runbook `kill-switch-reset.md`).

## Verify

- `make operator-status ENV=<stack>` shows `awaiting renewal: no`, the new grant, and what is available.
- The dashboard's "Fallback sub-budget remaining" reads "available".
- The audit row holds the new allowance and grant with your reason: `make operator-audit ENV=<stack>`.

## Undo

A renewal can't be withdrawn. To stop fallback spending, bring the local model back (fallback runs only while it is down), or `make down ENV=<stack>`. The new grant warns at its allowance less $0.60, and spending it sets the flag again.

## Record

The renewal's audit ID, your reason as you gave it, the grant number and the allowance, and why fallback was running: the local outage's start and end.
