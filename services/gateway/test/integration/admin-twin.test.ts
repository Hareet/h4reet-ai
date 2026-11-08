// T022 (spec 007; FR-050; Amendment 0-4; plan §2): POST /admin/twin/turn, the Author's evaluation calls. It needs the
// operator token; `adapter` must be in the stack's route; it runs the twin's whole pipeline whatever the readiness file
// says; it never fails over; a paid adapter is admitted as `test` inside the ceilings and not the sub-budget; it writes
// a twin_call audit row and counts in h4.operator.actions, never in h4.twin.turns or h4.twin.withheld; and its 200 adds
// the guard, the model, the tokens, the cost, the trace ID, and both hashes.
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { metrics as sdkMetrics } from "@opentelemetry/sdk-node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { bedrockConfigDir, MODEL } from "../helpers/bedrock-config.js";
import { testStack, type TestStack } from "../helpers/stack.js";
import { stubBedrock, type StubBedrock } from "../helpers/stub-bedrock.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { ROOM, short, twinWith } from "../helpers/twin.js";

/** An evaluation call's reason, as evals/run.py writes it for a generated case. */
const REASON = `evals product twin-${short(ROOM.lead.files[0] ?? "")}-q1-engineer`;
import { TWIN_LIMITS_BLOCK } from "../helpers/twin-stack.js";

type Rec = Record<string, unknown>;
let openai: StubOpenAI;
let bedrock: StubBedrock;
const stacks: TestStack[] = [];
const dirs: string[] = [];
beforeAll(async () => {
  openai = await stubOpenAI({ model: "stand-in" });
  bedrock = stubBedrock();
});
afterAll(async () => {
  bedrock.restore();
  await openai.close();
});
afterEach(async () => {
  openai.reset();
  bedrock.reset();
  for (const s of stacks.splice(0)) await s.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

const reader = new sdkMetrics.PeriodicExportingMetricReader({
  exporter: new sdkMetrics.InMemoryMetricExporter(sdkMetrics.AggregationTemporality.CUMULATIVE),
  exportIntervalMillis: 3_600_000,
});
const meterProvider = new sdkMetrics.MeterProvider({ readers: [reader] });

/** prod with a Bedrock fallback and limits.twin, nothing ready, the store initialized, and local probed healthy. */
async function prod(): Promise<TestStack> {
  const dir = await bedrockConfigDir();
  dirs.push(dir);
  const budgets = await readFile(join(dir, "budgets.yaml"), "utf8");
  await writeFile(join(dir, "budgets.yaml"), `${budgets.trimEnd()}\n${TWIN_LIMITS_BLOCK}`);
  const s = await testStack({
    stack: "prod",
    configDir: dir,
    twin: twinWith(null),
    metrics: new GatewayMetrics(meterProvider.getMeter("admin-twin")),
    env: { LOCAL_MODEL_BASE_URL: openai.baseUrl },
  });
  stacks.push(s);
  const init = await s.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers: { ...s.auth(), "content-type": "application/json" },
    payload: JSON.stringify({
      reason: "A fresh prod stack for the twin's admin calls.",
      confirm_zero: true,
      renew: true,
    }),
  });
  expect(init.statusCode).toBe(200);
  for (let i = 0; i < 3; i += 1) await s.services.gateway.probeAll();
  return s;
}

const body = (o: Rec = {}) => ({
  feature: ROOM.lead.id,
  path: "engineer",
  turns: [],
  adapter: "local",
  reason: REASON,
  ...o,
});
const call = (s: TestStack, b: unknown, headers: Record<string, string> = s.auth()) =>
  s.admin.inject({
    method: "POST",
    url: "/admin/twin/turn",
    headers: { ...headers, "content-type": "application/json" },
    payload: JSON.stringify(b),
  });

