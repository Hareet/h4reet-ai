// The room's avatars as the compositor reads them (spec 009; FR-009, FR-012, FR-014, FR-023, FR-024, FR-038, FR-040;
// plan.md R-01, R-02, R-11, R-12, R-19): each avatar of the room's table (src/choice/avatars.ts) has a folder,
// assets/visitors/<id>/, which the Author's intake fills through spec 003's arrival check. Read once a compose, through
// its tree, so emit, the RA family, RK3, RK5, the report, and the plugin read each file once:
// - each file's role by the convention, its model `<id>.glb` and its clips `<id>-<role>.glb` for the closed list of
//   roles (CLIP_ROLES); any other file but records.json and LICENSE.md has no role (RA5: reported, never refused,
//   never bundled or fetched);
// - its record in the folder's records.json: a model of the kind `avatar` and a clip of the kind `animation`, with its
//   SHA-256 (RA1); the stand-in's model never a likeness or from a photo (RA3);
// - its reading by the fit check's reader (src/room/glb/read.ts), never RX3, which refuses skins and animations in a
//   room piece: a file the reader can't read (RX1 and RX2 as it reads them, READ_PAST aside), a clip with no animation,
//   or a clip whose channels move a node its model's raw names lack (RA2);
// - its measures as spec 003's F2 takes them, plain bytes, triangles, and texture memory at the images' own sizes,
//   against main's per_asset.avatar or per_asset.animation (RA4); its texture memory at texture_px too, as the room
//   decodes it (FR-024; ledger.ts's capSides), which RK3 counts; its gzip-9 copy, which the plugin serves;
// - the bundled set: a model where main's caps hold per_asset.avatar and none of RA1, RA2, and RA4 stands on it; a clip
//   where its model is bundled, main's caps hold per_asset.animation, and none stands on the clip. A strict build
//   refuses with any of them; a lenient one leaves the file out, its figure on its fallback. The checks run only where
//   main's caps hold per_asset.avatar, so they would bundle the avatar: without it nothing is bundled or refused, as
//   before spec 009 (plan.md §10).
// Nothing here reads under assets/twin/ for the stand-in (FR-012): the stand-in is a visitor avatar, read from its own
// folder. Spec 016's twin, at the end of this file, is read from assets/twin/ by its own reader.
import { createHash } from "node:crypto";

import { AVATAR_SHAPES, AVATARS, CLIP_ROLES } from "../../src/choice/avatars";
import type { AvatarId, ClipRole } from "../../src/choice/avatars";
import { textureMemory } from "../../src/room/glb/fit";
import { gzip9 } from "../../src/room/glb/gzip";
import { readImage } from "../../src/room/glb/images";
import { isObject, strictJson } from "../../src/room/glb/json";
import { readGlb } from "../../src/room/glb/read";
import { count } from "../../src/room/glb/rules";
import { capSides } from "../../src/room/scene/ledger";
import { TWIN_CLIP_ROLES } from "../../src/room/scene/twin-states";
import type { TwinClipRole } from "../../src/room/scene/twin-states";
import type { Problem } from "./checks/family";
import type { AssetCaps, LikenessSource, RoomPolicy } from "./policy";
import { FIGURES_DEFAULTS } from "./schema";
import type { Scene } from "./schema";
import type { Tree } from "./source";

export const VISITORS_DIR = "assets/visitors";

/** Spec 021 (FR-003 to FR-005; plan.md §4; contracts/dinosaur-rig.md): the rig table, an avatar's required bones by
 *  their raw glTF names, or null where its rig isn't checked. A row that isn't null runs RA10 (the bones), RA11 (the
 *  box), and RA12 (the clips) on its model; the woman's, the man's, and the dog's are null (Q7). */
export const RIG_BONES: Readonly<Record<AvatarId, readonly string[] | null>> = {
  woman: null,
  man: null,
  dinosaur: [
    "Hips",
    "Spine",
    "Chest",
    "Neck",
    "Head",
    "Jaw",
    "Tail1",
    "Tail2",
    "Tail3",
    "Tail4",
    "Arm.L",
    "Arm.R",
    "Leg.L",
    "Leg.R",
    "Shin.L",
    "Shin.R",
    "Foot.L",
    "Foot.R",
  ],
  dog: null,
};

/** A required bone among a model's raw node names: named it exactly, or ending with `:` and it, as
 *  scripts/studio/line.py's has_bone reads it. */
const hasBone = (nodes: readonly string[], bone: string): boolean =>
  nodes.some((n) => n === bone || n.endsWith(`:${bone}`));
/** RA11's measures over the avatar table's box: each axis whose extent, scaled to the table's height, is over its
 *  width with 5% slack; none where the height or an extent isn't known. */
