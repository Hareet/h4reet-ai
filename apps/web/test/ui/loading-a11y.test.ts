// T025 (spec 012; FR-008, FR-022, FR-039 to FR-043; SC-006; plan.md §6, PD-19, PD-23): every visitor can follow the
// loading, in each of spec 005's layouts. Tab and Shift+Tab reach the three hint controls and nothing behind the tint,
// "Around the room" included, and nothing traps; from the fade's start no card control is a Tab stop or does anything;
// focus lands on the room's heading as the loader gives way, from each control. loading.css's rules, read here (jsdom
// lays nothing out): the yellow ring on the card's heading and buttons in every layout and Highlight in forced colours;
// no transition under reduced motion and no sheen anywhere; no fixed height or overflow clip on the card's text; the
// card scrolling inside itself where it floats, and in the page's flow where the HUD can't fit; and the fallbacks'
// opaque glass. axe reports no WCAG 2.2 AA violation while the loader shows, with each hint, paused, cut short, and
// after it gives way.
import { describe, expect, it } from "vitest";

import { fitsHud } from "../../src/room/compose/hud";
import { LOADING_CEILING_MS } from "../../src/room/quality";
import type { ExpectedFile } from "../../src/room/stage";
import {
  axeViolations,
  button,
  enter,
  flush,
  parseCss,
  roomIndex,
  start,
  stubViewport,
  stylesheets,
  tabOrder,
} from "../helpers/room";
import type { CssRule, Visit } from "../helpers/room";

const LOADING = parseCss(stylesheets().find((s) => s.path.endsWith("src/room/loading/loading.css"))?.text ?? "");
const ROOM = parseCss(stylesheets().find((s) => s.path.endsWith("src/room/room.css"))?.text ?? "");
const FILES: ExpectedFile[] = [{ asset: "fx-a", bytes: 100 }];
const HINTS = roomIndex().hints;
const CONTROLS = ["Pause hints", "Previous hint", "Next hint"];

type Layout = "column" | "dock" | "stacked";
const SCREENS: Record<Layout, { w: number; h: number }> = {
  column: { w: 1280, h: 720 },
  dock: { w: 390, h: 844 },
  stacked: { w: 320, h: 256 },
};

/** A 3D visit at a window giving `layout`, entered, its first hint shown, the loader waiting on a file. */
async function entered(layout: Layout, o: Parameters<typeof start>[0] = {}): Promise<Visit> {
  const viewport = stubViewport(SCREENS[layout]);
  const v = start({ webgl: true, viewport: viewport.factory, ...o });
  v.scene.expected = Promise.resolve(FILES);
  await enter(v);
  v.clock.advance(0);
  expect(v.doc.documentElement.getAttribute("data-hud")).toBe(layout);
  return v;
}

const names = (els: readonly Element[]): string[] => els.map((el) => (el.textContent ?? "").trim());
const roomStops = (v: Visit): HTMLElement[] => tabOrder(v.doc).filter((el) => el.closest(".room"));
const each = <T>(rules: readonly CssRule[], f: (selector: string, rule: CssRule) => T): T[] =>
  rules.flatMap((rule) => rule.selector.split(",").map((s) => f(s.trim(), rule)));
const atRule = (pattern: RegExp): CssRule[] =>
  LOADING.atRules.filter((a) => pattern.test(a.prelude)).flatMap((a) => parseCss(a.body).rules);

