// T024 (spec 014; FR-007, FR-008, FR-018, FR-021 to FR-025, FR-027, FR-028; SC-004; plan.md §3.2, §4, PD-8, PD-9): the
// HUD's look on the page. jsdom computes no style, so the cascade is read here from the room's stylesheets: for each HUD
// control in the column and dock layouts, the winning rule for its background by specificity and order, outside any
// at-rule. Every control is a tile on the dark glass, never the page's white base button, and the resume's panel keeps
// spec 005's document look; the notes are glass chips; the headings take the slate's hand-lettered face and the
// figures the mono; no font, url(), or package is added; every transition sits under prefers-reduced-motion:
// no-preference, at most 150 ms; the stacked layout keeps the page's buttons; the fallbacks make the glass opaque; the
// column's log rests at --log-rest and scrolls; and the room sets the compact boxes' properties from compactBoxes.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readSkins, resolveSkin } from "../../build/ui-skins";
import { DEFAULT_METRICS, OPENING, compactBoxes, hudBoxes, logRestRem } from "../../src/room/compose/hud";
import { flatProtectorFor } from "../../src/room/compose/protect";
import {
  button,
  flush,
  intoRoom,
  matchesRule,
  parseCss,
  roomIndex,
  start,
  stubViewport,
  stylesheets,
} from "../helpers/room";
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

