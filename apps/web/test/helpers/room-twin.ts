// The twin's own avatar for the compositor's and the room's tests (spec 016, T006 to T010; plan.md R-01 to R-04;
// contracts/twin-data.md): the twin's folder under assets/twin/ as the Author's intake lays it out, its model
// `twin.glb`, its clips by role for the closed list (`idle.glb` to `desk-lean.glb`), its still `still.png`, its
// records.json with each file's kind (`avatar`, `animation`, `still`), and its LICENSE.md; made when the test runs from
// test/helpers/glb.ts, since spec 003's rule A1 refuses a committed model. And main's policy as a policy directory
// would hold it: the caps with the avatar, animation, and still blocks beside the room's, and the likeness approvals,
// approvals.json, whose entry for the model's SHA-256 carries a fixture's line, never the Author's: no source file may
// hold his (SC-003).
import { createHash } from "node:crypto";

import { parseDocument } from "yaml";

import { policyFrom } from "../../build/room/policy";
import type { RoomCaps, RoomPolicy } from "../../build/room/policy";
import { overlayTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { avatarGlb, clipGlb, IDLE_TRACKS, png } from "./glb";
import type { AvatarGlbOptions, ClipTrack } from "./glb";

const encoder = new TextEncoder();
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

export const TWIN_DIR = "assets/twin";
/** The twin's clip roles, in the closed list's order (FR-009). */
export const TWIN_ROLES = ["idle", "talking", "listening", "greeting", "desk-lean"] as const;
/** A fixture's line, never the Author's. */
export const FX_LINE = "The fixture twin is a made-up likeness, shown for the tests.";
/** The fixture model's height, as the delivered model's: 1.82 m to its top. */
export const TWIN_HEIGHT = 1.82;
/** The still's caps as main's caps.json gives them. */
export const STILL_CAPS = { bytes: 300_000 } as const;

/** A clip's channels: a small turn of the hips, so each clip moves only nodes the model names. */
const tracksOf = (role: string): readonly ClipTrack[] => {
  if (role === "idle") return IDLE_TRACKS;
  const a = 0.05 * (TWIN_ROLES.indexOf(role as (typeof TWIN_ROLES)[number]) + 1);
  return [
    {
      bone: "mixamorig:Hips",
      path: "rotation",
      values: [
        [0, 0, 0, 1],
        [0, Math.sin(a), 0, Math.cos(a)],
      ],
    },
  ];
};

const LENGTHS: Readonly<Record<string, number>> = {
  idle: 4,
  talking: 6,
  listening: 5,
  greeting: 2.47,
  "desk-lean": 6,
};

let defaults: { model: Uint8Array; clips: Record<string, Uint8Array>; still: Uint8Array } | null = null;

/** The default model, clips, and still, made once a run: the model 1.82 m tall, each clip its role's length. */
export function twinDefaults(): { model: Uint8Array; clips: Record<string, Uint8Array>; still: Uint8Array } {
  defaults ??= {
    model: avatarGlb({ height: TWIN_HEIGHT }).bytes,
    clips: Object.fromEntries(
      TWIN_ROLES.map((role) => [role, clipGlb(role, { tracks: tracksOf(role), duration: LENGTHS[role] ?? 1 }).bytes]),
    ),
    still: png({ width: 48, height: 64 }),
  };
  return defaults;
}

/** The twin's model with other options: its images, its height. */
export function twinModel(o: AvatarGlbOptions = {}): Uint8Array {
  return avatarGlb({ height: TWIN_HEIGHT, ...o }).bytes;
}

/** One records.json entry, as spec 003's contracts/asset-record.md §5 writes one. */
export interface TwinRecordEntry {
  file: string;
  sha256: string;
  kind: string;
  made: string;
  source: { type: string; id: string };
  likeness: boolean;
  approval?: string;
  media_license: string;
}

export interface TwinFolderOptions {
  /** The model's bytes, or null for a folder without one. */
  readonly model?: Uint8Array | null;
  /** Each clip's bytes by role; the five by default. A role with null is left out. */
  readonly clips?: Readonly<Record<string, Uint8Array | null>>;
  /** The still's bytes, or null for none. */
  readonly still?: Uint8Array | null;
  /** Other files in the folder, by name: RA5's. */
  readonly extra?: Readonly<Record<string, Uint8Array>>;
  /** Changes the records' entries before they're written; returning false leaves records.json out. */
  readonly records?: (entries: TwinRecordEntry[]) => void | false;
}

/** The kind each of the twin's files is recorded with (FR-009). */
export function twinKindOf(name: string): string {
  if (name === "twin.glb") return "avatar";
  if (name === "still.png") return "still";
  return "animation";
}

/** The files of the twin's folder, by repository path: twin.glb, <role>.glb, still.png, records.json (sorted by file),
 *  and LICENSE.md with its copyright line filled. */
export function twinFolder(o: TwinFolderOptions = {}): Record<string, Uint8Array> {
  const d = twinDefaults();
  const files = new Map<string, Uint8Array>();
  const model = o.model === undefined ? d.model : o.model;
  if (model !== null) files.set("twin.glb", model);
  const clips: Record<string, Uint8Array | null> = { ...d.clips, ...o.clips };
  for (const role of Object.keys(clips)) {
    const data = clips[role];
    if (data) files.set(`${role}.glb`, data);
  }
  const still = o.still === undefined ? d.still : o.still;
  if (still !== null) files.set("still.png", still);
  for (const [name, data] of Object.entries(o.extra ?? {})) files.set(name, data);
  const entries: TwinRecordEntry[] = [...files]
    .filter(([name]) => !Object.hasOwn(o.extra ?? {}, name))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([file, data]) => ({
      file,
      sha256: sha256(data),
      kind: twinKindOf(file),
      made: "2026-11-10",
      source: { type: "photo", id: "H01" },
      likeness: true,
      approval: `A-fx-${file.replace(/\.[a-z]+$/, "")}`,
      media_license: "all-rights-reserved-2026",
    }));
  const out: Record<string, Uint8Array> = {};
  for (const [name, data] of files) out[`${TWIN_DIR}/${name}`] = data;
  if (o.records?.(entries) !== false) {
    const record = { schema: 1, directory: TWIN_DIR, license: "all-rights-reserved-2026", entries };
    out[`${TWIN_DIR}/records.json`] = encoder.encode(`${JSON.stringify(record, null, 2)}\n`);
  }
  out[`${TWIN_DIR}/LICENSE.md`] = encoder.encode("Copyright (c) 2026 fx-holder. All rights reserved.\n");
  return out;
}

