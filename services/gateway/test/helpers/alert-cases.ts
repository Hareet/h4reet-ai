// Alert contexts and specs for spec 011's tests (its plan §2.2, §3.6): every kind and variant of
// test/unit/alerts.test.ts's everyKind(), spec 010's included, and beside them every other shape the typed context
// and spec can take: each runtime and fallback state, the test clock, dev's class, the optional fields both ways, and
// characters that need escaping in the prefix and a label.
import type { AlertContext, AlertSpec, FallbackFacts, MeterFacts, RuntimeFacts } from "../../src/alerts/format.js";

export const T = (iso: string): number => Date.parse(iso);
export const FP = "1a2b3c4d";
export const WARN_70 = 7_000n;

/** Canaries where a careless renderer might pick them up (contracts/alerts.md §5). */
export const CANARIES = [
  "canary-client-label",
  "canary hello message",
  "Canary reason: breach rehearsal",
  "h4op_prod_",
];

export function meters(day: number, month: number, fallback: number, allowance = 2_000_000, grantNo = 1): MeterFacts {
  return {
    dayMicro: BigInt(day),
    dayCeilingMicro: 5_000_000n,
    dayWarnMicro: 3_500_000n,
    monthMicro: BigInt(month),
    monthCeilingMicro: 20_000_000n,
    monthWarnMicro: 14_000_000n,
    fallbackMicro: BigInt(fallback),
    fallbackAllowanceMicro: BigInt(allowance),
    fallbackWarnMicro: BigInt(allowance - 600_000),
    grantNo,
  };
}

export function ctx(o: {
  key: string;
  at: string;
  runtime?: RuntimeFacts;
  fallback?: FallbackFacts;
  meters?: MeterFacts;
  stack?: "prod" | "dev" | "dev-cpu";
  testClock?: boolean;
  prefix?: string;
}): AlertContext {
  const stack = o.stack ?? "prod";
  const prefixes = { prod: "[h4reet.ai prod]", dev: "[dev]", "dev-cpu": "[dev-cpu]" } as const;
  return {
    stack,
    envClass: stack === "prod" ? "prod" : "dev",
    prefix: o.prefix ?? prefixes[stack],
    dedupeKey: o.key,
    at: T(o.at),
    testClock: o.testClock ?? false,
    runtime: o.runtime ?? { state: "normal" },
    fallback: o.fallback ?? { state: "available" },
    ...(o.meters === undefined ? {} : { meters: o.meters }),
  };
}

/** A capped paid adapter's month at its warning (spec 010): $7.20 of a $10 cap. */
export const ADAPTER_MONTH = {
  adapter: "anthropic",
  label: "the Anthropic API",
  month: "2026-10",
  spentMicro: 7_200_000n,
  capMicro: 10_000_000n,
};

/** One context and spec for every kind, as test/unit/alerts.test.ts's everyKind() has them. */
export function everyKind(): [AlertContext, AlertSpec][] {
  const m = meters(1_000_000, 2_000_000, 300_000);
  const at = "2026-10-29T16:00:00Z";
  const since = T("2026-10-29T15:00:00Z");
  const base = (key: string, o: Partial<Parameters<typeof ctx>[0]> = {}) => ctx({ key, at, meters: m, ...o });
  return [
    [base("prod:warn:day:2026-10-29"), { kind: "warn", meter: "day", warnRatioBp: WARN_70 }],
    [base("prod:warn:month:2026-10"), { kind: "warn", meter: "month", warnRatioBp: WARN_70 }],
    [
      base("prod:warn:fallback_day:2026-10-29:g1"),
      { kind: "warn", meter: "fallback_day", grantNo: 1, warnRatioBp: WARN_70 },
    ],
    [base("prod:trip:day:2026-10-29", { runtime: { state: "degraded", since } }), { kind: "trip", ceiling: "day" }],
    [
      base("prod:fallback_exhausted:fallback_day:2026-10-29:g1", { fallback: { state: "awaiting", since } }),
      { kind: "fallback_exhausted", grantNo: 1 },
    ],
    [
      base("prod:operator_action:reset:1"),
      { kind: "operator_action", action: "reset", fingerprint: FP, metersAtCeiling: ["day"] },
    ],
    [
      base("prod:operator_action:renew:2"),
      { kind: "operator_action", action: "renew", fingerprint: FP, grantNo: 2, grantMicro: 2_000_000n },
    ],
    [
      base("prod:operator_action:init:3"),
      {
        kind: "operator_action",
        action: "init",
        fingerprint: FP,
        sources: ["journal"],
        confirmZero: false,
        renewed: true,
      },
    ],
    [
      base("prod:operator_action:studio_window:4"),
      { kind: "operator_action", action: "studio_window", fingerprint: FP, state: "start" },
    ],
    [
      base("prod:operator_action:studio_window:5"),
      {
        kind: "operator_action",
        action: "studio_window",
        fingerprint: FP,
        state: "end",
        fallbackMicro: 2_700n,
        fallbackCalls: 1,
      },
    ],
    [
      base("prod:credentials_expiring:bedrock:2026-10-29T18:00Z"),
      { kind: "credentials_expiring", adapter: "bedrock", label: "Bedrock", endsAt: T("2026-10-29T18:00:00Z") },
    ],
    [
      base("prod:fallback_unavailable:bedrock:2026-10-29T16Z"),
      { kind: "fallback_unavailable", adapter: "bedrock", reason: "credentials" },
    ],
    [
      base("prod:warn:adapter_month:anthropic:2026-10"),
      { kind: "warn", meter: "adapter_month", warnRatioBp: WARN_70, adapterMonth: ADAPTER_MONTH },
    ],
    [
      base("prod:fallback_exhausted:adapter_month:anthropic:2026-10", { fallback: { state: "awaiting", since } }),
      { kind: "fallback_exhausted", adapterMonth: ADAPTER_MONTH },
    ],
    [
      base("prod:fallback_unavailable:anthropic:2026-10-29T16Z"),
      { kind: "fallback_unavailable", adapter: "anthropic", label: "the Anthropic API", reason: "credentials" },
    ],
    [
      ctx({ key: "prod:auth_failed:admin:2026-10-29T16:00Z", at }),
      { kind: "auth_failed", count: 3, windowMinutes: 10, lastClass: "mismatch" },
    ],
    [
      ctx({
        key: "prod:store_unreachable:store:2026-10-29T15:00:00Z",
        at,
        runtime: { state: "unknown", since },
        fallback: { state: "unknown" },
      }),
      { kind: "store_unreachable", since, afterS: 60 },
    ],
    [
      base("prod:reminder:daily:2026-10-29", { runtime: { state: "degraded", since } }),
      { kind: "reminder", degradedSince: since, crossed: ["day:2026-10-29"] },
    ],
  ];
}

