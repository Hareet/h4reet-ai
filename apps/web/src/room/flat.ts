// The 2D room (spec 002, FR-042; spec 004, FR-011, FR-058, FR-064; Amendment B8; R-39; contracts/room-bundle.md §3.1):
// the bundle's index, drawn as an inline SVG, which never waits on the 3D part. The compositor projected each piece's
// 2D drawing through framing(1.6) into the 320 × 200 view box, so this module only draws the index's `flat`:
// - each placement's primitives in a group at its matrix, back to front as the index orders them;
// - each switch case its own group, toggled by `visibility`, holding its pose and its cable as a quadratic curve, the
//   not-live case shown until the tier applies another (T160, T161);
// - each stand-in's label as SVG text, the UI word `standin.label` filled with its label's word, as the 3D room words
//   it;
// - the visitor as the chosen avatar's flat polygons (src/choice/avatars.ts), at the index's place and scale;
// - the hand-off as three still frames of its paper, at the index's projected positions, which are the first avatar's:
//   the paper in the visitor's hands moves by the chosen avatar's hand offset (handoff.ts), at the visitor's scale, and
//   the paper between the hands half as far, as the 3D room's arc does (plan.md §10, T098's entry);
// - each selectable's cue, a dashed rectangle around its hit rectangles with its name tag, styled by room.css's
//   classes.
// The faces come with their renderers' SVG backend (T185).
//
// An allowlist governs every element and attribute the drawing holds: the elements g, rect, circle, ellipse, line,
// polyline, polygon, path, and text; geometry, fill, stroke, stroke-width, opacity, font-*, text-anchor, and transform,
// each with a typed value; and, from code's own constants, a class of room.css's and a case's or a paper's visibility.
// Anything else throws: no href, no event handler, no style, so the CSP needs no change and data never becomes code.
// Words go in as text, never markup. A pointer picks through compose/pick.ts over the index's hit rectangles, each
// selectable's exclusive core 44 CSS pixels at the drawing's scale on screen, as the compositor's spacing check (RG6)
// measured them (R-20). The drawing is aria-hidden: the "In the room" list and the text copy are its equivalents.
import { avatarPolygons } from "../choice/avatars";
import type { AvatarId } from "../choice/avatars";
import type { Matrix2D, Prim, RoomIndex } from "./compose/bundle";
import { flatCore, pick, pickAreas, unionOf } from "./compose/pick";
import type { PickArea, PickInput } from "./compose/pick";
import { FLAT_VIEW, flatScale } from "./compose/stages";
import type { Stage as Size } from "./compose/stages";
import { SVG_NS, h, svg } from "./dom";
import { FLAT_FRAMES, flatFrame, handOffset } from "./handoff";
import { bindPointerSelection } from "./objects";
import type { Ndc } from "./objects";
import type { Stage } from "./stage";
import { uiWord } from "./ui-keys";

/** What the 2D room reads of the index: its drawing, its words, its selectables, and its switches' cases. */
export type FlatIndex = Pick<RoomIndex, "flat" | "ui" | "selectables" | "switches">;

/** The 2D room's picture, as drawFlat builds it. */
export interface FlatDrawing {
  /** The `svg` element, the view box's, aria-hidden. */
  readonly root: SVGElement;
  /** Each placement's group at its matrix, by placement, in the index's order, back to front. */
  readonly items: ReadonlyMap<string, SVGElement>;
  /** Each switch's cases, by switch and pose: a group toggled by `visibility`, holding its pose and its cable. */
  readonly switches: ReadonlyMap<string, ReadonlyMap<string, SVGElement>>;
  /** The stand-ins' labels, by placement: only where the index has the label's words. */
  readonly labels: ReadonlyMap<string, SVGElement>;
  /** Each selectable's cue, by selectable, in scene order: its dashed rectangle and its name tag. */
  readonly cues: ReadonlyMap<string, { readonly area: SVGElement; readonly name: SVGElement }>;
  /** The visitor: the chosen avatar's polygons. */
  readonly visitor: SVGElement;
  /** The hand-off's paper in its three still frames: in the twin's hand, between the hands, in the visitor's. */
  readonly papers: readonly SVGElement[];
}

export interface FlatStage extends Stage {
  readonly mode: "2d";
  readonly drawing: FlatDrawing;
}

// ---- The allowlist ----

