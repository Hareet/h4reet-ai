// The compositor's outputs (spec 004; FR-010 to FR-014, FR-026, FR-058, FR-073, FR-079; Amendments B7, B9, C11; R-11,
// R-12, R-26, R-39; contracts/room-bundle.md §3 to §11). compose() calls `emit` once, after every family, with the
// loaded room, the policy, the options, the sorted findings, and its reader (the tree, and whether RT2 passed a
// string). Each output is built field by field in its schema's order, never spread from the data, so no † field can
// reach one; numbers are quantized (metres and every other measure to 1e-6, view-box units and CSS pixels to 1e-4, −0
// as 0); maps are written with their keys sorted bytewise, lists in the data's order; nothing comes from the machine.
// - A piece is set when its catalog entry names a model, main has the caps' room block, and no finding stands on the
//   file (RX or RK2, which lenient mode tolerates, or the catalog's own model entry); otherwise it keeps its stand-in,
//   with the reason no-model, no-caps, or findings (§6). Any finding lenient mode doesn't tolerate means the outputs
//   aren't to be used, and emit still never throws.
// - The index (§3.1), with the 2D drawing projected through framing(1.6) into the 320 × 200 view box, and the set
//   models the loader loads, which a room in 2D records as skipped (plan.md §10); the 3D part (§3.2), with the caps'
//   scene texture figure; the digest over both (§4); each set model's gzip-9 copy and each set card (§3.4); the drafts
//   modules (§3.3); room_text (§5); B7's manifest (§6, build/manifest.ts); the generated files, sorted by path (§7 and
//   §8 from build/manifest.ts, §9 from orders.ts), which compose() never writes; and the report (§10, report.ts).
// - The geometry is RG's production framing (checks/rg.ts's `geometry`, over the pieces this compose shows set): the
//   world transforms, the frame boxes, the cameras, the faces' screen_css, the 2D hit rectangles, and the cap ratios
//   are the numbers RG and RK3 checked, so the bundle can't carry a framing the checks didn't measure.
// Readings beside the contract's words:
// - A switch's pose is named `<switch>.<pose>` where a list names placements (`load_order`, the manifest's `standins`),
//   which no ID can equal. The shown pose is the case of the tier the room starts on: not-live while the live source is
//   off, else unknown. Every pose shows the switch's piece, so the 3D part's switch carries that piece's set model, as
//   a placement carries its own, and a pose in `load_order` resolves to it (plan.md §10).
// - The figures' placements show avatars, so they aren't stand-ins of their own; whether an avatar is a placeholder is
//   spec 003's files: the twin's GLB under assets/twin/, and each visitor's at assets/visitors/<avatar>/<avatar>.glb.
// - Spec 009's avatars (its FR-009, FR-013, FR-023, FR-037; plan.md §3.2): the 3D part's `figures` holds the scene's
//   block resolved and the twin's catalog height, and its `avatars` each bundled avatar (build/room/avatars.ts), whose
//   files' gzip-9 copies the plugin writes beside the room's models; the index's copy opens with the stand-in line.
// - The 2D drawing is each placement's front elevation in a plane square to the view at the farthest depth of its frame
//   box ("its depth"), so the shell's stands at its wall: at its origin pushed back to that depth, scaled by the
//   view-box units a metre takes there times its stylized scale, turned by its tilt in the view (its x axis against the
//   horizontal), and drawn back to front by that depth, placement order breaking ties. A selectable's 2D hit rectangles
//   are RG6's: its members' frame boxes projected through framing(1.6), which hold their drawings, with the depth of
//   each box's nearest corner. A stand-in's label sits LABEL_LIFT above its drawing's top; the visitor's cut-out stands
//   at its placement's origin.
import { createHash } from "node:crypto";

import { parse } from "yaml";

import { isAvatarId } from "../../src/choice/avatars";
import type { AvatarId } from "../../src/choice/avatars";
import type {
  Highlight,
  Look,
  Matrix2D,
  Prim,
  RoomIndex,
  RoomScene,
  SceneModel,
  Shape,
  Walking,
} from "../../src/room/compose/bundle";
import { cableControl } from "../../src/room/compose/cable";
import { FOV, framing, LABEL_LIFT } from "../../src/room/compose/framing";
import type { Box } from "../../src/room/compose/framing";
import { facePoint } from "../../src/room/compose/legibility";
import type { FaceGeometry } from "../../src/room/compose/legibility";
import { loadOrder } from "../../src/room/compose/load-order";
import type { LoadEntry } from "../../src/room/compose/load-order";
import { DEG, multiply, origin, rotation, scaling, transformPoint, translation } from "../../src/room/compose/math";
import type { Mat4, Turn, Vec3 } from "../../src/room/compose/math";
import { anchorWorld, mountWorld } from "../../src/room/compose/mount";
import { projector, toStage } from "../../src/room/compose/project";
import type { Camera, Projector } from "../../src/room/compose/project";
import { FLAT_VIEW } from "../../src/room/compose/stages";
import { TIER_VALUES, TYPEFACE_USES } from "../../src/room/compose/vocabulary";
import type { TierValue, TypefaceUse } from "../../src/room/compose/vocabulary";
import { atScale, fit, textureMemory } from "../../src/room/glb/fit";
import type { FitInput, Measures } from "../../src/room/glb/fit";
import { gzip9 } from "../../src/room/glb/gzip";
import { readImage } from "../../src/room/glb/images";
import { roomEventsFile, roomManifest, roomTopicsFile } from "../manifest";
import { avatarsOf, bundledFiles, twinGlbs, twinOf } from "./avatars";
import type { FigureBlock, TwinFileRole, TwinSet } from "./avatars";
import type { AvatarSet, FileRole } from "./avatars";
import { TWIN_DEFAULTS } from "./schema";
import { isTwinClipRole, TWIN_CLIPS_DEFAULT, TWIN_STATES } from "../../src/room/scene/twin-states";
import type { TwinClipRole, TwinState } from "../../src/room/scene/twin-states";
import type { TwinBlock } from "../../src/room/compose/bundle";
import { RULE_IDS } from "./checks/family";
import type { ComposeOptions, Finding } from "./checks/family";
import { faceScreens, flatFigures, flatMembers, geometry, lookTypefaces, sideWallsOf } from "./checks/rg";
import type { Geometry } from "./checks/rg";
import { MODELS_DIR } from "./checks/ri";
import { fillHints, indexHints } from "./hints";
import { resolvedHighlight } from "./checks/rw";
import type { ResolvedHighlight } from "./checks/rw";
import type { Loaded, LoadedRoom } from "./load";
import { PHOTO_GUIDE, photoGuide, workOrder, WORK_ORDERS_DIR } from "./orders";
import { capsOf } from "./policy";
import type { CapsSource, RoomCaps, RoomPolicy } from "./policy";
import { roomReport } from "./report";
import { HEX, HIGHLIGHT_DEFAULTS, WALKING_DEFAULTS } from "./schema";
import type {
  CatalogEntry,
  DrawingPrimitive,
  LookFile,
  Placement,
  Pose,
  Scene,
  StandinEntry,
  Switch,
  TurnOutcome,
} from "./schema";
import { compareBytewise } from "./source";
import type { Tree } from "./source";
import type { Typeface } from "./typefaces";

/** A fixture, typed by the signals: `virtual:room-fixtures` (§3.3). */
export interface RoomFixture {
  readonly id: string;
  readonly tier: TierValue;
  readonly turns: readonly TurnOutcome[];
}

/** The lookdev page's inputs: `virtual:room-lookdev` (§3.3). */
export interface RoomLookdev {
  readonly vignette: { readonly show: readonly string[] };
  readonly close_up: { readonly frame: readonly string[] };
  /** Spec 014 (FR-042; PD-24): the hands view's avatars, where lookdev.yaml lists any. */
  readonly hands?: { readonly avatars: readonly AvatarId[] };
  readonly looks: readonly Look[];
  /** Each piece's fit inputs: its expected bounds and live faces at the stylized scale, its budget, whether the caps
   *  list it as a small prop. */
  readonly pieces: Readonly<
    Record<
      string,
      {
        readonly fit: FitInput;
        readonly budget: {
          readonly gzip_bytes: number;
          readonly triangles: number;
          readonly texture_px: number;
          readonly texture_bytes: number;
        };
        readonly small_prop: boolean;
      }
    >
  >;
  /** The caps the compose read, or FR-053's starting figures. */
  readonly caps: RoomCaps;
  readonly caps_source: CapsSource;
}

/** `room-data.json`'s `room_text` (§5): published blocks and outlines, sorted by ID. */
export interface RoomText {
  readonly blocks: readonly {
    readonly id: string;
    readonly source: string;
    readonly sha256: string;
    readonly state: "approved" | "draft";
    readonly lines: readonly { readonly text: string }[];
    readonly outline?: {
      readonly view_box: readonly [number, number, number, number];
      readonly cap_height: number;
      readonly advance: number;
      readonly paths: readonly string[];
    };
  }[];
}

/** `room-manifest.json` (§6): spec 002's manifest with Amendment B7's fields. */
export interface RoomManifest {
  readonly objects: readonly {
    readonly id: string;
    readonly action: "talk" | "resume";
    readonly topic: string | null;
    readonly ready: boolean | null;
  }[];
  readonly free_talk: { readonly ready: boolean };
  readonly items: readonly string[];
  readonly avatars: readonly string[];
  readonly placeholders: boolean;
  readonly standins: readonly { readonly placement: string; readonly reason: "no-model" | "no-caps" | "findings" }[];
  readonly live_source: "off" | "site";
  readonly build_kind: "release" | "drafts";
  readonly caps: { readonly source: CapsSource; readonly sha256: string | null };
  readonly event_kinds: readonly string[];
}

/** FR-073's report (§10), as Markdown. */
export interface RoomReport {
  readonly markdown: string;
}

