// T069's scan half (spec 004; FR-007, SC-001; R-16; contracts/room-data-files.md §16): build/room/scan.ts, the source
// scan, over a temporary copy of the sources and over small source trees made when the test runs. Every ID it plants
// is the fixture set's, read when the test runs as the compositor reads it (load.ts's namespaceIds), so this file's
// own source holds none and the committed tree's case (T107) meets none here. A planted ID gives exactly
// `FR-007 <file>:<line>: holds "<id>", which only the room's data defines` and exit 1. The scan reads string and
// template literals, regular-expression literals, property names, literal types, enum members, HTML attribute values
// and text, and CSS selectors, custom property names, and strings, and never a comment or an identifier; a hit is the
// ID with no letter or digit beside it, case-sensitively, on the line where it stands; it reads only where §16 says,
// sorts its output, looks for every ID of the four namespaces, and never prints an ID RT2 refused.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { walkStrings } from "../../build/room/checks/rt";
import { loadRoom, namespaceIds, pathOf, TOPICS_FILE } from "../../build/room/load";
import type { Namespaces } from "../../build/room/load";
import { noPolicy } from "../../build/room/policy";
import { roomIds, scan } from "../../build/room/scan";
import type { ScanResult } from "../../build/room/scan";
import { fileTree, memoryTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { goodFiles, goodTree, overlay } from "../helpers/room-fixtures";

// RT2's walk, wrapped so one test can have it refuse an ID; every other call is the walk itself.
vi.mock("../../build/room/checks/rt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../build/room/checks/rt")>();
  return { ...actual, walkStrings: vi.fn(actual.walkStrings) };
});

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The fixture set's IDs by namespace, as the compositor reads them. */
const fixture: Namespaces = namespaceIds(loadRoom(goodTree()));
/** A selectable's ID: hyphenated, so no identifier can spell it. */
const id = fixture.selectables[0] ?? "";
/** The topic's ID, and the same without its hyphens, which `data()` makes the topic's: an ID an identifier can spell. */
const topic = fixture.topics[0] ?? "";
const word = topic.replaceAll("-", "");

/** The fixture set with its topic's ID made `word`. */
function data(): Tree {
  const topics = decoder.decode(goodFiles().get(TOPICS_FILE));
  return overlay({ [TOPICS_FILE]: topics.replace(`id: ${topic}`, `id: ${word}`) });
}

/** A tree of source files, by repository path. */
function sources(files: Readonly<Record<string, string>>): Tree {
  return memoryTree(new Map(Object.entries(files).map(([path, text]) => [path, encoder.encode(text)])));
}

/** FR-007's line for `who` on `file`'s line `n`. */
const line = (file: string, n: number, who: string): string =>
  `FR-007 ${file}:${n}: holds "${who}", which only the room's data defines`;

/** A file of `rows`, one line each, and the lines the scan prints for it: one for each row naming an ID. */
function table(file: string, rows: readonly (readonly [string, string | null])[]): { text: string; lines: string[] } {
  return {
    text: `${rows.map(([code]) => code).join("\n")}\n`,
    lines: rows.flatMap(([, who], i) => (who === null ? [] : [line(file, i + 1, who)])),
  };
}

describe("the IDs it looks for", () => {
  it("are the fixture set's: a selectable's, hyphenated, and the topic's, made a word an identifier can spell", () => {
    expect(id).toMatch(/^[a-z][a-z0-9]*-[a-z0-9-]+$/);
    expect(word).toMatch(/^[a-z][a-z0-9]+$/);
    expect(roomIds(data(), noPolicy()).ids).toContain(word);
  });

  it("are every ID of the four namespaces, once each in bytewise order; RT2 refuses none of the known-good set's", () => {
    const { ids, refused } = roomIds(goodTree(), noPolicy());
    expect(ids).toEqual([...new Set(Object.values(fixture).flat())].sort());
    expect([...refused]).toEqual([]);
  });

  it("include an ID that only one namespace defines, for each of the four", () => {
    // The last placement's piece leaves the catalog, so that placement's ID is a placement's alone.
    const last = loadRoom(goodTree()).scene?.value.placements.at(-1);
    const tree = overlay({ [pathOf("catalog", last?.piece ?? "")]: null });
    const ns = namespaceIds(loadRoom(tree));
    const keys = ["pieces", "placements", "selectables", "topics"] as const;
    const alone = keys.map((k) => ns[k].find((x) => keys.every((o) => o === k || !ns[o].includes(x))) ?? "");
    expect(
      alone.filter((x) => x === ""),
      "a namespace with no ID of its own",
    ).toEqual([]);
    const file = "apps/web/src/k.ts";
    const { text, lines } = table(
      file,
      alone.map((x, i) => [`export const k${i} = "${x}";`, x] as const),
    );
    expect(scan(tree, sources({ [file]: text }), noPolicy())).toEqual({ lines, code: 1 });
  });
});

