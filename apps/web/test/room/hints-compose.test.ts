// T018 (spec 012; FR-032 to FR-035; contracts/hints.md §1 to §4): the loader's hints as room data. The compositor reads
// apps/web/room/hints.yaml beside the room's other data files, holds its shape (RD), runs RT2, RT3, and RT9 over it,
// and RT14 to RT17, each rule in its modes: RT2, RT3, RT15, and RT16 refuse in both; RT9 and RT14 run in strict mode
// alone, so a lenient build of a tree with no specs/ passes; RT17 warns in lenient mode, the hint left out, and refuses
// in strict. Its slots are filled from config/budgets.yaml, config/routing.yaml, and config/prices.yaml through the
// tree (the last version's entry for prod's fallback model), and from the UI words; a hint with `when:
// free_talk_ready` is built in only while the build reads free talk as ready. The index carries the filled hints in
// the file's order. The fixtures are test/fixtures/room/hints/, rooted like the repository, over the known-good set.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { parse, stringify } from "yaml";
import { describe, expect, it } from "vitest";

import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeOptions, Finding } from "../../build/room/compose";
import { RULES } from "../../build/room/checks/family";
import { BUDGETS_FILE, PRICES_FILE, ROUTING_FILE, formatAmount } from "../../build/room/hints";
import { HINTS_FILE } from "../../build/room/load";
import { noPolicy } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import { FIXTURES_DIR, overlay } from "../helpers/room-fixtures";

const HINTS_DIR = join(FIXTURES_DIR, "hints");

/** The hints fixtures by repository path. */
function hintFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, rel);
      else out[rel] = readFileSync(full, "utf8");
    }
  };
  walk(HINTS_DIR, "");
  return out;
}

type HintsDoc = { version: number; hints: Record<string, unknown>[] };
const fixtureHints = (): HintsDoc => parse(hintFiles()[HINTS_FILE] ?? "") as HintsDoc;

const NOT_READY = { topics: new Map<string, boolean>(), freeTalk: false };
const READY = { topics: new Map<string, boolean>(), freeTalk: true };

/** The known-good set with the hints fixtures, a hints file of its own where given, and further changes. */
function composed(
  o: {
    hints?: HintsDoc | string | null;
    changes?: Record<string, string | null>;
    mode?: ComposeOptions["mode"];
    readiness?: ComposeOptions["readiness"];
    policy?: RoomPolicy;
  } = {},
) {
  const files: Record<string, string | null> = { ...hintFiles(), ...o.changes };
  if (o.hints !== undefined)
    files[HINTS_FILE] = o.hints === null ? null : typeof o.hints === "string" ? o.hints : stringify(o.hints);
  return compose(overlay(files), o.policy ?? noPolicy(), {
    mode: o.mode ?? "strict",
    drafts: false,
    readiness: o.readiness ?? NOT_READY,
  });
}

/** The fixture's hints with one hint's keys changed (null deletes a key), or a hint added. */
function edited(i: number, keys: Record<string, unknown>): HintsDoc {
  const doc = fixtureHints();
  const hint = { ...(doc.hints[i] ?? {}) };
  for (const [k, v] of Object.entries(keys)) {
    if (v === null) delete hint[k];
    else hint[k] = v;
  }
  doc.hints[i] = hint;
  return doc;
}

const of = (findings: readonly Finding[], rule: string): Finding[] => findings.filter((f) => f.rule === rule);
const lines = (findings: readonly Finding[]): string => findings.map((f) => formatFinding(f)).join("\n");

