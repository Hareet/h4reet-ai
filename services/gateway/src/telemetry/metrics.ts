// The gateway's metric instruments (contracts/telemetry.md §4.1, §4.2): exactly these names, units, and attribute
// keys, which the dashboard and the breach test's M assertions query by their Prometheus forms.
//
// Every recorder builds its attributes itself, from typed arguments whose values come from configuration or a
// closed list, so nothing request-specific, and no client address or label, can become a metric attribute (§1).
import { ValueType, type Attributes, type Meter, type ObservableResult } from "@opentelemetry/api";

import type { Attribution, DegradedCause } from "../core/types.js";

/** Every `s` histogram the gateway records (§4.1), up to 120 s. */
export const SECONDS_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120,
];
export const DELIVERY_LAG_BUCKETS: readonly number[] = [1, 5, 10, 20, 30, 60, 120, 180, 240, 300, 600];
/** The conventions' advice, cut at the stack's context size (§4.2). */
export const TOKEN_BUCKETS: readonly number[] = [1, 4, 16, 64, 256, 1_024, 4_096, 16_384, 65_536];

export const DEGRADED_CAUSES: readonly DegradedCause[] = [
  "store_unreachable",
  "store_uninitialized",
  "kill_switch_tripped",
  "no_fallback_in_stack",
  "meter_at_ceiling",
  "fallback_awaiting_renewal",
  "fallback_spent_today",
  "fallback_unavailable",
  "journal_unwritable",
];

export type RouteDecisionAttribute = "local" | "fallback" | "metered" | "degraded" | "none";
export type RequestOutcome = "ok" | "degraded" | "refused" | "invalid" | "error";
export type AlertChannel = "telegram" | "email";
export type AlertKind =
  | "warn"
  | "trip"
  | "fallback_exhausted"
  | "operator_action"
  | "credentials_expiring"
  | "fallback_unavailable"
  | "auth_failed"
  | "store_unreachable"
  | "reminder";
export type AlertOutcome = "delivered" | "retry" | "failed";
export type OperatorAction = "init" | "reset" | "renew" | "test_clock" | "test_synthetic" | "adapter_call";
export type AuthFailureClass = "missing" | "malformed" | "wrong_prefix" | "mismatch";

export interface MeterGauge {
  spentMicro: bigint;
  ceilingMicro: bigint;
  warnMicro: bigint;
}

/**
 * What the gauges report: an in-process snapshot, never the store (§4.1). The 10 s task refreshes it, and a commit,
 * an operator write, or a sweep replaces what it changed as soon as its transaction commits.
 */
export interface GaugeSnapshot {
  /** The kill switch as last read. An unreachable or empty store reports degraded: unknown counts as degraded. */
  killSwitch: "normal" | "degraded";
  /** The cause a hello arriving now would get, or none. */
  cause: DegradedCause | "none";
  /** Absent while the store can't be read: those series go stale, and the freshness panel shows the gap. */
  meters?: {
    day: MeterGauge;
    month: MeterGauge;
    /** The ceiling is today's allowance. */
    fallbackDay: { spentMicro: bigint; allowanceMicro: bigint; warnMicro: bigint };
  };
  fallbackAwaitingRenewal?: boolean;
  adapters: readonly { id: string; healthy: boolean }[];
}

const usd = (micro: bigint): number => Number(micro) / 1_000_000;

export interface CallAttributes {
  provider: string;
  requestModel: string;
  responseModel?: string;
}

export class GatewayMetrics {
  /** Before the first read, the store's state is unknown, which counts as degraded. */
  private snapshot: GaugeSnapshot = { killSwitch: "degraded", cause: "store_unreachable", adapters: [] };

  private readonly requests;
  private readonly requestDuration;
  private readonly costUsd;
  private readonly degradedResponses;
  private readonly alerts;
  private readonly deliveryLag;
  private readonly operatorActions;
  private readonly authFailures;
  private readonly testMachineryRefusals;
  private readonly tokens;
  private readonly operationDurations;

