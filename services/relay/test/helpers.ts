// The relay suite's stubs (spec 001 tasks.md T098; contracts/relay-http.md): stub hosts, real HTTP servers on
// loopback that record what reached them; a stub store whose state the test sets; a log that the test reads; and
// in-memory span and metric exporters. Test figures for the public cap live here, never in config/budgets.yaml.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";

import { context, metrics, trace } from "@opentelemetry/api";
import { metrics as sdkMetrics, node, tracing } from "@opentelemetry/sdk-node";
import pino from "pino";

import { parseRanges } from "../src/peer.js";
import type { PublicCapFigures } from "../src/cap.js";
import type { StateRow, StateSource } from "../src/killswitch.js";

/** The tests' own figures for the cap: small, so a test reaches each limit in a few requests. */
export const TEST_FIGURES: PublicCapFigures = { requestsPerMinute: 6, burst: 3, requestsPerDay: 10, inFlight: 2 };

/** A public section with the tests' figures, as P-6 shapes it once the Author fills it in. */
export const TEST_PUBLIC = `public:
  per_address:
    requests_per_minute: 6
    burst: 3
    requests_per_day: 10
  global:
    in_flight: 2
`;

/** An address from the documentation ranges, the viewer's, as CloudFront sends it with its port. */
export const VIEWER = "203.0.113.77";
export const VIEWER_HEADER = `${VIEWER}:51234`;
/** A peer the edge listener believes: CloudFront's VPC origin reaches the relay from inside the VPC. */
export const EDGE_PEER = "10.42.1.200";
/** The tunnel end's refused ranges, as compose writes them. */
export const REFUSED = "127.0.0.0/8,::1/128,172.30.0.0/16,10.42.0.10/32,10.42.1.10/32";
export const refusedPeers = () => parseRanges(REFUSED).list;

export interface Received {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: IncomingMessage["headers"];
  readonly body: string;
}

export interface StubHost {
  readonly url: string;
  readonly received: Received[];
  /** What the next forwarded request gets; the health check gets `health`. */
  answer: { status: number; headers?: Record<string, string>; body: string; delayMs?: number };
  health: number;
  close(): Promise<void>;
}

export async function stubHost(): Promise<StubHost> {
  const received: Received[] = [];
  const host: Partial<StubHost> & { answer: StubHost["answer"]; health: number } = {
    answer: { status: 200, headers: { "content-type": "application/json" }, body: '{"answer":"hi"}' },
    health: 200,
  };
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(host.health).end();
        return;
      }
      received.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
      const a = host.answer;
      setTimeout(() => res.writeHead(a.status, a.headers ?? {}).end(a.body), a.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return Object.assign(host, {
    url: `http://127.0.0.1:${port}`,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  }) as StubHost;
}

/** A port nothing listens on: connecting to it fails before a byte is sent. */
export async function deadUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

export class StubStore implements StateSource {
  row: StateRow | null = { state: "normal", since: "2026-11-12T09:00:00Z", crossed: null };
  failing = false;
  reads = 0;
  async read(): Promise<StateRow | null> {
    this.reads += 1;
    if (this.failing) throw new Error("connection refused");
    return this.row;
  }
}

export class Clock {
  t = Date.UTC(2026, 10, 12, 9, 0, 0);
  now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

/** Every line the relay logs, as text, for the tests that look for what must never be in it. */
export function captureLog(): { logger: pino.Logger; text(): string } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { logger: pino({ level: "debug" }, stream), text: () => lines.join("") };
}

/** In-memory spans and metrics, registered globally for the suite. */
export function telemetryCapture() {
  const spans = new tracing.InMemorySpanExporter();
  const provider = new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(spans)] });
  provider.register();
  const exporter = new sdkMetrics.InMemoryMetricExporter(sdkMetrics.AggregationTemporality.CUMULATIVE);
  const reader = new sdkMetrics.PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  const meterProvider = new sdkMetrics.MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(meterProvider);
  return {
    spans,
    async metricsJson(): Promise<string> {
      const result = await reader.collect();
      return JSON.stringify(
        result.resourceMetrics.scopeMetrics.flatMap((s) =>
          s.metrics.map((m) => ({ name: m.descriptor.name, points: m.dataPoints.map((p) => [p.attributes, p.value]) })),
        ),
      );
    },
    async close(): Promise<void> {
      await provider.shutdown();
      await meterProvider.shutdown();
      trace.disable();
      context.disable();
      metrics.disable();
    },
  };
}

/** A relay environment as the tunnel end's compose gives it, with the stub hosts' addresses. */
export function relayEnv(laptop: string, ec2: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const ca = Buffer.from("-----BEGIN CERTIFICATE-----\nTUlJQ-test-only\n-----END CERTIFICATE-----\n").toString(
    "base64",
  );
  const token = (who: string) => `${who}-`.padEnd(40, "t");
  return {
    H4_STACK: "prod",
    RELAY_LAPTOP_URL: laptop,
    RELAY_EC2_URL: ec2,
    RELAY_TOKEN_LAPTOP: token("laptop"),
    RELAY_TOKEN_EC2: token("ec2"),
    RELAY_REFUSED_PEERS: REFUSED,
    RELAY_DB_HOST: "shared-state",
    RELAY_DB_NAME: "h4reet",
    RELAY_DB_RO_USER: "relay_ro",
    RELAY_DB_RO_PASSWORD: "ro-test-password",
    RELAY_DB_RW_USER: "relay_rw",
    RELAY_DB_RW_PASSWORD: "rw-test-password",
    RELAY_DB_TLS_CA: ca,
    RELAY_DB_TLS_SERVERNAME: "shared-state",
    ...extra,
  };
}
