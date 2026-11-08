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
// The forbidden list is shared with narration's N3 (contracts/narration.md §2). The line check is exported for spec
// 004's room words (T074; FR-035; R-15): `checkLine` gives one line's first problem, which checkSource reports after
// the line's ID, with C6's `bareNumber` and C9's `forbiddenHit`, and `lineContext` makes what it reads from the root,
// `treeLineContext` the same through the compositor's tree.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml, parseDocument, visit } from "yaml";

import type { RoomResumeHeader, RoomResumeSection } from "../src/resume/data";
import { publication, readPolicy, type RoomData, type RoomDataContext } from "./approvals";
import { readScripts } from "./narration-source";
import { pdfInput, pdfText, renderPdf } from "./pdf";
import { DEFAULT_POLICY_DIR } from "./policy";

export const RESUME_PATH = "apps/web/content/resume.yaml";
export const LOCK_PATH = "apps/web/content/resume.lock.json";
/** The Author's private denylist (corpus/README.md, Public safety), gitignored and local only. */
export const DENYLIST_PATH = "corpus/intake/private/denylist.txt";
export const SURNAME_RULE = "the surname rule";
const LOCK_HINT = "run npm run content:lock -w apps/web";

/** The corpus's ownership verbs (corpus/README.md, Role precision; data-model.md §2), "architected", the ruling
 * 02-production-infrastructure-national-scale.md gives the CHT 4.0 architecture ("Ownership: *architected*"), and
 * "configured", the Author's verb for technical software (his answer of 2026-10-30; `01`'s ruling for the agent
 * orchestrator). */
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
  "configured",
] as const;

/** The past-tense verbs the corpus uses for the Author's acts beside the ownership verbs (spec 002's narration
 * review): C8 holds them as it holds the ownership verbs, so a word the text says as an act must be one a cited
 * sentence says. They aren't `verb` values an item can declare. */
