// T009 (spec 026; FR-001, FR-004, FR-011, FR-025; SC-003; plan.md R-01): the pet director's degraded modes, on the
// fakes. With a piece missing, failing, or loading, the twin's capsule or a rig without the bones, reduced motion, a
// pause, quality level 1 or more, 2D, below the floor, or a lost context, a `dog` selection starts nothing and nothing
// moves; reduced motion, quality level 1, 2D, or a lost figure beginning mid-petting cuts it at once (the reach cleared,
// `faceTwin(null)`); a pause holds it; another piece's selection leaves it be; nothing throws; and no request leaves.
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PetMotion, PetTwin } from "../../src/room/scene/pet";
import { FRAME_S, petWorld, TWIN_HOME } from "../helpers/pet-fakes";
import type { PetWorld } from "../helpers/pet-fakes";

const MOTION: PetMotion = { animate: true, paused: false, level: 0, live: true };

/** Selected and under way: the turn done, the reach at full weight. */
function petting(over: Partial<PetTwin> = {}): PetWorld {
  const w = petWorld({ twin: over });
  expect(w.pet.select("dog")).toBe(true);
  w.run(0.4 + 1);
  expect(w.pet.phase).toBe("petting");
  return w;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a selection that starts nothing (FR-001, FR-004; SC-003)", () => {
  const cases: Array<[string, (w: PetWorld) => void]> = [
    ["the dog figure null (its picture failing, loading, or absent)", (w) => (w.dog = null)],
    ["the twin's figure null", (w) => (w.twin = null)],
    ["the twin's capsule", (w) => (w.twin = { ...(w.twin as PetTwin), shows: "capsule" })],
    ["a rig without the reach's bones", (w) => (w.twin = { ...(w.twin as PetTwin), rig: false })],
    ["reduced motion", (w) => (w.motion = { ...MOTION, animate: false })],
    ["the room paused", (w) => (w.motion = { ...MOTION, paused: true })],
    ["quality level 1", (w) => (w.motion = { ...MOTION, level: 1 })],
    ["quality level 2", (w) => (w.motion = { ...MOTION, level: 2 })],
    ["2D, below the floor, or a lost context", (w) => (w.motion = { ...MOTION, live: false })],
  ];
  it.each(cases)("%s: no turn, no state, no reach, no exception", (_name, change) => {
    const w = petWorld();
    change(w);
    expect(() => w.pet.select("dog")).not.toThrow();
    expect(w.pet.phase).toBe("idle");
    expect(() => w.run(1)).not.toThrow();
    expect(w.calls).toEqual([]);
    expect(w.activity).toEqual([]);
    expect(w.pet.reach).toBeNull();
    expect(w.heading).toBe(TWIN_HOME.heading);
  });

  it("the stand-in man with the bones pets as the twin's model does", () => {
    const w = petWorld({ twin: { shows: "stand-in" } });
    expect(w.pet.select("dog")).toBe(true);
  });
});

describe("a petting cut at once mid-way (FR-011; SC-003)", () => {
  const cuts: Array<[string, (w: PetWorld) => void]> = [
    ["reduced motion", (w) => (w.motion = { ...MOTION, animate: false })],
    ["quality level 1", (w) => (w.motion = { ...MOTION, level: 1 })],
    ["2D or a lost context", (w) => (w.motion = { ...MOTION, live: false })],
    ["the dog's picture lost", (w) => (w.dog = null)],
    ["the twin's picture lost", (w) => (w.twin = null)],
    ["the twin's capsule", (w) => (w.twin = { ...(w.twin as PetTwin), shows: "capsule" })],
  ];
  it.each(cuts)("%s: the reach cleared, faceTwin(null), the state off, in the same frame", (_name, change) => {
    const w = petting();
    expect(w.pet.reach?.weight).toBe(1);
    change(w);
    expect(() => w.run(FRAME_S)).not.toThrow();
    expect(w.pet.reach).toBeNull();
    expect(w.calls.at(-1)).toBeNull();
    expect(w.activity.at(-1)).toEqual({ kind: "pet", on: false });
    expect(w.pet.phase).toBe("idle");
  });

  it("cuts during the turn too", () => {
    const w = petWorld();
    w.pet.select("dog");
    w.run(0.1);
    w.motion = { ...MOTION, animate: false };
    w.run(FRAME_S);
    expect(w.pet.phase).toBe("idle");
    expect(w.calls.at(-1)).toBeNull();
    expect(w.activity).toEqual([]);
  });
});

describe("a pause, and another piece's selection", () => {
  it("holds a petting where it is while paused, and goes on after", () => {
    const w = petWorld();
    w.pet.select("dog");
    w.run(0.4 + 0.25);
    const weight = w.pet.reach?.weight ?? -1;
    const target = { ...(w.pet.reach?.target ?? { x: 0, y: 0, z: 0 }) };
    expect(weight).toBeGreaterThan(0);
    expect(weight).toBeLessThan(1);
    w.motion = { ...MOTION, paused: true };
    w.run(5);
    expect(w.pet.phase).toBe("petting");
    expect(w.pet.reach?.weight).toBe(weight);
    expect(w.pet.reach?.target).toEqual(target);
    expect(w.calls).toHaveLength(1);
    w.motion = MOTION;
    w.run(0.5);
    expect(w.pet.reach?.weight).toBe(1);
  });

  it("leaves a petting be on another piece's selection", () => {
    const w = petting();
    for (const id of ["snowboard", "bicycle", "laptop", "chalkboard", "dog-sign"]) expect(w.pet.select(id)).toBe(false);
    expect(w.pet.phase).toBe("petting");
    expect(w.calls).toHaveLength(1);
  });
});

describe("nothing leaves the device (FR-025; SC-003)", () => {
  it("makes no request and no model call during a petting", () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("no request")));
    vi.stubGlobal("fetch", fetchSpy);
    // The stub comes off whether or not the test passes: the config unstubs envs, not globals.
    try {
      const w = petWorld();
      w.pet.select("dog");
      w.run(0.4 + 4 + 1);
      w.pet.select("dog");
      w.run(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