/** The drawing's elements: no other is ever made. */
const ELEMENTS: ReadonlySet<string> = new Set([
  "g",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
]);

/** The room.css classes the drawing's cues and labels take. */
const CLASSES = ["flat-cue", "flat-cue-name", "flat-label"] as const;

/** An attribute's value as written, or null where the value isn't one the attribute takes. */
type Check = (value: unknown) => string | null;

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const number: Check = (v) => (isNumber(v) ? String(v) : null);
const length: Check = (v) => (isNumber(v) && v >= 0 ? String(v) : null);
const unit: Check = (v) => (isNumber(v) && v >= 0 && v <= 1 ? String(v) : null);
const matching =
  (re: RegExp): Check =>
  (v) =>
    typeof v === "string" && re.test(v) ? v : null;
const oneOf =
  (...values: readonly string[]): Check =>
  (v) =>
    typeof v === "string" && values.includes(v) ? v : null;
/** A list of points, each two finite numbers, as SVG writes them. */
const points: Check = (v) =>
  Array.isArray(v) && v.length >= 2 && v.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNumber))
    ? v.map((p: readonly number[]) => p.join(",")).join(" ")
    : null;
/** SVG's matrix(a b c d e f), from six finite numbers. */
const matrix: Check = (v) =>
  Array.isArray(v) && v.length === 6 && v.every(isNumber) ? `matrix(${v.join(" ")})` : null;

/** A colour resolved by the compositor: `#rrggbb` or `none`, so no paint can name a URL. */
const COLOUR = /^(?:#[0-9a-f]{6}|none)$/;
/** Path data's characters, its commands and numbers (contracts/room-data-files.md §8), so it can name nothing. */
const PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa0-9eE.,+\- ]+$/;
/** A font family list of code's own: names, spaces, commas, and hyphens. */
const FAMILY = /^[A-Za-z][A-Za-z0-9 ,-]*$/;

const ATTRIBUTES: Readonly<Record<string, Check>> = {
  x: number,
  y: number,
  width: length,
  height: length,
  cx: number,
  cy: number,
  r: length,
  rx: length,
  ry: length,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  points,
  d: matching(PATH_DATA),
  fill: matching(COLOUR),
  stroke: matching(COLOUR),
  "stroke-width": length,
  opacity: unit,
  "font-family": matching(FAMILY),
  "font-size": length,
  "font-weight": length,
  "text-anchor": oneOf("start", "middle", "end"),
  transform: matrix,
  class: oneOf(...CLASSES),
  visibility: oneOf("visible", "hidden"),
};

/** One element of the drawing, made only through the allowlist: an element, attribute, or value off it throws. */
function node(
  doc: Document,
  tag: string,
  attrs: Readonly<Record<string, unknown>>,
  ...children: (Node | string)[]
): SVGElement {
  if (!ELEMENTS.has(tag)) throw new Error(`the 2D room draws no <${tag}>`);
  const el = doc.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [name, value] of Object.entries(attrs)) {
    const check = Object.hasOwn(ATTRIBUTES, name) ? ATTRIBUTES[name] : undefined;
    const text = check ? check(value) : null;
    if (text === null) throw new Error(`the 2D room refuses <${tag}>'s ${name}`);
    el.setAttribute(name, text);
  }
  el.append(...children);
  return el;
}

/** A switch case's or a paper's visibility, set by code. */
const show = (el: Element, on: boolean): void => el.setAttribute("visibility", on ? "visible" : "hidden");

// ---- The drawing ----

/** The labels' and the name tags' typefaces: the page's own, as spec 002's 2D labels were. */
const FONT = "system-ui, sans-serif";
/** A stand-in's label, in view-box units, and its ink: spec 002's. */
const LABEL = { size: 7, fill: "#1a1a1a" } as const;
/** A cue's name tag, in view-box units: its size and weight, and how far its baseline sits above the cue's foot. */
const NAME = { size: 8, weight: 600, inset: 2 } as const;
/** The cable's line, which the room draws (the index gives only its curve), in view-box units. */
const CABLE = { stroke: "#1a1a1a", width: 1 } as const;
/** The paper, spec 002's sheet in the 2D drawing, in view-box units, and its ink. */
const PAPER = { w: 8, h: 11, fill: "#ffffff", stroke: "#555555" } as const;

