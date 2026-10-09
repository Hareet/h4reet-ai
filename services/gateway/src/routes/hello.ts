// POST /hello (contracts/gateway-http.md §2; FR-038): a test endpoint, not the twin (Principle VIII). It sends one
// fixed system prompt and one short message through the gateway, so routing, metering, and tracing can be proven on
// something trivial.
//
// The processing order is §2.4's, and each step either passes or answers:
// 1. client identity: an invalid X-H4-Client gets 400;
// 2. the per-client cap: over it gets 429 client_cap_exceeded;
// 3. validation: the wrong content type gets 415, an invalid body 400;
// 4–5. Gateway.complete: the state read, the kill switch, the local adapter, and FR-022's fallback order: the metered
//      limits (429), admission (503 with its cause), the journal, the fallback call, and its commit.
// Steps 1 and 2 run in onRequest, before the body is read, so every request counts, one that ends in a 400 or a 503
// included (§2.3).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { GatewayClock } from "../core/clock.js";
import type { ForwardedBy } from "../core/edge.js";
import type { Gateway, GatewayAnswer } from "../core/gateway.js";
import { clientKey, type ClientCap } from "../core/limits.js";
import type { GatewayMetrics, RouteDecisionAttribute } from "../telemetry/metrics.js";
import { noteErrorType, outcomeOf } from "../telemetry/otel.js";

/** §2.2, normative as written there. */
export const HELLO_SYSTEM_PROMPT =
  "You are the hello endpoint of the h4reet.ai stack, a test of its model gateway. You are not the Author and not the Author's AI twin, and you know nothing about the Author. Reply to the message in at most two short sentences.";

export const MAX_MESSAGE_CODE_POINTS = 500;
const CLIENT_LABEL = /^[a-z0-9-]{1,32}$/;
const DEFAULT_MESSAGE = "Hello.";

export interface HelloDeps {
  stack: string;
  gateway: Gateway;
  clientCap: ClientCap;
  clock: GatewayClock;
  metrics: GatewayMetrics;
  logger: { info(record: object, msg: string): void; warn(record: object, msg: string): void };
  /** limits.per_call.hello_max_output_tokens (128). */
  maxOutputTokens: number;
  realNow: () => number;
  /** Whether a peer is edge, whose X-Forwarded-For alone names the client. */
  forwardedBy: ForwardedBy;
}

interface HelloState {
  arrivedAt: number;
  label?: string;
  /** The client, for its one metered call in flight; never logged, never an attribute (§2.3). */
  client?: string;
  decision: RouteDecisionAttribute;
}

const states = new WeakMap<FastifyRequest, HelloState>();

const invalid = (field: string, detail: string, requestId: string) => ({
  error: "invalid_request",
  field,
  detail,
  request_id: requestId,
});

/**
 * Edge's X-Forwarded-For, which it sets to exactly its own view of the client, when edge is the TCP peer; else the
 * TCP peer itself, whatever header it sent (§2.3).
 */
async function clientAddress(req: FastifyRequest, forwardedBy: ForwardedBy): Promise<string> {
  const peer = req.socket.remoteAddress ?? "unknown";
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim() !== "" && (await forwardedBy(peer))) {
    return forwarded.trim().slice(0, 128);
  }
  return peer;
}

function isJson(contentType: string | undefined): boolean {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";
}

type Parsed = { ok: true; message: string } | { ok: false; field: string; detail: string };

/** §2.1: a JSON object with at most the one field `message`, 1 to 500 code points after trimming, or Hello. */
function parseBody(body: unknown): Parsed {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, field: "body", detail: "must be a JSON object" };
  }
  if (Object.keys(body).some((key) => key !== "message")) {
    return { ok: false, field: "body", detail: "the only field is message" };
  }
  const message = (body as { message?: unknown }).message;
  if (message === undefined) return { ok: true, message: DEFAULT_MESSAGE };
  if (typeof message !== "string") return { ok: false, field: "message", detail: "must be a string" };
  const trimmed = message.trim();
  const length = [...trimmed].length;
  if (length === 0) return { ok: false, field: "message", detail: "at least 1 character" };
  if (length > MAX_MESSAGE_CODE_POINTS) return { ok: false, field: "message", detail: "at most 500 characters" };
  return { ok: true, message: trimmed };
}

