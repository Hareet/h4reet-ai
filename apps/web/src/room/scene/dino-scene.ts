// The dinosaur's scene's director (spec 028; FR-019 to FR-024, FR-026; plan.md R-B2): pure, numbers alone, no three.js
// and no DOM, so a test drives it with a scripted clock. Its phases: `idle`, then once a visit `call`, `enter`,
// `gather`, `take`, `leave`, `gone`; or `cut`.
// - It leaves `idle` at the first frame of a dinosaur visit whose hand-off has ended, whose visitor's figure shows the
//   dinosaur's model, in the 3D room (FR-019; Q11): then the call, said once (`call`), for its seconds (the twin's
//   speaking time for the call's words, at least the greeting clip's length, which the stage gives).
// - At the call's end it cuts (FR-026) where motion is reduced or the quality level is 1 or more at the call's start,
//   or where the twin can't walk; otherwise the dog, where it shows with a walk or a run clip (a dog with neither is a
//   dog not shown: Q21), enters along the path reversed to `meet` at `dog_mps`; the twin and the dog walk to the floor
//   below the bicycle at `walk_mps` (the dog stopping DOG_STOP_M short of it, beside the twin); the bicycle is taken
//   over `take_s`; the three go out along the path and each is hidden at its end; the left line is said once (`left`),
//   for both or the twin.
// - Reduced motion or quality level 1 or more beginning mid-scene cuts it at once; a paused room stops its clock.
// - Movement is by arc length along routes made once, at the director's making; each frame writes in place into the
//   twin's, the dog's, and the bicycle's records and allocates nothing (T-B04's bench reads the source).
import type { AvatarId } from "../../choice/avatars";
import type { LeaveData } from "../compose/bundle";
import { headingOf } from "../walk/movement";

export const DINO_PHASES = ["idle", "call", "enter", "gather", "take", "leave", "gone", "cut"] as const;
export type DinoPhase = (typeof DINO_PHASES)[number];

/** How far short of the floor below the bicycle the dog stops, beside the twin (metres; this plan's reading, the
 *  Author's look to place). */
export const DOG_STOP_M = 0.3;

/** What the director reads each frame. */
export interface DinoInputs {
  readonly chosen: AvatarId;
  /** The hand-off has ended. */
  readonly handedOff: boolean;
  /** The visitor's figure shows the dinosaur's model (not its cut-out). */
  readonly modelShown: boolean;
  /** The 3D room shows. */
  readonly view3d: boolean;
  readonly reduced: boolean;
  /** The quality level (spec 005's ladder). */
  readonly level: number;
  /** The twin's figure can walk: its avatar shows, with the leg bones and the hips bone. */
  readonly twinCanWalk: boolean;
  /** The room's dog shows its model. */
  readonly dogShown: boolean;
  /** The room's dog has its walk clip or its run clip (chase.ts's `dogRole` finds one); a dog with neither takes no
   *  part, as one not shown (FR-026, Q21). */
  readonly dogHasWalk: boolean;
  /** The room is paused (spec 002's motion store). */
  readonly paused: boolean;
}

/** A walker's pose this frame: its place on the floor, spec 008's heading, whether it shows, and its step. */
export interface DinoFigure {
  x: number;
  z: number;
  facing: number;
  visible: boolean;
  moving: boolean;
  /** Metres a second while moving, else 0. */
  speed: number;
}

/** The bicycle's state: whether it shows, and the take's progress, 0 on the wall to 1 beside the twin. */
export interface DinoCarried {
  visible: boolean;
  taken: number;
}

export interface DinoScene {
  readonly phase: DinoPhase;
  readonly twin: Readonly<DinoFigure>;
  readonly dog: Readonly<DinoFigure>;
  readonly carried: Readonly<DinoCarried>;
  /** The dog takes part: decided at the call's end, from whether it shows with a walk or a run clip. */
  readonly withDog: boolean;
  /** One frame, `dt` the room's clock's seconds. */
  frame(dt: number, inputs: Readonly<DinoInputs>): void;
}

