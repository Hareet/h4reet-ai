// The routing decision's pure parts (FR-022; contracts/gateway-http.md §2.4, §3): what the state read alone decides,
// the fixed text of every degraded cause, and the read-only dry run that GET /health and the cause gauge report.
// Gateway.complete (gateway.ts) runs the decision for real, calling adapters; nothing here names a provider.
import type { StateRead } from "../meter/store.js";
import type { DegradedCause, RouteDecision } from "./types.js";

export type Degraded = Extract<RouteDecision, { kind: "degraded" }>;

/** §3's fixed detail texts. They never carry a payload, a client identifier, or a secret. */
export const DEGRADED_DETAIL: Readonly<Record<DegradedCause, string>> = {
  store_unreachable: "The kill-switch store can't be read, so the stack fails closed.",
  store_uninitialized: "The kill-switch store is empty. The operator must initialize it: make operator-init.",
  kill_switch_tripped:
    "The kill switch set degraded when a spending ceiling was reached. Only an operator reset restores service.",
  no_fallback_in_stack: "The local model is unavailable, and this stack has no fallback.",
  meter_at_ceiling:
    "The local model is unavailable, and metered calls are refused while a meter is at or above its ceiling.",
  adapter_month_spent: "The local model is unavailable, and the paid fallback has reached its monthly cap.",
  fallback_awaiting_renewal:
    "The local model is unavailable, and the fallback sub-budget ran out. It stays refused until the operator renews it.",
  fallback_spent_today:
    "The local model is unavailable, and calls in flight hold the rest of today's fallback sub-budget.",
  fallback_unavailable: "The local model is unavailable, and so is the fallback.",
  journal_unwritable:
    "The local model is unavailable, and metered calls are refused because the call journal can't be written.",
};

/** RFC 3339 in UTC to the second, as the contracts show event times: 2026-10-29T16:40:03Z. */
export function rfc3339Seconds(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19)}Z`;
}

export function degraded(
  cause: DegradedCause,
  extra: { ceilings?: ("day" | "month")[]; since?: string } = {},
): Degraded {
  return {
    kind: "degraded",
    cause,
    detail: DEGRADED_DETAIL[cause],
    ...(extra.ceilings === undefined ? {} : { ceilings: extra.ceilings }),
    ...(extra.since === undefined ? {} : { since: extra.since }),
  };
}

/** The ceilings in stack_state.crossed ("day:2026-10-29", "month:2026-10"), once each, day before month. */
export function ceilingsOf(crossed: readonly string[]): ("day" | "month")[] {
  const meters = new Set(crossed.map((c) => c.split(":")[0]));
  return (["day", "month"] as const).filter((m) => meters.has(m));
}

/**
 * Step 4 of §2.4, the state read at request start (data-model.md §7.1): an unreachable store and an empty one both
 * fail closed, and a tripped kill switch refuses every request, local answers included. Undefined lets the request
 * through to the adapters.
 */
export function stateDecision(read: StateRead, opts: { outageSince?: number | undefined }): Degraded | undefined {
  if (read.kind === "unreachable") {
    return degraded(
      "store_unreachable",
      opts.outageSince === undefined ? {} : { since: rfc3339Seconds(opts.outageSince) },
    );
  }
  if (read.kind === "uninitialized") return degraded("store_uninitialized");
  if (read.state === "degraded") {
    return degraded("kill_switch_tripped", {
      ceilings: ceilingsOf(read.crossed),
      since: rfc3339Seconds(read.since.getTime()),
    });
  }
  return undefined;
}

/** The current periods' meters, as levels: spend plus reservations, which is what admission counts (§7.2 step 5). */
export interface MeterView {
  dayLevel: bigint;
  monthLevel: bigint;
  fallbackLevel: bigint;
  /** Today's fallback_day allowance: the full grant until a renewal changes it. */
  allowance: bigint;
  /** The routed paid fallback's month, when it has a cap (spec 010, FR-022): its level and its cap. */
  adapterMonth?: { level: bigint; cap: bigint };
}

export interface RouteView {
  read: StateRead;
  local: { healthy: boolean };
  /** Whether this stack routes a fallback adapter, as built. */
  hasFallback: boolean;
  /** Spec 001's EC2 route: its calls are metered, so the sub-budget's two causes never apply (rule A1). */
  metered?: boolean;
  /** The fallback branch's view: its adapter's health, the meters when they could be read, the ceilings, the journal. */
  fallback?: {
    healthy: boolean;
    meters?: MeterView;
    ceilings: { day: bigint; month: bigint };
    /** The journal's last append failed: the next reserve record most likely will too. */
    journalUnwritable: boolean;
  };
}

/**
 * The cause a hello arriving now would get, from a dry run of §2.4 step 4 onward with no reservation and no provider
 * call; null when it would be answered (gateway-http.md §5; the h4.degraded.cause gauge, telemetry.md §4.1). The
 * fallback branch's causes come in admission's precedence: the ceilings, the paid fallback's monthly cap (spec 010),
 * the renewal flag, today's allowance, the adapter's health, then the journal. Meters that couldn't be read leave their two checks out.
 */
export function wouldDegrade(view: RouteView): DegradedCause | null {
  const early = stateDecision(view.read, {});
  if (early !== undefined) return early.cause;
  if (view.local.healthy) return null;
  if (!view.hasFallback) return "no_fallback_in_stack";
  const f = view.fallback;
  const m = f?.meters;
  if (f !== undefined && m !== undefined && (m.dayLevel >= f.ceilings.day || m.monthLevel >= f.ceilings.month)) {
    return "meter_at_ceiling";
  }
  if (m?.adapterMonth !== undefined && m.adapterMonth.level >= m.adapterMonth.cap) return "adapter_month_spent";
  if (view.metered !== true) {
    if (view.read.kind === "ok" && view.read.fallbackAwaitingRenewal) return "fallback_awaiting_renewal";
    if (m !== undefined && m.fallbackLevel >= m.allowance) return "fallback_spent_today";
  }
  if (f !== undefined && !f.healthy) return "fallback_unavailable";
  if (f?.journalUnwritable === true) return "journal_unwritable";
  return null;
}
