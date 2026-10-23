// T061 (spec 004; FR-009, FR-052, FR-064; R-18, R-19; contracts/room-data-files.md §13.3): the supported stages are
// code, `compose/stages.ts`, pinned here to `src/room/room.css`'s stage rules, so a data edit can't weaken the checks
// that run at them. The six framing aspects; the reference stages (the desktop's ≈ 686 × 640 CSS px from a 1920 × 1200
// window at a pixel ratio of 1, the phone's ≈ 368 × 420 at 2.8125); the smallest stages, a 320 × 568 screen in
// portrait and in landscape; and the sweep of screens from 320 × 568 to 1920 × 1200, each through room.css's formulas.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ASPECTS,
  REFERENCE_DESKTOP,
  REFERENCE_PHONE,
  ROOM_CSS,
  SMALLEST,
  SWEEP_STEP,
  flatScale,
  stageFor,
  supportedStages,
  sweepScreens,
} from "../../src/room/compose/stages";

const CSS = readFileSync(fileURLToPath(new URL("../../src/room/room.css", import.meta.url)), "utf8");

interface Rule {
  media: string | null;
  selector: string;
  /** Each property's last value, as the cascade takes it within one rule. */
  decls: Map<string, string>;
}

/** The style sheet's rules, one level of @media deep: enough to read the stage's rules without a CSS library. */
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
      if (head.startsWith("@media")) walk(inner, head.slice("@media".length).trim());
      else {
        const decls = new Map<string, string>();
        for (const part of inner.split(";")) {
          const colon = part.indexOf(":");
          if (colon > 0) decls.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
        }
        for (const selector of head.split(",")) out.push({ media, selector: selector.trim(), decls });
      }
      i = j;
    }
  };
  walk(text, null);
  return out;
}

const RULES = rules(CSS);
const LANDSCAPE = "(orientation: landscape) and (min-width: 32rem)";

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

