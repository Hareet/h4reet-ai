// RT, words (spec 004; FR-009, FR-029 to FR-035, FR-052; R-15, R-21, R-38; contracts/room-data-files.md §7 to §10,
// §13.5, §14, §15): what the room shows as words, held to spec 002's line check (build/content.ts's `checkLine`,
// `bareNumber`, and `forbiddenHit`, the corpus, its facts, and the private denylist read through the compositor's tree)
// and to the room's own rules:
// - RT1, a region's text naming a block of another renderer, or what its renderer can't draw (its sources are the
//   loader's, schema.ts);
// - RT2, C9 over every string of every data file as written, IDs and names, map keys among them, included, each key
//   and ID- or name-shaped string read again with `-` and `.` as spaces: the walk compose() runs after RD and before
//   every other family, whose refused strings no later path or reason prints;
// - RT3, C6, a UI word's {time}, {amount}, and {name} its slots; RT4 and RT5, C1 to C5 and C8 on claims, pending lines
//   apart; RT6, the monitor's scripts: paths, user@host, email and IP addresses, URLs other than the site's, amounts,
//   secret-shaped tokens, and typing over the screens' limit (compose/layout.ts);
// - RT7, the chalkboard's excludes (a chalk block without one is the loader's); RT8, words over their grid
//   (compose/layout.ts), a turn-cost counter's readings among them (contracts/turn-cost.md §5), the section titles' fit
//   in strict mode only; RT9, the Author's words, verbatim, in strict mode only; RT10, the looks' typefaces
//   (typefaces.ts); RT11, the tier's sentences; RT12, the closed list's keys and slots
//   (src/room/ui-keys.ts); RT13, an outline's strings and, in strict mode only, its words in its intent's quotation
//   marks (its keys, cap height, and path data are the loader's).
// The room's name, which C8 and C9's key phrases read as spec 002 reads them, is the resume source's, through the
// tree. A reference that doesn't resolve is RI4's, and a file the loader refused meets none of these. A reason holds
// keys, indices, measured numbers, and the rules' own words, never a value from the data.
import {
  bareNumber,
  checkLine,
  DENYLIST_PATH,
  forbiddenHit,
  parseResume,
  RESUME_PATH,
  treeLineContext,
} from "../../content";
import type { Claim, CorpusFile, LineContext, ResumeSource } from "../../content";
import {
  regionBox,
  textGrid,
  TYPING_CHARS_PER_S,
  TYPING_LIMIT_S,
  typingSeconds,
} from "../../../src/room/compose/layout";
import type { Grid } from "../../../src/room/compose/layout";
import { typefaceFor } from "../../../src/room/compose/legibility";
import type { TypefaceUse } from "../../../src/room/compose/vocabulary";
import { nameProblem } from "../../../src/room/glb/names";
import { SLOTS, slotsIn, UI_KEYS } from "../../../src/room/ui-keys";
import { readJson, readYaml } from "../load";
import type { Loaded, LoadedRoom } from "../load";
import { CORPUS_FILE } from "../schema";
import type { Outline, Placement, Region, RoomTextBlock, UiWord } from "../schema";
import { readFaces } from "../typefaces";
import type { Faces } from "../typefaces";
import { formatPath } from "./family";
import type { Context, Family } from "./family";
import { sourceOf as regionSource } from "./rg";

type Step = string | number;

/** The site's host: a URL on it, or on a host under it, is the one URL a script may show (FR-031). */
export const SITE_HOST = "h4reet.ai";

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
/** C2's whitespace: runs collapsed to one space, the ends trimmed. */
const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- What the family reads besides the loaded room ----

/** The resume source, and spec 002's line context read through the tree. */
interface Words {
  /** The resume source, or null when it's absent or isn't the source's shape: its room's name is C8's and C9's name for
   *  the Author, as checkSource takes it, and its section titles fill a resume_titles region. */
  readonly resume: ResumeSource | null;
  readonly line: LineContext;
}

const WORDS = new WeakMap<Context, Words>();

/** The context's words, read once: RT2's walk and the family share them. */
function words(ctx: Context): Words {
  let found = WORDS.get(ctx);
  if (!found) {
    const resume = readResume(ctx);
    found = { resume, line: treeLineContext(ctx.tree, resume?.header.room.name ?? "", ctx.policy.full_name) };
    WORDS.set(ctx, found);
  }
  return found;
}

function readResume(ctx: Context): ResumeSource | null {
  const bytes = ctx.tree.read(RESUME_PATH);
  if (bytes === null) return null;
  try {
    return parseResume(decode(bytes));
  } catch {
    return null;
  }
}

