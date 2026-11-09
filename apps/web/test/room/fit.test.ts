// T009 (spec 005; FR-010, FR-011, FR-015; SC-001; plan.md §4.2, §5, PD-11 to PD-13): `src/room/fit.ts`'s pure
// functions. The drawing buffer's ratio, min(the device's, the level's, √(the level's pixel cap ÷ the canvas's area)),
// never below 0.5; the buffer's size within a device pixel of the canvas's times that ratio, so nothing stretches; each
// level's pixel cap, falling with the level; the view offset that shifts the camera's projection so the room, framed at
// the clear area's aspect, sits in the clear area of a canvas the window's size, every framed box's corners landing
// inside it with spec 004's margin; and a canvas point moved into the clear area's pixels, or nothing outside it.
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { clearArea } from "../../src/room/compose/hud";
import { MARGIN, framing } from "../../src/room/compose/framing";
import { MIN_RATIO, bufferRatio, canvasToClear, clearNdc, viewOffsetFor } from "../../src/room/fit";
import { framedBoxes } from "../../src/room/scene/bundle3d";
import { qualitySettings } from "../../src/room/scene/levels";
import { repositoryBundle } from "../helpers/room";

/** SC-001's windows, and the reference screens. */
const WINDOWS = [
  { w: 1280, h: 720 },
  { w: 2560, h: 1440 },
  { w: 3440, h: 1440 },
  { w: 390, h: 844 },
  { w: 844, h: 390 },
  { w: 1920, h: 1200 },
  { w: 384, h: 740 },
  { w: 5120, h: 1440 },
] as const;

describe("the drawing buffer's ratio (fit.ts's bufferRatio; PD-11)", () => {
  it("is min(the device's ratio, the level's, √(cap ÷ area)), at each level and at ratios of 1, 1.5, 2, and 3", () => {
    for (let level = 0; level <= 3; level += 1) {
      const settings = qualitySettings(level);
      for (const dpr of [1, 1.5, 2, 3])
        for (const { w, h } of WINDOWS) {
          const want = Math.max(MIN_RATIO, Math.min(dpr, settings.pixelRatio, Math.sqrt(settings.pixelCap / (w * h))));
          const ratio = bufferRatio(dpr, settings, w, h);
          expect(ratio, `level ${level}, ${dpr}, ${w} × ${h}`).toBeCloseTo(want, 12);
          expect(ratio).toBeGreaterThanOrEqual(MIN_RATIO);
          expect(ratio).toBeLessThanOrEqual(Math.max(MIN_RATIO, dpr));
          // Within the cap, unless the floor of 0.5 holds it above.
          if (ratio > MIN_RATIO) expect(w * h * ratio * ratio).toBeLessThanOrEqual(settings.pixelCap * (1 + 1e-9));
        }
    }
  });

  it("never goes below 0.5, however large the window", () => {
    expect(MIN_RATIO).toBe(0.5);
    expect(bufferRatio(1, qualitySettings(3), 7680, 4320)).toBe(0.5);
  });

  it("keeps the buffer's width and height each within a device pixel of the canvas's times the ratio", () => {
    for (const { w, h } of WINDOWS)
      for (const dpr of [1, 1.5, 2, 2.8125, 3]) {
        const ratio = bufferRatio(dpr, qualitySettings(0), w, h);
        // three's setSize(w, h, false) at a pixel ratio: floor(w × ratio) by floor(h × ratio).
        const [bw, bh] = [Math.floor(w * ratio), Math.floor(h * ratio)];
        expect(Math.abs(bw - w * ratio)).toBeLessThan(1);
        expect(Math.abs(bh - h * ratio)).toBeLessThan(1);
        expect(Math.abs(bw / bh - w / h)).toBeLessThanOrEqual((1 + w / h) / bh);
      }
  });

  it("caps each level's buffer: 3,686,400, 2,304,000, 1,440,000, and 921,600 device pixels, falling (D7)", () => {
    expect([0, 1, 2, 3].map((l) => qualitySettings(l).pixelCap)).toEqual([3_686_400, 2_304_000, 1_440_000, 921_600]);
    expect([0, 1, 2, 3].map((l) => qualitySettings(l).pixelRatio)).toEqual([2, 1.25, 1, 0.75]);
  });
});

