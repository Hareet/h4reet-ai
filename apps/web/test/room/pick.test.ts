// T062 (spec 004; FR-064, SC-009; R-19, R-20; data-model.md §4.5; contracts/room-data-files.md §5.5, RG6): the kernel's
// projection, `compose/project.ts`, held to three.js's Vector3.project for the room's camera, which looks straight down
// −Z; and its pick areas, `compose/pick.ts`, one function for the build's spacing check and the room's pointer. Each
// selectable's area is the union of its members' CSS-pixel rectangles with an exclusive 44 × 44 core centred on that
// union. A pick goes to the frontmost member rectangle under the point; else to the selectable whose union and core
// contain the point and whose union is nearest, ties to scene order; else to none. In 2D, 44 px converts at the
// drawing's scale, min(W ÷ 320, H ÷ 200). Every ID is a synthetic `fx-` one, and the room's camera frames the known-good
// set's boxes as compose() gives them (T112 took spec 002's layout, which it framed until then, out of the code).
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { framing } from "../../src/room/compose/framing";
import type { Box } from "../../src/room/compose/framing";
import type { Vec3 } from "../../src/room/compose/math";
import { CORE_PX, flatCore, listOnly, memberRect, pick, pickAreas, pickProblems } from "../../src/room/compose/pick";
import type { MemberRect, PickInput, Rect } from "../../src/room/compose/pick";
import { project, toStage, viewDepth } from "../../src/room/compose/project";
import type { Camera } from "../../src/room/compose/project";
import { ASPECTS, REFERENCE_PHONE, SMALLEST } from "../../src/room/compose/stages";
import { goodTree } from "../helpers/room-fixtures";

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

/** The known-good set's framed boxes, as compose() gives the 3D part's: each grown for its label where a stand-in's
 *  floats over it. */
const FRAMED: Box[] = compose(goodTree(), noPolicy(), { mode: "strict", drafts: false })
  .scene.placements.filter((p) => p.framed)
  .map((p) => p.frame_box);

