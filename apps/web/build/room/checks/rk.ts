// RK, budgets and caps (spec 004; FR-013, FR-052 to FR-054, SC-006; Amendment C7; R-13, R-24, R-25, R-37;
// contracts/room-data-files.md §13.8, §15; contracts/plain-model-fit.md §7, §8; contracts/room-bundle.md §2). The caps
// are main's `per_asset.room`, or FR-053's starting figures while it is absent or malformed (policy.ts's `capsOf`):
// - RK1, a catalog budget above the caps, since agents never raise a cap;
// - RK2, a model over its piece's budget by §7's measures (rx.ts's `modelChecks`): its bytes as served (a model's
//   .glb.gz, pako at level 9; a card as stored), its triangles, its largest texture side, and its texture memory. It is
//   lenient: a lenient build prints it prefixed `warn`, and the piece keeps its stand-in;
// - RK3, the scene's texture memory on the reference phone over `scene_texture_bytes`, by class: each piece the scene
//   places, by a placement or a switch, its budget's `texture_bytes` once (a set model never exceeds it); the twin's
//   and the largest visitor avatar's measured memory, read from assets/twin/ and assets/visitors/ with the same reader,
//   0 while they hold no model; and each bound live face's canvas, min(px, its largest on-screen size at the reference
//   stages × the phone's pixel ratio) on each side (FR-054), as the room sizes it (R-37);
// - RK4, a malformed caps.json: each of policy.ts's problems, by its path in the file.
// RK1, RK3, and RK4 fail every build. A reason names keys and figures, never a value from the data.
//
// The on-screen sizes are measured at the production framing (§13.3): the framed placements' boxes, each the expected
// bounds at the stylized scale or a set model's measured bounds (FR-019), in the world, raised for a stand-in's label
// where its placement has one, framed by the kernel at each reference stage's aspect. A model is set when main's caps
// exist and it has no RX or RK2 finding. A size is quantized to 1e-4 CSS pixels, as the index carries it (R-12).
import { framing, withLabel } from "../../../src/room/compose/framing";
import type { Box } from "../../../src/room/compose/framing";
import { facePoint } from "../../../src/room/compose/legibility";
import type { FaceGeometry } from "../../../src/room/compose/legibility";
import { transformPoint } from "../../../src/room/compose/math";
import type { Mat4, Vec3 } from "../../../src/room/compose/math";
import { resolveMounts } from "../../../src/room/compose/mount";
import type { MountPiece, Resolved } from "../../../src/room/compose/mount";
import { projector, toStage } from "../../../src/room/compose/project";
import type { Camera } from "../../../src/room/compose/project";
import { REFERENCE_DESKTOP, REFERENCE_PHONE } from "../../../src/room/compose/stages";
import type { Stage } from "../../../src/room/compose/stages";
import { fit, textureMemory } from "../../../src/room/glb/fit";
import type { FitInput } from "../../../src/room/glb/fit";
import { count } from "../../../src/room/glb/rules";
import type { Loaded } from "../load";
import { CAPS_PATH, capsOf } from "../policy";
import type { CatalogEntry, Placement } from "../schema";
import type { Tree } from "../source";
import type { Context, Family } from "./family";
import { modelChecks } from "./rx";
import type { ModelCheck } from "./rx";

export const TWIN_DIR = "assets/twin";
export const VISITORS_DIR = "assets/visitors";

/** A live face's up where its catalog entry leaves it out: +Y (data-model.md §4). */
const UP: Vec3 = [0, 1, 0];
/** A face's corners by their texture coordinates, in reading order: top-left, top-right, bottom-left, bottom-right. */
const CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;
/** A figure's model is read by the fit check's reader, for its texture memory alone. */
const NO_FIT: FitInput = { bounds: { min: [0, 0, 0], max: [0, 0, 0] }, faces: [], smallPropTexturePx: null };

const quantize = (n: number): number => Math.round(n * 1e4) / 1e4;
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** A bound live face's canvas on the reference phone (FR-054). */
export interface FaceCanvas {
  readonly placement: string;
  readonly role: string;
  readonly px: readonly [number, number];
  /** Its largest on-screen size at the reference stages, in CSS pixels; null where a corner falls behind the camera or
   *  its placement doesn't resolve, so the canvas is its px. */
  readonly screen: readonly [number, number] | null;
  /** min(px, ⌈screen × the phone's pixel ratio⌉) on each side. */
  readonly canvas: readonly [number, number];
  readonly bytes: number;
}

