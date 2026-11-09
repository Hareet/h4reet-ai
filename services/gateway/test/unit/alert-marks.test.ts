// The marks (spec 011, FR-006, FR-007; Q2's answer; plan §3.1; tasks.md T017): every catalogue entry's severity, its
// severity's emoji and name, and its kind's emoji. Each emoji is one code point, or one and U+FE0F, so its length in
// UTF-16 code units is fixed: the Telegram entities' offsets after it depend on that.
import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../../src/alerts/catalogue.js";
import { KIND_EMOJI, PALETTE, SAMPLE_EMOJI, SEVERITIES, marksOf, severityOf } from "../../src/alerts/marks.js";
import { allShapes } from "../helpers/alert-cases.js";
import { entryCases } from "../helpers/golden-cases.js";

describe("the severities (FR-006; Q2's answer)", () => {
  it("are Critical, Warning, Operator action, and Information, each with its emoji, by kind", () => {
    expect(SEVERITIES).toEqual({
      critical: { name: "Critical", emoji: "🔴" },
      warning: { name: "Warning", emoji: "🟠" },
      operator_action: { name: "Operator action", emoji: "🔵" },
      information: { name: "Information", emoji: "⚪" },
    });
    const byKind: Record<string, string> = {
      trip: "critical",
      fallback_exhausted: "critical",
      store_unreachable: "critical",
      warn: "warning",
      credentials_expiring: "warning",
      fallback_unavailable: "warning",
      auth_failed: "warning",
      operator_action: "operator_action",
      reminder: "information",
    };
    for (const [c, s] of allShapes()) expect(severityOf(s), `${s.kind} ${c.dedupeKey}`).toBe(byKind[s.kind]);
  });

  it("give every catalogue entry its marks, spec 010's adapter month included", () => {
    const want: Record<string, [string, string, string]> = {
      "01-warn-day": ["Warning", "🟠", "📈"],
      "02-warn-month": ["Warning", "🟠", "📈"],
      "03-warn-fallback-grant": ["Warning", "🟠", "📈"],
      "04-warn-adapter-month": ["Warning", "🟠", "📈"],
      "05-trip": ["Critical", "🔴", "🛑"],
      "06-exhausted-grant": ["Critical", "🔴", "💸"],
      "07-exhausted-adapter-month": ["Critical", "🔴", "💸"],
      "08-operator-reset": ["Operator action", "🔵", "🛠️"],
      "09-operator-renew": ["Operator action", "🔵", "🛠️"],
      "10-operator-init": ["Operator action", "🔵", "🛠️"],
      "11-studio-opened": ["Operator action", "🔵", "🛠️"],
      "12-studio-closed": ["Operator action", "🔵", "🛠️"],
      "13-credentials-expiring": ["Warning", "🟠", "🔑"],
      "14-unavailable-bedrock": ["Warning", "🟠", "🔌"],
      "15-unavailable-anthropic": ["Warning", "🟠", "🔌"],
      "16-auth-failed": ["Warning", "🟠", "🔐"],
      "17-store-unreachable": ["Critical", "🔴", "🗄️"],
      "18-reminder-degraded": ["Information", "⚪", "⏰"],
      "19-reminder-awaiting": ["Information", "⚪", "⏰"],
    };
    const cases = entryCases();
    expect(cases.map((c) => c.name)).toEqual(Object.keys(want));
    expect(CATALOGUE).toHaveLength(19);
    for (const c of cases) {
      const m = marksOf(c.spec);
      expect([m.name, m.severityEmoji, m.kindEmoji], c.name).toEqual(want[c.name]);
    }
  });
});

describe("the emoji (FR-007)", () => {
  const all = (): string[] => [
    ...Object.values(SEVERITIES).map((s) => s.emoji),
    ...Object.values(KIND_EMOJI),
    SAMPLE_EMOJI,
  ];

  it("cover every kind, and the sample's mark", () => {
    expect(KIND_EMOJI).toEqual({
      warn: "📈",
      trip: "🛑",
      fallback_exhausted: "💸",
      operator_action: "🛠️",
      credentials_expiring: "🔑",
      fallback_unavailable: "🔌",
      auth_failed: "🔐",
      store_unreachable: "🗄️",
      reminder: "⏰",
    });
    expect(SAMPLE_EMOJI).toBe("🧪");
  });

  it("are each one code point, or one and U+FE0F: no joiner, skin tone, flag, or keycap", () => {
    for (const e of all()) {
      const points = [...e].map((ch) => ch.codePointAt(0) ?? 0);
      expect(points.length === 1 || (points.length === 2 && points[1] === 0xfe0f), e).toBe(true);
      expect(
        points.some((p) => p === 0x200d || (p >= 0x1f3fb && p <= 0x1f3ff) || p === 0x20e3),
        e,
      ).toBe(false);
    }
  });

  it("have the UTF-16 lengths the offsets count: one, two, or three code units", () => {
    const lengths = Object.fromEntries(all().map((e) => [e, e.length]));
    expect(lengths).toEqual({
      "⏰": 1,
      "⚪": 1,
      "🔴": 2,
      "🟠": 2,
      "🔵": 2,
      "📈": 2,
      "🛑": 2,
      "💸": 2,
      "🔑": 2,
      "🔌": 2,
      "🔐": 2,
      "🧪": 2,
      "🛠️": 3,
      "🗄️": 3,
    });
  });
});

describe("the palette beside the marks (FR-020; plan §3.1)", () => {
  it("gives each severity a light and a dark band, and the card's colours, as six-digit hex", () => {
    for (const scheme of ["light", "dark"] as const) {
      const p = PALETTE[scheme];
      for (const sev of Object.keys(SEVERITIES) as (keyof typeof SEVERITIES)[]) {
        expect(p.band[sev].background, `${scheme} ${sev}`).toMatch(/^#[0-9A-F]{6}$/);
        expect(p.band[sev].text, `${scheme} ${sev}`).toMatch(/^#[0-9A-F]{6}$/);
      }
      for (const k of ["card", "text", "label", "track", "tick"] as const)
        expect(p[k], `${scheme} ${k}`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
