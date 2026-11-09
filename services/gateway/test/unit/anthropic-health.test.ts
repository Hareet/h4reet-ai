// The Anthropic adapter's health check (spec 010, FR-012; plan §2.7, D6; departure B5; tasks.md T025): the model
// lookup, GET /v1/models/{model}, never a Messages call. Healthy on a 200 naming the configured model or a dated
// snapshot of it; credentials on 401 or 403; timeout when it doesn't answer within the shorter of 5 s and the interval;
// unreachable otherwise. It never rejects. The gateway's own combination with the circuit is test/integration/
// hello-anthropic.test.ts's (the check passes while the circuit is open, and the adapter is still unhealthy).
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AnthropicMessagesAdapter,
  anthropicDeps,
  type AnthropicSettings,
} from "../../src/adapters/anthropic-messages.js";
import type { HealthStatus } from "../../src/core/types.js";
import { stubAnthropic, type StubAnthropic, type AnthropicBehavior } from "../helpers/stub-anthropic.js";

const KEY = `test-${randomBytes(16).toString("hex")}`;
const SETTINGS: AnthropicSettings = {
  model: "claude-haiku-5-5",
  api_key_env: "GATEWAY_ANTHROPIC_API_KEY",
  thinking: "disabled",
  temperature: "model_default",
  timeouts: { connect_ms: 1_000, request_ms: 2_000 },
  retry: { on: ["rate_limited"], max: 1, backoff_ms: 250 },
  circuit: { failures: 3, open_s: 30 },
  health: { interval_ms: 60_000 },
};
const quiet = { info() {}, warn() {}, error() {} };

let stub: StubAnthropic;
beforeAll(async () => {
  stub = await stubAnthropic();
});
afterAll(async () => {
  await stub.close();
});
beforeEach(() => stub.reset());

async function check(
  behavior: AnthropicBehavior | undefined,
  o: { settings?: Partial<AnthropicSettings>; signal?: AbortSignal } = {},
): Promise<HealthStatus> {
  if (behavior !== undefined) stub.nextHealth(behavior);
  const settings = { ...SETTINGS, ...o.settings };
  const ctx = { env: { GATEWAY_ANTHROPIC_API_KEY: KEY }, logger: quiet, realNow: Date.now };
  const adapter = new AnthropicMessagesAdapter(
    "anthropic",
    settings,
    ctx,
    anthropicDeps(settings, ctx, { origin: stub.origin }),
  );
  try {
    return await adapter.health(o.signal ?? AbortSignal.timeout(10_000));
  } finally {
    await adapter.close();
  }
}

const model = (id: string): AnthropicBehavior => ({
  message: { type: "model", id, display_name: "Claude", created_at: "2026-10-01T00:00:00Z" },
});

describe("the model lookup (FR-012)", () => {
  it("asks GET /v1/models/{model}, and never the Messages endpoint", async () => {
    const status = await check(undefined);
    expect(status.healthy).toBe(true);
    expect(stub.requests().map((r) => [r.method, r.path])).toEqual([["GET", "/v1/models/claude-haiku-5-5"]]);
    expect(stub.messages()).toEqual([]);
  });

  it("is healthy on a 200 naming the model or a dated snapshot of it, and unreachable naming another", async () => {
    expect((await check(model("claude-haiku-5-5"))).healthy).toBe(true);
    expect((await check(model("claude-haiku-5-5-20261001"))).healthy).toBe(true);
    for (const id of ["claude-sonnet-5-5", "claude-haiku-5-5-latest", "claude-haiku-5-5-2026100", "claude-haiku"]) {
      const status = await check(model(id));
      expect([status.healthy, status.reason], id).toEqual([false, "unreachable"]);
    }
  });

  it("reads 401 and 403 as credentials, and any other failure as unreachable", async () => {
    for (const s of [401, 403]) expect((await check({ status: s })).reason).toBe("credentials");
    for (const s of [400, 404, 429, 500, 503, 529]) {
      const status = await check({ status: s });
      expect([status.healthy, status.reason], String(s)).toEqual([false, "unreachable"]);
    }
    expect((await check({ refuse: true })).reason).toBe("unreachable");
    expect((await check({ malformed: true })).reason).toBe("unreachable");
  });

  it("is timeout when the lookup hangs, within the shorter of 5 s and the interval", async () => {
    const started = performance.now();
    const status = await check({ hang: true }, { settings: { health: { interval_ms: 400 } } });
    expect([status.healthy, status.reason]).toEqual([false, "timeout"]);
    expect(performance.now() - started).toBeLessThan(400 + 1_500);
  });

  it("never rejects, and gives the HealthStatus shape, even on an aborted signal", async () => {
    const status = await check(undefined, { signal: AbortSignal.abort() });
    expect(status.healthy).toBe(false);
    expect(typeof status.checkedAt).toBe("string");
    expect(typeof status.latencyMs).toBe("number");
  });
});