describe("POST /admin/twin/turn (operator-admin.md §8)", () => {
  it("holds a body to the admin listener's 4 KiB, the cap x003 puts on it at the edge (the review of T066, N4)", async () => {
    const s = await prod();
    const res = await call(s, body({ reason: "x".repeat(5_000) }));
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: "body_too_large", limit_bytes: 4096 });
  });

  it("needs the operator token", async () => {
    const s = await prod();
    const res = await call(s, body(), {});
    expect(res.statusCode).toBe(401);
  });

  it("answers 404 unknown_adapter for an adapter outside the stack's route", async () => {
    const s = await prod();
    for (const adapter of ["synthetic", "openrouter", "Local"]) {
      const res = await call(s, body({ adapter }));
      expect(res.statusCode, adapter).toBe(404);
      expect(res.json()).toMatchObject({ error: "unknown_adapter" });
    }
  });

  it("runs the pipeline on the local adapter whatever readiness says, and adds what the runners record", async () => {
    const s = await prod();
    openai.next({
      ok: { text: "Winter first: he rides every season.", inputTokens: 900, outputTokens: 9, finish: "stop" },
    });
    const res = await call(s, body());
    expect(res.statusCode).toBe(200);
    const b = res.json() as Rec;
    expect(b).toMatchObject({
      text: "Winter first: he rides every season.",
      feature: ROOM.lead.id,
      route: "local",
      guard: null,
      model: "stand-in",
      usage: { input_tokens: 900, output_tokens: 9 },
      cost_micro_usd: 0,
    });
    expect(String(b.trace_id)).toMatch(/^[0-9a-f]{32}$/);
    expect(String(b.pack_sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(b.prompt_sha256)).toMatch(/^[0-9a-f]{64}$/);
    const audit = (await s.db.pg.query<Rec>("SELECT action, reason FROM gateway.audit_log WHERE action = 'twin_call'"))
      .rows;
    expect(audit).toEqual([{ action: "twin_call", reason: REASON }]);
    // An evaluation call is no visitor's turn: its ledger row names no piece, so gateway.v_twin_models, the dashboard's
    // "model each turn used", never counts it (the review of T066).
    const rows = (await s.db.pg.query<Rec>("SELECT purpose, room_feature, room_topic FROM gateway.ledger")).rows;
    expect(rows).toEqual([{ purpose: "twin", room_feature: null, room_topic: null }]);
    const view = await s.db.pg.query<Rec>("SELECT count(*)::int AS n FROM gateway.v_twin_models");
    expect(view.rows).toEqual([{ n: 0 }]);
  });

  it("names the guard that withheld an answer", async () => {
    const s = await prod();
    openai.next({ ok: { text: "He has 9876 boards.", inputTokens: 900, outputTokens: 9, finish: "stop" } });
    const b = (await call(s, body())).json() as Rec;
    expect(b).toMatchObject({ guard: "numbers" });
  });

  it("calls Bedrock as test inside the ceilings, never the sub-budget, and never fails over", async () => {
    const s = await prod();
    bedrock.next({ ok: { text: "An answer.", inputTokens: 1_000, outputTokens: 20, finish: "stop" } });
    const res = await call(s, body({ adapter: "bedrock" }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ route: "bedrock", model: MODEL });
    const rows = (await s.db.pg.query<Rec>("SELECT attribution, purpose FROM gateway.ledger")).rows;
    expect(rows).toEqual([{ attribution: "test", purpose: "twin" }]);
    // A local failure doesn't move a local evaluation call to Bedrock.
    openai.next({ refuse: true });
    const failed = await call(s, body());
    expect(failed.statusCode).not.toBe(200);
    expect(bedrock.requests()).toHaveLength(1);
  });

  it("counts in h4.operator.actions as twin_call, and never in h4.twin.turns", async () => {
    const s = await prod();
    openai.next({ ok: { text: "An answer.", inputTokens: 10, outputTokens: 2, finish: "stop" } });
    await call(s, body());
    const collected = JSON.stringify(
      (await reader.collect()).resourceMetrics.scopeMetrics.flatMap((m) =>
        m.metrics.map((x) => [x.descriptor.name, x.dataPoints.map((p) => p.attributes)]),
      ),
    );
    expect(collected).toContain("twin_call");
    expect(collected).not.toContain("h4.twin.turns");
    expect(collected).not.toContain("h4.twin.withheld");
  });

  it("refuses a body that isn't the turn's plus adapter and reason, with no call", async () => {
    const s = await prod();
    for (const b of [body({ reason: undefined }), body({ extra: 1 }), body({ feature: "teapot" })]) {
      const res = await call(s, b);
      expect(res.statusCode).toBe(400);
    }
    expect(openai.requests().filter((r) => r.path.endsWith("/chat/completions"))).toEqual([]);
  });
});
