// RG on the fixtures (spec 004; T065, T078; FR-002, FR-003, FR-009, FR-017, FR-051, FR-052, FR-064, SC-009, SC-010;
// R-17 to R-21; contracts/room-data-files.md §4, §5.2 to §5.5, §13.3, §14), beside its known-bad cases in
// compose.test.ts: what the geometry family measures through the shared kernel, and how it says so.
// - A framed box is the catalog's expected bounds at the stylized scale through the placement's world transform, its
//   top raised where the placement has a label (RG4 to RG6).
// - A piece's bounds hold its origin, faces, glows, and stand-ins, each shape by its own extent, turned and scaled; a
//   face's up stands square to its facing, +Y when absent; its canvas keeps its aspect within one pixel (RG2).
// - RG5 names every aspect a framed box leaves the view at; RG6 the first supported stage a core fails at, in 3D and
//   in 2D; RG7 the cap height on each reference stage under the floor main's caps give, or 9.
// - RG8 is a report, never a finding: every two shown poses of a switch, apart by the floor or not (FR-052).
// Every ID is a synthetic `fx-` one.
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { RULES } from "../../build/room/checks/family";
import { faceCaps, frameBoxes, poseSeparations } from "../../build/room/checks/rg";
import { compose } from "../../build/room/compose";
import type { Finding } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import { noPolicy, policyFrom } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import { LABEL_HEIGHT, LABEL_LIFT } from "../../src/room/compose/framing";
import { goodFiles, goodTree, overlay } from "../helpers/room-fixtures";

const SCENE = "apps/web/room/scene.yaml";
const SHELL = "apps/web/room/catalog/fx-shell.yaml";
const MONITOR = "apps/web/room/catalog/fx-monitor.yaml";
const LAPTOP = "apps/web/room/catalog/fx-laptop.yaml";
const OUTLINE = "apps/web/content/room/outlines/fx-sign-words.outline.json";
const decoder = new TextDecoder();
const encoder = new TextEncoder();

type Doc = Record<string, unknown>;
const at = (doc: Doc, ...keys: (string | number)[]): Doc => {
  let node: unknown = doc;
  for (const k of keys) node = (node as Record<string, unknown>)[String(k)];
  return node as Doc;
};

/** The known-good set with files changed as values, written back as YAML or JSON. */
function tree(changes: Readonly<Record<string, (d: Doc) => void>>): Tree {
  const edited: Record<string, string> = {};
  for (const [file, change] of Object.entries(changes)) {
    const text = decoder.decode(goodFiles().get(file));
    const doc = (file.endsWith(".json") ? JSON.parse(text) : parse(text)) as Doc;
    change(doc);
    edited[file] = file.endsWith(".json") ? `${JSON.stringify(doc, null, 2)}\n` : stringify(doc);
  }
  return overlay(edited);
}

