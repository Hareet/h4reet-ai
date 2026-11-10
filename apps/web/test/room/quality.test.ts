// T036 (spec 002; FR-042, FR-048; contracts/room-scene.md §4; research.md R-04), on a simulated frame clock: the
// controller steps quality 0 → 3 while the 5-second median frame rate is below the target (30 on a touch-primary
// device, 60 otherwise), switches to 2D below 24 frames a second for 5 s at quality 3, and never moves back up; the
// WebGL 2 check comes before the 3D chunk, which a device without it never loads; a lost context gets one restore; and
// entering 2D, by any road, sends one mode_2d.
//
// T127 (spec 004; FR-055, SC-005; Amendment B13; research.md R-28, R-35): the controller's holds, reference-counted,
// each returning its release: frames during a hold are ignored and the window restarts when the last is released, so a
// scripted load of every piece steps nothing down, and a context restore holds too; the four levels are R-35's table,
// none raising a setting over the one before, with spec 002's step to 2D unchanged; and capability() reads what ADR
// 0010's floor for studio models needs.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import {
  FLOOR_FPS,
  FRAME_WINDOW_MS,
  LOADING_CEILING_MS,
  MAX_QUALITY,
  MODEL_FLOOR,
  SCENE_WAIT_MS,
  capability,
  createQualityController,
  hasWebGL2,
  meetsModelFloor,
  targetFps,
  watchContext,
} from "../../src/room/quality";
import type { Capability, FlatReason, QualityController } from "../../src/room/quality";
import { qualitySettings } from "../../src/room/scene";
import {
  FakeClock,
  HANDOFF_LINE,
  announcer,
  button,
  enter,
  flush,
  intoRoom,
  radio,
  start,
  textOf,
} from "../helpers/room";

/** Feeds frames at `fps` for `seconds`, from `from` (ms); returns the time after the last frame. */
function feed(c: QualityController, fps: number, seconds: number, from: number): number {
  const dt = 1000 / fps;
  let t = from;
  const end = from + seconds * 1000;
  for (; t < end; t += dt) c.frame(t);
  return t;
}

function controller(target: number): { c: QualityController; steps: number[]; flats: FlatReason[] } {
  const steps: number[] = [];
  const flats: FlatReason[] = [];
  const c = createQualityController({ target, onQuality: (q) => steps.push(q), onFlat: (r) => flats.push(r) });
  return { c, steps, flats };
}