// ---- RT2: C9 over every string ----

/** Every file the loader read and kept. */
function loadedFiles(room: LoadedRoom): Loaded<unknown>[] {
  const files: (Loaded<unknown> | null)[] = [room.scene, room.topics, room.ui, room.lookdev];
  files.push(...room.catalog, ...room.looks, ...room.fixtures, ...room.blocks, ...room.outlines);
  return files.filter((f) => f !== null);
}

/** A loaded file's value as written, without the schema's defaults, read again through the tree. */
function asWritten(ctx: Context, loaded: Loaded<unknown>): unknown {
  const bytes = ctx.tree.read(loaded.file);
  const read = bytes === null ? null : loaded.file.endsWith(".json") ? readJson(bytes) : readYaml(bytes);
  return read?.ok ? read.value : loaded.value;
}

/** Each string of a value, a map's keys among them, with its steps from the file's top and whether it is a key. */
function eachString(value: unknown, at: Step[], visit: (text: string, at: Step[], key: boolean) => void): void {
  if (typeof value === "string") visit(value, at, false);
  else if (Array.isArray(value)) value.forEach((v, i) => eachString(v, [...at, i], visit));
  else if (value !== null && typeof value === "object")
    for (const [key, v] of Object.entries(value)) {
      visit(key, [...at, key], true);
      eachString(v, [...at, key], visit);
    }
}

/** A string in the shape of an ID or a name (contracts/room-data-files.md §3.1, §3.2), a role, or a UI key: lowercase
 *  letters and digits, the words joined by `-` or `.`. */
const NAME_SHAPED = /^[a-z0-9][a-z0-9.-]*$/;

/** C9's hit in a string, or in its words where it is a map key or shaped as an ID or a name: `-` and `.` read as
 *  spaces, so the surname rule's whole word and a phrase's words are found inside `<surname>-desk` as in prose. Spec
 *  002's matcher is the one used, unchanged: only the string it reads is spelled out. */
function hitIn(text: string, key: boolean, forbidden: LineContext["forbidden"]): ReturnType<typeof forbiddenHit> {
  const hit = forbiddenHit(text, forbidden);
  return hit ?? (key || NAME_SHAPED.test(text) ? forbiddenHit(text.replace(/[-.]/g, " "), forbidden) : null);
}

/** A C9 source as §14 prints it: a corpus file's line, the surname rule, or the private denylist, never its line. */
const sourceOf = (source: string): string => (source.startsWith(`${DENYLIST_PATH}:`) ? "the private denylist" : source);

/**
 * RT2, spec 002's C9 over every string value of every loaded file as written, IDs and names (map keys among them)
 * included, a key or an ID- or name-shaped string read a second time with `-` and `.` as spaces (`hitIn`): a "Do not
 * claim" key phrase of the corpus, the surname rule (`ctx.policy.full_name`), or a private-denylist phrase where the
 * tree holds the denylist. compose() runs it after RD and before every other family; it reports each hit, its reason
 * ending `(from <source>)`, and gives back the strings it refused, which no later reason or path may print
 * (`ctx.printable`); nor do its own paths.
 */
export const walkStrings: (ctx: Context) => ReadonlySet<string> = (ctx) => {
  const { forbidden } = words(ctx).line;
  const refused = new Set<string>();
  if (forbidden.length === 0) return refused;
  const hits: { file: string; at: Step[]; source: string }[] = [];
  for (const loaded of loadedFiles(ctx.room))
    eachString(asWritten(ctx, loaded), [], (text, at, key) => {
      const hit = hitIn(text, key, forbidden);
      if (hit === null) return;
      refused.add(text);
      hits.push({ file: loaded.file, at, source: hit.source });
    });
  const printable = (key: string): boolean => !refused.has(key) && ctx.printable(key);
  for (const { file, at, source } of hits)
    ctx.report("RT2", file, formatPath(at, printable), `forbidden phrase (from ${sourceOf(source)})`);
  return refused;
};

// ---- The regions the scene binds ----

interface Bound {
  readonly placement: Placement;
  readonly role: string;
  readonly region: Region;
  /** `placements[i].faces.<role>.regions[j]`'s steps. */
  readonly at: readonly Step[];
}

function boundRegions(ctx: Context): Bound[] {
  const out: Bound[] = [];
  ctx.room.scene?.value.placements.forEach((placement, i) => {
    for (const [role, binding] of Object.entries(placement.faces ?? {}))
      binding.regions.forEach((region, j) =>
        out.push({ placement, role, region, at: ["placements", i, "faces", role, "regions", j] }),
      );
  });
  return out;
}

