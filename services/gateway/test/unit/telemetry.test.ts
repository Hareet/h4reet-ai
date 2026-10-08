// The gateway's telemetry (tasks.md T026; contracts/telemetry.md §2, §3.1, §4.1, §5), with in-memory exporters:
// the instrument inventory and its units, no client identifier in any metric attribute, the histogram buckets, the
// exporters' interval and temporality, the span processor that drops client attributes, the hooks that keep health
// probes and the Telegram URL out of traces, and pino's redaction.
import { context, trace, type Attributes } from "@opentelemetry/api";
import { metrics as sdkMetrics, node, resources } from "@opentelemetry/sdk-node";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger, REDACT_PATHS } from "../../src/telemetry/log.js";
import {
  DELIVERY_LAG_BUCKETS,
  GatewayMetrics,
  SECONDS_BUCKETS,
  TOKEN_BUCKETS,
  type GaugeSnapshot,
} from "../../src/telemetry/metrics.js";
import {
  ClientAttributeStripper,
  METRIC_EXPORT_INTERVAL_MS,
  SPAN_BATCH,
  buildResource,
  buildSdkConfiguration,
  isHealthProbe,
  metricExporter,
  scrubPgQuery,
  undiciIgnoreHook,
} from "../../src/telemetry/otel.js";

const { AggregationTemporality, DataPointType, InMemoryMetricExporter, InstrumentType, MeterProvider } = sdkMetrics;
type ResourceMetrics = sdkMetrics.ResourceMetrics;

/** A meter wired to an in-memory exporter, collected on demand. */
function meterHarness() {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new sdkMetrics.PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  const provider = new MeterProvider({ readers: [reader] });
  return {
    meter: provider.getMeter("gateway"),
    async collect(): Promise<ResourceMetrics> {
      const { resourceMetrics, errors } = await reader.collect();
      expect(errors).toEqual([]);
      return resourceMetrics;
    },
    shutdown: () => provider.shutdown(),
  };
}

const instruments = (rm: ResourceMetrics) => rm.scopeMetrics.flatMap((s) => s.metrics);

const SNAPSHOT: GaugeSnapshot = {
  killSwitch: "normal",
  cause: "none",
  meters: {
    day: { spentMicro: 300_000n, ceilingMicro: 5_000_000n, warnMicro: 3_500_000n },
    month: { spentMicro: 3_800_000n, ceilingMicro: 20_000_000n, warnMicro: 14_000_000n },
    fallbackDay: { spentMicro: 1_500_000n, allowanceMicro: 2_000_000n, warnMicro: 1_400_000n },
  },
  fallbackAwaitingRenewal: false,
  adapters: [{ id: "local", healthy: true }],
};

/** Every instrument once, as a request, a crossing, and an operator write would record them. */
function scriptedRun(m: GatewayMetrics): void {
  m.request("local", "ok", 0.212);
  m.request("none", "refused", 0.001);
  m.cost(100_000n, { provider: "synthetic", model: "metered-test", attribution: "fallback" });
  m.cost(0n, { provider: "local", model: "stand-in", attribution: "none" });
  m.degradedResponse("kill_switch_tripped");
  m.alertAttempt({ channel: "telegram", kind: "warn", outcome: "delivered" });
  m.alertDeliveryLag(4.2);
  m.operatorAction("reset");
  m.operatorAuthFailure("mismatch");
  m.testMachineryRefused();
  m.tokenUsage(71, { provider: "local", requestModel: "stand-in", responseModel: "stand-in", tokenType: "input" });
  m.tokenUsage(14, { provider: "local", requestModel: "stand-in", responseModel: "stand-in", tokenType: "output" });
  m.operationDuration(0.2, {
    provider: "local",
    requestModel: "stand-in",
    responseModel: "stand-in",
    server: "model-server",
  });
  m.operationDuration(10, {
    provider: "local",
    requestModel: "stand-in",
    server: "model-server",
    errorType: "timeout",
  });
  m.setSnapshot(SNAPSHOT);
}

