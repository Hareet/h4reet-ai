// The bundle's types (spec 004; FR-010, FR-011, FR-058; R-11, R-12; data-model.md §10.1, §10.2): the index, which spec
// 002's `virtual:room-content` exports as `room` into the entry chunk for the 2D room, the lists, and the text copy,
// and the 3D part, `virtual:room-scene`'s default export in the lazy 3D chunk. Exactly contracts/room-bundle.md §3.1's
// RoomIndex and §3.2's RoomScene: the compositor writes them field by field in this order (§11), and the room, the
// lookdev page, and the tests read them. Types only, so nothing here reaches a chunk.
import type { Box } from "./framing";
import type { Turn, Vec3 } from "./math";
import type { GlowMotion, LookMethod, Renderer, TierValue, TypefaceUse } from "./vocabulary";

export type { Box, Turn, Vec3 };

/** SVG's matrix(a, b, c, d, e, f): `[a, b, c, d, e, f]`. */
export type Matrix2D = [number, number, number, number, number, number];

/** A drawing primitive's paint: colours resolved to `#rrggbb`, or `none`. */
interface Paint {
  fill: string;
  stroke: string;
  stroke_width: number;
}

/**
 * contracts/room-data-files.md §4.2's primitives in view-box units, colours resolved to `#rrggbb` or `none`: no text,
 * link, or style, and a path's data in §8's grammar.
 */
export type Prim = Paint &
  (
    | { primitive: "rect"; x: number; y: number; w: number; h: number }
    | { primitive: "circle"; cx: number; cy: number; r: number }
    | { primitive: "ellipse"; cx: number; cy: number; rx: number; ry: number }
    | { primitive: "line"; x1: number; y1: number; x2: number; y2: number }
    | { primitive: "polyline"; points: [number, number][] }
    | { primitive: "polygon"; points: [number, number][] }
    | { primitive: "path"; d: string }
  );

/**
 * A stand-in shape (contracts/room-data-files.md §4.1), in its piece's frame at scale 1: its centre, turn, and scale
 * resolved (0 and 1 where the data leaves them out), its colour resolved to `#rrggbb`, and whether it's lit.
 */
export type Shape = { at: Vec3; turn: Turn; scale: Vec3; color: string; lit: boolean } & (
  | { shape: "box"; size: Vec3 }
  | { shape: "cylinder"; radius: number; height: number }
  | { shape: "capsule"; radius: number; length: number }
  | { shape: "sphere"; radius: number }
  | { shape: "torus"; radius: number; tube: number }
  | { shape: "plane"; size: [number, number] }
  | { shape: "circle"; radius: number }
  | { shape: "tube"; from: Vec3; to: Vec3; radius: number }
  | { shape: "polygon"; points: [number, number][]; depth: number }
);

/** A look (contracts/room-data-files.md §10), without `material_notes`, which reaches only the work orders. */
export interface Look {
  version: 1;
  id: string;
  method: LookMethod;
  palette: Record<string, string>;
  lights: {
    ambient: { sky: string; ground: string; intensity: number };
    key: { color: string; intensity: number; from: Vec3; shadows: boolean };
  };
  shading: { steps: number };
  outlines: { color: string; width: number };
  glow_tones: Record<string, { color: string; intensity: number }>;
  typefaces: Record<TypefaceUse, { family: string; weight: number }>;
}

