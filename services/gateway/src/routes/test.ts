// The dev-only test machinery (contracts/operator-admin.md §3; FR-036): the controllable clock and the synthetic
// metered source the breach test drives. Both would get around FR-034, so they exist only in dev, guarded in three
// layers: startup refuses their switches outside H4_ENV=dev (validate-env.ts), each request needs H4_ENV=dev and the
// route's own switch, and the matrix proves the refusals. On the admin listener, authentication still comes first
// (§1.1): an unauthenticated caller gets 401 before it learns whether the machinery exists.
//
// - POST /admin/test/clock: forward only, persisted as stack_state.test_clock_offset_ms, with a `clock` journal
//   record (meter/operator.ts).
// - POST /admin/test/synthetic: `count` calls of $0.10, one at a time, through the real pipeline. `fallback` runs
//   exactly as a hello would: the state read, the local adapter while it is healthy, else the metered fallback.
//   `metered` skips the local step. Per-client limits don't apply; the global metered limits do. It stops at the first
//   call that isn't answered. Each call is a trace of its own.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { parseUtcTimestamp, thresholds, type Budgets, type EnvClass, type StackName } from "../config/validate.js";
import { toRfc3339, type GatewayClock } from "../core/clock.js";
import type { Gateway, GatewayAnswer, GatewayCall } from "../core/gateway.js";
import type { Operator } from "../meter/init.js";
import { MAX_ADVANCE_S, setTestClock, type OperatorDeps, type OperatorResult } from "../meter/operator.js";
import { toBigInt, type Store } from "../meter/store.js";
import type { GatewayMetrics, RequestOutcome, RouteDecisionAttribute } from "../telemetry/metrics.js";
import { isJson, meterReport, reasonOf } from "./admin.js";

export interface TestMachineryDeps {
  stack: StackName;
  envClass: EnvClass;
  gateway: Gateway;
  store: Store;
  clock: GatewayClock;
  budgets: Budgets;
  metrics: GatewayMetrics;
  logger: { info(record: object, msg: string): void; warn(record: object, msg: string): void };
  realNow: () => number;
  /** GATEWAY_TEST_CLOCK and GATEWAY_TEST_SYNTHETIC_SPEND. */
  switches: { clock: boolean; synthetic: boolean };
  /** The route's fallback adapter as built: dev's synthetic one, when its switch is on. */
  fallbackId: string | null;
  operatorDeps: () => OperatorDeps;
  operatorOf: (req: FastifyRequest) => Operator;
  unreachable: (req: FastifyRequest, reply: FastifyReply) => FastifyReply;
}

/** The fixed prompt of every synthetic call: no client content (§3.2). */
export const SYNTHETIC_PROMPT = "synthetic spend";
export const MAX_SYNTHETIC_COUNT = 50;

type Invalid = { ok: false; field: string; detail: string };
const invalid = (field: string, detail: string): Invalid => ({ ok: false, field, detail });

/** §3.1's body: exactly one of `set` (RFC 3339 in UTC) and `advance_s` (1 to 366 days), and the reason. */
function clockRequestOf(body: unknown): { ok: true; set?: number; advanceS?: number; reason: string } | Invalid {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return invalid("body", "must be a JSON object");
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => !["set", "advance_s", "reason"].includes(k))) {
    return invalid("body", "the fields are set or advance_s, and reason");
  }
  if ((b.set === undefined) === (b.advance_s === undefined)) {
    return invalid("body", "exactly one of set and advance_s");
  }
  const reason = reasonOf(b.reason);
  if (!reason.ok) return reason;
  if (b.set !== undefined) {
    const ms = typeof b.set === "string" ? parseUtcTimestamp(b.set) : undefined;
    if (ms === undefined) return invalid("set", "an RFC 3339 time in UTC, ending in Z");
    return { ok: true, set: ms, reason: reason.reason };
  }
  const s = b.advance_s;
  if (typeof s !== "number" || !Number.isInteger(s) || s < 1 || s > MAX_ADVANCE_S) {
    return invalid("advance_s", `a whole number of seconds from 1 to ${MAX_ADVANCE_S}`);
  }
  return { ok: true, advanceS: s, reason: reason.reason };
}

