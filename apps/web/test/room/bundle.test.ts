// T080 (spec 004; FR-010, FR-011, FR-013, FR-079; Amendments B7, C11; R-11, R-12, R-26; contracts/room-bundle.md §3 to
// §6, §11): compose()'s bundle over the fixture set. The index exactly as §3.1's RoomIndex, its 2D drawing projected
// through framing(1.6) into the 320 × 200 view box; the 3D part exactly as §3.2's RoomScene, its frame boxes the
// expected bounds at the stylized scale or a set model's measured bounds, grown for a stand-in's label; the digest over
// both; each set model's gzip-9 copy; the drafts modules; room_text; and B7's manifest. Every output is built field by
// field in its schema's order, numbers quantized, with no † field's value. The expectations are computed here from the
// kernel and the fixture files, never copied from the output.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { emit, pathExtent, serialize, viewPath } from "../../build/room/emit";
import { loadRoom } from "../../build/room/load";
import { CAPS_DEFAULTS, noPolicy, policyFrom } from "../../build/room/policy";
import { isPathData } from "../../build/room/schema";
import { readTypefaces } from "../../build/room/typefaces";
import { AVATARS } from "../../src/choice/avatars";
import type { Box } from "../../src/room/compose/bundle";
import { cableControl } from "../../src/room/compose/cable";
import { FOV, framing, withLabel } from "../../src/room/compose/framing";
import { anchorWorld, mountWorld, resolveMounts } from "../../src/room/compose/mount";
import { DEG, IDENTITY, origin, transformPoint } from "../../src/room/compose/math";
import type { Mat4, Vec3 } from "../../src/room/compose/math";
import { memberRect } from "../../src/room/compose/pick";
import { projector, toStage } from "../../src/room/compose/project";
import { TIER_VALUES, TYPEFACE_USES } from "../../src/room/compose/vocabulary";
import { EVENT_KINDS } from "../../src/room/events";
import { png } from "../helpers/glb";
import { goodFiles, goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const sha256 = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");
const good = (options = { mode: "strict" as const, drafts: true }): ComposeResult =>
  compose(goodTree(), noPolicy(), options);
const fixture = (path: string): Record<string, unknown> =>
  parse(decoder.decode(goodFiles().get(`apps/web/${path}`))) as Record<string, unknown>;
const VIEW = { w: 320, h: 200 } as const;

/** Every number in a value, with where it sits. */
function numbers(value: unknown, at = "$", out: [string, number][] = []): [string, number][] {
  if (typeof value === "number") out.push([at, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => numbers(v, `${at}[${i}]`, out));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) numbers(v, `${at}.${k}`, out);
  return out;
}

/** Whether a number is on the grid of 1 ÷ `per` as quantizing writes it: rounded to a whole count, then divided. */
const onGrid = (n: number, per: number): boolean => Math.round(n * per) / per === n;
const near = (a: number, b: number, tolerance = 2e-4): boolean => Math.abs(a - b) <= tolerance;

/** The world transforms of the 3D part's placements, resolved with the kernel from the part itself. */
function worlds(result: ComposeResult): { world: ReadonlyMap<string, Mat4>; model: ReadonlyMap<string, Mat4> } {
  const pieces = Object.fromEntries(
    Object.entries(result.scene.pieces).map(([id, p]) => [id, { scale: p.scale, anchors: p.anchors }]),
  );
  return resolveMounts(result.scene.placements, pieces);
}

/** The 2D drawing's camera: framing(1.6) over the 3D part's framed boxes. */
function flatCamera(result: ComposeResult): ReturnType<typeof framing> {
  return framing(
    1.6,
    result.scene.placements.filter((p) => p.framed).map((p) => p.frame_box),
  );
}

/** A world point in the view box, and the view-box units a metre takes at its depth. */
function inView(result: ComposeResult, point: Vec3): { at: [number, number]; ppm: number } {
  const view = projector(flatCamera(result), 1.6);
  const [x, y] = toStage(view.project(point), VIEW);
  return { at: [x, y], ppm: 100 / (view.depth(point) * Math.tan((FOV / 2) * DEG)) };
}

/** Where a placement's drawing stands: its origin pushed back to the farthest depth of its frame box, which the 2D
 *  camera, looking down −Z, meets at the box's least z. */
function inPlane(result: ComposeResult, id: string): { at: [number, number]; ppm: number } {
  const o = origin(worlds(result).world.get(id) ?? IDENTITY);
  const box = result.scene.placements.find((p) => p.id === id)?.frame_box;
  return inView(result, [o[0], o[1], box?.min[2] ?? o[2]]);
}

/** The world box of a piece-frame box under a transform: its eight corners' bounds. */
function worldBox(m: Mat4, box: Box): Box {
  const corners: Vec3[] = [];
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) corners.push([x, y, z]);
  const points = corners.map((c) => transformPoint(m, c));
  const axis = (i: 0 | 1 | 2, f: (...v: number[]) => number): number => f(...points.map((p) => p[i]));
  return {
    min: [axis(0, Math.min), axis(1, Math.min), axis(2, Math.min)],
    max: [axis(0, Math.max), axis(1, Math.max), axis(2, Math.max)],
  };
}

const sameBox = (a: Box, b: Box): boolean =>
  [0, 1, 2].every((i) => near(a.min[i] ?? 0, b.min[i] ?? 0, 2e-6)) &&
  [0, 1, 2].every((i) => near(a.max[i] ?? 0, b.max[i] ?? 0, 2e-6));

