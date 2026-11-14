// T065 (spec 004; FR-005, FR-009, FR-013, SC-002; R-09, R-10, R-66; contracts/room-data-files.md §13 to §15;
// contracts/room-bundle.md §1): compose() over the fixture set. The known-good set composes with no finding in strict
// and lenient mode, with and without drafts; each bad/<RULE>/ case is refused with `<rule> <file>:<path>: <reason>`
// naming its rule, file, and path, its reason echoing no data value; every finding is reported, sorted by file, path
// (indices as numbers), and rule; compose() never throws on data and reads only what contracts/room-data-files.md §1
// lists. The coverage test fails while a rule of §13 but RG8 has no bad/ case, so it stays red until every family has
// its cases (T078). The trees compose() reads through (T075; contracts/room-bundle.md §1) are held to their interface:
// repository paths only, listings sorted bytewise, no link followed, and a log of every path read or listed.
// T094's compose half (FR-009, SC-002; contracts/room-data-files.md §3.1, §15): the committed tree composes in strict
// mode with no finding, under the policy `make test` reads (policy.ts: main's, by refs/heads/main), with drafts and
// without; and its data holds no ID with the reserved prefix `fx-`, the tests' own, so no literal in a test can be a
// real ID.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { compareFindings, RULE_IDS, RULES } from "../../build/room/checks/family";
import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeOptions, Finding } from "../../build/room/compose";
import { loadRoom, namespaceIds } from "../../build/room/load";
import { CAPS_DEFAULTS, noPolicy, policyFrom, readRoomPolicy } from "../../build/room/policy";
import { fileTree, isTreePath, memoryTree, overlayTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { AVATARS } from "../../src/choice/avatars";
import { LABEL_HEIGHT, LABEL_LIFT } from "../../src/room/compose/framing";
import { gzip9 } from "../../src/room/glb/gzip";
import { desk, rxVariants, sign, SIGN_INPUT } from "../helpers/glb";
import { badCases, caseTree, goodFiles, goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy, catalogEntry, cleanModel, modelChanges } from "../helpers/room-models";

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

  it("switches each live source on beside its disclosure row, in the spec's words, and each row is needed (RL2 to RL4)", () => {
    const scene = decoder
      .decode(goodFiles().get("apps/web/room/scene.yaml"))
      .replace(/^live: .*$/m, "live: { source: site, poll_s: 30, freshness_s: 35, turn: site, asset_events: site }");
    // Amendment A4's words on V7, B6's on V2, and spec 003's asset events on V6 (spec.md's Data-Flow Disclosure Entries).
    // V7's Why cell, which no RL rule reads, names the fixture set's laptop where the spec names the room's: the room's
    // own ID would hit the source scan (FR-007).
    const rows: Record<string, string> = {
      V2: "| V2 | the stack → the visitor's browser, in each turn's reply | a conversation turn | the turn's estimated cost and its route | anything new leaving the device | the neon sign (FR-048) and the failover cue (FR-041 row 7) | with the conversation | close the conversation | FR-075 |",
      V6: "| V6 | the visitor's browser → the site's own origin, `POST /api/events` | a piece's model loading | the asset's kind and bytes | the visitor's address | spec 003's transfer panel | off | `asset_events: off` | FR-071 |",
      V7: "| V7 | the visitor's browser → the edge → the relay, `GET /api/status` | as before, and now the room: every 30 s while the visitor has entered, the page is visible, the room isn't paused, and the live source is on, and once on resume or return, at most once an interval | the request; the IP address; the user agent | anything typed or said | the fx-laptop shows whether the Author's machine is serving (FR-041) | on once the live source is | \"Pause the room\", or block the path | FR-074 |",
    };
    const disclosure = (ids: readonly string[]): string =>
      [
        "# Data-flow disclosure",
        "",
        "| ID | From → To | Trigger | Carries | Never carries | Why | Default | How to switch it off | FR |",
        "|---|---|---|---|---|---|---|---|---|",
        ...ids.map((id) => rows[id] ?? ""),
        "",
      ].join("\n");
    const live = (ids: readonly string[]): string[] =>
      compose(
        overlay({ "apps/web/room/scene.yaml": scene, "docs/data-flow-disclosure.md": disclosure(ids) }),
        noPolicy(),
        { mode: "strict", drafts: true },
      )
        .findings.filter((f) => f.rule.startsWith("RL"))
        .map((f) => `${f.rule} ${f.file}:${f.path}`);
    expect(live(["V2", "V6", "V7"])).toEqual([]);
    expect(live(["V2", "V6"])).toEqual(["RL2 apps/web/room/scene.yaml:live.source"]);
    expect(live(["V2", "V7"])).toEqual(["RL3 apps/web/room/scene.yaml:live.asset_events"]);
    expect(live(["V6", "V7"])).toEqual(["RL4 apps/web/room/scene.yaml:live.turn"]);
  });
});

