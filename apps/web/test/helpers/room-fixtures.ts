// The compositor's fixtures, loaded (spec 004, T065; contracts/room-data-files.md §13 to §15; research.md R-66):
// test/fixtures/room/README.md gives the layout. `goodFiles()` is the known-good set, rooted like the repository, with
// the repository's own apps/web/fonts/ added for the typeface rules; `badCases()` reads every bad/<RULE>/ folder into an
// overlay of that set and the finding it must produce. A case is data: adding a folder adds a case, with no change here.
// Models are made when the test runs (test/helpers/glb.ts), since spec 003's rule A1 refuses a committed one.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import type { ComposeOptions } from "../../build/room/compose";
import { memoryTree, overlayTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { desk, rxVariants, sign } from "./glb";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
export const FIXTURES_DIR = here("../fixtures/room/");
export const GOOD_DIR = join(FIXTURES_DIR, "good");
export const BAD_DIR = join(FIXTURES_DIR, "bad");
/** The repository's vendored typefaces, which the known-good set takes as they are. */
const FONTS_DIR = here("../../fonts/");
const FONTS = "apps/web/fonts";

/** Every file under `dir`, by its path from `dir`, "/"-separated, in sorted order. */
function walk(dir: string, prefix = ""): [string, Uint8Array][] {
  const out: [string, Uint8Array][] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push([rel, new Uint8Array(readFileSync(full))]);
  }
  return out;
}

let good: ReadonlyMap<string, Uint8Array> | null = null;

/** The known-good set by repository path, the fonts included. A fresh map each call; the bytes are shared, never
 *  to be changed. */
export function goodFiles(): Map<string, Uint8Array> {
  good ??= new Map([...walk(GOOD_DIR), ...walk(FONTS_DIR).map(([rel, data]) => [`${FONTS}/${rel}`, data] as const)]);
  return new Map(good);
}

/** The known-good set as a tree, with its own log. */
export function goodTree(): Tree {
  return memoryTree(goodFiles());
}

/** An overlay of the known-good set: text or bytes replace a path, null removes a path and everything under it. */
export function overlay(changes: Readonly<Record<string, string | Uint8Array | null>>): Tree {
  const map = new Map<string, Uint8Array | null>();
  for (const [path, value] of Object.entries(changes)) map.set(path, typeof value === "string" ? bytes(value) : value);
  return overlayTree(goodTree(), map);
}

/** One known-bad case: an overlay of the known-good set, and the finding it must produce. */
export interface BadCase {
  /** Its folder under bad/, which starts with its rule. */
  readonly name: string;
  readonly rule: string;
  readonly file: string;
  readonly path: string;
  readonly why: string | null;
  readonly options: ComposeOptions;
  /** A path's new bytes, or null where the case takes the path out. */
  readonly changes: ReadonlyMap<string, Uint8Array | null>;
}

/** The case's tree: the known-good set under its changes. */
export function caseTree(c: BadCase): Tree {
  return overlayTree(goodTree(), c.changes);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const bytes = (text: string): Uint8Array => encoder.encode(text);
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** A raw string as bytes: each character one byte, so YAML's \xNN escapes write any byte. */
function rawBytes(text: string, where: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) throw new Error(`${where}: a raw file's characters are bytes, U+0000 to U+00FF`);
    out[i] = code;
  }
  return out;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Step = string | number;
