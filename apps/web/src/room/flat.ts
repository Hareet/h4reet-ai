// The 2D room (spec 002, FR-042; spec 004, FR-011, FR-058, FR-064; Amendment B8; R-39; contracts/room-bundle.md §3.1):
// the bundle's index, drawn as an inline SVG, which never waits on the 3D part. The compositor projected each piece's
// 2D drawing through framing(1.6) into the 320 × 200 view box, so this module only draws the index's `flat`:
// - each placement's primitives in a group at its matrix, back to front as the index orders them;
// - each switch case its own group, toggled by `visibility`, holding its pose and its cable as a quadratic curve: the
//   case tier.ts's caseFor gives for the tier the stage's `apply` takes, not-live's until the tier applies another, so
//   only `local` shows the plugged case and only `cloud` the cloud case, the two the switch's claims name, whatever
//   its cases map (FR-043, FR-062; contracts/room-bundle.md §3.1);
// - each stand-in's label as SVG text, the UI word `standin.label` filled with its label's word, as the 3D room words
//   it;
// - the visitor as the chosen avatar's flat polygons (src/choice/avatars.ts), at the index's place and scale;
// - the hand-off as three still frames of its paper, at the index's projected positions, which are the first avatar's:
//   the paper in the visitor's hands moves by the chosen avatar's hand offset (handoff.ts), at the visitor's scale, on
//   the side the index's paper ends on (the data's anchor, nearer the twin), and the paper between the hands half as
//   far, as the 3D room's arc does (plan.md §10, T098's entry); and the visitor turning toward the twin as the 3D room
//   turns it, in the frames where it is turned: narrowed to the turn's cosine about its feet, its head leaning toward
//   the side the paper comes from;
// - each selectable's cue, a dashed rectangle around its hit rectangles with its name tag, styled by room.css's
//   classes.
// The faces come with their renderers' SVG backend (T185). The hand-off's visitor reads reduced motion from the room's
// motion store on each frame, so a change mid-visit reaches it (FR-059).
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
import { CORE_PX, listOnly, pick, pickAreas, unionOf } from "./compose/pick";
import type { PickArea, PickInput } from "./compose/pick";
import type { Stage as Size } from "./compose/stages";
import { SVG_NS, h, svg } from "./dom";
import { FLAT_FRAMES, VISITOR_TURN, flatFrame, handOffset, sideOf, visitorTurnShare } from "./handoff";
import { bindPointerSelection } from "./objects";
import type { Ndc } from "./objects";
import { caseFor } from "./signals/tier";
import type { TierValue } from "./signals/tier";
import type { MotionView, Stage } from "./stage";
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
  /** For each of those frames, the visitor's turn toward the twin as a matrix about its feet, or null where it stands
   *  square to the view. */
  readonly turns: readonly (Matrix2D | null)[];
}

export interface FlatStage extends Stage {
  readonly mode: "2d";
  readonly drawing: FlatDrawing;
  /** Fits the picker and the cues to the drawing's size in CSS pixels: a cue shows only where its selectable has a
   *  pick area. The stage calls it on each pick, and on each change of the drawing's size where the browser reports
   *  one. */
  resize(size: Size): void;
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

/** A switch case's, a paper's, or a cue's visibility, set by code. */
const show = (el: Element, on: boolean): void => el.setAttribute("visibility", on ? "visible" : "hidden");

/** Shows each switch's case for a tier value by the claims rule (tier.ts's caseFor), each case's group, with its cable
 *  curve, visible or hidden; a switch the index doesn't list shows none. */
function showCases(
  drawn: ReadonlyMap<string, ReadonlyMap<string, Element>>,
  switches: FlatIndex["switches"],
  value: TierValue,
): void {
  for (const [id, cases] of drawn) {
    const sw = switches.find((s) => s.id === id);
    const pose = sw ? caseFor(sw, value, (p) => cases.has(p)) : null;
    for (const [name, group] of cases) show(group, name === pose);
  }
}

/** The visitor's turn, set by code through the allowlist's matrix, or taken off. */
function turnTo(el: Element, m: Matrix2D | null): void {
  if (m === null) {
    el.removeAttribute("transform");
    return;
  }
  const text = matrix(m);
  if (text === null) throw new Error("the 2D room refuses the visitor's turn");
  el.setAttribute("transform", text);
}

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
/** How far the turned cut-out's head leans toward the twin, as a share of the turn's sine of its height: the 2D room's
 *  cue for which way a flat figure turned, which seen square on would only narrow. */
const LEAN = 0.25;

/** The visitor's turn by an angle toward a side, as a matrix about its feet at (x, baseline), y down: narrowed to the
 *  angle's cosine, its head leaning to that side; null for no turn. */
function visitorTurn(x: number, baseline: number, side: number, angle: number): Matrix2D | null {
  if (angle === 0) return null;
  const [cos, lean] = [Math.cos(angle), side * Math.sin(angle) * LEAN];
  return [cos, 0, -lean, 1, x * (1 - cos) + lean * baseline, 0];
}

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
export function drawFlat(doc: Document, room: FlatIndex, avatar: AvatarId, reducedMotion = false): FlatDrawing {
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
    cases.set(pose.pose, group);
    root.append(group);
  }
  // Until the tier applies another, the room shows not-live's case by the claims rule, as in 3D.
  showCases(switches, room.switches, "not-live");

