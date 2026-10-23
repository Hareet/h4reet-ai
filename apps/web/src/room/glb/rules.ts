// The fit check's rules, written once (spec 004 FR-014 to FR-022, FR-068; research.md R-23; contracts/plain-model-fit.md
// §2, §5, §6): the lists the check reads, RX1 to RX10's texts, the export rules each work order prints (FR-014), and
// every refusal's reason. The refusals and the work orders quote the same lists, so the studio works to the rules the
// check applies. A reason names keys, indices, types, and measured numbers, never a string from the file (FR-018).
// Pure: no Node, DOM, or three.js.
import { NAME_RULE } from "./names";
import type { NameProblem } from "./names";

export const RX_RULES = ["RX1", "RX2", "RX3", "RX4", "RX5", "RX6", "RX7", "RX8", "RX9", "RX10"] as const;
export type RxRule = (typeof RX_RULES)[number];

// --------------------------------------------------------------------------------------------------------------------
// The lists
// --------------------------------------------------------------------------------------------------------------------
/** The mark's extension (§6): its one packet on the root, referenced by the asset alone. */
export const XMP = "KHR_xmp_json_ld";
export const MARK_NAMESPACE = "http://iptc.org/std/Iptc4xmpExt/2008-02-29/";
export const MARK_PROPERTY = "Iptc4xmpExt:DigitalSourceType";
/** IPTC's digital source types, each value this followed by its term. */
export const MARK_VOCABULARY = "http://cv.iptc.org/newscodes/digitalsourcetype/";
/** Amendment C1's values by the class the lookdev page and the report show. IPTC's term for hand-made work joins them as
 *  `hand` once the Author confirms it (T031, T222); until then a hand-made file fails RX5, as FR-077 wants. */
export const MARK_VALUES = {
  model: "trainedAlgorithmicMedia",
  composite: "compositeWithTrainedAlgorithmicMedia",
} as const;
export type MarkClass = keyof typeof MARK_VALUES;

/** Extensions a room model may use beside the mark and the `KHR_materials_*` family (FR-015). */
export const ADMITTED_EXTENSIONS = ["KHR_texture_transform", "KHR_mesh_quantization", "EXT_texture_webp"] as const;
export const MATERIALS = "KHR_materials_";
/** The three `KHR_materials_*` FR-015 refuses. */
export const REFUSED_MATERIALS = [
  "KHR_materials_variants",
  "KHR_materials_transmission",
  "KHR_materials_volume",
] as const;
/** Refused extensions a refusal names, with what each is: the ones §2's export rules call out. */
export const NAMED_REFUSALS: Readonly<Record<string, string>> = {
  KHR_lights_punctual: "a light",
  KHR_draco_mesh_compression: "mesh compression",
  EXT_meshopt_compression: "mesh compression",
  KHR_texture_basisu: "texture compression",
  EXT_mesh_gpu_instancing: "GPU instancing",
  KHR_materials_variants: "material variants",
  KHR_materials_transmission: "transmission",
  KHR_materials_volume: "volume",
};
/** The one `KHR_materials_*` RX10 refuses, as baked light. */
export const EMISSIVE_STRENGTH = "KHR_materials_emissive_strength";

export function admitted(name: string): boolean {
  if ((ADMITTED_EXTENSIONS as readonly string[]).includes(name)) return true;
  return name.startsWith(MATERIALS) && !(REFUSED_MATERIALS as readonly string[]).includes(name);
}

/** Whether an admitted extension's object sits where its specification puts it: `KHR_texture_transform` on a texture
 *  reference, `EXT_texture_webp` on a texture, a `KHR_materials_*` on a material, and `KHR_mesh_quantization` nowhere. */
export function placedOn(name: string, host: string): boolean {
  if (name === "KHR_texture_transform")
    return ["textureInfo", "normalTextureInfo", "occlusionTextureInfo"].includes(host);
  if (name === "EXT_texture_webp") return host === "texture";
  if (name.startsWith(MATERIALS)) return host === "material";
  return false;
}

