// The frame area (spec 014; FR-004, FR-009 to FR-013, FR-016; D5, D6; contracts/frame-area.md §2, §4; plan.md §2.1,
// PD-1): the box the room is framed into, one kernel function the room and the compositor share, so the room the
// visitor sees is framed exactly where spec 004's checks judged it. It tries the window first, and eases each edge
// toward spec 005's clear area in sixteenths, taking the first step at which every protected box (`Protect`, built by
// compose/protect.ts) lies at least 0.5rem outside every compact box (compose/hud.ts's compactBoxes). At the last step
// the area is the clear area, spec 005's frame, which its own checks already judged, so a frame always exists and the
// room is never smaller than under spec 005. A protector that throws or gives a box that isn't finite falls back to the
// clear area at once, and the room logs it in a drafts build. Pure: no DOM, no three.js, no clock; the same inputs give
// the same result in Node and the browser.
import { compactBoxes, hudBoxes } from "./hud";
import type { Box, HudMetrics, HudState } from "./hud";
import type { Rect } from "./pick";

/** The ease's steps: sixteenths, so a re-fit makes at most 17 framings (FR-013; D5). */
export const EASE_STEPS = 16;
/** The protected boxes' margin from every compact box, in rem (D6). */
export const MARGIN_REM = 0.5;

/** What the frame area protects (contracts/frame-area.md §2): the protected boxes on the canvas, in CSS pixels from the
 *  window's top left, when the room is framed into `area` with the production framing at its aspect; `clear` is spec
 *  005's clear area at the same window, where a selectable's being pressable is judged. Null where a selectable
 *  pressable at spec 005's frame would be left to the list at the area's framing (spec 005's FR-057, this spec's
 *  FR-061): no box can say that, so the step is refused whatever the HUD's boxes are. */
export interface Protect {
  boxes(area: Box, clear: Box): readonly Box[] | null;
  /** What the protector protects, as text, where two protectors over the same scene give the same boxes: the stages'
   *  cache keys on it, so a compose of an unchanged scene doesn't sweep its frame areas again. */
  readonly key?: string;
}

export interface FrameArea {
  /** The box the room is framed into. */
  readonly area: Box;
  /** k ÷ 16, k from 0 (the window) to 16 (the clear area). */
  readonly ease: number;
  /** True when §4's fallback chose the clear area. */
  readonly fellBack: boolean;
}

/** The area at ease t: each edge the share t of the way from the window's to the clear area's (FR-009). */
export function areaAt(t: number, screen: { readonly w: number; readonly h: number }, clear: Box): Box {
  return {
    x: t * clear.x,
    y: t * clear.y,
    w: screen.w + t * (clear.w - screen.w),
    h: screen.h + t * (clear.h - screen.h),
  };
}

const finite = (b: Box): boolean =>
  Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h);

/** Whether two boxes share some area once `b` is grown by `m` on each side; boxes that only touch don't. */
const near = (a: Box, b: Box, m: number): boolean =>
  a.x < b.x + b.w + m && b.x - m < a.x + a.w && a.y < b.y + b.h + m && b.y - m < a.y + a.h;

/**
 * The frame area for a window, a docked-panel state, and the metrics (contracts/frame-area.md §2): the least ease, in
 * sixteenths, at which every protected box lies at least 0.5rem outside every compact box, or the clear area at the
 * last step. It never throws: a protector that does, or a box that isn't finite, gives the clear area, `fellBack`.
 */
export function frameArea(
  screen: { readonly w: number; readonly h: number },
  state: HudState,
  metrics: HudMetrics,
  protect: Protect,
): FrameArea {
  const clear = hudBoxes(screen, state, metrics).clear;
  const fallback: FrameArea = { area: clear, ease: 1, fellBack: true };
  try {
    if (!finite(clear) || !(screen.w > 0) || !(screen.h > 0)) return fallback;
    const hud = compactBoxes(screen, state, metrics).all;
    const margin = MARGIN_REM * metrics.rem;
    for (let k = 0; k < EASE_STEPS; k += 1) {
      const area = areaAt(k / EASE_STEPS, screen, clear);
      const boxes = protect.boxes(area, clear);
      if (boxes === null) continue;
      if (!boxes.every(finite)) return fallback;
      if (boxes.every((p) => hud.every((h) => !near(p, h, margin))))
        return { area, ease: k / EASE_STEPS, fellBack: false };
    }
    return { area: clear, ease: 1, fellBack: false };
  } catch {
    return fallback;
  }
}

/** The compact boxes that overlap a frame area, each translated into the area's pixels and clipped to it: the stage's
 *  reserved boxes, which RG6 and the room's picker reserve (FR-060; contracts/frame-area.md §5). */
export function reservedIn(area: Box, hud: readonly Box[]): Rect[] {
  const out: Rect[] = [];
  for (const b of hud) {
    const x0 = Math.max(b.x, area.x);
    const y0 = Math.max(b.y, area.y);
    const x1 = Math.min(b.x + b.w, area.x + area.w);
    const y1 = Math.min(b.y + b.h, area.y + area.h);
    if (x1 > x0 && y1 > y0) out.push([x0 - area.x, y0 - area.y, x1 - x0, y1 - y0]);
  }
  return out;
}
