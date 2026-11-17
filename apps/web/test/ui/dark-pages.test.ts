// T-C01 (spec 030, group C; FR-015 to FR-018; plan.md §R-C1, §R-C2): the selection screen, the credits page
// (`/credits/`, build/credits.ts), and the data-flow page (`/disclosure/`, build/disclosure.ts) dark, from one shared
// stylesheet of the room's own panel tokens, src/pages/dark.css, whose values are held here equal to room.css's and
// hud/split.css's :root (Q9).
//
// - The colours are the cascade's, computed from the stylesheets themselves on the real DOM: the selection screen's
//   sheets in the bundle's order (style.css from main.ts, room.css from app.ts, then choice.ts's dark.css and
//   choice.css), each built page's emitted style.css alone. Each property's winner is the cascade's: !important, then
//   specificity, then order; var() resolves through the custom properties each element inherits, and a var() with no
//   value takes its fallback, so the cards' reads of group B's --btn-* tokens resolve without B's stylesheet. The same
//   checks run again with the skin the build ships, its generated stylesheet and the root's data-skin (spec 030,
//   T-INT02, Q108: was a stand-in of plan.md §R-B1's estimates), so the cards hold with B too.
// - A run of words is judged over its own background and each ancestor's, composited over white (a page whose ground
//   is missing reads as white): every text at 4.5:1 (no large-text allowance, so the floor is never too low). Links
//   underlined and at 4.5:1. The focus ring at 3:1 over what lies outside the control (a radio's ring is its card's,
//   since the radio is transparent under it). Borders at 3:1 against what lies outside them. `color-scheme: dark`.
// - States: hover and focus are forced by stripping the pseudo-class from every selector, so every rule of that state
//   applies at once; the screen is judged empty, with step 1 chosen, and with both chosen.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { creditsPage, renderCredits } from "../../build/credits";
import { disclosurePage, renderDisclosure } from "../../build/disclosure";
import { builtSkin } from "../helpers/built-skin";
import { REPO, WEB, button, enter, flush, parseCss, radio, start, tabOrder } from "../helpers/room";

const read = (path: string): string => readFileSync(join(WEB, path), "utf8");
const DARK = "src/pages/dark.css";
/** dark.css's text; "" where it doesn't exist yet, so each case below fails on its own assertion. */
const darkCss = (): string => (existsSync(join(WEB, DARK)) ? read(DARK) : "");

/** Spec 030 (T-INT02; Q108, C's ask in impl-c.md; was the stand-in `:root[data-skin="metal"] { --btn-frame: #2a3038;
 *  --btn-chamfer: 0.5rem; --btn-secondary-selected-glow: #46d7f0; }`, plan.md §R-B1's estimates): the skin the build
 *  ships, its generated stylesheet, and the root's data-skin the build writes (test/helpers/built-skin.ts). */
const SKIN = builtSkin();

// ---- The cascade, as far as these sheets need it ----

function list(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "(") depth += 1;
    else if (s[i] === ")") depth -= 1;
    else if (s[i] === "," && depth === 0) {
      out.push(s.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(s.slice(from).trim());
  return out.filter((x) => x.length > 0);
}

type Spec = [number, number, number];
const cmp = (x: Spec, y: Spec): number => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
function specificity(selector: string): Spec {
  const n: Spec = [0, 0, 0];
  let s = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, " ");
  s = s.replace(/:(?:not|is|has)\(((?:[^()]|\([^()]*\))*)\)/g, (_m, arg: string) => {
    const best = list(arg).map(specificity).sort(cmp).at(-1) ?? [0, 0, 0];
    n[0] += best[0];
    n[1] += best[1];
    n[2] += best[2];
    return " ";
  });
  const count = (re: RegExp, i: 0 | 1 | 2): void => {
    s = s.replace(re, () => {
      n[i] += 1;
      return " ";
    });
  };
  count(/\[[^\]]*\]/g, 1);
  count(/::[\w-]+/g, 2);
  count(/#[\w-]+/g, 0);
  count(/\.[\w-]+/g, 1);
  count(/:[\w-]+/g, 1);
  count(/[a-zA-Z][\w-]*/g, 2);
  return n;
}

