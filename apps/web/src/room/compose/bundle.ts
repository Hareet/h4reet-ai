// The bundle's types (spec 004; FR-010, FR-011, FR-058; R-11, R-12; data-model.md §10.1, §10.2): the index, which spec
// 002's `virtual:room-content` exports as `room` into the entry chunk for the 2D room, the lists, and the text copy,
// and the 3D part, `virtual:room-scene`'s default export in the lazy 3D chunk. Exactly contracts/room-bundle.md §3.1's
// RoomIndex and §3.2's RoomScene: the compositor writes them field by field in this order (§11), and the room, the
// lookdev page, and the tests read them. Types only, so nothing here reaches a chunk.
import type { AvatarId, ClipRole } from "../../choice/avatars";
import type { TwinClipRole, TwinState } from "../scene/twin-states";
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

/** Spec 008's highlight (FR-015, FR-057; plan.md §3.2), resolved: its band's and its edge's colours as `#rrggbb`, and
 *  their widths in CSS pixels. */
export interface Highlight {
  band: string;
  band_px: number;
  edge: string;
  edge_px: number;
}

/** A look (contracts/room-data-files.md §10), without `material_notes`, which reaches only the work orders; with spec
 *  008's highlight, resolved (Amendment M12). */
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
  highlight: Highlight;
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
  /** `ready` is false in every build until the twin's spec marks a topic ready (FR-037); the room reads it as it comes
   *  (plan.md §10). */
  topics: { id: string; phrase: string; ready: boolean }[];
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
    /** Spec 016 (FR-036; Amendment M18): present, `model`, where the face is drawn into its avatar's own mesh of the
     *  role's name, never as a quad or in the 2D drawing. */
    surface?: "model";
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
  /** Each tier value to its pose; `claims`, only where the switch's piece declares claims: the pose that claims local
   *  and the one that claims cloud, the plugged and the cloud poses (T163). */
  switches: {
    id: string;
    signal: "tier";
    label: string;
    cases: Record<TierValue, string>;
    claims?: { local: string; cloud: string };
  }[];
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
    /** Spec 014 (FR-003; PD-23): the two figures' framed boxes in the view box, the twin's then the visitor's, as the
     *  hits are projected: what the 2D drawing's frame area keeps clear of the HUD. */
    figures: [number, number, number, number][];
    labels: { placement: string; label: string; at: [number, number] }[];
    papers: [[number, number], [number, number], [number, number]];
    visitor: { x: number; baseline: number; scale: number };
    /** The scene's look's highlight, resolved, for the 2D drawing (spec 008, FR-046; Amendment M12). */
    highlight: Highlight;
  };
  /** The text copy's order. Spec 016 (FR-014; contracts/twin-data.md §4): `{twin_line: true}`, first, is the line slot,
   *  which the room resolves to `twin.line` while the twin's own picture shows and to the stand-in line otherwise.
   *  Spec 020 (FR-007; plan.md R-02): `{visitor_line: true}`, after it, the likeness line of any visitor-avatar model
   *  the room shows, which the room fills, once, from the 3D part's `avatars.<id>.line` while any figure but the twin's
   *  shows that model (the visitor's, or a room figure's: spec 025's dog), and leaves out otherwise. The name stays. */
  copy: (
    | { face: string }
    | { switch: string }
    | { figures: true }
    | { line: string }
    | { twin_line: true }
    | { visitor_line: true }
  )[];
  typefaces: { use: TypefaceUse; family: string; weight: number; cap_ratio: number; fallback: string }[];
  /** Each set model the room's loader loads (a GLB), by its asset events' `asset`, in load_order, once a piece: what a
   *  room in 2D records as skipped, since the entry has no 3D part (FR-071; an addition to §3.1, plan.md §10). */
  models: string[];
  /** The loader's hints, filled, in the file's order; a hint whose slot couldn't be filled, or whose `when` isn't met,
   *  is left out (spec 012; its contracts/hints.md §3; Amendment L7). */
  hints: string[];
  /** Spec 016 (FR-014, FR-015, FR-034; contracts/twin-data.md §4): the twin's line, read from main's approval of its
   *  model's current SHA-256, and its 2D still, `rect` in metres in the twin figure's frame, `[x, y, w, h]`, (x, y) its
   *  lower-left corner; null where the twin isn't bundled. */
  twin: {
    line: string;
    still: {
      url: string;
      sha256: string;
      bytes: number;
      rect: [number, number, number, number];
      /** The rectangle in the 2D drawing's view box, projected by the compositor (plan.md R-11, as built). */
      view: [number, number, number, number];
      /** The twin figure's placement, whose drawing the still hides while it shows. */
      placement: string;
    } | null;
  } | null;
}

