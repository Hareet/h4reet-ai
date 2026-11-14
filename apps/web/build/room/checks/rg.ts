// RG, geometry (spec 004; FR-002, FR-003, FR-009, FR-017, FR-019, FR-051, FR-052, FR-064, SC-009, SC-010; R-17 to
// R-22; data-model.md §3, §4; contracts/room-data-files.md §2, §4, §5.2 to §5.5, §13.3). Every measure is the shared
// kernel's (src/room/compose/), the one the room and the lookdev page take: mount.ts's world transforms, framing(),
// project.ts, stages.ts's stages, pick.ts's pick areas, layout.ts's grids, legibility.ts's cap heights, and cable.ts's
// run. RG3 and RG2's unit vectors are checks the schemas hold, so the loader refuses a file that breaks one; the rest
// are here: RG1 a placement mounted on itself, or in a cycle; RG2 bounds that don't hold the origin, a live face, glow,
// or stand-in shape outside them, an up not square to its facing (+Y where it's absent), and a canvas off its face's
// aspect by more than a pixel; RG4 the twin or a selectable's member not framed; RG5 a framed box's corner behind the
// camera or outside the view at one of the six aspects; RG6 a selectable's exclusive core leaving the view, or over
// another's core, member, or union, at a supported stage, in 3D or 2D, but FR-064's carve-out for a side-wall
// selectable at any stage where its core can't fit (see listOnly); RG7 a bound face under the legibility floor that isn't
// atmosphere, but FR-052's one exemption on the reference phone (`phoneExempt`), atmosphere on a readable face, and an
// atmosphere face over its max_chars; RG9 a region outside
// its face, or over another. RG8 is never a finding: `poseSeparations` gives the report its measures, as `faceCaps`
// gives RG7's.
//
// One production framing: `geometry` resolves the scene and frames it, once a compose (`geometryOf`), and RK3 (rk.ts)
// and the bundle (emit.ts) take their numbers from it, so a check and the bundle can't measure two framings: the 3D
// part's frame_box (`frameBoxes`), the index's flat hits (`flatMembers`) and screen_css (`faceScreens`), RK3's
// canvases, the report's cap heights (`faceCaps`) and separations (`poseSeparations`), and the index's cap ratios
// (`lookTypefaces`). The hit rectangles, the faces' sizes, and the cap ratios are quantized here as the index carries
// them, so RG6, RK3, and RG7 hold exactly its numbers; emit.ts quantizes the frame boxes as it writes them.
//
// Readings:
// - A framed box is a set model's measured bounds through the placement's world transform, or the catalog's expected
//   bounds at the stylized scale through it, as the axis-aligned box of its eight corners, its top raised by framing.ts's
//   `withLabel` where the placement shows a stand-in with a label: never over a set piece, nor over a figure, which shows
//   its avatar. A model is set when main's caps exist and it has no RX or RK2 finding (rx.ts's `setModels`).
// - The production framing on a stage is framing(W ÷ H) over the framed placements' boxes. The 2D drawing's is
//   framing(1.6) into the 320 × 200 view box, where a core's 44 px are taken at the smallest scale a supported stage
//   gives the drawing, and a selectable's member rectangles are its members' frame boxes projected there.
// - A stand-in shape's extent is the support of its own geometry through T(at) · R(turn) · S(scale) along each axis, so
//   a turned round shape counts its true size; a tube's `from` and `to` and a polygon's points are in that frame, and a
//   polygon's depth is centred on its plane, as a box's is.
// - An atmosphere face's words are what it draws from the data: its blocks' lines but pending ones, its outlines'
//   words, and its UI words. A counter's figure and the resume's titles come at run time, for the renderer to cap.
// - RG8's parts are the piece's bounds' corners at its stylized scale and the cable's run; its cue is a glow's diameter
//   on screen times the change in its level.
// What doesn't resolve (a reference, RI4's; a cycle, RG1's; a file the loader refused) is left out of every measure,
// and no reason holds a value from the data: another placement, selectable, or region is named by its index.
import { cableRun, restPlane } from "../../../src/room/compose/cable";
import type { CableRun } from "../../../src/room/compose/cable";
import { framing, withLabel } from "../../../src/room/compose/framing";
import type { Box } from "../../../src/room/compose/framing";
import type { Grid } from "../../../src/room/compose/layout";
import { facePoint, regionCap, smallestCapPx, typefaceFor } from "../../../src/room/compose/legibility";
import type { CapRegion, FaceGeometry, RegionSourceRef } from "../../../src/room/compose/legibility";
import { dot, origin, transformPoint } from "../../../src/room/compose/math";
import type { Mat4, Turn, Vec3 } from "../../../src/room/compose/math";
import { anchorWorld, modelOf, mountWorld, resolveMounts } from "../../../src/room/compose/mount";
import type { MountAnchor, MountPlacement, Resolved } from "../../../src/room/compose/mount";
import type { Protect } from "../../../src/room/compose/frame";
import { DEFAULT_METRICS, reservedBoxes } from "../../../src/room/compose/hud";
import { flatCore, listOnly, memberRect, pickAreas, pickProblems } from "../../../src/room/compose/pick";
import type { MemberRect, PickArea, PickProblem, Rect } from "../../../src/room/compose/pick";
import { projector, toStage } from "../../../src/room/compose/project";
import { protectorFor } from "../../../src/room/compose/protect";
import { shapeBox } from "../../../src/room/compose/shape-box";
import type { ProtectScene } from "../../../src/room/compose/protect";
import type { Camera, Projector } from "../../../src/room/compose/project";
import {
  ASPECTS,
  FLAT_VIEW,
  REFERENCE_DESKTOP,
  REFERENCE_PHONE,
  flatScale,
  smallestFlatStage,
  stageFor,
  supportedStages,
} from "../../../src/room/compose/stages";
import type { Stage } from "../../../src/room/compose/stages";
import { TIER_VALUES, isSideWallAnchor } from "../../../src/room/compose/vocabulary";
import type { SideWallAnchor, TypefaceUse } from "../../../src/room/compose/vocabulary";
import type { Loaded, LoadedRoom } from "../load";
import { capsOf } from "../policy";
import type { RoomPolicy } from "../policy";
import type {
  AnchorRef,
  CatalogEntry,
  FaceBinding,
  LiveFace,
  Mount,
  Placement,
  Region,
  Scene,
  Switch,
} from "../schema";
import { EATER } from "../../../src/room/eat/available";
import { avatarsOf, carriesModel } from "../avatars";
import { readTypefaces } from "../typefaces";
import type { TreeReader, Typeface } from "../typefaces";
import type { Context, Family } from "./family";
import { setModels } from "./rx";

/** Room for floating point at a boundary, in metres or fractions of a face. */
const EPS = 1e-9;
/** RG2's: a unit up within 1e-6 of square to its facing, as the reason prints it, and a canvas within a pixel of its
 *  face's aspect. */
const SQUARE = { value: 1e-6, text: "1e-6" } as const;
const ASPECT_PX = 1;
/** An absent up's default (contracts/room-data-files.md §4). */
const UP: Vec3 = [0, 1, 0];
const NO_TURN = { x: 0, y: 0, z: 0 } as const;

const has = (o: object, key: string): boolean => Object.hasOwn(o, key);

/** A number on the grid of 1 ÷ `per`, −0 as 0, as the bundle carries it (contracts/room-bundle.md §11): view-box units
 *  and CSS pixels to 1e-4, and every other measure to 1e-6. */
function onGrid(n: number, per: number): number {
  const q = Math.round(n * per) / per;
  return Number.isFinite(q) && q !== 0 ? q : 0;
}

/** A reference stage, by the name a reason and the report give it, with its pixel ratio and its production camera. */
export interface ReferenceView {
  readonly name: "desktop" | "phone";
  readonly stage: Stage;
  readonly dpr: number;
  readonly camera: Camera;
}

