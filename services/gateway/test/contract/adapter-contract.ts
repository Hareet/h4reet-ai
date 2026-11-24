// The adapter contract suite (FR-024, SC-006; contracts/provider-adapter.md §5): every adapter passes the same
// assertions, C1–C12 of §5.2, and every case runs through the gateway's real attempt wrapper (§6) with an in-memory
// span exporter and a captured logger, so the assertions see exactly what production emits.
//
// - Stub mode runs every assertion against a stub of the adapter's API: the local adapter against an in-process
//   OpenAI-compatible server on the sandbox's own loopback (test/helpers/stub-openai.ts), with the timeouts scaled
//   down to CONTRACT_TIMEOUTS (§5.3).
// - Live mode replays what `operator.py contract-record` recorded against a stack (§5.3), and runs the assertions a
//   real provider can be held to: C1, C2, C3, C6, C7, and C8.
// - An adapter with no API to stub, the synthetic one, runs directly: its subject has no stub, and the assertions
//   that need a stubbed answer run their direct variants, on the one failure such an adapter has, a request whose
//   signal aborted or whose deadline passed (provider-adapter.md §5.3; tasks.md T073).
//
// The canonical span keys below are telemetry.md §3.3's, written out here rather than imported, so the suite checks
// the gateway against the contract and not against itself.
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { tracing } from "@opentelemetry/sdk-node";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { costMicro, PriceTable, type PriceEntry, type PriceVersion } from "../../src/config/validate.js";
import { attemptCall, type AttemptContext, type AttemptOutcome } from "../../src/core/gateway.js";
import {
  ProviderError,
  type ChatMessage,
  type CompletionRequest,
  type HealthStatus,
  type ProviderAdapter,
  type ProviderErrorKind,
  type Usage,
} from "../../src/core/types.js";
import { createLogger, type Logger } from "../../src/telemetry/log.js";

// ---------------------------------------------------------------------------------------------------------------
// The signature (§5.1)
// ---------------------------------------------------------------------------------------------------------------

export type ContractMode = "stub" | "live";

export type StubBehavior =
  | { ok: { text: string; inputTokens: number; outputTokens: number; finish: "stop" | "length" | "content_filter" } }
  | { delayMs: number } // longer than the request timeout
  | { refuse: true } // the connection is refused
  | { status: number; body?: string } // an HTTP status, or the SDK exception mapped from it
  | { throttleOnce: true } // throttled once, then ok
  | { malformed: true }; // a 200 whose body the adapter can't use

export interface StubRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface StubControl {
  /** The answer to the next completion request. */
  next(behavior: StubBehavior): void;
  /** The answer to the next health probe, for an adapter whose probe reaches the stubbed API (the local adapter's). */
  nextHealth?(behavior: StubBehavior): void;
  requests(): ReadonlyArray<StubRequest>;
  /** A marker the stub plants in every request echo and error body. */
  canary: string;
  reset(): void;
}

/** What `operator.py contract-record` writes (§5.3, §5.4): the status reads around the run, and every case. */
export interface LiveRecording {
  adapter: string;
  statusBefore: unknown; // GET /admin/status
  statusAfter: unknown;
  cases: ReadonlyArray<{
    name: string;
    request: { messages: ChatMessage[]; max_output_tokens: number; temperature?: number };
    status: number;
    body: unknown; // the 200 or 502 body of POST /admin/adapters/{id}/complete (operator-admin.md §5)
  }>;
}

export interface ContractSubject {
  adapter: ProviderAdapter;
  prices: PriceTable; // the price version the cost assertions use
  stub?: StubControl; // stub mode, for an adapter with an API to stub
  recording?: LiveRecording; // live mode only
  /** Stub mode without a stub: the adapter runs directly, and this counts its complete() calls (C3, C5). */
  calls?: () => number;
}

/** What the suite hands makeAdapter: the logger the subject gives its adapter, which the suite captures (C6). */
export interface ContractHarness {
  logger: Logger;
}

/** §5.3: in the sandbox, timeouts are scaled down through the settings. */
// The request timeout is 3 s, not the first sketch's 300 ms (tasks.md T157): C10 needs it beyond its deadline plus
// C10_WITHIN_MS, so that only the abort or the deadline can end its calls inside that bound. The stub's slow answer,
// 5 s, stays beyond the request timeout, so "a timeout" still times out.
export const CONTRACT_TIMEOUTS = { connectMs: 100, requestMs: 3_000 } as const;

/**
 * C10's bound past the abort or the deadline (tasks.md T157): the contract's 100 ms, plus 2 s for a loaded host. One
 * run's stalled event loop ended a call 1,093 ms past its deadline, though the deadline was what ended it. The request
 * timeout and the stub's answer both come later, so the bound still proves the abort or the deadline ended the call.
 */
