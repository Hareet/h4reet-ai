// POST /hello on prod through the real Bedrock adapter (tasks.md T192; US5's scenario 2; contracts/provider-adapter.md
// §3.2, §6; gateway-http.md §2.4): local is down, so hello falls back to `bedrock-converse`, whose ConverseCommand
// answers from aws-sdk-client-mock. Its health check resolves the credential chain for real, from short-lived
// credentials put in the environment for the test, built at run time. No request leaves the process. The model and
// price are made up for the test (tasks.md T105).
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";

import { context, SpanKind, trace } from "@opentelemetry/api";
import { node, tracing } from "@opentelemetry/sdk-node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { bedrockConfigDir, MODEL } from "../helpers/bedrock-config.js";
import { stubBedrock, type StubBedrock } from "../helpers/stub-bedrock.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;

const exporter = new tracing.InMemorySpanExporter();
const provider = new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(exporter)] });

let openai: StubOpenAI;
let bedrock: StubBedrock;
const stacks: TestStack[] = [];
const dirs: string[] = [];
beforeAll(async () => {
  provider.register();
  openai = await stubOpenAI({ model: "stand-in" });
  bedrock = stubBedrock();
});
afterAll(async () => {
  bedrock.restore();
  await openai.close();
  await provider.shutdown();
  trace.disable();
  context.disable();
});
beforeEach(() => {
  exporter.reset();
  // The default chain skips the environment while a profile is set (credential-provider-node 3.972.84).
  vi.stubEnv("AWS_PROFILE", undefined);
  vi.stubEnv("AWS_ACCESS_KEY_ID", `test-${randomBytes(8).toString("hex")}`);
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", randomBytes(30).toString("base64url"));
  vi.stubEnv("AWS_SESSION_TOKEN", randomBytes(30).toString("base64url"));
  // Credentials that never expire fail the health check (tasks.md T194): these end in an hour.
  vi.stubEnv("AWS_CREDENTIAL_EXPIRATION", new Date(Date.now() + 3_600_000).toISOString());
});
afterEach(async () => {
  vi.unstubAllEnvs();
  openai.reset();
  bedrock.reset();
  for (const s of stacks.splice(0)) await s.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

/** prod with the Bedrock fallback, initialized with renewal granted, and probed once: Bedrock is healthy, local isn't. */
async function prod(): Promise<TestStack> {
  const configDir = await bedrockConfigDir();
  dirs.push(configDir);
  const s = await testStack({ stack: "prod", env: { LOCAL_MODEL_BASE_URL: openai.baseUrl }, configDir });
  stacks.push(s);
  const init = await s.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers: { ...s.auth(), "content-type": "application/json" },
    payload: JSON.stringify({
      reason: "A fresh prod stack for the hello-bedrock test.",
      confirm_zero: true,
      renew: true,
    }),
  });
  expect(init.statusCode).toBe(200);
  await s.services.gateway.probeAll(); // local needs three passes in a row; Bedrock, one
  const health = s.services.gateway.routedAdapters();
  expect(health.map((a) => [a.id, a.health.healthy])).toEqual([
    ["local", false],
    ["bedrock", true],
  ]);
  return s;
}

const hello = (s: TestStack) =>
  s.api.inject({
    method: "POST",
    url: "/hello",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
    payload: JSON.stringify({ message: "Say hello." }),
  });

const spent = async (s: TestStack): Promise<Record<string, bigint>> =>
  Object.fromEntries(
    (
      await s.db.pg.query<{ meter: string; spent_micro: unknown }>("SELECT meter, spent_micro FROM gateway.meters")
    ).rows.map((r) => [r.meter, BigInt(String(r.spent_micro))]),
  );

describe("hello's fallback through the real Bedrock adapter (US5's scenario 2; tasks.md T192)", () => {
  it("answers from Bedrock while local is unhealthy, charged to the fallback's sub-budget, with its client span", async () => {
    const s = await prod();
    const before = await spent(s);
    bedrock.next({ ok: { text: "Hello from Bedrock.", inputTokens: 40, outputTokens: 5, finish: "stop" } });
    const res = await hello(s);
    expect(res.statusCode).toBe(200);
    // 40 input tokens at $1 and 5 output at $5 per million: 65 micro-USD.
    expect(res.json() as Rec).toMatchObject({
      answer: "Hello from Bedrock.",
      route: "fallback",
      route_reason: "local_unhealthy",
      provider: "aws.bedrock",
      model: MODEL,
      usage: { input_tokens: 40, output_tokens: 5 },
      cost_micro_usd: 65,
    });
    const after = await spent(s);
    for (const meter of ["day", "month", "fallback_day"])
      expect([meter, after[meter]! - before[meter]!]).toEqual([meter, 65n]);
    // One Converse request, with hello's system prompt, the message, and hello's output cap.
    const body = bedrock.requests()[0]?.body as Rec | undefined;
    expect(bedrock.requests()).toHaveLength(1);
    expect(body).toMatchObject({
      modelId: MODEL,
      messages: [{ role: "user", content: [{ text: "Say hello." }] }],
      inferenceConfig: { maxTokens: 128 },
    });
    expect((body?.system as unknown[] | undefined)?.length).toBe(1);
    const client = exporter.getFinishedSpans().find((x) => x.kind === SpanKind.CLIENT);
    expect(client?.name).toBe(`chat ${MODEL}`);
    expect(client?.attributes).toMatchObject({
      "gen_ai.provider.name": "aws.bedrock",
      "gen_ai.request.model": MODEL,
      "gen_ai.usage.input_tokens": 40,
      "gen_ai.usage.output_tokens": 5,
      "server.address": "bedrock-runtime.us-east-1.amazonaws.com",
      "server.port": 443,
      "h4.route.decision": "fallback",
      "h4.meter.attribution": "fallback",
      "h4.cost.usd": 0.000065,
    });
    const ledger = await s.db.pg.query<Rec>(
      "SELECT route_decision, attribution, provider, response_model, outcome FROM gateway.ledger WHERE provider = 'aws.bedrock'",
    );
    expect(ledger.rows).toEqual([
      {
        route_decision: "fallback",
        attribution: "fallback",
        provider: "aws.bedrock",
        response_model: MODEL,
        outcome: "ok",
      },
    ]);
  });

  it("opens the circuit after three failed calls, and then refuses hello without calling Bedrock", async () => {
    const s = await prod();
    for (let i = 0; i < 3; i++) {
      bedrock.next({ status: 500 }); // InternalServerException: provider_error, a counted failure
      const res = await hello(s);
      expect([res.statusCode, res.headers["x-h4-degraded-cause"]]).toEqual([503, "fallback_unavailable"]);
    }
    expect(s.services.gateway.routedAdapters()[1]?.health).toMatchObject({ healthy: false, reason: "circuit_open" });
    const refused = await hello(s);
    expect([refused.statusCode, refused.headers["x-h4-degraded-cause"]]).toEqual([503, "fallback_unavailable"]);
    expect(bedrock.requests()).toHaveLength(3);
  });
});
