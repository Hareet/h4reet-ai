// The commit of a metered call (data-model.md §7.3), and the ledger rows the metered path writes (§2.5).
//
//   BEGIN
//    1. lock stack_state FOR UPDATE
//    2. a ledger row for this reservation exists → nothing to do (a retry after a lost acknowledgement, or the sweep
//       settled it)
//    3. DELETE the reservation; if a row came back, subtract it from reserved_micro on its rows
//    4. INSERT the ledger row, at the reservation's periods and price version
//    5. add the cost to spent_micro on the reservation's rows
//    6. the crossings, and their alert rows, which NOTIFY with the commit (crossings.ts)
//   COMMIT
//    8. the journal's `commit` record (a failed append doesn't undo the commit)
//    9. h4.cost.usd, only when this transaction inserted the ledger row
//
// The meter finds the cost itself, from how the call ended (settlementOf), never from its caller: its usage at the
// reservation's price version (`usage`), its reserved maximum when it failed possibly billed (`reservation`), or 0
// when nothing could be billed (`none`).
import { costMicro, PriceTable } from "../config/validate.js";
import { gatewayTime, toRfc3339 } from "../core/clock.js";
import type { AdapterResult, Attribution, FinishReason, ProviderErrorKind } from "../core/types.js";
import { lockState, MeterTx, noEffects, type LockedState, type TxDeps, type TxEffects } from "./crossings.js";
import { rowsOf, type RowKey } from "./rollover.js";
import type { Queryable } from "./store.js";
import type { Admitted, CallEnd, MeteredAttribution, RouteReason, SettledCall } from "./types.js";

/** One ledger row (data-model.md §2.5), as the metered path writes it. */
export interface LedgerRow {
  id: string;
  reservationId: string | null;
  /** The gateway clock, epoch ms. */
  ts: number;
  startedAt: number;
  stack: string;
  requestId: string;
  traceId: string;
  purpose: string;
  routeDecision: "local" | "fallback" | "metered";
  routeReason: RouteReason | null;
  attribution: Attribution;
  adapterId: string;
  provider: string;
  requestModel: string;
  responseModel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  latencyMs: number;
  finishReason: FinishReason | null;
  outcome: "ok" | "error" | "unknown";
  errorKind: ProviderErrorKind | null;
  costMicro: bigint;
  costBasis: "usage" | "reservation" | "expired" | "none";
  priceVersion: string;
  routingSha: string;
  periodDay: string;
  periodMonth: string;
  clientLabel: string | null;
  /** A twin call's room feature and topic (spec 007, FR-026); NULL for every other call. */
  roomFeature?: string | null;
  roomTopic?: string | null;
}

/** The ledger's routing decision for a metered call: fallback, or metered for dev's synthetic and prod's tests. */
export function routeDecisionOf(attribution: MeteredAttribution): "fallback" | "metered" {
  return attribution === "fallback" ? "fallback" : "metered";
}

const LEDGER_COLUMNS = [
  "id",
  "reservation_id",
  "ts",
  "started_at",
  "stack",
  "request_id",
  "trace_id",
  "purpose",
  "route_decision",
  "route_reason",
  "attribution",
  "adapter_id",
  "provider",
  "request_model",
  "response_model",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "latency_ms",
  "finish_reason",
  "outcome",
  "error_kind",
  "cost_micro",
  "cost_basis",
  "price_version",
  "routing_sha",
  "period_day",
  "period_month",
  "client_label",
  "room_feature",
  "room_topic",
] as const;

export const INSERT_LEDGER = `INSERT INTO gateway.ledger (${LEDGER_COLUMNS.join(", ")})
  VALUES (${LEDGER_COLUMNS.map((_, i) => `$${i + 1}`).join(", ")})`;

export async function insertLedgerRow(q: Queryable, r: LedgerRow): Promise<void> {
  await q.query(INSERT_LEDGER, [
    r.id,
    r.reservationId,
    toRfc3339(r.ts),
    toRfc3339(r.startedAt),
    r.stack,
    r.requestId,
    r.traceId,
    r.purpose,
    r.routeDecision,
    r.routeReason,
    r.attribution,
    r.adapterId,
    r.provider,
    r.requestModel,
    r.responseModel,
    r.inputTokens,
    r.outputTokens,
    r.cacheReadTokens,
    r.latencyMs,
    r.finishReason,
    r.outcome,
    r.errorKind,
    String(r.costMicro),
    r.costBasis,
    r.priceVersion,
    r.routingSha,
    r.periodDay,
    r.periodMonth,
    r.clientLabel,
    r.roomFeature ?? null,
    r.roomTopic ?? null,
  ]);
}

