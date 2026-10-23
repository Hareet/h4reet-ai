// T065 (spec 004; FR-005, FR-009, FR-013, SC-002; R-09, R-10, R-66; contracts/room-data-files.md §13 to §15;
// contracts/room-bundle.md §1): compose() over the fixture set. The known-good set composes with no finding in strict
// and lenient mode, with and without drafts; each bad/<RULE>/ case is refused with `<rule> <file>:<path>: <reason>`
// naming its rule, file, and path, its reason echoing no data value; every finding is reported, sorted by file, path
// (indices as numbers), and rule; compose() never throws on data and reads only what contracts/room-data-files.md §1
// lists. The coverage test fails while a rule of §13 but RG8 has no bad/ case, so it stays red until every family has
// its cases (T078). The trees compose() reads through (T075; contracts/room-bundle.md §1) are held to their interface:
// repository paths only, listings sorted bytewise, no link followed, and a log of every path read or listed.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { compareFindings, RULE_IDS, RULES } from "../../build/room/checks/family";
import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeOptions, Finding } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { fileTree, isTreePath, memoryTree, overlayTree } from "../../build/room/source";
import { badCases, caseTree, goodFiles, goodTree, overlay } from "../helpers/room-fixtures";

const MODES: ComposeOptions[] = [
  { mode: "strict", drafts: true },
  { mode: "strict", drafts: false },
  { mode: "lenient", drafts: true },
  { mode: "lenient", drafts: false },
];
const lines = (findings: readonly Finding[]): string[] => findings.map((f) => formatFinding(f));
const decoder = new TextDecoder();

/** Every prose string a tree's data files hold (a text, a name, a phrase, a quote, a note), which no reason may echo.
 *  IDs may appear in another family's reasons once RT2 has passed them, so only RD's and RI's are held to none. */
function prose(files: ReadonlyMap<string, Uint8Array | null>): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      if (/\s/.test(v.trim()) && v.length >= 8) out.add(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const [path, data] of files) {
    if (data === null || !/\.(ya?ml|json)$/.test(path)) continue;
    try {
      walk(path.endsWith(".json") ? JSON.parse(decoder.decode(data)) : parse(decoder.decode(data)));
    } catch {
      // A file a case broke on purpose holds nothing to compare.
    }
  }
  return [...out];
}

describe("the known-good set", () => {
  it.each(MODES)("composes with no finding ($mode, drafts $drafts)", (options) => {
    expect(lines(compose(goodTree(), noPolicy(), options).findings)).toEqual([]);
  });

  it("is read only where contracts/room-data-files.md §1 lists, never the policy", () => {
    const tree = goodTree();
    compose(tree, noPolicy(), { mode: "strict", drafts: true });
    const allowed = [
      /^apps\/web\/room(\/|$)/,
      /^apps\/web\/content\/room(\/|$)/,
      /^assets\/(room|twin|visitors)(\/|$)/,
      /^apps\/web\/fonts(\/|$)/,
      /^apps\/web\/content\/resume\.yaml$/,
      /^corpus(\/[^/]+\.md|\/facts(\/[^/]+\.yaml)?|\/intake\/private\/denylist\.txt)?$/,
      /^docs\/data-flow-disclosure\.md$/,
      /^intent(\/[^/]+\.md)?$/,
      /^specs(\/[^/]+(\/intent\.md)?)?$/,
    ];
    expect(tree.log.length).toBeGreaterThan(0);
    expect(tree.log.filter((p) => !allowed.some((re) => re.test(p)))).toEqual([]);
    expect(tree.log.some((p) => p.startsWith("assets/policy"))).toBe(false);
  });
});

