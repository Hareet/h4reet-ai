// T016 (spec 012; FR-024 to FR-027, FR-042; SC-003; plan.md PD-9, PD-10, PD-18; contracts/loading-progress.md §5): the
// room's page behind the loader. jsdom lays nothing out, so the tints and the card's place are proven by
// loading/loading.css's rules, read here, per layout: a tint is a `::after` overlay, absolute, inset 0, letting the
// pointer through, on the stage's view, the bar, the docked panels, and "Around the room" in the column and dock
// layouts, and on the stage's view, the bar, the list, the conversation, and "Around the room" in the stacked one
// (whose `.hud-panels` is `display: contents`), each tinted element positioned in its layout so its tint stays inside
// it, and never on the AI disclosure, the clear box, the notes, the stand-in line, or the card. The card carries its
// own glass in every layout: fixed below the clear area's top and the notes' reserve, z 4, in the column and dock
// layouts; static in the stacked grid's first row. Through startRoom: data-loading on the page's root while it shows,
// "Around the room" inert with it, nothing behind taking a pointer, the scene held still, and the 3D stage handed the
// loader's giving way, which closes its gate (the gate itself is scene.test.ts's, T005).
import { describe, expect, it } from "vitest";

import { assetEvent } from "../../src/asset-events";
import { LOADING_CEILING_MS } from "../../src/room/quality";
import type { ExpectedFile, SceneOptions } from "../../src/room/stage";
import { enter, flush, parseCss, roomIndex, start, stylesheets } from "../helpers/room";
import type { CssRule, Visit } from "../helpers/room";

const LOADING_CSS = stylesheets().find((s) => s.path.endsWith("src/room/loading/loading.css"))?.text ?? "";
const ROOM_CSS = stylesheets().find((s) => s.path.endsWith("src/room/room.css"))?.text ?? "";
const loadingRules = parseCss(LOADING_CSS);
const roomRules = parseCss(ROOM_CSS);

type Layout = "column" | "dock" | "stacked";
const LAYOUTS: readonly Layout[] = ["column", "dock", "stacked"];
const TINTED: Record<Layout, readonly string[]> = {
  column: [".room-stage-view", ".hud-bar", ".hud-panels", ".room-around"],
  dock: [".room-stage-view", ".hud-bar", ".hud-panels", ".room-around"],
  stacked: [".room-stage-view", ".hud-bar", ".room-list", ".talk", ".room-around"],
};
const NEVER = [".disclosure", ".room-clear", ".room-notes", ".room-note", ".room-stand-in", ".room-loader"];

/** Each selector of each rule, split from its list. */
const selectorsOf = (rules: readonly CssRule[]): { selector: string; rule: CssRule }[] =>
  rules.flatMap((rule) => rule.selector.split(",").map((s) => ({ selector: s.trim(), rule })));

/** Whether a selector applies while the loader shows: the root carries data-loading, or data-loading="on". */
const whileLoading = (selector: string): boolean => /\[data-loading(="on")?\]/.test(selector);
/** The layouts a selector applies in: those its data-hud names, or every one. */
const layoutsOf = (selector: string): Layout[] => {
  const named = /\[data-hud="(column|dock|stacked)"\]/.exec(selector)?.[1] as Layout | undefined;
  return named ? [named] : [...LAYOUTS];
};
/** A tint's element: the class before `::after`. */
const tintedOf = (selector: string): string | null => /(\.[a-z-]+)::after$/.exec(selector)?.[1] ?? null;

