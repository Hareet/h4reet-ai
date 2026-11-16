// T-B03 (spec 029; FR-014a; plan.md §R-B4; B0 §5; rv-spec-029's S-4): one rule, two readers. build/room/readiness.ts
// exports readinessReasons, each entry's reason (ready; not in the readiness file; not marked ready; pack hash changed;
// prompt hash changed, in the order the rule tests them) or the whole-file reason that closes everything (the pack,
// the prompt, or the fixed lines missing or unusable; the readiness file missing or unparsable), and twinReadiness is
// its projection, its answers unchanged. The room report's readiness section says how many of the twin's topics, and
// whether free talk, are ready, and why each closed one is, from readinessReasons alone. So a regenerated pack that
// closes the twin shows in the Author's terminal, not first in the room.
// Fixture trees overlay the repository's tree, as test/room/manifest-readiness.test.ts does: one per reason. On the
// repository's own tree the report agrees with the rule and gives each closed one its reason, whatever the Author's
// file marks today (at f411d8e1: the three topics' pack hashes changed, free talk not marked ready; impl-b.md pastes
// it), so the test doesn't break when he re-marks it. The section sits after the existing ones, before the findings,
// which end the report. rework-029b's T-B03 rewrote impl-029b's file for S-4, test-first.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../../build/content";
import {
  LINES_FILE,
  PACK_FILE,
  PROMPT_FILE,
  READINESS_PATH,
  promptHash,
  readinessReasons,
  twinReadiness,
} from "../../build/room/readiness";
import type { ReadinessReasons } from "../../build/room/readiness";
import { compose } from "../../build/room/compose";
import { run } from "../../build/room/cli";
import { readRoomPolicy } from "../../build/room/policy";
import { readinessLines } from "../../build/room/report";
import { fileTree, overlayTree } from "../../build/room/source";
import { canonicalHash } from "../../build/twin-pack";
import { repositoryBundle } from "../helpers/room";

const text = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");
const PACK_TEXT = text(PACK_FILE);
const pack = JSON.parse(PACK_TEXT) as { topics: { id: string; sha256: string }[]; sha256: string };
const PROMPT = promptHash(text(PROMPT_FILE), text(LINES_FILE));
const other = (word: string): string => canonicalHash({ other: word });
const IDS = pack.topics.map((t) => t.id);
const N = IDS.length;
const HEADING = "### The twin's readiness (spec 029, FR-014a)";
const policy = () => readRoomPolicy({ env: process.env, root: REPO_ROOT });
/** The report's section for a tree's reasons. */
const section = (t: Pick<ReturnType<typeof fileTree>, "read">): string[] => readinessLines(readinessReasons(t));

type Mark = "ready" | "pack" | "prompt" | "both" | "unmarked" | "absent";

/** A readiness file over the tree's running hashes: each topic and free talk ready, or changed, unmarked, or left
 *  out as asked (free talk can't be left out: the file's schema needs it). */
function readinessYaml(marks: Partial<Record<string, Mark>> = {}): string {
  const entry = (mark: Mark, hash: string): string =>
    mark === "unmarked"
      ? "{ ready: false }"
      : `{ ready: true, pack_sha256: "${mark === "pack" || mark === "both" ? other("pack") : hash}", prompt_sha256: "${mark === "prompt" || mark === "both" ? other("prompt") : PROMPT}", evidence: [evals/product/history/x.json] }`;
  const topics = pack.topics
    .filter((t) => marks[t.id] !== "absent")
    .map((t) => `  ${t.id}: ${entry(marks[t.id] ?? "ready", t.sha256)}\n`)
    .join("");
  return `schema: 1\nthresholds: { safety: 1.0, golden: 0.90 }\ntopics:\n${topics}free_talk: ${entry(marks.free_talk ?? "ready", pack.sha256)}\n`;
}

/** The repository's tree with these files replaced (null: removed); the readiness file all ready unless given. */
const tree = (files: Record<string, string | null> = {}) =>
  overlayTree(
    fileTree(REPO_ROOT),
    new Map(
      Object.entries({ [READINESS_PATH]: readinessYaml(), ...files }).map(([path, body]) => [
        path,
        body === null ? null : new TextEncoder().encode(body),
      ]),
    ),
  );

/** twinReadiness's booleans, read off readinessReasons. */
const projected = (r: ReadinessReasons) =>
  r.kind === "closed"
    ? { topics: new Map<string, boolean>(), freeTalk: false }
    : { topics: new Map([...r.topics].map(([id, why]) => [id, why === "ready"])), freeTalk: r.freeTalk === "ready" };

