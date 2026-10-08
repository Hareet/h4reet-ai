// The gateway's logger (contracts/telemetry.md §5): pino 10.4.0, JSON on stdout, and OTLP to the collector through
// @opentelemetry/instrumentation-pino.
//
// - Every record has `time`, `level`, `msg` (a fixed sentence per event that never interpolates request content),
//   `event`, and `h4.stack`; and `trace_id`, `span_id`, and `trace_flags` when a span is active.
// - pino's `redact` censors §5.3's fixed paths, and a `formatters.log` hook censors any key whose name says it may
//   hold a credential or a payload, at any depth (redact.ts).
// - No host or pid: they would be resource attributes, which telemetry.md §2 leaves out.
import { createRequire } from "node:module";

import { context, isSpanContextValid, trace } from "@opentelemetry/api";
import type pino from "pino";

import { CENSORED, censorKeys } from "./redact.js";

export type Logger = pino.Logger;

/** telemetry.md §5.3's fixed paths. */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.authorization",
  "*.password",
  "*.token",
  "messages",
  "*.messages",
] as const;

export interface LoggerOptions {
  /** H4_STACK, on every record. */
  stack: string;
  level?: string;
  /** stdout when absent. */
  destination?: pino.DestinationStream;
}

/** The active span's IDs, in instrumentation-pino's own field names, so its correlation can stay off. */
function correlation(): Record<string, string> {
  const spanContext = trace.getSpan(context.active())?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) return {};
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: `0${spanContext.traceFlags.toString(16)}`,
  };
}

/**
 * pino loads through require when the first logger is made, which is after the telemetry SDK has started, so that its
 * instrumentation can wrap it and send each record over OTLP (telemetry.md §3.1, §5.1).
 */
export function createLogger(opts: LoggerOptions): Logger {
  const pinoFn = createRequire(import.meta.url)("pino") as typeof pino;
  const options: pino.LoggerOptions = {
    level: opts.level ?? "info",
    base: { "h4.stack": opts.stack },
    timestamp: pinoFn.stdTimeFunctions.isoTime,
    redact: { paths: [...REDACT_PATHS], censor: CENSORED },
    formatters: {
      log: (record) => censorKeys(record),
      bindings: (bindings) => censorKeys(bindings),
    },
    mixin: correlation,
  };
  return opts.destination === undefined ? pinoFn(options) : pinoFn(options, opts.destination);
}
