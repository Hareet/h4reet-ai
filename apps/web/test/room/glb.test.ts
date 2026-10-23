// T063 (spec 004; FR-015 to FR-019, FR-022, SC-002; research.md R-23, R-66; contracts/plain-model-fit.md §5, §7, §12):
// the GLB reader and fit check, on files built when the test runs (test/helpers/glb.ts), since spec 003's rule A1
// refuses a committed model. The clean desk and sign pass with each mark value glb/rules.ts holds; each variant is
// refused with its rule and its path by index, never a name; "not scrubbed" stops no other rule, while RX1, then RX2,
// stop the rest; and the measures equal values worked by hand: triangles per mode, texture memory, bounds through TRS
// and matrix nodes, and quantized, sparse, and strided positions.
import { describe, expect, it } from "vitest";

import { atScale, compareFindings, fit, fitCard, render, textureMemory, unreadable } from "../../src/room/glb/fit";
import type { FitInput, FitResult, GlbFinding, Vec3 } from "../../src/room/glb/fit";
import { readImage } from "../../src/room/glb/images";
import { strictJson } from "../../src/room/glb/json";
import { NAME_RULE, nameProblem, neutralId } from "../../src/room/glb/names";
import {
  ADMITTED_EXTENSIONS,
  MARK_VALUES,
  REASON,
  REFUSED_MATERIALS,
  RULE_TEXT,
  RX_RULES,
  exportRules,
} from "../../src/room/glb/rules";
import {
  ARRIVAL_INPUT,
  DESK_INPUT,
  FLOAT,
  ModelBuilder,
  PNG_SIGNATURE,
  QUAD_INDICES,
  QUAD_UVS,
  SHORT,
  SIGN,
  SIGN_CATALOG,
  SIGN_INPUT,
  UNSIGNED_BYTE,
  UNSIGNED_SHORT,
  WORD_QUAD,
  aboutX,
  ascii,
  bigGlb,
  bytes,
  concat,
  corners,
  desk,
  encode,
  glb,
  item,
  jpeg,
  list,
  obj,
  packText,
  png,
  rxVariants,
  sign,
  webp,
} from "../helpers/glb";
import type { Obj } from "../helpers/glb";

const FILE = "candidate";

function check(data: Uint8Array, input: FitInput = DESK_INPUT): FitResult {
  return fit(data, input, { file: FILE, gzipBytes: 0 });
}

/** Each finding as its rule and path. */
const paths = (result: FitResult): string[] => result.findings.map((f) => `${f.rule} ${f.path}`);
const rules = (result: FitResult): string[] => [...new Set(result.findings.map((f) => f.rule))].sort();

function expectBounds(actual: FitResult["measures"]["bounds"], min: Vec3, max: Vec3): void {
  expect(actual).not.toBeNull();
  for (let a = 0; a < 3; a++) {
    expect(actual?.min[a]).toBeCloseTo(min[a] ?? NaN, 6);
    expect(actual?.max[a]).toBeCloseTo(max[a] ?? NaN, 6);
  }
}

/** The `name` values a GLB's JSON chunk holds, for the check that no refusal prints one. */
function namesIn(data: Uint8Array): string[] {
  const names: string[] = [];
  try {
    const length = new DataView(data.buffer, data.byteOffset).getUint32(12, true);
    JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + length)), (key, value: unknown) => {
      if (key === "name" && typeof value === "string") names.push(value);
      return value;
    });
  } catch {
    // RX1's and RX2's files may hold no JSON to read
  }
  return names.filter((name) => name.length > 4 && !/^(material|image|texture|sampler)-\d+$/.test(name));
}

describe("the clean set", () => {
  it("passes the clean desk and sign with each mark value rules.ts holds", () => {
    expect(Object.keys(MARK_VALUES).length).toBeGreaterThan(0);
    for (const [kind, term] of Object.entries(MARK_VALUES)) {
      for (const [model, input] of [
        [desk({ mark: term }), DESK_INPUT],
        [sign({ mark: term }), SIGN_INPUT],
      ] as const) {
        const result = check(model.bytes, input);
        expect(result.findings.map(render)).toEqual([]);
        expect(result.scrubbed).toBe(true);
        expect(result.mark).toBe(kind);
      }
    }
  });

  it("puts the catalog's bounds and faces at the stylized scale: lengths and points times s, directions unchanged", () => {
    expect(atScale(SIGN_CATALOG, null)).toEqual(SIGN_INPUT);
    expect(atScale(SIGN_CATALOG, 1024)).toEqual({ ...SIGN_INPUT, smallPropTexturePx: 1024 });
    expect(atScale({ ...SIGN_CATALOG, scale: 1 }, null).bounds).toEqual(SIGN_CATALOG.bounds);
  });

  it("passes spec 003's glb(), ported, against its triangle's bounds, and meets its M-rule cases with RX rules", () => {
    expect(check(glb(), ARRIVAL_INPUT).findings).toEqual([]);
    expect(check(glb({ mark: false }), ARRIVAL_INPUT).findings.map(render)).toEqual([
      "RX5 candidate:extensions: not scrubbed",
    ]);
    // M8's cases: a file name, a path, or a camera's file stem in a name
    expect(paths(check(glb({ imageName: "IMG_1234.jpg" }), ARRIVAL_INPUT))).toEqual(["RX6 images[0].name"]);
    expect(paths(check(glb({ nodeName: "textures/face" }), ARRIVAL_INPUT))).toEqual(["RX6 nodes[0].name"]);
    expect(paths(check(glb({ materialName: "20261012_094101" }), ARRIVAL_INPUT))).toEqual(["RX6 materials[0].name"]);
    // M4 admits a morph target and its names, for the twin; a room model holds neither
    expect(paths(check(glb({ targetNames: ["jawOpen"] }), ARRIVAL_INPUT))).toEqual([
      "RX3 meshes[0].extras",
      "RX3 meshes[0].primitives[0].targets",
      "RX3 meshes[0].weights",
    ]);
    // M9's case: bytes in the BIN chunk that no buffer view covers
    expect(paths(check(glb({ extraBin: ascii("workflow: C:\\Users\\me") }), ARRIVAL_INPUT))).toEqual([
      "RX2 buffers[0]",
    ]);
  });

  it("reads a 10 MB GLB quickly (spec 003's big_glb)", () => {
    const big = bigGlb(10);
    const start = performance.now();
    const result = check(big, ARRIVAL_INPUT);
    expect(performance.now() - start).toBeLessThan(2000);
    // its texture's side, 1825 pixels, isn't a power of two
    expect(paths(result)).toEqual(["RX9 images[0]"]);
  });
});

