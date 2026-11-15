// T-B05 (spec 028; FR-020, FR-027; plan.md R-B5): the speech bubble over the twin's figure, src/room/bubble.ts and
// bubble.css.
// - One `div.room-bubble` in its host, hidden from assistive technology (the live region says its words), absent
//   from the Tab order, its words as text.
// - Placed at the point the stage gives, its tail's tip there, clamped inside the frame area the stage gives.
// - Shown for the given seconds on the room's clock, then hidden; a second show restarts it; `hide` at once.
// - No animation under reduced motion (its own attribute, as the room's motion store reads it, and the media query).
// - Contrast: its words on its own background at least 4.5:1, in the stylesheet's colours.
// - `speakingSeconds`: spec 016's speaking time, the words at `speak_wpm` within `speak_s`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { createBubble, speakingSeconds } from "../../src/room/bubble";
import { parseCss } from "../helpers/room";

function host(): { doc: Document; host: HTMLElement } {
  const dom = new JSDOM(`<main><div id="view" style="position: relative"></div></main>`, { pretendToBeVisual: true });
  const doc = dom.window.document;
  return { doc, host: doc.getElementById("view") as HTMLElement };
}
const FRAME = { x: 100, y: 50, w: 800, h: 500 };

describe("the bubble's element (FR-020)", () => {
  it("is one div.room-bubble in its host, hidden from assistive technology, out of the Tab order", () => {
    const h = host();
    const b = createBubble(h.doc, h.host);
    b.show("There is a dinosaur in the room!", 3, 0);
    const found = h.host.querySelectorAll(".room-bubble");
    expect(found).toHaveLength(1);
    const el = found[0] as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.textContent).toBe("There is a dinosaur in the room!");
    expect(el.hidden).toBe(false);
    expect(b.shown).toBe(true);
  });

  it("is made hidden, before any show", () => {
    const h = host();
    const b = createBubble(h.doc, h.host);
    expect(b.shown).toBe(false);
    expect((h.host.querySelector(".room-bubble") as HTMLElement | null)?.hidden ?? true).toBe(true);
  });
});

describe("its place (FR-020)", () => {
  it("puts its tail's tip at the given point", () => {
    const h = host();
    const b = createBubble(h.doc, h.host);
    b.show("Hello", 3, 0);
    b.place(400, 200, FRAME);
    const el = b.element;
    expect(el.style.left).toBe("400px");
    expect(el.style.top).toBe("200px");
  });

  it("clamps the point inside the frame area, by its own size", () => {
    const h = host();
    const b = createBubble(h.doc, h.host);
    b.show("Hello", 3, 0);
    Object.defineProperty(b.element, "offsetWidth", { configurable: true, get: () => 200 });
    Object.defineProperty(b.element, "offsetHeight", { configurable: true, get: () => 60 });
    b.place(20, 10, FRAME);
    // Its box is centred on x and above the point: the left half's width and its height must fit inside.
    expect(b.element.style.left).toBe(`${FRAME.x + 100}px`);
    expect(b.element.style.top).toBe(`${FRAME.y + 60}px`);
    b.place(5000, 5000, FRAME);
    expect(b.element.style.left).toBe(`${FRAME.x + FRAME.w - 100}px`);
    expect(b.element.style.top).toBe(`${FRAME.y + FRAME.h}px`);
  });
});

describe("its time (FR-020)", () => {
  it("shows for the given seconds on the room's clock, then hides", () => {
    const h = host();
    const b = createBubble(h.doc, h.host);
    b.show("Hello", 2, 1000);
    b.tick(1000 + 1999);
    expect(b.shown).toBe(true);
    b.tick(1000 + 2000);
    expect(b.shown).toBe(false);
    expect(b.element.hidden).toBe(true);
  });

  it("restarts on a second show, and hides at once on hide", () => {
    const h = host();
    const b = createBubble(h.doc, h.host);
    b.show("One", 2, 0);
    b.show("Two", 2, 1500);
    b.tick(3000);
    expect(b.shown).toBe(true);
    expect(b.element.textContent).toBe("Two");
    b.hide();
    expect(b.shown).toBe(false);
  });
});

const css = readFileSync(fileURLToPath(new URL("../../src/room/bubble.css", import.meta.url)), "utf8");
const sheet = parseCss(css);

describe("its stylesheet (FR-020)", () => {
  it("animates nothing under reduced motion: the media query and the room's own attribute", () => {
    const reduced = sheet.atRules.find((r) => /prefers-reduced-motion:\s*reduce/.test(r.prelude));
    expect(reduced?.body ?? "").toMatch(/\.room-bubble[^{]*\{[^}]*animation:\s*none/);
    const own = sheet.rules.find(
      (r) => r.selector.includes('[data-motion="reduced"]') && r.selector.includes(".room-bubble"),
    );
    expect(own?.declarations.get("animation")).toBe("none");
  });

  it("marks its host's motion: data-motion reduced while the room's motion is reduced", () => {
    const h = host();
    const b = createBubble(h.doc, h.host);
    b.show("Hello", 2, 0, { reduced: true });
    expect(b.element.getAttribute("data-motion")).toBe("reduced");
    b.show("Hello", 2, 0, { reduced: false });
    expect(b.element.hasAttribute("data-motion")).toBe(false);
  });

  it("gives its words at least 4.5:1 on its background", () => {
    const rule = sheet.rules.find((r) => r.selector === ".room-bubble");
    const hex = (v: string | undefined): [number, number, number] => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((v ?? "").trim());
      if (!m) throw new Error(`not a hex colour: ${v}`);
      return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
    };
    const lum = (rgb: [number, number, number]): number => {
      const [r, g, b] = rgb.map((c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [a, b] = [lum(hex(rule?.declarations.get("color"))), lum(hex(rule?.declarations.get("background")))].sort(
      (p, q) => q - p,
    );
    expect((a! + 0.05) / (b! + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("speakingSeconds (spec 016's speaking time)", () => {
  it("is the words at speak_wpm, within speak_s", () => {
    expect(speakingSeconds("There is a dinosaur in the room!", 150, [3, 20])).toBe(3);
    const long = Array.from({ length: 30 }, () => "word").join(" ");
    expect(speakingSeconds(long, 150, [3, 20])).toBeCloseTo(12, 9);
    expect(speakingSeconds(`${long} ${long} ${long}`, 150, [3, 20])).toBe(20);
  });
});
