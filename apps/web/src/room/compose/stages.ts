// The supported stages, as code (spec 004; FR-009, FR-052, FR-054, FR-064; R-18, R-19; contracts/room-data-files.md
// §13.3), as spec 005 changes them (its FR-052 to FR-054; plan.md §3.1, PD-9, PD-10): each stage is the clear area the
// HUD's placements (`compose/hud.ts`) leave a screen, so the checks that run here (RG5 to RG7) judge the room where it
// is framed. `test/room/stages.test.ts` pins these and the placements to room.css's rules, and
// `test/room/stages-floor.test.ts` holds every screen of spec 004's sweep to its stage before spec 005, frozen in
// `test/room/legacy-stages.ts`, so a data edit can't weaken the checks and a layout edit can't shrink a stage. Sizes are
// CSS pixels.
// Spec 014 (FR-060, FR-061; contracts/frame-area.md §5; plan.md §11): given the composed scene's protector, each stage
// is the frame area the kernel gives its screen and docked-panel state (compose/frame.ts), between the window and the
// clear area, with the compact boxes that overlap it, the walking control's among them, in its pixels, as its
// `reserved` boxes, which RG6 reserves. Every frame area holds its clear area, so the floor holds. Without a protector
// a stage is spec 005's clear area, the walking control's box its one reserved box, as before.
import { frameArea, reservedIn } from "./frame";
import type { Protect } from "./frame";
import { DEFAULT_METRICS, OPENING, clearArea, compactBoxes, layoutFor } from "./hud";
import type { Box, HudState } from "./hud";
import type { Rect } from "./pick";

/** A screen: the browser's viewport, in CSS pixels. */
export interface Screen {
  readonly w: number;
  readonly h: number;
}

/** The room's stage: the clear area the 3D room is framed into or the 2D drawing fills, in CSS pixels; since spec 014,
 *  given the scene's protector, its frame area, with the HUD boxes over it reserved, in its pixels, and its ease. */
export interface Stage {
  readonly w: number;
  readonly h: number;
  /** The HUD boxes over the stage, in its pixels, which RG6 and the room's picker reserve; absent, the walking
   *  control's box alone (spec 005's reservedBoxes). */
  readonly reserved?: readonly Rect[];
  /** The frame area's ease, 0 (the window) to 1 (the clear area), in sixteenths; absent for spec 005's stages. */
  readonly ease?: number;
}

/** Spec 002's six framing aspects, width over height (FR-009). */
const SPEC_002_ASPECTS = [0.45, 0.6, 0.8, 1.15, 1.5, 2.4] as const;

/** The aspect series' factor outward from spec 002's six, and how many steps it takes each way to cover the supported
 *  stages' narrowest aspect and widest (about 9.4, 5120 × 576's): PD-10. Since spec 014 the narrowest is a frame
 *  area's, about 0.27, a 320 × 1200 window's at ease 0, a step below the clear areas' 0.30, so the series takes one
 *  more step down (its plan §11). The stages test pins the cover, and that it stops one step past each end. */
const ASPECT_STEP = 1.25;
const STEPS_DOWN = 3;
const STEPS_UP = 7;

/** A series value without binary noise: 0.288, not 0.28800000000000003, as RG5's reasons print it. */
const decimal = (x: number): number => Number(x.toFixed(12));

/** The framing aspects RG5 checks: spec 002's six, and the series by ×1.25 outward (FR-053; PD-10). */
export const ASPECTS: readonly number[] = [
  ...Array.from({ length: STEPS_DOWN }, (_, i) => decimal(SPEC_002_ASPECTS[0] / ASPECT_STEP ** (STEPS_DOWN - i))),
  ...SPEC_002_ASPECTS,
  ...Array.from({ length: STEPS_UP }, (_, i) => decimal(SPEC_002_ASPECTS[5] * ASPECT_STEP ** (i + 1))),
];

