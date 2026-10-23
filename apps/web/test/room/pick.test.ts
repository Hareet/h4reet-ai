// T062 (spec 004; FR-064, SC-009; R-19, R-20; data-model.md §4.5; contracts/room-data-files.md §5.5, RG6): the kernel's
// projection, `compose/project.ts`, held to three.js's Vector3.project for spec 002's camera, which looks straight down
// −Z; and its pick areas, `compose/pick.ts`, one function for the build's spacing check and the room's pointer. Each
// selectable's area is the union of its members' CSS-pixel rectangles with an exclusive 44 × 44 core centred on that
// union. A pick goes to the frontmost member rectangle under the point; else to the selectable whose union and core
// contain the point and whose union is nearest, ties to scene order; else to none. In 2D, 44 px converts at the
// drawing's scale, min(W ÷ 320, H ÷ 200). Every ID is a synthetic `fx-` one.
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { framing, withLabel } from "../../src/room/compose/framing";
import type { Box } from "../../src/room/compose/framing";
import type { Vec3 } from "../../src/room/compose/math";
import { CORE_PX, flatCore, memberRect, pick, pickAreas, pickProblems } from "../../src/room/compose/pick";
import type { MemberRect, PickInput, Rect } from "../../src/room/compose/pick";
import { project, toStage, viewDepth } from "../../src/room/compose/project";
import type { Camera } from "../../src/room/compose/project";
import { ASPECTS, REFERENCE_PHONE, SMALLEST } from "../../src/room/compose/stages";
import { LAYOUT } from "../../src/room/framing";

function stream(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-9, what = ""): void {
  expect(actual.length, what).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    const [a, e] = [actual[i] ?? Number.NaN, expected[i] ?? Number.NaN];
    expect(Math.abs(a - e), `${what}[${i}]: ${a} against ${e}`).toBeLessThanOrEqual(tolerance);
  }
}

const LAYOUT_BOXES: Box[] = Object.values(LAYOUT)
  .filter((v): v is Exclude<typeof v, number> => typeof v !== "number")
  .map(({ center, size }) => ({
    min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
    max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2],
  }));

