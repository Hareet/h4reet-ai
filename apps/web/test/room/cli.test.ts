// T083's command line (spec 004; FR-007, FR-013, FR-014, FR-073; R-08, R-14; contracts/room-bundle.md §12, §13;
// contracts/room-data-files.md §14 to §16; contracts/plain-model-fit.md §10): build/room/cli.ts's `run`, over
// repositories made in temporary folders from the fixture set, never over this repository's config/ or docs/studio/.
// - `generate` composes as a release build in lenient mode and writes §7 to §9's files, the events and topics files,
//   the photo guide, and a work order per piece, exactly as compose() makes them, removing a work order whose piece is
//   gone; on a finding lenient mode doesn't tolerate it prints every finding and writes nothing, and it never writes
//   through a link;
// - `check` composes in strict mode, with drafts, and holds the generated files fresh (§13): a stale file by the number
//   of its first differing line, never its text, a missing one, and an orphaned work order; it prints every finding
//   and `room: <n> findings in <m> files`, and exits 1 on any;
// - `report` prints FR-073's report and exits 0; `scan` prints the source scan's hits and exits 1 on any;
// - `fit <glb> --piece <id>` judges one GLB in the tree against one catalog entry, printing its RX and RK2 findings,
//   the compose's own for a catalog model, and its measures, reading the file in place; it exits 1 on any finding.
// A usage error, a path outside the tree, and a policy that can't be read exit 2.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { fitInput } from "../../build/room/checks/rx";
import { run } from "../../build/room/cli";
import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { loadRoom, namespaceIds } from "../../build/room/load";
import { CAPS_DEFAULTS, noPolicy } from "../../build/room/policy";
import { fileTree } from "../../build/room/source";
import { fit } from "../../src/room/glb/fit";
import { gzipBytes } from "../../src/room/glb/gzip";
import { count } from "../../src/room/glb/rules";
import { badCases, goodFiles, goodTree } from "../helpers/room-fixtures";
import type { BadCase } from "../helpers/room-fixtures";
import { catalogEntry, cleanModel } from "../helpers/room-models";

const GENERATE = "npm run room:generate -w apps/web";
const DESK = "assets/room/fx-desk.glb";
const ORPHAN = "docs/studio/work-orders/fx-gone.md";
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/** Files written under `root` by repository path, a null one removed. */
function write(root: string, files: Iterable<readonly [string, string | Uint8Array | null]>): void {
  for (const [path, data] of files) {
    const full = join(root, path);
    if (data === null) rmSync(full, { recursive: true, force: true });
    else {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, data);
    }
  }
}

/** Every file under `dir`, by its path from `dir`, with its SHA-256. */
function snapshot(dir: string, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) for (const [p, h] of snapshot(full, rel)) out.set(p, h);
    else out.set(rel, sha256(readFileSync(full)));
  }
  return out;
}

/** A repository in a new folder: the known-good set, with `changes` over it. */
function repository(changes: Iterable<readonly [string, string | Uint8Array | null]> = []): string {
  const root = temp("room-cli-");
  write(root, goodFiles());
  write(root, changes);
  return root;
}

/** The known-bad case of a rule, by its folder's name. */
function badCase(name: string): BadCase {
  const found = badCases().find((c) => c.name === name);
  if (!found) throw new Error(`no known-bad case ${name}`);
  return found;
}

interface Ran {
  readonly code: number;
  readonly out: readonly string[];
  readonly err: readonly string[];
}

/** The command line over `root`, run from `cwd` (the root by default) with no policy directory, as a temporary
 *  repository without a .git has it: main's policy is the export's own copy, here none. */
async function cli(root: string, args: readonly string[], cwd = root, env = { ROOM_POLICY_DIR: "" }): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, { root, cwd, env, out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
}

/** A finding no compose makes, in place of one a test expected and didn't find. */
const noFinding = { rule: "none", file: "-", path: "-", reason: "no such finding", lenient: false };

/** The compose a command makes over `root` with no policy. */
const composed = (root: string, mode: "strict" | "lenient", drafts: boolean): ComposeResult =>
  compose(fileTree(root), noPolicy(), { mode, drafts });

