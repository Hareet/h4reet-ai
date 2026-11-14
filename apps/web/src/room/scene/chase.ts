// The run's director (spec 025; FR-001 to FR-003, FR-010, FR-012, FR-023 to FR-025; plan.md R-01, R-07): pure, on
// numbers, with no three.js import. It reads the pursuer each frame (the visitor's figure as the dinosaur, from the
// walking view's pose) and moves the twin's and the room's dog's runners on the chase floor: away from it while the run
// is on (chase-steer.ts), home at the walking speed once it ends. It says the run's start and end once each, through
// `note`. chase-figures.ts is its shell: it places the pictures from the runners and drives their legs and clips.
import type { WalkableFloor } from "../compose/floor";
import type { ChaseConfig, Runner } from "./chase-steer";
import { createRunner, steer, walkHome } from "./chase-steer";

export type ChaseFigureId = "twin" | "dog";
export type ChaseWho = "both" | "twin" | "dog";
export type ChasePhase = "home" | "fleeing" | "returning";

export interface ChaseHome {
  readonly x: number;
  readonly z: number;
  /** Radians, spec 008's convention. */
  readonly heading: number;
}

/** The pursuer this frame: FR-001's condition, and the walking view's pose. */
export interface ChaseInput {
  readonly present: boolean;
  readonly x: number;
  readonly z: number;
}

/** The room's motion this frame: reduced motion (animate false), the room's pause, and the quality level. */
export interface ChaseMotion {
  readonly animate: boolean;
  readonly paused: boolean;
  readonly level: number;
}

export interface ChaseNote {
  readonly state: "started" | "ended";
  readonly who: ChaseWho;
}

export interface Chase {
  /** One frame: the pursuer has moved; `dt` is the room's clock's, in seconds. */
  frame(dino: ChaseInput, dt: number, motion: ChaseMotion): void;
  /** FR-001 holds, or held less than `flee_end_delay_s` ago. */
  readonly on: boolean;
  /** A figure's runner, written in place; null where the scene has no such figure. */
  runner(id: ChaseFigureId): Runner | null;
  phase(id: ChaseFigureId): ChasePhase;
  /** The figure moves for the run, going or coming back (FR-012: the twin's `fleeing`). */
  moving(id: ChaseFigureId): boolean;
  /** A figure that can't run (FR-014, FR-023, a dog with neither clip): it holds at home. */
  hold(id: ChaseFigureId, held: boolean): void;
  /** Spec 026 (FR-005; plan.md R-07; M3): turn the twin at its home toward `heading` (radians, spec 008's), or back to
   *  its home heading on null. Asked while the run is on, or the twin isn't home, it does nothing. */
  faceTwin(heading: number | null): void;
}

/** Spec 026 (FR-005; R-07): faceTwin's rate, 180° a second. */
export const FACE_RATE_RAD_S = Math.PI;
/** Spec 026 (R-07): how far faceTwin turns the twin from its home heading at most, 90°, the ceiling of
 *  `figures.pet.turn_max_deg`; the pet director clamps its aim to the data's own `turn_max_deg` before it asks. */
export const FACE_MAX_RAD = Math.PI / 2;

/** faceTwin's request, in a class's fields so the frame writes no boxed number (spec 026, FR-027). */
class Face {
  on = false;
  heading = 0;
  /** This frame's turn at most, `FACE_RATE_RAD_S · dt`: a field, so `turnTwin` takes no fraction (rework3-026). */
  step = 0;
}

/** FR-001's condition: the visitor chose the dinosaur, its figure shows the model, and the walking view is on. */
export function pursuerPresent(input: {
  readonly chosen: string | null;
  readonly shows: boolean;
  readonly walking: boolean;
}): boolean {
  return input.chosen === "dinosaur" && input.shows && input.walking;
}

/** The room's dog's clip by its speed (FR-010): idle, walk, run at time scale 1; a missing run plays walk, a missing
 *  walk plays run, neither plays idle (the dog is held). */
