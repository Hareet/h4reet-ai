// The paid fallback adapter, type bedrock-converse (contracts/provider-adapter.md §3.2): Amazon Bedrock's Converse API
// through the AWS SDK, in prod only. It is the only module that imports @aws-sdk/*.
//
// - complete(): one ConverseCommand. The system message becomes `system: [{text}]`, the other turns
//   `messages: [{role, content: [{text}]}]` in order, and the cap `inferenceConfig.maxTokens`, with the settings'
//   additional request fields and nothing else: no streaming, tools, cache points, guardrail, or request metadata.
//   The SDK makes one attempt (`maxAttempts: 1`); the gateway's wrapper retries a throttled call once (§6).
// - The call's bound is the adapter's own abort signal, the request's signal combined with the request timeout and
//   the deadline: @smithy/node-http-handler 4.12.1 only logs a warning at its requestTimeout unless
//   throwOnRequestTimeout is set. complete() settles when the signal aborts, whatever the SDK is still doing.
// - health(): never calls Bedrock. It resolves credentials through the chain, which the SDK caches, and passes when
//   they resolve and haven't expired; anything else is `credentials`. It reads the SSO session's end from the token
//   cache into credentialsExpireAt, and keeps nothing else from that file.
// - Every failure is one ProviderError kind (§2.5), carrying the SDK exception's name or a Node error code, and its
//   HTTP status when there was one: no provider text, no request, and no original error.
// - Lookups go through c-ares (core/resolve.ts, tasks.md T189): the handler's agent passes aresLookup, and the
//   credential chain gets the same handler, which the SDK hands its SSO and SSO-OIDC clients (§3.2's name-lookup row).
// - The SSO token: the chain is the SDK's default, which refreshes the token in memory in its last 5 minutes, through
//   SSO-OIDC, and drops the failed write to the read-only mount (plan.md §5.2's correction). Whether to allow that is
//   the Author's decision on T102; until then it is allowed, and docs/data-flow-disclosure.md names the flow.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Agent as HttpsAgent } from "node:https";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { z } from "zod";

import { aresLookup } from "../core/resolve.js";
import { ADAPTER_TYPE_SPECS, PLACEHOLDER, type AdapterTypeSpec } from "./_settings.js";
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

export interface BedrockSettings {
  region: string;
  model: string;
  additional_request_fields: Record<string, unknown>;
  timeouts: { connect_ms: number; request_ms: number };
  retry: { on: ProviderErrorKind[]; max: number; backoff_ms: number };
  circuit: { failures: number; open_s: number };
  health: { interval_ms: number };
  credentials_warn_before_s: number;
}

/** What the credential chain resolves: only the expiry is read here. */
export type CredentialsProvider = () => Promise<{ expiration?: Date }>;

/** What the adapter is built on: the real SDK client and chain in production, stand-ins in the tests. */
export interface BedrockDeps {
  client: BedrockRuntimeClient;
  credentials: CredentialsProvider;
  /** The SSO session's end, RFC 3339, from the profile's token cache; undefined when it can't be read. */
  ssoSessionEnd(): Promise<string | undefined>;
  /** Releases what the client doesn't: the handler leaves an agent it was handed open when it is destroyed. */
  release?(): void;
}

const SPEC = ADAPTER_TYPE_SPECS.get("bedrock-converse") as AdapterTypeSpec;

/** An SDK exception's name, or a Node error code; anything else is never copied onto an error. */
const ERROR_CODE = /^[A-Za-z][A-Za-z0-9_]{1,60}$/;
/** Provider-supplied identifiers, kept only when short and printable. */
const PRINTABLE_ID = /^[\x21-\x7e]{1,128}$/;
/** The handler's error when no connection was made in time: nothing reached Bedrock, so nothing was billed. */
const CONNECT_TIMEOUT = /did not establish a connection/;
/** Node's and c-ares's codes for a refused connection or a failed lookup: nothing reached Bedrock. */
const UNREACHED = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEOUT", "ESERVFAIL", "ENODATA", "EREFUSED"]);

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** §2.5's Bedrock column, by the SDK exception's name: [kind, retryable, possibly billed]. */
const BY_NAME: Readonly<Record<string, readonly [ProviderErrorKind, boolean, boolean]>> = {
  ThrottlingException: ["rate_limited", true, false],
  ServiceQuotaExceededException: ["rate_limited", true, false],
  AccessDeniedException: ["auth", false, false],
  UnrecognizedClientException: ["auth", false, false],
  ExpiredTokenException: ["auth", false, false],
  CredentialsProviderError: ["auth", false, false],
  TokenProviderError: ["auth", false, false],
  ValidationException: ["bad_request", false, false],
  ResourceNotFoundException: ["bad_request", false, false],
  ServiceUnavailableException: ["unavailable", true, false],
  ModelNotReadyException: ["unavailable", true, false],
  ModelTimeoutException: ["timeout", true, true],
  InternalServerException: ["provider_error", true, false],
  ModelErrorException: ["provider_error", true, false],
};

