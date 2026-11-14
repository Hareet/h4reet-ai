// T032 (spec 016; FR-019 to FR-022, FR-024; plan.md R-08; contracts/twin-states.md §2; SC-004): the twin's state machine,
// src/room/scene/twin-states.ts, on the room's clock's milliseconds, which the test gives it.
// - FR-021's order over a table of activities: arriving, answering, listening, resting, present, the first that holds.
// - arriving once a visit; `arrive` again does nothing; the greeting's end ends it at once.
// - The speaking time: 60 / 150 s a word, clamped to 3 s and 20 s, within 50 ms; a new answer restarts it.
// - resting after 20 s of quiet, within 50 ms; left on a draft, a turn, a selection, or an answer.
import { describe, expect, it } from "vitest";

import { TWIN_CLIPS_DEFAULT, TWIN_CLIP_ROLES, TWIN_STATES, createTwinStates } from "../../src/room/scene/twin-states";
import type { TwinState } from "../../src/room/scene/twin-states";

const BLOCK = { rest_after_s: 20, speak_wpm: 150, speak_s: [3, 20] as [number, number] };
const S = 1000;

describe("the twin's states (FR-021; SC-004)", () => {
  it("starts present, and greets once from arrive for the greeting's length", () => {
    const t = createTwinStates(BLOCK);
    expect(t.tick(0)).toBe("present");
    t.arrive(100, 2.47);
    expect(t.tick(100)).toBe("arriving");
    expect(t.tick(100 + 2.47 * S - 1)).toBe("arriving");
    expect(t.tick(100 + 2.47 * S)).toBe("present");
    // Once a visit: a second arrive does nothing.
    t.arrive(5 * S, 2.47);
    expect(t.tick(5 * S)).toBe("present");
  });

  it("ends arriving at once when the greeting's clip has finished, whatever the clock says", () => {
    const t = createTwinStates(BLOCK);
    t.arrive(0, 2.47);
    t.arrived(1000);
    expect(t.tick(1000)).toBe("present");
  });

  it.each([
    [1, 3],
    [10, 4],
    [25, 10],
    [80, 20],
  ])("talks for %i words' speaking time, at 150 a minute within 3 s and 20 s: %i s", (words, seconds) => {
    const t = createTwinStates(BLOCK);
    t.signal({ kind: "answer", words }, 0);
    expect(t.tick(seconds * S - 50)).toBe("answering");
    expect(t.tick(seconds * S + 50)).not.toBe("answering");
  });

  it("starts the speaking time again on a new answer", () => {
    const t = createTwinStates(BLOCK);
    t.signal({ kind: "answer", words: 10 }, 0);
    t.signal({ kind: "answer", words: 10 }, 3 * S);
    expect(t.tick(6 * S)).toBe("answering");
    expect(t.tick(7 * S + 50)).toBe("present");
  });

  it("listens while the text box holds unsent text, or a turn is out", () => {
    const t = createTwinStates(BLOCK);
    t.signal({ kind: "draft", holds: true }, 0);
    expect(t.tick(10)).toBe("listening");
    t.signal({ kind: "draft", holds: false }, 20);
    t.signal({ kind: "turn", out: true }, 20);
    expect(t.tick(30)).toBe("listening");
    t.signal({ kind: "turn", out: false }, 40);
    expect(t.tick(50)).toBe("present");
  });

  it("orders the states as FR-021 does over a table of activities", () => {
    const t = createTwinStates(BLOCK);
    const steps: [number, Parameters<typeof t.signal>[0] | "arrive" | null, TwinState][] = [
      [0, "arrive", "arriving"],
      [500, { kind: "draft", holds: true }, "arriving"],
      [2600, null, "listening"],
      [3000, { kind: "draft", holds: false }, "present"],
      [3100, { kind: "turn", out: true }, "listening"],
      [4000, { kind: "turn", out: false }, "present"],
      [4000, { kind: "answer", words: 5 }, "answering"],
      [5000, { kind: "draft", holds: true }, "answering"],
      [7100, null, "listening"],
      [7200, { kind: "draft", holds: false }, "present"],
      [27_250, null, "resting"],
      [30_000, { kind: "selected" }, "present"],
    ];
    for (const [at, activity, state] of steps) {
      if (activity === "arrive") t.arrive(at, 2.47);
      else if (activity) t.signal(activity, at);
      expect(t.tick(at), `at ${at}`).toBe(state);
    }
  });

  it("rests after 20 s with none of the others holding, within 50 ms, and leaves on a draft, a turn, a selection, or an answer", () => {
    for (const leave of [
      { kind: "draft", holds: true },
      { kind: "turn", out: true },
      { kind: "selected" },
      { kind: "answer", words: 3 },
    ] as const) {
      const t = createTwinStates(BLOCK);
      t.signal({ kind: "turn", out: true }, 0);
      t.signal({ kind: "turn", out: false }, 1000);
      expect(t.tick(1000 + 20 * S - 50)).toBe("present");
      expect(t.tick(1000 + 20 * S + 50)).toBe("resting");
      t.signal(leave, 30 * S);
      expect(t.tick(30 * S)).not.toBe("resting");
    }
  });

  it("starts the quiet after the greeting and after the speaking time, never during them", () => {
    const t = createTwinStates(BLOCK);
    t.arrive(0, 2.47);
    expect(t.tick(2.47 * S + 20 * S - 50)).toBe("present");
    expect(t.tick(2.47 * S + 20 * S + 50)).toBe("resting");
    const u = createTwinStates(BLOCK);
    u.signal({ kind: "answer", words: 10 }, 0);
    expect(u.tick(4 * S + 20 * S - 50)).toBe("present");
    expect(u.tick(4 * S + 20 * S + 50)).toBe("resting");
  });

  it("keeps resting through a cleared draft or a turn's end, which aren't new activity", () => {
    const t = createTwinStates(BLOCK);
    expect(t.tick(20 * S + 50)).toBe("resting");
    t.signal({ kind: "draft", holds: false }, 21 * S);
    t.signal({ kind: "turn", out: false }, 21 * S);
    expect(t.tick(21 * S)).toBe("resting");
  });

  it("takes the block's figures as data: the resting time and the pace (SC-014)", () => {
    const t = createTwinStates({ rest_after_s: 10, speak_wpm: 120, speak_s: [3, 20] });
    t.signal({ kind: "answer", words: 10 }, 0);
    expect(t.tick(5 * S - 50)).toBe("answering");
    expect(t.tick(5 * S + 50)).toBe("present");
    expect(t.tick(15 * S + 50)).toBe("resting");
    expect(t.state).toBe("resting");
  });
});

