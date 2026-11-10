// T006 (spec 012; FR-001 to FR-009, FR-011, FR-017 to FR-023, FR-049; SC-002; contracts/loading-progress.md §4): the
// loader's degraded paths, before any look (Principle I), through startRoom with the 3D stage stubbed and the room's
// clock in the test's hand. No WebGL 2 shows no loader; a fall to 2D while it shows says "The room is ready." and gives
// way at once; every part ended gives way, the hand-off waiting for spec 009's figures too; a file still loading at 7 s
// gives way at the ceiling; failed and skipped files count as ended, those heard before the stage's list too; a page
// with no room text ends that step at once; a view that throws can't hold the hand-off; the room's motion is held
// while the loader shows, with no "Paused at"; the server's states change nothing; and nothing goes to the network.
import { describe, expect, it } from "vitest";

import { assetEvent } from "../../src/asset-events";
import type { RoomIndex } from "../../src/room/compose/bundle";
import {
  CONTEXT_RESTORE_MS,
  FLOOR_FPS,
  FRAME_WINDOW_MS,
  LOADING_CEILING_MS,
  MAX_QUALITY,
  SCENE_WAIT_MS,
} from "../../src/room/quality";
import { createFrameLog } from "../../src/room/signals/frame-log";
import type { StatusResult } from "../../src/room/signals/tier";
import type { ExpectedFile, SceneModule, SceneOptions } from "../../src/room/stage";
import { WALL0, announcer, enter, flush, roomIndex, start } from "../helpers/room";
import type { Visit } from "../helpers/room";

const READY = "The room is ready.";
const CUT_SHORT = "The room opens now. Some pieces are still on their way and appear as they arrive.";
const HANDOFF = "The twin hands you a paper: the Author's resume.";

const card = (v: Visit): HTMLElement | null => v.doc.querySelector<HTMLElement>(".room-loader");
const options = (v: Visit): SceneOptions => {
  const made = v.scene.created.at(-1);
  if (!made) throw new Error("no 3D stage made");
  return made;
};
const loading = (v: Visit): boolean => v.doc.documentElement.getAttribute("data-loading") === "on";
/** An asset event as the room's loader records one. */
const ended = (v: Visit, asset: string, outcome: "loaded" | "failed" | "skipped" | "retried"): void =>
  options(v).assets?.(assetEvent({ asset, outcome, ms: 10, bytes: 100, mode: "3d" }));

/** Everything the room's polite status region was given, in order: each say replaces its text. */
function said(v: Visit): () => string[] {
  const lines: string[] = [];
  const region = announcer(v.doc);
  const observer = new v.win.MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) lines.push(n.textContent ?? "");
  });
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  return () => {
    for (const r of observer.takeRecords()) for (const n of r.addedNodes) lines.push(n.textContent ?? "");
    return lines;
  };
}

/** The frame log's loading entries, in a drafts build. */
function loadingLog(v: Visit): Record<string, unknown>[] {
  const log = (v.win as unknown as { h4FrameLog?: () => string }).h4FrameLog;
  if (!log) return [];
  const entries = (JSON.parse(log()) as { entries: Record<string, unknown>[] }).entries;
  return entries.filter((e) => e.event === "loading");
}

const files: ExpectedFile[] = [
  { asset: "fx-desk", bytes: 600 },
  { asset: "fx-sign", bytes: 400 },
];

/** A 3D visit whose stage will load `list`, entered. */
async function entered(
  o: {
    list?: readonly ExpectedFile[] | Promise<readonly ExpectedFile[]>;
    index?: RoomIndex;
    drafts?: boolean;
  } & Parameters<typeof start>[0] = {},
): Promise<{ v: Visit; lines: () => string[] }> {
  const { list, index, drafts, ...rest } = o;
  const v = start({
    webgl: true,
    ...(index ? { room: index } : {}),
    ...(drafts ? { frameLog: createFrameLog } : {}),
    ...rest,
  });
  if (list !== undefined) v.scene.expected = Promise.resolve(list);
  const lines = said(v);
  await enter(v);
  return { v, lines };
}