/** The scene as the kernel resolves it, and its production framing. */
export interface Geometry {
  readonly room: LoadedRoom;
  readonly scene: Loaded<Scene>;
  /** The catalog's first entry for each piece ID (a second is RI2's). */
  readonly pieces: ReadonlyMap<string, CatalogEntry>;
  /** The scene's first placement for each ID, by its index. */
  readonly index: ReadonlyMap<string, number>;
  readonly resolved: Resolved;
  /** Each piece whose model or card is set: a model's measured bounds, or null for a card. */
  readonly set: ReadonlyMap<string, Box | null>;
  /** Each resolved placement's framed box. */
  readonly boxes: ReadonlyMap<string, Box>;
  /** The framed placements' boxes, in scene order: what every camera frames. */
  readonly framed: readonly Box[];
  /** The production camera on each reference stage, the desktop's first. Since spec 014, each reference stage is the
   *  frame area of its screen (FR-060), which holds its clear area. */
  readonly reference: readonly ReferenceView[];
  /** The 2D drawing's camera, framing(1.6). */
  readonly flat: Camera;
  /** Spec 014: the frame area's protector over this scene (compose/protect.ts), which the supported stages take. */
  readonly protect: Protect;
  /** Spec 024 (Q150; plan.md §5.5): a 3D dinosaur visit's protector over the same scene, the "Eat" tile's box among the
   *  compact boxes and reserved at spec 005's frame: the variant sweep's stages, which RG6 and RG7 judge too. */
  readonly protectEat: Protect;
  /** Spec 024 (Q-R3a): the reference stages a dinosaur visit frames into, over `protectEat`; RG7 judges the floor at
   *  them too. The bundle's numbers stay the plain visit's (`reference`): there is one bundle. */
  readonly referenceEat: readonly ReferenceView[];
}

/** A box's eight corners. */
function corners(b: { readonly min: Vec3; readonly max: Vec3 }): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}

/** The axis-aligned box of a box's corners through m. */
function worldBox(m: Mat4, b: { readonly min: Vec3; readonly max: Vec3 }): Box {
  const points = corners(b).map((c) => transformPoint(m, c));
  const along = (k: 0 | 1 | 2): number[] => points.map((p) => p[k]);
  return {
    min: [Math.min(...along(0)), Math.min(...along(1)), Math.min(...along(2))],
    max: [Math.max(...along(0)), Math.max(...along(1)), Math.max(...along(2))],
  };
}

/** The scene's placements resolved through mount.ts, their framed boxes, the framed set, and the cameras that frame it,
 *  with `set` the pieces whose model or card is set; null without a scene. The bundle calls it with the pieces it shows
 *  set, which are `setModels`' in any build whose outputs are used. */
export function geometry(room: LoadedRoom, set: ReadonlyMap<string, Box | null>): Geometry | null {
  const scene = room.scene;
  if (!scene) return null;
  const pieces = new Map<string, CatalogEntry>();
  for (const c of room.catalog) if (!pieces.has(c.value.id)) pieces.set(c.value.id, c.value);
  const placements: MountPlacement[] = scene.value.placements.map((p) => ({
    id: p.id,
    piece: p.piece,
    mount: p.mount ? { on: p.mount.on, anchor: p.mount.anchor } : null,
    offset: p.mount?.offset ?? [0, 0, 0],
    turn: p.mount?.turn ?? NO_TURN,
  }));
  const resolved = resolveMounts(
    placements,
    Object.fromEntries([...pieces].map(([id, c]) => [id, { scale: c.stylized_scale, anchors: c.anchors }])),
  );
  const index = new Map<string, number>();
  scene.value.placements.forEach((p, i) => {
    if (!index.has(p.id)) index.set(p.id, i);
  });
  const boxes = new Map<string, Box>();
  const framed: Box[] = [];
  for (const [id, i] of index) {
    const p = scene.value.placements[i];
    const entry = p && pieces.get(p.piece);
    const world = resolved.world.get(id);
    const model = resolved.model.get(id);
    if (!p || !entry || !world || !model) continue;
    const measured = set.get(p.piece);
    const box = measured ? worldBox(world, measured) : worldBox(model, entry.origin.bounds);
    // Only a stand-in shows its label: a set piece shows its model or card, and a figure its avatar.
    const framedBox = p.label !== undefined && p.role === undefined && !set.has(p.piece) ? withLabel(box) : box;
    boxes.set(id, framedBox);
    if (p.frame) framed.push(framedBox);
  }
  // Spec 014 (FR-016, FR-060): the protector over the scene's own boxes, so the stages and the reference stages are the
  // frame areas the room frames into.
  const flat = framing(FLAT_VIEW.w / FLAT_VIEW.h, framed);
  // The side-wall flags read the scene and the catalog alone, not the stages, so they come before them.
  const base = { room, scene, pieces, index, resolved, set, boxes, framed, flat };
  const none = { boxes: () => [] };
  const flags = sideWallsOf({ ...base, reference: [], protect: none, protectEat: none, referenceEat: [] });
  const protectScene = protectSceneFrom(scene.value, boxes, framed, flags);
  const protect = protectorFor(protectScene);
  // Spec 024 (Q150): the dinosaur visit's protector, at the compositor's root font size.
  const protectEat = protectorFor(protectScene, DEFAULT_METRICS.rem, { eat: true });
  const referenceOf = (over: Protect): ReferenceView[] =>
    ([REFERENCE_DESKTOP, REFERENCE_PHONE] as const).map(({ screen, dpr }, k): ReferenceView => {
      const framedStage = stageFor(screen, over);
      const stage = { w: framedStage.w, h: framedStage.h };
      return { name: k === 0 ? "desktop" : "phone", stage, dpr, camera: framing(stage.w / stage.h, framed) };
    });
  return { ...base, reference: referenceOf(protect), protect, protectEat, referenceEat: referenceOf(protectEat) };
}

/** The protector's input from a scene's resolved boxes (spec 014; FR-016; contracts/frame-area.md §5): the framed
 *  boxes, each selectable's members' boxes with its side-wall flag, and the two figures' boxes, as the bundle carries
 *  them for the room's own protector (compose/protect.ts's protectSceneOf). */
function protectSceneFrom(
  scene: Scene,
  boxes: ReadonlyMap<string, Box>,
  framed: readonly Box[],
  sideWall: readonly boolean[],
): ProtectScene {
  const of = (ids: readonly string[]): Box[] =>
    ids.flatMap((id) => {
      const b = boxes.get(id);
      return b ? [b] : [];
    });
  const figures = (["twin", "visitor"] as const).flatMap((role) => {
    const p = scene.placements.find((x) => x.role === role);
    return p ? of([p.id]) : [];
  });
  return {
    framed,
    selectables: scene.selectables.map((x, k) => ({
      id: String(k),
      boxes: of(x.members),
      sideWall: sideWall[k] ?? false,
    })),
    figures,
  };
}

/** The protector's input for a compose's geometry, the one the stages take (spec 014). */
export function protectSceneOfGeometry(g: Geometry): ProtectScene {
  return protectSceneFrom(g.scene.value, g.boxes, g.framed, sideWallsOf(g));
}

const geometries = new WeakMap<Context, Geometry | null>();

/** A compose's geometry, made once: its models set as `setModels` reads them. */
export function geometryOf(ctx: Context): Geometry | null {
  if (!geometries.has(ctx)) geometries.set(ctx, geometry(ctx.room, setModels(ctx)));
  return geometries.get(ctx) ?? null;
}

/** A placement of the scene by ID, with its piece's entry and its world transform, when all three resolve. */
function placed(
  g: Geometry,
  id: string,
): { readonly entry: CatalogEntry; readonly world: Mat4; readonly model: Mat4 } | null {
  const i = g.index.get(id);
  const p = i === undefined ? undefined : g.scene.value.placements[i];
  const entry = p && g.pieces.get(p.piece);
  const world = g.resolved.world.get(id);
  const model = g.resolved.model.get(id);
  return entry && world && model ? { entry, world, model } : null;
}