/** The stage for a screen: the clear area the HUD leaves it with every panel open, at the compositor's metrics (a
 *  16-pixel root, no safe areas); since spec 014, given the scene's protector, the frame area there, with the compact
 *  boxes over it reserved, in a docked-panel state (the opening one unless named). Its name stays spec 004's, since
 *  lookdev and the tests call it. */
export function stageFor(screen: Screen, protect?: Protect, state: HudState = OPENING): Stage {
  if (!protect) {
    const clear = clearArea(screen, state, DEFAULT_METRICS);
    return { w: clear.w, h: clear.h };
  }
  const f = frameArea(screen, state, DEFAULT_METRICS, protect);
  // Spec 028 (FR-010; plan.md §R-A7): the protector's wall gives the split layout's boxes where the screen takes it, so
  // its stage is the split's area with the strip, the panel, and the column over it reserved.
  const hud = compactBoxes(screen, state, DEFAULT_METRICS, { eat: protect.eat, wall: protect }).all;
  return framedStage(f.area, f.ease, hud);
}

/** A frame area as a stage: its size, its reserved boxes, and its ease. */
export function framedStage(area: Box, ease: number, hud: readonly Box[]): Stage {
  return { w: area.w, h: area.h, reserved: reservedIn(area, hud), ease };
}

/** A screen and the stage it gets. */
export interface ScreenStage {
  readonly screen: Screen;
  readonly stage: Stage;
}

export interface ReferenceStage extends ScreenStage {
  /** The device pixel ratio: a live face's canvas is at most its on-screen size times this (FR-054). */
  readonly dpr: number;
}

const reference = (screen: Screen, dpr: number): ReferenceStage => ({ screen, dpr, stage: stageFor(screen) });

/**
 * The reference desktop (spec 002's FR-048): a 1920 × 1200 window at a pixel ratio of 1, whose stage is its clear area,
 * 1472 × 1120.5 (≈ 686 × 640 before spec 005).
 */
export const REFERENCE_DESKTOP: ReferenceStage = reference({ w: 1920, h: 1200 }, 1);

/**
 * The reference phone (ADR 0010's Galaxy A54 class): a 384 × 740 CSS-pixel viewport in portrait, the browser's bars
 * taken off its 384 × 832 screen, at a pixel ratio of 2.8125, whose stage is its clear area in the dock layout,
 * 384 × 422 (368 × 368 before spec 005).
 */
export const REFERENCE_PHONE: ReferenceStage = reference({ w: 384, h: 740 }, 2.8125);

/**
 * The smallest supported screens (R-19): 320 × 568 in portrait, whose stage is 320 × 250 (304 × 196 before spec 005),
 * and the same screen in landscape, 328 × 240.5 (304 × 208 before).
 */
export const SMALLEST: readonly ScreenStage[] = [
  { screen: { w: 320, h: 568 }, stage: stageFor({ w: 320, h: 568 }) },
  { screen: { w: 568, h: 320 }, stage: stageFor({ w: 568, h: 320 }) },
];

/** The sweep's step between screens, in CSS pixels, from 320 × 568 to 1920 × 1200: spec 004's grid. */
export const SWEEP_STEP = 16;
/** The coarser step beyond it (PD-9). */
export const COARSE_STEP = 64;

const SWEEP_MIN = 320;
const SWEEP_MAX_W = 1920;
const SWEEP_MAX_H = 1200;
/** The smallest screen's long side: 568, its height in portrait and its width in landscape. */
const LONG_MIN = 568;
/** The coarse grid's bounds: landscape screens from 576 tall to 5120 × 2160; portrait from 1080 × 1920 to
 *  2160 × 3840. */
const COARSE = { landscapeMinH: 576, maxW: 5120, maxH: 2160, portraitMinW: 1080, portraitMinH: 1920 } as const;
const PORTRAIT_MAX = { w: 2160, h: 3840 } as const;

