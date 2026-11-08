// The admin listener (contracts/operator-admin.md §1, §2.3, §4.1): the operator's interface, published by edge on
// the stack's x003 port, on 127.0.0.1 only.
//
// Authentication comes first, before validation, before the store, and before any route: every request, reads
// included, needs `Authorization: Bearer <token>`, checked in §1.1's order. The prefix is checked before hashing, so
// a prod gateway never hashes a dev token, and the digests are compared in constant time. Every failure gets the same
// 401, so there is no oracle. Failures are counted in memory in fixed windows of real time (10 minutes): the first of
// each class in a window writes one auth_failed audit row, with the route template and never the raw path, and the
// third queues one auth_failed alert. While the store is down a failure is only counted and logged.
//
// Routes: POST /admin/init (meter/init.ts), POST /admin/reset and /admin/renew (meter/operator.ts), the reads,
// GET /admin/status, /admin/audit, and /admin/incidents, the live adapter calls (routes/adapters.ts), the
// dev-only test machinery (routes/test.ts), and spec 003's POST /admin/studio-window (meter/operator.ts; its
// contracts/gpu-window.md §1), on prod and dev-cpu.
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { renderAlert, type FallbackFacts, type RuntimeFacts } from "../alerts/format.js";
import { dedupeKey as dedupeKeys, enqueueAlert } from "../alerts/outbox.js";
import { thresholds, type AlertsConfig, type Budgets, type EnvClass, type StackName } from "../config/validate.js";
import { dayKey, monthKey, toRfc3339, type GatewayClock } from "../core/clock.js";
import type { Gateway } from "../core/gateway.js";
import { rfc3339Seconds } from "../core/router.js";
import type { TxDeps, TxEffects } from "../meter/crossings.js";
import { initializeStore, type InitRequest, type Meter, type Operator } from "../meter/init.js";
import type { Journal } from "../meter/journal.js";
import {
  renewFallback,
  resetKillSwitch,
  studioWindow,
  type OperatorDeps,
  type OperatorResult,
  type StudioWindowState,
} from "../meter/operator.js";
import { toBigInt, type MeterRow, type Store } from "../meter/store.js";
import type { AuthFailureClass, GatewayMetrics } from "../telemetry/metrics.js";
import { noteErrorType, noteStudioWindowState } from "../telemetry/otel.js";
import { registerAdapterCalls } from "./adapters.js";
import { registerAdminTwin } from "./admin-twin.js";
import type { TwinRuntime } from "../twin/turn.js";
import { registerTestMachinery } from "./test.js";

export interface AdminDeps {
  /** Spec 007's twin, for POST /admin/twin/turn (operator-admin.md §8); absent, the route isn't served. */
  twin?: TwinRuntime;
  stack: StackName;
  envClass: EnvClass;
  /** OPERATOR_TOKEN_SHA256: the gateway holds only the hash (data-model.md §5). */
  operatorTokenSha256: string;
  gateway: Gateway;
  store: Store;
  journal: Journal;
  clock: GatewayClock;
  budgets: Budgets;
  alerts: AlertsConfig;
  /** The route's fallback adapter as built, or null. */
  fallbackId: string | null;
  metrics: GatewayMetrics;
  logger: { info(record: object, msg: string): void; warn(record: object, msg: string): void };
  realNow: () => number;
  /** The meter's transaction context and effects, for the operator's writes (meter/operator.ts). */
  meter: { txDeps(): TxDeps; emit(effects: TxEffects): void };
  /** GATEWAY_STATE_DIR: the incident drafts are read from under it. */
  stateDir: string;
  /** GATEWAY_TEST_CLOCK and GATEWAY_TEST_SYNTHETIC_SPEND: the dev-only routes' own switches (routes/test.ts). */
  testMachinery: { clock: boolean; synthetic: boolean };
  /** After a committed write: the gauges follow at once (telemetry.md §4.1). */
  onChange?: () => void;
}

// ---------------------------------------------------------------------------------------------------------------
// Authentication (§1.1)
// ---------------------------------------------------------------------------------------------------------------

const TOKEN = /^h4op_(prod|dev|devcpu)_[A-Za-z0-9_-]{43}$/;
const SCOPE: Record<StackName, string> = { prod: "prod", dev: "dev", "dev-cpu": "devcpu" };

export type AuthResult = ({ ok: true } & Operator) | { ok: false; failure: AuthFailureClass };

