// The gateway core (contracts/provider-adapter.md §6; gateway-http.md §2.4; data-model.md §7).
//
// The attempt wrapper, attemptCall, is what happens around every adapter call, the same way for every adapter, so a
// span's shape can't differ between them (US5-4):
// - one CLIENT span per attempt, `chat {gen_ai.request.model}`, with telemetry.md §3.3's attributes;
// - payloads on it only when TELEMETRY_PAYLOAD_SAMPLING is on (dev only), after secret redaction (FR-029);
// - the adapter's retry policy: another attempt, with its own span, only for a kind in `retry.on`, at most
//   `retry.max` times, and only if the backoff plus the adapter's request timeout fits before the deadline;
// - each attempt's cost and cost basis, from the active price version (data-model.md §7.3, §7.4).
import { context, SpanKind, SpanStatusCode, trace, type Attributes, type Tracer } from "@opentelemetry/api";

import { costMicro, PriceTable, type PriceVersion } from "../config/validate.js";
import type { GatewayMetrics } from "../telemetry/metrics.js";
import { redactSecrets } from "../telemetry/redact.js";
import {
  ProviderError,
  type AdapterResult,
  type Attribution,
  type ChatMessage,
  type CompletionRequest,
  type ProviderAdapter,
} from "./types.js";

// ---------------------------------------------------------------------------------------------------------------
// The attempt wrapper (provider-adapter.md §6)
// ---------------------------------------------------------------------------------------------------------------

/** How an attempt's cost was found (data-model.md §2.5). The ledger's fourth basis, `expired`, is the sweep's. */
export type CostBasis = "usage" | "reservation" | "none";

export interface AttemptContext {
  tracer: Tracer;
  /** H4_STACK. */
  stack: string;
  /** SHA-256 of config/routing.yaml. */
  routingSha: string;
  /** The active price version, fixed for the whole call. */
  priceVersion: PriceVersion;
  /** h4.route.decision and h4.route.reason on the client span. */
  decision: { kind: "local" | "fallback" | "metered"; reason: string };
  attribution: Attribution;
  /** The reserved maximum: what a metered attempt that failed possiblyBilled is charged (data-model.md §7.3). */
  maxMicro?: bigint;
  /** TELEMETRY_PAYLOAD_SAMPLING=on, which only H4_ENV=dev allows. */
  payloadSampling: boolean;
  /** The adapter's request timeout, from routing.yaml: a retry needs its backoff plus this before the deadline. */
  requestTimeoutMs: number;
  realNow?: () => number;
  metrics?: GatewayMetrics;
  /** Called on each failed attempt: health tracking counts unavailable and timeout as a failed probe (§6). */
  onFailure?: (err: ProviderError) => void;
}

interface AttemptBase {
  costMicro: bigint;
  costBasis: CostBasis;
  /** Real clock, epoch ms. */
  startedAt: number;
  endedAt: number;
}
export type AttemptRecord =
  (AttemptBase & { outcome: "ok"; result: AdapterResult }) | (AttemptBase & { outcome: "error"; error: ProviderError });

export type AttemptOutcome =
  | { ok: true; result: AdapterResult; attempts: AttemptRecord[] }
  | { ok: false; error: ProviderError; attempts: AttemptRecord[] };

const usd = (micro: bigint): number => Number(micro) / 1_000_000;

/** The semantic conventions' message format, for a sampled span (telemetry.md §3.4). */
function inputMessages(messages: readonly ChatMessage[]): string {
  return JSON.stringify(messages.map((m) => ({ role: m.role, parts: [{ type: "text", content: m.content }] })));
}
function outputMessages(result: AdapterResult): string {
  return JSON.stringify([
    { role: "assistant", parts: [{ type: "text", content: result.text }], finish_reason: result.finishReason },
  ]);
}

/** An attempt's cost: free when unmetered; its usage when answered; its reservation when possibly billed. */
function costOf(
  adapter: ProviderAdapter,
  ctx: AttemptContext,
  outcome: { result: AdapterResult } | { error: ProviderError },
): { micro: bigint; basis: CostBasis } {
  if (ctx.attribution === "none") return { micro: 0n, basis: "none" };
  if ("result" in outcome) {
    const entry = PriceTable.lookup(ctx.priceVersion, adapter.provider, adapter.model);
    if (entry === undefined) throw new Error(`no price for ${adapter.provider}/${adapter.model}`);
    return { micro: costMicro(entry, outcome.result.usage), basis: "usage" };
  }
  if (outcome.error.possiblyBilled) return { micro: ctx.maxMicro ?? 0n, basis: "reservation" };
  return { micro: 0n, basis: "none" };
}

