// GLBs and their textures, made when a test runs (spec 004, T063; FR-015 to FR-019, FR-022, SC-002; research.md R-66;
// contracts/plain-model-fit.md §12). Spec 003's rule A1 refuses a committed model or image outside assets/, so every file
// the fit check's tests read is built here, never committed. `glb()`, `packGlb()`, and `png()` port spec 003's
// arrival_fixtures.py (tools/gates/test/, carried by the Author's patch
// docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.patch on feat/003-us1-arrival-check: read, never applied),
// and the other builders follow the containers that file follows:
// - PNG: the 8-byte signature, then chunks of a 4-byte big-endian length, a 4-byte type, the data, and a CRC-32 over the
//   type and the data; IHDR first, IEND last.
// - JPEG: SOI (FF D8), then marker segments, each FF xx and a 2-byte big-endian length that counts itself; EOI (FF D9)
//   ends it. The image is real: one-code Huffman tables (DC category 0, AC end-of-block), so its scan is two zero bits
//   a block, padded with ones.
// - WebP: RIFF, a little-endian size counting from "WEBP", then chunks of a FourCC, a little-endian size, and the data,
//   padded to an even length. VP8X's first byte holds the flags (0x10 alpha, 0x02 animation). The bitstreams carry real
//   headers before stand-in bits: the fit check reads headers, never pixels.
// - GLB: "glTF", version 2, the total length, then a JSON chunk padded with spaces and a BIN chunk padded with zeros.
// The room's two models, a desk and a sign, come in the scrubbed form scrub.py writes: a neutral ID on every material,
// image, texture, and sampler, and the mark as KHR_xmp_json_ld's one packet on the asset. Every other name in them
// starts "fx-", so a test can tell a refusal that prints one. `rxVariants()` breaks them, one rule at a time.
import { crc32, deflateSync } from "node:zlib";

import type { FitInput, Vec3 } from "../../src/room/glb/fit";

/** A glTF JSON object as the builders write it, edited in place by a test. */
export type Obj = Record<string, unknown>;

// --------------------------------------------------------------------------------------------------------------------
// Bytes
// --------------------------------------------------------------------------------------------------------------------
const TEXT = new TextEncoder();

export function bytes(...values: readonly number[]): Uint8Array {
  return Uint8Array.from(values);
}

export function ascii(text: string): Uint8Array {
  return TEXT.encode(text);
}