function boxOver(
  id: AvatarId,
  m: { readonly height: number | null; readonly extent_x: number | null; readonly extent_z: number | null } | null,
): string[] {
  const shape = AVATAR_SHAPES[id];
  if (!m || m.height === null || !(m.height > 0)) return [];
  const scale = shape.height / m.height;
  const out: string[] = [];
  for (const [axis, extent] of [
    ["x", m.extent_x],
    ["z", m.extent_z],
  ] as const) {
    if (extent === null) continue;
    const scaled = extent * scale;
    if (scaled > shape.width * 1.05)
      out.push(`${axis} extent ${scaled.toFixed(2)} m at ${shape.height} m high, over ${shape.width} m (+5%)`);
  }
  return out;
}

/** The first three of a list, then how many more. */
const firstFew = (names: readonly string[]): string =>
  names.length > 3 ? `${names.slice(0, 3).join(", ")}, and ${names.length - 3} more` : names.join(", ");
/** A folder's own files, which have no role and are no avatar's: the record and the notice. */
const FOLDER_FILES = new Set(["records.json", "LICENSE.md"]);

/** The scene's figures block, resolved (plan.md §3.1): the stand-in only where it's an avatar of the table. */
export interface FigureBlock {
  readonly stand_in: AvatarId | null;
  readonly texture_px: number;
  /** Spec 016 (FR-045, FR-054): the twin's own texture side, the twin block's texture_px, else `texture_px`. */
  readonly twin_texture_px: number;
  readonly wait_ms: number;
  /** Spec 014 (FR-039): the grips, per avatar of the table and hand; absent where the scene gives none. */
  readonly grips?: NonNullable<NonNullable<Scene["figures"]>["grips"]>;
}

/** A role an avatar's file holds: its model, a clip's, or none. */
export type FileRole = "model" | ClipRole;

/** One file of an avatar's folder, read and measured. */
export interface AvatarFile {
  readonly avatar: AvatarId;
  /** Repository-relative: assets/visitors/<id>/<name>. */
  readonly path: string;
  readonly name: string;
  /** The name without `.glb`: the asset events' `asset`, and the URL's stem. */
  readonly stem: string;
  readonly role: FileRole | null;
  readonly bytes: number;
  readonly sha256: string;
  /** `a/<stem>.<hash16>.glb`, the hash the plain file's first 16 hexadecimal digits. */
  readonly url: string;
  /** The gzip-9 copy the site serves, for a file with a role; null for one with none. */
  readonly gz: Uint8Array | null;
  /** The reader's measures; null where it can't read the file. */
  readonly measures: {
    readonly triangles: number;
    /** Σ ⌊16 · w · h / 3⌋ over its images at their own sizes, F2's measure. */
    readonly texture_bytes: number;
    /** The same at texture_px, as the room decodes them (FR-024). */
    readonly decoded_bytes: number;
    /** The rest pose's height by the reader's bounds, in the file's units; null with no vertex. */
    readonly height: number | null;
    /** Spec 021 (plan.md §4): the rest pose's extents along x and z by the same bounds, in the file's units; null with
     *  no vertex. */
    readonly extent_x: number | null;
    readonly extent_z: number | null;
    readonly animations: number;
  } | null;
  readonly bundled: boolean;
  /** Why it isn't bundled: the rules that stand on it, `no-caps`, `no-model`, or `no-role`; null where it is. */
  readonly why: string | null;
}

/** One avatar of the table with files in its folder. */
export interface Avatar {
  readonly id: AvatarId;
  readonly model: AvatarFile | null;
  /** In CLIP_ROLES' order, the roles its folder holds. */
  readonly clips: readonly AvatarFile[];
  /** Files with no role (RA5), in the folder's order. */
  readonly others: readonly AvatarFile[];
  /** Spec 020 (FR-007): the likeness approval's line, for a model recorded as a likeness or from a photo that main
   *  approves; null for every other avatar. */
  readonly line: string | null;
}

export interface AvatarSet {
  /** The block resolved; its stand-in null where RA3 refuses it, so the twin keeps its capsule. */
  readonly figures: FigureBlock;
  /** Each avatar of the table whose folder holds a file, in the table's order. */
  readonly avatars: readonly Avatar[];
  /** RA1 to RA4, spec 020's RA9, and spec 021's RA10 to RA12, by file, then rule. */
  readonly problems: readonly Problem[];
}

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const AVATAR_IDS: readonly string[] = AVATARS.map((a) => a.id);

/** The scene's figures block resolved: its stand-in where it names an avatar of the table (RI8 refuses any other). */
export function figureBlock(scene: Scene | null | undefined): FigureBlock {
  const block = scene?.figures;
  const named = block?.twin_stand_in;
  return {
    stand_in: named !== undefined && AVATAR_IDS.includes(named) ? (named as AvatarId) : null,
    texture_px: block?.texture_px ?? FIGURES_DEFAULTS.texture_px,
    twin_texture_px: block?.twin?.texture_px ?? block?.texture_px ?? FIGURES_DEFAULTS.texture_px,
    wait_ms: block?.wait_ms ?? FIGURES_DEFAULTS.wait_ms,
    ...(block?.grips === undefined ? {} : { grips: block.grips }),
  };
}

