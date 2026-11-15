// The dinosaur's scene's adapter (spec 028; FR-019 to FR-024, FR-026; plan.md R-B3): the thin part between the pure
// director (dino-scene.ts) and the room. Each frame it:
// - reads the director's inputs from the avatar controller: the visitor's figure showing its model (the dinosaur's,
//   not its cut-out), the twin's walking (its avatar shown with the leg bones), the room's dog shown and its walk or
//   run clip (chase.ts's `dogRole` reads the same two; with neither, the dog takes no part: Q21);
//   and from the stage: the hand-off's end, the motion store, and the quality level;
// - places the twin's and the dog's pictures from the director's poses, as spec 025's run shell does (chase-figures.ts's
//   `pictureOf` and `place`): only the pictures move, the twin's placement's node stays (FR-023); and shows or hides
//   each as the director says;
// - gives the twin's gait its picture's place (`stride`, spec 019 through spec 025's FR-013), and the twin's state
//   `fleeing` from the gather on (its idle under the gait, never a talking clip while it walks or is hidden: FR-024);
//   the dog its walk while it moves (its run where it has no walk), else its idle;
// - at the call, asks the twin's wave (its greeting once more, `twinWave`), then the stage's own `call`;
// - at the take, moves the taken placement's pictures (its stand-in and its set model, never its label, its faces, or
//   what is mounted on it) under a carrier that follows the twin's picture, and eases them over `take_s` from where
//   they hung to `carry` in the twin's picture's frame, standing on their wheels with their length along the twin's
//   heading; hidden with the twin. The placement's node, its label, frame box, pick area, and list entry stay.
// It fetches nothing and sends no event.
import { Group, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";

import type { AvatarId } from "../../choice/avatars";
import type { LeaveData } from "../compose/bundle";
import type { AvatarFigures } from "./avatars";
import { pictureOf, place } from "./chase-figures";
import type { Picture } from "./chase-figures";
import { createDinoScene } from "./dino-scene";
import type { DinoInputs, DinoScene } from "./dino-scene";

/** What the adapter needs of the avatar controller (scene/avatars.ts). */
export type DinoAvatars = Pick<
  AvatarFigures,
  "shows" | "pictureOf" | "legsOf" | "clipOf" | "dogPlays" | "twinActivity" | "stride" | "twinWave"
>;

export interface DinoMotion {
  readonly animate: boolean;
  readonly paused: boolean;
  readonly level: number;
  readonly reduced: boolean;
}

export interface DinoFigures {
  readonly scene: DinoScene;
  /** The group the taken pictures ride in, from the take on. */
  readonly carrier: Object3D;
  frame(dt: number, motion: DinoMotion): void;
  /** Takes the carrier out of the room. */
  dispose(): void;
}

/** The nodes under a placement's own node that hold its pictures (bundle3d.ts's PICTURE_NODES, less the visitor's
 *  cut-out): its stand-in and its set model. */
const TAKEN = new Set(["standin", "model"]);
/** Standing on its wheels, its length (the piece's x) along the carrier's forward (+z). */
const STAND = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);