/** The texture formats by mimeType. */
export const TEXTURE_TYPES: Readonly<Record<string, "png" | "jpeg" | "webp">> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};
/** PNG's colour types RX9 admits, at 8 bits a channel: 2 (RGB) and 6 (RGBA). */
export const PNG_COLOUR_TYPES: readonly number[] = [2, 6];
/** JPEG's Huffman-coded frames: baseline (0xC0), extended (0xC1), and progressive (0xC2). */
export const JPEG_HUFFMAN_FRAMES: readonly number[] = [0xc0, 0xc1, 0xc2];

/** RX7's and RX8's tolerances: the bounds within the larger of 2 cm and 3% of the extent; a face's centre and edges
 *  within 1 mm, its angles within 1°; a texture coordinate within 0.001 of a corner. */
export const TOLERANCE = {
  boundsMetres: 0.02,
  boundsShare: 0.03,
  faceMetres: 0.001,
  faceDegrees: 1,
  texcoord: 0.001,
} as const;

// --------------------------------------------------------------------------------------------------------------------
// Words
// --------------------------------------------------------------------------------------------------------------------
const code = (text: string): string => `\`${text}\``;
/** "a, b, and c", or with "or". */
function series(items: readonly string[], last: "and" | "or"): string {
  if (items.length < 3) return items.join(` ${last} `);
  return `${items.slice(0, -1).join(", ")}, ${last} ${items.at(-1) ?? ""}`;
}
/** An integer with thousands separators, as the report prints bytes. */
export function count(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
/** A number to `digits` decimals, never "-0". */
export function fixed(n: number, digits: number): string {
  const text = n.toFixed(digits);
  return /^-0\.?0*$/.test(text) ? text.slice(1) : text;
}

const ALLOWED_LIST = `${code(`${MATERIALS}*`)} (never ${series(REFUSED_MATERIALS.map(code), "or")}), ${series(
  ADMITTED_EXTENSIONS.map(code),
  "and",
)}`;
const MARK_TERMS = series(Object.values(MARK_VALUES).map(code), "and");

// --------------------------------------------------------------------------------------------------------------------
// RX1 to RX10, as plain-model-fit.md §5 gives them, for the work orders and the report
// --------------------------------------------------------------------------------------------------------------------
export const RULE_TEXT: Readonly<Record<RxRule, string>> = {
  RX1:
    "The container. The file can't be read (in an image build without the room-assets context, every model is " +
    "unreadable); it doesn't start with glTF and version 2; its declared length differs from the file's; a chunk " +
    "isn't 4-byte padded within it; or its chunks aren't one JSON chunk followed by at most one BIN chunk",
  RX2:
    "The JSON. It isn't UTF-8 or isn't an object; it holds a duplicate key, NaN, or Infinity; a property outside the " +
    'glTF 2.0 schema (spec 003\'s M4 walk, ported); `asset.version` other than "2.0"; an index that names no element; ' +
    "a node with two parents, or in a cycle; more than one buffer, or a buffer whose `byteLength` doesn't match the " +
    "BIN chunk beyond its padding; an accessor outside its buffer view, or a buffer view outside the BIN chunk",
  RX3:
    "Anything that moves or isn't geometry: a camera (`cameras`, `node.camera`), an animation, a skin (`skins`, " +
    "`node.skin`), a morph target (`primitive.targets`, `mesh.weights`, `node.weights`), `extras` anywhere " +
    "(`mesh.extras.targetNames` included), or a `uri` on an image or a buffer",
  RX4:
    `An extension. A name, in \`extensionsUsed\`, in \`extensionsRequired\`, or as an extension object, other than ` +
    `${code(XMP)} (where RX5 allows it), ${series([...ADMITTED_EXTENSIONS.map(code), `a ${code(`${MATERIALS}*`)}`], "or")}; ` +
    `any of ${series(REFUSED_MATERIALS.map(code), "and")}; an extension object that \`extensionsUsed\` doesn't name, ` +
    "or that sits where its specification doesn't put it; `extensionsRequired` naming one `extensionsUsed` doesn't. " +
    "So a light (`KHR_lights_punctual`), compression (`KHR_draco_mesh_compression`, `EXT_meshopt_compression`, " +
    "`KHR_texture_basisu`), and GPU instancing (`EXT_mesh_gpu_instancing`) are refused",
  RX5:
    `The mark: missing (the reason reads "not scrubbed"); in any other form than ${code(XMP)}'s one packet on the root, ` +
    `holding the digital source type alone, referenced by the asset; with a value outside Amendment C1's (held now: ` +
    `${MARK_TERMS}, IPTC's term for hand-made work joining them once the Author confirms it); or ${code(XMP)} ` +
    "anywhere but the root's packet and the asset's reference",
  RX6:
    `A name. A node or mesh \`name\` that doesn't match ${code(NAME_RULE.source)}; any \`name\` holding a path, a file ` +
    "name, or a camera's file stem (spec 003's M8, ported: a slash or a backslash; a dot followed by 1 to 5 letters, " +
    "Blender's `.L` and `.R` side suffixes aside; `IMG_`, `PXL_`, `MVIMG_`, `DSC`, `DSCN`, `Screenshot`, WhatsApp's " +
    "`IMG-YYYYMMDD-WA`, Samsung's `YYYYMMDD_HHMMSS`); a material, image, texture, or sampler `name`, where there is " +
    "one, other than the scrubber's neutral ID, `<kind>-<its own index>`",
  RX7:
    "The bounds. On any axis, either corner of the model's bounds lies off the catalog's expected corner at its " +
    `stylized scale by more than the larger of ${TOLERANCE.boundsMetres} m and ${TOLERANCE.boundsShare * 100}% of ` +
    "the expected extent on that axis at that scale",
  RX8:
    "A live face. For a role the catalog entry lists: no node of that name, or more than one; a node with children, " +
    "or whose mesh another node also uses, or holding more than one primitive; a primitive other than four vertices " +
    `forming two triangles; a texture coordinate off the quad's corners by more than ${TOLERANCE.texcoord}; a texture ` +
    `on its material, or a \`COLOR_0\`; a centre or an edge more than ${TOLERANCE.faceMetres * 1000} mm off the ` +
    `catalog's; a facing, an up, a corner's angle, or either triangle's winding more than ${TOLERANCE.faceDegrees}° off`,
  RX9:
    `A texture's format. A \`mimeType\` other than ${series(Object.keys(TEXTURE_TYPES).map(code), "or")}, or one ` +
    "its bytes don't match; a PNG other than 8 bits a channel in RGB or RGBA; a JPEG other than Huffman-coded " +
    "(baseline, extended, or progressive), 8-bit, with three components; an animated WebP; a side that isn't a power " +
    "of two; on a small prop (a piece the caps' `small_props` lists), a side over `small_prop_texture_px`",
  RX10:
    "Baked light in a material: an `emissiveFactor` other than `[0, 0, 0]`, an `emissiveTexture`, " +
    `${code(EMISSIVE_STRENGTH)}, or an \`occlusionTexture\``,
};

// --------------------------------------------------------------------------------------------------------------------
// The export rules, plain-model-fit.md §2, which each work order prints (FR-014, FR-015)
// --------------------------------------------------------------------------------------------------------------------
export interface ExportRule {
  readonly title: string;
  readonly spec: string;
  readonly text: string;
}

/** §2's nine rules, with the caps' small-prop limit the work order's piece is held to. */
export function exportRules(smallPropTexturePx: number): readonly ExportRule[] {
  return [
    {
      title: "The file",
      spec: "FR-015, FR-020",
      text:
        "Binary glTF 2.0, one per piece, named for it: `<piece>.glb`, since a model file's stem is its piece's ID. " +
        'FR-020: "A STATE SHALL be a separate file or a separate placement, never an animation", so a state is a ' +
        "switch's pose, or a piece of its own with its own file. Textures embedded, as PNG, Huffman-coded RGB JPEG, " +
        "or still WebP.",
    },
    {
      title: "Units and axes",
      spec: "FR-015",
      text:
        "Metres; +Y up; the front facing +Z. In Blender: model the piece facing the front view (−Y) and export with " +
        "\"+Y Up\", which turns Blender's −Y into glTF's +Z.",
    },
    {
      title: "Size and origin",
      spec: "FR-015, FR-019, FR-051",
      text:
        "The catalog's size times its stylized scale (FR-051), with the origin at the dimension sheet's origin " +
        "point, so the model's bounds fall on the catalog's expected bounds at that scale.",
    },
    {
      title: "Geometry and materials only",
      spec: "FR-015",
      text:
        "No light, camera, animation, shape key, armature or skin, custom property (`extras`), mesh or texture " +
        `compression (Draco, meshopt, KTX2), or GPU instancing. Extensions only from ${ALLOWED_LIST}.`,
    },
    {
      title: "Names",
      spec: "FR-018",
      text:
        "Objects and meshes named in lowercase letters, digits, and single hyphens (`desk-top`, `leg-2`): no `.001` " +
        `suffix, no file name, path, or camera's file stem. The rule: ${code(NAME_RULE.source)}.`,
    },
    {
      title: "Live faces",
      spec: "FR-017, FR-021",
      text:
        "Each its own object, named for its role: one quad in one plain colour with no texture, sized from the " +
        "dimension sheet, its texture coordinates filling 0 to 1 in reading order. Blender's UV editor puts the " +
        "face's bottom-left at (0, 0); its exporter flips v, so the GLB stores (0, 0) at the top-left.",
    },
    {
      title: "Textures",
      spec: "FR-022, FR-053",
      text:
        "Painted, procedural, or made by an allowed model from a recorded prompt; never projected, traced, or cropped " +
        "from a photo. sRGB, 8 bits a channel, power-of-two sides, no larger than the piece's budget: " +
        `${count(smallPropTexturePx)} pixels on the small props the caps name.`,
    },
    {
      title: "Materials",
      spec: "FR-022",
      text:
        "Flat base colours. No emission, no ambient-occlusion map, and no light, shadow, glow, or outline baked into a " +
        "texture or built as geometry: the look adds them at run time.",
    },
    {
      title: "No words",
      spec: "FR-016",
      text:
        "No word, digit, logo, trademark, key legend, label, regulatory print, tyre-wall text, sticker, screen " +
        "content, or third-party art. The Author's own non-word sign graphics may stay in a texture; the Author's " +
        "lettering may not (answer 4), since the room draws it live.",
    },
  ];
}

// --------------------------------------------------------------------------------------------------------------------
// The refusals' reasons
// --------------------------------------------------------------------------------------------------------------------
const metres = (n: number): string => fixed(n, 4);
const point = (v: readonly number[]): string => `(${v.map(metres).join(", ")})`;
const direction = (v: readonly number[]): string => `(${v.map((x) => fixed(x, 3)).join(", ")})`;

/** A live face's measured plane, as FR-017 asks the refusal to print it. */
export interface Plane {
  readonly centre: readonly number[];
  readonly edges: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };
  readonly facing: readonly number[];
  readonly up: readonly number[];
}

