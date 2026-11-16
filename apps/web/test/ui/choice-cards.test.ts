// T-D01 (spec 029, group D; FR-024 to FR-035; plan.md §R-D1 to §R-D5): the selection screen, game-like. Two numbered
// steps over the same native radio groups: "Step 1: Select your role", the role cards and an outcome card that shows
// what the chosen role means for the visit; "Step 2: Select your avatar", a character card per visitor with its picture,
// name, and line. A chosen card looks chosen by more than colour; a pointer activation, Enter, or Space on a role card
// moves focus to step 2 after the pointer's own click and the label's activation (rework-cd.md S-9), never the `click`
// an arrow key fires (`event.detail` 0); Enter in step 1 never submits. The look is read from the stylesheets: forced
// colours, motion only under `no-preference`, and the three layouts. Nothing is fetched, sent, or stored before
// "Enter", and the dinosaur's line is held to the composed room (FR-031).
//
// The words below are the page's drafts as taken under the Author's rule 1 for night 4 (spec Q11, Q13; the page's Q19
// for the dog's): this test pins what ships, for his look.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  WEB,
  announcer,
  axeViolations,
  flush,
  matchesRule,
  nameOf,
  parseCss,
  px,
  radio,
  repositoryBundle,
  start,
  textOf,
} from "../helpers/room";
import type { CssRule, Visit } from "../helpers/room";

const ROLES = [
  {
    value: "engineer",
    name: "Engineer",
    description:
      "The twin answers at each topic's full depth: the architecture, the trade-offs, and how the systems work. The facts are the same on either role; only the depth changes.",
  },
  {
    value: "non-engineer",
    name: "Not an engineer",
    description:
      "The twin will describe projects and goals as if talking to a non-technical person: what the work does and why it matters, without jargon. The facts are the same on either role; only the depth changes.",
  },
] as const;

const ROLE_COMMON = "You choose once for this visit; reload the page to choose again.";
const ROLE_EMPTY = "Choose a role to see how the twin will talk with you.";

const AVATARS = [
  {
    value: "woman",
    name: "Woman",
    line: "A generic woman. She takes the twin's paper and, in the 3D room, walks where you steer.",
  },
  {
    value: "man",
    name: "Man",
    line: "A generic man. He takes the twin's paper and, in the 3D room, walks where you steer.",
  },
  {
    value: "dinosaur",
    name: "Dinosaur",
    line: "A generic dinosaur. In the 3D room it can eat chunks of the desk and a few other things in the room, and they grow back.",
  },
  { value: "dog", name: "Dog", line: "A dog. It walks the room and talks with the twin like any visitor." },
] as const;

const radios = (doc: Document, group: string): HTMLInputElement[] => [
  ...doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${group}"]`),
];

const step = (doc: Document, n: 1 | 2): HTMLFieldSetElement => {
  const sets = [...doc.querySelectorAll<HTMLFieldSetElement>(".choice-form fieldset")];
  const found = sets[n - 1];
  if (!found) throw new Error(`no step ${n}`);
  return found;
};

const legendOf = (el: Element): string => textOf(el.closest("fieldset")?.querySelector(":scope > legend") ?? null);

const described = (el: Element): string =>
  textOf(el.ownerDocument.getElementById(el.getAttribute("aria-describedby") ?? "") ?? null);

const outcome = (doc: Document): HTMLElement => {
  const el = doc.querySelector<HTMLElement>(".choice-outcome");
  if (!el) throw new Error("no outcome card");
  return el;
};

/** The outcome card's words a sighted visitor sees: its children that aren't hidden. */
const shown = (el: HTMLElement): string[] =>
  [...el.children].filter((c) => !c.closest("[hidden]")).map((c) => textOf(c));

const card = (input: HTMLInputElement): HTMLLabelElement => {
  const label = input.closest("label");
  if (!label) throw new Error(`no card for ${input.value}`);
  return label;
};

/** One task later: what `setTimeout(…, 0)` scheduled has run (the jsdom window's own timers, in order). */
const tasks = (v: Visit): Promise<void> =>
  new Promise((resolve) => {
    v.win.setTimeout(resolve, 0);
  });