/** §3.2's body: the attribution, the count, and the reason. */
function syntheticRequestOf(
  body: unknown,
): { ok: true; attribution: "fallback" | "metered"; count: number; reason: string } | Invalid {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return invalid("body", "must be a JSON object");
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => !["attribution", "count", "reason"].includes(k))) {
    return invalid("body", "the fields are attribution, count, and reason");
  }
  if (b.attribution !== "fallback" && b.attribution !== "metered") {
    return invalid("attribution", "fallback or metered");
  }
  const count = b.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_SYNTHETIC_COUNT) {
    return invalid("count", `a whole number from 1 to ${MAX_SYNTHETIC_COUNT}`);
  }
  const reason = reasonOf(b.reason);
  if (!reason.ok) return reason;
  return { ok: true, attribution: b.attribution, count, reason: reason.reason };
}

interface Stopped {
  n: number;
  status: 429 | 502 | 503;
  cause?: string;
  error?: string;
  kind?: string;
  retry_after_s?: number;
}

export function registerTestMachinery(admin: FastifyInstance, deps: TestMachineryDeps): void {
  /** 403 outside dev, or without the route's own switch, counted in h4.test_machinery.refused (§3). */
  const allowed = (req: FastifyRequest, reply: FastifyReply, which: "clock" | "synthetic"): boolean => {
    if (deps.envClass === "dev" && deps.switches[which]) return true;
    deps.metrics.testMachineryRefused();
    deps.logger.warn(
      { event: "test.machinery_refused", path: req.routeOptions.url ?? "other" },
      "A dev-only test endpoint was refused.",
    );
    void reply.code(403).send({ error: "test_machinery_refused" });
    return false;
  };
  const answerWrite = (req: FastifyRequest, reply: FastifyReply, result: OperatorResult) =>
    result.status === 503 ? deps.unreachable(req, reply) : reply.code(result.status).send(result.body);

  admin.post("/admin/test/clock", async (req, reply) => {
    const operator = deps.operatorOf(req);
    if (!allowed(req, reply, "clock")) return reply;
    if (!isJson(req.headers["content-type"])) {
      return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
    }
    const parsed = clockRequestOf(req.body);
    if (!parsed.ok)
      return reply.code(400).send({ error: "invalid_request", field: parsed.field, detail: parsed.detail });
    const result = await setTestClock(
      deps.operatorDeps(),
      {
        reason: parsed.reason,
        ...(parsed.set === undefined ? {} : { set: parsed.set }),
        ...(parsed.advanceS === undefined ? {} : { advanceS: parsed.advanceS }),
      },
      operator,
    );
    return answerWrite(req, reply, result);
  });

  admin.post("/admin/test/synthetic", async (req, reply) => {
    const operator = deps.operatorOf(req);
    if (!allowed(req, reply, "synthetic")) return reply;
    if (!isJson(req.headers["content-type"])) {
      return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
    }
    const parsed = syntheticRequestOf(req.body);
    if (!parsed.ok)
      return reply.code(400).send({ error: "invalid_request", field: parsed.field, detail: parsed.detail });
    const arrived = deps.realNow();
    const read = await deps.gateway.readState();
    if (read.kind === "unreachable") return deps.unreachable(req, reply);
    if (read.kind === "uninitialized") {
      return reply.code(409).send({
        error: "store_uninitialized",
        detail: "The store has no state row: initialize it first, with make operator-init.",
      });
    }

    // The caller going away aborts the call in flight, and the route stops there.
    const gone = new AbortController();
    const onClose = (): void => {
      if (!reply.raw.writableFinished) gone.abort();
    };
    reply.raw.once("close", onClose);
    const calls: { n: number; status: 200; route: string; cost_micro_usd: number; trace_id: string }[] = [];
    let stopped: Stopped | null = null;
    let decision: RouteDecisionAttribute = "none";
    try {
      for (let n = 1; n <= parsed.count && stopped === null; n++) {
        const call: GatewayCall = {
          requestId: req.id,
          purpose: "synthetic",
          messages: [{ role: "user", content: SYNTHETIC_PROMPT }],
          maxOutputTokens: deps.budgets.limits.perCall.helloMaxOutputTokens,
          arrivedAt: deps.realNow(),
          signal: gone.signal,
          newTrace: true,
        };
        const answer: GatewayAnswer =
          parsed.attribution === "fallback"
            ? await deps.gateway.complete(call)
            : deps.fallbackId === null
              ? {
                  kind: "degraded",
                  decision: {
                    kind: "degraded",
                    cause: "no_fallback_in_stack",
                    detail: "The local model is unavailable, and this stack has no fallback.",
                  },
                  traceId: "",
                }
              : await deps.gateway.meteredCall(call, { attribution: "metered", adapterId: deps.fallbackId });
        if (answer.kind === "answered") {
          decision = answer.route;
          calls.push({
            n,
            status: 200,
            route: answer.route,
            cost_micro_usd: Number(answer.costMicro),
            trace_id: answer.traceId,
          });
        } else if (answer.kind === "degraded") {
          decision = "degraded";
          deps.metrics.degradedResponse(answer.decision.cause);
          deps.logger.warn(
            { event: "call.degraded", cause: answer.decision.cause, route_decision: "degraded" },
            "A request got the degraded response.",
          );
          stopped = { n, status: 503, cause: answer.decision.cause };
        } else if (answer.kind === "refused") {
          decision = answer.route; // metered for metered spend, as its routing span says
          deps.logger.info(
            { event: "call.refused", error: answer.error, limit: answer.limit },
            "A request was refused by a limit.",
          );
          stopped = { n, status: 429, error: answer.error, retry_after_s: answer.retryAfterS };
        } else {
          decision = "local";
          stopped = { n, status: 502, error: "local_error", kind: answer.errorKind };
        }
      }
    } finally {
      reply.raw.off("close", onClose);
    }

    // The meters as the calls left them, in GET /admin/status's shape (§4.1).
    let meters: Record<string, unknown> | null = null;
    const now = deps.clock.now();
    try {
      const state = await deps.gateway.readState();
      if (state.kind === "ok") {
        const { day, month } = deps.clock.periodKeys();
        const rows = await deps.store.readMeters(day, month);
        meters = meterReport(
          rows,
          thresholds(deps.budgets.envs[deps.envClass]),
          state.state === "degraded" || state.fallbackAwaitingRenewal,
        );
      }
    } catch {
      meters = null;
    }
    // The audit row: the attribution, the count requested, and the calls answered (data-model.md §2.6).
    let auditId: number | null = null;
    try {
      const { rows } = await deps.store.query<{ id: unknown }>(
        `INSERT INTO gateway.audit_log (ts, stack, actor, action, reason, before, after, detail)
         VALUES ($1, $2, $3, 'test_synthetic', $4, NULL, NULL, $5::jsonb) RETURNING id`,
        [
          toRfc3339(now),
          deps.stack,
          operator.actor,
          parsed.reason,
          JSON.stringify({ attribution: parsed.attribution, count: parsed.count, answered: calls.length }),
        ],
      );
      auditId = Number(toBigInt(rows[0]?.id));
    } catch {
      // The calls happened: their ledger rows and journal records are what count. audit_id stays null.
    }
    deps.metrics.operatorAction("test_synthetic");
    deps.logger.info(
      {
        event: "operator.test_synthetic",
        "event.name": "h4.audit",
        audit_id: auditId,
        actor: operator.actor,
        action: "test_synthetic",
        reason: parsed.reason,
        before: null,
        after: { attribution: parsed.attribution, count: parsed.count, answered: calls.length },
      },
      "An operator action was accepted.",
    );
    const outcome: RequestOutcome =
      stopped === null ? "ok" : stopped.status === 503 ? "degraded" : stopped.status === 429 ? "refused" : "error";
    deps.metrics.request(decision, outcome, Math.max(0, deps.realNow() - arrived) / 1_000);
    return reply.code(200).send({
      requested: parsed.count,
      answered: calls.length,
      calls,
      stopped,
      meters,
      audit_id: auditId,
    });
  });
}