interface Rule {
  readonly selector: string;
  readonly spec: Spec;
  readonly order: number;
  readonly decls: Map<string, string>;
}

type State = "rest" | "hover" | "focus";
const FORCED: Record<State, RegExp | null> = { rest: null, hover: /:hover\b/g, focus: /:focus-visible\b/g };
const OTHER_STATES = /:(?:hover|active|focus|focus-visible|focus-within)\b|::/;

interface Rgba {
  readonly rgb: readonly [number, number, number];
  readonly a: number;
}
type Rgb = Rgba["rgb"];
const WHITE: Rgb = [255, 255, 255];

function colour(v: string): Rgba | null {
  const s = v.trim().toLowerCase();
  if (s === "none" || s === "transparent") return null;
  if (s === "white") return { rgb: WHITE, a: 1 };
  if (s === "black") return { rgb: [0, 0, 0], a: 1 };
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s);
  if (m) return { rgb: [parseInt(m[1] ?? "0", 16), parseInt(m[2] ?? "0", 16), parseInt(m[3] ?? "0", 16)], a: 1 };
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) {
    const c = (x: string | undefined): number => parseInt(`${x ?? "0"}${x ?? "0"}`, 16);
    return { rgb: [c(m[1]), c(m[2]), c(m[3])], a: 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+))?\s*\)$/.exec(s);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) };
  throw new Error(`not a colour this test reads: ${v}`);
}

/** The colour in a shorthand (`2px solid <colour>`, `inset 0 0 0 2px <colour>`): its last colour token. */
function colourIn(v: string): Rgba | null {
  const m = /(#[0-9a-f]{3,6}|rgba?\([^)]*\)|transparent|white|black)\s*$/i.exec(v.trim());
  return m ? colour(m[1] ?? "") : null;
}

const over = (top: Rgba, under: Rgb): Rgb =>
  top.rgb.map((c, i) => top.a * c + (1 - top.a) * (under[i] ?? 0)) as unknown as Rgb;
const luminance = (rgb: Rgb): number => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratio = (a: Rgb, b: Rgb): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
};
const show = (rgb: Rgb): string => `rgb(${rgb.map((c) => Math.round(c)).join(" ")})`;

