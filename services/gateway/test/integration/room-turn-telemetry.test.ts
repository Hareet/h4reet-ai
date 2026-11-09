// T021's integration part (spec 007; FR-043, FR-044, FR-046; SC-007's automated half; plan §9): a turn's spans and
// what they never carry. The server span, POST /room/turn, carries the feature, the topic, the outcome, the pack's and
// the prompt's hashes, and the guard when an answer is withheld; spec 000's gateway.route and chat spans under it gain
// the feature and the topic. With payload sampling off, no span attribute and no log record holds the visitor's words,
// the answer, the grounding, the prompt, the path, or a client identifier.
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { SpanKind, context, trace } from "@opentelemetry/api";
import { metrics as sdkMetrics, node, tracing } from "@opentelemetry/sdk-node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { isHealthProbe } from "../../src/telemetry/otel.js";
import { ROOM, committedTexts, readinessText, twinWith } from "../helpers/twin.js";
import { twinFromTexts } from "../../src/config/twin.js";
import { twinStack, type TwinStack } from "../helpers/twin-stack.js";

const exporter = new tracing.InMemorySpanExporter();
const provider = new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(exporter)] });
let fastifyOtel: FastifyOtelInstrumentation;
const metricExporter = new sdkMetrics.InMemoryMetricExporter(sdkMetrics.AggregationTemporality.CUMULATIVE);
const reader = new sdkMetrics.PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 3_600_000,
});
const meterProvider = new sdkMetrics.MeterProvider({ readers: [reader] });

beforeAll(() => {
  provider.register();
  fastifyOtel = new FastifyOtelInstrumentation({
    registerOnInitialization: true,
    ignorePaths: (route) => isHealthProbe(route.url),
  });
});
afterAll(async () => {
  fastifyOtel?.disable();
  await provider.shutdown();
  await meterProvider.shutdown();
  trace.disable();
  context.disable();
});

const stacks: TwinStack[] = [];
beforeEach(() => exporter.reset());
afterEach(async () => {
  for (const t of stacks.splice(0)) await t.close();
});

const WORDS = "what-the-visitor-typed-qx";
const ANSWER = "An answer the model gave, kept out of telemetry.";
const READY = readinessText({ topics: { [ROOM.second.topic]: { ready: true } }, freeTalk: { ready: true } });

async function collect(): Promise<string> {
  const result = await reader.collect();
  return JSON.stringify(
    result.resourceMetrics.scopeMetrics.flatMap((s) =>
      s.metrics.map((m) => [m.descriptor.name, m.dataPoints.map((p) => p.attributes)]),
    ),
  );
}

