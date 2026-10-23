// RK, budgets and caps (spec 004; FR-013, FR-052 to FR-054, SC-006; Amendment C7; R-13, R-24, R-25, R-37;
// contracts/room-data-files.md §13.8, §15; contracts/plain-model-fit.md §7, §8; contracts/room-bundle.md §2). The caps
// are main's `per_asset.room`, or FR-053's starting figures while it is absent or malformed (policy.ts's `capsOf`):
// - RK1, a catalog budget above the caps, since agents never raise a cap;
// - RK2, a model over its piece's budget by §7's measures (rx.ts's `modelChecks` and `overBudget`): its bytes as served
//   (a model's .glb.gz, pako at level 9; a card as stored), its triangles, its largest texture side, and its texture
//   memory. It is lenient: a lenient build prints it prefixed `warn`, and the piece keeps its stand-in;
// - RK3, the scene's texture memory on the reference phone over `scene_texture_bytes`, by class: each piece the scene
//   places, by a placement or a switch, its budget's `texture_bytes` once (a set model never exceeds it); the twin's
//   and the largest visitor avatar's measured memory, read from assets/twin/ and assets/visitors/ with the same reader,
//   0 while they hold no model; and each bound live face's canvas, min(px, its largest on-screen size at the reference
//   stages × the phone's pixel ratio) on each side, rounded down, so it is at most that (FR-054), as the room sizes it
//   (R-37);
// - RK4, a malformed caps.json: each of policy.ts's problems, by its path in the file.
// RK1, RK3, and RK4 fail every build. A reason names keys and figures, never a value from the data.
//
// The on-screen sizes are RG's, the index's screen_css (rg.ts's `faceScreens`), at the one production framing that the
// checks and the bundle share (§13.3): so RK3 counts the canvases the index sizes.
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
   *  falls behind the camera or its placement doesn't resolve, so the canvas is its px. */
  readonly screen: readonly [number, number] | null;
  /** min(px, ⌊screen × the phone's pixel ratio⌋) on each side. */
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
  const faces = faceCanvases(geometryOf(ctx));
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
