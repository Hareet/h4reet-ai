// The operator's writes to the meter and the kill switch (data-model.md §6.1, §6.2, §7.5): what a reset and a
// renewal change, as pure rules here, and their transactions (tasks.md T075, T076).
import type { Thresholds } from "../config/validate.js";
import type { Ceiling } from "../alerts/format.js";
import type { LockedRow } from "./rollover.js";

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
export function metersAtCeiling(
  rows: readonly LockedRow[],
  t: Thresholds,
  periods: { day: string; month: string },
): Ceiling[] {
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
