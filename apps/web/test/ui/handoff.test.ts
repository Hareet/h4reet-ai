// T035 (spec 002; FR-007–FR-009; contracts/room-scene.md §3; research.md R-13): the hand-off, on a fake clock. It lasts
// 4.5 s in 3D (never more than 5), 1 s under reduced motion, and three 1.5 s still frames in 2D; no control skips it,
// and keys and clicks during it change nothing but focus; its line goes to a polite live region. Spec 033 (FR-001 to
// FR-005; its Amendment A1, A2): at its end there is no offer, the room is the visitor's at once, focus stays on the
// room's heading, `resume_kept` goes once, and "Resume" is one action away for the rest of the visit.
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

/** Any trace of spec 002's offer, which spec 033 removed: its group, its line, or either of its buttons. */
const offered = (v: Visit): boolean =>
  v.doc.querySelector(".room-offer") !== null ||
  textOf(v.doc.body).includes("The twin handed you the Author's resume.") ||
  hasButton(v.doc, "Read the resume now") ||
  hasButton(v.doc, "Keep it for later");
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
    expect(offered(v)).toBe(false);
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
    expect(offered(v)).toBe(false);
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

describe("after the hand-off (spec 033)", () => {
  for (const [name, options] of [
    ["3D", { webgl: true }],
    ["3D under reduced motion", { webgl: true, reducedMotion: true }],
    ["2D", { webgl: false }],
  ] as const) {
    it(`offers nothing and opens the room at once, focus kept on the heading (${name}; FR-001, FR-002)`, async () => {
      const v = start(options);
      await enter(v);
      expect(v.doc.activeElement?.tagName).toBe("H1");
      v.clock.advance(5000);
      expect(v.room.visit.stage).toBe("room");
      expect(offered(v)).toBe(false);
      expect(v.doc.activeElement?.tagName).toBe("H1");
      for (const el of v.doc.querySelectorAll(".room-toolbar button, .room-list button, .talk input, .talk button")) {
        expect(el.closest("[inert], [hidden]"), nameOf(el)).toBeNull();
      }
      // The next Tab from the heading is the bar's first control, "Resume".
      expect(tabOrder(v.doc)[0]).toBe(button(v.doc, "Resume"));
    });
  }

  it("sends resume_kept once, at the hand-off's end, and the visit holds no resumeKept (FR-003, FR-004)", async () => {
    const v = start({ webgl: true });
    await enter(v);
    v.clock.advance(4499);
    expect(v.events).toEqual([]);
    v.clock.advance(1);
    expect(v.events).toEqual([{ kind: "resume_kept" }]);
    v.clock.advance(10 * 60_000);
    expect(v.events).toEqual([{ kind: "resume_kept" }]);
    expect(v.room.visit).not.toHaveProperty("resumeKept");
  });

  it('keeps "Resume" one action away for the rest of the visit, and Escape returns focus to it (FR-005)', async () => {
    const v = start({ webgl: true });
    await enter(v);
    v.clock.advance(5000);
    const resume = button(v.doc, "Resume");
    v.clock.advance(10 * 60_000);
    expect(button(v.doc, "Resume")).toBe(resume);
    expect(resume.closest("[inert], [hidden]")).toBeNull();
    expect(resume.disabled).toBe(false);
    resume.click();
    await flush();
    expect(resumeOpen(v)).toBe(true);
    expect(v.events).toEqual([{ kind: "resume_kept" }, { kind: "resume_opened" }]);
    expect(v.doc.querySelector(".resume-panel")?.contains(v.doc.activeElement)).toBe(true);
    v.doc.activeElement?.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(resumeOpen(v)).toBe(false);
    expect(v.doc.activeElement).toBe(resume);
  });

  it("takes a piece's selection at once, with no step between (FR-001)", async () => {
    const v = start({ webgl: true });
    await enter(v);
    v.clock.advance(5000);
    const entry = v.doc.querySelector<HTMLButtonElement>(".room-list button[data-object-id]");
    if (!entry) throw new Error("no list entry");
    entry.click();
    expect(v.events.map((e) => e.kind)).toEqual(["resume_kept", "object_selected"]);
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