/** contracts/room-bundle.md §1's ComposeResult, but its findings, and with the set image cards beside the models. */
export interface RoomOutputs {
  readonly digest: string;
  readonly index: RoomIndex;
  readonly scene: RoomScene;
  /** Null unless the options say drafts. */
  readonly drafts: { readonly fixtures: readonly RoomFixture[]; readonly lookdev: RoomLookdev } | null;
  /** Each set model a placement or pose shows, once, by piece: `url` is the 3D part's `a/<stem>.<hash16>.glb`, and
   *  `gz`, its gzip-9 copy, lands at `dist/<url>.gz`, never beside a plain copy (§3.4); `sha256` is the plain file's. */
  readonly models: readonly {
    readonly piece: string;
    readonly url: string;
    readonly gz: Uint8Array;
    readonly sha256: string;
  }[];
  /** Each set image card, emitted plain at `dist/<url>` (§3.4). */
  readonly cards: readonly {
    readonly piece: string;
    readonly url: string;
    readonly bytes: Uint8Array;
    readonly sha256: string;
  }[];
  /** Spec 016 (FR-017, FR-048): each bundled file of the twin's, as the bundle names it: a GLB's gzip-9 copy as `data`,
   *  landing at `dist/<url>.gz`, and the still's plain bytes, landing at `dist/<url>`. */
  readonly twin: readonly {
    readonly role: TwinFileRole;
    readonly path: string;
    readonly url: string;
    readonly data: Uint8Array;
    readonly sha256: string;
  }[];
  /** Spec 009: each bundled avatar file, as the 3D part's `avatars` names it, its gzip-9 copy landing at `dist/<url>.gz`
   *  beside the room's models, never a plain copy (its FR-023; plan.md R-15). */
  readonly avatars: readonly {
    readonly avatar: AvatarId;
    readonly role: FileRole;
    /** The plain file's repository path. */
    readonly path: string;
    readonly url: string;
    readonly gz: Uint8Array;
    readonly sha256: string;
  }[];
  readonly roomText: RoomText;
  readonly manifest: RoomManifest;
  readonly generated: readonly { readonly path: string; readonly text: string }[];
  readonly report: RoomReport;
}

/** What emit reads beside the loaded room: the tree, for the models, the fonts, the resume, and the room text's bytes,
 *  and whether RT2 passed a string, so the report never prints one it refused. compose() passes its family context. */
export interface EmitReader {
  readonly tree: Tree;
  printable(value: string): boolean;
}

/** The outputs of one compose: the room as loaded, the policy as read, the options, the findings, sorted, and the
 *  reader. */
export type Emit = (
  room: LoadedRoom,
  policy: RoomPolicy,
  options: ComposeOptions,
  findings: readonly Finding[],
  reader: EmitReader,
) => RoomOutputs;

// ---- Numbers and serialization (§11) ----

/** A number on the grid of 1 ÷ `per`, −0 and a number that isn't finite written as 0. */
function quantize(n: number, per: number): number {
  const q = Math.round(n * per) / per;
  return Number.isFinite(q) && q !== 0 ? q : 0;
}
/** Metres, and every measure but view-box units and CSS pixels: to 1e-6. */
const m6 = (n: number): number => quantize(n, 1e6);
/** View-box units and CSS pixels: to 1e-4. */
const u4 = (n: number): number => quantize(n, 1e4);
const vec = (v: readonly number[]): [number, number, number] => [m6(v[0] ?? 0), m6(v[1] ?? 0), m6(v[2] ?? 0)];
const turnOf = (t: Turn | undefined): Turn => ({ x: m6(t?.x ?? 0), y: m6(t?.y ?? 0), z: m6(t?.z ?? 0) });
const boxOf = (b: Box): Box => ({ min: vec(b.min), max: vec(b.max) });
const point = (p: readonly [number, number]): [number, number] => [u4(p[0]), u4(p[1])];

/** §11's serialization: JSON with no whitespace, each object's fields in the order emit wrote them. */
export function serialize(value: unknown): string {
  return JSON.stringify(value);
}

const sha256 = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");
const sortedKeys = <T>(record: Readonly<Record<string, T>>): string[] => Object.keys(record).sort(compareBytewise);
/** A map written with its keys sorted bytewise, each value built by `f`. */
function sortedMap<T, U>(record: Readonly<Record<string, T>>, f: (value: T, key: string) => U): Record<string, U> {
  const out: Record<string, U> = {};
  for (const key of sortedKeys(record)) out[key] = f(record[key] as T, key);
  return out;
}

// ---- What every output reads ----

/** Where a piece's picture comes from: a set model, a set card, or its stand-in and why. */
export type Picture =
  | {
      readonly kind: "model";
      readonly file: string;
      readonly bytes: Uint8Array;
      readonly sha256: string;
      readonly url: string;
      readonly gz: Uint8Array;
      readonly measures: Measures;
      readonly bounds: Box;
    }
  | {
      readonly kind: "card";
      readonly file: string;
      readonly bytes: Uint8Array;
      readonly sha256: string;
      readonly url: string;
      readonly textureBytes: number;
    }
  | {
      readonly kind: "stand-in";
      readonly reason: "no-model" | "no-caps" | "findings";
      readonly rules: readonly string[];
    };

/** The composition every output reads: the room, the policy, and what emit computed once from them. */
export interface Composed {
  readonly room: LoadedRoom;
  readonly policy: RoomPolicy;
  readonly options: ComposeOptions;
  readonly findings: readonly Finding[];
  readonly reader: EmitReader;
  /** Main's caps, or FR-053's starting figures. */
  readonly caps: RoomCaps;
  readonly scene: Scene | null;
  readonly look: Loaded<LookFile> | null;
  /** Each piece by ID, the first entry where two share one (RI2's to report). */
  readonly pieces: ReadonlyMap<string, Loaded<CatalogEntry>>;
  /** Each placement by ID, the first where two share one. */
  readonly placements: ReadonlyMap<string, Placement>;
  readonly pictures: ReadonlyMap<string, Picture>;
  /** The placements whose `role` makes them figures. */
  readonly figures: ReadonlySet<string>;
  /** Spec 009's avatars, as build/room/avatars.ts read them for this compose. */
  readonly avatars: AvatarSet;
  /** Spec 016's twin, as build/room/avatars.ts's readTwin read it for this compose. */
  readonly twin: TwinSet;
  /** RG's geometry over the pieces set here, whose numbers RG and RK3 checked, its reference cameras among them; null
   *  without a scene. */
  readonly geometry: Geometry | null;
  /** Each resolved placement's world transform. */
  readonly world: ReadonlyMap<string, Mat4>;
  /** Each resolved placement's frame box (§3.2). */
  readonly frames: ReadonlyMap<string, Box>;
  /** The 2D drawing's camera, framing(1.6) over the framed boxes. */
  readonly flatCamera: Camera;
  /** The index's typefaces, their cap ratios to 1e-6. */
  readonly typefaces: readonly Typeface[];
  /** Whether a placement shows its piece's stand-in: no set picture, and not a figure. */
  standin(placement: Placement): boolean;
  /** A pose's world transform, its parent resolved and its anchor found; null otherwise. */
  poseWorld(pose: Pose): Mat4 | null;
  /** A placement's anchor in the world; null where either doesn't resolve. */
  anchorPoint(placement: string, anchor: string): Vec3 | null;
}

const ZERO_BOX: Box = { min: [0, 0, 0], max: [0, 0, 0] };
const UP: Vec3 = [0, 1, 0];

/** A box's eight corners. */
function corners(b: Box): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}

/** The world box of a box under a transform: its eight corners' bounds. */
function worldBox(m: Mat4, b: Box): Box {
  const points = corners(b).map((p) => transformPoint(m, p));
  const axis = (i: 0 | 1 | 2, f: (...values: number[]) => number): number => f(...points.map((p) => p[i]));
  return {
    min: [axis(0, Math.min), axis(1, Math.min), axis(2, Math.min)],
    max: [axis(0, Math.max), axis(1, Math.max), axis(2, Math.max)],
  };
}

const scaled = (b: Box, s: number): Box => ({
  min: [b.min[0] * s, b.min[1] * s, b.min[2] * s],
  max: [b.max[0] * s, b.max[1] * s, b.max[2] * s],
});

/** A catalog live face's geometry, its `up` +Y where the data leaves it out. */
const faceGeometry = (f: CatalogEntry["live_faces"][number]): FaceGeometry => ({
  at: f.at,
  size: f.size,
  facing: f.facing,
  up: f.up ?? UP,
});

/** The fit inputs of a piece at its stylized scale (contracts/plain-model-fit.md §5). */
function fitInput(entry: CatalogEntry, caps: RoomCaps): FitInput {
  const small = caps.small_props.includes(entry.id) ? caps.small_prop_texture_px : null;
  return atScale(
    {
      bounds: entry.origin.bounds,
      faces: entry.live_faces.map((f) => ({ role: f.role, ...faceGeometry(f) })),
      scale: entry.stylized_scale,
    },
    small,
  );
}

/** The rules of findings, once each, in the catalogue's order. */
const rulesOf = (findings: readonly Finding[]): string[] =>
  [...new Set(findings.map((f) => f.rule))].sort((a, b) => RULE_IDS.indexOf(a as never) - RULE_IDS.indexOf(b as never));

/** A piece's picture: set, or its stand-in and why (§6). */
function pictureOf(c: Loaded<CatalogEntry>, policy: RoomPolicy, findings: readonly Finding[], tree: Tree): Picture {
  const model = c.value.model;
  if (!model) return { kind: "stand-in", reason: "no-model", rules: [] };
  if (policy.caps === null) return { kind: "stand-in", reason: "no-caps", rules: [] };
  const name = model.file ?? model.card ?? "";
  const path = `${MODELS_DIR}/${name}`;
  const against = findings.filter((f) => f.file === path || (f.file === c.file && /^model(\.|$)/.test(f.path)));
  if (against.length > 0) return { kind: "stand-in", reason: "findings", rules: rulesOf(against) };
  const bytes = tree.read(path);
  if (bytes === null) return { kind: "stand-in", reason: "findings", rules: [] };
  const digest = sha256(bytes);
  const dot = name.lastIndexOf(".");
  const url = `a/${name.slice(0, dot)}.${digest.slice(0, 16)}${name.slice(dot)}`;
  if (model.file === undefined) {
    const header = readImage(bytes).header;
    const textureBytes = header ? textureMemory(header.width, header.height) : 0;
    return { kind: "card", file: name, bytes, sha256: digest, url, textureBytes };
  }
  const gz = gzip9(bytes);
  const measures = fit(bytes, fitInput(c.value, capsOf(policy)), { file: path, gzipBytes: gz.length }).measures;
  if (measures.bounds === null) return { kind: "stand-in", reason: "findings", rules: [] };
  return { kind: "model", file: name, bytes, sha256: digest, url, gz, measures, bounds: measures.bounds };
}

