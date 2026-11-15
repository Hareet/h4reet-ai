// T-A04 (spec 028; FR-011, SC-002; Q5; plan.md §R-A4): the split list's entries and their key cap. On main the
// selected entry's "Enter" cap sat at a fixed `right: -2.25rem`, in the list's padding, sized for "Esc", and "Enter"
// reached over the words ("Snowboard"'s highlight and the Enter hint overlapped, in the Author's review). Each row is
// now a grid of two cells, the words and a cap slot as wide as "Enter"'s cap at every scale, the cap static in the
// second cell; the selected words' larger size fits the row; no row's geometry depends on the selection; and room.css's
// inset ring, the column's selection look, doesn't apply to the split list's buttons, whose own look is spec 018's.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { HUD_PLACEMENTS } from "../../src/room/compose/hud";
import { KEYCAP, keycapWidthRem } from "../../src/room/hud/keycap";
import { createSplit } from "../../src/room/hud/split";
import { parseCss } from "../helpers/room";

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const SPLIT = parseCss(read("../../src/room/hud/split.css")).rules;
const ROOM = parseCss(read("../../src/room/room.css"));
const ON = 'html[data-split="on"][data-hud="column"]';

/** The last rule naming `selector` exactly in its selector list that sets `property`. */
const decl = (selector: string, property: string): string =>
  SPLIT.filter(
    (r) =>
      r.selector
        .split(",")
        .map((x) => x.trim())
        .includes(selector) && r.declarations.has(property),
  )
    .at(-1)
    ?.declarations.get(property) ?? "";
const em = (value: string): number => {
  const m = /^([\d.]+)em$/.exec(value.trim());
  if (!m) throw new Error(`not in em: ${value}`);
  return Number(m[1]);
};

describe("the key cap's metrics (FR-011)", () => {
  it("are split.css's .hud-keycap: its type, padding, least width, and border", () => {
    const cap = parseCss(read("../../src/room/hud/split.css")).rules.find((r) => r.selector.trim() === ".hud-keycap");
    expect(cap?.declarations.get("min-width")).toBe(`${KEYCAP.minWidthRem}rem`);
    expect(cap?.declarations.get("padding")).toBe(`0 ${KEYCAP.padXRem}rem`);
    expect(cap?.declarations.get("font")).toBe(`${KEYCAP.fontRem}rem/1 var(--figure-font)`);
    expect(cap?.declarations.get("border")).toBe(`${KEYCAP.borderPx}px solid var(--tile-border)`);
    // IBM Plex Mono's advance is 600 units of 1000: "Enter" is five of them.
    expect(KEYCAP.advanceEm).toBe(0.6);
    expect(keycapWidthRem("Enter")).toBeCloseTo(5 * 0.6 * 0.75 + 2 * 0.375 + 2 / 16, 9);
    expect(keycapWidthRem("Esc")).toBeLessThan(keycapWidthRem("Enter"));
  });
});