/** The room's camera, as scene/bundle3d.ts's frameCamera sets it: the framing's place and target, near 0.1, far 80. */
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
  it("equals three.js's Vector3.project for the room's camera at each of the six aspects, within 1e-9", () => {
    const next = stream(0x5eed0062);
    for (const aspect of ASPECTS) {
      const camera = framing(aspect, FRAMED);
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

  it("maps device coordinates to CSS pixels from the stage's corner, and gives a point's depth before the camera", () => {
    const stage = { w: 368, h: 420 };
    expect(toStage([-1, 1, 0], stage)).toEqual([0, 0]);
    expect(toStage([1, -1, 0], stage)).toEqual([368, 420]);
    expect(toStage([0, 0, 0.5], stage)).toEqual([184, 210]);
    const camera = framing(1.6, FRAMED);
    expect(viewDepth([0, 1.5, -2], camera)).toBeCloseTo(camera.position[2] + 2, 12);
    expect(viewDepth([0, 1.5, camera.position[2] + 1], camera)).toBeCloseTo(-1, 12);
  });
});

describe("a member's rectangle in 3D", () => {
  it("is the CSS-pixel bounds of its box's projected corners, with the depth of its nearest corner", () => {
    const stage = REFERENCE_PHONE.stage;
    const aspect = stage.w / stage.h;
    const camera = framing(aspect, FRAMED);
    const three = threeCamera(camera, aspect);
    expect(FRAMED.length).toBeGreaterThan(3);
    for (const box of FRAMED) {
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
    const camera = framing(1.6, FRAMED);
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

  it("convert 44 px to the 2D drawing's units at its scale, min(W ÷ 320, H ÷ 200)", () => {
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

  it("report a core over another selectable's union, where a pick that misses every member goes to it (words-1)", () => {
    // fx-small's core [83, 83, 44, 44] meets neither fx-split's members nor its core [68, 133, 44, 44], but lies in
    // the gap between its members, inside its union [85, 0, 10, 310].
    const areas = pickAreas([
      { id: "fx-small", members: [member(100, 100, 10, 10)] },
      { id: "fx-split", members: [member(85, 0, 10, 10), member(85, 300, 10, 10)] },
    ]);
    expect(areas.map((a) => a.core)).toEqual([
      [83, 83, 44, 44],
      [68, 133, 44, 44],
    ]);
    // A point of fx-small's core off its member goes to fx-split, whose union holds it.
    expect(pick(areas, [90, 100])).toBe("fx-split");
    expect(pickProblems(areas, [0, 0, 400, 400])).toEqual([
      { selectable: "fx-small", problem: "union", other: "fx-split" },
    ]);
  });
});

// T292, T303 (spec 004; FR-064, SC-009; data-model.md §4.5; contracts/room-data-files.md §13.3): FR-064's carve-out in
// the kernel, as T302's answer has it: at any stage, `listOnly` gives the side-wall selectables that can't keep their
// exclusive core there, and none that can. A held selectable has no area: a pick whose frontmost member is one of its
// members selects nothing (Reading R3), its core and union hold no point, and it is no problem's subject, nor its core
// or union another's problem; its members still are.
describe("FR-064's carve-out (compose/pick.ts listOnly)", () => {
  const view: Rect = [0, 0, 304, 208];
  const inputs: PickInput[] = [
    // Two side-wall selectables whose cores overlap, and one far off that keeps its core.
    { id: "fx-side-a", members: [member(60, 40, 8, 30)] },
    { id: "fx-side-b", members: [member(60, 70, 8, 30)] },
    { id: "fx-side-c", members: [member(250, 40, 8, 30)] },
    // Two selectables that aren't side-wall, whose cores overlap too.
    { id: "fx-desk-a", members: [member(150, 150, 10, 10)] },
    { id: "fx-desk-b", members: [member(170, 150, 10, 10)] },
  ];
  const areas = pickAreas(inputs);
  const sideWall: ReadonlySet<string> = new Set(["fx-side-a", "fx-side-b", "fx-side-c"]);

  it("holds the side-wall selectables that can't keep their core, whatever the stage", () => {
    expect([...listOnly(areas, view, sideWall)]).toEqual(["fx-side-a", "fx-side-b"]);
    // The same rectangles on a desktop-sized stage: the stage's size bounds nothing.
    expect([...listOnly(areas, [0, 0, 686.4, 640], sideWall)]).toEqual(["fx-side-a", "fx-side-b"]);
  });

  it("holds none that keeps its core, and none that the index doesn't flag side_wall", () => {
    // Apart, on a larger stage, every core fits.
    const apart = pickAreas([
      { id: "fx-side-a", members: [member(60, 40, 8, 30)] },
      { id: "fx-side-b", members: [member(60, 140, 8, 30)] },
    ]);
    expect([...listOnly(apart, [0, 0, 686.4, 640], sideWall)]).toEqual([]);
    expect([...listOnly(areas, view, new Set())]).toEqual([]);
    expect([...listOnly(areas, view, new Set(["fx-desk-a"]))]).toEqual(["fx-desk-a"]);
  });

  it("picks nothing where a held selectable's member is frontmost, and gives its core and union no point", () => {
    const held = new Set(["fx-side-a"]);
    // On fx-side-a's member.
    expect(pick(areas, [64, 55])).toBe("fx-side-a");
    expect(pick(areas, [64, 55], held)).toBeNull();
    // In both side-wall cores, off both members: the nearer union without the hold, the other with it.
    expect(pick(areas, [50, 66])).toBe("fx-side-a");
    expect(pick(areas, [50, 66], held)).toBe("fx-side-b");
    // A member in front of a held one still picks.
    const stacked = pickAreas([
      { id: "fx-wall", members: [member(0, 0, 100, 100, 6)] },
      { id: "fx-shelf", members: [member(40, 40, 20, 20, 2)] },
    ]);
    expect(pick(stacked, [50, 50], new Set(["fx-wall"]))).toBe("fx-shelf");
    expect(pick(stacked, [10, 10], new Set(["fx-wall"]))).toBeNull();
  });

  it("keeps a held selectable out of the spacing check, but not another's core over its members", () => {
    expect(pickProblems(areas, view)).toEqual([
      { selectable: "fx-side-a", problem: "core", other: "fx-side-b" },
      { selectable: "fx-side-a", problem: "member", other: "fx-side-b" },
      { selectable: "fx-side-b", problem: "core", other: "fx-side-a" },
      { selectable: "fx-side-b", problem: "member", other: "fx-side-a" },
      { selectable: "fx-desk-a", problem: "core", other: "fx-desk-b" },
      { selectable: "fx-desk-a", problem: "member", other: "fx-desk-b" },
      { selectable: "fx-desk-b", problem: "core", other: "fx-desk-a" },
      { selectable: "fx-desk-b", problem: "member", other: "fx-desk-a" },
    ]);
    // fx-side-a held: it is no subject, and fx-side-b's core over its core goes; over its member stays.
    expect(pickProblems(areas, view, new Set(["fx-side-a"]))).toEqual([
      { selectable: "fx-side-b", problem: "member", other: "fx-side-a" },
      { selectable: "fx-desk-a", problem: "core", other: "fx-desk-b" },
      { selectable: "fx-desk-a", problem: "member", other: "fx-desk-b" },
      { selectable: "fx-desk-b", problem: "core", other: "fx-desk-a" },
      { selectable: "fx-desk-b", problem: "member", other: "fx-desk-a" },
    ]);
    // A held selectable's union holds no point, so a core in the gap between its members is no problem.
    const split = pickAreas([
      { id: "fx-small", members: [member(100, 100, 10, 10)] },
      { id: "fx-split", members: [member(85, 0, 10, 10), member(85, 300, 10, 10)] },
    ]);
    expect(pickProblems(split, [0, 0, 400, 400])).toEqual([
      { selectable: "fx-small", problem: "union", other: "fx-split" },
    ]);
    expect(pickProblems(split, [0, 0, 400, 400], new Set(["fx-split"]))).toEqual([]);
  });
  // The review of T116, C1: a deterministic release pass, in scene order. A held selectable keeps its pick area after
  // all where releasing it alone gives no problem with it as subject and no problem that wasn't there before.
  it("releases the first of two side-wall selectables whose cores meet only each other's core", () => {
    const column = (ids: readonly string[]) =>
      pickAreas(ids.map((id, k) => ({ id, members: [member(60, 40 + 40 * k, 4, 10)] })));
    const both = new Set(["fx-side-a", "fx-side-b", "fx-side-c"]);
    // Each core meets the next one's core and no member.
    expect(pickProblems(column(["fx-side-a", "fx-side-b"]), view).map((p) => p.problem)).toEqual(["core", "core"]);
    expect([...listOnly(column(["fx-side-a", "fx-side-b"]), view, both)]).toEqual(["fx-side-b"]);
    // Scene order decides which keeps its tap.
    expect([...listOnly(column(["fx-side-b", "fx-side-a"]), view, both)]).toEqual(["fx-side-a"]);
    // Three in a column: the first keeps its tap, the second is held, and the third, whose core meets only the held
    // second's, keeps its tap too.
    const three = column(["fx-side-a", "fx-side-b", "fx-side-c"]);
    expect([...listOnly(three, view, both)]).toEqual(["fx-side-b"]);
    expect(pickProblems(three, view, listOnly(three, view, both))).toEqual([]);
  });

  it("keeps a selectable held where releasing it would give another selectable a problem it didn't have", () => {
    // fx-side-a's two members stand far apart, so a core in the gap between them meets its union; fx-desk-a's does
    // once fx-side-a has an area. fx-side-b's core meets fx-side-a's core alone.
    const gap = pickAreas([
      { id: "fx-side-a", members: [member(85, 0, 10, 10), member(85, 300, 10, 10)] },
      { id: "fx-side-b", members: [member(130, 150, 4, 4)] },
      { id: "fx-desk-a", members: [member(100, 100, 10, 10)] },
    ]);
    const square: Rect = [0, 0, 400, 400];
    const both = new Set(["fx-side-a", "fx-side-b"]);
    expect([...listOnly(gap, square, both)]).toEqual(["fx-side-a"]);
    expect(pickProblems(gap, square, new Set(["fx-side-a"]))).toEqual([]);
    expect(pickProblems(gap, square, new Set(["fx-side-b"]))).toContainEqual({
      selectable: "fx-desk-a",
      problem: "union",
      other: "fx-side-a",
    });
  });
});