/** A cascade over `sheets` (their text, in load order), in one state. */
function cascade(sheets: readonly string[], state: State = "rest") {
  const rules: Rule[] = sheets
    .flatMap((text) => parseCss(text).rules)
    .flatMap((r) =>
      list(r.selector).map((selector) => ({ selector, spec: specificity(selector), order: 0, decls: r.declarations })),
    );
  rules.forEach((r, i) => ((r as { order: number }).order = i));
  const forced = FORCED[state];

  const matches = (el: Element, selector: string): boolean => {
    const s = forced ? selector.replace(forced, "") : selector;
    if (OTHER_STATES.test(s)) return false;
    try {
      return el.matches(s);
    } catch {
      return false;
    }
  };

  const declared = (el: Element, props: readonly string[]): { prop: string; value: string } | null => {
    let best: { prop: string; value: string; key: [number, Spec, number] } | null = null;
    for (const r of rules)
      for (const prop of props) {
        const raw = r.decls.get(prop);
        if (raw === undefined || !matches(el, r.selector)) continue;
        const important = /!important\s*$/.test(raw) ? 1 : 0;
        const key: [number, Spec, number] = [important, r.spec, r.order];
        if (
          !best ||
          key[0] > best.key[0] ||
          (key[0] === best.key[0] &&
            (cmp(key[1], best.key[1]) > 0 || (cmp(key[1], best.key[1]) === 0 && key[2] > best.key[2])))
        )
          best = { prop, value: raw.replace(/!important\s*$/, "").trim(), key };
      }
    return best ? { prop: (best as { prop: string }).prop, value: (best as { value: string }).value } : null;
  };

  const custom = (el: Element | null, name: string, depth: number): string | undefined => {
    if (!el) return undefined;
    const d = declared(el, [name]);
    if (d) return substitute(el, d.value, depth + 1);
    return custom(el.parentElement, name, depth);
  };

  /** var() resolved, innermost first, each to its value or else its fallback. */
  const substitute = (el: Element, value: string, depth = 0): string => {
    if (depth > 20) throw new Error(`var() loop at ${value}`);
    let v = value;
    const inner = /var\((--[\w-]+)\s*(?:,\s*([^()]*))?\)/;
    for (let m = inner.exec(v); m; m = inner.exec(v)) {
      const got = custom(el, m[1] ?? "", depth) ?? m[2];
      if (got === undefined) throw new Error(`${m[1]} has no value and no fallback at <${el.tagName.toLowerCase()}>`);
      v = v.slice(0, m.index) + got.trim() + v.slice(m.index + m[0].length);
    }
    return v.trim();
  };

  const value = (el: Element, props: readonly string[]): string | null => {
    const d = declared(el, props);
    return d ? substitute(el, d.value) : null;
  };

  const textColour = (el: Element): Rgba => {
    const v = value(el, ["color"])?.toLowerCase() ?? "inherit";
    if (v === "inherit" || v === "currentcolor")
      return el.parentElement ? textColour(el.parentElement) : { rgb: [0, 0, 0], a: 1 };
    const c = colour(v);
    if (!c) throw new Error(`no text colour at <${el.tagName.toLowerCase()} class="${el.className}">`);
    return c;
  };

  const background = (el: Element): Rgba | null => {
    const v = value(el, ["background", "background-color"]);
    if (v === null) return el.tagName === "BUTTON" ? { rgb: [239, 239, 239], a: 1 } : null;
    return colourIn(v) ?? colour(v);
  };

  /** What lies beneath an element's content: its own background and each ancestor's, over white. */
  const beneath = (el: Element | null): Rgb => {
    const layers: Rgba[] = [];
    for (let e = el; e; e = e.parentElement) {
      const b = background(e);
      if (b) layers.push(b);
    }
    return layers.reduceRight<Rgb>((c, l) => over(l, c), WHITE);
  };

  const shown = (el: Element): boolean => {
    if (el.closest("[hidden], .visually-hidden")) return false;
    for (let e: Element | null = el; e; e = e.parentElement) if (value(e, ["display"]) === "none") return false;
    return true;
  };

  return { declared, value, textColour, background, beneath, shown };
}

type Cascade = ReturnType<typeof cascade>;

/** The elements that hold words of their own, shown. */
const worded = (doc: Document, c: Cascade): Element[] =>
  [...doc.body.querySelectorAll("*")].filter(
    (el) => c.shown(el) && [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0),
  );

const label = (el: Element): string =>
  `<${el.tagName.toLowerCase()}${el.className ? ` class="${String(el.className)}"` : ""}> "${(el.textContent ?? "")
    .trim()
    .slice(0, 40)}"`;

/** Every text at 4.5:1 over what lies beneath it. */
function texts(doc: Document, c: Cascade, where: string): void {
  const found = worded(doc, c);
  expect(found.length, where).toBeGreaterThan(0);
  for (const el of found) {
    const under = c.beneath(el);
    const fg = over(c.textColour(el), under);
    const r = ratio(fg, under);
    expect(r, `${where}: ${label(el)} ${show(fg)} on ${show(under)}`).toBeGreaterThanOrEqual(4.5);
  }
}

/** Every link underlined, and at 4.5:1. */
function links(doc: Document, c: Cascade, where: string): void {
  const found = [...doc.querySelectorAll("a[href]")].filter((a) => c.shown(a));
  expect(found.length, where).toBeGreaterThan(0);
  for (const a of found) {
    const decoration = c.value(a, ["text-decoration", "text-decoration-line"]) ?? "underline";
    expect(decoration, `${where}: ${label(a)}`).toMatch(/underline/);
    const under = c.beneath(a);
    expect(ratio(over(c.textColour(a), under), under), `${where}: ${label(a)}`).toBeGreaterThanOrEqual(4.5);
  }
}