/**
 * §1.1's checks, in order, stopping at the first failure: the Bearer scheme (missing), the token's shape (malformed),
 * this stack's prefix (wrong_prefix), and SHA-256 over the token against the configured hash (mismatch).
 */
export function authenticate(header: unknown, stack: StackName, expected: Buffer): AuthResult {
  if (typeof header !== "string") return { ok: false, failure: "missing" };
  const bearer = /^Bearer +(\S+) *$/i.exec(header);
  if (bearer === null) return { ok: false, failure: "missing" };
  const token = bearer[1] as string;
  if (!TOKEN.test(token)) return { ok: false, failure: "malformed" };
  // Before hashing: a prod gateway never hashes a dev token.
  if (!token.startsWith(`h4op_${SCOPE[stack]}_`)) return { ok: false, failure: "wrong_prefix" };
  const digest = createHash("sha256").update(token, "utf8").digest();
  if (expected.length !== digest.length || !timingSafeEqual(digest, expected))
    return { ok: false, failure: "mismatch" };
  const fingerprint = digest.toString("hex").slice(0, 8);
  return { ok: true, actor: `operator:${stack}#${fingerprint}`, fingerprint };
}

/** The failures in the current window of real time: one audit row per class, and one alert at the threshold. */
class AuthFailures {
  private windowStart = Number.NaN;
  private count = 0;
  private readonly audited = new Set<AuthFailureClass>();
  private alerted = false;

  constructor(private readonly deps: AdminDeps) {}

  async record(failure: AuthFailureClass, route: string): Promise<void> {
    const { deps } = this;
    const windowMs = deps.alerts.authFailed.windowS * 1_000;
    const start = Math.floor(deps.realNow() / windowMs) * windowMs;
    if (start !== this.windowStart) {
      this.windowStart = start;
      this.count = 0;
      this.audited.clear();
      this.alerted = false;
    }
    this.count += 1;
    deps.metrics.operatorAuthFailure(failure);
    deps.logger.warn(
      { event: "operator.auth_failed", "event.name": "h4.audit", class: failure, route },
      "An operator authentication failed.",
    );
    // While the store is down, a failure is only counted and logged.
    if (deps.store.status !== "ready") return;
    if (!this.audited.has(failure)) {
      this.audited.add(failure);
      await deps.store
        .query(
          `INSERT INTO gateway.audit_log (ts, stack, actor, action, reason, before, after, detail)
           VALUES ($1, $2, 'unknown', 'auth_failed', NULL, NULL, NULL, $3::jsonb)`,
          [
            toRfc3339(deps.clock.now()),
            deps.stack,
            JSON.stringify({ class: failure, route, window_start: rfc3339Seconds(start) }),
          ],
        )
        .catch(() => {});
    }
    if (this.count >= deps.alerts.authFailed.threshold && !this.alerted) {
      this.alerted = true;
      await this.alert(start, failure).catch(() => {});
    }
  }

