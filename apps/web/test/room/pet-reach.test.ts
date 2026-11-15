// T001 (spec 026; FR-007, FR-008; plan.md R-03): the reach's pure math, on numbers alone: the spine's lean, the
// two-bone solve, the stroke's target, and the layer's weight. No three.js object is made here, as the module's math
// imports none.
import { describe, expect, it } from "vitest";

import {
  PET_REACH_DEFAULTS,
  reachAt,
  solveLean,
  solvePosture,
  solveTwoBone,
  strokeShare,
  strokeTarget,
  weightAt,
} from "../../src/room/scene/pet-reach";
import type { PostureChain, PostureOut, TwoBoneOut, Vec3 } from "../../src/room/scene/pet-reach";

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const DEG = Math.PI / 180;

/** The shoulder turned about the hips by `lean`, toward the target's side, as solveLean leans it. */
function leaned(shoulder: Vec3, hips: Vec3, target: Vec3, lean: number): Vec3 {
  // The axis is up × (the target's direction on the floor from the hips): a positive turn tips the shoulder toward it.
  const dx = target.x - hips.x;
  const dz = target.z - hips.z;
  const n = Math.hypot(dx, dz);
  const k = v(dz / n, 0, -dx / n);
  const r = sub(shoulder, hips);
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  const kxr = v(k.y * r.z - k.z * r.y, k.z * r.x - k.x * r.z, k.x * r.y - k.y * r.x);
  const kr = dot(k, r);
  return v(
    hips.x + r.x * c + kxr.x * s + k.x * kr * (1 - c),
    hips.y + r.y * c + kxr.y * s + k.y * kr * (1 - c),
    hips.z + r.z * c + kxr.z * s + k.z * kr * (1 - c),
  );
}

const fresh = (): TwoBoneOut => ({ elbow: v(0, 0, 0), hand: v(0, 0, 0), elbowRad: 0, reached: false });

describe("solveLean (R-03)", () => {
  const hips = v(0, 1.0, 0);
  const shoulder = v(0.2, 1.45, 0);

  it("gives no lean when the target is already in reach", () => {
    expect(solveLean(shoulder, hips, v(0.2, 1.0, 0.4), 0.7, 60 * DEG)).toBe(0);
  });

  it("gives the least lean that brings the target within reach", () => {
    const target = v(0.2, 0.55, 0.5);
    const reach = 0.6;
    const lean = solveLean(shoulder, hips, target, reach, 75 * DEG);
    expect(lean).toBeGreaterThan(0);
    expect(dist(leaned(shoulder, hips, target, lean), target)).toBeCloseTo(reach, 6);
    // A degree less leaves it out of reach: it is the least.
    expect(dist(leaned(shoulder, hips, target, lean - DEG), target)).toBeGreaterThan(reach);
  });

  it("is capped at the lean's limit when even that leaves the target short", () => {
    const target = v(0.2, 0.1, 0.6);
    const max = 30 * DEG;
    expect(solveLean(shoulder, hips, target, 0.6, max)).toBeCloseTo(max, 12);
  });

  it("gives no lean for a target straight above or below the hips (no direction to lean in)", () => {
    expect(solveLean(shoulder, hips, v(0, 0.2, 0), 0.3, 60 * DEG)).toBe(0);
  });

  it("is deterministic", () => {
    const target = v(-0.3, 0.5, 0.45);
    const a = solveLean(shoulder, hips, target, 0.55, 60 * DEG);
    const b = solveLean(shoulder, hips, target, 0.55, 60 * DEG);
    expect(a).toBe(b);
  });
});

