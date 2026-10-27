// POST /room/events, the room's usage events (spec 002, tasks.md T058; contracts/room-events.md §3 and §4; FR-054,
// FR-055): the content type, the body's shape, the kind, and the ID, each refusal counted by its reason; the counters'
// labels; no body in a log record or a span; no store statement, ledger or reservation row, or journal entry; and a
// missing or invalid event list leaving the gateway starting, with every event answered 400.
//
// In its own file because it starts the telemetry SDK with exporters that keep what they receive, as
// telemetry-sdk.test.ts does: Fastify loads only after the SDK has started, so the requests' server spans are the
// running gateway's. The metrics are read from a meter of the test's own, collected on demand.
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SpanKind, trace, type ProxyTracerProvider } from "@opentelemetry/api";
import type { LogRecordExporter } from "@opentelemetry/sdk-logs";
import { metrics as sdkMetrics, type tracing } from "@opentelemetry/sdk-node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ROOM_EVENTS_FILE, loadRoomEvents, type RoomEventsConfig } from "../../src/config/room-events.js";
import { loadConfig, type LoadedConfig } from "../../src/config/validate.js";
import { readMigrations, type Migration } from "../../src/meter/store.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { startTelemetry, type Telemetry } from "../../src/telemetry/otel.js";
import type { TestStack } from "../helpers/stack.js";
import { testDatabase, type TestDatabase } from "../helpers/pglite.js";

