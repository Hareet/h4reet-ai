// The work area's layout (spec 002, FR-005, FR-047; contracts/room-scene.md §2 and §6), in metres, with no Three.js:
// the 3D scene builds its placeholders from LAYOUT. The camera's framing, which keeps every piece on screen at any
// aspect, from a wide desktop to a 320-pixel portrait phone, moved to the shared kernel (spec 004, T071; R-18):
// `framing(aspect)` here frames LAYOUT's pieces, each with its label, through `compose/framing.ts`. LAYOUT leaves the
// code when the room is drawn from its data (spec 004, T112).
import { EYE_Y, FOV, LABEL_LIFT, framing as frame, withLabel } from "./compose/framing";
import type { Box as KernelBox } from "./compose/framing";
import type { Camera } from "./compose/project";

export { EYE_Y, FOV, LABEL_LIFT };
export type Framing = Camera;

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

/** Each piece's box as the kernel takes it, its top raised for the piece's label: every piece here has one. */
const FRAMED: readonly KernelBox[] = BOXES.map(({ center, size }) =>
  withLabel({
    min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
    max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2],
  }),
);

/** The camera for a stage of this aspect (width over height), so the whole work area is in view. */
export function framing(aspect: number): Framing {
  return frame(aspect, FRAMED);
}
