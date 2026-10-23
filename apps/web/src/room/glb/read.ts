// The GLB reader (spec 004 FR-015, FR-019, FR-068; research.md R-23; contracts/plain-model-fit.md §4): pure TypeScript
// over a Uint8Array, with no Node or DOM API and no three.js, so the compositor (build/room/, in Node) and the lookdev
// page (in a browser) read a model with the same code. A strict port of the arrival check's parser, `parse_glb` and
// `GltfCheck` in tools/gates/arrival_check.py (carried by the Author's patch
// docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.patch on feat/003-us1-arrival-check; read, never applied),
// which stays the authority. It reads in stages, and a stage with a finding stops the rest:
// 1. the container (RX1): the 12-byte header, then one JSON chunk and at most one BIN chunk, each 4-byte padded;
// 2. the JSON (RX2): strict JSON (json.ts), then M4's walk over the glTF 2.0 schema, ported, with the schema's required
//    properties, noting what the fit check's other rules read (names, extension objects, extras, and uris);
// 3. the structure (RX2): every index naming an element; the node tree a forest; the buffer, its views, and the BIN
//    chunk's bytes as parse_glb checks them; every accessor inside its view, aligned, and of a type its use takes;
// 4. the values (RX2): sparse indices climbing within their accessor, attribute values finite, and every vertex index
//    within its primitive.
// Only after stage 3 does it decode an accessor, so it never reads outside the file. The file it returns (`Glb`) gives
// the default scene's nodes with their transforms, from TRS or a matrix, and each accessor's values: every component
// type, normalized or not, through byteStride and sparse substitutions, KHR_mesh_quantization's integers included.
import { isIntegerAt, isObject, strictJson } from "./json";
import type { Json, JsonObject } from "./json";
import { printableKey } from "./names";
import { MATERIALS, REASON, XMP } from "./rules";
import type { RxRule } from "./rules";

/** A finding before its file is known: the rule, the JSON path by index, and the reason. */
export interface Problem {
  readonly rule: RxRule;
  readonly path: string;
  readonly reason: string;
}

// --------------------------------------------------------------------------------------------------------------------
// The validated glTF: what the walk and the structural checks guarantee
// --------------------------------------------------------------------------------------------------------------------
export type Mat4 = readonly number[];
export type Vec3 = readonly [number, number, number];

export interface TextureRef {
  readonly index: number;
  readonly texCoord?: number;
}
export interface GNode {
  readonly children?: readonly number[];
  readonly mesh?: number;
  readonly camera?: number;
  readonly skin?: number;
  readonly matrix?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly weights?: readonly number[];
  readonly name?: string;
}
export interface GPrimitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly material?: number;
  readonly mode?: number;
  readonly targets?: readonly Readonly<Record<string, number>>[];
}
export interface GMesh {
  readonly primitives: readonly GPrimitive[];
  readonly weights?: readonly number[];
}
export interface GAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly normalized?: boolean;
  readonly count: number;
  readonly type: string;
  readonly sparse?: {
    readonly count: number;
    readonly indices: { readonly bufferView: number; readonly byteOffset?: number; readonly componentType: number };
    readonly values: { readonly bufferView: number; readonly byteOffset?: number };
  };
}
export interface GBufferView {
  readonly buffer: number;
  readonly byteOffset?: number;
  readonly byteLength: number;
  readonly byteStride?: number;
}
export interface GMaterial {
  readonly pbrMetallicRoughness?: {
    readonly baseColorTexture?: TextureRef;
    readonly metallicRoughnessTexture?: TextureRef;
  };
  readonly normalTexture?: TextureRef;
  readonly occlusionTexture?: TextureRef;
  readonly emissiveTexture?: TextureRef;
  readonly emissiveFactor?: readonly number[];
  readonly extensions?: JsonObject;
}
export interface Gltf {
  readonly asset: JsonObject;
  readonly scene?: number;
  readonly scenes?: readonly { readonly nodes?: readonly number[] }[];
  readonly nodes?: readonly GNode[];
  readonly meshes?: readonly GMesh[];
  readonly accessors?: readonly GAccessor[];
  readonly bufferViews?: readonly GBufferView[];
  readonly buffers?: readonly { readonly byteLength: number; readonly uri?: string }[];
  readonly images?: readonly { readonly bufferView?: number; readonly mimeType?: string; readonly uri?: string }[];
  readonly textures?: readonly { readonly source?: number; readonly sampler?: number }[];
  readonly samplers?: readonly JsonObject[];
  readonly materials?: readonly GMaterial[];
  readonly cameras?: readonly JsonObject[];
  readonly skins?: readonly {
    readonly joints: readonly number[];
    readonly skeleton?: number;
    readonly inverseBindMatrices?: number;
  }[];
  readonly animations?: readonly {
    readonly channels: readonly { readonly sampler: number; readonly target: { readonly node?: number } }[];
    readonly samplers: readonly { readonly input: number; readonly output: number }[];
  }[];
  readonly extensionsUsed?: readonly string[];
  readonly extensionsRequired?: readonly string[];
  readonly extensions?: JsonObject;
}

/** What the walk noted for the fit check's other rules. */
export interface Notes {
  /** Every `name`, with the kind and the index of the element that holds it. */
  readonly names: { readonly path: string; readonly kind: string; readonly index: number; readonly value: string }[];
  /** Every extension object: the path of the `extensions` that holds it, the kind of its host, and its name. */
  readonly extensions: { readonly at: string; readonly host: string; readonly name: string; readonly body: Json }[];
  /** The path of every `extras`. */
  readonly extras: string[];
  /** The path of every `uri`. */
  readonly uris: string[];
  /** Indices inside extension objects: an `EXT_texture_webp` source, a `KHR_materials_*` texture. */
  readonly refs: {
    readonly path: string;
    readonly value: Json | undefined;
    readonly integer: boolean;
    readonly of: "images" | "textures";
  }[];
}

// --------------------------------------------------------------------------------------------------------------------
// Stage 1: the container
// --------------------------------------------------------------------------------------------------------------------
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