// telemetry.md §4.1 and §4.2: name, unit, and the attribute keys each may carry.
const INVENTORY: Record<string, { unit: string; keys: string[] }> = {
  "h4.gateway.requests": { unit: "{request}", keys: ["h4.outcome", "h4.route.decision"] },
  "h4.gateway.request.duration": { unit: "s", keys: ["h4.route.decision"] },
  "h4.cost.usd": { unit: "{USD}", keys: ["gen_ai.provider.name", "gen_ai.request.model", "h4.meter.attribution"] },
  "h4.meter.spend_usd": { unit: "{USD}", keys: ["h4.meter"] },
  "h4.meter.ceiling_usd": { unit: "{USD}", keys: ["h4.meter"] },
  "h4.meter.warn_usd": { unit: "{USD}", keys: ["h4.meter"] },
  "h4.fallback.allowance_usd": { unit: "{USD}", keys: [] },
  "h4.fallback.awaiting_renewal": { unit: "{flag}", keys: [] },
  "h4.kill_switch.state": { unit: "{state}", keys: ["h4.state"] },
  "h4.degraded.cause": { unit: "{cause}", keys: ["h4.cause"] },
  "h4.degraded.responses": { unit: "{response}", keys: ["h4.cause"] },
  "h4.adapter.healthy": { unit: "{flag}", keys: ["h4.adapter"] },
  "h4.alerts": { unit: "{attempt}", keys: ["h4.alert.kind", "h4.channel", "h4.outcome"] },
  "h4.alert.delivery_lag": { unit: "s", keys: [] },
  "h4.operator.actions": { unit: "{action}", keys: ["h4.action"] },
  "h4.operator.auth_failures": { unit: "{failure}", keys: ["h4.auth.class"] },
  "h4.test_machinery.refused": { unit: "{request}", keys: [] },
  "gen_ai.client.token.usage": {
    unit: "{token}",
    keys: [
      "gen_ai.operation.name",
      "gen_ai.provider.name",
      "gen_ai.request.model",
      "gen_ai.response.model",
      "gen_ai.token.type",
    ],
  },
  "gen_ai.client.operation.duration": {
    unit: "s",
    keys: [
      "error.type",
      "gen_ai.operation.name",
      "gen_ai.provider.name",
      "gen_ai.request.model",
      "gen_ai.response.model",
      "server.address",
    ],
  },
};

