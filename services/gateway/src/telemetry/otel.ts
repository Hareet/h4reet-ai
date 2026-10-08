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
// - A span processor drops the client attributes before export, and the undici instrumentation skips the Telegram
//   API host, whose URL path carries the bot token. The collector repeats both as a second layer (§6.3).
//
// Instrumentations are built switched off, so building this configuration patches nothing; NodeSDK.start() enables
// them. server.ts starts the SDK before it loads Fastify, pg, or pino, so their instrumentations can wrap them.
import { FastifyOtelInstrumentation } from "@fastify/otel";
import type { Context, Span as ApiSpan } from "@opentelemetry/api";
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

import { SECONDS_BUCKETS } from "./metrics.js";

export const METRIC_EXPORT_INTERVAL_MS = 10_000;
/** OTEL_EXPORTER_OTLP_TIMEOUT's value; a metric export must also finish within its interval. */
export const EXPORT_TIMEOUT_MS = 5_000;
/** A full queue drops spans; it never blocks a request (§3.1). */
export const SPAN_BATCH = { maxQueueSize: 2_048, scheduledDelayMillis: 1_000 } as const;
export const TELEGRAM_API_HOST = "api.telegram.org";

/** What the gateway removes from its spans before export (§3.1); the collector deletes them again (§6.3). */
export const STRIPPED_SPAN_ATTRIBUTES = [
  "client.address",
  "client.port",
  "network.peer.address",
  "network.peer.port",
  "user_agent.original",
] as const;

const HEALTH_PATHS = new Set(["/health/live", "/health"]);

/** GET /health/live and GET /health produce no spans (§3.1). */
export function isHealthProbe(url: string | undefined): boolean {
  if (url === undefined) return false;
  const q = url.indexOf("?");
  return HEALTH_PATHS.has(q === -1 ? url : url.slice(0, q));
}

/**
 * instrumentation-undici's ignoreRequestHook: no client span for the Telegram API, or for the configured stand-in,
 * because the URL's path carries the bot token (alerts.md §4.1). An origin that doesn't parse is skipped too.
 */
export function undiciIgnoreHook(
  extraHosts: readonly string[] = [],
): (req: { origin: string; path: string }) => boolean {
  const hosts = new Set([TELEGRAM_API_HOST, ...extraHosts.map((h) => h.toLowerCase())]);
  return (req) => {
    try {
      return hosts.has(new URL(req.origin).hostname.toLowerCase());
    } catch {
      return true;
    }
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

/** OTLP/HTTP metrics, cumulative for every instrument type: Prometheus accepts only cumulative. */
export function metricExporter(): OTLPMetricExporter {
  return new OTLPMetricExporter({ temporalityPreference: AggregationTemporality.CUMULATIVE });
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
  const traces = opts.exporters?.traces ?? new OTLPTraceExporter();
  const metrics = opts.exporters?.metrics ?? metricExporter();
  const logs = opts.exporters?.logs ?? new OTLPLogExporter();
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
        requireParentforOutgoingSpans: true,
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
  const sdk = new NodeSDK(buildSdkConfiguration(opts));
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}
