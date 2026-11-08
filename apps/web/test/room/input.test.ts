// T045's input cases, in units (spec 008; FR-028 to FR-030; plan.md R-10): src/room/walk/input.ts in jsdom. Keys act
// only on the walking view's focusable element, the letters by their physical key; the arrows don't scroll; Q, E, R,
// and F turn and tilt at the walking data's rates; + and = zoom in and − out; Enter and Escape are passed on once; a
// drag beyond the slop turns and tilts and a click within it is a tap; the wheel zooms and keeps the page still; and
// every held key and drag is dropped when the view or the window loses focus, the page hides, or the input unbinds.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { TAP_SLOP_PX } from "../../src/room/objects";
import { DRAG_RAD_PER_PX, createWalkInput } from "../../src/room/walk/input";

function setup() {
  const dom = new JSDOM(`<main><div id="view" tabindex="0"><canvas id="c"></canvas></div><button>x</button></main>`, {
    pretendToBeVisual: true,
  });
  const win = dom.window as unknown as Window & typeof globalThis;
  const doc = win.document;
  const view = doc.getElementById("view") as HTMLElement;
  const canvas = doc.getElementById("c") as HTMLElement;
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0 }) as DOMRect;
  const input = createWalkInput(canvas, win);
  input.bind(view);
  const key = (type: "keydown" | "keyup", code: string, key: string, on: HTMLElement = view): KeyboardEvent => {
    const e = new win.KeyboardEvent(type, { code, key, bubbles: true, cancelable: true });
    on.dispatchEvent(e);
    return e;
  };
  const pointer = (type: string, x: number, y: number, buttons = 1): void => {
    canvas.dispatchEvent(
      new win.PointerEvent(type, {
        bubbles: true,
        pointerType: "mouse",
        pointerId: 1,
        clientX: x,
        clientY: y,
        buttons,
      }),
    );
  };
  return { win, doc, view, canvas, input, key, pointer };
}

const RATES = { turn: Math.PI / 2, tilt: Math.PI / 4 };

describe("the walking view's input (spec 008, T048)", () => {
  it("walks by the held keys, W A S D by their physical keys and the arrows, the arrows not scrolling", () => {
    const { input, key } = setup();
    key("keydown", "KeyW", "z");
    key("keydown", "KeyD", "d");
    expect(input.take(0.016, RATES).move).toEqual({ forward: 1, right: 1 });
    key("keyup", "KeyW", "z");
    key("keyup", "KeyD", "d");
    const arrow = key("keydown", "ArrowLeft", "ArrowLeft");
    expect(arrow.defaultPrevented).toBe(true);
    key("keydown", "ArrowDown", "ArrowDown");
    expect(input.take(0.016, RATES).move).toEqual({ forward: -1, right: -1 });
  });

  it("turns, tilts, and zooms by Q, E, R, F, +, =, and −, and passes Enter and Escape on once", () => {
    const { input, key } = setup();
    key("keydown", "KeyE", "e");
    key("keydown", "KeyF", "f");
    key("keydown", "Equal", "=");
    key("keydown", "Equal", "+");
    key("keydown", "Minus", "-");
    key("keydown", "Enter", "Enter");
    const t = input.take(0.5, RATES);
    expect(t.turn).toBeCloseTo(RATES.turn * 0.5, 12);
    expect(t.tilt).toBeCloseTo(RATES.tilt * 0.5, 12);
    expect([t.zoom, t.enter, t.escape]).toEqual([1, true, false]);
    key("keydown", "Escape", "Escape");
    const u = input.take(0.5, RATES);
    expect([u.zoom, u.enter, u.escape]).toEqual([0, false, true]);
    expect(input.take(0.5, RATES).escape).toBe(false);
  });

  it("acts on no key pressed anywhere but the walking view", () => {
    const { doc, input, key } = setup();
    key("keydown", "KeyW", "w", doc.querySelector("button") as HTMLElement);
    expect(input.take(0.016, RATES).move).toEqual({ forward: 0, right: 0 });
  });

  it("turns and tilts by a drag beyond the slop, not by a click within it, and passes a missed click on as a tap", () => {
    const { input, pointer } = setup();
    pointer("pointerdown", 100, 100);
    pointer("pointermove", 100 + TAP_SLOP_PX + 20, 110);
    pointer("pointerup", 100 + TAP_SLOP_PX + 20, 110, 0);
    const t = input.take(0.016, RATES);
    expect(t.turn).toBeCloseTo((TAP_SLOP_PX + 20) * DRAG_RAD_PER_PX, 12);
    expect(t.tilt).toBeCloseTo(10 * DRAG_RAD_PER_PX, 12);
    expect(t.taps).toEqual([]);
    // A click is objects.ts's; one that picked nothing comes back through miss, for the next frame.
    pointer("pointerdown", 200, 150);
    pointer("pointerup", 202, 151, 0);
    input.miss({ x: 0.01, y: -0.006 });
    const u = input.take(0.016, RATES);
    expect(u.taps).toEqual([{ x: 0.01, y: -0.006 }]);
    expect(u.turn).toBe(0);
    expect(input.take(0.016, RATES).taps).toEqual([]);
  });

  it("zooms by the wheel, the page kept still", () => {
    const { win, canvas, input } = setup();
    const e = new win.WheelEvent("wheel", { deltaY: -200, bubbles: true, cancelable: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(input.take(0.016, RATES).zoom).toBe(2);
  });

  it("drops every held key and drag when the view or the window loses focus, the page hides, or it unbinds", () => {
    const { win, doc, view, input, key, pointer } = setup();
    for (const lose of [
      () => view.dispatchEvent(new win.FocusEvent("blur")),
      () => win.dispatchEvent(new win.FocusEvent("blur")),
      () => {
        Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => "hidden" });
        doc.dispatchEvent(new win.Event("visibilitychange"));
        Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => "visible" });
      },
      () => {
        input.unbind();
        input.bind(view);
      },
    ]) {
      key("keydown", "KeyW", "w");
      pointer("pointerdown", 10, 10);
      pointer("pointermove", 60, 10);
      lose();
      pointer("pointermove", 120, 10);
      const t = input.take(0.016, RATES);
      expect(t.move).toEqual({ forward: 0, right: 0 });
      expect(t.turn).toBe(0);
    }
  });
});
