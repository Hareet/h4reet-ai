// T066's cable half (spec 004; FR-020, FR-043, FR-051, FR-058; R-22; data-model.md §4.4; contracts/room-data-files.md
// §5.4), written with the kernel's `compose/cable.ts` (T072); T066's RS1 to RS6 cases, on the compositor's fixtures,
// join this file. The run the room draws from the shown case's lead end to the `to` anchor: 16 points along the
// straight line lowered by sag × span × 4t(1 − t), clamped above the `rest` plane, then the `drop` behind the edge,
// its radius times the switch piece's stylized scale. Moving the parent, the laptop's stand, or the desk needs no
// re-export: only the pose decides where the lead's end is.
import { describe, expect, it } from "vitest";

import { CABLE_POINTS, cableControl, cableRun, restPlane } from "../../src/room/compose/cable";
import { multiply, rotation, translation } from "../../src/room/compose/math";
import type { Vec3 } from "../../src/room/compose/math";

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-12, what = ""): void {
  expect(actual.length, what).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    const [a, e] = [actual[i] ?? Number.NaN, expected[i] ?? Number.NaN];
    expect(Math.abs(a - e), `${what}[${i}]: ${a} against ${e}`).toBeLessThanOrEqual(tolerance);
  }
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const span = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

describe("the cable's run (compose/cable.ts)", () => {
  const from: Vec3 = [-0.3, 0.95, -1.3];
  const to: Vec3 = [0.2, 0.75, -1.79];

  it("samples 16 points from the lead's end to the anchor, lowered by sag × span × 4t(1 − t)", () => {
    expect(CABLE_POINTS).toBe(16);
    const run = cableRun({ from, to, sag: 0.2, radius: 0.004, scale: 1, drop: 0, rest: null });
    expect(run.points).toHaveLength(16);
    expectClose(run.points[0] ?? [], from);
    expectClose(run.points[15] ?? [], to);
    const s = span(from, to);
    run.points.forEach((p, i) => {
      const t = i / 15;
      const straight = lerp(from, to, t);
      expectClose(p, [straight[0], straight[1] - 0.2 * s * 4 * t * (1 - t), straight[2]], 1e-12, `point ${i}`);
    });
    // No sag: the straight line.
    const taut = cableRun({ from, to, sag: 0, radius: 0.004, scale: 1, drop: 0, rest: null });
    taut.points.forEach((p, i) => expectClose(p, lerp(from, to, i / 15), 1e-12, `taut ${i}`));
  });

  it("takes its radius times the switch piece's stylized scale, and falls by the drop behind the anchor", () => {
    const run = cableRun({ from, to, sag: 0.1, radius: 0.004, scale: 2.5, drop: 0.1, rest: null });
    expect(run.radius).toBeCloseTo(0.01, 15);
    expectClose(run.drop ?? [], [to[0], to[1] - 0.1, to[2]]);
    expect(cableRun({ from, to, sag: 0.1, radius: 0.004, scale: 1, drop: 0, rest: null }).drop).toBeNull();
  });

  it("never dips below the rest plane, so a lead lying on a surface lies on it", () => {
    const surface = restPlane(translation([0, 0.75, -1.5]));
    expectClose(surface.point, [0, 0.75, -1.5]);
    expectClose(surface.normal, [0, 1, 0]);
    // Both ends on the surface: the whole run lies on it.
    const flat = cableRun({
      from: [-0.3, 0.75, -1.3],
      to,
      sag: 0.3,
      radius: 0.004,
      scale: 1,
      drop: 0.12,
      rest: surface,
    });
    for (const p of flat.points) expect(p[1]).toBeCloseTo(0.75, 15);
    // The drop still falls behind the edge, below the surface.
    expect(flat.drop?.[1]).toBeCloseTo(0.63, 15);
    // From above it: the sag reaches the surface and goes no lower; the points above it keep their sag.
    const high = cableRun({ from, to, sag: 0.5, radius: 0.004, scale: 1, drop: 0, rest: surface });
    const free = cableRun({ from, to, sag: 0.5, radius: 0.004, scale: 1, drop: 0, rest: null });
    let clamped = 0;
    high.points.forEach((p, i) => {
      const f = free.points[i] ?? [0, 0, 0];
      if (f[1] < 0.75) {
        clamped += 1;
        expectClose(p, [f[0], 0.75, f[2]], 1e-12, `clamped ${i}`);
      } else expectClose(p, f, 0, `free ${i}`);
    });
    expect(clamped).toBeGreaterThan(0);
  });

  it("clamps along a tilted rest plane's normal", () => {
    const tilted = restPlane(multiply(translation([0, 0.8, -1.5]), rotation({ x: 20, y: 0, z: 0 })));
    const n = tilted.normal;
    expect(Math.hypot(...n)).toBeCloseTo(1, 15);
    const run = cableRun({
      from: [-0.4, 1.2, -1.2],
      to: [0.4, 0.9, -1.8],
      sag: 0.5,
      radius: 0.004,
      scale: 1,
      drop: 0,
      rest: tilted,
    });
    for (const p of run.points) {
      const d = (p[0] - tilted.point[0]) * n[0] + (p[1] - tilted.point[1]) * n[1] + (p[2] - tilted.point[2]) * n[2];
      expect(d).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it("gives the quadratic curve the unclamped run is, for the 2D drawing's {from, control, to}", () => {
    const control = cableControl(from, to, 0.2);
    const run = cableRun({ from, to, sag: 0.2, radius: 0.004, scale: 1, drop: 0, rest: null });
    run.points.forEach((p, i) => {
      const t = i / 15;
      const q: Vec3 = [0, 1, 2].map(
        (k) => (1 - t) ** 2 * (from[k] ?? 0) + 2 * t * (1 - t) * (control[k] ?? 0) + t ** 2 * (to[k] ?? 0),
      ) as unknown as Vec3;
      expectClose(p, q, 1e-12, `Bézier ${i}`);
    });
  });
});
