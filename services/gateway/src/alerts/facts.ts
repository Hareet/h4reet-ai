// The alert facts (contracts/alerts.md §5; data-model.md §2.7; spec 011, plan §2.2): what an outbox row's `facts`
// hold, written with the plain text in the cause's transaction, and read back at each delivery attempt, when the
// designed forms are rendered from them (plan D1).
//
// Version 2 holds every value of the typed context and spec: numbers, states, times, the operator's fingerprint, and
// the stack's prefix and an adapter's ID and label, which come from configuration and code, never from a request. A
// strict, total decoder gives back exactly the context and spec the plain text was rendered from, or nothing: a row
// written before version 2, or facts with a key missing or ill-typed, decode to nothing, and their alert goes in its
// plain form (FR-030). It reads version 2's keys only and ignores any other, so a later version keeps decoding as 2,
// and it never throws.
import type { AuthFailureClass } from "../telemetry/metrics.js";
import type {
  AdapterMonthFacts,
  AlertContext,
  AlertSpec,
  Ceiling,
  FallbackFacts,
  InitSource,
  MeterFacts,
  RuntimeFacts,
} from "./format.js";

export const FACTS_VERSION = 2;

const iso = (ms: number): string => new Date(ms).toISOString();

/** An adapter month's facts, as numbers and IDs: never text a person wrote. */
function adapterMonthFacts(a: AdapterMonthFacts): Record<string, unknown> {
  return {
    adapter: a.adapter,
    label: a.label,
    month: a.month,
    spent_micro: Number(a.spentMicro),
    cap_micro: Number(a.capMicro),
  };
}

/** What each kind adds to the facts, beyond the common ones: numbers, states, times, IDs; never text from a person. */
function specFacts(spec: AlertSpec): Record<string, unknown> {
  switch (spec.kind) {
    case "warn":
      if (spec.meter === "adapter_month") {
        return { meter: spec.meter, warn_ratio_bp: Number(spec.warnRatioBp), ...adapterMonthFacts(spec.adapterMonth) };
      }
      return {
        meter: spec.meter,
        warn_ratio_bp: Number(spec.warnRatioBp),
        ...(spec.grantNo === undefined ? {} : { grant_no: spec.grantNo }),
      };
    case "trip":
      return { ceiling: spec.ceiling };
    case "fallback_exhausted":
      return "adapterMonth" in spec ? adapterMonthFacts(spec.adapterMonth) : { grant_no: spec.grantNo };
    case "operator_action":
      if (spec.action === "reset") {
        return { action: "reset", fingerprint: spec.fingerprint, meters_at_ceiling: [...spec.metersAtCeiling] };
      }
      if (spec.action === "renew") {
        return {
          action: "renew",
          fingerprint: spec.fingerprint,
          grant_no: spec.grantNo,
          grant_micro: Number(spec.grantMicro),
        };
      }
      if (spec.action === "studio_window") {
        return spec.state === "start"
          ? { action: "studio_window", fingerprint: spec.fingerprint, state: "start" }
          : {
              action: "studio_window",
              fingerprint: spec.fingerprint,
              state: "end",
              fallback_micro: Number(spec.fallbackMicro),
              fallback_calls: spec.fallbackCalls,
            };
      }
      return {
        action: spec.action,
        fingerprint: spec.fingerprint,
        sources: [...spec.sources],
        confirm_zero: spec.confirmZero,
        renewed: spec.renewed,
      };
    case "credentials_expiring":
      return { adapter: spec.adapter, label: spec.label, ends_at: iso(spec.endsAt) };
    case "fallback_unavailable":
      return { adapter: spec.adapter, label: spec.label ?? null, reason: spec.reason };
    case "auth_failed":
      return { count: spec.count, window_minutes: spec.windowMinutes, last_class: spec.lastClass };
    case "store_unreachable":
      return { since: iso(spec.since), after_s: spec.afterS };
    case "reminder":
      return {
        degraded_since: spec.degradedSince === undefined ? null : iso(spec.degradedSince),
        awaiting_since: spec.awaitingSince === undefined ? null : iso(spec.awaitingSince),
        crossed: [...spec.crossed],
      };
  }
}

