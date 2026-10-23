// T103 (spec 004; FR-011, FR-058, FR-064; Amendment B8; R-39; contracts/room-bundle.md §3.1): the 2D room,
// src/room/flat.ts, draws the bundle's index and never the 3D part: each placement's primitives in a group at its
// matrix, back to front; each switch case its own group, toggled by `visibility`, its cable a quadratic curve, the
// not-live case shown; the stand-ins' labels as SVG text, worded as the 3D room words them; each selectable's cue, a
// dashed rectangle with a name tag, styled by room.css's classes, which hold no per-ID rule; the visitor as the chosen
// avatar's polygons from src/choice/avatars.ts; and the hand-off's paper at the index's three projected positions,
// moved from the first avatar's hand to each avatar's own (plan.md §10, T098's entry). Only the allowlisted elements
// and attributes, with typed values, reach the page: no href, event handler, or style. Pointer input picks through
// compose/pick.ts, each core 44 CSS pixels at the drawing's scale, and the drawing is aria-hidden. Expectations come
// from compose() over the fixture set: every ID is a synthetic fx- one.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { AVATARS, AVATAR_SHAPES, avatarPolygons } from "../../src/choice/avatars";
import type { AvatarId } from "../../src/choice/avatars";
import type { Prim, RoomIndex } from "../../src/room/compose/bundle";
import { CORE_PX, pick, pickAreas, unionOf } from "../../src/room/compose/pick";
import type { PickArea, PickInput, Rect } from "../../src/room/compose/pick";
import { FLAT_VIEW, REFERENCE_DESKTOP, REFERENCE_PHONE, SMALLEST, flatScale } from "../../src/room/compose/stages";
import type { Stage } from "../../src/room/compose/stages";
import { drawFlat, flatPicker, renderFlat } from "../../src/room/flat";
import { FLAT_FRAMES } from "../../src/room/handoff";
import { standinLabel } from "../../src/room/scene/bundle3d";
import { enter, parseCss, start, stylesheets } from "../helpers/room";
import type { TestWindow } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

type Point = readonly [number, number];

let composed: ComposeResult | null = null;
/** The fixture set, composed once a file, as a release build in strict mode. */
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));

function page(): { win: TestWindow; doc: Document } {
  const win = new JSDOM("<main></main>", { pretendToBeVisual: true }).window as unknown as TestWindow;
  return { win, doc: win.document };
}

const num = (el: Element | undefined, name: string): number => Number(el?.getAttribute(name) ?? Number.NaN);

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-9, what = ""): void {
  expect(actual.length, what).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    const [a, e] = [actual[i] ?? Number.NaN, expected[i] ?? Number.NaN];
    expect(Math.abs(a - e), `${what}[${i}]: ${a} against ${e}`).toBeLessThanOrEqual(tolerance);
  }
}

/** An element's `transform`, `matrix(a b c d e f)`, as its six numbers; null for anything else. */
function matrixOf(el: Element | undefined): number[] | null {
  const m = /^matrix\(([^()]*)\)$/.exec(el?.getAttribute("transform") ?? "");
  return m ? (m[1] ?? "").split(" ").map(Number) : null;
}

const pointsOf = (el: Element): [number, number][] =>
  (el.getAttribute("points") ?? "").split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return [x ?? Number.NaN, y ?? Number.NaN];
  });

/** The primitive an element draws, read back from its attributes. */
function primOf(el: Element): Prim {
  const n = (name: string): number => num(el, name);
  const paint = {
    fill: el.getAttribute("fill") ?? "",
    stroke: el.getAttribute("stroke") ?? "",
    stroke_width: n("stroke-width"),
  };
  switch (el.localName) {
    case "rect":
      return { ...paint, primitive: "rect", x: n("x"), y: n("y"), w: n("width"), h: n("height") };
    case "circle":
      return { ...paint, primitive: "circle", cx: n("cx"), cy: n("cy"), r: n("r") };
    case "ellipse":
      return { ...paint, primitive: "ellipse", cx: n("cx"), cy: n("cy"), rx: n("rx"), ry: n("ry") };
    case "line":
      return { ...paint, primitive: "line", x1: n("x1"), y1: n("y1"), x2: n("x2"), y2: n("y2") };
    case "polyline":
      return { ...paint, primitive: "polyline", points: pointsOf(el) };
    case "polygon":
      return { ...paint, primitive: "polygon", points: pointsOf(el) };
    case "path":
      return { ...paint, primitive: "path", d: el.getAttribute("d") ?? "" };
    default:
      throw new Error(`<${el.localName}> isn't a primitive`);
  }
}