/** A file's role by the convention: `<id>.glb` the model, `<id>-<role>.glb` a clip of the closed list. */
export function roleOf(id: string, name: string): FileRole | null {
  if (name === `${id}.glb`) return "model";
  for (const role of CLIP_ROLES) if (name === `${id}-${role}.glb`) return role;
  return null;
}

/** The folder's records.json entries by file, or null where it can't be read as JSON with a list of entries. */
function recordsOf(
  tree: Tree,
  dir: string,
): Map<string, { kind: unknown; sha256: unknown; likeness: unknown; source: unknown }> | null {
  const data = tree.read(`${dir}/records.json`);
  const read = data === null ? null : strictJson(data);
  if (!read?.ok || !isObject(read.value) || !Array.isArray(read.value.entries)) return null;
  const out = new Map<string, { kind: unknown; sha256: unknown; likeness: unknown; source: unknown }>();
  for (const e of read.value.entries)
    if (isObject(e) && typeof e.file === "string" && !out.has(e.file))
      out.set(e.file, { kind: e.kind, sha256: e.sha256, likeness: e.likeness, source: e.source });
  return out;
}

/** The gzip-9 copies made so far, by the plain file's SHA-256: the same bytes give the same copy, so a file read by
 *  several composes (the tests', room:check and the build's) is compressed once. */
const copies = new Map<string, Uint8Array>();
const COPIES_KEPT = 64;
function copyOf(data: Uint8Array, digest: string): Uint8Array {
  const known = copies.get(digest);
  if (known) return known;
  const gz = gzip9(data);
  if (copies.size >= COPIES_KEPT) copies.delete(copies.keys().next().value as string);
  copies.set(digest, gz);
  return gz;
}

interface Read {
  readonly file: Omit<AvatarFile, "bundled" | "why">;
  /** Raw node names, a model's; the clips' channel targets by name. */
  readonly nodes: readonly string[];
  readonly targets: readonly { readonly path: string; readonly node: string | null }[];
  readonly unread: { readonly path: string } | null;
}

/** A file read: its bytes, digest, URL, copy, and the reader's measures. */
function readFile(tree: Tree, avatar: AvatarId, dir: string, name: string, texturePx: number): Read | null {
  const path = `${dir}/${name}`;
  const data = tree.read(path);
  if (data === null) return null;
  const role = roleOf(avatar, name);
  const digest = sha256(data);
  const stem = name.endsWith(".glb") ? name.slice(0, -4) : name;
  const base = {
    avatar,
    path,
    name,
    stem,
    role,
    bytes: data.length,
    sha256: digest,
    url: `a/${stem}.${digest.slice(0, 16)}.glb`,
    gz: role === null ? null : copyOf(data, digest),
  };
  if (role === null) return { file: { ...base, measures: null }, nodes: [], targets: [], unread: null };
  const read = readGlb(data);
  const glb = read.glb;
  if (glb === null)
    return {
      file: { ...base, measures: null },
      nodes: [],
      targets: [],
      unread: { path: read.problems[0]?.path ?? "-" },
    };
  let [own, decoded] = [0, 0];
  for (const image of glb.json.images ?? []) {
    if (image.bufferView === undefined) continue;
    const header = readImage(glb.viewBytes(image.bufferView)).header;
    if (!header) continue;
    own += textureMemory(header.width, header.height);
    const [w, h] = capSides(header.width, header.height, texturePx, false);
    decoded += textureMemory(w, h);
  }
  const bounds = glb.bounds();
  const nodes = (glb.json.nodes ?? []).map((n) => n.name ?? "");
  const targets = (glb.json.animations ?? []).flatMap((animation, i) =>
    animation.channels.map((channel, k) => ({
      path: `animations[${i}].channels[${k}].target.node`,
      node: channel.target.node === undefined ? null : (nodes[channel.target.node] ?? null),
    })),
  );
  return {
    file: {
      ...base,
      measures: {
        triangles: glb.counts().triangles,
        texture_bytes: own,
        decoded_bytes: decoded,
        height: bounds === null ? null : bounds.max[1] - bounds.min[1],
        extent_x: bounds === null ? null : bounds.max[0] - bounds.min[0],
        extent_z: bounds === null ? null : bounds.max[2] - bounds.min[2],
        animations: glb.json.animations?.length ?? 0,
      },
    },
    nodes,
    targets,
    unread: null,
  };
}

