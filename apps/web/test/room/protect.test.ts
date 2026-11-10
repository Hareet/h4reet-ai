// T008 (spec 014; FR-010, FR-016; D6; contracts/frame-area.md §2, §5; plan.md §2.2, PD-2): the frame area's protector,
// `compose/protect.ts`'s `protectorFor`. For an area, it frames the scene at the area's aspect with spec 004's framing,
// measures the selectables' pick areas there with `pick.ts`, as RG6 does, and gives each selectable pressable at spec
// 005's frame its 44 × 44 exclusive core, and each figure's framed box projected by `project.ts`, all in the window's
// pixels. A side-wall selectable list-only at the clear area's frame is absent. The runtime builds the same input from
// the bundle (`protectSceneOf`), so the boxes for the room's own scene at the reference desktop's window are recorded.
import { describe, expect, it } from "vitest";

import { framing } from "../../src/room/compose/framing";
import { compactBoxes, hudBoxes, walkControlBox } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { CORE_PX, listOnly, memberRect, pickAreas } from "../../src/room/compose/pick";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import type { ProtectScene } from "../../src/room/compose/protect";
import { repositoryBundle } from "../helpers/room";
import { PROTECT_SCENE } from "../fixtures/room/protect-scene";

const SCENE = PROTECT_SCENE as unknown as ProtectScene;

/** RG6's own measure, written out: the cores of the selectables not held at `clear`, and the figures' boxes, at `area`
 *  in the window's pixels. */
function expected(scene: ProtectScene, area: Box, clear: Box): { cores: Map<string, Box>; figures: Box[] } {
  const areasAt = (stage: { w: number; h: number }) => {
    const camera = framing(stage.w / stage.h, scene.framed);
    return {
      camera,
      areas: pickAreas(
        scene.selectables.map((s) => ({
          id: s.id,
          members: s.boxes.flatMap((b) => {
            const r = memberRect(b, camera, stage);
            return r ? [r] : [];
          }),
        })),
      ),
    };
  };
  const atClear = areasAt(clear);
  const sideWall = new Set(scene.selectables.filter((s) => s.sideWall).map((s) => s.id));
  const held = listOnly(atClear.areas, [0, 0, clear.w, clear.h], sideWall, [walkControlBox(clear)]);
  const atArea = areasAt(area);
  const cores = new Map<string, Box>();
  for (const a of atArea.areas)
    if (a.core && !held.has(a.id))
      cores.set(a.id, { x: area.x + a.core[0], y: area.y + a.core[1], w: CORE_PX, h: CORE_PX });
  const figures = scene.figures.flatMap((b) => {
    const r = memberRect(b, atArea.camera, area);
    return r ? [{ x: area.x + r.rect[0], y: area.y + r.rect[1], w: r.rect[2], h: r.rect[3] }] : [];
  });
  return { cores, figures };
}

describe("the protector over T004's scene (compose/protect.ts)", () => {
  it("gives each pressable selectable's 44 × 44 core and each figure's framed box, in the window's pixels", () => {
    const protect = protectorFor(SCENE);
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 2560, h: 1440 },
      { w: 1280, h: 720 },
    ]) {
      const clear = hudBoxes(screen).clear;
      for (const area of [{ x: 0, y: 0, ...screen }, clear]) {
        const got = protect.boxes(area, clear);
        const want = expected(SCENE, area, clear);
        expect(got).toEqual([...want.cores.values(), ...want.figures]);
        for (const b of got) for (const v of [b.x, b.y, b.w, b.h]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("leaves out a side-wall selectable list-only at the clear area's frame", () => {
    // Two small signs side by side on the left wall: their cores overlap, so FR-064's carve-out leaves at least one to
    // the list at the clear area, and the protector gives no box for it.
    const signs: ProtectScene = {
      ...SCENE,
      selectables: [
        ...SCENE.selectables,
        { id: "sign-a", boxes: [{ min: [-1.065, 1.2, -0.62], max: [-1.055, 1.26, -0.6] }], sideWall: true },
        { id: "sign-b", boxes: [{ min: [-1.065, 1.2, -0.59], max: [-1.055, 1.26, -0.57] }], sideWall: true },
      ],
    };
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 568, h: 320 },
    ]) {
      const clear = hudBoxes(screen).clear;
      const want = expected(signs, clear, clear);
      const absent = ["sign-a", "sign-b"].filter((id) => !want.cores.has(id));
      expect(absent.length, `${screen.w} × ${screen.h}`).toBeGreaterThan(0);
      const got = protectorFor(signs).boxes({ x: 0, y: 0, ...screen }, clear);
      expect(got).toEqual([
        ...expected(signs, { x: 0, y: 0, ...screen }, clear).cores.values(),
        ...want.figures.map(() => expect.anything()),
      ]);
      expect(got).toHaveLength(want.cores.size + signs.figures.length);
    }
  });

  it("gives the same boxes from a fresh protector, and every pressable core inside its area", () => {
    const screen = { w: 1920, h: 1200 };
    const clear = hudBoxes(screen).clear;
    const window = { x: 0, y: 0, ...screen };
    expect(protectorFor(SCENE).boxes(window, clear)).toEqual(protectorFor(SCENE).boxes(window, clear));
    for (const b of protectorFor(SCENE).boxes(window, clear)) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(1920);
    }
  });
});

describe("the protector from the room's own bundle (protectSceneOf)", () => {
  it("records the boxes at the reference desktop's window and clear area", () => {
    const { scene, index } = repositoryBundle();
    const input = protectSceneOf(scene, index);
    expect(input.selectables.map((s) => s.id)).toEqual(index.selectables.map((s) => s.id));
    expect(input.figures).toHaveLength(2);
    const screen = { w: 1920, h: 1200 };
    const clear = hudBoxes(screen).clear;
    const round = (bs: readonly Box[]) => bs.map((b) => [b.x, b.y, b.w, b.h].map((v) => Math.round(v * 10) / 10));
    const protect = protectorFor(input);
    expect({
      window: round(protect.boxes({ x: 0, y: 0, ...screen }, clear)),
      clear: round(protect.boxes(clear, clear)),
      compact: round(compactBoxes(screen).all),
    }).toMatchSnapshot();
  });
});
