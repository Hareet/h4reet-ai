// Drafts and approvals (spec 002, T017; FR-012; contracts/resume-source.md §5, data-model.md §4). A content file, the
// resume's source or a narration script, is approved only when main's assets/policy/content-approvals.json lists the
// SHA-256 of its current bytes; anything else is a draft. The build reads main's policy from a policy directory, never
// the branch's copy and never with git: the image gets it as the named build context `policy` (web_image.py), and a
// checkout's prebuild (build/policy.ts) fills it with git show main:.
//
// This file is the build's convenience. The enforcement is tools/gates/content_check.py, human-only, which reads main's
// approvals itself and fails a build whose room-data.json publishes a file main doesn't approve.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import type { Plugin } from "vite";

/** main's two policy files, by their name in the policy directory, in the order the policy's digest takes them. */
export const POLICY_FILES = ["content-approvals.json", "resume-header.json"] as const;

export type ContentState = "approved" | "draft";

export interface PdfHeader {
  full_name: string;
  contact: string;
}

export interface Policy {
  /** The digests main approves. */
  approved: ReadonlySet<string>;
  /** resume-header.json's two slots, as main holds them; null without the file. */
  header: { full_name: string | null; contact: string | null } | null;
  /** Each policy file's bytes, or null when main doesn't hold it. */
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

function approvedDigests(data: Buffer | null): Set<string> {
  const name = POLICY_FILES[0];
  if (data === null) return new Set();
  const doc = parse(name, data);
  if (!isObject(doc) || doc.schema !== 1) refuse(name, "schema isn't 1");
  if (!Array.isArray(doc.approvals)) refuse(name, "approvals isn't a list");
  const digests = new Set<string>();
  doc.approvals.forEach((entry: unknown, i: number) => {
    const at = `approvals[${i}]`;
    if (!isObject(entry)) refuse(name, `${at} isn't an object`);
    if (typeof entry.id !== "string" || !ID.test(entry.id)) refuse(name, `${at}.id isn't C-nnnn`);
    if (typeof entry.path_when_approved !== "string" || entry.path_when_approved === "")
      refuse(name, `${at}.path_when_approved is missing`);
    if (entry.kind !== "resume" && entry.kind !== "narration") refuse(name, `${at}.kind isn't resume or narration`);
    if (typeof entry.sha256 !== "string" || !SHA256.test(entry.sha256))
      refuse(name, `${at}.sha256 isn't 64 lowercase hex`);
    if (typeof entry.date !== "string" || !DATE.test(entry.date)) refuse(name, `${at}.date isn't YYYY-MM-DD`);
    if (typeof entry.reason !== "string") refuse(name, `${at}.reason is missing`);
    digests.add(entry.sha256);
  });
  return digests;
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

/** main's policy, from the policy directory. A missing directory or file is absent: nothing approved, no header. */
export function readPolicy(dir: string): Policy {
  const read = (name: string): Buffer | null => {
    const path = join(dir, name);
    return existsSync(path) && lstatSync(path).isFile() ? readFileSync(path) : null;
  };
  const files = { "content-approvals.json": read(POLICY_FILES[0]), "resume-header.json": read(POLICY_FILES[1]) };
  return { approved: approvedDigests(files[POLICY_FILES[0]]), header: header(files[POLICY_FILES[1]]), files };
}

/** The policy's digest, as web_image.py labels the image: each file's name and SHA-256, or "absent", in order. */
export function policyDigest(policy: Policy): string {
  const text = POLICY_FILES.map((name) => {
    const data = policy.files[name];
    return `${name}:${data === null ? "absent" : sha256(data)}\n`;
  }).join("");
  return sha256(Buffer.from(text));
}

export function stateOf(data: Uint8Array, policy: Policy): ContentState {
  return policy.approved.has(sha256(data)) ? "approved" : "draft";
}

/** The PDF's full header when main fills both slots; null gives the PDF the room's header (FR-017). */
export function pdfHeader(policy: Policy): PdfHeader | null {
  const h = policy.header;
  if (h === null || !h.full_name || !h.contact) return null;
  return { full_name: h.full_name, contact: h.contact };
}

/** The room's content files under a tree: the resume's source, then the narration scripts in name order. */
export function contentFiles(root: string, policy: Policy): ContentFile[] {
  const content = posix.join("apps", "web", "content");
  const paths: string[] = [];
  if (existsSync(join(root, content, "resume.yaml"))) paths.push(posix.join(content, "resume.yaml"));
  const narration = join(root, content, "narration");
  if (existsSync(narration)) {
    for (const name of readdirSync(narration).sort()) {
      if (name.endsWith(".md")) paths.push(posix.join(content, "narration", name));
    }
  }
  return paths.map((path) => {
    const full = join(root, path);
    if (!lstatSync(full).isFile()) throw new Error(`${path}: a content file must be a regular file, not a link`);
    const data = readFileSync(full);
    return { path, sha256: sha256(data), state: stateOf(data, policy) };
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

/** room-data.json's parts this phase writes (data-model.md §5): the policy built with, and every draft. */
export function roomData(
  files: readonly ContentFile[],
  policy: Policy,
): { built_from: { policy: string }; drafts: string[] } {
  return {
    built_from: { policy: policyDigest(policy) },
    drafts: files.filter((f) => f.state === "draft").map((f) => f.path),
  };
}

/** The Vite plugin: room-data.json, from the tree's content and the policy directory, at build. */
export function roomDataFile(options: { root: string; policyDir: () => string }): Plugin {
  return {
    name: "h4-room-data",
    apply: "build",
    generateBundle() {
      const policy = readPolicy(options.policyDir());
      const data = roomData(contentFiles(options.root, policy), policy);
      this.emitFile({ type: "asset", fileName: "room-data.json", source: `${JSON.stringify(data, null, 2)}\n` });
    },
  };
}