describe("each known-bad case", () => {
  it.each(badCases().map((c) => [c.name, c] as const))("bad/%s", (_, c) => {
    const result = compose(caseTree(c), noPolicy(), c.options);
    const hit = result.findings.find((f) => f.rule === c.rule && f.file === c.file && f.path === c.path);
    expect(hit, `expected ${c.rule} ${c.file}:${c.path}, got:\n${lines(result.findings).join("\n")}`).toBeDefined();
    if (!hit) return;
    expect(formatFinding(hit)).toBe(`${c.rule} ${c.file}:${c.path}: ${hit.reason}`);
    expect(hit.reason).toMatch(/\S/);
    expect(hit.lenient).toBe(RULES[hit.rule as keyof typeof RULES].lenient);
    const tree = new Map([...goodFiles(), ...c.changes]);
    for (const f of result.findings) {
      for (const value of prose(tree)) expect(f.reason, `${formatFinding(f)} echoes data`).not.toContain(value);
      if (f.rule.startsWith("RD") || f.rule.startsWith("RI")) expect(f.reason).not.toMatch(/fx-/);
    }
    expect([...result.findings].sort(compareFindings)).toEqual(result.findings);
  });

  it("covers every rule of contracts/room-data-files.md §13 but RG8, which only reports", () => {
    const covered = new Set(badCases().map((c) => c.rule));
    const missing = RULE_IDS.filter((rule) => RULES[rule].refuses && !covered.has(rule));
    expect(missing, "rules with no bad/<RULE>/ case").toEqual([]);
  });
});

describe("findings", () => {
  const finding = (rule: string, file: string, path: string): Finding => ({
    rule,
    file,
    path,
    reason: "a reason",
    lenient: false,
  });

  it("sort by file, then path with its indices as numbers, then rule", () => {
    const sorted = [
      finding("RI4", "apps/web/room/catalog/fx-a.yaml", "anchors.top"),
      finding("RD2", "apps/web/room/scene.yaml", "-"),
      finding("RI2", "apps/web/room/scene.yaml", "placements[2].id"),
      finding("RI5", "apps/web/room/scene.yaml", "placements[2].id"),
      finding("RI10", "apps/web/room/scene.yaml", "placements[2].id"),
      finding("RI4", "apps/web/room/scene.yaml", "placements[2].mount"),
      finding("RI4", "apps/web/room/scene.yaml", "placements[10].id"),
      finding("RI4", "apps/web/room/scene.yaml", "placements[10].mount.anchor"),
      finding("RI11", "apps/web/room/ui-words.yaml", "words.label.fx-a"),
    ];
    const shuffled = [...sorted].reverse();
    expect(shuffled.sort(compareFindings)).toEqual(sorted);
  });

  it("are every finding, sorted, across files", () => {
    const tree = overlay({
      "apps/web/room/catalog/fx-desk.yaml": decoder
        .decode(goodFiles().get("apps/web/room/catalog/fx-desk.yaml"))
        .replace("color: fx-wood", "color: fx-nocolour"),
      "apps/web/room/lookdev.yaml": "version: 1\nvignette: { show: [fx-gone] }\nclose_up: { frame: [fx-desk] }\n",
      "apps/web/room/fixtures/fx-sample.yaml": "version: 2\n",
    });
    const result = compose(tree, noPolicy(), { mode: "strict", drafts: true });
    expect(result.findings.map((f) => `${f.rule} ${f.file}:${f.path}`)).toEqual([
      "RI4 apps/web/room/catalog/fx-desk.yaml:standin[0].color",
      "RD3 apps/web/room/fixtures/fx-sample.yaml:id",
      "RD3 apps/web/room/fixtures/fx-sample.yaml:tier",
      "RD3 apps/web/room/fixtures/fx-sample.yaml:turns",
      "RD4 apps/web/room/fixtures/fx-sample.yaml:version",
      "RI10 apps/web/room/lookdev.yaml:vignette.show[0]",
    ]);
  });

  it("print as <rule> <file>:<path>: <reason>, a lenient one prefixed warn in a lenient build", () => {
    const strict = finding("RI4", "apps/web/room/scene.yaml", "placements[3].mount.anchor");
    expect(formatFinding(strict)).toBe("RI4 apps/web/room/scene.yaml:placements[3].mount.anchor: a reason");
    expect(formatFinding(strict, "lenient")).toBe("RI4 apps/web/room/scene.yaml:placements[3].mount.anchor: a reason");
    const lenient = { ...finding("RK2", "assets/room/fx-desk.glb", "-"), lenient: true };
    expect(formatFinding(lenient, "strict")).toBe("RK2 assets/room/fx-desk.glb:-: a reason");
    expect(formatFinding(lenient, "lenient")).toBe("warn RK2 assets/room/fx-desk.glb:-: a reason");
  });

  it("drop RI10 outside a drafts build, where lookdev.yaml isn't read for the vignette", () => {
    const tree = (): ReturnType<typeof overlay> =>
      overlay({
        "apps/web/room/lookdev.yaml": "version: 1\nvignette: { show: [fx-gone] }\nclose_up: { frame: [fx-desk] }\n",
      });
    expect(lines(compose(tree(), noPolicy(), { mode: "strict", drafts: false }).findings)).toEqual([]);
    expect(compose(tree(), noPolicy(), { mode: "strict", drafts: true }).findings.map((f) => f.rule)).toEqual(["RI10"]);
  });

  it.todo(
    "strict mode fails and lenient mode warns, prefixed warn, on the same RX or RK2 finding; that piece keeps its stand-in, and the manifest lists it in standins[] with the reason findings (T078's RX and RK families; T080's manifest)",
  );

  it.todo(
    "the 3D part's load_order puts the framed members of selectables first, in scene order with the shown pose first, then the other framed placements, then the rest, a shared model once (T080)",
  );
});