describe("the quality controller", () => {
  it("names the contract's numbers", () => {
    expect(FRAME_WINDOW_MS).toBe(5000);
    expect(FLOOR_FPS).toBe(24);
    expect(MAX_QUALITY).toBe(3);
    expect(targetFps(true)).toBe(30);
    expect(targetFps(false)).toBe(60);
  });

  it("holds quality 0 at the target", () => {
    const { c, steps, flats } = controller(60);
    feed(c, 60, 30, 0);
    expect(c.quality).toBe(0);
    expect(c.mode).toBe("3d");
    expect(steps).toEqual([]);
    expect(flats).toEqual([]);
  });

  it("allows a display's timing jitter at the target: a missed frame at 60 Hz is a whole refresh late", () => {
    const { c, steps } = controller(60);
    let t = 0;
    for (let i = 0; i < 1800; i += 1) c.frame((t += i % 2 ? 16.2 : 17.3));
    expect(steps).toEqual([]);
  });

  it("steps 0 → 1 → 2 → 3, one step per 5 s below the target, and stays at 3 above the floor", () => {
    const { c, steps, flats } = controller(60);
    let t = feed(c, 40, 4.9, 0);
    expect(c.quality).toBe(0);
    t = feed(c, 40, 0.2, t);
    expect(steps).toEqual([1]);
    expect(c.mode).toBe("reduced");
    t = feed(c, 40, 5.1, t);
    expect(steps).toEqual([1, 2]);
    t = feed(c, 40, 5.1, t);
    expect(steps).toEqual([1, 2, 3]);
    feed(c, 40, 60, t);
    expect(c.quality).toBe(3);
    expect(c.mode).toBe("reduced");
    expect(flats).toEqual([]);
  });

  it("switches to 2D below 24 frames a second for 5 s at quality 3, once", () => {
    const { c, steps, flats } = controller(30);
    let t = feed(c, 20, 15.3, 0);
    expect(steps).toEqual([1, 2, 3]);
    expect(flats).toEqual([]);
    t = feed(c, 20, 5.2, t);
    expect(flats).toEqual(["frame_floor"]);
    expect(c.mode).toBe("2d");
    feed(c, 10, 30, t);
    expect(flats).toEqual(["frame_floor"]);
    expect(steps).toEqual([1, 2, 3]);
  });

  it("never moves back up", () => {
    const { c, steps } = controller(60);
    const t = feed(c, 30, 10.4, 0);
    expect(steps).toEqual([1, 2]);
    feed(c, 120, 60, t);
    expect(c.quality).toBe(2);
    expect(steps).toEqual([1, 2]);
  });

  it("uses the device's target: 40 frames a second holds a phone, and steps a desktop down", () => {
    const phone = controller(targetFps(true));
    feed(phone.c, 40, 30, 0);
    expect(phone.steps).toEqual([]);
    const desktop = controller(targetFps(false));
    feed(desktop.c, 40, 6, 0);
    expect(desktop.steps).toEqual([1]);
  });

  it("starts a new window after the page was hidden, so the time away isn't a slow frame", () => {
    const { c, steps } = controller(60);
    let t = feed(c, 60, 3, 0);
    c.restart();
    t += 20_000;
    t = feed(c, 60, 3, t);
    c.restart();
    t += 2000;
    feed(c, 60, 3, t);
    expect(steps).toEqual([]);
  });

  it("counts a visible page under 1 frame a second as slow: it steps down, then switches to 2D", () => {
    const { c, steps, flats } = controller(60);
    feed(c, 0.5, 40, 0);
    expect(steps).toEqual([1, 2, 3]);
    expect(flats).toEqual(["frame_floor"]);
  });

  it("goes to 2D on request, once, from any quality", () => {
    const { c, flats } = controller(60);
    c.toFlat("visitor");
    c.toFlat("visitor");
    feed(c, 10, 30, 0);
    expect(flats).toEqual(["visitor"]);
    expect(c.mode).toBe("2d");
  });
});

/** About FR-078's room: the pieces a scripted load fetches, parses, and swaps. */
const PIECES = 12;

/**
 * A scripted load of every piece as the loader runs it (R-28): two at a time, frames falling to 20 a second while a
 * pair parses and swaps, then 60 a second while the next pair fetches. With `held`, each piece holds the controller
 * from its parse until two frames after its swap. Returns the time after the load.
 */
function scriptedLoad(c: QualityController, held: boolean, from: number): number {
  let t = from;
  for (let piece = 0; piece < PIECES; piece += 2) {
    const releases = held ? [c.hold(), c.hold()] : [];
    t = feed(c, 20, 2, t);
    t = feed(c, 60, 0.03, t);
    for (const release of releases) release();
    t = feed(c, 60, 0.3, t);
  }
  return t;
}

