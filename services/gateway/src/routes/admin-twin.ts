// POST /admin/twin/turn: the Author's evaluation calls (spec 007; FR-050; Amendment 0-4; plan §2;
// contracts/operator-admin.md §8). Behind the admin listener's authentication, with the reason rule.
// - The body is the turn's, `{feature, path, turns}`, plus `adapter` (the stack's primary or fallback adapter, never a
//   synthetic one: anything else is 404 unknown_adapter) and `reason`.
// - It runs the twin's whole pipeline, the grounding, the prompt, and the guards, whatever the readiness file says,
//   since evaluation comes before readiness; and calls the named adapter through Gateway.adapterCall: the state read
//   first, a paid adapter admitted as `test` inside the ceilings (never the sub-budget), the local adapter free, and
//   never a failover.
// - Each call writes one twin_call audit row and counts in h4.operator.actions, never in h4.twin.turns or
//   h4.twin.withheld; its 200 adds what the runners record and a visitor never sees: the guard, the model, the tokens,
//   the cost, the trace ID, and both hashes.
import type { FastifyInstance, FastifyRequest } from "fastify";

import { TWIN_LIMIT_DEFAULTS, type StackName } from "../config/validate.js";
import { toRfc3339, type GatewayClock } from "../core/clock.js";
import type { Gateway } from "../core/gateway.js";
import type { Operator } from "../meter/init.js";
import { toBigInt, type Store } from "../meter/store.js";
import type { GatewayMetrics } from "../telemetry/metrics.js";
import { noteErrorType } from "../telemetry/otel.js";
import { FREE_TALK } from "../twin/pack.js";
import { readiness } from "../twin/readiness.js";
import { guardFor, parseTurn, topicOf, twinCall, type TwinRuntime } from "../twin/turn.js";
import { isJson, reasonOf } from "./admin.js";
import { TWIN_UNAVAILABLE_DETAIL } from "./room-turn.js";

export interface AdminTwinDeps {
  stack: StackName;
  gateway: Gateway;
  store: Store;
  clock: GatewayClock;
  metrics: GatewayMetrics;
  logger: { info(record: object, msg: string): void; warn(record: object, msg: string): void };
  realNow: () => number;
  operatorOf: (req: FastifyRequest) => Operator;
  twin: TwinRuntime;
}