const pointer = (v: Visit, target: Element, type: string): void => {
  const Ctor = v.win.PointerEvent ?? v.win.MouseEvent;
  target.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button: 0, pointerType: "mouse" }));
};

const click = (v: Visit, target: Element, detail: number): boolean =>
  target.dispatchEvent(new v.win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail }));

const key = (v: Visit, target: Element, type: "keydown" | "keyup", k: string): boolean =>
  target.dispatchEvent(new v.win.KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));

const inStep = (v: Visit, n: 1 | 2): boolean => step(v.doc, n).contains(v.doc.activeElement);

describe("the selection screen's two steps (FR-024 to FR-027)", () => {
  it("numbers the steps in his words, with step 1's instruction, the hint, and Enter after them", () => {
    const v = start();
    expect([...v.doc.querySelectorAll(".choice-form > fieldset > legend")].map((l) => textOf(l))).toEqual([
      "Step 1: Select your role",
      "Step 2: Select your avatar",
    ]);
    const first = step(v.doc, 1);
    const afterLegend = first.querySelector(":scope > legend")?.nextElementSibling;
    expect(afterLegend?.tagName).toBe("P");
    expect(textOf(afterLegend ?? null)).toBe("Choosing a role takes you to step 2.");
    expect(textOf(v.doc.getElementById("choice-hint"))).toBe("Choose a role and an avatar to enter.");
    expect(textOf(v.doc.querySelector("h1"))).toBe("The Author's work area");
    const form = v.doc.querySelector(".choice-form");
    expect([...(form?.children ?? [])].map((c) => c.tagName)).toEqual(["FIELDSET", "FIELDSET", "P", "BUTTON"]);
  });

  it("gives step 1 a card per role, each a label holding its radio, its mark, and its name", () => {
    const v = start();
    const roles = radios(v.doc, "path");
    expect(roles.map((r) => [r.value, nameOf(r), legendOf(r)])).toEqual(
      ROLES.map((r) => [r.value, r.name, "Step 1: Select your role"]),
    );
    for (const r of roles) {
      const c = card(r);
      expect(c.classList.contains("choice-option"), r.value).toBe(true);
      expect(c.classList.contains("choice-card"), r.value).toBe(true);
      expect(step(v.doc, 1).contains(c)).toBe(true);
      const mark = c.querySelector("svg.choice-mark");
      expect(mark, r.value).not.toBeNull();
      expect(mark?.getAttribute("aria-hidden")).toBe("true");
      expect(mark?.querySelector("path"), r.value).not.toBeNull();
    }
  });

  it("describes each role's radio by its description, and its outcome card isn't a live region", () => {
    const v = start();
    for (const [i, r] of radios(v.doc, "path").entries()) expect(described(r)).toBe(ROLES[i]?.description);
    const out = outcome(v.doc);
    expect(step(v.doc, 1).contains(out)).toBe(true);
    expect(out.closest("[aria-live], [role='status'], [role='alert'], [role='log']")).toBeNull();
    expect(out.querySelector("[aria-live], [role='status'], [role='alert'], [role='log']")).toBeNull();
  });

  it("shows the outcome card's three states: before a choice, and each role's description and the line under both", () => {
    const v = start();
    expect(shown(outcome(v.doc))).toEqual([ROLE_EMPTY]);
    radio(v.doc, "path", "engineer").click();
    expect(shown(outcome(v.doc))).toEqual([ROLES[0].description, ROLE_COMMON]);
    radio(v.doc, "path", "non-engineer").click();
    expect(shown(outcome(v.doc))).toEqual([ROLES[1].description, ROLE_COMMON]);
    // Not a live region, so the room's announcer stays empty before "Enter".
    expect(textOf(announcer(v.doc))).toBe("");
  });

  it("gives step 2 a character card per visitor: its picture, its name, and its line, in the code's order", () => {
    const v = start();
    const avatars = radios(v.doc, "avatar");
    expect(avatars.map((r) => [r.value, nameOf(r), legendOf(r), described(r)])).toEqual(
      AVATARS.map((a) => [a.value, a.name, "Step 2: Select your avatar", a.line]),
    );
    for (const r of avatars) {
      const c = card(r);
      expect(c.classList.contains("choice-card"), r.value).toBe(true);
      expect(step(v.doc, 2).contains(c)).toBe(true);
      const picture = c.querySelector("svg.avatar-preview");
      expect(picture, r.value).not.toBeNull();
      expect(picture?.getAttribute("aria-hidden")).toBe("true");
      // The line is on the card, where a sighted visitor reads it.
      const line = v.doc.getElementById(r.getAttribute("aria-describedby") ?? "");
      expect(line && c.contains(line), r.value).toBe(true);
    }
  });

  it("chooses nothing for the visitor, and each card's 'Selected' word is hidden from assistive technology", () => {
    const v = start();
    const all = [...radios(v.doc, "path"), ...radios(v.doc, "avatar")];
    expect(all.some((r) => r.checked)).toBe(false);
    for (const r of all) {
      const c = card(r);
      const word = c.querySelector(".choice-selected");
      expect(textOf(word), r.value).toBe("Selected");
      expect(word?.getAttribute("aria-hidden"), r.value).toBe("true");
      const check = c.querySelector("svg.choice-check");
      expect(check?.getAttribute("aria-hidden"), r.value).toBe("true");
    }
    radio(v.doc, "avatar", "dinosaur").click();
    expect(radio(v.doc, "avatar", "dinosaur").checked).toBe(true);
    expect(radios(v.doc, "avatar").filter((r) => r.checked)).toHaveLength(1);
  });
});

