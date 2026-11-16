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
//   their models as measured: the twin's, its model assets/twin/twin.glb (spec 016), and the largest visitor avatar's,
//   each folder of assets/visitors/ one avatar, read with the same reader, a model that can't be read counting 0 and
//   counted in `unread`, and a figure with no model counting 0, both of which the report notes; and each bound live
//   face's canvas, min(px, its largest on-screen size at the reference stages × the phone's pixel ratio) on each side,
//   rounded down, so it is at most that (FR-054), as the room sizes it (R-37);
// - RK4, a malformed caps.json: each of policy.ts's problems, by its path in the file;
// - RK5 (spec 009, FR-038), the first visit with both figures' files over main's phase-3 budget: the room's set models
//   and cards as served, the stand-in avatar's bundled files, and the largest other visitor avatar's, by their gzip-9
//   copies, lenient, as RK2 is. Since spec 016 (its FR-046; Amendment M16), where the twin's model is bundled, its
//   served GLBs take the stand-in's place, and the visitor's share is the largest of every visitor folder, the
//   stand-in's among them, as the arrival check's F3 counts it.
// Since spec 009, RK3's twin is the larger of its own model and the stand-in avatar's files, and every visitor avatar
// is counted at its decoded size, at most the scene's texture_px a side, as the room decodes it (its FR-024). Since spec
// 016 (its FR-046; plan.md R-02; Amendment M16), the twin's own is its model alone, assets/twin/twin.glb, at its decoded
// size, at most the twin's texture side (the scene's figures.twin.texture_px, else texture_px), as the room decodes it
// (FR-045); no clip and no other file under assets/twin/ counts, since none is a model the room shows.
// RK1, RK3, and RK4 fail every build. A reason names keys and figures, never a value from the data.
//
// A figure's piece isn't counted by its budget: the figure shows an avatar, which RK3 measures, and RI8 gives its piece
// no model for that budget to bound (plan.md §10). The on-screen sizes are RG's, the index's screen_css (rg.ts's
// `faceScreens`), at the one production framing that the checks and the bundle share (§13.3): so RK3 counts the
// canvases the index sizes. `sceneTextureTotal` is RK3's sum over a framing and a tree, which the report prints.
import { REFERENCE_PHONE } from "../../../src/room/compose/stages";
import { fit, textureMemory } from "../../../src/room/glb/fit";
import type { FitInput } from "../../../src/room/glb/fit";
import { readImage } from "../../../src/room/glb/images";
import { readGlb } from "../../../src/room/glb/read";
import { count } from "../../../src/room/glb/rules";
import { capSides } from "../../../src/room/scene/ledger";
import { avatarsOf, bundledFiles, figureBlock, twinGlbs, twinOf, VISITORS_DIR } from "../avatars";
import type { AvatarSet, TwinSet } from "../avatars";
import { EATER } from "../../../src/room/eat/available";
import type { Loaded } from "../load";
import { CAPS_PATH, capsOf } from "../policy";
import type { CatalogEntry } from "../schema";
import type { Tree } from "../source";
import type { Context, Family } from "./family";
import { faceScreens, geometryOf } from "./rg";
import type { Geometry } from "./rg";
import { modelChecks, overBudget, setModels } from "./rx";

export const TWIN_DIR = "assets/twin";
/** The twin's own model (spec 016, FR-009): the one file under assets/twin/ that RK3 counts. */
export const TWIN_MODEL = `${TWIN_DIR}/twin.glb`;
export { VISITORS_DIR };

/** The twin's texture side (spec 016, FR-045): the scene's figures.twin.texture_px, else the avatars' texture_px. */
const twinSide = (block: ReturnType<typeof figureBlock>): number => block.twin_texture_px;

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
  /** Each piece placed by a placement that isn't a figure's, or by a switch: its budgeted texture_bytes, once a
   *  piece. */
  readonly pieces: number;
  /** Of `pieces`, the pieces whose model is a set model, or a stand-in. */
  readonly models: number;
  /** Of `pieces`, the pieces whose image card is set. */
  readonly cards: number;
  /** The twin's figure (spec 009, FR-038): the larger of its own models (`twin_own`) and the stand-in avatar's files
   *  (`stand_in`); null while neither has a model, which the report notes. */
  readonly twin: number | null;
  /** The twin's own model, assets/twin/twin.glb, at its decoded size, at most the twin's texture side (spec 016,
   *  FR-046); null while the tree holds none. */
  readonly twin_own: number | null;
  /** The stand-in avatar's files together, at their decoded size (spec 009, FR-024); null where the scene names no
   *  stand-in, or its folder holds no model. */
  readonly stand_in: number | null;
  /** The largest visitor avatar's models, measured together at their decoded size (spec 009, FR-024); null while
   *  assets/visitors/ holds no model, which the report notes. */
  readonly visitor: number | null;
  /** The figures' models RX1 or RX2 refuses (but for a property the reader reads past, READ_PAST), or the tree can't
   *  read, each counted 0, which the report notes. */
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

