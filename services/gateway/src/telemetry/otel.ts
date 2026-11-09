// The gateway's OpenTelemetry SDK (contracts/telemetry.md §2, §3.1, §4).
//
// - OTLP over HTTP with protobuf to the collector. Compose sets OTEL_EXPORTER_OTLP_ENDPOINT, the timeout, the
//   resource attributes, and the sampler (parentbased_always_on); the code fixes what must not drift: metrics every
//   10 s with cumulative temporality, a span batch of 2,048 every 1 s that drops rather than blocks, and explicit
//   histogram buckets up to 120 s.
// - The resource comes from the environment alone (OTEL_NODE_RESOURCE_DETECTORS=env): no host, process, or cloud
//   detector runs, since the cloud ones would call instance-metadata endpoints, an undisclosed data flow.
// - Health probes make no spans; nor do outgoing calls outside a request, such as the model server's 1 s health
//   probe or the store's background queries, which would otherwise each be a trace of their own.
// - A span processor drops the client attributes and the query string before export, and the http and undici
//   instrumentations skip the Telegram API host, whose URL path carries the bot token: the channel sends over
//   node:https since T188, and any fetch to it is skipped too. The collector repeats both as a second layer (§6.3).
//
// Instrumentations are built switched off, so building this configuration patches nothing; NodeSDK.start() enables
// them, and startTelemetry switches on the undici instrumentation's own flag, which it reads on every request.
// server.ts starts the SDK before it loads Fastify, pg, or pino, so their instrumentations can wrap them.
import type { AgentOptions } from "node:http";

import { FastifyOtelInstrumentation } from "@fastify/otel";
import type { Attributes, Context, Span as ApiSpan } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation, type PgRequestHookInformation } from "@opentelemetry/instrumentation-pg";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import {
  defaultResource,
  detectResources,
  envDetector,
  resourceFromAttributes,
  type Resource,
} from "@opentelemetry/resources";
import { BatchLogRecordProcessor, type LogRecordExporter } from "@opentelemetry/sdk-logs";
import {
  AggregationTemporality,
  AggregationType,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
  type ViewOptions,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK, tracing, type NodeSDKConfiguration } from "@opentelemetry/sdk-node";
import { ATTR_DB_QUERY_TEXT } from "@opentelemetry/semantic-conventions";

import { isServiceHost } from "../adapters/_settings.js";
import { aresLookup } from "../core/resolve.js";
import { SECONDS_BUCKETS } from "./metrics.js";

export const METRIC_EXPORT_INTERVAL_MS = 10_000;
/** OTEL_EXPORTER_OTLP_TIMEOUT's value; a metric export must also finish within its interval. */
export const EXPORT_TIMEOUT_MS = 5_000;
/** A full queue drops spans; it never blocks a request (§3.1). */
export const SPAN_BATCH = { maxQueueSize: 2_048, scheduledDelayMillis: 1_000 } as const;
export const TELEGRAM_API_HOST = "api.telegram.org";

/**
 * What the gateway removes from its spans before export (§3.1): the client's attributes, and the query string, which
 * the HTTP instrumentation records as url.query on server spans and both client instrumentations inside url.full.
 * The collector deletes them again (§6.3).
 */
export const STRIPPED_SPAN_ATTRIBUTES = [
  "client.address",
  "client.port",
  "network.peer.address",
  "network.peer.port",
  "user_agent.original",
  "url.query",
  "url.full",
] as const;

const HEALTH_PATHS = new Set(["/health/live", "/health"]);

/** GET /health/live and GET /health produce no spans (§3.1). */
export function isHealthProbe(url: string | undefined): boolean {
  if (url === undefined) return false;
  const q = url.indexOf("?");
  return HEALTH_PATHS.has(q === -1 ? url : url.slice(0, q));
}

/**
 * instrumentation-undici's ignoreRequestHook. As with node:http (httpIgnoreOutgoingHook), only a fetch to an in-stack
 * service gets a client span and a traceparent header, so no trace context leaves the stack. The Telegram API and the
 * configured stand-in are skipped too, because the URL's path carries the bot token (alerts.md §4.1). An origin that
 * doesn't parse is skipped.
 */
export function undiciIgnoreHook(
  extraHosts: readonly string[] = [],
): (req: { origin: string; path: string }) => boolean {
  const hosts = new Set([TELEGRAM_API_HOST, ...extraHosts.map((h) => h.toLowerCase())]);
  return (req) => {
    try {
      const host = new URL(req.origin).hostname.toLowerCase();
      return !isServiceHost(host) || hosts.has(host);
    } catch {
      return true;
    }
  };
}

