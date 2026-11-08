// T083's plugin (spec 004; FR-011, FR-013, FR-066; R-08, R-10, R-43; contracts/room-bundle.md §3, §12;
// contracts/room-data-files.md §14, §15): build/room/plugin.ts's roomBundle(), its hooks called as Vite calls them over
// fixture trees and an injected policy, and builds of a small page through it. buildStart reads main's policy as
// policy.ts does (ROOM_POLICY_DIR, else refs/heads/main, else the export's own copy) and composes once, in lenient
// mode, with drafts from ROOM_DRAFTS: each finding lenient mode tolerates prints through this.warn, prefixed `warn`,
// and the piece keeps its stand-in; any other fails the build through this.error, every such line in it. resolveId and
// load give `virtual:room-content` (spec 002's `content`, its messages and the manifest, now B7's, and the index as
// `room`), `virtual:room-scene` (the 3D part, its default export), and in a drafts build the fixtures and the lookdev
// inputs, each exactly the compose's; a release build that imports either fails with FR-066's words (resolveId's own
// refusal is dist.test.ts's, T069). generateBundle emits each set model's gzip-9 copy, each set card, and
// room-manifest.json, and a build through the plugin writes nothing outside dist/. The declarations in
// src/room/content.d.ts are held to the bundle's types. The site's own build takes the plugin with the room's first
// data (T096).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";
import type { Plugin } from "vite";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type * as RoomContentModule from "virtual:room-content";
import type roomFixtures from "virtual:room-fixtures";
import type roomLookdev from "virtual:room-lookdev";
import type * as RoomLookdevModule from "virtual:room-lookdev";
import type roomScene from "virtual:room-scene";

