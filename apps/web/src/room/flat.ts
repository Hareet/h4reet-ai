// The 2D mode (spec 002, FR-042; contracts/room-scene.md §3–§4; research.md R-04, R-11): the work area as an inline
// SVG drawing of the same placeholders, with a button over each object at its place, and the hand-off as three still
// frames. The drawing is aria-hidden and its buttons are out of the Tab order: the "In the room" list stays the
// objects' accessible equivalent, as it is in 3D. Everything is drawn from attributes, so the CSP needs nothing more.
import { avatarById, avatarPolygons, AVATAR_SHAPES } from "../choice/avatars";
import type { AvatarId } from "../choice/avatars";
import { h, svg } from "./dom";
import { FLAT_FRAMES, flatFrame } from "./handoff";
import { ROOM_OBJECTS } from "./objects";
import type { ObjectId } from "./objects";
import type { Stage } from "./stage";

export interface FlatStage extends Stage {
  readonly mode: "2d";
}

/** The drawing's viewBox: 320 by 200. The buttons' places in room.css are percentages of it. */
const W = 320;
const H = 200;
/** The visitor's avatar: its feet on the floor, in front of the desk, at this scale (pixels a metre). */
const AVATAR_X = 150;
const AVATAR_BASELINE = 192;
const AVATAR_SCALE = 45;

/** The paper in each still frame: in the twin's hand, between them, in the visitor's hands. */
function paperPlaces(avatar: AvatarId): readonly (readonly [number, number])[] {
  const hand = AVATAR_BASELINE - Math.min(0.95, AVATAR_SHAPES[avatar].height * 0.6) * AVATAR_SCALE;
  return [
    [106, 118],
    [126, Math.min(102, hand - 20)],
    [AVATAR_X - AVATAR_SHAPES[avatar].width * 0.35 * AVATAR_SCALE, hand],
  ];
}

const label = (doc: Document, x: number, y: number, text: string): SVGElement =>
  svg(doc, "text", { x, y, "font-size": 7, "font-family": "system-ui, sans-serif", fill: "#1a1a1a" }, text);

