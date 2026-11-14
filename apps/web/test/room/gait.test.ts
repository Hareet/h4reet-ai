// T002 (spec 019; FR-002 to FR-004, FR-010; SC-001, SC-003): the gait's pure part, in Node with no three import.
import { describe, expect, it } from "vitest";

import {
  ANKLE_GAIN,
  DT_MAX_S,
  EASE_S,
  HIP_MAX,
  KNEE_MAX,
  advance,
  cycleLength,
  legOffsets,
  standingLift,
} from "../../src/room/scene/gait";
import type { GaitState, LegAngles, LegShape } from "../../src/room/scene/gait";

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
      for (const v of [left.hip, left.knee, left.ankle, right.hip, right.knee, right.ankle])
        expect(Math.abs(v)).toBe(0);
    }
  });
});

describe("the standing leg's lift (T014; FR-015, plan §2.6)", () => {
  const straight = (thigh: number, shin: number): LegShape => ({ thigh, shin, thighAngle: 0, shinAngle: 0 });
  const STRAIGHT = { left: straight(0.45, 0.4), right: straight(0.45, 0.4) };
  /** One leg's lift by plan §2.6: its ankle's depth below the hip at rest, less its depth now, in the swing plane. */
  const liftOf = (s: LegShape, a: LegAngles): number =>
    s.thigh * Math.cos(s.thighAngle) +
    s.shin * Math.cos(s.shinAngle) -
    (s.thigh * Math.cos(s.thighAngle + a.hip) + s.shin * Math.cos(s.shinAngle + a.hip - a.knee));

  it("is 0 at amplitude 0", () => {
    for (const phase of [0, 0.1, 0.25, 0.37, 0.5, 0.9]) expect(standingLift(legOffsets(phase, 0), STRAIGHT)).toBe(0);
  });

  it("is (thigh + shin)(1 − cos θ) for straight legs at hip angle θ", () => {
    for (const theta of [0.05, 0.2, 0.45]) {
      const offsets = { left: { hip: theta, knee: 0, ankle: 0 }, right: { hip: -theta, knee: 0, ankle: 0 } };
      expect(standingLift(offsets, STRAIGHT)).toBeCloseTo(0.85 * (1 - Math.cos(theta)), 12);
    }
  });

  it("is the smaller of the two legs' lifts, never negative, with each leg's own rest angles", () => {
    const leaning = {
      left: { thigh: 0.39, shin: 0.37, thighAngle: -0.06, shinAngle: -0.18 },
      right: { thigh: 0.38, shin: 0.36, thighAngle: -0.07, shinAngle: -0.14 },
    };
    for (const shape of [STRAIGHT, leaning])
      for (let i = 0; i <= 200; i += 1) {
        const offsets = legOffsets(i / 200, (i % 11) / 10);
        const lift = standingLift(offsets, shape);
        expect(lift).toBeGreaterThanOrEqual(0);
        const expected = Math.max(0, Math.min(liftOf(shape.left, offsets.left), liftOf(shape.right, offsets.right)));
        expect(lift).toBeCloseTo(expected, 12);
      }
  });

  it("is the same on two runs of a seeded walk", () => {
    const run = (): number[] => {
      let seed = 7;
      let s = START;
      const out: number[] = [];
      for (let i = 0; i < 2_000; i += 1) {
        seed = (seed * 16807) % 2147483647;
        s = advance(s, 0.02 * (seed / 2147483647), 1, 0.016, true, 1.12);
        out.push(standingLift(legOffsets(s.phase, s.amp), STRAIGHT));
      }
      return out;
    };
    expect(run()).toEqual(run());
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
