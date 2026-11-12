// T098 (spec 001; FR-029 to FR-037, FR-054, FR-061, FR-066; SC-008; contracts/relay-http.md): the relay's contract
// suite, with stub hosts on loopback and a stub store.
//   - the listeners and the peer rule (§1);
//   - the order of §3: the probe mark, the address, the cap, the kill switch's 10 s rule, the host, the forward and
//     its headers;
//   - the cap sized from a `public` section in this suite's own fixture, and a refusal to start while the section is
//     missing or a figure is blank, naming each key;
//   - the host choice's thresholds, and the retry on the other host only before the request was sent (§4);
//   - no_host_serving; a host's 502 or 504 becoming a 503 with its cause (§5);
//   - handover_events rows and the gap;
//   - the status document (§6);
//   - no body kept, no address logged (§7);
//   - the kill switch reaching the relay within 10 s (SC-008).
import { afterAll, afterEach, describe, expect, it } from "vitest";

import type { FastifyInstance } from "fastify";

import { PublicCap } from "../src/cap.js";
import { readPublicCap } from "../src/config.js";
import { HostChoice, type HandoverEvent } from "../src/hosts.js";
import { KillSwitch } from "../src/killswitch.js";
import { assemble, prepare, type Running } from "../src/start.js";
import {
  captureLog,
  Clock,
  deadUrl,
  EDGE_PEER,
  relayEnv,
  StubStore,
  stubHost,
  telemetryCapture,
  TEST_FIGURES,
  TEST_PUBLIC,
  VIEWER,
  VIEWER_HEADER,
  type StubHost,
} from "./helpers.js";

const capture = telemetryCapture();
afterAll(() => capture.close());

interface Rig {
  running: Running;
  edge: FastifyInstance;
  internal: FastifyInstance;
  laptop: StubHost;
  ec2: StubHost;
  store: StubStore;
  clock: Clock;
  events: HandoverEvent[];
  log: ReturnType<typeof captureLog>;
  /** One round of checks per call. */
  checks(n: number): Promise<void>;
}

const rigs: Rig[] = [];
afterEach(async () => {
  for (const r of rigs.splice(0)) {
    r.running.stop();
    await r.laptop.close();
    await r.ec2.close();
  }
  capture.spans.reset();
});

async function rig(opts: { laptopUrl?: string; ec2Url?: string; publicText?: string } = {}): Promise<Rig> {
  const laptop = await stubHost();
  const ec2 = await stubHost();
  const clock = new Clock();
  const store = new StubStore();
  const events: HandoverEvent[] = [];
  const log = captureLog();
  const ready = prepare(
    relayEnv(opts.laptopUrl ?? laptop.url, opts.ec2Url ?? ec2.url, { RELAY_HEALTH_PATH: "/health" }),
    opts.publicText ?? TEST_PUBLIC,
    clock.now,
  );
  if (ready.kind !== "ready") throw new Error(ready.lines.join("\n"));
  const running = assemble(ready, store, async (e) => void events.push(e), log.logger, clock.now);
  const r: Rig = {
    running,
    edge: running.listeners.edge,
    internal: running.listeners.internal,
    laptop,
    ec2,
    store,
    clock,
    events,
    log,
    checks: async (n) => {
      for (let i = 0; i < n; i += 1) {
        await running.check();
        clock.advance(1_000);
      }
    },
  };
  rigs.push(r);
  return r;
}

const hello = (r: Rig, headers: Record<string, string> = {}, body = '{"message":"a visitor\'s words-qz"}') =>
  r.edge.inject({
    method: "POST",
    url: "/api/hello",
    remoteAddress: EDGE_PEER,
    headers: { "content-type": "application/json", "cloudfront-viewer-address": VIEWER_HEADER, ...headers },
    payload: body,
  });