  /** alerts.md §2: <stack>:auth_failed:admin:<the window's start, YYYY-MM-DDTHH:M0Z>. */
  private async alert(start: number, last: AuthFailureClass): Promise<void> {
    const { deps } = this;
    const dedupeKey = dedupeKeys.authFailed(deps.stack, start);
    const queued = await deps.store.transaction(async (q) => {
      const { rows } = await q.query<{
        state: string;
        since: Date | string;
        fallback_awaiting_renewal: boolean;
        fallback_awaiting_since: Date | string | null;
        test_clock_offset_ms: unknown;
      }>(
        `SELECT state, since, fallback_awaiting_renewal, fallback_awaiting_since, test_clock_offset_ms
         FROM gateway.stack_state WHERE id = 1`,
      );
      const row = rows[0];
      const runtime: RuntimeFacts =
        row === undefined
          ? { state: "uninitialized" }
          : row.state === "degraded"
            ? { state: "degraded", since: new Date(row.since).getTime() }
            : { state: "normal" };
      const fallback: FallbackFacts =
        deps.fallbackId === null
          ? { state: "none" }
          : row?.fallback_awaiting_renewal && row.fallback_awaiting_since !== null
            ? { state: "awaiting", since: new Date(row.fallback_awaiting_since).getTime() }
            : { state: "available" };
      const at = deps.clock.now();
      const rendered = renderAlert(
        {
          stack: deps.stack,
          envClass: deps.envClass,
          prefix: deps.alerts.prefixes[deps.stack],
          dedupeKey,
          at,
          testClock: row !== undefined && row.test_clock_offset_ms !== null,
          runtime,
          fallback,
        },
        {
          kind: "auth_failed",
          count: this.count,
          windowMinutes: Math.round(deps.alerts.authFailed.windowS / 60),
          lastClass: last,
        },
      );
      return enqueueAlert(q, {
        dedupeKey,
        kind: "auth_failed",
        stack: deps.stack,
        createdAt: toRfc3339(at),
        enqueuedAt: deps.realNow(),
        subject: rendered.subject,
        body: rendered.body,
        facts: rendered.facts,
      });
    });
    if (queued)
      deps.logger.info({ event: "alert.queued", dedupe_key: dedupeKey, kind: "auth_failed" }, "An alert was queued.");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Request bodies (§1.2, §2.3)
// ---------------------------------------------------------------------------------------------------------------

type Invalid = { ok: false; field: string; detail: string };
const invalid = (field: string, detail: string): Invalid => ({ ok: false, field, detail });

/** A C0 or C1 control character, or DEL: newlines, tabs, and escapes included. */
function hasControl(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}

/** §1.2: 10 to 500 code points after trimming, with no control characters, newlines included. */
export function reasonOf(value: unknown): { ok: true; reason: string } | Invalid {
  if (typeof value !== "string") return invalid("reason", value === undefined ? "is required" : "must be a string");
  const reason = value.trim();
  const length = [...reason].length;
  if (length < 10) return invalid("reason", "at least 10 characters");
  if (length > 500) return invalid("reason", "at most 500 characters");
  if (hasControl(reason)) return invalid("reason", "no control characters, newlines included");
  return { ok: true, reason };
}

/** A USD amount: a decimal string or a number, at least 0, with at most 6 decimal places, converted exactly. */
function usdToMicro(value: unknown): bigint | undefined {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return undefined;
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim();
  } else {
    return undefined;
  }
  const m = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(text);
  if (m === null) return undefined;
  return BigInt(m[1] as string) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0"));
}

const STATED: Record<string, Meter> = { day_usd: "day", month_usd: "month", fallback_today_usd: "fallback_day" };
const INIT_FIELDS = new Set(["reason", "stated", "confirm_zero", "renew"]);

function initRequestOf(body: unknown): { ok: true; request: InitRequest } | Invalid {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return invalid("body", "must be a JSON object");
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => !INIT_FIELDS.has(k))) {
    return invalid("body", "the fields are reason, stated, confirm_zero, and renew");
  }
  const reason = reasonOf(b.reason);
  if (!reason.ok) return reason;
  const stated: Partial<Record<Meter, bigint>> = {};
  if (b.stated !== undefined) {
    if (b.stated === null || typeof b.stated !== "object" || Array.isArray(b.stated)) {
      return invalid("stated", "must be an object of day_usd, month_usd, and fallback_today_usd");
    }
    for (const [key, value] of Object.entries(b.stated)) {
      const meter = STATED[key];
      if (meter === undefined) return invalid("stated", "the fields are day_usd, month_usd, and fallback_today_usd");
      const micro = usdToMicro(value);
      if (micro === undefined) {
        return invalid(`stated.${key}`, "a decimal amount of USD, at least 0, with at most 6 decimal places");
      }
      stated[meter] = micro;
    }
  }
  for (const flag of ["confirm_zero", "renew"] as const) {
    if (b[flag] !== undefined && typeof b[flag] !== "boolean") return invalid(flag, "must be true or false");
  }
  return {
    ok: true,
    request: { reason: reason.reason, stated, confirmZero: b.confirm_zero === true, renew: b.renew === true },
  };
}

/** A reset's or a renewal's body: the reason, and nothing else (§2.1, §2.2). */
function reasonRequestOf(body: unknown): { ok: true; reason: string } | Invalid {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return invalid("body", "must be a JSON object");
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => k !== "reason")) return invalid("body", "the only field is reason");
  return reasonOf(b.reason);
}

/**
 * The studio window's body (spec 003's contracts/gpu-window.md §1): the state, start or end, and the reason, and nothing
 * else. The state is checked before the reason, so a refused body with a valid state still names it on the span.
 */
