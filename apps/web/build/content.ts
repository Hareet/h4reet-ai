// The resume's source, its citation check, its lock, and what the build publishes from it (spec 002, T026 and T031;
// FR-013 to FR-017; contracts/resume-source.md §1 to §4; data-model.md §2 and §5).
//
//   apps/web/content/resume.yaml   the one source: the room's header, then sections of items, each item citing the
//                                  corpus sentence by sentence, any number only in a {{slot:…}}
//   C1–C9                          every citation is a span of one tagged corpus sentence, under a tag sufficient
//                                  for its use and outside "Do not claim"; the display text holds no bare number, no
//                                  unknown slot, the ownership verb it claims, and no forbidden phrase
//   apps/web/content/resume.lock.json   the SHA-256 of every corpus and facts file the source reads; make test fails
//                                  when one changed (FR-016); `npm run content:lock -w apps/web` rewrites it
//   room-data.json, resume.pdf     what the build publishes: the source's items when main approves its hash, its
//                                  items under a banner in a drafts build, and otherwise only "Draft, not approved"
//
// The check runs on every build, published or withheld, and in make test (test/content/source.test.ts). A problem
// is reported as `<item-id>: <reason>`, at each item's first, and a private denylist phrase never by its words.
// The forbidden list is shared with narration's N3 (contracts/narration.md §2).
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml, parseDocument, visit } from "yaml";

import type { RoomResumeHeader, RoomResumeSection } from "../src/resume/data";
import { publication, readPolicy, type RoomData, type RoomDataContext } from "./approvals";
import { pdfInput, pdfText, renderPdf } from "./pdf";
import { DEFAULT_POLICY_DIR } from "./policy";

export const RESUME_PATH = "apps/web/content/resume.yaml";
export const LOCK_PATH = "apps/web/content/resume.lock.json";
/** The Author's private denylist (corpus/README.md, Public safety), gitignored and local only. */
export const DENYLIST_PATH = "corpus/intake/private/denylist.txt";
export const SURNAME_RULE = "the surname rule";
const LOCK_HINT = "run npm run content:lock -w apps/web";

/** The corpus's ownership verbs (corpus/README.md, Role precision; data-model.md §2), and "architected", the ruling
 * 02-production-infrastructure-national-scale.md gives the CHT 4.0 architecture ("Ownership: *architected*"). */
export const OWNERSHIP_VERBS = [
  "built",
  "designed",
  "co-authored",
  "sourced",
  "sponsored",
  "AI system architect",
  "led",
  "was part of a team that",
  "architected",
] as const;

export class ContentError extends Error {}

// ---- The source (contracts/resume-source.md §1; data-model.md §2) ----

export interface Claim {
  file: string;
  quote: string;
}

export interface Line {
  text: string;
  claims: Claim[];
  slots: string[];
}

export interface Item extends Line {
  id: string;
  verb?: string;
}

export interface Section {
  id: string;
  title: string;
  items: Item[];
}

export interface ResumeSource {
  version: 1;
  header: { room: { name: string; lines: Line[] } };
  sections: Section[];
}

const ID = /^[a-z][a-z0-9-]{1,40}$/;
const MAX_TEXT = 400;
/** A slot reference as the corpus writes it, {{slot:<id>}} or {{slot:<id> | else: <fallback>}}; the contract's
 * `fallback:` reads the same. Loose on purpose, so a malformed reference is found and refused, never skipped. */