/** The composition, computed once. */
function prepare(
  room: LoadedRoom,
  policy: RoomPolicy,
  options: ComposeOptions,
  findings: readonly Finding[],
  reader: EmitReader,
): Composed {
  const scene = room.scene?.value ?? null;
  const caps = capsOf(policy);
  const pieces = new Map<string, Loaded<CatalogEntry>>();
  for (const c of room.catalog) if (!pieces.has(c.value.id)) pieces.set(c.value.id, c);
  const placements = new Map<string, Placement>();
  for (const p of scene?.placements ?? []) if (!placements.has(p.id)) placements.set(p.id, p);
  const look = room.looks.find((l) => l.value.id === scene?.look) ?? null;
  const pictures = new Map<string, Picture>();
  for (const [id, c] of pieces) pictures.set(id, pictureOf(c, policy, findings, reader.tree));
  const figures = new Set((scene?.placements ?? []).filter((p) => p.role !== undefined).map((p) => p.id));
  const standin = (p: Placement): boolean =>
    !figures.has(p.id) && (pictures.get(p.piece)?.kind ?? "stand-in") === "stand-in";

  // RG's geometry over the pieces this compose shows set, which are rx.ts's `setModels` in any build whose outputs are
  // used: a model frames by its measured bounds, a card by its expected ones.
  const set = new Map<string, Box | null>();
  for (const [id, p] of pictures) if (p.kind !== "stand-in") set.set(id, p.kind === "model" ? p.bounds : null);
  const g = geometry(room, set);
  const world = g?.resolved.world ?? new Map<string, Mat4>();

  const anchorPoint = (id: string, name: string): Vec3 | null => {
    const p = placements.get(id);
    const w = world.get(id);
    const entry = p && pieces.get(p.piece)?.value;
    const anchor = entry && Object.hasOwn(entry.anchors, name) ? entry.anchors[name] : undefined;
    return w && entry && anchor ? origin(anchorWorld(w, entry.stylized_scale, anchor)) : null;
  };
  const poseWorld = (pose: Pose): Mat4 | null => {
    const parent = placements.get(pose.mount.on);
    const w = parent && world.get(parent.id);
    const entry = parent && pieces.get(parent.piece)?.value;
    const anchor = entry && Object.hasOwn(entry.anchors, pose.mount.anchor) ? entry.anchors[pose.mount.anchor] : null;
    return w && entry && anchor
      ? mountWorld(w, entry.stylized_scale, anchor, pose.mount.offset, pose.mount.turn)
      : null;
  };

  return {
    room,
    policy,
    options,
    findings,
    reader,
    caps,
    scene,
    look,
    pieces,
    placements,
    pictures,
    figures,
    avatars: avatarsOf(reader.tree, policy, scene),
    twin: twinOf(reader.tree, policy, scene),
    geometry: g,
    world,
    frames: g?.boxes ?? new Map<string, Box>(),
    flatCamera: g?.flat ?? framing(FLAT_VIEW.w / FLAT_VIEW.h, []),
    typefaces: lookTypefaces(room, reader.tree),
    standin,
    poseWorld,
    anchorPoint,
  };
}

// ---- Colours ----

/** A colour by value: a palette name of the scene's look resolved, `#rrggbb` kept, `none` kept, or else `fallback`. */
function colour(c: Composed, value: string, fallback: string): string {
  if (value === "none" || HEX.test(value)) return value;
  const palette = c.look?.value.palette ?? {};
  return Object.hasOwn(palette, value) ? (palette[value] as string) : fallback;
}

// ---- The 2D drawing (§3.1's flat; R-39) ----

const ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/** Path data's commands and numbers, an arc's two flags read as single digits as SVG reads them; null off §8's
 *  grammar. */
function pathTokens(d: string): (string | number)[] | null {
  const out: (string | number)[] = [];
  let [at, command, count] = [0, "", 0];
  while (at < d.length) {
    const ch = d[at] as string;
    if (ch === " " || ch === ",") at += 1;
    else if (/[MmZzLlHhVvCcSsQqTtAa]/.test(ch)) {
      out.push(ch);
      [command, count, at] = [ch.toUpperCase(), 0, at + 1];
    } else if (command === "A" && (count % 7 === 3 || count % 7 === 4)) {
      if (ch !== "0" && ch !== "1") return null;
      out.push(Number(ch));
      [count, at] = [count + 1, at + 1];
    } else {
      NUMBER.lastIndex = at;
      const m = NUMBER.exec(d);
      if (!m) return null;
      out.push(Number(m[0]));
      [count, at] = [count + 1, NUMBER.lastIndex];
    }
  }
  return out;
}

/** Path data scaled by `k` with y flipped, in view-box units: a drawing's metres, y up, to the view box's y down. An
 *  arc's radii scale, its rotation turns the other way, and its sweep flips. Null off §8's grammar. */
export function viewPath(d: string, k: number): string | null {
  const tokens = pathTokens(d);
  if (tokens === null) return null;
  const parts: string[] = [];
  let [command, index] = ["", 0];
  for (const t of tokens) {
    if (typeof t === "string") {
      parts.push(t);
      [command, index] = [t.toUpperCase(), 0];
      continue;
    }
    const arity = ARITY[command] ?? 2;
    const at = arity === 0 ? 0 : index % arity;
    index += 1;
    let v: number;
    if (command === "H") v = u4(t * k);
    else if (command === "V") v = u4(-t * k);
    else if (command === "A") v = at === 2 ? m6(-t) : at === 3 ? t : at === 4 ? 1 - t : u4(at === 6 ? -t * k : t * k);
    else v = u4(at % 2 === 0 ? t * k : -t * k);
    parts.push(String(v));
  }
  return parts.join(" ");
}

type Bounds2 = [number, number, number, number];
const grow = (b: Bounds2, x: number, y: number): void => {
  b[0] = Math.min(b[0], x);
  b[1] = Math.min(b[1], y);
  b[2] = Math.max(b[2], x);
  b[3] = Math.max(b[3], y);
};

/** An arc's ellipse's bounds, by SVG's endpoint-to-centre conversion (SVG 1.1, F.6.5): the arc lies within them. */
function arcBounds(b: Bounds2, from: [number, number], to: [number, number], a: readonly number[]): void {
  let [rx, ry] = [Math.abs(a[0] ?? 0), Math.abs(a[1] ?? 0)];
  grow(b, ...to);
  if (rx === 0 || ry === 0) return;
  const phi = (a[2] ?? 0) * DEG;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const [dx, dy] = [(from[0] - to[0]) / 2, (from[1] - to[1]) / 2];
  const [x1, y1] = [cos * dx + sin * dy, -sin * dx + cos * dy];
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];
  const sign = (a[3] ?? 0) === (a[4] ?? 0) ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = sign * Math.sqrt(Math.max(0, den === 0 ? 0 : num / den));
  const [cx1, cy1] = [(coef * rx * y1) / ry, (-coef * ry * x1) / rx];
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;
  const hx = Math.sqrt(rx * rx * cos * cos + ry * ry * sin * sin);
  const hy = Math.sqrt(rx * rx * sin * sin + ry * ry * cos * cos);
  grow(b, cx - hx, cy - hy);
  grow(b, cx + hx, cy + hy);
}

/** Path data's bounds: every end and control point, a smooth curve's reflected one, and each arc's ellipse. */
function pathBounds(d: string, b: Bounds2): void {
  const tokens = pathTokens(d) ?? [];
  let cur: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  let ctrl: [number, number] = [0, 0];
  let command = "";
  let args: number[] = [];
  const flush = (): void => {
    const rel = command === command.toLowerCase();
    const C = command.toUpperCase();
    const abs = (i: number): [number, number] =>
      rel ? [cur[0] + (args[i] ?? 0), cur[1] + (args[i + 1] ?? 0)] : [args[i] ?? 0, args[i + 1] ?? 0];
    const smooth: [number, number] = [2 * cur[0] - ctrl[0], 2 * cur[1] - ctrl[1]];
    let end: [number, number] = cur;
    if (C === "M" || C === "L" || C === "T") {
      end = abs(0);
      if (C === "T") grow(b, ...smooth);
      if (C === "M") start = end;
      ctrl = C === "T" ? smooth : end;
    } else if (C === "H") end = [rel ? cur[0] + (args[0] ?? 0) : (args[0] ?? 0), cur[1]];
    else if (C === "V") end = [cur[0], rel ? cur[1] + (args[0] ?? 0) : (args[0] ?? 0)];
    else if (C === "C" || C === "Q") {
      const n = C === "C" ? 3 : 2;
      for (let i = 0; i < n - 1; i += 1) grow(b, ...abs(2 * i));
      ctrl = abs(2 * (n - 2));
      end = abs(2 * (n - 1));
    } else if (C === "S") {
      grow(b, ...smooth);
      grow(b, ...abs(0));
      ctrl = abs(0);
      end = abs(2);
    } else if (C === "A") {
      end = rel ? [cur[0] + (args[5] ?? 0), cur[1] + (args[6] ?? 0)] : [args[5] ?? 0, args[6] ?? 0];
      arcBounds(b, cur, end, args);
    }
    if (C !== "C" && C !== "Q" && C !== "S" && C !== "T" && C !== "M" && C !== "L") ctrl = end;
    grow(b, ...end);
    cur = end;
  };
  for (const t of tokens) {
    if (typeof t === "string") {
      command = t;
      args = [];
      if (t === "Z" || t === "z") {
        cur = start;
        ctrl = start;
      }
      continue;
    }
    args.push(t);
    const arity = ARITY[command.toUpperCase()] ?? 0;
    if (arity > 0 && args.length === arity) {
      flush();
      args = [];
      // After a move, the pairs that follow are lines, as SVG reads them.
      if (command === "M") command = "L";
      else if (command === "m") command = "l";
    }
  }
}

/** Path data's bounds, `[x0, y0, x1, y1]`, as a hit rectangle takes them; null for data that draws nothing. */
export function pathExtent(d: string): [number, number, number, number] | null {
  const b: Bounds2 = [Infinity, Infinity, -Infinity, -Infinity];
  pathBounds(d, b);
  return Number.isFinite(b[0]) ? b : null;
}