export function studioWindowRequestOf(
  body: unknown,
): { ok: true; state: StudioWindowState; reason: string } | (Invalid & { state?: StudioWindowState }) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return invalid("body", "must be a JSON object");
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some((k) => k !== "state" && k !== "reason")) {
    return invalid("body", "the fields are state and reason");
  }
  if (b.state !== "start" && b.state !== "end") return invalid("state", "start or end");
  const state = b.state;
  const reason = reasonOf(b.reason);
  return reason.ok ? { ok: true, state, reason: reason.reason } : { ...reason, state };
}

export function isJson(contentType: string | undefined): boolean {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";
}

/** A query parameter that is a whole number from min to max, or undefined when absent. */
function intParam(
  query: Record<string, unknown>,
  name: string,
  min: number,
  max: number,
): { ok: true; value: number | undefined } | Invalid {
  const raw = query[name];
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== "string" || !/^[0-9]{1,10}$/.test(raw))
    return invalid(name, `a whole number from ${min} to ${max}`);
  const value = Number(raw);
  if (value < min || value > max) return invalid(name, `a whole number from ${min} to ${max}`);
  return { ok: true, value };
}

const AUDIT_ACTIONS = new Set([
  "init",
  "reset",
  "renew",
  "trip",
  "fallback_exhausted",
  "auth_failed",
  "test_clock",
  "test_synthetic",
  "adapter_call",
  "journal_failed",
  "studio_window", // spec 003 (its contracts/gpu-window.md §5)
  "twin_call", // spec 007 (its Amendment 0-4; operator-admin.md §8)
]);

/** An incident draft's path, relative to the state directory, as the drafter writes it (alerts.md §7). */
const DRAFT_PATH = /^incidents\/[A-Za-z0-9._-]{1,200}\.intent\.md$/;

const iso = (v: Date | string | null): string | null => (v === null ? null : new Date(v).toISOString());
const seconds = (v: Date | string | null): string | null => (v === null ? null : rfc3339Seconds(new Date(v).getTime()));

// ---------------------------------------------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------------------------------------------

