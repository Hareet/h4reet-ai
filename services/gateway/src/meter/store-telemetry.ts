// The shared state's own telemetry (spec 001 tasks.md T068; FR-060; contracts/shared-state.md §10): every query and
// session a host's gateway runs on prod's shared state, as h4.shared_state.latency, and every failure, as
// h4.shared_state.errors, each labelled with h4.host. The error's class names it, a code such as ECONNREFUSED or a
// SQLSTATE, never its message, so nothing of a statement or a value reaches a metric (contracts/telemetry.md §1).
import { ValueType, type Meter } from "@opentelemetry/api";

import type { Database, H4Host, Session } from "./store.js";
import { SECONDS_BUCKETS } from "../telemetry/metrics.js";

export const SHARED_STATE_METRICS = ["h4.shared_state.latency", "h4.shared_state.errors"] as const;

/** An error's class: its code when it has one of a code's shape, else timeout or other. */
export function errorType(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[A-Z0-9_]{2,32}$/.test(code)) return code;
  const message = err instanceof Error ? err.message : "";
  return /timeout|timed out/i.test(message) ? "timeout" : "other";
}

/** The database, timing each query and session on the meter, with h4.host on every point. */
export function instrumentDatabase(db: Database, o: { meter: Meter; host: H4Host }): Database {
  const latency = o.meter.createHistogram("h4.shared_state.latency", {
    unit: "s",
    advice: { explicitBucketBoundaries: [...SECONDS_BUCKETS] },
  });
  const errors = o.meter.createCounter("h4.shared_state.errors", { unit: "{error}", valueType: ValueType.INT });
  const host = { "h4.host": o.host };
  const timed = async <T>(fn: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      return await fn();
    } catch (err) {
      errors.add(1, { ...host, "error.type": errorType(err) });
      throw err;
    } finally {
      latency.record((performance.now() - started) / 1000, host);
    }
  };
  return {
    query: (text, params) => timed(() => db.query(text, params)),
    withSession: <T>(fn: (session: Session) => Promise<T>, opts?: { purpose?: "migrate" }) =>
      timed(() => db.withSession(fn, opts)),
    listen: (channel, onNotify, onEnd) => db.listen(channel, onNotify, onEnd),
    close: () => db.close(),
  };
}
