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
// AdapterHealth tracks each routed adapter's effective health, on the real clock: its probe and, for a type with one,
// its circuit breaker (§6 items 4 to 6).
//
// Gateway.complete decides in FR-022's order (gateway-http.md §2.4): the state read with no cache, then the kill
// switch, then a healthy local adapter, whose calls are free and write their ledger rows without a reservation
// (data-model.md §7.4). Then the fallback: a stack without one answers no_fallback_in_stack; otherwise the metered
// limits in memory, admission in the store, the journal's reserve record, the call, and the commit (the meter,
// meter/meter.ts), each refusal answered with its cause. Gateway.meteredCall is the same metered path without the
// local step, for dev's synthetic spend and prod's live tests. Gateway.report is GET /health's report, from the same
// dry run.
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

import type { CircuitSettings, HealthCadence } from "../adapters/_settings.js";
import type { BuiltAdapter } from "../adapters/registry.js";
import {
  costMicro,
  PriceTable,
  thresholds,
  type AdapterConfig,
  type BudgetEnv,
  type Budgets,
  type EnvClass,
  type PriceVersion,
  type RoutingConfig,
  type StackName,
} from "../config/validate.js";
import type { MeterRow, StateRead, Store } from "../meter/store.js";
import type { Admitted, CallEnd, MeteredAttribution, MeterPort, RouteReason, Settlement } from "../meter/types.js";
import type { GatewayMetrics, GaugeSnapshot } from "../telemetry/metrics.js";
import { redactSecrets } from "../telemetry/redact.js";
import { gatewayTime, periodKeys, toRfc3339, type GatewayClock } from "./clock.js";
import { degraded, rfc3339Seconds, stateDecision, wouldDegrade, type Degraded, type MeterView } from "./router.js";
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
  type RoomCall,
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
  /** Retries in place of the adapter's `retry.max`: a twin turn on a paid adapter gets none (spec 007's plan, D43). */
  retryMax?: number;
  realNow?: () => number;
  metrics?: GatewayMetrics;
  /** Called on each failed attempt: health tracking counts unavailable and timeout as a failed probe (§6). */
  onFailure?: (err: ProviderError) => void;
  /** A twin call's room feature and topic, on each client span (spec 007, FR-026, FR-043). */
  room?: RoomCall;
}

/** An attempt's client span as operator-admin.md §5 reports it: its name, its kind, and its attribute keys, no values. */
export interface SpanShape {
  name: string;
  kind: "client";
  attributeKeys: string[];
}

interface AttemptBase {
  costMicro: bigint;
  costBasis: CostBasis;
  span: SpanShape;
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

/** A whole call's cost basis: `reservation` if any attempt was possibly billed, else `usage` if one answered. */
export function basisOf(attempts: readonly AttemptRecord[]): CostBasis {
  if (attempts.some((a) => a.costBasis === "reservation")) return "reservation";
  return attempts.some((a) => a.costBasis === "usage") ? "usage" : "none";
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
  if (ctx.room !== undefined) {
    always["h4.room.feature"] = ctx.room.feature;
    always["h4.room.topic"] = ctx.room.topic;
  }
  if (ctx.payloadSampling) always["gen_ai.input.messages"] = redactSecrets(inputMessages(req.messages));

  const parent = context.active();
  const name = `chat ${adapter.model}`;
  const span = ctx.tracer.startSpan(name, { kind: SpanKind.CLIENT, attributes: always }, parent);
  const keys = new Set(Object.keys(always));
  const shape = (more: Attributes): SpanShape => {
    for (const key of Object.keys(more)) keys.add(key);
    return { name, kind: "client", attributeKeys: [...keys].sort() };
  };
  const startedAt = now();
  const metricBase = { provider: adapter.provider, requestModel: adapter.model, server: adapter.server.address };
  try {
    const result = await context.with(trace.setSpan(parent, span), () => adapter.complete(req));
    const endedAt = now();
    const cost = costOf(adapter, ctx, { result });
    const answered: Attributes = {
      "gen_ai.response.model": result.responseModel,
      "gen_ai.usage.input_tokens": result.usage.inputTokens,
      "gen_ai.usage.output_tokens": result.usage.outputTokens,
      "gen_ai.response.finish_reasons": [result.finishReason],
      ...(result.responseId === undefined ? {} : { "gen_ai.response.id": result.responseId }),
      "h4.cost.usd": usd(cost.micro),
      "h4.cost.basis": cost.basis,
      ...(ctx.payloadSampling ? { "gen_ai.output.messages": redactSecrets(outputMessages(result)) } : {}),
    };
    span.setAttributes(answered);
    span.end();
    const seconds = (endedAt - startedAt) / 1_000;
    ctx.metrics?.operationDuration(seconds, { ...metricBase, responseModel: result.responseModel });
    for (const tokenType of ["input", "output"] as const) {
      const tokens = tokenType === "input" ? result.usage.inputTokens : result.usage.outputTokens;
      ctx.metrics?.tokenUsage(tokens, { ...metricBase, responseModel: result.responseModel, tokenType });
    }
    return {
      outcome: "ok",
      result,
      costMicro: cost.micro,
      costBasis: cost.basis,
      span: shape(answered),
      startedAt,
      endedAt,
    };
  } catch (thrown) {
    // An adapter rejects only with a ProviderError; anything else is a bug, and becomes one with nothing of it kept.
    const error = thrown instanceof ProviderError ? thrown : new ProviderError("provider_error", true, false);
    const endedAt = now();
    const cost = costOf(adapter, ctx, { error });
    const errorType = error.code ?? error.kind;
    const failed: Attributes = { "error.type": errorType, "h4.cost.usd": usd(cost.micro), "h4.cost.basis": cost.basis };
    span.setAttributes(failed);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.kind });
    span.end();
    ctx.metrics?.operationDuration((endedAt - startedAt) / 1_000, { ...metricBase, errorType });
    ctx.onFailure?.(error);
    return {
      outcome: "error",
      error,
      costMicro: cost.micro,
      costBasis: cost.basis,
      span: shape(failed),
      startedAt,
      endedAt,
    };
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
      attempts.length <= (ctx.retryMax ?? policy.max) &&
      policy.on.includes(error.kind) &&
      !req.signal.aborted &&
      now() + policy.backoffMs + ctx.requestTimeoutMs <= req.deadline;
    if (!again) return { ok: false, error, attempts };
    await backoff(policy.backoffMs, req.signal);
    if (req.signal.aborted) return { ok: false, error, attempts };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Health tracking (provider-adapter.md §6 items 4 to 6)
// ---------------------------------------------------------------------------------------------------------------

/** The failure kinds a circuit counts (provider-adapter.md §6 item 5); bad_request and content_filtered say nothing. */
const CIRCUIT_KINDS: ReadonlySet<ProviderErrorKind> = new Set<ProviderErrorKind>([
  "unavailable",
  "timeout",
  "rate_limited",
  "auth",
  "provider_error",
]);

/**
 * One adapter's effective health: its probes, combined with its circuit (§6 items 4 to 6). It starts unhealthy
 * (`not_ready`). A probe every `intervalMs`, on the real clock: `healthyAfter` passes in a row make it healthy,
 * `unhealthyAfter` failures in a row unhealthy. A failed attempt of kind `unavailable` or `timeout` makes it unhealthy
 * at once and resets the count, and so does `auth` on a paid adapter, as `credentials` (§2.5). Probes never spend.
 *
 * An adapter whose type has a circuit (Bedrock) also counts its calls' ends: `failures` counted failures in a row open
 * the circuit for `openMs`, and while it's open the adapter is unhealthy with `circuit_open`, unless its probes give a
 * reason of their own. Then it's half-open: the adapter reads as its probes do, and one fallback call at a time goes
 * through as the trial. A success closes it, and a counted failure opens it for another `openMs`. Probes don't close
 * it.
 */
export class AdapterHealth {
  /** The effective health, as status() reports it. */
  private healthy = false;
  private reason: HealthReason | undefined = "not_ready";
  /** The probes' view, with the attempts that count as probes, before the circuit is combined in. */
  private probedHealthy = false;
  private probedReason: HealthReason | undefined = "not_ready";
  private checkedAt: string;
  private latencyMs: number | undefined;
  /** The last probe's credentialsExpireAt: a paid adapter's SSO session end (provider-adapter.md §2.4). */
  private credentialsExpireAt: string | undefined;
  private passes = 0;
  private failures = 0;
  /** The circuit: counted failures in a row while it's closed, when it last opened (real ms), and a trial in flight. */
  private circuitFailures = 0;
  private openedAt: number | undefined;
  private trialOut = false;
  /** Fires when an open circuit turns half-open, so the gauge and the log see it without a read. */
  private halfOpenTimer: NodeJS.Timeout | undefined;
  /** When the effective health last flipped, real ms; startup counts as turning unhealthy. */
  private changedAt: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    readonly adapter: ProviderAdapter,
    private readonly cadence: HealthCadence,
    private readonly opts: {
      realNow: () => number;
      /** The effective health flipped. */
      onChange: (health: AdapterHealth) => void;
      /** It entered an unhealthy reason: a flip, the first probe's own reason after not_ready, or a new reason. */
      onUnhealthy?: (health: AdapterHealth) => void;
      /** The adapter type's circuit, for a type that has one (§6 item 5). */
      circuit?: CircuitSettings;
    },
  ) {
    this.changedAt = opts.realNow();
    this.checkedAt = new Date(this.changedAt).toISOString();
  }