describe("generate (contracts/room-bundle.md §7 to §9, §12)", () => {
  it("writes the events and topics files, the photo guide, and each work order as compose() makes them", async () => {
    const root = repository([
      [ORPHAN, "# Work order: a piece that's gone\n"],
      ["config/room-events.yaml", "schema: 1\n"],
    ]);
    const generated = composed(root, "lenient", false).generated;
    expect(generated.map((g) => g.path)).toEqual([
      "config/room-events.yaml",
      "config/room-topics.yaml",
      "docs/studio/photo-guide.md",
      ...namespaceIds(loadRoom(goodTree()))
        .pieces.map((p) => `docs/studio/work-orders/${p}.md`)
        .sort(),
    ]);
    const before = snapshot(root);
    const { code, out, err } = await cli(root, ["generate"]);
    expect([code, err]).toEqual([0, []]);
    for (const g of generated) expect(readFileSync(join(root, g.path), "utf8"), g.path).toBe(g.text);
    // Only the generated files changed, and the orphaned work order went.
    const after = snapshot(root);
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((p) => before.get(p) !== after.get(p));
    expect(changed.sort()).toEqual([...generated.map((g) => g.path), ORPHAN].sort());
    expect(out).toEqual([
      ...generated.map((g) => `wrote ${g.path}`),
      `removed ${ORPHAN}`,
      `room: ${generated.length} written, 1 removed, 0 unchanged`,
    ]);
    expect(await cli(root, ["generate"])).toEqual({
      code: 0,
      out: [`room: 0 written, 0 removed, ${generated.length} unchanged`],
      err: [],
    });
  });

  it("writes nothing on a finding lenient mode doesn't tolerate, printing every finding, and exits 1", async () => {
    const root = repository([...badCase("RI4").changes, [ORPHAN, "# Work order: a piece that's gone\n"]]);
    const findings = composed(root, "lenient", false).findings;
    expect(findings.some((f) => !f.lenient)).toBe(true);
    const before = snapshot(root);
    const { code, out } = await cli(root, ["generate"]);
    expect(code).toBe(1);
    expect(snapshot(root)).toEqual(before);
    const files = new Set(findings.map((f) => f.file)).size;
    expect(out).toEqual([
      ...findings.map((f) => formatFinding(f, "lenient")),
      `room: ${findings.length} finding${findings.length === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"}`,
      "room: nothing written: lenient mode tolerates only RX and RK2 findings",
    ]);
  });

  it("writes on a finding lenient mode tolerates, printing it as a warning", async () => {
    const root = repository(badCase("RX7").changes);
    const result = composed(root, "lenient", false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => f.lenient)).toBe(true);
    const { code, out } = await cli(root, ["generate"]);
    expect(code).toBe(0);
    expect(out.slice(0, result.findings.length)).toEqual(result.findings.map((f) => formatFinding(f, "lenient")));
    for (const line of out.slice(0, result.findings.length)) expect(line).toMatch(/^warn RX/);
    for (const g of result.generated) expect(readFileSync(join(root, g.path), "utf8")).toBe(g.text);
  });

  it("writes nothing through a link, and exits 2", async () => {
    const root = repository();
    const elsewhere = temp("room-cli-elsewhere-");
    symlinkSync(elsewhere, join(root, "docs"));
    const { code, out, err } = await cli(root, ["generate"]);
    expect(code).toBe(2);
    expect(readdirSync(elsewhere)).toEqual([]);
    expect(existsSync(join(root, "config"))).toBe(false);
    expect(out).toEqual([]);
    expect(err).toContain("room: docs/studio/photo-guide.md is reached through a link, or isn't a regular file");
    expect(err.at(-1)).toBe("room: nothing written");
  });
});

