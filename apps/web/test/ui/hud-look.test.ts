// T024 (spec 014; FR-007, FR-008, FR-018, FR-021 to FR-025, FR-027, FR-028; SC-004; plan.md §3.2, §4, PD-8, PD-9): the
// HUD's look on the page. jsdom computes no style, so the cascade is read here from the room's stylesheets: for each HUD
// control in the column and dock layouts, the winning rule for its background by specificity and order, outside any
// at-rule. Every control is a tile on the dark glass, never the page's white base button, and the resume's panel keeps
// spec 005's document look; the notes are glass chips; the headings take the chalkboard's hand-lettered face and the
// figures the mono; no font, url(), or package is added; every transition sits under prefers-reduced-motion:
// no-preference, at most 150 ms; the stacked layout keeps the page's buttons; the fallbacks make the glass opaque; the
// column's log rests at --log-rest and scrolls; and the room sets the compact boxes' properties from compactBoxes.
import { describe, expect, it } from "vitest";

import { compactBoxes, logRestRem } from "../../src/room/compose/hud";
import { button, flush, intoRoom, matchesRule, parseCss, start, stubViewport, stylesheets } from "../helpers/room";
import type { Visit } from "../helpers/room";

interface Rule {
  readonly selector: string;
  readonly declarations: Map<string, string>;
  readonly order: number;
  readonly at: string | null;
}

/** Every rule of the room's stylesheets, one per selector of its list, with its order and its at-rule's prelude. */
const RULES: readonly Rule[] = (() => {
  const out: Rule[] = [];
  let order = 0;
  const add = (text: string, at: string | null): void => {
    const sheet = parseCss(text);
    for (const r of sheet.rules)
      for (const selector of r.selector.split(","))
        out.push({ selector: selector.trim(), declarations: r.declarations, order: order++, at });
    for (const a of sheet.atRules) add(a.body, a.prelude);
  };
  for (const s of stylesheets()) add(s.text, null);
  return out;
})();

/** A plain selector's specificity, as test/room/hud-contrast.test.ts counts it. */
function specificity(selector: string): [number, number, number] {
  let s = selector;
  const take = (re: RegExp): number => {
    const n = (s.match(re) ?? []).length;
    s = s.replace(re, " ");
    return n;
  };
  const attributes = take(/\[[^\]]*\]/g);
  const elements = take(/::[\w-]+/g);
  const pseudo = take(/:[\w-]+(\([^)]*\))?/g);
  const ids = take(/#[\w-]+/g);
  const classes = take(/\.[\w-]+/g);
  const types = take(/(^|[\s>+~])[a-zA-Z][\w-]*/g);
  return [ids, classes + attributes + pseudo, types + elements];
}

const before = (a: Rule, b: Rule): boolean => {
  const [x, y] = [specificity(a.selector), specificity(b.selector)];
  for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return a.order < b.order;
};

/** The winning declaration of a property for an element, outside every at-rule, by the cascade's specificity and
 *  order; pseudo-class states (:hover, :focus-visible, :active) are left out. */
function winning(el: Element, property: string): string | undefined {
  let best: Rule | null = null;
  for (const r of RULES) {
    if (r.at !== null || !r.declarations.has(property) || /:(hover|focus|active|focus-visible)/.test(r.selector))
      continue;
    if (!matchesRule(el, r.selector)) continue;
    if (best === null || before(best, r)) best = r;
  }
  return best?.declarations.get(property);
}

const TILE_FACES = new Set(["var(--tile-face)", "rgb(var(--glass) / var(--glass-alpha))"]);

async function room(screen: { w: number; h: number }): Promise<Visit> {
  const viewport = stubViewport(screen);
  const v = start({ webgl: true, viewport: viewport.factory });
  await intoRoom(v);
  return v;
}

/** The HUD's controls: the bar's, the list's, the conversation's, the walking control, and the full-screen control. */
const controls = (v: Visit): Element[] => [
  ...v.doc.querySelectorAll(".hud-bar button, .hud-bar a, .room-list button, .talk button, .room-walk"),
];

describe("every HUD control a tile (spec 014, T024; FR-022)", () => {
  for (const [layout, screen] of [
    ["column", { w: 1920, h: 1200 }],
    ["dock", { w: 390, h: 844 }],
  ] as const)
    it(`gives every control the tile's face in the ${layout} layout, never the page's white button`, async () => {
      const v = await room(screen);
      expect(v.doc.documentElement.getAttribute("data-hud")).toBe(layout);
      const all = controls(v);
      expect(all.length).toBeGreaterThan(8);
      for (const el of all) {
        const name = `${el.tagName.toLowerCase()}.${el.className}: ${el.textContent?.trim().slice(0, 30) ?? ""}`;
        const face = winning(el, "background");
        expect(TILE_FACES.has(face ?? ""), `${name}: ${face ?? "none"}`).toBe(true);
        expect(winning(el, "color"), name).toBe("var(--hud-text)");
      }
      // The list's buttons and the conversation's take the tile's border and radius too.
      for (const el of v.doc.querySelectorAll(".room-list li button, .talk-row button")) {
        expect(winning(el, "border"), el.className).toBe("1px solid var(--tile-border)");
        expect(winning(el, "border-radius"), el.className).toBe("0.5rem");
      }
    });

  it("keeps the resume's panel spec 005's white document, its buttons the page's", async () => {
    const v = await room({ w: 1920, h: 1200 });
    button(v.doc, "Resume").click();
    const panel = v.doc.querySelector(".resume-panel");
    expect(panel).not.toBeNull();
    expect(winning(panel as Element, "background")).toBe("#ffffff");
    for (const el of panel?.querySelectorAll("button") ?? []) expect(winning(el, "background")).toBe("#ffffff");
  });

  it("keeps the page's buttons in the stacked layout: no tile rule names it", () => {
    for (const r of RULES)
      if (r.declarations.get("background") === "var(--tile-face)")
        expect(r.selector.includes('data-hud="stacked"'), r.selector).toBe(false);
  });
});

