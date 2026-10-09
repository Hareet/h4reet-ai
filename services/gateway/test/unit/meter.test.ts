// The meter's arithmetic and rules (tasks.md T067; data-model.md §6, §7): pure functions, no store.
// - max_micro, the fixed usage of the synthetic adapter included;
// - cost rounded up once, on the sum;
// - crossings fired only when old < threshold ≤ new;
// - rollover never touching state, crossed, or fallback_awaiting_renewal;
// - what a reset does and doesn't;
// - every worked case of the renewal allowance (data-model.md §6.2);
// - the sweep's settlement of an expired reservation: at its maximum, cost_basis expired, outcome unknown.
import { describe, expect, it } from "vitest";

import { costMicro, thresholds, type PriceEntry } from "../../src/config/validate.js";
import { maxMicroOf, MeteredSlots } from "../../src/meter/admission.js";
import { routeDecisionOf } from "../../src/meter/commit.js";
import { crosses, crossingsOf, type SpendChange } from "../../src/meter/crossings.js";
import { metersAtCeiling, renewedAllowance, resetPlan } from "../../src/meter/operator.js";
import { rowsOf, upsertPeriodRows, type LockedRow } from "../../src/meter/rollover.js";
import type { Queryable } from "../../src/meter/store.js";
import { expiredLedgerRow, type Reservation } from "../../src/meter/sweep.js";

const t = thresholds({
  dailyMicro: 5_000_000n,
  monthlyMicro: 20_000_000n,
  fallbackDailyMicro: 2_000_000n,
  warnRatioBp: 7_000n,
});

const price = (provider: string, model: string, input: bigint, output: bigint, cache = input): PriceEntry => ({
  provider,
  model,
  input,
  output,
  cacheReadInput: cache,
  placeholders: [],
});
/** dev's synthetic entry: output $100 per million tokens, 100,000,000 micro-USD per million. */
const SYNTHETIC = price("synthetic", "metered-test", 0n, 100_000_000n);

describe("max_micro (data-model.md §7.2)", () => {
  it("reserves the synthetic adapter's real cost exactly: its fixed usage, 1,000 output tokens, is $0.10", () => {
    expect(
      maxMicroOf(SYNTHETIC, {
        maxInputChars: 2_000,
        maxOutputTokens: 128,
        fixedUsage: { inputTokens: 0, outputTokens: 1_000 },
      }),
    ).toBe(100_000n);
  });

  it("is the input cap, a token per character, plus the output cap, when no fixed usage says more", () => {
    // Without its fixed usage, the synthetic call's caps cost 128 × $100 per million: 12,800.
    expect(maxMicroOf(SYNTHETIC, { maxInputChars: 2_000, maxOutputTokens: 128 })).toBe(12_800n);
    // A paid model at $1 and $5 per million: 2,000 + 640 = 2,640, the plan's "about $0.0026" (plan §5.4).
    const paid = price("provider", "model", 1_000_000n, 5_000_000n);
    expect(maxMicroOf(paid, { maxInputChars: 2_000, maxOutputTokens: 128 })).toBe(2_640n);
    expect(maxMicroOf(paid, { maxInputChars: 2_000, maxOutputTokens: 512 })).toBe(4_560n);
    // A fixed usage that costs less than the caps doesn't lower the bound.
    expect(
      maxMicroOf(paid, { maxInputChars: 2_000, maxOutputTokens: 128, fixedUsage: { inputTokens: 1, outputTokens: 1 } }),
    ).toBe(2_640n);
  });
});

