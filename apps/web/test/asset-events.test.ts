// T128 (spec 004; FR-071; Amendment C11; research.md R-60; contracts/room-live-state-telemetry.md §3, data-model.md
// §11.5; spec 003's contracts/asset-events.md §1): spec 003's asset events, built and switched off. Each event is made
// from its five fields alone, `bytes` the .glb.gz copy's length for `loaded` and 0 otherwise, and one outside spec
// 003's schema is never queued. While live.asset_events is off: 0 requests, the queue held in page memory, at most 64
// events (a full queue drops new ones), and each event shown in the lookdev page's log in a drafts build. While site:
// at most one POST /api/events every 10 seconds on the room's clock, at most 20 events each; one navigator.sendBeacon
// when the page hides; and a failed send dropped, never retried or stored. The fetch and the beacon the page hands the
// module are spies, as is every request and storage global, and the clock is FakeClock.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_EVENTS_URL,
  BATCH_MAX,
  QUEUE_MAX,
  SEND_EVERY_MS,
  assetEvent,
  assetMode,
  createAssetEvents,
  msBucket,
} from "../src/asset-events";
import type { AssetEvent, AssetEventsOptions } from "../src/asset-events";
import { spyOnGlobals } from "./helpers/globals";
import type { GlobalSpies } from "./helpers/globals";
import { FakeClock } from "./helpers/room";

/** What the module sent: each POST's time, URL, options, and events, and each beacon's. */
interface Sent {
  readonly posts: { at: number; url: string; init: RequestInit; events: unknown[] }[];
  readonly beacons: { at: number; url: string; body: unknown; events: unknown[] }[];
  readonly logged: AssetEvent[];
}

interface Harness {
  readonly clock: FakeClock;
  readonly sent: Sent;
  readonly globals: GlobalSpies;
  readonly events: ReturnType<typeof createAssetEvents>;
}

/** A module on FakeClock with spies for the page's fetch (answering `post`) and beacon (answering `beacon`). */
function harness(
  live: AssetEventsOptions["live"],
  options: {
    post?: "ok" | "reject" | "throw" | number;
    beacon?: boolean | "throw";
    log?: boolean;
  } = {},
): Harness {
  const globals = spyOnGlobals();
  const clock = new FakeClock();
  const sent: Sent = { posts: [], beacons: [], logged: [] };
  const answer = options.post ?? "ok";
  const fetch = (url: string, init: RequestInit): Promise<Response> => {
    sent.posts.push({ at: clock.now(), url, init, events: bodyEvents(init.body) });
    if (answer === "throw") throw new TypeError("refused before sending");
    if (answer === "reject") return Promise.reject(new TypeError("the network is down"));
    return Promise.resolve(new Response(null, { status: answer === "ok" ? 204 : answer }));
  };
  const nav = {
    sendBeacon: (url: string, body?: BodyInit | null): boolean => {
      sent.beacons.push({ at: clock.now(), url, body, events: bodyEvents(body) });
      if (options.beacon === "throw") throw new TypeError("the beacon's queue is full");
      return options.beacon ?? true;
    },
  };
  const log = options.log ? (event: AssetEvent): void => void sent.logged.push(event) : undefined;
  const events = createAssetEvents({ live, clock, fetch, nav, ...(log ? { log } : {}) });
  return { clock, sent, globals, events };
}

/** The events a body holds: `{"events": [...]}` as text, and nothing else. */
function bodyEvents(body: unknown): unknown[] {
  if (typeof body !== "string") throw new Error(`a body of ${typeof body}, not text`);
  const parsed = JSON.parse(body) as unknown;
  expect(Object.keys(parsed as object)).toEqual(["events"]);
  return (parsed as { events: unknown[] }).events;
}