/** The focus ring of each Tab stop (a radio's, its card's) at 2px or more and 3:1 over what lies outside it. */
function rings(doc: Document, focused: Cascade, where: string): void {
  const stops = tabOrder(doc).filter((el) => focused.shown(el));
  expect(stops.length, where).toBeGreaterThan(0);
  for (const stop of stops) {
    const ringed = stop.matches('input[type="radio"]') ? (stop.closest(".choice-card") ?? stop) : stop;
    const outline = focused.value(ringed, ["outline"]) ?? "";
    const m = /^(\d+)px\s+solid\s+(.+)$/.exec(outline);
    expect(m, `${where}: ${label(ringed)}'s ring "${outline}"`).not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(2);
    const ring = colour(m?.[2] ?? "");
    if (!ring) throw new Error(`${where}: no ring colour at ${label(ringed)}`);
    const outside = focused.beneath(ringed.parentElement);
    expect(ratio(over(ring, outside), outside), `${where}: ${label(ringed)}'s ring`).toBeGreaterThanOrEqual(3);
  }
}

const BORDER = ["border", "border-color", "border-top", "border-top-color"];
const BORDER_BOTTOM = ["border", "border-color", "border-bottom", "border-bottom-color"];

/** Each element's border at 3:1 against what lies outside it. */
function borders(c: Cascade, els: readonly Element[], where: string, props = BORDER): void {
  expect(els.length, where).toBeGreaterThan(0);
  for (const el of els) {
    const v = c.value(el, props) ?? "";
    const b = colourIn(v);
    expect(b, `${where}: ${label(el)}'s border "${v}"`).not.toBeNull();
    const outside = c.beneath(el.parentElement);
    const r = ratio(over(b ?? { rgb: WHITE, a: 0 }, outside), outside);
    expect(r, `${where}: ${label(el)}'s border ${v} on ${show(outside)}`).toBeGreaterThanOrEqual(3);
  }
}

/** The ground: the root's background or the body's, the glass colour, opaque. */
function ground(doc: Document, c: Cascade, where: string): void {
  const own = c.background(doc.body) ?? c.background(doc.documentElement);
  expect(own, `${where}: the ground`).not.toBeNull();
  expect(own?.a, where).toBe(1);
  expect(own?.rgb, where).toEqual([16, 20, 26]);
  const scheme = c.value(doc.body, ["color-scheme"]) ?? c.value(doc.documentElement, ["color-scheme"]);
  expect(scheme, `${where}: color-scheme`).toBe("dark");
  expect(c.textColour(doc.body).rgb, `${where}: the text`).toEqual([255, 255, 255]);
}

// ---- The tokens ----

const rootTokens = (path: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const r of parseCss(read(path)).rules.filter((x) => x.selector.trim() === ":root"))
    for (const [k, v] of r.declarations) if (k.startsWith("--") && !out.has(k)) out.set(k, v);
  return out;
};

describe("the dark tokens (FR-015, Q9)", () => {
  it("holds dark.css's tokens equal to the room's own: room.css's and hud/split.css's :root", () => {
    const rule = parseCss(darkCss()).rules.find((r) => list(r.selector).includes(":root.dark-page"));
    expect(rule, "dark.css's token rule").toBeDefined();
    // The class is the root's on every dark page (index.html's own markup, rework N-4; the built pages' <html>), so no
    // rule of dark.css is keyed to the body's.
    for (const r of parseCss(darkCss()).rules)
      expect(r.selector, "a dark.css selector keyed to the body's class").not.toMatch(/body\.dark-page/);
    const room = rootTokens("src/room/room.css");
    const split = rootTokens("src/room/hud/split.css");
    for (const name of ["--glass", "--hud-text", "--accent-neon", "--hud-focus"]) {
      expect(room.get(name), name).toBeDefined();
      expect(rule?.declarations.get(name), name).toBe(room.get(name));
    }
    expect(split.get("--split-muted")).toBeDefined();
    expect(rule?.declarations.get("--split-muted")).toBe(split.get("--split-muted"));
    expect(rule?.declarations.get("color-scheme")).toBe("dark");
    expect(rule?.declarations.get("background")).toBe("rgb(var(--glass))");
    expect(rule?.declarations.get("color")).toBe("var(--hud-text)");
  });
});

