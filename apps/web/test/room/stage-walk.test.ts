// T051 (spec 008; FR-005, FR-022, FR-028, FR-029): the walking view in the 3D stage (src/room/scene.ts), with a stand-in
// renderer, since Node has no WebGL. Entering moves the stage's camera off the production framing to follow the figure,
// a held key walks it, Escape leaves through walkEnded("escape") and the camera comes back to the production framing
// within 500 ms, and leaving by the room does the same without a report. The walking interface reports its state.
import { JSDOM } from "jsdom";
import type { Camera, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { framing } from "../../src/room/compose/framing";
import { createScene } from "../../src/room/scene";
import { framedBoxes } from "../../src/room/scene/bundle3d";
import type { WalkEnd } from "../../src/room/stage";
import { TRANSITION_MS } from "../../src/room/walk/camera";
import { FakeClock, repositoryBundle } from "../helpers/room";
import type { TestWindow } from "../helpers/room";

const swapped = vi.hoisted(() => ({ renderer: null as ((parameters: unknown) => unknown) | null }));

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return swapped.renderer ? swapped.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

afterEach(() => {
  swapped.renderer = null;
});

function run() {
  const { scene: part, index } = repositoryBundle() as {
    scene: RoomScene;
    index: ReturnType<typeof repositoryBundle>["index"];
  };
  const seen: number[][] = [];
  const drawn: { room: Scene | null } = { room: null };
  swapped.renderer = () => ({
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: (scene: Scene, cam: Camera) => {
      if (scene.name !== "") return;
      seen.push(cam.position.toArray());
      drawn.room ??= scene;
    },
    dispose: () => undefined,
  });
  const win = new JSDOM(`<main><div id="view" tabindex="0"></div></main>`, { pretendToBeVisual: true })
    .window as unknown as TestWindow;
  win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  const clock = new FakeClock();
  const ended: WalkEnd[] = [];
  const named: [string, string | null][] = [];
  const stage = createScene({
    win,
    doc: win.document,
    clock,
    room: index,
    avatar: "dog",
    reducedMotion: false,
    select: () => undefined,
    onFrame: () => undefined,
    target: (input, id) => named.push([input, id]),
    walkEnded: (why) => ended.push(why),
  });
  const [w, h] = [960, 600];
  Object.defineProperty(stage.canvas, "clientWidth", { configurable: true, get: () => w });
  Object.defineProperty(stage.canvas, "clientHeight", { configurable: true, get: () => h });
  const view = win.document.getElementById("view") as HTMLElement;
  const home = framing(w / h, framedBoxes(part)).position;
  const key = (type: "keydown" | "keyup", code: string, k: string): void => {
    view.dispatchEvent(new win.KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
  };
  const last = (): number[] => seen.at(-1) ?? [];
  /** The visitor's figure as the room draws it: its node's place, and its picture's turn and scale. */
  const figure = (): number[][] => {
    const picture = drawn.room?.getObjectByName("cutout");
    const node = picture?.parent;
    if (!picture || !node) throw new Error("no visitor's picture drawn");
    return [node.position.toArray(), picture.rotation.toArray().slice(0, 3) as number[], picture.scale.toArray()];
  };
  return { stage, clock, view, home, key, last, ended, seen, named, figure };
}

const near = (a: readonly number[], b: readonly number[]): boolean =>
  a.every((v, k) => Math.abs(v - (b[k] ?? 0)) < 1e-6);

describe("the walking view in the 3D stage (spec 008, T051)", () => {
  it("leaves on Escape at once, the figure back at its place, unturned and unmirrored, however the view turned", () => {
    const r = run();
    r.clock.advance(16);
    const home = r.figure();
    r.stage.walk.enter(r.view);
    for (let k = 0; k < 10; k += 1) r.clock.advance(16);
    // Turn the view well past the mirror's hold, walking forward, then press Escape mid-turn.
    r.key("keydown", "KeyE", "e");
    r.key("keydown", "KeyW", "w");
    for (let k = 0; k < 40; k += 1) r.clock.advance(16);
    expect(r.figure()).not.toEqual(home);
    r.key("keydown", "Escape", "Escape");
    r.clock.advance(16);
    r.key("keyup", "KeyE", "e");
    r.key("keyup", "KeyW", "w");
    expect(r.ended).toEqual(["escape"]);
    expect(r.figure()).toEqual(home);
    for (let k = 0; k < 10; k += 1) r.clock.advance(16);
    expect(r.figure()).toEqual(home);
    // Reach, the walking view's own input, named none on leaving (plan.md R-06).
    expect(r.named.filter(([input]) => input === "reach").at(-1)).toEqual(["reach", null]);
    r.stage.dispose();
  });

  it("follows the figure once entered, walks by a held key, and comes back on Escape, reported", () => {
    const r = run();
    r.clock.advance(16);
    expect(near(r.last(), r.home)).toBe(true);
    expect(r.stage.walk.walking).toBe(false);
    r.stage.walk.enter(r.view);
    expect(r.stage.walk.walking).toBe(true);
    for (let k = 0; k < 40; k += 1) r.clock.advance(16);
    const following = r.last();
    expect(near(following, r.home)).toBe(false);
    r.key("keydown", "KeyD", "d");
    for (let k = 0; k < 20; k += 1) r.clock.advance(16);
    r.key("keyup", "KeyD", "d");
    // The camera follows the figure to the right.
    expect((r.last()[0] ?? 0) > (following[0] ?? 0)).toBe(true);
    r.key("keydown", "Escape", "Escape");
    r.clock.advance(16);
    expect(r.ended).toEqual(["escape"]);
    expect(r.stage.walk.walking).toBe(false);
    for (let k = 0; k * 16 <= TRANSITION_MS + 32; k += 1) r.clock.advance(16);
    expect(near(r.last(), r.home)).toBe(true);
    r.stage.dispose();
  });

  it("leaves when the room asks, without a report, the figure at home, and does nothing entered twice or left while off", () => {
    const r = run();
    r.clock.advance(16);
    const home = r.figure();
    r.stage.walk.leave();
    r.stage.walk.enter(r.view);
    r.stage.walk.enter(r.view);
    r.key("keydown", "KeyQ", "q");
    r.key("keydown", "KeyA", "a");
    for (let k = 0; k < 40; k += 1) r.clock.advance(16);
    r.key("keyup", "KeyQ", "q");
    r.key("keyup", "KeyA", "a");
    // The view turned, and the camera with it, off the production framing.
    expect(near(r.last(), r.home)).toBe(false);
    expect(r.figure()).not.toEqual(home);
    r.stage.walk.leave();
    expect(r.stage.walk.walking).toBe(false);
    expect(r.figure()).toEqual(home);
    expect(r.named.filter(([input]) => input === "reach").at(-1)).toEqual(["reach", null]);
    for (let k = 0; k * 16 <= TRANSITION_MS + 32; k += 1) r.clock.advance(16);
    expect(near(r.last(), r.home)).toBe(true);
    expect(r.ended).toEqual([]);
    // Keys on the view do nothing once left.
    const before = r.last();
    r.key("keydown", "KeyW", "w");
    for (let k = 0; k < 10; k += 1) r.clock.advance(16);
    expect(near(r.last(), before)).toBe(true);
    r.stage.dispose();
  });
});
