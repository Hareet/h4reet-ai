// T067's budget half (spec 004; FR-053, FR-054, SC-006; Amendment C7; R-24, R-25; contracts/room-data-files.md §13.8;
// contracts/plain-model-fit.md §7, §8): the RK family through compose() on the fixture set. RK1 holds each catalog
// budget to the caps, main's or FR-053's starting figures while main has no room block; RK2 holds a model to its
// piece's budget by §7's measures, gzip-9 bytes through pako, and is lenient; RK3 adds the scene's texture memory on
// the reference phone by class, each placed piece's budget once, the figures' measured memory (0 while their files
// don't exist), and every bound live face's canvas at min(px, its largest on-screen size × the phone's pixel ratio);
// RK4 reports a malformed caps.json by its paths, and fails strict and lenient builds alike. The models are built when
// the test runs (test/helpers/glb.ts), since spec 003's rule A1 refuses a committed one.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { createContext } from "../../build/room/checks/family";
import type { Context } from "../../build/room/checks/family";
import { frameBoxes } from "../../build/room/checks/rg";
import { sceneTextureMemory } from "../../build/room/checks/rk";
import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeOptions, Finding } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import { CAPS_DEFAULTS, noPolicy, policyFrom } from "../../build/room/policy";
import type { RoomCaps, RoomPolicy } from "../../build/room/policy";
import type { Tree } from "../../build/room/source";
import { LABEL_HEIGHT, LABEL_LIFT } from "../../src/room/compose/framing";
import type { Box } from "../../src/room/compose/framing";
import { REFERENCE_PHONE } from "../../src/room/compose/stages";
import { textureMemory } from "../../src/room/glb/fit";
import { gzipBytes } from "../../src/room/glb/gzip";
import { count } from "../../src/room/glb/rules";
import { desk, png, sign } from "../helpers/glb";
import { goodFiles, goodTree, overlay } from "../helpers/room-fixtures";

const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const LENIENT: ComposeOptions = { mode: "lenient", drafts: true };
const CAPS_FILE = "assets/policy/caps.json";
const SCENE = "apps/web/room/scene.yaml";
const catalog = (piece: string): string => `apps/web/room/catalog/${piece}.yaml`;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

type Data = Record<string, unknown>;
/** A file of the known-good set, parsed, edited in place by `change`, and written back as YAML. */
function edited(path: string, change: (value: Data) => void): string {
  const value = parse(decoder.decode(goodFiles().get(path))) as Data;
  change(value);
  return stringify(value, { aliasDuplicateObjects: false });
}
const at = (value: Data, key: string): Data => value[key] as Data;

/** assets/room/records.json recording each model of `files` with the kind room and its SHA-256, as spec 003 does. */
function withRecords(files: Record<string, string | Uint8Array>): Record<string, string | Uint8Array> {
  const entries = Object.entries(files)
    .filter(([path, data]) => /^assets\/room\/[^/]+\.(glb|png|jpg|webp)$/.test(path) && typeof data !== "string")
    .map(([path, data]) => ({
      file: path.slice("assets/room/".length),
      sha256: sha256(data as Uint8Array),
      kind: "room",
    }));
  const record = { schema: 1, directory: "assets/room", license: "all-rights-reserved-2026", entries };
  return { ...files, "assets/room/records.json": `${JSON.stringify(record, null, 2)}\n` };
}

/** The desk's catalog bounds as test/helpers/glb.ts's clean desk has them, so RX7 passes it. */
const DESK_BOUNDS = { min: [-0.8, 0, -0.4], max: [0.8, 0.75, 0.4] };
interface Budget {
  gzip_bytes: number;
  triangles: number;
  texture_px: number;
  texture_bytes: number;
}

/** The known-good set with `model` set on fx-desk, its bounds the clean desk's, its budget changed by `budget`, and
 *  the files of `more`. */
function deskTree(model: Uint8Array, budget: Partial<Budget> = {}, more: Record<string, string> = {}): Tree {
  return overlay(
    withRecords({
      ...more,
      "assets/room/fx-desk.glb": model,
      [catalog("fx-desk")]: edited(catalog("fx-desk"), (v) => {
        at(v, "origin").bounds = DESK_BOUNDS;
        v.model = { file: "fx-desk.glb" };
        Object.assign(at(v, "budget"), budget);
      }),
    }),
  );
}

