// The source scan (spec 004; FR-007, SC-001; R-16; contracts/room-data-files.md §16): no ID that only the room's data
// defines stands in the room's code, so moving, adding, or retargeting a piece stays a data edit.
// - What it looks for: every ID of the four namespaces, pieces, placements, selectables, and topics, read through the
//   compositor (load.ts's `namespaceIds` over `loadRoom`), with RT2's walk saying which of them may print.
// - Where: apps/web/{src,build,lookdev,test}/**, apps/web/*.ts (the Vite and vitest configurations),
//   apps/web/index.html, and services/gateway/{src,test}/**. Scripts, TypeScript and JavaScript, are read with
//   TypeScript's own parser, and HTML and style sheets by the two readers below; data, generated files, and Markdown
//   aren't code, and aren't read.
// - What it reads: string literals; no-substitution template literals and the text parts of templates;
//   regular-expression literals; property names in object literals, interfaces, and type literals; string literal
//   types; enum members; in HTML, attribute values and text, a <script>'s body as a script and a <style>'s as a style
//   sheet; in CSS, selectors, custom property names, and strings. Never a comment, and never an identifier.
// - A hit: a text in which `(?<![a-z0-9])<id>(?![a-z0-9])` matches, case-sensitively, so `flat-hit--<id>` is caught,
//   placed on the line where the ID stands.
// - The output: `FR-007 <file>:<line>: holds "<id>", which only the room's data defines`, one line per hit, sorted by
//   file, line, then ID, and exit 1 on any. An ID RT2 refused never prints: its line says so in the ID's place.
// There is no allowlist, since one would hold the ID itself: the fix is in the code, which takes the value from the
// bundle, or from compose() in a test.
import ts from "typescript";

import { createContext } from "./checks/family";
import { walkStrings } from "./checks/rt";
import { loadRoom, namespaceIds } from "./load";
import type { RoomPolicy } from "./policy";
import { compareBytewise } from "./source";
import type { Tree } from "./source";

/** The folders the scan reads whole, every subfolder included. */
export const SCAN_FOLDERS = [
  "apps/web/src",
  "apps/web/build",
  "apps/web/lookdev",
  "apps/web/test",
  "services/gateway/src",
  "services/gateway/test",
] as const;
/** The web workspace, whose own *.ts files and index.html the scan reads too. */
const WEB = "apps/web";

/** One hit: an ID on a line of a file. */
export interface Hit {
  readonly file: string;
  readonly line: number;
  readonly id: string;
}

/** What the scan prints, a line per hit, sorted, and its exit code: 1 on any hit. */
export interface ScanResult {
  readonly lines: readonly string[];
  readonly code: 0 | 1;
}

/** A text the scan reads: its value, where its source starts in the file, and that source, which places a match. */
interface Text {
  readonly value: string;
  readonly at: number;
  readonly source: string;
}

type Kind = ts.ScriptKind | "html" | "css";

/** A file the scan reads, with its kind. */
interface Source {
  readonly file: string;
  readonly kind: Kind;
  readonly bytes: Uint8Array;
}

const SCRIPTS: Readonly<Record<string, ts.ScriptKind>> = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

const decoder = new TextDecoder("utf-8");

/** A file's kind by its name's ending, or null for a file that isn't code. */
function kindOf(name: string): Kind | null {
  const ending = name.slice(name.lastIndexOf("."));
  if (ending === ".html") return "html";
  if (ending === ".css") return "css";
  return Object.hasOwn(SCRIPTS, ending) ? (SCRIPTS[ending] as ts.ScriptKind) : null;
}

/** Every file of code the scan reads in `sources`: each folder's, through every subfolder, then the web workspace's
 *  own *.ts files and index.html. */
function sourceFiles(sources: Tree): Source[] {
  const out: Source[] = [];
  const take = (file: string, kind: Kind | null): boolean => {
    const bytes = kind === null ? null : sources.read(file);
    if (kind === null || bytes === null) return false;
    out.push({ file, kind, bytes });
    return true;
  };
  const walk = (dir: string): void => {
    for (const name of sources.list(dir)) {
      const path = `${dir}/${name}`;
      // A folder lists its entries; a file that isn't code lists none.
      if (!take(path, kindOf(name))) walk(path);
    }
  };
  for (const dir of SCAN_FOLDERS) walk(dir);
  for (const name of sources.list(WEB))
    if (name === "index.html" || name.endsWith(".ts")) take(`${WEB}/${name}`, kindOf(name));
  return out;
}

/** A script's texts, read with TypeScript's own parser, which gives a comment no node and here parses no doc comment.
 *  `at` places them in the whole file, for a script inside HTML. */
