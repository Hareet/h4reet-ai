// The relay's entry point: `node dist/server.js` in its container (spec 001 tasks.md T106; contracts/relay-http.md).
//
// The configuration is read first, and a refusal exits 78 with each problem on its own line. Then the telemetry SDK
// starts, OTLP over HTTP to the tunnel end's collector, with the resource from the environment alone, so no cloud
// detector calls the instance's metadata. Then the store's two pools, the host checks every second, and the three
// listeners, until SIGTERM or SIGINT.
import { readFile } from "node:fs/promises";

import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { detectResources, envDetector } from "@opentelemetry/resources";
import { AggregationTemporality, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK, tracing } from "@opentelemetry/sdk-node";
import pino from "pino";

import { EDGE_PORT, HEALTH_PORT, INTERNAL_PORT } from "./app.js";
import { assemble, prepare } from "./start.js";
import { PgHandoverWriter, PgStateSource, poolFor } from "./store.js";

const env = process.env;
const budgetsPath = env.RELAY_BUDGETS || "/app/config/budgets.yaml";
const budgetsText = await readFile(budgetsPath, "utf8").catch(() => undefined);
const ready = prepare(env, budgetsText);
if (ready.kind === "refused") {
  for (const line of ready.lines) process.stderr.write(`${line}\n`);
  process.exit(ready.exitCode);
}

const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
const sdk =
  endpoint === undefined || endpoint === ""
    ? undefined
    : new NodeSDK({
        resource: detectResources({ detectors: [envDetector] }),
        autoDetectResources: false,
        instrumentations: [],
        spanProcessors: [
          new tracing.BatchSpanProcessor(new OTLPTraceExporter(), { maxQueueSize: 2_048, scheduledDelayMillis: 1_000 }),
        ],
        metricReaders: [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({ temporalityPreference: AggregationTemporality.CUMULATIVE }),
            exportIntervalMillis: 10_000,
            exportTimeoutMillis: 5_000,
          }),
        ],
      });
sdk?.start();

const logger = pino({
  level: "info",
  base: { "h4.stack": ready.env.stack, service: "relay" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
const statePool = poolFor(ready.env.stateDb);
const handoverPool = ready.env.handoverDb === undefined ? undefined : poolFor(ready.env.handoverDb);
const writer = handoverPool === undefined ? undefined : new PgHandoverWriter(handoverPool);
if (writer === undefined) {
  logger.warn({ event: "relay.handovers_off" }, "This relay records no handover: no relay_rw is configured.");
}
const running = assemble(ready, new PgStateSource(statePool), writer && ((e) => writer.record(e)), logger);
running.start();

await running.listeners.health.listen({ host: "0.0.0.0", port: HEALTH_PORT });
await running.listeners.internal.listen({ host: "0.0.0.0", port: INTERNAL_PORT });
await running.listeners.edge.listen({ host: "0.0.0.0", port: EDGE_PORT });
logger.info({ event: "relay.started", hosts: ready.env.hosts.map((h) => h.name) }, "The relay is listening.");

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    logger.info({ event: "relay.stopping", signal }, "The relay is stopping.");
    setTimeout(() => process.exit(1), 15_000).unref();
    running.stop();
    void (async () => {
      for (const app of [running.listeners.edge, running.listeners.internal, running.listeners.health]) {
        await app.close().catch(() => {});
      }
      await statePool.end().catch(() => {});
      await handoverPool?.end().catch(() => {});
      await sdk?.shutdown().catch(() => {});
      process.exit(0);
    })();
  });
}
