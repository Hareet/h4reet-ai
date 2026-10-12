// The gateway core (contracts/provider-adapter.md §6; gateway-http.md §2.4; data-model.md §7).
//
// The attempt wrapper, attemptCall, is what happens around every adapter call, the same way for every adapter, so a
// span's shape can't differ between them (US5-4):
// - one CLIENT span per attempt, `chat {gen_ai.request.model}`, with telemetry.md §3.3's attributes;
// - payloads on it only when TELEMETRY_PAYLOAD_SAMPLING is on (dev only), after secret redaction (FR-029);
// - the adapter's retry policy: another attempt, with its own span, only for a kind in `retry.on`, at most
//   `retry.max` times, and only if the backoff plus the adapter's request timeout fits before the deadline;
// - each attempt's cost and cost basis, from the active price version (data-model.md §7.3, §7.4).
//
// AdapterHealth tracks each routed adapter's effective health from its probe, on the real clock (§6 items 4 and 6).
//
// Gateway.complete decides in FR-022's order (gateway-http.md §2.4): the state read with no cache, then the kill
// switch, then a healthy local adapter, whose calls are free and write their ledger rows without a reservation
// (data-model.md §7.4). A stack without a fallback answers no_fallback_in_stack; the metered fallback branch and its
// admission arrive with tasks.md T072–T074. Gateway.report is GET /health's report, from the same dry run.
import { randomBytes, randomUUID } from "node:crypto";

import {
  context,
  isSpanContextValid,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
  type Tracer,
} from "@opentelemetry/api";

