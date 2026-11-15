// Spec 028 (T-B04): the dinosaur's scene's director's fixtures, shared by its tests: the leave block as the room ships
// it, the twin's home, the call's seconds, the director's inputs with every condition holding, a director whose call
// and left lines are recorded, and a runner of frames on the scripted clock.
import type { LeaveData } from "../../src/room/compose/bundle";
import { createDinoScene } from "../../src/room/scene/dino-scene";
import type { DinoInputs, DinoPhase, DinoScene } from "../../src/room/scene/dino-scene";

export const LEAVE: LeaveData = {
  takes: "bicycle-fixture",
  meet: [0.42, 0.45],
  under_bicycle: [0.74, 0.52],
  carry: [0.3, 0.26, 0.05],
  path: [
    [0.8, 0.75],
    [1.3, 0.9],
    [1.7, 0.9],
  ],
  dog_mps: 1.2,
  walk_mps: 1.0,
  take_s: 0.8,
};
export const HOME = { x: 0.66, z: 0.469, heading: Math.PI };
export const CALL_S = 3;
export const DT = 1 / 60;

export function inputs(over: Partial<DinoInputs> = {}): DinoInputs {
  return {
    chosen: "dinosaur",
    handedOff: true,
    modelShown: true,
    view3d: true,
    reduced: false,
    level: 0,
    twinCanWalk: true,
    dogShown: true,
    dogHasWalk: true,
    paused: false,
    ...over,
  };
}

export interface Told {
  readonly scene: DinoScene;
  readonly calls: number[];
  readonly left: string[];
}
export function made(o: { leave?: LeaveData; call?: number } = {}): Told {
  const calls: number[] = [];
  const left: string[] = [];
  let t = 0;
  const scene = createDinoScene({
    leave: o.leave ?? LEAVE,
    twin: HOME,
    callSeconds: () => o.call ?? CALL_S,
    call: () => calls.push(t),
    left: (who: string) => left.push(who),
  });
  const frame = scene.frame.bind(scene);
  Object.defineProperty(scene, "frame", {
    value: (dt: number, i: DinoInputs) => {
      frame(dt, i);
      t += dt;
    },
  });
  return { scene, calls, left };
}

/** Runs frames until the phase is `until` or `frames` have run; the phases seen, once each in order. */
export function runTo(
  s: DinoScene,
  until: DinoPhase | null,
  i: DinoInputs = inputs(),
  frames = 60 * 60,
): DinoPhase[] {
  const seen: DinoPhase[] = [s.phase];
  for (let k = 0; k < frames && s.phase !== until; k += 1) {
    s.frame(DT, i);
    if (seen.at(-1) !== s.phase) seen.push(s.phase);
  }
  return seen;
}