describe("cost is rounded up once, on the sum (data-model.md §7.2; config-files.md §2.3)", () => {
  it("charges config-files.md's worked example 17 micro-USD, not the 18 rounding each term would give", () => {
    const entry = price("p", "m", 123_456n, 654_321n);
    expect(costMicro(entry, { inputTokens: 41, outputTokens: 18 })).toBe(17n);
    const perTerm =
      costMicro(entry, { inputTokens: 41, outputTokens: 0 }) + costMicro(entry, { inputTokens: 0, outputTokens: 18 });
    expect(perTerm).toBe(18n);
  });

  it("charges an exact amount exactly, and the smallest fraction of a micro-USD as one", () => {
    expect(costMicro(SYNTHETIC, { inputTokens: 0, outputTokens: 1_000 })).toBe(100_000n);
    expect(costMicro(price("p", "m", 1n, 0n), { inputTokens: 1, outputTokens: 0 })).toBe(1n);
    expect(costMicro(price("p", "m", 0n, 0n), { inputTokens: 9, outputTokens: 9 })).toBe(0n);
  });
});

describe("crossings fire only when old < threshold ≤ new (data-model.md §7.3)", () => {
  const day = (before: number, after: number): SpendChange => ({
    meter: "day",
    periodKey: "2026-10-21",
    before: BigInt(before),
    after: BigInt(after),
  });
  const month = (before: number, after: number): SpendChange => ({
    ...day(before, after),
    meter: "month",
    periodKey: "2026-10",
  });
  const fb = (before: number, after: number, allowance = 2_000_000, grantNo = 1): SpendChange => ({
    ...day(before, after),
    meter: "fallback_day",
    allowanceMicro: BigInt(allowance),
    grantNo,
  });

  it("is edge-triggered", () => {
    expect(crosses(3_400_000n, 3_500_000n, 3_500_000n)).toBe(true);
    expect(crosses(3_499_999n, 3_500_000n, 3_600_000n)).toBe(true);
    expect(crosses(3_500_000n, 3_500_000n, 3_600_000n)).toBe(false); // already at it
    expect(crosses(3_400_000n, 3_500_000n, 3_499_999n)).toBe(false); // not yet
  });

  it("warns at 70% of the day and the month, and trips at their ceilings", () => {
    expect(crossingsOf([day(3_400_000, 3_500_000)], t, false)).toEqual([
      { kind: "warn", meter: "day", periodKey: "2026-10-21", threshold: 3_500_000n },
    ]);
    expect(crossingsOf([day(4_900_000, 5_000_000)], t, false)).toEqual([
      { kind: "trip", ceiling: "day", periodKey: "2026-10-21", threshold: 5_000_000n },
    ]);
    expect(crossingsOf([month(13_900_000, 14_000_000)], t, false)).toEqual([
      { kind: "warn", meter: "month", periodKey: "2026-10", threshold: 14_000_000n },
    ]);
    expect(crossingsOf([month(19_900_000, 20_000_000)], t, false)).toEqual([
      { kind: "trip", ceiling: "month", periodKey: "2026-10", threshold: 20_000_000n },
    ]);
  });

  it("never fires again for spend already past a threshold: a reset can't trip twice on one period", () => {
    expect(crossingsOf([day(5_000_000, 5_100_000), month(14_100_000, 14_200_000)], t, false)).toEqual([]);
  });

  it("fires both a warning and a ceiling crossed by one call, warning first, day before month", () => {
    expect(
      crossingsOf([day(3_000_000, 5_000_000), month(13_000_000, 20_000_000)], t, false).map((c) => c.kind),
    ).toEqual(["warn", "trip", "warn", "trip"]);
  });

  it("warns at each grant's allowance minus $0.60, and exhausts at the allowance, per grant", () => {
    expect(crossingsOf([fb(1_300_000, 1_400_000)], t, false)).toEqual([
      { kind: "warn", meter: "fallback_day", periodKey: "2026-10-21", threshold: 1_400_000n, grantNo: 1 },
    ]);
    expect(crossingsOf([fb(1_900_000, 2_000_000)], t, false)).toEqual([
      { kind: "exhausted", periodKey: "2026-10-21", allowanceMicro: 2_000_000n, grantNo: 1 },
    ]);
    // The second grant, after a same-day renewal: allowance 4,000,000, so its warning is at 3,400,000.
    expect(crossingsOf([fb(3_300_000, 3_400_000, 4_000_000, 2)], t, false)).toEqual([
      { kind: "warn", meter: "fallback_day", periodKey: "2026-10-21", threshold: 3_400_000n, grantNo: 2 },
    ]);
    expect(crossingsOf([fb(3_900_000, 4_000_000, 4_000_000, 2)], t, false)).toEqual([
      { kind: "exhausted", periodKey: "2026-10-21", allowanceMicro: 4_000_000n, grantNo: 2 },
    ]);
  });

  it("exhausts only while the renewal flag is false", () => {
    expect(crossingsOf([fb(1_900_000, 2_000_000)], t, true)).toEqual([]);
  });
});

