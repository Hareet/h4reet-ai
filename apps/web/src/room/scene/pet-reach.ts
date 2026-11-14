// The twin's reach toward the room's dog (spec 026; FR-007, FR-008; plan.md R-03, R-04): the stand-in for the studio's
// `petting` clip. The math here is pure (the spine's lean, the two-bone solve, the stroke's target, the layer's weight),
// over plain numbers, with no three.js object; the bones' part follows it.

/** A point or a direction, written in place where a function takes an `out`. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The reach's tunables (spec FR-007, FR-008; plan §3): scene data in `figures.pet`, these its defaults. Placeholders,
 *  the Author's to set at lookdev. `lean_max_deg` is measured by T003 (Q162) and recorded in plan §3. */
export const PET_REACH_DEFAULTS = Object.freeze({
  lean_max_deg: 35,
  stroke_m: 0.05,
  stroke_n: 3,
  pet_s: 3.5,
  elbow_deg: 150,
});

/** The reach-in's and the withdraw's length, in seconds (FR-007). */
export const EASE_IN_OUT_S = 0.5;

/**
 * The least lean, in radians, about the hips' side axis toward the target, that brings the target within `reach` of
 * the shoulder (R-03). The axis is up × the target's direction on the floor from the hips, so a positive lean tips the
 * shoulder toward it. 0 when the target is in reach already, or straight above or below the hips; where no lean up to
 * `maxRad` brings it in, the lean within [0, maxRad] that brings the shoulder nearest. Closed form: the shoulder turned
 * by θ about k through the hips is r cos θ + (k × r) sin θ + k (k·r)(1 − cos θ), so its dot with w = T − H is
 * (A − C) cos θ + B sin θ + C, and the distance falls as that dot rises.
 */
export function solveLean(shoulder: Vec3, hips: Vec3, target: Vec3, reach: number, maxRad: number): number {
  const rx = shoulder.x - hips.x;
  const ry = shoulder.y - hips.y;
  const rz = shoulder.z - hips.z;
  const wx = target.x - hips.x;
  const wy = target.y - hips.y;
  const wz = target.z - hips.z;
  const r2 = rx * rx + ry * ry + rz * rz;
  const w2 = wx * wx + wy * wy + wz * wz;
  const A = rx * wx + ry * wy + rz * wz;
  // In reach already: |w − r|² = w² + r² − 2A.
  if (w2 + r2 - 2 * A <= reach * reach) return 0;
  const n = Math.hypot(wx, wz);
  if (n < 1e-9 || maxRad <= 0) return 0;
  // k = up × (wx, 0, wz)/n = (wz, 0, −wx)/n.
  const kx = wz / n;
  const kz = -wx / n;
  // k × r, and its dot with w; k·r and k·w.
  const cx = -kz * ry;
  const cy = kz * rx - kx * rz;
  const cz = kx * ry;
  const B = cx * wx + cy * wy + cz * wz;
  const C = (kx * rx + kz * rz) * (kx * wx + kz * wz);
  const P = A - C;
  const R = Math.hypot(P, B);
  const phi = Math.atan2(B, P);
  // The dot needed for |w − r′| = reach.
  const D = (w2 + r2 - reach * reach) / 2 - C;
  const clamp = (x: number): number => Math.min(maxRad, Math.max(0, x));
  if (R < 1e-12 || D > R) return clamp(phi);
  // R cos(θ − φ) ≥ D: the first θ ≥ 0 that meets it, coming up toward φ.
  const theta = phi - Math.acos(Math.max(-1, Math.min(1, D / R)));
  return clamp(theta);
}

/** The two-bone solve's result, written in place (FR-008): the elbow's and the hand's positions, the elbow's bend from
 *  straight in radians, and whether the hand is at the target. */
export interface TwoBoneOut {
  readonly elbow: Vec3;
  readonly hand: Vec3;
  elbowRad: number;
  reached: boolean;
}

/**
 * The arm's two bones toward `target` from `shoulder` (R-03): the upper of length `a`, the fore of length `b`, the
 * elbow bent toward `pole` and never past `elbowMax` from straight. A target in range is met exactly; one beyond reach
 * gives the straight arm toward it; one nearer than the elbow's limit allows gives the hand at the limit, on the line
 * toward it. Written into `out`, which it returns: no allocation (FR-027).
 */
