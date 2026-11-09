// The Anthropic adapter's errors beyond C4's shared cases (spec 010, FR-009, FR-010, FR-031; plan §2.5; tasks.md
// T008; contracts/provider-adapter.md §2.5's Anthropic column): each status, each way a connection fails, the request
// timeout, the deadline, and each 200 the adapter can't use, as one ProviderError kind with §2.5's flags and a code of
// §2.5's shapes; never the key, the prompt, the system prompt, or the stub's canary, in the error or a log record.
import { randomBytes } from "node:crypto";
import type { LookupFunction } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AnthropicMessagesAdapter,
  anthropicDeps,
  type AnthropicSettings,
} from "../../src/adapters/anthropic-messages.js";
import { ProviderError, type CompletionRequest, type ProviderErrorKind } from "../../src/core/types.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";

const KEY = `test-${randomBytes(16).toString("hex")}`;
const SYSTEM = "anthropic-errors-system-3e7a: answer in one word.";
const PROMPT = "anthropic-errors-prompt-8b2f: name a colour.";
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

function adapter(o: { origin?: string; lookup?: LookupFunction; settings?: Partial<AnthropicSettings> } = {}) {
  const settings = { ...SETTINGS, ...o.settings };
  const ctx = { env: { GATEWAY_ANTHROPIC_API_KEY: KEY }, logger, realNow: Date.now };
  return new AnthropicMessagesAdapter(
    "anthropic",
    settings,
    ctx,
    anthropicDeps(settings, ctx, {
      origin: o.origin ?? stub.origin,
      ...(o.lookup === undefined ? {} : { lookup: o.lookup }),
    }),
  );
}

const request = (o: Partial<CompletionRequest> = {}): CompletionRequest => ({
  requestId: "req-anthropic-errors",
  purpose: "contract",
  messages: [
    { role: "system", content: SYSTEM },
    { role: "user", content: PROMPT },
  ],
  maxOutputTokens: 16,
  deadline: Date.now() + 5_000,
  signal: new AbortController().signal,
  ...o,
});

async function fails(a: AnthropicMessagesAdapter, req = request()): Promise<ProviderError> {
  try {
    await a.complete(req);
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderError);
    return err as ProviderError;
  } finally {
    await a.close();
  }
  throw new Error("the call succeeded");
}

function clean(err: ProviderError): void {
  expect(err.message).toBe(err.kind);
  expect("cause" in err).toBe(false);
  for (const text of [String(err), JSON.stringify(err), err.stack ?? "", ...logged]) {
    for (const marker of [KEY, SYSTEM, PROMPT, stub.canary]) expect(text).not.toContain(marker);
  }
}

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

describe("each status, by the Anthropic column of §2.5", () => {
  const cases: [number, ProviderErrorKind, boolean, boolean, string][] = [
    [400, "bad_request", false, false, "BadRequestError"],
    [401, "auth", false, false, "AuthenticationError"],
    [403, "auth", false, false, "PermissionDeniedError"],
    [404, "bad_request", false, false, "NotFoundError"],
    [409, "provider_error", true, false, "ConflictError"],
    [413, "bad_request", false, false, "http_413"],
    [422, "bad_request", false, false, "UnprocessableEntityError"],
    [429, "rate_limited", true, false, "RateLimitError"],
    [500, "provider_error", true, false, "InternalServerError"],
    [502, "unavailable", true, false, "InternalServerError"],
    [503, "unavailable", true, false, "InternalServerError"],
    [504, "timeout", true, true, "InternalServerError"],
    [529, "unavailable", true, false, "InternalServerError"],
    [418, "provider_error", true, false, "http_418"],
  ];
  for (const [status, kind, retryable, billed, code] of cases) {
    it(`${status} is ${kind}, retryable ${retryable}, possibly billed ${billed}, code ${code}`, async () => {
      stub.next({ status });
      const err = await fails(adapter());
      expect([err.kind, err.retryable, err.possiblyBilled, err.status, err.code]).toEqual([
        kind,
        retryable,
        billed,
        status,
        code,
      ]);
      expect(stub.messages()).toHaveLength(1); // the SDK never retries (maxRetries: 0)
      clean(err);
    });
  }
});

