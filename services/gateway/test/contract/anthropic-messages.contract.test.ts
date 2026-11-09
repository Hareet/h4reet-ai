// The Anthropic adapter, type anthropic-messages, against the contract suite (spec 010, FR-008, FR-011, FR-015,
// SC-002; plan §2.9; tasks.md T024; contracts/provider-adapter.md §5.3, mode 1): the real adapter, its SDK, and its
// transport against an in-process stub of the Messages API, at the suite's timeouts (connect 100 ms, request 3 s). The
// key is made at run time; the model's price is made up for the test. The stub's control has no nextHealth: the suite's
// health block holds a local model server's answers (a 503 is `not_ready`), while the model lookup's are FR-012's,
// which test/unit/anthropic-health.test.ts holds. Beside the suite: what §2.4 says of the answer.
import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  AnthropicMessagesAdapter,
  anthropicDeps,
  type AnthropicSettings,
} from "../../src/adapters/anthropic-messages.js";
import { PriceTable } from "../../src/config/validate.js";
import type { CompletionRequest } from "../../src/core/types.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";
import { CONTRACT_TIMEOUTS, describeAdapterContract, type StubControl } from "./adapter-contract.js";

const MODEL = "claude-haiku-5-5";
const KEY = `test-${randomBytes(16).toString("hex")}`;
const SETTINGS: AnthropicSettings = {
  model: MODEL,
  api_key_env: "GATEWAY_ANTHROPIC_API_KEY",
  thinking: "disabled",
  // as_requested, the key absent: the suite's C9 sends a temperature, and sees what it sends.
  timeouts: { connect_ms: CONTRACT_TIMEOUTS.connectMs, request_ms: CONTRACT_TIMEOUTS.requestMs },
  retry: { on: ["rate_limited"], max: 1, backoff_ms: 250 },
  circuit: { failures: 3, open_s: 30 },
  health: { interval_ms: 60_000 },
};
/** A test-only price, $1 in and $5 out per million tokens; not Anthropic's. */
const PRICES = new PriceTable([
  {
    id: "test.1",
    effectiveFrom: 0,
    source: "the Anthropic contract test",
    // No cache_read_input in the file prices cache reads at input, which never undercounts (plan §4.1).
    entries: [
      {
        provider: "anthropic",
        model: MODEL,
        input: 1_000_000n,
        output: 5_000_000n,
        cacheReadInput: 1_000_000n,
        placeholders: [],
      },
    ],
  },
]);

let stub: StubAnthropic | undefined;
afterAll(async () => {
  await stub?.close();
});

describeAdapterContract(
  "anthropic-messages",
  async ({ logger }) => {
    stub = await stubAnthropic({ model: MODEL });
    const s = stub;
    const ctx = { env: { GATEWAY_ANTHROPIC_API_KEY: KEY }, logger, realNow: Date.now };
    const adapter = new AnthropicMessagesAdapter(
      "anthropic",
      SETTINGS,
      ctx,
      anthropicDeps(SETTINGS, ctx, { origin: s.origin }),
    );
    const control: StubControl = {
      next: (b) => s.next(b),
      requests: () => s.requests(),
      get canary() {
        return s.canary;
      },
      reset: () => s.reset(),
    };
    return { adapter, prices: PRICES, stub: control };
  },
  "stub",
);

describe("the answer, by plan §2.4 (FR-008)", () => {
  let answers: StubAnthropic;
  const quiet = { info() {}, warn() {}, error() {} };
  const logged: string[] = [];
  const logger = { ...quiet, warn: (r: object, m: string) => void logged.push(JSON.stringify(r) + m) };

  beforeEach(async () => {
    answers ??= await stubAnthropic({ model: MODEL });
    answers.reset();
    logged.length = 0;
  });
  afterAll(async () => {
    await answers?.close();
  });

  async function answer(message: Record<string, unknown>) {
    answers.next({ message });
    const ctx = { env: { GATEWAY_ANTHROPIC_API_KEY: KEY }, logger, realNow: Date.now };
    const a = new AnthropicMessagesAdapter(
      "anthropic",
      SETTINGS,
      ctx,
      anthropicDeps(SETTINGS, ctx, { origin: answers.origin }),
    );
    const req: CompletionRequest = {
      requestId: "req-answer",
      purpose: "contract",
      messages: [{ role: "user", content: "Name a colour." }],
      maxOutputTokens: 64,
      deadline: Date.now() + 5_000,
      signal: new AbortController().signal,
    };
    try {
      return await a.complete(req);
    } finally {
      await a.close();
    }
  }
  const usage = { input_tokens: 31, output_tokens: 4 };

  it("joins the text blocks, and never shows a thinking block, though thinking is off", async () => {
    const out = await answer({
      id: "msg_1",
      model: MODEL,
      content: [
        { type: "thinking", thinking: "a private chain", signature: "x" },
        { type: "text", text: "Blue, " },
        { type: "redacted_thinking", data: "y" },
        { type: "text", text: "then green." },
      ],
      stop_reason: "end_turn",
      usage,
    });
    expect(out.text).toBe("Blue, then green.");
    expect(JSON.stringify(out)).not.toContain("a private chain");
  });

  it("maps each stop reason to the contract's finish reason", async () => {
    const cases: [string | null, string][] = [
      ["end_turn", "stop"],
      ["stop_sequence", "stop"],
      ["max_tokens", "length"],
      ["refusal", "content_filter"],
      ["tool_use", "other"],
      ["pause_turn", "other"],
      ["model_context_window_exceeded", "other"],
      [null, "other"],
    ];
    for (const [stop, finish] of cases) {
      const out = await answer({
        id: "msg_2",
        model: MODEL,
        content: [{ type: "text", text: "x" }],
        stop_reason: stop,
        usage,
      });
      expect(out.finishReason, String(stop)).toBe(finish);
    }
  });

  it("counts cache writes as input and cache reads apart, and logs a cache write no request asked for", async () => {
    const out = await answer({
      id: "msg_3",
      model: MODEL,
      content: [{ type: "text", text: "x" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 31, output_tokens: 4, cache_creation_input_tokens: 7, cache_read_input_tokens: 5 },
    });
    expect(out.usage).toEqual({ inputTokens: 38, outputTokens: 4, cacheReadInputTokens: 5 });
    expect(logged.join("\n")).toContain("adapter.cache_write_reported");
    const plain = await answer({
      id: "msg_4",
      model: MODEL,
      content: [{ type: "text", text: "x" }],
      stop_reason: "end_turn",
      usage,
    });
    expect(plain.usage).toEqual({ inputTokens: 31, outputTokens: 4 });
  });

  it("keeps the response's model and ID only when short and printable", async () => {
    const kept = await answer({
      id: "msg_5",
      model: "claude-haiku-5-5-20261001",
      content: [],
      stop_reason: "end_turn",
      usage,
    });
    expect([kept.responseModel, kept.responseId, kept.text]).toEqual(["claude-haiku-5-5-20261001", "msg_5", ""]);
    const dropped = await answer({
      id: "id with spaces",
      model: "x".repeat(200),
      content: [],
      stop_reason: "end_turn",
      usage,
    });
    expect([dropped.responseModel, dropped.responseId]).toEqual([MODEL, undefined]);
  });

  it("logs an input past the 100,000-token tier with its count, and counts it (R-10)", async () => {
    const out = await answer({
      id: "msg_6",
      model: MODEL,
      content: [{ type: "text", text: "x" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100_001, output_tokens: 1 },
    });
    expect(out.usage.inputTokens).toBe(100_001);
    expect(logged.join("\n")).toContain("cost.tier_edge");
  });
});
