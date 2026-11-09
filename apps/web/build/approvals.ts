// Drafts and approvals (spec 002, T017; FR-012; contracts/resume-source.md §5, data-model.md §4). A content file, the
// resume's source or a narration script, is approved only when main's assets/policy/content-approvals.json lists the
// SHA-256 of its current bytes; anything else is a draft. The build reads main's policy from a policy directory, never
// the branch's copy and never with git: the image gets it as the named build context `policy` (web_image.py), and a
// checkout's prebuild (build/policy.ts) fills it from refs/heads/main with git cat-file.
//
// This file is the build's convenience. The enforcement is tools/gates/content_check.py, human-only, which reads main's
// approvals itself and fails a build whose room-data.json publishes a file main doesn't approve.
//
// Spec 004 (FR-030, FR-053; Amendment B9; its research.md R-13, R-57): an approval may name the kind room-text, so the
// Author's first room-text approval on main breaks no build, make up included; and main's assets/policy/caps.json is
// the policy's third file, read here as bytes for the room's compositor, which parses it. The room's text is content
// too (T186): its blocks, apps/web/content/room/*.yaml, then its outlines, apps/web/content/room/outlines/*.outline.json,
// each in name order after spec 002's files, each approved only by an entry of kind room-text, so a room-text file main
// approves under another kind stays a draft (data-model.md §6.4; the review of feat/004-setup, N1). The resume and the
// narration scripts keep spec 002's rule.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import type { Plugin } from "vite";

/** main's three policy files, by their name in the policy directory, in the order the policy's digest takes them:
 * spec 002's content approvals and PDF header, then spec 004's caps (R-13), as build/policy.ts and web_image.py
 * name them too. */
export const POLICY_FILES = ["content-approvals.json", "resume-header.json", "caps.json"] as const;

/** The kinds an approval may name: spec 002's resume and narration, and spec 004's room text (Amendment B9). The
 * human-only content check checks room text only once P-9 gives it the kind; until then, it fails closed. */
export const APPROVAL_KINDS: readonly string[] = ["resume", "narration", "room-text"];

export type ContentState = "approved" | "draft";

export interface PdfHeader {
  full_name: string;
  contact: string;
}

export interface Policy {
  /** The digests main approves, under any kind: spec 002's rule for the resume and the narration scripts. */
  approved: ReadonlySet<string>;
  /** The digests main approves under the kind room-text: the room text's rule (spec 004, T186). */
  roomText: ReadonlySet<string>;
  /** resume-header.json's two slots, as main holds them; null without the file. */
  header: { full_name: string | null; contact: string | null } | null;
  /** Each policy file's bytes, or null when main doesn't hold it. caps.json stays bytes here: the room's compositor
   * parses it (spec 004's contracts/room-bundle.md §2). */
  files: Readonly<Record<(typeof POLICY_FILES)[number], Buffer | null>>;
}

export interface ContentFile {
  /** The path from the repository's root, as content-approvals.json's path_when_approved writes it. */
  path: string;
  sha256: string;
  state: ContentState;
}

const SHA256 = /^[0-9a-f]{64}$/;
const ID = /^C-\d{4}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function refuse(name: string, why: string): never {
  throw new Error(`main's ${name} isn't the contract's shape (contracts/resume-source.md §5): ${why}`);
}

function parse(name: string, data: Buffer): unknown {
  try {
    return JSON.parse(data.toString("utf8")) as unknown;
  } catch {
    return refuse(name, "not JSON");
  }
}

