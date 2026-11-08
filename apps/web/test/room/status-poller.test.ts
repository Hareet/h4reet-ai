// T242 (spec 004; FR-044, FR-045, User Story 8 scenario 4, SC-012's automated part; R-31; contracts/tier-signal.md
// §5, §9): src/room/signals/status-poller.ts, the only code in the room that asks the relay anything, on FakeClock with
// a fake fetch.
// - The exact request: fetch("/api/status", {method: "GET", mode: "same-origin", credentials: "omit", cache:
//   "no-store", redirect: "error", referrerPolicy: "no-referrer", signal}), and nothing else in its init; the signal
//   aborted at 5 seconds on the room's Clock, the body's read counting.
// - No request before Enter, while paused or hidden, or while live.source is `off`.
// - The cadence at poll_ms, each start one wait after the last start; backoff of 60, 120, and 120 seconds after
//   failures, then 30 again after a valid answer; Retry-After from a 429's header (delta-seconds, digits only), else
//   its body's retry_after_s, capped at 3,600 seconds, and never for another status.
// - What counts as a valid answer (§5.2), and each failure's `why`.
// - The resume rule both ways: a request at once on resume or show only when `now ≥ nextAt` or none has started, else
//   the timer for `nextAt`; a request in flight while paused completes and is recorded, and arms nothing.
// - Spies on storage and cookies showing 0 touches.
// - A property test over seeded random sequences of answers, failures, pauses, hides, and shows for 10 simulated
//   minutes: every start at least poll_ms after the one before, none while paused or hidden or before Enter, one at a
//   time, and no 60-second window holding 3.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BACKOFF_CAP_MS,
  RETRY_AFTER_CAP_MS,
  STATUS_PATH,
  STATUS_TIMEOUT_MS,
  createStatusPoller,
} from "../../src/room/signals/status-poller";
import type { StatusFetch, StatusPoller } from "../../src/room/signals/status-poller";
import type { StatusResult } from "../../src/room/signals/tier";
import { FakeClock, WALL0 } from "../helpers/room";

const POLL = 30_000;
const VALID = { local_tier: "up", state: "normal", cause_now: null };

/** A response as the poller reads it: its status, its headers, and its body as text. `body` null never arrives. */
function response(status: number, body: string | null, headers: Record<string, string> = {}): Response {
  const text = (): Promise<string> => (body === null ? new Promise<string>(() => undefined) : Promise.resolve(body));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    text,
    json: async () => JSON.parse(await text()) as unknown,
  } as unknown as Response;
}

const ok = (body: unknown = VALID): Response => response(200, JSON.stringify(body));

/** What the fake fetch does with one call: answer with a response, at once or after `after` ms on the clock; reject;
 *  throw; or never settle. */
type Reply =
  { kind: "response"; response: Response; after?: number } | { kind: "reject" } | { kind: "throw" } | { kind: "hang" };

interface Call {
  url: string;
  init: RequestInit;
  at: number;
}

interface Rig {
  clock: FakeClock;
  poller: StatusPoller;
  calls: Call[];
  results: StatusResult[];
  starts: number[];
  /** The replies the next calls take, in order; once they run out, a valid answer at once. */
  replies: Reply[];
  /** Moves the clock in steps, letting each step's promises settle before the next. */
  run(ms: number, step?: number): Promise<void>;
}

/** Lets the fake fetch's promises, and the poller's reads of them, settle. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function rig(o: { source?: "off" | "site"; pollMs?: number } = {}): Rig {
  const clock = new FakeClock();
  const calls: Call[] = [];
  const results: StatusResult[] = [];
  const starts: number[] = [];
  const replies: Reply[] = [];
  const fetch: StatusFetch = (url, init) => {
    calls.push({ url, init, at: clock.now() });
    const reply: Reply = replies.shift() ?? { kind: "response", response: ok() };
    switch (reply.kind) {
      case "throw":
        throw new TypeError("fetch threw");
      case "reject":
        return Promise.reject(new TypeError("Failed to fetch"));
      case "hang":
        return new Promise<Response>(() => undefined);
      case "response": {
        const { after } = reply;
        if (after === undefined) return Promise.resolve(reply.response);
        return new Promise<Response>((resolve) => clock.setTimeout(() => resolve(reply.response), after));
      }
    }
  };
  const poller = createStatusPoller({
    source: o.source ?? "site",
    pollMs: o.pollMs ?? POLL,
    clock,
    wall: () => WALL0 + clock.now(),
    fetch,
    onStart: (at) => starts.push(at),
    onResult: (result) => results.push(result),
  });
  return {
    clock,
    poller,
    calls,
    results,
    starts,
    replies,
    async run(ms, step = 100) {
      await settle();
      let left = ms;
      while (left > 0) {
        const by = Math.min(step, left);
        clock.advance(by, 1_000_000);
        left -= by;
        await settle();
      }
    },
  };
}

/** The clock times of the rig's fetch calls. */
const times = (r: Rig): number[] => r.calls.map((c) => c.at);