/** RA4's measures over a cap block, F2's way: each measure the block caps, over it. */
function overCaps(file: AvatarFile, caps: AssetCaps, block: string): string[] {
  const m = file.measures;
  const measured: Record<keyof AssetCaps, number | null> = {
    bytes: file.bytes,
    triangles: m?.triangles ?? null,
    texture_bytes: m?.texture_bytes ?? null,
  };
  const out: string[] = [];
  for (const key of ["bytes", "triangles", "texture_bytes"] as const) {
    const cap = caps[key];
    const value = measured[key];
    if (cap !== undefined && value !== null && value > cap)
      out.push(`${count(value)} ${key.replace("_", " ")} over main's per_asset.${block} cap of ${count(cap)}`);
  }
  return out;
}

/** The avatars in a tree, under a policy and a scene's block. */
export function readAvatars(tree: Tree, policy: RoomPolicy, scene: Scene | null): AvatarSet {
  const block = figureBlock(scene);
  const problems: Problem[] = [];
  const avatars: Avatar[] = [];
  let standIn = block.stand_in;
  const caps = policy.avatar_caps;
  for (const { id } of AVATARS) {
    const dir = `${VISITORS_DIR}/${id}`;
    const names = tree.list(dir).filter((name) => !FOLDER_FILES.has(name));
    if (names.length === 0) continue;
    const records = recordsOf(tree, dir);
    const reads = names.flatMap((name) => {
      const r = readFile(tree, id, dir, name, block.texture_px);
      return r === null ? [] : [r];
    });
    const model = reads.find((r) => r.file.role === "model") ?? null;
    const rules = new Map<string, string[]>();
    let likenessLine: TwinLine | null = null;
    // The checks run where main's caps would bundle the avatar: without per_asset.avatar nothing is bundled, so
    // nothing is left out, and a file is only reported, unbundled, for want of the caps.
    const checked = caps?.avatar !== undefined && caps.avatar !== null;
    const refuse = (r: Read, rule: Problem["rule"], path: string, reason: string): void => {
      if (!checked) return;
      problems.push({ rule, file: r.file.path, path, reason });
      rules.set(r.file.path, [...(rules.get(r.file.path) ?? []), rule]);
    };
    for (const r of reads) {
      const { role } = r.file;
      if (role === null) continue;
      // RA1: recorded, with its kind and its SHA-256.
      const kind = role === "model" ? "avatar" : "animation";
      const entry = records?.get(r.file.name);
      if (!entry) refuse(r, "RA1", "-", `${dir}/records.json doesn't record it`);
      else if (entry.kind !== kind)
        refuse(r, "RA1", "-", `${dir}/records.json records it with a kind other than ${kind}`);
      else if (entry.sha256 !== r.file.sha256)
        refuse(r, "RA1", "-", `${dir}/records.json records another SHA-256 for it`);
      // RA2: readable; a clip animated, moving only nodes its model names.
      if (r.unread !== null) {
        refuse(r, "RA2", r.unread.path, "a file the GLB reader can't read (as RX1 and RX2 read it)");
        continue;
      }
      if (role !== "model") {
        if ((r.file.measures?.animations ?? 0) === 0) refuse(r, "RA2", "-", "a clip with no animation");
        else if (model !== null && model.unread === null) {
          const names = new Set(model.nodes);
          const stray = r.targets.find((t) => t.node === null || !names.has(t.node));
          if (stray) refuse(r, "RA2", stray.path, "a clip's channel moves a node its model doesn't name");
        }
      }
      // RA3: the stand-in's model is an original character, never a likeness or from a photo (FR-014).
      if (role === "model" && id === block.stand_in && entry) {
        const source = isObject(entry.source as never) ? (entry.source as { type?: unknown }).type : undefined;
        if (checked && (entry.likeness === true || source === "photo")) {
          refuse(
            r,
            "RA3",
            "-",
            "the twin's stand-in recorded as a likeness or from a photo, never an original character",
          );
          standIn = null;
        }
      }
      // RA9 (spec 020; FR-002): a visitor's likeness, recorded so or from a photo, bundled only with main's approval of
      // the model's SHA-256 and a non-empty line. A clip rides with its model. The stand-in is RA3's.
      if (role === "model" && entry && id !== block.stand_in) {
        const source = isObject(entry.source as never) ? (entry.source as { type?: unknown }).type : undefined;
        if (entry.likeness === true || source === "photo") {
          likenessLine = lineFor(policy, r.file);
          if (likenessLine === null)
            refuse(
              r,
              "RA9",
              "-",
              "a likeness without main's approval naming its SHA-256 with a disclosure line (assets/policy/approvals.json)",
            );
        }
      }
      // RA4: main's per-asset caps for its kind, as spec 003's F2 measures it.
      const cap = role === "model" ? caps?.avatar : caps?.animation;
      if (cap) {
        const over = overCaps(r.file as AvatarFile, cap, role === "model" ? "avatar" : "animation");
        if (over.length > 0) refuse(r, "RA4", "-", over.join("; "));
      }
      // Spec 021's rules, only for an avatar with a rig-table row (FR-003 to FR-005).
      const row = RIG_BONES[id];
      if (role === "model" && row !== null) {
        // RA10: each bone of the row among the model's raw node names (FR-005).
        const lacking = row.filter((bone) => !hasBone(r.nodes, bone));
        if (lacking.length > 0) refuse(r, "RA10", "-", `the ${id} rig lacks ${firstFew(lacking)}`);
        // RA11: the rest pose's box, scaled uniformly to the table's height (spec 009's FR-016), within the table's
        // width along x and z, with 5% slack (FR-004; plan.md R-03).
        const over = boxOver(id, r.file.measures);
        if (over.length > 0) refuse(r, "RA11", "-", over.join("; "));
      }
    }
    // RA12 (spec 021; FR-003; plan.md R-04): a model with a rig-table row needs a usable idle and walk, a clip RA1,
    // RA2, or RA4 stands on counting as missing; on the model, so it and its clips are left out. `take` is optional.
    if (model !== null && model.unread === null && RIG_BONES[id] !== null) {
      const usable = (role: ClipRole): boolean =>
        reads.some(
          (r) =>
            r.file.role === role &&
            !(rules.get(r.file.path) ?? []).some((rule) => rule === "RA1" || rule === "RA2" || rule === "RA4"),
        );
      const missing = (["idle", "walk"] as const).filter((role) => !usable(role));
      if (missing.length > 0) refuse(model, "RA12", "-", missing.map((role) => `no usable ${role} clip`).join("; "));
    }
    // The bundled set: RA3 aside, a finding on a file leaves it out.
    const standing = (r: Read): string[] => (rules.get(r.file.path) ?? []).filter((rule) => rule !== "RA3");
    const modelWhy = (): string | null => {
      if (model === null) return "no-model";
      const on = standing(model);
      if (on.length > 0) return on.join(", ");
      return caps?.avatar ? null : "no-caps";
    };
    const modelBundled = modelWhy() === null;
    const finish = (r: Read): AvatarFile => {
      let why: string | null;
      if (r.file.role === null) why = "no-role";
      else if (r.file.role === "model") why = modelWhy();
      else {
        const on = standing(r);
        why = on.length > 0 ? on.join(", ") : !modelBundled ? "no-model" : caps?.animation ? null : "no-caps";
      }
      return { ...r.file, bundled: why === null, why };
    };
    const files = reads.map(finish);
    avatars.push({
      id,
      model: files.find((f) => f.role === "model") ?? null,
      clips: CLIP_ROLES.flatMap((role) => files.filter((f) => f.role === role)),
      others: files.filter((f) => f.role === null),
      line: likenessLine?.line ?? null,
    });
  }
  return { figures: { ...block, stand_in: standIn }, avatars, problems };
}