describe("the gateway's instruments (telemetry.md §4.1, §4.2)", () => {
  it("are exactly the inventory: names, units, and attribute keys", async () => {
    const h = meterHarness();
    scriptedRun(new GatewayMetrics(h.meter));
    const found = instruments(await h.collect());
    expect(found.map((m) => m.descriptor.name).sort()).toEqual(Object.keys(INVENTORY).sort());
    for (const m of found) {
      const want = INVENTORY[m.descriptor.name];
      expect(m.descriptor.unit, m.descriptor.name).toBe(want?.unit);
      const keys = new Set(m.dataPoints.flatMap((p) => Object.keys(p.attributes)));
      expect([...keys].sort(), m.descriptor.name).toEqual([...(want?.keys ?? [])].sort());
    }
    await h.shutdown();
  });

  it("never carry a client identifier, whatever a caller passes", async () => {
    const h = meterHarness();
    const m = new GatewayMetrics(h.meter);
    scriptedRun(m);
    // A caller that slips extra attributes in gets them dropped, not recorded.
    (m.cost as (micro: bigint, attrs: Record<string, string>) => void)(1n, {
      provider: "local",
      model: "stand-in",
      attribution: "none",
      "client.address": "10.0.0.7",
      "h4.client": "author-laptop",
    });
    const all = JSON.stringify(instruments(await h.collect()).map((x) => x.dataPoints.map((p) => p.attributes)));
    for (const forbidden of ["client.address", "10.0.0.7", "h4.client", "author-laptop", "request_id", "trace_id"]) {
      expect(all).not.toContain(forbidden);
    }
    await h.shutdown();
  });

  it("record cost in USD, as the micro-USD the ledger commits ÷ 10⁶", async () => {
    const h = meterHarness();
    const m = new GatewayMetrics(h.meter);
    m.cost(100_000n, { provider: "synthetic", model: "metered-test", attribution: "fallback" });
    m.cost(100_000n, { provider: "synthetic", model: "metered-test", attribution: "fallback" });
    const cost = instruments(await h.collect()).find((x) => x.descriptor.name === "h4.cost.usd");
    expect(cost?.dataPoints[0]?.value).toBeCloseTo(0.2, 12);
    await h.shutdown();
  });

  it("use explicit buckets: up to 120 s for durations, up to 600 s for delivery lag, and the token conventions", async () => {
    const h = meterHarness();
    scriptedRun(new GatewayMetrics(h.meter));
    const found = instruments(await h.collect());
    const boundaries = (name: string) => {
      const metric = found.find((x) => x.descriptor.name === name);
      expect(metric?.dataPointType, name).toBe(DataPointType.HISTOGRAM);
      return (metric?.dataPoints[0]?.value as { buckets: { boundaries: number[] } }).buckets.boundaries;
    };
    expect(SECONDS_BUCKETS).toEqual([0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120]);
    expect(boundaries("h4.gateway.request.duration")).toEqual(SECONDS_BUCKETS);
    expect(boundaries("gen_ai.client.operation.duration")).toEqual(SECONDS_BUCKETS);
    expect(boundaries("h4.alert.delivery_lag")).toEqual(DELIVERY_LAG_BUCKETS);
    expect(DELIVERY_LAG_BUCKETS).toEqual([1, 5, 10, 20, 30, 60, 120, 180, 240, 300, 600]);
    expect(boundaries("gen_ai.client.token.usage")).toEqual(TOKEN_BUCKETS);
    await h.shutdown();
  });

  it("report the gauges from the snapshot: one-hot state and cause, and the meters in USD", async () => {
    const h = meterHarness();
    const m = new GatewayMetrics(h.meter);
    m.setSnapshot({ ...SNAPSHOT, killSwitch: "degraded", cause: "meter_at_ceiling" });
    const found = instruments(await h.collect());
    const points = (name: string): [Attributes, number][] =>
      (found.find((x) => x.descriptor.name === name)?.dataPoints ?? []).map((p) => [p.attributes, p.value as number]);
    expect(points("h4.kill_switch.state")).toEqual([
      [{ "h4.state": "normal" }, 0],
      [{ "h4.state": "degraded" }, 1],
    ]);
    const causes = points("h4.degraded.cause");
    expect(causes).toHaveLength(10);
    expect(causes.filter(([, v]) => v === 1)).toEqual([[{ "h4.cause": "meter_at_ceiling" }, 1]]);
    expect(points("h4.meter.spend_usd")).toEqual([
      [{ "h4.meter": "day" }, 0.3],
      [{ "h4.meter": "month" }, 3.8],
      [{ "h4.meter": "fallback_day" }, 1.5],
    ]);
    expect(points("h4.meter.ceiling_usd").map(([, v]) => v)).toEqual([5, 20, 2]);
    expect(points("h4.meter.warn_usd").map(([, v]) => v)).toEqual([3.5, 14, 1.4]);
    expect(points("h4.fallback.allowance_usd")).toEqual([[{}, 2]]);
    expect(points("h4.fallback.awaiting_renewal")).toEqual([[{}, 0]]);
    expect(points("h4.adapter.healthy")).toEqual([[{ "h4.adapter": "local" }, 1]]);
    await h.shutdown();
  });

  it("stop reporting the meters while the store can't be read, but keep the state and cause (unknown is degraded)", async () => {
    const h = meterHarness();
    const m = new GatewayMetrics(h.meter);
    m.setSnapshot({ killSwitch: "degraded", cause: "store_unreachable", adapters: [] });
    const names = instruments(await h.collect())
      .filter((x) => x.dataPoints.length > 0)
      .map((x) => x.descriptor.name);
    expect(names.sort()).toEqual(["h4.degraded.cause", "h4.kill_switch.state"]);
    await h.shutdown();
  });

  it("start as unknown, which is degraded, before the first snapshot", async () => {
    const h = meterHarness();
    new GatewayMetrics(h.meter);
    const state = instruments(await h.collect()).find((x) => x.descriptor.name === "h4.kill_switch.state");
    expect(state?.dataPoints.map((p) => [p.attributes["h4.state"], p.value])).toEqual([
      ["normal", 0],
      ["degraded", 1],
    ]);
    await h.shutdown();
  });
});