export function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const u16be = (n: number): Uint8Array => bytes((n >>> 8) & 0xff, n & 0xff);
const u32be = (n: number): Uint8Array => bytes((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
const u16le = (n: number): Uint8Array => bytes(n & 0xff, (n >>> 8) & 0xff);
const u24le = (n: number): Uint8Array => bytes(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff);
export const u32le = (n: number): Uint8Array => bytes(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);

/** `data` padded with `fill` to a multiple of 4 bytes. */
export function pad4(data: Uint8Array, fill: number): Uint8Array {
  const extra = (4 - (data.length % 4)) % 4;
  return extra ? concat(data, new Uint8Array(extra).fill(fill)) : data;
}

// glTF's component types.
export const BYTE = 5120;
export const UNSIGNED_BYTE = 5121;
export const SHORT = 5122;
export const UNSIGNED_SHORT = 5123;
export const UNSIGNED_INT = 5125;
export const FLOAT = 5126;
const SIZE: Readonly<Record<number, number>> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const PER_ELEMENT: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Values as little-endian components of one type, tightly packed. */
export function encode(values: readonly number[], componentType: number): Uint8Array {
  const size = SIZE[componentType] ?? 4;
  const out = new Uint8Array(values.length * size);
  const view = new DataView(out.buffer);
  values.forEach((value, i) => {
    const at = i * size;
    if (componentType === BYTE) view.setInt8(at, value);
    else if (componentType === UNSIGNED_BYTE) view.setUint8(at, value);
    else if (componentType === SHORT) view.setInt16(at, value, true);
    else if (componentType === UNSIGNED_SHORT) view.setUint16(at, value, true);
    else if (componentType === UNSIGNED_INT) view.setUint32(at, value, true);
    else view.setFloat32(at, value, true);
  });
  return out;
}

// --------------------------------------------------------------------------------------------------------------------
// Editing a glTF JSON object
// --------------------------------------------------------------------------------------------------------------------
export function obj(value: unknown): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object");
  return value as Obj;
}

/** `parent[key]` as an array, made empty when it's absent. */
export function list(parent: Obj, key: string): unknown[] {
  if (parent[key] === undefined) parent[key] = [];
  const value = parent[key];
  if (!Array.isArray(value)) throw new Error(`${key} isn't an array`);
  return value;
}

/** `parent[key][index]`, an object. */
export function item(parent: Obj, key: string, index: number): Obj {
  return obj(list(parent, key)[index]);
}

/** The primitive `meshes[mesh].primitives[index]`. */
export function primitive(gltf: Obj, mesh: number, index: number): Obj {
  return item(item(gltf, "meshes", mesh), "primitives", index);
}

// --------------------------------------------------------------------------------------------------------------------
// PNG
// --------------------------------------------------------------------------------------------------------------------
export const PNG_SIGNATURE = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export function chunk(kind: string, body: Uint8Array): Uint8Array {
  const type = ascii(kind);
  return concat(u32be(body.length), type, body, u32be(crc32(concat(type, body)) >>> 0));
}

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export interface PngOptions {
  readonly width?: number;
  readonly height?: number;
  readonly bitDepth?: number;
  /** PNG's colour type: 0 grey, 2 RGB, 3 palette, 4 grey and alpha, 6 RGBA. */
  readonly colorType?: number;
  /** One byte for every sample, so a large image deflates quickly; else arrival_fixtures.scanlines()'s pattern. */
  readonly fill?: number;
  readonly level?: number;
  readonly before?: readonly Uint8Array[];
  readonly after?: readonly Uint8Array[];
  readonly trailing?: Uint8Array;
}

/** arrival_fixtures.png() without its mark: an 8-bit RGB PNG by default. `before` and `after` are whole chunks placed
 *  before and after IDAT. */
export function png(o: PngOptions = {}): Uint8Array {
  const { width = 4, height = 4, bitDepth = 8, colorType = 2, level = 9 } = o;
  const row = Math.ceil((width * (CHANNELS[colorType] ?? 3) * bitDepth) / 8);
  const raw = new Uint8Array(height * (row + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < row; x++) raw[y * (row + 1) + 1 + x] = o.fill ?? (x * 37 + y * 11) % 251;
  }
  const ihdr = chunk("IHDR", concat(u32be(width), u32be(height), bytes(bitDepth, colorType, 0, 0, 0)));
  const palette = colorType === 3 ? [chunk("PLTE", bytes(0, 0, 0, 255, 255, 255))] : [];
  return concat(
    PNG_SIGNATURE,
    ihdr,
    ...palette,
    ...(o.before ?? []),
    chunk("IDAT", deflateSync(raw, { level })),
    ...(o.after ?? []),
    chunk("IEND", new Uint8Array()),
    o.trailing ?? new Uint8Array(),
  );
}

/** A PNG whose header names `width` × `height`, 8-bit RGB, over a single byte of data: the fit check and the lookdev
 *  tests' decoder read headers alone, so a texture past any cap costs nothing to build. */
export function pngHeader(width: number, height: number): Uint8Array {
  const ihdr = chunk("IHDR", concat(u32be(width), u32be(height), bytes(8, 2, 0, 0, 0)));
  return concat(PNG_SIGNATURE, ihdr, chunk("IDAT", deflateSync(new Uint8Array(1))), chunk("IEND", new Uint8Array()));
}

// --------------------------------------------------------------------------------------------------------------------
// JPEG
// --------------------------------------------------------------------------------------------------------------------
export function segment(marker: number, body: Uint8Array): Uint8Array {
  return concat(bytes(0xff, marker), u16be(body.length + 2), body);
}

const JFIF = segment(0xe0, concat(ascii("JFIF\0"), bytes(1, 1, 0), u16be(1), u16be(1), bytes(0, 0)));

export interface JpegOptions {
  readonly width?: number;
  readonly height?: number;
  readonly components?: number;
  readonly precision?: number;
  /** The start-of-frame marker: C0 baseline, C1 extended, C2 progressive, C3 lossless, C9 arithmetic. */
  readonly sof?: number;
}

/** A real JPEG, three components at 1×1 sampling by default. arrival_fixtures.jpeg()'s 8×8 grey image is
 *  `jpeg({components: 1})`, byte for byte but its mark. */
export function jpeg(o: JpegOptions = {}): Uint8Array {
  const { width = 8, height = 8, components = 3, precision = 8, sof = 0xc0 } = o;
  const ids = Array.from({ length: components }, (_, i) => i + 1);
  const bits = 2 * Math.ceil(width / 8) * Math.ceil(height / 8) * components;
  const scan = new Uint8Array(Math.ceil(bits / 8));
  if (bits % 8) scan[scan.length - 1] = (1 << (8 - (bits % 8))) - 1;
  return concat(
    bytes(0xff, 0xd8),
    JFIF,
    segment(0xdb, concat(bytes(0), new Uint8Array(64).fill(1))),
    segment(
      sof,
      concat(bytes(precision), u16be(height), u16be(width), bytes(components), ...ids.map((id) => bytes(id, 0x11, 0))),
    ),
    segment(0xc4, concat(bytes(0x00, 1), new Uint8Array(15), bytes(0))),
    segment(0xc4, concat(bytes(0x10, 1), new Uint8Array(15), bytes(0))),
    segment(0xda, concat(bytes(components), ...ids.map((id) => bytes(id, 0)), bytes(0, 63, 0))),
    scan,
    bytes(0xff, 0xd9),
  );
}

// --------------------------------------------------------------------------------------------------------------------
// WebP
// --------------------------------------------------------------------------------------------------------------------
export function riffChunk(fourcc: string, body: Uint8Array): Uint8Array {
  return concat(ascii(fourcc), u32le(body.length), body, body.length % 2 ? bytes(0) : new Uint8Array());
}

/** VP8L's header: the signature 0x2F, then 14-bit width − 1 and height − 1. */
export function vp8l(width: number, height: number): Uint8Array {
  return concat(bytes(0x2f), u32le(((width - 1) | ((height - 1) << 14)) >>> 0), new Uint8Array(5));
}

/** VP8's key frame: a 3-byte frame tag (a key frame, shown, a 10-byte first partition), the start code 9D 01 2A, then
 *  14-bit width and height. */
export function vp8(width: number, height: number): Uint8Array {
  const tag = (1 << 4) | (10 << 5);
  return concat(
    bytes(tag & 0xff, (tag >>> 8) & 0xff, (tag >>> 16) & 0xff),
    bytes(0x9d, 0x01, 0x2a),
    u16le(width & 0x3fff),
    u16le(height & 0x3fff),
    new Uint8Array(10),
  );
}

export interface WebpOptions {
  readonly width?: number;
  readonly height?: number;
  /** VP8 rather than VP8L. */
  readonly lossy?: boolean;
  /** VP8X's flags, which put a VP8X header first. */
  readonly flags?: number;
  /** VP8X's animation flag, ANIM, and one ANMF frame. */
  readonly animated?: boolean;
}

export function webp(o: WebpOptions = {}): Uint8Array {
  const { width = 4, height = 4 } = o;
  const image = o.lossy ? riffChunk("VP8 ", vp8(width, height)) : riffChunk("VP8L", vp8l(width, height));
  const vp8x = (flags: number): Uint8Array =>
    riffChunk("VP8X", concat(bytes(flags, 0, 0, 0), u24le(width - 1), u24le(height - 1)));
  let body = image;
  if (o.animated) {
    const frame = concat(u24le(0), u24le(0), u24le(width - 1), u24le(height - 1), u24le(100), bytes(0), image);
    body = concat(vp8x(0x02 | (o.flags ?? 0)), riffChunk("ANIM", new Uint8Array(6)), riffChunk("ANMF", frame));
  } else if (o.flags !== undefined) {
    body = concat(vp8x(o.flags), image);
  }
  const riff = concat(ascii("WEBP"), body);
  return concat(ascii("RIFF"), u32le(riff.length), riff);
}

// --------------------------------------------------------------------------------------------------------------------
// GLB, and spec 003's glb()
// --------------------------------------------------------------------------------------------------------------------
export const JSON_CHUNK = 0x4e4f534a;
export const BIN_CHUNK = 0x004e4942;

/** A GLB from its chunks as given, each a type and its data, with no padding added, so a test can break it. */
export function packChunks(chunks: readonly (readonly [number, Uint8Array])[]): Uint8Array {
  const body = concat(...chunks.map(([kind, data]) => concat(u32le(data.length), u32le(kind), data)));
  return concat(ascii("glTF"), u32le(2), u32le(12 + body.length), body);
}

/** A GLB whose JSON chunk holds `text` as written, padded with spaces, and whose BIN chunk holds `binary`, padded with
 *  zeros: the strict JSON's cases. */
export function packText(text: string | Uint8Array, binary: Uint8Array): Uint8Array {
  const json = typeof text === "string" ? ascii(text) : text;
  return packChunks([
    [JSON_CHUNK, pad4(json, 0x20)],
    [BIN_CHUNK, pad4(binary, 0)],
  ]);
}

/** arrival_fixtures.pack_glb(). */
export function packGlb(gltf: unknown, binary: Uint8Array): Uint8Array {
  return packText(JSON.stringify(gltf), binary);
}

export const MARK_NAMESPACE = "http://iptc.org/std/Iptc4xmpExt/2008-02-29/";
export const MARK_VOCABULARY = "http://cv.iptc.org/newscodes/digitalsourcetype/";
/** The term arrival_fixtures.MARK_VALUE ends in, spec 003's only one. */
export const MODEL_TERM = "trainedAlgorithmicMedia";

/** The mark's packet, arrival_fixtures.MARK_JSON with `term` for its value. */
export function markPacket(term: string = MODEL_TERM): Obj {
  return { "@context": { Iptc4xmpExt: MARK_NAMESPACE }, "Iptc4xmpExt:DigitalSourceType": MARK_VOCABULARY + term };
}

/** The mark as scrub.py writes it: KHR_xmp_json_ld named beside the file's other extensions, its one packet on the root,
 *  and the asset's reference to it. */
export function addMark(gltf: Obj, term: string = MODEL_TERM): void {
  list(gltf, "extensionsUsed").push("KHR_xmp_json_ld");
  gltf.extensions = {
    ...(gltf.extensions === undefined ? {} : obj(gltf.extensions)),
    KHR_xmp_json_ld: { packets: [markPacket(term)] },
  };
  obj(gltf.asset).extensions = { KHR_xmp_json_ld: { packet: 0 } };
}

/** The generator Blender's glTF exporter writes into every file's asset, a property outside the arrival check's schema,
 *  which spec 003's scrub drops. */
export const BLENDER_GENERATOR = "Khronos glTF Blender I/O v4.2.70";

/** A file as Blender exports it, before the scrub, as an `edit` for any builder here: the asset's generator, and a
 *  custom property as `extras` on the first node. With `mark: false`, the studio's file as the Author picks it. */
export function asExported(gltf: Obj): void {
  obj(gltf.asset).generator = BLENDER_GENERATOR;
  item(gltf, "nodes", 0).extras = { "fx-note": "fx-from-the-studio" };
}

export interface GlbOptions {
  /** The mark's term, true for spec 003's, or false for none. */
  readonly mark?: boolean | string;
  readonly image?: Uint8Array;
  readonly imageName?: string;
  readonly materialName?: string;
  readonly nodeName?: string;
  readonly targetNames?: readonly string[];
  readonly extraBin?: Uint8Array;
  readonly edit?: (gltf: Obj) => void;
}

/** arrival_fixtures.glb(): one triangle with an embedded PNG texture, and, with `targetNames`, a morph target and
 *  mesh.extras.targetNames. `edit` changes the glTF JSON before it's packed; `extraBin` adds bytes no bufferView covers.
 *  Its triangle's bounds run from (0, 0, 0) to (1, 1, 0): `ARRIVAL_INPUT`. */
export function glb(o: GlbOptions = {}): Uint8Array {
  const image = o.image ?? png();
  const parts: Uint8Array[] = [];
  const views: Obj[] = [];
  const view = (data: Uint8Array): number => {
    views.push({ buffer: 0, byteOffset: parts.reduce((n, part) => n + part.length, 0), byteLength: data.length });
    parts.push(pad4(data, 0));
    return views.length - 1;
  };
  const positions = view(encode([0, 0, 0, 1, 0, 0, 0, 1, 0], FLOAT));
  const indices = view(encode([0, 1, 2], UNSIGNED_SHORT));
  const texture = view(image);
  const binary = concat(...parts, o.extraBin ?? new Uint8Array());
  const prim: Obj = { attributes: { POSITION: 0 }, indices: 1, material: 0 };
  const mesh: Obj = { primitives: [prim] };
  if (o.targetNames !== undefined) {
    prim.targets = [{ POSITION: 0 }];
    mesh.weights = [0];
    mesh.extras = { targetNames: [...o.targetNames] };
  }
  const gltf: Obj = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: o.nodeName ?? "root" }],
    meshes: [mesh],
    accessors: [
      { bufferView: positions, componentType: FLOAT, count: 3, type: "VEC3", max: [1, 1, 0], min: [0, 0, 0] },
      { bufferView: indices, componentType: UNSIGNED_SHORT, count: 3, type: "SCALAR" },
    ],
    bufferViews: views,
    buffers: [{ byteLength: binary.length }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    samplers: [{}],
    textures: [{ source: 0, sampler: 0 }],
    images: [{ bufferView: texture, mimeType: "image/png" }],
  };
  if (o.imageName !== undefined) item(gltf, "images", 0).name = o.imageName;
  if (o.materialName !== undefined) item(gltf, "materials", 0).name = o.materialName;
  if (o.mark !== false) addMark(gltf, typeof o.mark === "string" ? o.mark : MODEL_TERM);
  o.edit?.(gltf);
  return packGlb(gltf, binary);
}