describe("the index (contracts/room-bundle.md §3.1)", () => {
  it("is written field by field in §3.1's order", () => {
    const { index } = good();
    expect(Object.keys(index)).toEqual([
      "schema",
      "digest",
      "build",
      "live",
      "ui",
      "selectables",
      "topics",
      "faces",
      "switches",
      "flat",
      "copy",
      "typefaces",
    ]);
    expect(Object.keys(index.build)).toEqual(["kind", "placeholders"]);
    expect(Object.keys(index.live)).toEqual(["source", "turn", "asset_events", "poll_ms", "freshness_ms"]);
    expect(Object.keys(index.faces[0] ?? {})).toEqual([
      "id",
      "placement",
      "role",
      "readable",
      "label",
      "atmosphere",
      "max_chars",
      "px",
      "screen_css",
      "regions",
    ]);
    expect(Object.keys(index.faces[0]?.regions[0] ?? {})).toEqual(["rect", "renderer", "grid", "source"]);
    expect(Object.keys(index.flat)).toEqual([
      "view_box",
      "items",
      "poses",
      "faces",
      "hits",
      "labels",
      "papers",
      "visitor",
    ]);
    expect(Object.keys(index.typefaces[0] ?? {})).toEqual(["use", "family", "weight", "cap_ratio", "fallback"]);
  });

  it("carries the build's kind, the live configuration in milliseconds, and every UI word by key, slots unfilled", () => {
    expect(good().index.build).toEqual({ kind: "drafts", placeholders: true });
    const release = good({ mode: "strict", drafts: false }).index;
    expect(release.build).toEqual({ kind: "release", placeholders: true });
    expect(release.live).toEqual({
      source: "off",
      turn: "off",
      asset_events: "off",
      poll_ms: 30000,
      freshness_ms: 35000,
    });
    const words = (fixture("room/ui-words.yaml").words ?? {}) as Record<string, string>;
    expect(release.ui).toEqual(words);
    expect(Object.keys(release.ui)).toEqual(Object.keys(words).sort());
    expect(release.ui["standin.label"]).toBe("{name} (a stand-in)");
  });

  it("takes a UI word that states something about the Author by its text alone", () => {
    const ui = decoder
      .decode(goodFiles().get("apps/web/room/ui-words.yaml"))
      .replace(
        "  toolbar.credits: Credits\n",
        "  toolbar.credits:\n    text: Credits\n    about_author: true\n    claims: [{ file: corpus/90-fx-work.md, quote: fx }]\n",
      );
    const { index } = compose(overlay({ "apps/web/room/ui-words.yaml": ui }), noPolicy(), {
      mode: "lenient",
      drafts: true,
    });
    expect(index.ui["toolbar.credits"]).toBe("Credits");
    expect(JSON.stringify(index)).not.toContain("corpus/90-fx-work.md");
  });

  it("lists the selectables in scene order with no lead, and every topic unready", () => {
    const { index } = good();
    expect(index.selectables).toEqual([
      {
        id: "fx-workstation",
        name: "Fixture workstation",
        members: ["fx-monitor", "fx-laptop"],
        action: { kind: "talk", topic: "fx-work" },
      },
      { id: "fx-board", name: "Fixture board", members: ["fx-board"], action: { kind: "resume" } },
    ]);
    expect(index.topics).toEqual([{ id: "fx-work", phrase: "fixture work", ready: false }]);
    expect(JSON.stringify(index)).not.toContain("Fixture lead");
  });

  it("binds each face in placement order with its regions' grids and sources", () => {
    const { index } = good();
    expect(index.faces.map((f) => f.id)).toEqual([
      "fx-monitor.screen",
      "fx-neon.panel",
      "fx-board.slate",
      "fx-sign.lettering",
    ]);
    const [screen, panel, slate, lettering] = index.faces;
    expect(screen).toMatchObject({
      placement: "fx-monitor",
      role: "screen",
      readable: true,
      label: "label.fx-screen",
      atmosphere: false,
      max_chars: null,
      px: [560, 360],
      regions: [
        { rect: [0, 0, 1, 1], renderer: "terminal", grid: { cols: 12, rows: 3 }, source: { room_text: "fx-script" } },
      ],
    });
    expect(panel?.regions).toEqual([
      { rect: [0, 0, 0.32, 0.45], renderer: "neon", grid: { chars: 10 }, source: { ui: ["sign.word"] } },
      { rect: [0, 0.5, 1, 0.5], renderer: "neon", grid: { chars: 24 }, source: { signal: "turn-cost", part: "call" } },
      {
        rect: [0.32, 0, 0.68, 0.4],
        renderer: "neon",
        grid: { chars: 24 },
        source: { signal: "turn-cost", part: "visit" },
      },
    ]);
    expect(slate?.regions).toEqual([
      { rect: [0, 0, 1, 1], renderer: "chalk", grid: { rows: 3 }, source: { room_text: "fx-notes" } },
    ]);
    expect(lettering?.regions).toEqual([
      { rect: [0, 0, 1, 1], renderer: "sign", grid: null, source: { room_text: "fx-sign-words" } },
    ]);
  });

  it("gives each face its largest on-screen size at the reference stages, in its own aspect", () => {
    const { index } = good();
    for (const face of index.faces) {
      const [w, h] = face.screen_css;
      expect(w, face.id).toBeGreaterThan(1);
      expect(h, face.id).toBeGreaterThan(1);
      expect(onGrid(w, 1e4) && onGrid(h, 1e4), face.id).toBe(true);
    }
    const screen = index.faces[0];
    // A face square to the camera keeps its aspect on screen: 0.56 × 0.36.
    expect(near((screen?.screen_css[0] ?? 0) / (screen?.screen_css[1] ?? 1), 0.56 / 0.36, 0.05)).toBe(true);
  });

  it("maps every tier value to its pose, in the vocabulary's order", () => {
    const { switches } = good().index;
    expect(switches).toEqual([
      {
        id: "fx-power",
        signal: "tier",
        label: "label.fx-power",
        cases: {
          local: "fx-plugged",
          cloud: "fx-cloud",
          resting: "fx-resting",
          budget: "fx-resting",
          unavailable: "fx-resting",
          unknown: "fx-resting",
          paused: "fx-resting",
          "not-live": "fx-resting",
        },
      },
    ]);
    expect(Object.keys(switches[0]?.cases ?? {})).toEqual([...TIER_VALUES]);
  });

  it("fills a value its cases leave out with the switch's default", () => {
    const scene = decoder
      .decode(goodFiles().get("apps/web/room/scene.yaml"))
      .replace("      paused: fx-resting\n      not-live: fx-resting\n", "")
      .replace("    cable:\n", "    default: fx-resting\n    cable:\n");
    const { index } = compose(overlay({ "apps/web/room/scene.yaml": scene }), noPolicy(), {
      mode: "lenient",
      drafts: true,
    });
    expect(index.switches[0]?.cases.paused).toBe("fx-resting");
    expect(Object.keys(index.switches[0]?.cases ?? {})).toEqual([...TIER_VALUES]);
  });

  it("lists the text copy by reference: the bound faces, the switches, the sign's figures, and the fixed lines", () => {
    expect(good().index.copy).toEqual([
      { face: "fx-monitor.screen" },
      { face: "fx-neon.panel" },
      { face: "fx-board.slate" },
      { face: "fx-sign.lettering" },
      { switch: "fx-power" },
      { figures: true },
      { line: "around.illustration" },
      { line: "sign.not_affiliated" },
      { line: "pause.paused_at" },
    ]);
  });

  it("carries each typeface use's family, weight, cap ratio, and fallback, as the compositor measured them", () => {
    const { index } = good();
    const look = fixture("room/looks/fx-cel.yaml");
    const read = readTypefaces(goodTree(), [
      { file: "apps/web/room/looks/fx-cel.yaml", typefaces: look.typefaces as never },
    ]);
    const expected = read.looks[0]?.typefaces ?? [];
    expect(index.typefaces.map((t) => t.use)).toEqual([...TYPEFACE_USES]);
    index.typefaces.forEach((t, i) => {
      const e = expected[i];
      expect({ ...t, cap_ratio: 0 }).toEqual({ ...e, cap_ratio: 0 });
      expect(near(t.cap_ratio, e?.cap_ratio ?? 0, 1e-6)).toBe(true);
    });
  });
});

