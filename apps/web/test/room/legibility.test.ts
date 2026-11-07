// T062 (spec 004; FR-052, FR-054, SC-010; R-21; contracts/room-data-files.md §5.3, RG7): a face's smallest cap height
// in CSS pixels, from the kernel's `compose/legibility.ts` and the fixed text grids of `compose/layout.ts`. The cap
// height on the face is the typeface's cap ratio times the glyph size the region's grid gives, or an outline's
// `cap_height` over its fitted view box; it is projected through `compose/project.ts` at the production framing, on a
// stage, and the smallest over the region's corners is the face's. Words never resize a grid. Every ID is a synthetic
// `fx-` one.
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { framing, withLabel } from "../../src/room/compose/framing";
import type { Box } from "../../src/room/compose/framing";
import { GRID_METRICS, fitOutline, regionBox, textGrid } from "../../src/room/compose/layout";
import { facePoint, regionCap, smallestCapPx, typefaceFor } from "../../src/room/compose/legibility";
import type { FaceGeometry } from "../../src/room/compose/legibility";
import { multiply, rotation, scaling, translation } from "../../src/room/compose/math";
import type { Mat4, Vec3 } from "../../src/room/compose/math";
import type { Camera } from "../../src/room/compose/project";
import { REFERENCE_DESKTOP, REFERENCE_PHONE } from "../../src/room/compose/stages";
import type { Stage } from "../../src/room/compose/stages";
import { LAYOUT } from "../../src/room/framing";

const LAYOUT_BOXES: Box[] = Object.values(LAYOUT)
  .filter((v): v is Exclude<typeof v, number> => typeof v !== "number")
  .map(({ center, size }) => ({
    min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
    max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2],
  }));

/** The production framing on a stage: spec 002's room, each piece grown for its label. */
const productionCamera = (stage: Stage): Camera => framing(stage.w / stage.h, LAYOUT_BOXES.map(withLabel));

const FACE: FaceGeometry = { at: [0, 0, 0], size: [1, 0.5], facing: [0, 0, 1], up: [0, 1, 0] };
const WALL: Mat4 = translation([0.4, 1.2, -1.95]);
const TAN_V = Math.tan((22.5 * Math.PI) / 180);

describe("the fixed text grids (compose/layout.ts)", () => {
  it("place a region by its fractions of the face, from the face's top left", () => {
    expect(regionBox([0.5, 0.25, 0.5, 0.5], [1.2, 0.8])).toEqual({ x: 0.6, y: 0.2, w: 0.6, h: 0.4 });
  });

  it("give a terminal or desktop-session region's glyph size from its rows and columns", () => {
    // IBM Plex Mono's advance is 600 units of its 1000-unit em: a terminal cell is 0.6 em wide.
    expect(GRID_METRICS.terminal.advance).toBe(0.6);
    for (const renderer of ["terminal", "desktop-session"] as const) {
      const { line, advance } = GRID_METRICS[renderer];
      const grid = textGrid(renderer, { cols: 40, rows: 10 }, { w: 1, h: 0.5 });
      expect(grid?.em).toBeCloseTo(Math.min(0.05 / line, 1 / (40 * advance)), 15);
      expect(grid?.rows).toBe(10);
      expect(grid?.cols).toBe(40);
      expect(grid?.pitch).toBeCloseTo(0.05, 15);
      // More rows or more columns never give a larger glyph.
      const denser = textGrid(renderer, { cols: 80, rows: 20 }, { w: 1, h: 0.5 });
      expect(denser?.em).toBeLessThan(grid?.em ?? 0);
    }
  });

  it("give the chalk's line slots and the neon panels' characters their glyph sizes", () => {
    const chalk = textGrid("chalk", { rows: 6 }, { w: 0.8, h: 0.6 });
    expect(chalk?.em).toBeCloseTo(0.1 / GRID_METRICS.chalk.line, 15);
    expect(chalk?.cols).toBeNull();
    const neon = textGrid("neon", { chars: 8 }, { w: 0.5, h: 0.1 });
    expect(neon?.em).toBeCloseTo(Math.min(0.1 / GRID_METRICS.neon.line, 0.5 / (8 * GRID_METRICS.neon.advance)), 15);
    expect(neon?.rows).toBe(1);
    expect(neon?.cols).toBe(8);
  });

  it("refuse a grid of another renderer's kind, and give a sign no grid", () => {
    expect(textGrid("terminal", { rows: 4 }, { w: 1, h: 1 })).toBeNull();
    expect(textGrid("chalk", { cols: 10, rows: 4 }, { w: 1, h: 1 })).toBeNull();
    expect(textGrid("neon", { rows: 1 }, { w: 1, h: 1 })).toBeNull();
    expect(textGrid("desktop-session", { chars: 4 }, { w: 1, h: 1 })).toBeNull();
    expect(textGrid("sign", { rows: 1 }, { w: 1, h: 1 })).toBeNull();
  });

  it("fit a sign's outline inside its region, keeping its aspect, centred by its advance", () => {
    const region = { x: 0.1, y: 0.05, w: 0.6, h: 0.2 };
    const fit = fitOutline({ view_box: [0, 0, 1000, 250], advance: 960 }, region);
    expect(fit.scale).toBeCloseTo(0.6 / 960, 15);
    expect(fit.x).toBeCloseTo(0.1, 15);
    expect(fit.y).toBeCloseTo(0.05 + (0.2 - 250 * (0.6 / 960)) / 2, 15);
    // No advance: the view box's width. A tall view box fits by its height instead.
    expect(fitOutline({ view_box: [0, 0, 1000, 250] }, region).scale).toBeCloseTo(0.0006, 15);
    const tall = fitOutline({ view_box: [-50, 10, 100, 400] }, region);
    expect(tall.scale).toBeCloseTo(0.2 / 400, 15);
    // Centred: the view box's own origin is taken off.
    expect(tall.x).toBeCloseTo(0.1 + (0.6 - 100 * tall.scale) / 2 + 50 * tall.scale, 15);
    expect(tall.y).toBeCloseTo(0.05 - 10 * tall.scale, 15);
  });
});

