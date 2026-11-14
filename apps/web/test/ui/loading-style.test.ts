// T016 (spec 018; FR-015, US3): the loader's card takes the panel's frame, title, and type, and nothing else of the
// card changes: the bar, the percentage, the stage line, and the hints are spec 012's. The frame is drawn in code from
// a seeded path and hidden from assistive technology; where it can't be drawn the card keeps its 1 px border; the
// glass stays opaque under reduced transparency or more contrast.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { createLoadingView } from "../../src/room/loading/view";
import { FakeClock, parseCss, roomIndex } from "../helpers/room";

const make = (frame?: (w: number, h: number, seed: number) => string) => {
  const doc = new JSDOM("<body></body>").window.document;
  const view = createLoadingView({
    doc,
    clock: new FakeClock(),
    ui: roomIndex().ui,
    hints: ["A hint"],
    reducedMotion: () => false,
    hidden: () => false,
    ...(frame ? { frame } : {}),
  });
  return { doc, view };
};

describe("the loader's card (T016)", () => {
  it("has the frame, the title, and the panel's type classes", () => {
    const { view } = make();
    const card = view.element;
    expect(card.classList.contains("room-loader--framed")).toBe(true);
    const frame = card.querySelector(".room-loader-frame");
    expect(frame?.getAttribute("aria-hidden")).toBe("true");
    expect(frame?.querySelector("path")?.getAttribute("d")).toMatch(/^M[0-9.,\-LZ\s]+$/);
    expect(view.heading.classList.contains("room-loader-title")).toBe(true);
    expect(view.heading.textContent).toBe("Loading the room");
  });

  it("keeps the 1 px border where the frame can't be drawn, and everything else", () => {
    const { view } = make(() => {
      throw new Error("no frame");
    });
    expect(view.element.classList.contains("room-loader--framed")).toBe(false);
    expect(view.element.querySelector(".room-loader-frame")).toBeNull();
    expect(view.heading.textContent).toBe("Loading the room");
    expect(view.element.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it("leaves the bar, the percentage, the stage line, and the hints as spec 012 has them", () => {
    const { view } = make();
    const kinds = [".room-loader-bar", ".room-loader-percent", ".room-loader-stage", ".room-loader-hints"];
    for (const k of kinds) expect(view.element.querySelector(k), k).not.toBeNull();
    expect(view.element.querySelector(".room-loader-bar")?.getAttribute("role")).toBe("progressbar");
    expect(view.element.querySelector(".room-loader-percent")?.getAttribute("aria-hidden")).toBe("true");
    // The frame is the card's first child: the heading stays where focus and the name expect it.
    expect([...view.element.children].map((c) => c.className.split(" ")[0])).toEqual([
      "room-loader-frame",
      "room-loader-heading",
      "room-loader-bar",
      "room-loader-percent",
      "room-loader-stage",
      "room-loader-hints",
    ]);
  });
});

describe("the loader's style (T016)", () => {
  const css = readFileSync(fileURLToPath(new URL("../../src/room/loading/loading.css", import.meta.url)), "utf8");
  const sheet = parseCss(css);
  const rule = (sel: string) => sheet.rules.find((r) => r.selector === sel);
  it("sets the title in the room's heading face and draws the frame as a ring over the card's own glass", () => {
    expect(rule(".room-loader-title")?.declarations.get("font-family")).toBe("var(--heading-font)");
    expect(rule(".room-loader-frame path")?.declarations.get("fill")).toBe("none");
  });
  it("takes no glass of its own: the card's background stays room.css's, opaque under reduced transparency or more contrast", () => {
    for (const r of sheet.rules.filter((x) => /room-loader--framed|room-loader-frame/.test(x.selector))) {
      expect(r.declarations.get("background") ?? "none").toBe("none");
      expect(r.declarations.get("opacity")).toBeUndefined();
    }
    const room = readFileSync(fileURLToPath(new URL("../../src/room/room.css", import.meta.url)), "utf8");
    expect(room).toMatch(/prefers-reduced-transparency: reduce[^{]*\{\s*:root\s*\{\s*--glass-alpha:\s*1/);
  });
  it("moves nothing under reduced motion and never draws the frame by animation", () => {
    expect(css).not.toMatch(/room-loader-frame[^{]*\{[^}]*animation/);
  });
});