interface Container {
  readonly json: Uint8Array;
  readonly bin: Uint8Array;
  /** Where the BIN chunk's data starts in the file. */
  readonly binAt: number;
}

function container(bytes: Uint8Array, out: Problem[]): Container | null {
  const bad = (reason: string): null => {
    out.push({ rule: "RX1", path: "-", reason });
    return null;
  };
  if (bytes.length < 20 || bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46) {
    return bad(REASON.header);
  }
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = data.getUint32(4, true);
  if (version !== 2) return bad(REASON.version(version));
  const total = data.getUint32(8, true);
  if (total > bytes.length) return bad(REASON.lengthPast(total, bytes.length));
  if (total < bytes.length) bad(REASON.lengthShort(total, bytes.length));
  const chunks: { kind: number; at: number; data: Uint8Array }[] = [];
  let pos = 12;
  while (pos + 8 <= total) {
    const length = data.getUint32(pos, true);
    const kind = data.getUint32(pos + 4, true);
    if (pos + 8 + length > total || length % 4) return bad(REASON.padding(pos));
    chunks.push({ kind, at: pos + 8, data: bytes.subarray(pos + 8, pos + 8 + length) });
    pos += 8 + length;
  }
  if (pos !== total) bad(REASON.unaccounted(total - pos));
  const [first, second, ...rest] = chunks;
  if (
    first === undefined ||
    first.kind !== JSON_CHUNK ||
    (second !== undefined && second.kind !== BIN_CHUNK) ||
    rest.length
  ) {
    return bad(REASON.chunks);
  }
  if (out.length) return null;
  return { json: first.data, bin: second?.data ?? new Uint8Array(), binAt: second?.at ?? 0 };
}

// --------------------------------------------------------------------------------------------------------------------
// Stage 2: the schema (M4's walk, ported)
// --------------------------------------------------------------------------------------------------------------------
type Spec = string | readonly [string];

/** glTF 2.0's properties by object, as the arrival check's SCHEMA gives them, but `image.mimeType`, whose value RX9
 *  judges. `extras` and `extensions` are read on every object. */
const SCHEMA: Readonly<Record<string, Readonly<Record<string, Spec>>>> = {
  root: {
    extensionsUsed: "strs",
    extensionsRequired: "strs",
    accessors: ["accessor"],
    animations: ["animation"],
    asset: "asset",
    buffers: ["buffer"],
    bufferViews: ["bufferView"],
    cameras: ["camera"],
    images: ["image"],
    materials: ["material"],
    meshes: ["mesh"],
    nodes: ["node"],
    samplers: ["sampler"],
    scene: "int",
    scenes: ["scene"],
    skins: ["skin"],
    textures: ["texture"],
  },
  accessor: {
    bufferView: "int",
    byteOffset: "int",
    componentType: "int",
    normalized: "bool",
    count: "int",
    type: "enum:type",
    max: "nums",
    min: "nums",
    sparse: "sparse",
    name: "name",
  },
  sparse: { count: "int", indices: "sparseIndices", values: "sparseValues" },
  sparseIndices: { bufferView: "int", byteOffset: "int", componentType: "int" },
  sparseValues: { bufferView: "int", byteOffset: "int" },
  animation: { channels: ["channel"], samplers: ["animationSampler"], name: "name" },
  channel: { sampler: "int", target: "target" },
  target: { node: "int", path: "enum:path" },
  animationSampler: { input: "int", interpolation: "enum:interpolation", output: "int" },
  asset: { copyright: "copyright", version: "version" },
  buffer: { uri: "uri", byteLength: "int", name: "name" },
  bufferView: { buffer: "int", byteOffset: "int", byteLength: "int", byteStride: "int", target: "int", name: "name" },
  camera: { orthographic: "orthographic", perspective: "perspective", type: "enum:cameraType", name: "name" },
  orthographic: { xmag: "num", ymag: "num", zfar: "num", znear: "num" },
  perspective: { aspectRatio: "num", yfov: "num", zfar: "num", znear: "num" },
  image: { uri: "uri", mimeType: "string", bufferView: "int", name: "name" },
  material: {
    name: "name",
    pbrMetallicRoughness: "pbr",
    normalTexture: "normalTextureInfo",
    occlusionTexture: "occlusionTextureInfo",
    emissiveTexture: "textureInfo",
    emissiveFactor: "nums",
    alphaMode: "enum:alphaMode",
    alphaCutoff: "num",
    doubleSided: "bool",
  },
  pbr: {
    baseColorFactor: "nums",
    baseColorTexture: "textureInfo",
    metallicFactor: "num",
    roughnessFactor: "num",
    metallicRoughnessTexture: "textureInfo",
  },
  textureInfo: { index: "int", texCoord: "int" },
  normalTextureInfo: { index: "int", texCoord: "int", scale: "num" },
  occlusionTextureInfo: { index: "int", texCoord: "int", strength: "num" },
  mesh: { primitives: ["primitive"], weights: "nums", name: "name" },
  primitive: { attributes: "attributes", indices: "int", material: "int", mode: "int", targets: "targets" },
  node: {
    camera: "int",
    children: "ints",
    skin: "int",
    matrix: "nums",
    mesh: "int",
    rotation: "nums",
    scale: "nums",
    translation: "nums",
    weights: "nums",
    name: "name",
  },
  sampler: { magFilter: "int", minFilter: "int", wrapS: "int", wrapT: "int", name: "name" },
  scene: { nodes: "ints", name: "name" },
  skin: { inverseBindMatrices: "int", skeleton: "int", joints: "ints", name: "name" },
  texture: { sampler: "int", source: "int", name: "name" },
};

