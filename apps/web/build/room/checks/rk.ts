// RK, budgets and caps (spec 004; FR-013, FR-052 to FR-054, SC-006; Amendment C7; R-13, R-24, R-25, R-37;
// contracts/room-data-files.md §13.8, §15; contracts/plain-model-fit.md §7, §8; contracts/room-bundle.md §2). The caps
// are main's `per_asset.room`, or FR-053's starting figures while it is absent or malformed (policy.ts's `capsOf`):
// - RK1, a catalog budget above the caps, since agents never raise a cap;
// - RK2, a model over its piece's budget by §7's measures (rx.ts's `modelChecks` and `overBudget`): its bytes as served
//   (a model's .glb.gz, pako at level 9; a card as stored), its triangles, its largest texture side, and its texture
//   memory. It is lenient: a lenient build prints it prefixed `warn`, and the piece keeps its stand-in;
// - RK3, the scene's texture memory on the reference phone over `scene_texture_bytes`, by class: each piece the scene
//   places, by a placement that isn't a figure's or by a switch, its budget's `texture_bytes` once (a set model never
//   exceeds it), split into image cards (a piece whose card is set) and models (the rest); the figures once each, by
//   their models as measured: the twin's, every model under assets/twin/ together, and the largest visitor avatar's,
//   each folder of assets/visitors/ one avatar, read with the same reader, a model that can't be read counting 0 and
//   counted in `unread`, and a figure with no model counting 0, both of which the report notes; and each bound live
//   face's canvas, min(px, its largest on-screen size at the reference stages × the phone's pixel ratio) on each side,
//   rounded down, so it is at most that (FR-054), as the room sizes it (R-37);
// - RK4, a malformed caps.json: each of policy.ts's problems, by its path in the file.
// RK1, RK3, and RK4 fail every build. A reason names keys and figures, never a value from the data.
//
// A figure's piece isn't counted by its budget: the figure shows an avatar, which RK3 measures, and RI8 gives its piece
// no model for that budget to bound (plan.md §10). The on-screen sizes are RG's, the index's screen_css (rg.ts's
// `faceScreens`), at the one production framing that the checks and the bundle share (§13.3): so RK3 counts the canvases
// the index sizes. `sceneTextureTotal` is RK3's sum over a framing and a tree, which the report prints (report.ts).
import { REFERENCE_PHONE } from "../../../src/room/compose/stages";
import { fit, textureMemory } from "../../../src/room/glb/fit";
import type { FitInput } from "../../../src/room/glb/fit";
import { count } from "../../../src/room/glb/rules";
import type { Loaded } from "../load";
import { CAPS_PATH, capsOf } from "../policy";
import type { CatalogEntry } from "../schema";
import type { Tree } from "../source";
import type { Context, Family } from "./family";
import { faceScreens, geometryOf } from "./rg";
import type { Geometry } from "./rg";
import { modelChecks, overBudget } from "./rx";

export const TWIN_DIR = "assets/twin";
export const VISITORS_DIR = "assets/visitors";

/** A figure's model is read by the fit check's reader, for its texture memory alone. */
const NO_FIT: FitInput = { bounds: { min: [0, 0, 0], max: [0, 0, 0] }, faces: [], smallPropTexturePx: null };

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** A bound live face's canvas on the reference phone (FR-054). */
export interface FaceCanvas {
  readonly placement: string;
  readonly role: string;
  readonly px: readonly [number, number];
  /** Its largest on-screen size at the reference stages, in CSS pixels, the index's screen_css; null where a corner
   *  falls behind the camera or its placement doesn't resolve, so the canvas is its px, as the index's screen_css, its
   *  px there, gives it to the runtime. */
  readonly screen: readonly [number, number] | null;
  /** min(px, ⌊screen × the phone's pixel ratio⌋) on each side. */
  readonly canvas: readonly [number, number];
  readonly bytes: number;
}

/** RK3's total by class, each by ⌊16 · w · h / 3⌋. */
export interface SceneTextureMemory {
  /** Each piece placed by a placement that isn't a figure's, or by a switch: its budgeted texture_bytes, once a piece. */
  readonly pieces: number;
  /** Of `pieces`, the pieces whose model is a set model, or a stand-in. */
  readonly models: number;
  /** Of `pieces`, the pieces whose image card is set. */
  readonly cards: number;
  /** Every model under assets/twin/, measured together; null while it holds no model, which the report notes. */
  readonly twin: number | null;
  /** The largest visitor avatar's models, measured together; null while assets/visitors/ holds no model, which the
   *  report notes. */
  readonly visitor: number | null;
  /** The figures' models RX1 or RX2 refuses, or the tree can't read, each counted 0, which the report notes. */
  readonly unread: { readonly twin: number; readonly visitor: number };
  readonly figures: number;
  readonly canvases: number;
  /** In scene order. */
  readonly faces: readonly FaceCanvas[];
  readonly total: number;
}