function primitive(doc: Document, p: Prim): SVGElement {
  const paint = { fill: p.fill, stroke: p.stroke, "stroke-width": p.stroke_width };
  switch (p.primitive) {
    case "rect":
      return node(doc, "rect", { x: p.x, y: p.y, width: p.w, height: p.h, ...paint });
    case "circle":
      return node(doc, "circle", { cx: p.cx, cy: p.cy, r: p.r, ...paint });
    case "ellipse":
      return node(doc, "ellipse", { cx: p.cx, cy: p.cy, rx: p.rx, ry: p.ry, ...paint });
    case "line":
      return node(doc, "line", { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, ...paint });
    case "polyline":
    case "polygon":
      return node(doc, p.primitive, { points: p.points, ...paint });
    case "path":
      return node(doc, "path", { d: p.d, ...paint });
    default:
      throw new Error(`the 2D room draws no ${String((p as { primitive?: unknown }).primitive)}`);
  }
}

/** A group at a matrix holding primitives. */
const placed = (doc: Document, m: Matrix2D, prims: readonly Prim[]): SVGElement =>
  node(doc, "g", { transform: m }, ...prims.map((p) => primitive(doc, p)));

/** The cable's run: one quadratic curve from the lead's end, through its control point, to where it plugs in. */
function cable(doc: Document, run: NonNullable<FlatIndex["flat"]["poses"][number]["cable"]>): SVGElement {
  const pair = (p: readonly [number, number]): string => {
    if (!p.every(isNumber)) throw new Error("the 2D room refuses a cable's point");
    return `${p[0]} ${p[1]}`;
  };
  const d = `M ${pair(run.from)} Q ${pair(run.control)} ${pair(run.to)}`;
  return node(doc, "path", { d, fill: "none", stroke: CABLE.stroke, "stroke-width": CABLE.width });
}

/**
 * The 2D room's picture from the index, for the chosen avatar: the pieces, the switch cases, the visitor, the labels,
 * the hand-off's paper, and the cues, in that order, so no piece hides a label or a cue. It throws on anything the
 * allowlist refuses.
 */
export function drawFlat(doc: Document, room: FlatIndex, avatar: AvatarId): FlatDrawing {
  const { flat, ui } = room;
  if (flat.view_box.length !== 4 || !flat.view_box.every(isNumber)) throw new Error("the 2D room refuses its view box");
  const root = svg(doc, "svg", {
    viewBox: flat.view_box.join(" "),
    preserveAspectRatio: "xMidYMid meet",
    "aria-hidden": "true",
    focusable: "false",
  });

  const items = new Map<string, SVGElement>();
  for (const item of flat.items) {
    if (items.has(item.placement)) continue;
    const group = placed(doc, item.matrix, item.primitives);
    items.set(item.placement, group);
    root.append(group);
  }

  const switches = new Map<string, Map<string, SVGElement>>();
  for (const pose of flat.poses) {
    const cases = switches.get(pose.switch) ?? new Map<string, SVGElement>();
    switches.set(pose.switch, cases);
    if (cases.has(pose.pose)) continue;
    const group = node(
      doc,
      "g",
      {},
      placed(doc, pose.matrix, pose.primitives),
      ...(pose.cable ? [cable(doc, pose.cable)] : []),
    );
    // Until the tier applies another (T160, T161), the room shows the case of not-live, as in 3D.
    show(group, room.switches.find((s) => s.id === pose.switch)?.cases["not-live"] === pose.pose);
    cases.set(pose.pose, group);
    root.append(group);
  }

  const visitor = avatarPolygons(doc, avatar, flat.visitor.x, flat.visitor.baseline, flat.visitor.scale);
  root.append(visitor);

  const labels = new Map<string, SVGElement>();
  for (const l of flat.labels) {
    const name = uiWord(ui, l.label);
    const words = name === null ? null : uiWord(ui, "standin.label", { name });
    if (words === null || labels.has(l.placement)) continue;
    const text = node(
      doc,
      "text",
      {
        x: l.at[0],
        y: l.at[1],
        class: "flat-label",
        "font-family": FONT,
        "font-size": LABEL.size,
        "text-anchor": "middle",
        fill: LABEL.fill,
      },
      words,
    );
    labels.set(l.placement, text);
    root.append(text);
  }

  // The scene's anchor is the first avatar's hand; the chosen avatar's own is offset from it, in the cut-out's frame,
  // which stands square to the view at the visitor's scale (y down in the view box).
  const [dx, dy] = handOffset(avatar);
  const papers = flat.papers.map(([x, y], k) => {
    const share = k / (FLAT_FRAMES - 1);
    const [cx, cy] = [x + dx * flat.visitor.scale * share, y - dy * flat.visitor.scale * share];
    const paper = node(doc, "rect", {
      x: cx - PAPER.w / 2,
      y: cy - PAPER.h / 2,
      width: PAPER.w,
      height: PAPER.h,
      fill: PAPER.fill,
      stroke: PAPER.stroke,
      "stroke-width": 1,
    });
    root.append(paper);
    return paper;
  });

  const cues = new Map<string, { area: SVGElement; name: SVGElement }>();
  for (const hit of flat.hits) {
    const union = unionOf(hit.rects);
    const selectable = room.selectables.find((s) => s.id === hit.selectable);
    if (!union || !selectable || cues.has(hit.selectable)) continue;
    const [x, y, w, h] = union;
    const area = node(doc, "rect", { x, y, width: w, height: h, class: "flat-cue", fill: "none" });
    const name = node(
      doc,
      "text",
      {
        x: x + w / 2,
        y: y + h - NAME.inset,
        class: "flat-cue-name",
        "font-family": FONT,
        "font-size": NAME.size,
        "font-weight": NAME.weight,
        "text-anchor": "middle",
      },
      selectable.name,
    );
    cues.set(hit.selectable, { area, name });
    root.append(area, name);
  }

  return { root, items, switches, labels, cues, visitor, papers };
}