describe("the stages (compose/stages.ts)", () => {
  it("hold spec 002's six framing aspects", () => {
    expect(ASPECTS).toEqual([0.45, 0.6, 0.8, 1.15, 1.5, 2.4]);
  });

  it("read room.css's stage rules: the page's padding and width, the reserves, the clamps, and the columns", () => {
    expect(ROOM_CSS.rem).toBe(16);
    expect(rem(decl("body.in-room", "max-width"))).toBe(ROOM_CSS.bodyMaxWidthRem);
    expect(rem(decl("body.in-room", "padding"))).toBe(ROOM_CSS.bodyPaddingRem);
    expect(rem(decl(".room", "gap"))).toBe(ROOM_CSS.gapRem);
    expect(decl(".room", "grid-template-columns")).toBe("minmax(0, 1fr)");
    // The stage's height, in portrait first: the screen's height less a reserve, between a floor and a ceiling.
    expect(decl(".room-stage", "height")).toBe(`calc(100dvh - ${ROOM_CSS.portraitReserveRem}rem)`);
    expect(rem(decl(".room-stage", "min-height"))).toBe(ROOM_CSS.stageMinHeightRem);
    expect(rem(decl(".room-stage", "max-height"))).toBe(ROOM_CSS.stageMaxHeightRem);
    // Landscape, at least 32rem wide: the stage beside the list, three parts to two, the list at least 15rem.
    expect(RULES.some((r) => r.media === LANDSCAPE)).toBe(true);
    expect(ROOM_CSS.landscapeMinWidthRem).toBe(32);
    expect(decl(".room", "grid-template-columns", LANDSCAPE)).toBe(
      `minmax(0, ${ROOM_CSS.stageFr}fr) minmax(${ROOM_CSS.listMinRem}rem, ${ROOM_CSS.listFr}fr)`,
    );
    expect(decl(".room-stage", "height", LANDSCAPE)).toBe(`calc(100dvh - ${ROOM_CSS.landscapeReserveRem}rem)`);
    // The 2D drawing keeps its 8:5 shape inside the stage, so its scale is min(W ÷ 320, H ÷ 200).
    expect(decl(".flat", "width")).toBe("min(100cqw, 160cqh)");
    expect(decl(".flat", "height")).toBe("min(100cqh, 62.5cqw)");
  });

  it("give the reference desktop's stage, ≈ 686 × 640 CSS px from a 1920 × 1200 window at a pixel ratio of 1", () => {
    expect(REFERENCE_DESKTOP.screen).toEqual({ w: 1920, h: 1200 });
    expect(REFERENCE_DESKTOP.dpr).toBe(1);
    expect(REFERENCE_DESKTOP.stage.w).toBeCloseTo(686.4, 9);
    expect(REFERENCE_DESKTOP.stage.h).toBe(640);
    expect(stageFor(REFERENCE_DESKTOP.screen)).toEqual(REFERENCE_DESKTOP.stage);
  });

  it("give the reference phone's stage, ≈ 368 × 420 CSS px at a pixel ratio of 2.8125", () => {
    expect(REFERENCE_PHONE.dpr).toBe(2.8125);
    expect(REFERENCE_PHONE.stage).toEqual({ w: 368, h: 420 });
    expect(stageFor(REFERENCE_PHONE.screen)).toEqual(REFERENCE_PHONE.stage);
  });

  it("give the smallest stages: 304 × 248 for 320 × 568 in portrait, 304 × 208 for 568 × 320 in landscape", () => {
    expect(SMALLEST.map((s) => s.screen)).toEqual([
      { w: 320, h: 568 },
      { w: 568, h: 320 },
    ]);
    expect(SMALLEST.map((s) => s.stage)).toEqual([
      { w: 304, h: 248 },
      // The list's column keeps its 15rem minimum, so the stage takes 552 − 8 − 240 px, not three fifths of 544.
      { w: 304, h: 208 },
    ]);
    for (const s of SMALLEST) expect(stageFor(s.screen)).toEqual(s.stage);
  });

  it("follow room.css between the two layouts: clamped heights, the page's 72rem, the list's 15rem", () => {
    // Portrait: the page's width less its padding; the height less 20rem, at least 9rem and at most 40rem.
    expect(stageFor({ w: 390, h: 844 })).toEqual({ w: 374, h: 524 });
    expect(stageFor({ w: 360, h: 420 })).toEqual({ w: 344, h: 144 });
    expect(stageFor({ w: 1024, h: 1366 })).toEqual({ w: 1008, h: 640 });
    // A square is portrait in CSS.
    expect(stageFor({ w: 800, h: 800 })).toEqual({ w: 784, h: 480 });
    // Narrower than 32rem stays portrait even when wider than tall.
    expect(stageFor({ w: 500, h: 300 })).toEqual({ w: 484, h: 144 });
    // Landscape: three fifths of the row once the list's two fifths reach 15rem, the height less 7rem.
    expect(stageFor({ w: 1024, h: 600 })).toEqual({ w: 600, h: 488 });
    const above = stageFor({ w: 700, h: 400 });
    expect(above.w).toBeCloseTo(((700 - 16 - 8) * 3) / 5, 9);
    expect(above.h).toBe(288);
    // Below that, the list keeps its 15rem and the stage takes the rest of the row.
    expect(stageFor({ w: 600, h: 360 })).toEqual({ w: 336, h: 248 });
    // The page stops at 72rem.
    expect(stageFor({ w: 1280, h: 720 }).w).toBeCloseTo(((1152 - 8) * 3) / 5, 9);
    expect(stageFor({ w: 2560, h: 1440 }).w).toBeCloseTo(((1152 - 8) * 3) / 5, 9);
  });

  it("sweep the screens from 320 × 568 to 1920 × 1200, in both orientations", () => {
    const screens = sweepScreens();
    const key = (s: { w: number; h: number }): string => `${s.w}x${s.h}`;
    const keys = new Set(screens.map(key));
    expect(keys.size).toBe(screens.length);
    for (const s of [...SMALLEST.map((x) => x.screen), REFERENCE_DESKTOP.screen, REFERENCE_PHONE.screen])
      expect(keys.has(key(s)), key(s)).toBe(true);
    expect(SWEEP_STEP).toBe(16);
    for (const w of [320, 336, 1904, 1920]) expect(keys.has(`${w}x1200`), `${w} wide`).toBe(true);
    expect(keys.has("1920x320")).toBe(true);
    for (const s of screens) {
      expect(s.w).toBeGreaterThanOrEqual(320);
      expect(s.w).toBeLessThanOrEqual(1920);
      expect(s.h).toBeGreaterThanOrEqual(320);
      expect(s.h).toBeLessThanOrEqual(1200);
      // Nothing smaller than the 320 × 568 screen, turned either way.
      if (s.h >= s.w) expect(s.h, key(s)).toBeGreaterThanOrEqual(568);
      else expect(s.w, key(s)).toBeGreaterThanOrEqual(568);
    }
    // A screen below 320 × 568 in portrait would give the CSS minimum, 304 × 144, which R-19 leaves out.
    expect(keys.has("320x480")).toBe(false);
  });

  it("list every supported stage once, the reference and smallest stages among them, none under the smallest", () => {
    const stages = supportedStages();
    const key = (s: { w: number; h: number }): string => `${s.w}x${s.h}`;
    expect(new Set(stages.map(key)).size).toBe(stages.length);
    const keys = new Set(stages.map(key));
    for (const s of [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage, ...SMALLEST.map((x) => x.stage)])
      expect(keys.has(key(s)), key(s)).toBe(true);
    for (const s of stages) {
      expect(s.w).toBeGreaterThanOrEqual(304);
      expect(s.h).toBeGreaterThanOrEqual(208);
      expect(s.h).toBeLessThanOrEqual(640);
    }
    for (const s of sweepScreens()) expect(keys.has(key(stageFor(s)))).toBe(true);
    // Sorted, so two builds walk them in one order.
    const sorted = [...stages].sort((a, b) => a.w - b.w || a.h - b.h);
    expect(stages).toEqual(sorted);
  });

  it("give the 2D drawing's scale on a stage as min(W ÷ 320, H ÷ 200)", () => {
    expect(flatScale({ w: 304, h: 248 })).toBeCloseTo(0.95, 12);
    expect(flatScale({ w: 304, h: 208 })).toBeCloseTo(0.95, 12);
    expect(flatScale({ w: 686.4, h: 640 })).toBeCloseTo(2.145, 12);
    expect(flatScale({ w: 640, h: 300 })).toBe(1.5);
  });
});
