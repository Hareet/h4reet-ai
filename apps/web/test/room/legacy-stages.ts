// Frozen at e324771ef59f1d715501ee0d3c8485eac0c8f64a (spec 005, T004; plan.md §3.2, PD-8): the supported stages as
// `src/room/compose/stages.ts` gave them before spec 005, copied verbatim from that commit, so FR-054's floor can't
// move with the code. This file is written once and never changed after: test/room/stages-floor.test.ts holds every
// screen of this sweep to a new stage at least this stage, and test/room/legacy-stages.test.ts pins its numbers.

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

/**
 * room.css's stage rules (spec 002, T044): the page in the room (`body.in-room`), the room's grid (`.room`), its
 * landscape layout (`@media (orientation: landscape) and (min-width: 32rem)`), its portrait reserve rule (spec 004,
 * T171 and the review of T171, B1: `@media (orientation: portrait) and (max-width: 34.99rem)`), and the stage
 * (`.room-stage`). The toolbar's type drop below 25rem (R-40) doesn't move the stage.
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
  /** The reserve grows below this width, in portrait: room.css writes the bound as `max-width: 34.99rem`, which a
   *  screen of a whole number of pixels is under exactly when it is under 35rem. */
  reserveMaxWidthRem: 35,
  /** There, `.room-stage`'s `height: calc(100dvh - 23.25rem)`: the portrait reserve and one toolbar row, a 44 px control
   *  and the toolbar's 0.5rem gap (spec 004, FR-065; spec 002's FR-047; R-40; the review of T171, B1). */
  narrowReserveRem: 23.25,
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
 * and the stage takes the rest. Its height is the screen's less the layout's reserve, clamped between 9rem and 40rem;
 * the reserve grows by one toolbar row on a screen held upright (at least as tall as it is wide) and narrower than
 * 35rem, where the toolbar's five controls wrap at 1rem. Scroll bars are left out: a phone's overlay the page, and on a desktop the page stops at 72rem first.
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
  // CSS's orientation: portrait when the viewport is at least as tall as it is wide.
  const narrow = screen.h >= screen.w && screen.w < c.reserveMaxWidthRem * c.rem;
  const reserve = (landscape ? c.landscapeReserveRem : narrow ? c.narrowReserveRem : c.portraitReserveRem) * c.rem;
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
 * taken off its 384 × 832 screen, at a pixel ratio of 2.8125, whose stage is 368 × 368 (≈ 368 × 420 before T171's
 * portrait reserve rule: 384 is under 35rem). Re-measured in the first lookdev run, and set here from that measure in
 * Polish (R-18).
 */
export const REFERENCE_PHONE: ReferenceStage = reference({ w: 384, h: 740 }, 2.8125);

/**
 * The smallest supported stages (R-19, approved with the plan): a 320 × 568 screen in portrait (304 × 196: R-19's
 * 304 × 248 less T171's toolbar row) and the same screen in landscape (304 × 208: the list's column keeps its 15rem, so
 * the stage gets 552 − 8 − 240 px).
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
