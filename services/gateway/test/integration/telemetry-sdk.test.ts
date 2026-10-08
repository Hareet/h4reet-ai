// The SDK as the gateway starts it (telemetry.md §3.1, §5.1), with exporters that keep what they receive. In its
// own file because it registers the global providers and enables the instrumentations for its worker.
//
// It proves what the unit tests can't: pino, loaded through require after startTelemetry(), is wrapped by
// instrumentation-pino and sends each record over OTLP, redacted as on stdout; and a span reaches the exporter
// without its client attributes, on the environment's resource.
import { trace } from "@opentelemetry/api";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { metrics as sdkMetrics, type tracing } from "@opentelemetry/sdk-node";
import { describe, expect, it, vi } from "vitest";

import { startTelemetry } from "../../src/telemetry/otel.js";

/** An exporter that keeps its records past shutdown, unlike the SDK's in-memory ones. */
function keeping<T>() {
  const got: T[] = [];
  return {
    got,
    exporter: {
      export(items: T[], done: (result: { code: number }) => void) {
        got.push(...items);
        done({ code: 0 });
      },
      shutdown: async () => {},
      forceFlush: async () => {},
    },
  };
}

describe("the started SDK", () => {
  it("sends pino's records over OTLP, redacted, and spans without their client attributes", async () => {
    vi.stubEnv("OTEL_SERVICE_NAME", "gateway");
    vi.stubEnv("OTEL_RESOURCE_ATTRIBUTES", "service.namespace=h4reet,deployment.environment.name=dev");
    const logs = keeping<ReadableLogRecord>();
    const spans = keeping<tracing.ReadableSpan>();
    const telemetry = startTelemetry({
      version: "0.1.0",
      exporters: {
        logs: logs.exporter as unknown as LogRecordExporter,
        traces: spans.exporter as unknown as tracing.SpanExporter,
        metrics: new sdkMetrics.InMemoryMetricExporter(sdkMetrics.AggregationTemporality.CUMULATIVE),
      },
    });
    // log.ts requires pino only now, after the SDK has started.
    const { createLogger } = await import("../../src/telemetry/log.js");
    const lines: string[] = [];
    const logger = createLogger({ stack: "dev", destination: { write: (s: string) => void lines.push(s) } });
    logger.info({ event: "gateway.started", password: "not-for-logs", input_tokens: 3 }, "The gateway started.");

    trace
      .getTracer("gateway")
      .startSpan("POST /hello", { attributes: { "client.address": "10.0.0.7", "http.route": "/hello" } })
      .end();
    await telemetry.shutdown();

    expect(lines).toHaveLength(1);
    expect(logs.got).toHaveLength(1);
    const record = logs.got[0] as ReadableLogRecord;
    expect(record.body).toBe("The gateway started.");
    expect(record.severityNumber).toBe(9);
    expect(record.attributes).toMatchObject({ event: "gateway.started", "h4.stack": "dev", input_tokens: 3 });
    expect(record.attributes.password).toBe("[redacted]");
    expect(JSON.stringify(record.attributes)).not.toContain("not-for-logs");

    expect(spans.got.map((s) => s.attributes)).toEqual([{ "http.route": "/hello" }]);
    expect(spans.got[0]?.resource.attributes).toMatchObject({
      "service.name": "gateway",
      "service.namespace": "h4reet",
      "deployment.environment.name": "dev",
      "service.version": "0.1.0",
    });
  });
});