import { readMessages } from "../../build/manifest";
import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import type { RoomFixture, RoomLookdev } from "../../build/room/emit";
import { roomBundle } from "../../build/room/plugin";
import { noPolicy } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import { fileTree, overlayTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import type { RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import { png } from "../helpers/glb";
import { badCases, caseTree, goodFiles, goodTree, overlay } from "../helpers/room-fixtures";
import type { BadCase } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";
import { callHook, hookContext } from "../helpers/vite-plugin";

const MESSAGES = fileURLToPath(new URL("../../content/messages.yaml", import.meta.url));
/** The pieces whose models the tests set, beside the sign's image card. */
const SET = ["fx-board", "fx-desk", "fx-plug"];
const decoder = new TextDecoder();
const sha256 = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");
/** A value as JSON holds it, so a compose's outputs compare with what a module or a file says. */
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/** Files written under `root`, by repository path. */
function write(root: string, files: Iterable<readonly [string, string | Uint8Array]>): void {
  for (const [path, data] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), data);
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

/** The fixture set's changes that set three pieces' models and the sign's image card, each recorded (RI7). */
function setPieces(): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = { ...modelChanges(SET) };
  const card = png({ width: 64, height: 32 });
  const records = JSON.parse(decoder.decode(files["assets/room/records.json"] as Uint8Array)) as {
    entries: { file: string; sha256: string; kind: string }[];
  };
  records.entries.push({ file: "fx-sign.png", sha256: sha256(card), kind: "room" });
  const sign = decoder.decode(goodFiles().get("apps/web/room/catalog/fx-sign.yaml"));
  return {
    ...files,
    "assets/room/records.json": `${JSON.stringify(records, null, 2)}\n`,
    "assets/room/fx-sign.png": card,
    "apps/web/room/catalog/fx-sign.yaml": `${sign}model: { card: fx-sign.png }\n`,
  };
}

/** The known-bad case of a rule, by its folder's name. */
function badCase(name: string): BadCase {
  const found = badCases().find((c) => c.name === name);
  if (!found) throw new Error(`no known-bad case ${name}`);
  return found;
}

/** The plugin over a tree and a policy the test gives. */
function bundle(tree: () => Tree, policy: () => RoomPolicy = noPolicy): Plugin {
  return roomBundle({ root: temp("room-plugin-root-"), messages: MESSAGES, tree, policy });
}

/** A module's exports as load writes them, a line each: `export const <name> = <JSON>;` or `export default <JSON>;`. */
function exportsOf(code: unknown): Record<string, unknown> {
  if (typeof code !== "string") throw new Error("load gave no module");
  const out: Record<string, unknown> = {};
  for (const line of code.split("\n").filter((l) => l !== "")) {
    const m = /^export (?:const (\w+) =|default) (.*);$/.exec(line);
    if (!m) throw new Error(`not an export line: ${line.slice(0, 60)}`);
    out[m[1] ?? "default"] = JSON.parse(m[2] ?? "");
  }
  return out;
}

/** buildStart, then a module resolved and loaded, as Vite would. */
function loadModule(plugin: Plugin, context: object, id: string): Record<string, unknown> {
  const resolved = callHook(plugin, "resolveId", context, id, undefined, {});
  expect(resolved).toBe(`\0${id}`);
  return exportsOf(callHook(plugin, "load", context, resolved));
}

describe("buildStart (contracts/room-bundle.md §12)", () => {
  it("composes once, in lenient mode, with drafts from ROOM_DRAFTS, and the other hooks read that compose", () => {
    for (const [flag, drafts] of [
      ["", false],
      ["1", true],
    ] as const) {
      vi.stubEnv("ROOM_DRAFTS", flag);
      const tree = vi.fn(() => overlay(setPieces()));
      const policy = vi.fn(capsPolicy);
      const plugin = bundle(tree, policy);
      const h = hookContext();
      callHook(plugin, "buildStart", h.context, {});
      const expected = compose(overlay(setPieces()), capsPolicy(), { mode: "lenient", drafts });
      const content = loadModule(plugin, h.context, "virtual:room-content");
      expect(content.room).toEqual(json(expected.index));
      expect((content.room as RoomIndex).build.kind).toBe(drafts ? "drafts" : "release");
      expect(loadModule(plugin, h.context, "virtual:room-scene").default).toEqual(json(expected.scene));
      callHook(plugin, "generateBundle", h.context, {}, {});
      expect(tree).toHaveBeenCalledTimes(1);
      expect(policy).toHaveBeenCalledTimes(1);
      expect([h.warnings, h.errors]).toEqual([[], []]);
    }
  });

  it("builds on past a rule only strict mode runs", () => {
    vi.stubEnv("ROOM_DRAFTS", "");
    const c = badCase("RT9");
    const strict = compose(caseTree(c), c.policy, { mode: "strict", drafts: false });
    expect(strict.findings.map((f) => f.rule)).toContain("RT9");
    const plugin = bundle(
      () => caseTree(c),
      () => c.policy,
    );
    const h = hookContext();
    callHook(plugin, "buildStart", h.context, {});
    expect([h.warnings, h.errors]).toEqual([[], []]);
  });

  it("prints each finding lenient mode tolerates through this.warn, prefixed warn, and the piece keeps its stand-in", () => {
    vi.stubEnv("ROOM_DRAFTS", "");
    const c = badCase("RX7");
    const plugin = bundle(() => caseTree(c), capsPolicy);
    const h = hookContext();
    callHook(plugin, "buildStart", h.context, {});
    const expected = compose(caseTree(c), capsPolicy(), { mode: "lenient", drafts: false });
    expect(expected.findings.length).toBeGreaterThan(0);
    expect(expected.findings.every((f) => f.lenient)).toBe(true);
    expect(h.warnings).toEqual(expected.findings.map((f) => formatFinding(f, "lenient")));
    for (const line of h.warnings) expect(line).toMatch(/^warn RX7 assets\/room\/fx-desk\.glb:-: /);
    expect(h.errors).toEqual([]);
    callHook(plugin, "generateBundle", h.context, {}, {});
    const manifest = h.emitted.find((e) => e.fileName === "room-manifest.json");
    expect(JSON.parse(String(manifest?.source)).standins).toContainEqual({ placement: "fx-desk", reason: "findings" });
  });

  it("fails through this.error on any other finding, every such line in it, after warning the lenient ones", () => {
    vi.stubEnv("ROOM_DRAFTS", "");
    const [rx, ri] = [badCase("RX7"), badCase("RI4")];
    const tree = (): Tree => overlayTree(goodTree(), new Map([...rx.changes, ...ri.changes]));
    const h = hookContext();
    expect(() => callHook(bundle(tree, capsPolicy), "buildStart", h.context, {})).toThrow();
    const findings = compose(tree(), capsPolicy(), { mode: "lenient", drafts: false }).findings;
    const refused = findings.filter((f) => !f.lenient);
    expect(refused.map((f) => f.rule)).toContain("RI4");
    expect(h.warnings).toEqual(findings.filter((f) => f.lenient).map((f) => formatFinding(f, "lenient")));
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0]?.split("\n")).toEqual(refused.map((f) => formatFinding(f, "lenient")));
    expect(h.errors[0]).not.toMatch(/(^|\n)warn /);
  });

  describe("reads main's policy as policy.ts does, by default", () => {
    const caps = `${JSON.stringify({ schema: 1, per_asset: { room: { ...capsPolicy().caps } } }, null, 2)}\n`;
    /** The manifest's caps, as a plugin over `root` with no policy given reads them. */
    function capsRead(root: string): unknown {
      const plugin = roomBundle({ root, messages: MESSAGES });
      const h = hookContext();
      callHook(plugin, "buildStart", h.context, {});
      callHook(plugin, "generateBundle", h.context, {}, {});
      return JSON.parse(String(h.emitted.find((e) => e.fileName === "room-manifest.json")?.source)).caps;
    }

    it("from ROOM_POLICY_DIR first", () => {
      const root = temp("room-plugin-tree-");
      write(root, goodFiles());
      const dir = temp("room-plugin-policy-");
      write(dir, [["caps.json", caps]]);
      vi.stubEnv("ROOM_POLICY_DIR", dir);
      expect(capsRead(root)).toEqual({ source: "policy-dir", sha256: sha256(caps) });
    });

    it("else from refs/heads/main, never the branch's copy", () => {
      const root = temp("room-plugin-repo-");
      const git = (...args: string[]): void => {
        execFileSync("git", ["-C", root, ...args], {
          stdio: "ignore",
          env: {
            PATH: process.env.PATH ?? "/usr/bin:/bin",
            HOME: root,
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_AUTHOR_NAME: "t",
            GIT_AUTHOR_EMAIL: "t@example.invalid",
            GIT_COMMITTER_NAME: "t",
            GIT_COMMITTER_EMAIL: "t@example.invalid",
          },
        });
      };
      git("init", "-q", "-b", "main");
      write(root, [...goodFiles(), ["assets/policy/caps.json", caps]]);
      git("add", "-A");
      git("commit", "-qm", "main");
      git("switch", "-qc", "feature");
      write(root, [["assets/policy/caps.json", caps.replace("2500000", "9999999")]]);
      vi.stubEnv("ROOM_POLICY_DIR", "");
      expect(capsRead(root)).toEqual({ source: "main", sha256: sha256(caps) });
    });

    it("else, where there is no .git, from the export's own copy", () => {
      const root = temp("room-plugin-export-");
      write(root, [...goodFiles(), ["assets/policy/caps.json", caps]]);
      vi.stubEnv("ROOM_POLICY_DIR", "");
      expect(capsRead(root)).toEqual({ source: "export", sha256: sha256(caps) });
    });
  });
});

