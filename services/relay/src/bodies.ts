// The answers the relay makes itself (spec 001 contracts/relay-http.md §5; spec 000 contracts/gateway-http.md §2.5).
// A degraded answer is spec 000's 503 body with X-H4-Degraded-Cause; the cap's refusal is spec 000's 429 shape, with
// Retry-After and the error `public_cap`; the edge's own refusals are small error bodies. None holds a payload, an
// address, or a secret.
import type { CapLimit } from "./cap.js";

export type RelayCause =
  "no_host_serving" | "host_error" | "kill_switch_tripped" | "store_unreachable" | "store_uninitialized";

/** Each cause's fixed text (spec 000 §3's, and this contract's two). */
export const DETAIL: Readonly<Record<RelayCause, string>> = {
  no_host_serving: "No host is serving: the Author's machine is resting, and the cloud host isn't up.",
  host_error: "The serving host answered with an error and no cause.",
  kill_switch_tripped:
    "The kill switch set degraded when a spending ceiling was reached. Only an operator reset restores service.",
  store_unreachable: "The kill-switch store can't be read, so the stack fails closed.",
  store_uninitialized: "The kill-switch store is empty. The operator must initialize it: make operator-init.",
};

export interface Degraded {
  readonly state: "degraded";
  readonly cause: string;
  readonly detail: string;
  readonly ceilings: readonly string[] | null;
  readonly stack: string;
  readonly since: string | null;
  readonly request_id: string;
  readonly trace_id: string | null;
}

export function degraded(
  cause: RelayCause,
  stack: string,
  requestId: string,
  traceId: string | null,
  since: string | null = null,
  ceilings: readonly string[] | null = null,
): Degraded {
  return {
    state: "degraded",
    cause,
    detail: DETAIL[cause],
    ceilings,
    stack,
    since,
    request_id: requestId,
    trace_id: traceId,
  };
}

/** A host's 502 or 504, as the relay passes it on: 503, the host's cause kept when it gave one, else host_error, so
 *  CloudFront's error mapping never hides a cause (research.md R-08). */
export function hostFailure(
  body: Buffer,
  headerCause: string | undefined,
  stack: string,
  requestId: string,
  traceId: string | null,
): Degraded {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    parsed = undefined;
  }
  const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const fromBody = typeof record.cause === "string" ? record.cause : undefined;
  const cause = headerCause ?? fromBody;
  if (cause === undefined || !/^[a-z][a-z0-9_]{0,63}$/.test(cause)) {
    return degraded("host_error", stack, requestId, traceId);
  }
  const detail = typeof record.detail === "string" && record.cause === cause ? record.detail : DETAIL.host_error;
  return {
    state: "degraded",
    cause,
    detail,
    ceilings: null,
    stack,
    since: typeof record.since === "string" ? record.since : null,
    request_id: requestId,
    trace_id: traceId,
  };
}

export function capRefused(limit: CapLimit, retryAfterS: number, requestId: string) {
  return { error: "public_cap", limit, retry_after_s: retryAfterS, request_id: requestId };
}

export function refusal(error: "edge_required" | "probe_not_allowed" | "not_found", requestId: string) {
  return { error, request_id: requestId };
}