/** Whether an element is positioned in a layout, by room.css's rules or loading.css's while loading. */
function positioned(cls: string, layout: Layout): boolean {
  const applies = (selector: string, loading: boolean): boolean => {
    if (!selector.endsWith(cls)) return false;
    const hud = /\[data-hud="(column|dock|stacked)"\]/.exec(selector)?.[1];
    if (hud !== undefined && hud !== layout) return false;
    if (!loading && /\[data-loading/.test(selector)) return false;
    return true;
  };
  let value: string | undefined;
  for (const { selector, rule } of selectorsOf(roomRules.rules))
    if (applies(selector, false) && rule.declarations.has("position")) value = rule.declarations.get("position");
  for (const { selector, rule } of selectorsOf(loadingRules.rules))
    if (whileLoading(selector) && applies(selector, true) && rule.declarations.has("position"))
      value = rule.declarations.get("position");
  return value !== undefined && value !== "static";
}

describe("the tints, per layout (PD-9)", () => {
  const tints = selectorsOf(loadingRules.rules).filter(({ selector }) => whileLoading(selector) && tintedOf(selector));

  it.each(LAYOUTS)(
    "in the %s layout, tint only that layout's parts, each an absolute overlay letting the pointer through",
    (layout) => {
      const here = tints.filter(({ selector }) => layoutsOf(selector).includes(layout));
      const parts = [...new Set(here.map(({ selector }) => tintedOf(selector)))].sort();
      expect(parts).toEqual([...TINTED[layout]].sort());
      for (const { selector, rule } of here) {
        const d = rule.declarations;
        if (!d.has("background") && !d.has("position")) continue;
        expect(d.get("position"), selector).toBe("absolute");
        expect(d.get("inset"), selector).toBe("0");
        expect(d.get("pointer-events"), selector).toBe("none");
        expect(d.get("content"), selector).toBe('""');
      }
      // Every tinted part's tint has a rule that draws it.
      for (const part of TINTED[layout])
        expect(
          here.some(({ selector, rule }) => tintedOf(selector) === part && rule.declarations.has("background")),
          `${layout}: ${part}`,
        ).toBe(true);
    },
  );

  it.each(LAYOUTS)("in the %s layout, position each tinted part, so its tint stays inside it", (layout) => {
    for (const part of TINTED[layout]) expect(positioned(part, layout), `${layout}: ${part}`).toBe(true);
  });

  it("never gives the conversation a position in the dock, whose sheet is placed against the panels", () => {
    for (const { selector, rule } of selectorsOf(loadingRules.rules))
      if (selector.endsWith(".talk") && layoutsOf(selector).includes("dock"))
        expect(rule.declarations.has("position"), selector).toBe(false);
  });

  it("never names the AI disclosure, the clear box, the notes, the stand-in line, or the card in a tint", () => {
    for (const { selector } of tints) for (const never of NEVER) expect(selector, never).not.toContain(never);
    // Nor gives one of them a tint of its own, in any rule.
    for (const { selector } of selectorsOf(loadingRules.rules))
      for (const never of NEVER) expect(selector.includes(`${never}::after`), selector).toBe(false);
  });
});

describe("the card, per layout (PD-10)", () => {
  const card = selectorsOf(loadingRules.rules).filter(({ selector }) => selector.endsWith(".room-loader"));

  it("carries its own colour and background outside any layout's rule", () => {
    const bare = card.filter(({ selector }) => !/data-hud/.test(selector));
    expect(bare.some(({ rule }) => rule.declarations.get("color") === "var(--hud-text)")).toBe(true);
    expect(
      bare.some(({ rule }) => rule.declarations.get("background") === "rgb(var(--glass) / var(--glass-alpha))"),
    ).toBe(true);
  });

  it("is fixed in the column and dock layouts, z 4, its top the clear area's top and the notes' reserve", () => {
    for (const layout of ["column", "dock"] as const) {
      const rules = card.filter(({ selector }) => selector.includes(`[data-hud="${layout}"]`));
      const d = new Map(rules.flatMap(({ rule }) => [...rule.declarations]));
      expect(d.get("position"), layout).toBe("fixed");
      expect(d.get("z-index"), layout).toBe("4");
      expect(d.get("top"), layout).toBe("calc(var(--clear-y) + var(--notes-h))");
      expect(d.get("overflow-y"), layout).toBe("auto");
    }
    // Under the strip's 5, over the panels' 3.
    const z = (selector: string): string | undefined =>
      selectorsOf(roomRules.rules)
        .find((r) => r.selector === selector && r.rule.declarations.has("z-index"))
        ?.rule.declarations.get("z-index");
    expect(z('html[data-hud="column"] .disclosure')).toBe("5");
    expect(z('html[data-hud="column"] .hud-panels')).toBe("3");
  });

  it("is static in the stacked layout, in the grid's loader row, first in both templates", () => {
    const rules = card.filter(({ selector }) => selector.includes('[data-hud="stacked"]'));
    const d = new Map(rules.flatMap(({ rule }) => [...rule.declarations]));
    expect(d.get("position")).toBe("static");
    expect(d.get("grid-area")).toBe("loader");
    const templates = [...loadingRules.rules, ...loadingRules.atRules.flatMap((a) => parseCss(a.body).rules)].filter(
      (r) => /\[data-hud="stacked"\]\[data-loading(="on")?\] \.room$/.test(r.selector),
    );
    expect(templates).toHaveLength(2);
    for (const t of templates) {
      const areas = (t.declarations.get("grid-template-areas") ?? "").match(/"[^"]*"/g) ?? [];
      expect(areas[0], t.selector).toMatch(/^"loader( loader)?"$/);
      const order = areas.join(" ");
      expect(order.indexOf("loader")).toBeLessThan(order.indexOf("stage"));
    }
  });
});

// --------------------------------------------------------------------------------------------------------------------
// Through the room
// --------------------------------------------------------------------------------------------------------------------
const FILES: ExpectedFile[] = [
  { asset: "fx-a", bytes: 100 },
  { asset: "fx-b", bytes: 300 },
];
const options = (v: Visit): SceneOptions => {
  const made = v.scene.created.at(-1);
  if (!made) throw new Error("no 3D stage made");
  return made;
};
const end = (v: Visit, asset: string): void =>
  options(v).assets?.(assetEvent({ asset, outcome: "loaded", ms: 10, bytes: 100, mode: "3d" }));

async function entered(): Promise<Visit> {
  const v = start({ webgl: true });
  v.scene.expected = Promise.resolve(FILES);
  await enter(v);
  return v;
}

describe("the page behind the loader, through the room (FR-024, FR-027)", () => {
  it("sets data-loading on the page's root while the loader shows, and takes it away after", async () => {
    const v = await entered();
    expect(v.doc.documentElement.getAttribute("data-loading")).toBe("on");
    end(v, "fx-a");
    end(v, "fx-b");
    await flush();
    v.clock.advance(250);
    expect(v.doc.documentElement.hasAttribute("data-loading")).toBe(false);
  });

  it("makes Around the room inert while it shows and not after; the room's other parts stay inert as today", async () => {
    const v = await entered();
    const around = v.doc.querySelector(".room-around");
    expect(around?.hasAttribute("inert")).toBe(true);
    for (const part of v.doc.querySelectorAll(".hud-bar, .room-list, .talk, .room-stage-view"))
      expect(part.hasAttribute("inert"), part.className).toBe(true);
    end(v, "fx-a");
    end(v, "fx-b");
    await flush();
    expect(around?.hasAttribute("inert")).toBe(false);
    expect(v.doc.querySelector(".hud-bar")?.hasAttribute("inert")).toBe(true);
    // As today: inert through the hand-off, reachable at its end (spec 033: no offer after it).
    v.clock.advance(4000);
    await flush();
    expect(v.doc.querySelector(".hud-bar")?.hasAttribute("inert")).toBe(true);
    v.clock.advance(1000);
    await flush();
    expect(v.doc.querySelector(".hud-bar")?.hasAttribute("inert")).toBe(false);
  });

  it("lets a pointer over the tinted stage target and select nothing", async () => {
    const v = await entered();
    const id = roomIndex().selectables[0]?.id ?? "";
    expect(id).not.toBe("");
    options(v).target?.("pointer", id);
    options(v).target?.("press", id);
    options(v).select(id);
    await flush();
    expect(v.scene.targets).toEqual([]);
    expect(v.events.filter((e) => e.kind === "object_selected")).toEqual([]);
  });

  it("holds the scene still while it shows", async () => {
    const v = await entered();
    expect(v.room.motion.animate).toBe(false);
    v.clock.advance(LOADING_CEILING_MS);
    await flush();
    expect(v.room.motion.animate).toBe(true);
  });

  it("hands the 3D stage its giving way, which resolves as it gives way, before the hand-off's first frame is drawn", async () => {
    const v = await entered();
    const gaveWay = options(v).gaveWay;
    expect(gaveWay).toBeDefined();
    let resolved = false;
    void gaveWay?.then(() => (resolved = true));
    await flush();
    expect(resolved).toBe(false);
    expect(v.scene.handoff).toEqual([]);
    end(v, "fx-a");
    end(v, "fx-b");
    // The stage closes its gate at the hand-off's first frame too, in the same call: so nothing it parses from here to
    // the hand-off's end shows before it ends (scene.test.ts, T005).
    expect(v.scene.handoff[0]).toBe(0);
    await flush();
    expect(resolved).toBe(true);
  });
});
