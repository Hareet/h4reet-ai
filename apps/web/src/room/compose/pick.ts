// Pick areas (spec 004; FR-064, SC-009; R-19, R-20; data-model.md §4.5; contracts/room-data-files.md §5.5, RG6): one
// function for the compositor's spacing check and the room's pointer, in 3D and in 2D, so the build measures exactly
// what the visitor can hit. Each selectable's members are rectangles with depths: in 3D, their frame boxes projected at
// the camera's framing into the stage's CSS pixels; in 2D, the drawing's hit rectangles in view-box units. A
// selectable's area is the union of its members' rectangles with an exclusive core centred on that union, 44 × 44 CSS
// pixels, or in 2D 44 px in view-box units at the drawing's scale. A pick goes to the frontmost member rectangle under
// the point; else, among the selectables whose union or core holds the point, to the one whose union is nearest, ties
// going to scene order (FR-064: "the nearest selectable whose pick area contains the point"); else to none. A
// selectable the stage leaves to the "In the room" list (`listOnly`, FR-064's carve-out) is held: it has no area there.
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
  /** The core leaves the stage, so less than 44 × 44 of it shows; or it overlaps another's core, or another's member;
   *  or, meeting none of its members, another's union, where `pick` sends a point that misses every member. */
  readonly problem: "outside" | "core" | "member" | "union";
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

const NONE: ReadonlySet<string> = new Set();

/** The selectable a pointer at this point picks, or null. A held selectable (`listOnly`) has no area: a point whose
 *  frontmost member rectangle is one of its members picks nothing (FR-064's carve-out; Reading R3, whose default the
 *  Author accepted on 2026-10-26), and its union and core hold no point. */
export function pick(
  areas: readonly PickArea[],
  point: readonly [number, number],
  held: ReadonlySet<string> = NONE,
): string | null {
  let front: { id: string; depth: number } | null = null;
  for (const area of areas) {
    for (const m of area.members) {
      if (contains(m.rect, point) && (front === null || m.depth < front.depth)) front = { id: area.id, depth: m.depth };
    }
  }
  if (front) return held.has(front.id) ? null : front.id;
  let nearest: { id: string; distance: number } | null = null;
  for (const area of areas) {
    if (!area.union || !area.core || held.has(area.id)) continue;
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
 * stage, or the drawing's view box); a core over another selectable's core; a core over another's member rectangle;
 * and a core over another's union that meets none of its members, since `pick` sends a point that misses every member
 * to the nearest union holding it, so the gap between another's members is that other's to pick. So each core is
 * exclusive: no point of it picks another selectable. A held selectable (`listOnly`) has no area, so it is no
 * problem's subject, and no core and no union to be met; its members still are, since a point on one picks nothing.
 */
export function pickProblems(areas: readonly PickArea[], view: Rect, held: ReadonlySet<string> = NONE): PickProblem[] {
  const out: PickProblem[] = [];
  for (const area of areas) {
    if (held.has(area.id)) continue;
    const core = area.core;
    if (!core || !inside(core, view)) out.push({ selectable: area.id, problem: "outside", other: null });
    if (!core) continue;
    for (const other of areas) {
      if (other !== area && !held.has(other.id) && other.core && overlaps(core, other.core))
        out.push({ selectable: area.id, problem: "core", other: other.id });
    }
    for (const other of areas) {
      if (other !== area && other.members.some((m) => overlaps(core, m.rect)))
        out.push({ selectable: area.id, problem: "member", other: other.id });
    }
    for (const other of areas) {
      if (other === area || held.has(other.id) || !other.union || !overlaps(core, other.union)) continue;
      if (!other.members.some((m) => overlaps(core, m.rect)))
        out.push({ selectable: area.id, problem: "union", other: other.id });
    }
  }
  return out;
}

/**
 * FR-064's carve-out, the one function that holds it (spec.md, FR-064, as T302's answer amended it; data-model.md
 * §4.5): at any stage, a side-wall selectable that can't keep its exclusive core there is list-only there: the room
 * draws no pick area for it, a pick whose frontmost member is one of its members selects nothing (`pick`; Reading R3),
 * and the "In the room" list reaches it. Wherever its core fits, it is picked as any selectable is: a side-wall
 * selectable short of its core only for another held one's core keeps its pick area, the first in scene order, so two
 * boards whose cores overlap only each other's keep one tap between them (the release pass, below). The compositor
 * refuses no side-wall selectable for a missing core, but still refuses another selectable's core over its members
 * (RG6). `areas` are the stage's, in 3D on the stage or in 2D in the drawing's view box, `view` the stage's or the view
 * box's rectangle, and `sideWall` the IDs the index flags `side_wall`. Gives the IDs held, for `pick` and
 * `pickProblems`; deterministic, since the pass goes in scene order.
 */
export function listOnly(areas: readonly PickArea[], view: Rect, sideWall: ReadonlySet<string>): ReadonlySet<string> {
  if (sideWall.size === 0) return NONE;
  const short = new Set(pickProblems(areas, view).map((p) => p.selectable));
  const held = new Set(areas.filter((a) => sideWall.has(a.id) && short.has(a.id)).map((a) => a.id));
  // The release pass, in scene order: a held selectable keeps its pick area after all where releasing it alone gives
  // no problem with it as subject and none that wasn't there before. So of two side-wall selectables whose cores meet
  // only each other's core, the first keeps its tap, and the list reaches the other.
  const key = (p: PickProblem): string => `${p.selectable}\n${p.problem}\n${p.other ?? ""}`;
  for (const area of areas) {
    if (!held.has(area.id)) continue;
    const before = new Set(pickProblems(areas, view, held).map(key));
    const rest = new Set(held);
    rest.delete(area.id);
    if (pickProblems(areas, view, rest).every((p) => p.selectable !== area.id && before.has(key(p))))
      held.delete(area.id);
  }
  return held;
}