/** The rules of room.css and talk.css alone, the HUD's own stylesheets. */
const HUD_RULES: readonly Rule[] = (() => {
  const out: Rule[] = [];
  const add = (text: string, at: string | null): void => {
    const sheet = parseCss(text);
    for (const r of sheet.rules)
      for (const selector of r.selector.split(","))
        out.push({ selector: selector.trim(), declarations: r.declarations, order: 0, at });
    for (const a of sheet.atRules) add(a.body, a.prelude);
  };
  for (const s of stylesheets().filter((x) => /(room|talk)\.css$/.test(x.path))) add(s.text, null);
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

// Spec 030 (T-INT02b, found by impl-b.md's T-B01 (d); Q73's form): the page the build serves names its skin on the
// root (data-skin, build/ui-skins.ts), so the two layouts' cases and the resume's below set it as the build does, to
// the skin content/ui-skins.yaml's `active` resolves to (resolveSkin: `metal`, the image skin's fallback, while its
// files aren't in the tree; T-INT02, rv-int-030's nit 1: was `active` itself, `metal-image`), and read the skin's
// controls by the cascade of the whole selector list.
const SKINS_YAML = join(dirname(fileURLToPath(import.meta.url)), "../../content/ui-skins.yaml");
const ACTIVE_SKIN = existsSync(SKINS_YAML) ? resolveSkin(readSkins(readFileSync(SKINS_YAML, "utf8"))).id : "";

/** Spec 030's skinned controls among the HUD's (Q5; spec.md FR-008), and its one primary (Q6). */
const SKINNED =
  '.hud-bar .hud-tile, .room-walk, .room-eat, .split-back, .split-hint, .resume-close, .talk-larger, .talk-log-toggle, .talk-form button[type="submit"]';
const PRIMARY = '.talk-form button[type="submit"]';

/** Splits a selector list at its top-level commas (none inside :is(), :not(), or an attribute's brackets). */
function topLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < list.length; i += 1) {
    const ch = list[i];
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) {
      out.push(list.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(list.slice(from).trim());
  return out;
}

/** One complex selector's specificity, :is(), :not(), and :has() taking their most specific argument's, :where()
 *  none (Selectors 4, §17); the rest counted as specificity() counts it. */
function fullSpecificity(selector: string): [number, number, number] {
  const sum: [number, number, number] = [0, 0, 0];
  let rest = "";
  for (let i = 0; i < selector.length;) {
    const m = /^:(is|not|has|where)\(/.exec(selector.slice(i));
    if (!m) {
      rest += selector[i];
      i += 1;
      continue;
    }
    const open = i + m[0].length;
    let depth = 1;
    let j = open;
    while (j < selector.length && depth > 0) {
      if (selector[j] === "(") depth += 1;
      else if (selector[j] === ")") depth -= 1;
      j += 1;
    }
    if (m[1] !== "where") {
      let best: [number, number, number] = [0, 0, 0];
      for (const arg of topLevel(selector.slice(open, j - 1))) {
        const s = fullSpecificity(arg);
        if (s[0] > best[0] || (s[0] === best[0] && (s[1] > best[1] || (s[1] === best[1] && s[2] > best[2])))) best = s;
      }
      for (let k = 0; k < 3; k += 1) sum[k] = (sum[k] ?? 0) + (best[k] ?? 0);
    }
    rest += " ";
    i = j;
  }
  const own = specificity(rest);
  return [sum[0] + own[0], sum[1] + own[1], sum[2] + own[2]];
}

interface ListRule {
  readonly selector: string;
  readonly specificity: [number, number, number];
  readonly declarations: Map<string, string>;
  readonly order: number;
}

/** Every rule of the room's stylesheets outside any at-rule, one per selector of its list split at the top level. */
const LIST_RULES: readonly ListRule[] = (() => {
  const out: ListRule[] = [];
  let order = 0;
  for (const s of stylesheets())
    for (const r of parseCss(s.text).rules)
      for (const selector of topLevel(r.selector))
        out.push({ selector, specificity: fullSpecificity(selector), declarations: r.declarations, order: order++ });
  return out;
})();

/** The winning declaration among `properties` (a longhand and the shorthands that set it) for an element, or for its
 *  ::before with `before`, by specificity and order; the pseudo-class states (:hover, :focus, :active) left out. */
function cascaded(el: Element, properties: readonly string[], before = false): string | undefined {
  const outranks = (a: ListRule, b: ListRule): boolean => {
    for (let k = 0; k < 3; k += 1)
      if (a.specificity[k] !== b.specificity[k]) return (a.specificity[k] ?? 0) > (b.specificity[k] ?? 0);
    return a.order > b.order;
  };
  let best: { rule: ListRule; value: string } | null = null;
  for (const rule of LIST_RULES) {
    if (/:(hover|focus|active)/.test(rule.selector)) continue;
    const ending = /(::[\w-]+|:before|:after)$/.exec(rule.selector)?.[1];
    if (before ? ending !== "::before" && ending !== ":before" : ending !== undefined) continue;
    const property = properties.find((p) => rule.declarations.has(p));
    if (property === undefined) continue;
    let matches: boolean;
    try {
      matches = el.matches(ending === undefined ? rule.selector : rule.selector.slice(0, -ending.length));
    } catch {
      matches = false;
    }
    if (matches && (best === null || outranks(rule, best.rule)))
      best = { rule, value: rule.declarations.get(property) ?? "" };
  }
  return best?.value;
}

/** A value with its private custom property (`var(--_x)`) taken from the control's own winner for it. */
function throughPrivate(el: Element, value: string | undefined): string | undefined {
  const m = /^var\((--_[\w-]+)\)$/.exec(value ?? "");
  return m?.[1] === undefined ? value : cascaded(el, [m[1]]);
}

describe("every HUD control a tile (spec 014, T024; FR-022)", () => {
  // Spec 030 (T-INT02b; was: every control the tile's face, `var(--hud-text)`, and the tile's border, on a page with
  // no data-skin): with the root's data-skin the build's, every skinned control (Q5) paints nothing itself and takes
  // the skin's tokens by the cascade, its label, its face (on its ::before), and its border's line, the variant's
  // (Q6), in the state it rests in; every other control keeps spec 014's tile.
  for (const [layout, screen] of [
    ["column", { w: 1920, h: 1200 }],
    ["dock", { w: 390, h: 844 }],
  ] as const)
    it(`gives every skinned control the built skin's tokens in the ${layout} layout, the rest the tile's face`, async () => {
      const v = await room(screen);
      v.doc.documentElement.setAttribute("data-skin", ACTIVE_SKIN || "none-built");
      expect(v.doc.documentElement.getAttribute("data-hud")).toBe(layout);
      const all = controls(v);
      expect(all.length).toBeGreaterThan(8);
      // Spec 018 (FR-007, FR-008; plan.md D-I3): in the split layout the list's entries and the conversation's title are text on the glass, not tiles.
      const split = v.doc.documentElement.getAttribute("data-split") === "on";
      let skinned = 0;
      for (const el of all) {
        if (split && (el.closest(".room-list li") || el.classList.contains("talk-log-toggle"))) continue;
        const name = `${el.tagName.toLowerCase()}.${el.className}: ${el.textContent?.trim().slice(0, 30) ?? ""}`;
        if (el.matches(SKINNED)) {
          skinned += 1;
          const variant = el.matches(PRIMARY) ? "primary" : "secondary";
          const token = (what: string): RegExp =>
            new RegExp(`^var\\(--btn-${variant}-(normal|selected|disabled)-${what}\\)$`);
          expect(throughPrivate(el, cascaded(el, ["color"])), `${name}: label`).toMatch(token("label"));
          expect(throughPrivate(el, cascaded(el, ["background-color"], true)), `${name}: face`).toMatch(token("face"));
          expect(cascaded(el, ["--_border"]), `${name}: border's line`).toMatch(token("border"));
          expect(cascaded(el, ["background-color", "background"]), `${name}: its own background`).toBe("transparent");
          expect(cascaded(el, ["border-color", "border"]), `${name}: its own border`).toBe("transparent");
          expect(cascaded(el, ["border-radius"]), `${name}: radius`).toBe("var(--btn-radius)");
          continue;
        }
        const face = cascaded(el, ["background"]);
        expect(TILE_FACES.has(face ?? ""), `${name}: ${face ?? "none"}`).toBe(true);
        expect(cascaded(el, ["color"]), name).toBe("var(--hud-text)");
      }
      expect(skinned, "the skinned controls found").toBeGreaterThan(6);
      // The list's buttons and the conversation's that the skin leaves take the tile's border and radius too.
      for (const el of v.doc.querySelectorAll(split ? ".talk-row button" : ".room-list li button, .talk-row button")) {
        if (el.matches(SKINNED)) continue;
        expect(cascaded(el, ["border"]), el.className).toBe("1px solid var(--tile-border)");
        expect(cascaded(el, ["border-radius"]), el.className).toBe("0.5rem");
      }
      expect(ACTIVE_SKIN, "content/ui-skins.yaml's active skin").not.toBe("");
    });

  // Spec 030 (T-INT02; Q73; spec.md's Amendments, R-7; was "… its buttons the page's": the panel's `background` and
  // each of its buttons' `background` `#ffffff`, by winning(), with no data-skin): with the root's data-skin the build's
  // and the resume's view rendered, the panel stays spec 005's white document; its "Close" is the skin's secondary
  // button by the cascade, as the column's controls above are; its PDF link and its items keep the page's look.
  it("keeps the resume's panel spec 005's white document, its Close the skin's secondary button, the rest the page's", async () => {
    const v = await room({ w: 1920, h: 1200 });
    v.doc.documentElement.setAttribute("data-skin", ACTIVE_SKIN || "none-built");
    button(v.doc, "Resume").click();
    // The resume's view renders once its room-data.json has loaded.
    await flush();
    const panel = v.doc.querySelector(".resume-panel");
    if (!panel) throw new Error("no resume panel");
    expect(winning(panel, "background")).toBe("#ffffff");
    const close = panel.querySelector(".resume .resume-close");
    if (!close) throw new Error("no Close in the resume panel");
    expect(close.matches(SKINNED), "Close is a skinned control (Q5)").toBe(true);
    const token = (what: string): RegExp => new RegExp(`^var\\(--btn-secondary-normal-${what}\\)$`);
    expect(throughPrivate(close, cascaded(close, ["color"])), "Close: label").toMatch(token("label"));
    expect(throughPrivate(close, cascaded(close, ["background-color"], true)), "Close: face").toMatch(token("face"));
    expect(cascaded(close, ["--_border"]), "Close: border's line").toMatch(token("border"));
    expect(cascaded(close, ["background-color", "background"]), "Close: its own background").toBe("transparent");
    expect(cascaded(close, ["border-color", "border"]), "Close: its own border").toBe("transparent");
    expect(cascaded(close, ["border-radius"]), "Close: radius").toBe("var(--btn-radius)");
    // The PDF link, which shares 002's rule with "Close", and an item as resume/view.ts marks one: the page's, no token
    // of the skin's or the component's.
    const pdf = panel.querySelector(".resume .resume-pdf");
    if (!pdf) throw new Error("no PDF link in the resume panel");
    const list = v.doc.createElement("ul");
    list.className = "resume-items";
    const item = v.doc.createElement("button");
    item.type = "button";
    list.append(v.doc.createElement("li"));
    list.firstElementChild?.append(item);
    panel.append(list);
    for (const [el, name] of [
      [pdf, "the PDF link"],
      [item, "an item"],
    ] as const) {
      expect(el.matches(SKINNED), `${name}: not skinned`).toBe(false);
      for (const properties of [["color"], ["background-color", "background"], ["border-color", "border"]])
        expect(cascaded(el, properties) ?? "", `${name}: ${properties[0] ?? ""}`).not.toMatch(/--btn-|--_/);
    }
    expect(cascaded(item, ["background-color", "background"]), "an item: the page's white button").toBe("#ffffff");
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

  it("sets the headings in the hand-lettered face and the figures in the mono, from the site's own fonts", async () => {
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
    // The HUD's stylesheets, room.css and talk.css; spec 012's loader card keeps its own fade, which this spec leaves.
    const withTransition = HUD_RULES.filter(
      (r) => r.declarations.has("transition") && !/^none\b/.test(r.declarations.get("transition") ?? ""),
    );
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
    // T053 (the review's I3): the hover names the HUD's own buttons.
    const hover = RULES.filter(
      (r) => /\.hud-panels button:hover$/.test(r.selector) && r.declarations.has("border-color"),
    );
    expect(hover.length).toBeGreaterThan(0);
    for (const r of hover) expect(r.declarations.get("border-color")).toBe("var(--accent-neon)");
    const current = RULES.filter(
      (r) => /\[aria-current="true"\]$/.test(r.selector) && r.declarations.has("border-color"),
    );
    expect(current.length).toBeGreaterThan(0);
  });
});

describe("the compact column's properties and the log at rest (spec 014, T024; FR-018, FR-021)", () => {
  it("sets --strip-x, --strip-w, --bar-w, --column-h, and --log-rest from compactBoxes, the room's wall included (spec 028)", async () => {
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 1280, h: 720 },
      { w: 1024, h: 600 },
    ]) {
      const v = await room(screen);
      const root = v.doc.documentElement;
      // Spec 028 (T-A03; plan.md §R-B8): the room's compact boxes take its wall, the 2D drawing's before a stage frames
      // the room (the fake stage has no protector), so 1920 × 1200 and 1280 × 720 take the split layout.
      const c = compactBoxes(screen, OPENING, DEFAULT_METRICS, { wall: flatProtectorFor(roomIndex()) });
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

// T053 (spec 014; the Author's answer of 2026-11-10, "Move the walk control (Recommended)"; the review's I3): the
// walking control at the column's head, by the CSS properties the room sets from compose/hud.ts's compactBoxes, its
// DOM place, and so the Tab order, unchanged; its own glass hover, only where the pointer hovers, so a tap leaves none;
// and the hover and selection rules scoped to the HUD's own buttons, so the resume keeps its document's look (FR-022).
describe("the walking control at the column's head, and the hover's scope (spec 014, T053)", () => {
  const px = (v: Visit, name: string): number => Number.parseFloat(v.doc.documentElement.style.getPropertyValue(name));
  const ROOM_RULES = (() => {
    const out: Rule[] = [];
    const add = (text: string, at: string | null): void => {
      const sheet = parseCss(text);
      for (const r of sheet.rules)
        for (const selector of r.selector.split(","))
          out.push({ selector: selector.trim(), declarations: r.declarations, order: 0, at });
      for (const a of sheet.atRules) add(a.body, a.prelude);
    };
    for (const sheet of stylesheets().filter((x) => /room\.css$/.test(x.path))) add(sheet.text, null);
    return out;
  })();

  it("places the control at the column's head on a wide window, and in the clear area's corner on a phone (spec 028: the room's wall)", async () => {
    const wide = await room({ w: 1920, h: 1200 });
    const c = compactBoxes({ w: 1920, h: 1200 }, OPENING, DEFAULT_METRICS, { wall: flatProtectorFor(roomIndex()) });
    expect(wide.doc.documentElement.getAttribute("data-walk-place")).toBe("column");
    expect(px(wide, "--walk-x")).toBeCloseTo(c.walk.x, 3);
    expect(px(wide, "--walk-y")).toBeCloseTo(c.walk.y, 3);
    const rule = ROOM_RULES.find((r) => r.selector === 'html[data-hud="column"][data-walk-place="column"] .room-walk');
    expect(rule?.declarations.get("left")).toBe("calc(var(--walk-x) - var(--clear-x))");
    expect(rule?.declarations.get("top")).toBe("calc(var(--walk-y) - var(--clear-y))");
    expect(rule?.declarations.get("right")).toBe("auto");
    expect(rule?.declarations.get("bottom")).toBe("auto");
    // Its DOM place is spec 008's, in the clear box after the notes, so the Tab order is unchanged (FR-062).
    expect(wide.doc.querySelector(".room-clear > .room-walk")).not.toBeNull();
    const phone = await room({ w: 390, h: 844 });
    expect(phone.doc.documentElement.getAttribute("data-walk-place")).toBe("stage");
  });

  // T053's second review: the larger conversation's sheet is positioned in the panels' box, which spec 014 made the
  // compact column; it still opens as spec 005 drew it (its FR-028), from the notes' foot to 3.75rem above the bar,
  // what the visitor opens counting for no HUD box (FR-019). Its box, from the rule's declarations and the room's
  // properties, over the column's compact box, its containing block.
  it("opens the larger conversation as tall as spec 005 drew it, above the compact column (spec 028: at a column window without the split)", async () => {
    // Spec 028 (T-A03; plan.md §R-B8): 1920 × 1200 takes the split layout, which has no larger view (its FR-003);
    // 1024 × 600 keeps the column layout.
    const screen = { w: 1024, h: 600 };
    const v = await room(screen);
    const root = v.doc.documentElement;
    const rule = ROOM_RULES.find((r) => r.selector === 'html[data-hud="column"] .talk[data-larger="on"] .talk-sheet');
    const value = (expr: string): number => {
      const resolved = expr.replace(/var\((--[\w-]+)\)/g, (_, name: string) => root.style.getPropertyValue(name));
      const terms = resolved
        .replace(/^calc\((.*)\)$/, "$1")
        .replace(/px/g, "")
        .replace(/rem/g, "*16");
      if (!/^[\d.\s+*-]+$/.test(terms)) throw new Error(`not a sum: ${expr}`);
      return terms
        .split(/\s+(?=[+-]\s)/)
        .map((t) => t.trim())
        .reduce((n, t) => {
          const sign = t.startsWith("-") ? -1 : 1;
          const body = t.replace(/^[+-]\s*/, "");
          const [a, b] = body.split("*").map(Number);
          return n + sign * (a ?? 0) * (b ?? 1);
        }, 0);
    };
    const c = compactBoxes(screen);
    const bands = hudBoxes(screen);
    if (!c.column || !rule) throw new Error("no column or no rule");
    const top = c.column.y + value(rule.declarations.get("top") ?? "");
    const bottom = c.column.y + c.column.h - value(rule.declarations.get("bottom") ?? "");
    const notes = Number.parseFloat(root.style.getPropertyValue("--notes-h"));
    expect(top).toBeCloseTo(bands.clear.y + notes, 3);
    expect(bottom).toBeCloseTo(bands.bar.y - 60, 3);
    expect(bottom - top).toBeGreaterThan(0.6 * screen.h);
  });

  // Spec 030 (T-INT02; Q73; was: room.css's `html[data-hud="{column,dock}"] .room-walk:hover`, its background the glass
  // at --glass-alpha-lit and its border the neon's accent): the walking control is the skin's secondary button, whose
  // hover is ui/button.css's, under (hover: hover), the skin's hover tokens; room.css names no hover of its own for it.
  it("gives the control the skin's hover, and every hover rule only where the pointer hovers", () => {
    const hovers = ROOM_RULES.filter((r) => /:hover\b/.test(r.selector));
    expect(hovers.length).toBeGreaterThan(0);
    // The fallbacks for forced colours and reduced transparency undo a hover where it shows, so they sit in their own
    // blocks (T053's second review); every hover that adds a look is under (hover: hover).
    for (const r of hovers)
      if (!/forced-colors|prefers-reduced-transparency/.test(r.at ?? ""))
        expect(r.at, r.selector).toBe("@media (hover: hover)");
    expect(hovers.filter((r) => r.selector.includes(".room-walk")).map((r) => r.selector)).toEqual([]);
    const component = stylesheets().find((s) => s.path.endsWith(join("ui", "button.css")));
    if (!component) throw new Error("no ui/button.css");
    const media = parseCss(component.text).atRules.find((a) => a.prelude === "@media (hover: hover)");
    const hover = parseCss(media?.body ?? "").rules.find((r) =>
      topLevel(r.selector).some((s) => s.includes(".room-walk") && s.endsWith(":hover")),
    );
    expect(hover?.declarations.get("--_face")).toBe("var(--btn-secondary-hover-face)");
    expect(hover?.declarations.get("--_border")).toBe("var(--btn-secondary-hover-border)");
  });

  it("scopes the hover and selection rules to the HUD's own buttons", () => {
    for (const r of ROOM_RULES.filter((x) => /:hover\b|\[aria-current="true"\]/.test(x.selector)))
      expect(/\.(hud-panels|hud-bar|room-offer|room-walk)\b/.test(r.selector), r.selector).toBe(true);
  });

  it("leaves the resume's selected item and its hover to resume.css (FR-022)", async () => {
    const v = await room({ w: 1920, h: 1200 });
    button(v.doc, "Resume").click();
    // A selected item as resume/view.ts marks one, in the open panel (the default content holds no items).
    const panel = v.doc.querySelector(".resume-panel");
    if (!panel) throw new Error("no resume panel");
    const list = v.doc.createElement("ul");
    list.className = "resume-items";
    const item = v.doc.createElement("button");
    item.type = "button";
    item.setAttribute("aria-current", "true");
    list.append(v.doc.createElement("li"));
    list.firstElementChild?.append(item);
    panel.append(list);
    expect(winning(item, "background")).toBe("#eef4fb");
    expect(winning(item, "border-color")).toBe("#0b4f9c");
    for (const r of ROOM_RULES.filter((x) => /:hover\b/.test(x.selector)))
      expect(matchesRule(item, r.selector.replace(/:hover\b/g, "")), r.selector).toBe(false);
  });
});