describe("each known-bad case", () => {
  it.each(badCases().map((c) => [c.name, c] as const))("bad/%s", (_, c) => {
    const result = compose(caseTree(c), c.policy, c.options);
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

  it("covers every rule of contracts/room-data-files.md §13 but RG8 and RA5, which only report", () => {
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

  it("fail a strict build and only warn, prefixed warn, in a lenient one on the same RX or RK2 finding; that piece keeps its stand-in", () => {
    // Main's caps, so the piece keeps its stand-in for its findings, not for want of caps.
    const text = new TextEncoder().encode(`${JSON.stringify({ schema: 1, per_asset: { room: CAPS_DEFAULTS } })}\n`);
    const policy = policyFrom({ caps: text, approvals: null, header: null }, "policy-dir");
    for (const [name, path] of [
      ["RX10", "materials[0].emissiveFactor"],
      ["RK2", "-"],
    ] as const) {
      const c = badCases().find((x) => x.name === name);
      if (!c) throw new Error(`no bad/${name}/`);
      const strict = compose(caseTree(c), policy, { mode: "strict", drafts: true });
      const lenient = compose(caseTree(c), policy, { mode: "lenient", drafts: true });
      expect(strict.findings.map((f) => `${f.rule} ${f.file}:${f.path}`)).toEqual([
        `${name} assets/room/fx-desk.glb:${path}`,
      ]);
      expect(lenient.findings).toEqual(strict.findings);
      // Strict fails on any finding; lenient fails only on one it doesn't tolerate, and prints the rest prefixed warn.
      expect(strict.findings.every((f) => f.lenient)).toBe(true);
      expect(strict.findings.map((f) => formatFinding(f, "strict"))).toEqual([
        `${name} assets/room/fx-desk.glb:${path}: ${strict.findings[0]?.reason}`,
      ]);
      expect(lenient.findings.map((f) => formatFinding(f, "lenient"))).toEqual([
        `warn ${name} assets/room/fx-desk.glb:${path}: ${lenient.findings[0]?.reason}`,
      ]);
      // The piece keeps its stand-in: no model on its placement in the 3D part, and no .gz copy.
      for (const result of [strict, lenient]) {
        expect(result.scene.placements.find((p) => p.piece === "fx-desk")?.model ?? null).toBeNull();
        expect(result.models.some((m) => m.piece === "fx-desk")).toBe(false);
      }
    }
  });

  it("on an RX or RK2 finding in lenient mode the manifest lists that piece in standins[] with the reason findings, placeholders true and no model of it emitted, where its clean model is set (T080's manifest)", () => {
    // Under main's caps every piece a placement or a pose shows has a clean model, and every avatar its file, so only
    // the desk's model's finding can make a stand-in, or a placeholder.
    const pieces = ["fx-board", "fx-desk", "fx-laptop", "fx-monitor", "fx-neon", "fx-plug", "fx-shell", "fx-sign"];
    const files: Record<string, Uint8Array> = modelChanges(pieces);
    const glb = files["assets/room/fx-desk.glb"] as Uint8Array;
    files["assets/twin/fx-twin.glb"] = glb;
    for (const a of AVATARS) files[`assets/visitors/${a.id}/${a.id}.glb`] = glb;
    const DESK = "apps/web/room/catalog/fx-desk.yaml";
    const lenient: ComposeOptions = { mode: "lenient", drafts: true };
    const clean = compose(overlay(files), capsPolicy(), lenient);
    expect(lines(clean.findings)).toEqual([]);
    expect(clean.manifest.standins).toEqual([]);
    expect([clean.manifest.placeholders, clean.index.build.placeholders]).toEqual([false, false]);
    expect(clean.models.map((m) => m.piece)).toEqual(pieces);
    expect(clean.scene.placements.find((p) => p.id === "fx-desk")?.model).not.toBeNull();
    type Entry = { origin: { bounds: { max: number[] } }; budget: { triangles: number } };
    for (const [rule, change] of [
      // The catalog's bounds grown 10 cm past the model's, which RX7 holds within the larger of 2 cm and 3%.
      ["RX7", (e: Entry) => (e.origin.bounds.max[0] = 0.7)],
      // A budget of one triangle, under the model's twelve.
      ["RK2", (e: Entry) => (e.budget.triangles = 1)],
    ] as const) {
      const entry = parse(decoder.decode(files[DESK])) as Entry;
      change(entry);
      const result = compose(overlay({ ...files, [DESK]: stringify(entry) }), capsPolicy(), lenient);
      expect([...new Set(result.findings.map((f) => `${f.rule} ${f.file}`))]).toEqual([
        `${rule} assets/room/fx-desk.glb`,
      ]);
      expect(result.findings.map((f) => formatFinding(f, "lenient")).every((line) => line.startsWith("warn "))).toBe(
        true,
      );
      expect(result.manifest.standins).toEqual([{ placement: "fx-desk", reason: "findings" }]);
      expect([result.manifest.placeholders, result.index.build.placeholders]).toEqual([true, true]);
      expect(result.models.map((m) => m.piece)).toEqual(pieces.filter((p) => p !== "fx-desk"));
      expect(result.scene.placements.find((p) => p.id === "fx-desk")?.model).toBeNull();
    }
  });

  it("the 3D part's load_order puts the framed members of selectables first, in scene order with the shown pose first, then the other framed placements, then the rest, a shared model once (T080)", () => {
    const scene = decoder
      .decode(goodFiles().get("apps/web/room/scene.yaml"))
      .replace(
        "switches:\n",
        "  - { id: fx-sign-two, piece: fx-sign, mount: { on: fx-desk, anchor: top, offset: [-0.2, 0, 0.2] } }\nswitches:\n",
      );
    const tree = overlay({
      ...modelChanges(["fx-board", "fx-desk", "fx-laptop", "fx-monitor", "fx-neon", "fx-plug", "fx-sign"]),
      "apps/web/room/scene.yaml": scene,
    });
    const result = compose(tree, capsPolicy(), { mode: "strict", drafts: true });
    expect(lines(result.findings)).toEqual([]);
    // fx-neon is framed but in no selectable; fx-desk and the signs aren't framed; the live source is off, so the
    // switch shows its not-live case's pose; the second sign and the other poses share a model already listed.
    expect(result.scene.load_order).toEqual([
      "fx-monitor",
      "fx-laptop",
      "fx-board",
      "fx-neon",
      "fx-desk",
      "fx-sign",
      "fx-power.fx-resting",
    ]);
  });
});

describe("the committed tree (T094)", () => {
  /** The repository's root, which holds apps/web/room/ and everything else contracts/room-data-files.md §1 lists. */
  const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

  it.each([true, false])("composes in strict mode with no finding (drafts %s)", (drafts) => {
    const policy = readRoomPolicy({ env: process.env, root: ROOT });
    expect(lines(compose(fileTree(ROOT), policy, { mode: "strict", drafts }).findings)).toEqual([]);
  });

  it("holds no ID with the reserved prefix fx-, which belongs to the tests' synthetic IDs", () => {
    const room = loadRoom(fileTree(ROOT));
    const ids = [...Object.values(namespaceIds(room)).flat(), ...(room.scene?.value.retired.map((r) => r.id) ?? [])];
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => id.startsWith("fx-"))).toEqual([]);
  });

  // look.ts reads outlines.width in CSS pixels of the stage's height; OutlineEffect's own default thickness, 0.003, is
  // in normalized device units, and taken as pixels it draws lines a few thousandths of a pixel thick, which no one
  // sees (the review of feat/004-us3-lookdev, page-5).
  it("draws the scene's look's ink lines at least half a CSS pixel thick", () => {
    const room = loadRoom(fileTree(ROOT));
    const name = room.scene?.value.look;
    const look = room.looks.find((l) => l.value.id === name)?.value;
    expect(look).toBeDefined();
    if (look?.outlines) expect(look.outlines.width).toBeGreaterThanOrEqual(0.5);
  });
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

  it("never throws on data named as an object's own keys are: a file or a folder in apps/web/room/ is RD5 (core-2)", () => {
    const tree = overlay({
      "apps/web/room/constructor": "version: 1\n",
      "apps/web/room/toString": "version: 1\n",
      "apps/web/room/valueOf": "version: 1\n",
      "apps/web/room/__proto__/fx-one.yaml": "version: 1\n",
      "apps/web/room/hasOwnProperty/fx-one.yaml": "version: 1\n",
    });
    expect(lines(compose(tree, noPolicy(), { mode: "strict", drafts: true }).findings)).toEqual([
      "RD5 apps/web/room/__proto__:-: a folder the room's data doesn't hold",
      "RD5 apps/web/room/constructor:-: not a file of the room's data",
      "RD5 apps/web/room/hasOwnProperty:-: a folder the room's data doesn't hold",
      "RD5 apps/web/room/toString:-: not a file of the room's data",
      "RD5 apps/web/room/valueOf:-: not a file of the room's data",
    ]);
  });

  it("composes the same findings twice from one tree", () => {
    const once = compose(goodTree(), noPolicy(), { mode: "strict", drafts: true });
    const twice = compose(goodTree(), noPolicy(), { mode: "strict", drafts: true });
    expect(twice.findings).toEqual(once.findings);
    expect(twice.digest).toBe(once.digest);
  });
});

describe("the rule catalogue (contracts/room-data-files.md §13, §15)", () => {
  it("holds every rule of spec 004's nine families with spec 009's RA before RK and its RK5, then spec 008's RW1 and RW2", () => {
    // Spec 012's RT14 to RT17, the hints' (its Amendment L8), after spec 004's RT1 to RT13.
    // Spec 014's RD6 (a glow's shape), RD7 (the figures' grips), and RG10 (a path glow's bounds).
    // Spec 016's RA6, the twin's line, RA7, its lean, and RA8, its reach (its FR-015, FR-029, FR-010; changed with
    // T015, T041, and T083, its plan's R-18 and R-19). Spec 020's RA9, a visitor's likeness's approval (its FR-002, T002).
    // Spec 021's RA10, the rig's bones (its FR-005, T003), and RA11, the body's box (its FR-004, T004).
    const counts = { RD: 7, RI: 11, RG: 10, RS: 6, RT: 17, RV: 3, RX: 10, RA: 11, RK: 5, RL: 4 };
    const expected = Object.entries(counts).flatMap(([family, n]) =>
      Array.from({ length: n }, (_, i) => `${family}${i + 1}`),
    );
    // Spec 008's plan.md §3.5: RW1, the figure's start on the walkable floor (T041), and RW2, the highlight's contrast.
    expect([...RULE_IDS]).toEqual([...expected, "RW1", "RW2"]);
    for (const rule of RULE_IDS) expect(RULES[rule].family).toBe(rule.replace(/\d+$/, ""));
  });

  it("makes RT17, RX, RA1 to RA4, spec 016's RA6 to RA8, spec 020's RA9, spec 021's RA10 and RA11, RK2, and RK5 alone lenient, RG8 and RA5 alone reports, and RT8, RT9, RT13, and RT14 strict-only", () => {
    expect(RULE_IDS.filter((r) => RULES[r].lenient)).toEqual([
      "RT17",
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
      "RA1",
      "RA2",
      "RA3",
      "RA4",
      "RA6",
      "RA7",
      "RA8",
      "RA9",
      "RA10",
      "RA11",
      "RK2",
      "RK5",
    ]);
    expect(RULE_IDS.filter((r) => !RULES[r].refuses)).toEqual(["RG8", "RA5"]);
    expect(Object.fromEntries(RULE_IDS.filter((r) => RULES[r].strict).map((r) => [r, RULES[r].strict]))).toEqual({
      RT8: "part",
      RT9: "whole",
      RT13: "part",
      RT14: "whole",
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

// ---- T217: User Story 4's scenarios 1 and 2 on a fixture overlay (FR-019, FR-023) ----

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** The changes that set `piece`'s model to `model`: its catalog entry's `model`, the file under assets/room/, and
 *  records.json recording it with the kind room and its SHA-256 (RI7). */
function setModel(piece: string, model: Uint8Array): Record<string, Uint8Array> {
  const changes = modelChanges([piece]);
  changes[`assets/room/${piece}.glb`] = model;
  changes["assets/room/records.json"] = records(piece, model);
  return changes;
}

/** records.json recording `piece`'s file alone. */
function records(piece: string, model: Uint8Array): Uint8Array {
  const entries = [{ file: `${piece}.glb`, sha256: sha256(model), kind: "room" }];
  const record = { schema: 1, directory: "assets/room", license: "all-rights-reserved-2026", entries };
  return new TextEncoder().encode(`${JSON.stringify(record, null, 2)}\n`);
}

/** User Story 4's machine-checkable variants, as its Independent Test lists them, from test/helpers/glb.ts: a live face
 *  missing or off its plane, a misplaced origin, a light, a camera, an animation, a name off the rule, a refused
 *  extension, and a mark that isn't spec 003's (missing, or another value). */
const US4_VARIANTS = [
  "rx8-missing",
  "rx8-facing-off",
  "rx7-misplaced-origin",
  "rx4-light",
  "rx3-camera",
  "rx3-animation",
  "rx6-camera-stem",
  "rx4-KHR_materials_transmission",
  "rx5-not-scrubbed",
  "rx5-another-value",
] as const;

describe("User Story 4: a studio model in place of its stand-in (T217; FR-019, FR-023)", () => {
  const STRICT: ComposeOptions = { mode: "strict", drafts: false };
  const LENIENT: ComposeOptions = { mode: "lenient", drafts: false };
  const MONITOR = "fx-monitor";

  it("sets a clean model at the catalog's size, origin, and live faces with the one edit: its model entry and its measured frame box (scenario 1)", () => {
    type Bounds = { readonly min: [number, number, number]; readonly max: [number, number, number] };
    const entry = catalogEntry(MONITOR);
    const bounds = (entry.origin as { bounds: Bounds }).bounds;
    // The studio's file: the catalog's box and live face, its top 1 cm under the expected bounds', inside RX7's 2 cm,
    // so the frame box below can only be the measured one.
    const measured: Bounds = { min: bounds.min, max: [bounds.max[0], bounds.max[1] - 0.01, bounds.max[2]] };
    const model = cleanModel({ ...entry, origin: { bounds: measured } } as unknown as Parameters<typeof cleanModel>[0]);
    const changes = setModel(MONITOR, model);
    // The one edit in the room's data: the entry's model; the file and its record arrive under assets/room/.
    expect(Object.keys(changes).filter((p) => !p.startsWith("assets/room/"))).toEqual([
      `apps/web/room/catalog/${MONITOR}.yaml`,
    ]);
    expect(parse(decoder.decode(changes[`apps/web/room/catalog/${MONITOR}.yaml`]))).toEqual({
      ...entry,
      model: { file: `${MONITOR}.glb` },
    });

    const standin = compose(goodTree(), capsPolicy(), STRICT);
    const set = compose(overlay(changes), capsPolicy(), STRICT);
    expect(lines(standin.findings)).toEqual([]);
    expect(lines(set.findings)).toEqual([]);
    const before = standin.scene.placements.find((p) => p.id === MONITOR);
    const after = set.scene.placements.find((p) => p.id === MONITOR);
    if (!before || !after) throw new Error(`no placement ${MONITOR}`);
    expect(before.model).toBeNull();
    const digest = sha256(model);
    expect(after.model).toMatchObject({
      url: `a/${MONITOR}.${digest.slice(0, 16)}.glb`,
      sha256: digest,
      bytes: gzip9(model).length,
      texture_bytes: 0,
    });
    for (const k of ["min", "max"] as const)
      after.model?.bounds[k].forEach((v, i) => expect(v, `bounds.${k}[${i}]`).toBeCloseTo(measured[k][i] ?? NaN, 6));
    // The frame box: the measured bounds through the placement's world transform, with no raise for a stand-in's
    // label, so its top drops by the label's lift and height and the studio's 1 cm.
    expect(after.frame_box.min).toEqual(before.frame_box.min);
    expect([after.frame_box.max[0], after.frame_box.max[2]]).toEqual([
      before.frame_box.max[0],
      before.frame_box.max[2],
    ]);
    expect(after.frame_box.max[1]).toBeCloseTo(before.frame_box.max[1] - 0.01 - LABEL_LIFT - LABEL_HEIGHT, 6);
    // The rest the 3D part holds of the piece stays, its stand-in among it, for a load that fails (FR-057).
    expect(set.scene.pieces[MONITOR]).toEqual(standin.scene.pieces[MONITOR]);
    expect(set.scene.load_order).toEqual([MONITOR]);
    expect(set.models.map((m) => m.piece)).toEqual([MONITOR]);
    expect(standin.manifest.standins).toContainEqual({ placement: MONITOR, reason: "no-model" });
    expect(set.manifest.standins.map((s) => s.placement)).not.toContain(MONITOR);
  });

  it.each(US4_VARIANTS)(
    "refuses %s naming its rule in strict mode, and keeps the stand-in with a warn line in lenient mode (scenario 2)",
    (id) => {
      const variant = rxVariants().find((v) => v.id === id);
      if (!variant) throw new Error(`no rxVariants() id ${id}`);
      // A desk's variant on fx-desk and a sign's on fx-sign, each under the catalog entry its bytes were made for, as
      // bad/RX4/ and bad/RX8/ lay them out; the clean desk and sign pass there, so only the variant's break refuses it.
      const onSign = variant.input === SIGN_INPUT;
      const template = badCases().find((c) => c.name === (onSign ? "RX8" : "RX4"));
      if (!template) throw new Error("no bad/RX4/ or bad/RX8/");
      const piece = onSign ? "fx-sign" : "fx-desk";
      expect(template.file).toBe(`assets/room/${piece}.glb`);
      const tree = (model: Uint8Array): Tree =>
        overlayTree(
          goodTree(),
          new Map([...template.changes, [template.file, model], ["assets/room/records.json", records(piece, model)]]),
        );
      const clean = compose(tree(onSign ? sign().bytes : desk().bytes), capsPolicy(), STRICT);
      expect(lines(clean.findings)).toEqual([]);
      expect(clean.scene.placements.find((p) => p.id === piece)?.model).not.toBeNull();

      const strict = compose(tree(variant.bytes), capsPolicy(), STRICT);
      const lenient = compose(tree(variant.bytes), capsPolicy(), LENIENT);
      expect(strict.findings.map((f) => `${f.rule} ${f.file}:${f.path}`)).toContain(
        `${variant.rule} ${template.file}:${variant.path}`,
      );
      // Every finding is the model's, and lenient: a strict build fails on it, a lenient one prints it prefixed warn.
      expect(strict.findings.every((f) => f.file === template.file && f.lenient)).toBe(true);
      expect(lenient.findings).toEqual(strict.findings);
      expect(lenient.findings.map((f) => formatFinding(f, "lenient"))).toEqual(
        strict.findings.map((f) => `warn ${formatFinding(f, "strict")}`),
      );
      for (const result of [strict, lenient]) {
        expect(result.scene.placements.find((p) => p.id === piece)?.model ?? null).toBeNull();
        expect(result.models.some((m) => m.piece === piece)).toBe(false);
        expect(result.manifest.standins).toContainEqual({ placement: piece, reason: "findings" });
      }
    },
  );
});

// T005 (spec 008; FR-015, FR-016, FR-057, FR-058, SC-002; plan.md §3.2, §3.5): each look's optional `highlight`, the
// band's and the edge's colours and CSS-pixel widths, which a look may leave out for Q5's figures, its edge then the
// look's ink. RI4 holds its colours to the look's own palette or #rrggbb; RW2 refuses a look, the scene's or another,
// whose band and edge both give under 3:1 against one colour of its palette (WCAG 2.2's 1.4.11), naming the rule, the
// look's file, and the path; and the compositor writes it resolved, to #rrggbb, into the 3D part's look, the lookdev
// page's looks, and the index's flat.highlight for the 2D drawing.
describe("the highlight (spec 008, T005)", () => {
  const LOOK = "apps/web/room/looks/fx-cel.yaml";
  const OTHER = "apps/web/room/looks/fx-flat.yaml";
  const lookText = (): string => decoder.decode(goodFiles().get(LOOK));
  const withHighlight = (yaml: string, file = LOOK, text = lookText()): Record<string, string> => ({
    [file]: `${text}highlight: ${yaml}\n`,
  });
  const STRICT_DRAFTS = { mode: "strict", drafts: true } as const;
  const rw2 = (findings: readonly Finding[]): string[] =>
    findings.filter((f) => f.rule === "RW2").map((f) => `${f.rule} ${f.file}:${f.path}`);

  it("passes Q5's colours, written out or left to the defaults, against every look's palette", () => {
    expect(rw2(compose(goodTree(), noPolicy(), STRICT_DRAFTS).findings)).toEqual([]);
    const written = overlay(withHighlight('{ band: "#ffd23f", band_px: 3, edge: fx-ink, edge_px: 1.5 }'));
    expect(lines(compose(written, noPolicy(), STRICT_DRAFTS).findings)).toEqual([]);
    const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
    const committed = compose(fileTree(ROOT), readRoomPolicy({ env: process.env, root: ROOT }), STRICT_DRAFTS);
    expect(rw2(committed.findings)).toEqual([]);
    expect(committed.drafts?.lookdev.looks.length).toBe(3);
  });

  it("is refused by RW2 where its band and edge both fall under 3:1 against a colour of the look's palette", () => {
    const grey = '{ band: "#7f7f7f", edge: "#909090" }';
    const result = compose(overlay(withHighlight(grey)), noPolicy(), STRICT_DRAFTS);
    expect(rw2(result.findings)).toEqual([`RW2 ${LOOK}:highlight`]);
    const hit = result.findings.find((f) => f.rule === "RW2");
    // The reason names the palette colour it fails against, a name of the look's, and the two contrasts, no value.
    expect(hit?.reason).toMatch(/fx-[a-z]+/);
    expect(hit?.reason).toMatch(/\d\.\d\d:1/);
    expect(hit?.reason).not.toMatch(/#[0-9a-f]{6}/);
    expect(hit?.lenient).toBe(false);
    // One tone passing is enough: against fx-floor the yellow band gives 2.72:1 and the ink 4.29:1, and against fx-ink
    // the band 11.66:1 and the ink 1:1, yet the pair passes, each colour held by one of them.
    const one = compose(overlay(withHighlight('{ band: "#ffd23f", edge: "#1d1d1f" }')), noPolicy(), STRICT_DRAFTS);
    expect(rw2(one.findings)).toEqual([]);
    // A mid grey band with the ink edge fails against fx-slate, whose dark green neither holds at 3:1 (2.9:1 and 1.4:1).
    const slate = compose(overlay(withHighlight('{ band: "#7f7f7f", edge: fx-ink }')), noPolicy(), STRICT_DRAFTS);
    expect(rw2(slate.findings)).toEqual([`RW2 ${LOOK}:highlight`]);
    expect(slate.findings.find((f) => f.rule === "RW2")?.reason).toContain("fx-slate");
  });

  // The review of Phase 1's nit: the band also stands at least 9:1 lighter than its edge, 9·(L_edge + 0.05) at most
  // L_band + 0.05, so the two tones read as one border's band and edge; Q5's pair stands at 0.54 to 0.73.
  it("is refused by RW2 where its band doesn't stand 9:1 lighter than its edge, though each palette colour is held", () => {
    const tones = compose(overlay(withHighlight('{ band: "#ffffff", edge: "#545454" }')), noPolicy(), STRICT_DRAFTS);
    expect(rw2(tones.findings)).toEqual([`RW2 ${LOOK}:highlight`]);
    expect(tones.findings.find((f) => f.rule === "RW2")?.reason).toMatch(/9:1/);
    // Q5's pair swapped, the ink the band: refused too.
    const swapped = compose(overlay(withHighlight('{ band: fx-ink, edge: "#ffd23f" }')), noPolicy(), STRICT_DRAFTS);
    expect(rw2(swapped.findings)).toEqual([`RW2 ${LOOK}:highlight`]);
    // Q5's own pair passes.
    expect(
      rw2(compose(overlay(withHighlight('{ band: "#ffd23f", edge: fx-ink }')), noPolicy(), STRICT_DRAFTS).findings),
    ).toEqual([]);
  });

  it("refuses a look that isn't the scene's too, since the lookdev page draws every look", () => {
    const other = lookText().replace("id: fx-cel", "id: fx-flat").replace("method: inked-cel", "method: flat");
    expect(other).not.toBe(lookText());
    const tree = overlay(withHighlight('{ band: "#7f7f7f", edge: "#909090" }', OTHER, other));
    expect(rw2(compose(tree, noPolicy(), STRICT_DRAFTS).findings)).toEqual([`RW2 ${OTHER}:highlight`]);
  });

  it("holds its colours to the look's own palette or #rrggbb (RI4), and RW2 then judges nothing it can't resolve", () => {
    const result = compose(overlay(withHighlight("{ band: fx-missing, edge: fx-ink }")), noPolicy(), STRICT_DRAFTS);
    expect(result.findings.map((f) => `${f.rule} ${f.file}:${f.path}`)).toEqual([`RI4 ${LOOK}:highlight.band`]);
    const edge = compose(overlay(withHighlight('{ band: "#ffd23f", edge: fx-gone }')), noPolicy(), STRICT_DRAFTS);
    expect(edge.findings.map((f) => `${f.rule} ${f.file}:${f.path}`)).toEqual([`RI4 ${LOOK}:highlight.edge`]);
  });

  it("is written resolved: the 3D part's look, the lookdev page's looks, and the index's flat.highlight", () => {
    const good = compose(goodTree(), noPolicy(), STRICT_DRAFTS);
    // Left out, Q5's band and widths, the edge the look's ink, fx-ink.
    const defaults = { band: "#ffd23f", band_px: 3, edge: "#1d1d1f", edge_px: 1.5 };
    expect(good.scene.look.highlight).toEqual(defaults);
    expect(good.index.flat.highlight).toEqual(defaults);
    expect(good.drafts?.lookdev.looks.map((l) => l.highlight)).toEqual([defaults]);
    const named = compose(
      overlay(withHighlight("{ band: fx-glow, band_px: 4, edge: fx-ink, edge_px: 2 }")),
      noPolicy(),
      STRICT_DRAFTS,
    );
    expect(lines(named.findings)).toEqual([]);
    const resolved = { band: "#ffcf70", band_px: 4, edge: "#1d1d1f", edge_px: 2 };
    expect(named.scene.look.highlight).toEqual(resolved);
    expect(named.index.flat.highlight).toEqual(resolved);
    expect(named.digest).not.toBe(good.digest);
  });

  it("composes byte for byte the same twice", () => {
    const tree = (): Tree => overlay(withHighlight("{ band: fx-glow, band_px: 4, edge: fx-ink, edge_px: 2 }"));
    const [a, b] = [compose(tree(), noPolicy(), STRICT_DRAFTS), compose(tree(), noPolicy(), STRICT_DRAFTS)];
    expect(JSON.stringify(b.index)).toBe(JSON.stringify(a.index));
    expect(JSON.stringify(b.scene)).toBe(JSON.stringify(a.scene));
    expect(b.digest).toBe(a.digest);
  });
});

// T034 (spec 008; FR-026, FR-056, FR-058, SC-006; plan.md §3.1, §3.5): the scene's optional walking block, which the
// 3D part carries resolved and the index never does; and RW1, which refuses a scene whose visitor figure's footprint,
// at the walking radius, isn't on the walkable floor compose/floor.ts computes from the frame boxes, naming the visitor
// placement's mount, so the walking view always starts free.
describe("the walking block and RW1 (spec 008, T034)", () => {
  const SCENE_FILE = "apps/web/room/scene.yaml";
  const sceneText = (): string => decoder.decode(goodFiles().get(SCENE_FILE));
  const STRICT_DRAFTS = { mode: "strict", drafts: true } as const;

  it("is carried resolved in the 3D part, the spec's defaults where the scene leaves it out, and never in the index", () => {
    const good = compose(goodTree(), noPolicy(), STRICT_DRAFTS);
    expect(good.scene.walking).toEqual({
      speed_mps: 1,
      turn_dps: 90,
      tilt_dps: 45,
      radius_m: 0.12,
      reach_m: 0.3,
      reach_cone_deg: 60,
      camera: { yaw_deg: 60, pitch_deg: [0, 35], min_distance_m: 1.2, focus_height_m: 1.1 },
    });
    expect(Object.keys(good.index)).not.toContain("walking");
    expect(JSON.stringify(good.index)).not.toContain("reach_cone_deg");
    const tuned = compose(
      overlay({ [SCENE_FILE]: `${sceneText()}walking: { speed_mps: 1.4, camera: { pitch_deg: [5, 30] } }\n` }),
      noPolicy(),
      STRICT_DRAFTS,
    );
    expect(lines(tuned.findings)).toEqual([]);
    expect(tuned.scene.walking.speed_mps).toBe(1.4);
    expect(tuned.scene.walking.camera.pitch_deg).toEqual([5, 30]);
    expect(tuned.digest).not.toBe(good.digest);
  });

  it("refuses with RW1 a visitor whose footprint isn't on the walkable floor, naming its mount, and passes the rest", () => {
    const inDesk = compose(
      overlay({ [SCENE_FILE]: sceneText().replace("offset: [0, 0, 0.8] }", "offset: [0, 0, -0.6] }") }),
      noPolicy(),
      STRICT_DRAFTS,
    );
    const rw1 = inDesk.findings.filter((f) => f.rule === "RW1");
    expect(rw1.map((f) => `${f.rule} ${f.file}:${f.path}`)).toEqual([`RW1 ${SCENE_FILE}:placements[8].mount.offset`]);
    expect(rw1[0]?.reason).toMatch(/fx-desk/);
    expect(rw1[0]?.lenient).toBe(false);
    // A radius that takes the start past the walls' margin: the floor's bound refuses it.
    const wide = compose(
      overlay({ [SCENE_FILE]: sceneText().replace("offset: [0, 0, 0.8] }", "offset: [1.95, 0, 0.8] }") }),
      noPolicy(),
      STRICT_DRAFTS,
    );
    expect(wide.findings.filter((f) => f.rule === "RW1").map((f) => f.path)).toEqual(["placements[8].mount.offset"]);
    expect(lines(compose(goodTree(), noPolicy(), STRICT_DRAFTS).findings)).toEqual([]);
  });
});