describe("the quality controller's holds (spec 004, FR-055)", () => {
  it("ignores frames during a hold, and starts a new window when it's released", () => {
    const { c, steps } = controller(60);
    let t = feed(c, 40, 4.9, 0);
    const release = c.hold();
    t = feed(c, 5, 20, t);
    expect(steps).toEqual([]);
    release();
    // Without the restart, the next frame would close the window opened before the hold, and step down at once.
    t = feed(c, 40, 4.9, t);
    expect(steps).toEqual([]);
    feed(c, 40, 0.2, t);
    expect(steps).toEqual([1]);
  });

  it("is reference-counted: frames count again only once the last hold is released, and a release counts once", () => {
    const { c, steps } = controller(60);
    const first = c.hold();
    const second = c.hold();
    let t = feed(c, 10, 10, 0);
    first();
    first();
    t = feed(c, 10, 10, t);
    expect(steps).toEqual([]);
    second();
    t = feed(c, 10, 4.9, t);
    expect(steps).toEqual([]);
    feed(c, 10, 0.2, t);
    expect(steps).toEqual([1]);
  });

  it("lets a scripted load of every piece step nothing down, where the same frames unheld would", () => {
    const unheld = controller(60);
    feed(unheld.c, 60, 30, scriptedLoad(unheld.c, false, 0));
    expect(unheld.steps.length).toBeGreaterThan(0);

    const { c, steps, flats } = controller(60);
    feed(c, 60, 30, scriptedLoad(c, true, 0));
    expect(steps).toEqual([]);
    expect(flats).toEqual([]);
    expect(c.quality).toBe(0);
  });

  it("keeps spec 002's step to 2D below 24 frames a second at quality 3, held frames aside", () => {
    const { c, steps, flats } = controller(30);
    let t = feed(c, 20, 15.3, 0);
    expect(steps).toEqual([1, 2, 3]);
    const release = c.hold();
    t = feed(c, 10, 30, t);
    expect(flats).toEqual([]);
    release();
    t = feed(c, 20, 4.9, t);
    expect(flats).toEqual([]);
    feed(c, 20, 0.3, t);
    expect(flats).toEqual(["frame_floor"]);
    expect(c.mode).toBe("2d");
  });
});

describe("R-35's four quality levels (Amendment B13)", () => {
  it("are R-35's table: label scale is textureScale, idle sway is animations", () => {
    expect([0, 1, 2, 3].map(qualitySettings)).toEqual([
      {
        pixelRatio: 2,
        // Spec 005's pixel cap (D7).
        pixelCap: 3_686_400,
        shadows: true,
        outlines: true,
        glowCards: true,
        typingFps: 15,
        faceScale: 1,
        textureScale: 1,
        animations: true,
      },
      {
        pixelRatio: 1.25,
        // Spec 005's pixel cap (D7).
        pixelCap: 2_304_000,
        shadows: true,
        outlines: true,
        glowCards: true,
        typingFps: 15,
        faceScale: 1,
        textureScale: 1,
        animations: true,
      },
      {
        pixelRatio: 1,
        // Spec 005's pixel cap (D7).
        pixelCap: 1_440_000,
        shadows: false,
        outlines: false,
        glowCards: false,
        typingFps: 8,
        faceScale: 1,
        textureScale: 1,
        animations: true,
      },
      {
        pixelRatio: 0.75,
        // Spec 005's pixel cap (D7).
        pixelCap: 921_600,
        shadows: false,
        outlines: false,
        glowCards: false,
        typingFps: 0,
        faceScale: 0.5,
        textureScale: 0.5,
        animations: false,
      },
    ]);
  });

  it("are still four, none raising a setting over the level before", () => {
    expect(MAX_QUALITY).toBe(3);
    expect(qualitySettings(-1)).toEqual(qualitySettings(0));
    expect(qualitySettings(MAX_QUALITY + 1)).toEqual(qualitySettings(MAX_QUALITY));
    for (let level = 1; level <= MAX_QUALITY; level += 1) {
      const before = qualitySettings(level - 1);
      const after = qualitySettings(level);
      for (const key of Object.keys(before) as (keyof typeof before)[]) {
        expect(Number(after[key]), `${key} at ${level}`).toBeLessThanOrEqual(Number(before[key]));
      }
    }
  });
});

describe("the WebGL 2 check", () => {
  it("is false without a webgl2 context", () => {
    const win = new JSDOM("<p>").window;
    win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
    expect(hasWebGL2(win.document as unknown as Document)).toBe(false);
  });

  it("is true with one, and releases the context it made", () => {
    const win = new JSDOM("<p>").window;
    const asked: string[] = [];
    let lost = 0;
    win.HTMLCanvasElement.prototype.getContext = ((kind: string) => {
      asked.push(kind);
      return { getExtension: () => ({ loseContext: () => (lost += 1) }) };
    }) as unknown as HTMLCanvasElement["getContext"];
    expect(hasWebGL2(win.document as unknown as Document)).toBe(true);
    expect(asked).toEqual(["webgl2"]);
    expect(lost).toBe(1);
  });

  it("is false when asking throws", () => {
    const win = new JSDOM("<p>").window;
    win.HTMLCanvasElement.prototype.getContext = (() => {
      throw new Error("blocked");
    }) as unknown as HTMLCanvasElement["getContext"];
    expect(hasWebGL2(win.document as unknown as Document)).toBe(false);
  });
});