describe("the notes, the type, and the motion (spec 014, T024; FR-023, FR-024, FR-027, FR-028)", () => {
  it("makes the notes glass chips with light words that let a pointer through", async () => {
    const v = await room({ w: 1920, h: 1200 });
    for (const el of v.doc.querySelectorAll(".room-note")) {
      expect(winning(el, "background")).toBe("var(--chip-face)");
      expect(winning(el, "color")).toBe("var(--hud-text)");
    }
    const root = RULES.find((r) => r.selector === ":root" && r.declarations.has("--chip-face"));
    expect(root?.declarations.get("--chip-face")).toBe("rgb(var(--glass) / var(--glass-alpha))");
    const notes = v.doc.querySelector(".room-notes");
    expect(notes ? winning(notes, "pointer-events") : undefined).toBe("none");
  });

  it("sets the headings in the chalkboard's face and the figures in the mono, from the site's own fonts", async () => {
    const v = await room({ w: 1920, h: 1200 });
    const heading = v.doc.querySelector(".room-list-heading");
    const talkHead = v.doc.querySelector(".talk-head");
    expect(heading ? winning(heading, "font-family") : undefined).toBe("var(--heading-font)");
    expect(talkHead ? winning(talkHead, "font-family") : undefined).toBe("var(--heading-font)");
    const counter = v.doc.querySelector(".talk-counter");
    expect(counter ? winning(counter, "font-family") : undefined).toBe("var(--figure-font)");
    const root = RULES.find((r) => r.selector === ":root" && r.declarations.has("--heading-font"));
    expect(root?.declarations.get("--heading-font")).toBe('"Patrick Hand", cursive');
    expect(root?.declarations.get("--figure-font")).toBe('"IBM Plex Mono", ui-monospace, monospace');
    // No font, image, or package of its own: the faces are src/fonts.css's.
    for (const s of stylesheets().filter((x) => !x.path.endsWith("fonts.css"))) {
      expect(s.text.includes("@font-face"), s.path).toBe(false);
      expect(/url\(/.test(s.text.replace(/\/\*[\s\S]*?\*\//g, "")), s.path).toBe(false);
    }
  });

  it("puts every HUD transition under prefers-reduced-motion: no-preference, each at most 150 ms", () => {
    const withTransition = RULES.filter((r) => r.declarations.has("transition") && /room|hud|talk/.test(r.selector));
    expect(withTransition.length).toBeGreaterThan(0);
    for (const r of withTransition) {
      expect(r.at, r.selector).toBe("@media (prefers-reduced-motion: no-preference)");
      for (const ms of (r.declarations.get("transition") ?? "").match(/\d+ms/g) ?? [])
        expect(Number.parseInt(ms, 10), r.selector).toBeLessThanOrEqual(150);
    }
  });

  it("names the neon's warm accent for hover and selection, beside spec 005's yellow focus ring", () => {
    const root = RULES.find((r) => r.selector === ":root" && r.declarations.has("--accent-neon"));
    expect(root?.declarations.get("--accent-neon")).toMatch(/^#[0-9a-f]{6}$/);
    expect(root?.declarations.get("--hud-focus")).toBe("#ffd23f");
    const hover = RULES.filter((r) => /\.room button:hover$/.test(r.selector) && r.declarations.has("border-color"));
    expect(hover.length).toBeGreaterThan(0);
    for (const r of hover) expect(r.declarations.get("border-color")).toBe("var(--accent-neon)");
    const current = RULES.filter(
      (r) => /\[aria-current="true"\]$/.test(r.selector) && r.declarations.has("border-color"),
    );
    expect(current.length).toBeGreaterThan(0);
  });
});

describe("the compact column's properties and the log at rest (spec 014, T024; FR-018, FR-021)", () => {
  it("sets --strip-x, --strip-w, --bar-w, --column-h, and --log-rest from compactBoxes", async () => {
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 1280, h: 720 },
    ]) {
      const v = await room(screen);
      const root = v.doc.documentElement;
      const c = compactBoxes(screen);
      expect(root.style.getPropertyValue("--strip-x")).toBe(`${c.strip.x}px`);
      expect(root.style.getPropertyValue("--strip-w")).toBe(`${c.strip.w}px`);
      expect(root.style.getPropertyValue("--bar-w")).toBe(`${c.bar.w}px`);
      expect(root.style.getPropertyValue("--column-h")).toBe(`${c.column?.h ?? 0}px`);
      expect(root.style.getPropertyValue("--log-rest")).toBe(`${logRestRem(screen) * 16}px`);
    }
  });

  it("opens the larger view only on its control's press", async () => {
    const v = await room({ w: 1920, h: 1200 });
    const talk = v.doc.querySelector(".talk");
    const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
    if (!box) throw new Error("no text box");
    box.value = "Hello";
    button(v.doc, "Send").click();
    await flush();
    expect(talk?.getAttribute("data-larger")).toBe("off");
    button(v.doc, "Larger conversation").click();
    expect(talk?.getAttribute("data-larger")).toBe("on");
  });
});
