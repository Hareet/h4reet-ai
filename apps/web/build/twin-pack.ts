// The twin's grounding pack (spec 007; FR-007, FR-008, FR-049, SC-011; plan §4): one committed file,
// config/twin/corpus.json, compiled from the corpus's public topic files and its facts slots, which the gateway's turn
// route grounds every answer in. `npm run twin:pack -w apps/web` writes it, deterministically (sorted keys, LF endings,
// no time stamp), and apps/web/test/twin-pack.test.ts fails make test while it's stale, naming the corpus file whose
// sections moved.
//
// What it reads, and nothing else: `corpus/NN-<topic>.md` at the corpus's top level (content.ts's C1 rule),
// `corpus/facts/*.yaml`, and `config/room-topics.yaml`. Never `corpus/README.md`, `INTAKE.md`, `intake/` (the private
// denylist included), `proposals/`, or `tools/`: the corpus README's "Content from conversations elsewhere enters only
// via INTAKE.md and intake/ ... The twin never cites a chat; it cites this corpus."
//
// What it holds:
// - sections: each `##` heading's content of each topic file, the lines before the first one as the file's lead, each
//   Golden Q&A item as a section of its own, any section over 2,000 characters split at its bullets; claim tags kept;
//   each slot filled by content.ts's fillSlots, so a filled, public-safe slot renders its phrasing and an empty one its
//   fallback or nothing;
// - rules: every "Do not claim" bullet, verbatim, with its file; `01`'s ownership rulings paragraph, verbatim, and
//   parsed into `{system, verbs}`; the ownership verbs; and the links of every "Public artifacts" section;
// - quotes: `08`'s Golden Q&A answers for the privacy promise and the agents' share, verbatim, with the spans of the
//   corpus's words that guard G8 looks for, each checked here to be in `08`'s text;
// - selectables: config/room-topics.yaml's entries, so the gateway reads one file for all of it;
// - hashes: SHA-256 of canonical JSON, per topic (the rules, the quotes, `00`, the topic's files, its selectables) and
//   whole, which the gateway recomputes at load and readiness binds (FR-030).
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import { OWNERSHIP_VERBS, factsIn, fillSlots } from "./content";
import type { Fact } from "./content";

export const PACK_PATH = "config/twin/corpus.json";
export const TOPICS_PATH = "config/room-topics.yaml";
export const GENERATED_BY = "npm run twin:pack -w apps/web";
export const PROFILE_FILE = "corpus/00-profile.md";
export const RULINGS_FILE = "corpus/01-ai-strategy-and-cht.md";
export const PROMISE_FILE = "corpus/08-hareet-ai.md";
/** A section longer than this is split at its bullets (plan §4). */
export const SECTION_MAX_CHARS = 2_000;

/** FR-027's defaults: the per-turn limits while config/budgets.yaml has no limits.twin (plan §3). */
export const DEFAULT_TWIN_LIMITS = {
  turn_max_chars: 600,
  history_max_turns: 8,
  history_max_chars: 4_000,
  max_input_chars: 32_000,
  max_output_tokens: 300,
} as const;
/** The twin's instructions, which the fit check measures (plan §4; departure D5). */
export const PROMPT_PATH = "config/twin/prompt.md";
/** The Author's per-turn limits, which the fit check holds the pack to when `limits.twin` is there (FR-027). */
export const BUDGETS_PATH = "config/budgets.yaml";

export type FitLimits = { max_input_chars: number; history_max_chars: number; history_max_turns: number };

/** The fit check's limits: config/budgets.yaml's `limits.twin` where it holds all three, else FR-027's defaults. Read
 *  by the CLI and the freshness test, never by buildPack, whose reads stay the corpus's and config/room-topics.yaml. */
