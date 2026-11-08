// The visitor's avatars (spec 002, FR-001; data-model.md §5; research.md R-11): intent 000's four placeholders, "a
// generic woman, a generic man, a generic dinosaur, a generic dog", as flat shapes with names. One shape per avatar
// serves three uses (spec 009's Amendment M3): the choice screen's preview, the 2D room's figure, and the 3D figure's
// fallback, the cut-out shown wherever the avatar's model isn't (spec 009: in 3D, an avatar with files in the room's
// bundle shows its model). Its height is the room's height for it, the 2D room's and the 3D model's alike (spec 009,
// FR-016). Beside the table, the clip roles an avatar's files may hold (spec 009, FR-009; plan.md R-02).
import { svg } from "../room/dom";

export const AVATARS = [
  { id: "woman", name: "Woman", description: "a generic woman" },
  { id: "man", name: "Man", description: "a generic man" },
  { id: "dinosaur", name: "Dinosaur", description: "a generic dinosaur" },
  { id: "dog", name: "Dog", description: "a generic dog" },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];

/** The clips an avatar's folder may hold beside its model, `<id>-<role>.glb`, a closed list (spec 009, FR-009; plan.md
 *  R-02): the idle, the idle while holding the resume's paper, taking it, and walking. A new role is code, through the
 *  lifecycle, as a new kind of piece is (spec 004, FR-005). */
export const CLIP_ROLES = ["idle", "idle-holding", "take", "walk"] as const;

export type ClipRole = (typeof CLIP_ROLES)[number];

export function isAvatarId(value: unknown): value is AvatarId {
  return AVATARS.some((a) => a.id === value);
}

export function avatarById(id: AvatarId): (typeof AVATARS)[number] {
  const found = AVATARS.find((a) => a.id === id);
  if (!found) throw new Error(`no avatar ${String(id)}`);
  return found;
}

export type Point = readonly [number, number];

/** A flat shape in metres: x centred on the figure, y up from its feet. */
export interface FlatShape {
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly polygons: readonly (readonly Point[])[];
}

/** A circle as a polygon. */
function ring(cx: number, cy: number, r: number, n = 12): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
}

function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

export const AVATAR_SHAPES: Readonly<Record<AvatarId, FlatShape>> = {
  woman: {
    width: 0.56,
    height: 1.58,
    color: "#b5477a",
    polygons: [
      ring(0, 1.45, 0.13),
      [
        [-0.28, 0.45],
        [0.28, 0.45],
        [0.12, 1.3],
        [-0.12, 1.3],
      ],
      rect(-0.12, 0, -0.04, 0.46),
      rect(0.04, 0, 0.12, 0.46),
    ],
  },
  man: {
    width: 0.5,
    height: 1.74,
    color: "#3d6fa8",
    polygons: [
      ring(0, 1.6, 0.14),
      rect(-0.2, 0.84, 0.2, 1.44),
      rect(-0.25, 0.9, -0.2, 1.4),
      rect(0.2, 0.9, 0.25, 1.4),
      rect(-0.17, 0, -0.03, 0.85),
      rect(0.03, 0, 0.17, 0.85),
    ],
  },
  dinosaur: {
    width: 1.1,
    height: 1.2,
    color: "#4f8a3c",
    polygons: [
      [
        [-0.25, 0.3],
        [0.2, 0.3],
        [0.3, 0.55],
        [0.05, 0.75],
        [-0.3, 0.6],
      ],
      [
        [0.1, 0.65],
        [0.25, 0.6],
        [0.32, 1.02],
        [0.5, 1.08],
        [0.55, 1.2],
        [0.2, 1.2],
        [0.15, 1.05],
      ],
      [
        [-0.25, 0.35],
        [-0.55, 0.25],
        [-0.3, 0.56],
      ],
      rect(-0.15, 0, -0.05, 0.32),
      rect(0.08, 0, 0.18, 0.32),
    ],
  },
  dog: {
    width: 0.8,
    height: 0.62,
    color: "#a8743d",
    polygons: [
      rect(-0.28, 0.22, 0.22, 0.45),
      [
        [0.18, 0.38],
        [0.4, 0.42],
        [0.4, 0.56],
        [0.22, 0.6],
      ],
      [
        [0.22, 0.6],
        [0.27, 0.62],
        [0.3, 0.5],
      ],
      [
        [-0.28, 0.4],
        [-0.4, 0.55],
        [-0.36, 0.58],
        [-0.24, 0.44],
      ],
      rect(-0.26, 0, -0.2, 0.24),
      rect(-0.14, 0, -0.08, 0.24),
      rect(0.08, 0, 0.14, 0.24),
      rect(0.15, 0, 0.21, 0.24),
    ],
  },
};

/** An avatar's shape as SVG polygons, flipped so y runs down, offset to (x, baseline) and scaled. */
export function avatarPolygons(doc: Document, id: AvatarId, x: number, baseline: number, scale: number): SVGElement {
  const shape = AVATAR_SHAPES[id];
  const g = svg(doc, "g", { fill: shape.color });
  for (const polygon of shape.polygons) {
    const points = polygon.map(([px, py]) => `${(x + px * scale).toFixed(2)},${(baseline - py * scale).toFixed(2)}`);
    g.append(svg(doc, "polygon", { points: points.join(" ") }));
  }
  return g;
}

/** The choice screen's preview: the shape in a square, hidden from assistive technology (the name is its label). */
export function avatarPreview(doc: Document, id: AvatarId): SVGElement {
  const pad = 0.05;
  const side = Math.max(AVATAR_SHAPES[id].width, AVATAR_SHAPES[id].height) + 2 * pad;
  const shapes = avatarPolygons(doc, id, side / 2, side - pad - (side - 2 * pad - AVATAR_SHAPES[id].height) / 2, 1);
  return svg(
    doc,
    "svg",
    {
      class: "avatar-preview",
      viewBox: `0 0 ${side.toFixed(2)} ${side.toFixed(2)}`,
      "aria-hidden": "true",
      focusable: "false",
    },
    shapes,
  );
}
