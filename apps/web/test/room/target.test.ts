// T003 (spec 008; FR-007, FR-012, FR-013, SC-001; plan.md R-06): src/room/walk/target.ts, the targeting reducer, by
// table. Each row is a sequence of events and the target expected after every step: a name from each input sets the
// target; the latest input wins; a null clears only the target its own input set (a pointer leaving the stage leaves a
// target keyboard focus set); `select` clears the target and consumes its ID; a name of the consumed ID is ignored
// until a name of another ID, or of null, from any input; `reset` clears all. The reducer is pure: no DOM, no three,
// no request, no storage, and no clock, so the room's targeting sends nothing (FR-013). Every ID is a synthetic fx-
// one.
import { describe, expect, it } from "vitest";

import { NO_TARGET, reduceTarget } from "../../src/room/walk/target";
import type { TargetEvent, TargetInput, TargetState } from "../../src/room/walk/target";

const name = (input: TargetInput, id: string | null): TargetEvent => ({ kind: "name", input, id });
const select = (id: string): TargetEvent => ({ kind: "select", id });
const reset: TargetEvent = { kind: "reset" };

/** A sequence and the target after each of its steps. */
type Row = readonly [what: string, steps: readonly (readonly [TargetEvent, string | null])[]];

const ROWS: readonly Row[] = [
  [
    "a hover names its selectable, and a move onto nothing clears it",
    [
      [name("pointer", "fx-bike"), "fx-bike"],
      [name("pointer", null), null],
    ],
  ],
  [
    "a press names its selectable until it ends",
    [
      [name("press", "fx-laptop"), "fx-laptop"],
      [name("press", null), null],
    ],
  ],
  [
    "list focus names its button's selectable, and the next button's when it moves on",
    [
      [name("focus", "fx-board"), "fx-board"],
      [name("focus", null), null],
      [name("focus", "fx-bike"), "fx-bike"],
    ],
  ],
  [
    "reach names what the figure faces",
    [
      [name("reach", "fx-board"), "fx-board"],
      [name("reach", null), null],
    ],
  ],
  [
    "the latest input wins, whichever it is",
    [
      [name("pointer", "fx-laptop"), "fx-laptop"],
      [name("focus", "fx-board"), "fx-board"],
      [name("pointer", "fx-laptop"), "fx-laptop"],
      [name("reach", "fx-bike"), "fx-bike"],
      [name("press", "fx-board"), "fx-board"],
    ],
  ],
  [
    "a pointer leaving the stage leaves a target keyboard focus set",
    [
      [name("pointer", "fx-laptop"), "fx-laptop"],
      [name("focus", "fx-board"), "fx-board"],
      [name("pointer", null), "fx-board"],
      [name("focus", null), null],
    ],
  ],
  [
    "focus leaving the list leaves a target a hover set",
    [
      [name("focus", "fx-board"), "fx-board"],
      [name("pointer", "fx-laptop"), "fx-laptop"],
      [name("focus", null), "fx-laptop"],
      [name("pointer", null), null],
    ],
  ],
  [
    "a second input naming the same selectable takes it over, so the first input's null leaves it",
    [
      [name("pointer", "fx-bike"), "fx-bike"],
      [name("focus", "fx-bike"), "fx-bike"],
      [name("pointer", null), "fx-bike"],
      [name("focus", null), null],
    ],
  ],
  [
    "a selection clears the target, and the selected piece isn't targeted again while the pointer rests on it",
    [
      [name("pointer", "fx-bike"), "fx-bike"],
      [name("press", "fx-bike"), "fx-bike"],
      [select("fx-bike"), null],
      [name("pointer", "fx-bike"), null],
      [name("pointer", "fx-bike"), null],
      [name("pointer", null), null],
      [name("pointer", "fx-bike"), "fx-bike"],
    ],
  ],
  [
    "a name of another selectable clears what the selection consumed",
    [
      [name("focus", "fx-board"), "fx-board"],
      [select("fx-board"), null],
      [name("focus", "fx-board"), null],
      [name("pointer", "fx-laptop"), "fx-laptop"],
      [name("focus", "fx-board"), "fx-board"],
    ],
  ],
  [
    "a null from any input clears what the selection consumed, and clears no target it didn't set",
    [
      [name("pointer", "fx-bike"), "fx-bike"],
      [select("fx-bike"), null],
      [name("focus", null), null],
      [name("pointer", "fx-bike"), "fx-bike"],
    ],
  ],
  [
    "a selection with no target before it consumes its ID all the same (the list's button pressed by a mouse)",
    [
      [select("fx-board"), null],
      [name("focus", "fx-board"), null],
      [name("focus", null), null],
      [name("focus", "fx-board"), "fx-board"],
    ],
  ],
  [
    "a selection of another piece clears the target and consumes the selected piece alone",
    [
      [name("focus", "fx-board"), "fx-board"],
      [select("fx-bike"), null],
      [name("focus", "fx-board"), "fx-board"],
      [name("pointer", "fx-bike"), "fx-bike"],
    ],
  ],
  [
    "reset clears the target and what a selection consumed (the hand-off; the fall to 2D)",
    [
      [name("pointer", "fx-bike"), "fx-bike"],
      [reset, null],
      [name("focus", "fx-board"), "fx-board"],
      [select("fx-board"), null],
      [reset, null],
      [name("focus", "fx-board"), "fx-board"],
    ],
  ],
  [
    "a null from an input with no target does nothing",
    [
      [name("pointer", null), null],
      [name("press", null), null],
      [name("focus", null), null],
      [name("reach", null), null],
    ],
  ],
];

