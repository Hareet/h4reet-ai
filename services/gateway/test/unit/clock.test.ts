// The gateway clock (data-model.md, Conventions): real UTC time plus stack_state.test_clock_offset_ms. Period
// keys come from it, in UTC; timeouts, retries, rate limits, and health intervals use the real clock.
import { describe, expect, it, vi } from "vitest";

import {
  GatewayClock,
  dayKey,
  gatewayTime,
  monthKey,
  nextUtcDayStart,
  periodKeys,
  toRfc3339,
} from "../../src/core/clock.js";

const at = (iso: string): number => Date.parse(iso);

describe("period keys", () => {
  it("formats a UTC day as YYYY-MM-DD and a month as YYYY-MM", () => {
    expect(dayKey(at("2026-10-08T16:31:40.019Z"))).toBe("2026-10-08");
    expect(monthKey(at("2026-10-08T16:31:40.019Z"))).toBe("2026-10");
    expect(periodKeys(at("2026-03-05T00:00:00Z"))).toEqual({ day: "2026-03-05", month: "2026-03" });
  });

  it("rolls over at 00:00:00.000 UTC, not a millisecond earlier", () => {
    expect(dayKey(at("2026-10-08T23:59:59.999Z"))).toBe("2026-10-08");
    expect(dayKey(at("2026-10-09T00:00:00.000Z"))).toBe("2026-10-09");
    expect(monthKey(at("2026-10-31T23:59:59.999Z"))).toBe("2026-10");
    expect(monthKey(at("2026-11-01T00:00:00.000Z"))).toBe("2026-11");
  });

  it("crosses the year, and a leap day", () => {
    expect(periodKeys(at("2026-12-31T23:59:59.999Z"))).toEqual({ day: "2026-12-31", month: "2026-12" });
    expect(periodKeys(at("2027-01-01T00:00:00.000Z"))).toEqual({ day: "2027-01-01", month: "2027-01" });
    expect(dayKey(at("2028-02-29T12:00:00Z"))).toBe("2028-02-29");
    expect(dayKey(at("2028-03-01T00:00:00Z"))).toBe("2028-03-01");
  });

  it("is UTC whatever the process's time zone says", () => {
    // A local-time formatter would put noon UTC on the 9th in UTC+14, and 06:00 UTC on the 7th in UTC-12.
    // vi.stubEnv sets TZ, which Node applies at once; vitest restores it after the test (unstubEnvs).
    const noon = at("2026-10-08T12:00:00Z");
    const morning = at("2026-10-08T06:00:00Z");
    const zones = [
      ["Pacific/Kiritimati", 2],
      ["Etc/GMT+12", 0],
      ["Asia/Kolkata", 17],
      ["UTC", 12],
    ] as const;
    for (const [tz, localHourAtNoon] of zones) {
      vi.stubEnv("TZ", tz);
      expect(new Date(noon).getHours(), `${tz} is in effect`).toBe(localHourAtNoon);
      for (const instant of [noon, morning]) {
        expect(dayKey(instant), tz).toBe("2026-10-08");
        expect(monthKey(instant), tz).toBe("2026-10");
      }
    }
  });

  it("pads single digits and four-digit years", () => {
    expect(dayKey(at("0999-01-02T00:00:00Z"))).toBe("0999-01-02");
    expect(monthKey(at("2026-01-15T00:00:00Z"))).toBe("2026-01");
  });

  it("refuses an instant that isn't a finite time", () => {
    expect(() => dayKey(Number.NaN)).toThrow(RangeError);
    expect(() => monthKey(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("the gateway time", () => {
  it("is the real time plus the offset, and the real time without one", () => {
    expect(gatewayTime(1_000, null)).toBe(1_000);
    expect(gatewayTime(1_000, 0)).toBe(1_000);
    expect(gatewayTime(1_000, 86_400_000)).toBe(86_401_000);
  });

  it("refuses a negative or fractional offset: dev's clock only moves forward, in whole milliseconds", () => {
    expect(() => gatewayTime(1_000, -1)).toThrow(RangeError);
    expect(() => gatewayTime(1_000, 1.5)).toThrow(RangeError);
  });

  it("formats RFC 3339 with milliseconds and Z", () => {
    expect(toRfc3339(at("2026-10-28T10:15:02.114Z"))).toBe("2026-10-28T10:15:02.114Z");
    expect(toRfc3339(at("2026-10-28T10:15:02Z"))).toBe("2026-10-28T10:15:02.000Z");
  });

  it("names the start of the next UTC day, for a per-day limit's retry_after_s", () => {
    expect(nextUtcDayStart(at("2026-10-08T16:31:40.019Z"))).toBe(at("2026-10-09T00:00:00Z"));
    expect(nextUtcDayStart(at("2026-10-08T00:00:00Z"))).toBe(at("2026-10-09T00:00:00Z"));
    expect(nextUtcDayStart(at("2026-12-31T23:59:59.999Z"))).toBe(at("2027-01-01T00:00:00Z"));
  });
});

describe("GatewayClock", () => {
  it("adds the store's offset to now() and never to realNow()", () => {
    let real = at("2026-10-08T16:31:40.019Z");
    const clock = new GatewayClock(() => real);
    expect(clock.offsetMs()).toBeNull();
    expect(clock.now()).toBe(real);

    // The breach test moves dev's clock to the 20th of the next month (plan §8, step 1).
    const offset = at("2026-11-20T08:00:00Z") - real;
    clock.setOffsetMs(offset);
    expect(clock.offsetMs()).toBe(offset);
    expect(clock.now()).toBe(at("2026-11-20T08:00:00Z"));
    expect(clock.periodKeys()).toEqual({ day: "2026-11-20", month: "2026-11" });

    // Timeouts, retries, rate limits, and health intervals read the real clock: a jump never shortens them.
    expect(clock.realNow()).toBe(at("2026-10-08T16:31:40.019Z"));
    real += 1_500;
    expect(clock.realNow() - at("2026-10-08T16:31:40.019Z")).toBe(1_500);
    expect(clock.now()).toBe(at("2026-11-20T08:00:01.500Z"));
  });

  it("takes the offset as the store has it: null outside dev, and back to null when the store says so", () => {
    const clock = new GatewayClock(() => 5_000);
    clock.setOffsetMs(1_000);
    clock.setOffsetMs(null);
    expect(clock.offsetMs()).toBeNull();
    expect(clock.now()).toBe(5_000);
  });

  it("refuses a negative or fractional offset", () => {
    const clock = new GatewayClock(() => 5_000);
    expect(() => clock.setOffsetMs(-5)).toThrow(RangeError);
    expect(() => clock.setOffsetMs(0.25)).toThrow(RangeError);
    expect(clock.offsetMs()).toBeNull();
  });

  it("reads the real clock from Date.now by default", () => {
    const clock = new GatewayClock();
    const before = Date.now();
    const now = clock.realNow();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
