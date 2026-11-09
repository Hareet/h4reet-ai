// The alert catalogue (spec 011, FR-004, FR-034; plan §7.3, D9): one entry for each kind and each variant whose layout
// differs, 19 in FR-004's order, spec 010's included, each with fixed facts: the dates and values of
// contracts/alerts.md §3's examples, and spec 010's from its texts. The golden files render them as prod's real alerts
// (test/fixtures/alerts/), and a sample renders its entry's facts on the stack that sends it, with the stack's own
// prefix and class, the test clock off, the requester's fingerprint, and the sample's key; never the stack's meters,
// state, or store. A kind or variant added later joins the catalogue in the change that adds it. The two paid adapters
// it names come from src/adapters/_samples.ts, since nothing outside src/adapters/ names a provider (SC-006).
import { SAMPLE_ADAPTERS } from "../adapters/_samples.js";
import type { EnvClass, StackName } from "../config/validate.js";
import type { AlertKind } from "../telemetry/metrics.js";
import type { AdapterMonthFacts, AlertContext, AlertSpec, FallbackFacts, MeterFacts, RuntimeFacts } from "./format.js";

export interface EntryFactsOptions {
  stack: StackName;
  envClass: EnvClass;
  /** config/alerts.yaml's prefix for the stack. */
  prefix: string;
  /** The alert's dedupe key: the real alert's, or a sample's. */
  key: string;
  /** The operator's fingerprint, where the entry has one: the requester's, for a sample. */
  fingerprint: string;
}

export interface CatalogueEntry {
  /** Its name in FR-004's order, as the golden folders and the samples' keys have it. */
  name: string;
  kind: AlertKind;
  /** The entry's fixed facts on a stack. */
  facts(o: EntryFactsOptions): { ctx: AlertContext; spec: AlertSpec };
  /** Its real alert's dedupe key on a stack (contracts/alerts.md §2), for the golden files. */
  key(stack: StackName): string;
}

const T = (iso: string): number => Date.parse(iso);

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

const SSO = SAMPLE_ADAPTERS.sso;
const CAPPED = SAMPLE_ADAPTERS.capped;

/**
 * Spec 010's adapter month in October at the Author's cap, $20.00 (his answer at spec 010's T000), so prod's samples
 * name the cap he chose (spec 011's review, decision D-2): $14.40 spent, 72%, past its 70% warning, as $7.20 was of
 * the $10 in spec 010's texts.
 */
const ADAPTER_MONTH: AdapterMonthFacts = {
  adapter: CAPPED.id,
  label: CAPPED.label,
  month: "2026-10",
  spentMicro: 14_400_000n,
  capMicro: 20_000_000n,
};

interface Fixed {
  at: string;
  runtime?: RuntimeFacts;
  fallback?: FallbackFacts;
  meters?: MeterFacts;
}

/** An entry from its fixed context and its spec, which takes the operator's fingerprint where it names one. */
function entry(
  name: string,
  kind: AlertKind,
  key: (stack: StackName) => string,
  fixed: Fixed,
  spec: (fingerprint: string) => AlertSpec,
): CatalogueEntry {
  return {
    name,
    kind,
    key,
    facts: (o) => ({
      ctx: {
        stack: o.stack,
        envClass: o.envClass,
        prefix: o.prefix,
        dedupeKey: o.key,
        at: T(fixed.at),
        testClock: false,
        // Copies, so no caller can change the fixed facts another sample or golden file reads.
        runtime: { ...(fixed.runtime ?? { state: "normal" }) },
        fallback: { ...(fixed.fallback ?? { state: "available" }) },
        ...(fixed.meters === undefined ? {} : { meters: { ...fixed.meters } }),
      },
      spec: spec(o.fingerprint),
    }),
  };
}

const WARN_70 = 7_000n;
const TRIPPED = T("2026-10-29T16:40:03Z");

