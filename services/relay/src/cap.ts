// The public request cap (spec 001 FR-033, FR-042; contracts/relay-http.md §3, step 3; ADR 0029): per address, a
// token bucket and a UTC-day count, and across every address the requests in flight, all in memory and sized by
// config/budgets.yaml's `public` section, the Author's figures (P-6).
//
// The address is held only here, for at most one UTC day: an entry whose day has passed is dropped, and past
// MAX_ADDRESSES the least recently seen goes first. Nothing here logs, counts, or returns an address.

export interface PublicCapFigures {
  readonly requestsPerMinute: number;
  readonly burst: number;
  readonly requestsPerDay: number;
  readonly inFlight: number;
}

export type CapLimit = "per_minute" | "per_day" | "global_in_flight";

export type CapDecision =
  | { readonly ok: true; release(): void }
  | { readonly ok: false; readonly limit: CapLimit; readonly retryAfterS: number };

interface Entry {
  tokens: number;
  at: number;
  day: string;
  count: number;
}

/** The most addresses the cap tracks at once (data-model.md §3: memory only). */
export const MAX_ADDRESSES = 50_000;

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const secondsToMidnight = (ms: number): number => {
  const d = new Date(ms);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - ms) / 1000));
};

export class PublicCap {
  private readonly entries = new Map<string, Entry>();
  private inFlight = 0;

  constructor(
    private readonly figures: PublicCapFigures,
    private readonly now: () => number = Date.now,
    private readonly maxAddresses: number = MAX_ADDRESSES,
  ) {}

  /** Every request that reaches the cap counts against its address, as spec 000's per-client cap counts; the global
   *  limit holds the requests the relay has forwarded and not yet answered. */
  admit(address: string): CapDecision {
    const now = this.now();
    const day = dayOf(now);
    const perMs = this.figures.requestsPerMinute / 60_000;
    let entry = this.entries.get(address);
    if (entry === undefined || entry.day !== day) {
      entry = { tokens: this.figures.burst, at: now, day, count: 0 };
    } else {
      entry.tokens = Math.min(this.figures.burst, entry.tokens + (now - entry.at) * perMs);
      entry.at = now;
    }
    // Most recently seen last, so the first key is the one to evict.
    this.entries.delete(address);
    this.entries.set(address, entry);
    this.evict(day);

    if (entry.count >= this.figures.requestsPerDay) {
      return { ok: false, limit: "per_day", retryAfterS: secondsToMidnight(now) };
    }
    entry.count += 1;
    if (entry.tokens < 1) {
      return { ok: false, limit: "per_minute", retryAfterS: Math.max(1, Math.ceil((1 - entry.tokens) / perMs / 1000)) };
    }
    entry.tokens -= 1;
    if (this.inFlight >= this.figures.inFlight) {
      return { ok: false, limit: "global_in_flight", retryAfterS: 1 };
    }
    this.inFlight += 1;
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        this.inFlight -= 1;
      },
    };
  }

  /** How many addresses are held, for the tests; never which. */
  get size(): number {
    return this.entries.size;
  }

  get active(): number {
    return this.inFlight;
  }

  private evict(day: string): void {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.maxAddresses && entry.day === day) break;
      if (entry.day !== day || this.entries.size > this.maxAddresses) this.entries.delete(key);
    }
  }
}