/** A primitive's bounds in its own view-box units. */
function primBounds(p: Prim, b: Bounds2): void {
  switch (p.primitive) {
    case "rect":
      grow(b, p.x, p.y);
      grow(b, p.x + p.w, p.y + p.h);
      return;
    case "circle":
      grow(b, p.cx - p.r, p.cy - p.r);
      grow(b, p.cx + p.r, p.cy + p.r);
      return;
    case "ellipse":
      grow(b, p.cx - p.rx, p.cy - p.ry);
      grow(b, p.cx + p.rx, p.cy + p.ry);
      return;
    case "line":
      grow(b, p.x1, p.y1);
      grow(b, p.x2, p.y2);
      return;
    case "polyline":
    case "polygon":
      for (const [x, y] of p.points) grow(b, x, y);
      return;
    case "path":
      pathBounds(p.d, b);
  }
}

/** A drawing primitive in the piece's metres, y up, as view-box units at `k` a metre, y down, colours resolved. */
function viewPrim(c: Composed, p: DrawingPrimitive, k: number): Prim | null {
  const paint = {
    fill: colour(c, p.fill, "none"),
    stroke: colour(c, p.stroke, "none"),
    stroke_width: u4(p.stroke_width * k),
  };
  const x = (n: number): number => u4(n * k);
  const y = (n: number): number => u4(-n * k);
  const length = (n: number): number => u4(Math.abs(n) * k);
  switch (p.primitive) {
    case "rect": {
      const [x0, w] = p.w < 0 ? [p.x + p.w, -p.w] : [p.x, p.w];
      const [y0, h] = p.h < 0 ? [p.y + p.h, -p.h] : [p.y, p.h];
      return { ...paint, primitive: "rect", x: x(x0), y: y(y0 + h), w: length(w), h: length(h) };
    }
    case "circle":
      return { ...paint, primitive: "circle", cx: x(p.cx), cy: y(p.cy), r: length(p.r) };
    case "ellipse":
      return { ...paint, primitive: "ellipse", cx: x(p.cx), cy: y(p.cy), rx: length(p.rx), ry: length(p.ry) };
    case "line":
      return { ...paint, primitive: "line", x1: x(p.x1), y1: y(p.y1), x2: x(p.x2), y2: y(p.y2) };
    case "polyline":
    case "polygon":
      return { ...paint, primitive: p.primitive, points: p.points.map(([a, b]) => [x(a), y(b)]) };
    case "path": {
      const d = viewPath(p.d, k);
      return d === null ? null : { ...paint, primitive: "path", d };
    }
  }
}

/** A stand-in shape's own transform: T(at) · R(turn) · S(scale). */
function shapeFrame(s: StandinEntry): Mat4 {
  const v = scaleOf(s);
  const stretch: Mat4 = [v[0], 0, 0, 0, 0, v[1], 0, 0, 0, 0, v[2], 0, 0, 0, 0, 1];
  return multiply(multiply(translation(s.at), rotation(s.turn)), stretch);
}
const scaleOf = (s: StandinEntry): Vec3 =>
  s.scale === undefined ? [1, 1, 1] : typeof s.scale === "number" ? [s.scale, s.scale, s.scale] : s.scale;

/** The front elevation of a stand-in shape (contracts/room-data-files.md §4.2): a box, cylinder, capsule, or plane as
 *  a rectangle (the bounds of its turned and scaled corners), a sphere or circle as a circle (an ellipse when scaled
 *  unevenly), a torus as a ring, a tube as a line of its radius, a polygon as itself. */
function elevation(s: StandinEntry, fill: string): DrawingPrimitive {
  const frame = shapeFrame(s);
  const [sx, sy] = scaleOf(s).map(Math.abs) as [number, number, number];
  const solid = { fill, stroke: "none", stroke_width: 0 } as const;
  const ring = (width: number) => ({ fill: "none", stroke: fill, stroke_width: width }) as const;
  const rect = (half: Vec3): DrawingPrimitive => {
    const b: Bounds2 = [Infinity, Infinity, -Infinity, -Infinity];
    for (const x of [-half[0], half[0]])
      for (const y of [-half[1], half[1]])
        for (const z of [-half[2], half[2]]) {
          const p = transformPoint(frame, [x, y, z]);
          grow(b, p[0], p[1]);
        }
    return { primitive: "rect", x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1], ...solid };
  };
  switch (s.shape) {
    case "box":
      return rect([s.size[0] / 2, s.size[1] / 2, s.size[2] / 2]);
    case "cylinder":
      return rect([s.radius, s.height / 2, s.radius]);
    case "capsule":
      return rect([s.radius, s.length / 2 + s.radius, s.radius]);
    case "plane":
      return rect([s.size[0] / 2, s.size[1] / 2, 0]);
    case "sphere":
    case "circle":
      return sx === sy
        ? { primitive: "circle", cx: s.at[0], cy: s.at[1], r: s.radius * sx, ...solid }
        : { primitive: "ellipse", cx: s.at[0], cy: s.at[1], rx: s.radius * sx, ry: s.radius * sy, ...solid };
    case "torus":
      return {
        primitive: "circle",
        cx: s.at[0],
        cy: s.at[1],
        r: s.radius * Math.max(sx, sy),
        ...ring(2 * s.tube * Math.max(sx, sy)),
      };
    case "tube": {
      const [a, b] = [transformPoint(frame, s.from), transformPoint(frame, s.to)];
      return { primitive: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1], ...ring(2 * s.radius * Math.max(sx, sy)) };
    }
    case "polygon":
      return {
        primitive: "polygon",
        points: s.points.map(([x, y]) => {
          const p = transformPoint(frame, [x, y, 0]);
          return [p[0], p[1]] as [number, number];
        }),
        ...solid,
      };
  }
}

/** A piece's drawing, in its metres, y up: its own primitives, or its stand-in's elevation. */
function drawingOf(c: Composed, entry: CatalogEntry): DrawingPrimitive[] {
  if (entry.drawing?.primitives) return entry.drawing.primitives;
  if (entry.drawing?.from === "standin") return entry.standin.map((s) => elevation(s, colour(c, s.color, "none")));
  return [];
}

/** Where a drawing goes in the view box: its matrix, its scale, and its depth. */
interface Placed {
  readonly matrix: Matrix2D;
  /** View-box units a metre of the piece's drawing takes: the pixels per metre at its depth times its scale. */
  readonly k: number;
  /** View-box units a world metre takes at its depth. */
  readonly ppm: number;
}

/** View-box units a world metre takes at a depth in front of the 2D camera. */
const ppmAt = (depth: number): number => FLAT_VIEW.h / 2 / (depth * Math.tan((FOV / 2) * DEG));

/** Where a drawing goes: its placement's origin, pushed back along the view to the farthest depth of its box, the
 *  drawing's plane; scaled by the view-box units a metre takes there times the piece's stylized scale; turned by the
 *  tilt of its x axis in the view. So the shell's elevation stands at its wall, and a piece's at its back. */
function place(view: Projector, world: Mat4, scale: number, box: Box): Placed {
  const o = origin(world);
  const far = depths(view, box).far;
  const [x, y] = toStage(view.project([o[0], o[1], o[2] - (far - view.depth(o))]), FLAT_VIEW);
  const ppm = ppmAt(far);
  const tilt = Math.atan2(world[1], Math.hypot(world[0], world[2]));
  const [cos, sin] = [Math.cos(tilt), Math.sin(tilt)];
  return { matrix: [u4(cos), u4(-sin), u4(sin), u4(cos), u4(x), u4(y)], k: ppm * scale, ppm };
}

/** 2D affine matrices composed: `b` first, then `a`. */
const compose2 = (a: Matrix2D, b: Matrix2D): Matrix2D => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply2 = (m: Matrix2D, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** A drawing's bounds in the view box, through its matrix; its origin where it holds nothing. */
function viewBounds(prims: readonly Prim[], matrix: Matrix2D): Bounds2 {
  const own: Bounds2 = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of prims) primBounds(p, own);
  if (!Number.isFinite(own[0])) return [matrix[4], matrix[5], matrix[4], matrix[5]];
  const out: Bounds2 = [Infinity, Infinity, -Infinity, -Infinity];
  for (const x of [own[0], own[2]]) for (const y of [own[1], own[3]]) grow(out, ...apply2(matrix, x, y));
  return out;
}

/** A box's nearest and farthest depths in front of a camera. */
function depths(view: Projector, b: Box): { near: number; far: number } {
  const all = corners(b).map((p) => view.depth(p));
  return { near: Math.min(...all), far: Math.max(...all) };
}

