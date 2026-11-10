// T004 (spec 014; FR-038 to FR-041; plan.md §6, PD-12, PD-13): two skeletons of ADR 0010's bone names, in the man's
// and the woman's proportions, at rest and in an "idle-holding"-like pose, for the grip's tests (test/room/grip.test.ts),
// which need no mixer and no model file. Each is a figure facing +Z with its feet at the origin, in the room's metres:
// the spine, each side's shoulder, arm, forearm, and hand, and under each hand the thumb's and the middle finger's
// chains and the index finger's first bone. A bone's own +Y points along it toward its child, as Mixamo's rigs have it;
// the figure's right side is −X. At rest both arms hang straight down; in the holding pose each forearm is raised
// forward, nearly level, and the wrist bent a little down, as a hand that carries a sheet holds it. The proportions are
// round figures for a grown man and woman, not measured from the studio's models; the real models' bones are read from
// the bundle in test/room/avatar-hands.test.ts and the grip's own tests.
import { Bone, Group, Vector3 } from "three";
import type { Object3D } from "three";

export type FixtureAvatar = "man" | "woman";
export type FixturePose = "rest" | "holding";
export type FixtureSide = "right" | "left";

/** Each length in metres: shoulder height and half-width, the upper arm, the forearm, the hand bone to the middle
 *  finger's first bone, and each finger segment. */
const PROPORTIONS: Readonly<
  Record<
    FixtureAvatar,
    {
      readonly shoulderY: number;
      readonly shoulderX: number;
      readonly arm: number;
      readonly forearm: number;
      readonly hand: number;
      readonly finger: number;
    }
  >
> = {
  man: { shoulderY: 1.45, shoulderX: 0.19, arm: 0.28, forearm: 0.26, hand: 0.095, finger: 0.035 },
  woman: { shoulderY: 1.36, shoulderX: 0.17, arm: 0.25, forearm: 0.23, hand: 0.085, finger: 0.031 },
};

/** ADR 0010's names for a side's bones, as the GLB names them (three's loader drops the colon). */
export function boneNames(side: FixtureSide): {
  readonly arm: string;
  readonly forearm: string;
  readonly hand: string;
  readonly middle: readonly string[];
  readonly index1: string;
  readonly thumb: readonly string[];
} {
  const s = side === "right" ? "Right" : "Left";
  return {
    arm: `mixamorig${s}Arm`,
    forearm: `mixamorig${s}ForeArm`,
    hand: `mixamorig${s}Hand`,
    middle: [`mixamorig${s}HandMiddle1`, `mixamorig${s}HandMiddle2`, `mixamorig${s}HandMiddle3`],
    index1: `mixamorig${s}HandIndex1`,
    thumb: [`mixamorig${s}HandThumb1`, `mixamorig${s}HandThumb2`],
  };
}

export interface FixtureSkeleton {
  readonly avatar: FixtureAvatar;
  readonly pose: FixturePose;
  /** The figure's root, at its feet, facing +Z; its world matrices are up to date. */
  readonly root: Group;
  /** A bone by its name, as three's loader names it. */
  bone(name: string): Object3D;
  /** The figure's front, a unit vector in the world: +Z. */
  readonly front: Vector3;
}

function bone(name: string, at: readonly [number, number, number]): Bone {
  const b = new Bone();
  b.name = name;
  b.position.set(...at);
  return b;
}

/** One side's arm under the spine: the arm at the shoulder, the forearm, the hand, and its fingers. */
function arm(parent: Object3D, avatar: FixtureAvatar, side: FixtureSide, pose: FixturePose): void {
  const p = PROPORTIONS[avatar];
  const n = boneNames(side);
  const out = side === "right" ? -1 : 1;
  const shoulder = bone(n.arm, [out * p.shoulderX, p.shoulderY - 1.0, 0]);
  // The arm's +Y turned straight down: half a turn about Z.
  shoulder.rotation.set(0, 0, Math.PI);
  const forearm = bone(n.forearm, [0, p.arm, 0]);
  const hand = bone(n.hand, [0, p.forearm, 0]);
  if (pose === "holding") {
    // The forearm raised forward, nearly level (its +Y from down toward +Z), and the wrist bent a little down. Under
    // the arm's half turn about Z, a turn about X by +80° swings the forearm's +Y toward the figure's front, and the
    // hand's −20° brings its own back down: about 30° below level.
    forearm.rotation.set((80 * Math.PI) / 180, 0, 0);
    hand.rotation.set(-(20 * Math.PI) / 180, 0, 0);
  }
  const middle1 = bone(n.middle[0] ?? "", [0, p.hand, 0]);
  const middle2 = bone(n.middle[1] ?? "", [0, p.finger, 0]);
  const middle3 = bone(n.middle[2] ?? "", [0, p.finger * 0.8, 0]);
  const index1 = bone(n.index1, [out * -0.022, p.hand * 0.95, 0.004]);
  // The thumb comes off the hand's inner side, toward the figure's front, and points along the hand.
  const thumb1 = bone(n.thumb[0] ?? "", [out * -0.02, p.hand * 0.3, 0.02]);
  const thumb2 = bone(n.thumb[1] ?? "", [0, p.finger, 0]);
  parent.add(shoulder);
  shoulder.add(forearm);
  forearm.add(hand);
  hand.add(middle1, index1, thumb1);
  middle1.add(middle2);
  middle2.add(middle3);
  thumb1.add(thumb2);
}

/** A skeleton of ADR 0010's bone names for an avatar in a pose. */
export function skeleton(avatar: FixtureAvatar, pose: FixturePose): FixtureSkeleton {
  const root = new Group();
  root.name = `${avatar}-${pose}`;
  const hips = bone("mixamorigHips", [0, 0.95, 0]);
  const spine = bone("mixamorigSpine", [0, 0.05, 0]);
  root.add(hips);
  hips.add(spine);
  arm(spine, avatar, "right", pose);
  arm(spine, avatar, "left", pose);
  root.updateMatrixWorld(true);
  return {
    avatar,
    pose,
    root,
    front: new Vector3(0, 0, 1),
    bone(name) {
      const found = root.getObjectByName(name);
      if (!found) throw new Error(`the ${avatar}'s ${pose} skeleton has no ${name}`);
      return found;
    },
  };
}

/** Every avatar, pose, and side the grip's tests sweep. */
export const SKELETON_CASES: readonly {
  readonly avatar: FixtureAvatar;
  readonly pose: FixturePose;
  readonly side: FixtureSide;
}[] = (["man", "woman"] as const).flatMap((avatar) =>
  (["rest", "holding"] as const).flatMap((pose) =>
    (["right", "left"] as const).map((side) => ({ avatar, pose, side })),
  ),
);