const STOP: Readonly<Record<string, FinishReason>> = {
  end_turn: "stop",
  stop_sequence: "stop",
  max_tokens: "length",
  content_filtered: "content_filter",
  guardrail_intervened: "content_filter",
};

/** A timeout: the request may have reached the model, so it is possibly billed (§3.2). */
const timeout = (code?: string): ProviderError => new ProviderError("timeout", true, true, undefined, code);
const malformed = (): ProviderError => new ProviderError("provider_error", true, false, 200);

/** §2.5's mapping of whatever the SDK or the connection threw. */
export function fromSdk(err: unknown): ProviderError {
  const e = err as { name?: unknown; code?: unknown; message?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const name = typeof e?.name === "string" ? e.name : "";
  const nodeCode = typeof e?.code === "string" ? e.code : "";
  const status = e?.$metadata?.httpStatusCode;
  const httpStatus = typeof status === "number" && Number.isInteger(status) ? status : undefined;
  const named = BY_NAME[name];
  if (named !== undefined) return new ProviderError(named[0], named[1], named[2], httpStatus, name);
  if (name === "TimeoutError") {
    return typeof e?.message === "string" && CONNECT_TIMEOUT.test(e.message)
      ? new ProviderError("unavailable", true, false, undefined, "ETIMEDOUT")
      : timeout("TimeoutError");
  }
  if (name === "AbortError") return timeout("AbortError");
  if (UNREACHED.has(nodeCode)) return new ProviderError("unavailable", true, false, undefined, nodeCode);
  const code = [name, nodeCode].find((c) => c !== "" && c !== "Error" && ERROR_CODE.test(c));
  return new ProviderError("provider_error", true, false, httpStatus, code);
}

/**
 * The SSO session's end for the profile the SDK uses (AWS_PROFILE, ~/.aws/config), from the token cache the CLI's
 * `aws sso login` writes: ~/.aws/sso/cache/<sha1 of the sso_session name, or of a legacy profile's start URL>.json.
 * Only `expiresAt` is read out of it; the token never leaves this function. The keys are the ones the SDK's own chain
 * reads.
 */
export async function readSsoSessionEnd(
  env: Readonly<Record<string, string | undefined>> = process.env,
  home: string = homedir(),
): Promise<string | undefined> {
  try {
    const profile = env.AWS_PROFILE ?? "default";
    const config = await readFile(env.AWS_CONFIG_FILE ?? join(home, ".aws", "config"), "utf8");
    const header =
      profile === "default" ? /^\[(profile\s+)?default\]$/ : new RegExp(`^\\[profile\\s+${escape(profile)}\\]$`);
    const settings = new Map<string, string>();
    let inSection = false;
    for (const raw of config.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith("[")) {
        inSection = header.test(line);
        continue;
      }
      const m = inSection ? /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line) : null;
      if (m !== null) settings.set(m[1] as string, (m[2] as string).trim());
    }
    const key = settings.get("sso_session") ?? settings.get("sso_start_url");
    if (key === undefined || key === "") return undefined;
    const file = join(home, ".aws", "sso", "cache", `${createHash("sha1").update(key).digest("hex")}.json`);
    const cached: unknown = JSON.parse(await readFile(file, "utf8"));
    const expiresAt = (cached as { expiresAt?: unknown } | null)?.expiresAt;
    if (typeof expiresAt !== "string") return undefined;
    // Older CLIs wrote "2026-10-29T18:00:00UTC"; Date.parse wants a Z.
    const at = Date.parse(expiresAt.replace(/UTC$/, "Z"));
    return Number.isFinite(at) ? new Date(at).toISOString() : undefined;
  } catch {
    return undefined;
  }
}

/** A profile name, quoted for a RegExp. */
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The real client and chain (§3.2): one handler, whose agent keeps the SDK default's options and resolves through
 * c-ares, for the Converse calls and for the chain's SSO clients alike.
 */
export function bedrockDeps(settings: BedrockSettings): BedrockDeps {
  const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 50, lookup: aresLookup });
  const requestHandler = new NodeHttpHandler({
    connectionTimeout: settings.timeouts.connect_ms,
    requestTimeout: settings.timeouts.request_ms,
    httpsAgent,
  });
  const credentials = fromNodeProviderChain({ clientConfig: { requestHandler } });
  return {
    client: new BedrockRuntimeClient({ region: settings.region, maxAttempts: 1, requestHandler, credentials }),
    credentials,
    ssoSessionEnd: () => readSsoSessionEnd(),
    release: () => httpsAgent.destroy(),
  };
}

export class BedrockConverseAdapter implements ProviderAdapter {
  readonly type = "bedrock-converse";
  readonly kind: AdapterKind = "paid";
  readonly provider = "aws.bedrock";
  readonly model: string;
  readonly server: { address: string; port: number };
  readonly retry: RetryPolicy;

