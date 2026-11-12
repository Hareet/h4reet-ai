// The relay's spans and metrics (spec 001 FR-060; plan.md §11; research.md R-25). One span per request,
// relay.request, whose context goes on to the host so the gateway's spans are its children; and the metrics the
// dashboard's "Hosts" row reads. No attribute, span, metric, or log line carries an address, a message, or an answer
// (contracts/relay-http.md §7).
import type { Attributes, Meter, Tracer } from "@opentelemetry/api";

import type { CapLimit } from "./cap.js";
import type { HandoverEvent, HostChoice, HostName, Serving } from "./hosts.js";

export type Outcome = "answered" | "degraded" | "refused" | "status";

export const SPAN = "relay.request";
export const METRICS = {
  requests: "h4.relay.requests",
  hostHealthy: "h4.relay.host_healthy",
  servingHost: "h4.serving_host",
  capRefused: "h4.cap.refused",
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
        for (const host of hosts.hosts()) result.observe(hosts.healthy(host) ? 1 : 0, { "h4.relay.host": host });
      });
    meter
      .createObservableGauge(METRICS.servingHost, { description: "1 for the host the relay sends to now, one-hot" })
      .addCallback((result) => {
        const now = hosts.serving();
        for (const host of SERVING) result.observe(host === now ? 1 : 0, { "h4.relay.host": host });
      });
  }

  counted(host: HostName | "none", outcome: Outcome, route: string): void {
    this.requests.add(1, { "h4.relay.host": host, "h4.relay.outcome": outcome, "http.route": route });
  }

  capRefused(limit: CapLimit): void {
    this.capRefusals.add(1, { "h4.cap.limit": limit });
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
