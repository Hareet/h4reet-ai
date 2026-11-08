// T027 (spec 008; FR-026, FR-027, SC-003, SC-006; plan.md R-04): src/room/compose/floor.ts, the walkable floor and its
// obstacles, which the walking view's movement and the compositor's RW1 share.
// - The obstacles by rule, never by ID: every placement but the shell (the root) and the visitor's own figure whose
//   frame box's vertical extent meets the figure's height above its feet, its floor-plane extent grown by the radius.
//   The test finds the twin, the desk, and the pieces on the floor and the walls by that same rule, independently.
// - The bounds: the shell's floor, less the radius at its walls and back, its front the open edge less the figure's
//   half-depth, so the figure can stand where the scene places it.
// - The default scene's walkable strip in front of the desk, the figure's start on it.
// - Data copies with the desk, the twin, and the snowboard moved: their obstacles follow, with no source change.
// Every ID is read from the composed bundle; the three moved pieces are found by structure: the placement most others
// mount on, the twin by its role, and the side-wall selectable that stands on the floor.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree, overlayTree } from "../../build/room/source";
import type { RoomScene } from "../../src/room/compose/bundle";
import { clearance, floorOfPart, isWalkable, walkableFloor } from "../../src/room/compose/floor";
import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import { origin } from "../../src/room/compose/math";
import { resolveMounts } from "../../src/room/compose/mount";
import { REPO, repositoryBundle } from "../helpers/room";

const RADIUS = 0.12;
const part = (): RoomScene => repositoryBundle().scene;

