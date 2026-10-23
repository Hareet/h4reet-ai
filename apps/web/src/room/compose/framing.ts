// The camera's framing (spec 004; FR-009, FR-019; R-08, R-18), spec 002's algorithm moved here from
// `src/room/framing.ts` (spec 002, FR-005, FR-047; its contracts/room-scene.md §6) with the boxes as an argument: the
// camera looks straight down −Z from x = 0 at the eye's height, as close as it can be while every corner of every box
// fits in the view with a margin, so in portrait it moves back rather than cropping. The compositor frames the scene's
// framed boxes with it at the six aspects (RG5) and projects the 2D room through framing(1.6); the room frames its
// camera with it; the lookdev page frames its close-up. A box is the catalog's expected bounds at the stylized scale,
// or a set model's measured bounds (FR-019), its top raised by `withLabel` where a stand-in's label floats over it.
import type { Vec3 } from "./math";
import type { Camera } from "./project";

/** A box in world metres: `min` below `max` on every axis. */
export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** The vertical field of view, in degrees. */
export const FOV = 45;
/** The camera's height, the middle of the floor-to-artwork span. */
export const EYE_Y = 1.5;
/** A margin around the boxes, as a share of the view: 6%. */
export const MARGIN = 1.06;
/** A stand-in's label floats this far above its piece's top... */
export const LABEL_LIFT = 0.18;
/** ...and is this tall, which the framing leaves room for. */
export const LABEL_HEIGHT = 0.1;
/** Spec 002's camera's clipping planes (its scene.ts fitCamera). */
export const NEAR = 0.1;
export const FAR = 80;

/** The box with its top raised for the label over it, as spec 002's framing raises every piece's. */
export function withLabel(box: Box): Box {
  return { min: box.min, max: [box.max[0], box.max[1] + LABEL_LIFT + LABEL_HEIGHT, box.max[2]] };
}

/**
 * The camera for a stage of this aspect (width over height): straight down −Z from x = 0 at EYE_Y, as close as it can
 * be while every corner of every box fits in the view with the margin. Only each box's near face binds: its far
 * corners are further away, so they project inside the near ones.
 */
export function framing(aspect: number, boxes: readonly Box[]): Camera {
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  let z = 0;
  for (const { min, max } of boxes) {
    const near = max[2];
    for (const x of [min[0], max[0]]) {
      for (const y of [min[1], max[1]]) {
        z = Math.max(z, near + (Math.abs(x) * MARGIN) / tanH, near + (Math.abs(y - EYE_Y) * MARGIN) / tanV);
      }
    }
  }
  return { fov: FOV, near: NEAR, far: FAR, position: [0, EYE_Y, z], target: [0, EYE_Y, z - 1] };
}
