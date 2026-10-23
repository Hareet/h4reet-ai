// T121 (spec 004; FR-066, User Story 3 scenario 4; Amendment B11; R-43; contracts/lookdev.md §8 layers 1, 2, and 4,
// §11): the lookdev page and the fixtures reach drafts builds only, over the global setup's two builds of the site
// (test/global-build.ts), each under an empty policy directory.
// - Layer 1, the input: the release build has no lookdev/ and no file carrying the page's marker, `<meta
//   name="h4-lookdev" content="drafts-only">`; the drafts build has lookdev/index.html with the marker, its script and
//   style the site's own, from relative paths, with nothing inline the site's CSP would refuse.
// - Layer 2, the modules: neither drafts-only module, `virtual:room-fixtures` or `virtual:room-lookdev`, is in any chunk
//   of the release build; in the drafts build only the page's own graph reaches them.
// - Layer 4, these tests: the release build holds no fixture's name and no draft room text, and its manifest says
//   `release`; the drafts build's entry chunk, and every chunk it loads statically, never reach src/lookdev/**, the GLB
//   reader (src/room/glb/), or pako, and nothing the room loads, even behind its dynamic import, reaches the page's code.
// The fixtures and the draft text come from compose() over the repository, as the drafts build composed it.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

import { repositoryBundle } from "../helpers/room";

const builds = inject("siteBuilds");
const chunks = inject("siteChunks");

/** The page's marker, which only a drafts build's lookdev page carries. */
const MARKER = /<meta\s+name="h4-lookdev"\s+content="drafts-only"\s*\/?>/;
/** The marker's name, which no file of a release build holds in any form. */
const MARKER_NAME = "h4-lookdev";
/** The two drafts-only modules, as the builds' chunks name them. */
const DRAFTS_MODULES = ["\0virtual:room-fixtures", "\0virtual:room-lookdev"];
/** The page's code, the GLB reader, and pako, which the room's entry never loads statically (§8, layer 4). */
const PAGE_ONLY: readonly (readonly [string, RegExp])[] = [
  ["the lookdev page's code", /^apps\/web\/src\/lookdev\//],
  ["the GLB reader", /^apps\/web\/src\/room\/glb\//],
  ["pako", /^node_modules\/pako\//],
];

/** Every file under a build, by its path from the build's folder, `/`-separated. */
function builtFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(relative(root, path).split("\\").join("/"));
    }
  };
  walk(root);
  return found.sort();
}

/** A build's chunks, read as the chunk test reads them: each one's static and dynamic imports, by path. */
function graph(root: string): {
  read(rel: string): string;
  staticGraph(start: string): string[];
  dynamicGraph(start: string): string[];
} {
  const read = (rel: string): string => readFileSync(join(root, rel), "utf8");
  const imports = (rel: string): { statics: string[]; dynamics: string[] } => {
    const code = read(rel);
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
    const statics = [...code.matchAll(/(?:^|[;\s}])import\s*(?:[\w*{}\s,$]+?from\s*)?["']\.\/([^"']+\.js)["']/g)];
    // Rolldown writes a dynamic import's specifier as a template literal.
    const dynamics = [...code.matchAll(/import\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g)];
    return { statics: statics.map((m) => dir + (m[1] ?? "")), dynamics: dynamics.map((m) => dir + (m[1] ?? "")) };
  };
  const staticGraph = (start: string): string[] => {
    const seen = new Set<string>();
    const visit = (rel: string): void => {
      if (seen.has(rel)) return;
      seen.add(rel);
      for (const s of imports(rel).statics) visit(s);
    };
    visit(start);
    return [...seen];
  };
  const dynamicGraph = (start: string): string[] => {
    const seen = new Set<string>();
    const visit = (rel: string): void => {
      if (seen.has(rel)) return;
      seen.add(rel);
      const { statics, dynamics } = imports(rel);
      for (const s of [...statics, ...dynamics]) visit(s);
    };
    visit(start);
    return [...seen];
  };
  return { read, staticGraph, dynamicGraph };
}

/** The module script a page of a build loads, as a path from the build's folder. */
function entryOf(root: string, page: string): string {
  const doc = new JSDOM(readFileSync(join(root, page), "utf8")).window.document;
  const src = doc.querySelector('script[type="module"][src]')?.getAttribute("src") ?? "";
  expect(src, `${page}'s module script`).not.toBe("");
  const dir = page.includes("/") ? page.slice(0, page.lastIndexOf("/") + 1) : "";
  const at = new URL(src, `http://site.invalid/${dir}`).pathname.slice(1);
  expect(builtFiles(root), `${page}'s script ${src}`).toContain(at);
  return at;
}

/** The modules of the chunks named, `<chunk>: <module>`, those a pattern matches. */
function modulesIn(kind: "release" | "drafts", files: readonly string[], pattern: RegExp): string[] {
  return files.flatMap((rel) => (chunks[kind][rel] ?? []).filter((m) => pattern.test(m)).map((m) => `${rel}: ${m}`));
}

