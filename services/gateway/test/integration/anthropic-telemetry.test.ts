// The Anthropic adapter's telemetry (spec 010, FR-034, FR-035; plan §9; tasks.md T027): a fallback call's client span,
// `chat claude-haiku-5-5`, with the provider, the model, the server's address and port, and the canonical keys; no
// payload attribute while payload sampling is off; h4.adapter.healthy for the adapter; and h4.cost.usd's zero series
// at start, under fallback and test, for the routed paid adapter. An in-memory span exporter and metric reader; the
// API is an in-process stub, and the key a run-time value.
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";

import { context, SpanKind, trace, type Attributes } from "@opentelemetry/api";
import { metrics as sdkMetrics, node, tracing } from "@opentelemetry/sdk-node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { anthropicConfigDir, anthropicFactories } from "../helpers/anthropic-config.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { testStack, type TestStack } from "../helpers/stack.js";

const { AggregationTemporality, InMemoryMetricExporter, MeterProvider } = sdkMetrics;

const KEY = `test-${randomBytes(16).toString("hex")}`;
const spans = new tracing.InMemorySpanExporter();
const tracer = new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(spans)] });
let openai: StubOpenAI;
let anthropic: StubAnthropic;
const stacks: TestStack[] = [];
const dirs: string[] = [];
beforeAll(async () => {
  tracer.register();
  openai = await stubOpenAI({ model: "stand-in" });
  anthropic = await stubAnthropic();
});
afterAll(async () => {
  await anthropic.close();
  await openai.close();
  await tracer.shutdown();
  trace.disable();
  context.disable();
});
afterEach(async () => {
  spans.reset();
  openai.reset();
  anthropic.reset();
  for (const s of stacks.splice(0)) await s.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

function meterHarness() {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new sdkMetrics.PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  const provider = new MeterProvider({ readers: [reader] });
  return {
    metrics: new GatewayMetrics(provider.getMeter("gateway")),
    async points(name: string): Promise<[Attributes, number][]> {
      const { resourceMetrics } = await reader.collect();
      const found = resourceMetrics.scopeMetrics.flatMap((s) => s.metrics).find((m) => m.descriptor.name === name);
      return (found?.dataPoints ?? []).map((p) => [p.attributes, p.value as number]);
    },
    shutdown: () => provider.shutdown(),
  };
}

async function prod(h: ReturnType<typeof meterHarness>): Promise<TestStack> {
  const configDir = await anthropicConfigDir();
  dirs.push(configDir);
  const { factories } = await anthropicFactories(anthropic.origin);
  openai.setHealth({ status: 503 });
  const s = await testStack({
    stack: "prod",
    env: { LOCAL_MODEL_BASE_URL: openai.baseUrl, GATEWAY_ANTHROPIC_API_KEY: KEY },
    configDir,
    factories,
    metrics: h.metrics,
  });
  stacks.push(s);
  const init = await s.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers: { ...s.auth(), "content-type": "application/json" },
    payload: JSON.stringify({ reason: "A fresh prod stack for the telemetry test.", confirm_zero: true, renew: true }),
  });
  expect(init.statusCode).toBe(200);
  await s.services.gateway.probeAll();
  return s;
}

describe("the Anthropic call's telemetry (FR-034, FR-035)", () => {
  it("makes one client span with the provider, the model, the server, and no payload", async () => {
    const h = meterHarness();
    const s = await prod(h);
    anthropic.next({ ok: { text: "Hello there.", inputTokens: 40, outputTokens: 4, finish: "stop" } });
    const res = await s.api.inject({
      method: "POST",
      url: "/hello",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
      payload: JSON.stringify({ message: "Say hello." }),
    });
    expect(res.statusCode, res.body).toBe(200);
    const clients = spans.getFinishedSpans().filter((x) => x.kind === SpanKind.CLIENT);
    const chat = clients.filter((x) => x.name === "chat claude-haiku-5-5");
    expect(chat).toHaveLength(1);
    expect(chat[0]?.attributes).toMatchObject({
      "gen_ai.provider.name": "anthropic",
      "gen_ai.request.model": "claude-haiku-5-5",
      "gen_ai.usage.input_tokens": 40,
      "gen_ai.usage.output_tokens": 4,
      "server.address": "api.anthropic.com",
      "server.port": 443,
      "h4.route.decision": "fallback",
      "h4.meter.attribution": "fallback",
      "h4.payload.sampled": false,
    });
    const keys = Object.keys(chat[0]?.attributes ?? {});
    for (const payload of ["gen_ai.input.messages", "gen_ai.output.messages", "gen_ai.system_instructions"]) {
      expect(keys).not.toContain(payload);
    }
    // No other client span goes with the call: the SDK's spans are off, and the transport makes none.
    expect(clients.filter((x) => String(x.attributes["server.address"] ?? "").includes("127.0.0.1"))).toEqual([]);
    expect(JSON.stringify(spans.getFinishedSpans().map((x) => x.attributes))).not.toContain(KEY);
    await h.shutdown();
  });

  it("reports the adapter's health, and h4.cost.usd's zero series for it under fallback and test", async () => {
    const h = meterHarness();
    const s = await prod(h);
    s.services.gateway.start(); // the seed is the start's (spec 000's T191); close() stops what it starts
    await s.services.gateway.refreshGauges();
    expect(await h.points("h4.adapter.healthy")).toEqual(expect.arrayContaining([[{ "h4.adapter": "anthropic" }, 1]]));
    const costs = (await h.points("h4.cost.usd")).filter(([a]) => a["gen_ai.provider.name"] === "anthropic");
    expect(costs.map(([a, v]) => [a["h4.meter.attribution"], a["gen_ai.request.model"], v]).sort()).toEqual([
      ["fallback", "claude-haiku-5-5", 0],
      ["test", "claude-haiku-5-5", 0],
    ]);
    await h.shutdown();
  });

  it("reports the routed adapter's month, its cap, and its warning", async () => {
    const h = meterHarness();
    const s = await prod(h);
    anthropic.next({ ok: { text: "Hello there.", inputTokens: 40, outputTokens: 4, finish: "stop" } });
    await s.api.inject({
      method: "POST",
      url: "/hello",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.8" },
      payload: JSON.stringify({}),
    });
    await s.services.gateway.refreshGauges();
    expect(await h.points("h4.adapter.month_spend_usd")).toEqual([[{ "h4.adapter": "anthropic" }, 0.00006]]);
    expect(await h.points("h4.adapter.month_cap_usd")).toEqual([[{ "h4.adapter": "anthropic" }, 10]]);
    expect(await h.points("h4.adapter.month_warn_usd")).toEqual([[{ "h4.adapter": "anthropic" }, 7]]);
    await h.shutdown();
  });
});