/** arrival_fixtures.big_glb(): a GLB of about `megabytes` MB, its texture a stored (uncompressed) PNG of that size. */
export function bigGlb(megabytes = 10): Uint8Array {
  const side = Math.floor(Math.sqrt((megabytes * 1_000_000) / 3));
  return glb({ image: png({ width: side, height: side, level: 0 }) });
}

/** What glb()'s one triangle is judged against: its own bounds, no live face. */
export const ARRIVAL_INPUT: FitInput = {
  bounds: { min: [0, 0, 0], max: [1, 1, 0] },
  faces: [],
  smallPropTexturePx: null,
};

// --------------------------------------------------------------------------------------------------------------------
// The room's models
// --------------------------------------------------------------------------------------------------------------------
/** A live face's quad: its centre, its width and height, its facing (the normal), and its up. */
export interface Quad {
  readonly centre: Vec3;
  readonly size: readonly [number, number];
  readonly facing: Vec3;
  readonly up: Vec3;
}

export type Uv = readonly [number, number];

/** The quad's corners in reading order, top-left, top-right, bottom-left, bottom-right: the order its vertices take. */
export function corners(q: Quad): [Vec3, Vec3, Vec3, Vec3] {
  const [f, u] = [q.facing, q.up];
  const r: Vec3 = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];
  const at = (x: number, y: number): Vec3 => [
    q.centre[0] + (r[0] * x * q.size[0]) / 2 + (u[0] * y * q.size[1]) / 2,
    q.centre[1] + (r[1] * x * q.size[0]) / 2 + (u[1] * y * q.size[1]) / 2,
    q.centre[2] + (r[2] * x * q.size[0]) / 2 + (u[2] * y * q.size[1]) / 2,
  ];
  return [at(-1, 1), at(1, 1), at(-1, -1), at(1, -1)];
}

/** The texture coordinates of `corners()`, as the GLB stores them: (0, 0) at the top-left. */
export const QUAD_UVS: readonly Uv[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];
/** Two triangles, wound counter-clockwise seen from the quad's facing. */
export const QUAD_INDICES: readonly number[] = [0, 2, 1, 1, 2, 3];

const BOX_INDICES = [
  4, 5, 7, 4, 7, 6, 0, 2, 3, 0, 3, 1, 1, 3, 7, 1, 7, 5, 0, 4, 6, 0, 6, 2, 2, 6, 7, 2, 7, 3, 0, 1, 5, 0, 5, 4,
];

export interface Model {
  readonly gltf: Obj;
  readonly bin: Uint8Array;
  readonly bytes: Uint8Array;
}

export interface PackOptions {
  /** The mark's term (spec 003's by default), or false for an unscrubbed file. */
  readonly mark?: string | false | undefined;
  readonly edit?: ((gltf: Obj) => void) | undefined;
}

/** Builds a scrubbed-form GLB: buffer views appended in order, each padded to 4 bytes, and neutral IDs on the materials,
 *  images, textures, and samplers it makes. */
export class ModelBuilder {
  readonly gltf: Obj = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    textures: [],
    samplers: [],
    images: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };
  private readonly parts: Uint8Array[] = [];
  private length = 0;

  private add(key: string, value: Obj): number {
    const into = list(this.gltf, key);
    into.push(value);
    return into.length - 1;
  }

  view(data: Uint8Array, extra: Obj = {}): number {
    const index = this.add("bufferViews", { buffer: 0, byteOffset: this.length, byteLength: data.length, ...extra });
    const padded = pad4(data, 0);
    this.parts.push(padded);
    this.length += padded.length;
    return index;
  }

  accessor(def: Obj): number {
    return this.add("accessors", def);
  }

  /** An accessor over its own buffer view, tightly packed. */
  values(values: readonly number[], type: string, componentType: number, extra: Obj = {}): number {
    const per = PER_ELEMENT[type] ?? 1;
    const bufferView = this.view(encode(values, componentType));
    return this.accessor({ bufferView, componentType, count: values.length / per, type, ...extra });
  }

  /** Float positions, with the min and max glTF asks of POSITION. */
  positions(points: readonly Vec3[]): number {
    const min = [0, 1, 2].map((a) => Math.min(...points.map((p) => p[a] ?? 0)));
    const max = [0, 1, 2].map((a) => Math.max(...points.map((p) => p[a] ?? 0)));
    return this.values(points.flat(), "VEC3", FLOAT, { min, max });
  }

  texcoords(uvs: readonly Uv[]): number {
    return this.values(uvs.flat(), "VEC2", FLOAT);
  }

  indices(values: readonly number[], componentType: number = UNSIGNED_SHORT): number {
    return this.values(values, "SCALAR", componentType);
  }

  /** An embedded image, named with its neutral ID. */
  image(data: Uint8Array, mimeType: string): number {
    const index = list(this.gltf, "images").length;
    return this.add("images", { bufferView: this.view(data), mimeType, name: `image-${index}` });
  }

  /** A texture of `image` through the one sampler; a WebP's through EXT_texture_webp, which the file then requires. */
  texture(image: number, webp = false): number {
    if (list(this.gltf, "samplers").length === 0) this.add("samplers", { name: "sampler-0" });
    const index = list(this.gltf, "textures").length;
    if (!webp) return this.add("textures", { sampler: 0, source: image, name: `texture-${index}` });
    for (const key of ["extensionsUsed", "extensionsRequired"]) {
      if (!list(this.gltf, key).includes("EXT_texture_webp")) list(this.gltf, key).push("EXT_texture_webp");
    }
    return this.add("textures", {
      sampler: 0,
      extensions: { EXT_texture_webp: { source: image } },
      name: `texture-${index}`,
    });
  }

  /** A material named with its neutral ID. */
  material(def: Obj = {}): number {
    return this.add("materials", { name: `material-${list(this.gltf, "materials").length}`, ...def });
  }

  /** A material whose base colour is a texture of a new image. */
  textured(data: Uint8Array, mimeType: string): number {
    const texture = this.texture(this.image(data, mimeType), mimeType === "image/webp");
    return this.material({ pbrMetallicRoughness: { baseColorTexture: { index: texture } } });
  }

  mesh(primitives: readonly Obj[], name: string): number {
    return this.add("meshes", { primitives: [...primitives], name });
  }

  node(def: Obj): number {
    return this.add("nodes", def);
  }

  /** A node of the default scene. */
  root(node: number): void {
    list(item(this.gltf, "scenes", 0), "nodes").push(node);
  }

  /** A box's primitive: eight vertices, twelve triangles wound outward. */
  box(min: Vec3, max: Vec3, material?: number): Obj {
    const points = Array.from({ length: 8 }, (_, i): Vec3 => [
      i & 1 ? max[0] : min[0],
      i & 2 ? max[1] : min[1],
      i & 4 ? max[2] : min[2],
    ]);
    const prim: Obj = { attributes: { POSITION: this.positions(points) }, indices: this.indices(BOX_INDICES) };
    if (material !== undefined) prim.material = material;
    return prim;
  }

  /** A live face's primitive: four vertices in reading order with their texture coordinates, two triangles. */
  quad(q: Quad, material?: number, uvs: readonly Uv[] = QUAD_UVS, indices: readonly number[] = QUAD_INDICES): Obj {
    const prim: Obj = {
      attributes: { POSITION: this.positions(corners(q)), TEXCOORD_0: this.texcoords(uvs) },
      indices: this.indices(indices),
    };
    if (material !== undefined) prim.material = material;
    return prim;
  }

  binary(): Uint8Array {
    return concat(...this.parts);
  }

  /** The file: the buffer, empty lists dropped, the mark unless `mark` is false, then `edit`. It changes `gltf` in
   *  place, so a builder packs once. */
  pack(o: PackOptions = {}): Model {
    const bin = this.binary();
    list(this.gltf, "buffers").push({ byteLength: bin.length });
    for (const key of ["extensionsUsed", "extensionsRequired", "textures", "samplers", "images", "materials"]) {
      if (Array.isArray(this.gltf[key]) && list(this.gltf, key).length === 0) delete this.gltf[key];
    }
    if (o.mark !== false) addMark(this.gltf, o.mark ?? MODEL_TERM);
    o.edit?.(this.gltf);
    return { gltf: this.gltf, bin, bytes: packGlb(this.gltf, bin) };
  }
}

/** The clean desk, a hand-made piece at a stylized scale of 1: its catalog's bounds, and no live face. */
export const DESK_INPUT: FitInput = {
  bounds: { min: [-0.8, 0, -0.4], max: [0.8, 0.75, 0.4] },
  faces: [],
  smallPropTexturePx: null,
};
/** The desk's nodes and meshes by index. */
export const DESK = {
  nodes: { desk: 0, top: 1, leg1: 2, leg2: 3, leg3: 4, leg4: 5, drawer: 6 },
  meshes: { top: 0, leg: 1, drawer: 2 },
} as const;

