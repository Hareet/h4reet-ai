// The OTLP exporters' connections (telemetry/otel.ts's EXPORT_AGENT; tasks.md T189): keep-alive, with the collector's
// name resolved through c-ares, so an export to a stopped collector holds neither of the two threads libuv gives
// lookups. c-ares's queries are replaced for one made-up host, which getaddrinfo could never resolve, so a span that
// reaches the listener behind it proves the export asked c-ares.
import dns from "node:dns";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { tracing } from "@opentelemetry/sdk-node";
import { afterEach, describe, expect, it, vi } from "vitest";

import { aresLookup } from "../../src/core/resolve.js";
import { EXPORT_AGENT } from "../../src/telemetry/otel.js";

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

describe("the OTLP exporters' connections (T189)", () => {
  it("keep alive, as the exporters' own default does, and resolve through c-ares", () => {
    expect(EXPORT_AGENT).toEqual({ keepAlive: true, lookup: aresLookup });
  });

  it("deliver a span to a collector only c-ares can name", async () => {
    const asked = resolveHost();
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
    const { port } = server.address() as AddressInfo;
    const exporter = new OTLPTraceExporter({ url: `http://${HOST}:${port}/v1/traces`, httpAgentOptions: EXPORT_AGENT });
    const provider = new tracing.BasicTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(exporter)] });
    provider.getTracer("t189").startSpan("an export through c-ares").end();
    await vi.waitFor(() => expect(seen).toEqual(["POST /v1/traces"]), { timeout: 5_000 });
    expect(asked[0]).toBe(`A ${HOST}`);
    await provider.shutdown();
  });
});