/** §3.1's `flat`: the 2D room through framing(1.6), in the 320 × 200 view box. */
function flatOf(c: Composed, faces: readonly RoomIndex["faces"][number][]): RoomIndex["flat"] {
  const view = projector(c.flatCamera, FLAT_VIEW.w / FLAT_VIEW.h);
  const inView = (p: Vec3): [number, number] => point(toStage(view.project(p), FLAT_VIEW));
  const drawn = new Map<string, { placed: Placed; prims: Prim[]; bounds: Bounds2 }>();
  const order: { id: string; far: number; index: number }[] = [];
  (c.scene?.placements ?? []).forEach((p, index) => {
    const entry = c.pieces.get(p.piece)?.value;
    const world = c.world.get(p.id);
    if (!entry || !world || p.role === "visitor" || drawn.has(p.id)) return;
    const box = c.frames.get(p.id) ?? ZERO_BOX;
    const placed = place(view, world, entry.stylized_scale, box);
    const prims = drawingOf(c, entry).flatMap((d) => viewPrim(c, d, placed.k) ?? []);
    drawn.set(p.id, { placed, prims, bounds: viewBounds(prims, placed.matrix) });
    order.push({ id: p.id, far: depths(view, box).far, index });
  });
  order.sort((a, b) => b.far - a.far || a.index - b.index);
  const items = order.map(({ id }) => {
    const d = drawn.get(id) as { placed: Placed; prims: Prim[] };
    return { placement: id, matrix: d.placed.matrix, primitives: d.prims };
  });

  const poses: RoomIndex["flat"]["poses"] = [];
  for (const sw of c.scene?.switches ?? []) {
    const entry = c.pieces.get(sw.piece)?.value;
    if (!entry) continue;
    for (const [name, pose] of Object.entries(sw.poses)) {
      const world = c.poseWorld(pose);
      if (!world) continue;
      const picture = c.pictures.get(sw.piece);
      const box =
        picture?.kind === "model"
          ? worldBox(world, picture.bounds)
          : worldBox(multiply(world, scaling(entry.stylized_scale)), entry.origin.bounds);
      const placed = place(view, world, entry.stylized_scale, box);
      const lead = sw.cable && Object.hasOwn(entry.anchors, sw.cable.from) ? entry.anchors[sw.cable.from] : undefined;
      const to = sw.cable && c.anchorPoint(sw.cable.to.placement, sw.cable.to.anchor);
      let cable: RoomIndex["flat"]["poses"][number]["cable"] = null;
      if (sw.cable && lead && to) {
        const from = origin(anchorWorld(world, entry.stylized_scale, lead));
        cable = { from: inView(from), control: inView(cableControl(from, to, sw.cable.sag)), to: inView(to) };
      }
      poses.push({
        switch: sw.id,
        pose: name,
        matrix: placed.matrix,
        primitives: drawingOf(c, entry).flatMap((d) => viewPrim(c, d, placed.k) ?? []),
        cable,
      });
    }
  }

  const frames: RoomIndex["flat"]["faces"] = [];
  for (const face of faces) {
    const d = drawn.get(face.placement);
    const p = c.placements.get(face.placement);
    const live = p && c.pieces.get(p.piece)?.value.live_faces.find((f) => f.role === face.role);
    // The shirt's face is drawn only on the twin's own model, never in 2D (spec 016, FR-041).
    if (!d || !live || live.surface === "model") continue;
    const geometry = faceGeometry(live);
    const local = (u: number, v: number): [number, number] => {
      const q = facePoint(geometry, u, v);
      return [q[0] * d.placed.k, -q[1] * d.placed.k];
    };
    const [tl, tr, bl] = [local(0, 0), local(1, 0), local(0, 1)];
    const size: [number, number] = [live.size[0] * d.placed.k, live.size[1] * d.placed.k];
    const across: [number, number] = size[0] > 0 ? [(tr[0] - tl[0]) / size[0], (tr[1] - tl[1]) / size[0]] : [1, 0];
    const down: [number, number] = size[1] > 0 ? [(bl[0] - tl[0]) / size[1], (bl[1] - tl[1]) / size[1]] : [0, 1];
    const matrix = compose2(d.placed.matrix, [across[0], across[1], down[0], down[1], tl[0], tl[1]]);
    frames.push({ face: face.id, matrix: matrix.map(u4) as Matrix2D, size: [u4(size[0]), u4(size[1])] });
  }

  // The member rectangles RG6 checked, already on the bundle's grid.
  const members = c.geometry ? flatMembers(c.geometry) : [];
  const hits = (c.scene?.selectables ?? []).map((x, k) => ({
    selectable: x.id,
    rects: (members[k] ?? []).map(
      ({ rect }) => [rect[0], rect[1], rect[2], rect[3]] as [number, number, number, number],
    ),
    depths: (members[k] ?? []).map(({ depth }) => depth),
  }));

  const labels: RoomIndex["flat"]["labels"] = [];
  for (const p of c.scene?.placements ?? []) {
    const d = drawn.get(p.id);
    if (!d || p.label === undefined || !c.standin(p) || labels.some((l) => l.placement === p.id)) continue;
    const [x0, y0, x1] = d.bounds;
    labels.push({ placement: p.id, label: p.label, at: point([(x0 + x1) / 2, y0 - LABEL_LIFT * d.placed.ppm]) });
  }

  const handoff = c.scene?.handoff;
  const from = handoff && c.anchorPoint(handoff.from.placement, handoff.from.anchor);
  const to = handoff && c.anchorPoint(handoff.to.placement, handoff.to.anchor);
  const middle: Vec3 | null =
    from && to ? [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + PAPER_ARC, (from[2] + to[2]) / 2] : null;
  const paper = (p: Vec3 | null | undefined): [number, number] => (p ? inView(p) : [0, 0]);
  const visitor = (c.scene?.placements ?? []).find((p) => p.role === "visitor");
  const feet = visitor && c.world.get(visitor.id);
  const at = feet ? origin(feet) : null;

  return {
    view_box: [0, 0, FLAT_VIEW.w, FLAT_VIEW.h],
    items,
    poses,
    faces: frames,
    hits,
    figures: c.geometry ? flatFigures(c.geometry) : [],
    labels,
    papers: [paper(from), paper(middle), paper(to)],
    visitor: at
      ? { x: inView(at)[0], baseline: inView(at)[1], scale: u4(ppmAt(view.depth(at))) }
      : { x: 0, baseline: 0, scale: 0 },
    // Spec 008's highlight, the scene's look's, resolved for the 2D drawing (FR-046; Amendment M12).
    highlight: highlightOf(c.look?.value),
  };
}

/** The paper's arc over the hand-off, in metres: spec 002's scene.ts raises it this much at its middle. */
const PAPER_ARC = 0.35;

// ---- The index (§3.1) ----

type Region = NonNullable<Placement["faces"]>[string]["regions"][number];
type IndexRegion = RoomIndex["faces"][number]["regions"][number];

function regionOf(r: Region): IndexRegion {
  const g = r.grid ?? {};
  const grid: IndexRegion["grid"] =
    r.renderer === "terminal" || r.renderer === "desktop-session"
      ? { cols: g.cols ?? 1, rows: g.rows ?? 1 }
      : r.renderer === "chalk"
        ? { rows: g.rows ?? 1 }
        : r.renderer === "neon"
          ? { chars: g.chars ?? 1 }
          : null;
  const source: IndexRegion["source"] =
    r.text !== undefined
      ? { room_text: r.text }
      : r.resume_titles
        ? { resume_titles: true }
        : r.ui !== undefined
          ? { ui: [...r.ui] }
          : { signal: "turn-cost", part: r.part ?? "call" };
  return { rect: [m6(r.rect[0]), m6(r.rect[1]), m6(r.rect[2]), m6(r.rect[3])], renderer: r.renderer, grid, source };
}

/** Each bound face, in RG's order, with RG's on-screen size, by which RK3 sized its canvas. Where a corner falls behind
 *  a reference camera, or its placement doesn't resolve, its size is unknown and RK3 counts its whole canvas, its px:
 *  its screen_css is then its px, so a runtime's min(px, screen_css × the pixel ratio) is px at any ratio of 1 or more,
 *  as RK3's canvas is (plan.md §10). */
function facesOf(c: Composed): RoomIndex["faces"] {
  const out: RoomIndex["faces"] = [];
  for (const { placement, role, screen } of c.geometry ? faceScreens(c.geometry) : []) {
    const p = c.placements.get(placement);
    const binding = p?.faces?.[role];
    const live = p && c.pieces.get(p.piece)?.value.live_faces.find((f) => f.role === role);
    if (!binding || !live) continue;
    out.push({
      id: `${placement}.${role}`,
      placement,
      role,
      readable: live.readable,
      label: binding.label,
      atmosphere: binding.atmosphere,
      max_chars: binding.max_chars ?? null,
      px: [live.px[0], live.px[1]],
      screen_css: screen ? point(screen) : [live.px[0], live.px[1]],
      regions: binding.regions.map(regionOf),
      // Spec 016 (FR-036; Amendment M18): a face drawn into its avatar's own mesh, which no quad or 2D frame shows.
      ...(live.surface === "model" ? { surface: "model" as const } : {}),
    });
  }
  return out;
}

/** A switch's pose for each tier value: its case's, or its default. */
function casesOf(sw: Switch): Record<TierValue, string> {
  const out: Partial<Record<TierValue, string>> = {};
  for (const value of TIER_VALUES) {
    const pose = Object.hasOwn(sw.cases, value) ? sw.cases[value] : sw.default;
    if (pose !== undefined) out[value] = pose;
  }
  return out as Record<TierValue, string>;
}

/** A switch's claims in the index (§3.1; T163), only where its piece declares claims: the pose that claims local and
 *  the one that claims cloud, the first by name where two claim one (RS2's to refuse). A pose missing for either is
 *  RS3's refusal; it is written as "", a pose no case names, so the runtime reads the claims as not-live. */
function claimsOf(piece: CatalogEntry | undefined): { claims?: { local: string; cloud: string } } {
  const poses = piece?.claims?.poses;
  if (!poses) return {};
  const named = (value: TierValue): string =>
    Object.keys(poses)
      .sort()
      .find((pose) => poses[pose] === value) ?? "";
  return { claims: { local: named("local"), cloud: named("cloud") } };
}

/** The text copy's order (§3.1): the twin's line slot, the bound faces, the switches, the sign's figures, and the
 *  fixed lines. Spec 016 (FR-014; contracts/twin-data.md §4): the slot, first, which the room resolves to the twin's
 *  line while its own picture shows and to spec 009's stand-in line otherwise (spec 009's FR-013, as M9 amends it). */
function copyOf(faces: RoomIndex["faces"], switches: RoomIndex["switches"]): RoomIndex["copy"] {
  const regions = faces.flatMap((f) => f.regions);
  const has = (test: (r: IndexRegion) => boolean): boolean => regions.some(test);
  return [
    { twin_line: true as const },
    ...faces.map((f) => ({ face: f.id })),
    ...switches.map((s) => ({ switch: s.id })),
    ...(has((r) => "signal" in r.source) ? [{ figures: true as const }] : []),
    ...(has((r) => r.renderer === "terminal" || r.renderer === "desktop-session")
      ? [{ line: "around.illustration" }]
      : []),
    ...(has((r) => r.renderer === "neon") ? [{ line: "sign.not_affiliated" }] : []),
    { line: "pause.paused_at" },
  ];
}

/** A set model's URL in the 3D part, `a/<stem>.<hash16>.glb`, its stem its record's file stem. */
const MODEL_URL = /^a\/(.+)\.[0-9a-f]{16}\.glb$/;

/**
 * The index's `models` (§3.1, plan.md §10): each set model the room's loader loads, by its asset events' `asset`, in
 * the 3D part's load_order, once a piece. As src/room/scene/loader.ts's modelEntries reads them, which bundle.test.ts
 * holds it to: a placement's model, or for a switch's pose, `<switch>.<pose>`, the switch's own; a GLB alone, since an
 * image card waits for its drawing; its asset its URL's stem.
 */
function loadedModels(part: Pick<RoomScene, "placements" | "switches" | "load_order">): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of part.load_order) {
    const dot = id.indexOf(".");
    const shows =
      dot < 0 ? part.placements.find((p) => p.id === id) : part.switches.find((s) => s.id === id.slice(0, dot));
    const url = shows?.model?.url;
    if (!shows || url === undefined || !url.endsWith(".glb") || seen.has(shows.piece)) continue;
    seen.add(shows.piece);
    out.push(MODEL_URL.exec(url)?.[1] ?? shows.piece);
  }
  return out;
}

