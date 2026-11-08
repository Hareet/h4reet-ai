// Admission for a metered call (data-model.md §7.2): fallback, dev's synthetic metered spend, and prod's live tests.
// Local calls are never admitted, because they are free (§7.4).
//
// The maximum cost, before the transaction, at the active price version:
//   max_micro = max( cost({input: per_call.max_input_chars, output: the request's maxOutputTokens}),
//                    cost(adapter.fixedUsage), when the adapter declares one )
//
// In memory, before the transaction (MeteredSlots): this client has fewer than 1 metered call in flight (hello only);
// fewer than 4 are in flight across all clients; fewer than 60 were admitted in the last 60 s of real time. Each check
// takes its slot at once, and a refusal or a compensation gives it back.
//
// The transaction (admissionTx):
//   1. lock stack_state FOR UPDATE                      no row: store_uninitialized
//   2. now := real time + the row's test_clock_offset_ms; the day and month keys
//   3. the sweep (sweep.ts)
//   4. the current periods' rows, created if new, locked (rollover.ts)
//   5. refuse with the first cause that applies:
//        state <> normal                                 kill_switch_tripped
//        day or month spent + reserved >= its ceiling    meter_at_ceiling
//        fallback only: the renewal flag                 fallback_awaiting_renewal
//        fallback only: fb spent + reserved >= allowance fallback_spent_today
//        fallback only: the adapter is unhealthy         fallback_unavailable
//      metered and test calls check the state and the ceilings only (operator-admin.md §3.2, §5)
//   6. INSERT the reservation
//   7. reserved_micro += max_micro on day and month, and on fallback_day for a fallback call
// Then the journal's `reserve` record (meter.ts), whose failure is compensated and refused as journal_unwritable.
import { costMicro, type PriceEntry, type PriceVersion, type Thresholds } from "../config/validate.js";
import { gatewayTime, toRfc3339 } from "../core/clock.js";
import { ceilingsOf, degraded, rfc3339Seconds, type Degraded } from "../core/router.js";
import type { Usage } from "../core/types.js";
import { shiftReserved } from "./commit.js";
import { lockState, MeterTx, type LockedState, type TxDeps, type TxEffects } from "./crossings.js";
import { periodsAt, rowsOf, upsertPeriodRows, type PeriodRows } from "./rollover.js";
import { Rollback, type Queryable } from "./store.js";
import { sweepExpired } from "./sweep.js";
import type { AdmitRequest, Admitted, LimitRefusal } from "./types.js";

// ---------------------------------------------------------------------------------------------------------------
// The in-memory slots
// ---------------------------------------------------------------------------------------------------------------

export interface SlotLimits {
  /** limits.per_client.metered_in_flight: 1. */
  perClientInFlight: number;
  /** limits.global.metered_in_flight: 4. */
  globalInFlight: number;
  /** limits.global.metered_per_minute: 60. */
  perMinute: number;
}

export interface Slot {
  readonly clientKey: string | undefined;
  /** Real ms: its entry in the per-minute window. */
  readonly takenAt: number;
  released: boolean;
}

const WINDOW_MS = 60_000;

/** The metered limits, counted in memory on the real clock (data-model.md §7.2; gateway-http.md §2.5.3). */
export class MeteredSlots {
  private readonly perClient = new Map<string, number>();
  private inFlight = 0;
  /** Real ms of each admission in the window, oldest first. */
  private readonly window: number[] = [];

  constructor(
    private readonly limits: SlotLimits,
    private readonly realNow: () => number,
  ) {}

