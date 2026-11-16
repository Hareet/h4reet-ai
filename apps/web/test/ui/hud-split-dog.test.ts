// Spec 026's human patch, r4 (patch7-026; the page's Q39 and Q42, and patch7-026's question on the list box, each
// provisional): the "Dog" piece is the list's fifth entry, and since spec 028 the split list's box is the column's top
// (compose/hud.ts's wallBoxes; spec 028's FR-007), not spec 018's table height. The list's content is spec 018's model
// (test/ui/hud-model.ts's splitModel: the padding, "Back", the heading's toggle, the "Select a piece" label, a row per
// entry, and the gaps), with each of split.css's em sizes at the column's scale (spec 028's FR-008; --wall-scale-right).
// Held here: at spec 028's split windows of its plan table that hold the whole list, the five entries fit with "Dog";
// over every split stage room:report lists (framedStages of the scene's protector, where wallBoxes takes the window),
// the five fit at no fewer than the screens measured when r4 was built, a floor never loosened; and wherever they
// don't, split.css lets the entries scroll inside the list, "Back" and the label in view (spec 028's FR-007: "the
// entries, scrolling inside the list where they don't fit").
import { describe, expect, it } from "vitest";

import { DEFAULT_METRICS, wallBoxes } from "../../src/room/compose/hud";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import { framedStages } from "../../src/room/compose/stages";
import { parseCss, repositoryBundle, roomIndex, stylesheets } from "../helpers/room";
import { hudWords, splitModel } from "./hud-model";

const WORDS = hudWords(roomIndex());
const REM = DEFAULT_METRICS.rem;
const { scene, index } = repositoryBundle();
const WALL = protectorFor(protectSceneOf(scene, index));
const CSS = parseCss(stylesheets().find((s) => s.path.endsWith("src/room/hud/split.css"))?.text ?? "");

/** A declaration for a selector in the split layout: the last of split.css's rules naming it that declares the
 *  property, as the cascade takes it. */
function splitRule(selector: string, property: string): string | undefined {
  const full = `html[data-split="on"][data-hud="column"] ${selector}`;
  const rules = CSS.rules.filter(
    (r) =>
      r.selector
        .split(",")
        .map((s) => s.trim())
        .includes(full) && r.declarations.has(property),
  );
  return rules.at(-1)?.declarations.get(property);
}

/** The list's content height for `n` entries at the column's scale `s`: split.css's padding (0.5rem above and below)
 *  and gaps (0.25rem, three between "Back", the heading, the label, and the entries) in rem; "Back" (2.75em), the
 *  heading's toggle (counted as "Back", 2.75em, at least room.css's 2.75rem), the label (0.8125em at a line height of
 *  1.5), and each entry's row (3.25em) in the list's em, which is 1rem times the scale. */
function listContent(n: number, s: number, rem = REM): number {
  return 2 * 0.5 * rem + 2.75 * s * rem + 2.75 * s * rem + 0.8125 * 1.5 * s * rem + n * 3.25 * s * rem + 3 * 0.25 * rem;
}

/** The split screens room:report lists, with their list boxes and the column's scale. */
function splitScreens(): { name: string; h: number; scale: number }[] {
  const out: { name: string; h: number; scale: number }[] = [];
  for (const x of framedStages(WALL).screens) {
    const b = wallBoxes(x.screen, x.state, DEFAULT_METRICS, { wall: WALL });
    if (b !== null) out.push({ name: `${x.screen.w}x${x.screen.h}`, h: b.list.h, scale: b.scaleRight });
  }
  return out;
}

describe("the split list holds \"Dog\" (spec 026's human patch, r4; spec 028's FR-007)", () => {
  it('has the five entries, "Dog" last, and the model is spec 018\'s at scale 1', () => {
    expect(WORDS.names).toEqual(["Snowboard", "Bicycle", "Laptop and screen", "Chalkboard", "Dog"]);
    for (const rem of [16, 20])
      expect(listContent(WORDS.names.length, 1, rem)).toBeCloseTo(
        splitModel(WORDS, { ...DEFAULT_METRICS, rem }).listH,
        9,
      );
  });

  it("reads the sizes the model counts from split.css", () => {
    expect(splitRule(".room-list", "padding")).toBe("0.5rem 0.75rem");
    expect(splitRule(".room-list", "gap")).toBe("0.25rem");
    expect(splitRule(".room-list", "font-size")).toBe("calc(1rem * var(--wall-scale-right))");
    expect(splitRule(".room-list li", "height")).toBe("3.25em");
    expect(splitRule(".split-back", "min-height")).toBe("2.75em");
    expect(splitRule(".room-list .split-label", "font")).toMatch(/^0\.8125em\/1\.5 /);
  });

  it("fits the five at spec 028's split windows that hold the whole list", () => {
    for (const s of [
      { w: 1920, h: 1080 },
      { w: 2560, h: 1440 },
      { w: 1920, h: 1200 },
      { w: 1680, h: 1050 },
    ]) {
      const b = wallBoxes(s, undefined, DEFAULT_METRICS, { wall: WALL });
      expect(b, `${s.w}x${s.h}`).not.toBeNull();
      if (b === null) continue;
      expect(b.list.h, `${s.w}x${s.h}`).toBeGreaterThanOrEqual(listContent(WORDS.names.length, b.scaleRight));
    }
  });

  it("fits the five at no fewer split stages than when r4 was built, each one row more than the four", () => {
    const screens = splitScreens();
    const n = WORDS.names.length;
    const five = screens.filter((x) => x.h >= listContent(n, x.scale) - 1e-9);
    const four = new Set(screens.filter((x) => x.h >= listContent(n - 1, x.scale) - 1e-9).map((x) => x.name));
    // Measured on the tree after the 028 stack's merge, 022, and r4 (patch7-026): 1,601 of 3,329 split screens.
    expect(five.length).toBeGreaterThanOrEqual(1601);
    for (const x of five) expect(four.has(x.name), x.name).toBe(true);
    for (const x of screens)
      expect(listContent(n, x.scale) - listContent(n - 1, x.scale)).toBeCloseTo(3.25 * x.scale * REM, 9);
  });

  it("scrolls the entries inside the list where they don't fit, the head kept in view (FR-007)", () => {
    expect(splitRule(".room-list ul", "overflow-y")).toBe("auto");
    expect(splitRule(".room-list ul", "min-height")).toBe("0");
    expect(splitRule(".room-list ul", "flex")).toBe("1 1 auto");
    expect(splitRule(".room-list", "overflow-y")).toBe("hidden");
  });
});