export const CATALOGUE: readonly CatalogueEntry[] = [
  entry(
    "warn-day",
    "warn",
    (s) => `${s}:warn:day:2026-10-28`,
    { at: "2026-10-28T14:02:11Z", meters: meters(3_500_000, 9_100_000, 400_000) },
    () => ({ kind: "warn", meter: "day", warnRatioBp: WARN_70 }),
  ),
  entry(
    "warn-month",
    "warn",
    (s) => `${s}:warn:month:2026-10`,
    { at: "2026-10-29T10:15:00Z", meters: meters(1_200_000, 14_030_000, 0) },
    () => ({ kind: "warn", meter: "month", warnRatioBp: WARN_70 }),
  ),
  entry(
    "warn-fallback-grant",
    "warn",
    (s) => `${s}:warn:fallback_day:2026-10-28:g1`,
    { at: "2026-10-28T11:40:52Z", meters: meters(2_100_000, 11_200_000, 1_400_000) },
    () => ({ kind: "warn", meter: "fallback_day", grantNo: 1, warnRatioBp: WARN_70 }),
  ),
  entry(
    "warn-adapter-month",
    "warn",
    (s) => `${s}:warn:adapter_month:${CAPPED.id}:2026-10`,
    // The month meter holds the adapter's $14.40, which is part of it, and so is past its own warning too.
    { at: "2026-10-29T16:00:00Z", meters: meters(1_000_000, 14_700_000, 300_000) },
    () => ({ kind: "warn", meter: "adapter_month", warnRatioBp: WARN_70, adapterMonth: ADAPTER_MONTH }),
  ),
  entry(
    "trip",
    "trip",
    (s) => `${s}:trip:day:2026-10-29`,
    {
      at: "2026-10-29T16:40:03Z",
      runtime: { state: "degraded", since: TRIPPED },
      meters: meters(5_000_000, 13_400_000, 2_000_000, 4_000_000, 2),
    },
    () => ({ kind: "trip", ceiling: "day" }),
  ),
  entry(
    "exhausted-grant",
    "fallback_exhausted",
    (s) => `${s}:fallback_exhausted:fallback_day:2026-10-28:g1`,
    {
      at: "2026-10-28T12:05:37Z",
      fallback: { state: "awaiting", since: T("2026-10-28T12:05:37Z") },
      meters: meters(3_600_000, 12_100_000, 2_000_000),
    },
    () => ({ kind: "fallback_exhausted", grantNo: 1 }),
  ),
  entry(
    "exhausted-adapter-month",
    "fallback_exhausted",
    (s) => `${s}:fallback_exhausted:adapter_month:${CAPPED.id}:2026-10`,
    {
      at: "2026-10-29T16:00:00Z",
      fallback: { state: "awaiting", since: T("2026-10-29T16:00:00Z") },
      meters: meters(1_000_000, 9_000_000, 300_000),
    },
    // At his figures the month ceiling stops paid calls first, so prod sends this alert only under a cap below the
    // ceiling (spec 010's note, P-C); the sample shows its design at his cap.
    () => ({ kind: "fallback_exhausted", adapterMonth: { ...ADAPTER_MONTH, spentMicro: ADAPTER_MONTH.capMicro } }),
  ),
  entry(
    "operator-reset",
    "operator_action",
    (s) => `${s}:operator_action:reset:41`,
    { at: "2026-10-29T17:05:12Z", meters: meters(5_000_000, 13_400_000, 2_000_000, 4_000_000, 2) },
    (fingerprint) => ({ kind: "operator_action", action: "reset", fingerprint, metersAtCeiling: ["day"] }),
  ),
  entry(
    "operator-renew",
    "operator_action",
    (s) => `${s}:operator_action:renew:42`,
    { at: "2026-10-28T12:30:00Z", meters: meters(2_000_000, 9_000_000, 2_000_000, 4_000_000, 2) },
    (fingerprint) => ({ kind: "operator_action", action: "renew", fingerprint, grantNo: 2, grantMicro: 2_000_000n }),
  ),
  entry(
    "operator-init",
    "operator_action",
    (s) => `${s}:operator_action:init:1`,
    { at: "2026-10-20T09:12:40Z", meters: meters(0, 0, 0) },
    (fingerprint) => ({
      kind: "operator_action",
      action: "init",
      fingerprint,
      sources: ["journal"],
      confirmZero: false,
      renewed: true,
    }),
  ),
  entry(
    "studio-opened",
    "operator_action",
    (s) => `${s}:operator_action:studio_window:57`,
    { at: "2026-11-02T20:14:03Z", meters: meters(400_000, 6_100_000, 0) },
    (fingerprint) => ({ kind: "operator_action", action: "studio_window", fingerprint, state: "start" }),
  ),
  entry(
    "studio-closed",
    "operator_action",
    (s) => `${s}:operator_action:studio_window:58`,
    { at: "2026-11-02T21:02:40Z", meters: meters(402_700, 6_102_700, 2_700) },
    (fingerprint) => ({
      kind: "operator_action",
      action: "studio_window",
      fingerprint,
      state: "end",
      fallbackMicro: 2_700n,
      fallbackCalls: 1,
    }),
  ),
  entry(
    "credentials-expiring",
    "credentials_expiring",
    (s) => `${s}:credentials_expiring:${SSO.id}:2026-10-29T18:00Z`,
    { at: "2026-10-29T16:00:04Z", meters: meters(300_000, 13_700_000, 300_000) },
    () => ({ kind: "credentials_expiring", adapter: SSO.id, label: SSO.label, endsAt: T("2026-10-29T18:00:00Z") }),
  ),
  entry(
    `unavailable-${SSO.id}`,
    "fallback_unavailable",
    (s) => `${s}:fallback_unavailable:${SSO.id}:2026-10-29T16Z`,
    { at: "2026-10-29T16:12:44Z", meters: meters(300_000, 13_700_000, 300_000) },
    () => ({ kind: "fallback_unavailable", adapter: SSO.id, label: SSO.label, reason: "circuit_open" }),
  ),
  entry(
    `unavailable-${CAPPED.id}`,
    "fallback_unavailable",
    (s) => `${s}:fallback_unavailable:${CAPPED.id}:2026-10-29T16Z`,
    { at: "2026-10-29T16:12:44Z", meters: meters(300_000, 13_700_000, 300_000) },
    () => ({ kind: "fallback_unavailable", adapter: CAPPED.id, label: CAPPED.label, reason: "credentials" }),
  ),
  entry(
    "auth-failed",
    "auth_failed",
    (s) => `${s}:auth_failed:admin:2026-10-29T16:00Z`,
    { at: "2026-10-29T16:02:11Z" },
    () => ({ kind: "auth_failed", count: 3, windowMinutes: 10, lastClass: "wrong_prefix" }),
  ),
  entry(
    "store-unreachable",
    "store_unreachable",
    (s) => `${s}:store_unreachable:store:2026-10-29T16:01:00Z`,
    {
      at: "2026-10-29T16:02:00Z",
      runtime: { state: "unknown", since: T("2026-10-29T16:01:00Z") },
      fallback: { state: "unknown" },
    },
    () => ({ kind: "store_unreachable", since: T("2026-10-29T16:01:00Z"), afterS: 60 }),
  ),
  entry(
    "reminder-degraded",
    "reminder",
    (s) => `${s}:reminder:daily:2026-10-30`,
    { at: "2026-10-30T09:00:00Z", runtime: { state: "degraded", since: TRIPPED }, meters: meters(0, 13_400_000, 0) },
    () => ({ kind: "reminder", degradedSince: TRIPPED, crossed: ["day:2026-10-29"] }),
  ),
  entry(
    "reminder-awaiting",
    "reminder",
    (s) => `${s}:reminder:daily:2026-10-30`,
    {
      at: "2026-10-30T09:00:00Z",
      fallback: { state: "awaiting", since: T("2026-10-29T12:05:37Z") },
      meters: meters(0, 3_000_000, 0),
    },
    () => ({ kind: "reminder", awaitingSince: T("2026-10-29T12:05:37Z"), crossed: [] }),
  ),
];

