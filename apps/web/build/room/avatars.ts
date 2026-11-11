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
// Nothing here reads under assets/twin/ (FR-012): the stand-in is a visitor avatar, read from its own folder.
import { createHash } from "node:crypto";

import { AVATARS, CLIP_ROLES } from "../../src/choice/avatars";
import type { AvatarId, ClipRole } from "../../src/choice/avatars";
import { textureMemory } from "../../src/room/glb/fit";
import { gzip9 } from "../../src/room/glb/gzip";
import { readImage } from "../../src/room/glb/images";
import { isObject, strictJson } from "../../src/room/glb/json";
import { readGlb } from "../../src/room/glb/read";
import { count } from "../../src/room/glb/rules";
import { capSides } from "../../src/room/scene/ledger";
import type { Problem } from "./checks/family";
import type { AssetCaps, RoomPolicy } from "./policy";
import { FIGURES_DEFAULTS } from "./schema";
import type { Scene } from "./schema";
import type { Tree } from "./source";

export const VISITORS_DIR = "assets/visitors";
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
}

export interface AvatarSet {
  /** The block resolved; its stand-in null where RA3 refuses it, so the twin keeps its capsule. */
  readonly figures: FigureBlock;
  /** Each avatar of the table whose folder holds a file, in the table's order. */
  readonly avatars: readonly Avatar[];
  /** RA1 to RA4, by file, then rule. */
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
    twin_texture_px:
      (block as { twin?: { texture_px?: number } } | undefined)?.twin?.texture_px ??
      block?.texture_px ??
      FIGURES_DEFAULTS.texture_px,
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
      // RA4: main's per-asset caps for its kind, as spec 003's F2 measures it.
      const cap = role === "model" ? caps?.avatar : caps?.animation;
      if (cap) {
        const over = overCaps(r.file as AvatarFile, cap, role === "model" ? "avatar" : "animation");
        if (over.length > 0) refuse(r, "RA4", "-", over.join("; "));
      }
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