/** The rule's two readers agree on a tree. */
function expectOneRule(t: ReturnType<typeof tree>): ReadinessReasons {
  const reasons = readinessReasons(t);
  const r = twinReadiness(t);
  expect({ topics: new Map(r.topics), freeTalk: r.freeTalk }).toEqual(projected(reasons));
  return reasons;
}

const countLine = (ready: number, freeTalk: boolean): string =>
  `${ready} of ${N} topics ready; free talk ${freeTalk ? "ready" : "closed"}.`;

/** The entries' reasons: every topic `ready` but those named. */
const entriesOf = (
  topics: Record<string, string> = {},
  freeTalk = "ready",
): { kind: "entries"; topics: Map<string, string>; freeTalk: string } => ({
  kind: "entries",
  topics: new Map(IDS.map((id) => [id, topics[id] ?? "ready"])),
  freeTalk,
});

describe("readinessReasons, the build's one readiness rule (FR-014a; S-4)", () => {
  it("has the pack's topics to count", () => {
    expect(N).toBeGreaterThan(1);
  });

  it("gives every topic and free talk `ready` when the file marks the running hashes", () => {
    expect(expectOneRule(tree())).toEqual(entriesOf());
  });

  it("gives each entry its reason, in the order the rule tests them", () => {
    const [a, b, c] = IDS;
    if (a === undefined || b === undefined || c === undefined) throw new Error("the pack has fewer than 3 topics");
    for (const [marks, reasons, freeTalk] of [
      [{ [a]: "absent" }, { [a]: "not in the readiness file" }, "ready"],
      [{ [a]: "unmarked" }, { [a]: "not marked ready" }, "ready"],
      [{ [a]: "pack" }, { [a]: "pack hash changed" }, "ready"],
      [{ [b]: "prompt" }, { [b]: "prompt hash changed" }, "ready"],
      // Both changed: the pack's test comes first.
      [{ [c]: "both" }, { [c]: "pack hash changed" }, "ready"],
      [{ free_talk: "unmarked" }, {}, "not marked ready"],
      [{ free_talk: "pack" }, {}, "pack hash changed"],
      [{ free_talk: "prompt", [a]: "unmarked" }, { [a]: "not marked ready" }, "prompt hash changed"],
    ] as const) {
      const r = expectOneRule(tree({ [READINESS_PATH]: readinessYaml(marks) }));
      expect(r, JSON.stringify(marks)).toEqual(entriesOf(reasons, freeTalk));
    }
  });

  it("gives the whole-file reason that closes everything", () => {
    const broken = JSON.stringify({ ...(JSON.parse(PACK_TEXT) as object), sha256: other("whole") });
    for (const [files, reason] of [
      [{ [PACK_FILE]: null }, "pack missing or unusable"],
      [{ [PACK_FILE]: broken }, "pack missing or unusable"],
      [{ [PACK_FILE]: "{ not json" }, "pack missing or unusable"],
      [{ [PROMPT_FILE]: null }, "prompt missing or unusable"],
      [{ [PROMPT_FILE]: "A prompt with none of the gateway's sections.\n" }, "prompt missing or unusable"],
      [{ [LINES_FILE]: null }, "lines missing or unusable"],
      [{ [LINES_FILE]: "schema: 1\nlines: { withheld: x }\n" }, "lines missing or unusable"],
      [{ [READINESS_PATH]: null }, "readiness file missing"],
      [{ [READINESS_PATH]: "schema: 2\n" }, "readiness file unparsable"],
      [{ [READINESS_PATH]: ": : not yaml [" }, "readiness file unparsable"],
    ] as const) {
      const r = expectOneRule(tree(files));
      // The file that closes everything comes with its reason, so the report names it without a path of its own.
      expect(r, JSON.stringify(Object.keys(files))).toEqual({ kind: "closed", reason, file: Object.keys(files)[0] });
    }
  });
});