function drawing(doc: Document, avatar: AvatarId): { root: SVGElement; papers: SVGElement[] } {
  const papers = paperPlaces(avatar).map(([x, y]) =>
    svg(doc, "rect", { x: x - 4, y: y - 5.5, width: 8, height: 11, fill: "#ffffff", stroke: "#555555" }),
  );
  const root = svg(
    doc,
    "svg",
    { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true", focusable: "false" },
    // The wall and the floor.
    svg(doc, "rect", { x: 0, y: 0, width: W, height: 160, fill: "#e9e4da" }),
    svg(doc, "rect", { x: 0, y: 160, width: W, height: 40, fill: "#b9a68c" }),
    // The window, its view of a fence and a tree, and the artwork above it.
    svg(
      doc,
      "g",
      {},
      svg(doc, "rect", { x: 170, y: 40, width: 60, height: 44, fill: "#cfe6f5", stroke: "#5b4a3a", "stroke-width": 3 }),
      svg(doc, "rect", { x: 202, y: 52, width: 4, height: 22, fill: "#6b4a2b" }),
      svg(doc, "circle", { cx: 204, cy: 52, r: 11, fill: "#4f7d3a" }),
      ...Array.from({ length: 9 }, (_, i) =>
        svg(doc, "rect", { x: 172 + i * 6.5, y: 66, width: 4, height: 16, fill: "#a07a4f" }),
      ),
      label(doc, 172, 94, "Window, fence, tree (placeholder)"),
      svg(doc, "rect", { x: 182, y: 10, width: 36, height: 22, fill: "#f3d27a", stroke: "#5b4a3a", "stroke-width": 2 }),
      svg(doc, "circle", { cx: 194, cy: 21, r: 6, fill: "#c4553b" }),
      svg(doc, "polygon", { points: "202,28 210,14 216,28", fill: "#3b6fa5" }),
      label(doc, 222, 24, "Artwork (placeholder)"),
    ),
    // The desk, the laptop, and the screen.
    svg(
      doc,
      "g",
      {},
      svg(doc, "rect", { x: 110, y: 120, width: 112, height: 8, fill: "#8a6a4a" }),
      svg(doc, "rect", { x: 114, y: 128, width: 6, height: 32, fill: "#7a5a3a" }),
      svg(doc, "rect", { x: 212, y: 128, width: 6, height: 32, fill: "#7a5a3a" }),
      svg(doc, "rect", { x: 126, y: 116, width: 32, height: 4, fill: "#4a4a4a" }),
      svg(doc, "polygon", { points: "130,116 156,116 152,98 134,98", fill: "#5a5a5a" }),
      svg(doc, "rect", { x: 172, y: 90, width: 40, height: 24, fill: "#2b2b2b", stroke: "#4a4a4a" }),
      svg(doc, "rect", { x: 190, y: 114, width: 4, height: 6, fill: "#4a4a4a" }),
      label(doc, 140, 140, "Desk (placeholder)"),
    ),
    // The snowboard, hanging on the left.
    svg(
      doc,
      "g",
      {},
      svg(doc, "rect", { x: 22, y: 30, width: 16, height: 110, rx: 8, fill: "#2f6db5" }),
      svg(doc, "rect", { x: 24, y: 64, width: 12, height: 6, fill: "#1a1a1a" }),
      svg(doc, "rect", { x: 24, y: 98, width: 12, height: 6, fill: "#1a1a1a" }),
    ),
    // The bicycle, hanging on the right.
    svg(
      doc,
      "g",
      { fill: "none", stroke: "#333333", "stroke-width": 2.5 },
      svg(doc, "circle", { cx: 262, cy: 96, r: 17 }),
      svg(doc, "circle", { cx: 300, cy: 96, r: 17 }),
      svg(doc, "polyline", { points: "262,96 276,74 296,74 300,96 280,96 262,96" }),
      svg(doc, "line", { x1: 280, y1: 96, x2: 274, y2: 68 }),
      svg(doc, "line", { x1: 294, y1: 74, x2: 298, y2: 66 }),
    ),
    // The twin's figure, at the desk.
    svg(
      doc,
      "g",
      { fill: "#6c5a8f" },
      svg(doc, "circle", { cx: 95, cy: 86, r: 9 }),
      svg(doc, "rect", { x: 85, y: 96, width: 20, height: 40, rx: 6 }),
      svg(doc, "rect", { x: 87, y: 134, width: 6, height: 26 }),
      svg(doc, "rect", { x: 97, y: 134, width: 6, height: 26 }),
      svg(doc, "rect", { x: 103, y: 104, width: 5, height: 18, rx: 2 }),
      label(doc, 62, 76, "The twin (placeholder)"),
    ),
    // The visitor's avatar, in front.
    avatarPolygons(doc, avatar, AVATAR_X, AVATAR_BASELINE, AVATAR_SCALE),
    label(doc, AVATAR_X + 22, 196, `You: ${avatarById(avatar).name} (placeholder)`),
    ...papers,
  );
  return { root, papers };
}

/** The 2D stage: the drawing, its three buttons, and the hand-off's still frames. */
export function renderFlat(doc: Document, options: { avatar: AvatarId; select(id: ObjectId): void }): FlatStage {
  const { root, papers } = drawing(doc, options.avatar);
  const buttons = ROOM_OBJECTS.map((object) => {
    const button = h(
      doc,
      "button",
      { type: "button", tabindex: -1, class: `flat-hit flat-hit--${object.id}`, "data-object-id": object.id },
      h(doc, "span", {}, object.name),
      " ",
      h(doc, "span", {}, "(placeholder)"),
    );
    // A press on the drawing selects; it doesn't move focus into the hidden drawing.
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", () => options.select(object.id));
    return button;
  });
  const element = h(doc, "div", { class: "flat", "aria-hidden": "true", "data-handoff-frame": "2" }, root, ...buttons);
  const show = (frame: number): void => {
    element.setAttribute("data-handoff-frame", String(frame));
    papers.forEach((paper, i) => paper.setAttribute("visibility", i === frame ? "visible" : "hidden"));
  };
  // Outside the hand-off, the paper is in the visitor's hands.
  show(FLAT_FRAMES - 1);
  return {
    mode: "2d",
    element,
    showHandoff: (progress) => show(flatFrame(progress)),
    dispose: () => element.remove(),
  };
}
