// T015's unit part (spec 007; FR-029, FR-030, SC-009; plan §6, R-11): readiness. A topic, or free talk, is ready only
// while its entry says ready and both its hashes equal the running pack's (the topic's, or the whole pack's for free
// talk) and the running prompt's; a changed prompt, fixed line, or topic section closes it at the next start; a missing
// or invalid file makes nothing ready. Every row of the shared matrix, which the room's build reads too
// (apps/web/test/room/manifest-readiness.test.ts), agrees here; and the prompt hash is pinned by its prefix.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { twinFromTexts } from "../../src/config/twin.js";
import { promptHash } from "../../src/twin/hash.js";
import { recompute } from "../../src/twin/pack.js";
import { isReady, parseReadiness, readiness } from "../../src/twin/readiness.js";
import { ROOM, committed, committedTexts, readinessText, runningHashes, twinWith } from "../helpers/twin.js";

interface MatrixEntry {
  ready: boolean;
  pack?: "running" | "other";
  prompt?: "running" | "other";
}
interface Matrix {
  texts: { "prompt.md": string; "lines.yaml": string };
  prompt_sha_prefix: string;
  rows: {
    name: string;
    file?: { topics: Record<string, MatrixEntry>; free_talk: MatrixEntry } | null;
    raw?: string;
    expect: Record<string, boolean>;
  }[];
}

export const MATRIX = JSON.parse(
  readFileSync(new URL("../fixtures/twin-readiness-matrix.json", import.meta.url), "utf8"),
) as Matrix;

/** Each topic's piece, from the pack, and free talk's own feature: the matrix names topics, and the route takes features. */
const FEATURES: Record<string, string> = Object.fromEntries([
  ...[ROOM.lead, ROOM.second, ROOM.third].map((s) => [s.topic, s.id]),
  ["free_talk", "free_talk"],
]);

describe("readiness (FR-030)", () => {
  it("pins the prompt hash: the matrix's texts hash to its prefix here, as in the room's build", () => {
    expect(promptHash(MATRIX.texts["prompt.md"], MATRIX.texts["lines.yaml"]).slice(0, 12)).toBe(
      MATRIX.prompt_sha_prefix,
    );
  });

  for (const row of MATRIX.rows) {
    it(`agrees with the shared matrix: ${row.name}`, () => {
      const text =
        row.raw ??
        (row.file === null || row.file === undefined
          ? null
          : readinessText({ topics: row.file.topics, freeTalk: row.file.free_talk }));
      const twin = twinWith(text);
      expect(twin.available).toBe(true);
      for (const [topic, want] of Object.entries(row.expect)) {
        expect(readiness(twin, FEATURES[topic] ?? topic), `${row.name}: ${topic}`).toBe(want);
      }
    });
  }

  it("closes a topic when the prompt or a fixed line changes, and free talk when any section changes", () => {
    const hashes = runningHashes();
    const text = readinessText(
      {
        topics: { [ROOM.lead.topic]: { ready: true }, [ROOM.third.topic]: { ready: true } },
        freeTalk: { ready: true },
      },
      hashes,
    );
    expect(readiness(twinWith(text), ROOM.lead.id)).toBe(true);
    expect(readiness(twinWith(text), "free_talk")).toBe(true);
    const prompt = `${committed("prompt.md")}\nOne more instruction.\n`;
    expect(readiness(twinWith(text, { prompt }), ROOM.lead.id)).toBe(false);
    const lines = committed("lines.yaml").replace("rather not answer", "rather not say");
    expect(readiness(twinWith(text, { lines }), ROOM.third.id)).toBe(false);
    // A section of another topic's file changes the whole pack's hash, which free talk binds, and not the topic's.
    const pack = JSON.parse(committed("corpus.json")) as { sections: { file: string; text: string }[] };
    const other = pack.sections.find((s) => s.file === "corpus/07-denver-local-ai.md");
    expect(other).toBeDefined();
    if (other) other.text = `${other.text} Changed.`;
    const moved = twinFromTexts({ ...committedTexts(), pack: rehash(pack), readiness: text });
    expect(moved.available).toBe(true);
    expect(readiness(moved, ROOM.lead.id)).toBe(true);
    expect(readiness(moved, "free_talk")).toBe(false);
  });

  it("reads a missing or invalid file as nothing ready, and an entry for no known topic as nothing", () => {
    expect(parseReadiness("")).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      parseReadiness("schema: 1\nthresholds: { safety: 2, golden: 0.9 }\ntopics: {}\nfree_talk: { ready: false }\n"),
    ).toMatchObject({ ok: false, reason: "invalid" });
    const twin = twinWith(readinessText({ topics: { "no-such-topic": { ready: true } } }));
    expect(readiness(twin, ROOM.lead.id)).toBe(false);
    expect(readiness(twin, "no-such-feature")).toBe(false);
    const unavailable = twinWith(null, { pack: null });
    expect(readiness(unavailable, ROOM.lead.id)).toBe(false);
  });

  it("parses thresholds and a ready entry's evidence", () => {
    const load = parseReadiness(readinessText({ topics: { [ROOM.third.topic]: { ready: true } } }));
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    expect(load.file.thresholds).toEqual({ safety: 1, golden: 0.9 });
    const entry = load.file.topics.get(ROOM.third.topic);
    expect(entry?.ready).toBe(true);
    if (entry?.ready) expect(entry.evidence).toEqual(["evals/product/history/x.json"]);
    const twin = twinWith(readinessText({ topics: { [ROOM.third.topic]: { ready: true } } }));
    if (!twin.available) throw new Error("the twin isn't available");
    expect(isReady(load, twin.files, ROOM.third.id)).toBe(true);
  });
});

/** The pack with its hashes recomputed as the builder would, so it still loads after a test changed a section. */
function rehash(pack: unknown): string {
  return JSON.stringify(recompute(pack as Parameters<typeof recompute>[0]));
}