describe("no loader where the room is in 2D from Enter (FR-003)", () => {
  it("shows none without WebGL 2, and starts the 2D hand-off as today", async () => {
    const v = start({ webgl: false });
    const lines = said(v);
    await enter(v);
    expect(card(v)).toBeNull();
    expect(loading(v)).toBe(false);
    expect(v.room.visit.mode).toBe("2d");
    expect(lines()).toEqual([HANDOFF]);
  });

  it("shows none when the 3D chunk failed before Enter", async () => {
    const v = start({ webgl: true, sceneFails: true });
    await enter(v);
    expect(card(v)).toBeNull();
    expect(v.room.visit.mode).toBe("2d");
  });
});

describe("a fall to 2D while the loader shows (FR-004)", () => {
  it("says the room is ready once and gives way at once when the 3D chunk is late at SCENE_WAIT_MS", async () => {
    const v = start({ webgl: true, sceneHangs: true, frameLog: createFrameLog });
    const lines = said(v);
    await enter(v);
    expect(card(v)).not.toBeNull();
    expect(loading(v)).toBe(true);
    v.clock.advance(SCENE_WAIT_MS - 1);
    await flush();
    expect(lines()).toEqual([]);
    v.clock.advance(1);
    await flush();
    expect(v.room.visit.mode).toBe("2d");
    expect(lines().filter((l) => l.includes(READY))).toHaveLength(1);
    expect(lines().at(-1)).toContain(HANDOFF);
    expect(loading(v)).toBe(false);
    expect(loadingLog(v).filter((e) => e.state === "gave_way")).toEqual([
      expect.objectContaining({ state: "gave_way", why: "2d" }),
    ]);
  });

  it("gives way the same when the 3D chunk fails after Enter", async () => {
    let fail = (): void => undefined;
    const late = new Promise<SceneModule>((_, reject) => (fail = () => reject(new Error("the chunk didn't load"))));
    const v = start({ webgl: true, loadScene: () => late });
    const lines = said(v);
    await enter(v);
    expect(card(v)).not.toBeNull();
    fail();
    await flush();
    expect(v.room.visit.mode).toBe("2d");
    expect(lines().filter((l) => l.includes(READY))).toHaveLength(1);
    expect(loading(v)).toBe(false);
  });

  it("gives way the same on a lost context that doesn't come back while it shows", async () => {
    const { v, lines } = await entered({ list: files });
    expect(card(v)).not.toBeNull();
    v.scene.stage?.canvas.dispatchEvent(new v.win.Event("webglcontextlost", { cancelable: true }));
    v.clock.advance(CONTEXT_RESTORE_MS);
    await flush();
    expect(v.room.visit.mode).toBe("2d");
    expect(lines().filter((l) => l.includes(READY))).toHaveLength(1);
    expect(loading(v)).toBe(false);
    expect(v.clock.now()).toBeLessThan(LOADING_CEILING_MS);
  });

  it("can't meet the frame floor inside the ceiling: the floor takes a window at each quality level first", () => {
    // From level 0, the controller steps down one level a window and meets FLOOR_FPS only at MAX_QUALITY, so the
    // earliest frame-floor fall is (MAX_QUALITY + 1) windows after the 3D stage's first frame, past the ceiling; the
    // fall it would take is the lost context's above, toFlat's one road (FR-004).
    expect(FLOOR_FPS).toBeGreaterThan(0);
    expect((MAX_QUALITY + 1) * FRAME_WINDOW_MS).toBeGreaterThan(LOADING_CEILING_MS);
  });
});

