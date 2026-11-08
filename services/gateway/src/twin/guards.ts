// The twin's guards (spec 007; FR-010, FR-011, FR-013, FR-014, FR-021 to FR-023; plan §5): deterministic checks, in
// code, of a whole answer against the turn's grounding, before any word leaves the gateway. No model judges another.
// - The trim: an answer cut at its output cap (finish reason `length`) back to its last whole sentence, or withheld.
// - Then G5 secrets, G4 the prompt, G3 disclosure, G1 numbers, G2 amounts, G6 links, G7 ownership verbs, each
//   withholding the whole answer, which becomes the fixed line `withheld`; and last G8, which replaces an answer about
//   what happens to a visitor's words, or about the agents' share of the work, without the corpus's own span, with the
//   corpus's own answer for it, verbatim (privacy first when both apply).
// The first failure is the one recorded. A guard that can't run withholds the answer as `error` (fail closed). There is
// no retry (provisional, Q3): the call's cost stays counted, and the route counts the withholding by guard.
import type { FinishReason } from "../core/types.js";
import { SECRET_PATTERNS } from "../telemetry/redact.js";
import type { Quotes, Ruling } from "./pack.js";

export type GuardName =
  | "length"
  | "numbers"
  | "amounts"
  | "disclosure"
  | "prompt"
  | "secrets"
  | "links"
  | "ownership"
  | "privacy"
  | "agents_share"
  | "error";

export const GUARD_NAMES: readonly GuardName[] = [
  "length",
  "numbers",
  "amounts",
  "disclosure",
  "prompt",
  "secrets",
  "links",
  "ownership",
  "privacy",
  "agents_share",
  "error",
];

/** The order the guards run in after the trim; "privacy" is G8, which covers the agents' share too. */
export const GUARD_ORDER = [
  "secrets",
  "prompt",
  "disclosure",
  "numbers",
  "amounts",
  "links",
  "ownership",
  "privacy",
] as const;

export interface GuardContext {
  /** Every word of the turn's grounding (src/twin/grounding.ts). */
  readonly groundingText: string;
  readonly rulings: readonly Ruling[];
  readonly quotes: Quotes;
  /** The instructions' text, config/twin/prompt.md. */
  readonly instructions: string;
  /** The instructions' marker phrase. */
  readonly canary: string;
  /** The fixed line `withheld`. */
  readonly withheld: string;
}