async function oneAttempt(
  adapter: ProviderAdapter,
  req: CompletionRequest,
  ctx: AttemptContext,
): Promise<AttemptRecord> {
  const now = ctx.realNow ?? Date.now;
  const always: Attributes = {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": adapter.provider,
    "gen_ai.request.model": adapter.model,
    "gen_ai.request.max_tokens": req.maxOutputTokens,
    "server.address": adapter.server.address,
    "h4.cost.usd": 0,
    "h4.cost.basis": "none",
    "h4.price.version": ctx.priceVersion.id,
    "h4.route.decision": ctx.decision.kind,
    "h4.route.reason": ctx.decision.reason,
    "h4.meter.attribution": ctx.attribution,
    "h4.stack": ctx.stack,
    "h4.routing.sha": ctx.routingSha,
    "h4.payload.sampled": ctx.payloadSampling,
    "langfuse.observation.type": "generation",
  };
  if (adapter.server.port !== undefined) always["server.port"] = adapter.server.port;
  if (ctx.payloadSampling) always["gen_ai.input.messages"] = redactSecrets(inputMessages(req.messages));

  const parent = context.active();
  const span = ctx.tracer.startSpan(`chat ${adapter.model}`, { kind: SpanKind.CLIENT, attributes: always }, parent);
  const startedAt = now();
  const metricBase = { provider: adapter.provider, requestModel: adapter.model, server: adapter.server.address };
  try {
    const result = await context.with(trace.setSpan(parent, span), () => adapter.complete(req));
    const endedAt = now();
    const cost = costOf(adapter, ctx, { result });
    span.setAttributes({
      "gen_ai.response.model": result.responseModel,
      "gen_ai.usage.input_tokens": result.usage.inputTokens,
      "gen_ai.usage.output_tokens": result.usage.outputTokens,
      "gen_ai.response.finish_reasons": [result.finishReason],
      ...(result.responseId === undefined ? {} : { "gen_ai.response.id": result.responseId }),
      "h4.cost.usd": usd(cost.micro),
      "h4.cost.basis": cost.basis,
    });
    if (ctx.payloadSampling) span.setAttribute("gen_ai.output.messages", redactSecrets(outputMessages(result)));
    span.end();
    const seconds = (endedAt - startedAt) / 1_000;
    ctx.metrics?.operationDuration(seconds, { ...metricBase, responseModel: result.responseModel });
    for (const tokenType of ["input", "output"] as const) {
      const tokens = tokenType === "input" ? result.usage.inputTokens : result.usage.outputTokens;
      ctx.metrics?.tokenUsage(tokens, { ...metricBase, responseModel: result.responseModel, tokenType });
    }
    return { outcome: "ok", result, costMicro: cost.micro, costBasis: cost.basis, startedAt, endedAt };
  } catch (thrown) {
    // An adapter rejects only with a ProviderError; anything else is a bug, and becomes one with nothing of it kept.
    const error = thrown instanceof ProviderError ? thrown : new ProviderError("provider_error", true, false);
    const endedAt = now();
    const cost = costOf(adapter, ctx, { error });
    const errorType = error.code ?? error.kind;
    span.setAttributes({ "error.type": errorType, "h4.cost.usd": usd(cost.micro), "h4.cost.basis": cost.basis });
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.kind });
    span.end();
    ctx.metrics?.operationDuration((endedAt - startedAt) / 1_000, { ...metricBase, errorType });
    ctx.onFailure?.(error);
    return { outcome: "error", error, costMicro: cost.micro, costBasis: cost.basis, startedAt, endedAt };
  }
}

/** Waits `ms`, or less if the signal aborts first. */
function backoff(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/** One call to one adapter: its attempts under its retry policy, each with its own client span. */
export async function attemptCall(
  adapter: ProviderAdapter,
  req: CompletionRequest,
  ctx: AttemptContext,
): Promise<AttemptOutcome> {
  const now = ctx.realNow ?? Date.now;
  const attempts: AttemptRecord[] = [];
  for (;;) {
    const record = await oneAttempt(adapter, req, ctx);
    attempts.push(record);
    if (record.outcome === "ok") return { ok: true, result: record.result, attempts };
    const { error } = record;
    const policy = adapter.retry;
    const again =
      attempts.length <= policy.max &&
      policy.on.includes(error.kind) &&
      !req.signal.aborted &&
      now() + policy.backoffMs + ctx.requestTimeoutMs <= req.deadline;
    if (!again) return { ok: false, error, attempts };
    await backoff(policy.backoffMs, req.signal);
    if (req.signal.aborted) return { ok: false, error, attempts };
  }
}
