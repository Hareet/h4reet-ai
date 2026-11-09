// The email's designed form (spec 011, FR-002, FR-003, FR-015 to FR-024; SC-008, SC-009; plan §5; tasks.md T025): the
// designed subject, the two emoji, a space each, and the first line, and a sample's with 🧪 first; every element and
// attribute on the allowlist, read by a small tokenizer of this test's own (the output is regular, and FR-052 allows
// no parser package), and no URL; every value escaped; the themes, viewport, detection, and language declared; the
// rows in FR-003's order; each bar's share from the facts, full at or past its ceiling, the tick at the warning, the
// numbers beside it; every text pair at 4.5:1 and every bar on its track at 3:1 in both palettes; the longest facts
// within 32 KiB; and no amount, time, key, or fingerprint the plain text doesn't hold.
import { describe, expect, it } from "vitest";

import { designEmail, designedSubject, escapeHtml } from "../../src/alerts/email-design.js";
import { renderAlert, usd, type AlertContext, type AlertSpec } from "../../src/alerts/format.js";
import { HTML_MAX_BYTES } from "../../src/alerts/forms.js";
import { PALETTE, SEVERITIES, type Severity } from "../../src/alerts/marks.js";
import { AWKWARD, FP, allShapes } from "../helpers/alert-cases.js";
import { entryCases, furtherCases, longestCases, type GoldenCase } from "../helpers/golden-cases.js";

const everyCase = (): GoldenCase[] => [...entryCases(), ...furtherCases(), ...longestCases()];
const html = (c: GoldenCase): string => designEmail(c.ctx, c.spec, c.sample).html;
const named = (name: string): GoldenCase => {
  const found = [...entryCases(), ...furtherCases()].find((c) => c.name === name);
  if (found === undefined) throw new Error(`no case ${name}`);
  return found;
};

// ---------------------------------------------------------------------------------------------------------------
// A tokenizer of this test's own: the doctype, tags with double-quoted attributes, the style element's CSS, and text.
// Anything else, a comment included, is refused.
// ---------------------------------------------------------------------------------------------------------------

const ELEMENTS = new Set([
  "html",
  "head",
  "meta",
  "title",
  "style",
  "body",
  "table",
  "tr",
  "td",
  "span",
  "strong",
  "br",
]);
const VOID = new Set(["meta", "br"]);
const ATTRIBUTES = new Set([
  "lang",
  "dir",
  "charset",
  "name",
  "content",
  "class",
  "style",
  "role",
  "width",
  "align",
  "valign",
  "cellpadding",
  "cellspacing",
  "border",
]);
const NEVER = ["url(", "@import", "expression(", "//", "http:", "https:", "data:", "cid:"];

interface Tag {
  name: string;
  close: boolean;
  attributes: Record<string, string>;
}
type Token = { tag: Tag } | { text: string } | { css: string };

function tokenize(source: string): Token[] {
  expect(source.startsWith("<!DOCTYPE html>\n")).toBe(true);
  const tokens: Token[] = [];
  let rest = source.slice("<!DOCTYPE html>\n".length);
  while (rest.length > 0) {
    if (rest.startsWith("<style>")) {
      const end = rest.indexOf("</style>");
      expect(end, "an unclosed style").toBeGreaterThan(0);
      tokens.push({ tag: { name: "style", close: false, attributes: {} } }, { css: rest.slice(7, end) });
      tokens.push({ tag: { name: "style", close: true, attributes: {} } });
      rest = rest.slice(end + "</style>".length);
      continue;
    }
    if (rest.startsWith("<")) {
      const m = /^<(\/?)([a-z][a-z0-9]*)((?: [a-z-]+="[^"<>]*")*)>/.exec(rest);
      expect(m, `a tag the tokenizer can't read: ${rest.slice(0, 60)}`).not.toBeNull();
      const [whole, slash, name, attrs] = m as RegExpExecArray;
      const attributes: Record<string, string> = {};
      for (const a of (attrs ?? "").matchAll(/ ([a-z-]+)="([^"]*)"/g)) {
        expect(attributes[a[1] as string], `a repeated attribute ${a[1]}`).toBeUndefined();
        attributes[a[1] as string] = a[2] as string;
      }
      tokens.push({ tag: { name: name as string, close: slash === "/", attributes } });
      rest = rest.slice(whole.length);
      continue;
    }
    const end = rest.indexOf("<");
    const text = end < 0 ? rest : rest.slice(0, end);
    tokens.push({ text });
    rest = rest.slice(text.length);
  }
  return tokens;
}