/** The i-th event of a run: a loaded model, with its own asset ID and byte count. */
const nth = (i: number): AssetEvent => ({
  asset: `fx-piece-${i}`,
  outcome: "loaded",
  ms_bucket: "<1000",
  bytes: 1000 + i,
  mode: "full",
});
const range = (n: number, from = 0): AssetEvent[] => Array.from({ length: n }, (_, i) => nth(from + i));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the event (spec 003's shape)", () => {
  it("is built from a load's five facts: the bucket of its time, its mode's name, and bytes only when loaded", () => {
    expect(assetEvent({ asset: "fx-desk", outcome: "loaded", ms: 812, bytes: 812345, mode: "3d" })).toEqual({
      asset: "fx-desk",
      outcome: "loaded",
      ms_bucket: "<1000",
      bytes: 812345,
      mode: "full",
    });
    for (const outcome of ["retried", "failed"] as const) {
      expect(assetEvent({ asset: "fx-desk", outcome, ms: 10_400, bytes: 812345, mode: "reduced" })).toEqual({
        asset: "fx-desk",
        outcome,
        ms_bucket: ">=10000",
        bytes: 0,
        mode: "reduced",
      });
    }
    // A skip is <250 whatever the time, and carries no bytes.
    expect(assetEvent({ asset: "fx-desk", outcome: "skipped", ms: 4000, bytes: 9, mode: "2d" })).toEqual({
      asset: "fx-desk",
      outcome: "skipped",
      ms_bucket: "<250",
      bytes: 0,
      mode: "2d",
    });
  });

  it("buckets a time at each edge, and names spec 002's 3d mode full", () => {
    const edges: [number, string][] = [
      [0, "<250"],
      [249.9, "<250"],
      [250, "<1000"],
      [999.9, "<1000"],
      [1000, "<3000"],
      [2999.9, "<3000"],
      [3000, "<10000"],
      [9999.9, "<10000"],
      [10_000, ">=10000"],
      [3_600_000, ">=10000"],
    ];
    for (const [ms, bucket] of edges) expect(msBucket(ms), `${ms} ms`).toBe(bucket);
    expect([assetMode("3d"), assetMode("reduced"), assetMode("2d")]).toEqual(["full", "reduced", "2d"]);
  });

  it("is queued with its five fields alone, so nothing else a caller holds rides along", () => {
    const h = harness("off", { log: true });
    const extra = { ...nth(0), url: "/a/fx-piece-0.glb", visit: "fx-visit", time: 1234 };
    h.events.record(extra as AssetEvent);
    expect(h.events.queued).toEqual([nth(0)]);
    expect(Object.keys(h.events.queued[0] ?? {})).toEqual(["asset", "outcome", "ms_bucket", "bytes", "mode"]);
    expect(h.sent.logged).toEqual([nth(0)]);
  });

  it("is never queued, logged, or sent when it falls outside spec 003's schema", () => {
    const h = harness("site", { log: true });
    const bad: Record<string, unknown>[] = [
      { asset: "" },
      { asset: "fx-desk.glb" },
      { asset: "a/fx-desk" },
      { asset: "Fx-Desk" },
      { asset: "fx desk" },
      { asset: `fx-${"x".repeat(62)}` },
      { asset: 7 },
      { outcome: "started" },
      { ms_bucket: "<500" },
      { mode: "3d" },
      { bytes: -1 },
      { bytes: 1.5 },
      { bytes: Number.NaN },
      { bytes: Number.MAX_SAFE_INTEGER + 1 },
      { bytes: "1000" },
    ];
    for (const change of bad) h.events.record({ ...nth(0), ...change } as AssetEvent);
    h.clock.advance(60_000, 1000);
    h.events.hide();
    expect(h.events.queued).toEqual([]);
    expect(h.sent).toEqual({ posts: [], beacons: [], logged: [] });
  });
});

describe("while live.asset_events is off", () => {
  it("makes 0 requests, through the page's fetch and beacon or any global, and touches no storage", () => {
    const h = harness("off");
    for (const e of range(10)) h.events.record(e);
    h.clock.advance(120_000, 1000);
    h.events.hide();
    h.events.show();
    h.events.hide();
    expect(h.sent.posts).toEqual([]);
    expect(h.sent.beacons).toEqual([]);
    expect(h.globals).toEqual({ network: [], storage: [] });
    expect(h.clock.pendingTimers).toBe(0);
  });

  it("holds the queue in page memory, at most 64 events: a full queue drops new ones", () => {
    const h = harness("off");
    expect(QUEUE_MAX).toBe(64);
    for (const e of range(10)) h.events.record(e);
    expect(h.events.queued).toEqual(range(10));
    for (const e of range(60, 10)) h.events.record(e);
    expect(h.events.queued).toEqual(range(64));
    h.clock.advance(600_000, 1000);
    expect(h.events.queued).toEqual(range(64));
  });

  it("shows each event in the lookdev page's log in a drafts build, those a full queue dropped too", () => {
    const h = harness("off", { log: true });
    for (const e of range(70)) h.events.record(e);
    expect(h.sent.logged).toEqual(range(70));
    expect(h.events.queued).toHaveLength(64);
    expect(h.sent.posts).toEqual([]);
    // A release build hands the module no log: the events wait in the queue and are never shown or sent.
    const release = harness("off");
    for (const e of range(3)) release.events.record(e);
    expect(release.sent).toEqual({ posts: [], beacons: [], logged: [] });
  });
});

