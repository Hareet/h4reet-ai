// Telegram's designed message (spec 011, FR-002, FR-003, FR-008 to FR-012, FR-014, FR-023, FR-024; SC-002, SC-008;
// plan §3.2, §4; tasks.md T018): the lines in FR-003's order; bold on the headline, code on the key and the path, one
// pre on the meters, nothing nested; every entity checked against the text's own UTF-16 code units, with emoji of one,
// two, and three units before entities and a prefix that holds one; the prefix's and a label's characters kept as
// themselves; the breach probe's token; the check refusing crafted bad lists; dev's marks and the test clock; the
// longest facts within 2,000 units; and no amount, time, key, or fingerprint the plain text doesn't hold.
import { describe, expect, it } from "vitest";

import { renderAlert, type AlertContext, type AlertSpec } from "../../src/alerts/format.js";
import { TELEGRAM_MAX_UNITS, checkTelegram, type TelegramMessage } from "../../src/alerts/forms.js";
import { designTelegram } from "../../src/alerts/telegram-design.js";
import { AWKWARD, FP, allShapes } from "../helpers/alert-cases.js";
import { entryCases, furtherCases, longestCases, type GoldenCase } from "../helpers/golden-cases.js";

const covered = (m: TelegramMessage) => m.entities.map((e) => [e.type, m.text.slice(e.offset, e.offset + e.length)]);
const everyCase = (): GoldenCase[] => [...entryCases(), ...furtherCases(), ...longestCases()];
const design = (c: GoldenCase): TelegramMessage => designTelegram(c.ctx, c.spec, c.sample);
const trip = (): GoldenCase => entryCases()[4] as GoldenCase;

describe("the message, line by line (FR-003, FR-011; plan §4.1)", () => {
  it("reads severity, headline, what to do next, the meters, the states, the time, the ID, and the runbook", () => {
    const m = design(trip());
    expect(m.text.split("\n")).toEqual([
      "🔴 Critical · [h4reet.ai prod]",
      "🛑 KILL SWITCH TRIPPED: daily ceiling reached",
      "Next: Every request now gets the degraded response, local answers included. Only an operator reset restores service.",
      "Meters",
      "Daily      5.00 /  5.00 USD   warning  3.50",
      "Month     13.40 / 20.00 USD   warning 14.00",
      "Fallback   2.00 /  4.00 USD   grant 2",
      "Runtime: degraded since 2026-10-29T16:40:03Z",
      "Fallback: available",
      "Time: 2026-10-29T16:40:03Z",
      "id prod:trip:day:2026-10-29",
      "Runbook: docs/runbooks/kill-switch-trip.md",
    ]);
    expect(covered(m)).toEqual([
      ["bold", "KILL SWITCH TRIPPED: daily ceiling reached"],
      [
        "pre",
        "Daily      5.00 /  5.00 USD   warning  3.50\nMonth     13.40 / 20.00 USD   warning 14.00\nFallback   2.00 /  4.00 USD   grant 2",
      ],
      ["code", "prod:trip:day:2026-10-29"],
      ["code", "docs/runbooks/kill-switch-trip.md"],
    ]);
  });

  it("leaves out what the plain text leaves out: the meters of a kind with none, the fallback state when unknown", () => {
    const store = entryCases().find((c) => c.name === "17-store-unreachable") as GoldenCase;
    const lines = design(store).text.split("\n");
    expect(lines).not.toContain("Meters");
    expect(lines.some((l) => l.startsWith("Fallback:"))).toBe(false);
    expect(lines[0]).toBe("🔴 Critical · [h4reet.ai prod]");
    expect(lines[1]).toBe("🗄️ STORE UNREACHABLE: the kill-switch store hasn't answered for 60 s");
    const auth = entryCases().find((c) => c.name === "16-auth-failed") as GoldenCase;
    expect(design(auth).text).not.toContain("Meters");
    // A kind with no fixed sentence has no Next line: the day's warning.
    expect(design(entryCases()[0] as GoldenCase).text).not.toContain("Next:");
  });

  it("puts spec 010's adapter month in the block, labelled with the adapter's ID, against its cap", () => {
    const warn = entryCases().find((c) => c.name === "04-warn-adapter-month") as GoldenCase;
    const block = covered(design(warn)).find(([type]) => type === "pre")?.[1] ?? "";
    expect(block.split("\n").at(-1)).toMatch(/^anthropic +7\.20 \/ 10\.00 USD {3}2026-10$/);
  });

  it("shows the grant's warning only in the fallback grant's own warning, as the plain text does", () => {
    const grant = entryCases().find((c) => c.name === "03-warn-fallback-grant") as GoldenCase;
    expect(design(grant).text).toContain("USD   grant 1, warning 1.40");
    expect(design(trip()).text).not.toMatch(/grant 2, warning/);
  });

  it("holds no emoji in the block, so its columns align", () => {
    for (const c of everyCase()) {
      const block = covered(design(c)).find(([type]) => type === "pre")?.[1];
      if (block !== undefined) expect(block, c.name).toMatch(/^[\x20-\x7e\n]*$/);
    }
  });
});

