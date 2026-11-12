// The relay's three listeners and its processing order (spec 001 FR-029 to FR-037, FR-054, FR-061, FR-066;
// contracts/relay-http.md §1 to §7).
//
//   8080, edge      CloudFront's VPC origin only: the peer rule, then POST /api/hello, /api/room/turn,
//                   /api/room/events, and GET /api/status
//   8081, internal  the Author's session and the snapshot sink: GET /api/status, and POST /api/hello with the fixed
//                   identity 192.0.2.10 (FR-032's one exception)
//   8082, health    GET /health/live, for the container's own check
//
// A forwarded request goes: the probe mark; the client's address; the public cap; the kill switch, read every request,
// within 10 s; the host; the forward and its headers; the answer, a host's 502 or 504 becoming a 503 with its cause.
// The relay keeps no body once it has answered, and no address but the cap's, in memory, for a UTC day at most.
import { randomBytes } from "node:crypto";
import type { BlockList } from "node:net";

import {
  context,
  INVALID_SPAN_CONTEXT,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type pino from "pino";

import { capRefused, degraded, hostFailure, refusal, type RelayCause } from "./bodies.js";
import type { PublicCap } from "./cap.js";
import type { HostTarget } from "./config.js";
import { forward as defaultForward, type ForwardPath, type ForwardRequest, type ForwardResult } from "./forward.js";
import type { HostChoice, HostName } from "./hosts.js";
import type { KillSwitch, Verdict } from "./killswitch.js";
import { refusedPeer, viewerAddress } from "./peer.js";
import { SPAN, type Outcome, type RelayTelemetry } from "./telemetry.js";

export const EDGE_PORT = 8080;
export const INTERNAL_PORT = 8081;
export const HEALTH_PORT = 8082;
/** FR-032's one named exception: the internal listener's hello, the Author's and the sink's, as one fixed identity. */
export const INTERNAL_IDENTITY = "192.0.2.10";

/** The relay's routes and what each forwards, with its body limit: spec 000's, spec 007's, and spec 002's. */
export const ROUTES: Readonly<Record<string, { readonly path: ForwardPath; readonly limit: number }>> = {
  "/api/hello": { path: "/hello", limit: 16_384 },
  "/api/room/turn": { path: "/room/turn", limit: 32_768 },
  "/api/room/events": { path: "/room/events", limit: 512 },
};

export type Ec2State = "running" | "pending" | "stopping" | "stopped" | "interrupted" | "unknown";

export interface RelayDeps {
  readonly stack: string;
  readonly cap: PublicCap;
  readonly hosts: HostChoice;
  readonly targets: ReadonlyMap<HostName, HostTarget>;
  readonly killSwitch: KillSwitch;
  readonly refusedPeers: BlockList;
  readonly telemetry: RelayTelemetry;
  readonly logger: pino.Logger;
  readonly now?: () => number;
  readonly forward?: (target: HostTarget, req: ForwardRequest) => Promise<ForwardResult>;
  /** EC2's state as the snapshot sink last read it, at most 2 minutes old (contracts/public-view.md §2); group 10's
   *  sink brings it, and until then the relay says `unknown`. */
  readonly ec2State?: () => Ec2State;
}

type Listener = "edge" | "internal";

interface Done {
  status: number;
  host: HostName | "none";
  cause: string | null;
  outcome: Outcome;
  reason?: string;
  capLimit?: string;
}

const isoSeconds = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const header = (req: FastifyRequest, name: string): string | undefined => {
  const v = req.headers[name];
  return typeof v === "string" ? v : undefined;
};

export function buildRelay(deps: RelayDeps): {
  edge: FastifyInstance;
  internal: FastifyInstance;
  health: FastifyInstance;
} {
  const now = deps.now ?? Date.now;
  const send = deps.forward ?? defaultForward;
  const ec2State = deps.ec2State ?? (() => "unknown" as const);

  const traceIdOf = (span: Span): string | null => {
    const id = span.spanContext().traceId;
    return /^0+$/.test(id) ? null : id;
  };

  /** The cause a hello would get now, or `answer` (§6). */
  const wouldGet = (verdict: Verdict): string => {
    if (verdict.kind === "degraded") return verdict.cause;
    return deps.hosts.serving() === "none" ? "no_host_serving" : "answer";
  };

  async function status(): Promise<Record<string, string>> {
    const verdict = await deps.killSwitch.verdict();
    return {
      serving: deps.hosts.serving(),
      since: isoSeconds(deps.hosts.servingSince()),
      ec2: ec2State(),
      kill_switch: deps.killSwitch.state(),
      hello_would_get: wouldGet(verdict),
      taken_at: isoSeconds(now()),
    };
  }

  function reply(
    res: FastifyReply,
    requestId: string,
    status: number,
    body: unknown,
    extra: Record<string, string> = {},
  ) {
    res.code(status).header("cache-control", "no-store").header("x-request-id", requestId);
    for (const [k, v] of Object.entries(extra)) res.header(k, v);
    return res.send(body);
  }

  function degradedReply(
    res: FastifyReply,
    requestId: string,
    span: Span,
    cause: RelayCause,
    since: string | null = null,
    ceilings: readonly string[] | null = null,
  ) {
    return reply(res, requestId, 503, degraded(cause, deps.stack, requestId, traceIdOf(span), since, ceilings), {
      "x-h4-degraded-cause": cause,
    });
  }

  /** One request through §3, inside its span. */
  /** The span is the request's own, passed in: with no telemetry SDK no context manager is registered, so none is
   *  ever "active" (no-telemetry.test.ts). */
  async function handle(listener: Listener, req: FastifyRequest, res: FastifyReply, span: Span): Promise<Done> {
    const requestId = randomBytes(16).toString("hex");
    const route = req.routeOptions.url ?? "unknown";
    const probe = header(req, "x-h4-probe") === "1";
    span.setAttribute("h4.probe", probe);

    // 1. The probe mark: probes never cause a model call (FR-061).
    if (probe && !(req.method === "GET" && route === "/api/status")) {
      await reply(res, requestId, 400, refusal("probe_not_allowed", requestId));
      return { status: 400, host: "none", cause: "probe_not_allowed", outcome: "refused" };
    }

    // 2. The client's address, from the edge alone.
    let address: string;
    if (listener === "edge") {
      const viewer = refusedPeer(deps.refusedPeers, req.socket.remoteAddress)
        ? undefined
        : viewerAddress(req.headers["cloudfront-viewer-address"]);
      if (viewer === undefined) {
        await reply(res, requestId, 403, refusal("edge_required", requestId));
        return { status: 403, host: "none", cause: "edge_required", outcome: "refused" };
      }
      address = viewer;
    } else {
      address = INTERNAL_IDENTITY;
    }

    if (route === "/api/status") {
      await reply(res, requestId, 200, await status());
      return { status: 200, host: deps.hosts.serving(), cause: null, outcome: "status" };
    }
    const target = ROUTES[route];
    if (target === undefined) {
      await reply(res, requestId, 404, refusal("not_found", requestId));
      return { status: 404, host: "none", cause: "not_found", outcome: "refused" };
    }

    // 3. The public cap (FR-033).
    const admitted = deps.cap.admit(address);
    if (!admitted.ok) {
      deps.telemetry.capRefused(admitted.limit);
      await reply(res, requestId, 429, capRefused(admitted.limit, admitted.retryAfterS, requestId), {
        "retry-after": String(admitted.retryAfterS),
      });
      return { status: 429, host: "none", cause: "public_cap", outcome: "refused", capLimit: admitted.limit };
    }
    try {
      // 4. The kill switch, read now; unknown is degraded (FR-030).
      const verdict = await deps.killSwitch.verdict();
      if (verdict.kind === "degraded") {
        await degradedReply(res, requestId, span, verdict.cause, verdict.since, verdict.ceilings);
        return { status: 503, host: "none", cause: verdict.cause, outcome: "degraded" };
      }

      // 5. The host.
      let host = deps.hosts.serving();
      if (host === "none") {
        await degradedReply(res, requestId, span, "no_host_serving");
        return { status: 503, host: "none", cause: "no_host_serving", outcome: "degraded", reason: "none_healthy" };
      }

      // 6. The forward, retried once on the other host only if nothing was sent.
      const carrier: Record<string, string> = {};
      propagation.inject(trace.setSpan(context.active(), span), carrier);
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const outgoing: ForwardRequest = {
        path: target.path,
        body,
        contentType: header(req, "content-type"),
        accept: header(req, "accept"),
        traceparent: carrier.traceparent,
        viewer: address,
        requestId,
      };
      let reason = "serving";
      let result = await send(deps.targets.get(host) as HostTarget, outgoing);
      if (result.kind === "unsent") {
        deps.hosts.failed(host);
        const other = deps.hosts.other(host);
        if (other !== undefined) {
          host = other;
          reason = "retried_unsent";
          result = await send(deps.targets.get(other) as HostTarget, outgoing);
        }
      }
      if (result.kind !== "answer") {
        const cause: RelayCause = result.kind === "unsent" ? "no_host_serving" : "host_error";
        await degradedReply(res, requestId, span, cause);
        return { status: 503, host, cause, outcome: "degraded", reason };
      }

      // 7. The answer: a host's 502 or 504 is a 503 with its cause.
      if (result.status === 502 || result.status === 504) {
        const d = hostFailure(
          result.body,
          result.headers["x-h4-degraded-cause"],
          deps.stack,
          requestId,
          traceIdOf(span),
        );
        await reply(res, requestId, 503, d, { "x-h4-degraded-cause": d.cause });
        return { status: 503, host, cause: d.cause, outcome: "degraded", reason };
      }
      res.code(result.status).header("x-request-id", requestId);
      for (const [k, v] of Object.entries(result.headers)) res.header(k, v);
      await res.send(result.body);
      const cause = result.headers["x-h4-degraded-cause"] ?? null;
      return { status: result.status, host, cause, outcome: cause === null ? "answered" : "degraded", reason };
    } finally {
      admitted.release();
    }
  }

  function listenerApp(listener: Listener): FastifyInstance {
    const app = Fastify({ logger: false, return503OnClosing: true });
    // The body goes on unchanged, never parsed: one parser for every content type, as raw bytes.
    app.removeAllContentTypeParsers();
    app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    const run = async (req: FastifyRequest, res: FastifyReply): Promise<void> => {
      const route = req.routeOptions.url ?? "unknown";
      const started = now();
      const parent = propagation.extract(context.active(), req.headers);
      await deps.telemetry.tracer.startActiveSpan(
        SPAN,
        { kind: SpanKind.SERVER, attributes: { "http.request.method": req.method, "http.route": route } },
        parent,
        async (span) => {
          try {
            const done = await handle(listener, req, res, span);
            span.setAttribute("http.response.status_code", done.status);
            span.setAttribute("h4.relay.host", done.host);
            if (done.reason !== undefined) span.setAttribute("h4.relay.reason", done.reason);
            if (done.cause !== null) span.setAttribute("h4.degraded.cause", done.cause);
            span.setAttribute("h4.cap.refused", done.cause === "public_cap");
            if (done.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
            deps.telemetry.counted(done.host, done.outcome, route);
            // The relay's log line: the route, the host, the status, the cause, the duration, and the request ID.
            deps.logger.info(
              {
                event: "relay.request",
                route,
                host: done.host,
                status: done.status,
                cause: done.cause,
                duration_ms: now() - started,
                request_id: res.getHeader("x-request-id"),
                listener,
              },
              "The relay answered a request.",
            );
          } finally {
            span.end();
          }
        },
      );
    };
    const routes: [string, string][] =
      listener === "edge"
        ? [["GET", "/api/status"], ...Object.keys(ROUTES).map((r): [string, string] => ["POST", r])]
        : [
            ["GET", "/api/status"],
            ["POST", "/api/hello"],
          ];
    for (const [method, url] of routes) {
      const limit = ROUTES[url]?.limit ?? 1_024;
      app.route({ method: method as "GET" | "POST", url, bodyLimit: limit, handler: run });
    }
    // Any other method or path: 404, not forwarded. A body over its route's limit: 413, not forwarded.
    app.setNotFoundHandler((_req, res) => {
      const id = randomBytes(16).toString("hex");
      return reply(res, id, 404, refusal("not_found", id));
    });
    app.setErrorHandler((error: { statusCode?: number }, req, res) => {
      const id = randomBytes(16).toString("hex");
      if (error.statusCode === 413) {
        const limit = ROUTES[req.routeOptions.url ?? ""]?.limit ?? 1_024;
        return reply(res, id, 413, { error: "body_too_large", limit_bytes: limit });
      }
      deps.logger.error(
        { event: "relay.error", route: req.routeOptions.url ?? "unknown" },
        "The relay failed a request.",
      );
      return degradedReply(res, id, trace.getActiveSpan() ?? trace.wrapSpanContext(INVALID_SPAN_CONTEXT), "host_error");
    });
    return app;
  }

  const health = Fastify({ logger: false });
  health.get("/health/live", (_req, res) => res.code(200).send({ status: "live" }));

  return { edge: listenerApp("edge"), internal: listenerApp("internal"), health };
}