describe("the keyboard, in each layout (FR-039)", () => {
  it.each(["column", "dock", "stacked"] as const)(
    "reaches the three hint controls and nothing behind the tint, in the %s layout",
    async (layout) => {
      const v = await entered(layout);
      const stops = roomStops(v);
      expect(names(stops)).toEqual(CONTROLS);
      expect(stops.some((el) => el.closest(".room-around"))).toBe(false);
      // Nothing traps: Tab on the last control and Shift+Tab on the first are the browser's.
      for (const [el, shift] of [
        [stops.at(-1), false],
        [stops[0], true],
      ] as const) {
        const key = new v.win.KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: shift,
          bubbles: true,
          cancelable: true,
        });
        el?.dispatchEvent(key);
        expect(key.defaultPrevented).toBe(false);
      }
    },
  );

  it("reaches no card control from the fade's start, and a press on one does nothing", async () => {
    const v = await entered("column");
    const next = button(v.doc, "Next hint");
    v.clock.advance(LOADING_CEILING_MS);
    expect(v.doc.querySelector(".room-loader")?.isConnected).toBe(true);
    expect(roomStops(v).filter((el) => el.closest(".room-loader"))).toEqual([]);
    const before = v.doc.querySelector(".room-loader-hint")?.textContent;
    next.click();
    expect(v.doc.querySelector(".room-loader-hint")?.textContent).toBe(before);
  });

  it.each(CONTROLS)("lands focus on the room's heading at give-way, from %s", async (name) => {
    const v = await entered("column");
    const control = button(v.doc, name);
    control.focus();
    // Focus entering the controls stops the rotation, so "Pause hints" now offers to play (FR-030).
    expect(v.doc.activeElement).toBe(control);
    v.clock.advance(LOADING_CEILING_MS);
    expect(v.doc.activeElement?.tagName).toBe("H1");
    await flush();
    expect(v.doc.activeElement?.tagName).toBe("H1");
  });
});

