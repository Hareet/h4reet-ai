// The operator's writes to the meter and the kill switch (data-model.md §6.1, §6.2, §7.5; contracts/operator-admin.md
// §2.1, §2.2, §3.1): a reset, a renewal, and dev's test clock; and spec 003's studio GPU window (its
// contracts/gpu-window.md §1), which writes the same records and changes no meter or state. Each:
// - locks stack_state first (the locking order of §2.1);
// - writes its audit row, and for a reset or a renewal its operator_action alert, in the same transaction as the change;
// - then appends its journal record: `operator` for a reset or a renewal, `clock` for the test clock. A failed append is
//   reported in the response as "journal": "unwritable", and in a second audit row, journal_failed, which carries the
//   action's audit_id: the first row is append-only. It doesn't undo the action. The studio window's record is
//   `operator` too, with its state.
// When COMMIT's answer is lost, the write may have landed: the audit row it wrote is looked for, and if it is there the
// action finishes as if the acknowledgement had come (tasks.md T072's rule, applied to every operator write).
import type { Ceiling } from "../alerts/format.js";
import { dedupeKey } from "../alerts/outbox.js";
import type { Budgets, EnvClass, StackName, Thresholds } from "../config/validate.js";
import { gatewayTime, toRfc3339, type GatewayClock } from "../core/clock.js";
import { rfc3339Seconds } from "../core/router.js";
import type { GatewayMetrics, OperatorAction } from "../telemetry/metrics.js";
import { usd } from "../alerts/format.js";
import { lockState, meterFactsOf, MeterTx, type TxDeps, type TxEffects } from "./crossings.js";
import type { Operator } from "./init.js";
import { JournalWriteError, type Journal, type NewRecord } from "./journal.js";
import { periodsAt, readPeriodRows, upsertPeriodRows, type LockedRow, type Periods } from "./rollover.js";
import {
  CommitUnknownError,
  isStoreFailure,
  Rollback,
  STUDIO_WINDOW_SQL,
  studioWindowOf,
  toBigInt,
  type Queryable,
  type Store,
  type StudioWindowRow,
} from "./store.js";
import { sweepExpired } from "./sweep.js";

// ---------------------------------------------------------------------------------------------------------------
// The rules (pure)
// ---------------------------------------------------------------------------------------------------------------

/**
 * A renewal's allowance (binding decision 13; data-model.md §6.2): today's fallback spend plus reservations plus the
 * grant, so exactly the grant is available from that moment, whatever the day, and always inside the daily ceiling.
 * Measured from spend and reservations together, an overshoot never shrinks the next grant.
 */
export function renewedAllowance(spentMicro: bigint, reservedMicro: bigint, grantMicro: bigint): bigint {
  return spentMicro + reservedMicro + grantMicro;
}

/**
 * The day and month meters at or above their ceiling, counting reservations, as admission counts them: after a
 * reset, metered calls stay refused (meter_at_ceiling) while any is (FR-034, US2-4). A period with no row yet is 0.
 */
export function metersAtCeiling(rows: readonly LockedRow[], t: Thresholds, periods: Periods): Ceiling[] {
  const level = (meter: "day" | "month", key: string): bigint => {
    const row = rows.find((r) => r.meter === meter && r.periodKey === key);
    return row === undefined ? 0n : row.spentMicro + row.reservedMicro;
  };
  const out: Ceiling[] = [];
  if (level("day", periods.day) >= t.dayCeiling) out.push("day");
  if (level("month", periods.month) >= t.monthCeiling) out.push("month");
  return out;
}

/**
 * What a reset does (data-model.md §6.1; operator-admin.md §2.1): from `degraded` to `normal`, since now, crossed
 * emptied. It leaves the meters alone, so admission still refuses at a ceiling, and the renewal flag, since a reset
 * isn't a renewal. A stack that is already normal refuses it with 409 not_degraded.
 */
export function resetPlan(
  state: { state: "normal" | "degraded"; since: Date; crossed: readonly string[] },
  nowMs: number,
): { refuse: "not_degraded" } | { after: { state: "normal"; since: number; crossed: string[] } } {
  if (state.state === "normal") return { refuse: "not_degraded" };
  return { after: { state: "normal", since: nowMs, crossed: [] } };
}