function approvedDigests(data: Buffer | null): { all: Set<string>; roomText: Set<string> } {
  const name = POLICY_FILES[0];
  if (data === null) return { all: new Set(), roomText: new Set() };
  const doc = parse(name, data);
  if (!isObject(doc) || doc.schema !== 1) refuse(name, "schema isn't 1");
  if (!Array.isArray(doc.approvals)) refuse(name, "approvals isn't a list");
  const digests = new Set<string>();
  const roomText = new Set<string>();
  doc.approvals.forEach((entry: unknown, i: number) => {
    const at = `approvals[${i}]`;
    if (!isObject(entry)) refuse(name, `${at} isn't an object`);
    if (typeof entry.id !== "string" || !ID.test(entry.id)) refuse(name, `${at}.id isn't C-nnnn`);
    if (typeof entry.path_when_approved !== "string" || entry.path_when_approved === "")
      refuse(name, `${at}.path_when_approved is missing`);
    if (typeof entry.kind !== "string" || !APPROVAL_KINDS.includes(entry.kind))
      refuse(name, `${at}.kind isn't resume, narration, or room-text`);
    if (typeof entry.sha256 !== "string" || !SHA256.test(entry.sha256))
      refuse(name, `${at}.sha256 isn't 64 lowercase hex`);
    if (typeof entry.date !== "string" || !DATE.test(entry.date)) refuse(name, `${at}.date isn't YYYY-MM-DD`);
    if (typeof entry.reason !== "string") refuse(name, `${at}.reason is missing`);
    digests.add(entry.sha256);
    if (entry.kind === "room-text") roomText.add(entry.sha256);
  });
  return { all: digests, roomText };
}

function header(data: Buffer | null): Policy["header"] {
  const name = POLICY_FILES[1];
  if (data === null) return null;
  const doc = parse(name, data);
  if (!isObject(doc) || doc.schema !== 1) refuse(name, "schema isn't 1");
  const slot = (key: "full_name" | "contact"): string | null => {
    const value = doc[key];
    if (value !== null && typeof value !== "string") refuse(name, `${key} isn't a string or null`);
    return value;
  };
  return { full_name: slot("full_name"), contact: slot("contact") };
}

/** main's policy, from the policy directory. A missing directory or file is absent: nothing approved, no header, no
 * caps (the compositor then takes FR-053's starting figures). */
export function readPolicy(dir: string): Policy {
  const read = (name: string): Buffer | null => {
    const path = join(dir, name);
    return existsSync(path) && lstatSync(path).isFile() ? readFileSync(path) : null;
  };
  const files = {
    "content-approvals.json": read(POLICY_FILES[0]),
    "resume-header.json": read(POLICY_FILES[1]),
    "caps.json": read(POLICY_FILES[2]),
  };
  const approved = approvedDigests(files[POLICY_FILES[0]]);
  return { approved: approved.all, roomText: approved.roomText, header: header(files[POLICY_FILES[1]]), files };
}

/** The policy's digest, as web_image.py labels the image: each file's name and SHA-256, or "absent", in order. */
export function policyDigest(policy: Policy): string {
  const text = POLICY_FILES.map((name) => {
    const data = policy.files[name];
    return `${name}:${data === null ? "absent" : sha256(data)}\n`;
  }).join("");
  return sha256(Buffer.from(text));
}

/** A content file's state: approved when main approves its digest, under any kind for spec 002's files, and only under
 *  the kind room-text for the room's text. */
export function stateOf(data: Uint8Array, policy: Policy, kind?: "room-text"): ContentState {
  const approved = kind === "room-text" ? policy.roomText : policy.approved;
  return approved.has(sha256(data)) ? "approved" : "draft";
}

/** The PDF's full header when main fills both slots; null gives the PDF the room's header (FR-017). */
export function pdfHeader(policy: Policy): PdfHeader | null {
  const h = policy.header;
  if (h === null || !h.full_name || !h.contact) return null;
  return { full_name: h.full_name, contact: h.contact };
}

/** The files of a content folder under a tree whose names end in `suffix`, in name order, by repository path. */
function folder(root: string, dir: string, suffix: string): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .sort()
    .filter((name) => name.endsWith(suffix))
    .map((name) => posix.join(dir, name));
}

/** The room's content files under a tree: the resume's source, then the narration scripts, then the room text's
 *  blocks and its outlines, each in name order (spec 004, T186). */
