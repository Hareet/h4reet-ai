// POST /admin/adapters/{id}/complete (contracts/operator-admin.md §5; tasks.md T103): one named adapter, called
// directly, behind the admin listener's authentication. The local adapter answers from the stub OpenAI server, free
// and unmetered; prod's Bedrock fallback answers from aws-sdk-client-mock, through admission as `test`, charged to the
// day and month meters and never to the sub-budget. The model and price are made up for the test (tasks.md T105).
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { stubBedrock, type StubBedrock } from "../helpers/stub-bedrock.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";
import { testStack, type StackName, type TestStack } from "../helpers/stack.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const MODEL = "us.anthropic.claude-test-v1:0";

/** prod's route with a Bedrock fallback (config-files.md §1.2's last step), and a test-only price for its model. */
async function bedrockConfigDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "h4-config-bedrock-"));
  for (const file of ["budgets.yaml", "alerts.yaml"]) await copyFile(join(FIXTURES, file), join(dir, file));
  await writeFile(
    join(dir, "routing.yaml"),
    `schema: 1
deadline_ms: 20000
adapters:
  local:
    type: openai-compatible
    kind: local
    provider: local
    base_url_env: LOCAL_MODEL_BASE_URL
    model_env: LOCAL_MODEL_NAME
    timeouts: { connect_ms: 1000, request_ms: 10000 }
    health: { path: /models, interval_ms: 1000, timeout_ms: 800, unhealthy_after: 1, healthy_after: 3 }
  bedrock:
    type: bedrock-converse
    kind: paid
    region: us-east-1
    model: "${MODEL}"
    additional_request_fields: {}
    timeouts: { connect_ms: 1000, request_ms: 2000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 50 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 10000 }
    credentials_warn_before_s: 7200
envs:
  prod: { primary: local, fallback: bedrock }
  dev: { primary: local }
`,
  );
  await writeFile(
    join(dir, "prices.yaml"),
    `schema: 1
currency: USD
unit: per_million_tokens
versions:
  - id: "2026-10-08.1"
    effective_from: "2026-10-08T00:00:00Z"
    source: "the adapter-calls test: a made-up Bedrock price"
    entries:
      - provider: local
        model: "*"
        input: 0
        output: 0
      - provider: aws.bedrock
        model: "${MODEL}"
        input: 1
        output: 5
`,
  );
  return dir;
}

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

async function stack(
  o: { stack?: StackName; withBedrock?: boolean; synthetic?: boolean; init?: boolean; renew?: boolean } = {},
): Promise<TestStack> {
  const configDir = o.withBedrock === true ? await bedrockConfigDir() : undefined;
  if (configDir !== undefined) dirs.push(configDir);
  const s = await testStack({
    stack: o.stack ?? "dev",
    env: { LOCAL_MODEL_BASE_URL: openai.baseUrl },
    ...(configDir === undefined ? {} : { configDir }),
    ...(o.synthetic === true ? { fallback: true } : {}),
  });
  stacks.push(s);
  if (o.init !== false) {
    const res = await s.admin.inject({
      method: "POST",
      url: "/admin/init",
      headers: { ...s.auth(), "content-type": "application/json" },
      payload: JSON.stringify({
        reason: "A fresh stack for the adapter-calls test.",
        confirm_zero: true,
        renew: o.renew ?? true,
      }),
    });
    expect(res.statusCode).toBe(200);
  }
  return s;
}

const body = (o: Record<string, unknown> = {}) => ({
  messages: [
    { role: "system", content: "You are a contract test. Answer in one word." },
    { role: "user", content: "Name a colour." },
  ],
  max_output_tokens: 16,
  purpose: "contract",
  reason: "contract-live local, 2026-10-10",
  ...o,
});

const post = (s: TestStack, id: string, payload: unknown, headers: Record<string, string> = {}) =>
  s.admin.inject({
    method: "POST",
    url: `/admin/adapters/${id}/complete`,
    headers: { ...s.auth(), "content-type": "application/json", ...headers },
    payload: JSON.stringify(payload),
  });

const audits = async (s: TestStack) =>
  (
    await s.db.pg.query<{ id: number; actor: string; reason: string; detail: Record<string, unknown> }>(
      "SELECT id, actor, reason, detail FROM gateway.audit_log WHERE action = 'adapter_call' ORDER BY id",
    )
  ).rows;

