// The room's data, read (spec 004; FR-001, FR-005, FR-006; R-01, R-08; contracts/room-data-files.md §1, §2, §13.1):
// every file of every kind §1 lists, through the tree and nothing else, with RD applied as it is read (checks/rd.ts).
// - The readers: UTF-8 with no byte-order mark and LF ends; one YAML document by the `yaml` package's
//   `parseDocument(text, {schema: "core", uniqueKeys: true, merge: false})`, so `off` stays a string, with no alias,
//   anchor, merge key, tag, or directive; strict JSON for an outline (src/room/glb/json.ts: no duplicate key, NaN, or
//   Infinity). A key that isn't a string, and `__proto__`, are keys no schema defines. A reason never quotes the file.
// - The walk: apps/web/room/ holds scene.yaml, topics.yaml, ui-words.yaml, lookdev.yaml, the folders catalog/, looks/,
//   and fixtures/ of `<stem>.yaml` files, and README.md, which is prose and never read; apps/web/content/room/ holds
//   `<block>.yaml` files and outlines/ of `<sign>.outline.json` files. Anything else there is RD5, and so is a stem that
//   differs from the ID or name its file holds. The scene and the UI words are required; a room without either is RD3.
// - The loaded room: each file that passed, parsed and schema-checked, with its path; each that didn't, in `failed`,
//   so a reference into it isn't reported again; and the problems, sorted, which the RD family reports.
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Node as YamlNode } from "yaml";

import { isObject, parseJson } from "../../src/room/glb/json";
import { compareFindings, formatPath } from "./checks/family";
import type { Problem } from "./checks/family";
import { shapeProblems } from "./checks/rd";
import {
  catalogSchema,
  fixtureSchema,
  lookdevSchema,
  lookSchema,
  outlineSchema,
  roomTextSchema,
  sceneSchema,
  topicsSchema,
  uiWordsSchema,
} from "./schema";
import type {
  CatalogEntry,
  Fixture,
  Lookdev,
  LookFile,
  Outline,
  RoomTextBlock,
  Scene,
  Topics,
  UiWords,
} from "./schema";
import { compareBytewise } from "./source";
import type { Tree } from "./source";

export const ROOM_DIR = "apps/web/room";
export const TEXT_DIR = "apps/web/content/room";
export const OUTLINE_DIR = `${TEXT_DIR}/outlines`;
export const SCENE_FILE = `${ROOM_DIR}/scene.yaml`;
export const TOPICS_FILE = `${ROOM_DIR}/topics.yaml`;
export const UI_WORDS_FILE = `${ROOM_DIR}/ui-words.yaml`;
export const LOOKDEV_FILE = `${ROOM_DIR}/lookdev.yaml`;

export type DataKind =
  "catalog" | "scene" | "topics" | "ui-words" | "look" | "fixture" | "lookdev" | "room-text" | "outline";

const SCHEMAS = {
  catalog: catalogSchema,
  scene: sceneSchema,
  topics: topicsSchema,
  "ui-words": uiWordsSchema,
  look: lookSchema,
  fixture: fixtureSchema,
  lookdev: lookdevSchema,
  "room-text": roomTextSchema,
  outline: outlineSchema,
} as const;

/** The kinds kept one file each in a folder, with the folder, the file's ending, and the key its stem must equal. */
const FOLDERS = {
  catalog: { dir: `${ROOM_DIR}/catalog`, ending: ".yaml", key: "id" },
  look: { dir: `${ROOM_DIR}/looks`, ending: ".yaml", key: "id" },
  fixture: { dir: `${ROOM_DIR}/fixtures`, ending: ".yaml", key: "id" },
  "room-text": { dir: TEXT_DIR, ending: ".yaml", key: "block" },
  outline: { dir: OUTLINE_DIR, ending: ".outline.json", key: "sign" },
} as const;
type FolderKind = keyof typeof FOLDERS;

