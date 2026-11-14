// A stand-in shape's extent in its piece's frame (spec 004's RG2 reading, moved here from build/room/checks/rg.ts by
// spec 024's T004, unchanged): the support of its own geometry through T(at) · R(turn) · S(scale) along each axis, so a
// turned round shape counts its true size; a tube's `from` and `to` and a polygon's points are in that frame, and a
// polygon's depth is centred on its plane, as a box's is. RG checks it, the room's stand-in builders
// (scene/standins.ts) are held to it, and the eating's keep-out boxes (eat/keepouts.ts) measure a mounted stand-in by
// it, so all three read one extent. It takes the catalog's entry (scale a number, a vector, or absent) and the bundle's
// resolved shape alike.
import type { Box } from "./framing";
import { dot, normalize, rotation, sub } from "./math";
import type { Turn, Vec3 } from "./math";

/** A stand-in shape, as the catalog authors it or the bundle resolves it. */
export type ShapeLike = { readonly at: Vec3; readonly turn: Turn; readonly scale?: number | Vec3 | undefined } & (
  | { readonly shape: "box"; readonly size: Vec3 }
  | { readonly shape: "cylinder"; readonly radius: number; readonly height: number }
  | { readonly shape: "capsule"; readonly radius: number; readonly length: number }
  | { readonly shape: "sphere"; readonly radius: number }
  | { readonly shape: "torus"; readonly radius: number; readonly tube: number }
  | { readonly shape: "plane"; readonly size: readonly [number, number] }
  | { readonly shape: "circle"; readonly radius: number }
  | { readonly shape: "tube"; readonly from: Vec3; readonly to: Vec3; readonly radius: number }
  | { readonly shape: "polygon"; readonly points: readonly (readonly [number, number])[]; readonly depth: number }
);

/** The interval a shape spans along one axis of its piece's frame, around its `at`: the support of its own geometry
 *  in each direction of `d`, the matching row of R(turn) · S(scale). */
function span(s: ShapeLike, d: Vec3): readonly [number, number] {
  const [d0, d1, d2] = d;
  const abs = Math.abs;
  const round = Math.hypot(d0, d1, d2);
  const symmetric = (h: number): readonly [number, number] => [-h, h];
  switch (s.shape) {
    case "box":
      return symmetric((abs(s.size[0]) * abs(d0) + abs(s.size[1]) * abs(d1) + abs(s.size[2]) * abs(d2)) / 2);
    case "cylinder":
      return symmetric(abs(s.radius) * Math.hypot(d0, d2) + (abs(s.height) / 2) * abs(d1));
    case "capsule":
      return symmetric(abs(s.radius) * round + (abs(s.length) / 2) * abs(d1));
    case "sphere":
      return symmetric(abs(s.radius) * round);
    case "torus":
      return symmetric(abs(s.radius) * Math.hypot(d0, d1) + abs(s.tube) * round);
    case "plane":
      return symmetric((abs(s.size[0]) * abs(d0) + abs(s.size[1]) * abs(d1)) / 2);
    case "circle":
      return symmetric(abs(s.radius) * Math.hypot(d0, d1));
    case "tube": {
      // The segment, with a disc of its radius square to it at each end.
      const [p, q] = [dot(d, s.from), dot(d, s.to)];
      const axis = sub(s.to, s.from);
      const n = normalize(axis);
      const along = dot(d, n);
      const disc =
        axis[0] === 0 && axis[1] === 0 && axis[2] === 0
          ? abs(s.radius) * round
          : abs(s.radius) * Math.hypot(d0 - along * n[0], d1 - along * n[1], d2 - along * n[2]);
      return [Math.min(p, q) - disc, Math.max(p, q) + disc];
    }
    case "polygon": {
      let [lo, hi] = [Infinity, -Infinity];
      for (const [x, y] of s.points)
        for (const z of [-s.depth / 2, s.depth / 2]) {
          const v = d0 * x + d1 * y + d2 * z;
          [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
        }
      return [lo, hi];
    }
  }
}

/** A stand-in shape's extent in its piece's frame: around `at`, its own geometry through R(turn) · S(scale). */
export function shapeBox(s: ShapeLike): Box {
  const r = rotation(s.turn);
  const [sx, sy, sz] = typeof s.scale === "number" ? [s.scale, s.scale, s.scale] : (s.scale ?? [1, 1, 1]);
  // Each axis takes its row of R · S, R column-major: element (k, c) at index c × 4 + k.
  const [x, y, z] = [
    span(s, [r[0] * sx, r[4] * sy, r[8] * sz]),
    span(s, [r[1] * sx, r[5] * sy, r[9] * sz]),
    span(s, [r[2] * sx, r[6] * sy, r[10] * sz]),
  ];
  return {
    min: [s.at[0] + x[0], s.at[1] + y[0], s.at[2] + z[0]],
    max: [s.at[0] + x[1], s.at[1] + y[1], s.at[2] + z[1]],
  };
}