describe("the focus move to step 2 (FR-032, Q10, rework-cd.md S-9)", () => {
  it("moves on a pointer's click on a role card, after the click and the label's activation, not on pointerup", async () => {
    const v = start();
    await flush();
    const role = radio(v.doc, "path", "non-engineer");
    const label = card(role);
    // A press and a release alone move nothing to step 2. A label isn't focusable, so focus after them is on the
    // body, not in step 1 (rv-rework-spec-029cd's RC-2): the case asserts only that it isn't in step 2.
    pointer(v, label, "pointerdown");
    pointer(v, label, "pointerup");
    await tasks(v);
    expect(inStep(v, 2)).toBe(false);
    // The pointer's own click on the label (a click, detail 1), then the label's activation, which focuses the radio
    // in step 1 as a browser does (jsdom doesn't).
    pointer(v, label, "pointerdown");
    pointer(v, label, "pointerup");
    click(v, label, 1);
    role.focus();
    expect(role.checked).toBe(true);
    await tasks(v);
    expect(v.doc.activeElement).toBe(radio(v.doc, "avatar", "woman"));
    expect(shown(outcome(v.doc))).toEqual([ROLES[1].description, ROLE_COMMON]);
  });

  it("moves to step 2's chosen card, if one is chosen, else its first", async () => {
    const v = start();
    await flush();
    radio(v.doc, "avatar", "dog").click();
    const label = card(radio(v.doc, "path", "engineer"));
    click(v, label, 1);
    radio(v.doc, "path", "engineer").focus();
    await tasks(v);
    expect(v.doc.activeElement).toBe(radio(v.doc, "avatar", "dog"));
  });

  it("moves on Enter on a role card, choosing it, and Enter in step 1 submits nothing", async () => {
    const v = start();
    await flush();
    radio(v.doc, "avatar", "man").click();
    const role = radio(v.doc, "path", "engineer");
    role.focus();
    const notPrevented = key(v, role, "keydown", "Enter");
    expect(notPrevented).toBe(false);
    expect(role.checked).toBe(true);
    expect(shown(outcome(v.doc))).toEqual([ROLES[0].description, ROLE_COMMON]);
    key(v, role, "keyup", "Enter");
    await tasks(v);
    expect(v.doc.activeElement).toBe(radio(v.doc, "avatar", "man"));
    // Both are chosen, and still nothing started: Enter in step 1 isn't the form's submission.
    v.clock.advance(5000);
    expect(v.room.visit.stage).toBe("choosing");
    expect(v.events).toEqual([]);
  });

  it("moves on Space on a role card, checking it on keyup itself (the browser's click is keyup's default action, after the page's listeners)", async () => {
    const v = start();
    await flush();
    // A keyboard visitor Tabs into step 1: no role checked, focus on a role radio. Only keydown and keyup Space are
    // dispatched, since a browser's click on the radio comes after keyup's listeners (and jsdom fires none), so the
    // page checks the radio itself, sends its change, and only then moves (rv-rework-spec-029cd's RC-1).
    const role = radio(v.doc, "path", "engineer");
    role.focus();
    expect(role.checked).toBe(false);
    key(v, role, "keydown", " ");
    key(v, role, "keyup", " ");
    expect(role.checked).toBe(true);
    expect(shown(outcome(v.doc))).toEqual([ROLES[0].description, ROLE_COMMON]);
    await tasks(v);
    expect(role.checked).toBe(true);
    expect(shown(outcome(v.doc))).toEqual([ROLES[0].description, ROLE_COMMON]);
    expect(inStep(v, 2)).toBe(true);
    expect(v.doc.activeElement).toBe(radio(v.doc, "avatar", "woman"));
  });

  it("keeps focus in step 1 on the arrow keys, whose click (detail 0) and change choose the next role", async () => {
    const v = start();
    await flush();
    const first = radio(v.doc, "path", "engineer");
    const second = radio(v.doc, "path", "non-engineer");
    first.focus();
    // As a browser does: the arrow selects and focuses the next radio and fires a click with detail 0 and a change.
    for (const [from, to] of [
      [first, second],
      [second, first],
      [first, second],
    ] as const) {
      key(v, from, "keydown", "ArrowDown");
      to.focus();
      click(v, to, 0);
      to.dispatchEvent(new v.win.Event("change", { bubbles: true }));
      key(v, to, "keyup", "ArrowDown");
      await tasks(v);
      await tasks(v);
      expect(to.checked).toBe(true);
      expect(v.doc.activeElement).toBe(to);
    }
    expect(shown(outcome(v.doc))).toEqual([ROLES[1].description, ROLE_COMMON]);
  });

  it("never moves focus from step 2: a click or a key there stays there", async () => {
    const v = start();
    await flush();
    const avatar = radio(v.doc, "avatar", "dinosaur");
    avatar.focus();
    click(v, card(avatar), 1);
    key(v, avatar, "keydown", " ");
    key(v, avatar, "keyup", " ");
    await tasks(v);
    expect(v.doc.activeElement).toBe(avatar);
  });
});