describe("a region's cap height on its face (compose/legibility.ts)", () => {
  it("is the typeface's cap ratio times the glyph size the region's grid gives", () => {
    const region = { rect: [0, 0, 0.5, 1] as const, renderer: "terminal" as const, grid: { cols: 40, rows: 10 } };
    const grid = textGrid("terminal", region.grid, regionBox(region.rect, FACE.size));
    expect(regionCap(FACE, region, { capRatio: 0.698 })).toBeCloseTo(0.698 * (grid?.em ?? Number.NaN), 15);
  });

  it("is an outline's cap_height, scaled as the outline is fitted", () => {
    const outline = { view_box: [0, 0, 1000, 250] as const, cap_height: 180, advance: 960 };
    const region = { rect: [0.1, 0.1, 0.6, 0.4] as const, renderer: "sign" as const, grid: null };
    const fit = fitOutline(outline, regionBox(region.rect, FACE.size));
    expect(regionCap(FACE, region, { outline })).toBeCloseTo(180 * fit.scale, 15);
  });

  it("is none for a grid that doesn't fit its renderer", () => {
    const region = { rect: [0, 0, 1, 1] as const, renderer: "chalk" as const, grid: { cols: 3, rows: 2 } };
    expect(regionCap(FACE, region, { capRatio: 0.7 })).toBeNull();
  });

  it("draws the neon word in the neon face and its counters in the counters' face", () => {
    expect(typefaceFor("neon", { ui: ["sign.word"] })).toBe("neon");
    expect(typefaceFor("neon", { signal: "turn-cost", part: "call" })).toBe("counters");
    expect(typefaceFor("terminal", { room_text: "fx-block" })).toBe("terminal");
    expect(typefaceFor("desktop-session", { room_text: "fx-block" })).toBe("desktop-session");
    expect(typefaceFor("chalk", { resume_titles: true })).toBe("chalk");
    expect(typefaceFor("sign", { room_text: "fx-outline" })).toBeNull();
  });
});