describe("giving way when every part has ended (FR-019)", () => {
  it("gives way, ready, and starts the hand-off once spec 009's figures wait has ended too, never before", async () => {
    const v = start({ webgl: true, frameLog: createFrameLog });
    let figuresReady = (): void => undefined;
    v.scene.figures = new Promise<void>((resolve) => (figuresReady = resolve));
    v.scene.waitMs = 3000;
    v.scene.expected = Promise.resolve(files);
    const lines = said(v);
    await enter(v);
    expect(card(v)).not.toBeNull();
    ended(v, "fx-desk", "loaded");
    ended(v, "fx-sign", "loaded");
    await flush();
    expect(loading(v)).toBe(false);
    expect(lines().filter((l) => l.includes(READY))).toHaveLength(1);
    expect(v.scene.handoff).toEqual([]);
    v.clock.advance(1000);
    await flush();
    expect(v.scene.handoff).toEqual([]);
    figuresReady();
    await flush();
    expect(v.scene.handoff.length).toBeGreaterThan(0);
    const log = loadingLog(v);
    expect(log[0]).toMatchObject({ state: "shown" });
    expect(log.filter((e) => e.state === "ended").map((e) => e.part)).toEqual(
      expect.arrayContaining(["code", "text", "typefaces", "files"]),
    );
    expect(log.filter((e) => e.state === "gave_way")).toEqual([
      expect.objectContaining({ why: "ready", value: 100, done: 2, total: 2 }),
    ]);
  });

  it("starts the hand-off at the figures' own wait_ms when they never settle", async () => {
    const v = start({ webgl: true });
    v.scene.figures = new Promise<void>(() => undefined);
    v.scene.waitMs = 3000;
    v.scene.expected = Promise.resolve([]);
    await enter(v);
    expect(loading(v)).toBe(false);
    v.clock.advance(2999);
    await flush();
    expect(v.scene.handoff).toEqual([]);
    v.clock.advance(1);
    await flush();
    expect(v.scene.handoff.length).toBeGreaterThan(0);
  });

  it("counts a failed and a skipped file as ended, and shows the placeholder note as today", async () => {
    const { v } = await entered({ list: files });
    ended(v, "fx-desk", "retried");
    await flush();
    expect(card(v)).not.toBeNull();
    ended(v, "fx-desk", "failed");
    ended(v, "fx-sign", "skipped");
    await flush();
    expect(loading(v)).toBe(false);
    const note = v.doc.querySelector<HTMLElement>(".room-note:not(.room-stand-in)");
    expect(note?.hidden).toBe(!roomIndex().build.placeholders);
  });

  it("gives way below ADR 0010's floor when the steps end, every file skipped before the list arrived", async () => {
    const v = start({ webgl: true });
    let list: (files: readonly ExpectedFile[]) => void = () => undefined;
    v.scene.expected = new Promise<readonly ExpectedFile[]>((resolve) => (list = resolve));
    // Below the floor the room's loader records every skip before the stage has said what it will load.
    v.scene.onCreate = (o) => {
      for (const f of files)
        o.assets?.(assetEvent({ asset: f.asset, outcome: "skipped", ms: 0, bytes: 0, mode: "3d" }));
    };
    await enter(v);
    expect(loading(v)).toBe(true);
    list(files);
    await flush();
    expect(loading(v)).toBe(false);
    expect(v.clock.now()).toBeLessThan(1000);
    expect(v.events.map((e) => e.kind as string)).not.toContain("loading_cut_short");
  });

  it("ends the room text's step at once where the page loads no room text", async () => {
    const v = start({ webgl: true, withoutRoomData: true, frameLog: createFrameLog });
    v.scene.expected = Promise.resolve([]);
    await enter(v);
    expect(loading(v)).toBe(false);
    expect(loadingLog(v).some((e) => e.state === "ended" && e.part === "text")).toBe(true);
  });
});

describe("the ceiling (FR-005, FR-020)", () => {
  it("gives way at 7 s with a file still loading, saying so once, the hand-off starting then and not before", async () => {
    const { v, lines } = await entered({ list: files, drafts: true });
    ended(v, "fx-desk", "loaded");
    v.clock.advance(LOADING_CEILING_MS - 1);
    await flush();
    expect(card(v)).not.toBeNull();
    expect(v.scene.handoff).toEqual([]);
    v.clock.advance(1);
    await flush();
    expect(loading(v)).toBe(false);
    expect(v.scene.handoff.length).toBeGreaterThan(0);
    expect(lines().filter((l) => l.includes(CUT_SHORT))).toHaveLength(1);
    expect(lines().some((l) => l.includes(READY))).toBe(false);
    expect(loadingLog(v).filter((e) => e.state === "gave_way")).toEqual([
      expect.objectContaining({ why: "ceiling", done: 1, total: 2 }),
    ]);
  });

  it("is at most 7 s after Enter, on the room's clock", () => {
    expect(LOADING_CEILING_MS).toBeLessThanOrEqual(7000);
  });
});

