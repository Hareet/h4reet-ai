// The Anthropic API as a paid adapter, type anthropic-messages (spec 010, FR-004 to FR-016; its plan §2;
// contracts/provider-adapter.md §3.4): Claude through Anthropic's own Messages API and the official SDK,
// @anthropic-ai/sdk 1.3.0, pinned and vetted (plan D1, D2; departure B1). In prod only, and only while prod's route
// names it. With its transport beside it, it is the only module that imports @anthropic-ai/sdk.
//
// - The client gets every option explicitly (plan D4; departure B3): the key from the env key `api_key_env` names,
//   which is all the adapter's context holds; no auth token; no webhook key; the fixed origin; no retries; the
//   settings' timeout; the SDK's logging off; its OpenTelemetry spans and trace propagation off; and the transport as
//   its fetch. No variable the SDK reads on its own changes what a call does, where it goes, or what is logged.
// - complete(): one messages.create, the system message as `system`, the other turns in order, the cap as max_tokens,
//   thinking disabled, and the temperature only while the settings allow it (FR-017). Nothing else.
// - The call's bound is the adapter's own signal, the request's combined with the request timeout and the deadline;
//   complete() settles when it aborts, whatever the SDK is still doing (checks C10, C11).
// - Every failure is one ProviderError kind (provider-adapter.md §2.5's Anthropic column), carrying the SDK error's
//   class name, an http_<status>, or the transport's code; never the provider's text, the request, the key, or a URL.
// - health(): the model lookup, GET /v1/models/{model}, which spends no tokens; never a Messages call (FR-012).
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
  type ClientOptions,
} from "@anthropic-ai/sdk";
import { VERSION } from "@anthropic-ai/sdk/version";
import type { LookupFunction } from "node:net";
import type { z } from "zod";

import {
  ADAPTER_TYPE_SPECS,
  PLACEHOLDER,
  sentTemperature,
  type AdapterTypeSpec,
  type PaidTemperature,
} from "./_settings.js";
import { AnthropicTransportError, createAnthropicTransport, type AnthropicTransport } from "./_anthropic-transport.js";
import { AdapterConfigError, type AdapterContext, type AdapterFactory } from "./registry.js";
import {
  ProviderError,
  type AdapterKind,
  type AdapterResult,
  type CompletionRequest,
  type FinishReason,
  type HealthReason,
  type HealthStatus,
  type ProviderAdapter,
  type ProviderErrorKind,
  type RetryPolicy,
  type Usage,
} from "../core/types.js";

export interface AnthropicSettings {
  model: string;
  api_key_env: string;
  thinking: "disabled";
  /** FR-017: `model_default` sends no temperature; absent, it is `as_requested`. */
  temperature?: PaidTemperature;
  timeouts: { connect_ms: number; request_ms: number };
  retry: { on: ProviderErrorKind[]; max: number; backoff_ms: number };
  circuit: { failures: number; open_s: number };
  health: { interval_ms: number };
}

/** The endpoint, fixed here, never configuration or an environment variable (FR-005). */
export const ANTHROPIC_ORIGIN = "https://api.anthropic.com";
/** The API version the pinned SDK sends; the transport sends this one, whatever the SDK passes in (departure B3). */
export const ANTHROPIC_VERSION = "2026-10-21";
/** The SDK's user agent, which names it and its version. */
export const ANTHROPIC_USER_AGENT = `Anthropic/JS ${VERSION}`;

const SPEC = ADAPTER_TYPE_SPECS.get("anthropic-messages") as AdapterTypeSpec;

/** Provider-supplied identifiers, kept only when short and printable. */
const PRINTABLE_ID = /^[\x21-\x7e]{1,128}$/;
/** The 100,000-token tier's edge (plan §2.4, R-10). */
const TIER_EDGE_TOKENS = 100_000;
const HOUR_MS = 3_600_000;

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** The SDK's own logger, given explicitly: it writes nothing (FR-007). */
const SILENT = { debug() {}, info() {}, warn() {}, error() {} };

/** §2.4's stop reasons: anything else, a tool use or a pause among them, is `other`. */
const STOP: Readonly<Record<string, FinishReason>> = {
  end_turn: "stop",
  stop_sequence: "stop",
  max_tokens: "length",
  refusal: "content_filter",
};