export const ACT_VERBS = [
  "released",
  "published",
  "organized",
  "researched",
  "turned",
  "localized",
  "trained",
  "prepared",
  "found",
  "determined",
  "mapped",
  "engaged",
  "obtained",
  "adopted",
  "pitched",
  "won",
  "defined",
  "coined",
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
  /** A narration script's: its item's verb sets C4's bar for its citations, and the words needn't say it (N1). */
  verbUnsaid?: true;
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

/** The slot IDs a display text references, refusing a malformed reference. Narration's scripts use it too. */
export function slotRefs(label: string, at: string, display: string): string[] {
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
 * backticked bracket, like the README's own examples `[A date]` and `[A-DOC <name>]`, is text: an A tag's date is
 * digits, and an A-DOC tag names its document in words. */
const TAG_MARK = /`\[([^\]`]+)\]`/g;
const TAG_PART =
  /^(?:A(?: \d{4}-\d{2}(?:-\d{2})?(?:\/\d{2})*)?|A-DOC(?: [a-z][a-z ]*)?|A-CHAT|A-BIO|A-NOTES|A-JD|A-SRE-JD|P|C|\?)$/;
/** The corpus's topic files, the only citable ones: `corpus/NN-<topic>.md`, never README.md, INTAKE.md, or a file in a
 * folder (corpus/README.md, Files). */
const TOPIC_FILE = /^\d{2}-[a-z0-9-]+\.md$/;

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

export interface CorpusFile {
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

/** The single-word ownership verbs, and any past tense, for carrying a verb across a bullet's alternatives. */
const verbish = (word: string): boolean =>
  ["built", "led", "sourced", "sponsored", "designed", "co-authored", "architected", "configured"].includes(word) ||
  /[a-z]ed$/.test(word);

/** A "Do not claim" bullet's key phrases: its text up to the first clause break, without "That" or its subject, then
 * each alternative it joins with "or". When the first alternative opens with a verb and a later one doesn't, the verb
 * carries over: "built the CHT skills or cht-pr-review" gives "built the cht skills" and "built cht-pr-review". */
function keyPhrases(bullet: string, roomName: string): string[] {
  const subjects = ["he", "she", "they", "his", "her", "their", ...roomName.split(/\s+/).filter(Boolean).map(escape)];
  const lead = new RegExp(`^(?:that\\s+)?(?:(?:${subjects.join("|")})\\s+)?`, "i");
  const clause = keyPhrase(bullet, roomName);
  if (clause === null) return [];
  const [first = "", ...rest] = clause.split(/\s+or\s+/).map((a) => a.replace(lead, "").trim());
  const verb = first.split(" ")[0] ?? "";
  const alternatives = [
    first,
    ...rest.map((a) => (verbish(verb) && !verbish(a.split(" ")[0] ?? "") ? `${verb} ${a}` : a)),
  ];
  return alternatives.filter((a) => a.length >= 4);
}

/** A "Do not claim" bullet's first clause: its text up to the first clause break, without "That" or its subject. */
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
  return parseCorpusFile(readFileSync(join(root, rel), "utf8"), rel, roomName);
}

/** A corpus topic file's text, `rel`'s, as the check reads it: its sentences and tagged pieces (C2 to C5), and its
 * "Do not claim" key phrases, each with its line (C9). */
function parseCorpusFile(text: string, rel: string, roomName: string): { file: CorpusFile; forbidden: Forbidden[] } {
  const lines = text.split("\n");
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
      for (const phrase of keyPhrases(raw, roomName)) forbidden.push({ phrase, source: `${rel}:${i + 1}` });
    }
  });
  return { file, forbidden };
}

/** C1: one of the corpus's topic files, `corpus/NN-<topic>.md` at its top level (so never under intake/, proposals/,
 * or facts/, and never README.md or INTAKE.md), and a regular file in the tree. */
function corpusPath(root: string, file: string): boolean {
  if (!isTopicPath(file)) return false;
  const full = join(root, file);
  return existsSync(full) && lstatSync(full).isFile();
}

/** C1's form, with nothing read: `corpus/NN-<topic>.md` at the corpus's top level. */
function isTopicPath(file: string): boolean {
  const [top, name, ...deeper] = file.split("/");
  return top === "corpus" && name !== undefined && deeper.length === 0 && TOPIC_FILE.test(name);
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
    for (const fact of factsIn(readFileSync(join(dir, name), "utf8"), name)) facts.set(fact.id, fact);
  }
  return facts;
}

/** The slots of one facts file, `corpus/facts/<name>`, from its text; the yaml package's error for one that isn't
 * YAML. Exported for spec 007's grounding pack (build/twin-pack.ts), which reads the files through its own reader. */
export function factsIn(text: string, name: string): Fact[] {
  const doc = parseYaml(text, { schema: "core" }) as unknown;
  const list = isObject(doc) && Array.isArray(doc.facts) ? doc.facts : [];
  const facts: Fact[] = [];
  for (const f of list) {
    if (!isObject(f) || typeof f.id !== "string") continue;
    facts.push({
      id: f.id,
      value: f.value ?? null,
      public_safe: f.public_safe ?? null,
      phrasing: typeof f.phrasing === "string" ? f.phrasing : "",
      file: posix.join("corpus", "facts", name),
    });
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

export type DenylistState = "applied" | "missing" | "unreadable";

function readDenylist(path: string): { state: DenylistState; list: Forbidden[] } {
  let text: string;
  try {
    if (!statSync(path).isFile()) return { state: "unreadable", list: [] };
    text = readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { state: code === "ENOENT" || code === "ENOTDIR" ? "missing" : "unreadable", list: [] };
  }
  return { state: "applied", list: denylistPhrases(text) };
}

/** The private denylist's phrases from its text, one a line, `#` opening a comment, each with its line. */
function denylistPhrases(text: string): Forbidden[] {
  const list: Forbidden[] = [];
  text.split("\n").forEach((l, i) => {
    const phrase = normalize(l);
    if (phrase && !l.trimStart().startsWith("#")) list.push({ phrase, source: `${DENYLIST_PATH}:${i + 1}` });
  });
  return list;
}

/** The surname rule: each word of main's full name after the first, of two letters or more. */
function surnameRule(fullName: string | null): Forbidden[] {
  const words = (fullName ?? "").split(/\s+/).filter(Boolean).slice(1);
  return words.filter((word) => word.length >= 2).map((word) => ({ phrase: word.toLowerCase(), source: SURNAME_RULE }));
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
    if (!TOPIC_FILE.test(name) || !lstatSync(join(dir, name)).isFile()) continue;
    list.push(...readCorpusFile(options.root, posix.join("corpus", name), options.roomName).forbidden);
  }
  list.push(...surnameRule(options.fullName));
  const denied = readDenylist(options.denylist ?? join(options.root, DENYLIST_PATH));
  return { list: [...list, ...denied.list], denylist: denied.state };
}