describe("a turn's spans (FR-043)", () => {
  it("carry the feature, the topic, the outcome, and both hashes, and never the words, the answer, or the path", async () => {
    const t = await twinStack({ twin: twinWith(READY), metrics: new GatewayMetrics(meterProvider.getMeter("twin")) });
    stacks.push(t);
    t.stub.next({ ok: { text: ANSWER, inputTokens: 900, outputTokens: 12, finish: "stop" } });
    const res = await t.turn(
      { feature: ROOM.second.id, path: "non-engineer", turns: [{ role: "visitor", text: `Tell me ${WORDS}` }] },
      { "x-h4-client": "author-terminal" },
    );
    expect(res.statusCode).toBe(200);
    const spans = exporter.getFinishedSpans();
    const server = spans.find((s) => s.kind === SpanKind.SERVER && s.attributes["http.route"] === "/room/turn");
    expect(server?.attributes).toMatchObject({
      "h4.room.feature": ROOM.second.id,
      "h4.room.topic": ROOM.second.topic,
      "h4.outcome": "ok",
    });
    expect(String(server?.attributes["h4.twin.pack_sha"])).toMatch(/^[0-9a-f]{64}$/);
    expect(String(server?.attributes["h4.twin.prompt_sha"])).toMatch(/^[0-9a-f]{64}$/);
    for (const name of ["gateway.route", "chat stand-in"]) {
      expect(spans.find((s) => s.name === name)?.attributes, name).toMatchObject({
        "h4.room.feature": ROOM.second.id,
        "h4.room.topic": ROOM.second.topic,
      });
    }
    const everything = JSON.stringify([spans.map((s) => s.attributes), t.s.logged]);
    for (const secret of [
      WORDS,
      ANSWER,
      "non-engineer",
      "author-terminal",
      "198.51.100.7",
      "Golden Q&A",
      "Who you are",
    ]) {
      expect(everything, secret).not.toContain(secret);
    }
    const metricsText = await collect();
    expect(metricsText).toContain("h4.twin.turns");
    expect(metricsText).not.toContain(WORDS);
    expect(metricsText).not.toContain("non-engineer");
  });

  it("names the guard on a withheld answer, and counts it", async () => {
    const t = await twinStack({ twin: twinWith(READY), metrics: new GatewayMetrics(meterProvider.getMeter("twin-2")) });
    stacks.push(t);
    t.stub.next({ ok: { text: "He has built 4321 agents.", inputTokens: 900, outputTokens: 12, finish: "stop" } });
    const res = await t.turn({
      feature: ROOM.second.id,
      path: "engineer",
      turns: [{ role: "visitor", text: "How many?" }],
    });
    expect(res.statusCode).toBe(200);
    const server = exporter
      .getFinishedSpans()
      .find((s) => s.kind === SpanKind.SERVER && s.attributes["http.route"] === "/room/turn");
    expect(server?.attributes).toMatchObject({ "h4.outcome": "withheld", "h4.twin.guard": "numbers" });
    expect(await collect()).toContain("h4.twin.withheld");
  });

  // Round 5 (spec 007's plan, D34): an answer whose opening agreement the repair took off is the visitor's, delivered
  // with the outcome ok, its guard named on the span and counted as repair_opener.
  it("names and counts an opener repair, and delivers the repaired answer with the outcome ok", async () => {
    const t = await twinStack({
      twin: twinWith(READY),
      metrics: new GatewayMetrics(meterProvider.getMeter("twin-repair")),
    });
    stacks.push(t);
    t.stub.next({
      ok: { text: "Yes, the corpus says he was involved there.", inputTokens: 900, outputTokens: 12, finish: "stop" },
    });
    const res = await t.turn({
      feature: "free_talk",
      path: "engineer",
      turns: [{ role: "visitor", text: "He led the national deployments too, right?" }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ text: "The corpus says he was involved there." });
    const server = exporter
      .getFinishedSpans()
      .find((s) => s.kind === SpanKind.SERVER && s.attributes["http.route"] === "/room/turn");
    expect(server?.attributes).toMatchObject({ "h4.outcome": "ok", "h4.twin.guard": "repair_opener" });
    expect(await collect()).toContain("repair_opener");
  });

  // Round 7 (spec 007's plan, D41): an answer delivered with a sentence removed is the visitor's, with the outcome ok,
  // and each guard that removed one is counted in h4.twin.redacted, never in h4.twin.withheld.
  it("counts a redacted answer by the guard that removed its sentence, and delivers the rest with the outcome ok", async () => {
    const t = await twinStack({
      twin: twinWith(READY),
      metrics: new GatewayMetrics(meterProvider.getMeter("twin-redact")),
    });
    stacks.push(t);
    t.stub.next({
      ok: {
        text: "He has built 4321 agents. The corpus says he was involved there.",
        inputTokens: 900,
        outputTokens: 12,
        finish: "stop",
      },
    });
    const res = await t.turn({
      feature: "free_talk",
      path: "engineer",
      turns: [{ role: "visitor", text: "How much of it did he build?" }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ text: "The corpus says he was involved there." });
    const server = exporter
      .getFinishedSpans()
      .find((s) => s.kind === SpanKind.SERVER && s.attributes["http.route"] === "/room/turn");
    expect(server?.attributes).toMatchObject({ "h4.outcome": "ok" });
    expect(server?.attributes["h4.twin.guard"]).toBeUndefined();
    expect(await collect()).toContain('["h4.twin.redacted",[{"h4.twin.guard":"numbers"}]]');
  });

  it("names the degraded cause on a degraded turn", async () => {
    const t = await twinStack({ twin: twinWith(READY), healthy: false });
    stacks.push(t);
    const res = await t.turn({ feature: ROOM.second.id, path: "engineer", turns: [] });
    expect(res.statusCode).toBe(503);
    const server = exporter
      .getFinishedSpans()
      .find((s) => s.kind === SpanKind.SERVER && s.attributes["http.route"] === "/room/turn");
    expect(server?.attributes).toMatchObject({ "h4.outcome": "degraded", "h4.degraded.cause": "no_fallback_in_stack" });
  });
});

// The review of T066 (I6): a feature the pack doesn't name, with the twin's files invalid, is "none" on the span and the
// instruments (FR-043, FR-044), never the visitor's string; and every piece's and free talk's cost series starts at zero
// beside none's (plan §3; SC-006), so the dashboard's first increase() counts the first paid turn.
describe("the review's telemetry gaps (T066: I6)", () => {
  const points = async (name: string) => {
    const result = await reader.collect();
    return result.resourceMetrics.scopeMetrics.flatMap((s) =>
      s.metrics.filter((m) => m.descriptor.name === name).flatMap((m) => m.dataPoints.map((p) => p.attributes)),
    );
  };

  it("names a feature the pack doesn't name none, on the span and the instruments, when the twin's files are invalid", async () => {
    const t = await twinStack({
      twin: twinFromTexts({ ...committedTexts(), pack: "{}" }),
      metrics: new GatewayMetrics(meterProvider.getMeter("twin-none")),
    });
    stacks.push(t);
    const res = await t.turn({ feature: "fx-not-a-piece", path: "engineer", turns: [] });
    expect(res.statusCode).toBe(503);
    const server = exporter
      .getFinishedSpans()
      .find((s) => s.kind === SpanKind.SERVER && s.attributes["http.route"] === "/room/turn");
    expect(server?.attributes["h4.room.feature"]).toBe("none");
    const turns = await points("h4.twin.turns");
    expect(turns.length).toBeGreaterThan(0);
    expect(JSON.stringify(turns)).not.toContain("fx-not-a-piece");
  });

  it("starts each piece's and free talk's cost series at zero beside none's, on a stack with a metered fallback", async () => {
    const t = await twinStack({ fallback: true, metrics: new GatewayMetrics(meterProvider.getMeter("twin-seed")) });
    stacks.push(t);
    t.s.services.gateway.start();
    const features = new Set((await points("h4.cost.usd")).map((a) => a["h4.room.feature"]));
    for (const f of [ROOM.lead.id, ROOM.leadless.id, ROOM.second.id, ROOM.third.id, "free_talk", "none"])
      expect(features.has(f), f).toBe(true);
  });
});