describe("nothing before Enter (FR-029, FR-030)", () => {
  it("fetches, sends, and stores nothing while the visitor chooses, by pointer and by key", async () => {
    const v = start({ webgl: true });
    await flush();
    const role = radio(v.doc, "path", "engineer");
    click(v, card(role), 1);
    role.focus();
    await tasks(v);
    key(v, radio(v.doc, "path", "non-engineer"), "keydown", "Enter");
    await tasks(v);
    for (const a of radios(v.doc, "avatar")) click(v, card(a), 1);
    await tasks(v);
    v.clock.advance(10_000);
    await flush();
    expect(v.spies.network).toEqual([]);
    expect(v.spies.assets).toEqual([]);
    expect(v.spies.beacons).toEqual([]);
    expect(v.spies.storage).toEqual([]);
    expect(v.events).toEqual([]);
    expect(v.roomDataLoads()).toBe(0);
    expect(v.room.visit.stage).toBe("choosing");
    const enterButton = [...v.doc.querySelectorAll("button")].find((b) => nameOf(b) === "Enter");
    expect(enterButton?.disabled).toBe(false);
  });
});

describe("screen readers (FR-033)", () => {
  it("has 0 axe violations with the screen empty, step 1 chosen, and both chosen", async () => {
    const empty = start();
    expect(await axeViolations(empty), "empty").toEqual([]);
    const one = start();
    await flush();
    radio(one.doc, "path", "non-engineer").click();
    expect(await axeViolations(one), "step 1 chosen").toEqual([]);
    radio(one.doc, "avatar", "dog").click();
    expect(await axeViolations(one), "both chosen").toEqual([]);
  }, 60_000);
});

