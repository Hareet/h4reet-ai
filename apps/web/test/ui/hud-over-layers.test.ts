// rework2-029a (spec 029, group A; rv-029a-1's R-1 and R-2; FR-003, SC-002; plan.md §R-A3, §R-A4): every text and
// mark a part over the room draws, judged over what really lies beneath it. hud-over-contrast.test.ts's pairs() puts
// every plate on the 0.3 glass and has no key cap; the review found the split layout's title row a lone plate over the
// room (R-1) and the 12 px key caps under 4.5:1 (R-2). So this file takes the backdrop from the stylesheets themselves,
// on the real room's DOM (test/helpers/room.ts), walking, with a conversation open and the "Eat" tile offered, at his
// three windows (the split layout), 1280 × 720 (the column layout), and a phone's 390 × 844 (the dock):
//
// - The rules: room.css, talk.css, and hud/split.css, the order the page loads them (app.ts imports room.css first,
//   then talk.ts's and split.ts's sheets), their top-level rules only (the last section, pulse-029a's, also reads the
//   at-rules and keyframes, for the waiting status's pulse), the state with none of the visitor's asks
//   (FR-004's opaque state is hud-over-contrast.test.ts's). Each property's value is the cascade's: !important, then
//   specificity, then order; the style attribute above them (layout.ts sets the --wall-* sizes there). var() resolves
//   through the custom properties each element inherits, so a part's --split-glass-alpha is the over-room one where it
//   is marked. A `button` no rule gives a background has the browser's ButtonFace, a text box its Field (white).
// - The layers under a run of words: its element's background and each ancestor's up to the marked part, the part's
//   own included (none for `display: contents`), the outermost marked part where one holds another (the column's
//   sheet, in flow in the marked column, takes the column's glass); then the room, as pure white and pure black, the brightest and
//   darkest pixel it can put beneath. In the split layout's panel the frame's fill lies under every row but the title
//   row: split.css sets it from the title row's foot (`top: var(--wall-title-h)`) under the panel's rows. That is the
//   paint order group B's S-1 fix sets (its paint-order test holds it); until it merges, the frame paints over the
//   sheet's rows (impl-a.md, for the integration).
// - Text: 4.5:1, or 3:1 at 24 px or more (bold not counted, so the floor is never too low). Marks, 3:1: each focus ring
//   over what lies beneath it (inside the control if its offset puts it there, else outside, on the control's own
//   spread shadow where that reaches past the ring, else on its parent's layers; and where the ring's band leaves its
//   parent's box, judged over what lies beyond the parent, rework3-029a's RR-1); each border (a key cap's, a tile's)
//   against the colour on either side of it; each icon's and stroke's paint. The panel's drawn frame is a layer, not a
//   mark. Disabled controls (aria-disabled) are exempt, as WCAG has it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { flatProtectorFor } from "../../src/room/compose/protect";
import { button, enter, flush, parseCss, roomIndex, start, stubViewport, throughLoader } from "../helpers/room";
import type { Visit } from "../helpers/room";

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const SHEETS = ["../../src/room/room.css", "../../src/talk/talk.css", "../../src/room/hud/split.css"];

// ---- The cascade, as far as these sheets need it ----

/** Splits a selector list at its top-level commas. */
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
const RULES: Rule[] = SHEETS.flatMap((p) => parseCss(read(p)).rules).flatMap((r) =>
  list(r.selector).map((selector) => ({ selector, spec: specificity(selector), order: 0, decls: r.declarations })),
);
RULES.forEach((r, i) => ((r as { order: number }).order = i));

const STATE = /:(?:hover|active|focus|focus-visible|focus-within)\b|::/;
function matches(el: Element, selector: string, focused: boolean): boolean {
  let s = selector;
  if (focused && s.endsWith(":focus-visible")) s = s.slice(0, -":focus-visible".length);
  if (STATE.test(s)) return false;
  try {
    return el.matches(s);
  } catch {
    return false;
  }
}

const inline = (el: Element): Map<string, string> => {
  const out = new Map<string, string>();
  for (const part of (el.getAttribute("style") ?? "").split(";")) {
    const c = part.indexOf(":");
    if (c > 0) out.set(part.slice(0, c).trim(), part.slice(c + 1).trim());
  }
  return out;
};

/** The cascade's winner among `props` (a shorthand and its longhand compete as declared) on an element, over `rules`
 *  (the top-level rules unless a caller passes those of a media state, as the pulse's cases below do). */
function declared(
  el: Element,
  props: readonly string[],
  focused = false,
  rules: readonly Rule[] = RULES,
): { prop: string; value: string } | null {
  let best: { prop: string; value: string; key: [number, Spec, number] } | null = null;
  const consider = (prop: string, raw: string, spec: Spec, order: number): void => {
    const important = /!important\s*$/.test(raw) ? 1 : 0;
    const value = raw.replace(/!important\s*$/, "").trim();
    const key: [number, Spec, number] = [important, spec, order];
    if (
      !best ||
      key[0] > best.key[0] ||
      (key[0] === best.key[0] &&
        (cmp(key[1], best.key[1]) > 0 || (cmp(key[1], best.key[1]) === 0 && key[2] > best.key[2])))
    )
      best = { prop, value, key };
  };
  for (const r of rules)
    for (const prop of props) {
      const v = r.decls.get(prop);
      if (v !== undefined && matches(el, r.selector, focused)) consider(prop, v, r.spec, r.order);
    }
  const own = inline(el);
  for (const prop of props) {
    const v = own.get(prop);
    if (v !== undefined) consider(prop, v, [1000, 0, 0], 0);
  }
  return best ? { prop: (best as { prop: string }).prop, value: (best as { value: string }).value } : null;
}