const SLOT_REF = /\{\{slot:\s*([^}|]*?)\s*(?:\|\s*([a-z]+):\s*([^}]*?)\s*)?\}\}/g;
const SLOT_ID = /^[a-z0-9_.-]+$/;
const FALLBACK_WORDS = new Set(["else", "fallback"]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function refuse(label: string, at: string, why: string): never {
  throw new ContentError(`${label}: ${at} ${why} (contracts/resume-source.md §1)`);
}

function keys(
  label: string,
  at: string,
  v: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (!isObject(v)) refuse(label, at, "isn't a mapping");
  for (const key of required) if (!(key in v)) refuse(label, at, `has no ${key}`);
  for (const key of Object.keys(v)) {
    if (!required.includes(key) && !optional.includes(key))
      refuse(label, `${at}.${key}`, "isn't a field the source has");
  }
  return v;
}

function text(label: string, at: string, v: unknown): string {
  if (typeof v !== "string" || v.trim() === "") refuse(label, at, "isn't a non-empty string");
  if (v.length > MAX_TEXT) refuse(label, at, `is over ${MAX_TEXT} characters`);
  return v;
}

/** The slot IDs a display text references, refusing a malformed reference. */
function slotRefs(label: string, at: string, display: string): string[] {
  const ids: string[] = [];
  for (const m of display.matchAll(SLOT_REF)) {
    const id = m[1] ?? "";
    if (!SLOT_ID.test(id)) refuse(label, at, `has a slot reference without a slot ID: ${m[0]}`);
    if (m[2] !== undefined && !FALLBACK_WORDS.has(m[2])) refuse(label, at, `has a slot reference with "${m[2]}:"`);
    ids.push(id);
  }
  if (/\{\{(?!slot:)|\{\{slot:[^}]*$/.test(display.replace(SLOT_REF, ""))) refuse(label, at, "has a malformed {{…}}");
  return ids;
}

function line(label: string, at: string, v: unknown, withVerb: boolean): Item {
  const o = keys(
    label,
    at,
    v,
    withVerb ? ["id", "text", "claims"] : ["text", "claims"],
    withVerb ? ["verb", "slots"] : ["slots"],
  );
  const display = text(label, `${at}.text`, o.text);
  if (!Array.isArray(o.claims) || o.claims.length === 0) refuse(label, `${at}.claims`, "isn't a list of at least one");
  const claims = o.claims.map((c: unknown, i: number) => {
    const claim = keys(label, `${at}.claims[${i}]`, c, ["file", "quote"]);
    if (typeof claim.file !== "string" || typeof claim.quote !== "string") {
      refuse(label, `${at}.claims[${i}]`, "needs a file and a quote, both strings");
    }
    return { file: claim.file, quote: claim.quote };
  });
  const slots = o.slots ?? [];
  if (!Array.isArray(slots) || !slots.every((s): s is string => typeof s === "string")) {
    refuse(label, `${at}.slots`, "isn't a list of slot IDs");
  }
  for (const id of slotRefs(label, `${at}.text`, display)) {
    if (!slots.includes(id)) refuse(label, `${at}.slots`, `doesn't list ${id}, which the text uses`);
  }
  const out: Item = { id: "", text: display, claims, slots };
  if (withVerb) {
    if (typeof o.id !== "string" || !ID.test(o.id)) refuse(label, `${at}.id`, `doesn't match ${ID.source}`);
    out.id = o.id;
    if (o.verb !== undefined) {
      if (typeof o.verb !== "string" || !(OWNERSHIP_VERBS as readonly string[]).includes(o.verb)) {
        refuse(label, `${at}.verb`, `isn't one of the corpus's ownership verbs (${OWNERSHIP_VERBS.join(", ")})`);
      }
      out.verb = o.verb;
    }
  }
  return out;
}

/** resume.yaml, parsed with the yaml package's core schema, no anchors or aliases, and held to the contract's
 * shape, or a ContentError naming the field. */
export function parseResume(source: string, label: string = RESUME_PATH): ResumeSource {
  const doc = parseDocument(source, { schema: "core", uniqueKeys: true, merge: false, prettyErrors: false });
  if (doc.errors.length > 0) throw new ContentError(`${label}: isn't YAML: ${doc.errors[0]?.message ?? "?"}`);
  let alias = false;
  visit(doc, {
    Alias() {
      alias = true;
      return visit.BREAK;
    },
  });
  if (alias) throw new ContentError(`${label}: holds an alias; the source has no anchors or aliases`);
  const root = keys(label, "the source", doc.toJS(), ["version", "header", "sections"]);
  if (root.version !== 1) refuse(label, "version", "isn't 1");
  const header = keys(label, "header", root.header, ["room"]);
  const room = keys(label, "header.room", header.room, ["name", "lines"]);
  const name = text(label, "header.room.name", room.name);
  if (!Array.isArray(room.lines)) refuse(label, "header.room.lines", "isn't a list");
  const lines = room.lines.map((l: unknown, i: number) => {
    const { text: t, claims, slots } = line(label, `header.room.lines[${i}]`, l, false);
    return { text: t, claims, slots };
  });
  if (!Array.isArray(root.sections)) refuse(label, "sections", "isn't a list");
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  const sections = root.sections.map((s: unknown, i: number) => {
    const at = `sections[${i}]`;
    const o = keys(label, at, s, ["id", "title", "items"]);
    if (typeof o.id !== "string" || !ID.test(o.id)) refuse(label, `${at}.id`, `doesn't match ${ID.source}`);
    if (sectionIds.has(o.id)) refuse(label, `${at}.id`, `is a duplicate: ${o.id}`);
    sectionIds.add(o.id);
    const title = text(label, `${at}.title`, o.title);
    if (!Array.isArray(o.items)) refuse(label, `${at}.items`, "isn't a list");
    const items = o.items.map((it: unknown, j: number) => {
      const item = line(label, `${at}.items[${j}]`, it, true);
      if (itemIds.has(item.id)) refuse(label, `${at}.items[${j}].id`, `is a duplicate: ${item.id}`);
      itemIds.add(item.id);
      return item;
    });
    return { id: o.id, title, items };
  });
  return { version: 1, header: { room: { name, lines } }, sections };
}

// ---- The corpus, as the check reads it ----

/** A backticked claim tag, as the corpus README lists them: `[A 2026-09-27]`, `[A-DOC strategy]`, `[A, C]`. Any other
 * backticked bracket, like the README's own example `[A date]`, is text. */
const TAG_MARK = /`\[([^\]`]+)\]`/g;
const TAG_PART =
  /^(?:A(?: \d{4}-\d{2}(?:-\d{2})?(?:\/\d{2})*)?|A-DOC(?: [^,]+)?|A-CHAT|A-BIO|A-NOTES|A-JD|A-SRE-JD|P|C|\?)$/;

interface Tag {
  parts: string[];
}

function parseTag(inner: string): Tag | null {
  const parts = inner.split(",").map((p) => p.trim());
  return parts.every((p) => TAG_PART.test(p)) ? { parts } : null;
}

/** C4 (data-model.md §2): [A …], [A-DOC …], [A-BIO], [A-CHAT], [A-NOTES], or [C] is sufficient; [P], [A-JD], or
 * [A-SRE-JD] alone only without an ownership verb; [?] never. */
function sufficient(tag: Tag, verb: string | undefined): boolean {
  if (tag.parts.includes("?")) return false;
  const strong = tag.parts.some(
    (p) =>
      p === "A" ||
      p.startsWith("A ") ||
      p === "A-DOC" ||
      p.startsWith("A-DOC ") ||
      ["A-CHAT", "A-BIO", "A-NOTES", "C"].includes(p),
  );
  return strong || verb === undefined;
}

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();
/** Sentences end at ., !, or ? followed by whitespace. */
const sentences = (s: string): string[] =>
  s
    .split(/(?<=[.!?])\s+/)
    .map(collapse)
    .filter(Boolean);

interface Piece {
  text: string;
  tag: Tag;
  doNotClaim: boolean;
}

interface CorpusFile {
  /** Every sentence of every line, with the tags taken out (C2). */
  sentences: string[];
  /** The sentence pieces of each tagged span: the text from a tag to the next tag or the line's end (C3). */
  pieces: Piece[];
}

export interface Forbidden {
  /** Lowercase, whitespace collapsed. */
  phrase: string;
  /** `corpus/<file>:<line>`, the denylist's path and line, or the surname rule. Never the phrase itself. */
  source: string;
}

interface Segment {
  tag: Tag | null;
  text: string;
}

function segments(lineText: string): Segment[] {
  const out: Segment[] = [];
  let tag: Tag | null = null;
  let last = 0;
  for (const m of lineText.matchAll(TAG_MARK)) {
    const next = parseTag(m[1] ?? "");
    if (next === null) continue;
    out.push({ tag, text: lineText.slice(last, m.index) });
    tag = next;
    last = (m.index ?? 0) + m[0].length;
  }
  out.push({ tag, text: lineText.slice(last) });
  return out;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A "Do not claim" bullet's key phrase: its text up to the first clause break, without "That" or its subject. */
function keyPhrase(bullet: string, roomName: string): string | null {
  let s = segments(bullet.replace(/^\s*[-*]\s+/, ""))
    .map((seg) => seg.text)
    .join(" ")
    .replace(/[`*]/g, "");
  s = s.split(/\s+\(|,\s|;\s|\s+—\s|\.\s|\.$|:\s/)[0] ?? "";
  s = collapse(s).replace(/[.;:,]+$/, "");
  s = s.replace(/^That\s+/i, "");
  const subjects = ["he", "she", "they", "his", "her", "their", ...roomName.split(/\s+/).filter(Boolean).map(escape)];
  s = s.replace(new RegExp(`^(?:${subjects.join("|")})\\s+`, "i"), "");
  const phrase = normalize(s);
  return phrase.length >= 4 ? phrase : null;
}