export function fitLimits(budgetsText: string | null): FitLimits {
  const twin = (parseYaml(budgetsText ?? "") as { limits?: { twin?: Record<string, unknown> } } | null)?.limits?.twin;
  const pick = (key: keyof FitLimits): number => {
    const value = twin?.[key];
    return typeof value === "number" && Number.isInteger(value) ? value : DEFAULT_TWIN_LIMITS[key];
  };
  return {
    max_input_chars: pick("max_input_chars"),
    history_max_chars: pick("history_max_chars"),
    history_max_turns: pick("history_max_turns"),
  };
}

/** The corpus's own words that guard G8 holds the twin to (FR-014): the privacy promise, in the Author's words of
 *  2026-11-06, and the agents' share. Each must be in `08-hareet-ai.md`'s text, or the build fails. */
export const PRIVACY_SPANS = ["your conversation is not saved", "We disclose every data flow"] as const;
export const AGENTS_SHARE_SPANS = ["AI agents in named roles do most of the typing, and only I merge"] as const;

/** A topic file: `NN-<topic>.md` at the corpus's top level. */
const TOPIC_FILE = /^\d{2}-[a-z0-9-]+\.md$/;
const FACTS_FILE = /^[a-z0-9-]+\.yaml$/;

/** What the builder reads through: a file's text or null, and a folder's names. Tests spy on it. */
export interface PackReader {
  read(path: string): string | null;
  list(dir: string): string[];
}

/** The repository's files, by path from the root. Only regular files and folders are read. */
export function fsReader(root: string): PackReader {
  return {
    read(path) {
      const full = join(root, path);
      if (!existsSync(full) || !lstatSync(full).isFile()) return null;
      return readFileSync(full, "utf8");
    },
    list(dir) {
      const full = join(root, dir);
      if (!existsSync(full) || !lstatSync(full).isDirectory()) return [];
      return readdirSync(full).sort();
    },
  };
}

export interface GoldenItem {
  readonly n: number;
  readonly question: string;
  readonly answer: string;
  readonly tags: readonly string[];
}

export interface PackSection {
  /** `<file stem>#<n>`: 0 is the file's lead, 1 on its `##` sections in order; `.k` a split part; `#q<n>` a Golden Q&A. */
  readonly id: string;
  readonly file: string;
  readonly heading: string;
  readonly kind: "lead" | "section" | "golden";
  readonly text: string;
  readonly chars: number;
  readonly golden: GoldenItem | null;
}

export interface Ruling {
  readonly system: string;
  readonly verbs: readonly string[];
}

export interface QuoteEntry {
  readonly file: string;
  readonly answer: string;
  readonly spans: readonly string[];
}

export interface Selectable {
  readonly id: string;
  readonly topic: string;
  readonly files: readonly string[];
  readonly lead: string | null;
}

export interface TopicEntry {
  readonly id: string;
  readonly files: readonly string[];
  readonly sha256: string;
}

export interface TwinPack {
  readonly schema: 1;
  readonly generated_by: string;
  readonly files: readonly string[];
  readonly sections: readonly PackSection[];
  readonly rules: {
    readonly do_not_claim: readonly { readonly file: string; readonly text: string }[];
    readonly rulings: { readonly file: string; readonly text: string; readonly entries: readonly Ruling[] };
    readonly ownership_verbs: readonly string[];
    readonly artifacts: readonly string[];
  };
  readonly quotes: { readonly privacy: QuoteEntry; readonly agents_share: QuoteEntry };
  readonly selectables: readonly Selectable[];
  readonly topics: readonly TopicEntry[];
  readonly sha256: string;
}

export interface PackBuild {
  readonly pack: TwinPack;
  /** Why the pack can't be used, each naming its file or topic; empty when it can. */
  readonly problems: readonly string[];
  /** Every topic file's sections, by file, for the freshness check's message. */
  readonly facts: ReadonlyMap<string, Fact>;
}

// ---- Canonical JSON and its hash, as the gateway's src/twin/hash.ts computes them ----

/** A value with every object's keys sorted, recursively: the form every hash is taken over. */
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonical(object[key])]),
    );
  }
  return value;
}

export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** SHA-256 of a value's canonical JSON, compact. */
export function canonicalHash(value: unknown): string {
  return sha256Hex(JSON.stringify(canonical(value)));
}