describe("check (contracts/room-bundle.md §12, §13; contracts/room-data-files.md §14)", () => {
  it("passes a tree with no finding whose generated files are fresh", async () => {
    const root = repository();
    expect((await cli(root, ["generate"])).code).toBe(0);
    expect(await cli(root, ["check"])).toEqual({ code: 0, out: ["room: 0 findings in 0 files"], err: [] });
  });

  it("composes in strict mode with drafts: prints every finding and `room: <n> findings in <m> files`, exit 1", async () => {
    const root = repository();
    expect((await cli(root, ["generate"])).code).toBe(0);
    // RT9 runs in strict mode alone, so generate's lenient compose writes on, and the generated files stay fresh.
    write(root, badCase("RT9").changes);
    const generated = composed(root, "lenient", false).generated.length;
    expect((await cli(root, ["generate"])).out).toEqual([`room: 0 written, 0 removed, ${generated} unchanged`]);
    const findings = composed(root, "strict", true).findings;
    expect(findings.map((f) => f.rule)).toEqual(["RT9"]);
    expect(await cli(root, ["check"])).toEqual({
      code: 1,
      out: [...findings.map((f) => formatFinding(f, "strict")), "room: 1 finding in 1 file"],
      err: [],
    });
  });

  it("holds the generated files fresh: a stale one by its first differing line, never its text, a missing one, and an orphaned work order", async () => {
    const root = repository();
    expect((await cli(root, ["generate"])).code).toBe(0);
    const topics = readFileSync(join(root, "config/room-topics.yaml"), "utf8").split("\n");
    const lead = topics.findIndex((line) => line.trimStart().startsWith("lead:"));
    expect(lead).toBeGreaterThan(0);
    const fresh = topics[lead]?.trim() ?? "";
    topics[lead] = "    lead: A lead this test made stale";
    const piece = namespaceIds(loadRoom(goodTree())).pieces[0] ?? "";
    write(root, [
      ["config/room-topics.yaml", topics.join("\n")],
      [`docs/studio/work-orders/${piece}.md`, null],
      [ORPHAN, "# Work order: a piece that's gone\n"],
    ]);
    const { code, out } = await cli(root, ["check"]);
    expect(code).toBe(1);
    expect(out).toEqual([
      `FR-013 config/room-topics.yaml:${lead + 1}: stale; ${GENERATE} rewrites it`,
      `FR-013 docs/studio/work-orders/${piece}.md:-: missing; ${GENERATE} writes it`,
      `FR-013 ${ORPHAN}:-: orphaned: no catalog entry has its stem; ${GENERATE} removes it`,
      "room: 3 findings in 3 files",
    ]);
    // Neither side of the stale line is printed: a generated line can hold a string RT2 refused.
    expect(out.join("\n")).not.toContain("made stale");
    expect(fresh).not.toBe("");
    expect(out.join("\n")).not.toContain(fresh);
  });

  it("calls no work order orphaned while its piece's catalog file is there, refused: that file's finding comes first", async () => {
    const root = repository();
    expect((await cli(root, ["generate"])).code).toBe(0);
    const rd4 = badCase("RD4");
    write(root, rd4.changes);
    const order = `docs/studio/work-orders/${rd4.file.slice(rd4.file.lastIndexOf("/") + 1, -".yaml".length)}.md`;
    const checked = await cli(root, ["check"]);
    expect(checked.code).toBe(1);
    expect(checked.out).toContain(
      formatFinding(composed(root, "strict", true).findings.find((f) => f.rule === "RD4") ?? noFinding, "strict"),
    );
    expect(checked.out.filter((line) => line.includes(order))).toEqual([]);
    const generated = await cli(root, ["generate"]);
    expect(generated.code).toBe(1);
    expect(existsSync(join(root, order))).toBe(true);
  });
});

describe("report and scan (contracts/room-bundle.md §10, §12; contracts/room-data-files.md §16)", () => {
  it("report prints FR-073's report of a release build in strict mode, and exits 0, its findings in it", async () => {
    const root = repository(badCase("RI4").changes);
    const report = composed(root, "strict", false).report.markdown;
    expect(report).toContain("RI4 ");
    const { code, out } = await cli(root, ["report"]);
    expect(code).toBe(0);
    expect(`${out.join("\n")}\n`).toBe(report);
  });

  it("scan prints each hit and exits 1, and exits 0 on none", async () => {
    const id = namespaceIds(loadRoom(goodTree())).selectables[0] ?? "";
    expect(id).not.toBe("");
    const root = repository([["apps/web/src/planted.ts", `export const planted = "${id}";\n`]]);
    expect(await cli(root, ["scan"])).toEqual({
      code: 1,
      out: [`FR-007 apps/web/src/planted.ts:1: holds "${id}", which only the room's data defines`, "room: 1 hit"],
      err: [],
    });
    write(root, [["apps/web/src/planted.ts", null]]);
    expect(await cli(root, ["scan"])).toEqual({ code: 0, out: ["room: 0 hits"], err: [] });
  });
});

