// The per-client cap (FR-025; contracts/gateway-http.md §2.3), counted in memory per client.
//
// - A token bucket of capacity `burst`, refilled at `requests_per_minute`, on the real clock (rate limits never
//   follow dev's test clock, data-model.md Conventions).
// - At most `requests_per_day` per UTC day of the gateway clock.
// - At most 10,000 clients tracked, the least recently seen evicted; an entry idle for a day is dropped; all of it
//   lost on restart. That is acceptable because the cap isn't the cost bound: the global metered limits and the meter
//   are (§2.3).
//
// The bucket counts in whole units, 60,000 to a token and `requests_per_minute` added per millisecond, so a refill
// lands exactly on the token it owes, with no floating-point drift.
import { dayKey, nextUtcDayStart } from "./clock.js";

export type CapLimit = "per_minute" | "per_day";
export type CapDecision = { ok: true } | { ok: false; limit: CapLimit; retryAfterS: number };

export interface PerClientLimits {
  requestsPerMinute: number;
  burst: number;
  requestsPerDay: number;
}

export interface ClientCapOptions {
  maxClients?: number;
  idleMs?: number;
}

const UNIT = 60_000; // units per token: a minute in milliseconds
const DAY_MS = 86_400_000;

interface Entry {
  units: number;
  refilledAt: number; // real ms
  day: string; // the gateway clock's UTC day the count belongs to
  count: number;
  seenAt: number; // real ms
}

/** The client: edge's source address and the optional label, never shown to anyone (§2.3). */
export function clientKey(address: string, label: string | undefined): string {
  return `${address}\u0000${label ?? ""}`;
}

export class ClientCap {
  /** In last-seen order: the first entry is the least recently seen. */
  private readonly entries = new Map<string, Entry>();
  private readonly maxClients: number;
  private readonly idleMs: number;

  constructor(
    private readonly limits: PerClientLimits,
    opts: ClientCapOptions = {},
  ) {
    this.maxClients = opts.maxClients ?? 10_000;
    this.idleMs = opts.idleMs ?? DAY_MS;
  }

  get size(): number {
    return this.entries.size;
  }

  /** One request from `client`: allowed, and counted, or refused with the limit and how long to wait. */
  take(client: string, realNowMs: number, gatewayNowMs: number): CapDecision {
    this.dropIdle(realNowMs);
    const capacity = this.limits.burst * UNIT;
    const today = dayKey(gatewayNowMs);
    let entry = this.entries.get(client);
    if (entry === undefined) {
      entry = { units: capacity, refilledAt: realNowMs, day: today, count: 0, seenAt: realNowMs };
    } else {
      this.entries.delete(client); // re-inserted below, as the most recently seen
      const elapsed = Math.max(0, realNowMs - entry.refilledAt);
      entry.units = Math.min(capacity, entry.units + elapsed * this.limits.requestsPerMinute);
      entry.refilledAt = realNowMs;
      if (entry.day !== today) {
        entry.day = today;
        entry.count = 0;
      }
      entry.seenAt = realNowMs;
    }
    this.entries.set(client, entry);
    this.evict();

    if (entry.count >= this.limits.requestsPerDay) {
      return { ok: false, limit: "per_day", retryAfterS: seconds(nextUtcDayStart(gatewayNowMs) - gatewayNowMs) };
    }
    if (entry.units < UNIT) {
      return {
        ok: false,
        limit: "per_minute",
        retryAfterS: seconds((UNIT - entry.units) / this.limits.requestsPerMinute),
      };
    }
    entry.units -= UNIT;
    entry.count += 1;
    return { ok: true };
  }

  private dropIdle(realNowMs: number): void {
    for (const [key, entry] of this.entries) {
      if (realNowMs - entry.seenAt < this.idleMs) break; // in last-seen order: the rest are more recent
      this.entries.delete(key);
    }
  }

  private evict(): void {
    while (this.entries.size > this.maxClients) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) return;
      this.entries.delete(oldest.value);
    }
  }
}

/** A wait in milliseconds as whole seconds, rounded up, at least 1. */
function seconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1_000));
}