export function registerHello(api: FastifyInstance, deps: HelloDeps): void {
  const stateOf = (req: FastifyRequest): HelloState => {
    let state = states.get(req);
    if (state === undefined) {
      state = { arrivedAt: deps.realNow(), decision: "none" };
      states.set(req, state);
    }
    return state;
  };

  const answer = (req: FastifyRequest, reply: FastifyReply, state: HelloState, a: GatewayAnswer) => {
    if (a.kind === "answered") {
      state.decision = a.route;
      return reply.code(200).send({
        answer: a.result.text,
        route: a.route,
        route_reason: a.routeReason,
        provider: a.provider,
        model: a.result.responseModel,
        usage: { input_tokens: a.result.usage.inputTokens, output_tokens: a.result.usage.outputTokens },
        cost_usd: Number(a.costMicro) / 1_000_000,
        cost_micro_usd: Number(a.costMicro),
        price_version: a.priceVersion,
        latency_ms: Math.max(0, Math.round(deps.realNow() - state.arrivedAt)),
        stack: deps.stack,
        request_id: req.id,
        trace_id: a.traceId,
      });
    }
    if (a.kind === "local_error") {
      // A local error that isn't about availability: no failover (§2.5.5).
      state.decision = "local";
      noteErrorType(req, "local_error");
      return reply.code(502).send({ error: "local_error", kind: a.errorKind, request_id: req.id, trace_id: a.traceId });
    }
    if (a.kind === "refused") {
      // The metered limits, in memory, on the fallback's path (§2.4 step 5.5): a refusal, not a degraded state.
      state.decision = "fallback";
      deps.logger.info({ event: "call.refused", error: a.error, limit: a.limit }, "A request was refused by a limit.");
      return reply
        .code(429)
        .header("retry-after", String(a.retryAfterS))
        .send({ error: a.error, limit: a.limit, retry_after_s: a.retryAfterS, request_id: req.id });
    }
    // Every degraded response records its cause three ways (§2.5.2): the spans (gateway.route here, and the server
    // span from the X-H4-Degraded-Cause header, app.ts), the counter, and the log.
    state.decision = "degraded";
    const d = a.decision;
    deps.metrics.degradedResponse(d.cause);
    deps.logger.warn(
      { event: "call.degraded", cause: d.cause, route_decision: "degraded" },
      "A request got the degraded response.",
    );
    return reply
      .code(503)
      .header("x-h4-degraded-cause", d.cause)
      .send({
        state: "degraded",
        cause: d.cause,
        detail: d.detail,
        ceilings: d.ceilings ?? null,
        stack: deps.stack,
        since: d.since ?? null,
        request_id: req.id,
        trace_id: a.traceId,
      });
  };

  api.route({
    method: "POST",
    url: "/hello",
    onRequest: async function helloIdentityAndCap(req, reply) {
      const state = stateOf(req);
      const label = req.headers["x-h4-client"];
      if (label !== undefined && (typeof label !== "string" || !CLIENT_LABEL.test(label))) {
        return reply.code(400).send(invalid("X-H4-Client", "must match ^[a-z0-9-]{1,32}$", req.id));
      }
      const client = clientKey(await clientAddress(req, deps.forwardedBy), label);
      const cap = deps.clientCap.take(client, deps.realNow(), deps.clock.now());
      if (!cap.ok) {
        // A refusal, not a degraded state: no X-H4-Degraded-Cause, and no count in h4.degraded.responses (§2.5.3).
        deps.logger.info(
          { event: "call.refused", error: "client_cap_exceeded", limit: cap.limit },
          "A request was refused by a limit.",
        );
        return reply
          .code(429)
          .header("retry-after", String(cap.retryAfterS))
          .send({ error: "client_cap_exceeded", limit: cap.limit, retry_after_s: cap.retryAfterS, request_id: req.id });
      }
      if (label !== undefined) state.label = label;
      state.client = client;
      return undefined;
    },
    handler: async function hello(req, reply) {
      const state = stateOf(req);
      if (!isJson(req.headers["content-type"])) {
        return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
      }
      const parsed = parseBody(req.body);
      if (!parsed.ok) return reply.code(400).send(invalid(parsed.field, parsed.detail, req.id));

      // The caller going away aborts the call; the deadline does too, inside the gateway.
      const gone = new AbortController();
      const onClose = (): void => {
        if (!reply.raw.writableFinished) gone.abort();
      };
      reply.raw.once("close", onClose);
      try {
        const a = await deps.gateway.complete({
          requestId: req.id,
          purpose: "hello",
          messages: [
            { role: "system", content: HELLO_SYSTEM_PROMPT },
            { role: "user", content: parsed.message },
          ],
          maxOutputTokens: deps.maxOutputTokens,
          arrivedAt: state.arrivedAt,
          signal: gone.signal,
          ...(state.label === undefined ? {} : { clientLabel: state.label }),
          ...(state.client === undefined ? {} : { clientKey: state.client }),
        });
        return answer(req, reply, state, a);
      } finally {
        reply.raw.off("close", onClose);
      }
    },
    // h4.gateway.requests and its duration, once per POST /hello, when its response is sent (telemetry.md §4.1).
    onSend: async function helloMetrics(req, reply, payload) {
      const state = stateOf(req);
      const outcome = outcomeOf(reply.statusCode, reply.hasHeader("x-h4-degraded-cause"));
      deps.metrics.request(
        state.decision,
        outcome === "unauthorized" ? "invalid" : outcome,
        Math.max(0, deps.realNow() - state.arrivedAt) / 1_000,
      );
      return payload;
    },
  });
}
