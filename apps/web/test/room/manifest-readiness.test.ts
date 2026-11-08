// T036 (spec 007; FR-030, FR-037, SC-009; plan §6, departure D3; spec 002's T066): the room's build reads the twin's
// readiness by the gateway's rule: a topic, or free talk, is ready only while config/twin-readiness.yaml says so and
// both its hashes equal the tree's pack's and prompt's. The compositor writes each topic's `ready` into the index and
// each talk object's into room-manifest.json, and the manifest's `free_talk.ready`; nothing is ready while the
// readiness file, the pack, or the prompt is missing or invalid, and the build still succeeds. Every row of the shared
// matrix (services/gateway/test/fixtures/twin-readiness-matrix.json) agrees with the gateway's, and the prompt hash is
// pinned by the matrix's prefix.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../../build/content";
import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { READINESS_PATH, promptHash, talkLimits, twinReadiness } from "../../build/room/readiness";
import { fileTree, overlayTree } from "../../build/room/source";
import { canonicalHash } from "../../build/twin-pack";

interface Entry {
  ready: boolean;
  pack?: "running" | "other";
  prompt?: "running" | "other";
}
interface Matrix {
  texts: { "prompt.md": string; "lines.yaml": string };
  prompt_sha_prefix: string;
  rows: {
    name: string;
    file?: { topics: Record<string, Entry>; free_talk: Entry } | null;
    raw?: string;
    expect: Record<string, boolean>;
  }[];
}

const MATRIX = JSON.parse(
  readFileSync(join(REPO_ROOT, "services/gateway/test/fixtures/twin-readiness-matrix.json"), "utf8"),
) as Matrix;

const text = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");
const pack = JSON.parse(text("config/twin/corpus.json")) as {
  topics: { id: string; sha256: string }[];
  sha256: string;
};
const running = {
  topics: Object.fromEntries(pack.topics.map((t) => [t.id, t.sha256])),
  whole: pack.sha256,
  prompt: promptHash(text("config/twin/prompt.md"), text("config/twin/lines.yaml")),
};
const other = (word: string): string => canonicalHash({ other: word });

function readinessYaml(file: { topics: Record<string, Entry>; free_talk: Entry }): string {
  const entry = (e: Entry, hash: string): string =>
    e.ready
      ? `{ ready: true, pack_sha256: "${e.pack === "other" ? other("pack") : hash}", prompt_sha256: "${e.prompt === "other" ? other("prompt") : running.prompt}", evidence: [evals/product/history/x.json] }`
      : "{ ready: false }";
  const topics = Object.entries(file.topics).map(
    ([id, e]) => `  ${id}: ${entry(e, running.topics[id] ?? other(id))}\n`,
  );
  return `schema: 1\nthresholds: { safety: 1.0, golden: 0.90 }\n${topics.length === 0 ? "topics: {}\n" : `topics:\n${topics.join("")}`}free_talk: ${entry(file.free_talk, running.whole)}\n`;
}

const tree = (changes: Record<string, string | null>) =>
  overlayTree(
    fileTree(REPO_ROOT),
    new Map(Object.entries(changes).map(([p, v]) => [p, v === null ? null : new TextEncoder().encode(v)])),
  );

describe("the room's readiness (FR-030, FR-037)", () => {
  it("pins the prompt hash: the matrix's texts hash to its prefix here, as in the gateway", () => {
    expect(promptHash(MATRIX.texts["prompt.md"], MATRIX.texts["lines.yaml"]).slice(0, 12)).toBe(
      MATRIX.prompt_sha_prefix,
    );
  });

  for (const row of MATRIX.rows) {
    it(`agrees with the shared matrix: ${row.name}`, () => {
      const file = row.raw ?? (row.file === null || row.file === undefined ? null : readinessYaml(row.file));
      const r = twinReadiness(tree({ [READINESS_PATH]: file }));
      for (const [topic, want] of Object.entries(row.expect)) {
        const got = topic === "free_talk" ? r.freeTalk : (r.topics.get(topic) ?? false);
        expect(got, `${row.name}: ${topic}`).toBe(want);
      }
    });
  }

  it("makes nothing ready while the pack or the prompt is missing or invalid", () => {
    const all = readinessYaml({
      topics: Object.fromEntries(Object.keys(running.topics).map((id) => [id, { ready: true }])),
      free_talk: { ready: true },
    });
    expect(twinReadiness(tree({ [READINESS_PATH]: all })).freeTalk).toBe(true);
    for (const broken of [
      { "config/twin/corpus.json": null },
      { "config/twin/corpus.json": "{}" },
      { "config/twin/prompt.md": null },
      { "config/twin/prompt.md": "# no marker\n" },
      { "config/twin/lines.yaml": "nope: 1\n" },
    ]) {
      const r = twinReadiness(tree({ [READINESS_PATH]: all, ...broken }));
      expect(r.freeTalk, JSON.stringify(broken)).toBe(false);
      expect([...r.topics.values()].some(Boolean), JSON.stringify(broken)).toBe(false);
    }
  });

  it("writes each topic's readiness into the index and the manifest, and free talk's, and still builds without the file", () => {
    // The pack's first topic opened, its second not: each named by the data, never here (spec 004, FR-007).
    const [first, second] = pack.topics.map((t) => t.id);
    const ready = readinessYaml({ topics: { [first ?? ""]: { ready: true } }, free_talk: { ready: true } });
    const openTree = tree({ [READINESS_PATH]: ready });
    // The build hands the readiness it read to the compositor (departure D3), as build/room/plugin.ts does.
    const opened = compose(openTree, noPolicy(), {
      mode: "lenient",
      drafts: false,
      readiness: twinReadiness(openTree),
    });
    expect(opened.index.topics.find((t) => t.id === first)?.ready).toBe(true);
    expect(opened.index.topics.find((t) => t.id === second)?.ready).toBe(false);
    for (const o of opened.manifest.objects) {
      if (o.topic === first) expect(o.ready, o.id).toBe(true);
      else if (o.topic !== null) expect(o.ready, o.id).toBe(false);
    }
    expect(opened.manifest.free_talk).toEqual({ ready: true });
    const closedTree = tree({ [READINESS_PATH]: null });
    const closed = compose(closedTree, noPolicy(), {
      mode: "lenient",
      drafts: false,
      readiness: twinReadiness(closedTree),
    });
    expect(closed.index.topics.every((t) => !t.ready)).toBe(true);
    expect(closed.manifest.free_talk).toEqual({ ready: false });
  });

  it("carries config/budgets.yaml's limits.twin to the room, or FR-027's defaults", () => {
    expect(talkLimits(tree({ "config/budgets.yaml": "schema: 1\n" }))).toEqual({
      turnMaxChars: 600,
      historyMaxTurns: 8,
      historyMaxChars: 4_000,
    });
    const set =
      "limits:\n  twin: { turn_max_chars: 400, history_max_turns: 6, history_max_chars: 3000, max_input_chars: 32000, max_output_tokens: 300 }\n";
    expect(talkLimits(tree({ "config/budgets.yaml": set }))).toEqual({
      turnMaxChars: 400,
      historyMaxTurns: 6,
      historyMaxChars: 3_000,
    });
  });
});
