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

  let present = false;
  /** Seconds since FR-001 stopped holding, while the run is on. */
  let since = 0;
  let on = false;
  /** The figures named at the start, once said; null while nothing has been said this run. */
  let said: ChaseWho | null = null;

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

  return {
    frame(dino, dt, motion) {
      // A paused room (FR-024): its clock stops, and so does the run, the delay with it; figures stay where they are.
      if (motion.paused) {
        resumed = true;
        return;
      }
      if (resumed) {
        resumed = false;
        for (const f of [twin, dog]) if (f) f.runner.last = Number.NaN;
      }
      // A figure that can't run is home: a cut where it was away (FR-014, FR-023).
      for (const f of [twin, dog]) if (f && f.held && f.phase !== "home") putHome(f);
      // Reduced motion or quality level 1 or more (FR-024): no figure moves; one away is cut home, and nothing is said,
      // since no figure can move (FR-025).
      if (!motion.animate || motion.level >= 1) {
        for (const f of [twin, dog]) if (f && f.phase !== "home") putHome(f);
        said = null;
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
        if (!was) for (const f of [twin, dog]) if (f) f.runner.last = Number.NaN;
        if (!on) {
          on = true;
          for (const f of [twin, dog]) if (f) f.runner.last = Number.NaN;
        }
      } else if (on) {
        since += dt;
        if (was) for (const f of [twin, dog]) if (f) f.runner.last = Number.NaN;
        if (since >= config.flee_end_delay_s) on = false;
      }
      if (on) {
        flee(twin, dino, dt, null);
        flee(dog, dino, dt, twin ? twin.runner : null);
        if (said === null) {
          // FR-025: said once a figure moves; a figure that only turns to watch isn't running.
          const who = whoOf(twin !== null && moving(twin), dog !== null && moving(dog));
          if (who) {
            said = who;
            options.note?.({ state: "started", who });
          }
        }
      } else {
        back(twin, dt);
        back(dog, dt);
        if (said !== null && twin?.phase !== "returning" && dog?.phase !== "returning") {
          options.note?.({ state: "ended", who: said });
          said = null;
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
  };
}