/** An auxiliary right before a verb, an adverb allowed between: "was built", "is being used". */
const AUXILIARY = /(?:^|[^\p{L}])(?:is|was|were|are|been|being|be)\s+(?:\p{L}+ly\s+)?$/u;

/** Who a subject word names: the Author (a pronoun, the room's name, or "who" in a sentence about him) or someone
 * else. Other words aren't subjects this test can read. */
const OTHER_SUBJECTS = new Set([
  "it",
  "they",
  "others",
  "which",
  "that",
  "she",
  "we",
  "i",
  "you",
  "someone",
  // A possessive opens someone's or something's noun phrase: "his pitch and design won" says the pitch won.
  "his",
  "her",
  "its",
  "their",
]);
const ADVERB = "(?:(?:still|also|first|then|later|once|now|just)\\s+)?";

type Act = { author: boolean; passive: boolean };

/** The single-word ownership and act verbs a sentence says as the Author's own acts (C8; the narration review of
 * 2026-10-18). Each occurrence, in order:
 *   - with "by" after it, a passive naming its agent: the Author's when "by" names him ("Designed by Hareet");
 *   - after an auxiliary ("was built"), or right after a comma, a participle phrase ("…on-call engineer, built
 *     security-first"): nobody's act;
 *   - right after a subject: the Author's when it's "he", "him", the room's name, or "who"; someone else's when it's
 *     "it", "they", "others", "which", "that", or the like ("which others built");
 *   - after "and", "or", "then", or a dash: the act of the verb it's coordinated with, the last one before it, and
 *     nobody's when that one was a passive ("Built by Hareet and released to production" says who built it, not who
 *     released it);
 *   - first in its clause ("Built agent-watchdog", "Ownership: led"): the Author's, the resume's implied subject or a
 *     ruling;
 *   - otherwise: the Author's when the nearest subject word before it in its sentence names him.
 * Each sentence on its own; normalized text, lowercase. A heuristic, not a parser. */
function authorActs(text: string, authorWords: readonly string[]): Set<string> {
  const acts = new Set<string>();
  for (const sentence of sentences(text)) for (const verb of sentenceActs(sentence, authorWords)) acts.add(verb);
  return acts;
}