export function contentFiles(root: string, policy: Policy): ContentFile[] {
  const content = posix.join("apps", "web", "content");
  const paths: { path: string; kind?: "room-text" }[] = [];
  if (existsSync(join(root, content, "resume.yaml"))) paths.push({ path: posix.join(content, "resume.yaml") });
  for (const path of folder(root, posix.join(content, "narration"), ".md")) paths.push({ path });
  for (const path of folder(root, posix.join(content, "room"), ".yaml")) paths.push({ path, kind: "room-text" });
  for (const path of folder(root, posix.join(content, "room", "outlines"), ".outline.json"))
    paths.push({ path, kind: "room-text" });
  return paths.map(({ path, kind }) => {
    const full = join(root, path);
    if (!lstatSync(full).isFile()) throw new Error(`${path}: a content file must be a regular file, not a link`);
    const data = readFileSync(full);
    return { path, sha256: sha256(data), state: stateOf(data, policy, kind) };
  });
}

/** ROOM_DRAFTS=1 shows drafts, bannered; anything else leaves them out (contracts/web-serving.md §1). */
export function draftsOn(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.ROOM_DRAFTS === "1";
}

/** Whether a file of this state is published, and under the "Draft, not approved" banner. */
export function publication(state: ContentState, drafts: boolean): { publish: boolean; banner: boolean } {
  if (state === "approved") return { publish: true, banner: false };
  return drafts ? { publish: true, banner: true } : { publish: false, banner: false };
}

export interface Published {
  path: string;
  sha256: string;
  /** Present, and true, only for a draft a drafts build shows under its banner. */
  draft?: true;
}

/** room-data.json (data-model.md §5): the policy built with, each content file the build published with its digest,
 * and every draft, then what each part adds. The gate's content check holds `published` to main's approvals, and
 * scans dist/ for a draft's text whatever this says. */
export interface RoomData {
  built_from: { policy: string } & Record<string, string | null>;
  published: Published[];
  drafts: string[];
  [part: string]: unknown;
}

/** What a part of room-data.json gets: the tree, its content files' states, main's policy, ROOM_DRAFTS, and a way
 * to emit a file of its own beside room-data.json (the resume's PDF and its text). */
export interface RoomDataContext {
  root: string;
  files: readonly ContentFile[];
  policy: Policy;
  drafts: boolean;
  emit(fileName: string, source: string | Uint8Array): void;
  warn(message: string): void;
  info?(message: string): void;
}

/** A part of room-data.json: the resume (build/content.ts), narration (build/narration.ts), and the room's text
 *  (build/room/text.ts). */
export type RoomDataPart = (data: RoomData, context: RoomDataContext) => RoomData | Promise<RoomData>;

/** room-data.json's own fields: the policy built with, each content file the build published with its digest, and
 * every draft. */
export function roomData(files: readonly ContentFile[], policy: Policy, drafts: boolean): RoomData {
  const published: Published[] = files
    .filter((f) => publication(f.state, drafts).publish)
    .map((f) =>
      f.state === "draft" ? { path: f.path, sha256: f.sha256, draft: true } : { path: f.path, sha256: f.sha256 },
    );
  return {
    built_from: { policy: policyDigest(policy) },
    published,
    drafts: files.filter((f) => f.state === "draft").map((f) => f.path),
  };
}

/** The Vite plugin: room-data.json, from the tree's content and the policy directory, at build, with each part's
 * fields and files. */
export function roomDataFile(options: {
  root: string;
  policyDir: () => string;
  parts?: readonly RoomDataPart[];
}): Plugin {
  return {
    name: "h4-room-data",
    apply: "build",
    async generateBundle() {
      const policy = readPolicy(options.policyDir());
      const files = contentFiles(options.root, policy);
      const context: RoomDataContext = {
        root: options.root,
        files,
        policy,
        drafts: draftsOn(process.env),
        emit: (fileName, source) => {
          this.emitFile({ type: "asset", fileName, source });
        },
        warn: (message) => this.warn(message),
        info: (message) => console.log(message),
      };
      let data = roomData(files, policy, context.drafts);
      for (const part of options.parts ?? []) data = await part(data, context);
      this.emitFile({ type: "asset", fileName: "room-data.json", source: `${JSON.stringify(data, null, 2)}\n` });
    },
  };
}