/** The index without its digest. */
function indexBody(c: Composed, placeholders: boolean, models: readonly string[]): Omit<RoomIndex, "digest"> {
  const scene = c.scene;
  const live = scene?.live;
  const words = c.room.ui?.value.words ?? {};
  const faces = facesOf(c);
  const switches: RoomIndex["switches"] = (scene?.switches ?? []).map((sw) => ({
    id: sw.id,
    signal: "tier" as const,
    label: sw.label,
    cases: casesOf(sw),
    ...claimsOf(c.pieces.get(sw.piece)?.value),
  }));
  // FR-064's carve-out (see listOnly): the side-wall selectables, read from the scene's mounts.
  const sideWall = c.geometry === null ? [] : sideWallsOf(c.geometry);
  const flat = flatOf(c, faces);
  return {
    schema: 1,
    build: { kind: c.options.drafts ? "drafts" : "release", placeholders },
    live: {
      source: live?.source ?? "off",
      turn: live?.turn ?? "off",
      asset_events: live?.asset_events ?? "off",
      poll_ms: (live?.poll_s ?? 30) * 1000,
      freshness_ms: (live?.freshness_s ?? 35) * 1000,
    },
    ui: sortedMap(words, (w) => (typeof w === "string" ? w : w.text)),
    selectables: (scene?.selectables ?? []).map((x, k) => ({
      id: x.id,
      name: x.name,
      members: [...x.members],
      action: x.action.talk ? { kind: "talk" as const, topic: x.action.talk.topic } : { kind: "resume" as const },
      ...(x.emblem !== undefined ? { emblem: x.emblem } : {}),
      side_wall: sideWall[k] ?? false,
    })),
    // Ready only as the twin's readiness says, by FR-030's rule (spec 007, FR-037); nothing without it.
    topics: (c.room.topics?.value.topics ?? []).map((t) => ({
      id: t.id,
      phrase: t.phrase,
      ready: c.options.readiness?.topics.get(t.id) ?? false,
    })),
    faces,
    switches,
    flat,
    copy: copyOf(faces, switches),
    typefaces: c.typefaces.map((t) => ({
      use: t.use,
      family: t.family,
      weight: t.weight,
      cap_ratio: t.cap_ratio,
      fallback: t.fallback,
    })),
    models: [...models],
    // Spec 012's hints, filled from the configuration and the UI words, those whose slot couldn't be filled (RT17) or
    // whose `when` isn't met left out (its FR-032, FR-033).
    hints: indexHints(
      fillHints(c.room.hints?.value ?? null, c.reader.tree, words),
      c.options.readiness?.freeTalk ?? false,
    ),
    twin: twinIndexOf(c, flat),
  };
}

// ---- Spec 016's twin (its FR-014, FR-015, FR-034, FR-044, FR-048, FR-054; contracts/twin-data.md §1, §4) ----

/** The twin's block resolved: the scene's values, each key's default where it gives none; the lean null where the
 *  scene gives none. */
export function twinBlockOf(scene: Scene | null, texturePx: number): TwinBlock {
  const block = scene?.figures.twin;
  const clips = {} as Record<TwinState, TwinClipRole>;
  // A role RI8 refuses keeps the state's default, so a lenient reading never carries one outside the closed list.
  for (const state of TWIN_STATES) {
    const named = block?.clips?.[state];
    clips[state] = named !== undefined && isTwinClipRole(named) ? named : TWIN_CLIPS_DEFAULT[state];
  }
  const speak = block?.speak_s;
  return {
    clips,
    rest_after_s: block?.rest_after_s ?? TWIN_DEFAULTS.rest_after_s,
    speak_wpm: block?.speak_wpm ?? TWIN_DEFAULTS.speak_wpm,
    speak_s: speak && speak.length === 2 ? [speak[0] as number, speak[1] as number] : [...TWIN_DEFAULTS.speak_s],
    lean: block?.lean
      ? { against: block.lean.against, behind_m: m6(block.lean.behind_m), right_m: m6(block.lean.right_m) }
      : null,
    texture_px: texturePx,
  };
}

/** The still's rectangle (FR-034; D2): the scene's, else the twin figure's box's width at its top, at the still's 3:4. */
function stillRect(c: Composed): [number, number, number, number] {
  const given = c.scene?.figures.twin?.still?.rect;
  if (given && given.length === 4) return given.map(m6) as [number, number, number, number];
  const twin = c.scene?.placements.find((p) => p.role === "twin");
  const bounds = twin ? c.pieces.get(twin.piece)?.value.origin.bounds : undefined;
  if (!bounds) return [0, 0, 0, 0];
  const w = bounds.max[0] - bounds.min[0];
  const h = (w * 4) / 3;
  return [m6(bounds.min[0]), m6(bounds.max[1] - h), m6(w), m6(h)];
}

/** The index's twin: its line and its still, where the twin's line was read and its model or its still is bundled. */
function twinIndexOf(c: Composed, flat: RoomIndex["flat"]): RoomIndex["twin"] {
  const { line, still, model } = c.twin;
  if (line === null || !(model?.bundled || still?.bundled)) return null;
  const rect = stillRect(c);
  // The still's rectangle in the 2D drawing's view box (plan.md R-11, as built): its corners through the twin figure's
  // drawing's matrix, the compositor's projection, so the 2D room draws it with no projection of its own.
  const placement = c.scene?.placements.find((p) => p.role === "twin")?.id ?? "";
  const item = flat.items.find((i) => i.placement === placement);
  const view = (): [number, number, number, number] => {
    if (!item) return [0, 0, 0, 0];
    const [a, b, cc, d, e, f] = item.matrix;
    const at = (x: number, y: number): [number, number] => [a * x + cc * y + e, b * x + d * y + f];
    const [p, q] = [at(rect[0], rect[1]), at(rect[0] + rect[2], rect[1] + rect[3])];
    return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])].map(m6) as [
      number,
      number,
      number,
      number,
    ];
  };
  return {
    line: line.line,
    still: still?.bundled
      ? { url: still.url, sha256: still.sha256, bytes: still.bytes, rect, view: view(), placement }
      : null,
  };
}

/** The 3D part's twin: its model, its bundled clips in the closed list's order, and its block; null where its model
 *  isn't bundled. */
function twinPartOf(c: Composed): RoomScene["twin"] {
  const files = twinGlbs(c.twin);
  const model = files[0];
  if (!model) return null;
  const clips: Partial<Record<TwinClipRole, { url: string; sha256: string; bytes: number }>> = {};
  for (const clip of files.slice(1))
    clips[clip.role as TwinClipRole] = { url: clip.url, sha256: clip.sha256, bytes: clip.gz?.length ?? 0 };
  return {
    model: {
      url: model.url,
      sha256: model.sha256,
      bytes: model.gz?.length ?? 0,
      texture_bytes: model.measures?.kind === "glb" ? model.measures.decoded_bytes : 0,
    },
    clips,
    block: (() => {
      // RA7 left the lean out of a lenient build (FR-029): the twin rests in its idle.
      const block = twinBlockOf(c.scene, c.twin.texture_px);
      return c.findings.some((f) => f.rule === "RA7") ? { ...block, lean: null } : block;
    })(),
  };
}

// ---- The 3D part (§3.2) ----

/** A stand-in shape resolved: its turn and scale filled in, its colour by value. */
function shapeOf(c: Composed, s: StandinEntry): Shape {
  const common = {
    at: vec(s.at),
    turn: turnOf(s.turn),
    scale: vec(scaleOf(s)),
    color: colour(c, s.color, "#000000"),
    lit: s.lit,
  };
  switch (s.shape) {
    case "box":
      return { ...common, shape: "box", size: vec(s.size) };
    case "cylinder":
      return { ...common, shape: "cylinder", radius: m6(s.radius), height: m6(s.height) };
    case "capsule":
      return { ...common, shape: "capsule", radius: m6(s.radius), length: m6(s.length) };
    case "sphere":
      return { ...common, shape: "sphere", radius: m6(s.radius) };
    case "torus":
      return { ...common, shape: "torus", radius: m6(s.radius), tube: m6(s.tube) };
    case "plane":
      return { ...common, shape: "plane", size: [m6(s.size[0]), m6(s.size[1])] };
    case "circle":
      return { ...common, shape: "circle", radius: m6(s.radius) };
    case "tube":
      return { ...common, shape: "tube", from: vec(s.from), to: vec(s.to), radius: m6(s.radius) };
    case "polygon":
      return { ...common, shape: "polygon", points: s.points.map(([x, y]) => [m6(x), m6(y)]), depth: m6(s.depth) };
  }
}

function pieceOf(c: Composed, entry: CatalogEntry): RoomScene["pieces"][string] {
  const faces: Record<string, CatalogEntry["live_faces"][number]> = {};
  for (const f of entry.live_faces) if (!Object.hasOwn(faces, f.role)) faces[f.role] = f;
  const glows: Record<string, CatalogEntry["glows"][number]> = {};
  for (const g of entry.glows) if (!Object.hasOwn(glows, g.id)) glows[g.id] = g;
  return {
    scale: m6(entry.stylized_scale),
    anchors: sortedMap(entry.anchors, (a) => ({ at: vec(a.at), turn: turnOf(a.turn) })),
    standin: entry.standin.map((s) => shapeOf(c, s)),
    faces: sortedMap(faces, (f) => ({
      at: vec(f.at),
      size: [m6(f.size[0]), m6(f.size[1])] as [number, number],
      facing: vec(f.facing),
      up: vec(f.up ?? UP),
    })),
    // A disc glow's centre and radius, or since spec 014 a path glow's points and spread (its FR-045).
    glows: sortedMap(glows, (g) => ({
      ...(g.path === undefined
        ? { at: vec(g.at ?? [0, 0, 0]), radius: m6(g.radius ?? 0) }
        : { path: g.path.map(vec), spread: m6(g.spread ?? 0) }),
      tone: g.tone,
      motion: g.motion,
      level: m6(g.level),
    })),
  };
}

