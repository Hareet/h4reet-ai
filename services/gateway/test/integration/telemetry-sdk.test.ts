// The SDK as the gateway starts it (telemetry.md §3.1, §5.1), with exporters that keep what they receive, and real
// instrumented traffic: requests to both listeners, outgoing fetch and node:http calls, and pg queries against a fake
// Postgres. In its own file because it registers the global providers and enables the instrumentations for its
// worker; Fastify, pg, and pino load only after the SDK has started, as server.ts orders it.
import { SpanKind, trace, type ProxyTracerProvider } from "@opentelemetry/api";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { metrics as sdkMetrics, type tracing } from "@opentelemetry/sdk-node";
import type { FastifyInstance } from "fastify";
import type { LookupAddress } from "node:dns";
import { createServer, type AddressInfo, type LookupFunction } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "../../src/meter/store.js";
import { startTelemetry, type Telemetry } from "../../src/telemetry/otel.js";
import { fakePostgres } from "../helpers/fake-postgres.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));

/**
 * telemetry.md §3.1: the client's attributes and the query string never leave the gateway. instrumentation-http
 * records the query as url.query on server spans, and both client instrumentations inside url.full.
 */
const NEVER_EXPORTED = [
  "client.address",
  "client.port",
  "network.peer.address",
  "network.peer.port",
  "user_agent.original",
  "url.query",
  "url.full",
];

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

const quiet = { info() {}, warn() {}, error() {}, fatal() {} };
const logs = keeping<ReadableLogRecord>();
const spans = keeping<tracing.ReadableSpan>();
let telemetry: Telemetry;
let api: FastifyInstance;
let admin: FastifyInstance;
let apiUrl: string;
let adminUrl: string;
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
    // Stands in for api.telegram.org, which this test must not call: requests to it carry the bot token.
    telegramHosts: ["telegram-standin"],
  });
  const { buildApp } = await import("../../src/app.js");
  ({ api, admin } = buildApp({ stack: "dev", logger: quiet }));
  await api.listen({ host: "127.0.0.1", port: 0 });
  await admin.listen({ host: "127.0.0.1", port: 0 });
  const port = (app: FastifyInstance) => (app.server.address() as { port: number }).port;
  apiUrl = `http://127.0.0.1:${port(api)}`;
  adminUrl = `http://127.0.0.1:${port(admin)}`;
});