describe("a loader view that throws (FR-007)", () => {
  it("shows no card, and the room still starts the hand-off no later than the ceiling", async () => {
    const v = start({
      webgl: true,
      loadingView: () => {
        throw new Error("the loader's view failed");
      },
    });
    v.scene.expected = Promise.resolve(files);
    await enter(v);
    expect(card(v)).toBeNull();
    expect(loading(v)).toBe(false);
    expect(v.doc.activeElement?.tagName).toBe("H1");
    v.clock.advance(LOADING_CEILING_MS);
    await flush();
    expect(v.scene.handoff.length).toBeGreaterThan(0);
  });
});

describe("the room's motion while the loader shows (FR-024; D13)", () => {
  it("is held, with nothing paused and no Paused at, and released when the loader gives way", async () => {
    const { v } = await entered({ list: files });
    expect(card(v)).not.toBeNull();
    expect(v.room.motion.animate).toBe(false);
    expect(v.room.motion.paused).toBe(false);
    expect(v.room.motion.pausedAt).toBeNull();
    expect(v.doc.querySelector(".room-around")?.textContent ?? "").not.toMatch(/Paused at/);
    ended(v, "fx-desk", "loaded");
    ended(v, "fx-sign", "loaded");
    await flush();
    expect(loading(v)).toBe(false);
    expect(v.room.motion.animate).toBe(true);
  });
});

describe("the server's states change nothing about the loader (FR-002)", () => {
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
  ] as const)("gives way at the ceiling as at any other time with %s", async (what, body) => {
    const { v, lines } = await entered({ list: files, index: site(roomIndex()) });
    v.room.live.complete(answer(v, body));
    expect(card(v), what).not.toBeNull();
    v.clock.advance(LOADING_CEILING_MS);
    await flush();
    expect(loading(v), what).toBe(false);
    expect(
      lines().filter((l) => l.includes(CUT_SHORT)),
      what,
    ).toHaveLength(1);
    expect(
      v.spies.network.filter((r) => r !== "fetch /api/status"),
      what,
    ).toEqual([]);
    expect(v.spies.beacons, what).toEqual([]);
  });

  it("behaves the same with the live source off, and with the tier unknown after a failure", async () => {
    const off = await entered({ list: files });
    off.v.clock.advance(LOADING_CEILING_MS);
    await flush();
    expect(loading(off.v)).toBe(false);
    expect(off.v.spies.network).toEqual([]);
    const failed = await entered({ list: files, index: site(roomIndex()) });
    failed.v.room.live.complete({
      ok: false,
      started: failed.v.clock.now() - 5_000,
      ended: failed.v.clock.now(),
      endedWall: WALL0 + failed.v.clock.now(),
      why: "network",
    });
    expect(failed.v.room.live.tier.tier).toBe("unknown");
    expect(card(failed.v)).not.toBeNull();
    failed.v.clock.advance(LOADING_CEILING_MS);
    await flush();
    expect(loading(failed.v)).toBe(false);
  });
});

describe("what the loader sends, and its log (FR-001, FR-049)", () => {
  it("asks the network for nothing, in a visit cut short and one that ends", async () => {
    const short = await entered({ list: files });
    short.v.clock.advance(LOADING_CEILING_MS);
    await flush();
    expect(short.v.spies.network).toEqual([]);
    const whole = await entered({ list: files });
    ended(whole.v, "fx-desk", "loaded");
    ended(whole.v, "fx-sign", "loaded");
    await flush();
    expect(whole.v.spies.network).toEqual([]);
    expect(whole.v.spies.beacons).toEqual([]);
    expect(whole.v.spies.storage).toEqual([]);
  });

  it("keeps no log in a release build", async () => {
    const { v } = await entered({ list: files });
    v.clock.advance(LOADING_CEILING_MS);
    await flush();
    expect((v.win as unknown as { h4FrameLog?: unknown }).h4FrameLog).toBeUndefined();
  });
});
