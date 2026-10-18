// Narration's checks, its place in room-data.json, and its eval cases (spec 002, T052; FR-011, FR-012, FR-014 to
// FR-016; contracts/narration.md §1 to §3; data-model.md §3 and §5; research.md R-07).
//
//   N1  each script's citations and words pass the resume's C1–C8 (build/content.ts's checkSource), held to its item's
//       ownership verb: a script makes its item's claim, so it cites a sentence that says the verb, under a tag
//       sufficient for a role claim
//   N2  every item in resume.yaml has a script on each path, and no script names an item the resume doesn't have
//   N3  no forbidden phrase in the words: C9's list (the corpus's "Do not claim" key phrases, the surname rule, and the
//       private denylist when the checkout can read it), reported by source line, a private phrase never by its words
//   N4  at most 900 characters of words, as the file writes them
//   N5  one eval case per script, evals/narration/cases/narration-<item-id>-<path>.yaml: the words as the room shows
//       them, one key phrase per citation (the longest run of whole words the quote and the words share, which must
//       hold at least 12 characters), and the corpus's public "Do not claim" phrases only
//
// Each problem is `narration/<item-id>.<path>.md: <reason>`, at each script's first. The build fails on any; make test
// runs them on the committed scripts (test/content/narration.test.ts), with the lock and the eval cases, which
// `npm run content:lock -w apps/web` rewrites and make test fails when stale. The eval cases are their own suite,
// `narration`, which make evals runs on the fake adapter, and evals/run.py refuses with any other.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import type { RoomResumeSection } from "../src/resume/data";
import { NARRATION_PATHS, type NarrationPath } from "../src/narration/data";
import { publication, readPolicy, type RoomData, type RoomDataContext } from "./approvals";
import {
  checkLock,
  checkSource,
  computeLock,
  ContentError,
  DENYLIST_PATH,
  fillSlots,
  forbiddenList,
  LOCK_PATH,
  parseResume,
  readFacts,
  readLock,
  REPO_ROOT,
  RESUME_PATH,
  slotRefs,
  SURNAME_RULE,
  writeLock,
  type CheckOptions,
  type Fact,
  type Item,
  type ResumeSource,
} from "./content";
import { NARRATION_DIR, readScripts, type Script } from "./narration-source";
import { DEFAULT_POLICY_DIR } from "./policy";

export const MAX_CHARS = 900;
export const CASES_DIR = "evals/narration/cases";
/** C2's minimum for a quote, and N5's for a key phrase. */
const MIN_KEY_PHRASE = 12;
const LOCK_HINT = "run npm run content:lock -w apps/web";

type DenylistState = ReturnType<typeof checkSource>["denylist"];

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

/** How a problem names a script: its path under apps/web/content/. */
export const label = (file: string): string => posix.relative("apps/web/content", file);

// ---- N5's key phrases ----

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

interface Token {
  word: string;
  start: number;
  end: number;
}

