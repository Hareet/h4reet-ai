// T126's image half and T133's ledger (spec 004; FR-053, FR-056, FR-075, SC-006; research.md R-28, R-29): GLB textures
// under the site's unchanged CSPs, neither of which allows blob:. First a source pin, which reads the installed
// GLTFLoader.js and asserts what the room's image step relies on: GLTFLoader builds its plugins from the parser before
// the parser runs; the texture step calls the image-source step, and turns a failed image into no texture without an
// error; that step makes an object URL; and EXT_texture_webp makes no support probe. Then the step itself, on GLBs
// built when the test runs (test/helpers/glb.ts), with a stand-in for createImageBitmap, which Node and jsdom lack:
// each embedded image decoded from a Blob of its own bytes, without premultiplication or colour conversion, at half
// size when reduced; flipY false and the MIME type on each texture; one decode per image; never an object URL or a
// request; an image uri refused; and a piece short of its materials' images failed. Last, the texture ledger: FR-053's
// formula, as the fit check measures it, against 96,000,000 bytes, each image once, and decoded bitmaps closed once
// uploaded.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { ClampToEdgeWrapping, Texture } from "three";
import type { Mesh, MeshStandardMaterial, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { textureMemory } from "../../src/room/glb/fit";
import { readImage } from "../../src/room/glb/images";
import { DECODE, parseModel, roomImages } from "../../src/room/scene/gltf-images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { SCENE_TEXTURE_BYTES, createTextureLedger, textureBytes } from "../../src/room/scene/ledger";
import type { Uploader } from "../../src/room/scene/ledger";
import { desk, item, jpeg, list, png, webp } from "../helpers/glb";
import { WEB } from "../helpers/room";

// --------------------------------------------------------------------------------------------------------------------
// The installed GLTFLoader.js
// --------------------------------------------------------------------------------------------------------------------
const LOADER_PATH = createRequire(import.meta.url).resolve("three/examples/jsm/loaders/GLTFLoader.js");
const LOADER = readFileSync(LOADER_PATH, "utf8");
/** The file from the parser's class on, where its own methods come before any other class's of the same name. */
const PARSER = LOADER.slice(Math.max(0, LOADER.indexOf("class GLTFParser {")));

/** What a pin says when it fails. */
const MOVED =
  "three's GLTFLoader.js no longer reads as src/room/scene/gltf-images.ts relies on: re-read research.md R-29 " +
  "before moving three off 0.186.1";

/** The text of the block that opens at `head` in `within`, its braces matched. */
function block(head: string, within: string = LOADER): string {
  const at = within.indexOf(head);
  expect(at, `${MOVED}: no "${head.trim()}"`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = within.indexOf("{", at); i >= 0 && i < within.length; i++) {
    if (within[i] === "{") depth++;
    else if (within[i] === "}" && --depth === 0) return within.slice(at, i + 1);
  }
  throw new Error(`${MOVED}: "${head.trim()}" never closes`);
}

/** Whitespace folded, so a pin reads the code and not its layout. */
const fold = (text: string): string => text.replace(/\s+/g, " ");

// --------------------------------------------------------------------------------------------------------------------
// createImageBitmap's stand-in, and parsing
// --------------------------------------------------------------------------------------------------------------------
/** A stand-in for ImageBitmap: its size, and close(), which empties it as a browser's does. */
class FakeBitmap {
  width: number;
  height: number;
  closed = false;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  close(): void {
    this.closed = true;
    this.width = 0;
    this.height = 0;
  }
}

interface DecodeCall {
  /** What it was asked to decode: a Blob, or a bitmap it made. */
  readonly from: "blob" | "bitmap";
  /** The Blob's MIME type and bytes. */
  readonly type: string | null;
  readonly bytes: Uint8Array | null;
  readonly options: ImageBitmapOptions;
  /** The bitmap it made, or null where it refused. */
  readonly made: FakeBitmap | null;
}

/**
 * createImageBitmap's stand-in, since Node and jsdom have none: it records every call, and sizes each bitmap from the
 * image's header, or from the resize asked for. It refuses the MIME types `refused` names, and a closed bitmap.
 */
function decoder(refused: readonly string[] = []): { decode: Decode; calls: DecodeCall[] } {
  const calls: DecodeCall[] = [];
  const decode = async (source: Blob | ImageBitmap, options: ImageBitmapOptions): Promise<ImageBitmap> => {
    let size: { width: number; height: number } | null;
    let call: Omit<DecodeCall, "made">;
    if (source instanceof Blob) {
      const bytes = new Uint8Array(await source.arrayBuffer());
      size = refused.includes(source.type) ? null : readImage(bytes).header;
      call = { from: "blob", type: source.type, bytes, options };
    } else {
      const bitmap = source as unknown as FakeBitmap;
      size = bitmap.closed ? null : bitmap;
      call = { from: "bitmap", type: null, bytes: null, options };
    }
    const made = size && new FakeBitmap(options.resizeWidth ?? size.width, options.resizeHeight ?? size.height);
    calls.push({ ...call, made });
    if (!made) throw new Error("undecodable");
    return made as unknown as ImageBitmap;
  };
  return { decode, calls };
}

/** A GLB's bytes as the ArrayBuffer GLTFLoader parses. */
const buffer = (data: Uint8Array): ArrayBuffer => data.slice().buffer;

/** Each material's base-colour texture in a parsed scene, by the material's name. */
function mapsOf(root: Object3D): Map<string, Texture | null> {
  const out = new Map<string, Texture | null>();
  root.traverse((node) => {
    const material = (node as Partial<Mesh>).material as MeshStandardMaterial | undefined;
    if (material) out.set(material.name, material.map);
  });
  return out;
}

const bitmapOf = (texture: Texture | null | undefined): FakeBitmap => {
  if (!texture) throw new Error("no texture");
  return texture.image as FakeBitmap;
};

/** The desk's three images, as desk() lays them out: image 0 a PNG on material-0, 1 a JPEG, 2 a WebP. */
const TOP = png({ width: 8, height: 8 });
const LEGS = jpeg({ width: 16, height: 8 });
const DRAWER = webp({ width: 4, height: 4 });
const DESK = desk({ top: TOP, legs: LEGS, drawer: DRAWER }).bytes;

describe("the GLTFLoader the room's image step relies on (three 0.186.1)", () => {
  it("is three 0.186.1, installed and pinned exactly", () => {
    const root = join(dirname(LOADER_PATH), "..", "..", "..");
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8"))).toMatchObject({
      name: "three",
      version: "0.186.1",
    });
    const web = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8")) as {
      devDependencies: Record<string, string>;
    };
    expect(web.devDependencies.three).toBe("0.186.1");
  });

  it("builds every plugin from the parser before the parser runs", () => {
    const parse = fold(block("\tparse( data, path, onLoad, onError ) {"));
    const build = parse.indexOf("const plugin = this.pluginCallbacks[ i ]( parser );");
    expect(build, MOVED).toBeGreaterThan(0);
    expect(parse.indexOf("parser.parse( onLoad, onError );"), MOVED).toBeGreaterThan(build);
  });

  it("has the texture step call the image-source step, and turn a failed image into no texture, with no error", () => {
    expect(fold(block("\tloadTexture( textureIndex ) {", PARSER)), MOVED).toContain(
      "return this.loadTextureImage( textureIndex, sourceIndex, loader );",
    );
    const textureImage = fold(block("\tloadTextureImage( textureIndex, sourceIndex, loader ) {", PARSER));
    expect(textureImage, MOVED).toContain(
      "const promise = this.loadImageSource( sourceIndex, loader ).then( function ( texture ) {",
    );
    expect(textureImage, MOVED).toContain("} ).catch( function () { return null; } );");
  });

  it("has the image-source step make an object URL from a Blob of the buffer view, which the CSPs refuse", () => {
    const imageSource = fold(block("\tloadImageSource( sourceIndex, loader ) {", PARSER));
    expect(imageSource, MOVED).toContain("const blob = new Blob( [ bufferView ], { type: sourceDef.mimeType } );");
    expect(imageSource, MOVED).toContain("sourceURI = URL.createObjectURL( blob );");
  });

  it("has EXT_texture_webp make no support probe, so there is nothing to mark supported first", () => {
    const extension = fold(block("class GLTFTextureWebPExtension {"));
    for (const probe of ["isSupported", "detectSupport", "new Image", "data:"]) {
      expect(extension, `${MOVED}: ${probe}`).not.toContain(probe);
    }
    expect(extension, MOVED).toContain("return parser.loadTextureImage( textureIndex, extension.source, loader );");
  });

  it("lets the plugin replace the image-source step on the parser it's given", async () => {
    const seen: GLTFParser[] = [];
    const images = roomImages({ reduced: false, decode: decoder().decode });
    const loader = new GLTFLoader().register((parser) => {
      seen.push(parser);
      return images.plugin(parser);
    });
    await loader.parseAsync(buffer(DESK), "");
    expect(seen).toHaveLength(1);
    const parser = seen[0] as GLTFParser;
    const prototype = Object.getPrototypeOf(parser) as GLTFParser;
    expect(typeof prototype.loadImageSource, MOVED).toBe("function");
    expect(typeof prototype.loadTextureImage, MOVED).toBe("function");
    expect(Object.hasOwn(parser, "loadImageSource")).toBe(true);
    expect(parser.loadImageSource).not.toBe(prototype.loadImageSource);
  });
});