/** The glTF 2.0 schema's required properties, which the arrival check's walk leaves to `.get()` defaults. */
const REQUIRED: Readonly<Record<string, readonly string[]>> = {
  root: ["asset"],
  accessor: ["componentType", "count", "type"],
  sparse: ["count", "indices", "values"],
  sparseIndices: ["bufferView", "componentType"],
  sparseValues: ["bufferView"],
  animation: ["channels", "samplers"],
  channel: ["sampler", "target"],
  target: ["path"],
  animationSampler: ["input", "output"],
  asset: ["version"],
  buffer: ["byteLength"],
  bufferView: ["buffer", "byteLength"],
  camera: ["type"],
  orthographic: ["xmag", "ymag", "zfar", "znear"],
  perspective: ["yfov", "znear"],
  mesh: ["primitives"],
  primitive: ["attributes"],
  skin: ["joints"],
  textureInfo: ["index"],
  normalTextureInfo: ["index"],
  occlusionTextureInfo: ["index"],
};

const ENUMS: Readonly<Record<string, readonly string[]>> = {
  type: ["SCALAR", "VEC2", "VEC3", "VEC4", "MAT2", "MAT3", "MAT4"],
  path: ["translation", "rotation", "scale", "weights"],
  interpolation: ["LINEAR", "STEP", "CUBICSPLINE"],
  cameraType: ["perspective", "orthographic"],
  alphaMode: ["OPAQUE", "MASK", "BLEND"],
};

const ATTRIBUTE = /^(?:POSITION|NORMAL|TANGENT|(?:TEXCOORD|COLOR|JOINTS|WEIGHTS)_[0-9]+)$/;
const TEXTURE_TRANSFORM: Readonly<Record<string, Spec>> = {
  offset: "nums",
  rotation: "num",
  scale: "nums",
  texCoord: "int",
};
const TEXTURE_WEBP: Readonly<Record<string, Spec>> = { source: "int" };
/** The element kinds whose `name` RX6 holds to a rule or to a neutral ID; every other name is M8's alone. */
const NAMED_KINDS = new Set(["node", "mesh", "material", "image", "texture", "sampler"]);

const has = (o: object, key: string): boolean => Object.hasOwn(o, key);
const join = (where: string, key: string): string => (where === "" ? key : `${where}.${key}`);

class Walker {
  readonly problems: Problem[] = [];
  readonly notes: Notes = { names: [], extensions: [], extras: [], uris: [], refs: [] };

  private bad(path: string, reason: string): void {
    this.problems.push({ rule: "RX2", path: path === "" ? "-" : path, reason });
  }

  /** `GltfCheck.walk`: an object of `kind` at `where`, the element `index` of its array. */
  walk(value: Json | undefined, kind: string, where: string, index: number): void {
    if (!isObject(value)) {
      this.bad(where, REASON.object);
      return;
    }
    const allowed = SCHEMA[kind] ?? {};
    for (const key of REQUIRED[kind] ?? []) if (!has(value, key)) this.bad(join(where, key), REASON.required);
    for (const key of Object.keys(value)) {
      const here = join(where, key);
      const spec = has(allowed, key) ? allowed[key] : undefined;
      if (key === "extras") this.notes.extras.push(here);
      else if (key === "extensions") this.extensions(value[key], kind, here);
      else if (spec !== undefined) this.value(value, key, spec, here, kind, index);
      else if (!printableKey(key)) this.bad(where, REASON.outsideUnprinted);
      else this.bad(here, kind === "asset" ? REASON.outsideAsset : REASON.outside);
    }
  }

  /** `GltfCheck.value`: `container[key]` against its spec. */
  private value(
    container: JsonObject | Json[],
    key: string | number,
    spec: Spec,
    here: string,
    kind: string,
    index: number,
  ): void {
    const item: Json | undefined = (container as Record<string, Json | undefined>)[String(key)];
    if (typeof spec !== "string") {
      if (!Array.isArray(item)) this.bad(here, REASON.array);
      else item.forEach((element, i) => this.walk(element, spec[0], `${here}[${i}]`, i));
      return;
    }
    if (has(SCHEMA, spec)) {
      this.walk(item, spec, here, index);
      return;
    }
    const all = (test: (x: Json, i: number) => boolean): boolean => Array.isArray(item) && item.every(test);
    switch (spec) {
      case "int":
        if (!isIntegerAt(container, key)) this.bad(here, REASON.integer);
        return;
      case "num":
        if (typeof item !== "number") this.bad(here, REASON.number);
        return;
      case "bool":
        if (typeof item !== "boolean") this.bad(here, REASON.boolean);
        return;
      case "nums":
        if (!all((x) => typeof x === "number")) this.bad(here, REASON.numbers);
        return;
      case "ints":
        if (!all((_, i) => Array.isArray(item) && isIntegerAt(item, i))) this.bad(here, REASON.integers);
        return;
      case "strs":
        if (!all((x) => typeof x === "string")) this.bad(here, REASON.strings);
        return;
      case "string":
        if (typeof item !== "string") this.bad(here, REASON.string);
        return;
      case "version":
        if (item !== "2.0") this.bad(here, REASON.assetVersion);
        return;
      case "copyright":
        if (typeof item !== "string" || !item.toLowerCase().includes("all rights reserved"))
          this.bad(here, REASON.copyright);
        return;
      case "name":
        if (typeof item !== "string") this.bad(here, REASON.string);
        else this.notes.names.push({ path: here, kind: NAMED_KINDS.has(kind) ? kind : "other", index, value: item });
        return;
      case "uri":
        this.notes.uris.push(here);
        return;
      case "attributes":
        this.attributes(item, here);
        return;
      case "targets":
        if (!Array.isArray(item)) this.bad(here, REASON.array);
        else item.forEach((target, i) => this.attributes(target, `${here}[${i}]`));
        return;
      default: {
        const values = ENUMS[spec.slice("enum:".length)] ?? [];
        if (typeof item !== "string" || !values.includes(item)) this.bad(here, REASON.value);
      }
    }
  }

  /** `GltfCheck.attributes`: attribute names from glTF's list, each an accessor's index. */
  private attributes(item: Json | undefined, where: string): void {
    if (!isObject(item)) {
      this.bad(where, REASON.object);
      return;
    }
    for (const key of Object.keys(item)) {
      if (!ATTRIBUTE.test(key)) this.bad(where, REASON.attribute);
      else if (!isIntegerAt(item, key)) this.bad(join(where, key), REASON.integer);
    }
  }