describe("connections, lookups, and time", () => {
  it("a refused connection is unavailable, not billed, ECONNREFUSED", async () => {
    stub.next({ refuse: true });
    const err = await fails(adapter());
    expect([err.kind, err.retryable, err.possiblyBilled, err.code]).toEqual([
      "unavailable",
      true,
      false,
      "ECONNREFUSED",
    ]);
    clean(err);
  });

  for (const code of ["ENOTFOUND", "ETIMEOUT", "ESERVFAIL"]) {
    it(`a lookup failing with ${code} is unavailable, not billed`, async () => {
      const lookup: LookupFunction = (_host, _options, callback) => {
        const e: NodeJS.ErrnoException = new Error("no address");
        e.code = code;
        process.nextTick(() => (callback as (e: NodeJS.ErrnoException) => void)(e));
      };
      const err = await fails(adapter({ origin: `http://anthropic-stub:${stub.port}`, lookup }));
      expect([err.kind, err.possiblyBilled, err.code]).toEqual(["unavailable", false, code]);
      clean(err);
    });
  }

  it("the connect watchdog is unavailable, not billed, ETIMEDOUT", async () => {
    const err = await fails(
      adapter({
        origin: `http://anthropic-stub:${stub.port}`,
        lookup: () => {},
        settings: { timeouts: { connect_ms: 150, request_ms: 2_000 } },
      }),
    );
    expect([err.kind, err.possiblyBilled, err.code]).toEqual(["unavailable", false, "ETIMEDOUT"]);
    clean(err);
  });

  it("a connection lost after the body was written is timeout, possibly billed", async () => {
    stub.next({ resetAfterBody: true });
    const err = await fails(adapter());
    expect([err.kind, err.retryable, err.possiblyBilled]).toEqual(["timeout", true, true]);
    clean(err);
  });

  it("the request timeout is timeout, possibly billed, and settles by it", async () => {
    stub.next({ hang: true });
    const started = performance.now();
    const err = await fails(adapter({ settings: { timeouts: { connect_ms: 1_000, request_ms: 1_000 } } }));
    expect([err.kind, err.possiblyBilled]).toEqual(["timeout", true]);
    expect(performance.now() - started).toBeLessThan(1_000 + 2_000);
    clean(err);
  });

  it("the deadline is timeout, and a deadline already past makes no request", async () => {
    stub.next({ hang: true });
    const started = performance.now();
    const err = await fails(adapter(), request({ deadline: Date.now() + 200 }));
    expect(err.kind).toBe("timeout");
    expect(performance.now() - started).toBeLessThan(200 + 2_000);
    stub.reset();
    const past = await fails(adapter(), request({ deadline: Date.now() - 1 }));
    expect(past.kind).toBe("timeout");
    expect(stub.messages()).toEqual([]);
  });

  it("an aborted signal is timeout, and makes no request", async () => {
    const err = await fails(adapter(), request({ signal: AbortSignal.abort() }));
    expect(err.kind).toBe("timeout");
    expect(stub.messages()).toEqual([]);
  });
});

describe("a 200 the adapter can't use is provider_error (§2.4)", () => {
  const bodies: [string, Record<string, unknown> | "text"][] = [
    ["no usage", { id: "msg_1", type: "message", content: [{ type: "text", text: "x" }], stop_reason: "end_turn" }],
    [
      "no content list",
      { id: "msg_2", type: "message", stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } },
    ],
    [
      "a negative count",
      {
        id: "msg_3",
        type: "message",
        content: [{ type: "text", text: "x" }],
        stop_reason: "end_turn",
        usage: { input_tokens: -1, output_tokens: 1 },
      },
    ],
  ];
  for (const [name, body] of bodies) {
    it(name, async () => {
      stub.next(body === "text" ? { malformed: true } : { message: body });
      const err = await fails(adapter());
      expect([err.kind, err.retryable, err.possiblyBilled, err.status]).toEqual(["provider_error", true, false, 200]);
      clean(err);
    });
  }

  it("a body that isn't JSON", async () => {
    stub.next({ status: 200, body: `not json ${stub.canary}` });
    const err = await fails(adapter());
    expect([err.kind, err.possiblyBilled]).toEqual(["provider_error", false]);
    clean(err);
  });
});