/**
 * instrumentation-http's ignoreOutgoingRequestHook. Only a request to an in-stack service gets a client span, and with
 * it a traceparent header. A request anywhere else, such as AWS once the Bedrock adapter and its credential refresh
 * land, carries no trace context out of the stack, and the gateway's own `chat` span stays the contract's client span
 * (§3.1). The Telegram hosts are skipped as in undiciIgnoreHook. Options with no host are skipped too.
 */
export function httpIgnoreOutgoingHook(
  extraHosts: readonly string[] = [],
): (req: { hostname?: string | null | undefined; host?: string | null | undefined }) => boolean {
  const telegram = new Set([TELEGRAM_API_HOST, ...extraHosts.map((h) => h.toLowerCase())]);
  return (req) => {
    const host = String(req.hostname ?? req.host ?? "").toLowerCase();
    return !isServiceHost(host) || telegram.has(host);
  };
}

/** The hostname of a URL, or nothing: for the Telegram base from the environment and the stand-in's from alerts.yaml. */
export function hostOf(url: string | undefined): string[] {
  if (!url) return [];
  try {
    return [new URL(url).hostname];
  } catch {
    return [];
  }
}

/**
 * instrumentation-pg's requestHook. The store sets grafana_ro's password as a SCRAM verifier inside the statement
 * text, and a verifier is as sensitive as a password hash, so that text never reaches a span. Other queries carry
 * placeholders, never values (enhancedDatabaseReporting stays off).
 */