describe("§1: the listeners and the peer rule", () => {
  it.each(["127.0.0.1", "::1", "172.30.4.9", "10.42.0.10", "10.42.1.10", "::ffff:127.0.0.1"])(
    "refuses a peer at %s on 8080 with 403 edge_required, whatever it says the viewer is",
    async (peer) => {
      const r = await rig();
      await r.checks(3);
      const res = await r.edge.inject({
        method: "POST",
        url: "/api/hello",
        remoteAddress: peer,
        headers: { "cloudfront-viewer-address": VIEWER_HEADER, "content-type": "application/json" },
        payload: "{}",
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("edge_required");
      expect(r.laptop.received).toEqual([]);
    },
  );

  it("serves the internal listener's hello with the fixed identity 192.0.2.10, and its status", async () => {
    const r = await rig();
    await r.checks(3);
    const res = await r.internal.inject({
      method: "POST",
      url: "/api/hello",
      payload: "{}",
      remoteAddress: "127.0.0.1",
    });
    expect(res.statusCode).toBe(200);
    expect(r.laptop.received[0]?.headers["x-h4-viewer"]).toBe("192.0.2.10");
    const status = await r.internal.inject({ method: "GET", url: "/api/status", remoteAddress: "127.0.0.1" });
    expect(status.statusCode).toBe(200);
    // The internal listener has no room routes.
    const turn = await r.internal.inject({ method: "POST", url: "/api/room/turn", payload: "{}" });
    expect(turn.statusCode).toBe(404);
  });

  it("answers its own health on 8082", async () => {
    const r = await rig();
    const res = await r.running.listeners.health.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
  });

  it("answers any other method or path 404, not forwarded", async () => {
    const r = await rig();
    await r.checks(3);
    for (const [method, url] of [
      ["GET", "/api/hello"],
      ["POST", "/api/status"],
      ["POST", "/hello"],
      ["DELETE", "/api/room/turn"],
      ["POST", "/api/admin/reset"],
    ] as const) {
      const res = await r.edge.inject({
        method,
        url,
        remoteAddress: EDGE_PEER,
        headers: { "cloudfront-viewer-address": VIEWER_HEADER },
      });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect(r.laptop.received).toEqual([]);
  });

  it("refuses a body over its route's limit with 413, not forwarded", async () => {
    const r = await rig();
    await r.checks(3);
    const res = await r.edge.inject({
      method: "POST",
      url: "/api/room/events",
      remoteAddress: EDGE_PEER,
      headers: { "cloudfront-viewer-address": VIEWER_HEADER, "content-type": "application/json" },
      payload: JSON.stringify({ x: "y".repeat(600) }),
    });
    expect(res.statusCode).toBe(413);
    expect(r.laptop.received).toEqual([]);
  });
});

describe("§3: the processing order", () => {
  it("1. a probe gets 400 probe_not_allowed on anything but GET /api/status, before any other check", async () => {
    const r = await rig();
    await r.checks(3);
    const res = await r.edge.inject({
      method: "POST",
      url: "/api/hello",
      remoteAddress: "127.0.0.1",
      headers: { "x-h4-probe": "1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("probe_not_allowed");
    const status = await r.edge.inject({
      method: "GET",
      url: "/api/status",
      remoteAddress: EDGE_PEER,
      headers: { "x-h4-probe": "1", "cloudfront-viewer-address": VIEWER_HEADER },
    });
    expect(status.statusCode).toBe(200);
    // Spec 004's Amendment A2 (group 8's review A, I2): a status answered below 500, a probe's among them, makes no
    // span; the probe's 400 above keeps its own, marked.
    expect(capture.spans.getFinishedSpans().find((s) => s.attributes["http.route"] === "/api/status")).toBeUndefined();
    const refused = capture.spans.getFinishedSpans().find((s) => s.attributes["http.route"] === "/api/hello");
    expect(refused?.attributes["h4.probe"]).toBe(true);
    expect(r.laptop.received).toEqual([]);
  });

  it("2. a request without CloudFront-Viewer-Address, or with one that isn't an address and a port, is 403", async () => {
    const r = await rig();
    await r.checks(3);
    for (const value of [undefined, "203.0.113.77", "not-an-address:80", "203.0.113.77:99999"]) {
      const res = await r.edge.inject({
        method: "POST",
        url: "/api/hello",
        remoteAddress: EDGE_PEER,
        headers: value === undefined ? {} : { "cloudfront-viewer-address": value },
        payload: "{}",
      });
      expect(res.statusCode, String(value)).toBe(403);
      expect(res.json().error).toBe("edge_required");
    }
  });

  it("3. the cap refuses with spec 000's 429 shape, cause public_cap, before the kill switch is read", async () => {
    const r = await rig();
    await r.checks(3);
    for (let i = 0; i < TEST_FIGURES.burst; i += 1) expect((await hello(r)).statusCode).toBe(200);
    const readsBefore = r.store.reads;
    const res = await hello(r);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ error: "public_cap", limit: "per_minute" });
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(r.store.reads).toBe(readsBefore);
    expect(r.laptop.received).toHaveLength(TEST_FIGURES.burst);
    const metrics = await capture.metricsJson();
    expect(metrics).toContain("h4.cap.refused");
    expect(metrics).not.toContain(VIEWER);
  });

  it("4. a degraded kill switch is spec 000's degraded 503, kill_switch_tripped, not forwarded", async () => {
    const r = await rig();
    await r.checks(3);
    r.store.row = { state: "degraded", since: "2026-11-12T08:59:00Z", crossed: ["day"] };
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("kill_switch_tripped");
    expect(res.json()).toMatchObject({
      state: "degraded",
      cause: "kill_switch_tripped",
      ceilings: ["day"],
      stack: "prod",
      since: "2026-11-12T08:59:00Z",
    });
    expect(r.laptop.received).toEqual([]);
  });

  it("4. an empty store is store_uninitialized, not forwarded", async () => {
    const r = await rig();
    await r.checks(3);
    r.store.row = null;
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(res.json().cause).toBe("store_uninitialized");
  });

  // Group 8's review A, I3: FR-030, SC-008 ("While the relay can't read the state, 100% of its answers are degraded"),
  // and contract §3 step 4 allow no grace; this test pinned 10 s of one.
  it("4. a failed read is store_unreachable at once, whatever the last read said", async () => {
    const r = await rig();
    await r.checks(3);
    expect((await hello(r)).statusCode).toBe(200);
    r.store.failing = true;
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(res.json().cause).toBe("store_unreachable");
    expect(r.laptop.received).toHaveLength(1);
  });

  it("4. a relay that has never read the store answers store_unreachable while it can't", async () => {
    const r = await rig();
    await r.checks(3);
    r.store.failing = true;
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(res.json().cause).toBe("store_unreachable");
  });

  it("6. forwards with the host's token, X-H4-Viewer, traceparent, and the body unchanged, and nothing else", async () => {
    const r = await rig();
    await r.checks(3);
    const body = '{"message":"exact bytes \\u00e9 kept"}';
    const res = await hello(
      r,
      {
        "x-forwarded-for": "198.51.100.9",
        "x-h4-client": "label",
        cookie: "a=b",
        "user-agent": "agent",
        accept: "application/json",
        traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      },
      body,
    );
    expect(res.statusCode).toBe(200);
    const got = r.laptop.received[0];
    expect(got?.url).toBe("/hello");
    expect(got?.body).toBe(body);
    expect(got?.headers.authorization).toBe(`Bearer ${"laptop-".padEnd(40, "t")}`);
    expect(got?.headers["x-h4-viewer"]).toBe(VIEWER);
    expect(got?.headers.accept).toBe("application/json");
    expect(got?.headers["content-type"]).toBe("application/json");
    // The relay's own span is the parent the host sees, in a trace of its own: the visitor's traceparent parents
    // nothing (group 8's review A, nit 1).
    expect(got?.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(got?.headers.traceparent).not.toContain("0af7651916cd43dd8448eb211c80319c");
    for (const name of ["x-forwarded-for", "x-h4-client", "cookie", "user-agent", "cloudfront-viewer-address"]) {
      expect(got?.headers[name], name).toBeUndefined();
    }
  });

  it("6. sends each route to its own path on the host", async () => {
    const r = await rig();
    await r.checks(3);
    for (const [route, path] of [
      ["/api/room/turn", "/room/turn"],
      ["/api/room/events", "/room/events"],
    ] as const) {
      await r.edge.inject({
        method: "POST",
        url: route,
        remoteAddress: EDGE_PEER,
        headers: { "cloudfront-viewer-address": VIEWER_HEADER, "content-type": "application/json" },
        payload: "{}",
      });
      expect(r.laptop.received.at(-1)?.url).toBe(path);
    }
  });
});

describe("§4: the host choice", () => {
  it("serves no one until three checks pass in a row, and the laptop first", async () => {
    const r = await rig();
    await r.checks(2);
    expect(r.running.deps.hosts.serving()).toBe("none");
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(res.json().cause).toBe("no_host_serving");
    await r.checks(1);
    expect(r.running.deps.hosts.serving()).toBe("laptop");
  });

  it("moves to EC2 after one failed check of the laptop, and back after three passes", async () => {
    const r = await rig();
    await r.checks(3);
    r.laptop.health = 503;
    await r.checks(1);
    expect(r.running.deps.hosts.serving()).toBe("ec2");
    expect((await hello(r)).statusCode).toBe(200);
    expect(r.ec2.received).toHaveLength(1);
    r.laptop.health = 200;
    await r.checks(2);
    expect(r.running.deps.hosts.serving()).toBe("ec2");
    await r.checks(1);
    expect(r.running.deps.hosts.serving()).toBe("laptop");
  });

  it("answers no_host_serving with neither host healthy, and calls no host", async () => {
    const r = await rig();
    r.laptop.health = 503;
    r.ec2.health = 503;
    await r.checks(5);
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("no_host_serving");
    expect(r.laptop.received).toEqual([]);
    expect(r.ec2.received).toEqual([]);
  });

  it("retries on the other host once when the connection failed before anything was sent", async () => {
    const r = await rig();
    await r.checks(3);
    // The laptop's relay block goes away between two checks: the next forward can't connect.
    await r.laptop.close();
    const res = await hello(r);
    expect(res.statusCode).toBe(200);
    expect(r.ec2.received).toHaveLength(1);
    expect(r.running.deps.hosts.healthy("laptop")).toBe(false);
  });

  it("never retries a request that reached the host, whatever it answered", async () => {
    const r = await rig();
    await r.checks(3);
    r.laptop.answer = { status: 500, body: '{"error":"x"}' };
    const res = await hello(r);
    expect(res.statusCode).toBe(500);
    expect(r.ec2.received).toEqual([]);
  });

  it("answers no_host_serving when the connection failed and the other host isn't healthy", async () => {
    const dead = await deadUrl();
    const r = await rig({ ec2Url: dead });
    await r.checks(3);
    await r.laptop.close();
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(res.json().cause).toBe("no_host_serving");
  });
});

describe("§5: the causes this contract adds", () => {
  it.each([502, 504])("turns a host's %i into a 503 that keeps its cause", async (status) => {
    const r = await rig();
    await r.checks(3);
    r.laptop.answer = {
      status,
      headers: { "content-type": "application/json", "x-h4-degraded-cause": "api_unavailable" },
      body: '{"state":"degraded","cause":"api_unavailable","detail":"The gateway is not answering."}',
    };
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("api_unavailable");
    expect(res.json().cause).toBe("api_unavailable");
  });

  it.each([502, 504])("turns a host's %i with no cause into a 503 host_error", async (status) => {
    const r = await rig();
    await r.checks(3);
    r.laptop.answer = { status, body: "<html>bad gateway</html>" };
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ state: "degraded", cause: "host_error", stack: "prod" });
  });

  it("passes a host's own 503 and its cause through unchanged", async () => {
    const r = await rig();
    await r.checks(3);
    const body = '{"state":"degraded","cause":"meter_at_ceiling"}';
    r.laptop.answer = { status: 503, headers: { "x-h4-degraded-cause": "meter_at_ceiling" }, body };
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-h4-degraded-cause"]).toBe("meter_at_ceiling");
    expect(res.body).toBe(body);
  });
});

describe("the handover's rows", () => {
  it("writes one row per change of serving host, the gap on a move out of none", async () => {
    const r = await rig();
    await r.checks(3);
    r.laptop.health = 503;
    r.ec2.health = 503;
    await r.checks(1); // laptop unhealthy; EC2 unhealthy since its start, so none
    r.clock.advance(4_000);
    r.ec2.health = 200;
    await r.checks(3);
    expect(r.events.map((e) => [e.from, e.to, e.reason])).toEqual([
      ["none", "laptop", "laptop_healthy"],
      ["laptop", "none", "laptop_unhealthy"],
      ["none", "ec2", "ec2_healthy"],
    ]);
    // The relay's first move out of none, at its start, has no gap it could know.
    expect(r.events[0]?.gapMs).toBeNull();
    expect(r.events[1]?.gapMs).toBeNull();
    expect(r.events[2]?.gapMs).toBe(4_000 + 3_000);
  });

  it("records each change's metrics without an address", async () => {
    const r = await rig();
    await r.checks(3);
    const json = await capture.metricsJson();
    for (const name of ["h4.handover.events", "h4.serving_host", "h4.relay.host_healthy"]) expect(json).toContain(name);
  });
});

describe("§6: GET /api/status", () => {
  it("answers which host serves, since when, EC2's state, the kill switch, and what a hello would get", async () => {
    const r = await rig();
    const before = await r.internal.inject({ method: "GET", url: "/api/status" });
    expect(before.json()).toMatchObject({ serving: "none", ec2: "unknown", hello_would_get: "no_host_serving" });
    await r.checks(3);
    const res = await r.edge.inject({
      method: "GET",
      url: "/api/status",
      remoteAddress: EDGE_PEER,
      headers: { "cloudfront-viewer-address": VIEWER_HEADER },
    });
    const doc = res.json();
    // Spec 004's Amendment A1 (group 8's review A, I2): local_tier, state, and cause_now, which the room reads.
    expect(Object.keys(doc).sort()).toEqual([
      "cause_now",
      "ec2",
      "hello_would_get",
      "kill_switch",
      "local_tier",
      "serving",
      "since",
      "state",
      "taken_at",
    ]);
    expect(doc).toMatchObject({ serving: "laptop", kill_switch: "normal", hello_would_get: "answer" });
    expect(doc).toMatchObject({ local_tier: "up", state: "normal", cause_now: null });
    expect(doc.since).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    r.store.row = { state: "degraded", since: null, crossed: ["month"] };
    r.clock.advance(5_001);
    const tripped = (await r.internal.inject({ method: "GET", url: "/api/status" })).json();
    expect(tripped).toMatchObject({ kill_switch: "degraded", hello_would_get: "kill_switch_tripped" });
    expect(tripped).toMatchObject({ state: "degraded", cause_now: "kill_switch_tripped", local_tier: "up" });
    expect(JSON.stringify(tripped)).not.toContain(VIEWER);
    expect(r.laptop.received).toEqual([]);
  });

  // Spec 004's Amendment A1 (group 8's review A, I2): the status bucket, 30 a minute, burst 10, per address, apart
  // from hello's; over it, 429 relay_cap_exceeded with its own limit name and Retry-After.
  it("holds the status to its own bucket, 30 a minute, burst 10, apart from hello's", async () => {
    const r = await rig();
    await r.checks(3);
    const status = () =>
      r.edge.inject({
        method: "GET",
        url: "/api/status",
        remoteAddress: EDGE_PEER,
        headers: { "cloudfront-viewer-address": VIEWER_HEADER },
      });
    for (let i = 0; i < 10; i += 1) expect((await status()).statusCode).toBe(200);
    const refused = await status();
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ error: "relay_cap_exceeded", limit: "status_per_minute" });
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    expect(refused.json().retry_after_s).toBe(Number(refused.headers["retry-after"]));
    // Hello's bucket is untouched by the status's.
    expect((await hello(r)).statusCode).toBe(200);
    // Two seconds refill one token at 30 a minute.
    r.clock.advance(2_000);
    expect((await status()).statusCode).toBe(200);
  });

  it("reads the store for the status at most once in 5 s", async () => {
    const r = await rig();
    await r.checks(3);
    const before = r.store.reads;
    for (let i = 0; i < 3; i += 1) await r.internal.inject({ method: "GET", url: "/api/status" });
    expect(r.store.reads).toBe(before + 1);
    r.clock.advance(5_001);
    await r.internal.inject({ method: "GET", url: "/api/status" });
    expect(r.store.reads).toBe(before + 2);
    // Hello still reads the store on every request (SC-008).
    await hello(r);
    expect(r.store.reads).toBe(before + 3);
  });

  it.each([
    [
      { serving: "laptop", normal: true },
      { local_tier: "up", state: "normal", cause_now: null },
    ],
    [
      { serving: "ec2", normal: true },
      { local_tier: "down", state: "normal", cause_now: null },
    ],
    [
      { serving: "none", normal: true },
      { local_tier: "down", state: "normal", cause_now: "no_host_serving" },
    ],
  ])("reads the A1 fields from the serving host and the switch: %j", async (given, want) => {
    const r = await rig();
    if (given.serving === "laptop") await r.checks(3);
    if (given.serving === "ec2") {
      r.laptop.health = 503;
      await r.checks(3);
    }
    if (given.serving === "none") {
      r.laptop.health = 503;
      r.ec2.health = 503;
      await r.checks(3);
    }
    const doc = (await r.internal.inject({ method: "GET", url: "/api/status" })).json();
    expect(doc).toMatchObject(want);
  });

  it("reads state unknown, and cause_now store_unreachable, while the store can't be read", async () => {
    const r = await rig();
    await r.checks(3);
    r.store.failing = true;
    const doc = (await r.internal.inject({ method: "GET", url: "/api/status" })).json();
    expect(doc).toMatchObject({ state: "unknown", cause_now: "store_unreachable" });
  });
});

describe("§7: what the relay never keeps or logs", () => {
  it("logs and traces no address, message, or answer; its log line is the route, host, status, cause, duration, ID", async () => {
    const r = await rig();
    await r.checks(3);
    r.laptop.answer = { status: 200, body: '{"answer":"the twin\'s answer-qv"}' };
    await hello(r);
    const log = r.log.text();
    const spans = JSON.stringify(capture.spans.getFinishedSpans().map((s) => s.attributes));
    const metrics = await capture.metricsJson();
    for (const text of [log, spans, metrics]) {
      expect(text).not.toContain(VIEWER);
      expect(text).not.toContain("a visitor's words-qz");
      expect(text).not.toContain("answer-qv");
      expect(text).not.toContain("laptop-ttt");
    }
    const line = log.split("\n").find((l) => l.includes('"relay.request"'));
    expect(JSON.parse(line ?? "{}")).toMatchObject({ route: "/api/hello", host: "laptop", status: 200 });
    expect(JSON.parse(line ?? "{}")).toHaveProperty("duration_ms");
    expect(JSON.parse(line ?? "{}")).toHaveProperty("request_id");
  });

  it("sets relay.request's attributes: the host, the reason, the cause, and the cap", async () => {
    const r = await rig();
    await r.checks(3);
    await hello(r);
    r.store.row = { state: "degraded", since: null, crossed: null };
    await hello(r);
    const spans = capture.spans.getFinishedSpans().filter((s) => s.name === "relay.request");
    expect(spans[0]?.attributes).toMatchObject({ "h4.relay.host": "laptop", "h4.cap.refused": false });
    expect(spans[1]?.attributes).toMatchObject({ "h4.degraded.cause": "kill_switch_tripped" });
  });

  it("holds an address only in the cap, and drops it once its UTC day has passed", () => {
    const clock = new Clock();
    const cap = new PublicCap(TEST_FIGURES, clock.now);
    cap.admit(VIEWER);
    expect(cap.size).toBe(1);
    clock.advance(24 * 3_600_000);
    cap.admit("198.51.100.1");
    expect(cap.size).toBe(1);
  });
});

describe("the cap, sized from the public section", () => {
  it("refuses past the burst, refills at the minute's rate, and stops at the day's count", () => {
    const clock = new Clock();
    const cap = new PublicCap(TEST_FIGURES, clock.now);
    const admit = () => {
      const d = cap.admit(VIEWER);
      if (d.ok) d.release();
      return d.ok ? "ok" : d.limit;
    };
    expect([admit(), admit(), admit(), admit()]).toEqual(["ok", "ok", "ok", "per_minute"]);
    clock.advance(10_000); // 6 a minute: one token each 10 s
    expect(admit()).toBe("ok");
    for (let i = 0; i < 20; i += 1) {
      clock.advance(10_000);
      admit();
    }
    expect(admit()).toBe("per_day");
  });

  it("holds the global in-flight limit across addresses", () => {
    const cap = new PublicCap(TEST_FIGURES, new Clock().now);
    const a = cap.admit("198.51.100.1");
    const b = cap.admit("198.51.100.2");
    const c = cap.admit("198.51.100.3");
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, false]);
    if (!c.ok) expect(c.limit).toBe("global_in_flight");
    if (a.ok) a.release();
    expect(cap.admit("198.51.100.4").ok).toBe(true);
  });
});