  /** `GltfCheck.extensions`: each extension object is noted for RX4 and RX5, and an admitted one in its place has its
   *  own schema read here. */
  private extensions(item: Json | undefined, host: string, at: string): void {
    if (!isObject(item)) {
      this.bad(at, REASON.object);
      return;
    }
    for (const name of Object.keys(item)) {
      const body = item[name] ?? null;
      this.notes.extensions.push({ at, host, name, body });
      const here = printableKey(name) ? join(at, name) : at;
      if (
        name === "KHR_texture_transform" &&
        ["textureInfo", "normalTextureInfo", "occlusionTextureInfo"].includes(host)
      ) {
        this.loose(body, TEXTURE_TRANSFORM, here);
      } else if (name === "EXT_texture_webp" && host === "texture") {
        this.loose(body, TEXTURE_WEBP, here);
        if (isObject(body) && has(body, "source")) {
          this.notes.refs.push({
            path: join(here, "source"),
            value: body.source,
            integer: isIntegerAt(body, "source"),
            of: "images",
          });
        }
      } else if (name.startsWith(MATERIALS) && name !== XMP && host === "material") {
        this.materials(body, here, false);
      }
    }
  }

  /** `GltfCheck.loose`: an extension object against its own schema. */
  private loose(body: Json, spec: Readonly<Record<string, Spec>>, where: string): void {
    if (!isObject(body)) {
      this.bad(where, REASON.object);
      return;
    }
    for (const key of Object.keys(body)) {
      const known = has(spec, key) ? spec[key] : undefined;
      if (key === "extras") this.notes.extras.push(join(where, key));
      else if (known !== undefined) this.value(body, key, known, join(where, key), "extension", -1);
      else if (printableKey(key)) this.bad(join(where, key), REASON.outsideExtension);
      else this.bad(where, REASON.outsideExtensionUnprinted);
    }
  }

  /** `GltfCheck.materials_extension`: numbers, arrays of numbers, booleans, texture references, and names, and no
   *  other text. A texture reference sits under a key ending in "Texture". */
  private materials(body: Json, where: string, texture: boolean): void {
    if (Array.isArray(body)) {
      body.forEach((element, i) => this.materials(element, `${where}[${i}]`, false));
      return;
    }
    if (typeof body === "string") {
      this.bad(where, REASON.materialText);
      return;
    }
    if (!isObject(body)) return;
    for (const key of Object.keys(body)) {
      const item = body[key] ?? null;
      const here = printableKey(key) ? join(where, key) : where;
      if (key === "extras") this.notes.extras.push(here);
      else if (key === "extensions") this.extensions(item, texture ? "textureInfo" : "materialExtension", here);
      else if (key === "name") this.value(body, key, "name", here, "extension", -1);
      else if (typeof item === "string") this.bad(here, REASON.materialText);
      else {
        const reference = key.endsWith("Texture") && isObject(item);
        if (reference && has(item, "index")) {
          this.notes.refs.push({
            path: join(here, "index"),
            value: item.index,
            integer: isIntegerAt(item, "index"),
            of: "textures",
          });
        }
        this.materials(item, here, reference);
      }
    }
  }
}

// --------------------------------------------------------------------------------------------------------------------
// Stage 3: the structure
// --------------------------------------------------------------------------------------------------------------------
export const COMPONENT_SIZE: Readonly<Record<number, number>> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};
const COMPONENTS: Readonly<Record<string, number>> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};
const SPARSE_INDEX_SIZE: Readonly<Record<number, number>> = { 5121: 1, 5123: 2, 5125: 4 };
const FLOAT = 5126;

const MATRIX_COLUMNS: Readonly<Record<string, number>> = { MAT2: 2, MAT3: 3, MAT4: 4 };

/** A matrix column's bytes: its components, padded to a 4-byte boundary. */
const columnBytes = (columns: number, size: number): number => Math.ceil((columns * size) / 4) * 4;

/** Each component's byte offset within an element: a matrix's columns start on 4-byte boundaries. */
function componentOffsets(type: string, size: number): number[] {
  const columns = MATRIX_COLUMNS[type];
  if (columns === undefined) return Array.from({ length: COMPONENTS[type] ?? 1 }, (_, c) => c * size);
  return Array.from(
    { length: columns * columns },
    (_, c) => Math.floor(c / columns) * columnBytes(columns, size) + (c % columns) * size,
  );
}

function elementSize(type: string, size: number): number {
  const columns = MATRIX_COLUMNS[type];
  return columns === undefined ? (COMPONENTS[type] ?? 1) * size : columns * columnBytes(columns, size);
}

type Format = readonly [type: string, componentType: number, normalized: boolean];
const F = (type: string, componentType: number, normalized = false): Format => [type, componentType, normalized];
/** The accessor formats glTF 2.0 gives each attribute, by its semantic. */
const CORE_FORMATS: Readonly<Record<string, readonly Format[]>> = {
  POSITION: [F("VEC3", 5126)],
  NORMAL: [F("VEC3", 5126)],
  TANGENT: [F("VEC4", 5126)],
  TEXCOORD: [F("VEC2", 5126), F("VEC2", 5121, true), F("VEC2", 5123, true)],
  COLOR: [5126, 5121, 5123].flatMap((ct) => [F("VEC3", ct, ct !== 5126), F("VEC4", ct, ct !== 5126)]),
  JOINTS: [F("VEC4", 5121), F("VEC4", 5123)],
  WEIGHTS: [F("VEC4", 5126), F("VEC4", 5121, true), F("VEC4", 5123, true)],
};
/** The formats KHR_mesh_quantization adds. */
const QUANTIZED_FORMATS: Readonly<Record<string, readonly Format[]>> = {
  POSITION: [5120, 5121, 5122, 5123].flatMap((ct) => [F("VEC3", ct), F("VEC3", ct, true)]),
  NORMAL: [F("VEC3", 5120, true), F("VEC3", 5122, true)],
  TANGENT: [F("VEC4", 5120, true), F("VEC4", 5122, true)],
  TEXCOORD: [
    F("VEC2", 5120),
    F("VEC2", 5120, true),
    F("VEC2", 5121),
    F("VEC2", 5122),
    F("VEC2", 5122, true),
    F("VEC2", 5123),
  ],
};