export interface DinoSceneOptions {
  readonly leave: LeaveData;
  /** The twin's home: its picture's place and spec 008's heading. */
  readonly twin: { readonly x: number; readonly z: number; readonly heading: number };
  /** The call's seconds, read once as it starts. */
  callSeconds(): number;
  /** The call has started: the stage shows the bubble, says the line, and asks the twin's wave. Once a visit. */
  call(): void;
  /** The three have left, or the scene was cut: the left line, for both or the twin alone. Once a visit. */
  left(who: "both" | "twin"): void;
}

/** A route along points: their coordinates and the arc length at each, to `total`. Made once. */
interface Route {
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly cum: Float64Array;
  readonly total: number;
}

function route(points: readonly (readonly [number, number])[], stop = 0): Route {
  const n = points.length;
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const cum = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = points[i] as readonly [number, number];
    x[i] = p[0];
    z[i] = p[1];
    if (i > 0) cum[i] = (cum[i - 1] as number) + Math.hypot(p[0] - (x[i - 1] as number), p[1] - (z[i - 1] as number));
  }
  return { x, z, cum, total: Math.max(0, (cum[n - 1] ?? 0) - stop) };
}

/** Writes the point at arc length `s` along the route into `f`, facing its segment. */
function at(r: Route, s: number, f: DinoFigure): void {
  const last = r.cum.length - 1;
  let i = 1;
  while (i < last && (r.cum[i] as number) < s) i += 1;
  if (last < 1) {
    f.x = r.x[0] ?? f.x;
    f.z = r.z[0] ?? f.z;
    return;
  }
  const a = i - 1;
  const ax = r.x[a] as number;
  const az = r.z[a] as number;
  const dx = (r.x[i] as number) - ax;
  const dz = (r.z[i] as number) - az;
  const seg = (r.cum[i] as number) - (r.cum[a] as number);
  const u = seg > 0 ? Math.min(1, Math.max(0, (s - (r.cum[a] as number)) / seg)) : 1;
  f.x = ax + dx * u;
  f.z = az + dz * u;
  if (seg > 0) f.facing = headingOf(dx, dz);
}

/** One walker's step along its route by `ds` metres at `speed`: its new arc length. */
function walk(f: DinoFigure, r: Route, s: number, ds: number, speed: number): number {
  const next = Math.min(r.total, s + ds);
  at(r, next, f);
  f.moving = next < r.total;
  f.speed = f.moving ? speed : 0;
  return next;
}

/** The dog takes part where it shows with a walk or a run clip; with neither, it is treated as not shown (Q21). */
function dogTakesPart(i: Readonly<DinoInputs>): boolean {
  return i.dogShown && i.dogHasWalk;
}