describe("each variant is refused with its rule and its path by index, never a name", () => {
  const variants = rxVariants();

  it("covers every rule, RX1 to RX10", () => {
    expect([...new Set(variants.map((v) => v.rule))].sort()).toEqual([...RX_RULES].sort());
    expect(new Set(variants.map((v) => v.id)).size).toBe(variants.length);
  });

  it.each(variants.map((v) => [v.id, v] as const))("%s", (_, v) => {
    const result = check(v.bytes, v.input);
    expect(paths(result)).toContain(`${v.rule} ${v.path}`);
    expect(rules(result)).toEqual([v.rule]);
    const shown = result.findings.map((f) => `${f.path}: ${f.reason}`).join("\n");
    expect(shown).not.toMatch(/fx-/);
    for (const name of namesIn(v.bytes)) expect(shown).not.toContain(name);
    for (const f of result.findings) expect(render(f)).toBe(`${f.rule} candidate:${f.path}: ${f.reason}`);
  });
});

describe("the order of the rules", () => {
  it("reports a file without the mark as not scrubbed, and goes on with every other rule", () => {
    const bare = check(desk({ mark: false }).bytes);
    expect(bare.findings.map(render)).toEqual(["RX5 candidate:extensions: not scrubbed"]);
    expect(bare.scrubbed).toBe(false);
    expect(bare.mark).toBeNull();
    const worse = desk({
      mark: false,
      edit: (g) => {
        item(g, "materials", 0).name = "fx-oak";
        item(g, "materials", 1).emissiveFactor = [1, 1, 1];
        item(g, "nodes", 0).translation = [0.5, 0, 0];
      },
    });
    expect(paths(check(worse.bytes))).toEqual([
      "RX7 -",
      "RX5 extensions",
      "RX6 materials[0].name",
      "RX10 materials[1].emissiveFactor",
    ]);
    expect(
      fit(desk({ mark: false }).bytes, DESK_INPUT, { file: "assets/room/fx-desk.glb", gzipBytes: 0 }).findings.map(
        render,
      ),
    ).toEqual(["RX5 assets/room/fx-desk.glb:extensions: not scrubbed"]);
  });

  it("stops at RX1, then at RX2: the other rules need a sound file", () => {
    const model = desk({
      edit: (g) => {
        item(g, "nodes", 1).name = "IMG_1234";
        item(g, "materials", 0).emissiveFactor = [1, 0, 0];
      },
    });
    expect(rules(check(model.bytes))).toEqual(["RX10", "RX6"]);
    const broken = model.bytes.slice();
    new DataView(broken.buffer).setUint32(4, 1, true);
    expect(rules(check(broken))).toEqual(["RX1"]);
    const duplicate = JSON.stringify(model.gltf).replace('"scene":0', '"scene":0,"scene":0');
    expect(rules(check(packText(duplicate, model.bin)))).toEqual(["RX2"]);
    const index = desk({
      edit: (g) => {
        item(g, "nodes", 1).name = "IMG_1234";
        item(g, "nodes", 2).mesh = 40;
      },
    });
    expect(paths(check(index.bytes))).toEqual(["RX2 nodes[2].mesh"]);
    const unreadModel = check(broken);
    expect(unreadModel.measures).toMatchObject({ bytes: broken.length, triangles: null, bounds: null, faces: [] });
  });

  it("sorts findings by path, its indices compared as numbers, then by rule", () => {
    const model = desk({
      build: (b) => {
        for (let n = 7; n <= 11; n++) b.node({ name: `FX${n}` });
        item(b.gltf, "materials", 2).emissiveFactor = [0, 0, 1];
        item(b.gltf, "images", 0).name = "fx-image";
      },
    });
    expect(paths(check(model.bytes))).toEqual([
      "RX6 images[0].name",
      "RX10 materials[2].emissiveFactor",
      "RX6 nodes[7].name",
      "RX6 nodes[8].name",
      "RX6 nodes[9].name",
      "RX6 nodes[10].name",
      "RX6 nodes[11].name",
    ]);
    const f = (rule: GlbFinding["rule"], path: string): GlbFinding => ({ rule, file: FILE, path, reason: "-" });
    const sorted = [f("RX10", "a"), f("RX2", "a"), f("RX1", "-"), f("RX3", "a[10]"), f("RX3", "a[9]")].sort(
      compareFindings,
    );
    expect(sorted.map((x) => `${x.rule} ${x.path}`)).toEqual(["RX1 -", "RX2 a", "RX10 a", "RX3 a[9]", "RX3 a[10]"]);
  });

  it("names a model it can't read", () => {
    expect(render(unreadable("assets/room/fx-desk.glb"))).toBe("RX1 assets/room/fx-desk.glb:-: the file can't be read");
  });
});