describe("the start: the public section, the Author's figures", () => {
  const env = relayEnv("http://tunnel-end:2201", "http://10.42.0.20:8085");

  it("refuses to start while the section is missing", () => {
    const p = prepare(env, "schema: 1\n");
    expect(p.kind).toBe("refused");
    if (p.kind === "refused") {
      expect(p.exitCode).toBe(78);
      expect(p.lines.join("\n")).toContain("public is missing");
    }
  });

  it("refuses to start while any figure is blank, naming each key", () => {
    const blank = TEST_PUBLIC.replace(/: \d+$/gm, ":");
    const p = prepare(env, blank);
    expect(p.kind).toBe("refused");
    const lines = p.kind === "refused" ? p.lines.join("\n") : "";
    for (const key of [
      "public.per_address.requests_per_minute",
      "public.per_address.burst",
      "public.per_address.requests_per_day",
      "public.global.in_flight",
    ]) {
      expect(lines).toContain(`${key} is blank`);
    }
  });

  it("reads the tests' own figures, and refuses an unknown key or a figure out of its bounds", () => {
    expect(readPublicCap(TEST_PUBLIC).figures).toEqual(TEST_FIGURES);
    expect(readPublicCap(`${TEST_PUBLIC}  extra: 1\n`).problems.join()).toContain("public.extra isn't a key");
    expect(readPublicCap(TEST_PUBLIC.replace("burst: 3", "burst: 9")).problems.join()).toContain(
      "burst must be at most",
    );
    expect(readPublicCap(TEST_PUBLIC.replace("in_flight: 2", "in_flight: 0")).problems.join()).toContain("in_flight");
  });

  it("refuses prod without TLS to the shared state, a host's token, or relay_rw, naming the key and never a value", () => {
    const p = prepare(
      { ...env, RELAY_DB_TLS_CA: "", RELAY_TOKEN_EC2: "tiny-token", RELAY_DB_RW_USER: "" },
      TEST_PUBLIC,
    );
    const lines = p.kind === "refused" ? p.lines.join("\n") : "";
    expect(lines).toContain("RELAY_DB_TLS_CA");
    expect(lines).toContain("RELAY_TOKEN_EC2");
    expect(lines).toContain("RELAY_DB_RW_USER");
    expect(lines).not.toContain("tiny-token");
    expect(lines).not.toContain("ro-test-password");
  });

  it("refuses a refused-peers list that doesn't parse, rather than skip the bad range", () => {
    const p = prepare({ ...env, RELAY_REFUSED_PEERS: "127.0.0.0/8,172.30.0.0/33" }, TEST_PUBLIC);
    expect(p.kind === "refused" ? p.lines.join() : "").toContain("172.30.0.0/33");
  });
});