// --- The look, from choice.css (FR-028, FR-034, FR-035) -------------------------------------------------------------

const CSS_PATH = join(WEB, "src/choice/choice.css");
const css = (): ReturnType<typeof parseCss> => parseCss(readFileSync(CSS_PATH, "utf8"));

const atRule = (pattern: RegExp): { prelude: string; body: string }[] =>
  css().atRules.filter((a) => pattern.test(a.prelude));

const declared = (rules: readonly CssRule[], selector: RegExp, property: string): string[] =>
  rules.filter((r) => selector.test(r.selector)).flatMap((r) => r.declarations.get(property) ?? []);

/** A #rrggbb's contrast against white. */
function onWhite(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return 1.05 / (l + 0.05);
}

const hexes = (value: string): string[] => value.match(/#[0-9a-fA-F]{6}\b/g) ?? [];

/** A grid-template-columns value's tracks, with repeat(n, …) expanded. */
function tracks(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value.trim()) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === " " && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.flatMap((t) => {
    const m = /^repeat\((\d+),\s*(.+)\)$/.exec(t);
    return m ? Array.from({ length: Number(m[1]) }, () => m[2] ?? "") : [t];
  });
}

/** The rules in effect at a window `width` px wide: the top level, then each `(max-width: Nrem)` block that applies. */
function rulesAt(width: number): CssRule[] {
  const sheet = css();
  const out = [...sheet.rules];
  for (const a of sheet.atRules) {
    const m = /^@media\s*\(max-width:\s*([\d.]+)rem\)$/.exec(a.prelude);
    if (m && width <= Number(m[1]) * 16) out.push(...parseCss(a.body).rules);
  }
  return out;
}

const columnsAt = (width: number, selector: string): number => {
  const values = declared(rulesAt(width), new RegExp(`^${selector.replace(".", "\\.")}$`), "grid-template-columns");
  const last = values.at(-1);
  if (!last) throw new Error(`no grid-template-columns for ${selector} at ${width}`);
  return tracks(last).length;
};