interface Edit {
  readonly file: string;
  readonly at: readonly Step[];
  readonly set?: Json;
  readonly delete?: true;
  readonly push?: Json;
  readonly rename?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** One edit, in place: the value at `at` set, deleted, pushed onto, or its key renamed in place. */
function applyEdit(root: Json, edit: Edit, where: string): Json {
  if (edit.at.length === 0) throw new Error(`${where}: an edit's at names no key`);
  const steps = edit.at.slice(0, -1);
  const last = edit.at[edit.at.length - 1] as Step;
  let node: unknown = root;
  for (const step of steps) {
    node = isRecord(node) || Array.isArray(node) ? (node as Record<string, unknown>)[String(step)] : undefined;
    if (node === undefined) throw new Error(`${where}: an edit's at leaves the file at ${String(step)}`);
  }
  if (!isRecord(node) && !Array.isArray(node)) throw new Error(`${where}: an edit's at ends below a value`);
  const holder = node as Record<string, unknown> & unknown[];
  if (edit.delete) {
    if (Array.isArray(holder)) holder.splice(Number(last), 1);
    else delete holder[String(last)];
  } else if (edit.push !== undefined) {
    const list = holder[String(last)];
    if (!Array.isArray(list)) throw new Error(`${where}: push needs a list at ${String(last)}`);
    list.push(edit.push);
  } else if (edit.rename !== undefined) {
    if (Array.isArray(holder) || !Object.hasOwn(holder, String(last)))
      throw new Error(`${where}: rename needs a map key at ${String(last)}`);
    const entries = Object.entries(holder).map(([k, v]) => [k === String(last) ? edit.rename : k, v] as const);
    for (const k of Object.keys(holder)) delete holder[k];
    for (const [k, v] of entries) holder[k as string] = v;
  } else if (edit.set !== undefined) {
    holder[String(last)] = edit.set;
  } else {
    throw new Error(`${where}: an edit needs one of set, delete, push, or rename`);
  }
  return root;
}

/** The known-good file's text, edited, written back as YAML or JSON. */
function edited(data: Uint8Array, file: string, edits: readonly Edit[], where: string): Uint8Array {
  const json = file.endsWith(".json");
  let value = (json ? JSON.parse(decoder.decode(data)) : parse(decoder.decode(data))) as Json;
  for (const e of edits) value = applyEdit(value, e, where);
  return bytes(json ? `${JSON.stringify(value, null, 2)}\n` : stringify(value, { aliasDuplicateObjects: false }));
}

let variants: Map<string, Uint8Array> | null = null;

/** A generator's output: a GLB (glb:desk, glb:sign, glb:<rxVariants id>), or `records` over the tree's models. */
function generated(name: string, files: ReadonlyMap<string, Uint8Array | null>, where: string): Uint8Array {
  if (name === "glb:desk") return desk().bytes;
  if (name === "glb:sign") return sign().bytes;
  if (name.startsWith("glb:")) {
    variants ??= new Map(rxVariants().map((v) => [v.id, v.bytes]));
    const found = variants.get(name.slice(4));
    if (found === undefined) throw new Error(`${where}: no rxVariants() id ${name.slice(4)}`);
    return found;
  }
  if (name === "records") {
    const entries = [...files]
      .filter(([path, data]) => data !== null && /^assets\/room\/[^/]+\.(glb|png|jpg|webp)$/.test(path))
      .map(([path, data]) => ({ file: path.slice("assets/room/".length), sha256: sha256(data as Uint8Array) }))
      .sort((a, b) => (a.file < b.file ? -1 : 1))
      .map(({ file, sha256: digest }) => ({ file, sha256: digest, kind: "room" }));
    const record = { schema: 1, directory: "assets/room", license: "all-rights-reserved-2026", entries };
    return bytes(`${JSON.stringify(record, null, 2)}\n`);
  }
  throw new Error(`${where}: no generator ${name}`);
}

const CASE_KEYS = new Set([
  "rule",
  "file",
  "path",
  "why",
  "mode",
  "drafts",
  "edits",
  "copy",
  "move",
  "remove",
  "raw",
  "generate",
]);
const stringMap = (v: unknown, where: string): Record<string, string> => {
  if (v === undefined) return {};
  if (!isRecord(v) || !Object.values(v).every((x) => typeof x === "string"))
    throw new Error(`${where}: expected a map of strings`);
  return v as Record<string, string>;
};

/** One case folder's overlay and expected finding. */
function readCase(name: string): BadCase {
  const dir = join(BAD_DIR, name);
  const where = `bad/${name}/expect.yaml`;
  const spec = parse(readFileSync(join(dir, "expect.yaml"), "utf8")) as unknown;
  if (!isRecord(spec)) throw new Error(`${where}: not a map`);
  for (const key of Object.keys(spec)) if (!CASE_KEYS.has(key)) throw new Error(`${where}: unknown key ${key}`);
  const { rule, file, path } = spec;
  if (typeof rule !== "string" || typeof file !== "string" || typeof path !== "string")
    throw new Error(`${where}: rule, file, and path are strings`);
  if (!new RegExp(`^${rule}(-|$)`).test(name)) throw new Error(`${where}: the folder's name starts with its rule`);
  const mode = spec.mode ?? "strict";
  if (mode !== "strict" && mode !== "lenient") throw new Error(`${where}: mode is strict or lenient`);
  const drafts = spec.drafts ?? true;
  if (typeof drafts !== "boolean") throw new Error(`${where}: drafts is a boolean`);

  const base = goodFiles();
  const changes = new Map<string, Uint8Array | null>();
  const current = (p: string): Uint8Array => {
    const data = changes.has(p) ? changes.get(p) : base.get(p);
    if (!data) throw new Error(`${where}: ${p} isn't in the case's tree`);
    return data;
  };
  for (const [from, to] of Object.entries(stringMap(spec.copy, `${where} copy`))) changes.set(to, current(from));
  for (const [from, to] of Object.entries(stringMap(spec.move, `${where} move`))) {
    changes.set(to, current(from));
    changes.set(from, null);
  }
  const remove = spec.remove ?? [];
  if (!Array.isArray(remove)) throw new Error(`${where}: remove is a list`);
  for (const p of remove) changes.set(String(p), null);
  const files = join(dir, "files");
  for (const [rel, data] of existsSync(files) ? walk(files) : []) changes.set(rel, data);
  for (const [p, text] of Object.entries(stringMap(spec.raw, `${where} raw`))) changes.set(p, rawBytes(text, where));
  const generate = stringMap(spec.generate, `${where} generate`);
  const order = Object.entries(generate).sort(([, a], [, b]) => Number(a === "records") - Number(b === "records"));
  for (const [p, generator] of order) {
    const tree = new Map<string, Uint8Array | null>([...base, ...changes]);
    changes.set(p, generated(generator, tree, where));
  }
  const edits = (spec.edits ?? []) as Edit[];
  if (!Array.isArray(edits)) throw new Error(`${where}: edits is a list`);
  const byFile = new Map<string, Edit[]>();
  for (const e of edits) {
    if (!isRecord(e) || typeof e.file !== "string" || !Array.isArray(e.at)) throw new Error(`${where}: a bad edit`);
    byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
  }
  for (const [p, list] of byFile) changes.set(p, edited(current(p), p, list, where));

  return {
    name,
    rule,
    file,
    path,
    why: typeof spec.why === "string" ? spec.why : null,
    options: { mode, drafts },
    changes,
  };
}

let cases: BadCase[] | null = null;

/** Every bad/<RULE>/ case, by folder name. */
export function badCases(): BadCase[] {
  cases ??= readdirSync(BAD_DIR)
    .filter((name) => statSync(join(BAD_DIR, name)).isDirectory())
    .sort()
    .map(readCase);
  return cases;
}
