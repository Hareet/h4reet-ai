// The room fitted to the window (spec 005; FR-010, FR-011, FR-015; plan.md §4.2, §5, PD-11 to PD-13): pure functions
// the 3D stage and the lookdev page share.
// - The drawing buffer's ratio: the device's pixel ratio, capped by the quality level's and by the level's pixel cap
//   over the canvas's area, never below 0.5. The canvas keeps the window's CSS size; the browser scales a capped buffer
//   up, so nothing is cropped or stretched.
// - The view offset: one camera framed at the clear area's aspect, its projection widened by the canvas's extra pixels
//   on each side at the same scale (three's `setViewOffset` with a negative offset, read from three 0.186.1 at T001),
//   so the room sits in the clear area and the scene continues behind the panels in one perspective.
// - A canvas point moved into the clear area, where the picker's areas are measured (RG6's numbers), or nothing for a
//   point outside it.
// Spec 014 (FR-012, FR-014; contracts/frame-area.md §7; plan.md §2.4): the box these take is the room's frame area, the
// window eased toward the clear area, wherever the room gives one; `canvasToClear` and `clearNdc` keep their names, so
// spec 005's tests read on, and take the frame area as their `clear`.
import type { Box } from "./compose/hud";
import type { Ndc } from "./objects";
import type { QualitySettings } from "./scene/levels";

/** The buffer's least ratio: a huge window stays readable, and the quality controller handles what it costs. */
export const MIN_RATIO = 0.5;

/** The drawing buffer's ratio for a canvas of `w × h` CSS pixels: min(dpr, the level's ratio, √(cap ÷ area)), at least
 *  MIN_RATIO (PD-11). */
export function bufferRatio(
  dpr: number,
  settings: Pick<QualitySettings, "pixelRatio" | "pixelCap">,
  w: number,
  h: number,
): number {
  const area = w * h;
  const capped = area > 0 ? Math.sqrt(settings.pixelCap / area) : Infinity;
  return Math.max(MIN_RATIO, Math.min(dpr > 0 ? dpr : 1, settings.pixelRatio, capped));
}

/** `PerspectiveCamera.setViewOffset`'s six arguments, in its order. */
export interface ViewOffset {
  readonly fullWidth: number;
  readonly fullHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The offset that draws the clear area's frustum widened to the whole canvas (PD-12): the clear area as the full view,
 *  the canvas as the sub-view, offset by the clear area's origin, negated. */
export function viewOffsetFor(clear: Box, canvas: { readonly w: number; readonly h: number }): ViewOffset {
  return { fullWidth: clear.w, fullHeight: clear.h, x: -clear.x, y: -clear.y, width: canvas.w, height: canvas.h };
}

/** Whether the clear area is the whole canvas, so no offset is needed (the stacked layout; a stage of its own). */
export function fillsCanvas(clear: Box, canvas: { readonly w: number; readonly h: number }): boolean {
  return clear.x === 0 && clear.y === 0 && clear.w === canvas.w && clear.h === canvas.h;
}

/** A point of the canvas, in its normalized device coordinates, in the clear area's CSS pixels from its top left; null
 *  outside the clear area, where nothing of the room is picked (PD-13). */
export function canvasToClear(
  ndc: Ndc,
  canvas: { readonly w: number; readonly h: number },
  clear: Box,
): { x: number; y: number } | null {
  const px = ((ndc.x + 1) / 2) * canvas.w - clear.x;
  const py = ((1 - ndc.y) / 2) * canvas.h - clear.y;
  // The edges are the clear area's, within a hair of floating point.
  const e = 1e-9;
  if (px < -e || py < -e || px > clear.w + e || py > clear.h + e) return null;
  return { x: Math.min(clear.w, Math.max(0, px)), y: Math.min(clear.h, Math.max(0, py)) };
}

/** The same point in the clear area's normalized device coordinates, as the picker and the walking view's rays take
 *  it; null outside the clear area. */
export function clearNdc(ndc: Ndc, canvas: { readonly w: number; readonly h: number }, clear: Box): Ndc | null {
  const p = canvasToClear(ndc, canvas, clear);
  if (!p || clear.w <= 0 || clear.h <= 0) return null;
  return { x: (p.x / clear.w) * 2 - 1, y: -((p.y / clear.h) * 2 - 1) };
}
