// T061 (spec 004; FR-009, FR-019; R-08, R-18): the kernel's `framing(aspect, boxes)`, spec 002's camera algorithm moved
// out of its `src/room/framing.ts`: a 45° vertical field of view, a 6% margin, and the label lift, the camera straight
// down −Z from x = 0, as close as it can be while every corner of every box fits. For spec 002's LAYOUT boxes, each grown
// for its label as spec 002 grows every piece's, it placed the camera where spec 002's own code placed it before the
// move, recorded at each of the six aspects, so the move changed nothing.
// T301 (spec 004; FR-064, FR-078; spec.md's Clarifications, 2026-10-26, D1; plan.md §10): the eye comes down from spec
// 002's 1.5 m to 1.15 m, about the middle of the cube's framed span, so the camera stands lower and, where the boxes'
// height binds it, closer: at spec 002's four narrower aspects its width binds, and the camera stays where spec 002's
// stood; at 1.5 and 2.4 it comes closer.
// T112 (spec 004; FR-005, FR-007) deleted that file with the rest of the room's data in code, and spec 002's framing
// with it, which this file compared the kernel to while both stood. Its nine boxes stay here as numbers, the fixture
// the recorded positions were measured on: the room's own boxes are its data's, which the bundle frames.
import { describe, expect, it } from "vitest";

import {
  EYE_Y,
  FAR,
  FOV,
  LABEL_HEIGHT,
  LABEL_LIFT,
  MARGIN,
  NEAR,
  framing,
  withLabel,
} from "../../src/room/compose/framing";
import type { Box } from "../../src/room/compose/framing";
import type { Vec3 } from "../../src/room/compose/math";
import { ASPECTS } from "../../src/room/compose/stages";

/** Spec 002's LAYOUT at the base (dc7f023), each piece's centre and size in metres, in its order: the desk, the laptop,
 *  the screen, the snowboard, the bicycle, the window, the artwork, the twin, and the visitor's largest avatar. */
const LAYOUT: readonly (readonly [center: Vec3, size: Vec3])[] = [
  [
    [0.1, 0.375, -1.45],
    [1.7, 0.75, 0.7],
  ],
  [
    [-0.25, 0.865, -1.35],
    [0.36, 0.23, 0.26],
  ],
  [
    [0.4, 1.02, -1.62],
    [0.64, 0.54, 0.16],
  ],
  [
    [-2.3, 1.45, -1.94],
    [0.32, 1.55, 0.06],
  ],
  [
    [2.25, 1.6, -1.9],
    [1.26, 0.76, 0.1],
  ],
  [
    [0.95, 1.85, -1.97],
    [0.9, 0.7, 0.06],
  ],
  [
    [0.95, 2.55, -1.97],
    [0.7, 0.4, 0.04],
  ],
  [
    [-0.95, 0.875, -1.3],
    [0.56, 1.75, 0.4],
  ],
  [
    [1.0, 0.87, -0.35],
    [1.1, 1.74, 0.05],
  ],
];

/** Spec 002's LAYOUT boxes as the kernel's {min, max}, computed as spec 002's framing computed their corners. */
const LAYOUT_BOXES: Box[] = LAYOUT.map(([center, size]) => ({
  min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
  max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2],
}));

/** spec 002's framing(aspect) at the base (dc7f023), before the move: its camera's z at each of the six aspects, its eye
 *  at 1.5 m. */
const SPEC_002_Z: Record<number, number> = {
  0.45: 14.528024807139078,
  0.6: 10.433518605354308,
  0.8: 7.362638954015731,
  1.15: 4.558792315837032,
  1.5: 3.513599564173221,
  2.4: 3.513599564173221,
};

/** The kernel's camera's z at each of the six aspects for the same boxes, its eye at 1.15 m (D1). */
const LOWER_Z: Record<number, number> = {
  0.45: 14.528024807139078,
  0.6: 10.433518605354308,
  0.8: 7.362638954015731,
  1.15: 4.558792315837032,
  1.5: 3.063407442141723,
  2.4: 2.8610447870971045,
};