/** The pack as committed: canonical JSON, two-space indented, one LF at the end. */
export function packJson(pack: TwinPack): string {
  return `${JSON.stringify(canonical(pack), null, 2)}\n`;
}

/** What a topic's hash covers: the rules and quotes every turn carries, `00`, the topic's files, its selectables. */
export function topicHashInput(
  pack: Pick<TwinPack, "rules" | "quotes" | "sections" | "selectables">,
  topic: string,
  files: readonly string[],
): unknown {
  return {
    rules: pack.rules,
    quotes: pack.quotes,
    profile: pack.sections.filter((s) => s.file === PROFILE_FILE),
    sections: pack.sections.filter((s) => files.includes(s.file) && s.file !== PROFILE_FILE),
    selectables: pack.selectables.filter((s) => s.topic === topic),
  };
}

/** What the whole pack's hash covers, free talk's: everything but the hashes. */
export function wholeHashInput(pack: Pick<TwinPack, "rules" | "quotes" | "sections" | "selectables">): unknown {
  return { rules: pack.rules, quotes: pack.quotes, sections: pack.sections, selectables: pack.selectables };
}

// ---- Parsing a topic file ----

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();
const stemOf = (file: string): string => file.replace(/^corpus\//, "").replace(/\.md$/, "");

interface RawSection {
  heading: string;
  lines: string[];
}

/** A topic file's title, its lead's lines, and its `##` sections, each with its lines (### headings stay inside). */
function splitFile(text: string): { title: string; lead: string[]; sections: RawSection[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  const lead: string[] = [];
  const sections: RawSection[] = [];
  for (const line of lines) {
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2 && !line.startsWith("###")) {
      sections.push({ heading: collapse(h2[1] ?? ""), lines: [] });
      continue;
    }
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1 && sections.length === 0 && title === "") {
      title = collapse(h1[1] ?? "");
      continue;
    }
    if (sections.length === 0) lead.push(line);
    else sections[sections.length - 1]?.lines.push(line);
  }
  return { title, lead, sections };
}

/** A heading as a plain name: its backticked claim tags taken off. */
const plainHeading = (heading: string): string => collapse(heading.replace(/`\[[^\]`]*\]`/g, ""));

/** The lines of a section, slots filled, blank lines dropped. */
function rendered(lines: readonly string[], facts: ReadonlyMap<string, Fact>): string[] {
  return lines.map((l) => (l.trim() === "" ? "" : fillSlots(l, facts))).filter((l) => l !== "");
}

/** Lines into parts of at most SECTION_MAX_CHARS, broken only before a bullet. A bullet longer than that is a part. */
function splitAtBullets(lines: readonly string[]): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  const size = (ls: readonly string[]): number => ls.join("\n").length;
  for (const line of lines) {
    const bullet = /^\s*(?:[-*]|\d+\.)\s+/.test(line);
    if (bullet && current.length > 0 && size([...current, line]) > SECTION_MAX_CHARS) {
      parts.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) parts.push(current.join("\n"));
  return parts;
}

const GOLDEN_ITEM = /^(\d+)\.\s+(.*)$/;
/** One Golden Q&A item: `N. *Question?* — Answer. [tag][tag]`. */
function goldenOf(n: number, body: string): { question: string; answer: string; tags: string[] } | null {
  const m = /^\*(.+?)\*\s+—\s+(.*)$/.exec(body);
  if (!m) return null;
  let answer = (m[2] ?? "").trim();
  const tags: string[] = [];
  for (;;) {
    const tail = /\s*(\[[^\]]+\])\s*$/.exec(answer);
    if (!tail) break;
    tags.unshift(tail[1] ?? "");
    answer = answer.slice(0, tail.index).trimEnd();
  }
  return n > 0 ? { question: collapse(m[1] ?? ""), answer, tags } : null;
}

const LINK = /\bhttps?:\/\/[^\s)<>"'`]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)<>"'`]*)?/gi;
/** A Public artifacts section's links: its URLs and domain-shaped tokens, trailing punctuation off. */
function linksIn(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    for (const m of line.matchAll(LINK)) {
      const link = m[0].replace(/[.,;:)]+$/, "");
      if (/\.[a-z]{2,}/i.test(link)) out.push(link);
    }
  }
  return out;
}