describe("the capability floor for studio models (spec 004, R-28)", () => {
  /** WebGL's MAX_TEXTURE_SIZE. */
  const MAX_TEXTURE_SIZE = 0x0d33;

  /**
   * A jsdom window whose canvases give a WebGL 2 context reporting `maxTextureSize`, or throwing when it's read
   * ("unreadable"), give none, or throw when asked, recording each call.
   */
  function windowWith(maxTextureSize: number | null | "throws" | "unreadable"): { win: Window; calls: string[] } {
    const win = new JSDOM("<p>").window;
    const calls: string[] = [];
    win.HTMLCanvasElement.prototype.getContext = ((kind: string, attributes: unknown) => {
      calls.push(`getContext ${kind} ${JSON.stringify(attributes)}`);
      if (maxTextureSize === "throws") throw new Error("blocked");
      if (maxTextureSize === null) return null;
      return {
        MAX_TEXTURE_SIZE,
        getParameter: (name: number) => {
          calls.push(`getParameter ${name}`);
          if (maxTextureSize === "unreadable") throw new Error("lost");
          return name === MAX_TEXTURE_SIZE ? maxTextureSize : null;
        },
        getExtension: (name: string) => {
          calls.push(`getExtension ${name}`);
          return { loseContext: () => calls.push("loseContext") };
        },
      };
    }) as unknown as HTMLCanvasElement["getContext"];
    return { win: win as unknown as Window, calls };
  }

  it("reads the largest texture size before releasing the context it made, and the device memory where given", () => {
    const { win, calls } = windowWith(8192);
    expect(capability(win)).toEqual({ webgl2: true, maxTextureSize: 8192, deviceMemory: null });
    expect(calls).toEqual([
      'getContext webgl2 {"failIfMajorPerformanceCaveat":true}',
      `getParameter ${MAX_TEXTURE_SIZE}`,
      "getExtension WEBGL_lose_context",
      "loseContext",
    ]);
    Object.defineProperty(win.navigator, "deviceMemory", { configurable: true, value: 2 });
    expect(capability(win)).toEqual({ webgl2: true, maxTextureSize: 8192, deviceMemory: 2 });
  });

  it("reads no WebGL 2 where there is none, or where asking throws", () => {
    expect(capability(windowWith(null).win)).toEqual({ webgl2: false, maxTextureSize: 0, deviceMemory: null });
    expect(capability(windowWith("throws").win)).toEqual({ webgl2: false, maxTextureSize: 0, deviceMemory: null });
  });

  it("keeps spec 002's WebGL 2 verdict where the context won't give its texture size: 0, below the floor", () => {
    // The room reads its WebGL 2 check through capability() (R-28 step 1), so the size failing never sends it to 2D.
    const { win, calls } = windowWith("unreadable");
    const read = capability(win);
    // The context it made is released all the same.
    expect(calls).toEqual([
      'getContext webgl2 {"failIfMajorPerformanceCaveat":true}',
      `getParameter ${MAX_TEXTURE_SIZE}`,
      "getExtension WEBGL_lose_context",
      "loseContext",
    ]);
    expect(read).toEqual({ webgl2: true, maxTextureSize: 0, deviceMemory: null });
    expect(read.webgl2).toBe(hasWebGL2(win.document));
    expect(meetsModelFloor(read)).toBe(false);
  });

  it("is ADR 0010's floor: WebGL 2, at least 4 GB where the browser reports it, and 4096-pixel textures", () => {
    expect(MODEL_FLOOR).toEqual({ deviceMemory: 4, maxTextureSize: 4096 });
    const at = (webgl2: boolean, maxTextureSize: number, deviceMemory: number | null): Capability => ({
      webgl2,
      maxTextureSize,
      deviceMemory,
    });
    expect(meetsModelFloor(at(true, 4096, null))).toBe(true);
    expect(meetsModelFloor(at(true, 4096, 4))).toBe(true);
    expect(meetsModelFloor(at(true, 16384, 8))).toBe(true);
    expect(meetsModelFloor(at(true, 4096, 2))).toBe(false);
    expect(meetsModelFloor(at(true, 2048, 8))).toBe(false);
    expect(meetsModelFloor(at(false, 16384, 8))).toBe(false);
  });
});