/** RT1: `text` naming a block of another renderer than its region's, a block on a sign region, or an outline on a
 *  region that isn't a sign's. */
function sources(ctx: Context): void {
  const scene = ctx.room.scene;
  if (!scene) return;
  const blocks = new Map(ctx.room.blocks.map((b) => [b.value.block, b.value.renderer] as const));
  const outlines = new Set(ctx.room.outlines.map((o) => o.value.sign));
  for (const { region, at } of boundRegions(ctx)) {
    const name = region.text;
    if (name === undefined) continue;
    const rt1 = (reason: string): void => ctx.report("RT1", scene.file, ctx.path(...at, "text"), reason);
    const block = blocks.get(name);
    if (region.renderer === "sign") {
      if (block !== undefined && !outlines.has(name))
        rt1("names a room-text block, where a sign region draws only an outline");
    } else if (block === undefined) {
      if (outlines.has(name)) rt1("names an outline, which only a sign region draws");
    } else if (block !== region.renderer) {
      rt1(`names a ${block} block, which a ${region.renderer} region doesn't draw`);
    }
  }
}

// ---- RT3 to RT5: C6, C1 to C5, and C8 ----

/** A UI word's shown text, and its path's steps. */
function uiText(word: UiWord, key: string): { text: string; at: Step[] } {
  return typeof word === "string"
    ? { text: word, at: ["words", key] }
    : { text: word.text, at: ["words", key, "text"] };
}

/** A UI word's slots, the live values it shows: {time}, {amount}, and {name} (src/room/ui-keys.ts). */
const UI_SLOT = new RegExp(`\\{(?:${SLOTS.join("|")})\\}`, "g");
/** A slot room text never holds: spec 002's `{{slot:…}}`, or a UI word's. */
const TEXT_SLOT = new RegExp(`\\{\\{|\\{(?:${SLOTS.join("|")})\\}`);

/** RT3, spec 002's C6: a digit outside a slot in a UI word, its slots a UI word's; any slot in a room-text line; any
 *  digit (bareNumber's, the line holding no slot) in a line about the Author. */
function numbers(ctx: Context): void {
  const ui = ctx.room.ui;
  if (ui)
    for (const [key, word] of Object.entries(ui.value.words)) {
      const { text, at } = uiText(word, key);
      if (/\d/.test(text.replace(UI_SLOT, "")))
        ctx.report("RT3", ui.file, ctx.path(...at), "a digit outside a slot ({time}, {amount}, or {name})");
    }
  for (const b of ctx.room.blocks)
    b.value.lines.forEach((line, i) => {
      const at = ctx.path("lines", i, "text");
      if (TEXT_SLOT.test(line.text)) ctx.report("RT3", b.file, at, "a slot, which room text never holds");
      else if (line.about_author && bareNumber(line.text))
        ctx.report("RT3", b.file, at, "a digit in a line about the Author");
    });
}

/** checkLine's reasons for C1 to C5, a citation's (RT4), and for C8, a line's own words (RT5). C6, C7, and C9 are RT3's
 *  and RT2's. */
const CITATION = new Set([
  "not a corpus file",
  "quote not found",
  "untagged sentence",
  "tag not sufficient",
  "do-not-claim section",
]);
const OWNERSHIP = new Set(["ownership verb not cited", "passive made active"]);

/** A line of words with claims: a room-text line, or a UI word about the Author. */
interface Said {
  readonly file: string;
  readonly at: readonly Step[];
  readonly text: string;
  readonly about: boolean;
  readonly claims: readonly Claim[];
  readonly pending: boolean;
}

function said(ctx: Context): Said[] {
  const out: Said[] = [];
  for (const b of ctx.room.blocks)
    b.value.lines.forEach((line, i) =>
      out.push({
        file: b.file,
        at: ["lines", i],
        text: line.text,
        about: line.about_author,
        claims: line.claims ?? [],
        pending: line.pending,
      }),
    );
  const ui = ctx.room.ui;
  if (ui)
    for (const [key, word] of Object.entries(ui.value.words))
      if (typeof word !== "string")
        out.push({
          file: ui.file,
          at: ["words", key],
          text: word.text,
          about: true,
          claims: word.claims ?? [],
          pending: false,
        });
  return out;
}

/** RT4, spec 002's C1 to C5 on each claim, at the claim; RT5, a line or UI word about the Author without claims, or,
 *  its claims sound, failing C8. A pending line's claims wait for its corpus words. */
