// T027 (spec 012; FR-001 to FR-009; SC-007; User Story 5): the loader never holds the room back. Fault-injection runs,
// end to end through startRoom: every file slow past the ceiling; a stall with no file ending; every studio file
// failing; the 3D chunk late, and failing; a device below ADR 0010's floor; no WebGL 2; a lost context while the loader
// shows (the frame floor can't fall inside the ceiling: loading-degraded.test.ts holds the bound); the loader's view
// throwing; no room text; the page hidden while it shows; the stacked layout; and each of the server's states. Each run
// ends with the hand-off started within 7 seconds of "Enter", the AI disclosure in view, the stand-in line in view
// while it applies, no loader left, the room's motion released, and the room usable; and the spies see no request
// beyond the room's own status but at most one loading_cut_short.
import { describe, expect, it } from "vitest";

import { assetEvent } from "../../src/asset-events";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { CONTEXT_RESTORE_MS, LOADING_CEILING_MS, SCENE_WAIT_MS } from "../../src/room/quality";
import type { StatusResult } from "../../src/room/signals/tier";
import type { ExpectedFile, SceneModule, SceneOptions } from "../../src/room/stage";
import {
  AI_DISCLOSURE,
  WALL0,
  button,
  flush,
  radio,
  roomIndex,
  setHidden,
  start,
  stubViewport,
  talkLog,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";

const FILES: ExpectedFile[] = [
  { asset: "fx-desk", bytes: 600 },
  { asset: "fx-sign", bytes: 400 },
  { asset: "fx-lamp", bytes: 200 },
];
const options = (v: Visit): SceneOptions | undefined => v.scene.created.at(-1);
const end = (v: Visit, asset: string, outcome: "loaded" | "failed" | "skipped" | "retried"): void =>
  options(v)?.assets?.(assetEvent({ asset, outcome, ms: 10, bytes: 100, mode: "3d" }));

/** Presses Enter, and notes the clock's time then. */
async function press(v: Visit): Promise<number> {
  await flush();
  radio(v.doc, "path", "engineer").click();
  radio(v.doc, "avatar", "dog").click();
  const at = v.clock.now();
  button(v.doc, "Enter").click();
  await flush();
  return at;
}

/** Steps the clock in 100 ms steps, letting promises settle, until the hand-off has started or `limit` has passed;
 *  the time it started at, from Enter. */
async function untilHandoff(v: Visit, from: number, limit = LOADING_CEILING_MS + 1000): Promise<number | null> {
  const started = (): boolean =>
    v.scene.handoff.length > 0 || /The twin hands you a paper/.test(textOf(v.doc.querySelector('[role="status"]')));
  for (let t = v.clock.now() - from; t <= limit; t += 100) {
    if (started()) return v.clock.now() - from;
    v.clock.advance(100);
    await flush();
  }
  return started() ? v.clock.now() - from : null;
}

/** Every run's end (SC-007). */
async function expectWhole(v: Visit, from: number, what: string): Promise<void> {
  const at = await untilHandoff(v, from);
  expect(at, `${what}: the hand-off started`).not.toBeNull();
  expect(at ?? Infinity, `${what}: within the ceiling`).toBeLessThanOrEqual(LOADING_CEILING_MS);
  const strip = v.doc.getElementById("ai-disclosure");
  expect(textOf(strip), what).toBe(AI_DISCLOSURE);
  expect(strip?.closest("[hidden], [inert], [aria-hidden='true']"), what).toBeNull();
  // Spec 028 (T-A06, FR-012, FR-015; plan.md §R-B8): the stand-in line is no longer on the stage; "Around the room"
  // keeps it for a screen reader.
  expect(v.doc.querySelector(".room-stand-in"), what).toBeNull();
  const line = v.doc.querySelector('.room-around [data-line="twin"]');
  expect(textOf(line), what).not.toBe("");
  // rv-028a-4's A4-1 (T-INT): and a screen reader reaches it (FR-015).
  expect(line?.closest("[hidden], [inert], [aria-hidden='true']") ?? null, what).toBeNull();
  // The hand-off to its end, then the offer answered: the room is the visitor's.
  v.clock.advance(5000);
  await flush();
  button(v.doc, "Keep it for later").click();
  await flush();
  expect(v.doc.querySelector(".room-loader"), `${what}: no loader left`).toBeNull();
  expect(v.doc.documentElement.hasAttribute("data-loading"), what).toBe(false);
  if (v.doc.visibilityState !== "hidden") expect(v.room.motion.animate || v.room.motion.reducedMotion, what).toBe(true);
  const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
  if (!box) throw new Error(`${what}: no text box`);
  const before = talkLog(v.doc).childElementCount;
  box.value = "Is anyone there?";
  button(v.doc, "Send").click();
  await flush();
  expect(talkLog(v.doc).childElementCount, `${what}: the conversation answers`).toBeGreaterThan(before);
  expect(
    v.spies.network.filter((r) => r !== "fetch /api/status"),
    what,
  ).toEqual([]);
  expect(v.spies.beacons, what).toEqual([]);
  expect(v.events.filter((e) => (e.kind as string) === "loading_cut_short").length, what).toBeLessThanOrEqual(1);
}

describe("the loader under every fault (T027)", () => {
  it("opens the room at the ceiling with every file slow past it", async () => {
    const v = start({ webgl: true });
    v.scene.expected = Promise.resolve(FILES);
    const from = await press(v);
    for (const f of FILES) end(v, f.asset, "retried");
    await expectWhole(v, from, "every file slow");
  });

  it("opens the room at the ceiling with the stage's list stalled, no file ending", async () => {
    const v = start({ webgl: true });
    v.scene.expected = new Promise(() => undefined);
    await expectWhole(v, await press(v), "a stall");
  });

  it("opens the room at once with every studio file failing", async () => {
    const v = start({ webgl: true });
    v.scene.expected = Promise.resolve(FILES);
    const from = await press(v);
    for (const f of FILES) end(v, f.asset, "failed");
    await flush();
    const at = await untilHandoff(v, from);
    expect(at).toBeLessThan(1000);
    await expectWhole(v, from, "every file failing");
  });

  it("goes to 2D at SCENE_WAIT_MS with the 3D chunk late, and when it fails after Enter", async () => {
    const late = start({ webgl: true, sceneHangs: true });
    const from = await press(late);
    await expectWhole(late, from, "the 3D chunk late");
    expect(late.room.visit.mode).toBe("2d");
    expect(SCENE_WAIT_MS).toBeLessThan(LOADING_CEILING_MS);
    let fail = (): void => undefined;
    const failing = start({
      webgl: true,
      loadScene: () => new Promise<SceneModule>((_, reject) => (fail = () => reject(new Error("no chunk")))),
    });
    const at = await press(failing);
    fail();
    await expectWhole(failing, at, "the 3D chunk failing");
    expect(failing.room.visit.mode).toBe("2d");
  });

  it("gives way when the steps end below ADR 0010's floor, every file skipped", async () => {
    const v = start({ webgl: true });
    v.scene.expected = Promise.resolve(FILES);
    v.scene.onCreate = (o) => {
      for (const f of FILES)
        o.assets?.(assetEvent({ asset: f.asset, outcome: "skipped", ms: 0, bytes: 0, mode: "3d" }));
    };
    const from = await press(v);
    expect(await untilHandoff(v, from)).toBeLessThan(1000);
    await expectWhole(v, from, "below the floor");
  });

  it("shows no loader without WebGL 2, and starts the 2D hand-off at once", async () => {
    const v = start({ webgl: false });
    const from = await press(v);
    expect(v.doc.querySelector(".room-loader")).toBeNull();
    expect(await untilHandoff(v, from)).toBe(0);
    await expectWhole(v, from, "no WebGL 2");
  });

  it("gives way at once on a lost context that doesn't come back while it shows", async () => {
    const v = start({ webgl: true });
    v.scene.expected = Promise.resolve(FILES);
    const from = await press(v);
    v.scene.stage?.canvas.dispatchEvent(new v.win.Event("webglcontextlost", { cancelable: true }));
    v.clock.advance(CONTEXT_RESTORE_MS);
    await flush();
    expect(v.room.visit.mode).toBe("2d");
    await expectWhole(v, from, "a lost context");
  });

  it("goes on without a view that throws", async () => {
    const v = start({
      webgl: true,
      loadingView: () => {
        throw new Error("the view failed");
      },
    });
    v.scene.expected = Promise.resolve(FILES);
    await expectWhole(v, await press(v), "the view throwing");
  });

  it("ends the text's step at once with no room text", async () => {
    const v = start({ webgl: true, withoutRoomData: true });
    v.scene.expected = Promise.resolve(FILES);
    const from = await press(v);
    for (const f of FILES) end(v, f.asset, "loaded");
    await flush();
    expect(await untilHandoff(v, from)).toBeLessThan(1000);
    await expectWhole(v, from, "no room text");
  });

  it("opens the room at the ceiling with the page hidden while it shows, the hints still", async () => {
    const v = start({ webgl: true });
    v.scene.expected = Promise.resolve(FILES);
    const from = await press(v);
    v.clock.advance(0);
    const hint = textOf(v.doc.querySelector(".room-loader-hint"));
    setHidden(v.win, true);
    v.clock.advance(6500);
    expect(textOf(v.doc.querySelector(".room-loader-hint"))).toBe(hint);
    setHidden(v.win, false);
    await expectWhole(v, from, "the page hidden");
  });

  it("opens the room at the ceiling in the stacked layout", async () => {
    const viewport = stubViewport({ w: 320, h: 256 });
    const v = start({ webgl: true, viewport: viewport.factory });
    v.scene.expected = Promise.resolve(FILES);
    const from = await press(v);
    expect(v.doc.documentElement.getAttribute("data-hud")).toBe("stacked");
    expect(v.doc.querySelector(".room-loader")).not.toBeNull();
    await expectWhole(v, from, "the stacked layout");
  });

  const site = (index: RoomIndex): RoomIndex => ({ ...index, live: { ...index.live, source: "site" } });
  const answer = (v: Visit, body: Record<string, unknown>): StatusResult => ({
    ok: true,
    started: v.clock.now() - 150,
    ended: v.clock.now(),
    endedWall: WALL0 + v.clock.now(),
    answer: body as never,
  });
  it.each([
    ["the local tier off", { local_tier: "down", state: "normal", cause_now: null }],
    ["the budget spent", { local_tier: "up", state: "degraded", cause_now: "meter_at_ceiling" }],
    ["the kill switch degraded", { local_tier: "up", state: "degraded", cause_now: "kill_switch_tripped" }],
    ["the kill switch unknown", { local_tier: "up", state: "unknown", cause_now: null }],
  ] as const)("opens the room as at any other time with %s", async (what, body) => {
    const v = start({ webgl: true, room: site(roomIndex()) });
    v.scene.expected = Promise.resolve(FILES);
    const from = await press(v);
    v.room.live.complete(answer(v, body));
    await expectWhole(v, from, what);
  });

  it("opens the room as at any other time with the live source off, and the tier unknown after a failure", async () => {
    const off = start({ webgl: true });
    off.scene.expected = Promise.resolve(FILES);
    await expectWhole(off, await press(off), "the live source off");
    const failed = start({ webgl: true, room: site(roomIndex()) });
    failed.scene.expected = Promise.resolve(FILES);
    const from = await press(failed);
    failed.room.live.complete({
      ok: false,
      started: failed.clock.now() - 5_000,
      ended: failed.clock.now(),
      endedWall: WALL0 + failed.clock.now(),
      why: "network",
    });
    await expectWhole(failed, from, "the tier unknown");
  });
});