describe("over a temporary copy of the sources", () => {
  /** The code the scan reads, but its two test folders, whose literals hold the fixture set's IDs by design. */
  const copied = [
    "apps/web/src",
    "apps/web/build",
    "apps/web/lookdev",
    "apps/web/index.html",
    ...readdirSync(join(ROOT, "apps/web"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `apps/web/${name}`),
    "services/gateway/src",
  ];
  let root = "";
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "room-scan-"));
    for (const path of copied) {
      if (!existsSync(join(ROOT, path))) continue;
      mkdirSync(dirname(join(root, path)), { recursive: true });
      cpSync(join(ROOT, path), join(root, path), { recursive: true });
    }
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("finds no ID of the fixture set in the code, and exits 0", () => {
    expect(scan(goodTree(), fileTree(root), noPolicy())).toEqual({ lines: [], code: 0 });
  });

  it("reports one ID planted in a string literal with exactly its line, and exits 1", () => {
    const file = "apps/web/src/main.ts";
    const original = readFileSync(join(root, file), "utf8");
    const planted = `${original}${original.endsWith("\n") ? "" : "\n"}export const planted = ${JSON.stringify(id)};\n`;
    writeFileSync(join(root, file), planted);
    try {
      expect(scan(goodTree(), fileTree(root), noPolicy())).toEqual({
        lines: [line(file, planted.split("\n").length - 1, id)],
        code: 1,
      });
    } finally {
      writeFileSync(join(root, file), original);
    }
  });
});

describe("what it reads", () => {
  it("reads a script's literals, property names, literal types, and enum members, and no comment or identifier", () => {
    const file = "apps/web/src/k.ts";
    const { text, lines } = table(file, [
      [`// ${id}, in a line comment`, null],
      [`/* ${id}, in a block comment */`, null],
      [`/** ${id}, in a doc comment */`, null],
      [`let ${id.split("-").join(", ")};`, null],
      [`void (${id});`, null],
      [`const ${word} = 1;`, null],
      [`void k.${word};`, null],
      [`export const a = "${id}";`, id],
      [`export const b = '${id}';`, id],
      ["export const c = `" + id + "`;", id],
      ["export const d = `" + id + " ${a}`;", id],
      ["export const e = `${a} " + id + " ${b}`;", id],
      ["export const f = `${a} " + id + "`;", id],
      ["export const g = `a", null],
      [id + " b`;", id],
      [`export const h = /${id}/u;`, id],
      [`export const i = { "${id}": 1 };`, id],
      [`export const j = { ${word}: 1 };`, word],
      [`export const k = { ${word} };`, word],
      [`export const l = { ${word}() {} };`, word],
      [`export const m = { get ${word}() { return 1; } };`, word],
      [`export interface N { ${word}: number }`, word],
      [`export interface O { ${word}(): void }`, word],
      [`export type P = { ${word}: number };`, word],
      [`export type Q = "${id}";`, id],
      ["export type R = `" + id + "-${string}`;", id],
      [`export enum S { ${word} }`, word],
      [`export enum T { "${id}" = 1 }`, id],
    ]);
    expect(scan(data(), sources({ [file]: text }), noPolicy())).toEqual({ lines, code: 1 });
  });

  it("reads HTML's attribute values and text, a script's body as a script and a style's as a style sheet", () => {
    const file = "apps/web/index.html";
    const { text, lines } = table(file, [
      ["<!doctype html>", null],
      [`<!-- ${id}, in a comment -->`, null],
      [`<body data-k="${id}">`, id],
      [`<p class='${id}'>`, id],
      [`<p title=${id}>`, id],
      [`<p data-${id}="k">`, null],
      [`<p>${id}</p>`, id],
      ["<p>", null],
      [`  ${id}`, id],
      ["</p>", null],
      ['<script type="module">', null],
      [`  // ${id}`, null],
      [`  const k = "${id}";`, id],
      ["</script>", null],
      ["<style>", null],
      [`  /* ${id} */`, null],
      [`  .k--${id} { color: red; }`, id],
      ["</style>", null],
      ["</body>", null],
    ]);
    expect(scan(data(), sources({ [file]: text }), noPolicy())).toEqual({ lines, code: 1 });
  });

  it("reads a style sheet's selectors, custom property names, and strings, and no comment, at-rule, or plain value", () => {
    const file = "apps/web/src/k.css";
    const { text, lines } = table(file, [
      [`/* ${id}, in a comment */`, null],
      [`.k--${id},`, id],
      [".k {", null],
      [`  --${id}-k: #fff;`, id],
      [`  color: var(--${id}-k);`, id],
      [`  content: "${id}";`, id],
      [`  animation-name: ${id};`, null],
      ["}", null],
      [`@keyframes ${id} {`, null],
      ["  from { opacity: 0; }", null],
      ["}", null],
      ["@media (min-width: 1px) {", null],
      [`  [data-k="${id}"] { color: red; }`, id],
      ["}", null],
    ]);
    expect(scan(data(), sources({ [file]: text }), noPolicy())).toEqual({ lines, code: 1 });
  });

  it("hits an ID with no letter or digit beside it, case-sensitively, so a per-ID class is caught", () => {
    const file = "apps/web/src/k.ts";
    const { text, lines } = table(file, [
      [`export const a = "flat-hit--${id}";`, id],
      [`export const b = "${id}-k";`, id],
      [`export const c = "${id}_k";`, id],
      [`export const d = "k ${id}.";`, id],
      [`export const e = "${id}k";`, null],
      [`export const f = "k${id}";`, null],
      [`export const g = "${id}9";`, null],
      [`export const h = "9${id}";`, null],
      [`export const i = "${id.toUpperCase()}";`, null],
    ]);
    expect(scan(data(), sources({ [file]: text }), noPolicy())).toEqual({ lines, code: 1 });
  });
});

