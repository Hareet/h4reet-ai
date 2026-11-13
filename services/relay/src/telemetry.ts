// The relay's spans and metrics (spec 001 FR-060; plan.md §11; research.md R-25). One span per request,
// relay.request, whose context goes on to the host so the gateway's spans are its children; and the metrics the
// dashboard's "Hosts" row reads. No attribute, span, metric, or log line carries an address, a message, or an answer
// (contracts/relay-http.md §7).
import type { Attributes, Meter, Tracer } from "@opentelemetry/api";

import type { CapLimit } from "./cap.js";
import type { HandoverEvent, HostChoice, HostName, Serving } from "./hosts.js";

export type Outcome = "answered" | "degraded" | "refused" | "status";
/** Spec 004's Amendment A2: hello, the status, or anything else, a route the relay refuses among them. */
export type RouteLabel = "hello" | "status" | "other";
/** The tier class the status would reduce to now (spec 004's tier-signal.md §7, A2; FR-041's rows 5, 6, 8, 9, 10). */
export type StatusClass = "local" | "cloud" | "resting" | "budget" | "unavailable" | "unknown";
export const STATUS_CLASSES: readonly StatusClass[] = ["local", "cloud", "resting", "budget", "unavailable", "unknown"];

export const SPAN = "relay.request";
export const METRICS = {
  requests: "h4.relay.requests",
  hostHealthy: "h4.relay.host_healthy",
  servingHost: "h4.serving_host",
  capRefused: "h4.cap.refused",
  statusClass: "h4.relay.status.class",
  handoverEvents: "h4.handover.events",
  gapSeconds: "h4.handover.gap_seconds",
} as const;
const SERVING: readonly Serving[] = ["laptop", "ec2", "none"];

export class RelayTelemetry {
  private readonly requests;
  private readonly capRefusals;
  private readonly handovers;
  private readonly gaps;

  constructor(
    meter: Meter,
    readonly tracer: Tracer,
    hosts: HostChoice,
    statusClass: () => StatusClass = () => "unknown",
  ) {
    this.requests = meter.createCounter(METRICS.requests, {
      description: "The relay's requests, by the host it sent each to and how it ended",
    });
    this.capRefusals = meter.createCounter(METRICS.capRefused, {
      description: "Requests the public cap refused, by its limit; never by address",
    });
    this.handovers = meter.createCounter(METRICS.handoverEvents, {
      description: "Changes of the serving host, by direction and reason",
    });
    this.gaps = meter.createHistogram(METRICS.gapSeconds, {
      description: "The time no host served, recorded on each move out of none",
      unit: "s",
      advice: { explicitBucketBoundaries: [1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600] },
    });
    meter
      .createObservableGauge(METRICS.hostHealthy, { description: "1 while the relay counts the host healthy" })
      .addCallback((result) => {
        // Its label isn't h4.relay.host, which the tunnel end's collector routes on per datapoint (group 8's review A,
        // I4): each host's series reaches both hosts' Prometheus.
        for (const host of hosts.hosts()) result.observe(hosts.healthy(host) ? 1 : 0, { "h4.relay.checked": host });
      });
    meter
      .createObservableGauge(METRICS.servingHost, { description: "1 for the host the relay sends to now, one-hot" })
      .addCallback((result) => {
        const now = hosts.serving();
        // h4.serving, not h4.relay.host (I4): the one-hot set stays whole in either host's Prometheus.
        for (const host of SERVING) result.observe(host === now ? 1 : 0, { "h4.serving": host });
      });
    meter
      .createObservableGauge(METRICS.statusClass, {
        description: "1 for the tier class GET /api/status would reduce to now, one-hot (spec 004's A2)",
      })
      .addCallback((result) => {
        const now = statusClass();
        for (const c of STATUS_CLASSES) result.observe(c === now ? 1 : 0, { "h4.class": c });
      });
  }

  counted(host: HostName | "none", outcome: Outcome, route: string): void {
    this.requests.add(1, {
      "h4.relay.host": host,
      "h4.relay.outcome": outcome,
      "http.route": route,
      "h4.relay.route": routeLabel(route),
    });
  }

  capRefused(limit: CapLimit | "status_per_minute", route: string): void {
    this.capRefusals.add(1, { "h4.cap.limit": limit, "h4.relay.route": routeLabel(route) });
  }

  handover(event: HandoverEvent): void {
    const attrs: Attributes = {
      "h4.handover.from": event.from,
      "h4.handover.to": event.to,
      "h4.handover.reason": event.reason,
    };
    this.handovers.add(1, attrs);
    if (event.gapMs !== null) this.gaps.record(event.gapMs / 1000, attrs);
  }
}

export function routeLabel(route: string): RouteLabel {
  if (route === "/api/status") return "status";
  if (route === "/api/hello") return "hello";
  return "other";
}

/** Spec 004's §4 causeClass, the relay's copy: test/relay.test.ts pins it to apps/web's. */
export const RESTING_CAUSES: readonly string[] = [
  "local_unhealthy",
  "local_error",
  "no_fallback_in_stack",
  "fallback_unavailable",
  "no_host_serving",
  "host_error",
];
export const BUDGET_CAUSES: readonly string[] = [
  "meter_at_ceiling",
  "fallback_spent_today",
  "fallback_awaiting_renewal",
  "kill_switch_tripped",
  "adapter_month_spent",
];

/** FR-041's rows 5, 6, 8, 9, and 10, on the status body: unknown state, then the cause's class, then the tier. */
export function classOf(body: { local_tier: string; state: string; cause_now: string | null }): StatusClass {
  if (body.state === "unknown") return "unknown";
  if (body.cause_now !== null) {
    if (RESTING_CAUSES.includes(body.cause_now)) return "resting";
    if (BUDGET_CAUSES.includes(body.cause_now)) return "budget";
    return "unavailable";
  }
  if (body.state === "normal" && body.local_tier === "up") return "local";
  if (body.state === "normal" && body.local_tier === "down") return "cloud";
  return "unknown";
}