// T003 (spec 025; FR-011, FR-012; plan.md R-04): `fleeing`, first in the order, set by `{ kind: "flee", on }`, its clip
// the idle; the machine's timers keep running under it, so what holds after the run is what they say then.
describe("fleeing, the run's state (spec 025, FR-011)", () => {
  it("is first in the order and the map's default plays the idle", () => {
    expect(TWIN_STATES[0]).toBe("fleeing");
    expect(TWIN_CLIPS_DEFAULT.fleeing).toBe("idle");
    expect([...TWIN_CLIP_ROLES]).toEqual(["idle", "talking", "listening", "greeting", "desk-lean"]);
  });

  it("outranks arriving, answering, listening, and resting while it's on, and ends with its signal", () => {
    const t = createTwinStates(BLOCK);
    t.arrive(0, 2.47);
    t.signal({ kind: "flee", on: true }, 100);
    expect(t.tick(100)).toBe("fleeing");
    t.signal({ kind: "answer", words: 10 }, 200);
    t.signal({ kind: "draft", holds: true }, 300);
    expect(t.tick(300)).toBe("fleeing");
    t.signal({ kind: "flee", on: false }, 1000);
    expect(t.tick(1000)).toBe("arriving");
  });

  it("keeps the timers running: an answer during the run talks for what is left of it after", () => {
    const t = createTwinStates(BLOCK);
    t.signal({ kind: "flee", on: true }, 0);
    t.signal({ kind: "answer", words: 10 }, 0);
    expect(t.tick(2 * S)).toBe("fleeing");
    t.signal({ kind: "flee", on: false }, 2 * S);
    expect(t.tick(2 * S)).toBe("answering");
    expect(t.tick(4 * S + 50)).toBe("present");
  });

  it("rests after the run where the quiet's time passed under it", () => {
    const t = createTwinStates(BLOCK);
    t.signal({ kind: "flee", on: true }, 0);
    expect(t.tick(25 * S)).toBe("fleeing");
    t.signal({ kind: "flee", on: false }, 25 * S);
    expect(t.tick(25 * S)).toBe("resting");
  });
});