/** RK3's total by class, each by ⌊16 · w · h / 3⌋. */
export interface SceneTextureMemory {
  /** Each placed piece's budgeted texture_bytes, once a piece. */
  readonly pieces: number;
  /** Measured; null while assets/twin/ holds no model, which the report notes. */
  readonly twin: number | null;
  /** The largest visitor avatar's, measured; null while assets/visitors/ holds no model, which the report notes. */
  readonly visitor: number | null;
  readonly figures: number;
  readonly canvases: number;
  /** In scene order. */
  readonly faces: readonly FaceCanvas[];
  readonly total: number;
}

// --------------------------------------------------------------------------------------------------------------------
// RK2's measures against a budget, and the models they leave set
// --------------------------------------------------------------------------------------------------------------------
/** RK2's reasons: each of a model's measures over its piece's budget. */
function overBudget(check: ModelCheck): string[] {
  const m = check.measures;
  if (m === null) return [];
  const b = check.entry.value.budget;
  const over = (measured: string, budget: number): string =>
    `${measured}, over the piece's budget of ${count(budget)}; the piece keeps its stand-in`;
  const served =
    check.kind === "card" ? `${count(m.served)} bytes, served as stored` : `${count(m.served)} gzip-9 bytes`;
  const out: string[] = [];
  if (m.served > b.gzip_bytes) out.push(over(served, b.gzip_bytes));
  if (m.triangles !== null && m.triangles > b.triangles) out.push(over(`${count(m.triangles)} triangles`, b.triangles));
  if (m.maxTexturePx !== null && m.maxTexturePx > b.texture_px)
    out.push(over(`a texture side of ${count(m.maxTexturePx)} pixels`, b.texture_px));
  if (m.textureBytes > b.texture_bytes)
    out.push(over(`${count(m.textureBytes)} bytes of texture memory`, b.texture_bytes));
  return out;
}