describe("the measures", () => {
  it("measures the clean desk and sign as worked by hand", () => {
    const d = desk();
    const desks = fit(d.bytes, DESK_INPUT, { file: FILE, gzipBytes: 12345 }).measures;
    // three boxes of 8 vertices and 12 triangles; the legs' mesh counts once, though four nodes use it
    expect(desks).toMatchObject({ bytes: d.bytes.length, gzipBytes: 12345, vertices: 24, triangles: 36, faces: [] });
    // a PNG of 8 × 8, a JPEG of 16 × 8, a WebP of 4 × 4
    expect(desks.textureBytes).toBe(Math.floor((16 * 64) / 3) + Math.floor((16 * 128) / 3) + Math.floor((16 * 16) / 3));
    expect(desks.textureBytes).toBe(341 + 682 + 85);
    expect(desks.maxTexturePx).toBe(16);
    expectBounds(desks.bounds, [-0.8, 0, -0.4], [0.8, 0.75, 0.4]);

    const signs = check(sign().bytes, SIGN_INPUT).measures;
    expect(signs).toMatchObject({ vertices: 24, triangles: 28, textureBytes: 85 + 341, maxTexturePx: 8 });
    expectBounds(signs.bounds, [-0.4, 0, -0.02], [0.4, 0.4, 0.02]);
    expect(signs.faces.map((face) => [face.face, face.node])).toEqual([
      [0, SIGN.nodes.word],
      [1, SIGN.nodes.tally],
    ]);
    const [word, tally] = signs.faces;
    for (const [face, centre, w, h] of [
      [word, [0, 0.26, 0.02], 0.6, 0.16],
      [tally, [0.2, 0.1, 0.02], 0.24, 0.08],
    ] as const) {
      for (let a = 0; a < 3; a++) {
        expect(face?.centre[a]).toBeCloseTo(centre[a] ?? NaN, 6);
        expect(face?.facing[a]).toBeCloseTo([0, 0, 1][a] ?? NaN, 6);
        expect(face?.up[a]).toBeCloseTo([0, 1, 0][a] ?? NaN, 6);
      }
      expect(face?.edges.top).toBeCloseTo(w, 6);
      expect(face?.edges.bottom).toBeCloseTo(w, 6);
      expect(face?.edges.left).toBeCloseTo(h, 6);
      expect(face?.edges.right).toBeCloseTo(h, 6);
    }
  });

  it("counts triangles per mode 4, 5, and 6, each mesh once, and none for points and lines", () => {
    const b = new ModelBuilder();
    const points = b.positions([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [2, 0, 0],
      [2, 1, 0],
      [3, 0, 0],
    ]);
    const prim = (mode: number, indices?: readonly number[]): Obj =>
      indices === undefined
        ? { attributes: { POSITION: points }, mode }
        : { attributes: { POSITION: points }, mode, indices: b.indices(indices) };
    const shapes = b.mesh(
      [
        prim(4, [0, 1, 2, 1, 3, 2, 2, 3, 5]), // ⌊9 / 3⌋ = 3
        prim(5, [0, 1, 2, 3, 4]), // a strip of 5: 3
        prim(6, [0, 1, 2, 3, 4, 5]), // a fan of 6: 4
        prim(4), // 7 vertices and no indices: ⌊7 / 3⌋ = 2
        prim(5), // a strip of 7: 5
        prim(6, [0, 1]), // max(2 − 2, 0) = 0
        prim(0),
        prim(1),
        prim(2),
        prim(3), // points and lines: none
      ],
      "fx-shapes",
    );
    const shared = b.mesh([prim(4, [0, 1, 2])], "fx-shared");
    b.mesh([prim(4, [0, 1, 2])], "fx-unused"); // no node uses it, and it counts, as the arrival check counts
    b.root(b.node({ name: "fx-a", mesh: shapes }));
    b.root(b.node({ name: "fx-b", mesh: shared }));
    b.root(b.node({ name: "fx-c", mesh: shared, translation: [0, 0, 1] }));
    const { measures } = check(b.pack().bytes);
    expect(measures.triangles).toBe(3 + 3 + 4 + 2 + 5 + 0 + 1 + 1);
    expect(measures.vertices).toBe(12 * 7);
  });

  it("measures texture memory as ⌊16 · w · h / 3⌋ an image, and the largest side", () => {
    const b = new ModelBuilder();
    b.image(png({ width: 4, height: 4 }), "image/png");
    b.image(jpeg({ width: 8, height: 4 }), "image/jpeg");
    b.image(webp({ width: 2, height: 1 }), "image/webp");
    b.image(webp({ width: 16, height: 2, lossy: true, flags: 0 }), "image/webp");
    b.root(b.node({ name: "fx-a", mesh: b.mesh([b.box([0, 0, 0], [1, 1, 1])], "fx-a") }));
    const { measures } = check(b.pack().bytes);
    expect(measures.textureBytes).toBe(85 + 170 + 10 + 170);
    expect(measures.maxTexturePx).toBe(16);
  });

  it("bounds every vertex the default scene reaches, through TRS and matrix nodes", () => {
    const model = (scene: number | null): Uint8Array => {
      const b = new ModelBuilder();
      const cube = b.mesh([b.box([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5])], "fx-cube");
      // 90° about Z, a scale of 2 on x, then a translation; its child halves and lifts by a matrix
      const turn = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
      b.root(
        b.node({ name: "fx-a", mesh: cube, translation: [1, 2, 3], rotation: turn, scale: [2, 1, 1], children: [1] }),
      );
      b.node({ name: "fx-b", mesh: cube, matrix: [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 5, 1] });
      const far = b.node({ name: "fx-c", mesh: cube, translation: [100, 0, 0] });
      list(b.gltf, "scenes").push({ nodes: [far] });
      return b.pack({ edit: (g) => (scene === null ? delete g.scene : (g.scene = scene)) }).bytes;
    };
    // fx-a's cube spans x 0.5 to 1.5, y 1 to 3, z 2.5 to 3.5; fx-b's, x 0.75 to 1.25, y 1.5 to 2.5, z 7.75 to 8.25
    expectBounds(check(model(0)).measures.bounds, [0.5, 1, 2.5], [1.5, 3, 8.25]);
    expectBounds(check(model(null)).measures.bounds, [0.5, 1, 2.5], [1.5, 3, 8.25]);
    expectBounds(check(model(1)).measures.bounds, [99.5, -0.5, -0.5], [100.5, 0.5, 0.5]);
  });

  it("decodes KHR_mesh_quantization's integer positions, normalized or not, through a strided view", () => {
    const quantized = (extension: boolean): Uint8Array => {
      const b = new ModelBuilder();
      // SHORT, normalized: (−1, −1, 0) with −32768 clamped to −1, (1, 1, −1), and (0, 0, 1), each padded to 8 bytes
      const shorts = [-32767, -32768, 0, 32767, 32767, -32767, 0, 0, 32767];
      const padded = concat(
        ...[0, 1, 2].map((v) => concat(encode(shorts.slice(3 * v, 3 * v + 3), SHORT), bytes(0, 0))),
      );
      const s = b.accessor({
        bufferView: b.view(padded, { byteStride: 8 }),
        componentType: SHORT,
        normalized: true,
        count: 3,
        type: "VEC3",
        min: [-32767, -32768, -32767],
        max: [32767, 32767, 32767],
      });
      // UNSIGNED_BYTE, not normalized: (0, 0, 0) and (200, 100, 50), each padded to 4 bytes
      const u = b.accessor({
        bufferView: b.view(bytes(0, 0, 0, 0, 200, 100, 50, 0), { byteStride: 4 }),
        componentType: UNSIGNED_BYTE,
        count: 2,
        type: "VEC3",
        min: [0, 0, 0],
        max: [200, 100, 50],
      });
      b.root(
        b.node({
          name: "fx-s",
          mesh: b.mesh([{ attributes: { POSITION: s }, mode: 0 }], "fx-s"),
          scale: [0.5, 0.5, 0.5],
        }),
      );
      b.root(
        b.node({
          name: "fx-u",
          mesh: b.mesh([{ attributes: { POSITION: u }, mode: 0 }], "fx-u"),
          translation: [0, 0, 10],
          scale: [0.01, 0.01, 0.01],
        }),
      );
      return b.pack({
        edit: (g) => {
          if (!extension) return;
          list(g, "extensionsUsed").push("KHR_mesh_quantization");
          list(g, "extensionsRequired").push("KHR_mesh_quantization");
        },
      }).bytes;
    };
    expectBounds(check(quantized(true)).measures.bounds, [-0.5, -0.5, -0.5], [2, 1, 10.5]);
    // without the extension, glTF takes only float positions
    expect(paths(check(quantized(false)))).toEqual([
      "RX2 meshes[0].primitives[0].attributes.POSITION",
      "RX2 meshes[1].primitives[0].attributes.POSITION",
    ]);
  });

  it("decodes sparse positions over a buffer view and over zeros", () => {
    const b = new ModelBuilder();
    const over = b.accessor({
      bufferView: b.view(encode(new Array<number>(12).fill(0), FLOAT)),
      componentType: FLOAT,
      count: 4,
      type: "VEC3",
      min: [0, -2, 0],
      max: [5, 0, 0],
      sparse: {
        count: 2,
        indices: { bufferView: b.view(encode([1, 3], UNSIGNED_BYTE)), componentType: UNSIGNED_BYTE },
        values: { bufferView: b.view(encode([5, 0, 0, 0, -2, 0], FLOAT)) },
      },
    });
    const zeros = b.accessor({
      componentType: FLOAT,
      count: 3,
      type: "VEC3",
      min: [0, 0, 0],
      max: [0, 0, 7],
      sparse: {
        count: 1,
        indices: { bufferView: b.view(encode([2], UNSIGNED_SHORT)), componentType: UNSIGNED_SHORT },
        values: { bufferView: b.view(encode([0, 0, 7], FLOAT)) },
      },
    });
    b.root(
      b.node({
        name: "fx-over",
        mesh: b.mesh([{ attributes: { POSITION: over }, mode: 0 }], "fx-over"),
        translation: [0, 0, -10],
      }),
    );
    b.root(
      b.node({
        name: "fx-zeros",
        mesh: b.mesh([{ attributes: { POSITION: zeros }, mode: 0 }], "fx-zeros"),
        translation: [0, 20, 0],
      }),
    );
    const model = b.pack();
    expectBounds(check(model.bytes).measures.bounds, [0, -2, -10], [5, 20, 7]);
    // sparse indices must climb, within the accessor's count: the same file with its indices 3 and 1
    const indices = Number(obj(obj(item(model.gltf, "accessors", over).sparse).indices).bufferView);
    const bin = model.bin.slice();
    bin.set([3, 1], Number(item(model.gltf, "bufferViews", indices).byteOffset));
    expect(paths(check(packText(JSON.stringify(model.gltf), bin)))).toEqual([`RX2 accessors[${over}].sparse.indices`]);
  });

  it("reads positions from an interleaved view through its byteStride", () => {
    const b = new ModelBuilder();
    const rows = [
      [1, 1, 1, 0, 0],
      [2, 2, 2, 1, 0],
      [3, 3, -3, 0, 1],
    ];
    const view = b.view(concat(...rows.map((row) => encode(row, FLOAT))), { byteStride: 20 });
    const position = b.accessor({
      bufferView: view,
      componentType: FLOAT,
      count: 3,
      type: "VEC3",
      min: [1, 1, -3],
      max: [3, 3, 2],
    });
    const uv = b.accessor({ bufferView: view, byteOffset: 12, componentType: FLOAT, count: 3, type: "VEC2" });
    b.root(b.node({ name: "fx-i", mesh: b.mesh([{ attributes: { POSITION: position, TEXCOORD_0: uv } }], "fx-i") }));
    const { measures } = check(b.pack().bytes);
    expectBounds(measures.bounds, [1, 1, -3], [3, 3, 2]);
    expect(measures).toMatchObject({ vertices: 3, triangles: 1 });
  });
});