// --------------------------------------------------------------------------------------------------------------------
// The live faces' canvases, at the production framing
// --------------------------------------------------------------------------------------------------------------------
/** Each bound live face's canvas at the reference phone's pixel ratio, in the index's faces[] order: min(px, its
 *  screen_css × the ratio) on each side, rounded down, so it is at most that (contracts/room-bundle.md §3.1). */
export function faceCanvases(g: Geometry | null): FaceCanvas[] {
  return (g ? faceScreens(g) : []).map(({ placement, role, px, screen }) => {
    const side = (i: 0 | 1): number =>
      Math.min(px[i], screen === null ? Infinity : Math.floor(screen[i] * REFERENCE_PHONE.dpr));
    const canvas: [number, number] = [side(0), side(1)];
    return { placement, role, px, screen, canvas, bytes: textureMemory(canvas[0], canvas[1]) };
  });
}

// --------------------------------------------------------------------------------------------------------------------
// The figures
// --------------------------------------------------------------------------------------------------------------------
/** A figure's models, measured: their texture memory together, how many there are, and how many of them can't be
 *  read, each counted 0. */
interface Models {
  readonly bytes: number;
  readonly count: number;
  readonly unread: number;
}
const NO_MODELS: Models = { bytes: 0, count: 0, unread: 0 };
const together = (a: Models, b: Models): Models => ({
  bytes: a.bytes + b.bytes,
  count: a.count + b.count,
  unread: a.unread + b.unread,
});

/** The models at `path`: the file itself where it is a .glb, else each .glb under the folder, at any depth, in the
 *  tree's order. A .glb is read with the fit check's reader for its texture memory alone, by §7's measure; one that RX1
 *  or RX2 refuses, or that the tree lists but can't read and that holds nothing, can't be read, and counts 0. */
function modelsAt(tree: Tree, path: string): Models {
  const model = path.endsWith(".glb");
  const bytes = model ? tree.read(path) : null;
  if (bytes !== null) {
    const memory = fit(bytes, NO_FIT, { file: path, gzipBytes: 0 }).measures.textureBytes;
    return memory === null ? { bytes: 0, count: 1, unread: 1 } : { bytes: memory, count: 1, unread: 0 };
  }
  const entries = tree.list(path);
  if (entries.length === 0) return model ? { bytes: 0, count: 1, unread: 1 } : NO_MODELS;
  return entries.map((name) => modelsAt(tree, `${path}/${name}`)).reduce(together, NO_MODELS);
}

/** The twin's models together, and the largest visitor avatar's, each folder of assets/visitors/ (or a model directly
 *  in it) one avatar; null for either while it holds no model; and how many of either's models can't be read. */
function figures(tree: Tree): Pick<SceneTextureMemory, "twin" | "visitor" | "unread"> {
  const twin = modelsAt(tree, TWIN_DIR);
  const avatars = tree
    .list(VISITORS_DIR)
    .map((name) => modelsAt(tree, `${VISITORS_DIR}/${name}`))
    .filter((avatar) => avatar.count > 0);
  return {
    twin: twin.count > 0 ? twin.bytes : null,
    visitor: avatars.length > 0 ? Math.max(...avatars.map((avatar) => avatar.bytes)) : null,
    unread: { twin: twin.unread, visitor: sum(avatars.map((avatar) => avatar.unread)) },
  };
}

/** RK3's total, by class, at a production framing and over a tree: the scene's texture memory on the reference phone.
 *  The pieces are the framing's scene and catalog, a card set where the framing's `set` holds the piece with no bounds,
 *  the figures the tree's, and the canvases the framing's faces'. RK3 sums it at RG's framing, and the report prints it
 *  at the bundle's, which is RG's in any build whose outputs are used (emit.ts). */
export function sceneTextureTotal(g: Geometry | null, tree: Tree): SceneTextureMemory {
  const scene = g?.scene.value;
  const placed = new Set([
    ...(scene?.placements ?? []).flatMap((p) => (p.role === undefined ? [p.piece] : [])),
    ...(scene?.switches ?? []).map((s) => s.piece),
  ]);
  let [models, cards] = [0, 0];
  for (const id of placed) {
    const budget = g?.pieces.get(id)?.budget.texture_bytes ?? 0;
    if (g?.set.get(id) === null) cards += budget;
    else models += budget;
  }
  const { twin, visitor, unread } = figures(tree);
  const faces = faceCanvases(g);
  const canvases = sum(faces.map((f) => f.bytes));
  const pieces = models + cards;
  const figureBytes = (twin ?? 0) + (visitor ?? 0);
  return {
    pieces,
    models,
    cards,
    twin,
    visitor,
    unread,
    figures: figureBytes,
    canvases,
    faces,
    total: pieces + figureBytes + canvases,
  };
}

/** RK3's total, by class, for a compose: at RG's production framing, its figures from the compose's tree. */
export function sceneTextureMemory(ctx: Context): SceneTextureMemory {
  return sceneTextureTotal(geometryOf(ctx), ctx.tree);
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