const JSON_FAULTS = {
  utf8: "its JSON chunk isn't UTF-8",
  bom: "its JSON chunk starts with a byte-order mark",
  syntax: "its JSON doesn't parse",
  duplicate: "its JSON holds a duplicate key",
  "non-finite": "its JSON holds NaN, Infinity, or a number past a double's range",
  depth: "its JSON nests deeper than 512",
} as const;

export const REASON = {
  // RX1
  unreadable: "the file can't be read",
  header: "it doesn't start with glTF's 12-byte header",
  version: (version: number): string => `it's glTF version ${version}, not 2`,
  lengthPast: (declared: number, actual: number): string =>
    `its declared length, ${count(declared)} bytes, runs past the file's ${count(actual)}`,
  lengthShort: (declared: number, actual: number): string =>
    `its declared length, ${count(declared)} bytes, falls short of the file's ${count(actual)}`,
  padding: (at: number): string => `the chunk at byte ${count(at)} isn't 4-byte padded within the file`,
  unaccounted: (bytes: number): string => `${bytes} bytes inside its declared length that no chunk accounts for`,
  chunks: "its chunks aren't one JSON chunk followed by at most one BIN chunk",
  // RX2: the JSON
  json: (fault: keyof typeof JSON_FAULTS, at: number): string =>
    fault === "utf8" || fault === "bom" ? JSON_FAULTS[fault] : `${JSON_FAULTS[fault]}, at character ${count(at)}`,
  root: "its JSON isn't an object",
  // RX2: the schema
  object: "not an object",
  array: "not an array",
  integer: "not an integer",
  number: "not a number",
  boolean: "not a boolean",
  numbers: "not an array of numbers",
  integers: "not an array of integers",
  strings: "not an array of strings",
  string: "not a string",
  value: "not one of the schema's values",
  assetVersion: 'not "2.0"',
  copyright: "a copyright that doesn't name the media license",
  outside: "a property outside the glTF 2.0 schema",
  outsideAsset: "a property outside the glTF 2.0 schema (asset holds only version and copyright)",
  outsideUnprinted: "a property outside the glTF 2.0 schema, under a key a refusal doesn't print",
  outsideExtension: "a property outside the extension's schema",
  outsideExtensionUnprinted: "a property outside the extension's schema, under a key a refusal doesn't print",
  attribute: "an attribute outside the glTF 2.0 schema's",
  materialText: "text a material extension has no use for",
  required: "missing, where the glTF 2.0 schema requires it",
  // RX2: the structure
  index: (of: string): string => `names no element of ${of}`,
  twoParents: "a node with two parents",
  cycle: "a node in a cycle",
  listedTwice: "a node listed twice",
  rootWithParent: "a scene's root node that another node holds as a child",
  matrixAndTrs: "both a matrix and a translation, rotation, or scale",
  size: (n: number): string => `not ${n} numbers`,
  buffers: "more than one buffer: a GLB holds one, its BIN chunk",
  byteLength: "a byteLength that doesn't match the BIN chunk beyond its padding",
  viewOutside: "lies outside the buffer",
  stride: "a byteStride outside 4 to 252 in steps of 4",
  gap: (bytes: number, at: number): string =>
    `${count(bytes)} bytes of the BIN chunk, at byte ${count(at)} of the file, that no buffer view covers`,
  binPadding: "the BIN chunk's padding isn't zeros",
  componentType: "not one of glTF's component types",
  count: "a count under 1",
  offset: "a negative byteOffset",
  accessorOutside: "lies outside its buffer view",
  overStride: "an element larger than its buffer view's byteStride",
  alignment: "not aligned to its component type's size",
  sparseCount: "a sparse count under 1 or over the accessor's count",
  sparseIndexType: "not an unsigned byte, short, or integer",
  sparseOrder: "sparse indices that don't climb within the accessor's count",
  mode: "not one of glTF's primitive modes, 0 to 6",
  noAttributes: "no attributes",
  attributeFormat: "an accessor of a type or component type this attribute doesn't take",
  attributeCounts: "attributes of different counts",
  indicesFormat: "an index accessor that isn't unsigned integer scalars in a buffer view without a byteStride",
  vertexIndex: "an index past the primitive's vertices",
  notFinite: "a value that isn't a finite number",
  imageSource: "an image with neither a bufferView nor a uri",
  // RX3
  camera: "a camera",
  animation: "an animation",
  skin: "a skin",
  morph: "a morph target",
  extras: "extras: a room model carries no custom property",
  uri: "a uri: a GLB embeds its images and buffers through its BIN chunk",
  // RX4
  refused: (name: string, what: string): string => `${name}, ${what}, outside the extensions the room admits`,
  outsideList: "an extension outside the ones the room admits",
  notUsed: "an extension object extensionsUsed doesn't name",
  misplaced: "an extension object where its specification doesn't put it",
  requiredNotUsed: "names an extension extensionsUsed doesn't",
  // RX5
  notScrubbed: "not scrubbed",
  markUnused: `extensionsUsed doesn't name ${XMP}`,
  markRequired: `extensionsRequired names ${XMP}`,
  markPackets: `${XMP} holds something besides one packet`,
  markPacket: "the packet holds something besides the mark's context and its digital source type",
  markValue: `a digital source type other than the room's: ${series(Object.values(MARK_VALUES), "or")}`,
  markReference: `the asset's extensions aren't exactly {"${XMP}": {"packet": 0}}`,
  markElsewhere: `${XMP} on an object other than the root and the asset`,
  // RX6
  name: {
    path: "a name that holds a path",
    "file-name": "a name that holds a file name",
    "camera-stem": "a name that holds a camera's file stem",
  } as const satisfies Record<NameProblem, string>,
  nameRule: (kind: "node" | "mesh"): string => `a ${kind}'s name off the rule ${NAME_RULE.source}`,
  neutral: (kind: string, id: string): string => `a ${kind}'s name other than its neutral ID, ${id}`,
  // RX7
  noGeometry: "no vertex the default scene reaches",
  bounds: (axis: string, min: number, max: number, low: number, high: number, tolerance: number): string =>
    `bounds on ${axis} from ${metres(min)} to ${metres(max)} m, off the catalog's ${metres(low)} to ` +
    `${metres(high)} m by more than ${metres(tolerance)} m`,
  // RX8
  faceMissing: (face: number): string => `no node named for the catalog's live_faces[${face}]`,
  faceSeveral: (face: number, nodes: number): string =>
    `one of ${nodes} nodes named for the catalog's live_faces[${face}]`,
  faceOutside: "a live face's node outside the default scene",
  faceChildren: "a live face's node with children",
  faceNoMesh: "a live face's node with no mesh",
  faceSharedMesh: "a live face's mesh, which another node also uses",
  facePrimitives: "a live face's mesh without exactly one primitive",
  faceNotQuad: "a primitive other than four vertices forming two triangles",
  faceNoTexcoord: "a live face with no TEXCOORD_0",
  faceTexcoord: `a texture coordinate off the quad's corners by more than ${TOLERANCE.texcoord}`,
  faceTexture: "a texture on a live face's material",
  faceColours: "vertex colours on a live face",
  faceOff: (face: number, off: readonly string[], plane: Plane): string =>
    `live face off the catalog's live_faces[${face}] by ${series(off, "and")}: measured centre ` +
    `${point(plane.centre)} m, edges ${series(
      [plane.edges.top, plane.edges.bottom, plane.edges.left, plane.edges.right].map(metres),
      "and",
    )} m (top, bottom, left, right), facing ${direction(plane.facing)}, up ${direction(plane.up)}`,
  offMillimetres: (what: string, metresOff: number): string => `${what} ${fixed(metresOff * 1000, 1)} mm`,
  offDegrees: (what: string, degrees: number): string => `${what} ${fixed(degrees, 1)}°`,
  // RX9
  mimeMissing: "no mimeType",
  mimeOther: `a mimeType other than ${series(Object.keys(TEXTURE_TYPES), "or")}`,
  mimeMismatch: "a mimeType its bytes don't match",
  notAnImage: "bytes that aren't a PNG, JPEG, or WebP",
  imageUnreadable: (format: string): string => `a ${format.toUpperCase()} whose header can't be read`,
  png: "a PNG other than 8 bits a channel in RGB or RGBA",
  jpegCoding: "a JPEG other than Huffman-coded: baseline, extended, or progressive",
  jpegPrecision: "a JPEG other than 8-bit",
  jpegComponents: "a JPEG other than three components",
  animated: "an animated WebP",
  powerOfTwo: (width: number, height: number): string => `a side that isn't a power of two: ${width} × ${height}`,
  smallProp: (width: number, height: number, limit: number): string =>
    `a side over the small props' ${count(limit)} pixels: ${width} × ${height}`,
  // RX10
  emissive: "an emissiveFactor other than [0, 0, 0]",
  emissiveTexture: "an emissiveTexture",
  emissiveStrength: `an emissive strength, ${EMISSIVE_STRENGTH}`,
  occlusion: "an occlusionTexture",
} as const;
