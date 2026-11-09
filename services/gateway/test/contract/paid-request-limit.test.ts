// Spec 007's plan, D43 (the Author's decision of 2026-11-09, "9 s for twin turns (Recommended)"): a call can carry a
// request limit of its own, which a paid adapter bounds the request by in place of its settings' `timeouts.request_ms`.
// The gateway gives a twin turn routing.yaml's `twin_request_ms` that way; every other call carries none, so hello keeps
// its 4 s (SC-005). Here, at small values: a 1 s `request_ms`, a stub that answers after 1.5 s, and a call that carries
// 2.5 s. Nothing leaves the process.
import { randomBytes } from "node:crypto";

import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  AnthropicMessagesAdapter,
  anthropicDeps,
  type AnthropicSettings,
} from "../../src/adapters/anthropic-messages.js";
import { BedrockConverseAdapter, type BedrockSettings } from "../../src/adapters/bedrock-converse.js";
import { ProviderError, type CompletionRequest } from "../../src/core/types.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";
import { stubBedrock } from "../helpers/stub-bedrock.js";

const logger = { info() {}, warn() {}, error() {} };

const request = (o: Partial<CompletionRequest> = {}): CompletionRequest => ({
  requestId: "cd".repeat(16),
  purpose: "twin",
  messages: [{ role: "user", content: "Say hello." }],
  maxOutputTokens: 16,
  deadline: Date.now() + 10_000,
  signal: new AbortController().signal,
  ...o,
});

/** The kind complete() rejects with, or the text it answers. */
async function outcome(complete: Promise<{ text: string }>): Promise<string> {
  try {
    return (await complete).text;
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    return `ProviderError ${err.kind}`;
  }
}

describe("Bedrock bounds a request by its call's own limit, or by request_ms (D43)", () => {
  const SETTINGS: BedrockSettings = {
    region: "us-east-1",
    model: "us.anthropic.claude-test-v1:0",
    additional_request_fields: {},
    timeouts: { connect_ms: 100, request_ms: 1_000 },
    retry: { on: ["rate_limited"], max: 1, backoff_ms: 250 },
    circuit: { failures: 3, open_s: 30 },
    health: { interval_ms: 10_000 },
    credentials_warn_before_s: 7_200,
  };
  const stub = stubBedrock();
  afterAll(() => stub.restore());
  afterEach(() => stub.reset());
  const adapter = () =>
    new BedrockConverseAdapter(
      "bedrock",
      SETTINGS,
      { env: {}, logger, realNow: Date.now },
      {
        client: new BedrockRuntimeClient({ region: "us-east-1", maxAttempts: 1 }),
        credentials: async () => ({ expiration: new Date(Date.now() + 3_600_000) }),
        ssoSessionEnd: async () => undefined,
      },
    );

  // A delayed answer the adapter gave up on still takes the next queued one when its delay ends, so neither test
  // queues one: each reads only whether the call ended in an error.
  it("cuts a call that carries no limit at request_ms", async () => {
    stub.next({ delayMs: 1_500 });
    expect(await outcome(adapter().complete(request()))).toBe("ProviderError timeout");
  });

  it("answers a call whose own limit outlasts the provider", async () => {
    stub.next({ delayMs: 1_500 });
    expect(await outcome(adapter().complete(request({ requestMs: 2_500 })))).not.toMatch(/^ProviderError/);
  });
});

describe("the Anthropic API bounds a request by its call's own limit, or by request_ms (D43)", () => {
  const KEY = `test-${randomBytes(16).toString("hex")}`;
  const SETTINGS: AnthropicSettings = {
    model: "claude-haiku-5-5",
    api_key_env: "GATEWAY_ANTHROPIC_API_KEY",
    thinking: "disabled",
    temperature: "model_default",
    timeouts: { connect_ms: 1_000, request_ms: 1_000 },
    retry: { on: ["rate_limited"], max: 1, backoff_ms: 250 },
    circuit: { failures: 3, open_s: 30 },
    health: { interval_ms: 60_000 },
  };
  let stub: StubAnthropic;
  beforeAll(async () => {
    stub = await stubAnthropic();
  });
  afterAll(async () => {
    await stub.close();
  });
  afterEach(() => stub.reset());
  const adapter = () => {
    const ctx = { env: { GATEWAY_ANTHROPIC_API_KEY: KEY }, logger, realNow: Date.now };
    return new AnthropicMessagesAdapter(
      "anthropic",
      SETTINGS,
      ctx,
      anthropicDeps(SETTINGS, ctx, { origin: stub.origin }),
    );
  };

  // The stub answers its own default after a delay.
  it("cuts a call that carries no limit at request_ms", async () => {
    stub.next({ delayMs: 1_500 });
    const a = adapter();
    expect(await outcome(a.complete(request()))).toBe("ProviderError timeout");
    await a.close();
  });

  it("answers a call whose own limit outlasts the provider", async () => {
    stub.next({ delayMs: 1_500 });
    const a = adapter();
    expect(await outcome(a.complete(request({ requestMs: 2_500 })))).not.toMatch(/^ProviderError/);
    await a.close();
  });
});
