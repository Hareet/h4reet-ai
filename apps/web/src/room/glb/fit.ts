// The fit check (spec 004 FR-015 to FR-019, FR-022, FR-068; research.md R-23; contracts/plain-model-fit.md §5 to §7,
// §10, §11): RX1 to RX10 on one scrubbed GLB, judged against its catalog entry at its stylized scale, and §7's measures.
// The compositor (build/room/, in Node) and the lookdev page (in a browser) run this one module, so neither carries a
// second copy of a rule (FR-068). The gzip-9 length is given, not computed: gzip.ts measures it once with pako, for the
// served copy and for this, so this module needs no compressor.
//
// The readings §5 gives: RX1, then RX2, stop the file's other rules, which need a sound file; otherwise every rule runs
// and every finding is reported, sorted by path (its indices as numbers), then rule, and "not scrubbed" stops nothing.
// RX7's tolerance is the larger of 2 cm and 3% of the expected extent at the stylized scale: FR-019's "the larger of
// 2 cm and 3%", with the catalog's lengths times the scale and the 2 cm the studio's own. RX8 finds a face's corners by
// their texture coordinates and prints its measured plane. A comparison counts as off unless it holds, so a number that
// isn't finite never passes. Pure: no Node, DOM, or three.js.
import { readImage } from "./images";
import type { Json } from "./json";
import { isObject } from "./json";
import { NAME_RULE, isNeutralKind, nameProblem, neutralId, printableKey } from "./names";
import { readGlb, transform } from "./read";
import type { Bounds, GMaterial, GPrimitive, Glb, Problem, Vec3 } from "./read";
import {
  EMISSIVE_STRENGTH,
  JPEG_HUFFMAN_FRAMES,
  MARK_NAMESPACE,
  MARK_PROPERTY,
  MARK_VALUES,
  MARK_VOCABULARY,
  MATERIALS,
  NAMED_REFUSALS,
  PNG_COLOUR_TYPES,
  REASON,
  TEXTURE_TYPES,
  TOLERANCE,
  XMP,
  admitted,
  placedOn,
} from "./rules";
import type { MarkClass, RxRule } from "./rules";

export type { Bounds, Vec3 } from "./read";

/** A catalog live face: its role, which names its node, and its centre, size, facing, and up. */
export interface FaceInput {
  readonly role: string;
  readonly at: Vec3;
  readonly size: readonly [number, number];
  readonly facing: Vec3;
  readonly up: Vec3;
}

/** What a model is judged against: the catalog's expected bounds and live faces at the stylized scale, and the caps'
 *  small-prop limit where the caps' `small_props` names the piece (lookdev.md §2; room-bundle.md's
 *  `virtual:room-lookdev`). */
export interface FitInput {
  readonly bounds: Bounds;
  readonly faces: readonly FaceInput[];
  readonly smallPropTexturePx: number | null;
}

/** The catalog entry's values at scale 1, and its stylized scale. */
export interface CatalogFit {
  readonly bounds: Bounds;
  readonly faces: readonly FaceInput[];
  readonly scale: number;
}

const scaled = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];

/** The fit inputs at the stylized scale `s` (§5): a catalog length or point times `s`, a direction unchanged. */
export function atScale(entry: CatalogFit, smallPropTexturePx: number | null): FitInput {
  const s = entry.scale;
  return {
    bounds: { min: scaled(entry.bounds.min, s), max: scaled(entry.bounds.max, s) },
    faces: entry.faces.map((face) => ({
      role: face.role,
      at: scaled(face.at, s),
      size: [face.size[0] * s, face.size[1] * s],
      facing: [...face.facing],
      up: [...face.up],
    })),
    smallPropTexturePx,
  };
}

export interface FitOptions {
  /** The model's repository path (`assets/room/<piece>.glb`), or `candidate` in the lookdev page. */
  readonly file: string;
  /** The length of the file at gzip level 9 (gzip.ts), which this module reports and never computes. */
  readonly gzipBytes: number;
}

/** One finding: `<rule> <file>:<path>: <reason>` (§10). */
export interface GlbFinding {
  readonly rule: RxRule;
  readonly file: string;
  readonly path: string;
  readonly reason: string;
}

