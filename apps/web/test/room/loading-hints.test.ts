// T020 (spec 012; FR-030; SC-005; plan.md PD-12; contracts/loading-progress.md §6): the hints' rotation, a small state
// machine on the room's clock, in Node with a stub clock. It advances every HINT_MS (6 s) while running; never while
// the pointer is over the hint area, after "Pause hints", while the page is hidden, or once focus has entered the hint
// controls from outside them (the WAI-ARIA carousel pattern: "It does not resume unless the user activates the rotation
// control"); "Play hints" leaves both pause and stop; the rotation control's words follow its state, with no pressed
// state; "Previous hint" and "Next hint" step in every state, wrapping at both ends; and the timer restarts its 6
// seconds at each change of hint.
import { describe, expect, it } from "vitest";

import { HINT_MS, createRotation } from "../../src/room/loading/hints";
import type { Rotation } from "../../src/room/loading/hints";
import { FakeClock } from "../helpers/room";

function rotation(count = 4): { r: Rotation; clock: FakeClock; shown: number[] } {
  const clock = new FakeClock();
  const shown: number[] = [];
  const r = createRotation({ count, clock, onShow: (i) => shown.push(i) });
  return { r, clock, shown };
}

describe("the rotation (contract §6)", () => {
  it("starts running at the first hint, and advances every 6 seconds", () => {
    expect(HINT_MS).toBe(6000);
    const { r, clock, shown } = rotation();
    expect([r.index, r.state]).toEqual([0, "running"]);
    clock.advance(HINT_MS - 1);
    expect(r.index).toBe(0);
    clock.advance(1);
    expect(r.index).toBe(1);
    clock.advance(HINT_MS * 3);
    expect(r.index).toBe(0);
    expect(shown).toEqual([1, 2, 3, 0]);
  });

  it("doesn't advance while the pointer is over the hint area, and goes on when it leaves", () => {
    const { r, clock } = rotation();
    r.pointer(true);
    expect(r.state).toBe("hovered");
    clock.advance(HINT_MS * 3);
    expect(r.index).toBe(0);
    r.pointer(false);
    expect(r.state).toBe("running");
    clock.advance(HINT_MS);
    expect(r.index).toBe(1);
  });

  it("pauses on Pause hints and runs again on Play hints", () => {
    const { r, clock } = rotation();
    r.toggle();
    expect(r.state).toBe("paused");
    clock.advance(HINT_MS * 3);
    expect(r.index).toBe(0);
    r.pointer(true);
    r.pointer(false);
    expect(r.state).toBe("paused");
    r.toggle();
    expect(r.state).toBe("running");
    clock.advance(HINT_MS);
    expect(r.index).toBe(1);
  });

  it("stops once focus enters the controls from outside them, until Play hints; moving among them after doesn't stop it again", () => {
    const { r, clock } = rotation();
    r.focusEntered();
    expect(r.state).toBe("stopped");
    clock.advance(HINT_MS * 3);
    expect(r.index).toBe(0);
    r.pointer(true);
    r.pointer(false);
    expect(r.state).toBe("stopped");
    r.toggle();
    expect(r.state).toBe("running");
    // Moving focus between the controls is not entering them from outside: the view doesn't report it.
    clock.advance(HINT_MS);
    expect(r.index).toBe(1);
  });

  it("doesn't advance while the page is hidden, and goes back to the state it left when it shows", () => {
    const { r, clock } = rotation();
    r.visibility(false);
    expect(r.state).toBe("hidden");
    clock.advance(HINT_MS * 3);
    expect(r.index).toBe(0);
    r.visibility(true);
    expect(r.state).toBe("running");
    clock.advance(HINT_MS);
    expect(r.index).toBe(1);
    r.toggle();
    r.visibility(false);
    r.visibility(true);
    expect(r.state).toBe("paused");
  });

  it("words its control Pause hints while running or hovered, and Play hints otherwise", () => {
    const { r } = rotation();
    expect(r.control).toBe("pause");
    r.pointer(true);
    expect(r.control).toBe("pause");
    r.pointer(false);
    r.toggle();
    expect(r.control).toBe("play");
    r.toggle();
    r.focusEntered();
    expect(r.control).toBe("play");
    r.toggle();
    r.visibility(false);
    expect(r.control).toBe("play");
  });

  it("steps with Previous hint and Next hint in every state, wrapping at both ends", () => {
    for (const into of ["running", "hovered", "paused", "stopped", "hidden"] as const) {
      const { r } = rotation(3);
      if (into === "hovered") r.pointer(true);
      if (into === "paused") r.toggle();
      if (into === "stopped") r.focusEntered();
      if (into === "hidden") r.visibility(false);
      expect(r.state).toBe(into);
      r.previous();
      expect(r.index, into).toBe(2);
      r.next();
      r.next();
      expect(r.index, into).toBe(1);
      r.next();
      r.next();
      expect(r.index, into).toBe(0);
      expect(r.state, into).toBe(into);
    }
  });

  it("restarts the timer's 6 seconds at each change of hint", () => {
    const { r, clock } = rotation();
    clock.advance(4000);
    r.next();
    expect(r.index).toBe(1);
    clock.advance(HINT_MS - 1);
    expect(r.index).toBe(1);
    clock.advance(1);
    expect(r.index).toBe(2);
  });

  it("does nothing with one hint or none, and leaves no timer behind once stopped for good", () => {
    const one = rotation(1);
    one.clock.advance(HINT_MS * 2);
    one.r.next();
    one.r.previous();
    expect(one.r.index).toBe(0);
    expect(one.shown).toEqual([]);
    const { r, clock } = rotation();
    r.dispose();
    clock.advance(HINT_MS * 2);
    expect(r.index).toBe(0);
    expect(clock.pendingTimers).toBe(0);
  });
});