describe("the 2D drawing (flat)", () => {
  it("draws every placement but the visitor's, back to front, in a 320 × 200 view box", () => {
    const { flat } = good().index;
    expect(flat.view_box).toEqual([0, 0, 320, 200]);
    expect(flat.items.map((i) => i.placement)).toEqual([
      "fx-shell",
      "fx-board",
      "fx-desk",
      "fx-monitor",
      "fx-neon",
      "fx-laptop",
      "fx-twin",
      "fx-sign",
    ]);
  });

  it("holds numbers and resolved colours only, from the allowlist, so it sets attributes and never style", () => {
    const { flat } = good().index;
    const text = JSON.stringify(flat);
    for (const banned of ["style", "href", "<", "url(", "javascript"]) expect(text).not.toContain(banned);
    for (const item of [...flat.items, ...flat.poses]) {
      expect(item.matrix).toHaveLength(6);
      for (const p of item.primitives) {
        expect(p.fill).toMatch(/^(#[0-9a-f]{6}|none)$/);
        expect(p.stroke).toMatch(/^(#[0-9a-f]{6}|none)$/);
        if (p.primitive === "path") expect(isPathData(p.d)).toBe(true);
      }
    }
    // View-box units to 1e-4; a hit's depth is metres, to 1e-6.
    for (const [at, n] of numbers(flat))
      expect(onGrid(n, at.includes(".depths[") ? 1e6 : 1e4), `${at} = ${n}`).toBe(true);
  });

  it("places each drawing in its plane, its origin pushed back to its box's farthest depth, scaled for that depth", () => {
    const result = good();
    const desk = result.index.flat.items.find((i) => i.placement === "fx-desk");
    const { at, ppm } = inPlane(result, "fx-desk");
    expect(desk?.matrix.map((n, i) => (i < 4 ? n : 0))).toEqual([1, 0, 0, 1, 0, 0]);
    expect(near(desk?.matrix[4] ?? 0, at[0]) && near(desk?.matrix[5] ?? 0, at[1])).toBe(true);
    // fx-desk's own drawing: a rect from (-0.6, 0), 1.2 × 0.75 m, and a line at y 0.71, in metres, y up.
    const [rect, line] = desk?.primitives ?? [];
    expect(Object.keys(rect ?? {})).toEqual(["fill", "stroke", "stroke_width", "primitive", "x", "y", "w", "h"]);
    expect(rect).toMatchObject({ fill: "#9c6b3f", stroke: "#1d1d1f", primitive: "rect" });
    const r = rect as { x: number; y: number; w: number; h: number; stroke_width: number };
    expect([r.x, r.y, r.w, r.h, r.stroke_width].map((n) => n / ppm)).toEqual(
      [-0.6, -0.75, 1.2, 0.75, 0.01].map((n) => expect.closeTo(n, 3)),
    );
    const l = line as { x1: number; y1: number; x2: number; y2: number };
    expect([l.x1, l.y1, l.x2, l.y2].map((n) => n / ppm)).toEqual(
      [-0.6, -0.71, 0.6, -0.71].map((n) => expect.closeTo(n, 3)),
    );
  });

  it("scales a drawing by its piece's stylized scale", () => {
    const result = good();
    const sign = result.index.flat.items.find((i) => i.placement === "fx-sign");
    const { ppm } = inPlane(result, "fx-sign");
    const rect = sign?.primitives[0] as { w: number; h: number } | undefined;
    // fx-sign's rect is 0.3 × 0.12 m at a stylized scale of 1.25.
    expect((rect?.w ?? 0) / ppm).toBeCloseTo(0.375, 3);
    expect((rect?.h ?? 0) / ppm).toBeCloseTo(0.15, 3);
  });

  it("derives a drawing from the stand-in: a box or a plane as a rectangle, a sphere or a circle as a circle", () => {
    const result = good();
    const monitor = result.index.flat.items.find((i) => i.placement === "fx-monitor");
    expect(monitor?.primitives.map((p) => [p.primitive, p.fill])).toEqual([
      ["rect", "#1d1d1f"],
      ["rect", "#20303a"],
    ]);
    const { ppm } = inPlane(result, "fx-monitor");
    // Its box, 0.6 × 0.42 m centred at (0, 0.21): from (-0.3, 0) up to 0.42.
    const box = monitor?.primitives[0] as { x: number; y: number; w: number; h: number };
    expect([box.x, box.y, box.w, box.h].map((n) => n / ppm)).toEqual(
      [-0.3, -0.42, 0.6, 0.42].map((n) => expect.closeTo(n, 3)),
    );
  });

  it("draws each pose of a switch with its cable's run as a quadratic curve", () => {
    const result = good();
    const { poses } = result.index.flat;
    expect(poses.map((p) => [p.switch, p.pose])).toEqual([
      ["fx-power", "fx-plugged"],
      ["fx-power", "fx-cloud"],
      ["fx-power", "fx-resting"],
    ]);
    const { world } = worlds(result);
    const plug = result.scene.pieces["fx-plug"];
    const desk = result.scene.pieces["fx-desk"];
    const sw = result.scene.switches[0];
    const pose = sw?.poses["fx-cloud"];
    if (!plug || !desk || !pose || !sw?.cable) throw new Error("the fixture's switch is missing");
    const parent = result.scene.placements.find((p) => p.id === pose.mount.on);
    const parentAnchor = result.scene.pieces[parent?.piece ?? ""]?.anchors[pose.mount.anchor];
    if (!parent || !parentAnchor) throw new Error("the pose's mount doesn't resolve");
    const at = mountWorld(
      world.get(parent.id) ?? IDENTITY,
      result.scene.pieces[parent.piece]?.scale ?? 1,
      parentAnchor,
      pose.mount.offset,
      pose.mount.turn,
    );
    const lead = plug.anchors[sw.cable.from];
    const edge = desk.anchors[sw.cable.to.anchor];
    if (!lead || !edge) throw new Error("the cable's anchors are missing");
    const from = origin(anchorWorld(at, plug.scale, lead));
    const to = origin(anchorWorld(world.get("fx-desk") ?? IDENTITY, desk.scale, edge));
    const cable = poses[1]?.cable;
    const expected = [from, cableControl(from, to, sw.cable.sag), to].map((p) => inView(result, p).at);
    expect([cable?.from, cable?.control, cable?.to].flat().map((n) => n ?? NaN)).toEqual(
      expected.flat().map((n) => expect.closeTo(n, 3)),
    );
  });

  it("frames each bound face where the renderers' SVG backend draws, its size in view-box units", () => {
    const result = good();
    const { flat } = result.index;
    expect(flat.faces.map((f) => f.face)).toEqual(result.index.faces.map((f) => f.id));
    const { at, ppm } = inPlane(result, "fx-monitor");
    const screen = flat.faces[0];
    // The screen, 0.56 × 0.36 m centred at (0, 0.22) on the monitor: its top-left at (-0.28, 0.4).
    expect(screen?.size.map((n) => n / ppm)).toEqual([0.56, 0.36].map((n) => expect.closeTo(n, 3)));
    expect(screen?.matrix.slice(0, 4)).toEqual([1, 0, 0, 1]);
    expect(((screen?.matrix[4] ?? 0) - at[0]) / ppm).toBeCloseTo(-0.28, 3);
    expect(((screen?.matrix[5] ?? 0) - at[1]) / ppm).toBeCloseTo(-0.4, 3);
  });

  it("gives each selectable's members' rectangles and depths, the stand-ins' labels, the papers, and the visitor", () => {
    const result = good();
    const { flat } = result.index;
    expect(flat.hits.map((h) => [h.selectable, h.rects.length, h.depths.length])).toEqual([
      ["fx-workstation", 2, 2],
      ["fx-board", 1, 1],
    ]);
    for (const h of flat.hits) for (const d of h.depths) expect(d).toBeGreaterThan(0);
    // The monitor's rectangle is its frame box projected through framing(1.6), as RG6 checks it, so it covers its
    // drawing.
    const frame = result.scene.placements.find((p) => p.id === "fx-monitor")?.frame_box as Box;
    const projected = memberRect(frame, flatCamera(result), VIEW);
    const [x = NaN, y = NaN, w = NaN, h = NaN] = flat.hits[0]?.rects[0] ?? [];
    expect([x, y, w, h].every((n, i) => near(n, projected?.rect[i] ?? NaN))).toBe(true);
    expect(near(flat.hits[0]?.depths[0] ?? NaN, projected?.depth ?? NaN, 1e-5)).toBe(true);
    const monitor = flat.items.find((i) => i.placement === "fx-monitor");
    const box = monitor?.primitives[0] as { x: number; y: number; w: number; h: number };
    const [left, top] = [(monitor?.matrix[4] ?? 0) + box.x, (monitor?.matrix[5] ?? 0) + box.y];
    expect(x <= left + 1e-4 && y <= top + 1e-4 && x + w >= left + box.w - 1e-4 && y + h >= top + box.h - 1e-4).toBe(
      true,
    );
    // Only the placements showing a stand-in that have a label: never a figure's.
    expect(flat.labels.map((l) => [l.placement, l.label])).toEqual([
      ["fx-desk", "label.fx-desk"],
      ["fx-monitor", "label.fx-monitor"],
      ["fx-laptop", "label.fx-laptop"],
    ]);
    const { world } = worlds(result);
    const twin = result.scene.pieces["fx-twin"];
    const visitor = result.scene.pieces["fx-visitor"];
    const hand = (id: string, piece: typeof twin): Vec3 =>
      origin(
        anchorWorld(
          world.get(id) ?? IDENTITY,
          piece?.scale ?? 1,
          piece?.anchors.hand ?? { at: [0, 0, 0], turn: { x: 0, y: 0, z: 0 } },
        ),
      );
    const [a, b] = [hand("fx-twin", twin), hand("fx-visitor", visitor)];
    const middle: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.35, (a[2] + b[2]) / 2];
    expect(flat.papers.flat()).toEqual(
      [a, middle, b].flatMap((p) => inView(result, p).at).map((n) => expect.closeTo(n, 3)),
    );
    const feet = inView(result, origin(world.get("fx-visitor") ?? IDENTITY));
    expect(flat.visitor.x).toBeCloseTo(feet.at[0], 3);
    expect(flat.visitor.baseline).toBeCloseTo(feet.at[1], 3);
    expect(flat.visitor.scale).toBeCloseTo(feet.ppm, 3);
  });
});

describe("the 2D drawing's primitives", () => {
  it("take path data to view-box units, y flipped: relative and implicit commands, and an arc's rotation and sweep", () => {
    expect(viewPath("M 0 0 L 1 2 Z", 10)).toBe("M 0 0 L 10 -20 Z");
    expect(viewPath("m 1 1 l 2 -1 h 3 v 4 z", 10)).toBe("m 10 -10 l 20 10 h 30 v -40 z");
    expect(viewPath("M 0 0 1 1 2 2", 10)).toBe("M 0 0 10 -10 20 -20");
    expect(viewPath("C 1 2 3 4 5 6 S 1 1 2 2 Q 1 1 2 2 T 3 3", 10)).toBe(
      "C 10 -20 30 -40 50 -60 S 10 -10 20 -20 Q 10 -10 20 -20 T 30 -30",
    );
    expect(viewPath("M 0 0 A 1 2 30 0 1 3 4", 10)).toBe("M 0 0 A 10 20 -30 0 0 30 -40");
    // An arc's flags read as single digits, as SVG reads them.
    expect(viewPath("M0,0a1,1 0 0110,10", 10)).toBe("M 0 0 a 10 10 0 0 0 100 -100");
    expect(viewPath("M 0 0 L 1e-7 0.00004", 10)).toBe("M 0 0 L 0 -0.0004");
    expect(isPathData(viewPath("M 0.123456 -2 l 1.5e2 .5", 3.3) ?? "")).toBe(true);
  });

  it("bound a path by its end and control points, and an arc by its ellipse", () => {
    expect(pathExtent("M 1 1 L 3 2 H 0 V 5 Z")).toEqual([0, 1, 3, 5]);
    expect(pathExtent("m 1 1 l 1 1 l 1 -3")).toEqual([1, -1, 3, 2]);
    expect(pathExtent("M 0 0 C 0 -2 4 -2 4 0")).toEqual([0, -2, 4, 0]);
    // A half circle of radius 1 from (0, 0) to (2, 0): its circle's bounds, a radius too small grown to fit.
    expect(pathExtent("M 0 0 A 1 1 0 0 1 2 0")).toEqual([0, -1, 2, 1]);
    expect(pathExtent("M 0 0 A 0.5 0.5 0 0 1 2 0")).toEqual([0, -1, 2, 1]);
    expect(pathExtent("")).toBeNull();
  });

  it("derive each stand-in shape's front elevation: turned and scaled, a torus as a ring and a tube as a line", () => {
    const laptop = decoder
      .decode(goodFiles().get("apps/web/room/catalog/fx-laptop.yaml"))
      .replace(
        /standin:\n( {2}- .*\n)+/,
        [
          "standin:",
          "  - { shape: torus, radius: 0.05, tube: 0.01, at: [0, 0.1, 0], color: fx-ink }",
          "  - { shape: tube, from: [-0.1, 0, 0], to: [0.1, 0.1, 0], radius: 0.005, at: [0, 0.05, 0], color: fx-ink }",
          "  - { shape: polygon, points: [[0, 0], [0.1, 0], [0.05, 0.1]], depth: 0.01, at: [-0.15, 0, 0], color: fx-ink }",
          "  - { shape: box, size: [0.2, 0.02, 0.1], at: [0, 0.01, 0], turn: { y: 90 }, color: fx-ink }",
          "  - { shape: sphere, radius: 0.02, scale: [2, 1, 1], at: [0.1, 0.15, 0], color: fx-ink }",
          "  - { shape: cylinder, radius: 0.02, height: 0.1, at: [0, 0.05, 0], color: fx-ink }",
          "  - { shape: capsule, radius: 0.02, length: 0.1, at: [0, 0.07, 0], color: fx-ink }",
          "  - { shape: circle, radius: 0.03, at: [0, 0.1, 0.1], color: fx-ink, lit: false }",
          "",
        ].join("\n"),
      );
    const result = compose(overlay({ "apps/web/room/catalog/fx-laptop.yaml": laptop }), noPolicy(), {
      mode: "lenient",
      drafts: true,
    });
    const item = result.index.flat.items.find((i) => i.placement === "fx-laptop");
    const { ppm } = inPlane(result, "fx-laptop");
    // Each primitive's numbers back in the drawing's metres, y up, its colours and kind beside them.
    const metres = (item?.primitives ?? []).map((p) => {
      const { fill, stroke, stroke_width, primitive, ...rest } = p as unknown as Record<string, unknown> & {
        fill: string;
        stroke: string;
        stroke_width: number;
        primitive: string;
      };
      const back = (v: unknown, key: string): unknown =>
        Array.isArray(v)
          ? v.map((pair: number[]) => [(pair[0] ?? 0) / ppm, -(pair[1] ?? 0) / ppm])
          : /^(y|y1|y2|cy)$/.test(key)
            ? -(v as number) / ppm
            : (v as number) / ppm;
      return {
        primitive,
        fill,
        stroke,
        stroke_width: stroke_width / ppm,
        ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, back(v, k)])),
      };
    });
    const ink = "#1d1d1f";
    const close = (n: number): unknown => expect.closeTo(n, 3);
    expect(metres).toEqual([
      {
        primitive: "circle",
        fill: "none",
        stroke: ink,
        stroke_width: close(0.02),
        cx: close(0),
        cy: close(0.1),
        r: close(0.05),
      },
      {
        primitive: "line",
        fill: "none",
        stroke: ink,
        stroke_width: close(0.01),
        x1: close(-0.1),
        y1: close(0.05),
        x2: close(0.1),
        y2: close(0.15),
      },
      {
        primitive: "polygon",
        fill: ink,
        stroke: "none",
        stroke_width: 0,
        points: [
          [close(-0.15), close(0)],
          [close(-0.05), close(0)],
          [close(-0.1), close(0.1)],
        ],
      },
      // A rect's y is its top: the drawing's y + h, flipped.
      {
        primitive: "rect",
        fill: ink,
        stroke: "none",
        stroke_width: 0,
        x: close(-0.05),
        y: close(0.02),
        w: close(0.1),
        h: close(0.02),
      },
      {
        primitive: "ellipse",
        fill: ink,
        stroke: "none",
        stroke_width: 0,
        cx: close(0.1),
        cy: close(0.15),
        rx: close(0.04),
        ry: close(0.02),
      },
      {
        primitive: "rect",
        fill: ink,
        stroke: "none",
        stroke_width: 0,
        x: close(-0.02),
        y: close(0.1),
        w: close(0.04),
        h: close(0.1),
      },
      {
        primitive: "rect",
        fill: ink,
        stroke: "none",
        stroke_width: 0,
        x: close(-0.02),
        y: close(0.14),
        w: close(0.04),
        h: close(0.14),
      },
      { primitive: "circle", fill: ink, stroke: "none", stroke_width: 0, cx: close(0), cy: close(0.1), r: close(0.03) },
    ]);
  });
});