describe("rollover never touches state, crossed, or the renewal flag (data-model.md §6.1, §6.2, §7.6)", () => {
  it("creates a new period's rows at zero, and the fallback row at the full grant, writing only meters", async () => {
    const statements: { text: string; params: unknown[] }[] = [];
    const q: Queryable = {
      async query<R>(text: string, params?: unknown[]) {
        statements.push({ text, params: params ?? [] });
        if (text.startsWith("SELECT")) {
          return {
            rows: [
              {
                meter: "day",
                period_key: "2026-10-22",
                spent_micro: 0,
                reserved_micro: 0,
                allowance_micro: null,
                grant_no: null,
                reached_at: null,
              },
              {
                meter: "fallback_day",
                period_key: "2026-10-22",
                spent_micro: 0,
                reserved_micro: 0,
                allowance_micro: 2_000_000,
                grant_no: 1,
                reached_at: null,
              },
              {
                meter: "month",
                period_key: "2026-10",
                spent_micro: 4_200_000,
                reserved_micro: 0,
                allowance_micro: null,
                grant_no: null,
                reached_at: null,
              },
            ] as R[],
          };
        }
        return { rows: [] as R[] };
      },
    };
    const rows = await upsertPeriodRows(
      q,
      { day: "2026-10-22", month: "2026-10" },
      2_000_000n,
      "2026-10-22T08:00:00.000Z",
    );
    expect(rows.fallbackDay).toMatchObject({ allowanceMicro: 2_000_000n, grantNo: 1, spentMicro: 0n });
    expect(rows.month.spentMicro).toBe(4_200_000n); // the month carries on
    for (const s of statements) {
      expect(s.text).not.toMatch(/stack_state/);
      expect(s.text).toMatch(/gateway\.meters/);
    }
    expect(statements[0]?.text).toMatch(/ON CONFLICT \(meter, period_key\) DO NOTHING/);
    expect(statements[0]?.params).toEqual(["2026-10-22", "2026-10", "2000000", "2026-10-22T08:00:00.000Z"]);
    expect(statements[1]?.text).toMatch(/FOR UPDATE$/);
  });

  it("charges each attribution to its rows: fallback to all three, metered and test to day and month", () => {
    const periods = { day: "2026-10-21", month: "2026-10" };
    expect(rowsOf("fallback", periods)).toEqual([
      { meter: "day", periodKey: "2026-10-21" },
      { meter: "month", periodKey: "2026-10" },
      { meter: "fallback_day", periodKey: "2026-10-21" },
    ]);
    expect(rowsOf("metered", periods)).toEqual(rowsOf("test", periods));
    expect(rowsOf("metered", periods).map((r) => r.meter)).toEqual(["day", "month"]);
  });
});

