// T-B03 (spec 028; FR-021, FR-022; Q13; plan.md R-B4): the dinosaur's scene's data, `figures.leave`.
// - The composed points the block is placed against, printed for plan §R-B4's record: the twin's home, the bicycle's
//   place and its floor point (its frame box's foot, on the floor plane), the shell's floor, and the chase floor's
//   bounds; then the shipped block itself: `meet` and `under_bicycle` walkable on the chase floor, the path's last
//   point outside the shell, the speeds positive.
// - The bundle carries the block resolved, each figure to 1e-6; absent, the bundle carries none.
// - The build refuses (RI12) a last point inside the shell's floor, and a `meet` or `under_bicycle` off the chase floor
//   (spec 025's, the visitor's walkable floor less the twin's obstacle); the schema (RD3) a speed or `take_s` not
//   positive, a path of under two points; RD2 a key the block doesn't define.
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree, overlayTree } from "../../build/room/source";
import type { RoomScene } from "../../src/room/compose/bundle";
import { floorOfPart, isWalkable } from "../../src/room/compose/floor";
import { origin } from "../../src/room/compose/math";
import { resolveMounts } from "../../src/room/compose/mount";
import { chaseFloor } from "../../src/room/scene/chase-steer";
import { REPO, repositoryBundle } from "../helpers/room";
import { placementLabelled } from "../helpers/room-ids";

const SCENE_PATH = "apps/web/room/scene.yaml";
type Doc = Record<string, unknown>;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** The repository's room, its scene's `figures.leave` replaced (null removes it), composed strictly. */
const composed = new Map<string, ComposeResult>();
function withLeave(leave: unknown): ComposeResult {
  const key = JSON.stringify(leave);
  const hit = composed.get(key);
  if (hit) return hit;
  const base = fileTree(REPO);
  const doc = parse(new TextDecoder().decode(base.read(SCENE_PATH) ?? new Uint8Array())) as Doc;
  const figures = { ...(doc.figures as Doc) };
  if (leave === null) delete figures.leave;
  else figures.leave = JSON.parse(JSON.stringify(leave)) as unknown;
  doc.figures = figures;
  const tree = overlayTree(base, new Map([[SCENE_PATH, new TextEncoder().encode(stringify(doc))]]));
  const result = compose(tree, readRoomPolicy({ env: {}, root: REPO }), { mode: "strict", drafts: false });
  composed.set(key, result);
  return result;
}
const seen = (r: ComposeResult): string[] =>
  r.findings.filter((f) => f.file === SCENE_PATH).map((f) => `${f.rule} ${f.path}`);

/** The composed points of the repository's room. */
function points(part: RoomScene) {
  const world = resolveMounts(part.placements, part.pieces).world;
  const twinAt = origin(world.get(part.figures.twin)!);
  const bicycleId = placementLabelled("Bicycle");
  const bicycle = part.placements.find((p) => p.id === bicycleId)!;
  const bicycleAt = origin(world.get(bicycleId)!);
  const visitor = floorOfPart(part, part.walking.radius_m)!;
  const chase = chaseFloor(visitor, part.figures.twin);
  return { twinAt, bicycle, bicycleAt, visitor, chase };
}

/** A block placed by the composed points (plan.md R-B4's record: `under_bicycle` in front of the desk, short of the
 *  bicycle's obstacle), as the shipped one is; each test changes one thing of it. */
const GOOD = {
  meet: [0.42, 0.45],
  under_bicycle: [0.74, 0.52],
  carry: [0.3, 0.26, 0.05],
  path: [
    [0.8, 0.75],
    [1.3, 0.9],
    [1.7, 0.9],
  ],
  dog_mps: 1.2,
  walk_mps: 1.0,
  take_s: 0.8,
};

describe("the composed points (plan.md R-B4's record)", () => {
  it("prints the twin's home, the bicycle's place and floor point, the shell's floor, and the chase floor", () => {
    const part = repositoryBundle().scene;
    const { twinAt, bicycle, bicycleAt, visitor, chase } = points(part);
    const box = bicycle.frame_box;
    const record = {
      twin_home: [r3(twinAt[0]), r3(twinAt[2])],
      bicycle_origin: bicycleAt.map(r3),
      bicycle_box_floor: { x: [r3(box.min[0]), r3(box.max[0])], z: [r3(box.min[2]), r3(box.max[2])] },
      shell_floor: visitor.shell,
      chase_bounds: chase.bounds,
      chase_obstacles: chase.obstacles.map((o) => o.rect),
      start: visitor.start,
      dog_home: part.figures.dog?.home.at ?? null,
    };
    process.stdout.write(`T-B03 composed points: ${JSON.stringify(record)}\n`);
    expect(twinAt.every(Number.isFinite)).toBe(true);
    expect(bicycleAt.every(Number.isFinite)).toBe(true);
  });
});

describe("the shipped figures.leave (FR-021, FR-022)", () => {
  const part = repositoryBundle().scene;
  const { visitor, chase } = points(part);
  const leave = part.figures.leave;

  it("is in the bundle, resolved", () => {
    expect(leave).toBeDefined();
  });

  it("puts meet and under_bicycle on the chase floor, and the path's last point outside the shell", () => {
    if (!leave) throw new Error("no leave block");
    expect(isWalkable(chase, leave.meet[0], leave.meet[1])).toBe(true);
    expect(isWalkable(chase, leave.under_bicycle[0], leave.under_bicycle[1])).toBe(true);
    const last = leave.path.at(-1)!;
    const s = visitor.shell;
    const inside = last[0] >= s.x0 && last[0] <= s.x1 && last[1] >= s.z0 && last[1] <= s.z1;
    expect(inside).toBe(false);
    expect(leave.dog_mps).toBeGreaterThan(0);
    expect(leave.walk_mps).toBeGreaterThan(0);
    expect(leave.take_s).toBeGreaterThan(0);
  });

  it("leaves the twin's and the bicycle's placements as they are (FR-023)", () => {
    const without = withLeave(null).scene;
    expect(without.placements).toEqual(part.placements);
    expect(without.figures.leave).toBeUndefined();
  });
});

describe("the build's refusals (FR-022; RI12, RD3, RD2)", () => {
  it("takes a good block whole, into the bundle to 1e-6", () => {
    const r = withLeave(GOOD);
    expect(seen(r)).toEqual([]);
    expect(r.scene.figures.leave).toEqual(GOOD);
  });

  it("refuses a path whose last point is inside the shell's floor", () => {
    const r = withLeave({ ...GOOD, path: [GOOD.path[0], [0.5, 0.3]] });
    expect(seen(r)).toContain("RI12 figures.leave.path[1]");
  });

  it("refuses a meet off the chase floor, and an under_bicycle off it", () => {
    expect(seen(withLeave({ ...GOOD, meet: [3, 0.2] }))).toContain("RI12 figures.leave.meet");
    expect(seen(withLeave({ ...GOOD, under_bicycle: [0.4, -3] }))).toContain("RI12 figures.leave.under_bicycle");
  });

  it.each([
    ["dog_mps", 0],
    ["walk_mps", -1],
    ["take_s", 0],
  ])("refuses a %s of %s with RD3", (key, value) => {
    expect(seen(withLeave({ ...GOOD, [key]: value }))).toContain(`RD3 figures.leave.${key}`);
  });

  it("refuses a path of one point with RD3, and a key the block doesn't define with RD2", () => {
    expect(seen(withLeave({ ...GOOD, path: [[1.6, 0.9]] }))).toContain("RD3 figures.leave.path");
    expect(seen(withLeave({ ...GOOD, door: 1 }))).toContain("RD2 figures.leave.door");
  });
});
