// The host choice (spec 001 FR-054, FR-063; contracts/relay-http.md §4; research.md R-18; data-model.md §3).
//
// Each host's relay block is checked every second. A host is unhealthy after one failed check and healthy again after
// three passing checks in a row. The relay sends to the laptop while it is healthy, else to EC2 while it is healthy,
// else to no one: `none`, which answers no_host_serving. Each change of the serving host is an event, which the
// relay writes to gateway.handover_events as relay_rw; a move out of `none` carries the gap, the time no host served.
// A relay that has just started serves no one until a host's checks pass, and the gap of that first move is unknown,
// so it is recorded as null.
import { request } from "node:http";

import type { HostTarget } from "./config.js";

export type HostName = "laptop" | "ec2";
export type Serving = HostName | "none";
export type HandoverReason = "laptop_healthy" | "laptop_unhealthy" | "ec2_healthy" | "ec2_unhealthy";

export interface HandoverEvent {
  readonly at: Date;
  readonly from: Serving;
  readonly to: Serving;
  readonly reason: HandoverReason;
  readonly gapMs: number | null;
}

export const CHECK_INTERVAL_MS = 1_000;
export const CHECK_TIMEOUT_MS = 800;
export const HEALTHY_AFTER = 3;
export const UNHEALTHY_AFTER = 1;

interface Health {
  healthy: boolean;
  passes: number;
  failures: number;
  lastAt: number | null;
}

export class HostChoice {
  private readonly health = new Map<HostName, Health>();
  private current: Serving = "none";
  private since: number;
  /** When the relay last moved to `none` from a host; null while it has never served. */
  private noneSince: number | null = null;

  constructor(
    private readonly order: readonly HostName[],
    private readonly now: () => number = Date.now,
    private readonly onChange: (event: HandoverEvent) => void = () => {},
  ) {
    for (const name of order) this.health.set(name, { healthy: false, passes: 0, failures: 0, lastAt: null });
    this.since = now();
  }

  /** One check's result, which may change the serving host. */
  report(host: HostName, passed: boolean): void {
    this.reportRound([[host, passed]]);
  }

  /** A round of checks, one result a host, applied together, so two hosts failing in the same second make one change. */
  reportRound(results: readonly (readonly [HostName, boolean])[]): void {
    for (const [host, passed] of results) {
      const h = this.health.get(host);
      if (h === undefined) continue;
      h.lastAt = this.now();
      if (passed) {
        h.passes += 1;
        h.failures = 0;
        if (!h.healthy && h.passes >= HEALTHY_AFTER) h.healthy = true;
      } else {
        h.failures += 1;
        h.passes = 0;
        if (h.healthy && h.failures >= UNHEALTHY_AFTER) h.healthy = false;
      }
    }
    this.choose();
  }

  /** A forward to a healthy host that couldn't connect counts as its failed check. */
  failed(host: HostName): void {
    this.report(host, false);
  }

  healthy(host: HostName): boolean {
    return this.health.get(host)?.healthy === true;
  }

  serving(): Serving {
    return this.current;
  }

  servingSince(): number {
    return this.since;
  }

  /** The healthy host after `host` in the order, if any: where a request that couldn't connect is retried once. */
  other(host: HostName): HostName | undefined {
    return this.order.find((name) => name !== host && this.healthy(name));
  }

  hosts(): readonly HostName[] {
    return this.order;
  }

  private choose(): void {
    const next: Serving = this.order.find((name) => this.healthy(name)) ?? "none";
    if (next === this.current) return;
    const at = this.now();
    const from = this.current;
    // A move to a host is that host's becoming healthy; a move away from one, its stopping being so.
    const reason: HandoverReason =
      next !== "none" && (from === "none" || this.order.indexOf(next) < this.order.indexOf(from))
        ? `${next}_healthy`
        : `${from as HostName}_unhealthy`;
    const gapMs = from === "none" && this.noneSince !== null ? at - this.noneSince : null;
    this.current = next;
    this.since = at;
    if (next === "none") this.noneSince = at;
    this.onChange({ at: new Date(at), from, to: next, reason, gapMs });
  }
}

/** One check of a host's relay block: GET with its token, within 800 ms; a pass is a 200, anything else a failure. */
export function checkHost(target: HostTarget, timeoutMs: number = CHECK_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const url = new URL(target.healthPath, target.url);
    const req = request(url, {
      method: "GET",
      agent: false,
      headers:
        target.token === ""
          ? { connection: "close" }
          : { authorization: `Bearer ${target.token}`, connection: "close" },
    });
    const timer = setTimeout(() => {
      req.destroy();
      finish(false);
    }, timeoutMs);
    req.on("response", (res) => {
      res.resume();
      finish(res.statusCode === 200);
    });
    req.on("error", () => finish(false));
    req.end();
  });
}