describe("the 3D part (contracts/room-bundle.md §3.2)", () => {
  it("is written field by field in §3.2's order", () => {
    const { scene } = good();
    expect(Object.keys(scene)).toEqual([
      "schema",
      "digest",
      "pieces",
      "placements",
      "switches",
      "look",
      "figures",
      "handoff",
      "load_order",
    ]);
    expect(Object.keys(scene.placements[0] ?? {})).toEqual([
      "id",
      "piece",
      "mount",
      "offset",
      "turn",
      "framed",
      "frame_box",
      "label",
      "model",
    ]);
    expect(Object.keys(scene.switches[0] ?? {})).toEqual(["id", "piece", "poses", "cable", "model"]);
  });

  it("holds each piece the scene places at scale 1, its stand-in's shapes resolved", () => {
    const { scene } = good();
    expect(Object.keys(scene.pieces)).toEqual([
      "fx-board",
      "fx-desk",
      "fx-laptop",
      "fx-monitor",
      "fx-neon",
      "fx-plug",
      "fx-shell",
      "fx-sign",
      "fx-twin",
      "fx-visitor",
    ]);
    expect(scene.pieces["fx-monitor"]).toEqual({
      scale: 1,
      anchors: { "top-edge": { at: [0, 0.42, 0], turn: { x: 0, y: 0, z: 0 } } },
      standin: [
        {
          at: [0, 0.21, -0.005],
          turn: { x: 0, y: 0, z: 0 },
          scale: [1, 1, 1],
          color: "#1d1d1f",
          lit: true,
          shape: "box",
          size: [0.6, 0.42, 0.04],
        },
        {
          at: [0, 0.22, 0.02],
          turn: { x: 0, y: 0, z: 0 },
          scale: [1, 1, 1],
          color: "#20303a",
          lit: false,
          shape: "plane",
          size: [0.56, 0.36],
        },
      ],
      faces: { screen: { at: [0, 0.22, 0.025], size: [0.56, 0.36], facing: [0, 0, 1], up: [0, 1, 0] } },
      glows: { "fx-screen-glow": { at: [0, 0.22, 0.02], radius: 0.3, tone: "fx-cool", motion: "breathe", level: 1 } },
    });
    expect(scene.pieces["fx-plug"]?.scale).toBe(2);
    expect(scene.pieces["fx-visitor"]?.standin.map((s) => s.shape)).toEqual(["capsule", "sphere"]);
  });

  it("keeps the placements as authored, in scene order, with their frame boxes in the world", () => {
    const result = good();
    const { scene } = result;
    expect(scene.placements.map((p) => p.id)).toEqual(
      ((fixture("room/scene.yaml").placements ?? []) as { id: string }[]).map((p) => p.id),
    );
    expect(scene.placements[0]).toMatchObject({ id: "fx-shell", mount: null, offset: [0, 0, 0], label: null });
    expect(scene.placements[1]).toMatchObject({
      id: "fx-desk",
      piece: "fx-desk",
      mount: { on: "fx-shell", anchor: "floor" },
      offset: [0, 0, -0.6],
      turn: { x: 0, y: 0, z: 0 },
      framed: false,
      label: "label.fx-desk",
      model: null,
    });
    expect(scene.placements[4]?.turn).toEqual({ x: 0, y: -10, z: 0 });
    const { model } = worlds(result);
    // A stand-in with a label is grown for it; one without isn't.
    const monitor = scene.placements.find((p) => p.id === "fx-monitor");
    const monitorBounds = { min: [-0.3, 0, -0.025], max: [0.3, 0.42, 0.025] } as const;
    expect(
      sameBox(monitor?.frame_box as Box, withLabel(worldBox(model.get("fx-monitor") ?? IDENTITY, monitorBounds))),
    ).toBe(true);
    const sign = scene.placements.find((p) => p.id === "fx-sign");
    const signBounds = { min: [-0.15, 0, -0.01], max: [0.15, 0.12, 0.01] } as const;
    expect(sameBox(sign?.frame_box as Box, worldBox(model.get("fx-sign") ?? IDENTITY, signBounds))).toBe(true);
  });

  it("holds the switches with their poses and cable, the look without its notes, the figures, and the hand-off", () => {
    const { scene } = good();
    expect(scene.switches).toEqual([
      {
        id: "fx-power",
        piece: "fx-plug",
        poses: {
          "fx-cloud": {
            mount: { on: "fx-desk", anchor: "back-edge", offset: [0.4, 0, 0.05], turn: { x: 0, y: 0, z: 0 } },
            glows: [],
          },
          "fx-plugged": {
            mount: { on: "fx-laptop", anchor: "port", offset: [0.03, 0, 0], turn: { x: 0, y: 90, z: 0 } },
            glows: [{ placement: "fx-laptop", glow: "fx-charge", level: 1 }],
          },
          "fx-resting": {
            mount: { on: "fx-desk", anchor: "top", offset: [0.5, 0, 0.15], turn: { x: 0, y: 0, z: 0 } },
            glows: [],
          },
        },
        cable: {
          from: "lead",
          to: { placement: "fx-desk", anchor: "back-edge" },
          sag: 0.2,
          radius: 0.004,
          drop: 0.05,
          rest: { placement: "fx-desk", anchor: "top" },
        },
        model: null,
      },
    ]);
    const look = fixture("room/looks/fx-cel.yaml");
    delete look.material_notes;
    expect(scene.look).toEqual(look);
    expect(Object.keys(scene.look)).toEqual([
      "version",
      "id",
      "method",
      "palette",
      "lights",
      "shading",
      "outlines",
      "glow_tones",
      "typefaces",
    ]);
    expect(scene.figures).toEqual({ twin: "fx-twin", visitor: "fx-visitor" });
    expect(scene.handoff).toEqual({
      from: { placement: "fx-twin", anchor: "hand" },
      to: { placement: "fx-visitor", anchor: "hand" },
    });
    expect(scene.load_order).toEqual([]);
  });
});

