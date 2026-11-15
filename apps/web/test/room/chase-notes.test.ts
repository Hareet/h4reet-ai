// T009 (spec 025; FR-025, SC-006; plan.md R-07): the run told in words. The director says the run's start and its end
// once each, by the figures that move; nothing where no figure moves or under reduced motion. The stage reports them as
// a `chase` figure signal, and the room says the UI word in its polite live region; the six keys are UI words with no
// slots, in the closed list and in the shipped words.
import { describe, expect, it } from "vitest";

import type { FloorRect, WalkableFloor } from "../../src/room/compose/floor";
import { createChase } from "../../src/room/scene/chase";
import type { ChaseInput, ChaseMotion, ChaseNote } from "../../src/room/scene/chase";
import { CHASE_DEFAULTS } from "../../src/room/scene/chase-steer";
import type { FigureSignal } from "../../src/room/stage";
import { UI_KEYS, uiWord } from "../../src/room/ui-keys";
import { announcer, flush, intoRoom, repositoryBundle, start, textOf } from "../helpers/room";
import type { Visit } from "../helpers/room";

const DT = 1 / 60;
const OPEN: FloorRect = { x0: -2, x1: 2, z0: -2, z1: 2 };
const floor: WalkableFloor = {
  radius: 0.12,
  feetY: 0,
  height: 1.7,
  shell: OPEN,
  bounds: OPEN,
  obstacles: [],
  start: { x: 0, z: 1.8 },
};
const MOVE: ChaseMotion = { animate: true, paused: false, level: 0 };
const HOMES = { twin: { x: 0, z: -1, heading: 0 }, dog: { x: 0.5, z: -1, heading: 0 } };
const near: ChaseInput = { present: true, x: 0.2, z: -0.6 };
const gone: ChaseInput = { present: false, x: 0, z: 1.8 };

const WORDS: Record<string, string> = {
  "chase.started_both": "The twin and the dog are running from the dinosaur.",
  "chase.started_twin": "The twin is running from the dinosaur.",
  "chase.started_dog": "The dog is running from the dinosaur.",
  "chase.ended_both": "The twin and the dog are back in their places.",
  "chase.ended_twin": "The twin is back in its place.",
  "chase.ended_dog": "The dog is back in its place.",
};

function runAndReturn(notes: ChaseNote[], figures = HOMES as Parameters<typeof createChase>[0]["figures"]): void {
  const c = createChase({ floor, config: CHASE_DEFAULTS, walkMps: 1, figures, note: (n) => notes.push(n) });
  for (let i = 0; i < 60; i += 1) c.frame(near, DT, MOVE);
  for (let i = 0; i < 1800; i += 1) c.frame(gone, DT, MOVE);
}

describe("the director's notes (FR-025, SC-006)", () => {
  it("says the start and the end once each, by both figures", () => {
    const notes: ChaseNote[] = [];
    runAndReturn(notes);
    expect(notes).toEqual([
      { state: "started", who: "both" },
      { state: "ended", who: "both" },
    ]);
  });

  it("names the one figure that moves", () => {
    const twin: ChaseNote[] = [];
    runAndReturn(twin, { twin: HOMES.twin, dog: null });
    expect(twin).toEqual([
      { state: "started", who: "twin" },
      { state: "ended", who: "twin" },
    ]);
    const dog: ChaseNote[] = [];
    runAndReturn(dog, { twin: null, dog: HOMES.dog });
    expect(dog.map((n) => n.who)).toEqual(["dog", "dog"]);
  });

  it("says nothing while the pursuer stands beyond flee_m and no figure moves", () => {
    const notes: ChaseNote[] = [];
    const c = createChase({ floor, config: CHASE_DEFAULTS, walkMps: 1, figures: HOMES, note: (n) => notes.push(n) });
    for (let i = 0; i < 120; i += 1) c.frame({ present: true, x: 0, z: 1.5 }, DT, MOVE);
    for (let i = 0; i < 300; i += 1) c.frame(gone, DT, MOVE);
    expect(notes).toEqual([]);
  });

  it("says nothing under reduced motion", () => {
    const notes: ChaseNote[] = [];
    const c = createChase({ floor, config: CHASE_DEFAULTS, walkMps: 1, figures: HOMES, note: (n) => notes.push(n) });
    const still = { animate: false, paused: false, level: 0 };
    for (let i = 0; i < 60; i += 1) c.frame(near, DT, still);
    for (let i = 0; i < 300; i += 1) c.frame(gone, DT, still);
    expect(notes).toEqual([]);
  });

  it("says a second run's start and end again, once each", () => {
    const notes: ChaseNote[] = [];
    const c = createChase({ floor, config: CHASE_DEFAULTS, walkMps: 1, figures: HOMES, note: (n) => notes.push(n) });
    for (let round = 0; round < 2; round += 1) {
      for (let i = 0; i < 60; i += 1) c.frame(near, DT, MOVE);
      for (let i = 0; i < 1800; i += 1) c.frame(gone, DT, MOVE);
    }
    expect(notes.map((n) => n.state)).toEqual(["started", "ended", "started", "ended"]);
  });
});

describe("the six UI words (FR-025)", () => {
  it("are keys of the closed list, with no slots", () => {
    for (const key of Object.keys(WORDS)) expect((UI_KEYS as Record<string, readonly string[]>)[key], key).toEqual([]);
  });

  it("are the shipped words", () => {
    const ui = repositoryBundle().index.ui;
    for (const [key, word] of Object.entries(WORDS)) expect(uiWord(ui, key as keyof typeof UI_KEYS), key).toBe(word);
  });
});

function signal(v: Visit, s: FigureSignal): void {
  const options = v.scene.created.at(-1);
  if (!options) throw new Error("no 3D stage was made");
  options.onFigure?.(s);
}

describe("the room's live region (R-07)", () => {
  for (const who of ["both", "twin", "dog"] as const)
    it(`says chase.started_${who} and chase.ended_${who}`, async () => {
      const v = start({ webgl: true });
      await intoRoom(v);
      signal(v, { kind: "chase", state: "started", who });
      await flush();
      expect(textOf(announcer(v.doc))).toBe(WORDS[`chase.started_${who}`]);
      signal(v, { kind: "chase", state: "ended", who });
      await flush();
      expect(textOf(announcer(v.doc))).toBe(WORDS[`chase.ended_${who}`]);
    });
});