export function createDinoScene(options: DinoSceneOptions): DinoScene {
  const { leave } = options;
  const home: readonly [number, number] = [options.twin.x, options.twin.z];
  const path = leave.path;
  const reversed = [...path].reverse();
  // The routes, made once (FR-021): the dog's entry, the gather's two, and the leave's two.
  const enterRoute = route([...reversed, leave.meet]);
  const gatherTwin = route([home, leave.take_at]);
  const gatherDog = route([leave.meet, leave.take_at], DOG_STOP_M);
  const dogAt: DinoFigure = { x: 0, z: 0, facing: 0, visible: false, moving: false, speed: 0 };
  at(gatherDog, gatherDog.total, dogAt);
  const leaveTwin = route([leave.take_at, ...path]);
  const leaveDog = route([[dogAt.x, dogAt.z], ...path]);

  const twin: DinoFigure = {
    x: options.twin.x,
    z: options.twin.z,
    facing: options.twin.heading,
    visible: true,
    moving: false,
    speed: 0,
  };
  const dog: DinoFigure = { x: 0, z: 0, facing: 0, visible: false, moving: false, speed: 0 };
  at(enterRoute, 0, dog);
  const carried: DinoCarried = { visible: true, taken: 0 };
  let phase: DinoPhase = "idle";
  /** Seconds in the phase. */
  let t = 0;
  let callFor = 0;
  /** A cut decided at the call's start (reduced motion or quality level 1 or more then). */
  let cutDue = false;
  let withDog = false;
  let sTwin = 0;
  let sDog = 0;
  let twinOut = false;
  let dogOut = false;

  /** The call starts (FR-020): once a visit. */
  function begin(i: Readonly<DinoInputs>): void {
    phase = "call";
    t = 0;
    callFor = Math.max(0, options.callSeconds());
    cutDue = i.reduced || i.level >= 1;
    options.call();
  }

  /** The cut (FR-026): the three hidden at once, the left line said. */
  function hideAll(i: Readonly<DinoInputs>): void {
    const both = phase === "call" ? dogTakesPart(i) : withDog;
    phase = "cut";
    twin.visible = false;
    twin.moving = false;
    twin.speed = 0;
    dog.visible = false;
    dog.moving = false;
    dog.speed = 0;
    carried.visible = false;
    options.left(both ? "both" : "twin");
  }

  /** The phase's frame, the clock running. */
  function step(dt: number, i: Readonly<DinoInputs>): void {
    t += dt;
    const walkStep = leave.walk_mps * dt;
    switch (phase) {
      case "call":
        if (t < callFor) return;
        if (cutDue || !i.twinCanWalk) {
          hideAll(i);
          return;
        }
        withDog = dogTakesPart(i);
        t = 0;
        sTwin = 0;
        sDog = 0;
        if (withDog) {
          phase = "enter";
          dog.visible = true;
          at(enterRoute, 0, dog);
        } else phase = "gather";
        return;
      case "enter":
        sDog = walk(dog, enterRoute, sDog, leave.dog_mps * dt, leave.dog_mps);
        if (sDog >= enterRoute.total) {
          dog.moving = false;
          phase = "gather";
          t = 0;
          sDog = 0;
        }
        return;
      case "gather":
        if (sTwin < gatherTwin.total) sTwin = walk(twin, gatherTwin, sTwin, walkStep, leave.walk_mps);
        if (withDog && sDog < gatherDog.total) sDog = walk(dog, gatherDog, sDog, walkStep, leave.walk_mps);
        if (sTwin >= gatherTwin.total && (!withDog || sDog >= gatherDog.total)) {
          twin.moving = false;
          dog.moving = false;
          phase = "take";
          t = 0;
          carried.taken = 0;
        }
        return;
      case "take":
        carried.taken = Math.min(1, t / leave.take_s);
        if (t >= leave.take_s) {
          carried.taken = 1;
          phase = "leave";
          t = 0;
          sTwin = 0;
          sDog = 0;
        }
        return;
      case "leave":
        if (!twinOut) {
          sTwin = walk(twin, leaveTwin, sTwin, walkStep, leave.walk_mps);
          if (sTwin >= leaveTwin.total) {
            twinOut = true;
            twin.visible = false;
            carried.visible = false;
          }
        }
        if (withDog && !dogOut) {
          sDog = walk(dog, leaveDog, sDog, walkStep, leave.walk_mps);
          if (sDog >= leaveDog.total) {
            dogOut = true;
            dog.visible = false;
          }
        }
        if (twinOut && (!withDog || dogOut)) {
          phase = "gone";
          options.left(withDog ? "both" : "twin");
        }
        return;
      default:
        return;
    }
  }

  return {
    get phase() {
      return phase;
    },
    twin,
    dog,
    carried,
    get withDog() {
      return withDog;
    },
    frame(dt: number, i: Readonly<DinoInputs>): void {
      if (phase === "gone" || phase === "cut") return;
      if (phase === "idle") {
        if (i.chosen === "dinosaur" && i.handedOff && i.modelShown && i.view3d) begin(i);
        return;
      }
      if (i.paused) {
        twin.moving = false;
        dog.moving = false;
        return;
      }
      // Reduced motion or quality level 1 or more beginning mid-scene: cut at once (FR-026).
      if (!cutDue && (i.reduced || i.level >= 1)) {
        hideAll(i);
        return;
      }
      step(dt, i);
    },
  };
}