const REPO_CONFIG = fileURLToPath(new URL("../../../../config/", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
/** Written into bodies and headers: it must never reach a span, a log record, or a metric. */
const SENTINEL = "zebra-sentinel";

const DEV_ENV = {
  H4_STACK: "dev",
  H4_ENV: "dev",
  OPERATOR_TOKEN_SHA256: "ab".repeat(32),
  ALERT_DELIVERY: "standin",
  GATEWAY_TEST_CLOCK: "1",
  GATEWAY_TEST_SYNTHETIC_SPEND: "1",
  TELEMETRY_PAYLOAD_SAMPLING: "off",
  LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1",
  LOCAL_MODEL_NAME: "stand-in",
  AWS_PROFILE: "none",
};

/** An exporter that keeps its records past shutdown, unlike the SDK's in-memory ones. */
function keeping<T>() {
  const got: T[] = [];
  return {
    got,
    exporter: {
      export(items: T[], done: (result: { code: number }) => void) {
        got.push(...items);
        done({ code: 0 });
      },
      shutdown: async () => {},
      forceFlush: async () => {},
    },
  };
}

/** The gateway's instruments on a meter of the test's own, collected on demand. */
function meterHarness() {
  const exporter = new sdkMetrics.InMemoryMetricExporter(sdkMetrics.AggregationTemporality.CUMULATIVE);
  const reader = new sdkMetrics.PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  const provider = new sdkMetrics.MeterProvider({ readers: [reader] });
  return {
    metrics: new GatewayMetrics(provider.getMeter("gateway")),
    /** Each data point of `name`: its attributes and its value. */
    async points(name: string): Promise<[Record<string, unknown>, number][]> {
      const { resourceMetrics, errors } = await reader.collect();
      expect(errors).toEqual([]);
      const found = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics).find((m) => m.descriptor.name === name);
      return (found?.dataPoints ?? []).map((p) => [p.attributes, p.value as number]);
    },
    shutdown: () => provider.shutdown(),
  };
}

const spans = keeping<tracing.ReadableSpan>();
const logs = keeping<unknown>();
let telemetry: Telemetry;
let testStack: typeof import("../helpers/stack.js").testStack;
let startGateway: typeof import("../../src/app.js").startGateway;
let events: RoomEventsConfig;
let config: LoadedConfig;
let migrations: Migration[];
const saved = { name: process.env.OTEL_SERVICE_NAME, attrs: process.env.OTEL_RESOURCE_ATTRIBUTES };

beforeAll(async () => {
  process.env.OTEL_SERVICE_NAME = "gateway";
  process.env.OTEL_RESOURCE_ATTRIBUTES = "service.namespace=h4reet,deployment.environment.name=dev";
  telemetry = startTelemetry({
    version: "0.1.0",
    exporters: {
      logs: logs.exporter as unknown as LogRecordExporter,
      traces: spans.exporter as unknown as tracing.SpanExporter,
      metrics: new sdkMetrics.InMemoryMetricExporter(sdkMetrics.AggregationTemporality.CUMULATIVE),
    },
  });
  // Fastify loads only now, after the SDK has started.
  ({ testStack } = await import("../helpers/stack.js"));
  ({ startGateway } = await import("../../src/app.js"));
  const loaded = await loadRoomEvents(REPO_CONFIG);
  if (!loaded.ok) throw new Error(`config/room-events.yaml doesn't load: ${loaded.reason} ${loaded.path}`);
  events = loaded.config;
  config = await loadConfig(FIXTURES, { allowPlanned: false });
  migrations = await readMigrations();
});

afterAll(async () => {
  await telemetry.shutdown();
  for (const [key, value] of [
    ["OTEL_SERVICE_NAME", saved.name],
    ["OTEL_RESOURCE_ATTRIBUTES", saved.attrs],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

beforeEach(() => {
  spans.got.length = 0;
});

/** A stack with the committed event list (or `list`), and its metrics on the test's own meter. */
async function stackWith(o: { list?: RoomEventsConfig | null; storeDown?: boolean } = {}) {
  const meter = meterHarness();
  const stack = await testStack({
    roomEvents: o.list === undefined ? events : o.list,
    metrics: meter.metrics,
    ...(o.storeDown === true ? { storeDown: true } : {}),
  });
  cleanups.push(
    () => stack.db.close(),
    () => stack.close(),
    () => meter.shutdown(),
  );
  return { stack, meter };
}

const BEACON = "text/plain;charset=UTF-8"; // what navigator.sendBeacon sends with a string body

function post(stack: TestStack, body: string | undefined, contentType: string | null = BEACON) {
  return stack.api.inject({
    method: "POST",
    url: "/room/events",
    headers: contentType === null ? {} : { "content-type": contentType },
    ...(body === undefined ? {} : { payload: body }),
  });
}

const firstItem = (): string => [...events.items][0] as string;

describe("POST /room/events accepts", () => {
  it("each kind, with its ID where it takes one, as JSON or as the beacon's text: 204, no body, one count", async () => {
    const { stack, meter } = await stackWith();
    const item = firstItem();
    const sent = [
      { kind: "object_selected", id: "laptop" },
      { kind: "item_selected", id: item },
      { kind: "resume_opened" },
      { kind: "resume_kept" },
      { kind: "pdf_downloaded" },
      { kind: "turn_sent" },
      { kind: "voice_pressed" },
      { kind: "mode_2d" },
    ];
    for (const [i, event] of sent.entries()) {
      const res = await post(stack, JSON.stringify(event), i % 2 === 0 ? BEACON : "application/json");
      expect(res.statusCode, event.kind).toBe(204);
      expect(res.body, event.kind).toBe("");
      expect(res.headers["cache-control"]).toBe("no-store");
    }
    await post(stack, JSON.stringify({ kind: "object_selected", id: "laptop" }));
    expect(await meter.points("h4.room.events")).toEqual([
      [{ kind: "object_selected", id: "laptop" }, 2],
      [{ kind: "item_selected", id: item }, 1],
      [{ kind: "resume_opened", id: "-" }, 1],
      [{ kind: "resume_kept", id: "-" }, 1],
      [{ kind: "pdf_downloaded", id: "-" }, 1],
      [{ kind: "turn_sent", id: "-" }, 1],
      [{ kind: "voice_pressed", id: "-" }, 1],
      [{ kind: "mode_2d", id: "-" }, 1],
    ]);
    expect(await meter.points("h4.room.events.refused")).toEqual([]);
  });

  it("answers while the store is down: an event reads nothing from it", async () => {
    const { stack } = await stackWith({ storeDown: true });
    expect((await post(stack, '{"kind":"mode_2d"}')).statusCode).toBe(204);
  });
});

describe("POST /room/events refuses, and counts each refusal by its reason", () => {
  it("a content type other than JSON or text, or none, with 415 content_type", async () => {
    const { stack, meter } = await stackWith();
    const body = '{"kind":"mode_2d"}';
    for (const type of [
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      "text/html",
      "garbage",
    ]) {
      const res = await post(stack, body, type);
      expect(res.statusCode, type).toBe(415);
      expect(res.json(), type).toEqual({ error: "unsupported_media_type", request_id: res.headers["x-request-id"] });
    }
    expect((await post(stack, body, null)).statusCode).toBe(415);
    expect((await post(stack, undefined, null)).statusCode).toBe(415);
    expect(await meter.points("h4.room.events.refused")).toEqual([[{ reason: "content_type" }, 6]]);
    expect(await meter.points("h4.room.events")).toEqual([]);
  });

  it.each([
    ["not JSON", "kind=mode_2d"],
    ["empty", ""],
    ["an array", '["mode_2d"]'],
    ["null", "null"],
    ["a string", '"mode_2d"'],
    ["no kind", "{}"],
    ["a kind that isn't a string", '{"kind":7}'],
    ["an extra field", '{"kind":"mode_2d","path":"engineer"}'],
    ["the avatar", '{"kind":"mode_2d","avatar":"dog"}'],
    ["a time", '{"kind":"mode_2d","time":"2026-10-18T00:00:00Z"}'],
    ["an ID on a kind that takes none", '{"kind":"mode_2d","id":"laptop"}'],
    ["no ID on a kind that takes one", '{"kind":"object_selected"}'],
    ["an ID that isn't a string", '{"kind":"object_selected","id":3}'],
    ["a prototype key", '{"kind":"mode_2d","__proto__":{"id":"laptop"}}'],
  ])("a body that isn't {kind} or {kind, id} (%s), with 400 shape", async (_name, body) => {
    const { stack, meter } = await stackWith();
    const res = await post(stack, body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: "invalid_request",
      field: "body",
      detail: "must be {kind} or {kind, id}",
      request_id: res.headers["x-request-id"],
    });
    expect(await meter.points("h4.room.events.refused")).toEqual([[{ reason: "shape" }, 1]]);
    expect(await meter.points("h4.room.events")).toEqual([]);
  });

  it("a kind the list doesn't hold, with 400 kind", async () => {
    const { stack, meter } = await stackWith();
    for (const body of ['{"kind":"page_viewed"}', '{"kind":"OBJECT_SELECTED","id":"laptop"}', '{"kind":""}']) {
      const res = await post(stack, body);
      expect(res.statusCode, body).toBe(400);
      expect(res.json(), body).toMatchObject({ error: "invalid_request", field: "kind", detail: "unknown kind" });
    }
    expect(await meter.points("h4.room.events.refused")).toEqual([[{ reason: "kind" }, 3]]);
  });

  it("an ID the list doesn't hold for its kind, with 400 id", async () => {
    const { stack, meter } = await stackWith();
    const item = firstItem();
    for (const body of [
      '{"kind":"object_selected","id":"piano"}',
      `{"kind":"object_selected","id":"${item}"}`,
      '{"kind":"item_selected","id":"laptop"}',
      `{"kind":"item_selected","id":"${SENTINEL}"}`,
    ]) {
      const res = await post(stack, body);
      expect(res.statusCode, body).toBe(400);
      expect(res.json(), body).toMatchObject({
        error: "invalid_request",
        field: "id",
        detail: "unknown ID for its kind",
      });
    }
    expect(await meter.points("h4.room.events.refused")).toEqual([[{ reason: "id" }, 4]]);
    expect(await meter.points("h4.room.events")).toEqual([]);
  });
});

describe("a kind named like an Object property", () => {
  it("is a kind like any other: no inherited property makes it take an ID, or makes a 500", async () => {
    // config/room-events.yaml's kind pattern allows `constructor`, `toString`, and `hasOwnProperty` (review, item 2).
    const list: RoomEventsConfig = {
      kinds: new Set(["constructor", "toString", "hasOwnProperty", "object_selected"]),
      objects: new Set(["laptop"]),
      items: new Set(),
    };
    const { stack, meter } = await stackWith({ list });
    const answers: [string, number][] = [];
    for (const body of [
      '{"kind":"constructor"}',
      '{"kind":"toString"}',
      '{"kind":"constructor","id":"laptop"}',
      '{"kind":"hasOwnProperty","id":"objects"}',
      '{"kind":"__proto__","id":"laptop"}',
    ]) {
      answers.push([body, (await post(stack, body)).statusCode]);
    }
    expect(answers.map(([, status]) => status)).toEqual([204, 204, 400, 400, 400]);
    expect(await meter.points("h4.room.events")).toEqual([
      [{ kind: "constructor", id: "-" }, 1],
      [{ kind: "toString", id: "-" }, 1],
    ]);
    expect(await meter.points("h4.room.events.refused")).toEqual([
      [{ reason: "shape" }, 2],
      [{ reason: "kind" }, 1],
    ]);
  });
});

describe("the counters", () => {
  it("carry the kind and the ID, or the reason, and nothing about the client", async () => {
    const { stack, meter } = await stackWith();
    const client = { "x-forwarded-for": "203.0.113.9", "x-h4-client": "author-laptop", "user-agent": SENTINEL };
    for (const payload of ['{"kind":"object_selected","id":"bicycle"}', '{"kind":"page_viewed"}']) {
      await stack.api.inject({
        method: "POST",
        url: "/room/events",
        headers: { "content-type": BEACON, ...client },
        payload,
      });
    }
    const counted = await meter.points("h4.room.events");
    const refused = await meter.points("h4.room.events.refused");
    expect(counted.map(([a]) => Object.keys(a).sort())).toEqual([["id", "kind"]]);
    expect(refused.map(([a]) => Object.keys(a))).toEqual([["reason"]]);
    const all = JSON.stringify([counted, refused]);
    for (const forbidden of ["203.0.113.9", "author-laptop", SENTINEL, "request_id", "trace_id"]) {
      expect(all).not.toContain(forbidden);
    }
  });
});

describe("what an event leaves behind", () => {
  it("no log record and no span with the body, and its own server span", async () => {
    const { stack } = await stackWith();
    await stack.api.listen({ host: "127.0.0.1", port: 0 });
    const url = `http://127.0.0.1:${(stack.api.server.address() as { port: number }).port}/room/events`;
    const logged = stack.logged.length;
    const bodies = [
      '{"kind":"mode_2d"}',
      `{"kind":"item_selected","id":"${SENTINEL}-id"}`,
      `{"kind":"mode_2d","note":"${SENTINEL}-field"}`,
      `${SENTINEL}-not-json`,
    ];
    const statuses: number[] = [];
    for (const body of bodies) {
      const res = await fetch(url, { method: "POST", headers: { "content-type": BEACON }, body });
      statuses.push(res.status);
      await res.arrayBuffer();
    }
    expect(statuses).toEqual([204, 400, 400, 400]);
    // The route writes no log record at all, accepted or refused.
    expect(stack.logged.length).toBe(logged);
    expect(JSON.stringify(stack.logged)).not.toContain(SENTINEL);

    const servers = (all: tracing.ReadableSpan[]) =>
      all.filter(
        (s) =>
          s.kind === SpanKind.SERVER &&
          s.instrumentationScope.name === "@opentelemetry/instrumentation-http" &&
          s.attributes["url.path"] === "/room/events",
      );
    await vi.waitFor(
      async () => {
        await (
          (trace.getTracerProvider() as ProxyTracerProvider).getDelegate() as unknown as {
            forceFlush(): Promise<void>;
          }
        ).forceFlush();
        expect(servers(spans.got)).toHaveLength(4);
      },
      { timeout: 5_000, interval: 25 },
    );
    const own = servers(spans.got);
    expect(own.map((s) => s.attributes["h4.outcome"])).toEqual(["ok", "invalid", "invalid", "invalid"]);
    expect(own.every((s) => s.attributes["h4.stack"] === "dev")).toBe(true);
    expect(JSON.stringify(spans.got.map((s) => [s.name, s.attributes, s.events]))).not.toContain(SENTINEL);
    expect(JSON.stringify(logs.got)).not.toContain(SENTINEL);
  });

  it("no store statement, no ledger, reservation, or audit row, and no journal entry", async () => {
    const { stack } = await stackWith();
    const statements = stack.db.statements.length;
    await post(stack, '{"kind":"object_selected","id":"laptop"}');
    await post(stack, '{"kind":"turn_sent"}');
    await post(stack, '{"kind":"page_viewed"}');
    await post(stack, '{"kind":"mode_2d"}', "text/html");
    expect(stack.db.statements.slice(statements)).toEqual([]);
    for (const table of ["gateway.ledger", "gateway.reservations", "gateway.audit_log"]) {
      const rows = await stack.db.query(`SELECT count(*)::int AS n FROM ${table}`, []);
      expect(rows.rows[0], table).toEqual({ n: 0 });
    }
    const journal = join(stack.stateDir, "journal");
    expect(existsSync(journal) ? readdirSync(journal) : []).toEqual([]);
  });
});

describe("without the event list", () => {
  it("every event is 400 id, counted, after the content type and the shape are checked", async () => {
    const { stack, meter } = await stackWith({ list: null });
    for (const body of ['{"kind":"object_selected","id":"laptop"}', '{"kind":"mode_2d"}', '{"kind":"page_viewed"}']) {
      const res = await post(stack, body);
      expect(res.statusCode, body).toBe(400);
      expect(res.json(), body).toMatchObject({ error: "invalid_request", field: "id" });
    }
    expect((await post(stack, '{"kind":"mode_2d"}', "text/html")).statusCode).toBe(415);
    expect((await post(stack, '{"kind":"mode_2d","path":"engineer"}')).statusCode).toBe(400);
    expect(await meter.points("h4.room.events.refused")).toEqual([
      [{ reason: "id" }, 3],
      [{ reason: "content_type" }, 1],
      [{ reason: "shape" }, 1],
    ]);
    expect(await meter.points("h4.room.events")).toEqual([]);
  });

  async function startWith(text: string | undefined) {
    const dir = await mkdtemp(join(tmpdir(), "h4-room-events-"));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    if (text !== undefined) await writeFile(join(dir, ROOM_EVENTS_FILE), text, "utf8");
    const db: TestDatabase = await testDatabase();
    cleanups.push(() => db.close());
    const logged: { level: string; record: Record<string, unknown> }[] = [];
    const at = (level: string) => (record: object) =>
      void logged.push({ level, record: record as Record<string, unknown> });
    const result = await startGateway({
      env: DEV_ENV,
      config,
      logger: { info: at("info"), warn: at("warn"), error: at("error"), fatal: at("fatal") },
      version: "0.1.0",
      database: db,
      migrations,
      listen: { host: "127.0.0.1", apiPort: 0, adminPort: 0 },
      onFatal: () => {},
      roomEvents: await loadRoomEvents(dir),
    });
    expect(result.kind).toBe("running");
    if (result.kind !== "running") throw new Error("the gateway didn't start");
    cleanups.push(() => result.close());
    const res = await fetch(`http://127.0.0.1:${result.ports.api}/room/events`, {
      method: "POST",
      headers: { "content-type": BEACON },
      body: '{"kind":"object_selected","id":"laptop"}',
    });
    return { logged, status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("a missing file: the gateway starts, logs why, and answers every event 400 id", async () => {
    const { logged, status, body } = await startWith(undefined);
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: "invalid_request", field: "id" });
    const warned = logged.filter((l) => l.record.event === "room_events.unavailable");
    expect(warned).toEqual([
      { level: "warn", record: { event: "room_events.unavailable", reason: "missing", path: "" } },
    ]);
    expect(logged.some((l) => l.record.event === "gateway.started")).toBe(true);
  });

  it("an invalid file: the same, naming where it's invalid and never a value from it", async () => {
    const { logged, status } = await startWith(
      `schema: 1\nkinds: ["mode_2d"]\nobjects: ["${SENTINEL} x"]\nitems: []\n`,
    );
    expect(status).toBe(400);
    const warned = logged.filter((l) => l.record.event === "room_events.unavailable");
    expect(warned).toEqual([
      { level: "warn", record: { event: "room_events.unavailable", reason: "invalid", path: "objects[0]" } },
    ]);
    expect(JSON.stringify(logged)).not.toContain(SENTINEL);
    expect(logged.some((l) => l.record.event === "gateway.started")).toBe(true);
  });
});