export interface DeskOptions extends PackOptions {
  /** The top's texture, a PNG (8 × 8 RGB); the legs', a JPEG (16 × 8, baseline); the drawer's, a WebP (4 × 4, VP8L). */
  readonly top?: Uint8Array;
  readonly legs?: Uint8Array;
  readonly drawer?: Uint8Array;
  /** Adds to the model before it's packed. */
  readonly build?: (b: ModelBuilder) => void;
}

/** A desk top on four legs, the legs one mesh that four nodes use (three by TRS, one by a matrix), and a drawer, under a
 *  root turned 180° about Y. Its bounds are DESK_INPUT's exactly. */
export function desk(o: DeskOptions = {}): Model {
  const b = new ModelBuilder();
  const top = b.textured(o.top ?? png({ width: 8, height: 8 }), "image/png");
  const legs = b.textured(o.legs ?? jpeg({ width: 16, height: 8 }), "image/jpeg");
  const drawer = b.textured(o.drawer ?? webp({ width: 4, height: 4 }), "image/webp");
  const topMesh = b.mesh([b.box([-0.8, 0.72, -0.4], [0.8, 0.75, 0.4], top)], "fx-top");
  const legMesh = b.mesh([b.box([-0.025, 0, -0.025], [0.025, 0.72, 0.025], legs)], "fx-leg");
  const drawerMesh = b.mesh([b.box([0.2, 0.6, -0.35], [0.6, 0.7, 0.35], drawer)], "fx-drawer");
  b.root(b.node({ name: "fx-desk", rotation: [0, 1, 0, 0], children: [1, 2, 3, 4, 5, 6] }));
  b.node({ name: "fx-top", mesh: topMesh });
  b.node({ name: "fx-leg-1", mesh: legMesh, translation: [-0.75, 0, -0.35] });
  b.node({ name: "fx-leg-2", mesh: legMesh, translation: [0.75, 0, -0.35] });
  b.node({ name: "fx-leg-3", mesh: legMesh, translation: [-0.75, 0, 0.35] });
  b.node({ name: "fx-leg-4", mesh: legMesh, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.75, 0, 0.35, 1] });
  b.node({ name: "fx-drawer", mesh: drawerMesh });
  o.build?.(b);
  return b.pack(o);
}

/** The desk with three points of its own under its root (mode 0, no triangle): zeros but the second, which a sparse
 *  substitution puts at (0.5, 0.7, 0.3), and the desk's turn at (−0.5, 0.7, −0.3), so its bounds stay DESK_INPUT's. The
 *  substitution's index and values sit past the start of their views, at explicit byteOffsets of 4 and 12, after bytes
 *  that would be refused if read (an index of 7, values of 9), so a sweep has sparse offsets to change. */
export function sparseDesk(o: DeskOptions = {}): Model {
  return desk({
    ...o,
    build: (b) => {
      const points = b.accessor({
        componentType: FLOAT,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [0.5, 0.7, 0.3],
        sparse: {
          count: 1,
          indices: {
            bufferView: b.view(encode([7, 7, 1], UNSIGNED_SHORT)),
            byteOffset: 4,
            componentType: UNSIGNED_SHORT,
          },
          values: { bufferView: b.view(encode([9, 9, 9, 0.5, 0.7, 0.3], FLOAT)), byteOffset: 12 },
        },
      });
      const mesh = b.mesh([{ attributes: { POSITION: points }, mode: 0 }], "fx-points");
      list(item(b.gltf, "nodes", 0), "children").push(b.node({ name: "fx-points", mesh }));
      o.build?.(b);
    },
  });
}

/** The sparse desk's points accessor, by index: after the desk's three boxes' positions and indices. */
export const SPARSE_POINTS = 6;

/** The clean sign's catalog entry at scale 1, with a stylized scale of 2 (a readable prop). */
export const SIGN_CATALOG = {
  bounds: { min: [-0.2, 0, -0.01], max: [0.2, 0.2, 0.01] },
  faces: [
    { role: "fx-word", at: [0, 0.13, 0.01], size: [0.3, 0.08], facing: [0, 0, 1], up: [0, 1, 0] },
    { role: "fx-tally", at: [0.1, 0.05, 0.01], size: [0.12, 0.04], facing: [0, 0, 1], up: [0, 1, 0] },
  ],
  scale: 2,
} as const;

/** SIGN_CATALOG at its stylized scale, worked by hand: every length and point times 2, the directions unchanged. */
export const SIGN_INPUT: FitInput = {
  bounds: { min: [-0.4, 0, -0.02], max: [0.4, 0.4, 0.02] },
  faces: [
    { role: "fx-word", at: [0, 0.26, 0.02], size: [0.6, 0.16], facing: [0, 0, 1], up: [0, 1, 0] },
    { role: "fx-tally", at: [0.2, 0.1, 0.02], size: [0.24, 0.08], facing: [0, 0, 1], up: [0, 1, 0] },
  ],
  smallPropTexturePx: null,
};

/** The sign's nodes, meshes, and materials by index. */
export const SIGN = {
  nodes: { sign: 0, backing: 1, clip: 2, word: 3, tally: 4 },
  meshes: { backing: 0, clip: 1, word: 2, tally: 3 },
  materials: { backing: 0, clip: 1, face: 2 },
} as const;

/** The word face in its node's frame: the quad lies in the node's XZ plane, facing +Y with its up along −Z, and the node
 *  turns it 90° about X, so it faces +Z with its up +Y. */
export const WORD_QUAD: Quad = { centre: [0, 0, 0], size: [0.6, 0.16], facing: [0, 1, 0], up: [0, 0, -1] };
export const WORD_NODE: Obj = { translation: [0, 0.26, 0.02], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] };

/** A unit quaternion turning `degrees` about X. */
export function aboutX(degrees: number): [number, number, number, number] {
  const half = (degrees * Math.PI) / 360;
  return [Math.sin(half), 0, 0, Math.cos(half)];
}

export interface SignOptions extends PackOptions {
  /** The word face's quad, texture coordinates, and indices, or its whole primitive. */
  readonly word?: {
    readonly quad?: Partial<Quad>;
    readonly uvs?: readonly Uv[];
    readonly indices?: readonly number[];
    readonly primitive?: (b: ModelBuilder, material: number) => Obj;
  };
  /** Over WORD_NODE's translation and rotation. */
  readonly wordNode?: Obj;
  readonly build?: (b: ModelBuilder) => void;
}

/** A sign: a backing (under a translated node) with the tally face as its child, a clip placed by a matrix, and the word
 *  face turned by a quaternion; a PNG (RGBA) on the backing and a lossy WebP (VP8X, VP8) on the clip; both faces one
 *  plain material. At SIGN_CATALOG's scale its bounds and faces are SIGN_INPUT's exactly. */
export function sign(o: SignOptions = {}): Model {
  const b = new ModelBuilder();
  const backing = b.textured(png({ colorType: 6 }), "image/png");
  const clip = b.textured(webp({ width: 8, height: 8, lossy: true, flags: 0 }), "image/webp");
  const face = b.material({ pbrMetallicRoughness: { baseColorFactor: [0.05, 0.05, 0.06, 1], metallicFactor: 0 } });
  const backingMesh = b.mesh([b.box([-0.4, -0.2, -0.02], [0.4, 0.2, 0.01], backing)], "fx-backing");
  const clipMesh = b.mesh([b.box([-0.02, -0.02, -0.02], [0.02, 0.02, 0.02], clip)], "fx-clip");
  const word =
    o.word?.primitive?.(b, face) ??
    b.quad({ ...WORD_QUAD, ...o.word?.quad }, face, o.word?.uvs ?? QUAD_UVS, o.word?.indices ?? QUAD_INDICES);
  const wordMesh = b.mesh([word], "fx-word");
  const tallyMesh = b.mesh(
    [b.quad({ centre: [0, 0, 0], size: [0.24, 0.08], facing: [0, 0, 1], up: [0, 1, 0] }, face)],
    "fx-tally",
  );
  b.root(b.node({ name: "fx-sign", children: [1, 2, 3] }));
  b.node({ name: "fx-backing", mesh: backingMesh, translation: [0, 0.2, 0], children: [4] });
  b.node({ name: "fx-clip", mesh: clipMesh, matrix: [0, 0, -0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 0, 0, 0, 0.36, -0.01, 1] });
  b.node({ name: "fx-word", mesh: wordMesh, ...WORD_NODE, ...o.wordNode });
  b.node({ name: "fx-tally", mesh: tallyMesh, translation: [0.2, -0.1, 0.02] });
  o.build?.(b);
  return b.pack(o);
}