/** The RG findings of a strict, drafts compose. */
function rg(t: Tree, policy: RoomPolicy = noPolicy()): Finding[] {
  return compose(t, policy, { mode: "strict", drafts: true }).findings.filter((f) => f.rule.startsWith("RG"));
}
const where = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.rule} ${f.file}:${f.path}`);

/** Main's caps with every starting figure but the legibility floor. */
function floorOf(px: number): RoomPolicy {
  const room = {
    gzip_bytes: 2500000,
    triangles: 40000,
    small_props: [],
    small_prop_texture_px: 1024,
    scene_texture_bytes: 96000000,
    legibility_floor_css_px: px,
  };
  const caps = encoder.encode(`${JSON.stringify({ schema: 1, per_asset: { room } })}\n`);
  return policyFrom({ caps, approvals: null, header: null }, "policy-dir");
}

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-9): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1)
    expect(Math.abs((actual[i] ?? Number.NaN) - (expected[i] ?? Number.NaN)), `[${i}]`).toBeLessThanOrEqual(tolerance);
}

describe("framed boxes", () => {
  const boxes = frameBoxes(loadRoom(goodTree()));

  it("are a piece's expected bounds at its stylized scale where its placement stands", () => {
    // fx-sign, at 1.25, on the desk's top (0, 0.75, 0) from the desk at (0, 0, -0.6), offset (-0.4, 0, 0.15).
    const sign = boxes.get("fx-sign");
    expectClose(sign?.min ?? [], [-0.4 - 0.1875, 0.75, -0.45 - 0.0125]);
    expectClose(sign?.max ?? [], [-0.4 + 0.1875, 0.75 + 0.15, -0.45 + 0.0125]);
  });

  it("hold a turned piece's bounds as an axis-aligned box", () => {
    // fx-laptop, turned −10° about Y at (0.17, 0.75, -0.6).
    const [c, s] = [Math.cos((10 * Math.PI) / 180), Math.sin((10 * Math.PI) / 180)];
    const laptop = boxes.get("fx-laptop");
    const [hx, hz] = [0.16 * c + 0.11 * s, 0.16 * s + 0.11 * c];
    expectClose(laptop?.min ?? [], [0.17 - hx, 0.75, -0.6 - hz]);
    expect((laptop?.max ?? [])[0]).toBeCloseTo(0.17 + hx, 12);
    expect((laptop?.max ?? [])[2]).toBeCloseTo(-0.6 + hz, 12);
  });

  it("are raised for a placement's label, and only there", () => {
    expect(boxes.get("fx-monitor")?.max[1]).toBeCloseTo(0.75 + 0.42 + LABEL_LIFT + LABEL_HEIGHT, 12);
    expect(boxes.get("fx-neon")?.max[1]).toBeCloseTo(0.75 + 0.42 + 0.2, 12);
  });

  it("leave out what doesn't resolve", () => {
    const cycle = tree({ [SCENE]: (d) => (at(d, "placements", 1).mount = { on: "fx-monitor", anchor: "top-edge" }) });
    const resolved = frameBoxes(loadRoom(cycle));
    expect(resolved.has("fx-shell")).toBe(true);
    expect(resolved.has("fx-desk")).toBe(false);
    expect(resolved.has("fx-twin")).toBe(false);
  });
});

describe("RG2: a piece's bounds hold its origin, faces, glows, and stand-ins", () => {
  /** The shell (bounds x up to 2) with one more stand-in shape, `standin[2]`. */
  const withShape = (shape: Doc): Finding[] =>
    rg(tree({ [SHELL]: (d) => (d.standin as Doc[]).push({ color: "fx-wall", ...shape }) }));

  // Each shape's extent along x is 0.1 either side of its centre, turned and scaled as it is.
  const SHAPES: [string, Doc][] = [
    ["a box", { shape: "box", size: [0.2, 0.4, 0.2] }],
    ["a scaled box", { shape: "box", size: [0.1, 0.1, 0.1], scale: 2 }],
    ["a box scaled on one axis", { shape: "box", size: [0.1, 0.3, 0.3], scale: [2, 1, 1] }],
    ["a box turned a quarter", { shape: "box", size: [0.4, 0.3, 0.2], turn: { y: 90 } }],
    ["a cylinder turned about its own axis", { shape: "cylinder", radius: 0.1, height: 0.3, turn: { y: 37 } }],
    ["a capsule lying along X", { shape: "capsule", radius: 0.04, length: 0.12, turn: { z: 90 } }],
    ["a sphere turned every way", { shape: "sphere", radius: 0.1, turn: { x: 20, y: 30, z: 40 } }],
    ["a torus", { shape: "torus", radius: 0.08, tube: 0.02 }],
    ["a plane", { shape: "plane", size: [0.2, 0.3] }],
    ["a circle", { shape: "circle", radius: 0.1 }],
    ["a tube along X", { shape: "tube", from: [-0.1, 0, 0], to: [0.1, 0, 0], radius: 0.05 }],
    [
      "a polygon",
      {
        shape: "polygon",
        points: [
          [-0.1, 0],
          [0.1, 0],
          [0, 0.1],
        ],
        depth: 0.2,
      },
    ],
  ];

  it.each(SHAPES)("takes %s at the bounds' edge, and refuses it a millimetre past", (_, shape) => {
    expect(where(withShape({ ...shape, at: [1.9, 1.2, 0] }))).toEqual([]);
    expect(where(withShape({ ...shape, at: [1.901, 1.2, 0] }))).toEqual([`RG2 ${SHELL}:standin[2]`]);
  });

  it("refuses a canvas more than one pixel off its face's aspect", () => {
    const px = (size: [number, number]): Finding[] =>
      rg(tree({ [MONITOR]: (d) => (at(d, "live_faces", 0).px = size) })).filter((f) => f.path.endsWith(".px"));
    expect(px([560, 361])).toEqual([]);
    expect(px([559, 360])).toEqual([]);
    const off = px([560, 362]);
    expect(where(off)).toEqual([`RG2 ${MONITOR}:live_faces[0].px`]);
    expect(off[0]?.reason).toBe("2.0 px off the face's aspect, more than one pixel");
  });

  it("refuses an up that isn't square to its facing, the +Y an absent up takes included", () => {
    const up = (face: Doc): string[] =>
      where(rg(tree({ [LAPTOP]: (d) => Object.assign(at(d, "live_faces", 0), face) }))).filter((w) =>
        w.endsWith("live_faces[0].up"),
      );
    expect(up({ facing: [0, 0.6, 0.8], up: [0, 0.8, -0.6] })).toEqual([]);
    expect(up({ facing: [0, 0.6, 0.8], up: undefined })).toEqual([`RG2 ${LAPTOP}:live_faces[0].up`]);
    expect(up({ facing: [0.6, 0, 0.8], up: undefined })).toEqual([]);
  });
});

describe("RG5: every framed box in view at the six aspects", () => {
  it("names each aspect a framed box's corner leaves the view at", () => {
    const far = rg(tree({ [SCENE]: (d) => (at(d, "placements", 5, "mount").offset = [0, 0.35, -100]) }));
    const found = far.filter((f) => f.rule === "RG5");
    expect(where(found)).toEqual([`RG5 ${SCENE}:placements[5]`]);
    expect(found[0]?.reason).toBe(
      "a corner of its framed box outside the view at the aspects 0.45, 0.6, 0.8, 1.15, 1.5, and 2.4",
    );
  });
});

describe("RG6: an exclusive 44 × 44 core for each selectable at every supported stage", () => {
  const regrouped = (): Finding[] =>
    rg(
      tree({
        [SCENE]: (d) =>
          (d.selectables as Doc[]).push({
            id: "fx-figure",
            name: "Fixture figure",
            members: ["fx-twin"],
            action: { resume: {} },
          }),
      }),
    ).filter((f) => f.rule === "RG6");

  it("names the selectable, what its core meets, and the first stage it fails at, in 3D and in 2D", () => {
    const found = regrouped();
    expect(found.every((f) => f.file === SCENE && /^selectables\[\d\]$/.test(f.path))).toBe(true);
    const three = found.find((f) => f.path === "selectables[2]" && f.reason.includes(" in 3D "));
    expect(three?.reason).toMatch(
      /^its exclusive core overlaps a member of selectables\[0\] in 3D at the \d+(\.\d)? × \d+(\.\d)? stage( and \d+ other supported stages?)?$/,
    );
    const flat = found.find((f) => f.path === "selectables[2]" && f.reason.includes(" in 2D"));
    expect(flat?.reason).toMatch(
      /^its exclusive core overlaps a member of selectables\[0\] in 2D, at the drawing's smallest scale$/,
    );
  });
});

describe("RG7: legibility at the production framing on both reference stages", () => {
  const PANEL = "placements[3].faces.panel";

  it("prints a face's cap height to 0.1 px, the stage, and the floor", () => {
    const wide = rg(
      tree({ [SCENE]: (d) => (at(d, "placements", 3, "faces", "panel", "regions", 0, "grid").chars = 20) }),
    );
    expect(where(wide)).toEqual([`RG7 ${SCENE}:${PANEL}`]);
    expect(wide[0]?.reason).toMatch(/^cap height \d\.\d px on the phone stage, under the floor of 9$/);
  });

  it("takes the floor from main's caps", () => {
    const raised = rg(goodTree(), floorOf(11));
    expect(where(raised)).toEqual([`RG7 ${SCENE}:${PANEL}`]);
    expect(raised[0]?.reason).toMatch(/^cap height 10\.\d px on the phone stage, under the floor of 11$/);
    expect(rg(goodTree(), floorOf(10))).toEqual([]);
  });

  it("measures a sign by its outline's cap height", () => {
    const small = rg(tree({ [OUTLINE]: (d) => (d.cap_height = 20) }));
    expect(where(small)).toEqual([
      `RG7 ${SCENE}:placements[6].faces.lettering`,
      `RG7 ${SCENE}:placements[6].faces.lettering`,
    ]);
    expect(small.map((f) => f.reason.replace(/\d+\.\d/, "n"))).toEqual([
      "cap height n px on the desktop stage, under the floor of 9",
      "cap height n px on the phone stage, under the floor of 9",
    ]);
  });

  /** The laptop's lid, a face the catalog doesn't mark readable, bound to the terminal block in a dense grid. */
  const lid = (binding: Doc): Finding[] =>
    rg(
      tree({
        [SCENE]: (d) =>
          (at(d, "placements", 4).faces = {
            lid: {
              label: "label.fx-laptop",
              regions: [{ rect: [0, 0, 1, 1], renderer: "terminal", grid: { cols: 120, rows: 30 }, text: "fx-script" }],
              ...binding,
            },
          }),
      }),
    );

  it("refuses a face under the floor that isn't atmosphere, readable or not", () => {
    expect(where(lid({}))).toEqual([`RG7 ${SCENE}:placements[4].faces.lid`, `RG7 ${SCENE}:placements[4].faces.lid`]);
  });

  it("lets an atmosphere face fall under the floor, and holds it to its max_chars", () => {
    // fx-script's lines are "fx run" and "fx ok": 11 characters.
    expect(lid({ atmosphere: true, max_chars: 11 })).toEqual([]);
    const over = lid({ atmosphere: true, max_chars: 10 });
    expect(where(over)).toEqual([`RG7 ${SCENE}:placements[4].faces.lid.max_chars`]);
    expect(over[0]?.reason).toBe("its words hold 11 characters, over its max_chars of 10");
  });

  it("gives each bound face's cap heights for the report", () => {
    const faces = faceCaps(loadRoom(goodTree()), goodTree());
    expect(faces.map((f) => f.face)).toEqual([
      "fx-monitor.screen",
      "fx-neon.panel",
      "fx-board.slate",
      "fx-sign.lettering",
    ]);
    for (const f of faces) {
      expect(f.readable).toBe(true);
      expect(f.desktop).toBeGreaterThan(9);
      expect(f.phone).toBeGreaterThan(9);
    }
    // The phone's stage is the smaller: every glyph is smaller there.
    for (const f of faces) expect(f.phone).toBeLessThan(f.desktop ?? 0);
  });
});

describe("RG8: two shown poses of a switch apart by the floor, reported and never refused", () => {
  const pairs = (t: Tree, policy = noPolicy()) => poseSeparations(loadRoom(t), policy);

  it("measures every two poses the cases show, on both reference stages", () => {
    const good = pairs(goodTree());
    expect(good.map((p) => [p.switch, p.id, ...p.poses])).toEqual([
      [0, "fx-power", "fx-plugged", "fx-cloud"],
      [0, "fx-power", "fx-plugged", "fx-resting"],
      [0, "fx-power", "fx-cloud", "fx-resting"],
    ]);
    for (const p of good) {
      expect(p.desktop).toBeGreaterThanOrEqual(9);
      expect(p.phone).toBeGreaterThanOrEqual(9);
      expect(p.status).toBe("apart");
    }
  });

  /** The resting pose half a millimetre from the cloud pose, with glow levels of its own. */
  const close = (glows: Doc[], laptop?: (d: Doc) => void): Tree =>
    tree({
      [SCENE]: (d) =>
        (at(d, "switches", 0, "poses")["fx-resting"] = {
          mount: { on: "fx-desk", anchor: "back-edge", offset: [0.4005, 0, 0.05] },
          glows,
        }),
      ...(laptop ? { [LAPTOP]: laptop } : {}),
    });

  it("flags two shown poses under the floor, and refuses nothing for it", () => {
    const t = close([]);
    const pair = pairs(t).find((p) => p.poses[0] === "fx-cloud" && p.poses[1] === "fx-resting");
    expect(pair?.status).toBe("under the floor");
    expect(pair?.desktop).toBeLessThan(1);
    expect(RULES.RG8.refuses).toBe(false);
    expect(rg(t).filter((f) => f.rule === "RG8")).toEqual([]);
  });

  it("counts the size of a cue a pose's glow adds, such as a charge light", () => {
    const charge = [{ placement: "fx-laptop", glow: "fx-charge", level: 1 }];
    const radius = (r: number) => (d: Doc) => (at(d, "glows", 0).radius = r);
    const cue = (r: number) =>
      pairs(close(charge, radius(r))).find((p) => p.poses[0] === "fx-cloud" && p.poses[1] === "fx-resting");
    const [small, large, larger] = [cue(0.01), cue(0.2), cue(0.4)];
    expect(small?.status).toBe("under the floor");
    expect(large?.status).toBe("apart");
    expect((larger?.phone ?? 0) / (large?.phone ?? 1)).toBeCloseTo(2, 1);
  });

  it("takes the floor from main's caps", () => {
    const raised = pairs(goodTree(), floorOf(10000));
    expect(raised.every((p) => p.status === "under the floor")).toBe(true);
  });
});

describe("RG9: regions inside their face, none over another", () => {
  it("lets regions meet at an edge and the face's", () => {
    const meeting = rg(
      tree({
        [SCENE]: (d) => {
          const regions = at(d, "placements", 3, "faces", "panel", "regions") as unknown as Doc[];
          Object.assign(regions[1] as Doc, { rect: [0, 0.5, 0.3, 0.5] });
          Object.assign(regions[2] as Doc, { rect: [0.3, 0.5, 0.7, 0.5] });
        },
      }),
    );
    expect(meeting.filter((f) => f.rule === "RG9")).toEqual([]);
  });

  it("names the region another overlaps", () => {
    const over = rg(
      tree({ [SCENE]: (d) => (at(d, "placements", 3, "faces", "panel", "regions", 1).rect = [0, 0.4, 0.5, 0.5]) }),
    );
    const found = over.filter((f) => f.rule === "RG9");
    expect(where(found)).toEqual([`RG9 ${SCENE}:placements[3].faces.panel.regions[1]`]);
    expect(found[0]?.reason).toBe("overlaps regions[0]");
  });
});