describe("the hints file's shape (RD; contracts/hints.md §1)", () => {
  it("composes the fixture's hints with no finding, in strict and lenient mode", () => {
    for (const mode of ["strict", "lenient"] as const) {
      const r = composed({ mode });
      expect(r.findings, `${mode}:\n${lines(r.findings)}`).toEqual([]);
    }
  });

  it.each([
    ["an unknown key", edited(1, { colour: "red" }), "RD2", "hints[1].colour"],
    ["a bad by", edited(1, { by: "visitor" }), "RD3", "hints[1].by"],
    ["a when other than free_talk_ready", edited(4, { when: "always" }), "RD3", "hints[4].when"],
    [
      "words_from on a session hint",
      edited(1, { words_from: [{ file: "intent/900-fx-room.md", quote: "x" }] }),
      "RD2",
      "hints[1].words_from",
    ],
    ["sources on an Author's hint", edited(0, { sources: ["intent/900-fx-room.md"] }), "RD2", "hints[0].sources"],
    ["an id outside the grammar", edited(1, { id: "Fx_Listed" }), "RD3", "hints[1].id"],
  ] as const)("refuses %s", (_, doc, rule, path) => {
    const r = composed({ hints: doc });
    expect(
      r.findings.some((f) => f.rule === rule && f.file === HINTS_FILE && f.path === path),
      lines(r.findings),
    ).toBe(true);
    expect(r.index.hints).toEqual([]);
  });

  it("refuses a duplicate id", () => {
    const doc = fixtureHints();
    doc.hints[2] = { ...doc.hints[2], id: doc.hints[1]?.id };
    const r = composed({ hints: doc });
    expect(
      of(r.findings, "RD3").some((f) => f.file === HINTS_FILE),
      lines(r.findings),
    ).toBe(true);
  });

  it("refuses a list outside 1 to 20 hints", () => {
    const none = composed({ hints: { version: 1, hints: [] } });
    expect(
      of(none.findings, "RD3").some((f) => f.path === "hints"),
      lines(none.findings),
    ).toBe(true);
    const many = fixtureHints();
    const one = many.hints[1] as Record<string, unknown>;
    many.hints = Array.from({ length: 21 }, (_, i) => ({ ...structuredClone(one), id: `fx-hint-${i}` }));
    const over = composed({ hints: many });
    expect(
      of(over.findings, "RD3").some((f) => f.path === "hints"),
      lines(over.findings),
    ).toBe(true);
  });
});

describe("RT2 and RT3 over the hints, in both modes", () => {
  it("refuses a hint holding a forbidden phrase (RT2)", () => {
    const policy = { ...noPolicy(), full_name: "Fixture Quillfeather" };
    for (const mode of ["strict", "lenient"] as const) {
      const r = composed({ mode, policy, hints: edited(1, { text: "Ask Quillfeather about the desk." }) });
      const hit = of(r.findings, "RT2").find((f) => f.file === HINTS_FILE);
      expect(hit, `${mode}:\n${lines(r.findings)}`).toBeDefined();
      expect(hit?.lenient).toBe(false);
    }
  });

  it("refuses a digit outside a slot (RT3)", () => {
    for (const mode of ["strict", "lenient"] as const) {
      const r = composed({ mode, hints: edited(1, { text: "Spend stops at 5 dollars a day." }) });
      const hit = of(r.findings, "RT3").find((f) => f.file === HINTS_FILE && f.path === "hints[1].text");
      expect(hit, `${mode}:\n${lines(r.findings)}`).toBeDefined();
      expect(r.findings.every((f) => !f.reason.includes("5 dollars"))).toBe(true);
    }
  });
});

describe("RT9 and RT14, in strict mode alone", () => {
  it("refuses an Author's quote its intent doesn't hold (RT9) in strict mode, and runs nothing in lenient", () => {
    const doc = edited(0, {
      text: "the fixture room holds a lamp",
      words_from: [{ file: "intent/900-fx-room.md", quote: "the fixture room holds a lamp" }],
    });
    const strict = composed({ hints: doc });
    expect(
      of(strict.findings, "RT9").some((f) => f.path === "hints[0].words_from[0].quote"),
      lines(strict.findings),
    ).toBe(true);
    const lenient = composed({ hints: doc, mode: "lenient" });
    expect(of(lenient.findings, "RT9")).toEqual([]);
  });

  it("refuses a session hint with no source, or a source the tree doesn't hold (RT14), in strict mode alone", () => {
    const none = composed({ hints: edited(1, { sources: null }) });
    expect(
      of(none.findings, "RT14").map((f) => f.path),
      lines(none.findings),
    ).toEqual(["hints[1]"]);
    const empty = composed({ hints: edited(1, { sources: [] }) });
    expect(of(empty.findings, "RT14").map((f) => f.path)).toEqual(["hints[1]"]);
    const missing = composed({ hints: edited(1, { sources: ["apps/web/room/ui-words.yaml", "docs/fx-nowhere.md"] }) });
    expect(of(missing.findings, "RT14").map((f) => f.path)).toEqual(["hints[1].sources[1]"]);
    for (const doc of [edited(1, { sources: null }), edited(1, { sources: ["docs/fx-nowhere.md"] })]) {
      const lenient = composed({ hints: doc, mode: "lenient" });
      expect(of(lenient.findings, "RT14")).toEqual([]);
    }
  });

  it("passes a lenient build of a tree with no specs/, whose hints cite files under it", () => {
    const doc = fixtureHints();
    doc.hints[0] = {
      ...doc.hints[0],
      words_from: [{ file: "specs/900-fx-room/intent.md", quote: "the fixture room holds a desk" }],
    };
    doc.hints[1] = { ...doc.hints[1], sources: ["specs/900-fx-room/spec.md"] };
    const r = composed({ hints: doc, mode: "lenient", changes: { specs: null } });
    expect(r.findings, lines(r.findings)).toEqual([]);
    expect(r.index.hints[0]).toBe("the fixture room holds a desk");
  });
});

