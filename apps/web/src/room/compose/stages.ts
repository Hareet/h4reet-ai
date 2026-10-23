// The supported stages, as code (spec 004; FR-009, FR-052, FR-054, FR-064; R-18, R-19; contracts/room-data-files.md
// §13.3): spec 002's six framing aspects, the two reference stages, the two smallest stages, and a sweep of screens,
// each stage computed from its screen by room.css's own formulas. `test/room/stages.test.ts` pins these constants to
// room.css's rules, so a data edit can't weaken the checks that run here (RG5 to RG7), and a change to the layout's CSS
// fails the test until this file follows it. Sizes are CSS pixels.

/** A screen: the browser's viewport, in CSS pixels. */
export interface Screen {
  readonly w: number;
  readonly h: number;
}

/** The room's stage: the box the 3D canvas or the 2D drawing fills, in CSS pixels. */
export interface Stage {
  readonly w: number;
  readonly h: number;
}

/** Spec 002's six framing aspects, width over height, from a 320-pixel phone in portrait to a wide desktop (FR-009). */
export const ASPECTS = [0.45, 0.6, 0.8, 1.15, 1.5, 2.4] as const;

/**
 * room.css's stage rules (spec 002, T044): the page in the room (`body.in-room`), the room's grid (`.room`), its
 * landscape layout (`@media (orientation: landscape) and (min-width: 32rem)`), and the stage (`.room-stage`).
 */
export const ROOM_CSS = {
  /** The root font size every rem is counted in: the browser's default. */
  rem: 16,
  /** `body.in-room`: `max-width: 72rem` on its content box, and `padding: 0.5rem`. */
  bodyMaxWidthRem: 72,
  bodyPaddingRem: 0.5,
  /** `.room`'s `gap: 0.5rem` between its columns. */
  gapRem: 0.5,
  /** The two-column layout's media query: landscape, and at least this wide. */
  landscapeMinWidthRem: 32,
  /** `.room-stage`'s `height: calc(100dvh - 20rem)`, in portrait. */
  portraitReserveRem: 20,
  /** Its `height: calc(100dvh - 7rem)`, in landscape. */
  landscapeReserveRem: 7,
  /** Its `min-height: 9rem` and `max-height: 40rem`. */
  stageMinHeightRem: 9,
  stageMaxHeightRem: 40,
  /** Landscape's `grid-template-columns: minmax(0, 3fr) minmax(15rem, 2fr)`: the stage beside the list. */
  stageFr: 3,
  listFr: 2,
  listMinRem: 15,
} as const;

/**
 * The stage for a screen, by room.css's formulas. In portrait (a screen at least as tall as it is wide, or narrower
 * than 32rem) the stage fills the page's width less its padding; in landscape it takes the grid's first column, three
 * parts of five after the gap, unless the list's two parts would fall under its 15rem minimum, when the list keeps 15rem
 * and the stage takes the rest. Its height is the screen's less the layout's reserve, clamped between 9rem and 40rem.
 * Scroll bars are left out: a phone's overlay the page, and on a desktop the page stops at 72rem first.
 */
export function stageFor(screen: Screen): Stage {
  const c = ROOM_CSS;
  const content = Math.min(c.bodyMaxWidthRem * c.rem, screen.w - 2 * c.bodyPaddingRem * c.rem);
  // CSS's orientation: landscape when the viewport is wider than it is tall.
  const landscape = screen.w > screen.h && screen.w >= c.landscapeMinWidthRem * c.rem;
  let w = content;
  if (landscape) {
    const space = content - c.gapRem * c.rem;
    const fr = space / (c.stageFr + c.listFr);
    w =
      c.listFr * fr < c.listMinRem * c.rem
        ? space - c.listMinRem * c.rem
        : (space * c.stageFr) / (c.stageFr + c.listFr);
  }
  const reserve = (landscape ? c.landscapeReserveRem : c.portraitReserveRem) * c.rem;
  const h = Math.max(c.stageMinHeightRem * c.rem, Math.min(c.stageMaxHeightRem * c.rem, screen.h - reserve));
  return { w, h };
}

/** A screen and the stage room.css gives it. */
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
 * The reference desktop (spec 002's FR-048): a 1920 × 1200 window at a pixel ratio of 1, whose stage is ≈ 686 × 640.
 * Re-measured in the first lookdev run (R-18).
 */
export const REFERENCE_DESKTOP: ReferenceStage = reference({ w: 1920, h: 1200 }, 1);

/**
 * The reference phone (ADR 0010's Galaxy A54 class): a 384 × 740 CSS-pixel viewport in portrait, the browser's bars
 * taken off its 384 × 832 screen, at a pixel ratio of 2.8125, whose stage is ≈ 368 × 420. Re-measured in the first
 * lookdev run, and set here from that measure in Polish (R-18).
 */
export const REFERENCE_PHONE: ReferenceStage = reference({ w: 384, h: 740 }, 2.8125);

/**
 * The smallest supported stages (R-19, approved with the plan): a 320 × 568 screen in portrait (304 × 248) and the same
 * screen in landscape (304 × 208: the list's column keeps its 15rem, so the stage gets 552 − 8 − 240 px).
 */
export const SMALLEST: readonly ScreenStage[] = [
  { screen: { w: 320, h: 568 }, stage: stageFor({ w: 320, h: 568 }) },
  { screen: { w: 568, h: 320 }, stage: stageFor({ w: 568, h: 320 }) },
];

/** The sweep's step between screens, in CSS pixels. */
export const SWEEP_STEP = 16;

const SWEEP_MIN = 320;
const SWEEP_MAX_W = 1920;
const SWEEP_MAX_H = 1200;
/** The smallest screen's long side: 568, its height in portrait and its width in landscape. */
const LONG_MIN = 568;

/**
 * The sweep of screens from 320 × 568 to 1920 × 1200 (R-19): every screen in SWEEP_STEP steps from 320 to 1920 wide
 * and 320 to 1200 tall that is at least the smallest screen in its orientation (portrait at least 568 tall, landscape
 * at least 568 wide), with the smallest and the reference screens, once each, sorted by width and then height.
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
  return [...seen.values()].sort((a, b) => a.w - b.w || a.h - b.h);
}

/**
 * Every supported stage, once, sorted by width and then height: the reference stages, the smallest, and the sweep's.
 * The spacing check (RG6) runs at each; in 3D a pick area's size at one aspect grows with the stage's height, so a
 * check may keep only the smallest stage of each aspect.
 */
export function supportedStages(): Stage[] {
  const seen = new Map<string, Stage>();
  for (const r of [REFERENCE_DESKTOP, REFERENCE_PHONE, ...SMALLEST]) seen.set(`${r.stage.w}x${r.stage.h}`, r.stage);
  for (const screen of sweepScreens()) {
    const s = stageFor(screen);
    seen.set(`${s.w}x${s.h}`, s);
  }
  return [...seen.values()].sort((a, b) => a.w - b.w || a.h - b.h);
}

/** The 2D drawing's view box, 320 × 200: room.css keeps its 8:5 shape inside the stage (`.flat`). */
export const FLAT_VIEW = { w: 320, h: 200 } as const;

/** The 2D drawing's scale on a stage, CSS pixels per view-box unit: min(W ÷ 320, H ÷ 200). */
export function flatScale(stage: Stage): number {
  return Math.min(stage.w / FLAT_VIEW.w, stage.h / FLAT_VIEW.h);
}
