// The pet director's adapters (spec 026; plan.md §4, R-07, R-08; A016, A020, A025): the one place that names specs
// 016's, 020's, and 025's real code for it. From the avatar controller (scene/avatars.ts) and spec 025's run director
// (scene/chase.ts, through its shell, chase-figures.ts) it gives the director:
// - the twin's view: its home as the run's shell takes it (its picture's world place, and spec 008's heading from its
//   world turn, the picture facing glTF's +z), what it shows, its reach rig on both sides, the loaded `petting` clip's
//   length (its own model's), spec 016's `arriving`, and spec 025's phase;
// - the room's dog's view, null without `figures.dog`, its picture, or its model shown: its home, its phase, and its
//   head point;
// - the run's adapter: `faceTwin` through to spec 025's director, the twin's facing, and whether a run is on.
// Each view is one class instance written in place, so the director's frame makes no object and boxes no number
// (FR-027; I-1): it reads them every frame. Nothing here writes a picture: chase-figures.ts stays the one writer (R-07).
import type { Object3D } from "three";
import { Quaternion, Vector3 } from "three";

import { AVATAR_SHAPES } from "../../choice/avatars";
import type { FigureId } from "../stage";
import type { Chase } from "./chase";
import type { FigureRole, FigureSource } from "./loader";
import type { PetChase, PetDog, PetFigurePhase, PetHome, PetTwin } from "./pet";
import type { ReachRig, ReachSide, Vec3 } from "./pet-reach";
import type { TwinState } from "./twin-states";

/** The dog's head point, as shares of AVATAR_SHAPES.dog.height: up from its feet, and forward of its picture's origin
 *  along its facing (plan §4). Placeholders until spec 020's model is on the line to pin them against. */
export const DOG_HEAD_UP = 0.9;
export const DOG_HEAD_FORWARD = 0.35;

/** What the adapters read of the avatar controller (scene/avatars.ts's AvatarFigures). */
export interface PetAvatars {
  readonly wants: Readonly<Record<FigureId, FigureSource | null>>;
  shows(figure: FigureId): boolean;
  pictureOf(figure: FigureId): Object3D | null;
  clipOf(avatar: FigureSource, role: FigureRole): AnimationClipLike | null;
  /** Spec 016's state of the twin's own model now, or null where it doesn't show (T014 adds it to AvatarFigures). */
  twinState(): TwinState | null;
  /** The reach's rig of the twin's shown avatar on a side, or null without its bones (T014). */
  reachRigOf(side: ReachSide): ReachRig | null;
}

/** A clip, as far as its length. */
export interface AnimationClipLike {
  readonly duration: number;
}

export interface PetAdapters {
  twin(): PetTwin | null;
  dog(): PetDog | null;
  readonly chase: PetChase;
}

class Home implements PetHome {
  x = 0;
  y = 0;
  z = 0;
  heading = 0;
}

/** homeInto's scratch: a picture's home is read once, so these are shared. */
const at = new Vector3();
const turn = new Quaternion();
const size = new Vector3();

/** A picture's home as chase-figures.ts takes it: its world place, and spec 008's heading from its world turn (it faces
 *  glTF's +z, so the heading is its turn − π). Read once a picture, so a frame makes nothing. */
function homeInto(node: Object3D, out: Home): void {
  node.updateWorldMatrix(true, false);
  node.matrixWorld.decompose(at, turn, size);
  out.x = at.x;
  out.y = at.y;
  out.z = at.z;
  // chase-figures.ts's own reading, so the two homes are the same numbers.
  out.heading = 2 * Math.atan2(turn.y, turn.w) - Math.PI;
}
class TwinView implements PetTwin {
  readonly home = new Home();
  shows: PetTwin["shows"] = "capsule";
  rig = false;
  petting_s: number | null = null;
  arriving = false;
  phase: PetFigurePhase = "home";
}

class DogView implements PetDog {
  readonly home = new Home();
  phase: PetFigurePhase = "home";
  node: Object3D | null = null;
  headPoint(out: Vec3): Vec3 {
    const node = this.node;
    if (!node) return out;
    node.updateWorldMatrix(true, false);
    const e = node.matrixWorld.elements;
    const h = AVATAR_SHAPES.dog.height;
    const fx = e[8] as number;
    const fz = e[10] as number;
    const d = Math.sqrt(fx * fx + fz * fz) || 1;
    out.x = (e[12] as number) + (fx / d) * DOG_HEAD_FORWARD * h;
    out.y = (e[13] as number) + DOG_HEAD_UP * h;
    out.z = (e[14] as number) + (fz / d) * DOG_HEAD_FORWARD * h;
    return out;
  }
}

export function createPetAdapters(options: {
  readonly avatars: PetAvatars;
  /** Spec 025's director, where the room has made its shell; null before it, or where it has none. */
  readonly chase: () => Chase | null;
  /** The scene has `figures.dog`. */
  readonly hasDog: boolean;
}): PetAdapters {
  const { avatars } = options;
  const twinView = new TwinView();
  const dogView = new DogView();
  let twinNode: Object3D | null = null;
  let dogNode: Object3D | null = null;
  /** The loaded petting clip last read, so its length is written only when it changes (a tagged field, B-3). */
  let clipSeen: AnimationClipLike | null = null;

  const phaseOf = (id: "twin" | "dog"): PetFigurePhase => options.chase()?.phase(id) ?? "home";

  const twin = (): PetTwin | null => {
    const node = avatars.pictureOf("twin");
    if (!node) return null;
    if (node !== twinNode) {
      twinNode = node;
      homeInto(node, twinView.home);
    }
    const own = avatars.wants.twin === "twin";
    twinView.shows = !avatars.shows("twin") ? "capsule" : own ? "model" : "stand-in";
    twinView.rig = avatars.reachRigOf("right") !== null && avatars.reachRigOf("left") !== null;
    const clip = own ? avatars.clipOf("twin", "petting") : null;
    if (clip !== clipSeen) {
      clipSeen = clip;
      if (clip) twinView.petting_s = clip.duration;
      else twinView.petting_s = null;
    }
    twinView.arriving = avatars.twinState() === "arriving";
    twinView.phase = phaseOf("twin");
    return twinView;
  };

  const dog = (): PetDog | null => {
    if (!options.hasDog || !avatars.shows("dog")) return null;
    const node = avatars.pictureOf("dog");
    if (!node) return null;
    if (node !== dogNode) {
      dogNode = node;
      dogView.node = node;
      homeInto(node, dogView.home);
    }
    dogView.phase = phaseOf("dog");
    return dogView;
  };

  const chase: PetChase = {
    faceTwin(heading) {
      options.chase()?.faceTwin(heading);
    },
    twinHeading() {
      const r = options.chase()?.runner("twin");
      if (r) return r.facing;
      if (!twinNode) twin();
      return twinView.home.heading;
    },
    running() {
      const c = options.chase();
      return c !== null && (c.phase("twin") === "fleeing" || c.phase("dog") === "fleeing");
    },
  };

  return { twin, dog, chase };
}