describe("where it reads", () => {
  const planted = (file: string): string =>
    file.endsWith(".html")
      ? `<p>${id}</p>\n`
      : file.endsWith(".css")
        ? `.k--${id} {}\n`
        : `export const k = "${id}";\n`;
  /** In bytewise order, as the scan prints them. */
  const read = [
    "apps/web/build/room/k.ts",
    "apps/web/index.html",
    "apps/web/k.config.ts",
    "apps/web/lookdev/k.html",
    "apps/web/lookdev/k.ts",
    "apps/web/src/k.cjs",
    "apps/web/src/k.css",
    "apps/web/src/k.d.ts",
    "apps/web/src/k.js",
    "apps/web/src/k.jsx",
    "apps/web/src/k.mjs",
    "apps/web/src/k.mts",
    "apps/web/src/k.ts",
    "apps/web/src/k.tsx",
    "apps/web/src/k/l/k.ts",
    "apps/web/test/k.test.ts",
    "services/gateway/src/k.ts",
    "services/gateway/test/k.test.ts",
  ];
  /** Data, generated files, Markdown, other folders, and the web workspace's other top-level files. */
  const unread = [
    "apps/web/k.js",
    "apps/web/k.html",
    "apps/web/k.md",
    "apps/web/room/k.ts",
    "apps/web/room/scene.yaml",
    "apps/web/content/room/k.yaml",
    "apps/web/dist/k.js",
    "apps/web/fonts/k.css",
    "apps/web/src/k.json",
    "apps/web/src/k.yaml",
    "apps/web/src/k.md",
    "apps/web/src/k.svg",
    "apps/web/test/fixtures/room/k.yaml",
    "apps/web/test/k.md",
    "config/room-events.yaml",
    "docs/studio/work-orders/k.md",
    "services/gateway/k.ts",
    "services/gateway/config/k.ts",
    "services/relay/src/k.ts",
    "k.ts",
  ];

  it("reads apps/web/{src,build,lookdev,test}/**, apps/web/*.ts, apps/web/index.html, and services/gateway/{src,test}/**", () => {
    const tree = sources(Object.fromEntries([...read, ...unread].map((file) => [file, planted(file)])));
    expect(scan(data(), tree, noPolicy())).toEqual({ lines: read.map((file) => line(file, 1, id)), code: 1 });
    const where = [
      /^apps\/web$/,
      /^apps\/web\/(src|build|lookdev|test)(\/|$)/,
      /^apps\/web\/[^/]+\.ts$/,
      /^apps\/web\/index\.html$/,
      /^services\/gateway\/(src|test)(\/|$)/,
    ];
    expect(tree.log.filter((path) => !where.some((re) => re.test(path)))).toEqual([]);
  });
});

describe("its output", () => {
  it("is one line per hit, sorted by file, then line, then ID", () => {
    const [low, high] = [fixture.placements[0] ?? "", fixture.placements[1] ?? ""].sort();
    const tree = sources({
      "apps/web/src/b.ts": `export const k = "${id}";\n`,
      "apps/web/src/a.ts": `export const k = ["${high}", "${low}"];\n\nexport const l = "${id}";\n`,
    });
    expect(scan(data(), tree, noPolicy()).lines).toEqual([
      line("apps/web/src/a.ts", 1, low ?? ""),
      line("apps/web/src/a.ts", 1, high ?? ""),
      line("apps/web/src/a.ts", 3, id),
      line("apps/web/src/b.ts", 1, id),
    ]);
  });

  it("is nothing, with exit 0, where no literal holds an ID", () => {
    const tree = sources({ "apps/web/src/k.ts": `// ${id}\nconst ${word} = "k";\n` });
    expect(scan(data(), tree, noPolicy())).toEqual({ lines: [], code: 0 });
  });

  it("never prints an ID RT2 refused, and still exits 1", () => {
    const other = fixture.placements[0] ?? "";
    const tree = sources({ "apps/web/src/k.ts": `export const k = "${id}";\nexport const l = "${other}";\n` });
    let result: ScanResult | undefined;
    vi.mocked(walkStrings).withImplementation(
      () => new Set([id]),
      () => {
        result = scan(goodTree(), tree, noPolicy());
      },
    );
    expect(result).toEqual({
      lines: [
        "FR-007 apps/web/src/k.ts:1: holds an ID RT2 refused, which only the room's data defines",
        line("apps/web/src/k.ts", 2, other),
      ],
      code: 1,
    });
    expect(result?.lines.join("\n")).not.toContain(id);
  });
});