describe("the room's image step (R-29)", () => {
  it("decodes each embedded image from a Blob of its bytes, neither premultiplied nor colour-converted", async () => {
    const { decode, calls } = decoder();
    const model = await parseModel(buffer(DESK), { reduced: false, decode });
    expect(DECODE).toEqual({ premultiplyAlpha: "none", colorSpaceConversion: "none" });
    expect(calls.map((c) => c.from)).toEqual(["blob", "blob", "blob"]);
    expect(calls.map((c) => c.options)).toEqual([DECODE, DECODE, DECODE]);
    const bytes = new Map(calls.map((c) => [c.type, c.bytes]));
    expect(bytes.get("image/png")).toEqual(TOP);
    expect(bytes.get("image/jpeg")).toEqual(LEGS);
    // The drawer's texture comes through EXT_texture_webp's texture step, which calls the same image-source step.
    expect(bytes.get("image/webp")).toEqual(DRAWER);
    expect([...model.images.keys()].sort()).toEqual([0, 1, 2]);
  });

  it("gives each material its bitmap as a texture, flipY false as glTF has it, with its MIME type", async () => {
    const { decode, calls } = decoder();
    const model = await parseModel(buffer(DESK), { reduced: false, decode });
    const maps = mapsOf(model.gltf.scene);
    const expected: [string, string, number, number][] = [
      ["material-0", "image/png", 8, 8],
      ["material-1", "image/jpeg", 16, 8],
      ["material-2", "image/webp", 4, 4],
    ];
    for (const [material, type, width, height] of expected) {
      const texture = maps.get(material);
      expect(texture, material).toBeInstanceOf(Texture);
      expect(texture?.flipY, material).toBe(false);
      expect(texture?.userData.mimeType, material).toBe(type);
      expect(bitmapOf(texture), material).toBe(calls.find((c) => c.type === type)?.made);
      expect([bitmapOf(texture).width, bitmapOf(texture).height], material).toEqual([width, height]);
    }
    expect(model.images.get(1)).toEqual({ width: 16, height: 8, mimeType: "image/jpeg" });
    expect(model.textureBytes).toBe(textureBytes(8, 8) + textureBytes(16, 8) + textureBytes(4, 4));
  });

  it("sets flipY false and the MIME type itself, on a texture ready to upload", async () => {
    // GLTFLoader's texture step sets flipY on what the image-source step returns, so the step is asked here directly,
    // for a fourth image no texture names, which the parse never asked for.
    const spare = desk({ build: (b) => void b.image(png({ width: 2, height: 2 }), "image/png") });
    const seen: GLTFParser[] = [];
    const images = roomImages({ reduced: false, decode: decoder().decode });
    const loader = new GLTFLoader().register((parser) => {
      seen.push(parser);
      return images.plugin(parser);
    });
    await loader.parseAsync(buffer(spare.bytes), "");
    const parser = seen[0] as GLTFParser;
    expect(images.requested.has(3)).toBe(false);
    const texture = await parser.loadImageSource(3, parser.textureLoader);
    expect(texture.flipY).toBe(false);
    expect(texture.userData.mimeType).toBe("image/png");
    expect(texture.version).toBe(1);
    expect(images.decoded.get(3)).toEqual({ width: 2, height: 2, mimeType: "image/png" });
  });

  it("decodes at half size when reduced, closing each full-size bitmap", async () => {
    const { decode, calls } = decoder();
    const model = await parseModel(buffer(DESK), { reduced: true, decode });
    const full = calls.filter((c) => c.from === "blob");
    const halves = calls.filter((c) => c.from === "bitmap");
    expect(full.map((c) => c.options)).toEqual([DECODE, DECODE, DECODE]);
    expect(full.every((c) => c.made?.closed)).toBe(true);
    expect(halves.map((c) => [c.options.resizeWidth, c.options.resizeHeight]).sort()).toEqual([
      [2, 2],
      [4, 4],
      [8, 4],
    ]);
    for (const c of halves) {
      expect(c.options).toMatchObject(DECODE);
      expect(c.made?.closed).toBe(false);
    }
    const maps = mapsOf(model.gltf.scene);
    expect([bitmapOf(maps.get("material-0")).width, bitmapOf(maps.get("material-0")).height]).toEqual([4, 4]);
    expect([bitmapOf(maps.get("material-1")).width, bitmapOf(maps.get("material-1")).height]).toEqual([8, 4]);
    expect(model.textureBytes).toBe(textureBytes(4, 4) + textureBytes(8, 4) + textureBytes(2, 2));
  });

  it("never makes an object URL, a request, or a console message", async () => {
    const objectUrl = vi.spyOn(URL, "createObjectURL");
    const request = vi.spyOn(globalThis, "fetch");
    const errors = vi.spyOn(console, "error");
    const warnings = vi.spyOn(console, "warn");
    await parseModel(buffer(DESK), { reduced: true, decode: decoder().decode });
    expect(objectUrl).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it("decodes an image once however many textures use it, and the textures share it", async () => {
    // A shelf whose texture takes image 0 through a second sampler, as GLTFLoader keys a texture by image and sampler.
    const shared = desk({
      top: TOP,
      build: (b) => {
        list(b.gltf, "samplers").push({ name: "sampler-1", wrapS: 33071, wrapT: 33071 });
        const texture = list(b.gltf, "textures").length;
        list(b.gltf, "textures").push({ sampler: 1, source: 0, name: `texture-${texture}` });
        const material = b.material({ pbrMetallicRoughness: { baseColorTexture: { index: texture } } });
        b.root(
          b.node({
            name: "fx-shelf",
            mesh: b.mesh([b.box([-0.5, 0.3, -0.3], [0.5, 0.32, 0.3], material)], "fx-shelf"),
          }),
        );
      },
    });
    const { decode, calls } = decoder();
    const model = await parseModel(buffer(shared.bytes), { reduced: false, decode });
    expect(calls.filter((c) => c.type === "image/png")).toHaveLength(1);
    const maps = mapsOf(model.gltf.scene);
    const top = maps.get("material-0");
    const shelf = maps.get("material-3");
    expect(shelf).toBeInstanceOf(Texture);
    expect(shelf).not.toBe(top);
    expect(shelf?.source).toBe(top?.source);
    expect(shelf?.wrapS).toBe(ClampToEdgeWrapping);
    expect(shelf?.flipY).toBe(false);
    expect(model.images.size).toBe(3);
  });

  it("refuses an image uri, never fetching it: three leaves the material untextured, and the piece fails", async () => {
    for (const uri of ["top.png", "data:image/png;base64,iVBORw0KGgo="]) {
      const bytes = desk({
        edit: (gltf) => {
          const image = item(gltf, "images", 0);
          delete image.bufferView;
          image.uri = uri;
        },
      }).bytes;
      const request = vi.spyOn(globalThis, "fetch");

      const { decode, calls } = decoder();
      const images = roomImages({ reduced: false, decode });
      const gltf = await new GLTFLoader().register(images.plugin).parseAsync(buffer(bytes), "");
      expect(mapsOf(gltf.scene).get("material-0"), uri).toBeNull();
      expect([...images.requested].sort(), uri).toEqual([0, 1, 2]);
      expect([...images.decoded.keys()].sort(), uri).toEqual([1, 2]);
      expect(calls.map((c) => c.type).sort(), uri).toEqual(["image/jpeg", "image/webp"]);

      const again = decoder();
      await expect(parseModel(buffer(bytes), { reduced: false, decode: again.decode }), uri).rejects.toThrow(
        "decoded 2 of the 3 images its materials use",
      );
      expect(
        again.calls.map((c) => c.made?.closed),
        uri,
      ).toEqual([true, true]);
      expect(request, uri).not.toHaveBeenCalled();
    }
  });

  it("fails a piece an image of which doesn't decode, closing what it decoded", async () => {
    const { decode, calls } = decoder(["image/jpeg"]);
    await expect(parseModel(buffer(DESK), { reduced: false, decode })).rejects.toThrow(
      "decoded 2 of the 3 images its materials use",
    );
    expect(calls.map((c) => c.type).sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
    const made = calls.flatMap((c) => (c.made ? [c.made] : []));
    expect(made).toHaveLength(2);
    expect(made.every((bitmap) => bitmap.closed)).toBe(true);
  });

  it("fails a file that doesn't parse, decoding nothing", async () => {
    const { decode, calls } = decoder();
    await expect(parseModel(buffer(new Uint8Array([1, 2, 3, 4])), { reduced: false, decode })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("closes a parsed model's bitmaps on request, for a piece that won't be uploaded", async () => {
    const { decode, calls } = decoder();
    const model = await parseModel(buffer(DESK), { reduced: false, decode });
    expect(calls.some((c) => c.made?.closed)).toBe(false);
    model.close();
    expect(calls.every((c) => c.made?.closed)).toBe(true);
  });
});

describe("the texture ledger (FR-053, SC-006)", () => {
  /**
   * A renderer's initTexture, recording each upload and whether its bitmap was already closed, then calling the
   * texture's onUpdate, as three's renderer does after it uploads.
   */
  function renderer(): Uploader & { uploads: { texture: Texture; closed: boolean }[] } {
    const uploads: { texture: Texture; closed: boolean }[] = [];
    return {
      uploads,
      initTexture: (texture) => {
        uploads.push({ texture, closed: (texture.image as Partial<FakeBitmap>).closed === true });
        texture.onUpdate?.(texture);
      },
    };
  }

  it("counts FR-053's formula, as the fit check measures an image, against 96,000,000 bytes", () => {
    expect(SCENE_TEXTURE_BYTES).toBe(96_000_000);
    expect(createTextureLedger().limit).toBe(SCENE_TEXTURE_BYTES);
    const sides: [number, number][] = [
      [1, 1],
      [3, 5],
      [8, 8],
      [1024, 1024],
      [2048, 512],
      [4096, 4096],
      [16383, 16381],
      [16384, 16384],
    ];
    for (const [width, height] of sides) expect(textureBytes(width, height)).toBe(textureMemory(width, height));
    expect(textureBytes(1024, 1024)).toBe(5_592_405);
  });

  it("uploads every texture handed to it, counts each image once, then closes the decoded bitmaps", () => {
    const ledger = createTextureLedger();
    const gpu = renderer();
    const a = new Texture(new FakeBitmap(1024, 1024) as unknown as ImageBitmap);
    const sharing = a.clone();
    const b = new Texture(new FakeBitmap(512, 256) as unknown as ImageBitmap);
    // A live face's canvas: counted, and never closed.
    const canvas = new Texture({ width: 300, height: 150 } as unknown as HTMLCanvasElement);
    ledger.upload(gpu, [a, sharing, b, canvas]);
    expect(gpu.uploads.map((u) => u.texture.uuid)).toEqual([a.uuid, sharing.uuid, b.uuid, canvas.uuid]);
    expect(gpu.uploads.some((u) => u.closed)).toBe(false);
    const total = textureBytes(1024, 1024) + textureBytes(512, 256) + textureBytes(300, 150);
    expect(ledger.bytes).toBe(total);
    expect([a, b].map((t) => bitmapOf(t).closed)).toEqual([true, true]);
    ledger.upload(gpu, [a, sharing]);
    expect(ledger.bytes).toBe(total);
  });

  it("counts an image until the last texture sharing it is disposed", () => {
    const ledger = createTextureLedger();
    const a = new Texture(new FakeBitmap(64, 64) as unknown as ImageBitmap);
    const sharing = a.clone();
    const b = new Texture(new FakeBitmap(32, 16) as unknown as ImageBitmap);
    ledger.upload(renderer(), [a, sharing, b]);
    a.dispose();
    expect(ledger.bytes).toBe(textureBytes(64, 64) + textureBytes(32, 16));
    sharing.dispose();
    expect(ledger.bytes).toBe(textureBytes(32, 16));
    b.dispose();
    b.dispose();
    expect(ledger.bytes).toBe(0);
  });

  it("counts each upload at the size uploaded, keeping a closed bitmap's count", () => {
    const ledger = createTextureLedger();
    const gpu = renderer();
    // A live face's canvas, redrawn smaller at another quality level and uploaded again by the renderer.
    const face = { width: 512, height: 128 };
    const canvas = new Texture(face as unknown as HTMLCanvasElement);
    let theirs = 0;
    canvas.onUpdate = () => (theirs += 1);
    const bitmap = new Texture(new FakeBitmap(64, 64) as unknown as ImageBitmap);
    ledger.upload(gpu, [canvas, bitmap]);
    expect(ledger.bytes).toBe(textureBytes(512, 128) + textureBytes(64, 64));
    Object.assign(face, { width: 256, height: 64 });
    gpu.initTexture(canvas);
    gpu.initTexture(bitmap);
    expect(ledger.bytes).toBe(textureBytes(256, 64) + textureBytes(64, 64));
    expect(theirs).toBe(2);
    canvas.dispose();
    bitmap.dispose();
    expect(ledger.bytes).toBe(0);
  });

  it("closes the bitmaps handed to it even when an upload throws, and the loader's dispose takes them off", () => {
    const ledger = createTextureLedger();
    const a = new Texture(new FakeBitmap(4, 4) as unknown as ImageBitmap);
    const b = new Texture(new FakeBitmap(4, 4) as unknown as ImageBitmap);
    const lost: Uploader = {
      initTexture: () => {
        throw new Error("context lost");
      },
    };
    expect(() => ledger.upload(lost, [a, b])).toThrow("context lost");
    expect([a, b].map((t) => bitmapOf(t).closed)).toEqual([true, true]);
    expect(ledger.bytes).toBe(textureBytes(4, 4));
    a.dispose();
    b.dispose();
    expect(ledger.bytes).toBe(0);
  });

  it("fits textures up to its limit, and not a byte over", () => {
    const ledger = createTextureLedger(1000);
    expect(ledger.limit).toBe(1000);
    expect(ledger.fits(1000)).toBe(true);
    expect(ledger.fits(1001)).toBe(false);
    ledger.upload(renderer(), [new Texture(new FakeBitmap(8, 8) as unknown as ImageBitmap)]);
    expect(ledger.bytes).toBe(341);
    expect(ledger.fits(659)).toBe(true);
    expect(ledger.fits(660)).toBe(false);
  });
});