/** A custom property's computed value on an element: its own declaration's, with its var()s resolved there, or the
 *  parent's. */
function custom(el: Element | null, name: string, depth = 0): string | undefined {
  if (!el) return undefined;
  const d = declared(el, [name]);
  if (d) return substitute(el, d.value, depth + 1);
  return custom(el.parentElement, name, depth);
}
function substitute(el: Element, value: string, depth = 0): string {
  if (depth > 20) throw new Error(`var() loop at ${value}`);
  let v = value;
  for (
    let m = /var\((--[\w-]+)\s*(?:,\s*([^()]*))?\)/.exec(v);
    m;
    m = /var\((--[\w-]+)\s*(?:,\s*([^()]*))?\)/.exec(v)
  ) {
    const got = custom(el, m[1] ?? "", depth) ?? m[2];
    if (got === undefined) throw new Error(`${m[1]} has no value at ${el.className}`);
    v = v.slice(0, m.index) + got.trim() + v.slice(m.index + m[0].length);
  }
  return v.trim();
}

type Rgb = readonly [number, number, number];
interface Rgba {
  readonly rgb: Rgb;
  readonly a: number;
}
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const BUTTON_FACE: Rgba = { rgb: [239, 239, 239], a: 1 };
const FIELD: Rgba = { rgb: WHITE, a: 1 };

/** A colour as these sheets write it, or null for none. */
function colour(v: string): Rgba | null {
  const s = v.trim().toLowerCase();
  if (s === "none" || s === "transparent") return null;
  if (s === "white") return { rgb: WHITE, a: 1 };
  if (s === "black") return { rgb: BLACK, a: 1 };
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s);
  if (m) return { rgb: [1, 2, 3].map((i) => parseInt(m?.[i] ?? "0", 16)) as unknown as Rgb, a: 1 };
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) return { rgb: [1, 2, 3].map((i) => parseInt(`${m?.[i]}${m?.[i]}`, 16)) as unknown as Rgb, a: 1 };
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+))?\s*\)$/.exec(s);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) };
  throw new Error(`not a colour this test reads: ${v}`);
}
/** The colour token in a shorthand (`2px solid <colour>`, `0 0 0 0.25rem <colour>`): its last part that isn't a length
 *  or a keyword. */
function colourIn(v: string): Rgba | null {
  const m = /(#[0-9a-f]{3,6}|rgba?\([^)]*\)|transparent|white|black|currentcolor)\s*$/i.exec(v.trim());
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
/** Layers, the topmost first, over the room's pixel. */
const composite = (layers: readonly Rgba[], room: Rgb): Rgb => layers.reduceRight<Rgb>((c, l) => over(l, c), room);

const isControl = (el: Element): boolean => ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);

function textColour(el: Element): Rgba {
  const d = declared(el, ["color"]);
  const v = d ? substitute(el, d.value).toLowerCase() : "inherit";
  if (v === "inherit" || v === "currentcolor") {
    if (!d && isControl(el)) return { rgb: BLACK, a: 1 };
    return el.parentElement ? textColour(el.parentElement) : { rgb: BLACK, a: 1 };
  }
  const c = colour(v);
  if (!c) throw new Error(`no text colour at ${el.className}`);
  return c;
}

function background(el: Element): Rgba | null {
  if (declared(el, ["display"])?.value === "contents") return null;
  const d = declared(el, ["background", "background-color"]);
  if (!d)
    return el.tagName === "BUTTON" ? BUTTON_FACE : ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ? FIELD : null;
  return colour(substitute(el, d.value));
}

function length(v: string, el: Element): number {
  const s = v.trim();
  let m = /^(-?[\d.]+)(px|rem|em)?$/.exec(s);
  if (m) return Number(m[1]) * (m[2] === "rem" ? 16 : m[2] === "em" ? fontSize(el) : 1);
  m = /^calc\(\s*(-?[\d.]+)(px|rem|em)\s*\*\s*([\d.]+)\s*\)$/.exec(s);
  if (m) return length(`${m[1]}${m[2]}`, el) * Number(m[3]);
  throw new Error(`not a length this test reads: ${v}`);
}

function fontSize(el: Element): number {
  const parent = el.parentElement ? fontSize(el.parentElement) : 16;
  const d = declared(el, ["font-size", "font"]);
  if (!d) return parent;
  const v = substitute(el, d.value);
  if (v === "inherit") return parent;
  const token = d.prop === "font" ? /(calc\([^)]*\)|-?[\d.]+(?:px|rem|em|%))(?:\/\S+)?/.exec(v)?.[1] : v;
  if (!token) return parent;
  if (token.endsWith("%")) return (parent * Number.parseFloat(token)) / 100;
  if (/em\b/.test(token) && !/rem/.test(token)) {
    const m = /^(?:calc\(\s*)?(-?[\d.]+)em(?:\s*\*\s*([\d.]+)\s*\))?$/.exec(token);
    return parent * Number(m?.[1] ?? 1) * Number(m?.[2] ?? 1);
  }
  return length(token, el);
}