/** The single files of apps/web/room/, by name. */
const SINGLES: Readonly<Record<string, DataKind>> = {
  "scene.yaml": "scene",
  "topics.yaml": "topics",
  "ui-words.yaml": "ui-words",
  "lookdev.yaml": "lookdev",
};
/** The folders of apps/web/room/, by name. */
const ROOM_FOLDERS: Readonly<Record<string, FolderKind>> = { catalog: "catalog", looks: "look", fixtures: "fixture" };

/** Where a file of a folder kind with this stem lives: the path a reference to it would read. */
export function pathOf(kind: FolderKind, stem: string): string {
  return `${FOLDERS[kind].dir}/${stem}${FOLDERS[kind].ending}`;
}

/** A problem before its file is known. */
export type FileProblem = Omit<Problem, "file">;
export type Read =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly problems: FileProblem[] };

const rd1 = (reason: string): Read => ({ ok: false, problems: [{ rule: "RD1", path: "-", reason }] });
const lineAt = (text: string, offset: number): number => text.slice(0, Math.max(0, offset)).split("\n").length;

/** UTF-8 with no byte-order mark and LF ends, or RD1's reason. */
function decode(bytes: Uint8Array): { text: string } | { fault: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { fault: "a byte-order mark" };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { fault: "not UTF-8" };
  }
  const cr = text.indexOf("\r");
  if (cr >= 0) return { fault: `a CR at line ${lineAt(text, cr)}: line ends are LF` };
  return { text };
}

/** RD1 for a node an anchor, alias, or tag marks, or a key that isn't a scalar; RD2 for a key no schema defines. */
function walkYaml(node: YamlNode | null, path: (string | number)[], text: string, out: FileProblem[]): void {
  if (node === null) return;
  const line = (n: YamlNode): number => lineAt(text, n.range?.[0] ?? 0);
  if (isAlias(node)) {
    out.push({ rule: "RD1", path: "-", reason: `an alias at line ${line(node)}` });
    return;
  }
  if (node.anchor) out.push({ rule: "RD1", path: "-", reason: `an anchor at line ${line(node)}` });
  if (node.tag) out.push({ rule: "RD1", path: "-", reason: `a tag at line ${line(node)}` });
  if (isMap(node)) {
    for (const pair of node.items) {
      const key = pair.key as YamlNode | null;
      if (!isScalar(key)) {
        out.push({ rule: "RD1", path: "-", reason: `a key that isn't a scalar at line ${key ? line(key) : 0}` });
        continue;
      }
      walkYaml(key, path, text, out);
      if (key.value === "<<") out.push({ rule: "RD1", path: "-", reason: `a merge key at line ${line(key)}` });
      else if (typeof key.value !== "string" || key.value === "__proto__")
        out.push({ rule: "RD2", path: formatPath(path), reason: "a key no schema defines" });
      else walkYaml(pair.value as YamlNode | null, [...path, key.value], text, out);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, i) => walkYaml(item as YamlNode | null, [...path, i], text, out));
  }
}

/** One YAML 1.2 document, read with the core schema and refusing what RD1 refuses. */
export function readYaml(bytes: Uint8Array): Read {
  const decoded = decode(bytes);
  if ("fault" in decoded) return rd1(decoded.fault);
  const { text } = decoded;
  const doc = parseDocument(text, { schema: "core", uniqueKeys: true, merge: false, prettyErrors: false });
  const error = doc.errors[0];
  if (error) {
    const at = lineAt(text, error.pos[0]);
    if (error.code === "MULTIPLE_DOCS") return rd1("more than one document");
    if (error.code === "DUPLICATE_KEY") return rd1(`a duplicate key at line ${at}`);
    return rd1(`a YAML syntax error at line ${at}`);
  }
  const tags = Object.keys(doc.directives?.tags ?? {}).filter((handle) => handle !== "!!");
  if (doc.directives?.yaml.explicit || tags.length > 0) return rd1("a directive");
  const problems: FileProblem[] = [];
  walkYaml(doc.contents as YamlNode | null, [], text, problems);
  const first = problems.find((p) => p.rule === "RD1");
  if (first) return { ok: false, problems: [first] };
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: doc.toJS() as unknown };
}