describe("compose()", () => {
  it("never throws on data: an empty tree, and every data file garbled", () => {
    expect(lines(compose(memoryTree(new Map()), noPolicy(), { mode: "strict", drafts: true }).findings)).toEqual([
      expect.stringMatching(/^RD3 apps\/web\/room\/scene\.yaml:-: /),
      expect.stringMatching(/^RD3 apps\/web\/room\/ui-words\.yaml:-: /),
    ]);
    const garbled = new Map<string, Uint8Array>();
    for (const [path, data] of goodFiles()) {
      const junk = /\.(ya?ml|json)$/.test(path) ? Uint8Array.from([0x7b, 0x5b, 0xff, 0x00, 0x22]) : data;
      garbled.set(path, junk);
    }
    const result = compose(memoryTree(garbled), noPolicy(), { mode: "lenient", drafts: true });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => f.rule === "RD1" || f.rule === "RD3")).toBe(true);
  });

  it("composes the same findings twice from one tree", () => {
    const once = compose(goodTree(), noPolicy(), { mode: "strict", drafts: true });
    const twice = compose(goodTree(), noPolicy(), { mode: "strict", drafts: true });
    expect(twice.findings).toEqual(once.findings);
    expect(twice.digest).toBe(once.digest);
  });
});

describe("the rule catalogue (contracts/room-data-files.md §13, §15)", () => {
  it("holds every rule of the nine families, in order", () => {
    const counts = { RD: 5, RI: 11, RG: 9, RS: 6, RT: 13, RV: 3, RX: 10, RK: 4, RL: 4 };
    const expected = Object.entries(counts).flatMap(([family, n]) =>
      Array.from({ length: n }, (_, i) => `${family}${i + 1}`),
    );
    expect([...RULE_IDS]).toEqual(expected);
    for (const rule of RULE_IDS) expect(RULES[rule].family).toBe(rule.replace(/\d+$/, ""));
  });

  it("makes RX and RK2 alone lenient, RG8 alone a report, and RT9, RT8, and RT13 strict-only, whole or in part", () => {
    expect(RULE_IDS.filter((r) => RULES[r].lenient)).toEqual([
      "RX1",
      "RX2",
      "RX3",
      "RX4",
      "RX5",
      "RX6",
      "RX7",
      "RX8",
      "RX9",
      "RX10",
      "RK2",
    ]);
    expect(RULE_IDS.filter((r) => !RULES[r].refuses)).toEqual(["RG8"]);
    expect(Object.fromEntries(RULE_IDS.filter((r) => RULES[r].strict).map((r) => [r, RULES[r].strict]))).toEqual({
      RT8: "part",
      RT9: "whole",
      RT13: "part",
    });
  });
});

