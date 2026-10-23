// RX, the plain-model fit check (spec 004; FR-013, FR-015 to FR-019, FR-022, FR-068, FR-079; R-10, R-23, R-26;
// contracts/room-data-files.md §13.7, §15; contracts/plain-model-fit.md §5 to §7, §10; contracts/serving.md §3): RX1 to
// RX10 on each catalog model, through src/room/glb/, which the lookdev page runs too, so no rule has a second copy:
// - a model, `assets/room/<piece>.glb`, by fit.ts against its catalog entry at its stylized scale (the expected bounds,
//   the live faces, and the caps' small-prop limit where `small_props` names the piece), with its gzip-9 length
//   measured once by gzip.ts, as the site serves it;
// - an image card, `assets/room/<piece>.<png|jpg|webp>`, held to RX9's texture rules by fit.ts's `fitCard`;
// - a model the tree doesn't hold is RX1's "the file can't be read": an image build without the room-assets context
//   reads no model, and every piece keeps its stand-in (serving.md §3).
// Every finding is lenient: a lenient build prints it prefixed `warn`, and the piece keeps its stand-in (§15). A model
// that isn't directly under assets/room/, or whose stem isn't its piece's ID, isn't read: RI7's finding is the one to
// fix. A reason never quotes a name or a string from the file, and a path names a GLB's element by its index (FR-018).
// `modelChecks` keeps each model's findings and measures for the compose, so RK reads every file once.
import { atScale, fit, fitCard, unreadable } from "../../../src/room/glb/fit";
import type { Bounds, FitInput, GlbFinding, Vec3 } from "../../../src/room/glb/fit";
import { gzipBytes } from "../../../src/room/glb/gzip";
import type { Loaded } from "../load";
import { capsOf } from "../policy";
import type { RoomCaps } from "../policy";
import type { CatalogEntry } from "../schema";
import type { Context, Family } from "./family";
import { MODELS_DIR } from "./ri";

/** A live face's up where its catalog entry leaves it out: +Y (data-model.md §4). */
const UP: Vec3 = [0, 1, 0];

/** What a piece's model is judged against (lookdev.md §2; room-bundle.md §3.3): its catalog entry's expected bounds
 *  and live faces at its stylized scale, and `small_prop_texture_px` where the caps' `small_props` names it. */
export function fitInput(entry: CatalogEntry, caps: RoomCaps): FitInput {
  return atScale(
    {
      bounds: entry.origin.bounds,
      faces: entry.live_faces.map((f) => ({ role: f.role, at: f.at, size: f.size, facing: f.facing, up: f.up ?? UP })),
      scale: entry.stylized_scale,
    },
    caps.small_props.includes(entry.id) ? caps.small_prop_texture_px : null,
  );
}

/** §7's measures of a model or a card, as RK2 holds them to the piece's budget. */
export interface ModelMeasures {
  /** The plain file's length. */
  readonly bytes: number;
  /** What the site serves: a model's .glb.gz, pako at level 9; a card as stored. */
  readonly served: number;
  /** A model's; a card adds none of its own. */
  readonly triangles: number | null;
  /** Σ ⌊16 · w · h / 3⌋ over its images. */
  readonly textureBytes: number;
  /** Null for a model with no image. */
  readonly maxTexturePx: number | null;
  /** A model's measured bounds, which frame it once set (FR-019); null for a card. */
  readonly bounds: Bounds | null;
}

/** One catalog model, as the compose checked it. */
export interface ModelCheck {
  readonly entry: Loaded<CatalogEntry>;
  /** Its repository path, `assets/room/<name>`. */
  readonly file: string;
  readonly kind: "glb" | "card";
  /** Null where the file can't be read, RX1 or RX2 refuses it, or a card's header can't be read. */
  readonly measures: ModelMeasures | null;
  /** RX1 to RX10's, sorted by path, then rule. */
  readonly findings: readonly GlbFinding[];
}

/** Whether a model's name is a file directly under assets/room/ whose stem is its piece's ID, as RI7 requires. */
function direct(name: string, id: string): boolean {
  return !/[/\\]/.test(name) && !name.startsWith(".") && name.slice(0, name.lastIndexOf(".")) === id;
}

/** One catalog entry's model, checked; null where it has none, or RI7 refuses where it is. */
function check(ctx: Context, entry: Loaded<CatalogEntry>, caps: RoomCaps): ModelCheck | null {
  const model = entry.value.model;
  const name = model?.file ?? model?.card;
  if (name === undefined || !direct(name, entry.value.id)) return null;
  const file = `${MODELS_DIR}/${name}`;
  const kind = model?.file !== undefined ? "glb" : "card";
  const bytes = ctx.tree.read(file);
  if (bytes === null) return { entry, file, kind, measures: null, findings: [unreadable(file)] };
  if (kind === "card") {
    const input = fitInput(entry.value, caps);
    const result = fitCard(bytes, name.slice(name.lastIndexOf(".") + 1), input, { file });
    const m = result.measures;
    const measures =
      m.textureBytes === null
        ? null
        : {
            bytes: m.bytes,
            served: m.bytes,
            triangles: null,
            textureBytes: m.textureBytes,
            maxTexturePx: m.maxTexturePx,
            bounds: null,
          };
    return { entry, file, kind, measures, findings: result.findings };
  }
  const served = gzipBytes(bytes);
  const result = fit(bytes, fitInput(entry.value, caps), { file, gzipBytes: served });
  const m = result.measures;
  const measures =
    m.triangles === null
      ? null
      : {
          bytes: m.bytes,
          served,
          triangles: m.triangles,
          textureBytes: m.textureBytes ?? 0,
          maxTexturePx: m.maxTexturePx,
          bounds: m.bounds,
        };
  return { entry, file, kind, measures, findings: result.findings };
}

const checked = new WeakMap<Context, readonly ModelCheck[]>();

/** Each catalog model, in the catalog's order, checked once a compose. */
export function modelChecks(ctx: Context): readonly ModelCheck[] {
  const known = checked.get(ctx);
  if (known) return known;
  const caps = capsOf(ctx.policy);
  const out = ctx.room.catalog.flatMap((entry) => check(ctx, entry, caps) ?? []);
  checked.set(ctx, out);
  return out;
}

/** RX: each model's findings, every one lenient. */
export const rx: Family = (ctx) => {
  for (const { findings } of modelChecks(ctx)) for (const f of findings) ctx.report(f.rule, f.file, f.path, f.reason);
};