import type { HealthCadence } from "../adapters/_settings.js";
import type { BuiltAdapter } from "../adapters/registry.js";
import {
  costMicro,
  PriceTable,
  thresholds,
  type Budgets,
  type EnvClass,
  type PriceVersion,
  type RoutingConfig,
  type StackName,
} from "../config/validate.js";
import type { MeterRow, StateRead, Store } from "../meter/store.js";
import type { GatewayMetrics, GaugeSnapshot } from "../telemetry/metrics.js";
import { redactSecrets } from "../telemetry/redact.js";
import { gatewayTime, periodKeys, toRfc3339, type GatewayClock } from "./clock.js";
import { degraded, rfc3339Seconds, stateDecision, wouldDegrade, type Degraded } from "./router.js";
import {
  ProviderError,
  type AdapterResult,
  type Attribution,
  type CallPurpose,
  type ChatMessage,
  type CompletionRequest,
  type DegradedCause,
  type HealthReason,
  type HealthStatus,
  type ProviderAdapter,
  type ProviderErrorKind,
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

// ---------------------------------------------------------------------------------------------------------------
// Health tracking (provider-adapter.md §6 items 4 and 6)
// ---------------------------------------------------------------------------------------------------------------

/**
 * One adapter's effective health. It starts unhealthy (`not_ready`). A probe every `intervalMs`, on the real clock:
 * `healthyAfter` passes in a row make it healthy, `unhealthyAfter` failures in a row unhealthy, and a call that fails
 * as `unavailable` or `timeout` makes it unhealthy at once and resets the count. Probes never spend.
 */
export class AdapterHealth {
  private healthy = false;
  private reason: HealthReason | undefined = "not_ready";
  private checkedAt: string;
  private latencyMs: number | undefined;
  private passes = 0;
  private failures = 0;
  /** When the effective health last flipped, real ms; startup counts as turning unhealthy. */
  private changedAt: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    readonly adapter: ProviderAdapter,
    private readonly cadence: HealthCadence,
    private readonly opts: { realNow: () => number; onChange: (health: AdapterHealth) => void },
  ) {
    this.changedAt = opts.realNow();
    this.checkedAt = new Date(this.changedAt).toISOString();
  }

  status(): HealthStatus {
    return {
      healthy: this.healthy,
      checkedAt: this.checkedAt,
      ...(this.reason === undefined ? {} : { reason: this.reason }),
      ...(this.latencyMs === undefined ? {} : { latencyMs: this.latencyMs }),
    };
  }

  /** When it last turned unhealthy (real ms), or undefined while healthy: the `since` of no_fallback_in_stack. */
  unhealthySince(): number | undefined {
    return this.healthy ? undefined : this.changedAt;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
  }

  /** A failed call: `unavailable` and `timeout` count as a failed probe, and mark the adapter unhealthy at once. */
  callFailed(err: ProviderError): void {
    if (err.kind !== "unavailable" && err.kind !== "timeout") return;
    this.passes = 0;
    this.set(false, err.kind === "timeout" ? "timeout" : "unreachable");
  }

  /** One probe now, counted as the loop counts it. */
  async probe(): Promise<void> {
    const status = await this.adapter.health(AbortSignal.timeout(this.cadence.timeoutMs));
    this.checkedAt = status.checkedAt;
    this.latencyMs = status.latencyMs;
    if (status.healthy) {
      this.failures = 0;
      this.passes += 1;
      if (!this.healthy && this.passes >= this.cadence.healthyAfter) this.set(true);
      return;
    }
    this.passes = 0;
    this.failures += 1;
    const reason = status.reason ?? "unreachable";
    if (!this.healthy || this.failures >= this.cadence.unhealthyAfter) this.set(false, reason);
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => void this.loop().catch(() => {}), delayMs);
    this.timer.unref();
  }

  private async loop(): Promise<void> {
    if (!this.running) return;
    const started = this.opts.realNow();
    try {
      await this.probe();
    } catch {
      // health() never rejects (§2.2); a probe that did would leave the state as it was.
    }
    if (this.running) this.schedule(Math.max(0, this.cadence.intervalMs - (this.opts.realNow() - started)));
  }

  private set(healthy: boolean, reason?: HealthReason): void {
    const flipped = healthy !== this.healthy;
    this.healthy = healthy;
    this.reason = healthy ? undefined : reason;
    if (flipped) {
      this.changedAt = this.opts.realNow();
      this.opts.onChange(this);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The gateway
// ---------------------------------------------------------------------------------------------------------------

/** The pino methods the gateway logs with. */
export interface GatewayLogger {
  info(record: object, msg: string): void;
  warn(record: object, msg: string): void;
  error(record: object, msg: string): void;
}

/** One hello-shaped call: what the route has validated, and what the call needs of the request. */
export interface GatewayCall {
  requestId: string;
  purpose: CallPurpose;
  messages: ChatMessage[];
  maxOutputTokens: number;
  /** Real clock, epoch ms: the deadline counts from here (gateway-http.md §2.4). */
  arrivedAt: number;
  /** Aborts when the caller goes away. */
  signal: AbortSignal;
  /** X-H4-Client: the ledger keeps it, and nothing else does (§2.3). */
  clientLabel?: string;
}

export type GatewayAnswer =
  | {
      kind: "answered";
      route: "local";
      routeReason: null;
      provider: string;
      result: AdapterResult;
      costMicro: bigint;
      priceVersion: string;
      traceId: string;
    }
  | { kind: "degraded"; decision: Degraded; traceId: string }
  | { kind: "local_error"; errorKind: ProviderErrorKind; traceId: string };

export type JournalStatus = "ok" | "unwritable" | "unknown";

export interface GatewayOptions {
  stack: StackName;
  envClass: EnvClass;
  /** The package version, for GET /health. */
  version: string;
  routing: RoutingConfig;
  prices: PriceTable;
  budgets: Budgets;
  /** The route's adapters, primary first (registry.ts). */
  adapters: readonly BuiltAdapter[];
  store: Store;
  clock: GatewayClock;
  tracer: Tracer;
  metrics: GatewayMetrics;
  logger: GatewayLogger;
  /** TELEMETRY_PAYLOAD_SAMPLING=on, which only H4_ENV=dev allows. */
  payloadSampling: boolean;
  /** GATEWAY_TEST_CLOCK and GATEWAY_TEST_SYNTHETIC_SPEND, for GET /health. */
  testMachinery: { clock: boolean; synthetic: boolean };
  /** The result of the journal's last append (data-model.md §3); unknown before the first. */
  journalStatus?: () => JournalStatus;
  realNow?: () => number;
  /** How often the gauges are refreshed from the store: 10 s (data-model.md §7.7). */
  gaugeIntervalMs?: number;
}

/** GET /health's report (gateway-http.md §5), in the contract's key order. */
export interface HealthReport {
  status: "ok" | "degraded";
  stack: string;
  env: string;
  version: string;
  time: string;
  real_time: string;
  store: "ok" | "unreachable" | "uninitialized";
  state: "normal" | "degraded" | null;
  since: string | null;
  crossed: string[] | null;
  degraded_cause: DegradedCause | null;
  fallback: { adapter: string | null; awaiting_renewal: boolean | null; awaiting_since: string | null };
  adapters: AdapterReport[];
  journal: JournalStatus;
  config: { routing_sha: string; price_version: string | null };
  test_machinery: { clock: boolean; synthetic: boolean; clock_offset_ms: number | null };
}

export interface AdapterReport {
  id: string;
  role: "primary" | "fallback";
  provider: string;
  kind: string;
  model: string;
  healthy: boolean;
  reason: HealthReason | null;
  checked_at: string;
  credentials_expire_at?: string;
}

interface Routed {
  built: BuiltAdapter;
  health: AdapterHealth;
  requestTimeoutMs: number;
}

const STATE_LOG_EVERY_MS = 60_000;

/** The trace ID the ledger and the body record: the span's, or a fresh one when no tracer records spans. */
function traceIdOf(span: Span): string {
  const ctx = span.spanContext();
  return isSpanContextValid(ctx) ? ctx.traceId : randomBytes(16).toString("hex");
}

const LOCAL_LEDGER_ROW = `INSERT INTO gateway.ledger (id, reservation_id, ts, started_at, stack, request_id, trace_id, purpose,
    route_decision, route_reason, attribution, adapter_id, provider, request_model, response_model, input_tokens,
    output_tokens, cache_read_tokens, latency_ms, finish_reason, outcome, error_kind, cost_micro, cost_basis,
    price_version, routing_sha, period_day, period_month, client_label)
  VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'local', NULL, 'none', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
    $18, 0, 'none', $19, $20, $21, $22, $23)`;

export class Gateway {
  private readonly primary: Routed;
  private readonly fallback: Routed | undefined;
  private readonly realNow: () => number;
  private gauges: GaugeSnapshot = { killSwitch: "degraded", cause: "store_unreachable", adapters: [] };
  private gaugeTimer: NodeJS.Timeout | undefined;
  private uninitializedSince: number | undefined;
  private uninitializedLoggedAt: number | undefined;

  constructor(private readonly opts: GatewayOptions) {
    this.realNow = opts.realNow ?? Date.now;
    const routed = (built: BuiltAdapter): Routed => ({
      built,
      health: new AdapterHealth(built.adapter, built.config.spec.healthCadence(built.config.settings), {
        realNow: this.realNow,
        onChange: (h) => this.healthChanged(built, h),
      }),
      requestTimeoutMs: built.config.spec.timing(built.config.settings).requestMs,
    });
    const primary = opts.adapters.find((a) => a.role === "primary");
    if (primary === undefined) throw new Error("the route has no primary adapter");
    this.primary = routed(primary);
    const fallback = opts.adapters.find((a) => a.role === "fallback");
    this.fallback = fallback === undefined ? undefined : routed(fallback);
    this.gauges = { ...this.gauges, adapters: this.routed().map((r) => ({ id: r.built.config.id, healthy: false })) };
    opts.metrics.setSnapshot(this.gauges);
  }

  /** The background work: each adapter's probe loop, and the gauges' refresh (data-model.md §7.7). */
  start(): void {
    for (const r of this.routed()) r.health.start();
    if (this.gaugeTimer !== undefined) return;
    this.gaugeTimer = setInterval(() => void this.refreshGauges().catch(() => {}), this.opts.gaugeIntervalMs ?? 10_000);
    this.gaugeTimer.unref();
  }

  async close(): Promise<void> {
    if (this.gaugeTimer !== undefined) clearInterval(this.gaugeTimer);
    this.gaugeTimer = undefined;
    for (const r of this.routed()) r.health.stop();
    await Promise.allSettled(this.routed().map((r) => r.built.adapter.close?.()));
  }

  /** The adapters this stack routes to, primary first. */
  routedAdapters(): { id: string; role: "primary" | "fallback"; health: HealthStatus }[] {
    return this.routed().map((r) => ({ id: r.built.config.id, role: r.built.role, health: r.health.status() }));
  }

  /** In-memory metered counters for GET /admin/status; a stack without a fallback makes no metered call. */
  meteredCounters(): { inFlight: number; lastMinute: number } {
    return { inFlight: 0, lastMinute: 0 };
  }

  /**
   * The state read at request start (data-model.md §7.1), with no cache. It sets the gateway clock's offset, logs an
   * empty store as state.unknown once a minute (telemetry.md §5.2), and refreshes the state and cause gauges.
   */
  async readState(): Promise<StateRead> {
    const read = await this.opts.store.readStackState();
    if (read.kind === "ok") this.opts.clock.setOffsetMs(read.testClockOffsetMs);
    this.noteUninitialized(read);
    this.gauges = {
      ...this.gauges,
      killSwitch: read.kind === "ok" ? read.state : "degraded",
      cause: this.dryRun(read) ?? "none",
      ...(read.kind === "ok" ? { fallbackAwaitingRenewal: read.fallbackAwaitingRenewal } : {}),
    };
    if (read.kind !== "ok") delete this.gauges.meters;
    this.opts.metrics.setSnapshot(this.gauges);
    return read;
  }

  /** One hello-shaped call, in FR-022's order. */
  async complete(call: GatewayCall): Promise<GatewayAnswer> {
    const attributes = { "h4.stack": this.opts.stack, "h4.routing.sha": this.opts.routing.sha256 };
    return this.opts.tracer.startActiveSpan("gateway.route", { kind: SpanKind.INTERNAL, attributes }, async (span) => {
      try {
        const traceId = traceIdOf(span);
        const read = await this.readState();
        span.setAttribute("h4.state", read.kind === "ok" ? read.state : "unknown");
        const early = stateDecision(read, { outageSince: this.opts.store.outageStartedAt() });
        if (early !== undefined) return this.degrade(span, early, traceId);

        if (this.primary.health.status().healthy) {
          const local = await this.callLocal(call, traceId);
          if (local !== "failed_over") {
            span.setAttributes({ "h4.route.decision": "local", "h4.route.reason": "local_healthy" });
            return local;
          }
        }
        // Local is unhealthy, or its call just failed as unavailable or timeout (local_failed). This stack has no
        // fallback: the metered fallback branch arrives with tasks.md T072–T074.
        const since = this.primary.health.unhealthySince();
        return this.degrade(
          span,
          degraded("no_fallback_in_stack", since === undefined ? {} : { since: rfc3339Seconds(since) }),
          traceId,
        );
      } finally {
        span.end();
      }
    });
  }

  /** GET /health (gateway-http.md §5): it reports, it doesn't gate, and it never calls a provider. */
  async report(): Promise<HealthReport> {
    const read = await this.readState();
    const ok = read.kind === "ok" ? read : undefined;
    // One reading of the real clock, so `time` and `real_time` differ by exactly the test clock's offset.
    const realNow = this.realNow();
    const gatewayNow = gatewayTime(realNow, this.opts.clock.offsetMs());
    const cause = this.dryRun(read);
    return {
      status: cause === null ? "ok" : "degraded",
      stack: this.opts.stack,
      env: this.opts.envClass,
      version: this.opts.version,
      time: new Date(gatewayNow).toISOString(),
      real_time: new Date(realNow).toISOString(),
      store: read.kind,
      state: ok?.state ?? null,
      since: ok === undefined ? null : rfc3339Seconds(ok.since.getTime()),
      crossed: ok?.crossed ?? null,
      degraded_cause: cause,
      fallback: {
        adapter: this.fallback?.built.config.id ?? null,
        awaiting_renewal: ok?.fallbackAwaitingRenewal ?? null,
        awaiting_since:
          ok?.fallbackAwaitingSince === null || ok === undefined
            ? null
            : rfc3339Seconds(ok.fallbackAwaitingSince.getTime()),
      },
      adapters: this.routed().map((r) => adapterReport(r)),
      journal: this.opts.journalStatus?.() ?? "unknown",
      config: { routing_sha: this.opts.routing.sha256, price_version: this.opts.prices.active(gatewayNow)?.id ?? null },
      test_machinery: { ...this.opts.testMachinery, clock_offset_ms: this.opts.clock.offsetMs() },
    };
  }

  /** The cause a hello arriving now would get, with no reservation and no provider call. */
  private dryRun(read: StateRead): DegradedCause | null {
    return wouldDegrade({
      read,
      local: { healthy: this.primary.health.status().healthy },
      hasFallback: this.fallback !== undefined,
    });
  }

  private routed(): Routed[] {
    return this.fallback === undefined ? [this.primary] : [this.primary, this.fallback];
  }

  private degrade(span: Span, decision: Degraded, traceId: string): GatewayAnswer {
    span.setAttributes({
      "h4.route.decision": "degraded",
      "h4.route.reason": decision.cause,
      "h4.degraded.cause": decision.cause,
    });
    return { kind: "degraded", decision, traceId };
  }

  /** The local call (§2.4 step 5.1): free, unmetered, within its own timeouts and the request's deadline. */
  private async callLocal(call: GatewayCall, traceId: string): Promise<GatewayAnswer | "failed_over"> {
    const { built, health, requestTimeoutMs } = this.primary;
    const adapter = built.adapter;
    const version = this.opts.prices.active(this.opts.clock.now());
    if (version === undefined) throw new Error("no active price version"); // startup refuses this (config-files.md §2.5)
    const req: CompletionRequest = {
      requestId: call.requestId,
      purpose: call.purpose,
      messages: call.messages,
      maxOutputTokens: call.maxOutputTokens,
      deadline: call.arrivedAt + this.opts.routing.deadlineMs,
      signal: call.signal,
    };
    const outcome = await attemptCall(adapter, req, {
      tracer: this.opts.tracer,
      stack: this.opts.stack,
      routingSha: this.opts.routing.sha256,
      priceVersion: version,
      decision: { kind: "local", reason: "local_healthy" },
      attribution: "none",
      payloadSampling: this.opts.payloadSampling,
      requestTimeoutMs,
      realNow: this.realNow,
      metrics: this.opts.metrics,
      // A caller that went away ends the call with timeout too, and that says nothing about the model server.
      onFailure: (err) => {
        if (!call.signal.aborted) health.callFailed(err);
      },
    });
    for (const attempt of outcome.attempts) await this.recordLocal(attempt, call, traceId, version);
    if (outcome.ok) {
      return {
        kind: "answered",
        route: "local",
        routeReason: null,
        provider: adapter.provider,
        result: outcome.result,
        costMicro: 0n,
        priceVersion: version.id,
        traceId,
      };
    }
    if (outcome.error.kind === "unavailable" || outcome.error.kind === "timeout") return "failed_over";
    // A rejected request is no sign of an unhealthy model server, and failing over would spend for nothing (§2.5.5).
    return { kind: "local_error", errorKind: outcome.error.kind, traceId };
  }

  /**
   * A local attempt's ledger row, in its own transaction and without the state lock (data-model.md §7.4), then its
   * call.completed record. If the insert fails, the answer still returns; the store has logged the outage.
   */
  private async recordLocal(
    attempt: Awaited<ReturnType<typeof attemptCall>>["attempts"][number],
    call: GatewayCall,
    traceId: string,
    version: PriceVersion,
  ): Promise<void> {
    const adapter = this.primary.built.adapter;
    const offset = this.opts.clock.offsetMs();
    const startedAt = gatewayTime(attempt.startedAt, offset);
    const periods = periodKeys(startedAt);
    const ok = attempt.outcome === "ok" ? attempt.result : undefined;
    const error = attempt.outcome === "error" ? attempt.error : undefined;
    const latencyMs = ok?.latencyMs ?? Math.max(0, Math.round(attempt.endedAt - attempt.startedAt));
    try {
      await this.opts.store.query(LOCAL_LEDGER_ROW, [
        randomUUID(),
        toRfc3339(gatewayTime(attempt.endedAt, offset)),
        toRfc3339(startedAt),
        this.opts.stack,
        call.requestId,
        traceId,
        call.purpose,
        this.primary.built.config.id,
        adapter.provider,
        adapter.model,
        ok?.responseModel ?? null,
        ok?.usage.inputTokens ?? null,
        ok?.usage.outputTokens ?? null,
        ok?.usage.cacheReadInputTokens ?? null,
        latencyMs,
        ok?.finishReason ?? null,
        ok === undefined ? "error" : "ok",
        error?.kind ?? null,
        version.id,
        this.opts.routing.sha256,
        periods.day,
        periods.month,
        call.clientLabel ?? null,
      ]);
      this.opts.metrics.cost(0n, { provider: adapter.provider, model: adapter.model, attribution: "none" });
    } catch {
      // Logged by the store as state.unknown, at most once a minute (telemetry.md §5.2).
    }
    this.opts.logger.info(
      {
        event: "call.completed",
        route_decision: "local",
        route_reason: null,
        attribution: "none",
        adapter: this.primary.built.config.id,
        provider: adapter.provider,
        request_model: adapter.model,
        response_model: ok?.responseModel ?? null,
        // Only when there is usage: the logger censors a token-named key that isn't a number.
        ...(ok === undefined ? {} : { input_tokens: ok.usage.inputTokens, output_tokens: ok.usage.outputTokens }),
        latency_ms: latencyMs,
        cost_micro: 0,
        cost_basis: "none",
        price_version: version.id,
        outcome: ok === undefined ? "error" : "ok",
        error_kind: error?.kind ?? null,
      },
      "A provider attempt completed.",
    );
  }

  private healthChanged(built: BuiltAdapter, health: AdapterHealth): void {
    const status = health.status();
    this.opts.logger.info(
      {
        event: "adapter.health_changed",
        adapter: built.config.id,
        healthy: status.healthy,
        reason: status.reason ?? null,
      },
      "An adapter's effective health changed.",
    );
    this.gauges = {
      ...this.gauges,
      adapters: this.routed().map((r) => ({ id: r.built.config.id, healthy: r.health.status().healthy })),
    };
    this.opts.metrics.setSnapshot(this.gauges);
  }

  /** The 10 s refresh: the state read, and the current periods' meters in USD (telemetry.md §4.1). */
  private async refreshGauges(): Promise<void> {
    const read = await this.readState();
    if (read.kind !== "ok") return;
    const { day, month } = this.opts.clock.periodKeys();
    let rows: MeterRow[];
    try {
      rows = await this.opts.store.readMeters(day, month);
    } catch {
      delete this.gauges.meters;
      this.opts.metrics.setSnapshot(this.gauges);
      return;
    }
    const t = thresholds(this.opts.budgets.envs[this.opts.envClass]);
    const row = (meter: MeterRow["meter"]) => rows.find((r) => r.meter === meter);
    const allowance = row("fallback_day")?.allowanceMicro ?? t.fallbackGrant;
    this.gauges = {
      ...this.gauges,
      meters: {
        day: { spentMicro: row("day")?.spentMicro ?? 0n, ceilingMicro: t.dayCeiling, warnMicro: t.dayWarn },
        month: { spentMicro: row("month")?.spentMicro ?? 0n, ceilingMicro: t.monthCeiling, warnMicro: t.monthWarn },
        fallbackDay: {
          spentMicro: row("fallback_day")?.spentMicro ?? 0n,
          allowanceMicro: allowance,
          warnMicro: t.fallbackWarn(allowance),
        },
      },
    };
    this.opts.metrics.setSnapshot(this.gauges);
  }

  /** state.unknown for an empty store: once when it is found, then once a minute while it lasts. */
  private noteUninitialized(read: StateRead): void {
    if (read.kind !== "uninitialized") {
      if (read.kind === "ok") this.uninitializedSince = undefined;
      return;
    }
    const now = this.realNow();
    this.uninitializedSince ??= now;
    if (this.uninitializedLoggedAt !== undefined && now - this.uninitializedLoggedAt < STATE_LOG_EVERY_MS) return;
    this.uninitializedLoggedAt = now;
    this.opts.logger.error(
      {
        event: "state.unknown",
        condition: "store_uninitialized",
        since: new Date(this.uninitializedSince).toISOString(),
      },
      "The kill-switch store is empty, so the stack fails closed until the operator initializes it.",
    );
  }
}

function adapterReport(r: Routed): AdapterReport {
  const status = r.health.status();
  const adapter = r.built.adapter;
  return {
    id: r.built.config.id,
    role: r.built.role,
    provider: adapter.provider,
    kind: adapter.kind,
    model: adapter.model,
    healthy: status.healthy,
    reason: status.reason ?? null,
    checked_at: rfc3339Seconds(Date.parse(status.checkedAt)),
    ...(status.credentialsExpireAt === undefined ? {} : { credentials_expire_at: status.credentialsExpireAt }),
  };
}
