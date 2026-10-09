# Runbook: initializing an empty store

The gateway's store, `gateway-state`, answers but holds no state: a new host, or a store whose volume was removed. The kill switch is unknown, so the stack fails closed until the operator initializes it, once. This page covers the degraded cause `store_uninitialized` and the `init` operator action ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-031, FR-034; [data-model.md §8](../../specs/000-local-foundations/data-model.md#8-initialization-fr-031); [contracts/operator-admin.md §2.3](../../specs/000-local-foundations/contracts/operator-admin.md#23-post-admininit).

## Symptoms

- **hello** answers 503 with `X-H4-Degraded-Cause: store_uninitialized`: "The kill-switch store is empty. The operator must initialize it: make operator-init."
- **`make up ENV=<stack>`** ends with a WARN that the store is uninitialized, and prints the one-time command. It exits 0: the stack is healthy, and waiting on you. It never initializes anything itself.
- **`make status ENV=<stack>`** and the gateway's `/health` show the store as `uninitialized`, and the gateway reports the kill switch as degraded, because an unknown state counts as degraded.

## Impact

Nothing answers: local answers are refused too, and nothing can be spent. Initializing sets the meters from what survives, so a wiped store can never reset the spend to zero by itself (FR-031).

## Act

In your own terminal. On dev-cpu an agent session may run the same target, with the engine's public dummy token.

1. **Check that the store is empty, not unreachable:** `make operator-status ENV=<stack>` shows store `uninitialized`. If it shows `unreachable` instead, the store isn't answering at all: follow the runbook `store-unreachable.md`, not this one.
2. **Decide what you state.** The gateway rebuilds each meter (today, this month, and today's fallback) from what it can find and takes the largest: the ledger rows that survive in the store; the call journal in `${H4_STATE_DIR}/gateway/journal/`, which outlives the store; any values you state; and, after an earlier initialization in the same period, the journal's record of it, as a floor. If you know of spend the journal can't show, for example from the AWS bill, state it. A stated value can raise a meter, never lower it.
3. **Initialize, once:**

   ```bash
   make operator-init ENV=<stack> REASON="<why, at least 10 characters>"
   ```

   Add, as they apply:
   - `DAY_USD=`, `MONTH_USD=`, and `FALLBACK_TODAY_USD=` for the values you state;
   - `CONFIRM_ZERO=1` only when no record survives and the true starting spend is zero, as on a new host. Without it, a store with no ledger rows, a journal with no records, and nothing stated is refused with 409 `confirm_zero_required`: nothing is zeroed silently;
   - `RENEW=1` to grant today's fallback sub-budget in the same action. Without it the fallback stays awaiting renewal (`fallback_awaiting_renewal`), whatever was spent.

   The first start on a new host, as quickstart.md §1.1 runs it:

   ```bash
   make operator-init ENV=prod REASON="First start on this host; no earlier records." CONFIRM_ZERO=1 RENEW=1
   ```

4. **If it is refused:**
   - 409 `already_initialized`: the store already holds state. Nothing to do.
   - 409 `journal_unreadable`: the journal directory exists but the gateway can't read it. Put its ownership and modes back (a 0700 directory of 0600 files, data-model.md §3) and run the command again. Never delete the journal to get past this: it is what the meters are rebuilt from.
   - 409 `confirm_zero_required`: see step 3. State the values you know, or confirm zero only if it is true.
   - 401: the token in `~/.config/h4reet-ai/operator/<stack>.token` doesn't match the env file's `OPERATOR_TOKEN_SHA256`.

## Verify

- `make operator-status ENV=<stack>` shows `state normal`, each meter at the value chosen, and `awaiting renewal: no` if you renewed.
- hello answers 200.
- `make operator-audit ENV=<stack>` shows the `init` row, with your reason, every source's candidate value, and the values chosen. The same transaction queues an `operator_action` alert for Telegram and email (dev's go to its stand-ins).

## Undo

There is no undo, by design: initialization is an operator write under FR-034, recorded in the audit log and the journal. A second `make operator-init` is refused (`already_initialized`). A value stated too high stays until its period ends, at 00:00 UTC for the day and on the 1st for the month: the journal keeps it as a floor for any later initialization in the same period (data-model.md §8). While a meter is at or above its ceiling, metered calls are refused (`meter_at_ceiling`); local answers continue.

## Record

In the merge-request note, or an incident note in `docs/incidents/` when prod lost its store: the stack, why the store was empty, the audit row's ID, the reason you gave, the chosen values with their sources (the init response lists them), and whether you confirmed zero or renewed. Never the token.
