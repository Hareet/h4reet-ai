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
import { attemptOffsets, channelsFrom, nextAttemptAt, reminderDue } from "../../src/alerts/dispatcher.js";
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

  it("operator_action, studio_window (spec 003's gpu-window.md §1): opened, then closed with the window's fallback spend", () => {
    const opened = ctx({
      key: "prod:operator_action:studio_window:57",
      at: "2026-11-02T20:14:03Z",
      meters: meters(400_000, 6_100_000, 0),
    });
    expect(
      lines(opened, { kind: "operator_action", action: "studio_window", fingerprint: FP, state: "start" }),
    ).toEqual([
      `[h4reet.ai prod] OPERATOR ACTION: studio GPU window opened by operator #${FP}`,
      "Daily: 0.40 / 5.00 USD (warning 3.50) · Month: 6.10 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 1)",
      "Runtime: normal · Fallback: available · 2026-11-02T20:14:03Z · id prod:operator_action:studio_window:57",
      "The model server stops next: hello falls back within the sub-budget, or degrades, until the window closes.",
      "Runbook: docs/runbooks/studio-gpu-window.md",
    ]);
    const closed = ctx({
      key: "prod:operator_action:studio_window:58",
      at: "2026-11-02T21:02:40Z",
      meters: meters(402_700, 6_102_700, 2_700),
    });
    const end = {
      kind: "operator_action",
      action: "studio_window",
      fingerprint: FP,
      state: "end",
      fallbackMicro: 2_700n,
      fallbackCalls: 1,
    } as const;
    expect(lines(closed, end)).toEqual([
      `[h4reet.ai prod] OPERATOR ACTION: studio GPU window closed by operator #${FP}`,
      "Daily: 0.40 / 5.00 USD (warning 3.50) · Month: 6.10 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 1)",
      "Runtime: normal · Fallback: available · 2026-11-02T21:02:40Z · id prod:operator_action:studio_window:58",
      // Two decimals, truncated toward zero, as every amount in an alert (§3); facts keep the micro-USD.
      "Hello answers from the local model again. The window's fallback spend: $0.00 in 1 call.",
      "Runbook: docs/runbooks/studio-gpu-window.md",
    ]);
    expect(renderAlert(closed, end).facts).toMatchObject({
      action: "studio_window",
      fingerprint: FP,
      state: "end",
      fallback_micro: 2_700,
      fallback_calls: 1,
    });
    expect(lines(closed, { ...end, fallbackMicro: 300_000n, fallbackCalls: 3 })[3]).toBe(
      "Hello answers from the local model again. The window's fallback spend: $0.30 in 3 calls.",
    );
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

/** A capped paid adapter's month at its warning (spec 010): $7.20 of a $10 cap. */
const ADAPTER_MONTH = {
  adapter: "anthropic",
  label: "the Anthropic API",
  month: "2026-10",
  spentMicro: 7_200_000n,
  capMicro: 10_000_000n,
};

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
    // Spec 010 (FR-037): the adapter month's warning and exhaustion, and the Anthropic API's unavailability.
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

describe("§3, amended by spec 010 (FR-037): the adapter month, and the Anthropic API", () => {
  const m = meters(1_000_000, 9_000_000, 300_000);
  it("warns at the adapter month's warning, naming the adapter, its spend, and its cap", () => {
    const c = ctx({ key: "prod:warn:adapter_month:anthropic:2026-10", at: "2026-10-29T16:00:00Z", meters: m });
    const spec: AlertSpec = { kind: "warn", meter: "adapter_month", warnRatioBp: WARN_70, adapterMonth: ADAPTER_MONTH };
    const out = lines(c, spec);
    expect(out[0]).toBe("[h4reet.ai prod] WARNING: the Anthropic API's month at 70% of its cap");
    expect(out).toContain("7.20 of 10.00 USD in 2026-10. The paid fallback stops at its cap; local answers go on.");
    expect(out.at(-1)).toBe("Runbook: docs/runbooks/fallback-renewal.md");
    expect(renderAlert(c, spec).facts).toMatchObject({
      meter: "adapter_month",
      adapter: "anthropic",
      month: "2026-10",
      spent_micro: 7_200_000,
      cap_micro: 10_000_000,
    });
  });

  it("says, at the cap, what stops and what a renewal restores", () => {
    const c = ctx({
      key: "prod:fallback_exhausted:adapter_month:anthropic:2026-10",
      at: "2026-10-29T16:00:00Z",
      fallback: { state: "awaiting", since: T("2026-10-29T16:00:00Z") },
      meters: m,
    });
    const capped = { ...ADAPTER_MONTH, spentMicro: 10_000_000n };
    const out = lines(c, { kind: "fallback_exhausted", adapterMonth: capped });
    expect(out[0]).toBe("[h4reet.ai prod] PAID FALLBACK CAPPED: the Anthropic API's month reached its cap");
    expect(out).toContain(
      "10.00 of 10.00 USD in 2026-10. The Anthropic API is refused until the month rolls over or the cap is raised, " +
        "and the paid fallback awaits a renewal; local answers go on.",
    );
    expect(out.at(-1)).toBe("Runbook: docs/runbooks/fallback-renewal.md");
  });

  it("names the Anthropic API in fallback_unavailable, with its own runbook", () => {
    const c = ctx({ key: "prod:fallback_unavailable:anthropic:2026-10-29T16Z", at: "2026-10-29T16:12:44Z", meters: m });
    const out = lines(c, {
      kind: "fallback_unavailable",
      adapter: "anthropic",
      label: "the Anthropic API",
      reason: "credentials",
    });
    expect(out[0]).toBe("[h4reet.ai prod] FALLBACK UNAVAILABLE: the Anthropic API is unhealthy (credentials)");
    expect(out.at(-1)).toBe("Runbook: docs/runbooks/anthropic-unavailable.md");
  });
});

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
    expect(dedupeKey.operatorAction("prod", "studio_window", 57)).toBe("prod:operator_action:studio_window:57");
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

describe("§4.2: the retry schedule (tasks.md T069)", () => {
  const retry = { scheduleS: [5, 15, 30, 60, 120], giveUpAfterS: 300 };
  const T0 = Date.parse("2026-10-29T16:40:03Z");

  it("puts attempt k at enqueued_at plus the running sums of the waits: 0, 5, 20, 50, 110, and 230 s", () => {
    expect(attemptOffsets(retry.scheduleS)).toEqual([0, 5, 20, 50, 110, 230]);
    const due: number[] = [];
    for (let made = 1; made <= 5; made++) {
      const at = nextAttemptAt(T0, made, T0 + (due.at(-1) ?? 0), retry);
      expect(at, `after ${made}`).toBeDefined();
      due.push(((at as number) - T0) / 1_000);
    }
    expect(due).toEqual([5, 20, 50, 110, 230]);
  });

  it("starts every attempt within 300 s, and gives up after the sixth", () => {
    expect(nextAttemptAt(T0, 6, T0 + 240_000, retry)).toBeUndefined();
    // The last starts at 230 s and runs at most 10 s: inside FR-032's 5 minutes.
    expect(attemptOffsets(retry.scheduleS).every((s) => s + 10 <= retry.giveUpAfterS)).toBe(true);
  });

  it("starts an attempt right after the one before it, when that ran past its due time", () => {
    expect(nextAttemptAt(T0, 1, T0 + 7_000, retry)).toBe(T0 + 7_000);
    expect(nextAttemptAt(T0, 2, T0 + 8_000, retry)).toBe(T0 + 20_000);
  });

  it("gives up when the next attempt would pass give_up_after_s", () => {
    expect(nextAttemptAt(T0, 5, T0 + 301_000, retry)).toBeUndefined();
    expect(nextAttemptAt(T0, 1, T0, { scheduleS: [400], giveUpAfterS: 300 })).toBeUndefined();
  });
});

describe("§2: the 09:00 UTC reminder (tasks.md T069)", () => {
  const at = { hour: 9, minute: 0 };
  const tripped = Date.parse("2026-10-29T16:40:03Z");
  const base = {
    state: "degraded" as const,
    since: tripped,
    crossed: ["day:2026-10-29"],
    awaiting: false,
    awaitingSince: null,
  };

  it("is due at or after 09:00 on the gateway clock, the morning after the trip, as §3's example shows", () => {
    expect(reminderDue({ ...base, nowMs: Date.parse("2026-10-30T08:59:59Z"), at })).toBeUndefined();
    expect(reminderDue({ ...base, nowMs: Date.parse("2026-10-30T09:00:00Z"), at })).toEqual({
      day: "2026-10-30",
      spec: { kind: "reminder", crossed: ["day:2026-10-29"], degradedSince: tripped },
    });
    expect(reminderDue({ ...base, nowMs: Date.parse("2026-10-30T15:00:00Z"), at })?.day).toBe("2026-10-30");
  });

  it("isn't due on the day of a trip after 09:00, but is for one before", () => {
    expect(reminderDue({ ...base, nowMs: Date.parse("2026-10-29T16:40:13Z"), at })).toBeUndefined();
    const early = Date.parse("2026-10-29T08:10:00Z");
    expect(reminderDue({ ...base, since: early, nowMs: Date.parse("2026-10-29T09:00:05Z"), at })?.day).toBe(
      "2026-10-29",
    );
  });

  it("covers renewal too, and nothing while the stack is normal and nothing is pending", () => {
    const awaiting = Date.parse("2026-10-29T12:05:37Z");
    expect(
      reminderDue({
        ...base,
        state: "normal",
        crossed: [],
        awaiting: true,
        awaitingSince: awaiting,
        nowMs: Date.parse("2026-10-30T09:00:00Z"),
        at,
      }),
    ).toEqual({ day: "2026-10-30", spec: { kind: "reminder", crossed: [], awaitingSince: awaiting } });
    expect(
      reminderDue({ ...base, state: "normal", crossed: [], nowMs: Date.parse("2026-10-30T09:00:00Z"), at }),
    ).toBeUndefined();
  });

  it("follows the configured time", () => {
    expect(
      reminderDue({ ...base, nowMs: Date.parse("2026-10-30T09:00:00Z"), at: { hour: 9, minute: 30 } }),
    ).toBeUndefined();
    expect(reminderDue({ ...base, nowMs: Date.parse("2026-10-30T09:30:00Z"), at: { hour: 9, minute: 30 } })?.day).toBe(
      "2026-10-30",
    );
  });
});

describe("§4.3: the receivers, by ALERT_DELIVERY (tasks.md T077)", () => {
  const alerts = {
    channels: { order: ["telegram", "email"] as const, telegram: { timeoutMs: 5_000 }, email: { timeoutMs: 10_000 } },
    standin: { telegramBase: "http://telegram-standin:8080", smtpHost: "mailpit", smtpPort: 1025 },
  } as unknown as Parameters<typeof channelsFrom>[1];

  it("sends the stand-ins a fixed dummy token and chat 0, never the real bot token, and no SMTP AUTH", () => {
    const ch = channelsFrom(
      { ALERT_DELIVERY: "standin", TELEGRAM_BOT_TOKEN: "must-not-be-used", SMTP_PASSWORD: "nor-this" },
      alerts,
    );
    expect(ch).toEqual({
      mode: "standin",
      telegram: { base: "http://telegram-standin:8080", token: "standin", chatId: "0", timeoutMs: 5_000 },
      email: {
        host: "mailpit",
        port: 1025,
        secure: false,
        requireTLS: false,
        ignoreTLS: true,
        from: "alerts@h4reet.local",
        to: "operator@h4reet.local",
        timeoutMs: 10_000,
      },
    });
  });

  it("uses the env file's channel keys in real mode, with TLS as SMTP_TLS says", () => {
    const real = (tls: string, port: string) =>
      channelsFrom(
        {
          ALERT_DELIVERY: "real",
          TELEGRAM_API_BASE: "https://api.telegram.org",
          TELEGRAM_BOT_TOKEN: "token-made-for-this-test",
          TELEGRAM_CHAT_ID: "12345",
          SMTP_HOST: "smtp.example.org",
          SMTP_PORT: port,
          SMTP_TLS: tls,
          SMTP_USER: "alerts",
          SMTP_PASSWORD: "password-made-for-this-test",
          ALERT_EMAIL_FROM: "alerts@example.org",
          ALERT_EMAIL_TO: "operator@example.org",
        },
        alerts,
      );
    expect(real("implicit", "465").email).toMatchObject({
      port: 465,
      secure: true,
      requireTLS: false,
      ignoreTLS: false,
    });
    expect(real("starttls", "587").email).toMatchObject({
      port: 587,
      secure: false,
      requireTLS: true,
      ignoreTLS: false,
    });
    expect(real("implicit", "465").telegram).toEqual({
      base: "https://api.telegram.org",
      token: "token-made-for-this-test",
      chatId: "12345",
      timeoutMs: 5_000,
    });
  });
});