function takes(attribute: string, a: GAccessor, quantized: boolean): boolean {
  const semantic = attribute.replace(/_[0-9]+$/, "");
  const formats = [...(CORE_FORMATS[semantic] ?? []), ...(quantized ? (QUANTIZED_FORMATS[semantic] ?? []) : [])];
  return formats.some(
    ([type, ct, normalized]) => a.type === type && a.componentType === ct && (a.normalized ?? false) === normalized,
  );
}

/** The texture references a material's core properties hold, with their paths. */
function coreTextures(m: GMaterial, at: string): [string, TextureRef][] {
  const pbr = m.pbrMetallicRoughness;
  const refs: [string, TextureRef | undefined][] = [
    [`${at}.pbrMetallicRoughness.baseColorTexture`, pbr?.baseColorTexture],
    [`${at}.pbrMetallicRoughness.metallicRoughnessTexture`, pbr?.metallicRoughnessTexture],
    [`${at}.normalTexture`, m.normalTexture],
    [`${at}.occlusionTexture`, m.occlusionTexture],
    [`${at}.emissiveTexture`, m.emissiveTexture],
  ];
  return refs.filter((r): r is [string, TextureRef] => r[1] !== undefined);
}

function structure(g: Gltf, box: Container, notes: Notes): Problem[] {
  const out: Problem[] = [];
  const bad = (path: string, reason: string): void => {
    out.push({ rule: "RX2", path, reason });
  };
  const sizes: Readonly<Record<string, number>> = {
    scenes: g.scenes?.length ?? 0,
    nodes: g.nodes?.length ?? 0,
    meshes: g.meshes?.length ?? 0,
    accessors: g.accessors?.length ?? 0,
    bufferViews: g.bufferViews?.length ?? 0,
    buffers: g.buffers?.length ?? 0,
    images: g.images?.length ?? 0,
    textures: g.textures?.length ?? 0,
    samplers: g.samplers?.length ?? 0,
    materials: g.materials?.length ?? 0,
    cameras: g.cameras?.length ?? 0,
    skins: g.skins?.length ?? 0,
  };
  const ref = (path: string, value: number | undefined, of: string, size = sizes[of] ?? 0): void => {
    if (value !== undefined && !(value >= 0 && value < size)) bad(path, REASON.index(of));
  };

  // Every index names an element.
  const nodes = g.nodes ?? [];
  const meshes = g.meshes ?? [];
  const accessors = g.accessors ?? [];
  const views = g.bufferViews ?? [];
  ref("scene", g.scene, "scenes");
  g.scenes?.forEach((s, i) => s.nodes?.forEach((n, j) => ref(`scenes[${i}].nodes[${j}]`, n, "nodes")));
  nodes.forEach((node, i) => {
    node.children?.forEach((c, j) => ref(`nodes[${i}].children[${j}]`, c, "nodes"));
    ref(`nodes[${i}].mesh`, node.mesh, "meshes");
    ref(`nodes[${i}].camera`, node.camera, "cameras");
    ref(`nodes[${i}].skin`, node.skin, "skins");
  });
  meshes.forEach((mesh, m) =>
    mesh.primitives.forEach((p, k) => {
      const at = `meshes[${m}].primitives[${k}]`;
      for (const [key, a] of Object.entries(p.attributes)) ref(`${at}.attributes.${key}`, a, "accessors");
      ref(`${at}.indices`, p.indices, "accessors");
      ref(`${at}.material`, p.material, "materials");
      p.targets?.forEach((t, j) => {
        for (const [key, a] of Object.entries(t)) ref(`${at}.targets[${j}].${key}`, a, "accessors");
      });
    }),
  );
  accessors.forEach((a, i) => {
    ref(`accessors[${i}].bufferView`, a.bufferView, "bufferViews");
    ref(`accessors[${i}].sparse.indices.bufferView`, a.sparse?.indices.bufferView, "bufferViews");
    ref(`accessors[${i}].sparse.values.bufferView`, a.sparse?.values.bufferView, "bufferViews");
  });
  views.forEach((v, i) => ref(`bufferViews[${i}].buffer`, v.buffer, "buffers"));
  g.images?.forEach((image, i) => ref(`images[${i}].bufferView`, image.bufferView, "bufferViews"));
  g.textures?.forEach((t, i) => {
    ref(`textures[${i}].source`, t.source, "images");
    ref(`textures[${i}].sampler`, t.sampler, "samplers");
  });
  g.materials?.forEach((m, i) => {
    for (const [path, texture] of coreTextures(m, `materials[${i}]`)) ref(`${path}.index`, texture.index, "textures");
  });
  for (const r of notes.refs) {
    if (!r.integer) bad(r.path, REASON.integer);
    else ref(r.path, r.value as number, r.of);
  }
  g.skins?.forEach((s, i) => {
    s.joints.forEach((j, k) => ref(`skins[${i}].joints[${k}]`, j, "nodes"));
    ref(`skins[${i}].skeleton`, s.skeleton, "nodes");
    ref(`skins[${i}].inverseBindMatrices`, s.inverseBindMatrices, "accessors");
  });
  g.animations?.forEach((an, i) => {
    an.channels.forEach((c, k) => {
      ref(`animations[${i}].channels[${k}].sampler`, c.sampler, "its animation's samplers", an.samplers.length);
      ref(`animations[${i}].channels[${k}].target.node`, c.target.node, "nodes");
    });
    an.samplers.forEach((s, k) => {
      ref(`animations[${i}].samplers[${k}].input`, s.input, "accessors");
      ref(`animations[${i}].samplers[${k}].output`, s.output, "accessors");
    });
  });
  if (out.length) return out;

  // The node tree is a forest: one parent at most, no cycle, and a scene's roots nobody's child.
  const parent = new Array<number>(nodes.length).fill(-1);
  const twice = new Set<number>();
  nodes.forEach((node, p) => {
    const seen = new Set<number>();
    node.children?.forEach((c, j) => {
      if (seen.has(c)) bad(`nodes[${p}].children[${j}]`, REASON.listedTwice);
      else if (parent[c] !== -1) twice.add(c);
      else parent[c] = p;
      seen.add(c);
    });
  });
  for (const c of [...twice].sort((a, b) => a - b)) bad(`nodes[${c}]`, REASON.twoParents);
  const state = new Uint8Array(nodes.length);
  const onCycle = new Set<number>();
  for (let start = 0; start < nodes.length; start++) {
    const path: number[] = [];
    let x = start;
    while (x !== -1 && state[x] === 0) {
      state[x] = 1;
      path.push(x);
      x = parent[x] ?? -1;
    }
    if (x !== -1 && state[x] === 1) {
      let y = x;
      do {
        onCycle.add(y);
        y = parent[y] ?? -1;
      } while (y !== x && y !== -1);
    }
    for (const n of path) state[n] = 2;
  }
  for (const n of [...onCycle].sort((a, b) => a - b)) bad(`nodes[${n}]`, REASON.cycle);
  g.scenes?.forEach((s, i) => {
    const seen = new Set<number>();
    s.nodes?.forEach((r, j) => {
      if (seen.has(r)) bad(`scenes[${i}].nodes[${j}]`, REASON.listedTwice);
      else if (parent[r] !== -1) bad(`scenes[${i}].nodes[${j}]`, REASON.rootWithParent);
      seen.add(r);
    });
  });
  nodes.forEach((node, i) => {
    if (node.matrix !== undefined && (node.translation ?? node.rotation ?? node.scale) !== undefined) {
      bad(`nodes[${i}]`, REASON.matrixAndTrs);
    }
    for (const [key, length] of [
      ["matrix", 16],
      ["translation", 3],
      ["rotation", 4],
      ["scale", 3],
    ] as const) {
      const v = node[key];
      if (v !== undefined && v.length !== length) bad(`nodes[${i}].${key}`, REASON.size(length));
    }
  });
  g.materials?.forEach((m, i) => {
    if (m.emissiveFactor !== undefined && m.emissiveFactor.length !== 3)
      bad(`materials[${i}].emissiveFactor`, REASON.size(3));
  });
  g.images?.forEach((image, i) => {
    if (image.bufferView === undefined && image.uri === undefined) bad(`images[${i}]`, REASON.imageSource);
  });
  if (out.length) return out;

  // The buffer, its views, and the BIN chunk's bytes, as parse_glb reads them.
  const buffers = g.buffers ?? [];
  const bin = box.bin;
  if (buffers.length > 1) bad("buffers", REASON.buffers);
  const length = buffers[0]?.byteLength ?? 0;
  if (length < 0 || length > bin.length || bin.length - length > 3) {
    bad(buffers.length ? "buffers[0].byteLength" : "buffers", REASON.byteLength);
    return out;
  }
  const ranges: [number, number][] = [];
  for (const [i, v] of views.entries()) {
    const offset = v.byteOffset ?? 0;
    if (offset < 0 || v.byteLength < 0 || offset + v.byteLength > length || v.buffer !== 0) {
      bad(`bufferViews[${i}]`, REASON.viewOutside);
      return out;
    }
    ranges.push([offset, offset + v.byteLength]);
    if (v.byteStride !== undefined && (v.byteStride < 4 || v.byteStride > 252 || v.byteStride % 4)) {
      bad(`bufferViews[${i}].byteStride`, REASON.stride);
    }
  }
  let cursor = 0;
  for (const [low, high] of [
    ...ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    [length, length] as [number, number],
  ]) {
    if (low > cursor) {
      const gap = bin.subarray(cursor, low);
      if (gap.length > 3 || gap.some((byte) => byte !== 0))
        bad("buffers[0]", REASON.gap(gap.length, box.binAt + cursor));
    }
    cursor = Math.max(cursor, high);
  }
  if (bin.subarray(length).some((byte) => byte !== 0)) bad("buffers[0]", REASON.binPadding);

  // Every accessor inside its view, aligned, and of a type its use takes.
  const within = (at: string, view: GBufferView, offset: number, span: number, size: number): boolean => {
    if (offset + span > view.byteLength) bad(at, REASON.accessorOutside);
    else if (offset % size || ((view.byteOffset ?? 0) + offset) % size) bad(`${at}.byteOffset`, REASON.alignment);
    else return true;
    return false;
  };
  accessors.forEach((a, i) => {
    const at = `accessors[${i}]`;
    const size = COMPONENT_SIZE[a.componentType];
    if (size === undefined) return bad(`${at}.componentType`, REASON.componentType);
    if (a.count < 1) return bad(`${at}.count`, REASON.count);
    const offset = a.byteOffset ?? 0;
    if (offset < 0) return bad(`${at}.byteOffset`, REASON.offset);
    const element = elementSize(a.type, size);
    const view = a.bufferView === undefined ? undefined : views[a.bufferView];
    if (view !== undefined) {
      const stride = view.byteStride ?? element;
      if (stride < element) return bad(at, REASON.overStride);
      if (!within(at, view, offset, stride * (a.count - 1) + element, size)) return;
    }
    const s = a.sparse;
    if (s === undefined) return;
    if (s.count < 1 || s.count > a.count) return bad(`${at}.sparse.count`, REASON.sparseCount);
    const indexSize = SPARSE_INDEX_SIZE[s.indices.componentType];
    if (indexSize === undefined) return bad(`${at}.sparse.indices.componentType`, REASON.sparseIndexType);
    const indexView = views[s.indices.bufferView];
    const valueView = views[s.values.bufferView];
    if (indexView === undefined || valueView === undefined) return;
    if (!within(`${at}.sparse.indices`, indexView, s.indices.byteOffset ?? 0, s.count * indexSize, indexSize)) return;
    within(`${at}.sparse.values`, valueView, s.values.byteOffset ?? 0, s.count * element, size);
  });
  const quantized = (g.extensionsUsed ?? []).includes("KHR_mesh_quantization");
  meshes.forEach((mesh, m) =>
    mesh.primitives.forEach((p, k) => {
      const at = `meshes[${m}].primitives[${k}]`;
      if (p.mode !== undefined && !(p.mode >= 0 && p.mode <= 6)) bad(`${at}.mode`, REASON.mode);
      const keys = Object.keys(p.attributes);
      if (keys.length === 0) bad(`${at}.attributes`, REASON.noAttributes);
      const counts = new Set<number>();
      for (const key of keys) {
        const a = accessors[p.attributes[key] ?? -1];
        if (a === undefined) continue;
        counts.add(a.count);
        if (!takes(key, a, quantized)) bad(`${at}.attributes.${key}`, REASON.attributeFormat);
      }
      if (counts.size > 1) bad(`${at}.attributes`, REASON.attributeCounts);
      const indices = p.indices === undefined ? undefined : accessors[p.indices];
      if (indices !== undefined) {
        const view = indices.bufferView === undefined ? undefined : views[indices.bufferView];
        const unsigned = [5121, 5123, 5125].includes(indices.componentType);
        if (indices.type !== "SCALAR" || !unsigned || indices.normalized === true || view?.byteStride !== undefined) {
          bad(`${at}.indices`, REASON.indicesFormat);
        }
      }
    }),
  );
  return out;
}