const drafts = (): ReturnType<typeof repositoryBundle> => repositoryBundle({ drafts: true, policy: "empty" });

describe("the release build (contracts/lookdev.md §8)", () => {
  const root = builds.release;
  const files = builtFiles(root);

  it("has no lookdev/ and no file carrying the page's marker (layer 1)", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => f === "lookdev" || f.startsWith("lookdev/"))).toEqual([]);
    const marked = files.filter((f) => readFileSync(join(root, f), "latin1").includes(MARKER_NAME));
    expect(marked).toEqual([]);
  });

  it("holds neither drafts-only module in any chunk (layer 2)", () => {
    const held = Object.entries(chunks.release).flatMap(([chunk, modules]) =>
      modules
        .filter((m) => DRAFTS_MODULES.includes(m) || /^apps\/web\/src\/lookdev\//.test(m))
        .map((m) => `${chunk}: ${m}`),
    );
    expect(held).toEqual([]);
  });

  it("holds no fixture's name and no draft room text, and its manifest says release (layer 4)", () => {
    const bundle = drafts();
    const fixtures = bundle.drafts?.fixtures.map((f) => f.id) ?? [];
    expect(fixtures.length, "the repository's fixtures").toBeGreaterThan(0);
    const lines = bundle.roomText.blocks.filter((b) => b.state === "draft").flatMap((b) => b.lines.map((l) => l.text));
    const found: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(root, f), "utf8");
      for (const id of fixtures) if (text.includes(id)) found.push(`${f} holds the fixture ${id}`);
      for (const line of lines) if (text.includes(line)) found.push(`${f} holds a draft line`);
    }
    expect(found).toEqual([]);
    expect(JSON.parse(readFileSync(join(root, "room-manifest.json"), "utf8"))).toMatchObject({ build_kind: "release" });
  });
});

describe("the drafts build (contracts/lookdev.md §1, §8)", () => {
  const root = builds.drafts;
  const files = builtFiles(root);
  const g = graph(root);

  it("has lookdev/index.html, carrying the page's marker in its head (layer 1)", () => {
    expect(files).toContain("lookdev/index.html");
    const html = readFileSync(join(root, "lookdev/index.html"), "utf8");
    expect(html).toMatch(MARKER);
    const doc = new JSDOM(html).window.document;
    expect(doc.head.querySelector('meta[name="h4-lookdev"]')?.getAttribute("content")).toBe("drafts-only");
    // The site's own pages carry no marker: only the lookdev page is drafts-only by its own name.
    expect(files.filter((f) => f !== "lookdev/index.html" && MARKER.test(readFileSync(join(root, f), "utf8")))).toEqual(
      [],
    );
  });

  it("loads the page's script and style from the site's own assets, with nothing inline the CSP would refuse", () => {
    const doc = new JSDOM(readFileSync(join(root, "lookdev/index.html"), "utf8")).window.document;
    const urls = [
      ...[...doc.querySelectorAll("script[src]")].map((e) => e.getAttribute("src") ?? ""),
      ...[...doc.querySelectorAll("link[href]")].map((e) => e.getAttribute("href") ?? ""),
    ];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url, url).toMatch(/^\.\.\/assets\/[^/]+$/);
      expect(files, url).toContain(url.slice("../".length));
    }
    expect(doc.querySelectorAll("script:not([src]), style, [style]")).toHaveLength(0);
  });

  it("keeps the room's entry chunk, and every chunk it loads statically, off the page's code, the GLB reader, and pako", () => {
    const entry = entryOf(root, "index.html");
    const loaded = g.staticGraph(entry);
    expect(loaded).toContain(entry);
    const found: string[] = [];
    for (const [name, pattern] of PAGE_ONLY)
      for (const hit of modulesIn("drafts", loaded, pattern)) found.push(`${hit} (${name})`);
    expect(found).toEqual([]);
  });

  it("lets nothing the room loads, even behind its dynamic import, reach the page's code or a drafts-only module", () => {
    const room = g.dynamicGraph(entryOf(root, "index.html"));
    const page = new RegExp(`^(${DRAFTS_MODULES.join("|")}|apps/web/src/lookdev/)`);
    expect(modulesIn("drafts", room, page)).toEqual([]);
  });

  it("reaches the drafts-only modules and the page's code from the page's own script (layer 2)", () => {
    const own = g.dynamicGraph(entryOf(root, "lookdev/index.html"));
    const modules = new Set(own.flatMap((rel) => chunks.drafts[rel] ?? []));
    for (const m of [...DRAFTS_MODULES, "apps/web/src/lookdev/main.ts"]) expect(modules.has(m), m).toBe(true);
    expect(JSON.parse(readFileSync(join(root, "room-manifest.json"), "utf8"))).toMatchObject({ build_kind: "drafts" });
  });
});