function scriptTexts(file: string, text: string, kind: ts.ScriptKind, at = 0): Text[] {
  const sf = ts.createSourceFile(
    file,
    text,
    { languageVersion: ts.ScriptTarget.Latest, jsDocParsingMode: ts.JSDocParsingMode.ParseNone },
    false,
    kind,
  );
  const out: Text[] = [];
  const add = (node: ts.Node, ...values: (string | undefined)[]): void => {
    const start = node.getStart(sf);
    const source = text.slice(start, node.end);
    for (const value of new Set(values)) if (value !== undefined) out.push({ value, at: at + start, source });
  };
  /** The members' names that are identifiers: a quoted name is a string literal, and read as one. */
  const names = (members: readonly ts.Node[]): void => {
    for (const member of members) {
      const name = (member as { readonly name?: ts.Node }).name;
      if (name !== undefined && ts.isIdentifier(name)) add(name, name.text);
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isRegularExpressionLiteral(node)) add(node, node.text);
    else if (
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      add(node, node.text, node.rawText); // as the program reads it, and as String.raw does
    else if (ts.isObjectLiteralExpression(node)) names(node.properties);
    else if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node) || ts.isEnumDeclaration(node))
      names(node.members);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const TAG = /<(\/?)([A-Za-z][^\t\n\f\r />]*)/y;
const ATTRIBUTE =
  /[\t\n\f\r /]*[^\t\n\f\r />"'=][^\t\n\f\r />"'=]*(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r >]+)))?/y;

/** HTML's numeric character references undone: the only ones that can spell an ID's letters, digits, or hyphen. */
function unentity(text: string): string {
  return text.replace(/&#(?:(\d{1,7})|[xX]([0-9a-fA-F]{1,6}));/g, (all: string, dec?: string, hex?: string) => {
    const code = dec !== undefined ? Number(dec) : Number.parseInt(hex ?? "", 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}

/** An HTML file's texts: its attribute values and text, numeric references undone, a <script>'s body read as a script
 *  and a <style>'s as a style sheet. Comments, declarations, and the names of tags and attributes are never read. */
function htmlTexts(file: string, text: string): Text[] {
  const out: Text[] = [];
  /** The text from `from` to `to`, its leading space left out, so the text is placed on its first word's line. */
  const plain = (from: number, to: number): void => {
    const source = text.slice(from, to);
    const lead = source.length - source.trimStart().length;
    if (lead < source.length) out.push({ value: unentity(source), at: from + lead, source: source.slice(lead) });
  };
  let from = 0; // where the text being read began
  for (let i = text.indexOf("<"); i >= 0; i = text.indexOf("<", i)) {
    if (text[i + 1] === "!" || text[i + 1] === "?") {
      // A comment runs to "-->"; a declaration, such as the doctype, or an instruction to ">".
      plain(from, i);
      const comment = text.startsWith("<!--", i);
      const close = text.indexOf(comment ? "-->" : ">", i + (comment ? 4 : 2));
      i = from = close < 0 ? text.length : close + (comment ? 3 : 1);
      continue;
    }
    TAG.lastIndex = i;
    const tag = TAG.exec(text);
    if (tag === null) {
      i += 1; // a "<" that opens no tag is text
      continue;
    }
    plain(from, i);
    let j = TAG.lastIndex;
    for (;;) {
      ATTRIBUTE.lastIndex = j;
      const attribute = ATTRIBUTE.exec(text);
      if (attribute === null) break;
      j = ATTRIBUTE.lastIndex;
      const value = attribute[1] ?? attribute[2] ?? attribute[3];
      if (value === undefined) continue;
      const start = j - value.length - (attribute[3] === undefined ? 1 : 0);
      out.push({ value: unentity(value), at: start, source: value });
    }
    const close = text.indexOf(">", j);
    i = from = close < 0 ? text.length : close + 1;
    const name = (tag[2] ?? "").toLowerCase();
    if (tag[1] === "" && (name === "script" || name === "style")) {
      // Its body is raw text up to its end tag.
      const end = new RegExp(`</${name}`, "gi");
      end.lastIndex = i;
      const stop = end.exec(text)?.index ?? text.length;
      const body = text.slice(i, stop);
      out.push(...(name === "script" ? scriptTexts(file, body, ts.ScriptKind.JS, i) : cssTexts(body, i)));
      i = from = stop;
    }
  }
  plain(from, text.length);
  return out;
}

/** CSS's escapes undone: a backslash before up to six hex digits (and one space after them), before a newline (a
 *  string's continued line, dropped), or before any other character, which stands for itself. */
function uncss(text: string): string {
  return text.replace(/\\(?:([0-9a-fA-F]{1,6})[ \t\n]?|([\s\S]))/g, (all: string, hex?: string, char?: string) => {
    if (hex === undefined) return char === "\n" ? "" : (char ?? "");
    const code = Number.parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}

/** A style sheet's texts: its selectors, custom property names, and strings, escapes undone. Comments, at-rules'
 *  preludes, property names, and plain values are never read. `at` places them in the whole file, for a style inside
 *  HTML. */
function cssTexts(text: string, at = 0): Text[] {
  const out: Text[] = [];
  // The sheet with each comment and string blanked, every offset and line kept, so the rest is cut at {, }, and ;.
  const bare: string[] = [];
  for (let i = 0; i < text.length;) {
    let end = i + 1;
    if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      end = close < 0 ? text.length : close + 2;
    } else if (text[i] === '"' || text[i] === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== text[i] && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      end = Math.min(j + 1, text.length);
      out.push({ value: uncss(text.slice(i + 1, Math.min(j, text.length))), at: at + i, source: text.slice(i, end) });
    } else {
      bare.push(text[i] as string);
      i = end;
      continue;
    }
    bare.push(text.slice(i, end).replace(/[^\n]/g, " "));
    i = end;
  }
  const sheet = bare.join("");
  let from = 0;
  for (let i = 0; i < sheet.length; i++) {
    const c = sheet[i];
    if (c !== "{" && c !== "}" && c !== ";") continue;
    // A rule's prelude is its selector, unless it is an at-rule's.
    const prelude = sheet.slice(from, i);
    const lead = prelude.length - prelude.trimStart().length;
    if (c === "{" && lead < prelude.length && prelude[lead] !== "@")
      out.push({ value: uncss(prelude.slice(lead)), at: at + from + lead, source: prelude.slice(lead) });
    from = i + 1;
  }
  // A custom property's name, declared or read through var().
  for (const m of sheet.matchAll(/(?<![\w-])--[\w-]+/g)) out.push({ value: m[0], at: at + m.index, source: m[0] });
  return out;
}

/** §16's hit rule for one ID, `(?<![a-z0-9])<id>(?![a-z0-9])`, case-sensitively. An ID passed RI1's grammar as it was
 *  read, so it holds no character a pattern treats specially; any such is escaped all the same. */
function pattern(id: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${id.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}(?![a-z0-9])`);
}

/** The line, counted from 1, that holds the character at `offset`. */
const lineAt = (text: string, offset: number): number => text.slice(0, offset).split("\n").length;

/** The hits in one file: each ID, once for each line it stands on, in every text the file's kind reads. */
function scanFile(source: Source, patterns: readonly (readonly [string, RegExp])[]): Hit[] {
  const { file, kind } = source;
  const text = decoder.decode(source.bytes);
  const texts =
    kind === "html" ? htmlTexts(file, text) : kind === "css" ? cssTexts(text) : scriptTexts(file, text, kind);
  const hits = new Map<string, Hit>();
  for (const t of texts)
    for (const [id, re] of patterns) {
      if (!re.test(t.value)) continue;
      const line = lineAt(text, t.at + (re.exec(t.source)?.index ?? 0));
      hits.set(`${line} ${id}`, { file, line, id });
    }
  return [...hits.values()];
}

/** The IDs the scan looks for, the four namespaces' once each in bytewise order, read from `data` as compose() reads
 *  it; and the strings RT2's walk refused under `policy`, which no line may print. */
export function roomIds(
  data: Tree,
  policy: RoomPolicy,
): { readonly ids: readonly string[]; readonly refused: ReadonlySet<string> } {
  const room = loadRoom(data);
  const { pieces, placements, selectables, topics } = namespaceIds(room);
  const ids = [...new Set([...pieces, ...placements, ...selectables, ...topics])].sort(compareBytewise);
  const { ctx } = createContext(room, policy, { mode: "strict", drafts: true }, data);
  return { ids, refused: walkStrings(ctx) };
}

/** A hit's line (§16). An ID `printable` refuses never prints: the line names it as one RT2 refused. */
export function formatHit(hit: Hit, printable: (id: string) => boolean = () => true): string {
  const what = printable(hit.id) ? `"${hit.id}"` : "an ID RT2 refused";
  return `FR-007 ${hit.file}:${hit.line}: holds ${what}, which only the room's data defines`;
}

/** The source scan: every ID the room's data in `data` defines, looked for in the code `sources` holds, both the
 *  repository's own tree outside a test. Its lines are what `room:scan` prints, and its code is the exit code. */
export function scan(data: Tree, sources: Tree, policy: RoomPolicy): ScanResult {
  const { ids, refused } = roomIds(data, policy);
  const patterns = ids.map((id) => [id, pattern(id)] as const);
  const hits: Hit[] = patterns.length === 0 ? [] : sourceFiles(sources).flatMap((s) => scanFile(s, patterns));
  hits.sort((a, b) => compareBytewise(a.file, b.file) || a.line - b.line || compareBytewise(a.id, b.id));
  return { lines: hits.map((h) => formatHit(h, (id) => !refused.has(id))), code: hits.length > 0 ? 1 : 0 };
}
