// Rollover (data-model.md §6.1, §6.2, §7.6): lazy. Period keys come from the gateway clock in UTC at each admission and
// renewal, and a new period's rows are created at zero by the upsert below: day and month at no spend, and
// fallback_day at the full grant, 2,000,000, grant 1. Nothing runs at midnight. Nothing here touches stack_state:
// a rollover never changes `state`, `crossed`, or `fallback_awaiting_renewal` (FR-030, FR-033), so a tripped stack
// stays tripped and a spent sub-budget stays refused across days until an operator acts.
import { periodKeys } from "../core/clock.js";
import { toBigInt, type MeterName, type Queryable } from "./store.js";
import type { MeteredAttribution } from "./types.js";

export interface Periods {
  day: string;
  month: string;
}

/** The UTC day and month of a gateway time. */
export function periodsAt(gatewayMs: number): Periods {
  return periodKeys(gatewayMs);
}

/** One meter row: a meter and its period. */
export interface RowKey {
  meter: MeterName;
  periodKey: string;
}

/** A capped adapter's month row's key (spec 010, data-model.md §2.3): <adapter id>:<YYYY-MM>. */
export const adapterMonthKey = (adapterId: string, month: string): string => `${adapterId}:${month}`;

/**
 * The rows a call counts toward (data-model.md §2.3): fallback all three; metered and test day and month; and, for a
 * call that reserved against its adapter's month (spec 010), that month's row, named by its key.
 */
export function rowsOf(attribution: MeteredAttribution, periods: Periods, adapterMonth?: string): RowKey[] {
  const rows: RowKey[] = [
    { meter: "day", periodKey: periods.day },
    { meter: "month", periodKey: periods.month },
  ];
  if (attribution === "fallback") rows.push({ meter: "fallback_day", periodKey: periods.day });
  if (adapterMonth !== undefined) rows.push({ meter: "adapter_month", periodKey: adapterMonth });
  return rows;
}

/**
 * §7.2 step 4 for a capped adapter (spec 010, FR-022): its month's row, created at zero when the month is new, then
 * locked FOR UPDATE after the period rows. A rollover is lazy: a new month's row starts at zero, and nothing touches
 * stack_state.
 */
export async function upsertAdapterMonth(q: Queryable, key: string, nowIso: string): Promise<LockedRow> {
  await q.query(
    `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no, created_at,
       updated_at)
     VALUES ('adapter_month', $1, 0, 0, NULL, NULL, $2, $2)
     ON CONFLICT (meter, period_key) DO NOTHING`,
    [key, nowIso],
  );
  const { rows } = await q.query<RawRow>(
    `SELECT ${ROW_COLUMNS} FROM gateway.meters WHERE meter = 'adapter_month' AND period_key = $1 FOR UPDATE`,
    [key],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("the adapter_month row is missing after its upsert");
  return lockedRowOf(row);
}

/** A meter row under the transaction's lock. */
export interface LockedRow {
  meter: MeterName;
  periodKey: string;
  spentMicro: bigint;
  reservedMicro: bigint;
  /** fallback_day only. */
  allowanceMicro: bigint | null;
  grantNo: number | null;
  /** day and month: when the ceiling was reached; fallback_day: when spend last reached the allowance. */
  reachedAt: Date | null;
}

export interface PeriodRows {
  day: LockedRow;
  month: LockedRow;
  fallbackDay: LockedRow & { allowanceMicro: bigint; grantNo: number };
}

interface RawRow {
  meter: MeterName;
  period_key: string;
  spent_micro: unknown;
  reserved_micro: unknown;
  allowance_micro: unknown;
  grant_no: unknown;
  reached_at: Date | string | null;
}

export function lockedRowOf(r: RawRow): LockedRow {
  return {
    meter: r.meter,
    periodKey: r.period_key,
    spentMicro: toBigInt(r.spent_micro),
    reservedMicro: toBigInt(r.reserved_micro),
    allowanceMicro: r.allowance_micro === null ? null : toBigInt(r.allowance_micro),
    grantNo: r.grant_no === null ? null : Number(r.grant_no),
    reachedAt: r.reached_at === null ? null : new Date(r.reached_at),
  };
}

export const ROW_COLUMNS = "meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no, reached_at";

/**
 * §7.2 step 4: the current periods' rows, created when a period is new, then locked FOR UPDATE, after the state row
 * (the locking order of §2.1). A new fallback_day row starts at the full grant: "a day that ends without running it
 * out starts the next with the full $2" (FR-030).
 */
export async function upsertPeriodRows(
  q: Queryable,
  periods: Periods,
  grantMicro: bigint,
  nowIso: string,
): Promise<PeriodRows> {
  await q.query(
    `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no, created_at,
       updated_at)
     VALUES ('day', $1, 0, 0, NULL, NULL, $4, $4), ('month', $2, 0, 0, NULL, NULL, $4, $4),
            ('fallback_day', $1, 0, 0, $3, 1, $4, $4)
     ON CONFLICT (meter, period_key) DO NOTHING`,
    [periods.day, periods.month, String(grantMicro), nowIso],
  );
  const { rows } = await q.query<RawRow>(
    `SELECT ${ROW_COLUMNS} FROM gateway.meters
     WHERE (meter = 'day' AND period_key = $1) OR (meter = 'month' AND period_key = $2)
        OR (meter = 'fallback_day' AND period_key = $1)
     ORDER BY meter
     FOR UPDATE`,
    [periods.day, periods.month],
  );
  const found = rows.map(lockedRowOf);
  const pick = (meter: MeterName): LockedRow => {
    const row = found.find((r) => r.meter === meter);
    if (row === undefined) throw new Error(`the ${meter} row for the current period is missing after its upsert`);
    return row;
  };
  const fallbackDay = pick("fallback_day");
  if (fallbackDay.allowanceMicro === null || fallbackDay.grantNo === null) {
    throw new Error("the fallback_day row has no allowance");
  }
  return {
    day: pick("day"),
    month: pick("month"),
    fallbackDay: { ...fallbackDay, allowanceMicro: fallbackDay.allowanceMicro, grantNo: fallbackDay.grantNo },
  };
}

/** The current rows of these periods, without creating any: a period with no row yet has none here. */
export async function readPeriodRows(q: Queryable, periods: Periods): Promise<LockedRow[]> {
  const { rows } = await q.query<RawRow>(
    `SELECT ${ROW_COLUMNS} FROM gateway.meters
     WHERE (meter = 'day' AND period_key = $1) OR (meter = 'month' AND period_key = $2)
        OR (meter = 'fallback_day' AND period_key = $1)`,
    [periods.day, periods.month],
  );
  return rows.map(lockedRowOf);
}