/** The look without its material notes (room-data-files.md §10). */
function lookOf(look: LookFile | undefined): Look {
  const typefaces = {} as Record<TypefaceUse, { family: string; weight: number }>;
  for (const use of TYPEFACE_USES) {
    const t = look?.typefaces[use];
    typefaces[use] = { family: t?.family ?? "", weight: t?.weight ?? 400 };
  }
  const lights = look?.lights;
  return {
    version: 1,
    id: look?.id ?? "",
    method: look?.method ?? "flat",
    palette: sortedMap(look?.palette ?? {}, (v) => v),
    lights: {
      ambient: {
        sky: lights?.ambient.sky ?? "#000000",
        ground: lights?.ambient.ground ?? "#000000",
        intensity: m6(lights?.ambient.intensity ?? 0),
      },
      key: {
        color: lights?.key.color ?? "#000000",
        intensity: m6(lights?.key.intensity ?? 0),
        from: vec(lights?.key.from ?? UP),
        shadows: lights?.key.shadows ?? false,
      },
    },
    shading: { steps: look?.shading.steps ?? 2 },
    outlines: { color: look?.outlines.color ?? "#000000", width: m6(look?.outlines.width ?? 0) },
    glow_tones: sortedMap(look?.glow_tones ?? {}, (t) => ({ color: t.color, intensity: m6(t.intensity) })),
    typefaces,
    highlight: highlightOf(look),
  };
}

/**
 * Spec 008's highlight of a look, resolved against the look's own palette by RW2's own function (FR-015, FR-057; plan.md
 * §3.2): each colour a palette name of the look or #rrggbb, the edge the look's ink, its outlines' colour, where the
 * look leaves it out, and Q5's band and widths where it leaves them out. A name RI4 refuses falls to black, as a
 * stand-in's colour does; with no look, Q5's band on a black edge.
 */
function highlightOf(look: LookFile | undefined): Highlight {
  const given: ResolvedHighlight = look ? resolvedHighlight(look) : { ...HIGHLIGHT_DEFAULTS, edge: null };
  return {
    band: given.band ?? "#000000",
    band_px: m6(given.band_px),
    edge: given.edge ?? "#000000",
    edge_px: m6(given.edge_px),
  };
}

/** The pose each switch shows as the room starts: not-live's case while the live source is off, else unknown's. */
function shownPose(c: Composed, sw: Switch): string | undefined {
  return casesOf(sw)[c.scene?.live.source === "site" ? "unknown" : "not-live"];
}

/** A placement's or a pose's ID where a list names placements: a pose's is `<switch>.<pose>`. */
const poseId = (sw: Switch, pose: string): string => `${sw.id}.${pose}`;

/** The set picture a piece shows, by its file, or null while it shows its stand-in. */
function setFile(c: Composed, piece: string): string | null {
  const picture = c.pictures.get(piece);
  return picture && picture.kind !== "stand-in" ? picture.file : null;
}

function sceneBody(c: Composed): Omit<RoomScene, "digest"> {
  const scene = c.scene;
  const used = new Set([
    ...(scene?.placements ?? []).map((p) => p.piece),
    ...(scene?.switches ?? []).map((s) => s.piece),
  ]);
  const pieces: RoomScene["pieces"] = {};
  for (const id of [...used].sort(compareBytewise)) {
    const entry = c.pieces.get(id)?.value;
    if (entry) pieces[id] = pieceOf(c, entry);
  }
  const memberOf = new Map<string, number>();
  (scene?.selectables ?? []).forEach((x, i) => {
    for (const m of x.members) if (!memberOf.has(m)) memberOf.set(m, i);
  });
  const entries: LoadEntry[] = [
    ...(scene?.placements ?? []).map((p) => ({
      id: p.id,
      model: c.figures.has(p.id) ? null : setFile(c, p.piece),
      framed: p.frame,
      selectable: memberOf.get(p.id) ?? null,
      shown: true,
    })),
    ...(scene?.switches ?? []).flatMap((sw) =>
      Object.keys(sw.poses).map((name) => ({
        id: poseId(sw, name),
        model: setFile(c, sw.piece),
        framed: false,
        selectable: null,
        shown: name === shownPose(c, sw),
      })),
    ),
  ];
  const twin = scene?.placements.find((p) => p.role === "twin");
  const visitor = scene?.placements.find((p) => p.role === "visitor");
  return {
    schema: 1,
    pieces,
    placements: (scene?.placements ?? []).map((p) => ({
      id: p.id,
      piece: p.piece,
      mount: p.mount ? { on: p.mount.on, anchor: p.mount.anchor } : null,
      offset: vec(p.mount?.offset ?? [0, 0, 0]),
      turn: turnOf(p.mount?.turn),
      framed: p.frame,
      frame_box: boxOf(c.frames.get(p.id) ?? ZERO_BOX),
      label: p.label ?? null,
      model: modelOf(c, p),
    })),
    switches: (scene?.switches ?? []).map((sw) => ({
      id: sw.id,
      piece: sw.piece,
      poses: sortedMap(sw.poses, (pose) => ({
        mount: {
          on: pose.mount.on,
          anchor: pose.mount.anchor,
          offset: vec(pose.mount.offset),
          turn: turnOf(pose.mount.turn),
        },
        glows: pose.glows.map((g) => ({ placement: g.placement, glow: g.glow, level: m6(g.level) })),
      })),
      cable: sw.cable
        ? {
            from: sw.cable.from,
            to: { placement: sw.cable.to.placement, anchor: sw.cable.to.anchor },
            sag: m6(sw.cable.sag),
            radius: m6(sw.cable.radius),
            drop: m6(sw.cable.drop),
            rest: sw.cable.rest ? { placement: sw.cable.rest.placement, anchor: sw.cable.rest.anchor } : null,
          }
        : null,
      model: setModel(c, sw.piece),
    })),
    look: lookOf(c.look?.value),
    figures: {
      twin: twin?.id ?? "",
      visitor: visitor?.id ?? "",
      // Spec 009's block, resolved (its FR-037; plan.md §3.2), and the twin's catalog height, its stand-in's target
      // (FR-016), since the part's pieces carry no size (plan.md §10).
      stand_in: c.avatars.figures.stand_in,
      texture_px: c.avatars.figures.texture_px,
      wait_ms: c.avatars.figures.wait_ms,
      twin_height: m6((twin && c.pieces.get(twin.piece)?.value.size.h) ?? 0),
      // Spec 014 (FR-039): the grips, each avatar of the table's and each hand's, as the scene gives them.
      ...(c.avatars.figures.grips === undefined ? {} : { grips: gripsOf(c.avatars.figures.grips) }),
    },
    handoff: {
      from: { placement: scene?.handoff.from.placement ?? "", anchor: scene?.handoff.from.anchor ?? "" },
      to: { placement: scene?.handoff.to.placement ?? "", anchor: scene?.handoff.to.anchor ?? "" },
    },
    load_order: loadOrder(entries),
    scene_texture_bytes: c.caps.scene_texture_bytes,
    walking: walkingOf(scene),
    avatars: avatarsPart(c),
    twin: twinPartOf(c),
  };
}

/** Spec 008's walking block, resolved, each figure to 1e-6 (Amendment M12): the spec's defaults where the scene leaves
 *  it out, or has none. */
function walkingOf(scene: Scene | null): Walking {
  const w = scene?.walking ?? WALKING_DEFAULTS;
  return {
    speed_mps: m6(w.speed_mps),
    turn_dps: m6(w.turn_dps),
    tilt_dps: m6(w.tilt_dps),
    radius_m: m6(w.radius_m),
    reach_m: m6(w.reach_m),
    reach_cone_deg: m6(w.reach_cone_deg),
    camera: {
      yaw_deg: m6(w.camera.yaw_deg),
      pitch_deg: [m6(w.camera.pitch_deg[0]), m6(w.camera.pitch_deg[1])],
      min_distance_m: m6(w.camera.min_distance_m),
      focus_height_m: m6(w.camera.focus_height_m),
    },
  };
}

/** Spec 009's `avatars` (its FR-009, FR-023, FR-024; plan.md §3.2): each avatar whose model is bundled, its keys sorted
 *  bytewise, with its model's URL, SHA-256, served bytes, and texture memory at texture_px, and its bundled clips by
 *  role. */
function avatarsPart(c: Composed): RoomScene["avatars"] {
  const out: Record<string, RoomScene["avatars"][AvatarId]> = {};
  for (const avatar of [...c.avatars.avatars].sort((a, b) => compareBytewise(a.id, b.id))) {
    const files = bundledFiles(avatar);
    const model = files[0];
    if (!model) continue;
    const clips: Record<string, { url: string; sha256: string; bytes: number }> = {};
    for (const clip of files.slice(1).sort((a, b) => compareBytewise(String(a.role), String(b.role))))
      clips[String(clip.role)] = { url: clip.url, sha256: clip.sha256, bytes: clip.gz?.length ?? 0 };
    out[avatar.id] = {
      model: {
        url: model.url,
        sha256: model.sha256,
        bytes: model.gz?.length ?? 0,
        texture_bytes: model.measures?.decoded_bytes ?? 0,
      },
      clips,
    };
  }
  return out;
}

/** A placement's model (§3.2), or null while it shows its stand-in, or an avatar, as a figure's does. */
function modelOf(c: Composed, p: Placement): SceneModel | null {
  return c.figures.has(p.id) ? null : setModel(c, p.piece);
}

/** A piece's set model as the 3D part gives it to a placement or a switch (§3.2), or null while it shows its
 *  stand-in. */
function setModel(c: Composed, piece: string): SceneModel | null {
  const picture = c.pictures.get(piece);
  const entry = c.pieces.get(piece)?.value;
  if (!picture || !entry) return null;
  if (picture.kind === "model")
    return {
      url: picture.url,
      sha256: picture.sha256,
      bytes: picture.gz.length,
      bounds: boxOf(picture.bounds),
      texture_bytes: picture.measures.textureBytes ?? 0,
    };
  if (picture.kind === "card")
    return {
      url: picture.url,
      sha256: picture.sha256,
      bytes: picture.bytes.length,
      bounds: boxOf(scaled(entry.origin.bounds, entry.stylized_scale)),
      texture_bytes: picture.textureBytes,
    };
  return null;
}

// ---- The drafts modules (§3.3), room_text (§5), and the manifest's parts (§6) ----