/** The measured bounds of each piece whose model is set: main's caps exist, and it has no RX or RK2 finding. */
function setModels(ctx: Context): Map<string, Box> {
  const out = new Map<string, Box>();
  if (ctx.policy.caps === null) return out;
  for (const check of modelChecks(ctx)) {
    const bounds = check.measures?.bounds;
    if (bounds && check.findings.length === 0 && overBudget(check).length === 0) out.set(check.entry.value.id, bounds);
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------------------
// The live faces' canvases, at the production framing
// --------------------------------------------------------------------------------------------------------------------
/** The axis-aligned box around `box`'s eight corners through `m`. */
function worldBox(m: Mat4, box: Box): Box {
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    transformPoint(m, [(i & 1 ? box.max : box.min)[0], (i & 2 ? box.max : box.min)[1], (i & 4 ? box.max : box.min)[2]]),
  );
  const extreme = (a: 0 | 1 | 2, pick: (...values: number[]) => number): number => pick(...corners.map((p) => p[a]));
  return {
    min: [extreme(0, Math.min), extreme(1, Math.min), extreme(2, Math.min)],
    max: [extreme(0, Math.max), extreme(1, Math.max), extreme(2, Math.max)],
  };
}

/** A face's on-screen size on a stage, in CSS pixels: the longer of its top and bottom edges, and of its two sides;
 *  null where a corner isn't in front of the camera. */
function screenSize(model: Mat4, face: FaceGeometry, camera: Camera, stage: Stage): [number, number] | null {
  const view = projector(camera, stage.w / stage.h);
  const corners = CORNERS.map(([u, v]) => transformPoint(model, facePoint(face, u, v)));
  if (corners.some((p) => !(view.depth(p) > camera.near))) return null;
  const css = corners.map((p) => toStage(view.project(p), stage));
  const apart = (i: number, j: number): number =>
    Math.hypot((css[i]?.[0] ?? NaN) - (css[j]?.[0] ?? NaN), (css[i]?.[1] ?? NaN) - (css[j]?.[1] ?? NaN));
  return [Math.max(apart(0, 1), apart(2, 3)), Math.max(apart(0, 2), apart(1, 3))];
}

/** The scene's placements, resolved through their mounts, and its pieces by ID (the first of each where two share one,
 *  RI2's to report). */
interface Layout {
  readonly placements: readonly Placement[];
  readonly pieces: ReadonlyMap<string, CatalogEntry>;
  readonly resolved: Resolved;
}

function layoutOf(ctx: Context): Layout | null {
  const scene = ctx.room.scene;
  if (!scene) return null;
  const pieces = new Map<string, CatalogEntry>();
  for (const c of ctx.room.catalog) if (!pieces.has(c.value.id)) pieces.set(c.value.id, c.value);
  const mountPieces: Record<string, MountPiece> = {};
  for (const [id, entry] of pieces) mountPieces[id] = { scale: entry.stylized_scale, anchors: entry.anchors };
  const placements = scene.value.placements;
  const resolved = resolveMounts(
    placements.map((p) => ({
      id: p.id,
      piece: p.piece,
      mount: p.mount ? { on: p.mount.on, anchor: p.mount.anchor } : null,
      offset: p.mount?.offset ?? [0, 0, 0],
      turn: p.mount?.turn ?? { x: 0, y: 0, z: 0 },
    })),
    mountPieces,
  );
  return { placements, pieces, resolved };
}

function boxesOf(ctx: Context, layout: Layout): Map<string, Box> {
  const set = setModels(ctx);
  const out = new Map<string, Box>();
  for (const p of layout.placements) {
    const entry = layout.pieces.get(p.piece);
    const world = layout.resolved.world.get(p.id);
    const model = layout.resolved.model.get(p.id);
    if (!entry || !world || !model || out.has(p.id)) continue;
    const measured = set.get(p.piece);
    if (measured) out.set(p.id, worldBox(world, measured));
    else {
      const box = worldBox(model, entry.origin.bounds);
      out.set(p.id, p.label === undefined ? box : withLabel(box));
    }
  }
  return out;
}

/** Each resolved placement's frame box in the world, by its ID (contracts/room-data-files.md §13.3): its piece's
 *  expected bounds at the stylized scale, its top raised for its stand-in's label where it has one; or its set model's
 *  measured bounds (FR-019). */
export function frameBoxes(ctx: Context): ReadonlyMap<string, Box> {
  const layout = layoutOf(ctx);
  return layout ? boxesOf(ctx, layout) : new Map();
}

/** Each bound live face's canvas at the reference phone's pixel ratio, in scene order. */
function faceCanvases(ctx: Context): FaceCanvas[] {
  const layout = layoutOf(ctx);
  if (!layout) return [];
  const boxes = boxesOf(ctx, layout);
  const framed = layout.placements.flatMap((p) => (p.frame ? (boxes.get(p.id) ?? []) : []));
  const cameras = [REFERENCE_DESKTOP, REFERENCE_PHONE].map(({ stage }) => ({
    stage,
    camera: framing(stage.w / stage.h, framed),
  }));
  const out: FaceCanvas[] = [];
  for (const p of layout.placements) {
    const entry = layout.pieces.get(p.piece);
    const model = layout.resolved.model.get(p.id);
    for (const role of Object.keys(p.faces ?? {})) {
      // A binding to a role its piece lacks is RI4's.
      const face = entry?.live_faces.find((f) => f.role === role);
      if (!face) continue;
      const geometry: FaceGeometry = { at: face.at, size: face.size, facing: face.facing, up: face.up ?? UP };
      const sizes = cameras.map(({ stage, camera }) => (model ? screenSize(model, geometry, camera, stage) : null));
      const screen = sizes.every((s) => s !== null)
        ? ([0, 1].map((i) => quantize(Math.max(...sizes.map((s) => s?.[i] ?? 0)))) as [number, number])
        : null;
      const side = (i: 0 | 1): number =>
        Math.min(face.px[i], screen === null ? Infinity : Math.ceil(screen[i] * REFERENCE_PHONE.dpr));
      const canvas: [number, number] = [side(0), side(1)];
      out.push({ placement: p.id, role, px: face.px, screen, canvas, bytes: textureMemory(canvas[0], canvas[1]) });
    }
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------------------
// The figures
// --------------------------------------------------------------------------------------------------------------------
/** Each .glb under `dir`, at any depth, in the tree's order. */
function modelsUnder(tree: Tree, dir: string): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const name of tree.list(dir)) {
    const path = `${dir}/${name}`;
    const bytes = name.endsWith(".glb") ? tree.read(path) : null;
    if (bytes !== null) out.push(bytes);
    else out.push(...modelsUnder(tree, path));
  }
  return out;
}

/** The texture memory a model's images hold, by §7's measure; 0 where RX1 or RX2 refuses it. */
const memoryOf = (bytes: Uint8Array): number =>
  fit(bytes, NO_FIT, { file: "-", gzipBytes: 0 }).measures.textureBytes ?? 0;

/** The twin's models together, and the largest visitor avatar, each folder of assets/visitors/ (or a model directly in
 *  it) one avatar; null for either while it holds no model. */
function figures(tree: Tree): { twin: number | null; visitor: number | null } {
  const twin = modelsUnder(tree, TWIN_DIR);
  const avatars = tree.list(VISITORS_DIR).flatMap((name) => {
    const path = `${VISITORS_DIR}/${name}`;
    const own = name.endsWith(".glb") ? tree.read(path) : null;
    const models = own !== null ? [own] : modelsUnder(tree, path);
    return models.length > 0 ? [sum(models.map(memoryOf))] : [];
  });
  return {
    twin: twin.length > 0 ? sum(twin.map(memoryOf)) : null,
    visitor: avatars.length > 0 ? Math.max(...avatars) : null,
  };
}

/** RK3's total, by class: the scene's texture memory on the reference phone. */
export function sceneTextureMemory(ctx: Context): SceneTextureMemory {
  const scene = ctx.room.scene?.value;
  const budgets = new Map<string, number>();
  for (const c of ctx.room.catalog) if (!budgets.has(c.value.id)) budgets.set(c.value.id, c.value.budget.texture_bytes);
  const placed = new Set([...(scene?.placements ?? []), ...(scene?.switches ?? [])].map((x) => x.piece));
  const pieces = sum([...placed].map((id) => budgets.get(id) ?? 0));
  const { twin, visitor } = figures(ctx.tree);
  const faces = faceCanvases(ctx);
  const canvases = sum(faces.map((f) => f.bytes));
  const figureBytes = (twin ?? 0) + (visitor ?? 0);
  return { pieces, twin, visitor, figures: figureBytes, canvases, faces, total: pieces + figureBytes + canvases };
}

// --------------------------------------------------------------------------------------------------------------------
// The rules
// --------------------------------------------------------------------------------------------------------------------
/** RK1: each catalog budget against the caps. */
function budgets(ctx: Context): void {
  const caps = capsOf(ctx.policy);
  const whose = ctx.policy.caps === null ? "FR-053's starting figure" : "main's cap";
  const check = (c: Loaded<CatalogEntry>, key: string, value: number, cap: number, unit: string): void => {
    if (value > cap)
      ctx.report(
        "RK1",
        c.file,
        `budget.${key}`,
        `${count(value)} ${unit}, over ${whose} of ${count(cap)}: agents never raise a cap`,
      );
  };
  for (const c of ctx.room.catalog) {
    const b = c.value.budget;
    check(c, "gzip_bytes", b.gzip_bytes, caps.gzip_bytes, "gzip-9 bytes");
    check(c, "triangles", b.triangles, caps.triangles, "triangles");
    if (caps.small_props.includes(c.value.id))
      check(c, "texture_px", b.texture_px, caps.small_prop_texture_px, "pixels a side on a small prop");
    check(c, "texture_bytes", b.texture_bytes, caps.scene_texture_bytes, "bytes of texture memory");
  }
}

/** RK2: each model's measures against its piece's budget. */
function models(ctx: Context): void {
  for (const check of modelChecks(ctx))
    for (const reason of overBudget(check)) ctx.report("RK2", check.file, "-", reason);
}

/** RK3: the scene's texture memory against `scene_texture_bytes`. */
function sceneMemory(ctx: Context): void {
  const scene = ctx.room.scene;
  if (!scene) return;
  const cap = capsOf(ctx.policy).scene_texture_bytes;
  const m = sceneTextureMemory(ctx);
  if (m.total > cap)
    ctx.report(
      "RK3",
      scene.file,
      "-",
      `${count(m.total)} bytes of texture memory on the reference phone, over the scene's cap of ${count(cap)}: ` +
        `${count(m.pieces)} in the pieces' budgets, ${count(m.figures)} in the figures, and ` +
        `${count(m.canvases)} in the live faces' canvases`,
    );
}

/** RK4: what's wrong with main's caps.json, by its path in the file. */
function capsFile(ctx: Context): void {
  for (const p of ctx.policy.caps_problems)
    ctx.report("RK4", CAPS_PATH, p.path, `${p.reason}; the Author's to fix on main`);
}

/** RK: every rule of the family, in its order. */
export const rk: Family = (ctx) => {
  budgets(ctx);
  models(ctx);
  sceneMemory(ctx);
  capsFile(ctx);
};
