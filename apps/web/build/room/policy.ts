// The room's policy (spec 004; FR-052, FR-053; Amendment C7; R-13, R-25; contracts/room-bundle.md §1, §2): main's
// caps for the room, `per_asset.room` in assets/policy/caps.json, and with them main's content approvals and the PDF
// header's full name, from the first source that exists:
// 1. ROOM_POLICY_DIR ("policy-dir"): the policy directory spec 002's build reads, the named context `policy` in the
//    web image, which web_image.py fills from main on the host;
// 2. main ("main"), where the repository's root holds a .git: each file by `git cat-file blob refs/heads/main:<path>`
//    with GIT_NO_REPLACE_OBJECTS=1 and git's own minimum of settings (build/policy.ts's gitShow), never a bare `main`,
//    which a tag of that name would answer, and never the branch's own copy, so a branch can't raise its caps;
// 3. the export's own copy ("export"), only where there is no .git: the gate's container, where spec 003's rule A9
//    keeps it equal to main's at the branch's base.
// A policy directory that holds no caps.json (the tests' global builds, an image built with no policy context, such
// as the gate's image step and the phone copy) gives the caps alone from the next source, 2 or 3 as above, so such a
// build applies main's caps; its approvals and header stay the directory's, so nothing is approved without them
// (T328). In a checkout that is main's by its full ref, never the branch's copy; elsewhere the tree's own, which A9
// holds to main's at the branch's base, so agents still never raise a cap.
// Without a room block the source is "defaults": FR-053's starting figures, every model a stand-in (no-caps). This
// module does the I/O so compose() stays pure. A block that's malformed is RK4's: the reader keeps it raw, with its
// problems by path, never quoting a value, and the RK family (T078) reports them; such a block gives no caps.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isIntegerAt, isObject, strictJson } from "../../src/room/glb/json";
import type { Json, JsonObject } from "../../src/room/glb/json";
import { gitShow } from "../policy";
import type { Show } from "../policy";
import { formatPath } from "./checks/family";
import { ID } from "./schema";

/** `per_asset.room` (Amendment C7). */
export interface RoomCaps {
  /** Per piece: its served .glb.gz's length at gzip level 9. */
  readonly gzip_bytes: number;
  /** Per piece. */
  readonly triangles: number;
  /** Piece IDs, which are also the files' stems: the pieces `small_prop_texture_px` caps. */
  readonly small_props: readonly string[];
  readonly small_prop_texture_px: number;
  /** The whole scene's texture memory on a phone (RK3). */
  readonly scene_texture_bytes: number;
  /** FR-052's floor, a cap height in CSS pixels. */
  readonly legibility_floor_css_px: number;
}

export type CapsSource = "policy-dir" | "main" | "export" | "defaults";

/** What's wrong with the caps file or its room block, by its path in the file, for RK4. */
export interface CapsProblem {
  readonly path: string;
  readonly reason: string;
}

/** contracts/room-bundle.md §1's RoomPolicy, with the raw block and its problems for RK4, and the name RT2 needs. */
export interface RoomPolicy {
  /** Null while main has no room block, or a malformed one. */
  readonly caps: RoomCaps | null;
  readonly caps_source: CapsSource;
  /** Of assets/policy/caps.json as read; null when no file was. */
  readonly caps_sha256: string | null;
  /** `first_visit_bytes.phase3`, the report's enforced limit; 25,000,000 when absent. */
  readonly phase3_bytes: number;
  /** Main's content-approvals.json (spec 002), as read. */
  readonly approvals: readonly { readonly sha256: string; readonly kind: string }[];
  /** `per_asset.room` as read, before any check; undefined when absent or the file doesn't parse. RK4's to report. */
  readonly caps_block: unknown;
  /** What's wrong with caps.json or its room block: `-` for a file that doesn't parse. RK4's to report. */
  readonly caps_problems: readonly CapsProblem[];
  /** Main's resume-header.json `full_name` (spec 002), for RT2's surname rule; null without one. */
  readonly full_name: string | null;
}

/** FR-053's starting figures: the caps while main has no room block. */
export const CAPS_DEFAULTS: RoomCaps = Object.freeze({
  gzip_bytes: 2_500_000,
  triangles: 40_000,
  small_props: Object.freeze([]),
  small_prop_texture_px: 1024,
  scene_texture_bytes: 96_000_000,
  legibility_floor_css_px: 9,
});

/** Spec 003's phase-3 first visit, the report's enforced limit while caps.json doesn't give one. */
export const PHASE3_DEFAULT = 25_000_000;