const recorded: string[] = [];
/** A stand-in for a storage API that records every touch. */
function recorder(name: string): object {
  return new Proxy(
    {},
    {
      get: (_, key) => (recorded.push(`${name}.${String(key)} read`), undefined),
      set: (_, key) => (recorded.push(`${name}.${String(key)} write`), true),
      has: (_, key) => (recorded.push(`${name}.${String(key)} has`), false),
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  recorded.length = 0;
});

describe("the request (contracts/tier-signal.md §5.1)", () => {
  it("is exactly fetch('/api/status', the seven fields), with no header, body, or query string", async () => {
    const r = rig();
    r.poller.enter();
    await r.run(0);
    expect(r.calls).toHaveLength(1);
    const [call] = r.calls;
    expect(call?.url).toBe("/api/status");
    expect(STATUS_PATH).toBe("/api/status");
    const init = call?.init ?? {};
    expect(Object.keys(init).sort()).toEqual(
      ["cache", "credentials", "method", "mode", "redirect", "referrerPolicy", "signal"].sort(),
    );
    expect(init).toMatchObject({
      method: "GET",
      mode: "same-origin",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it("aborts at 5 seconds on the room's Clock when the body hasn't arrived, and records a timeout then", async () => {
    expect(STATUS_TIMEOUT_MS).toBe(5_000);
    const r = rig();
    r.replies.push({ kind: "response", response: response(200, null) });
    r.poller.enter();
    await r.run(4_999, 1);
    expect(r.results).toEqual([]);
    expect(r.calls[0]?.init.signal?.aborted).toBe(false);
    await r.run(1, 1);
    expect(r.calls[0]?.init.signal?.aborted).toBe(true);
    expect(r.results).toEqual([{ ok: false, why: "timeout", started: 0, ended: 5_000, endedWall: WALL0 + 5_000 }]);
  });

  it("aborts at 5 seconds when no response comes at all, and when the response comes after it", async () => {
    const r = rig();
    r.replies.push({ kind: "hang" }, { kind: "response", response: ok(), after: 6_000 });
    r.poller.enter();
    await r.run(5_000);
    expect(r.results.map((x) => (x.ok ? "ok" : x.why))).toEqual(["timeout"]);
    // The backoff's 60 s, then a response 6 s late: a timeout at 5 s, and the late answer changes nothing.
    await r.run(60_000);
    expect(times(r)).toEqual([0, 60_000]);
    await r.run(6_000);
    expect(r.results.map((x) => (x.ok ? "ok" : x.why))).toEqual(["timeout", "timeout"]);
    expect(r.results[1]).toMatchObject({ started: 60_000, ended: 65_000 });
  });

  it("starts one request at a time: the next is armed only once the last has completed", async () => {
    const r = rig();
    r.replies.push({ kind: "response", response: ok(), after: 4_000 });
    r.poller.enter();
    await r.run(3_000);
    expect(r.poller.schedule.inFlight).toBe(true);
    expect(r.poller.schedule.nextAt).toBeNull();
    await r.run(1_000);
    expect(r.poller.schedule).toMatchObject({ inFlight: false, lastStart: 0, wait: POLL, nextAt: POLL });
  });
});

describe("what counts as a valid answer (§5.2)", () => {
  it("is a 200 whose body is a JSON object holding the three fields: the answer keeps those three alone", async () => {
    const r = rig();
    r.replies.push({
      kind: "response",
      response: ok({
        local_tier: "down",
        state: "normal",
        cause_now: "local_unhealthy",
        tunnel: "up",
        release: "x",
        time: "t",
        request_id: "r",
        later: 1,
      }),
      after: 200,
    });
    r.poller.enter();
    await r.run(200);
    expect(r.results).toEqual([
      {
        ok: true,
        started: 0,
        ended: 200,
        endedWall: WALL0 + 200,
        answer: { local_tier: "down", state: "normal", cause_now: "local_unhealthy" },
      },
    ]);
  });

  it.each([
    ["a body that isn't JSON", response(200, "not json")],
    ["an array", ok([])],
    ["null", ok(null)],
    ["a number", ok(5)],
    ["no cause_now", ok({ local_tier: "up", state: "normal" })],
    ["no state", ok({ local_tier: "up", cause_now: null })],
    ["no local_tier", ok({ state: "normal", cause_now: null })],
    ["a number for cause_now", ok({ ...VALID, cause_now: 5 })],
    ["a number for local_tier", ok({ ...VALID, local_tier: 1 })],
    ["null for state", ok({ ...VALID, state: null })],
  ])("reads %s as a shape failure", async (_, res) => {
    const r = rig();
    r.replies.push({ kind: "response", response: res });
    r.poller.enter();
    await r.run(0);
    expect(r.results).toEqual([{ ok: false, why: "shape", started: 0, ended: 0, endedWall: WALL0 }]);
  });

  it.each([404, 500, 502, 503, 204, 301])("reads a %i as a status failure, with its status", async (status) => {
    const r = rig();
    r.replies.push({ kind: "response", response: response(status, JSON.stringify(VALID), { "Retry-After": "90" }) });
    r.poller.enter();
    await r.run(0);
    // A Retry-After on anything but a 429 is no Retry-After.
    expect(r.results).toEqual([{ ok: false, why: "status", status, started: 0, ended: 0, endedWall: WALL0 }]);
  });

  it.each([
    ["a rejected fetch", { kind: "reject" } as const],
    ["a fetch that throws", { kind: "throw" } as const],
  ])("reads %s as a network failure", async (_, reply) => {
    const r = rig();
    r.replies.push(reply);
    r.poller.enter();
    await r.run(0);
    expect(r.results).toEqual([{ ok: false, why: "network", started: 0, ended: 0, endedWall: WALL0 }]);
  });
});

describe("the schedule (§5.3)", () => {
  it("starts each request one poll interval after the last started, while answers are valid", async () => {
    const r = rig();
    r.replies.push(
      { kind: "response", response: ok(), after: 1_200 },
      { kind: "response", response: ok(), after: 4_900 },
      { kind: "response", response: ok() },
    );
    r.poller.enter();
    await r.run(120_000);
    expect(times(r)).toEqual([0, 30_000, 60_000, 90_000, 120_000]);
    expect(r.starts).toEqual(times(r));
  });

  it("takes the interval from poll_ms", async () => {
    const r = rig({ pollMs: 45_000 });
    r.poller.enter();
    await r.run(135_000);
    expect(times(r)).toEqual([0, 45_000, 90_000, 135_000]);
  });

  it("backs off 60, 120, and 120 seconds after failures, then returns to 30 after a valid answer", async () => {
    expect(BACKOFF_CAP_MS).toBe(120_000);
    const r = rig();
    r.replies.push({ kind: "reject" }, { kind: "hang" }, { kind: "response", response: response(503, "{}") });
    r.replies.push({ kind: "response", response: response(200, "[]") });
    r.poller.enter();
    await r.run(500_000);
    // Failures at 0, 60, 180, and 300 s; a valid answer at 420 s, then every 30 s.
    expect(times(r)).toEqual([0, 60_000, 180_000, 300_000, 420_000, 450_000, 480_000]);
    expect(r.results.slice(0, 5).map((x) => (x.ok ? "ok" : x.why))).toEqual([
      "network",
      "timeout",
      "status",
      "shape",
      "ok",
    ]);
  });

  it("doubles from the wait it had: a failure after a valid answer waits 60 seconds", async () => {
    const r = rig();
    r.replies.push({ kind: "response", response: ok() }, { kind: "reject" }, { kind: "reject" });
    r.poller.enter();
    await r.run(240_000);
    expect(times(r)).toEqual([0, 30_000, 90_000, 210_000, 240_000]);
  });

  it.each([
    ["the header's delta-seconds", { "Retry-After": "90" }, "{}", 90_000],
    ["the header, under the backoff: the backoff", { "Retry-After": "10" }, "{}", 60_000],
    ["the body's retry_after_s, without a header", {}, JSON.stringify({ retry_after_s: 75 }), 75_000],
    [
      "the body's retry_after_s, when the header is a date",
      { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" },
      JSON.stringify({ retry_after_s: 80 }),
      80_000,
    ],
    ["the header before the body", { "Retry-After": "95" }, JSON.stringify({ retry_after_s: 75 }), 95_000],
    ["the header's digits only", { "Retry-After": "90.5" }, "{}", 60_000],
    ["the header, capped at 3,600 s", { "Retry-After": "99999" }, "{}", 3_600_000],
    ["the body, capped at 3,600 s", {}, JSON.stringify({ retry_after_s: 99_999 }), 3_600_000],
    ["no negative body", {}, JSON.stringify({ retry_after_s: -5 }), 60_000],
    ["no string body", {}, JSON.stringify({ retry_after_s: "75" }), 60_000],
    ["no fractional body", {}, JSON.stringify({ retry_after_s: 7.5 }), 60_000],
    ["a body that isn't JSON", {}, "too many", 60_000],
  ] as const)("waits after a 429 for %s", async (_, headers, body, wait) => {
    expect(RETRY_AFTER_CAP_MS).toBe(3_600_000);
    const r = rig();
    r.replies.push({ kind: "response", response: response(429, body, headers) });
    r.poller.enter();
    await r.run(0);
    const result = r.results[0];
    expect(result).toMatchObject({ ok: false, why: "status", status: 429 });
    if (wait > 60_000) expect(result).toMatchObject({ retryAfterMs: wait });
    expect(r.poller.schedule).toMatchObject({ lastStart: 0, wait, nextAt: wait });
    await r.run(wait - 100, 1_000);
    expect(r.calls).toHaveLength(1);
    await r.run(100);
    expect(times(r)).toEqual([0, wait]);
  });

  it("reads a 429's body only inside the timeout", async () => {
    const r = rig();
    r.replies.push({ kind: "response", response: response(429, null) });
    r.poller.enter();
    await r.run(5_000);
    expect(r.results).toEqual([{ ok: false, why: "timeout", started: 0, ended: 5_000, endedWall: WALL0 + 5_000 }]);
  });
});

describe("Enter, the live source, pause, and hide (§5.4, §5.5)", () => {
  it("makes no request before Enter", async () => {
    const r = rig();
    await r.run(300_000, 1_000);
    expect(r.calls).toEqual([]);
    r.poller.enter();
    expect(times(r)).toEqual([300_000]);
  });

  it("makes no request while live.source is off, whatever happens", async () => {
    const r = rig({ source: "off" });
    r.poller.enter();
    r.poller.setPaused(true);
    r.poller.setPaused(false);
    r.poller.setHidden(true);
    r.poller.setHidden(false);
    await r.run(600_000, 1_000);
    expect(r.calls).toEqual([]);
    expect(r.clock.pendingTimers).toBe(0);
  });

  for (const flag of ["paused", "hidden"] as const) {
    const set = (r: Rig, on: boolean): void => (flag === "paused" ? r.poller.setPaused(on) : r.poller.setHidden(on));
    const off = flag === "paused" ? "resume" : "show";

    it(`makes no request at Enter while ${flag}, and one at once on ${off}, since none has started`, async () => {
      const r = rig();
      set(r, true);
      r.poller.enter();
      await r.run(120_000, 1_000);
      expect(r.calls).toEqual([]);
      set(r, false);
      expect(times(r)).toEqual([120_000]);
    });

    it(`clears its timer while ${flag}, and on ${off} after nextAt starts a request at once`, async () => {
      const r = rig();
      r.poller.enter();
      await r.run(10_000);
      set(r, true);
      expect(r.clock.pendingTimers).toBe(0);
      await r.run(290_000, 1_000);
      expect(times(r)).toEqual([0]);
      set(r, false);
      expect(times(r)).toEqual([0, 300_000]);
      await r.run(30_000);
      expect(times(r)).toEqual([0, 300_000, 330_000]);
    });

    it(`on ${off} before nextAt keeps its schedule: the timer for nextAt, no request at once`, async () => {
      const r = rig();
      r.poller.enter();
      await r.run(10_000);
      set(r, true);
      await r.run(10_000);
      set(r, false);
      expect(times(r)).toEqual([0]);
      await r.run(9_900);
      expect(times(r)).toEqual([0]);
      await r.run(100);
      expect(times(r)).toEqual([0, 30_000]);
    });

    it(`on ${off} during a backoff keeps the backoff`, async () => {
      const r = rig();
      r.replies.push({ kind: "reject" });
      r.poller.enter();
      await r.run(10_000);
      set(r, true);
      await r.run(30_000);
      set(r, false);
      expect(times(r)).toEqual([0]);
      await r.run(20_000);
      expect(times(r)).toEqual([0, 60_000]);
    });

    it(`on ${off} during a Retry-After keeps the Retry-After`, async () => {
      const r = rig();
      r.replies.push({ kind: "response", response: response(429, "{}", { "Retry-After": "200" }) });
      r.poller.enter();
      await r.run(10_000);
      set(r, true);
      await r.run(100_000, 1_000);
      set(r, false);
      expect(times(r)).toEqual([0]);
      await r.run(90_000, 1_000);
      expect(times(r)).toEqual([0, 200_000]);
    });

    it(`records a request in flight that completes while ${flag}, and arms nothing until ${off}`, async () => {
      const r = rig();
      r.replies.push({ kind: "response", response: ok() }, { kind: "response", response: ok(), after: 2_000 });
      r.poller.enter();
      await r.run(31_000);
      set(r, true);
      await r.run(1_000);
      expect(r.results).toHaveLength(2);
      expect(r.results[1]).toMatchObject({ ok: true, started: 30_000, ended: 32_000 });
      expect(r.poller.schedule).toMatchObject({ inFlight: false, lastStart: 30_000, nextAt: 60_000 });
      expect(r.clock.pendingTimers).toBe(0);
      await r.run(120_000, 1_000);
      expect(times(r)).toEqual([0, 30_000]);
      set(r, false);
      expect(times(r)).toEqual([0, 30_000, 152_000]);
    });

    it(`on ${off} with a request in flight starts none, and arms the timer when it completes`, async () => {
      const r = rig();
      r.replies.push({ kind: "response", response: ok() }, { kind: "response", response: ok(), after: 3_000 });
      r.poller.enter();
      await r.run(31_000);
      set(r, true);
      await r.run(1_000);
      set(r, false);
      expect(times(r)).toEqual([0, 30_000]);
      await r.run(1_000);
      expect(r.results).toHaveLength(2);
      await r.run(27_000);
      expect(times(r)).toEqual([0, 30_000, 60_000]);
    });
  }

  it("needs both: hidden while paused, a resume starts nothing until the page shows", async () => {
    const r = rig();
    r.poller.enter();
    await r.run(1_000);
    r.poller.setPaused(true);
    r.poller.setHidden(true);
    await r.run(100_000, 1_000);
    r.poller.setPaused(false);
    expect(times(r)).toEqual([0]);
    r.poller.setHidden(false);
    expect(times(r)).toEqual([0, 101_000]);
  });

  it("enters once: a second Enter changes nothing", async () => {
    const r = rig();
    r.poller.enter();
    await r.run(10_000);
    r.poller.enter();
    expect(times(r)).toEqual([0]);
  });

  it("lets go of its timers when disposed, and records nothing after", async () => {
    const r = rig();
    r.replies.push({ kind: "response", response: ok() }, { kind: "response", response: ok(), after: 2_000 });
    r.poller.enter();
    await r.run(31_000);
    r.poller.dispose();
    expect(r.clock.pendingTimers).toBe(1);
    await r.run(120_000, 1_000);
    expect(times(r)).toEqual([0, 30_000]);
    expect(r.results).toHaveLength(1);
    expect(r.calls[1]?.init.signal?.aborted).toBe(true);
  });
});

describe("a result's listener that throws (the review of T248, nit 2)", () => {
  it("keeps the schedule: the next request is armed though the listener threw", () => {
    const clock = new FakeClock();
    const calls: number[] = [];
    let thrown = 0;
    const poller = createStatusPoller({
      source: "site",
      pollMs: POLL,
      clock,
      wall: () => WALL0 + clock.now(),
      fetch: () => (calls.push(clock.now()), new Promise<Response>(() => undefined)),
      onResult: () => {
        thrown += 1;
        throw new Error("a listener that throws");
      },
    });
    poller.enter();
    // The timeout's result reaches the listener inside the Clock's timer, so its throw surfaces there.
    expect(() => clock.advance(STATUS_TIMEOUT_MS, 1_000_000)).toThrow("a listener that throws");
    expect(thrown).toBe(1);
    expect(poller.schedule).toMatchObject({ inFlight: false, nextAt: 60_000 });
    clock.advance(55_000, 1_000_000);
    expect(calls).toEqual([0, 60_000]);
    poller.dispose();
  });
});

describe("what it never does (§5.5)", () => {
  it("touches no cookie, Web Storage, IndexedDB, or Cache API", async () => {
    for (const name of ["localStorage", "sessionStorage", "indexedDB", "caches", "document", "cookieStore"])
      vi.stubGlobal(name, recorder(name));
    const r = rig();
    r.replies.push(
      { kind: "response", response: ok() },
      { kind: "response", response: response(429, JSON.stringify({ retry_after_s: 40 }), { "Retry-After": "45" }) },
      { kind: "reject" },
      { kind: "hang" },
    );
    r.poller.enter();
    await r.run(600_000, 1_000);
    r.poller.setPaused(true);
    r.poller.setPaused(false);
    r.poller.setHidden(true);
    r.poller.setHidden(false);
    await r.run(60_000, 1_000);
    expect(r.calls.length).toBeGreaterThan(4);
    expect(recorded).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// The property test (SC-012's automated part; User Story 8 scenario 4)
// --------------------------------------------------------------------------------------------------------------------
/** Marsaglia's xorshift32, seeded, so each failing sequence can be run again by its seed. */
function random(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x1_0000_0000;
  };
}

const TEN_MINUTES = 600_000;
const STEP = 250;

describe("over random sequences for 10 simulated minutes (SC-012)", () => {
  it.each(Array.from({ length: 24 }, (_, k) => 7_001 + k * 7_919))(
    "seed %i: every start at least poll_ms after the last, none paused, hidden, or before Enter, 2 at most a minute",
    async (seed) => {
      const rnd = random(seed);
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
      const pollMs = pick([30_000, 30_000, 45_000, 120_000]);
      const r = rig({ pollMs });
      const replies: (() => Reply)[] = [
        () => ({ kind: "response", response: ok() }),
        () => ({ kind: "response", response: ok(), after: Math.floor(rnd() * 6_000) }),
        () => ({ kind: "reject" }),
        () => ({ kind: "hang" }),
        () => ({ kind: "response", response: response(pick([404, 500, 502, 503]), "{}") }),
        () => ({ kind: "response", response: response(200, "nope") }),
        () => ({
          kind: "response",
          response: response(429, JSON.stringify({ retry_after_s: Math.floor(rnd() * 200) }), {
            ...(rnd() < 0.5 ? { "Retry-After": String(Math.floor(rnd() * 200)) } : {}),
          }),
        }),
      ];
      for (let k = 0; k < 64; k += 1) r.replies.push(pick(replies)());
      // The state the poller is told, as the test sees it at each fetch.
      const state = { entered: false, paused: false, hidden: false };
      const seen: { at: number; entered: boolean; paused: boolean; hidden: boolean }[] = [];
      const enterAt = Math.floor((rnd() * 60_000) / STEP) * STEP;
      for (let t = 0; t < TEN_MINUTES; t += STEP) {
        // Calls made in this step, by an event or by a timer, are made in the state the events leave.
        const before = r.calls.length;
        if (t === enterAt) {
          state.entered = true;
          r.poller.enter();
        } else if (rnd() < 0.01) {
          if (rnd() < 0.5) {
            state.paused = !state.paused;
            r.poller.setPaused(state.paused);
          } else {
            state.hidden = !state.hidden;
            r.poller.setHidden(state.hidden);
          }
        }
        await r.run(STEP, STEP);
        for (const call of r.calls.slice(before)) seen.push({ at: call.at, ...state });
        // One request at a time: every call but the last has its result.
        expect(r.calls.length - r.results.length, `seed ${seed} at ${t}`).toBeLessThanOrEqual(1);
      }
      const starts = times(r);
      expect(starts.length, `seed ${seed}: some requests`).toBeGreaterThan(0);
      for (const s of seen) {
        expect(s.entered, `seed ${seed}: a start at ${s.at} before Enter`).toBe(true);
        expect(s.paused || s.hidden, `seed ${seed}: a start at ${s.at} while paused or hidden`).toBe(false);
      }
      for (let i = 1; i < starts.length; i += 1)
        expect((starts[i] ?? 0) - (starts[i - 1] ?? 0), `seed ${seed}: start ${i}`).toBeGreaterThanOrEqual(pollMs);
      for (const s of starts) expect(starts.filter((x) => x >= s && x < s + 60_000).length).toBeLessThanOrEqual(2);
    },
  );
});
