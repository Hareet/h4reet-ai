// T061 (spec 004; FR-009, FR-052, FR-064; R-18, R-19; contracts/room-data-files.md §13.3), as spec 005 changes it
// (T006; its FR-052 to FR-054; plan.md §2.3, §3.1, PD-9, PD-10): the supported stages are code, `compose/stages.ts`,
// and since spec 005 they are the clear areas the HUD's placements (`compose/hud.ts`) leave each screen: the reference
// stages keep their screens and take their clear areas; the sweep keeps spec 004's 16-pixel grid from 320 × 568 to
// 1920 × 1200 and extends on a 64-pixel grid and named screens to 5120 × 2160 and 2160 × 3840; a screen in the dock
// layout gives a stage with its list open and one with it collapsed; and the framing aspects are spec 002's six and a
// series by ×1.25 outward that covers every supported stage. room.css's HUD rules are pinned here to the table's CSS
// properties, so a docked box takes its size from the table alone. The old stages are the floor
// (test/room/stages-floor.test.ts), and the stacked layout keeps the old grid (test/ui/degraded.test.ts).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { frameArea, reservedIn } from "../../src/room/compose/frame";
import {
  DEFAULT_METRICS,
  HUD_PLACEMENTS,
  OPENING,
  clearArea,
  compactBoxes,
  fitsHud,
  layoutFor,
  reservedBoxes,
  wallBoxes,
} from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import type { Rect } from "../../src/room/compose/pick";
import { protectSceneOf, protectorFor } from "../../src/room/compose/protect";
import { repositoryBundle } from "../helpers/room";
import { DEFAULT_TALK_LIMITS } from "../../src/talk/talk";
import { textWidth } from "../ui/hud-model";
import {
  ASPECTS,
  NAMED_SCREENS,
  REFERENCE_DESKTOP,
  REFERENCE_PHONE,
  SMALLEST,
  SWEEP_STEP,
  flatScale,
  smallestFlatStage,
  framedStages,
  stageFor,
  supportedStages,
  sweepScreens,
  WALK_CONTROL,
  walkControlBox,
} from "../../src/room/compose/stages";
import * as legacy from "./legacy-stages";

const CSS = readFileSync(fileURLToPath(new URL("../../src/room/room.css", import.meta.url)), "utf8");

interface Rule {
  /** The at-rule the rule sits in, `@media …` or `@supports …`, or null for none. */
  media: string | null;
  selector: string;
  /** Each property's last value, as the cascade takes it within one rule. */
  decls: Map<string, string>;
  /** Every declaration in order, a property given twice (a fallback first) kept twice. */
  all: [string, string][];
}

/** The style sheet's rules, one at-rule deep: enough to read the room's rules without a CSS library. */
function rules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
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
        const all: [string, string][] = [];
        for (const part of inner.split(";")) {
          const colon = part.indexOf(":");
          if (colon > 0) {
            const [p, v] = [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
            decls.set(p, v);
            all.push([p, v]);
          }
        }
        for (const selector of head.split(",")) out.push({ media, selector: selector.trim(), decls, all });
      }
      i = j;
    }
  };
  walk(text, null);
  return out;
}

const RULES = rules(CSS);

function decl(selector: string, property: string, media: string | null = null): string {
  const found = RULES.filter((r) => r.selector === selector && r.media === media && r.decls.has(property));
  const value = found.at(-1)?.decls.get(property);
  if (value === undefined) throw new Error(`room.css: no ${property} for ${selector} in ${media ?? "the base rules"}`);
  return value;
}

/** A number of rem from a value such as "9rem". */
function rem(value: string): number {
  const m = /^(\d+(?:\.\d+)?)rem$/.exec(value);
  if (!m?.[1]) throw new Error(`room.css: ${value} isn't a length in rem`);
  return Number(m[1]);
}

const key = (s: { w: number; h: number }): string => `${s.w}x${s.h}`;