/** One likeness approval, as main's assets/policy/approvals.json holds one. */
export interface LikenessEntry {
  readonly id: string;
  readonly sha256: string;
  readonly line: string | null;
}

/** approvals.json's text for its entries. */
export function likenessText(entries: readonly LikenessEntry[]): string {
  return `${JSON.stringify(
    {
      schema: 1,
      approvals: entries.map((e) => ({
        id: e.id,
        sha256: e.sha256,
        path_when_approved: "assets/twin/twin.glb",
        kind: "avatar",
        date: "2026-11-10",
        confirms: {},
        disclosure_line: e.line,
        reason: "Fixture approval.",
      })),
    },
    null,
    2,
  )}\n`;
}

/** The room block FR-053's starting figures give. */
const ROOM_CAPS: RoomCaps = {
  gzip_bytes: 2_500_000,
  triangles: 40_000,
  small_props: [],
  small_prop_texture_px: 1024,
  scene_texture_bytes: 96_000_000,
  legibility_floor_css_px: 9,
};

export interface TwinPolicyOptions {
  readonly room?: Partial<RoomCaps>;
  /** per_asset.avatar, or null for a caps file without it. */
  readonly avatar?: Readonly<Record<string, number>> | null;
  readonly animation?: Readonly<Record<string, number>> | null;
  readonly still?: Readonly<Record<string, number>> | null;
  readonly phase3?: number;
  /** The likeness approvals; by default one approving the default model with the fixture's line; null for no file. */
  readonly likeness?: readonly LikenessEntry[] | null;
}

/** The default model's approval with the fixture's line. */
export function approvalOf(model: Uint8Array = twinDefaults().model, line: string | null = FX_LINE): LikenessEntry {
  return { id: "A-fx-twin", sha256: sha256(model), line };
}

/** A policy whose caps.json holds the room block and the avatar, animation, and still blocks, and whose approvals.json
 *  approves the twin's model with the fixture's line, as a policy directory would. */
export function twinPolicy(o: TwinPolicyOptions = {}): RoomPolicy {
  const perAsset: Record<string, unknown> = { room: { ...ROOM_CAPS, ...o.room } };
  if (o.avatar !== null)
    perAsset.avatar = o.avatar ?? { bytes: 21_000_000, triangles: 180_000, texture_bytes: 46_000_000 };
  if (o.animation !== null) perAsset.animation = o.animation ?? { bytes: 1_000_000 };
  if (o.still !== null) perAsset.still = o.still ?? STILL_CAPS;
  const caps = {
    schema: 1,
    adr_0010: "accepted",
    per_asset: perAsset,
    first_visit_bytes: { phase2: 10_000_000, phase3: o.phase3 ?? 25_000_000 },
  };
  const likeness = o.likeness === undefined ? [approvalOf()] : o.likeness;
  return policyFrom(
    {
      caps: encoder.encode(`${JSON.stringify(caps, null, 2)}\n`),
      approvals: null,
      header: null,
      ...(likeness === null ? {} : { likeness: encoder.encode(likenessText(likeness)) }),
    },
    "policy-dir",
  );
}

/** The room's scene, as the repository holds it. */
const ROOM_SCENE = "apps/web/room/scene.yaml";

/** A tree whose scene has the lean's data line put back in its twin block, as it stood until the Author's answer of
 *  2026-11-11, "Lean off for now (Recommended)", took it out (plan.md R-19): against the survey's desk, at the
 *  hand-back's 0.679 m behind and 0.45 m to the right. It comes back so with the studio's re-export of the lean. */
export function withLean(tree: Tree): Tree {
  const text = new TextDecoder().decode(tree.read(ROOM_SCENE) ?? new Uint8Array());
  const doc = parseDocument(text);
  const desk = doc.getIn(["survey", "desk_corner", "placement"]);
  if (typeof desk !== "string") throw new Error("the scene's survey names no desk");
  doc.setIn(
    ["figures", "twin", "lean"],
    doc.createNode({ against: desk, behind_m: 0.679, right_m: 0.45 }, { flow: true }),
  );
  return overlayTree(tree, new Map([[ROOM_SCENE, new TextEncoder().encode(doc.toString())]]));
}
