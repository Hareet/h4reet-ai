// T005 (spec 026; FR-009; plan.md R-05; SC-004): the twin's `petting` state in spec 016's machine, src/room/scene/
// twin-states.ts, on the room's clock's milliseconds. `petting` comes after `fleeing` (spec 025) and `arriving`, before
// `answering`; `{ kind: "pet", on }` sets it; the machine's timers keep running under it, so an answer's speaking time
// left over plays after it. The clip map gains `petting: petting`, and `TWIN_CLIP_ROLES` gains `petting`.
import { describe, expect, it } from "vitest";

import { TWIN_CLIPS_DEFAULT, TWIN_CLIP_ROLES, TWIN_STATES, createTwinStates } from "../../src/room/scene/twin-states";
import type { TwinActivity } from "../../src/room/scene/twin-states";

const BLOCK = { rest_after_s: 20, speak_wpm: 150, speak_s: [3, 20] as [number, number] };
const S = 1000;
const PET_ON: TwinActivity = { kind: "pet", on: true };
const PET_OFF: TwinActivity = { kind: "pet", on: false };

describe("petting in the closed lists (FR-009)", () => {
  it("comes after fleeing and arriving, before answering", () => {
    expect([...TWIN_STATES]).toEqual(["fleeing", "arriving", "petting", "answering", "listening", "resting", "present"]);
  });

  it("has its own clip role, petting, last in the closed list, and the default map's petting: petting", () => {
    expect([...TWIN_CLIP_ROLES]).toEqual(["idle", "talking", "listening", "greeting", "desk-lean", "petting"]);
    expect(TWIN_CLIPS_DEFAULT.petting).toBe("petting");
  });
});

describe("the pet input (FR-009)", () => {
  it("turns petting on and off", () => {
    const t = createTwinStates(BLOCK);
    expect(t.tick(0)).toBe("present");
    t.signal(PET_ON, 100);
    expect(t.state).toBe("petting");
    expect(t.tick(2 * S)).toBe("petting");
    t.signal(PET_OFF, 3 * S);
    expect(t.state).toBe("present");
  });

  it("gives way to fleeing, and petting shows again when the run ends while it is still on", () => {
    const t = createTwinStates(BLOCK);
    t.signal(PET_ON, 0);
    t.signal({ kind: "flee", on: true }, 100);
    expect(t.tick(200)).toBe("fleeing");
    t.signal({ kind: "flee", on: false }, 300);
    expect(t.state).toBe("petting");
  });

  it("gives way to arriving while the greeting plays", () => {
    const t = createTwinStates(BLOCK);
    t.arrive(0, 2);
    t.signal(PET_ON, 100);
    expect(t.tick(500)).toBe("arriving");
    expect(t.tick(2 * S)).toBe("petting");
  });

  it("holds over answering and listening, which show again after it", () => {
    const t = createTwinStates(BLOCK);
    t.signal({ kind: "draft", holds: true }, 0);
    expect(t.tick(0)).toBe("listening");
    t.signal(PET_ON, 100);
    expect(t.tick(200)).toBe("petting");
    t.signal(PET_OFF, 1 * S);
    expect(t.state).toBe("listening");
  });
});

describe("the timers keep running under petting (FR-009; User Story 1, scenario 4)", () => {
  it("plays an answer that came during the petting after it, for what is left of its speaking time", () => {
    const t = createTwinStates(BLOCK);
    t.signal(PET_ON, 0);
    // 25 words at 150 a minute: 10 s of speaking time, from 1 s.
    t.signal({ kind: "answer", words: 25 }, 1 * S);
    expect(t.tick(3 * S)).toBe("petting");
    t.signal(PET_OFF, 4 * S);
    expect(t.tick(4 * S)).toBe("answering");
    expect(t.tick(11 * S - 50)).toBe("answering");
    expect(t.tick(11 * S + 50)).toBe("present");
  });

  it("plays nothing after it where the answer's time ran out during it", () => {
    const t = createTwinStates(BLOCK);
    t.signal(PET_ON, 0);
    t.signal({ kind: "answer", words: 1 }, 100);
    t.signal(PET_OFF, 4 * S);
    expect(t.state).toBe("present");
  });

  it("moves no busy moment: the quiet counts on under it, so resting follows where 20 s have passed", () => {
    const t = createTwinStates(BLOCK);
    expect(t.tick(0)).toBe("present");
    t.signal(PET_ON, 18 * S);
    expect(t.tick(21 * S)).toBe("petting");
    t.signal(PET_OFF, 21 * S);
    expect(t.state).toBe("resting");
  });

  it("a selection during the petting still counts as busy, as it does outside it", () => {
    const t = createTwinStates(BLOCK);
    t.signal(PET_ON, 0);
    t.signal({ kind: "selected" }, 15 * S);
    t.signal(PET_OFF, 21 * S);
    expect(t.tick(21 * S)).toBe("present");
    expect(t.tick(35 * S)).toBe("resting");
  });
});