// --------------------------------------------------------------------------------------------------------------------
// The file, decoded
// --------------------------------------------------------------------------------------------------------------------
const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A node's transform, column-major: its matrix, or its TRS composed as three.js's Matrix4.compose composes it. */
export function localMatrix(node: GNode): Mat4 {
  if (node.matrix !== undefined) return [...node.matrix];
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  const [x = 0, y = 0, z = 0, w = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  const [x2, y2, z2] = [x + x, y + y, z + z];
  const [xx, xy, xz, yy, yz, zz] = [x * x2, x * y2, x * z2, y * y2, y * z2, z * z2];
  const [wx, wy, wz] = [w * x2, w * y2, w * z2];
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

export function transform(m: Mat4, x: number, y: number, z: number): Vec3 {
  const e = (i: number): number => m[i] ?? 0;
  return [
    e(0) * x + e(4) * y + e(8) * z + e(12),
    e(1) * x + e(5) * y + e(9) * z + e(13),
    e(2) * x + e(6) * y + e(10) * z + e(14),
  ];
}

/** glTF's normalized integers as numbers: max(c / 127, −1) and c / 255, max(c / 32767, −1) and c / 65535. */
function normalize(componentType: number, c: number): number {
  if (componentType === 5120) return Math.max(c / 127, -1);
  if (componentType === 5121) return c / 255;
  if (componentType === 5122) return Math.max(c / 32767, -1);
  if (componentType === 5123) return c / 65535;
  return c;
}

export interface SceneNode {
  readonly node: number;
  readonly world: Mat4;
}

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** A GLB whose container, JSON, structure, and values are sound. */
export class Glb {
  private readonly data: DataView;
  private readonly decoded = new Map<number, Float64Array>();
  private scene: readonly SceneNode[] | null = null;

  constructor(
    readonly json: Gltf,
    readonly bin: Uint8Array,
    readonly notes: Notes,
  ) {
    this.data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  }

  private get accessors(): readonly GAccessor[] {
    return this.json.accessors ?? [];
  }

  private get views(): readonly GBufferView[] {
    return this.json.bufferViews ?? [];
  }

  /** A buffer view's bytes. */
  viewBytes(index: number): Uint8Array {
    const view = this.views[index];
    const offset = view?.byteOffset ?? 0;
    return this.bin.subarray(offset, offset + (view?.byteLength ?? 0));
  }

  private component(componentType: number, at: number): number {
    switch (componentType) {
      case 5120:
        return this.data.getInt8(at);
      case 5121:
        return this.data.getUint8(at);
      case 5122:
        return this.data.getInt16(at, true);
      case 5123:
        return this.data.getUint16(at, true);
      case 5125:
        return this.data.getUint32(at, true);
      default:
        return this.data.getFloat32(at, true);
    }
  }

  private sparseIndices(a: GAccessor): number[] {
    const s = a.sparse;
    if (s === undefined) return [];
    const view = this.views[s.indices.bufferView];
    const base = (view?.byteOffset ?? 0) + (s.indices.byteOffset ?? 0);
    const size = SPARSE_INDEX_SIZE[s.indices.componentType] ?? 1;
    return Array.from({ length: s.count }, (_, k) => this.component(s.indices.componentType, base + k * size));
  }

  /** An accessor's values, element by element and component by component: read through its view's byteStride, sparse
   *  substitutions made, normalized integers mapped as glTF maps them, other integers as they are. */
  accessor(index: number): Float64Array {
    const cached = this.decoded.get(index);
    if (cached !== undefined) return cached;
    const a = this.accessors[index];
    if (a === undefined) return new Float64Array();
    const size = COMPONENT_SIZE[a.componentType] ?? 4;
    const offsets = componentOffsets(a.type, size);
    const element = elementSize(a.type, size);
    const n = offsets.length;
    const out = new Float64Array(a.count * n);
    if (a.bufferView !== undefined) {
      const view = this.views[a.bufferView];
      const base = (view?.byteOffset ?? 0) + (a.byteOffset ?? 0);
      const stride = view?.byteStride ?? element;
      for (let e = 0; e < a.count; e++) {
        for (let c = 0; c < n; c++)
          out[e * n + c] = this.component(a.componentType, base + e * stride + (offsets[c] ?? 0));
      }
    }
    if (a.sparse !== undefined) {
      const values = this.views[a.sparse.values.bufferView];
      const base = (values?.byteOffset ?? 0) + (a.sparse.values.byteOffset ?? 0);
      this.sparseIndices(a).forEach((e, k) => {
        for (let c = 0; c < n; c++)
          out[e * n + c] = this.component(a.componentType, base + k * element + (offsets[c] ?? 0));
      });
    }
    if (a.normalized === true) for (let i = 0; i < out.length; i++) out[i] = normalize(a.componentType, out[i] ?? 0);
    this.decoded.set(index, out);
    return out;
  }

  /** Stage 4: sparse indices climbing within their accessor, attribute values finite, and vertex indices within their
   *  primitive. */
  checkValues(): Problem[] {
    const out: Problem[] = [];
    const bad = (path: string, reason: string): void => {
      out.push({ rule: "RX2", path, reason });
    };
    this.accessors.forEach((a, i) => {
      const indices = this.sparseIndices(a);
      if (indices.some((e, k) => !(e < a.count) || (k > 0 && !(e > (indices[k - 1] ?? -1))))) {
        bad(`accessors[${i}].sparse.indices`, REASON.sparseOrder);
      }
    });
    if (out.length) return out;
    const finite = new Set<number>();
    (this.json.meshes ?? []).forEach((mesh, m) =>
      mesh.primitives.forEach((p, k) => {
        for (const index of Object.values(p.attributes)) {
          if (this.accessors[index]?.componentType !== FLOAT || finite.has(index)) continue;
          finite.add(index);
          if (!this.accessor(index).every(Number.isFinite)) bad(`accessors[${index}]`, REASON.notFinite);
        }
        if (p.indices === undefined) return;
        const first = p.attributes.POSITION ?? Object.values(p.attributes)[0];
        const vertices = first === undefined ? 0 : (this.accessors[first]?.count ?? 0);
        if (this.accessor(p.indices).some((v) => v >= vertices))
          bad(`meshes[${m}].primitives[${k}].indices`, REASON.vertexIndex);
      }),
    );
    return out;
  }

  /** The default scene (`scene`, else the first) and every node it reaches, each once, with its world transform, in
   *  depth-first order. */
  sceneNodes(): readonly SceneNode[] {
    if (this.scene !== null) return this.scene;
    const scenes = this.json.scenes ?? [];
    const scene = this.json.scene === undefined ? scenes[0] : scenes[this.json.scene];
    const nodes = this.json.nodes ?? [];
    const out: SceneNode[] = [];
    const stack: [number, Mat4][] = [...(scene?.nodes ?? [])].reverse().map((n): [number, Mat4] => [n, IDENTITY]);
    for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
      const [n, above] = top;
      const node = nodes[n];
      if (node === undefined) continue;
      const world = multiply(above, localMatrix(node));
      out.push({ node: n, world });
      for (const child of [...(node.children ?? [])].reverse()) stack.push([child, world]);
    }
    this.scene = out;
    return out;
  }

  /** The least and greatest x, y, and z over every vertex of every primitive the default scene reaches, through its
   *  node's transform, or null when it reaches none. */
  bounds(): Bounds | null {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const { node, world } of this.sceneNodes()) {
      const mesh = this.json.nodes?.[node]?.mesh;
      if (mesh === undefined) continue;
      for (const p of this.json.meshes?.[mesh]?.primitives ?? []) {
        if (p.attributes.POSITION === undefined) continue;
        const v = this.accessor(p.attributes.POSITION);
        for (let i = 0; i + 2 < v.length; i += 3) {
          const q = transform(world, v[i] ?? NaN, v[i + 1] ?? NaN, v[i + 2] ?? NaN);
          q.forEach((value, a) => {
            min[a] = Math.min(min[a] ?? NaN, value);
            max[a] = Math.max(max[a] ?? NaN, value);
          });
          any = true;
        }
      }
    }
    if (!any) return null;
    return { min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0], max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0] };
  }

  /** Vertices, the sum of POSITION counts, and triangles (mode 4, ⌊k / 3⌋; modes 5 and 6, max(k − 2, 0); others, none),
   *  over every mesh's primitives, each mesh once: the arrival check's count. */
  counts(): { readonly vertices: number; readonly triangles: number } {
    let vertices = 0;
    let triangles = 0;
    for (const mesh of this.json.meshes ?? []) {
      for (const p of mesh.primitives) {
        const n = p.attributes.POSITION === undefined ? 0 : (this.accessors[p.attributes.POSITION]?.count ?? 0);
        const k = p.indices === undefined ? n : (this.accessors[p.indices]?.count ?? 0);
        const mode = p.mode ?? 4;
        vertices += n;
        triangles += mode === 4 ? Math.floor(k / 3) : mode === 5 || mode === 6 ? Math.max(k - 2, 0) : 0;
      }
    }
    return { vertices, triangles };
  }
}

export interface GlbRead {
  /** RX1's or RX2's findings, where the file isn't sound; else none. */
  readonly problems: readonly Problem[];
  readonly glb: Glb | null;
}

/** A GLB read in stages, each stopping the rest at its first finding. */
export function readGlb(bytes: Uint8Array): GlbRead {
  const problems: Problem[] = [];
  const box = container(bytes, problems);
  if (box === null) return { problems, glb: null };
  const parsed = strictJson(box.json);
  if (!parsed.ok)
    return { problems: [{ rule: "RX2", path: "-", reason: REASON.json(parsed.fault, parsed.at) }], glb: null };
  if (!isObject(parsed.value)) return { problems: [{ rule: "RX2", path: "-", reason: REASON.root }], glb: null };
  const walker = new Walker();
  walker.walk(parsed.value, "root", "", 0);
  if (walker.problems.length) return { problems: walker.problems, glb: null };
  const gltf = parsed.value as unknown as Gltf;
  const structural = structure(gltf, box, walker.notes);
  if (structural.length) return { problems: structural, glb: null };
  const glb = new Glb(gltf, box.bin, walker.notes);
  const values = glb.checkValues();
  if (values.length) return { problems: values, glb: null };
  return { problems: [], glb };
}
