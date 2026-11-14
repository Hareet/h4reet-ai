// rework-024 (spec 024; FR-012; rv-impl-024's nit 2): a held B is one press. The keyboard's auto-repeat sends keydown
// again and again with `repeat` set; the walking view's input takes only the first, so holding B doesn't bite the next
// chunk each time a flight lands. A new press (key up, key down) bites again.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { renderRoom } from "../../src/room/layout";
import { createWalkInput } from "../../src/room/walk/input";

const RATES = { turn: Math.PI / 2, tilt: Math.PI / 4 };

function input() {
  const dom = new JSDOM(`<main><div id="view" tabindex="0"><canvas id="c"></canvas></div></main>`, {
    pretendToBeVisual: true,
  });
  const win = dom.window as unknown as Window & typeof globalThis;
  const view = win.document.getElementById("view") as HTMLElement;
  const walk = createWalkInput(win.document.getElementById("c") as HTMLElement, win);
  walk.bind(view);
  const down = (repeat: boolean): void => {
    view.dispatchEvent(new win.KeyboardEvent("keydown", { code: "KeyB", key: "b", repeat, bubbles: true }));
  };
  const up = (): void => {
    view.dispatchEvent(new win.KeyboardEvent("keyup", { code: "KeyB", key: "b", bubbles: true }));
  };
  return { walk, down, up };
}

describe("a held B (FR-012; nit 2)", () => {
  it("is one press: the auto-repeat's keydowns give no eat intent", () => {
    const { walk, down, up } = input();
    down(false);
    expect(walk.take(0.016, RATES).eat).toBe(true);
    for (let k = 0; k < 5; k++) {
      down(true);
      expect(walk.take(0.016, RATES).eat, `repeat ${k}`).toBe(false);
    }
    up();
    down(false);
    expect(walk.take(0.016, RATES).eat, "a new press").toBe(true);
  });

  it("on the Eat tile too: a held Enter's or Space's repeats are not the button's presses (the sibling, another shape)", () => {
    const doc = new JSDOM("<!doctype html><html><body></body></html>").window.document;
    const div = (): HTMLElement => doc.createElement("div");
    const layout = renderRoom(doc, {
      list: div(),
      talk: div(),
      around: div(),
      note: "note",
      pause: "Pause the room",
      walk: { enter: "Walk", leave: "Stop walking", region: "region", help: "help" },
      eat: { button: "Eat" },
    });
    doc.body.append(layout.element);
    const win = doc.defaultView as Window & typeof globalThis;
    const key = (k: string, repeat: boolean): boolean => {
      const e = new win.KeyboardEvent("keydown", { key: k, repeat, bubbles: true, cancelable: true });
      layout.eatButton.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(key("Enter", false), "the first Enter presses").toBe(false);
    expect(key(" ", false), "the first Space presses").toBe(false);
    expect(key("Enter", true), "a repeated Enter's click is held back").toBe(true);
    expect(key(" ", true), "a repeated Space's is too").toBe(true);
    expect(key("Tab", true), "another key is left alone").toBe(false);
  });
});
