// The local adapter, type openai-compatible (contracts/provider-adapter.md §3.1): the in-stack llama.cpp server's
// OpenAI-compatible API. Free, local, and never metered.
//
// - complete(): POST {base}/chat/completions with {model, messages, max_tokens, temperature?, stream: false}, and
//   no Authorization header, no user field, and no request ID. A connect timeout (1 s) and a request timeout
//   (10 s), each cut short by the request's deadline or its signal. No retries: failing over is the retry.
// - health(): GET {base}/models within its timeout. It passes on a 200 whose list names the configured model; a 503
//   is `not_ready`. It never spends: it never calls the completion endpoint.
// - Every failure is one ProviderError kind (§2.5), carrying an HTTP status or a Node error code and nothing else:
//   no provider text, no URL, and no original error.
//
// The transport is node:http, not fetch. Node's built-in fetch has no connect timeout, and the undici Agent that
// has one would be a dependency plan.md's Technical Context doesn't pin, so a watchdog on the socket's connect does
// the same job (a departure recorded in provider-adapter.md §3.1). Each call opens its own connection (no
// keep-alive), so a socket the model server closed between calls can never fail a call as `unavailable`.
import { Agent, request as httpRequest } from "node:http";

import type { z } from "zod";

import { ADAPTER_TYPE_SPECS, isInStackUrl, type AdapterTypeSpec } from "./_settings.js";
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
  type RetryPolicy,
  type Usage,
} from "../core/types.js";

export interface LocalSettings {
  provider: string;
  base_url_env: string;
  model_env: string;
  timeouts: { connect_ms: number; request_ms: number };
  health: { path: string; interval_ms: number; timeout_ms: number; unhealthy_after: number; healthy_after: number };
}

const SPEC = ADAPTER_TYPE_SPECS.get("openai-compatible") as AdapterTypeSpec;

/** A model server's answer is a few kilobytes; anything past this is not one. */
const MAX_RESPONSE_BYTES = 1_048_576;
/** What a Node error code looks like; anything else is never copied onto an error. */
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,40}$/;
/** Provider-supplied identifiers, kept only when short and printable. */
const PRINTABLE_ID = /^[\x21-\x7e]{1,128}$/;

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function codeOf(err: unknown): string | undefined {
  const e = err as { code?: unknown; errors?: { code?: unknown }[] } | null;
  const code = typeof e?.code === "string" ? e.code : e?.errors?.[0]?.code;
  return typeof code === "string" && ERROR_CODE.test(code) ? code : undefined;
}

const timeout = (): ProviderError => new ProviderError("timeout", true, false);
const malformed = (status?: number): ProviderError => new ProviderError("provider_error", true, false, status);

/** §2.5's mapping of an HTTP status other than 200. */
function fromStatus(status: number): ProviderError {
  if ([400, 404, 413, 422].includes(status)) return new ProviderError("bad_request", false, false, status);
  if (status === 401 || status === 403) return new ProviderError("auth", false, false, status);
  if (status === 429) return new ProviderError("rate_limited", true, false, status);
  if ([502, 503, 504].includes(status)) return new ProviderError("unavailable", true, false, status);
  return new ProviderError("provider_error", true, false, status);
}

const FINISH: Readonly<Record<string, FinishReason>> = {
  stop: "stop",
  length: "length",
  content_filter: "content_filter",
};

interface Response {
  status: number;
  text: string;
}

export class LocalOpenAIAdapter implements ProviderAdapter {
  readonly type = "openai-compatible";
  readonly kind: AdapterKind = "local";
  readonly provider: string;
  readonly model: string;
  readonly server: { address: string; port: number };
  readonly retry: RetryPolicy = { on: [], max: 0, backoffMs: 0 };

  private readonly hostname: string;
  private readonly basePath: string;
  private readonly agent = new Agent({ keepAlive: false, maxSockets: 32 });
  private readonly inFlight = new Set<AbortController>();
  private closed = false;