export const CAPS_PATH = "assets/policy/caps.json";
export const APPROVALS_PATH = "assets/policy/content-approvals.json";
export const HEADER_PATH = "assets/policy/resume-header.json";
/** The same files in a policy directory, as build/approvals.ts's POLICY_FILES names them. */
const IN_POLICY_DIR = { caps: "caps.json", approvals: "content-approvals.json", header: "resume-header.json" } as const;

/** The policy's three files, as one source holds them; null for a file it lacks. */
export interface PolicyFiles {
  readonly caps: Uint8Array | null;
  readonly approvals: Uint8Array | null;
  readonly header: Uint8Array | null;
}

/** The caps a check takes: main's, or FR-053's starting figures. */
export function capsOf(policy: RoomPolicy): RoomCaps {
  return policy.caps ?? CAPS_DEFAULTS;
}

/** No policy at all: no caps, nothing approved, and no name. */
export function noPolicy(): RoomPolicy {
  return {
    caps: null,
    caps_source: "defaults",
    caps_sha256: null,
    phase3_bytes: PHASE3_DEFAULT,
    approvals: [],
    caps_block: undefined,
    caps_problems: [],
    full_name: null,
  };
}

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const SHA256 = /^[0-9a-f]{64}$/;
const KEYS = [
  "gzip_bytes",
  "triangles",
  "small_props",
  "small_prop_texture_px",
  "scene_texture_bytes",
  "legibility_floor_css_px",
] as const;
const isPowerOfTwo = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/** The block's problems: RK4's missing key, unknown key, wrong type, out-of-range value, and small prop off the ID
 *  grammar or named twice. */
function blockProblems(block: Json): CapsProblem[] {
  const at = (...steps: (string | number)[]): string => formatPath(["per_asset", "room", ...steps]);
  if (!isObject(block)) return [{ path: at(), reason: "not an object" }];
  const out: CapsProblem[] = [];
  const integer = (key: (typeof KEYS)[number]): boolean => isIntegerAt(block, key) && (block[key] as number) > 0;
  for (const key of KEYS) {
    if (!Object.hasOwn(block, key)) {
      out.push({ path: at(key), reason: "a required key is missing" });
      continue;
    }
    const value = block[key];
    if (key === "small_props") {
      if (!Array.isArray(value)) {
        out.push({ path: at(key), reason: "not a list of piece IDs" });
        continue;
      }
      const seen = new Set<string>();
      value.forEach((id, i) => {
        if (typeof id !== "string" || !ID.test(id))
          out.push({ path: at(key, i), reason: `a piece ID outside the grammar ${ID.source}` });
        else if (seen.has(id)) out.push({ path: at(key, i), reason: "a piece named twice" });
        else seen.add(id);
      });
    } else if (key === "legibility_floor_css_px") {
      if (typeof value !== "number" || !(value > 0)) out.push({ path: at(key), reason: "not a number above 0" });
    } else if (!integer(key)) {
      out.push({ path: at(key), reason: "not an integer above 0" });
    } else if (key === "small_prop_texture_px" && !isPowerOfTwo(value as number)) {
      out.push({ path: at(key), reason: "not a power of two" });
    }
  }
  for (const key of Object.keys(block))
    if (!(KEYS as readonly string[]).includes(key))
      out.push({ path: at(key), reason: "a key the room block doesn't define" });
  return out;
}

/** Main's approvals, `{sha256, kind}` each; a malformed file stops the build, as spec 002's approvals.ts does. */
function approvalsOf(data: Uint8Array | null): { sha256: string; kind: string }[] {
  if (data === null) return [];
  const read = strictJson(data);
  const refuse = (why: string): never => {
    throw new Error(
      `main's ${APPROVALS_PATH} isn't the contract's shape (spec 002's contracts/resume-source.md §5): ${why}`,
    );
  };
  if (!read.ok) return refuse("not JSON");
  const doc = read.value;
  if (!isObject(doc) || !Array.isArray(doc.approvals)) return refuse("approvals isn't a list");
  return doc.approvals.map((entry, i) => {
    if (!isObject(entry) || typeof entry.sha256 !== "string" || !SHA256.test(entry.sha256))
      return refuse(`approvals[${i}].sha256 isn't 64 lowercase hex`);
    if (typeof entry.kind !== "string") return refuse(`approvals[${i}].kind isn't a string`);
    return { sha256: entry.sha256, kind: entry.kind };
  });
}

/** Main's resume-header.json `full_name`, or null. */
function fullNameOf(data: Uint8Array | null): string | null {
  if (data === null) return null;
  const read = strictJson(data);
  if (!read.ok || !isObject(read.value)) {
    throw new Error(`main's ${HEADER_PATH} isn't the contract's shape (spec 002's contracts/resume-source.md §5)`);
  }
  const name = read.value.full_name;
  return typeof name === "string" && name !== "" ? name : null;
}