describe("the digest (contracts/room-bundle.md §4)", () => {
  it("is the SHA-256 of the index and the 3D part, each serialized without its own digest", () => {
    const result = good();
    const { digest: a, ...index } = result.index;
    const { digest: b, ...scene } = result.scene;
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/);
    expect([a, b]).toEqual([result.digest, result.digest]);
    expect(serialize(index) + "\n" + serialize(scene)).toBe(`${JSON.stringify(index)}\n${JSON.stringify(scene)}`);
    expect(sha256(`${serialize(index)}\n${serialize(scene)}`)).toBe(result.digest);
  });

  it("changes when a placement moves, and not when a field the site never holds does", () => {
    const scene = decoder.decode(goodFiles().get("apps/web/room/scene.yaml"));
    const desk = decoder.decode(goodFiles().get("apps/web/room/catalog/fx-desk.yaml"));
    const moved = compose(
      overlay({ "apps/web/room/scene.yaml": scene.replace("offset: [0.5, 0, 0.15]", "offset: [0.45, 0, 0.15]") }),
      noPolicy(),
      { mode: "strict", drafts: true },
    );
    const noted = compose(
      overlay({ "apps/web/room/catalog/fx-desk.yaml": desk.replace("Fixture method for the desk", "Fixture way") }),
      noPolicy(),
      { mode: "strict", drafts: true },
    );
    expect(moved.digest).not.toBe(good().digest);
    expect(noted.digest).toBe(good().digest);
  });
});