describe("RT15: an Author's hint is his quote exactly, in both modes", () => {
  it.each([
    ["one character", "the fixture room holds a desk."],
    ["one space", "the fixture room holds  a desk"],
    ["a capital", "The fixture room holds a desk"],
  ])("refuses a text that differs from its quote by %s", (_, text) => {
    for (const mode of ["strict", "lenient"] as const) {
      const r = composed({ mode, hints: edited(0, { text }) });
      expect(
        of(r.findings, "RT15").some((f) => f.path === "hints[0].text"),
        `${mode}:\n${lines(r.findings)}`,
      ).toBe(true);
    }
  });

  it("refuses an Author's hint without exactly one words_from", () => {
    for (const words of [null, []]) {
      const r = composed({ hints: edited(0, { words_from: words }) });
      expect(
        of(r.findings, "RT15").some((f) => f.path.startsWith("hints[0]")),
        lines(r.findings),
      ).toBe(true);
    }
    const two = composed({
      hints: edited(0, {
        words_from: [
          { file: "intent/900-fx-room.md", quote: "the fixture room holds a desk" },
          { file: "intent/900-fx-room.md", quote: "the fixture room holds a desk" },
        ],
      }),
    });
    expect(
      of(two.findings, "RT15").some((f) => f.path.startsWith("hints[0]")),
      lines(two.findings),
    ).toBe(true);
  });
});

describe("RT16: a hint's length once filled, in both modes", () => {
  it("refuses a hint over 160 characters once its slots are filled", () => {
    // 17 words of nine letters: 169 characters, within the file's 200 as written and its 25 words.
    const long = Array.from({ length: 17 }, () => "wordwords").join(" ");
    expect(long.length).toBe(169);
    for (const mode of ["strict", "lenient"] as const) {
      const r = composed({ mode, hints: edited(1, { text: long }) });
      expect(
        of(r.findings, "RT16").some((f) => f.path === "hints[1].text"),
        `${mode}:\n${lines(r.findings)}`,
      ).toBe(true);
    }
    // Filled, a slot's figure counts, not its name: 150 characters as written, 160 or fewer once filled.
    const filled = composed({ hints: edited(2, { text: `${"{budget.monthly_usd} ".repeat(7)}`.trim() }) });
    expect(of(filled.findings, "RT16")).toEqual([]);
  });

  it("refuses a hint over 25 words", () => {
    const text = Array.from({ length: 26 }, () => "word").join(" ");
    for (const mode of ["strict", "lenient"] as const) {
      const r = composed({ mode, hints: edited(1, { text }) });
      expect(
        of(r.findings, "RT16").some((f) => f.path === "hints[1].text"),
        `${mode}:\n${lines(r.findings)}`,
      ).toBe(true);
    }
    const ok = composed({ hints: edited(1, { text: Array.from({ length: 25 }, () => "word").join(" ") }) });
    expect(of(ok.findings, "RT16")).toEqual([]);
  });
});

describe("RT17: a slot the build can't fill warns in lenient mode, the hint left out, and refuses in strict", () => {
  it.each([
    ["an unknown slot", edited(1, { text: "See the {fx.nothing} list." }), {}],
    ["a {ui:…} key off the closed list", edited(1, { text: "See the {ui:fx.nothing} list." }), {}],
    ["a {ui:…} key whose word holds a slot", edited(1, { text: "It reads {ui:sign.local}." }), {}],
    ["a missing configuration file", fixtureHints(), { [BUDGETS_FILE]: null }],
    ["a missing configuration key", fixtureHints(), { [ROUTING_FILE]: "schema: 1\nadapters: {}\nenvs: {}\n" }],
  ] as const)("%s", (_, doc, changes) => {
    const strict = composed({ hints: doc, changes });
    const refused = of(strict.findings, "RT17");
    expect(refused.length, lines(strict.findings)).toBeGreaterThan(0);
    expect(refused.every((f) => f.file === HINTS_FILE && f.lenient)).toBe(true);
    const lenient = composed({ hints: doc, changes, mode: "lenient" });
    const warned = of(lenient.findings, "RT17");
    expect(warned.length).toBeGreaterThan(0);
    expect(warned.map((f) => formatFinding(f, "lenient")).every((l) => l.startsWith("warn RT17 "))).toBe(true);
    expect(
      lenient.findings.filter((f) => !f.lenient),
      lines(lenient.findings),
    ).toEqual([]);
    // Each hint whose slot couldn't be filled is left out; the others show.
    const out = new Set(warned.map((f) => Number(/^hints\[(\d+)\]/.exec(f.path)?.[1])));
    expect(lenient.index.hints.length).toBe(4 - out.size);
    for (const reason of warned.map((f) => f.reason)) expect(reason).not.toMatch(/fixture|Spend|costs/);
  });
});