describe("solveTwoBone (R-03; FR-008)", () => {
  const shoulder = v(0, 1.4, 0);
  const a = 0.28;
  const b = 0.27;
  const elbowMax = 150 * DEG;
  const pole = v(0.3, 1.0, 0.1);

  it("reaches a target in range to 1e-6, its bones' lengths kept", () => {
    const target = v(0.1, 1.05, 0.35);
    const out = solveTwoBone(shoulder, target, pole, a, b, elbowMax, fresh());
    expect(out.reached).toBe(true);
    expect(dist(out.hand, target)).toBeLessThan(1e-6);
    expect(dist(out.elbow, shoulder)).toBeCloseTo(a, 9);
    expect(dist(out.hand, out.elbow)).toBeCloseTo(b, 9);
    expect(out.elbowRad).toBeGreaterThan(0);
    expect(out.elbowRad).toBeLessThanOrEqual(elbowMax);
  });

  it("puts the elbow on the pole's side of the shoulder-to-target line", () => {
    const target = v(0, 1.0, 0.3);
    for (const p of [v(0.4, 1.2, 0.15), v(-0.4, 1.2, 0.15)]) {
      const out = solveTwoBone(shoulder, target, p, a, b, elbowMax, fresh());
      const axis = sub(target, shoulder);
      const n = len(axis);
      const perp = (q: Vec3): Vec3 => {
        const r = sub(q, shoulder);
        const t = dot(r, axis) / (n * n);
        return v(r.x - axis.x * t, r.y - axis.y * t, r.z - axis.z * t);
      };
      expect(dot(perp(out.elbow), perp(p))).toBeGreaterThan(0);
    }
  });

  it("gives the straight arm toward a target beyond reach", () => {
    const target = v(0, 0.4, 0.9);
    const out = solveTwoBone(shoulder, target, pole, a, b, elbowMax, fresh());
    expect(out.reached).toBe(false);
    expect(out.elbowRad).toBeCloseTo(0, 9);
    expect(dist(out.hand, shoulder)).toBeCloseTo(a + b, 9);
    // On the line toward the target: the hand is the nearest point of the arm's reach.
    const dir = sub(target, shoulder);
    const toHand = sub(out.hand, shoulder);
    expect(dot(dir, toHand) / (len(dir) * len(toHand))).toBeCloseTo(1, 9);
  });

  it("clamps the elbow at its limit for a target nearer than the bent arm allows", () => {
    const target = v(0, 1.36, 0.02);
    const out = solveTwoBone(shoulder, target, pole, a, b, elbowMax, fresh());
    expect(out.reached).toBe(false);
    expect(out.elbowRad).toBeCloseTo(elbowMax, 9);
    expect(dist(out.elbow, shoulder)).toBeCloseTo(a, 9);
    expect(dist(out.hand, out.elbow)).toBeCloseTo(b, 9);
  });

  it("writes into the `out` it is given and returns it", () => {
    const out = fresh();
    expect(solveTwoBone(shoulder, v(0.1, 1.1, 0.3), pole, a, b, elbowMax, out)).toBe(out);
  });

  it("is deterministic", () => {
    const t = v(0.05, 1.1, 0.33);
    const one = solveTwoBone(shoulder, t, pole, a, b, elbowMax, fresh());
    const two = solveTwoBone(shoulder, t, pole, a, b, elbowMax, fresh());
    expect(one).toEqual(two);
  });
});

