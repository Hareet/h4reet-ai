// T029 (spec 005; FR-030 to FR-034; SC-004; plan.md §7): a press reaches one place, the HUD or the scene. The panels
// are siblings over the canvas, so their events never reach it; the canvas's pointerleave clears a hover's target; a
// press that starts on the scene stays the scene's; the panels and the strip take their own pointer, and contain their
// wheel, while the notes let a pointer through; walking's keys act only on the walking view, and a press on the scene
// while walking gives it focus.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { bindPointerSelection } from "../../src/room/objects";
import { WEB, button, intoRoom, roomIndex, start, stubViewport } from "../helpers/room";
import type { TestWindow, Visit } from "../helpers/room";

const CSS = readFileSync(join(WEB, "src/room/room.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the rules whose selector list holds `selector`, in order. */
function declared(selector: string, property: string): string[] {
  const out: string[] = [];
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (m[1] ?? "").split(",").map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    for (const d of (m[2] ?? "").split(";")) {
      const [p, ...v] = d.split(":");
      if (p?.trim() === property) out.push(v.join(":").trim());
    }
  }
  return out;
}

async function walkingRoom(): Promise<Visit> {
  const viewport = stubViewport({ w: 1280, h: 720 });
  const v = start({ webgl: true, viewport: viewport.factory });
  await intoRoom(v);
  return v;
}

const pointer = (v: Visit, type: string, init: Record<string, unknown> = {}): Event =>
  new v.win.PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "mouse", button: 0, ...init });

describe("a press reaches one place (spec 005, T029)", () => {
  it("lets no press, drag, wheel, or hover on a panel reach the scene", async () => {
    const v = await walkingRoom();
    const canvas = v.scene.stage?.canvas;
    if (!canvas) throw new Error("no canvas");
    const reached = vi.fn();
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointerleave", "wheel", "click"])
      canvas.addEventListener(type, reached);
    const targets = v.scene.targets.length;
    const events = v.events.length;
    const panels = [
      v.doc.querySelector(".hud-bar"),
      v.doc.querySelector(".room-list"),
      v.doc.querySelector(".talk"),
      v.doc.querySelector(".disclosure"),
    ];
    for (const panel of panels) {
      if (!panel) throw new Error("a panel is missing");
      panel.dispatchEvent(pointer(v, "pointerdown", { clientX: 10, clientY: 10 }));
      panel.dispatchEvent(pointer(v, "pointermove", { clientX: 60, clientY: 40, buttons: 1 }));
      panel.dispatchEvent(pointer(v, "pointerup", { clientX: 60, clientY: 40 }));
      panel.dispatchEvent(new v.win.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 }));
    }
    expect(reached).not.toHaveBeenCalled();
    expect(v.scene.targets.length).toBe(targets);
    expect(v.events.slice(events)).toEqual([]);
  });

  it("clears a hover's target when the pointer moves from the canvas onto a panel", () => {
    const win = new JSDOM("<main><canvas></canvas><div class='panel'></div></main>").window as unknown as TestWindow;
    const canvas = win.document.querySelector("canvas") as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;
    const target = vi.fn();
    bindPointerSelection(
      canvas,
      () => "fx-board",
      () => undefined,
      target,
    );
    canvas.dispatchEvent(new win.PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: 50 }));
    expect(target).toHaveBeenLastCalledWith("pointer", "fx-board");
    canvas.dispatchEvent(new win.PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(target).toHaveBeenLastCalledWith("pointer", null);
  });

  it("keeps a press that starts on the scene the scene's: a drag across a panel selects nothing and presses no button", () => {
    const win = new JSDOM("<main><canvas></canvas><button>Send</button></main>").window as unknown as TestWindow;
    const canvas = win.document.querySelector("canvas") as HTMLCanvasElement;
    const panelButton = win.document.querySelector("button") as HTMLButtonElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;
    const select = vi.fn();
    const pressed = vi.fn();
    panelButton.addEventListener("click", pressed);
    bindPointerSelection(canvas, () => "fx-board", select);
    const at = (type: string, x: number): void => {
      canvas.dispatchEvent(
        new win.PointerEvent(type, {
          bubbles: true,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          clientX: x,
          clientY: 100,
        }),
      );
    };
    // The moves and the release, captured, come to the canvas wherever the pointer is.
    at("pointerdown", 100);
    at("pointermove", 200);
    at("pointermove", 390);
    at("pointerup", 390);
    expect(select).not.toHaveBeenCalled();
    expect(pressed).not.toHaveBeenCalled();
  });

  it("gives the panels and the strip their own pointer, contains their wheel, and lets the notes pass it through", () => {
    for (const layout of ["column", "dock"]) {
      for (const part of [".hud-bar", ".hud-panels", ".disclosure"])
        expect(declared(`html[data-hud="${layout}"] ${part}`, "pointer-events"), `${layout} ${part}`).toContain("auto");
      for (const part of [".hud-panels", ".talk-log"])
        expect(declared(`html[data-hud="${layout}"] ${part}`, "overscroll-behavior"), `${layout} ${part}`).toContain(
          "contain",
        );
    }
    expect(declared(".room-notes", "pointer-events")).toContain("none");
    expect(declared(".room-clear", "pointer-events")).toContain("none");
  });

  it("keeps walking's keys from the text box, and gives the walking view focus on a press on the scene", async () => {
    const v = await walkingRoom();
    button(v.doc, roomIndex().ui["walk.enter"] ?? "Walk around").click();
    const view = v.doc.querySelector<HTMLElement>(".room-stage-view");
    expect(v.doc.activeElement).toBe(view);
    const keys = vi.fn();
    view?.addEventListener("keydown", keys);
    const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
    if (!box) throw new Error("no text box");
    box.focus();
    box.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "w", code: "KeyW", bubbles: true }));
    expect(keys).not.toHaveBeenCalled();
    // A press on the scene while walking: the walking view takes focus, and W walks there.
    v.scene.stage?.canvas.dispatchEvent(pointer(v, "pointerdown", { clientX: 100, clientY: 100 }));
    expect(v.doc.activeElement).toBe(view);
    view?.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "w", code: "KeyW", bubbles: true }));
    expect(keys).toHaveBeenCalledTimes(1);
  });
});