  // The avatar's polygons are code's; where they stand, and at what scale, is the index's.
  const { x: feet, baseline, scale } = flat.visitor;
  if (![feet, baseline, scale].every(isNumber)) throw new Error("the 2D room refuses the visitor's place");
  const visitor = avatarPolygons(doc, avatar, feet, baseline, scale);
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

  // The scene's anchor is the first avatar's hand, on the side the paper ends on, the twin's; the chosen avatar's own is
  // offset from it on that side, in the cut-out's frame, which stands square to the view at the visitor's scale (y down
  // in the view box).
  const [, , atVisitor] = flat.papers;
  const [dx, dy] = handOffset(avatar, sideOf(atVisitor[0] - feet));
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

  // Every selectable's cue; the stage hides one FR-064's carve-out holds at its size (see listOnly; renderFlat).
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

  return { root, items, switches, labels, cues, visitor, papers, turns: turnsOf(flat, reducedMotion) };
}

/** In each of the hand-off's frames, the visitor's turn toward the paper's side, as the 3D room turns it at that frame's
 *  progress; under reduced motion it doesn't turn, as in 3D. */
function turnsOf(flat: FlatIndex["flat"], reducedMotion: boolean): (Matrix2D | null)[] {
  const { x: feet, baseline } = flat.visitor;
  const towardTwin = sideOf(flat.papers[0][0] - feet);
  return flat.papers.map((_, k) =>
    reducedMotion
      ? null
      : visitorTurn(feet, baseline, towardTwin, VISITOR_TURN * visitorTurnShare(k / (FLAT_FRAMES - 1))),
  );
}

// ---- The pick ----

/** The 2D room's picker over the index's hit rectangles (R-20). */
export interface FlatPicker {
  /** The drawing's size on screen, in CSS pixels: the cores are 44 px at its scale, recomputed when it changes, and
   *  FR-064's carve-out (see listOnly) holds the side-wall selectables whose cores can't fit at it. Whether the size
   *  changed, so the stage recomputes what follows from it only then. */
  resize(size: Size): boolean;
  /** The selectable under a point of the drawing's box, in normalized device coordinates, or null; none before a
   *  size. */
  readonly pick: (ndc: Ndc) => string | null;
  /** The selectables held at the last size, which have no pick area and no cue there (see listOnly). */
  readonly held: () => ReadonlySet<string>;
}

/** The 2D room's picker over the index's hit rectangles, in the index's view box, with the index's selectables, whose
 *  `side_wall` FR-064's carve-out reads (see listOnly): at each size it holds the side-wall selectables the drawing
 *  leaves to the list there, at the size's scale, the view box shown whole in the box (xMidYMid meet). */
