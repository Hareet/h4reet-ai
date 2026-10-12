# Runbook: the gateway is down

The gateway process isn't answering, so edge answers in its place. This page covers the degraded cause `api_unavailable`, which edge sends and the gateway never does ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks); [contracts/gateway-http.md §6](../../specs/000-local-foundations/contracts/gateway-http.md#6-edges-body-when-the-gateway-cant-answer-api_unavailable)). Spec 000: FR-022, FR-038; plan §5.8 and §19.

## Symptoms

- **hello** answers 503 with `X-H4-Degraded-Cause: api_unavailable`, from edge itself: its body has `"stack": null` and `"trace_id": null`.
- **The operator CLI** exits 4, on edge's 503 `admin_unavailable`.
- **`make status ENV=<stack>`** shows `gateway` exited, restarting, or unhealthy.
- **The dashboard:** the gateway's panels go flat or empty, and "Spend freshness" turns red.
- **No alerts at all:** the dispatcher runs inside the gateway.

## Impact

- Nothing answers, and nothing is spent: the meter and the kill switch wait in the store.
- No alert goes out until the gateway is back. Alerts already committed wait in the outbox; a channel whose 300 s window has passed is marked failed without another attempt.

## Act

In your own terminal. On dev-cpu an agent session may run the same targets.

1. **See why:**

   ```bash
   make status ENV=<stack>
   make logs ENV=<stack> SERVICE=gateway
   ```

2. **By what the log shows:**
   - **`gateway.config_refused`** (exit 78) names a reason: the configuration or the env file refuses to start ([plan.md §5.8](../../specs/000-local-foundations/plan.md#58-startup-refusals)), such as `alert_delivery_not_real`, `missing_alert_env`, or `operator_hash_malformed`. Fix the key or file it names, then `make up ENV=<stack>`. `schema_newer_than_code` means a rollback across a migration: roll forward instead (the runbook `rollback.md`).
   - **`gateway.fatal`** (exit 1), `migration_changed` or `migration_gap`: a migration file differs from the one the store applied. Don't edit migrations; run a commit whose migrations match (the runbook `rollback.md`).
   - **Killed for memory** (its limit is 512 MiB), or a crash: `make up ENV=<stack>` starts it again. Tell the Author if it happens again.
3. **Start it:** `make up ENV=<stack>` rebuilds it from the running commit and waits for its health check.

## Verify

- `make status ENV=<stack>` shows the gateway healthy.
- hello is answered by the gateway again, with `stack` and `trace_id` set: 200, or a degraded cause of its own.
- "Alerts by channel and outcome" shows deliveries resuming.

## Undo

Put back what you changed. A change of commit is the runbook `rollback.md`.

## Record

In the next merge-request note, or an incident note in `docs/incidents/` when prod was down: when it went down and came back, the reason in the log's own words (through `make logs`, which redacts), and the alerts marked failed meanwhile.