  private readonly inFlight = new Set<AbortController>();
  private closed = false;

  constructor(
    readonly id: string,
    private readonly settings: BedrockSettings,
    private readonly ctx: AdapterContext,
    private readonly deps: BedrockDeps,
  ) {
    if (PLACEHOLDER.test(settings.model)) {
      throw new AdapterConfigError("invalid_config", "model is still routing.yaml's placeholder (tasks.md T105)");
    }
    this.model = settings.model;
    this.server = { address: `bedrock-runtime.${settings.region}.amazonaws.com`, port: 443 };
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
        this.deps.client.send(new ConverseCommand(this.input(req)), { abortSignal: signal }),
        signal,
      );
      return this.parse(out, Math.max(0, Math.round(this.ctx.realNow() - started)));
    } catch (err) {
      throw err instanceof ProviderError ? err : fromSdk(err);
    } finally {
      this.inFlight.delete(own);
    }
  }

  async health(signal: AbortSignal): Promise<HealthStatus> {
    const started = this.ctx.realNow();
    const sessionEnd = await settleBy(this.deps.ssoSessionEnd(), signal).catch(() => undefined);
    const status = (healthy: boolean, reason?: HealthReason): HealthStatus => ({
      healthy,
      checkedAt: new Date(this.ctx.realNow()).toISOString(),
      ...(reason === undefined ? {} : { reason }),
      latencyMs: Math.max(0, Math.round(this.ctx.realNow() - started)),
      ...(sessionEnd === undefined ? {} : { credentialsExpireAt: sessionEnd }),
    });
    if (this.closed) return status(false, "unreachable");
    try {
      const credentials = await settleBy(this.deps.credentials(), signal);
      const expires = credentials.expiration?.getTime();
      return expires !== undefined && expires <= this.ctx.realNow() ? status(false, "credentials") : status(true);
    } catch {
      return status(false, "credentials");
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const controller of this.inFlight) controller.abort();
    this.inFlight.clear();
    this.deps.client.destroy();
    this.deps.release?.();
  }

  /** §3.2's request: the system message as the system block, the turns in order, the cap, and the extra fields. */
  private input(req: CompletionRequest): ConverseCommandInput {
    const system = req.messages.filter((m) => m.role === "system").map((m) => ({ text: m.content }));
    const turns = req.messages
      .filter((m): m is { role: "user" | "assistant"; content: string } => m.role !== "system")
      .map((m) => ({ role: m.role, content: [{ text: m.content }] }));
    const extra = this.settings.additional_request_fields;
    return {
      modelId: this.model,
      ...(system.length > 0 ? { system } : {}),
      messages: turns,
      inferenceConfig: {
        maxTokens: req.maxOutputTokens,
        ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
      },
      ...(Object.keys(extra).length > 0
        ? { additionalModelRequestFields: extra as ConverseCommandInput["additionalModelRequestFields"] }
        : {}),
    };
  }

  /** A Converse answer, as an AdapterResult; one it can't use is a provider_error. */
  private parse(out: ConverseCommandOutput, latencyMs: number): AdapterResult {
    const content = out?.output?.message?.content;
    const usage = out?.usage;
    if (!Array.isArray(content) || usage === undefined || !isCount(usage.inputTokens) || !isCount(usage.outputTokens)) {
      throw malformed();
    }
    const result: Usage = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...(isCount(usage.cacheReadInputTokens) ? { cacheReadInputTokens: usage.cacheReadInputTokens } : {}),
      ...(isCount(usage.cacheWriteInputTokens) ? { cacheWriteInputTokens: usage.cacheWriteInputTokens } : {}),
    };
    const id = out.$metadata?.requestId;
    return {
      text: content.map((block) => (typeof block.text === "string" ? block.text : "")).join(""),
      usage: result,
      finishReason: (typeof out.stopReason === "string" ? STOP[out.stopReason] : undefined) ?? "other",
      responseModel: this.model,
      ...(typeof id === "string" && PRINTABLE_ID.test(id) ? { responseId: id } : {}),
      latencyMs,
    };
  }
}

/**
 * The work's own outcome, or a timeout once `signal` aborts, whichever comes first, so that a call settles when its
 * signal does. Whatever the work does later is caught here, so it can't become an unhandled rejection.
 */
function settleBy<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  work.catch(() => {});
  if (signal.aborted) return Promise.reject(timeout());
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(timeout());
    signal.addEventListener("abort", abort, { once: true });
    work.then(
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

export const factory: AdapterFactory<BedrockSettings> = {
  type: SPEC.type,
  kinds: SPEC.kinds,
  settings: SPEC.settings as z.ZodType<BedrockSettings>,
  provider: "aws.bedrock",
  create: (id, settings, ctx) => new BedrockConverseAdapter(id, settings, ctx, bedrockDeps(settings)),
};