/** The shapes everyKind() leaves out: every state, the test clock, dev's class, and optional fields both ways. */
export function moreShapes(): [AlertContext, AlertSpec][] {
  const since = T("2026-10-29T15:00:00Z");
  const at = "2026-10-29T16:00:00.250Z";
  const noWarn: MeterFacts = { ...meters(5_000_000, 13_400_000, 2_000_000, 4_000_000, 2) };
  delete noWarn.fallbackWarnMicro;
  return [
    [
      ctx({ key: "dev:trip:month:2026-10", at, stack: "dev", testClock: true, meters: noWarn }),
      { kind: "trip", ceiling: "month" },
    ],
    [
      ctx({
        key: "dev-cpu:auth_failed:admin:2026-10-29T16:00Z",
        at,
        stack: "dev-cpu",
        runtime: { state: "uninitialized" },
        fallback: { state: "none" },
      }),
      { kind: "auth_failed", count: 7, windowMinutes: 10, lastClass: "wrong_prefix" },
    ],
    [
      ctx({ key: "prod:operator_action:init:9", at, runtime: { state: "unknown", since } }),
      { kind: "operator_action", action: "init", fingerprint: FP, sources: [], confirmZero: true, renewed: false },
    ],
    [
      ctx({ key: "prod:operator_action:reset:10", at, meters: meters(5_000_000, 20_000_000, 0) }),
      { kind: "operator_action", action: "reset", fingerprint: FP, metersAtCeiling: [] },
    ],
    [
      ctx({ key: "prod:fallback_unavailable:bedrock:2026-10-29T16Z", at }),
      { kind: "fallback_unavailable", adapter: "bedrock", label: "Bedrock", reason: "circuit_open" },
    ],
    [
      ctx({
        key: "prod:reminder:daily:2026-10-30",
        at: "2026-10-30T09:00:00Z",
        runtime: { state: "degraded", since },
        fallback: { state: "awaiting", since: T("2026-10-29T12:05:37Z") },
        meters: meters(0, 13_400_000, 0),
      }),
      {
        kind: "reminder",
        degradedSince: since,
        awaitingSince: T("2026-10-29T12:05:37Z"),
        crossed: ["day:2026-10-29", "month:2026-10"],
      },
    ],
    [
      ctx({
        key: "prod:reminder:daily:2026-10-31",
        at: "2026-10-31T09:00:00Z",
        fallback: { state: "awaiting", since: T("2026-10-29T12:05:37Z") },
        meters: meters(0, 3_000_000, 0),
      }),
      { kind: "reminder", awaitingSince: T("2026-10-29T12:05:37Z"), crossed: [] },
    ],
    [
      ctx({ key: "prod:warn:day:2026-10-29", at, meters: meters(3_525_000, 0, 0) }),
      { kind: "warn", meter: "day", warnRatioBp: 7_050n },
    ],
  ];
}

/** The characters that need escaping somewhere, and an emoji, in the prefix and a label (plan §3.6). */
export const AWKWARD = `&<>"'*_\`🧪`;

/** everyKind() and moreShapes() together. */
export const allShapes = (): [AlertContext, AlertSpec][] => [...everyKind(), ...moreShapes()];
