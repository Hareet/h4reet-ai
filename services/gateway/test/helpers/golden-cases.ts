// The cases spec 011's golden files pin (its plan §3.4; FR-004, FR-005, FR-024): the 19 catalogue entries in FR-004's
// order, rendered as prod's real alerts with their real dedupe keys, and the further cases the entries leave out.
// Every form of every case is rendered from these alone, and the canary, escaping, bound, and cross-form tests read
// them too.
import { CATALOGUE } from "../../src/alerts/catalogue.js";
import type { AlertContext, AlertSpec } from "../../src/alerts/format.js";
import type { SampleMark } from "../../src/alerts/forms.js";
import { FP, T, ctx, meters } from "./alert-cases.js";

export interface GoldenCase {
  /** The folder under test/fixtures/alerts/. */
  name: string;
  ctx: AlertContext;
  spec: AlertSpec;
  sample?: SampleMark;
}

const PROD = { stack: "prod", envClass: "prod", prefix: "[h4reet.ai prod]" } as const;

/** Each entry as prod's real alert: its real key, the fixed fingerprint, and no sample's marks. */
export function entryCases(): GoldenCase[] {
  return CATALOGUE.map((entry, i) => {
    const { ctx: c, spec } = entry.facts({ ...PROD, key: entry.key("prod"), fingerprint: FP });
    return { name: `${String(i + 1).padStart(2, "0")}-${entry.name}`, ctx: c, spec };
  });
}

/** A 32-unit prefix holding an emoji, rule A5's longest; a 32-character adapter ID, routing.yaml's (B2). */
export const LONGEST_PREFIX = `[h4reet.ai 🧪 ${"x".repeat(17)}]`;
export const LONGEST_ADAPTER = `adapter-${"x".repeat(24)}`;
/** The longest label in the code, the Anthropic API's (src/adapters/_settings.ts). */
export const LONGEST_LABEL = "the Anthropic API";

/** An entry at its longest facts (FR-024): dev's marks, the test clock, the longest prefix, ID, and label. */
export function longest(i: number): GoldenCase {
  const entry = CATALOGUE[i];
  if (entry === undefined) throw new Error(`no catalogue entry ${i}`);
  const key = `dev:sample:${entry.name}:12345678`;
  const built = entry.facts({ stack: "dev", envClass: "dev", prefix: LONGEST_PREFIX, key, fingerprint: FP });
  const c: AlertContext = { ...built.ctx, testClock: true };
  let spec: AlertSpec = built.spec;
  if ("adapterMonth" in spec) {
    spec = { ...spec, adapterMonth: { ...spec.adapterMonth, adapter: LONGEST_ADAPTER, label: LONGEST_LABEL } };
  } else if (spec.kind === "credentials_expiring" || spec.kind === "fallback_unavailable") {
    spec = { ...spec, adapter: LONGEST_ADAPTER, label: LONGEST_LABEL };
  } else if (spec.kind === "reminder") {
    spec = {
      kind: "reminder",
      degradedSince: T("2026-10-29T16:40:03Z"),
      awaitingSince: T("2026-10-29T12:05:37Z"),
      crossed: ["day:2026-10-29", "month:2026-10"],
    };
    c.runtime = { state: "degraded", since: T("2026-10-29T16:40:03Z") };
    c.fallback = { state: "awaiting", since: T("2026-10-29T12:05:37Z") };
  }
  return { name: `longest-${entry.name}`, ctx: c, spec, sample: { fingerprint: FP } };
}

/** Every entry at its longest facts. */
export const longestCases = (): GoldenCase[] => CATALOGUE.map((_, i) => longest(i));

/** The further cases of plan §3.4 that are no sample: those whose forms the earlier phases pin. */
export function furtherCases(): GoldenCase[] {
  const degraded = T("2026-10-29T16:40:03Z");
  return [
    {
      name: "case-trip-month",
      ctx: ctx({
        key: "prod:trip:month:2026-10",
        at: "2026-10-29T16:40:03Z",
        runtime: { state: "degraded", since: degraded },
        meters: meters(1_200_000, 20_000_000, 400_000),
      }),
      spec: { kind: "trip", ceiling: "month" },
    },
    {
      name: "case-unavailable-credentials",
      ctx: ctx({
        key: "prod:fallback_unavailable:bedrock:2026-10-29T16Z",
        at: "2026-10-29T16:12:44Z",
        meters: meters(300_000, 13_700_000, 300_000),
      }),
      spec: { kind: "fallback_unavailable", adapter: "bedrock", label: "Bedrock", reason: "credentials" },
    },
    {
      name: "case-reminder-both",
      ctx: ctx({
        key: "prod:reminder:daily:2026-10-30",
        at: "2026-10-30T09:00:00Z",
        runtime: { state: "degraded", since: degraded },
        fallback: { state: "awaiting", since: T("2026-10-29T12:05:37Z") },
        meters: meters(0, 13_400_000, 0),
      }),
      spec: {
        kind: "reminder",
        degradedSince: degraded,
        awaitingSince: T("2026-10-29T12:05:37Z"),
        crossed: ["day:2026-10-29", "month:2026-10"],
      },
    },
    {
      name: "case-reset-none-at-ceiling",
      ctx: ctx({
        key: "prod:operator_action:reset:43",
        at: "2026-10-30T08:15:00Z",
        meters: meters(1_100_000, 13_400_000, 0),
      }),
      spec: { kind: "operator_action", action: "reset", fingerprint: FP, metersAtCeiling: [] },
    },
    {
      name: "case-dev-test-clock",
      ctx: ctx({
        stack: "dev",
        key: "dev:warn:day:2026-10-27",
        at: "2026-10-27T08:01:30Z",
        testClock: true,
        meters: meters(3_500_000, 3_500_000, 0),
      }),
      spec: { kind: "warn", meter: "day", warnRatioBp: 7_000n },
    },
  ];
}

/** The longest of the entries at their longest facts, by its Telegram text: the golden case-longest. */
export function caseLongest(telegramLength: (c: GoldenCase) => number): GoldenCase {
  const all = longestCases();
  const top = all.reduce((a, b) => (telegramLength(b) > telegramLength(a) ? b : a));
  return { ...top, name: "case-longest" };
}
