// src/room/hud/viewport.ts (spec 005; FR-008, FR-009, FR-050; plan.md §4.3, §6.8): the window's measures as the browser
// gives them. The size is the page's root's client width (the window less a scroll bar) and the window's inner height;
// the ratio is the device's; the root font size is the root's; the safe areas are the probe's padding; and the
// keyboard's inset is what the visual viewport loses at its foot, only while the visitor hasn't pinch-zoomed, since a
// zoom shrinks the visual viewport too and is no keyboard. A change of the window is a re-fit, the visual viewport's
// alone a keyboard change.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { createViewport } from "../../src/room/hud/viewport";

function page(o: { vv?: { height: number; offsetTop: number; scale: number } } = {}) {
  const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
  const win = dom.window as unknown as Window & typeof globalThis;
  Object.defineProperty(win, "innerWidth", { configurable: true, value: 390 });
  Object.defineProperty(win, "innerHeight", { configurable: true, value: 844 });
  Object.defineProperty(win, "devicePixelRatio", { configurable: true, value: 3 });
  const listeners = new Map<string, () => void>();
  if (o.vv) {
    const vv = {
      ...o.vv,
      addEventListener: (n: string, f: () => void) => listeners.set(n, f),
      removeEventListener: () => undefined,
    };
    Object.defineProperty(win, "visualViewport", { configurable: true, value: vv });
  }
  return { win, listeners };
}

describe("the window's measures (hud/viewport.ts)", () => {
  it("reads the window's size, ratio, and root font size", () => {
    const { win } = page();
    const m = createViewport(win).read();
    expect([m.w, m.h, m.dpr, m.rem]).toEqual([390, 844, 3, 16]);
    expect(m.keyboard).toBe(0);
  });

  it("reads the keyboard's inset from the visual viewport's foot, and none while the page is pinch-zoomed", () => {
    expect(createViewport(page({ vv: { height: 544, offsetTop: 0, scale: 1 } }).win).read().keyboard).toBe(300);
    // Zoomed in to twice the size: the visual viewport is half the window, and no keyboard is open.
    expect(createViewport(page({ vv: { height: 422, offsetTop: 200, scale: 2 } }).win).read().keyboard).toBe(0);
  });

  it("reports a window's resize as a re-fit, and the visual viewport's change as the keyboard's", () => {
    const { win, listeners } = page({ vv: { height: 844, offsetTop: 0, scale: 1 } });
    const viewport = createViewport(win);
    const heard: string[] = [];
    viewport.subscribe((what) => heard.push(what));
    win.dispatchEvent(new win.Event("resize"));
    listeners.get("resize")?.();
    expect(heard).toEqual(["refit", "keyboard"]);
    viewport.dispose();
  });
});