describe("the cards' look (FR-028)", () => {
  it("shows a chosen card by more than colour: a border at 3:1, a check mark, and the word 'Selected'", () => {
    const top = css().rules;
    const chosen = top.filter((r) => /^\.choice-card:has\(input:checked\)$/.test(r.selector.trim()));
    expect(chosen.length).toBeGreaterThan(0);
    const colours = chosen.flatMap((r) => [
      ...hexes(r.declarations.get("border-color") ?? ""),
      ...hexes(r.declarations.get("box-shadow") ?? ""),
    ]);
    expect(colours.length).toBeGreaterThan(0);
    for (const c of colours) expect(onWhite(c), c).toBeGreaterThanOrEqual(3);
    // The mark and the word are hidden on an unchosen card, shown on a chosen one.
    for (const part of [".choice-check", ".choice-selected"]) {
      expect(declared(top, new RegExp(`^\\.choice-card ${part.replace(".", "\\.")}$`), "display")).toEqual(["none"]);
      const on = declared(
        top,
        new RegExp(`^\\.choice-card:has\\(input:checked\\) ${part.replace(".", "\\.")}$`),
        "display",
      );
      expect(on.length, part).toBe(1);
      expect(on[0], part).not.toBe("none");
    }
  });

  it("keeps the radio behind its card focusable and in the accessibility tree, and rings the card on focus", () => {
    const v = start();
    const input = radio(v.doc, "path", "engineer");
    for (const r of css().rules.filter((x) => matchesRule(input, x.selector))) {
      expect(r.declarations.get("display"), r.selector).not.toBe("none");
      expect(r.declarations.get("visibility") ?? "visible", r.selector).toBe("visible");
    }
    expect(input.hidden).toBe(false);
    expect(input.getAttribute("aria-hidden")).toBeNull();
    expect(input.getAttribute("tabindex")).toBeNull();
    const ring = css().rules.find((r) => r.selector.includes(".choice-card:has(input:focus-visible)"));
    const m = /^(\d+)px\s+solid\s+(#[0-9a-fA-F]{6})$/.exec(ring?.declarations.get("outline") ?? "");
    expect(m, "the card's focus ring").not.toBeNull();
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(2);
    expect(onWhite(m?.[2] ?? "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("gives hover and focus looks of their own, distinct from the chosen one", () => {
    const top = css().rules;
    const chosen = top.find((r) => r.selector.trim() === ".choice-card:has(input:checked)");
    const hover = top.find((r) => r.selector.trim() === ".choice-card:hover");
    const focus = top.find((r) => r.selector.includes(".choice-card:has(input:focus-visible)"));
    for (const [name, rule] of [
      ["hover", hover],
      ["focus", focus],
    ] as const) {
      expect(rule, name).toBeDefined();
      const same = [...(rule?.declarations ?? [])].every(([k, value]) => chosen?.declarations.get(k) === value);
      expect(same, `${name} looks like chosen`).toBe(false);
    }
  });

  it("keeps a chosen card's system-colour border, its check mark, and its word in forced colours", () => {
    const blocks = atRule(/forced-colors:\s*active/);
    expect(blocks.length).toBeGreaterThan(0);
    const inner = blocks.flatMap((b) => parseCss(b.body).rules);
    expect(declared(inner, /^\.choice-card:has\(input:checked\)$/, "border-color")).toEqual(["Highlight"]);
    for (const r of inner) expect(r.declarations.get("display"), r.selector).not.toBe("none");
  });
});

describe("motion (FR-034)", () => {
  it("moves a card only under prefers-reduced-motion: no-preference, at most 150 ms", () => {
    const sheet = css();
    for (const r of sheet.rules) {
      for (const p of ["transition", "transform", "animation"]) {
        expect(r.declarations.get(p), `${r.selector} ${p} outside no-preference`).toBeUndefined();
      }
    }
    for (const a of sheet.atRules.filter((x) => !/prefers-reduced-motion:\s*no-preference/.test(x.prelude))) {
      expect(a.body, a.prelude).not.toMatch(/\b(transition|transform|animation)\s*:/);
    }
    const motion = atRule(/prefers-reduced-motion:\s*no-preference/).flatMap((b) => parseCss(b.body).rules);
    expect(motion.length).toBeGreaterThan(0);
    for (const value of motion.flatMap((r) => r.declarations.get("transition") ?? [])) {
      for (const ms of value.match(/[\d.]+m?s\b/g) ?? []) {
        const n = ms.endsWith("ms") ? Number(ms.slice(0, -2)) : Number(ms.slice(0, -1)) * 1000;
        expect(n, value).toBeLessThanOrEqual(150);
      }
    }
    for (const value of motion.flatMap((r) => r.declarations.get("transform") ?? [])) {
      const lift = /translateY\((-?[\d.]+)px\)/.exec(value);
      expect(lift, value).not.toBeNull();
      expect(Math.abs(Number(lift?.[1]))).toBeLessThanOrEqual(2);
    }
  });

  it("keeps room.css's rule that stills the choice screen under reduced motion", () => {
    const room = parseCss(readFileSync(join(WEB, "src/room/room.css"), "utf8"));
    const reduce = room.atRules.filter((a) => /prefers-reduced-motion:\s*reduce/.test(a.prelude));
    expect(
      reduce.some((a) =>
        parseCss(a.body).rules.some((r) => r.selector.split(",").some((s) => s.trim() === ".choice *")),
      ),
    ).toBe(true);
  });
});

describe("the layouts (FR-035)", () => {
  it("puts step 1's cards and the outcome card in a row, and step 2's four cards in a row, at 1280 px", () => {
    expect(columnsAt(1280, ".choice-roles")).toBe(3);
    expect(columnsAt(1280, ".choice-avatars")).toBe(4);
  });

  it("stacks step 1 and takes two columns for step 2 below 40rem (600 px)", () => {
    expect(columnsAt(600, ".choice-roles")).toBe(1);
    expect(columnsAt(600, ".choice-avatars")).toBe(2);
  });

  it("takes one column below 22rem (320 px), with no track or width that scrolls sideways", () => {
    expect(columnsAt(320, ".choice-roles")).toBe(1);
    expect(columnsAt(320, ".choice-avatars")).toBe(1);
    // 320 px less the body's 1rem padding each side, the fieldset's, and a margin: nothing wider than 16rem.
    for (const r of rulesAt(320)) {
      for (const p of ["width", "min-width", "flex-basis"]) {
        const value = r.declarations.get(p);
        if (value === undefined) continue;
        expect(px(value) || 0, `${r.selector} ${p}: ${value}`).toBeLessThanOrEqual(256);
      }
      const grid = r.declarations.get("grid-template-columns");
      if (grid) for (const t of tracks(grid)) expect(t, `${r.selector}: ${grid}`).toMatch(/^minmax\(0,\s*[\d.]+fr\)$/);
    }
  });

  it("widens the page to 64rem for the choice screen alone, and keeps every card at least 44 × 44 px", () => {
    const top = css().rules;
    expect(declared(top, /^body:has\(\.choice\)$/, "max-width")).toEqual(["64rem"]);
    const v = start();
    const room = parseCss(readFileSync(join(WEB, "src/room/room.css"), "utf8")).rules;
    for (const r of [...radios(v.doc, "path"), ...radios(v.doc, "avatar")]) {
      const c = card(r);
      const sizes = [...room, ...top].filter((x) => matchesRule(c, x.selector));
      const h = Math.max(...sizes.map((x) => px(x.declarations.get("min-height")) || 0));
      const w = Math.max(...sizes.map((x) => px(x.declarations.get("min-width")) || 0));
      expect(h, r.value).toBeGreaterThanOrEqual(44);
      expect(w, r.value).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("the dinosaur's line, held to the composed room (FR-031)", () => {
  it("names eating only while the room's bundle carries its model and the desk is edible, with others besides", () => {
    const bundle = repositoryBundle();
    expect(Object.hasOwn(bundle.scene.avatars, "dinosaur")).toBe(true);
    const ui = bundle.index.ui as Readonly<Record<string, string>>;
    const edible = bundle.scene.placements
      .filter((p) => p.edible)
      .map((p) => (p.label ? (ui[p.label] ?? p.label) : p.id));
    // "the desk and a few other things in the room": the desk, and at least two more.
    expect(edible).toContain("Desk");
    expect(edible.length).toBeGreaterThanOrEqual(3);
    const v = start();
    const line = described(radio(v.doc, "avatar", "dinosaur"));
    expect(line).toContain("In the 3D room it can eat chunks of the desk and a few other things in the room");
    // The scene with the twin and the dog leaving stays a surprise; the dog's line names no breed and no likeness.
    expect(line).not.toMatch(/run off|leave/);
    const dog = described(radio(v.doc, "avatar", "dog"));
    expect(dog).not.toMatch(/Retriever|Toller|likeness|breed/i);
  });

  it("names no piece or placement by its ID on any card (spec 004's FR-007: a piece's move stays a data edit)", () => {
    const scene = repositoryBundle().scene;
    const ids = new Set([...scene.placements.map((p) => p.id), ...Object.keys(scene.pieces)]);
    expect(ids.size).toBeGreaterThan(0);
    const v = start();
    const words = [
      ...radios(v.doc, "path").map((r) => described(r)),
      ...radios(v.doc, "avatar").map((r) => described(r)),
      textOf(v.doc.querySelector(".choice")),
    ];
    for (const text of words) {
      for (const id of ids) {
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        expect(new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(text), `${id} in "${text}"`).toBe(false);
      }
    }
  });
});
