// T041 and T043 (spec 002; SC-005; plan "Performance Goals"; research.md R-11): the 3D code is its own chunk, reached
// only by a dynamic import after the WebGL 2 check, so the choice screen's JavaScript stays small and a device without
// WebGL 2 never downloads Three.js; and the build writes room-manifest.json from the same source as the room (T046).
// The builds are the global setup's (test/global-build.ts; spec 004, T084).
// T093 (spec 004; FR-011, FR-066; R-11, R-43, R-67; contracts/room-bundle.md §3, §6): the same checks over the
// release build and the drafts build, and the room's bundle in each, placed by the modules each chunk holds: the
// index, `room` in `virtual:room-content`, sits in the entry chunk, at most 16,384 bytes at gzip level 9, the entry
// within 150 KB; the 3D part, `virtual:room-scene`, only in a chunk the entry reaches by a dynamic import, which the
// bundle's digest reaches the page through; no zod, fontkit, pako, TypeScript parser, or GLB reader in a chunk the
// entry or the 3D chunk loads; and room-manifest.json is compose()'s manifest, its build_kind the build's. The
// expectations come from compose() over the repository, as each build composed it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

import { serialize } from "../../build/room/emit";
import { gzipBytes } from "../../src/room/glb/gzip";
import { repositoryBundle } from "../helpers/room";

/** A string Three.js's renderer carries in a production build. */
const THREE_MARK = "THREE.WebGLRenderer";
/** The plan's budget for the JavaScript before the 3D chunk, compressed. */
const ENTRY_BUDGET = 150 * 1024;
/** The index's budget in the entry chunk: 16 KB at gzip level 9 (contracts/room-bundle.md §3). */
const INDEX_BUDGET = 16_384;
/** The bundle's two modules, as the build's chunks name them. */
const CONTENT = "\0virtual:room-content";
const SCENE = "\0virtual:room-scene";
/** The scene module, the only one that imports the 3D part. */
const SCENE_MODULE = "apps/web/src/room/scene.ts";
/** What no chunk the room's entry or its 3D chunk loads may hold: the compositor's libraries, which stay in Node, and
 *  the GLB reader, which only the lookdev page's own chunk carries (R-08; FR-068). */
