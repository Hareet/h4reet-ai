// T016 (spec 014; FR-003; plan.md §2.5, PD-23): the 2D room in its frame area. With no WebGL 2 the room draws the 2D
// drawing, and its view element sits at the frame area the 2D protector gives (the drawing's hit areas' cores and its
// two figures' drawn boxes, from the index), through the room's --frame-* properties, which room.css's 2D view rule
// reads; the drawing's pressable cores and its figures lie under no compact box; the loader's view keeps spec 005's
// --clear-*; and the backdrop spans the window behind it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { frameArea } from "../../src/room/compose/frame";
import { DEFAULT_METRICS, OPENING, compactBoxes, hudBoxes } from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { flatProtectorFor } from "../../src/room/compose/protect";
import { intoRoom, parseCss, roomIndex, start, stubViewport } from "../helpers/room";

const CSS = readFileSync(fileURLToPath(new URL("../../src/room/room.css", import.meta.url)), "utf8");
// Each top-level rule once per selector of its list.
const rules = parseCss(CSS).rules.flatMap((r) =>
  r.selector.split(",").map((selector) => ({ selector: selector.trim(), decls: r.declarations })),
);
const decl = (selector: string, property: string): string | undefined =>
  rules
    .filter((r) => r.selector === selector && r.decls.has(property))
    .at(-1)
    ?.decls.get(property);

const near = (a: Box, b: Box, m: number): boolean =>
  a.x < b.x + b.w + m && b.x - m < a.x + a.w && a.y < b.y + b.h + m && b.y - m < a.y + a.h;

describe("the 2D room in its frame area (spec 014, T016)", () => {
  it("places the 2D view at --frame-*, and keeps the loader's view at the clear area", () => {
    for (const hud of ["column", "dock"] as const) {
      const sel = `html[data-hud="${hud}"] .room-stage-view[data-stage="2d"]`;
      expect(decl(sel, "left")).toBe("var(--frame-x)");
      expect(decl(sel, "top")).toBe("var(--frame-y)");
      expect(decl(sel, "width")).toBe("var(--frame-w)");
      expect(decl(sel, "height")).toBe("var(--frame-h)");
      const loading = `html[data-hud="${hud}"] .room-stage-view[data-stage="loading"]`;
      expect(decl(loading, "left")).toBe("var(--clear-x)");
      expect(decl(loading, "height")).toBe("var(--clear-h)");
    }
    // The backdrop spans the window behind the drawing.
    expect(decl('html[data-hud="column"] .room-stage', "inset")).toBe("0");
    expect(decl(".room-stage", "background")).toBe("#20252b");
  });

  it("sets --frame-* from the 2D protector's frame area, its cores and figures under no compact box", async () => {
    const protect = flatProtectorFor(roomIndex());
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 2560, h: 1440 },
      { w: 1280, h: 720 },
      { w: 390, h: 844 },
    ]) {
      const viewport = stubViewport(screen);
      const v = start({ webgl: false, viewport: viewport.factory });
      await intoRoom(v);
      const root = v.doc.documentElement;
      const f = frameArea(screen, OPENING, DEFAULT_METRICS, protect);
      const where = `${screen.w} × ${screen.h}`;
      expect(v.room.visit.mode, where).toBe("2d");
      expect(root.style.getPropertyValue("--frame-x"), where).toBe(`${f.area.x}px`);
      expect(root.style.getPropertyValue("--frame-y"), where).toBe(`${f.area.y}px`);
      expect(root.style.getPropertyValue("--frame-w"), where).toBe(`${f.area.w}px`);
      expect(root.style.getPropertyValue("--frame-h"), where).toBe(`${f.area.h}px`);
      // spec 005's clear area keeps its meaning beside it.
      expect(root.style.getPropertyValue("--clear-w"), where).toBe(`${hudBoxes(screen).clear.w}px`);
      if (f.ease < 1)
        for (const p of protect.boxes(f.area, hudBoxes(screen).clear) ?? [])
          for (const c of compactBoxes(screen).all) expect(near(p, c, 8), where).toBe(false);
    }
  });
});
