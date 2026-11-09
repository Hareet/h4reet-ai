// What the Anthropic adapter sends, and how its client is built (spec 010, FR-006, FR-007; plan §2.3, D4; departures
// B2, B3; tasks.md T023): one Messages request with the system message as `system`, the turns in order, the cap, and
// thinking disabled, and nothing else; a client given every option explicitly; and no variable the SDK reads on its own
// changes the request, its destination, its key, or what is logged. Every key here is made at run time.
import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANTHROPIC_ORIGIN,
  ANTHROPIC_USER_AGENT,
  ANTHROPIC_VERSION,
  AnthropicMessagesAdapter,
  anthropicDeps,
  clientOptions,
  factory,
  type AnthropicSettings,
} from "../../src/adapters/anthropic-messages.js";
import type { CompletionRequest } from "../../src/core/types.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";

const KEY = `test-${randomBytes(16).toString("hex")}`;
const SYSTEM = "anthropic-request-system-6d2c: answer in one word.";
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

let stub: StubAnthropic;
const logged: string[] = [];
const logger = {
  info: (r: object, m: string) => void logged.push(JSON.stringify(r) + m),
  warn: (r: object, m: string) => void logged.push(JSON.stringify(r) + m),
  error: (r: object, m: string) => void logged.push(JSON.stringify(r) + m),
};
beforeAll(async () => {
  stub = await stubAnthropic();
});
afterAll(async () => {
  await stub.close();
});
beforeEach(() => {
  stub.reset();
  logged.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function adapter(settings: AnthropicSettings = SETTINGS): AnthropicMessagesAdapter {
  const ctx = { env: { GATEWAY_ANTHROPIC_API_KEY: KEY }, logger, realNow: Date.now };
  return new AnthropicMessagesAdapter(
    "anthropic",
    settings,
    ctx,
    anthropicDeps(settings, ctx, { origin: stub.origin }),
  );
}

const request = (o: Partial<CompletionRequest> = {}): CompletionRequest => ({
  requestId: "req-anthropic-request-0001",
  purpose: "twin",
  messages: [
    { role: "system", content: SYSTEM },
    { role: "user", content: "first turn" },
    { role: "assistant", content: "second turn" },
    { role: "user", content: "third turn" },
  ],
  maxOutputTokens: 300,
  temperature: 0.3,
  deadline: Date.now() + 5_000,
  signal: new AbortController().signal,
  ...o,
});

async function sentBody(a = adapter(), req = request()): Promise<Record<string, unknown>> {
  try {
    await a.complete(req);
  } finally {
    await a.close();
  }
  const sent = stub.messages().at(-1);
  return sent?.body as Record<string, unknown>;
}

describe("the request (FR-006)", () => {
  it("sends the system message as system, the turns in order, the cap, and thinking disabled, and nothing else", async () => {
    const body = await sentBody();
    expect(body).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 300,
      system: SYSTEM,
      messages: [
        { role: "user", content: "first turn" },
        { role: "assistant", content: "second turn" },
        { role: "user", content: "third turn" },
      ],
      thinking: { type: "disabled" },
    });
    for (const key of [
      "temperature",
      "metadata",
      "tools",
      "tool_choice",
      "stream",
      "stop_sequences",
      "service_tier",
      "top_k",
      "top_p",
      "output_config",
    ]) {
      expect(body, key).not.toHaveProperty(key);
    }
    expect(JSON.stringify(body)).not.toContain("cache_control");
    expect(JSON.stringify(body)).not.toContain("req-anthropic-request-0001");
    expect(Object.keys(stub.messages().at(-1)?.headers ?? {})).not.toContain("anthropic-beta");
  });

  it("sends no system field when the request has no system message", async () => {
    const body = await sentBody(adapter(), request({ messages: [{ role: "user", content: "only a turn" }] }));
    expect(body).not.toHaveProperty("system");
  });
});

