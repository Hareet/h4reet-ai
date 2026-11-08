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
  swapped.renderer = () => ({
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: (scene: Scene, cam: Camera) => {
      if (scene.name === "") seen.push(cam.position.toArray());
    },
    dispose: () => undefined,
  });
  const win = new JSDOM(`<main><div id="view" tabindex="0"></div></main>`, { pretendToBeVisual: true })
    .window as unknown as TestWindow;
  win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  const clock = new FakeClock();
  const ended: WalkEnd[] = [];
  const stage = createScene({
    win,
    doc: win.document,
    clock,
    room: index,
    avatar: "dog",
    reducedMotion: false,
    select: () => undefined,
    onFrame: () => undefined,
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
  return { stage, clock, view, home, key, last, ended, seen };
}

const near = (a: readonly number[], b: readonly number[]): boolean =>
  a.every((v, k) => Math.abs(v - (b[k] ?? 0)) < 1e-6);

describe("the walking view in the 3D stage (spec 008, T051)", () => {
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

  it("leaves when the room asks, without a report, and does nothing entered twice or left while off", () => {
    const r = run();
    r.clock.advance(16);
    r.stage.walk.leave();
    r.stage.walk.enter(r.view);
    r.stage.walk.enter(r.view);
    for (let k = 0; k < 40; k += 1) r.clock.advance(16);
    r.stage.walk.leave();
    expect(r.stage.walk.walking).toBe(false);
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
