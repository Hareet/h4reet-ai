// T045 (spec 008; FR-003, FR-010, FR-020 to FR-022, FR-051, FR-052, FR-054, FR-059; SC-005, SC-014): the walking
// control in the room, jsdom with test/helpers/room.ts's stand-in 3D stage, which records the walking interface's calls.
// The control is offered in 3D only after the hand-off's offer, inert and hidden before it, and absent in 2D; its words
// are walk.enter and walk.leave. Entering gives the walking view focus, with its name, role, and instructions;
// walk_started goes once a visit and nothing else is sent; Escape, through the stage's walkEnded, leaves and gives the
// control focus again, as the control does; and "2D view" ends the walk and takes the control away. (The keys' own
// cases are test/room/input.test.ts's and test/room/stage-walk.test.ts's.)
import { describe, expect, it } from "vitest";

import { button, enter, flush, intoRoom, roomIndex, start } from "../helpers/room";
import type { Visit } from "../helpers/room";

const WORDS = {
  enter: roomIndex().ui["walk.enter"] ?? "",
  leave: roomIndex().ui["walk.leave"] ?? "",
  region: roomIndex().ui["walk.region"] ?? "",
};

const control = (v: Visit): HTMLButtonElement => {
  const el = v.doc.querySelector<HTMLButtonElement>("button.room-walk");
  if (!el) throw new Error("no walking control");
  return el;
};
const view = (v: Visit): HTMLElement => v.doc.querySelector<HTMLElement>(".room-stage-view") as HTMLElement;

describe("the walking control (spec 008, T045)", () => {
  it("is offered in 3D only after the offer, its words walk.enter, and is hidden and inert before it", async () => {
    expect(WORDS.enter).toBe("Walk around");
    const v = start({ webgl: true });
    await enter(v);
    expect(control(v).hidden).toBe(true);
    expect(control(v).closest("[inert]") ?? (control(v).hasAttribute("inert") ? control(v) : null)).not.toBeNull();
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    await flush();
    expect(control(v).hidden).toBe(false);
    expect(control(v).hasAttribute("inert")).toBe(false);
    expect(control(v).textContent).toBe(WORDS.enter);
  });

  it("enters the walking view with focus on it, sends walk_started once a visit, and nothing else", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const events = v.events.length;
    control(v).click();
    expect(v.scene.walks.at(-1)).toEqual({ call: "enter", focus: view(v) });
    expect(v.doc.activeElement).toBe(view(v));
    expect([view(v).getAttribute("role"), view(v).getAttribute("aria-label")]).toEqual(["application", WORDS.region]);
    expect(view(v).getAttribute("tabindex")).toBe("0");
    expect(control(v).textContent).toBe(WORDS.leave);
    control(v).click();
    expect(v.scene.walks.at(-1)).toEqual({ call: "leave" });
    expect(v.doc.activeElement).toBe(control(v));
    expect(view(v).hasAttribute("role")).toBe(false);
    control(v).click();
    control(v).click();
    expect(v.events.slice(events)).toEqual([{ kind: "walk_started" }]);
  });

  it("leaves on Escape, through the stage's report, with focus back on the control", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    control(v).click();
    v.scene.endWalk("escape");
    expect(v.doc.activeElement).toBe(control(v));
    expect(control(v).textContent).toBe(WORDS.enter);
    expect(view(v).hasAttribute("tabindex")).toBe(false);
    // A failed step ends it the same way (FR-005).
    control(v).click();
    v.scene.endWalk("failed");
    expect(control(v).textContent).toBe(WORDS.enter);
  });

  it('ends with "2D view", which takes the control away, the conversation and the resume kept', async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    control(v).click();
    button(v.doc, "2D view").click();
    expect(control(v).hidden).toBe(true);
    expect(view(v).hasAttribute("role")).toBe(false);
    expect(v.room.visit.mode).toBe("2d");
  });

  it("isn't offered in 2D", async () => {
    const v = start({ webgl: false });
    await intoRoom(v);
    expect(control(v).hidden).toBe(true);
  });
});