  status(): HealthStatus {
    this.update(); // an open circuit turns half-open with time, not with an event
    return {
      healthy: this.healthy,
      checkedAt: this.checkedAt,
      ...(this.reason === undefined ? {} : { reason: this.reason }),
      ...(this.latencyMs === undefined ? {} : { latencyMs: this.latencyMs }),
      ...(this.credentialsExpireAt === undefined ? {} : { credentialsExpireAt: this.credentialsExpireAt }),
    };
  }

  /** When it last turned unhealthy (real ms), or undefined while healthy: the `since` of no_fallback_in_stack. */
  unhealthySince(): number | undefined {
    this.update();
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
    if (this.halfOpenTimer !== undefined) clearTimeout(this.halfOpenTimer);
  }

  /**
   * A failed attempt (§6 item 4): `unavailable` and `timeout` count as a failed probe, and mark the adapter unhealthy
   * at once; so does `auth` on a paid adapter, as `credentials` (§2.5's auth row). The circuit counts calls: callEnded.
   */
  callFailed(err: ProviderError): void {
    const reason: HealthReason | undefined =
      err.kind === "unavailable"
        ? "unreachable"
        : err.kind === "timeout"
          ? "timeout"
          : err.kind === "auth" && this.adapter.kind === "paid"
            ? "credentials"
            : undefined;
    if (reason === undefined) return;
    this.passes = 0;
    this.setProbed(false, reason);
  }

  /**
   * A fallback call's pass through the circuit (§6 item 5): always while it's closed, never while it's open, and while
   * it's half-open, to one call at a time, the trial, while the probes say healthy. callEnded gives the trial back.
   */
  admitCall(): { allowed: boolean; trial: boolean } {
    this.update();
    const phase = this.phase();
    if (phase === "closed") return { allowed: true, trial: false };
    if (phase === "open" || this.trialOut || !this.probedHealthy) return { allowed: false, trial: false };
    this.trialOut = true;
    return { allowed: true, trial: true };
  }

  /** Whether admitCall would let a fallback call through now, taking nothing: GET /health's dry run. */
  wouldAdmit(): boolean {
    this.update();
    const phase = this.phase();
    return phase === "closed" || (phase === "half_open" && !this.trialOut && this.probedHealthy);
  }

  /**
   * A call's end, for the circuit (§6 item 5). A success closes it and clears the count. A failure of a counted kind
   * counts, and opens it at `failures` in a row; while it's open or half-open, one opens it for another `openMs`. Any
   * other failure neither counts nor clears the count, and nor does a call that never reached the adapter (no outcome)
   * or one whose caller went away. A trial gives its turn back whatever the end.
   */
  callEnded(outcome: AttemptOutcome | undefined, o: { trial: boolean; callerGone: boolean }): void {
    if (o.trial) this.trialOut = false;
    const circuit = this.opts.circuit;
    if (circuit === undefined || outcome === undefined) return;
    if (outcome.ok) {
      this.circuitFailures = 0;
      if (this.openedAt !== undefined) this.openCircuit(undefined);
      return;
    }
    if (o.callerGone || !CIRCUIT_KINDS.has(outcome.error.kind)) return;
    if (this.openedAt !== undefined) {
      this.openCircuit(circuit);
      return;
    }
    this.circuitFailures += 1;
    if (this.circuitFailures < circuit.failures) return;
    this.circuitFailures = 0;
    this.openCircuit(circuit);
  }

  /** Opens the circuit for its open time, from now; with no settings, closes it. */
  private openCircuit(circuit: CircuitSettings | undefined): void {
    if (this.halfOpenTimer !== undefined) clearTimeout(this.halfOpenTimer);
    this.halfOpenTimer = undefined;
    this.openedAt = circuit === undefined ? undefined : this.opts.realNow();
    if (circuit !== undefined) this.scheduleHalfOpen(circuit.openMs);
    this.update();
  }