/** The facts an alert row stores: version 2, every value its forms show, in micro-USD. */
export function factsOf(ctx: AlertContext, spec: AlertSpec): Record<string, unknown> {
  const m = ctx.meters;
  return {
    facts_version: FACTS_VERSION,
    kind: spec.kind,
    stack: ctx.stack,
    env_class: ctx.envClass,
    prefix: ctx.prefix,
    at: iso(ctx.at),
    test_clock: ctx.testClock,
    runtime: ctx.runtime.state,
    runtime_since: "since" in ctx.runtime ? iso(ctx.runtime.since) : null,
    fallback: ctx.fallback.state,
    fallback_since: ctx.fallback.state === "awaiting" ? iso(ctx.fallback.since) : null,
    ...(m === undefined
      ? {}
      : {
          meters: {
            day_micro: Number(m.dayMicro),
            day_ceiling_micro: Number(m.dayCeilingMicro),
            day_warn_micro: Number(m.dayWarnMicro),
            month_micro: Number(m.monthMicro),
            month_ceiling_micro: Number(m.monthCeilingMicro),
            month_warn_micro: Number(m.monthWarnMicro),
            fallback_micro: Number(m.fallbackMicro),
            fallback_allowance_micro: Number(m.fallbackAllowanceMicro),
            ...(m.fallbackWarnMicro === undefined ? {} : { fallback_warn_micro: Number(m.fallbackWarnMicro) }),
            grant_no: m.grantNo,
          },
        }),
    ...specFacts(spec),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The decoder: strict, total, and never throwing
// ---------------------------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

/** Thrown inside the decoder for any key it can't accept; caught at its top, never outside it. */
class Undecodable extends Error {}

const no = (): never => {
  throw new Undecodable();
};
const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const object = (v: unknown): Json => (isObject(v) ? v : no());
const flag = (v: unknown): boolean => (typeof v === "boolean" ? v : no());
const oneOf = <T extends string>(list: readonly T[], v: unknown): T =>
  (list as readonly unknown[]).includes(v) ? (v as T) : no();
/** A whole number from `min`, within JavaScript's safe integers. */
const whole = (v: unknown, min = 0): number => (Number.isSafeInteger(v) && (v as number) >= min ? (v as number) : no());
/** Micro-USD: a whole number from 0 that is a safe integer, so it converts exactly. */
const microOf = (v: unknown): bigint => BigInt(whole(v));
/** A string of `min` to `max` UTF-16 code units, as rule A5 counts a prefix. */
const text = (v: unknown, min: number, max: number): string =>
  typeof v === "string" && v.length >= min && v.length <= max ? v : no();
const matching = (v: unknown, re: RegExp): string => (typeof v === "string" && re.test(v) ? v : no());
const list = <T>(v: unknown, each: (x: unknown) => T): T[] => (Array.isArray(v) ? v.map(each) : no());
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** A time as factsOf writes it, toISOString's form exactly, as epoch milliseconds. */
const time = (v: unknown): number => {
  const s = matching(v, ISO_MS);
  const ms = Date.parse(s);
  return Number.isFinite(ms) && iso(ms) === s ? ms : no();
};
const nullOr = <T>(v: unknown, read: (x: unknown) => T): T | null => (v === null ? null : read(v));

/** routing.yaml's adapter ID rule (config-files.md §1.3, R11). */
const ADAPTER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const FINGERPRINT = /^[0-9a-f]{8}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const CROSSED = /^(day:\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2})$/;
const CEILINGS: readonly Ceiling[] = ["day", "month"];
const SOURCES: readonly InitSource[] = ["ledger", "journal", "stated"];
const AUTH_CLASSES: readonly AuthFailureClass[] = ["missing", "malformed", "wrong_prefix", "mismatch"];
const label = (v: unknown): string => text(v, 1, 64);

function runtimeOf(f: Json): RuntimeFacts {
  const state = oneOf(["normal", "degraded", "uninitialized", "unknown"] as const, f.runtime);
  if (state === "degraded" || state === "unknown") return { state, since: time(f.runtime_since) };
  if (f.runtime_since !== null) no();
  return { state };
}

function fallbackOf(f: Json): FallbackFacts {
  const state = oneOf(["none", "available", "awaiting", "unknown"] as const, f.fallback);
  if (state === "awaiting") return { state, since: time(f.fallback_since) };
  if (f.fallback_since !== null) no();
  return { state };
}

function metersOf(v: unknown): MeterFacts {
  const m = object(v);
  return {
    dayMicro: microOf(m.day_micro),
    dayCeilingMicro: microOf(m.day_ceiling_micro),
    dayWarnMicro: microOf(m.day_warn_micro),
    monthMicro: microOf(m.month_micro),
    monthCeilingMicro: microOf(m.month_ceiling_micro),
    monthWarnMicro: microOf(m.month_warn_micro),
    fallbackMicro: microOf(m.fallback_micro),
    fallbackAllowanceMicro: microOf(m.fallback_allowance_micro),
    ...("fallback_warn_micro" in m ? { fallbackWarnMicro: microOf(m.fallback_warn_micro) } : {}),
    grantNo: whole(m.grant_no, 1),
  };
}

function adapterMonthOf(f: Json): AdapterMonthFacts {
  return {
    adapter: matching(f.adapter, ADAPTER_ID),
    label: label(f.label),
    month: matching(f.month, MONTH),
    spentMicro: microOf(f.spent_micro),
    capMicro: microOf(f.cap_micro),
  };
}

function specOf(f: Json): AlertSpec {
  switch (f.kind) {
    case "warn": {
      const meter = oneOf(["day", "month", "fallback_day", "adapter_month"] as const, f.meter);
      const warnRatioBp = BigInt(whole(f.warn_ratio_bp));
      if (meter === "adapter_month") return { kind: "warn", meter, warnRatioBp, adapterMonth: adapterMonthOf(f) };
      return { kind: "warn", meter, warnRatioBp, ...("grant_no" in f ? { grantNo: whole(f.grant_no, 1) } : {}) };
    }
    case "trip":
      return { kind: "trip", ceiling: oneOf(CEILINGS, f.ceiling) };
    case "fallback_exhausted":
      return "adapter" in f
        ? { kind: "fallback_exhausted", adapterMonth: adapterMonthOf(f) }
        : { kind: "fallback_exhausted", grantNo: whole(f.grant_no, 1) };
    case "operator_action": {
      const fingerprint = matching(f.fingerprint, FINGERPRINT);
      switch (f.action) {
        case "reset":
          return {
            kind: "operator_action",
            action: "reset",
            fingerprint,
            metersAtCeiling: list(f.meters_at_ceiling, (x) => oneOf(CEILINGS, x)),
          };
        case "renew":
          return {
            kind: "operator_action",
            action: "renew",
            fingerprint,
            grantNo: whole(f.grant_no, 1),
            grantMicro: microOf(f.grant_micro),
          };
        case "studio_window":
          if (f.state === "start")
            return { kind: "operator_action", action: "studio_window", fingerprint, state: "start" };
          if (f.state !== "end") return no();
          return {
            kind: "operator_action",
            action: "studio_window",
            fingerprint,
            state: "end",
            fallbackMicro: microOf(f.fallback_micro),
            fallbackCalls: whole(f.fallback_calls),
          };
        case "init":
          return {
            kind: "operator_action",
            action: "init",
            fingerprint,
            sources: list(f.sources, (x) => oneOf(SOURCES, x)),
            confirmZero: flag(f.confirm_zero),
            renewed: flag(f.renewed),
          };
        default:
          return no();
      }
    }
    case "credentials_expiring":
      return {
        kind: "credentials_expiring",
        adapter: matching(f.adapter, ADAPTER_ID),
        label: label(f.label),
        endsAt: time(f.ends_at),
      };
    case "fallback_unavailable": {
      if (!("label" in f)) no();
      const named = nullOr(f.label, label);
      return {
        kind: "fallback_unavailable",
        adapter: matching(f.adapter, ADAPTER_ID),
        ...(named === null ? {} : { label: named }),
        reason: oneOf(["credentials", "circuit_open"] as const, f.reason),
      };
    }
    case "auth_failed":
      return {
        kind: "auth_failed",
        count: whole(f.count),
        windowMinutes: whole(f.window_minutes),
        lastClass: oneOf(AUTH_CLASSES, f.last_class),
      };
    case "store_unreachable":
      return { kind: "store_unreachable", since: time(f.since), afterS: whole(f.after_s) };
    case "reminder": {
      if (!("degraded_since" in f) || !("awaiting_since" in f)) no();
      const degradedSince = nullOr(f.degraded_since, time);
      const awaitingSince = nullOr(f.awaiting_since, time);
      return {
        kind: "reminder",
        crossed: list(f.crossed, (x) => matching(x, CROSSED)),
        ...(degradedSince === null ? {} : { degradedSince }),
        ...(awaitingSince === null ? {} : { awaitingSince }),
      };
    }
    default:
      return no();
  }
}

/**
 * The typed context and spec a row's facts were written from, with its dedupe key, or undefined when the facts aren't
 * version 2's or can't be read. Never throws.
 */
export function decodeFacts(facts: unknown, dedupeKey: string): { ctx: AlertContext; spec: AlertSpec } | undefined {
  try {
    const f = object(facts);
    if (f.facts_version !== FACTS_VERSION) return undefined;
    if (!("runtime_since" in f) || !("fallback_since" in f)) return undefined;
    const ctx: AlertContext = {
      stack: oneOf(["prod", "dev", "dev-cpu"] as const, f.stack),
      envClass: oneOf(["prod", "dev"] as const, f.env_class),
      prefix: text(f.prefix, 1, 32),
      dedupeKey,
      at: time(f.at),
      testClock: flag(f.test_clock),
      runtime: runtimeOf(f),
      fallback: fallbackOf(f),
      ...("meters" in f ? { meters: metersOf(f.meters) } : {}),
    };
    return { ctx, spec: specOf(f) };
  } catch {
    return undefined;
  }
}
