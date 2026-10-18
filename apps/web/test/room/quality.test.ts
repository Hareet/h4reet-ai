// T036 (spec 002; FR-042, FR-048; contracts/room-scene.md §4; research.md R-04), on a simulated frame clock: the
// controller steps quality 0 → 3 while the 5-second median frame rate is below the target (30 on a touch-primary
// device, 60 otherwise), switches to 2D below 24 frames a second for 5 s at quality 3, and never moves back up; the
// WebGL 2 check comes before the 3D chunk, which a device without it never loads; a lost context gets one restore; and
// entering 2D, by any road, sends one mode_2d.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import {
  FLOOR_FPS,
  FRAME_WINDOW_MS,
  MAX_QUALITY,
  SCENE_WAIT_MS,
  createQualityController,
  hasWebGL2,
  targetFps,
  watchContext,
} from "../../src/room/quality";
import type { FlatReason, QualityController } from "../../src/room/quality";
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