const NODE_ONLY: readonly (readonly [string, RegExp])[] = [
  ["zod", /^node_modules\/zod\//],
  ["fontkit", /^node_modules\/fontkit\//],
  ["pako", /^node_modules\/pako\//],
  ["the TypeScript parser", /^node_modules\/typescript\//],
  ["the GLB reader", /^apps\/web\/src\/room\/glb\//],
];

const encoder = new TextEncoder();
const builds = inject("siteBuilds");
const chunks = inject("siteChunks");

describe.each(["release", "drafts"] as const)("the %s build", (kind) => {
  const out = builds[kind];
  const read = (rel: string): string => readFileSync(join(out, rel), "utf8");
  /** The room's bundle as this build composed it: the repository's data, under an empty policy directory, with the
   *  tree's own twin readiness, as build/room/plugin.ts reads it, so the digests and each `ready` follow whatever the
   *  Author's readiness file marks (spec 009's intake gate, F2). */
  const bundle = (): ReturnType<typeof repositoryBundle> =>
    repositoryBundle({ drafts: kind === "drafts", policy: "empty", readiness: "tree" });

  /** The relative paths a chunk imports statically and dynamically. */
  function imports(code: string): { statics: string[]; dynamics: string[] } {
    const statics = [...code.matchAll(/(?:^|[;\s}])import\s*(?:[\w*{}\s,$]+?from\s*)?["']\.\/([^"']+\.js)["']/g)].map(
      (m) => m[1] ?? "",
    );
    // Rolldown writes a dynamic import's specifier as a template literal.
    const dynamics = [...code.matchAll(/import\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g)].map((m) => m[1] ?? "");
    return { statics, dynamics };
  }

  function entry(): string {
    const doc = new JSDOM(read("index.html")).window.document;
    const src = doc.querySelector('script[type="module"][src]')?.getAttribute("src") ?? "";
    expect(src).toMatch(/^\.\/assets\/.+\.js$/);
    return src.replace(/^\.\//, "");
  }

  /** Every chunk the entry loads before anything dynamic: itself and its static imports, transitively. */
  function staticGraph(start: string): string[] {
    const seen = new Set<string>();
    const visit = (rel: string): void => {
      if (seen.has(rel)) return;
      seen.add(rel);
      const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
      for (const s of imports(read(rel)).statics) visit(dir + s);
    };
    visit(start);
    return [...seen];
  }

  /** What the entry's dynamic imports load: each chunk they name, and its static imports, transitively. */
  function dynamicGraph(): string[] {
    const dynamics = staticGraph(entry()).flatMap((rel) => {
      const dir = rel.slice(0, rel.lastIndexOf("/") + 1);
      return imports(read(rel)).dynamics.map((d) => dir + d);
    });
    return [...new Set(dynamics.flatMap((d) => staticGraph(d)))];
  }

  /** The chunks that hold a module. */
  const holding = (module: string): string[] =>
    Object.entries(chunks[kind])
      .filter(([, modules]) => modules.includes(module))
      .map(([file]) => file);

  describe("the 3D chunk", () => {
    it("isn't in what the choice screen loads", () => {
      for (const rel of staticGraph(entry())) expect(read(rel).includes(THREE_MARK), rel).toBe(false);
      const doc = new JSDOM(read("index.html")).window.document;
      for (const link of doc.querySelectorAll('link[rel="modulepreload"]')) {
        const href = (link.getAttribute("href") ?? "").replace(/^\.\//, "");
        expect(read(href).includes(THREE_MARK), href).toBe(false);
      }
    });

    it("is its own chunk, which the entry imports dynamically", () => {
      const scripts = readdirSync(join(out, "assets")).filter((f) => f.endsWith(".js"));
      const three = scripts.filter((f) => read(`assets/${f}`).includes(THREE_MARK));
      expect(three).toHaveLength(1);
      // The dynamic import reaches the chunk that holds Three.js, itself or through its own static imports.
      expect(dynamicGraph()).toContain(`assets/${three[0]}`);
    });

    it("leaves the choice screen's JavaScript and CSS under the plan's 150 KB, compressed", () => {
      const doc = new JSDOM(read("index.html")).window.document;
      const css = [...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) =>
        (l.getAttribute("href") ?? "").replace(/^\.\//, ""),
      );
      const bytes = [...staticGraph(entry()), ...css].reduce((n, rel) => n + gzipSync(read(rel)).length, 0);
      expect(bytes).toBeLessThan(ENTRY_BUDGET);
    });
  });

  describe("the room's bundle (FR-011)", () => {
    it("puts the index, `room`, in the entry chunk, within 16,384 bytes at gzip level 9", () => {
      const { index } = bundle();
      expect(holding(CONTENT)).toEqual([entry()]);
      expect(read(entry()).includes(index.digest), "the entry chunk holds the index's digest").toBe(true);
      expect(gzipBytes(encoder.encode(serialize(index)))).toBeLessThanOrEqual(INDEX_BUDGET);
    });

    it("puts the 3D part only behind the entry's dynamic import, beside the scene module, the digest with it", () => {
      const { scene } = bundle();
      const at = holding(SCENE);
      expect(at).toHaveLength(1);
      const part = at[0] as string;
      expect(staticGraph(entry())).not.toContain(part);
      const doc = new JSDOM(read("index.html")).window.document;
      const preloaded = [...doc.querySelectorAll('link[rel="modulepreload"]')].map((l) =>
        (l.getAttribute("href") ?? "").replace(/^\.\//, ""),
      );
      expect(preloaded).not.toContain(part);
      expect(dynamicGraph()).toContain(part);
      // Only the scene module imports it, so it lands in the scene module's chunk or one that chunk imports.
      const sceneChunks = holding(SCENE_MODULE);
      expect(sceneChunks).toHaveLength(1);
      expect(staticGraph(sceneChunks[0] as string)).toContain(part);
      expect(read(part).includes(scene.digest), `${part} holds the 3D part's digest`).toBe(true);
    });

    it("keeps zod, fontkit, pako, the TypeScript parser, and the GLB reader out of what the room loads", () => {
      const loaded = [...new Set([...staticGraph(entry()), ...dynamicGraph()])];
      expect(loaded.length).toBeGreaterThan(1);
      const found: string[] = [];
      for (const rel of loaded) {
        const modules = chunks[kind][rel];
        // Every chunk the room loads is one the build wrote, with its modules named as the patterns read them.
        expect(modules, rel).toBeDefined();
        for (const [name, pattern] of NODE_ONLY)
          if (modules?.some((m) => pattern.test(m))) found.push(`${rel} holds ${name}`);
      }
      expect(found).toEqual([]);
      expect(loaded.flatMap((rel) => chunks[kind][rel] ?? []).some((m) => m.startsWith("node_modules/three/"))).toBe(
        true,
      );
    });
  });

  describe("room-manifest.json (Amendment B7)", () => {
    it(`is compose()'s manifest, its build_kind "${kind}"`, () => {
      const manifest = JSON.parse(read("room-manifest.json")) as { build_kind?: unknown };
      expect(manifest).toEqual(JSON.parse(JSON.stringify(bundle().manifest)));
      expect(manifest.build_kind).toBe(kind);
    });
  });
});
