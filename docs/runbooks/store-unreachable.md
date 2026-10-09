# Runbook: the store is unreachable

The gateway's store, `gateway-state`, doesn't answer, so the kill switch's state is unknown, and unknown counts as `degraded`: the stack fails closed (FR-031). This page covers the `store_unreachable` alert and the degraded cause `store_unreachable` ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-022, FR-031, US2-7; [data-model.md §2.1](../../specs/000-local-foundations/data-model.md#21-migrations-roles-and-connections); plan §19.

## Symptoms

- **hello** answers 503 with `X-H4-Degraded-Cause: store_unreachable`: "The kill-switch store can't be read, so the stack fails closed."
- **After 60 s,** the alert "STORE UNREACHABLE: the kill-switch store hasn't answered for 60 s", on Telegram and by email. The gateway sends it from memory, since the outbox lives in the store; a restart during the outage may send it once more.
- **The dashboard:** "Kill switch" reads degraded; "Why responses are degraded" reads `store_unreachable`; "Spend freshness" turns red, because the meter gauges go stale; "Store state (authoritative)" shows no data.
- **`make status ENV=<stack>`** shows `gateway-state` unhealthy, restarting, or exited, and `make operator-status ENV=<stack>` shows the store unreachable.

## Impact

- Every request fails closed, local answers included. Nothing can be spent, initialized, or reset.
- The meters, the kill switch, and the audit log are safe on the store's named volume, which `make down` never removes. The journal, on the host bind mount, outlives even the volume.
- No new alert can be queued. The dispatcher keeps trying the alerts it had already claimed, and records their outcomes when the store answers again.

## Act

In your own terminal. On dev-cpu an agent session may run the same targets.

1. **See what happened:**

   ```bash
   make status ENV=<stack>
   make logs ENV=<stack> SERVICE=gateway-state
   ```

2. **By the cause:**
   - **Stopped or crashed:** `make up ENV=<stack>` starts it again, with its volume.
   - **The disk is full,** so Postgres can't write: check both the Windows drive that holds WSL's `ext4.vhdx` and ext4 (research.md R-32), with `df -h /mnt/c ~`. Free space, then `make up ENV=<stack>`.
   - **Out of memory:** its limit is 256 MiB, and the log shows it killed. `make up ENV=<stack>` restarts it; tell the Author if it happens again.
   - **The password changed:** `GATEWAY_DB_PASSWORD` must keep the value the volume was created with. Put it back in the env file, then `make up ENV=<stack>`.
   - **The volume is gone:** the store comes back empty, and hello then answers `store_uninitialized`: the runbook `store-initialization.md`.
3. **Never** run `docker compose down -v`, and never delete the journal: the meters are rebuilt from it.

## Verify

- hello answers again: 200, or a cause from the store's own state.
- `make operator-status ENV=<stack>` shows the store `ok`, and the gateway logs `state.recovered` with the outage's length in seconds.
- "Spend freshness" turns green within about 25 s.

## Undo

Put back whatever you changed. The outage itself changed nothing in the store.

## Record

In the next merge-request note, or an incident note in `docs/incidents/` when prod was down: when it started and ended (`state.recovered` gives the length), the cause, whether the volume survived, and the alert's id.
