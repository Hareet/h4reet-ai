// The twin's files for the gateway's tests (spec 007): the committed pack, prompt, and fixed lines read from the
// repository's config/twin/, and readiness files made at run time with the running hashes, so no 64-hex value sits in
// a test file (tasks.md: "Tests compute hashes from fixtures rather than embed 64-hex literals").
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { twinFromTexts, type TwinLoad, type TwinTexts } from "../../src/config/twin.js";
import { canonicalHash, promptHash } from "../../src/twin/hash.js";

export const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
export const TWIN_DIR = `${REPO}config/twin/`;

export const committed = (name: "corpus.json" | "prompt.md" | "lines.yaml"): string =>
  readFileSync(`${TWIN_DIR}${name}`, "utf8");

/** The committed files' texts, with no readiness file. */
export function committedTexts(): TwinTexts {
  return {
    pack: committed("corpus.json"),
    prompt: committed("prompt.md"),
    lines: committed("lines.yaml"),
    readiness: null,
  };
}

/** The running hashes of the committed files: each topic's, the whole pack's, and the prompt's. */
export function runningHashes(texts: TwinTexts = committedTexts()): {
  topics: Record<string, string>;
  whole: string;
  prompt: string;
} {
  const pack = JSON.parse(texts.pack ?? "{}") as { topics: { id: string; sha256: string }[]; sha256: string };
  return {
    topics: Object.fromEntries(pack.topics.map((t) => [t.id, t.sha256])),
    whole: pack.sha256,
    prompt: promptHash(texts.prompt ?? "", texts.lines ?? ""),
  };
}

/** A hash that is no running one: of a word, at run time. */
export const otherHash = (word = "other"): string => canonicalHash({ other: word });

export interface ReadyEntry {
  ready: boolean;
  pack?: "running" | "other";
  prompt?: "running" | "other";
}

/** A readiness file's text: each named topic, and free talk, with the running or another hash. */
export function readinessText(
  o: { topics?: Record<string, ReadyEntry>; freeTalk?: ReadyEntry; extra?: string },
  hashes = runningHashes(),
): string {
  const entry = (e: ReadyEntry, running: string): string => {
    if (!e.ready) return "{ ready: false }";
    const pack = e.pack === "other" ? otherHash("pack") : running;
    const prompt = e.prompt === "other" ? otherHash("prompt") : hashes.prompt;
    return `{ ready: true, pack_sha256: "${pack}", prompt_sha256: "${prompt}", evidence: [evals/product/history/x.json] }`;
  };
  const topics = Object.entries(o.topics ?? {})
    .map(([id, e]) => `  ${id}: ${entry(e, hashes.topics[id] ?? otherHash(id))}\n`)
    .join("");
  return [
    "schema: 1\n",
    "thresholds: { safety: 1.0, golden: 0.90 }\n",
    topics === "" ? "topics: {}\n" : `topics:\n${topics}`,
    `free_talk: ${entry(o.freeTalk ?? { ready: false }, hashes.whole)}\n`,
    o.extra ?? "",
  ].join("");
}

/** The twin as the gateway loads it from the committed files, with the given readiness. */
export function twinWith(readiness: string | null, texts: Partial<TwinTexts> = {}): TwinLoad {
  return twinFromTexts({ ...committedTexts(), readiness, ...texts });
}

/** Every topic and free talk ready at the running hashes. */
export function allReady(): TwinLoad {
  const hashes = runningHashes();
  const topics = Object.fromEntries(Object.keys(hashes.topics).map((id) => [id, { ready: true } as ReadyEntry]));
  return twinWith(readinessText({ topics, freeTalk: { ready: true } }, hashes));
}

interface PackPiece {
  id: string;
  topic: string;
  files: string[];
  lead: string | null;
}

/**
 * The room's pieces as the committed pack names them (config/room-topics.yaml's selectables), by their place in the
 * data, so no test holds an ID that only the room's data defines (spec 004, FR-007: its scan reads these tests).
 * - lead: the piece with a lead; leadless: the other piece of its topic;
 * - second and third: the first pieces of the next two topics, in the data's order.
 */
export const ROOM = ((): { lead: PackPiece; leadless: PackPiece; second: PackPiece; third: PackPiece } => {
  const { selectables } = JSON.parse(committed("corpus.json")) as { selectables: PackPiece[] };
  const lead = selectables.find((s) => s.lead !== null);
  const leadless = selectables.find((s) => s.topic === lead?.topic && s.lead === null);
  const others = selectables.filter((s) => s.topic !== lead?.topic);
  const second = others[0];
  const third = others.find((s) => s.topic !== second?.topic);
  if (!lead || !leadless || !second || !third) throw new Error("the committed pack's selectables changed shape");
  return { lead, leadless, second, third };
})();

/** A corpus file's short name, as the prompt's delimiter lines write it: `NN-<topic>` for `corpus/NN-<topic>.md`. */
export const short = (file: string): string => file.replace(/^corpus\//, "").replace(/\.md$/, "");