/** Display text as C9 compares it: lowercase, no Markdown emphasis or code marks, quotes straightened. */
function normalize(s: string): string {
  return collapse(s.replace(/[`*]/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase());
}

function readCorpusFile(root: string, rel: string, roomName: string): { file: CorpusFile; forbidden: Forbidden[] } {
  const lines = readFileSync(join(root, rel), "utf8").split("\n");
  const headings: { level: number; doNotClaim: boolean }[] = [];
  const file: CorpusFile = { sentences: [], pieces: [] };
  const forbidden: Forbidden[] = [];
  lines.forEach((raw, i) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (heading) {
      const level = (heading[1] ?? "").length;
      while (headings.length && (headings[headings.length - 1]?.level ?? 0) >= level) headings.pop();
      const title = collapse(
        segments(heading[2] ?? "")
          .map((s) => s.text)
          .join(" "),
      ).toLowerCase();
      headings.push({ level, doNotClaim: title === "do not claim" });
    }
    const doNotClaim = headings.some((h) => h.doNotClaim);
    const segs = segments(raw);
    file.sentences.push(...sentences(segs.map((s) => s.text).join("")));
    for (const seg of segs) {
      if (seg.tag) for (const text of sentences(seg.text)) file.pieces.push({ text, tag: seg.tag, doNotClaim });
    }
    if (doNotClaim && !heading && /^\s*[-*]\s+/.test(raw)) {
      const phrase = keyPhrase(raw, roomName);
      if (phrase) forbidden.push({ phrase, source: `${rel}:${i + 1}` });
    }
  });
  return { file, forbidden };
}

/** C1: under corpus/, a Markdown file, not under intake/, proposals/, or facts/, and a regular file in the tree. */
function corpusPath(root: string, file: string): boolean {
  if (!/^corpus\/[^\\]+\.md$/.test(file) || file.split("/").some((p) => p === ".." || p === "." || p === ""))
    return false;
  if (/^corpus\/(?:intake|proposals|facts)\//.test(file)) return false;
  const full = join(root, file);
  return existsSync(full) && lstatSync(full).isFile();
}

// ---- Facts slots (corpus/README.md, Plug-in numbers) ----

export interface Fact {
  id: string;
  value: unknown;
  public_safe: unknown;
  phrasing: string;
  /** corpus/facts/<file>.yaml */
  file: string;
}

/** Every slot in corpus/facts/*.yaml, by ID. */
export function readFacts(root: string): Map<string, Fact> {
  const facts = new Map<string, Fact>();
  const dir = join(root, "corpus", "facts");
  if (!existsSync(dir)) return facts;
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".yaml")) continue;
    const doc = parseYaml(readFileSync(join(dir, name), "utf8"), { schema: "core" }) as unknown;
    const list = isObject(doc) && Array.isArray(doc.facts) ? doc.facts : [];
    for (const f of list) {
      if (!isObject(f) || typeof f.id !== "string") continue;
      facts.set(f.id, {
        id: f.id,
        value: f.value ?? null,
        public_safe: f.public_safe ?? null,
        phrasing: typeof f.phrasing === "string" ? f.phrasing : "",
        file: posix.join("corpus", "facts", name),
      });
    }
  }
  return facts;
}

/** The display text with each slot filled: a filled, public-safe slot's phrasing with its value, else the declared
 * fallback, else nothing. Never an estimate. */
export function fillSlots(display: string, facts: ReadonlyMap<string, Fact>): string {
  const filled = display.replace(
    SLOT_REF,
    (_m, id: string, _word: string | undefined, fallback: string | undefined) => {
      const fact = facts.get(id);
      if (fact && fact.value !== null && fact.value !== undefined && fact.public_safe === true) {
        return fact.phrasing.replace("{value}", String(fact.value));
      }
      return fallback ?? "";
    },
  );
  return collapse(filled).replace(/\s+([.,;:!?])/g, "$1");
}

/** The digits a display text shows outside slot references; a fallback's digits count, since no slot holds them. */
const outsideSlots = (display: string): string =>
  display.replace(SLOT_REF, (_m, _id: string, _w: string | undefined, fallback: string | undefined) => fallback ?? "");

function slotIds(item: Line): string[] {
  const ids = [...item.text.matchAll(SLOT_REF)].map((m) => m[1] ?? "");
  return [...new Set([...ids, ...item.slots])];
}

// ---- The forbidden list (C9; narration's N3) ----

type DenylistState = "applied" | "missing" | "unreadable";

function readDenylist(path: string): { state: DenylistState; list: Forbidden[] } {
  let lines: string[];
  try {
    if (!statSync(path).isFile()) return { state: "unreadable", list: [] };
    lines = readFileSync(path, "utf8").split("\n");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { state: code === "ENOENT" || code === "ENOTDIR" ? "missing" : "unreadable", list: [] };
  }
  const list: Forbidden[] = [];
  lines.forEach((l, i) => {
    const phrase = normalize(l);
    if (phrase && !l.trimStart().startsWith("#")) list.push({ phrase, source: `${DENYLIST_PATH}:${i + 1}` });
  });
  return { state: "applied", list };
}

/** Every corpus file's "Do not claim" key phrases, the surname rule (each word of main's full name after the
 * first), and the private denylist's phrases when this checkout can read it. */
export function forbiddenList(options: {
  root: string;
  roomName: string;
  fullName: string | null;
  denylist?: string | undefined;
}): { list: Forbidden[]; denylist: DenylistState } {
  const list: Forbidden[] = [];
  const dir = join(options.root, "corpus");
  for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
    if (!name.endsWith(".md") || !lstatSync(join(dir, name)).isFile()) continue;
    list.push(...readCorpusFile(options.root, posix.join("corpus", name), options.roomName).forbidden);
  }
  for (const word of (options.fullName ?? "").split(/\s+/).filter(Boolean).slice(1)) {
    if (word.length >= 2) list.push({ phrase: word.toLowerCase(), source: SURNAME_RULE });
  }
  const denied = readDenylist(options.denylist ?? join(options.root, DENYLIST_PATH));
  return { list: [...list, ...denied.list], denylist: denied.state };
}

const wordBoundary = (phrase: string): RegExp =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}-])${escape(phrase)}(?:$|[^\\p{L}\\p{N}-])`, "iu");

function holds(display: string, f: Forbidden): boolean {
  const shown = normalize(display);
  return f.source === SURNAME_RULE ? wordBoundary(f.phrase).test(shown) : shown.includes(f.phrase);
}

// ---- The check (C1–C9) ----

export interface CheckOptions {
  /** The repository's root: the corpus is <root>/corpus. */
  root: string;
  /** main's resume-header.json full_name, for the surname rule. */
  fullName?: string | null;
  /** The private denylist's path; by default <root>/corpus/intake/private/denylist.txt. */
  denylist?: string | undefined;
}

/** C1–C9 over the room's header and every item: `<id>: <reason>` for each that has a problem, at its first. */
export function checkSource(
  source: ResumeSource,
  options: CheckOptions,
): { problems: string[]; denylist: DenylistState } {
  const { root } = options;
  const roomName = source.header.room.name;
  const cache = new Map<string, CorpusFile>();
  const corpusFile = (rel: string): CorpusFile => {
    let file = cache.get(rel);
    if (!file) {
      file = readCorpusFile(root, rel, roomName).file;
      cache.set(rel, file);
    }
    return file;
  };
  const facts = readFacts(root);
  const forbidden = forbiddenList({ root, roomName, fullName: options.fullName ?? null, denylist: options.denylist });

  /** C1–C5 for one citation: its reason, or the sentence pieces it may cite. */
  const citation = (claim: Claim, verb: string | undefined): string | string[] => {
    if (!corpusPath(root, claim.file)) return "not a corpus file";
    const file = corpusFile(claim.file);
    const quote = collapse(claim.quote);
    if (quote.length < 12 || !file.sentences.some((s) => s.includes(quote))) return "quote not found";
    const tagged = file.pieces.filter((p) => p.text.includes(quote));
    if (tagged.length === 0) return "untagged sentence";
    const enough = tagged.filter((p) => sufficient(p.tag, verb));
    if (enough.length === 0) return "tag not sufficient";
    const citable = enough.filter((p) => !p.doNotClaim);
    if (citable.length === 0) return "do-not-claim section";
    return citable.map((p) => p.text);
  };

  const check = (id: string, item: Line, verb: string | undefined): string | null => {
    const cited: string[] = [];
    for (const claim of item.claims) {
      const result = citation(claim, verb);
      if (typeof result === "string") return `${id}: ${result}`;
      cited.push(...result);
    }
    if (/\d/.test(outsideSlots(item.text))) return `${id}: bare number`;
    if (slotIds(item).some((slot) => !facts.has(slot))) return `${id}: unknown slot`;
    if (verb !== undefined) {
      const said = wordBoundary(verb.toLowerCase());
      if (!said.test(normalize(outsideSlots(item.text))) || !cited.some((s) => said.test(normalize(s)))) {
        return `${id}: ownership verb not cited`;
      }
    }
    const shown = fillSlots(item.text, facts);
    const hit = forbidden.list.find((f) => holds(shown, f));
    return hit ? `${id}: forbidden phrase (from ${hit.source})` : null;
  };

  const problems: string[] = [];
  const name = forbidden.list.find((f) => holds(roomName, f));
  if (/\d/.test(roomName)) problems.push("header.name: bare number");
  else if (name) problems.push(`header.name: forbidden phrase (from ${name.source})`);
  source.header.room.lines.forEach((l, i) => {
    const problem = check(`header.lines[${i}]`, l, undefined);
    if (problem) problems.push(problem);
  });
  for (const section of source.sections) {
    for (const item of section.items) {
      const problem = check(item.id, item, item.verb);
      if (problem) problems.push(problem);
    }
  }
  return { problems, denylist: forbidden.denylist };
}

// ---- The rendering ----

export interface Rendered {
  header: { name: string; lines: string[] };
  sections: { id: string; title: string; items: { id: string; text: string }[] }[];
}

/** The header and items with their slots filled, in the source's order: what both renderings show. */
export function renderResume(source: ResumeSource, facts: ReadonlyMap<string, Fact>): Rendered {
  return {
    header: {
      name: collapse(source.header.room.name),
      lines: source.header.room.lines.map((l) => fillSlots(l.text, facts)),
    },
    sections: source.sections.map((s) => ({
      id: s.id,
      title: collapse(s.title),
      items: s.items.map((i) => ({ id: i.id, text: fillSlots(i.text, facts) })),
    })),
  };
}

// ---- The lock (contracts/resume-source.md §3) ----

export interface Lock {
  files: Record<string, string>;
}

const sha256 = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");

/** Every corpus file a citation names and every facts file a slot reads, sorted. */
export function lockedFiles(root: string, source: ResumeSource): string[] {
  const facts = readFacts(root);
  const lines: Line[] = [...source.header.room.lines, ...source.sections.flatMap((s) => s.items)];
  const files = new Set<string>();
  for (const l of lines) {
    for (const claim of l.claims) files.add(claim.file);
    for (const slot of slotIds(l)) {
      const fact = facts.get(slot);
      if (fact) files.add(fact.file);
    }
  }
  return [...files].sort();
}

export function computeLock(root: string, source: ResumeSource): Lock {
  return { files: Object.fromEntries(lockedFiles(root, source).map((p) => [p, sha256(readFileSync(join(root, p)))])) };
}

/** The lock's problems: a cited file that changed or isn't in it, and a file in it nothing cites. */
export function checkLock(root: string, source: ResumeSource, lock: Lock): string[] {
  const expected = lockedFiles(root, source);
  const problems: string[] = [];
  for (const path of expected) {
    const full = join(root, path);
    const now = existsSync(full) ? sha256(readFileSync(full)) : null;
    if (lock.files[path] === undefined || lock.files[path] !== now)
      problems.push(`corpus changed since the lock: ${path}`);
  }
  for (const path of Object.keys(lock.files)) {
    if (!expected.includes(path)) problems.push(`the lock names a file the source no longer cites: ${path}`);
  }
  return problems;
}

export function readLock(root: string): Lock | null {
  const path = join(root, LOCK_PATH);
  if (!existsSync(path)) return null;
  const doc = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isObject(doc) || !isObject(doc.files) || !Object.values(doc.files).every((v) => typeof v === "string")) {
    throw new ContentError(`${LOCK_PATH}: isn't {files: {<corpus path>: <sha256>}} (contracts/resume-source.md §3)`);
  }
  return { files: doc.files as Record<string, string> };
}

export function writeLock(root: string, lock: Lock): void {
  const files = Object.fromEntries(
    Object.keys(lock.files)
      .sort()
      .map((p) => [p, lock.files[p] as string]),
  );
  writeFileSync(join(root, LOCK_PATH), `${JSON.stringify({ files }, null, 2)}\n`);
}

// ---- What the build publishes (contracts/resume-source.md §4 and §5) ----

/** room-data.json's resume part, and resume.pdf beside it. The check runs whether or not the source is published. */
export async function resumePart(data: RoomData, context: RoomDataContext): Promise<RoomData> {
  const path = join(context.root, RESUME_PATH);
  if (!existsSync(path)) return { ...data, resume_state: "absent", header: null, sections: [] };
  const source = parseResume(readFileSync(path, "utf8"));
  const { problems, denylist } = checkSource(source, {
    root: context.root,
    fullName: context.policy.header?.full_name ?? null,
  });
  if (problems.length > 0) {
    throw new ContentError(
      `${RESUME_PATH}: the citation check failed (contracts/resume-source.md §2):\n${problems.join("\n")}`,
    );
  }
  context.info?.(
    `resume: C1–C9 passed; ${denylist === "applied" ? "the private denylist was applied" : `the private denylist is ${denylist} here, so C9 checked the public list only`}`,
  );
  const lock = readLock(context.root);
  for (const problem of lock ? checkLock(context.root, source, lock) : [`no lock at ${LOCK_PATH}`]) {
    context.warn(`${problem} (${LOCK_HINT})`);
  }

  const file = context.files.find((f) => f.path === RESUME_PATH);
  const { publish, banner } = publication(file?.state ?? "draft", context.drafts);
  const state = !publish ? "withheld" : banner ? "draft" : "approved";
  const rendered = renderResume(source, readFacts(context.root));
  const pdf = await renderPdf(pdfInput(publish ? rendered : null, context.policy, state));
  context.emit("resume.pdf", pdf);
  // The PDF's text, for the gate's scan of dist/: the embedded font stores glyph codes, not text.
  context.emit("resume.pdf.txt", `${await pdfText(pdf)}\n`);

  const stamp = { source: RESUME_PATH, sha256: file?.sha256 ?? sha256(readFileSync(path)) };
  const lockPath = join(context.root, LOCK_PATH);
  const header: RoomResumeHeader | null = publish ? { ...rendered.header, ...stamp } : null;
  const sections: RoomResumeSection[] = publish
    ? rendered.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, ...stamp })) }))
    : [];
  return {
    ...data,
    built_from: { ...data.built_from, lock: existsSync(lockPath) ? sha256(readFileSync(lockPath)) : null },
    resume_state: state,
    header,
    sections,
  };
}

