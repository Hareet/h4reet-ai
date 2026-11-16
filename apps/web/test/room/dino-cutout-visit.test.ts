// T-B06 (spec 028; FR-019, FR-025, FR-032; Q11; User Story 6's scenario 1): a dinosaur visit on the repository's room,
// whose bundle doesn't carry the dinosaur's model (its cut-out shows), is as a woman's or man's: the scene's director
// stays idle, no room's dog file is fetched and no room's dog shows, the twin's picture stays at its place, no "Eat"
// tile is offered, and spec 024's off state is as it was (no Eat box reserved, no `eat` on the stage). Staged on the
// real 3D stage with a stand-in renderer, as chase-stage.test.ts stages it.
// premise-028 (spec 028, page Q49; probe-dino.md §4 T-c): the bundle without the model is built on purpose, the
// repository's part with `avatars.dinosaur` taken out, and the stage draws it (`virtual:room-scene`, as
// eat-model.test.ts swaps it), since his intake (a556a933) puts the model in the repository.
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { createScene } from "../../src/room/scene";
import { DOG_NODE } from "../../src/room/scene/avatars";
import type { DinoFigures } from "../../src/room/scene/dino-scene-figures";
import { FakeClock, flush, repositoryBundle } from "../helpers/room";
import type { TestWindow } from "../helpers/room";

const made = vi.hoisted(() => ({
  renderer: null as ((parameters: unknown) => unknown) | null,
  scenes: [] as DinoFigures[],
}));

/** The repository's 3D part without the dinosaur's model. */
const withoutModel = (part: RoomScene): RoomScene =>
  ({
    ...part,
    avatars: Object.fromEntries(Object.entries(part.avatars).filter(([id]) => id !== "dinosaur")),
  }) as RoomScene;

const swapped = vi.hoisted(() => ({ part: null as RoomScene | null }));

vi.mock("virtual:room-scene", async (importOriginal) => {
  const own = await importOriginal<{ default: RoomScene }>();
  return {
    get default() {
      return swapped.part ?? own.default;
    },
  };
});

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return made.renderer ? made.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

vi.mock("../../src/room/scene/dino-scene-figures", async (importOriginal) => {
  const own = await importOriginal<typeof import("../../src/room/scene/dino-scene-figures")>();
  return {
    ...own,
    createDinoFigures: (options: Parameters<typeof own.createDinoFigures>[0]) => {
      const figures = own.createDinoFigures(options);
      made.scenes.push(figures);
      return figures;
    },
  };
});

afterEach(() => {
  made.renderer = null;
  made.scenes = [];
  swapped.part = null;
});

describe("a dinosaur visit with its cut-out (Q11; FR-019, FR-025)", () => {
  it("runs no scene, fetches and shows no room's dog, keeps the twin at its place, and offers no tile", async () => {
    const { scene: repo, index } = repositoryBundle();
    const part = (swapped.part = withoutModel(repo));
    expect(part.avatars.dinosaur).toBeUndefined();
    expect(part.figures.leave).toBeDefined();
    let drawn: import("three").Scene | null = null;
    made.renderer = () => ({
      autoClear: true,
      outputColorSpace: "",
      shadowMap: { enabled: true },
      setPixelRatio: () => undefined,
      setSize: () => undefined,
      initTexture: () => undefined,
      render: (scene: import("three").Scene) => {
        if (scene.name === "") drawn ??= scene;
      },
      dispose: () => undefined,
    });
    const win = new JSDOM(`<main><div id="view" tabindex="0"></div></main>`, {
      url: "http://127.0.0.1:18105/",
      pretendToBeVisual: true,
    }).window as unknown as TestWindow;
    win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
    const urls: string[] = [];
    Object.defineProperty(win, "fetch", {
      configurable: true,
      value: (url: string) => {
        urls.push(url);
        return new Promise<Response>(() => undefined);
      },
    });
    const clock = new FakeClock();
    const offered: boolean[] = [];
    const stage = createScene({
      win,
      doc: win.document,
      clock,
      room: index,
      avatar: "dinosaur",
      reducedMotion: false,
      select: () => undefined,
      onFrame: () => undefined,
      floor: true,
      handoff: Promise.resolve(),
      eating: { state: () => ({ paused: false, loading: false }), available: (on) => offered.push(on) },
    });
    Object.defineProperty(stage.canvas, "clientWidth", { configurable: true, get: () => 960 });
    Object.defineProperty(stage.canvas, "clientHeight", { configurable: true, get: () => 600 });
    await vi.waitFor(
      async () => {
        clock.advance(16);
        await flush();
        if (urls.length === 0) throw new Error("no controller yet");
      },
      { timeout: 30_000, interval: 20 },
    );
    for (let k = 0; k < 60 * 8; k += 1) {
      clock.advance(16);
      await flush();
    }
    // The director: made for the dinosaur visit, idle, since the figure shows no model.
    expect(made.scenes).toHaveLength(1);
    expect(made.scenes[0]?.scene.phase).toBe("idle");
    // No room's dog file fetched, and none in the scene.
    const dogFiles = [part.avatars.dog?.model.url, ...Object.values(part.avatars.dog?.clips ?? {}).map((c) => c?.url)]
      .filter((u): u is string => u !== undefined)
      .map((u) => u.replace(/^.*?(a\/)/, "$1"));
    expect(urls.some((u) => dogFiles.some((d) => u.endsWith(d)))).toBe(false);
    if (!drawn) throw new Error("no frame drawn");
    expect((drawn as import("three").Scene).getObjectByName(DOG_NODE)?.parent ?? null).toBeNull();
    // The twin's picture as it was, and no tile; spec 024's off state.
    const twinNode = (drawn as import("three").Scene).getObjectByName(part.figures.twin);
    expect(twinNode?.children.every((c) => c.visible || c.name !== "standin")).toBe(true);
    expect(offered.includes(true)).toBe(false);
    expect(stage.protect?.eat ?? false).toBe(false);
    expect(stage.eat).toBeUndefined();
    stage.dispose();
  }, 90_000);
});