const C10_WITHIN_MS = 100 + 2_000;
/** The stub's slow answer: longer than the request timeout, so the timeout, the abort, or the deadline ends the call. */
const SLOW_MS = 5_000;
// Every duration below is timed on the monotonic clock, performance.now(): WSL's wall clock steps back, and Date.now()
// gave the gateway's timed cases negative durations. A request's deadline stays epoch milliseconds, as §2.1 has it.

// telemetry.md §3.3: the client span's canonical keys.
const ALWAYS_KEYS = [
  "gen_ai.operation.name",
  "gen_ai.provider.name",
  "gen_ai.request.model",
  "gen_ai.request.max_tokens",
  "server.address",
  "h4.cost.usd",
  "h4.cost.basis",
  "h4.price.version",
  "h4.route.decision",
  "h4.route.reason",
  "h4.meter.attribution",
  "h4.stack",
  "h4.routing.sha",
  "h4.payload.sampled",
  "langfuse.observation.type",
];
const SUCCESS_KEYS = [
  "gen_ai.response.model",
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.output_tokens",
  "gen_ai.response.finish_reasons",
];
const FINISH_REASONS = ["stop", "length", "content_filter", "error", "other"];
const HEALTH_REASONS = ["not_ready", "unreachable", "timeout", "credentials", "circuit_open", "disabled"];
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

// Markers the cases send. None may leave the call except in the provider's own request.
const REQUEST_ID = "c0de0c0de0c0de0c0de0c0de0c0de0c0";
const SYSTEM = "contract-system-9b2c: answer in one word.";
const PROMPT = "contract-prompt-7f3a: name a colour.";

/** The canonical success key set for this adapter and this result. */
function successKeys(adapter: ProviderAdapter, responseId: string | undefined): string[] {
  return [
    ...ALWAYS_KEYS,
    ...SUCCESS_KEYS,
    ...(adapter.server.port === undefined ? [] : ["server.port"]),
    ...(responseId === undefined ? [] : ["gen_ai.response.id"]),
  ].sort();
}

function failureKeys(adapter: ProviderAdapter): string[] {
  return [...ALWAYS_KEYS, "error.type", ...(adapter.server.port === undefined ? [] : ["server.port"])].sort();
}

const isNonNegativeInteger = (n: unknown): boolean => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

function usageNumbers(usage: Usage): unknown[] {
  return [usage.inputTokens, usage.outputTokens, usage.cacheReadInputTokens ?? 0, usage.cacheWriteInputTokens ?? 0];
}

/** HealthStatus exactly (§2.4): a reason when unhealthy, and no other keys. */
function expectHealthShape(status: HealthStatus): void {
  expect(typeof status.healthy).toBe("boolean");
  expect(status.checkedAt).toMatch(RFC3339);
  expect(Number.isNaN(Date.parse(status.checkedAt))).toBe(false);
  if (status.healthy) expect(status.reason).toBeUndefined();
  else expect(HEALTH_REASONS).toContain(status.reason);
  if (status.latencyMs !== undefined) expect(status.latencyMs).toBeGreaterThanOrEqual(0);
  if (status.credentialsExpireAt !== undefined) expect(status.credentialsExpireAt).toMatch(RFC3339);
  for (const key of Object.keys(status)) {
    expect(["healthy", "checkedAt", "reason", "latencyMs", "credentialsExpireAt"]).toContain(key);
  }
}

const ceilDiv = (n: bigint, d: bigint): bigint => (n + d - 1n) / d;

/** cost = ceil((in × P_in + out × P_out + cache × P_cache) / 10⁶), computed here independently (config-files.md §2.3). */
function expectedCost(entry: PriceEntry, usage: Usage): bigint {
  return ceilDiv(
    BigInt(usage.inputTokens) * entry.input +
      BigInt(usage.outputTokens) * entry.output +
      BigInt(usage.cacheReadInputTokens ?? 0) * entry.cacheReadInput,
    1_000_000n,
  );
}

/** The system text the provider received: the OpenAI `system` role, the Converse `system` block, or the Messages API's
 *  `system` string (spec 010). */
function systemSent(body: unknown): string | undefined {
  const b = body as { messages?: { role?: unknown; content?: unknown }[]; system?: unknown };
  if (typeof b?.system === "string") return b.system;
  if (Array.isArray(b?.system)) return (b.system as { text?: unknown }[]).map((s) => String(s.text ?? "")).join("");
  const first = Array.isArray(b?.messages) ? b.messages[0] : undefined;
  return first?.role === "system" && typeof first.content === "string" ? first.content : undefined;
}