describe("the stages (compose/stages.ts)", () => {
  it("are the clear areas the HUD leaves each screen, its panels open", () => {
    for (const screen of [
      { w: 320, h: 568 },
      { w: 568, h: 320 },
      { w: 1280, h: 720 },
      { w: 390, h: 844 },
      { w: 3440, h: 1440 },
      { w: 2160, h: 3840 },
    ]) {
      const clear = clearArea(screen, OPENING, DEFAULT_METRICS);
      expect(stageFor(screen), key(screen)).toEqual({ w: clear.w, h: clear.h });
    }
  });

  it("keep the reference screens and ratios, their stages their clear areas and at least spec 004's", () => {
    expect(REFERENCE_DESKTOP.screen).toEqual({ w: 1920, h: 1200 });
    expect(REFERENCE_DESKTOP.dpr).toBe(1);
    expect(REFERENCE_DESKTOP.stage).toEqual(stageFor(REFERENCE_DESKTOP.screen));
    expect(REFERENCE_DESKTOP.stage).toEqual({ w: 1472, h: 1120.5 });
    expect(REFERENCE_DESKTOP.stage.w).toBeGreaterThanOrEqual(686.4);
    expect(REFERENCE_DESKTOP.stage.h).toBeGreaterThanOrEqual(640);
    expect(REFERENCE_PHONE.screen).toEqual({ w: 384, h: 740 });
    expect(REFERENCE_PHONE.dpr).toBe(2.8125);
    expect(REFERENCE_PHONE.stage).toEqual(stageFor(REFERENCE_PHONE.screen));
    expect(REFERENCE_PHONE.stage).toEqual({ w: 384, h: 422 });
    expect(REFERENCE_PHONE.stage.w).toBeGreaterThanOrEqual(368);
    expect(REFERENCE_PHONE.stage.h).toBeGreaterThanOrEqual(368);
  });

  it("keep the two smallest screens, their stages at least 304 × 196 and 304 × 208", () => {
    expect(SMALLEST.map((s) => s.screen)).toEqual([
      { w: 320, h: 568 },
      { w: 568, h: 320 },
    ]);
    expect(SMALLEST.map((s) => s.stage)).toEqual([
      { w: 320, h: 250 },
      { w: 328, h: 240.5 },
    ]);
    const [portrait, landscape] = SMALLEST.map((s) => s.stage);
    expect(portrait?.w).toBeGreaterThanOrEqual(304);
    expect(portrait?.h).toBeGreaterThanOrEqual(196);
    expect(landscape?.w).toBeGreaterThanOrEqual(304);
    expect(landscape?.h).toBeGreaterThanOrEqual(208);
    for (const s of SMALLEST) expect(stageFor(s.screen)).toEqual(s.stage);
  });

  it("sweep spec 004's 16-pixel grid, then a 64-pixel grid and named screens to 5120 × 2160 and 2160 × 3840", () => {
    const screens = sweepScreens();
    const keys = new Set(screens.map(key));
    expect(keys.size).toBe(screens.length);
    expect(SWEEP_STEP).toBe(16);
    // Spec 004's sweep, whole.
    for (const s of legacy.sweepScreens()) expect(keys.has(key(s)), key(s)).toBe(true);
    // The named screens, and the extremes.
    expect(NAMED_SCREENS).toEqual([
      { w: 2560, h: 1440 },
      { w: 3440, h: 1440 },
      { w: 3840, h: 2160 },
      { w: 5120, h: 1440 },
      { w: 5120, h: 2160 },
      { w: 1080, h: 1920 },
      { w: 2160, h: 3840 },
    ]);
    for (const s of NAMED_SCREENS) expect(keys.has(key(s)), key(s)).toBe(true);
    expect(Math.max(...screens.map((s) => s.w))).toBe(5120);
    expect(Math.max(...screens.map((s) => s.h))).toBe(3840);
    const named = new Set(NAMED_SCREENS.map(key));
    const old = new Set(legacy.sweepScreens().map(key));
    let coarse = 0;
    for (const s of screens) {
      if (old.has(key(s)) || named.has(key(s))) continue;
      coarse += 1;
      // The 64-pixel grid: landscape screens at least 576 tall, portrait from 1080 wide and 1920 tall.
      expect(s.w % 64, key(s)).toBe(0);
      expect(s.h % 64, key(s)).toBe(0);
      if (s.w > s.h) expect(s.h, key(s)).toBeGreaterThanOrEqual(576);
      else {
        expect(s.w, key(s)).toBeGreaterThanOrEqual(1080);
        expect(s.h, key(s)).toBeGreaterThanOrEqual(1920);
      }
    }
    expect(coarse).toBeGreaterThan(1000);
    // Sorted, so two builds walk them in one order; and every one holds the HUD.
    expect(screens).toEqual([...screens].sort((a, b) => a.w - b.w || a.h - b.h));
    for (const s of screens) expect(fitsHud(s), key(s)).toBe(true);
  });

  it("list every supported stage once: each screen's open stage, and a dock screen's collapsed one too", () => {
    const stages = supportedStages();
    expect(new Set(stages.map(key)).size).toBe(stages.length);
    const keys = new Set(stages.map(key));
    for (const s of [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage, ...SMALLEST.map((x) => x.stage)])
      expect(keys.has(key(s)), key(s)).toBe(true);
    for (const screen of sweepScreens()) {
      expect(keys.has(key(stageFor(screen))), key(screen)).toBe(true);
      if (layoutFor(screen) === "dock") {
        const collapsed = clearArea(screen, { list: "collapsed" });
        expect(keys.has(key(collapsed)), `${key(screen)}, collapsed`).toBe(true);
      }
    }
    for (const s of stages) {
      expect(s.w).toBeGreaterThanOrEqual(304);
      expect(s.h).toBeGreaterThanOrEqual(196);
    }
    expect(stages).toEqual([...stages].sort((a, b) => a.w - b.w || a.h - b.h));
  });

  it("frame at spec 002's six aspects and a series by ×1.25 outward that covers every supported stage", () => {
    for (const a of [0.45, 0.6, 0.8, 1.15, 1.5, 2.4]) expect(ASPECTS).toContain(a);
    expect([...ASPECTS]).toEqual([...ASPECTS].sort((a, b) => a - b));
    const low = ASPECTS.filter((a) => a < 0.45);
    const high = ASPECTS.filter((a) => a > 2.4);
    for (let i = 0; i < low.length; i += 1) expect(low[i]).toBeCloseTo((low[i + 1] ?? 0.45) / 1.25, 12);
    for (let i = 0; i < high.length; i += 1) expect(high[i]).toBeCloseTo((high[i - 1] ?? 2.4) * 1.25, 12);
    // Spec 014: the supported stages are the frame areas, given the room's protector, whose narrowest aspect is a step
    // below the clear areas' (its plan §11); the clear areas stay covered, since a frame that falls back frames into
    // one (its FR-004).
    const { scene, index } = repositoryBundle();
    const aspects = [...supportedStages(protectorFor(protectSceneOf(scene, index))), ...supportedStages()].map(
      (s) => s.w / s.h,
    );
    const [lo, hi] = [Math.min(...aspects), Math.max(...aspects)];
    expect(ASPECTS[0]).toBeLessThanOrEqual(lo);
    expect(ASPECTS.at(-1)).toBeGreaterThanOrEqual(hi);
    // The series stops one step past each end: nothing beyond the cover.
    expect((ASPECTS[1] ?? 0) > lo).toBe(true);
    expect((ASPECTS.at(-2) ?? 0) < hi).toBe(true);
  });

  it("give the 2D drawing's scale on a stage as min(W ÷ 320, H ÷ 200)", () => {
    expect(flatScale({ w: 304, h: 248 })).toBeCloseTo(0.95, 12);
    expect(flatScale({ w: 320, h: 250 })).toBe(1);
    expect(flatScale({ w: 686.4, h: 640 })).toBeCloseTo(2.145, 12);
    expect(flatScale({ w: 640, h: 300 })).toBe(1.5);
  });
});

