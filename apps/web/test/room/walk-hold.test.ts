// T029 (spec 014; FR-030 to FR-033; SC-005; contracts/frame-area.md §6; plan.md §5, PD-10, PD-11): the walking view's
// hold, `walk/hold.ts`. `nearsEdge` is true when the figure's box on the canvas comes within 0.5rem of any HUD box or of
// the window's edge, at each side of each; `release` names the first camera intent, a turn, a tilt, or a zoom, or the
// edge, and never the movement keys alone; and `orbitFrom` gives the orbit about the figure's focus that puts the camera
// where the room's view stands, within 1 mm, its direction toward the focus within 0.01°.
import { describe, expect, it } from "vitest";

import { frameArea } from "../../src/room/compose/frame";
import { framing } from "../../src/room/compose/framing";
import { DEFAULT_METRICS, OPENING, compactBoxes, hudBoxes } from "../../src/room/compose/hud";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import type { Box } from "../../src/room/compose/hud";
import { HOLD_MARGIN_REM, nearsEdge, orbitFrom, release } from "../../src/room/walk/hold";
import { orbitPosition } from "../../src/room/walk/camera";
import { repositoryBundle } from "../helpers/room";

const WINDOW = { w: 1920, h: 1200 };
const HUD: readonly Box[] = [
  { x: 744, y: 0, w: 432, h: 27.5 },
  { x: 1360, y: 1148, w: 560, h: 52 },
  { x: 1472, y: 781, w: 448, h: 367 },
  { x: 1336, y: 1096, w: 128, h: 44 },
];

describe("the hold's edge (walk/hold.ts's nearsEdge)", () => {
  it("is 0.5rem", () => {
    expect(HOLD_MARGIN_REM).toBe(0.5);
  });

  it("trips within 0.5rem of each side of each HUD box, and not beyond", () => {
    for (const b of HUD) {
      const size = 40;
      const sides: [string, (gap: number) => Box][] = [
        ["left", (g) => ({ x: b.x - g - size, y: b.y + b.h / 2 - size / 2, w: size, h: size })],
        ["right", (g) => ({ x: b.x + b.w + g, y: b.y + b.h / 2 - size / 2, w: size, h: size })],
        ["above", (g) => ({ x: b.x + b.w / 2 - size / 2, y: b.y - g - size, w: size, h: size })],
        ["below", (g) => ({ x: b.x + b.w / 2 - size / 2, y: b.y + b.h + g, w: size, h: size })],
      ];
      for (const [side, at] of sides) {
        const inWindow = (box: Box): boolean =>
          box.x >= 8 && box.y >= 8 && box.x + box.w <= WINDOW.w - 8 && box.y + box.h <= WINDOW.h - 8;
        const near = at(7.9);
        const clear = at(8);
        if (inWindow(near)) expect(nearsEdge(near, HUD, WINDOW, 16), `${side} of ${JSON.stringify(b)}`).toBe(true);
        if (inWindow(clear) && !HUD.some((o) => o !== b && nearsEdge(clear, [o], WINDOW, 16)))
          expect(nearsEdge(clear, HUD, WINDOW, 16), `${side} of ${JSON.stringify(b)}, 8 px`).toBe(false);
      }
    }
  });

  it("trips within 0.5rem of each of the window's edges", () => {
    const at = (x: number, y: number): Box => ({ x, y, w: 40, h: 40 });
    expect(nearsEdge(at(7.9, 500), [], WINDOW, 16)).toBe(true);
    expect(nearsEdge(at(8, 500), [], WINDOW, 16)).toBe(false);
    expect(nearsEdge(at(500, 7.9), [], WINDOW, 16)).toBe(true);
    expect(nearsEdge(at(WINDOW.w - 40 - 7.9, 500), [], WINDOW, 16)).toBe(true);
    expect(nearsEdge(at(WINDOW.w - 40 - 8, 500), [], WINDOW, 16)).toBe(false);
    expect(nearsEdge(at(500, WINDOW.h - 40 - 7.9), [], WINDOW, 16)).toBe(true);
    // A larger root, a larger margin.
    expect(nearsEdge(at(9, 500), [], WINDOW, 20)).toBe(true);
  });
});

describe("the hold's release (walk/hold.ts's release)", () => {
  const still = { turn: 0, tilt: 0, zoom: 0 };
  it("names a turn, a tilt, or a zoom, in that order, and the edge", () => {
    expect(release({ ...still, turn: 0.1 }, false)).toBe("turn");
    expect(release({ ...still, turn: -0.1 }, false)).toBe("turn");
    expect(release({ ...still, tilt: 0.05 }, false)).toBe("tilt");
    expect(release({ ...still, zoom: -1 }, false)).toBe("zoom");
    expect(release({ ...still, turn: 0.1, zoom: 1 }, false)).toBe("turn");
    expect(release(still, true)).toBe("edge");
    expect(release({ ...still, tilt: 0.05 }, true)).toBe("tilt");
  });

  it("is never the movement keys alone", () => {
    expect(release(still, false)).toBeNull();
    expect(release({ ...still, move: { forward: 1, right: 0 } } as never, false)).toBeNull();
  });
});

describe("the orbit from the room's view (walk/hold.ts's orbitFrom)", () => {
  it("puts the camera where the room's view stands, within 1 mm, looking at the focus within 0.01°", () => {
    const boxes = [{ min: [-1.065, 0, -1.22], max: [1.065, 2.13, 0] }] as const;
    for (const aspect of [1640 / 1150.3, 2560 / 1440, 0.6]) {
      const view = framing(aspect, boxes);
      for (const focus of [
        [-0.7, 1.1, 0.58],
        [0.3, 1.1, -0.4],
        [0, 1.1, 0],
      ] as const) {
        const orbit = orbitFrom(view, focus);
        const at = orbitPosition(focus, orbit);
        const miss = Math.hypot(at[0] - view.position[0], at[1] - view.position[1], at[2] - view.position[2]);
        expect(miss).toBeLessThan(0.001);
        // The orbit's direction from the focus is the view's position's, within 0.01°.
        const dir = (p: readonly number[]): number[] => {
          const d = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0].map((v, k) => v - (focus[k] ?? 0));
          const n = Math.hypot(...d);
          return d.map((v) => v / n);
        };
        const [a, b] = [dir(at), dir(view.position)];
        const cos = (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
        expect((Math.acos(Math.min(1, cos)) * 180) / Math.PI).toBeLessThan(0.01);
      }
    }
  });
});

// R-11: at the room's view in its frame area, the frame's protection keeps both figures' boxes 0.5rem clear of every HUD
// box, so entering the walking view never hands over at once, on the room's own scene.
describe("the hold at entry on the room's own scene (spec 014, R-11)", () => {
  it("leaves the visitor's figure clear of the edge at the room's view, at each named screen", () => {
    const { scene, index } = repositoryBundle();
    const protect = protectorFor(protectSceneOf(scene, index));
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 2560, h: 1440 },
      { w: 1280, h: 720 },
      { w: 390, h: 844 },
    ]) {
      const f = frameArea(screen, OPENING, DEFAULT_METRICS, protect);
      const boxes = protect.boxes(f.area, hudBoxes(screen).clear) ?? [];
      const visitor = boxes.at(-1);
      if (!visitor) throw new Error("no visitor's box");
      expect(nearsEdge(visitor, compactBoxes(screen).all, screen, 16), `${screen.w} × ${screen.h}`).toBe(false);
    }
  });
});
