// T015 (spec 018; FR-002; plan.md §9): each decoration of the split layout forced to throw shows its plain form, every
// control still works, and nothing throws out of the panel: the frame is a 1 px border, the strokes are none, the
// portrait is nothing (the silhouette's own drawing is the portrait's), and the key caps are text labels.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { createSplit } from "../../src/room/hud/split";
import type { SplitDraw } from "../../src/room/hud/split";

const boom = (): never => {
  throw new Error("the drawing failed");
};

function build(draw: Partial<SplitDraw>) {
  const dom = new JSDOM(
    '<body><div class="room-list"><h2 class="room-list-heading"><button>In the room</button></h2><ul>' +
      '<li><button data-object-id="a">A</button></li><li><button data-object-id="b">B</button></li></ul></div>' +
      '<section class="talk"><div class="talk-sheet"><div class="talk-head"><button class="talk-log-toggle"><span>Conversation</span></button></div>' +
      '<div class="talk-log"></div></div><form class="talk-form"><input id="talk-text"><button type="submit">Send</button></form></section></body>',
  );
  const doc = dom.window.document;
  const s = createSplit(doc, {
    talk: doc.querySelector(".talk") as HTMLElement,
    list: doc.querySelector(".room-list") as HTMLElement,
    words: { select: "Select a piece", back: "Back", close: "Close", esc: "Esc", enter: "Enter" },
    stats: () => [
      { id: "serving", label: "Serving", value: "Local" },
      { id: "call", label: "This call", value: "—" },
      { id: "visit", label: "This visit", value: "—" },
    ],
    turnOut: () => false,
    walking: () => false,
    draw,
  });
  s.setActive(true);
  return { doc, s };
}
const talk = (doc: Document): Element => doc.querySelector(".talk") as Element;

describe("a decoration that throws shows its plain form (FR-002)", () => {
  it("the frame: the panel's plain border, and every control still there", () => {
    const { doc, s } = build({ frame: boom });
    expect(() => s.openPanel()).not.toThrow();
    expect(doc.querySelector(".split-frame")).toBeNull();
    expect(talk(doc).classList.contains("split-plain")).toBe(true);
    expect(doc.querySelectorAll(".split-stats dd")).toHaveLength(3);
    expect(doc.querySelector(".split-hint")).not.toBeNull();
    (doc.querySelector(".split-hint") as HTMLButtonElement).click();
    expect(talk(doc).getAttribute("data-panel")).toBe("bar");
    expect(talk(doc).classList.contains("split-plain")).toBe(false);
  });

  it("the strokes: none, with the entry still selected and the confirm key cap kept", () => {
    const { doc, s } = build({ stroke: boom });
    s.openPanel();
    expect(() => s.setTarget("b")).not.toThrow();
    const li = doc.querySelector('[data-object-id="b"]')?.closest("li");
    expect(li?.querySelector(".split-stroke")).toBeNull();
    expect(li?.querySelector("button")?.getAttribute("aria-current")).toBe("true");
    expect(li?.querySelector(".split-confirm")).not.toBeNull();
  });

  it("the key caps: text labels, the buttons still named with their keys, the selected entry without a cap", () => {
    const { doc, s } = build({ keycap: boom });
    expect(() => s.openPanel()).not.toThrow();
    s.setTarget("a");
    const hint = doc.querySelector(".split-hint") as HTMLElement;
    expect(hint.querySelector(".hud-keycap")).toBeNull();
    expect(hint.textContent).toBe("Close");
    expect(hint.getAttribute("aria-label")).toBe("Close, Escape");
    expect(doc.querySelector(".split-back")?.getAttribute("aria-label")).toBe("Back, Escape");
    expect(doc.querySelector(".split-confirm")).toBeNull();
    expect(doc.querySelector('[data-object-id="a"]')?.getAttribute("aria-current")).toBe("true");
  });

  it("the portrait: nothing in its slot, the body and the controls untouched", () => {
    const { doc, s } = build({ portrait: boom });
    expect(() => s.openPanel()).not.toThrow();
    expect(doc.querySelector(".split-portrait")?.childElementCount).toBe(0);
    expect(doc.querySelector(".split-silhouette")).toBeNull();
    expect(doc.getElementById("talk-text")).not.toBeNull();
  });

  it("everything at once: still opens, closes, selects, and Escape closes", () => {
    const { doc, s } = build({ frame: boom, stroke: boom, keycap: boom, portrait: boom });
    s.openPanel();
    s.setTarget("a");
    expect(doc.querySelectorAll(".split-stats dt")).toHaveLength(3);
    doc.dispatchEvent(
      new doc.defaultView!.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(s.open).toBe(false);
    expect(doc.activeElement?.getAttribute("data-object-id")).toBe("a");
  });
});