describe("the rule catalogue (PD-13)", () => {
  it("registers RT14 to RT17 with their modes", () => {
    expect(RULES.RT14).toMatchObject({ family: "RT", lenient: false, strict: "whole", refuses: true });
    expect(RULES.RT15).toMatchObject({ family: "RT", lenient: false, strict: null, refuses: true });
    expect(RULES.RT16).toMatchObject({ family: "RT", lenient: false, strict: null, refuses: true });
    expect(RULES.RT17).toMatchObject({ family: "RT", lenient: true, strict: null, refuses: true });
  });
});

describe("when: free_talk_ready (FR-032, FR-035; PD-25)", () => {
  it("builds the hint in while the build reads free talk as ready, and leaves it out otherwise, with no report", () => {
    const ready = composed({ readiness: READY });
    expect(ready.index.hints).toContain("Ask the fixture twin anything.");
    const not = composed({ readiness: NOT_READY });
    expect(not.index.hints).not.toContain("Ask the fixture twin anything.");
    expect(not.findings).toEqual([]);
    const none = compose(overlay(hintFiles()), noPolicy(), { mode: "strict", drafts: false });
    expect(none.index.hints).not.toContain("Ask the fixture twin anything.");
  });
});

describe("the slots, filled (contracts/hints.md §2)", () => {
  it("fills prod's ceilings, its fallback sub-budget, and the last version's prices for prod's fallback model", () => {
    const r = composed();
    expect(r.index.hints).toEqual([
      "the fixture room holds a desk",
      'Every piece is also in the "In the fixture room" list.',
      "Spend stops at $5 a day and $20 a month, the fallback inside $2.",
      "The fallback costs $0.10 in and $0.50 out per million tokens.",
    ]);
  });

  it("follows prod's fallback to another adapter's model", () => {
    const routing = (hintFiles()[ROUTING_FILE] ?? "").replace("fallback: fx-paid }", "fallback: fx-other }");
    const r = composed({ changes: { [ROUTING_FILE]: routing } });
    expect(r.index.hints).toContain("The fallback costs $0.075 in and $0.30 out per million tokens.");
  });

  it("writes amounts in dollars: whole where the cents are 0, else two decimals at least, zeros past them trimmed", () => {
    expect(formatAmount(5)).toBe("$5");
    expect(formatAmount(20.0)).toBe("$20");
    expect(formatAmount(0.1)).toBe("$0.10");
    expect(formatAmount(0.5)).toBe("$0.50");
    expect(formatAmount(0.075)).toBe("$0.075");
    expect(formatAmount(2.5)).toBe("$2.50");
    expect(formatAmount(0)).toBe("$0");
    expect(formatAmount(Number.NaN)).toBeNull();
    expect(formatAmount(-1)).toBeNull();
  });

  it("names the three configuration files as constants", () => {
    expect([BUDGETS_FILE, ROUTING_FILE, PRICES_FILE]).toEqual([
      "config/budgets.yaml",
      "config/routing.yaml",
      "config/prices.yaml",
    ]);
  });
});

describe("the index's hints (contracts/hints.md §3)", () => {
  it("are the filled hints in the file's order", () => {
    const doc = fixtureHints();
    doc.hints = [doc.hints[3], doc.hints[1], doc.hints[0]] as Record<string, unknown>[];
    const r = composed({ hints: doc });
    expect(r.index.hints).toEqual([
      "The fallback costs $0.10 in and $0.50 out per million tokens.",
      'Every piece is also in the "In the fixture room" list.',
      "the fixture room holds a desk",
    ]);
  });

  it("are empty with no hints file", () => {
    const r = composed({ hints: null });
    expect(r.findings).toEqual([]);
    expect(r.index.hints).toEqual([]);
  });
});