/** Screens the sweep holds by name (PD-9): the common large monitors and ultrawides, and the grid's corners. */
export const NAMED_SCREENS: readonly Screen[] = [
  { w: 2560, h: 1440 },
  { w: 3440, h: 1440 },
  { w: 3840, h: 2160 },
  { w: 5120, h: 1440 },
  { w: 5120, h: 2160 },
  { w: 1080, h: 1920 },
  { w: 2160, h: 3840 },
];

/**
 * The sweep of screens (R-19; PD-9): spec 004's, every screen in SWEEP_STEP steps from 320 to 1920 wide and 320 to 1200
 * tall that is at least the smallest screen in its orientation, with the smallest and the reference screens; then,
 * beyond it, every screen on a COARSE_STEP grid wider than tall from 576 tall up to 5120 × 2160, and held upright from
 * 1080 × 1920 up to 2160 × 3840; then the named screens. Once each, sorted by width and then height.
 */
export function sweepScreens(): Screen[] {
  const seen = new Map<string, Screen>();
  const add = (s: Screen): void => {
    seen.set(`${s.w}x${s.h}`, s);
  };
  for (let w = SWEEP_MIN; w <= SWEEP_MAX_W; w += SWEEP_STEP) {
    for (let h = SWEEP_MIN; h <= SWEEP_MAX_H; h += SWEEP_STEP) {
      if (h >= w ? h >= LONG_MIN : w >= LONG_MIN) add({ w, h });
    }
  }
  for (const r of [...SMALLEST, REFERENCE_DESKTOP, REFERENCE_PHONE]) add(r.screen);
  const first = (min: number): number => Math.ceil(min / COARSE_STEP) * COARSE_STEP;
  for (let w = first(COARSE.landscapeMinH); w <= COARSE.maxW; w += COARSE_STEP)
    for (let h = first(COARSE.landscapeMinH); h <= COARSE.maxH && h < w; h += COARSE_STEP)
      if (w > SWEEP_MAX_W || h > SWEEP_MAX_H) add({ w, h });
  for (let w = first(COARSE.portraitMinW); w <= PORTRAIT_MAX.w; w += COARSE_STEP)
    for (let h = first(COARSE.portraitMinH); h <= PORTRAIT_MAX.h; h += COARSE_STEP) add({ w, h });
  for (const s of NAMED_SCREENS) add(s);
  return [...seen.values()].sort((a, b) => a.w - b.w || a.h - b.h);
}

/**
 * Every supported stage, once, sorted by width and then height: the reference stages, the smallest, and each sweep
 * screen's, with its list open and, in the dock layout, collapsed (FR-052). The spacing check (RG6) runs at each; in 3D
 * a pick area's size at one aspect grows with the stage's height, so a check may keep only the smallest stage of each
 * aspect.
 */
export function supportedStages(protect?: Protect): Stage[] {
  if (protect) return [...framedStages(protect).stages];
  const seen = new Map<string, Stage>();
  const add = (s: Stage): void => {
    seen.set(`${s.w}x${s.h}`, { w: s.w, h: s.h });
  };
  for (const r of [REFERENCE_DESKTOP, REFERENCE_PHONE, ...SMALLEST]) add(r.stage);
  for (const screen of sweepScreens()) {
    add(stageFor(screen));
    if (layoutFor(screen) === "dock") add(clearArea(screen, { list: "collapsed" }, DEFAULT_METRICS));
  }
  return [...seen.values()].sort((a, b) => a.w - b.w || a.h - b.h);
}

/** A screen of the sweep, a docked-panel state, and its frame area's stage. */
export interface FramedScreen {
  readonly screen: Screen;
  readonly state: HudState;
  readonly stage: Stage;
}

/** Spec 014's stages for one protector, made once: each sweep screen's frame area (and a dock screen's with its list
 *  collapsed), the reference and smallest screens' first, and the supported stages, once each by size and reserved
 *  boxes, sorted by width, height, then their reserved boxes. */
