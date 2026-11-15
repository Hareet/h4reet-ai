// The twin's reach toward the room's dog (spec 026; FR-007, FR-008; plan.md R-03, R-04, amended by the page's Q212,
// taken provisionally): the stand-in for the studio's `petting` clip. The math here is pure (the spine's lean, the
// posture's crouch and lean, the two-bone solve, the stroke's target, the layer's weight), over plain numbers, with no
// three.js object; the bones' part follows it, three's. No frame makes an object, numbers included, measured by
// test/room/pet-bench.test.ts (FR-027; rv-impl-026's I-1): see `Point`.
import { PropertyBinding, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";

/** A point or a direction, written in place where a function takes an `out`. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A `Vec3` to write in place each frame (FR-027; rv-impl-026's I-1). A class, not an `{ x, y, z }` literal: V8 shares
 * one hidden class among every such literal in the page, whose fields any other code can generalize to hold anything,
 * and a fraction stored in such a field is then a new heap number at each write (measured: `pet-bench.test.ts`). A
 * class's instances have a hidden class of their own, whose number fields stay unboxed.
 */
export class Point implements Vec3 {
  x = 0;
  y = 0;
  z = 0;
}

/** The reach's tunables (spec FR-007, FR-008; plan §3): scene data in `figures.pet`, these its defaults, kept in
 *  pet-config.ts so the build reads them without three.js. */
export { PET_REACH_DEFAULTS } from "./pet-config";

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
  const n = Math.sqrt(wx * wx + wz * wz);
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
  const R = Math.sqrt(P * P + B * B);
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

/** A `TwoBoneOut` to write in place each frame (a class, as `Point` is; I-1). */
export class TwoBone implements TwoBoneOut {
  readonly elbow = new Point();
  readonly hand = new Point();
  elbowRad = 0;
  reached = false;
}

/**
 * The arm's two bones toward `target` from `shoulder` (R-03): the upper of length `a`, the fore of length `b`, the
 * elbow bent toward `pole` and never past `elbowMax` from straight. A target in range is met exactly; one beyond reach
 * gives the straight arm toward it; one nearer than the elbow's limit allows gives the hand at the limit, on the line
 * toward it. Written into `out`, which it returns, making no object; its numbers, passed as arguments, are boxed at the
 * call while they are fractions, so the reach calls its body, `twoBone`, with them in a class's fields (FR-027; I-1).
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
  const len = TWO_BONE_ARGS;
  len.a = a;
  len.b = b;
  len.elbowMax = elbowMax;
  return twoBone(shoulder, target, pole, len, out);
}

/** The two-bone solve's lengths and limit, set in place (I-1): the reach passes its numbers in a class's fields, never
 *  as arguments, since a fraction passed to a call V8 doesn't inline is boxed at each call. */
class TwoBoneLengths {
  a = 0;
  b = 0;
  elbowMax = 0;
}
const TWO_BONE_ARGS = new TwoBoneLengths();

/** `solveTwoBone`'s body, its numbers in `len`. */
function twoBone(shoulder: Vec3, target: Vec3, pole: Vec3, len: TwoBoneLengths, out: TwoBoneOut): TwoBoneOut {
  const a = len.a;
  const b = len.b;
  const elbowMax = len.elbowMax;
  let dx = target.x - shoulder.x;
  let dy = target.y - shoulder.y;
  let dz = target.z - shoulder.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
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
  let pn = Math.sqrt(px * px + py * py + pz * pz);
  if (pn < 1e-9) {
    along = -dy;
    px = -dx * along;
    py = -1 - dy * along;
    pz = -dz * along;
    pn = Math.sqrt(px * px + py * py + pz * pz);
    if (pn < 1e-9) {
      px = dz;
      py = 0;
      pz = -dx;
      pn = Math.sqrt(px * px + py * py + pz * pz) || 1;
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

// --------------------------------------------------------------------------------------------------------------------
// The posture (plan.md R-03, amended: Q212, taken provisionally)
// --------------------------------------------------------------------------------------------------------------------

/** What the posture reads, in world space: the hips, the three spine joints (`Spine`, `Spine1`, `Spine2`), and the
 *  shoulder on the reach's side (its `Arm` bone). */
export interface PostureChain {
  readonly hips: Vec3;
  readonly spine: readonly [Vec3, Vec3, Vec3];
  readonly shoulder: Vec3;
}

/** The posture's limits: the crouch in metres, the lean in radians. */
export interface PostureLimits {
  readonly crouch_max_m: number;
  readonly lean_max_rad: number;
}

/** The posture, written in place: the share of both limits, the crouch (the hips' fall, metres), the lean over the
 *  spine (radians, a third on each bone), and the lean's axis (unit, horizontal; zero where there is no direction). */
export interface PostureOut {
  share: number;
  crouch: number;
  lean: number;
  readonly axis: Vec3;
}

/** A `PostureOut` to write in place each frame (a class, as `Point` is; I-1). */
export class Posture implements PostureOut {
  share = 0;
  crouch = 0;
  lean = 0;
  readonly axis = new Point();
}

/** `PostureLimits` and the reach, set in place each frame (a class, as `Point` is; I-1). */
class Limits implements PostureLimits {
  reach = 0;
  crouch_max_m = 0;
  lean_max_rad = 0;
}
const POSTURE_ARGS = new Limits();

/** The posture's scan and its halvings (R-03): 16 steps, then 12 halvings of the step that first reaches. */
const POSTURE_STEPS = 16;
const POSTURE_HALVINGS = 12;

/** Adds `r` turned by `t` about the unit horizontal axis (kx, 0, kz) into `acc` (Rodrigues), in place. */
function addTurned(acc: Vec3, rx: number, ry: number, rz: number, kx: number, kz: number, t: number): void {
  const c = Math.cos(t);
  const s = Math.sin(t);
  // k × r, with k = (kx, 0, kz); and k · r.
  const cx = -kz * ry;
  const cy = kz * rx - kx * rz;
  const cz = kx * ry;
  const kr = kx * rx + kz * rz;
  acc.x += rx * c + cx * s + kx * kr * (1 - c);
  acc.y += ry * c + cy * s;
  acc.z += rz * c + cz * s + kz * kr * (1 - c);
}

/** The posture scan's numbers, fields written in place (I-1): the lean's axis (kx, 0, kz), the crouch c and the lean t
 *  to try, and the squared distance found. */
class Scan {
  kx = 0;
  kz = 0;
  c = 0;
  t = 0;
  d2 = 0;
}

const SHOULDER = new Point();
const SCAN = new Scan();

/** The shoulder's squared distance to `target` after a crouch `SCAN.c` and a lean `SCAN.t` about (`SCAN.kx`, 0,
 *  `SCAN.kz`), each spine bone turned by a third: the segments below `Spine` by t/3, below `Spine1` by 2t/3, below
 *  `Spine2` by t. Its numbers come and go in SCAN's fields, not as arguments or a result: the scan calls it up to 29
 *  times a frame, and a fraction passed to or returned from a call V8 doesn't inline is boxed each time (FR-027; I-1). */
function distanceAt(chain: PostureChain, target: Vec3): void {
  const kx = SCAN.kx;
  const kz = SCAN.kz;
  const c = SCAN.c;
  const t = SCAN.t;
  const [p0, p1, p2] = chain.spine;
  SHOULDER.x = p0.x;
  SHOULDER.y = p0.y - c;
  SHOULDER.z = p0.z;
  addTurned(SHOULDER, p1.x - p0.x, p1.y - p0.y, p1.z - p0.z, kx, kz, t / 3);
  addTurned(SHOULDER, p2.x - p1.x, p2.y - p1.y, p2.z - p1.z, kx, kz, (2 * t) / 3);
  const sh = chain.shoulder;
  addTurned(SHOULDER, sh.x - p2.x, sh.y - p2.y, sh.z - p2.z, kx, kz, t);
  const dx = target.x - SHOULDER.x;
  const dy = target.y - SHOULDER.y;
  const dz = target.z - SHOULDER.z;
  SCAN.d2 = dx * dx + dy * dy + dz * dz;
}

/**
 * The posture that brings `target` within `reach` of the shoulder (R-03, amended: Q212): the hips lowered by a crouch
 * and the spine leaned toward the target over its three bones, both bent together by one share s of their limits
 * (crouch s · `crouch_max_m`, lean s · `lean_max_rad`), s the least in [0, 1] that reaches: a scan of 16 steps, then 12
 * halvings of the first step that reaches. Where s = 1 doesn't, the scan's nearest. The lean's axis is up × the
 * target's direction on the floor from the hips; for a target straight above or below them, there is no lean, only the
 * crouch. Written into `out`, which it returns, making no object; the reach calls its body, `posture`, with the reach
 * and the limits in a class's fields, as `solveTwoBone`'s (FR-027; I-1).
 */
export function solvePosture(
  chain: PostureChain,
  target: Vec3,
  reach: number,
  limits: PostureLimits,
  out: PostureOut,
): PostureOut {
  const args = POSTURE_ARGS;
  args.reach = reach;
  args.crouch_max_m = limits.crouch_max_m;
  args.lean_max_rad = limits.lean_max_rad;
  return posture(chain, target, args, out);
}

/** `solvePosture`'s body, its reach and limits in `limits` (I-1). */
function posture(chain: PostureChain, target: Vec3, limits: Limits, out: PostureOut): PostureOut {
  const reach = limits.reach;
  const wx = target.x - chain.hips.x;
  const wz = target.z - chain.hips.z;
  const n = Math.sqrt(wx * wx + wz * wz);
  const leans = n >= 1e-9;
  const kx = leans ? wz / n : 0;
  const kz = leans ? -wx / n : 0;
  const cMax = Math.max(0, limits.crouch_max_m);
  const tMax = leans ? Math.max(0, limits.lean_max_rad) : 0;
  const reach2 = reach * reach;
  let share = 0;
  SCAN.kx = kx;
  SCAN.kz = kz;
  SCAN.c = 0;
  SCAN.t = 0;
  distanceAt(chain, target);
  let best = SCAN.d2;
  if (best > reach2) {
    let found = -1;
    let nearest = 0;
    for (let i = 1; i <= POSTURE_STEPS; i++) {
      const s = i / POSTURE_STEPS;
      SCAN.c = s * cMax;
      SCAN.t = s * tMax;
      distanceAt(chain, target);
      const d = SCAN.d2;
      if (d <= reach2) {
        found = i;
        break;
      }
      if (d < best) {
        best = d;
        nearest = s;
      }
    }
    if (found < 0) share = nearest;
    else {
      let lo = (found - 1) / POSTURE_STEPS;
      let hi = found / POSTURE_STEPS;
      for (let i = 0; i < POSTURE_HALVINGS; i++) {
        const mid = (lo + hi) / 2;
        SCAN.c = mid * cMax;
        SCAN.t = mid * tMax;
        distanceAt(chain, target);
        if (SCAN.d2 <= reach2) hi = mid;
        else lo = mid;
      }
      share = hi;
    }
  }
  out.share = share;
  out.crouch = share * cMax;
  out.lean = share * tMax;
  out.axis.x = kx;
  out.axis.y = 0;
  out.axis.z = kz;
  return out;
}

// --------------------------------------------------------------------------------------------------------------------
// The bones (plan.md R-04, amended: Q212)
// --------------------------------------------------------------------------------------------------------------------

/** The reach's side: the arm on the dog's side. */
export type ReachSide = "right" | "left";

/** One bone the reach turns, with what the applier tracks, as spec 019's gait does: `base`, the clip's rotation, and
 *  `applied`, what the reach last wrote, which is how a frame the mixer didn't write is told from one it did. */
export interface ReachBone {
  readonly node: Object3D;
  readonly base: Quaternion;
  readonly applied: Quaternion;
  on: boolean;
}

/** The hips bone, whose position alone the reach moves (the crouch), tracked as the rotations are. */
export interface ReachHips {
  readonly node: Object3D;
  readonly base: Vector3;
  readonly applied: Vector3;
  on: boolean;
}

/** One leg's three bones, bent by the crouch with the foot kept. */
export interface ReachLeg {
  readonly up: ReachBone;
  readonly knee: ReachBone;
  readonly foot: ReachBone;
}

export interface ReachRig {
  readonly side: ReachSide;
  readonly root: Object3D;
  readonly hips: ReachHips;
  readonly spine: readonly [ReachBone, ReachBone, ReachBone];
  readonly arm: ReachBone;
  readonly fore: ReachBone;
  /** The hand, read for its place in the chain, never written: it keeps the clip's rotation (R-03). */
  readonly hand: Object3D;
  /** The middle finger's base: the hand's end, the point the reach brings to the target. */
  readonly end: Object3D;
  readonly legs: readonly [ReachLeg, ReachLeg];
}

/** The reach's tunables the applier reads (spec FR-007, FR-008; plan §3). */
export interface ReachConfig {
  readonly crouch_max_m: number;
  readonly lean_max_deg: number;
  readonly elbow_deg: number;
}

const bone = (name: string): string => PropertyBinding.sanitizeNodeName(`mixamorig:${name}`);
const tracked = (node: Object3D): ReachBone => ({
  node,
  base: new Quaternion(),
  applied: new Quaternion(),
  on: false,
});

/**
 * The reach's bones by their sanitized Mixamo names, or null if any is missing: the six (`Spine`, `Spine1`, `Spine2`,
 * and the side's `Arm`, `ForeArm`, `Hand`), the side's `HandMiddle1` (the hand's end), the `Hips`, and both legs'
 * `UpLeg`, `Leg`, `Foot` (Q212). Found once; the reach measures the rest each frame.
 */
export function findReachRig(root: Object3D, side: ReachSide): ReachRig | null {
  const S = side === "right" ? "Right" : "Left";
  const names = [
    "Hips",
    "Spine",
    "Spine1",
    "Spine2",
    `${S}Arm`,
    `${S}ForeArm`,
    `${S}Hand`,
    `${S}HandMiddle1`,
    "LeftUpLeg",
    "LeftLeg",
    "LeftFoot",
    "RightUpLeg",
    "RightLeg",
    "RightFoot",
  ];
  const found = names.map((n) => root.getObjectByName(bone(n)));
  if (found.some((o) => o === undefined)) return null;
  const [hips, s0, s1, s2, arm, fore, hand, end, lu, lk, lf, ru, rk, rf] = found as Object3D[] as [
    Object3D,
    Object3D,
    Object3D,
    Object3D,
    Object3D,
    Object3D,
    Object3D,
    Object3D,
    Object3D,
    Object3D,
    Object3D,
    Object3D,
    Object3D,
    Object3D,
  ];
  if (!hips.parent || !s0.parent || !s1.parent || !s2.parent || !arm.parent || !lu.parent || !ru.parent) return null;
  return {
    side,
    root,
    hips: { node: hips, base: new Vector3(), applied: new Vector3(), on: false },
    spine: [tracked(s0), tracked(s1), tracked(s2)],
    arm: tracked(arm),
    fore: tracked(fore),
    hand,
    end,
    legs: [
      { up: tracked(lu), knee: tracked(lk), foot: tracked(lf) },
      { up: tracked(ru), knee: tracked(rk), foot: tracked(rf) },
    ],
  };
}

/** The knee's limit from straight: a squat's, past the crouch's 111° (plan §3). */
const KNEE_MAX_RAD = (150 * Math.PI) / 180;
/** The pole's offsets: the knee's, forward of the clip's knee; the elbow's, out and down from the clip's elbow. */
const POLE_M = 0.3;
/** The arm's reach: 0.98 of its two lengths (R-03). */
const REACH_SHARE = 0.98;

// Made once: one reach is laid at a time, and no frame makes an object (FR-027), measured by pet-bench.test.ts.
const _q = new Quaternion();
const _r = new Quaternion();
const _p = new Quaternion();
const _pi = new Quaternion();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _wa = new Quaternion();
const _wb = new Quaternion();
const _sc = new Vector3();
const _pos = new Vector3();
const _u = new Vector3();
const _w = new Vector3();
const _fwd = new Vector3();
const UP = new Vector3(0, 1, 0);
const _out = new Vector3();
const _hips = new Point();
const _spine: [Point, Point, Point] = [new Point(), new Point(), new Point()];
const _shoulder = new Point();
const CHAIN: PostureChain = { hips: _hips, spine: _spine, shoulder: _shoulder };
const POSTURE = new Posture();
const LIMITS = new Limits();
const TWO = new TwoBone();
const _j = new Point();
const _k = new Point();
const _a = new Point();
const _pole = new Point();
const _t = new Point();
const LEG_LENGTHS = new TwoBoneLengths();
const ARM_LENGTHS = new TwoBoneLengths();
const LEG_SCRATCH = [0, 1].map(() => ({
  hip: new Vector3(),
  knee: new Vector3(),
  ankle: new Vector3(),
  upWorld: new Quaternion(),
  kneeWorld: new Quaternion(),
  footWorld: new Quaternion(),
  hipsWorld: new Quaternion(),
})) as [LegScratch, LegScratch];
interface LegScratch {
  readonly hip: Vector3;
  readonly knee: Vector3;
  readonly ankle: Vector3;
  readonly upWorld: Quaternion;
  readonly kneeWorld: Quaternion;
  readonly footWorld: Quaternion;
  readonly hipsWorld: Quaternion;
}
const SPINE_PARENT = [new Quaternion(), new Quaternion(), new Quaternion()] as const;

const setV = (out: Vec3, from: Vector3): Vec3 => {
  out.x = from.x;
  out.y = from.y;
  out.z = from.z;
  return out;
};
/** A node's world position, from its world matrix (already current). */
const worldPos = (node: Object3D, out: Vector3): Vector3 => out.setFromMatrixPosition(node.matrixWorld);
/** A node's world rotation, from its world matrix (already current), its scale divided out. */
const worldRot = (node: Object3D, out: Quaternion): Quaternion => {
  node.matrixWorld.decompose(_pos, out, _sc);
  return out;
};

/** Takes the mixer's write as the new base, if there was one, and puts the base back on the bone. */
function sync(b: ReachBone): void {
  if (!b.on || !b.node.quaternion.equals(b.applied)) b.base.copy(b.node.quaternion);
  b.node.quaternion.copy(b.base);
}

/** Writes `rotation` on the bone and records it as the reach's. */
function write(b: ReachBone, rotation: Quaternion): void {
  b.node.quaternion.copy(rotation);
  b.applied.copy(rotation);
  b.on = true;
}

const SLERP_A = new Float64Array(4);
const SLERP_B = new Float64Array(4);
/** The share `slerpInto` takes, set in place (I-1). */
const SLERP_T = new Float64Array(1);

/**
 * `q` becomes three's `q.slerp(r, SLERP_T[0])`, the same arithmetic (the shorter way; a lerp and a normalize within
 * 0.9995 of the same rotation), its numbers through typed arrays and `toArray`/`fromArray`: `slerp` takes its share as
 * an argument, a heap number made at each call while it is a fraction (I-1).
 */
function slerpInto(q: Quaternion, r: Quaternion): Quaternion {
  q.toArray(SLERP_A);
  r.toArray(SLERP_B);
  let t = SLERP_T[0] as number;
  const ax = SLERP_A[0] as number;
  const ay = SLERP_A[1] as number;
  const az = SLERP_A[2] as number;
  const aw = SLERP_A[3] as number;
  let bx = SLERP_B[0] as number;
  let by = SLERP_B[1] as number;
  let bz = SLERP_B[2] as number;
  let bw = SLERP_B[3] as number;
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    dot = -dot;
  }
  let s = 1 - t;
  if (dot < 0.9995) {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    s = Math.sin(s * theta) / sin;
    t = Math.sin(t * theta) / sin;
  }
  let x = ax * s + bx * t;
  let y = ay * s + by * t;
  let z = az * s + bz * t;
  let w = aw * s + bw * t;
  if (!(dot < 0.9995)) {
    const l = Math.sqrt(x * x + y * y + z * z + w * w);
    if (l === 0) {
      x = 0;
      y = 0;
      z = 0;
      w = 1;
    } else {
      x /= l;
      y /= l;
      z /= l;
      w /= l;
    }
  }
  SLERP_A[0] = x;
  SLERP_A[1] = y;
  SLERP_A[2] = z;
  SLERP_A[3] = w;
  return q.fromArray(SLERP_A);
}

/** `q` becomes p⁻¹ · r · p · base: a world turn r given to a bone whose parent's world rotation is p, as a local one. */
function localTurn(base: Quaternion, parentWorld: Quaternion, r: Quaternion, q: Quaternion): Quaternion {
  _pi.copy(parentWorld).invert();
  return q.copy(_pi).multiply(r).multiply(parentWorld).multiply(base);
}

/**
 * Lays the reach over the clip's pose (R-03, R-04; FR-007, FR-008; amended by Q212): toward `target` in world space,
 * at the layer's `weight` in [0, 1]. The posture first (`solvePosture`): the hips lowered by the crouch and both legs
 * bent by `solveTwoBone`, each foot kept where the clip has it, its world rotation too; the spine leaned over its three
 * bones; both scaled by the weight, so the feet stay planted through the ease. Then the arm on the rig's side by
 * `solveTwoBone`, the elbow toward a pole out and down from the clip's elbow, within `elbow_deg`, its two bones slerped
 * from the clip's by the weight; the hand keeps the clip's rotation. Each bone's base is the mixer's last write
 * (spec 019's tracking). A weight of 0 or less clears the reach. It makes no object but a fractional `weight`'s box at
 * its call; the twin's controller calls `applyReachLayer`, which makes none (FR-027; I-1).
 *
 * `legs` false is a run's cut (Q226; FR-011): the hips and both legs are given back to the clip at once, where the
 * reach's write is still on them (a bone the run's mixer or leg layer wrote since keeps that write), and are neither
 * read as a base nor written while it lasts; only the spine's lean and the arm ease out by the weight.
 */
export function applyReach(rig: ReachRig, target: Vec3, weight: number, cfg: ReachConfig, legs = true): void {
  const layer = LAYER_ARGS;
  layer.target = target;
  layer.weight = weight;
  layer.legs = legs;
  applyReachLayer(rig, layer, cfg);
}

/** The reach layer's numbers for a frame: the hand's target in world space, the weight, and whether the crouch is laid
 *  (Q226). The director's `reach` (pet.ts) is one. */
export interface ReachLayer {
  readonly target: Vec3;
  readonly weight: number;
  readonly legs: boolean;
}

/** `applyReach`'s arguments, set in place (I-1). */
class LayerArgs implements ReachLayer {
  target: Vec3 = new Point();
  weight = 0;
  legs = true;
}
const LAYER_ARGS = new LayerArgs();

/**
 * `applyReach` with its numbers read from `layer`'s fields, the entry the twin's controller calls each frame with the
 * director's `reach` (T014): a weight passed as an argument is a heap number made at each call while it is a fraction
 * (the reach-in, the withdraw, a run's cut), and this makes none (FR-027; I-1, measured by `pet-bench.test.ts`).
 */
export function applyReachLayer(rig: ReachRig, layer: ReachLayer, cfg: ReachConfig): void {
  const weight = layer.weight;
  const target = layer.target;
  const legs = layer.legs;
  if (!(weight > 0)) {
    clearReach(rig);
    return;
  }
  const w = Math.min(1, weight);
  // 1. The clip's pose back on every bone the reach turns, the mixer's write taken as the base where it wrote.
  const { hips } = rig;
  if (legs) {
    if (!hips.on || !hips.node.position.equals(hips.applied)) hips.base.copy(hips.node.position);
    hips.node.position.copy(hips.base);
  } else clearLegs(rig);
  for (let i = 0; i < 3; i++) sync(rig.spine[i]!);
  sync(rig.arm);
  sync(rig.fore);
  for (let i = 0; legs && i < 2; i++) {
    const leg = rig.legs[i]!;
    sync(leg.up);
    sync(leg.knee);
    sync(leg.foot);
  }
  hips.node.updateWorldMatrix(true, true);
  // 2. The clip's pose, read in world space.
  setV(_hips, worldPos(hips.node, _u));
  for (let i = 0; i < 3; i++) {
    const node = rig.spine[i]!.node;
    setV(_spine[i]!, worldPos(node, _u));
    worldRot(node.parent as Object3D, SPINE_PARENT[i]!);
  }
  setV(_shoulder, worldPos(rig.arm.node, _u));
  const elbow0 = worldPos(rig.fore.node, _w);
  worldPos(rig.arm.node, _u);
  const ax = elbow0.x - _u.x;
  const ay = elbow0.y - _u.y;
  const az = elbow0.z - _u.z;
  const a = Math.sqrt(ax * ax + ay * ay + az * az);
  worldPos(rig.end, _u);
  const bx = elbow0.x - _u.x;
  const by = elbow0.y - _u.y;
  const bz = elbow0.z - _u.z;
  const b = Math.sqrt(bx * bx + by * by + bz * bz);
  for (let i = 0; legs && i < 2; i++) {
    const leg = rig.legs[i]!;
    const s = LEG_SCRATCH[i]!;
    worldPos(leg.up.node, s.hip);
    worldPos(leg.knee.node, s.knee);
    worldPos(leg.foot.node, s.ankle);
    worldRot(leg.up.node.parent as Object3D, s.hipsWorld);
    worldRot(leg.up.node, s.upWorld);
    worldRot(leg.knee.node, s.kneeWorld);
    worldRot(leg.foot.node, s.footWorld);
  }
  // The figure's forward and its side out, on the floor, from the root.
  _fwd.setFromMatrixColumn(rig.root.matrixWorld, 2).setY(0).normalize();
  _out.setFromMatrixColumn(rig.root.matrixWorld, 0).setY(0).normalize();
  if (rig.side === "right") _out.negate();
  // 3. The posture, scaled by the weight. On a run's cut the crouch is solved as before (so the lean eases from where
  // it was) but not laid (Q226).
  LIMITS.reach = REACH_SHARE * (a + b);
  LIMITS.crouch_max_m = cfg.crouch_max_m;
  LIMITS.lean_max_rad = (cfg.lean_max_deg * Math.PI) / 180;
  posture(CHAIN, target, LIMITS, POSTURE);
  const crouch = legs ? w * POSTURE.crouch : 0;
  const lean = w * POSTURE.lean;
  // The crouch: the hips straight down.
  if (legs) {
    _u.x = _hips.x;
    _u.y = _hips.y - crouch;
    _u.z = _hips.z;
    (hips.node.parent as Object3D).worldToLocal(_u);
    hips.node.position.copy(_u);
    hips.applied.copy(_u);
    hips.on = true;
  }
  // The lean: each spine bone turned by a third about the axis, in world space.
  // The turn by lean/3 about the horizontal axis k = (kx, 0, kz), as the turn from up to up turned by it, (−kz sin,
  // cos, kx sin): three's `setFromAxisAngle` would take the angle as an argument, boxed at each call (I-1).
  const third = lean / 3;
  const sn = Math.sin(third);
  _w.x = -POSTURE.axis.z * sn;
  _w.y = Math.cos(third);
  _w.z = POSTURE.axis.x * sn;
  _r.setFromUnitVectors(UP, _w);
  for (let i = 0; i < 3; i++) {
    const sb = rig.spine[i]!;
    write(sb, localTurn(sb.base, SPINE_PARENT[i]!, _r, _q));
  }
  // The legs: the hip joint lowered with the hips, the ankle kept, the knee by the two-bone solve, the foot's world
  // rotation kept.
  for (let i = 0; legs && i < 2; i++) {
    const leg = rig.legs[i]!;
    const s = LEG_SCRATCH[i]!;
    const tx = s.knee.x - s.hip.x;
    const ty = s.knee.y - s.hip.y;
    const tz = s.knee.z - s.hip.z;
    const thigh = Math.sqrt(tx * tx + ty * ty + tz * tz);
    const sx = s.ankle.x - s.knee.x;
    const sy = s.ankle.y - s.knee.y;
    const sz = s.ankle.z - s.knee.z;
    const shin = Math.sqrt(sx * sx + sy * sy + sz * sz);
    _j.x = s.hip.x;
    _j.y = s.hip.y - crouch;
    _j.z = s.hip.z;
    _pole.x = s.knee.x + _fwd.x * POLE_M;
    _pole.y = s.knee.y;
    _pole.z = s.knee.z + _fwd.z * POLE_M;
    setV(_a, s.ankle);
    LEG_LENGTHS.a = thigh;
    LEG_LENGTHS.b = shin;
    LEG_LENGTHS.elbowMax = KNEE_MAX_RAD;
    twoBone(_j, _a, _pole, LEG_LENGTHS, TWO);
    setV(_k, s.knee);
    // The thigh: from the clip's direction to the solve's.
    _u.x = _k.x - s.hip.x;
    _u.y = _k.y - s.hip.y;
    _u.z = _k.z - s.hip.z;
    _u.normalize();
    _w.x = TWO.elbow.x - _j.x;
    _w.y = TWO.elbow.y - _j.y;
    _w.z = TWO.elbow.z - _j.z;
    _w.normalize();
    _qa.setFromUnitVectors(_u, _w);
    write(leg.up, localTurn(leg.up.base, s.hipsWorld, _qa, _q));
    // The shin: its clip direction as the thigh's turn carries it, to the solve's.
    _u.x = s.ankle.x - _k.x;
    _u.y = s.ankle.y - _k.y;
    _u.z = s.ankle.z - _k.z;
    _u.normalize().applyQuaternion(_qa);
    _w.x = TWO.hand.x - TWO.elbow.x;
    _w.y = TWO.hand.y - TWO.elbow.y;
    _w.z = TWO.hand.z - TWO.elbow.z;
    _w.normalize();
    _qb.setFromUnitVectors(_u, _w);
    // The knee's parent (the thigh) now holds _qa · upWorld.
    _p.copy(_qa).multiply(s.upWorld);
    write(leg.knee, localTurn(leg.knee.base, _p, _qb, _q));
    // The foot: its new parent's world rotation is _qb · _qa · kneeWorld; its own world rotation kept.
    _wa.copy(_qb).multiply(_qa).multiply(s.kneeWorld).invert();
    write(leg.foot, _q.copy(_wa).multiply(s.footWorld));
  }
  // 4. The arm, from the shoulder where the posture puts it.
  rig.end.updateWorldMatrix(true, false);
  const S = worldPos(rig.arm.node, _u);
  setV(_shoulder, S);
  const E = worldPos(rig.fore.node, _w);
  setV(_k, E);
  const M = _pos.setFromMatrixPosition(rig.end.matrixWorld);
  setV(_a, M);
  _pole.x = _k.x + _out.x * POLE_M;
  _pole.y = _k.y - POLE_M;
  _pole.z = _k.z + _out.z * POLE_M;
  _t.x = target.x;
  _t.y = target.y;
  _t.z = target.z;
  ARM_LENGTHS.a = a;
  ARM_LENGTHS.b = b;
  ARM_LENGTHS.elbowMax = (cfg.elbow_deg * Math.PI) / 180;
  twoBone(_shoulder, _t, _pole, ARM_LENGTHS, TWO);
  worldRot(rig.arm.node.parent as Object3D, _p);
  worldRot(rig.arm.node, _wb);
  // The upper arm: from the clip's direction to the solve's.
  _u.x = _k.x - _shoulder.x;
  _u.y = _k.y - _shoulder.y;
  _u.z = _k.z - _shoulder.z;
  _u.normalize();
  _w.x = TWO.elbow.x - _shoulder.x;
  _w.y = TWO.elbow.y - _shoulder.y;
  _w.z = TWO.elbow.z - _shoulder.z;
  _w.normalize();
  _qa.setFromUnitVectors(_u, _w);
  localTurn(rig.arm.base, _p, _qa, _r);
  SLERP_T[0] = w;
  write(rig.arm, slerpInto(_q.copy(rig.arm.base), _r));
  // The forearm: the hand's end as the upper arm's turn carries it, to the solve's.
  _u.x = _a.x - _k.x;
  _u.y = _a.y - _k.y;
  _u.z = _a.z - _k.z;
  _u.normalize().applyQuaternion(_qa);
  _w.x = TWO.hand.x - TWO.elbow.x;
  _w.y = TWO.hand.y - TWO.elbow.y;
  _w.z = TWO.hand.z - TWO.elbow.z;
  _w.normalize();
  _qb.setFromUnitVectors(_u, _w);
  _wa.copy(_qa).multiply(_wb);
  // Solved for the whole turn of the upper arm, then slerped from the clip's by the weight, as the upper arm is.
  localTurn(rig.fore.base, _wa, _qb, _r);
  write(rig.fore, slerpInto(_q.copy(rig.fore.base), _r));
}

/** One bone given the clip's rotation back, where the reach's is still on it; a bone the mixer wrote since keeps it. */
function unlay(b: ReachBone): void {
  if (b.on && b.node.quaternion.equals(b.applied)) b.node.quaternion.copy(b.base);
  b.on = false;
}

/** The crouch's bones, the hips' position and both legs, given back to the clip where the reach's write is still on
 *  them, and forgotten (Q226: a run's cut clears them at once). Exported for the twin's controller (T014), which calls
 *  it before the run's leg layer reads its base, since a clip without the legs' tracks leaves the crouch on them. */
export function clearReachLegs(rig: ReachRig): void {
  clearLegs(rig);
}

function clearLegs(rig: ReachRig): void {
  for (let i = 0; i < 2; i++) {
    const leg = rig.legs[i]!;
    unlay(leg.up);
    unlay(leg.knee);
    unlay(leg.foot);
  }
  const { hips } = rig;
  if (hips.on && hips.node.position.equals(hips.applied)) hips.node.position.copy(hips.base);
  hips.on = false;
}

/** Puts the clip's rotations and the hips' position back wherever the reach laid itself over them, and forgets: no
 *  residue (FR-008). */
export function clearReach(rig: ReachRig): void {
  for (let i = 0; i < 3; i++) unlay(rig.spine[i]!);
  unlay(rig.arm);
  unlay(rig.fore);
  clearLegs(rig);
}