/** The avatar set of a compose, read once for its tree, policy, and scene: the families' context and emit's reader
 *  hold the same tree, so the RA family, RK3, RK5, emit, and the report share one reading. */
const known = new WeakMap<Tree, { policy: RoomPolicy; scene: Scene | null; set: AvatarSet }>();
export function avatarsOf(tree: Tree, policy: RoomPolicy, scene: Scene | null): AvatarSet {
  const hit = known.get(tree);
  if (hit && hit.policy === policy && hit.scene === scene) return hit.set;
  const set = readAvatars(tree, policy, scene);
  known.set(tree, { policy, scene, set });
  return set;
}

/** An avatar's bundled files: its model, then its bundled clips, as the 3D part names them; none where its model isn't
 *  bundled. */
export function bundledFiles(avatar: Avatar): AvatarFile[] {
  if (!avatar.model?.bundled) return [];
  return [avatar.model, ...avatar.clips.filter((c) => c.bundled)];
}

// ---- Spec 016: the twin's own avatar (its FR-009, FR-015, FR-045, FR-046, FR-048, FR-055; plan.md R-01 to R-04) ----
// The twin's folder, assets/twin/, which the Author's intake fills, read once a compose as the visitors' folders are:
// - each file's role by the convention: its model `twin.glb`, its clips `<role>.glb` for the closed list
//   TWIN_CLIP_ROLES, and its still `still.png`; any other file but records.json and LICENSE.md has no role (RA5:
//   reported, never refused, never bundled or fetched);
// - RA1, its record in the folder's records.json with its kind (`avatar`, `animation`, `still`) and its SHA-256; RA2, a
//   GLB the reader can't read, a clip with no animation, or one moving a node its model's raw names lack; RA4, main's
//   per_asset cap for its kind (`avatar`, `animation`, `still`), as spec 003's F2 measures it;
// - RA6, the twin's line: the approval in main's likeness approvals (policy.ts) whose `sha256` is the model's current
//   SHA-256 and whose `disclosure_line` is a non-empty string. Without it no file of the twin is bundled;
// - its measures: a GLB's triangles, its texture memory at its own size and at the twin's texture side (FR-045), its
//   rest pose's height and bounds, its animations and their length; the still's pixel size;
// - its served name, `a/twin.<hash16>.glb`, `a/twin-<role>.<hash16>.glb`, or `a/twin-still.<hash16>.png`, and a GLB's
//   gzip-9 copy (FR-048).
// The checks run only where main's caps hold per_asset.avatar, as the visitors' do; a strict build refuses with any of
// them, and a lenient one leaves the file out (RA6: every file), so the twin's figure shows its stand-in.