/** Whether the visitor sees the element at all: not hidden, not display: none, not clipped to a pixel. */
function shown(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.hasAttribute("hidden") || n.classList.contains("visually-hidden")) return false;
    if (declared(n, ["display"])?.value === "none") return false;
  }
  return true;
}

/** The layers beneath what an element draws, the topmost first, up to and including the marked part. */
function layersUnder(el: Element, part: Element, withFrame = true): Rgba[] {
  const out: Rgba[] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n === part && withFrame) {
      const frame = part.querySelector(":scope > .split-frame path");
      if (frame && shown(frame) && !el.closest(".talk-head")) {
        const fill = declared(frame, ["fill"]);
        const c = fill ? colour(substitute(frame, fill.value)) : null;
        if (c) out.push(c);
      }
    }
    const bg = background(n);
    if (bg) out.push(bg);
    if (n === part) return out;
  }
  throw new Error("not inside its part");
}

// ---- Where a ring's band lies against its parent's box (rework3-029a, rv-029a-2's RR-1) ----
// The sizes are the declared ones: a box's height is its grid track's where its row is a fixed length in the nearest
// grid container (display: contents passed through), else its `height`, raised to its `min-height`; a control's is its
// `min-height` (or `height`). A parent with neither grows around its controls, and the band is taken to fit in it.
// Vertical only: the parents here (the title row among them) pad their sides by the band or more.

/** A declared length, var()s resolved, or null for none or one this test doesn't read (auto, fr, %, minmax). */
function lengthOf(el: Element, prop: string): number | null {
  const d = declared(el, [prop]);
  if (!d) return null;
  try {
    return length(substitute(el, d.value), el);
  } catch {
    return null;
  }
}

/** Splits a track list at its top-level spaces. */
function tracks(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** A box's height from its declared sizes, or null where none fixes it. */
function fixedHeight(el: Element): number | null {
  let track: number | null = null;
  const row = declared(el, ["grid-row"])?.value.trim();
  let grid = el.parentElement;
  while (grid && declared(grid, ["display"])?.value === "contents") grid = grid.parentElement;
  if (row && /^\d+$/.test(row) && grid) {
    const t = declared(grid, ["grid-template-rows"]);
    const token = t ? tracks(substitute(grid, t.value))[Number(row) - 1] : undefined;
    if (token) {
      try {
        track = length(token, grid);
      } catch {
        track = null;
      }
    }
  }
  const base = track ?? lengthOf(el, "height");
  if (base === null) return null;
  return Math.max(base, lengthOf(el, "min-height") ?? 0);
}

/** A box's top padding, from `padding-top` or the `padding` shorthand, whichever the cascade puts last. */
function paddingTop(el: Element): number {
  const d = declared(el, ["padding-top", "padding"]);
  if (!d) return 0;
  const v = substitute(el, d.value);
  return length((d.prop === "padding" ? tracks(v)[0] : v) ?? "0", el);
}

/** Whether a ring `band` pixels past its control leaves the parent's box above or below the control: the control
 *  centred in it where the parent is a row (flex, not column) that centres its items, else at its padding's top. */
function bandLeaves(el: Element, parent: Element, band: number): boolean {
  const own = Math.max(lengthOf(el, "min-height") ?? 0, lengthOf(el, "height") ?? 0);
  const box = fixedHeight(parent);
  if (box === null || own === 0) return false;
  const column = /^column/.test(declared(parent, ["flex-direction"])?.value.trim() ?? "");
  const centred = !column && declared(parent, ["align-items"])?.value.trim() === "center";
  const top = centred ? (box - own) / 2 : paddingTop(parent);
  const bottom = box - own - top;
  return Math.min(top, bottom) < band;
}

/** The layers beyond a parent's box: its ancestors' up to the part, the split layout's frame not counted (it starts at
 *  the title row's foot, and above the row lies the panel's top edge), so never more than really lies there. */
const layersBeyond = (parent: Element, part: Element): Rgba[] =>
  parent === part ? [] : layersUnder(parent.parentElement as Element, part, false);

/** An SVG paint, inherited as SVG has it: the path's rule or presentation attribute, else its ancestors' up to the svg;
 *  else the initial value (fill black, stroke none). */
function paintOf(el: Element, prop: "stroke" | "fill", svgEl: Element): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const d = declared(n, [prop]);
    if (d) return substitute(n, d.value);
    const attr = n.getAttribute(prop);
    if (attr !== null) return attr;
    if (n === svgEl) break;
  }
  return prop === "fill" ? "black" : "none";
}

interface Pair {
  readonly what: string;
  readonly contrast: number;
  readonly floor: number;
}

const label = (el: Element): string => {
  const words = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  return `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}${words ? ` "${words}"` : ""}`;
};