afterAll(async () => {
  await api.close();
  await admin.close();
  await telemetry.shutdown();
  for (const [key, value] of [
    ["OTEL_SERVICE_NAME", saved.name],
    ["OTEL_RESOURCE_ATTRIBUTES", saved.attrs],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  spans.got.length = 0;
  logs.got.length = 0;
});

async function flush(): Promise<void> {
  const provider = (trace.getTracerProvider() as ProxyTracerProvider).getDelegate() as unknown as {
    forceFlush(): Promise<void>;
  };
  await provider.forceFlush();
}

/** Flush until `ready` holds over the spans exported so far. */
async function exported(ready: (s: tracing.ReadableSpan[]) => boolean): Promise<tracing.ReadableSpan[]> {
  await vi.waitFor(
    async () => {
      await flush();
      expect(ready(spans.got)).toBe(true);
    },
    { timeout: 5_000, interval: 25 },
  );
  return spans.got;
}

const scope = (s: tracing.ReadableSpan): string => s.instrumentationScope.name;

/** A DNS lookup that answers 127.0.0.1 for every name, in both of the shapes node:net asks for. */
const toLoopback: LookupFunction = (_hostname, options, callback) => {
  if (options.all) (callback as (e: null, a: LookupAddress[]) => void)(null, [{ address: "127.0.0.1", family: 4 }]);
  else callback(null, "127.0.0.1", 4);
};
const path = (s: tracing.ReadableSpan): string => String(s.attributes["url.path"] ?? "");
const serverSpanFor = (route: string) => (s: tracing.ReadableSpan[]) =>
  s.some((x) => x.kind === SpanKind.SERVER && path(x) === route);

describe("the started SDK", () => {
  it("sends pino's records over OTLP, redacted as on stdout", async () => {
    // log.ts requires pino only now, after the SDK has started.
    const { createLogger } = await import("../../src/telemetry/log.js");
    const lines: string[] = [];
    const logger = createLogger({ stack: "dev", destination: { write: (s: string) => void lines.push(s) } });
    logger.info({ event: "gateway.started", password: "not-for-logs", input_tokens: 3 }, "The gateway started.");
    await vi.waitFor(
      async () => {
        const provider = (await import("@opentelemetry/api-logs")).logs.getLoggerProvider() as unknown as {
          forceFlush?(): Promise<void>;
          getDelegate?(): { forceFlush(): Promise<void> };
        };
        await (provider.getDelegate?.() ?? provider).forceFlush?.();
        expect(logs.got).toHaveLength(1);
      },
      { timeout: 5_000, interval: 25 },
    );
    expect(lines).toHaveLength(1);
    const record = logs.got[0] as ReadableLogRecord;
    expect(record.body).toBe("The gateway started.");
    expect(record.severityNumber).toBe(9);
    expect(record.attributes).toMatchObject({ event: "gateway.started", "h4.stack": "dev", input_tokens: 3 });
    expect(record.attributes.password).toBe("[redacted]");
    expect(JSON.stringify(record.attributes)).not.toContain("not-for-logs");
  });

  it("exports a request's spans on both listeners without the query string or the client's attributes", async () => {
    const hello = await fetch(`${apiUrl}/hello?message=hello-payload&label=author-terminal`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "curl/8.0-test" },
      body: "{}",
    });
    expect(hello.status).toBe(404); // these listeners are bare, with no /hello; the URL reaches the spans either way
    const status = await fetch(`${adminUrl}/admin/status?reason=hello-payload`);
    expect(status.status).toBe(401);
    const got = await exported((s) => serverSpanFor("/hello")(s) && serverSpanFor("/admin/status")(s));

    const servers = got.filter((s) => s.kind === SpanKind.SERVER && scope(s) === "@opentelemetry/instrumentation-http");
    expect(servers.map(path).sort()).toEqual(["/admin/status", "/hello"]);
    expect(got.some((s) => scope(s) === "@fastify/otel")).toBe(true);
    for (const s of got) {
      for (const key of NEVER_EXPORTED) expect(Object.keys(s.attributes), `${s.name}: ${key}`).not.toContain(key);
      expect(path(s), s.name).not.toContain("?");
    }
    expect(JSON.stringify(got.map((s) => [s.name, s.attributes, s.events]))).not.toMatch(
      /hello-payload|author-terminal|curl\/8\.0-test/,
    );
    expect(servers[0]?.resource.attributes).toMatchObject({
      "service.name": "gateway",
      "service.namespace": "h4reet",
      "deployment.environment.name": "dev",
      "service.version": "0.1.0",
    });
  });

  it("makes no span for a health probe", async () => {
    expect((await fetch(`${apiUrl}/health/live?probe=1`)).status).toBe(200);
    expect((await fetch(`${apiUrl}/after-the-probe`)).status).toBe(404);
    const got = await exported(serverSpanFor("/after-the-probe"));
    expect(got.filter((s) => path(s).startsWith("/health") || s.name.includes("health"))).toEqual([]);
  });

  it("makes an outgoing fetch's span only inside a request's trace, and none for the Telegram host", async () => {
    // The Telegram stand-in answers over a bare socket: an http server here would make server spans of its own.
    let telegramCalls = 0;
    let telegramRequest = "";
    const telegram = createServer((socket) => {
      telegramCalls += 1;
      socket.once("data", (data) => {
        telegramRequest += data.toString("latin1");
        socket.end("HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\n{}");
      });
    });
    await new Promise<void>((resolve) => telegram.listen(0, "127.0.0.1", resolve));
    const telegramPort = (telegram.address() as AddressInfo).port;
    try {
      // Only an in-stack service is instrumented, so the fetches name one; an address never is (undiciIgnoreHook).
      const inStack = apiUrl.replace("127.0.0.1", "localhost");
      await fetch(`${inStack}/fetch-without-parent`);
      const tracer = trace.getTracer("test");
      const [parentId, sentToTelegram] = await tracer.startActiveSpan("parent-fetch", async (parent) => {
        await fetch(`${inStack}/fetch-with-parent?q=fetch-query`);
        // By address, as the stand-in's own name doesn't resolve here; the unit test covers the Telegram names.
        const answer = await fetch(`http://127.0.0.1:${telegramPort}/botTEST-not-a-token/sendMessage`, {
          method: "POST",
        });
        parent.end();
        return [parent.spanContext().spanId, await answer.text()] as const;
      });
      expect([sentToTelegram, telegramCalls]).toEqual(["{}", 1]);
      // The ignore hook returns before the injection too: no trace context reaches the Telegram host.
      expect(telegramRequest).toMatch(/^POST \/botTEST-not-a-token\/sendMessage /);
      expect(telegramRequest.toLowerCase()).not.toMatch(/traceparent|tracestate|baggage/);
      const got = await exported(
        (s) => s.some((x) => x.name === "parent-fetch") && serverSpanFor("/fetch-with-parent")(s),
      );
      const clients = got.filter(
        (s) => s.kind === SpanKind.CLIENT && scope(s) === "@opentelemetry/instrumentation-undici",
      );
      expect(clients.map(path)).toEqual(["/fetch-with-parent"]);
      expect(clients[0]?.parentSpanContext?.spanId).toBe(parentId);
      for (const s of got) {
        for (const key of NEVER_EXPORTED) expect(Object.keys(s.attributes), `${s.name}: ${key}`).not.toContain(key);
      }
      expect(JSON.stringify(got.map((s) => [s.name, s.attributes]))).not.toMatch(/fetch-query|botTEST|sendMessage/);
    } finally {
      await new Promise((resolve) => telegram.close(resolve));
    }
  });

  it("makes an outgoing node:http span only inside a request's trace", async () => {
    // Looked up at call time, after the instrumentation has wrapped the module.
    const http = (await import("node:http")).default;
    const apiPort = (api.server.address() as AddressInfo).port;
    // Only an in-stack service is instrumented (httpIgnoreOutgoingHook), so the request names one, and the lookup
    // sends it to the test's listener.
    const get = (p: string) =>
      new Promise<void>((resolve, reject) => {
        http
          .get({ hostname: "gateway-under-test", port: apiPort, path: p, lookup: toLoopback }, (res) => {
            res.resume();
            res.on("end", resolve);
          })
          .on("error", reject);
      });
    await get("/http-without-parent");
    const tracer = trace.getTracer("test");
    const parentId = await tracer.startActiveSpan("parent-http", async (parent) => {
      await get("/http-with-parent?q=http-query");
      parent.end();
      return parent.spanContext().spanId;
    });
    const got = await exported((s) => s.some((x) => x.name === "parent-http") && serverSpanFor("/http-with-parent")(s));
    const clients = got.filter((s) => s.kind === SpanKind.CLIENT && scope(s) === "@opentelemetry/instrumentation-http");
    expect(clients).toHaveLength(1);
    expect(clients[0]?.parentSpanContext?.spanId).toBe(parentId);
    for (const s of got) {
      for (const key of NEVER_EXPORTED) expect(Object.keys(s.attributes), `${s.name}: ${key}`).not.toContain(key);
    }
    expect(JSON.stringify(got.map((s) => [s.name, s.attributes]))).not.toContain("http-query");
  });

  it("sends no trace context out of the stack over node:http, and none to the Telegram host", async () => {
    const http = (await import("node:http")).default;
    const received: string[] = [];
    const outside = createServer((socket) => {
      socket.once("data", (data) => {
        received.push(data.toString("latin1"));
        socket.end("HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\n{}");
      });
    });
    await new Promise<void>((resolve) => outside.listen(0, "127.0.0.1", resolve));
    const port = (outside.address() as AddressInfo).port;
    const get = (hostname: string, p: string) =>
      new Promise<void>((resolve, reject) => {
        http
          .get({ hostname, port, path: p, lookup: toLoopback }, (res) => {
            res.resume();
            res.on("end", resolve);
          })
          .on("error", reject);
      });
    try {
      const tracer = trace.getTracer("test");
      await tracer.startActiveSpan("parent-outside", async (parent) => {
        await get("bedrock-runtime.us-east-1.amazonaws.com", "/model/m/converse"); // as T102's adapter will
        await get("127.0.0.1", "/an-address");
        await get("telegram-standin", "/botTEST-not-a-token/sendMessage"); // this test's Telegram host
        parent.end();
      });
      expect(received).toHaveLength(3);
      for (const request of received) expect(request.toLowerCase()).not.toMatch(/traceparent|tracestate|baggage/);
      const got = await exported((s) => s.some((x) => x.name === "parent-outside"));
      const clients = got.filter(
        (s) => s.kind === SpanKind.CLIENT && scope(s) === "@opentelemetry/instrumentation-http",
      );
      expect(clients).toEqual([]);
      expect(JSON.stringify(got.map((s) => [s.name, s.attributes]))).not.toMatch(/converse|an-address|botTEST/);
    } finally {
      await new Promise((resolve) => outside.close(resolve));
    }
  });

  it("makes pg spans only inside a request's trace, with no values, and scrubs the role-password statement", async () => {
    const server = await fakePostgres("answer");
    const { pgDatabase } = await import("../../src/meter/store.js"); // pg itself loads inside pgDatabase
    const db = pgDatabase({
      host: "127.0.0.1",
      port: server.port,
      database: "gateway",
      user: "gateway",
      password: "x",
    });
    try {
      await db.query("SELECT 1 AS outside");
      const tracer = trace.getTracer("test");
      await tracer.startActiveSpan("parent-pg", async (parent) => {
        await db.query("SELECT 2 AS inside");
        await db.query("SELECT $1::text AS label", ["a-visitor-label"]);
        await db.query("ALTER ROLE grafana_ro PASSWORD 'SCRAM-SHA-256$4096:c2FsdA==$c3RvcmVk:c2VydmVy'");
        parent.end();
      });
      const got = await exported((s) => s.some((x) => x.name === "parent-pg"));
      const queries = got
        .filter((s) => scope(s) === "@opentelemetry/instrumentation-pg")
        .map((s) => s.attributes["db.query.text"])
        .filter((t) => t !== undefined);
      expect(queries).toEqual([
        "SELECT 2 AS inside",
        "SELECT $1::text AS label",
        "ALTER ROLE grafana_ro PASSWORD [redacted]",
      ]);
      expect(server.queries).toEqual([
        "SELECT 1 AS outside",
        "SELECT 2 AS inside",
        "SELECT $1::text AS label",
        "ALTER ROLE grafana_ro PASSWORD 'SCRAM-SHA-256$4096:c2FsdA==$c3RvcmVk:c2VydmVy'",
      ]);
      // Placeholders, never values: enhancedDatabaseReporting would add the parameters to the span.
      expect(JSON.stringify(got.map((s) => [s.name, s.attributes]))).not.toMatch(/SCRAM-SHA-256|a-visitor-label/);
    } finally {
      await db.close();
      await server.close();
    }
  });

  it("puts h4.stack, h4.outcome, and the degraded cause on instrumentation-http's SERVER span for POST /hello", async () => {
    // instrumentation-http's requestHook leaves the incoming request's SERVER span on it, and the listener's onSend
    // annotates that span (telemetry.md §3.3). A store that is down answers store_unreachable before any adapter call.
    const { buildApp: build, createServices } = await import("../../src/app.js");
    const { loadConfig } = await import("../../src/config/validate.js");
    const { Store } = await import("../../src/meter/store.js");
    const refuse = () => Promise.reject(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    const down: Database = { query: refuse, withSession: refuse, listen: refuse, close: async () => {} };
    const store = new Store({
      db: down,
      migrations: [],
      envClass: "dev",
      logger: quiet,
      onFatal: () => {},
      retryMs: 60_000,
    });
    await store.start();
    const services = await createServices({
      forwardedBy: async (peer) => peer === "127.0.0.1" || peer === "::ffff:127.0.0.1", // edge, in tests
      env: {
        H4_STACK: "dev",
        H4_ENV: "dev",
        LOCAL_MODEL_BASE_URL: "http://model-server:8080/v1",
        LOCAL_MODEL_NAME: "stand-in",
      },
      config: await loadConfig(FIXTURES, { allowPlanned: false }),
      store,
      logger: quiet,
      version: "0.1.0",
    });
    const { api: hello } = build({ stack: "dev", logger: quiet, services });
    await hello.listen({ host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(`http://127.0.0.1:${(hello.server.address() as AddressInfo).port}/hello`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-h4-client": "sdk-label" },
        body: JSON.stringify({ message: "sdk-payload" }),
      });
      expect(res.status).toBe(503);
      expect(res.headers.get("x-h4-degraded-cause")).toBe("store_unreachable");
      const got = await exported((s) => s.some((x) => x.name === "gateway.route"));
      const server = got.find(
        (s) => s.kind === SpanKind.SERVER && scope(s) === "@opentelemetry/instrumentation-http" && path(s) === "/hello",
      );
      expect(server?.attributes).toMatchObject({
        "http.route": "/hello",
        "http.response.status_code": 503,
        "h4.stack": "dev",
        "h4.outcome": "degraded",
        "h4.degraded.cause": "store_unreachable",
      });
      const route = got.find((s) => s.name === "gateway.route");
      expect(route?.spanContext().traceId).toBe(server?.spanContext().traceId);
      expect(route?.attributes).toMatchObject({ "h4.state": "unknown", "h4.degraded.cause": "store_unreachable" });
      expect(JSON.stringify(got.map((s) => [s.name, s.attributes, s.events]))).not.toMatch(/sdk-payload|sdk-label/);
    } finally {
      await hello.close();
      await services.gateway.close();
      await store.close();
    }
  });

  it("gives POST /admin/studio-window the admin listener's SERVER span: route, stack, outcome, and state, never the reason", async () => {
    // spec 003's contracts/gpu-window.md §1 (tasks.md T034): the window's endpoint has the span every admin route
    // has (telemetry.md §3.3), annotated by the listener's onSend. Loaded here, after the SDK started, as app.js is.
    const { testStack } = await import("../helpers/stack.js");
    const st = await testStack({ stack: "dev-cpu" });
    await st.admin.listen({ host: "127.0.0.1", port: 0 });
    const url = `http://127.0.0.1:${(st.admin.server.address() as AddressInfo).port}`;
    const post = (route: string, body: unknown) =>
      fetch(`${url}${route}`, {
        method: "POST",
        headers: { ...st.auth(), "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      const init = await post("/admin/init", { reason: "span test: a fresh store", confirm_zero: true, renew: true });
      expect(init.status).toBe(200);
      spans.got.length = 0;
      expect((await post("/admin/studio-window", { state: "start", reason: "span-reason: a studio job" })).status).toBe(
        200,
      );
      expect((await post("/admin/studio-window", { state: "start", reason: "span-reason: once more" })).status).toBe(
        409,
      );
      expect(
        (await post("/admin/studio-window", { state: "pause", reason: "span-reason: no such state" })).status,
      ).toBe(400);
      const windows = (x: tracing.ReadableSpan[]) =>
        x.filter(
          (y) =>
            y.kind === SpanKind.SERVER &&
            scope(y) === "@opentelemetry/instrumentation-http" &&
            path(y) === "/admin/studio-window",
        );
      const got = await exported((x) => windows(x).length === 3);
      const byStatus = windows(got)
        .map((x) => x.attributes)
        .sort((a, b) => Number(a["http.response.status_code"]) - Number(b["http.response.status_code"]));
      expect(byStatus).toEqual([
        expect.objectContaining({
          "http.route": "/admin/studio-window",
          "http.response.status_code": 200,
          "h4.stack": "dev-cpu",
          "h4.outcome": "ok",
          "h4.studio_window.state": "start",
        }),
        expect.objectContaining({
          "http.route": "/admin/studio-window",
          "http.response.status_code": 400,
          "h4.stack": "dev-cpu",
          "h4.outcome": "invalid",
        }),
        expect.objectContaining({
          "http.route": "/admin/studio-window",
          "http.response.status_code": 409,
          "h4.stack": "dev-cpu",
          "h4.outcome": "refused",
          "h4.studio_window.state": "start",
        }),
      ]);
      // A body with no valid state gives no state: the attribute only ever holds start or end.
      expect(byStatus[1]).not.toHaveProperty(["h4.studio_window.state"]);
      expect(JSON.stringify(got.map((x) => [x.name, x.attributes, x.events]))).not.toMatch(/span-reason/);
    } finally {
      await st.close();
    }
  });
});
