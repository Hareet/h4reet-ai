// The twin's files at start (spec 007; FR-029, FR-030, FR-054; plan §2, §6): from the gateway's mounted config/, read
// once, as config/room-events.yaml is.
// - twin/corpus.json, the grounding pack (src/twin/pack.ts);
// - twin/prompt.md, the instructions, with a depth section for each path and a marker section whose phrase is guard G4's
//   canary; and twin/lines.yaml, the fixed lines. The two are hashed together as the prompt hash;
// - twin-readiness.yaml, the Author's readiness file, which P-1 creates; missing or invalid, nothing is ready.
// None of them stops the gateway: a pack, prompt, or lines file that is missing or invalid leaves the twin unavailable,
// and every turn then answers twin_unavailable (FR-054). A reason names the file and how it failed, never its content.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { promptHash } from "../twin/hash.js";
import { parsePack, type Pack } from "../twin/pack.js";
import { parseReadiness, READINESS_FILE, type ReadinessLoad } from "../twin/readiness.js";
import { parseYaml } from "./load.js";

export const TWIN_DIR = "twin";
export type VisitPath = "engineer" | "non-engineer";
export const PATHS: readonly VisitPath[] = ["engineer", "non-engineer"];

export interface PromptFile {
  /** prompt.md's text, whole: what guard G4 holds an answer against. */
  readonly text: string;
  /** The marker section's phrase, which no answer may contain (G4). */
  readonly canary: string;
  /** The instructions a turn sends: prompt.md without the other path's depth section. */
  readonly forPath: Readonly<Record<VisitPath, string>>;
}

export interface Lines {
  readonly withheld: string;
  /** The Author's line for a sentence that declined a claim by restating it (spec 007's plan, D38). */
  readonly notSaid: string;
}

export interface TwinFiles {
  readonly pack: Pack;
  readonly prompt: PromptFile;
  readonly lines: Lines;
  /** SHA-256 over prompt.md and lines.yaml (src/twin/hash.ts). */
  readonly promptSha256: string;
}

export type TwinUnavailable =
  "pack_missing" | "pack_invalid" | "prompt_missing" | "prompt_invalid" | "lines_missing" | "lines_invalid";

export type TwinLoad =
  | { available: true; files: TwinFiles; readiness: ReadinessLoad }
  | { available: false; reason: TwinUnavailable; readiness: ReadinessLoad };

/** The files' texts, null for a file that isn't there. */
export interface TwinTexts {
  pack: string | null;
  prompt: string | null;
  lines: string | null;
  readiness: string | null;
}

const DEPTH = (path: VisitPath): RegExp => new RegExp(`\\n## Depth: ${path}\\n\\n[^\\n]*\\n`);

/** prompt.md, checked: both depth sections and the marker section, or null. */
export function parsePrompt(text: string): PromptFile | null {
  const marker = /\n## Marker\n\n([^\n]*): ([^\n]+?)\.?(?:\n|$)/.exec(text);
  const canary = marker?.[2]?.trim() ?? "";
  if (canary.length < 12) return null;
  const sections = Object.fromEntries(PATHS.map((p) => [p, DEPTH(p).exec(text)?.[0]])) as Record<
    VisitPath,
    string | undefined
  >;
  if (sections.engineer === undefined || sections["non-engineer"] === undefined) return null;
  const without = (other: VisitPath): string => text.replace(sections[other] ?? "", "");
  return { text, canary, forPath: { engineer: without("non-engineer"), "non-engineer": without("engineer") } };
}

const LINES = z.strictObject({
  schema: z.literal(1),
  lines: z.strictObject({
    withheld: z.string().trim().min(1).max(400),
    not_said: z.string().trim().min(1).max(400),
  }),
});

/** lines.yaml, checked, or null. */
export function parseLines(text: string): Lines | null {
  const parsed = parseYaml(`config/${TWIN_DIR}/lines.yaml`, text);
  if (parsed.issues.length > 0) return null;
  const result = LINES.safeParse(parsed.data);
  return result.success
    ? { withheld: result.data.lines.withheld.trim(), notSaid: result.data.lines.not_said.trim() }
    : null;
}

/** The twin from its files' texts: what loadTwin reads, and what the tests give. It never throws. */
export function twinFromTexts(texts: TwinTexts): TwinLoad {
  const readiness: ReadinessLoad =
    texts.readiness === null ? { ok: false, reason: "missing" } : parseReadiness(texts.readiness);
  const unavailable = (reason: TwinUnavailable): TwinLoad => ({ available: false, reason, readiness });
  if (texts.pack === null) return unavailable("pack_missing");
  const pack = parsePack(texts.pack);
  if (!pack.ok) return unavailable("pack_invalid");
  if (texts.prompt === null) return unavailable("prompt_missing");
  const prompt = parsePrompt(texts.prompt);
  if (prompt === null) return unavailable("prompt_invalid");
  if (texts.lines === null) return unavailable("lines_missing");
  const lines = parseLines(texts.lines);
  if (lines === null) return unavailable("lines_invalid");
  return {
    available: true,
    files: { pack: pack.pack, prompt, lines, promptSha256: promptHash(texts.prompt, texts.lines) },
    readiness,
  };
}

/** `<dir>/twin/…` and `<dir>/twin-readiness.yaml`, read and checked. An unreadable file reads as missing. */
export async function loadTwin(dir: string): Promise<TwinLoad> {
  const read = async (path: string): Promise<string | null> => {
    try {
      return await readFile(join(dir, path), "utf8");
    } catch {
      return null;
    }
  };
  return twinFromTexts({
    pack: await read(join(TWIN_DIR, "corpus.json")),
    prompt: await read(join(TWIN_DIR, "prompt.md")),
    lines: await read(join(TWIN_DIR, "lines.yaml")),
    readiness: await read(READINESS_FILE),
  });
}