// ---- The ownership rulings ----

const VERB_LABEL = /\*([A-Za-z][A-Za-z ]*):\*/;

/** `01`'s "Ownership rulings" paragraph, verbatim, from its lead; null when the file has none. */
function rulingsParagraph(lead: readonly string[]): string | null {
  return lead.find((l) => /^\*\*Ownership rulings\b/.test(l.trim()))?.trim() ?? null;
}

/** The rulings paragraph as `{system, verbs}`: each `*Verb:*` label, then its systems, split at commas and semicolons
 *  outside parentheses, with the paragraph's connective clauses ("which ...", "mainly ...", "with ... to help") left
 *  out, "including X" read as X, "the AI systems of X and Y" as X and Y, "with <name> as co-author" giving the system
 *  before it `co-authored`, a possessive "X's goal" read as X where X is a system the paragraph names on its own, and
 *  a leading "the" taken off, but from one common word alone ("the strategy"), which stays whole. */
export function parseRulings(paragraph: string): { entries: Ruling[]; problems: string[] } {
  const problems: string[] = [];
  const parts = paragraph.split(VERB_LABEL);
  const raw: { system: string; verb: string }[] = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const label = (parts[i] ?? "").trim();
    const verb = OWNERSHIP_VERBS.find((v) => v.toLowerCase() === label.toLowerCase());
    if (verb === undefined) {
      problems.push(`${RULINGS_FILE}: the rulings' label "${label}" isn't one of the ownership verbs`);
      continue;
    }
    let body = parts[i + 1] ?? "";
    for (let prev = ""; prev !== body;) {
      prev = body;
      body = body.replace(/\s*\([^()]*\)/g, "");
    }
    let last: { system: string; verb: string } | null = null;
    for (let item of body.split(/[;,]/)) {
      item = collapse(item.replace(/`/g, "")).replace(/\.$/, "");
      if (item === "") continue;
      const coAuthor = /^with .+ as co-author$/i.test(item);
      if (coAuthor && last !== null) {
        raw.push({ system: last.system, verb: "co-authored" });
        continue;
      }
      if (/^(?:which|mainly|with|who)\b/i.test(item)) continue;
      item = item.replace(/^(?:and|including)\s+/i, "");
      // "the strategy" stays whole: one common word alone would match every strategy an answer names (G7).
      if (!/^the\s+[a-z]+$/.test(item)) item = item.replace(/^the\s+/i, "");
      const of = /^(?:AI\s+)?systems?\s+of\s+(.+)$/i.exec(item);
      const systems = of ? (of[1] ?? "").split(/\s+and\s+/) : [item];
      for (const system of systems.map((s) => s.trim()).filter(Boolean)) {
        last = { system, verb };
        raw.push(last);
      }
    }
  }
  // A possessive that names another ruled system ("No-Code CHT Configuration's goal") is that system's ruling.
  const names = new Set(raw.map((r) => r.system.toLowerCase()));
  const keyed = raw.map((r) => {
    const possessive = /^(.+?)['’]s\s+.+$/.exec(r.system);
    const owner = possessive?.[1]?.trim();
    return owner !== undefined && names.has(owner.toLowerCase()) ? { ...r, system: owner } : r;
  });
  const bySystem = new Map<string, { system: string; verbs: Set<string> }>();
  for (const r of keyed) {
    const key = r.system.toLowerCase();
    const entry = bySystem.get(key) ?? { system: r.system, verbs: new Set<string>() };
    entry.verbs.add(r.verb);
    bySystem.set(key, entry);
  }
  const entries = [...bySystem.values()]
    .map((e) => ({ system: e.system, verbs: [...e.verbs].sort() }))
    .sort((a, b) => (a.system < b.system ? -1 : a.system > b.system ? 1 : 0));
  if (entries.length === 0) problems.push(`${RULINGS_FILE}: the ownership rulings name no system`);
  return { entries, problems };
}

// ---- The selectables ----

function selectablesOf(text: string | null, problems: string[]): Selectable[] {
  if (text === null) {
    problems.push(`${TOPICS_PATH} is missing`);
    return [];
  }
  const doc = parseYaml(text) as unknown;
  const list = (doc as { selectables?: unknown } | null)?.selectables;
  if (!Array.isArray(list)) {
    problems.push(`${TOPICS_PATH} has no selectables list`);
    return [];
  }
  const out: Selectable[] = [];
  for (const raw of list) {
    const s = raw as { id?: unknown; topic?: unknown; corpus?: unknown; lead?: unknown } | null;
    if (
      typeof s?.id !== "string" ||
      typeof s.topic !== "string" ||
      !Array.isArray(s.corpus) ||
      !s.corpus.every((f): f is string => typeof f === "string") ||
      (s.lead !== null && typeof s.lead !== "string")
    ) {
      problems.push(`${TOPICS_PATH}: a selectable isn't {id, topic, corpus, lead}`);
      continue;
    }
    out.push({ id: s.id, topic: s.topic, files: [...s.corpus], lead: (s.lead as string | null) ?? null });
  }
  return out;
}

// ---- The build ----

/** The pack from what the reader gives. Problems are returned, never thrown: the CLI and the tests report them. */
export function buildPack(reader: PackReader): PackBuild {
  const problems: string[] = [];
  const facts = new Map<string, Fact>();
  for (const name of reader.list("corpus/facts")) {
    if (!FACTS_FILE.test(name)) continue;
    const text = reader.read(`corpus/facts/${name}`);
    if (text === null) continue;
    for (const fact of factsIn(text, name)) facts.set(fact.id, fact);
  }
  const files = reader
    .list("corpus")
    .filter((name) => TOPIC_FILE.test(name))
    .map((name) => `corpus/${name}`);

  const sections: PackSection[] = [];
  const doNotClaim: { file: string; text: string }[] = [];
  const artifacts = new Set<string>();
  let rulings: { file: string; text: string; entries: Ruling[] } | null = null;
  let promiseText = "";
  let promiseGolden: GoldenItem[] = [];

  for (const file of files) {
    const text = reader.read(file);
    if (text === null) {
      problems.push(`${file} can't be read`);
      continue;
    }
    const stem = stemOf(file);
    const { title, lead, sections: raw } = splitFile(text);
    const paragraph = rulingsParagraph(lead);
    if (file === RULINGS_FILE) {
      if (paragraph === null) problems.push(`${RULINGS_FILE} has no "Ownership rulings" paragraph`);
      else {
        const parsed = parseRulings(paragraph);
        problems.push(...parsed.problems);
        rulings = { file, text: paragraph, entries: parsed.entries };
      }
    }
    // The lead: the title's file's own lines, without its metadata line and without the rulings, which are rules.
    const leadLines = rendered(
      lead.filter((l) => !/^Priority:/.test(l.trim()) && l.trim() !== paragraph),
      facts,
    );
    if (leadLines.length > 0) pushSplit(sections, { stem, file, heading: title, kind: "lead", n: 0, lines: leadLines });
    const golden: GoldenItem[] = [];
    raw.forEach((section, i) => {
      const heading = plainHeading(section.heading);
      const name = heading.toLowerCase();
      const lines = rendered(section.lines, facts);
      if (name === "do not claim") {
        for (const line of lines) {
          const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
          if (bullet) doNotClaim.push({ file, text: (bullet[1] ?? "").trim() });
        }
        return;
      }
      if (name === "golden q&a") {
        for (const line of lines) {
          const item = GOLDEN_ITEM.exec(line.trim());
          if (!item) continue;
          const n = Number(item[1]);
          const parsed = goldenOf(n, (item[2] ?? "").trim());
          if (parsed === null) {
            problems.push(`${file}: Golden Q&A ${n} isn't "*question* — answer [tags]"`);
            continue;
          }
          const entry: GoldenItem = { n, ...parsed };
          golden.push(entry);
          const body = line.trim();
          sections.push({
            id: `${stem}#q${n}`,
            file,
            heading: `Golden Q&A ${n}`,
            kind: "golden",
            text: body,
            chars: body.length,
            golden: entry,
          });
        }
        return;
      }
      if (name === "public artifacts") for (const link of linksIn(lines)) artifacts.add(link);
      if (lines.length > 0) pushSplit(sections, { stem, file, heading, kind: "section", n: i + 1, lines });
    });
    if (file === PROMISE_FILE) {
      promiseText = text;
      promiseGolden = golden;
    }
  }

  const quote = (spans: readonly string[], what: string): QuoteEntry => {
    for (const span of spans) {
      if (!promiseText.includes(span)) problems.push(`${PROMISE_FILE} no longer holds ${what}'s words "${span}"`);
    }
    const item = promiseGolden
      .filter((g) => spans.some((span) => g.answer.includes(span)))
      .sort((a, b) => a.answer.length - b.answer.length)[0];
    if (item === undefined) problems.push(`${PROMISE_FILE} has no Golden Q&A answer with ${what}'s words`);
    return { file: PROMISE_FILE, answer: item?.answer ?? "", spans: [...spans] };
  };
  const quotes = {
    privacy: quote(PRIVACY_SPANS, "the privacy promise"),
    agents_share: quote(AGENTS_SHARE_SPANS, "the agents' share"),
  };

  const selectables = selectablesOf(reader.read(TOPICS_PATH), problems);
  for (const s of selectables) {
    for (const f of s.files)
      if (!files.includes(f)) problems.push(`${TOPICS_PATH}: ${s.id}'s file ${f} isn't a topic file`);
  }
  const rules = {
    do_not_claim: doNotClaim,
    rulings: rulings ?? { file: RULINGS_FILE, text: "", entries: [] },
    ownership_verbs: [...OWNERSHIP_VERBS],
    artifacts: [...artifacts].sort(),
  };
  const body = { rules, quotes, sections, selectables };
  const topicIds = [...new Set(selectables.map((s) => s.topic))].sort();
  const topics: TopicEntry[] = topicIds.map((id) => {
    const topicFiles = [...new Set(selectables.filter((s) => s.topic === id).flatMap((s) => s.files))].sort();
    return { id, files: topicFiles, sha256: canonicalHash(topicHashInput(body, id, topicFiles)) };
  });
  const pack: TwinPack = {
    schema: 1,
    generated_by: GENERATED_BY,
    files,
    sections,
    rules,
    quotes,
    selectables,
    topics,
    sha256: canonicalHash(wholeHashInput(body)),
  };
  return { pack, problems, facts };
}

function pushSplit(
  out: PackSection[],
  s: { stem: string; file: string; heading: string; kind: "lead" | "section"; n: number; lines: string[] },
): void {
  const parts = splitAtBullets(s.lines);
  parts.forEach((text, k) => {
    out.push({
      id: parts.length === 1 ? `${s.stem}#${s.n}` : `${s.stem}#${s.n}.${k + 1}`,
      file: s.file,
      heading: s.heading,
      kind: s.kind,
      text,
      chars: text.length,
      golden: null,
    });
  });
}

/** A file's short name in the prompt: `04-hobbies-and-travel` for `corpus/04-hobbies-and-travel.md`. */
export const shortName = (file: string): string => stemOf(file);

/** A section as the gateway's prompt writes it (services/gateway/src/twin/prompt.ts): its delimiter line, then its
 *  text. The fit check counts the same characters the prompt sends. */
export const renderSection = (s: Pick<PackSection, "file" | "heading" | "text">): string =>
  `[${shortName(s.file)} — ${s.heading}]\n${s.text}\n\n`;

/** The rules as the prompt writes them: each file's "Do not claim" bullets under one line, then the rulings. */
export function renderRules(pack: Pick<TwinPack, "rules">): string {
  const byFile = new Map<string, string[]>();
  for (const r of pack.rules.do_not_claim) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r.text]);
  const blocks = [...byFile].map(
    ([file, bullets]) => `[${shortName(file)}] Do not claim:\n${bullets.map((b) => `- ${b}`).join("\n")}\n\n`,
  );
  return `${blocks.join("")}[${shortName(pack.rules.rulings.file)}] Ownership rulings:\n${pack.rules.rulings.text}\n\n`;
}