describe("strokeTarget (R-03; FR-007)", () => {
  const cfg = { stroke_m: 0.05, stroke_n: 3 };
  const head = v(0.3, 0.53, 0.45);

  it("moves the target along the dog's heading by ±stroke_m, stroke_n strokes", () => {
    const heading = 0.7; // faces (−sin h, −cos h)
    const fwd = v(-Math.sin(heading), 0, -Math.cos(heading));
    const along = (u: number): number => dot(sub(strokeTarget(head, heading, u, cfg, v(0, 0, 0)), head), fwd);
    expect(along(0)).toBeCloseTo(0, 12);
    expect(along(1 / (4 * cfg.stroke_n))).toBeCloseTo(cfg.stroke_m, 12);
    expect(along(3 / (4 * cfg.stroke_n))).toBeCloseTo(-cfg.stroke_m, 12);
    expect(along(1)).toBeCloseTo(0, 9);
    // Only along the heading: no rise and nothing across.
    const at = strokeTarget(head, heading, 0.1, cfg, v(0, 0, 0));
    expect(at.y).toBe(head.y);
    const across = v(Math.cos(heading), 0, -Math.sin(heading));
    expect(dot(sub(at, head), across)).toBeCloseTo(0, 12);
    // stroke_n strokes: as many maxima over u in [0, 1].
    let peaks = 0;
    for (let i = 1; i < 1000; i += 1) {
      const [p, c, n] = [along((i - 1) / 1000), along(i / 1000), along((i + 1) / 1000)];
      if (c > p && c >= n) peaks += 1;
    }
    expect(peaks).toBe(cfg.stroke_n);
  });

  it("clamps the share to [0, 1]", () => {
    expect(strokeTarget(head, 0, -1, cfg, v(0, 0, 0))).toEqual(strokeTarget(head, 0, 0, cfg, v(0, 0, 0)));
    expect(strokeTarget(head, 0, 2, cfg, v(0, 0, 0))).toEqual(strokeTarget(head, 0, 1, cfg, v(0, 0, 0)));
  });
});

describe("weightAt and strokeShare (R-03; FR-007)", () => {
  const cfg = { pet_s: 3.5 };

  it("rises 0 → 1 over 0.5 s, holds, and falls 1 → 0 over the last 0.5 s, by a smoothstep", () => {
    expect(weightAt(-0.1, cfg)).toBe(0);
    expect(weightAt(0, cfg)).toBe(0);
    expect(weightAt(0.25, cfg)).toBeCloseTo(0.5, 12);
    expect(weightAt(0.125, cfg)).toBeCloseTo(0.15625, 12); // 3u² − 2u³ at u = 0.25
    expect(weightAt(0.5, cfg)).toBe(1);
    expect(weightAt(1.75, cfg)).toBe(1);
    expect(weightAt(3.0, cfg)).toBe(1);
    expect(weightAt(3.25, cfg)).toBeCloseTo(0.5, 12);
    expect(weightAt(3.5, cfg)).toBe(0);
    expect(weightAt(9, cfg)).toBe(0);
  });

  it("never exceeds 1 or goes below 0, and is deterministic", () => {
    for (let t = -1; t < 5; t += 0.013) {
      const w = weightAt(t, cfg);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
      expect(weightAt(t, cfg)).toBe(w);
    }
  });

  it("a petting shorter than both eases peaks below 1 and stays continuous", () => {
    const short = { pet_s: 0.6 };
    expect(weightAt(0.3, short)).toBeLessThan(1);
    expect(Math.abs(weightAt(0.3, short) - weightAt(0.3001, short))).toBeLessThan(1e-3);
  });

  it("strokeShare runs 0 → 1 between the reach-in's end and the withdraw's start", () => {
    expect(strokeShare(0.2, cfg)).toBe(0);
    expect(strokeShare(0.5, cfg)).toBe(0);
    expect(strokeShare(1.75, cfg)).toBeCloseTo(0.5, 12);
    expect(strokeShare(3.0, cfg)).toBe(1);
    expect(strokeShare(3.4, cfg)).toBe(1);
  });
});

