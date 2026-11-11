// Legibility (spec 004; FR-052, FR-054, SC-010; R-21; contracts/room-data-files.md RG7; Clarifications: cap height): a
// face's smallest glyph in CSS pixels, the measure the compositor's report prints and RG7 holds to the floor, and the
// one the lookdev page shows. A region's cap height on its face is the typeface's cap ratio (the minimum, over A to Z
// and 0 to 9, of a glyph's top over the font's em, which the compositor reads with fontkit and the index carries)
// times the glyph size its fixed grid gives, or, for a sign's traced lettering, the outline's `cap_height` over its
// fitted view box. That height, stood on the face along its `up` at each corner of the region, is projected through
// the kernel's camera at the production framing on a stage, and the smallest is the face's.
import { fitOutline, regionBox, textGrid } from "./layout";
import type { Grid, OutlineShape, RegionRect } from "./layout";
import { add, cross, normalize, scale, transformPoint } from "./math";
import type { Mat4, Vec3 } from "./math";
import { projector, toStage } from "./project";
import type { Camera } from "./project";
import type { Stage } from "./stages";
import type { Renderer, TypefaceUse } from "./vocabulary";

/** A live face in its piece's frame at scale 1 (FR-017): its centre, size, normal, and up, a unit vector across it. */
export interface FaceGeometry {
  readonly at: Vec3;
  readonly size: readonly [number, number];
  readonly facing: Vec3;
  readonly up: Vec3;
}

/** Where a region's words come from (contracts/room-bundle.md §3.1's region `source`). */
export type RegionSourceRef =
  | { readonly room_text: string }
  | { readonly resume_titles: true }
  | { readonly ui: readonly string[] }
  | { readonly signal: "turn-cost"; readonly part: "call" | "visit" };

/** What a region's cap height comes from: its typeface's cap ratio, or its outline. */
export type CapSource =
  { readonly capRatio: number } | { readonly outline: OutlineShape & { readonly cap_height: number } };

export interface CapRegion {
  readonly rect: RegionRect;
  /** The cap height on the face, in its units at scale 1. */
  readonly cap: number;
}

/** The typeface a region draws with: the neon sign's word in `neon` and its counters in `counters`; a sign none. */
export function typefaceFor(renderer: Renderer, source: RegionSourceRef): TypefaceUse | null {
  switch (renderer) {
    case "sign":
    case "print":
      return null;
    case "neon":
      return "signal" in source ? "counters" : "neon";
    default:
      return renderer;
  }
}

/** The face's right, as its viewer sees it: up × facing. */
function rightOf(face: FaceGeometry): Vec3 {
  return normalize(cross(face.up, face.facing));
}

/** A point of a face, (u, v) in fractions from its top left as its texture coordinates run, in the piece's frame. */
export function facePoint(face: FaceGeometry, u: number, v: number): Vec3 {
  const right = rightOf(face);
  const up = normalize(face.up);
  return add(add(face.at, scale(right, (u - 0.5) * face.size[0])), scale(up, (0.5 - v) * face.size[1]));
}

/** A region's cap height on its face, in the face's units at scale 1; null when its grid isn't its renderer's. */
export function regionCap(
  face: FaceGeometry,
  region: { readonly rect: RegionRect; readonly renderer: Renderer; readonly grid: Grid | null },
  source: CapSource,
): number | null {
  const box = regionBox(region.rect, face.size);
  if ("outline" in source) {
    return region.renderer === "sign" || region.renderer === "print"
      ? source.outline.cap_height * fitOutline(source.outline, box).scale
      : null;
  }
  const grid = textGrid(region.renderer, region.grid, box);
  return grid ? source.capRatio * grid.em : null;
}

/**
 * A face's smallest cap height in CSS pixels on a stage: from each corner of each region, a segment of its cap height
 * along the face's up, into the region, through the piece's model transform (its stylized scale included) and the
 * camera at the stage's aspect. Null for a face with no region, and where a point it measures is at or behind the
 * camera's near plane, whose projection is no length on screen, as pick.ts's `memberRect` refuses such a box.
 */
export function smallestCapPx(
  model: Mat4,
  face: FaceGeometry,
  regions: readonly CapRegion[],
  camera: Camera,
  stage: Stage,
): number | null {
  if (regions.length === 0) return null;
  const view = projector(camera, stage.w / stage.h);
  const up = normalize(face.up);
  /** A point of the face on the stage, or null at or behind the near plane. */
  const css = (p: Vec3): readonly [number, number] | null => {
    const world = transformPoint(model, p);
    return view.depth(world) > camera.near ? toStage(view.project(world), stage) : null;
  };
  let smallest = Infinity;
  for (const { rect, cap } of regions) {
    const [x, y, w, h] = rect;
    const corners: readonly (readonly [number, number, number])[] = [
      [x, y, -1],
      [x + w, y, -1],
      [x, y + h, 1],
      [x + w, y + h, 1],
    ];
    for (const [u, v, inward] of corners) {
      const corner = facePoint(face, u, v);
      const [a, b] = [css(corner), css(add(corner, scale(up, inward * cap)))];
      if (a === null || b === null) return null;
      smallest = Math.min(smallest, Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
  }
  return smallest;
}
