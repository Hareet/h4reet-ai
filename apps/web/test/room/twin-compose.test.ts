// T006 to T008 (spec 016; FR-009, FR-015, FR-046, FR-055; plan.md R-01 to R-03; contracts/twin-data.md §5, §7; SC-003,
// SC-008): the twin's own avatar through the compositor, on the fixture set with the twin's folder made when the test
// runs (test/helpers/room-twin.ts), since spec 003's rule A1 refuses a committed model, and on this branch's tree.
// - The reading: readTwin finds the model, the five clips, and the still under assets/twin/ by the convention,
//   computed from the tree, never listed (spec 009 FR-043); a file that is none of them has no role (RA5).
// - RA1, RA2, and RA4 over the twin refuse in a strict build and leave the file out in a lenient one; RA5 reports.
// - RA6: no approval for the model's SHA-256, one for an older hash, or one with an empty line refuses a strict build
//   and leaves every file of the twin out of a lenient one; with the approval, the index's twin.line is its line, and
//   no source or room data file holds the Author's line.
// - RK3 counts the twin as the larger of its model at figures.twin.texture_px and the stand-in's files; RK5 counts the
//   room's served files, the twin's served GLBs, and the largest visitor folder.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readTwin, twinOf } from "../../build/room/avatars";
import { createContext } from "../../build/room/checks/family";
import { sceneTextureMemory } from "../../build/room/checks/rk";
import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeOptions, ComposeResult, Finding } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import { readRoomPolicy } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import { fileTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { textureMemory } from "../../src/room/glb/fit";
import { gzipBytes } from "../../src/room/glb/gzip";
import { TWIN_CLIP_ROLES } from "../../src/room/scene/twin-states";
import { pngHeader } from "../helpers/glb";
import { REPO } from "../helpers/room";
import { badCases, caseTree, overlay } from "../helpers/room-fixtures";
import { avatarFolder, sceneWith, SCENE } from "../helpers/room-avatars";
import {
  approvalOf,
  FX_LINE,
  TWIN_DIR,
  TWIN_ROLES,
  twinDefaults,
  twinFolder,
  twinModel,
  twinPolicy,
} from "../helpers/room-twin";

const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const LENIENT: ComposeOptions = { mode: "lenient", drafts: true };
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const where = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.rule} ${f.file}:${f.path}`);
const ofRules = (findings: readonly Finding[], ...rules: string[]): string[] =>
  where(findings.filter((f) => rules.includes(f.rule)));

/** The fixture set with the twin's folder, the man as the stand-in. */
const twinTree = (o: Parameters<typeof twinFolder>[0] = {}, figures: Record<string, unknown> = {}): Tree =>
  overlay({
    [SCENE]: sceneWith({ twin_stand_in: "man", ...figures }),
    ...avatarFolder("man"),
    ...twinFolder(o),
  });
const composed = (tree: Tree, policy: RoomPolicy = twinPolicy(), options = STRICT): ComposeResult =>
  compose(tree, policy, options);

/** This branch's tree, its policy main's, composed once. */
let branch: { tree: Tree; policy: RoomPolicy; result: ComposeResult } | null = null;
function onBranch(): { tree: Tree; policy: RoomPolicy; result: ComposeResult } {
  if (branch) return branch;
  const tree = fileTree(REPO);
  const policy = readRoomPolicy({ env: {}, root: REPO });
  branch = { tree, policy, result: compose(tree, policy, { mode: "strict", drafts: false }) };
  return branch;
}

describe("the twin's files, read by the convention (FR-009; plan.md R-01)", () => {
  it("are the model twin.glb, the five clips by role, and still.png, in the closed list's order", () => {
    expect([...TWIN_CLIP_ROLES]).toEqual([...TWIN_ROLES]);
    const tree = twinTree();
    const scene = loadRoom(tree).scene?.value ?? null;
    const twin = readTwin(tree, twinPolicy(), scene);
    expect(twin.problems).toEqual([]);
    expect(twin.model?.path).toBe(`${TWIN_DIR}/twin.glb`);
    expect(twin.model?.role).toBe("model");
    expect(twin.clips.map((c) => [c.name, c.role])).toEqual(TWIN_ROLES.map((r) => [`${r}.glb`, r]));
    expect(twin.still?.path).toBe(`${TWIN_DIR}/still.png`);
    expect(twin.still?.role).toBe("still");
    expect(twin.others).toEqual([]);
    for (const f of [twin.model, ...twin.clips, twin.still]) expect(f?.bundled, f?.path).toBe(true);
  });

  it("is computed from the tree: a missing clip is left out, and a file that is none of them has no role (RA5)", () => {
    const tree = twinTree({
      clips: { talking: null },
      extra: { "notes.glb": twinDefaults().clips.idle as Uint8Array },
    });
    const twin = readTwin(tree, twinPolicy(), loadRoom(tree).scene?.value ?? null);
    expect(twin.clips.map((c) => c.role)).toEqual(["idle", "listening", "greeting", "desk-lean"]);
    expect(twin.others.map((f) => [f.name, f.role, f.bundled, f.why])).toEqual([["notes.glb", null, false, "no-role"]]);
    // RA5 only reports: no finding, in a strict build either.
    expect(ofRules(composed(tree).findings, "RA5")).toEqual([]);
    expect(composed(tree).report.markdown).toContain("`assets/twin/notes.glb`");
  });

  it("names each file as the site serves it: a/twin.<hash16>.glb, a/twin-<role>.<hash16>.glb, a/twin-still.<hash16>.png", () => {
    const tree = twinTree();
    const twin = readTwin(tree, twinPolicy(), loadRoom(tree).scene?.value ?? null);
    const d = twinDefaults();
    expect(twin.model?.url).toBe(`a/twin.${sha256(d.model).slice(0, 16)}.glb`);
    expect(twin.model?.stem).toBe("twin");
    for (const c of twin.clips) {
      const data = d.clips[c.role as string] as Uint8Array;
      expect(c.url).toBe(`a/twin-${c.role}.${sha256(data).slice(0, 16)}.glb`);
      expect(c.stem).toBe(`twin-${c.role}`);
      expect(c.gz?.length).toBe(gzipBytes(data));
    }
    expect(twin.still?.url).toBe(`a/twin-still.${sha256(d.still).slice(0, 16)}.png`);
    expect(twin.still?.stem).toBe("twin-still");
    expect(twin.still?.gz).toBeNull();
  });

  it("measures the model: its height, its bounds, and its texture memory at its own size and at the twin's side", () => {
    const tree = twinTree({ model: twinModel({ images: [pngHeader(2048, 2048), pngHeader(2048, 2048)] }) });
    const twin = readTwin(tree, twinPolicy(), loadRoom(tree).scene?.value ?? null);
    expect(twin.model?.measures?.height).toBeCloseTo(1.82, 6);
    expect(twin.model?.measures?.texture_bytes).toBe(2 * textureMemory(2048, 2048));
    expect(twin.model?.measures?.decoded_bytes).toBe(2 * textureMemory(1024, 1024));
    expect(twin.still?.measures).toMatchObject({ width: 48, height: 64 });
  });

  it("on this branch's tree, finds the Author's intake: the model, the five clips, and the still, each bundled", () => {
    const { tree, policy, result } = onBranch();
    const twin = twinOf(tree, policy, loadRoom(tree).scene?.value ?? null);
    expect(twin.problems).toEqual([]);
    expect(twin.model?.name).toBe("twin.glb");
    expect(twin.clips.map((c) => c.name)).toEqual(TWIN_ROLES.map((r) => `${r}.glb`));
    expect(twin.still?.name).toBe("still.png");
    for (const f of [twin.model, ...twin.clips, twin.still]) expect([f?.path, f?.bundled]).toEqual([f?.path, true]);
    expect(twin.model?.measures?.height).toBeGreaterThan(1.8);
    expect(twin.model?.measures?.height).toBeLessThan(1.84);
    expect(twin.line?.approval).toBe("A-20261110-twin");
    expect(ofRules(result.findings, "RA1", "RA2", "RA4", "RA6", "RK3", "RK5")).toEqual([]);
  });
});

describe("RA1, RA2, and RA4 over the twin (FR-009, FR-055)", () => {
  it.each(["RA1-twin", "RA2-twin", "RA4-twin"])(
    "bad/%s refuses a strict build and leaves the file out of a lenient one",
    (name) => {
      const c = badCases().find((x) => x.name === name);
      expect(c).toBeDefined();
      if (!c) return;
      const strict = compose(caseTree(c), c.policy, { ...c.options, mode: "strict" });
      expect(ofRules(strict.findings, c.rule)).toContain(`${c.rule} ${c.file}:${c.path}`);
      const lenient = compose(caseTree(c), c.policy, { ...c.options, mode: "lenient" });
      const finding = lenient.findings.find((f) => f.rule === c.rule && f.file === c.file);
      expect(finding?.lenient).toBe(true);
      const twin = twinOf(caseTree(c), c.policy, loadRoom(caseTree(c)).scene?.value ?? null);
      const file = [twin.model, ...twin.clips, twin.still].find((f) => f?.path === c.file);
      expect(file?.bundled).toBe(false);
      expect(file?.why).toContain(c.rule);
      expect(formatFinding(finding as Finding, "lenient")).toMatch(new RegExp(`^warn ${c.rule} `));
    },
  );

  it("leaves the twin's clips out with its model, the stand-in its fallback (FR-002)", () => {
    const c = badCases().find((x) => x.name === "RA4-twin");
    if (!c) throw new Error("no RA4-twin");
    const lenient = compose(caseTree(c), c.policy, { ...c.options, mode: "lenient" });
    expect(lenient.scene.twin).toBeNull();
    const twin = twinOf(caseTree(c), c.policy, loadRoom(caseTree(c)).scene?.value ?? null);
    expect(twin.clips.every((f) => !f.bundled && f.why === "no-model")).toBe(true);
  });
});

describe("RA6, the twin's line (FR-015; contracts/twin-data.md §5, §7)", () => {
  const d = (): Uint8Array => twinDefaults().model;
  it.each([
    ["no approval for the model's hash", [] as ReturnType<typeof approvalOf>[]],
    ["an approval for an older hash", [{ ...approvalOf(), sha256: sha256(new Uint8Array([1, 2, 3])) }]],
    ["an approval with an empty line", [approvalOf(undefined, "")]],
    ["an approval with no line", [approvalOf(undefined, null)]],
  ])("refuses a strict build with %s, and leaves every file of the twin out of a lenient one", (_, likeness) => {
    const tree = twinTree();
    const policy = twinPolicy({ likeness });
    expect(ofRules(composed(tree, policy).findings, "RA6")).toEqual([`RA6 ${TWIN_DIR}/twin.glb:-`]);
    const lenient = composed(tree, policy, LENIENT);
    const ra6 = lenient.findings.find((f) => f.rule === "RA6");
    expect(ra6?.lenient).toBe(true);
    expect(ra6?.reason).not.toContain(FX_LINE);
    expect(lenient.index.twin).toBeNull();
    expect(lenient.scene.twin).toBeNull();
    expect(lenient.twin).toEqual([]);
    const twin = twinOf(tree, policy, loadRoom(tree).scene?.value ?? null);
    for (const f of [twin.model, ...twin.clips, twin.still]) expect([f?.path, f?.bundled]).toEqual([f?.path, false]);
    expect(twin.line).toBeNull();
    void d;
  });

  it("refuses the twin's files with no likeness approvals at all, as with none for its hash", () => {
    expect(ofRules(composed(twinTree(), twinPolicy({ likeness: null })).findings, "RA6")).toEqual([
      `RA6 ${TWIN_DIR}/twin.glb:-`,
    ]);
  });

  it("with the approval, gives the index's twin.line its line and names the approval it came from", () => {
    const result = composed(twinTree());
    expect(ofRules(result.findings, "RA6")).toEqual([]);
    expect(result.index.twin?.line).toBe(FX_LINE);
    const twin = twinOf(twinTree(), twinPolicy(), loadRoom(twinTree()).scene?.value ?? null);
    expect(twin.line).toEqual({ approval: "A-fx-twin", line: FX_LINE, source: "policy-dir" });
  });

  it("takes no approval where there is no twin model", () => {
    const result = composed(overlay({ [SCENE]: sceneWith({ twin_stand_in: "man" }), ...avatarFolder("man") }));
    expect(ofRules(result.findings, "RA6")).toEqual([]);
    expect(result.index.twin).toBeNull();
  });

  it("holds no copy of the Author's line in any file under apps/web/src/ or apps/web/room/ (SC-003)", () => {
    const { policy } = onBranch();
    const line = policy.likeness?.approvals.find((a) => a.id === "A-20261110-twin")?.disclosure_line;
    expect(typeof line).toBe("string");
    const holding: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (readFileSync(path, "utf8").includes(line as string)) holding.push(path);
      }
    };
    walk(join(REPO, "apps/web/src"));
    walk(join(REPO, "apps/web/room"));
    expect(holding).toEqual([]);
  });
});

describe("RK3 and RK5 with the twin (FR-046; plan.md R-02; SC-008)", () => {
  const images = [pngHeader(2048, 2048), pngHeader(2048, 2048)];
  const memory = (tree: Tree, policy: RoomPolicy = twinPolicy()) => {
    const room = loadRoom(tree);
    return sceneTextureMemory(createContext(room, policy, STRICT, tree).ctx);
  };

  it("counts the twin's model at its decoded side, figures.texture_px by default, never at its own size", () => {
    const m = memory(twinTree({ model: twinModel({ images }) }));
    expect(m.twin_own).toBe(2 * textureMemory(1024, 1024));
    expect(m.twin).toBe(2 * textureMemory(1024, 1024));
  });

  it("counts it at figures.twin.texture_px where the scene's twin block gives one", () => {
    const m = memory(twinTree({ model: twinModel({ images }) }, { twin: { texture_px: 2048 } }));
    expect(m.twin_own).toBe(2 * textureMemory(2048, 2048));
  });

  it("counts the larger of the twin's model and the stand-in's files", () => {
    const man = avatarFolder("man", { modelOptions: { images: [pngHeader(1024, 1024), pngHeader(1024, 1024)] } });
    const tree = overlay({
      [SCENE]: sceneWith({ twin_stand_in: "man" }),
      ...man,
      ...twinFolder({ model: twinModel({ images: [pngHeader(512, 512)] }) }),
    });
    const m = memory(tree);
    expect(m.twin_own).toBe(textureMemory(512, 512));
    expect(m.stand_in).toBe(2 * textureMemory(1024, 1024));
    expect(m.twin).toBe(2 * textureMemory(1024, 1024));
  });

  it("counts only twin.glb: no clip and no other file under assets/twin/", () => {
    const tree = twinTree({
      model: twinModel({ images: [pngHeader(256, 256)] }),
      extra: { "spare.glb": twinModel({ images: [pngHeader(2048, 2048)] }) },
    });
    expect(memory(tree).twin_own).toBe(textureMemory(256, 256));
  });

  it("passes RK3 and RK5 for the default scene with this branch's tree", () => {
    const { result } = onBranch();
    expect(ofRules(result.findings, "RK3", "RK5")).toEqual([]);
  });

  it.each(["RK3-twin", "RK5-twin"])("refuses bad/%s in a strict build", (name) => {
    const c = badCases().find((x) => x.name === name);
    if (!c) throw new Error(`no ${name}`);
    const result = compose(caseTree(c), c.policy, { ...c.options, mode: "strict" });
    expect(ofRules(result.findings, c.rule)).toContain(`${c.rule} ${c.file}:${c.path}`);
  });

  it("RK5 counts the room's served files, the twin's served GLBs, and the largest visitor folder, the stand-in's too", () => {
    const tree = twinTree();
    const twin = twinOf(tree, twinPolicy(), loadRoom(tree).scene?.value ?? null);
    const served = [twin.model, ...twin.clips].reduce((n, f) => n + (f?.gz?.length ?? 0), 0);
    const man = avatarFolder("man");
    const largest = Object.entries(man)
      .filter(([p]) => p.endsWith(".glb"))
      .reduce((n, [, data]) => n + gzipBytes(data), 0);
    // A phase-3 budget one byte under the twin's and the man's: RK5 names both.
    const result = composed(tree, twinPolicy({ phase3: served + largest - 1 }));
    const rk5 = result.findings.find((f) => f.rule === "RK5");
    expect(rk5?.reason).toContain("the twin's files");
    expect(composed(tree, twinPolicy({ phase3: served + largest })).findings.filter((f) => f.rule === "RK5")).toEqual(
      [],
    );
  });
});

// T019 (spec 016; FR-056; contracts/twin-data.md §8): the report's twin: each file with its measures and whether it's
// bundled, the model's height and bounds, the clips' lengths, the line's approval and source and never its words, and
// RK3's and RK5's figures with the twin.
describe("the report's twin (FR-056)", () => {
  it("gives each file, the model's measures, the clips, the line's approval, and RK3's and RK5's figures", () => {
    const md = composed(twinTree()).report.markdown;
    expect(md).toContain("### The twin");
    expect(md).toMatch(/\| `assets\/twin\/twin\.glb` \| model \| [\d,]+ \| [\d,]+ \| [\d,]+ \| 0 \| 0 \| yes \|/);
    for (const role of TWIN_ROLES) expect(md).toContain(`| \`assets/twin/${role}.glb\` | ${role} |`);
    expect(md).toContain("| `assets/twin/still.png` | still |");
    expect(md).toMatch(/The twin's model at rest: 1\.820 m tall; bounds from \[/);
    expect(md).toContain("`greeting` 2.47 s");
    expect(md).toContain("Its still: 48 × 64 pixels.");
    expect(md).toContain("The twin's line: from approval `A-fx-twin` in main's likeness approvals");
    expect(md).not.toContain(FX_LINE);
    expect(md).toMatch(/RK3's twin term: [\d,]+, the larger of its own model at 1024 px/);
    expect(md).toMatch(
      /First visit with both figures' files \(RK5\): [\d,]+ gzip-9 bytes, [\d,]+ of the room's placed models and cards, [\d,]+ of the twin's own files, 0 of the stand-in's files/,
    );
  });

  it("says why the twin's files aren't shown where RA6 stands", () => {
    const md = composed(twinTree(), twinPolicy({ likeness: [] }), LENIENT).report.markdown;
    expect(md).toContain("The twin's line: none, so none of its files is shown (RA6).");
    expect(md).toContain("| `assets/twin/twin.glb` | model |");
    expect(md).toMatch(/\| `assets\/twin\/twin\.glb` \| model \|.*\| no \(RA6\) \|/);
  });
});
