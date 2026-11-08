// T034 (spec 007; FR-033, FR-036; plan §7, departure D2): the room's turn client, the sender main.ts gives the room. A
// same-origin POST /api/room/turn with credentials omitted, no cache, and a JSON body of exactly the request; its end
// reported once: the whole parsed body with its status; `aborted` for an abort or the 35-second timeout on the room's
// Clock; `network` for a fetch that failed; `body` for a body that didn't parse. And the history window: the newest
// turns within the limits, the oldest dropped first.
import { describe, expect, it } from "vitest";

import type { TurnResult } from "../../src/room/signals/turn-cost";
import { TURN_TIMEOUT_MS, TURN_URL, createTurnSender, historyWindow } from "../../src/talk/turn-client";
import { FakeClock } from "../helpers/room";

interface Call {
  url: string;
  init: RequestInit;
  resolve: (r: Response) => void;
  reject: (e: unknown) => void;
}

function rig() {
  const calls: Call[] = [];
  const clock = new FakeClock();
  const fetch = (url: string, init: RequestInit): Promise<Response> =>
    new Promise<Response>((resolve, reject) => {
      calls.push({ url, init, resolve, reject });
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  const send = createTurnSender({ fetch, clock });
  const ends: TurnResult[] = [];
  return { calls, clock, send, ends, end: (r: TurnResult) => ends.push(r) };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};
const request = { feature: "fx-board", path: "engineer" as const, turns: [] };

describe("the turn client (FR-033)", () => {
  it("posts exactly the request to the site's own /api/room/turn, credentials omitted, no cache", async () => {
    const { calls, send, end } = rig();
    send(request, end);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(TURN_URL);
    expect(TURN_URL).toBe("/api/room/turn");
    const init = calls[0]?.init;
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("omit");
    expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual(request);
  });

  it("reports the whole parsed body with its status, once", async () => {
    const { calls, send, ends, end } = rig();
    send(request, end);
    const body = { text: "An opening.", feature: "fx-board", cost_micro_usd: 0, route: "local" };
    calls[0]?.resolve(new Response(JSON.stringify(body), { status: 200 }));
    await settle();
    expect(ends).toEqual([{ kind: "response", status: 200, body }]);
    send(request, end);
    calls[1]?.resolve(new Response('{"state":"degraded","cause":"kill_switch_tripped"}', { status: 503 }));
    await settle();
    expect(ends[1]).toEqual({
      kind: "response",
      status: 503,
      body: { state: "degraded", cause: "kill_switch_tripped" },
    });
  });

  it("reports body for a body that doesn't parse, network for a failed fetch, and aborted for an abort", async () => {
    const { calls, send, ends, end } = rig();
    send(request, end);
    calls[0]?.resolve(new Response("<html>not json</html>", { status: 502 }));
    send(request, end);
    calls[1]?.reject(new TypeError("Failed to fetch"));
    const stop = new AbortController();
    send(request, end, stop.signal);
    stop.abort();
    await settle();
    // Each settles in its own time; what matters is what each reported, once.
    expect(ends).toHaveLength(3);
    expect(ends).toEqual(
      expect.arrayContaining([
        { kind: "error", error: "body" },
        { kind: "error", error: "network" },
        { kind: "error", error: "aborted" },
      ]),
    );
  });

  it("gives up after 35 seconds on the room's Clock, as aborted, and never reports twice", async () => {
    const { calls, clock, send, ends, end } = rig();
    send(request, end);
    clock.advance(TURN_TIMEOUT_MS - 1);
    await settle();
    expect(ends).toEqual([]);
    clock.advance(1);
    await settle();
    expect(ends).toEqual([{ kind: "error", error: "aborted" }]);
    calls[0]?.resolve(new Response("{}", { status: 200 }));
    await settle();
    expect(ends).toHaveLength(1);
    expect(TURN_TIMEOUT_MS).toBe(35_000);
  });

  it("reports aborted at once for a signal already aborted, and sends nothing", async () => {
    const { calls, send, ends, end } = rig();
    const stop = new AbortController();
    stop.abort();
    send(request, end, stop.signal);
    await settle();
    expect(calls).toEqual([]);
    expect(ends).toEqual([{ kind: "error", error: "aborted" }]);
  });
});

describe("the history window (FR-033)", () => {
  const t = (role: "visitor" | "twin", n: number, size = 10) => ({ role, text: `${role}${n}`.padEnd(size, ".") });

  it("keeps the newest turns within the turn and character limits, dropping the oldest first", () => {
    const turns = Array.from({ length: 12 }, (_, i) => t(i % 2 === 0 ? "visitor" : "twin", i));
    expect(historyWindow(turns, { historyMaxTurns: 8, historyMaxChars: 4_000 })).toEqual(turns.slice(4));
    const long = [t("visitor", 1, 3_000), t("twin", 2, 900), t("visitor", 3, 200)];
    expect(historyWindow(long, { historyMaxTurns: 8, historyMaxChars: 4_000 })).toEqual(long.slice(1));
    expect(historyWindow([], { historyMaxTurns: 8, historyMaxChars: 4_000 })).toEqual([]);
  });

  it("starts the window at a visitor's or a twin's turn alike, and never splits a turn", () => {
    const turns = [t("twin", 0, 100), t("visitor", 1, 100)];
    expect(historyWindow(turns, { historyMaxTurns: 1, historyMaxChars: 4_000 })).toEqual([turns[1]]);
    expect(historyWindow(turns, { historyMaxTurns: 8, historyMaxChars: 150 })).toEqual([turns[1]]);
  });
});
