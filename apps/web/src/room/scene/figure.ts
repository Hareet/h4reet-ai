// The figure driver (spec 008; FR-034; plan.md R-12): how the walking view moves the visitor's figure. One interface,
// so a rigged avatar's driver takes over the visitor's figure later (spec 009) with nothing else changing: each frame
// it gets the figure's pose (its place on the floor, its heading, its speed, and whether it walks), where the camera
// stands, and whether the motion store animates; leaving the walking view rests it where the scene has it. A rigged
// driver turns to the heading and crossfades its idle and walk clips by the speed, from the same frame.
// The flat cut-out's driver, today's figure:
// - the figure's node, its placement's, at the pose's place on the floor, its height kept;
// - the picture, the cut-out, turned about +Y to face the camera, since a flat figure seen edge on would vanish;
// - mirrored toward the side of the camera's right the heading falls on, so the figure faces where it walks, keeping
//   its last side while the heading is within MIRROR_HOLD of straight toward or away from the camera, so it doesn't
//   flicker;
// - bobbing by at most BOB_M with each BOB_STRIDE_M walked, only while it walks and the motion store animates;
// - and whatever the picture holds, the paper kept from the hand-off, moving and mirroring with it.
// Spec 009's avatar's driver is its scene/avatars.ts controller's `driver`; figureDriverFor below picks between the two
// each frame by what the visitor's figure shows (its FR-028, its plan's R-16), and walking takes that one driver.
import { Quaternion, Vector3 } from "three";
import type { Object3D } from "three";

import type { Pose } from "../walk/movement";

type Vec3 = readonly [number, number, number];

/** A frame of the walking view, for the figure. */
export interface FigureFrame {
  readonly pose: Pose;
  /** Where the camera stands, in the room's world. */
  readonly camera: Vec3;
  /** Whether the motion store animates: no bob, nor any other motion of the driver's own, while it doesn't. */
  readonly animate: boolean;
  /** The frame's seconds, which the walking view always gives: what a rigged driver advances and crossfades its clips
   *  by. The cut-out's driver reads nothing of it. */
  readonly dt?: number;
}

/** Drives a figure from the walking view: the flat cut-out's driver now, a rigged avatar's later (spec 009). */
export interface FigureDriver {
  /** The figure for a frame of the walking view. */
  frame(frame: FigureFrame): void;
  /** Back where the scene has it, as the hand-off left it: on leaving the walking view. */
  rest(): void;
  /** Takes what the figure holds, the paper kept from the hand-off, into its hand, keeping its place in the room, so it
   *  moves with the figure: the cut-out's hand is its picture, a rigged avatar's a hand's bone (spec 009). */
  hold?(item: Object3D): void;
}

/** The highest bob, in metres, and the distance walked for each. */
export const BOB_M = 0.015;
export const BOB_STRIDE_M = 0.35;
/** How far the heading's side of the camera's right must be from neither side before the cut-out turns over. */
export const MIRROR_HOLD = 0.2;

export interface CutoutOptions {
  /** The visitor's placement node, under its parent's. */
  readonly node: Object3D;
  /** Its picture, the cut-out, which holds the kept paper once the hand-off has ended. */
  readonly picture: Object3D;
}

/** The flat cut-out's driver over the visitor's node and picture, which it puts back as it found them on rest(). */
export function cutoutDriver(options: CutoutOptions): FigureDriver {
  const { node, picture } = options;
  const home = {
    position: node.position.clone(),
    rotation: picture.rotation.clone(),
    scale: picture.scale.clone(),
    lift: picture.position.y,
  };
  /** The cut-out's side, +1 as drawn and -1 mirrored, and the distance walked since the walking view began. */
  let side = 1;
  let walked = 0;
  let last: { x: number; z: number } | null = null;
  const at = new Vector3();
  const turn = new Quaternion();

  /** The parent's turn about +Y in the world, so the picture's own turn faces the camera whatever the node's mount. */
  const yawOf = (o: Object3D): number => {
    o.updateWorldMatrix(true, false);
    o.matrixWorld.decompose(at, turn, new Vector3());
    return 2 * Math.atan2(turn.y, turn.w);
  };

  return {
    frame({ pose, camera, animate }) {
      const parent = node.parent;
      // The feet at the pose's place, the node's height in the world kept.
      node.updateWorldMatrix(true, false);
      const feet = new Vector3().setFromMatrixPosition(node.matrixWorld);
      feet.set(pose.x, feet.y, pose.z);
      if (parent) {
        parent.updateWorldMatrix(true, false);
        parent.worldToLocal(feet);
      }
      node.position.copy(feet);
      node.updateMatrixWorld(true);
      // Face the camera about +Y: the cut-out's +Z toward it on the floor's plane.
      const [cx, , cz] = camera;
      const [dx, dz] = [cx - pose.x, cz - pose.z];
      const yaw = Math.atan2(dx, dz);
      picture.rotation.set(home.rotation.x, yaw - yawOf(node), home.rotation.z);
      // The heading's side of the camera's right: the camera looks from (cx, cz) toward the figure.
      const length = Math.hypot(dx, dz) || 1;
      const [rx, rz] = [dz / length, -dx / length];
      const [hx, hz] = [-Math.sin(pose.heading), -Math.cos(pose.heading)];
      const toward = hx * rx + hz * rz;
      if (toward > MIRROR_HOLD) side = 1;
      else if (toward < -MIRROR_HOLD) side = -1;
      picture.scale.set(Math.abs(home.scale.x) * side, home.scale.y, home.scale.z);
      // The bob, from the distance walked while walking and animating.
      if (last && pose.walking) walked += Math.hypot(pose.x - last.x, pose.z - last.z);
      last = { x: pose.x, z: pose.z };
      const bob = pose.walking && animate ? BOB_M * Math.abs(Math.sin((Math.PI * walked) / BOB_STRIDE_M)) : 0;
      picture.position.y = home.lift + bob;
    },
    hold(item) {
      picture.attach(item);
    },
    rest() {
      node.position.copy(home.position);
      picture.rotation.copy(home.rotation);
      picture.scale.copy(home.scale);
      picture.position.y = home.lift;
      node.updateMatrixWorld(true);
      side = 1;
      walked = 0;
      last = null;
    },
  };
}

/** What the driver by picture asks of spec 009's figures: whether the visitor's avatar shows, and its driver. */
export interface AvatarDriving {
  shows(figure: "visitor"): boolean;
  readonly driver: FigureDriver;
}

/** The driver by picture (spec 009, FR-028; its plan's R-16), the one driver walking takes: each frame, the avatar's
 *  while the visitor's avatar shows, and the cut-out's otherwise, where no avatar module loaded too. When the picture
 *  changes mid-walk, the old driver rests and the new one takes the same pose on that frame. */
export function figureDriverFor(cutout: FigureDriver, avatar: () => AvatarDriving | null): FigureDriver {
  let last: FigureDriver | null = null;
  return {
    frame(frame) {
      const figures = avatar();
      const now = figures?.shows("visitor") ? figures.driver : cutout;
      if (last && last !== now) last.rest();
      last = now;
      now.frame(frame);
    },
    rest() {
      last?.rest();
      last = null;
    },
  };
}