describe("SC-008: the kill switch reaches the relay within 10 s", () => {
  it("reads the store on every forwarded request, so a trip is seen by the next one", async () => {
    const r = await rig();
    await r.checks(3);
    const before = r.store.reads;
    expect((await hello(r)).statusCode).toBe(200);
    r.store.row = { state: "degraded", since: null, crossed: ["day"] };
    expect((await hello(r)).statusCode).toBe(503);
    expect(r.store.reads).toBe(before + 2);
    r.store.row = { state: "normal", since: null, crossed: null };
    expect((await hello(r)).statusCode).toBe(200);
  });

  // Group 8's review A, I3: no stale normal at all, as SC-008 says.
  it("never holds a stale normal: the first failed read is store_unreachable", async () => {
    const clock = new Clock();
    const store = new StubStore();
    const ks = new KillSwitch(store, clock.now);
    expect((await ks.verdict()).kind).toBe("normal");
    store.failing = true;
    expect(await ks.verdict()).toMatchObject({ kind: "degraded", cause: "store_unreachable" });
    expect(ks.state()).toBe("unknown");
  });
});

describe("HostChoice alone", () => {
  it("keeps the laptop first while both are healthy", () => {
    const clock = new Clock();
    const events: HandoverEvent[] = [];
    const choice = new HostChoice(["laptop", "ec2"], clock.now, (e) => events.push(e));
    for (let i = 0; i < 3; i += 1) choice.report("ec2", true);
    expect(choice.serving()).toBe("ec2");
    for (let i = 0; i < 3; i += 1) choice.report("laptop", true);
    expect(choice.serving()).toBe("laptop");
    expect(events.at(-1)).toMatchObject({ from: "ec2", to: "laptop", reason: "laptop_healthy", gapMs: null });
  });
});