describe("POST /admin/adapters/local/complete (§5)", () => {
  it("answers from the local adapter, free and unmetered, with the span's keys and an audit row", async () => {
    const s = await stack();
    openai.next({ ok: { text: "Blue.", inputTokens: 31, outputTokens: 2, finish: "stop" } });
    const res = await post(s, "local", body({ temperature: 0 }));
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b).toMatchObject({
      adapter: "local",
      attribution: "none",
      result: {
        text: "Blue.",
        usage: { input_tokens: 31, output_tokens: 2, cache_read_input_tokens: 0 },
        finish_reason: "stop",
        response_model: "stand-in",
      },
      cost_micro_usd: "0",
      cost_basis: "none",
      price_version: "2026-10-08.1",
      span: { name: "chat stand-in", kind: "client" },
    });
    expect(b.span.attribute_keys).toEqual(expect.arrayContaining(["gen_ai.usage.input_tokens", "h4.cost.usd"]));
    expect(b.span.attribute_keys).not.toContain("error.type");
    expect(typeof b.trace_id).toBe("string");
    // The temperature reached the model server, as given.
    expect(
      (openai.requests().filter((r) => r.method === "POST")[0]?.body as { temperature?: unknown }).temperature,
    ).toBe(0);
    const [audit] = await audits(s);
    expect(b.audit_id).toBe(audit?.id);
    expect(audit?.reason).toBe("contract-live local, 2026-10-10");
    expect(audit?.detail).toMatchObject({ adapter: "local", purpose: "contract", attribution: "none", outcome: "ok" });
    const ledger = await s.db.pg.query<{ attribution: string; cost_micro: unknown }>(
      "SELECT attribution, cost_micro FROM gateway.ledger WHERE purpose = 'contract'",
    );
    expect(ledger.rows.map((r) => [r.attribution, String(r.cost_micro)])).toEqual([["none", "0"]]);
  });

  it("answers a provider error with 502, its kind and flags, and no payload", async () => {
    const s = await stack();
    openai.next({ status: 500, body: `the model server broke: ${openai.canary}` });
    const res = await post(s, "local", body());
    expect(res.statusCode).toBe(502);
    const b = res.json();
    expect(b).toMatchObject({
      error: "provider_error",
      kind: "provider_error",
      retryable: true,
      possibly_billed: false,
      status: 500,
      cost_micro_usd: "0",
    });
    expect(b.span.attribute_keys).toContain("error.type");
    expect(res.body).not.toContain(openai.canary);
    expect((await audits(s))[0]?.detail).toMatchObject({ outcome: "error", error_kind: "provider_error" });
  });

  it("is 404 for an adapter this route doesn't call directly: bedrock off prod, synthetic, or none at all", async () => {
    const s = await stack();
    for (const id of ["bedrock", "synthetic", "nope"]) {
      const res = await post(s, id, body());
      expect([id, res.statusCode, res.json()]).toEqual([id, 404, { error: "unknown_adapter" }]);
    }
    expect(await audits(s)).toEqual([]);
  });

  it("is 404 for the synthetic adapter even where the route builds it as dev's fallback", async () => {
    const s = await stack({ synthetic: true });
    expect(s.services.gateway.fallbackId()).toBe("synthetic");
    const res = await post(s, "synthetic", body());
    expect([res.statusCode, res.json()]).toEqual([404, { error: "unknown_adapter" }]);
    expect(await audits(s)).toEqual([]);
  });

  it("refuses a body §5's table doesn't allow, before any call", async () => {
    const s = await stack();
    const sys = { role: "system", content: "Be brief." };
    const user = { role: "user", content: "Hi." };
    const cases: [Record<string, unknown>, string][] = [
      [body({ messages: [] }), "messages"],
      [body({ messages: Array(9).fill(user) }), "messages"],
      [body({ messages: [sys, sys, user] }), "messages[1].role"],
      [body({ messages: [user, sys] }), "messages[1].role"],
      [body({ messages: [{ role: "tool", content: "x" }] }), "messages[0].role"],
      [body({ messages: [{ role: "user", content: "x".repeat(2_001) }] }), "messages"],
      [body({ max_output_tokens: 0 }), "max_output_tokens"],
      [body({ max_output_tokens: 513 }), "max_output_tokens"],
      [body({ temperature: 1.5 }), "temperature"],
      [body({ purpose: "hello" }), "purpose"],
      [body({ reason: "short" }), "reason"],
      [{ ...body(), stream: true }, "body"],
    ];
    for (const [payload, field] of cases) {
      const res = await post(s, "local", payload);
      expect([field, res.statusCode, res.json().field]).toEqual([field, 400, field]);
    }
    expect(openai.requests().filter((r) => r.method === "POST")).toEqual([]);
  });

  it("is 415 without JSON, 401 without the token, and 503 on an uninitialized store", async () => {
    const s = await stack({ init: false });
    expect((await post(s, "local", body(), { "content-type": "text/plain" })).statusCode).toBe(415);
    const anon = await s.admin.inject({
      method: "POST",
      url: "/admin/adapters/local/complete",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(body()),
    });
    expect(anon.statusCode).toBe(401);
    const res = await post(s, "local", body());
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ state: "degraded", cause: "store_uninitialized" });
  });
});

