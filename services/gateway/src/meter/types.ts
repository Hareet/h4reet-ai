// The metered path's vocabulary (data-model.md §7.2–§7.3): what admission takes and answers, what a commit records,
// and the port the gateway calls. Types only.
import type { PriceVersion } from "../config/validate.js";
import type { Degraded } from "../core/router.js";
import type { CallPurpose, FinishReason, ProviderErrorKind, Usage } from "../core/types.js";

/** The attributions that reserve: fallback, dev's synthetic metered spend, and prod's live tests (data-model.md). */
export type MeteredAttribution = "fallback" | "metered" | "test";

export type RouteReason = "local_unhealthy" | "local_failed";

export interface AdmitRequest {
  attribution: MeteredAttribution;
  /** The adapter the call goes to; fixedUsage, when it declares one, bounds the reservation too (§7.2). */
  adapter: { id: string; provider: string; model: string; fixedUsage?: Usage };
  /** fallback only: the adapter's effective health, its probe combined with its circuit (provider-adapter.md §6). */
  adapterHealthy: boolean;
  /** When the adapter last turned unhealthy, real ms: the `since` of fallback_unavailable. */
  adapterUnhealthySince?: number;
  /** The request's output cap: 128 for hello. */
  maxOutputTokens: number;
  /** hello only: the client, which may have one metered call in flight (gateway-http.md §2.4 step 5.5). */
  clientKey?: string;
  requestId: string;
  traceId: string;
  purpose: CallPurpose;
  /** fallback only: why local didn't answer. */
  routeReason: RouteReason | null;
}

/** An admitted call: its reservation, which the commit settles, and the slots it holds until then. */
export interface Admitted {
  reservationId: string;
  attribution: MeteredAttribution;
  adapterId: string;
  provider: string;
  model: string;
  /** The active price version at admission: the commit charges the call at it (§7.3). */
  price: PriceVersion;
  maxMicro: bigint;
  /** The periods the call is charged to, fixed at admission, even when it commits after midnight (§7.6). */
  periodDay: string;
  periodMonth: string;
  /** The gateway clock, epoch ms. */
  createdAt: number;
  expiresAt: number;
  /** Real time, epoch ms: a commit that keeps failing is retried until here (§7.3). */
  retryUntil: number;
  requestId: string;
  traceId: string;
  purpose: CallPurpose;
  routeReason: RouteReason | null;
  routingSha: string;
}

/** A 429 from the in-memory limits (gateway-http.md §2.5.3): a refusal, not a degraded state. */
export interface LimitRefusal {
  ok: false;
  refusal: "limit";
  error: "client_cap_exceeded" | "metered_capacity_exceeded";
  limit: "metered_in_flight" | "global_in_flight" | "global_per_minute";
  retryAfterS: number;
}

export type AdmitResult =
  { ok: true; admitted: Admitted } | LimitRefusal | { ok: false; refusal: "degraded"; decision: Degraded };

/** How a metered call settled: what its commit writes to the ledger and charges to the meters (§7.3). */
export interface SettledCall {
  outcome: "ok" | "error";
  /** usage: priced from the reported tokens; reservation: possibly billed, at the maximum; none: nothing billed. */
  costBasis: "usage" | "reservation" | "none";
  costMicro: bigint;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  responseModel: string | null;
  finishReason: FinishReason | null;
  errorKind: ProviderErrorKind | null;
  latencyMs: number;
  /** Real time, epoch ms. */
  startedAt: number;
  endedAt: number;
}

/** What the gateway's metered path calls (data-model.md §7.2, §7.3, §7.7). */
export interface MeterPort {
  /** The in-memory limits, then the admission transaction, then the `reserve` journal record. */
  admit(request: AdmitRequest): Promise<AdmitResult>;
  /**
   * The commit. It releases the call's slots on every way out: a commit, the no-op of a retry after a lost
   * acknowledgement, a retry that gives up at expires_at, and any error. A commit that fails is retried every 2 s
   * until expires_at, in the background, so the answer doesn't wait: `committed` says whether it landed now.
   */
  settle(admitted: Admitted, call: SettledCall, o?: { clientLabel?: string }): Promise<{ committed: boolean }>;
  /** The in-memory metered counters, for GET /admin/status. */
  counters(): { inFlight: number; lastMinute: number };
  /** The 10 s reservation sweep. */
  start(): void;
  stop(): Promise<void>;
}
