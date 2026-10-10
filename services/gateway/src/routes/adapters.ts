// The live adapter endpoint (contracts/operator-admin.md §5; FR-024): POST /admin/adapters/{id}/complete calls one
// named adapter directly, for the live contract test (provider-adapter.md §5.3) and the Bedrock evals.
//
// - {id} is this route's local adapter, or its paid fallback (prod's bedrock); anything else, a synthetic adapter
//   included, is 404 unknown_adapter.
// - The state read comes first (503 degraded for store_unreachable, store_uninitialized, or kill_switch_tripped).
//   A paid adapter then goes through the metered limits (429) and admission as `test`, the ceilings only, with the
//   journal, the call, and the commit (Gateway.adapterCall); the local adapter is called free, with no admission.
//   The endpoint never fails over.
// - 200 carries the result, the cost, and the client span's name, kind, and attribute keys (never values); a provider
//   error is 502 with its kind and flags, never a payload. Each call writes one adapter_call audit row.
// - Each response counts once in h4.gateway.requests, as hello's do; a degraded one logs call.degraded, and a 429
//   call.refused (telemetry.md §4.1, §5.2).
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { Budgets, StackName } from "../config/validate.js";
import { toRfc3339, type GatewayClock } from "../core/clock.js";
import type { AdapterCallAnswer, Gateway, SpanShape } from "../core/gateway.js";
import type { ChatMessage } from "../core/types.js";
import type { Operator } from "../meter/init.js";
import { toBigInt, type Store } from "../meter/store.js";
import type { GatewayMetrics, RouteDecisionAttribute } from "../telemetry/metrics.js";
import { noteErrorType, outcomeOf } from "../telemetry/otel.js";
import { isJson, reasonOf } from "./admin.js";

export interface AdapterCallDeps {
  stack: StackName;
  gateway: Gateway;
  store: Store;
  /** The gateway clock: the audit row's ts (data-model.md §1). */
  clock: GatewayClock;
  budgets: Budgets;
  metrics: GatewayMetrics;
  logger: { info(record: object, msg: string): void; warn(record: object, msg: string): void };
  realNow: () => number;
  operatorOf: (req: FastifyRequest) => Operator;
}

/** At most this many messages (§5's table). */
export const MAX_MESSAGES = 8;

type Invalid = { ok: false; field: string; detail: string };
const invalid = (field: string, detail: string): Invalid => ({ ok: false, field, detail });

interface AdapterCallRequest {
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature?: number;
  purpose: "contract" | "eval";
  reason: string;
}

/** §5's body: the messages, the output cap, an optional temperature, the purpose, and the reason. */
export function adapterCallRequestOf(
  body: unknown,
  limits: { maxInputChars: number; maxOutputTokens: number },
): { ok: true; request: AdapterCallRequest } | Invalid {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return invalid("body", "must be a JSON object");
  const b = body as Record<string, unknown>;
  const fields = ["messages", "max_output_tokens", "temperature", "purpose", "reason"];
  if (Object.keys(b).some((k) => !fields.includes(k))) {
    return invalid("body", "the fields are messages, max_output_tokens, temperature, purpose, and reason");
  }
  const m = b.messages;
  if (!Array.isArray(m) || m.length < 1 || m.length > MAX_MESSAGES) {
    return invalid("messages", `1 to ${MAX_MESSAGES} messages`);
  }
  const messages: ChatMessage[] = [];
  let chars = 0;
  for (const [i, raw] of m.entries()) {
    const msg = raw as Record<string, unknown> | null;
    if (
      msg === null ||
      typeof msg !== "object" ||
      Array.isArray(msg) ||
      Object.keys(msg).some((k) => k !== "role" && k !== "content")
    ) {
      return invalid(`messages[${i}]`, "an object of role and content");
    }
    if (msg.role !== "system" && msg.role !== "user" && msg.role !== "assistant") {
      return invalid(`messages[${i}].role`, "system, user, or assistant");
    }
    if (msg.role === "system" && i !== 0)
      return invalid(`messages[${i}].role`, "at most one system message, and first");
    if (typeof msg.content !== "string") return invalid(`messages[${i}].content`, "must be a string");
    chars += [...msg.content].length;
    messages.push({ role: msg.role, content: msg.content });
  }
  if (chars > limits.maxInputChars)
    return invalid("messages", `contents together at most ${limits.maxInputChars} characters`);
  const cap = b.max_output_tokens;
  if (typeof cap !== "number" || !Number.isInteger(cap) || cap < 1 || cap > limits.maxOutputTokens) {
    return invalid("max_output_tokens", `a whole number from 1 to ${limits.maxOutputTokens}`);
  }
  const temperature = b.temperature;
  if (temperature !== undefined && (typeof temperature !== "number" || !(temperature >= 0 && temperature <= 1))) {
    return invalid("temperature", "a number from 0 to 1");
  }
  if (b.purpose !== "contract" && b.purpose !== "eval") return invalid("purpose", "contract or eval");
  const reason = reasonOf(b.reason);
  if (!reason.ok) return reason;
  return {
    ok: true,
    request: {
      messages,
      maxOutputTokens: cap,
      ...(temperature === undefined ? {} : { temperature }),
      purpose: b.purpose,
      reason: reason.reason,
    },
  };
}

const spanBody = (s: SpanShape) => ({ name: s.name, kind: s.kind, attribute_keys: s.attributeKeys });

