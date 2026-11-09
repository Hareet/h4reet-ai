// The twin's readiness in the room's build (spec 007; FR-030, FR-037; plan §6, departure D3; spec 002's T066), by the
// gateway's rule (services/gateway/src/twin/readiness.ts): a topic, or free talk, is ready only while
// config/twin-readiness.yaml, the Author's file, says `ready: true` and both its hashes equal the tree's: the topic's
// pack hash (the whole pack's for free talk) and the prompt hash over config/twin/prompt.md and lines.yaml. A missing or
// invalid readiness file, pack, prompt, or fixed lines makes nothing ready, and the build goes on. The shared readiness
// matrix (services/gateway/test/fixtures/twin-readiness-matrix.json) holds both sides to the same answers.
//
// It also carries config/budgets.yaml's `limits.twin` to the room (FR-027, FR-041), FR-027's defaults when it has none,
// so the text box's limit and the history window match the route's.
import { parse } from "yaml";
import { z } from "zod";

import { canonicalHash, topicHashInput, wholeHashInput } from "../twin-pack";
import type { TwinPack } from "../twin-pack";
import type { Tree } from "./source";

export const READINESS_PATH = "config/twin-readiness.yaml";
export const PACK_FILE = "config/twin/corpus.json";
export const PROMPT_FILE = "config/twin/prompt.md";
export const LINES_FILE = "config/twin/lines.yaml";
export const BUDGETS_FILE = "config/budgets.yaml";
const FREE_TALK = "free_talk";

export interface TwinReadiness {
  readonly topics: ReadonlyMap<string, boolean>;
  readonly freeTalk: boolean;
}

export interface TalkLimits {
  readonly turnMaxChars: number;
  readonly historyMaxTurns: number;
  readonly historyMaxChars: number;
}

/** The prompt hash, as the gateway computes it (src/twin/hash.ts). */
export const promptHash = (prompt: string, lines: string): string =>
  canonicalHash({ "lines.yaml": lines, "prompt.md": prompt });

const HEX64 = /^[0-9a-f]{64}$/;
const ENTRY = z.union([
  z.strictObject({
    ready: z.literal(true),
    pack_sha256: z.string().regex(HEX64),
    prompt_sha256: z.string().regex(HEX64),
    evidence: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    ready: z.literal(false),
    pack_sha256: z.string().regex(HEX64).optional(),
    prompt_sha256: z.string().regex(HEX64).optional(),
    evidence: z.array(z.string().min(1)).optional(),
  }),
]);
const SHARE = z.number().min(0).max(1);
const READINESS = z.strictObject({
  schema: z.literal(1),
  thresholds: z.strictObject({ safety: SHARE, golden: SHARE }),
  topics: z.record(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), ENTRY),
  free_talk: ENTRY,
});

const NOTHING: TwinReadiness = { topics: new Map(), freeTalk: false };

const text = (tree: Pick<Tree, "read">, path: string): string | null => {
  const bytes = tree.read(path);
  if (bytes === null) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

const yamlOf = (source: string): unknown => {
  try {
    return parse(source) as unknown;
  } catch {
    return undefined;
  }
};

/** The pack, its hashes recomputed as the gateway recomputes them; null when it can't be used. */
function packOf(source: string | null): TwinPack | null {
  if (source === null) return null;
  let pack: TwinPack;
  try {
    pack = JSON.parse(source) as TwinPack;
  } catch {
    return null;
  }
  if (!Array.isArray(pack.sections) || !Array.isArray(pack.topics) || !Array.isArray(pack.selectables)) return null;
  if (typeof pack.rules !== "object" || typeof pack.quotes !== "object") return null;
  if (canonicalHash(wholeHashInput(pack)) !== pack.sha256) return null;
  for (const t of pack.topics) if (canonicalHash(topicHashInput(pack, t.id, t.files)) !== t.sha256) return null;
  return pack;
}

/** The gateway's own checks of the prompt and the fixed lines (src/config/twin.ts): without them it answers nothing. */
const promptUsable = (prompt: string): boolean =>
  /\n## Marker\n\n[^\n]*: [^\n]{12,}/.test(prompt) &&
  /\n## Depth: engineer\n\n[^\n]*\n/.test(prompt) &&
  /\n## Depth: non-engineer\n\n[^\n]*\n/.test(prompt);
const linesUsable = (lines: string): boolean => {
  const doc = yamlOf(lines) as { schema?: unknown; lines?: Record<string, unknown> } | null | undefined;
  return (
    doc?.schema === 1 &&
    typeof doc.lines === "object" &&
    doc.lines !== null &&
    // `withheld`, and since the Author's decision of 2026-11-09 `not_said` (spec 007's plan, D38), as the gateway reads them.
    Object.keys(doc.lines).sort().join() === "not_said,withheld" &&
    ["withheld", "not_said"].every((k) => typeof doc.lines?.[k] === "string" && String(doc.lines[k]).trim() !== "")
  );
};

/** FR-030's rule over the tree's files. */
export function twinReadiness(tree: Pick<Tree, "read">): TwinReadiness {
  const pack = packOf(text(tree, PACK_FILE));
  const prompt = text(tree, PROMPT_FILE);
  const lines = text(tree, LINES_FILE);
  const source = text(tree, READINESS_PATH);
  if (pack === null || prompt === null || lines === null || source === null) return NOTHING;
  if (!promptUsable(prompt) || !linesUsable(lines)) return NOTHING;
  const parsed = READINESS.safeParse(yamlOf(source));
  if (!parsed.success) return NOTHING;
  const running = promptHash(prompt, lines);
  const ready = (entry: z.infer<typeof ENTRY> | undefined, packSha: string): boolean =>
    entry !== undefined && entry.ready && entry.pack_sha256 === packSha && entry.prompt_sha256 === running;
  const topics = new Map<string, boolean>();
  for (const t of pack.topics) topics.set(t.id, ready(parsed.data.topics[t.id], t.sha256));
  return { topics, freeTalk: ready(parsed.data.free_talk, pack.sha256) };
}

/** A topic's readiness, for a topic the pack doesn't name too: never ready. */
export const topicReady = (r: TwinReadiness, topic: string): boolean =>
  topic === FREE_TALK ? r.freeTalk : (r.topics.get(topic) ?? false);

const DEFAULTS: TalkLimits = { turnMaxChars: 600, historyMaxTurns: 8, historyMaxChars: 4_000 };

/** config/budgets.yaml's limits.twin, the room's share of it, or FR-027's defaults. */
export function talkLimits(tree: Pick<Tree, "read">): TalkLimits {
  const source = text(tree, BUDGETS_FILE);
  const twin = (yamlOf(source ?? "") as { limits?: { twin?: Record<string, unknown> } } | null | undefined)?.limits
    ?.twin;
  const int = (key: string, fallback: number): number => {
    const value = twin?.[key];
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
  };
  return {
    turnMaxChars: int("turn_max_chars", DEFAULTS.turnMaxChars),
    historyMaxTurns: int("history_max_turns", DEFAULTS.historyMaxTurns),
    historyMaxChars: int("history_max_chars", DEFAULTS.historyMaxChars),
  };
}
