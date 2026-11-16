// T-B03 (spec 029; FR-014a; plan.md §R-B4; B0 §5): the room report says how many of the twin's topics, and whether
// free talk, are ready, by the build's own rule (build/room/readiness.ts's twinReadiness, read, not changed), and for
// each one closed, why: not marked ready, its pack hash changed, its prompt hash changed. So a regenerated pack that
// closes the twin shows in the Author's terminal, not first in the room. Fixture trees overlay a readiness file on the
// repository's tree, as test/room/manifest-readiness.test.ts does: all ready; one topic's pack hash changed; one
// topic's prompt hash changed; free talk not marked; the readiness file missing. On the repository's own tree the
// report agrees with the rule and gives each closed one a reason, whatever the Author's file marks today (at f411d8e1:
// the three topics' pack hashes changed, free talk not marked; impl-b.md pastes it), so the test doesn't break when he
// re-marks it. The section sits after the existing ones, before the findings, which end the report.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../../build/content";
import { READINESS_PATH, promptHash, twinReadiness } from "../../build/room/readiness";
import { readinessLines } from "../../build/room/report";
import { fileTree, overlayTree } from "../../build/room/source";
import { canonicalHash } from "../../build/twin-pack";
import { repositoryBundle } from "../helpers/room";

const text = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");
const pack = JSON.parse(text("config/twin/corpus.json")) as {
  topics: { id: string; sha256: string }[];
  sha256: string;
};
const PROMPT = promptHash(text("config/twin/prompt.md"), text("config/twin/lines.yaml"));
const other = (word: string): string => canonicalHash({ other: word });
const IDS = pack.topics.map((t) => t.id);
const N = IDS.length;
const HEADING = "### The twin's readiness (spec 029, FR-014a)";

type Mark = "ready" | "pack" | "prompt" | "both" | "unmarked";

/** A readiness file over the tree's running hashes: each topic and free talk ready, or changed or unmarked as asked. */
function readinessYaml(marks: Partial<Record<string, Mark>> = {}): string {
  const entry = (mark: Mark, hash: string): string =>
    mark === "unmarked"
      ? "{ ready: false }"
      : `{ ready: true, pack_sha256: "${mark === "pack" || mark === "both" ? other("pack") : hash}", prompt_sha256: "${mark === "prompt" || mark === "both" ? other("prompt") : PROMPT}", evidence: [evals/product/history/x.json] }`;
  const topics = pack.topics.map((t) => `  ${t.id}: ${entry(marks[t.id] ?? "ready", t.sha256)}\n`).join("");
  return `schema: 1\nthresholds: { safety: 1.0, golden: 0.90 }\ntopics:\n${topics}free_talk: ${entry(marks.free_talk ?? "ready", pack.sha256)}\n`;
}

const tree = (readiness: string | null) =>
  overlayTree(
    fileTree(REPO_ROOT),
    new Map([[READINESS_PATH, readiness === null ? null : new TextEncoder().encode(readiness)]]),
  );

/** The count line: "N of M topics ready; free talk ready|closed." */
const countLine = (ready: number, freeTalk: boolean): string =>
  `${ready} of ${N} topics ready; free talk ${freeTalk ? "ready" : "closed"}.`;

describe("the room report's readiness section (FR-014a)", () => {
  it("has the pack's topics to count", () => {
    expect(N).toBeGreaterThan(1);
  });

  it("says every topic and free talk are ready, with no line for a closed one, when the file marks the running hashes", () => {
    const t = tree(readinessYaml());
    const r = twinReadiness(t);
    expect([...r.topics.values()].every(Boolean) && r.freeTalk).toBe(true);
    expect(readinessLines(t)).toEqual([HEADING, "", countLine(N, true)]);
  });

  it("names a topic whose pack hash changed, and only it", () => {
    const [first] = IDS;
    const t = tree(readinessYaml({ [first ?? ""]: "pack" }));
    expect(twinReadiness(t).topics.get(first ?? "")).toBe(false);
    expect(readinessLines(t)).toEqual([
      HEADING,
      "",
      countLine(N - 1, true),
      "",
      `- \`${first}\`: closed, pack hash changed.`,
    ]);
  });

  it("names a topic whose prompt hash changed, and one with both", () => {
    const [first, second] = IDS;
    const t = tree(readinessYaml({ [first ?? ""]: "prompt", [second ?? ""]: "both" }));
    expect(readinessLines(t)).toEqual([
      HEADING,
      "",
      countLine(N - 2, true),
      "",
      `- \`${first}\`: closed, prompt hash changed.`,
      `- \`${second}\`: closed, pack hash changed, prompt hash changed.`,
    ]);
  });

  it("says free talk is closed and why when the file doesn't mark it", () => {
    const t = tree(readinessYaml({ free_talk: "unmarked" }));
    expect(twinReadiness(t).freeTalk).toBe(false);
    expect(readinessLines(t)).toEqual([HEADING, "", countLine(N, false), "", "- free talk: closed, not marked ready."]);
  });

  it("names the pack's hash for free talk, and a topic not marked", () => {
    const [first] = IDS;
    const t = tree(readinessYaml({ [first ?? ""]: "unmarked", free_talk: "pack" }));
    expect(readinessLines(t)).toEqual([
      HEADING,
      "",
      countLine(N - 1, false),
      "",
      `- \`${first}\`: closed, not marked ready.`,
      "- free talk: closed, pack hash changed.",
    ]);
  });

  it("says the readiness file is missing, and closes everything, when it is", () => {
    const t = tree(null);
    expect(readinessLines(t)).toEqual([
      HEADING,
      "",
      countLine(0, false),
      `Nothing is ready: \`${READINESS_PATH}\` is missing.`,
      "",
      ...IDS.map((id) => `- \`${id}\`: closed, not marked ready.`),
      "- free talk: closed, not marked ready.",
    ]);
  });

  it("agrees with the build's rule on the repository's own tree, and gives each closed one a reason", () => {
    const t = fileTree(REPO_ROOT);
    const r = twinReadiness(t);
    const lines = readinessLines(t);
    const ready = IDS.filter((id) => r.topics.get(id) === true).length;
    expect(lines.slice(0, 3)).toEqual([HEADING, "", countLine(ready, r.freeTalk)]);
    const closed = lines.filter((l) => l.startsWith("- "));
    expect(closed.map((l) => /^- (`[^`]+`|free talk): closed, /.exec(l)?.[1])).toEqual([
      ...IDS.filter((id) => r.topics.get(id) !== true).map((id) => `\`${id}\``),
      ...(r.freeTalk ? [] : ["free talk"]),
    ]);
    for (const l of closed)
      expect(l, l).toMatch(
        /: closed, (not marked ready|pack hash changed|prompt hash changed)(, prompt hash changed)?\.$/,
      );
  });

  it("sits in the room report after the existing sections, before the findings", () => {
    const md = repositoryBundle().report.markdown;
    const at = md.indexOf(`\n${HEADING}\n`);
    expect(at).toBeGreaterThan(md.indexOf("Walking (spec 008"));
    expect(at).toBeLessThan(md.lastIndexOf("\nFindings:"));
    expect(md).toContain(`\n${readinessLines(fileTree(REPO_ROOT)).join("\n")}\n`);
  });
});