  /** The checks in their order, each taking its slot at once; the first that fails refuses, holding nothing. */
  take(clientKey: string | undefined): { ok: true; slot: Slot } | LimitRefusal {
    const now = this.realNow();
    this.prune(now);
    if (clientKey !== undefined && (this.perClient.get(clientKey) ?? 0) >= this.limits.perClientInFlight) {
      return { ok: false, refusal: "limit", error: "client_cap_exceeded", limit: "metered_in_flight", retryAfterS: 1 };
    }
    if (this.inFlight >= this.limits.globalInFlight) {
      return {
        ok: false,
        refusal: "limit",
        error: "metered_capacity_exceeded",
        limit: "global_in_flight",
        retryAfterS: 1,
      };
    }
    if (this.window.length >= this.limits.perMinute) {
      // Until the oldest admission leaves the window.
      const oldest = this.window[0] ?? now;
      return {
        ok: false,
        refusal: "limit",
        error: "metered_capacity_exceeded",
        limit: "global_per_minute",
        retryAfterS: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1_000)),
      };
    }
    if (clientKey !== undefined) this.perClient.set(clientKey, (this.perClient.get(clientKey) ?? 0) + 1);
    this.inFlight += 1;
    this.window.push(now);
    return { ok: true, slot: { clientKey, takenAt: now, released: false } };
  }

  /** The call ended: its in-flight slots go back. Its admission stays in the per-minute window. */
  release(slot: Slot): void {
    if (slot.released) return;
    slot.released = true;
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (slot.clientKey !== undefined) {
      const n = (this.perClient.get(slot.clientKey) ?? 1) - 1;
      if (n <= 0) this.perClient.delete(slot.clientKey);
      else this.perClient.set(slot.clientKey, n);
    }
  }

  /** The call was refused or compensated: no admission happened, so its per-minute entry goes back too. */
  refund(slot: Slot): void {
    if (slot.released) return;
    this.release(slot);
    const i = this.window.indexOf(slot.takenAt);
    if (i >= 0) this.window.splice(i, 1);
  }

  counters(): { inFlight: number; lastMinute: number } {
    this.prune(this.realNow());
    return { inFlight: this.inFlight, lastMinute: this.window.length };
  }

  private prune(now: number): void {
    while (this.window.length > 0 && (this.window[0] ?? now) <= now - WINDOW_MS) this.window.shift();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The maximum cost, and the refusals (pure)
// ---------------------------------------------------------------------------------------------------------------

/**
 * A call's maximum cost (§7.2): the input cap, counted one token per character, plus the request's output cap, or the
 * adapter's fixed usage when it declares one, whichever costs more. Each is rounded up once, on its sum (costMicro).
 */
export function maxMicroOf(
  entry: PriceEntry,
  o: { maxInputChars: number; maxOutputTokens: number; fixedUsage?: Usage },
): bigint {
  const caps = costMicro(entry, {
    inputTokens: o.maxInputChars,
    outputTokens: o.maxOutputTokens,
    cacheReadInputTokens: 0,
  });
  if (o.fixedUsage === undefined) return caps;
  const fixed = costMicro(entry, {
    inputTokens: o.fixedUsage.inputTokens,
    outputTokens: o.fixedUsage.outputTokens,
    cacheReadInputTokens: o.fixedUsage.cacheReadInputTokens ?? 0,
  });
  return fixed > caps ? fixed : caps;
}

/**
 * Step 5's first cause that applies, in the precedence of the degraded causes (gateway-http.md §2.4 step 5.6), or
 * undefined to admit. The level checks use the existing reservations, not the new one: the first call admitted near a
 * ceiling can pass it, which is the bounded overshoot, and the commit that crosses the ceiling trips the switch.
 */
export function admissionRefusal(
  locked: LockedState,
  rows: PeriodRows,
  t: Thresholds,
  r: Pick<AdmitRequest, "attribution" | "adapterHealthy" | "adapterUnhealthySince">,
): Degraded | undefined {
  if (locked.state !== "normal") {
    return degraded("kill_switch_tripped", {
      ceilings: ceilingsOf(locked.crossed),
      since: rfc3339Seconds(locked.since.getTime()),
    });
  }
  const atCeiling = [
    { meter: "day" as const, row: rows.day, ceiling: t.dayCeiling },
    { meter: "month" as const, row: rows.month, ceiling: t.monthCeiling },
  ].filter((m) => m.row.spentMicro + m.row.reservedMicro >= m.ceiling);
  if (atCeiling.length > 0) {
    const reached = atCeiling
      .map((m) => m.row.reachedAt?.getTime())
      .filter((ms): ms is number => ms !== undefined)
      .sort((a, b) => a - b)[0];
    return degraded("meter_at_ceiling", {
      ceilings: atCeiling.map((m) => m.meter),
      ...(reached === undefined ? {} : { since: rfc3339Seconds(reached) }),
    });
  }
  if (r.attribution !== "fallback") return undefined;
  if (locked.fallbackAwaitingRenewal) {
    return degraded(
      "fallback_awaiting_renewal",
      locked.fallbackAwaitingSince === null ? {} : { since: rfc3339Seconds(locked.fallbackAwaitingSince.getTime()) },
    );
  }
  const fb = rows.fallbackDay;
  if (fb.spentMicro + fb.reservedMicro >= fb.allowanceMicro) return degraded("fallback_spent_today");
  if (!r.adapterHealthy) {
    return degraded(
      "fallback_unavailable",
      r.adapterUnhealthySince === undefined ? {} : { since: rfc3339Seconds(r.adapterUnhealthySince) },
    );
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// The transaction
// ---------------------------------------------------------------------------------------------------------------

export type AdmissionOut =
  | { kind: "admitted"; admitted: Admitted; effects: TxEffects }
  | { kind: "refused"; decision: Degraded; effects: TxEffects }
  | { kind: "uninitialized" };

export interface AdmissionInput {
  request: AdmitRequest;
  reservationId: string;
  price: PriceVersion;
  maxMicro: bigint;
  /** budgets.yaml's reservation_ttl_s. */
  ttlS: number;
  routingSha: string;
  txDeps: TxDeps;
  realNow: () => number;
}

export async function admissionTx(q: Queryable, input: AdmissionInput): Promise<AdmissionOut> {
  const r = input.request;
  // 1. The state row first.
  const locked = await lockState(q);
  if (locked === undefined) throw new Rollback<AdmissionOut>({ kind: "uninitialized" });
  // 2. The gateway time, from the row this transaction has locked.
  const real = input.realNow();
  const now = gatewayTime(real, locked.testClockOffsetMs);
  const tx = new MeterTx(q, input.txDeps, locked, now);
  // 3. The sweep. What it settles is spend the live meter must count, so a refusal below keeps it (tasks.md T072).
  const swept = await sweepExpired(tx);
  // 4. The current periods' rows.
  const periods = periodsAt(now);
  const rows = await upsertPeriodRows(q, periods, input.txDeps.thresholds.fallbackGrant, tx.nowIso);
  // 5. The refusals, against the state as the sweep left it.
  const refusal = admissionRefusal(tx.locked, rows, input.txDeps.thresholds, r);
  if (refusal !== undefined) {
    if (swept === 0) throw new Rollback<AdmissionOut>({ kind: "refused", decision: refusal, effects: tx.effects });
    await tx.flushAlerts();
    return { kind: "refused", decision: refusal, effects: tx.effects };
  }
  // 6. The reservation.
  const expiresAt = now + input.ttlS * 1_000;
  const routeReason = r.attribution === "fallback" ? r.routeReason : null;
  await q.query(
    `INSERT INTO gateway.reservations (id, attribution, adapter_id, provider, model, price_version, max_micro,
       period_day, period_month, created_at, expires_at, request_id, trace_id, purpose, route_reason, routing_sha)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      input.reservationId,
      r.attribution,
      r.adapter.id,
      r.adapter.provider,
      r.adapter.model,
      input.price.id,
      String(input.maxMicro),
      periods.day,
      periods.month,
      tx.nowIso,
      toRfc3339(expiresAt),
      r.requestId,
      r.traceId,
      r.purpose,
      routeReason,
      input.routingSha,
    ],
  );
  // 7. Reserved, on the rows the call counts toward.
  await shiftReserved(q, rowsOf(r.attribution, periods), input.maxMicro, tx.nowIso);
  await tx.flushAlerts();
  tx.effects.changed = true;
  return {
    kind: "admitted",
    effects: tx.effects,
    admitted: {
      reservationId: input.reservationId,
      attribution: r.attribution,
      adapterId: r.adapter.id,
      provider: r.adapter.provider,
      model: r.adapter.model,
      price: input.price,
      maxMicro: input.maxMicro,
      periodDay: periods.day,
      periodMonth: periods.month,
      createdAt: now,
      expiresAt,
      retryUntil: real + input.ttlS * 1_000,
      requestId: r.requestId,
      traceId: r.traceId,
      purpose: r.purpose,
      routeReason,
      routingSha: input.routingSha,
      ...(r.room === undefined ? {} : { room: r.room }),
    },
  };
}

/**
 * §7.2 step 8's compensation, after a `reserve` append failed (or COMMIT's answer was lost): under the state lock,
 * delete the reservation, and subtract it from its rows only when the DELETE returned it, since a sweep may have
 * settled it meanwhile (§2.3). Resolves true when it removed one.
 */
export async function compensateTx(q: Queryable, a: Admitted, realNow: () => number): Promise<boolean> {
  const locked = await lockState(q);
  const nowIso = toRfc3339(gatewayTime(realNow(), locked?.testClockOffsetMs ?? null));
  const deleted = await q.query("DELETE FROM gateway.reservations WHERE id = $1 RETURNING id", [a.reservationId]);
  if (deleted.rows.length === 0) return false;
  await shiftReserved(q, rowsOf(a.attribution, { day: a.periodDay, month: a.periodMonth }), -a.maxMicro, nowIso);
  return true;
}
