// The cascade of the page's stylesheets for one element (spec 030, T-B01; plan.md §R-B4): which declaration wins a
// property, by importance, specificity, and order, in a window whose media features a test sets, with the element in
// the state a test asks for (hovered, pressed, focused by the keyboard), and the winner's value with each var()
// resolved from the custom properties the element has or inherits. jsdom's getComputedStyle reads neither @media nor a
// state it can't enter, and drops a `border-color` that holds var() (its cssstyle parses the shorthand), so B's tests
// read the component's winners here and cross-check what jsdom does compute (button-skin.test.ts). This file declares
// no test: it is imported, never a `.test.ts` (analysis A-5).
import { parseCss } from "./room";

/** A stylesheet of the page, in the bundle's order. */
export interface Sheet {
  /** Its name in the reports, as `room/room.css` or `virtual:ui-skin.css`. */
  readonly name: string;
  readonly text: string;
}

/** The window's media features a test sets, each `feature: value` (as `forced-colors: active`); a feature it doesn't
 *  set takes its default below. The width and height are in CSS pixels. */
export interface Env {
  readonly media?: readonly string[];
  readonly width?: number;
  readonly height?: number;
}

/** The element's interaction state: the pseudo-classes jsdom never enters. */
export interface State {
  readonly hover?: boolean;
  readonly active?: boolean;
  readonly focusVisible?: boolean;
}

/** A declaration of a rule, with where it came from. */
export interface Declaration {
  readonly property: string;
  readonly value: string;
  readonly important: boolean;
  readonly selector: string;
  readonly specificity: readonly [number, number, number];
  readonly order: number;
  readonly sheet: string;
  /** The at-rules' preludes it sits in, outermost first. */
  readonly at: readonly string[];
}

const DEFAULTS: Readonly<Record<string, string>> = {
  "prefers-reduced-motion": "no-preference",
  "prefers-reduced-transparency": "no-preference",
  "prefers-contrast": "no-preference",
  "forced-colors": "none",
  hover: "hover",
  "any-hover": "hover",
  pointer: "fine",
  "any-pointer": "fine",
  "prefers-color-scheme": "light",
};

/** The longhands a shorthand also sets, for the properties B's tests read. */
const SHORTHANDS: Readonly<Record<string, readonly string[]>> = (() => {
  const out: Record<string, string[]> = {
    "background-color": ["background"],
    "background-image": ["background"],
    "border-image-source": ["border-image"],
    "border-image-slice": ["border-image"],
    "border-radius": [],
    "font-family": ["font"],
    "font-weight": ["font"],
    "outline-color": ["outline"],
    "outline-style": ["outline"],
    "outline-width": ["outline"],
    "text-decoration-line": ["text-decoration"],
    "animation-name": ["animation"],
    "transition-property": ["transition"],
    "transition-duration": ["transition"],
  };
  for (const side of ["top", "right", "bottom", "left"])
    for (const what of ["color", "width", "style"])
      out[`border-${side}-${what}`] = [`border-${what}`, `border-${side}`, "border"];
  return out;
})();

/** The properties whose value an element takes from its parent when no rule sets it. */
const INHERITED = new Set([
  "color",
  "font-family",
  "font-weight",
  "font-size",
  "letter-spacing",
  "text-transform",
  "white-space",
  "visibility",
  "cursor",
]);

/** Splits a list at its top-level commas (none inside parentheses or brackets). */
export function topLevel(list: string, separator = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    const ch = list[i];
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === separator && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

/** The argument of a functional pseudo-class that starts at `open` (the index of its "("), and the index after ")". */
function argument(selector: string, open: number): [string, number] {
  let depth = 0;
  for (let i = open; i < selector.length; i += 1) {
    if (selector[i] === "(") depth += 1;
    else if (selector[i] === ")") {
      depth -= 1;
      if (depth === 0) return [selector.slice(open + 1, i), i + 1];
    }
  }
  return [selector.slice(open + 1), selector.length];
}

const add = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  (a[0] ?? 0) + (b[0] ?? 0),
  (a[1] ?? 0) + (b[1] ?? 0),
  (a[2] ?? 0) + (b[2] ?? 0),
];
const greater = (a: readonly number[], b: readonly number[]): boolean => {
  for (let i = 0; i < 3; i += 1) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};