describe("the client, every option explicit (FR-007; departure B3)", () => {
  it("gives the SDK the key, the fixed origin, no retries, the settings' timeout, its logging and spans off, and the transport", () => {
    const fetch = async (): Promise<Response> => new Response(null, { status: 204 });
    expect(clientOptions(SETTINGS, KEY, ANTHROPIC_ORIGIN, fetch)).toEqual({
      apiKey: KEY,
      authToken: null,
      webhookKey: null,
      baseURL: "https://api.anthropic.com",
      maxRetries: 0,
      timeout: 2_000,
      fetch,
      logLevel: "off",
      logger: expect.objectContaining({ debug: expect.any(Function), warn: expect.any(Function) }),
      openTelemetry: { propagation: false, traces: { enabled: false } },
    });
  });

  it("builds the production adapter against api.anthropic.com alone, its key from its own context", async () => {
    const ctx = { env: { GATEWAY_ANTHROPIC_API_KEY: KEY }, logger, realNow: Date.now };
    const built = factory.create("anthropic", SETTINGS, ctx);
    expect(built.server).toEqual({ address: "api.anthropic.com", port: 443 });
    expect([built.provider, built.kind, built.type, built.model]).toEqual([
      "anthropic",
      "paid",
      "anthropic-messages",
      "claude-haiku-5-5",
    ]);
    expect(ANTHROPIC_ORIGIN).toBe("https://api.anthropic.com");
    await built.close?.();
  });

  it("refuses to build without its key, naming the key, never a value", () => {
    const ctx = { env: { GATEWAY_ANTHROPIC_API_KEY: "" }, logger, realNow: Date.now };
    expect(() => factory.create("anthropic", SETTINGS, ctx)).toThrow(/GATEWAY_ANTHROPIC_API_KEY is unset/);
  });

  it("sends the API version and user agent the pinned SDK sends on its own", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const seen: Headers[] = [];
    const client = new Anthropic({
      apiKey: KEY,
      baseURL: stub.origin,
      maxRetries: 0,
      logLevel: "off",
      webhookKey: null,
      openTelemetry: false,
      fetch: async (input, init) => {
        seen.push(new Headers(init?.headers));
        return globalThis.fetch(input, init);
      },
    });
    await client.models.retrieve("claude-haiku-5-5");
    expect(seen[0]?.get("anthropic-version")).toBe(ANTHROPIC_VERSION);
    expect(seen[0]?.get("user-agent")).toBe(ANTHROPIC_USER_AGENT);
    // Departure B2: the pinned SDK sends an API key as a bearer token, not as x-api-key.
    expect(seen[0]?.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(seen[0]?.get("x-api-key")).toBeNull();
  });
});

describe("the SDK's own variables change nothing (FR-007; departure B3)", () => {
  it("leaves the request, its destination, its key, and the logs as they were", async () => {
    const quiet = await sentBody();
    const quietHeaders = stub.messages().at(-1)?.headers;
    stub.reset();
    const other = `test-${randomBytes(16).toString("hex")}`;
    vi.stubEnv("ANTHROPIC_API_KEY", other);
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", other);
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:9");
    vi.stubEnv("ANTHROPIC_LOG", "debug");
    vi.stubEnv("ANTHROPIC_CUSTOM_HEADERS", `x-api-key: ${other}\nanthropic-version: 2023-06-01\nx-extra: 1`);
    vi.stubEnv("ANTHROPIC_OPEN_TELEMETRY", "true");
    vi.stubEnv("ANTHROPIC_OPEN_TELEMETRY_PROPAGATION", "true");
    vi.stubEnv("ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE", "content");
    const console$ = vi.spyOn(console, "log");
    const consoleDebug = vi.spyOn(console, "debug");
    const consoleWarn = vi.spyOn(console, "warn");
    const loud = await sentBody();
    const loudHeaders = stub.messages().at(-1)?.headers;
    expect(loud).toEqual(quiet);
    expect(stub.messages()).toHaveLength(1); // it went to the stub, not to ANTHROPIC_BASE_URL
    expect(loudHeaders).toEqual(quietHeaders);
    expect(loudHeaders?.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.stringify(loudHeaders)).not.toContain(other);
    expect(console$).not.toHaveBeenCalled();
    expect(consoleDebug).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(logged.join("\n")).not.toContain(KEY);
  });
});
