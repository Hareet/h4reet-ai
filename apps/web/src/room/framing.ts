// The work area's layout and the camera's framing (spec 002, FR-005, FR-047; contracts/room-scene.md §2 and §6), in
// metres, with no Three.js: the 3D scene builds its placeholders from LAYOUT, and `framing` places the camera so that
// every piece is on screen at any aspect, from a wide desktop to a 320-pixel portrait phone. In portrait the camera
// moves back rather than cropping: the twin, the desk, the snowboard, and the bicycle stay in view (FR-047).
export type Vec3 = readonly [number, number, number];

export interface Box {
  readonly center: Vec3;
  readonly size: Vec3;
}

/** The back wall is at z = -2, the floor at y = 0; the camera looks along -z. */
export const LAYOUT = {
  wallZ: -2,
  desk: { center: [0.1, 0.375, -1.45], size: [1.7, 0.75, 0.7] },
  laptop: { center: [-0.25, 0.865, -1.35], size: [0.36, 0.23, 0.26] },
  screen: { center: [0.4, 1.02, -1.62], size: [0.64, 0.54, 0.16] },
  snowboard: { center: [-2.3, 1.45, -1.94], size: [0.32, 1.55, 0.06] },
  bicycle: { center: [2.25, 1.6, -1.9], size: [1.26, 0.76, 0.1] },
  window: { center: [0.95, 1.85, -1.97], size: [0.9, 0.7, 0.06] },
  artwork: { center: [0.95, 2.55, -1.97], size: [0.7, 0.4, 0.04] },
  twin: { center: [-0.95, 0.875, -1.3], size: [0.56, 1.75, 0.4] },
  /** The visitor's avatar stands here, its feet on the floor; the largest is 1.1 wide and 1.74 tall. */
  visitor: { center: [1.0, 0.87, -0.35], size: [1.1, 1.74, 0.05] },
} as const satisfies Record<string, Box | number>;

/** Labels float this far above a piece's top. */
export const LABEL_LIFT = 0.18;

export const FOV = 45;
/** The camera's height, the middle of the floor-to-artwork span. */
export const EYE_Y = 1.5;
/** A margin around the pieces, as a share of the view. */
const MARGIN = 1.06;

const BOXES: readonly Box[] = [
  LAYOUT.desk,
  LAYOUT.laptop,
  LAYOUT.screen,
  LAYOUT.snowboard,
  LAYOUT.bicycle,
  LAYOUT.window,
  LAYOUT.artwork,
  LAYOUT.twin,
  LAYOUT.visitor,
];

export interface Framing {
  fov: number;
  position: Vec3;
  target: Vec3;
}

/**
 * The camera for a stage of this aspect (width over height): straight along -z from x = 0 at EYE_Y, as close as it
 * can be while every corner of every piece, and the labels above them, fits in the view with a margin.
 */
export function framing(aspect: number): Framing {
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  let z = 0;
  for (const { center, size } of BOXES) {
    const [cx, cy, cz] = center;
    const [sx, sy, sz] = size;
    for (const x of [cx - sx / 2, cx + sx / 2]) {
      for (const y of [cy - sy / 2, cy + sy / 2 + LABEL_LIFT + 0.1]) {
        const near = cz + sz / 2;
        z = Math.max(z, near + (Math.abs(x) * MARGIN) / tanH, near + (Math.abs(y - EYE_Y) * MARGIN) / tanV);
      }
    }
  }
  return { fov: FOV, position: [0, EYE_Y, z], target: [0, EYE_Y, z - 1] };
}