/** The policy from its files as `source` holds them. Pure. */
export function policyFrom(files: PolicyFiles, source: Exclude<CapsSource, "defaults">): RoomPolicy {
  const base = { ...noPolicy(), approvals: approvalsOf(files.approvals), full_name: fullNameOf(files.header) };
  if (files.caps === null) return base;
  const caps_sha256 = sha256(files.caps);
  const read = strictJson(files.caps);
  if (!read.ok) {
    return {
      ...base,
      caps_source: source,
      caps_sha256,
      caps_problems: [{ path: "-", reason: "doesn't parse as strict JSON" }],
    };
  }
  const doc: JsonObject | null = isObject(read.value) ? read.value : null;
  const visit = doc && isObject(doc.first_visit_bytes ?? null) ? (doc.first_visit_bytes as JsonObject) : null;
  const phase3_bytes =
    visit && isIntegerAt(visit, "phase3") && (visit.phase3 as number) > 0 ? (visit.phase3 as number) : PHASE3_DEFAULT;
  const perAsset = doc && isObject(doc.per_asset ?? null) ? (doc.per_asset as JsonObject) : null;
  if (perAsset === null || !Object.hasOwn(perAsset, "room")) return { ...base, caps_sha256, phase3_bytes };
  const block = perAsset.room as Json;
  const caps_problems = blockProblems(block);
  if (caps_problems.length > 0)
    return { ...base, caps_source: source, caps_sha256, phase3_bytes, caps_block: block, caps_problems };
  const room = block as JsonObject;
  const caps: RoomCaps = {
    gzip_bytes: room.gzip_bytes as number,
    triangles: room.triangles as number,
    small_props: [...(room.small_props as string[])],
    small_prop_texture_px: room.small_prop_texture_px as number,
    scene_texture_bytes: room.scene_texture_bytes as number,
    legibility_floor_css_px: room.legibility_floor_css_px as number,
  };
  return { ...base, caps, caps_source: source, caps_sha256, phase3_bytes, caps_block: block };
}

/** The reader's I/O: the environment's ROOM_POLICY_DIR, the repository's root, and how main's blobs are read. */
export interface PolicyIo {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The repository's root, which holds .git in a checkout and not in the gate's export. */
  readonly root: string;
  /** Main's blob at a path, by refs/heads/main; build/policy.ts's gitShow by default. */
  readonly show?: Show;
}

/** A directory's regular file, or null. */
function fileIn(dir: string, name: string): Uint8Array | null {
  const path = join(dir, name);
  try {
    return existsSync(path) && lstatSync(path).isFile() ? new Uint8Array(readFileSync(path)) : null;
  } catch {
    return null;
  }
}

/** The caps file as the source after a policy directory holds it: main's by its full ref where the root holds a .git,
 *  never the branch's own copy, else the tree's own (T328). */
function nextCaps(io: PolicyIo): { readonly caps: Uint8Array | null; readonly source: "main" | "export" } {
  if (existsSync(join(io.root, ".git"))) {
    const data = (io.show ?? gitShow)(io.root, CAPS_PATH);
    return { caps: data === null ? null : new Uint8Array(data), source: "main" };
  }
  return { caps: fileIn(join(io.root, "assets", "policy"), IN_POLICY_DIR.caps), source: "export" };
}

/** The room's policy, from the first source that exists (contracts/room-bundle.md §2); a policy directory without
 *  caps.json takes the caps alone from the next source. */
export function readRoomPolicy(io: PolicyIo): RoomPolicy {
  const dir = io.env.ROOM_POLICY_DIR;
  if (dir) {
    const files = {
      caps: fileIn(dir, IN_POLICY_DIR.caps),
      approvals: fileIn(dir, IN_POLICY_DIR.approvals),
      header: fileIn(dir, IN_POLICY_DIR.header),
    };
    if (files.caps !== null) return policyFrom(files, "policy-dir");
    const next = nextCaps(io);
    return policyFrom({ ...files, caps: next.caps }, next.source);
  }
  if (existsSync(join(io.root, ".git"))) {
    const show = io.show ?? gitShow;
    const blob = (path: string): Uint8Array | null => {
      const data = show(io.root, path);
      return data === null ? null : new Uint8Array(data);
    };
    return policyFrom({ caps: blob(CAPS_PATH), approvals: blob(APPROVALS_PATH), header: blob(HEADER_PATH) }, "main");
  }
  const own = join(io.root, "assets", "policy");
  return policyFrom(
    {
      caps: fileIn(own, IN_POLICY_DIR.caps),
      approvals: fileIn(own, IN_POLICY_DIR.approvals),
      header: fileIn(own, IN_POLICY_DIR.header),
    },
    "export",
  );
}