// --------------------------------------------------------------------------------------------------------------------
// One variant per rule, and more: each breaks one rule of RX1 to RX10, and names the path its finding reads
// --------------------------------------------------------------------------------------------------------------------
export interface Variant {
  readonly id: string;
  readonly rule: string;
  /** The path one of its findings reads, by index (contracts/plain-model-fit.md §10). */
  readonly path: string;
  readonly input: FitInput;
  readonly bytes: Uint8Array;
}

const used = (g: Obj): unknown[] => list(g, "extensionsUsed");
const required = (g: Obj): unknown[] => list(g, "extensionsRequired");
const extensions = (o: Obj): Obj => {
  if (o.extensions === undefined) o.extensions = {};
  return obj(o.extensions);
};
const material = (g: Obj, index: number): Obj => item(g, "materials", index);
const pbr = (g: Obj, index: number): Obj => obj(material(g, index).pbrMetallicRoughness);
const xmp = (g: Obj): Obj => obj(extensions(g).KHR_xmp_json_ld);

/** Every variant, built fresh. The User Story 4 cases are among them: a live face missing or off its plane (RX8), a
 *  misplaced origin (RX7), a light (RX4), a camera or an animation (RX3), a name off the rule (RX6), a refused extension
 *  (RX4), and a missing or malformed mark (RX5). */
