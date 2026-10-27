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
import { FLAT_FRAMES, VISITOR_TURN } from "../../src/room/handoff";
import { standinLabel } from "../../src/room/scene/bundle3d";
import { button, enter, intoRoom, parseCss, start, stylesheets, talkLog, textOf } from "../helpers/room";
import type { TestWindow } from "../helpers/room";
import { goodFiles, goodTree, overlay, sideWallFiles, sideWallPolicy, sideWallTree } from "../helpers/room-fixtures";

type Point = readonly [number, number];

let composed: ComposeResult | null = null;
/** The fixture set, composed once a file, as a release build in strict mode. */
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));
const fixtureText = (path: string): string => new TextDecoder().decode(goodFiles().get(path));
let composedMirror: ComposeResult | undefined;
/** The fixture set mirrored: its twin on the visitor's left, its hand on its right, and the visitor's hand anchor on
 *  its left, the side nearer the twin; the fixture itself stands its twin on the visitor's right. */
const mirrored = (): ComposeResult =>
  (composedMirror ??= compose(
    overlay({
      "apps/web/room/scene.yaml": fixtureText("apps/web/room/scene.yaml").replace(
        "mount: { on: fx-desk, anchor: top, offset: [0.48, 0, 0.12] }",
        "mount: { on: fx-desk, anchor: top, offset: [-0.48, 0, 0.12] }",
      ),
      "apps/web/room/catalog/fx-twin.yaml": fixtureText("apps/web/room/catalog/fx-twin.yaml").replace(
        "hand: { at: [-0.1, 0.25, 0.05] }",
        "hand: { at: [0.1, 0.25, 0.05] }",
      ),
      "apps/web/room/catalog/fx-visitor.yaml": fixtureText("apps/web/room/catalog/fx-visitor.yaml").replace(
        "hand: { at: [0.1, 0.25, 0.05] }",
        "hand: { at: [-0.1, 0.25, 0.05] }",
      ),
    }),
    noPolicy(),
    { mode: "strict", drafts: false },
  ));

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

/** Spec 002's hand on an avatar's flat cut-out, from its feet, in metres: off its centre by 35% of its width on a side
 *  (−1 left, +1 right), and up 60% of its height, never above 0.95 m. */