/** Every text and mark one marked part draws, over the room's white and black. */
function pairsOf(part: Element): Pair[] {
  const out: Pair[] = [];
  const all = [part, ...part.querySelectorAll("*")].filter((el) => shown(el) && !el.closest("[aria-disabled='true']"));
  for (const room of [WHITE, BLACK]) {
    const beneath = room === WHITE ? "white" : "black";
    for (const el of all) {
      // Text: each element holding words of its own.
      if ([...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "")) {
        const bd = composite(layersUnder(el, part), room);
        const large = fontSize(el) >= 24;
        out.push({
          what: `${label(el)} text over ${beneath}`,
          contrast: ratio(over(textColour(el), bd), bd),
          floor: large ? 3 : 4.5,
        });
      }
      // The focus ring of each control.
      if (isControl(el) || (el.tagName === "A" && el.hasAttribute("href"))) {
        const o = declared(el, ["outline", "outline-color"], true);
        const ring = o
          ? o.prop === "outline"
            ? colourIn(substitute(el, o.value))
            : colour(substitute(el, o.value))
          : null;
        if (ring) {
          const offset = length(substitute(el, declared(el, ["outline-offset"], true)?.value ?? "0"), el);
          const width = o?.prop === "outline" ? length(substitute(el, o.value).split(/\s+/)[0] ?? "0", el) : 2;
          let layers: Rgba[];
          if (offset + width <= 0) layers = layersUnder(el, part);
          else {
            const sh = declared(el, ["box-shadow"]);
            const v = sh ? substitute(el, sh.value) : "none";
            const parts = v.split(/\s+/);
            const spread = !v.startsWith("inset") && parts.length >= 5 ? length(parts[3] ?? "0", el) : 0;
            const own = spread >= offset + width ? colourIn(v) : null;
            const parent = el.parentElement as Element;
            const beneathRing =
              el === part
                ? []
                : bandLeaves(el, parent, offset + width)
                  ? layersBeyond(parent, part)
                  : layersUnder(parent, part);
            layers = own ? [own, ...beneathRing] : beneathRing;
          }
          const bd = composite(layers, room);
          out.push({ what: `${label(el)} focus ring over ${beneath}`, contrast: ratio(over(ring, bd), bd), floor: 3 });
        }
      }
      // Borders: against the colour inside or the colour outside, whichever it stands out from more.
      const b = declared(el, ["border", "border-color"]);
      if (b && !/^(0|none)\b/.test(b.value.trim())) {
        const c = colourIn(substitute(el, b.value));
        if (c) {
          const outside = composite(el === part ? [] : layersUnder(el.parentElement as Element, part), room);
          const bg = background(el);
          const inside = bg ? over(bg, outside) : outside;
          const best = Math.max(ratio(over(c, outside), outside), ratio(over(c, inside), inside));
          out.push({ what: `${label(el)} border over ${beneath}`, contrast: best, floor: 3 });
        }
      }
      // Icons and strokes: each painted path, over its svg's layers. The panel's frame is a layer, not a mark.
      if (el.tagName.toLowerCase() === "path" && !el.closest(".split-frame")) {
        const svgEl = el.closest("svg") as Element;
        const bd = composite(layersUnder(svgEl, part), room);
        for (const prop of ["stroke", "fill"] as const) {
          const raw = paintOf(el, prop, svgEl);
          const paint = raw.toLowerCase() === "currentcolor" ? textColour(el) : colour(raw);
          if (paint)
            out.push({
              what: `${label(svgEl)} ${prop} over ${beneath}`,
              contrast: ratio(over(paint, bd), bd),
              floor: 3,
            });
        }
      }
    }
  }
  return out;
}

const failing = (pairs: readonly Pair[]): string[] =>
  pairs.filter((p) => !(p.contrast >= p.floor)).map((p) => `${p.what}: ${p.contrast.toFixed(2)} under ${p.floor}`);

// ---- The room, walking, a conversation open, the "Eat" tile offered ----

type Screen = { readonly w: number; readonly h: number };