// ---- The pick ----

/** The 2D room's picker over the index's hit rectangles (R-20). */
export interface FlatPicker {
  /** The drawing's size on screen, in CSS pixels: the cores are 44 px at its scale, recomputed when it changes. */
  resize(size: Size): void;
  /** The selectable under a point of the drawing's box, in normalized device coordinates, or null; none before a
   *  size. */
  readonly pick: (ndc: Ndc) => string | null;
}

export function flatPicker(hits: FlatIndex["flat"]["hits"]): FlatPicker {
  const inputs: PickInput[] = hits.map((hit) => ({
    id: hit.selectable,
    members: hit.rects.map((rect, k) => ({ rect, depth: hit.depths[k] ?? Number.POSITIVE_INFINITY })),
  }));
  let size: Size | null = null;
  let areas: readonly PickArea[] = [];
  return {
    resize(next) {
      if (size !== null && next.w === size.w && next.h === size.h) return;
      size = { w: next.w, h: next.h };
      areas = next.w > 0 && next.h > 0 ? pickAreas(inputs, flatCore(size)) : [];
    },
    pick(ndc) {
      if (size === null || areas.length === 0) return null;
      // The box's CSS pixels, less the margin xMidYMid meet leaves around the view box, at the drawing's scale.
      const s = flatScale(size);
      const x = ((ndc.x + 1) / 2) * size.w - (size.w - FLAT_VIEW.w * s) / 2;
      const y = ((1 - ndc.y) / 2) * size.h - (size.h - FLAT_VIEW.h * s) / 2;
      return pick(areas, [x / s, y / s]);
    },
  };
}

// ---- The stage ----

/** The 2D stage: the drawing, its pointer's picks, and the hand-off's still frames. */
export function renderFlat(
  doc: Document,
  options: { room: FlatIndex; avatar: AvatarId; select(id: string): void },
): FlatStage {
  const drawing = drawFlat(doc, options.room, options.avatar);
  const element = h(doc, "div", { class: "flat", "aria-hidden": "true" }, drawing.root);
  const picker = flatPicker(options.room.flat.hits);
  const unbind = bindPointerSelection(
    element,
    (ndc) => {
      const { width, height } = element.getBoundingClientRect();
      picker.resize({ w: width, h: height });
      return picker.pick(ndc);
    },
    (id) => options.select(id),
  );
  const frame = (k: number): void => {
    element.setAttribute("data-handoff-frame", String(k));
    drawing.papers.forEach((paper, i) => show(paper, i === k));
  };
  // Outside the hand-off, the paper is in the visitor's hands.
  frame(FLAT_FRAMES - 1);
  return {
    mode: "2d",
    element,
    drawing,
    showHandoff: (progress) => frame(flatFrame(progress)),
    dispose: () => {
      unbind();
      element.remove();
    },
  };
}