function tokens(text: string): Token[] {
  return [...text.matchAll(WORD)].map((m) => ({
    word: m[0].toLowerCase().replace(/’/g, "'"),
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/** The longest run of whole words a citation's quote and a script's words share, compared lowercase, as the words
 * write it; the earliest of equal length; null when it holds fewer than 12 characters. */
export function keyPhrase(quote: string, words: string): string | null {
  const q = tokens(quote).map((t) => t.word);
  const w = tokens(words);
  let best: { from: number; to: number } | null = null;
  let prev = new Array<number>(w.length + 1).fill(0);
  for (let i = 1; i <= q.length; i++) {
    const row = new Array<number>(w.length + 1).fill(0);
    for (let j = 1; j <= w.length; j++) {
      if (q[i - 1] !== w[j - 1]?.word) continue;
      const run = (prev[j - 1] ?? 0) + 1;
      row[j] = run;
      const from = (w[j - run] as Token).start;
      const to = (w[j - 1] as Token).end;
      if (!best || to - from > best.to - best.from || (to - from === best.to - best.from && from < best.from)) {
        best = { from, to };
      }
    }
    prev = row;
  }
  return best && best.to - best.from >= MIN_KEY_PHRASE ? words.slice(best.from, best.to) : null;
}

// ---- N1–N5 ----

/** N1–N5 over every script: `narration/<item-id>.<path>.md: <reason>` for each that has a problem, at its first, after
 * N2's for scripts that are missing. A malformed slot reference is refused as a ContentError. */
export function checkNarration(
  source: ResumeSource | null,
  scripts: readonly Script[],
  options: CheckOptions,
): { problems: string[]; denylist: DenylistState } {
  const items = new Map<string, Item>(source?.sections.flatMap((s) => s.items.map((i) => [i.id, i] as const)) ?? []);
  const problems: string[] = [];

  // N2: one script per item and path.
  for (const id of items.keys()) {
    for (const path of NARRATION_PATHS) {
      if (!scripts.some((s) => s.item === id && s.path === path)) {
        problems.push(`narration/${id}.${path}.md: missing (each item needs a script for each path)`);
      }
    }
  }
  const known = scripts.filter((s) => items.has(s.item));
  for (const s of scripts) {
    if (!items.has(s.item)) problems.push(`${label(s.file)}: names an item the resume doesn't have`);
  }

  // The words' slot references, as the resume's items are held to theirs.
  for (const s of known) {
    for (const id of slotRefs(s.file, "the words", s.body)) {
      if (!s.slots.includes(id)) throw new ContentError(`${s.file}: slots doesn't list ${id}, which the words use`);
    }
  }

  // N1 and N3: the resume's C1–C9, each script an item with its item's verb.
  const roomName = source?.header.room.name ?? "";
  const asItems: Item[] = known.map((s) => {
    const verb = items.get(s.item)?.verb;
    const item: Item = { id: label(s.file), text: s.body, claims: s.claims, slots: s.slots };
    if (verb !== undefined) item.verb = verb;
    return item;
  });
  const checked = checkSource(
    {
      version: 1,
      header: { room: { name: roomName, lines: [] } },
      sections: [{ id: "n", title: "n", items: asItems }],
    },
    options,
  );
  const first = new Map<string, string>();
  for (const p of checked.problems) {
    const at = p.slice(0, p.indexOf(": "));
    if (!at.startsWith("header.") && !first.has(at)) first.set(at, p);
  }

  const facts = readFacts(options.root);
  for (const s of known) {
    const at = label(s.file);
    if (collapse(s.body).length > MAX_CHARS) {
      problems.push(`${at}: over ${MAX_CHARS} characters`);
      continue;
    }
    const found = first.get(at);
    if (found) {
      problems.push(found);
      continue;
    }
    const words = fillSlots(s.body, facts);
    const unused = s.claims.findIndex((c) => keyPhrase(c.quote, words) === null);
    if (unused !== -1) {
      problems.push(`${at}: claims[${unused}] shares no phrase of ${MIN_KEY_PHRASE} characters or more with the words`);
    }
  }
  return { problems, denylist: checked.denylist };
}

// ---- N5: the eval cases ----

/** A YAML string as Prettier writes one: double-quoted, unless it holds more double quotes than single ones. */
function yamlString(s: string): string {
  const doubles = (s.match(/"/g) ?? []).length;
  const singles = (s.match(/'/g) ?? []).length;
  return doubles > singles ? `'${s.replace(/'/g, "''")}'` : JSON.stringify(s);
}

/** The corpus's public "Do not claim" key phrases, deduplicated, in the corpus's order. The surname rule and the
 * private denylist are never asked for, and dropped by their source if they came anyway. */
export function publicPhrases(root: string, roomName: string): string[] {
  const { list } = forbiddenList({
    root,
    roomName,
    fullName: null,
    denylist: join(root, "corpus", "intake", "private", ".none", "denylist.txt"),
  });
  const phrases = list
    .filter((f) => f.source !== SURNAME_RULE && !f.source.startsWith(DENYLIST_PATH) && f.source.startsWith("corpus/"))
    .map((f) => f.phrase);
  return [...new Set(phrases)];
}

/** One case per script, by its path from the repository's root: what make evals runs as the narration suite. */
export function narrationCases(root: string, source: ResumeSource, scripts: readonly Script[]): Map<string, string> {
  const facts: ReadonlyMap<string, Fact> = readFacts(root);
  const forbidden = publicPhrases(root, source.header.room.name);
  const cases = new Map<string, string>();
  for (const s of scripts) {
    const id = `narration-${s.item}-${s.path}`;
    const words = fillSlots(s.body, facts);
    const contains = s.claims.map((c) => keyPhrase(c.quote, words) ?? collapse(c.quote));
    const lines = [
      `# Generated from ${s.file}`,
      "# by apps/web/build/narration.ts (spec 002, contracts/narration.md §2, N5). Don't edit it: `npm run content:lock",
      "# -w apps/web` rewrites it, and make test fails when it's stale. The narration suite runs on the fake adapter only.",
      '# expect.not_contains holds the corpus\'s public "Do not claim" phrases, never a private one or the surname.',
      `id: ${id}`,
      `description: ${yamlString(`The room's narration of the resume item ${s.item} on the ${s.path} path, as the visitor reads it.`)}`,
      `prompt: ${yamlString(`Narrate the resume item ${s.item} for a visitor on the ${s.path} path.`)}`,
      `fake_response: ${yamlString(words)}`,
      "expect:",
      "  contains:",
      ...contains.map((p) => `    - ${yamlString(p)}`),
      ...(forbidden.length ? ["  not_contains:", ...forbidden.map((p) => `    - ${yamlString(p)}`)] : []),
    ];
    cases.set(posix.join(CASES_DIR, `${id}.yaml`), `${lines.join("\n")}\n`);
  }
  return cases;
}

const CASE_NAME = /^narration-.*\.yaml$/;

/** Writes the cases, and removes any case file of the suite no script makes any more. */
export function writeCases(root: string, cases: ReadonlyMap<string, string>): void {
  const dir = join(root, CASES_DIR);
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    if (CASE_NAME.test(name) && !cases.has(posix.join(CASES_DIR, name))) rmSync(join(dir, name));
  }
  for (const [path, text] of cases) writeFileSync(join(root, path), text);
}

/** The committed cases' problems: one that differs from what the scripts make, is missing, or no script makes. */
export function checkCases(root: string, cases: ReadonlyMap<string, string>): string[] {
  const dir = join(root, CASES_DIR);
  const problems: string[] = [];
  for (const [path, text] of cases) {
    const full = join(root, path);
    if (!existsSync(full)) problems.push(`eval case missing: ${path}`);
    else if (readFileSync(full, "utf8") !== text) problems.push(`eval case stale: ${path}`);
  }
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const path = posix.join(CASES_DIR, name);
    if (CASE_NAME.test(name) && !cases.has(path)) problems.push(`eval case for no script: ${path}`);
  }
  return problems;
}

// ---- What the build publishes (contracts/narration.md §3; data-model.md §5) ----

/** room-data.json's narration: under each published item, per path, the script's words with its slots filled when
 * the script is published (approved, or a draft in a drafts build, marked approved: false), else null. The checks run
 * on every build, published or withheld. A script whose item isn't published isn't either, so `published` drops it. */
export function narrationPart(data: RoomData, context: RoomDataContext): RoomData {
  const scripts = readScripts(context.root);
  const resume = join(context.root, RESUME_PATH);
  const source = existsSync(resume) ? parseResume(readFileSync(resume, "utf8")) : null;
  if (!source && scripts.length === 0) return data;
  const { problems, denylist } = checkNarration(source, scripts, {
    root: context.root,
    fullName: context.policy.header?.full_name ?? null,
  });
  if (problems.length > 0) {
    throw new ContentError(
      `${NARRATION_DIR}: the narration checks failed (contracts/narration.md §2):\n${problems.join("\n")}`,
    );
  }
  context.info?.(
    `narration: N1–N5 passed for ${scripts.length} scripts; ${denylist === "applied" ? "the private denylist was applied" : `the private denylist is ${denylist} here, so N3 checked the public list only`}`,
  );

  const facts = readFacts(context.root);
  const byItem = new Map<string, Partial<Record<NarrationPath, Record<string, unknown>>>>();
  for (const s of scripts) {
    const file = context.files.find((f) => f.path === s.file);
    if (!file || !publication(file.state, context.drafts).publish) continue;
    const entry = {
      words: fillSlots(s.body, facts),
      approved: file.state === "approved",
      source: s.file,
      sha256: file.sha256,
    };
    byItem.set(s.item, { ...byItem.get(s.item), [s.path]: entry });
  }

  const shown = new Set<string>();
  const sections = ((data.sections ?? []) as RoomResumeSection[]).map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const set = byItem.get(item.id) ?? {};
      const narration = Object.fromEntries(NARRATION_PATHS.map((p) => [p, set[p] ?? null]));
      for (const e of Object.values(set)) shown.add(String(e.source));
      return { ...item, narration };
    }),
  }));
  const scriptFiles = new Set(scripts.map((s) => s.file));
  return {
    ...data,
    published: data.published.filter((p) => !scriptFiles.has(p.path) || shown.has(p.path)),
    sections,
  };
}

// ---- `npm run content:check -w apps/web` and `npm run content:lock -w apps/web` ----

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const source = parseResume(readFileSync(join(REPO_ROOT, RESUME_PATH), "utf8"));
  const scripts = readScripts(REPO_ROOT);
  const fullName = readPolicy(process.env.ROOM_POLICY_DIR || DEFAULT_POLICY_DIR).header?.full_name ?? null;
  const resume = checkSource(source, { root: REPO_ROOT, fullName });
  const narration = checkNarration(source, scripts, { root: REPO_ROOT, fullName });
  const problems = [...resume.problems, ...narration.problems];
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`content: ${problems.length} problem(s); the lock and the eval cases are unchanged`);
    process.exit(1);
  }
  const passed = `C1–C9 and N1–N5 passed for the resume and ${scripts.length} scripts (denylist ${narration.denylist})`;
  const cases = narrationCases(REPO_ROOT, source, scripts);
  if (process.argv.includes("--lock")) {
    writeLock(REPO_ROOT, computeLock(REPO_ROOT, source));
    writeCases(REPO_ROOT, cases);
    console.log(`content: ${passed}; wrote ${LOCK_PATH} and ${cases.size} eval cases in ${CASES_DIR}`);
  } else {
    const lock = readLock(REPO_ROOT);
    const stale = [
      ...(lock ? checkLock(REPO_ROOT, source, lock) : [`no lock at ${LOCK_PATH}`]),
      ...checkCases(REPO_ROOT, cases),
    ];
    for (const problem of stale) console.error(problem);
    console.log(
      `content: ${passed}; the lock and the eval cases are ${stale.length ? `stale (${LOCK_HINT})` : "current"}`,
    );
    process.exit(stale.length ? 1 : 0);
  }
}