// ---- `npm run content:lock -w apps/web`, and a check from the command line ----

/** The repository's root: this file is apps/web/build/content.ts. */
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const source = parseResume(readFileSync(join(REPO_ROOT, RESUME_PATH), "utf8"));
  const policyDir = process.env.ROOM_POLICY_DIR || DEFAULT_POLICY_DIR;
  const fullName = readPolicy(policyDir).header?.full_name ?? null;
  const { problems, denylist } = checkSource(source, { root: REPO_ROOT, fullName });
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`content: ${problems.length} problem(s); the lock is unchanged`);
    process.exit(1);
  }
  if (process.argv.includes("--lock")) {
    writeLock(REPO_ROOT, computeLock(REPO_ROOT, source));
    console.log(`content: C1–C9 passed (denylist ${denylist}); wrote ${LOCK_PATH}`);
  } else {
    const lock = readLock(REPO_ROOT);
    const stale = lock ? checkLock(REPO_ROOT, source, lock) : [`no lock at ${LOCK_PATH}`];
    for (const problem of stale) console.error(problem);
    console.log(
      `content: C1–C9 passed (denylist ${denylist}); lock ${stale.length ? `stale (${LOCK_HINT})` : "current"}`,
    );
    process.exit(stale.length ? 1 : 0);
  }
}