  /**
   * The turn to half-open, for the gauge and the log. A timer can fire before the real clock says the time is up (its
   * clock isn't Date.now's), so one that finds the circuit still open waits out the rest.
   */
  private scheduleHalfOpen(delayMs: number): void {
    this.halfOpenTimer = setTimeout(() => {
      this.halfOpenTimer = undefined;
      const { openedAt } = this;
      if (openedAt !== undefined && this.phase() === "open") {
        this.scheduleHalfOpen(Math.max(1, (this.opts.circuit?.openMs ?? 0) - (this.opts.realNow() - openedAt)));
        return;
      }
      this.update();
    }, delayMs);
    this.halfOpenTimer.unref();
  }

  /** Closed; open, for `openMs` after it opened; then half-open until a call's end closes or reopens it. */
  private phase(): "closed" | "open" | "half_open" {
    if (this.openedAt === undefined) return "closed";
    const openMs = this.opts.circuit?.openMs ?? 0;
    return this.opts.realNow() - this.openedAt < openMs ? "open" : "half_open";
  }

  /** One probe now, counted as the loop counts it. */
  async probe(): Promise<void> {
    const status = await this.adapter.health(AbortSignal.timeout(this.cadence.timeoutMs));
    this.checkedAt = status.checkedAt;
    this.latencyMs = status.latencyMs;
    this.credentialsExpireAt = status.credentialsExpireAt;
    if (status.healthy) {
      this.failures = 0;
      this.passes += 1;
      if (!this.probedHealthy && this.passes >= this.cadence.healthyAfter) this.setProbed(true);
      return;
    }
    this.passes = 0;
    this.failures += 1;
    const reason = status.reason ?? "unreachable";
    if (!this.probedHealthy || this.failures >= this.cadence.unhealthyAfter) this.setProbed(false, reason);
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

  private setProbed(healthy: boolean, reason?: HealthReason): void {
    this.probedHealthy = healthy;
    this.probedReason = healthy ? undefined : reason;
    this.update();
  }

  /** The probes' view combined with the circuit (§6 item 6): the probes' reason first, then circuit_open while open. */
  private update(): void {
    const healthy = this.probedHealthy && this.phase() !== "open";
    const reason = healthy ? undefined : this.probedHealthy ? "circuit_open" : this.probedReason;
    const flipped = healthy !== this.healthy;
    const was = this.reason;
    this.healthy = healthy;
    this.reason = reason;
    if (flipped) {
      this.changedAt = this.opts.realNow();
      this.opts.onChange(this);
    }
    if (!healthy && (flipped || reason !== was)) this.opts.onUnhealthy?.(this);
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
  /** The messages, or a function that builds them, which the gateway calls once, only after its state read passes, so
   *  a degraded turn builds nothing (spec 007, FR-025). */
  messages: ChatMessage[] | (() => ChatMessage[]);
  maxOutputTokens: number;
  /** Real clock, epoch ms: the deadline counts from here (gateway-http.md §2.4). */
  arrivedAt: number;
  /** Aborts when the caller goes away. */
  signal: AbortSignal;
  /** POST /admin/adapters/{id}/complete only (operator-admin.md §5): 0 to 1; hello never sends one. */
  temperature?: number;
  /** X-H4-Client: the ledger keeps it, and nothing else does (§2.3). */
  clientLabel?: string;
  /** The client, which may have one metered call in flight (gateway-http.md §2.4 step 5.5): hello's, and a twin turn's
   *  (spec 007, plan §3). */
  clientKey?: string;
  /** A twin call's input bound, limits.twin.max_input_chars, which its reservation counts (spec 007, Amendment 0-2). */
  maxInputChars?: number;
  /** A twin call's room feature and topic (spec 007, FR-026): on its spans, in its ledger rows, on h4.cost.usd. */
  room?: RoomCall;
  /**
   * Its own trace: a root gateway.route span, linked to the caller's span. POST /admin/test/synthetic makes one call
   * after another in one request, and each call's trace ID is its own (operator-admin.md §3.2).
   */
  newTrace?: boolean;
}

/** A call whose messages are built: what every step after the state read works with. */
type ResolvedCall = Omit<GatewayCall, "messages"> & { messages: ChatMessage[] };

const resolveCall = (call: GatewayCall): ResolvedCall => ({
  ...call,
  messages: typeof call.messages === "function" ? call.messages() : call.messages,
});

export type GatewayAnswer =
  | {
      kind: "answered";
      /** The FR-022 decision that answered: local, the fallback, or a metered call with no local step. */
      route: "local" | "fallback" | "metered";
      /** Why a fallback answered; null otherwise. */
      routeReason: RouteReason | null;
      provider: string;
      result: AdapterResult;
      costMicro: bigint;
      priceVersion: string;
      traceId: string;
    }
  | { kind: "degraded"; decision: Degraded; traceId: string }
  /** A 429 from the metered limits in memory (gateway-http.md §2.5.3): a refusal, not a degraded state. */
  | {
      kind: "refused";
      /** The decision the refused call was on: the fallback branch, or a metered call with no local step. */
      route: "fallback" | "metered";
      error: "client_cap_exceeded" | "metered_capacity_exceeded";
      limit: "metered_in_flight" | "global_in_flight" | "global_per_minute";
      retryAfterS: number;
      traceId: string;
    }
  | { kind: "local_error"; errorKind: ProviderErrorKind; traceId: string };

/** What POST /admin/adapters/{id}/complete gets back (operator-admin.md §5): a refusal before the call, or its outcome. */
export type AdapterCallAnswer =
  | Extract<GatewayAnswer, { kind: "degraded" }>
  | Extract<GatewayAnswer, { kind: "refused" }>
  | {
      kind: "called";
      adapter: string;
      attribution: "test" | "none";
      /** Every attempt, and how the call ended. */
      outcome: AttemptOutcome;
      /** What the call was charged: the meter's settlement, 0 for the local adapter. */
      costMicro: bigint;
      costBasis: CostBasis;
      priceVersion: string;
      traceId: string;
      /** The key of the call's ledger rows: the metered call's reservation, or the local attempts' own IDs. */
      ledgerRef: string | null;
    };

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
  /** The route's adapters left switched off (registry.ts switchedOff): reported as disabled, never routed. */
  disabled?: readonly { role: "primary" | "fallback"; config: AdapterConfig }[];
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
  /** Spec 007's room features, each selectable's ID and free_talk, whose cost series start at zero beside none's (plan
   *  §3; SC-006; the review of T066, I6). None without the twin's files. */
  roomFeatures?: readonly string[];
  /** The metered path: admission, the commit, and their upkeep. A stack with a fallback needs it. */
  meter?: MeterPort;
  realNow?: () => number;
  /** How often the gauges are refreshed from the store: 10 s (data-model.md §7.7). */
  gaugeIntervalMs?: number;
  /**
   * Spec 001's EC2 route (schema 2's first and second): its primary and fallback are both paid, called in that order
   * with no local step, and every call is metered (rule A1). False or absent everywhere else.
   */
  paidRoute?: boolean;
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
  /** A twin turn's one attempt on a paid adapter, routing.yaml's twin_request_ms (spec 007's plan, D43). */
  twinRequestMs: number | undefined;
  /**
   * The SSO session end the credentials check last found within its warning lead time, real ms; whether its alert row
   * is settled, queued or found already there; and whether the dispatcher is still answering for it.
   */
  credentials?: { endsAt: number; settled: boolean; asking: boolean };
}

const STATE_LOG_EVERY_MS = 60_000;

/** An adapter's circuit settings, for a type that has a circuit breaker (provider-adapter.md §6 item 5). */
function circuitOf(built: BuiltAdapter): { circuit?: CircuitSettings } {
  const circuit = built.config.spec.circuit?.(built.config.settings);
  return circuit === undefined ? {} : { circuit };
}

/** The trace ID the ledger and the body record: the span's, or a fresh one when no tracer records spans. */
function traceIdOf(span: Span): string {
  const ctx = span.spanContext();
  return isSpanContextValid(ctx) ? ctx.traceId : randomBytes(16).toString("hex");
}

const LOCAL_LEDGER_ROW = `INSERT INTO gateway.ledger (id, reservation_id, ts, started_at, stack, request_id, trace_id, purpose,
    route_decision, route_reason, attribution, adapter_id, provider, request_model, response_model, input_tokens,
    output_tokens, cache_read_tokens, latency_ms, finish_reason, outcome, error_kind, cost_micro, cost_basis,
    price_version, routing_sha, period_day, period_month, client_label, room_feature, room_topic)
  VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'local', NULL, 'none', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
    $18, 0, 'none', $19, $20, $21, $22, $23, $24, $25)`;

export class Gateway {
  /** Queues the fallback_unavailable alert (app.ts sets it to the dispatcher's): a paid fallback turned unhealthy. */
  onFallbackUnavailable: ((adapter: string, reason: "credentials" | "circuit_open") => void) | undefined;
  /**
   * Queues the credentials_expiring alert (app.ts sets it to the dispatcher's): a paid adapter's session ends soon. It
   * answers whether the row is queued, already there, or to be asked for again at the next tick.
   */
  onCredentialsExpiring:
    ((adapter: string, label: string, endsAt: number) => Promise<"queued" | "present" | "retry">) | undefined;
  private readonly primary: Routed;
  /** When the route was built: a switched-off adapter's checked_at. */
  private readonly disabledAt: number;
  private readonly fallback: Routed | undefined;
  private readonly realNow: () => number;
  private gauges: GaugeSnapshot = { killSwitch: "degraded", cause: "store_unreachable", adapters: [] };
  private gaugeTimer: NodeJS.Timeout | undefined;
  private uninitializedSince: number | undefined;
  private uninitializedLoggedAt: number | undefined;
  /** The current periods' meters as last read: the dry run's view of the fallback branch (telemetry.md §4.1). */
  private meterView: MeterView | undefined;

