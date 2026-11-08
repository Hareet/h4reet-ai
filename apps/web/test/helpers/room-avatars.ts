// The room's avatars for the compositor's and the loader's tests (spec 009, T010, T012; plan.md §3.1, §3.5; FR-009,
// FR-037, FR-038): each avatar's folder under assets/visitors/<id>/ as the Author's intake lays one out (its model,
// its clips by role, its records.json with the model's kind `avatar` and each clip's `animation`, and its LICENSE.md),
// made when the test runs from test/helpers/glb.ts, since spec 003's rule A1 refuses a committed model; main's caps with
// the avatar and animation blocks beside the room's, as assets/policy/caps.json holds them; and the fixture scene
// naming a stand-in in its `figures` block.
import { createHash } from "node:crypto";

import { parse, stringify } from "yaml";

import { policyFrom } from "../../build/room/policy";
import type { RoomCaps, RoomPolicy } from "../../build/room/policy";
import { avatarClips, avatarGlb } from "./glb";
import type { AvatarGlbOptions, Model } from "./glb";
import { goodFiles } from "./room-fixtures";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

export const SCENE = "apps/web/room/scene.yaml";
export const VISITORS = "assets/visitors";

/** Main's per_asset.avatar and per_asset.animation, as assets/policy/caps.json holds them (ADR 0010, accepted). */
export const AVATAR_CAPS = {
  avatar: { bytes: 6_000_000, triangles: 90_000, texture_bytes: 33_554_432 },
  animation: { bytes: 1_000_000 },
} as const;

/** The room block FR-053's starting figures give, as test/helpers/room-models.ts's capsPolicy writes it. */
const ROOM_CAPS: RoomCaps = {
  gzip_bytes: 2_500_000,
  triangles: 40_000,
  small_props: [],
  small_prop_texture_px: 1024,
  scene_texture_bytes: 96_000_000,
  legibility_floor_css_px: 9,
};

export interface AvatarPolicyOptions {
  readonly room?: Partial<RoomCaps>;
  /** per_asset.avatar, or null for a caps file without it. */
  readonly avatar?: Readonly<Record<string, number>> | null;
  /** per_asset.animation, or null for a caps file without it. */
  readonly animation?: Readonly<Record<string, number>> | null;
  /** first_visit_bytes.phase3. */
  readonly phase3?: number;
}

/** A policy whose caps.json holds the room block and, unless null, the avatar and animation blocks, as a policy
 *  directory would. */
export function avatarPolicy(o: AvatarPolicyOptions = {}): RoomPolicy {
  const perAsset: Record<string, unknown> = { room: { ...ROOM_CAPS, ...o.room } };
  if (o.avatar !== null) perAsset.avatar = o.avatar ?? AVATAR_CAPS.avatar;
  if (o.animation !== null) perAsset.animation = o.animation ?? AVATAR_CAPS.animation;
  const caps = {
    schema: 1,
    adr_0010: "accepted",
    per_asset: perAsset,
    first_visit_bytes: { phase2: 10_000_000, phase3: o.phase3 ?? 25_000_000 },
  };
  return policyFrom(
    { caps: encoder.encode(`${JSON.stringify(caps, null, 2)}\n`), approvals: null, header: null },
    "policy-dir",
  );
}

/** One records.json entry, as spec 003's contracts/asset-record.md §5 writes one. */
export interface RecordEntry {
  file: string;
  sha256: string;
  kind: string;
  made: string;
  source: { type: string; id: string };
  likeness: boolean;
  steps: unknown[];
  media_license: string;
}

export interface AvatarFolderOptions {
  /** The model's bytes, or null for a folder without one; avatarGlb() by default. */
  readonly model?: Uint8Array | null;
  readonly modelOptions?: AvatarGlbOptions;
  /** Each clip's bytes by role; the three the studio delivered by default. A role with null is left out. */
  readonly clips?: Readonly<Record<string, Uint8Array | null>>;
  /** Other files in the folder, by name: RA5's. */
  readonly extra?: Readonly<Record<string, Uint8Array>>;
  /** Changes the records' entries before they're written; returning false leaves records.json out. */
  readonly records?: (entries: RecordEntry[]) => void | false;
}

/** The files of one avatar's folder, by repository path: `<id>.glb`, `<id>-<role>.glb`, records.json (sorted by file),
 *  and LICENSE.md with its copyright line filled. */
export function avatarFolder(id: string, o: AvatarFolderOptions = {}): Record<string, Uint8Array> {
  const dir = `${VISITORS}/${id}`;
  const files = new Map<string, Uint8Array>();
  const model = o.model === undefined ? avatarGlb(o.modelOptions).bytes : o.model;
  if (model !== null) files.set(`${id}.glb`, model);
  const defaults = avatarClips({ unit: o.modelOptions?.unit ?? 1 });
  const clips: Record<string, Uint8Array | null> = {
    idle: defaults.idle.bytes,
    "idle-holding": defaults["idle-holding"].bytes,
    take: defaults.take.bytes,
    ...o.clips,
  };
  for (const [role, data] of Object.entries(clips)) if (data !== null) files.set(`${id}-${role}.glb`, data);
  for (const [name, data] of Object.entries(o.extra ?? {})) files.set(name, data);
  const entries: RecordEntry[] = [...files]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([file, data]) => ({
      file,
      sha256: sha256(data),
      kind: file === `${id}.glb` ? "avatar" : "animation",
      made: "2026-11-07",
      source: { type: "prompt", id: "P-0042" },
      likeness: false,
      steps: [
        { name: "modelling", by: "hand", tools: [{ name: "Blender", version: "4.2", license: "gpl-3.0-or-later" }] },
      ],
      media_license: "all-rights-reserved-2026",
    }));
  const out: Record<string, Uint8Array> = {};
  for (const [name, data] of files) out[`${dir}/${name}`] = data;
  if (o.records?.(entries) !== false) {
    const record = { schema: 1, directory: dir, license: "all-rights-reserved-2026", entries };
    out[`${dir}/records.json`] = encoder.encode(`${JSON.stringify(record, null, 2)}\n`);
  }
  out[`${dir}/LICENSE.md`] = encoder.encode("Copyright (c) 2026 fx-holder. All rights reserved.\n");
  return out;
}

/** The fixture scene with a `figures` block: its stand-in (none for null), and any other keys given. */
export function sceneWith(figures: Readonly<Record<string, unknown>> | null): string {
  const scene = parse(decoder.decode(goodFiles().get(SCENE))) as Record<string, unknown>;
  if (figures === null) delete scene.figures;
  else scene.figures = { ...figures };
  return stringify(scene, { aliasDuplicateObjects: false });
}

/** The woman's and the man's folders, and the scene naming the man as the twin's stand-in: the default night's set. */
export function nightFiles(
  o: { woman?: AvatarFolderOptions; man?: AvatarFolderOptions; figures?: Record<string, unknown> } = {},
): Record<string, Uint8Array | string> {
  return {
    [SCENE]: sceneWith({ twin_stand_in: "man", ...o.figures }),
    ...avatarFolder("woman", o.woman),
    ...avatarFolder("man", o.man),
  };
}

/** A model's bytes, packed: avatarGlb()'s with these options. */
export const avatarModel = (o: AvatarGlbOptions = {}): Model => avatarGlb(o);