async function walkingInConversation(screen: Screen): Promise<Visit> {
  const index = roomIndex();
  const room = {
    ...index,
    live: { ...index.live, turn: "site" as const },
    topics: index.topics.map((t) => ({ ...t, ready: true })),
  };
  const viewport = stubViewport(screen);
  const v = start({ webgl: true, room, viewport: viewport.factory, sendTurn: () => undefined });
  // The drawing's protector as the stage's, with the "Eat" tile's box reserved (compose/protect.ts's `eat`), so the
  // split layout keeps its walls and a dinosaur visit offers the tile.
  const flat = flatProtectorFor(roomIndex());
  v.scene.protect = { ...flat, key: `${flat.key}:eat`, eat: true };
  await enter(v, "engineer", "dinosaur");
  await throughLoader(v);
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
  const id = room.selectables.find((s) => s.action.kind === "talk")?.id ?? "";
  v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`)?.click();
  await flush();
  v.scene.created.at(-1)?.eating?.available?.(true);
  await flush();
  v.doc.querySelector<HTMLButtonElement>("button.room-walk")?.click();
  await flush();
  return v;
}

const marked = (v: Visit): Element[] => [...v.doc.querySelectorAll('[data-over="room"]')];
/** Each outermost marked part's pairs: a part inside another is judged with the outer one's layers. */
const everyPair = (v: Visit): Pair[] =>
  marked(v)
    .filter((el) => !el.parentElement?.closest('[data-over="room"]'))
    .flatMap(pairsOf);

/** His windows, which take the split layout, then a smaller one (the column layout) and a phone's (the dock). */
const WINDOWS: readonly (Screen & { layout: "split" | "column" | "dock"; parts: readonly string[] })[] = [
  { w: 1366, h: 768, layout: "split", parts: ["talk", "room-list", "hud-bar", "room-walk"] },
  { w: 1440, h: 900, layout: "split", parts: ["talk", "room-list", "hud-bar", "room-walk"] },
  { w: 1920, h: 1080, layout: "split", parts: ["talk", "room-list", "hud-bar", "room-walk"] },
  { w: 1280, h: 720, layout: "column", parts: ["hud-panels", "talk-sheet", "hud-bar", "room-walk", "room-eat"] },
  { w: 390, h: 844, layout: "dock", parts: ["hud-panels", "talk-sheet", "hud-bar", "room-walk", "room-eat"] },
];
const layoutOf = (v: Visit): string =>
  v.doc.documentElement.getAttribute("data-split") === "on"
    ? "split"
    : (v.doc.documentElement.getAttribute("data-hud") ?? "none");

describe("over the room, each text and mark over the layers really beneath it (R-1, R-2; FR-003, SC-002)", () => {
  for (const screen of WINDOWS)
    it(`holds every ratio at ${screen.w} × ${screen.h} (${screen.layout}), walking, in a conversation, the key caps included`, async () => {
      const v = await walkingInConversation(screen);
      expect(layoutOf(v)).toBe(screen.layout);
      expect(v.scene.walks.at(-1)?.call).toBe("enter");
      const parts = marked(v).map((el) => el.className.split(" "));
      for (const part of screen.parts)
        expect(
          parts.some((c) => c.includes(part)),
          part,
        ).toBe(true);
      // What the review names is there to judge: the title row's words, the hint's and "Back"'s "Esc", the selected
      // entry's "Enter" (the split layout's), and the "Eat" tile's "B" (every layout's).
      const caps = [...v.doc.querySelectorAll(".hud-keycap")].filter(shown).map((c) => c.textContent);
      expect(caps).toEqual(expect.arrayContaining(screen.layout === "split" ? ["Esc", "Esc", "Enter", "B"] : ["B"]));
      if (screen.layout === "split") expect(shown(v.doc.querySelector(".talk-log-toggle") as Element)).toBe(true);
      const pairs = everyPair(v);
      expect(pairs.length).toBeGreaterThan(50);
      expect(failing(pairs)).toEqual([]);
    });

  it("takes --over-plate-alpha's step as the lowest at which all of them hold (FR-003)", async () => {
    const v = await walkingInConversation({ w: 1366, h: 768 });
    expect(failing(everyPair(v))).toEqual([]);
    const root = v.doc.documentElement;
    const plate = Number(custom(root, "--over-plate-alpha"));
    root.style.setProperty("--over-plate-alpha", String(Math.round(plate * 100 - 5) / 100));
    expect(failing(everyPair(v)).length).toBeGreaterThan(0);
  });

  it("keeps the title row's own corners and shadow while walking (R-7; FR-002)", async () => {
    const v = await walkingInConversation({ w: 1366, h: 768 });
    const talk = v.doc.querySelector(".talk") as Element;
    const head = v.doc.querySelector(".talk-head") as Element;
    expect(talk.getAttribute("data-over")).toBe("room");
    const look = (): (string | undefined)[] =>
      ["border-radius", "box-shadow"].map((p) => declared(head, [p])?.value ?? "none");
    const walking = look();
    talk.removeAttribute("data-over");
    expect(walking).toEqual(look());
  });

  it("finds the title row's controls as tall as the row or taller, so a ring outside them leaves it (RR-1)", async () => {
    // The model above is only as good as these sizes: the hint's min-height is the row's track, and the title's
    // toggle (44 px) meets the row's edge wherever the row is under 52 px, every split window at 1366 × 768.
    const v = await walkingInConversation({ w: 1366, h: 768 });
    const head = v.doc.querySelector(".talk-head") as Element;
    const row = fixedHeight(head);
    expect(row).not.toBeNull();
    for (const sel of [".split-hint", ".talk-log-toggle"]) {
      const el = v.doc.querySelector(sel) as Element;
      expect(el.parentElement, sel).toBe(head);
      expect(bandLeaves(el, head, 4), sel).toBe(true);
    }
  });

  it("models the split layout's frame as the paint beneath the rows but the title row", () => {
    // If these change, the layers above change with them: the frame from the title row's foot, the row in grid row 1.
    const decl = (selector: string, prop: string): string | undefined =>
      RULES.find((r) => r.selector === selector && r.decls.has(prop))?.decls.get(prop);
    const ON = 'html[data-split="on"][data-hud="column"]';
    expect(decl(`${ON} .split-frame`, "top")).toBe("var(--wall-title-h)");
    expect(decl(`${ON} .talk[data-panel="open"] .talk-head`, "grid-row")).toBe("1");
  });
});

// ---- The waiting status's pulse over the room (pulse-029a; rv-line-029's L-1; Q59; FR-003, FR-007) ----
// The cascade above reads top-level rules only, so spec 007's pulse (talk.css's `@media (prefers-reduced-motion:
// no-preference)` block: `.talk-status:not(:empty)` animates `talk-waiting`, whose keyframes take the status's opacity
// down) was never judged. Opacity fades the whole element, the status's plate with its words, over what lies beneath.
// Here every style rule and `@keyframes` of the three sheets is read in the page's order with the media it sits in, and
// the state is the one above (none of the visitor's asks) with default motion (`no-preference`) at the window's size.
// The status's lowest opacity is the least of its own opacity and the opacities of the keyframes of each infinite
// animation the cascade gives it in that state (its own opacity where 0% or 100% is left unset; the timing functions
// these sheets use never overshoot). A finite animation (a one-shot fade on opening) leaves it at rest, at its own
// opacity, or at its last keyframe's where it fills forwards. Then the status's words over its plate, both faded to that
// opacity over the layers beneath the status (layersUnder, as above), over white and black: 4.5:1, or 3:1 at 24 px.
// The harness: a topic piece selected, its opening turn in flight (the sender never answers), so the status shows
// twin_answering; at FR-007's windows, in 3D in the room and walking, and in 2D (1366 × 768 and 390 × 844) in the
// room, plus 1280 × 720, where the column layout stands outside the split layout. The status is judged wherever a
// marked part holds it; elsewhere it keeps spec 007's pulse, unchanged.

interface Scoped extends Rule {
  readonly media: readonly string[];
}
interface Frame {
  readonly at: readonly number[];
  readonly opacity: string | undefined;
}

/** Every style rule (one per selector of its list) and `@keyframes` of the sheets, in order, with its at-rules. */
const SCOPED: { rules: Scoped[]; keyframes: Map<string, { media: readonly string[]; frames: Frame[] }[]> } = (() => {
  const rules: Omit<Scoped, "order">[] = [];
  const keyframes = new Map<string, { media: readonly string[]; frames: Frame[] }[]>();
  const decls = (body: string): Map<string, string> => {
    const out = new Map<string, string>();
    for (const part of body.split(";")) {
      const c = part.indexOf(":");
      if (c > 0) out.set(part.slice(0, c).trim(), part.slice(c + 1).trim());
    }
    return out;
  };
  const offset = (s: string): number => (s === "from" ? 0 : s === "to" ? 100 : Number.parseFloat(s));
  const walk = (src: string, media: readonly string[]): void => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf("{", i);
      if (open < 0) break;
      const prelude = src.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === "{") depth += 1;
        else if (src[j] === "}") depth -= 1;
        j += 1;
      }
      const body = src.slice(open + 1, j - 1);
      const kf = /^@(?:-webkit-)?keyframes\s+([\w-]+)$/.exec(prelude);
      if (kf) {
        const frames = parseCss(body).rules.map((r) => ({
          at: list(r.selector).map(offset),
          opacity: r.declarations.get("opacity"),
        }));
        keyframes.set(kf[1] ?? "", [...(keyframes.get(kf[1] ?? "") ?? []), { media, frames }]);
      } else if (prelude.startsWith("@")) walk(body, [...media, prelude]);
      else
        for (const selector of list(prelude))
          rules.push({ selector, spec: specificity(selector), decls: decls(body), media });
      i = j;
    }
  };
  for (const p of SHEETS) walk(read(p).replace(/\/\*[\s\S]*?\*\//g, ""), []);
  return { rules: rules.map((r, order) => ({ ...r, order })), keyframes };
})();

