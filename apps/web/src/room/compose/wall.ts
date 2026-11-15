// The wall box (spec 028; FR-005; Q3; plan.md §R-A1): the rectangle the room's shell shows on screen, which the split
// layout's panel and column stand beside. It is the near face of the shell's frame box, the placement mounted on
// nothing (as compose/floor.ts finds it, so no ID is written in code: spec 002's FR-007), projected at the room's
// framing for a frame area by the kernel's own camera (compose/framing.ts, compose/project.ts), in the window's CSS
// pixels. Pure: no DOM, no three.js; the room (through its frame-area protector, compose/protect.ts) and the compositor
// (compose/stages.ts) take the same function, so the room the visitor sees is framed where the checks judged it.
import { framing } from "./framing";
import type { Box as WorldBox } from "./framing";
import type { Box } from "./hud";
import { projector, toStage } from "./project";

/** What the wall box is computed from: the shell's frame box and every framed placement's, in world metres. */
export interface WallScene {
  readonly shell: WorldBox;
  readonly framed: readonly WorldBox[];
}

/** The wall scene of a composed 3D part: the shell, its one placement mounted on nothing, and the framed boxes; null
 *  where the part has no such placement or more than one. */
export function wallSceneOf(part: {
  readonly placements: readonly { readonly mount: unknown; readonly framed: boolean; readonly frame_box: WorldBox }[];
}): WallScene | null {
  const roots = part.placements.filter((p) => p.mount === null);
  const root = roots[0];
  if (!root || roots.length !== 1) return null;
  return { shell: root.frame_box, framed: part.placements.filter((p) => p.framed).map((p) => p.frame_box) };
}

/** A number on the bundle's grid of 1e-6, −0 written as 0. */
const m6 = (n: number): number => {
  const q = Math.round(n * 1e6) / 1e6;
  return q === 0 ? 0 : q;
};
const onGrid = (b: WorldBox): WorldBox => ({
  min: [m6(b.min[0]), m6(b.min[1]), m6(b.min[2])],
  max: [m6(b.max[0]), m6(b.max[1]), m6(b.max[2])],
});

const finite = (b: Box): boolean =>
  Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h);

/** The wall box for a frame area, in the window's pixels: the shell's near face's corners projected at the framing for
 *  the area's aspect, offset by the area's place. Null for an area without a size or that isn't finite. */
export function wallBox(scene: WallScene, area: Box): Box | null {
  if (!finite(area) || !(area.w > 0) || !(area.h > 0)) return null;
  const aspect = area.w / area.h;
  // On the bundle's grid (metres to 1e-6, build/room/emit.ts's m6): the compositor measures its boxes in float32, the
  // bundle carries them quantized, and the split layout's boxes follow the wall box continuously, so both take the
  // same numbers and the room is framed exactly where the checks judged it (spec 014's FR-016).
  const view = projector(framing(aspect, scene.framed.map(onGrid)), aspect);
  const stage = { w: area.w, h: area.h };
  const { min, max } = onGrid(scene.shell);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]]) {
      const [px, py] = toStage(view.project([x, y, max[2]]), stage);
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
  const out = { x: area.x + x0, y: area.y + y0, w: x1 - x0, h: y1 - y0 };
  return finite(out) ? out : null;
}