/** Spec 002's camera, as its scene.ts fitCamera sets it: the framing's place and target, near 0.1, far 80. */
function threeCamera(f: Camera, aspect: number): PerspectiveCamera {
  const camera = new PerspectiveCamera();
  camera.fov = f.fov;
  camera.aspect = aspect;
  camera.near = 0.1;
  camera.far = 80;
  camera.position.set(...f.position);
  camera.lookAt(...f.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

const cssOf = (ndc: Vector3, w: number, h: number): [number, number] => [((ndc.x + 1) / 2) * w, ((1 - ndc.y) / 2) * h];

describe("project (compose/project.ts)", () => {
  it("equals three.js's Vector3.project for spec 002's camera at each of the six aspects, within 1e-9", () => {
    const next = stream(0x5eed0062);
    for (const aspect of ASPECTS) {
      const camera = framing(aspect, LAYOUT_BOXES.map(withLabel));
      const three = threeCamera(camera, aspect);
      for (let i = 0; i < 40; i += 1) {
        const p: Vec3 = [-3 + 6 * next(), 3.2 * next(), -2.1 + 2.6 * next()];
        expectClose(project(p, camera, aspect), new Vector3(...p).project(three).toArray(), 1e-9, `at ${aspect}`);
      }
    }
  });

  it("equals three.js's for a camera that doesn't look straight down −Z too", () => {
    const camera: Camera = { fov: 50, near: 0.1, far: 80, position: [1.2, 2, 4], target: [-0.3, 1.1, -1.5] };
    const three = threeCamera(camera, 1.3);
    const next = stream(7);
    for (let i = 0; i < 40; i += 1) {
      const p: Vec3 = [-2 + 4 * next(), 3 * next(), -2 + 2 * next()];
      expectClose(project(p, camera, 1.3), new Vector3(...p).project(three).toArray(), 1e-9);
    }
  });

  it("maps the view to CSS pixels from the stage's top left, and gives a point's depth in front of the camera", () => {
    const stage = { w: 368, h: 420 };
    expect(toStage([-1, 1, 0], stage)).toEqual([0, 0]);
    expect(toStage([1, -1, 0], stage)).toEqual([368, 420]);
    expect(toStage([0, 0, 0.5], stage)).toEqual([184, 210]);
    const camera = framing(1.6, LAYOUT_BOXES);
    expect(viewDepth([0, 1.5, -2], camera)).toBeCloseTo(camera.position[2] + 2, 12);
    expect(viewDepth([0, 1.5, camera.position[2] + 1], camera)).toBeCloseTo(-1, 12);
  });
});

describe("a member's rectangle in 3D", () => {
  it("is the CSS-pixel bounds of its box's projected corners, with the depth of its nearest corner", () => {
    const stage = REFERENCE_PHONE.stage;
    const aspect = stage.w / stage.h;
    const camera = framing(aspect, LAYOUT_BOXES.map(withLabel));
    const three = threeCamera(camera, aspect);
    for (const box of LAYOUT_BOXES) {
      const corners: [number, number][] = [];
      let nearest = Infinity;
      for (const x of [box.min[0], box.max[0]])
        for (const y of [box.min[1], box.max[1]])
          for (const z of [box.min[2], box.max[2]]) {
            corners.push(cssOf(new Vector3(x, y, z).project(three), stage.w, stage.h));
            nearest = Math.min(nearest, camera.position[2] - z);
          }
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const expected = [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      ];
      const member = memberRect(box, camera, stage);
      expect(member).not.toBeNull();
      expectClose(member?.rect ?? [], expected, 1e-9);
      expect(member?.depth).toBeCloseTo(nearest, 12);
    }
  });

  it("is none when a corner is behind the camera", () => {
    const camera = framing(1.6, LAYOUT_BOXES);
    const behind: Box = { min: [-0.2, 1, camera.position[2] - 0.5], max: [0.2, 1.4, camera.position[2] + 0.5] };
    expect(memberRect(behind, camera, { w: 640, h: 400 })).toBeNull();
  });
});

const member = (x: number, y: number, w: number, h: number, depth = 5): MemberRect => ({ rect: [x, y, w, h], depth });

describe("pick areas (compose/pick.ts)", () => {
  it("give each selectable the union of its members' rectangles and a 44 × 44 core centred on it", () => {
    expect(CORE_PX).toBe(44);
    const [a] = pickAreas([{ id: "fx-a", members: [member(10, 20, 30, 10), member(60, 0, 20, 50)] }]);
    expect(a?.union).toEqual([10, 0, 70, 50]);
    expect(a?.core).toEqual([23, 3, 44, 44]);
    const [small] = pickAreas([{ id: "fx-b", members: [member(100, 100, 10, 6)] }]);
    expect(small?.union).toEqual([100, 100, 10, 6]);
    expect(small?.core).toEqual([83, 81, 44, 44]);
  });

  it("send a pick to the frontmost member rectangle under the point, whatever the scene order", () => {
    const areas = pickAreas([
      { id: "fx-back", members: [member(0, 0, 200, 120, 6)] },
      { id: "fx-front", members: [member(50, 50, 40, 30, 2)] },
    ]);
    expect(pick(areas, [60, 60])).toBe("fx-front");
    expect(pick(areas, [10, 10])).toBe("fx-back");
    // Equal depths: scene order.
    const level = pickAreas([
      { id: "fx-first", members: [member(0, 0, 100, 100, 3)] },
      { id: "fx-second", members: [member(50, 50, 100, 100, 3)] },
    ]);
    expect(pick(level, [75, 75])).toBe("fx-first");
  });

  it("else to the selectable whose union and core hold the point, the one whose union is nearest", () => {
    // fx-tiny's union is 8 × 8; its core reaches 18 px past it. fx-wide's union holds a gap between its members.
    const areas = pickAreas([
      { id: "fx-wide", members: [member(0, 0, 40, 40), member(160, 0, 40, 40)] },
      { id: "fx-tiny", members: [member(300, 100, 8, 8)] },
    ]);
    // In the gap between fx-wide's members, inside its union.
    expect(pick(areas, [100, 20])).toBe("fx-wide");
    // Off fx-tiny's member, inside its core.
    expect(pick(areas, [290, 95])).toBe("fx-tiny");
    // Outside every union and core.
    expect(pick(areas, [250, 300])).toBeNull();
    expect(pick(areas, [400, 20])).toBeNull();
  });

  it("break ties, and overlapping cores, by the nearest union and then scene order", () => {
    // Two small selectables 30 px apart: their cores overlap between them.
    const areas = pickAreas([
      { id: "fx-left", members: [member(100, 100, 10, 10)] },
      { id: "fx-right", members: [member(140, 100, 10, 10)] },
    ]);
    expect(pick(areas, [114, 105])).toBe("fx-left");
    expect(pick(areas, [136, 105])).toBe("fx-right");
    // Exactly halfway: both unions 15 px away, so scene order.
    expect(pick(areas, [125, 105])).toBe("fx-left");
    const swapped = pickAreas([...areas].reverse().map(({ id, members }) => ({ id, members })));
    expect(pick(swapped, [125, 105])).toBe("fx-right");
  });

  it("convert 44 px to view-box units in 2D at the drawing's scale, min(W ÷ 320, H ÷ 200)", () => {
    expect(flatCore({ w: 304, h: 248 })).toBeCloseTo(44 / 0.95, 12);
    expect(flatCore({ w: 640, h: 400 })).toBe(22);
    expect(flatCore({ w: 960, h: 300 })).toBe(44 / 1.5);
    const smallest = Math.max(...SMALLEST.map((s) => flatCore(s.stage)));
    expect(smallest).toBeCloseTo(44 / 0.95, 12);
    const [area] = pickAreas([{ id: "fx-flat", members: [member(150, 90, 20, 10)] }], flatCore({ w: 640, h: 400 }));
    expect(area?.core).toEqual([149, 84, 22, 22]);
  });

  it("report, for the spacing check, a core off the stage or over another selectable's core or members", () => {
    const view: Rect = [0, 0, 400, 300];
    const inputs: PickInput[] = [
      { id: "fx-edge", members: [member(0, 100, 20, 20)] },
      { id: "fx-left", members: [member(150, 150, 10, 10)] },
      { id: "fx-right", members: [member(180, 150, 10, 10)] },
      { id: "fx-under", members: [member(200, 160, 30, 30), member(300, 140, 60, 20)] },
      { id: "fx-clear", members: [member(300, 20, 40, 40)] },
    ];
    expect(pickProblems(pickAreas(inputs), view)).toEqual([
      { selectable: "fx-edge", problem: "outside", other: null },
      { selectable: "fx-left", problem: "core", other: "fx-right" },
      { selectable: "fx-right", problem: "core", other: "fx-left" },
      { selectable: "fx-right", problem: "member", other: "fx-under" },
    ]);
    // Apart, nothing to report.
    const apart = pickAreas([
      { id: "fx-one", members: [member(50, 50, 60, 60)] },
      { id: "fx-two", members: [member(200, 50, 60, 60)] },
    ]);
    expect(pickProblems(apart, view)).toEqual([]);
  });
});
