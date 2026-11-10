// T016 (spec 005; FR-008, FR-012, FR-013; SC-001; plan.md §4.3, PD-14, PD-15): the room re-fits on every change of the
// window, through `hud/viewport.ts`, which these tests stub, in 3D (the stand-in stage) and in 2D. At each of SC-001's
// steps, pixel ratios, and a full screen entered and left on 1920 × 1200, the page's root carries the layout compose/hud.ts
// gives and the stage is told the clear area; the visit's state is kept (the conversation, the text box's text, the open
// resume, the target, the walking view, the quality level, the mode, the panels' states, and focus); a continuous resize
// of 10 s at 20 frames a second holds the quality controller, which steps down 0 times; and the on-screen keyboard's
// inset changes only --keyboard, never the clear area.
import { describe, expect, it } from "vitest";

import { fitsHud, hudBoxes } from "../../src/room/compose/hud";
import type { HudMetrics } from "../../src/room/compose/hud";
import type { WindowMeasures } from "../../src/room/hud/viewport";
import { button, flush, intoRoom, start, stubViewport, talkLog } from "../helpers/room";
import type { Visit } from "../helpers/room";

/** The steps of SC-001, at pixel ratios of 1, 2, and 1.5, then full screen entered and left on 1920 × 1200. */
const STEPS: { w: number; h: number; dpr: number }[] = [
  ...[1, 2, 1.5].flatMap((dpr) =>
    [
      { w: 1280, h: 720 },
      { w: 2560, h: 1440 },
      { w: 3440, h: 1440 },
      { w: 390, h: 844 },
      { w: 844, h: 390 },
    ].map((s) => ({ ...s, dpr })),
  ),
  { w: 1920, h: 1200, dpr: 1 },
  { w: 1920, h: 1200, dpr: 1 },
  { w: 1920, h: 1080, dpr: 1 },
];

/** What the room should have set on the page's root at a window: compose/hud.ts's layout, boxes, and clear area. */
function expected(m: WindowMeasures): Record<string, string> {
  const metrics: HudMetrics = { rem: m.rem, safe: m.safe };
  const screen = { w: m.w, h: m.h };
  const b = hudBoxes(screen, { list: "open" }, metrics);
  const px = (n: number): string => `${n}px`;
  return {
    "data-hud": fitsHud(screen, { list: "open" }, metrics) ? b.layout : "stacked",
    "--bar-h": px(b.bar.h),
    "--column-w": px(b.column?.w ?? 0),
    "--dock-h": px(b.dock?.h ?? 0),
    "--clear-x": px(b.clear.x),
    "--clear-y": px(b.clear.y),
    "--clear-w": px(b.clear.w),
    "--clear-h": px(b.clear.h),
    "--keyboard": px(m.keyboard),
  };
}

function laidOut(v: Visit): Record<string, string> {
  const root = v.doc.documentElement;
  const out: Record<string, string> = { "data-hud": root.getAttribute("data-hud") ?? "" };
  for (const p of [
    "--bar-h",
    "--column-w",
    "--dock-h",
    "--clear-x",
    "--clear-y",
    "--clear-w",
    "--clear-h",
    "--keyboard",
  ])
    out[p] = root.style.getPropertyValue(p);
  return out;
}

async function room(webgl: boolean) {
  const viewport = stubViewport();
  const v = start({ webgl, viewport: viewport.factory });
  await intoRoom(v);
  return { v, viewport };
}

