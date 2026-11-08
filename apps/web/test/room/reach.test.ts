// T030 (spec 008; FR-033, Clarifications Q4; plan.md R-05): src/room/walk/reach.ts, what the figure walks up to and
// faces. Reach names the selectable one of whose members lies within the reach distance of the footprint's edge and
// within the cone either side of the figure's heading, measured on the floor's plane to the member's nearest point; the
// nearest such, ties going to scene order; or nothing. Synthetic targets take fx- IDs; and in the repository's room,
// every side-wall selectable, list-only at some stages, is reached from somewhere on the walkable floor.
import { describe, expect, it } from "vitest";

import { floorOfPart, isWalkable } from "../../src/room/compose/floor";
import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import { reach, reachTargets } from "../../src/room/walk/reach";
import type { ReachTarget } from "../../src/room/walk/reach";
import { repositoryBundle } from "../helpers/room";

const DEG = Math.PI / 180;
const OPTS = { reach: 0.8, cone: 60 * DEG, radius: 0.12 };
const rect = (x0: number, x1: number, z0: number, z1: number): FloorRect => ({ x0, x1, z0, z1 });
const pose = (x: number, z: number, headingDeg = 0) => ({ x, z, heading: headingDeg * DEG, speed: 0, walking: false });

describe("reach (FR-033)", () => {
  // A board straight ahead (−z) of the origin, its near edge 0.5 m away.
  const board: ReachTarget = { id: "fx-board", rects: [rect(-0.2, 0.2, -0.7, -0.5)] };

  it("names a member whose nearest point lies within the reach of the footprint's edge, and nothing beyond", () => {
    expect(reach(pose(0, 0), [board], OPTS)).toBe("fx-board");
    // 0.5 m to the near edge, less the radius 0.12: 0.38 within 0.8; 0.79 at 0.41 m back, and 0.81, beyond, at 0.43.
    expect(reach(pose(0, 0.41), [board], OPTS)).toBe("fx-board");
    expect(reach(pose(0, 0.43), [board], OPTS)).toBeNull();
  });

  it("names it only within the cone either side of the heading, measured to its nearest point", () => {
    expect(reach(pose(0, 0, 59), [board], OPTS)).toBe("fx-board");
    expect(reach(pose(0, 0, 61), [board], OPTS)).toBeNull();
    expect(reach(pose(0, 0, -59), [board], OPTS)).toBe("fx-board");
    expect(reach(pose(0, 0, 180), [board], OPTS)).toBeNull();
    // Off to the side, the nearest point is the board's corner: the cone is measured to it, not to the centre.
    const side = pose(0.8, 0, 50);
    const corner = Math.atan2(0.8 - 0.2, 0.5) / DEG; // about 50.2° from −z toward −x
    expect(corner).toBeGreaterThan(50);
    expect(reach(side, [board], OPTS)).toBe("fx-board");
  });

  it("counts a footprint standing on a member as within reach, whatever its heading", () => {
    const under: ReachTarget = { id: "fx-rug", rects: [rect(-1, 1, -1, 1)] };
    expect(reach(pose(0, 0, 180), [under], OPTS)).toBe("fx-rug");
  });

  it("names the nearest selectable, by any of its members, ties going to scene order", () => {
    const far: ReachTarget = { id: "fx-far", rects: [rect(-0.2, 0.2, -1.1, -0.9), rect(0.2, 0.3, -0.4, -0.35)] };
    const mid: ReachTarget = { id: "fx-mid", rects: [rect(-0.2, 0.2, -0.6, -0.5)] };
    // fx-far's second member, about 0.40 m off at about 30°, is nearer than fx-mid's 0.5 m.
    expect(reach(pose(0, 0), [mid, far], OPTS)).toBe("fx-far");
    const twin: ReachTarget = { id: "fx-twin", rects: [rect(-0.2, 0.2, -0.7, -0.5)] };
    expect(reach(pose(0, 0), [board, twin], OPTS)).toBe("fx-board");
    expect(reach(pose(0, 0), [twin, board], OPTS)).toBe("fx-twin");
  });

  it("names nothing with no target in reach, or none at all", () => {
    expect(reach(pose(0, 5), [board], OPTS)).toBeNull();
    expect(reach(pose(0, 0), [], OPTS)).toBeNull();
  });
});

describe("reach in the repository's room", () => {
  it("gives each selectable its members' floor-plane rectangles, in scene order", () => {
    const { scene, index } = repositoryBundle();
    const targets = reachTargets(scene, index);
    expect(targets.map((t) => t.id)).toEqual(index.selectables.map((s) => s.id));
    targets.forEach((t, i) => {
      const members = index.selectables[i]?.members ?? [];
      expect(t.rects).toHaveLength(members.length);
      t.rects.forEach((r, k) => {
        const box = scene.placements.find((p) => p.id === members[k])?.frame_box;
        expect(r).toEqual({ x0: box?.min[0], x1: box?.max[0], z0: box?.min[2], z1: box?.max[2] });
      });
    });
  });

  it("reaches every side-wall selectable, list-only at some stages, from somewhere on the walkable floor", () => {
    const { scene, index } = repositoryBundle();
    const w = scene.walking;
    const floor = floorOfPart(scene, w.radius_m) as WalkableFloor;
    const targets = reachTargets(scene, index);
    const opts = { reach: w.reach_m, cone: w.reach_cone_deg * DEG, radius: w.radius_m };
    const walls = index.selectables.filter((s) => s.side_wall).map((s) => s.id);
    expect(walls.length).toBeGreaterThan(0);
    const reached = new Set<string>();
    for (let x = floor.bounds.x0; x <= floor.bounds.x1; x += 0.02)
      for (let z = floor.bounds.z0; z <= floor.bounds.z1; z += 0.02) {
        if (!isWalkable(floor, x, z)) continue;
        for (let h = -180; h < 180; h += 15) {
          const id = reach(pose(x, z, h), targets, opts);
          if (id) reached.add(id);
        }
      }
    for (const id of walls) expect(reached.has(id), id).toBe(true);
  });
});