/** An anchor of a piece, by name. */
function anchorOf(entry: CatalogEntry, name: string): MountAnchor | undefined {
  return has(entry.anchors, name) ? entry.anchors[name] : undefined;
}

/** A placement's anchor's frame in the world: World · T(s · at) · R(turn); null when either doesn't resolve. */
function anchorFrame(g: Geometry, ref: AnchorRef): Mat4 | null {
  const on = placed(g, ref.placement);
  const anchor = on && anchorOf(on.entry, ref.anchor);
  return on && anchor ? anchorWorld(on.world, on.entry.stylized_scale, anchor) : null;
}

/** Where a mount puts what it places, a switch's pose among them: World(on) · T(s_on · anchor.at) · R(anchor.turn) ·
 *  T(offset) · R(turn), mount.ts's World; null when its placement, that placement's piece, or the anchor doesn't
 *  resolve. RS5 compares two poses by it. */
export function mountedWorld(g: Geometry, mount: Mount): Mat4 | null {
  const on = placed(g, mount.on);
  const anchor = on && anchorOf(on.entry, mount.anchor);
  return on && anchor ? mountWorld(on.world, on.entry.stylized_scale, anchor, mount.offset, mount.turn) : null;
}

/** Every framed box at this aspect: the production framing's camera, and its projection. */
function cameraAt(g: Geometry, aspect: number): { readonly camera: Camera; readonly view: Projector } {
  const camera = framing(aspect, g.framed);
  return { camera, view: projector(camera, aspect) };
}

/** "a", "a and b", or "a, b, and c". */
function listed(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1) ?? ""}`;
}

/** A length in CSS pixels, to 0.1 and never rounded up to a floor it is under. */
const tenth = (px: number): string => (Math.floor(px * 10 + EPS) / 10).toFixed(1);

// ---- RG1 ----

/** RG1: a placement mounted on itself, or in a cycle of mounts, which the shell doesn't root. */
function cycles(ctx: Context, g: Geometry): void {
  for (const u of g.resolved.unresolved) {
    const i = g.index.get(u.id);
    const p = i === undefined ? undefined : g.scene.value.placements[i];
    if (u.reason !== "cycle" || i === undefined || !p?.mount) continue;
    const reason =
      p.mount.on === p.id
        ? "a placement mounted on itself"
        : "a placement in a cycle of mounts, which the shell doesn't root";
    ctx.report("RG1", g.scene.file, ctx.path("placements", i, "mount", "on"), reason);
  }
}

// ---- RG2 ----

const AXES = [0, 1, 2] as const;

/** A point inside a box, within EPS. */
function holds(b: { readonly min: Vec3; readonly max: Vec3 }, p: Vec3): boolean {
  return AXES.every((k) => p[k] >= b.min[k] - EPS && p[k] <= b.max[k] + EPS);
}

/** A live face as legibility.ts takes it, its up +Y where the catalog gives none. */
const faceOf = (f: LiveFace): FaceGeometry => ({ at: f.at, size: f.size, facing: f.facing, up: f.up ?? UP });
const FACE_CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;

/** How far a face's canvas is off its aspect, in pixels: its smaller side against the larger side times the aspect. */
function aspectOff(size: readonly [number, number], px: readonly [number, number]): number {
  const [[w, h], [pw, ph]] = [size, px];
  return w >= h ? Math.abs(ph - (pw * h) / w) : Math.abs(pw - (ph * w) / h);
}

/** A stand-in shape's extent in its piece's frame (compose/shape-box.ts, spec 024 moved it there for the eating's
 *  keep-outs): the room's stand-in builders (src/room/scene/standins.ts) are held to it, so what RG checks is what the
 *  room draws. */
export { shapeBox };

/** RG2: a catalog entry's bounds holding its origin, every live face's corners, every glow, and every stand-in shape;
 *  each face's up square to its facing; each face's canvas within a pixel of its aspect. */
function bounds(ctx: Context): void {
  for (const { file, value: c } of ctx.room.catalog) {
    const b = c.origin.bounds;
    const rg2 = (path: string, reason: string): void => ctx.report("RG2", file, path, reason);
    if (!holds(b, [0, 0, 0])) rg2("origin.bounds", "doesn't hold the piece's origin");
    c.live_faces.forEach((f, k) => {
      const face = faceOf(f);
      if (!FACE_CORNERS.every(([u, v]) => holds(b, facePoint(face, u, v))))
        rg2(ctx.path("live_faces", k), "a corner outside origin.bounds");
      if (Math.abs(dot(face.up, f.facing)) > SQUARE.value)
        rg2(
          ctx.path("live_faces", k, "up"),
          f.up
            ? `not perpendicular to facing within ${SQUARE.text}`
            : `absent, and +Y, its default, isn't perpendicular to facing within ${SQUARE.text}`,
        );
      const off = aspectOff(f.size, f.px);
      if (off > ASPECT_PX + EPS)
        rg2(ctx.path("live_faces", k, "px"), `${off.toFixed(1)} px off the face's aspect, more than one pixel`);
    });
    c.glows.forEach((glow, k) => {
      if (glow.at !== undefined && !holds(b, glow.at)) rg2(ctx.path("glows", k), "outside origin.bounds");
      // Spec 014 (its FR-045; T001's RG10): each point of a path glow inside the piece's bounds.
      glow.path?.forEach((point, i) => {
        if (!holds(b, point))
          ctx.report("RG10", file, `${ctx.path("glows", k)}.path[${i}]`, "a path glow's point outside origin.bounds");
      });
    });
    c.standin.forEach((s, k) => {
      const e = shapeBox(s);
      if (!holds(b, e.min) || !holds(b, e.max)) rg2(ctx.path("standin", k), "outside origin.bounds");
    });
  }
}

// ---- RG4, RG5 ----

/** RG4: the twin's placement, or a selectable's member, without frame: true. */
function framedSet(ctx: Context, g: Geometry): void {
  const s = g.scene.value;
  s.placements.forEach((p, i) => {
    if (p.role === "twin" && !p.frame)
      ctx.report("RG4", g.scene.file, ctx.path("placements", i, "frame"), "the twin's placement without frame: true");
  });
  s.selectables.forEach((x, k) => {
    for (const m of x.members) {
      const i = g.index.get(m);
      if (i !== undefined && s.placements[i]?.frame === false)
        ctx.report(
          "RG4",
          g.scene.file,
          ctx.path("placements", i, "frame"),
          `a member of selectables[${k}] without frame: true`,
        );
    }
  });
}

/** RG5: at one of spec 002's six aspects, a framed box's corner behind the camera, or outside its view. */
function inView(ctx: Context, g: Geometry): void {
  const views = ASPECTS.map((aspect) => ({ aspect, ...cameraAt(g, aspect) }));
  g.scene.value.placements.forEach((p, i) => {
    const box = g.index.get(p.id) === i && p.frame ? g.boxes.get(p.id) : undefined;
    if (!box) return;
    const points = corners(box);
    const behind: string[] = [];
    const outside: string[] = [];
    for (const { aspect, view } of views) {
      if (points.some((c) => !(view.depth(c) > 0))) behind.push(String(aspect));
      else if (points.some((c) => view.project(c).some((v) => !(Math.abs(v) <= 1 + EPS)))) outside.push(String(aspect));
    }
    const at = ctx.path("placements", i);
    const aspects = (list: string[]): string => `the aspect${list.length === 1 ? "" : "s"} ${listed(list)}`;
    if (behind.length > 0)
      ctx.report("RG5", g.scene.file, at, `a corner of its framed box behind the camera at ${aspects(behind)}`);
    if (outside.length > 0)
      ctx.report("RG5", g.scene.file, at, `a corner of its framed box outside the view at ${aspects(outside)}`);
  });
}

// ---- RG6 ----

/** Every supported stage (stages.ts), for a compose's geometry: since spec 014, its frame areas, each with the HUD
 *  boxes over it reserved (FR-060), made once for its protector. */
const allStages = (g: Geometry): readonly Stage[] => supportedStages(g.protect);

