// Fakes for spec 026's pet director (T009, T010): the twin's and the dog's views as the adapters give them (A016, A020,
// A025), a fake of spec 025's director that turns the twin at 180°/s on `faceTwin` and puts its heading back at once
// under reduced motion or quality level 1 or more (R-07), and the room's fake clock. pet-director.test.ts (T007) keeps
// its own copy, as it was written first.
import { createPet } from "../../src/room/scene/pet";
import type { Pet, PetActivity, PetConfig, PetDog, PetHome, PetMotion, PetTwin } from "../../src/room/scene/pet";
import type { Vec3 } from "../../src/room/scene/pet-reach";
import { FakeClock } from "./room";

/** The twin's home (plan §3), facing glTF's +z, spec 008's heading π; the dog's, Q158's estimate. */
export const TWIN_HOME: PetHome = { x: 0.66, z: 0.469, heading: Math.PI };
export const DOG_HOME: PetHome = { x: 0.3, z: 0.45, heading: 0 };
export const FRAME_S = 1 / 60;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export interface PetWorld {
  readonly clock: FakeClock;
  readonly pet: Pet;
  motion: PetMotion;
  twin: PetTwin | null;
  dog: PetDog | null;
  heading: number;
  asked: number | null;
  running: boolean;
  readonly calls: Array<number | null>;
  readonly activity: PetActivity[];
  /** Moves the clock and both directors by `s` seconds, frame by frame. */
  run(s: number): void;
}

export const twinView = (over: Partial<PetTwin> = {}): PetTwin => ({
  home: TWIN_HOME,
  shows: "model",
  rig: true,
  petting_s: null,
  arriving: false,
  phase: "home",
  ...over,
});

export function dogView(home: PetHome = DOG_HOME): PetDog {
  return {
    home,
    phase: "home",
    headPoint(out: Vec3): Vec3 {
      out.x = home.x;
      out.y = 0.558;
      out.z = home.z + 0.217;
      return out;
    },
  };
}

export function petWorld(
  over: {
    twin?: Partial<PetTwin>;
    config?: Partial<PetConfig>;
    extra?: Partial<Parameters<typeof createPet>[0]>;
  } = {},
): PetWorld {
  const clock = new FakeClock();
  const w = {
    clock,
    motion: { animate: true, paused: false, level: 0, live: true } as PetMotion,
    twin: twinView(over.twin) as PetTwin | null,
    dog: dogView() as PetDog | null,
    heading: TWIN_HOME.heading,
    asked: null as number | null,
    running: false,
    calls: [] as Array<number | null>,
    activity: [] as PetActivity[],
  } as PetWorld;
  const pet = createPet({
    config: over.config,
    clock,
    motion: () => w.motion,
    twin: () => w.twin,
    dog: () => w.dog,
    chase: {
      faceTwin(h) {
        w.calls.push(h);
        w.asked = h;
      },
      twinHeading: () => w.heading,
      running: () => w.running,
    },
    signal: (a) => w.activity.push(a),
    ...over.extra,
  });
  Object.assign(w, {
    pet,
    run(s: number) {
      const n = Math.round(s / FRAME_S);
      for (let i = 0; i < n; i += 1) {
        clock.advance(FRAME_S * 1000, FRAME_S * 1000);
        pet.frame(FRAME_S);
        const want = w.asked ?? TWIN_HOME.heading;
        if (!w.motion.animate || w.motion.level !== 0) w.heading = TWIN_HOME.heading;
        else if (!w.running && !w.motion.paused) {
          const d = wrap(want - w.heading);
          const step = Math.PI * FRAME_S;
          w.heading = Math.abs(d) <= step ? want : w.heading + Math.sign(d) * step;
        }
      }
    },
  });
  return w;
}
