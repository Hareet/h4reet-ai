// Spend, and what it crosses (data-model.md §7.3 step 6; §6.1, §6.2). One place adds a cost to meter rows, for a
// commit and for the sweep's settlement alike, and evaluates the crossings in the same transaction:
//
//   meter         threshold                      effect
//   day           warning, 3,500,000             a warn alert, warned_at
//   month         warning, 14,000,000            a warn alert, warned_at
//   fallback_day  the grant's warning            a warn alert for grant n (:g<n>), warned_at
//   day, month    the ceiling                    the trip: reached_at; degraded (since, if it was normal); crossed
//                                                gains <meter>:<period>; a trip alert; an incidents row; a trip audit row
//   fallback_day  the allowance, while the       the exhaustion: reached_at; the renewal flag and its since; a
//                 flag is false                  fallback_exhausted alert (:g<n>); a fallback_exhausted audit row
//   adapter_month its cap × warn_ratio           a warn alert (:adapter_month:<adapter>:<month>), warned_at (spec 010)
//   adapter_month its cap                        the cap: reached_at; the renewal flag and its since when the adapter is
//                                                the route's fallback and the flag is false; a fallback_exhausted alert
//                                                (:adapter_month:<adapter>:<month>); a fallback_exhausted audit row
//
// Each fires only when the old value is below the threshold and the new one is at or above it, on committed spend.
// So spend already past a threshold never fires it again, and a reset can't trip twice on the same period. The alert
// rows go into the transaction that crosses, so degradation is committed before any delivery is attempted (FR-032,
// FR-033). They are rendered last, with the meters and the state as the transaction leaves them.
import type { AdapterMonthFacts, AlertContext, AlertSpec, MeterFacts } from "../alerts/format.js";
import { dedupeKey, queueAlert } from "../alerts/outbox.js";
import type { AlertsConfig, EnvClass, StackName, Thresholds } from "../config/validate.js";
import { toRfc3339 } from "../core/clock.js";
import type { Attribution } from "../core/types.js";
import { readPeriodRows, type LockedRow, type Periods, type RowKey } from "./rollover.js";
import { toBigInt, type MeterName, type Queryable } from "./store.js";

// ---------------------------------------------------------------------------------------------------------------
// The state row, locked first (data-model.md §2.1)
// ---------------------------------------------------------------------------------------------------------------

export interface LockedState {
  stack: string;
  env: string;
  state: "normal" | "degraded";
  since: Date;
  crossed: string[];
  fallbackAwaitingRenewal: boolean;
  fallbackAwaitingSince: Date | null;
  testClockOffsetMs: number | null;
}

export const LOCK_STATE =
  "SELECT stack, env, state, since, crossed, fallback_awaiting_renewal, fallback_awaiting_since, test_clock_offset_ms FROM gateway.stack_state WHERE id = 1 FOR UPDATE";

/**
 * The first statement of every transaction that changes stack_state or meters: it serializes admissions, commits,
 * the sweep, and operator actions, and rules out deadlocks (data-model.md §2.1). Undefined when there is no row.
 */