describe("while live.asset_events is site", () => {
  it("posts at most once every 10 seconds, at most 20 events each, the first 10 seconds after its first event", () => {
    expect([SEND_EVERY_MS, BATCH_MAX, ASSET_EVENTS_URL]).toEqual([10_000, 20, "/api/events"]);
    const h = harness("site");
    for (const e of range(50)) h.events.record(e);
    h.clock.advance(9_999, 1000);
    expect(h.sent.posts).toEqual([]);
    h.clock.advance(60_000, 1000);
    expect(h.sent.posts.map((p) => [p.at, p.events.length])).toEqual([
      [10_000, 20],
      [20_000, 20],
      [30_000, 10],
    ]);
    expect(h.sent.posts.flatMap((p) => p.events)).toEqual(range(50));
    for (const p of h.sent.posts) {
      expect(p.url).toBe("/api/events");
      // Text, as the beacon sends it; no cookie; no redirect followed; nothing cached.
      expect(p.init).toEqual({
        method: "POST",
        body: p.init.body,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
    }
    expect(h.events.queued).toEqual([]);
    expect(h.clock.pendingTimers).toBe(0);
    expect(h.globals).toEqual({ network: [], storage: [] });
  });

  it("never posts twice within 10 seconds as events trickle in: each batch goes 10 seconds after its first event", () => {
    const h = harness("site");
    const at = [0, 4_000, 9_000, 10_500, 12_000, 19_999, 20_000, 35_000, 35_001, 44_000];
    let t = 0;
    at.forEach((time, i) => {
      h.clock.advance(time - t, 1000);
      t = time;
      h.events.record(nth(i));
    });
    h.clock.advance(60_000, 1000);
    expect(h.sent.posts.map((p) => [p.at, p.events])).toEqual([
      [10_000, range(3)],
      [20_500, range(4, 3)],
      [45_000, range(3, 7)],
    ]);
    const times = h.sent.posts.map((p) => p.at);
    for (let i = 1; i < times.length; i++) expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(10_000);
  });

  it("sends one beacon when the page hides, of at most 20 events, and posts what remains on the clock", () => {
    const h = harness("site");
    for (const e of range(25)) h.events.record(e);
    h.clock.advance(2_000, 1000);
    h.events.hide();
    h.events.hide();
    expect(h.sent.beacons.map((b) => [b.at, b.url, b.events])).toEqual([[2_000, "/api/events", range(20)]]);
    expect(typeof h.sent.beacons[0]?.body).toBe("string");
    expect(h.events.queued).toEqual(range(5, 20));
    h.clock.advance(20_000, 1000);
    expect(h.sent.posts.map((p) => [p.at, p.events])).toEqual([[10_000, range(5, 20)]]);
    // Shown again, the next hide sends one more beacon.
    h.events.show();
    h.events.record(nth(25));
    h.events.hide();
    expect(h.sent.beacons.map((b) => b.events)).toEqual([range(20), [nth(25)]]);
    // Hidden with nothing queued, no beacon goes.
    h.events.show();
    h.events.hide();
    expect(h.sent.beacons).toHaveLength(2);
  });

  it("drops a failed send: never retried, never put back in the queue, and nothing stored", () => {
    for (const post of ["reject", "throw", 500, 429] as const) {
      const h = harness("site", { post });
      for (const e of range(3)) h.events.record(e);
      h.clock.advance(10_000, 1000);
      expect(h.sent.posts, String(post)).toHaveLength(1);
      h.clock.advance(120_000, 1000);
      expect(h.sent.posts, String(post)).toHaveLength(1);
      expect(h.events.queued, String(post)).toEqual([]);
      expect(h.globals, String(post)).toEqual({ network: [], storage: [] });
      vi.unstubAllGlobals();
    }
    for (const beacon of [false, "throw"] as const) {
      const h = harness("site", { beacon });
      for (const e of range(3)) h.events.record(e);
      h.events.hide();
      h.events.show();
      h.events.hide();
      h.clock.advance(120_000, 1000);
      expect(h.sent.beacons, String(beacon)).toHaveLength(1);
      expect(h.sent.posts, String(beacon)).toEqual([]);
      expect(h.events.queued, String(beacon)).toEqual([]);
      expect(h.globals, String(beacon)).toEqual({ network: [], storage: [] });
      vi.unstubAllGlobals();
    }
  });

  it("holds at most 64 events while they wait, and sends nothing after stop()", () => {
    const h = harness("site", { log: true });
    for (const e of range(70)) h.events.record(e);
    expect(h.events.queued).toEqual(range(64));
    expect(h.sent.logged).toEqual(range(70));
    h.clock.advance(10_000, 1000);
    expect(h.sent.posts.map((p) => p.events)).toEqual([range(20)]);
    h.events.stop();
    expect(h.clock.pendingTimers).toBe(0);
    h.events.record(nth(70));
    h.events.hide();
    h.clock.advance(120_000, 1000);
    expect(h.sent.posts).toHaveLength(1);
    expect(h.sent.beacons).toEqual([]);
  });
});