/** RD2 for each `__proto__` key in a parsed JSON value. */
function protoKeys(value: unknown, path: (string | number)[], out: FileProblem[]): void {
  if (Array.isArray(value)) value.forEach((v, i) => protoKeys(v, [...path, i], out));
  else if (isObject(value))
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "__proto__") out.push({ rule: "RD2", path: formatPath(path), reason: "a key no schema defines" });
      else protoKeys(v, [...path, k], out);
    }
}

/** One JSON value, read strictly: no duplicate key, NaN, or Infinity. */
export function readJson(bytes: Uint8Array): Read {
  const decoded = decode(bytes);
  if ("fault" in decoded) return rd1(decoded.fault);
  const read = parseJson(decoded.text);
  if (!read.ok) {
    const at = lineAt(decoded.text, read.at);
    if (read.fault === "duplicate") return rd1(`a duplicate key at line ${at}`);
    if (read.fault === "non-finite") return rd1(`NaN or Infinity at line ${at}`);
    if (read.fault === "depth") return rd1("nested too deep");
    return rd1(`a JSON syntax error at line ${at}`);
  }
  const problems: FileProblem[] = [];
  protoKeys(read.value, [], problems);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: read.value };
}

export interface FileRead<T = unknown> {
  /** The file's value, or null when RD or its schema refuses it. */
  readonly value: T | null;
  readonly problems: readonly Problem[];
}

const stemOf = (file: string, ending: string): string => file.slice(file.lastIndexOf("/") + 1, -ending.length);

/** One file of a kind, read whole: RD1 to RD4, and RD5's stem where the kind's folder keeps one file per stem. */
export function readFile(kind: DataKind, file: string, bytes: Uint8Array): FileRead {
  const read = kind === "outline" ? readJson(bytes) : readYaml(bytes);
  if (!read.ok) return { value: null, problems: read.problems.map((p) => ({ ...p, file })) };
  const parsed = SCHEMAS[kind].safeParse(read.value);
  if (!parsed.success) return { value: null, problems: shapeProblems(parsed.error.issues, read.value, file) };
  if (kind in FOLDERS) {
    const { ending, key } = FOLDERS[kind as FolderKind];
    if ((parsed.data as Record<string, unknown>)[key] !== stemOf(file, ending))
      return { value: null, problems: [{ rule: "RD5", file, path: key, reason: `differs from the file's stem` }] };
  }
  return { value: parsed.data, problems: [] };
}

/** A file of the room's data, parsed and schema-checked, with its repository path. */
export interface Loaded<T> {
  readonly file: string;
  readonly value: T;
}

/** The room's data as the families read it. */
export interface LoadedRoom {
  /** One entry per piece, in path order. */
  readonly catalog: readonly Loaded<CatalogEntry>[];
  readonly scene: Loaded<Scene> | null;
  readonly topics: Loaded<Topics> | null;
  readonly ui: Loaded<UiWords> | null;
  readonly looks: readonly Loaded<LookFile>[];
  readonly fixtures: readonly Loaded<Fixture>[];
  readonly lookdev: Loaded<Lookdev> | null;
  readonly blocks: readonly Loaded<RoomTextBlock>[];
  readonly outlines: readonly Loaded<Outline>[];
  /** Every file of a data kind that was read, in path order, loaded or not. */
  readonly files: readonly string[];
  /** The files RD or their schema refused, and a required file that is missing: none of them is in the model. */
  readonly failed: ReadonlySet<string>;
  /** What the loader met, sorted: RD1 to RD5, and the constraints the schemas hold for other rules. */
  readonly problems: readonly Problem[];
}