export async function lockState(q: Queryable): Promise<LockedState | undefined> {
  const { rows } = await q.query<{
    stack: string;
    env: string;
    state: "normal" | "degraded";
    since: Date | string;
    crossed: string[];
    fallback_awaiting_renewal: boolean;
    fallback_awaiting_since: Date | string | null;
    test_clock_offset_ms: unknown;
  }>(LOCK_STATE);
  const row = rows[0];
  if (row === undefined) return undefined;
  return {
    stack: row.stack,
    env: row.env,
    state: row.state,
    since: new Date(row.since),
    crossed: [...row.crossed],
    fallbackAwaitingRenewal: row.fallback_awaiting_renewal,
    fallbackAwaitingSince: row.fallback_awaiting_since === null ? null : new Date(row.fallback_awaiting_since),
    testClockOffsetMs: row.test_clock_offset_ms === null ? null : Number(row.test_clock_offset_ms),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Crossings: which thresholds a change of committed spend crosses (pure)
// ---------------------------------------------------------------------------------------------------------------

/** One row's committed spend, before and after a cost was added to it. */
export interface SpendChange {
  meter: MeterName;
  periodKey: string;
  before: bigint;
  after: bigint;
  /** fallback_day only. */
  allowanceMicro?: bigint;
  grantNo?: number;
}

export type Crossing =
  | { kind: "warn"; meter: MeterName; periodKey: string; threshold: bigint; grantNo?: number }
  | { kind: "trip"; ceiling: "day" | "month"; periodKey: string; threshold: bigint }
  | { kind: "exhausted"; periodKey: string; allowanceMicro: bigint; grantNo: number }
  /** Spec 010 (FR-023): a capped adapter's month at its cap. */
  | { kind: "capped"; periodKey: string; capMicro: bigint };

/** old < threshold ≤ new: edge-triggered, on committed spend. */
export const crosses = (before: bigint, threshold: bigint, after: bigint): boolean =>
  before < threshold && threshold <= after;

/**
 * The crossings of these changes, in the order their effects are written: day, month, fallback_day, then a capped
 * adapter's month (spec 010), each warning before its ceiling, exhaustion, or cap. Exhaustion fires only while the
 * renewal flag is false; an adapter's cap fires whatever the flag, and sets it only when it is false.
 */
export function crossingsOf(changes: readonly SpendChange[], t: Thresholds, awaitingRenewal: boolean): Crossing[] {
  const order: MeterName[] = ["day", "month", "fallback_day", "adapter_month"];
  const out: Crossing[] = [];
  for (const meter of order) {
    for (const c of changes.filter((x) => x.meter === meter)) {
      if (meter === "adapter_month") {
        const cap = t.adapterCaps.get(c.periodKey.split(":")[0] ?? "");
        if (cap === undefined) continue;
        if (crosses(c.before, cap.warn, c.after)) {
          out.push({ kind: "warn", meter, periodKey: c.periodKey, threshold: cap.warn });
        }
        if (crosses(c.before, cap.cap, c.after))
          out.push({ kind: "capped", periodKey: c.periodKey, capMicro: cap.cap });
        continue;
      }
      if (meter === "day" || meter === "month") {
        const warn = meter === "day" ? t.dayWarn : t.monthWarn;
        const ceiling = meter === "day" ? t.dayCeiling : t.monthCeiling;
        if (crosses(c.before, warn, c.after))
          out.push({ kind: "warn", meter, periodKey: c.periodKey, threshold: warn });
        if (crosses(c.before, ceiling, c.after)) {
          out.push({ kind: "trip", ceiling: meter, periodKey: c.periodKey, threshold: ceiling });
        }
        continue;
      }
      const allowance = c.allowanceMicro ?? t.fallbackGrant;
      const grantNo = c.grantNo ?? 1;
      const warn = t.fallbackWarn(allowance);
      if (crosses(c.before, warn, c.after)) {
        out.push({ kind: "warn", meter, periodKey: c.periodKey, threshold: warn, grantNo });
      }
      if (!awaitingRenewal && crosses(c.before, allowance, c.after)) {
        out.push({ kind: "exhausted", periodKey: c.periodKey, allowanceMicro: allowance, grantNo });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The transaction's context: the locked state, the effects to emit once it commits, and the spend it adds
// ---------------------------------------------------------------------------------------------------------------

export interface MeterLogger {
  info(record: object, msg: string): void;
  warn(record: object, msg: string): void;
  error(record: object, msg: string): void;
}

/** What a transaction does outside the store, only once it has committed: the cost counter, logs, the gauges. */
export interface TxEffects {
  costs: { micro: bigint; provider: string; model: string; attribution: Attribution }[];
  logs: { level: "info" | "warn" | "error"; record: Record<string, unknown>; msg: string }[];
  /** A meter or the state changed: the gauges' snapshot is refreshed (telemetry.md §4.1). */
  changed: boolean;
}

export const noEffects = (): TxEffects => ({ costs: [], logs: [], changed: false });

/** Emits a committed transaction's effects. */
export function emitEffects(
  effects: TxEffects,
  o: { logger: MeterLogger; cost: (micro: bigint, a: TxEffects["costs"][number]) => void },
): void {
  for (const c of effects.costs) o.cost(c.micro, c);
  for (const l of effects.logs) o.logger[l.level](l.record, l.msg);
}

export interface TxDeps {
  stack: StackName;
  envClass: EnvClass;
  thresholds: Thresholds;
  /** budgets.yaml's warn_ratio, in basis points. */
  warnRatioBp: bigint;
  alerts: AlertsConfig;
  /** Whether this stack routes a fallback: the alerts' Fallback line says none without one. */
  hasFallback: boolean;
  /** The route's fallback adapter's ID: an adapter month's cap sets the renewal flag only for it (spec 010, FR-023). */
  fallbackAdapterId?: string | null;
  /** How an alert names each adapter: its type's label ("the Anthropic API"), by its ID; the ID without one. */
  adapterLabels?: ReadonlyMap<string, string>;
  realNow: () => number;
}

/** The call a crossing is charged to: its ledger row and identity, for the audit rows and the incident. */
export interface CrossingCall {
  ledgerId: string;
  traceId: string;
  provider: string;
  model: string;
  attribution: Attribution;
  costMicro: bigint;
}

interface PendingAlert {
  key: string;
  spec: Exclude<AlertSpec, { kind: "store_unreachable" }>;
  /** The periods the crossing call was charged to: the alert shows their meters (alerts.md §2, "Periods"). */
  periods: Periods;
}

/**
 * One transaction under the state lock. It holds the locked state as the transaction changes it, the gateway time of
 * the transaction (the real clock plus the locked row's offset), and the effects to emit once it commits.
 */
export class MeterTx {
  readonly effects: TxEffects = noEffects();
  private readonly pending: PendingAlert[] = [];
  /** killswitch.tripped, once this transaction has set degraded: later ceilings in it join its list. */
  private tripRecord:
    { event: "killswitch.tripped"; ceilings: string[]; day_micro?: number; month_micro?: number } | undefined;

  constructor(
    readonly q: Queryable,
    readonly deps: TxDeps,
    readonly locked: LockedState,
    /** The gateway time, epoch ms. */
    readonly now: number,
  ) {}

  get nowIso(): string {
    return toRfc3339(this.now);
  }

  log(level: "info" | "warn" | "error", record: Record<string, unknown>, msg: string): void {
    this.effects.logs.push({ level, record, msg });
  }

  /**
   * Adds a committed cost to these rows, creating a row its period doesn't have yet, then writes the effects of every
   * threshold the change crosses (data-model.md §7.3 steps 5 and 6). The alert rows wait for flushAlerts.
   */
  async charge(keys: readonly RowKey[], call: CrossingCall, periods: Periods): Promise<SpendChange[]> {
    if (call.costMicro <= 0n) return [];
    this.effects.changed = true;
    const t = this.deps.thresholds;
    const changes: SpendChange[] = [];
    for (const key of keys) {
      const fallback = key.meter === "fallback_day";
      const { rows } = await this.q.query<{ spent_micro: unknown; allowance_micro: unknown; grant_no: unknown }>(
        `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no,
           created_at, updated_at)
         VALUES ($1, $2, $3, 0, $4, $5, $6, $6)
         ON CONFLICT (meter, period_key) DO UPDATE
           SET spent_micro = gateway.meters.spent_micro + EXCLUDED.spent_micro, updated_at = EXCLUDED.updated_at
         RETURNING spent_micro, allowance_micro, grant_no`,
        [
          key.meter,
          key.periodKey,
          String(call.costMicro),
          fallback ? String(t.fallbackGrant) : null,
          fallback ? 1 : null,
          this.nowIso,
        ],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("the meter upsert returned no row");
      const after = toBigInt(row.spent_micro);
      changes.push({
        meter: key.meter,
        periodKey: key.periodKey,
        before: after - call.costMicro,
        after,
        ...(fallback ? { allowanceMicro: toBigInt(row.allowance_micro), grantNo: Number(row.grant_no) } : {}),
      });
    }
    const crossings = crossingsOf(changes, t, this.locked.fallbackAwaitingRenewal);
    if (crossings.length === 0) return changes;
    // The meters as this charge leaves them: the trip's and the exhaustion's audit rows keep them for the incident
    // draft's "Meters at the crossing" (alerts.md §7).
    const snapshot = crossings.some((c) => c.kind !== "warn") ? await this.snapshot(periods) : undefined;
    for (const crossing of crossings) await this.apply(crossing, call, changes, snapshot, periods);
    if (this.tripRecord !== undefined) this.spendOnTrip(changes);
    return changes;
  }

  /**
   * killswitch.tripped is the transaction that sets degraded (telemetry.md §5.2): one record, naming every ceiling
   * crossed in it, with the day's and the month's spend as it leaves them. A ceiling crossed on a stack that was
   * degraded already sets nothing, and has its trip alert, incident, and audit row without one.
   */
  private tripped(ceiling: "day" | "month", setsDegraded: boolean): void {
    if (this.tripRecord === undefined) {
      if (!setsDegraded) return;
      this.tripRecord = { event: "killswitch.tripped", ceilings: [] };
      this.log("error", this.tripRecord, "The kill switch tripped: a spending ceiling was reached.");
    }
    this.tripRecord.ceilings.push(ceiling);
  }

  private spendOnTrip(changes: readonly SpendChange[]): void {
    if (this.tripRecord === undefined) return;
    const day = changes.find((x) => x.meter === "day")?.after;
    const month = changes.find((x) => x.meter === "month")?.after;
    if (day !== undefined) this.tripRecord.day_micro = Number(day);
    if (month !== undefined) this.tripRecord.month_micro = Number(month);
  }

  private async snapshot(periods: Periods): Promise<Record<string, unknown>> {
    const rows = await readPeriodRows(this.q, periods);
    const t = this.deps.thresholds;
    const row = (meter: MeterName) => rows.find((r) => r.meter === meter);
    const n = (v: bigint | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
    const fb = row("fallback_day");
    const allowance = fb?.allowanceMicro ?? t.fallbackGrant;
    return {
      day: {
        period: periods.day,
        spent_micro: n(row("day")?.spentMicro ?? 0n),
        reserved_micro: n(row("day")?.reservedMicro ?? 0n),
        ceiling_micro: n(t.dayCeiling),
        warn_micro: n(t.dayWarn),
      },
      month: {
        period: periods.month,
        spent_micro: n(row("month")?.spentMicro ?? 0n),
        reserved_micro: n(row("month")?.reservedMicro ?? 0n),
        ceiling_micro: n(t.monthCeiling),
        warn_micro: n(t.monthWarn),
      },
      fallback_day: {
        period: periods.day,
        spent_micro: n(fb?.spentMicro ?? 0n),
        reserved_micro: n(fb?.reservedMicro ?? 0n),
        allowance_micro: n(allowance),
        grant_no: fb?.grantNo ?? 1,
        warn_micro: n(t.fallbackWarn(allowance)),
      },
    };
  }

  private async apply(
    c: Crossing,
    call: CrossingCall,
    changes: readonly SpendChange[],
    snapshot: Record<string, unknown> | undefined,
    periods: Periods,
  ): Promise<void> {
    const { stack } = this.deps;
    const meter: MeterName =
      c.kind === "trip"
        ? c.ceiling
        : c.kind === "warn"
          ? c.meter
          : c.kind === "capped"
            ? "adapter_month"
            : "fallback_day";
    const change = changes.find((x) => x.meter === meter);
    const after = change?.after ?? 0n;
    const before = change?.before ?? 0n;
    if (c.kind === "warn" && c.meter === "adapter_month") {
      await this.q.query(
        "UPDATE gateway.meters SET warned_at = $3, updated_at = $3 WHERE meter = $1 AND period_key = $2",
        [c.meter, c.periodKey, this.nowIso],
      );
      this.crossedLog(c.meter, c.periodKey, "warn", after, c.threshold);
      this.pending.push({
        key: dedupeKey.warn(stack, c.meter, c.periodKey),
        spec: {
          kind: "warn",
          meter: c.meter,
          warnRatioBp: this.deps.warnRatioBp,
          adapterMonth: this.adapterMonthFacts(c.periodKey, after),
        },
        periods,
      });
      return;
    }
    if (c.kind === "capped") {
      await this.capped(c, call, after, snapshot, periods);
      return;
    }
    if (c.kind === "warn") {
      await this.q.query(
        "UPDATE gateway.meters SET warned_at = $3, updated_at = $3 WHERE meter = $1 AND period_key = $2",
        [c.meter, c.periodKey, this.nowIso],
      );
      this.crossedLog(c.meter, c.periodKey, "warn", after, c.threshold, c.grantNo);
      this.pending.push({
        key: dedupeKey.warn(stack, c.meter, c.periodKey, c.grantNo),
        spec: {
          kind: "warn",
          meter: c.meter as "day" | "month" | "fallback_day",
          warnRatioBp: this.deps.warnRatioBp,
          ...(c.grantNo === undefined ? {} : { grantNo: c.grantNo }),
        },
        periods,
      });
      return;
    }
    if (c.kind === "trip") {
      await this.q.query(
        "UPDATE gateway.meters SET reached_at = $3, updated_at = $3 WHERE meter = $1 AND period_key = $2",
        [c.ceiling, c.periodKey, this.nowIso],
      );
      const entry = `${c.ceiling}:${c.periodKey}`;
      const beforeState = { state: this.locked.state, crossed: [...this.locked.crossed] };
      const { rows } = await this.q.query<{ state: "normal" | "degraded"; since: Date | string; crossed: string[] }>(
        `UPDATE gateway.stack_state
         SET since = CASE WHEN state = 'normal' THEN $1::timestamptz ELSE since END, state = 'degraded',
             crossed = CASE WHEN $2 = ANY (crossed) THEN crossed ELSE array_append(crossed, $2) END, updated_at = $1
         WHERE id = 1
         RETURNING state, since, crossed`,
        [this.nowIso, entry],
      );
      const updated = rows[0];
      if (updated === undefined) throw new Error("the state row vanished under its lock");
      this.locked.state = updated.state;
      this.locked.since = new Date(updated.since);
      this.locked.crossed = [...updated.crossed];
      const key = dedupeKey.trip(stack, c.ceiling, c.periodKey);
      await this.q.query(
        `INSERT INTO gateway.incidents (created_at, stack, ceiling, period_key, ledger_id, trip_alert_key, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'queued')
         ON CONFLICT (ceiling, period_key) DO NOTHING`,
        [this.nowIso, stack, c.ceiling, c.periodKey, call.ledgerId, key],
      );
      await this.audit(
        "trip",
        beforeState,
        { state: this.locked.state, since: toRfc3339(this.locked.since.getTime()), crossed: [...this.locked.crossed] },
        {
          ceiling: c.ceiling,
          period: c.periodKey,
          ledger_id: call.ledgerId,
          trace_id: call.traceId,
          provider: call.provider,
          model: call.model,
          attribution: call.attribution,
          cost_micro: Number(call.costMicro),
          spent_before_micro: Number(before),
          spent_after_micro: Number(after),
          ceiling_micro: Number(c.threshold),
          degraded_now: beforeState.state === "normal",
          meters: snapshot ?? null,
        },
      );
      this.crossedLog(c.ceiling, c.periodKey, "ceiling", after, c.threshold);
      this.tripped(c.ceiling, beforeState.state === "normal");
      this.pending.push({ key, spec: { kind: "trip", ceiling: c.ceiling }, periods });
      return;
    }
    // The exhaustion: the sub-budget's grant is spent, and fallback stays refused until a renewal (FR-030).
    await this.q.query(
      "UPDATE gateway.meters SET reached_at = $2, updated_at = $2 WHERE meter = 'fallback_day' AND period_key = $1",
      [c.periodKey, this.nowIso],
    );
    await this.q.query(
      `UPDATE gateway.stack_state SET fallback_awaiting_renewal = true, fallback_awaiting_since = $1, updated_at = $1
       WHERE id = 1`,
      [this.nowIso],
    );
    this.locked.fallbackAwaitingRenewal = true;
    this.locked.fallbackAwaitingSince = new Date(this.now);
    await this.audit(
      "fallback_exhausted",
      { fallback_awaiting_renewal: false },
      { fallback_awaiting_renewal: true, fallback_awaiting_since: this.nowIso },
      {
        period: c.periodKey,
        grant_no: c.grantNo,
        allowance_micro: Number(c.allowanceMicro),
        spent_micro: Number(after),
        ledger_id: call.ledgerId,
        trace_id: call.traceId,
        meters: snapshot ?? null,
      },
    );
    this.crossedLog("fallback_day", c.periodKey, "allowance", after, c.allowanceMicro, c.grantNo);
    this.log(
      "warn",
      {
        event: "fallback.exhausted",
        grant_no: c.grantNo,
        allowance_micro: Number(c.allowanceMicro),
        spent_micro: Number(after),
      },
      "The fallback sub-budget's grant is spent; fallback is refused until the operator renews it.",
    );
    this.pending.push({
      key: dedupeKey.fallbackExhausted(stack, c.periodKey, c.grantNo),
      spec: { kind: "fallback_exhausted", grantNo: c.grantNo },
      periods,
    });
  }

  /** An adapter month's facts for its alert: its ID, its label, its month, its spend, and its cap. */
  private adapterMonthFacts(periodKey: string, spentMicro: bigint): AdapterMonthFacts {
    const [adapter = "", month = ""] = periodKey.split(":");
    return {
      adapter,
      label: this.deps.adapterLabels?.get(adapter) ?? adapter,
      month,
      spentMicro,
      capMicro: this.deps.thresholds.adapterCaps.get(adapter)?.cap ?? 0n,
    };
  }

  /**
   * An adapter month at its cap (spec 010, FR-023): reached_at; the renewal flag, when the adapter is the route's
   * fallback and the flag is false; a fallback_exhausted audit row naming the adapter and the month; and its alert.
   * The adapter itself stays refused by its month's level (admission's adapter_month_spent) until the month rolls over
   * or the cap is raised: a renewal restores the paid fallback, not the capped adapter.
   */
  private async capped(
    c: Extract<Crossing, { kind: "capped" }>,
    call: CrossingCall,
    after: bigint,
    snapshot: Record<string, unknown> | undefined,
    periods: Periods,
  ): Promise<void> {
    const facts = this.adapterMonthFacts(c.periodKey, after);
    await this.q.query(
      "UPDATE gateway.meters SET reached_at = $2, updated_at = $2 WHERE meter = 'adapter_month' AND period_key = $1",
      [c.periodKey, this.nowIso],
    );
    const flags = facts.adapter === this.deps.fallbackAdapterId && !this.locked.fallbackAwaitingRenewal;
    if (flags) {
      await this.q.query(
        `UPDATE gateway.stack_state SET fallback_awaiting_renewal = true, fallback_awaiting_since = $1, updated_at = $1
         WHERE id = 1`,
        [this.nowIso],
      );
      this.locked.fallbackAwaitingRenewal = true;
      this.locked.fallbackAwaitingSince = new Date(this.now);
    }
    const state = { fallback_awaiting_renewal: this.locked.fallbackAwaitingRenewal };
    await this.audit(
      "fallback_exhausted",
      flags ? { fallback_awaiting_renewal: false } : state,
      flags ? { fallback_awaiting_renewal: true, fallback_awaiting_since: this.nowIso } : state,
      {
        adapter: facts.adapter,
        month: facts.month,
        cap_micro: Number(c.capMicro),
        spent_micro: Number(after),
        ledger_id: call.ledgerId,
        trace_id: call.traceId,
        meters: snapshot ?? null,
      },
    );
    this.crossedLog("adapter_month", c.periodKey, "cap", after, c.capMicro);
    this.log(
      "warn",
      {
        event: "adapter_month.capped",
        adapter: facts.adapter,
        month: facts.month,
        cap_micro: Number(c.capMicro),
        spent_micro: Number(after),
        fallback_awaiting_renewal: this.locked.fallbackAwaitingRenewal,
      },
      "A paid adapter's month reached its cap; the adapter is refused until the month rolls over or the cap is raised.",
    );
    this.pending.push({
      key: dedupeKey.adapterMonthExhausted(this.deps.stack, c.periodKey),
      spec: { kind: "fallback_exhausted", adapterMonth: facts },
      periods,
    });
  }

  private crossedLog(
    meter: MeterName,
    period: string,
    threshold: "warn" | "ceiling" | "allowance" | "cap",
    spent: bigint,
    thresholdMicro: bigint,
    grantNo?: number,
  ): void {
    this.log(
      "warn",
      {
        event: "meter.threshold_crossed",
        meter,
        period,
        threshold,
        spent_micro: Number(spent),
        threshold_micro: Number(thresholdMicro),
        ...(meter === "fallback_day" && grantNo !== undefined ? { grant_no: grantNo } : {}),
      },
      "A meter crossed a threshold.",
    );
  }

  /** An audit row by the gateway itself (data-model.md §2.6): no reason, which only an operator gives. */
  async audit(
    action: "trip" | "fallback_exhausted",
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.q.query(
      `INSERT INTO gateway.audit_log (ts, stack, actor, action, reason, before, after, detail)
       VALUES ($1, $2, 'gateway', $3, NULL, $4::jsonb, $5::jsonb, $6::jsonb)`,
      [this.nowIso, this.deps.stack, action, JSON.stringify(before), JSON.stringify(after), JSON.stringify(detail)],
    );
  }

  /** The alert facts of these periods' meters, as this transaction leaves them. */
  async meterFacts(periods: Periods): Promise<MeterFacts> {
    return meterFactsOf(await readPeriodRows(this.q, periods), this.deps.thresholds);
  }

  /** The alerts' context: the state as this transaction leaves it, at the transaction's gateway time. */
  alertContext(key: string, meters: MeterFacts | undefined): AlertContext {
    return {
      stack: this.deps.stack,
      envClass: this.deps.envClass,
      prefix: this.deps.alerts.prefixes[this.deps.stack],
      dedupeKey: key,
      at: this.now,
      testClock: this.locked.testClockOffsetMs !== null,
      runtime:
        this.locked.state === "degraded"
          ? { state: "degraded", since: this.locked.since.getTime() }
          : { state: "normal" },
      fallback: !this.deps.hasFallback
        ? { state: "none" }
        : this.locked.fallbackAwaitingRenewal && this.locked.fallbackAwaitingSince !== null
          ? { state: "awaiting", since: this.locked.fallbackAwaitingSince.getTime() }
          : { state: "available" },
      ...(meters === undefined ? {} : { meters }),
    };
  }

  /** Queues one alert in this transaction, rendered from its final facts; logs alert.queued once it commits. */
  async queue(
    key: string,
    spec: Exclude<AlertSpec, { kind: "store_unreachable" }>,
    meters?: MeterFacts,
  ): Promise<void> {
    const queued = await queueAlert(this.q, this.alertContext(key, meters), spec, this.deps.realNow());
    if (queued) this.log("info", { event: "alert.queued", dedupe_key: key, kind: spec.kind }, "An alert was queued.");
  }

  /**
   * The crossings' alert rows, rendered with the meters and the state as the transaction leaves them, each with the
   * meters of the periods its call was charged to (§7.3 step 7; enqueueAlert's NOTIFY goes with the commit).
   */
  async flushAlerts(): Promise<void> {
    const facts = new Map<string, MeterFacts>();
    for (const p of this.pending.splice(0)) {
      const at = `${p.periods.day} ${p.periods.month}`;
      let meters = facts.get(at);
      if (meters === undefined) {
        meters = await this.meterFacts(p.periods);
        facts.set(at, meters);
      }
      await this.queue(p.key, p.spec, meters);
    }
  }
}

/** The facts of the alerts' meters line, from rows that may not exist yet: no row is 0 spend and the full grant. */
export function meterFactsOf(rows: readonly LockedRow[], t: Thresholds): MeterFacts {
  const row = (meter: MeterName) => rows.find((r) => r.meter === meter);
  const allowance = row("fallback_day")?.allowanceMicro ?? t.fallbackGrant;
  return {
    dayMicro: row("day")?.spentMicro ?? 0n,
    dayCeilingMicro: t.dayCeiling,
    dayWarnMicro: t.dayWarn,
    monthMicro: row("month")?.spentMicro ?? 0n,
    monthCeilingMicro: t.monthCeiling,
    monthWarnMicro: t.monthWarn,
    fallbackMicro: row("fallback_day")?.spentMicro ?? 0n,
    fallbackAllowanceMicro: allowance,
    fallbackWarnMicro: t.fallbackWarn(allowance),
    grantNo: row("fallback_day")?.grantNo ?? 1,
  };
}