describe("framing(aspect, boxes)", () => {
  it("keeps spec 002's constants but the eye: 45°, an eye at 1.15 m, a 6% margin, the label lift, near 0.1, far 80", () => {
    expect(FOV).toBe(45);
    expect(EYE_Y).toBe(1.15);
    expect(MARGIN).toBe(1.06);
    expect(LABEL_LIFT).toBe(0.18);
    expect(LABEL_HEIGHT).toBe(0.1);
    expect([NEAR, FAR]).toEqual([0.1, 80]);
    expect(LAYOUT_BOXES).toHaveLength(9);
  });

  it("places the camera lower than spec 002's for its LAYOUT boxes, and no further, at each of the six aspects", () => {
    // Spec 002's six, among spec 005's series (its PD-10).
    const SIX = [0.45, 0.6, 0.8, 1.15, 1.5, 2.4];
    for (const a of SIX) expect(ASPECTS).toContain(a);
    for (const aspect of SIX) {
      const kernel = framing(aspect, LAYOUT_BOXES.map(withLabel));
      expect(kernel.fov, `fov at ${aspect}`).toBe(FOV);
      // The camera at the lower eye, to the last bit.
      expect(kernel.position, `position at ${aspect}`).toEqual([0, 1.15, LOWER_Z[aspect]]);
      expect(kernel.target, `target at ${aspect}`).toEqual([0, 1.15, (LOWER_Z[aspect] ?? Number.NaN) - 1]);
      // Where the boxes' width binds, where spec 002's stood; where their height does, closer.
      const before = SPEC_002_Z[aspect] ?? Number.NaN;
      if (aspect <= 1.15) expect(kernel.position[2], `${aspect}`).toBe(before);
      else expect(kernel.position[2], `${aspect}`).toBeLessThan(before);
    }
  });

  it("looks straight down −Z from x = 0 at the eye's height, with near and far as spec 002's camera has them", () => {
    const f = framing(1.6, [{ min: [-1, 0, -2], max: [1, 2, -1.5] }]);
    expect(f.position[0]).toBe(0);
    expect(f.position[1]).toBe(EYE_Y);
    expect(f.target).toEqual([0, EYE_Y, f.position[2] - 1]);
    expect([f.fov, f.near, f.far]).toEqual([FOV, NEAR, FAR]);
  });

  it("stands as close as it can while every corner fits inside the frame with the margin", () => {
    const boxes: Box[] = [
      { min: [-2.6, 0.2, -2], max: [-2.1, 2.3, -1.9] },
      { min: [0.4, 0, -1.8], max: [1.9, 0.8, -1.1] },
      { min: [-0.3, 2.4, -2], max: [0.6, 3.1, -1.95] },
    ];
    for (const aspect of [0.45, 0.8, 1, 1.6, 2.4]) {
      const f = framing(aspect, boxes);
      const tanV = Math.tan(((FOV / 2) * Math.PI) / 180);
      const tanH = tanV * aspect;
      let tightest = 0;
      for (const { min, max } of boxes) {
        for (const x of [min[0], max[0]])
          for (const y of [min[1], max[1]])
            for (const z of [min[2], max[2]]) {
              const depth = f.position[2] - z;
              expect(depth, `in front at ${aspect}`).toBeGreaterThan(0);
              const nx = (Math.abs(x) * MARGIN) / (depth * tanH);
              const ny = (Math.abs(y - EYE_Y) * MARGIN) / (depth * tanV);
              expect(Math.max(nx, ny), `inside at ${aspect}`).toBeLessThanOrEqual(1 + 1e-12);
              tightest = Math.max(tightest, nx, ny);
            }
      }
      // Some corner sits exactly on the margin: the camera couldn't come any closer.
      expect(tightest, `tight at ${aspect}`).toBeCloseTo(1, 12);
    }
  });

  it("frames a box as given, and withLabel raises only its top, by the lift and the label's height", () => {
    const box: Box = { min: [-0.5, 0.2, -1.5], max: [0.5, 1.1, -1.2] };
    expect(withLabel(box)).toEqual({ min: [-0.5, 0.2, -1.5], max: [0.5, 1.1 + LABEL_LIFT + LABEL_HEIGHT, -1.2] });
    // A taller box needs a camera at least as far back.
    expect(framing(0.8, [withLabel(box)]).position[2]).toBeGreaterThanOrEqual(framing(0.8, [box]).position[2]);
  });
});