function fixtureOf(f: { id: string; tier: TierValue; turns: readonly TurnOutcome[] }): RoomFixture {
  return {
    id: f.id,
    tier: f.tier,
    turns: f.turns.map((t): TurnOutcome => {
      switch (t.outcome) {
        case "reply":
          return { outcome: "reply", route: t.route, cost_micro_usd: t.cost_micro_usd };
        case "refused":
          return { outcome: "refused", status: t.status };
        default:
          return { outcome: t.outcome };
      }
    }),
  };
}

function lookdevOf(c: Composed): RoomLookdev {
  const pieces: Record<string, RoomLookdev["pieces"][string]> = {};
  for (const id of [...c.pieces.keys()].sort(compareBytewise)) {
    const entry = (c.pieces.get(id) as Loaded<CatalogEntry>).value;
    const input = fitInput(entry, c.caps);
    pieces[id] = {
      fit: {
        bounds: boxOf(input.bounds),
        faces: input.faces.map((f) => ({
          role: f.role,
          at: vec(f.at),
          size: [m6(f.size[0]), m6(f.size[1])],
          facing: vec(f.facing),
          up: vec(f.up),
        })),
        smallPropTexturePx: input.smallPropTexturePx,
      },
      budget: {
        gzip_bytes: entry.budget.gzip_bytes,
        triangles: entry.budget.triangles,
        texture_px: entry.budget.texture_px,
        texture_bytes: entry.budget.texture_bytes,
      },
      small_prop: input.smallPropTexturePx !== null,
    };
  }
  const lookdev = c.room.lookdev?.value;
  return {
    vignette: { show: [...(lookdev?.vignette.show ?? [])] },
    close_up: { frame: [...(lookdev?.close_up.frame ?? [])] },
    ...(lookdev?.hands ? { hands: { avatars: lookdev.hands.avatars.filter(isAvatarId) } } : {}),
    looks: c.room.looks.map((l) => lookOf(l.value)),
    pieces,
    caps: {
      gzip_bytes: c.caps.gzip_bytes,
      triangles: c.caps.triangles,
      small_props: [...c.caps.small_props],
      small_prop_texture_px: c.caps.small_prop_texture_px,
      scene_texture_bytes: c.caps.scene_texture_bytes,
      legibility_floor_css_px: c.caps.legibility_floor_css_px,
    },
    caps_source: c.policy.caps_source,
  };
}

function roomTextOf(c: Composed): RoomText {
  const approved = new Set(c.policy.approvals.filter((a) => a.kind === "room-text").map((a) => a.sha256));
  const blocks: RoomText["blocks"][number][] = [];
  const add = (file: string, make: (sha: string, state: "approved" | "draft") => RoomText["blocks"][number]): void => {
    const bytes = c.reader.tree.read(file);
    if (bytes === null) return;
    const sha = sha256(bytes);
    const state = approved.has(sha) ? "approved" : "draft";
    if (state === "approved" || c.options.drafts) blocks.push(make(sha, state));
  };
  for (const b of c.room.blocks)
    add(b.file, (sha, state) => ({
      id: b.value.block,
      source: b.file,
      sha256: sha,
      state,
      lines: b.value.lines.filter((l) => !l.pending).map((l) => ({ text: l.text })),
    }));
  for (const o of c.room.outlines)
    add(o.file, (sha, state) => {
      const [x, y, w, h] = o.value.view_box;
      return {
        id: o.value.sign,
        source: o.file,
        sha256: sha,
        state,
        lines: [{ text: o.value.words }],
        outline: {
          view_box: [u4(x), u4(y), u4(w), u4(h)],
          cap_height: u4(o.value.cap_height),
          advance: u4(o.value.advance ?? w),
          paths: [...o.value.paths],
        },
      };
    });
  return { blocks: blocks.sort((a, b) => compareBytewise(a.id, b.id)) };
}

/** The placements and poses that show a stand-in, in scene order, and why (§6). The figures show avatars. */
function standinsOf(c: Composed): RoomManifest["standins"] {
  const reason = (piece: string): "no-model" | "no-caps" | "findings" | null => {
    const picture = c.pictures.get(piece);
    return picture === undefined ? "no-model" : picture.kind === "stand-in" ? picture.reason : null;
  };
  const out: { placement: string; reason: "no-model" | "no-caps" | "findings" }[] = [];
  for (const p of c.scene?.placements ?? []) {
    const why = reason(p.piece);
    if (why !== null && !c.figures.has(p.id)) out.push({ placement: p.id, reason: why });
  }
  for (const sw of c.scene?.switches ?? []) {
    const why = reason(sw.piece);
    if (why !== null) for (const name of Object.keys(sw.poses)) out.push({ placement: poseId(sw, name), reason: why });
  }
  return out;
}

const ITEM_ID = /^[a-z][a-z0-9-]{1,40}$/;

/** The resume's item IDs, in order, once each: spec 002's manifest's items; none where the source doesn't read. */
function itemIds(tree: Tree): string[] {
  const data = tree.read("apps/web/content/resume.yaml");
  if (data === null) return [];
  let doc: unknown;
  try {
    doc = parse(new TextDecoder().decode(data)) as unknown;
  } catch {
    return [];
  }
  const sections = (doc as { sections?: unknown } | null)?.sections;
  const ids: string[] = [];
  for (const section of Array.isArray(sections) ? sections : []) {
    const items = (section as { items?: unknown } | null)?.items;
    for (const item of Array.isArray(items) ? items : []) {
      const id = (item as { id?: unknown } | null)?.id;
      if (typeof id === "string" && ITEM_ID.test(id) && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

// ---- emit ----

export const emit: Emit = (room, policy, options, findings, reader) => {
  const c = prepare(room, policy, options, findings, reader);
  const standins = standinsOf(c);
  // Spec 014 (FR-053; PD-17; Amendment W11): the room's stand-ins alone; the page adds a piece that falls back, and the
  // visitor's figure says its own words.
  const placeholders = standins.length > 0;
  const scenePart = sceneBody(c);
  const indexPart = indexBody(c, placeholders, loadedModels(scenePart));
  const digest = sha256(`${serialize(indexPart)}\n${serialize(scenePart)}`);
  const { schema: indexSchema, ...indexRest } = indexPart;
  const { schema: sceneSchema, ...sceneRest } = scenePart;
  const index: RoomIndex = { schema: indexSchema, digest, ...indexRest };
  const scene: RoomScene = { schema: sceneSchema, digest, ...sceneRest };

  const used = new Set(Object.keys(scene.pieces));
  const shown = [...c.pictures].filter(([piece]) => used.has(piece)).sort(([a], [b]) => compareBytewise(a, b));
  const models = shown.flatMap(([piece, p]) =>
    p.kind === "model" ? [{ piece, url: p.url, gz: p.gz, sha256: p.sha256 }] : [],
  );
  const cards = shown.flatMap(([piece, p]) =>
    p.kind === "card" ? [{ piece, url: p.url, bytes: p.bytes, sha256: p.sha256 }] : [],
  );
  const avatars = c.avatars.avatars.flatMap((avatar) =>
    bundledFiles(avatar).flatMap((f) =>
      f.gz !== null && f.role !== null
        ? [{ avatar: avatar.id, role: f.role, path: f.path, url: f.url, gz: f.gz, sha256: f.sha256 }]
        : [],
    ),
  );

  // Spec 016: the twin's served files, by the index's and the 3D part's names, where they bundle them.
  const twin = [
    ...(scene.twin ? twinGlbs(c.twin) : []).flatMap((f) =>
      f.gz !== null && f.role !== null
        ? [{ role: f.role, path: f.path, url: f.url, data: f.gz, sha256: f.sha256 }]
        : [],
    ),
    ...(index.twin?.still && c.twin.still
      ? [
          {
            role: "still" as const,
            path: c.twin.still.path,
            url: c.twin.still.url,
            data: reader.tree.read(c.twin.still.path) ?? new Uint8Array(),
            sha256: c.twin.still.sha256,
          },
        ]
      : []),
  ];

  const manifest = roomManifest({
    index,
    freeTalkReady: options.readiness?.freeTalk ?? false,
    standins,
    caps: { source: policy.caps_source, sha256: policy.caps_sha256 },
    items: itemIds(reader.tree),
  });
  const topics = new Map((room.topics?.value.topics ?? []).map((t) => [t.id, t]));
  const generated = [
    { path: "config/room-events.yaml", text: roomEventsFile(manifest) },
    {
      path: "config/room-topics.yaml",
      text: roomTopicsFile(
        (c.scene?.selectables ?? []).flatMap((x) =>
          x.action.talk
            ? [
                {
                  id: x.id,
                  topic: x.action.talk.topic,
                  corpus: topics.get(x.action.talk.topic)?.corpus ?? [],
                  lead: x.action.talk.lead ?? null,
                },
              ]
            : [],
        ),
      ),
    },
    { path: PHOTO_GUIDE, text: photoGuide(c) },
    ...[...c.pieces.values()].map((entry) => ({
      path: `${WORK_ORDERS_DIR}/${entry.value.id}.md`,
      text: workOrder(c, entry),
    })),
  ].sort((a, b) => compareBytewise(a.path, b.path));

  return {
    digest,
    index,
    scene,
    drafts: options.drafts ? { fixtures: room.fixtures.map((f) => fixtureOf(f.value)), lookdev: lookdevOf(c) } : null,
    models,
    cards,
    avatars,
    twin,
    roomText: roomTextOf(c),
    manifest,
    generated,
    report: roomReport(c, digest, index),
  };
};

/** The scene's grips as the 3D part carries them (spec 014, FR-039): only the table's avatars and the two hands, which
 *  RD7 holds the data to, each number on the bundle's grid. */
function gripsOf(grips: NonNullable<FigureBlock["grips"]>): NonNullable<RoomScene["figures"]["grips"]> {
  type GripIn = { readonly at: readonly [number, number, number]; readonly turn: Turn };
  const out: NonNullable<RoomScene["figures"]["grips"]> = {};
  for (const [avatar, hands] of Object.entries(grips) as [string, Readonly<Record<string, GripIn>>][]) {
    if (!isAvatarId(avatar)) continue;
    const entry: Partial<Record<"right" | "left", { at: Vec3; turn: Turn }>> = {};
    for (const hand of ["right", "left"] as const) {
      const g = hands[hand];
      if (g)
        entry[hand] = {
          at: [m6(g.at[0]), m6(g.at[1]), m6(g.at[2])],
          turn: { x: m6(g.turn.x), y: m6(g.turn.y), z: m6(g.turn.z) },
        };
    }
    out[avatar] = entry;
  }
  return out;
}
