# Runbook: resetting the kill switch

Restoring `normal` after a trip, by hand, with a reason (FR-034). This page covers the `operator_action` alert for a `reset` and the degraded cause `meter_at_ceiling`, which can follow one ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-022, FR-034; [contracts/operator-admin.md §2.1](../../specs/000-local-foundations/contracts/operator-admin.md#21-post-adminreset); [data-model.md §7.5](../../specs/000-local-foundations/data-model.md#75-operator-transactions).

## Symptoms

- **You have decided to restore service** after a trip (the runbook `kill-switch-trip.md`).
- **The confirmation alert**, on Telegram and by email: "OPERATOR ACTION: reset by operator #<8 hex>", id `<stack>:operator_action:reset:<audit id>`. It is expected right after your own reset. If you didn't reset, someone holds the stack's operator token: Act, step 4.
- **After a reset, with the local model down:** hello answers 503 with `X-H4-Degraded-Cause: meter_at_ceiling`: "The local model is unavailable, and metered calls are refused while a meter is at or above its ceiling."

## Impact

- A reset sets `normal` at once, and local answers resume.
- It leaves the meters alone. Metered calls (fallback on prod, synthetic on dev) stay refused with `meter_at_ceiling` while the day or the month is at or above its ceiling, until that meter rolls over: at 00:00 UTC for the day, on the 1st for the month (FR-034, US2-4).
- It isn't a renewal: a fallback sub-budget awaiting renewal still waits (the runbook `fallback-renewal.md`).
- A trip comes back only when a new period's meter crosses its ceiling: crossings fire when spend goes from below a ceiling to at or above it, so a meter already over it can't trip again.

## Act

In your own terminal. On dev-cpu an agent session may run the same targets, with the engine's public dummy token.

1. **Check the state:** `make operator-status ENV=<stack>` shows `state degraded`, and which ceilings were crossed.
2. **Reset, with your reason.** It goes into the audit log and the dashboard's audit panel, never into an alert.

   ```bash
   make operator-reset ENV=<stack> REASON="<why, 10 to 500 characters>"
   ```

   The answer names the meters still at or above their ceiling.
3. **If it is refused:**
   - 409 `not_degraded`: the state is already `normal`. There is nothing to reset.
   - 409 `store_uninitialized`: the store is empty; the runbook `store-initialization.md`.
   - 401: the token in `~/.config/h4reet-ai/operator/<stack>.token` doesn't match the env file's `OPERATOR_TOKEN_SHA256`.
4. **A reset you didn't make:** read its audit row, whose actor names the token's fingerprint, with its reason and time:

   ```bash
   make operator-audit ENV=<stack>
   ```

   Then rotate the token: delete `~/.config/h4reet-ai/operator/<stack>.token`, run `make operator-token ENV=<stack>`, put the hash it prints in the env file's `OPERATOR_TOKEN_SHA256` with an editor, and run `make up ENV=<stack>`, which recreates the gateway with it ([data-model.md §5](../../specs/000-local-foundations/data-model.md#5-the-operator-credential)). Then follow the runbook `operator-auth-failures.md`.

## Verify

- `make operator-status ENV=<stack>` shows `state normal`, and the dashboard's "Kill switch" is green.
- hello answers locally: `make hello ENV=<stack>` prints HTTP 200 and `"route": "local"`.
- The audit row holds who, when, and why: `make operator-audit ENV=<stack>`, or the dashboard's "Audit log" panel, which reads the store.

## Undo

None: a reset is an operator write, audited and journaled. If the stack shouldn't answer after all, `make down ENV=<stack>`. A crossing in a new period trips it again, with no human action.

## Record

In the incident note (the runbook `kill-switch-trip.md`) or the merge-request note: the reset's audit ID, your reason as you gave it, and the meters still at their ceiling.