/** The kinds the catalogue covers, in its order: every real kind (FR-004). */
export const CATALOGUE_KINDS: readonly AlertKind[] = [...new Set(CATALOGUE.map((e) => e.kind))];

/** Every entry, or one kind's; undefined for a kind the catalogue doesn't hold (FR-033: 400 invalid_request). */
export function entriesFor(kind: string | undefined): readonly CatalogueEntry[] | undefined {
  if (kind === undefined) return CATALOGUE;
  if (!(CATALOGUE_KINDS as readonly string[]).includes(kind)) return undefined;
  return CATALOGUE.filter((e) => e.kind === kind);
}

/** A sample's dedupe key (FR-035): `sample` is no real kind, so it never equals a real alert's. */
export const sampleKey = (stack: StackName, entry: string, auditId: number): string =>
  `${stack}:sample:${entry}:${auditId}`;

/**
 * A sample's facts (FR-034; plan D9): its entry's fixed facts on the stack that sends it, with the stack's own prefix
 * and class, the test clock off, the requester's fingerprint, and the sample's key; nothing from the stack's store.
 */
export function sampleFacts(
  entry: CatalogueEntry,
  o: { stack: StackName; envClass: EnvClass; prefix: string; auditId: number; fingerprint: string },
): { ctx: AlertContext; spec: AlertSpec; key: string } {
  const key = sampleKey(o.stack, entry.name, o.auditId);
  const { ctx, spec } = entry.facts({
    stack: o.stack,
    envClass: o.envClass,
    prefix: o.prefix,
    key,
    fingerprint: o.fingerprint,
  });
  return { ctx, spec, key };
}
