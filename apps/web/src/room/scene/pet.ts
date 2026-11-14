// The pet director (spec 026; FR-001 to FR-012; plan.md R-01, R-02, R-07, R-08): pure, on numbers, with no three.js
// import. A selection of the `dog` selectable, where both figures stand at home and the dog's home is within `reach_m`
// of the twin's, turns the twin toward the dog through spec 025's director (`faceTwin`, the one writer of the twin's
// heading stays chase-figures.ts), pets it (the studio's `petting` clip where it is loaded, else the reach layer's
// numbers, which the twin's controller applies), and turns it back. The dog stays at its home throughout (Q159): the
// director reads its view and never writes it. A run from the dinosaur outranks the petting (FR-011).
import { PET_REACH_DEFAULTS, strokeShare, strokeTarget, weightAt } from "./pet-reach";
import type { Vec3 } from "./pet-reach";

/** The pet block's tunables (spec "Pet block"; plan §3): scene data in `figures.pet`, these its defaults. */
export interface PetConfig {
  readonly reach_m: number;
  readonly cooldown_s: number;
  readonly turn_max_deg: number;
  readonly crouch_max_m: number;
  readonly lean_max_deg: number;
  readonly stroke_m: number;
  readonly stroke_n: number;
  readonly pet_s: number;
  readonly elbow_deg: number;
}

export const PET_DEFAULTS: PetConfig = Object.freeze({
  reach_m: 0.55,
  cooldown_s: 20,
  turn_max_deg: 60,
  ...PET_REACH_DEFAULTS,
});

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
  /** Its rig has the six reach bones on both sides (pet-reach's `findReachRig`). */
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

/** The reach layer's numbers this frame, written in place: the arm, the layer's weight, and the hand's target. */
export interface PetReach {
  readonly side: PetSide;
  readonly weight: number;
  readonly target: Readonly<Vec3>;
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

/** The `dog` selectable's ID (spec FR-013). */
export const DOG_SELECTABLE = "dog";
/** The run's cut eases the reach out over this (FR-011). */
export const CUT_EASE_S = 0.2;
/** The twin's heading is at the aim within this (radians). */
const AT_HEADING = 1e-3;
/** A turn not done in this long goes on anyway (FR-005: a third of a second at the defaults). */
const TURN_LIMIT_S = 1;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** The dog's home is within `reach_m` of the twin's, the boundary included (R-08; FR-003, FR-004). */
export function inReach(
  twin: { readonly x: number; readonly z: number },
  dog: { readonly x: number; readonly z: number },
  reach_m: number,
): boolean {
  return Math.hypot(dog.x - twin.x, dog.z - twin.z) <= reach_m + 1e-12;
}

/** The twin's heading toward the dog's home, within `turn_max_deg` of its home heading, and the arm on the dog's side:
 *  by the dog's place against the twin's right vector at its home heading, (cos h, −sin h) (R-08). */
export function petAim(
  twin: PetHome,
  dog: { readonly x: number; readonly z: number },
  cfg: { readonly turn_max_deg: number },
): { heading: number; side: PetSide } {
  const dx = dog.x - twin.x;
  const dz = dog.z - twin.z;
  const max = (Math.max(0, cfg.turn_max_deg) * Math.PI) / 180;
  const off = wrap(Math.atan2(-dx, -dz) - twin.heading);
  const heading = twin.heading + Math.min(max, Math.max(-max, off));
  const side: PetSide = dx * Math.cos(twin.heading) - dz * Math.sin(twin.heading) >= 0 ? "right" : "left";
  return { heading, side };
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
  let aim = 0;
  let side: PetSide = "right";
  /** Seconds in the present phase, on the room's frames (a pause holds it). */
  let t = 0;
  /** The petting's length: the clip's or `pet_s`. */
  let length = config.pet_s;
  /** The present petting's start, on the clock. */
  let startMs = 0;
  /** The last petting's end, on the clock; none yet. */
  let lastEnd = -Infinity;
  /** The run's cut: the weight it eased from, and while it eases. */
  let fadeFrom = 0;
  let fading = false;
  /** The dog's heading the stroke runs along, and the twin's home heading it turns back to, read at the start. */
  let dogHeading = 0;
  let homeHeading = 0;

  const head: Vec3 = { x: 0, y: 0, z: 0 };
  const base: Vec3 = { x: 0, y: 0, z: 0 };
  const reach = { side: "right" as PetSide, weight: 0, target: { x: 0, y: 0, z: 0 } as Vec3 };
  let reachOn = false;

  const near = (heading: number): boolean => Math.abs(wrap(chase.twinHeading() - heading)) <= AT_HEADING;

  const say = (on: boolean): void => {
    activity = { kind: "pet", on };
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
    const n = Math.hypot(bx, bz) || 1;
    base.x = head.x + (0.05 * bx) / n;
    base.y = head.y - 0.03;
    base.z = head.z + (0.05 * bz) / n;
    dogHeading = dog.home.heading;
  };

  /** The petting ends, done or cut: the twin's state off, the twin turned back. */
  const endPetting = (outcome: "done" | "cut"): void => {
    if (phase === "petting") say(false);
    chase.faceTwin(null);
    lastEnd = clock.now();
    options.log?.({ start_ms: startMs, end_ms: lastEnd, path: path ?? "reach", outcome });
    phase = "return";
    t = 0;
  };

  /** A run's cut (FR-011): the reach eases out over 0.2 s from where it is. */
  const cutByRun = (): void => {
    fadeFrom = reachOn ? reach.weight : 0;
    fading = fadeFrom > 0;
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
    t = 0;
  };

  return {
    select(id) {
      if (id !== DOG_SELECTABLE) return false;
      const twin = options.twin();
      const dog = options.dog();
      const now = clock.now();
      if (phase !== "idle" || now - lastEnd < config.cooldown_s * 1000 || !allowed(twin, dog) || !twin || !dog) {
        const would: PetPath = twin?.petting_s ? "clip" : "reach";
        options.log?.({ start_ms: now, end_ms: now, path: would, outcome: "skipped" });
        return false;
      }
      startMs = now;
      const a = petAim(twin.home, dog.home, config);
      aim = a.heading;
      side = a.side;
      homeHeading = twin.home.heading;
      reach.side = side;
      path = twin.petting_s !== null && twin.petting_s > 0 ? "clip" : "reach";
      length = path === "clip" ? (twin.petting_s as number) : config.pet_s;
      aimAt(twin, dog);
      phase = "turn";
      t = 0;
      chase.faceTwin(aim);
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
      t += step;
      switch (phase) {
        case "turn":
          if (near(aim) || t >= TURN_LIMIT_S) {
            phase = "petting";
            t = 0;
            say(true);
            reachOn = path === "reach";
          }
          break;
        case "petting":
          if (t >= length) endPetting("done");
          break;
        case "return":
          if (fading) {
            if (t >= CUT_EASE_S) {
              fading = false;
              reachOn = false;
            }
          } else {
            reachOn = false;
          }
          if (!fading && (chase.running() || near(homeHeading) || t >= TURN_LIMIT_S)) toIdle();
          break;
      }
      if (reachOn) {
        if (phase === "petting") {
          reach.weight = weightAt(t, { pet_s: length });
          strokeTarget(base, dogHeading, strokeShare(t, { pet_s: length }), config, reach.target);
        } else if (fading) {
          const u = Math.min(1, t / CUT_EASE_S);
          reach.weight = fadeFrom * (1 - u * u * (3 - 2 * u));
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