/** The text a reader sees, entities decoded, in document order: no tag, no CSS. */
function visibleText(source: string): string {
  return tokenize(source)
    .filter((t): t is { text: string } => "text" in t)
    .map((t) => t.text)
    .join(" ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("the designed subject (FR-016; Q1's answer)", () => {
  it("is the severity's emoji, a space, the kind's emoji, a space, and the plain text's first line", () => {
    const trip = named("05-trip");
    expect(designedSubject(trip.ctx, trip.spec)).toBe(
      "🔴 🛑 [h4reet.ai prod] KILL SWITCH TRIPPED: daily ceiling reached",
    );
    for (const c of [...entryCases(), ...furtherCases()]) {
      const first = renderAlert(c.ctx, c.spec).subject;
      expect(designedSubject(c.ctx, c.spec), c.name).toMatch(
        new RegExp(`^\\S+ \\S+ ${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      );
      expect(designEmail(c.ctx, c.spec).subject, c.name).toBe(designedSubject(c.ctx, c.spec));
    }
  });

  it("puts 🧪 first for a sample, its first line beginning [SAMPLE]", () => {
    const trip = named("05-trip");
    expect(designedSubject(trip.ctx, trip.spec, { fingerprint: FP })).toBe(
      "🧪 🔴 🛑 [SAMPLE] [h4reet.ai prod] KILL SWITCH TRIPPED: daily ceiling reached",
    );
  });
});

describe("nothing loads (FR-019; plan §5.4)", () => {
  it("holds every element and attribute to the allowlist, and no URL, in every case", () => {
    for (const c of everyCase()) {
      const source = html(c);
      const open: string[] = [];
      for (const t of tokenize(source)) {
        if ("css" in t) {
          for (const never of NEVER) expect(t.css, `${c.name}: ${never} in the style`).not.toContain(never);
          continue;
        }
        if ("text" in t) continue;
        expect(ELEMENTS.has(t.tag.name), `${c.name}: <${t.tag.name}>`).toBe(true);
        for (const [k, v] of Object.entries(t.tag.attributes)) {
          expect(ATTRIBUTES.has(k), `${c.name}: ${k}=`).toBe(true);
          for (const never of NEVER) expect(v, `${c.name}: ${never} in ${k}`).not.toContain(never);
        }
        if (VOID.has(t.tag.name)) continue;
        if (!t.tag.close) open.push(t.tag.name);
        else expect(open.pop(), `${c.name}: </${t.tag.name}>`).toBe(t.tag.name);
      }
      expect(open, `${c.name}: unclosed`).toEqual([]);
      for (const never of ["http", "//", "src=", "href=", "<img", "<a ", "<link", "<script", "<!--"]) {
        expect(source, `${c.name}: ${never}`).not.toContain(never);
      }
    }
  });

  it("declares both themes, the viewport, no detection of links, and the language", () => {
    const source = html(named("05-trip"));
    expect(source).toContain('<html lang="en" dir="ltr">');
    expect(source).toContain('<meta charset="utf-8">');
    expect(source).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(source).toContain('<meta name="color-scheme" content="light dark">');
    expect(source).toContain('<meta name="supported-color-schemes" content="light dark">');
    expect(source).toContain(
      '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">',
    );
    expect(source).toContain("@media (prefers-color-scheme: dark)");
    expect(source).toContain("a[x-apple-data-detectors]");
    expect(source).toContain("<title>🔴 🛑 [h4reet.ai prod] KILL SWITCH TRIPPED: daily ceiling reached</title>");
    // One column, 600 pixels at most, fluid below it, on presentation tables.
    expect(source).toMatch(/<table role="presentation" width="600"[^>]* style="[^"]*width:100%;max-width:600px;/);
  });
});

describe("every value escaped (FR-017; plan §3.6)", () => {
  it("writes a prefix's and a label's markup characters as text, never as markup", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    for (const [c0, s0] of allShapes()) {
      const c: AlertContext = { ...c0, prefix: `[${AWKWARD} prod]` };
      const s: AlertSpec =
        s0.kind === "credentials_expiring" || s0.kind === "fallback_unavailable"
          ? { ...s0, label: `${AWKWARD} API` }
          : s0;
      const source = designEmail(c, s).html;
      expect(source, c.dedupeKey).toContain("[&amp;&lt;&gt;&quot;&#39;*_`🧪 prod]");
      expect(source, c.dedupeKey).not.toContain(AWKWARD);
      if (s !== s0) expect(source, c.dedupeKey).toContain("&amp;&lt;&gt;&quot;&#39;*_`🧪 API");
      tokenize(source); // still regular: no value broke out of its text
    }
  });
});

describe("the layout (FR-003, FR-018)", () => {
  it("reads in FR-003's order: severity, headline, next step, meters, states, time, ID, runbook", () => {
    const text = visibleText(html(named("05-trip")));
    const order = [
      "CRITICAL · [h4reet.ai prod]",
      "KILL SWITCH TRIPPED: daily ceiling reached",
      "What to do next",
      "Every request now gets the degraded response",
      "Meters",
      "Daily",
      "Month",
      "Fallback",
      "Runtime",
      "degraded since 2026-10-29T16:40:03Z",
      "available",
      "Time",
      "2026-10-29T16:40:03Z",
      "Alert ID",
      "prod:trip:day:2026-10-29",
      "Runbook",
      "docs/runbooks/kill-switch-trip.md",
    ];
    let at = -1;
    for (const words of order) {
      const next = text.indexOf(words, at + 1);
      expect(next, words).toBeGreaterThan(at);
      at = next;
    }
  });

  it("opens a sample with its banner, above the severity, naming the requester and that nothing happened", () => {
    const trip = named("05-trip");
    const text = visibleText(designEmail(trip.ctx, trip.spec, { fingerprint: FP }).html);
    const banner = text.indexOf(`SAMPLE · A sample, sent by operator #${FP}: nothing happened on prod.`);
    expect(banner).toBeGreaterThan(-1);
    expect(banner).toBeLessThan(text.indexOf("CRITICAL"));
  });

  it("leaves out what the plain text leaves out, and marks dev's synthetic spend and test clock", () => {
    // Its sentence says "Meters and alerts resume", so the block is looked for by its rows and its bars.
    const storeHtml = html(named("17-store-unreachable"));
    const store = visibleText(storeHtml);
    expect(store).not.toMatch(/\bDaily\b/);
    expect(storeHtml).not.toMatch(/<td class="h4-(fill|track)"/);
    expect(store).not.toMatch(/Fallback\s/);
    const dev = visibleText(html(named("case-dev-test-clock")));
    expect(dev).toContain("(synthetic spend)");
    expect(dev).toContain("2026-10-27T08:01:30Z (test clock)");
  });
});

describe("the bars (FR-021; Q5's answer)", () => {
  /** Each bar's fill share and its tick's place, as the HTML draws them, in order. */
  const bars = (source: string) => ({
    fills: [...source.matchAll(/<td class="h4-fill" width="(\d+)%"/g)].map((m) => Number(m[1])),
    ticks: [...source.matchAll(/<td class="h4-tickpad" width="(\d+)%"/g)].map((m) => Number(m[1])),
  });
  const share = (spent: bigint, ceiling: bigint): number =>
    Number(((spent < ceiling ? spent : ceiling) * 100n) / ceiling);

  it("draws each meter's spend against its ceiling, full at or past it, with the tick at its warning", () => {
    expect(bars(html(named("05-trip")))).toEqual({ fills: [100, 67, 50], ticks: [70, 70] });
    expect(bars(html(named("03-warn-fallback-grant")))).toEqual({ fills: [42, 56, 70], ticks: [70, 70, 70] });
    // Spec 010's adapter month, against its cap; it has no warning of its own in the text, so no tick.
    expect(bars(html(named("07-exhausted-adapter-month")))).toEqual({ fills: [20, 45, 15, 100], ticks: [70, 70] });
    // A meter at nothing draws its track alone.
    expect(bars(html(named("10-operator-init")))).toEqual({ fills: [], ticks: [70, 70] });
  });

  it("draws every bar from its facts, in every case, with the numbers printed beside it", () => {
    for (const c of everyCase()) {
      const source = html(c);
      const m = c.ctx.meters;
      if (m === undefined && !("adapterMonth" in c.spec)) {
        expect(bars(source).fills, c.name).toEqual([]);
        continue;
      }
      const want = [
        ...(m === undefined
          ? []
          : [
              share(m.dayMicro, m.dayCeilingMicro),
              share(m.monthMicro, m.monthCeilingMicro),
              share(m.fallbackMicro, m.fallbackAllowanceMicro),
            ]),
        ...("adapterMonth" in c.spec ? [share(c.spec.adapterMonth.spentMicro, c.spec.adapterMonth.capMicro)] : []),
      ].filter((x) => x > 0);
      expect(bars(source).fills, c.name).toEqual(want);
      if (m !== undefined) {
        const text = visibleText(source);
        expect(text, c.name).toContain(`${usd(m.dayMicro)} / ${usd(m.dayCeilingMicro)} USD`);
        expect(text, c.name).toContain(`${usd(m.fallbackMicro)} / ${usd(m.fallbackAllowanceMicro)} USD`);
      }
    }
  });
});

describe("the palettes' contrast (FR-020; SC-009; WCAG 2.x)", () => {
  const luminance = (hex: string): number => {
    const channel = (i: number): number => {
      const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  const contrast = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  it("holds every text pair at 4.5:1, and every bar on its track and the tick on the card at 3:1, light and dark", () => {
    for (const scheme of ["light", "dark"] as const) {
      const p = PALETTE[scheme];
      expect(contrast(p.text, p.card), `${scheme} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.label, p.card), `${scheme} labels`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.tick, p.card), `${scheme} tick`).toBeGreaterThanOrEqual(3);
      for (const sev of Object.keys(SEVERITIES) as Severity[]) {
        const band = p.band[sev];
        expect(contrast(band.text, band.background), `${scheme} ${sev} band`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(band.background, p.track), `${scheme} ${sev} bar`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("writes the light palette inline and the dark one under prefers-color-scheme, by class", () => {
    const source = html(named("05-trip"));
    const dark = source.slice(source.indexOf("@media (prefers-color-scheme: dark)"));
    expect(source).toContain(`background-color:${PALETTE.light.band.critical.background}`);
    expect(dark).toContain(`background-color:${PALETTE.dark.band.critical.background} !important`);
    expect(dark).toContain(`color:${PALETTE.dark.text} !important`);
    expect(dark).toContain(`background-color:${PALETTE.dark.track} !important`);
  });
});

describe("the bound (FR-023, FR-024; SC-008)", () => {
  it("stays within 32 KiB of UTF-8 at every entry's longest facts", () => {
    for (const c of longestCases()) {
      expect(Buffer.byteLength(html(c), "utf8"), c.name).toBeLessThanOrEqual(HTML_MAX_BYTES);
    }
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
      for (const found of facts(visibleText(html(c)))) expect(plain, `${c.name}: ${found}`).toContain(found);
    }
  });
});