describe("room.css's HUD rules follow the table (plan.md §2.3)", () => {
  const COLUMN = 'html[data-hud="column"]';
  const DOCK = 'html[data-hud="dock"]';

  it("size each docked box from the table's properties, and set no length of their own for one", () => {
    // The strip grows with its words, never clipping them (the review of 60b51de4, finding 3; FR-049).
    expect(decl(`${COLUMN} .disclosure`, "min-height")).toBe("var(--strip-h)");
    expect(decl(`${DOCK} .disclosure`, "min-height")).toBe("var(--strip-h)");
    for (const at of [COLUMN, DOCK]) {
      const strip = RULES.filter((r) => r.selector === `${at} .disclosure`);
      expect(
        strip.some((r) => r.decls.has("height")),
        `${at}: no fixed height`,
      ).toBe(false);
      expect(
        strip.some((r) => r.decls.get("overflow") === "hidden"),
        `${at}: no overflow hidden`,
      ).toBe(false);
    }
    expect(decl(`${COLUMN} .hud-bar`, "height")).toBe("var(--bar-h)");
    expect(decl(`${DOCK} .hud-bar`, "height")).toBe("var(--bar-h)");
    expect(decl(`${COLUMN} .hud-panels`, "width")).toBe("var(--column-w)");
    // Spec 014 (FR-017, FR-021; W4): the column is its content's height at its band's foot, no longer from the strip.
    expect(decl(`${COLUMN} .hud-panels`, "top")).toBe("auto");
    expect(decl(`${COLUMN} .hud-panels`, "bottom")).toBe("calc(var(--bar-h) + var(--keyboard))");
    expect(decl(`${DOCK} .hud-panels`, "height")).toBe("var(--dock-h)");
    expect(decl(`${DOCK} .hud-panels`, "bottom")).toBe("calc(var(--bar-h) + var(--keyboard))");
    for (const [p, v] of [
      ["left", "var(--clear-x)"],
      ["top", "var(--clear-y)"],
      ["width", "var(--clear-w)"],
      ["height", "var(--clear-h)"],
    ] as const) {
      expect(decl(`${COLUMN} .room-clear`, p)).toBe(v);
      expect(decl(`${DOCK} .room-clear`, p)).toBe(v);
    }
    const boxes = [".disclosure", ".hud-bar", ".hud-panels", ".room-clear"];
    const sizes = ["width", "height", "top", "bottom", "left", "right", "inset", "min-height", "max-height"];
    for (const rule of RULES) {
      if (!boxes.some((b) => rule.selector === `${COLUMN} ${b}` || rule.selector === `${DOCK} ${b}`)) continue;
      for (const [p, v] of rule.all)
        if (sizes.includes(p))
          expect(/\d(px|rem|em|%|vh|vw|dvh)/.test(v.replace(/var\([^)]*\)/g, "")), `${rule.selector} ${p}: ${v}`).toBe(
            false,
          );
    }
  });

  // T023 (spec 014; FR-021, SC-002; plan.md §3.2): in the column layout, the compact clusters take their sizes from
  // the room's properties, which layout.ts sets from compactBoxes: the strip's place and width, the bar's width at the
  // foot's right, and the column's height; the log rests at --log-rest. --clear-*, --notes-h, and --column-w keep their
  // meanings, and each compact box's rule sets no length of its own.
  it("sizes the column layout's compact clusters from --strip-w, --bar-w, and --column-h (spec 014, T023)", () => {
    expect(decl(`${COLUMN} .disclosure`, "left")).toBe("var(--strip-x)");
    expect(decl(`${COLUMN} .disclosure`, "right")).toBe("auto");
    expect(decl(`${COLUMN} .disclosure`, "width")).toBe("var(--strip-w)");
    expect(decl(`${COLUMN} .hud-bar`, "left")).toBe("auto");
    expect(decl(`${COLUMN} .hud-bar`, "right")).toBe("var(--safe-right)");
    expect(decl(`${COLUMN} .hud-bar`, "width")).toBe("var(--bar-w)");
    expect(decl(`${COLUMN} .hud-bar`, "height")).toBe("var(--bar-h)");
    expect(decl(`${COLUMN} .hud-panels`, "height")).toBe("var(--column-h)");
    expect(decl(`${COLUMN} .hud-panels`, "width")).toBe("var(--column-w)");
    expect(decl(`${COLUMN} .talk-log`, "max-height")).toBe("var(--log-rest)");
    expect(decl(`${COLUMN} .talk-log`, "overflow-y")).toBe("auto");
    // The dock keeps spec 005's bands.
    expect(decl(`${DOCK} .hud-panels`, "height")).toBe("var(--dock-h)");
    expect(RULES.some((r) => r.selector === `${DOCK} .disclosure` && r.decls.has("width"))).toBe(false);
    // The resume and the larger view keep reading the clear area, the notes' reserve, and the column's band.
    expect(decl(`${COLUMN} .resume-panel`, "width")).toBe("var(--clear-w)");
    // Its top from the compact column back up to the notes' reserve (T053's second review).
    expect(decl(`${COLUMN} .talk[data-larger="on"] .talk-sheet`, "top")).toBe(
      "calc(var(--notes-h) + var(--column-h) - var(--clear-h))",
    );
    expect(decl(`${COLUMN} .talk[data-larger="on"] .talk-sheet`, "max-width")).toBe("calc(100vw - var(--column-w))");
  });

  it("make the room block the window: 100dvh after 100vh, and the page in the room no frame", () => {
    const block = RULES.filter((r) => r.selector === `${COLUMN} .room-block` && r.media === null);
    const heights = block.flatMap((r) => r.all.filter(([p]) => p === "height").map(([, v]) => v));
    expect(heights).toEqual(["100vh", "100dvh"]);
    expect(decl(`${DOCK} .room-block`, "height")).toBe("100dvh");
    expect(decl(`${COLUMN} .room-stage`, "position")).toBe("absolute");
    expect(decl(`${COLUMN} .room-stage`, "inset")).toBe("0");
    const inRoom = RULES.filter((r) => r.selector === "body.in-room" && r.media === null);
    for (const r of inRoom) {
      expect(r.decls.has("max-width"), "body.in-room's max-width").toBe(false);
      expect(r.decls.has("padding"), "body.in-room's padding").toBe(false);
    }
  });

  // The review of 60b51de4's nit: the characters-left counter, a third line under the text box's row, spilled over the
  // bar, since the dock's height (the table's talk entry) counts the label's line and the row. In the dock it shares
  // the label's line, on its right, and both fit there at the narrowest window, its widest words included.
  it("keep the dock's characters-left counter on the label's line, which the dock's height counts", () => {
    expect(decl(`${DOCK} .talk-form`, "grid-template-columns")).toBe("1fr auto");
    expect(decl(`${DOCK} .talk-form label`, "grid-row")).toBe("1");
    expect(decl(`${DOCK} .talk-form label`, "grid-column")).toBe("1");
    expect(decl(`${DOCK} .talk-counter`, "grid-row")).toBe("1");
    expect(decl(`${DOCK} .talk-counter`, "grid-column")).toBe("2");
    expect(decl(`${DOCK} .talk-counter`, "line-height")).toBe(String(HUD_PLACEMENTS.talk.lineHeight));
    expect(decl(`${DOCK} .talk-row`, "grid-column")).toBe("1 / -1");
    const rem = DEFAULT_METRICS.rem;
    const size = HUD_PLACEMENTS.talk.labelRem * rem;
    const widest = `${Math.ceil(DEFAULT_TALK_LIMITS.turnMaxChars * 0.2)} characters left`;
    const words = textWidth("Your message", size) + HUD_PLACEMENTS.talk.gapRem * rem + textWidth(widest, size);
    expect(words).toBeLessThanOrEqual(320 - 2 * HUD_PLACEMENTS.dock.padRem * rem);
  });

  it("keep the 2D drawing's container rule and the walking control's box", () => {
    expect(decl(".flat", "width")).toBe("min(100cqw, 160cqh)");
    expect(decl(".flat", "height")).toBe("min(100cqh, 62.5cqw)");
    expect(decl(".room-walk", "position")).toBe("absolute");
    expect(rem(decl(".room-walk", "width"))).toBe(WALK_CONTROL.widthRem);
    expect(rem(decl(".room-walk", "height"))).toBe(WALK_CONTROL.heightRem);
    expect(rem(decl(".room-walk", "right"))).toBe(WALK_CONTROL.insetRem);
    expect(rem(decl(".room-walk", "bottom"))).toBe(WALK_CONTROL.insetRem);
  });
});