/** A policy whose caps.json holds the room block `room`, as a policy directory would. */
function capsPolicy(room: unknown): RoomPolicy {
  const caps = encoder.encode(`${JSON.stringify({ schema: 1, per_asset: { room } })}\n`);
  return policyFrom({ caps, approvals: null, header: null }, "policy-dir");
}
const caps = (change: Partial<RoomCaps> = {}): RoomPolicy => capsPolicy({ ...CAPS_DEFAULTS, ...change });

const of = (rule: string, findings: readonly Finding[]): Finding[] => findings.filter((f) => f.rule === rule);
const where = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.rule} ${f.file}:${f.path}`);
const contextOf = (tree: Tree, policy: RoomPolicy = noPolicy()): Context =>
  createContext(loadRoom(tree), policy, STRICT, tree).ctx;

describe("RK1: a catalog budget above the caps", () => {
  const budgetTree = (piece: string, budget: Partial<Budget>): Tree =>
    overlay({ [catalog(piece)]: edited(catalog(piece), (v) => Object.assign(at(v, "budget"), budget)) });

  it.each([
    ["gzip_bytes", 2_500_000],
    ["triangles", 40_000],
    ["texture_bytes", 96_000_000],
  ] as const)("holds %s to FR-053's starting figure, %i, while main has no room block", (key, figure) => {
    const passes = compose(budgetTree("fx-desk", { [key]: figure }), noPolicy(), STRICT);
    expect(where(of("RK1", passes.findings))).toEqual([]);
    const refused = of("RK1", compose(budgetTree("fx-desk", { [key]: figure + 1 }), noPolicy(), STRICT).findings);
    expect(where(refused)).toEqual([`RK1 ${catalog("fx-desk")}:budget.${key}`]);
    expect(refused[0]?.reason).toContain(count(figure + 1));
    expect(refused[0]?.reason).toContain(count(figure));
    expect(refused[0]?.lenient).toBe(false);
  });

  it("holds a budget to main's caps where they are under the starting figures: agents never raise a cap", () => {
    const policy = caps({ triangles: 7999 });
    const refused = of("RK1", compose(goodTree(), policy, STRICT).findings);
    expect(where(refused)).toEqual([`RK1 ${catalog("fx-desk")}:budget.triangles`]);
    expect(where(of("RK1", compose(goodTree(), caps({ triangles: 8000 }), STRICT).findings))).toEqual([]);
  });

  it("holds texture_px to small_prop_texture_px only for a piece small_props lists", () => {
    const listed = of(
      "RK1",
      compose(goodTree(), caps({ small_props: ["fx-plug"], small_prop_texture_px: 64 }), STRICT).findings,
    );
    expect(where(listed)).toEqual([`RK1 ${catalog("fx-plug")}:budget.texture_px`]);
    expect(where(of("RK1", compose(goodTree(), caps({ small_prop_texture_px: 64 }), STRICT).findings))).toEqual([]);
    const at128 = caps({ small_props: ["fx-plug"], small_prop_texture_px: 128 });
    expect(where(of("RK1", compose(goodTree(), at128, STRICT).findings))).toEqual([]);
  });

  it("fails strict and lenient builds alike, and names no data value", () => {
    const tree = (): Tree => budgetTree("fx-desk", { gzip_bytes: 2_600_000 });
    for (const options of [STRICT, LENIENT]) {
      const [finding, ...rest] = of("RK1", compose(tree(), noPolicy(), options).findings);
      expect(rest).toEqual([]);
      expect(finding?.lenient).toBe(false);
      expect(formatFinding(finding as Finding, options.mode)).toMatch(/^RK1 /);
      expect(finding?.reason).not.toMatch(/fx-|Fixture/);
    }
  });
});

describe("RK2: a model over its piece's budget", () => {
  const model = desk().bytes;
  /** The clean desk's measures (contracts/plain-model-fit.md §7): its .glb.gz's length through pako at level 9; three
   *  meshes of 12 triangles, the legs' mesh counted once though four nodes use it; its largest side, the legs' 16 × 8
   *  JPEG; and ⌊16wh/3⌋ over its 8 × 8 PNG, 16 × 8 JPEG, and 4 × 4 WebP. */
  const MEASURES: Budget = {
    gzip_bytes: gzipBytes(model),
    triangles: 36,
    texture_px: 16,
    texture_bytes: textureMemory(8, 8) + textureMemory(16, 8) + textureMemory(4, 4),
  };

  it("passes a model at its budget, by each of §7's measures", () => {
    expect(MEASURES.texture_bytes).toBe(1108);
    const findings = compose(deskTree(model, MEASURES), noPolicy(), STRICT).findings;
    expect(where(findings)).toEqual([]);
  });

  it.each([
    ["gzip_bytes", MEASURES.gzip_bytes - 1, `${count(MEASURES.gzip_bytes)} gzip-9 bytes`],
    ["triangles", 35, "36 triangles"],
    ["texture_px", 8, "16 pixels"],
    ["texture_bytes", 1107, "1,108 bytes of texture memory"],
  ] as const)("refuses a model over its budget's %s, measured, as a lenient finding", (key, budget, measured) => {
    const findings = compose(deskTree(model, { ...MEASURES, [key]: budget }), noPolicy(), STRICT).findings;
    expect(where(findings)).toEqual(["RK2 assets/room/fx-desk.glb:-"]);
    const [finding] = findings;
    expect(finding?.reason).toContain(measured);
    expect(finding?.reason).toContain(count(budget));
    expect(finding?.reason).toMatch(/the piece keeps its stand-in$/);
    expect(finding?.lenient).toBe(true);
    expect(formatFinding(finding as Finding, "lenient")).toMatch(/^warn RK2 assets\/room\/fx-desk\.glb:-: /);
  });

  it("measures nothing in a file RX1 or RX2 refuses", () => {
    const truncated = model.subarray(0, 40);
    const findings = compose(deskTree(truncated, { triangles: 1, texture_bytes: 1 }), noPolicy(), STRICT).findings;
    expect(findings.map((f) => f.rule)).toEqual(["RX1"]);
  });

  it("holds an image card to its budget by its bytes as served, its side, and its texture memory", () => {
    const card = png({ width: 8, height: 8 });
    const tree = (budget: Partial<Budget>): Tree =>
      overlay(
        withRecords({
          "assets/room/fx-board.png": card,
          [catalog("fx-board")]: edited(catalog("fx-board"), (v) => {
            v.model = { card: "fx-board.png" };
            Object.assign(at(v, "budget"), budget);
          }),
        }),
      );
    const fits = { gzip_bytes: card.length, texture_px: 8, texture_bytes: textureMemory(8, 8) };
    expect(where(compose(tree(fits), noPolicy(), STRICT).findings)).toEqual([]);
    for (const over of [{ gzip_bytes: card.length - 1 }, { texture_px: 4 }, { texture_bytes: 340 }]) {
      const findings = compose(tree({ ...fits, ...over }), noPolicy(), STRICT).findings;
      expect(where(findings), JSON.stringify(over)).toEqual(["RK2 assets/room/fx-board.png:-"]);
    }
  });
});

describe("RK3: the scene's texture memory on the reference phone, by class", () => {
  /** The known-good set's budgets of texture_bytes for every piece the scene places, its switch's plug included. */
  const PLACED = {
    "fx-shell": 1_398_101,
    "fx-desk": 5_592_405,
    "fx-monitor": 5_592_405,
    "fx-neon": 349_525,
    "fx-laptop": 1_398_101,
    "fx-board": 5_592_405,
    "fx-sign": 349_525,
    "fx-twin": 349_525,
    "fx-visitor": 349_525,
    "fx-plug": 87_381,
  };
  const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

  it("adds each piece the scene places once, by its budget, the switch's piece among them", () => {
    const memory = sceneTextureMemory(contextOf(goodTree()));
    expect(memory.pieces).toBe(sum(Object.values(PLACED)));
    // A second placement of a piece shares its textures.
    const twice = overlay({
      [SCENE]: edited(SCENE, (v) => {
        (v.placements as Data[]).push({
          id: "fx-neon-two",
          piece: "fx-neon",
          mount: { on: "fx-shell", anchor: "wall" },
        });
      }),
    });
    expect(sceneTextureMemory(contextOf(twice)).pieces).toBe(memory.pieces);
    // A piece no placement or switch places adds nothing.
    const unswitched = overlay({ [SCENE]: edited(SCENE, (v) => (v.switches = [])) });
    expect(sceneTextureMemory(contextOf(unswitched)).pieces).toBe(memory.pieces - PLACED["fx-plug"]);
  });

  it("counts the figures 0 while assets/twin/ and assets/visitors/ hold no model", () => {
    const memory = sceneTextureMemory(contextOf(goodTree()));
    expect([memory.twin, memory.visitor, memory.figures]).toEqual([null, null, 0]);
  });

  it("adds the twin's measured texture memory and the largest visitor avatar's", () => {
    const tree = overlay({
      "assets/twin/fx-twin.glb": desk().bytes,
      "assets/visitors/fx-dog/fx-dog.glb": sign().bytes,
      "assets/visitors/fx-cat/fx-cat.glb": desk().bytes,
    });
    const memory = sceneTextureMemory(contextOf(tree));
    // The desk's 8 × 8, 16 × 8, and 4 × 4 images; the sign's 4 × 4 PNG and 8 × 8 WebP.
    const deskMemory = textureMemory(8, 8) + textureMemory(16, 8) + textureMemory(4, 4);
    expect(textureMemory(4, 4) + textureMemory(8, 8)).toBeLessThan(deskMemory);
    expect([memory.twin, memory.visitor, memory.figures]).toEqual([deskMemory, deskMemory, 2 * deskMemory]);
  });

  it("sizes each bound face's canvas at min(px, its largest on-screen size × the reference phone's ratio), at most", () => {
    const memory = sceneTextureMemory(contextOf(goodTree()));
    expect(memory.faces.map((f) => `${f.placement}.${f.role}`)).toEqual([
      "fx-monitor.screen",
      "fx-neon.panel",
      "fx-board.slate",
      "fx-sign.lettering",
    ]);
    for (const face of memory.faces) {
      const screen = face.screen ?? [Infinity, Infinity];
      expect(screen.every((side) => Number.isFinite(side) && side > 0)).toBe(true);
      // Rounded down: a canvas is at most its on-screen size × the ratio (contracts/room-bundle.md §3.1).
      expect(face.canvas).toEqual(
        [0, 1].map((i) => Math.min(face.px[i] ?? 0, Math.floor((screen[i] ?? 0) * REFERENCE_PHONE.dpr))),
      );
      expect(face.bytes).toBe(textureMemory(face.canvas[0], face.canvas[1]));
    }
    expect(memory.canvases).toBe(sum(memory.faces.map((f) => f.bytes)));
    expect(memory.total).toBe(memory.pieces + memory.figures + memory.canvases);
  });

  it("takes the face's pixels where they're fewer, and its on-screen size where they're more", () => {
    const board = (px: [number, number]): readonly [number, number] => {
      const tree = overlay({
        [catalog("fx-board")]: edited(catalog("fx-board"), (v) => {
          const [face] = v.live_faces as Data[];
          if (face) face.px = px;
        }),
      });
      const found = sceneTextureMemory(contextOf(tree)).faces.find((f) => f.placement === "fx-board");
      return found?.canvas ?? [0, 0];
    };
    expect(board([74, 54])).toEqual([74, 54]);
    const large = board([2048, 1495]);
    expect(large[0]).toBeLessThan(2048);
    expect(large[1]).toBeLessThan(1495);
    expect(board([1536, 1121])).toEqual(large);
  });

  it("frames a set model by its measured bounds, and a stand-in by its expected bounds raised for its label", () => {
    const model = desk().bytes;
    const fits = { gzip_bytes: gzipBytes(model), triangles: 36, texture_px: 16, texture_bytes: 1108 };
    // The desk framed: on the shell's floor anchor, 0.6 m back, its catalog bounds the clean desk's own (float32).
    const framed = {
      [SCENE]: edited(SCENE, (v) => {
        const [, placement] = v.placements as Data[];
        if (placement) placement.frame = true;
      }),
    };
    const box = (budget: Partial<Budget>, policy: RoomPolicy): Box | undefined =>
      frameBoxes(contextOf(deskTree(model, budget, framed), policy)).get("fx-desk");
    const expectBox = (actual: Box | undefined, min: number[], max: number[]): void => {
      for (let a = 0; a < 3; a++) {
        expect(actual?.min[a]).toBeCloseTo(min[a] ?? NaN, 6);
        expect(actual?.max[a]).toBeCloseTo(max[a] ?? NaN, 6);
      }
    };
    const raised = 0.75 + LABEL_LIFT + LABEL_HEIGHT;
    expectBox(box(fits, caps()), [-0.8, 0, -1], [0.8, 0.75, -0.2]);
    // Without main's caps, or over its budget, the piece keeps its stand-in, whose label floats over it.
    expectBox(box(fits, noPolicy()), [-0.8, 0, -1], [0.8, raised, -0.2]);
    expectBox(box({ ...fits, triangles: 35 }, caps()), [-0.8, 0, -1], [0.8, raised, -0.2]);
    // A set image card keeps its piece's expected bounds, with no label over it.
    const card = png({ width: 8, height: 8 });
    const cardTree = overlay(
      withRecords({
        "assets/room/fx-monitor.png": card,
        [catalog("fx-monitor")]: edited(catalog("fx-monitor"), (v) => (v.model = { card: "fx-monitor.png" })),
      }),
    );
    const shown = frameBoxes(contextOf(cardTree, caps())).get("fx-monitor");
    const standin = frameBoxes(contextOf(cardTree, noPolicy())).get("fx-monitor");
    expectBox(
      standin,
      [...(shown?.min ?? [])],
      [shown?.max[0] ?? NaN, (shown?.max[1] ?? NaN) + LABEL_LIFT + LABEL_HEIGHT, shown?.max[2] ?? NaN],
    );
  });

  it("refuses a total over scene_texture_bytes in every build, and passes one at it", () => {
    const { total } = sceneTextureMemory(contextOf(goodTree()));
    expect(total).toBeLessThan(CAPS_DEFAULTS.scene_texture_bytes);
    for (const options of [STRICT, LENIENT]) {
      expect(where(compose(goodTree(), caps({ scene_texture_bytes: total }), options).findings)).toEqual([]);
      const refused = compose(goodTree(), caps({ scene_texture_bytes: total - 1 }), options).findings;
      expect(where(refused)).toEqual([`RK3 ${SCENE}:-`]);
      expect(refused[0]?.lenient).toBe(false);
      expect(refused[0]?.reason).toContain(count(total));
      expect(refused[0]?.reason).not.toMatch(/fx-/);
    }
  });
});

describe("RK4: a malformed room block", () => {
  const ROOM = { ...CAPS_DEFAULTS, small_props: ["fx-plug"] };

  it.each([
    ["a missing key", { ...ROOM, triangles: undefined }, "per_asset.room.triangles"],
    ["an unknown key", { ...ROOM, bytes: 1 }, "per_asset.room.bytes"],
    ["a value of the wrong type", { ...ROOM, gzip_bytes: "2500000" }, "per_asset.room.gzip_bytes"],
    ["a value out of its range", { ...ROOM, small_prop_texture_px: 1000 }, "per_asset.room.small_prop_texture_px"],
    ["a small prop outside the ID grammar", { ...ROOM, small_props: ["Fx Plug"] }, "per_asset.room.small_props[0]"],
  ])("reports %s at its path in caps.json, failing strict and lenient builds alike", (_, room, path) => {
    for (const options of [STRICT, LENIENT]) {
      const findings = of("RK4", compose(goodTree(), capsPolicy(room), options).findings);
      expect(where(findings)).toEqual([`RK4 ${CAPS_FILE}:${path}`]);
      expect(findings[0]?.lenient).toBe(false);
      expect(formatFinding(findings[0] as Finding, options.mode)).toMatch(/^RK4 /);
      expect(findings[0]?.reason).not.toMatch(/Fx Plug|2500000|fx-plug/);
    }
  });

  it("reports a caps.json that doesn't parse for the whole file", () => {
    const policy = policyFrom({ caps: encoder.encode("{"), approvals: null, header: null }, "main");
    expect(where(of("RK4", compose(goodTree(), policy, LENIENT).findings))).toEqual([`RK4 ${CAPS_FILE}:-`]);
  });

  it("is no finding where main has no room block: RK1 then holds each budget to FR-053's starting figures", () => {
    const policy = policyFrom(
      { caps: encoder.encode(`${JSON.stringify({ schema: 1, per_asset: {} })}\n`), approvals: null, header: null },
      "main",
    );
    expect(policy.caps_source).toBe("defaults");
    expect(where(compose(goodTree(), policy, STRICT).findings)).toEqual([]);
    const over = overlay({
      [catalog("fx-desk")]: edited(catalog("fx-desk"), (v) => (at(v, "budget").triangles = 40_001)),
    });
    expect(where(compose(over, policy, STRICT).findings)).toEqual([`RK1 ${catalog("fx-desk")}:budget.triangles`]);
  });
});