export function flatPicker(
  hits: FlatIndex["flat"]["hits"],
  index: Pick<RoomIndex, "selectables"> & { readonly flat: Pick<RoomIndex["flat"], "view_box"> },
): FlatPicker {
  const inputs: PickInput[] = hits.map((hit) => ({
    id: hit.selectable,
    members: hit.rects.map((rect, k) => ({ rect, depth: hit.depths[k] ?? Number.POSITIVE_INFINITY })),
  }));
  const sideWall = new Set(index.selectables.filter((s) => s.side_wall).map((s) => s.id));
  const [vx, vy, vw, vh] = index.flat.view_box;
  /** The drawing's scale in a box this size: CSS pixels per view-box unit. */
  const scaleIn = (box: Size): number => Math.min(box.w / vw, box.h / vh);
  let size: Size | null = null;
  let areas: readonly PickArea[] = [];
  let held: ReadonlySet<string> = new Set();
  return {
    resize(next) {
      if (size !== null && next.w === size.w && next.h === size.h) return false;
      size = { w: next.w, h: next.h };
      areas = next.w > 0 && next.h > 0 ? pickAreas(inputs, CORE_PX / scaleIn(size)) : [];
      held = listOnly(areas, [vx, vy, vw, vh], sideWall);
      return true;
    },
    held: () => held,
    pick(ndc) {
      if (size === null || areas.length === 0) return null;
      // The box's CSS pixels, less the margin xMidYMid meet leaves around the view box, at the drawing's scale.
      const s = scaleIn(size);
      const x = ((ndc.x + 1) / 2) * size.w - (size.w - vw * s) / 2;
      const y = ((1 - ndc.y) / 2) * size.h - (size.h - vh * s) / 2;
      return pick(areas, [vx + x / s, vy + y / s], held);
    },
  };
}

// ---- The stage ----

/** The 2D stage: the drawing, its pointer's picks, and the hand-off's still frames. */
export function renderFlat(
  doc: Document,
  options: {
    room: FlatIndex;
    avatar: AvatarId;
    select(id: string): void;
    /** Reduced motion, read once, where no motion store is given. */
    reducedMotion?: boolean;
    /** The motion store, read whenever a frame is shown, so reduced motion switched on mid-visit stops the turn. */
    motion?: Pick<MotionView, "reducedMotion">;
  },
): FlatStage {
  const reduced = (): boolean => options.motion?.reducedMotion ?? options.reducedMotion ?? false;
  const drawing = drawFlat(doc, options.room, options.avatar, reduced());
  const moving = turnsOf(options.room.flat, false);
  const element = h(doc, "div", { class: "flat", "aria-hidden": "true" }, drawing.root);
  const picker = flatPicker(options.room.flat.hits, options.room);
  const resize = (size: Size): void => {
    // A pointer's move measures the box too; the cues follow the held set only when the size changes it.
    if (!picker.resize(size)) return;
    const held = picker.held();
    for (const [id, cue] of drawing.cues) {
      show(cue.area, !held.has(id));
      show(cue.name, !held.has(id));
    }
  };
  /** The drawing's box on screen. */
  const measure = (): void => {
    const box = element.getBoundingClientRect();
    resize({ w: box.width, h: box.height });
  };
  const unbind = bindPointerSelection(
    element,
    (ndc) => {
      measure();
      return picker.pick(ndc);
    },
    (id) => options.select(id),
  );
  const Observer = doc.defaultView?.ResizeObserver;
  const observer = Observer ? new Observer(measure) : null;
  observer?.observe(element);
  const frame = (k: number): void => {
    element.setAttribute("data-handoff-frame", String(k));
    drawing.papers.forEach((paper, i) => show(paper, i === k));
    turnTo(drawing.visitor, reduced() ? null : (moving[k] ?? null));
  };
  // Outside the hand-off, the paper is in the visitor's hands.
  frame(FLAT_FRAMES - 1);
  return {
    mode: "2d",
    element,
    drawing,
    showHandoff: (progress) => frame(flatFrame(progress)),
    // Each case's visibility at once, its cable with it: the next paint shows it (FR-042, FR-058).
    apply: (value) => showCases(drawing.switches, options.room.switches, value),
    resize,
    dispose: () => {
      observer?.disconnect();
      unbind();
      element.remove();
    },
  };
}
