// The sheet in the hand (spec 014; FR-005, FR-038 to FR-041; plan.md §6, PD-12, PD-13): where and how a hand holds the
// resume's sheet, so it sits between the thumb and the fingers and extends away from the forearm, never lifted from the
// wrist along it. One frame for data and the default alike, the hand bone's:
// - A grip from the scene's `figures.grips` (FR-039): the held edge's middle at `at`, in the room's metres, so read as
//   at ÷ s in the hand bone's own frame, s its world scale; the sheet turned from the hand bone's axes by `turn`, in
//   degrees, XYZ order; its centre half its height from the held edge along the grip frame's −Y.
// - The computed default (FR-040): the held edge's middle at the midpoint of the hand bone and the middle finger's first
//   bone (`…HandMiddle1`), or at the hand bone where that bone is missing; the frame's −Y along the hand, from the hand
//   bone toward that bone (the hand bone's own +Y where it is missing); its +Z toward the figure's front, made square to
//   it; +X their cross product. So with the arm hanging the sheet hangs from the fingers, in front of the leg.
// The result is the sheet's world matrix, or null where the numbers aren't finite, and the figure keeps its hand anchor
// (FR-005).
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";

import type { Turn, Vec3 } from "../compose/math";

/** The A4 sheet's size in metres, bundle3d.ts's SHEET. */
export const SHEET_SIZE: readonly [number, number] = [0.21, 0.297];

/** A grip from data (FR-039): the held edge's middle in the hand bone's frame, in the room's metres, and the sheet's
 *  turn from the hand bone's axes, in degrees. */
export interface GripData {
  readonly at: Vec3;
  readonly turn: Turn;
}

const DEG = Math.PI / 180;

/** The middle finger's first bone under a hand bone, by its name's ending, as three's loader names ADR 0010's bones. */
export function middleOf(hand: Object3D): Object3D | null {
  for (const child of hand.children) if (/HandMiddle1$/.test(child.name)) return child;
  return null;
}

const finite = (m: Matrix4): boolean => m.elements.every((v) => Number.isFinite(v));

/** The sheet's world matrix at a hand's grip: from data where given, else the computed default; `front` is the
 *  figure's front in the world, a unit vector. Null where it can't be built. */
export function gripMatrix(hand: Object3D, front: Vector3, grip: GripData | null): Matrix4 | null {
  hand.updateWorldMatrix(true, true);
  const handPos = new Vector3();
  const handRot = new Quaternion();
  const handScale = new Vector3();
  hand.matrixWorld.decompose(handPos, handRot, handScale);
  const half = SHEET_SIZE[1] / 2;
  let edge: Vector3;
  let rotation: Quaternion;
  if (grip) {
    const s = (Math.abs(handScale.x) + Math.abs(handScale.y) + Math.abs(handScale.z)) / 3;
    if (!(s > 0)) return null;
    edge = hand.localToWorld(new Vector3(grip.at[0] / s, grip.at[1] / s, grip.at[2] / s));
    rotation = handRot
      .clone()
      .multiply(
        new Quaternion().setFromEuler(new Euler(grip.turn.x * DEG, grip.turn.y * DEG, grip.turn.z * DEG, "XYZ")),
      );
  } else {
    const middle = middleOf(hand);
    const tip = middle ? middle.getWorldPosition(new Vector3()) : null;
    edge = tip ? handPos.clone().add(tip).multiplyScalar(0.5) : handPos.clone();
    const along = tip ? tip.clone().sub(handPos) : new Vector3(0, 1, 0).applyQuaternion(handRot);
    if (!(along.lengthSq() > 0)) return null;
    along.normalize();
    // The frame: −Y along the hand, +Z toward the front made square to it, +X their cross product.
    const y = along.clone().negate();
    let z = front.clone().sub(y.clone().multiplyScalar(front.dot(y)));
    if (!(z.lengthSq() > 1e-12)) z = new Vector3(1, 0, 0).sub(y.clone().multiplyScalar(y.x));
    z.normalize();
    const x = new Vector3().crossVectors(y, z).normalize();
    rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  }
  const centre = edge.clone().add(new Vector3(0, -half, 0).applyQuaternion(rotation));
  const m = new Matrix4().compose(centre, rotation, new Vector3(1, 1, 1));
  return finite(m) ? m : null;
}

/** The sheet's centre at a hand's grip, in the world, or null: where the twin's sheet and the hand-off's ends sit. */
export function gripCentre(hand: Object3D, front: Vector3, grip: GripData | null): Vector3 | null {
  const m = gripMatrix(hand, front, grip);
  return m ? new Vector3().setFromMatrixPosition(m) : null;
}