  constructor(
    readonly id: string,
    private readonly settings: LocalSettings,
    private readonly ctx: AdapterContext,
  ) {
    const url = ctx.env[settings.base_url_env];
    const model = ctx.env[settings.model_env];
    if (url === undefined || url === "") {
      throw new AdapterConfigError(
        "missing_env",
        `${settings.base_url_env} is unset; routing.yaml's base_url_env names it`,
      );
    }
    if (!isInStackUrl(url)) {
      throw new AdapterConfigError(
        "local_url_not_in_stack",
        `${settings.base_url_env} isn't http://<single-label host>[:port][/path], an in-stack service`,
      );
    }
    if (model === undefined || model === "") {
      throw new AdapterConfigError("missing_env", `${settings.model_env} is unset; routing.yaml's model_env names it`);
    }
    const parsed = new URL(url);
    this.provider = settings.provider;
    this.model = model;
    this.hostname = parsed.hostname;
    this.basePath = parsed.pathname.replace(/\/+$/, "");
    this.server = { address: parsed.hostname, port: parsed.port === "" ? 80 : Number(parsed.port) };
  }

  async complete(req: CompletionRequest): Promise<AdapterResult> {
    const started = this.ctx.realNow();
    if (this.closed) throw new ProviderError("unavailable", true, false);
    const remaining = req.deadline - started;
    if (req.signal.aborted || remaining <= 0) throw timeout();
    const body = JSON.stringify({
      model: this.model,
      messages: req.messages.map(({ role, content }) => ({ role, content })),
      max_tokens: req.maxOutputTokens,
      ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
      stream: false,
    });
    const res = await this.send("POST", "/chat/completions", body, {
      signal: req.signal,
      timeoutMs: Math.min(this.settings.timeouts.request_ms, remaining),
      connectMs: this.settings.timeouts.connect_ms,
    });
    if (res.status !== 200) throw fromStatus(res.status);
    return this.parse(res.text, Math.max(0, Math.round(this.ctx.realNow() - started)));
  }

  async health(signal: AbortSignal): Promise<HealthStatus> {
    const started = this.ctx.realNow();
    const status = (healthy: boolean, reason?: HealthReason): HealthStatus => ({
      healthy,
      checkedAt: new Date(this.ctx.realNow()).toISOString(),
      ...(reason === undefined ? {} : { reason }),
      latencyMs: Math.max(0, Math.round(this.ctx.realNow() - started)),
    });
    try {
      if (this.closed) return status(false, "unreachable");
      const res = await this.send("GET", this.settings.health.path, undefined, {
        signal,
        timeoutMs: this.settings.health.timeout_ms,
        connectMs: Math.min(this.settings.timeouts.connect_ms, this.settings.health.timeout_ms),
      });
      if (res.status === 503) return status(false, "not_ready");
      if (res.status !== 200) return status(false, "unreachable");
      return this.lists(res.text) ? status(true) : status(false, "not_ready");
    } catch (err) {
      return status(false, err instanceof ProviderError && err.kind === "timeout" ? "timeout" : "unreachable");
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const controller of this.inFlight) controller.abort();
    this.inFlight.clear();
    this.agent.destroy();
  }