export function createDinoFigures(options: {
  readonly leave: LeaveData;
  readonly avatars: DinoAvatars;
  /** The taken placement's node (the bicycle's, by `leave.takes`), or null where the room has none. */
  readonly bicycle: Object3D | null;
  /** Where the carrier goes: the room's scene. */
  readonly root: Object3D;
  readonly chosen: AvatarId;
  readonly handedOff: () => boolean;
  readonly callSeconds: () => number;
  readonly call: () => void;
  readonly left: (who: "both" | "twin") => void;
}): DinoFigures {
  const { avatars, leave } = options;
  const twinNode = avatars.pictureOf("twin");
  const twin: Picture | null = twinNode ? pictureOf(twinNode) : null;
  let dog: Picture | null = null;
  /** The dog's moving clip: its walk, else its run (as chase.ts's `dogRole` falls back). */
  let dogMoves: "walk" | "run" = "walk";
  const scene = createDinoScene({
    leave,
    twin: twin?.home ?? { x: leave.under_bicycle[0], z: leave.under_bicycle[1], heading: 0 },
    callSeconds: options.callSeconds,
    call: () => {
      avatars.twinWave();
      options.call();
    },
    left: options.left,
  });
  const inputs: { -readonly [K in keyof DinoInputs]: DinoInputs[K] } = {
    chosen: options.chosen,
    handedOff: false,
    modelShown: false,
    view3d: true,
    reduced: false,
    level: 0,
    twinCanWalk: false,
    dogShown: false,
    dogHasWalk: false,
    paused: false,
  };
  const carrier = new Group();
  carrier.name = "dino-carrier";
  carrier.visible = false;
  options.root.add(carrier);
  const carry = new Vector3(leave.carry[0], leave.carry[1], leave.carry[2]);
  /** Each taken picture and where it hung, in the carrier's frame at the take's start. */
  const taken: { readonly node: Object3D; readonly from: Vector3; readonly turn: Quaternion }[] = [];
  let takeStarted = false;
  let fleeing = false;
  const at = new Vector3();
  const turn = new Quaternion();
  const size = new Vector3();

  /** The carrier at the twin's picture: its world place and turn, in the root's frame. */
  function follow(): void {
    if (!twin) return;
    twin.node.updateWorldMatrix(true, false);
    twin.node.matrixWorld.decompose(at, turn, size);
    options.root.updateWorldMatrix(true, false);
    options.root.worldToLocal(at);
    carrier.position.copy(at);
    carrier.quaternion.copy(turn);
    carrier.updateMatrixWorld(true);
  }

  /** The taken placement's pictures into the carrier, their world place kept; a model set later joins them. */
  function take(): void {
    const node = options.bicycle;
    if (!node) return;
    for (const child of [...node.children]) {
      if (!TAKEN.has(child.name)) continue;
      carrier.attach(child);
      taken.push({ node: child, from: child.position.clone(), turn: child.quaternion.clone() });
    }
  }

  return {
    scene,
    carrier,
    frame(dt, motion) {
      inputs.handedOff = options.handedOff();
      inputs.modelShown = avatars.shows("visitor");
      inputs.reduced = motion.reduced;
      inputs.level = motion.level;
      inputs.paused = motion.paused;
      inputs.twinCanWalk = avatars.shows("twin") && avatars.legsOf("twin") !== null;
      inputs.dogShown = avatars.shows("dog");
      const hasWalk = avatars.clipOf("dog", "walk") !== null;
      inputs.dogHasWalk = hasWalk || avatars.clipOf("dog", "run") !== null;
      dogMoves = hasWalk ? "walk" : "run";
      scene.frame(dt, inputs);
      const phase = scene.phase;
      if (phase === "idle" || phase === "call") return;

      if (!fleeing && phase !== "enter") {
        fleeing = true;
        avatars.twinActivity({ kind: "flee", on: true });
      }
      if (twin) {
        place(twin, scene.twin);
        twin.node.visible = scene.twin.visible;
        if (phase === "gather" || phase === "leave")
          avatars.stride("twin", scene.twin.x, scene.twin.z, scene.twin.speed, scene.twin.moving);
      }
      const dogNode = avatars.pictureOf("dog");
      if (dogNode && !dog) dog = pictureOf(dogNode);
      if (dog) {
        if (scene.dog.visible) place(dog, scene.dog);
        dog.node.visible = scene.dog.visible;
        if (scene.dog.visible) avatars.dogPlays(scene.dog.moving ? dogMoves : "idle");
      }

      if (phase === "take" || phase === "leave" || phase === "gone" || phase === "cut") {
        if (!takeStarted) {
          takeStarted = true;
          follow();
          take();
        }
        follow();
        carrier.visible = scene.bicycle.visible;
        if (!scene.bicycle.visible) {
          // The cut, or the leave's end: the bicycle's pictures hidden with the twin, wherever they are.
          if (phase === "cut") for (const p of taken) p.node.visible = false;
          return;
        }
        const u = scene.bicycle.taken;
        for (const p of taken) {
          p.node.position.lerpVectors(p.from, carry, u);
          p.node.quaternion.slerpQuaternions(p.turn, STAND, u);
        }
      }
    },
    dispose() {
      carrier.removeFromParent();
    },
  };
}
