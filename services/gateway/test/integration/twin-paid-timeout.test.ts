// Spec 007's plan, D43 (the Author's decision of 2026-11-09, "9 s for twin turns (Recommended)"): a twin turn on a
// paid adapter gets one attempt with routing.yaml's `twin_request_ms`, on the visitor's route and on the Author's admin
// route alike; hello and every other purpose keep `timeouts.request_ms` and their retry policy, so SC-005 holds. The
// Author's Bedrock runs at fdb7ad7b timed out six times at 4 s (plan R-2). Here the committed file's values: Bedrock at
// 4 s with a retry on a timeout, which a twin turn never takes, and 9 s for a twin turn; the local model is down, so
// Bedrock answers as prod's fallback.
import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ANTHROPIC_PRICES } from "../helpers/anthropic-config.js";
import { stubBedrock, type StubBedrock } from "../helpers/stub-bedrock.js";
import { ROOM } from "../helpers/twin.js";
import { twinStack, type TwinStack } from "../helpers/twin-stack.js";

type Rec = Record<string, unknown>;

const ROUTING = `schema: 1
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
    model: us.anthropic.claude-test-v1:0
    additional_request_fields: {}
    temperature: model_default
    timeouts: { connect_ms: 1000, request_ms: 4000 }
    twin_request_ms: 9000
    retry: { on: [rate_limited, timeout], max: 1, backoff_ms: 250 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 10000 }
    credentials_warn_before_s: 7200
envs:
  prod: { primary: local, fallback: bedrock }
  dev: { primary: local }
`;

let bedrock: StubBedrock;
const stacks: TwinStack[] = [];
beforeAll(() => {
  bedrock = stubBedrock();
});
afterAll(() => bedrock.restore());
// Bedrock's health check resolves the credential chain for real, as hello-bedrock.test.ts has it: short-lived
// credentials in the environment, built at run time.
beforeEach(() => {
  vi.stubEnv("AWS_PROFILE", undefined);
  vi.stubEnv("AWS_ACCESS_KEY_ID", `test-${randomBytes(8).toString("hex")}`);
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", randomBytes(30).toString("base64url"));
  vi.stubEnv("AWS_SESSION_TOKEN", randomBytes(30).toString("base64url"));
  vi.stubEnv("AWS_CREDENTIAL_EXPIRATION", new Date(Date.now() + 3_600_000).toISOString());
});
afterEach(async () => {
  vi.unstubAllEnvs();
  bedrock.reset();
  for (const t of stacks.splice(0)) await t.close();
});

/** prod with the local model down, so Bedrock answers as the fallback, metered. */
async function prod(): Promise<TwinStack> {
  const t = await twinStack({ stack: "prod", healthy: false, files: { routing: ROUTING, prices: ANTHROPIC_PRICES } });
  stacks.push(t);
  t.stub.setHealth({ status: 503 });
  await t.s.services.gateway.probeAll();
  const health = t.s.services.gateway.routedAdapters();
  expect(health.map((a) => [a.id, a.health.healthy])).toEqual([
    ["local", false],
    ["bedrock", true],
  ]);
  return t;
}

/** The call's elapsed time on the monotonic clock, the one the gateway's timers run on (AbortSignal.timeout,
 *  setTimeout), so a step or slew of the wall clock (a VM's time sync) can't read a cut short or long. */
async function timed<T>(f: () => Promise<T>): Promise<{ out: T; ms: number }> {
  const started = performance.now();
  const out = await f();
  return { out, ms: performance.now() - started };
}

describe("a twin turn's one 9 s attempt on a paid adapter (spec 007's plan, D43)", () => {
  it("answers a visitor's turn that the paid fallback takes 6 s over", async () => {
    const t = await prod();
    bedrock.next({ delayMs: 6_000 });
    bedrock.next({ ok: { text: "A slow, plain answer.", inputTokens: 900, outputTokens: 9, finish: "stop" } });
    const { out: res, ms } = await timed(() => t.turn({ feature: ROOM.third.id, path: "engineer", turns: [] }));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ route: "fallback", text: "A slow, plain answer." });
    // At 4 s it would have timed out and retried, and answered sooner.
    expect(ms).toBeGreaterThanOrEqual(6_000);
  }, 25_000);

  it("still cuts hello's attempt at 4 s, and retries it as hello's policy says (SC-005)", async () => {
    const t = await prod();
    bedrock.next({ delayMs: 6_000 });
    const { out: res, ms } = await timed(() =>
      t.s.api.inject({
        method: "POST",
        url: "/hello",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
        payload: JSON.stringify({}),
      }),
    );
    expect(res.statusCode, res.body).toBe(200);
    // The first attempt was cut at 4 s, and the retry answered at once; at 9 s it would have answered at 6 s.
    expect(ms).toBeGreaterThanOrEqual(4_000);
    expect(ms).toBeLessThan(6_000);
  }, 25_000);

  it("gives the Author's twin call on Bedrock one attempt, cut at 9 s", async () => {
    const t = await prod();
    bedrock.next({ delayMs: 9_500 });
    bedrock.next({ delayMs: 9_500 });
    const { out: res, ms } = await timed(() =>
      t.s.admin.inject({
        method: "POST",
        url: "/admin/twin/turn",
        headers: { ...t.s.auth(), "content-type": "application/json" },
        payload: JSON.stringify({
          feature: ROOM.third.id,
          path: "engineer",
          turns: [],
          adapter: "bedrock",
          reason: "Checks a twin turn's request limit on Bedrock.",
        }),
      }),
    );
    expect(res.statusCode, res.body).toBe(502);
    expect(res.json()).toMatchObject({ error: "provider_error", kind: "timeout" });
    // Cut at 9 s, not 4 s; uncut, the stub's two delays would hold it to about 19 s.
    expect(ms).toBeGreaterThanOrEqual(9_000);
    expect(ms).toBeLessThan(12_000);
    // A timeout is in this policy's retry.on, and a second attempt would fit the deadline: a twin turn takes none.
    const rows = (await t.s.db.pg.query<Rec>("SELECT detail FROM gateway.audit_log WHERE action = 'twin_call'")).rows;
    expect(rows.map((r) => [(r.detail as Rec).attempts, (r.detail as Rec).error_kind])).toEqual([[1, "timeout"]]);
  }, 25_000);
});