export function rxVariants(): Variant[] {
  const out: Variant[] = [];
  const add = (id: string, rule: string, path: string, data: Uint8Array, input: FitInput = DESK_INPUT): void => {
    out.push({ id, rule, path, input, bytes: data });
  };
  const onDesk = (id: string, rule: string, path: string, o: DeskOptions, input: FitInput = DESK_INPUT): void =>
    add(id, rule, path, desk(o).bytes, input);
  const onSign = (id: string, rule: string, path: string, o: SignOptions): void =>
    add(id, rule, path, sign(o).bytes, SIGN_INPUT);

  // RX1: the container.
  const clean = desk();
  const json = ascii(JSON.stringify(clean.gltf));
  const changed = (edit: (b: Uint8Array, view: DataView) => void): Uint8Array => {
    const b = clean.bytes.slice();
    edit(b, new DataView(b.buffer));
    return b;
  };
  add(
    "rx1-not-gltf",
    "RX1",
    "-",
    changed((b) => (b[3] = 0x78)),
  );
  add(
    "rx1-version-1",
    "RX1",
    "-",
    changed((_, v) => v.setUint32(4, 1, true)),
  );
  add("rx1-bytes-past-its-length", "RX1", "-", concat(clean.bytes, new Uint8Array(4)));
  add("rx1-length-past-the-file", "RX1", "-", clean.bytes.subarray(0, clean.bytes.length - 4));
  const unpadded = json.length % 4 ? json : concat(json, ascii(" "));
  add(
    "rx1-unpadded-chunk",
    "RX1",
    "-",
    packChunks([
      [JSON_CHUNK, unpadded],
      [BIN_CHUNK, clean.bin],
    ]),
  );
  const third = concat(clean.bytes, u32le(4), ascii("XTRA"), ascii("abcd"));
  new DataView(third.buffer).setUint32(8, third.length, true);
  add("rx1-a-third-chunk", "RX1", "-", third);
  add(
    "rx1-bin-first",
    "RX1",
    "-",
    packChunks([
      [BIN_CHUNK, clean.bin],
      [JSON_CHUNK, pad4(json, 0x20)],
    ]),
  );

  // RX2: the JSON.
  const text = JSON.stringify(clean.gltf);
  add("rx2-duplicate-key", "RX2", "-", packText(text.replace('"scene":0', '"scene":0,"scene":0'), clean.bin));
  add("rx2-nan", "RX2", "-", packText(text.replace('"scene":0', '"scene":NaN'), clean.bin));
  add(
    "rx2-float-for-an-integer",
    "RX2",
    "accessors[0].count",
    packText(text.replace(/"count":(\d+)/, '"count":$1.0'), clean.bin),
  );
  add("rx2-not-an-object", "RX2", "-", packText("[]", clean.bin));
  onDesk("rx2-outside-the-schema", "RX2", "nodes[1].description", {
    edit: (g) => (item(g, "nodes", 1).description = "x"),
  });
  onDesk("rx2-generator", "RX2", "asset.generator", { edit: (g) => (obj(g.asset).generator = "Exporter 4.2") });
  onDesk("rx2-version", "RX2", "asset.version", { edit: (g) => (obj(g.asset).version = "1.0") });
  onDesk("rx2-index", "RX2", "nodes[1].mesh", { edit: (g) => (item(g, "nodes", 1).mesh = 99) });
  onDesk("rx2-two-parents", "RX2", "nodes[1]", {
    edit: (g) => {
      list(g, "nodes").push({ name: "fx-extra", children: [1] });
      list(item(g, "scenes", 0), "nodes").push(7);
    },
  });
  onDesk("rx2-cycle", "RX2", "nodes[1]", { edit: (g) => (item(g, "nodes", 1).children = [0]) });
  onDesk("rx2-accessor-outside-its-view", "RX2", "accessors[0]", { edit: (g) => (item(g, "accessors", 0).count = 9) });
  onDesk("rx2-view-outside-the-buffer", "RX2", "bufferViews[0]", {
    edit: (g) => (item(g, "bufferViews", 0).byteOffset = 1_000_000),
  });
  onDesk("rx2-two-buffers", "RX2", "buffers", { edit: (g) => list(g, "buffers").push({ byteLength: 4 }) });
  onDesk("rx2-byte-length", "RX2", "buffers[0].byteLength", { edit: (g) => (item(g, "buffers", 0).byteLength = 4) });
  add(
    "rx2-bytes-no-view-covers",
    "RX2",
    "buffers[0]",
    glb({ extraBin: ascii("workflow: C:\\Users\\me") }),
    ARRIVAL_INPUT,
  );
  onDesk("rx2-mode", "RX2", "meshes[0].primitives[0].mode", { edit: (g) => (primitive(g, 0, 0).mode = 7) });
  onDesk("rx2-position-format", "RX2", "meshes[0].primitives[0].attributes.POSITION", {
    edit: (g) => (item(g, "accessors", 0).componentType = UNSIGNED_INT),
  });
  onDesk("rx2-index-past-the-vertices", "RX2", "meshes[0].primitives[0].indices", {
    build: (b) => (primitive(b.gltf, 0, 0).indices = b.indices([0, 1, 8])),
  });
  onDesk("rx2-matrix-and-trs", "RX2", "nodes[5]", { edit: (g) => (item(g, "nodes", 5).scale = [1, 1, 1]) });
  // A sparse substitution's indices or values before their view's start: read there, they'd be another view's bytes,
  // or bytes before the BIN chunk, and a throw.
  for (const [part, byteOffset] of [
    ["indices", -2],
    ["values", -1_000_000_000],
  ] as const) {
    const at = `accessors[${SPARSE_POINTS}].sparse.${part}`;
    const model = sparseDesk({
      edit: (g) => (obj(obj(item(g, "accessors", SPARSE_POINTS).sparse)[part]).byteOffset = byteOffset),
    });
    add(`rx2-sparse-${part}-before-their-view`, "RX2", `${at}.byteOffset`, model.bytes);
  }

  // RX3: anything that moves or isn't geometry.
  onDesk("rx3-camera", "RX3", "nodes[1].camera", {
    edit: (g) => {
      g.cameras = [{ type: "perspective", perspective: { yfov: 0.8, znear: 0.1 } }];
      item(g, "nodes", 1).camera = 0;
    },
  });
  onDesk("rx3-animation", "RX3", "animations", {
    build: (b) => {
      const input = b.values([0, 1], "SCALAR", FLOAT, { min: [0], max: [1] });
      const output = b.values([0, 0, 0, 0, 0.1, 0], "VEC3", FLOAT);
      b.gltf.animations = [
        { channels: [{ sampler: 0, target: { node: 6, path: "translation" } }], samplers: [{ input, output }] },
      ];
    },
  });
  onDesk("rx3-skin", "RX3", "nodes[1].skin", {
    edit: (g) => {
      g.skins = [{ joints: [6] }];
      item(g, "nodes", 1).skin = 0;
    },
  });
  onDesk("rx3-morph-target", "RX3", "meshes[2].primitives[0].targets", {
    edit: (g) => {
      const p = primitive(g, 2, 0);
      p.targets = [{ POSITION: obj(p.attributes).POSITION }];
      item(g, "meshes", 2).weights = [0];
    },
  });
  onDesk("rx3-target-names", "RX3", "meshes[2].extras", {
    edit: (g) => (item(g, "meshes", 2).extras = { targetNames: ["fx-open"] }),
  });
  onDesk("rx3-extras", "RX3", "nodes[0].extras", { edit: (g) => (item(g, "nodes", 0).extras = { note: "fx-note" }) });
  onDesk("rx3-uri", "RX3", "images[3].uri", {
    edit: (g) => list(g, "images").push({ uri: "fx-top.png", mimeType: "image/png" }),
  });

  // RX4: extensions.
  onDesk("rx4-light", "RX4", "nodes[0].extensions.KHR_lights_punctual", {
    edit: (g) => {
      used(g).push("KHR_lights_punctual");
      extensions(g).KHR_lights_punctual = { lights: [{ type: "point", intensity: 2 }] };
      extensions(item(g, "nodes", 0)).KHR_lights_punctual = { light: 0 };
    },
  });
  onDesk("rx4-draco", "RX4", "meshes[0].primitives[0].extensions.KHR_draco_mesh_compression", {
    edit: (g) => {
      used(g).push("KHR_draco_mesh_compression");
      required(g).push("KHR_draco_mesh_compression");
      extensions(primitive(g, 0, 0)).KHR_draco_mesh_compression = { bufferView: 0, attributes: { POSITION: 0 } };
    },
  });
  onDesk("rx4-meshopt", "RX4", "bufferViews[0].extensions.EXT_meshopt_compression", {
    edit: (g) => {
      used(g).push("EXT_meshopt_compression");
      extensions(item(g, "bufferViews", 0)).EXT_meshopt_compression = {
        buffer: 0,
        byteLength: 4,
        byteStride: 4,
        count: 1,
        mode: "ATTRIBUTES",
      };
    },
  });
  onDesk("rx4-gpu-instancing", "RX4", "nodes[1].extensions.EXT_mesh_gpu_instancing", {
    edit: (g) => {
      used(g).push("EXT_mesh_gpu_instancing");
      extensions(item(g, "nodes", 1)).EXT_mesh_gpu_instancing = { attributes: { TRANSLATION: 0 } };
    },
  });
  onDesk("rx4-basisu", "RX4", "textures[0].extensions.KHR_texture_basisu", {
    edit: (g) => {
      used(g).push("KHR_texture_basisu");
      extensions(item(g, "textures", 0)).KHR_texture_basisu = { source: 0 };
    },
  });
  for (const [name, body] of [
    ["KHR_materials_variants", { mappings: [] }],
    ["KHR_materials_transmission", { transmissionFactor: 1 }],
    ["KHR_materials_volume", { thicknessFactor: 0.1 }],
  ] as const) {
    onDesk(`rx4-${name}`, "RX4", `materials[0].extensions.${name}`, {
      edit: (g) => {
        used(g).push(name);
        extensions(material(g, 0))[name] = body;
      },
    });
  }
  onDesk(
    "rx4-not-in-extensions-used",
    "RX4",
    "materials[0].pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform",
    {
      edit: (g) => (extensions(obj(pbr(g, 0).baseColorTexture)).KHR_texture_transform = { scale: [2, 2] }),
    },
  );
  onDesk("rx4-misplaced", "RX4", "nodes[1].extensions.KHR_texture_transform", {
    edit: (g) => {
      used(g).push("KHR_texture_transform");
      extensions(item(g, "nodes", 1)).KHR_texture_transform = { scale: [2, 2] };
    },
  });
  onDesk("rx4-quantization-object", "RX4", "meshes[0].extensions.KHR_mesh_quantization", {
    edit: (g) => {
      used(g).push("KHR_mesh_quantization");
      extensions(item(g, "meshes", 0)).KHR_mesh_quantization = {};
    },
  });
  onDesk("rx4-required-not-used", "RX4", "extensionsRequired[1]", {
    edit: (g) => required(g).push("KHR_texture_transform"),
  });
  onDesk("rx4-unknown", "RX4", "extensionsUsed[2]", { edit: (g) => used(g).push("MSFT_lod") });

  // RX5: the mark.
  onDesk("rx5-not-scrubbed", "RX5", "extensions", { mark: false });
  onDesk("rx5-another-value", "RX5", "extensions.KHR_xmp_json_ld.packets[0]", { mark: "digitalCapture" });
  onDesk("rx5-the-packet-holds-more", "RX5", "extensions.KHR_xmp_json_ld.packets[0]", {
    edit: (g) => (obj(list(xmp(g), "packets")[0])["dc:creator"] = "fx-someone"),
  });
  onDesk("rx5-two-packets", "RX5", "extensions.KHR_xmp_json_ld", {
    edit: (g) => (xmp(g).packets = [markPacket(), markPacket()]),
  });
  onDesk("rx5-the-asset-reference", "RX5", "asset.extensions", {
    edit: (g) => (obj(g.asset).extensions = { KHR_xmp_json_ld: { packet: 1 } }),
  });
  onDesk("rx5-no-asset-reference", "RX5", "asset.extensions", { edit: (g) => delete obj(g.asset).extensions });
  onDesk("rx5-on-a-node", "RX5", "nodes[1].extensions", {
    edit: (g) => (extensions(item(g, "nodes", 1)).KHR_xmp_json_ld = { packet: 0 }),
  });
  onDesk("rx5-required", "RX5", "extensionsRequired[1]", { edit: (g) => required(g).push("KHR_xmp_json_ld") });
  onDesk("rx5-not-in-extensions-used", "RX5", "extensionsUsed", {
    edit: (g) => (g.extensionsUsed = used(g).filter((name) => name !== "KHR_xmp_json_ld")),
  });

  // RX6: names, by index, never the name.
  const named = (id: string, path: string, edit: (g: Obj) => void): void => onDesk(id, "RX6", path, { edit });
  named("rx6-blender-suffix", "nodes[1].name", (g) => (item(g, "nodes", 1).name = "fx-top.001"));
  named("rx6-capitals", "nodes[2].name", (g) => (item(g, "nodes", 2).name = "fx-Leg-1"));
  named("rx6-camera-stem", "nodes[3].name", (g) => (item(g, "nodes", 3).name = "IMG_1234"));
  named("rx6-path", "meshes[0].name", (g) => (item(g, "meshes", 0).name = "fx-textures/top"));
  named("rx6-file-name", "nodes[6].name", (g) => (item(g, "nodes", 6).name = "fx-drawer.png"));
  named("rx6-material", "materials[0].name", (g) => (material(g, 0).name = "fx-oak"));
  named("rx6-image", "images[1].name", (g) => (item(g, "images", 1).name = "PXL_20261012"));
  named("rx6-another-index", "textures[0].name", (g) => (item(g, "textures", 0).name = "texture-2"));
  named("rx6-sampler", "samplers[0].name", (g) => (item(g, "samplers", 0).name = "fx-linear"));
  named("rx6-accessor-path", "accessors[0].name", (g) => (item(g, "accessors", 0).name = "C:\\Users\\fx-me"));
  named("rx6-whatsapp-scene", "scenes[0].name", (g) => (item(g, "scenes", 0).name = "IMG-20261012-WA0003"));

  // RX7: the bounds.
  onDesk("rx7-misplaced-origin", "RX7", "-", { edit: (g) => (item(g, "nodes", 0).translation = [0.05, 0, 0]) });
  onDesk("rx7-off-scale", "RX7", "-", { edit: (g) => (item(g, "nodes", 0).scale = [1.1, 1.1, 1.1]) });
  onDesk("rx7-an-empty-scene", "RX7", "-", { edit: (g) => (item(g, "scenes", 0).nodes = []) });

  // RX8: the live faces, on the sign.
  const word = SIGN.nodes.word;
  const wordPrimitive = `meshes[${SIGN.meshes.word}].primitives`;
  onSign("rx8-missing", "RX8", "nodes", { edit: (g) => (item(g, "nodes", SIGN.nodes.tally).name = "fx-tally-panel") });
  onSign("rx8-two-nodes", "RX8", "nodes[5]", {
    build: (b) => {
      const copy = b.mesh([b.quad(WORD_QUAD, SIGN.materials.face)], "fx-word-copy");
      list(item(b.gltf, "nodes", 0), "children").push(b.node({ name: "fx-word", mesh: copy, ...WORD_NODE }));
    },
  });
  onSign("rx8-no-mesh", "RX8", `nodes[${SIGN.nodes.tally}]`, {
    edit: (g) => delete item(g, "nodes", SIGN.nodes.tally).mesh,
  });
  onSign("rx8-children", "RX8", `nodes[${word}].children`, {
    build: (b) => (item(b.gltf, "nodes", word).children = [b.node({ name: "fx-pin" })]),
  });
  onSign("rx8-shared-mesh", "RX8", `nodes[${word}].mesh`, {
    build: (b) =>
      list(item(b.gltf, "nodes", 0), "children").push(
        b.node({ name: "fx-copy", mesh: SIGN.meshes.word, ...WORD_NODE }),
      ),
  });
  onSign("rx8-two-primitives", "RX8", wordPrimitive, {
    build: (b) =>
      list(item(b.gltf, "meshes", SIGN.meshes.word), "primitives").push(b.quad(WORD_QUAD, SIGN.materials.face)),
  });
  onSign("rx8-a-triangle", "RX8", `${wordPrimitive}[0]`, {
    word: {
      primitive: (b, m) => ({
        attributes: {
          POSITION: b.positions(corners(WORD_QUAD).slice(0, 3)),
          TEXCOORD_0: b.texcoords(QUAD_UVS.slice(0, 3)),
        },
        indices: b.indices([0, 2, 1]),
        material: m,
      }),
    },
  });
  onSign("rx8-texture-coordinate-off-a-corner", "RX8", `${wordPrimitive}[0].attributes.TEXCOORD_0`, {
    word: {
      uvs: [
        [0, 0],
        [0.5, 0],
        [0, 1],
        [1, 1],
      ],
    },
  });
  onSign("rx8-no-texture-coordinates", "RX8", `${wordPrimitive}[0].attributes`, {
    edit: (g) => delete obj(primitive(g, SIGN.meshes.word, 0).attributes).TEXCOORD_0,
  });
  onSign("rx8-a-texture", "RX8", `materials[${SIGN.materials.face}]`, {
    edit: (g) => (pbr(g, SIGN.materials.face).baseColorTexture = { index: 0 }),
  });
  onSign("rx8-vertex-colours", "RX8", `${wordPrimitive}[0].attributes.COLOR_0`, {
    build: (b) =>
      (obj(primitive(b.gltf, SIGN.meshes.word, 0).attributes).COLOR_0 = b.values(
        new Array<number>(16).fill(1),
        "VEC4",
        FLOAT,
      )),
  });
  onSign("rx8-centre-off", "RX8", `nodes[${word}]`, { wordNode: { translation: [0.003, 0.26, 0.02] } });
  onSign("rx8-size-off", "RX8", `nodes[${word}]`, { word: { quad: { size: [0.602, 0.16] } } });
  onSign("rx8-facing-off", "RX8", `nodes[${word}]`, { wordNode: { rotation: aboutX(92) } });
  onSign("rx8-wound-backwards", "RX8", `nodes[${word}]`, { word: { indices: [0, 1, 2, 1, 3, 2] } });
  onSign("rx8-turned-in-its-plane", "RX8", `nodes[${word}]`, {
    word: {
      uvs: [
        [0, 1],
        [0, 0],
        [1, 1],
        [1, 0],
      ],
    },
  });
  onSign("rx8-outside-the-default-scene", "RX8", `nodes[${SIGN.nodes.tally}]`, {
    edit: (g) => delete item(g, "nodes", SIGN.nodes.backing).children,
  });

  // RX9: the textures (the desk's PNG is images[0], its JPEG images[1], its WebP images[2]).
  const top = (id: string, path: string, image: Uint8Array, input: FitInput = DESK_INPUT): void =>
    onDesk(id, "RX9", path, { top: image }, input);
  top("rx9-png-16-bit", "images[0]", png({ width: 8, height: 8, bitDepth: 16 }));
  top("rx9-png-palette", "images[0]", png({ width: 8, height: 8, colorType: 3, fill: 0 }));
  top("rx9-png-grey", "images[0]", png({ width: 8, height: 8, colorType: 0 }));
  top("rx9-png-unreadable", "images[0]", concat(PNG_SIGNATURE, ascii("fx-no header")));
  top("rx9-not-a-power-of-two", "images[0]", png({ width: 6, height: 4 }));
  top("rx9-over-the-small-props-limit", "images[0]", png({ width: 2048, height: 2048, fill: 0, level: 1 }), {
    ...DESK_INPUT,
    smallPropTexturePx: 1024,
  });
  top("rx9-not-an-image", "images[0]", ascii("fx-not an image at all"));
  const legs = (id: string, image: Uint8Array): void => onDesk(id, "RX9", "images[1]", { legs: image });
  legs("rx9-jpeg-arithmetic", jpeg({ width: 16, height: 8, sof: 0xc9 }));
  legs("rx9-jpeg-lossless", jpeg({ width: 16, height: 8, sof: 0xc3 }));
  legs("rx9-jpeg-grey", jpeg({ width: 16, height: 8, components: 1 }));
  legs("rx9-jpeg-12-bit", jpeg({ width: 16, height: 8, precision: 12 }));
  onDesk("rx9-webp-animated", "RX9", "images[2]", { drawer: webp({ animated: true }) });
  onDesk("rx9-mime-type-its-bytes-dont-match", "RX9", "images[0].mimeType", {
    edit: (g) => (item(g, "images", 0).mimeType = "image/jpeg"),
  });
  onDesk("rx9-another-mime-type", "RX9", "images[0].mimeType", {
    edit: (g) => (item(g, "images", 0).mimeType = "image/gif"),
  });
  onDesk("rx9-no-mime-type", "RX9", "images[0]", { edit: (g) => delete item(g, "images", 0).mimeType });

  // RX10: baked light in a material.
  onDesk("rx10-emissive-factor", "RX10", "materials[0].emissiveFactor", {
    edit: (g) => (material(g, 0).emissiveFactor = [1, 0.5, 0]),
  });
  onDesk("rx10-emissive-texture", "RX10", "materials[0].emissiveTexture", {
    edit: (g) => (material(g, 0).emissiveTexture = { index: 0 }),
  });
  onDesk("rx10-emissive-strength", "RX10", "materials[0].extensions.KHR_materials_emissive_strength", {
    edit: (g) => {
      used(g).push("KHR_materials_emissive_strength");
      extensions(material(g, 0)).KHR_materials_emissive_strength = { emissiveStrength: 4 };
    },
  });
  onDesk("rx10-occlusion-texture", "RX10", "materials[0].occlusionTexture", {
    edit: (g) => (material(g, 0).occlusionTexture = { index: 0 }),
  });
  return out;
}