// rework3-026 (the page's Q284; FR-027): the director's per-frame call takes objects only, so no fraction crosses a call
// V8 may not inline. It must give the same numbers as weightAt, strokeShare, and strokeTarget, to the bit.
describe("reachAt (FR-007, FR-027)", () => {
  it("writes weightAt's weight and strokeTarget's target at strokeShare's share, to the bit", () => {
    const head = v(0.31, 0.52, 0.66);
    for (const pet_s of [3.5, 0.6, 0.1, 10_000]) {
      for (const dogHeading of [0, Math.PI, -2.1]) {
        const at = { t: 0, pet_s, dogHeading };
        const out = { weight: Number.NaN, target: v(0, 0, 0) };
        // The sweep, and the ease's edges exactly (0, 0.5, pet_s − 0.5, pet_s) and NaN (rv-rework3-026's N-3).
        const ts: number[] = [0, 0.5, pet_s - 0.5, pet_s, Number.NaN];
        for (let t = -0.2; t < pet_s + 0.3; t += pet_s / 97) ts.push(t);
        for (const t of ts) {
          at.t = t;
          reachAt(at, head, PET_REACH_DEFAULTS, out);
          const want = strokeTarget(head, dogHeading, strokeShare(t, at), PET_REACH_DEFAULTS, v(0, 0, 0));
          expect(out.weight, `weight at ${t} of ${pet_s}`).toBe(weightAt(t, at));
          expect(out.target, `target at ${t} of ${pet_s}`).toEqual(want);
        }
      }
    }
  });
});

describe("the reach's defaults (spec FR-007, FR-008; plan §3)", () => {
  it("are the plan's placeholders, the lean within 75°", () => {
    expect(PET_REACH_DEFAULTS.stroke_m).toBe(0.05);
    expect(PET_REACH_DEFAULTS.stroke_n).toBe(3);
    expect(PET_REACH_DEFAULTS.pet_s).toBe(3.5);
    expect(PET_REACH_DEFAULTS.elbow_deg).toBe(150);
    expect(PET_REACH_DEFAULTS.lean_max_deg).toBeGreaterThan(0);
    expect(PET_REACH_DEFAULTS.lean_max_deg).toBeLessThanOrEqual(75);
  });
});

