// T031 (spec 005; FR-008, FR-009, FR-043 to FR-051; SC-005, SC-006, SC-010; plan.md §6.3, §6.8, §6.9, §9): every
// visitor keeps every way in. Tab walks spec 002's and spec 008's order in both layouts, collapsed and open, in 3D and
// 2D, and in full screen, and nothing traps it; focus returns where the visitor expects; no fixed part but the strip lies
// over the page's flow, the scroll padding follows the strip, and the panels scroll their focus into view; reduced
// motion stills the HUD; zoom is never disabled; the keyboard's inset lifts the HUD's foot alone; the safe areas pad the
// panels and still leave a notched phone held sideways a clear area at least its stage before; and axe finds nothing in
// full screen either.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { clearArea, hudBoxes } from "../../src/room/compose/hud";
import {
  WEB,
  axeViolations,
  button,
  flush,
  intoRoom,
  nameOf,
  roomIndex,
  start,
  stubViewport,
  tabOrder,
} from "../helpers/room";
import type { Visit } from "../helpers/room";
import * as legacy from "../room/legacy-stages";

const CSS = readFileSync(join(WEB, "src/room/room.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const UI = roomIndex().ui;

/** Every rule of the stylesheet with the at-rule it sits in, one level deep. */
function rules(): { media: string | null; selectors: string[]; decls: Map<string, string> }[] {
  const out: { media: string | null; selectors: string[]; decls: Map<string, string> }[] = [];
  const walk = (body: string, media: string | null): void => {
    let i = 0;
    while (i < body.length) {
      const open = body.indexOf("{", i);
      if (open < 0) break;
      const head = body.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < body.length && depth > 0) {
        if (body[j] === "{") depth += 1;
        else if (body[j] === "}") depth -= 1;
        j += 1;
      }
      const inner = body.slice(open + 1, j - 1);
      if (head.startsWith("@")) walk(inner, head);
      else {
        const decls = new Map<string, string>();
        for (const d of inner.split(";")) {
          const c = d.indexOf(":");
          if (c > 0) decls.set(d.slice(0, c).trim(), d.slice(c + 1).trim());
        }
        out.push({ media, selectors: head.split(",").map((s) => s.trim()), decls });
      }
      i = j;
    }
  };
  walk(CSS, null);
  return out;
}

async function room(screen: { w: number; h: number }, webgl = true): Promise<Visit> {
  const viewport = stubViewport(screen);
  const v = start({ webgl, viewport: viewport.factory });
  await intoRoom(v);
  return v;
}

/** Puts the page in full screen, as the browser reports it. */
function fullScreen(v: Visit, on: boolean): void {
  Object.defineProperty(v.doc, "fullscreenElement", {
    configurable: true,
    get: () => (on ? v.doc.documentElement : null),
  });
  v.doc.dispatchEvent(new v.win.Event("fullscreenchange"));
}

describe("the Tab order in the HUD (FR-043, FR-046)", () => {
  for (const webgl of [true, false])
    it(`walks spec 002's and spec 008's order in both layouts, collapsed and open, in and out of full screen, in ${webgl ? "3D" : "2D"}`, async () => {
      const wide = await room({ w: 1280, h: 720 }, webgl);
      const order = tabOrder(wide.doc).map(nameOf);
      // The bar, the walking control in 3D, the list's header and buttons, the log's headers, the text box's row, and
      // "Around the room".
      expect(order.slice(0, 3)).toEqual(["Resume", "2D view", UI["pause.button"]]);
      expect(order.indexOf(UI["list.heading"] ?? "")).toBeGreaterThan(order.indexOf("How data flows"));
      // Spec 016 (FR-042; changed with T064, plan.md R-18): Credits after How data flows, then the walking control.
      expect(order.indexOf("Credits")).toBe(order.indexOf("How data flows") + 1);
      if (webgl) expect(order.indexOf(UI["walk.enter"] ?? "")).toBe(order.indexOf("Credits") + 1);
      expect(order.indexOf(UI["hud.log_toggle"] ?? "")).toBeGreaterThan(order.indexOf(UI["list.heading"] ?? ""));
      expect(order.indexOf("Your message")).toBeGreaterThan(order.indexOf(UI["hud.log_toggle"] ?? ""));
      expect(order.at(-1)).toBe(UI["around.heading"]);
      // The dock layout's order is the column's, but for the log's header buttons, which hide with the empty sheet
      // they head until the log holds a line (the review's finding 1).
      const upright = await room({ w: 390, h: 844 }, webgl);
      const heads = [UI["hud.log_toggle"], UI["talk.larger"]];
      expect(tabOrder(upright.doc).map(nameOf)).toEqual(order.filter((n) => !heads.includes(n)));
      // In full screen, the same.
      fullScreen(wide, true);
      expect(tabOrder(wide.doc).map(nameOf)).toEqual(order);
      fullScreen(wide, false);
      // Collapsed, the list keeps its header button, and its buttons leave the order until it opens again.
      button(wide.doc, UI["list.heading"] ?? "").click();
      button(wide.doc, UI["hud.log_toggle"] ?? "").click();
      const collapsed = tabOrder(wide.doc).map(nameOf);
      expect(collapsed).toContain(UI["list.heading"]);
      for (const s of roomIndex().selectables) expect(collapsed.some((n) => n.startsWith(s.name))).toBe(false);
      button(wide.doc, UI["list.heading"] ?? "").click();
      button(wide.doc, UI["hud.log_toggle"] ?? "").click();
      expect(tabOrder(wide.doc).map(nameOf)).toEqual(order);
    });

  it("traps no Tab: no stop in the room cancels a Tab or a Shift+Tab", async () => {
    const v = await room({ w: 1280, h: 720 });
    button(v.doc, UI["walk.enter"] ?? "").click();
    for (const stop of tabOrder(v.doc))
      for (const shiftKey of [false, true]) {
        const event = new v.win.KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
        stop.dispatchEvent(event);
        expect(event.defaultPrevented, `${nameOf(stop)}${shiftKey ? ", Shift+Tab" : ""}`).toBe(false);
      }
  });
});

describe("focus returns where the visitor expects (FR-045)", () => {
  it("to the header button that collapsed its panel, the larger view's toggle, Resume, and the walking control", async () => {
    const v = await room({ w: 1280, h: 720 });
    const first = v.doc.querySelector<HTMLButtonElement>(".room-list li button");
    first?.focus();
    button(v.doc, UI["list.heading"] ?? "").click();
    expect(v.doc.activeElement).toBe(button(v.doc, UI["list.heading"] ?? ""));
    const larger = v.doc.querySelector<HTMLButtonElement>(".talk-larger");
    larger?.click();
    larger?.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(v.doc.activeElement).toBe(larger);
    button(v.doc, "Resume").click();
    await flush();
    button(v.doc, "Close").click();
    expect(v.doc.activeElement).toBe(button(v.doc, "Resume"));
    const walk = button(v.doc, UI["walk.enter"] ?? "");
    walk.click();
    button(v.doc, UI["walk.leave"] ?? "").click();
    expect(v.doc.activeElement).toBe(walk);
  });
});

describe("focus is never hidden (FR-044)", () => {
  it("lays no fixed part but the strip over the page's flow, and scrolls focus clear of the strip and in the panels", () => {
    const all = rules();
    const fixed = all.filter((r) => r.decls.get("position") === "fixed").flatMap((r) => r.selectors);
    // The strip, and the invisible safe-area probe, which takes no pointer and shows nothing.
    expect(fixed.filter((s) => !/\.disclosure$/.test(s) && s !== ".hud-safe-probe")).toEqual([]);
    const probe = all.find((r) => r.selectors.includes(".hud-safe-probe"));
    expect(probe?.decls.get("visibility")).toBe("hidden");
    expect(all.find((r) => r.selectors.includes("html"))?.decls.get("scroll-padding-top")).toBe(
      "calc(var(--strip-h, 4rem) + 1rem)",
    );
    for (const layout of ["column", "dock"])
      expect(
        all.some(
          (r) =>
            r.selectors.includes(`html[data-hud="${layout}"] .hud-panels *`) &&
            r.decls.get("scroll-margin") === "0.5rem",
        ),
        layout,
      ).toBe(true);
  });
});

describe("reduced motion, zoom, the keyboard, and the safe areas (FR-047, FR-049, FR-050, FR-009)", () => {
  it("stills every transition in the HUD and the strip under reduced motion", () => {
    const reduced = rules().filter((r) => r.media === "@media (prefers-reduced-motion: reduce)");
    const selectors = reduced.flatMap((r) => r.selectors);
    expect(selectors).toContain(".room *");
    expect(selectors).toContain(".disclosure");
    expect(reduced.some((r) => r.decls.get("transition") === "none !important")).toBe(true);
  });

  it("never disables zoom", () => {
    const html = readFileSync(join(WEB, "index.html"), "utf8");
    const meta = /<meta name="viewport" content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(meta).toContain("viewport-fit=cover");
    expect(meta).not.toMatch(/maximum-scale|user-scalable|minimum-scale/);
  });

  it("lifts the bar and the dock by the keyboard's inset, the clear area unmoved", () => {
    const all = rules();
    const of = (selector: string, property: string): string | undefined =>
      all
        .filter((r) => r.selectors.includes(selector) && r.decls.has(property))
        .at(-1)
        ?.decls.get(property);
    expect(of('html[data-hud="dock"] .hud-bar', "bottom")).toBe("var(--keyboard)");
    expect(of('html[data-hud="dock"] .hud-panels', "bottom")).toBe("calc(var(--bar-h) + var(--keyboard))");
    expect(of('html[data-hud="column"] .hud-panels', "bottom")).toBe("calc(var(--bar-h) + var(--keyboard))");
    expect(of('html[data-hud="dock"] .room-clear', "top")).toBe("var(--clear-y)");
  });

  it("pads the strip, the bar, and the panels by the safe areas, and still gives a notched phone held sideways its old stage", () => {
    const all = rules();
    for (const part of [".disclosure", ".hud-bar", ".hud-panels"])
      for (const layout of ["column", "dock"]) {
        const padding = all
          .filter((r) => r.selectors.includes(`html[data-hud="${layout}"] ${part}`))
          .map((r) => r.decls.get("padding") ?? "")
          .join(" ");
        expect(padding, `${layout} ${part}`).toMatch(/var\(--safe-(top|right|bottom|left)\)/);
      }
    // The probe reads env(), which viewport-fit=cover gives the page.
    const probe = all.find((r) => r.selectors.includes(".hud-safe-probe"))?.decls.get("padding") ?? "";
    for (const side of ["top", "right", "bottom", "left"]) expect(probe).toContain(`env(safe-area-inset-${side}`);
    // 844 × 390 with 47 px each side and 21 at the foot: before spec 005 the page had the safe area alone, 750 wide.
    const metrics = { rem: 16, safe: { top: 0, right: 47, bottom: 21, left: 47 } };
    const clear = clearArea({ w: 844, h: 390 }, { list: "open" }, metrics);
    const before = legacy.stageFor({ w: 750, h: 390 });
    expect(clear.w, "width").toBeGreaterThanOrEqual(before.w);
    expect(clear.h, "height").toBeGreaterThanOrEqual(before.h);
    // The column takes its two fifths of the safe width, and pads the inset.
    expect(hudBoxes({ w: 844, h: 390 }, { list: "open" }, metrics).column?.w).toBe(0.4 * 750 + 47);
  });
});

describe("axe in full screen (FR-051)", () => {
  for (const webgl of [true, false])
    it(`finds 0 violations with the page in full screen, in ${webgl ? "3D" : "2D"}`, async () => {
      const v = await room({ w: 1920, h: 1200 }, webgl);
      fullScreen(v, true);
      expect(await axeViolations(v)).toEqual([]);
    });
});

// The review of 60b51de4, finding 1 (WCAG 2.4.7; FR-051): no stop of the Tab order is a control nobody can see.
describe("no control in the Tab order that isn't drawn (T046, finding 1)", () => {
  it("hides the log's header buttons with the dock's empty sheet, and shows them with its first line; the column keeps them (spec 028: 1024 x 600)", async () => {
    const heads = (v: Visit): string[] =>
      tabOrder(v.doc)
        .map(nameOf)
        .filter((n) => n === UI["hud.log_toggle"] || n === UI["talk.larger"]);
    const upright = await room({ w: 390, h: 844 });
    expect(heads(upright)).toEqual([]);
    const box = upright.doc.querySelector<HTMLInputElement>("#talk-text") as HTMLInputElement;
    box.value = "Hello";
    button(upright.doc, "Send").click();
    await flush();
    expect(heads(upright)).toEqual([UI["hud.log_toggle"], UI["talk.larger"]]);
    // Spec 028 (T-A03; plan.md §R-B8): 1280 × 720 takes the split layout, which has no larger view (its FR-003);
    // 1024 × 600 keeps the column layout.
    const wide = await room({ w: 1024, h: 600 });
    expect(wide.doc.documentElement.getAttribute("data-split")).toBe("off");
    expect(heads(wide)).toEqual([UI["hud.log_toggle"], UI["talk.larger"]]);
  });

  it("takes a collapsed log's links and buttons out of the Tab order, and keeps the log a live region", async () => {
    const v = await room({ w: 1280, h: 720 });
    const box = v.doc.querySelector<HTMLInputElement>("#talk-text") as HTMLInputElement;
    box.value = "Hello";
    button(v.doc, "Send").click();
    await flush();
    const log = v.doc.querySelector<HTMLElement>(".talk-log") as HTMLElement;
    const inLog = (): HTMLElement[] => tabOrder(v.doc).filter((el) => log.contains(el));
    // The fixed message points to the resume: a button and a link in the log.
    expect(inLog().length).toBeGreaterThan(0);
    button(v.doc, UI["hud.log_toggle"] ?? "").click();
    expect(inLog()).toEqual([]);
    expect(log.getAttribute("role")).toBe("log");
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(log.closest("[hidden], [inert], [aria-hidden='true']")).toBeNull();
    // A line that lands while collapsed is out of the Tab order too, and every one comes back on opening.
    box.value = "Again";
    button(v.doc, "Send").click();
    await flush();
    expect(inLog()).toEqual([]);
    button(v.doc, UI["hud.log_toggle"] ?? "").click();
    expect(inLog().length).toBeGreaterThan(1);
  });

  it("draws nothing the hidden attribute hides, whatever display a rule gives it", () => {
    const hidden = rules().filter((r) => r.selectors.some((s) => /\[hidden\]$/.test(s)));
    expect(
      hidden.some((r) => r.selectors.includes(".room [hidden]") && r.decls.get("display") === "none !important"),
    ).toBe(true);
    expect(hidden.some((r) => r.selectors.includes(".disclosure [hidden]"))).toBe(true);
  });
});

// T046 (spec 014; FR-062; SC-011, SC-012): the compact HUD, the new look, the held walking view, and each note's cause
// keep WCAG 2.2 AA. axe finds 0 violations in the column and dock layouts, in 3D and 2D, with the note naming its causes
// (both in 3D, the pieces' alone in 2D) and a piece's target marked in the list; in the column, in and out of full
// screen and with the log collapsed and in its larger view; in 3D, with the walking view entered and held at the room's
// view. The Tab order's tests above run with the compact HUD, which is the room's only HUD now; no compact box clips
// what it holds, so a focused control scrolls into view inside it.
describe("axe with spec 014's HUD (T046)", () => {
  for (const [layout, screen] of [
    ["column", { w: 1920, h: 1200 }],
    ["dock", { w: 390, h: 844 }],
  ] as const)
    for (const webgl of [true, false])
      it(`finds 0 violations in the ${layout} layout, in ${webgl ? "3D" : "2D"}, with the note's causes and the held walk`, async () => {
        const viewport = stubViewport(screen);
        const v = start({
          webgl,
          viewport: viewport.factory,
          room: { ...roomIndex(), build: { ...roomIndex().build, placeholders: true } },
        });
        await intoRoom(v);
        expect(v.doc.documentElement.getAttribute("data-hud")).toBe(layout);
        v.scene.created[0]?.onFigure?.({
          kind: "picture",
          figure: "visitor",
          shows: "fallback",
          why: "no-file",
        } as never);
        // A piece the room targets, its list button marked aria-current (FR-025).
        v.scene.created[0]?.target?.("pointer", roomIndex().selectables[0]?.id ?? null);
        const note = v.doc.querySelector<HTMLElement>(".room-note:not(.room-stand-in)");
        expect(note?.hidden).toBe(false);
        expect(note?.textContent?.includes(UI["standin.avatar"] ?? "?")).toBe(webgl);
        expect(await axeViolations(v)).toEqual([]);
        if (layout === "column") {
          fullScreen(v, true);
          expect(await axeViolations(v)).toEqual([]);
          fullScreen(v, false);
          button(v.doc, UI["talk.larger"] ?? "").click();
          expect(await axeViolations(v)).toEqual([]);
          button(v.doc, UI["talk.smaller"] ?? "").click();
          button(v.doc, UI["hud.log_toggle"] ?? "").click();
          expect(await axeViolations(v)).toEqual([]);
          button(v.doc, UI["hud.log_toggle"] ?? "").click();
        }
        if (webgl) {
          const walk = v.doc.querySelector<HTMLButtonElement>("button.room-walk");
          expect(walk?.hidden).toBe(false);
          walk?.click();
          await flush();
          expect(v.scene.walks.at(-1)?.call).toBe("enter");
          // The held view, the room's own, as the stage reports it (FR-058).
          v.scene.created[0]?.walkHeld?.("hold", "edge");
          expect(await axeViolations(v)).toEqual([]);
        }
      });

  it("clips nothing a compact box holds: the column's list and log scroll, the strip and the bar wrap", () => {
    const all = rules();
    const declared = (selector: string, prop: string): string[] =>
      all.filter((r) => r.selectors.includes(selector)).flatMap((r) => r.decls.get(prop) ?? []);
    expect(declared('html[data-hud="column"] .room-list', "overflow-y")).toEqual(["auto"]);
    expect(declared('html[data-hud="column"] .talk-log', "overflow-y")).toEqual(["auto"]);
    for (const selector of [
      'html[data-hud="column"] .disclosure',
      'html[data-hud="column"] .hud-bar',
      'html[data-hud="column"] .hud-panels',
      ".disclosure",
      ".hud-bar",
      ".hud-panels",
    ])
      for (const r of all.filter((x) => x.selectors.includes(selector)))
        expect(r.decls.get("overflow") ?? "visible", selector).not.toBe("hidden");
  });
});
