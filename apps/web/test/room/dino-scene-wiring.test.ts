// T-B05 (spec 028; FR-019 to FR-021; plan.md R-B3, R-B5, R-2): the dinosaur's scene wired into the room.
// - The stage (scene.ts, on the repository's room with a stand-in renderer, as chase-stage.test.ts stages it) makes the
//   scene's adapter once, only in a dinosaur visit, only after the hand-off has ended; never for the woman, the man,
//   or the dog. Its `call` reports `dino-call` and its `left` reports `dino-left` with who left, each as the stage's
//   figure signal.
// - The room (app.ts's figure signal) says `figures.dino_call` at `dino-call`, and `figures.left_both` or
//   `figures.left_twin` at `dino-left`, in its polite live region.
// - R-2: once the bicycle's pictures ride in the carrier, the highlight's draws for its placement hold none of them
//   (bundle3d.ts's memberDraws reads the placement's own pictures), so nothing borders a bicycle that has left.
import { JSDOM } from "jsdom";
import { Group, Mesh, MeshBasicMaterial, BoxGeometry, Object3D } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AvatarId } from "../../src/choice/avatars";
import { createScene } from "../../src/room/scene";
import { memberDraws } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { createDinoFigures } from "../../src/room/scene/dino-scene-figures";
import type { DinoAvatars } from "../../src/room/scene/dino-scene-figures";
import type { FigureSignal } from "../../src/room/stage";
import { announcer, FakeClock, flush, intoRoom, repositoryBundle, start, textOf } from "../helpers/room";
import type { TestWindow, Visit } from "../helpers/room";
import { DT, LEAVE } from "../helpers/dino-scene";

const made = vi.hoisted(() => ({
  renderer: null as ((parameters: unknown) => unknown) | null,
  scenes: [] as { chosen: string; call: () => void; left: (who: "both" | "twin") => void }[],
}));

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
      made.scenes.push({ chosen: options.chosen, call: options.call, left: options.left });
      return own.createDinoFigures(options);
    },
  };
});

afterEach(() => {
  made.renderer = null;
  made.scenes = [];
});

function staged(avatar: AvatarId) {
  const { index } = repositoryBundle();
  made.renderer = () => ({
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
  const frames = async (n: number): Promise<void> => {
    for (let k = 0; k < n; k += 1) {
      clock.advance(16);
      await flush();
    }
  };
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
  return { stage, signals, frames, ready, end };
}

describe("the stage makes the scene (FR-019)", () => {
  it("once in a dinosaur visit, only after the hand-off ends", async () => {
    expect(repositoryBundle().scene.figures.leave).toBeDefined();
    const r = staged("dinosaur");
    await r.ready();
    await r.frames(30);
    expect(made.scenes).toEqual([]);
    r.end();
    await flush();
    await r.frames(30);
    expect(made.scenes.map((s) => s.chosen)).toEqual(["dinosaur"]);
    r.stage.dispose();
  }, 60_000);

  it.each(["woman", "man", "dog"] as const)(
    "never for the %s",
    async (avatar) => {
      const r = staged(avatar);
      r.end();
      await r.ready();
      await r.frames(30);
      expect(made.scenes).toEqual([]);
      r.stage.dispose();
    },
    60_000,
  );

  it("reports the call and the left line as figure signals, by who left", async () => {
    const r = staged("dinosaur");
    r.end();
    await r.ready();
    await r.frames(5);
    const made1 = made.scenes[0];
    if (!made1) throw new Error("no scene");
    made1.call();
    made1.left("both");
    made1.left("twin");
    expect(r.signals.filter((s) => s.kind === "dino-call" || s.kind === "dino-left")).toEqual([
      { kind: "dino-call" },
      { kind: "dino-left", who: "both" },
      { kind: "dino-left", who: "twin" },
    ]);
    r.stage.dispose();
  }, 60_000);
});

function signal(v: Visit, s: FigureSignal): void {
  const options = v.scene.created.at(-1);
  if (!options) throw new Error("no 3D stage was made");
  options.onFigure?.(s);
}

describe("the room's live region (FR-020, FR-021)", () => {
  it("says the call, then the left line for both, or for the twin alone", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    signal(v, { kind: "dino-call" });
    await flush();
    expect(textOf(announcer(v.doc))).toBe("There is a dinosaur in the room!");
    signal(v, { kind: "dino-left", who: "both" });
    await flush();
    expect(textOf(announcer(v.doc))).toBe("The twin and the dog took the bicycle and left.");
    signal(v, { kind: "dino-left", who: "twin" });
    await flush();
    expect(textOf(announcer(v.doc))).toBe("The twin took the bicycle and left.");
  });
});

describe("the bicycle's highlight once it is taken (R-2)", () => {
  it("draws none of its pictures once they ride in the carrier", () => {
    const root = new Object3D();
    const twinNode = new Object3D();
    twinNode.position.set(0.66, 0, 0.469);
    const twin = new Group();
    twinNode.add(twin);
    root.add(twinNode);
    const bicycle = new Object3D();
    const standin = new Group();
    standin.name = "standin";
    standin.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    bicycle.add(standin);
    root.add(bicycle);
    root.updateMatrixWorld(true);
    const room = { placements: new Map([[LEAVE.takes, bicycle]]) } as unknown as Room3D;
    expect(memberDraws(room, [LEAVE.takes])).toHaveLength(1);
    const avatars: DinoAvatars = {
      shows: (id) => id !== "dog",
      pictureOf: (id) => (id === "twin" ? twin : null),
      legsOf: () => ({}) as never,
      clipOf: () => null,
      dogPlays: () => undefined,
      twinActivity: () => undefined,
      stride: () => undefined,
      twinWave: () => undefined,
    };
    const figures = createDinoFigures({
      leave: LEAVE,
      avatars,
      bicycle,
      root,
      chosen: "dinosaur",
      handedOff: () => true,
      callSeconds: () => 0.1,
      call: () => undefined,
      left: () => undefined,
    });
    const motion = { animate: true, paused: false, level: 0, reduced: false };
    for (let k = 0; k < 60 * 30 && figures.scene.phase !== "take"; k += 1) figures.frame(DT, motion);
    figures.frame(DT, motion);
    expect(figures.scene.phase).toBe("take");
    expect(memberDraws(room, [LEAVE.takes])).toEqual([]);
  });
});