describe("a lost context", () => {
  it("gets one restore: restored in time, the room stays; lost again, or not restored, it goes to 2D", () => {
    const clock = new FakeClock();
    const win = new JSDOM("<canvas></canvas><canvas></canvas>").window;
    const [canvas, other] = [...win.document.querySelectorAll("canvas")] as unknown as EventTarget[];
    if (!canvas || !other) throw new Error("no canvases");
    const lost = (): Event => new win.Event("webglcontextlost", { cancelable: true });
    let failed = 0;
    watchContext(canvas, clock, () => (failed += 1));
    const first = lost();
    canvas.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    clock.advance(1000);
    canvas.dispatchEvent(new win.Event("webglcontextrestored"));
    clock.advance(10_000);
    expect(failed).toBe(0);
    canvas.dispatchEvent(lost());
    expect(failed).toBe(1);

    let otherFailed = 0;
    watchContext(other, clock, () => (otherFailed += 1));
    other.dispatchEvent(lost());
    clock.advance(2999);
    expect(otherFailed).toBe(0);
    clock.advance(1);
    expect(otherFailed).toBe(1);
  });

  /**
   * A room's frame loop on a fake clock, feeding a desktop's controller, its context watched with or without the
   * controller's hold: 4.9 s at 40 frames a second, then the context lost for 2 s at 5 a second, then restored.
   */
  function restore(held: boolean): { clock: FakeClock; steps: number[] } {
    const clock = new FakeClock();
    const win = new JSDOM("<canvas></canvas>").window;
    const canvas = win.document.querySelector("canvas") as unknown as EventTarget;
    const { c, steps } = controller(60);
    if (held) watchContext(canvas, clock, () => undefined, { hold: c.hold.bind(c) });
    else watchContext(canvas, clock, () => undefined);
    const loop = (time: number): void => {
      c.frame(time);
      clock.requestFrame(loop);
    };
    clock.requestFrame(loop);
    clock.advance(4900, 25);
    canvas.dispatchEvent(new win.Event("webglcontextlost", { cancelable: true }));
    clock.advance(2000, 200);
    canvas.dispatchEvent(new win.Event("webglcontextrestored"));
    return { clock, steps };
  }

  it("holds the quality controller from the loss until two frames after the restore (spec 004, R-35)", () => {
    // Unheld, the window opened before the loss closes during it, and steps down.
    expect(restore(false).steps).toEqual([1]);

    // Held, the restore's two frames (at 25 and 50 ms after it) are ignored too, and the third opens the window,
    // which closes 5 s later, stepping down once.
    const { clock, steps } = restore(true);
    clock.advance(5050, 25);
    expect(steps).toEqual([]);
    clock.advance(25, 25);
    expect(steps).toEqual([1]);
  });

  it("lets its hold go when the room stops watching, or when the context isn't restored in time", () => {
    const clock = new FakeClock();
    const win = new JSDOM("<canvas></canvas><canvas></canvas>").window;
    const [canvas, other] = [...win.document.querySelectorAll("canvas")] as unknown as EventTarget[];
    if (!canvas || !other) throw new Error("no canvases");
    let held = 0;
    const hold = (): (() => void) => {
      held += 1;
      let released = false;
      return () => {
        if (!released) held -= 1;
        released = true;
      };
    };
    const unwatch = watchContext(canvas, clock, () => undefined, { hold });
    canvas.dispatchEvent(new win.Event("webglcontextlost", { cancelable: true }));
    expect(held).toBe(1);
    unwatch();
    expect(held).toBe(0);

    let failed = 0;
    watchContext(other, clock, () => (failed += 1), { hold });
    other.dispatchEvent(new win.Event("webglcontextlost", { cancelable: true }));
    expect(held).toBe(1);
    clock.advance(3000);
    expect(failed).toBe(1);
    expect(held).toBe(0);
  });
});

