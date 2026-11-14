// The visitor's avatar's walking legs (spec 019; plan.md §2): a gait laid over the playing clip, so an avatar with no
// `walk` clip no longer slides on its feet. The math here is pure (phase from the distance walked, an amplitude that
// eases in and out, six leg-bone angles); the bones' part (findLegRig, applyGait, clearGait) follows it.
import { PropertyBinding, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";

/** Tunables, each a one-line edit at the Author's look pass (SC-005). Angles in radians. */
export const CYCLE_PER_HEIGHT = 0.7;
/** The amplitude's ease, in seconds, from 0 to full and back. */
export const EASE_S = 0.15;
/** The longest frame the gait takes, in seconds: a stalled tab doesn't jump the ease. */
export const DT_MAX_S = 0.1;
/** The thigh's swing, the shin's bend, and the foot's share of the thigh's swing, held level against it. */
export const HIP_MAX = 0.45;
export const KNEE_MAX = 0.9;
export const ANKLE_GAIN = 0.3;

export interface GaitState {
  /** A turn of the left leg's cycle, 0 up to 1. */
  readonly phase: number;
  /** 0 standing, 1 a full stride. */
  readonly amp: number;
}

export interface LegAngles {
  readonly hip: number;
  readonly knee: number;
  readonly ankle: number;
}

/** One whole stride, left foot down to left foot down, in metres, for a body this tall. */
export const cycleLength = (heightM: number): number => CYCLE_PER_HEIGHT * heightM;

/**
 * One frame: the phase moves by the distance walked over the cycle (never by time: feet don't skate, FR-002), and the
 * amplitude eases toward `min(1, speedShare)` while `on`, else toward 0.
 */
export function advance(
  state: GaitState,
  distanceM: number,
  speedShare: number,
  dt: number,
  on: boolean,
  cycleM: number,
): GaitState {
  const step = Math.min(Math.max(dt, 0), DT_MAX_S) / EASE_S;
  const target = on ? Math.min(1, Math.max(0, speedShare)) : 0;
  const amp = state.amp < target ? Math.min(target, state.amp + step) : Math.max(target, state.amp - step);
  const turns = cycleM > 0 && Number.isFinite(distanceM) ? Math.max(0, distanceM) / cycleM : 0;
  const phase = (((state.phase + turns) % 1) + 1) % 1;
  return { phase, amp };
}

/** One leg's angles: the thigh swings as a sine, the shin bends only through the forward swing, the foot stays level. */
function leg(phase: number, amp: number): LegAngles {
  const turn = 2 * Math.PI * phase;
  const hip = amp * HIP_MAX * Math.sin(turn);
  return { hip, knee: amp * KNEE_MAX * Math.max(0, Math.cos(turn)), ankle: -ANKLE_GAIN * hip };
}

/** Both legs' angles, the right half a cycle behind the left. Pure and total. */
export function legOffsets(phase: number, amp: number): { left: LegAngles; right: LegAngles } {
  return { left: leg(phase, amp), right: leg(phase + 0.5, amp) };
}

// --------------------------------------------------------------------------------------------------------------------
// The bones (plan.md §2.2)
// --------------------------------------------------------------------------------------------------------------------

/** One bone with what the applier tracks: `base`, the clip's rotation (or the rest pose's), and `applied`, what the gait
 *  last wrote, which is how a frame the mixer didn't write is told from one it did. */
export interface GaitBone {
  readonly node: Object3D;
  readonly base: Quaternion;
  readonly applied: Quaternion;
  on: boolean;
}

export interface LegBones {
  readonly hip: GaitBone;
  readonly knee: GaitBone;
  readonly ankle: GaitBone;
}

export interface LegRig {
  readonly left: LegBones;
  readonly right: LegBones;
}

/** The studio rig's leg chain turns about its local X (R-07, measured on the real models by gait-rig.test.ts): a
 *  positive rotation about X swings a foot hanging below it toward −z, the avatar's back (it faces +z). So a positive
 *  hip offset, which swings the foot forward, turns the bone the other way; a positive knee offset, which bends the
 *  shin backward, turns it with the axis; the ankle's offset follows the hip's convention. */
const HIP_SIGN = -1;
const KNEE_SIGN = 1;
const ANKLE_SIGN = -1;

const names = (side: "Left" | "Right"): readonly [string, string, string] =>
  [`${side}UpLeg`, `${side}Leg`, `${side}Foot`].map((n) => PropertyBinding.sanitizeNodeName(`mixamorig:${n}`)) as [
    string,
    string,
    string,
  ];

/** The six leg bones by their sanitized Mixamo names, or null if any is missing (FR-008). */
export function findLegRig(root: Object3D): LegRig | null {
  const side = (which: "Left" | "Right"): LegBones | null => {
    const found = names(which).map((n) => root.getObjectByName(n));
    if (found.some((o) => o === undefined)) return null;
    const bone = (node: Object3D | undefined): GaitBone => ({
      node: node as Object3D,
      base: new Quaternion(),
      applied: new Quaternion(),
      on: false,
    });
    return { hip: bone(found[0]), knee: bone(found[1]), ankle: bone(found[2]) };
  };
  const left = side("Left");
  const right = side("Right");
  return left && right ? { left, right } : null;
}

const AXIS = new Vector3(1, 0, 0);
const TURN = new Quaternion();

function lay(bone: GaitBone, angle: number): void {
  // The mixer's write, if there was one, is the new base; else the bone still holds what the gait wrote.
  if (!bone.on || !bone.node.quaternion.equals(bone.applied)) bone.base.copy(bone.node.quaternion);
  TURN.setFromAxisAngle(AXIS, angle);
  bone.applied.copy(bone.base).multiply(TURN);
  bone.node.quaternion.copy(bone.applied);
  bone.on = true;
}

/** Lays the legs' offsets over the clip's rotations, each bone's base kept (no allocation per frame). */
export function applyGait(rig: LegRig, offsets: { left: LegAngles; right: LegAngles }): void {
  for (const [bones, angles] of [
    [rig.left, offsets.left],
    [rig.right, offsets.right],
  ] as const) {
    lay(bones.hip, HIP_SIGN * angles.hip);
    lay(bones.knee, KNEE_SIGN * angles.knee);
    lay(bones.ankle, ANKLE_SIGN * angles.ankle);
  }
}

/** Puts the clip's rotations back wherever the gait laid itself over them, and forgets: no residue (FR-006, SC-002). */
export function clearGait(rig: LegRig): void {
  for (const bones of [rig.left, rig.right])
    for (const bone of [bones.hip, bones.knee, bones.ankle]) {
      // A bone the mixer wrote since the gait did holds a newer pose than `base`: leave it.
      if (bone.on && bone.node.quaternion.equals(bone.applied)) bone.node.quaternion.copy(bone.base);
      bone.on = false;
    }
}
