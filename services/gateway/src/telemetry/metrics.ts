// The gateway's metric instruments (contracts/telemetry.md §4.1, §4.2): exactly these names, units, and attribute
// keys, which the dashboard and the breach test's M assertions query by their Prometheus forms.
//
// Every recorder builds its attributes itself, from typed arguments whose values come from configuration or a
// closed list, so nothing request-specific, and no client address or label, can become a metric attribute (§1).
import { ValueType, type Attributes, type Meter, type ObservableResult } from "@opentelemetry/api";

import { FALLBACK_REASONS, type FallbackReason } from "../alerts/forms.js";
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
  "adapter_month_spent",
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
/** h4.alert.kind's values: the real kinds, and a sample's attempts, counted apart (spec 011, FR-037). */
export type AlertMetricKind = AlertKind | "sample";
/** Each attempt's form (spec 011, FR-044): none for a channel marked failed at its window's end, with no attempt. */
export type AlertFormAttribute = "designed" | "plain" | "none";
const ALERT_FORMS: readonly AlertFormAttribute[] = ["designed", "plain", "none"];
export type OperatorAction =
  | "init"
  | "reset"
  | "renew"
  | "test_clock"
  | "test_synthetic"
  | "adapter_call"
  // spec 003's studio GPU window (its contracts/gpu-window.md §1, §5)
  | "studio_window"
  // spec 007's evaluation calls (its Amendment 0-4; contracts/operator-admin.md §8)
  | "twin_call"
  // spec 011's alert samples (its Amendment 0-8; contracts/operator-admin.md §2.4)
  | "alert_samples";
export type AuthFailureClass = "missing" | "malformed" | "wrong_prefix" | "mismatch";
/** Why POST /room/events refused an event (spec 002, contracts/room-events.md §3). */
export type RoomEventRefusal = "content_type" | "shape" | "kind" | "id";

/** A turn's outcome on POST /room/turn (spec 007, plan §9), the server span's h4.outcome and h4.twin.turns'. */
export const TWIN_OUTCOMES = ["ok", "withheld", "degraded", "refused", "not_ready", "invalid", "error"] as const;
export type TwinOutcome = (typeof TWIN_OUTCOMES)[number];
/** A turn's cause: spec 000's nine, the turn route's own twin_unavailable, or none. */
export const TWIN_CAUSES = [...DEGRADED_CAUSES, "twin_unavailable", "none"] as const;
export type TwinCause = (typeof TWIN_CAUSES)[number];
/** The guards' names, h4.twin.withheld's h4.twin.guard (spec 007, plan §5, §9): each answer withheld, replaced, or
 *  repaired, by guard. `repair_opener` (D34) counts an answer delivered without its opening agreement, and one withheld
 *  because agreement was all it said; the turn's outcome, ok or withheld, tells them apart (D36). */
export const TWIN_GUARDS = [
  "length",
  "numbers",
  "amounts",
  "disclosure",
  "prompt",
  "secrets",
  "links",
  "ownership",
  "seva",
  "location",
  "surname",
  "privacy",
  "agents_share",
  "repair_opener",
  "error",
  "refusal",
] as const;
export type TwinGuard = (typeof TWIN_GUARDS)[number];
const DECISIONS: readonly RouteDecisionAttribute[] = ["local", "fallback", "metered", "degraded", "none"];
/** A room feature as a metric attribute: a selectable's ID or free_talk from the twin's pack, which bounds it, or none. */
const featureOf = (feature: string | undefined): string =>
  feature !== undefined && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(feature) ? feature : "none";