// --------------------------------------------------------------------------------------------------------------------
// The room's avatars (spec 009, T010 to T012): a skinned model with ADR 0010's Mixamo-named skeleton, and clips
// --------------------------------------------------------------------------------------------------------------------
/** One bone of the avatar fixtures' skeleton: its raw glTF name, its parent's index in this list (−1 for the root
 *  bone), and its rest translation from its parent, in metres. */
export interface AvatarBone {
  readonly name: string;
  readonly parent: number;
  readonly at: Vec3;
}

/** The skeleton every avatar fixture shares: standing on the floor at the origin, facing +z, so its right hand is on its
 *  −x side, ADR 0010's `mixamorig:` names, each with a colon, which three's loader sanitizes away. */
export const AVATAR_BONES: readonly AvatarBone[] = [
  { name: "mixamorig:Hips", parent: -1, at: [0, 0.9, 0] },
  { name: "mixamorig:Spine", parent: 0, at: [0, 0.15, 0] },
  { name: "mixamorig:Head", parent: 1, at: [0, 0.5, 0] },
  { name: "mixamorig:RightArm", parent: 1, at: [-0.18, 0.35, 0] },
  { name: "mixamorig:RightHand", parent: 3, at: [-0.05, -0.55, 0] },
  { name: "mixamorig:LeftArm", parent: 1, at: [0.18, 0.35, 0] },
  { name: "mixamorig:LeftHand", parent: 5, at: [0.05, -0.55, 0] },
  { name: "mixamorig:RightUpLeg", parent: 0, at: [-0.1, -0.05, 0] },
  { name: "mixamorig:LeftUpLeg", parent: 0, at: [0.1, -0.05, 0] },
];
/** The bones a fixture without hands leaves out, the dog's and the dinosaur's case. */
const HAND_BONES = new Set(["mixamorig:RightHand", "mixamorig:LeftHand"]);
/** Each hand's index finger, its first two joints by their Mixamo names, which `fingers` appends to AVATAR_BONES (so
 *  their parents' indices continue its list): the holding hand's cases where a hand's fingers alone move (spec 009's
 *  FR-018, as the Author amended it on 2026-11-09). */
export const FINGER_BONES: readonly AvatarBone[] = [
  { name: "mixamorig:RightHandIndex1", parent: 4, at: [-0.01, -0.08, 0.02] },
  { name: "mixamorig:RightHandIndex2", parent: 9, at: [0, -0.04, 0] },
  { name: "mixamorig:LeftHandIndex1", parent: 6, at: [0.01, -0.08, 0.02] },
  { name: "mixamorig:LeftHandIndex2", parent: 11, at: [0, -0.04, 0] },
];

/** A bone's rest position in the model's frame, in metres: the sum of its own and its ancestors' translations. */
export function boneRest(bones: readonly AvatarBone[], index: number): Vec3 {
  let at: [number, number, number] = [0, 0, 0];
  for (let i = index; i >= 0; i = bones[i]?.parent ?? -1) {
    const b = bones[i];
    if (!b) break;
    at = [at[0] + b.at[0], at[1] + b.at[1], at[2] + b.at[2]];
  }
  return at;
}

export interface AvatarGlbOptions extends PackOptions {
  /** The body's height from the floor, in metres: 1.6 by default. */
  readonly height?: number;
  /** File units a metre: 1, or 100 for a model exported in centimetres. */
  readonly unit?: number;
  /** Whether the skeleton has its two hand bones: true by default. */
  readonly hands?: boolean;
  /** Whether each hand has its index finger's two joints (FINGER_BONES): false by default, and only with the hands. */
  readonly fingers?: boolean;
  /** Images the body's material uses, each embedded: the decode cap's and the ledger's cases. */
  readonly images?: readonly Uint8Array[];
}