/** Today's fallback sub-budget, as the renewal's answer shows it (operator-admin.md §2.2). No row yet is a full grant. */
export function fallbackToday(rows: readonly LockedRow[], t: Thresholds, day: string) {
  const row = rows.find((r) => r.meter === "fallback_day" && r.periodKey === day);
  const allowance = row?.allowanceMicro ?? t.fallbackGrant;
  const spent = row?.spentMicro ?? 0n;
  const reserved = row?.reservedMicro ?? 0n;
  const room = allowance - spent - reserved;
  return {
    day,
    grant: row?.grantNo ?? 1,
    allowance_micro_usd: Number(allowance),
    spent_micro_usd: Number(spent),
    reserved_micro_usd: Number(reserved),
    available_micro_usd: Number(room > 0n ? room : 0n),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The transactions
// ---------------------------------------------------------------------------------------------------------------

export interface OperatorDeps {
  stack: StackName;
  envClass: EnvClass;
  store: Store;
  journal: Journal;
  clock: GatewayClock;
  budgets: Budgets;
  metrics: GatewayMetrics;
  logger: { info(record: object, msg: string): void; warn(record: object, msg: string): void };
  realNow: () => number;
  /** The meter's transaction context (the thresholds, the alerts' settings) and its effects' emitter. */
  meter: { txDeps(): TxDeps; emit(effects: TxEffects): void };
  /** After a committed write: the gauges follow at once (telemetry.md §4.1). */
  onChange?: () => void;
}

export type OperatorResult = { status: 200 | 409 | 503; body: Record<string, unknown> };

const UNREACHABLE: OperatorResult = { status: 503, body: { error: "store_unreachable" } };

const DETAILS = {
  store_uninitialized: "The store has no state row: initialize it first, with make operator-init.",
  not_degraded: "The kill switch is normal; there is nothing to reset.",
  not_awaiting_renewal: "The fallback sub-budget isn't awaiting renewal; there is nothing to renew.",
  clock_backwards: "The test clock moves forward only: that time is before the gateway's current time.",
  already_open: "A studio window is already open: end it first, with STATE=end.",
  not_open: "No studio window is open: there is nothing to end.",
} as const;

const refusal = (error: keyof typeof DETAILS, extra: Record<string, unknown> = {}): OperatorResult => ({
  status: 409,
  body: { error, detail: DETAILS[error], ...extra },
});

/** What a write's transaction leaves for after its COMMIT. */
interface Written {
  auditId: number;
  /** The gateway time the journal's record carries. */
  journalAt: number;
  body: Record<string, unknown>;
  journal: NewRecord;
  effects: TxEffects;
  before: unknown;
  after: unknown;
  /** dev's clock: the offset the process's clock follows once the write has committed. */
  offsetMs?: number;
}

async function auditRow(
  q: Queryable,
  o: {
    ts: string;
    stack: string;
    actor: string;
    action: string;
    reason: string;
    before: unknown;
    after: unknown;
    detail: unknown;
  },
): Promise<number> {
  const { rows } = await q.query<{ id: unknown }>(
    `INSERT INTO gateway.audit_log (ts, stack, actor, action, reason, before, after, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb) RETURNING id`,
    [
      o.ts,
      o.stack,
      o.actor,
      o.action,
      o.reason,
      JSON.stringify(o.before),
      JSON.stringify(o.after),
      JSON.stringify(o.detail),
    ],
  );
  return Number(toBigInt(rows[0]?.id));
}

/** Whether a write whose COMMIT answer was lost landed: its audit row is there. */
async function landed(store: Store, auditId: number, action: string): Promise<boolean> {
  try {
    const { rows } = await store.query("SELECT 1 FROM gateway.audit_log WHERE id = $1 AND action = $2", [
      auditId,
      action,
    ]);
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Runs one operator write: its transaction, then, once it has committed, its effects, its journal record (a failure
 * audited as journal_failed), the h4.operator.actions count, and its h4.audit log record.
 */
async function operatorWrite(
  deps: OperatorDeps,
  action: Extract<OperatorAction, "reset" | "renew" | "test_clock" | "studio_window">,
  reason: string,
  operator: Operator,
  fn: (q: Queryable) => Promise<Written>,
): Promise<OperatorResult> {
  let out: Written | OperatorResult;
  try {
    out = await deps.store.transaction<Written | OperatorResult>(fn);
  } catch (err) {
    if (err instanceof CommitUnknownError) {
      const lost = err.value as Written | OperatorResult;
      if ("status" in lost || !(await landed(deps.store, lost.auditId, action))) return UNREACHABLE;
      out = lost;
    } else if (isStoreFailure(err)) {
      return UNREACHABLE;
    } else {
      throw err;
    }
  }
  if ("status" in out) return out;
  if (out.offsetMs !== undefined) deps.clock.setOffsetMs(out.offsetMs);
  deps.meter.emit(out.effects);

  let journal: "ok" | "unwritable" = "ok";
  try {
    await deps.journal.append(out.journal, out.journalAt);
  } catch (err) {
    if (!(err instanceof JournalWriteError)) throw err;
    journal = "unwritable";
    await deps.store
      .query(
        `INSERT INTO gateway.audit_log (ts, stack, actor, action, reason, before, after, detail)
         VALUES ($1, $2, 'gateway', 'journal_failed', NULL, NULL, NULL, $3::jsonb)`,
        [toRfc3339(out.journalAt), deps.stack, JSON.stringify({ audit_id: out.auditId, error_class: err.code })],
      )
      .catch(() => {});
  }
  deps.metrics.operatorAction(action);
  deps.logger.info(
    {
      event: `operator.${action}`,
      "event.name": "h4.audit",
      audit_id: out.auditId,
      actor: operator.actor,
      action,
      reason,
      before: out.before,
      after: out.after,
    },
    "An operator action was accepted.",
  );
  deps.onChange?.();
  return { status: 200, body: { ...out.body, journal } };
}

/** POST /admin/reset (operator-admin.md §2.1; data-model.md §7.5): `normal` again, the meters untouched. */
export function resetKillSwitch(deps: OperatorDeps, reason: string, operator: Operator): Promise<OperatorResult> {
  return operatorWrite(deps, "reset", reason, operator, async (q) => {
    const locked = await lockState(q);
    if (locked === undefined) throw new Rollback(refusal("store_uninitialized"));
    const now = gatewayTime(deps.realNow(), locked.testClockOffsetMs);
    const plan = resetPlan(locked, now);
    if ("refuse" in plan) throw new Rollback(refusal(plan.refuse));
    const txDeps = deps.meter.txDeps();
    const t = txDeps.thresholds;
    const before = { state: locked.state, since: toRfc3339(locked.since.getTime()), crossed: [...locked.crossed] };
    const tx = new MeterTx(q, txDeps, locked, now);
    const periods = periodsAt(now);
    const rows = await readPeriodRows(q, periods);
    const atCeiling = metersAtCeiling(rows, t, periods);
    await q.query(
      "UPDATE gateway.stack_state SET state = 'normal', since = $1, crossed = '{}', updated_at = $1 WHERE id = 1",
      [tx.nowIso],
    );
    tx.locked.state = "normal";
    tx.locked.since = new Date(now);
    tx.locked.crossed = [];
    const after = { state: "normal", since: tx.nowIso, crossed: [] };
    const auditId = await auditRow(q, {
      ts: tx.nowIso,
      stack: deps.stack,
      actor: operator.actor,
      action: "reset",
      reason,
      before,
      after,
      // The meters still at or above a ceiling: metered calls stay refused while they are (§7.5).
      detail: { meters_at_ceiling: atCeiling, periods },
    });
    await tx.queue(
      dedupeKey.operatorAction(deps.stack, "reset", auditId),
      { kind: "operator_action", action: "reset", fingerprint: operator.fingerprint, metersAtCeiling: atCeiling },
      meterFactsOf(rows, t),
    );
    tx.effects.changed = true;
    const held =
      atCeiling.length === 0
        ? ""
        : ` Metered calls stay refused while these meters are at or above their ceiling: ${atCeiling.join(", ")}.`;
    return {
      auditId,
      journalAt: now,
      body: {
        action: "reset",
        audit_id: auditId,
        state: "normal",
        since: rfc3339Seconds(now),
        meters_at_ceiling: atCeiling,
        note: `Local answers resume now.${held}`,
      },
      journal: {
        kind: "operator",
        action: "reset",
        audit_id: auditId,
        actor: operator.actor,
        period_day: periods.day,
        period_month: periods.month,
      },
      effects: tx.effects,
      before,
      after,
    };
  });
}

/**
 * POST /admin/renew (operator-admin.md §2.2; data-model.md §6.2, §7.5): today's allowance set to fallback spend plus
 * reservations plus a grant, the grant number up by one, and the flag cleared. On a degraded stack it is allowed, and
 * fallback stays refused with kill_switch_tripped until a reset.
 */
export function renewFallback(deps: OperatorDeps, reason: string, operator: Operator): Promise<OperatorResult> {
  return operatorWrite(deps, "renew", reason, operator, async (q) => {
    const locked = await lockState(q);
    if (locked === undefined) throw new Rollback(refusal("store_uninitialized"));
    const now = gatewayTime(deps.realNow(), locked.testClockOffsetMs);
    const periods = periodsAt(now);
    const txDeps = deps.meter.txDeps();
    const t = txDeps.thresholds;
    if (!locked.fallbackAwaitingRenewal) {
      const rows = await readPeriodRows(q, periods);
      throw new Rollback(refusal("not_awaiting_renewal", { fallback: fallbackToday(rows, t, periods.day) }));
    }
    const awaitingSince = locked.fallbackAwaitingSince;
    const tx = new MeterTx(q, txDeps, locked, now);
    // 2. The sweep, then today's rows: a renewal is measured from everything spent or held (§6.2).
    await sweepExpired(tx);
    const rows = await upsertPeriodRows(q, periods, t.fallbackGrant, tx.nowIso);
    const fb = rows.fallbackDay;
    // 3. The allowance rule, and the grant's number.
    const allowance = renewedAllowance(fb.spentMicro, fb.reservedMicro, t.fallbackGrant);
    const grantNo = fb.grantNo + 1;
    await q.query(
      `UPDATE gateway.meters SET allowance_micro = $2, grant_no = $3, updated_at = $4
       WHERE meter = 'fallback_day' AND period_key = $1`,
      [periods.day, String(allowance), grantNo, tx.nowIso],
    );
    // 4. The flag.
    await q.query(
      `UPDATE gateway.stack_state SET fallback_awaiting_renewal = false, fallback_awaiting_since = NULL, updated_at = $1
       WHERE id = 1`,
      [tx.nowIso],
    );
    tx.locked.fallbackAwaitingRenewal = false;
    tx.locked.fallbackAwaitingSince = null;
    // 5. The audit row carries the new allowance and grant, as the journal record does (ADR 0020).
    const fallbackDay = (a: bigint, g: number) => ({
      period_key: periods.day,
      allowance_micro: Number(a),
      grant_no: g,
      spent_micro: Number(fb.spentMicro),
      reserved_micro: Number(fb.reservedMicro),
    });
    const before = {
      fallback_day: fallbackDay(fb.allowanceMicro, fb.grantNo),
      fallback_awaiting_renewal: true,
      fallback_awaiting_since: awaitingSince === null ? null : toRfc3339(awaitingSince.getTime()),
    };
    const after = { fallback_day: fallbackDay(allowance, grantNo), fallback_awaiting_renewal: false };
    const auditId = await auditRow(q, {
      ts: tx.nowIso,
      stack: deps.stack,
      actor: operator.actor,
      action: "renew",
      reason,
      before,
      after,
      detail: { grant_micro: Number(t.fallbackGrant), degraded: locked.state === "degraded" },
    });
    await tx.flushAlerts(); // the sweep's crossings, if it settled anything
    const facts = meterFactsOf([rows.day, rows.month, { ...fb, allowanceMicro: allowance, grantNo }], t);
    await tx.queue(
      dedupeKey.operatorAction(deps.stack, "renew", auditId),
      {
        kind: "operator_action",
        action: "renew",
        fingerprint: operator.fingerprint,
        grantNo,
        grantMicro: t.fallbackGrant,
      },
      facts,
    );
    tx.effects.changed = true;
    const available = allowance - fb.spentMicro - fb.reservedMicro;
    const roomLeft = t.dayCeiling - rows.day.spentMicro - rows.day.reservedMicro;
    const room = roomLeft > 0n ? roomLeft : 0n;
    const degraded =
      locked.state === "degraded"
        ? " The kill switch is still degraded, so fallback stays refused with kill_switch_tripped until a reset."
        : "";
    return {
      auditId,
      journalAt: now,
      body: {
        action: "renew",
        audit_id: auditId,
        fallback: {
          day: periods.day,
          grant: grantNo,
          allowance_micro_usd: Number(allowance),
          spent_micro_usd: Number(fb.spentMicro),
          reserved_micro_usd: Number(fb.reservedMicro),
          available_micro_usd: Number(available),
        },
        day_ceiling_room_micro_usd: Number(room),
        note:
          `Fallback passes again now: $${usd(available)} more is available today, within the daily ceiling ` +
          `($${usd(room)} of room left).${degraded}`,
      },
      journal: {
        kind: "operator",
        action: "renew",
        audit_id: auditId,
        actor: operator.actor,
        period_day: periods.day,
        period_month: periods.month,
        allowance_micro: Number(allowance),
        grant_no: grantNo,
      },
      effects: tx.effects,
      before,
      after,
    };
  });
}

/** The longest advance one request may make: 366 days (operator-admin.md §3.1). */
export const MAX_ADVANCE_S = 31_622_400;

/**
 * POST /admin/test/clock (operator-admin.md §3.1; data-model.md §7.5): dev's gateway clock forward, never back,
 * persisted as an offset from real time. No alert. The state and the renewal flag are never touched: meters roll over
 * lazily, at the next admission.
 */
export function setTestClock(
  deps: OperatorDeps,
  req: { set?: number; advanceS?: number; reason: string },
  operator: Operator,
): Promise<OperatorResult> {
  return operatorWrite(deps, "test_clock", req.reason, operator, async (q) => {
    const locked = await lockState(q);
    if (locked === undefined) throw new Rollback(refusal("store_uninitialized"));
    const real = deps.realNow();
    const current = gatewayTime(real, locked.testClockOffsetMs);
    const target = req.set ?? current + (req.advanceS ?? 0) * 1_000;
    if (target < current) {
      throw new Rollback(refusal("clock_backwards", { gateway_time: toRfc3339(current) }));
    }
    // It never decreases: the target is at or after the current gateway time, which is real time plus the old offset.
    const offset = target - real;
    await q.query("UPDATE gateway.stack_state SET test_clock_offset_ms = $1, updated_at = $2 WHERE id = 1", [
      String(offset),
      toRfc3339(target),
    ]);
    const before = { offset_ms: locked.testClockOffsetMs };
    const after = { offset_ms: offset };
    const auditId = await auditRow(q, {
      ts: toRfc3339(target),
      stack: deps.stack,
      actor: operator.actor,
      action: "test_clock",
      reason: req.reason,
      before,
      after,
      detail: { gateway_time: toRfc3339(target) },
    });
    return {
      auditId,
      journalAt: target,
      body: {
        gateway_time: toRfc3339(target),
        real_time: toRfc3339(real),
        offset_ms: offset,
        audit_id: auditId,
      },
      journal: { kind: "clock", offset_ms: offset, gateway_time: toRfc3339(target), audit_id: auditId },
      effects: { costs: [], logs: [], changed: true },
      before,
      after,
      offsetMs: offset,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// spec 003's studio GPU window (its contracts/gpu-window.md §1; FR-035)
// ---------------------------------------------------------------------------------------------------------------

export type StudioWindowState = "start" | "end";

/**
 * USD from micro-USD, with cents always and every digit that isn't 0 after them: a window's few fallback calls cost
 * fractions of a cent, which two decimals would show as $0.00. Nothing is rounded away.
 */
export function exactUsd(micro: bigint): string {
  const whole = micro / 1_000_000n;
  const fraction = (micro % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${fraction}`;
}

const calls = (n: number): string => `${n} call${n === 1 ? "" : "s"}`;

/**
 * POST /admin/studio-window: a start opens the window and an end closes it, refused with 409 already_open or not_open
 * otherwise. The window's state is the newest studio_window audit row, read under the state lock, so two writes can't
 * both open one. An end reports the ledger's fallback spend inside the window, from the start's time to its own. It
 * writes the audit row, the operator_action alert, and then the journal's operator record, as every operator write,
 * and changes no meter, budget, ceiling, routing, or state.
 */
export function studioWindow(
  deps: OperatorDeps,
  state: StudioWindowState,
  reason: string,
  operator: Operator,
): Promise<OperatorResult> {
  return operatorWrite(deps, "studio_window", reason, operator, async (q) => {
    const locked = await lockState(q);
    if (locked === undefined) throw new Rollback(refusal("store_uninitialized"));
    const now = gatewayTime(deps.realNow(), locked.testClockOffsetMs);
    const current = studioWindowOf((await q.query<StudioWindowRow>(STUDIO_WINDOW_SQL)).rows);
    if (state === "start" && current.open) {
      throw new Rollback(refusal("already_open", { since: rfc3339Seconds(current.since.getTime()) }));
    }
    if (state === "end" && !current.open) throw new Rollback(refusal("not_open"));
    const txDeps = deps.meter.txDeps();
    const tx = new MeterTx(q, txDeps, locked, now);
    const periods = periodsAt(now);
    const rows = await readPeriodRows(q, periods);
    let before: Record<string, unknown>;
    let after: Record<string, unknown>;
    let detail: Record<string, unknown>;
    let spec: Parameters<MeterTx["queue"]>[1];
    let body: Record<string, unknown>;
    if (current.open) {
      // The end: the ledger's fallback rows inside the window, [start, end), as the view gateway.v_studio_windows sums.
      const opened = toRfc3339(current.since.getTime());
      const { rows: spent } = await q.query<{ micro: unknown; n: unknown }>(
        `SELECT coalesce(sum(cost_micro), 0)::text AS micro, count(*)::text AS n FROM gateway.ledger
         WHERE attribution = 'fallback' AND ts >= $1 AND ts < $2`,
        [opened, tx.nowIso],
      );
      const micro = toBigInt(spent[0]?.micro ?? "0");
      const n = Number(toBigInt(spent[0]?.n ?? "0"));
      before = { window: "open", since: opened };
      after = { window: "closed" };
      detail = { state: "end", opened, fallback_micro: Number(micro), fallback_calls: n };
      spec = {
        kind: "operator_action",
        action: "studio_window",
        fingerprint: operator.fingerprint,
        state: "end",
        fallbackMicro: micro,
        fallbackCalls: n,
      };
      body = {
        window: "closed",
        since: rfc3339Seconds(now),
        opened: rfc3339Seconds(current.since.getTime()),
        fallback: { spent_micro_usd: Number(micro), calls: n },
        note: `The window is closed. Its fallback spend: $${exactUsd(micro)} in ${calls(n)}.`,
      };
    } else {
      before = { window: "closed" };
      after = { window: "open", since: tx.nowIso };
      detail = { state: "start" };
      spec = { kind: "operator_action", action: "studio_window", fingerprint: operator.fingerprint, state: "start" };
      body = {
        window: "open",
        since: rfc3339Seconds(now),
        note: "The window is open. Hello falls back within the sub-budget, or degrades, once the model server stops.",
      };
    }
    const auditId = await auditRow(q, {
      ts: tx.nowIso,
      stack: deps.stack,
      actor: operator.actor,
      action: "studio_window",
      reason,
      before,
      after,
      detail,
    });
    await tx.queue(
      dedupeKey.operatorAction(deps.stack, "studio_window", auditId),
      spec,
      meterFactsOf(rows, txDeps.thresholds),
    );
    // No meter or state changed; the window's gauge follows the audit row, so the gauges refresh.
    tx.effects.changed = true;
    return {
      auditId,
      journalAt: now,
      body: { action: "studio_window", audit_id: auditId, state, ...body },
      journal: {
        kind: "operator",
        action: "studio_window",
        state,
        audit_id: auditId,
        actor: operator.actor,
        period_day: periods.day,
        period_month: periods.month,
      },
      effects: tx.effects,
      before,
      after,
    };
  });
}
