// The catalogue and the samples' keys (spec 011, FR-004, FR-034 to FR-036; plan §7.3, D9; tasks.md T033): 19 entries
// in FR-004's order, every kind covered; each sample keyed <stack>:sample:<entry>:<audit id>; `sample` no real kind, and
// the real kinds one list wherever they are named; a sample marked in every form; and its facts from the catalogue
// alone, never the stack's store.
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { CATALOGUE, CATALOGUE_KINDS, entriesFor, sampleFacts, sampleKey } from "../../src/alerts/catalogue.js";
import { Dispatcher } from "../../src/alerts/dispatcher.js";
import { designEmail } from "../../src/alerts/email-design.js";
import { renderAlert } from "../../src/alerts/format.js";
import { REAL_KINDS } from "../../src/alerts/outbox.js";
import { designTelegram } from "../../src/alerts/telegram-design.js";
import { ALERT_KINDS } from "../../src/telemetry/metrics.js";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const FP = "1a2b3c4d";

describe("the catalogue (FR-004)", () => {
  it("holds 19 entries in FR-004's order, and covers every real kind", () => {
    expect(CATALOGUE.map((e) => e.name)).toEqual([
      "warn-day",
      "warn-month",
      "warn-fallback-grant",
      "warn-adapter-month",
      "trip",
      "exhausted-grant",
      "exhausted-adapter-month",
      "operator-reset",
      "operator-renew",
      "operator-init",
      "studio-opened",
      "studio-closed",
      "credentials-expiring",
      "unavailable-bedrock",
      "unavailable-anthropic",
      "auth-failed",
      "store-unreachable",
      "reminder-degraded",
      "reminder-awaiting",
    ]);
    expect([...CATALOGUE_KINDS].sort()).toEqual([...REAL_KINDS].sort());
  });

  it("narrows to one kind's entries, and knows no other kind", () => {
    expect(entriesFor(undefined)?.map((e) => e.name)).toHaveLength(19);
    expect(entriesFor("trip")?.map((e) => e.name)).toEqual(["trip"]);
    expect(entriesFor("warn")?.map((e) => e.name)).toEqual([
      "warn-day",
      "warn-month",
      "warn-fallback-grant",
      "warn-adapter-month",
    ]);
    for (const unknown of ["sample", "page", "", "Trip", "warn "]) expect(entriesFor(unknown), unknown).toBeUndefined();
  });
});

describe("the samples' keys (FR-035)", () => {
  it("are <stack>:sample:<entry>:<audit id>", () => {
    expect(sampleKey("dev-cpu", "warn-day", 57)).toBe("dev-cpu:sample:warn-day:57");
    expect(sampleKey("prod", "trip", 3)).toBe("prod:sample:trip:3");
    for (const entry of CATALOGUE) {
      const { ctx, key } = sampleFacts(entry, {
        stack: "prod",
        envClass: "prod",
        prefix: "[p]",
        auditId: 9,
        fingerprint: FP,
      });
      expect(key, entry.name).toBe(`prod:sample:${entry.name}:9`);
      expect(ctx.dedupeKey, entry.name).toBe(key);
    }
  });

  it("can never equal a real alert's: sample is no real kind, and the real kinds are one list everywhere", () => {
    expect(REAL_KINDS).not.toContain("sample");
    // The outbox's CHECK list, with store_unreachable, which is never stored (0001_state.sql).
    const check = /kind\s+text\s+NOT NULL CHECK \(kind IN \(([^)]*)\)\)/.exec(read("../../migrations/0001_state.sql"));
    const stored = [...(check?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...stored, "store_unreachable"].sort()).toEqual([...REAL_KINDS].sort());
    // h4.alert.kind's values, but sample.
    expect(ALERT_KINDS.filter((k) => k !== "sample").sort()).toEqual([...REAL_KINDS].sort());
    expect(ALERT_KINDS).toContain("sample");
    // contracts/alerts.md §2's table, its first column's kinds.
    const contract = read("../../../../specs/000-local-foundations/contracts/alerts.md");
    const section = contract.slice(contract.indexOf("## 2. Kinds"), contract.indexOf("## 3. Message format"));
    const kinds = new Set([...section.matchAll(/^\| `([a-z_]+)`/gm)].map((m) => m[1]));
    expect([...kinds].sort()).toEqual([...REAL_KINDS].sort());
    for (const entry of CATALOGUE) expect(entry.key("prod").split(":")[1], entry.name).not.toBe("sample");
  });
});

describe("a sample's marks and facts (FR-034, FR-036)", () => {
  it("says it is a sample in every form, naming the requester, nothing having happened", () => {
    for (const entry of CATALOGUE) {
      const { ctx, spec } = sampleFacts(entry, {
        stack: "prod",
        envClass: "prod",
        prefix: "[h4reet.ai prod]",
        auditId: 9,
        fingerprint: FP,
      });
      const sample = { fingerprint: FP };
      const sentence = `A sample, sent by operator #${FP}: nothing happened on prod.`;
      const plain = renderAlert(ctx, spec, sample);
      expect(plain.subject.startsWith("[SAMPLE] [h4reet.ai prod] "), entry.name).toBe(true);
      expect(plain.body.split("\n").at(-1), entry.name).toBe(sentence);
      const telegram = designTelegram(ctx, spec, sample);
      expect(telegram.text.split("\n")[0], entry.name).toBe(`🧪 SAMPLE · ${sentence}`);
      const email = designEmail(ctx, spec, sample);
      expect(email.subject.startsWith("🧪 "), entry.name).toBe(true);
      expect(email.subject, entry.name).toContain(" [SAMPLE] [h4reet.ai prod] ");
      expect(email.html, entry.name).toContain(`🧪 <strong>SAMPLE</strong> · ${sentence}`);
    }
  });

  it("renders from the catalogue alone: the stack's prefix and class, the test clock off, the requester's fingerprint", () => {
    const reset = CATALOGUE.find((e) => e.name === "operator-reset");
    if (reset === undefined) throw new Error("no reset entry");
    const { ctx, spec } = sampleFacts(reset, {
      stack: "dev-cpu",
      envClass: "dev",
      prefix: "[dev-cpu]",
      auditId: 4,
      fingerprint: "0f0e0d0c",
    });
    expect(ctx).toMatchObject({ stack: "dev-cpu", envClass: "dev", prefix: "[dev-cpu]", testClock: false });
    expect(spec).toMatchObject({ kind: "operator_action", action: "reset", fingerprint: "0f0e0d0c" });
  });

  it("reads nothing from the store when the dispatcher takes samples into its memory", () => {
    const store = new Proxy(
      {},
      {
        get: (_t, name) =>
          name === "status"
            ? "ready"
            : vi.fn(() => {
                throw new Error(`the store was read: ${String(name)}`);
              }),
      },
    );
    const d = new Dispatcher({
      stack: "dev-cpu",
      envClass: "dev",
      store: store as never,
      alerts: {
        prefixes: { prod: "[h4reet.ai prod]", dev: "[dev]", "dev-cpu": "[dev-cpu]" },
        retry: { scheduleS: [5], giveUpAfterS: 300 },
      } as never,
      budgets: {} as never,
      channels: { mode: "standin" } as never,
      hasFallback: true,
      clock: {} as never,
      metrics: {} as never,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      realNow: () => Date.parse("2026-11-08T12:00:00Z"),
    });
    const queued = d.queueSamples(CATALOGUE, 12, FP);
    expect(queued.map((q) => q.key)).toEqual(CATALOGUE.map((e) => `dev-cpu:sample:${e.name}:12`));
    expect(d.samplesPending()).toBe(true);
  });
});