  /** A 200 from /chat/completions, as an AdapterResult; one it can't use is a provider_error. */
  private parse(text: string, latencyMs: number): AdapterResult {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw malformed(200);
    }
    if (!isObject(json)) throw malformed(200);
    const usage = json.usage;
    if (!isObject(usage) || !isCount(usage.prompt_tokens) || !isCount(usage.completion_tokens)) throw malformed(200);
    const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
    if (!isObject(choice) || !isObject(choice.message)) throw malformed(200);
    const content = choice.message.content;
    if (content !== undefined && content !== null && typeof content !== "string") throw malformed(200);
    const cached = isObject(usage.prompt_tokens_details) ? usage.prompt_tokens_details.cached_tokens : undefined;
    const result: Usage = {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      ...(isCount(cached) ? { cacheReadInputTokens: cached } : {}),
    };
    const finish = typeof choice.finish_reason === "string" ? FINISH[choice.finish_reason] : undefined;
    const model = typeof json.model === "string" && PRINTABLE_ID.test(json.model) ? json.model : this.model;
    const id = typeof json.id === "string" && PRINTABLE_ID.test(json.id) ? json.id : undefined;
    return {
      text: typeof content === "string" ? content : "",
      usage: result,
      finishReason: finish ?? "other",
      responseModel: model,
      ...(id === undefined ? {} : { responseId: id }),
      latencyMs,
    };
  }

  /** Whether a 200 from /models lists the configured model. */
  private lists(text: string): boolean {
    try {
      const json: unknown = JSON.parse(text);
      const data = isObject(json) ? json.data : undefined;
      return Array.isArray(data) && data.some((m) => isObject(m) && m.id === this.model);
    } catch {
      return false;
    }
  }

  /**
   * One HTTP exchange with the model server. It resolves with the status and the body, or rejects with a
   * ProviderError: `timeout` when the signal or the timeout ends it, `unavailable` when no response came (refused,
   * reset, DNS, or the connect watchdog), and `provider_error` when the response broke off or ran too long.
   */
  private send(
    method: "GET" | "POST",
    path: string,
    body: string | undefined,
    o: { signal: AbortSignal; timeoutMs: number; connectMs: number },
  ): Promise<Response> {
    const own = new AbortController();
    const signal = AbortSignal.any([o.signal, own.signal, AbortSignal.timeout(Math.max(1, Math.floor(o.timeoutMs)))]);
    this.inFlight.add(own);
    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      let responded = false;
      let watchdog: NodeJS.Timeout | undefined;
      const headers: Record<string, string> = { accept: "application/json" };
      if (body !== undefined) {
        headers["content-type"] = "application/json";
        headers["content-length"] = String(Buffer.byteLength(body));
      }
      const req = httpRequest({
        host: this.hostname,
        port: this.server.port,
        path: `${this.basePath}${path}`,
        method,
        agent: this.agent,
        headers,
      });
      // Every way out goes through settle(), once; the listeners it removes are added below.
      const settle = (err: ProviderError | undefined, res?: Response): void => {
        if (settled) return;
        settled = true;
        if (watchdog !== undefined) clearTimeout(watchdog);
        signal.removeEventListener("abort", abort);
        this.inFlight.delete(own);
        if (err !== undefined) reject(err);
        else resolve(res as Response);
      };
      const abort = (): void => {
        settle(timeout());
        req.destroy();
      };
      // Attached first, so destroying the request never raises an 'error' nobody listens for.
      req.on("error", (err) => {
        const code = codeOf(err);
        settle(
          responded
            ? new ProviderError("provider_error", true, false, undefined, code)
            : new ProviderError("unavailable", true, false, undefined, code),
        );
      });
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      req.on("socket", (socket) => {
        if (!socket.connecting) return;
        watchdog = setTimeout(() => {
          settle(new ProviderError("unavailable", true, false, undefined, "ETIMEDOUT"));
          req.destroy();
        }, o.connectMs);
        watchdog.unref();
        socket.once("connect", () => {
          if (watchdog !== undefined) clearTimeout(watchdog);
          watchdog = undefined;
        });
      });
      req.on("response", (res) => {
        responded = true;
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            settle(malformed(res.statusCode));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          settle(undefined, { status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }),
        );
        res.on("error", (err) => settle(new ProviderError("provider_error", true, false, res.statusCode, codeOf(err))));
        res.on("close", () => {
          if (!res.complete) settle(new ProviderError("provider_error", true, false, res.statusCode));
        });
      });
      req.end(body);
    });
  }
}

export const factory: AdapterFactory<LocalSettings> = {
  type: SPEC.type,
  kinds: SPEC.kinds,
  settings: SPEC.settings as z.ZodType<LocalSettings>,
  create: (id, settings, ctx) => new LocalOpenAIAdapter(id, settings, ctx),
};
