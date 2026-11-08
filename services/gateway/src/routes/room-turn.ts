// POST /room/turn: the twin's conversation turn (spec 007; FR-001 to FR-006, FR-025, FR-028, FR-043, FR-044, FR-054;
// plan §2; contracts/gateway-http.md §10). edge's x005 forwards the site's POST /api/room/turn here; x000 answers /room/
// itself with 404, so nothing else reaches it.
//
// Each step passes or answers, and a turn refused at one reaches no later step (FR-003):
// 1. the client's identity, as hello's, and the turn route's own per-client cap: 429 client_cap_exceeded;
// 2. validation: 415 for a body that isn't JSON (the listener's parser), 400 invalid_request naming the field;
// 3. the twin's files and limits: 503 twin_unavailable while either is missing, for every turn (FR-054), since
//    readiness can't be judged without the files' hashes (departure D6);
// 4. readiness: 409 not_ready while the feature's topic, or free talk, isn't ready at the running hashes (FR-030); then
//    Gateway.complete with the purpose `twin`: the state read first, the grounding and the prompt built only once it passes (FR-025), then
//    FR-022's order. A degraded decision is 503 with spec 000's body; a metered-limit refusal 429; a local error 502;
// 5. the answer, trimmed and guarded, as 200 {text, feature, cost_micro_usd, route}: nothing else, and no cost on any
//    refusal or degraded answer (FR-004, FR-005).
// The body enters no log, span, or store. Each turn counts once in h4.twin.turns, with its time; a withheld answer in
// h4.twin.withheld; and the server span carries the feature, the topic, the outcome, the cause, the guard, and both
// hashes (plan §9).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { TWIN_LIMIT_DEFAULTS, type StackName } from "../config/validate.js";
import type { GatewayClock } from "../core/clock.js";
import type { ForwardedBy } from "../core/edge.js";
import type { Gateway } from "../core/gateway.js";
import { clientKey } from "../core/limits.js";
import type { DegradedCause } from "../core/types.js";
import type { GatewayMetrics, RouteDecisionAttribute, TwinCause, TwinOutcome } from "../telemetry/metrics.js";
import { noteErrorType, serverSpanOf } from "../telemetry/otel.js";
import { FREE_TALK } from "../twin/pack.js";
import { readiness } from "../twin/readiness.js";
import { guardFor, parseTurn, topicOf, twinCall, type TwinRuntime } from "../twin/turn.js";
import { CLIENT_LABEL, clientAddress } from "./hello.js";

export const ROOM_TURN_PATH = "/room/turn";
/** 32 KiB, as edge's location caps it (plan §2). */
export const ROOM_TURN_BODY_LIMIT = 32_768;

export const TWIN_UNAVAILABLE_DETAIL =
  "The twin's files are missing or invalid, or this stack has no per-turn limits, so the twin can't answer.";

export interface RoomTurnDeps {
  stack: StackName;
  gateway: Gateway;
  twin: TwinRuntime;
  clock: GatewayClock;
  metrics: GatewayMetrics;
  logger: { info(record: object, msg: string): void; warn(record: object, msg: string): void };
  realNow: () => number;
  forwardedBy: ForwardedBy;
}

interface TurnState {
  arrivedAt: number;
  label?: string;
  client?: string;
  feature: string;
  topic: string | null;
  outcome: TwinOutcome;
  cause: TwinCause;
  decision: RouteDecisionAttribute;
  guard: string | null;
}

const states = new WeakMap<FastifyRequest, TurnState>();