describe("each entry is a row of two cells (FR-011; Q5)", () => {
  it("lays each row as a grid: the words' cell and the cap slot", () => {
    expect(decl(`${ON} .room-list li`, "display")).toBe("grid");
    expect(decl(`${ON} .room-list li`, "grid-template-columns")).toBe("minmax(0, 1fr) var(--cap-slot)");
    expect(decl(`${ON} .room-list li button`, "grid-column")).toBe("1");
    expect(decl(`${ON} .room-list li button`, "justify-self")).toBe("end");
  });

  it("makes the cap slot at least as wide as \"Enter\"'s cap at both scales, the type in the list's em", () => {
    const slot = em(decl(`${ON} .room-list`, "--cap-slot"));
    expect(decl(`${ON} .room-list`, "font-size")).toBe("calc(1rem * var(--wall-scale-right))");
    for (const scale of [1, HUD_PLACEMENTS.wall.scaleMax])
      expect(slot * scale, `at ${scale}`).toBeGreaterThanOrEqual(keycapWidthRem("Enter"));
  });

  it("puts the confirm cap in the second cell, static, never over the words", () => {
    expect(decl(`${ON} .split-confirm`, "position")).toBe("static");
    expect(decl(`${ON} .split-confirm`, "grid-column")).toBe("2");
    expect(decl(`${ON} .split-confirm`, "grid-row")).toBe("1");
    expect(decl(`${ON} .split-confirm`, "right")).toBe("");
    // The strokes span the words' cell alone, ending before the slot.
    expect(decl(`${ON} .split-stroke`, "right")).toContain("var(--cap-slot)");
    // The list's entries need no padding for a cap hung outside them.
    expect(decl(`${ON} .room-list ul`, "padding")).toBe("0");
  });

  it("fits the selected words' larger size in the row's height", () => {
    const row = em(decl(`${ON} .room-list li`, "height"));
    const font = decl(`${ON} .room-list li[data-selected] button`, "font-size");
    const lineHeight = Number(/\/([\d.]+)/.exec(decl(`${ON} .room-list li button`, "font"))?.[1] ?? "NaN");
    expect(em(font) * lineHeight).toBeLessThanOrEqual(row);
  });

  it("gives no row another geometry when the selection moves: no selected rule sets a size or the grid", () => {
    for (const r of SPLIT.filter((x) => /\[data-selected\]/.test(x.selector)))
      for (const name of ["height", "width", "grid-template-columns", "padding", "margin", "line-height", "position"])
        expect(r.declarations.has(name), `${r.selector} sets ${name}`).toBe(false);
  });

  it("appends the selected entry's cap to its row, after its button, and to no other row", () => {
    const dom = new JSDOM(
      '<body><div class="room-list"><h2 class="room-list-heading"></h2><ul>' +
        '<li><button data-object-id="a">Snowboard</button></li><li><button data-object-id="b">Bicycle</button></li>' +
        '</ul></div><section class="talk"><div class="talk-head"></div></section></body>',
    );
    const doc = dom.window.document;
    const s = createSplit(doc, {
      talk: doc.querySelector(".talk") as HTMLElement,
      list: doc.querySelector(".room-list") as HTMLElement,
      words: { select: "Select a piece", back: "Back", close: "Close", esc: "Esc", enter: "Enter" },
      stats: () => [],
      turnOut: () => false,
      walking: () => false,
    });
    s.setActive(true);
    s.setTarget("a");
    const rows = [...doc.querySelectorAll("li")];
    const cap = rows[0]?.querySelector(".split-confirm");
    expect(cap?.textContent).toBe("Enter");
    expect(rows[0]?.querySelector("button")?.compareDocumentPosition(cap as Node)).toBe(4);
    expect(rows[1]?.querySelector(".split-confirm")).toBeNull();
  });
});

describe("room.css's inset ring leaves the split list alone (FR-011)", () => {
  /** A selector's specificity as [ids, classes and attributes and pseudo-classes, types]: enough for these selectors. */
  const specificity = (selector: string): [number, number, number] => {
    const ids = (selector.match(/#[\w-]+/g) ?? []).length;
    const classes = (selector.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
    const types = (selector.replace(/\[[^\]]*\]|\.[\w-]+|:[\w-]+/g, " ").match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length;
    return [ids, classes, types];
  };
  const outranks = (a: [number, number, number], b: [number, number, number]): boolean =>
    a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

  it("resets every hover and aria-current ring of the panels on the split list's buttons, by a rule that outranks it", () => {
    const all = [...ROOM.rules, ...ROOM.atRules.flatMap((a) => parseCss(a.body).rules)];
    const ringed = all
      .flatMap((r) => r.selector.split(",").map((x) => ({ selector: x.trim(), r })))
      .filter(
        ({ selector, r }) =>
          /\.hud-panels button(\[aria-current="true"\]|:hover)$/.test(selector) &&
          /inset/.test(r.declarations.get("box-shadow") ?? ""),
      );
    expect(ringed.length).toBeGreaterThan(0);
    for (const [state, reset] of [
      [":hover", `${ON} .room-list li button:hover`],
      ['[aria-current="true"]', `${ON} .room-list li button[aria-current="true"]`],
    ] as const) {
      expect(decl(reset, "box-shadow"), reset).toBe("none");
      expect(decl(reset, "border-color"), reset).toBe("transparent");
      for (const { selector } of ringed.filter((x) => x.selector.endsWith(state)))
        expect(outranks(specificity(reset), specificity(selector)), `${reset} over ${selector}`).toBe(true);
    }
  });
});