describe("what the bundle holds (contracts/room-bundle.md §11, §14)", () => {
  it("quantizes every number: finite, never -0, metres to 1e-6 and view-box and CSS units to 1e-4", () => {
    const { index, scene } = good();
    for (const [at, n] of [...numbers(index), ...numbers(scene)]) {
      expect(Number.isFinite(n), at).toBe(true);
      expect(Object.is(n, -0), at).toBe(false);
      expect(onGrid(n, 1e6), `${at} = ${n}`).toBe(true);
    }
  });

  it("holds no value of a field the site never holds, no pending line, and no catalog name", () => {
    const { index, scene } = good();
    const text = JSON.stringify([index, scene]);
    for (const value of [
      "Fixture desk",
      "Fixture point",
      "Fixture method",
      "Fixture shot",
      "Fixture measure",
      "Fixture studio notes",
      "Fixture lead",
      "Fixture lamp",
      "fx-old-lamp",
      "desk_corner",
      "Fixture material notes",
      "the fixture room holds a desk",
      "fixture excluded phrase",
      "intent-900",
      "fx-design-01",
      "fx-tracer",
      "Later idea",
      "corpus/90-fx-work.md",
    ])
      expect(text, value).not.toContain(value);
    // Nor any of those fields by its key: a tier value's "budget", the UI key "sign.estimated", and the plug's anchor
    // "lead" are other words; the selectable's lead is held to its value above.
    for (const key of [
      "estimated",
      "work_order",
      "survey",
      "desk_corner",
      "material_notes",
      "words_from",
      "exclude",
      "claims",
      "retired",
      "intent_ref",
      "tool",
      "pending",
      "about_author",
    ])
      expect(text, key).not.toContain(`"${key}":`);
    expect(text).not.toContain('"budget":{');
  });
});