const isJson = (contentType: string | undefined): boolean =>
  (contentType ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";

export function registerRoomTurn(api: FastifyInstance, deps: RoomTurnDeps): void {
  const stateOf = (req: FastifyRequest): TurnState => {
    let state = states.get(req);
    if (state === undefined) {
      state = {
        arrivedAt: deps.realNow(),
        feature: "none",
        topic: null,
        outcome: "invalid",
        cause: "none",
        decision: "none",
        guard: null,
      };
      states.set(req, state);
    }
    return state;
  };

  const degraded = (
    req: FastifyRequest,
    reply: FastifyReply,
    state: TurnState,
    d: {
      cause: DegradedCause | "twin_unavailable";
      detail: string;
      ceilings?: string[] | undefined;
      since?: string | undefined;
    },
    traceId: string | null,
  ) => {
    state.outcome = "degraded";
    state.cause = d.cause;
    state.decision = "degraded";
    if (d.cause !== "twin_unavailable") {
      deps.metrics.degradedResponse(d.cause);
      deps.logger.warn(
        { event: "call.degraded", cause: d.cause, route_decision: "degraded" },
        "A request got the degraded response.",
      );
    }
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
        trace_id: traceId,
      });
  };

  void api.register(async function roomTurn(scope) {
    scope.route({
      method: "POST",
      url: ROOM_TURN_PATH,
      bodyLimit: ROOM_TURN_BODY_LIMIT,
      onRequest: async function turnIdentityAndCap(req, reply) {
        const state = stateOf(req);
        const label = req.headers["x-h4-client"];
        if (label !== undefined && (typeof label !== "string" || !CLIENT_LABEL.test(label))) {
          return reply.code(400).send({
            error: "invalid_request",
            field: "X-H4-Client",
            detail: "must match ^[a-z0-9-]{1,32}$",
            request_id: req.id,
          });
        }
        const client = clientKey(await clientAddress(req, deps.forwardedBy), label);
        const cap = deps.twin.clientCap.take(client, deps.realNow(), deps.clock.now());
        if (!cap.ok) {
          state.outcome = "refused";
          deps.logger.info(
            { event: "call.refused", error: "client_cap_exceeded", limit: cap.limit },
            "A request was refused by a limit.",
          );
          return reply.code(429).header("retry-after", String(cap.retryAfterS)).send({
            error: "client_cap_exceeded",
            limit: cap.limit,
            retry_after_s: cap.retryAfterS,
            request_id: req.id,
          });
        }
        if (label !== undefined) state.label = label;
        state.client = client;
        return undefined;
      },
      handler: async function roomTurnHandler(req, reply) {
        const state = stateOf(req);
        if (!isJson(req.headers["content-type"])) {
          return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
        }
        const load = deps.twin.load;
        const pack = load.available ? load.files.pack : null;
        const parsed = parseTurn(req.body, { pack, limits: deps.twin.limits ?? TWIN_LIMIT_DEFAULTS });
        if (!parsed.ok) {
          return reply
            .code(400)
            .send({ error: "invalid_request", field: parsed.field, detail: parsed.detail, request_id: req.id });
        }
        const input = parsed.turn;
        state.feature = input.feature;
        state.topic = pack === null ? null : topicOf(pack, input.feature);

        if (!load.available || deps.twin.limits === null) {
          return degraded(req, reply, state, { cause: "twin_unavailable", detail: TWIN_UNAVAILABLE_DETAIL }, null);
        }
        if (!readiness(load, input.feature)) {
          state.outcome = "not_ready";
          return reply.code(409).send({ error: "not_ready", request_id: req.id });
        }
        const files = load.files;
        const span = serverSpanOf(req);
        span?.setAttributes({ "h4.twin.pack_sha": files.pack.sha256, "h4.twin.prompt_sha": files.promptSha256 });

        // The caller going away aborts the call; the deadline does too, inside the gateway.
        const gone = new AbortController();
        const onClose = (): void => {
          if (!reply.raw.writableFinished) gone.abort();
        };
        reply.raw.once("close", onClose);
        try {
          const built = twinCall(files, { ranker: deps.twin.ranker, limits: deps.twin.limits }, input, {
            requestId: req.id,
            arrivedAt: state.arrivedAt,
            signal: gone.signal,
            freeTalkReady: readiness(load, FREE_TALK),
            ...(state.client === undefined ? {} : { clientKey: state.client }),
            ...(state.label === undefined ? {} : { clientLabel: state.label }),
          });
          const a = await deps.gateway.complete(built.call);
          if (a.kind === "degraded") return degraded(req, reply, state, a.decision, a.traceId);
          if (a.kind === "refused") {
            state.outcome = "refused";
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
          if (a.kind === "local_error") {
            state.outcome = "error";
            state.decision = "local";
            noteErrorType(req, "local_error");
            return reply
              .code(502)
              .send({ error: "local_error", kind: a.errorKind, request_id: req.id, trace_id: a.traceId });
          }
          const route = a.route === "local" ? "local" : "fallback";
          state.decision = route;
          const guarded = guardFor(files, built.grounding(), a.result.text, a.result.finishReason);
          if (guarded.kind === "withheld") {
            state.outcome = "withheld";
            state.guard = guarded.guard;
            deps.metrics.twinWithheld(guarded.guard);
          } else {
            state.outcome = "ok";
          }
          return reply.code(200).send({
            text: guarded.text,
            feature: input.feature,
            cost_micro_usd: Number(a.costMicro),
            route,
          });
        } finally {
          reply.raw.off("close", onClose);
        }
      },
      // Once per turn, when its response is sent: h4.twin.turns and its time, and the server span (plan §9).
      onSend: async function roomTurnTelemetry(req, reply, payload) {
        const state = stateOf(req);
        if ([400, 413, 415].includes(reply.statusCode)) state.outcome = "invalid";
        if (reply.statusCode >= 500 && state.outcome !== "degraded") state.outcome = "error";
        deps.metrics.twinTurn({
          feature: state.feature,
          outcome: state.outcome,
          cause: state.cause,
          decision: state.decision,
          seconds: Math.max(0, deps.realNow() - state.arrivedAt) / 1_000,
        });
        const span = serverSpanOf(req);
        if (span !== undefined) {
          span.setAttributes({
            "h4.room.feature": state.feature,
            "h4.room.topic": state.topic ?? "none",
            "h4.outcome": state.outcome,
            ...(state.cause === "none" ? {} : { "h4.degraded.cause": state.cause }),
            ...(state.guard === null ? {} : { "h4.twin.guard": state.guard }),
          });
        }
        return payload;
      },
    });
  });
}
