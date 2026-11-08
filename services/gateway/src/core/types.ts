// The one interface every model provider sits behind (FR-021), and the routing vocabulary around it.
// Exactly as specs/000-local-foundations/contracts/provider-adapter.md §2: change it there first.
// An adapter translates; the gateway decides (§1). Nothing outside src/adapters/ names a provider (SC-006).

// ---- §2.1 Requests and results ----

export type AdapterKind = "local" | "paid" | "synthetic";
// local: free, in-stack. paid: real money, prod only. synthetic: metered test spend, dev only.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type CallPurpose = "hello" | "contract" | "eval" | "synthetic" | "twin";
// "twin" (spec 007, Amendment 0-1): the twin's conversation turns, POST /room/turn and POST /admin/twin/turn.

/** A twin call's room feature (a selectable's ID, or free_talk) and topic (spec 007, FR-026): bounded IDs from its pack. */
export interface RoomCall {
  feature: string;
  topic: string;
}

export interface CompletionRequest {
  requestId: string; // the HTTP request's ID, for logs only; never sent to a provider
  purpose: CallPurpose;
  messages: ChatMessage[]; // at most one system message, and it comes first;
  // contents together at most limits.per_call.max_input_chars (2,000)
  maxOutputTokens: number; // 1 to limits.per_call.max_output_tokens (512); hello sends 128
  temperature?: number; // 0 to 1; absent means the provider's default
  deadline: number; // epoch milliseconds, real clock: complete() settles by then
  signal: AbortSignal; // aborts at the deadline, or when the caller goes away
}

export interface Usage {
  // non-negative integers
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

export type FinishReason = "stop" | "length" | "content_filter" | "error" | "other";

export interface AdapterResult {
  text: string; // '' when the provider returned no text
  usage: Usage;
  finishReason: FinishReason;
  responseModel: string; // what the provider says answered; the configured model if it says nothing
  responseId?: string; // the provider's response or request ID
  latencyMs: number; // this attempt's wall time
}

// ---- §2.2 The adapter ----

export interface RetryPolicy {
  on: readonly ProviderErrorKind[]; // Bedrock: ['rate_limited']; local and synthetic: []
  max: number; // extra attempts; 0 means none
  backoffMs: number;
}

export interface ProviderAdapter {
  readonly id: string; // its key in config/routing.yaml: 'local', 'bedrock', 'synthetic'
  readonly type: string; // its factory's type: 'openai-compatible', 'bedrock-converse', 'synthetic'
  readonly provider: string; // gen_ai.provider.name: 'local', 'aws.bedrock', 'synthetic'
  readonly kind: AdapterKind;
  readonly model: string; // gen_ai.request.model
  readonly server: { address: string; port?: number }; // server.address and server.port on its spans
  readonly retry: RetryPolicy; // applied by the gateway, one span per attempt (§6)
  readonly fixedUsage?: Usage; // the synthetic adapter only: the usage every call reports
  complete(req: CompletionRequest): Promise<AdapterResult>; // one attempt; rejects only with ProviderError
  health(signal: AbortSignal): Promise<HealthStatus>; // one probe; never rejects; never spends
  close?(): Promise<void>; // releases sockets and timers at shutdown
}

// ---- §2.3 Route decisions, degraded causes, and attribution ----

export type DegradedCause =
  | "store_unreachable"
  | "store_uninitialized"
  | "kill_switch_tripped"
  | "no_fallback_in_stack"
  | "meter_at_ceiling"
  | "fallback_awaiting_renewal"
  | "fallback_spent_today"
  | "fallback_unavailable"
  | "journal_unwritable";
// 'api_unavailable' is edge's, never the gateway's (gateway-http.md §6).

export type Attribution = "none" | "fallback" | "metered" | "test";

export type RouteDecision =
  | { kind: "local" }
  | { kind: "fallback"; reason: "local_unhealthy" | "local_failed" }
  | { kind: "metered"; attribution: "metered" | "test" } // dev synthetic metered calls; prod's live contract test
  | { kind: "degraded"; cause: DegradedCause; detail: string; ceilings?: ("day" | "month")[]; since?: string };

// ---- §2.4 Health ----

export type HealthReason =
  | "not_ready" // not yet proven healthy (startup), or the server answers 503 while it loads
  | "unreachable" // the connection was refused, DNS failed, or the probe got a 5xx
  | "timeout" // the probe didn't answer within its timeout
  | "credentials" // credentials are missing, can't be resolved, or have expired
  | "circuit_open" // set by the gateway, not the adapter (§6)
  | "disabled"; // configured but switched off, such as synthetic without its switch

export interface HealthStatus {
  healthy: boolean;
  checkedAt: string; // RFC 3339, real clock
  reason?: HealthReason; // present when healthy is false
  latencyMs?: number;
  credentialsExpireAt?: string; // a paid adapter with expiring credentials: when the session ends
}

// ---- §2.5 Provider errors ----

export type ProviderErrorKind =
  "unavailable" | "timeout" | "rate_limited" | "auth" | "bad_request" | "content_filtered" | "provider_error";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly retryable: boolean,
    readonly possiblyBilled: boolean,
    readonly status?: number, // the provider's HTTP status, when there was one
    readonly code?: string, // the SDK exception name or Node error code, such as ThrottlingException or ECONNREFUSED
  ) {
    super(kind); // the message is the kind: never a payload, a URL, or the provider's text
    this.name = "ProviderError";
  }
}
// No original error: an adapter never attaches the original error as `cause`, because SDK and HTTP errors can
// carry request bodies and URLs. `code` is the only detail kept, and it becomes `error.type` on the span.