describe("a reset (data-model.md §6.1)", () => {
  const row = (meter: LockedRow["meter"], periodKey: string, spent: number, reserved = 0): LockedRow => ({
    meter,
    periodKey,
    spentMicro: BigInt(spent),
    reservedMicro: BigInt(reserved),
    allowanceMicro: meter === "fallback_day" ? 2_000_000n : null,
    grantNo: meter === "fallback_day" ? 1 : null,
    reachedAt: null,
  });
  const periods = { day: "2026-10-22", month: "2026-10" };

  it("restores normal, since now, and empties crossed; on a normal stack it refuses with not_degraded", () => {
    const tripped = {
      state: "degraded" as const,
      since: new Date("2026-10-22T08:10:00Z"),
      crossed: ["day:2026-10-22"],
    };
    expect(resetPlan(tripped, Date.parse("2026-10-22T09:00:00Z"))).toEqual({
      after: { state: "normal", since: Date.parse("2026-10-22T09:00:00Z"), crossed: [] },
    });
    expect(resetPlan({ ...tripped, state: "normal", crossed: [] }, Date.now())).toEqual({ refuse: "not_degraded" });
  });

  it("leaves the meters alone, so the meters at their ceiling still refuse metered calls", () => {
    expect(
      metersAtCeiling([row("day", "2026-10-22", 5_000_000), row("month", "2026-10", 8_500_000)], t, periods),
    ).toEqual(["day"]);
    // Reservations count, as admission counts them.
    expect(metersAtCeiling([row("day", "2026-10-22", 4_900_000, 100_000)], t, periods)).toEqual(["day"]);
    expect(
      metersAtCeiling([row("day", "2026-10-22", 5_000_000), row("month", "2026-10", 20_000_000)], t, periods),
    ).toEqual(["day", "month"]);
    // Yesterday's row is not today's: a new day's meter starts at zero.
    expect(metersAtCeiling([row("day", "2026-10-21", 5_000_000)], t, periods)).toEqual([]);
  });
});

describe("the renewal allowance: every worked case (data-model.md §6.2; ADR 0001)", () => {
  it.each([
    ["a day starts", 0n, 0n, 2_000_000n],
    ["$2.00 spent and the flag set; a same-day renewal", 2_000_000n, 0n, 4_000_000n],
    ["a renewal on a later day, before any fallback spend", 0n, 0n, 2_000_000n],
    ["$4.00 spent after one renewal; a second same-day renewal", 4_000_000n, 0n, 6_000_000n],
    ["1,950,000 spent and 100,000 reserved, then a renewal (an overshoot)", 1_950_000n, 100_000n, 4_050_000n],
  ])("%s", (_case, spent, reserved, allowance) => {
    expect(renewedAllowance(spent, reserved, t.fallbackGrant)).toBe(allowance);
    // Exactly $2.00 is available at that moment.
    expect(allowance - spent - reserved).toBe(2_000_000n);
  });

  it("warns once per grant at 70% of it: 1,400,000 for grant 1, 3,400,000 for the second case's grant 2", () => {
    expect(t.fallbackWarn(2_000_000n)).toBe(1_400_000n);
    expect(t.fallbackWarn(4_000_000n)).toBe(3_400_000n);
    expect(t.fallbackWarn(6_000_000n)).toBe(5_400_000n);
  });
});

