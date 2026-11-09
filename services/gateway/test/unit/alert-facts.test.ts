// The alert facts, version 2 (spec 011, FR-001, FR-025, FR-030; plan §2.2; tasks.md T005): the outbox row's facts
// hold every value the designed forms show, and a strict, total decoder gives back exactly the typed context and spec
// the plain text was rendered from, or nothing. A row written before the change, or facts with a key missing or
// ill-typed, decode to nothing, so its alert goes plain (not_rendered), and the decoder never throws.
import { describe, expect, it } from "vitest";

import { decodeFacts, factsOf } from "../../src/alerts/facts.js";
import { renderAlert, type AlertContext, type AlertSpec } from "../../src/alerts/format.js";
import { CANARIES, allShapes } from "../helpers/alert-cases.js";

type Facts = Record<string, unknown>;
const viaJson = (facts: Facts): Facts => JSON.parse(JSON.stringify(facts)) as Facts;
const name = (c: AlertContext, s: AlertSpec): string => `${s.kind} ${c.dedupeKey}`;

describe("version 2's keys (plan §2.2)", () => {
  it("are on every kind and variant, spec 010's included", () => {
    for (const [c, s] of allShapes()) {
      const facts = factsOf(c, s);
      expect(facts, name(c, s)).toMatchObject({
        facts_version: 2,
        kind: s.kind,
        stack: c.stack,
        env_class: c.envClass,
        prefix: c.prefix,
        test_clock: c.testClock,
        runtime: c.runtime.state,
        fallback: c.fallback.state,
      });
      expect(facts.runtime_since, name(c, s)).toBe(
        "since" in c.runtime ? new Date(c.runtime.since).toISOString() : null,
      );
      expect(facts.fallback_since, name(c, s)).toBe(
        c.fallback.state === "awaiting" ? new Date(c.fallback.since).toISOString() : null,
      );
    }
  });

  it("carry an adapter's label where its alert names one, and an initialization's confirm_zero", () => {
    const byKey = new Map(allShapes().map(([c, s]) => [`${s.kind}|${c.dedupeKey}`, factsOf(c, s)]));
    expect(byKey.get("credentials_expiring|prod:credentials_expiring:bedrock:2026-10-29T18:00Z")).toMatchObject({
      label: "Bedrock",
    });
    expect(byKey.get("fallback_unavailable|prod:fallback_unavailable:anthropic:2026-10-29T16Z")).toMatchObject({
      label: "the Anthropic API",
    });
    // No label: the ID names the adapter (spec 010, FR-037), and the facts say so with null.
    expect(byKey.get("fallback_unavailable|prod:fallback_unavailable:bedrock:2026-10-29T16Z")).toMatchObject({
      label: null,
    });
    for (const key of [
      "warn|prod:warn:adapter_month:anthropic:2026-10",
      "fallback_exhausted|prod:fallback_exhausted:adapter_month:anthropic:2026-10",
    ]) {
      expect(byKey.get(key), key).toMatchObject({ label: "the Anthropic API", adapter: "anthropic" });
    }
    expect(byKey.get("operator_action|prod:operator_action:init:3")).toMatchObject({ confirm_zero: false });
    expect(byKey.get("operator_action|prod:operator_action:init:9")).toMatchObject({ confirm_zero: true });
  });

  it("are what renderAlert stores with the plain text, which stays as it was", () => {
    for (const [c, s] of allShapes()) {
      const rendered = renderAlert(c, s);
      expect(rendered.facts, name(c, s)).toEqual(factsOf(c, s));
      expect(rendered.body.split("\n")[0], name(c, s)).toBe(rendered.subject);
    }
  });
});

describe("the round trip (plan §2.2)", () => {
  it("gives back exactly the context and spec the plain text was rendered from, through JSON as jsonb keeps it", () => {
    for (const [c, s] of allShapes()) {
      expect(decodeFacts(factsOf(c, s), c.dedupeKey), name(c, s)).toEqual({ ctx: c, spec: s });
      expect(decodeFacts(viaJson(factsOf(c, s)), c.dedupeKey), name(c, s)).toEqual({ ctx: c, spec: s });
    }
  });

  it("ignores a key added beside version 2's, so adding one breaks nothing (R-10)", () => {
    const [c, s] = allShapes()[0] as [AlertContext, AlertSpec];
    expect(decodeFacts({ ...factsOf(c, s), added_later: [1, 2] }, c.dedupeKey)).toEqual({ ctx: c, spec: s });
  });
});

