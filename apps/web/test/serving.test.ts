// T216 (spec 004; FR-010, FR-013, FR-079; Amendment C11; contracts/serving.md §1, §3, §8): what a release build writes
// for the web image to serve, over a fixture tree whose GLBs test/helpers/glb.ts makes when the test runs (through
// room-models.ts's clean models), since spec 003's rule A1 refuses a committed model.
// - dist/a/ holds each set model as `<stem>.<hash16>.glb.gz`, and no plain .glb is anywhere in dist/; a set image card
//   sits there as committed, with no copy.
// - Each copy inflates to the plain file, whose SHA-256 is the bundle's `sha256` (the 3D part's model entry) and whose
//   first 16 hexadecimal digits are its URL's; it equals pako.gzip(plain, {level: 9, header: {time: 0, os: 255}}) byte
//   for byte, with the header bytes 1f 8b 08 00, MTIME 0, XFL 2, and OS 255; and its length is the entry's `bytes`,
//   the bytes the image sends (C11).
// - Two builds write identical copies (FR-010).
// - A build that can read no model, as the image's build without its room-assets context, where the catalog names
//   each model and /src/assets/room/ is empty, still builds: no GLB under dist/a/, each piece's RX1 lenient (a warn
//   line), and a manifest that says stand-ins are in use (FR-013).
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { gzip } from "pako";
import { build } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose, formatFinding } from "../build/room/compose";
import type { ComposeResult } from "../build/room/compose";
import type { RoomManifest } from "../build/room/emit";
import { roomBundle } from "../build/room/plugin";
import { fileTree } from "../build/room/source";
import type { SceneModel } from "../src/room/compose/bundle";
import { png } from "./helpers/glb";
import { goodFiles } from "./helpers/room-fixtures";
import { capsPolicy, modelChanges } from "./helpers/room-models";

const MESSAGES = fileURLToPath(new URL("../content/messages.yaml", import.meta.url));
/** The pieces whose models the fixture tree sets: two placements' and the switch's (fx-power shows fx-plug). */
const SET = ["fx-board", "fx-desk", "fx-plug"];
/** The sign's image card. */
const CARD = "fx-sign.png";
const decoder = new TextDecoder();
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

/** Files written under `root`, by repository path. */
function write(root: string, files: Iterable<readonly [string, string | Uint8Array]>): void {
  for (const [path, data] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), data);
  }
}

/** Every file under `dir`, by its path from `dir`, with its bytes. */
function files(dir: string, prefix = ""): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) for (const [p, b] of files(full, rel)) out.set(p, b);
    else out.set(rel, readFileSync(full));
  }
  return out;
}

/** The known-good set with SET's models and the sign's card, each recorded (RI7), by repository path. */
function withModels(): Map<string, string | Uint8Array> {
  const changes: Record<string, string | Uint8Array> = { ...modelChanges(SET) };
  const card = png({ width: 64, height: 32 });
  const records = JSON.parse(decoder.decode(changes["assets/room/records.json"] as Uint8Array)) as {
    entries: { file: string; sha256: string; kind: string }[];
  };
  records.entries.push({ file: CARD, sha256: sha256(card), kind: "room" });
  const sign = decoder.decode(goodFiles().get("apps/web/room/catalog/fx-sign.yaml"));
  return new Map<string, string | Uint8Array>([
    ...goodFiles(),
    ...Object.entries(changes),
    ["assets/room/records.json", `${JSON.stringify(records, null, 2)}\n`],
    [`assets/room/${CARD}`, card],
    ["apps/web/room/catalog/fx-sign.yaml", `${sign}model: { card: ${CARD} }\n`],
  ]);
}

/** The same catalog, every model named, with nothing under assets/room/: the image's build without room-assets. */
function withoutTheFiles(): Map<string, string | Uint8Array> {
  return new Map([...withModels()].filter(([path]) => !path.startsWith("assets/room/")));
}

const PAGE =
  '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Fixture page</title></head>' +
  '<body><script type="module" src="./main.js"></script></body></html>\n';
const MAIN =
  'import { content, room } from "virtual:room-content";\n' +
  "globalThis.room = { content, room };\n" +
  'import("virtual:room-scene").then((m) => { globalThis.scene = m.default; });\n';

/** A release build of a small page through the room's plugin, over a tree of `data`: its dist/, and the compose the
 *  plugin made (the same tree and policy, so its bundle is the build's). */
async function releaseBuild(data: Map<string, string | Uint8Array>): Promise<{ dist: string; result: ComposeResult }> {
  vi.stubEnv("ROOM_DRAFTS", "");
  const top = temp("room-serving-");
  const [repository, site] = [join(top, "repository"), join(top, "page")];
  write(repository, data);
  write(site, [
    ["index.html", PAGE],
    ["main.js", MAIN],
  ]);
  await build({
    configFile: false,
    root: site,
    logLevel: "silent",
    publicDir: false,
    cacheDir: join(top, "vite-cache"),
    build: { outDir: join(site, "dist"), emptyOutDir: true },
    plugins: [roomBundle({ root: repository, messages: MESSAGES, policy: capsPolicy })],
  });
  const result = compose(fileTree(repository), capsPolicy(), { mode: "lenient", drafts: false });
  return { dist: join(site, "dist"), result };
}

/** Each model entry the 3D part names, by its URL: the placements' and the switches', an image card's among them. */
function sceneEntries(result: ComposeResult): Map<string, SceneModel> {
  const out = new Map<string, SceneModel>();
  for (const m of [...result.scene.placements.map((p) => p.model), ...result.scene.switches.map((s) => s.model)])
    if (m) out.set(m.url, m);
  return out;
}