describe("the trees (contracts/room-bundle.md §1)", () => {
  const encoder = new TextEncoder();
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  /** A root holding `files`, beside a folder outside it. */
  function root(files: Record<string, string>): { root: string; outside: string } {
    const top = mkdtempSync(join(tmpdir(), "room-tree-"));
    made.push(top);
    const inside = join(top, "repo");
    const outside = join(top, "outside");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "secret.yaml"), "fx: outside\n");
    for (const [path, text] of Object.entries({ ...files })) {
      mkdirSync(join(inside, path, ".."), { recursive: true });
      writeFileSync(join(inside, path), text);
    }
    return { root: inside, outside };
  }

  it("takes repository paths only: /-separated, with no empty, ., or .. segment", () => {
    for (const ok of ["", "apps", "apps/web/room/scene.yaml", "a/.hidden", "a/b..c"])
      expect(isTreePath(ok), ok).toBe(true);
    for (const bad of ["/apps", "apps/", "apps//web", "./apps", "apps/../x", "..", "a\\b", "a\0b"])
      expect(isTreePath(bad), bad).toBe(false);
  });

  it("reads the file system under its root, lists it sorted bytewise, and logs every path in order", () => {
    const { root: r } = root({ "d/b.yaml": "b", "d/a.yaml": "a", "d/B.yaml": "B", "d/\u00e9.yaml": "e", "d/z/x": "x" });
    const tree = fileTree(r);
    expect(tree.list("d")).toEqual(["B.yaml", "a.yaml", "b.yaml", "z", "\u00e9.yaml"]);
    expect(new TextDecoder().decode(tree.read("d/a.yaml") ?? new Uint8Array())).toBe("a");
    expect([tree.read("d/z"), tree.read("d/none"), tree.read(""), tree.read("d/../d/a.yaml")]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect([tree.list("d/a.yaml"), tree.list("none")]).toEqual([[], []]);
    expect(tree.list("")).toEqual(["d"]);
    expect(tree.log).toEqual(["d", "d/a.yaml", "d/z", "d/none", "", "d/../d/a.yaml", "d/a.yaml", "none", ""]);
  });

  it("follows no link, so nothing outside its root is read", () => {
    const { root: r, outside } = root({ "d/a.yaml": "a" });
    symlinkSync(join(outside, "secret.yaml"), join(r, "d", "out.yaml"));
    symlinkSync(outside, join(r, "linked"));
    symlinkSync(join(r, "d", "a.yaml"), join(r, "d", "in.yaml"));
    const tree = fileTree(r);
    expect([tree.read("d/out.yaml"), tree.read("linked/secret.yaml"), tree.read("d/in.yaml")]).toEqual([
      null,
      null,
      null,
    ]);
    expect(tree.list("linked")).toEqual([]);
    expect(fileTree(join(r, "missing")).list("")).toEqual([]);
  });

  it("overlays a base: a path replaced, added, or removed with everything under it, and a removed folder refilled", () => {
    const base = memoryTree(
      new Map([
        ["a/one.yaml", encoder.encode("1")],
        ["a/two.yaml", encoder.encode("2")],
        ["b/c/three.yaml", encoder.encode("3")],
        ["d/four.yaml", encoder.encode("4")],
      ]),
    );
    const tree = overlayTree(
      base,
      new Map([
        ["a/one.yaml", encoder.encode("one")],
        ["a/new.yaml", encoder.encode("new")],
        ["a/two.yaml", null],
        ["b", null],
        ["d", null],
        ["d/five.yaml", encoder.encode("5")],
      ]),
    );
    const text = (path: string): string | null => {
      const data = tree.read(path);
      return data === null ? null : new TextDecoder().decode(data);
    };
    expect([text("a/one.yaml"), text("a/new.yaml"), text("a/two.yaml"), text("b/c/three.yaml")]).toEqual([
      "one",
      "new",
      null,
      null,
    ]);
    expect([text("d/four.yaml"), text("d/five.yaml"), text("a")]).toEqual([null, "5", null]);
    expect([tree.list(""), tree.list("a"), tree.list("b"), tree.list("d")]).toEqual([
      ["a", "d"],
      ["new.yaml", "one.yaml"],
      [],
      ["five.yaml"],
    ]);
    expect(tree.log).toEqual([
      "a/one.yaml",
      "a/new.yaml",
      "a/two.yaml",
      "b/c/three.yaml",
      "d/four.yaml",
      "d/five.yaml",
      "a",
      "",
      "a",
      "b",
      "d",
    ]);
    expect(base.log).not.toContain("a/new.yaml");
  });
});