/** The non-system turns the provider received, in order, as role and text. */
function turnsSent(body: unknown): { role: string; text: string }[] {
  const b = body as { messages?: { role?: unknown; content?: unknown }[] };
  if (!Array.isArray(b?.messages)) return [];
  return b.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: String(m.role),
      text: Array.isArray(m.content)
        ? (m.content as { text?: unknown }[]).map((c) => String(c.text ?? "")).join("")
        : String(m.content),
    }));
}

/** Every value under a key that names the output cap (max_tokens, maxTokens), at any depth. */
function outputCapsSent(value: unknown): unknown[] {
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => [...(/^max_?tokens$/i.test(k) ? [v] : []), ...outputCapsSent(v)]);
}

function keysAnywhere(value: unknown): string[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(keysAnywhere);
  return Object.entries(value).flatMap(([k, v]) => [k, ...keysAnywhere(v)]);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The behaviors that fail, each with the kind and flags §2.5 maps it to. */
function errorCases(adapter: ProviderAdapter): {
  name: string;
  behavior: StubBehavior;
  kind: ProviderErrorKind;
  retryable: boolean;
  possiblyBilled: boolean;
}[] {
  const paid = adapter.kind === "paid";
  return [
    { name: "a timeout", behavior: { delayMs: SLOW_MS }, kind: "timeout", retryable: true, possiblyBilled: paid },
    {
      name: "a refused connection",
      behavior: { refuse: true },
      kind: "unavailable",
      retryable: true,
      possiblyBilled: false,
    },
    { name: "401", behavior: { status: 401 }, kind: "auth", retryable: false, possiblyBilled: false },
    { name: "403", behavior: { status: 403 }, kind: "auth", retryable: false, possiblyBilled: false },
    { name: "429", behavior: { status: 429 }, kind: "rate_limited", retryable: true, possiblyBilled: false },
    { name: "400", behavior: { status: 400 }, kind: "bad_request", retryable: false, possiblyBilled: false },
    { name: "503", behavior: { status: 503 }, kind: "unavailable", retryable: true, possiblyBilled: false },
    { name: "500", behavior: { status: 500 }, kind: "provider_error", retryable: true, possiblyBilled: false },
    {
      name: "a malformed 200",
      behavior: { malformed: true },
      kind: "provider_error",
      retryable: true,
      possiblyBilled: false,
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------------------------------------------

export function describeAdapterContract(
  name: string,
  makeAdapter: (harness: ContractHarness) => Promise<ContractSubject>,
  mode: ContractMode,
): void {
  describe(`the adapter contract: ${name} (${mode})`, () => {
    const lines: string[] = [];
    const logger = createLogger({ stack: "dev", destination: { write: (s: string) => void lines.push(s) } });
    const exporter = new tracing.InMemorySpanExporter();
    const provider = new tracing.BasicTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(exporter)] });
    const tracer = provider.getTracer("adapter-contract");
    let subject: ContractSubject;

    beforeAll(async () => {
      subject = await makeAdapter({ logger });
    });
    afterAll(async () => {
      await subject?.adapter.close?.();
      await provider.shutdown();
    });
    beforeEach(() => {
      exporter.reset();
      lines.length = 0;
      subject.stub?.reset();
    });

    const clientSpans = () => exporter.getFinishedSpans().filter((s) => s.kind === SpanKind.CLIENT);

    /** The active price version, fixed for the case (C7). */
    const version = (): PriceVersion => {
      const v = subject.prices.active(Date.now());
      if (v === undefined) throw new Error("the subject's price table has no active version");
      return v;
    };
    const entry = (): PriceEntry => {
      const e = PriceTable.lookup(version(), subject.adapter.provider, subject.adapter.model);
      if (e === undefined) throw new Error(`no price for ${subject.adapter.provider}/${subject.adapter.model}`);
      return e;
    };

    /** What production passes the wrapper: local calls are free and unmetered, paid ones a live contract test's. */
    const context = (maxOutputTokens = 16): AttemptContext => {
      const local = subject.adapter.kind === "local";
      return {
        tracer,
        stack: "dev",
        routingSha: "ab".repeat(32),
        priceVersion: version(),
        decision: local ? { kind: "local", reason: "local_healthy" } : { kind: "metered", reason: "test" },
        attribution: local ? "none" : "test",
        maxMicro: local ? 0n : costMicro(entry(), { inputTokens: 2_000, outputTokens: maxOutputTokens }),
        payloadSampling: false,
        requestTimeoutMs: CONTRACT_TIMEOUTS.requestMs,
        realNow: Date.now,
      };
    };

    const request = (
      o: { messages?: ChatMessage[]; maxOutputTokens?: number; temperature?: number; deadline?: number } & {
        signal?: AbortSignal;
      } = {},
    ): CompletionRequest => ({
      requestId: REQUEST_ID,
      purpose: "contract",
      messages: o.messages ?? [
        { role: "system", content: SYSTEM },
        { role: "user", content: PROMPT },
      ],
      maxOutputTokens: o.maxOutputTokens ?? 16,
      ...(o.temperature === undefined ? {} : { temperature: o.temperature }),
      deadline: o.deadline ?? Date.now() + 5_000,
      signal: o.signal ?? new AbortController().signal,
    });

    const call = (req: CompletionRequest = request()): Promise<AttemptOutcome> =>
      attemptCall(subject.adapter, req, context(req.maxOutputTokens));

    if (mode === "live") {
      describeLive(() => subject, version);
      return;
    }

    const stub = (): StubControl => {
      if (subject.stub === undefined) throw new Error("stub mode needs the subject's stub");
      return subject.stub;
    };
    /** No API to stub: the adapter runs directly (the synthetic adapter). */
    const direct = (): boolean => subject.stub === undefined;
    const completions = () =>
      stub()
        .requests()
        .filter((r) => r.method === "POST");
    const completionCount = (): number => (direct() ? (subject.calls?.() ?? 0) : completions().length);
    /** The one failure a direct adapter has: a request already aborted, or already past its deadline. */
    const directFailures = (): { name: string; req: CompletionRequest }[] => [
      { name: "an aborted signal", req: request({ signal: AbortSignal.abort() }) },
      { name: "a deadline that has passed", req: request({ deadline: Date.now() - 1 }) },
    ];
    /** A failing behavior, queued once per attempt the adapter's retry policy allows. */
    const failNext = (behavior: StubBehavior): void => {
      const attempts = "status" in behavior ? 1 + subject.adapter.retry.max : 1;
      for (let i = 0; i < attempts; i++) stub().next(behavior);
    };

    it("C1: answers with a normalized result", async () => {
      if (!direct()) stub().next({ ok: { text: "Blue.", inputTokens: 31, outputTokens: 2, finish: "stop" } });
      const out = await call();
      if (!out.ok) throw out.error;
      const r = out.result;
      expect(typeof r.text).toBe("string");
      for (const n of usageNumbers(r.usage)) expect(isNonNegativeInteger(n), String(n)).toBe(true);
      expect(FINISH_REASONS).toContain(r.finishReason);
      expect(r.responseModel).not.toBe("");
      expect(isNonNegativeInteger(r.latencyMs)).toBe(true);
      if (subject.adapter.fixedUsage === undefined) {
        expect(r.usage).toMatchObject({ inputTokens: 31, outputTokens: 2 });
        expect(r.text).toBe("Blue.");
        expect(r.finishReason).toBe("stop");
      }
    });

    it("C2: respects maxOutputTokens, and a long answer cut at 8 tokens ends with length", async () => {
      const req = request({
        messages: [{ role: "user", content: "Count from one to one hundred in words." }],
        maxOutputTokens: 8,
      });
      if (subject.adapter.fixedUsage !== undefined) {
        const out = await call(req);
        if (!out.ok) throw out.error;
        expect(out.result.usage).toEqual(subject.adapter.fixedUsage);
        return;
      }
      stub().next({ ok: { text: "One, two, three, four", inputTokens: 40, outputTokens: 120, finish: "stop" } });
      const out = await call(req);
      if (!out.ok) throw out.error;
      expect(out.result.usage.outputTokens).toBeLessThanOrEqual(8);
      expect(out.result.finishReason).toBe("length");
    });

    it("C3: health() resolves within its signal, with the HealthStatus shape, and never spends", async () => {
      const before = completionCount();
      const started = performance.now();
      const status = await subject.adapter.health(AbortSignal.timeout(2_000));
      expect(performance.now() - started).toBeLessThan(2_500);
      expectHealthShape(status);
      expect(status.healthy).toBe(true);

      const control = subject.stub;
      if (control?.nextHealth !== undefined) {
        control.nextHealth({ status: 503 });
        const loading = await subject.adapter.health(AbortSignal.timeout(2_000));
        expectHealthShape(loading);
        expect([loading.healthy, loading.reason]).toEqual([false, "not_ready"]);

        control.nextHealth({ status: 500 });
        const failing = await subject.adapter.health(AbortSignal.timeout(2_000));
        expect([failing.healthy, failing.reason]).toEqual([false, "unreachable"]);

        control.nextHealth({ refuse: true });
        const refused = await subject.adapter.health(AbortSignal.timeout(2_000));
        expectHealthShape(refused);
        expect([refused.healthy, refused.reason]).toEqual([false, "unreachable"]);

        control.nextHealth({ delayMs: 3_000 });
        const slowStarted = performance.now();
        const slow = await subject.adapter.health(AbortSignal.timeout(150));
        // Well under the stub's 3 s, so the signal ended it, with room for a loaded host (round 3's review).
        expect(performance.now() - slowStarted).toBeLessThan(150 + 1_000);
        expectHealthShape(slow);
        expect([slow.healthy, slow.reason]).toEqual([false, "timeout"]);
      }

      // An aborted signal still resolves: health() never rejects.
      const aborted = await subject.adapter.health(AbortSignal.abort());
      expectHealthShape(aborted);
      expect(aborted.healthy).toBe(false);
      expect(completionCount()).toBe(before);
    });

    describe("C4: maps every failure to one ProviderError kind, with §2.5's flags", () => {
      // The cases need the subject, so they are listed with a placeholder adapter's kind and read lazily.
      for (const c of errorCases({ kind: "local" } as ProviderAdapter)) {
        it(`${c.name} is ${c.kind}`, async (ctx) => {
          if (direct()) return ctx.skip(); // no API to fail: the direct variant below
          const want = errorCases(subject.adapter).find((x) => x.name === c.name) ?? c;
          failNext(want.behavior);
          const out = await call();
          expect(out.ok).toBe(false);
          if (out.ok) return;
          expect(out.error).toBeInstanceOf(ProviderError);
          expect([out.error.kind, out.error.retryable, out.error.possiblyBilled]).toEqual([
            want.kind,
            want.retryable,
            want.possiblyBilled,
          ]);
        });
      }
      it("(direct) a request whose signal aborted, or whose deadline passed, is timeout, billed as §2.5 says", async (ctx) => {
        if (!direct()) return ctx.skip();
        for (const f of directFailures()) {
          const out = await call(f.req);
          expect(out.ok, f.name).toBe(false);
          if (out.ok) continue;
          expect(out.error, f.name).toBeInstanceOf(ProviderError);
          expect([out.error.kind, out.error.retryable, out.error.possiblyBilled], f.name).toEqual([
            "timeout",
            true,
            subject.adapter.kind === "paid",
          ]);
        }
      });
    });

    it("C5: follows its retry policy, one client span per attempt", async () => {
      const policy = subject.adapter.retry;
      if (direct()) {
        // Nothing to throttle it: with max 0, a call is exactly one attempt and one span.
        expect(policy.max).toBe(0);
        const before = completionCount();
        const out = await call();
        expect(out.ok).toBe(true);
        expect(out.attempts).toHaveLength(1);
        expect(completionCount() - before).toBe(1);
        expect(clientSpans()).toHaveLength(1);
        return;
      }
      if (policy.max === 0) {
        stub().next({ throttleOnce: true });
        const out = await call();
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.error.kind).toBe("rate_limited");
        expect(completions()).toHaveLength(1);
        expect(clientSpans()).toHaveLength(1);
        return;
      }
      expect(policy.on).toContain("rate_limited");
      stub().next({ throttleOnce: true });
      const retried = await call(request({ deadline: Date.now() + 5_000 }));
      expect(retried.ok).toBe(true);
      expect(retried.attempts).toHaveLength(2);
      expect(clientSpans()).toHaveLength(2);

      exporter.reset();
      stub().reset();
      stub().next({ throttleOnce: true });
      const short = await call(request({ deadline: Date.now() + policy.backoffMs + 50 }));
      expect(short.ok).toBe(false);
      if (!short.ok) expect(short.error.kind).toBe("rate_limited");
      expect(clientSpans()).toHaveLength(1);
    });

    it("C6: carries no payload in an error, its message, its code, a log record, or a span", async () => {
      const cases = direct()
        ? directFailures().map((f) => ({ name: f.name, run: () => call(f.req) }))
        : errorCases(subject.adapter).map((c) => ({
            name: c.name,
            run: () => {
              stub().reset();
              failNext(c.behavior);
              return call();
            },
          }));
      const canary = (): string => subject.stub?.canary ?? "canary-no-stub-9d41";
      for (const c of cases) {
        lines.length = 0;
        exporter.reset();
        const out = await c.run();
        expect(out.ok, c.name).toBe(false);
        if (out.ok) continue;
        const err = out.error;
        expect(err.message, c.name).toBe(err.kind);
        expect(err.cause, c.name).toBeUndefined();
        const spans = exporter.getFinishedSpans().map((s) => [s.name, s.attributes, s.status, s.events]);
        const texts = [String(err), JSON.stringify(err), String(err.code ?? ""), ...lines, JSON.stringify(spans)];
        for (const text of texts) {
          for (const marker of [PROMPT, SYSTEM, canary()]) expect(text, `${c.name}: ${marker}`).not.toContain(marker);
        }
      }
    });

    it("C7: costs are deterministic integer micro-USD, rounded up once on the sum", async () => {
      const e = entry();
      const usages: Usage[] = [
        { inputTokens: 0, outputTokens: 0 },
        { inputTokens: 71, outputTokens: 14 },
        { inputTokens: 2_000, outputTokens: 128, cacheReadInputTokens: 512 },
        { inputTokens: 1, outputTokens: 1 },
      ];
      for (const usage of usages) {
        expect(costMicro(e, usage)).toBe(expectedCost(e, usage));
        expect(costMicro(e, usage)).toBe(costMicro(e, usage));
      }
      // config-files.md §2.3's worked example: 16,839,474 / 1,000,000 rounds up to 17.
      const illustrative = { ...e, input: 123_456n, output: 654_321n, cacheReadInput: 123_456n, placeholders: [] };
      expect(costMicro(illustrative, { inputTokens: 41, outputTokens: 18 })).toBe(17n);
      // Once the version is fixed, the cost doesn't depend on wall time.
      const fixed = version();
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(fixed.effectiveFrom + 86_400_000);
        expect(costMicro(e, usages[1] as Usage)).toBe(expectedCost(e, usages[1] as Usage));
      } finally {
        vi.useRealTimers();
      }

      if (!direct()) stub().next({ ok: { text: "Green.", inputTokens: 71, outputTokens: 14, finish: "stop" } });
      const out = await call();
      if (!out.ok) throw out.error;
      const span = clientSpans()[0];
      const metered = context().attribution !== "none";
      const micro = metered ? costMicro(e, out.result.usage) : 0n;
      expect(span?.attributes["h4.cost.usd"]).toBe(Number(micro) / 1_000_000);
      expect(span?.attributes["h4.cost.basis"]).toBe(metered ? "usage" : "none");
      expect(span?.attributes["h4.price.version"]).toBe(fixed.id);
    });

    it("C8: makes one CLIENT span per attempt, named chat {model}, with the canonical keys", async () => {
      if (!direct()) stub().next({ ok: { text: "Red.", inputTokens: 20, outputTokens: 2, finish: "stop" } });
      const out = await call();
      if (!out.ok) throw out.error;
      const [span, ...more] = clientSpans();
      expect(more).toEqual([]);
      expect(span?.name).toBe(`chat ${subject.adapter.model}`);
      expect(Object.keys(span?.attributes ?? {}).sort()).toEqual(successKeys(subject.adapter, out.result.responseId));
      expect(span?.attributes).toMatchObject({
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": subject.adapter.provider,
        "gen_ai.request.model": subject.adapter.model,
        "gen_ai.request.max_tokens": 16,
        "server.address": subject.adapter.server.address,
        "gen_ai.response.model": out.result.responseModel,
        "gen_ai.usage.input_tokens": out.result.usage.inputTokens,
        "gen_ai.usage.output_tokens": out.result.usage.outputTokens,
        "gen_ai.response.finish_reasons": [out.result.finishReason],
        "h4.payload.sampled": false,
        "langfuse.observation.type": "generation",
      });
      expect(span?.status.code).not.toBe(SpanStatusCode.ERROR);

      exporter.reset();
      if (!direct()) stub().next({ status: 500 });
      const failed = await call(direct() ? request({ signal: AbortSignal.abort() }) : request());
      expect(failed.ok).toBe(false);
      const [errorSpan] = clientSpans();
      expect(Object.keys(errorSpan?.attributes ?? {}).sort()).toEqual(failureKeys(subject.adapter));
      expect(errorSpan?.status).toEqual({
        code: SpanStatusCode.ERROR,
        message: direct() ? "timeout" : "provider_error",
      });
      if (!failed.ok) expect(errorSpan?.attributes["error.type"]).toBe(failed.error.code ?? failed.error.kind);
    });

    it("C9: sends the system message as the provider's system field, the turns in order, and the cap as given", async () => {
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM },
        { role: "user", content: "first turn" },
        { role: "assistant", content: "second turn" },
        { role: "user", content: PROMPT },
      ];
      const req = request({ messages, maxOutputTokens: 32, temperature: 0 });
      if (direct()) {
        // Nothing is sent anywhere: one call, and an answer that echoes no part of the request.
        const before = completionCount();
        const out = await call(req);
        if (!out.ok) throw out.error;
        expect(completionCount() - before).toBe(1);
        const echoed = JSON.stringify(out.result);
        for (const marker of [SYSTEM, PROMPT, REQUEST_ID, "first turn"]) expect(echoed).not.toContain(marker);
        return;
      }
      stub().next({ ok: { text: "Yes.", inputTokens: 50, outputTokens: 2, finish: "stop" } });
      const out = await call(req);
      if (!out.ok) throw out.error;
      const [sent, ...more] = completions();
      expect(more).toEqual([]);
      expect(systemSent(sent?.body)).toBe(SYSTEM);
      expect(turnsSent(sent?.body)).toEqual(messages.slice(1).map((m) => ({ role: m.role, text: m.content })));
      expect(outputCapsSent(sent?.body)).toEqual([32]);
      expect(keysAnywhere(sent?.body)).not.toContain("user");
      expect(JSON.stringify(sent)).not.toContain(REQUEST_ID);
      if (subject.adapter.kind === "local") expect(Object.keys(sent?.headers ?? {})).not.toContain("authorization");
    });

    it("C10: ends with timeout when the request's signal aborts, or its deadline passes (within 100 ms; 2,100 ms against the stub, T157)", async () => {
      if (direct()) {
        // It answers at once, so the only abort it can meet is one before the call, or a deadline already past. Within
        // 100 ms, and sooner: it ends before the event loop turns once, so nothing was waited on, on a loaded machine
        // as on an idle one (a bound in ms is what load breaks; fix/036).
        for (const f of directFailures()) {
          let turned = false;
          setImmediate(() => {
            turned = true;
          });
          const out = await call(f.req);
          expect(turned, f.name).toBe(false);
          expect(out.ok, f.name).toBe(false);
          if (!out.ok) expect(out.error.kind, f.name).toBe("timeout");
        }
        return;
      }
      stub().next({ delayMs: SLOW_MS });
      const controller = new AbortController();
      // NaN until the abort fires, so a call that ends before it fails the bound below. 0 was the sentinel while this
      // read Date.now(); on performance.now() it would let an early end pass in a worker under 2.1 s old.
      let abortedAt = Number.NaN;
      setTimeout(() => {
        abortedAt = performance.now();
        controller.abort();
      }, 50);
      const aborted = await call(request({ signal: controller.signal, deadline: Date.now() + 10_000 }));
      expect(aborted.ok).toBe(false);
      if (!aborted.ok) expect(aborted.error.kind).toBe("timeout");
      expect(performance.now() - abortedAt).toBeLessThan(C10_WITHIN_MS);

      stub().next({ delayMs: SLOW_MS });
      // Far shorter than the request timeout, even with C10_WITHIN_MS on top, so the deadline is what ends it. The
      // request carries the deadline in epoch milliseconds; the time past it is read from its twin on the monotonic
      // clock, taken first, so the bound is never looser.
      const deadlineMono = performance.now() + 120;
      const deadline = Date.now() + 120;
      const late = await call(request({ deadline }));
      expect(late.ok).toBe(false);
      if (!late.ok) expect(late.error.kind).toBe("timeout");
      expect(performance.now() - deadlineMono).toBeLessThan(C10_WITHIN_MS);
    });

    it("C12: returns a filtered answer as a result, not an error", async (ctx) => {
      if (direct()) return ctx.skip(); // an adapter with nothing to filter never answers content_filter
      stub().next({ ok: { text: "", inputTokens: 12, outputTokens: 0, finish: "content_filter" } });
      const out = await call();
      if (!out.ok) throw out.error;
      expect(out.result.finishReason).toBe("content_filter");
    });

    // Last: it closes the adapter.
    it("C11: settles once, leaves no unhandled rejection, and no timer or socket after close()", async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown): void => void unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      try {
        const behaviors = direct()
          ? [undefined, undefined]
          : ([
              { ok: { text: "Hi.", inputTokens: 5, outputTokens: 2, finish: "stop" } },
              { status: 500 },
              { delayMs: SLOW_MS },
              { refuse: true },
              { malformed: true },
            ] as StubBehavior[]);
        const requests = direct() ? [request(), request({ signal: AbortSignal.abort() })] : [];
        for (const [i, behavior] of behaviors.entries()) {
          if (behavior !== undefined) {
            stub().reset();
            stub().next(behavior);
          }
          let settled = 0;
          const p = subject.adapter.complete(requests[i] ?? request());
          p.then(
            () => void (settled += 1),
            () => void (settled += 1),
          );
          await p.catch(() => undefined);
          await sleep(20);
          expect(settled).toBe(1);
        }
        await sleep(50);
        expect(unhandled).toEqual([]);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
      subject.stub?.reset();
      const kept = () =>
        process.getActiveResourcesInfo().filter((t) => t === "Timeout" || t === "TCPSocketWrap").length;
      const before = kept();
      await subject.adapter.close?.();
      await sleep(50);
      expect(kept()).toBeLessThanOrEqual(before);
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Live mode: the assertions a real provider can be held to, over a recording
// ---------------------------------------------------------------------------------------------------------------

interface RecordedResult {
  adapter?: string;
  result?: {
    text?: unknown;
    usage?: { input_tokens?: unknown; output_tokens?: unknown; cache_read_input_tokens?: unknown };
    finish_reason?: unknown;
    response_model?: unknown;
    response_id?: unknown;
    latency_ms?: unknown;
  };
  cost_micro_usd?: unknown;
  price_version?: unknown;
  span?: { name?: unknown; kind?: unknown; attribute_keys?: unknown };
}

function describeLive(subject: () => ContractSubject, version: () => PriceVersion): void {
  const recording = (): LiveRecording => {
    const r = subject().recording;
    if (r === undefined) throw new Error("live mode needs the subject's recording");
    return r;
  };
  const answered = () => recording().cases.filter((c) => c.status === 200);

  it("C1: every recorded answer is a normalized result", () => {
    expect(answered().length).toBeGreaterThan(0);
    for (const c of answered()) {
      const r = (c.body as RecordedResult).result;
      expect(typeof r?.text, c.name).toBe("string");
      for (const n of [r?.usage?.input_tokens, r?.usage?.output_tokens])
        expect(isNonNegativeInteger(n), c.name).toBe(true);
      expect(FINISH_REASONS, c.name).toContain(r?.finish_reason);
      expect(typeof r?.response_model === "string" && r.response_model !== "", c.name).toBe(true);
      expect(isNonNegativeInteger(r?.latency_ms), c.name).toBe(true);
    }
  });

  it("C2: no answer passed its cap, and the cap-length case ended with length", () => {
    for (const c of answered()) {
      const out = (c.body as RecordedResult).result?.usage?.output_tokens as number;
      expect(out, c.name).toBeLessThanOrEqual(c.request.max_output_tokens);
    }
    const cap = answered().find((c) => c.name === "cap-length");
    if (cap !== undefined) expect((cap.body as RecordedResult).result?.finish_reason).toBe("length");
  });

  it("C3: the recorded status reads show the adapter's health in the HealthStatus shape", () => {
    for (const status of [recording().statusBefore, recording().statusAfter]) {
      const entries = (status as { adapters?: { id?: unknown }[] } | undefined)?.adapters ?? [];
      const mine = entries.find((a) => a.id === recording().adapter) as
        { healthy?: unknown; reason?: unknown; checked_at?: unknown } | undefined;
      expect(mine).toBeDefined();
      expect(typeof mine?.healthy).toBe("boolean");
      expect(String(mine?.checked_at)).toMatch(RFC3339);
      if (mine?.healthy === true) expect(mine.reason).toBeNull();
      else expect(HEALTH_REASONS).toContain(mine?.reason);
    }
  });

  it("C6: no recorded error body carries a prompt", () => {
    for (const c of recording().cases.filter((x) => x.status !== 200)) {
      const text = JSON.stringify(c.body);
      for (const m of c.request.messages) {
        if (m.content.length >= 8) expect(text, c.name).not.toContain(m.content);
      }
    }
  });

  it("C7: every recorded cost is the cost of its usage at its price version", () => {
    for (const c of answered()) {
      const body = c.body as RecordedResult;
      const v = subject().prices.versions.find((x) => x.id === body.price_version) ?? version();
      const e = PriceTable.lookup(v, subject().adapter.provider, subject().adapter.model);
      expect(e, c.name).toBeDefined();
      if (e === undefined) continue;
      const usage: Usage = {
        inputTokens: body.result?.usage?.input_tokens as number,
        outputTokens: body.result?.usage?.output_tokens as number,
        cacheReadInputTokens: (body.result?.usage?.cache_read_input_tokens as number | undefined) ?? 0,
      };
      const recorded = body.cost_micro_usd;
      const cost = subject().adapter.kind === "local" ? 0n : costMicro(e, usage);
      expect(BigInt(String(recorded)), c.name).toBe(cost);
    }
  });

  it("C8: every recorded client span has the canonical success keys", () => {
    for (const c of answered()) {
      const body = c.body as RecordedResult;
      expect(body.span?.kind, c.name).toBe("client");
      expect(body.span?.name, c.name).toBe(`chat ${subject().adapter.model}`);
      const keys = [...((body.span?.attribute_keys as string[] | undefined) ?? [])].sort();
      const responseId = typeof body.result?.response_id === "string" ? body.result.response_id : undefined;
      expect(keys, c.name).toEqual(successKeys(subject().adapter, responseId));
    }
  });
}