export interface FramedStages {
  readonly screens: readonly FramedScreen[];
  readonly stages: readonly Stage[];
}

const framedCache = new WeakMap<Protect, FramedStages>();
/** The last few sweeps by their protector's key: a compose of an unchanged scene, as a test's fixtures make many,
 *  reuses its frame areas. */
const keyedCache = new Map<string, FramedStages>();
const KEYED_CACHE_SIZE = 8;

export function framedStages(protect: Protect): FramedStages {
  const known = framedCache.get(protect) ?? (protect.key === undefined ? undefined : keyedCache.get(protect.key));
  if (known) {
    framedCache.set(protect, known);
    return known;
  }
  const screens: FramedScreen[] = [];
  const seen = new Map<string, Stage>();
  const add = (screen: Screen, state: HudState): void => {
    const stage = stageFor(screen, protect, state);
    screens.push({ screen, state, stage });
    const key = `${stage.w}x${stage.h}:${JSON.stringify(stage.reserved ?? [])}`;
    if (!seen.has(key)) seen.set(key, stage);
  };
  for (const r of [REFERENCE_DESKTOP, REFERENCE_PHONE, ...SMALLEST]) add(r.screen, OPENING);
  for (const screen of sweepScreens()) {
    add(screen, OPENING);
    if (layoutFor(screen) === "dock") add(screen, { list: "collapsed" });
  }
  const order = (s: Stage): string => JSON.stringify(s.reserved ?? []);
  const stages = [...seen.values()].sort((a, b) => a.w - b.w || a.h - b.h || (order(a) < order(b) ? -1 : 1));
  const made = { screens, stages };
  framedCache.set(protect, made);
  if (protect.key !== undefined) {
    keyedCache.set(protect.key, made);
    if (keyedCache.size > KEYED_CACHE_SIZE) keyedCache.delete(keyedCache.keys().next().value ?? "");
  }
  return made;
}

/** The walking control's box (spec 008, FR-021; plan.md R-09), in the clear area's bottom-right corner: compose/hud.ts
 *  holds it with the HUD's other places, and RG6 reserves it (its reservedBoxes). */
export { WALK_CONTROL, walkControlBox } from "./hud";

/** The 2D drawing's view box, 320 × 200: room.css keeps its 8:5 shape inside the stage (`.flat`). */
export const FLAT_VIEW = { w: 320, h: 200 } as const;

/** The 2D drawing's scale on a stage, CSS pixels per view-box unit: min(W ÷ 320, H ÷ 200). Since spec 014 the stage is
 *  the drawing's frame area (FR-003; PD-23). */
export function flatScale(stage: Stage): number {
  return Math.min(stage.w / FLAT_VIEW.w, stage.h / FLAT_VIEW.h);
}

/** Where the 2D drawing's view box lies in a frame area, in the window's CSS pixels (spec 014, FR-003; plan.md §2.5):
 *  its top left, at the largest scale that fits the area, centred in it. */
export function flatPlacement(area: Box): { readonly x: number; readonly y: number; readonly scale: number } {
  const scale = flatScale(area);
  return {
    x: area.x + (area.w - FLAT_VIEW.w * scale) / 2,
    y: area.y + (area.h - FLAT_VIEW.h * scale) / 2,
    scale,
  };
}

let supported: readonly Stage[] | null = null;
/** supportedStages(), computed once for the functions below. */
const everyStage = (): readonly Stage[] => (supported ??= supportedStages());

let flatSmallest: Stage | null = null;
/** The supported stage that gives the 2D drawing its smallest scale, the first in supportedStages()'s order (320 × 250:
 *  1, since spec 005; 304 × 196 at 0.95 before). Computed once. */
export function smallestFlatStage(): Stage {
  flatSmallest ??= everyStage().reduce((a, b) => (flatScale(b) < flatScale(a) ? b : a));
  return flatSmallest;
}