/** The instructions' characters for the longer of the two paths: prompt.md without the other path's depth section. */
export function instructionsChars(prompt: string): number {
  const depth = /\n## Depth: [a-z-]+\n\n[^\n]*\n/g;
  const sections = [...prompt.matchAll(depth)].map((m) => m[0].length);
  const shortest = sections.length === 0 ? 0 : Math.min(...sections);
  return prompt.length - shortest;
}

/** What the prompt adds around the grounding and a whole conversation: its headings, and each turn's quoting. */
export const FRAMING_CHARS = 400;
export const PER_TURN_CHARS = 16;

/** The fit check (plan §4, R-1): the rules, `00`, and each topic's files fit the input bound less the instructions, the
 *  framing, and a whole conversation, or the build fails naming the topic. */
export function fitProblems(pack: TwinPack, limits: FitLimits, instructions: number): string[] {
  const conversation = limits.history_max_chars + limits.history_max_turns * PER_TURN_CHARS;
  const room = limits.max_input_chars - instructions - FRAMING_CHARS - conversation;
  const cost = (sections: readonly PackSection[]): number => sections.reduce((n, s) => n + renderSection(s).length, 0);
  const base = renderRules(pack).length + cost(pack.sections.filter((s) => s.file === PROFILE_FILE));
  const out: string[] = [];
  for (const topic of pack.topics) {
    const own = cost(pack.sections.filter((s) => topic.files.includes(s.file) && s.file !== PROFILE_FILE));
    if (base + own > room) {
      out.push(
        `the topic ${topic.id} needs ${base + own} characters of grounding, past the ${room} the input bound leaves (R-1)`,
      );
    }
  }
  return out;
}