// Group 8's review A (7c5f1259..8418fd0b), its Important findings and nits, each test-first.
describe("group 8's review A", () => {
  // I1: one person holds a /64; rotating the lower 64 bits must not rotate past the cap, here or at the gateway.
  it("I1. keys an IPv6 viewer by its /64, in the cap and in X-H4-Viewer", async () => {
    const r = await rig();
    await r.checks(3);
    const v6 = (n: number) => ({ "cloudfront-viewer-address": `2001:db8:1:2:abcd::${n.toString(16)}:51234` });
    const codes = [];
    for (let i = 1; i <= 4; i += 1) codes.push((await hello(r, v6(i))).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
    expect(r.laptop.received.map((x) => x.headers["x-h4-viewer"])).toEqual([
      "2001:db8:1:2::",
      "2001:db8:1:2::",
      "2001:db8:1:2::",
    ]);
    // Another /64 has a bucket of its own; an IPv4 viewer is keyed as itself.
    expect((await hello(r, { "cloudfront-viewer-address": "2001:db8:1:3::1:51234" })).statusCode).toBe(200);
    expect((await hello(r)).statusCode).toBe(200);
    expect(r.laptop.received.at(-1)?.headers["x-h4-viewer"]).toBe(VIEWER);
  });

  it("I1. the key: IPv4 as it is, IPv6 as its /64's first address, a mapped IPv4 as IPv4", async () => {
    const { clientKey } = await import("../src/peer.js");
    expect(clientKey("203.0.113.7")).toBe("203.0.113.7");
    expect(clientKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(clientKey("2001:DB8:0:0:1::1")).toBe("2001:db8:0:0::");
    expect(clientKey("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::");
    expect(clientKey("2001:db8::")).toBe("2001:db8:0:0::");
    expect(clientKey("fe80::1%eth0")).toBe("fe80:0:0:0::");
  });

  // Group 8's fixes' review, nit 3: an IPv4-mapped address in its hex form is the IPv4 address, as the dotted form is,
  // never one shared /64 bucket for every mapped client.
  it("keys an IPv4-mapped address in any form as its IPv4 address", async () => {
    const { clientKey } = await import("../src/peer.js");
    expect(clientKey("::ffff:c000:201")).toBe("192.0.2.1");
    expect(clientKey("::FFFF:C000:0201")).toBe("192.0.2.1");
    expect(clientKey("0:0:0:0:0:ffff:cb00:7107")).toBe("203.0.113.7");
    expect(clientKey("::ffff:c000:202")).not.toBe(clientKey("::ffff:c000:201"));
  });

  // Group 8's fixes' review, nit 4: the class gauge follows the store in the 1 s round, so with no status poll it
  // never holds a class older than the status's own 5 s read.
  it("keeps the class gauge fresh from the 1 s round, with no status request", async () => {
    const r = await rig();
    await r.checks(3);
    const metrics = JSON.parse(await capture.metricsJson()) as {
      name: string;
      points: [Record<string, string>, number][];
    }[];
    const gauge = metrics.find((m) => m.name === "h4.relay.status.class");
    const points = (gauge?.points ?? []).map(([a, v]) => [a["h4.class"], v]);
    expect(points.filter(([, v]) => v === 1)).toEqual([["local", 1]]);
  });

  // I2 (spec 004's Amendment A2): the route label, the status bucket's limit name, and the class gauge.
  it("I2. counts status apart from hello by its route label, and its 429s by status_per_minute", async () => {
    const r = await rig();
    await r.checks(3);
    await hello(r);
    for (let i = 0; i < 11; i += 1)
      await r.edge.inject({
        method: "GET",
        url: "/api/status",
        remoteAddress: EDGE_PEER,
        headers: { "cloudfront-viewer-address": VIEWER_HEADER },
      });
    const json = await capture.metricsJson();
    expect(json).toContain('"h4.relay.route":"hello"');
    expect(json).toContain('"h4.relay.route":"status"');
    expect(json).toContain('"h4.cap.limit":"status_per_minute"');
    expect(json).toContain("h4.relay.status.class");
  });

  it("I2. the class gauge is one-hot, the class the status would reduce to now", async () => {
    const r = await rig();
    await r.checks(3);
    await r.internal.inject({ method: "GET", url: "/api/status" });
    const metrics = JSON.parse(await capture.metricsJson()) as {
      name: string;
      points: [Record<string, string>, number][];
    }[];
    const gauge = metrics.find((m) => m.name === "h4.relay.status.class");
    const points = (gauge?.points ?? []).map(([a, v]) => [a["h4.class"], v]);
    expect(points.filter(([, v]) => v === 1)).toEqual([["local", 1]]);
    expect(points.map(([c]) => c).sort()).toEqual(["budget", "cloud", "local", "resting", "unavailable", "unknown"]);
  });

  it("I2. keeps a status answered below 500 out of traces, and a 5xx in them", async () => {
    const r = await rig();
    await r.checks(3);
    capture.spans.reset();
    await r.internal.inject({ method: "GET", url: "/api/status" });
    expect(capture.spans.getFinishedSpans().filter((s) => s.name === "relay.request")).toEqual([]);
    await hello(r);
    expect(capture.spans.getFinishedSpans().filter((s) => s.name === "relay.request")).toHaveLength(1);
  });

  // I3: no grace (the test-only commit before this one rewrote the two that pinned one).
  it("I3. a store read that fails after a good one answers store_unreachable, never the last verdict", async () => {
    const clock = new Clock();
    const store = new StubStore();
    const ks = new KillSwitch(store, clock.now);
    await ks.verdict();
    store.failing = true;
    clock.advance(1);
    expect(await ks.verdict()).toMatchObject({ kind: "degraded", cause: "store_unreachable" });
  });

  // I4: the serving gauges' label isn't the attribute the tunnel end's collector routes on, so each datapoint reaches
  // both hosts' Prometheus and the timeline stays one-hot.
  it("I4. labels which host serves, and each host's health, with keys the collector doesn't route on", async () => {
    const r = await rig();
    await r.checks(3);
    const metrics = JSON.parse(await capture.metricsJson()) as {
      name: string;
      points: [Record<string, string>, number][];
    }[];
    for (const name of ["h4.serving_host", "h4.relay.host_healthy"]) {
      const m = metrics.find((x) => x.name === name);
      expect(m?.points.length).toBeGreaterThan(0);
      for (const [attrs] of m?.points ?? []) expect(Object.keys(attrs)).not.toContain("h4.relay.host");
    }
    const serving = metrics.find((x) => x.name === "h4.serving_host");
    expect((serving?.points ?? []).map(([a, v]) => [a["h4.serving"], v]).sort()).toEqual([
      ["ec2", 0],
      ["laptop", 1],
      ["none", 0],
    ]);
  });

  // Nit 1: the visitor's traceparent never parents the relay's span, so a visitor can't turn sampling off or pick
  // the trace ID; the host still gets the relay's own.
  it("nit 1. starts its own root span on the edge listener, whatever traceparent a visitor sends", async () => {
    const r = await rig();
    await r.checks(3);
    const visitor = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-00";
    await hello(r, { traceparent: visitor });
    const span = capture.spans.getFinishedSpans().find((s) => s.name === "relay.request");
    expect(span?.spanContext().traceId).not.toBe("0123456789abcdef0123456789abcdef");
    expect(r.laptop.received[0]?.headers.traceparent).toMatch(/-01$/);
  });

  // Nit 4: yesterday's addresses go in the 1 s round, with no hello needed to sweep them.
  it("nit 4. drops a past day's addresses in the round, without a request", async () => {
    const r = await rig();
    await r.checks(3);
    await hello(r);
    expect(r.running.deps.cap.size).toBe(1);
    r.clock.advance(24 * 3_600_000);
    await r.checks(1);
    expect(r.running.deps.cap.size).toBe(0);
  });

  // Nit 6: a second host that fails before sending is marked failed too.
  it("nit 6. marks the second host failed when its forward couldn't connect either", async () => {
    const r = await rig();
    await r.checks(3);
    await r.laptop.close();
    await r.ec2.close();
    const res = await hello(r);
    expect(res.statusCode).toBe(503);
    expect(r.running.deps.hosts.healthy("ec2")).toBe(false);
  });
});

// Group 8's review B, nit 3: the edge's and the relay's no_host_serving text names no cause it can't know, since the
// edge answers it when the tunnel end is down, whatever the hosts are doing.
describe("group 8's review B", () => {
  it("nit 3. the no-host text is cause-neutral, and the edge's is the relay's", async () => {
    const { DETAIL } = await import("../src/bodies.js");
    const { readFileSync } = await import("node:fs");
    const web = readFileSync(new URL("../../../apps/web/build/degraded.ts", import.meta.url), "utf8");
    expect(DETAIL.no_host_serving).not.toMatch(/resting|isn't up|cloud host/);
    expect(web).toContain(JSON.stringify(DETAIL.no_host_serving));
  });
});
