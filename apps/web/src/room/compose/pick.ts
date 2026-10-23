// Pick areas (spec 004; FR-064, SC-009; R-19, R-20; data-model.md §4.5; contracts/room-data-files.md §5.5, RG6): one
// function for the compositor's spacing check and the room's pointer, in 3D and in 2D, so the build measures exactly
// what the visitor can hit. Each selectable's members are rectangles with depths: in 3D, their frame boxes projected at
// the camera's framing into the stage's CSS pixels; in 2D, the drawing's hit rectangles in view-box units. A
// selectable's area is the union of its members' rectangles with an exclusive core centred on that union, 44 × 44 CSS
// pixels, or in 2D 44 px in view-box units at the drawing's scale. A pick goes to the frontmost member rectangle under
// the point; else, among the selectables whose union or core holds the point, to the one whose union is nearest, ties
// going to scene order (FR-064: "the nearest selectable whose pick area contains the point"); else to none.
import type { Box } from "./framing";
import { projector, toStage } from "./project";
import type { Camera } from "./project";
import { flatScale } from "./stages";
import type { Stage } from "./stages";

/** A rectangle from its top left, y down: CSS pixels on a stage, or view-box units in the 2D drawing. */
export type Rect = readonly [x: number, y: number, w: number, h: number];

export interface MemberRect {
  readonly rect: Rect;
  /** How far in front of the camera its nearest point is: the smaller, the further forward. */
  readonly depth: number;
}

export interface PickInput {
  readonly id: string;
  readonly members: readonly MemberRect[];
}

export interface PickArea extends PickInput {
  /** The bounds of the members' rectangles; null without one. */
  readonly union: Rect | null;
  /** The exclusive core, centred on the union. */
  readonly core: Rect | null;
}

/** A hit area's and an exclusive core's side, in CSS pixels (FR-064). */
export const CORE_PX = 44;

/** A problem the spacing check (RG6) refuses at a stage. */
export interface PickProblem {
  readonly selectable: string;
  /** The core leaves the stage, so less than 44 × 44 of it shows; or it overlaps another's core, or another's member. */
  readonly problem: "outside" | "core" | "member";
  readonly other: string | null;
}

export function unionOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y, w, h] of rects) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w);
    y1 = Math.max(y1, y + h);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

/** Each selectable's union and core, in the order given, which is the scene's. */
export function pickAreas(selectables: readonly PickInput[], core: number = CORE_PX): PickArea[] {
  return selectables.map(({ id, members }) => {
    const union = unionOf(members.map((m) => m.rect));
    const centred: Rect | null = union
      ? [union[0] + union[2] / 2 - core / 2, union[1] + union[3] / 2 - core / 2, core, core]
      : null;
    return { id, members, union, core: centred };
  });
}

const contains = (r: Rect, [px, py]: readonly [number, number]): boolean =>
  px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3];

/** How far a point is from a rectangle: 0 inside it. */
const distance = (r: Rect, [px, py]: readonly [number, number]): number =>
  Math.hypot(Math.max(r[0] - px, 0, px - (r[0] + r[2])), Math.max(r[1] - py, 0, py - (r[1] + r[3])));

/** Two rectangles that share some area; touching edges don't. */
const overlaps = (a: Rect, b: Rect): boolean =>
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

const inside = (inner: Rect, outer: Rect): boolean =>
  inner[0] >= outer[0] &&
  inner[1] >= outer[1] &&
  inner[0] + inner[2] <= outer[0] + outer[2] &&
  inner[1] + inner[3] <= outer[1] + outer[3];

/** The selectable a pointer at this point picks, or null. */
export function pick(areas: readonly PickArea[], point: readonly [number, number]): string | null {
  let front: { id: string; depth: number } | null = null;
  for (const area of areas) {
    for (const m of area.members) {
      if (contains(m.rect, point) && (front === null || m.depth < front.depth)) front = { id: area.id, depth: m.depth };
    }
  }
  if (front) return front.id;
  let nearest: { id: string; distance: number } | null = null;
  for (const area of areas) {
    if (!area.union || !area.core) continue;
    if (!contains(area.union, point) && !contains(area.core, point)) continue;
    const d = distance(area.union, point);
    if (nearest === null || d < nearest.distance) nearest = { id: area.id, distance: d };
  }
  return nearest ? nearest.id : null;
}

/** A frame box's rectangle on a stage in 3D: its projected corners' bounds; null when a corner isn't before the camera. */
export function memberRect(box: Box, camera: Camera, stage: Stage): MemberRect | null {
  const view = projector(camera, stage.w / stage.h);
  let [x0, y0, x1, y1, depth] = [Infinity, Infinity, -Infinity, -Infinity, Infinity];
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const d = view.depth([x, y, z]);
        if (!(d > camera.near)) return null;
        depth = Math.min(depth, d);
        const [px, py] = toStage(view.project([x, y, z]), stage);
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
      }
    }
  }
  return { rect: [x0, y0, x1 - x0, y1 - y0], depth };
}

/** The core's side in the 2D drawing's view-box units on a stage: 44 px at the drawing's scale, min(W ÷ 320, H ÷ 200). */
export function flatCore(stage: Stage): number {
  return CORE_PX / flatScale(stage);
}

/**
 * What the spacing check (RG6) refuses, selectable by selectable in scene order: a core that leaves the view (the
 * stage, or the drawing's view box); a core over another selectable's core; a core over another's member rectangle.
 */
export function pickProblems(areas: readonly PickArea[], view: Rect): PickProblem[] {
  const out: PickProblem[] = [];
  for (const area of areas) {
    const core = area.core;
    if (!core || !inside(core, view)) out.push({ selectable: area.id, problem: "outside", other: null });
    if (!core) continue;
    for (const other of areas) {
      if (other !== area && other.core && overlaps(core, other.core))
        out.push({ selectable: area.id, problem: "core", other: other.id });
    }
    for (const other of areas) {
      if (other !== area && other.members.some((m) => overlaps(core, m.rect)))
        out.push({ selectable: area.id, problem: "member", other: other.id });
    }
  }
  return out;
}