  constructor(meter: Meter) {
    const seconds = { unit: "s", advice: { explicitBucketBoundaries: [...SECONDS_BUCKETS] } };
    this.requests = meter.createCounter("h4.gateway.requests", { unit: "{request}" });
    this.requestDuration = meter.createHistogram("h4.gateway.request.duration", seconds);
    this.costUsd = meter.createCounter("h4.cost.usd", { unit: "{USD}", valueType: ValueType.DOUBLE });
    this.degradedResponses = meter.createCounter("h4.degraded.responses", { unit: "{response}" });
    this.alerts = meter.createCounter("h4.alerts", { unit: "{attempt}" });
    this.deliveryLag = meter.createHistogram("h4.alert.delivery_lag", {
      unit: "s",
      advice: { explicitBucketBoundaries: [...DELIVERY_LAG_BUCKETS] },
    });
    this.operatorActions = meter.createCounter("h4.operator.actions", { unit: "{action}" });
    this.authFailures = meter.createCounter("h4.operator.auth_failures", { unit: "{failure}" });
    this.testMachineryRefusals = meter.createCounter("h4.test_machinery.refused", { unit: "{request}" });
    this.tokens = meter.createHistogram("gen_ai.client.token.usage", {
      unit: "{token}",
      valueType: ValueType.INT,
      advice: { explicitBucketBoundaries: [...TOKEN_BUCKETS] },
    });
    this.operationDurations = meter.createHistogram("gen_ai.client.operation.duration", seconds);

    const gauge = (name: string, unit: string, observe: (result: ObservableResult, s: GaugeSnapshot) => void) =>
      meter.createObservableGauge(name, { unit }).addCallback((result) => observe(result, this.snapshot));
    gauge("h4.meter.spend_usd", "{USD}", (r, s) => {
      if (!s.meters) return;
      r.observe(usd(s.meters.day.spentMicro), { "h4.meter": "day" });
      r.observe(usd(s.meters.month.spentMicro), { "h4.meter": "month" });
      r.observe(usd(s.meters.fallbackDay.spentMicro), { "h4.meter": "fallback_day" });
    });
    gauge("h4.meter.ceiling_usd", "{USD}", (r, s) => {
      if (!s.meters) return;
      r.observe(usd(s.meters.day.ceilingMicro), { "h4.meter": "day" });
      r.observe(usd(s.meters.month.ceilingMicro), { "h4.meter": "month" });
      r.observe(usd(s.meters.fallbackDay.allowanceMicro), { "h4.meter": "fallback_day" });
    });
    gauge("h4.meter.warn_usd", "{USD}", (r, s) => {
      if (!s.meters) return;
      r.observe(usd(s.meters.day.warnMicro), { "h4.meter": "day" });
      r.observe(usd(s.meters.month.warnMicro), { "h4.meter": "month" });
      r.observe(usd(s.meters.fallbackDay.warnMicro), { "h4.meter": "fallback_day" });
    });
    gauge("h4.fallback.allowance_usd", "{USD}", (r, s) => {
      if (s.meters) r.observe(usd(s.meters.fallbackDay.allowanceMicro));
    });
    gauge("h4.fallback.awaiting_renewal", "{flag}", (r, s) => {
      if (s.meters && s.fallbackAwaitingRenewal !== undefined) r.observe(s.fallbackAwaitingRenewal ? 1 : 0);
    });
    gauge("h4.kill_switch.state", "{state}", (r, s) => {
      r.observe(s.killSwitch === "normal" ? 1 : 0, { "h4.state": "normal" });
      r.observe(s.killSwitch === "degraded" ? 1 : 0, { "h4.state": "degraded" });
    });
    gauge("h4.degraded.cause", "{cause}", (r, s) => {
      for (const cause of ["none", ...DEGRADED_CAUSES] as const)
        r.observe(s.cause === cause ? 1 : 0, { "h4.cause": cause });
    });
    gauge("h4.adapter.healthy", "{flag}", (r, s) => {
      for (const a of s.adapters) r.observe(a.healthy ? 1 : 0, { "h4.adapter": a.id });
    });
  }

  setSnapshot(snapshot: GaugeSnapshot): void {
    this.snapshot = snapshot;
  }

  /** Once per hello, test-synthetic, or adapter call, when its response is sent. */
  request(decision: RouteDecisionAttribute, outcome: RequestOutcome, seconds: number): void {
    this.requests.add(1, { "h4.route.decision": decision, "h4.outcome": outcome });
    this.requestDuration.record(seconds, { "h4.route.decision": decision });
  }

  /** When a ledger row commits, by its cost: 0 for local calls, and an expired reservation's settlement too. */
  cost(micro: bigint, a: { provider: string; model: string; attribution: Attribution }): void {
    this.costUsd.add(usd(micro), {
      "gen_ai.provider.name": a.provider,
      "gen_ai.request.model": a.model,
      "h4.meter.attribution": a.attribution,
    });
  }

  degradedResponse(cause: DegradedCause): void {
    this.degradedResponses.add(1, { "h4.cause": cause });
  }

  alertAttempt(a: { channel: AlertChannel; kind: AlertKind; outcome: AlertOutcome }): void {
    this.alerts.add(1, { "h4.channel": a.channel, "h4.alert.kind": a.kind, "h4.outcome": a.outcome });
  }

  alertDeliveryLag(seconds: number): void {
    this.deliveryLag.record(seconds);
  }

  operatorAction(action: OperatorAction): void {
    this.operatorActions.add(1, { "h4.action": action });
  }

  operatorAuthFailure(cls: AuthFailureClass): void {
    this.authFailures.add(1, { "h4.auth.class": cls });
  }

  testMachineryRefused(): void {
    this.testMachineryRefusals.add(1);
  }

  /** Once per token type, per successful attempt. */
  tokenUsage(tokens: number, a: CallAttributes & { tokenType: "input" | "output" }): void {
    this.tokens.record(tokens, { ...genAi(a), "gen_ai.token.type": a.tokenType });
  }

  /** Once per attempt: server.address always; the response model on success; error.type on failure. */
  operationDuration(seconds: number, a: CallAttributes & { server: string; errorType?: string }): void {
    const attributes: Attributes = { ...genAi(a), "server.address": a.server };
    if (a.errorType !== undefined) attributes["error.type"] = a.errorType;
    this.operationDurations.record(seconds, attributes);
  }
}

function genAi(a: CallAttributes): Attributes {
  const attributes: Attributes = {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": a.provider,
    "gen_ai.request.model": a.requestModel,
  };
  if (a.responseModel !== undefined) attributes["gen_ai.response.model"] = a.responseModel;
  return attributes;
}
