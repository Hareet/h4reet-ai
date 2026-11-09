// The paid adapters' temperature setting (spec 010, FR-017; plan §5.2; tasks.md T012). Bedrock's half is on main
// already, from spec 007's plan, D22 (config.test.ts, bedrock-converse.errors.test.ts, twin-paid-temperature.test.ts);
// this holds anthropic-messages to the same rule, against the stub: model_default sends no temperature, whatever the
// request carries, and as_requested, or the key absent, sends it as given. And the committed config/routing.yaml sets
// model_default on both paid adapters, so the twin's 0.3 reaches the local model alone.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  AnthropicMessagesAdapter,
  anthropicDeps,
  type AnthropicSettings,
} from "../../src/adapters/anthropic-messages.js";
import type { PaidTemperature } from "../../src/adapters/_settings.js";
import type { CompletionRequest } from "../../src/core/types.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";

const ROUTING = fileURLToPath(new URL("../../../../config/routing.yaml", import.meta.url));
const KEY = `test-${randomBytes(16).toString("hex")}`;
const SETTINGS: AnthropicSettings = {
  model: "claude-haiku-5-5",
  api_key_env: "GATEWAY_ANTHROPIC_API_KEY",
  thinking: "disabled",
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

async function sent(temperature: PaidTemperature | undefined, requested: number | undefined): Promise<unknown> {
  const settings: AnthropicSettings = { ...SETTINGS, ...(temperature === undefined ? {} : { temperature }) };
  const ctx = { env: { GATEWAY_ANTHROPIC_API_KEY: KEY }, logger: quiet, realNow: Date.now };
  const adapter = new AnthropicMessagesAdapter(
    "anthropic",
    settings,
    ctx,
    anthropicDeps(settings, ctx, { origin: stub.origin }),
  );
  const req: CompletionRequest = {
    requestId: "req-temperature",
    purpose: "twin",
    messages: [{ role: "user", content: "Say hello." }],
    maxOutputTokens: 16,
    ...(requested === undefined ? {} : { temperature: requested }),
    deadline: Date.now() + 5_000,
    signal: new AbortController().signal,
  };
  try {
    await adapter.complete(req);
  } finally {
    await adapter.close();
  }
  const message = stub.messages().at(-1);
  return (message?.body as Record<string, unknown>).temperature;
}

describe("anthropic-messages' temperature (FR-017)", () => {
  it("sends none under model_default, whatever the request carries", async () => {
    expect(await sent("model_default", 0.3)).toBeUndefined();
    expect(await sent("model_default", 1)).toBeUndefined();
    expect(await sent("model_default", undefined)).toBeUndefined();
  });

  it("sends the request's under as_requested, and with the key absent", async () => {
    expect(await sent("as_requested", 0.3)).toBe(0.3);
    expect(await sent(undefined, 0.3)).toBe(0.3);
    expect(await sent(undefined, undefined)).toBeUndefined();
  });
});

describe("the committed config/routing.yaml (FR-017)", () => {
  it("sets model_default on both paid adapters, and on no other", () => {
    const doc = parse(readFileSync(ROUTING, "utf8")) as { adapters: Record<string, Record<string, unknown>> };
    expect(doc.adapters.bedrock?.temperature).toBe("model_default");
    expect(doc.adapters.anthropic?.temperature).toBe("model_default");
    for (const [id, adapter] of Object.entries(doc.adapters)) {
      if (adapter.kind !== "paid") expect(adapter.temperature, id).toBeUndefined();
    }
  });
});