function sentenceActs(sentence: string, authorWords: readonly string[]): Set<string> {
  const verbs = [...OWNERSHIP_VERBS, ...ACT_VERBS].filter((v) => /^[a-z-]+$/.test(v));
  const author = new Set([...authorWords, "he", "him", "who"]);
  const found = new RegExp(`(?:^|[^\\p{L}\\p{N}-])(${verbs.map(escape).join("|")})(?=$|[^\\p{L}\\p{N}-])`, "gu");
  const subjectBefore = new RegExp(`(?:^|[^\\p{L}'-])([\\p{L}'-]+)\\s+${ADVERB}$`, "u");
  const acts = new Set<string>();
  let last: Act | null = null;
  for (const m of sentence.matchAll(found)) {
    const verb = m[1] ?? "";
    const start = m.index + m[0].length - verb.length;
    const before = sentence.slice(0, start);
    const after = sentence.slice(start + verb.length);
    let act: Act;
    const by = /^\s+by\s+([\p{L}'-]+)/u.exec(after);
    const subject = subjectBefore.exec(before)?.[1] ?? "";
    if (by) {
      act = { author: author.has(by[1] ?? "") && by[1] !== "who", passive: true };
    } else if (AUXILIARY.test(before) || /,\s*$/.test(before)) {
      act = { author: false, passive: true };
    } else if (author.has(subject) || OTHER_SUBJECTS.has(subject)) {
      act = { author: author.has(subject), passive: false };
    } else if (/(?:^|[^\p{L}])(?:and|or|then)\s+$|[—–]\s*$/u.test(before) && last) {
      act = { author: !last.passive && last.author, passive: last.passive };
    } else if (!/\p{L}/u.test(before.slice(Math.max(before.lastIndexOf(";"), before.lastIndexOf(":")) + 1))) {
      act = { author: true, passive: false };
    } else {
      const words = before.match(/[\p{L}'-]+/gu) ?? [];
      const named = [...words].reverse().find((w) => author.has(w) || OTHER_SUBJECTS.has(w));
      act = { author: named !== undefined && author.has(named), passive: false };
    }
    if (act.author) acts.add(verb);
    last = act;
  }
  return acts;
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

/** What checkLine reads besides the line: made once per check, by lineContext from the repository's root for
 * checkSource, and by whichever caller reads the corpus another way, such as spec 004's compositor (RT2 to RT5). */
export interface LineContext {
  /** C1: a corpus topic file as the check reads it, or null when the path names none. */
  corpusFile(file: string): CorpusFile | null;
  /** C7's facts slots, by ID; C9 reads a line with them filled. */
  readonly facts: ReadonlyMap<string, Fact>;
  /** C8's subject words for the Author: the room's name, normalized, word by word. */
  readonly authorWords: readonly string[];
  /** C9's list (forbiddenList). */
  readonly forbidden: readonly Forbidden[];
  /** Whether C9's list holds the private denylist, as checkSource reports it. */
  readonly denylist: DenylistState;
}

/** checkSource's context: the room's name, the facts, and C9's list, each corpus file read once, when first cited. */
export function lineContext(options: CheckOptions, roomName: string): LineContext {
  const { root } = options;
  const authorWords = normalize(roomName).split(/\s+/).filter(Boolean);
  const cache = new Map<string, CorpusFile>();
  const facts = readFacts(root);
  const forbidden = forbiddenList({ root, roomName, fullName: options.fullName ?? null, denylist: options.denylist });
  return {
    corpusFile(rel: string): CorpusFile | null {
      if (!corpusPath(root, rel)) return null;
      let file = cache.get(rel);
      if (!file) {
        file = readCorpusFile(root, rel, roomName).file;
        cache.set(rel, file);
      }
      return file;
    },
    facts,
    authorWords,
    forbidden: forbidden.list,
    denylist: forbidden.denylist,
  };
}

/** A tree of the repository's files, as spec 004's compositor reads its inputs (apps/web/build/room/source.ts), as far
 * as the check needs it: a path's bytes, null when it isn't a regular file there, and a folder's entries, sorted. */
export interface CorpusTree {
  read(path: string): Uint8Array | null;
  list(dir: string): readonly string[];
}

/** lineContext's context read through a tree, as spec 004's compositor reads everything (RT2 to RT7): the corpus's
 * topic files, its facts, and the private denylist where the tree holds it, in lineContext's order, with the same
 * room name and surname rule. A file the tree doesn't give is absent, and a facts file that isn't YAML gives no slots:
 * nothing throws. */
export function treeLineContext(tree: CorpusTree, roomName: string, fullName: string | null): LineContext {
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  const text = (path: string): string | null => {
    const bytes = tree.read(path);
    return bytes === null ? null : decoder.decode(bytes);
  };
  const files = new Map<string, ReturnType<typeof parseCorpusFile> | null>();
  const corpus = (rel: string): ReturnType<typeof parseCorpusFile> | null => {
    if (!files.has(rel)) {
      const found = isTopicPath(rel) ? text(rel) : null;
      files.set(rel, found === null ? null : parseCorpusFile(found, rel, roomName));
    }
    return files.get(rel) ?? null;
  };
  const facts = new Map<string, Fact>();
  for (const name of tree.list("corpus/facts")) {
    const found = name.endsWith(".yaml") ? text(`corpus/facts/${name}`) : null;
    if (found === null) continue;
    try {
      for (const fact of factsIn(found, name)) facts.set(fact.id, fact);
    } catch {
      // Not YAML: no slots from it.
    }
  }
  const forbidden: Forbidden[] = [];
  for (const name of tree.list("corpus")) {
    if (TOPIC_FILE.test(name)) forbidden.push(...(corpus(`corpus/${name}`)?.forbidden ?? []));
  }
  forbidden.push(...surnameRule(fullName));
  const denylist = text(DENYLIST_PATH);
  if (denylist !== null) forbidden.push(...denylistPhrases(denylist));
  return {
    corpusFile: (rel) => corpus(rel)?.file ?? null,
    facts,
    authorWords: normalize(roomName).split(/\s+/).filter(Boolean),
    forbidden,
    denylist: denylist === null ? "missing" : "applied",
  };
}

/** C1–C5 for one citation: its reason, or the sentence pieces it may cite. */
function citation(claim: Claim, verb: string | undefined, ctx: LineContext): string | string[] {
  const file = ctx.corpusFile(claim.file);
  if (file === null) return "not a corpus file";
  const quote = collapse(claim.quote);
  if (quote.length < 12 || !file.sentences.some((s) => s.includes(quote))) return "quote not found";
  const tagged = file.pieces.filter((p) => p.text.includes(quote));
  if (tagged.length === 0) return "untagged sentence";
  const enough = tagged.filter((p) => sufficient(p.tag, verb));
  if (enough.length === 0) return "tag not sufficient";
  const citable = enough.filter((p) => !p.doNotClaim);
  if (citable.length === 0) return "do-not-claim section";
  return citable.map((p) => p.text);
}

/** C6: whether a display text shows a digit outside its slot references; a fallback's digits count. */
export function bareNumber(display: string): boolean {
  return /\d/.test(outsideSlots(display));
}

/** C9: the first phrase of the list that a shown text holds, or null: the surname rule's only as a whole word, any
 * other anywhere, compared as normalize gives the text. A caller reports it by its source, never by its words. */
export function forbiddenHit(shown: string, list: readonly Forbidden[]): Forbidden | null {
  return list.find((f) => holds(shown, f)) ?? null;
}

/** C1–C9 for one line, a header line or an item, under the verb its item declares: the first problem's reason, as
 * checkSource reports it after the line's ID, or null. A line marked verbUnsaid, a narration script's, holds its
 * citations to the verb's bar without saying the verb (N1). */
export function checkLine(
  line: Line & { readonly verbUnsaid?: true },
  verb: string | undefined,
  ctx: LineContext,
): string | null {
  const cited: string[] = [];
  for (const claim of line.claims) {
    const result = citation(claim, verb, ctx);
    if (typeof result === "string") return result;
    cited.push(...result);
  }
  if (bareNumber(line.text)) return "bare number";
  if (slotIds(line).some((slot) => !ctx.facts.has(slot))) return "unknown slot";
  // C8: the declared verb is in the text, and every ownership verb the text uses, declared or not, is in a cited
  // sentence as a verb: "his pitch and design" never becomes "designed" (FR-015). The corpus's other act verbs are
  // held the same way, and a verb the text says as an act must be one a cited sentence says as an act, never only
  // in an agentless passive.
  const shownText = normalize(outsideSlots(line.text));
  if (verb !== undefined && line.verbUnsaid !== true && !wordBoundary(verb.toLowerCase()).test(shownText))
    return "ownership verb not cited";
  for (const owned of [...OWNERSHIP_VERBS, ...ACT_VERBS]) {
    const said = wordBoundary(owned.toLowerCase());
    if (!said.test(shownText)) continue;
    if (!cited.some((s) => said.test(normalize(s)))) return "ownership verb not cited";
    const word = owned.toLowerCase();
    if (
      /^[a-z-]+$/.test(word) &&
      authorActs(shownText, ctx.authorWords).has(word) &&
      !cited.some((s) => authorActs(normalize(s), ctx.authorWords).has(word))
    ) {
      return "passive made active";
    }
  }
  const hit = forbiddenHit(fillSlots(line.text, ctx.facts), ctx.forbidden);
  return hit ? `forbidden phrase (from ${hit.source})` : null;
}

/** C1–C9 over the room's header and every item: `<id>: <reason>` for each that has a problem, at its first. */
export function checkSource(
  source: ResumeSource,
  options: CheckOptions,
): { problems: string[]; denylist: DenylistState } {
  const roomName = source.header.room.name;
  const ctx = lineContext(options, roomName);
  const problems: string[] = [];
  const name = forbiddenHit(roomName, ctx.forbidden);
  if (/\d/.test(roomName)) problems.push("header.name: bare number");
  else if (name) problems.push(`header.name: forbidden phrase (from ${name.source})`);
  source.header.room.lines.forEach((l, i) => {
    const problem = checkLine(l, undefined, ctx);
    if (problem) problems.push(`header.lines[${i}]: ${problem}`);
  });
  for (const section of source.sections) {
    for (const item of section.items) {
      const problem = checkLine(item, item.verb, ctx);
      if (problem) problems.push(`${item.id}: ${problem}`);
    }
  }
  return { problems, denylist: ctx.denylist };
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

/** Every corpus file a citation names and every facts file a slot reads, the narration scripts' with the source's
 * (data-model.md §5), sorted. */
export function lockedFiles(root: string, source: ResumeSource): string[] {
  const facts = readFacts(root);
  const scripts: Line[] = readScripts(root).map((s) => ({ text: s.body, claims: s.claims, slots: s.slots }));
  const lines: Line[] = [...source.header.room.lines, ...source.sections.flatMap((s) => s.items), ...scripts];
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
