// The stand-ins' nine shapes (spec 004; FR-005, FR-057; R-03, R-27; data-model.md §3; contracts/room-data-files.md
// §4.1): each shape of the closed grammar as its three.js geometry, read as the compositor's RG family reads it
// (checks/rg.ts's shapeBox), so what RG checked is what the room draws. A shape stands in its piece's frame at scale 1,
// at T(at) · R(turn) · S(scale), its turn in degrees about Y, then X, then Z (three.js's Euler order "YXZ"). A cylinder
// and a capsule run along Y, a capsule's length being its cylinder part (its whole height length + 2 × radius); a torus
// lies in the XY plane, and a plane and a circle face +Z; a tube's `from` and `to` and a polygon's points are in the
// shape's own frame, and a polygon's depth is centred on z = 0. A size counts by its magnitude, as RG's extents do. Round
// shapes are tessellated with their vertices on the true surface, a multiple of four segments around, so a drawn shape
// never leaves RG's extent, and an unturned one reaches it along each axis. A piece shows its stand-in while it has no
// set model, and again after a model fails to load (FR-057).
import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  Shape as Polygon,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Quaternion,
  Vector2,
  Vector3,
} from "three";
import type { BufferGeometry } from "three";

import type { Shape } from "../compose/bundle";
import { DEG } from "../compose/math";
import type { Vec3 } from "../compose/math";
import type { Materials } from "./look";

/** Segments around a round shape: a multiple of four, so its extremes along each axis are vertices. */
const AROUND = 24;
/** A sphere's rows from pole to pole, even so the equator is one; and the rows of each of a capsule's caps. */
const SPHERE_ROWS = 12;
const CAP_ROWS = 6;
/** Segments around a torus's ring and around its tube, and around a tube: multiples of four too. */
const RING_AROUND = 48;
const TUBE_AROUND = 12;

const Y = new Vector3(0, 1, 0);

/** A closed cylinder of the radius from `from` to `to`: three.js's along Y, turned onto the run and moved to its middle. */
function tubeGeometry(from: Vec3, to: Vec3, radius: number): BufferGeometry {
  const [a, b] = [new Vector3(...from), new Vector3(...to)];
  const run = b.clone().sub(a);
  const span = run.length();
  const geometry = new CylinderGeometry(radius, radius, span, TUBE_AROUND);
  if (span > 0) geometry.applyQuaternion(new Quaternion().setFromUnitVectors(Y, run.divideScalar(span)));
  return geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/** The points extruded along Z by the depth, centred on z = 0; flat, facing +Z, when the depth is 0. */
function polygonGeometry(points: readonly (readonly [number, number])[], depth: number): BufferGeometry {
  const outline = new Polygon(points.map(([x, y]) => new Vector2(x, y)));
  if (depth === 0) return new ShapeGeometry(outline);
  return new ExtrudeGeometry(outline, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

/** A shape's geometry in its own frame, from data-model.md §3's size fields. */
export function shapeGeometry(s: Shape): BufferGeometry {
  const abs = Math.abs;
  switch (s.shape) {
    case "box":
      return new BoxGeometry(abs(s.size[0]), abs(s.size[1]), abs(s.size[2]));
    case "cylinder":
      return new CylinderGeometry(abs(s.radius), abs(s.radius), abs(s.height), AROUND);
    case "capsule":
      return new CapsuleGeometry(abs(s.radius), abs(s.length), CAP_ROWS, AROUND);
    case "sphere":
      return new SphereGeometry(abs(s.radius), AROUND, SPHERE_ROWS);
    case "torus":
      return new TorusGeometry(abs(s.radius), abs(s.tube), TUBE_AROUND, RING_AROUND);
    case "plane":
      return new PlaneGeometry(abs(s.size[0]), abs(s.size[1]));
    case "circle":
      return new CircleGeometry(abs(s.radius), AROUND);
    case "tube":
      return tubeGeometry(s.from, s.to, abs(s.radius));
    case "polygon":
      return polygonGeometry(s.points, abs(s.depth));
  }
}

/** A shape as a mesh at T(at) · R(turn) · S(scale) in its piece's frame, in the look's material for its colour, lit
 *  unless `lit: false`. Only what the look shades casts and receives its shadows. */
export function standinMesh(s: Shape, materials: Materials): Mesh {
  const mesh = new Mesh(shapeGeometry(s), materials.of(s.color, s.lit));
  mesh.position.set(s.at[0], s.at[1], s.at[2]);
  mesh.rotation.set(s.turn.x * DEG, s.turn.y * DEG, s.turn.z * DEG, "YXZ");
  mesh.scale.set(s.scale[0], s.scale[1], s.scale[2]);
  mesh.castShadow = mesh.receiveShadow = materials.shaded && s.lit;
  return mesh;
}

/** A piece's stand-in: a mesh for each of its shapes, in order, in the piece's frame at scale 1. */
export function standin(shapes: readonly Shape[], materials: Materials): Group {
  const group = new Group();
  group.name = "standin";
  for (const s of shapes) group.add(standinMesh(s, materials));
  return group;
}