export { TWIN_CLIP_ROLES };
export const TWIN_DIR = "assets/twin";
/** A role a file of the twin's holds: its model, a clip's, or its still. */
export type TwinFileRole = "model" | TwinClipRole | "still";

/** A GLB's measures, or the still's pixel size. */
export type TwinMeasures =
  | {
      readonly kind: "glb";
      readonly triangles: number;
      /** Σ ⌊16 · w · h / 3⌋ over its images at their own sizes, F2's measure. */
      readonly texture_bytes: number;
      /** The same at the twin's texture side, as the room decodes them (FR-045). */
      readonly decoded_bytes: number;
      /** The rest pose's height by the reader's bounds, in metres; null with no vertex. */
      readonly height: number | null;
      readonly bounds: { readonly min: readonly number[]; readonly max: readonly number[] } | null;
      readonly animations: number;
      /** The longest animation's length in seconds, from its samplers' inputs; null with none. */
      readonly length_s: number | null;
    }
  | { readonly kind: "still"; readonly width: number; readonly height: number };

/** One file of the twin's folder, read and measured. */
export interface TwinFile {
  /** Repository-relative: assets/twin/<name>. */
  readonly path: string;
  readonly name: string;
  /** The served name's stem: `twin`, `twin-<role>`, or `twin-still`; the asset events' `asset`. */
  readonly stem: string;
  readonly role: TwinFileRole | null;
  readonly bytes: number;
  readonly sha256: string;
  readonly url: string;
  /** A GLB's gzip-9 copy, which the site serves; null for the still and a file with no role. */
  readonly gz: Uint8Array | null;
  readonly measures: TwinMeasures | null;
  readonly bundled: boolean;
  /** Why it isn't bundled: the rules that stand on it, `RA6`, `no-caps`, `no-model`, or `no-role`; null where it is. */
  readonly why: string | null;
}

/** The twin's line (FR-015): the approval it comes from, its words, and which source held the approvals. */
export interface TwinLine {
  readonly approval: string;
  readonly line: string;
  readonly source: LikenessSource;
}

export interface TwinSet {
  readonly model: TwinFile | null;
  /** In TWIN_CLIP_ROLES' order, the roles its folder holds. */
  readonly clips: readonly TwinFile[];
  readonly still: TwinFile | null;
  /** Files with no role (RA5), in the folder's order. */
  readonly others: readonly TwinFile[];
  /** Null where RA6 stands, or there is no model. */
  readonly line: TwinLine | null;
  /** The twin's texture side. */
  readonly texture_px: number;
  /** RA1, RA2, RA4, and RA6, by file, then rule. */
  readonly problems: readonly Problem[];
}

const TWIN_KIND: Readonly<Record<"model" | "clip" | "still", string>> = {
  model: "avatar",
  clip: "animation",
  still: "still",
};

/** A twin file's role by the convention. */
export function twinRoleOf(name: string): TwinFileRole | null {
  if (name === "twin.glb") return "model";
  if (name === "still.png") return "still";
  for (const role of TWIN_CLIP_ROLES) if (name === `${role}.glb`) return role;
  return null;
}

/** A twin file's served stem: `twin`, `twin-<role>`, `twin-still`; a file with no role, its name less its extension. */
const twinStem = (name: string, role: TwinFileRole | null): string =>
  role === "model"
    ? "twin"
    : role === "still"
      ? "twin-still"
      : role !== null
        ? `twin-${role}`
        : name.replace(/\.[^.]*$/, "");

/** A GLB's longest animation, from its samplers' input accessors' max. */
function lengthOf(json: {
  animations?: readonly { samplers: readonly { input: number }[] }[];
  accessors?: readonly { max?: readonly number[] }[];
}): number | null {
  let longest: number | null = null;
  for (const a of json.animations ?? [])
    for (const s of a.samplers) {
      const max = json.accessors?.[s.input]?.max?.[0];
      if (typeof max === "number" && Number.isFinite(max)) longest = Math.max(longest ?? 0, max);
    }
  return longest;
}