function citations(ctx: Context, line: LineContext): void {
  for (const s of said(ctx)) {
    if (s.pending) continue;
    let cited = true;
    s.claims.forEach((claim, k) => {
      const reason = checkLine({ text: s.text, claims: [claim], slots: [] }, undefined, line);
      if (reason === null || !CITATION.has(reason)) return;
      cited = false;
      ctx.report("RT4", s.file, ctx.path(...s.at, "claims", k), reason);
    });
    if (!s.about) continue;
    if (s.claims.length === 0)
      ctx.report("RT5", s.file, ctx.path(...s.at, "claims"), "about the Author, without claims");
    else if (cited) {
      const reason = checkLine({ text: s.text, claims: [...s.claims], slots: [] }, undefined, line);
      if (reason !== null && OWNERSHIP.has(reason)) ctx.report("RT5", s.file, ctx.path(...s.at, "text"), reason);
    }
  }
}

// ---- RT6: the monitor's scripts ----

const HEX4 = "[0-9a-f]{1,4}";
const HEX_GROUPS = `${HEX4}(?::${HEX4})*`;

/** The token prefixes the repository's gitleaks rules name (.gitleaks.toml): its own, sk-lf- and h4op_, and its
 *  default rules' best known, AWS's, GitHub's, GitLab's, Slack's, Google's, and Anthropic's. */
const SECRET_PREFIXES = [
  "sk-lf-",
  "h4op_",
  "AKIA",
  "ASIA",
  "gh[pousr]_",
  "github_pat_",
  "glpat-",
  "xox[abprs]-",
  "AIza",
  "sk-ant-",
];

/** What a script may not show (FR-031), each with its kind, in the order a line is reported by. */
const SCRIPT_RULES: readonly (readonly [RegExp, string])[] = [
  // A run of 32 or more of a token's characters, or a token opening with a prefix gitleaks names.
  [/[A-Za-z0-9+_-]{32,}/, "a secret-shaped token"],
  [new RegExp(`(?<![A-Za-z0-9+_-])(?:${SECRET_PREFIXES.join("|")})[A-Za-z0-9+_-]`), "a secret-shaped token"],
  // A home path (~/, ~user/, $HOME), an absolute one of two segments or more (so /help stays a command), a drive's or
  // a share's, or one from the working folder (./, ../).
  [/(?<![\w~])~[\w.-]*\/|\$(?:HOME\b|\{HOME\})|%(?:USERPROFILE|HOMEPATH)%/, "a local, absolute, or home path"],
  [
    /(?<![\w.~:/@-])\/[\w.-]+\/|(?<!\w)[A-Za-z]:[\\/]|\\\\[\w.-]+\\|(?<![\w.])\.\.?\//,
    "a local, absolute, or home path",
  ],
  [/(?<![\w.%+-])[\w.%+-]+@[\w-]+(?:\.[\w-]+)*/, "user@host or an email address"],
  [/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?!\.?\d)/, "an IP address"],
  [
    new RegExp(
      `(?<![\\w:.])(?:${HEX4}(?::${HEX4}){7}|(?:${HEX_GROUPS})?::${HEX_GROUPS}|${HEX_GROUPS}::)(?![\\w:.])`,
      "i",
    ),
    "an IP address",
  ],
];