  constructor(private readonly opts: GatewayOptions) {
    this.realNow = opts.realNow ?? Date.now;
    const routed = (built: BuiltAdapter): Routed => ({
      built,
      health: new AdapterHealth(built.adapter, built.config.spec.healthCadence(built.config.settings), {
        realNow: this.realNow,
        onChange: (h) => this.healthChanged(built, h),
        onUnhealthy: (h) => this.turnedUnhealthy(built, h),
        ...circuitOf(built),
      }),
      requestTimeoutMs: built.config.spec.timing(built.config.settings).requestMs,
      twinRequestMs: built.config.spec.timing(built.config.settings).twinRequestMs,
    });
    const primary = opts.adapters.find((a) => a.role === "primary");
    if (primary === undefined) throw new Error("the route has no primary adapter");
    this.primary = routed(primary);
    const fallback = opts.adapters.find((a) => a.role === "fallback");
    this.fallback = fallback === undefined ? undefined : routed(fallback);
    if (this.fallback !== undefined && opts.meter === undefined) throw new Error("a fallback needs the meter");
    this.disabledAt = this.realNow();
    this.gauges = { ...this.gauges, adapters: this.adapterGauges() };
    opts.metrics.setSnapshot(this.gauges);
  }

  /** h4.adapter.healthy's points: each routed adapter's effective health, and 0 for each one switched off. */
  private adapterGauges(): { id: string; healthy: boolean }[] {
    return [
      ...this.routed().map((r) => ({ id: r.built.config.id, healthy: r.health.status().healthy })),
      ...(this.opts.disabled ?? []).map((d) => ({ id: d.config.id, healthy: false })),
    ];
  }

  /** The background work: each adapter's probe loop, the meter's sweep, and the gauges' refresh (data-model.md §7.7). */
  start(): void {
    for (const r of this.routed()) r.health.start();
    this.opts.meter?.start();
    if (this.gaugeTimer !== undefined) return;
    this.seedCostSeries();
    this.gaugeTimer = setInterval(() => {
      void this.refreshGauges().catch(() => {});
      this.checkCredentials();
    }, this.opts.gaugeIntervalMs ?? 10_000);
    this.gaugeTimer.unref();
  }

  /**
   * A zero on each cost series a routed metered adapter can be charged under, at start (telemetry.md §4.1; tasks.md
   * T191). A metered call's series is first written at its commit, with its cost, and Prometheus ingests no zero at a
   * series' start, so `increase()` would miss the first call. The fallback is charged as `fallback`; a paid adapter
   * also as `test` (operator-admin.md §5), and the synthetic one as `metered` (dev's synthetic spend).
   */
  private seedCostSeries(): void {
    for (const r of this.routed()) {
      const { adapter, role } = r.built;
      if (adapter.kind === "local") continue;
      const attributions: Attribution[] = [
        ...(role === "fallback" ? (["fallback"] as const) : []),
        adapter.kind === "paid" ? "test" : "metered",
      ];
      for (const attribution of attributions) {
        this.opts.metrics.cost(0n, { provider: adapter.provider, model: adapter.model, attribution });
        for (const feature of this.opts.roomFeatures ?? []) {
          this.opts.metrics.cost(0n, { provider: adapter.provider, model: adapter.model, attribution, feature });
        }
      }
    }
  }

  async close(): Promise<void> {
    if (this.gaugeTimer !== undefined) clearInterval(this.gaugeTimer);
    this.gaugeTimer = undefined;
    for (const r of this.routed()) r.health.stop();
    await this.opts.meter?.stop();
    await Promise.allSettled(this.routed().map((r) => r.built.adapter.close?.()));
  }