interface TwinRead {
  readonly file: Omit<TwinFile, "bundled" | "why">;
  readonly nodes: readonly string[];
  readonly targets: readonly { readonly path: string; readonly node: string | null }[];
  readonly unread: { readonly path: string } | null;
}

function readTwinFile(tree: Tree, name: string, texturePx: number): TwinRead | null {
  const path = `${TWIN_DIR}/${name}`;
  const data = tree.read(path);
  if (data === null) return null;
  const role = twinRoleOf(name);
  const digest = sha256(data);
  const stem = twinStem(name, role);
  const ext = name.slice(name.lastIndexOf("."));
  const glbFile = name.endsWith(".glb");
  const base = {
    path,
    name,
    stem,
    role,
    bytes: data.length,
    sha256: digest,
    url: `a/${stem}.${digest.slice(0, 16)}${role === "still" ? ".png" : ext}`,
    gz: role !== null && role !== "still" && glbFile ? copyOf(data, digest) : null,
  };
  const none = { nodes: [] as string[], targets: [] as { path: string; node: string | null }[] };
  if (role === null) return { file: { ...base, measures: null }, ...none, unread: null };
  if (role === "still") {
    const header = readImage(data).header;
    return {
      file: { ...base, measures: header ? { kind: "still", width: header.width, height: header.height } : null },
      ...none,
      unread: null,
    };
  }
  const read = readGlb(data);
  const glb = read.glb;
  if (glb === null)
    return { file: { ...base, measures: null }, ...none, unread: { path: read.problems[0]?.path ?? "-" } };
  let [own, decoded] = [0, 0];
  for (const image of glb.json.images ?? []) {
    if (image.bufferView === undefined) continue;
    const header = readImage(glb.viewBytes(image.bufferView)).header;
    if (!header) continue;
    own += textureMemory(header.width, header.height);
    const [w, h] = capSides(header.width, header.height, texturePx, false);
    decoded += textureMemory(w, h);
  }
  const bounds = glb.bounds();
  const nodes = (glb.json.nodes ?? []).map((n) => n.name ?? "");
  const targets = (glb.json.animations ?? []).flatMap((animation, i) =>
    animation.channels.map((channel, k) => ({
      path: `animations[${i}].channels[${k}].target.node`,
      node: channel.target.node === undefined ? null : (nodes[channel.target.node] ?? null),
    })),
  );
  return {
    file: {
      ...base,
      measures: {
        kind: "glb",
        triangles: glb.counts().triangles,
        texture_bytes: own,
        decoded_bytes: decoded,
        height: bounds === null ? null : bounds.max[1] - bounds.min[1],
        bounds: bounds === null ? null : { min: [...bounds.min], max: [...bounds.max] },
        animations: glb.json.animations?.length ?? 0,
        length_s: lengthOf(glb.json as never),
      },
    },
    nodes,
    targets,
    unread: null,
  };
}

/** The twin's line: the likeness approval naming the model's current SHA-256 with a non-empty line (FR-015). */
function lineFor(policy: RoomPolicy, model: { readonly sha256: string } | null): TwinLine | null {
  const likeness = policy.likeness;
  if (!model || !likeness) return null;
  const entry = likeness.approvals.find((a) => a.sha256 === model.sha256);
  const line = entry?.disclosure_line;
  if (!entry || typeof line !== "string" || line.trim() === "") return null;
  return { approval: entry.id, line, source: likeness.source };
}

