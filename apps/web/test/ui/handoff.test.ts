// T035 (spec 002; FR-007–FR-009; contracts/room-scene.md §3; research.md R-13): the hand-off, on a fake clock. It lasts
// 4.5 s in 3D (never more than 5), 1 s under reduced motion, and three 1.5 s still frames in 2D; no control skips it,
// and keys and clicks during it change nothing but focus; its line goes to a polite live region; at its end focus is on
// "Read the resume now", and "Keep it for later" leaves "Resume" one action away for the rest of the visit.
import { describe, expect, it } from "vitest";

import {
  HANDOFF_LINE,
  announcer,
  button,
  enter,
  flush,
  hasButton,
  nameOf,
  start,
  tabOrder,
  talkLog,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";

const offered = (v: Visit): boolean => hasButton(v.doc, "Read the resume now") && hasButton(v.doc, "Keep it for later");
const resumeOpen = (v: Visit): boolean => {
  const panel = v.doc.querySelector(".resume-panel");
  return panel !== null && !panel.hasAttribute("hidden");
};

describe("the hand-off's length", () => {
  it("is 4.5 s in 3D, ending no later than 5 s after it starts", async () => {
    const v = start({ webgl: true });
    await enter(v);
    expect(v.room.visit).toMatchObject({ stage: "handoff", mode: "3d" });
    v.clock.advance(4499);
    expect(v.room.visit.stage).toBe("handoff");
    expect(offered(v)).toBe(false);
    v.clock.advance(1);
    expect(v.room.visit.stage).toBe("room");
    expect(offered(v)).toBe(true);
    // The scene drew it from the start to the paper in the visitor's hands.
    expect(v.scene.handoff[0]).toBe(0);
    expect(v.scene.handoff.at(-1)).toBe(1);
    expect(Math.max(...v.scene.handoff)).toBe(1);
  });

  it("is 1 s under reduced motion", async () => {
    const v = start({ webgl: true, reducedMotion: true });
    await enter(v);
    expect(v.scene.created[0]?.reducedMotion).toBe(true);
    v.clock.advance(999);
    expect(v.room.visit.stage).toBe("handoff");
    v.clock.advance(1);
    expect(v.room.visit.stage).toBe("room");
    expect(offered(v)).toBe(true);
  });

  it("is three still frames of 1.5 s each in 2D", async () => {
    const v = start({ webgl: false });
    await enter(v);
    expect(v.room.visit.mode).toBe("2d");
    const frame = (): string | null | undefined => v.doc.querySelector(".flat")?.getAttribute("data-handoff-frame");
    expect(frame()).toBe("0");
    v.clock.advance(1499);
    expect(frame()).toBe("0");
    v.clock.advance(1);
    expect(frame()).toBe("1");
    v.clock.advance(1500);
    expect(frame()).toBe("2");
    v.clock.advance(1499);
    expect(v.room.visit.stage).toBe("handoff");
    v.clock.advance(1);
    expect(v.room.visit.stage).toBe("room");
    expect(frame()).toBe("2");
  });
});

describe("during the hand-off", () => {
  it("offers no control that skips it, and keys and clicks change nothing but focus", async () => {
    const v = start({ webgl: true });
    await enter(v);
    expect(textOf(v.doc.body)).not.toMatch(/skip/i);
    // Every control of the room is inert until the hand-off ends.
    for (const el of v.doc.querySelectorAll("#app button, #app a, #app input")) {
      expect(el.closest("[inert]"), nameOf(el)).not.toBeNull();
    }
    for (const key of ["Escape", "Enter", " ", "Tab", "ArrowRight", "s", "k"]) {
      v.doc.activeElement?.dispatchEvent(new v.win.KeyboardEvent("keydown", { key, bubbles: true }));
      v.doc.dispatchEvent(new v.win.KeyboardEvent("keydown", { key, bubbles: true }));
    }
    // jsdom doesn't enforce inert, so these clicks reach the handlers, which must ignore them.
    for (const el of v.doc.querySelectorAll<HTMLElement>("#app button, #app a")) el.click();
    v.clock.advance(4000);
    expect(v.room.visit.stage).toBe("handoff");
    expect(v.events).toEqual([]);
    expect(resumeOpen(v)).toBe(false);
    expect(textOf(talkLog(v.doc))).toBe("");
    v.clock.advance(500);
    expect(v.room.visit.stage).toBe("room");
  });

  it("announces itself as text in a polite live region that was in the page before it", async () => {
    const v = start();
    const region = announcer(v.doc);
    expect(region.getAttribute("aria-live") ?? "polite").toBe("polite");
    expect(textOf(region)).toBe("");
    await enter(v);
    expect(announcer(v.doc)).toBe(region);
    expect(textOf(region)).toBe(HANDOFF_LINE);
  });

  it("holds focus on the room's heading while it plays", async () => {
    const v = start();
    await enter(v);
    expect(v.doc.activeElement?.tagName).toBe("H1");
  });
});

describe("after the hand-off", () => {
  it('moves focus to "Read the resume now", beside "Keep it for later"', async () => {
    const v = start({ webgl: true });
    await enter(v);
    v.clock.advance(4500);
    expect(v.doc.activeElement).toBe(button(v.doc, "Read the resume now"));
    expect(hasButton(v.doc, "Keep it for later")).toBe(true);
  });

  it('opens the interactive resume on "Read the resume now", and Escape returns focus to "Resume"', async () => {
    const v = start({ webgl: true });
    await enter(v);
    v.clock.advance(5000);
    button(v.doc, "Read the resume now").click();
    await flush();
    expect(resumeOpen(v)).toBe(true);
    expect(v.events).toEqual([{ kind: "resume_opened" }]);
    expect(v.doc.querySelector(".resume-panel")?.contains(v.doc.activeElement)).toBe(true);
    v.doc.activeElement?.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(resumeOpen(v)).toBe(false);
    expect(v.doc.activeElement).toBe(button(v.doc, "Resume"));
    expect(offered(v)).toBe(false);
  });

  it('keeps "Resume" one action away for the rest of the visit after "Keep it for later"', async () => {
    const v = start({ webgl: true });
    await enter(v);
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    expect(v.events).toEqual([{ kind: "resume_kept" }]);
    expect(v.room.visit.resumeKept).toBe(true);
    expect(offered(v)).toBe(false);
    const resume = button(v.doc, "Resume");
    expect(v.doc.activeElement).toBe(resume);
    v.clock.advance(10 * 60_000);
    expect(button(v.doc, "Resume")).toBe(resume);
    expect(resume.closest("[inert], [hidden]")).toBeNull();
    expect(resume.disabled).toBe(false);
    resume.click();
    expect(resumeOpen(v)).toBe(true);
    expect(v.events).toEqual([{ kind: "resume_kept" }, { kind: "resume_opened" }]);
  });

  it("makes the objects, the resume, and the text box available once the visitor has chosen", async () => {
    const v = start();
    await enter(v);
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    for (const el of v.doc.querySelectorAll(".room-toolbar button, .room-list button, .talk input, .talk button")) {
      expect(el.closest("[inert], [hidden]"), nameOf(el)).toBeNull();
    }
  });
});

// The review of T171, N2 (spec 004; FR-063, FR-065): "Around the room" is content, not a control, so it stays readable
// while the hand-off plays: Tab from the room's heading reaches it, and only it, with nothing in it to press.
describe('"Around the room" during the hand-off', () => {
  it("is the one Tab stop from the heading, readable and not inert", async () => {
    const v = start({ webgl: true });
    await enter(v);
    expect(v.room.visit.stage).toBe("handoff");
    expect(v.doc.activeElement?.tagName).toBe("H1");
    const around = v.doc.querySelector(".room-around");
    expect(around?.closest("[inert], [hidden]")).toBeNull();
    expect(around?.querySelectorAll("button, a, input, select, textarea")).toHaveLength(0);
    expect(tabOrder(v.doc)).toEqual([around]);
    expect(nameOf(around as Element)).toBe("Around the room");
  });
});