/** Every file of every kind contracts/room-data-files.md §1 lists, read through `tree`. Pure: it never throws on data. */
export function loadRoom(tree: Tree): LoadedRoom {
  const problems: Problem[] = [];
  const failed = new Set<string>();
  const files: string[] = [];
  const found = new Map<DataKind, Loaded<unknown>[]>();
  const rd5 = (file: string, reason: string): void => {
    problems.push({ rule: "RD5", file, path: "-", reason });
    failed.add(file);
  };
  const folder = (path: string): boolean => tree.read(path) === null && tree.list(path).length > 0;

  const take = (kind: DataKind, file: string): void => {
    const bytes = tree.read(file);
    if (bytes === null) {
      if (tree.list(file).length > 0) rd5(file, "a folder where a file belongs");
      else {
        problems.push({ rule: "RD1", file, path: "-", reason: "unreadable" });
        failed.add(file);
      }
      return;
    }
    files.push(file);
    const read = readFile(kind, file, bytes);
    if (read.value === null) {
      problems.push(...read.problems);
      failed.add(file);
      return;
    }
    found.set(kind, [...(found.get(kind) ?? []), { file, value: read.value }]);
  };

  const walk = (kind: FolderKind): void => {
    const { dir, ending } = FOLDERS[kind];
    for (const name of tree.list(dir)) {
      const file = `${dir}/${name}`;
      if (kind === "room-text" && name === "outlines") walk("outline");
      else if (name.endsWith(ending) && name.length > ending.length) take(kind, file);
      else rd5(file, folder(file) ? "a folder inside a data folder" : `not a ${ending} file of this folder's kind`);
    }
  };

  for (const name of tree.list(ROOM_DIR)) {
    const file = `${ROOM_DIR}/${name}`;
    const single = SINGLES[name];
    const kind = ROOM_FOLDERS[name];
    if (name === "README.md") continue;
    if (single !== undefined) take(single, file);
    else if (kind !== undefined) {
      if (tree.read(file) !== null) rd5(file, "a file where a folder belongs");
      else walk(kind);
    } else rd5(file, folder(file) ? "a folder the room's data doesn't hold" : "not a file of the room's data");
  }
  for (const required of [SCENE_FILE, UI_WORDS_FILE]) {
    if (!files.includes(required) && !failed.has(required)) {
      problems.push({ rule: "RD3", file: required, path: "-", reason: "missing: the room needs it" });
      failed.add(required);
    }
  }
  walk("room-text");

  const all = <T>(kind: DataKind): Loaded<T>[] => (found.get(kind) ?? []) as Loaded<T>[];
  const one = <T>(kind: DataKind): Loaded<T> | null => all<T>(kind)[0] ?? null;
  return {
    catalog: all<CatalogEntry>("catalog"),
    scene: one<Scene>("scene"),
    topics: one<Topics>("topics"),
    ui: one<UiWords>("ui-words"),
    looks: all<LookFile>("look"),
    fixtures: all<Fixture>("fixture"),
    lookdev: one<Lookdev>("lookdev"),
    blocks: all<RoomTextBlock>("room-text"),
    outlines: all<Outline>("outline"),
    files: [...files].sort(compareBytewise),
    failed,
    problems: problems.sort(compareFindings),
  };
}

/** The four namespaces' IDs the data defines (contracts/room-data-files.md §3.1): what the source scan keeps out of
 *  code (§16). Each list in the data's order, once each. */
export interface Namespaces {
  readonly pieces: readonly string[];
  readonly placements: readonly string[];
  readonly selectables: readonly string[];
  readonly topics: readonly string[];
}

export function namespaceIds(room: LoadedRoom): Namespaces {
  const once = (ids: readonly string[]): string[] => [...new Set(ids)];
  return {
    pieces: once(room.catalog.map((c) => c.value.id)),
    placements: once(room.scene?.value.placements.map((p) => p.id) ?? []),
    selectables: once(room.scene?.value.selectables.map((s) => s.id) ?? []),
    topics: once(room.topics?.value.topics.map((t) => t.id) ?? []),
  };
}