// ---- The selection screen ----

/** The selection screen's sheets in the bundle's order: main.ts's style.css, app.ts's room.css, choice.ts's two; with
 *  a skin, its generated stylesheet where main.ts imports it, after style.css (spec 030, T-INT02: was appended last). */
const choiceSheets = (skin?: string): string[] => [
  read("src/style.css"),
  ...(skin ? [skin] : []),
  read("src/room/room.css"),
  darkCss(),
  read("src/choice/choice.css"),
];

async function screens(): Promise<[string, Document][]> {
  const empty = start();
  await flush();
  const one = start();
  await flush();
  radio(one.doc, "path", "engineer").click();
  const both = start();
  await flush();
  radio(both.doc, "path", "non-engineer").click();
  radio(both.doc, "avatar", "dinosaur").click();
  return [
    ["empty", empty.doc],
    ["step 1 chosen", one.doc],
    ["both chosen", both.doc],
  ];
}

describe("the selection screen, dark (FR-015 to FR-018)", () => {
  it("carries dark-page on index.html's own <html>, so the first paint is dark before any script (rework N-4)", () => {
    const doc = new JSDOM(read("index.html")).window.document;
    expect(doc.documentElement.classList.contains("dark-page")).toBe(true);
    expect(doc.body.classList.contains("dark-page")).toBe(false);
  });

  it("keeps dark-page on the root, not the body, while it shows, and takes it off at Enter (the room has its own look)", async () => {
    const v = start();
    await flush();
    expect(v.doc.documentElement.classList.contains("dark-page")).toBe(true);
    expect(v.doc.body.classList.contains("dark-page")).toBe(false);
    await enter(v);
    expect(v.room.visit.stage).not.toBe("choosing");
    expect(v.doc.documentElement.classList.contains("dark-page")).toBe(false);
    expect(v.doc.body.classList.contains("dark-page")).toBe(false);
  }, 60_000);

  it("draws the no-script fallback dark: the glass ground, its words and links at 4.5:1, links underlined", () => {
    // index.html as served, no script run: its heading, status line, and two links under the AI disclosure, with the
    // bundle's stylesheets (linked in the built page's <head>, so they apply without script).
    const doc = new JSDOM(read("index.html")).window.document;
    expect(doc.querySelector("#status"), "the fallback's status line").not.toBeNull();
    const c = cascade(choiceSheets());
    ground(doc, c, "no script");
    texts(doc, c, "no script");
    links(doc, c, "no script");
  });

  it("makes Enter group B's primary button by its class, a submit, disabled until both steps hold a choice", async () => {
    const v = start();
    await flush();
    const enterButton = button(v.doc, "Enter");
    expect(enterButton.classList.contains("choice-enter")).toBe(true);
    expect(enterButton.type).toBe("submit");
    expect(enterButton.disabled).toBe(true);
  }, 60_000);

  it("draws the cards from group B's tokens, each read with a fallback, so the screen holds without B's sheet", () => {
    const text = read("src/choice/choice.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const reads = [...text.matchAll(/var\(\s*(--btn-[\w-]+)\s*(,)?/g)];
    const names = new Set(reads.map((m) => m[1]));
    for (const name of ["--btn-frame", "--btn-chamfer", "--btn-secondary-selected-glow"])
      expect(names.has(name), name).toBe(true);
    for (const m of reads) expect(m[2], `${m[1]} without a fallback`).toBe(",");
    // No light colour of spec 029's left in the cards, the fieldsets, the outcome, or the hint.
    for (const light of ["#555555", "#3a3a3a", "#1a1a1a", "#f6f7f9", "#eceff4", "#e7effa", "#fbfaf6", "#0b4f9c"])
      expect(text.toLowerCase(), light).not.toContain(light);
  });

  for (const [skin, sheet] of [
    ["without group B's sheet", undefined],
    [`with B's built skin (${SKIN.id})`, SKIN.css],
  ] as const) {
    it(`gives the screen the glass ground, white text, and every text at 4.5:1, ${skin}`, async () => {
      for (const [name, doc] of await screens()) {
        if (sheet) doc.documentElement.setAttribute("data-skin", SKIN.id);
        for (const state of ["rest", "hover"] as const) {
          const c = cascade(choiceSheets(sheet), state);
          const where = `${name}, ${state}, ${skin}`;
          ground(doc, c, where);
          texts(doc, c, where);
        }
      }
    }, 60_000);

    it(`underlines its links at 4.5:1 and rings every Tab stop at 3:1 over the dark ground, ${skin}`, async () => {
      for (const [name, doc] of await screens()) {
        if (sheet) doc.documentElement.setAttribute("data-skin", SKIN.id);
        const c = cascade(choiceSheets(sheet));
        ground(doc, c, `${name}, ${skin}`);
        links(doc, c, `${name}, ${skin}`);
        rings(doc, cascade(choiceSheets(sheet), "focus"), `${name}, ${skin}`);
      }
    }, 60_000);

    it(`draws the steps, the cards, the outcome, and the chosen card's border at 3:1, ${skin}`, async () => {
      for (const [name, doc] of await screens()) {
        if (sheet) doc.documentElement.setAttribute("data-skin", SKIN.id);
        for (const state of ["rest", "hover"] as const) {
          const c = cascade(choiceSheets(sheet), state);
          const where = `${name}, ${state}, ${skin}`;
          ground(doc, c, where);
          borders(c, [...doc.querySelectorAll(".choice fieldset")], where);
          borders(c, [...doc.querySelectorAll(".choice-card, .choice-outcome")], where);
        }
      }
    }, 60_000);
  }

  it("keeps the AI disclosure in view and dark: sticky, opaque on the glass, its words at 4.5:1, its rule at 3:1", async () => {
    const v = start();
    await flush();
    const c = cascade(choiceSheets());
    const header = v.doc.querySelector("header.disclosure");
    if (!header) throw new Error("no disclosure");
    expect(c.value(header, ["position"])).toBe("sticky");
    expect(c.value(header, ["top"])).toBe("0");
    const bg = c.background(header);
    expect(bg?.a).toBe(1);
    expect(bg?.rgb).toEqual([16, 20, 26]);
    const p = header.querySelector("p");
    if (!p) throw new Error("no disclosure line");
    expect(ratio(c.textColour(p).rgb, c.beneath(p))).toBeGreaterThanOrEqual(4.5);
    borders(c, [header], "the disclosure", BORDER_BOTTOM);
  }, 60_000);
});

// ---- The two built pages ----

const CREDITS_MD = readFileSync(join(REPO, "assets/CREDITS.md"), "utf8");
const DISCLOSURE_MD = readFileSync(join(REPO, "docs/data-flow-disclosure.md"), "utf8");

function emitted(plugin: { generateBundle?: unknown }): Map<string, string> {
  const out = new Map<string, string>();
  const hook = plugin.generateBundle as unknown as (this: unknown) => void;
  hook.call({
    addWatchFile: () => undefined,
    emitFile: (f: { fileName: string; source: string }) => out.set(f.fileName, f.source),
  });
  return out;
}

const PAGES = [
  {
    name: "/credits/",
    html: (): string => renderCredits(CREDITS_MD),
    css: (): string => emitted(creditsPage({ source: join(REPO, "assets/CREDITS.md") })).get("credits/style.css") ?? "",
  },
  {
    name: "/disclosure/",
    html: (): string => renderDisclosure(DISCLOSURE_MD),
    css: (): string =>
      emitted(disclosurePage({ source: join(REPO, "docs/data-flow-disclosure.md") })).get("disclosure/style.css") ?? "",
  },
] as const;

describe("the credits and data-flow pages, dark (FR-015, FR-016)", () => {
  for (const page of PAGES) {
    it(`${page.name}: its style.css starts with dark.css, then layout rules alone, no colour of their own`, () => {
      const css = page.css();
      const dark = darkCss();
      expect(dark.length, "dark.css").toBeGreaterThan(0);
      expect(css.startsWith(dark), `${page.name}'s style.css starts with dark.css`).toBe(true);
      const layout = css.slice(dark.length).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(layout.trim().length).toBeGreaterThan(0);
      expect(layout).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(|\bcolor\s*:/);
    });

    it(`${page.name}: dark-page on <html>, the glass ground, every text and link at 4.5:1, links underlined`, () => {
      const doc = new JSDOM(page.html()).window.document;
      expect(doc.documentElement.classList.contains("dark-page")).toBe(true);
      const c = cascade([page.css()]);
      ground(doc, c, page.name);
      texts(doc, c, page.name);
      links(doc, c, page.name);
    });

    it(`${page.name}: the focus ring at 3:1, the header's rule at 3:1, the disclosure at its top`, () => {
      const doc = new JSDOM(page.html()).window.document;
      const c = cascade([page.css()]);
      ground(doc, c, page.name);
      rings(doc, cascade([page.css()], "focus"), page.name);
      const header = doc.querySelector("body > header");
      if (!header) throw new Error(`${page.name}: no header`);
      expect(header.textContent).toContain("You're talking with an AI representation of the Author, not the Author.");
      borders(c, [header], `${page.name}'s header`, BORDER_BOTTOM);
    });

    it(`${page.name}: keeps the header holding the AI disclosure in view as the page scrolls: sticky, opaque (Q77)`, () => {
      const doc = new JSDOM(page.html()).window.document;
      const c = cascade([page.css()]);
      const header = doc.querySelector("body > header");
      if (!header) throw new Error(`${page.name}: no header`);
      expect(c.value(header, ["position"]), `${page.name}'s header`).toBe("sticky");
      expect(c.value(header, ["top"]), `${page.name}'s header`).toBe("0");
      const bg = c.background(header);
      expect(bg?.a, `${page.name}'s header, opaque`).toBe(1);
      expect(bg?.rgb).toEqual([16, 20, 26]);
      // A control or an anchor scrolled into view stops below the header, not under it (WCAG 2.4.11): the root's scroll
      // padding at least the header's height at a phone's width, its paragraphs at line-height 1.5 (the disclosure on
      // three lines, each other paragraph, "Back to the room", on one) and their margins, collapsed between them.
      const pad = /^([\d.]+)rem$/.exec(c.value(doc.documentElement, ["scroll-padding-top"]) ?? "");
      expect(pad, `${page.name}: the root's scroll-padding-top, in rem`).not.toBeNull();
      const paragraphs = [...header.querySelectorAll(":scope > p")];
      expect(paragraphs.length, `${page.name}: the header's paragraphs`).toBeGreaterThan(0);
      const margin = /^([\d.]+)rem\b/.exec(c.value(paragraphs[0] ?? header, ["margin"]) ?? "");
      expect(margin, `${page.name}: the header's paragraphs' margin, in rem`).not.toBeNull();
      const lines = 3 + (paragraphs.length - 1);
      const height = lines * 1.5 + (paragraphs.length + 1) * Number(margin?.[1]);
      expect(Number(pad?.[1]), `${page.name}: the scroll padding against the header's ${height}rem`).toBeGreaterThan(
        height,
      );
    });
  }

  it("/disclosure/: the table's cells and header cells bordered at 3:1", () => {
    const page = PAGES[1];
    const doc = new JSDOM(page.html()).window.document;
    const c = cascade([page.css()]);
    ground(doc, c, "/disclosure/");
    const cells = [...doc.querySelectorAll("th, td")];
    expect(cells.length).toBeGreaterThan(10);
    borders(c, cells, "/disclosure/'s cells");
  });
});