describe("the room's modes", () => {
  const twoD = (events: { kind: string }[]): number => events.filter((e) => e.kind === "mode_2d").length;

  it("starts in 2D without WebGL 2, never loading the 3D chunk, and sends one mode_2d", async () => {
    const v = start({ webgl: false });
    await flush();
    expect(v.scene.loads).toBe(0);
    await enter(v);
    expect(v.room.visit.mode).toBe("2d");
    expect(v.doc.querySelector(".flat")).not.toBeNull();
    expect(v.doc.querySelector("canvas")).toBeNull();
    expect(v.scene.loads).toBe(0);
    expect(twoD(v.events)).toBe(1);
  });

  it("loads the 3D chunk once, behind the choice, after the WebGL 2 check, and builds the scene only after Enter", async () => {
    const v = start({ webgl: true });
    await flush();
    expect(v.scene.loads).toBe(1);
    expect(v.scene.created).toHaveLength(0);
    await enter(v);
    expect(v.scene.loads).toBe(1);
    expect(v.scene.created).toHaveLength(1);
    expect(v.scene.created[0]?.avatar).toBe("dog");
    expect(v.room.visit.mode).toBe("3d");
    expect(twoD(v.events)).toBe(0);
  });

  it("falls back to 2D when the 3D chunk's import never settles, SCENE_WAIT_MS after Enter", async () => {
    const v = start({ webgl: true, sceneHangs: true });
    await flush();
    radio(v.doc, "path", "engineer").click();
    radio(v.doc, "avatar", "dog").click();
    button(v.doc, "Enter").click();
    await flush();
    expect(v.room.visit.stage).toBe("handoff");
    expect(v.doc.querySelector(".flat, canvas")).toBeNull();
    v.clock.advance(SCENE_WAIT_MS - 1);
    await flush();
    expect(v.doc.querySelector(".flat")).toBeNull();
    v.clock.advance(1);
    await v.room.settled();
    await flush();
    expect(v.room.visit.mode).toBe("2d");
    expect(v.doc.querySelector(".flat")).not.toBeNull();
    expect(textOf(announcer(v.doc))).toBe(HANDOFF_LINE);
    expect(twoD(v.events)).toBe(1);
    v.clock.advance(4500);
    expect(v.room.visit.stage).toBe("room");
  });

  it("ignores a 3D chunk that arrives after SCENE_WAIT_MS: the hand-off starts once, and the room stays 2D", async () => {
    const v = start({ webgl: true, sceneLate: true });
    await flush();
    radio(v.doc, "path", "engineer").click();
    radio(v.doc, "avatar", "dog").click();
    button(v.doc, "Enter").click();
    await flush();
    v.clock.advance(SCENE_WAIT_MS);
    await v.room.settled();
    await flush();
    expect(v.room.visit.mode).toBe("2d");
    v.scene.release?.();
    await flush();
    v.clock.advance(4500);
    await flush();
    expect(v.scene.created).toHaveLength(0);
    expect(v.room.visit).toMatchObject({ mode: "2d", stage: "room" });
    expect(v.doc.querySelectorAll(".room-offer")).toHaveLength(1);
    expect(v.doc.querySelectorAll("canvas")).toHaveLength(0);
    expect(twoD(v.events)).toBe(1);
    v.clock.advance(10_000);
    expect(v.doc.querySelectorAll(".room-offer")).toHaveLength(1);
  });

  it("ignores frames while the page is hidden, and starts a new window when it shows", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    let state: DocumentVisibilityState = "hidden";
    Object.defineProperty(v.doc, "visibilityState", { configurable: true, get: () => state });
    v.doc.dispatchEvent(new v.win.Event("visibilitychange"));
    v.clock.advance(30_000, 2000);
    expect(v.scene.quality).toEqual([]);
    state = "visible";
    v.doc.dispatchEvent(new v.win.Event("visibilitychange"));
    v.clock.advance(30_000, 16);
    expect(v.scene.quality).toEqual([]);
    expect(v.room.visit.mode).toBe("3d");
  });

  it("steps down and reaches 2D on a visible page drawing under 1 frame a second", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    v.clock.advance(40_000, 2000);
    expect(v.scene.quality).toEqual([1, 2, 3]);
    expect(v.room.visit.mode).toBe("2d");
    expect(twoD(v.events)).toBe(1);
  });

  it("falls back to 2D when the 3D chunk fails to load", async () => {
    const v = start({ webgl: true, sceneFails: true });
    await enter(v);
    expect(v.room.visit.mode).toBe("2d");
    expect(v.doc.querySelector(".flat")).not.toBeNull();
    expect(twoD(v.events)).toBe(1);
  });

  it("steps the scene's quality, then switches to 2D at the floor, keeping the visit", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const before = { ...v.room.visit };
    // 20 frames a second on a desktop: 3 steps, 5 s apart, then 2D after 5 s at quality 3.
    v.clock.advance(15_500, 50);
    expect(v.scene.quality).toEqual([1, 2, 3]);
    expect(v.room.visit).toMatchObject({ mode: "reduced", quality: 3 });
    v.clock.advance(6000, 50);
    expect(v.room.visit.mode).toBe("2d");
    expect(v.scene.disposed).toBe(1);
    expect(v.doc.querySelector("canvas")).toBeNull();
    expect(v.doc.querySelector(".flat")).not.toBeNull();
    expect(v.room.visit).toMatchObject({ stage: before.stage, path: before.path, avatar: before.avatar });
    expect(v.room.visit.resumeKept).toBe(true);
    expect(twoD(v.events)).toBe(1);
    v.clock.advance(60_000, 100);
    expect(twoD(v.events)).toBe(1);
  });

  it('switches to 2D on the visitor\'s "2D view" at any time, and never back', async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const control = button(v.doc, "2D view");
    expect(control.getAttribute("aria-disabled")).not.toBe("true");
    control.click();
    expect(v.room.visit.mode).toBe("2d");
    expect(control.getAttribute("aria-disabled")).toBe("true");
    control.click();
    v.clock.advance(30_000);
    expect(v.room.visit.mode).toBe("2d");
    expect(twoD(v.events)).toBe(1);
    expect(v.doc.activeElement).toBe(control);
  });

  it("restores a lost context once, else switches to 2D with the visit kept", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    const canvas = v.doc.querySelector("canvas");
    canvas?.dispatchEvent(new v.win.Event("webglcontextlost", { cancelable: true }));
    v.clock.advance(500);
    canvas?.dispatchEvent(new v.win.Event("webglcontextrestored"));
    v.clock.advance(5000);
    expect(v.room.visit.mode).toBe("3d");
    canvas?.dispatchEvent(new v.win.Event("webglcontextlost", { cancelable: true }));
    expect(v.room.visit.mode).toBe("2d");
    expect(v.room.visit.stage).toBe("room");
    expect(twoD(v.events)).toBe(1);
  });

  it("keeps the hand-off's length when the room drops to 2D during it", async () => {
    const v = start({ webgl: true });
    await enter(v);
    v.clock.advance(1000);
    const canvas = v.doc.querySelector("canvas");
    canvas?.dispatchEvent(new v.win.Event("webglcontextlost", { cancelable: true }));
    v.clock.advance(3000);
    expect(v.room.visit.mode).toBe("2d");
    expect(v.room.visit.stage).toBe("handoff");
    expect(v.doc.querySelector(".flat")?.getAttribute("data-handoff-frame")).toBe("2");
    v.clock.advance(500);
    expect(v.room.visit.stage).toBe("room");
  });
});

// Spec 012 (T007; FR-020; PD-7): the loader's ceiling, beside SCENE_WAIT_MS, measured from "Enter" on the room's clock.
describe("the loader's ceiling (spec 012, T007)", () => {
  it("is at most 7 s after Enter, so spec 002's SC-005 holds, and never cuts today's own waits short", () => {
    expect(LOADING_CEILING_MS).toBeLessThanOrEqual(7000);
    // SCENE_WAIT_MS for the 3D chunk, then the scene's wait_ms for the figures, 1.5 s by default (spec 009).
    expect(LOADING_CEILING_MS).toBeGreaterThanOrEqual(SCENE_WAIT_MS + 1500);
  });
});
