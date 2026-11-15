// RI12 (spec 028; FR-022; plan.md R-B4): the dinosaur's scene's placement and points against the room's floors. The
// schema holds the block's shape and its speeds (RD2, RD3); here:
// - `takes` SHALL name a placement of the scene (the bicycle's);
// - the path's last point SHALL be outside the shell's floor (compose/floor.ts's `shell`: the side walls' inner faces,
//   the back wall, the open front), so the figures leave the room before they are hidden;
// - `meet` and `under_bicycle` SHALL be on spec 025's chase floor (the visitor's walkable floor with the twin's own
//   obstacle left out), where the twin and the dog can stand.
// One finding a point, at its path; no reason holds a value from the data. Without a geometry, a visitor, or a twin,
// nothing is judged: RI8's or RG's finding is the one to fix.
import { isWalkable, walkableFloor } from "../../../src/room/compose/floor";
import type { FloorRect } from "../../../src/room/compose/floor";
import { origin } from "../../../src/room/compose/math";
import { chaseFloor } from "../../../src/room/scene/chase-steer";
import type { Context } from "./family";
import { geometryOf } from "./rg";

const insideRect = (r: FloorRect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** RI12: the leave block's last path point inside the shell's floor, or its meeting or bicycle point off the chase
 *  floor. */
export function leave(ctx: Context): void {
  const scene = ctx.room.scene;
  const block = scene?.value.figures.leave;
  if (!scene || !block) return;
  const g = geometryOf(ctx);
  if (!g) return;
  const s = scene.value;
  const visitor = s.placements.find((p) => p.role === "visitor");
  const twin = s.placements.find((p) => p.role === "twin");
  const world = visitor && g.resolved.world.get(visitor.id);
  if (!visitor || !twin || !world) return;
  const feet = origin(world);
  const placements = s.placements.flatMap((p) => {
    const box = g.boxes.get(p.id);
    return box ? [{ id: p.id, root: p.mount === undefined, box }] : [];
  });
  const floor = walkableFloor(placements, visitor.id, [feet[0], feet[2]], s.walking.radius_m);
  if (!floor) return;
  const chase = chaseFloor(floor, twin.id);
  const ri12 = (path: string, reason: string): void => ctx.report("RI12", scene.file, path, reason);
  if (!s.placements.some((p) => p.id === block.takes))
    ri12(ctx.path("figures", "leave", "takes"), "no placement of the scene by that ID: nothing to take");
  const last = block.path.length - 1;
  const end = block.path[last];
  if (end && insideRect(floor.shell, end[0], end[1]))
    ri12(
      ctx.path("figures", "leave", "path", last),
      "the path's last point is inside the shell's floor: the figures would be hidden in the room",
    );
  for (const key of ["meet", "under_bicycle"] as const) {
    const [x, z] = block[key];
    if (!isWalkable(chase, x, z))
      ri12(ctx.path("figures", "leave", key), "a point off the chase floor: past its bounds or inside an obstacle");
  }
}