/** A stage's size, as a reason and the report's Side-wall section print it. */
export const stageSize = (s: Stage): string => `${Number(s.w.toFixed(1))} × ${Number(s.h.toFixed(1))}`;

/** "304 × 248", or "304 × 248 and 26 others": the first stage by size and how many more, as RG6's reasons and the
 *  report's Side-wall section name a run of supported stages (contracts/room-bundle.md §10). */
export const stagesPhrase = (first: Stage, more: number): string =>
  `${stageSize(first)}${more > 0 ? ` and ${more} other${more === 1 ? "" : "s"}` : ""}`;

/** An angle in degrees, mod 360, in [0, 360). */
const mod360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Whether a turn is a quarter turn about Y alone, as a side wall's anchor is: its x and z turns none and its y ±90,
 *  each mod 360, so `y: 270` and `y: -270` count. */
export const quarterTurnY = (turn: Turn): boolean =>
  mod360(turn.x) === 0 && mod360(turn.z) === 0 && (mod360(turn.y) === 90 || mod360(turn.y) === 270);

/** How far a side wall's anchor may stand off the shell's bounds along x, in metres. */
const WALL_MM = 0.001;

/** A side-wall anchor of the shell's piece, and the side of the shell's bounds its wall stands at. */
export interface SideWallFrame {
  readonly anchor: SideWallAnchor;
  /** The wall's x, the bounds' min or max x at the shell's stylized scale, in the shell's frame. */
  readonly side: "min" | "max";
  readonly x: number;
}

/**
 * The side-wall test of one of the shell's anchors, which RG6 (`sideWallsOf`) and the photo guide (orders.ts) share:
 * one of SIDE_WALL_ANCHORS by name, at a quarter turn about Y alone (`quarterTurnY`), whose `at[0]` stands within 1 mm
 * of the shell's bounds' min or max x, so the anchor is on a wall of the shell and not inside it. Null otherwise.
 */
export function sideWallFrame(shell: CatalogEntry, name: string): SideWallFrame | null {
  if (!isSideWallAnchor(name)) return null;
  const anchor = anchorOf(shell, name);
  if (!anchor || !quarterTurnY(anchor.turn)) return null;
  const s = shell.stylized_scale;
  const { min, max } = shell.origin.bounds;
  const at = anchor.at[0] * s;
  for (const [side, x] of [
    ["min", min[0] * s],
    ["max", max[0] * s],
  ] as const)
    if (Math.abs(at - x) <= WALL_MM + EPS) return { anchor: name, side, x };
  return null;
}

/**
 * The side-wall anchor a placement hangs on directly, or null (FR-064's carve-out; the spec's Reading R2): it mounts
 * on the scene's shell, the placement without a mount, at an anchor `sideWallFrame` takes for a wall's; its own mount
 * turns it about z alone, if at all (a turn about x or y would stand it out of the wall's plane, as a sign turned to
 * face the camera does); and its offset out from the wall, `|offset[2]|`, is at most its piece's depth along its own z
 * at its stylized scale, so it hangs on the wall and doesn't stand in the room.
 */
function sideWallOf(g: Geometry, root: Placement | undefined, p: Placement | undefined): SideWallAnchor | null {
  const mount = p?.mount;
  if (root === undefined || p === undefined || mount === undefined || mount.on !== root.id) return null;
  const shell = g.pieces.get(root.piece);
  const frame = shell && sideWallFrame(shell, mount.anchor);
  const piece = g.pieces.get(p.piece);
  if (!frame || !piece) return null;
  if (mod360(mount.turn.x) !== 0 || mod360(mount.turn.y) !== 0) return null;
  const { min, max } = piece.origin.bounds;
  const depth = (max[2] - min[2]) * piece.stylized_scale;
  return Math.abs(mount.offset[2]) <= depth + EPS ? frame.anchor : null;
}

/** The scene's placements by ID, the first of each (a second is RI2's), and its shell. */
function byIdOf(g: Geometry): { readonly byId: ReadonlyMap<string, Placement>; readonly root: Placement | undefined } {
  const byId = new Map<string, Placement>();
  for (const [id, i] of g.index) {
    const p = g.scene.value.placements[i];
    if (p) byId.set(id, p);
  }
  return { byId, root: g.scene.value.placements.find((p) => p.mount === undefined) };
}

/** Each selectable, in scene order: whether it is a side-wall selectable, every member hung directly on a side wall
 *  of the shell (`sideWallOf`; FR-064's carve-out, see listOnly), as the index's `side_wall` flags it. A selectable
 *  with members on a side wall and elsewhere isn't one. */
export function sideWallsOf(g: Geometry): boolean[] {
  const { byId, root } = byIdOf(g);
  return g.scene.value.selectables.map(
    (sel) => sel.members.length > 0 && sel.members.every((m) => sideWallOf(g, root, byId.get(m)) !== null),
  );
}

/** A side-wall selectable, its walls, and the stages FR-064's carve-out (see listOnly) leaves it to the "In the room"
 *  list at, in 3D and in the 2D drawing at each stage's scale: the report's Side-wall section. */
export interface SideWallPick {
  readonly id: string;
  /** Its index in scene.yaml's selectables, which names it where RT2 refused its ID. */
  readonly index: number;
  /** Its members' side-wall anchors, in first-appearance order. */
  readonly walls: readonly SideWallAnchor[];
  /** The stages, in supportedStages()'s order, where it is list-only in 3D, and in 2D. */
  readonly stages: readonly Stage[];
  readonly flat: readonly Stage[];
}

/** A problem RG6 refuses, with the first stage it comes at, in 3D or in 2D, and at how many more, counted by size:
 *  since spec 014 two stages of one size can differ in their reserved boxes, and a reason names sizes. */
interface SweptProblem {
  readonly problem: PickProblem;
  readonly mode: "3D" | "2D";
  /** Spec 024 (Q150): found only in the dinosaur visit's sweep, whose stages hold the "Eat" tile's box. */
  readonly dinosaur?: true;
  readonly first: Stage;
  more: number;
  readonly sizes: Set<string>;
}

/** A stage's size, the key by which RG6 counts and lists its stages. */
const sizeKey = (s: Stage): string => `${s.w}x${s.h}`;

/** Each list's sizes so far, so adding stays linear over the sweep. */
const sizesOf = new WeakMap<Stage[], Set<string>>();

/** Adds a stage to a list unless one of its size is there already. */
function addSized(list: Stage[], stage: Stage): void {
  let sizes = sizesOf.get(list);
  if (!sizes) sizesOf.set(list, (sizes = new Set(list.map(sizeKey))));
  if (sizes.has(sizeKey(stage))) return;
  sizes.add(sizeKey(stage));
  list.push(stage);
}

/** RG6's sweep of every supported stage, in 3D at its production framing and in 2D at its scale: what it refuses,
 *  and where it leaves a side-wall selectable to the list. */
export interface PickSweep {
  readonly problems: readonly SweptProblem[];
  readonly sideWalls: readonly SideWallPick[];
  /** Spec 008: each side-wall selectable the walking control's box holds, in 3D, at stages where its core would
   *  otherwise keep its pick area, in scene order; the report names them. */
  readonly boxHolds: readonly BoxHold[];
  /** Spec 024 (Q150): the dinosaur visit's own, over `protectEat`'s stages in 3D: the side-wall selectables left to the
   *  list there, and those its reserved boxes (the walking control's and the "Eat" tile's) hold. Empty where a test
   *  gives its own stages. */
  readonly dinosaur: { readonly sideWalls: readonly SideWallPick[]; readonly boxHolds: readonly BoxHold[] };
}

/** A side-wall selectable a reserved box holds, and the stages where it does. */
export interface BoxHold {
  readonly id: string;
  readonly index: number;
  readonly stages: readonly Stage[];
}

const sweeps = new WeakMap<Geometry, PickSweep>();