function hand(avatar: AvatarId, side: number): Point {
  const { width, height } = AVATAR_SHAPES[avatar];
  return [side * width * 0.35, Math.min(0.95, height * 0.6)];
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
  it("draws from the index alone: its imports reach neither three.js nor the 3D part, so it never waits", () => {
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
    // The visitor's place and scale, which the avatar's polygons are drawn at, are the index's numbers too.
    for (const key of ["x", "baseline", "scale"] as const) {
      const visitor = { ...index.flat.visitor, [key]: Number.NaN };
      expect(() => drawFlat(doc, { ...index, flat: { ...index.flat, visitor } }, "dog"), key).toThrow();
    }
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

  it("makes each switch case a group toggled by visibility, its cable a quadratic curve, not-live's shown", () => {
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
    // Which case shows is the index's not-live case, by the claims rule (spec 004, T160; contracts/tier-signal.md §2):
    // one naming the plugged pose, or the cloud pose, falls to the shared pose; and a case with no cable draws its pose
    // alone.
    const [sw] = index.switches;
    const shared = sw?.cases["not-live"];
    if (!sw || !shared) throw new Error("the fixture has no switch");
    for (const claimed of [sw.cases.local, sw.cases.cloud]) {
      expect(claimed).not.toBe(shared);
      const changed: RoomIndex = {
        ...index,
        switches: index.switches.map((s) => ({ ...s, cases: { ...s.cases, "not-live": claimed } })),
        flat: { ...index.flat, poses: index.flat.poses.map((p) => (p.pose === shared ? { ...p, cable: null } : p)) },
      };
      const shown = [...(drawFlat(doc, changed, "dog").switches.get(sw.id)?.entries() ?? [])].filter(
        ([, g]) => g.getAttribute("visibility") === "visible",
      );
      expect(
        shown.map(([name]) => name),
        claimed,
      ).toEqual([shared]);
      expect([...(shown[0]?.[1].children ?? [])].map((c) => c.localName)).toEqual(["g"]);
    }
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

  it("cues each selectable: a dashed rectangle around its hit rectangles, its name tag, over every piece", () => {
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

  for (const [setting, result] of [
    ["the twin on the visitor's right", fixture],
    ["the twin on the visitor's left", mirrored],
  ] as const) {
    it(`puts the paper at the index's three positions, moved to each avatar's own hand on the anchor's side, ${setting}`, () => {
      const { doc } = page();
      const { index, findings } = result();
      expect(findings).toEqual([]);
      const { papers, visitor } = index.flat;
      // The paper ends where the data's anchor is, the first avatar's hand on the side nearer the twin.
      const side = setting.endsWith("right") ? 1 : -1;
      expect(Math.sign(papers[2][0] - visitor.x)).toBe(side);
      expect(Math.sign(papers[0][0] - visitor.x)).toBe(side);
      const first = hand(AVATARS[0].id, side);
      for (const { id } of AVATARS) {
        const drawing = drawFlat(doc, index, id);
        expect(drawing.papers).toHaveLength(FLAT_FRAMES);
        // The cut-out stands square to the view at the visitor's scale, so the paper in its hand moves by the hand's
        // offset at that scale, y down; the paper between the two hands moves half as far.
        const own = hand(id, side);
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
      // The dog holds it 576 mm lower than the first avatar, at the visitor's scale: one anchor would leave it in the
      // air; and the man 21 mm nearer his centre, on the anchor's side.
      const dog = drawFlat(doc, index, "dog");
      expect(hand("dog", side)[1] - first[1]).toBeCloseTo(-0.576, 9);
      expect((paperCentre(dog.papers[2])[1] ?? 0) - papers[2][1]).toBeCloseTo(0.576 * visitor.scale, 6);
      const man = drawFlat(doc, index, "man");
      expect((paperCentre(man.papers[2])[0] ?? 0) - papers[2][0]).toBeCloseTo(-side * 0.021 * visitor.scale, 6);
    });

    it(`turns the visitor toward the twin in the middle frame and back in the last, for every avatar, ${setting}`, () => {
      const { doc } = page();
      const { index } = result();
      const { visitor } = index.flat;
      const side = setting.endsWith("right") ? 1 : -1;
      for (const { id } of AVATARS) {
        const stage = renderFlat(doc, { room: index, avatar: id, select: () => undefined });
        const cutout = stage.drawing.visitor;
        // Outside the hand-off, and in its first frame, the cut-out stands square to the view.
        expect(cutout.getAttribute("transform"), id).toBeNull();
        stage.showHandoff(0);
        expect(cutout.getAttribute("transform"), id).toBeNull();
        stage.showHandoff(0.5);
        const m = matrixOf(cutout);
        expect(m, id).not.toBeNull();
        const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = m ?? [];
        const at = ([x, y]: Point): Point => [a * x + c * y + e, b * x + d * y + f];
        // Its feet stay where they stand; it narrows to the cosine of the turn, as a flat figure turning about its
        // feet does seen from the front; and its head leans toward the twin, where the paper comes from.
        expectClose(at([visitor.x, visitor.baseline]), [visitor.x, visitor.baseline], 1e-9, `${id}'s feet`);
        expect(a, id).toBeCloseTo(Math.cos(VISITOR_TURN), 9);
        expect([b, d], id).toEqual([0, 1]);
        const head: Point = [visitor.x, visitor.baseline - AVATAR_SHAPES[id].height * visitor.scale];
        expect(Math.sign(at(head)[0] - head[0]), id).toBe(side);
        stage.showHandoff(1);
        expect(cutout.getAttribute("transform"), id).toBeNull();
        stage.dispose();
      }
    });
  }
});

describe("the 2D stage (renderFlat)", () => {
  // The review of T116, R3.
  it("doesn't turn the visitor under reduced motion, as the 3D room doesn't", () => {
    const { doc } = page();
    const stage = renderFlat(doc, {
      room: fixture().index,
      avatar: "man",
      select: () => undefined,
      reducedMotion: true,
    });
    expect(stage.drawing.turns).toEqual([null, null, null]);
    for (const progress of [0, 0.5, 1]) {
      stage.showHandoff(progress);
      expect(stage.drawing.visitor.getAttribute("transform"), String(progress)).toBeNull();
    }
    // Without it, the middle frame turns the visitor.
    const moving = renderFlat(doc, { room: fixture().index, avatar: "man", select: () => undefined });
    moving.showHandoff(0.5);
    expect(moving.drawing.visitor.getAttribute("transform")).not.toBeNull();
  });

  it("sets its cues' visibility again only when the drawing's size changes, not on every pointer move", () => {
    const { win, doc } = page();
    const { index } = fixture();
    const stage = renderFlat(doc, { room: index, avatar: "man", select: () => undefined });
    doc.body.append(stage.element);
    let size = box(REFERENCE_DESKTOP.stage);
    stage.element.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: size.w, bottom: size.h, width: size.w, height: size.h, x: 0, y: 0 }) as DOMRect;
    stage.resize(size);
    const cue = [...stage.drawing.cues.values()][0];
    if (!cue) throw new Error("no cue");
    const set = vi.spyOn(cue.area, "setAttribute");
    for (let k = 0; k < 5; k += 1) {
      const init = { bubbles: true, pointerType: "mouse", clientX: 10 + 20 * k, clientY: 40 };
      stage.element.dispatchEvent(new win.PointerEvent("pointermove", init));
    }
    stage.resize(size);
    expect(set).not.toHaveBeenCalled();
    size = box(REFERENCE_PHONE.stage);
    stage.element.dispatchEvent(new win.PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }));
    expect(set).toHaveBeenCalled();
    stage.dispose();
  });

  it("picks in the index's own view box", () => {
    // The index's hit rectangles and view box at twice the size: the same picks at the same points of the box.
    const { index } = fixture();
    const twice = (r: Rect): [number, number, number, number] => [r[0] * 2, r[1] * 2, r[2] * 2, r[3] * 2];
    const doubled = {
      ...index,
      flat: {
        ...index.flat,
        view_box: [0, 0, FLAT_VIEW.w * 2, FLAT_VIEW.h * 2] as unknown as RoomIndex["flat"]["view_box"],
        hits: index.flat.hits.map((h) => ({ ...h, rects: h.rects.map(twice) })),
      },
    };
    const size = box(REFERENCE_DESKTOP.stage);
    const [plain, big] = [flatPicker(index.flat.hits, index), flatPicker(doubled.flat.hits, doubled)];
    plain.resize(size);
    big.resize(size);
    const differ: string[] = [];
    for (let y = 1; y < FLAT_VIEW.h; y += 4)
      for (let x = 1; x < FLAT_VIEW.w; x += 4) {
        const ndc = ndcOf([x, y], size);
        if (plain.pick(ndc) !== big.pick(ndc) && differ.length < 5) differ.push(`${x}, ${y}`);
      }
    expect(differ).toEqual([]);
  });

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
      const picker = flatPicker(index.flat.hits, index);
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

  it("gives a small selectable a 44-pixel core at the drawing's scale, and the frontmost member the pick", () => {
    const hits: RoomIndex["flat"]["hits"] = [
      { selectable: "fx-small", rects: [[150, 90, 4, 4]], depths: [3] },
      { selectable: "fx-front", rects: [[20, 20, 60, 40]], depths: [1] },
      { selectable: "fx-back", rects: [[50, 30, 60, 40]], depths: [2] },
    ];
    // The index's selectables and view box, as the picker reads them.
    const index: Pick<RoomIndex, "selectables"> & { flat: Pick<RoomIndex["flat"], "view_box"> } = {
      selectables: [],
      flat: { view_box: [0, 0, FLAT_VIEW.w, FLAT_VIEW.h] },
    };
    // Before it knows its size, it picks nothing.
    expect(flatPicker(hits, index).pick({ x: 0, y: 0 })).toBeNull();
    // Two boxes room.css gives the drawing, and a wider one, which the view box sits centred in.
    for (const size of [
      box(REFERENCE_PHONE.stage),
      box(SMALLEST[0]?.stage ?? REFERENCE_PHONE.stage),
      { w: 900, h: 300 },
    ]) {
      const picker = flatPicker(hits, index);
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

  it("selects on a mouse's or a finger's tap, never on a drag, off every selectable, or once disposed", () => {
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
  // The review of T116, R1: drawFlat throws on anything off its allowlist, and the room still opens (FR-062: never a
  // blank or frozen scene). The drawing is a picture of what the list holds, so the list and "Around the room" carry
  // the room without it. FR-081 (the Author, 2026-10-30: "flat-failed is good, and if the room is failing like that, we
  // show the list"): the stage says why, in the UI word flat-failed, as text a screen reader also reads (T305).
  it("shows flat-failed's line, and the list, text copy, and talk box work, when the drawing refuses", async () => {
    const { index } = fixture();
    // A view box off the drawing's allowlist, as a malformed bundle could carry it.
    const viewBox = [0, 0, Number.NaN, 200] as unknown as RoomIndex["flat"]["view_box"];
    const broken: RoomIndex = { ...index, flat: { ...index.flat, view_box: viewBox } };
    const draw = () =>
      renderFlat(new JSDOM("").window.document, { room: broken, avatar: "dog", select: () => undefined });
    expect(draw).toThrow();
    const v = start({ webgl: false, room: broken });
    await intoRoom(v);
    expect(v.room.visit.mode).toBe("2d");
    expect(v.room.visit.stage).toBe("room");
    expect(v.events).toContainEqual({ kind: "mode_2d" });
    const view = v.doc.querySelector(".room-stage-view");
    expect(view?.querySelector(".flat")).toBeNull();
    expect(view?.querySelector(".room-loading")).toBeNull();
    // The stage shows flat-failed's words exactly, and nothing from them up hides them from assistive technology.
    expect(textOf(view)).toBe("This drawing of the room could not be shown. The list below still works.");
    expect(textOf(view)).toBe(index.ui["flat-failed"]);
    const line = view?.firstElementChild ?? null;
    expect(textOf(line)).toBe(index.ui["flat-failed"]);
    expect(line?.closest("[hidden], [inert], [aria-hidden='true']")).toBeNull();
    // "Around the room": its heading, and each switch's label with its tier sentence, the laptop's among them.
    const around = v.doc.querySelector(".room-around");
    expect(textOf(around?.querySelector("h2") ?? null)).toBe(index.ui["around.heading"]);
    expect(index.switches.length).toBeGreaterThan(0);
    const lines = [...(around?.querySelectorAll("li") ?? [])].map((li) => textOf(li));
    for (const sw of index.switches)
      expect(lines).toContain(`${index.ui[sw.label ?? ""] ?? ""}: ${index.ui["tier.not-live"] ?? ""}`);
    // Each "In the room" button still selects its own selectable (selectObject's object_selected, with its ID).
    const buttons = [...v.doc.querySelectorAll<HTMLButtonElement>(".room-list button[data-object-id]")];
    expect(buttons.map((b) => b.getAttribute("data-object-id"))).toEqual(index.selectables.map((s) => s.id));
    for (const b of buttons) {
      b.click();
      expect(v.events.at(-1)).toEqual({ kind: "object_selected", id: b.getAttribute("data-object-id") });
    }
    // The talk box still answers, as it does with a drawing: the fixed message, and turn_sent.
    const text = v.doc.querySelector<HTMLInputElement>("#talk-text");
    if (!text) throw new Error("no text box");
    text.value = "What is in the room?";
    button(v.doc, "Send").click();
    expect(talkLog(v.doc).lastElementChild?.getAttribute("data-message")).toBe("cannot_talk.unavailable");
    expect(v.events.at(-1)).toEqual({ kind: "turn_sent" });
  });

  it("hands the paper over without turning the visitor under reduced motion", async () => {
    const transformed = (v: ReturnType<typeof start>): number => v.doc.querySelectorAll(".flat [transform]").length;
    const still = start({ webgl: false, reducedMotion: true });
    await enter(still);
    const end = transformed(still);
    still.clock.advance(1500);
    expect(still.doc.querySelector(".flat")?.getAttribute("data-handoff-frame")).toBe("1");
    expect(transformed(still)).toBe(end);
    const moving = start({ webgl: false });
    await enter(moving);
    moving.clock.advance(1500);
    expect(transformed(moving)).toBe(end + 1);
  });

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

// T295 (spec 004; FR-063, FR-064, SC-009; R-20, R-39): FR-064's carve-out in the 2D room, over T292's side-wall overlay
// (test/fixtures/room/README.md), whose two side-wall signs, fx-upper and fx-lower, can't both keep their cores at the
// drawing's smallest scale, on the stages 304 px wide, where their cores meet only each other's: `listOnly`'s release
// pass gives fx-upper, first in scene order, its tap, and fx-lower is list-only there. There the drawing draws no cue
// for it and a pick on it selects nothing; at a larger scale its cue and pick area come back; the overlay's other
// selectables keep theirs at every size.
describe("the 2D room's side-wall selectables (FR-064's carve-out)", () => {
  let built: ComposeResult | undefined;
  const sideWall = (): ComposeResult =>
    (built ??= compose(sideWallTree(), sideWallPolicy(), { mode: "strict", drafts: false }));
  const LIST_ONLY = ["fx-lower"];
  /** The side-wall sign that keeps its tap where the other is list-only (C1's release pass). */
  const KEPT = "fx-upper";
  /** The 2D stage at a stage's size: the drawing's box inside it, as room.css's .flat keeps it. */
  function stageAt(stage: Stage, built: ComposeResult = sideWall()) {
    const { index } = built;
    const { doc, win } = page();
    const select = vi.fn<(id: string) => void>();
    const flat = renderFlat(doc, { room: index, avatar: "woman", select });
    doc.body.append(flat.element);
    const size = box(stage);
    flat.element.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: size.w, bottom: size.h, width: size.w, height: size.h, x: 0, y: 0 }) as DOMRect;
    flat.resize(size);
    const shown = (id: string): string | null =>
      flat.drawing.cues.get(id)?.area.getAttribute("visibility") ?? "visible";
    const at = (id: string): Point => {
      const hit = index.flat.hits.find((h) => h.selectable === id);
      return onBox(centreOf(hit?.rects[0] ?? null), size);
    };
    return { index, flat, win, select, shown, at };
  }

  it("draws no cue for a list-only side-wall selectable on a 304 px stage, and a pick on it selects nothing", () => {
    for (const stage of [
      { w: 304, h: 208 },
      { w: 304, h: 640 },
    ]) {
      const { index, flat, win, select, shown, at } = stageAt(stage);
      expect(flatScale(stage)).toBeCloseTo(0.95, 12);
      expect(index.selectables.map((x) => [x.id, shown(x.id)])).toEqual([
        ["fx-workstation", "visible"],
        ["fx-board", "visible"],
        ["fx-upper", "visible"],
        ["fx-lower", "hidden"],
      ]);
      expect(flat.drawing.cues.get("fx-lower")?.name.getAttribute("visibility")).toBe("hidden");
      for (const id of LIST_ONLY) tap(win, flat.element, at(id), "touch");
      expect(select).not.toHaveBeenCalled();
      // The side-wall sign the release pass keeps, and the selectables that aren't side-wall, keep their pick areas.
      for (const id of [KEPT, "fx-workstation", "fx-board"]) tap(win, flat.element, at(id), "touch");
      expect(select.mock.calls).toEqual([[KEPT], ["fx-workstation"], ["fx-board"]]);
    }
  });

  it("gives them their cues and pick areas back at a larger scale", () => {
    for (const stage of [{ w: 312, h: 224 }, REFERENCE_PHONE.stage, REFERENCE_DESKTOP.stage]) {
      const { index, flat, win, select, shown, at } = stageAt(stage);
      expect(index.selectables.map((x) => shown(x.id))).toEqual(["visible", "visible", "visible", "visible"]);
      for (const id of [KEPT, ...LIST_ONLY, "fx-workstation", "fx-board"]) tap(win, flat.element, at(id), "touch");
      expect(select.mock.calls).toEqual([["fx-upper"], ["fx-lower"], ["fx-workstation"], ["fx-board"]]);
    }
  });

  it("holds them at one size and not the next, as the drawing's box changes", () => {
    const { index } = sideWall();
    const picker = flatPicker(index.flat.hits, index);
    picker.resize(box({ w: 304, h: 248 }));
    expect([...picker.held()]).toEqual(LIST_ONLY);
    picker.resize(box({ w: 320, h: 248 }));
    expect([...picker.held()]).toEqual([]);
  });

  // T303: T302's answer holds a side-wall selectable wherever its core can't fit, at any scale.
  it("holds a side-wall selectable at any scale where its core can't fit, 312 px wide among them", () => {
    const text = (path: string): string => new TextDecoder().decode(sideWallFiles().get(path));
    const variant = compose(
      sideWallTree({
        "apps/web/room/catalog/fx-shell.yaml": text("apps/web/room/catalog/fx-shell.yaml").replace(
          "left-wall: { at: [-0.9, 0, -0.8]",
          "left-wall: { at: [-0.9, 0, -0.95]",
        ),
        "apps/web/room/scene.yaml": text("apps/web/room/scene.yaml").replace(
          "offset: [0, 1.0515, 0] }",
          "offset: [0, 1.0375, 0] }",
        ),
      }),
      sideWallPolicy(),
      { mode: "strict", drafts: false },
    );
    expect(variant.findings).toEqual([]);
    const narrow = stageAt({ w: 312, h: 224 }, variant);
    expect(narrow.index.selectables.map((x) => narrow.shown(x.id))).toEqual([
      "visible",
      "visible",
      "visible",
      "hidden",
    ]);
    for (const id of LIST_ONLY) tap(narrow.win, narrow.flat.element, narrow.at(id), "touch");
    expect(narrow.select).not.toHaveBeenCalled();
    tap(narrow.win, narrow.flat.element, narrow.at(KEPT), "touch");
    expect(narrow.select.mock.calls).toEqual([[KEPT]]);
    const wide = stageAt(REFERENCE_DESKTOP.stage, variant);
    expect(wide.index.selectables.map((x) => wide.shown(x.id))).toEqual(["visible", "visible", "visible", "visible"]);
    for (const id of [KEPT, ...LIST_ONLY]) tap(wide.win, wide.flat.element, wide.at(id), "touch");
    expect(wide.select.mock.calls).toEqual([["fx-upper"], ["fx-lower"]]);
  });
});
