// The pet director (spec 026; FR-001 to FR-012; plan.md R-01, R-02, R-07, R-08): pure, on numbers, with no three.js
// import. A selection of the `dog` selectable, where both figures stand at home and the dog's home is within `reach_m`
// of the twin's, turns the twin toward the dog through spec 025's director (`faceTwin`, the one writer of the twin's
// heading stays chase-figures.ts), pets it (the studio's `petting` clip where it is loaded, else the reach layer's
// numbers, which the twin's controller applies), and turns it back. The dog stays at its home throughout (Q159): the
// director reads its view and never writes it. A run from the dinosaur outranks the petting (FR-011).
import { PET_DEFAULTS } from "./pet-config";
import type { PetConfig } from "./pet-config";
import { Point, reachAt } from "./pet-reach";
import type { ReachClock, Vec3 } from "./pet-reach";

/** The pet block's tunables and their defaults (plan §3), in pet-config.ts so the build reads them without three.js. */
export { PET_DEFAULTS } from "./pet-config";
export type { PetConfig } from "./pet-config";

/** A figure's home on the floor: its place, and its heading in radians, spec 008's (h faces (−sin h, −cos h)). */
export interface PetHome {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

/** Spec 025's phases, as the director reads them (A025). */
export type PetFigurePhase = "home" | "fleeing" | "returning";

/** The twin's figure, as the adapters give it (A016, A025). */
export interface PetTwin {
  readonly home: PetHome;
  /** What its picture shows: its own model, the man stand-in, or the capsule. */
  readonly shows: "model" | "stand-in" | "capsule";
  /** Its rig has the reach's bones on both sides, as pet-reach's `findReachRig` reads them: the spine's three, each
   *  arm's `Arm`, `ForeArm`, `Hand`, and `HandMiddle1`, and since Q212 the `Hips` and both legs' `UpLeg`, `Leg`, `Foot`. */
  readonly rig: boolean;
  /** The loaded `petting` clip's length in seconds, or null: no clip, the reach's path. */
  readonly petting_s: number | null;
  /** Spec 016's `arriving` holds. */
  readonly arriving: boolean;
  readonly phase: PetFigurePhase;
}

/** The room's dog figure while its picture shows its model (A020, A025); the adapter gives null otherwise. */
export interface PetDog {
  readonly home: PetHome;
  readonly phase: PetFigurePhase;
  /** The point on its head the reach aims at, written into `out`. */
  headPoint(out: Vec3): Vec3;
}

/** Spec 025's director, as this one uses it (M3): the twin's turn, its heading, and whether a run is on. */
export interface PetChase {
  faceTwin(heading: number | null): void;
  twinHeading(): number;
  /** The twin's heading as `twinHeading` gives it, on an object read in place (spec 025's runner, or its home's), which
   *  the director reads where it is given: a fraction returned from a call V8 doesn't inline is boxed at the return,
   *  an object isn't (FR-027; rework3-026, the page's Q284). */
  twinFacing?(): { readonly facing: number };
  running(): boolean;
}

/** The room's motion this frame: the motion store (`animate`), the room's pause, the quality level, and whether the
 *  room is in 3D above the floor with its context (`live`). */
export interface PetMotion {
  readonly animate: boolean;
  readonly paused: boolean;
  readonly level: number;
  readonly live: boolean;
}

/** The input spec 016's state machine takes (FR-009; plan §4, M1). The same shape as twin-states.ts's `pet` kind. */
export interface PetActivity {
  readonly kind: "pet";
  readonly on: boolean;
}

export type PetPhase = "idle" | "turn" | "petting" | "return";
export type PetPath = "clip" | "reach";
export type PetSide = "right" | "left";

/** The reach layer's numbers this frame, written in place: the arm, the layer's weight, the hand's target, and whether
 *  the crouch (the hips and both legs) is laid: true through the petting, false from a run's cut on, when the hips and
 *  legs are the clip's again at once and only the arm and the spine ease out (Q226; FR-011). */
export interface PetReach {
  readonly side: PetSide;
  readonly weight: number;
  readonly target: Readonly<Vec3>;
  readonly legs: boolean;
}

/** The frame log's `twin-pet` record (FR-026): one per petting, done, cut, or skipped; no payload. */
export interface PetRecord {
  readonly start_ms: number;
  readonly end_ms: number;
  readonly path: PetPath;
  readonly outcome: "done" | "skipped" | "cut";
}

export interface Pet {
  /** A selection in the room; true where it started a petting. */
  select(id: string): boolean;
  /** One frame of the room's clock, `dt` in seconds. */
  frame(dt: number): void;
  /** The twin's `petting` clip has finished playing: the petting ends at once. */
  finished(): void;
  readonly phase: PetPhase;
  readonly path: PetPath | null;
  readonly activity: PetActivity | null;
  /** The reach layer's numbers while it has weight on the reach's path; null otherwise. */
  readonly reach: Readonly<PetReach> | null;
}

/** The reach's numbers, written in place each frame: a class, so V8 keeps its number fields unboxed (FR-027; I-1;
 *  `Point`, pet-reach.ts). */
class ReachState implements PetReach {
  side: PetSide = "right";
  weight = 0;
  readonly target = new Point();
  legs = true;
}

/** The director's numbers, fields written in place (I-1; rv-rework-026's B-3): a closure variable holding a fraction
 *  is boxed anew at each write, and a fraction passed to a call V8 doesn't inline is boxed at the call, so none is. */
class Numbers implements ReachClock {
  /** Seconds in the present phase, on the room's frames (a pause holds it). */
  t = 0;
  /** The twin's heading for the petting, and its home heading it turns back to, read at the start. */
  aim = 0;
  homeHeading = 0;
  /** The dog's heading the stroke runs along, read at the start. */
  dogHeading = 0;
  /** The present petting's start, and the last one's end, on the clock. */
  startMs = 0;
  lastEnd = -Infinity;
  /** The run's cut: the weight it eased from. */
  fadeFrom = 0;
  /** The petting's length, the clip's or `pet_s`, as the reach's weight and stroke read it (`reachAt` takes this
   *  object, with `t` and `dogHeading`). */
  pet_s = 0;
}

/** The aim `faceTwin` is asked for, in a tagged field (`heading`, null before the first petting) written only when the
 *  aim changes, which `last` (unboxed) tells by a comparison of two numbers: a number passed to a call V8 doesn't
 *  inline is boxed at the call unless it is boxed already, and the homes, so the aim, stay the same from one petting to
 *  the next (FR-027; rework3-026, the page's Q284, measured). */
class Asked {
  heading: number | null = null;
  last = 0;
  set = false;
}

/** `petAim`'s answer, written in place by `aimInto` (I-1). */
class Aim {
  heading = 0;
  side: PetSide = "right";
}

/** The two activities spec 016's machine takes: made once, so a petting's start and end make no object (B-3). */
const PET_ON: PetActivity = Object.freeze({ kind: "pet", on: true });
const PET_OFF: PetActivity = Object.freeze({ kind: "pet", on: false });

/** The `dog` selectable's ID (spec FR-013). */
export const DOG_SELECTABLE = "dog";
/** The run's cut eases the arm and the spine out over this; the crouch clears at once (FR-011; Q226). */
export const CUT_EASE_S = 0.2;
/** The twin's heading is at the aim within this (radians). */
const AT_HEADING = 1e-3;
/** A turn not done in this long goes on anyway (FR-005: a third of a second at the defaults). */
const TURN_LIMIT_S = 1;

/** The dog's home is within `reach_m` of the twin's, the boundary included (R-08; FR-003, FR-004). */
export function inReach(
  twin: { readonly x: number; readonly z: number },
  dog: { readonly x: number; readonly z: number },
  reach_m: number,
): boolean {
  const dx = dog.x - twin.x;
  const dz = dog.z - twin.z;
  return Math.sqrt(dx * dx + dz * dz) <= reach_m + 1e-12;
}

/** The twin's heading toward the dog's home, within `turn_max_deg` of its home heading, and the arm on the dog's side:
 *  by the dog's place against the twin's right vector at its home heading, (cos h, −sin h) (R-08). */
export function petAim(
  twin: PetHome,
  dog: { readonly x: number; readonly z: number },
  cfg: { readonly turn_max_deg: number },
): { heading: number; side: PetSide } {
  const out = new Aim();
  aimInto(twin, dog, cfg, out);
  return { heading: out.heading, side: out.side };
}

/** `petAim`, written into `out`: the director's, which makes no object (I-1). */
function aimInto(
  twin: PetHome,
  dog: { readonly x: number; readonly z: number },
  cfg: { readonly turn_max_deg: number },
  out: Aim,
): void {
  const dx = dog.x - twin.x;
  const dz = dog.z - twin.z;
  const max = (Math.max(0, cfg.turn_max_deg) * Math.PI) / 180;
  const off = Math.atan2(-dx, -dz) - twin.heading;
  out.heading = twin.heading + Math.min(max, Math.max(-max, Math.atan2(Math.sin(off), Math.cos(off))));
  out.side = dx * Math.cos(twin.heading) - dz * Math.sin(twin.heading) >= 0 ? "right" : "left";
}

export function createPet(options: {
  readonly config?: Partial<PetConfig> | null | undefined;
  readonly clock: { now(): number };
  readonly motion: () => PetMotion;
  readonly twin: () => PetTwin | null;
  readonly dog: () => PetDog | null;
  readonly chase: PetChase;
  readonly signal?: (activity: PetActivity) => void;
  /** Says the line in the room's polite live region, once as a petting starts (FR-024). */
  readonly note?: () => void;
  /** The draft build's frame log (FR-026). */
  readonly log?: (record: PetRecord) => void;
}): Pet {
  const config: PetConfig = { ...PET_DEFAULTS, ...options.config };
  const { clock, chase } = options;

  let phase: PetPhase = "idle";
  let path: PetPath | null = null;
  let activity: PetActivity | null = null;
  /** The director's numbers (I-1; B-3). */
  const n = new Numbers();
  const aim = new Aim();
  const asked = new Asked();
  /** While the run's cut eases the arm and the spine out. */
  let fading = false;

  const head = new Point();
  const base = new Point();
  const reach = new ReachState();
  let reachOn = false;

  /** The twin's heading is at the petting's aim, or back at its home heading: a field read here, not a fraction
   *  passed in (B-3). */
  const atAim = (): boolean => {
    const d = (chase.twinFacing ? chase.twinFacing().facing : chase.twinHeading()) - n.aim;
    return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) <= AT_HEADING;
  };
  const atHome = (): boolean => {
    const d = (chase.twinFacing ? chase.twinFacing().facing : chase.twinHeading()) - n.homeHeading;
    return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) <= AT_HEADING;
  };

  const say = (on: boolean): void => {
    activity = on ? PET_ON : PET_OFF;
    options.signal?.(activity);
  };

  /** The twin's figure can pet: its model or the man stand-in, with the reach's bones (FR-001). */
  const usable = (twin: PetTwin): boolean => twin.shows !== "capsule" && twin.rig;

  /** What cuts a petting at once (FR-011, SC-003): reduced motion, quality level 1 or more, the room out of 3D or its
   *  context lost, or either figure's picture lost or the twin's no longer usable. A pause isn't one: it holds. */
  const broken = (m: PetMotion): boolean => {
    if (!m.live || !m.animate || m.level !== 0) return true;
    const twin = options.twin();
    return !twin || !usable(twin) || !options.dog();
  };

  /** FR-001's conditions, the selection's moment. */
  const allowed = (twin: PetTwin | null, dog: PetDog | null): boolean => {
    const m = options.motion();
    if (!twin || !dog || !usable(twin)) return false;
    if (!m.live || !m.animate || m.paused || m.level !== 0) return false;
    if (twin.arriving || twin.phase !== "home" || dog.phase !== "home") return false;
    if (chase.running()) return false;
    return inReach(twin.home, dog.home, config.reach_m);
  };

  /** The reach's target from the dog's head (R-03): lowered 0.03 m and moved 0.05 m toward the twin. */
  const aimAt = (twin: PetTwin, dog: PetDog): void => {
    dog.headPoint(head);
    const bx = twin.home.x - head.x;
    const bz = twin.home.z - head.z;
    const d = Math.sqrt(bx * bx + bz * bz) || 1;
    base.x = head.x + (0.05 * bx) / d;
    base.y = head.y - 0.03;
    base.z = head.z + (0.05 * bz) / d;
    n.dogHeading = dog.home.heading;
  };

  /** The petting ends, done or cut: the twin's state off, the twin turned back. */
  const endPetting = (outcome: "done" | "cut"): void => {
    if (phase === "petting") say(false);
    chase.faceTwin(null);
    n.lastEnd = clock.now();
    options.log?.({ start_ms: n.startMs, end_ms: n.lastEnd, path: path ?? "reach", outcome });
    phase = "return";
    n.t = 0;
  };

  /** A run's cut (FR-011; Q226): the crouch clears at once, since the run drives the legs; the arm and the spine ease
   *  out over 0.2 s from where they are. */
  const cutByRun = (): void => {
    n.fadeFrom = reachOn ? reach.weight : 0;
    fading = n.fadeFrom > 0;
    reach.legs = false;
    endPetting("cut");
  };

  /** A cut at once (FR-011): the reach cleared, the twin's heading back to its home's (spec 025's director puts it there
   *  at once under these), and nothing left under way. */
  const cutAtOnce = (): void => {
    reachOn = false;
    fading = false;
    if (phase !== "return") endPetting("cut");
    toIdle();
  };

  const toIdle = (): void => {
    phase = "idle";
    path = null;
    reachOn = false;
    fading = false;
    n.t = 0;
  };

  return {
    select(id) {
      if (id !== DOG_SELECTABLE) return false;
      const twin = options.twin();
      const dog = options.dog();
      const now = clock.now();
      if (phase !== "idle" || now - n.lastEnd < config.cooldown_s * 1000 || !allowed(twin, dog) || !twin || !dog) {
        const would: PetPath = twin?.petting_s ? "clip" : "reach";
        options.log?.({ start_ms: now, end_ms: now, path: would, outcome: "skipped" });
        return false;
      }
      n.startMs = now;
      aimInto(twin.home, dog.home, config, aim);
      n.aim = aim.heading;
      n.homeHeading = twin.home.heading;
      reach.side = aim.side;
      reach.legs = true;
      path = twin.petting_s !== null && twin.petting_s > 0 ? "clip" : "reach";
      // Two stores, not one of a choice: the choice of the clip's length (a tagged field, null or a number) and
      // `pet_s` (unboxed) is a tagged value, so `pet_s` would be boxed anew at each petting (B-3, measured).
      if (path === "clip") n.pet_s = twin.petting_s as number;
      else n.pet_s = config.pet_s;
      aimAt(twin, dog);
      phase = "turn";
      n.t = 0;
      if (!asked.set || asked.last !== n.aim) {
        asked.last = n.aim;
        asked.heading = n.aim;
        asked.set = true;
      }
      chase.faceTwin(asked.heading);
      options.note?.();
      return true;
    },
    frame(dt) {
      if (phase === "idle") return;
      const m = options.motion();
      if (broken(m)) {
        cutAtOnce();
        return;
      }
      if (m.paused) return;
      const step = Math.max(0, dt);
      if ((phase === "turn" || phase === "petting") && chase.running()) cutByRun();
      n.t += step;
      switch (phase) {
        case "turn":
          if (atAim() || n.t >= TURN_LIMIT_S) {
            phase = "petting";
            n.t = 0;
            say(true);
            reachOn = path === "reach";
          }
          break;
        case "petting":
          if (n.t >= n.pet_s) endPetting("done");
          break;
        case "return":
          if (fading) {
            if (n.t >= CUT_EASE_S) {
              fading = false;
              reachOn = false;
            }
          } else {
            reachOn = false;
          }
          if (!fading && (chase.running() || atHome() || n.t >= TURN_LIMIT_S)) toIdle();
          break;
      }
      if (reachOn) {
        if (phase === "petting") {
          // Objects only, no fraction passed or returned (FR-027; rework3-026).
          reachAt(n, base, config, reach);
        } else if (fading) {
          const u = Math.min(1, n.t / CUT_EASE_S);
          reach.weight = n.fadeFrom * (1 - u * u * (3 - 2 * u));
        }
      }
    },
    finished() {
      if (phase === "petting" && path === "clip") endPetting("done");
    },
    get phase() {
      return phase;
    },
    get path() {
      return path;
    },
    get activity() {
      return activity;
    },
    get reach() {
      return reachOn && (phase === "petting" || fading) ? reach : null;
    },
  };
}