/** RG6's sweep, made once a compose: `spacing` refuses its problems, and the report names its side-wall
 *  selectables. Each selectable with a member that resolves is a pick area, its ID its index in scene.yaml's
 *  selectables; in 3D its members are its frame boxes projected on the stage, and in 2D the index's flat hits
 *  (`flatMembers`), which the 2D room picks from, their core 44 px at the stage's scale. At each stage `listOnly`
 *  holds the side-wall selectables FR-064's carve-out leaves to the list there, and `pickProblems` gives the rest. */
export function pickSweep(g: Geometry, at?: readonly Stage[]): PickSweep {
  // The supported stages unless a test gives others (spec 005, T025: spec 004's frozen stages, for FR-057's subset);
  // only the supported stages' sweep is kept for the compose.
  const known = at === undefined ? sweeps.get(g) : undefined;
  if (known) return known;
  const sweepStages = at ?? allStages(g);
  const s = g.scene.value;
  const selectables = s.selectables.flatMap((x, k) => {
    const boxes = x.members.flatMap((m) => {
      const box = g.boxes.get(m);
      return box ? [box] : [];
    });
    return boxes.length > 0 ? [{ id: String(k), boxes }] : [];
  });
  const flags = sideWallsOf(g);
  const sideWall = new Set(selectables.filter(({ id }) => flags[Number(id)]).map(({ id }) => id));
  const { byId, root } = byIdOf(g);
  const picksMap = () =>
    new Map(
      [...sideWall].map((id) => {
        const walls = new Set<SideWallAnchor>();
        for (const m of s.selectables[Number(id)]?.members ?? []) {
          const wall = sideWallOf(g, root, byId.get(m));
          if (wall) walls.add(wall);
        }
        const index = Number(id);
        return [
          id,
          { id: s.selectables[index]?.id ?? "", index, walls: [...walls], stages: [] as Stage[], flat: [] as Stage[] },
        ];
      }),
    );
  const holdsMap = () =>
    new Map(
      [...sideWall].map((id) => [
        id,
        { id: s.selectables[Number(id)]?.id ?? "", index: Number(id), stages: [] as Stage[] },
      ]),
    );
  const picks = picksMap();
  const boxHolds = holdsMap();
  const found = new Map<string, SweptProblem>();
  const noteIn =
    (into: Map<string, SweptProblem>) =>
    (mode: "3D" | "2D", problems: readonly PickProblem[], stage: Stage): void => {
      for (const problem of problems) {
        const key = `${mode}\n${problem.selectable}\n${problem.problem}\n${problem.other ?? ""}`;
        const seen = into.get(key);
        if (!seen) into.set(key, { problem, mode, first: stage, more: 0, sizes: new Set([sizeKey(stage)]) });
        else if (!seen.sizes.has(sizeKey(stage))) {
          seen.sizes.add(sizeKey(stage));
          seen.more += 1;
        }
      }
    };
  const note = noteIn(found);
  const flat = flatMembers(g);
  const flatInputs = selectables.map(({ id }) => ({ id, members: flat[Number(id)] ?? [] }));
  const flatAreas = new Map<number, PickArea[]>();
  const flatView: Rect = [0, 0, FLAT_VIEW.w, FLAT_VIEW.h];
  /** The 3D step at a stage: its problems noted, and the side-wall selectables held there and by its reserved boxes. */
  const sweep3D = (
    stage: Stage,
    noted: ReturnType<typeof noteIn>,
    into: ReturnType<typeof picksMap>,
    holdsInto: ReturnType<typeof holdsMap>,
  ): void => {
    const { camera } = cameraAt(g, stage.w / stage.h);
    const areas = pickAreas(
      selectables.map(({ id, boxes }) => ({
        id,
        members: boxes.flatMap((box) => {
          const rect = memberRect(box, camera, stage);
          return rect ? [rect] : [];
        }),
      })),
    );
    const view: Rect = [0, 0, stage.w, stage.h];
    // Spec 008 (FR-021, FR-058): the walking control's box, in the stage's bottom-right corner in 3D, is reserved; since
    // spec 005 every HUD control over the clear area is (its FR-055), compose/hud.ts's reservedBoxes; since spec 014,
    // every HUD box over the stage's frame area, the stage's own `reserved` (FR-060).
    const reserved = stage.reserved ?? reservedBoxes(stage);
    const held = listOnly(areas, view, sideWall, reserved);
    noted("3D", pickProblems(areas, view, held, reserved), stage);
    for (const id of held) {
      const pick = into.get(id);
      if (pick) addSized(pick.stages, stage);
    }
    const plain = listOnly(areas, view, sideWall);
    for (const id of held) {
      const hold = holdsInto.get(id);
      if (hold && !plain.has(id)) addSized(hold.stages, stage);
    }
  };
  for (const stage of sweepStages) {
    sweep3D(stage, note, picks, boxHolds);
    // In 2D the view box is fixed, and a core's 44 px are view-box units at the stage's scale.
    const scale = flatScale(stage);
    let drawn = flatAreas.get(scale);
    if (!drawn) flatAreas.set(scale, (drawn = pickAreas(flatInputs, flatCore(stage))));
    const flatHeld = listOnly(drawn, flatView, sideWall);
    note("2D", pickProblems(drawn, flatView, flatHeld), stage);
    for (const id of flatHeld) {
      const pick = picks.get(id);
      if (pick) addSized(pick.flat, stage);
    }
  }
  // Spec 024 (Q150): the dinosaur visit's sweep, in 3D only (2D has no "Eat" tile), over its own stages; a problem it
  // finds that the plain sweep doesn't is refused as the dinosaur visit's. Only for the supported stages' sweep.
  const eatFound = new Map<string, SweptProblem>();
  const eatPicks = picksMap();
  const eatHolds = holdsMap();
  if (at === undefined)
    for (const stage of supportedStages(g.protectEat)) sweep3D(stage, noteIn(eatFound), eatPicks, eatHolds);
  const sweep: PickSweep = {
    problems: [
      ...found.values(),
      ...[...eatFound].filter(([key]) => !found.has(key)).map(([, p]): SweptProblem => ({ ...p, dinosaur: true })),
    ],
    sideWalls: [...picks.values()],
    boxHolds: [...boxHolds.values()].filter((h) => h.stages.length > 0),
    dinosaur: {
      sideWalls: [...eatPicks.values()].filter((p) => p.stages.length > 0),
      boxHolds: [...eatHolds.values()].filter((h) => h.stages.length > 0),
    },
  };
  if (at === undefined) sweeps.set(g, sweep);
  return sweep;
}

/** Spec 024 (FR-001, FR-012; page Q247): whether a compose's bundle carries the dinosaur's model, so a 3D dinosaur
 *  visit, with its "Eat" tile, can happen. The compositor reports the dinosaur visit's own RG6 refusals and RG7 floor
 *  only then; the geometry builds the variant either way (a test's geometry judges it whole). */
export function dinosaurVisit(ctx: Context): boolean {
  return carriesModel(avatarsOf(ctx.tree, ctx.policy, ctx.room.scene?.value ?? null), EATER);
}

/** RG6: a selectable's exclusive 44 × 44 core that leaves the view, or lies over another selectable's core, a member,
 *  or its union, where a pick that misses every member goes: in 3D at every supported stage, at its production
 *  framing; in 2D in the drawing's view box, at each stage's scale. FR-064's carve-out (see listOnly) holds a
 *  side-wall selectable there instead of refusing it. Each problem is reported once, with the first stage it comes at
 *  and how many more; in 2D, a problem that comes at the drawing's smallest scale is named by that scale. */
function spacing(ctx: Context, g: Geometry): void {
  for (const { selectable, reason } of spacingReasons(g, dinosaurVisit(ctx)))
    ctx.report("RG6", g.scene.file, ctx.path("selectables", selectable), reason);
}

/** RG6's refusals over a geometry, each selectable's index and its reason, in the sweep's order; a problem found only
 *  in a 3D dinosaur visit's sweep (spec 024, Q150) says so, and is left out with `dinosaur` false (page Q247: the
 *  bundle carries no dinosaur's model, so no such visit happens). */
