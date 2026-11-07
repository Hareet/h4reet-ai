// T041 and T043 (spec 002; SC-005; plan "Performance Goals"; research.md R-11): the 3D code is its own chunk, reached
// only by a dynamic import after the WebGL 2 check, so the choice screen's JavaScript stays small and a device without
// WebGL 2 never downloads Three.js; and the build writes room-manifest.json from the same source as the room (T046).
// The build is the global setup's release build (test/global-build.ts; spec 004, T084).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

import { buildManifest } from "../../build/manifest";
import { REPO } from "../helpers/room";

/** A string Three.js's renderer carries in a production build. */
const THREE_MARK = "THREE.WebGLRenderer";
/** The plan's budget for the JavaScript before the 3D chunk, compressed. */
const ENTRY_BUDGET = 150 * 1024;

const out = inject("siteBuilds").release;

const read = (rel: string): string => readFileSync(join(out, rel), "utf8");

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
    const chunks = readdirSync(join(out, "assets")).filter((f) => f.endsWith(".js"));
    const three = chunks.filter((f) => read(`assets/${f}`).includes(THREE_MARK));
    expect(three).toHaveLength(1);
    const dynamics = staticGraph(entry()).flatMap((rel) => {
      const dir = rel.slice(0, rel.lastIndexOf("/") + 1);
      return imports(read(rel)).dynamics.map((d) => dir + d);
    });
    // The dynamic import reaches the chunk that holds Three.js, itself or through its own static imports.
    expect(dynamics.flatMap((d) => staticGraph(d)).some((rel) => rel === `assets/${three[0]}`)).toBe(true);
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

describe("the built room-manifest.json", () => {
  it("is the manifest the room was built from", () => {
    expect(JSON.parse(read("room-manifest.json"))).toEqual(buildManifest(REPO));
  });
});