/** A live face's measured plane, in the model's frame. */
export interface FaceMeasure {
  /** Its index in the catalog entry's `live_faces`. */
  readonly face: number;
  /** Its node's index. */
  readonly node: number;
  readonly centre: Vec3;
  readonly edges: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };
  readonly facing: Vec3;
  readonly up: Vec3;
}

/** §7's measures. A file RX1 or RX2 refuses has only its bytes measured. */
export interface Measures {
  readonly bytes: number;
  readonly gzipBytes: number;
  readonly vertices: number | null;
  readonly triangles: number | null;
  /** Σ ⌊16 · w · h / 3⌋ over the file's images. */
  readonly textureBytes: number | null;
  readonly maxTexturePx: number | null;
  readonly bounds: Bounds | null;
  readonly faces: readonly FaceMeasure[];
}

export interface FitResult {
  readonly findings: readonly GlbFinding[];
  readonly measures: Measures;
  /** Whether the file carries spec 003's mark at all: "not scrubbed" otherwise (FR-068). */
  readonly scrubbed: boolean;
  /** The mark's class, where the mark is in its form and holds a value Amendment C1 admits. */
  readonly mark: MarkClass | null;
}

export function render(f: GlbFinding): string {
  return `${f.rule} ${f.file}:${f.path}: ${f.reason}`;
}

/** RX1 for a model the compositor can't read at all (§5's readings). */
export function unreadable(file: string): GlbFinding {
  return { rule: "RX1", file, path: "-", reason: REASON.unreadable };
}

function tokens(path: string): (string | number)[] {
  return [...path.matchAll(/\[(\d+)\]|([^.[\]]+)/g)].map((m) => (m[1] === undefined ? (m[2] ?? "") : Number(m[1])));
}

/** By path, its indices compared as numbers, then by rule, RX2 before RX10. */
export function compareFindings(a: GlbFinding, b: GlbFinding): number {
  const [x, y] = [tokens(a.path), tokens(b.path)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const [p, q] = [x[i], y[i]];
    if (p === q) continue;
    if (typeof p === "number" && typeof q === "number") return p - q;
    if (typeof p === "number") return -1;
    if (typeof q === "number") return 1;
    return (p ?? "") < (q ?? "") ? -1 : 1;
  }
  if (x.length !== y.length) return x.length - y.length;
  return Number(a.rule.slice(2)) - Number(b.rule.slice(2));
}