export function spacingReasons(
  g: Geometry,
  dinosaur = true,
): { readonly selectable: number; readonly reason: string }[] {
  const smallest = flatScale(smallestFlatStage());
  const meets = { core: "the core of", member: "a member of", union: "the union of the members of" } as const;
  const problems = pickSweep(g).problems.filter((p) => dinosaur || !p.dinosaur);
  return problems.map(({ problem, mode, first, more, dinosaur: own }) => {
    const what =
      problem.problem === "outside"
        ? "its 44 × 44 core leaves the view"
        : problem.problem === "reserved"
          ? own
            ? "its exclusive core lies under a panel's box, the walking control's box, or the \"Eat\" tile's box"
            : "its exclusive core lies under a panel's box or the walking control's box"
          : `its exclusive core overlaps ${meets[problem.problem]} selectables[${problem.other ?? ""}]`;
    const where =
      mode === "3D"
        ? `in 3D at ${stagesPhrase(first, more)}${own ? " for a 3D dinosaur visit" : ""}`
        : flatScale(first) === smallest
          ? "in 2D, at the drawing's smallest scale"
          : `in 2D, at the drawing's scale on ${stagesPhrase(first, more)}`;
    return { selectable: Number(problem.selectable), reason: `${what} ${where}` };
  });
}

/** The side-wall selectables FR-064's carve-out (see listOnly) leaves to the "In the room" list somewhere, in scene
 *  order, with the stages where it does: the report's Side-wall section. None without a scene. */
export function sideWallPicks(g: Geometry | null): SideWallPick[] {
  return g ? pickSweep(g).sideWalls.filter((p) => p.stages.length > 0 || p.flat.length > 0) : [];
}

// ---- RG7 ----

/** A bound face's smallest cap height on each reference stage, at the production framing (contracts/room-bundle.md
 *  §10's Legibility table): what RG7 holds to the floor. */
export interface FaceCaps {
  /** `<placement>.<role>`, as the index's faces[] names it. */
  readonly face: string;
  /** Its placement's index in scene.yaml's placements, and its live face's role. */
  readonly placement: number;
  readonly role: string;
  readonly readable: boolean;
  readonly atmosphere: boolean;
  readonly max_chars: number | null;
  /** CSS pixels on the reference desktop's and phone's stages; null when no region of it can be measured. */
  readonly desktop: number | null;
  readonly phone: number | null;
  /** RG7's one exemption (FR-052; see `phoneExempt`): the reference phone doesn't hold it to the floor. */
  readonly phone_exempt: boolean;
}

/** Where a region's words come from, as legibility.ts names it: its typeface by `typefaceFor`, for RG7 and RT8. */
export function sourceOf(r: Region): RegionSourceRef {
  if (r.text !== undefined) return { room_text: r.text };
  if (r.resume_titles !== undefined) return { resume_titles: true };
  if (r.ui !== undefined) return { ui: r.ui };
  return { signal: "turn-cost", part: r.part ?? "call" };
}

/** A typeface use's cap ratio, as the index's typefaces[] carries it (contracts/room-bundle.md §3.1). */
export type CapRatio = Pick<Typeface, "use" | "cap_ratio">;

/** The scene's look's typefaces, read after fonts.lock's check (typefaces.ts), each cap ratio to 1e-6 as the index's
 *  typefaces[] carries it, so RG7, the report, and the page measure with one ratio; none while an RT10 finding stands on
 *  the look, which is the one to fix. */
export function lookTypefaces(room: LoadedRoom, tree: TreeReader): readonly Typeface[] {
  const file = room.looks.find((l) => l.value.id === room.scene?.value.look);
  if (!file) return [];
  const read = readTypefaces(tree, [{ file: file.file, typefaces: file.value.typefaces }]).looks[0]?.typefaces ?? [];
  return read.map((t) => ({ ...t, cap_ratio: onGrid(t.cap_ratio, 1e6) }));
}

/** A region's cap height on its face, in the face's units at scale 1: its outline's for a sign, else its typeface's cap
 *  ratio times the glyph size its grid gives; null when either is unknown. */
function capOf(
  room: LoadedRoom,
  face: FaceGeometry,
  r: Region,
  ratios: ReadonlyMap<TypefaceUse, number>,
): number | null {
  // The loader holds each region to its renderer's grid.
  const region = { rect: r.rect, renderer: r.renderer, grid: (r.grid ?? null) as Grid | null };
  if (r.renderer === "sign" || r.renderer === "print") {
    const outline = room.outlines.find((o) => o.value.sign === r.text);
    return outline ? regionCap(face, region, { outline: outline.value }) : null;
  }
  const use = typefaceFor(r.renderer, sourceOf(r));
  const ratio = use === null ? undefined : ratios.get(use);
  return ratio === undefined ? null : regionCap(face, region, { capRatio: ratio });
}

/**
 * RG7's one exemption, the one function that holds it (spec.md, FR-052; contracts/room-data-files.md §13.3): a readable
 * face whose regions are all bound to the turn-cost signal (the neon sign's counters), whose figures the text copy's
 * "Around the room" also carries, may fall under the floor on the reference phone alone; the reference desktop holds
 * it to the floor. It is the face's own binding that counts, never what its piece's other faces carry: a word face
 * beside the counters, or a face with a word region and a counter region, is held to the floor on both stages.
 */
function phoneExempt(live: LiveFace, binding: FaceBinding): boolean {
  return (
    live.readable &&
    !binding.atmosphere &&
    binding.regions.length > 0 &&
    binding.regions.every((r) => r.signal === "turn-cost")
  );
}

/** Each bound face of each placement whose piece has it, in scene order, measured where its placement resolves. */
function measureFaces(
  g: Geometry,
  typefaces: readonly CapRatio[],
  reference: readonly ReferenceView[] = g.reference,
): FaceCaps[] {
  const ratios = new Map(typefaces.map((t) => [t.use, t.cap_ratio]));
  const out: FaceCaps[] = [];
  g.scene.value.placements.forEach((p, i) => {
    const entry = g.pieces.get(p.piece);
    // A second placement of one ID is RI2's: the resolver places the first.
    const model = g.index.get(p.id) === i ? g.resolved.model.get(p.id) : undefined;
    for (const [role, binding] of Object.entries(p.faces ?? {})) {
      const live = entry?.live_faces.find((f) => f.role === role);
      if (!live) continue;
      const face = faceOf(live);
      const regions: CapRegion[] = binding.regions.flatMap((r) => {
        const cap = capOf(g.room, face, r, ratios);
        return cap === null ? [] : [{ rect: r.rect, cap }];
      });
      const [desktop, phone] = reference.map(({ stage, camera }) =>
        model && regions.length > 0 ? smallestCapPx(model, face, regions, camera, stage) : null,
      );
      out.push({
        face: `${p.id}.${role}`,
        placement: i,
        role,
        readable: live.readable,
        atmosphere: binding.atmosphere,
        max_chars: binding.max_chars ?? null,
        desktop: desktop ?? null,
        phone: phone ?? null,
        phone_exempt: phoneExempt(live, binding),
      });
    }
  });
  return out;
}

/** Each bound face's smallest cap height on both reference stages at the production framing, in scene order, as RG7
 *  measures it, from each typeface use's cap ratio as the index's typefaces[] carries it (`lookTypefaces`): for the
 *  report's Legibility table, which sets each beside the floor (contracts/room-bundle.md §10). A text region whose use
 *  has no ratio there is left out of its face's measure. */
export function faceCaps(g: Geometry | null, typefaces: readonly CapRatio[]): FaceCaps[] {
  return g ? measureFaces(g, typefaces) : [];
}

/** The characters an atmosphere face draws from the data: its blocks' lines but pending ones, its outlines' words, and
 *  its UI words. */
