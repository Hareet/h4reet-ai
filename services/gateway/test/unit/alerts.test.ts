// Alert texts and dedupe keys (tasks.md T069; contracts/alerts.md §2, §3, §5): every message of §3 rendered from
// typed facts exactly as its example, with no payload, client label, operator reason, or secret, and every dedupe
// key of §2, :g<n> included.
import { describe, expect, it } from "vitest";

import {
  renderAlert,
  usd,
  type AlertContext,
  type AlertSpec,
  type FallbackFacts,
  type MeterFacts,
  type RuntimeFacts,
} from "../../src/alerts/format.js";
import { dedupeKey } from "../../src/alerts/outbox.js";

const T = (iso: string): number => Date.parse(iso);
const FP = "1a2b3c4d";

function meters(day: number, month: number, fallback: number, allowance = 2_000_000, grantNo = 1): MeterFacts {
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

function ctx(o: {
  key: string;
  at: string;
  runtime?: RuntimeFacts;
  fallback?: FallbackFacts;
  meters?: MeterFacts;
  stack?: "prod" | "dev" | "dev-cpu";
  testClock?: boolean;
}): AlertContext {
  const stack = o.stack ?? "prod";
  const prefixes = { prod: "[h4reet.ai prod]", dev: "[dev]", "dev-cpu": "[dev-cpu]" } as const;
  return {
    stack,
    envClass: stack === "prod" ? "prod" : "dev",
    prefix: prefixes[stack],
    dedupeKey: o.key,
    at: T(o.at),
    testClock: o.testClock ?? false,
    runtime: o.runtime ?? { state: "normal" },
    fallback: o.fallback ?? { state: "available" },
    ...(o.meters === undefined ? {} : { meters: o.meters }),
  };
}

const lines = (c: AlertContext, s: AlertSpec): string[] => renderAlert(c, s).body.split("\n");
const WARN_70 = 7_000n;

describe("§3: every kind, as its example", () => {
  it("warn, day", () => {
    const c = ctx({
      key: "prod:warn:day:2026-10-28",
      at: "2026-10-28T14:02:11Z",
      meters: meters(3_500_000, 9_100_000, 400_000),
    });
    const rendered = renderAlert(c, { kind: "warn", meter: "day", warnRatioBp: WARN_70 });
    expect(rendered.body.split("\n")).toEqual([
      "[h4reet.ai prod] WARNING: daily meter at 70%",
      "Daily: 3.50 / 5.00 USD (warning 3.50) · Month: 9.10 / 20.00 (warning 14.00) · Fallback today: 0.40 / 2.00 (grant 1)",
      "Runtime: normal · Fallback: available · 2026-10-28T14:02:11Z · id prod:warn:day:2026-10-28",
      "Runbook: docs/runbooks/cost-warning.md",
    ]);
    // Email: line 1 is the subject, the whole text the body (§3).
    expect(rendered.subject).toBe("[h4reet.ai prod] WARNING: daily meter at 70%");
  });

  it("warn, month", () => {
    const c = ctx({
      key: "prod:warn:month:2026-10",
      at: "2026-10-29T10:15:00Z",
      meters: meters(1_200_000, 14_030_000, 0),
    });
    expect(lines(c, { kind: "warn", meter: "month", warnRatioBp: WARN_70 })).toEqual([
      "[h4reet.ai prod] WARNING: monthly meter at 70%",
      "Daily: 1.20 / 5.00 USD (warning 3.50) · Month: 14.03 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 1)",
      "Runtime: normal · Fallback: available · 2026-10-29T10:15:00Z · id prod:warn:month:2026-10",
      "Runbook: docs/runbooks/cost-warning.md",
    ]);
  });

  it("warn, fallback grant: the meters line adds the grant's warning", () => {
    const c = ctx({
      key: "prod:warn:fallback_day:2026-10-28:g1",
      at: "2026-10-28T11:40:52Z",
      meters: meters(2_100_000, 11_200_000, 1_400_000),
    });
    expect(lines(c, { kind: "warn", meter: "fallback_day", grantNo: 1, warnRatioBp: WARN_70 })).toEqual([
      "[h4reet.ai prod] WARNING: fallback sub-budget at 70% of grant 1",
      "Daily: 2.10 / 5.00 USD (warning 3.50) · Month: 11.20 / 20.00 (warning 14.00) · Fallback today: 1.40 / 2.00 (grant 1, warning 1.40)",
      "Runtime: normal · Fallback: available · 2026-10-28T11:40:52Z · id prod:warn:fallback_day:2026-10-28:g1",
      "Runbook: docs/runbooks/cost-warning.md",
    ]);
  });

  it("trip", () => {
    const c = ctx({
      key: "prod:trip:day:2026-10-29",
      at: "2026-10-29T16:40:03Z",
      runtime: { state: "degraded", since: T("2026-10-29T16:40:03Z") },
      meters: meters(5_000_000, 13_400_000, 2_000_000, 4_000_000, 2),
    });
    expect(lines(c, { kind: "trip", ceiling: "day" })).toEqual([
      "[h4reet.ai prod] KILL SWITCH TRIPPED: daily ceiling reached",
      "Daily: 5.00 / 5.00 USD (warning 3.50) · Month: 13.40 / 20.00 (warning 14.00) · Fallback today: 2.00 / 4.00 (grant 2)",
      "Runtime: degraded since 2026-10-29T16:40:03Z · Fallback: available · 2026-10-29T16:40:03Z · id prod:trip:day:2026-10-29",
      "Every request now gets the degraded response, local answers included. Only an operator reset restores service.",
      "Runbook: docs/runbooks/kill-switch-trip.md",
    ]);
    expect(lines(c, { kind: "trip", ceiling: "month" })[0]).toBe(
      "[h4reet.ai prod] KILL SWITCH TRIPPED: monthly ceiling reached",
    );
  });

  it("fallback_exhausted", () => {
    const c = ctx({
      key: "prod:fallback_exhausted:fallback_day:2026-10-28:g1",
      at: "2026-10-28T12:05:37Z",
      fallback: { state: "awaiting", since: T("2026-10-28T12:05:37Z") },
      meters: meters(3_600_000, 12_100_000, 2_000_000),
    });
    expect(lines(c, { kind: "fallback_exhausted", grantNo: 1 })).toEqual([
      "[h4reet.ai prod] FALLBACK EXHAUSTED: grant 1 of today's sub-budget is spent",
      "Daily: 3.60 / 5.00 USD (warning 3.50) · Month: 12.10 / 20.00 (warning 14.00) · Fallback today: 2.00 / 2.00 (grant 1)",
      "Runtime: normal · Fallback: awaiting renewal since 2026-10-28T12:05:37Z · 2026-10-28T12:05:37Z · id prod:fallback_exhausted:fallback_day:2026-10-28:g1",
      "Fallback stays refused, across days and restarts, until the operator renews it.",
      "Runbook: docs/runbooks/fallback-renewal.md",
    ]);
  });

  it("operator_action, reset: the headline names the action and the fingerprint, never the reason", () => {
    const c = ctx({
      key: "prod:operator_action:reset:41",
      at: "2026-10-29T17:05:12Z",
      meters: meters(5_000_000, 13_400_000, 2_000_000, 4_000_000, 2),
    });
    expect(lines(c, { kind: "operator_action", action: "reset", fingerprint: FP, metersAtCeiling: ["day"] })).toEqual([
      `[h4reet.ai prod] OPERATOR ACTION: reset by operator #${FP}`,
      "Daily: 5.00 / 5.00 USD (warning 3.50) · Month: 13.40 / 20.00 (warning 14.00) · Fallback today: 2.00 / 4.00 (grant 2)",
      "Runtime: normal · Fallback: available · 2026-10-29T17:05:12Z · id prod:operator_action:reset:41",
      "Local answers resume. Metered calls stay refused while a meter is at or above its ceiling: day.",
      "Runbook: docs/runbooks/kill-switch-reset.md",
    ]);
    // The second sentence is omitted when no meter is at its ceiling; both meters are named together.
    expect(lines(c, { kind: "operator_action", action: "reset", fingerprint: FP, metersAtCeiling: [] })[3]).toBe(
      "Local answers resume.",
    );
    expect(
      lines(c, { kind: "operator_action", action: "reset", fingerprint: FP, metersAtCeiling: ["day", "month"] })[3],
    ).toBe("Local answers resume. Metered calls stay refused while a meter is at or above its ceiling: day and month.");
  });

  it("operator_action, renew", () => {
    const c = ctx({
      key: "prod:operator_action:renew:42",
      at: "2026-10-28T12:30:00Z",
      meters: meters(2_000_000, 9_000_000, 2_000_000, 4_000_000, 2),
    });
    expect(
      lines(c, { kind: "operator_action", action: "renew", fingerprint: FP, grantNo: 2, grantMicro: 2_000_000n }),
    ).toEqual([
      `[h4reet.ai prod] OPERATOR ACTION: fallback renewed by operator #${FP}`,
      "Daily: 2.00 / 5.00 USD (warning 3.50) · Month: 9.00 / 20.00 (warning 14.00) · Fallback today: 2.00 / 4.00 (grant 2)",
      "Runtime: normal · Fallback: available · 2026-10-28T12:30:00Z · id prod:operator_action:renew:42",
      "$2.00 more fallback is available now, within the daily ceiling (grant 2).",
      "Runbook: docs/runbooks/fallback-renewal.md",
    ]);
  });

  it("credentials_expiring, with the adapter's own label and runbook", () => {
    const c = ctx({
      key: "prod:credentials_expiring:bedrock:2026-10-29T18:00Z",
      at: "2026-10-29T16:00:04Z",
      meters: meters(300_000, 13_700_000, 300_000),
    });
    const spec: AlertSpec = {
      kind: "credentials_expiring",
      adapter: "bedrock",
      label: "Bedrock",
      endsAt: T("2026-10-29T18:00:00Z"),
    };
    expect(lines(c, spec)).toEqual([
      "[h4reet.ai prod] CREDENTIALS EXPIRING: the Bedrock SSO session ends at 2026-10-29T18:00:00Z",
      "Daily: 0.30 / 5.00 USD (warning 3.50) · Month: 13.70 / 20.00 (warning 14.00) · Fallback today: 0.30 / 2.00 (grant 1)",
      "Runtime: normal · Fallback: available · 2026-10-29T16:00:04Z · id prod:credentials_expiring:bedrock:2026-10-29T18:00Z",
      "Fallback to Bedrock stops then. Run make aws-login in your terminal.",
      "Runbook: docs/runbooks/bedrock-credentials-expiring.md",
    ]);
  });

  it("fallback_unavailable, naming the health reason", () => {
    const c = ctx({
      key: "prod:fallback_unavailable:bedrock:2026-10-29T16Z",
      at: "2026-10-29T16:12:44Z",
      meters: meters(300_000, 13_700_000, 300_000),
    });
    expect(lines(c, { kind: "fallback_unavailable", adapter: "bedrock", reason: "circuit_open" })).toEqual([
      "[h4reet.ai prod] FALLBACK UNAVAILABLE: bedrock is unhealthy (circuit open)",
      "Daily: 0.30 / 5.00 USD (warning 3.50) · Month: 13.70 / 20.00 (warning 14.00) · Fallback today: 0.30 / 2.00 (grant 1)",
      "Runtime: normal · Fallback: available · 2026-10-29T16:12:44Z · id prod:fallback_unavailable:bedrock:2026-10-29T16Z",
      "If the local model goes down, hello answers degraded with fallback_unavailable.",
      "Runbook: docs/runbooks/bedrock-unavailable.md",
    ]);
    expect(lines(c, { kind: "fallback_unavailable", adapter: "bedrock", reason: "credentials" })[0]).toBe(
      "[h4reet.ai prod] FALLBACK UNAVAILABLE: bedrock is unhealthy (credentials)",
    );
  });

  it("auth_failed: no meters line, and the class in words", () => {
    const c = ctx({ key: "prod:auth_failed:admin:2026-10-29T16:00Z", at: "2026-10-29T16:02:11Z" });
    expect(lines(c, { kind: "auth_failed", count: 3, windowMinutes: 10, lastClass: "wrong_prefix" })).toEqual([
      "[h4reet.ai prod] AUTH FAILURES: 3 failed operator authentications in 10 minutes",
      "Runtime: normal · Fallback: available · 2026-10-29T16:02:11Z · id prod:auth_failed:admin:2026-10-29T16:00Z",
      "The admin listener refused them (last: wrong prefix). No action was taken.",
      "Runbook: docs/runbooks/operator-auth-failures.md",
    ]);
  });

  it("store_unreachable: no meters line, and no fallback state, since the store can't be read", () => {
    const since = T("2026-10-29T16:01:00Z");
    const c = ctx({
      key: "prod:store_unreachable:store:2026-10-29T16:01:00Z",
      at: "2026-10-29T16:02:00Z",
      runtime: { state: "unknown", since },
      fallback: { state: "unknown" },
    });
    expect(lines(c, { kind: "store_unreachable", since, afterS: 60 })).toEqual([
      "[h4reet.ai prod] STORE UNREACHABLE: the kill-switch store hasn't answered for 60 s",
      "Runtime: unknown, treated as degraded since 2026-10-29T16:01:00Z · 2026-10-29T16:02:00Z · id prod:store_unreachable:store:2026-10-29T16:01:00Z",
      "Every request gets 503 store_unreachable (fail closed). Meters and alerts resume when the store answers.",
      "Runbook: docs/runbooks/store-unreachable.md",
    ]);
  });

  it("reminder, while degraded", () => {
    const since = T("2026-10-29T16:40:03Z");
    const c = ctx({
      key: "prod:reminder:daily:2026-10-30",
      at: "2026-10-30T09:00:00Z",
      runtime: { state: "degraded", since },
      meters: meters(0, 13_400_000, 0),
    });
    expect(lines(c, { kind: "reminder", degradedSince: since, crossed: ["day:2026-10-29"] })).toEqual([
      "[h4reet.ai prod] REMINDER: still degraded since 2026-10-29T16:40:03Z (daily ceiling, 2026-10-29)",
      "Daily: 0.00 / 5.00 USD (warning 3.50) · Month: 13.40 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 1)",
      "Runtime: degraded since 2026-10-29T16:40:03Z · Fallback: available · 2026-10-30T09:00:00Z · id prod:reminder:daily:2026-10-30",
      "Only an operator reset restores service.",
      "Runbook: docs/runbooks/kill-switch-trip.md",
    ]);
  });

  it("reminder, covering both conditions, and renewal alone", () => {
    const degradedSince = T("2026-10-29T16:40:03Z");
    const awaitingSince = T("2026-10-29T12:05:37Z");
    const both = ctx({
      key: "prod:reminder:daily:2026-10-30",
      at: "2026-10-30T09:00:00Z",
      runtime: { state: "degraded", since: degradedSince },
      fallback: { state: "awaiting", since: awaitingSince },
      meters: meters(0, 13_400_000, 0),
    });
    const rendered = lines(both, {
      kind: "reminder",
      degradedSince,
      awaitingSince,
      crossed: ["day:2026-10-29", "month:2026-10"],
    });
    expect(rendered[0]).toBe(
      "[h4reet.ai prod] REMINDER: still degraded since 2026-10-29T16:40:03Z (daily ceiling, 2026-10-29; monthly ceiling, 2026-10)",
    );
    expect(rendered.slice(3)).toEqual([
      "Only an operator reset restores service. Only a renewal restores fallback.",
      "Runbook: docs/runbooks/kill-switch-trip.md",
    ]);
    const awaiting = ctx({
      key: "prod:reminder:daily:2026-10-30",
      at: "2026-10-30T09:00:00Z",
      fallback: { state: "awaiting", since: awaitingSince },
      meters: meters(0, 3_000_000, 0),
    });
    const alone = lines(awaiting, { kind: "reminder", awaitingSince, crossed: [] });
    expect(alone[0]).toBe("[h4reet.ai prod] REMINDER: fallback still awaiting renewal since 2026-10-29T12:05:37Z");
    expect(alone.slice(3)).toEqual(["Only a renewal restores fallback.", "Runbook: docs/runbooks/fallback-renewal.md"]);
  });

  it("the dev example: the [dev] prefix, synthetic spend, and the test clock", () => {
    const c = ctx({
      stack: "dev",
      key: "dev:warn:day:2026-10-27",
      at: "2026-10-27T08:01:30Z",
      testClock: true,
      meters: meters(3_500_000, 3_500_000, 0),
    });
    expect(lines(c, { kind: "warn", meter: "day", warnRatioBp: WARN_70 })).toEqual([
      "[dev] WARNING: daily meter at 70%",
      "Daily: 3.50 / 5.00 USD (warning 3.50) · Month: 3.50 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 1) (synthetic spend)",
      "Runtime: normal · Fallback: available · 2026-10-27T08:01:30Z (test clock) · id dev:warn:day:2026-10-27",
      "Runbook: docs/runbooks/cost-warning.md",
    ]);
  });

  it("dev-cpu's prefix is [dev-cpu], and every time carries the test clock's mark", () => {
    const c = ctx({
      stack: "dev-cpu",
      key: "dev-cpu:trip:day:2026-10-22",
      at: "2026-10-22T08:10:00Z",
      testClock: true,
      runtime: { state: "degraded", since: T("2026-10-22T08:10:00Z") },
      fallback: { state: "awaiting", since: T("2026-10-22T08:00:00Z") },
      meters: meters(5_000_000, 8_500_000, 2_000_000),
    });
    expect(lines(c, { kind: "trip", ceiling: "day" }).slice(0, 3)).toEqual([
      "[dev-cpu] KILL SWITCH TRIPPED: daily ceiling reached",
      "Daily: 5.00 / 5.00 USD (warning 3.50) · Month: 8.50 / 20.00 (warning 14.00) · Fallback today: 2.00 / 2.00 (grant 1) (synthetic spend)",
      "Runtime: degraded since 2026-10-22T08:10:00Z (test clock) · Fallback: awaiting renewal since 2026-10-22T08:00:00Z (test clock) · 2026-10-22T08:10:00Z (test clock) · id dev-cpu:trip:day:2026-10-22",
    ]);
  });

  it("a warning ratio that isn't a whole percent shows its decimals", () => {
    const c = ctx({ key: "prod:warn:day:2026-10-28", at: "2026-10-28T14:02:11Z", meters: meters(3_525_000, 0, 0) });
    expect(lines(c, { kind: "warn", meter: "day", warnRatioBp: 7_050n })[0]).toBe(
      "[h4reet.ai prod] WARNING: daily meter at 70.5%",
    );
  });
});

describe("§3: amounts and limits", () => {
  it("shows USD with two decimals, truncated toward zero, so a display never shows more than was spent", () => {
    expect(usd(3_499_999n)).toBe("3.49");
    expect(usd(5_000_000n)).toBe("5.00");
    expect(usd(9_999n)).toBe("0.00");
    expect(usd(0n)).toBe("0.00");
  });

  it("keeps the exact micro-USD values in facts", () => {
    const c = ctx({
      key: "prod:warn:day:2026-10-28",
      at: "2026-10-28T14:02:11Z",
      meters: meters(3_509_999, 9_100_000, 400_000),
    });
    const { facts, body } = renderAlert(c, { kind: "warn", meter: "day", warnRatioBp: WARN_70 });
    expect(body).toContain("Daily: 3.50 / 5.00 USD");
    expect(facts).toMatchObject({
      kind: "warn",
      stack: "prod",
      meter: "day",
      warn_ratio_bp: 7000,
      meters: { day_micro: 3_509_999, day_ceiling_micro: 5_000_000, month_micro: 9_100_000, fallback_micro: 400_000 },
    });
  });

  it("is plain text of at most 1,000 characters", () => {
    for (const [c, s] of everyKind()) {
      const { body, subject } = renderAlert(c, s);
      expect(body.length, s.kind).toBeLessThanOrEqual(1_000);
      expect(body.split("\n")[0], s.kind).toBe(subject);
    }
  });
});

/** One context and spec for every kind, with the operator's fingerprint where the kind has one. */
function everyKind(): [AlertContext, AlertSpec][] {
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
      base("prod:credentials_expiring:bedrock:2026-10-29T18:00Z"),
      { kind: "credentials_expiring", adapter: "bedrock", label: "Bedrock", endsAt: T("2026-10-29T18:00:00Z") },
    ],
    [
      base("prod:fallback_unavailable:bedrock:2026-10-29T16Z"),
      { kind: "fallback_unavailable", adapter: "bedrock", reason: "credentials" },
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

describe("§5: what never appears", () => {
  it("renders every kind from typed facts: no field can carry a payload, a client label, a reason, or a secret", () => {
    // Canaries where a careless formatter might pick them up: the ledger's client label, the hello message, the
    // operator's reason, and a token. renderAlert takes none of them, so none can appear.
    const canaries = ["canary-client-label", "canary hello message", "Canary reason: breach rehearsal", "h4op_prod_"];
    const kinds = new Set<string>();
    for (const [c, s] of everyKind()) {
      kinds.add(s.kind);
      const rendered = renderAlert(c, s);
      const all = `${rendered.subject}\n${rendered.body}\n${JSON.stringify(rendered.facts)}`;
      for (const canary of canaries) expect(all, s.kind).not.toContain(canary);
      // Only the fingerprint, never more of the token's hash.
      expect(all).not.toMatch(/[0-9a-f]{9,}/);
    }
    expect([...kinds].sort()).toEqual([
      "auth_failed",
      "credentials_expiring",
      "fallback_exhausted",
      "fallback_unavailable",
      "operator_action",
      "reminder",
      "store_unreachable",
      "trip",
      "warn",
    ]);
  });

  it("accepts no unknown field: a spec with a payload or a reason doesn't type-check", () => {
    const c = ctx({ key: "prod:warn:day:2026-10-29", at: "2026-10-29T16:00:00Z", meters: meters(0, 0, 0) });
    // @ts-expect-error: no AlertSpec has a reason, and excess properties are refused.
    renderAlert(c, { kind: "warn", meter: "day", warnRatioBp: WARN_70, reason: "Canary reason: breach rehearsal" });
    // @ts-expect-error: nor a client label.
    renderAlert(c, { kind: "trip", ceiling: "day", clientLabel: "canary-client-label" });
  });
});

describe("§2: dedupe keys", () => {
  it("has one form per row of the table, with :g<n> for a fallback grant", () => {
    expect(dedupeKey.warn("prod", "day", "2026-10-28")).toBe("prod:warn:day:2026-10-28");
    expect(dedupeKey.warn("prod", "month", "2026-10")).toBe("prod:warn:month:2026-10");
    expect(dedupeKey.warn("prod", "fallback_day", "2026-10-28", 1)).toBe("prod:warn:fallback_day:2026-10-28:g1");
    expect(dedupeKey.warn("prod", "fallback_day", "2026-10-28", 2)).toBe("prod:warn:fallback_day:2026-10-28:g2");
    expect(dedupeKey.trip("prod", "day", "2026-10-29")).toBe("prod:trip:day:2026-10-29");
    expect(dedupeKey.trip("prod", "month", "2026-10")).toBe("prod:trip:month:2026-10");
    expect(dedupeKey.fallbackExhausted("prod", "2026-10-28", 1)).toBe(
      "prod:fallback_exhausted:fallback_day:2026-10-28:g1",
    );
    expect(dedupeKey.operatorAction("prod", "reset", 41)).toBe("prod:operator_action:reset:41");
    expect(dedupeKey.credentialsExpiring("prod", "bedrock", T("2026-10-29T18:00:59Z"))).toBe(
      "prod:credentials_expiring:bedrock:2026-10-29T18:00Z",
    );
    expect(dedupeKey.fallbackUnavailable("prod", "bedrock", T("2026-10-29T16:12:44Z"))).toBe(
      "prod:fallback_unavailable:bedrock:2026-10-29T16Z",
    );
    expect(dedupeKey.authFailed("prod", T("2026-10-29T16:00:00Z"))).toBe("prod:auth_failed:admin:2026-10-29T16:00Z");
    expect(dedupeKey.storeUnreachable("prod", T("2026-10-29T16:01:00.750Z"))).toBe(
      "prod:store_unreachable:store:2026-10-29T16:01:00Z",
    );
    expect(dedupeKey.reminder("prod", "2026-10-30")).toBe("prod:reminder:daily:2026-10-30");
  });

  it("starts with the stack, so dev's and dev-cpu's keys never collide with prod's", () => {
    expect(dedupeKey.trip("dev", "day", "2026-10-22")).toBe("dev:trip:day:2026-10-22");
    expect(dedupeKey.trip("dev-cpu", "day", "2026-10-22")).toBe("dev-cpu:trip:day:2026-10-22");
  });
});