export function registerAdmin(admin: FastifyInstance, deps: AdminDeps): void {
  const expected = Buffer.from(/^[0-9a-f]{64}$/.test(deps.operatorTokenSha256) ? deps.operatorTokenSha256 : "", "hex");
  const failures = new AuthFailures(deps);
  const operators = new WeakMap<FastifyRequest, Operator>();

  // onRequest runs before the body is read: nothing is parsed, validated, or looked up for an unauthenticated caller.
  admin.addHook("onRequest", async (req, reply) => {
    const result = authenticate(req.headers.authorization, deps.stack, expected);
    if (result.ok) {
      operators.set(req, { actor: result.actor, fingerprint: result.fingerprint });
      return undefined;
    }
    // The route template, or `other` for a path the listener doesn't serve; never the raw path.
    await failures.record(result.failure, req.routeOptions.url ?? "other");
    return reply.code(401).header("www-authenticate", 'Bearer realm="h4reet-admin"').send({ error: "unauthorized" });
  });

  const operatorOf = (req: FastifyRequest): Operator => {
    const operator = operators.get(req);
    if (operator === undefined) throw new Error("an admin route ran without authentication");
    return operator;
  };
  const unreachable = (req: FastifyRequest, reply: FastifyReply) => {
    noteErrorType(req, "store_unreachable");
    return reply.code(503).send({ error: "store_unreachable" });
  };

  admin.post("/admin/init", async (req, reply) => {
    const operator = operatorOf(req);
    // As the listener's own 415 for a type its parsers refuse (app.ts), so both carry the request ID.
    if (!isJson(req.headers["content-type"])) {
      return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
    }
    const parsed = initRequestOf(req.body);
    if (!parsed.ok)
      return reply.code(400).send({ error: "invalid_request", field: parsed.field, detail: parsed.detail });
    const result = await initializeStore(
      {
        stack: deps.stack,
        envClass: deps.envClass,
        store: deps.store,
        journal: deps.journal,
        clock: deps.clock,
        budgets: deps.budgets,
        alerts: deps.alerts,
        fallbackId: deps.fallbackId,
        metrics: deps.metrics,
        logger: deps.logger,
        realNow: deps.realNow,
      },
      parsed.request,
      operator,
    );
    if (result.status === 503) return unreachable(req, reply);
    return reply.code(result.status).send(result.body);
  });

  const operatorDeps = (): OperatorDeps => ({
    stack: deps.stack,
    envClass: deps.envClass,
    store: deps.store,
    journal: deps.journal,
    clock: deps.clock,
    budgets: deps.budgets,
    metrics: deps.metrics,
    logger: deps.logger,
    realNow: deps.realNow,
    meter: deps.meter,
    ...(deps.onChange === undefined ? {} : { onChange: deps.onChange }),
  });
  const answerWrite = (req: FastifyRequest, reply: FastifyReply, result: OperatorResult) =>
    result.status === 503 ? unreachable(req, reply) : reply.code(result.status).send(result.body);

  /** A reset or a renewal: JSON, a reason and nothing else, then its transaction (§1.2, §2.1, §2.2). */
  const reasonWrite =
    (run: (d: OperatorDeps, reason: string, operator: Operator) => Promise<OperatorResult>) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      const operator = operatorOf(req);
      if (!isJson(req.headers["content-type"])) {
        return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
      }
      const parsed = reasonRequestOf(req.body);
      if (!parsed.ok) {
        return reply.code(400).send({ error: "invalid_request", field: parsed.field, detail: parsed.detail });
      }
      return answerWrite(req, reply, await run(operatorDeps(), parsed.reason, operator));
    };

  admin.post("/admin/reset", reasonWrite(resetKillSwitch));
  admin.post("/admin/renew", reasonWrite(renewFallback));

  // spec 003's studio GPU window (its contracts/gpu-window.md §1): prod's, and dev-cpu's for rehearsals. dev routes no
  // fallback to hand hello to, so its listener doesn't serve the path, and answers 404 after authentication.
  if (deps.stack !== "dev") {
    admin.post("/admin/studio-window", async (req, reply) => {
      const operator = operatorOf(req);
      if (!isJson(req.headers["content-type"])) {
        return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
      }
      const parsed = studioWindowRequestOf(req.body);
      // The state goes on the server span once the body has a valid one; the reason never does.
      if (parsed.state !== undefined) noteStudioWindowState(req, parsed.state);
      if (!parsed.ok) {
        return reply.code(400).send({ error: "invalid_request", field: parsed.field, detail: parsed.detail });
      }
      return answerWrite(req, reply, await studioWindow(operatorDeps(), parsed.state, parsed.reason, operator));
    });
  }

  // §5: the live adapter calls, behind the same authentication.
  registerAdapterCalls(admin, {
    stack: deps.stack,
    gateway: deps.gateway,
    store: deps.store,
    clock: deps.clock,
    budgets: deps.budgets,
    metrics: deps.metrics,
    logger: deps.logger,
    realNow: deps.realNow,
    operatorOf,
  });

  // Spec 007's evaluation calls (operator-admin.md §8), behind the same authentication.
  if (deps.twin !== undefined) {
    registerAdminTwin(admin, {
      stack: deps.stack,
      gateway: deps.gateway,
      store: deps.store,
      clock: deps.clock,
      metrics: deps.metrics,
      logger: deps.logger,
      realNow: deps.realNow,
      operatorOf,
      twin: deps.twin,
    });
  }

  // §3: the dev-only test machinery, behind the same authentication.
  registerTestMachinery(admin, {
    stack: deps.stack,
    envClass: deps.envClass,
    gateway: deps.gateway,
    store: deps.store,
    clock: deps.clock,
    budgets: deps.budgets,
    metrics: deps.metrics,
    logger: deps.logger,
    realNow: deps.realNow,
    switches: deps.testMachinery,
    fallbackId: deps.fallbackId,
    operatorDeps,
    operatorOf,
    unreachable,
  });

  // §4.2: the audit log, newest first, a page at a time. Grafana's audit panel reads the same table, through grafana_ro.
  admin.get("/admin/audit", async (req, reply) => {
    operatorOf(req);
    const query = (req.query ?? {}) as Record<string, unknown>;
    if (Object.keys(query).some((k) => !["limit", "before_id", "action"].includes(k))) {
      return reply
        .code(400)
        .send({ error: "invalid_request", field: "query", detail: "the parameters are limit, before_id, and action" });
    }
    const limit = intParam(query, "limit", 1, 200);
    if (!limit.ok) return reply.code(400).send({ error: "invalid_request", field: limit.field, detail: limit.detail });
    const before = intParam(query, "before_id", 1, 9_999_999_999);
    if (!before.ok)
      return reply.code(400).send({ error: "invalid_request", field: before.field, detail: before.detail });
    const action = query.action;
    if (action !== undefined && (typeof action !== "string" || !AUDIT_ACTIONS.has(action))) {
      return reply.code(400).send({ error: "invalid_request", field: "action", detail: "one audit action" });
    }
    const n = limit.value ?? 50;
    let rows: {
      id: unknown;
      ts: Date | string;
      recorded_at: Date | string;
      actor: string;
      action: string;
      reason: string | null;
      before: unknown;
      after: unknown;
      detail: unknown;
    }[];
    try {
      rows = (
        await deps.store.query<(typeof rows)[number]>(
          `SELECT id, ts, recorded_at, actor, action, reason, before, after, detail FROM gateway.audit_log
           WHERE ($1::bigint IS NULL OR id < $1) AND ($2::text IS NULL OR action = $2)
           ORDER BY id DESC LIMIT $3`,
          [before.value ?? null, action ?? null, n + 1],
        )
      ).rows;
    } catch {
      return unreachable(req, reply);
    }
    const page = rows.slice(0, n);
    const entries = page.map((r) => ({
      id: Number(toBigInt(r.id)),
      ts: iso(r.ts),
      recorded_at: iso(r.recorded_at),
      actor: r.actor,
      action: r.action,
      reason: r.reason,
      before: r.before ?? null,
      after: r.after ?? null,
      detail: r.detail ?? {},
    }));
    return reply.code(200).send({
      entries,
      next_before_id: rows.length > n ? (entries.at(-1)?.id ?? null) : null,
    });
  });

  // §4.3: the incident drafts, newest first, each with its Markdown read back from the file the gateway wrote.
  admin.get("/admin/incidents", async (req, reply) => {
    operatorOf(req);
    const query = (req.query ?? {}) as Record<string, unknown>;
    if (Object.keys(query).some((k) => !["limit", "id"].includes(k))) {
      return reply
        .code(400)
        .send({ error: "invalid_request", field: "query", detail: "the parameters are limit or id" });
    }
    if (query.limit !== undefined && query.id !== undefined) {
      return reply.code(400).send({ error: "invalid_request", field: "query", detail: "limit or id, not both" });
    }
    const limit = intParam(query, "limit", 1, 20);
    if (!limit.ok) return reply.code(400).send({ error: "invalid_request", field: limit.field, detail: limit.detail });
    const id = intParam(query, "id", 1, 9_999_999_999);
    if (!id.ok) return reply.code(400).send({ error: "invalid_request", field: id.field, detail: id.detail });
    let rows: {
      id: unknown;
      created_at: Date | string;
      ceiling: string;
      period_key: string;
      status: string;
      path: string | null;
      sha256: string | null;
      written_at: Date | string | null;
    }[];
    try {
      rows = (
        await deps.store.query<(typeof rows)[number]>(
          `SELECT id, created_at, ceiling, period_key, status, path, sha256, written_at FROM gateway.incidents
           WHERE ($1::bigint IS NULL OR id = $1) ORDER BY id DESC LIMIT $2`,
          [id.value ?? null, limit.value ?? 5],
        )
      ).rows;
    } catch {
      return unreachable(req, reply);
    }
    const incidents = [];
    for (const r of rows) {
      let content: string | null = null;
      let matches: boolean | null = null;
      if (r.status === "written" && r.path !== null && DRAFT_PATH.test(r.path)) {
        try {
          const bytes = await readFile(join(deps.stateDir, r.path));
          content = bytes.toString("utf8");
          matches = createHash("sha256").update(bytes).digest("hex") === r.sha256;
        } catch {
          matches = false; // the file the row names is gone or unreadable
        }
      }
      incidents.push({
        id: Number(toBigInt(r.id)),
        created_at: seconds(r.created_at),
        ceiling: r.ceiling,
        period_key: r.period_key,
        status: r.status,
        path: r.path,
        sha256: r.sha256,
        sha256_matches: matches,
        written_at: seconds(r.written_at),
        content,
      });
    }
    return reply.code(200).send({ incidents });
  });

  // §4.1: everything GET /health reports, plus the meters, the limits, the journal, and the alert backlog. Like
  // /health it reports rather than gates: an empty or unreachable store shows as such, with no meters.
  admin.get("/admin/status", async (req, reply) => {
    operatorOf(req);
    const health = await deps.gateway.report();
    const gatewayNow = Date.parse(health.time);
    const periods = { day: dayKey(gatewayNow), month: monthKey(gatewayNow) };
    let initializedAt: string | null = null;
    let initializedBy: string | null = null;
    let meters: Record<string, unknown> | null = null;
    let alerts = { pending: 0, failed_last_24h: 0 };
    if (health.store === "ok") {
      try {
        const state = (
          await deps.store.query<{ initialized_at: Date | string; initialized_by: string }>(
            "SELECT initialized_at, initialized_by FROM gateway.stack_state WHERE id = 1",
          )
        ).rows[0];
        if (state !== undefined) {
          initializedAt = rfc3339Seconds(new Date(state.initialized_at).getTime());
          initializedBy = state.initialized_by;
        }
        const rows = await deps.store.readMeters(periods.day, periods.month);
        const blocked = health.state === "degraded" || health.fallback.awaiting_renewal === true;
        meters = meterReport(rows, thresholds(deps.budgets.envs[deps.envClass]), blocked);
        const counts = (
          await deps.store.query<{ pending: unknown; failed: unknown }>(
            `SELECT count(*) FILTER (WHERE telegram_status = 'pending' OR email_status = 'pending')::text AS pending,
                    count(*) FILTER (WHERE (telegram_status = 'failed' OR email_status = 'failed')
                                       AND enqueued_at > now() - interval '24 hours')::text AS failed
             FROM gateway.alert_outbox`,
          )
        ).rows[0];
        alerts = {
          pending: counts === undefined ? 0 : Number(toBigInt(counts.pending)),
          failed_last_24h: counts === undefined ? 0 : Number(toBigInt(counts.failed)),
        };
      } catch {
        return unreachable(req, reply);
      }
    }
    const counters = deps.gateway.meteredCounters();
    return reply.code(200).send({
      status: health.status,
      stack: health.stack,
      env: health.env,
      version: health.version,
      time: health.time,
      real_time: health.real_time,
      store: health.store,
      initialized_at: initializedAt,
      initialized_by: initializedBy,
      state: health.state,
      since: health.since,
      crossed: health.crossed,
      degraded_cause: health.degraded_cause,
      periods,
      meters,
      fallback: health.fallback,
      adapters: health.adapters,
      limits: { metered_in_flight: counters.inFlight, metered_last_minute: counters.lastMinute },
      journal: { status: deps.journal.status(), file: deps.journal.fileFor(gatewayNow) },
      alerts,
      config: health.config,
      test_machinery: health.test_machinery,
    });
  });
}