function characters(room: LoadedRoom, binding: FaceBinding): number {
  const count = (s: string): number => [...s].length;
  let n = 0;
  for (const r of binding.regions) {
    const block = r.text === undefined ? undefined : room.blocks.find((b) => b.value.block === r.text);
    for (const line of block?.value.lines ?? []) if (!line.pending) n += count(line.text);
    const outline = r.text === undefined ? undefined : room.outlines.find((o) => o.value.sign === r.text);
    if (outline) n += count(outline.value.words);
    const words = room.ui?.value.words ?? {};
    for (const key of r.ui ?? []) {
      const word = has(words, key) ? words[key] : undefined;
      if (word !== undefined) n += count(typeof word === "string" ? word : word.text);
    }
  }
  return n;
}

/** RG7: on either reference stage, a bound face whose smallest cap height is under the floor and isn't atmosphere,
 *  but a phone-exempt face on the reference phone (`phoneExempt`); atmosphere on a face the catalog marks readable;
 *  an atmosphere face whose words run over its max_chars. */
function legibility(ctx: Context, g: Geometry): void {
  const floor = capsOf(ctx.policy).legibility_floor_css_px;
  for (const f of measureFaces(g, lookTypefaces(ctx.room, ctx.tree))) {
    const at = (...more: string[]): string => ctx.path("placements", f.placement, "faces", f.role, ...more);
    const binding = g.scene.value.placements[f.placement]?.faces?.[f.role];
    if (f.atmosphere) {
      if (f.readable)
        ctx.report("RG7", g.scene.file, at("atmosphere"), "atmosphere on a face the catalog marks readable");
      const chars = binding ? characters(ctx.room, binding) : 0;
      if (f.max_chars !== null && chars > f.max_chars)
        ctx.report(
          "RG7",
          g.scene.file,
          at("max_chars"),
          `its words hold ${chars} characters, over its max_chars of ${f.max_chars}`,
        );
      continue;
    }
    for (const [name, px] of [
      ["desktop", f.desktop],
      ["phone", f.phone],
    ] as const)
      // FR-052's exemption (see phoneExempt): the reference phone alone.
      if (px !== null && px < floor && !(name === "phone" && f.phone_exempt))
        ctx.report(
          "RG7",
          g.scene.file,
          at(),
          `cap height ${tenth(px)} px on the ${name} stage, under the floor of ${floor}`,
        );
  }
  // Spec 024 (Q-R3a): the floor at a 3D dinosaur visit's reference stages too, where the plain visit's holds it; only
  // where the bundle carries the dinosaur's model (page Q247).
  if (!dinosaurVisit(ctx)) return;
  const typefaces = lookTypefaces(ctx.room, ctx.tree);
  const plainCaps = new Map(measureFaces(g, typefaces).map((f) => [f.face, f] as const));
  for (const f of measureFaces(g, typefaces, g.referenceEat)) {
    if (f.atmosphere) continue;
    const plain = plainCaps.get(f.face);
    for (const [name, px, before] of [
      ["desktop", f.desktop, plain?.desktop ?? null],
      ["phone", f.phone, plain?.phone ?? null],
    ] as const) {
      const under = (v: number | null): boolean => v !== null && v < floor && !(name === "phone" && f.phone_exempt);
      if (under(px) && !under(before))
        ctx.report(
          "RG7",
          g.scene.file,
          ctx.path("placements", f.placement, "faces", f.role),
          `cap height ${tenth(px as number)} px on the ${name} stage for a 3D dinosaur visit, under the floor of ${floor}`,
        );
    }
  }
}

// ---- RG8 ----

/** RG8's measure for two poses of a switch its cases show (contracts/room-data-files.md §13.3; contracts/room-bundle.md
 *  §10's Switches table): the largest on-screen distance any part moves between them, or the size of a cue their glow
 *  levels add, such as a charge light, on each reference stage at the production framing. Never a finding: the
 *  report flags a pair under the floor, and the text copy always carries the switch's state. */
export interface PoseSeparation {
  /** The switch's index in scene.yaml's switches, and its ID. */
  readonly switch: number;
  readonly id: string;
  /** The two poses, in the order the switch gives them. */
  readonly poses: readonly [string, string];
  /** CSS pixels on the reference desktop's and phone's stages. */
  readonly desktop: number;
  readonly phone: number;
  /** `under the floor` when either stage's is. */
  readonly status: "apart" | "under the floor";
}

/** What moves with a pose: the corners of the piece's bounds, its set model's measured ones or the expected ones at its
 *  stylized scale, and the cable's run, in the world; and the glow levels it sets on other placements, by placement and
 *  glow. */
interface Parts {
  readonly points: readonly Vec3[];
  readonly glows: ReadonlyMap<string, number>;
}

const glowKey = (placement: string, glow: string): string => `${placement}\n${glow}`;

/** The cable's run with the lead's end where a pose puts it; null without a cable, or with an anchor that doesn't
 *  resolve. */
function runAt(g: Geometry, sw: Switch, piece: CatalogEntry, world: Mat4): CableRun | null {
  const c = sw.cable;
  const lead = c && anchorOf(piece, c.from);
  if (!c || !lead) return null;
  const to = anchorFrame(g, c.to);
  const rest = c.rest ? anchorFrame(g, c.rest) : null;
  if (!to || (c.rest && !rest)) return null;
  return cableRun({
    from: origin(anchorWorld(world, piece.stylized_scale, lead)),
    to: origin(to),
    sag: c.sag,
    radius: c.radius,
    scale: piece.stylized_scale,
    drop: c.drop,
    rest: rest ? restPlane(rest) : null,
  });
}

/** A pose's parts; null when its mount doesn't resolve. */
function partsOf(g: Geometry, sw: Switch, piece: CatalogEntry, name: string): Parts | null {
  const pose = has(sw.poses, name) ? sw.poses[name] : undefined;
  const world = pose && mountedWorld(g, pose.mount);
  if (!pose || !world) return null;
  const measured = g.set.get(sw.piece);
  const points = measured
    ? corners(measured).map((c) => transformPoint(world, c))
    : corners(piece.origin.bounds).map((c) => transformPoint(modelOf(world, piece.stylized_scale), c));
  points.push(...(runAt(g, sw, piece, world)?.points ?? []));
  return { points, glows: new Map(pose.glows.map((x) => [glowKey(x.placement, x.glow), x.level])) };
}

/** The largest distance on a stage between a part's two places, or a cue's size: a glow whose level differs, its
 *  diameter on screen times the difference. */
function separation(g: Geometry, a: Parts, b: Parts, view: Projector, stage: Stage): number {
  const css = (p: Vec3): readonly [number, number] => toStage(view.project(p), stage);
  const apart = (p: Vec3, q: Vec3): number => {
    if (!(view.depth(p) > 0) || !(view.depth(q) > 0)) return 0;
    const [[x0, y0], [x1, y1]] = [css(p), css(q)];
    return Math.hypot(x1 - x0, y1 - y0);
  };
  let most = 0;
  a.points.forEach((p, k) => {
    const q = b.points[k];
    if (q) most = Math.max(most, apart(p, q));
  });
  for (const key of new Set([...a.glows.keys(), ...b.glows.keys()])) {
    const [placement, name] = key.split("\n") as [string, string];
    const on = placed(g, placement);
    const glow = on?.entry.glows.find((x) => x.id === name);
    if (!on || !glow) continue;
    const change = Math.abs((a.glows.get(key) ?? glow.level) - (b.glows.get(key) ?? glow.level));
    // A path glow's cue is its path's span (spec 014): its points' bounds, the widest across, at the stylized scale.
    const path = glow.path ?? [];
    const span =
      path.length > 0
        ? Math.max(...path.map((p) => p[0])) - Math.min(...path.map((p) => p[0])) + 2 * (glow.spread ?? 0)
        : 0;
    const centre = transformPoint(on.model, glow.at ?? path[0] ?? [0, 0, 0]);
    const r = ((glow.radius ?? span / 2) as number) * on.entry.stylized_scale;
    most = Math.max(most, change * apart([centre[0] - r, centre[1], centre[2]], [centre[0] + r, centre[1], centre[2]]));
  }
  return most;
}