describe("loading.css, read (FR-040 to FR-042; PD-23)", () => {
  it("gives the card's heading and buttons the HUD's yellow ring in every layout, and Highlight in forced colours", () => {
    const ring = LOADING.rules.find((r) => r.selector.includes(":root .room-loader button:focus-visible"));
    expect(ring?.selector.split(",").map((s) => s.trim())).toEqual([
      ":root .room-loader button:focus-visible",
      ":root .room-loader [tabindex]:focus-visible",
    ]);
    expect(ring?.selector).not.toMatch(/data-hud/);
    expect(ring?.declarations.get("outline")).toBe("2px solid var(--hud-focus)");
    const forced = atRule(/forced-colors:\s*active/).find((r) =>
      r.selector.includes(":root .room-loader button:focus-visible"),
    );
    expect(forced?.selector).toContain(":root .room-loader [tabindex]:focus-visible");
    expect(forced?.declarations.get("outline-color")).toBe("Highlight");
  });

  it("sets no transition on the card, the fill, the hint, or the tints under reduced motion, and draws no sheen", () => {
    const reduced = atRule(/prefers-reduced-motion:\s*reduce/);
    for (const part of [".room-loader", ".room-loader-fill"])
      expect(
        reduced.some(
          (r) =>
            r.selector
              .split(",")
              .map((s) => s.trim())
              .includes(part) && r.declarations.get("transition") === "none",
        ),
        part,
      ).toBe(true);
    for (const [selector, rule] of each(LOADING.rules, (s, r) => [s, r] as const))
      if (selector.includes(".room-loader-hint")) expect(rule.declarations.has("transition"), selector).toBe(false);
    const text = stylesheets().find((s) => s.path.endsWith("src/room/loading/loading.css"))?.text ?? "";
    expect(text).not.toMatch(/@keyframes|animation|gradient/);
  });

  it("gives no text element of the card a fixed height or an overflow clip, only min-heights (WCAG 1.4.12)", () => {
    const TEXT = [
      ".room-loader-heading",
      ".room-loader-percent",
      ".room-loader-stage",
      ".room-loader-hint",
      ".room-loader-position",
      ".room-loader button",
    ];
    const all = [...LOADING.rules, ...LOADING.atRules.flatMap((a) => parseCss(a.body).rules)];
    for (const [selector, rule] of each(all, (s, r) => [s, r] as const)) {
      if (!TEXT.some((t) => selector.endsWith(t))) continue;
      expect(rule.declarations.has("height"), selector).toBe(false);
      for (const p of ["overflow", "overflow-x", "overflow-y"])
        expect(["hidden", "clip"], `${selector} ${p}`).not.toContain(rule.declarations.get(p));
    }
  });

  it("scrolls the floating card inside itself, and puts it in the page's flow where the HUD can't fit (reflow)", () => {
    const floating = LOADING.rules.find((r) => r.selector.includes('html[data-hud="column"] .room-loader'));
    expect(floating?.declarations.get("overflow-y")).toBe("auto");
    expect(floating?.declarations.get("max-height")).toMatch(/^calc\(100dvh - /);
    // 320 × 256 CSS pixels (a 1280 × 1024 window at 400% zoom), and 200% text on a 320 × 568 window.
    expect(fitsHud({ w: 320, h: 256 })).toBe(false);
    const big = { rem: 32, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
    expect(fitsHud({ w: 320, h: 568 }, undefined, big)).toBe(false);
    const stacked = LOADING.rules.find((r) => r.selector.includes('html[data-hud="stacked"] .room-loader'));
    expect(stacked?.declarations.get("position")).toBe("static");
  });

  // Spec 030 (T-A06 (a); the first rework's N-1): the `@supports not` query is gone with the blur
  // (test/ui/hud-no-blur.test.ts); the two media queries keep the card's glass opaque.
  it("makes the card's glass opaque with no blur under reduced transparency and more contrast, in every layout", async () => {
    for (const query of [/prefers-reduced-transparency/, /prefers-contrast:\s*more/]) {
      const rules = ROOM.atRules.filter((a) => query.test(a.prelude)).flatMap((a) => parseCss(a.body).rules);
      expect(rules.find((r) => r.selector === ":root")?.declarations.get("--glass-alpha"), String(query)).toBe("1");
      const blur = rules.find((r) =>
        r.selector
          .split(",")
          .map((s) => s.trim())
          .includes(".hud-glass"),
      );
      expect(blur?.declarations.get("backdrop-filter"), String(query)).toBe("none");
    }
    // The card rides on them: it is .hud-glass, its background the palette's glass at its alpha, outside any layout.
    for (const layout of ["column", "dock", "stacked"] as const) {
      const v = await entered(layout);
      expect(v.doc.querySelector(".room-loader")?.classList.contains("hud-glass"), layout).toBe(true);
    }
    const own = LOADING.rules.find((r) => r.selector === ".room-loader");
    expect(own?.declarations.get("background")).toBe("rgb(var(--glass) / var(--glass-alpha))");
  });

  it("takes the system's colours in forced colours: the card, the track, and the fill in Highlight", () => {
    const forced = atRule(/forced-colors:\s*active/);
    const at = (part: string): CssRule | undefined =>
      forced.find((r) =>
        r.selector
          .split(",")
          .map((s) => s.trim())
          .includes(part),
      );
    expect(at(".room-loader")?.declarations.get("background")).toBe("Canvas");
    expect(at(".room-loader")?.declarations.get("color")).toBe("CanvasText");
    expect(at(".room-loader-bar")?.declarations.get("border-color")).toBe("CanvasText");
    expect(at(".room-loader-fill")?.declarations.get("background")).toBe("Highlight");
  });
});

describe("axe in each state and layout (FR-043; SC-006)", () => {
  it.each(["column", "dock", "stacked"] as const)(
    "reports nothing in the %s layout: showing, paused, cut short, and after",
    async (layout) => {
      const v = await entered(layout);
      expect(await axeViolations(v), "showing").toEqual([]);
      button(v.doc, "Pause hints").click();
      expect(await axeViolations(v), "paused").toEqual([]);
      v.clock.advance(LOADING_CEILING_MS);
      expect(await axeViolations(v), "cut short, fading").toEqual([]);
      v.clock.advance(250);
      await flush();
      expect(await axeViolations(v), "after").toEqual([]);
    },
  );

  it("reports nothing with each hint showing", async () => {
    const v = await entered("column");
    for (let i = 0; i < HINTS.length; i += 1) {
      expect(await axeViolations(v), `hint ${i + 1}`).toEqual([]);
      button(v.doc, "Next hint").click();
    }
  });
});