describe("the targeting reducer (R-06)", () => {
  it.each(ROWS.map((row) => [row[0], row] as const))("%s", (_, [, steps]) => {
    let state: TargetState = NO_TARGET;
    steps.forEach(([event, expected], i) => {
      state = reduceTarget(state, event);
      expect(state.target, `step ${i + 1}: ${JSON.stringify(event)}`).toBe(expected);
    });
  });

  it("starts with no target, no input, and nothing consumed", () => {
    expect(NO_TARGET).toEqual({ target: null, input: null, consumed: null });
  });

  it("keeps the input that set the target, and the ID a selection consumed", () => {
    let state = reduceTarget(NO_TARGET, name("pointer", "fx-bike"));
    expect(state).toEqual({ target: "fx-bike", input: "pointer", consumed: null });
    state = reduceTarget(state, name("focus", "fx-bike"));
    expect(state).toEqual({ target: "fx-bike", input: "focus", consumed: null });
    state = reduceTarget(state, select("fx-bike"));
    expect(state).toEqual({ target: null, input: null, consumed: "fx-bike" });
    state = reduceTarget(state, name("pointer", "fx-bike"));
    expect(state).toEqual({ target: null, input: null, consumed: "fx-bike" });
    state = reduceTarget(state, name("press", null));
    expect(state).toEqual({ target: null, input: null, consumed: null });
    expect(reduceTarget(state, reset)).toEqual(NO_TARGET);
  });

  it("is pure: the state it's given is never changed, and the same events give the same states", () => {
    const events = ROWS.flatMap(([, steps]) => steps.map(([event]) => event));
    const run = (): TargetState[] => {
      const states: TargetState[] = [];
      let state: TargetState = NO_TARGET;
      for (const event of events) {
        const before = JSON.stringify(state);
        const next = reduceTarget(state, event);
        expect(JSON.stringify(state)).toBe(before);
        states.push(next);
        state = next;
      }
      return states;
    };
    expect(run()).toEqual(run());
    expect(Object.isFrozen(NO_TARGET)).toBe(true);
  });

  it("holds at most one target at any step of every row, the one the latest input named or none (SC-001)", () => {
    for (const [what, steps] of ROWS) {
      let state: TargetState = NO_TARGET;
      for (const [event] of steps) {
        state = reduceTarget(state, event);
        expect(typeof state.target === "string" || state.target === null, what).toBe(true);
        if (state.target !== null) expect(state.input, what).not.toBeNull();
      }
    }
  });

  it("imports nothing that reaches a document, a renderer, the network, or storage", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../../src/room/walk/target.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]);
    expect(imports).toEqual([]);
    expect(source).not.toMatch(/\b(document|window|fetch|localStorage|sessionStorage|indexedDB|sendBeacon)\b/);
  });
});