// T303 (spec 004; FR-064; spec.md's Clarifications, 2026-10-26, T302), as spec 005 moves it: the stage of the 2D
// drawing's smallest scale, which RG6's reasons name, is now the 320 × 568 screen's clear area, at 1.
describe("the 2D drawing's smallest scale (compose/stages.ts)", () => {
  it("comes first at 320 × 250, at 1, and only at stages 320 px wide", async () => {
    expect(smallestFlatStage()).toEqual({ w: 320, h: 250 });
    expect(flatScale(smallestFlatStage())).toBe(1);
    for (const s of supportedStages()) if (flatScale(s) <= 1 + 1e-12) expect(s.w).toBe(320);
    // Spec 005's floor: the smallest 2D scale only grows, from spec 004's 0.95.
    expect(flatScale(smallestFlatStage())).toBeGreaterThan(flatScale(legacy.SMALLEST[0]?.stage ?? { w: 0, h: 0 }));
    const module = await import("../../src/room/compose/stages");
    expect(Object.keys(module)).not.toContain("isFr064Smallest");
    expect(Object.keys(module)).not.toContain("fr064SmallestStages");
    expect(Object.keys(module)).not.toContain("ROOM_CSS");
  });
});

// T033 (spec 008; FR-021; plan.md R-09): the walking control's box, a fixed box in the stage's bottom-right corner that
// room.css's `.room-walk` sets and compose/stages.ts pins: at least 44 × 44 CSS pixels; since spec 005, the clear
// area's corner.
describe("the walking control's box (spec 008, T033)", () => {
  it("is at least 44 × 44 CSS pixels, in the stage's bottom-right corner, at every supported stage", () => {
    expect(WALK_CONTROL).toEqual({ widthRem: 8, heightRem: 2.75, insetRem: 0.5 });
    expect(WALK_CONTROL.heightRem * 16).toBeGreaterThanOrEqual(44);
    expect(WALK_CONTROL.widthRem * 16).toBeGreaterThanOrEqual(44);
    for (const stage of supportedStages()) {
      const [x, y, w, h] = walkControlBox(stage);
      expect([w, h]).toEqual([128, 44]);
      expect(x + w).toBe(stage.w - 8);
      expect(y + h).toBe(stage.h - 8);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
    }
  });
});

