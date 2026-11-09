// The walkable floor (spec 008; FR-026, FR-027, FR-032, FR-058; plan.md R-04, R-11): where the visitor's figure may
// stand in the walking view, from the composed scene's frame boxes alone, so moving, adding, or removing a piece in the
// data moves, adds, or removes its obstacle with no source change (spec 004's FR-006). Pure and renderer-free, so the
// compositor's RW1 and the room's movement share it.
// - The figure's footprint is a circle about its feet; its centre stays inside `bounds`: the shell's floor less the
//   radius at its side walls and its back wall, and its front the open edge less the figure's half-depth, from its
//   frame box, so it can stand where the scene places it.
// - Every placement but the shell (the root, mounted on nothing) and the visitor's own figure whose frame box's
//   vertical extent meets the figure's height above its feet is an obstacle, by that rule and never by an ID: its
//   floor-plane extent grown by the radius, which the centre stays out of.
// - A point on an edge is walkable: the bounds are closed, the obstacles open.
import type { RoomScene } from "./bundle";
import type { Box } from "./framing";
import { origin } from "./math";
import { resolveMounts } from "./mount";
import type { Ray } from "./project";
import { planeHit } from "./project";

/** A rectangle on the floor's plane: x from x0 to x1, z from z0 to z1. */
export interface FloorRect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/** A placement, as the floor reads it: its ID, whether it's the room's root, and its frame box in the world. */
export interface FloorPlacement {
  readonly id: string;
  readonly root: boolean;
  readonly box: Box;
}

export interface WalkableFloor {
  readonly radius: number;
  /** The figure's feet's height: the floor's plane. */
  readonly feetY: number;
  /** The figure's height, from its frame box: what the obstacles' rule reads. */
  readonly height: number;
  /** The shell's floor: its side walls' inner faces (x0, x1), its back wall (z0), and its open front (z1). */
  readonly shell: FloorRect;
  /** Where the footprint's centre may go. */
  readonly bounds: FloorRect;
  /** Each obstacle, in scene order: its floor-plane extent grown by the radius. */
  readonly obstacles: readonly { readonly id: string; readonly rect: FloorRect }[];
  /** The figure's place in the scene, its feet: where walking starts and ends. */
  readonly start: { readonly x: number; readonly z: number };
}

/** The walkable floor from the scene's placements, the visitor figure's ID and its feet on the floor's plane, and the
 *  radius; null without a root or without the visitor. */
export function walkableFloor(
  placements: readonly FloorPlacement[],
  visitor: string,
  feet: readonly [x: number, z: number],
  radius: number,
): WalkableFloor | null {
  const root = placements.find((p) => p.root);
  const figure = placements.find((p) => p.id === visitor);
  if (!root || !figure) return null;
  const feetY = figure.box.min[1];
  const height = figure.box.max[1] - figure.box.min[1];
  const half = (figure.box.max[2] - figure.box.min[2]) / 2;
  const shell: FloorRect = { x0: root.box.min[0], x1: root.box.max[0], z0: root.box.min[2], z1: root.box.max[2] };
  const seen = new Set<string>();
  const obstacles: { id: string; rect: FloorRect }[] = [];
  for (const p of placements) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (p.root || p.id === visitor) continue;
    const { min, max } = p.box;
    if (!(min[1] < feetY + height && max[1] > feetY)) continue;
    obstacles.push({
      id: p.id,
      rect: { x0: min[0] - radius, x1: max[0] + radius, z0: min[2] - radius, z1: max[2] + radius },
    });
  }
  return {
    radius,
    feetY,
    height,
    shell,
    bounds: { x0: shell.x0 + radius, x1: shell.x1 - radius, z0: shell.z0 + radius, z1: shell.z1 - half },
    obstacles,
    start: { x: feet[0], z: feet[1] },
  };
}

/** The walkable floor of a 3D part at a radius: its placements' frame boxes, the root the placement mounted on
 *  nothing, and the visitor's feet from the kernel's mount resolver. */
export function floorOfPart(
  part: Pick<RoomScene, "placements" | "pieces" | "figures">,
  radius: number,
): WalkableFloor | null {
  const { world } = resolveMounts(part.placements, part.pieces);
  const m = world.get(part.figures.visitor);
  if (!m) return null;
  const feet = origin(m);
  return walkableFloor(
    part.placements.map((p) => ({ id: p.id, root: p.mount === null, box: p.frame_box })),
    part.figures.visitor,
    [feet[0], feet[2]],
    radius,
  );
}

const inside = (r: FloorRect, x: number, z: number): boolean => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

/** Whether the footprint's centre may stand at a point: inside the bounds, an edge included, and inside no obstacle. */
export function isWalkable(floor: WalkableFloor, x: number, z: number): boolean {
  const b = floor.bounds;
  if (!(x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1)) return false;
  return !floor.obstacles.some((o) => inside(o.rect, x, z));
}

/** The nearest edge a point's clearance is measured to: one of the floor's four bounds, or an obstacle's ID. */
export type FloorEdge = "left" | "right" | "back" | "front" | { readonly obstacle: string };

/** How far a walkable point is from the nearest edge of the walkable floor, the bounds' or an obstacle's, and which;
 *  0 or less, the edge it's in, where it isn't walkable. */
export function clearanceOf(floor: WalkableFloor, x: number, z: number): { distance: number; edge: FloorEdge } {
  const b = floor.bounds;
  if (!(x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1)) {
    const edge: FloorEdge = x < b.x0 ? "left" : x > b.x1 ? "right" : z < b.z0 ? "back" : "front";
    return { distance: -Math.max(b.x0 - x, x - b.x1, b.z0 - z, z - b.z1), edge };
  }
  let best: { distance: number; edge: FloorEdge } = { distance: x - b.x0, edge: "left" };
  for (const [distance, edge] of [
    [b.x1 - x, "right"],
    [z - b.z0, "back"],
    [b.z1 - z, "front"],
  ] as const)
    if (distance < best.distance) best = { distance, edge };
  for (const { id, rect } of floor.obstacles) {
    if (inside(rect, x, z)) return { distance: 0, edge: { obstacle: id } };
    const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
    const dz = Math.max(rect.z0 - z, 0, z - rect.z1);
    const distance = Math.hypot(dx, dz);
    if (distance < best.distance) best = { distance, edge: { obstacle: id } };
  }
  return best;
}

/** clearanceOf's distance. */
export function clearance(floor: WalkableFloor, x: number, z: number): number {
  return clearanceOf(floor, x, z).distance;
}

/** Where a ray meets the floor's plane inside the shell's floor rectangle, its edges included: a click's walk goal
 *  (FR-032); null off the floor, a wall or the backdrop. */
export function floorPoint(floor: WalkableFloor, ray: Ray): readonly [x: number, z: number] | null {
  const hit = planeHit(ray, floor.feetY);
  if (!hit) return null;
  const [x, z] = hit;
  const s = floor.shell;
  return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 ? hit : null;
}
