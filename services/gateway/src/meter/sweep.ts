// The reservation sweep (data-model.md §2.4; §7.2 step 3; §7.7). A reservation that outlives its TTL never committed:
// the gateway crashed, or the store was down for the whole retry window. The call may have been billed, so the sweep
// settles it at its maximum, failing safe. For each expired row, under the state lock, it:
// - deletes the row and subtracts it from reserved_micro on its rows;
// - inserts its ledger row: cost_micro = max_micro, cost_basis = expired, outcome = unknown, with no tokens, no
//   latency, and no finish reason, the reservation's own trace ID, and no client label (it never had one);
// - adds the cost to spent_micro, and evaluates the crossings exactly like a commit.
// A late commit for the same reservation then finds that ledger row and does nothing (§7.3 step 2). The live meter
// never counts less than was spent.
//
// It runs inside admissions and renewals, and every 10 s on its own (meter.ts), only when an expired row exists.
import { randomUUID } from "node:crypto";

import type { CallPurpose } from "../core/types.js";
import { insertLedgerRow, routeDecisionOf, shiftReserved, type LedgerRow } from "./commit.js";
import type { MeterTx } from "./crossings.js";
import { adapterMonthKey, rowsOf } from "./rollover.js";
import { toBigInt } from "./store.js";
import type { MeteredAttribution, RouteReason } from "./types.js";

/** A reservation row, as the sweep reads it back from its DELETE. */
export interface Reservation {
  id: string;
  attribution: MeteredAttribution;
  adapterId: string;
  provider: string;
  model: string;
  priceVersion: string;
  maxMicro: bigint;
  periodDay: string;
  periodMonth: string;
  /** The gateway clock, epoch ms. */
  createdAt: number;
  expiresAt: number;
  requestId: string;
  traceId: string;
  purpose: CallPurpose;
  routeReason: RouteReason | null;
  routingSha: string;
  /** Whether it reserved against its adapter's month (spec 010, departure B7). */
  adapterMonth?: boolean;
}

export function reservationOf(r: Record<string, unknown>): Reservation {
  return {
    id: String(r.id),
    attribution: r.attribution as MeteredAttribution,
    adapterId: String(r.adapter_id),
    provider: String(r.provider),
    model: String(r.model),
    priceVersion: String(r.price_version),
    maxMicro: toBigInt(r.max_micro),
    periodDay: String(r.period_day),
    periodMonth: String(r.period_month),
    createdAt: new Date(r.created_at as string | Date).getTime(),
    expiresAt: new Date(r.expires_at as string | Date).getTime(),
    requestId: String(r.request_id),
    traceId: String(r.trace_id),
    purpose: r.purpose as CallPurpose,
    routeReason: (r.route_reason as RouteReason | null) ?? null,
    routingSha: String(r.routing_sha),
    adapterMonth: r.adapter_month === true,
  };
}

/**
 * The ledger row of an expired reservation, settled at its maximum (data-model.md §2.4, §2.5's row rules): it passes
 * ledger_expired_never_settled, since nothing about the call is known but its identity and its bound. Reservations
 * don't keep a route decision, so it comes from the attribution.
 */
export function expiredLedgerRow(r: Reservation, ledgerId: string, nowMs: number, stack: string): LedgerRow {
  return {
    id: ledgerId,
    reservationId: r.id,
    ts: nowMs,
    startedAt: r.createdAt,
    stack,
    requestId: r.requestId,
    traceId: r.traceId,
    purpose: r.purpose,
    routeDecision: routeDecisionOf(r.attribution),
    routeReason: r.attribution === "fallback" ? r.routeReason : null,
    attribution: r.attribution,
    adapterId: r.adapterId,
    provider: r.provider,
    requestModel: r.model,
    responseModel: null,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    latencyMs: 0,
    finishReason: null,
    outcome: "unknown",
    errorKind: null,
    costMicro: r.maxMicro,
    costBasis: "expired",
    priceVersion: r.priceVersion,
    routingSha: r.routingSha,
    periodDay: r.periodDay,
    periodMonth: r.periodMonth,
    clientLabel: null,
  };
}

/**
 * Settles every reservation past its expires_at at the transaction's gateway time, under the lock the transaction
 * already holds. Resolves to how many it settled. Its h4.cost.usd and logs go into the transaction's effects, emitted
 * after COMMIT.
 */
export async function sweepExpired(tx: MeterTx): Promise<number> {
  const { rows } = await tx.q.query<Record<string, unknown>>(
    "DELETE FROM gateway.reservations WHERE expires_at <= $1 RETURNING *",
    [tx.nowIso],
  );
  for (const raw of rows) {
    const r = reservationOf(raw);
    const periods = { day: r.periodDay, month: r.periodMonth };
    const keys = rowsOf(r.attribution, periods, r.adapterMonth ? adapterMonthKey(r.adapterId, r.periodMonth) : undefined);
    await shiftReserved(tx.q, keys, -r.maxMicro, tx.nowIso);
    const row = expiredLedgerRow(r, randomUUID(), tx.now, tx.deps.stack);
    await insertLedgerRow(tx.q, row);
    await tx.charge(
      keys,
      {
        ledgerId: row.id,
        traceId: r.traceId,
        provider: r.provider,
        model: r.model,
        attribution: r.attribution,
        costMicro: r.maxMicro,
      },
      periods,
    );
    tx.effects.changed = true;
    tx.effects.costs.push({ micro: r.maxMicro, provider: r.provider, model: r.model, attribution: r.attribution });
    tx.log(
      "warn",
      { event: "reservation.expired", reservation_id: r.id, attribution: r.attribution, max_micro: Number(r.maxMicro) },
      "A reservation expired without a commit; it was settled at its maximum.",
    );
  }
  return rows.length;
}
