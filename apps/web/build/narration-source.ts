// The narration scripts' files (spec 002, T052; contracts/narration.md §1; data-model.md §3), read and held to their
// shape: `apps/web/content/narration/<item-id>.<path>.md`, YAML front matter between two `---` lines, then the words.
//
//   ---
//   item: <item-id>             the file name's item, which must exist in resume.yaml (N2, build/narration.ts)
//   path: engineer              or non-engineer, the file name's path
//   claims:                     at least one, each {file, quote}, checked as the resume's are (N1)
//     - file: corpus/<file>.md
//       quote: "<a span of one tagged sentence>"
//   slots: []                   every {{slot:<id>}} the words use
//   ---
//   <the words>
//
// This module only reads files, with no import from build/content.ts, so content.ts can lock the corpus files the
// scripts cite (contracts/resume-source.md §3) without an import cycle. The checks are build/narration.ts's. The
// gate's content check (tools/gates/content_check.py) reads a script's words the same way: everything after the
// first "\n---\n" past the opening line.
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { parseDocument, visit } from "yaml";

import type { NarrationPath } from "../src/narration/data";

export const NARRATION_DIR = "apps/web/content/narration";
/** `<item-id>.<path>.md`, the item ID as data-model.md §2 writes it. */
const NAME = /^([a-z][a-z0-9-]{1,40})\.(engineer|non-engineer)\.md$/;

export class ScriptError extends Error {}

export interface ScriptClaim {
  file: string;
  quote: string;
}

export interface Script {
  /** The path from the repository's root: apps/web/content/narration/<item-id>.<path>.md. */
  file: string;
  item: string;
  path: NarrationPath;
  claims: ScriptClaim[];
  slots: string[];
  /** The words after the front matter, trimmed, as the file writes them. */
  body: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function refuse(file: string, why: string): never {
  throw new ScriptError(`${file}: ${why} (contracts/narration.md §1)`);
}

/** One script's file, held to the contract's shape, or a ScriptError naming the file and the field. */
export function parseScript(text: string, file: string): Script {
  const name = NAME.exec(posix.basename(file));
  if (!name) refuse(file, "its name isn't <item-id>.<path>.md, with the path engineer or non-engineer");
  if (text.includes("\r")) refuse(file, "holds a carriage return; the content files use LF line endings");
  if (!text.startsWith("---\n")) refuse(file, "has no front matter: it starts with a --- line");
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) refuse(file, "has no end to its front matter: a --- line after it");

  const doc = parseDocument(text.slice(4, end + 1), {
    schema: "core",
    uniqueKeys: true,
    merge: false,
    prettyErrors: false,
  });
  if (doc.errors.length > 0) refuse(file, `its front matter isn't YAML: ${doc.errors[0]?.message ?? "?"}`);
  let alias = false;
  visit(doc, {
    Alias() {
      alias = true;
      return visit.BREAK;
    },
  });
  if (alias) refuse(file, "its front matter holds an alias; it has no anchors or aliases");
  const front = doc.toJS() as unknown;
  if (!isObject(front)) refuse(file, "its front matter isn't a mapping");
  for (const key of ["item", "path", "claims"]) if (!(key in front)) refuse(file, `its front matter has no ${key}`);
  for (const key of Object.keys(front)) {
    if (!["item", "path", "claims", "slots"].includes(key)) refuse(file, `${key} isn't a field a script has`);
  }

  const [, item, path] = name;
  if (front.item !== item) refuse(file, `its front matter says item ${String(front.item)}, and its name ${item}`);
  if (front.path !== path) refuse(file, `its front matter says path ${String(front.path)}, and its name ${path}`);
  if (!Array.isArray(front.claims) || front.claims.length === 0) refuse(file, "claims isn't a list of at least one");
  const claims = front.claims.map((c: unknown, i: number) => {
    if (!isObject(c) || typeof c.file !== "string" || typeof c.quote !== "string") {
      refuse(file, `claims[${i}] needs a file and a quote, both strings`);
    }
    for (const key of Object.keys(c))
      if (key !== "file" && key !== "quote") refuse(file, `claims[${i}].${key} isn't a field`);
    return { file: c.file, quote: c.quote };
  });
  const slots = front.slots ?? [];
  if (!Array.isArray(slots) || !slots.every((s): s is string => typeof s === "string")) {
    refuse(file, "slots isn't a list of slot IDs");
  }
  const body = text.slice(end + 5).trim();
  if (body === "") refuse(file, "has no words after its front matter");
  return { file, item: item as string, path: path as NarrationPath, claims, slots, body };
}

/** Every script under a tree, in name order; none when the directory doesn't exist. Each must be a regular file. */
export function readScripts(root: string): Script[] {
  const dir = join(root, NARRATION_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .map((name) => {
      const file = posix.join(NARRATION_DIR, name);
      if (!lstatSync(join(dir, name)).isFile()) refuse(file, "a script must be a regular file, not a link or a folder");
      return parseScript(readFileSync(join(dir, name), "utf8"), file);
    });
}