  /** The adapters this stack routes to, primary first. */
  routedAdapters(): { id: string; role: "primary" | "fallback"; health: HealthStatus }[] {
    return this.routed().map((r) => ({ id: r.built.config.id, role: r.built.role, health: r.health.status() }));
  }

  /** The route's fallback adapter as built: none without one, or without its switch (the synthetic adapter's). */
  fallbackId(): string | null {
    return this.fallback?.built.config.id ?? null;
  }

  /** The in-memory metered counters, for GET /admin/status. */
  meteredCounters(): { inFlight: number; lastMinute: number } {
    return this.opts.meter?.counters() ?? { inFlight: 0, lastMinute: 0 };
  }

  /**
   * The 10 s ticker's credentials check (alerts.md §2): a routed paid adapter whose last probe reports an SSO session
   * ending within its type's warning lead time, 2 h for Bedrock, logs credentials.expiring once (telemetry.md §5.2) and
   * queues credentials_expiring. The dispatcher is asked at each tick until the row is queued or found already there,
   * one question at a time; the outbox's dedupe key, to the minute of the end, holds it to one across restarts. A
   * session that has already ended doesn't warn: its credentials fail, and fallback_unavailable says so.
   */
  checkCredentials(): void {
    const now = this.realNow();
    for (const r of this.routed()) {
      const { config } = r.built;
      const warnMs = config.spec.credentialsWarnMs?.(config.settings);
      if (config.kind !== "paid" || warnMs === undefined) continue;
      const endsAt = Date.parse(r.health.status().credentialsExpireAt ?? "");
      if (!Number.isFinite(endsAt) || now < endsAt - warnMs || now >= endsAt) continue;
      if (r.credentials?.endsAt !== endsAt) {
        r.credentials = { endsAt, settled: false, asking: false };
        this.opts.logger.warn(
          { event: "credentials.expiring", adapter: config.id, expires_at: new Date(endsAt).toISOString() },
          "A paid adapter's SSO session ends soon.",
        );
      }
      const check = r.credentials;
      const ask = this.onCredentialsExpiring;
      if (check.settled || check.asking || ask === undefined) continue;
      check.asking = true;
      void ask(config.id, config.spec.label ?? config.id, endsAt)
        .then((answer) => {
          if (answer !== "retry") check.settled = true;
        })
        .catch(() => {})
        .finally(() => {
          check.asking = false;
        });
    }
  }

  /** One probe of every routed adapter now, counted as their loops count it. */
  async probeAll(): Promise<void> {
    await Promise.all(this.routed().map((r) => r.health.probe()));
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
    if (read.kind !== "ok") {
      delete this.gauges.meters;
      delete this.gauges.studioWindow;
    }
    this.opts.metrics.setSnapshot(this.gauges);
    return read;
  }

  /** One hello-shaped call, in FR-022's order (gateway-http.md §2.4). */
  async complete(call: GatewayCall): Promise<GatewayAnswer> {
    return this.routeSpan(call, async (span, traceId) => {
      const read = await this.readState();
      span.setAttribute("h4.state", read.kind === "ok" ? read.state : "unknown");
      const early = stateDecision(read, { outageSince: this.opts.store.outageStartedAt() });
      if (early !== undefined) return this.degrade(span, early, traceId);
      const resolved = resolveCall(call);

      // Spec 001's EC2 route: the first paid adapter while it is healthy, then the second, each metered (A1), so
      // neither counts against fallback_day, the laptop's sub-budget.
      if (this.opts.paidRoute === true) {
        if (this.primary.health.status().healthy) {
          const first = await this.callMetered(span, resolved, traceId, this.primary, "metered", null);
          const failed = first.kind === "degraded" && first.decision.cause === "fallback_unavailable";
          if (!failed || this.fallback === undefined) return first;
        }
        if (this.fallback === undefined) return this.degrade(span, degraded("fallback_unavailable"), traceId);
        return this.callMetered(span, resolved, traceId, this.fallback, "metered", null);
      }

      // 5.1: a healthy local adapter answers, free; one that fails as unavailable or timeout fails over (5.3).
      const localWasHealthy = this.primary.health.status().healthy;
      if (localWasHealthy) {
        const local = await this.callLocal(resolved, traceId);
        if (local !== "failed_over") {
          span.setAttributes({ "h4.route.decision": "local", "h4.route.reason": "local_healthy" });
          return local;
        }
      }
      // 5.2–5.3: local was unhealthy, or its call just failed. A stack without a fallback has nowhere to go.
      const reason: RouteReason = localWasHealthy ? "local_failed" : "local_unhealthy";
      if (this.fallback === undefined) {
        const since = this.primary.health.unhealthySince();
        return this.degrade(
          span,
          degraded("no_fallback_in_stack", since === undefined ? {} : { since: rfc3339Seconds(since) }),
          traceId,
        );
      }
      // 5.4–5.8: the metered fallback.
      return this.callMetered(span, resolved, traceId, this.fallback, "fallback", reason);
    });
  }

  /**
   * The metered path with no local step (operator-admin.md §3.2, §5): the state read, then the named metered adapter
   * through the limits, admission (the ceilings only), the journal, the call, and the commit. It never fails over.
   */
  async meteredCall(
    call: GatewayCall,
    o: { attribution: Exclude<MeteredAttribution, "fallback">; adapterId: string },
  ): Promise<GatewayAnswer> {
    const routed = this.routed().find((r) => r.built.config.id === o.adapterId && r.built.adapter.kind !== "local");
    if (routed === undefined) throw new Error("no metered adapter of that ID is routed");
    return this.routeSpan(call, async (span, traceId) => {
      const read = await this.readState();
      span.setAttribute("h4.state", read.kind === "ok" ? read.state : "unknown");
      const early = stateDecision(read, { outageSince: this.opts.store.outageStartedAt() });
      if (early !== undefined) return this.degrade(span, early, traceId);
      return this.callMetered(span, resolveCall(call), traceId, routed, o.attribution, null);
    });
  }

