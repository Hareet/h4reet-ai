// The alert outbox (data-model.md §2.7; contracts/alerts.md §1, §2). An alert row is written in the same transaction
// as the crossing, trip, exhaustion, or operator action that caused it, and that transaction ends with NOTIFY, so
// degradation never waits on delivery and a crash can't lose an alert. The dispatcher (dispatcher.ts) delivers the
// rows afterwards.
import { rfc3339Seconds } from "../core/router.js";
import type { Queryable } from "../meter/store.js";
import type { AlertKind } from "../telemetry/metrics.js";
import { renderAlert, type AlertContext, type AlertSpec, type Ceiling } from "./format.js";

export interface OutboxRow {
  /** <stack>:<kind>:<meter or subject>:<period>, unique: each key alerts once (alerts.md §2). */
  dedupeKey: string;
  /** store_unreachable is never stored: the store is down when it fires. */
  kind: Exclude<AlertKind, "store_unreachable">;
  stack: string;
  /** The event's time on the gateway clock, as the message shows it. */
  createdAt: string;
  /** Real time, epoch ms: the base of the retry schedule and of delivery lag (data-model.md §2.7). */
  enqueuedAt: number;
  subject: string;
  body: string;
  facts: Record<string, unknown>;
}

/**
 * Queues one alert inside the caller's transaction: INSERT … ON CONFLICT (dedupe_key) DO NOTHING, then NOTIFY, which
 * Postgres delivers when the transaction commits. Resolves true when this call queued it, false when it was queued
 * already. Both channels start pending, and due at once (alerts.md §4.2: the first attempt is at enqueued_at, which
 * is real time, passed in, so the schedule follows the gateway's real clock and never the store's).
 */
export async function enqueueAlert(q: Queryable, row: OutboxRow): Promise<boolean> {
  const enqueued = new Date(row.enqueuedAt).toISOString();
  const { rows } = await q.query(
    `INSERT INTO gateway.alert_outbox (dedupe_key, kind, stack, created_at, enqueued_at, subject, body, facts,
       telegram_status, email_status, telegram_next_at, email_next_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'pending', 'pending', $5, $5)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [row.dedupeKey, row.kind, row.stack, row.createdAt, enqueued, row.subject, row.body, JSON.stringify(row.facts)],
  );
  if (rows.length === 0) return false;
  await q.query("NOTIFY alert_outbox");
  return true;
}

/** Renders an alert from its facts and queues it in the caller's transaction: true when this call queued it. */
export async function queueAlert(
  q: Queryable,
  ctx: AlertContext,
  spec: Exclude<AlertSpec, { kind: "store_unreachable" }>,
  enqueuedAt: number,
): Promise<boolean> {
  const rendered = renderAlert(ctx, spec);
  return enqueueAlert(q, {
    dedupeKey: ctx.dedupeKey,
    kind: spec.kind,
    stack: ctx.stack,
    createdAt: new Date(ctx.at).toISOString(),
    enqueuedAt,
    subject: rendered.subject,
    body: rendered.body,
    facts: rendered.facts,
  });
}

/** YYYY-MM-DDTHH:MMZ, to the minute. */
const minute = (ms: number): string => `${new Date(ms).toISOString().slice(0, 16)}Z`;

/** One dedupe key per row of alerts.md §2: <stack>:<kind>:<meter or subject>:<period>, and :g<n> for a grant. */
export const dedupeKey = {
  warn: (stack: string, meter: "day" | "month" | "fallback_day", period: string, grantNo?: number): string =>
    `${stack}:warn:${meter}:${period}${grantNo === undefined ? "" : `:g${grantNo}`}`,
  trip: (stack: string, ceiling: Ceiling, period: string): string => `${stack}:trip:${ceiling}:${period}`,
  fallbackExhausted: (stack: string, day: string, grantNo: number): string =>
    `${stack}:fallback_exhausted:fallback_day:${day}:g${grantNo}`,
  operatorAction: (stack: string, action: "init" | "reset" | "renew", auditId: number): string =>
    `${stack}:operator_action:${action}:${auditId}`,
  /** At the session's end, to the minute. */
  credentialsExpiring: (stack: string, adapter: string, endsAt: number): string =>
    `${stack}:credentials_expiring:${adapter}:${minute(endsAt)}`,
  /** At most one an hour. */
  fallbackUnavailable: (stack: string, adapter: string, at: number): string =>
    `${stack}:fallback_unavailable:${adapter}:${new Date(at).toISOString().slice(0, 13)}Z`,
  /** At the start of the 10-minute window. */
  authFailed: (stack: string, windowStart: number): string => `${stack}:auth_failed:admin:${minute(windowStart)}`,
  /** At the outage's start, to the second; deduplicated in memory, since it's never stored. */
  storeUnreachable: (stack: string, since: number): string =>
    `${stack}:store_unreachable:store:${rfc3339Seconds(since)}`,
  reminder: (stack: string, day: string): string => `${stack}:reminder:daily:${day}`,
};