describe("resolveId and load (contracts/room-bundle.md §3)", () => {
  it("resolve virtual:room-content and virtual:room-scene, and leave every other module to Vite", () => {
    const plugin = bundle(goodTree);
    const h = hookContext();
    callHook(plugin, "buildStart", h.context, {});
    expect(callHook(plugin, "resolveId", h.context, "virtual:room-content", undefined, {})).toBe(
      "\0virtual:room-content",
    );
    expect(callHook(plugin, "resolveId", h.context, "virtual:room-scene", undefined, {})).toBe("\0virtual:room-scene");
    for (const id of ["./main.ts", "virtual:room-other", "three"])
      expect(callHook(plugin, "resolveId", h.context, id, undefined, {})).toBeNull();
    expect(callHook(plugin, "load", h.context, "/src/main.ts")).toBeNull();
  });

  it("give virtual:room-content spec 002's content, its messages and the manifest, and the index as room", () => {
    vi.stubEnv("ROOM_DRAFTS", "");
    const plugin = bundle(() => overlay(setPieces()), capsPolicy);
    const h = hookContext();
    callHook(plugin, "buildStart", h.context, {});
    const expected: ComposeResult = compose(overlay(setPieces()), capsPolicy(), { mode: "lenient", drafts: false });
    const module = loadModule(plugin, h.context, "virtual:room-content");
    expect(Object.keys(module)).toEqual(["content", "room"]);
    expect(module.content).toEqual(json({ messages: readMessages(MESSAGES), manifest: expected.manifest }));
    expect(module.room).toEqual(json(expected.index));
    expect(h.watched).toEqual([MESSAGES]);
  });

  it("give virtual:room-scene the 3D part as its default export, beside nothing else", () => {
    const plugin = bundle(() => overlay(setPieces()), capsPolicy);
    const h = hookContext();
    callHook(plugin, "buildStart", h.context, {});
    const module = loadModule(plugin, h.context, "virtual:room-scene");
    expect(Object.keys(module)).toEqual(["default"]);
    const scene = compose(overlay(setPieces()), capsPolicy(), { mode: "lenient", drafts: false }).scene;
    expect(module.default).toEqual(json(scene));
    expect((module.default as RoomScene).digest).toBe(
      (loadModule(plugin, h.context, "virtual:room-content").room as RoomIndex).digest,
    );
  });

  it("give a drafts build the fixtures and the lookdev inputs, each its module's default export", () => {
    vi.stubEnv("ROOM_DRAFTS", "1");
    const plugin = bundle(goodTree);
    const h = hookContext();
    callHook(plugin, "buildStart", h.context, {});
    const { drafts, index, roomText } = compose(goodTree(), noPolicy(), { mode: "lenient", drafts: true });
    expect(drafts?.fixtures.length).toBeGreaterThan(0);
    expect(loadModule(plugin, h.context, "virtual:room-fixtures")).toEqual({ default: json(drafts?.fixtures) });
    // The lookdev page's own copy of the index, beside its inputs, as `room`: importing virtual:room-content would
    // take the index out of the room's entry chunk in a drafts build (plan.md §10). And the drafts build's room_text, as
    // `text`, so the page, and the phone copy that makes no request, draw the faces' words (spec 004, T192).
    expect(roomText.blocks.length).toBeGreaterThan(0);
    expect(loadModule(plugin, h.context, "virtual:room-lookdev")).toEqual({
      default: json(drafts?.lookdev),
      room: json(index),
      text: json(roomText),
    });
  });
});

