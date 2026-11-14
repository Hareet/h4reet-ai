// Spec 021 (T002; plan.md R-07): the dinosaur in the visitor's figure, in Node, for the stage tests that already exist
// for hands, the scene's clips, and the gait; and its folder for the compositor's tests (T003 to T006). The fixture room
// is composed once with the night's woman and man (the twin's stand-in) and the dinosaur's folder, since a figure
// wants only an avatar the bundle holds (src/room/scene/avatars.ts), and the dinosaur's model and clips are given to
// the figures' controllers as the room's loader gives them, parsed by three's GLTFLoader. The model is test/helpers/glb.ts's dinosaurGlb (the contract's eighteen raw bone
// names, no `mixamorig:` node, no hand bone), never the asset (spec 009's FR-043).
import { Object3D } from "three";
import type { AnimationClip } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { AVATAR_NODE, createAvatarFigures } from "../../src/room/scene/avatars";
import type { AvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import type { FigureFrame } from "../../src/room/scene/figure";
import type { FigureSignal } from "../../src/room/stage";
import type { Pose } from "../../src/room/walk/movement";
import { dinosaurClip, dinosaurGlb } from "./glb";
import type { DinosaurGlbOptions } from "./glb";
import { overlay } from "./room-fixtures";
import { avatarFolder, avatarPolicy, nightFiles } from "./room-avatars";
import type { AvatarFolderOptions } from "./room-avatars";

export type DinosaurRole = "idle" | "walk" | "take";
export interface DinosaurFolderOptions {
  readonly model?: DinosaurGlbOptions;
  /** The clips given: idle, walk, and take by default; a role with null is left out. */
  readonly clips?: Partial<Record<DinosaurRole, Uint8Array | null>>;
  readonly folder?: AvatarFolderOptions;
}

/** The dinosaur's folder, assets/visitors/dinosaur/: its model, its three clips, records, and licence, as an intake
 *  would lay them out, from a prompt and no likeness. */
export const dinosaurFolder = (o: DinosaurFolderOptions = {}): Record<string, Uint8Array> =>
  avatarFolder("dinosaur", {
    model: dinosaurGlb(o.model).bytes,
    clips: {
      "idle-holding": null,
      idle: dinosaurClip("idle").bytes,
      walk: dinosaurClip("walk").bytes,
      take: dinosaurClip("take").bytes,
      ...o.clips,
    },
    ...o.folder,
  });

let night: ComposeResult | null = null;
/** The fixture room with the night's woman and man and the dinosaur's folder, composed once, with no finding. */
export function dinosaurNight(): ComposeResult {
  if (night === null) {
    night = compose(overlay({ ...nightFiles(), ...dinosaurFolder() }), avatarPolicy(), {
      mode: "lenient",
      drafts: false,
    });
    if (night.findings.length > 0 || !night.scene.avatars.dinosaur)
      throw new Error(`the dinosaur's night didn't bundle it: ${night.findings.map((f) => f.rule).join(", ")}`);
  }
  return night;
}

const loader = new GLTFLoader();
const sceneOf = async (bytes: Uint8Array): Promise<Object3D> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).scene;
const clipsOf = async (bytes: Uint8Array): Promise<AnimationClip[]> =>
  (await loader.parseAsync(bytes.slice().buffer, "")).animations;

export interface DinosaurStage {
  readonly room: Room3D;
  readonly figures: AvatarFigures;
  readonly signals: FigureSignal[];
  /** The dinosaur's instance in the visitor's figure, once it shows. */
  avatar(): Object3D | undefined;
}

export interface DinosaurStageOptions {
  /** The clips given, in this order: idle, walk, and take by default. */
  readonly roles?: readonly DinosaurRole[];
  /** Whether the hand-off has ended: true by default. */
  readonly ended?: boolean;
  readonly model?: DinosaurGlbOptions;
}

/** The dinosaur chosen in the 3D room, its model and clips given to the figures. */
export async function dinosaurStage(o: DinosaurStageOptions = {}): Promise<DinosaurStage> {
  const result = dinosaurNight();
  const room = buildRoom(result.scene, { avatar: "dinosaur", label: () => new Object3D(), index: result.index });
  const signals: FigureSignal[] = [];
  const figures = createAvatarFigures(room, result.scene, { chosen: "dinosaur", signal: (x) => signals.push(x) });
  if (!figures.model("dinosaur", await sceneOf(dinosaurGlb(o.model).bytes)))
    throw new Error("the dinosaur's model wasn't placed");
  for (const role of o.roles ?? ["idle", "walk", "take"])
    figures.clip("dinosaur", role, await clipsOf(dinosaurClip(role).bytes));
  if (o.ended ?? true) figures.handoffEnded();
  return {
    room,
    figures,
    signals,
    avatar: () => room.visitor.children.find((c) => c.name === AVATAR_NODE),
  };
}

const CAMERA: readonly [number, number, number] = [0.4, 1.6, 3.5];
/** A frame of the figure walking toward −z at the walking speed's share given, or standing. */
export function dinosaurFrame(walking: boolean, share = 1, animate = true): FigureFrame {
  const speed = walking ? dinosaurNight().scene.walking.speed_mps * share : 0;
  const pose: Pose = { x: 0, z: -1, heading: 0, speed, walking };
  return { pose, camera: CAMERA, animate };
}
