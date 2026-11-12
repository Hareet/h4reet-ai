// The operator's restore (spec 001 tasks.md T071; FR-019, FR-074; contracts/shared-state.md §8, step 3; spec 000's
// operator actions, amended by name): after the Author loads the last backup into an emptied shared state, the store
// holds the meters and the kill switch as they were at that dump, and init, which runs on an empty store, refuses it.
// So restore, in one transaction under the initialization lock:
//   - reads the state row and the current periods' meters, which it answers, so the Author sees the floor init holds
//     him to (meter/init.ts, below_restored_meters);
//   - deletes the state row: the store reads uninitialized, so every gateway and the relay answer degraded until init;
//   - keeps the ledger, the meters, the reservations, and the audit log;
//   - writes its audit row, with the reason, the state before it, and, by the session's default, the host.
// A store already uninitialized answers 409 not_initialized and changes nothing.
import { periodKeys, toRfc3339, type GatewayClock } from "../core/clock.js";
import type { StackName } from "../config/validate.js";
import type { GatewayMetrics } from "../telemetry/metrics.js";
import { INIT_LOCK_KEY, type Operator } from "./init.js";
import { isStoreFailure, Rollback, toBigInt, type Store } from "./store.js";

export interface RestoreDeps {
  stack: StackName;
  store: Store;
  clock: GatewayClock;
  metrics: GatewayMetrics;
  logger: { info(record: object, msg: string): void };
}

export type RestoreResult = { status: 200 | 409 | 503; body: Record<string, unknown> };

const UNREACHABLE: RestoreResult = { status: 503, body: { error: "store_unreachable" } };
const NOT_INITIALIZED: RestoreResult = {
  status: 409,
  body: {
    error: "not_initialized",
    detail: "The store is uninitialized already: restore runs once, on a store loaded from a backup.",
  },
};

/** Micro-USD as the operator's dollars, to the cent where it is whole cents: 1250000 → "1.25". */
function usd(micro: bigint): string {
  const cents = micro / 10_000n;
  const rest = micro % 10_000n;
  const whole = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
  return rest === 0n ? whole : `${whole}${rest.toString().padStart(4, "0").replace(/0+$/, "")}`;
}

export async function restoreStore(deps: RestoreDeps, reason: string, operator: Operator): Promise<RestoreResult> {
  const at = deps.clock.now();
  const { day, month } = periodKeys(at);
  let out: RestoreResult;
  try {
    out = await deps.store.transaction<RestoreResult>(async (q) => {
      await q.query("SELECT pg_advisory_xact_lock($1)", [INIT_LOCK_KEY]);
      const state = await q.query<Record<string, unknown>>("SELECT * FROM gateway.stack_state WHERE id = 1 FOR UPDATE");
      if (state.rows.length === 0) throw new Rollback(NOT_INITIALIZED);
      const meters = await q.query<{ meter: string; spent_micro: unknown }>(
        `SELECT meter, spent_micro FROM gateway.meters
         WHERE (meter IN ('day', 'fallback_day') AND period_key = $1) OR (meter = 'month' AND period_key = $2)`,
        [day, month],
      );
      const spent = (meter: string): bigint => toBigInt(meters.rows.find((r) => r.meter === meter)?.spent_micro ?? 0);
      const restored = {
        day_usd: usd(spent("day")),
        month_usd: usd(spent("month")),
        fallback_today_usd: usd(spent("fallback_day")),
      };
      await q.query("DELETE FROM gateway.stack_state WHERE id = 1");
      const { rows } = await q.query<{ id: unknown }>(
        `INSERT INTO gateway.audit_log (ts, stack, actor, action, reason, before, after, detail)
         VALUES ($1, $2, $3, 'restore', $4, $5::jsonb, NULL, $6::jsonb) RETURNING id`,
        [
          toRfc3339(at),
          deps.stack,
          operator.actor,
          reason,
          JSON.stringify({ state: state.rows[0], periods: { day, month }, restored }),
          JSON.stringify({ periods: { day, month } }),
        ],
      );
      return {
        status: 200,
        body: {
          stack: deps.stack,
          action: "restore",
          audit_id: Number(toBigInt(rows[0]?.id)),
          status: "uninitialized",
          periods: { day, month },
          restored,
        },
      };
    });
  } catch (err) {
    if (isStoreFailure(err)) return UNREACHABLE;
    throw err;
  }
  if (out.status === 200) {
    deps.metrics.operatorAction("restore");
    deps.logger.info(
      {
        event: "operator.restore",
        "event.name": "h4.audit",
        audit_id: out.body.audit_id,
        actor: operator.actor,
        action: "restore",
        reason,
      },
      "The operator set the restored store uninitialized; init is next.",
    );
  }
  return out;
}