interface MediaState {
  readonly motion: "no-preference" | "reduce";
  readonly w: number;
  readonly h: number;
}

/** Whether an at-rule's condition holds in the state: true, false, or null where this test can't tell (`@supports`,
 *  `hover`, any feature it doesn't read). */
function holds(prelude: string, s: MediaState): boolean | null {
  const m = /^@media\s+([\s\S]*)$/.exec(prelude);
  if (!m) return null;
  const px = (v: string): number => {
    const n = /^([\d.]+)(px|rem|em)$/.exec(v);
    if (!n) throw new Error(`not a media length this test reads: ${v}`);
    return Number(n[1]) * (n[2] === "px" ? 1 : 16);
  };
  const feature = (name: string, value: string): boolean | null => {
    switch (name) {
      case "prefers-reduced-motion":
        return value === s.motion;
      case "prefers-reduced-transparency":
      case "prefers-contrast":
      case "forced-colors":
        return false; // none of the visitor's asks
      case "orientation":
        return value === (s.h >= s.w ? "portrait" : "landscape");
      case "max-width":
        return s.w <= px(value);
      case "min-width":
        return s.w >= px(value);
      default:
        return null;
    }
  };
  const queries = list(m[1] ?? "").map((q): boolean | null => {
    let all: boolean | null = true;
    for (const p of q.split(/\s+and\s+/)) {
      const f = /^\(\s*([\w-]+)\s*:\s*([\w.-]+)\s*\)$/.exec(p.trim());
      const v = f ? feature(f[1] ?? "", f[2] ?? "") : null;
      if (v === false) return false;
      if (v === null) all = null;
    }
    return all;
  });
  if (queries.some((q) => q === true)) return true;
  return queries.every((q) => q === false) ? false : null;
}

const conditions = (media: readonly string[], s: MediaState): boolean | null =>
  media.reduce<boolean | null>((acc, p) => {
    const h = holds(p, s);
    return acc === false || h === false ? false : acc === null || h === null ? null : true;
  }, true);