export function solveTwoBone(
  shoulder: Vec3,
  target: Vec3,
  pole: Vec3,
  a: number,
  b: number,
  elbowMax: number,
  out: TwoBoneOut,
): TwoBoneOut {
  let dx = target.x - shoulder.x;
  let dy = target.y - shoulder.y;
  let dz = target.z - shoulder.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-12) {
    // No direction: the arm hangs down, its elbow at the limit.
    dx = 0;
    dy = -1;
    dz = 0;
  } else {
    dx /= dist;
    dy /= dist;
    dz /= dist;
  }
  const inner = Math.PI - Math.min(Math.max(elbowMax, 0), Math.PI);
  const least = Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * Math.cos(inner)));
  const most = a + b;
  const d = Math.min(most, Math.max(least, dist));
  out.reached = Math.abs(d - dist) <= 1e-9;
  // The pole's part across the shoulder-to-target line, as a unit vector; a pole on the line falls back to the world's
  // down across it, then to a fixed side.
  let px = pole.x - shoulder.x;
  let py = pole.y - shoulder.y;
  let pz = pole.z - shoulder.z;
  let along = px * dx + py * dy + pz * dz;
  px -= dx * along;
  py -= dy * along;
  pz -= dz * along;
  let pn = Math.hypot(px, py, pz);
  if (pn < 1e-9) {
    along = -dy;
    px = -dx * along;
    py = -1 - dy * along;
    pz = -dz * along;
    pn = Math.hypot(px, py, pz);
    if (pn < 1e-9) {
      px = dz;
      py = 0;
      pz = -dx;
      pn = Math.hypot(px, py, pz) || 1;
    }
  }
  px /= pn;
  py /= pn;
  pz /= pn;
  // The law of cosines: the shoulder's angle off the line, and the elbow's interior angle.
  const cosS = d > 0 ? Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))) : 1;
  const sinS = Math.sqrt(Math.max(0, 1 - cosS * cosS));
  const cosE = Math.min(1, Math.max(-1, (a * a + b * b - d * d) / (2 * a * b)));
  out.elbowRad = Math.PI - Math.acos(cosE);
  out.elbow.x = shoulder.x + a * (cosS * dx + sinS * px);
  out.elbow.y = shoulder.y + a * (cosS * dy + sinS * py);
  out.elbow.z = shoulder.z + a * (cosS * dz + sinS * pz);
  out.hand.x = shoulder.x + d * dx;
  out.hand.y = shoulder.y + d * dy;
  out.hand.z = shoulder.z + d * dz;
  return out;
}

/** The stroke's tunables (FR-007). */
export interface StrokeConfig {
  readonly stroke_m: number;
  readonly stroke_n: number;
}

/** The target moved along the dog's heading (a heading h faces (−sin h, −cos h), spec 008's) by
 *  `stroke_m · sin(2π · stroke_n · u)`, u the stroke's share in [0, 1]. Written into `out`, which it returns. */
export function strokeTarget(head: Vec3, heading: number, u: number, cfg: StrokeConfig, out: Vec3): Vec3 {
  const share = Math.min(1, Math.max(0, u));
  const by = cfg.stroke_m * Math.sin(2 * Math.PI * cfg.stroke_n * share);
  out.x = head.x - Math.sin(heading) * by;
  out.y = head.y;
  out.z = head.z - Math.cos(heading) * by;
  return out;
}

const smoothstep = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

/** The layer's weight `t_s` seconds into a petting of `pet_s`: 0 → 1 over the first 0.5 s, 1, then 1 → 0 over the last
 *  0.5 s, each by a smoothstep (FR-007); 0 outside it. A petting shorter than both eases takes the lesser of the two. */
export function weightAt(t_s: number, cfg: { readonly pet_s: number }): number {
  if (!(t_s > 0) || !(t_s < cfg.pet_s)) return 0;
  return Math.min(smoothstep(t_s / EASE_IN_OUT_S), smoothstep((cfg.pet_s - t_s) / EASE_IN_OUT_S));
}

/** The stroke's share `t_s` seconds into a petting: 0 → 1 between the reach-in's end and the withdraw's start. */
export function strokeShare(t_s: number, cfg: { readonly pet_s: number }): number {
  const span = cfg.pet_s - 2 * EASE_IN_OUT_S;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (t_s - EASE_IN_OUT_S) / span));
}
