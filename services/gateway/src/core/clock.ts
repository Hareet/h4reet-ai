// The gateway clock (data-model.md, Conventions).
//
// The gateway clock is real UTC time plus stack_state.test_clock_offset_ms. The offset exists only in dev (FR-036),
// moves only forward, and is null everywhere else. Period keys, reservation expiry, the 09:00 reminder, and every
// record's `ts` use the gateway clock. Timeouts, retries, rate limits, circuit breakers, health intervals, and alert
// delivery use the process's real clock, so a dev clock jump never shortens a timeout.
//
// Days and months are UTC (FR-031; Clarifications, 2026-10-08): a day key is YYYY-MM-DD, a month key YYYY-MM.

const DAY_MS = 86_400_000;

export interface PeriodKeys {
  day: string;
  month: string;
}

function checkInstant(ms: number): Date {
  if (!Number.isFinite(ms)) throw new RangeError("not a finite time");
  return new Date(ms);
}

function checkOffset(offsetMs: number | null): number {
  if (offsetMs === null) return 0;
  if (!Number.isSafeInteger(offsetMs) || offsetMs < 0) {
    throw new RangeError("the test clock offset must be a whole, non-negative number of milliseconds");
  }
  return offsetMs;
}

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/** The UTC month key, YYYY-MM. */
export function monthKey(ms: number): string {
  const d = checkInstant(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}`;
}

/** The UTC day key, YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = checkInstant(ms);
  return `${monthKey(ms)}-${pad(d.getUTCDate(), 2)}`;
}

export function periodKeys(ms: number): PeriodKeys {
  return { day: dayKey(ms), month: monthKey(ms) };
}

/** The gateway time for a real time and the store's offset (null outside dev). */
export function gatewayTime(realMs: number, offsetMs: number | null): number {
  return realMs + checkOffset(offsetMs);
}

/** RFC 3339 in UTC, with milliseconds: 2026-10-28T10:15:02.114Z. */
export function toRfc3339(ms: number): string {
  return checkInstant(ms).toISOString();
}

/** The start of the next UTC day: when a per-day count resets. */
export function nextUtcDayStart(ms: number): number {
  checkInstant(ms);
  return (Math.floor(ms / DAY_MS) + 1) * DAY_MS;
}

/**
 * The process's view of the gateway clock. The offset is the store's: every request reads it with the state at
 * request start (data-model.md §7.1), and the background tasks refresh it, so this copy only ever lags the store.
 */
export class GatewayClock {
  private offset: number | null = null;

  constructor(private readonly real: () => number = Date.now) {}

  /** The real clock: for timeouts, retries, rate limits, circuit breakers, and health intervals. */
  realNow(): number {
    return this.real();
  }

  /** The gateway clock: for period keys, reservation expiry, the reminder, and records' `ts`. */
  now(): number {
    return gatewayTime(this.real(), this.offset);
  }

  periodKeys(): PeriodKeys {
    return periodKeys(this.now());
  }

  offsetMs(): number | null {
    return this.offset;
  }

  /** The store's stack_state.test_clock_offset_ms, as last read. */
  setOffsetMs(offsetMs: number | null): void {
    checkOffset(offsetMs);
    this.offset = offsetMs;
  }
}