const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  (list as readonly unknown[]).includes(value) ? (value as T) : fallback;

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
  /**
   * Whether a studio GPU window is open (spec 003's contracts/gpu-window.md §1). Absent while the store can't be read,
   * as the meters are: its series goes stale rather than read closed.
   */
  studioWindow?: boolean;
  adapters: readonly { id: string; healthy: boolean }[];
  /**
   * Each capped paid adapter the route names: its current UTC month's committed spend, its cap, and its warning (spec
   * 010, FR-035). Absent while the store can't be read, as the meters are.
   */
  adapterMonths?: readonly { adapter: string; spentMicro: bigint; capMicro: bigint; warnMicro: bigint }[];
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
  private readonly alertFallbacks;
  private readonly deliveryLag;
  private readonly operatorActions;
  private readonly authFailures;
  private readonly testMachineryRefusals;
  private readonly tokens;
  private readonly operationDurations;
  private readonly roomEvents;
  private readonly roomEventsRefused;
  private readonly twinTurns;
  private readonly twinTurnDuration;
  private readonly twinWithheldAnswers;

  constructor(meter: Meter) {
    const seconds = { unit: "s", advice: { explicitBucketBoundaries: [...SECONDS_BUCKETS] } };
    this.requests = meter.createCounter("h4.gateway.requests", { unit: "{request}" });
    this.requestDuration = meter.createHistogram("h4.gateway.request.duration", seconds);
    this.costUsd = meter.createCounter("h4.cost.usd", { unit: "{USD}", valueType: ValueType.DOUBLE });
    this.degradedResponses = meter.createCounter("h4.degraded.responses", { unit: "{response}" });
    this.alerts = meter.createCounter("h4.alerts", { unit: "{attempt}" });
    // Spec 011 (plan §9.1): each attempt that sent the plain form in the designed one's place.
    this.alertFallbacks = meter.createCounter("h4.alert.fallbacks", { unit: "{fallback}" });
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
    this.roomEvents = meter.createCounter("h4.room.events", { unit: "{event}" });
    this.roomEventsRefused = meter.createCounter("h4.room.events.refused", { unit: "{event}" });
    // Spec 007's turns (its plan §9; telemetry.md §4.1, amended).
    this.twinTurns = meter.createCounter("h4.twin.turns", { unit: "{turn}" });
    this.twinTurnDuration = meter.createHistogram("h4.twin.turn.duration", seconds);
    this.twinWithheldAnswers = meter.createCounter("h4.twin.withheld", { unit: "{answer}" });

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
    // Spec 010 (FR-035; plan §9): each capped, routed paid adapter's month beside its cap and its warning, under names of
    // their own, so h4.meter.* keeps its one label.
    gauge("h4.adapter.month_spend_usd", "{USD}", (r, s) => {
      for (const a of s.adapterMonths ?? []) r.observe(usd(a.spentMicro), { "h4.adapter": a.adapter });
    });
    gauge("h4.adapter.month_cap_usd", "{USD}", (r, s) => {
      for (const a of s.adapterMonths ?? []) r.observe(usd(a.capMicro), { "h4.adapter": a.adapter });
    });
    gauge("h4.adapter.month_warn_usd", "{USD}", (r, s) => {
      for (const a of s.adapterMonths ?? []) r.observe(usd(a.warnMicro), { "h4.adapter": a.adapter });
    });
    // spec 003's studio GPU window: no attribute, since the stack is the resource's (its gpu-window.md §1).
    gauge("h4.studio.window", "{flag}", (r, s) => {
      if (s.studioWindow !== undefined) r.observe(s.studioWindow ? 1 : 0);
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

  /** When a ledger row commits, by its cost: 0 for local calls, and an expired reservation's settlement too. A twin
   *  call's row carries its room feature (spec 007, Amendment 0-5); every other row is `none`. */
  cost(micro: bigint, a: { provider: string; model: string; attribution: Attribution; feature?: string }): void {
    this.costUsd.add(usd(micro), {
      "gen_ai.provider.name": a.provider,
      "gen_ai.request.model": a.model,
      "h4.meter.attribution": a.attribution,
      "h4.room.feature": featureOf(a.feature),
    });
  }

  /** Once per POST /room/turn, when its response is sent (spec 007, FR-044): by feature, outcome, and cause, and its
   *  time from arrival by feature and routing decision. Every value from its bounded list. */
  twinTurn(o: {
    feature: string;
    outcome: TwinOutcome;
    cause: TwinCause;
    decision: RouteDecisionAttribute;
    seconds: number;
  }): void {
    const feature = featureOf(o.feature);
    this.twinTurns.add(1, {
      "h4.room.feature": feature,
      "h4.outcome": oneOf(TWIN_OUTCOMES, o.outcome, "error"),
      "h4.cause": oneOf(TWIN_CAUSES, o.cause, "none"),
    });
    this.twinTurnDuration.record(o.seconds, {
      "h4.room.feature": feature,
      "h4.route.decision": oneOf(DECISIONS, o.decision, "none"),
    });
  }

  /** Once per answer the turn route withholds or replaces, by its guard (spec 007, FR-044). */
  twinWithheld(guard: TwinGuard): void {
    this.twinWithheldAnswers.add(1, { "h4.twin.guard": oneOf(TWIN_GUARDS, guard, "error") });
  }

  degradedResponse(cause: DegradedCause): void {
    this.degradedResponses.add(1, { "h4.cause": cause });
  }

  /** Once per attempt, and once for a channel marked failed at its window's end (form none). */
  alertAttempt(a: {
    channel: AlertChannel;
    kind: AlertMetricKind;
    outcome: AlertOutcome;
    form: AlertFormAttribute;
  }): void {
    this.alerts.add(1, {
      "h4.channel": a.channel,
      "h4.alert.kind": a.kind,
      "h4.outcome": a.outcome,
      "h4.alert.form": oneOf(ALERT_FORMS, a.form, "none"),
    });
  }

  /** Once per attempt that sent the plain form in the designed one's place, by its reason (spec 011, FR-045). */
  alertFallback(a: { channel: AlertChannel; kind: AlertMetricKind; reason: FallbackReason }): void {
    this.alertFallbacks.add(1, {
      "h4.channel": a.channel,
      "h4.alert.kind": a.kind,
      "h4.alert.fallback_reason": oneOf(FALLBACK_REASONS, a.reason, "render_failed"),
    });
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

  /**
   * Once per usage event POST /room/events accepts (spec 002, FR-054). The kind and the ID are the event's own, after
   * the route has found both in config/room-events.yaml, which bounds them; `-` for a kind that takes no ID.
   */
  roomEvent(kind: string, id: string): void {
    this.roomEvents.add(1, { kind, id });
  }

  /** Once per usage event POST /room/events refuses, by its reason. */
  roomEventRefused(reason: RoomEventRefusal): void {
    this.roomEventsRefused.add(1, { reason });
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
