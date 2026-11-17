// T-A01 (a) (spec 030, group A; FR-001, SC-001; Q1; plan.md §R-A1): the HUD draws no backdrop blur, at any quality
// level, in any layout or view. His words, 2026-11-16: "the right side panel UI is not transparent, it is more
// blurred". The blur was spec 005's (FR-025: --hud-blur behind the glass at quality levels 0 and 1, the root's
// data-blur) and spec 018's (the split layout's list and bar); spec 029 kept it. Here: no rule of room.css,
// hud/split.css, talk/talk.css, or bubble.css, top-level or inside an at-rule, sets backdrop-filter or
// -webkit-backdrop-filter to anything but none; --hud-blur is defined nowhere in them; no selector of theirs reads
// data-blur; through the real room, stepped down from quality level 0 to 3 by slow frames, the root never carries
// data-blur; and the room's layout has no setBlur. The lookdev page keeps its own data-blur on its own root (plan
// §R-A1): it is not the HUD, and nothing here reads it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { renderRoom } from "../../src/room/layout";
import { intoRoom, parseCss, start, stubViewport } from "../helpers/room";

const SHEETS = [
  "../../src/room/room.css",
  "../../src/room/hud/split.css",
  "../../src/talk/talk.css",
  "../../src/room/bubble.css",
] as const;
const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

interface Declared {
  readonly sheet: string;
  readonly selector: string;
  readonly property: string;
  readonly value: string;
}

/** Every declaration of a sheet, top-level and inside each at-rule, at any depth. */
function declarations(sheet: string): Declared[] {
  const out: Declared[] = [];
  const walk = (text: string): void => {
    const parsed = parseCss(text);
    for (const r of parsed.rules)
      for (const [property, value] of r.declarations) out.push({ sheet, selector: r.selector, property, value });
    for (const a of parsed.atRules) if (!/^@(?:-webkit-)?keyframes\b/.test(a.prelude)) walk(a.body);
  };
  walk(read(sheet));
  return out;
}

const ALL = SHEETS.flatMap(declarations);

/** Every at-rule's prelude of a sheet, at any depth. */
function preludes(sheet: string): string[] {
  const out: string[] = [];
  const walk = (text: string): void => {
    for (const a of parseCss(text).atRules) {
      out.push(a.prelude);
      walk(a.body);
    }
  };
  walk(read(sheet));
  return out;
}

describe("no backdrop blur in the HUD's sheets (FR-001)", () => {
  it("reads every sheet's declarations", () => {
    for (const sheet of SHEETS) expect(ALL.filter((d) => d.sheet === sheet).length, sheet).toBeGreaterThan(0);
  });

  it("sets backdrop-filter and -webkit-backdrop-filter to none or not at all", () => {
    const blurs = ALL.filter((d) => /^(?:-webkit-)?backdrop-filter$/.test(d.property) && d.value.trim() !== "none");
    expect(blurs.map((d) => `${d.sheet}: ${d.selector} { ${d.property}: ${d.value} }`)).toEqual([]);
  });

  it("defines no --hud-blur and reads it nowhere", () => {
    expect(ALL.filter((d) => d.property === "--hud-blur" || d.value.includes("--hud-blur"))).toEqual([]);
  });

  it("names data-blur in no selector", () => {
    expect(ALL.filter((d) => d.selector.includes("data-blur")).map((d) => `${d.sheet}: ${d.selector}`)).toEqual([]);
  });

  // T-A06 (a) (group A's rework; the first rework's N-1; plan.md §R-A1): with no blur anywhere, nothing hangs on a
  // browser's backdrop filter either: no @supports condition names backdrop-filter or -webkit-backdrop-filter, so a
  // browser without one gets the same clear glass as every other.
  it("sets nothing on whether the browser has a backdrop filter: no @supports names one", () => {
    const found = SHEETS.flatMap((sheet) =>
      preludes(sheet)
        .filter((p) => /^@supports\b/.test(p) && /backdrop-filter/.test(p))
        .map((p) => `${sheet}: ${p}`),
    );
    expect(found).toEqual([]);
  });
});

describe("no data-blur on the room's root (FR-001, SC-001)", () => {
  it("never sets data-blur, from quality level 0 down through level 3, in the room", async () => {
    const viewport = stubViewport({ w: 1280, h: 720 });
    const v = start({ webgl: true, viewport: viewport.factory });
    await intoRoom(v);
    const root = v.doc.documentElement;
    const seen = new Map<number, string | null>();
    seen.set(v.room.visit.quality ?? 0, root.getAttribute("data-blur"));
    // Slow frames step the quality controller down a level each window, as test/ui/hud.test.ts's levels do.
    for (let k = 0; k < 600 && v.room.visit.mode !== "2d"; k += 1) {
      v.clock.advance(50, 50);
      seen.set(v.room.visit.quality ?? 0, root.getAttribute("data-blur"));
    }
    for (const level of [0, 1, 2, 3]) {
      expect(seen.has(level), `level ${level} reached`).toBe(true);
      expect(seen.get(level), `level ${level}`).toBeNull();
    }
  });

  it("gives the room's layout no setBlur", () => {
    const doc = new JSDOM("<!doctype html><html><body></body></html>").window.document;
    const layout = renderRoom(doc, {
      list: doc.createElement("section"),
      talk: doc.createElement("section"),
      around: doc.createElement("section"),
      pause: "Pause the room",
    });
    expect("setBlur" in layout).toBe(false);
    expect(doc.documentElement.hasAttribute("data-blur")).toBe(false);
  });
});
