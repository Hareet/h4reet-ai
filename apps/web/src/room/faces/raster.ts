// The Canvas2D backend (spec 004; FR-054; R-36, R-37): a face's display list drawn on its canvas, in the 3D chunk
// (scene/faces3d.ts), at the canvas's own size: the list's pixels scaled to it. The neon word's tube is two passes, a
// glow under the stroked tube; a badge is its plate and its word. Nothing is measured: the renderers placed every
// run. A face's canvas is no larger than the face's largest size on screen at the reference stages, at the pixel ratio
// the quality level allows, and its share for the level (FR-054).
import type { QualitySettings } from "../scene/levels";
import { BADGE_COLOURS, TUBE, badgePlate } from "./display-list";
import type { Anchor, DisplayList } from "./display-list";

/** SVG's text-anchor as Canvas2D's textAlign. */
const ALIGN: Readonly<Record<Anchor, CanvasTextAlign>> = { start: "start", middle: "center", end: "end" };

/** A font shorthand for a run: its weight, its size in pixels, and its family list. */
const font = (weight: number, size: number, family: string): string => `${weight} ${size}px ${family}`;

/**
 * Draws a list on a canvas of `width` × `height` pixels through its 2D context. `path` makes a Path2D from path data,
 * the browser's by default.
 */
export function rasterize(
  ctx: CanvasRenderingContext2D,
  list: DisplayList,
  width: number,
  height: number,
  path: (d: string) => Path2D = (d) => new Path2D(d),
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.scale(width / list.size[0], height / list.size[1]);
  for (const op of list.ops) {
    switch (op.op) {
      case "fill":
        ctx.fillStyle = op.color;
        ctx.fillRect(0, 0, list.size[0], list.size[1]);
        break;
      case "rect":
        ctx.fillStyle = op.color;
        ctx.fillRect(op.x, op.y, op.w, op.h);
        break;
      case "text":
        ctx.font = font(op.weight, op.size, op.family);
        ctx.textAlign = ALIGN[op.anchor];
        ctx.textBaseline = "alphabetic";
        if (op.tube === null) {
          ctx.fillStyle = op.color;
          ctx.fillText(op.text, op.x, op.y);
          break;
        }
        // The glow pass, wide and blurred, then the tube over it.
        ctx.save();
        ctx.lineJoin = "round";
        ctx.shadowColor = op.tube;
        ctx.shadowBlur = op.size * TUBE.blur;
        ctx.globalAlpha = TUBE.opacity;
        ctx.lineWidth = op.size * TUBE.glow;
        ctx.strokeStyle = op.tube;
        ctx.strokeText(op.text, op.x, op.y);
        ctx.restore();
        ctx.lineJoin = "round";
        ctx.lineWidth = op.size * TUBE.stroke;
        ctx.strokeStyle = op.color;
        ctx.strokeText(op.text, op.x, op.y);
        break;
      case "path":
        ctx.save();
        ctx.transform(...op.matrix);
        ctx.fillStyle = op.color;
        for (const d of op.paths) ctx.fill(path(d));
        ctx.restore();
        break;
      case "badge": {
        const plate = badgePlate(op);
        ctx.fillStyle = BADGE_COLOURS.plate;
        ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
        ctx.font = font(700, op.size, op.family);
        ctx.textAlign = ALIGN[op.anchor];
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = BADGE_COLOURS.ink;
        ctx.fillText(op.text, op.x, op.y);
        break;
      }
    }
  }
  ctx.restore();
}

/**
 * A face's canvas size (R-37; FR-054): `min(px.w, ceil(screen_css.w × min(dpr, level.pixelRatio) × level.faceScale))`
 * pixels wide, at least 1, and as tall as the face's aspect makes it.
 */
export function faceCanvasSize(
  face: { readonly px: readonly [number, number]; readonly screen_css: readonly [number, number] },
  dpr: number,
  level: Pick<QualitySettings, "pixelRatio" | "faceScale">,
): [number, number] {
  const w = Math.max(
    1,
    Math.min(face.px[0], Math.ceil(face.screen_css[0] * Math.min(dpr, level.pixelRatio) * level.faceScale)),
  );
  return [w, Math.max(1, Math.round((w * face.px[1]) / face.px[0]))];
}