describe("the room report's readiness section (FR-014a)", () => {
  it("says every topic and free talk are ready, with no line for a closed one, when the file marks the running hashes", () => {
    expect(section(tree())).toEqual([HEADING, "", countLine(N, true)]);
  });

  it("names each closed topic and free talk with its reason, and only them", () => {
    const [a, b, c] = IDS;
    const t = tree({
      [READINESS_PATH]: readinessYaml({
        [a ?? ""]: "pack",
        [b ?? ""]: "absent",
        [c ?? ""]: "prompt",
        free_talk: "unmarked",
      }),
    });
    expect(section(t)).toEqual([
      HEADING,
      "",
      countLine(N - 3, false),
      "",
      `- \`${a}\`: closed, pack hash changed.`,
      `- \`${b}\`: closed, not in the readiness file.`,
      `- \`${c}\`: closed, prompt hash changed.`,
      "- free talk: closed, not marked ready.",
    ]);
  });

  it("says what closes everything, in one line, for each whole-file reason", () => {
    for (const [files, line] of [
      [{ [PACK_FILE]: null }, `Nothing is ready: pack missing or unusable (\`${PACK_FILE}\`).`],
      [{ [PROMPT_FILE]: null }, `Nothing is ready: prompt missing or unusable (\`${PROMPT_FILE}\`).`],
      [{ [LINES_FILE]: null }, `Nothing is ready: lines missing or unusable (\`${LINES_FILE}\`).`],
      [{ [READINESS_PATH]: null }, `Nothing is ready: readiness file missing (\`${READINESS_PATH}\`).`],
      [{ [READINESS_PATH]: "schema: 2\n" }, `Nothing is ready: readiness file unparsable (\`${READINESS_PATH}\`).`],
    ] as const)
      expect(section(tree(files))).toEqual([HEADING, "", "No topic ready; free talk closed.", "", line]);
  });

  it("agrees with the build's rule on the repository's own tree, and gives each closed one its reason", () => {
    const t = fileTree(REPO_ROOT);
    const reasons = expectOneRule(t);
    const lines = readinessLines(reasons);
    if (reasons.kind === "closed") {
      expect(lines).toEqual([
        HEADING,
        "",
        "No topic ready; free talk closed.",
        "",
        expect.stringContaining(reasons.reason),
      ]);
      return;
    }
    const closed = [...reasons.topics].filter(([, why]) => why !== "ready");
    expect(lines.slice(0, 3)).toEqual([HEADING, "", countLine(N - closed.length, reasons.freeTalk === "ready")]);
    expect(lines.filter((l) => l.startsWith("- "))).toEqual([
      ...closed.map(([id, why]) => `- \`${id}\`: closed, ${why}.`),
      ...(reasons.freeTalk === "ready" ? [] : [`- free talk: closed, ${reasons.freeTalk}.`]),
    ]);
  });

  it("sits in the room report after the existing sections, before the findings, when the caller hands the reasons in", () => {
    const t = fileTree(REPO_ROOT);
    const reasons = readinessReasons(fileTree(REPO_ROOT));
    const md = compose(t, policy(), { mode: "strict", drafts: false, readinessReasons: reasons }).report.markdown;
    const at = md.indexOf(`\n${HEADING}\n`);
    expect(at).toBeGreaterThan(md.indexOf("Walking (spec 008"));
    expect(at).toBeLessThan(md.lastIndexOf("\nFindings:"));
    expect(md).toContain(`\n${readinessLines(reasons).join("\n")}\n`);
    // The compositor's own reads stay the room's data (ComposeOptions.readiness; contracts/room-data-files.md §1):
    // the twin's files are read by the caller, never through the compositor's tree. (config/twin-readiness.yaml is
    // read there already, as a session hint's source, which test/room/data-only.test.ts allows; the pack, the prompt,
    // and the fixed lines aren't.)
    expect(t.log.filter((path) => path.startsWith("config/twin/"))).toEqual([]);
  });

  it("has no readiness section where no reasons were handed in, as the room's bundle composes", () => {
    expect(repositoryBundle().report.markdown).not.toContain(HEADING);
  });

  it("is in room:report's output, the reasons read from the repository's tree by the command", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(["report"], {
      root: REPO_ROOT,
      cwd: REPO_ROOT,
      env: process.env,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
    expect(code, err.join("\n")).toBe(0);
    expect(`${out.join("\n")}\n`).toContain(`\n${section(fileTree(REPO_ROOT)).join("\n")}\n`);
  });

  it("reads no file of its own: the report's module takes the rule's reasons, not the files' paths or hashes", () => {
    const source = readFileSync(join(REPO_ROOT, "apps/web/build/room/report.ts"), "utf8");
    for (const name of ["READINESS_PATH", "PACK_FILE", "PROMPT_FILE", "LINES_FILE", "promptHash", "twinReadiness"])
      expect(source, name).not.toMatch(new RegExp(`\\b${name}\\b`));
  });
});