/** The SDK's error classes by status, whose names become a ProviderError's code. */
const NAMED: readonly [new (...args: never[]) => APIError, string][] = [
  [BadRequestError, "BadRequestError"],
  [AuthenticationError, "AuthenticationError"],
  [PermissionDeniedError, "PermissionDeniedError"],
  [NotFoundError, "NotFoundError"],
  [ConflictError, "ConflictError"],
  [UnprocessableEntityError, "UnprocessableEntityError"],
  [RateLimitError, "RateLimitError"],
  [InternalServerError, "InternalServerError"],
];

/** A timeout: the request may have reached the model, so it is possibly billed. */
const timeout = (code?: string): ProviderError => new ProviderError("timeout", true, true, undefined, code);
const malformed = (): ProviderError => new ProviderError("provider_error", true, false, 200);

/** §2.5's Anthropic column, by status. */
function fromStatus(status: number, code: string): ProviderError {
  if ([400, 404, 413, 422].includes(status)) return new ProviderError("bad_request", false, false, status, code);
  if (status === 401 || status === 403) return new ProviderError("auth", false, false, status, code);
  if (status === 429) return new ProviderError("rate_limited", true, false, status, code);
  if ([502, 503, 529].includes(status)) return new ProviderError("unavailable", true, false, status, code);
  if (status === 504) return new ProviderError("timeout", true, true, status, code);
  return new ProviderError("provider_error", true, false, status, code);
}

/** What the transport raised: never reached is unavailable and unbilled; reached, possibly billed. */
function fromTransport(err: AnthropicTransportError): ProviderError {
  return err.reached ? timeout(err.code) : new ProviderError("unavailable", true, false, undefined, err.code);
}

/** §2.5's mapping of whatever the SDK, its transport, or its parsing threw (departure B4). */
export function fromSdk(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof AnthropicTransportError) return fromTransport(err);
  if (err instanceof APIUserAbortError) return timeout("APIUserAbortError");
  if (err instanceof APIConnectionTimeoutError) return timeout("APIConnectionTimeoutError");
  if (err instanceof APIConnectionError) {
    const cause = (err as { cause?: unknown }).cause;
    // Without the transport's mark nobody knows whether the request went out: the side that never undercounts.
    return cause instanceof AnthropicTransportError ? fromTransport(cause) : timeout("APIConnectionError");
  }
  if (err instanceof APIError && typeof err.status === "number") {
    const named = NAMED.find(([cls]) => err instanceof cls);
    return fromStatus(err.status, named?.[1] ?? `http_${err.status}`);
  }
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "AbortError" || name === "TimeoutError") return timeout(name);
  // Only a 2xx body is parsed as the answer, so a body that isn't JSON is a malformed 200.
  if (err instanceof SyntaxError) return malformed();
  return new ProviderError("provider_error", true, false);
}

/**
 * The client's options, every one the adapter relies on given explicitly (FR-007; departure B3): with a credential
 * passed, the SDK reads no key, token, or profile from the environment; with a base URL, no ANTHROPIC_BASE_URL; with a
 * log level and a logger, no ANTHROPIC_LOG; with an OpenTelemetry option, none of its switches.
 */
export function clientOptions(
  settings: AnthropicSettings,
  apiKey: string,
  baseURL: string,
  fetch: AnthropicTransport["fetch"],
): ClientOptions {
  return {
    apiKey,
    authToken: null,
    webhookKey: null,
    baseURL,
    maxRetries: 0,
    timeout: settings.timeouts.request_ms,
    fetch: fetch as ClientOptions["fetch"],
    logLevel: "off",
    logger: SILENT,
    openTelemetry: { propagation: false, traces: { enabled: false } },
  };
}

/** What the adapter is built on: the SDK client over the transport, and the transport's release. */
export interface AnthropicDeps {
  client: Anthropic;
  release(): void;
}

/**
 * The real client over the transport (plan §2.1): `origin` is ANTHROPIC_ORIGIN in production, which the factory always
 * passes, and a stub's in tests. The key is the one env key the adapter's context holds.
 */