describe("the models (contracts/room-bundle.md §3.4)", () => {
  const SET = ["fx-board", "fx-desk", "fx-plug"];
  const withModels = (): ComposeResult =>
    compose(overlay(modelChanges(SET)), capsPolicy(), { mode: "strict", drafts: true });

  it("emits each set model once, as a/<stem>.<hash16>.glb with its gzip-9 copy, never the plain file", () => {
    const result = withModels();
    const files = modelChanges(SET);
    expect(result.findings).toEqual([]);
    expect(result.models.map((m) => m.piece)).toEqual(SET);
    for (const m of result.models) {
      const plain = files[`assets/room/${m.piece}.glb`] as Uint8Array;
      expect(m.sha256).toBe(sha256(plain));
      expect(m.url).toBe(`a/${m.piece}.${m.sha256.slice(0, 16)}.glb`);
      expect([...m.gz.subarray(0, 10)]).toEqual([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0x02, 0xff]);
      expect(Buffer.compare(gunzipSync(m.gz), Buffer.from(plain))).toBe(0);
    }
    expect(result.cards).toEqual([]);
  });

  it("gives each placement of a set piece its model: the plain file's SHA-256, the copy's length, the measured bounds", () => {
    const result = withModels();
    const desk = result.scene.placements.find((p) => p.id === "fx-desk");
    const m = result.models.find((x) => x.piece === "fx-desk");
    expect(desk?.model).toEqual({
      url: m?.url,
      sha256: m?.sha256,
      bytes: m?.gz.length,
      bounds: { min: [-0.6, 0, -0.3], max: [0.6, 0.75, 0.3] },
      texture_bytes: 0,
    });
    // The measured bounds frame it, with no label: a set piece shows no stand-in.
    const { world } = worlds(result);
    expect(
      sameBox(desk?.frame_box as Box, worldBox(world.get("fx-desk") ?? IDENTITY, desk?.model?.bounds as Box)),
    ).toBe(true);
    expect(result.index.flat.labels.map((l) => l.placement)).toEqual(["fx-monitor", "fx-laptop"]);
    // A switch's poses show their piece's model; the board is a selectable's member, so it loads first.
    expect(result.scene.load_order).toEqual(["fx-board", "fx-desk", "fx-power.fx-resting"]);
    expect(result.manifest.standins.map((s) => s.placement)).toEqual([
      "fx-shell",
      "fx-monitor",
      "fx-neon",
      "fx-laptop",
      "fx-sign",
    ]);
    expect(result.index.build.placeholders).toBe(true);
  });

  it("gives a switch whose piece is set its model, so every load_order entry resolves to a model the part carries", () => {
    const result = withModels();
    const plug = result.models.find((m) => m.piece === "fx-plug");
    // The plug's model, made at its stylized scale of 2: its expected bounds times 2, measured.
    expect(result.scene.switches.find((s) => s.id === "fx-power")?.model).toEqual({
      url: plug?.url,
      sha256: plug?.sha256,
      bytes: plug?.gz.length,
      bounds: { min: [-0.04, 0, -0.06], max: [0.04, 0.04, 0.06] },
      texture_bytes: 0,
    });
    // A load_order entry is a placement's ID or a switch's pose, <switch>.<pose>; each names a model the part gives.
    const modelOf = (id: string): ComposeResult["scene"]["placements"][number]["model"] =>
      result.scene.placements.find((p) => p.id === id)?.model ??
      result.scene.switches.find((s) => Object.keys(s.poses).some((pose) => `${s.id}.${pose}` === id))?.model ??
      null;
    expect(result.scene.load_order).toEqual(["fx-board", "fx-desk", "fx-power.fx-resting"]);
    for (const id of result.scene.load_order) {
      const model = modelOf(id);
      expect(model, id).not.toBeNull();
      expect(result.models.find((m) => m.url === model?.url)?.gz.length, id).toBe(model?.bytes);
    }
    // And every model the build emits is one the 3D part names, by its URL and SHA-256.
    const named = [...result.scene.placements, ...result.scene.switches].map((x) => x.model);
    for (const m of result.models)
      expect(named, m.piece).toContainEqual(expect.objectContaining({ url: m.url, sha256: m.sha256 }));
  });

  it("emits a set image card plain, at a/<stem>.<hash16>.<ext>, measured by its image's header", () => {
    const card = png({ width: 64, height: 32 });
    const sign = decoder.decode(goodFiles().get("apps/web/room/catalog/fx-sign.yaml"));
    const record = {
      schema: 1,
      directory: "assets/room",
      license: "all-rights-reserved-2026",
      entries: [{ file: "fx-sign.png", sha256: sha256(card), kind: "room" }],
    };
    const result = compose(
      overlay({
        "apps/web/room/catalog/fx-sign.yaml": `${sign}model: { card: fx-sign.png }\n`,
        "assets/room/fx-sign.png": card,
        "assets/room/records.json": `${JSON.stringify(record, null, 2)}\n`,
      }),
      capsPolicy(),
      { mode: "strict", drafts: true },
    );
    expect(result.models).toEqual([]);
    expect(result.cards.map((c) => [c.piece, c.url, c.sha256])).toEqual([
      ["fx-sign", `a/fx-sign.${sha256(card).slice(0, 16)}.png`, sha256(card)],
    ]);
    expect(Buffer.compare(Buffer.from(result.cards[0]?.bytes ?? []), Buffer.from(card))).toBe(0);
    const placed = result.scene.placements.find((p) => p.id === "fx-sign");
    expect(placed?.model).toMatchObject({ bytes: card.length, texture_bytes: Math.floor((16 * 64 * 32) / 3) });
  });

  it("keeps a piece whose model has a lenient finding a stand-in, with the reason findings", () => {
    const tree = overlay(modelChanges(SET));
    const room = loadRoom(tree);
    const finding = { rule: "RX7", file: "assets/room/fx-desk.glb", path: "-", reason: "bounds", lenient: true };
    const out = emit(room, capsPolicy(), { mode: "lenient", drafts: false }, [finding], {
      tree,
      printable: () => true,
    });
    expect(out.models.map((m) => m.piece)).toEqual(["fx-board", "fx-plug"]);
    expect(out.scene.placements.find((p) => p.id === "fx-desk")?.model).toBeNull();
    expect(out.manifest.standins).toContainEqual({ placement: "fx-desk", reason: "findings" });
    expect(out.scene.load_order).not.toContain("fx-desk");
  });
});

describe("the drafts modules (contracts/room-bundle.md §3.3)", () => {
  it("are null in a release build", () => {
    expect(good({ mode: "strict", drafts: false }).drafts).toBeNull();
  });

  it("type the fixtures by the signals, and give lookdev its lists, the looks, and each piece's fit inputs", () => {
    const { drafts } = good();
    expect(drafts?.fixtures).toEqual([
      {
        id: "fx-sample",
        tier: "local",
        turns: [
          { outcome: "reply", route: "local", cost_micro_usd: 0 },
          { outcome: "reply", route: "fallback", cost_micro_usd: 1200 },
          { outcome: "reply", route: "metered", cost_micro_usd: "12.5" },
          { outcome: "degraded" },
          { outcome: "failed" },
          { outcome: "lost" },
          { outcome: "refused", status: 429 },
        ],
      },
    ]);
    const lookdev = drafts?.lookdev;
    expect(lookdev?.vignette).toEqual({
      show: ["fx-desk", "fx-monitor", "fx-neon", "fx-laptop", "fx-sign", "fx-board"],
    });
    expect(lookdev?.close_up).toEqual({ frame: ["fx-desk", "fx-monitor"] });
    expect(lookdev?.looks.map((l) => l.id)).toEqual(["fx-cel"]);
    expect(JSON.stringify(lookdev?.looks)).not.toContain("material_notes");
    expect(lookdev?.caps).toEqual(CAPS_DEFAULTS);
    expect(lookdev?.caps_source).toBe("defaults");
    expect(lookdev?.pieces["fx-sign"]).toEqual({
      fit: {
        bounds: { min: [-0.1875, 0, -0.0125], max: [0.1875, 0.15, 0.0125] },
        faces: [{ role: "lettering", at: [0, 0.075, 0.0125], size: [0.35, 0.125], facing: [0, 0, 1], up: [0, 1, 0] }],
        smallPropTexturePx: null,
      },
      budget: { gzip_bytes: 150000, triangles: 1500, texture_px: 256, texture_bytes: 349525 },
      small_prop: false,
    });
    const small = compose(goodTree(), capsPolicy({ small_props: ["fx-sign"], small_prop_texture_px: 512 }), {
      mode: "strict",
      drafts: true,
    }).drafts?.lookdev.pieces["fx-sign"];
    expect(small?.small_prop).toBe(true);
    expect(small?.fit.smallPropTexturePx).toBe(512);
  });
});