/** The rules that apply in a state, and those whose media this test can't tell. */
const rulesIn = (s: MediaState): { sure: Scoped[]; unsure: Scoped[] } => ({
  sure: SCOPED.rules.filter((r) => conditions(r.media, s) === true),
  unsure: SCOPED.rules.filter((r) => conditions(r.media, s) === null),
});

/** The rules in an at-rule (a state's media, or one this test can't tell) that match `el` and declare one of `props`. */
const atRuleDeclaring = (el: Element, props: readonly string[], s: MediaState): string[] =>
  SCOPED.rules
    .filter((r) => r.media.length > 0 && conditions(r.media, s) !== false)
    .filter((r) => props.some((p) => r.decls.has(p)) && matches(el, r.selector, false))
    .map((r) => `${r.media.join(" ")} ${r.selector}`);

const TIMING = /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|cubic-bezier\(.*\)|steps\(.*\))$/;
const ANIMATION_KEYWORDS = new Set([
  "none",
  "infinite",
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
  "forwards",
  "backwards",
  "both",
  "running",
  "paused",
]);
interface Animation {
  readonly name: string;
  readonly infinite: boolean;
  readonly fill: string;
}

/** The animations the cascade gives an element under `rules`. */
function animations(el: Element, rules: readonly Rule[]): Animation[] {
  const d = declared(el, ["animation", "animation-name"], false, rules);
  if (!d) return [];
  const v = substitute(el, d.value);
  if (d.prop === "animation-name")
    return list(v)
      .filter((n) => n !== "none")
      .map((name) => ({
        name,
        infinite: declared(el, ["animation-iteration-count"], false, rules)?.value.trim() === "infinite",
        fill: declared(el, ["animation-fill-mode"], false, rules)?.value.trim() ?? "none",
      }));
  return list(v).flatMap((one) => {
    const tokens = tracks(one);
    const name = tokens.find(
      (t) => !/^-?[\d.]+m?s$/.test(t) && !/^[\d.]+$/.test(t) && !TIMING.test(t) && !ANIMATION_KEYWORDS.has(t),
    );
    if (name === undefined) return [];
    return [
      {
        name,
        infinite: tokens.includes("infinite"),
        fill: tokens.find((t) => ["forwards", "backwards", "both"].includes(t)) ?? "none",
      },
    ];
  });
}

/** An element's lowest opacity while it holds its state, from its animations' keyframes (see the section's head). */
function lowestOpacity(el: Element, s: MediaState): number {
  const { sure } = rulesIn(s);
  const own = declared(el, ["opacity"], false, sure);
  const base = own ? Number(substitute(el, own.value)) : 1;
  let low = base;
  for (const a of animations(el, sure)) {
    const frames = (SCOPED.keyframes.get(a.name) ?? []).filter((k) => conditions(k.media, s) === true).at(-1)?.frames;
    if (!frames) continue; // a name with no keyframes in this state animates nothing
    const at = (o: number): string | undefined =>
      frames.find((f) => f.at.includes(o) && f.opacity !== undefined)?.opacity;
    if (a.infinite) {
      const values = frames.filter((f) => f.opacity !== undefined).map((f) => Number(f.opacity));
      if (at(0) === undefined || at(100) === undefined) values.push(base);
      low = Math.min(low, ...values);
    } else if (a.fill === "forwards" || a.fill === "both") low = Math.min(low, Number(at(100) ?? base));
  }
  return low;
}

/** The status's words against its plate, both faded to `opacity` over the layers beneath the status. */
function fadedRatio(status: Element, part: Element, room: Rgb, opacity: number): number {
  const beneath = composite(status === part ? [] : layersUnder(status.parentElement as Element, part), room);
  const plate = background(status);
  const face = plate ? over(plate, beneath) : beneath;
  const words = over(textColour(status), face);
  const fade = (c: Rgb): Rgb => over({ rgb: c, a: opacity }, beneath);
  return ratio(fade(words), fade(face));
}

/** The outermost marked part holding an element, or null where none does. */
function outermostPart(el: Element): Element | null {
  let part = el.closest('[data-over="room"]');
  for (
    let up = part?.parentElement?.closest('[data-over="room"]');
    up;
    up = up.parentElement?.closest('[data-over="room"]')
  )
    part = up;
  return part;
}

interface PulseCase extends Screen {
  readonly mode: "3d" | "2d";
  readonly walking: boolean;
}

