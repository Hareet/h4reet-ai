// T122 (spec 004; FR-023, FR-067, FR-068, User Story 3 scenario 2; research.md R-41; contracts/lookdev.md §4,
// plain-model-fit.md §10, §11, data-model.md §11.6): a candidate, a picked file held in page memory and judged by the
// compositor's own fit code against its piece's fit inputs as compose() gives them to virtual:room-lookdev. Every GLB
// test/helpers/glb.ts and room-models.ts make, set on a fixture piece, gets compose()'s findings for the same bytes and
// piece, in compose()'s order, with `candidate` for the file, RK2's among them; and compose()'s measures. An unmarked
// file reads "not scrubbed"; the SHA-256 is Node's; the picked file is read with arrayBuffer() and nothing else, so its
// name appears nowhere; and nothing is requested or stored. A candidate reaches three's GLTFLoader only past RX1 and
// RX2 and with no RX3 uri, since three's parser fetches a buffer's uri: the last describe shows it doing so. RX2's
// properties the reader never reads (Blender's asset.generator, which spec 003's scrub drops) don't keep it out: an
// unscrubbed export is measured and swapped in as a preview of an unscrubbed file, every finding listed, and the
// compositor still refuses it (plan.md §10).
import { createHash } from "node:crypto";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import type { ComposeResult, RoomPolicy } from "../../build/room/compose";
import {
  NOT_GLB,
  NOT_SCRUBBED,
  REFUSAL,
  candidatePieces,
  judgeCandidate,
  loadable,
  markReadout,
  readCandidate,
  startsAsGlb,
} from "../../src/lookdev/candidate";
import type { Candidate, PieceFit } from "../../src/lookdev/candidate";
import type { FitInput } from "../../src/room/glb/fit";
import { MARK_VALUES, REASON, count } from "../../src/room/glb/rules";
import {
  BLENDER_GENERATOR,
  DESK_INPUT,
  ModelBuilder,
  SIGN_INPUT,
  asExported,
  desk,
  item,
  list,
  obj,
  rxVariants,
  sign,
} from "../helpers/glb";
import type { Obj } from "../helpers/glb";
import { spyOnGlobals } from "../helpers/globals";
import type { GlobalSpies } from "../helpers/globals";
import { badCases, goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const nodeSha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** The name the picker would reveal, which must appear nowhere. */
const PICKED_NAME = "PXL_20261023_fx-picked-name.glb";
/** A finding as the page prints it. */
const FINDING = /^R[XK]\d+ candidate:\S+: \S/;
/** The variants whose one finding is RX2's for a property the reader never reads, a key outside the glTF 2.0 schema:
 *  measured, and swapped in, where every other RX1 and RX2 variant is refused (plan.md §10). */
const READ_PAST = new Set(["rx2-outside-the-schema", "rx2-generator"]);
/** The variants a candidate is refused on: RX1's, RX2's but those, and RX3's uri. */
const refusedVariant = (id: string): boolean => id === "rx3-uri" || (/^rx[12]-/.test(id) && !READ_PAST.has(id));

let globals: GlobalSpies;

beforeEach(() => {
  globals = spyOnGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fixture piece prepared for a model by a known-bad case's edits: the desk with test/helpers/glb.ts's DESK_INPUT
 *  bounds (bad/RX7), or the sign as SIGN_CATALOG gives it, its faces renamed in the scene (bad/RX8). */
function base(input: FitInput): { piece: string; file: string; changes: Map<string, Uint8Array | null> } {
  const name = input === SIGN_INPUT ? "RX8" : "RX7";
  const c = badCases().find((x) => x.name === name);
  if (!c) throw new Error(`no bad case ${name}`);
  const piece = c.file.slice("assets/room/".length, -".glb".length);
  return { piece, file: c.file, changes: new Map(c.changes) };
}

/** assets/room/records.json recording one model, as RI7 asks. */
function records(file: string, data: Uint8Array): Uint8Array {
  const entries = [{ file: file.slice("assets/room/".length), sha256: nodeSha256(data), kind: "room" }];
  const record = { schema: 1, directory: "assets/room", license: "all-rights-reserved-2026", entries };
  return encoder.encode(`${JSON.stringify(record, null, 2)}\n`);
}

interface Composed {
  readonly result: ComposeResult;
  readonly piece: string;
  readonly file: string;
  readonly fit: PieceFit;
}

/** `data` set as the model of the piece `input` names, its budget's triangles `triangles` where given, composed
 *  leniently with drafts under main's caps, the caps naming the piece a small prop where `input` makes it one. */
function composedWith(data: Uint8Array, input: FitInput, triangles?: number): Composed {
  const { piece, file, changes } = base(input);
  changes.set(file, data);
  changes.set("assets/room/records.json", records(file, data));
  const entryPath = `apps/web/room/catalog/${piece}.yaml`;
  if (triangles !== undefined) {
    const entry = parse(decoder.decode(changes.get(entryPath) ?? new Uint8Array())) as {
      budget: { triangles: number };
    };
    entry.budget.triangles = triangles;
    changes.set(entryPath, encoder.encode(stringify(entry)));
  }
  const small = input.smallPropTexturePx;
  const policy: RoomPolicy = capsPolicy(small === null ? {} : { small_props: [piece], small_prop_texture_px: small });
  const result = compose(overlay(Object.fromEntries(changes)), policy, { mode: "lenient", drafts: true });
  const fit = result.drafts?.lookdev.pieces[piece];
  if (!fit) throw new Error(`no fit inputs for ${piece}`);
  return { result, piece, file, fit };
}

/** compose()'s findings, every one about the model's file, as the page prints a candidate's. */
function composeFindings(c: Composed): string[] {
  return c.result.findings.map((f) => {
    expect(f.file, `${f.rule} ${f.file}:${f.path}`).toBe(c.file);
    return `${f.rule} candidate:${f.path}: ${f.reason}`;
  });
}

/** The report's row for a set model: its file, plain and gzip-9 bytes, triangles, and texture memory. */
function reportCells(result: ComposeResult, piece: string): string {
  const row = result.report.markdown.split("\n").find((line) => line.startsWith(`| \`${piece}\``));
  if (row === undefined) throw new Error(`no report row for ${piece}`);
  return row;
}

/** That `c` carries compose()'s measures of the set model of its piece. */
function expectComposeMeasures(c: Candidate, result: ComposeResult, data: Uint8Array): void {
  const model = result.models.find((m) => m.piece === c.piece);
  expect(model, c.piece).toBeDefined();
  expect(c.sha256).toBe(model?.sha256);
  expect(c.gzipBytes).toBe(model?.gz.length);
  expect(c.bytes).toBe(data.length);
  const m = c.measures;
  expect(reportCells(result, c.piece)).toContain(
    `| studio, \`${c.piece}.glb\` | ${count(c.bytes)} | ${count(c.gzipBytes)} | ${count(m.triangles ?? -1)} | ` +
      `${count(m.textureBytes ?? -1)} |`,
  );
  for (const placement of result.scene.placements.filter((p) => p.piece === c.piece)) {
    expect(placement.model?.sha256).toBe(c.sha256);
    expect(placement.model?.bytes).toBe(c.gzipBytes);
    expect(placement.model?.texture_bytes).toBe(m.textureBytes);
    for (const corner of ["min", "max"] as const)
      for (let a = 0; a < 3; a++)
        expect(placement.model?.bounds[corner][a], `${corner}[${a}]`).toBeCloseTo(m.bounds?.[corner][a] ?? NaN, 6);
  }
}

describe("a candidate's findings and measures are compose()'s for the same bytes and piece (FR-068)", () => {
  it("every variant of test/helpers/glb.ts gets compose()'s findings, in its order, `candidate` for the file", () => {
    const variants = rxVariants();
    expect(variants.length).toBeGreaterThan(80);
    for (const v of variants) {
      const c = composedWith(v.bytes, v.input);
      const candidate = judgeCandidate(c.piece, v.bytes, c.fit);
      const expected = composeFindings(c);
      expect(expected.length, v.id).toBeGreaterThan(0);
      expect(candidate.findings, v.id).toEqual(expected);
      for (const line of candidate.findings) expect(line, v.id).toMatch(FINDING);
      expect(candidate.sha256, v.id).toBe(nodeSha256(v.bytes));
    }
  });

  it("with RK2's findings among RX's, RK2's first, as compose() sorts them, under a budget of one triangle", () => {
    let both = 0;
    for (const v of rxVariants()) {
      const c = composedWith(v.bytes, v.input, 1);
      const candidate = judgeCandidate(c.piece, v.bytes, c.fit);
      expect(candidate.findings, v.id).toEqual(composeFindings(c));
      const rk2 = candidate.findings.filter((f) => f.startsWith("RK2 "));
      // A file RX1 or RX2 refuses has no measures, so nothing to hold to a budget; a property the reader never reads
      // (READ_PAST's variants) stops nothing, so its file is held to it.
      expect(rk2.length > 0, v.id).toBe(candidate.measures.triangles !== null);
      if (rk2.length > 0 && rk2.length < candidate.findings.length) both += 1;
    }
    expect(both).toBeGreaterThan(50);
    // The known-bad RK2 case: the clean desk over a budget of 20 triangles.
    const rk2Case = badCases().find((x) => x.name === "RK2");
    const data = rk2Case?.changes.get(rk2Case.file);
    if (!rk2Case || !data) throw new Error("no RK2 case");
    const c = composedWith(data, DESK_INPUT, 20);
    expect(judgeCandidate(c.piece, data, c.fit).findings).toEqual([
      `RK2 candidate:-: 36 triangles, over the piece's budget of 20; the piece keeps its stand-in`,
    ]);
  });

  it("a clean model on every fixture piece that takes one: no finding, and the 3D part's and the report's measures", () => {
    const pieces = ["fx-board", "fx-desk", "fx-laptop", "fx-monitor", "fx-neon", "fx-plug", "fx-shell", "fx-sign"];
    const files = modelChanges(pieces);
    const result = compose(overlay(files), capsPolicy(), { mode: "strict", drafts: true });
    expect(result.findings).toEqual([]);
    for (const piece of pieces) {
      const data = files[`assets/room/${piece}.glb`] as Uint8Array;
      const fit = result.drafts?.lookdev.pieces[piece];
      if (!fit) throw new Error(`no fit inputs for ${piece}`);
      const c = judgeCandidate(piece, data, fit);
      expect(c.findings, piece).toEqual([]);
      expect([c.scrubbed, c.mark, c.swappable], piece).toEqual([true, "model", true]);
      expectComposeMeasures(c, result, data);
    }
  });

  it("textured models, the desk and the sign: their texture memory, triangles, and bounds as compose() measures them", () => {
    for (const [input, model] of [
      [DESK_INPUT, desk()],
      [SIGN_INPUT, sign()],
    ] as const) {
      const c = composedWith(model.bytes, input);
      expect(c.result.findings).toEqual([]);
      const candidate = judgeCandidate(c.piece, model.bytes, c.fit);
      expect(candidate.findings).toEqual([]);
      expect(candidate.measures.textureBytes).toBeGreaterThan(0);
      expectComposeMeasures(candidate, c.result, model.bytes);
    }
  });
});

describe("the mark (FR-068)", () => {
  it('reads "not scrubbed" for an unmarked file, which stops no other finding', () => {
    const unmarked = desk({ mark: false, edit: (g) => (item(g, "nodes", 0).translation = [0.05, 0, 0]) }).bytes;
    const c = composedWith(unmarked, DESK_INPUT);
    const candidate = judgeCandidate(c.piece, unmarked, c.fit);
    expect([candidate.scrubbed, candidate.mark, markReadout(candidate)]).toEqual([false, null, NOT_SCRUBBED]);
    expect(NOT_SCRUBBED).toBe("not scrubbed");
    expect(candidate.findings).toContain(`RX5 candidate:extensions: ${REASON.notScrubbed}`);
    expect(candidate.findings.some((f) => f.startsWith("RX7 candidate:-: "))).toBe(true);
    expect(candidate.swappable).toBe(true);
  });

  it("shows the mark's class, model or composite, and no class for a mark RX5 refuses", () => {
    const classes = Object.entries(MARK_VALUES).map(([kind, term]) => {
      const data = desk({ mark: term }).bytes;
      const c = composedWith(data, DESK_INPUT);
      const candidate = judgeCandidate(c.piece, data, c.fit);
      expect(candidate.findings, kind).toEqual([]);
      return [candidate.scrubbed, candidate.mark, markReadout(candidate)];
    });
    expect(classes).toEqual([
      [true, "model", "model"],
      [true, "composite", "composite"],
    ]);
    const other = desk({ mark: "digitalCapture" }).bytes;
    const c = composedWith(other, DESK_INPUT);
    const candidate = judgeCandidate(c.piece, other, c.fit);
    expect([candidate.scrubbed, candidate.mark]).toEqual([true, null]);
    expect(markReadout(candidate)).not.toBe(NOT_SCRUBBED);
    expect(markReadout(candidate)).toContain("RX5");
  });
});

describe("a picked file, in memory only (FR-067, contracts/lookdev.md §4)", () => {
  /** A picked file that records every property read of it. */
  function picked(data: Uint8Array): { file: File; touched: string[] } {
    const touched: string[] = [];
    const real = new File([data.slice()], PICKED_NAME, { type: "model/gltf-binary", lastModified: 1_761_200_000_000 });
    const file = new Proxy(real, {
      get(target, key) {
        touched.push(String(key));
        const value = Reflect.get(target, key, target) as unknown;
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    return { file, touched };
  }

  it("is read with arrayBuffer() and nothing else, so neither its name nor anything else about it is kept", async () => {
    const model = desk();
    const c = composedWith(model.bytes, DESK_INPUT);
    const { file, touched } = picked(model.bytes);
    const candidate = await readCandidate(c.piece, file, c.fit);
    expect(touched).toEqual(["arrayBuffer"]);
    expect(candidate.sha256).toBe(nodeSha256(model.bytes));
    expect(candidate).toEqual(judgeCandidate(c.piece, model.bytes, c.fit));
    const shown = JSON.stringify(candidate);
    for (const part of [PICKED_NAME, "PXL_", "fx-picked-name", "gltf-binary", "1761200000000"])
      expect(shown, part).not.toContain(part);
  });

  it("makes 0 requests and 0 object URLs, and touches no cookie, localStorage, sessionStorage, IndexedDB, or cache", async () => {
    for (const v of rxVariants().slice(0, 30)) {
      const c = composedWith(v.bytes, v.input);
      const candidate = await readCandidate(c.piece, picked(v.bytes).file, c.fit);
      loadable(candidate);
    }
    const model = sign();
    const c = composedWith(model.bytes, SIGN_INPUT);
    loadable(await readCandidate(c.piece, picked(model.bytes).file, c.fit));
    expect(globals).toEqual({ network: [], storage: [] });
  });

  it("holds its own copy of the bytes, so the hash it shows is of the bytes it hands over", () => {
    const data = desk().bytes.slice();
    const c = composedWith(data, DESK_INPUT);
    const candidate = judgeCandidate(c.piece, data, c.fit);
    const sha = nodeSha256(data);
    data.fill(0);
    const handed = loadable(candidate);
    expect(handed).not.toBeNull();
    expect(nodeSha256(new Uint8Array(handed ?? new ArrayBuffer(0)))).toBe(sha);
    expect(candidate.sha256).toBe(sha);
    // Each hand-over is a copy of its own.
    expect(loadable(candidate)).not.toBe(handed);
  });
});

describe("a picked file's first 4 bytes (the review's page-10)", () => {
  it("are all that is read before a file is known to begin with GLB's magic, glTF", async () => {
    const reads: string[] = [];
    const file = (data: Uint8Array): Pick<Blob, "slice"> =>
      ({
        slice: (start?: number, end?: number) => {
          reads.push(`slice(${start}, ${end})`);
          return { arrayBuffer: () => Promise.resolve(data.slice(start, end).buffer) };
        },
      }) as unknown as Pick<Blob, "slice">;
    expect(await startsAsGlb(file(desk().bytes))).toBe(true);
    expect(await startsAsGlb(file(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])))).toBe(false);
    expect(await startsAsGlb(file(encoder.encode("gltf, in the wrong case")))).toBe(false);
    expect(await startsAsGlb(file(encoder.encode("glT")))).toBe(false);
    expect(await startsAsGlb(file(new Uint8Array(0)))).toBe(false);
    expect(reads).toEqual(new Array<string>(5).fill("slice(0, 4)"));
    expect(NOT_GLB).toBe("not a GLB: nothing kept");
    expect(globals).toEqual({ network: [], storage: [] });
  });
});

describe("what the room's parse path may take (contracts/lookdev.md §4; a candidate never makes a request)", () => {
  /** A box at the desk's DESK_INPUT bounds whose one buffer has a uri as well as the BIN chunk. */
  const bufferUri = (): Uint8Array => {
    const b = new ModelBuilder();
    const mesh = b.mesh([b.box(DESK_INPUT.bounds.min, DESK_INPUT.bounds.max)], "fx-box");
    b.root(b.node({ name: "fx-box", mesh }));
    return b.pack({ edit: (g) => (item(g, "buffers", 0).uri = "fx-model.bin") }).bytes;
  };

  it("three's GLTFLoader fetches a buffer's uri, relative to the page: why RX3's uri keeps a candidate out", async () => {
    const data = bufferUri();
    const view = data.slice().buffer;
    await expect(new GLTFLoader().parseAsync(view, "http://127.0.0.1:18105/lookdev/")).rejects.toThrow();
    expect(globals.network).toEqual(["fetch http://127.0.0.1:18105/lookdev/fx-model.bin"]);
  });

  it("refuses a candidate with RX3's uri on a buffer or an image, as it refuses one RX1 or RX2 refuses", () => {
    const data = bufferUri();
    const c = composedWith(data, DESK_INPUT);
    const candidate = judgeCandidate(c.piece, data, c.fit);
    expect(candidate.findings).toEqual([`RX3 candidate:buffers[0].uri: ${REASON.uri}`]);
    expect([candidate.swappable, loadable(candidate)]).toEqual([false, null]);
    expect([candidate.refusal, candidate.preview]).toEqual(["uri", false]);
    const refused = rxVariants().filter((v) => refusedVariant(v.id));
    expect(refused.length).toBeGreaterThan(20);
    for (const v of refused) {
      const composed = composedWith(v.bytes, v.input);
      const one = judgeCandidate(composed.piece, v.bytes, composed.fit);
      expect([one.swappable, loadable(one)], v.id).toEqual([false, null]);
      expect(one.refusal, v.id).toBe(v.id === "rx3-uri" ? "uri" : v.rule);
    }
    expect(REFUSAL).toEqual({
      RX1: "RX1 refuses the file",
      RX2: "RX2 refuses the file",
      uri: "it names a uri, which the page never fetches",
    });
    expect(globals.network).toEqual([]);
  });

  it("hands over any other candidate whatever its findings, so the Author sees a misfit at the room's framing", () => {
    const others = rxVariants().filter((v) => !refusedVariant(v.id));
    expect(others.map((v) => v.id)).toEqual(expect.arrayContaining(["rx3-camera", ...READ_PAST]));
    for (const v of others) {
      const c = composedWith(v.bytes, v.input);
      const candidate = judgeCandidate(c.piece, v.bytes, c.fit);
      expect(candidate.findings.length, v.id).toBeGreaterThan(0);
      expect(candidate.swappable, v.id).toBe(true);
      const handed = loadable(candidate);
      expect(handed, v.id).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(handed ?? new ArrayBuffer(0)), v.id).toEqual(v.bytes);
      expect(candidate.refusal, v.id).toBeNull();
    }
    // A copy of a candidate isn't one: only the candidate the module made hands its bytes over.
    const model = desk();
    const c = composedWith(model.bytes, DESK_INPUT);
    const candidate = judgeCandidate(c.piece, model.bytes, c.fit);
    expect(loadable({ ...candidate })).toBeNull();
  });
});

describe('an unscrubbed file, as a preview (plan.md §10; contracts/lookdev.md §4\'s "whatever its other findings")', () => {
  /** The desk as Blender exports it, before the scrub: the asset's generator, a custom property, and no mark. */
  const exported = (): Uint8Array => desk({ mark: false, edit: asExported }).bytes;

  it("is measured and swapped in, every finding listed, the properties the scrub drops among them", () => {
    const data = exported();
    const c = composedWith(data, DESK_INPUT);
    const candidate = judgeCandidate(c.piece, data, c.fit);
    expect(candidate.findings).toEqual(composeFindings(c));
    expect(candidate.findings).toEqual([
      `RX2 candidate:asset.generator: ${REASON.outsideAsset}`,
      `RX5 candidate:extensions: ${REASON.notScrubbed}`,
      `RX3 candidate:nodes[0].extras: ${REASON.extras}`,
    ]);
    // The clean desk's measures: the generator and the custom property change no geometry and no texture.
    const clean = judgeCandidate(c.piece, desk().bytes, c.fit);
    const shape = (x: Candidate): Candidate["measures"] => ({ ...x.measures, bytes: 0, gzipBytes: 0 });
    expect(shape(candidate)).toEqual(shape(clean));
    expect(candidate.measures.triangles).toBe(36);
    expect([candidate.scrubbed, candidate.mark, markReadout(candidate)]).toEqual([false, null, NOT_SCRUBBED]);
    expect([candidate.swappable, candidate.refusal, candidate.preview]).toEqual([true, null, true]);
    expect(new Uint8Array(loadable(candidate) ?? new ArrayBuffer(0))).toEqual(data);
    // Under a budget of one triangle, RK2 holds its measures as the compositor does.
    const tight = composedWith(data, DESK_INPUT, 1);
    expect(judgeCandidate(tight.piece, data, tight.fit).findings).toEqual([
      `RK2 candidate:-: 36 triangles, over the piece's budget of 1; the piece keeps its stand-in`,
      ...candidate.findings,
    ]);
    expect(composeFindings(tight)[0]).toMatch(/^RK2 candidate:-: 36 triangles/);
  });

  it("is a model the compositor still refuses: the finding stands, so the piece keeps its stand-in", () => {
    const data = exported();
    const c = composedWith(data, DESK_INPUT);
    const generator = c.result.findings.find((f) => f.rule === "RX2");
    expect(generator).toMatchObject({ file: c.file, path: "asset.generator", reason: REASON.outsideAsset });
    expect(c.result.models.map((m) => m.piece)).not.toContain(c.piece);
    const placed = c.result.scene.placements.filter((p) => p.piece === c.piece).map((p) => p.id);
    expect(placed.length).toBeGreaterThan(0);
    for (const id of placed) expect(c.result.manifest.standins).toContainEqual({ placement: id, reason: "findings" });
  });

  it("is labelled a preview only where it is unscrubbed or holds what the scrub drops", () => {
    const cases: [string, Uint8Array, boolean][] = [
      ["scrubbed, no finding", desk().bytes, false],
      ["scrubbed, a misfit", desk({ edit: (g) => (item(g, "nodes", 0).translation = [0.05, 0, 0]) }).bytes, false],
      ["scrubbed, a mark RX5 refuses", desk({ mark: "digitalCapture" }).bytes, false],
      ["not scrubbed", desk({ mark: false }).bytes, true],
      ["as exported, not scrubbed", exported(), true],
      [
        "marked, but holding the generator",
        desk({ edit: (g) => (obj(g.asset).generator = BLENDER_GENERATOR) }).bytes,
        true,
      ],
    ];
    for (const [what, data, preview] of cases) {
      const c = composedWith(data, DESK_INPUT);
      const candidate = judgeCandidate(c.piece, data, c.fit);
      expect([candidate.swappable, candidate.preview], what).toEqual([true, preview]);
    }
  });

  it("is still refused beside an RX2 problem that keeps the reader from reading it, or a uri", () => {
    const exportedWith = (edit: (g: Obj) => void): Uint8Array =>
      desk({
        mark: false,
        edit: (g) => {
          asExported(g);
          edit(g);
        },
      }).bytes;
    const cases: [string, Uint8Array, "RX2" | "uri"][] = [
      ["an index that names no element", exportedWith((g) => (item(g, "nodes", 2).mesh = 40)), "RX2"],
      [
        "an image's uri",
        exportedWith((g) => list(g, "images").push({ uri: "fx-top.png", mimeType: "image/png" })),
        "uri",
      ],
    ];
    for (const [what, data, refusal] of cases) {
      const c = composedWith(data, DESK_INPUT);
      const candidate = judgeCandidate(c.piece, data, c.fit);
      expect([candidate.swappable, candidate.refusal, candidate.preview, loadable(candidate)], what).toEqual([
        false,
        refusal,
        false,
        null,
      ]);
      expect(candidate.findings, what).toContain(`RX2 candidate:asset.generator: ${REASON.outsideAsset}`);
    }
  });
});

describe("the pieces that take a candidate (contracts/lookdev.md §3)", () => {
  it("are every piece of the fit inputs but the figures'", () => {
    const result = compose(goodTree(), capsPolicy(), { mode: "strict", drafts: true });
    const pieces = result.drafts?.lookdev.pieces ?? {};
    expect(Object.keys(pieces)).toContain("fx-twin");
    expect(candidatePieces(result.scene, pieces)).toEqual([
      "fx-board",
      "fx-desk",
      "fx-laptop",
      "fx-monitor",
      "fx-neon",
      "fx-plug",
      "fx-shell",
      "fx-sign",
    ]);
  });
});
