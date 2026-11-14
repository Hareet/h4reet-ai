// The twin's reach toward the room's dog (spec 026; FR-007, FR-008; plan.md R-03, R-04, amended by the page's Q212,
// taken provisionally): the stand-in for the studio's `petting` clip. The math here is pure (the spine's lean, the
// posture's crouch and lean, the two-bone solve, the stroke's target, the layer's weight), over plain numbers, with no
// three.js object; the bones' part follows it, three's, preallocated.
import { PropertyBinding, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";

/** A point or a direction, written in place where a function takes an `out`. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The reach's tunables (spec FR-007, FR-008; plan §3): scene data in `figures.pet`, these its defaults. Placeholders,
 *  the Author's to set at lookdev. `crouch_max_m` and `lean_max_deg` are measured by T003 on both rigs (Q162, Q212) and
 *  recorded in plan §3: the crouch within the thighs' level, the lean the larger need at that crouch plus 5°. */
export const PET_REACH_DEFAULTS = Object.freeze({
  crouch_max_m: 0.35,
  lean_max_deg: 66,
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

/** The posture's scan and its halvings (R-03): 16 steps, then 12 halvings of the step that first reaches. */
const POSTURE_STEPS = 16;
const POSTURE_HALVINGS = 12;

/** Adds `r` turned by `t` about the unit horizontal axis (kx, 0, kz) into `acc` (Rodrigues), with no allocation. */
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

const SHOULDER: Vec3 = { x: 0, y: 0, z: 0 };

/** The shoulder's distance to `target` after a crouch `c` and a lean `t` about (kx, 0, kz), each spine bone turned by a
 *  third: the segments below `Spine` by t/3, below `Spine1` by 2t/3, below `Spine2` by t. */
function distanceAt(chain: PostureChain, target: Vec3, kx: number, kz: number, c: number, t: number): number {
  const [p0, p1, p2] = chain.spine;
  SHOULDER.x = p0.x;
  SHOULDER.y = p0.y - c;
  SHOULDER.z = p0.z;
  addTurned(SHOULDER, p1.x - p0.x, p1.y - p0.y, p1.z - p0.z, kx, kz, t / 3);
  addTurned(SHOULDER, p2.x - p1.x, p2.y - p1.y, p2.z - p1.z, kx, kz, (2 * t) / 3);
  const sh = chain.shoulder;
  addTurned(SHOULDER, sh.x - p2.x, sh.y - p2.y, sh.z - p2.z, kx, kz, t);
  return Math.hypot(target.x - SHOULDER.x, target.y - SHOULDER.y, target.z - SHOULDER.z);
}

/**
 * The posture that brings `target` within `reach` of the shoulder (R-03, amended: Q212): the hips lowered by a crouch
 * and the spine leaned toward the target over its three bones, both bent together by one share s of their limits
 * (crouch s · `crouch_max_m`, lean s · `lean_max_rad`), s the least in [0, 1] that reaches: a scan of 16 steps, then 12
 * halvings of the first step that reaches. Where s = 1 doesn't, the scan's nearest. The lean's axis is up × the
 * target's direction on the floor from the hips; for a target straight above or below them, there is no lean, only the
 * crouch. Written into `out`, which it returns: no allocation (FR-027).
 */
export function solvePosture(
  chain: PostureChain,
  target: Vec3,
  reach: number,
  limits: PostureLimits,
  out: PostureOut,
): PostureOut {
  const wx = target.x - chain.hips.x;
  const wz = target.z - chain.hips.z;
  const n = Math.hypot(wx, wz);
  const leans = n >= 1e-9;
  const kx = leans ? wz / n : 0;
  const kz = leans ? -wx / n : 0;
  const cMax = Math.max(0, limits.crouch_max_m);
  const tMax = leans ? Math.max(0, limits.lean_max_rad) : 0;
  let share = 0;
  let best = distanceAt(chain, target, kx, kz, 0, 0);
  if (best > reach) {
    let found = -1;
    let nearest = 0;
    for (let i = 1; i <= POSTURE_STEPS; i++) {
      const s = i / POSTURE_STEPS;
      const d = distanceAt(chain, target, kx, kz, s * cMax, s * tMax);
      if (d <= reach) {
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
        if (distanceAt(chain, target, kx, kz, mid * cMax, mid * tMax) <= reach) hi = mid;
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

// Preallocated: one reach is laid at a time, and no frame makes an object (FR-027).
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
const _out = new Vector3();
const _hips = { x: 0, y: 0, z: 0 };
const _spine: [Vec3, Vec3, Vec3] = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
];
const _shoulder = { x: 0, y: 0, z: 0 };
const CHAIN: PostureChain = { hips: _hips, spine: _spine, shoulder: _shoulder };
const POSTURE: PostureOut = { share: 0, crouch: 0, lean: 0, axis: { x: 0, y: 0, z: 0 } };
const TWO: TwoBoneOut = { elbow: { x: 0, y: 0, z: 0 }, hand: { x: 0, y: 0, z: 0 }, elbowRad: 0, reached: false };
const _j = { x: 0, y: 0, z: 0 };
const _k = { x: 0, y: 0, z: 0 };
const _a = { x: 0, y: 0, z: 0 };
const _pole = { x: 0, y: 0, z: 0 };
const _t = { x: 0, y: 0, z: 0 };
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
 * (spec 019's tracking). A weight of 0 or less clears the reach. No object is made (FR-027).
 */
export function applyReach(rig: ReachRig, target: Vec3, weight: number, cfg: ReachConfig): void {
  if (!(weight > 0)) {
    clearReach(rig);
    return;
  }
  const w = Math.min(1, weight);
  // 1. The clip's pose back on every bone the reach turns, the mixer's write taken as the base where it wrote.
  const { hips } = rig;
  if (!hips.on || !hips.node.position.equals(hips.applied)) hips.base.copy(hips.node.position);
  hips.node.position.copy(hips.base);
  for (const b of rig.spine) sync(b);
  sync(rig.arm);
  sync(rig.fore);
  for (const leg of rig.legs) {
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
  const a = elbow0.distanceTo(_u.setFromMatrixPosition(rig.arm.node.matrixWorld));
  const b = elbow0.distanceTo(_u.setFromMatrixPosition(rig.end.matrixWorld));
  for (let i = 0; i < 2; i++) {
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
  // 3. The posture, scaled by the weight.
  solvePosture(
    CHAIN,
    target,
    REACH_SHARE * (a + b),
    { crouch_max_m: cfg.crouch_max_m, lean_max_rad: (cfg.lean_max_deg * Math.PI) / 180 },
    POSTURE,
  );
  const crouch = w * POSTURE.crouch;
  const lean = w * POSTURE.lean;
  // The crouch: the hips straight down.
  _u.set(_hips.x, _hips.y - crouch, _hips.z);
  (hips.node.parent as Object3D).worldToLocal(_u);
  hips.node.position.copy(_u);
  hips.applied.copy(_u);
  hips.on = true;
  // The lean: each spine bone turned by a third about the axis, in world space.
  _w.set(POSTURE.axis.x, 0, POSTURE.axis.z);
  _r.setFromAxisAngle(_w, lean / 3);
  for (let i = 0; i < 3; i++) {
    const sb = rig.spine[i]!;
    write(sb, localTurn(sb.base, SPINE_PARENT[i]!, _r, _q));
  }
  // The legs: the hip joint lowered with the hips, the ankle kept, the knee by the two-bone solve, the foot's world
  // rotation kept.
  for (let i = 0; i < 2; i++) {
    const leg = rig.legs[i]!;
    const s = LEG_SCRATCH[i]!;
    const thigh = s.knee.distanceTo(s.hip);
    const shin = s.ankle.distanceTo(s.knee);
    _j.x = s.hip.x;
    _j.y = s.hip.y - crouch;
    _j.z = s.hip.z;
    _pole.x = s.knee.x + _fwd.x * POLE_M;
    _pole.y = s.knee.y;
    _pole.z = s.knee.z + _fwd.z * POLE_M;
    setV(_a, s.ankle);
    solveTwoBone(_j, _a, _pole, thigh, shin, KNEE_MAX_RAD, TWO);
    setV(_k, s.knee);
    // The thigh: from the clip's direction to the solve's.
    _u.set(_k.x - s.hip.x, _k.y - s.hip.y, _k.z - s.hip.z).normalize();
    _w.set(TWO.elbow.x - _j.x, TWO.elbow.y - _j.y, TWO.elbow.z - _j.z).normalize();
    _qa.setFromUnitVectors(_u, _w);
    write(leg.up, localTurn(leg.up.base, s.hipsWorld, _qa, _q));
    // The shin: its clip direction as the thigh's turn carries it, to the solve's.
    _u.set(s.ankle.x - _k.x, s.ankle.y - _k.y, s.ankle.z - _k.z)
      .normalize()
      .applyQuaternion(_qa);
    _w.set(TWO.hand.x - TWO.elbow.x, TWO.hand.y - TWO.elbow.y, TWO.hand.z - TWO.elbow.z).normalize();
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
  solveTwoBone(_shoulder, _t, _pole, a, b, (cfg.elbow_deg * Math.PI) / 180, TWO);
  worldRot(rig.arm.node.parent as Object3D, _p);
  worldRot(rig.arm.node, _wb);
  // The upper arm: from the clip's direction to the solve's.
  _u.set(_k.x - _shoulder.x, _k.y - _shoulder.y, _k.z - _shoulder.z).normalize();
  _w.set(TWO.elbow.x - _shoulder.x, TWO.elbow.y - _shoulder.y, TWO.elbow.z - _shoulder.z).normalize();
  _qa.setFromUnitVectors(_u, _w);
  localTurn(rig.arm.base, _p, _qa, _r);
  write(rig.arm, _q.copy(rig.arm.base).slerp(_r, w));
  // The forearm: the hand's end as the upper arm's turn carries it, to the solve's.
  _u.set(_a.x - _k.x, _a.y - _k.y, _a.z - _k.z)
    .normalize()
    .applyQuaternion(_qa);
  _w.set(TWO.hand.x - TWO.elbow.x, TWO.hand.y - TWO.elbow.y, TWO.hand.z - TWO.elbow.z).normalize();
  _qb.setFromUnitVectors(_u, _w);
  _wa.copy(_qa).multiply(_wb);
  // Solved for the whole turn of the upper arm, then slerped from the clip's by the weight, as the upper arm is.
  localTurn(rig.fore.base, _wa, _qb, _r);
  write(rig.fore, _q.copy(rig.fore.base).slerp(_r, w));
}

/** One bone given the clip's rotation back, where the reach's is still on it; a bone the mixer wrote since keeps it. */
function unlay(b: ReachBone): void {
  if (b.on && b.node.quaternion.equals(b.applied)) b.node.quaternion.copy(b.base);
  b.on = false;
}

/** Puts the clip's rotations and the hips' position back wherever the reach laid itself over them, and forgets: no
 *  residue (FR-008). */
export function clearReach(rig: ReachRig): void {
  for (const b of rig.spine) unlay(b);
  unlay(rig.arm);
  unlay(rig.fore);
  for (const leg of rig.legs) {
    unlay(leg.up);
    unlay(leg.knee);
    unlay(leg.foot);
  }
  const { hips } = rig;
  if (hips.on && hips.node.position.equals(hips.applied)) hips.node.position.copy(hips.base);
  hips.on = false;
}
