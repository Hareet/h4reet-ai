// The lookdev page's hands view (spec 014; FR-042; plan.md PD-24; spec 004's contracts/lookdev.md §3, "(spec 014)"):
// each avatar lookdev.yaml's `hands.avatars` lists, holding the resume's sheet in its right hand and in its left, at
// rest, in "idle-holding", and mid-walk, for the Author's look. It measures nothing.
// - A case is an avatar, a hand, and a pose, listed avatar by avatar in the list's order, then right before left, then
//   at rest, in "idle-holding", and mid-walk: twelve for the man and the woman.
// - Each case draws its own instance of the avatar's parsed model (SkeletonUtils' clone, as the room's figures take
//   theirs), standing at its place in a row, scaled to its height in the room's table, its feet on the floor, facing
//   +z as the room's figures do. At rest it keeps its rest pose; in "idle-holding" it shows that clip's first frame; mid-
//   walk, the walk clip's middle frame, each by its own mixer set to that time and advanced no further.
// - The sheet sits at the hand's grip by the room's own maths (scene/grip.ts's gripMatrix): the scene's `figures.grips`
//   for that avatar and hand, or the default computed from the hand's bones, as the room's kept paper does.
// - The forearm's volume, FR-038's, is drawn as a wire capsule: the segment from the hand bone's parent, the forearm's
//   bone, to the hand bone, 4 cm around it in the room's metres. A sheet inside it is what the Author looks for.
// - A case that can't draw says why: no model, a pose's clip missing, or no hand bone.
import {
  AnimationMixer,
  Box3,
  CapsuleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PropertyBinding,
  Quaternion,
  Vector3,
} from "three";
import type { AnimationClip, Object3D } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { AVATAR_SHAPES, avatarById } from "../choice/avatars";
import type { AvatarId, ClipRole } from "../choice/avatars";
import { SHEET_SIZE, gripMatrix } from "../room/scene/grip";
import type { GripData } from "../room/scene/grip";

/** The three poses, in the list's order, and their words. */
export const HAND_POSES = ["rest", "idle-holding", "walk"] as const;
export type HandPose = (typeof HAND_POSES)[number];
const POSE_WORDS: Readonly<Record<HandPose, string>> = {
  rest: "at rest",
  "idle-holding": 'in "idle-holding"',
  walk: "mid-walk",
};

export const HAND_SIDES = ["right", "left"] as const;
export type HandSide = (typeof HAND_SIDES)[number];

/** FR-038's forearm volume: 4 cm around the segment, in the room's metres. */
export const FOREARM_RADIUS = 0.04;
/** The gap between two cases in a row, in metres. */
export const CASE_SPACING = 0.9;
/** The gap between two avatars' rows, in metres. */
export const ROW_SPACING = 1.2;
/** The hands group's name in the page's scene. */
export const HANDS_NODE = "lookdev-hands";

export interface HandsCase {
  readonly avatar: AvatarId;
  readonly hand: HandSide;
  readonly pose: HandPose;
}

/** Each case for the listed avatars, in the list's order. */
export function handsCases(avatars: readonly AvatarId[]): HandsCase[] {
  return avatars.flatMap((avatar) =>
    HAND_SIDES.flatMap((hand) => HAND_POSES.map((pose): HandsCase => ({ avatar, hand, pose }))),
  );
}

/** A case's words: "Man, right hand, at rest". */
export function caseLabel(c: HandsCase): string {
  return `${avatarById(c.avatar).name}, ${c.hand} hand, ${POSE_WORDS[c.pose]}`;
}

/** ADR 0010's hand bones, as three's loader names them. */
const HAND_BONE: Readonly<Record<HandSide, string>> = {
  right: PropertyBinding.sanitizeNodeName("mixamorig:RightHand"),
  left: PropertyBinding.sanitizeNodeName("mixamorig:LeftHand"),
};

/** What an avatar gives the view: its parsed model, if any, and its clips by role. */
export interface HandsAvatar {
  readonly model: Object3D | null;
  readonly clips: ReadonlyMap<ClipRole, AnimationClip>;
  /** Whether its model's load has ended without a model: failed or skipped. */
  readonly missed: boolean;
}

/** A drawn case: its node, its sheet and its capsule where drawn, and why it isn't, if not. */
export interface HandsDrawn {
  readonly case: HandsCase;
  readonly node: Group;
  readonly sheet: Mesh | null;
  readonly capsule: Mesh | null;
  /** Null where the case drew; otherwise its words: "waiting for its model", "no model", "no … clip", "no hand bone". */
  readonly why: string | null;
}

const wire = (): MeshBasicMaterial => new MeshBasicMaterial({ color: 0x66ccff, wireframe: true });