/** A .glb's texture memory at its images' decoded sizes, at most `maxSide` a side (spec 009, FR-024; ledger.ts's
 *  capSides), by the fit check's reader; null where RX1 or RX2 refuses it (READ_PAST aside). */
function decodedMemory(bytes: Uint8Array, maxSide: number): number | null {
  const glb = readGlb(bytes).glb;
  if (glb === null) return null;
  let memory = 0;
  for (const image of glb.json.images ?? []) {
    if (image.bufferView === undefined) continue;
    const header = readImage(glb.viewBytes(image.bufferView)).header;
    if (!header) continue;
    const [w, h] = capSides(header.width, header.height, maxSide, false);
    memory += textureMemory(w, h);
  }
  return memory;
}

/** The models at `path`: the file itself where it is a .glb, else each .glb under the folder, at any depth, in the
 *  tree's order. A .glb is read with the fit check's reader for its texture memory alone, by §7's measure, at its
 *  images' own sizes, or at most `maxSide` a side where one is given, as the room decodes a visitor avatar's (spec 009,
 *  FR-024); one that RX1 or RX2 refuses, or that the tree lists but can't read and that holds nothing, can't be read,
 *  and counts 0. A property the reader reads past (READ_PAST) stops no read, so such a model counts its memory. */
function modelsAt(tree: Tree, path: string, maxSide: number | null = null): Models {
  const model = path.endsWith(".glb");
  const bytes = model ? tree.read(path) : null;
  if (bytes !== null) {
    const memory =
      maxSide === null
        ? fit(bytes, NO_FIT, { file: path, gzipBytes: 0 }).measures.textureBytes
        : decodedMemory(bytes, maxSide);
    return memory === null ? { bytes: 0, count: 1, unread: 1 } : { bytes: memory, count: 1, unread: 0 };
  }
  const entries = tree.list(path);
  if (entries.length === 0) return model ? { bytes: 0, count: 1, unread: 1 } : NO_MODELS;
  return entries.map((name) => modelsAt(tree, `${path}/${name}`, maxSide)).reduce(together, NO_MODELS);
}

/** The twin's figure and the largest visitor avatar's (spec 009, FR-038; plan.md R-19): the twin's own model at its
 *  decoded size (spec 016, FR-046), against the stand-in avatar's folder at its decoded size, the larger counting; each
 *  folder of assets/visitors/ (or a model directly in it) one avatar at its decoded size, the visitor's the largest
 *  folder other than the stand-in's, as RK5's first visit counts it, so the stand-in's folder never counts twice; null
 *  for either while it holds no model; and how many of either's models can't be read. The stand-in is the scene's, read
 *  from its own folder, so nothing more under assets/twin/ is read for it (FR-012). */