function findings(problems: readonly Problem[], file: string): GlbFinding[] {
  const seen = new Set<string>();
  const out: GlbFinding[] = [];
  for (const p of problems) {
    const key = `${p.rule}\n${p.path}\n${p.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ rule: p.rule, file, path: p.path, reason: p.reason });
  }
  return out.sort(compareFindings);
}

/** RX1 to RX10 on `bytes` against `input`, with §7's measures. */
export function fit(bytes: Uint8Array, input: FitInput, options: FitOptions): FitResult {
  const read = readGlb(bytes);
  if (read.glb === null) {
    return {
      findings: findings(read.problems, options.file),
      measures: {
        bytes: bytes.length,
        gzipBytes: options.gzipBytes,
        vertices: null,
        triangles: null,
        textureBytes: null,
        maxTexturePx: null,
        bounds: null,
        faces: [],
      },
      scrubbed: false,
      mark: null,
    };
  }
  const glb = read.glb;
  const problems: Problem[] = [];
  rx3(glb, problems);
  rx4(glb, problems);
  const mark = rx5(glb, problems);
  rx6(glb, problems);
  const bounds = glb.bounds();
  rx7(bounds, input, problems);
  const faces = rx8(glb, input, problems);
  const textures = rx9(glb, input, problems);
  rx10(glb, problems);
  const { vertices, triangles } = glb.counts();
  return {
    findings: findings(problems, options.file),
    measures: { bytes: bytes.length, gzipBytes: options.gzipBytes, vertices, triangles, ...textures, bounds, faces },
    ...mark,
  };
}

// --------------------------------------------------------------------------------------------------------------------
// RX3: anything that moves or isn't geometry
// --------------------------------------------------------------------------------------------------------------------
function rx3(glb: Glb, out: Problem[]): void {
  const bad = (path: string, reason: string): void => {
    out.push({ rule: "RX3", path, reason });
  };
  const g = glb.json;
  if (g.cameras !== undefined) bad("cameras", REASON.camera);
  if (g.animations !== undefined) bad("animations", REASON.animation);
  if (g.skins !== undefined) bad("skins", REASON.skin);
  g.nodes?.forEach((node, i) => {
    if (node.camera !== undefined) bad(`nodes[${i}].camera`, REASON.camera);
    if (node.skin !== undefined) bad(`nodes[${i}].skin`, REASON.skin);
    if (node.weights !== undefined) bad(`nodes[${i}].weights`, REASON.morph);
  });
  g.meshes?.forEach((mesh, m) => {
    if (mesh.weights !== undefined) bad(`meshes[${m}].weights`, REASON.morph);
    mesh.primitives.forEach((p, k) => {
      if (p.targets !== undefined) bad(`meshes[${m}].primitives[${k}].targets`, REASON.morph);
    });
  });
  for (const path of glb.notes.extras) bad(path, REASON.extras);
  for (const path of glb.notes.uris) bad(path, REASON.uri);
}

// --------------------------------------------------------------------------------------------------------------------
// RX4: extensions (the mark's are RX5's)
// --------------------------------------------------------------------------------------------------------------------
function refusal(name: string): string {
  return Object.hasOwn(NAMED_REFUSALS, name) ? REASON.refused(name, NAMED_REFUSALS[name] ?? "") : REASON.outsideList;
}

function rx4(glb: Glb, out: Problem[]): void {
  const bad = (path: string, reason: string): void => {
    out.push({ rule: "RX4", path, reason });
  };
  const g = glb.json;
  const used = new Set(g.extensionsUsed ?? []);
  g.extensionsUsed?.forEach((name, i) => {
    if (name !== XMP && !admitted(name)) bad(`extensionsUsed[${i}]`, refusal(name));
  });
  g.extensionsRequired?.forEach((name, i) => {
    if (name === XMP) return;
    if (!admitted(name)) bad(`extensionsRequired[${i}]`, refusal(name));
    else if (!used.has(name)) bad(`extensionsRequired[${i}]`, REASON.requiredNotUsed);
  });
  for (const e of glb.notes.extensions) {
    if (e.name === XMP) continue;
    const path = printableKey(e.name) ? `${e.at}.${e.name}` : e.at;
    if (!admitted(e.name)) bad(path, refusal(e.name));
    else if (!used.has(e.name)) bad(path, REASON.notUsed);
    else if (!placedOn(e.name, e.host)) bad(path, REASON.misplaced);
  }
}

// --------------------------------------------------------------------------------------------------------------------
// RX5: the mark, as scrub.py writes it and the arrival check's M5 reads it (§6)
// --------------------------------------------------------------------------------------------------------------------
const keysAre = (o: Json | undefined, keys: readonly string[]): boolean =>
  isObject(o) && Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));

function markClass(value: Json | undefined): MarkClass | null {
  for (const [kind, term] of Object.entries(MARK_VALUES) as [MarkClass, string][]) {
    if (value === MARK_VOCABULARY + term) return kind;
  }
  return null;
}

function rx5(glb: Glb, out: Problem[]): { readonly scrubbed: boolean; readonly mark: MarkClass | null } {
  const before = out.length;
  const bad = (path: string, reason: string): void => {
    out.push({ rule: "RX5", path, reason });
  };
  const g = glb.json;
  for (const e of glb.notes.extensions) {
    if (e.name === XMP && e.host !== "root" && e.host !== "asset") bad(e.at, REASON.markElsewhere);
  }
  g.extensionsRequired?.forEach((name, i) => {
    if (name === XMP) bad(`extensionsRequired[${i}]`, REASON.markRequired);
  });
  const root = g.extensions !== undefined && Object.hasOwn(g.extensions, XMP) ? g.extensions[XMP] : undefined;
  const assetExtensions = g.asset.extensions;
  const reference = isObject(assetExtensions) && Object.hasOwn(assetExtensions, XMP) ? assetExtensions[XMP] : undefined;
  if (root === undefined && reference === undefined) {
    bad("extensions", REASON.notScrubbed);
    return { scrubbed: false, mark: null };
  }
  if (!(g.extensionsUsed ?? []).includes(XMP)) bad("extensionsUsed", REASON.markUnused);
  let mark: MarkClass | null = null;
  const packets = keysAre(root, ["packets"]) && isObject(root) ? root.packets : undefined;
  if (!Array.isArray(packets) || packets.length !== 1) {
    bad(`extensions.${XMP}`, REASON.markPackets);
  } else {
    const packet = packets[0];
    const context = isObject(packet) ? packet["@context"] : undefined;
    if (
      !keysAre(packet, ["@context", MARK_PROPERTY]) ||
      !keysAre(context, ["Iptc4xmpExt"]) ||
      !isObject(context) ||
      context.Iptc4xmpExt !== MARK_NAMESPACE
    ) {
      bad(`extensions.${XMP}.packets[0]`, REASON.markPacket);
    } else {
      mark = markClass(isObject(packet) ? packet[MARK_PROPERTY] : undefined);
      if (mark === null) bad(`extensions.${XMP}.packets[0]`, REASON.markValue);
    }
  }
  if (
    !keysAre(assetExtensions, [XMP]) ||
    !keysAre(reference, ["packet"]) ||
    !isObject(reference) ||
    reference.packet !== 0
  ) {
    bad("asset.extensions", REASON.markReference);
  }
  return { scrubbed: true, mark: out.length === before ? mark : null };
}

// --------------------------------------------------------------------------------------------------------------------
// RX6: names
// --------------------------------------------------------------------------------------------------------------------
function rx6(glb: Glb, out: Problem[]): void {
  for (const name of glb.notes.names) {
    const problem = nameProblem(name.value);
    let reason: string | null = null;
    if (problem !== null) reason = REASON.name[problem];
    else if ((name.kind === "node" || name.kind === "mesh") && !NAME_RULE.test(name.value)) {
      reason = REASON.nameRule(name.kind);
    } else if (isNeutralKind(name.kind) && name.value !== neutralId(name.kind, name.index)) {
      reason = REASON.neutral(name.kind, neutralId(name.kind, name.index));
    }
    if (reason !== null) out.push({ rule: "RX6", path: name.path, reason });
  }
}

// --------------------------------------------------------------------------------------------------------------------
// RX7: the bounds
// --------------------------------------------------------------------------------------------------------------------
function rx7(bounds: Bounds | null, input: FitInput, out: Problem[]): void {
  if (bounds === null) {
    out.push({ rule: "RX7", path: "-", reason: REASON.noGeometry });
    return;
  }
  for (let a = 0; a < 3; a++) {
    const [low, high] = [input.bounds.min[a] ?? 0, input.bounds.max[a] ?? 0];
    const [min, max] = [bounds.min[a] ?? NaN, bounds.max[a] ?? NaN];
    const tolerance = Math.max(TOLERANCE.boundsMetres, TOLERANCE.boundsShare * (high - low));
    if (!(Math.abs(min - low) <= tolerance && Math.abs(max - high) <= tolerance)) {
      out.push({ rule: "RX7", path: "-", reason: REASON.bounds("xyz"[a] ?? "", min, max, low, high, tolerance) });
    }
  }
}

// --------------------------------------------------------------------------------------------------------------------
// RX8: the live faces
// --------------------------------------------------------------------------------------------------------------------
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const n = length(a);
  return [a[0] / n, a[1] / n, a[2] / n];
};
/** The angle between two vectors, in degrees, from atan2 so it holds near 0° and 180°. */
const angle = (a: Vec3, b: Vec3): number => (Math.atan2(length(cross(a, b)), dot(a, b)) * 180) / Math.PI;

/** The texture coordinates of the corners in reading order: top-left, top-right, bottom-left, bottom-right. */
const CORNERS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/** A primitive's two triangles over four vertices, by its mode, in glTF 2.0's winding: a list's i-th triangle is
 *  (v[3i], v[3i + 1], v[3i + 2]), a strip's (v[i], v[i + 1 + i % 2], v[i + 2 − i % 2]), and a fan's
 *  (v[i + 1], v[i + 2], v[0]). Null when they aren't two triangles that use all four vertices. */
function quadTriangles(glb: Glb, p: GPrimitive): [number, number, number][] | null {
  const position = p.attributes.POSITION;
  if (position === undefined || glb.json.accessors?.[position]?.count !== 4) return null;
  const v = p.indices === undefined ? [0, 1, 2, 3] : Array.from(glb.accessor(p.indices));
  const at = (i: number): number => v[i] ?? -1;
  const mode = p.mode ?? 4;
  let triangles: [number, number, number][];
  if (mode === 4 && v.length === 6) {
    triangles = [
      [at(0), at(1), at(2)],
      [at(3), at(4), at(5)],
    ];
  } else if (mode === 5 && v.length === 4) {
    triangles = [
      [at(0), at(1), at(2)],
      [at(1), at(3), at(2)],
    ];
  } else if (mode === 6 && v.length === 4) {
    triangles = [
      [at(1), at(2), at(0)],
      [at(2), at(3), at(0)],
    ];
  } else {
    return null;
  }
  if (new Set(triangles.flat()).size !== 4 || triangles.some((t) => new Set(t).size !== 3)) return null;
  return triangles;
}

/** Whether a value holds a texture reference: an object under a key ending in "Texture". */
function holdsTexture(value: Json | undefined): boolean {
  if (Array.isArray(value)) return value.some(holdsTexture);
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, item]) => (key.endsWith("Texture") && isObject(item)) || holdsTexture(item));
}

/** Whether a material carries a texture of any kind: base colour, metallic-roughness, normal, occlusion, emissive, or a
 *  `KHR_materials_*` texture. */
function textured(m: GMaterial | undefined): boolean {
  if (m === undefined) return false;
  const pbr = m.pbrMetallicRoughness;
  const core = [
    pbr?.baseColorTexture,
    pbr?.metallicRoughnessTexture,
    m.normalTexture,
    m.occlusionTexture,
    m.emissiveTexture,
  ];
  if (core.some((t) => t !== undefined)) return true;
  return Object.entries(m.extensions ?? {}).some(([name, body]) => name.startsWith(MATERIALS) && holdsTexture(body));
}

function rx8(glb: Glb, input: FitInput, out: Problem[]): FaceMeasure[] {
  const g = glb.json;
  const nodes = g.nodes ?? [];
  const worlds = new Map(glb.sceneNodes().map((s) => [s.node, s.world]));
  const users = new Map<number, number>();
  for (const node of nodes) if (node.mesh !== undefined) users.set(node.mesh, (users.get(node.mesh) ?? 0) + 1);
  const measured: FaceMeasure[] = [];
  input.faces.forEach((face, f) => {
    const bad = (path: string, reason: string): void => {
      out.push({ rule: "RX8", path, reason });
    };
    const named = nodes.flatMap((node, i) => (node.name === face.role ? [i] : []));
    if (named.length !== 1) {
      if (named.length === 0) bad("nodes", REASON.faceMissing(f));
      for (const i of named) bad(`nodes[${i}]`, REASON.faceSeveral(f, named.length));
      return;
    }
    const n = named[0] ?? 0;
    const node = nodes[n];
    const world = worlds.get(n);
    let sound = true;
    if (world === undefined) {
      bad(`nodes[${n}]`, REASON.faceOutside);
      sound = false;
    }
    if (node?.children !== undefined && node.children.length > 0) bad(`nodes[${n}].children`, REASON.faceChildren);
    if (node?.mesh === undefined) {
      bad(`nodes[${n}]`, REASON.faceNoMesh);
      return;
    }
    if ((users.get(node.mesh) ?? 0) > 1) bad(`nodes[${n}].mesh`, REASON.faceSharedMesh);
    const primitives = g.meshes?.[node.mesh]?.primitives ?? [];
    const at = `meshes[${node.mesh}].primitives`;
    const p = primitives[0];
    if (primitives.length !== 1 || p === undefined) {
      bad(at, REASON.facePrimitives);
      return;
    }
    if (p.material !== undefined && textured(g.materials?.[p.material]))
      bad(`materials[${p.material}]`, REASON.faceTexture);
    for (const key of Object.keys(p.attributes))
      if (/^COLOR_[0-9]+$/.test(key)) bad(`${at}[0].attributes.${key}`, REASON.faceColours);
    const triangles = quadTriangles(glb, p);
    if (triangles === null) {
      bad(`${at}[0]`, REASON.faceNotQuad);
      return;
    }
    if (p.attributes.TEXCOORD_0 === undefined) {
      bad(`${at}[0].attributes`, REASON.faceNoTexcoord);
      return;
    }
    // The corners by their texture coordinates, each within 0.001 of one, the four corners each met once.
    const uv = glb.accessor(p.attributes.TEXCOORD_0);
    const corner = [-1, -1, -1, -1];
    for (let v = 0; v < 4; v++) {
      const c = CORNERS.findIndex(
        ([u, w]) =>
          Math.abs((uv[2 * v] ?? NaN) - u) <= TOLERANCE.texcoord &&
          Math.abs((uv[2 * v + 1] ?? NaN) - w) <= TOLERANCE.texcoord,
      );
      if (c >= 0 && corner[c] === -1) corner[c] = v;
    }
    if (corner.includes(-1)) {
      bad(`${at}[0].attributes.TEXCOORD_0`, REASON.faceTexcoord);
      return;
    }
    if (!sound || world === undefined) return;
    const position = glb.accessor(p.attributes.POSITION ?? -1);
    const points = [0, 1, 2, 3].map((v) =>
      transform(world, position[3 * v] ?? NaN, position[3 * v + 1] ?? NaN, position[3 * v + 2] ?? NaN),
    );
    const point = (v: number): Vec3 => points[v] ?? [NaN, NaN, NaN];
    const [tl, tr, bl, br] = [
      point(corner[0] ?? -1),
      point(corner[1] ?? -1),
      point(corner[2] ?? -1),
      point(corner[3] ?? -1),
    ];
    const centre: Vec3 = [
      (tl[0] + tr[0] + bl[0] + br[0]) / 4,
      (tl[1] + tr[1] + bl[1] + br[1]) / 4,
      (tl[2] + tr[2] + bl[2] + br[2]) / 4,
    ];
    const edges = {
      top: length(sub(tr, tl)),
      bottom: length(sub(br, bl)),
      left: length(sub(tl, bl)),
      right: length(sub(tr, br)),
    };
    const facing = unit(cross(sub(bl, tl), sub(tr, tl)));
    const up = unit(sub(tl, bl));
    // What is off, by the catalog's face at the stylized scale.
    const off: string[] = [];
    const within = (value: number, limit: number): boolean => value <= limit;
    const centreOff = length(sub(centre, face.at));
    if (!within(centreOff, TOLERANCE.faceMetres)) off.push(REASON.offMillimetres("centre", centreOff));
    for (const [edge, expected] of [
      ["top", face.size[0]],
      ["bottom", face.size[0]],
      ["left", face.size[1]],
      ["right", face.size[1]],
    ] as const) {
      const d = Math.abs(edges[edge] - expected);
      if (!within(d, TOLERANCE.faceMetres)) off.push(REASON.offMillimetres(`${edge} edge`, d));
    }
    for (const [what, measuredDirection, expected] of [
      ["facing", facing, face.facing],
      ["up", up, face.up],
    ] as const) {
      const d = angle(measuredDirection, expected);
      if (!within(d, TOLERANCE.faceDegrees)) off.push(REASON.offDegrees(what, d));
    }
    const corners = [
      angle(sub(tr, tl), sub(bl, tl)),
      angle(sub(tl, tr), sub(br, tr)),
      angle(sub(tr, br), sub(bl, br)),
      angle(sub(br, bl), sub(tl, bl)),
    ].map((d) => Math.abs(d - 90));
    const cornerOff = Math.max(...corners);
    if (!within(cornerOff, TOLERANCE.faceDegrees)) off.push(REASON.offDegrees("corner", cornerOff));
    const windings = triangles.map(([a, b, c]) =>
      angle(cross(sub(point(b), point(a)), sub(point(c), point(a))), facing),
    );
    const windingOff = Math.max(...windings);
    if (!within(windingOff, TOLERANCE.faceDegrees)) off.push(REASON.offDegrees("winding", windingOff));
    if (off.length) bad(`nodes[${n}]`, REASON.faceOff(f, off, { centre, edges, facing, up }));
    measured.push({ face: f, node: n, centre, edges, facing, up });
  });
  return measured;
}

// --------------------------------------------------------------------------------------------------------------------
// RX9: the textures, and texture memory
// --------------------------------------------------------------------------------------------------------------------
function powerOfTwo(n: number): boolean {
  let p = 1;
  while (p < n) p *= 2;
  return p === n;
}

/** ⌊16 · w · h / 3⌋: width × height × 4 bytes, × 4/3 for mipmaps, exact for any side a header holds. */
export function textureMemory(width: number, height: number): number {
  return Number((16n * BigInt(width) * BigInt(height)) / 3n);
}

function rx9(glb: Glb, input: FitInput, out: Problem[]): { textureBytes: number; maxTexturePx: number | null } {
  let textureBytes = 0;
  let maxTexturePx: number | null = null;
  glb.json.images?.forEach((image, i) => {
    if (image.bufferView === undefined) return;
    const bad = (path: string, reason: string): void => {
      out.push({ rule: "RX9", path, reason });
    };
    const at = `images[${i}]`;
    const read = readImage(glb.viewBytes(image.bufferView));
    const declared =
      image.mimeType !== undefined && Object.hasOwn(TEXTURE_TYPES, image.mimeType)
        ? TEXTURE_TYPES[image.mimeType]
        : undefined;
    if (image.mimeType === undefined) bad(at, REASON.mimeMissing);
    else if (declared === undefined) bad(`${at}.mimeType`, REASON.mimeOther);
    else if (read.format !== null && read.format !== declared) bad(`${at}.mimeType`, REASON.mimeMismatch);
    if (read.format === null) return bad(at, REASON.notAnImage);
    const h = read.header;
    if (h === null) return bad(at, REASON.imageUnreadable(read.format));
    if (h.format === "png" && (h.bitDepth !== 8 || !PNG_COLOUR_TYPES.includes(h.colorType))) bad(at, REASON.png);
    if (h.format === "jpeg") {
      if (!JPEG_HUFFMAN_FRAMES.includes(h.sof)) bad(at, REASON.jpegCoding);
      if (h.precision !== 8) bad(at, REASON.jpegPrecision);
      if (h.components !== 3) bad(at, REASON.jpegComponents);
    }
    if (h.format === "webp" && h.animated) bad(at, REASON.animated);
    if (!powerOfTwo(h.width) || !powerOfTwo(h.height)) bad(at, REASON.powerOfTwo(h.width, h.height));
    const limit = input.smallPropTexturePx;
    if (limit !== null && !(Math.max(h.width, h.height) <= limit)) bad(at, REASON.smallProp(h.width, h.height, limit));
    textureBytes += textureMemory(h.width, h.height);
    maxTexturePx = Math.max(maxTexturePx ?? 0, h.width, h.height);
  });
  return { textureBytes, maxTexturePx };
}

// --------------------------------------------------------------------------------------------------------------------
// RX10: baked light in a material
// --------------------------------------------------------------------------------------------------------------------
function rx10(glb: Glb, out: Problem[]): void {
  glb.json.materials?.forEach((m, i) => {
    const bad = (path: string, reason: string): void => {
      out.push({ rule: "RX10", path, reason });
    };
    const at = `materials[${i}]`;
    if (m.emissiveFactor !== undefined && m.emissiveFactor.some((x) => x !== 0))
      bad(`${at}.emissiveFactor`, REASON.emissive);
    if (m.emissiveTexture !== undefined) bad(`${at}.emissiveTexture`, REASON.emissiveTexture);
    if (m.extensions !== undefined && Object.hasOwn(m.extensions, EMISSIVE_STRENGTH)) {
      bad(`${at}.extensions.${EMISSIVE_STRENGTH}`, REASON.emissiveStrength);
    }
    if (m.occlusionTexture !== undefined) bad(`${at}.occlusionTexture`, REASON.occlusion);
  });
}
