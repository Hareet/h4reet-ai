// The alert outbox (data-model.md §2.7; contracts/alerts.md §1, §2). An alert row is written in the same transaction
// as the crossing, trip, exhaustion, or operator action that caused it, and that transaction ends with NOTIFY, so
// degradation never waits on delivery and a crash can't lose an alert. The dispatcher (tasks.md T077) delivers the
// rows afterwards; until it exists, they wait in the outbox.
import type { Queryable } from "../meter/store.js";
import type { AlertKind } from "../telemetry/metrics.js";

export interface OutboxRow {
  /** <stack>:<kind>:<meter or subject>:<period>, unique: each key alerts once (alerts.md §2). */
  dedupeKey: string;
  /** store_unreachable is never stored: the store is down when it fires. */
  kind: Exclude<AlertKind, "store_unreachable">;
  stack: string;
  /** The event's time on the gateway clock, as the message shows it. */
  createdAt: string;
  subject: string;
  body: string;
  facts: Record<string, unknown>;
}

/**
 * Queues one alert inside the caller's transaction: INSERT … ON CONFLICT (dedupe_key) DO NOTHING, then NOTIFY, which
 * Postgres delivers when the transaction commits. Resolves true when this call queued it, false when it was queued
 * already. Both channels start pending, and due now (alerts.md §4.2: the first attempt is at enqueued_at).
 */
export async function enqueueAlert(q: Queryable, row: OutboxRow): Promise<boolean> {
  const { rows } = await q.query(
    `INSERT INTO gateway.alert_outbox (dedupe_key, kind, stack, created_at, subject, body, facts, telegram_status,
       email_status, telegram_next_at, email_next_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'pending', 'pending', now(), now())
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [row.dedupeKey, row.kind, row.stack, row.createdAt, row.subject, row.body, JSON.stringify(row.facts)],
  );
  if (rows.length === 0) return false;
  await q.query("NOTIFY alert_outbox");
  return true;
}