describe("the view offset (fit.ts's viewOffsetFor; PD-12)", () => {
  it("is (clear.w, clear.h, −clear.x, −clear.y, canvas.w, canvas.h)", () => {
    expect(viewOffsetFor({ x: 0, y: 27.5, w: 1472, h: 1120.5 }, { w: 1920, h: 1200 })).toEqual({
      fullWidth: 1472,
      fullHeight: 1120.5,
      x: -0,
      y: -27.5,
      width: 1920,
      height: 1200,
    });
    expect(viewOffsetFor({ x: 47, y: 10, w: 400, h: 300 }, { w: 844, h: 390 })).toEqual({
      fullWidth: 400,
      fullHeight: 300,
      x: -47,
      y: -10,
      width: 844,
      height: 390,
    });
  });

  it("lands every framed box's corners inside the clear area, with spec 004's margin, at SC-001's windows", () => {
    const { scene: part } = repositoryBundle();
    const boxes = framedBoxes(part);
    expect(boxes.length).toBeGreaterThan(3);
    for (const screen of WINDOWS) {
      const clear = clearArea(screen);
      const spec = framing(clear.w / clear.h, boxes);
      const camera = new PerspectiveCamera(spec.fov, clear.w / clear.h, spec.near, spec.far);
      camera.position.set(...spec.position);
      camera.lookAt(...spec.target);
      const o = viewOffsetFor(clear, screen);
      camera.setViewOffset(o.fullWidth, o.fullHeight, o.x, o.y, o.width, o.height);
      camera.updateMatrixWorld(true);
      // The projection's aspect is the canvas's: nothing stretched.
      const m = camera.projectionMatrix.elements;
      expect((m[5] ?? 0) / (m[0] ?? 1), `${screen.w} × ${screen.h}`).toBeCloseTo(screen.w / screen.h, 6);
      const inner = 1 / MARGIN + 1e-6;
      for (const box of boxes)
        for (const x of [box.min[0], box.max[0]])
          for (const y of [box.min[1], box.max[1]])
            for (const z of [box.min[2], box.max[2]]) {
              const ndc = new Vector3(x, y, z).project(camera);
              // The canvas's pixels, then the clear area's normalized point.
              const px = ((ndc.x + 1) / 2) * screen.w;
              const py = ((1 - ndc.y) / 2) * screen.h;
              const cx = ((px - clear.x) / clear.w) * 2 - 1;
              const cy = ((py - clear.y) / clear.h) * 2 - 1;
              const where = `${screen.w} × ${screen.h}, corner ${x}, ${y}, ${z}`;
              expect(Math.abs(cx), where).toBeLessThanOrEqual(inner);
              expect(Math.abs(cy), where).toBeLessThanOrEqual(inner);
            }
    }
  });
});

describe("a canvas point in the clear area (fit.ts's canvasToClear and clearNdc; PD-13)", () => {
  const canvas = { w: 1920, h: 1200 };
  const clear = { x: 0, y: 27.5, w: 1472, h: 1120.5 };
  const ndcOf = (px: number, py: number): { x: number; y: number } => ({
    x: (px / canvas.w) * 2 - 1,
    y: -((py / canvas.h) * 2 - 1),
  });

  it("moves a canvas point into the clear area's pixels", () => {
    const centre = canvasToClear(ndcOf(clear.x + clear.w / 2, clear.y + clear.h / 2), canvas, clear);
    expect(centre?.x).toBeCloseTo(clear.w / 2, 9);
    expect(centre?.y).toBeCloseTo(clear.h / 2, 9);
    const corner = canvasToClear(ndcOf(10, 40), canvas, clear);
    expect(corner?.x).toBeCloseTo(10, 9);
    expect(corner?.y).toBeCloseTo(12.5, 9);
    const n = clearNdc(ndcOf(clear.x + clear.w / 2, clear.y + clear.h / 2), canvas, clear);
    expect(n?.x).toBeCloseTo(0, 9);
    expect(n?.y).toBeCloseTo(0, 9);
    const top = clearNdc(ndcOf(clear.w / 2, clear.y), canvas, clear);
    expect(top?.y).toBeCloseTo(1, 9);
  });

  it("gives nothing for a point outside the clear area: over the strip, the column, or the bar", () => {
    expect(canvasToClear(ndcOf(100, 10), canvas, clear)).toBeNull();
    expect(canvasToClear(ndcOf(1600, 600), canvas, clear)).toBeNull();
    expect(canvasToClear(ndcOf(100, 1180), canvas, clear)).toBeNull();
    expect(clearNdc(ndcOf(1600, 600), canvas, clear)).toBeNull();
  });
});