export function anthropicDeps(
  settings: AnthropicSettings,
  ctx: Pick<AdapterContext, "env">,
  o: { origin: string; lookup?: LookupFunction },
): AnthropicDeps {
  const apiKey = ctx.env[settings.api_key_env] ?? "";
  const transport = createAnthropicTransport({
    origin: o.origin,
    connectMs: settings.timeouts.connect_ms,
    apiKey,
    version: ANTHROPIC_VERSION,
    userAgent: ANTHROPIC_USER_AGENT,
    ...(o.lookup === undefined ? {} : { lookup: o.lookup }),
  });
  return {
    client: new Anthropic(clientOptions(settings, apiKey, transport.origin, transport.fetch)),
    release: () => transport.destroy(),
  };
}

export class AnthropicMessagesAdapter implements ProviderAdapter {
  readonly type = "anthropic-messages";
  readonly kind: AdapterKind = "paid";
  readonly provider = "anthropic";
  readonly model: string;
  readonly server = { address: "api.anthropic.com", port: 443 };
  readonly retry: RetryPolicy;

  private readonly inFlight = new Set<AbortController>();
  private closed = false;
  private cacheWriteLoggedAt: number | undefined;

  constructor(
    readonly id: string,
    private readonly settings: AnthropicSettings,
    private readonly ctx: AdapterContext,
    private readonly deps: AnthropicDeps,
  ) {
    if (PLACEHOLDER.test(settings.model)) {
      deps.release();
      throw new AdapterConfigError("invalid_config", "model is still routing.yaml's placeholder (spec 010, T057)");
    }
    const key = ctx.env[settings.api_key_env];
    if (key === undefined || key === "") {
      deps.release();
      throw new AdapterConfigError(
        "missing_env",
        `${settings.api_key_env} is unset; routing.yaml's api_key_env names it`,
      );
    }
    this.model = settings.model;
    this.retry = { on: [...settings.retry.on], max: settings.retry.max, backoffMs: settings.retry.backoff_ms };
  }

  async complete(req: CompletionRequest): Promise<AdapterResult> {
    const started = this.ctx.realNow();
    if (this.closed) throw new ProviderError("unavailable", true, false);
    const remaining = req.deadline - started;
    if (req.signal.aborted || remaining <= 0) throw timeout();
    const own = new AbortController();
    const limitMs = Math.max(1, Math.floor(Math.min(this.settings.timeouts.request_ms, remaining)));
    const signal = AbortSignal.any([req.signal, own.signal, AbortSignal.timeout(limitMs)]);
    this.inFlight.add(own);
    try {
      const out = await settleBy(
        this.deps.client.messages.create(this.body(req), {
          signal,
          maxRetries: 0,
          timeout: this.settings.timeouts.request_ms,
        }),
        signal,
      );
      return this.parse(out, Math.max(0, Math.round(this.ctx.realNow() - started)));
    } catch (err) {
      throw fromSdk(err);
    } finally {
      this.inFlight.delete(own);
    }
  }

  async health(signal: AbortSignal): Promise<HealthStatus> {
    const started = this.ctx.realNow();
    const status = (healthy: boolean, reason?: HealthReason): HealthStatus => ({
      healthy,
      checkedAt: new Date(this.ctx.realNow()).toISOString(),
      ...(reason === undefined ? {} : { reason }),
      latencyMs: Math.max(0, Math.round(this.ctx.realNow() - started)),
    });
    if (this.closed) return status(false, "unreachable");
    const bound = Math.max(1, Math.min(5_000, this.settings.health.interval_ms - 1));
    const own = AbortSignal.any([signal, AbortSignal.timeout(bound)]);
    try {
      const info: unknown = await settleBy(
        this.deps.client.models.retrieve(this.model, null, { signal: own, maxRetries: 0, timeout: bound }),
        own,
      );
      const id = isObject(info) ? info.id : undefined;
      return typeof id === "string" && this.names(id) ? status(true) : status(false, "unreachable");
    } catch (err) {
      if (err instanceof APIError && (err.status === 401 || err.status === 403)) return status(false, "credentials");
      const mapped = fromSdk(err);
      return status(false, mapped.kind === "timeout" || own.aborted ? "timeout" : "unreachable");
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const controller of this.inFlight) controller.abort();
    this.inFlight.clear();
    this.deps.release();
  }

  /** Whether the model lookup named the configured model, or a dated snapshot of it (departure B5). */
  private names(id: string): boolean {
    if (id === this.model) return true;
    return id.startsWith(`${this.model}-`) && /^[0-9]{8}$/.test(id.slice(this.model.length + 1));
  }