// T009 (spec 014; FR-060, FR-061, SC-002; contracts/frame-area.md §5; plan.md §11): the supported stages, given the
// composed scene's protector, are the frame areas the kernel gives each screen and docked-panel state, each with the
// compact boxes that overlap it, the walking control's among them, translated into the area's pixels and clipped to it,
// as its reserved boxes. Without a protector they stay spec 005's clear areas, with the walking control's box reserved.
describe("the stages as frame areas (spec 014, T009)", () => {
  const { scene, index } = repositoryBundle();
  const protect = protectorFor(protectSceneOf(scene, index));
  const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  /** The reserved boxes of a frame area, written out: every compact box that overlaps it, in its pixels, clipped. Spec
   *  028 (T-A05; plan.md §R-B8): the compact boxes the room's protector's wall gives, the split layout's where the
   *  window takes it. */
  function reservedOf(area: Box, screen: { w: number; h: number }, state = OPENING): Rect[] {
    return compactBoxes(screen, state, DEFAULT_METRICS, { wall: protect }).all.flatMap((b): Rect[] => {
      if (!overlap(b, area)) return [];
      const x0 = Math.max(b.x, area.x);
      const y0 = Math.max(b.y, area.y);
      const x1 = Math.min(b.x + b.w, area.x + area.w);
      const y1 = Math.min(b.y + b.h, area.y + area.h);
      return [[x0 - area.x, y0 - area.y, x1 - x0, y1 - y0]];
    });
  }

  it("gives each screen its frame area, with the overlapping compact boxes reserved in the area's pixels", () => {
    for (const screen of [
      { w: 1920, h: 1200 },
      { w: 2560, h: 1440 },
      { w: 1280, h: 720 },
      { w: 390, h: 844 },
      { w: 568, h: 320 },
      { w: 5120, h: 1440 },
    ]) {
      const f = frameArea(screen, OPENING, DEFAULT_METRICS, protect);
      const stage = stageFor(screen, protect);
      expect([stage.w, stage.h], key(screen)).toEqual([f.area.w, f.area.h]);
      expect(stage.reserved, key(screen)).toEqual(reservedOf(f.area, screen));
      expect(stage.ease, key(screen)).toBe(f.ease);
      // The walking control's box is always among them: it stands in the clear area, which every frame area holds.
      expect(stage.reserved?.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps spec 005's stages without a protector: the clear areas, the walking control's box reserved", () => {
    const stage = stageFor({ w: 1920, h: 1200 });
    expect(stage).toEqual({ w: 1472, h: 1120.5 });
    // No reserved boxes of its own: RG6 reserves spec 005's, the walking control's box alone.
    expect(stage.reserved).toBeUndefined();
    expect(reservedBoxes(stage)).toEqual([walkControlBox(stage)]);
  });

  it("lists each sweep screen's frame area once, a dock screen's collapsed one too, its reserved boxes with it", () => {
    const stages = supportedStages(protect);
    const id = (s: { w: number; h: number; reserved?: readonly Rect[] }): string =>
      `${s.w}x${s.h}:${JSON.stringify(s.reserved ?? [])}`;
    const keys = new Set(stages.map(id));
    expect(keys.size).toBe(stages.length);
    const screens = sweepScreens();
    for (let i = 0; i < screens.length; i += 97) {
      const screen = screens[i] as { w: number; h: number };
      expect(keys.has(id(stageFor(screen, protect))), key(screen)).toBe(true);
      if (layoutFor(screen) === "dock") {
        const collapsed = { list: "collapsed" } as const;
        const f = frameArea(screen, collapsed, DEFAULT_METRICS, protect);
        expect(
          keys.has(id({ w: f.area.w, h: f.area.h, reserved: reservedOf(f.area, screen, collapsed) })),
          key(screen),
        ).toBe(true);
      }
    }
  });

  it("frames at aspects that cover every frame area", () => {
    const aspects = supportedStages(protect).map((s) => s.w / s.h);
    expect(ASPECTS[0]).toBeLessThanOrEqual(Math.min(...aspects));
    expect(ASPECTS.at(-1)).toBeGreaterThanOrEqual(Math.max(...aspects));
  });
});

// T-A05 (spec 028; FR-010; plan.md §R-A7): the compositor judges the split layout's stages. Every screen of the sweep
// that takes the split layout with the room's protector is framed into the split's area, with no ease, the strip, the
// panel, and the column that overlap it reserved in its pixels; a dinosaur visit's variant (spec 024's Q150) keeps its
// "Eat" tile in the column, so it reserves nothing more.
describe("the split layout's stages (spec 028, T-A05)", () => {
  const { scene, index } = repositoryBundle();
  const protect = protectorFor(protectSceneOf(scene, index));
  const protectEat = protectorFor(protectSceneOf(scene, index), DEFAULT_METRICS.rem, { eat: true });
  const screens = sweepScreens().filter((s) => wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: protect }) !== null);

  it("are taken at the wide screens of the sweep", () => {
    expect(screens.length).toBeGreaterThan(100);
    for (const s of [
      { w: 1920, h: 1200 },
      { w: 2560, h: 1440 },
    ])
      expect(
        screens.some((x) => x.w === s.w && x.h === s.h),
        key(s),
      ).toBe(true);
  });

  it("frame each split screen into the split's area, no ease, its strip, panel, and column reserved", () => {
    const wrong: string[] = [];
    for (const s of screens) {
      const split = wallBoxes(s, OPENING, DEFAULT_METRICS, { wall: protect });
      if (!split) continue;
      const c = compactBoxes(s, OPENING, DEFAULT_METRICS, { wall: protect });
      const want = {
        w: split.area.w,
        h: split.area.h,
        reserved: reservedIn(split.area, [c.strip, split.panel, split.column]),
        ease: 0,
      };
      if (JSON.stringify(stageFor(s, protect)) !== JSON.stringify(want)) wrong.push(key(s));
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("are among the swept stages RG5 to RG7 judge", () => {
    const made = framedStages(protect);
    for (const s of screens.filter((_, k) => k % 13 === 0)) {
      const swept = made.screens.find((x) => x.screen.w === s.w && x.screen.h === s.h && x.state.list === "open");
      expect(swept?.stage, key(s)).toEqual(stageFor(s, protect));
    }
  });

  it("keep a dinosaur visit's Eat tile in the column, reserving nothing more", () => {
    for (const s of screens.filter((_, k) => k % 7 === 0)) {
      const c = compactBoxes(s, OPENING, DEFAULT_METRICS, { eat: true, wall: protectEat });
      const split = c.split;
      if (!split || !c.eat) throw new Error(`no split or no Eat box at ${key(s)}`);
      const inColumn =
        c.eat.x >= split.column.x - 1e-9 &&
        c.eat.y >= split.column.y - 1e-9 &&
        c.eat.x + c.eat.w <= split.column.x + split.column.w + 1e-9 &&
        c.eat.y + c.eat.h <= split.column.y + split.column.h + 1e-9;
      expect(inColumn, key(s)).toBe(true);
      expect(stageFor(s, protectEat).reserved, key(s)).toEqual(stageFor(s, protect).reserved);
    }
  });
});