describe("fit <glb> --piece <id> (contracts/room-bundle.md §12; contracts/plain-model-fit.md §10)", () => {
  /** A clean model of the desk, in place at assets/room/. */
  const deskModel = (): Uint8Array =>
    cleanModel(catalogEntry("fx-desk") as unknown as Parameters<typeof cleanModel>[0]);

  it("prints a clean model's measures beside its budget, and exits 0, reading the file in place", async () => {
    const bytes = deskModel();
    const root = repository([[DESK, bytes]]);
    const entry = loadRoom(goodTree()).catalog.find((c) => c.value.id === "fx-desk");
    if (!entry) throw new Error("no fixture desk");
    const served = gzipBytes(bytes);
    const m = fit(bytes, fitInput(entry.value, CAPS_DEFAULTS), { file: DESK, gzipBytes: served }).measures;
    const b = entry.value.budget;
    const before = snapshot(root);
    expect(await cli(root, ["fit", DESK, "--piece", "fx-desk"])).toEqual({
      code: 0,
      out: [
        `measures: ${count(bytes.length)} bytes · ${count(served)} gzip-9 bytes · ${count(m.triangles ?? 0)} ` +
          `triangles · 0 bytes of texture memory · no texture`,
        "bounds: (-0.6, 0, -0.3) to (0.6, 0.75, 0.3) m",
        `budget: ${count(b.gzip_bytes)} gzip-9 bytes · ${count(b.triangles)} triangles · ${count(b.texture_px)} px ` +
          `a side · ${count(b.texture_bytes)} bytes of texture memory`,
        "room: 0 findings in 0 files",
      ],
      err: [],
    });
    expect(snapshot(root)).toEqual(before);
  });

  it.each(["RX7", "RK2"])(
    "prints the compose's own findings of a catalog model, here %s, and exits 1",
    async (rule) => {
      const root = repository(badCase(rule).changes);
      const findings = composed(root, "strict", false).findings.filter((f) => f.file === DESK);
      expect(findings.map((f) => f.rule)).toContain(rule);
      const { code, out } = await cli(root, ["fit", DESK, "--piece", "fx-desk"]);
      expect(code).toBe(1);
      expect(out.slice(0, findings.length)).toEqual(findings.map((f) => formatFinding(f, "strict")));
      expect(out.at(-1)).toBe(`room: ${findings.length} finding${findings.length === 1 ? "" : "s"} in 1 file`);
    },
  );

  it("finds a missing file unreadable (RX1), and reads a path from the folder npm ran in", async () => {
    const root = repository([[DESK, deskModel()]]);
    expect(await cli(root, ["fit", "assets/room/fx-none.glb", "--piece", "fx-desk"])).toEqual({
      code: 1,
      out: [
        "RX1 assets/room/fx-none.glb:-: the file can't be read",
        "measures: none: the file doesn't read as a GLB",
        expect.stringMatching(/^budget: /),
        "room: 1 finding in 1 file",
      ],
      err: [],
    });
    const fromRoot = await cli(root, ["fit", DESK, "--piece", "fx-desk"]);
    expect(await cli(root, ["fit", "room/fx-desk.glb", "--piece", "fx-desk"], join(root, "assets"))).toEqual(fromRoot);
  });

  it("refuses a file outside the tree, a file that isn't a GLB, and a piece no catalog entry loads, with exit 2", async () => {
    const root = repository([[DESK, deskModel()]]);
    const outside = await cli(root, ["fit", "../fx-desk.glb", "--piece", "fx-desk"]);
    expect([outside.code, outside.out]).toEqual([2, []]);
    expect(outside.err).toEqual([
      "room: ../fx-desk.glb isn't in the repository: room:fit reads files in the tree only",
    ]);
    const card = await cli(root, ["fit", "assets/room/fx-sign.png", "--piece", "fx-sign"]);
    expect([card.code, card.err]).toEqual([2, ["room: room:fit judges a .glb file"]]);
    const unknown = await cli(root, ["fit", DESK, "--piece", "fx-nothing"]);
    expect([unknown.code, unknown.err]).toEqual([
      2,
      ["room: no catalog entry fx-nothing loads; npm run room:check -w apps/web says why"],
    ]);
  });
});

describe("usage, and a policy that can't be read", () => {
  it("exits 2 with the usage on no command, an unknown one, and fit without its GLB or its piece", async () => {
    const root = repository();
    for (const args of [[], ["frobnicate"], ["fit", DESK], ["fit", "--piece", "fx-desk"], ["check", "extra"]]) {
      const { code, out, err } = await cli(root, args);
      expect([code, out], args.join(" ")).toEqual([2, []]);
      expect(err[0]).toMatch(/^usage: /);
    }
  });

  it("exits 2 when main's policy can't be read, saying so", async () => {
    const root = repository();
    const policy = temp("room-cli-policy-");
    write(policy, [["content-approvals.json", "not JSON\n"]]);
    const { code, out, err } = await cli(root, ["check"], root, { ROOM_POLICY_DIR: policy });
    expect([code, out]).toEqual([2, []]);
    expect(err).toEqual([
      expect.stringMatching(/^room: main's policy can't be read: main's assets\/policy\/content-approvals\.json /),
    ]);
  });
});