/** The avatar's bones as the options give them. */
function avatarBones(o: { readonly hands?: boolean; readonly fingers?: boolean }): AvatarBone[] {
  if (o.hands !== false) return o.fingers === true ? [...AVATAR_BONES, ...FINGER_BONES] : [...AVATAR_BONES];
  // Without the hands, every index after a dropped bone moves down; no bone below has a hand as its parent.
  const kept = AVATAR_BONES.filter((b) => !HAND_BONES.has(b.name));
  return kept.map((b) => {
    const parent = b.parent < 0 ? -1 : kept.indexOf(AVATAR_BONES[b.parent] as AvatarBone);
    return { ...b, parent };
  });
}

/**
 * A skinned avatar: the root node `fx-avatar`, holding the skeleton (its first bone the hips) and the body, a box from
 * the floor to `height`, 0.5 m wide and 0.24 m deep, every vertex bound to the hips with weight 1, so the box in its
 * rest pose is exactly its bounds. The skin's inverse bind matrices are each bone's rest transform undone.
 */
export function avatarGlb(o: AvatarGlbOptions = {}): Model {
  const unit = o.unit ?? 1;
  const height = o.height ?? 1.6;
  const bones = avatarBones(o);
  const b = new ModelBuilder();
  const scaled = (v: Vec3): Vec3 => [v[0] * unit, v[1] * unit, v[2] * unit];
  const images = o.images ?? [];
  const material =
    images.length === 0
      ? b.material({ pbrMetallicRoughness: { baseColorFactor: [0.7, 0.5, 0.4, 1], metallicFactor: 0 } })
      : (() => {
          const textures = images.map((data) => b.texture(b.image(data, "image/png")));
          const def: Obj = { pbrMetallicRoughness: { baseColorTexture: { index: textures[0] }, metallicFactor: 0 } };
          if (textures[1] !== undefined) def.normalTexture = { index: textures[1] };
          if (textures[2] !== undefined)
            (def.pbrMetallicRoughness as Obj).metallicRoughnessTexture = { index: textures[2] };
          return b.material(def);
        })();
  const corners = Array.from({ length: 8 }, (_, i): Vec3 =>
    scaled([i & 1 ? 0.25 : -0.25, i & 2 ? height : 0, i & 4 ? 0.12 : -0.12]),
  );
  const uvs = corners.map((_, i): Uv => [i & 1 ? 1 : 0, i & 2 ? 1 : 0]);
  const prim: Obj = {
    attributes: {
      POSITION: b.positions(corners),
      TEXCOORD_0: b.texcoords(uvs),
      JOINTS_0: b.values(new Array<number>(8 * 4).fill(0), "VEC4", UNSIGNED_BYTE),
      WEIGHTS_0: b.values(
        Array.from({ length: 8 * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
        "VEC4",
        FLOAT,
      ),
    },
    indices: b.indices(BOX_INDICES),
    material,
  };
  const mesh = b.mesh([prim], "fx-body");
  // Node 0 the root; 1 to n the bones; n + 1 the body.
  const root = b.node({ name: "fx-avatar", children: [1, bones.length + 1] });
  b.root(root);
  bones.forEach((bone, i) => {
    const children = bones.flatMap((c, k) => (c.parent === i ? [k + 1] : []));
    b.node({ name: bone.name, translation: scaled(bone.at), ...(children.length > 0 ? { children } : {}) });
  });
  const inverse = bones.flatMap((_, i) => {
    const [x, y, z] = scaled(boneRest(bones, i));
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1];
  });
  const ibm = b.values(inverse, "MAT4", FLOAT);
  list(b.gltf, "skins").push({ joints: bones.map((_, i) => i + 1), skeleton: 1, inverseBindMatrices: ibm });
  b.node({ name: "fx-body", mesh, skin: 0 });
  return b.pack(o);
}

/** One channel of a clip fixture: the bone it moves, by its raw name, the property, and its value at 0 s and 1 s. */
export interface ClipTrack {
  readonly bone: string;
  readonly path: "translation" | "rotation";
  /** Two keyframes' values, each [x, y, z] for a translation (in metres) or [x, y, z, w] for a rotation. */
  readonly values: readonly (readonly number[])[];
}

export interface ClipGlbOptions extends PackOptions {
  /** The animation's channels; none leaves the file with no animation. */
  readonly tracks?: readonly ClipTrack[];
  /** File units a metre, as the model's. */
  readonly unit?: number;
  /** The clip's length in seconds: 1 by default. */
  readonly duration?: number;
}

/** A clip as the studio exports one: the skeleton's nodes alone, no mesh, and one animation named `name` moving
 *  `tracks`; a track's bone the skeleton lacks becomes a node of its own under the root, so the clip names it. */
export function clipGlb(name: string, o: ClipGlbOptions = {}): Model {
  const unit = o.unit ?? 1;
  const duration = o.duration ?? 1;
  const tracks = o.tracks ?? [];
  const bones = [...AVATAR_BONES];
  for (const t of tracks)
    if (!bones.some((bone) => bone.name === t.bone)) bones.push({ name: t.bone, parent: -1, at: [0, 0, 0] });
  const b = new ModelBuilder();
  const tops = bones.flatMap((bone, k) => (bone.parent < 0 ? [k + 1] : []));
  b.root(b.node({ name: "fx-avatar", children: tops }));
  bones.forEach((bone, i) => {
    const children = bones.flatMap((c, k) => (c.parent === i ? [k + 1] : []));
    b.node({
      name: bone.name,
      translation: bone.at.map((v) => v * unit),
      ...(children.length > 0 ? { children } : {}),
    });
  });
  if (tracks.length > 0) {
    const input = b.values([0, duration], "SCALAR", FLOAT, { min: [0], max: [duration] });
    const samplers: Obj[] = [];
    const channels: Obj[] = [];
    tracks.forEach((t, k) => {
      const values = t.values.flatMap((v) => (t.path === "translation" ? v.map((x) => x * unit) : [...v]));
      const output = b.values(values, t.path === "translation" ? "VEC3" : "VEC4", FLOAT);
      samplers.push({ input, output, interpolation: "LINEAR" });
      channels.push({
        sampler: k,
        target: { node: bones.findIndex((bone) => bone.name === t.bone) + 1, path: t.path },
      });
    });
    list(b.gltf, "animations").push({ name, channels, samplers });
  }
  return b.pack(o);
}

/** A bone's rest translation, as a clip's keyframe. */
const restOf = (bone: string): number[] => [...(AVATAR_BONES.find((b) => b.name === bone)?.at ?? [0, 0, 0])];

/** The idle fixture: the hips rise by 1 cm and settle, so the idle's first frame is the rest pose. */
export const IDLE_TRACKS: readonly ClipTrack[] = [
  { bone: "mixamorig:Hips", path: "translation", values: [restOf("mixamorig:Hips"), [0, 0.91, 0]] },
];

/** "idle-holding": the holding hand raised and brought forward to hold a sheet, from the first frame on, the right
 *  hand by default. */
export function holdingTracks(hand: "right" | "left" = "right"): ClipTrack[] {
  const bone = hand === "right" ? "mixamorig:RightHand" : "mixamorig:LeftHand";
  const x = hand === "right" ? -0.02 : 0.02;
  return [
    {
      bone,
      path: "translation",
      values: [
        [x, -0.3, 0.22],
        [x, -0.29, 0.22],
      ],
    },
  ];
}

/** "idle-holding" closing one hand's index finger on the sheet, the hand bone itself still, as the studio's woman and
 *  man close their left hands' fingers: each of FINGER_BONES's two joints on that hand turned 60° about x, from the
 *  first frame on. The model needs `fingers`. */
export function fingerTracks(hand: "right" | "left"): ClipTrack[] {
  const side = hand === "right" ? "Right" : "Left";
  const curl = [0.5, 0, 0, 0.8660254];
  return [1, 2].map((joint) => ({
    bone: `mixamorig:${side}HandIndex${joint}`,
    path: "rotation" as const,
    values: [curl, curl],
  }));
}

/** "take": the right arm turns forward and back about x over the clip. */
export const TAKE_TRACKS: readonly ClipTrack[] = [
  {
    bone: "mixamorig:RightArm",
    path: "rotation",
    values: [
      [0, 0, 0, 1],
      [-0.3826834, 0, 0, 0.9238795],
    ],
  },
];

/** The avatar's three clips by role, as the studio delivered the woman's and the man's (spec 009, Readings). */
export function avatarClips(o: Omit<ClipGlbOptions, "tracks"> = {}): Record<"idle" | "idle-holding" | "take", Model> {
  return {
    idle: clipGlb("idle", { ...o, tracks: IDLE_TRACKS }),
    "idle-holding": clipGlb("idle-holding", { ...o, tracks: holdingTracks() }),
    take: clipGlb("take", { ...o, tracks: TAKE_TRACKS, duration: 1.5 }),
  };
}
