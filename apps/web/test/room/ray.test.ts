// T031 (spec 008; FR-030 to FR-032; plan.md R-11): compose/project.ts's `ray`, the inverse of its projection, through
// which a click or a tap on the stage finds the floor's point under it; and compose/floor.ts's `floorPoint`, that point
// where the ray meets the floor inside the shell's floor rectangle, or none. Every point along a ray projects back to
// its normalized device coordinates within 1e-9, for the production framing and for follow cameras; a ray that meets
// the floor outside the shell's floor, or never meets it, gives no point.
import { describe, expect, it } from "vitest";

import { floorOfPart, floorPoint } from "../../src/room/compose/floor";
import type { WalkableFloor } from "../../src/room/compose/floor";
import { framing } from "../../src/room/compose/framing";
import type { Vec3 } from "../../src/room/compose/math";
import { planeHit, project, ray } from "../../src/room/compose/project";
import type { Camera } from "../../src/room/compose/project";
import { framedBoxes } from "../../src/room/scene/bundle3d";
import { repositoryBundle } from "../helpers/room";

const along = (origin: Vec3, direction: Vec3, t: number): Vec3 => [
  origin[0] + direction[0] * t,
  origin[1] + direction[1] * t,
  origin[2] + direction[2] * t,
];

function cameras(): { name: string; camera: Camera; aspect: number }[] {
  const boxes = framedBoxes(repositoryBundle().scene);
  const out: { name: string; camera: Camera; aspect: number }[] = [];
  for (const aspect of [0.45, 1, 16 / 10, 2.4])
    out.push({ name: `the production framing at ${aspect}`, camera: framing(aspect, boxes), aspect });
  // Follow cameras: above and in front of the strip, looking down at the figure's height.
  const base = framing(1.5, boxes);
  for (const [i, position] of (
    [
      [0.6, 1.9, 1.6],
      [-0.9, 1.4, 1.2],
      [0, 1.15, 2.2],
    ] as Vec3[]
  ).entries())
    out.push({ name: `follow camera ${i + 1}`, camera: { ...base, position, target: [-0.3, 1.1, 0.4] }, aspect: 1.3 });
  return out;
}

describe("ray (R-11)", () => {
  it.each(cameras().map((c) => [c.name, c] as const))(
    "inverts project within 1e-9, for %s",
    (_, { camera, aspect }) => {
      for (const ndc of [
        [0, 0],
        [0.5, -0.25],
        [-0.9, 0.8],
        [0.99, -0.99],
        [-0.3, -0.7],
      ] as const) {
        const r = ray(camera, aspect, ndc);
        expect(Math.hypot(...r.direction)).toBeCloseTo(1, 12);
        for (const t of [0.5, 1, 2.5, 7]) {
          const p = project(along(r.origin, r.direction, t), camera, aspect);
          expect(Math.abs(p[0] - ndc[0]), `${ndc} at ${t}`).toBeLessThanOrEqual(1e-9);
          expect(Math.abs(p[1] - ndc[1]), `${ndc} at ${t}`).toBeLessThanOrEqual(1e-9);
        }
      }
    },
  );

  it("meets a horizontal plane ahead of its origin, and never one behind it or parallel to it", () => {
    const r = { origin: [0, 2, 0] as Vec3, direction: [0, -Math.SQRT1_2, -Math.SQRT1_2] as Vec3 };
    expect(planeHit(r, 0)).toEqual([0, -2]);
    expect(planeHit(r, 3)).toBeNull();
    expect(planeHit({ origin: [0, 2, 0], direction: [1, 0, 0] }, 0)).toBeNull();
  });
});

describe("the floor's point under a click (FR-032)", () => {
  const floor = (): WalkableFloor => floorOfPart(repositoryBundle().scene, 0.12) as WalkableFloor;

  it("is where the ray meets the floor, inside the shell's floor rectangle", () => {
    const boxes = framedBoxes(repositoryBundle().scene);
    const camera = framing(16 / 10, boxes);
    const f = floor();
    // The figure's start, projected, sends a ray back to the floor point under it.
    const start: Vec3 = [f.start.x, f.feetY, f.start.z];
    const ndc = project(start, camera, 16 / 10);
    const point = floorPoint(f, ray(camera, 16 / 10, [ndc[0], ndc[1]]));
    expect(point).not.toBeNull();
    expect(Math.abs((point?.[0] ?? 9) - f.start.x)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs((point?.[1] ?? 9) - f.start.z)).toBeLessThanOrEqual(1e-9);
  });

  it("is none off the floor: a ray into the back wall's height above the horizon, or one landing past the open edge", () => {
    const boxes = framedBoxes(repositoryBundle().scene);
    const camera = framing(16 / 10, boxes);
    const f = floor();
    // The top of the view looks at the walls and above the horizon of a camera at eye height: no floor under it.
    expect(floorPoint(f, ray(camera, 16 / 10, [0, 0.95]))).toBeNull();
    // A point on the floor's plane in front of the open edge is outside the shell's floor.
    const outside: Vec3 = [0, f.feetY, f.shell.z1 + 0.3];
    const ndc = project(outside, camera, 16 / 10);
    expect(floorPoint(f, ray(camera, 16 / 10, [ndc[0], ndc[1]]))).toBeNull();
  });
});