describe("POST /admin/adapters/bedrock/complete, prod only (§5)", () => {
  const meters = async (s: TestStack) =>
    (
      await s.db.pg.query<{ meter: string; spent_micro: string }>(
        "SELECT meter, spent_micro FROM gateway.meters ORDER BY meter",
      )
    ).rows;

  it("calls Bedrock through admission as test: charged to the day and month, never to the sub-budget", async () => {
    const s = await stack({ stack: "prod", withBedrock: true });
    const before = await meters(s);
    bedrock.next({ ok: { text: "Red.", inputTokens: 12, outputTokens: 3, finish: "stop" } });
    const res = await post(s, "bedrock", body({ reason: "contract-live bedrock, 2026-10-10" }));
    expect(res.statusCode).toBe(200);
    const b = res.json();
    // 12 tokens at $1 and 3 at $5 per million: 27 micro-USD.
    expect(b).toMatchObject({
      adapter: "bedrock",
      attribution: "test",
      result: {
        text: "Red.",
        usage: { input_tokens: 12, output_tokens: 3 },
        finish_reason: "stop",
        response_model: MODEL,
      },
      cost_micro_usd: "27",
      cost_basis: "usage",
      span: { name: `chat ${MODEL}`, kind: "client" },
    });
    expect(b.span.attribute_keys).toEqual(expect.arrayContaining(["server.port", "gen_ai.response.id"]));
    const spent = Object.fromEntries((await meters(s)).map((m) => [m.meter, BigInt(m.spent_micro)]));
    const was = Object.fromEntries(before.map((m) => [m.meter, BigInt(m.spent_micro)]));
    expect(spent.day! - was.day!).toBe(27n);
    expect(spent.month! - was.month!).toBe(27n);
    expect(spent.fallback_day).toBe(was.fallback_day);
    // The audit row keys the call's one ledger row by its reservation.
    const detail = (await audits(s))[0]?.detail as { ledger_ref: string; attribution: string };
    expect(detail.attribution).toBe("test");
    const ledger = await s.db.pg.query<{ attribution: string; cost_micro: unknown }>(
      "SELECT attribution, cost_micro FROM gateway.ledger WHERE reservation_id = $1",
      [detail.ledger_ref],
    );
    expect(ledger.rows.map((r) => [r.attribution, String(r.cost_micro)])).toEqual([["test", "27"]]);
  });

  it("retries a throttled call once, then answers 502 rate_limited, unbilled, naming the error on the span", async () => {
    const s = await stack({ stack: "prod", withBedrock: true });
    bedrock.next({ status: 429 });
    bedrock.next({ status: 429 });
    const res = await post(s, "bedrock", body({ reason: "contract-live bedrock, 2026-10-10" }));
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      kind: "rate_limited",
      retryable: true,
      possibly_billed: false,
      status: 429,
      cost_micro_usd: "0",
    });
    expect(res.json().span.attribute_keys).toContain("error.type");
    expect(bedrock.requests()).toHaveLength(2);
    expect((await audits(s))[0]?.detail).toMatchObject({ outcome: "error", error_kind: "rate_limited", attempts: 2 });
  });

  it("never fails over: a local call that finds the model server down answers 502, and Bedrock isn't called", async () => {
    const s = await stack({ stack: "prod", withBedrock: true });
    openai.next({ refuse: true });
    const res = await post(s, "local", body());
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: "provider_error", kind: "unavailable", cost_micro_usd: "0" });
    expect(bedrock.requests()).toEqual([]);
  });

  it("goes by the ceilings alone: a fallback awaiting renewal doesn't hold a test call", async () => {
    const s = await stack({ stack: "prod", withBedrock: true, renew: false });
    const state = await s.db.pg.query<{ fallback_awaiting_renewal: boolean }>(
      "SELECT fallback_awaiting_renewal FROM gateway.stack_state",
    );
    expect(state.rows[0]?.fallback_awaiting_renewal).toBe(true);
    bedrock.next({ ok: { text: "Red.", inputTokens: 12, outputTokens: 3, finish: "stop" } });
    const res = await post(s, "bedrock", body({ reason: "contract-live bedrock, 2026-10-10" }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ attribution: "test", cost_micro_usd: "27" });
  });

  it("charges a timeout its reservation: the request may have reached the model", async () => {
    const s = await stack({ stack: "prod", withBedrock: true });
    bedrock.next({ delayMs: 5_000 });
    const res = await post(s, "bedrock", body({ reason: "contract-live bedrock, 2026-10-10" }));
    expect(res.statusCode).toBe(502);
    const b = res.json();
    expect(b).toMatchObject({ kind: "timeout", possibly_billed: true });
    expect(BigInt(b.cost_micro_usd)).toBeGreaterThan(0n);
    expect((await audits(s))[0]?.detail).toMatchObject({ outcome: "error", error_kind: "timeout" });
  });
});