export function registerAdapterCalls(admin: FastifyInstance, deps: AdapterCallDeps): void {
  // Each call's arrival, and its routing decision once it's known, for h4.gateway.requests (telemetry.md §4.1).
  const states = new WeakMap<FastifyRequest, { arrivedAt: number; decision: RouteDecisionAttribute }>();
  const stateOf = (req: FastifyRequest) => {
    let state = states.get(req);
    if (state === undefined) {
      state = { arrivedAt: deps.realNow(), decision: "none" };
      states.set(req, state);
    }
    return state;
  };

  admin.route({
    method: "POST",
    url: "/admin/adapters/:id/complete",
    handler: async function adapterCall(req, reply) {
      const state = stateOf(req);
      const operator = deps.operatorOf(req);
      const { id } = req.params as { id: string };
      if (!isJson(req.headers["content-type"])) {
        return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
      }
      const parsed = adapterCallRequestOf(req.body, deps.budgets.limits.perCall);
      if (!parsed.ok)
        return reply.code(400).send({ error: "invalid_request", field: parsed.field, detail: parsed.detail });
      const r = parsed.request;

      // The caller going away aborts the call; the deadline does too, inside the gateway.
      const gone = new AbortController();
      const onClose = (): void => {
        if (!reply.raw.writableFinished) gone.abort();
      };
      reply.raw.once("close", onClose);
      let a: AdapterCallAnswer | undefined;
      try {
        a = await deps.gateway.adapterCall(
          {
            requestId: req.id,
            purpose: r.purpose,
            messages: r.messages,
            maxOutputTokens: r.maxOutputTokens,
            ...(r.temperature === undefined ? {} : { temperature: r.temperature }),
            arrivedAt: state.arrivedAt,
            signal: gone.signal,
          },
          id,
        );
      } finally {
        reply.raw.off("close", onClose);
      }
      if (a === undefined) return reply.code(404).send({ error: "unknown_adapter" });
      if (a.kind === "refused") {
        state.decision = a.route;
        deps.logger.info(
          { event: "call.refused", error: a.error, limit: a.limit },
          "A request was refused by a limit.",
        );
        return reply
          .code(429)
          .header("retry-after", String(a.retryAfterS))
          .send({ error: a.error, limit: a.limit, retry_after_s: a.retryAfterS, request_id: req.id });
      }
      if (a.kind === "degraded") {
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
      }

      // The call happened: its audit row, then the answer (data-model.md §2.6).
      state.decision = a.attribution === "none" ? "local" : "metered";
      const { outcome } = a;
      const last = outcome.attempts[outcome.attempts.length - 1];
      if (last === undefined) throw new Error("a call with no attempt");
      const detail = {
        adapter: a.adapter,
        purpose: r.purpose,
        attribution: a.attribution,
        outcome: outcome.ok ? "ok" : "error",
        error_kind: outcome.ok ? null : outcome.error.kind,
        attempts: outcome.attempts.length,
        cost_micro_usd: a.costMicro.toString(),
        ledger_ref: a.ledgerRef,
      };
      let auditId: number | null = null;
      try {
        const { rows } = await deps.store.query<{ id: unknown }>(
          `INSERT INTO gateway.audit_log (ts, stack, actor, action, reason, before, after, detail)
         VALUES ($1, $2, $3, 'adapter_call', $4, NULL, NULL, $5::jsonb) RETURNING id`,
          [toRfc3339(deps.clock.now()), deps.stack, operator.actor, r.reason, JSON.stringify(detail)],
        );
        auditId = Number(toBigInt(rows[0]?.id));
      } catch {
        // The call happened: its ledger rows and journal records are what count. audit_id stays null.
      }
      deps.metrics.operatorAction("adapter_call");
      deps.logger.info(
        {
          event: "operator.adapter_call",
          "event.name": "h4.audit",
          audit_id: auditId,
          actor: operator.actor,
          action: "adapter_call",
          reason: r.reason,
          after: detail,
        },
        "An operator called an adapter.",
      );
      if (!outcome.ok) {
        const e = outcome.error;
        noteErrorType(req, "provider_error");
        return reply.code(502).send({
          error: "provider_error",
          kind: e.kind,
          retryable: e.retryable,
          possibly_billed: e.possiblyBilled,
          status: e.status ?? null,
          cost_micro_usd: a.costMicro.toString(),
          trace_id: a.traceId,
          span: spanBody(last.span),
        });
      }
      const res = outcome.result;
      return reply.code(200).send({
        adapter: a.adapter,
        attribution: a.attribution,
        result: {
          text: res.text,
          usage: {
            input_tokens: res.usage.inputTokens,
            output_tokens: res.usage.outputTokens,
            cache_read_input_tokens: res.usage.cacheReadInputTokens ?? 0,
          },
          finish_reason: res.finishReason,
          response_model: res.responseModel,
          response_id: res.responseId ?? null,
          latency_ms: res.latencyMs,
        },
        cost_micro_usd: a.costMicro.toString(),
        cost_basis: a.costBasis,
        price_version: a.priceVersion,
        span: spanBody(last.span),
        trace_id: a.traceId,
        audit_id: auditId,
      });
    },
    // h4.gateway.requests and its duration, once per call, when its response is sent (telemetry.md §4.1).
    onSend: async function adapterCallMetrics(req, reply, payload) {
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