export function dogRole(
  speed: number,
  thresholds: ChaseConfig["clip_thresholds"],
  has: { readonly walk: boolean; readonly run: boolean },
): "idle" | "walk" | "run" {
  if (speed < thresholds.walk_mps || (!has.walk && !has.run)) return "idle";
  if (speed <= thresholds.run_mps) return has.walk ? "walk" : "run";
  return has.run ? "run" : "walk";
}

/** Within this of its home, a figure is there (metres). */
const HOME_M = 1e-3;

interface Figure {
  readonly id: ChaseFigureId;
  readonly home: ChaseHome;
  readonly runner: Runner;
  readonly run: number;
  phase: ChasePhase;
  held: boolean;
}

export function createChase(options: {
  readonly floor: WalkableFloor;
  readonly config: ChaseConfig;
  readonly walkMps: number;
  readonly figures: { readonly twin?: ChaseHome | null; readonly dog?: ChaseHome | null };
  readonly note?: (note: ChaseNote) => void;
}): Chase {
  const { floor, config, walkMps } = options;
  const make = (id: ChaseFigureId, home: ChaseHome | null | undefined, run: number): Figure | null =>
    home ? { id, home, runner: createRunner(home.x, home.z, home.heading), run, phase: "home", held: false } : null;
  const twin = make("twin", options.figures.twin, config.twin_run_mps);
  const dog = make("dog", options.figures.dog, config.dog_run_mps);
  const of = (id: ChaseFigureId): Figure | null => (id === "twin" ? twin : dog);
  /** The figures the scene has, made once, so a frame makes no array (FR-029). */
  const all: readonly Figure[] = [twin, dog].filter((f): f is Figure => f !== null);

  let present = false;
  /** Seconds since FR-001 stopped holding, while the run is on. */
  let since = 0;
  let on = false;
  /** The figures named at the start, once said; null while nothing has been said this run. */
  let said: ChaseWho | null = null;
  /** The figures that moved in this run, which its end names (FR-025; rv-impl-025's N-5): a figure that joins mid-run
   *  (held at the start, then free) among them. */
  let ranTwin = false;
  let ranDog = false;

  /** Off its home's spot; `away` also counts a facing turned from its home's (it stood and watched). */
  const off = (f: Figure): boolean => Math.hypot(f.runner.x - f.home.x, f.runner.z - f.home.z) > HOME_M;
  const away = (f: Figure): boolean => off(f) || f.runner.facing !== f.home.heading;

  const moving = (f: Figure): boolean => f.phase !== "home" && (f.runner.speed > 0 || off(f));
  const whoOf = (a: boolean, b: boolean): ChaseWho | null => (a && b ? "both" : a ? "twin" : b ? "dog" : null);

  const flee = (f: Figure | null, dino: ChaseInput, dt: number, other: Runner | null): void => {
    if (!f || f.held) return;
    steer(floor, f.runner, f.run, dino, config, walkMps, dt, other);
    if (f.runner.speed > 0 || away(f)) f.phase = "fleeing";
  };

  /** At home, facing as its home turns it: the walk's end, or a cut (FR-024, a figure held mid-run). */
  const putHome = (f: Figure): void => {
    f.runner.x = f.home.x;
    f.runner.z = f.home.z;
    f.runner.facing = f.home.heading;
    f.runner.heading = f.home.heading;
    f.runner.speed = 0;
    f.runner.last = Number.NaN;
    f.phase = "home";
  };

  const back = (f: Figure | null, dt: number): void => {
    if (!f) return;
    if (f.phase === "home") return;
    f.phase = "returning";
    if (walkHome(floor, f.runner, f.home, walkMps, config, dt) || !away(f)) putHome(f);
  };

  /** The room was paused: the next frame that moves is a resume, clause (a)'s. */
  let resumed = false;
  const face = new Face();

  /** Spec 026 (R-07): the twin at home turns toward the request, or back to its home heading, by `face.step` (this
   *  frame's share of FACE_RATE_RAD_S). Its place, step heading, speed, and phase stay its home's, so it turns, never
   *  walks. `turnToward`'s arithmetic written out, and no argument (FR-027; rework3-026, the page's Q284): a fraction
   *  passed to or returned from a call V8 doesn't inline is boxed at the call, and with spec 026's director in the
   *  room's frame V8's inlining budget can run out before it reaches this one or `turnToward` (measured). */
  const turnTwin = (): void => {
    if (!twin || twin.phase !== "home") return;
    const to = face.on ? face.heading : twin.home.heading;
    const r = twin.runner;
    const from = r.facing;
    if (from === to) return;
    const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    const max = face.step;
    r.facing = Math.abs(d) <= max ? to : from + Math.sign(d) * max;
  };

  return {
    frame(dino, dt, motion) {
      // A paused room (FR-024): its clock stops, and so does the run, the delay with it; figures stay where they are.
      if (motion.paused) {
        resumed = true;
        return;
      }
      if (resumed) {
        resumed = false;
        for (const f of all) f.runner.last = Number.NaN;
      }
      // A figure that can't run is home: a cut where it was away (FR-014, FR-023).
      for (const f of all) if (f.held && f.phase !== "home") putHome(f);
      // Reduced motion or quality level 1 or more (FR-024): no figure moves; one away is cut home, and nothing is said,
      // since no figure can move (FR-025).
      if (!motion.animate || motion.level >= 1) {
        for (const f of all) if (f.phase !== "home") putHome(f);
        // Spec 026 (R-07): the twin's turn too, at once, and the request dropped.
        face.on = false;
        if (twin) twin.runner.facing = twin.home.heading;
        said = null;
        ranTwin = false;
        ranDog = false;
        present = dino.present;
        on = false;
        since = 0;
        return;
      }
      const was = present;
      present = dino.present;
      if (present) {
        since = 0;
        // A return inside the delay comes with a jump (the walking view's entry puts the pose at its start): clause (a).
        if (!was) for (const f of all) f.runner.last = Number.NaN;
        if (!on) {
          on = true;
          for (const f of all) f.runner.last = Number.NaN;
          // Spec 026 (R-07): the run outranks the turn; the twin comes home to its home heading after it.
          face.on = false;
        }
      } else if (on) {
        since += dt;
        if (was) for (const f of all) f.runner.last = Number.NaN;
        if (since >= config.flee_end_delay_s) on = false;
      }
      if (on) {
        flee(twin, dino, dt, null);
        flee(dog, dino, dt, twin ? twin.runner : null);
        // FR-025: said once a figure moves; a figure that only turns to watch isn't running.
        const twinMoves = twin !== null && moving(twin);
        const dogMoves = dog !== null && moving(dog);
        ranTwin ||= twinMoves;
        ranDog ||= dogMoves;
        if (said === null) {
          const who = whoOf(twinMoves, dogMoves);
          if (who) {
            said = who;
            options.note?.({ state: "started", who });
          }
        }
      } else {
        back(twin, dt);
        back(dog, dt);
        face.step = FACE_RATE_RAD_S * dt;
        turnTwin();
        if (said !== null && twin?.phase !== "returning" && dog?.phase !== "returning") {
          // The figures that moved in the run, which hold `said`'s at least.
          options.note?.({ state: "ended", who: whoOf(ranTwin, ranDog) ?? said });
          said = null;
          ranTwin = false;
          ranDog = false;
        }
      }
    },
    get on() {
      return on;
    },
    runner(id) {
      return of(id)?.runner ?? null;
    },
    phase(id) {
      return of(id)?.phase ?? "home";
    },
    moving(id) {
      const f = of(id);
      return f !== null && moving(f);
    },
    hold(id, held) {
      const f = of(id);
      if (f) f.held = held;
    },
    faceTwin(heading) {
      if (!twin || on || twin.phase !== "home") return;
      if (heading === null) {
        face.on = false;
        return;
      }
      const d = Math.atan2(Math.sin(heading - twin.home.heading), Math.cos(heading - twin.home.heading));
      face.heading = twin.home.heading + Math.max(-FACE_MAX_RAD, Math.min(FACE_MAX_RAD, d));
      face.on = true;
    },
  };
}
