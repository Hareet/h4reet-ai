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
// Routes: POST /admin/init (meter/init.ts) and GET /admin/status. Reset, renew, audit, and incidents arrive with
// tasks.md T075, and the dev-only test machinery with T076.
import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { renderAlert, type FallbackFacts, type RuntimeFacts } from "../alerts/format.js";
import { dedupeKey as dedupeKeys, enqueueAlert } from "../alerts/outbox.js";
import { thresholds, type AlertsConfig, type Budgets, type EnvClass, type StackName } from "../config/validate.js";
import { dayKey, monthKey, toRfc3339, type GatewayClock } from "../core/clock.js";
import type { Gateway } from "../core/gateway.js";
import { rfc3339Seconds } from "../core/router.js";
import { initializeStore, type InitRequest, type Meter, type Operator } from "../meter/init.js";
import type { Journal } from "../meter/journal.js";
import { toBigInt, type MeterRow, type Store } from "../meter/store.js";
import type { AuthFailureClass, GatewayMetrics } from "../telemetry/metrics.js";
import { noteErrorType } from "../telemetry/otel.js";

export interface AdminDeps {
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
  /** The route's fallback adapter, or null. */
  fallbackId: string | null;
  metrics: GatewayMetrics;
  logger: { info(record: object, msg: string): void; warn(record: object, msg: string): void };
  realNow: () => number;
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

function isJson(contentType: string | undefined): boolean {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";
}

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
function meterReport(rows: readonly MeterRow[], t: ReturnType<typeof thresholds>, blocked: boolean) {
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
