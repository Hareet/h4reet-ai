// The follow camera (spec 008; FR-022 to FR-024, FR-037, FR-044; plan.md R-01, R-02): pure, on the kernel's camera
// (compose/project.ts), so the 3D stage and the tests share it.
// - It orbits a focus at the figure's feet raised by the focus height: yaw about +Y from straight into the room (yaw 0
//   stands at +z from the focus, looking along −z, as the production framing does), pitch down from level, and a
//   distance, within the walking data's limits; the farthest distance is the production framing camera's from the
//   focus at the stage's aspect, so the walking view never shows the room smaller.
// - A region keeps it in front of the open face by REGION_MARGIN, within the side walls' inner width less that margin,
//   and REGION_FLOOR above the floor, so from there no wall stands between it and the room. A request outside the
//   region keeps its distance and turns less until inside, then tilts less, then changes its distance, deterministically.
// - Its moves into and out of the walking view take TRANSITION_MS, eased, while the motion store animates, and are a
//   cut while it doesn't; each lands exactly on its end, the production framing among them.
import type { Walking } from "../compose/bundle";
import type { WalkableFloor } from "../compose/floor";
import type { Vec3 } from "../compose/math";
import type { Camera } from "../compose/project";
import type { Pose } from "./movement";

export interface Orbit {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
}

export interface CameraLimits {
  /** The largest yaw either side of straight into the room, in radians. */
  readonly yaw: number;
  /** The pitch's range down from level, in radians. */
  readonly pitchMin: number;
  readonly pitchMax: number;
  readonly minDistance: number;
  readonly focusHeight: number;
}

export interface CameraRegion {
  readonly x0: number;
  readonly x1: number;
  /** The camera stands at or in front of this z, the open face's plus the margin. */
  readonly zMin: number;
  readonly yMin: number;
}

/** How far in front of the open face, and in from the side walls, the camera stays, in metres. */
export const REGION_MARGIN = 0.05;
/** How far above the floor it stays. */
export const REGION_FLOOR = 0.1;
/** The longest move into or out of the walking view, in milliseconds (FR-022). */
export const TRANSITION_MS = 500;

const DEG = Math.PI / 180;

/** The walking data's camera limits, in radians and metres. */
export function cameraLimits(walking: Pick<Walking, "camera">): CameraLimits {
  const c = walking.camera;
  return {
    yaw: c.yaw_deg * DEG,
    pitchMin: c.pitch_deg[0] * DEG,
    pitchMax: c.pitch_deg[1] * DEG,
    minDistance: c.min_distance_m,
    focusHeight: c.focus_height_m,
  };
}

/** The camera's region over a walkable floor's shell. */
export function cameraRegion(floor: Pick<WalkableFloor, "shell" | "feetY">): CameraRegion {
  return {
    x0: floor.shell.x0 + REGION_MARGIN,
    x1: floor.shell.x1 - REGION_MARGIN,
    zMin: floor.shell.z1 + REGION_MARGIN,
    yMin: floor.feetY + REGION_FLOOR,
  };
}

/** The point the camera looks at: the figure's feet, raised by the focus height. */
export function focusOf(
  pose: Pick<Pose, "x" | "z"> & Partial<Pose>,
  limits: CameraLimits,
  floor: Pick<WalkableFloor, "feetY">,
): Vec3 {
  return [pose.x, floor.feetY + limits.focusHeight, pose.z];
}

/** The camera's position on its orbit about the focus. */
export function orbitPosition(focus: Vec3, orbit: Orbit): Vec3 {
  const flat = orbit.distance * Math.cos(orbit.pitch);
  return [
    focus[0] + flat * Math.sin(orbit.yaw),
    focus[1] + orbit.distance * Math.sin(orbit.pitch),
    focus[2] + flat * Math.cos(orbit.yaw),
  ];
}

/** The farthest the camera may stand from the focus: the production framing's camera's distance from it. */
export function farthest(framing: Camera, focus: Vec3): number {
  return Math.hypot(framing.position[0] - focus[0], framing.position[1] - focus[1], framing.position[2] - focus[2]);
}

export function inRegion(p: Vec3, region: CameraRegion): boolean {
  return p[0] >= region.x0 && p[0] <= region.x1 && p[2] >= region.zMin && p[1] >= region.yMin;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The largest share s in [0, 1] of the way from `a` to `b` whose orbit stays inside, by bisection; -1 if even `a`
 *  doesn't. */
function bisect(inside: (s: number) => boolean): number {
  if (!inside(0)) return -1;
  if (inside(1)) return 1;
  let [lo, hi] = [0, 1];
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * A request held to the limits and the region: the yaw within its limit, the pitch within its range, and the distance
 * between the minimum (or the farthest, where that is nearer) and the farthest; then, outside the region, the yaw
 * turned toward straight on as far as it must, then the pitch toward its least, then the distance, each the least
 * change that brings the camera inside.
 */
export function clampOrbit(
  request: Orbit,
  focus: Vec3,
  limits: CameraLimits,
  region: CameraRegion,
  farthestDistance: number,
): Orbit {
  const lowest = Math.min(limits.minDistance, farthestDistance);
  let orbit: Orbit = {
    yaw: clamp(request.yaw, -limits.yaw, limits.yaw),
    pitch: clamp(request.pitch, limits.pitchMin, limits.pitchMax),
    distance: clamp(request.distance, lowest, farthestDistance),
  };
  const ok = (o: Orbit): boolean => inRegion(orbitPosition(focus, o), region);
  if (ok(orbit)) return orbit;
  // The yaw toward 0: the share of the way from 0 back to the requested yaw that stays inside.
  const yawShare = bisect((s) => ok({ ...orbit, yaw: orbit.yaw * s }));
  if (yawShare >= 0) return { ...orbit, yaw: orbit.yaw * yawShare };
  orbit = { ...orbit, yaw: 0 };
  const pitchFrom = limits.pitchMin;
  const pitchShare = bisect((s) => ok({ ...orbit, pitch: pitchFrom + (orbit.pitch - pitchFrom) * s }));
  if (pitchShare >= 0) return { ...orbit, pitch: pitchFrom + (orbit.pitch - pitchFrom) * pitchShare };
  orbit = { ...orbit, pitch: pitchFrom };
  for (const end of [farthestDistance, lowest]) {
    const share = bisect((s) => ok({ ...orbit, distance: end + (orbit.distance - end) * s }));
    if (share >= 0) return { ...orbit, distance: end + (orbit.distance - end) * share };
  }
  return orbit;
}

/** The follow camera on its orbit, with the production framing's lens, looking at the focus. */
export function followCamera(focus: Vec3, orbit: Orbit, base: Camera): Camera {
  return { fov: base.fov, near: base.near, far: base.far, position: orbitPosition(focus, orbit), target: focus };
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** A camera on its way from one to another, `elapsed` milliseconds in: eased over TRANSITION_MS while animating, the
 *  end itself from TRANSITION_MS on, and the end at once while not animating. */
export function blendCamera(from: Camera, to: Camera, elapsed: number, animate: boolean): Camera {
  if (!animate || elapsed >= TRANSITION_MS) return to;
  if (elapsed <= 0) return from;
  const t = easeInOut(elapsed / TRANSITION_MS);
  return {
    fov: from.fov + (to.fov - from.fov) * t,
    near: to.near,
    far: to.far,
    position: lerp(from.position, to.position, t),
    target: lerp(from.target, to.target, t),
  };
}