// T003 (impl2-026; Q212, taken provisionally; plan R-03 amended): the posture, the crouch and the spine's lean bent
// together by one share of their limits, on numbers alone.
describe("solvePosture (R-03, amended: Q212)", () => {
  /** A figure 1.8 m tall facing +z at the origin: hips, the three spine joints, and the right shoulder. */
  const CHAIN: PostureChain = {
    hips: v(0, 0.95, 0),
    spine: [v(0, 1.05, 0), v(0, 1.17, 0), v(0, 1.3, 0)],
    shoulder: v(-0.17, 1.42, 0),
  };
  const REACH = 0.6;
  const LIMITS = { crouch_max_m: 0.35, lean_max_rad: 66 * DEG };
  const out = (): PostureOut => ({ share: 0, crouch: 0, lean: 0, axis: v(0, 0, 0) });
  /** The shoulder after a crouch `c` and a lean `t` over the spine about the unit `k`: each spine bone turned by a
   *  third, the measure's chain (pet-reach-measure.test.ts). */
  function shoulderAt(c: number, t: number, k: Vec3): Vec3 {
    const turn = (r: Vec3, a: number): Vec3 => {
      const [co, si] = [Math.cos(a), Math.sin(a)];
      const kxr = v(k.y * r.z - k.z * r.y, k.z * r.x - k.x * r.z, k.x * r.y - k.y * r.x);
      const kr = dot(k, r);
      return v(
        r.x * co + kxr.x * si + k.x * kr * (1 - co),
        r.y * co + kxr.y * si + k.y * kr * (1 - co),
        r.z * co + kxr.z * si + k.z * kr * (1 - co),
      );
    };
    const [p0, p1, p2] = CHAIN.spine;
    const a = turn(sub(p1, p0), t / 3);
    const b = turn(sub(p2, p1), (2 * t) / 3);
    const s = turn(sub(CHAIN.shoulder, p2), t);
    return v(p0.x + a.x + b.x + s.x, p0.y + a.y + b.y + s.y - c, p0.z + a.z + b.z + s.z);
  }

  it("bends nothing when the target is already in reach", () => {
    const o = solvePosture(CHAIN, v(-0.3, 1.1, 0.3), REACH, LIMITS, out());
    expect(o.share).toBe(0);
    expect(o.crouch).toBe(0);
    expect(o.lean).toBe(0);
  });

  it("gives the least share of both limits that brings a low target within reach", () => {
    const target = v(-0.3, 0.5, 0.45);
    const o = solvePosture(CHAIN, target, REACH, LIMITS, out());
    expect(o.share).toBeGreaterThan(0);
    expect(o.share).toBeLessThan(1);
    expect(o.crouch).toBeCloseTo(o.share * LIMITS.crouch_max_m, 12);
    expect(o.lean).toBeCloseTo(o.share * LIMITS.lean_max_rad, 12);
    // In reach at the share; out of it a little below.
    expect(dist(target, shoulderAt(o.crouch, o.lean, o.axis))).toBeLessThanOrEqual(REACH + 1e-4);
    const less = o.share - 0.01;
    expect(dist(target, shoulderAt(less * LIMITS.crouch_max_m, less * LIMITS.lean_max_rad, o.axis))).toBeGreaterThan(
      REACH,
    );
  });

  it("leans toward the target: the axis is up × its direction on the floor from the hips, a unit vector", () => {
    const target = v(-0.3, 0.5, 0.45);
    const o = solvePosture(CHAIN, target, REACH, LIMITS, out());
    const n = Math.hypot(target.x - CHAIN.hips.x, target.z - CHAIN.hips.z);
    expect(o.axis.x).toBeCloseTo((target.z - CHAIN.hips.z) / n, 12);
    expect(o.axis.y).toBe(0);
    expect(o.axis.z).toBeCloseTo(-(target.x - CHAIN.hips.x) / n, 12);
  });

  it("stays within both limits for a target out of every reach, at the share that comes nearest", () => {
    const target = v(-0.2, 0.0, 1.6);
    const o = solvePosture(CHAIN, target, REACH, LIMITS, out());
    expect(o.share).toBeGreaterThan(0);
    expect(o.share).toBeLessThanOrEqual(1);
    expect(o.crouch).toBeLessThanOrEqual(LIMITS.crouch_max_m);
    expect(o.lean).toBeLessThanOrEqual(LIMITS.lean_max_rad);
    const at = dist(target, shoulderAt(o.crouch, o.lean, o.axis));
    for (let s = 0; s <= 1; s += 0.05)
      expect(at).toBeLessThanOrEqual(
        dist(target, shoulderAt(s * LIMITS.crouch_max_m, s * LIMITS.lean_max_rad, o.axis)) + 1e-3,
      );
  });

  it("bends nothing with both limits at 0, and nothing for a target straight above or below the hips", () => {
    const zero = solvePosture(CHAIN, v(-0.3, 0.5, 0.45), REACH, { crouch_max_m: 0, lean_max_rad: 0 }, out());
    expect([zero.share, zero.crouch, zero.lean]).toEqual([0, 0, 0]);
    const below = solvePosture(
      CHAIN,
      v(0, -1, 0),
      REACH,
      { crouch_max_m: 0, lean_max_rad: LIMITS.lean_max_rad },
      out(),
    );
    expect(below.lean).toBe(0);
  });

  it("writes into the `out` it is given, returns it, and is deterministic", () => {
    const o = out();
    expect(solvePosture(CHAIN, v(-0.3, 0.5, 0.45), REACH, LIMITS, o)).toBe(o);
    const again = solvePosture(CHAIN, v(-0.3, 0.5, 0.45), REACH, LIMITS, out());
    expect(again).toEqual(o);
  });
});

describe("the reach's crouch default (Q212; plan §3)", () => {
  it("is T003's measure: 0.35 m, with the lean at 66°", () => {
    expect(PET_REACH_DEFAULTS.crouch_max_m).toBe(0.35);
    expect(PET_REACH_DEFAULTS.lean_max_deg).toBe(66);
  });
});