/** Spec 016's twin block, resolved (contracts/twin-data.md §4): each state's clip role, the timings, the lean (null
 *  where the scene gives none or RA7 left it out), and the twin's texture side. */
export interface TwinBlock {
  clips: Record<TwinState, TwinClipRole>;
  rest_after_s: number;
  speak_wpm: number;
  speak_s: [number, number];
  lean: { against: string; behind_m: number; right_m: number } | null;
  texture_px: number;
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

/** Spec 008's walking data (FR-056; plan.md §3.1), resolved: every figure, the spec's default where the scene leaves
 *  it out. */
export interface Walking {
  speed_mps: number;
  turn_dps: number;
  tilt_dps: number;
  radius_m: number;
  reach_m: number;
  reach_cone_deg: number;
  camera: { yaw_deg: number; pitch_deg: [number, number]; min_distance_m: number; focus_height_m: number };
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
      /** A disc glow's `at` and `radius`, or since spec 014 a path glow's `path` and `spread` (its FR-045), in the
       *  piece's frame at scale 1. */
      glows: Record<
        string,
        { at?: Vec3; radius?: number; path?: Vec3[]; spread?: number; tone: string; motion: GlowMotion; level: number }
      >;
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
  /** Placement IDs; and spec 009's figures block, resolved (its FR-037; plan.md §3.2): the visitor avatar the twin's
   *  figure shows as a stand-in, or null for its capsule; the avatars' texture side cap; the hand-off's wait; and the
   *  twin figure's catalog height, its stand-in's target height (FR-016). */
  figures: {
    twin: string;
    visitor: string;
    stand_in: AvatarId | null;
    texture_px: number;
    wait_ms: number;
    twin_height: number;
    /** Spec 014 (FR-039; W16): each avatar's grip per hand, from the scene's figures block, in the hand bone's frame
     *  (metres at the room's scale, degrees); an absent avatar or hand takes the computed default (scene/grip.ts). */
    grips?: Partial<Record<AvatarId, Partial<Record<"right" | "left", { at: Vec3; turn: Turn }>>>>;
  };
  handoff: { from: { placement: string; anchor: string }; to: { placement: string; anchor: string } };
  /** Placement IDs with a set model, a switch's pose named `<switch>.<pose>` (plan.md §10). */
  load_order: string[];
  /** The caps' scene_texture_bytes the compose used, FR-053's starting figure while main has no room block: the room's
   *  texture ledger's limit, as RK3's at build time (plain-model-fit.md §8.2; an addition to §3.2, plan.md §10). */
  scene_texture_bytes: number;
  /** Spec 008's walking data, resolved (Amendment M12). */
  walking: Walking;
  /** Spec 009's avatars (its FR-009, FR-023, FR-024; plan.md §3.2): only avatars whose model is bundled, by ID, each
   *  file's `url` `a/<stem>.<hash16>.glb`, `sha256` the plain file's, and `bytes` the served copy's length; a model's
   *  `texture_bytes` at texture_px, for the texture ledger. Spec 020 (FR-007; plan.md R-02): `line`, main's likeness
   *  approval's disclosure line, only on an avatar recorded as a likeness or from a photo (RA9 bundles none without). */
  avatars: Partial<
    Record<
      AvatarId,
      {
        model: { url: string; sha256: string; bytes: number; texture_bytes: number };
        clips: Partial<Record<ClipRole, { url: string; sha256: string; bytes: number }>>;
        line?: string;
      }
    >
  >;
  /** Spec 016 (FR-008, FR-044, FR-045, FR-048; contracts/twin-data.md §4): the twin's own model, `texture_bytes` at its
   *  texture side, its bundled clips by role, and its block resolved; null where its model isn't bundled. */
  twin: {
    model: { url: string; sha256: string; bytes: number; texture_bytes: number };
    clips: Partial<Record<TwinClipRole, { url: string; sha256: string; bytes: number }>>;
    block: TwinBlock;
  } | null;
}
