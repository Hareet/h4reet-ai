// Reach (spec 008; FR-033, Clarifications Q4; plan.md R-05): in the walking view, the selectable the figure has walked
// up to and faces. Pure, on the floor's plane: for each selectable, the nearest point of each member's floor-plane
// rectangle to the figure's feet; within the reach distance of the footprint's edge and within the cone either side of
// the heading, measured to that point; the nearest selectable wins, ties going to scene order. A footprint standing on
// a member reaches it whatever its heading. Reach covers a side-wall selectable that spec 004's FR-064 leaves to the
// list at the production framing: it reads the floor, not the screen.
import type { RoomIndex, RoomScene } from "../compose/bundle";
import type { FloorRect } from "../compose/floor";
import type { Pose } from "./movement";

export interface ReachTarget {
  readonly id: string;
  /** Each member's floor-plane rectangle: its frame box's x and z extents. */
  readonly rects: readonly FloorRect[];
}

export interface ReachOptions {
  /** The reach distance from the footprint's edge, in metres. */
  readonly reach: number;
  /** The cone either side of the heading, in radians. */
  readonly cone: number;
  /** The footprint's radius. */
  readonly radius: number;
}

/** Each selectable of the index, in scene order, with its members' floor-plane rectangles from the 3D part. */
export function reachTargets(
  part: Pick<RoomScene, "placements">,
  index: Pick<RoomIndex, "selectables">,
): ReachTarget[] {
  const boxes = new Map<string, RoomScene["placements"][number]["frame_box"]>();
  for (const p of part.placements) if (!boxes.has(p.id)) boxes.set(p.id, p.frame_box);
  return index.selectables.map((s) => ({
    id: s.id,
    rects: s.members.flatMap((m) => {
      const box = boxes.get(m);
      return box ? [{ x0: box.min[0], x1: box.max[0], z0: box.min[2], z1: box.max[2] }] : [];
    }),
  }));
}

/** The selectable the figure reaches at its pose, or null. */
export function reach(
  pose: Pick<Pose, "x" | "z" | "heading">,
  targets: readonly ReachTarget[],
  options: ReachOptions,
): string | null {
  const [fx, fz] = [-Math.sin(pose.heading), -Math.cos(pose.heading)];
  let best: { id: string; distance: number } | null = null;
  for (const target of targets) {
    for (const r of target.rects) {
      const qx = Math.min(r.x1, Math.max(r.x0, pose.x));
      const qz = Math.min(r.z1, Math.max(r.z0, pose.z));
      const dx = qx - pose.x;
      const dz = qz - pose.z;
      const distance = Math.hypot(dx, dz);
      if (distance - options.radius > options.reach) continue;
      if (distance > 1e-9) {
        const cos = (dx * fx + dz * fz) / distance;
        if (Math.acos(Math.min(1, Math.max(-1, cos))) > options.cone) continue;
      }
      if (best === null || distance < best.distance) best = { id: target.id, distance };
    }
  }
  return best?.id ?? null;
}