describe("the room re-fits to the window (spec 005, T016)", () => {
  for (const webgl of [true, false]) {
    const mode = webgl ? "3D" : "2D";

    it(`lays the HUD out as compose/hud.ts gives it at every step, and tells the stage its clear area, in ${mode}`, async () => {
      const { v, viewport } = await room(webgl);
      expect(laidOut(v)).toEqual(expected(viewport.measures));
      for (const step of STEPS) {
        viewport.set(step);
        v.clock.advance(16);
        const where = `${step.w} × ${step.h} at ${step.dpr}`;
        expect(laidOut(v), where).toEqual(expected(viewport.measures));
        if (webgl) {
          const b = hudBoxes({ w: step.w, h: step.h });
          expect(v.scene.created[0]?.clear?.()?.area, where).toEqual(b.clear);
        }
      }
    });

    it(`keeps the conversation, the text box's text, the open resume, the mode, and focus at every step, in ${mode}`, async () => {
      const { v, viewport } = await room(webgl);
      const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
      if (!box) throw new Error("no text box");
      box.value = "Hello";
      button(v.doc, "Send").click();
      await flush();
      const lines = talkLog(v.doc).innerHTML;
      box.value = "half a thought";
      button(v.doc, "Resume").click();
      await flush();
      const focused = v.doc.activeElement;
      const modeBefore = v.room.visit.mode;
      const qualityBefore = v.room.visit.quality;
      for (const step of STEPS) {
        viewport.set(step);
        v.clock.advance(16);
        const where = `${step.w} × ${step.h} at ${step.dpr}`;
        expect(talkLog(v.doc).innerHTML, where).toBe(lines);
        expect(box.value, where).toBe("half a thought");
        expect(v.doc.querySelector<HTMLElement>(".resume-panel")?.hidden, where).toBe(false);
        expect(v.doc.activeElement, where).toBe(focused);
        expect(v.room.visit.mode, where).toBe(modeBefore);
        expect(v.room.visit.quality, where).toBe(qualityBefore);
        expect(v.doc.documentElement.getAttribute("data-list"), where).toBe("open");
      }
    });

    it(`steps the quality down 0 times while the window is dragged for 10 s at 20 frames a second, in ${mode}`, async () => {
      const { v, viewport } = await room(webgl);
      const before = v.scene.quality.length;
      for (let k = 0; k < 200; k += 1) {
        viewport.set({ w: 1000 + 4 * k, h: 600 + 2 * k });
        v.clock.advance(50, 50);
      }
      expect(v.scene.quality.length).toBe(before);
      expect(v.room.visit.mode).toBe(webgl ? "3d" : "2d");
    });

    it(`changes only --keyboard for the on-screen keyboard, never the clear area, in ${mode}`, async () => {
      const { v, viewport } = await room(webgl);
      viewport.set({ w: 390, h: 844 });
      const before = laidOut(v);
      viewport.set({ keyboard: 300 }, "keyboard");
      const after = laidOut(v);
      expect(after["--keyboard"]).toBe("300px");
      expect({ ...after, "--keyboard": "" }).toEqual({ ...before, "--keyboard": "" });
      if (webgl) expect(v.scene.created[0]?.clear?.()?.area).toEqual(hudBoxes({ w: 390, h: 844 }).clear);
    });
  }

  it("keeps the walking view and its focus, and the target, at every step", async () => {
    const { v, viewport } = await room(true);
    button(v.doc, "Walk around").click();
    const view = v.doc.querySelector<HTMLElement>(".room-stage-view");
    expect(v.doc.activeElement).toBe(view);
    v.scene.created[0]?.target?.("pointer", v.scene.created[0].room.selectables[0]?.id ?? null);
    const target = v.scene.targets.at(-1);
    expect(target).not.toBeNull();
    for (const step of STEPS) {
      viewport.set(step);
      v.clock.advance(16);
      expect(v.scene.stage?.walk.walking).toBe(true);
      expect(v.doc.activeElement).toBe(view);
      expect(v.scene.targets.at(-1)).toBe(target);
    }
  });
});

// The review of 60b51de4, finding 3: a strip the window measured taller than the table moves the clear area down.
describe("a measured strip (T046, finding 3)", () => {
  it("sets --strip-h and the clear area's top from the strip the window measured", async () => {
    const viewport = stubViewport({ w: 1280, h: 720 });
    const v = start({ webgl: true, viewport: viewport.factory });
    await intoRoom(v);
    viewport.set({ strip: 80 });
    expect(v.doc.documentElement.style.getPropertyValue("--strip-h")).toBe("80px");
    expect(v.doc.documentElement.style.getPropertyValue("--clear-y")).toBe("80px");
  });
});
