// T-A01 (spec 028; FR-005; Q3; plan.md §R-A1): the wall box, the rectangle the room's shell shows on screen. It is the
// near face of the shell's frame box (the placement mounted on nothing, as compose/floor.ts finds it), projected at the
// room's framing for the frame area, in the window's CSS pixels: a pure function of the composed bundle and an area,
// with no DOM and no three.js, which the room and the compositor share (spec 014's FR-016). Checked here on the
// compositor's known-good fixture and on the room's own scene.yaml, against the four corners projected by the kernel's
// own camera, independently of wall.ts's code.
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomScene } from "../../src/room/compose/bundle";
import { framing } from "../../src/room/compose/framing";
import type { Box as WorldBox } from "../../src/room/compose/framing";
import type { Box } from "../../src/room/compose/hud";
import { project, toStage } from "../../src/room/compose/project";
import { flatProtectorFor, protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import { FLAT_VIEW, flatPlacement } from "../../src/room/compose/stages";
import { wallBox, wallSceneOf } from "../../src/room/compose/wall";
import { repositoryBundle } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

const fixture = (): RoomScene => compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }).scene;
const room = (): RoomScene => repositoryBundle().scene;
const must = (b: Box | null): Box => {
  if (!b) throw new Error("no wall box");
  return b;
};

/** The four corners of a box's near face (its largest z), projected at the framing for the area, in window pixels. */
function corners(shell: WorldBox, framed: readonly WorldBox[], area: Box): [number, number][] {
  const camera = framing(area.w / area.h, framed);
  const out: [number, number][] = [];
  for (const x of [shell.min[0], shell.max[0]])
    for (const y of [shell.min[1], shell.max[1]]) {
      const [px, py] = toStage(project([x, y, shell.max[2]], camera, area.w / area.h), { w: area.w, h: area.h });
      out.push([area.x + px, area.y + py]);
    }
  return out;
}

const AREAS: readonly Box[] = [
  { x: 368, y: 27.5, w: 1264, h: 1052.5 },
  { x: 0, y: 0, w: 1920, h: 1080 },
  { x: 40, y: 60, w: 600, h: 900 },
  { x: 368, y: 27.5, w: 1904, h: 1412.5 },
  { x: 10, y: 20, w: 320, h: 250 },
];

for (const [name, part] of [
  ["the known-good fixture", fixture],
  ["the room's own scene.yaml", room],
] as const) {
  describe(`the wall box on ${name} (FR-005)`, () => {
    it("reads the shell, the placement mounted on nothing, and the framed placements' boxes", () => {
      const p = part();
      const scene = wallSceneOf(p);
      if (!scene) throw new Error("no wall scene");
      const roots = p.placements.filter((q) => q.mount === null);
      expect(roots).toHaveLength(1);
      expect(scene.shell).toEqual(roots[0]?.frame_box);
      expect(scene.framed).toEqual(p.placements.filter((q) => q.framed).map((q) => q.frame_box));
    });

    it("is the near face's four corners projected at the framing, in the window's pixels", () => {
      const scene = wallSceneOf(part());
      if (!scene) throw new Error("no wall scene");
      for (const area of AREAS) {
        const c = corners(scene.shell, scene.framed, area);
        const xs = c.map((q) => q[0]);
        const ys = c.map((q) => q[1]);
        const want = {
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs),
          h: Math.max(...ys) - Math.min(...ys),
        };
        const got = must(wallBox(scene, area));
        for (const k of ["x", "y", "w", "h"] as const)
          expect(got[k], `${k} at ${JSON.stringify(area)}`).toBeCloseTo(want[k], 6);
        // The camera looks straight down −Z: the face is an upright rectangle, its corners on two columns and two rows.
        expect(new Set(xs.map((x) => x.toFixed(6))).size).toBe(2);
        expect(new Set(ys.map((y) => y.toFixed(6))).size).toBe(2);
      }
    });

    it("lies inside the frame area it is framed into", () => {
      const scene = wallSceneOf(part());
      if (!scene) throw new Error("no wall scene");
      for (const area of AREAS) {
        const w = must(wallBox(scene, area));
        expect(w.x).toBeGreaterThanOrEqual(area.x - 1e-6);
        expect(w.y).toBeGreaterThanOrEqual(area.y - 1e-6);
        expect(w.x + w.w).toBeLessThanOrEqual(area.x + area.w + 1e-6);
        expect(w.y + w.h).toBeLessThanOrEqual(area.y + area.h + 1e-6);
        expect(w.w).toBeGreaterThan(0);
        expect(w.h).toBeGreaterThan(0);
      }
    });

    it("is recomputed on a resize: a new area gives its own box, the same area the same one", () => {
      const scene = wallSceneOf(part());
      if (!scene) throw new Error("no wall scene");
      const before = must(wallBox(scene, { x: 368, y: 27.5, w: 1264, h: 1052.5 }));
      const again = must(wallBox(scene, { x: 368, y: 27.5, w: 1264, h: 1052.5 }));
      const after = must(wallBox(scene, { x: 368, y: 27.5, w: 1904, h: 1412.5 }));
      expect(again).toEqual(before);
      expect(after).not.toEqual(before);
      // Centred on the area's middle, which the camera's x = 0 looks through.
      for (const [w, area] of [
        [before, { x: 368, w: 1264 }],
        [after, { x: 368, w: 1904 }],
      ] as const)
        expect(w.x + w.w / 2).toBeCloseTo(area.x + area.w / 2, 6);
    });
  });
}

describe("the wall box through the frame area's protector (FR-005, FR-010)", () => {
  it("is the 3D protector's, from the bundle the room has at run time, so the room and the compositor agree", () => {
    const { scene, index } = repositoryBundle();
    const protect = protectorFor(protectSceneOf(scene, index));
    const ws = wallSceneOf(scene);
    if (!ws || !protect.wall) throw new Error("no wall");
    for (const area of AREAS) expect(protect.wall(area)).toEqual(wallBox(ws, area));
  });

  it("is none where the bundle has no shell: the protector of an older scene input gives no wall", () => {
    const { scene, index } = repositoryBundle();
    const { shell: _shell, ...older } = protectSceneOf(scene, index);
    const protect = protectorFor(older);
    expect(protect.wall?.({ x: 0, y: 0, w: 800, h: 600 }) ?? null).toBeNull();
  });

  it("is the 2D drawing's placed view box in the 2D protector: the room as the drawing shows it", () => {
    const protect = flatProtectorFor(repositoryBundle().index);
    if (!protect.wall) throw new Error("no wall");
    for (const area of AREAS) {
      const p = flatPlacement(area);
      expect(protect.wall(area)).toEqual({ x: p.x, y: p.y, w: FLAT_VIEW.w * p.scale, h: FLAT_VIEW.h * p.scale });
    }
  });

  it("gives null for an area that isn't finite or has no size", () => {
    const ws = wallSceneOf(room());
    if (!ws) throw new Error("no wall scene");
    expect(wallBox(ws, { x: 0, y: 0, w: 0, h: 600 })).toBeNull();
    expect(wallBox(ws, { x: 0, y: 0, w: Number.NaN, h: 600 })).toBeNull();
  });
});