describe("the SDK's setup (telemetry.md §3.1)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports metrics with cumulative temporality, for every instrument type", () => {
    const exporter = metricExporter();
    for (const type of Object.values(InstrumentType)) {
      expect(exporter.selectAggregationTemporality(type), type).toBe(AggregationTemporality.CUMULATIVE);
    }
  });

  it("exports metrics every 10 s", async () => {
    vi.useFakeTimers();
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const config = buildSdkConfiguration({ version: "0.1.0", exporters: { metrics: exporter } });
    expect(METRIC_EXPORT_INTERVAL_MS).toBe(10_000);
    const provider = new MeterProvider({ readers: config.metricReaders ?? [] });
    provider.getMeter("gateway").createCounter("h4.gateway.requests").add(1);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(exporter.getMetrics()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(exporter.getMetrics()).toHaveLength(1);
    // The shutdown's own export runs on the same fake clock.
    const done = provider.shutdown();
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
  });

  it("batches spans in a queue of 2,048, exported every 1 s, that drops rather than blocks", () => {
    expect(SPAN_BATCH).toEqual({ maxQueueSize: 2_048, scheduledDelayMillis: 1_000 });
  });

  it("gives http.server.request.duration the same buckets, up to 120 s", () => {
    const config = buildSdkConfiguration({ version: "0.1.0" });
    const view = config.views?.find((v) => v.instrumentName === "http.server.request.duration");
    expect(view?.aggregation).toEqual({ type: 4, options: { boundaries: SECONDS_BUCKETS } });
  });

  it("detects the resource from the environment alone, with the package's version", async () => {
    vi.stubEnv("OTEL_SERVICE_NAME", "gateway");
    vi.stubEnv(
      "OTEL_RESOURCE_ATTRIBUTES",
      "service.namespace=h4reet,deployment.environment.name=dev,service.instance.id=dev-gateway",
    );
    const resource = buildResource("0.1.0");
    await resource.waitForAsyncAttributes?.();
    const attrs = resource.attributes;
    expect(attrs).toMatchObject({
      "service.name": "gateway",
      "service.namespace": "h4reet",
      "deployment.environment.name": "dev",
      "service.instance.id": "dev-gateway",
      "service.version": "0.1.0",
    });
    expect(Object.keys(attrs).filter((k) => /^(host|process|os|container|cloud)\./.test(k))).toEqual([]);
    expect(resources.envDetector).toBeDefined();
  });
});

describe("what never reaches a trace", () => {
  it("drops client attributes, and a query string, from every span before export", async () => {
    const exporter = new node.InMemorySpanExporter();
    const provider = new node.BasicTracerProvider({
      spanProcessors: [new ClientAttributeStripper(new node.SimpleSpanProcessor(exporter))],
    });
    const span = provider.getTracer("t").startSpan("POST /hello", {
      attributes: {
        "client.address": "10.0.0.7",
        "client.port": 51_000,
        "network.peer.address": "10.0.0.7",
        "network.peer.port": 51_000,
        "user_agent.original": "curl/8",
        "url.path": "/hello?label=author-laptop",
        "http.route": "/hello",
      },
    });
    span.end();
    await provider.forceFlush();
    const [exported] = exporter.getFinishedSpans();
    expect(exported?.attributes).toEqual({ "url.path": "/hello", "http.route": "/hello" });
    await provider.shutdown();
  });

  it("makes no span for a health probe", () => {
    for (const path of ["/health/live", "/health", "/health?x=1", "/health/live?probe"]) {
      expect(isHealthProbe(path), path).toBe(true);
    }
    for (const path of ["/hello", "/healthz", "/health/", "/admin/status", undefined]) {
      expect(isHealthProbe(path), String(path)).toBe(false);
    }
  });

  it("skips the Telegram API host in the undici instrumentation, because its path carries the bot token", () => {
    const ignore = undiciIgnoreHook(["telegram-standin"]);
    expect(ignore({ origin: "https://api.telegram.org", path: "/botX/sendMessage" })).toBe(true);
    expect(ignore({ origin: "https://API.TELEGRAM.ORG:443", path: "/botX/sendMessage" })).toBe(true);
    expect(ignore({ origin: "http://telegram-standin:8080", path: "/botX/sendMessage" })).toBe(true);
    expect(ignore({ origin: "http://model-server:8080", path: "/v1/chat/completions" })).toBe(false);
    expect(ignore({ origin: "https://api.telegram.org.example.com", path: "/" })).toBe(false);
    expect(ignore({ origin: "not a url", path: "/" })).toBe(true); // fail closed: unparseable means unknown
  });

  it("scrubs the role-password statement from a pg span, and leaves other queries alone", () => {
    const set: Record<string, unknown> = {};
    const span = { setAttribute: (k: string, v: unknown) => void (set[k] = v) };
    scrubPgQuery(
      span as never,
      { query: { text: "ALTER ROLE grafana_ro PASSWORD 'SCRAM-SHA-256$4096:abc'" } } as never,
    );
    expect(set).toEqual({ "db.query.text": "ALTER ROLE grafana_ro PASSWORD [redacted]" });
    const untouched: Record<string, unknown> = {};
    scrubPgQuery(
      { setAttribute: (k: string, v: unknown) => void (untouched[k] = v) } as never,
      { query: { text: "SELECT state FROM gateway.stack_state WHERE id = 1" } } as never,
    );
    expect(untouched).toEqual({});
  });

  it("configures the instrumentations as telemetry.md §3.1 asks", () => {
    const config = buildSdkConfiguration({ version: "0.1.0" });
    const names = (config.instrumentations ?? []).flat().map((i) => i.instrumentationName);
    expect(names).toEqual([
      "@opentelemetry/instrumentation-http",
      "@opentelemetry/instrumentation-undici",
      "@opentelemetry/instrumentation-pg",
      "@opentelemetry/instrumentation-pino",
      "@fastify/otel",
    ]);
    const byName = Object.fromEntries((config.instrumentations ?? []).flat().map((i) => [i.instrumentationName, i]));
    expect(byName["@opentelemetry/instrumentation-http"]?.getConfig()).toMatchObject({
      requireParentforOutgoingSpans: true,
    });
    expect(byName["@opentelemetry/instrumentation-undici"]?.getConfig()).toMatchObject({ requireParentforSpans: true });
    expect(byName["@opentelemetry/instrumentation-pg"]?.getConfig()).toMatchObject({
      requireParentSpan: true,
      enhancedDatabaseReporting: false,
    });
    expect(byName["@opentelemetry/instrumentation-pino"]?.getConfig()).toMatchObject({ disableLogCorrelation: true });
  });
});

