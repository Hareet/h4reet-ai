// T040 (spec 005; FR-001 to FR-007; SC-009; plan.md's Degraded-Mode Behavior): the layout never degrades. Fault-injection
// runs over FR-002's states, no WebGL 2, the 2D drawing failing, full screen refused, no backdrop blur, a fall to 2D at
// the frame floor while in full screen, and a lost context while in full screen. Each ends with the room filling the
// window, the HUD usable, the AI disclosure in view, the stand-in line in view while it applies, and a picture or
// flat-failed's line in the clear area, never a blank or frozen scene; and a network and beacon spy sees no request
// beyond the room's own, the event sink at most one fullscreen_entered.
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import type { StatusResult } from "../../src/room/signals/tier";
import {
  AI_DISCLOSURE,
  WALL0,
  button,
  flush,
  intoRoom,
  start,
  stubFullscreen,
  stubViewport,
  talkLog,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

const fixture = () => compose(goodTree(), noPolicy(), { mode: "strict", drafts: false });
const site = (index: RoomIndex): RoomIndex => ({ ...index, live: { ...index.live, source: "site" } });

/** Every run's end (SC-009). */
async function expectWhole(v: Visit, what: string): Promise<void> {
  const root = v.doc.documentElement;
  expect(["column", "dock"], `${what}: the layout`).toContain(root.getAttribute("data-hud"));
  expect(root.style.getPropertyValue("--clear-w"), what).not.toBe("");
  expect(v.doc.querySelector(".room-block"), what).not.toBeNull();
  const strip = v.doc.getElementById("ai-disclosure");
  expect(textOf(strip), what).toBe(AI_DISCLOSURE);
  expect(strip?.closest("[hidden], [inert], [aria-hidden='true']"), what).toBeNull();
  const standIn = v.doc.querySelector(".room-stand-in");
  if (standIn && textOf(standIn) !== "") expect(standIn.closest("[hidden], [inert]"), what).toBeNull();
  for (const part of v.doc.querySelectorAll(".hud-bar, .hud-panels, .room-list, .talk"))
    expect(part.hasAttribute("inert"), `${what}: ${part.className}`).toBe(false);
  const view = v.doc.querySelector(".room-stage-view");
  expect(view?.querySelector("canvas, .flat, .room-flat-failed"), `${what}: the picture`).not.toBeNull();
  expect(view?.querySelector(".room-loading"), what).toBeNull();
  if (v.room.visit.mode !== "2d") {
    const frames = v.scene.frames;
    v.clock.advance(100);
    expect(v.scene.frames, `${what}: frames`).toBeGreaterThan(frames);
  }
  const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
  if (!box) throw new Error(`${what}: no text box`);
  const before = talkLog(v.doc).childElementCount;
  box.value = "Is anyone there?";
  button(v.doc, "Send").click();
  await flush();
  expect(talkLog(v.doc).childElementCount, `${what}: the conversation answers`).toBeGreaterThan(before);
  // Nothing went to the network but the room's own status, and no beacon; at most one fullscreen_entered.
  expect(
    v.spies.network.filter((r) => r !== "fetch /api/status"),
    what,
  ).toEqual([]);
  expect(v.spies.beacons, what).toEqual([]);
  expect(v.events.filter((e) => e.kind === "fullscreen_entered").length, what).toBeLessThanOrEqual(1);
}

const answer = (v: Visit, body: Record<string, unknown>): StatusResult => ({
  ok: true,
  started: v.clock.now() - 150,
  ended: v.clock.now(),
  endedWall: WALL0 + v.clock.now(),
  answer: body as never,
});

async function room(o: { webgl?: boolean; index?: RoomIndex; screen?: { w: number; h: number } } = {}) {
  const viewport = stubViewport(o.screen ?? { w: 1280, h: 720 });
  const v = start({ webgl: o.webgl ?? true, viewport: viewport.factory, ...(o.index ? { room: o.index } : {}) });
  const fs = stubFullscreen(v);
  await intoRoom(v);
  return { v, fs, viewport };
}

describe("the layout under every fault (spec 005, T040)", () => {
  it.each([
    ["the local tier off", { local_tier: "down", state: "normal", cause_now: null }],
    ["the budget spent", { local_tier: "up", state: "degraded", cause_now: "meter_at_ceiling" }],
    ["the kill switch tripped", { local_tier: "up", state: "degraded", cause_now: "kill_switch_tripped" }],
    ["the kill switch's state unknown", { local_tier: "up", state: "unknown", cause_now: null }],
  ] as const)("fills the window with the HUD usable with %s", async (what, body) => {
    const { v } = await room({ index: site(fixture().index) });
    v.room.live.complete(answer(v, body));
    await expectWhole(v, what);
  });

  it("fills the window with the live source off, and with the tier unknown after a failure", async () => {
    const off = await room({ index: fixture().index });
    await expectWhole(off.v, "the live source off");
    const failed = await room({ index: site(fixture().index) });
    failed.v.room.live.complete({
      ok: false,
      started: failed.v.clock.now() - 5_000,
      ended: failed.v.clock.now(),
      endedWall: WALL0 + failed.v.clock.now(),
      why: "network",
    });
    expect(failed.v.room.live.tier.tier).toBe("unknown");
    await expectWhole(failed.v, "the tier unknown");
  });

  it("fills the window in 2D with no WebGL 2, on a wide window and a phone held upright", async () => {
    for (const screen of [
      { w: 1280, h: 720 },
      { w: 390, h: 844 },
    ]) {
      const { v } = await room({ webgl: false, screen });
      expect(v.room.visit.mode).toBe("2d");
      expect(v.doc.querySelector(".room-stage-view")?.getAttribute("data-stage")).toBe("2d");
      expect(v.doc.querySelector<HTMLElement>("button.room-walk")?.hidden).toBe(true);
      await expectWhole(v, `no WebGL 2 at ${screen.w} × ${screen.h}`);
    }
  });

  it("shows flat-failed's line in the clear area when the drawing can't be drawn", async () => {
    const { index } = fixture();
    const viewBox = [0, 0, Number.NaN, 200] as unknown as RoomIndex["flat"]["view_box"];
    const { v } = await room({ webgl: false, index: { ...index, flat: { ...index.flat, view_box: viewBox } } });
    expect(v.doc.querySelector(".room-flat-failed")).not.toBeNull();
    await expectWhole(v, "the drawing failing");
  });

  it("keeps the room as it was when full screen is refused", async () => {
    const viewport = stubViewport({ w: 1280, h: 720 });
    const v = start({ webgl: true, viewport: viewport.factory });
    stubFullscreen(v, { refuse: true });
    await intoRoom(v);
    button(v.doc, "Full screen").click();
    await flush();
    await expectWhole(v, "full screen refused");
    expect(v.events.filter((e) => e.kind === "fullscreen_entered")).toEqual([]);
  });

  it("lays the HUD out where the browser draws no backdrop blur, the tint alone carrying it", async () => {
    const { v } = await room();
    Object.defineProperty(v.win, "CSS", { configurable: true, value: { supports: () => false } });
    await expectWhole(v, "no backdrop blur");
  });

  it("stays in full screen and fills the screen in 2D when the frame rate falls to the floor there", async () => {
    const { v, fs } = await room({ screen: { w: 1920, h: 1200 } });
    button(v.doc, "Full screen").click();
    await flush();
    expect(fs.asked).toEqual([{ navigationUI: "hide" }]);
    const box = v.doc.querySelector<HTMLInputElement>("#talk-text") as HTMLInputElement;
    box.value = "kept";
    // Frames far under the floor, until the controller takes the room to 2D.
    for (let k = 0; k < 2000 && v.room.visit.mode !== "2d"; k += 1) v.clock.advance(100, 100);
    expect(v.room.visit.mode).toBe("2d");
    expect(fs.asked).toEqual([{ navigationUI: "hide" }]);
    expect(v.doc.querySelector(".room-stage-view")?.getAttribute("data-stage")).toBe("2d");
    expect(box.value).toBe("kept");
    await expectWhole(v, "the floor in full screen");
  });

  it("stays in full screen through a lost context, the room going to 2D", async () => {
    const { v, fs } = await room({ screen: { w: 1920, h: 1200 } });
    button(v.doc, "Full screen").click();
    await flush();
    const canvas = v.scene.stage?.canvas;
    if (!canvas) throw new Error("no canvas");
    canvas.dispatchEvent(new v.win.Event("webglcontextlost", { cancelable: true }));
    for (let k = 0; k < 100 && v.room.visit.mode !== "2d"; k += 1) v.clock.advance(100);
    expect(v.room.visit.mode).toBe("2d");
    expect(fs.asked).toEqual([{ navigationUI: "hide" }]);
    await expectWhole(v, "a lost context in full screen");
  });
});