/** The GLBs' entries alone. */
function modelEntries(result: ComposeResult): Map<string, SceneModel> {
  return new Map([...sceneEntries(result)].filter(([url]) => url.endsWith(".glb")));
}

/** RFC 1952's header as contracts/serving.md §1 has it: the magic, deflate, no flag (no file name, extra field, or
 *  comment), MTIME 0, XFL 2 (level 9), and OS 255. */
const HEADER = [0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 2, 255];

describe("a release build with set models (contracts/serving.md §1)", () => {
  it("holds each set model's .glb.gz copy under a/, the card as committed, and no plain .glb anywhere", async () => {
    const { dist, result } = await releaseBuild(withModels());
    const built = [...files(dist).keys()];
    expect(built.filter((p) => p.endsWith(".glb"))).toEqual([]);
    const entries = modelEntries(result);
    expect([...entries.keys()].map((url) => url.split(".")[0]).sort()).toEqual(SET.map((p) => `a/${p}`));
    expect(built.filter((p) => p.startsWith("a/")).sort()).toEqual(
      [...[...entries.keys()].map((url) => `${url}.gz`), ...result.cards.map((c) => c.url)].sort(),
    );
    // The card: its own bytes, under its own extension, with no .gz beside it, and its entry's bytes its own length.
    const [card] = result.cards;
    expect(card?.url).toMatch(/^a\/fx-sign\.[0-9a-f]{16}\.png$/);
    const served = readFileSync(join(dist, card?.url ?? ""));
    expect(Buffer.compare(served, Buffer.from(card?.bytes ?? []))).toBe(0);
    expect(built).not.toContain(`${card?.url}.gz`);
    expect(sceneEntries(result).get(card?.url ?? "")?.bytes).toBe(served.length);
  });

  it("writes each copy as pako's gzip-9 of the plain file: its header, its SHA-256 and URL, and its length the entry's bytes", async () => {
    const data = withModels();
    const { dist, result } = await releaseBuild(data);
    const entries = modelEntries(result);
    expect(entries.size).toBe(SET.length);
    for (const [url, entry] of entries) {
      const copy = readFileSync(join(dist, `${url}.gz`));
      const match = /^a\/([a-z0-9-]+)\.([0-9a-f]{16})\.glb$/.exec(url);
      expect(match, url).not.toBeNull();
      const [, stem, hash16] = match ?? [];
      const plain = data.get(`assets/room/${stem}.glb`) as Uint8Array;
      // The copy inflates to the plain file, the one the record and the approval name.
      const inflated = gunzipSync(copy);
      expect(Buffer.compare(inflated, Buffer.from(plain)), url).toBe(0);
      expect(sha256(inflated), url).toBe(entry.sha256);
      expect(entry.sha256.slice(0, 16), url).toBe(hash16);
      // Byte for byte pako 2.1.0's call, with RFC 1952's fixed header.
      expect(Buffer.compare(copy, Buffer.from(gzip(plain, { level: 9, header: { time: 0, os: 255 } }))), url).toBe(0);
      expect([...copy.subarray(0, 10)], url).toEqual(HEADER);
      expect(copy.readUInt32LE(4), `${url}: MTIME`).toBe(0);
      // The bytes the image sends, which the bundle and the asset events count (C11).
      expect(entry.bytes, url).toBe(copy.length);
      expect(result.models.find((m) => m.url === url)?.gz.length, url).toBe(copy.length);
    }
  });

  it("writes identical copies in two builds of one tree (FR-010)", async () => {
    const data = withModels();
    const copies = async (): Promise<Map<string, Buffer>> => {
      const { dist } = await releaseBuild(data);
      return new Map([...files(dist)].filter(([p]) => p.startsWith("a/")));
    };
    const [first, second] = [await copies(), await copies()];
    expect(first.size).toBe(SET.length + 1);
    expect([...second.keys()]).toEqual([...first.keys()]);
    for (const [name, bytes] of first) expect(Buffer.compare(second.get(name) ?? Buffer.alloc(0), bytes), name).toBe(0);
  });
});

describe("a release build that can read no model (contracts/serving.md §3)", () => {
  it("builds with each piece's RX1 lenient, no GLB under a/, and a manifest saying stand-ins are in use", async () => {
    const { dist, result } = await releaseBuild(withoutTheFiles());
    // The catalog names every model; the build reads none, as the image's build without its room-assets context.
    const lines = result.findings.map((f) => formatFinding(f, "lenient"));
    expect(lines).toEqual(
      [...SET, "fx-sign"].map((p) => expect.stringMatching(new RegExp(`^warn RX1 assets/room/${p}\\.(glb|png):-: `))),
    );
    expect(result.findings.every((f) => f.lenient)).toBe(true);
    const built = [...files(dist).keys()];
    expect(built.filter((p) => p.endsWith(".glb") || p.endsWith(".glb.gz"))).toEqual([]);
    expect(built.filter((p) => p.startsWith("a/"))).toEqual([]);
    const manifest = JSON.parse(readFileSync(join(dist, "room-manifest.json"), "utf8")) as RoomManifest;
    expect(manifest.build_kind).toBe("release");
    expect(manifest.placeholders).toBe(true);
    const shown = new Set(manifest.standins.map((s) => s.placement.split(".")[0]));
    for (const placement of [...result.scene.placements, ...result.scene.switches].filter((p) =>
      [...SET, "fx-sign"].includes(p.piece),
    ))
      expect(shown.has(placement.id), placement.id).toBe(true);
    expect(manifest.standins.every((s) => s.reason !== "no-caps")).toBe(true);
  });
});