  /**
   * One named adapter, called directly (operator-admin.md §5): the state read first; then a paid adapter through the
   * limits and admission as `test`, the ceilings only, with the journal, the call, and the commit; or the local
   * adapter, free, with no admission. It never fails over. Undefined for an ID that isn't this route's local or paid
   * adapter, a synthetic one included.
   */
  async adapterCall(call: GatewayCall, adapterId: string): Promise<AdapterCallAnswer | undefined> {
    const routed = this.routed().find((r) => r.built.config.id === adapterId && r.built.adapter.kind !== "synthetic");
    if (routed === undefined) return undefined;
    return this.routeSpan<AdapterCallAnswer>(call, async (span, traceId) => {
      const read = await this.readState();
      span.setAttribute("h4.state", read.kind === "ok" ? read.state : "unknown");
      const early = stateDecision(read, { outageSince: this.opts.store.outageStartedAt() });
      if (early !== undefined)
        return { kind: "degraded", decision: early, traceId: this.degrade(span, early, traceId).traceId };
      const resolved = resolveCall(call);
      if (routed.built.adapter.kind === "local") return this.localAdapterCall(span, resolved, traceId, routed);
      const step = await this.meteredAttempt(span, resolved, traceId, routed, "test", null);
      if ("early" in step) {
        if (step.early.kind === "degraded" || step.early.kind === "refused") return step.early;
        throw new Error("the metered path refused with an answer that isn't a refusal");
      }
      return {
        kind: "called",
        adapter: adapterId,
        attribution: "test",
        outcome: step.outcome,
        costMicro: step.settlement.costMicro,
        costBasis: basisOf(step.outcome.attempts),
        priceVersion: step.admitted.price.id,
        traceId,
        ledgerRef: step.admitted.reservationId,
      };
    });
  }

  /**
   * The live endpoint's local call: free, unmetered, and whatever the adapter's health, since the endpoint is how the
   * Author checks it. Its spans carry `local` and `local_healthy`, the one reason telemetry.md gives a local call.
   */
  private async localAdapterCall(
    span: Span,
    call: ResolvedCall,
    traceId: string,
    routed: Routed,
  ): Promise<AdapterCallAnswer> {
    const { built, health, requestTimeoutMs } = routed;
    const version = this.opts.prices.active(this.opts.clock.now());
    if (version === undefined) throw new Error("no active price version"); // startup refuses this (config-files.md §2.5)
    span.setAttributes({ "h4.route.decision": "local", "h4.route.reason": "local_healthy" });
    const req: CompletionRequest = {
      requestId: call.requestId,
      purpose: call.purpose,
      messages: call.messages,
      maxOutputTokens: call.maxOutputTokens,
      ...(call.temperature === undefined ? {} : { temperature: call.temperature }),
      deadline: call.arrivedAt + this.opts.routing.deadlineMs,
      signal: call.signal,
    };
    const outcome = await attemptCall(built.adapter, req, {
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
      onFailure: (err) => {
        if (!call.signal.aborted) health.callFailed(err);
      },
      ...(call.room === undefined ? {} : { room: call.room }),
    });
    const ids: string[] = [];
    for (const attempt of outcome.attempts) {
      const id = await this.recordLocal(attempt, call, traceId, version);
      if (id !== null) ids.push(id);
    }
    return {
      kind: "called",
      adapter: built.config.id,
      attribution: "none",
      outcome,
      costMicro: 0n,
      costBasis: "none",
      priceVersion: version.id,
      traceId,
      ledgerRef: ids.length > 0 ? ids.join(",") : null,
    };
  }

  /** GET /health (gateway-http.md §5): it reports, it doesn't gate, and it never calls a provider. */
  async report(): Promise<HealthReport> {
    const read = await this.readState();
    const ok = read.kind === "ok" ? read : undefined;
    // One reading of the real clock, so `time` and `real_time` differ by exactly the test clock's offset.
    const realNow = this.realNow();
    const gatewayNow = gatewayTime(realNow, this.opts.clock.offsetMs());
    // The fallback branch's dry run reads the current meters live, as admission would.
    let meters = this.meterView;
    if (ok?.state === "normal" && this.fallback !== undefined && !this.primary.health.status().healthy) {
      meters = await this.readMeterView().catch(() => this.meterView);
    }
    const cause = this.dryRun(read, meters);
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
      adapters: [
        ...this.routed().map((r) => adapterReport(r)),
        ...(this.opts.disabled ?? []).map((d) => disabledReport(d, this.disabledAt)),
      ],
      journal: this.opts.journalStatus?.() ?? "unknown",
      config: { routing_sha: this.opts.routing.sha256, price_version: this.opts.prices.active(gatewayNow)?.id ?? null },
      test_machinery: { ...this.opts.testMachinery, clock_offset_ms: this.opts.clock.offsetMs() },
    };
  }

  /**
   * Whether the store reads now, stack_state's row among it (spec 001 FR-054): what GET /health/serving answers with.
   * The same live read as report's, with the store's timeouts.
   */
  async storeReadable(): Promise<boolean> {
    return (await this.readState()).kind === "ok";
  }

  /** The cause a hello arriving now would get, with no reservation and no provider call. */
  private dryRun(read: StateRead, meters: MeterView | undefined = this.meterView): DegradedCause | null {
    const t = thresholds(this.opts.budgets.envs[this.opts.envClass]);
    return wouldDegrade({
      read,
      local: { healthy: this.primary.health.status().healthy },
      hasFallback: this.fallback !== undefined,
      ...(this.opts.paidRoute === true ? { metered: true } : {}),
      ...(this.fallback === undefined
        ? {}
        : {
            fallback: {
              // A trial in flight holds the next fallback call (§6 item 5).
              healthy: this.fallback.health.status().healthy && this.fallback.health.wouldAdmit(),
              ceilings: { day: t.dayCeiling, month: t.monthCeiling },
              journalUnwritable: this.opts.journalStatus?.() === "unwritable",
              ...(meters === undefined ? {} : { meters }),
            },
          }),
    });
  }

  private routed(): Routed[] {
    return this.fallback === undefined ? [this.primary] : [this.primary, this.fallback];
  }

  /** The gateway.route span of one routing decision; a call of its own trace starts a root span, linked to its caller. */
  private routeSpan<T>(call: GatewayCall, fn: (span: Span, traceId: string) => Promise<T>): Promise<T> {
    const attributes: Attributes = {
      "h4.stack": this.opts.stack,
      "h4.routing.sha": this.opts.routing.sha256,
      ...(call.room === undefined ? {} : { "h4.room.feature": call.room.feature, "h4.room.topic": call.room.topic }),
    };
    const caller = trace.getSpan(context.active())?.spanContext();
    const options =
      call.newTrace === true
        ? {
            kind: SpanKind.INTERNAL,
            attributes,
            root: true,
            ...(caller !== undefined && isSpanContextValid(caller) ? { links: [{ context: caller }] } : {}),
          }
        : { kind: SpanKind.INTERNAL, attributes };
    return this.opts.tracer.startActiveSpan("gateway.route", options, async (span) => {
      try {
        return await fn(span, traceIdOf(span));
      } finally {
        span.end();
      }
    });
  }

  private degrade(span: Span, decision: Degraded, traceId: string): GatewayAnswer {
    span.setAttributes({
      "h4.route.decision": "degraded",
      "h4.route.reason": decision.cause,
      "h4.degraded.cause": decision.cause,
    });
    return { kind: "degraded", decision, traceId };
  }