/** reserved_micro on each row a reservation was charged to, by its maximum (§2.3's invariant). */
export async function shiftReserved(
  q: Queryable,
  keys: readonly RowKey[],
  delta: bigint,
  nowIso: string,
): Promise<void> {
  for (const key of keys) {
    await q.query(
      `UPDATE gateway.meters SET reserved_micro = reserved_micro + $3, updated_at = $4
       WHERE meter = $1 AND period_key = $2`,
      [key.meter, key.periodKey, String(delta), nowIso],
    );
  }
}

/** A result's usage at the reservation's price version, or undefined when no price can take it. */
function usageCost(a: Admitted, result: AdapterResult): bigint | undefined {
  const entry = PriceTable.lookup(a.price, a.provider, a.model);
  if (entry === undefined) return undefined;
  try {
    return costMicro(entry, result.usage);
  } catch {
    return undefined; // a placeholder price, or a token count that isn't a non-negative integer
  }
}

/** A call charged its reserved maximum as a failure: it ended unknown, or the meter couldn't price it. */
function atMaximum(a: Admitted, startedAt: number, endedAt: number): SettledCall {
  return {
    outcome: "error",
    costBasis: "reservation",
    costMicro: a.maxMicro,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    responseModel: null,
    finishReason: null,
    errorKind: "provider_error",
    latencyMs: Math.max(0, Math.round(endedAt - startedAt)),
    startedAt,
    endedAt,
  };
}

/**
 * How a metered call settled, priced by the meter from how it ended (data-model.md §7.3's table), at the reservation's
 * price version and maximum, never at a cost its caller states:
 * - an attempt that returned a result costs its usage;
 * - one that failed possibly billed (any timeout of a paid adapter) costs the reservation's maximum;
 * - any other failure costs 0.
 * The call costs the sum of its attempts. With the shipped retry policies only an unbilled `rate_limited` is retried
 * (provider-adapter.md §3.2), so the sum is the last attempt's cost. A call that ended `unknown`, because the code
 * around it failed, or one whose usage no price can take, is charged its maximum as a failure: fail safe.
 */
export function settlementOf(a: Admitted, end: CallEnd, now: number): SettledCall {
  if ("unknown" in end) return atMaximum(a, end.at, end.at);
  const first = end.attempts[0];
  const last = end.attempts.at(-1);
  if (first === undefined || last === undefined) return atMaximum(a, now, now);
  let cost = 0n;
  for (const attempt of end.attempts) {
    if (attempt.outcome === "error") {
      if (attempt.error.possiblyBilled) cost += a.maxMicro;
      continue;
    }
    const usage = usageCost(a, attempt.result);
    if (usage === undefined) return atMaximum(a, first.startedAt, last.endedAt);
    cost += usage;
  }
  if (last.outcome === "ok") {
    const r = last.result;
    return {
      outcome: "ok",
      costBasis: "usage",
      costMicro: cost,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      cacheReadTokens: r.usage.cacheReadInputTokens ?? 0,
      responseModel: r.responseModel,
      finishReason: r.finishReason,
      errorKind: null,
      latencyMs: r.latencyMs,
      startedAt: first.startedAt,
      endedAt: last.endedAt,
    };
  }
  return {
    outcome: "error",
    // A failed call that costs anything was charged its maximum for a possibly billed attempt; otherwise nothing.
    costBasis: cost > 0n ? "reservation" : "none",
    costMicro: cost,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    responseModel: null,
    finishReason: null,
    errorKind: last.error.kind,
    latencyMs: Math.max(0, Math.round(last.endedAt - last.startedAt)),
    startedAt: first.startedAt,
    endedAt: last.endedAt,
  };
}

/** What one commit attempt did. */
export interface CommitOut {
  /** This transaction inserted the ledger row: only then does h4.cost.usd grow (§7.3 step 9). */
  inserted: boolean;
  /** The ledger row a retry found was this commit's own, from an attempt whose acknowledgement was lost. */
  ownRowFound: boolean;
  ledgerId: string;
  /** The gateway time of the commit, for the journal's record. */
  now: number;
  effects: TxEffects;
}

export interface CommitInput {
  admitted: Admitted;
  call: SettledCall;
  clientLabel: string | null;
  /** Made once per call, so a retry recognizes the row its lost attempt wrote. */
  ledgerId: string;
  stack: string;
  realNow: () => number;
  /** The gateway clock's offset as the process knows it: used only when the store has no state row. */
  offsetMs: number | null;
  txDeps: TxDeps;
}

