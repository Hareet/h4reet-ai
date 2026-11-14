// T003 (spec 025; FR-011, FR-015, User Story 4; plan.md R-04): the twin's `fleeing` state as the build and the room read
// it. The build's readers of the twin block loop over TWIN_STATES, so the emitted map gains `fleeing: "idle"` and the
// played roles don't change (the idle is played already); `fleeing` is the run's, set only through `signal`.
import { describe, expect, it } from "vitest";

import { twinBlockOf } from "../../build/room/emit";
import { playedRoles } from "../../build/room/reach";
import type { Scene } from "../../build/room/schema";
import { TWIN_CLIP_ROLES, createTwinStates } from "../../src/room/scene/twin-states";
import type { TwinClipRole } from "../../src/room/scene/twin-states";

const BLOCK = { rest_after_s: 20, speak_wpm: 150, speak_s: [3, 20] as [number, number] };
const S = 1000;

describe("fleeing in the build's readers (FR-011)", () => {
  it("the emitted map carries fleeing: idle, by default, with no figures.twin block", () => {
    expect(twinBlockOf(null, 1024).clips.fleeing).toBe("idle");
  });

  it("the played roles don't change: fleeing's idle is played already", () => {
    const all = new Set<TwinClipRole>(TWIN_CLIP_ROLES);
    const scene = { figures: { twin: { clips: { resting: "idle" }, lean: null } } } as unknown as Scene;
    expect(playedRoles(scene, all)).toEqual(["idle", "talking", "listening", "greeting"]);
    expect(playedRoles(null, new Set<TwinClipRole>(["idle", "talking"]))).toEqual(["idle", "talking"]);
  });
});

describe("the conversation under the run (User Story 4)", () => {
  it("records an answer during the run and plays it after, for what is left of its time (scenario 2)", () => {
    const t = createTwinStates(BLOCK);
    t.signal({ kind: "flee", on: true }, 0);
    t.signal({ kind: "turn", out: true }, 500);
    t.signal({ kind: "turn", out: false }, 1 * S);
    t.signal({ kind: "answer", words: 25 }, 1 * S);
    expect(t.tick(3 * S)).toBe("fleeing");
    t.signal({ kind: "flee", on: false }, 6 * S);
    expect(t.tick(6 * S)).toBe("answering");
    expect(t.tick(11 * S - 50)).toBe("answering");
    expect(t.tick(11 * S + 50)).toBe("present");
  });

  it("the run's end with nothing left: the state the timers give, at once", () => {
    const t = createTwinStates(BLOCK);
    t.signal({ kind: "draft", holds: true }, 0);
    t.signal({ kind: "flee", on: true }, 100);
    t.signal({ kind: "flee", on: false }, 200);
    expect(t.tick(200)).toBe("listening");
  });

  it("a flee off with no run on changes nothing", () => {
    const t = createTwinStates(BLOCK);
    t.signal({ kind: "flee", on: false }, 0);
    expect(t.tick(0)).toBe("present");
  });
});