/** A complex selector's specificity, Selectors Level 4: :is(), :not(), and :has() take their most specific argument,
 *  :where() none; a pseudo-element and a type count in the third place. */
export function specificity(selector: string): [number, number, number] {
  let out: [number, number, number] = [0, 0, 0];
  let i = 0;
  const ident = (from: number): number => {
    let j = from;
    while (j < selector.length && /[\w\-\\]/.test(selector[j] ?? "")) j += selector[j] === "\\" ? 2 : 1;
    return j;
  };
  while (i < selector.length) {
    const ch = selector[i] ?? "";
    if (ch === "#") {
      out = add(out, [1, 0, 0]);
      i = ident(i + 1);
    } else if (ch === ".") {
      out = add(out, [0, 1, 0]);
      i = ident(i + 1);
    } else if (ch === "[") {
      out = add(out, [0, 1, 0]);
      i = selector.indexOf("]", i) + 1 || selector.length;
    } else if (ch === ":" && selector[i + 1] === ":") {
      out = add(out, [0, 0, 1]);
      i = ident(i + 2);
      if (selector[i] === "(") i = argument(selector, i)[1];
    } else if (ch === ":") {
      const end = ident(i + 1);
      const name = selector.slice(i + 1, end).toLowerCase();
      if (selector[end] === "(") {
        const [arg, after] = argument(selector, end);
        if (name === "where") {
          // none
        } else if (name === "is" || name === "not" || name === "has" || name === "matches") {
          let best: [number, number, number] = [0, 0, 0];
          for (const part of topLevel(arg)) {
            const s = specificity(part);
            if (greater(s, best)) best = s;
          }
          out = add(out, best);
        } else out = add(out, [0, 1, 0]);
        i = after;
      } else {
        out = add(out, ["before", "after", "first-line", "first-letter"].includes(name) ? [0, 0, 1] : [0, 1, 0]);
        i = end;
      }
    } else if (/[a-zA-Z]/.test(ch)) {
      out = add(out, [0, 0, 1]);
      i = ident(i);
    } else i += 1;
  }
  return out;
}

const STATES: readonly (readonly [keyof State, RegExp])[] = [
  ["focusVisible", /:focus-visible(?![\w-])/g],
  ["hover", /:hover(?![\w-])/g],
  ["active", /:active(?![\w-])/g],
];

/** The selector as it matches an element in `state`: each state pseudo-class the element is in dropped, each it isn't
 *  in made unmatchable; `:focus` (with no suffix) follows focus-visible. */
function inState(selector: string, state: State): string {
  const swap = (s: string, re: RegExp, on: boolean): string =>
    s.replace(re, (_m: string, offset: number, whole: string) => {
      if (!on) return ":not(*)";
      // Dropped from an otherwise empty compound, the pseudo-class leaves the universal selector in its place.
      const before = whole[offset - 1];
      return before === undefined || /[\s>+~(,]/.test(before) ? "*" : "";
    });
  let s = selector;
  for (const [key, re] of STATES) s = swap(s, re, state[key] === true);
  return swap(s, /:focus(?![\w-])/g, state.focusVisible === true);
}

/** Whether one media query list matches the window. */
export function mediaMatches(prelude: string, env: Env): boolean {
  const media = new Map<string, string>(Object.entries(DEFAULTS));
  for (const m of env.media ?? []) {
    const [feature, value] = m.split(":").map((s) => s.trim());
    if (feature && value) media.set(feature, value);
  }
  const width = env.width ?? 1366;
  const height = env.height ?? 768;
  media.set("orientation", width >= height ? "landscape" : "portrait");
  const length = (v: string): number => {
    const m = /^([\d.]+)(px|rem|em)$/.exec(v.trim());
    return m ? Number(m[1]) * (m[2] === "px" ? 1 : 16) : NaN;
  };
  const feature = (cond: string): boolean => {
    const m = /^\(\s*([\w-]+)\s*(?::\s*([^)]+?))?\s*\)$/.exec(cond.trim());
    if (!m) return /^(all|screen)$/.test(cond.trim());
    const [, name = "", value] = m;
    if (name === "min-width") return width >= length(value ?? "");
    if (name === "max-width") return width <= length(value ?? "");
    if (name === "min-height") return height >= length(value ?? "");
    if (name === "max-height") return height <= length(value ?? "");
    const has = media.get(name);
    if (has === undefined) return false;
    return value === undefined ? has !== "none" && has !== "no-preference" : has === value.trim();
  };
  const query = (q: string): boolean => {
    let text = q.trim();
    let negate = false;
    if (/^not\s/.test(text)) {
      negate = true;
      text = text.slice(4);
    }
    const all = text.split(/\s+and\s+/).every((c) => feature(c));
    return negate ? !all : all;
  };
  return topLevel(prelude).some(query);
}