describe("generateBundle (contracts/room-bundle.md §3.4, §6)", () => {
  it("emits each set model's gzip-9 copy and each set card under its fixed name, and room-manifest.json", () => {
    const plugin = bundle(() => overlay(setPieces()), capsPolicy);
    const h = hookContext();
    callHook(plugin, "buildStart", h.context, {});
    callHook(plugin, "generateBundle", h.context, {}, {});
    const expected = compose(overlay(setPieces()), capsPolicy(), { mode: "lenient", drafts: false });
    expect(expected.models.map((m) => m.piece)).toEqual(SET);
    expect(expected.cards.map((c) => c.piece)).toEqual(["fx-sign"]);
    expect(h.emitted.map((e) => e.fileName)).toEqual([
      ...expected.models.map((m) => `${m.url}.gz`),
      ...expected.cards.map((c) => c.url),
      "room-manifest.json",
    ]);
    for (const m of expected.models) expect(h.emitted.find((e) => e.fileName === `${m.url}.gz`)?.source).toEqual(m.gz);
    for (const c of expected.cards) expect(h.emitted.find((e) => e.fileName === c.url)?.source).toEqual(c.bytes);
    expect(h.emitted.find((e) => e.fileName === "room-manifest.json")?.source).toBe(
      `${JSON.stringify(expected.manifest, null, 2)}\n`,
    );
    expect(h.emitted.filter((e) => e.fileName.endsWith(".glb"))).toEqual([]);
  });
});

