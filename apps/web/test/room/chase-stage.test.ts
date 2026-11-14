// rv-rework-025's Nit-3 (spec 025; rv-impl-025's B-1, its step 2; FR-001, FR-016, FR-017; plan.md §4): the stage's
// use of `chaseDue` (scene.ts), on the real 3D stage over the repository's room, with a stand-in renderer, since Node
// has no WebGL, as stage-walk.test.ts stages it.
// - With the dinosaur chosen and `options.handoff` pending, the stage makes no shell and signals no `chase`, its
//   walking view on, however many frames run.
// - Once the promise resolves, the shell is made, once.
// - Another chosen avatar never makes it, the hand-off ended.
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AvatarId } from "../../src/choice/avatars";
import { createScene } from "../../src/room/scene";
import type { FigureSignal } from "../../src/room/stage";
import { FakeClock, flush, repositoryBundle } from "../helpers/room";
import type { TestWindow } from "../helpers/room";

const swapped = vi.hoisted(() => ({
  renderer: null as ((parameters: unknown) => unknown) | null,
  made: [] as string[],
}));

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return swapped.renderer ? swapped.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

// The real shell, counted as the stage makes it.
vi.mock("../../src/room/scene/chase-figures", async (importOriginal) => {
  const own = await importOriginal<typeof import("../../src/room/scene/chase-figures")>();
  return {
    ...own,
    createChaseFigures: (options: Parameters<typeof own.createChaseFigures>[0]) => {
      swapped.made.push(options.chosen);
      return own.createChaseFigures(options);
    },
  };
});

afterEach(() => {
  swapped.renderer = null;
  swapped.made = [];
});

function staged(avatar: AvatarId) {
  const { index } = repositoryBundle();
  swapped.renderer = () => ({
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: () => undefined,
    dispose: () => undefined,
  });
  const win = new JSDOM(`<main><div id="view" tabindex="0"></div></main>`, {
    url: "http://127.0.0.1:18105/",
    pretendToBeVisual: true,
  }).window as unknown as TestWindow;
  win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  // Every file's fetch stays pending: the figures keep their stand-ins, and the controller exists all the same. The
  // loader's first fetch comes just after the stage makes the controller (scene.ts), so it says the controller is there.
  let fetches = 0;
  Object.defineProperty(win, "fetch", {
    configurable: true,
    value: () => {
      fetches += 1;
      return new Promise<Response>(() => undefined);
    },
  });
  const clock = new FakeClock();
  const signals: FigureSignal[] = [];
  let end: () => void = () => undefined;
  const handoff = new Promise<void>((resolve) => (end = resolve));
  const stage = createScene({
    win,
    doc: win.document,
    clock,
    room: index,
    avatar,
    reducedMotion: false,
    select: () => undefined,
    onFrame: () => undefined,
    floor: true,
    onFigure: (s) => signals.push(s),
    handoff,
  });
  Object.defineProperty(stage.canvas, "clientWidth", { configurable: true, get: () => 960 });
  Object.defineProperty(stage.canvas, "clientHeight", { configurable: true, get: () => 600 });
  const view = win.document.getElementById("view") as HTMLElement;
  const frames = async (n: number): Promise<void> => {
    for (let k = 0; k < n; k += 1) {
      clock.advance(16);
      await flush();
    }
  };
  /** Frames until the avatars' chunk has loaded and the stage has made the controller (its import takes real time). */
  const ready = async (): Promise<void> => {
    await vi.waitFor(
      async () => {
        await frames(1);
        if (fetches === 0) throw new Error("no controller yet");
      },
      { timeout: 30_000, interval: 20 },
    );
    await frames(5);
  };
  return { stage, view, signals, frames, ready, end };
}

const chased = (signals: readonly FigureSignal[]): FigureSignal[] => signals.filter((s) => s.kind === "chase");

describe("the stage's use of chaseDue (rv-rework-025's Nit-3; B-1 (b); FR-001)", () => {
  it("makes no shell and signals no chase while the hand-off is pending, the dinosaur chosen and walking", async () => {
    const r = staged("dinosaur");
    await r.ready();
    r.stage.walk.enter(r.view);
    await r.frames(60);
    expect(swapped.made).toEqual([]);
    expect(chased(r.signals)).toEqual([]);
    r.stage.dispose();
  });

  it("makes the shell once the hand-off's promise resolves, and only once", async () => {
    const r = staged("dinosaur");
    await r.ready();
    expect(swapped.made).toEqual([]);
    r.end();
    // The promise's `then` runs before the next frame, which makes the shell.
    await flush();
    await r.frames(1);
    expect(swapped.made).toEqual(["dinosaur"]);
    r.stage.walk.enter(r.view);
    await r.frames(30);
    expect(swapped.made).toEqual(["dinosaur"]);
    r.stage.dispose();
  });

  it.each(["woman", "man", "dog"] as const)("never makes it for the %s, the hand-off ended", async (avatar) => {
    const r = staged(avatar);
    r.end();
    await r.ready();
    await r.frames(10);
    expect(swapped.made).toEqual([]);
    r.stage.dispose();
  });
});
