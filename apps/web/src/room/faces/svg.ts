// The attribute-only SVG backend (spec 004; FR-058; R-36): a face's display list as SVG element descriptors, in the
// face's own pixels, which the 2D room (flat.ts) builds through T103's allowlist, so no element, attribute, or value off
// it ever reaches the page: no style, no link, no image, no event handler, and words as text, never markup. It lives in
// the entry chunk with the 2D room, and draws what raster.ts draws: the same runs at the same places and anchors, the
// same rectangles, and the same paths. The neon word's tube is two runs, its glow pass first, wide and at an opacity,
// then the tube, each its letters' outlines stroked, unfilled; a badge is its plate and its word.
import { BADGE_COLOURS, TUBE, badgePlate } from "./display-list";
import type { DisplayList } from "./display-list";

/** One SVG element as data: its tag, its attributes, and its text or its children. */
export interface SvgNode {
  readonly tag: "g" | "rect" | "text" | "path";
  readonly attrs: Readonly<Record<string, string | number | readonly number[]>>;
  readonly text?: string;
  readonly children?: readonly SvgNode[];
}

/** A list's drawing: one group in the face's pixels, its operations in order. */
export function faceSvg(list: DisplayList): SvgNode {
  const children: SvgNode[] = [];
  for (const op of list.ops) {
    switch (op.op) {
      case "fill":
        children.push({
          tag: "rect",
          attrs: { x: 0, y: 0, width: list.size[0], height: list.size[1], fill: op.color },
        });
        break;
      case "rect":
        children.push({ tag: "rect", attrs: { x: op.x, y: op.y, width: op.w, height: op.h, fill: op.color } });
        break;
      case "text": {
        const type = {
          x: op.x,
          y: op.y,
          "font-family": op.family,
          "font-size": op.size,
          "font-weight": op.weight,
          "text-anchor": op.anchor,
        };
        if (op.tube !== null) {
          children.push({
            tag: "text",
            attrs: {
              ...type,
              fill: "none",
              stroke: op.tube,
              "stroke-width": op.size * TUBE.glow,
              opacity: TUBE.opacity,
            },
            text: op.text,
          });
          children.push({
            tag: "text",
            attrs: { ...type, fill: "none", stroke: op.color, "stroke-width": op.size * TUBE.stroke },
            text: op.text,
          });
        } else children.push({ tag: "text", attrs: { ...type, fill: op.color }, text: op.text });
        break;
      }
      case "path":
        children.push({
          tag: "g",
          attrs: { transform: [...op.matrix] },
          children: op.paths.map((d) => ({ tag: "path", attrs: { d, fill: op.color } })),
        });
        break;
      case "badge": {
        const plate = badgePlate(op);
        children.push({
          tag: "rect",
          attrs: { x: plate.x, y: plate.y, width: plate.w, height: plate.h, fill: BADGE_COLOURS.plate },
        });
        children.push({
          tag: "text",
          attrs: {
            x: op.x,
            y: op.y,
            "font-family": op.family,
            "font-size": op.size,
            "font-weight": 700,
            "text-anchor": op.anchor,
            fill: BADGE_COLOURS.ink,
          },
          text: op.text,
        });
        break;
      }
    }
  }
  return { tag: "g", attrs: {}, children };
}
