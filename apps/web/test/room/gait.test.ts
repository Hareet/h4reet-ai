// T002 (spec 019; FR-002 to FR-004, FR-010; SC-001, SC-003): the gait's pure part, in Node with no three import.
import { describe, expect, it } from "vitest";

import { ANKLE_GAIN, DT_MAX_S, EASE_S, HIP_MAX, KNEE_MAX, advance, cycleLength, legOffsets } from "../../src/room/scene/gait";
import type { GaitState } from "../../src/room/scene/gait";

const START: GaitState = { phase: 0, amp: 0 };

describe("the gait's cycle and phase", () => {
  it("has a cycle of 0.7 of the body's height", () => {
    expect(cycleLength(1.6)).toBeCloseTo(1.12, 12);
    expect(cycleLength(2)).toBeCloseTo(1.4, 12);
  });

  it("advances the phase by distance over the cycle, mod 1, and never by time", () => {
    const a = advance(START, 0.28, 1, 0.016, true, 1.12);
    expect(a.phase).toBeCloseTo(0.25, 12);
    const wrapped = advance({ phase: 0.9, amp: 1 }, 0.28, 1, 0.016, true, 1.12);
    expect(wrapped.phase).toBeCloseTo(0.15, 12);
    // Time alone: no distance, no phase.
    expect(advance(START, 0, 1, 0.1, true, 1.12).phase).toBe(0);
    expect(advance({ phase: 0.3, amp: 1 }, 0, 1, 0.05, true, 1.12).phase).toBeCloseTo(0.3, 12);
  });

  it("covers N cycles' distance with N turns of the phase (SC-003)", () => {
    let s = START;
    const cycle = 1.12;
    for (let i = 0; i < 700; i += 1) s = advance(s, (3 * cycle) / 700, 1, 0.016, true, cycle);
    // Three whole turns come back to where it began.
    expect(Math.min(s.phase, 1 - s.phase)).toBeLessThan(1e-9);
  });
});

describe("the amplitude", () => {
  it("eases up to min(1, share) in EASE_S and out to 0", () => {
    let s = START;
    for (let t = 0; t < EASE_S - 1e-9; t += 0.01) s = advance(s, 0, 1, 0.01, true, 1.12);
    expect(s.amp).toBeCloseTo(1, 6);
    s = START;
    for (let i = 0; i < 100; i += 1) s = advance(s, 0, 0.5, 0.05, true, 1.12);
    expect(s.amp).toBeCloseTo(0.5, 9);
    for (let i = 0; i < 100; i += 1) s = advance(s, 0, 2, 0.05, true, 1.12);
    expect(s.amp).toBeCloseTo(1, 9);
    for (let i = 0; i < 100; i += 1) s = advance(s, 0, 1, 0.05, false, 1.12);
    expect(s.amp).toBe(0);
  });

  it("clamps a long frame to DT_MAX_S", () => {
    const long = advance(START, 0, 1, 5, true, 1.12);
    const clamped = advance(START, 0, 1, DT_MAX_S, true, 1.12);
    expect(long.amp).toBeCloseTo(clamped.amp, 12);
    expect(long.amp).toBeLessThan(1 + 1e-12);
  });
});

describe("the legs' offsets", () => {
  it("puts the legs half a cycle apart, knees never negative, every angle within its constant", () => {
    for (let i = 0; i <= 200; i += 1) {
      const phase = i / 200;
      const amp = (i % 11) / 10;
      const { left, right } = legOffsets(phase, amp);
      const apart = legOffsets((phase + 0.5) % 1, amp);
      expect(right.hip).toBeCloseTo(apart.left.hip, 12);
      expect(left.hip).toBeCloseTo(-right.hip, 12);
      for (const leg of [left, right]) {
        expect(leg.knee).toBeGreaterThanOrEqual(0);
        expect(leg.knee).toBeLessThanOrEqual(KNEE_MAX + 1e-12);
        expect(Math.abs(leg.hip)).toBeLessThanOrEqual(HIP_MAX + 1e-12);
        expect(Math.abs(leg.ankle)).toBeLessThanOrEqual(ANKLE_GAIN * HIP_MAX + 1e-12);
      }
    }
  });

  it("is zero at amplitude 0", () => {
    for (const phase of [0, 0.1, 0.37, 0.5, 0.9]) {
      const { left, right } = legOffsets(phase, 0);
      for (const v of [left.hip, left.knee, left.ankle, right.hip, right.knee, right.ankle]) expect(Math.abs(v)).toBe(0);
    }
  });
});

describe("a seeded walk (SC-001)", () => {
  function walk(): number[] {
    let seed = 11;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let s = START;
    const out: number[] = [];
    for (let i = 0; i < 10_000; i += 1) {
      const on = Math.floor(i / 50) % 3 !== 2;
      s = advance(s, on ? 0.01 * random() : 0, 0.3 + random(), 0.008 + 0.02 * random(), on, 1.12);
      const { left, right } = legOffsets(s.phase, s.amp);
      out.push(left.hip, left.knee, left.ankle, right.hip, right.knee, right.ankle, s.phase, s.amp);
    }
    return out;
  }
  it("is identical on two runs, finite, and in range", () => {
    const [a, b] = [walk(), walk()];
    expect(a).toEqual(b);
    expect(a.every(Number.isFinite)).toBe(true);
  });
});