/**
 * The meters of §4.1. A period with no row yet shows 0 spend and the configured allowance. What fallback can still
 * spend is the smallest of three rooms, never below 0, and 0 while degraded or awaiting renewal.
 */
export function meterReport(rows: readonly MeterRow[], t: ReturnType<typeof thresholds>, blocked: boolean) {
  const row = (meter: MeterRow["meter"]) => rows.find((r) => r.meter === meter);
  const day = row("day");
  const month = row("month");
  const fallback = row("fallback_day");
  const allowance = fallback?.allowanceMicro ?? t.fallbackGrant;
  const spent = (r: MeterRow | undefined) => r?.spentMicro ?? 0n;
  const reserved = (r: MeterRow | undefined) => r?.reservedMicro ?? 0n;
  const rooms = [
    allowance - spent(fallback) - reserved(fallback),
    t.dayCeiling - spent(day) - reserved(day),
    t.monthCeiling - spent(month) - reserved(month),
  ];
  let available = rooms.reduce((a, b) => (b < a ? b : a));
  if (available < 0n || blocked) available = 0n;
  const n = (v: bigint): number => Number(v);
  return {
    day: {
      spent_micro_usd: n(spent(day)),
      reserved_micro_usd: n(reserved(day)),
      ceiling_micro_usd: n(t.dayCeiling),
      warn_micro_usd: n(t.dayWarn),
    },
    month: {
      spent_micro_usd: n(spent(month)),
      reserved_micro_usd: n(reserved(month)),
      ceiling_micro_usd: n(t.monthCeiling),
      warn_micro_usd: n(t.monthWarn),
    },
    fallback_day: {
      spent_micro_usd: n(spent(fallback)),
      reserved_micro_usd: n(reserved(fallback)),
      allowance_micro_usd: n(allowance),
      warn_micro_usd: n(t.fallbackWarn(allowance)),
      grant: fallback?.grantNo ?? 1,
      available_micro_usd: n(available),
    },
  };
}
