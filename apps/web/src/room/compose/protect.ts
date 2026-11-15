// The frame area's protector (spec 014; FR-010, FR-016; D6; contracts/frame-area.md §2, §5; plan.md §2.2, PD-2,
// PD-23): what must never lie under a HUD box at the room's view. For an area, it frames the scene at the area's aspect
// with spec 004's framing (`framing.ts`), measures the selectables' pick areas there with `pick.ts`, as RG6 does, and
// gives each selectable that is pressable at spec 005's frame its 44 × 44 exclusive core, and each figure's framed box
// projected by `project.ts`, translated into the window's pixels. "Pressable at spec 005's frame" is RG6's: a
// selectable with a core that FR-064's carve-out doesn't leave to the list at the clear area, the walking control's box
// reserved there; it is measured once per clear area and kept while the frame area's steps reuse it. The compositor
// builds its input from the composed scene (build/room/checks/rg.ts), and the room from the bundle (`protectSceneOf`),
// so both protect the same boxes. The 2D drawing's protector takes the drawing's hit rectangles and its figures' drawn
// boxes from the index, at the area's scale, centred in it (`flatProtectorFor`).
import type { RoomIndex, RoomScene } from "./bundle";
import type { Protect } from "./frame";
import { framing } from "./framing";
import type { Box as WorldBox } from "./framing";
import { DEFAULT_METRICS, reservedBoxes } from "./hud";
import type { Box, EatOption } from "./hud";
import { CORE_PX, flatCore, listOnly, memberRect, pickAreas } from "./pick";
import type { PickInput, Rect } from "./pick";
import { FLAT_VIEW, flatPlacement } from "./stages";

/** The protector's input: the framing's boxes, the selectables in scene order with their members' framed boxes and
 *  whether each hangs on a side wall (FR-064's carve-out), and the two figures' framed boxes, all in world metres. */
export interface ProtectScene {
  readonly framed: readonly WorldBox[];
  readonly selectables: readonly {
    readonly id: string;
    readonly boxes: readonly WorldBox[];
    readonly sideWall: boolean;
  }[];
  readonly figures: readonly WorldBox[];
}

/** Each selectable's members projected on a stage at the production framing at its aspect. */
function inputsAt(scene: ProtectScene, stage: { readonly w: number; readonly h: number }): PickInput[] {
  const camera = framing(stage.w / stage.h, scene.framed);
  return scene.selectables.map((s) => ({
    id: s.id,
    members: s.boxes.flatMap((b) => {
      const r = memberRect(b, camera, stage);
      return r ? [r] : [];
    }),
  }));
}

/** The 3D protector over a scene, at a root font size (the walking control's box, reserved where pressability is
 *  judged, is in rem). Spec 024 (Q150): with `{ eat: true }`, a 3D dinosaur visit's, the "Eat" tile's box is reserved
 *  with it there and among the compact boxes, and the key says so; without, the protector is as before. */
export function protectorFor(scene: ProtectScene, rem: number = DEFAULT_METRICS.rem, option: EatOption = {}): Protect {
  const eat = option.eat === true;
  const sideWall = new Set(scene.selectables.filter((s) => s.sideWall).map((s) => s.id));
  let known: { readonly key: string; readonly held: ReadonlySet<string> } | null = null;
  /** The side-wall selectables list-only at spec 005's frame: computed once per clear area. */
  const heldAt = (clear: Box): ReadonlySet<string> => {
    const key = `${clear.w}x${clear.h}`;
    if (known?.key === key) return known.held;
    const areas = pickAreas(inputsAt(scene, clear));
    const held = listOnly(areas, [0, 0, clear.w, clear.h], sideWall, reservedBoxes(clear, rem, { eat }));
    known = { key, held };
    return held;
  };
  return {
    key: `3d:${rem}${eat ? ":eat" : ""}:${JSON.stringify(scene)}`,
    ...(eat ? { eat: true } : {}),
    boxes(area, clear) {
      const held = heldAt(clear);
      const stage = { w: area.w, h: area.h };
      const areas = pickAreas(inputsAt(scene, stage));
      // FR-061: a selectable pressable at spec 005's frame stays pressable at this one, its HUD boxes apart, which the
      // margin test then keeps clear; else the step is refused.
      for (const id of listOnly(areas, [0, 0, area.w, area.h], sideWall)) if (!held.has(id)) return null;
      const out: Box[] = [];
      for (const a of areas)
        if (a.core && !held.has(a.id))
          out.push({ x: area.x + a.core[0], y: area.y + a.core[1], w: CORE_PX, h: CORE_PX });
      const camera = framing(stage.w / stage.h, scene.framed);
      for (const b of scene.figures) {
        const r = memberRect(b, camera, stage);
        if (r) out.push({ x: area.x + r.rect[0], y: area.y + r.rect[1], w: r.rect[2], h: r.rect[3] });
      }
      return out;
    },
  };
}