/** One case drawn at `at` (its feet's place in the hands group), from the avatar's model and clips. */
export function drawCase(
  c: HandsCase,
  avatar: HandsAvatar | undefined,
  grip: GripData | null,
  at: Vector3,
): HandsDrawn {
  const node = new Group();
  node.name = `hands:${c.avatar}:${c.hand}:${c.pose}`;
  node.position.copy(at);
  const none = (why: string): HandsDrawn => ({ case: c, node, sheet: null, capsule: null, why });
  if (!avatar?.model) return none(avatar?.missed ? "no model" : "waiting for its model");
  const role: ClipRole | null = c.pose === "rest" ? null : c.pose;
  const clip = role ? avatar.clips.get(role) : undefined;
  if (role && !clip) return none(`no "${role}" clip`);
  const instance = cloneSkinned(avatar.model);
  node.add(instance);
  // Its height in the room's table, its feet on the floor (scene/avatars.ts's R-05, at its rest pose).
  instance.updateMatrixWorld(true);
  const rest = new Box3().setFromObject(instance, true);
  const height = rest.max.y - rest.min.y;
  if (height > 0.01) {
    instance.scale.setScalar(AVATAR_SHAPES[c.avatar].height / height);
    instance.position.y = -rest.min.y * instance.scale.y;
  }
  if (clip) {
    const mixer = new AnimationMixer(instance);
    mixer.clipAction(clip).play();
    mixer.setTime(c.pose === "walk" ? clip.duration / 2 : 0);
  }
  node.updateMatrixWorld(true);
  const hand = instance.getObjectByName(HAND_BONE[c.hand]) ?? null;
  if (!hand) return none("no hand bone");
  const front = new Vector3(0, 0, 1).applyQuaternion(node.getWorldQuaternion(new Quaternion())).normalize();
  const matrix = gripMatrix(hand, front, grip);
  let sheet: Mesh | null = null;
  if (matrix) {
    sheet = new Mesh(
      new PlaneGeometry(SHEET_SIZE[0], SHEET_SIZE[1]),
      new MeshBasicMaterial({ color: 0xf4f1e8, side: DoubleSide }),
    );
    sheet.name = "sheet";
    // The world matrix in the case's node's frame.
    node.updateMatrixWorld(true);
    sheet.applyMatrix4(node.matrixWorld.clone().invert().multiply(matrix));
    node.add(sheet);
  }
  // The forearm's volume: from the forearm's bone, the hand bone's parent, to the hand bone.
  let capsule: Mesh | null = null;
  const forearm = hand.parent;
  if (forearm) {
    const from = node.worldToLocal(forearm.getWorldPosition(new Vector3()));
    const to = node.worldToLocal(hand.getWorldPosition(new Vector3()));
    const along = to.clone().sub(from);
    const length = along.length();
    if (length > 0) {
      capsule = new Mesh(new CapsuleGeometry(FOREARM_RADIUS, length, 4, 12), wire());
      capsule.name = "forearm";
      capsule.position.copy(from).add(to).multiplyScalar(0.5);
      capsule.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), along.normalize());
      node.add(capsule);
    }
  }
  return { case: c, node, sheet, capsule, why: matrix ? null : "no grip could be built" };
}

/**
 * Every case drawn in one group, an avatar's six in a row along x, the rows along −z, as `hands.avatars` lists them;
 * the group named HANDS_NODE.
 */
export function drawHands(
  cases: readonly HandsCase[],
  avatars: ReadonlyMap<AvatarId, HandsAvatar>,
  grips: Partial<Record<AvatarId, Partial<Record<HandSide, GripData>>>> | undefined,
): { group: Group; drawn: HandsDrawn[] } {
  const group = new Group();
  group.name = HANDS_NODE;
  const rows = [...new Set(cases.map((c) => c.avatar))];
  const drawn = cases.map((c) => {
    const row = rows.indexOf(c.avatar);
    const column = HAND_SIDES.indexOf(c.hand) * HAND_POSES.length + HAND_POSES.indexOf(c.pose);
    const at = new Vector3(column * CASE_SPACING, 0, -row * ROW_SPACING);
    return drawCase(c, avatars.get(c.avatar), grips?.[c.avatar]?.[c.hand] ?? null, at);
  });
  for (const d of drawn) group.add(d.node);
  return { group, drawn };
}

/** Releases a hands group's own geometry and materials; the avatars' shared ones stay with their models. */
export function disposeHands(group: Object3D): void {
  group.traverse((o) => {
    if (o.name !== "sheet" && o.name !== "forearm") return;
    const mesh = o as Mesh;
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  });
  group.removeFromParent();
}