/** The obstacles by the rule, computed here apart from floor.ts: their IDs and grown rectangles. */
function expectedObstacles(scene: RoomScene, radius: number): { id: string; rect: FloorRect }[] {
  const visitor = scene.placements.find((p) => p.id === scene.figures.visitor);
  if (!visitor) throw new Error("no visitor");
  const feetY = visitor.frame_box.min[1];
  const height = visitor.frame_box.max[1] - visitor.frame_box.min[1];
  const seen = new Set<string>();
  return scene.placements.flatMap((p) => {
    if (seen.has(p.id)) return [];
    seen.add(p.id);
    if (p.mount === null || p.id === scene.figures.visitor) return [];
    const { min, max } = p.frame_box;
    if (!(min[1] < feetY + height && max[1] > feetY)) return [];
    return [{ id: p.id, rect: { x0: min[0] - radius, x1: max[0] + radius, z0: min[2] - radius, z1: max[2] + radius } }];
  });
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9;
const rectNear = (a: FloorRect, b: FloorRect): boolean =>
  near(a.x0, b.x0) && near(a.x1, b.x1) && near(a.z0, b.z0) && near(a.z1, b.z1);

describe("the walkable floor of the repository's room (FR-026, R-04)", () => {
  it("takes as obstacles every placement within the figure's height but the shell and the visitor, by rule", () => {
    const scene = part();
    const floor = floorOfPart(scene, RADIUS);
    if (!floor) throw new Error("no floor");
    const expected = expectedObstacles(scene, RADIUS);
    expect(floor.obstacles.map((o) => o.id)).toEqual(expected.map((o) => o.id));
    floor.obstacles.forEach((o, i) => expect(rectNear(o.rect, expected[i]?.rect as FloorRect), o.id).toBe(true));
    const ids = new Set(floor.obstacles.map((o) => o.id));
    // The twin and the placement most others mount on (the desk) are obstacles; the shell and the visitor aren't.
    expect(ids.has(scene.figures.twin)).toBe(true);
    expect(ids.has(scene.figures.visitor)).toBe(false);
    const root = scene.placements.find((p) => p.mount === null);
    expect(ids.has(root?.id ?? "")).toBe(false);
    const counts = new Map<string, number>();
    for (const p of scene.placements) if (p.mount) counts.set(p.mount.on, (counts.get(p.mount.on) ?? 0) + 1);
    const hub = [...counts].filter(([id]) => id !== root?.id).sort((a, b) => b[1] - a[1])[0]?.[0];
    expect(ids.has(hub ?? "")).toBe(true);
    // A piece hung above the figure's head is no obstacle.
    const above = scene.placements.filter((p) => p.frame_box.min[1] >= floor.feetY + floor.height);
    expect(above.length).toBeGreaterThan(0);
    for (const p of above) expect(ids.has(p.id), p.id).toBe(false);
  });

  it("bounds the centre by the walls less the radius, and the open edge less the figure's half-depth", () => {
    const scene = part();
    const floor = floorOfPart(scene, RADIUS);
    if (!floor) throw new Error("no floor");
    const shell = scene.placements.find((p) => p.mount === null)?.frame_box;
    const visitor = scene.placements.find((p) => p.id === scene.figures.visitor)?.frame_box;
    if (!shell || !visitor) throw new Error("no shell or visitor");
    expect(rectNear(floor.shell, { x0: shell.min[0], x1: shell.max[0], z0: shell.min[2], z1: shell.max[2] })).toBe(
      true,
    );
    const half = (visitor.max[2] - visitor.min[2]) / 2;
    expect(
      rectNear(floor.bounds, {
        x0: shell.min[0] + RADIUS,
        x1: shell.max[0] - RADIUS,
        z0: shell.min[2] + RADIUS,
        z1: shell.max[2] - half,
      }),
    ).toBe(true);
    expect(floor.radius).toBe(RADIUS);
  });

  it("starts the figure at its feet in the scene, on the walkable floor, with room around it", () => {
    const scene = part();
    const floor = floorOfPart(scene, RADIUS) as WalkableFloor;
    const { world } = resolveMounts(scene.placements, scene.pieces);
    const at = world.get(scene.figures.visitor);
    if (!at) throw new Error("no visitor in the world");
    const feet = origin(at);
    expect(near(floor.start.x, feet[0]) && near(floor.start.z, feet[2])).toBe(true);
    expect(isWalkable(floor, floor.start.x, floor.start.z)).toBe(true);
    expect(clearance(floor, floor.start.x, floor.start.z)).toBeGreaterThan(0);
  });

  it("leaves a strip in front of the hub piece, and nothing inside an obstacle or past the bounds", () => {
    const scene = part();
    const floor = floorOfPart(scene, RADIUS) as WalkableFloor;
    // Every grown obstacle's inside is refused, its edge allowed.
    for (const { rect } of floor.obstacles) {
      const cx = (rect.x0 + rect.x1) / 2;
      const cz = (rect.z0 + rect.z1) / 2;
      expect(isWalkable(floor, cx, cz)).toBe(false);
      expect(clearance(floor, cx, cz)).toBeLessThanOrEqual(0);
    }
    expect(isWalkable(floor, floor.bounds.x0 - 1e-6, floor.start.z)).toBe(false);
    expect(isWalkable(floor, floor.start.x, floor.bounds.z1 + 1e-6)).toBe(false);
    // The strip: points just in front of the obstacle the start faces are walkable across most of the room's width.
    const front = Math.max(...floor.obstacles.filter((o) => o.rect.z1 < floor.start.z).map((o) => o.rect.z1));
    const z = (front + floor.bounds.z1) / 2;
    const xs = Array.from({ length: 41 }, (_, i) => floor.bounds.x0 + ((floor.bounds.x1 - floor.bounds.x0) * i) / 40);
    const open = xs.filter((x) => isWalkable(floor, x, z));
    expect(open.length).toBeGreaterThan(10);
    expect(floor.bounds.z1 - front).toBeGreaterThan(0.1);
  });

  it("is none without a root or without the visitor", () => {
    const box = { min: [0, 0, 0], max: [1, 1, 1] } as const;
    expect(walkableFloor([{ id: "fx-a", root: false, box }], "fx-a", [0.5, 0.5], RADIUS)).toBeNull();
    expect(walkableFloor([{ id: "fx-shell", root: true, box }], "fx-visitor", [0.5, 0.5], RADIUS)).toBeNull();
  });
});

// --------------------------------------------------------------------------------------------------------------------
// Data copies with pieces moved (FR-027, SC-006)
// --------------------------------------------------------------------------------------------------------------------
const encoder = new TextEncoder();
const SCENE = "apps/web/room/scene.yaml";
type SceneDoc = {
  placements: { id: string; role?: string; mount?: { on: string; anchor: string; offset?: number[] } }[];
};

/** The committed scene with one placement's mount offset moved, composed strict with drafts, as a data edit. */
function moved(
  find: (doc: SceneDoc, scene: RoomScene) => string,
  by: readonly [number, number, number],
): {
  id: string;
  result: ComposeResult;
} {
  const doc = parse(readFileSync(join(REPO, SCENE), "utf8")) as SceneDoc;
  const id = find(doc, part());
  const p = doc.placements.find((x) => x.id === id);
  if (!p?.mount) throw new Error(`no mount for the moved placement`);
  const offset = p.mount.offset ?? [0, 0, 0];
  p.mount.offset = offset.map((v, i) => Math.round((v + (by[i] ?? 0)) * 1e4) / 1e4);
  const tree = overlayTree(fileTree(REPO), new Map([[SCENE, encoder.encode(stringify(doc, { lineWidth: 0 }))]]));
  const policy = readRoomPolicy({ env: process.env, root: REPO });
  return { id, result: compose(tree, policy, { mode: "strict", drafts: true }) };
}

const hub = (doc: SceneDoc): string => {
  const root = doc.placements.find((p) => !p.mount)?.id;
  const counts = new Map<string, number>();
  for (const p of doc.placements)
    if (p.mount && p.mount.on !== root) counts.set(p.mount.on, (counts.get(p.mount.on) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};
const twin = (doc: SceneDoc): string => doc.placements.find((p) => p.role === "twin")?.id ?? "";
const standingBoard = (_doc: SceneDoc, scene: RoomScene): string => {
  const index = repositoryBundle().index;
  const onFloor = index.selectables
    .filter((s) => s.side_wall)
    .flatMap((s) => s.members)
    .find((m) => (scene.placements.find((p) => p.id === m)?.frame_box.min[1] ?? 1) <= 1e-6);
  return onFloor ?? "";
};

describe("the walkable floor follows the data (FR-027, SC-006)", () => {
  it.each([
    ["the hub piece, 5 cm to the left", hub, [-0.05, 0, 0]],
    ["the twin, 5 cm to the left", twin, [-0.05, 0, 0]],
    ["the side-wall piece standing on the floor, 5 cm along its wall", standingBoard, [-0.05, 0, 0]],
  ] as const)("moves its obstacle with %s, with no RW1 refusal and no source file changed", (_, find, by) => {
    const { id, result } = moved(find, by);
    expect(id).not.toBe("");
    expect(result.findings.filter((f) => f.rule === "RW1").map((f) => formatFinding(f))).toEqual([]);
    const floor = floorOfPart(result.scene, result.scene.walking.radius_m) as WalkableFloor;
    const expected = expectedObstacles(result.scene, result.scene.walking.radius_m);
    const mine = floor.obstacles.find((o) => o.id === id);
    const want = expected.find((o) => o.id === id);
    expect(mine && want && rectNear(mine.rect, want.rect)).toBe(true);
    const before = (floorOfPart(part(), RADIUS) as WalkableFloor).obstacles.find((o) => o.id === id);
    expect(before && mine && rectNear(before.rect, mine.rect)).toBe(false);
    expect(isWalkable(floor, floor.start.x, floor.start.z)).toBe(true);
  });
});