describe("the entities, in UTF-16 code units (FR-009, FR-010, FR-014; SC-002)", () => {
  it("pass the check in every case, and each covers exactly its words", () => {
    for (const c of everyCase()) {
      const m = design(c);
      expect(checkTelegram(m), c.name).toBe("ok");
      const types = m.entities.map((e) => e.type);
      expect(types.filter((t) => t === "bold").length, c.name).toBe(c.sample === undefined ? 1 : 2);
      expect(
        types.filter((t) => t === "code"),
        c.name,
      ).toEqual(["code", "code"]);
      expect(types.filter((t) => t === "pre").length, c.name).toBeLessThanOrEqual(1);
      const words = covered(m).map(([, w]) => w);
      expect(words, c.name).toContain(c.ctx.dedupeKey);
      expect(words.at(-1), c.name).toMatch(/^docs\/runbooks\/[a-z0-9-]+\.md$/);
    }
  });

  it("stays on its words after emoji of one, two, and three units, and after a prefix that holds one", () => {
    const pick = (name: string) => entryCases().find((c) => c.name === name) as GoldenCase;
    const cases: GoldenCase[] = [
      pick("18-reminder-degraded"), // ⚪ and ⏰, one unit each
      pick("05-trip"), // 🔴 and 🛑, two each
      pick("08-operator-reset"), // 🔵 two, 🛠️ three
      pick("17-store-unreachable"), // 🗄️ three
      ...longestCases(), // a prefix with 🧪, two units, and the sample's 🧪 before everything
    ];
    for (const c of cases) {
      const m = design(c);
      for (const e of m.entities) {
        expect(e.offset + e.length, c.name).toBeLessThanOrEqual(m.text.length);
        const first = m.text.charCodeAt(e.offset);
        expect(first >= 0xdc00 && first <= 0xdfff, `${c.name} starts inside a pair`).toBe(false);
      }
      expect(covered(m)[c.sample === undefined ? 0 : 1], c.name).toEqual(["bold", headlineOf(c)]);
    }
  });

  it("refuses crafted bad lists: out of range, a split pair, an overlap, zero length, a fifth type, a language", () => {
    const text = "🔴 Critical · KILL id k1";
    const ok: TelegramMessage = { text, entities: [{ type: "bold", offset: 3, length: 8 }] };
    expect(checkTelegram(ok)).toBe("ok");
    const bad: TelegramMessage["entities"][] = [
      [{ type: "bold", offset: 3, length: 99 }],
      [{ type: "bold", offset: -1, length: 2 }],
      [{ type: "bold", offset: 1, length: 2 }], // starts on 🔴's low surrogate
      [{ type: "bold", offset: 0, length: 1 }], // ends between 🔴's two halves
      [
        { type: "bold", offset: 3, length: 8 },
        { type: "code", offset: 5, length: 4 },
      ],
      [
        { type: "code", offset: 12, length: 2 },
        { type: "bold", offset: 3, length: 3 },
      ],
      [{ type: "bold", offset: 3, length: 0 }],
      [{ type: "text_link" as "bold", offset: 3, length: 4 }],
      [{ type: "pre", offset: 3, length: 4, language: "ts" } as TelegramMessage["entities"][number]],
      [{ type: "bold", offset: 3.5, length: 2 }],
    ];
    for (const entities of bad)
      expect(checkTelegram({ text, entities }), JSON.stringify(entities)).toBe("render_failed");
    expect(checkTelegram({ text: "x".repeat(TELEGRAM_MAX_UNITS + 1), entities: [] })).toBe("over_limit");
  });
});

/** The case's headline, as the plain text's first line holds it after the prefix. */
function headlineOf(c: GoldenCase): string {
  const first = renderAlert(c.ctx, c.spec, c.sample).subject;
  return first.slice(first.indexOf(c.ctx.prefix) + c.ctx.prefix.length + 1);
}

