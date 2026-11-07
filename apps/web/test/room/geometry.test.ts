// RG on the fixtures (spec 004; T065, T078; FR-002, FR-003, FR-009, FR-017, FR-051, FR-052, FR-064, SC-009, SC-010;
// R-17 to R-21; contracts/room-data-files.md §4, §5.2 to §5.5, §13.3, §14), beside its known-bad cases in
// compose.test.ts: what the geometry family measures through the shared kernel, and how it says so.
// - A framed box is the catalog's expected bounds at the stylized scale through the placement's world transform, or a
//   set model's measured bounds, its top raised where the placement shows a stand-in with a label (RG4 to RG6).
// - A piece's bounds hold its origin, faces, glows, and stand-ins, each shape by its own extent, turned and scaled; a
//   face's up stands square to its facing, +Y when absent; its canvas keeps its aspect within one pixel (RG2).
// - RG5 names every aspect a framed box leaves the view at; RG6 the first supported stage a core fails at, in 3D and
//   in 2D; RG7 the cap height on each reference stage under the floor main's caps give, or 9.
// - RG8 is a report, never a finding: every two shown poses of a switch, apart by the floor or not (FR-052).
// - One production framing: the bundle's frame boxes, 2D hit rectangles, and face sizes, RK3's canvases, and the
//   report's cap heights and separations are RG's own measures.
// Every ID is a synthetic `fx-` one.
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { createContext, RULES } from "../../build/room/checks/family";
import type { Context } from "../../build/room/checks/family";
import {
  faceCaps,
  flatMembers,
  frameBoxes,
  geometryOf,
  lookTypefaces,
  poseSeparations,
} from "../../build/room/checks/rg";
import { sceneTextureMemory } from "../../build/room/checks/rk";
import { compose } from "../../build/room/compose";
import type { ComposeOptions, Finding } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import { noPolicy, policyFrom } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import type { Box } from "../../src/room/compose/framing";
import { LABEL_HEIGHT, LABEL_LIFT } from "../../src/room/compose/framing";
import { flatCore, pickAreas, pickProblems } from "../../src/room/compose/pick";
import { flatScale, REFERENCE_PHONE, supportedStages } from "../../src/room/compose/stages";
import { fixed } from "../../src/room/glb/rules";
import { goodFiles, goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";

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

/** A family's context over a tree, as compose() makes it. */
const contextOf = (t: Tree, policy: RoomPolicy = noPolicy()): Context =>
  createContext(loadRoom(t), policy, { mode: "strict", drafts: true }, t).ctx;
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
  const boxes = frameBoxes(contextOf(goodTree()));

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

  it("are raised for a stand-in's label, and only there: never over a set piece or a figure", () => {
    expect(boxes.get("fx-monitor")?.max[1]).toBeCloseTo(0.75 + 0.42 + LABEL_LIFT + LABEL_HEIGHT, 12);
    expect(boxes.get("fx-neon")?.max[1]).toBeCloseTo(0.75 + 0.42 + 0.2, 12);
    // Under main's caps the monitor's clean model is set, and frames it by its measured bounds, the expected ones.
    const set = frameBoxes(contextOf(overlay(modelChanges(["fx-monitor"])), capsPolicy()));
    expect(set.get("fx-monitor")?.max[1]).toBeCloseTo(0.75 + 0.42, 6);
    // The twin shows its avatar, so a label on its placement raises nothing.
    const labelled = frameBoxes(contextOf(tree({ [SCENE]: (d) => (at(d, "placements", 7).label = "label.fx-desk") })));
    expect(labelled.get("fx-twin")?.max[1]).toBeCloseTo(boxes.get("fx-twin")?.max[1] ?? Number.NaN, 12);
  });

  it("leave out what doesn't resolve", () => {
    const cycle = tree({ [SCENE]: (d) => (at(d, "placements", 1).mount = { on: "fx-monitor", anchor: "top-edge" }) });
    const resolved = frameBoxes(contextOf(cycle));
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
      rg(tree({ [LAPTOP]: (d) => Object.assign(at(d, "live_faces", 0), face) }))
        .filter((f) => f.path === "live_faces[0].up")
        .map((f) => `${f.rule} ${f.file}:${f.path}: ${f.reason}`);
    expect(up({ facing: [0, 0.6, 0.8], up: [0, 0.8, -0.6] })).toEqual([]);
    expect(up({ facing: [0, 0.6, 0.8], up: [0, 1, 0] })).toEqual([
      `RG2 ${LAPTOP}:live_faces[0].up: not perpendicular to facing within 1e-6`,
    ]);
    expect(up({ facing: [0, 0.6, 0.8], up: undefined })).toEqual([
      `RG2 ${LAPTOP}:live_faces[0].up: absent, and +Y, its default, isn't perpendicular to facing within 1e-6`,
    ]);
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

  it("refuses a core in another selectable's union, between its members, where a pick that misses them goes (words-1)", () => {
    // The monitor and the board grouped, and the laptop, moved right, a selectable of its own in the gap between them:
    // its core meets neither of their members nor their core, at any stage.
    const found = rg(
      tree({
        [SCENE]: (d) => {
          at(d, "selectables", 0).members = ["fx-monitor", "fx-board"];
          (d.selectables as Doc[])[1] = {
            id: "fx-lap",
            name: "Fixture lap",
            members: ["fx-laptop"],
            action: { resume: {} },
          };
          at(d, "placements", 4, "mount").offset = [0.3, 0, 0];
        },
      }),
    );
    const union = "its exclusive core overlaps the union of the members of selectables[0]";
    expect(found.map((f) => `${f.rule} ${f.path}: ${f.reason}`)).toEqual([
      expect.stringMatching(
        new RegExp(
          `^RG6 selectables\\[1\\]: ${union.replace(/[[\]]/g, "\\$&")} in 3D at the \\d+(\\.\\d)? × \\d+(\\.\\d)? stage and \\d+ other supported stages$`,
        ),
      ),
      `RG6 selectables[1]: ${union} in 2D, at the drawing's smallest scale`,
    ]);
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

  it("refuses atmosphere on a readable face where its placement doesn't resolve too, and measures nothing there", () => {
    const t = tree({
      [SCENE]: (d) => {
        at(d, "placements", 1).mount = { on: "fx-monitor", anchor: "top-edge" };
        Object.assign(at(d, "placements", 2, "faces", "screen"), { atmosphere: true, max_chars: 40 });
      },
    });
    expect(where(rg(t).filter((f) => f.rule === "RG7"))).toEqual([
      `RG7 ${SCENE}:placements[2].faces.screen.atmosphere`,
    ]);
    const screen = faceCaps(geometryOf(contextOf(t)), []).find((f) => f.face === "fx-monitor.screen");
    expect([screen?.atmosphere, screen?.desktop, screen?.phone]).toEqual([true, null, null]);
  });

  it("measures nothing of a face behind the production camera, so neither RG7 nor the report holds a number (words-7)", () => {
    // The sign, which the camera doesn't frame, mounted 30 m behind it.
    const t = tree({ [SCENE]: (d) => (at(d, "placements", 6, "mount").offset = [-0.4, 0, 30]) });
    const sign = faceCaps(geometryOf(contextOf(t)), []).find((f) => f.face === "fx-sign.lettering");
    expect([sign?.desktop, sign?.phone]).toEqual([null, null]);
    expect(rg(t).filter((f) => f.rule === "RG7")).toEqual([]);
  });

  it("lets an atmosphere face fall under the floor, and holds it to its max_chars", () => {
    // fx-script's lines are "fx run" and "fx ok": 11 characters.
    expect(lid({ atmosphere: true, max_chars: 11 })).toEqual([]);
    const over = lid({ atmosphere: true, max_chars: 10 });
    expect(where(over)).toEqual([`RG7 ${SCENE}:placements[4].faces.lid.max_chars`]);
    expect(over[0]?.reason).toBe("its words hold 11 characters, over its max_chars of 10");
  });

  it("gives the report each bound face's cap heights from the index's cap ratios, as RG7 measures them", () => {
    const typefaces = lookTypefaces(loadRoom(goodTree()), goodTree());
    expect(typefaces).toHaveLength(5);
    // To 1e-6, as the index carries them.
    for (const t of typefaces) expect(Math.round(t.cap_ratio * 1e6) / 1e6).toBe(t.cap_ratio);
    const g = geometryOf(contextOf(goodTree()));
    const faces = faceCaps(g, typefaces);
    expect(faces.map((f) => [f.face, f.placement, f.role])).toEqual([
      ["fx-monitor.screen", 2, "screen"],
      ["fx-neon.panel", 3, "panel"],
      ["fx-board.slate", 5, "slate"],
      ["fx-sign.lettering", 6, "lettering"],
    ]);
    for (const f of faces) {
      expect([f.readable, f.atmosphere, f.max_chars]).toEqual([true, false, null]);
      expect(f.desktop).toBeGreaterThan(9);
      // The phone's stage is the smaller: every glyph is smaller there.
      expect(f.phone).toBeGreaterThan(9);
      expect(f.phone).toBeLessThan(f.desktop ?? 0);
    }
    // A floor just over the smallest of them refuses that face alone, with its own number.
    const least = faces.reduce((a, b) => ((b.phone ?? Infinity) < (a.phone ?? Infinity) ? b : a));
    const floor = Math.ceil(((least.phone ?? 0) + 0.01) * 100) / 100;
    const refused = rg(goodTree(), floorOf(floor));
    expect(where(refused)).toEqual([`RG7 ${SCENE}:placements[${least.placement}].faces.${least.role}`]);
    expect(refused[0]?.reason).toBe(
      `cap height ${(Math.floor((least.phone ?? 0) * 10) / 10).toFixed(1)} px on the phone stage, under the floor of ${floor}`,
    );
    // Without a use's ratio its text regions go unmeasured; a sign's outline needs none.
    expect(faceCaps(g, []).map((f) => f.phone !== null)).toEqual([false, false, false, true]);
  });
});

describe("RG8: two shown poses of a switch apart by the floor, reported and never refused", () => {
  const pairs = (t: Tree, policy = noPolicy()) => poseSeparations(geometryOf(contextOf(t, policy)), policy);

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

describe("one production framing: the bundle and the report carry what RG and RK measure", () => {
  const STRICT: ComposeOptions = { mode: "strict", drafts: true };
  /** Every piece a placement or a pose shows: a figure's shows its avatar. */
  const SHOWN = ["fx-board", "fx-desk", "fx-laptop", "fx-monitor", "fx-neon", "fx-plug", "fx-shell", "fx-sign"];
  const DESK = "apps/web/room/catalog/fx-desk.yaml";
  /** Every shown piece's clean model, the desk's budget changed by `budget`. */
  function models(budget: Doc = {}): Tree {
    const files = modelChanges(SHOWN);
    const desk = parse(decoder.decode(files[DESK])) as Doc;
    Object.assign(at(desk, "budget"), budget);
    return overlay({ ...files, [DESK]: stringify(desk) });
  }
  // The known-good set, every piece a stand-in; every shown piece set under main's caps, so each frames by its measured
  // bounds with no label; and the desk's model over its budget in a lenient build, which keeps the desk a stand-in.
  const CASES: readonly (readonly [string, () => Tree, () => RoomPolicy, ComposeOptions])[] = [
    ["the known-good set", goodTree, noPolicy, STRICT],
    ["every shown piece set", () => models(), capsPolicy, STRICT],
    [
      "the desk's model over its budget, lenient",
      () => models({ triangles: 1 }),
      capsPolicy,
      { ...STRICT, mode: "lenient" },
    ],
  ];

  /** A case's tree, its compose, and a family's context over the same tree and policy, as compose() makes it. */
  function composed(make: () => Tree, policyOf: () => RoomPolicy, options: ComposeOptions) {
    const [t, policy] = [make(), policyOf()];
    const result = compose(t, policy, options);
    // A build whose outputs are used: no finding but a lenient one.
    expect(result.findings.every((f) => f.lenient)).toBe(true);
    return { t, policy, result, ctx: createContext(loadRoom(t), policy, options, t).ctx };
  }
  /** Metres to 1e-6, as the 3D part carries them. */
  const micro = (n: number): number => Math.round(n * 1e6) / 1e6 || 0;
  const microBox = (b: Box | undefined): Box | null =>
    b
      ? {
          min: [micro(b.min[0]), micro(b.min[1]), micro(b.min[2])],
          max: [micro(b.max[0]), micro(b.max[1]), micro(b.max[2])],
        }
      : null;

  it.each(CASES)("gives the 3D part's frame_box as RG frames each placement: %s", (_, make, policyOf, options) => {
    const { result, ctx } = composed(make, policyOf, options);
    const boxes = frameBoxes(ctx);
    expect(result.scene.placements.map((p) => p.frame_box)).toEqual(
      result.scene.placements.map((p) => microBox(boxes.get(p.id))),
    );
  });

  it.each(CASES)(
    "gives the index's flat hits as the 2D member rectangles RG6 checks: %s",
    (_, make, policyOf, options) => {
      const { result, ctx } = composed(make, policyOf, options);
      const g = geometryOf(ctx);
      const members = g ? flatMembers(g) : [];
      expect(members.flat()).not.toHaveLength(0);
      expect(result.index.flat.hits).toEqual(
        result.index.selectables.map((x, k) => ({
          selectable: x.id,
          rects: (members[k] ?? []).map((m) => [...m.rect]),
          depths: (members[k] ?? []).map((m) => m.depth),
        })),
      );
    },
  );

  it("has RG6 refuse in 2D exactly what the pick function finds among the index's flat hits", () => {
    // The twin made a selectable of its own beside the workstation, whose laptop its core meets.
    const t = tree({
      [SCENE]: (d) =>
        (d.selectables as Doc[]).push({
          id: "fx-figure",
          name: "Fixture figure",
          members: ["fx-twin"],
          action: { resume: {} },
        }),
    });
    const result = compose(t, noPolicy(), STRICT);
    const smallest = supportedStages().reduce((a, b) => (flatScale(b) < flatScale(a) ? b : a));
    const inputs = result.index.flat.hits.map((h, k) => ({
      id: String(k),
      members: h.rects.map((rect, i) => ({ rect, depth: h.depths[i] ?? 0 })),
    }));
    const found = pickProblems(pickAreas(inputs, flatCore(smallest)), [0, 0, 320, 200]).map(
      (p) => `selectables[${p.selectable}] ${p.problem} ${p.other ?? "-"}`,
    );
    const what =
      /^its (?:44 × 44 core leaves the view|exclusive core overlaps (the core|a member) of selectables\[(\d+)\]) in 2D, at the drawing's smallest scale$/;
    const refused = result.findings.flatMap((f) => {
      const m = f.rule === "RG6" ? what.exec(f.reason) : null;
      if (!m) return [];
      return [`${f.path} ${m[1] === undefined ? "outside" : m[1] === "the core" ? "core" : "member"} ${m[2] ?? "-"}`];
    });
    expect(found).not.toHaveLength(0);
    expect(refused.sort()).toEqual(found.sort());
  });

  it.each(CASES)(
    "gives RK3 each face's canvas at the size the index's screen_css gives on the reference phone: %s",
    (_, make, policyOf, options) => {
      const { result, ctx } = composed(make, policyOf, options);
      const { faces } = sceneTextureMemory(ctx);
      expect(faces.map((f) => `${f.placement}.${f.role}`)).toEqual(result.index.faces.map((f) => f.id));
      expect(faces.map((f) => f.screen)).toEqual(result.index.faces.map((f) => f.screen_css));
      expect(faces.map((f) => f.canvas)).toEqual(
        result.index.faces.map((f) =>
          [0, 1].map((i) => Math.min(f.px[i] ?? 0, Math.floor((f.screen_css[i] ?? 0) * REFERENCE_PHONE.dpr))),
        ),
      );
    },
  );

  it.each(CASES)(
    "gives the report each face's cap heights as RG7 measures them, and each two poses' separation as RG8 does: %s",
    (_, make, policyOf, options) => {
      const { t, policy, result, ctx } = composed(make, policyOf, options);
      const g = geometryOf(ctx);
      const rows = result.report.markdown.split("\n");
      const px = (n: number | null | undefined): string => (n === null || n === undefined ? "–" : `${fixed(n, 1)} px`);
      const caps = faceCaps(g, lookTypefaces(loadRoom(t), t));
      expect(caps.every((f) => f.desktop !== null && f.phone !== null)).toBe(true);
      for (const face of result.index.faces) {
        const measured = caps.find((f) => f.face === face.id);
        const row = rows.find((r) => r.startsWith(`| \`${face.id}\` |`));
        expect(row?.split(" | ").slice(2, 4), face.id).toEqual([px(measured?.desktop), px(measured?.phone)]);
      }
      const pairs = poseSeparations(g, policy);
      expect(pairs).not.toHaveLength(0);
      const header = rows.indexOf("| Switch | Poses | Desktop | Phone | Status |");
      expect(rows.slice(header + 2, rows.indexOf("", header))).toEqual(
        pairs.map(
          (p) =>
            `| \`${p.id}\` | \`${p.poses[0]}\` / \`${p.poses[1]}\` | ${px(p.desktop)} | ${px(p.phone)} | ${p.status} |`,
        ),
      );
    },
  );
});