  /**
   * A metered call (gateway-http.md §2.4 steps 5.4–5.8): the limits in memory and admission (the meter), then the call
   * within the request's remaining deadline, at the reservation's price version, then the commit. A failed call is
   * committed at its cost basis and answers fallback_unavailable.
   */
  private async callMetered(
    span: Span,
    call: ResolvedCall,
    traceId: string,
    routed: Routed,
    attribution: MeteredAttribution,
    routeReason: RouteReason | null,
  ): Promise<GatewayAnswer> {
    const step = await this.meteredAttempt(span, call, traceId, routed, attribution, routeReason);
    if ("early" in step) return step.early;
    if (!step.outcome.ok) return this.degrade(span, degraded("fallback_unavailable"), traceId);
    return {
      kind: "answered",
      route: step.decision.kind,
      routeReason: step.decision.kind === "fallback" ? step.decision.reason : null,
      provider: routed.built.adapter.provider,
      result: step.outcome.result,
      costMicro: step.settlement.costMicro,
      priceVersion: step.admitted.price.id,
      traceId,
    };
  }

  /**
   * The metered path up to the commit: the limits and admission, which refuse with an early answer, then the attempts
   * under the retry policy and their settlement. callMetered answers hello from it, and adapterCall the live endpoint.
   */
  private async meteredAttempt(
    span: Span,
    call: ResolvedCall,
    traceId: string,
    routed: Routed,
    attribution: MeteredAttribution,
    routeReason: RouteReason | null,
  ): Promise<
    | { early: GatewayAnswer }
    | {
        outcome: AttemptOutcome;
        settlement: Settlement;
        admitted: Admitted;
        decision: { kind: "fallback"; reason: RouteReason } | { kind: "metered"; reason: MeteredAttribution };
      }
  > {
    const meter = this.opts.meter;
    if (meter === undefined) throw new Error("a metered call needs the meter");
    const adapter = routed.built.adapter;
    const decision =
      attribution === "fallback"
        ? { kind: "fallback" as const, reason: routeReason ?? "local_unhealthy" }
        : { kind: "metered" as const, reason: attribution };
    span.setAttributes({ "h4.route.decision": decision.kind, "h4.route.reason": decision.reason });
    // A fallback call passes the circuit first (§6 item 5): while it's half-open, as the trial. Whatever follows, the
    // call's end is the circuit's to count, and gives the trial back; a test call goes by the ceilings alone, as
    // health doesn't hold it.
    const pass = attribution === "fallback" ? routed.health.admitCall() : { allowed: true, trial: false };
    const { trial } = pass;
    let outcome: AttemptOutcome | undefined;
    let callerGone = false;
    try {
      const unhealthySince = routed.health.unhealthySince();
      const admit = await meter.admit({
        attribution,
        adapter: {
          id: routed.built.config.id,
          provider: adapter.provider,
          model: adapter.model,
          ...(adapter.fixedUsage === undefined ? {} : { fixedUsage: adapter.fixedUsage }),
        },
        adapterHealthy: routed.health.status().healthy && pass.allowed,
        ...(unhealthySince === undefined ? {} : { adapterUnhealthySince: unhealthySince }),
        maxOutputTokens: call.maxOutputTokens,
        ...(call.maxInputChars === undefined ? {} : { maxInputChars: call.maxInputChars }),
        ...(call.room === undefined ? {} : { room: call.room }),
        ...(attribution === "fallback" && call.clientKey !== undefined ? { clientKey: call.clientKey } : {}),
        requestId: call.requestId,
        traceId,
        purpose: call.purpose,
        routeReason: attribution === "fallback" ? routeReason : null,
      });
      if (!admit.ok) {
        if (admit.refusal === "degraded") return { early: this.degrade(span, admit.decision, traceId) };
        return {
          early: {
            kind: "refused",
            route: decision.kind,
            error: admit.error,
            limit: admit.limit,
            retryAfterS: admit.retryAfterS,
            traceId,
          },
        };
      }
      const a = admit.admitted;
      span.setAttribute("h4.meter.attribution", attribution);
      // A twin turn on a paid adapter with twin_request_ms: one attempt of that length, on the visitor's route and the
      // admin route alike; every other call keeps the adapter's request_ms and retry policy (spec 007's plan, D43).
      const twinMs = call.purpose === "twin" ? routed.twinRequestMs : undefined;
      const req: CompletionRequest = {
        requestId: call.requestId,
        purpose: call.purpose,
        messages: call.messages,
        maxOutputTokens: call.maxOutputTokens,
        ...(call.temperature === undefined ? {} : { temperature: call.temperature }),
        deadline: call.arrivedAt + this.opts.routing.deadlineMs,
        signal: call.signal,
        ...(twinMs === undefined ? {} : { requestMs: twinMs }),
      };
      const label = call.clientLabel === undefined ? {} : { clientLabel: call.clientLabel };
      // The call, then its settlement, on every way out: the meter prices it from how it ended (data-model.md §7.3),
      // and gives its slots back. If the code around the call fails, nobody knows what the provider did, and the meter
      // charges the call its maximum.
      let settlement: Settlement;
      try {
        outcome = await attemptCall(adapter, req, {
          tracer: this.opts.tracer,
          stack: this.opts.stack,
          routingSha: this.opts.routing.sha256,
          priceVersion: a.price,
          decision,
          attribution,
          maxMicro: a.maxMicro,
          payloadSampling: this.opts.payloadSampling,
          requestTimeoutMs: twinMs ?? routed.requestTimeoutMs,
          ...(twinMs === undefined ? {} : { retryMax: 0 }),
          realNow: this.realNow,
          metrics: this.opts.metrics,
          // A caller that went away ends the call with timeout too, and that says nothing about the adapter.
          onFailure: (err) => {
            if (!call.signal.aborted) routed.health.callFailed(err);
          },
          ...(call.room === undefined ? {} : { room: call.room }),
        });
        callerGone = call.signal.aborted;
      } finally {
        const end: CallEnd =
          outcome === undefined ? { unknown: true, at: this.realNow() } : { attempts: outcome.attempts };
        settlement = await meter.settle(a, end, label);
      }
      // The commit is retried in the background; the answer doesn't wait (gateway-http.md §2.4, notes).
      if (!settlement.committed) span.setAttribute("h4.meter.commit", "pending");
      return { outcome, settlement, admitted: a, decision };
    } finally {
      routed.health.callEnded(outcome, { trial, callerGone });
    }
  }

