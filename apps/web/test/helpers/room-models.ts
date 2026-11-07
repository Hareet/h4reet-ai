// Set models for the compositor's output tests (spec 004, T068, T080, T081; contracts/plain-model-fit.md §12): a clean
// model for any fixture catalog entry, made when the test runs (spec 003's rule A1 refuses a committed one), and the
// overlay that sets it. The model is a box filling the entry's expected bounds at its stylized scale, with one plain
// quad per live face, named for its role, at the face's centre, size, facing, and up times that scale: so it passes
// RX1 to RX10 and its piece's budget, and its measured bounds are the expected ones exactly. A policy with the room's
// caps comes with it, since a model is set only while main has the caps' room block (contracts/room-bundle.md §2).
import { createHash } from "node:crypto";

import { parse, stringify } from "yaml";

import { policyFrom } from "../../build/room/policy";
import type { RoomCaps, RoomPolicy } from "../../build/room/policy";
import type { Vec3 } from "../../src/room/glb/fit";
import { ModelBuilder } from "./glb";
import type { PackOptions } from "./glb";
import { goodFiles } from "./room-fixtures";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** What the model is made from: a catalog entry as its YAML holds it. */
interface Entry {
  readonly origin: { readonly bounds: { readonly min: Vec3; readonly max: Vec3 } };
  readonly stylized_scale?: number;
  readonly live_faces?: readonly {
    readonly role: string;
    readonly at: Vec3;
    readonly size: readonly [number, number];
    readonly facing: Vec3;
    readonly up?: Vec3;
  }[];
}

const times = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];

/** A clean model of a catalog entry: its bounds as a box, and a plain quad per live face, at its stylized scale; packed
 *  with `o`, so a test can leave the mark out or edit the file (`asExported`, for one). */
export function cleanModel(entry: Entry, o: PackOptions = {}): Uint8Array {
  const s = entry.stylized_scale ?? 1;
  const b = new ModelBuilder();
  const body = b.material({ pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0 } });
  const plain = b.material({ pbrMetallicRoughness: { baseColorFactor: [0.05, 0.05, 0.06, 1], metallicFactor: 0 } });
  const faces = entry.live_faces ?? [];
  const box = b.mesh([b.box(times(entry.origin.bounds.min, s), times(entry.origin.bounds.max, s), body)], "body");
  b.root(b.node({ name: "piece", children: faces.map((_, i) => i + 1).concat(faces.length + 1) }));
  faces.forEach((face) => {
    const quad = {
      centre: times(face.at, s),
      size: [face.size[0] * s, face.size[1] * s] as const,
      facing: face.facing,
      up: face.up ?? ([0, 1, 0] as const),
    };
    b.node({ name: face.role, mesh: b.mesh([b.quad(quad, plain)], face.role) });
  });
  b.node({ name: "body", mesh: box });
  return b.pack(o).bytes;
}

/** The known-good set's catalog entry of `piece`, as its YAML holds it. */
export function catalogEntry(piece: string): Record<string, unknown> {
  const data = goodFiles().get(`apps/web/room/catalog/${piece}.yaml`);
  if (!data) throw new Error(`no fixture catalog entry ${piece}`);
  return parse(decoder.decode(data)) as Record<string, unknown>;
}

/**
 * The changes that set a model on each of `pieces`: its catalog entry gains `model: {file: <piece>.glb}`, the model is
 * made under assets/room/, and assets/room/records.json records every one with the kind room and its SHA-256 (RI7).
 */
export function modelChanges(pieces: readonly string[]): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const entries: { file: string; sha256: string; kind: string }[] = [];
  for (const piece of [...pieces].sort()) {
    const entry = catalogEntry(piece);
    const model = cleanModel(entry as unknown as Entry);
    out[`apps/web/room/catalog/${piece}.yaml`] = encoder.encode(
      stringify({ ...entry, model: { file: `${piece}.glb` } }, { aliasDuplicateObjects: false }),
    );
    out[`assets/room/${piece}.glb`] = model;
    entries.push({ file: `${piece}.glb`, sha256: sha256(model), kind: "room" });
  }
  const record = { schema: 1, directory: "assets/room", license: "all-rights-reserved-2026", entries };
  out["assets/room/records.json"] = encoder.encode(`${JSON.stringify(record, null, 2)}\n`);
  return out;
}

/** Main's caps with a room block (FR-053's starting figures, but for the given keys), as a policy directory holds it. */
export function capsPolicy(room: Partial<RoomCaps> = {}): RoomPolicy {
  const block = {
    gzip_bytes: 2500000,
    triangles: 40000,
    small_props: [],
    small_prop_texture_px: 1024,
    scene_texture_bytes: 96000000,
    legibility_floor_css_px: 9,
    ...room,
  };
  const caps = { schema: 1, per_asset: { room: block }, first_visit_bytes: { phase2: 10000000, phase3: 25000000 } };
  return policyFrom(
    { caps: encoder.encode(`${JSON.stringify(caps, null, 2)}\n`), approvals: null, header: null },
    "policy-dir",
  );
}