/** The room with a topic's opening turn in flight, the status saying twin_answering; walking where asked (3D). */
async function waitingIn(c: PulseCase): Promise<Visit> {
  const index = roomIndex();
  const room = {
    ...index,
    live: { ...index.live, turn: "site" as const },
    topics: index.topics.map((t) => ({ ...t, ready: true })),
  };
  const viewport = stubViewport(c);
  const v = start({ webgl: c.mode === "3d", room, viewport: viewport.factory, sendTurn: () => undefined });
  if (c.mode === "3d") {
    // As walkingInConversation: the drawing's protector as the stage's, so the split layout keeps its walls.
    const flat = flatProtectorFor(roomIndex());
    v.scene.protect = { ...flat, key: `${flat.key}:eat`, eat: true };
  }
  await enter(v, "engineer", "dinosaur");
  await throughLoader(v);
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
  const id = room.selectables.find((s) => s.action.kind === "talk")?.id ?? "";
  v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`)?.click();
  await flush();
  if (c.walking) {
    v.doc.querySelector<HTMLButtonElement>("button.room-walk")?.click();
    await flush();
  }
  return v;
}

const PULSE_SCREENS: readonly Screen[] = [
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
  { w: 1280, h: 720 },
];
const PULSE_CASES: readonly PulseCase[] = [
  ...PULSE_SCREENS.flatMap((s) => [
    { ...s, mode: "3d" as const, walking: false },
    { ...s, mode: "3d" as const, walking: true },
  ]),
  { w: 1366, h: 768, mode: "2d", walking: false },
  { w: 390, h: 844, mode: "2d", walking: false },
];
const LAYER_PROPS = ["background", "background-color", "color", "display", "fill", "opacity"];

describe("the waiting status over the room, at its pulse's lowest opacity (pulse-029a; L-1, Q59; FR-003, FR-007)", () => {
  it("reads the same top-level rules as the cascade above, and talk.css's pulse where the sheet puts it", () => {
    expect(SCOPED.rules.filter((r) => r.media.length === 0).map((r) => r.selector)).toEqual(
      RULES.map((r) => r.selector),
    );
    // The pulse is there to judge: an infinite animation on the status, in the default motion's block only.
    const pulse = SCOPED.rules.filter((r) => r.selector === ".talk-status:not(:empty)" && r.decls.has("animation"));
    expect(pulse.map((r) => r.media)).toEqual([["@media (prefers-reduced-motion: no-preference)"]]);
    const name = /^([\w-]+)/.exec(pulse[0]?.decls.get("animation") ?? "")?.[1] ?? "";
    expect(
      SCOPED.keyframes
        .get(name)
        ?.flatMap((k) => k.frames)
        .some((f) => f.opacity !== undefined),
    ).toBe(true);
  });

  const judged: { layout: string; c: PulseCase }[] = [];
  const kept: { layout: string; c: PulseCase }[] = [];

  for (const c of PULSE_CASES)
    it(`keeps the status's words at AA at ${c.w} × ${c.h} in ${c.mode}, ${c.walking ? "walking" : "in the room"}`, async () => {
      const v = await waitingIn(c);
      if (c.walking) expect(v.scene.walks.at(-1)?.call).toBe("enter");
      const status = v.doc.querySelector(".talk-status") as Element;
      expect((status.textContent ?? "").trim()).not.toBe("");
      expect(shown(status)).toBe(true);
      const state: MediaState = { motion: "no-preference", w: c.w, h: c.h };
      // The layers this file reads are the top-level rules': no at-rule in this state changes them on the status or
      // any ancestor, and none this test can't tell animates one; no ancestor rests below opacity 1.
      const chain: Element[] = [];
      for (let n: Element | null = status; n; n = n.parentElement) chain.push(n);
      expect(chain.flatMap((n) => atRuleDeclaring(n, LAYER_PROPS, state))).toEqual([]);
      const { unsure } = rulesIn(state);
      expect(
        chain.flatMap((n) =>
          unsure.filter(
            (r) => ["animation", "animation-name"].some((p) => r.decls.has(p)) && matches(n, r.selector, false),
          ),
        ),
      ).toEqual([]);
      expect(chain.slice(1).map((n) => lowestOpacity(n, state))).toEqual(chain.slice(1).map(() => 1));

      const opacity = lowestOpacity(status, state);
      const part = outermostPart(status);
      const layout = layoutOf(v);
      if (!part) {
        // Outside the room, spec 007's pulse as it was.
        expect(animations(status, rulesIn(state).sure).map((a) => a.name)).toEqual(["talk-waiting"]);
        expect(opacity).toBeLessThan(1);
        kept.push({ layout, c });
        return;
      }
      judged.push({ layout, c });
      const floor = fontSize(status) >= 24 ? 3 : 4.5;
      const failures = [WHITE, BLACK]
        .map((room) => ({ room, r: fadedRatio(status, part, room, opacity) }))
        .filter(({ r }) => !(r >= floor))
        .map(
          ({ room, r }) =>
            `${label(status)} in ${layout} at opacity ${opacity} over ${room === WHITE ? "white" : "black"}: ${r.toFixed(2)} under ${floor}`,
        );
      expect(failures).toEqual([]);
    });

  it("judged the status over the room in the column (the split's walking view and outside it) and the dock layouts", () => {
    expect(judged.length + kept.length).toBe(PULSE_CASES.length);
    const where = new Set(judged.map(({ layout, c }) => `${layout}${c.walking ? " walking" : ""}`));
    for (const w of ["split walking", "column walking", "dock walking", "dock"]) expect([...where]).toContain(w);
    // His three windows at the room's framing hold the panel in the grey band: the pulse stays there.
    expect(kept.filter(({ c }) => c.w >= 1366 && c.mode === "3d" && !c.walking).map(({ layout }) => layout)).toEqual([
      "split",
      "split",
      "split",
    ]);
  });

  it("gives the status no motion under reduced motion, over the room or not (spec 007's FR-034)", async () => {
    for (const walking of [false, true]) {
      const v = await waitingIn({ w: 1366, h: 768, mode: "3d", walking });
      const status = v.doc.querySelector(".talk-status") as Element;
      expect(lowestOpacity(status, { motion: "reduce", w: 1366, h: 768 })).toBe(1);
    }
  });
});