describe("what decodes to nothing (FR-030), and never throws", () => {
  const decodes = (facts: unknown, key = "prod:warn:day:2026-10-29"): unknown => {
    let out: unknown;
    expect(() => (out = decodeFacts(facts, key))).not.toThrow();
    return out;
  };

  it("refuses facts of another version, a later one included, which go plain (R-10)", () => {
    const [c, s] = allShapes()[0] as [AlertContext, AlertSpec];
    for (const version of [1, 3, "2", null]) {
      expect(decodes({ ...factsOf(c, s), facts_version: version }, c.dedupeKey), String(version)).toBeUndefined();
    }
  });

  it("refuses a version 1 row's facts, as the code before this change wrote them", () => {
    for (const [c, s] of allShapes()) {
      const v2 = factsOf(c, s);
      const v1: Facts = { ...v2 };
      for (const k of [
        "facts_version",
        "prefix",
        "env_class",
        "runtime_since",
        "fallback_since",
        "label",
        "confirm_zero",
      ])
        delete v1[k];
      expect(decodes(v1, c.dedupeKey), name(c, s)).toBeUndefined();
    }
    expect(decodes({ kind: "warn" })).toBeUndefined();
  });

  it("refuses facts with any key missing but the optional ones", () => {
    const optional = new Set(["meters", "grant_no"]);
    for (const [c, s] of allShapes()) {
      const facts = factsOf(c, s);
      for (const k of Object.keys(facts)) {
        if (optional.has(k)) continue;
        const less: Facts = { ...facts };
        delete less[k];
        expect(decodes(less, c.dedupeKey), `${name(c, s)} without ${k}`).toBeUndefined();
      }
      const m = facts.meters as Facts | undefined;
      if (m === undefined) continue;
      for (const k of Object.keys(m)) {
        if (k === "fallback_warn_micro") continue;
        const fewer: Facts = { ...m };
        delete fewer[k];
        expect(decodes({ ...facts, meters: fewer }, c.dedupeKey), `${name(c, s)} without meters.${k}`).toBeUndefined();
      }
    }
  });

  it("refuses an ill-typed key, an unknown kind or version, and a micro-USD value past a safe integer", () => {
    const [c, s] = allShapes()[0] as [AlertContext, AlertSpec];
    const facts = factsOf(c, s);
    const meters = facts.meters as Facts;
    const bad: Facts[] = [
      { ...facts, facts_version: 1 },
      { ...facts, facts_version: 3 },
      { ...facts, facts_version: "2" },
      { ...facts, kind: "sample" },
      { ...facts, kind: "page" },
      { ...facts, stack: "staging" },
      { ...facts, env_class: "test" },
      { ...facts, prefix: "" },
      { ...facts, prefix: "x".repeat(33) },
      { ...facts, prefix: 7 },
      { ...facts, at: 1_761_753_600_000 },
      { ...facts, at: "yesterday" },
      { ...facts, test_clock: "no" },
      { ...facts, runtime: "maybe" },
      { ...facts, runtime: "degraded", runtime_since: null },
      { ...facts, fallback: "awaiting", fallback_since: null },
      { ...facts, meter: "week" },
      { ...facts, warn_ratio_bp: "7000" },
      { ...facts, warn_ratio_bp: 70.5 },
      { ...facts, meters: { ...meters, day_micro: 2 ** 53 } },
      { ...facts, meters: { ...meters, day_micro: -1 } },
      { ...facts, meters: { ...meters, month_micro: 1.5 } },
      { ...facts, meters: { ...meters, grant_no: "1" } },
      { ...facts, meters: [] },
    ];
    for (const b of bad) expect(decodes(b, c.dedupeKey), JSON.stringify(b)).toBeUndefined();
    for (const notFacts of [null, undefined, "facts", 2, [], [facts], true]) {
      expect(decodes(notFacts), String(notFacts)).toBeUndefined();
    }
  });

  it("refuses a spec's field out of its list or shape, kind by kind", () => {
    const pick = (kind: string, key: string): [AlertContext, Facts] => {
      const found = allShapes().find(([c, s]) => s.kind === kind && c.dedupeKey === key);
      if (found === undefined) throw new Error(`no case ${kind} ${key}`);
      return [found[0], factsOf(found[0], found[1])];
    };
    const cases: [string, string, Facts][] = [
      ["trip", "prod:trip:day:2026-10-29", { ceiling: "week" }],
      ["operator_action", "prod:operator_action:reset:1", { action: "wipe" }],
      ["operator_action", "prod:operator_action:reset:1", { fingerprint: "1a2b3c4d5" }],
      ["operator_action", "prod:operator_action:reset:1", { meters_at_ceiling: ["week"] }],
      ["operator_action", "prod:operator_action:init:3", { sources: ["rumour"] }],
      ["operator_action", "prod:operator_action:init:3", { confirm_zero: "false" }],
      ["operator_action", "prod:operator_action:studio_window:5", { state: "paused" }],
      ["operator_action", "prod:operator_action:studio_window:5", { fallback_calls: -1 }],
      ["credentials_expiring", "prod:credentials_expiring:bedrock:2026-10-29T18:00Z", { adapter: "Bed Rock" }],
      ["credentials_expiring", "prod:credentials_expiring:bedrock:2026-10-29T18:00Z", { label: null }],
      ["fallback_unavailable", "prod:fallback_unavailable:bedrock:2026-10-29T16Z", { reason: "tired" }],
      ["fallback_unavailable", "prod:fallback_unavailable:bedrock:2026-10-29T16Z", { label: 3 }],
      ["auth_failed", "prod:auth_failed:admin:2026-10-29T16:00Z", { last_class: "guess" }],
      ["store_unreachable", "prod:store_unreachable:store:2026-10-29T15:00:00Z", { after_s: "60" }],
      ["reminder", "prod:reminder:daily:2026-10-29", { crossed: ["year:2026"] }],
      ["warn", "prod:warn:adapter_month:anthropic:2026-10", { month: "October" }],
      ["warn", "prod:warn:adapter_month:anthropic:2026-10", { cap_micro: 2 ** 53 }],
    ];
    for (const [kind, key, change] of cases) {
      const [c, facts] = pick(kind, key);
      expect(decodes({ ...facts, ...change }, c.dedupeKey), `${kind} ${JSON.stringify(change)}`).toBeUndefined();
    }
  });
});

describe("what never appears (contracts/alerts.md §5; FR-042)", () => {
  it("holds no canary and no run of nine or more hex digits", () => {
    for (const [c, s] of allShapes()) {
      const all = JSON.stringify(factsOf(c, s));
      for (const canary of CANARIES) expect(all, name(c, s)).not.toContain(canary);
      expect(all, name(c, s)).not.toMatch(/[0-9a-f]{9,}/);
    }
  });
});