  /**
   * §2.3's request: the system message as `system`, the other turns in order, the cap, thinking disabled, and the
   * temperature as the settings allow (FR-017). Nothing else: no stream, tools, cache breakpoint, stop sequence,
   * metadata, service tier, effort, or beta header.
   */
  private body(req: CompletionRequest): Anthropic.MessageCreateParamsNonStreaming {
    const system = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const messages = req.messages
      .filter((m): m is { role: "user" | "assistant"; content: string } => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    const temperature = sentTemperature(this.settings.temperature, req.temperature);
    return {
      model: this.model,
      max_tokens: req.maxOutputTokens,
      ...(system === "" ? {} : { system }),
      messages,
      thinking: { type: "disabled" },
      ...(temperature === undefined ? {} : { temperature }),
    };
  }

  /** A Messages answer, as an AdapterResult; one it can't use is a provider_error (§2.4). */
  private parse(out: unknown, latencyMs: number): AdapterResult {
    if (!isObject(out) || !Array.isArray(out.content) || !isObject(out.usage)) throw malformed();
    const u = out.usage;
    if (!isCount(u.input_tokens) || !isCount(u.output_tokens)) throw malformed();
    const cacheWrite = isCount(u.cache_creation_input_tokens) ? u.cache_creation_input_tokens : 0;
    const usage: Usage = {
      inputTokens: u.input_tokens + cacheWrite,
      outputTokens: u.output_tokens,
      ...(isCount(u.cache_read_input_tokens) ? { cacheReadInputTokens: u.cache_read_input_tokens } : {}),
    };
    if (cacheWrite > 0) this.noteCacheWrite(cacheWrite);
    const input = usage.inputTokens + (usage.cacheReadInputTokens ?? 0);
    if (input > TIER_EDGE_TOKENS) {
      this.ctx.logger.warn(
        { event: "cost.tier_edge", adapter: this.id, input_tokens: input },
        "A call's input passed the price entry's 100,000-token tier; it was counted at the entry's prices.",
      );
    }
    const text = out.content
      .filter((block): block is { type: "text"; text: string } => isObject(block) && block.type === "text")
      .map((block) => (typeof block.text === "string" ? block.text : ""))
      .join("");
    const model = typeof out.model === "string" && PRINTABLE_ID.test(out.model) ? out.model : this.model;
    const id = typeof out.id === "string" && PRINTABLE_ID.test(out.id) ? out.id : undefined;
    return {
      text,
      usage,
      finishReason: (typeof out.stop_reason === "string" ? STOP[out.stop_reason] : undefined) ?? "other",
      responseModel: model,
      ...(id === undefined ? {} : { responseId: id }),
      latencyMs,
    };
  }

  /** Cache writes no request asked for: counted as input, and logged, with the count, at most once an hour. */
  private noteCacheWrite(tokens: number): void {
    const now = this.ctx.realNow();
    if (this.cacheWriteLoggedAt !== undefined && now - this.cacheWriteLoggedAt < HOUR_MS) return;
    this.cacheWriteLoggedAt = now;
    this.ctx.logger.warn(
      { event: "adapter.cache_write_reported", adapter: this.id, cache_creation_input_tokens: tokens },
      "The Anthropic API reported cache writes the request never asked for; they were counted as input.",
    );
  }
}

/**
 * The work's own outcome, or a timeout once `signal` aborts, whichever comes first, so that a call settles when its
 * signal does. Whatever the work does later is caught here, so it can't become an unhandled rejection.
 */
function settleBy<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  const promise = Promise.resolve(work);
  promise.catch(() => {});
  if (signal.aborted) return Promise.reject(timeout());
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(timeout());
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(err);
      },
    );
  });
}

export const factory: AdapterFactory<AnthropicSettings> = {
  type: SPEC.type,
  kinds: SPEC.kinds,
  settings: SPEC.settings as z.ZodType<AnthropicSettings>,
  provider: "anthropic",
  create: (id, settings, ctx) =>
    new AnthropicMessagesAdapter(id, settings, ctx, anthropicDeps(settings, ctx, { origin: ANTHROPIC_ORIGIN })),
};