  /** The local call (§2.4 step 5.1): free, unmetered, within its own timeouts and the request's deadline. */
  private async callLocal(call: ResolvedCall, traceId: string): Promise<GatewayAnswer | "failed_over"> {
    const { built, health, requestTimeoutMs } = this.primary;
    const adapter = built.adapter;
    const version = this.opts.prices.active(this.opts.clock.now());
    if (version === undefined) throw new Error("no active price version"); // startup refuses this (config-files.md §2.5)
    const req: CompletionRequest = {
      requestId: call.requestId,
      purpose: call.purpose,
      messages: call.messages,
      maxOutputTokens: call.maxOutputTokens,
      ...(call.temperature === undefined ? {} : { temperature: call.temperature }),
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
      ...(call.room === undefined ? {} : { room: call.room }),
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
    call: ResolvedCall,
    traceId: string,
    version: PriceVersion,
  ): Promise<string | null> {
    const adapter = this.primary.built.adapter;
    const offset = this.opts.clock.offsetMs();
    const id = randomUUID();
    let written = false;
    const startedAt = gatewayTime(attempt.startedAt, offset);
    const periods = periodKeys(startedAt);
    const ok = attempt.outcome === "ok" ? attempt.result : undefined;
    const error = attempt.outcome === "error" ? attempt.error : undefined;
    const latencyMs = ok?.latencyMs ?? Math.max(0, Math.round(attempt.endedAt - attempt.startedAt));
    try {
      await this.opts.store.query(LOCAL_LEDGER_ROW, [
        id,
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
        call.room?.feature ?? null,
        call.room?.topic ?? null,
      ]);
      this.opts.metrics.cost(0n, {
        provider: adapter.provider,
        model: adapter.model,
        attribution: "none",
        ...(call.room === undefined ? {} : { feature: call.room.feature }),
      });
      written = true;
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
    return written ? id : null;
  }

  /**
   * A paid fallback adapter's effective health turned unhealthy for one of alerts.md §2's reasons, credentials or the
   * circuit: the fallback_unavailable alert, which the outbox's hourly dedupe key holds to one an hour per adapter
   * (data-model.md §7.7). A transient failure, a timeout or a refused connection, alerts through the circuit once it
   * opens. Only prod routes a paid adapter.
   */
  private turnedUnhealthy(built: BuiltAdapter, health: AdapterHealth): void {
    if (built.role !== "fallback" || built.config.kind !== "paid") return;
    const reason = health.status().reason;
    if (reason !== "credentials" && reason !== "circuit_open") return;
    this.onFallbackUnavailable?.(built.config.id, reason);
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
    this.gauges = { ...this.gauges, adapters: this.adapterGauges() };
    this.opts.metrics.setSnapshot(this.gauges);
  }

  /** The current periods' meters, read now: spend plus reservations, as admission counts them. */
  private async readMeterView(): Promise<MeterView> {
    const { day, month } = this.opts.clock.periodKeys();
    return meterViewOf(
      await this.opts.store.readMeters(day, month),
      this.opts.budgets.envs[this.opts.envClass],
      this.fallback?.built.config.id,
    );
  }

  /**
   * The gauges' refresh, every 10 s and as soon as a commit, an operator write, or a sweep commits (telemetry.md §4.1):
   * the state read, and the current periods' meters in USD. The dry run's view of the meters follows them.
   */
  async refreshGauges(): Promise<void> {
    const read = await this.readState();
    if (read.kind !== "ok") return;
    const { day, month } = this.opts.clock.periodKeys();
    let rows: MeterRow[];
    try {
      rows = await this.opts.store.readMeters(day, month);
    } catch {
      delete this.gauges.meters;
      delete this.gauges.studioWindow;
      delete this.gauges.adapterMonths;
      this.meterView = undefined;
      this.opts.metrics.setSnapshot(this.gauges);
      return;
    }
    // spec 003's studio GPU window, from the store, so a gateway restarted inside one still reads it open. A read that
    // fails leaves its series stale, as the meters' do, and the meters as read.
    let studioWindow: boolean | undefined;
    try {
      studioWindow = await this.opts.store.readStudioWindow();
    } catch {
      studioWindow = undefined;
    }
    this.meterView = meterViewOf(rows, this.opts.budgets.envs[this.opts.envClass], this.fallback?.built.config.id);
    this.gauges = { ...this.gauges, cause: this.dryRun(read) ?? "none" };
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
    if (studioWindow === undefined) delete this.gauges.studioWindow;
    else this.gauges.studioWindow = studioWindow;
    // Spec 010 (FR-035): each capped adapter the route names, its month's spend beside its cap and warning.
    const months = this.routed().flatMap((r) => {
      const id = r.built.config.id;
      const cap = t.adapterCaps.get(id);
      if (cap === undefined) return [];
      const row = rows.find((x) => x.meter === "adapter_month" && x.periodKey === `${id}:${month}`);
      return [{ adapter: id, spentMicro: row?.spentMicro ?? 0n, capMicro: cap.cap, warnMicro: cap.warn }];
    });
    if (months.length === 0) delete this.gauges.adapterMonths;
    else this.gauges.adapterMonths = months;
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

/**
 * The current periods' levels, spend plus reservations, for the dry run; a period with no row yet is 0 and a full
 * grant. With a capped fallback adapter, its month's level and cap too (spec 010, FR-022).
 */
function meterViewOf(rows: readonly MeterRow[], env: BudgetEnv, fallbackId?: string): MeterView {
  const row = (meter: MeterRow["meter"]) => rows.find((r) => r.meter === meter);
  const level = (r: MeterRow | undefined): bigint => (r === undefined ? 0n : r.spentMicro + r.reservedMicro);
  const t = thresholds(env);
  const cap = fallbackId === undefined ? undefined : t.adapterCaps.get(fallbackId);
  const month = rows.find((r) => r.meter === "adapter_month" && r.periodKey.startsWith(`${fallbackId}:`));
  return {
    dayLevel: level(row("day")),
    monthLevel: level(row("month")),
    fallbackLevel: level(row("fallback_day")),
    allowance: row("fallback_day")?.allowanceMicro ?? t.fallbackGrant,
    ...(cap === undefined ? {} : { adapterMonth: { level: level(month), cap: cap.cap } }),
  };
}

/** A switched-off adapter in GET /health: configured, never built, so `disabled` since the route was built. */
function disabledReport(d: { role: "primary" | "fallback"; config: AdapterConfig }, since: number): AdapterReport {
  return {
    id: d.config.id,
    role: d.role,
    provider: d.config.provider,
    kind: d.config.kind,
    // The switched-off adapter is the synthetic one, whose model is in its settings and reads no environment.
    model: d.config.spec.model(d.config.settings, {}) ?? "unknown",
    healthy: false,
    reason: "disabled",
    checked_at: rfc3339Seconds(since),
  };
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