export function registerAdminTwin(admin: FastifyInstance, deps: AdminTwinDeps): void {
  admin.route({
    method: "POST",
    url: "/admin/twin/turn",
    // The admin listener's own 4 KiB, which x003 holds every admin body to at the edge (spec 000; the review of T066,
    // N4): the evaluation suites' turns are far under it.
    handler: async function adminTwinTurn(req, reply) {
      const arrivedAt = deps.realNow();
      const operator = deps.operatorOf(req);
      if (!isJson(req.headers["content-type"])) {
        return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
      }
      const load = deps.twin.load;
      const limits = deps.twin.limits;
      const parsed = parseTurn(req.body, {
        pack: load.available ? load.files.pack : null,
        limits: limits ?? TWIN_LIMIT_DEFAULTS,
        extraKeys: ["adapter", "reason"],
      });
      if (!parsed.ok)
        return reply.code(400).send({ error: "invalid_request", field: parsed.field, detail: parsed.detail });
      const adapter = parsed.extra.adapter;
      if (typeof adapter !== "string" || adapter.length > 64) {
        return reply.code(400).send({ error: "invalid_request", field: "adapter", detail: "an adapter's ID" });
      }
      const reason = reasonOf(parsed.extra.reason);
      if (!reason.ok)
        return reply.code(400).send({ error: "invalid_request", field: reason.field, detail: reason.detail });
      if (!load.available || limits === null) {
        return reply.code(503).header("x-h4-degraded-cause", "twin_unavailable").send({
          state: "degraded",
          cause: "twin_unavailable",
          detail: TWIN_UNAVAILABLE_DETAIL,
          ceilings: null,
          stack: deps.stack,
          since: null,
          request_id: req.id,
          trace_id: null,
        });
      }
      const files = load.files;
      const input = parsed.turn;
      const gone = new AbortController();
      const onClose = (): void => {
        if (!reply.raw.writableFinished) gone.abort();
      };
      reply.raw.once("close", onClose);
      try {
        const built = twinCall(files, { ranker: deps.twin.ranker, limits }, input, {
          requestId: req.id,
          arrivedAt,
          signal: gone.signal,
          freeTalkReady: readiness(load, FREE_TALK),
        });
        // An evaluation call is no visitor's turn: its ledger row names no piece, so the dashboard's per-feature panels
        // and gateway.v_twin_models never count it; the audit row keeps the feature (the review of T066).
        const { room, ...call } = built.call;
        void room;
        const a = await deps.gateway.adapterCall(call, adapter);
        if (a === undefined) return reply.code(404).send({ error: "unknown_adapter" });
        if (a.kind === "refused") {
          return reply
            .code(429)
            .header("retry-after", String(a.retryAfterS))
            .send({ error: a.error, limit: a.limit, retry_after_s: a.retryAfterS, request_id: req.id });
        }
        if (a.kind === "degraded") {
          const d = a.decision;
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
        const { outcome } = a;
        const guarded = outcome.ok
          ? guardFor(files, built.grounding(), outcome.result.text, outcome.result.finishReason)
          : null;
        // The guard that withheld, replaced, or repaired the answer (D34), for the runners' history.
        const guard = guarded === null || guarded.kind === "pass" ? null : guarded.guard;
        // The guards that removed a sentence, or the claim tags, from an answer delivered (D41, D42), for the runners.
        const redacted = guarded === null || guarded.kind === "withheld" ? [] : [...(guarded.redacted ?? [])];
        const detail = {
          adapter: a.adapter,
          feature: input.feature,
          topic: topicOf(files.pack, input.feature),
          attribution: a.attribution,
          outcome: outcome.ok ? "ok" : "error",
          error_kind: outcome.ok ? null : outcome.error.kind,
          guard,
          attempts: outcome.attempts.length,
          cost_micro_usd: a.costMicro.toString(),
          ledger_ref: a.ledgerRef,
        };
        let auditId: number | null = null;
        try {
          const { rows } = await deps.store.query<{ id: unknown }>(
            `INSERT INTO gateway.audit_log (ts, stack, actor, action, reason, before, after, detail)
             VALUES ($1, $2, $3, 'twin_call', $4, NULL, NULL, $5::jsonb) RETURNING id`,
            [toRfc3339(deps.clock.now()), deps.stack, operator.actor, reason.reason, JSON.stringify(detail)],
          );
          auditId = Number(toBigInt(rows[0]?.id));
        } catch {
          // The call happened: its ledger rows and journal records are what count. audit_id stays null.
        }
        deps.metrics.operatorAction("twin_call");
        deps.logger.info(
          {
            event: "operator.twin_call",
            "event.name": "h4.audit",
            audit_id: auditId,
            actor: operator.actor,
            action: "twin_call",
            reason: reason.reason,
            after: detail,
          },
          "An operator called the twin's pipeline on an adapter.",
        );
        if (!outcome.ok) {
          noteErrorType(req, "provider_error");
          return reply.code(502).send({
            error: "provider_error",
            kind: outcome.error.kind,
            cost_micro_usd: Number(a.costMicro),
            trace_id: a.traceId,
          });
        }
        return reply.code(200).send({
          text: guarded?.text ?? files.lines.withheld,
          feature: input.feature,
          cost_micro_usd: Number(a.costMicro),
          route: a.adapter,
          guard,
          redacted,
          model: outcome.result.responseModel,
          usage: { input_tokens: outcome.result.usage.inputTokens, output_tokens: outcome.result.usage.outputTokens },
          trace_id: a.traceId,
          pack_sha256:
            input.feature === FREE_TALK
              ? files.pack.sha256
              : (files.pack.topic.get(topicOf(files.pack, input.feature))?.sha256 ?? files.pack.sha256),
          prompt_sha256: files.promptSha256,
          audit_id: auditId,
        });
      } finally {
        reply.raw.off("close", onClose);
      }
    },
  });
}