/** The twin in a tree, under a policy and a scene's block. */
export function readTwin(tree: Tree, policy: RoomPolicy, scene: Scene | null): TwinSet {
  const block = figureBlock(scene);
  const names = tree.list(TWIN_DIR).filter((name) => !FOLDER_FILES.has(name));
  const empty: TwinSet = {
    model: null,
    clips: [],
    still: null,
    others: [],
    line: null,
    texture_px: block.twin_texture_px,
    problems: [],
  };
  if (names.length === 0) return empty;
  const records = recordsOf(tree, TWIN_DIR);
  const reads = names.flatMap((name) => {
    const r = readTwinFile(tree, name, block.twin_texture_px);
    return r === null ? [] : [r];
  });
  const model = reads.find((r) => r.file.role === "model") ?? null;
  const caps = policy.avatar_caps;
  const checked = caps?.avatar !== undefined && caps.avatar !== null;
  const problems: Problem[] = [];
  const rules = new Map<string, string[]>();
  const refuse = (path: string, rule: Problem["rule"], at: string, reason: string): void => {
    if (!checked) return;
    problems.push({ rule, file: path, path: at, reason });
    rules.set(path, [...(rules.get(path) ?? []), rule]);
  };
  const recordsFile = `${TWIN_DIR}/records.json`;
  for (const r of reads) {
    const { role, path } = r.file;
    if (role === null) continue;
    const group = role === "model" ? "model" : role === "still" ? "still" : "clip";
    const kind = TWIN_KIND[group];
    // RA1: recorded, with its kind and its SHA-256.
    const entry = records?.get(r.file.name);
    if (!entry) refuse(path, "RA1", "-", `${recordsFile} doesn't record it`);
    else if (entry.kind !== kind) refuse(path, "RA1", "-", `${recordsFile} records it with a kind other than ${kind}`);
    else if (entry.sha256 !== r.file.sha256) refuse(path, "RA1", "-", `${recordsFile} records another SHA-256 for it`);
    // RA2: a GLB readable; a clip animated, moving only nodes its model names.
    if (r.unread !== null)
      refuse(path, "RA2", r.unread.path, "a file the GLB reader can't read (as RX1 and RX2 read it)");
    else if (group === "clip") {
      const measures = r.file.measures;
      if (measures?.kind !== "glb" || measures.animations === 0) refuse(path, "RA2", "-", "a clip with no animation");
      else if (model !== null && model.unread === null) {
        const known = new Set(model.nodes);
        const stray = r.targets.find((t) => t.node === null || !known.has(t.node));
        if (stray) refuse(path, "RA2", stray.path, "a clip's channel moves a node its model doesn't name");
      }
    }
    // RA4: main's per-asset caps for its kind, as spec 003's F2 measures it.
    const cap = group === "model" ? caps?.avatar : group === "clip" ? caps?.animation : caps?.still;
    if (cap) {
      const m = r.file.measures;
      const measured: Record<keyof AssetCaps, number | null> = {
        bytes: r.file.bytes,
        triangles: m?.kind === "glb" ? m.triangles : null,
        texture_bytes: m?.kind === "glb" ? m.texture_bytes : null,
      };
      const over: string[] = [];
      for (const key of ["bytes", "triangles", "texture_bytes"] as const) {
        const limit = cap[key];
        const value = measured[key];
        if (limit !== undefined && value !== null && value > limit)
          over.push(`${count(value)} ${key.replace("_", " ")} over main's per_asset.${kind} cap of ${count(limit)}`);
      }
      if (over.length > 0) refuse(path, "RA4", "-", over.join("; "));
    }
  }
  // RA6: the twin's line, from main's approval of the model's current SHA-256 (FR-015).
  const line = lineFor(policy, model?.file ?? null);
  if (model && line === null)
    refuse(
      model.file.path,
      "RA6",
      "-",
      "no approval in main's assets/policy/approvals.json names the twin's model's current SHA-256 with a disclosure " +
        "line, so none of the twin's files is shown",
    );
  const on = (r: TwinRead): string[] => rules.get(r.file.path) ?? [];
  const modelWhy = (): string | null => {
    if (model === null) return "no-model";
    const standing = on(model).filter((rule) => rule !== "RA6");
    if (standing.length > 0) return standing.join(", ");
    if (!caps?.avatar) return "no-caps";
    return line === null ? "RA6" : null;
  };
  const modelBundled = modelWhy() === null;
  const finish = (r: TwinRead): TwinFile => {
    const role = r.file.role;
    let why: string | null;
    if (role === null) why = "no-role";
    else if (role === "model") why = modelWhy();
    else {
      const standing = on(r);
      const cap = role === "still" ? caps?.still : caps?.animation;
      if (standing.length > 0) why = standing.join(", ");
      else if (!caps?.avatar || !cap) why = "no-caps";
      else if (line === null) why = "RA6";
      else if (role !== "still" && !modelBundled) why = "no-model";
      else why = null;
    }
    return { ...r.file, bundled: why === null, why };
  };
  const files = reads.map(finish);
  return {
    model: files.find((f) => f.role === "model") ?? null,
    clips: TWIN_CLIP_ROLES.flatMap((role) => files.filter((f) => f.role === role)),
    still: files.find((f) => f.role === "still") ?? null,
    others: files.filter((f) => f.role === null),
    line: modelBundled ? line : line !== null && files.some((f) => f.role === "still" && f.bundled) ? line : null,
    texture_px: block.twin_texture_px,
    problems,
  };
}

/** The twin of a compose, read once for its tree, policy, and scene, as avatarsOf reads the visitors'. */
const twins = new WeakMap<Tree, { policy: RoomPolicy; scene: Scene | null; set: TwinSet }>();
export function twinOf(tree: Tree, policy: RoomPolicy, scene: Scene | null): TwinSet {
  const hit = twins.get(tree);
  if (hit && hit.policy === policy && hit.scene === scene) return hit.set;
  const set = readTwin(tree, policy, scene);
  twins.set(tree, { policy, scene, set });
  return set;
}

/** The twin's bundled GLBs: its model, then its bundled clips; none where its model isn't bundled. */
export function twinGlbs(twin: TwinSet): TwinFile[] {
  if (!twin.model?.bundled) return [];
  return [twin.model, ...twin.clips.filter((c) => c.bundled)];
}
