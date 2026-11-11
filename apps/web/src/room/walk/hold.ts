// The walking view's hold (spec 014; FR-030 to FR-033; contracts/frame-area.md §6; plan.md §5, PD-10, PD-11): "Walk
// around" keeps the room's view, level and centred, until the visitor turns, tilts, or zooms, or the figure's box comes
// within 0.5rem of a HUD box or the window's edge; then spec 008's follow camera takes over from an orbit that puts the
// camera where the room's view stands, so a turn continues from it. Pure: the orchestrator (scene/walking.ts) holds the
// state, and the 3D stage measures the figure's box (scene.ts).
import type { Box } from "../compose/hud";
import type { Vec3 } from "../compose/math";
import type { Camera } from "../compose/project";
import type { Orbit } from "./camera";
import type { WalkIntents } from "./input";

/** How near a HUD box or the window's edge the figure's box may come before the follow camera takes over, in rem. */
export const HOLD_MARGIN_REM = 0.5;

/** What ends the hold: a camera intent, or the edge. */
export type HoldCause = "turn" | "tilt" | "zoom" | "edge";

/** Whether the figure's box on the canvas comes within 0.5rem of any HUD box, or of the window's edge (FR-032 (b)):
 *  boxes that only touch the grown margin don't. */
export function nearsEdge(
  figure: Box,
  hud: readonly Box[],
  window: { readonly w: number; readonly h: number },
  rem: number,
): boolean {
  const m = HOLD_MARGIN_REM * rem;
  if (figure.x < m || figure.y < m || figure.x + figure.w > window.w - m || figure.y + figure.h > window.h - m)
    return true;
  return hud.some(
    (b) =>
      figure.x < b.x + b.w + m &&
      b.x - m < figure.x + figure.w &&
      figure.y < b.y + b.h + m &&
      b.y - m < figure.y + figure.h,
  );
}

/** What ends the hold this frame, or null: a turn, a tilt, or a zoom, in that order, then the edge. The figure's
 *  movement keys alone never do (FR-032). */
export function release(intents: Pick<WalkIntents, "turn" | "tilt" | "zoom">, near: boolean): HoldCause | null {
  if (intents.turn !== 0) return "turn";
  if (intents.tilt !== 0) return "tilt";
  if (intents.zoom !== 0) return "zoom";
  return near ? "edge" : null;
}

/** The orbit about a focus that puts the camera where `camera` stands (FR-033): its distance, its pitch above the
 *  focus, and its yaw about it, as walk/camera.ts's orbitPosition reads them. */
export function orbitFrom(camera: Pick<Camera, "position">, focus: Vec3): Orbit {
  const [dx, dy, dz] = [camera.position[0] - focus[0], camera.position[1] - focus[1], camera.position[2] - focus[2]];
  const distance = Math.hypot(dx, dy, dz);
  if (!(distance > 0)) return { yaw: 0, pitch: 0, distance: 0 };
  return { yaw: Math.atan2(dx, dz), pitch: Math.asin(Math.max(-1, Math.min(1, dy / distance))), distance };
}