describe("room_text (contracts/room-bundle.md §5)", () => {
  const sha = (path: string): string => sha256(goodFiles().get(path) ?? new Uint8Array());
  const NOTES = "apps/web/content/room/fx-notes.yaml";
  const SCRIPT = "apps/web/content/room/fx-script.yaml";
  const OUTLINE = "apps/web/content/room/outlines/fx-sign-words.outline.json";
  const approving = (...paths: string[]) =>
    policyFrom(
      {
        caps: null,
        approvals: encoder.encode(
          JSON.stringify({ schema: 1, approvals: paths.map((p) => ({ sha256: sha(p), kind: "room-text" })) }),
        ),
        header: null,
      },
      "policy-dir",
    );

  it("publishes only what main approves in a release build, and adds the drafts in a drafts build", () => {
    expect(good({ mode: "strict", drafts: false }).roomText).toEqual({ blocks: [] });
    const release = compose(goodTree(), approving(NOTES), { mode: "strict", drafts: false }).roomText;
    expect(release.blocks.map((b) => [b.id, b.state])).toEqual([["fx-notes", "approved"]]);
    const drafts = compose(goodTree(), approving(NOTES), { mode: "strict", drafts: true }).roomText;
    expect(drafts.blocks.map((b) => [b.id, b.state])).toEqual([
      ["fx-notes", "approved"],
      ["fx-script", "draft"],
      ["fx-sign-words", "draft"],
    ]);
  });

  it("writes a block's non-pending lines, and an outline's words and drawing, in §5's order and nothing else", () => {
    const { blocks } = compose(goodTree(), approving(NOTES, SCRIPT, OUTLINE), {
      mode: "strict",
      drafts: false,
    }).roomText;
    expect(blocks).toEqual([
      {
        id: "fx-notes",
        source: NOTES,
        sha256: sha(NOTES),
        state: "approved",
        lines: [{ text: "Plan small" }, { text: "Ship often" }],
      },
      {
        id: "fx-script",
        source: SCRIPT,
        sha256: sha(SCRIPT),
        state: "approved",
        lines: [{ text: "fx run" }, { text: "fx ok" }],
      },
      {
        id: "fx-sign-words",
        source: OUTLINE,
        sha256: sha(OUTLINE),
        state: "approved",
        lines: [{ text: "fixture sign words" }],
        outline: {
          view_box: [0, 0, 400, 100],
          cap_height: 72,
          advance: 380,
          paths: ["M 10 90 L 10 18 L 60 18 Z", "M 80 90 L 120 18 L 160 90 Z", "m 200 90 c 10 -20 30 -20 40 0 z"],
        },
      },
    ]);
    expect(Object.keys(blocks[2] ?? {})).toEqual(["id", "source", "sha256", "state", "lines", "outline"]);
    expect(JSON.stringify(blocks)).not.toMatch(/Later idea|intent-900|fx-tracer|fx-design-01|exclude|words_from/);
  });

  it("takes an outline's advance as its view box's width when it gives none", () => {
    const outline = JSON.parse(decoder.decode(goodFiles().get(OUTLINE))) as Record<string, unknown>;
    delete outline.advance;
    const text = `${JSON.stringify(outline, null, 2)}\n`;
    const policy = policyFrom(
      {
        caps: null,
        approvals: encoder.encode(
          JSON.stringify({ schema: 1, approvals: [{ sha256: sha256(text), kind: "room-text" }] }),
        ),
        header: null,
      },
      "policy-dir",
    );
    const { blocks } = compose(overlay({ [OUTLINE]: text }), policy, { mode: "strict", drafts: false }).roomText;
    expect(blocks[0]?.outline?.advance).toBe(400);
  });
});

describe("the manifest (Amendment B7; contracts/room-bundle.md §6)", () => {
  it("lists the objects, the stand-ins and why, the live source, the build, and the caps beside spec 002's fields", () => {
    const { manifest } = good();
    expect(manifest).toEqual({
      objects: [
        { id: "fx-workstation", action: "talk", topic: "fx-work", ready: false },
        { id: "fx-board", action: "resume", topic: null, ready: null },
      ],
      free_talk: { ready: false },
      items: [],
      avatars: AVATARS.map((a) => a.id),
      placeholders: true,
      standins: [
        { placement: "fx-shell", reason: "no-model" },
        { placement: "fx-desk", reason: "no-model" },
        { placement: "fx-monitor", reason: "no-model" },
        { placement: "fx-neon", reason: "no-model" },
        { placement: "fx-laptop", reason: "no-model" },
        { placement: "fx-board", reason: "no-model" },
        { placement: "fx-sign", reason: "no-model" },
        { placement: "fx-power.fx-plugged", reason: "no-model" },
        { placement: "fx-power.fx-cloud", reason: "no-model" },
        { placement: "fx-power.fx-resting", reason: "no-model" },
      ],
      live_source: "off",
      build_kind: "drafts",
      caps: { source: "defaults", sha256: null },
      event_kinds: [...EVENT_KINDS],
    });
  });

  it("takes the items from the resume's source, and the caps' source and digest as the policy read them", () => {
    const resume = [
      "sections:",
      "  - title: Fixture section",
      "    items:",
      "      - { id: fx-item-one, title: One }",
      "      - { id: fx-item-two, title: Two }",
      "",
    ].join("\n");
    const policy = capsPolicy();
    const { manifest } = compose(overlay({ "apps/web/content/resume.yaml": resume }), policy, {
      mode: "lenient",
      drafts: false,
    });
    expect(manifest.items).toEqual(["fx-item-one", "fx-item-two"]);
    expect(manifest.caps).toEqual({ source: "policy-dir", sha256: policy.caps_sha256 });
    expect(manifest.build_kind).toBe("release");
  });
});