/** A cable's path, `M x y Q x y x y`, as its three points; null for any other path. */
function curveOf(el: Element | undefined): { from: number[]; control: number[]; to: number[] } | null {
  const parts = (el?.getAttribute("d") ?? "").split(" ");
  if (parts.length !== 8 || parts[0] !== "M" || parts[3] !== "Q") return null;
  const n = parts.map(Number);
  return { from: [n[1] ?? 0, n[2] ?? 0], control: [n[4] ?? 0, n[5] ?? 0], to: [n[6] ?? 0, n[7] ?? 0] };
}

// ---- The allowlist (R-39) ----

const ELEMENTS = new Set(["g", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text"]);
const GEOMETRY = new Set([
  "x",
  "y",
  "width",
  "height",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "d",
]);
const PAINT = new Set(["fill", "stroke", "stroke-width", "opacity", "text-anchor", "transform"]);
/** Set by code alone, from its own constants: a class of room.css's, and a switch case's or a paper's visibility. */
const BY_CODE = new Set(["class", "visibility"]);
/** The drawing's root, an `svg` element, which code makes with these alone. */
const ROOT = new Set(["viewBox", "preserveAspectRatio", "aria-hidden", "focusable"]);
const allowed = (name: string): boolean =>
  GEOMETRY.has(name) || PAINT.has(name) || name.startsWith("font-") || BY_CODE.has(name);
const finite = (text: string | null): boolean => text !== null && text.trim() !== "" && Number.isFinite(Number(text));

// ---- The pick (R-20) ----

const STAGES: readonly Stage[] = [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage, ...SMALLEST.map((s) => s.stage)];

/** The drawing's box on a stage: the largest 8:5 rectangle in it, as room.css's `.flat` sizes it. */
function box(stage: Stage): Stage {
  const s = flatScale(stage);
  return { w: FLAT_VIEW.w * s, h: FLAT_VIEW.h * s };
}

/** A point of the view box on a box of this size, which shows the view box at its scale, centred (xMidYMid meet). */
function onBox([x, y]: Point, size: Stage): Point {
  const s = flatScale(size);
  return [(size.w - FLAT_VIEW.w * s) / 2 + x * s, (size.h - FLAT_VIEW.h * s) / 2 + y * s];
}

/** The same point in normalized device coordinates on the box, as bindPointerSelection hands a picker one. */
function ndcOf(p: Point, size: Stage): { x: number; y: number } {
  const [px, py] = onBox(p, size);
  return { x: (px / size.w) * 2 - 1, y: 1 - (py / size.h) * 2 };
}

/** The index's hit rectangles as compose/pick.ts's inputs, each member at its depth. */
const inputs = (index: Pick<RoomIndex, "flat">): PickInput[] =>
  index.flat.hits.map((hit) => ({
    id: hit.selectable,
    members: hit.rects.map((rect, k) => ({ rect, depth: hit.depths[k] ?? Number.POSITIVE_INFINITY })),
  }));

function centreOf(rect: Rect | null): Point {
  if (!rect) throw new Error("no rectangle");
  return [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2];
}

function tap(win: TestWindow, el: Element, [clientX, clientY]: Point, pointerType: string, drag = 0): void {
  const init = { bubbles: true, pointerType, clientX, clientY, button: 0 };
  el.dispatchEvent(new win.PointerEvent("pointerdown", init));
  el.dispatchEvent(new win.PointerEvent("pointerup", { ...init, clientX: clientX + drag }));
}

// ---- The hand-off (FR-008) ----

/** Spec 002's hand on an avatar's flat cut-out, from its feet, in metres: left of its centre by 35% of its width, and up
 *  60% of its height, never above 0.95 m. */
function hand(avatar: AvatarId): Point {
  const { width, height } = AVATAR_SHAPES[avatar];
  return [-width * 0.35, Math.min(0.95, height * 0.6)];
}

const paperCentre = (paper: Element | undefined): number[] => [
  num(paper, "x") + num(paper, "width") / 2,
  num(paper, "y") + num(paper, "height") / 2,
];

/** The modules a module imports for their values, transitively, `import type` left out: each relative one it reaches,
 *  by its path, and each package or virtual module, by its name. */
function valueImports(file: string, seen: Set<string> = new Set()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const m of readFileSync(file, "utf8").matchAll(/^import\s+(?!type\s)(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/gm)) {
    const name = m[1] ?? "";
    if (!name.startsWith(".")) seen.add(name);
    else if (!name.endsWith(".css")) valueImports(resolve(dirname(file), `${name}.ts`), seen);
  }
  return seen;
}

const ROOM_SRC = fileURLToPath(new URL("../../src/room/", import.meta.url));

describe("the drawing (drawFlat)", () => {
  it("draws from the index alone: what it imports reaches neither three.js nor the 3D part, so it never waits on them", () => {
    const reached = [...valueImports(resolve(ROOM_SRC, "flat.ts"))];
    // The walk follows the module's own imports: the kernel's picker and the avatars' shapes among them.
    expect(reached).toContain(resolve(ROOM_SRC, "compose/pick.ts"));
    expect(reached).toContain(resolve(ROOM_SRC, "../choice/avatars.ts"));
    expect(reached.filter((m) => /^three(\/|$)|^virtual:room-scene$|[\\/]room[\\/]scene(\.ts$|[\\/])/.test(m))).toEqual(
      [],
    );
  });

  it("uses only the allowlisted elements and attributes, with typed values: no href, event handler, or style", () => {
    const { doc } = page();
    const { index } = fixture();
    for (const { id } of AVATARS) {
      const { root } = drawFlat(doc, index, id);
      expect([root.localName, root.namespaceURI]).toEqual(["svg", "http://www.w3.org/2000/svg"]);
      expect(root.getAttributeNames().filter((n) => !ROOT.has(n))).toEqual([]);
      expect(root.getAttribute("viewBox")).toBe(index.flat.view_box.join(" "));
      const all = [...root.querySelectorAll("*")];
      // The fixture draws every kind of primitive, so every element of the list is here, and nothing else is.
      expect(new Set(all.map((el) => el.localName))).toEqual(ELEMENTS);
      for (const el of all) {
        const names = el.getAttributeNames();
        expect(
          names.filter((n) => /^on|href|^style$/i.test(n)),
          el.localName,
        ).toEqual([]);
        expect(
          names.filter((n) => !allowed(n)),
          el.localName,
        ).toEqual([]);
        for (const name of names) {
          const value = el.getAttribute(name);
          const where = `<${el.localName} ${name}="${value ?? ""}">`;
          if (name === "fill" || name === "stroke") expect(value, where).toMatch(/^(#[0-9a-f]{6}|none)$/);
          else if (name === "transform") expect(matrixOf(el)?.every(Number.isFinite), where).toBe(true);
          else if (name === "points") expect(pointsOf(el).flat().every(Number.isFinite), where).toBe(true);
          else if (name === "d") expect(value, where).toMatch(/^[MmZzLlHhVvCcSsQqTtAa0-9eE.,+\- ]+$/);
          else if (name === "visibility") expect(value, where).toMatch(/^(visible|hidden)$/);
          else if (name === "text-anchor") expect(value, where).toMatch(/^(start|middle|end)$/);
          else if (GEOMETRY.has(name) || name === "stroke-width" || name === "opacity" || name === "font-size")
            expect(finite(value), where).toBe(true);
        }
      }
    }
  });

  it("refuses a value outside the allowlist rather than draw it, and puts words in as text, never markup", () => {
    const { doc } = page();
    const { index } = fixture();
    const withItem = (primitive: unknown, matrix: number[] = [1, 0, 0, 1, 0, 0]): RoomIndex => ({
      ...index,
      flat: {
        ...index.flat,
        items: [
          {
            placement: "fx-planted",
            matrix: matrix as RoomIndex["flat"]["items"][number]["matrix"],
            primitives: [primitive as Prim],
          },
        ],
      },
    });
    const rect = { primitive: "rect", x: 1, y: 2, w: 3, h: 4, fill: "#112233", stroke: "none", stroke_width: 0 };
    const path = { primitive: "path", d: "M 0 0 L 1 1", fill: "none", stroke: "#112233", stroke_width: 1 };
    expect(() => drawFlat(doc, withItem(rect), "dog")).not.toThrow();
    expect(() => drawFlat(doc, withItem(path), "dog")).not.toThrow();
    const refused: unknown[] = [
      { ...rect, primitive: "image" },
      { ...rect, primitive: "foreignObject" },
      { ...rect, fill: "url(https://example.invalid/p.svg#p)" },
      { ...rect, stroke: "red" },
      { ...rect, x: Number.NaN },
      { ...rect, w: -3 },
      { ...rect, stroke_width: Number.POSITIVE_INFINITY },
      { ...path, d: 'M 0 0" onload="alert(1)' },
      { ...path, d: "url(#p)" },
      {
        ...path,
        primitive: "polygon",
        points: [
          [0, 0],
          [1, "1"],
          [2, 0],
        ],
      },
    ];
    for (const bad of refused) expect(() => drawFlat(doc, withItem(bad), "dog"), JSON.stringify(bad)).toThrow();
    expect(() => drawFlat(doc, withItem(rect, [1, 0, 0, 1, Number.POSITIVE_INFINITY, 0]), "dog")).toThrow();
    expect(() => drawFlat(doc, withItem(rect, [1, 0, 0, 1, 0]), "dog")).toThrow();
    // A word is text: a label made of markup draws as its characters, and makes no element.
    const ui = { ...index.ui, "standin.label": "<img src=x onerror=alert(1)> {name}" };
    const { root } = drawFlat(doc, { ...index, ui }, "dog");
    expect(root.querySelector("img")).toBeNull();
    expect([...root.querySelectorAll("text")].filter((t) => t.textContent?.startsWith("<img src=x"))).toHaveLength(
      index.flat.labels.length,
    );
  });

  it("draws each placement's primitives in a group at its matrix, back to front as the index orders them", () => {
    const { doc } = page();
    const { index } = fixture();
    const drawing = drawFlat(doc, index, "dog");
    expect(index.flat.items.length).toBeGreaterThan(3);
    expect([...drawing.items.keys()]).toEqual(index.flat.items.map((i) => i.placement));
    const groups = [...drawing.items.values()];
    groups.slice(1).forEach((g, k) => expect(groups[k]?.compareDocumentPosition(g)).toBe(4 /* following */));
    for (const item of index.flat.items) {
      const group = drawing.items.get(item.placement);
      expect(group?.localName).toBe("g");
      expect(matrixOf(group)).toEqual(item.matrix);
      expect([...(group?.children ?? [])].map(primOf), item.placement).toEqual(item.primitives);
    }
  });

  it("makes each switch case its own group, toggled by visibility, its cable a quadratic curve, only not-live's shown", () => {
    const { doc } = page();
    const { index } = fixture();
    const drawing = drawFlat(doc, index, "dog");
    expect(index.switches.length).toBeGreaterThan(0);
    expect([...drawing.switches.keys()]).toEqual(index.switches.map((s) => s.id));
    for (const sw of index.switches) {
      const cases = drawing.switches.get(sw.id);
      const poses = index.flat.poses.filter((p) => p.switch === sw.id);
      expect(poses.length).toBeGreaterThan(1);
      expect([...(cases?.keys() ?? [])]).toEqual(poses.map((p) => p.pose));
      for (const pose of poses) {
        const group = cases?.get(pose.pose);
        expect(group?.localName).toBe("g");
        expect(group?.getAttribute("visibility"), pose.pose).toBe(
          pose.pose === sw.cases["not-live"] ? "visible" : "hidden",
        );
        const [shape, cable, ...rest] = [...(group?.children ?? [])];
        expect(rest).toEqual([]);
        expect(matrixOf(shape)).toEqual(pose.matrix);
        expect([...(shape?.children ?? [])].map(primOf)).toEqual(pose.primitives);
        // The cable from the lead's end to where it plugs in: one quadratic curve, through the index's control point.
        expect(cable?.localName).toBe("path");
        expect(cable?.getAttribute("fill")).toBe("none");
        expect(curveOf(cable)).toEqual(pose.cable);
      }
      expect([...(cases?.values() ?? [])].filter((g) => g.getAttribute("visibility") === "visible")).toHaveLength(1);
    }
    // Which case shows is the index's not-live case; a case with no cable draws its pose alone.
    const [sw] = index.switches;
    const other = index.flat.poses.find((p) => p.pose !== sw?.cases["not-live"]);
    if (!sw || !other) throw new Error("the fixture's switch has one pose");
    const changed: RoomIndex = {
      ...index,
      switches: index.switches.map((s) => ({ ...s, cases: { ...s.cases, "not-live": other.pose } })),
      flat: { ...index.flat, poses: index.flat.poses.map((p) => (p === other ? { ...p, cable: null } : p)) },
    };
    const shown = [...(drawFlat(doc, changed, "dog").switches.get(sw.id)?.entries() ?? [])].filter(
      ([, g]) => g.getAttribute("visibility") === "visible",
    );
    expect(shown.map(([name]) => name)).toEqual([other.pose]);
    expect([...(shown[0]?.[1].children ?? [])].map((c) => c.localName)).toEqual(["g"]);
  });

  it("labels each stand-in with the UI word standin.label as SVG text, worded as the 3D room words it", () => {
    const { doc } = page();
    const { index } = fixture();
    const drawing = drawFlat(doc, index, "dog");
    expect(index.flat.labels.length).toBeGreaterThan(1);
    expect([...drawing.labels.keys()]).toEqual(index.flat.labels.map((l) => l.placement));
    for (const l of index.flat.labels) {
      const text = drawing.labels.get(l.placement);
      expect(text?.localName).toBe("text");
      expect(text?.textContent).toBe(standinLabel(index.ui, l.label));
      expect(text?.textContent).not.toContain("{");
      expect([num(text, "x"), num(text, "y")]).toEqual(l.at);
      expect(text?.getAttribute("text-anchor")).toBe("middle");
    }
    // A label whose word the index lacks draws none, as in 3D.
    const absent: RoomIndex = {
      ...index,
      flat: {
        ...index.flat,
        labels: [...index.flat.labels, { placement: "fx-unworded", label: "label.fx-absent", at: [1, 2] }],
      },
    };
    expect(standinLabel(index.ui, "label.fx-absent")).toBeNull();
    expect(drawFlat(doc, absent, "dog").labels.has("fx-unworded")).toBe(false);
  });

  it("cues each selectable with a dashed rectangle around its hit rectangles and its name tag, over every piece", () => {
    const { doc } = page();
    const { index } = fixture();
    const drawing = drawFlat(doc, index, "dog");
    expect([...drawing.cues.keys()]).toEqual(index.selectables.map((s) => s.id));
    const pieces = [...drawing.items.values(), ...[...drawing.switches.values()].flatMap((c) => [...c.values()])];
    for (const hit of index.flat.hits) {
      const cue = drawing.cues.get(hit.selectable);
      const union = unionOf(hit.rects);
      if (!cue || !union) throw new Error(`${hit.selectable} has no cue`);
      expect(cue.area.localName).toBe("rect");
      expect([num(cue.area, "x"), num(cue.area, "y"), num(cue.area, "width"), num(cue.area, "height")]).toEqual([
        ...union,
      ]);
      expect(cue.area.getAttribute("class")).toBe("flat-cue");
      // Its name tag: the selectable's name, at the rectangle's foot, inside it.
      expect(cue.name.localName).toBe("text");
      expect(cue.name.textContent).toBe(index.selectables.find((s) => s.id === hit.selectable)?.name);
      expect(cue.name.getAttribute("class")).toBe("flat-cue-name");
      expect(num(cue.name, "x")).toBeCloseTo(union[0] + union[2] / 2, 9);
      expect(num(cue.name, "y")).toBeGreaterThan(union[1] + union[3] / 2);
      expect(num(cue.name, "y")).toBeLessThanOrEqual(union[1] + union[3]);
      // Drawn after every piece, so none hides it.
      for (const piece of pieces) expect(piece.compareDocumentPosition(cue.area) & 4).toBe(4);
    }
  });

  it("styles the cues and labels from room.css's classes, which name no ID, and holds no button", () => {
    const sheets = stylesheets().map((s) => ({ path: s.path, ...parseCss(s.text) }));
    const css = sheets.find((s) => s.path.endsWith("/room/room.css"));
    if (!css) throw new Error("no room.css");
    const rule = (selector: string): Map<string, string> | undefined =>
      css.rules.find((r) => r.selector.split(",").some((s) => s.trim() === selector))?.declarations;
    // The cue's rectangle is dashed, unfilled, and its tag drawn; from the stylesheet, so no attribute holds a style.
    expect(rule(".flat-cue")?.get("stroke-dasharray")).toBeDefined();
    expect(rule(".flat-cue")?.get("fill")).toBe("none");
    expect(rule(".flat-cue-name")).toBeDefined();
    const { doc } = page();
    const stage = renderFlat(doc, { room: fixture().index, avatar: "dog", select: () => undefined });
    const used = new Set(
      [...stage.element.querySelectorAll("[class]"), stage.element].flatMap((el) =>
        (el.getAttribute("class") ?? "").split(/\s+/),
      ),
    );
    expect(used.size).toBeGreaterThan(2);
    for (const name of used) expect(rule(`.${name}`), name).toBeDefined();
    // The old per-ID hit areas and their buttons are gone: no rule names them, and the drawing has nothing to press.
    const selectors = sheets.flatMap((s) => [...s.rules.map((r) => r.selector), ...s.atRules.map((a) => a.body)]);
    expect(selectors.filter((s) => /flat-hit|\.flat\b[^{},]*\bbutton/.test(s))).toEqual([]);
    expect(stage.element.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
  });

  it("draws the visitor as the chosen avatar's polygons, standing at the index's place and scale", () => {
    const { doc } = page();
    const { index } = fixture();
    const { x, baseline, scale } = index.flat.visitor;
    for (const { id } of AVATARS) {
      const drawing = drawFlat(doc, index, id);
      expect(drawing.visitor.getAttribute("fill")).toBe(AVATAR_SHAPES[id].color);
      expect(drawing.visitor.outerHTML).toBe(avatarPolygons(doc, id, x, baseline, scale).outerHTML);
      expect(drawing.root.contains(drawing.visitor)).toBe(true);
    }
  });

  it("puts the paper at the index's three positions, the first avatar's, and moves it to each avatar's own hand", () => {
    const { doc } = page();
    const { index } = fixture();
    const { papers, visitor } = index.flat;
    const first = hand(AVATARS[0].id);
    for (const { id } of AVATARS) {
      const drawing = drawFlat(doc, index, id);
      expect(drawing.papers).toHaveLength(FLAT_FRAMES);
      // The cut-out stands square to the view at the visitor's scale, so the paper in its hand moves by the hand's
      // offset at that scale, y down; the paper between the two hands moves half as far.
      const own = hand(id);
      const offset = [(own[0] - first[0]) * visitor.scale, -(own[1] - first[1]) * visitor.scale];
      papers.forEach((p, k) =>
        expectClose(
          paperCentre(drawing.papers[k]),
          [p[0] + (offset[0] ?? 0) * (k / 2), p[1] + (offset[1] ?? 0) * (k / 2)],
          1e-9,
          `${id}'s paper ${k}`,
        ),
      );
      if (id === AVATARS[0].id)
        drawing.papers.forEach((paper, k) => expectClose(paperCentre(paper), papers[k] ?? [], 1e-9));
    }
    // The dog holds it 576 mm lower than the first avatar, at the visitor's scale: one anchor would leave it in the air.
    const dog = drawFlat(doc, index, "dog");
    expect(hand("dog")[1] - first[1]).toBeCloseTo(-0.576, 9);
    expect((paperCentre(dog.papers[2])[1] ?? 0) - papers[2][1]).toBeCloseTo(0.576 * visitor.scale, 6);
  });
});

describe("the 2D stage (renderFlat)", () => {
  it("is aria-hidden, with nothing in it to focus or press", () => {
    const { doc } = page();
    const stage = renderFlat(doc, { room: fixture().index, avatar: "man", select: () => undefined });
    expect(stage.mode).toBe("2d");
    expect(stage.element.getAttribute("class")).toBe("flat");
    expect(stage.element.getAttribute("aria-hidden")).toBe("true");
    expect(stage.drawing.root.parentElement).toBe(stage.element);
    expect(stage.drawing.root.getAttribute("aria-hidden")).toBe("true");
    expect(stage.drawing.root.getAttribute("focusable")).toBe("false");
    expect(stage.element.querySelectorAll("button, a, input, select, textarea, [tabindex]")).toHaveLength(0);
  });

  it("shows the paper of the hand-off's still frame, and the paper in the visitor's hands outside it", () => {
    const { doc } = page();
    const stage = renderFlat(doc, { room: fixture().index, avatar: "dinosaur", select: () => undefined });
    const shown = (): (string | null)[] => stage.drawing.papers.map((p) => p.getAttribute("visibility"));
    const frame = (): string | null => stage.element.getAttribute("data-handoff-frame");
    expect([frame(), ...shown()]).toEqual(["2", "hidden", "hidden", "visible"]);
    stage.showHandoff(0);
    expect([frame(), ...shown()]).toEqual(["0", "visible", "hidden", "hidden"]);
    stage.showHandoff(0.4);
    expect([frame(), ...shown()]).toEqual(["1", "hidden", "visible", "hidden"]);
    stage.showHandoff(0.9);
    expect([frame(), ...shown()]).toEqual(["2", "hidden", "hidden", "visible"]);
    stage.showHandoff(1);
    expect([frame(), ...shown()]).toEqual(["2", "hidden", "hidden", "visible"]);
  });

  it.each(STAGES.map((s) => [`${s.w} × ${s.h}`, s] as const))(
    "picks as compose/pick.ts over the index's hit rectangles, each core 44 px at the drawing's scale, on the %s stage",
    (_, stage) => {
      const { index } = fixture();
      const size = box(stage);
      const picker = flatPicker(index.flat.hits);
      picker.resize(size);
      const areas: PickArea[] = pickAreas(inputs(index), CORE_PX / flatScale(stage));
      expect(areas.map((a) => a.id)).toEqual(index.selectables.map((s) => s.id));
      for (const area of areas) expect(picker.pick(ndcOf(centreOf(area.core), size)), area.id).toBe(area.id);
      const differ: string[] = [];
      let none = 0;
      for (let y = 1; y < FLAT_VIEW.h; y += 2)
        for (let x = 1; x < FLAT_VIEW.w; x += 2) {
          const [got, want] = [picker.pick(ndcOf([x, y], size)), pick(areas, [x, y])];
          if (want === null) none += 1;
          if (got !== want && differ.length < 5) differ.push(`${x}, ${y}: ${String(got)}, not ${String(want)}`);
        }
      expect(differ).toEqual([]);
      expect(none).toBeGreaterThan(0);
    },
  );

  it("gives a small selectable a core of 44 CSS pixels at the drawing's scale, and the frontmost member the pick", () => {
    const hits: RoomIndex["flat"]["hits"] = [
      { selectable: "fx-small", rects: [[150, 90, 4, 4]], depths: [3] },
      { selectable: "fx-front", rects: [[20, 20, 60, 40]], depths: [1] },
      { selectable: "fx-back", rects: [[50, 30, 60, 40]], depths: [2] },
    ];
    // Before it knows its size, it picks nothing.
    expect(flatPicker(hits).pick({ x: 0, y: 0 })).toBeNull();
    // Two boxes room.css gives the drawing, and a wider one, which the view box sits centred in.
    for (const size of [
      box(REFERENCE_PHONE.stage),
      box(SMALLEST[0]?.stage ?? REFERENCE_PHONE.stage),
      { w: 900, h: 300 },
    ]) {
      const picker = flatPicker(hits);
      picker.resize(size);
      const half = CORE_PX / 2 / flatScale(size);
      const [cx, cy] = [152, 92];
      const at = (x: number, y: number): string | null => picker.pick(ndcOf([x, y], size));
      const step = 0.5 / flatScale(size);
      expect([at(cx + half - step, cy), at(cx, cy - half + step), at(cx - half + step, cy + half - step)]).toEqual([
        "fx-small",
        "fx-small",
        "fx-small",
      ]);
      expect([at(cx + half + step, cy), at(cx, cy - half - step)]).toEqual([null, null]);
      // Where two selectables' members overlap, the frontmost member wins; beside it, the other's own.
      expect([at(60, 50), at(100, 60)]).toEqual(["fx-front", "fx-back"]);
    }
  });

  it("selects on a tap of a mouse or a finger at each selectable, never on a drag, off every one, or once disposed", () => {
    const { win, doc } = page();
    const { index } = fixture();
    const select = vi.fn<(id: string) => void>();
    const stage = renderFlat(doc, { room: index, avatar: "woman", select });
    doc.body.append(stage.element);
    const size = box(REFERENCE_PHONE.stage);
    const [left, top] = [12, 40];
    stage.element.getBoundingClientRect = () =>
      ({
        left,
        top,
        width: size.w,
        height: size.h,
        right: left + size.w,
        bottom: top + size.h,
        x: left,
        y: top,
      }) as DOMRect;
    const areas = pickAreas(inputs(index), CORE_PX / flatScale(size));
    const client = (p: Point): Point => {
      const [x, y] = onBox(p, size);
      return [left + x, top + y];
    };
    // A tap on the drawing's picture reaches the stage, as a pointer's does.
    const surface = stage.drawing.root;
    for (const area of areas) {
      select.mockClear();
      tap(win, surface, client(centreOf(area.core)), "mouse");
      tap(win, surface, client(centreOf(area.core)), "touch");
      expect(select.mock.calls, area.id).toEqual([[area.id], [area.id]]);
    }
    select.mockClear();
    const [firstArea] = areas;
    tap(win, surface, client(centreOf(firstArea?.core ?? null)), "touch", 40);
    let off: Point | null = null;
    for (let x = 1; x < FLAT_VIEW.w && !off; x += 2)
      for (let y = 1; y < FLAT_VIEW.h && !off; y += 2) if (pick(areas, [x, y]) === null) off = [x, y];
    if (!off) throw new Error("no point off every selectable");
    tap(win, surface, client(off), "mouse");
    expect(select).not.toHaveBeenCalled();
    stage.dispose();
    expect(stage.element.isConnected).toBe(false);
    tap(win, surface, client(centreOf(firstArea?.core ?? null)), "mouse");
    expect(select).not.toHaveBeenCalled();
  });
});

describe("in the room", () => {
  it("draws the index's room at Enter without WebGL, never loading the 3D chunk", async () => {
    const { index } = fixture();
    const v = start({ webgl: false, room: index });
    await enter(v);
    expect(v.room.visit.mode).toBe("2d");
    expect(v.scene.loads).toBe(0);
    const flat = v.doc.querySelector(".flat");
    expect(flat?.getAttribute("aria-hidden")).toBe("true");
    expect([...(flat?.querySelectorAll("text.flat-cue-name") ?? [])].map((t) => t.textContent)).toEqual(
      index.selectables.map((s) => s.name),
    );
  });
});