/** A URL's host: after a scheme, `www.`, or a domain with a path. */
const URLS = [
  /\b[a-z][a-z0-9+.-]{0,31}:\/\/(?:[^\s/?#@]{0,256}@)?([^\s/?#:@]{0,256})/gi,
  /(?<![\w.-])(www\.[\w.-]+)/gi,
  /(?<![\w.@/-])((?:[a-z0-9-]+\.)+[a-z]{2,})(?=\/)/gi,
];

/** A currency sign or word beside a number. */
const CURRENCY = "usd|eur|gbp|jpy|cad|aud|inr|dollars?|cents?|euros?|pounds?|bucks";
const AMOUNT = new RegExp(
  `[$€£¥₹¢₩₽]\\s?\\d|\\d\\s?[$€£¥₹¢₩₽]|\\d\\s?(?:${CURRENCY})\\b|\\b(?:${CURRENCY})\\s?\\d`,
  "i",
);

const onSite = (host: string): boolean => {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === SITE_HOST || h.endsWith(`.${SITE_HOST}`);
};

/** What a monitor's script line holds that FR-031 keeps off the screen, by kind, or null. */
export function scriptProblem(text: string): string | null {
  for (const [rule, kind] of SCRIPT_RULES) if (rule.test(text)) return kind;
  for (const url of URLS)
    for (const m of text.matchAll(url)) if (!onSite(m[1] ?? "")) return "a URL other than the site's";
  return AMOUNT.test(text) ? "an amount" : null;
}

/** RT6: each line of a terminal or desktop-session block holding what scriptProblem finds, and a block its renderer
 *  would type for longer than the screens' limit. */
function scripts(ctx: Context): void {
  for (const b of ctx.room.blocks) {
    if (b.value.renderer !== "terminal" && b.value.renderer !== "desktop-session") continue;
    b.value.lines.forEach((line, i) => {
      const kind = scriptProblem(line.text);
      if (kind !== null) ctx.report("RT6", b.file, ctx.path("lines", i, "text"), `holds ${kind}`);
    });
    const seconds = typingSeconds(b.value.lines.filter((line) => !line.pending).map((line) => line.text));
    if (seconds > TYPING_LIMIT_S)
      ctx.report(
        "RT6",
        b.file,
        "lines",
        `${seconds.toFixed(1)} s to type at ${TYPING_CHARS_PER_S} characters a second, over ${TYPING_LIMIT_S} s`,
      );
  }
}

// ---- RT7: the chalkboard's excludes ----

/** The characters a chalk line may share with a corpus sentence holding an excluded phrase. */
const SPAN = 24;

/** A phrase as whole words, in any case, its spaces any whitespace; null for one with no words. */
function wholeWords(phrase: string): RegExp | null {
  const parts = phrase.trim().split(/\s+/).filter(Boolean);
  return parts.length === 0
    ? null
    : new RegExp(`(?<![\\p{L}\\p{N}])${parts.map(escape).join("\\s+")}(?![\\p{L}\\p{N}])`, "iu");
}

/** Whether two texts share a span of SPAN characters, compared in lowercase with whitespace collapsed. */
function sharesSpan(a: string, b: string): boolean {
  const [x, y] = [collapse(a).toLowerCase(), collapse(b).toLowerCase()];
  for (let i = 0; i + SPAN <= x.length; i++) if (y.includes(x.slice(i, i + SPAN))) return true;
  return false;
}

/** Every topic file of the corpus the tree holds, as the check reads it. */
function corpusFiles(ctx: Context, line: LineContext): CorpusFile[] {
  return ctx.tree.list("corpus").flatMap((name) => {
    const rel = `corpus/${name}`;
    const file = CORPUS_FILE.test(rel) ? line.corpusFile(rel) : null;
    return file ? [file] : [];
  });
}

/** RT7: a chalk line holding one of its block's exclude phrases, sharing a span with a corpus sentence that holds one,
 *  or citing such a sentence. */
function excludes(ctx: Context, line: LineContext): void {
  const chalk = ctx.room.blocks.filter((b) => b.value.renderer === "chalk" && b.value.exclude !== undefined);
  if (chalk.length === 0) return;
  const corpus = corpusFiles(ctx, line);
  const phrase = "a phrase its block's exclude lists";
  for (const b of chalk) {
    const phrases = (b.value.exclude ?? []).flatMap((p) => wholeWords(p) ?? []);
    const holds = (text: string): boolean => phrases.some((p) => p.test(text));
    const framing = corpus.flatMap((f) => f.sentences.filter(holds));
    b.value.lines.forEach((l, i) => {
      const at = ctx.path("lines", i, "text");
      if (holds(l.text)) ctx.report("RT7", b.file, at, `holds ${phrase}`);
      else if (framing.some((s) => sharesSpan(l.text, s)))
        ctx.report("RT7", b.file, at, `shares a ${SPAN}-character span with a corpus sentence holding ${phrase}`);
      (l.claims ?? []).forEach((claim, k) => {
        const quote = collapse(claim.quote);
        const sentences = quote === "" ? [] : (line.corpusFile(claim.file)?.sentences ?? []);
        if (sentences.some((s) => s.includes(quote) && holds(s)))
          ctx.report("RT7", b.file, ctx.path("lines", i, "claims", k), `cites a corpus sentence holding ${phrase}`);
      });
    });
  }
}

// ---- RT8: words over their grid ----

/** Room for floating point at a region's edge, in metres: words that fill a grid its width sets, such as a counter's
 *  24 characters of 0.6 em in a region 14.4 em wide, are as wide as the region, not wider. */
const EDGE_M = 1e-9;

/** The largest amount a counter reads below $100, and a local reply's (contracts/turn-cost.md §5): amounts are live
 *  values, so these are the contract's figures, never data. */
const MOST = "$99.999999";
const NOTHING = "$0";

/** A turn-cost counter's readings, each with what a reason calls it: every reading of contracts/turn-cost.md §5's
 *  table, made from the UI words with the amounts that make them longest below $100, "cost unavailable" and
 *  "at least $99.999999 est." the longest in the contract's words. A word the UI words lack is RT12's. */
function readings(words: Readonly<Record<string, UiWord>>): { what: string; text: string }[] {
  const text = (key: string): string | null =>
    Object.hasOwn(words, key) ? uiText(words[key] as UiWord, key).text : null;
  const filled = (key: string, amount: string | null): string | null =>
    amount === null ? null : (text(key)?.replaceAll("{amount}", amount) ?? null);
  const estimated = filled("sign.estimated", MOST);
  const all: [string, string | null][] = [
    ["of sign.no_call_yet", text("sign.no_call_yet")],
    ["of sign.unavailable", text("sign.unavailable")],
    [NOTHING, NOTHING],
    [`of sign.local at ${NOTHING}`, filled("sign.local", NOTHING)],
    [`of sign.estimated at ${MOST}`, estimated],
    [`of sign.at_least of sign.estimated at ${MOST}`, filled("sign.at_least", estimated)],
  ];
  return all.flatMap(([what, reading]) => (reading === null ? [] : [{ what: `the reading ${what}`, text: reading }]));
}

/** A region's words, each with what a reason calls it; `alternatives` where only one shows at a time, a counter's
 *  readings; null where a region has none fixed, or where another rule stands (RI4, RT1). */
function regionWords(
  ctx: Context,
  region: Region,
  blocks: ReadonlyMap<string, RoomTextBlock>,
  resume: ResumeSource | null,
): { kind: string; lines: { what: string; text: string }[]; alternatives?: true } | null {
  if (region.text !== undefined) {
    const block = blocks.get(region.text);
    if (!block || block.renderer !== region.renderer) return null;
    const lines = block.lines.flatMap((l, k) =>
      l.pending ? [] : [{ what: `lines[${k}] of its block`, text: l.text }],
    );
    return { kind: "drawn lines", lines };
  }
  if (region.ui !== undefined) {
    const ui = ctx.room.ui?.value.words;
    if (!ui) return null;
    const lines = region.ui.flatMap((key, k) => {
      const word = Object.hasOwn(ui, key) ? ui[key] : undefined;
      return word === undefined ? [] : [{ what: `ui[${k}]`, text: uiText(word, key).text }];
    });
    return { kind: "words", lines };
  }
  if (region.resume_titles && ctx.options.mode === "strict" && resume) {
    const what = (k: number): string => `sections[${k}].title of the resume source`;
    return {
      kind: "section titles",
      lines: resume.sections.map((s, k) => ({ what: what(k), text: collapse(s.title) })),
    };
  }
  if (region.signal === "turn-cost") {
    const ui = ctx.room.ui?.value.words;
    return ui ? { kind: "readings", lines: readings(ui), alternatives: true } : null;
  }
  return null;
}

/** RT8: a region's words over its grid: more lines than its rows, a line wider than its columns, or, for chalk and
 *  neon, wider than the region at the grid's size by the advance widths of the typeface it draws in (legibility.ts's
 *  `typefaceFor`: a counter in `counters`). The resume source's section titles are held to a resume_titles region in
 *  strict mode only; a turn-cost counter's readings, one shown at a time, each to its one row. */
function grids(ctx: Context, resume: ResumeSource | null, faces: Faces): void {
  const scene = ctx.room.scene;
  if (!scene) return;
  const pieces = new Map(ctx.room.catalog.map((c) => [c.value.id, c.value] as const));
  const blocks = new Map(ctx.room.blocks.map((b) => [b.value.block, b.value] as const));
  const look = ctx.room.looks.find((l) => l.value.id === scene.value.look)?.file;
  for (const { placement, role, region, at } of boundRegions(ctx)) {
    const face = pieces.get(placement.piece)?.live_faces.find((f) => f.role === role);
    if (!face) continue;
    const box = regionBox(region.rect, face.size);
    const grid = textGrid(region.renderer, (region.grid ?? null) as Grid | null, box);
    const words = grid && regionWords(ctx, region, blocks, resume);
    if (!grid || !words) continue;
    const rt8 = (reason: string): void => ctx.report("RT8", scene.file, ctx.path(...at), reason);
    const { kind, lines, alternatives } = words;
    if (!alternatives && lines.length > grid.rows)
      rt8(`${lines.length} ${kind}, more than the grid's ${grid.rows} ${grid.rows === 1 ? "row" : "rows"}`);
    const use: TypefaceUse | null =
      region.renderer === "chalk" || region.renderer === "neon"
        ? typefaceFor(region.renderer, regionSource(region))
        : null;
    const cells = region.renderer === "neon" ? "characters" : "columns";
    for (const { what, text } of lines) {
      const length = [...text].length;
      if (grid.cols !== null && length > grid.cols) {
        rt8(`${what} is ${length} characters, more than the grid's ${grid.cols} ${cells}`);
        continue;
      }
      const ems = use !== null && look !== undefined ? faces.advance(look, use, text) : null;
      const wide = ems === null ? 0 : ems * grid.em;
      if (wide > box.w + EDGE_M)
        rt8(`${what} is ${wide.toFixed(3)} m wide at the grid's size, wider than the region's ${box.w.toFixed(3)} m`);
    }
  }
}

// ---- RT9: the Author's words, verbatim ----

/** An intent file: `intent/<NNN>-<name>.md` or `specs/<NNN>-<name>/intent.md` (contracts/room-data-files.md §6). */
const INTENT_FILE = /^(?:intent\/\d{3}-[^/]+\.md|specs\/\d{3}-[^/]+\/intent\.md)$/;
const INTENT_FORM = "intent/<NNN>-*.md or specs/<NNN>-*/intent.md";

/** RT9, in strict mode: a topic's or a block's `words_from` naming a file that isn't an intent the tree holds, or
 *  quoting words that aren't in it once whitespace is collapsed. */
function quotes(ctx: Context): void {
  if (ctx.options.mode !== "strict") return;
  const texts = new Map<string, string | null>();
  const intent = (file: string): string | null => {
    if (!texts.has(file)) {
      const bytes = ctx.tree.read(file);
      texts.set(file, bytes === null ? null : collapse(decode(bytes)));
    }
    return texts.get(file) ?? null;
  };
  const check = (file: string, at: readonly Step[], ref: Claim): void => {
    const rt9 = (key: string, reason: string): void => ctx.report("RT9", file, ctx.path(...at, key), reason);
    if (!INTENT_FILE.test(ref.file)) return rt9("file", `not an intent file, ${INTENT_FORM}`);
    const text = intent(ref.file);
    if (text === null) return rt9("file", "no intent file at that path");
    const quote = collapse(ref.quote);
    if (quote === "") rt9("quote", "an empty quote");
    else if (!text.includes(quote)) rt9("quote", "not verbatim in its intent file, whitespace collapsed");
  };
  const topics = ctx.room.topics;
  topics?.value.topics.forEach((t, i) =>
    t.words_from.forEach((ref, k) => check(topics.file, ["topics", i, "words_from", k], ref)),
  );
  for (const b of ctx.room.blocks) b.value.words_from?.forEach((ref, k) => check(b.file, ["words_from", k], ref));
}

// ---- RT11 and RT12: the UI words ----

/** The twin, by name: "twin", "twins", or "twin's", as a word. */
const TWIN = /(?<![\p{L}\p{N}])twin(?:s|['’]s)?(?![\p{L}\p{N}])/iu;

/** RT11: a tier sentence naming the twin; the tier's sentences speak about the machine (FR-035). */
function tierWords(ctx: Context): void {
  const ui = ctx.room.ui;
  if (!ui) return;
  for (const [key, word] of Object.entries(ui.value.words)) {
    const { text, at } = uiText(word, key);
    if (key.startsWith("tier.") && TWIN.test(text))
      ctx.report("RT11", ui.file, ctx.path(...at), "names the twin; the tier's sentences speak about the machine");
  }
}

/** RT12: a closed-list key missing, or a value whose slots aren't exactly its key's. */
function closedList(ctx: Context): void {
  const ui = ctx.room.ui;
  if (!ui) return;
  const words = ui.value.words;
  for (const [key, slots] of Object.entries(UI_KEYS) as [string, readonly string[]][]) {
    const word = Object.hasOwn(words, key) ? words[key] : undefined;
    if (word === undefined) {
      ctx.report("RT12", ui.file, ctx.path("words", key), "a closed-list UI key missing");
      continue;
    }
    const { text, at } = uiText(word, key);
    const [has, wants] = [slotsIn(text).sort(), [...slots].sort()];
    if (has.length !== wants.length || has.some((s, i) => s !== wants[i])) {
      const takes = slots.length === 0 ? "none" : slots.map((s) => `{${s}}`).join(" and ");
      ctx.report("RT12", ui.file, ctx.path(...at), `slots that differ from its key's, which takes ${takes}`);
    }
  }
}

// ---- RT13: the outlines ----

/** A run of base64's characters, 40 long or more: the measure of P-8's outline check (contracts/intake-amendments.md,
 *  O10). */
const BASE64_RUN = /[A-Za-z0-9+/]{40,}/;

/** What an outline's string other than its path data may not hold (§8), by kind, or null: an href, a data: URI, a
 *  path, a base64-like run, a file name or extension, or a camera's file stem (spec 003's M8, as
 *  src/room/glb/names.ts ports it). */
export function outlineProblem(text: string): string | null {
  if (/href/i.test(text)) return "an href";
  if (/data:/i.test(text)) return "a data: URI";
  const name = nameProblem(text);
  if (name === "path") return "a path";
  if (BASE64_RUN.test(text)) return "a base64-like run";
  if (name === "file-name") return "a file name or extension";
  if (name === "camera-stem") return "a camera's file stem";
  return null;
}

/** The intents an `intent_ref`'s number names, each collapsed: `intent/<NNN>-<name>.md` and
 *  `specs/<NNN>-<name>/intent.md`. */
function intentsOf(ctx: Context, ref: string): string[] {
  const number = ref.slice("intent-".length);
  const files = [
    ...ctx.tree.list("intent").flatMap((n) => (n.startsWith(`${number}-`) && n.endsWith(".md") ? [`intent/${n}`] : [])),
    ...ctx.tree.list("specs").flatMap((n) => (n.startsWith(`${number}-`) ? [`specs/${n}/intent.md`] : [])),
  ];
  return files.flatMap((file) => {
    const bytes = ctx.tree.read(file);
    return bytes === null ? [] : [collapse(decode(bytes))];
  });
}

/** RT13: an outline's string, its path data apart (the grammar holds it, the loader's), holding what outlineProblem
 *  finds; in strict mode, `words` that the intent `intent_ref` names doesn't hold between quotation marks. */
function outlines(ctx: Context): void {
  const check = (o: Loaded<Outline>): void => {
    const v = o.value;
    const strings: [readonly Step[], string][] = [
      [["sign"], v.sign],
      [["words"], v.words],
      [["intent_ref"], v.intent_ref],
      [["source", "type"], v.source.type],
      [["source", "id"], v.source.id],
      [["tool", "name"], v.tool.name],
      [["tool", "version"], v.tool.version],
      [["tool", "license"], v.tool.license],
    ];
    for (const [at, text] of strings) {
      const kind = outlineProblem(text);
      if (kind !== null) ctx.report("RT13", o.file, ctx.path(...at), `holds ${kind}`);
    }
    if (ctx.options.mode !== "strict") return;
    const intents = intentsOf(ctx, v.intent_ref);
    if (intents.length === 0) {
      ctx.report("RT13", o.file, ctx.path("intent_ref"), `no intent of that number, ${INTENT_FORM}`);
      return;
    }
    const words = collapse(v.words);
    const quoted = [`"${words}"`, `“${words}”`];
    if (!intents.some((text) => quoted.some((q) => text.includes(q))))
      ctx.report("RT13", o.file, ctx.path("words"), "not inside the quotation marks of the intent intent_ref names");
  };
  for (const o of ctx.room.outlines) check(o);
}

/** RT: regions' text (RT1), spec 002's C6, C1 to C5, and C8 (RT3 to RT5), the monitor's scripts (RT6), the chalk's
 *  excludes (RT7), grids (RT8), quotes (RT9), typefaces (RT10), the tier's words (RT11), the closed list's keys
 *  (RT12), and outlines (RT13). RT2 is the walk's, which compose() runs first. */
export const rt: Family = (ctx) => {
  const { line, resume } = words(ctx);
  const looks = ctx.room.looks.map((l) => ({ file: l.file, typefaces: l.value.typefaces }));
  // Without a look, no typeface is named, and nothing reads fonts.lock.
  const faces: Faces = looks.length > 0 ? readFaces(ctx.tree, looks) : { looks: [], findings: [], advance: () => null };
  sources(ctx);
  numbers(ctx);
  citations(ctx, line);
  scripts(ctx);
  excludes(ctx, line);
  grids(ctx, resume, faces);
  quotes(ctx);
  for (const f of faces.findings) ctx.report("RT10", f.file, f.path, f.reason);
  tierWords(ctx);
  closedList(ctx);
  outlines(ctx);
};