function figures(
  tree: Tree,
  block: ReturnType<typeof figureBlock>,
): Pick<SceneTextureMemory, "twin" | "twin_own" | "stand_in" | "visitor" | "unread"> {
  // The twin's model alone, where the folder lists it: a missing twin.glb is no model, never one that can't be read.
  const twin = tree.list(TWIN_DIR).includes("twin.glb") ? modelsAt(tree, TWIN_MODEL, twinSide(block)) : NO_MODELS;
  const folders = tree.list(VISITORS_DIR).map((name) => ({
    name,
    models: modelsAt(tree, `${VISITORS_DIR}/${name}`, block.texture_px),
  }));
  const standing = block.stand_in === null ? undefined : folders.find((f) => f.name === block.stand_in)?.models;
  const avatars = folders
    .filter((f) => standing === undefined || f.name !== block.stand_in)
    .map((f) => f.models)
    .filter((avatar) => avatar.count > 0);
  const own = twin.count > 0 ? twin.bytes : null;
  const standIn = standing && standing.count > 0 ? standing.bytes : null;
  return {
    twin: own === null && standIn === null ? null : Math.max(own ?? 0, standIn ?? 0),
    twin_own: own,
    stand_in: standIn,
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
  const { twin, twin_own, stand_in, visitor, unread } = figures(tree, figureBlock(scene));
  const faces = faceCanvases(g);
  const canvases = sum(faces.map((f) => f.bytes));
  const pieces = models + cards;
  const figureBytes = (twin ?? 0) + (visitor ?? 0);
  return {
    pieces,
    models,
    cards,
    twin,
    twin_own,
    stand_in,
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

/** The figures' share of the first visit (spec 009, FR-038; plan.md R-19), by their bundled files' gzip-9 copies: the
 *  twin's own files where its model is bundled (spec 016, FR-044, FR-046), else the stand-in avatar's; and the largest
 *  other visitor avatar's, which a visitor who chooses it fetches beside them: with the twin's own, the largest of every
 *  folder, the stand-in's among them, since it is then fetched only as the visitor's. */
export interface FiguresVisit {
  /** The twin's served GLBs, its model and its bundled clips; 0 where its model isn't bundled. */
  readonly twin: number;
  /** The stand-in's files; 0 where the twin's own model is bundled. */
  readonly stand_in: number;
  /** The largest bundled avatar's, and which; null with none. */
  readonly other: number;
  readonly other_id: string | null;
  /** Spec 025 (FR-022; plan.md R-11): the room's dog's files where the scene has `figures.dog`, counted once: 0 where
   *  it hasn't, or where the stand-in's files are the dog's already. Since spec 028 (FR-029; plan.md R-B9): counted
   *  only with the dinosaur's, as one visitor set, where the bundle carries the dinosaur's model, and only where that
   *  set is the largest (`other_id` the dinosaur); 0 otherwise. */
  readonly dog: number;
}

export function figuresVisit(set: AvatarSet, twin: TwinSet | null = null, roomDog = false): FiguresVisit {
  const served = (id: string): number => {
    const avatar = set.avatars.find((a) => a.id === id);
    return avatar ? sum(bundledFiles(avatar).map((f) => f.gz?.length ?? 0)) : 0;
  };
  const own = twin === null ? [] : twinGlbs(twin);
  const twinBytes = sum(own.map((f) => f.gz?.length ?? 0));
  const standing = own.length > 0 ? null : set.figures.stand_in;
  const standIn = standing === null ? 0 : served(standing);
  // Spec 028 (FR-029): the room's dog's folder rides with the dinosaur's, one visitor set ("the dinosaur's plus the
  // room's dog's"), only where the bundle carries the dinosaur's model; the dog visitor's own folder competes alone.
  const withDinosaur = roomDog && standing !== "dog" && served(EATER) > 0 ? served("dog") : 0;
  let [other, otherId, dog] = [0, null as string | null, 0];
  for (const a of set.avatars) {
    if (a.id === standing) continue;
    const bytes = served(a.id);
    const rides = a.id === EATER ? withDinosaur : 0;
    if (bytes + rides > other + dog || (otherId === null && bytes > 0)) [other, otherId, dog] = [bytes, a.id, rides];
  }
  return { twin: twinBytes, stand_in: standIn, other, other_id: otherId, dog };
}

/** RK5 (spec 009, FR-038): the first visit with both figures' files, the room's set models and cards by what the site
 *  serves and the figures' share, against main's phase-3 budget; lenient, so a lenient build warns and builds. */
function firstVisit(ctx: Context): void {
  const scene = ctx.room.scene;
  if (!scene) return;
  const placed = new Set([
    ...scene.value.placements.flatMap((p) => (p.role === undefined ? [p.piece] : [])),
    ...scene.value.switches.map((s) => s.piece),
  ]);
  const set = setModels(ctx);
  const room = sum(
    modelChecks(ctx)
      .filter((c) => placed.has(c.entry.value.id) && set.has(c.entry.value.id))
      .map((c) => c.measures?.served ?? 0),
  );
  const figures = figuresVisit(
    avatarsOf(ctx.tree, ctx.policy, scene.value),
    twinOf(ctx.tree, ctx.policy, scene.value),
    scene.value.figures.dog !== undefined,
  );
  const total = room + figures.twin + figures.stand_in + figures.dog + figures.other;
  const budget = ctx.policy.phase3_bytes;
  const twin = figures.twin > 0 ? `${count(figures.twin)} in the twin's files, ` : "";
  const dog = figures.dog > 0 ? `${count(figures.dog)} in the room's dog's files, ` : "";
  if (total > budget)
    ctx.report(
      "RK5",
      scene.file,
      "-",
      `${count(total)} bytes in the first visit with both figures' files, over main's phase-3 budget of ` +
        `${count(budget)}: ${count(room)} in the room's set models and cards, ${twin}${count(figures.stand_in)} in ` +
        `the stand-in's files, ${dog}and ${count(figures.other)} in the largest other visitor avatar's`,
    );
}

/** RK: every rule of the family, in its order. */
export const rk: Family = (ctx) => {
  budgets(ctx);
  models(ctx);
  sceneMemory(ctx);
  capsFile(ctx);
  firstVisit(ctx);
};