export type Guarded = { kind: "pass"; text: string } | { kind: "withheld"; guard: GuardName; text: string };

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();
const sentencesOf = (text: string): string[] =>
  collapse(text)
    .split(/(?<=[.!?])\s+(?=["'“‘(]?[A-Z0-9])/)
    .filter(Boolean);

// ---- The trim (FR-023) ----

/** An answer cut at its output cap, back to its last whole sentence; null when it has none. */
export function trimToSentence(text: string): string | null {
  const ends = [...text.matchAll(/[.!?]["'”’)\]]*(?=\s|$)/g)];
  const last = ends.at(-1);
  if (last === undefined) return null;
  const cut = text.slice(0, (last.index ?? 0) + last[0].length).trimEnd();
  return cut === "" ? null : cut;
}

// ---- G1 numbers (FR-010) ----

const UNITS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  dozen: 12,
};
const WORD = new RegExp(
  `\\b(?:(${Object.keys(TENS).join("|")})(?:-(${Object.keys(UNITS)
    .filter((u) => UNITS[u] !== undefined && (UNITS[u] ?? 0) < 10)
    .join("|")}))?|(${Object.keys(UNITS).join("|")})|(${Object.keys(SCALES).join("|")}))\\b`,
  "gi",
);
const DIGITS = /\d[\d,]*(?:\.\d+)?/g;

const canonicalNumber = (n: number): string => String(Number(n.toFixed(6)));

/** Every number a text states, in digits or in words, as canonical strings. "one" and ordinal words aren't numbers here. */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(DIGITS)) {
    const value = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(value)) out.add(canonicalNumber(value));
  }
  for (const m of text.matchAll(WORD)) {
    const [, tens, unit, alone, scale] = m;
    if (tens !== undefined)
      out.add(
        canonicalNumber((TENS[tens.toLowerCase()] ?? 0) + (unit === undefined ? 0 : (UNITS[unit.toLowerCase()] ?? 0))),
      );
    else if (alone !== undefined) out.add(canonicalNumber(UNITS[alone.toLowerCase()] ?? 0));
    else if (scale !== undefined) out.add(canonicalNumber(SCALES[scale.toLowerCase()] ?? 0));
  }
  return out;
}

function numbersFail(answer: string, ctx: GuardContext): boolean {
  const allowed = numbersIn(ctx.groundingText);
  return [...numbersIn(answer)].some((n) => !allowed.has(n));
}

// ---- G2 amounts (FR-011) ----

/** corpus/tools/check_corpus.py's CURRENCY pattern, as its source writes it; a test holds the two equal. */
export const CURRENCY_PY_SOURCE = String.raw`[$€£₹₨]\s?\d|\b(?:USD|EUR|GBP|KES|INR|NPR|UGX|USh|TZS|TSh|XOF|F?CFA|(?i:usd|kes|kshs?)\.?|K?Shs?\.?|N?Rs\.?)\s?\d|\b\d[\d,.]*\s?(?:[kKmMbB]n?|(?i:thousand|million|billion|lakh|crore))?\s?(?:(?i:US|U\.S\.|Kenyan|Indian|Nepali|Nepalese|Ugandan|Tanzanian)\s)?(?:USD|EUR|GBP|KES|KSh|INR|NPR|UGX|TZS|XOF|CFA|(?i:dollars?|euros?|shillings?|rupees?|francs?))\b|\b\d[\d,.]*-(?:(?i:thousand|million|billion|lakh|crore)-)?(?i:dollar|shilling|rupee|franc)\b|\b\d[\d,]*\s?/[=-]`;

/** Python's scoped `(?i:…)` as JavaScript before inline modifiers: each letter inside as `[xX]`. */
export function expandInlineCase(pattern: string): string {
  let out = "";
  for (let i = 0; i < pattern.length; i += 1) {
    if (!pattern.startsWith("(?i:", i)) {
      out += pattern[i];
      continue;
    }
    out += "(?:";
    i += 4;
    let depth = 1;
    for (; i < pattern.length && depth > 0; i += 1) {
      const c = pattern[i] ?? "";
      if (c === "\\") {
        out += c + (pattern[i + 1] ?? "");
        i += 1;
      } else if (c === "(") {
        depth += 1;
        out += c;
      } else if (c === ")") {
        depth -= 1;
        out += c;
      } else if (/[a-z]/i.test(c)) out += `[${c.toLowerCase()}${c.toUpperCase()}]`;
      else out += c;
    }
    i -= 1;
  }
  return out;
}

const CURRENCY = new RegExp(expandInlineCase(CURRENCY_PY_SOURCE), "g");
/** Beyond the corpus check's forms: a number beside cents, dollars, or USD, and a number word beside a currency. */
const EXTRA = new RegExp(
  `\\b\\d[\\d,.]*\\s?(?:cents?|dollars?|usd|bucks?)\\b|\\b(?:${[...Object.keys(UNITS), ...Object.keys(TENS), "one", "a hundred", "a thousand"].join("|")})\\s+(?:cents?|dollars?|bucks?)\\b`,
  "gi",
);
const AMOUNT_VALUE = /(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn|b|thousand|million|billion)?(?![a-z])/i;
const SCALE_OF: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9, thousand: 1e3, million: 1e6, billion: 1e9 };

/** Every currency amount a text states, as canonical numbers; a match whose value can't be read counts as "?". */
export function amountsIn(text: string): Set<string> {
  const out = new Set<string>();
  const add = (start: number, matched: string): void => {
    const rest = text.slice(start, start + matched.length + 16);
    const words = /\b([a-z]+)\s+(?:cents?|dollars?|bucks?)\b/i.exec(matched);
    const value = AMOUNT_VALUE.exec(rest);
    let n: number | undefined;
    if (value) n = Number((value[1] ?? "").replace(/,/g, "")) * (SCALE_OF[(value[2] ?? "").toLowerCase()] ?? 1);
    else if (words)
      n =
        UNITS[(words[1] ?? "").toLowerCase()] ??
        TENS[(words[1] ?? "").toLowerCase()] ??
        (words[1]?.toLowerCase() === "one" ? 1 : undefined);
    if (n !== undefined && /\bcents?\b/i.test(matched)) n /= 100;
    out.add(n === undefined || !Number.isFinite(n) ? "?" : canonicalNumber(n));
  };
  for (const m of text.matchAll(CURRENCY)) add(m.index ?? 0, m[0]);
  for (const m of text.matchAll(EXTRA)) add(m.index ?? 0, m[0]);
  return out;
}

function amountsFail(answer: string, ctx: GuardContext): boolean {
  const found = amountsIn(answer);
  if (found.size === 0) return false;
  const allowed = amountsIn(ctx.groundingText);
  return [...found].some((a) => a === "?" || !allowed.has(a));
}

// ---- G3 disclosure (FR-013) ----

const HUMAN = /\b(?:i am|i['’ʼ]m) (?:a )?(?:real )?(?:human|person)\b|\bnot an ai\b/i;
const AUTHOR = /\b(?:i am|i['’ʼ]m) (?:the author|hareet)\b|\bthis is hareet\b|\bhareet himself\b/i;
const DISCLOSED = /\b(?:twin|ai)\b/i;

function disclosureFails(answer: string): boolean {
  return sentencesOf(answer).some((s) => HUMAN.test(s) || (AUTHOR.test(s) && !DISCLOSED.test(s)));
}

// ---- G4 the prompt (FR-021) ----

const RUN = 12;
const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[“”"]/g, " ")
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
/** The instructions' own wording, its quotations of the corpus left out, as runs of twelve words. */
function runsOf(instructions: string): Set<string> {
  const own = instructions.replace(/"[^"\n]*"/g, " ").replace(/“[^”]*”/g, " ");
  const words = wordsOf(own);
  const runs = new Set<string>();
  for (let i = 0; i + RUN <= words.length; i += 1) runs.add(words.slice(i, i + RUN).join(" "));
  return runs;
}
const runCache = new Map<string, Set<string>>();

function promptFails(answer: string, ctx: GuardContext): boolean {
  if (ctx.canary.trim().length < 12) throw new Error("no canary");
  if (collapse(answer).toLowerCase().includes(collapse(ctx.canary).toLowerCase())) return true;
  let runs = runCache.get(ctx.instructions);
  if (runs === undefined) {
    runs = runsOf(ctx.instructions);
    runCache.clear();
    runCache.set(ctx.instructions, runs);
  }
  const words = wordsOf(answer);
  for (let i = 0; i + RUN <= words.length; i += 1) if (runs.has(words.slice(i, i + RUN).join(" "))) return true;
  return false;
}

// ---- G5 secrets (FR-021) ----

const SECRET_SHAPES: readonly RegExp[] = [
  ...SECRET_PATTERNS.map((p) => new RegExp(p.pattern.source, p.pattern.flags.replace("g", ""))),
  // The red-team suite's secret-shaped pattern (redteam/run.py).
  /h4op_[a-z]+_[A-Za-z0-9_-]{20,}|sk-lf-[0-9a-f-]{8,}|\bA[KS]IA[0-9A-Z]{16}\b/,
];

const secretsFail = (answer: string): boolean => SECRET_SHAPES.some((p) => p.test(answer));

// ---- G6 links (FR-021) ----

const TLD = "com|org|net|io|ai|dev|app|co|gov|edu|info|me|ly|us|uk|ke|in|np|ug|tz|ml|so|to|gg|xyz|site|tech";
const LINKS = new RegExp(
  `https?:\\/\\/[^\\s<>"'\`)\\]]+|[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+|\\b(?:[a-z0-9-]+\\.)+(?:${TLD})\\b(?:\\/[^\\s<>"'\`)\\]]*)?`,
  "gi",
);
const normalLink = (link: string): string =>
  link
    .toLowerCase()
    .replace(/[.,;:!?)\]]+$/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");

function linksFail(answer: string, ctx: GuardContext): boolean {
  const ground = ctx.groundingText
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/\bwww\./g, "");
  for (const m of answer.matchAll(LINKS)) {
    const link = normalLink(m[0]);
    if (link !== "" && !ground.includes(link)) return true;
  }
  return false;
}

// ---- G7 ownership (FR-014) ----

/** The corpus's ownership verbs (corpus/README.md, Role precision; apps/web/build/content.ts's OWNERSHIP_VERBS). */
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

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bounded = (phrase: string): RegExp => new RegExp(`(?<![A-Za-z0-9-])${escapeRe(phrase)}(?![A-Za-z0-9-])`, "gi");

interface Mention {
  start: number;
  end: number;
  value: string;
}

function mentions(sentence: string, phrases: readonly string[]): Mention[] {
  const found: Mention[] = [];
  for (const phrase of [...phrases].sort((a, b) => b.length - a.length)) {
    for (const m of sentence.matchAll(bounded(phrase))) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (!found.some((f) => start < f.end && end > f.start)) found.push({ start, end, value: phrase });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** A verb paired with the nearest ruled system after it, before the next verb, that its ruling doesn't give. */
function ownershipFails(answer: string, ctx: GuardContext): boolean {
  const rulings = new Map(
    ctx.rulings.map((r) => [r.system.toLowerCase(), new Set(r.verbs.map((v) => v.toLowerCase()))]),
  );
  const systems = ctx.rulings.map((r) => r.system);
  for (const sentence of sentencesOf(answer)) {
    const verbs = mentions(sentence, OWNERSHIP_VERBS);
    if (verbs.length === 0) continue;
    const named = mentions(sentence, systems);
    verbs.forEach((verb, i) => {
      const next = verbs[i + 1]?.start ?? Infinity;
      const object = named.find((s) => s.start >= verb.end && s.start < next);
      if (object === undefined) return;
      const allowed = rulings.get(object.value.toLowerCase());
      if (allowed !== undefined && !allowed.has(verb.value.toLowerCase())) throw new OwnershipBreach();
    });
  }
  return false;
}

class OwnershipBreach extends Error {}

// ---- G8 the privacy promise and the agents' share (FR-014) ----

const STORAGE =
  /\b(?:saved?|saves|saving|stored?|stores|storing|kept|retain(?:s|ed)?|logged|logs|recorded|records|tracked|tracks|deleted?|deletes|shared?|shares|sold|sells?)\b/i;
const CONVERSATION =
  /\b(?:conversations?|chats?|messages?|transcripts?|what you (?:say|said|type|typed|write|wrote|ask|asked)|your (?:words|questions?|data|input|text))\b/i;
const VISITOR = /\b(?:you|your|yours|visitors?|visitor['’]s)\b/i;
const AGENTS = /\b(?:ai agents?|agents?|claude(?: code)?|llms?)\b/i;
const SHARE = /\b(?:typ(?:e|es|ed|ing)|writ(?:e|es|ing)|wrote|written|merg(?:e|es|ed|ing)|commit(?:s|ted|ting)?)\b/i;

const holdsSpan = (answer: string, spans: readonly string[]): boolean => {
  const text = collapse(answer).toLowerCase();
  return spans.some((s) => text.includes(collapse(s).toLowerCase()));
};

function privacyReplaces(answer: string, ctx: GuardContext): boolean {
  if (holdsSpan(answer, ctx.quotes.privacy.spans)) return false;
  return sentencesOf(answer).some((s) => STORAGE.test(s) && CONVERSATION.test(s) && VISITOR.test(s));
}

function agentsReplaces(answer: string, ctx: GuardContext): boolean {
  if (holdsSpan(answer, ctx.quotes.agents_share.spans)) return false;
  return sentencesOf(answer).some((s) => AGENTS.test(s) && SHARE.test(s));
}

// ---- The guards in order ----

const CHECKS: readonly [
  Exclude<GuardName, "length" | "privacy" | "agents_share" | "error">,
  (a: string, c: GuardContext) => boolean,
][] = [
  ["secrets", (a) => secretsFail(a)],
  ["prompt", promptFails],
  ["disclosure", (a) => disclosureFails(a)],
  ["numbers", numbersFail],
  ["amounts", amountsFail],
  ["links", linksFail],
  [
    "ownership",
    (a, c) => {
      try {
        return ownershipFails(a, c);
      } catch (e) {
        if (e instanceof OwnershipBreach) return true;
        throw e;
      }
    },
  ],
];

/** The answer through the trim and every guard: passed whole, or withheld by the first guard that fails. */
export function guardAnswer(answer: string, finish: FinishReason, ctx: GuardContext): Guarded {
  const withheld = (guard: GuardName): Guarded => ({ kind: "withheld", guard, text: ctx.withheld });
  let text = answer.trim();
  if (finish === "length") {
    const cut = trimToSentence(text);
    if (cut === null) return withheld("length");
    text = cut;
  }
  try {
    if (text === "") return withheld("error");
    for (const [name, fails] of CHECKS) if (fails(text, ctx)) return withheld(name);
    if (privacyReplaces(text, ctx)) return { kind: "withheld", guard: "privacy", text: ctx.quotes.privacy.answer };
    if (agentsReplaces(text, ctx))
      return { kind: "withheld", guard: "agents_share", text: ctx.quotes.agents_share.answer };
  } catch {
    return withheld("error");
  }
  return { kind: "pass", text };
}