/** The protector's input from the bundle, as the room has it at run time: the 3D part's framed placements' boxes, the
 *  index's selectables with their members' boxes and side-wall flags, and the two figures' placements' boxes. */
export function protectSceneOf(part: RoomScene, index: Pick<RoomIndex, "selectables">): ProtectScene {
  const boxes = new Map<string, WorldBox>();
  for (const p of part.placements) if (!boxes.has(p.id)) boxes.set(p.id, p.frame_box);
  const of = (ids: readonly string[]): WorldBox[] =>
    ids.flatMap((id) => {
      const b = boxes.get(id);
      return b ? [b] : [];
    });
  return {
    framed: part.placements.filter((p) => p.framed).map((p) => p.frame_box),
    selectables: index.selectables.map((s) => ({ id: s.id, boxes: of(s.members), sideWall: s.side_wall })),
    figures: of([part.figures.twin, part.figures.visitor]),
  };
}

/** The 2D drawing's protector (PD-23): its hit rectangles' cores and its figures' drawn boxes, the index's `flat.hits`
 *  and `flat.figures` in view-box units, at the area's scale, the drawing centred in the area; a side-wall selectable
 *  list-only at the clear area's scale is absent, as in 3D. */
export function flatProtectorFor(index: Pick<RoomIndex, "flat" | "selectables">): Protect {
  const sideWall = new Set(index.selectables.filter((s) => s.side_wall).map((s) => s.id));
  const inputs: PickInput[] = index.flat.hits.map((h) => ({
    id: h.selectable,
    members: h.rects.map((rect, k) => ({ rect, depth: h.depths[k] ?? 0 })),
  }));
  const view: Rect = [0, 0, FLAT_VIEW.w, FLAT_VIEW.h];
  let known: { readonly key: string; readonly held: ReadonlySet<string> } | null = null;
  const heldAt = (clear: Box): ReadonlySet<string> => {
    const key = `${clear.w}x${clear.h}`;
    if (known?.key === key) return known.held;
    const held = listOnly(pickAreas(inputs, flatCore(clear)), view, sideWall);
    known = { key, held };
    return held;
  };
  return {
    boxes(area, clear) {
      const held = heldAt(clear);
      const p = flatPlacement(area);
      const areas = pickAreas(inputs, flatCore(area));
      for (const id of listOnly(areas, view, sideWall)) if (!held.has(id)) return null;
      const out: Box[] = [];
      for (const a of areas) {
        if (!a.core || held.has(a.id)) continue;
        const [cx, cy, cw, ch] = a.core;
        const centre = [p.x + (cx + cw / 2) * p.scale, p.y + (cy + ch / 2) * p.scale] as const;
        out.push({ x: centre[0] - CORE_PX / 2, y: centre[1] - CORE_PX / 2, w: CORE_PX, h: CORE_PX });
      }
      for (const [x, y, w, h] of index.flat.figures)
        out.push({ x: p.x + x * p.scale, y: p.y + y * p.scale, w: w * p.scale, h: h * p.scale });
      return out;
    },
  };
}
