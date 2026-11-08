// The figure's steps (spec 008; FR-025, FR-026, FR-028, FR-032; plan.md R-03): pure and deterministic, on the walkable
// floor (compose/floor.ts), so seeded walks test it whole.
// - The pose is the figure's place on the floor, its heading, its speed, and whether it walks: what movement gives and
//   what a figure driver shows (scene/figure.ts). A heading h faces (−sin h, −cos h) on the floor, three.js's rotation
//   about +Y: 0 faces into the room, along −z.
// - A step moves relative to the camera's yaw ψ, along the floor: forward is away from the camera, (−sin ψ, −cos ψ),
//   and right is (cos ψ, −sin ψ). A diagonal walks at the walking speed, not faster. The figure faces the way it walks;
//   with no input it stops at once, keeping its heading.
// - A frame's time is cut into steps of at most STEP_S, each moving along x, then along z, each clamped to the nearest
//   edge in its way, so a blocked diagonal slides and nothing tunnels through a thin obstacle, whatever the frame time.
// - Walk-to, a floor click or tap, walks straight toward its goal at the walking speed, sliding, and ends on arrival,
//   or STALL_S after its last progress; another input ends it in the orchestrator (scene/walking.ts).
import type { FloorRect, WalkableFloor } from "../compose/floor";

export interface Pose {
  readonly x: number;
  readonly z: number;
  /** Radians about +Y; 0 faces into the room (−z). */
  readonly heading: number;
  /** Metres a second, what the last step moved. */
  readonly speed: number;
  readonly walking: boolean;
}

/** The input's direction in the camera's frame: forward and right, each −1 to 1. */
export interface Move {
  readonly forward: number;
  readonly right: number;
}

/** A walk toward a floor point: its goal, the nearest it has come, and the seconds since it last came nearer. */
export interface WalkTo {
  readonly goal: { readonly x: number; readonly z: number };
  readonly best: number;
  readonly since: number;
}

/** The longest step a frame's time is cut into, in seconds. */
export const STEP_S = 0.05;
/** How long a walk-to goes on without progress before it ends, in seconds (FR-032). */
export const STALL_S = 0.5;
/** How near a walk-to's goal counts as arrived, in metres. */
export const ARRIVE_M = 0.01;

/** The figure at its place in the scene, facing into the room, still. */
export function startPose(floor: WalkableFloor): Pose {
  return { x: floor.start.x, z: floor.start.z, heading: 0, speed: 0, walking: false };
}

/** The heading that faces a direction on the floor. */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

const blocks = (r: FloorRect, along: "x" | "z", at: number): boolean =>
  along === "x" ? at > r.z0 && at < r.z1 : at > r.x0 && at < r.x1;

/** How far a point may move along one axis, by `d`, before the bounds or an obstacle's grown edge stops it. */
function clampAxis(floor: WalkableFloor, x: number, z: number, axis: "x" | "z", d: number): number {
  const b = floor.bounds;
  const from = axis === "x" ? x : z;
  const cross = axis === "x" ? z : x;
  let to = from + d;
  if (d > 0) {
    to = Math.min(to, axis === "x" ? b.x1 : b.z1);
    for (const { rect } of floor.obstacles) {
      const edge = axis === "x" ? rect.x0 : rect.z0;
      if (blocks(rect, axis, cross) && edge >= from && edge < to) to = edge;
    }
    return Math.max(from, to);
  }
  if (d < 0) {
    to = Math.max(to, axis === "x" ? b.x0 : b.z0);
    for (const { rect } of floor.obstacles) {
      const edge = axis === "x" ? rect.x1 : rect.z1;
      if (blocks(rect, axis, cross) && edge <= from && edge > to) to = edge;
    }
    return Math.min(from, to);
  }
  return from;
}

/** A move by (dx, dz), x then z, each clamped: the slide. */
export function slide(floor: WalkableFloor, x: number, z: number, dx: number, dz: number): [number, number] {
  const nx = clampAxis(floor, x, z, "x", dx);
  const nz = clampAxis(floor, nx, z, "z", dz);
  return [nx, nz];
}

/** A distance moved over dt, cut into steps of at most STEP_S, each along a unit direction. */
function travel(floor: WalkableFloor, x: number, z: number, ux: number, uz: number, distance: number, dt: number) {
  const steps = Math.max(1, Math.ceil(dt / STEP_S));
  let [px, pz] = [x, z];
  for (let i = 0; i < steps; i += 1) [px, pz] = slide(floor, px, pz, (ux * distance) / steps, (uz * distance) / steps);
  return [px, pz] as const;
}

/** One frame's step by the input, relative to the camera's yaw, at the walking speed. */
export function step(floor: WalkableFloor, pose: Pose, move: Move, cameraYaw: number, dt: number, speed: number): Pose {
  const [fx, fz] = [-Math.sin(cameraYaw), -Math.cos(cameraYaw)];
  const [rx, rz] = [Math.cos(cameraYaw), -Math.sin(cameraYaw)];
  let vx = move.forward * fx + move.right * rx;
  let vz = move.forward * fz + move.right * rz;
  const length = Math.hypot(vx, vz);
  if (!(length > 1e-9) || !(dt > 0)) return { ...pose, speed: 0, walking: false };
  if (length > 1) [vx, vz] = [vx / length, vz / length];
  const magnitude = Math.min(1, length);
  const [x, z] = travel(floor, pose.x, pose.z, vx / magnitude, vz / magnitude, magnitude * speed * dt, dt);
  const moved = Math.hypot(x - pose.x, z - pose.z);
  return { x, z, heading: headingOf(vx, vz), speed: moved / dt, walking: moved > 1e-12 };
}

/** One frame of a walk toward its goal: the pose, and the walk going on, or null once it has ended. */
export function walkTo(
  floor: WalkableFloor,
  pose: Pose,
  walk: WalkTo,
  dt: number,
  speed: number,
): { pose: Pose; walk: WalkTo | null } {
  const dx = walk.goal.x - pose.x;
  const dz = walk.goal.z - pose.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= ARRIVE_M) return { pose: { ...pose, speed: 0, walking: false }, walk: null };
  const reach = Math.min(distance, speed * Math.max(0, dt));
  const [x, z] = travel(floor, pose.x, pose.z, dx / distance, dz / distance, reach, dt);
  const moved = Math.hypot(x - pose.x, z - pose.z);
  const left = Math.hypot(walk.goal.x - x, walk.goal.z - z);
  const progress = left < Math.min(walk.best, distance) - 1e-6;
  const since = progress ? 0 : walk.since + dt;
  const next: Pose = {
    x,
    z,
    heading: headingOf(dx, dz),
    speed: dt > 0 ? moved / dt : 0,
    walking: moved > 1e-12,
  };
  if (left <= ARRIVE_M || since >= STALL_S) return { pose: { ...next, walking: false }, walk: null };
  return { pose: next, walk: { goal: walk.goal, best: Math.min(walk.best, left), since } };
}