/** Whether an at-rule's block applies: @media by its query, @supports as a browser that has backdrop-filter answers
 *  it (true but for `not`), and nothing else (@keyframes, @font-face hold no rule for an element). */
function applies(prelude: string, env: Env): boolean {
  if (prelude.startsWith("@media")) return mediaMatches(prelude.slice("@media".length), env);
  if (prelude.startsWith("@supports")) return !/^@supports\s+not\b/.test(prelude);
  return false;
}

/** The page's stylesheets as one cascade. */
export class Cascade {
  readonly declarations: readonly Declaration[];

  constructor(
    sheets: readonly Sheet[],
    readonly env: Env = {},
  ) {
    const out: Declaration[] = [];
    let order = 0;
    const read = (text: string, sheet: string, at: readonly string[]): void => {
      const parsed = parseCss(text);
      for (const rule of parsed.rules)
        for (const selector of topLevel(rule.selector)) {
          const s = specificity(selector);
          for (const [property, raw] of rule.declarations) {
            const important = /!\s*important\s*$/i.test(raw);
            const value = raw.replace(/!\s*important\s*$/i, "").trim();
            out.push({ property, value, important, selector, specificity: s, order: order++, sheet, at });
          }
        }
      for (const a of parsed.atRules) if (applies(a.prelude, env)) read(a.body, sheet, [...at, a.prelude]);
    };
    for (const sheet of sheets) read(sheet.text, sheet.name, []);
    this.declarations = out;
  }

  /** Every declaration of the property (or a shorthand that sets it) whose selector matches the element. */
  matching(el: Element, property: string, state: State = {}): Declaration[] {
    const names = new Set([property, ...(SHORTHANDS[property] ?? [])]);
    return this.declarations.filter((d) => {
      if (!names.has(d.property)) return false;
      try {
        return el.matches(inState(d.selector, state));
      } catch {
        return false;
      }
    });
  }

  /** The declaration that wins the property on the element: importance, then specificity, then order. */
  winner(el: Element, property: string, state: State = {}): Declaration | null {
    let best: Declaration | null = null;
    for (const d of this.matching(el, property, state)) {
      if (best === null) best = d;
      else if (d.important !== best.important) {
        if (d.important) best = d;
      } else if (greater(d.specificity, best.specificity)) best = d;
      else if (!greater(best.specificity, d.specificity) && d.order > best.order) best = d;
    }
    return best;
  }

  /** The property's value on the element, as declared (inherited where the property inherits), or null. */
  declared(el: Element, property: string, state: State = {}): string | null {
    const won = this.winner(el, property, state);
    if (won) {
      if (won.value === "inherit" && el.parentElement) return this.declared(el.parentElement, property);
      return won.value;
    }
    if ((property.startsWith("--") || INHERITED.has(property)) && el.parentElement)
      return this.declared(el.parentElement, property);
    return null;
  }

  /** The property's value with every var() resolved, its fallback taken where the custom property is unset. */
  value(el: Element, property: string, state: State = {}): string | null {
    const v = this.declared(el, property, state);
    return v === null ? null : this.resolve(el, v, state, 0);
  }

  /** A value's var() references resolved against the element's custom properties. */
  resolve(el: Element, value: string, state: State = {}, depth = 0): string {
    if (depth > 20) throw new Error(`var() cycle at ${value}`);
    let out = "";
    let i = 0;
    while (i < value.length) {
      const at = value.indexOf("var(", i);
      if (at < 0) {
        out += value.slice(i);
        break;
      }
      out += value.slice(i, at);
      const [arg, after] = argument(value, at + 3);
      const [name = "", ...rest] = topLevel(arg);
      const fallback = rest.length > 0 ? arg.slice(arg.indexOf(",") + 1).trim() : null;
      const own = this.declared(el, name.trim(), state);
      const chosen = own ?? fallback ?? "";
      out += this.resolve(el, chosen, state, depth + 1);
      i = after;
    }
    return out.trim();
  }
}