describe("values carried as themselves (FR-008, FR-043; plan §3.6)", () => {
  it("keeps the prefix's and a label's markup characters and emoji as they are, every entity on its words", () => {
    for (const [c0, s0] of allShapes()) {
      const c: AlertContext = { ...c0, prefix: `[${AWKWARD} prod]` };
      const s: AlertSpec =
        s0.kind === "credentials_expiring" || s0.kind === "fallback_unavailable"
          ? { ...s0, label: `${AWKWARD} API` }
          : s0;
      const m = designTelegram(c, s);
      expect(checkTelegram(m), c.dedupeKey).toBe("ok");
      expect(m.text.split("\n")[0], c.dedupeKey).toContain(`[${AWKWARD} prod]`);
      if (s !== s0) expect(m.text, c.dedupeKey).toContain(`${AWKWARD} API`);
      expect(covered(m).find(([t]) => t === "bold")?.[1], c.dedupeKey).toBe(headlineOf({ name: "x", ctx: c, spec: s }));
    }
  });
});

describe("found as before (FR-012), marked as on the plain text (US1 scenario 4), and inside its bound (FR-023, FR-024)", () => {
  /** evals/breach_probe.py's token_match: the token after "id ", whole. */
  const tokenMatch = (text: string, key: string): boolean =>
    new RegExp(`(?:^|\\s)id ${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(text);

  it("holds the token id <key>, which the breach probe's search finds", () => {
    for (const c of everyCase()) expect(tokenMatch(design(c).text, c.ctx.dedupeKey), c.name).toBe(true);
  });

  it("carries dev's synthetic-spend mark in the block and the test clock's on every time", () => {
    const dev = furtherCases().find((c) => c.name === "case-dev-test-clock") as GoldenCase;
    const m = design(dev);
    const block = covered(m).find(([t]) => t === "pre")?.[1] ?? "";
    expect(block.split("\n").at(-1)).toBe("(synthetic spend)");
    expect(m.text).toContain("Time: 2026-10-27T08:01:30Z (test clock)");
    for (const time of m.text.match(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ(?: \(test clock\))?/g) ?? []) {
      expect(time).toMatch(/\(test clock\)$/);
    }
  });

  it("begins a sample with its line, the sample's mark, SAMPLE in bold, and the sentence, before the severity", () => {
    const m = designTelegram(trip().ctx, trip().spec, { fingerprint: FP });
    const lines = m.text.split("\n");
    expect(lines[0]).toBe(`🧪 SAMPLE · A sample, sent by operator #${FP}: nothing happened on prod.`);
    expect(lines[1]).toBe("🔴 Critical · [h4reet.ai prod]");
    expect(covered(m)[0]).toEqual(["bold", "SAMPLE"]);
  });

  it("stays within 2,000 UTF-16 code units at every entry's longest facts", () => {
    for (const c of longestCases()) {
      const units = design(c).text.length;
      expect(units, c.name).toBeLessThanOrEqual(TELEGRAM_MAX_UNITS);
    }
  });

  it("never cuts the plain text inside a surrogate pair, its own last resort (FR-023)", () => {
    const c = trip();
    const spec: AlertSpec = { kind: "auth_failed", count: 3, windowMinutes: 10, lastClass: "mismatch" };
    let steppedBack = false;
    for (let n = 500; n < 760; n++) {
      // A run of two-unit emoji that the 1,000-unit cut lands in, at one offset or another.
      const body = renderAlert({ ...c.ctx, dedupeKey: `${"k".repeat(n)}${"🔴".repeat(60)}` }, spec).body;
      expect(body.length, String(n)).toBeLessThanOrEqual(1_000);
      const last = body.charCodeAt(body.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff, `${n}: ends on a pair's first half`).toBe(false);
      if (body.length === 999) steppedBack = true;
    }
    expect(steppedBack).toBe(true);
  });
});

describe("no fact or sentence of its own (FR-002; plan §3.2)", () => {
  it("holds only the plain text's amounts, times, keys, and fingerprints", () => {
    const facts = (text: string) => [
      ...(text.match(/\b\d+\.\d\d\b/g) ?? []),
      ...(text.match(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g) ?? []),
      ...(text.match(/#[0-9a-f]{8}\b/g) ?? []),
      ...(text.match(/\b[a-z-]+:[a-z_]+:[^\s]+/g) ?? []),
    ];
    for (const c of everyCase()) {
      const plain = renderAlert(c.ctx, c.spec, c.sample).body;
      for (const found of facts(design(c).text)) expect(plain, `${c.name}: ${found}`).toContain(found);
    }
  });
});