/** The corpus files whose sections differ between two packs: the freshness check's message (FR-007). */
export function movedFiles(committed: unknown, fresh: TwinPack): string[] {
  const sectionsOf = (p: unknown): { file: string }[] => {
    const list = (p as { sections?: unknown } | null)?.sections;
    return Array.isArray(list) ? (list as { file: string }[]) : [];
  };
  const byFile = (list: { file: string }[]): Map<string, string> => {
    const out = new Map<string, string>();
    for (const s of list) out.set(s.file, `${out.get(s.file) ?? ""}${JSON.stringify(canonical(s))}`);
    return out;
  };
  const a = byFile(sectionsOf(committed));
  const b = byFile(sectionsOf(fresh));
  return [...new Set([...a.keys(), ...b.keys()])].filter((f) => a.get(f) !== b.get(f)).sort();
}

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The CLI: builds the pack from the repository and writes it; exits 1 with every problem when it can't. */
export function main(root: string = REPO_ROOT): number {
  const built = buildPack(fsReader(root));
  const { pack } = built;
  const read = (path: string): string | null =>
    existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null;
  const limits = fitLimits(read(BUDGETS_PATH));
  const problems = [...built.problems, ...fitProblems(pack, limits, instructionsChars(read(PROMPT_PATH) ?? ""))];
  if (problems.length > 0) {
    for (const p of problems) process.stderr.write(`twin:pack: ${p}\n`);
    return 1;
  }
  const out = join(root, PACK_PATH);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, packJson(pack));
  process.stdout.write(
    `twin:pack: wrote ${PACK_PATH}: ${pack.sections.length} sections, ${pack.topics.length} topics\n`,
  );
  return 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