/** The ledger row of a settled metered call, at this gateway time and test-clock offset. */
export function commitLedgerRow(input: CommitInput, now: number, offsetMs: number | null): LedgerRow {
  const { admitted: a, call: c } = input;
  return {
    id: input.ledgerId,
    reservationId: a.reservationId,
    ts: now,
    startedAt: gatewayTime(c.startedAt, offsetMs),
    stack: input.stack,
    requestId: a.requestId,
    traceId: a.traceId,
    purpose: a.purpose,
    routeDecision: routeDecisionOf(a.attribution),
    routeReason: a.attribution === "fallback" ? a.routeReason : null,
    attribution: a.attribution,
    adapterId: a.adapterId,
    provider: a.provider,
    requestModel: a.model,
    responseModel: c.responseModel,
    inputTokens: c.inputTokens,
    outputTokens: c.outputTokens,
    cacheReadTokens: c.cacheReadTokens,
    latencyMs: Math.max(0, Math.round(c.latencyMs)),
    finishReason: c.finishReason,
    outcome: c.outcome,
    errorKind: c.outcome === "error" ? (c.errorKind ?? "provider_error") : null,
    costMicro: c.costMicro,
    costBasis: c.costBasis,
    priceVersion: a.price.id,
    routingSha: a.routingSha,
    periodDay: a.periodDay,
    periodMonth: a.periodMonth,
    clientLabel: input.clientLabel,
    ...(a.room === undefined ? {} : { roomFeature: a.room.feature, roomTopic: a.room.topic }),
  };
}

/** One commit attempt, in its own transaction: §7.3 steps 1 to 7. */
export async function commitTx(q: Queryable, input: CommitInput): Promise<CommitOut> {
  const a = input.admitted;
  // 1. The state row first. A store wiped since admission has none: the ledger row is still written, so the next
  //    initialization counts this call, but there are no meters to charge until then.
  const locked: LockedState | undefined = await lockState(q);
  const offset = locked === undefined ? input.offsetMs : locked.testClockOffsetMs;
  const now = gatewayTime(input.realNow(), offset);
  // 2. Already committed: by this call's own lost attempt, or by the sweep.
  const existing = await q.query<{ id: string }>("SELECT id FROM gateway.ledger WHERE reservation_id = $1", [
    a.reservationId,
  ]);
  const found = existing.rows[0];
  if (found !== undefined) {
    return { inserted: false, ownRowFound: found.id === input.ledgerId, ledgerId: found.id, now, effects: noEffects() };
  }
  const periods = { day: a.periodDay, month: a.periodMonth };
  const keys = rowsOf(a.attribution, periods);
  const nowIso = toRfc3339(now);
  // 3. The reservation, released only when it was still there: the sweep may have settled it, and then step 2 has
  //    returned already; a commit never subtracts what no reservation holds (§2.3).
  const deleted = await q.query<{ max_micro: unknown }>(
    "DELETE FROM gateway.reservations WHERE id = $1 RETURNING max_micro",
    [a.reservationId],
  );
  if (deleted.rows.length > 0) await shiftReserved(q, keys, -a.maxMicro, nowIso);
  // 4. The ledger row.
  const row = commitLedgerRow(input, now, offset);
  await insertLedgerRow(q, row);
  if (locked === undefined) {
    return { inserted: true, ownRowFound: false, ledgerId: row.id, now, effects: { ...noEffects(), changed: true } };
  }
  // 5–7. The spend, its crossings, and their alert rows.
  const tx = new MeterTx(q, input.txDeps, locked, now);
  await tx.charge(
    keys,
    {
      ledgerId: row.id,
      traceId: a.traceId,
      provider: a.provider,
      model: a.model,
      attribution: a.attribution,
      costMicro: input.call.costMicro,
    },
    periods,
  );
  await tx.flushAlerts();
  tx.effects.changed = true;
  return { inserted: true, ownRowFound: false, ledgerId: row.id, now, effects: tx.effects };
}

/** call.completed for a metered attempt's committed row (telemetry.md §5.2). */
export function completedRecord(a: Admitted, c: SettledCall): Record<string, unknown> {
  return {
    event: "call.completed",
    route_decision: routeDecisionOf(a.attribution),
    route_reason: a.attribution === "fallback" ? a.routeReason : null,
    attribution: a.attribution,
    adapter: a.adapterId,
    provider: a.provider,
    request_model: a.model,
    response_model: c.responseModel,
    // Only when there is usage: the logger censors a token-named key that isn't a number.
    ...(c.inputTokens === null || c.outputTokens === null
      ? {}
      : { input_tokens: c.inputTokens, output_tokens: c.outputTokens }),
    latency_ms: Math.max(0, Math.round(c.latencyMs)),
    cost_micro: Number(c.costMicro),
    cost_basis: c.costBasis,
    price_version: a.price.id,
    outcome: c.outcome,
    error_kind: c.outcome === "error" ? (c.errorKind ?? "provider_error") : null,
  };
}