describe("the logger (telemetry.md §5)", () => {
  const lines: string[] = [];
  const destination = { write: (s: string) => void lines.push(s) };
  const last = (): Record<string, unknown> => JSON.parse(lines.at(-1) as string) as Record<string, unknown>;
  afterEach(() => {
    lines.length = 0;
    trace.disable();
    context.disable();
  });

  it("writes JSON with time, level, msg, event, and h4.stack, and no host or pid", () => {
    const logger = createLogger({ stack: "dev", destination });
    logger.info({ event: "gateway.started", routing_sha: "a".repeat(64) }, "The gateway started.");
    const rec = last();
    expect(rec).toMatchObject({ level: 30, msg: "The gateway started.", event: "gateway.started", "h4.stack": "dev" });
    expect(typeof rec.time).toBe("string");
    expect(Object.keys(rec)).not.toContain("hostname");
    expect(Object.keys(rec)).not.toContain("pid");
  });

  it("redacts the paths §5.3 fixes, and every key the censor names", () => {
    expect(REDACT_PATHS).toEqual([
      "req.headers.authorization",
      "req.headers.cookie",
      "*.authorization",
      "*.password",
      "*.token",
      "messages",
      "*.messages",
    ]);
    const logger = createLogger({ stack: "dev", destination });
    logger.warn(
      {
        event: "alert.retry",
        req: { headers: { authorization: "Bearer x", cookie: "c=1" } },
        smtp: { password: "x", token: "x", user: "ok" },
        messages: [{ role: "user", content: "hi" }],
        nested: { messages: ["x"], botToken: "x" },
        input_tokens: 71,
      },
      "An alert attempt failed; another is due.",
    );
    const text = lines.at(-1) as string;
    expect(text).not.toMatch(/Bearer x|c=1|"hi"|"x"/);
    const rec = last() as Record<string, Record<string, unknown>>;
    expect(rec.smtp).toEqual({ password: "[redacted]", token: "[redacted]", user: "ok" });
    expect(rec.messages).toBe("[redacted]");
    expect(rec.input_tokens).toBe(71);
  });

  it("carries trace_id and span_id when a span is active", () => {
    const provider = new node.NodeTracerProvider();
    provider.register();
    const logger = createLogger({ stack: "dev", destination });
    const span = provider.getTracer("t").startSpan("x");
    context.with(trace.setSpan(context.active(), span), () => {
      logger.info({ event: "call.completed" }, "A provider attempt completed.");
    });
    span.end();
    const rec = last();
    expect(rec.trace_id).toBe(span.spanContext().traceId);
    expect(rec.span_id).toBe(span.spanContext().spanId);
    expect(rec.trace_flags).toBe("01");
    logger.info({ event: "gateway.started" }, "Outside any span.");
    expect(Object.keys(last())).not.toContain("trace_id");
  });
});