export function scrubPgQuery(span: ApiSpan, info: PgRequestHookInformation): void {
  if (/^\s*ALTER\s+ROLE\b/i.test(info.query.text)) {
    span.setAttribute(ATTR_DB_QUERY_TEXT, "ALTER ROLE grafana_ro PASSWORD [redacted]");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The server span (telemetry.md §3.3): h4.stack, h4.outcome, h4.degraded.cause, and error.type
// ---------------------------------------------------------------------------------------------------------------

/** Where instrumentation-http's requestHook leaves an incoming request's SERVER span, for the routes to annotate. */
export const SERVER_SPAN = Symbol.for("h4.gateway.server-span");

/**
 * instrumentation-http's requestHook, for incoming requests only. An outgoing ClientRequest has setHeader; an
 * IncomingMessage doesn't. (Duck-typed, so this module needn't load node:http before the SDK has started.)
 */
export function rememberServerSpan(span: ApiSpan, request: unknown): void {
  const r = request as { setHeader?: unknown; headers?: unknown } | null;
  if (r === null || typeof r !== "object" || typeof r.setHeader === "function" || typeof r.headers !== "object") return;
  (r as Record<symbol, ApiSpan>)[SERVER_SPAN] = span;
}

/**
 * A request's SERVER span: instrumentation-http's, in the running gateway; or @fastify/otel's request span, which is
 * the SERVER span when nothing instruments node:http (Fastify's inject, in tests). Undefined without telemetry.
 */
export function serverSpanOf(request: { raw: object }): ApiSpan | undefined {
  const fromHttp = (request.raw as Record<symbol, ApiSpan | undefined>)[SERVER_SPAN];
  if (fromHttp !== undefined) return fromHttp;
  const otel = (request as { opentelemetry?: () => { span?: ApiSpan | null } }).opentelemetry;
  return typeof otel === "function" ? (otel.call(request).span ?? undefined) : undefined;
}

export type ServerOutcome = "ok" | "degraded" | "refused" | "invalid" | "error" | "unauthorized";

/**
 * h4.outcome for a response status (telemetry.md §3.3): ok, degraded (a 503 with a degraded cause), refused (429; and
 * an admin refusal, 403 or 409), invalid (another 4xx), error (another 5xx), or unauthorized (401).
 */
export function outcomeOf(status: number, degraded: boolean): ServerOutcome {
  if (status < 400) return "ok";
  if (status === 401) return "unauthorized";
  if (status === 429 || status === 403 || status === 409) return "refused";
  if (status === 503 && degraded) return "degraded";
  if (status >= 500) return "error";
  return "invalid";
}

const errorTypes = new WeakMap<object, string>();

/** error.type for a request whose outcome is error: local_error, or the class of an unexpected error. */
export function noteErrorType(request: object, errorType: string): void {
  errorTypes.set(request, errorType);
}

/**
 * spec 003's studio GPU window (its contracts/gpu-window.md §1): the request's state, start or end, on its server
 * span, once the body has a valid one. The reason never goes on a span.
 */
export function noteStudioWindowState(request: { raw: object }, state: "start" | "end"): void {
  serverSpanOf(request)?.setAttribute("h4.studio_window.state", state);
}

/**
 * The operator write a request made, as its server span's h4.action (spec 011, FR-047): `alert_samples`, once the
 * request reached its route. The reason never goes on a span.
 */
export function noteAction(request: { raw: object }, action: "alert_samples"): void {
  serverSpanOf(request)?.setAttribute("h4.action", action);
}

// ---------------------------------------------------------------------------------------------------------------
// alert.deliver (spec 011, plan §9.3; telemetry.md §3.2): one INTERNAL root span per delivery attempt
// ---------------------------------------------------------------------------------------------------------------

export const ALERT_DELIVER_SPAN = "alert.deliver";
const ALERT_SPAN_CHANNELS = ["telegram", "email"] as const;
const ALERT_SPAN_FORMS = ["designed", "plain"] as const;
const ALERT_SPAN_OUTCOMES = ["delivered", "retry", "failed"] as const;
const ALERT_SPAN_KINDS = [
  "warn",
  "trip",
  "fallback_exhausted",
  "operator_action",
  "credentials_expiring",
  "fallback_unavailable",
  "auth_failed",
  "store_unreachable",
  "reminder",
  "sample",
] as const;
const ALERT_SPAN_REASONS = [
  "entities_refused",
  "message_refused",
  "render_failed",
  "over_limit",
  "not_rendered",
] as const;
const pick = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  (list as readonly unknown[]).includes(value) ? (value as T) : fallback;

/**
 * An attempt's attributes, each from its closed list or a number: the channel, the kind, the form, a fallback's reason
 * when one applies, the outcome, the attempt, and whether it is a sample. Never a text, a URL, a token, a chat ID, an
 * address, or a response body (FR-044): nothing a caller passes beside these reaches the span.
 */
export function alertDeliverAttributes(o: {
  channel: string;
  kind: string;
  form: string;
  fallbackReason?: string | null;
  outcome: string;
  attempt: number;
  sample: boolean;
}): Attributes {
  const attributes: Attributes = {
    "h4.channel": pick(ALERT_SPAN_CHANNELS, o.channel, "telegram"),
    "h4.alert.kind": pick(ALERT_SPAN_KINDS, o.kind, "warn"),
    "h4.alert.form": pick(ALERT_SPAN_FORMS, o.form, "plain"),
    "h4.outcome": pick(ALERT_SPAN_OUTCOMES, o.outcome, "failed"),
    "h4.alert.attempt": Number.isSafeInteger(o.attempt) ? o.attempt : 0,
    "h4.alert.sample": o.sample === true,
  };
  if (o.fallbackReason !== undefined && o.fallbackReason !== null) {
    attributes["h4.alert.fallback_reason"] = pick(ALERT_SPAN_REASONS, o.fallbackReason, "render_failed");
  }
  return attributes;
}

/** Sets the server span's h4 attributes as the response goes out. */
export function annotateServerSpan(
  request: { raw: object },
  o: { stack: string; status: number; degradedCause: string | undefined },
): void {
  const span = serverSpanOf(request);
  if (span === undefined) return;
  const outcome = outcomeOf(o.status, o.degradedCause !== undefined);
  span.setAttributes({ "h4.stack": o.stack, "h4.outcome": outcome });
  if (outcome === "degraded" && o.degradedCause !== undefined) span.setAttribute("h4.degraded.cause", o.degradedCause);
  if (outcome === "error") span.setAttribute("error.type", errorTypes.get(request) ?? `http_${o.status}`);
}

/** Removes the client attributes and a query string from every span, then hands it to the next processor. */
export class ClientAttributeStripper implements tracing.SpanProcessor {
  constructor(private readonly next: tracing.SpanProcessor) {}

  onStart(span: tracing.Span, parentContext: Context): void {
    this.next.onStart(span, parentContext);
  }

  onEnd(span: tracing.ReadableSpan): void {
    this.next.onEnd(stripped(span));
  }

  forceFlush(): Promise<void> {
    return this.next.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.next.shutdown();
  }
}

function stripped(span: tracing.ReadableSpan): tracing.ReadableSpan {
  const attributes = { ...span.attributes };
  let changed = false;
  for (const key of STRIPPED_SPAN_ATTRIBUTES) {
    if (key in attributes) {
      delete attributes[key];
      changed = true;
    }
  }
  const path = attributes["url.path"];
  if (typeof path === "string" && path.includes("?")) {
    attributes["url.path"] = path.slice(0, path.indexOf("?"));
    changed = true;
  }
  // The ended span is read-only; a view over it with other attributes is what the exporter reads.
  return changed
    ? (Object.create(span, { attributes: { value: attributes, enumerable: true } }) as tracing.ReadableSpan)
    : span;
}

/**
 * The OTLP exporters' connections: keep-alive, as the exporters' own default is, with the collector's name resolved
 * through c-ares (core/resolve.ts). An export to a stopped collector then holds neither of the two threads libuv gives
 * lookups, which the store's connections need (tasks.md T189). Unlike the default agent, it reads no /etc/hosts, a
 * c-ares ETIMEOUT or ESERVFAIL isn't one of the exporter's retryable codes, and on https it would ignore the
 * environment's OTEL_EXPORTER_OTLP_*CERTIFICATE; the collector is plain http inside the stack.
 */
export const EXPORT_AGENT: Readonly<AgentOptions> = Object.freeze({ keepAlive: true, lookup: aresLookup });

/** OTLP/HTTP metrics, cumulative for every instrument type: Prometheus accepts only cumulative. */
export function metricExporter(): OTLPMetricExporter {
  return new OTLPMetricExporter({
    temporalityPreference: AggregationTemporality.CUMULATIVE,
    httpAgentOptions: EXPORT_AGENT,
  });
}

/** The environment's resource (OTEL_SERVICE_NAME, OTEL_RESOURCE_ATTRIBUTES) and the package's version. */
export function buildResource(version: string): Resource {
  return defaultResource()
    .merge(detectResources({ detectors: [envDetector] }))
    .merge(resourceFromAttributes({ "service.version": version }));
}

export interface TelemetryOptions {
  /** The gateway's package version: service.version. */
  version: string;
  /** In-memory exporters for tests; OTLP over HTTP otherwise. */
  exporters?: { traces?: tracing.SpanExporter; metrics?: PushMetricExporter; logs?: LogRecordExporter };
  /** Hosts besides api.telegram.org whose requests carry the bot token: the stand-in's, in dev. */
  telegramHosts?: readonly string[];
}

const secondsView = (instrumentName: string): ViewOptions => ({
  instrumentName,
  aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries: [...SECONDS_BUCKETS] } },
});

