// rework-024 (spec 024; FR-012; plan.md §5.5's T011b departure; rv-impl-024's B-2): where room.css puts the "Eat" tile,
// read through the cascade. The real layout (layout.ts) in the document, its root's attributes set by applyHud as the
// room sets them, and every room.css rule that matches the tile, the winner for each placing property chosen by
// specificity and then source order, as a browser chooses it. In the stacked layout the tile sits beside the walking
// control whatever the Eat box; in a HUD layout it sits at --eat-x/--eat-y where the room sets them, and is not offered
// where the HUD layout has no Eat box, since nothing places it there.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import type { Box } from "../../src/room/compose/hud";
import { renderRoom } from "../../src/room/layout";
import type { HudApplied, RoomLayout } from "../../src/room/layout";
import { parseCss, stylesheets } from "../helpers/room";

const ROOM_CSS = stylesheets().filter((s) => /[\\/]room\.css$/.test(s.path));
/** room.css's top-level rules, one per selector, in source order (the at-rules' are conditional and place nothing). */
const RULES = ROOM_CSS.flatMap((s) =>
  parseCss(s.text).rules.flatMap((r) =>
    r.selector.split(",").map((selector) => ({ selector: selector.trim(), declarations: r.declarations })),
  ),
);

/** A selector's specificity, for the plain selectors room.css writes. */
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

/** Whether `a` outranks `b` strictly; at a tie the later rule wins. */
const outranks = (a: [number, number, number], b: [number, number, number]): boolean =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

const PLACING = ["left", "top", "right", "bottom"] as const;
type Placing = Partial<Record<(typeof PLACING)[number], string>>;

/** The cascade's winner for each placing property over every room.css rule matching `el`, and the winning selectors. */
function placed(el: Element): { values: Placing; by: Set<string> } {
  const values: Placing = {};
  const by = new Set<string>();
  const best = new Map<string, { spec: [number, number, number]; order: number; selector: string }>();
  RULES.forEach((r, order) => {
    const matches = ((): boolean => {
      try {
        return el.matches(r.selector);
      } catch {
        return false;
      }
    })();
    if (!matches) return;
    const spec = specificity(r.selector);
    for (const p of PLACING) {
      const v = r.declarations.get(p);
      if (v === undefined) continue;
      const was = best.get(p);
      const wins = !was || !outranks(was.spec, spec);
      if (wins) {
        best.set(p, { spec, order, selector: r.selector });
        values[p] = v;
      }
    }
  });
  for (const b of best.values()) by.add(b.selector);
  return { values, by };
}

const BOX: Box = { x: 0, y: 0, w: 0, h: 0 };

function applied(layout: HudApplied["layout"], eat: Box | null): HudApplied {
  return {
    layout,
    state: { list: "open" },
    metrics: { rem: 16, safe: { top: 0, right: 0, bottom: 0, left: 0 }, strip: 0 },
    strip: 0,
    bar: 0,
    column: 0,
    dock: 0,
    clear: { x: 300, y: 50, w: 900, h: 600 },
    frame: BOX,
    compact: { strip: BOX, bar: BOX, column: null, walk: BOX, walkPlace: "stage", eat },
    logRest: 0,
    notes: 0,
    keyboard: 0,
    split: null,
  } as unknown as HudApplied;
}

function layoutIn(): { layout: RoomLayout; doc: Document } {
  const doc = new JSDOM("<!doctype html><html><body></body></html>").window.document;
  const div = (): HTMLElement => doc.createElement("div");
  const layout = renderRoom(doc, {
    list: div(),
    talk: div(),
    around: div(),
    pause: "Pause the room",
    walk: { enter: "Walk", leave: "Stop walking", region: "region", help: "help" },
    eat: { button: "Eat" },
  });
  doc.body.append(layout.element);
  return { layout, doc };
}

const EAT_BOX: Box = { x: 1000, y: 600, w: 128, h: 44 };
const readsEat = (p: Placing): boolean => Object.values(p).some((v) => /--eat-/.test(v ?? ""));

describe("the Eat tile's place, through the cascade (FR-012; B-2)", () => {
  it("sits beside the walking control in the stacked layout, with or without an Eat box, nothing reading --eat-x/-y", () => {
    for (const eat of [null, EAT_BOX]) {
      const { layout } = layoutIn();
      layout.applyHud(applied("stacked", eat));
      layout.setEatOffered(true);
      const p = placed(layout.eatButton);
      expect(readsEat(p.values), `stacked, ${eat ? "an" : "no"} Eat box: ${[...p.by].join(" | ")}`).toBe(false);
      expect(p.values.right).toBe("8.75rem");
      expect(p.values.bottom).toBe("0.5rem");
      expect(p.values.left ?? "auto").toBe("auto");
      expect(p.values.top ?? "auto").toBe("auto");
      expect(layout.eatButton.hidden, "offered in the stacked layout").toBe(false);
    }
  });

  it("sits at --eat-x/--eat-y in each HUD layout with an Eat box", () => {
    for (const hud of ["column", "dock"] as const) {
      const { layout, doc } = layoutIn();
      layout.applyHud(applied(hud, EAT_BOX));
      layout.setEatOffered(true);
      expect(doc.documentElement.style.getPropertyValue("--eat-x")).toBe("1000px");
      const p = placed(layout.eatButton);
      expect(p.values.left, hud).toBe("calc(var(--eat-x) - var(--clear-x))");
      expect(p.values.top, hud).toBe("calc(var(--eat-y) - var(--clear-y))");
      expect(p.values.right, hud).toBe("auto");
      expect(p.values.bottom, hud).toBe("auto");
      expect(layout.eatButton.hidden, hud).toBe(false);
    }
  });

  it("isn't offered in a HUD layout with no Eat box, nor placed there by a rule reading unset properties", () => {
    for (const hud of ["column", "dock"] as const) {
      const { layout, doc } = layoutIn();
      layout.setEatOffered(true);
      layout.applyHud(applied(hud, null));
      expect(doc.documentElement.style.getPropertyValue("--eat-x")).toBe("");
      expect(readsEat(placed(layout.eatButton).values), hud).toBe(false);
      expect(layout.eatButton.hidden, `${hud}, no Eat box`).toBe(true);
      // The box arrives (the 3D stage's protector, on the next re-fit): the tile the 3D side offers shows.
      layout.applyHud(applied(hud, EAT_BOX));
      expect(layout.eatButton.hidden, `${hud}, the box arrived`).toBe(false);
      // And goes again with the box, the offer standing.
      layout.applyHud(applied(hud, null));
      expect(layout.eatButton.hidden, `${hud}, the box gone`).toBe(true);
      layout.setEatOffered(false);
      layout.applyHud(applied(hud, EAT_BOX));
      expect(layout.eatButton.hidden, `${hud}, not offered`).toBe(true);
    }
  });
});
