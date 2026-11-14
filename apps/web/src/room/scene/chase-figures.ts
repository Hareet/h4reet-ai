// The run's shell (spec 025; FR-001, FR-010, FR-012 to FR-014, FR-016, FR-017, FR-025, FR-027; plan.md R-01, R-05,
// R-06): the thin part between the pure director (chase.ts) and the room. Each frame it:
// - reads the pursuer: FR-001's condition from the chosen avatar, the visitor's figure showing its model, and the walking
//   view's `on`, and its place from the walking view's `pose`, which it never writes (FR-016);
// - marks a figure that can't run held (FR-014: the twin's capsule, or a model without the leg bones or the hips bone;
//   FR-010: the room's dog without its model, or with neither `walk` nor `run`), so the director keeps it home;
// - runs the director, and places the pictures from its runners: the twin's picture group inside its placement's node,
//   which stays, as its pick area and reach target do (FR-017), and the room's dog's group; each comes back exactly as
//   it was once home;
// - sets the twin's `fleeing` on and off as it starts and stops moving (FR-012), gives the twin's gait its picture's
//   place (`stride`, FR-013), and the dog its clip by speed (FR-010);
// - says the run's start and end as the stage's `chase` signal (FR-025).
// It fetches nothing and sends no event (FR-027). Below the floor, in the 2D room, and in a lost context no figure
// shows, so no run starts, and a figure that stops showing mid-run is cut home.
import type { Object3D } from "three";
import { Euler, Quaternion, Vector3 } from "three";

import type { AvatarId } from "../../choice/avatars";
import type { RoomScene } from "../compose/bundle";
import type { WalkableFloor } from "../compose/floor";
import type { FigureSignal } from "../stage";
import type { AvatarFigures } from "./avatars";
import { createChase, dogRole, pursuerPresent } from "./chase";
import type { Chase, ChaseHome, ChaseMotion } from "./chase";
import { CHASE_DEFAULTS, chaseFloor } from "./chase-steer";
import type { Runner } from "./chase-steer";

/** What the shell needs of the avatar controller (scene/avatars.ts). */
export type ChaseAvatars = Pick<
  AvatarFigures,
  "shows" | "pictureOf" | "legsOf" | "clipOf" | "dogPlays" | "twinActivity" | "stride"
>;

export interface ChaseFigures {
  /** The director, for the frame log and the tests. */
  readonly chase: Chase;
  /** One frame, after the walking view's and before the controller's update; `dt` the room's clock's, in seconds. */
  frame(dt: number, motion: ChaseMotion): void;
}

/** A picture as it stood at home: its local place and turn, and its home's place and heading on the floor. */
interface Picture {
  readonly node: Object3D;
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly home: ChaseHome;
  /** The world height of its feet, which the run keeps. */
  readonly y: number;
}

const scratch = new Vector3();

/** A picture's home: its world place on the floor and spec 008's heading from its world turn (it faces glTF's +z, so
 *  the heading is its turn − π). */
function pictureOf(node: Object3D): Picture {
  node.updateWorldMatrix(true, false);
  const at = new Vector3();
  const turn = new Quaternion();
  node.matrixWorld.decompose(at, turn, new Vector3());
  const yaw = 2 * Math.atan2(turn.y, turn.w);
  return {
    node,
    position: node.position.clone(),
    rotation: node.rotation.clone(),
    home: { x: at.x, z: at.z, heading: yaw - Math.PI },
    y: at.y,
  };
}

const atHome = (r: Runner, h: ChaseHome): boolean => r.x === h.x && r.z === h.z && r.facing === h.heading;

/** The picture at its runner: its world place on the floor, its turn by the facing's change from home; exactly as it
 *  was where the runner is home. Writes in place (FR-029). */
function place(p: Picture, r: Runner): void {
  const { node } = p;
  if (atHome(r, p.home)) {
    node.position.copy(p.position);
    node.rotation.copy(p.rotation);
    return;
  }
  scratch.set(r.x, p.y, r.z);
  if (node.parent) {
    node.parent.updateWorldMatrix(true, false);
    node.parent.worldToLocal(scratch);
  }
  node.position.copy(scratch);
  node.rotation.set(p.rotation.x, p.rotation.y + (r.facing - p.home.heading), p.rotation.z);
}

export function createChaseFigures(options: {
  /** The visitor's walkable floor (spec 008), the dinosaur's; the chase floor leaves the twin's obstacle out. */
  readonly floor: WalkableFloor;
  readonly part: Pick<RoomScene, "figures" | "walking">;
  readonly avatars: ChaseAvatars;
  /** The walking view (scene/walking.ts), read only; null where the room has none. */
  readonly walking: { readonly on: boolean; readonly pose: { readonly x: number; readonly z: number } } | null;
  readonly chosen: AvatarId;
  readonly signal?: (signal: FigureSignal) => void;
}): ChaseFigures {
  const { avatars, walking, part } = options;
  const config = part.figures.chase ?? CHASE_DEFAULTS;
  const twinNode = avatars.pictureOf("twin");
  const dogNode = part.figures.dog ? avatars.pictureOf("dog") : null;
  const twin = twinNode ? pictureOf(twinNode) : null;
  const dog = dogNode ? pictureOf(dogNode) : null;
  const chase = createChase({
    floor: chaseFloor(options.floor, part.figures.twin),
    config,
    walkMps: part.walking.speed_mps,
    figures: { twin: twin?.home ?? null, dog: dog?.home ?? null },
    note: (n) => options.signal?.({ kind: "chase", state: n.state, who: n.who }),
  });
  const dino = { present: false, x: 0, z: 0 };
  const has = { walk: false, run: false };
  let fleeing = false;

  return {
    chase,
    frame(dt, motion) {
      const on = walking?.on ?? false;
      dino.present = pursuerPresent({ chosen: options.chosen, shows: avatars.shows("visitor"), walking: on });
      if (walking) {
        dino.x = walking.pose.x;
        dino.z = walking.pose.z;
      }
      has.walk = avatars.clipOf("dog", "walk") !== null;
      has.run = avatars.clipOf("dog", "run") !== null;
      chase.hold("twin", !avatars.shows("twin") || avatars.legsOf("twin") === null);
      chase.hold("dog", !avatars.shows("dog") || !(has.walk || has.run));
      chase.frame(dino, dt, motion);

      const t = chase.runner("twin");
      if (twin && t) {
        place(twin, t);
        const moving = chase.moving("twin");
        if (moving !== fleeing) {
          fleeing = moving;
          avatars.twinActivity({ kind: "flee", on: moving });
        }
        avatars.stride("twin", t.x, t.z, t.speed, moving);
      }
      const d = chase.runner("dog");
      if (dog && d) {
        place(dog, d);
        avatars.dogPlays(chase.moving("dog") ? dogRole(d.speed, config.clip_thresholds, has) : "idle");
      }
    },
  };
}
