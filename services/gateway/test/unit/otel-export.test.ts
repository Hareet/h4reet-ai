// The OTLP exporters' connections (telemetry/otel.ts's EXPORT_AGENT; tasks.md T189): keep-alive, with the collector's
// name resolved through c-ares, so an export to a stopped collector holds neither of the two threads libuv gives
// lookups. c-ares's queries are replaced for one made-up host, which getaddrinfo could never resolve, so a signal that
// reaches the listener behind it proves its exporter asked c-ares.
import dns from "node:dns";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { LoggerProvider } from "@opentelemetry/sdk-logs";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { tracing } from "@opentelemetry/sdk-node";
import { afterEach, describe, expect, it, vi } from "vitest";

import { aresLookup } from "../../src/core/resolve.js";
import { buildSdkConfiguration, EXPORT_AGENT } from "../../src/telemetry/otel.js";

const HOST = "otel-collector.invalid";

type Resolve = (this: dns.Resolver, host: string, ...rest: unknown[]) => void;

/** c-ares's answers for HOST alone: A answers 127.0.0.1, and AAAA has no record. Returns the HOST queries asked. */
function resolveHost(): string[] {
  const proto = dns.Resolver.prototype as unknown as { resolve4: Resolve; resolve6: Resolve };
  const asked: string[] = [];
  const fake = (type: "A" | "AAAA", real: Resolve): Resolve =>
    function (this: dns.Resolver, host: string, ...rest: unknown[]): void {
      if (host !== HOST) return real.call(this, host, ...rest);
      asked.push(`${type} ${host}`);
      const done = rest[rest.length - 1] as (err: NodeJS.ErrnoException | null, addresses: string[]) => void;
      setImmediate(() =>
        type === "A"
          ? done(null, ["127.0.0.1"])
          : done(Object.assign(new Error(`queryAaaa ENODATA ${host}`), { code: "ENODATA" }), []),
      );
    };
  const [real4, real6] = [proto.resolve4, proto.resolve6];
  vi.spyOn(proto, "resolve4").mockImplementation(fake("A", real4));
  vi.spyOn(proto, "resolve6").mockImplementation(fake("AAAA", real6));
  return asked;
}

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A stand-in collector on 127.0.0.1: it answers every export with an empty 200 and records each request's path. */
async function collector(): Promise<{ port: number; seen: string[] }> {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/x-protobuf" });
      res.end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, seen };
}

describe("the OTLP exporters' connections (T189)", () => {
  it("keep alive, as the exporters' own default does, and resolve through c-ares", () => {
    expect(EXPORT_AGENT).toEqual({ keepAlive: true, lookup: aresLookup });
    expect(Object.isFrozen(EXPORT_AGENT)).toBe(true);
  });

  it("deliver a span to a collector only c-ares can name", async () => {
    const asked = resolveHost();
    const api = await collector();
    const exporter = new OTLPTraceExporter({
      url: `http://${HOST}:${api.port}/v1/traces`,
      httpAgentOptions: EXPORT_AGENT,
    });
    const provider = new tracing.BasicTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(exporter)] });
    try {
      provider.getTracer("t189").startSpan("an export through c-ares").end();
      await vi.waitFor(() => expect(api.seen).toEqual(["POST /v1/traces"]), { timeout: 5_000 });
      expect(asked[0]).toBe(`A ${HOST}`);
    } finally {
      await provider.shutdown();
    }
  });

  it("are the ones the gateway's own configuration builds, for traces, metrics, and logs alike", async () => {
    // Each signal goes through buildSdkConfiguration's own processor or reader, to the endpoint the environment names.
    // An exporter built without EXPORT_AGENT would ask getaddrinfo, which can't name the host, and its signal would
    // never arrive (the T189 review's S1).
    resolveHost();
    const api = await collector();
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", `http://${HOST}:${api.port}`);
    const config = buildSdkConfiguration({ version: "t189" });
    const tracer = new tracing.BasicTracerProvider({ spanProcessors: config.spanProcessors ?? [] });
    const meter = new MeterProvider({ readers: config.metricReaders ?? [] });
    const logger = new LoggerProvider({ processors: config.logRecordProcessors ?? [] });
    try {
      tracer.getTracer("t189").startSpan("wired").end();
      meter.getMeter("t189").createCounter("t189_wired").add(1);
      logger.getLogger("t189").emit({ body: "wired" });
      await Promise.all([tracer.forceFlush(), meter.forceFlush(), logger.forceFlush()]);
      await vi.waitFor(
        () => expect([...new Set(api.seen)].sort()).toEqual(["POST /v1/logs", "POST /v1/metrics", "POST /v1/traces"]),
        { timeout: 8_000 },
      );
    } finally {
      await Promise.all([tracer.shutdown(), meter.shutdown(), logger.shutdown()]);
    }
  });
});