describe("a build through the plugin", () => {
  const PAGE =
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Fixture page</title></head>' +
    '<body><script type="module" src="./main.js"></script></body></html>\n';

  /** A page whose script is `main`, built through `plugin` into its folder's dist/, Vite's cache kept elsewhere. */
  async function buildPage(site: string, main: string, plugin: Plugin): Promise<void> {
    write(site, [
      ["index.html", PAGE],
      ["main.js", main],
    ]);
    await build({
      configFile: false,
      root: site,
      logLevel: "silent",
      publicDir: false,
      cacheDir: join(temp("room-plugin-cache-"), "vite"),
      build: { outDir: join(site, "dist"), emptyOutDir: true },
      plugins: [plugin],
    });
  }

  it("writes dist/ and nothing outside it: the page's chunks, each set model's copy and card, and the manifest", async () => {
    vi.stubEnv("ROOM_DRAFTS", "");
    const top = temp("room-plugin-build-");
    const [data, site] = [join(top, "repository"), join(top, "page")];
    write(data, [...goodFiles(), ...Object.entries(setPieces())]);
    const main =
      'import { content, room } from "virtual:room-content";\n' +
      "globalThis.room = { content, room };\n" +
      'import("virtual:room-scene").then((m) => { globalThis.scene = m.default; });\n';
    write(site, [
      ["index.html", PAGE],
      ["main.js", main],
    ]);
    const before = snapshot(top);
    await buildPage(site, main, roomBundle({ root: data, messages: MESSAGES, policy: capsPolicy }));
    const after = snapshot(top);
    expect(new Map([...after].filter(([p]) => !p.startsWith("page/dist/")))).toEqual(before);
    const expected = compose(fileTree(data), capsPolicy(), { mode: "lenient", drafts: false });
    const built = [...after.keys()].filter((p) => p.startsWith("page/dist/")).map((p) => p.slice("page/dist/".length));
    expect(built.filter((p) => p.startsWith("a/")).sort()).toEqual(
      [...expected.models.map((m) => `${m.url}.gz`), ...expected.cards.map((c) => c.url)].sort(),
    );
    expect(built.filter((p) => p.endsWith(".glb"))).toEqual([]);
    for (const m of expected.models)
      expect(Buffer.compare(readFileSync(join(site, "dist", `${m.url}.gz`)), Buffer.from(m.gz))).toBe(0);
    for (const c of expected.cards)
      expect(Buffer.compare(readFileSync(join(site, "dist", c.url)), Buffer.from(c.bytes))).toBe(0);
    expect(JSON.parse(readFileSync(join(site, "dist/room-manifest.json"), "utf8"))).toEqual(json(expected.manifest));
    // The index reached the entry chunk and the 3D part a chunk of its own: each carries the digest.
    const scripts = built.filter((p) => p.endsWith(".js")).map((p) => readFileSync(join(site, "dist", p), "utf8"));
    expect(scripts.filter((s) => s.includes(expected.digest))).toHaveLength(2);
  });

  it("fails a release build that imports a drafts-only module, with FR-066's words", async () => {
    vi.stubEnv("ROOM_DRAFTS", "");
    const site = temp("room-plugin-page-");
    for (const id of ["virtual:room-fixtures", "virtual:room-lookdev"])
      await expect(
        buildPage(site, `import value from "${id}";\nglobalThis.value = value;\n`, bundle(goodTree)),
      ).rejects.toThrow("fixtures and lookdev are drafts-only (FR-066)");
  });

  it("gives a drafts build both drafts-only modules", async () => {
    vi.stubEnv("ROOM_DRAFTS", "1");
    const site = temp("room-plugin-page-");
    const main =
      'import fixtures from "virtual:room-fixtures";\nimport lookdev from "virtual:room-lookdev";\n' +
      "globalThis.drafts = { fixtures, lookdev };\n";
    await buildPage(site, main, bundle(goodTree));
    const drafts = compose(goodTree(), noPolicy(), { mode: "lenient", drafts: true }).drafts;
    const scripts = readdirSync(join(site, "dist/assets"))
      .filter((n) => n.endsWith(".js"))
      .map((n) => readFileSync(join(site, "dist/assets", n), "utf8"))
      .join("\n");
    for (const f of drafts?.fixtures ?? []) expect(scripts).toContain(f.id);
    for (const l of drafts?.lookdev.looks ?? []) expect(scripts).toContain(l.id);
  });
});

describe("the modules' declarations (src/room/content.d.ts)", () => {
  it("type the index, the 3D part, the fixtures, and the lookdev inputs as the compose writes them", () => {
    expectTypeOf<typeof RoomContentModule.room>().toEqualTypeOf<RoomIndex>();
    expectTypeOf<typeof roomScene>().toEqualTypeOf<RoomScene>();
    expectTypeOf<typeof roomFixtures>().toEqualTypeOf<readonly RoomFixture[]>();
    expectTypeOf<typeof roomLookdev>().toEqualTypeOf<RoomLookdev>();
    expectTypeOf<typeof RoomLookdevModule.room>().toEqualTypeOf<RoomIndex>();
  });
});