describe("the rules' readings", () => {
  it("holds the bounds to the larger of 2 cm and 3% of the extent at the stylized scale", () => {
    const deskAt = (x: number): Uint8Array =>
      desk({ edit: (g) => (item(g, "nodes", 0).translation = [x, 0, 0]) }).bytes;
    // the desk's x extent is 1.6 m: 3% of it, 4.8 cm, is the larger
    expect(check(deskAt(0.047)).findings).toEqual([]);
    const off = check(deskAt(0.049));
    expect(off.findings.map(render)).toEqual([
      "RX7 candidate:-: bounds on x from -0.7510 to 0.8490 m, off the catalog's -0.8000 to 0.8000 m by more than 0.0480 m",
    ]);
    // the sign's z extent at its scale of 2 is 4 cm: 3% of it is 1.2 mm, so 2 cm holds
    const bare: FitInput = { ...SIGN_INPUT, faces: [] };
    const signAt = (z: number): Uint8Array =>
      sign({ edit: (g) => (item(g, "nodes", 0).translation = [0, 0, z]) }).bytes;
    expect(check(signAt(0.019), bare).findings).toEqual([]);
    expect(paths(check(signAt(0.021), bare))).toEqual(["RX7 -"]);
    expect(paths(check(desk({ edit: (g) => (item(g, "scenes", 0).nodes = []) }).bytes))).toEqual(["RX7 -"]);
  });

  it("prints a misfit face's measured plane: its centre and edges to 0.1 mm, its facing and up to 0.001", () => {
    const centre = check(sign({ wordNode: { translation: [0.003, 0.26, 0.02] } }).bytes, SIGN_INPUT);
    expect(centre.findings.map(render)).toEqual([
      "RX8 candidate:nodes[3]: live face off the catalog's live_faces[0] by centre 3.0 mm: measured centre " +
        "(0.0030, 0.2600, 0.0200) m, edges 0.6000, 0.6000, 0.1600, and 0.1600 m (top, bottom, left, right), " +
        "facing (0.000, 0.000, 1.000), up (0.000, 1.000, 0.000)",
    ]);
    const tilted = check(sign({ wordNode: { rotation: aboutX(92) } }).bytes, SIGN_INPUT);
    expect(tilted.findings.map((f) => f.reason)).toEqual([
      "live face off the catalog's live_faces[0] by facing 2.0° and up 2.0°: measured centre " +
        "(0.0000, 0.2600, 0.0200) m, edges 0.6000, 0.6000, 0.1600, and 0.1600 m (top, bottom, left, right), " +
        "facing (0.000, -0.035, 0.999), up (0.000, 0.999, 0.035)",
    ]);
    const backwards = check(sign({ word: { indices: [0, 1, 2, 1, 3, 2] } }).bytes, SIGN_INPUT);
    expect(backwards.findings.map((f) => f.reason.split(":")[0])).toEqual([
      "live face off the catalog's live_faces[0] by winding 180.0°",
    ]);
  });

  it("refuses a live face's mesh without exactly one primitive, none or two", () => {
    const line = `RX8 candidate:meshes[${SIGN.meshes.word}].primitives: a live face's mesh without exactly one primitive`;
    const none = sign({ edit: (g) => (item(g, "meshes", SIGN.meshes.word).primitives = []) });
    expect(check(none.bytes, SIGN_INPUT).findings.map(render)).toEqual([line]);
    const two = sign({
      build: (b) => list(item(b.gltf, "meshes", SIGN.meshes.word), "primitives").push(b.quad(WORD_QUAD, 2)),
    });
    expect(check(two.bytes, SIGN_INPUT).findings.map(render)).toEqual([line]);
  });

  it("finds a face's corners by their texture coordinates within 0.001, quantized or not, as strips and fans too", () => {
    const within = sign({
      word: {
        uvs: [
          [0.0009, 0],
          [1, 0.0009],
          [0, 0.9991],
          [0.9991, 1],
        ],
      },
    });
    expect(check(within.bytes, SIGN_INPUT).findings).toEqual([]);
    const outside = sign({
      word: {
        uvs: [
          [0.0011, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ],
      },
    });
    expect(paths(check(outside.bytes, SIGN_INPUT))).toEqual(["RX8 meshes[2].primitives[0].attributes.TEXCOORD_0"]);
    // unsigned bytes, normalized, which glTF takes for texture coordinates without KHR_mesh_quantization
    const quantized = sign({
      word: {
        primitive: (b, m) => ({
          attributes: {
            POSITION: b.positions(corners(WORD_QUAD)),
            TEXCOORD_0: b.values([0, 0, 255, 0, 0, 255, 255, 255], "VEC2", UNSIGNED_BYTE, { normalized: true }),
          },
          indices: b.indices(QUAD_INDICES),
          material: m,
        }),
      },
    });
    expect(check(quantized.bytes, SIGN_INPUT).findings).toEqual([]);
    // the same quad as a strip and as a fan, both wound counter-clockwise
    for (const [mode, order] of [
      [5, [0, 2, 1, 3]],
      [6, [0, 2, 3, 1]],
    ] as const) {
      const shaped = sign({
        word: {
          primitive: (b, m) => ({ ...b.quad(WORD_QUAD, m, undefined, order), mode }),
        },
      });
      expect(check(shaped.bytes, SIGN_INPUT).findings).toEqual([]);
    }
  });

  it("admits 8-bit RGB and RGBA PNG, Huffman-coded JPEG of three components, and still WebP, with power-of-two sides", () => {
    expect(check(desk({ top: png({ width: 8, height: 8, colorType: 6 }) }).bytes).findings).toEqual([]);
    for (const sof of [0xc0, 0xc1, 0xc2]) {
      expect(check(desk({ legs: jpeg({ width: 16, height: 8, sof }) }).bytes).findings).toEqual([]);
    }
    for (const drawer of [webp({ lossy: true }), webp({ flags: 0x10 }), webp({ lossy: true, flags: 0x10 })]) {
      expect(check(desk({ drawer }).bytes).findings).toEqual([]);
    }
    // a small prop's textures at the caps' limit pass, and over it fail
    expect(check(desk().bytes, { ...DESK_INPUT, smallPropTexturePx: 16 }).findings).toEqual([]);
    expect(paths(check(desk().bytes, { ...DESK_INPUT, smallPropTexturePx: 8 }))).toEqual(["RX9 images[1]"]);
  });

  it("takes emission at zero, and refuses the rest of RX10's list", () => {
    expect(check(desk({ edit: (g) => (item(g, "materials", 0).emissiveFactor = [0, 0, 0]) }).bytes).findings).toEqual(
      [],
    );
  });
});

describe("the JSON, read strictly", () => {
  const model = desk();
  const text = JSON.stringify(model.gltf);
  const read = (t: string | Uint8Array): FitResult => check(packText(t, model.bin));
  /** The one finding the JSON stage gives a file it refuses, RX2 on the whole file: its reason. */
  const refusal = (t: string | Uint8Array): string => {
    const result = read(t);
    expect(paths(result)).toEqual(["RX2 -"]);
    return result.findings[0]?.reason ?? "";
  };
  const backslash = "\\";
  const DUPLICATE = /^its JSON holds a duplicate key, at character [\d,]+$/;
  const NON_FINITE = /^its JSON holds NaN, Infinity, or a number past a double's range, at character [\d,]+$/;
  const SYNTAX = /^its JSON doesn't parse, at character [\d,]+$/;

  it.each([
    ["a duplicate key", text.replace('"scene":0', '"scene":0,"scene":0'), DUPLICATE],
    ["a duplicate key behind an escape", text.replace('"scene":0', `"scene":0,"scen${backslash}u0065":0`), DUPLICATE],
    ["NaN", text.replace('"scene":0', '"scene":NaN'), NON_FINITE],
    ["Infinity", text.replace('"scene":0', '"scene":Infinity'), NON_FINITE],
    ["-Infinity", text.replace('"scene":0', '"scene":-Infinity'), NON_FINITE],
    ["a number past a double's range", text.replace('"scene":0', '"scene":1e400'), NON_FINITE],
    ["text after the object", `${text}x`, SYNTAX],
    ["a trailing comma", text.replace(/}$/, ",}"), SYNTAX],
    ["a control character in a string", text.replace('"fx-top"', '"fx-\ttop"'), SYNTAX],
    ["an escape JSON doesn't have", text.replace('"fx-top"', `"fx-${backslash}xtop"`), SYNTAX],
    ["a key without quotes", text.replace('"scene":0', "scene:0"), SYNTAX],
    ["a leading zero", text.replace('"scene":0', '"scene":00'), SYNTAX],
    ["an array where the root object goes", "[]", /^its JSON isn't an object$/],
  ] as const)("refuses %s as RX2", (_, t, reason) => {
    expect(refusal(t)).toMatch(reason);
  });

  it("refuses a byte-order mark and bytes that aren't UTF-8, and takes UTF-8 and escapes that are sound", () => {
    // the desk top's node name, the first "fx-top", replaced by the bytes under test
    const at = text.indexOf('"fx-top"');
    const [head, tail] = [text.slice(0, at), text.slice(at + '"fx-top"'.length)];
    const withName = (name: Uint8Array): Uint8Array => concat(ascii(head), ascii('"'), name, ascii('"'), ascii(tail));
    expect(refusal(concat(bytes(0xef, 0xbb, 0xbf), ascii(text)))).toBe("its JSON chunk starts with a byte-order mark");
    for (const unsound of [
      bytes(0xff), // never UTF-8
      bytes(0xc0, 0xaf), // an overlong "/"
      bytes(0xed, 0xa0, 0x80), // a surrogate
      bytes(0xf4, 0x90, 0x80, 0x80), // past U+10FFFF
      bytes(0xe2, 0x82), // cut short
    ]) {
      expect(refusal(withName(concat(ascii("fx-"), unsound)))).toBe("its JSON chunk isn't UTF-8");
    }
    // sound UTF-8, two and four bytes long, and a lone surrogate's escape, which Python's json takes too: the names
    // are then RX6's
    const accented = `fx-caf${String.fromCodePoint(0xe9)}-${String.fromCodePoint(0x1f600)}`;
    expect(paths(read(withName(ascii(accented))))).toEqual(["RX6 nodes[1].name"]);
    expect(paths(read(withName(ascii(`fx-${backslash}ud800`))))).toEqual(["RX6 nodes[1].name"]);
  });

  it("refuses a number written with a fraction or an exponent where the schema wants an integer", () => {
    expect(paths(read(text.replace(/"count":(\d+)/, '"count":$1.0')))).toEqual(["RX2 accessors[0].count"]);
    expect(paths(read(text.replace(/"count":(\d+)/, '"count":$1e0')))).toEqual(["RX2 accessors[0].count"]);
    expect(paths(read(text.replace('"scene":0', '"scene":0.0')))).toEqual(["RX2 scene"]);
    expect(read(text.replace(/"count":(\d+)/, '"count":$1.0')).findings[0]?.reason).toBe("not an integer");
  });

  it("takes __proto__ and constructor as plain keys, outside the schema, and changes no prototype", () => {
    const keys = text.replace('"name":"fx-top"', '"name":"fx-top","__proto__":{"mesh":0},"constructor":1');
    expect(paths(read(keys))).toEqual(["RX2 nodes[1].__proto__", "RX2 nodes[1].constructor"]);
    expect(({} as Obj).mesh).toBeUndefined();
    const parsed = strictJson(ascii('{"__proto__":{"a":1},"b":2}'));
    expect(parsed.ok && Object.getPrototypeOf(parsed.value)).toBeNull();
  });

  it("refuses JSON nested past its depth limit, and reads the nesting a model has", () => {
    const deep = (n: number): string =>
      text.replace('"name":"fx-desk"', `"name":"fx-desk","extras":${"[".repeat(n)}${"]".repeat(n)}`);
    expect(refusal(deep(1000))).toMatch(/^its JSON nests deeper than 512, at character [\d,]+$/);
    expect(paths(read(deep(100)))).toEqual(["RX3 nodes[0].extras"]);
  });
});

describe("a check that never throws", () => {
  // A throw would fail the image build, where a misfit keeps its piece's stand-in (FR-013), and the lookdev page.
  const oneSparseValue = (b: ModelBuilder, values: readonly number[]): Obj => ({
    count: 1,
    indices: { bufferView: b.view(encode([5], UNSIGNED_SHORT)), componentType: UNSIGNED_SHORT },
    values: { bufferView: b.view(encode(values, FLOAT)) },
  });

  it("reads an accessor without a buffer view, a billion zeros and one sparse value, without holding them", () => {
    const model = desk({
      build: (b) => {
        const zeros = b.accessor({
          componentType: FLOAT,
          count: 1_000_000_000,
          type: "VEC3",
          min: [0, 0, 0],
          max: [0.1, 0.2, 0.3],
          sparse: oneSparseValue(b, [0.1, 0.2, 0.3]),
        });
        const mesh = b.mesh([{ attributes: { POSITION: zeros }, mode: 0 }], "fx-zeros");
        list(item(b.gltf, "nodes", 0), "children").push(b.node({ name: "fx-zeros", mesh }));
      },
    });
    const start = performance.now();
    const result = check(model.bytes);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(result.findings).toEqual([]);
    expect(result.measures.vertices).toBe(24 + 1_000_000_000);
  });

  it("finds a live face's quad wanting without reading a billion indices", () => {
    const model = sign({
      word: {
        primitive: (b, m) => ({
          attributes: { POSITION: b.positions(corners(WORD_QUAD)), TEXCOORD_0: b.texcoords(QUAD_UVS) },
          indices: b.accessor({ componentType: 5125, count: 1_000_000_000, type: "SCALAR" }),
          material: m,
        }),
      },
    });
    expect(paths(check(model.bytes, SIGN_INPUT))).toEqual([`RX8 meshes[${SIGN.meshes.word}].primitives[0]`]);
  });

  it("answers each of a thousand damaged files with findings, never a throw", () => {
    // xorshift32 from a fixed seed, so a failure names its run
    let state = 0x2545f491;
    const random = (n: number): number => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) % n;
    };
    const models = [desk(), sign()];
    for (let run = 0; run < 1000; run++) {
      const model = models[run % 2];
      if (model === undefined) continue;
      let damaged: Uint8Array;
      if (run % 4 < 2) {
        // a digit of the JSON changed: indices, counts, offsets, and lengths that name the wrong thing
        const text = JSON.stringify(model.gltf);
        const digits = [...text.matchAll(/\d/g)].map((m) => m.index);
        const at = digits[random(digits.length)] ?? 0;
        damaged = packText(`${text.slice(0, at)}${random(10)}${text.slice(at + 1)}`, model.bin);
      } else {
        // a byte of the file changed
        damaged = model.bytes.slice();
        damaged[random(damaged.length)] = random(256);
      }
      const input = run % 2 ? SIGN_INPUT : DESK_INPUT;
      let result: FitResult | undefined;
      expect(() => (result = check(damaged, input)), `run ${run}`).not.toThrow();
      for (const f of result?.findings ?? []) {
        expect(RX_RULES, `run ${run}`).toContain(f.rule);
        expect(f.path.length * f.reason.length, `run ${run}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("the parts", () => {
  it("reads PNG's IHDR, JPEG's start of frame, and WebP's VP8, VP8L, and VP8X headers", () => {
    expect(readImage(png({ width: 8, height: 2, colorType: 6 }))).toEqual({
      format: "png",
      header: { format: "png", width: 8, height: 2, bitDepth: 8, colorType: 6 },
    });
    expect(readImage(jpeg({ width: 16, height: 8, sof: 0xc2 })).header).toEqual({
      format: "jpeg",
      width: 16,
      height: 8,
      sof: 0xc2,
      precision: 8,
      components: 3,
    });
    expect(readImage(webp({ width: 3, height: 5 })).header).toEqual({
      format: "webp",
      width: 3,
      height: 5,
      animated: false,
    });
    expect(readImage(webp({ width: 6, height: 7, lossy: true })).header).toEqual({
      format: "webp",
      width: 6,
      height: 7,
      animated: false,
    });
    expect(readImage(webp({ width: 9, height: 2, lossy: true, flags: 0x10 })).header).toEqual({
      format: "webp",
      width: 9,
      height: 2,
      animated: false,
    });
    expect(readImage(webp({ animated: true })).header).toMatchObject({ animated: true });
    expect(readImage(ascii("GIF89a and the rest"))).toEqual({ format: null, header: null });
    expect(readImage(concat(PNG_SIGNATURE, ascii("no header")))).toEqual({ format: "png", header: null });
  });

  it("builds spec 003's 8 × 8 grey JPEG byte for byte, its mark aside (arrival_fixtures.jpeg(mark=False))", () => {
    const segment = (marker: number, body: readonly number[]): number[] => [0xff, marker, 0, body.length + 2, ...body];
    const expected = [
      ...[0xff, 0xd8],
      ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
      ...segment(0xdb, [0, ...new Array<number>(64).fill(1)]),
      ...segment(0xc0, [8, 0, 8, 0, 8, 1, 1, 0x11, 0]),
      ...segment(0xc4, [0x00, 1, ...new Array<number>(15).fill(0), 0]),
      ...segment(0xc4, [0x10, 1, ...new Array<number>(15).fill(0), 0]),
      ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
      0x3f,
      ...[0xff, 0xd9],
    ];
    expect([...jpeg({ components: 1 })]).toEqual(expected);
  });

  it("ports spec 003's M8: a path, a file name, or a camera's file stem, Blender's side suffixes aside", () => {
    for (const name of ["Hand.L", "viseme_PP", "mouthSmileLeft", "desk-top", "leg-2", "disc", "spine.R2"]) {
      expect(nameProblem(name)).toBeNull();
    }
    expect(nameProblem("textures/face")).toBe("path");
    expect(nameProblem("C:\\Users\\me\\face")).toBe("path");
    expect(nameProblem("skin_diffuse.png")).toBe("file-name");
    expect(nameProblem("IMG_1234.jpg")).toBe("file-name");
    for (const name of [
      "PXL_20261012",
      "IMG-20261012-WA0003",
      "20261012_094101",
      "DSC01234",
      "dscn_1",
      "Screenshot 2026",
    ]) {
      expect(nameProblem(name)).toBe("camera-stem");
    }
  });

  it("holds node and mesh names to the rule, and gives the scrubber's neutral IDs", () => {
    for (const name of ["desk", "desk-top", "leg-2", "a1-b2"]) expect(NAME_RULE.test(name)).toBe(true);
    for (const name of ["Desk", "desk.001", "desk--top", "-desk", "desk-", "desk_top", ""])
      expect(NAME_RULE.test(name)).toBe(false);
    expect(neutralId("material", 2)).toBe("material-2");
  });

  it("writes each rule's text once, for the refusals and the work orders' export rules", () => {
    expect(Object.keys(RULE_TEXT)).toEqual([...RX_RULES]);
    const printed = (px: number): string =>
      exportRules(px)
        .map((rule) => `${rule.title} ${rule.text}`)
        .join("\n");
    for (const name of [...ADMITTED_EXTENSIONS, ...REFUSED_MATERIALS]) {
      expect(printed(1024)).toContain(name);
      expect(RULE_TEXT.RX4).toContain(name);
    }
    expect(printed(1024)).toContain("1,024 pixels");
    expect(printed(512)).toContain("512 pixels");
    expect(printed(1024)).toContain(NAME_RULE.source);
    expect(exportRules(1024)).toHaveLength(9);
    expect(Object.values(MARK_VALUES)).toEqual(["trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia"]);
  });
});

describe("an image card, held to RX9's texture rules (contracts/plain-model-fit.md §7)", () => {
  const card = (data: Uint8Array, extension: string, smallPropTexturePx: number | null = null) =>
    fitCard(data, extension, { smallPropTexturePx }, { file: FILE });
  const at = (result: ReturnType<typeof card>): string[] => result.findings.map((f) => `${f.rule} ${f.path}`);

  it("passes a PNG, a JPEG, and a still WebP of power-of-two sides, measured as served, as stored", () => {
    for (const [data, extension, w, h] of [
      [png({ width: 8, height: 4 }), "png", 8, 4],
      [jpeg({ width: 16, height: 8 }), "jpg", 16, 8],
      [webp({ width: 4, height: 4 }), "webp", 4, 4],
    ] as const) {
      const result = card(data, extension);
      expect(at(result)).toEqual([]);
      expect(result.measures).toEqual({ bytes: data.length, textureBytes: textureMemory(w, h), maxTexturePx: w });
    }
  });

  it("refuses bytes its extension doesn't name, and each texture rule, for the whole file", () => {
    const misnamed = card(jpeg(), "png");
    expect(at(misnamed)).toEqual(["RX9 -"]);
    expect(misnamed.findings[0]?.reason).toBe(REASON.extensionMismatch);
    expect(at(card(png({ width: 6, height: 4 }), "png"))).toEqual(["RX9 -"]);
    expect(at(card(png({ width: 8, height: 8, colorType: 3, fill: 0 }), "png"))).toEqual(["RX9 -"]);
    expect(at(card(webp({ animated: true }), "webp"))).toEqual(["RX9 -"]);
    const large = png({ width: 2048, height: 1024, fill: 0, level: 1 });
    expect(at(card(large, "png", 1024))).toEqual(["RX9 -"]);
    expect(at(card(large, "png", 2048))).toEqual([]);
  });

  it("measures no texture where its header can't be read", () => {
    const data = ascii("fx-not an image");
    const result = card(data, "png");
    expect(at(result)).toEqual(["RX9 -"]);
    expect(result.measures).toEqual({ bytes: data.length, textureBytes: null, maxTexturePx: null });
  });
});