describe("a face's smallest cap height in CSS pixels", () => {
  it("is cap × H ÷ (2 · tan 22.5° · depth) for a face square to the camera, on both reference stages", () => {
    for (const stage of [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage]) {
      const camera = productionCamera(stage);
      const depth = camera.position[2] - -1.95;
      const px = smallestCapPx(WALL, FACE, [{ rect: [0.1, 0.1, 0.8, 0.8], cap: 0.03 }], camera, stage);
      expect(px).toBeCloseTo((0.03 * stage.h) / (2 * TAN_V * depth), 9);
    }
  });

  it("takes the smallest region, and the smallest corner of a turned face, as three.js projects them", () => {
    const stage = REFERENCE_PHONE.stage;
    const aspect = stage.w / stage.h;
    const camera = productionCamera(stage);
    const three = new PerspectiveCamera(45, aspect, 0.1, 80);
    three.position.set(...camera.position);
    three.lookAt(...camera.target);
    three.updateProjectionMatrix();
    three.updateMatrixWorld(true);
    const face: FaceGeometry = { at: [0.02, 0.1, 0.03], size: [0.6, 0.4], facing: [0, 0, 1], up: [0, 1, 0] };
    const regions = [
      { rect: [0, 0, 0.5, 1] as const, cap: 0.02 },
      { rect: [0.5, 0, 0.5, 0.5] as const, cap: 0.012 },
    ];
    const at = new Vector3(...face.at);
    const up = new Vector3(...face.up);
    const right = new Vector3().crossVectors(up, new Vector3(...face.facing)).normalize();
    // Turned two ways: the second leans the face's top and its left away, so its top-left corner is the farthest.
    for (const turn of [
      { x: -10, y: 55, z: 4 },
      { x: -25, y: -60, z: 0 },
    ]) {
      const model = multiply(multiply(translation([-1.2, 1.1, -1.7]), rotation(turn)), scaling(1.5));
      // The same measure, by three.js: from each region's corners, a cap-high segment into the region along its up.
      const m = new Matrix4().fromArray([...model]);
      const css = (p: Vector3): Vector3 => {
        const n = p.clone().applyMatrix4(m).project(three);
        return new Vector3(((n.x + 1) / 2) * stage.w, ((1 - n.y) / 2) * stage.h, 0);
      };
      let expected = Infinity;
      for (const { rect, cap } of regions) {
        const [x, y, w, h] = rect;
        for (const [u, v, inward] of [
          [x, y, -1],
          [x + w, y, -1],
          [x, y + h, 1],
          [x + w, y + h, 1],
        ] as const) {
          const corner = at
            .clone()
            .addScaledVector(right, (u - 0.5) * face.size[0])
            .addScaledVector(up, (0.5 - v) * face.size[1]);
          const tip = corner.clone().addScaledVector(up, inward * cap);
          expected = Math.min(expected, css(corner).distanceTo(css(tip)));
        }
      }
      expect(smallestCapPx(model, face, regions, camera, stage), JSON.stringify(turn)).toBeCloseTo(expected, 9);
    }
  });

  it("grows with the piece's stylized scale, which scales its faces, and is none without a region", () => {
    const stage = REFERENCE_DESKTOP.stage;
    const camera = productionCamera(stage);
    const regions = [{ rect: [0.2, 0.2, 0.6, 0.6] as const, cap: 0.025 }];
    const once = smallestCapPx(WALL, FACE, regions, camera, stage) ?? Number.NaN;
    const twice = smallestCapPx(multiply(WALL, scaling(2)), FACE, regions, camera, stage) ?? Number.NaN;
    expect(twice / once).toBeCloseTo(2, 12);
    expect(smallestCapPx(WALL, FACE, [], camera, stage)).toBeNull();
  });

  it("is none where a point it measures is at or behind the camera's near plane, as a member's rectangle is (words-7)", () => {
    const stage = REFERENCE_PHONE.stage;
    const camera = productionCamera(stage);
    const z = camera.position[2];
    const regions = [{ rect: [0.1, 0.1, 0.8, 0.8] as const, cap: 0.03 }];
    // In front, past the near plane: a measure.
    expect(smallestCapPx(translation([0, 1.5, z - 1]), FACE, regions, camera, stage)).toBeGreaterThan(0);
    // Behind the camera; between it and its near plane; and turned to face +X astride the camera's plane, so some
    // corners are before it and some behind.
    for (const model of [
      translation([0, 1.5, z + 2]),
      translation([0, 1.5, z - camera.near / 2]),
      multiply(translation([0.3, 1.5, z]), rotation({ x: 0, y: 90, z: 0 })),
    ])
      expect(smallestCapPx(model, FACE, regions, camera, stage)).toBeNull();
  });

  it("finds a face's points from its centre, size, facing, and up, in the piece's frame", () => {
    const face: FaceGeometry = { at: [1, 2, 3], size: [0.4, 0.2], facing: [1, 0, 0], up: [0, 1, 0] };
    // Facing +X with +Y up, the face's right runs along −Z.
    const corner: Vec3 = facePoint(face, 0, 0);
    expect(corner[0]).toBeCloseTo(1, 15);
    expect(corner[1]).toBeCloseTo(2.1, 15);
    expect(corner[2]).toBeCloseTo(3.2, 15);
    expect(facePoint(face, 0.5, 0.5)).toEqual([1, 2, 3]);
  });
});
