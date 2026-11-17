// B's helpers (test/helpers/button-room.ts) after his intake (spec 030; rework-030ds, rv-030ds's F-2, Q101): with the
// round's files in assets/ui/buttons/, the repository's `active` skin, `metal-image`, resolves to the image skin, so a
// helper that builds the repository's skin from the checkout's root hands B's cases `metal-image` where they read
// `metal`. B's helpers build `metal`, the CSS skin, themselves, files or no files; DS's cases put the image skin's
// stylesheet in its place on their own (test/ui/button-image-skin.test.ts).
// Here the files are present without touching the checkout: eleven stand-in PNGs written into a temporary root, the
// build's default root (build/ui-skins-image.ts's REPO_ROOT) pointed at it, and the skin file the helpers read given
// the stand-ins' SHA-256s, so the build's own default path resolves `metal-image` to the image skin (checked first).
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readSkins, resolveSkin, skinCss } from "../../build/ui-skins";
import { LAYOUTS, bundleSheets, room, selectionScreen, skinText } from "../helpers/button-room";
import type { Layout } from "../helpers/button-room";
import { WEB } from "../helpers/room";

/** The stand-ins' root, and the skin file's text with their hashes, which node:fs serves for content/ui-skins.yaml. */
const h = vi.hoisted(() => ({ root: "", skins: "", path: "" }));

vi.mock("../../build/ui-skins-image", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../build/ui-skins-image")>();
  return {
    ...real,
    get REPO_ROOT(): string {
      return h.root;
    },
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((path: fs.PathOrFileDescriptor, options?: unknown) =>
    h.skins !== "" && String(path) === h.path
      ? h.skins
      : (real.readFileSync as (p: fs.PathOrFileDescriptor, o?: unknown) => unknown)(
          path,
          options,
        )) as typeof real.readFileSync;
  return { ...real, default: { ...real, readFileSync }, readFileSync };
});

/** A w × h PNG of one RGBA colour, by zlib. */
function png(w: number, h: number, rgba: readonly number[]): Buffer {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgba).flat())]);
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const SPLIT = LAYOUTS[0] as Layout;

beforeAll(() => {
  h.root = fs.mkdtempSync(join(tmpdir(), "button-room-helper-"));
  h.path = join(WEB, "content", "ui-skins.yaml");
  const text = fs.readFileSync(h.path, "utf8");
  let n = 0;
  // Each of the image skin's files: a stand-in at its path under the temporary root, its SHA-256 in the skin file.
  h.skins = text.replace(
    /(file: (assets\/ui\/[a-z0-9/-]+\.png)\n\s+sha256: )[0-9a-f]{64}/g,
    (_m, head: string, path: string) => {
      n += 1;
      const bytes = path.endsWith("/panel-frame.png")
        ? png(256, 256, [40, 44, 50, 200])
        : png(192, 96, [n * 20, 40, 50, 255]);
      fs.mkdirSync(dirname(join(h.root, path)), { recursive: true });
      fs.writeFileSync(join(h.root, path), bytes);
      return `${head}${createHash("sha256").update(bytes).digest("hex")}`;
    },
  );
  expect(n, "the image skin's files given stand-ins").toBe(11);
});

afterAll(() => {
  h.skins = "";
  if (h.root !== "") fs.rmSync(h.root, { recursive: true, force: true });
});

describe("B's helpers build `metal` with the image skin's files present (rv-030ds F-2, Q101)", () => {
  it("has the build's default path resolve the repository's active skin to the image skin (the files present)", () => {
    const resolved = resolveSkin(readSkins(skinText()));
    expect(resolved.id).toBe("metal-image");
    expect(resolved.kind).toBe("image");
  });

  it("gives the bundle `metal`'s stylesheet in the skin's place", () => {
    const skin = bundleSheets().find((s) => s.name === "virtual:ui-skin.css");
    expect(skin?.text).toBe(skinCss(resolveSkin(readSkins(skinText("metal")))));
    expect(skin?.text).not.toContain('data-skin-kind="image"');
  });

  it("marks the selection screen and the room `metal`", async () => {
    const screen = await selectionScreen();
    expect(screen.id).toBe("metal");
    expect(screen.v.doc.documentElement.getAttribute("data-skin")).toBe("metal");
    const s = await room(SPLIT);
    expect(s.id).toBe("metal");
    expect(s.v.doc.documentElement.getAttribute("data-skin")).toBe("metal");
  });

  it("still builds a skin the case names (`plain`)", () => {
    const skin = bundleSheets("plain").find((s) => s.name === "virtual:ui-skin.css");
    expect(skin?.text).toBe(skinCss(resolveSkin(readSkins(skinText("plain")))));
  });
});