describe("the endpoint's records (telemetry.md §4.1, §5.2; data-model.md §1)", () => {
  it("counts each response once in h4.gateway.requests, by its decision and outcome", async () => {
    const s = await stack({ stack: "prod", withBedrock: true });
    const counted = vi.spyOn(s.services.metrics, "request");
    openai.next({ ok: { text: "Blue.", inputTokens: 31, outputTokens: 2, finish: "stop" } });
    expect((await post(s, "local", body())).statusCode).toBe(200);
    openai.next({ status: 500, body: "the model server broke" });
    expect((await post(s, "local", body())).statusCode).toBe(502);
    bedrock.next({ ok: { text: "Red.", inputTokens: 12, outputTokens: 3, finish: "stop" } });
    expect((await post(s, "bedrock", body({ reason: "contract-live bedrock, 2026-10-10" }))).statusCode).toBe(200);
    expect((await post(s, "local", body({ purpose: "hello" }))).statusCode).toBe(400);
    expect((await post(s, "nope", body())).statusCode).toBe(404);
    const anon = await s.admin.inject({
      method: "POST",
      url: "/admin/adapters/local/complete",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(body()),
    });
    expect(anon.statusCode).toBe(401); // counted as hello counts an unauthorized answer: invalid
    expect(counted.mock.calls.map(([decision, outcome]) => [decision, outcome])).toEqual([
      ["local", "ok"],
      ["local", "error"],
      ["metered", "ok"],
      ["none", "invalid"],
      ["none", "invalid"],
      ["none", "invalid"],
    ]);
    for (const [, , seconds] of counted.mock.calls) expect(seconds).toBeGreaterThanOrEqual(0);
  });

  it("logs call.degraded and counts the cause for a degraded response", async () => {
    const s = await stack({ init: false });
    const counted = vi.spyOn(s.services.metrics, "request");
    const causes = vi.spyOn(s.services.metrics, "degradedResponse");
    expect((await post(s, "local", body())).statusCode).toBe(503);
    expect(counted.mock.calls.map(([decision, outcome]) => [decision, outcome])).toEqual([["degraded", "degraded"]]);
    expect(causes.mock.calls).toEqual([["store_uninitialized"]]);
    expect(s.logged.filter((l) => l.record.event === "call.degraded")).toEqual([
      {
        level: "warn",
        record: expect.objectContaining({ cause: "store_uninitialized", route_decision: "degraded" }),
      },
    ]);
  });

  it("logs call.refused for a 429, under the call's own decision", async () => {
    const s = await stack({ stack: "prod", withBedrock: true });
    const counted = vi.spyOn(s.services.metrics, "request");
    vi.spyOn(s.services.gateway, "adapterCall").mockResolvedValue({
      kind: "refused",
      route: "metered",
      error: "metered_capacity_exceeded",
      limit: "global_in_flight",
      retryAfterS: 1,
      traceId: "0af7651916cd43dd8448eb211c80319c",
    });
    const res = await post(s, "bedrock", body({ reason: "contract-live bedrock, 2026-10-10" }));
    expect(res.statusCode).toBe(429);
    expect(counted.mock.calls.map(([decision, outcome]) => [decision, outcome])).toEqual([["metered", "refused"]]);
    expect(s.logged.filter((l) => l.record.event === "call.refused")).toEqual([
      {
        level: "info",
        record: expect.objectContaining({ error: "metered_capacity_exceeded", limit: "global_in_flight" }),
      },
    ]);
  });

  it("stamps the audit row with the gateway clock, test offset included", async () => {
    const s = await stack();
    const day = 86_400_000;
    await s.db.pg.query("UPDATE gateway.stack_state SET test_clock_offset_ms = $1", [day]);
    openai.next({ ok: { text: "Blue.", inputTokens: 31, outputTokens: 2, finish: "stop" } });
    const before = Date.now();
    expect((await post(s, "local", body())).statusCode).toBe(200);
    const { rows } = await s.db.pg.query<{ ts: unknown }>(
      "SELECT ts FROM gateway.audit_log WHERE action = 'adapter_call'",
    );
    const ts = new Date(String(rows[0]?.ts instanceof Date ? rows[0].ts.toISOString() : rows[0]?.ts)).getTime();
    expect(ts - before).toBeGreaterThanOrEqual(day - 1_000);
    expect(ts - Date.now()).toBeLessThanOrEqual(day + 1_000);
  });
});