/** RG8's measures, which the report prints: for each switch, every two poses a tier value shows, through its case or
 *  the default, in the order the switch gives its poses, apart by the floor of main's caps (or 9) on both reference
 *  stages, or under it. */
export function poseSeparations(g: Geometry | null, policy: RoomPolicy): PoseSeparation[] {
  if (!g) return [];
  const floor = capsOf(policy).legibility_floor_css_px;
  const views = g.reference.map(({ stage, camera }) => ({ stage, view: projector(camera, stage.w / stage.h) }));
  const out: PoseSeparation[] = [];
  g.scene.value.switches.forEach((sw, i) => {
    const piece = g.pieces.get(sw.piece);
    if (!piece) return;
    const shows = new Set(TIER_VALUES.map((value) => (has(sw.cases, value) ? sw.cases[value] : sw.default)));
    const shown = Object.keys(sw.poses).filter((name) => shows.has(name));
    const parts = new Map(shown.map((name) => [name, partsOf(g, sw, piece, name)]));
    shown.forEach((a, k) => {
      for (const b of shown.slice(k + 1)) {
        const [pa, pb] = [parts.get(a), parts.get(b)];
        if (!pa || !pb) continue;
        const [desktop = 0, phone = 0] = views.map(({ stage, view }) => separation(g, pa, pb, view, stage));
        const status = desktop >= floor && phone >= floor ? "apart" : "under the floor";
        out.push({ switch: i, id: sw.id, poses: [a, b], desktop, phone, status });
      }
    });
  });
  return out;
}

// ---- RG9 ----

/** Two rectangles that share some area, within EPS; touching edges don't. */
const overlaps = (a: readonly number[], b: readonly number[]): boolean => {
  const [ax, ay, aw, ah] = a as [number, number, number, number];
  const [bx, by, bw, bh] = b as [number, number, number, number];
  return ax < bx + bw - EPS && bx < ax + aw - EPS && ay < by + bh - EPS && by < ay + ah - EPS;
};

/** RG9: a region outside its face, or over another region of the same face. */
function regions(ctx: Context, g: Geometry): void {
  g.scene.value.placements.forEach((p, i) => {
    for (const [role, binding] of Object.entries(p.faces ?? {})) {
      const at = (...more: (string | number)[]): string => ctx.path("placements", i, "faces", role, "regions", ...more);
      binding.regions.forEach((r, k) => {
        const [x, y, w, h] = r.rect;
        if (x + w > 1 + EPS || y + h > 1 + EPS)
          ctx.report("RG9", g.scene.file, at(k, "rect"), "outside its face: x + w or y + h over 1");
        binding.regions.slice(0, k).forEach((q, j) => {
          if (overlaps(q.rect, r.rect)) ctx.report("RG9", g.scene.file, at(k), `overlaps regions[${j}]`);
        });
      });
    }
  });
}

// ---- What the bundle carries ----

/** Each resolved placement's framed box by its ID (contracts/room-data-files.md §13.3), as RG4 to RG8 measure it and the
 *  3D part's frame_box carries it: a set model's measured bounds through its world transform, or the catalog's expected
 *  bounds at the stylized scale through it, raised where it shows a stand-in with a label. */
export function frameBoxes(ctx: Context): ReadonlyMap<string, Box> {
  return geometryOf(ctx)?.boxes ?? new Map();
}

/** Each selectable's members in the 2D drawing, in scene order: each member's frame box projected through framing(1.6)
 *  into the 320 × 200 view box, its rectangle to 1e-4 view-box units and its depth to 1e-6 m, as the index's flat hits
 *  carry them (contracts/room-bundle.md §3.1), so RG6 holds to their cores the rectangles the 2D room picks from. A
 *  member that doesn't resolve, or has a corner behind the camera, is left out. */
export function flatMembers(g: Geometry): MemberRect[][] {
  return g.scene.value.selectables.map((selectable) =>
    selectable.members.flatMap((m) => {
      const box = g.boxes.get(m);
      const member = box && memberRect(box, g.flat, FLAT_VIEW);
      if (!member) return [];
      const [x, y, w, h] = member.rect;
      const rect = [onGrid(x, 1e4), onGrid(y, 1e4), onGrid(w, 1e4), onGrid(h, 1e4)] as const;
      return [{ rect, depth: onGrid(member.depth, 1e6) }];
    }),
  );
}

/** Spec 014 (FR-003; PD-23): the two figures' framed boxes in the 2D drawing's view box, the twin's then the visitor's,
 *  projected as the hits are and on the bundle's grid: the index's `flat.figures`, which the 2D protector keeps clear. */
export function flatFigures(g: Geometry): [number, number, number, number][] {
  return (["twin", "visitor"] as const).flatMap((role): [number, number, number, number][] => {
    const p = g.scene.value.placements.find((x) => x.role === role);
    const box = p && g.boxes.get(p.id);
    const member = box && memberRect(box, g.flat, FLAT_VIEW);
    if (!member) return [];
    const [x, y, w, h] = member.rect;
    return [[onGrid(x, 1e4), onGrid(y, 1e4), onGrid(w, 1e4), onGrid(h, 1e4)]];
  });
}

/** A bound face's canvas size and its largest on-screen size at the reference stages: the index's faces[] px and
 *  screen_css (contracts/room-bundle.md §3.1), by which RK3 sizes its canvas on the reference phone (FR-054). */
export interface FaceScreen {
  readonly placement: string;
  readonly role: string;
  readonly px: readonly [number, number];
  /** In CSS pixels to 1e-4: the longer of its top and bottom edges, and of its two sides, on either reference stage; null
   *  where a corner falls behind a camera, or its placement doesn't resolve. */
  readonly screen: readonly [number, number] | null;
}

/** A face's on-screen size on a stage, in CSS pixels: the longer of its top and bottom edges, and of its two sides;
 *  null where a corner isn't in front of the camera. */
function screenSize(model: Mat4, face: FaceGeometry, camera: Camera, stage: Stage): readonly [number, number] | null {
  const view = projector(camera, stage.w / stage.h);
  const points = FACE_CORNERS.map(([u, v]) => transformPoint(model, facePoint(face, u, v)));
  if (points.some((p) => !(view.depth(p) > camera.near))) return null;
  // Its corners in reading order: top left, top right, bottom left, bottom right.
  const css = points.map((p) => toStage(view.project(p), stage));
  const apart = (i: number, j: number): number => {
    const [a, b] = [css[i], css[j]];
    return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : Number.NaN;
  };
  return [Math.max(apart(0, 1), apart(2, 3)), Math.max(apart(0, 2), apart(1, 3))];
}

/** Each bound face of each placement, the first of its ID, in scene order, with its sizes, as the index lists them. */
export function faceScreens(g: Geometry): FaceScreen[] {
  const out: FaceScreen[] = [];
  for (const [id, i] of g.index) {
    const p = g.scene.value.placements[i];
    const entry = p && g.pieces.get(p.piece);
    const model = g.resolved.model.get(id);
    for (const role of Object.keys(p?.faces ?? {})) {
      // A binding to a role its piece lacks is RI4's.
      const live = entry?.live_faces.find((f) => f.role === role);
      if (!live) continue;
      const sizes = g.reference.map(({ stage, camera }) =>
        model ? screenSize(model, faceOf(live), camera, stage) : null,
      );
      const largest = (k: 0 | 1): number => onGrid(Math.max(...sizes.map((s) => s?.[k] ?? 0)), 1e4);
      const screen = sizes.every((s) => s !== null) ? ([largest(0), largest(1)] as const) : null;
      out.push({ placement: id, role, px: live.px, screen });
    }
  }
  return out;
}

/** RG: every rule of the family, in its order; RG3 is the loader's, and RG8 the report's. */
export const rg: Family = (ctx) => {
  bounds(ctx);
  const g = geometryOf(ctx);
  if (!g) return;
  cycles(ctx, g);
  framedSet(ctx, g);
  inView(ctx, g);
  spacing(ctx, g);
  legibility(ctx, g);
  regions(ctx, g);
};