describe("the sweep settles an expired reservation at its maximum (data-model.md §2.4)", () => {
  const reservation: Reservation = {
    id: "7d3f0c52-4a1e-4b8e-9f61-2c5a8e0d9b17",
    attribution: "fallback",
    adapterId: "synthetic",
    provider: "synthetic",
    model: "metered-test",
    priceVersion: "2026-10-08.1",
    maxMicro: 100_000n,
    periodDay: "2026-10-28",
    periodMonth: "2026-10",
    createdAt: Date.parse("2026-10-28T10:15:02.114Z"),
    expiresAt: Date.parse("2026-10-28T10:17:02.114Z"),
    requestId: "9c1e5b0a3f2d4e6b8a7c1d2e3f4a5b6c",
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    purpose: "hello",
    routeReason: "local_failed",
    routingSha: "ab".repeat(32),
  };

  it("writes cost_basis expired and outcome unknown, with nothing known but the call's identity and bound", () => {
    const now = Date.parse("2026-10-28T10:17:10.000Z");
    expect(expiredLedgerRow(reservation, "c4e2a9d1-8f3b-4c6e-a2d7-5b9f1e3c7a40", now, "dev")).toEqual({
      id: "c4e2a9d1-8f3b-4c6e-a2d7-5b9f1e3c7a40",
      reservationId: reservation.id,
      ts: now,
      startedAt: reservation.createdAt,
      stack: "dev",
      requestId: reservation.requestId,
      traceId: reservation.traceId,
      purpose: "hello",
      routeDecision: "fallback",
      routeReason: "local_failed",
      attribution: "fallback",
      adapterId: "synthetic",
      provider: "synthetic",
      requestModel: "metered-test",
      responseModel: null,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      latencyMs: 0,
      finishReason: null,
      outcome: "unknown",
      errorKind: null,
      costMicro: 100_000n,
      costBasis: "expired",
      priceVersion: "2026-10-08.1",
      routingSha: "ab".repeat(32),
      periodDay: "2026-10-28",
      periodMonth: "2026-10",
      clientLabel: null,
    });
  });

  it("derives the route decision from the attribution, and keeps a route reason for fallback only", () => {
    expect(routeDecisionOf("fallback")).toBe("fallback");
    expect(routeDecisionOf("metered")).toBe("metered");
    expect(routeDecisionOf("test")).toBe("metered");
    const metered = expiredLedgerRow(
      { ...reservation, attribution: "metered", routeReason: "local_failed" },
      "x",
      0,
      "dev",
    );
    expect(metered).toMatchObject({ routeDecision: "metered", routeReason: null });
  });
});

describe("the in-memory metered limits (data-model.md §7.2; gateway-http.md §2.5.3)", () => {
  const limits = { perClientInFlight: 1, globalInFlight: 4, perMinute: 60 };

  it("checks the client, then the global in-flight count, then the minute, each taking its slot at once", () => {
    let now = 1_000_000;
    const slots = new MeteredSlots(limits, () => now);
    const a = slots.take("client-a");
    expect(a.ok).toBe(true);
    expect(slots.take("client-a")).toEqual({
      ok: false,
      refusal: "limit",
      error: "client_cap_exceeded",
      limit: "metered_in_flight",
      retryAfterS: 1,
    });
    for (const c of ["b", "c", "d"]) expect(slots.take(c).ok).toBe(true);
    expect(slots.take(undefined)).toMatchObject({ error: "metered_capacity_exceeded", limit: "global_in_flight" });
    expect(slots.counters()).toEqual({ inFlight: 4, lastMinute: 4 });
    if (a.ok) slots.release(a.slot);
    expect(slots.take("client-a").ok).toBe(true);
    now += 1;
  });

  it("refuses a 61st admission in 60 s, until the oldest leaves the window", () => {
    let now = 5_000_000;
    const slots = new MeteredSlots(limits, () => now);
    for (let i = 0; i < 60; i++) {
      const s = slots.take(undefined);
      if (!s.ok) throw new Error(`refused at ${i}`);
      slots.release(s.slot); // settled: no longer in flight, still in the minute
      now += 500; // 60 admissions over 30 s
    }
    expect(slots.take(undefined)).toEqual({
      ok: false,
      refusal: "limit",
      error: "metered_capacity_exceeded",
      limit: "global_per_minute",
      retryAfterS: 30, // the first was at 5,000,000; it leaves at 5,060,000, 30 s from now
    });
    now = 5_000_000 + 60_000; // the first admission is 60 s old: out of the window
    expect(slots.take(undefined).ok).toBe(true);
  });

  it("gives a refused or compensated admission's minute back, but keeps a completed one's", () => {
    const now = 9_000_000;
    const slots = new MeteredSlots({ ...limits, perMinute: 2 }, () => now);
    const first = slots.take(undefined);
    const second = slots.take(undefined);
    if (!first.ok || !second.ok) throw new Error("refused");
    slots.refund(first.slot);
    slots.release(second.slot);
    expect(slots.counters()).toEqual({ inFlight: 0, lastMinute: 1 });
    // Releasing twice gives back nothing more.
    slots.release(second.slot);
    slots.refund(first.slot);
    expect(slots.counters()).toEqual({ inFlight: 0, lastMinute: 1 });
  });
});
