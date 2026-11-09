// The cable (spec 004; FR-020, FR-043, FR-051, FR-058; R-22; data-model.md §4.4; contracts/room-data-files.md §5.4): the
// part of the charger's cable the room draws at run time, from the free end of the lead the shown case places to the
// `to` anchor (the desk's back edge), so moving the laptop, its stand, or the desk needs no re-export and only the
// plug's pose decides whether the cable reaches the port. Sixteen points along the straight line, lowered by
// sag × span × 4t(1 − t), their centreline never nearer the `rest` plane than the tube's radius (so a lead lying on the
// desk lies on it), then a short drop behind the edge; its radius is the binding's times the switch piece's stylized
// scale (FR-051). The 3D scene makes one tube of it per pose; the 2D drawing draws the unclamped run as one quadratic
// curve, {from, control, to}.
import { dot, length, normalize, origin, scale, sub, transformDirection } from "./math";
import type { Mat4, Vec3 } from "./math";

/** How many points the run samples, from the lead's end to the anchor, both included. */
export const CABLE_POINTS = 16;

/** A plane the run never dips below: a point on it and its unit normal, the side the run keeps to. */
export interface CablePlane {
  readonly point: Vec3;
  readonly normal: Vec3;
}

export interface CableInput {
  /** The lead's free end at the shown pose, in the world. */
  readonly from: Vec3;
  /** The `to` anchor, in the world. */
  readonly to: Vec3;
  /** 0 to 0.5 of the span (RS6). */
  readonly sag: number;
  /** Metres at scale 1. */
  readonly radius: number;
  /** The switch piece's stylized scale. */
  readonly scale: number;
  /** The fall behind `to`, in metres; 0 for none. */
  readonly drop: number;
  readonly rest: CablePlane | null;
}

export interface CableRun {
  /** CABLE_POINTS points from `from` to `to`. */
  readonly points: readonly Vec3[];
  /** Where the drop behind `to` ends, straight down; null without one. */
  readonly drop: Vec3 | null;
  /** The tube's radius in metres: the binding's times the piece's stylized scale. */
  readonly radius: number;
}

/** The plane of an anchor's frame in the world: through its origin, normal to its +Y. */
export function restPlane(anchor: Mat4): CablePlane {
  return { point: origin(anchor), normal: normalize(transformDirection(anchor, [0, 1, 0])) };
}

export function cableRun(input: CableInput): CableRun {
  const { from, to, sag, rest } = input;
  const span = length(sub(to, from));
  const radius = input.radius * input.scale;
  const points: Vec3[] = [];
  for (let i = 0; i < CABLE_POINTS; i += 1) {
    const t = i / (CABLE_POINTS - 1);
    let p: Vec3 = [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t - sag * span * 4 * t * (1 - t),
      from[2] + (to[2] - from[2]) * t,
    ];
    if (rest) {
      // The centreline keeps the tube's radius above the plane, so the tube lies on the surface, not half into it.
      const below = dot(sub(p, rest.point), rest.normal) - radius;
      if (below < 0) p = sub(p, scale(rest.normal, below));
    }
    points.push(p);
  }
  const drop: Vec3 | null = input.drop > 0 ? [to[0], to[1] - input.drop, to[2]] : null;
  return { points, drop, radius };
}

/**
 * The control point that makes the unclamped run a quadratic Bézier from `from` to `to`: the run is
 * (1 − t)² · from + 2t(1 − t) · control + t² · to, with control = (from + to) ÷ 2 − (0, 2 · sag · span, 0).
 */
export function cableControl(from: Vec3, to: Vec3, sag: number): Vec3 {
  const span = length(sub(to, from));
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 2 * sag * span, (from[2] + to[2]) / 2];
}