/** The index, in the entry chunk: at most 16 KB gzipped (contracts/room-bundle.md §3.1). */
export interface RoomIndex {
  schema: 1;
  digest: string;
  build: { kind: "release" | "drafts"; placeholders: boolean };
  live: {
    source: "off" | "site";
    turn: "off" | "site";
    asset_events: "off" | "site";
    poll_ms: number;
    freshness_ms: number;
  };
  /** Every UI word's text, by key, slots unfilled. */
  ui: Record<string, string>;
  /** In scene order; no lead. */
  selectables: {
    id: string;
    name: string;
    members: string[];
    action: { kind: "talk"; topic: string } | { kind: "resume" };
    /** Every member hangs directly on the shell's side-wall anchors: FR-064's carve-out (see listOnly) may leave it
     *  to the "In the room" list at any stage where its core can't fit. */
    side_wall: boolean;
  }[];
  topics: { id: string; phrase: string; ready: false }[];
  faces: {
    /** `<placement>.<role>` */
    id: string;
    placement: string;
    role: string;
    readable: boolean;
    label: string;
    atmosphere: boolean;
    max_chars: number | null;
    /** The catalog's px. */
    px: [number, number];
    /** Its largest on-screen size at the reference stages; its px where a corner of it falls behind a reference
     *  camera, so its canvas, min(px, screen_css × the pixel ratio), is its px, as RK3 counts it (plan.md §10). */
    screen_css: [number, number];
    regions: {
      rect: [number, number, number, number];
      renderer: Renderer;
      grid: { cols: number; rows: number } | { rows: number } | { chars: number } | null;
      source:
        | { room_text: string }
        | { resume_titles: true }
        | { ui: string[] }
        | { signal: "turn-cost"; part: "call" | "visit" };
    }[];
  }[];
  /** Each tier value to its pose. */
  switches: { id: string; signal: "tier"; label: string; cases: Record<TierValue, string> }[];
  flat: {
    view_box: [0, 0, 320, 200];
    /** In depth order, back to front. */
    items: { placement: string; matrix: Matrix2D; primitives: Prim[] }[];
    poses: {
      switch: string;
      pose: string;
      matrix: Matrix2D;
      primitives: Prim[];
      cable: { from: [number, number]; control: [number, number]; to: [number, number] } | null;
    }[];
    faces: { face: string; matrix: Matrix2D; size: [number, number] }[];
    hits: { selectable: string; rects: [number, number, number, number][]; depths: number[] }[];
    labels: { placement: string; label: string; at: [number, number] }[];
    papers: [[number, number], [number, number], [number, number]];
    visitor: { x: number; baseline: number; scale: number };
  };
  /** The text copy's order. */
  copy: ({ face: string } | { switch: string } | { figures: true } | { line: string })[];
  typefaces: { use: TypefaceUse; family: string; weight: number; cap_ratio: number; fallback: string }[];
}

/** A set model, as the room fetches and verifies it (contracts/room-bundle.md §3.2): `url`, `a/<stem>.<hash16>.glb` (a
 *  card's own extension for an image card), relative to the site's root; `sha256`, the plain file's, for the integrity
 *  check; `bytes`, the served file's length (C11); its measured bounds; and `texture_bytes`, for the texture ledger. */
export interface SceneModel {
  url: string;
  sha256: string;
  bytes: number;
  bounds: Box;
  texture_bytes: number;
}

/** The 3D part, in the lazy 3D chunk (contracts/room-bundle.md §3.2). */
export interface RoomScene {
  schema: 1;
  /** Equal to the index's. */
  digest: string;
  pieces: Record<
    string,
    {
      /** The stylized scale. */
      scale: number;
      anchors: Record<string, { at: Vec3; turn: Turn }>;
      standin: Shape[];
      faces: Record<string, { at: Vec3; size: [number, number]; facing: Vec3; up: Vec3 }>;
      glows: Record<string, { at: Vec3; radius: number; tone: string; motion: GlowMotion; level: number }>;
    }
  >;
  placements: {
    id: string;
    piece: string;
    mount: { on: string; anchor: string } | null;
    offset: Vec3;
    turn: Turn;
    framed: boolean;
    frame_box: Box;
    label: string | null;
    model: SceneModel | null;
  }[];
  switches: {
    id: string;
    piece: string;
    poses: Record<
      string,
      {
        mount: { on: string; anchor: string; offset: Vec3; turn: Turn };
        glows: { placement: string; glow: string; level: number }[];
      }
    >;
    cable: {
      from: string;
      to: { placement: string; anchor: string };
      sag: number;
      radius: number;
      drop: number;
      rest: { placement: string; anchor: string } | null;
    } | null;
    /** Its piece's set model, which each of its poses shows, so `load_order`'s `<switch>.<pose>` resolves to it; null
     *  while the piece shows its stand-in. RS2 lets no placement place a switch's piece, so this is the model's one
     *  place in the part (an addition to contracts/room-bundle.md §3.2, plan.md §10). */
    model: SceneModel | null;
  }[];
  /** room-data-files.md §10, without material_notes. */
  look: Look;
  /** Placement IDs. */
  figures: { twin: string; visitor: string };
  handoff: { from: { placement: string; anchor: string }; to: { placement: string; anchor: string } };
  /** Placement IDs with a set model, a switch's pose named `<switch>.<pose>` (plan.md §10). */
  load_order: string[];
}