export function buildSdkConfiguration(opts: TelemetryOptions): Partial<NodeSDKConfiguration> {
  const traces = opts.exporters?.traces ?? new OTLPTraceExporter({ httpAgentOptions: EXPORT_AGENT });
  const metrics = opts.exporters?.metrics ?? metricExporter();
  const logs = opts.exporters?.logs ?? new OTLPLogExporter({ httpAgentOptions: EXPORT_AGENT });
  return {
    resource: buildResource(opts.version),
    autoDetectResources: false,
    spanProcessors: [new ClientAttributeStripper(new tracing.BatchSpanProcessor(traces, { ...SPAN_BATCH }))],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: metrics,
        exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
        exportTimeoutMillis: EXPORT_TIMEOUT_MS,
      }),
    ],
    // The instrumentations' own `s` histograms get the gateway's buckets too; its own instruments carry them as advice.
    views: [secondsView("http.server.request.duration"), secondsView("http.client.request.duration")],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: logs })],
    instrumentations: [
      new HttpInstrumentation({
        enabled: false,
        ignoreIncomingRequestHook: (req) => isHealthProbe(req.url),
        ignoreOutgoingRequestHook: httpIgnoreOutgoingHook(opts.telegramHosts),
        requireParentforOutgoingSpans: true,
        requestHook: rememberServerSpan,
      }),
      new UndiciInstrumentation({
        enabled: false,
        ignoreRequestHook: undiciIgnoreHook(opts.telegramHosts),
        requireParentforSpans: true,
      }),
      new PgInstrumentation({
        enabled: false,
        requireParentSpan: true,
        enhancedDatabaseReporting: false,
        requestHook: scrubPgQuery,
      }),
      // Log sending stays on; correlation is log.ts's own mixin, the same fields whether or not pino is wrapped.
      new PinoInstrumentation({ enabled: false, disableLogCorrelation: true }),
      new FastifyOtelInstrumentation({
        enabled: false,
        registerOnInitialization: true,
        ignorePaths: (route) => isHealthProbe(route.url),
      }),
    ],
  };
}

export interface Telemetry {
  /** Flushes the batches and stops the exporters: graceful shutdown's last step. */
  shutdown(): Promise<void>;
}

/** Starts the SDK and enables the instrumentations. Call it before loading Fastify, pg, or pino. */
export function startTelemetry(opts: TelemetryOptions): Telemetry {
  const config = buildSdkConfiguration(opts);
  const sdk = new NodeSDK(config);
  sdk.start();
  // start() subscribes the undici instrumentation, but it makes a span, and injects trace context, only while its
  // config says enabled; built switched off, it would record no outgoing fetch at all.
  for (const instrumentation of config.instrumentations ?? []) {
    if (instrumentation instanceof UndiciInstrumentation) {
      instrumentation.setConfig({ ...instrumentation.getConfig(), enabled: true });
    }
  }
  return { shutdown: () => sdk.shutdown() };
}
