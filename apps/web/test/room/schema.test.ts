// T065 (spec 004; FR-001, FR-002, FR-005; R-01, R-09; data-model.md §2 to §8; contracts/room-data-files.md §2 to §12,
// §13.1, §14): the room's data files read strictly and held to their schemas. The readers take UTF-8 with no byte-order
// mark and LF ends, one YAML 1.2 document read with the core schema, so `off` is a string, and no alias, anchor, merge
// key, tag, or directive (RD1), and strict JSON for an outline. Each kind's zod strictObject refuses an unknown key
// (RD2), a missing key or a value outside its type (RD3), and a version other than 1 (RD4), and holds the constraints
// T076 and T077 give verbatim; a constraint another family's rule names carries that rule. RD5 keeps the data folders
// to their kinds. Every input is the known-good fixture set, changed one value at a time.
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { formatPath } from "../../build/room/checks/family";
import { loadRoom, namespaceIds, readFile, readJson, readYaml } from "../../build/room/load";
import type { DataKind } from "../../build/room/load";
import { fileTree } from "../../build/room/source";
import { goodFiles, overlay } from "../helpers/room-fixtures";

const good = goodFiles();
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const FILES: Record<DataKind, string> = {
  catalog: "apps/web/room/catalog/fx-desk.yaml",
  scene: "apps/web/room/scene.yaml",
  topics: "apps/web/room/topics.yaml",
  "ui-words": "apps/web/room/ui-words.yaml",
  look: "apps/web/room/looks/fx-cel.yaml",
  fixture: "apps/web/room/fixtures/fx-sample.yaml",
  lookdev: "apps/web/room/lookdev.yaml",
  "room-text": "apps/web/content/room/fx-script.yaml",
  outline: "apps/web/content/room/outlines/fx-sign-words.outline.json",
};
const KINDS = Object.keys(FILES) as DataKind[];

type Doc = Record<string, unknown>;
const text = (file: string): string => decoder.decode(good.get(file));
const docOf = (file: string): Doc => (file.endsWith(".json") ? JSON.parse(text(file)) : parse(text(file))) as Doc;

/** A known-good file with one change, written back as YAML or JSON. */
function variant(file: string, change: (doc: Doc) => void): Uint8Array {
  const doc = docOf(file);
  change(doc);
  return encoder.encode(file.endsWith(".json") ? JSON.stringify(doc) : stringify(doc));
}

/** The kind's file read whole: its value, or its problems as `<rule> <path>`. */
function judge(kind: DataKind, data: Uint8Array, file = FILES[kind]): { value: unknown; seen: string[] } {
  const read = readFile(kind, file, data);
  return { value: read.value, seen: read.problems.map((p) => `${p.rule} ${p.path}`) };
}

const at = (doc: Doc, ...keys: (string | number)[]): Doc => {
  let node: unknown = doc;
  for (const k of keys) node = (node as Record<string, unknown>)[String(k)];
  return node as Doc;
};

describe("the known-good set reads whole", () => {
  it.each(KINDS)("%s", (kind) => {
    const { value, seen } = judge(kind, good.get(FILES[kind]) as Uint8Array);
    expect(seen).toEqual([]);
    expect(value).not.toBeNull();
  });
});

describe("the readers (contracts/room-data-files.md §2)", () => {
  it("read YAML 1.2 with the core schema, so off, yes, and a date stay strings", () => {
    const read = readYaml(encoder.encode("a: off\nb: yes\nc: 2026-10-22\nd: 0x10\ne: 1.5\nf: null\n"));
    expect(read).toEqual({ ok: true, value: { a: "off", b: "yes", c: "2026-10-22", d: 16, e: 1.5, f: null } });
  });

  it.each([
    ["an alias", "a: &x 1\nb: *x\n"],
    ["an anchor no alias names", "a: &x 1\n"],
    ["a merge key", "a:\n  <<: { b: 1 }\n"],
    ["a tag", "a: !!str 1\n"],
    ["a local tag", "a: !fx 1\n"],
    ["a second document", "a: 1\n---\nb: 2\n"],
    ["a YAML directive", "%YAML 1.2\n---\na: 1\n"],
    ["a duplicate key", "a: 1\na: 2\n"],
    ["a collection as a key", "? [a, b]\n: 1\n"],
    ["a syntax error", "a: [1, 2\nb: 3\n"],
    ["a byte-order mark", "\uFEFFa: 1\n"],
    ["CR LF line ends", "a: 1\r\nb: 2\r\n"],
    ["a lone CR", "a: 1\rb: 2\n"],
  ])("refuse %s as RD1, for the whole file", (_, source) => {
    const read = readYaml(encoder.encode(source));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.problems.map((p) => `${p.rule} ${p.path}`)).toEqual(["RD1 -"]);
  });

  it("refuse bytes that aren't UTF-8 as RD1", () => {
    const read = readYaml(Uint8Array.from([0x61, 0x3a, 0x20, 0xff, 0x0a]));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.problems.map((p) => p.rule)).toEqual(["RD1"]);
  });

  it("refuse a key that isn't a string, and __proto__, as keys no schema defines (RD2)", () => {
    for (const source of ["a:\n  1: x\n", "a:\n  true: x\n", "a:\n  __proto__: { b: 1 }\n"]) {
      const read = readYaml(encoder.encode(source));
      expect(read.ok, source).toBe(false);
      if (!read.ok) expect(read.problems.map((p) => `${p.rule} ${p.path}`)).toEqual(["RD2 a"]);
    }
  });

  it("never print a YAML error's source text in a reason", () => {
    const read = readYaml(encoder.encode("fx-secret-key: [fx-secret-value\n"));
    expect(read.ok).toBe(false);
    if (!read.ok) for (const p of read.problems) expect(p.reason).not.toMatch(/fx-secret/);
  });

  it.each([
    ["a duplicate key", '{"a": 1, "a": 2}'],
    ["NaN", '{"a": NaN}'],
    ["Infinity", '{"a": Infinity}'],
    ["-Infinity", '{"a": -Infinity}'],
    ["a byte-order mark", '\uFEFF{"a": 1}'],
    ["a syntax error", '{"a": 1,}'],
    ["CR LF line ends", '{\r\n"a": 1\r\n}'],
  ])("refuse %s in JSON as RD1", (_, source) => {
    const read = readJson(encoder.encode(source));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.problems.map((p) => `${p.rule} ${p.path}`)).toEqual(["RD1 -"]);
  });
});

describe("each kind's strictObject (RD2, RD3, RD4)", () => {
  const cases: Record<DataKind, { missing: string[]; wrong: [(string | number)[], unknown] }> = {
    catalog: { missing: ["name"], wrong: [["size", "w"], "wide"] },
    scene: { missing: ["placements"], wrong: [["placements", 0, "frame"], "yes"] },
    topics: { missing: ["topics"], wrong: [["topics", 0, "phrase"], 7] },
    "ui-words": { missing: ["words"], wrong: [["words", "list.heading"], 3] },
    look: { missing: ["method"], wrong: [["shading", "steps"], "three"] },
    fixture: { missing: ["tier"], wrong: [["turns"], {}] },
    lookdev: { missing: ["close_up"], wrong: [["vignette", "show"], "fx-desk"] },
    "room-text": { missing: ["renderer"], wrong: [["lines", 0, "pending"], "no"] },
    outline: { missing: ["paths"], wrong: [["view_box"], "0 0 1 1"] },
  };

  it.each(KINDS)("%s: an unknown key, a missing key, and a value outside its type", (kind) => {
    const file = FILES[kind];
    const { missing, wrong } = cases[kind];
    const unknown = judge(
      kind,
      variant(file, (d) => (d.fx_extra = 1)),
    );
    expect(unknown.value).toBeNull();
    expect(unknown.seen).toEqual([kind === "outline" ? "RT13 fx_extra" : "RD2 fx_extra"]);
    const gone = judge(
      kind,
      variant(file, (d) => delete d[missing[0] as string]),
    );
    expect(gone.seen).toEqual([`RD3 ${missing[0]}`]);
    const [keys, value] = wrong;
    const typed = judge(
      kind,
      variant(file, (d) => (at(d, ...keys.slice(0, -1))[String(keys.at(-1))] = value)),
    );
    expect(typed.value).toBeNull();
    expect(typed.seen).toEqual([`RD3 ${formatPath(keys)}`]);
  });

  it("refuses an unknown key below the top level, by its path", () => {
    const { seen } = judge(
      "catalog",
      variant(FILES.catalog, (d) => (at(d, "origin").colour = "fx-wood")),
    );
    expect(seen).toEqual(["RD2 origin.colour"]);
  });

  it("refuses a UI word key outside the closed list and label.<name> (RD2)", () => {
    const { seen } = judge(
      "ui-words",
      variant(FILES["ui-words"], (d) => (at(d, "words")["fx-extra"] = "Fixture word")),
    );
    expect(seen).toEqual(["RD2 words.fx-extra"]);
  });

  it("refuses a version other than 1 as RD4, a missing one as RD3, and an outline's schema other than 1 as RD4", () => {
    expect(
      judge(
        "scene",
        variant(FILES.scene, (d) => (d.version = 2)),
      ).seen,
    ).toEqual(["RD4 version"]);
    expect(
      judge(
        "look",
        variant(FILES.look, (d) => (d.version = "1")),
      ).seen,
    ).toEqual(["RD4 version"]);
    expect(
      judge(
        "lookdev",
        variant(FILES.lookdev, (d) => delete d.version),
      ).seen,
    ).toEqual(["RD3 version"]);
    expect(
      judge(
        "outline",
        variant(FILES.outline, (d) => (d.schema = 2)),
      ).seen,
    ).toEqual(["RD4 schema"]);
  });

  it("reports every problem of a file, each by its path", () => {
    const { seen } = judge(
      "catalog",
      variant(FILES.catalog, (d) => {
        d.name = "";
        at(d, "size").w = -1;
        d.extra = true;
      }),
    );
    expect([...seen].sort()).toEqual(["RD2 extra", "RD3 name", "RD3 size.w"]);
  });

  it("never prints a data value in a reason", () => {
    const read = readFile(
      "scene",
      FILES.scene,
      variant(FILES.scene, (d) => {
        at(d, "placements", 0).id = "Fx Secret Placement";
        at(d, "selectables", 0).name = 12345;
        at(d, "live").source = "fx-secret-source";
      }),
    );
    expect(read.problems.length).toBeGreaterThan(0);
    for (const p of read.problems) expect(p.reason).not.toMatch(/fx-secret|Fx Secret|12345/i);
  });
});

/** One change and what it must give: null when it reads whole, else `<rule> <path>`. */
type Constraint = [label: string, kind: DataKind, change: (d: Doc) => void, expected: string | null, file?: string];

const MONITOR = "apps/web/room/catalog/fx-monitor.yaml";
const PLUG = "apps/web/room/catalog/fx-plug.yaml";
const BOARD = "apps/web/room/catalog/fx-board.yaml";
const NOTES = "apps/web/content/room/fx-notes.yaml";
const long = (n: number): string => "f" + "x".repeat(n - 1);
const points = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => [i / 1000, 0]);

const CONSTRAINTS: Constraint[] = [
  // The catalog (T076).
  ["an ID in the grammar", "scene", (d) => (at(d, "placements", 1).id = long(41)), null],
  ["an ID over 41 characters", "scene", (d) => (at(d, "placements", 1).id = long(42)), "RI1 placements[1].id"],
  ["an ID that starts with a digit", "scene", (d) => (at(d, "placements", 1).id = "9fx"), "RI1 placements[1].id"],
  ["an ID of one character", "scene", (d) => (at(d, "placements", 1).id = "f"), "RI1 placements[1].id"],
  ["a piece's ID in capitals", "catalog", (d) => (d.id = "Fx-Desk"), "RI1 id"],
  ["a name of 60 characters", "catalog", (d) => (d.name = "N".repeat(60)), null],
  ["a name of 61 characters", "catalog", (d) => (d.name = "N".repeat(61)), "RD3 name"],
  ["an empty name", "catalog", (d) => (d.name = ""), "RD3 name"],
  ["a size of 0", "catalog", (d) => (at(d, "size").w = 0), "RD3 size.w"],
  ["estimated that isn't a boolean", "catalog", (d) => (at(d, "size").estimated = "yes"), "RD3 size.estimated"],
  ["a stylized scale of 4", "catalog", (d) => (d.stylized_scale = 4), null],
  ["a stylized scale under 1", "catalog", (d) => (d.stylized_scale = 0.99), "RG3 stylized_scale"],
  ["a stylized scale over 4", "catalog", (d) => (d.stylized_scale = 4.01), "RG3 stylized_scale"],
  [
    "bounds with min at max",
    "catalog",
    (d) => (at(d, "origin", "bounds").min = [-0.6, 0.75, -0.3]),
    "RD3 origin.bounds",
  ],
  ["a turn of 360", "catalog", (d) => (at(d, "anchors", "top").turn = { y: -360 }), null],
  ["a turn over 360", "catalog", (d) => (at(d, "anchors", "top").turn = { y: 361 }), "RD3 anchors.top.turn.y"],
  [
    "an anchor's name outside the grammar",
    "catalog",
    (d) => (at(d, "anchors").top_2 = { at: [0, 0, 0] }),
    "RI1 anchors.top_2",
  ],
  [
    "a role outside the object-name rule",
    "catalog",
    (d) => (at(d, "live_faces", 0).role = "Screen"),
    "RI1 live_faces[0].role",
    MONITOR,
  ],
  [
    "a face size of 0",
    "catalog",
    (d) => (at(d, "live_faces", 0).size = [0, 0.36]),
    "RD3 live_faces[0].size[0]",
    MONITOR,
  ],
  [
    "a facing that isn't a unit vector",
    "catalog",
    (d) => (at(d, "live_faces", 0).facing = [0, 0, 2]),
    "RG2 live_faces[0].facing",
    MONITOR,
  ],
  [
    "an up that isn't a unit vector",
    "catalog",
    (d) => (at(d, "live_faces", 0).up = [0, 0.5, 0]),
    "RG2 live_faces[0].up",
    MONITOR,
  ],
  [
    "a facing along Y with no up",
    "catalog",
    (d) => Object.assign(at(d, "live_faces", 0), { facing: [0, 1, 0], up: undefined }),
    "RD3 live_faces[0].up",
    MONITOR,
  ],
  ["px of 16 and 2048", "catalog", (d) => (at(d, "live_faces", 0).px = [2048, 16]), null, MONITOR],
  ["px under 16", "catalog", (d) => (at(d, "live_faces", 0).px = [15, 360]), "RD3 live_faces[0].px[0]", MONITOR],
  ["px over 2048", "catalog", (d) => (at(d, "live_faces", 0).px = [560, 2049]), "RD3 live_faces[0].px[1]", MONITOR],
  [
    "px that isn't an integer",
    "catalog",
    (d) => (at(d, "live_faces", 0).px = [560.5, 360]),
    "RD3 live_faces[0].px[0]",
    MONITOR,
  ],
  [
    "a face with no readable",
    "catalog",
    (d) => delete at(d, "live_faces", 0).readable,
    "RD3 live_faces[0].readable",
    MONITOR,
  ],
  ["a glow's radius of 0", "catalog", (d) => (at(d, "glows", 0).radius = 0), "RD3 glows[0].radius", MONITOR],
  [
    "a glow's motion outside the list",
    "catalog",
    (d) => (at(d, "glows", 0).motion = "pulse"),
    "RD3 glows[0].motion",
    MONITOR,
  ],
  ["a glow's level under 0", "catalog", (d) => (at(d, "glows", 0).level = -0.1), "RD3 glows[0].level", MONITOR],
  ["claims on another signal", "catalog", (d) => (at(d, "claims").signal = "turn-cost"), "RD3 claims.signal", PLUG],
  [
    "a claim outside the tier's values",
    "catalog",
    (d) => (at(d, "claims", "poses")["fx-plugged"] = "remote"),
    "RD3 claims.poses.fx-plugged",
    PLUG,
  ],
  ["no stand-in", "catalog", (d) => (d.standin = []), "RD3 standin"],
  [
    "a stand-in shape outside the grammar",
    "catalog",
    (d) => (at(d, "standin", 0).shape = "cone"),
    "RD3 standin[0].shape",
  ],
  ["a stand-in's lit that isn't a boolean", "catalog", (d) => (at(d, "standin", 0).lit = "no"), "RD3 standin[0].lit"],
  [
    "a stand-in polygon of two points",
    "catalog",
    (d) =>
      (d.standin = [
        {
          shape: "polygon",
          points: [
            [0, 0],
            [0.1, 0],
          ],
          depth: 0.1,
          at: [0, 0.3, 0],
          color: "fx-wood",
        },
      ]),
    "RD3 standin[0].points",
  ],
  [
    "a polyline of 2 and of 256 points",
    "catalog",
    (d) =>
      (at(d, "drawing").primitives = [
        { primitive: "polyline", points: points(2) },
        { primitive: "polygon", points: points(256) },
      ]),
    null,
  ],
  [
    "a polyline of one point",
    "catalog",
    (d) => (at(d, "drawing").primitives = [{ primitive: "polyline", points: points(1) }]),
    "RV2 drawing.primitives[0].points",
  ],
  [
    "a polygon of 257 points",
    "catalog",
    (d) => (at(d, "drawing").primitives = [{ primitive: "polygon", points: points(257) }]),
    "RV2 drawing.primitives[0].points",
  ],
  [
    "path data outside §8's grammar",
    "catalog",
    (d) => (at(d, "drawing").primitives = [{ primitive: "path", d: "M 0 0 X 1 1" }]),
    "RV2 drawing.primitives[0].d",
  ],
  [
    "a negative stroke width",
    "catalog",
    (d) => (at(d, "drawing", "primitives", 0).stroke_width = -0.01),
    "RV3 drawing.primitives[0].stroke_width",
  ],
  ["a drawing of primitives and from", "catalog", (d) => (at(d, "drawing").from = "standin"), "RD3 drawing"],
  ["a budget of 0", "catalog", (d) => (at(d, "budget").gzip_bytes = 0), "RD3 budget.gzip_bytes"],
  ["a budget that isn't an integer", "catalog", (d) => (at(d, "budget").triangles = 1.5), "RD3 budget.triangles"],
  [
    "a texture side that isn't a power of two",
    "catalog",
    (d) => (at(d, "budget").texture_px = 1000),
    "RD3 budget.texture_px",
  ],
  ["a model file that isn't a GLB", "catalog", (d) => (d.model = { file: "fx-desk.png" }), "RD3 model.file"],
  ["a card that isn't an image", "catalog", (d) => (d.model = { card: "fx-desk.glb" }), "RD3 model.card"],
  [
    "a model with a file and a card",
    "catalog",
    (d) => (d.model = { file: "fx-desk.glb", card: "fx-desk.png" }),
    "RD3 model",
  ],
  ["a card of each image type", "catalog", (d) => (d.model = { card: "fx-desk.webp" }), null],
  ["shots that aren't a list", "catalog", (d) => (at(d, "work_order").shots = "one"), "RD3 work_order.shots"],
  // The scene (T076).
  ["a label without label.", "scene", (d) => (at(d, "placements", 1).label = "fx-desk"), "RD3 placements[1].label"],
  [
    "a role outside twin and visitor",
    "scene",
    (d) => (at(d, "placements", 7).role = "guest"),
    "RD3 placements[7].role",
  ],
  [
    "atmosphere without max_chars",
    "scene",
    (d) => (at(d, "placements", 2, "faces", "screen").atmosphere = true),
    "RD3 placements[2].faces.screen.max_chars",
  ],
  [
    "atmosphere with max_chars",
    "scene",
    (d) => Object.assign(at(d, "placements", 2, "faces", "screen"), { atmosphere: true, max_chars: 40 }),
    null,
  ],
  [
    "max_chars of 0",
    "scene",
    (d) => Object.assign(at(d, "placements", 2, "faces", "screen"), { atmosphere: true, max_chars: 0 }),
    "RD3 placements[2].faces.screen.max_chars",
  ],
  [
    "no region",
    "scene",
    (d) => (at(d, "placements", 2, "faces", "screen").regions = []),
    "RD3 placements[2].faces.screen.regions",
  ],
  [
    "a rect of no width",
    "scene",
    (d) => (at(d, "placements", 2, "faces", "screen", "regions", 0).rect = [0, 0, 0, 1]),
    "RD3 placements[2].faces.screen.regions[0].rect[2]",
  ],
  [
    "a rect outside 0 to 1",
    "scene",
    (d) => (at(d, "placements", 2, "faces", "screen", "regions", 0).rect = [1.2, 0, 0.5, 1]),
    "RD3 placements[2].faces.screen.regions[0].rect[0]",
  ],
  [
    "a region with no source",
    "scene",
    (d) => delete at(d, "placements", 2, "faces", "screen", "regions", 0).text,
    "RT1 placements[2].faces.screen.regions[0]",
  ],
  [
    "a region with two sources",
    "scene",
    (d) => (at(d, "placements", 2, "faces", "screen", "regions", 0).ui = ["sign.word"]),
    "RT1 placements[2].faces.screen.regions[0]",
  ],
  [
    "resume_titles off a chalk region",
    "scene",
    (d) =>
      Object.assign(at(d, "placements", 2, "faces", "screen", "regions", 0), { text: undefined, resume_titles: true }),
    "RT1 placements[2].faces.screen.regions[0]",
  ],
  [
    "resume_titles on a chalk region",
    "scene",
    (d) =>
      Object.assign(at(d, "placements", 5, "faces", "slate", "regions", 0), { text: undefined, resume_titles: true }),
    null,
  ],
  [
    "ui off a neon region",
    "scene",
    (d) =>
      Object.assign(at(d, "placements", 5, "faces", "slate", "regions", 0), { text: undefined, ui: ["sign.word"] }),
    "RT1 placements[5].faces.slate.regions[0]",
  ],
  [
    "a signal without a part",
    "scene",
    (d) => delete at(d, "placements", 3, "faces", "panel", "regions", 1).part,
    "RD3 placements[3].faces.panel.regions[1].part",
  ],
  [
    "a terminal's grid of rows alone",
    "scene",
    (d) => (at(d, "placements", 2, "faces", "screen", "regions", 0).grid = { rows: 3 }),
    "RD3 placements[2].faces.screen.regions[0].grid",
  ],
  [
    "a sign's region with a grid",
    "scene",
    (d) => (at(d, "placements", 6, "faces", "lettering", "regions", 0).grid = { rows: 1 }),
    "RD3 placements[6].faces.lettering.regions[0].grid",
  ],
  [
    "a grid of 0 columns",
    "scene",
    (d) => (at(d, "placements", 2, "faces", "screen", "regions", 0).grid = { cols: 0, rows: 3 }),
    "RD3 placements[2].faces.screen.regions[0].grid.cols",
  ],
  ["a switch on turn-cost", "scene", (d) => (at(d, "switches", 0).signal = "turn-cost"), "RS1 switches[0].signal"],
  ["a sag of 0.5", "scene", (d) => (at(d, "switches", 0, "cable").sag = 0.5), null],
  ["a sag over 0.5", "scene", (d) => (at(d, "switches", 0, "cable").sag = 0.6), "RS6 switches[0].cable.sag"],
  ["a cable's radius of 0", "scene", (d) => (at(d, "switches", 0, "cable").radius = 0), "RS6 switches[0].cable.radius"],
  ["a negative drop", "scene", (d) => (at(d, "switches", 0, "cable").drop = -0.01), "RS6 switches[0].cable.drop"],
  ["a selectable's name of 40 characters", "scene", (d) => (at(d, "selectables", 0).name = "N".repeat(40)), null],
  [
    "a selectable's name of 41 characters",
    "scene",
    (d) => (at(d, "selectables", 0).name = "N".repeat(41)),
    "RD3 selectables[0].name",
  ],
  ["a selectable with no member", "scene", (d) => (at(d, "selectables", 0).members = []), "RD3 selectables[0].members"],
  ["an action that is neither", "scene", (d) => (at(d, "selectables", 0).action = {}), "RD3 selectables[0].action"],
  [
    "an action that is both",
    "scene",
    (d) => (at(d, "selectables", 1).action = { resume: {}, talk: { topic: "fx-work" } }),
    "RD3 selectables[1].action",
  ],
  [
    "a lead of 120 characters",
    "scene",
    (d) => (at(d, "selectables", 0, "action", "talk").lead = "L".repeat(120)),
    null,
  ],
  [
    "a lead of 121 characters",
    "scene",
    (d) => (at(d, "selectables", 0, "action", "talk").lead = "L".repeat(121)),
    "RD3 selectables[0].action.talk.lead",
  ],
  [
    "a lead of two lines",
    "scene",
    (d) => (at(d, "selectables", 0, "action", "talk").lead = "One\ntwo"),
    "RD3 selectables[0].action.talk.lead",
  ],
  [
    "a retired date outside YYYY-MM-DD",
    "scene",
    (d) => (at(d, "retired", 0).retired = "2026-10-1"),
    "RD3 retired[0].retired",
  ],
  [
    "a retired kind outside the four",
    "scene",
    (d) => (at(d, "retired", 0).kinds = ["room"]),
    "RD3 retired[0].kinds[0]",
  ],
  ["a retired ID outside the grammar", "scene", (d) => (at(d, "retired", 0).id = "Old"), "RI1 retired[0].id"],
  ["a poll of 30 and 120", "scene", (d) => (d.live = { poll_s: 120, freshness_s: 125 }), null],
  ["a poll under 30", "scene", (d) => (at(d, "live").poll_s = 29), "RL1 live.poll_s"],
  ["a poll over 120", "scene", (d) => (d.live = { poll_s: 121, freshness_s: 200 }), "RL1 live.poll_s"],
  ["a poll that isn't an integer", "scene", (d) => (at(d, "live").poll_s = 30.5), "RL1 live.poll_s"],
  ["freshness under poll_s + 5", "scene", (d) => (at(d, "live").freshness_s = 34), "RL1 live.freshness_s"],
  ["a live source outside off and site", "scene", (d) => (at(d, "live").source = "on"), "RD3 live.source"],
  // Spec 008's walking block (T034; FR-056; plan.md §3.1): each figure in its range, the pitch's first at most its second.
  [
    "a walking block of the spec's defaults",
    "scene",
    (d) =>
      (d.walking = {
        speed_mps: 1,
        turn_dps: 90,
        tilt_dps: 45,
        radius_m: 0.12,
        reach_m: 0.8,
        reach_cone_deg: 60,
        camera: { yaw_deg: 60, pitch_deg: [0, 35], min_distance_m: 1.2, focus_height_m: 1.1 },
      }),
    null,
  ],
  [
    "a walking block at its least",
    "scene",
    (d) =>
      (d.walking = {
        speed_mps: 0.3,
        turn_dps: 30,
        tilt_dps: 15,
        radius_m: 0.05,
        reach_m: 0.2,
        reach_cone_deg: 15,
        camera: { yaw_deg: 0, pitch_deg: [0, 0], min_distance_m: 0.5, focus_height_m: 0.5 },
      }),
    null,
  ],
  [
    "a walking block at its most",
    "scene",
    (d) =>
      (d.walking = {
        speed_mps: 2,
        turn_dps: 180,
        tilt_dps: 90,
        radius_m: 0.4,
        reach_m: 1.5,
        reach_cone_deg: 90,
        camera: { yaw_deg: 75, pitch_deg: [60, 60], min_distance_m: 3, focus_height_m: 2 },
      }),
    null,
  ],
  ["a walking speed under 0.3", "scene", (d) => (d.walking = { speed_mps: 0.2 }), "RD3 walking.speed_mps"],
  ["a turn rate over 180", "scene", (d) => (d.walking = { turn_dps: 181 }), "RD3 walking.turn_dps"],
  ["a tilt rate under 15", "scene", (d) => (d.walking = { tilt_dps: 14 }), "RD3 walking.tilt_dps"],
  ["a radius over 0.4", "scene", (d) => (d.walking = { radius_m: 0.41 }), "RD3 walking.radius_m"],
  ["a reach under 0.2", "scene", (d) => (d.walking = { reach_m: 0.19 }), "RD3 walking.reach_m"],
  ["a reach cone over 90", "scene", (d) => (d.walking = { reach_cone_deg: 91 }), "RD3 walking.reach_cone_deg"],
  ["a camera yaw over 75", "scene", (d) => (d.walking = { camera: { yaw_deg: 76 } }), "RD3 walking.camera.yaw_deg"],
  [
    "a camera pitch over 60",
    "scene",
    (d) => (d.walking = { camera: { pitch_deg: [0, 61] } }),
    "RD3 walking.camera.pitch_deg[1]",
  ],
  [
    "a camera pitch whose first is over its second",
    "scene",
    (d) => (d.walking = { camera: { pitch_deg: [40, 30] } }),
    "RD3 walking.camera.pitch_deg",
  ],
  [
    "a minimum distance under 0.5",
    "scene",
    (d) => (d.walking = { camera: { min_distance_m: 0.4 } }),
    "RD3 walking.camera.min_distance_m",
  ],
  [
    "a focus height over 2",
    "scene",
    (d) => (d.walking = { camera: { focus_height_m: 2.1 } }),
    "RD3 walking.camera.focus_height_m",
  ],
  ["a walking key outside the block", "scene", (d) => (d.walking = { run: true }), "RD2 walking.run"],
  // Topics, room text, outlines, UI words, looks, fixtures, and lookdev.yaml (T077).
  ["a phrase of 60 characters", "topics", (d) => (at(d, "topics", 0).phrase = "p".repeat(60)), null],
  ["a phrase of 61 characters", "topics", (d) => (at(d, "topics", 0).phrase = "p".repeat(61)), "RD3 topics[0].phrase"],
  ["no words_from", "topics", (d) => (at(d, "topics", 0).words_from = []), "RD3 topics[0].words_from"],
  ["no corpus", "topics", (d) => (at(d, "topics", 0).corpus = []), "RD3 topics[0].corpus"],
  [
    "a corpus path in a folder",
    "topics",
    (d) => (at(d, "topics", 0).corpus = ["corpus/intake/90-fx.md"]),
    "RI9 topics[0].corpus[0]",
  ],
  [
    "a corpus path without its number",
    "topics",
    (d) => (at(d, "topics", 0).corpus = ["corpus/fx-work.md"]),
    "RI9 topics[0].corpus[0]",
  ],
  ["a renderer outside the three", "room-text", (d) => (d.renderer = "neon"), "RD3 renderer"],
  ["a terminal block without words_from", "room-text", (d) => delete d.words_from, "RD3 words_from"],
  ["a chalk block without words_from", "room-text", (d) => delete d.words_from, null, NOTES],
  ["a chalk block without exclude", "room-text", (d) => delete d.exclude, "RT7 exclude", NOTES],
  ["a block with no line", "room-text", (d) => (d.lines = []), "RD3 lines"],
  ["a line with a line break", "room-text", (d) => (at(d, "lines", 0).text = "fx\nrun"), "RD3 lines[0].text"],
  ["an intent_ref outside intent-NNN", "outline", (d) => (d.intent_ref = "intent-4"), "RD3 intent_ref"],
  ["a source type outside design and photo", "outline", (d) => (at(d, "source").type = "scan"), "RD3 source.type"],
  ["a source ID of two characters", "outline", (d) => (at(d, "source").id = "ab"), "RD3 source.id"],
  ["a cap height of the view box's height", "outline", (d) => (d.cap_height = 100), null],
  ["a cap height of 0", "outline", (d) => (d.cap_height = 0), "RT13 cap_height"],
  ["a cap height over the view box's height", "outline", (d) => (d.cap_height = 100.5), "RT13 cap_height"],
  ["an advance of 0", "outline", (d) => (d.advance = 0), "RD3 advance"],
  ["no path", "outline", (d) => (d.paths = []), "RD3 paths"],
  ["path data outside the grammar", "outline", (d) => (d.paths = ["M 0 0 L 1 1 url(#x)"]), "RT13 paths[0]"],
  ["a view box of no width", "outline", (d) => (d.view_box = [0, 0, 0, 100]), "RD3 view_box[2]"],
  [
    "a word about the Author without about_author: true",
    "ui-words",
    (d) => (at(d, "words")["list.heading"] = { text: "x", about_author: false, claims: [] }),
    "RD3 words.list.heading.about_author",
  ],
  ["a palette colour in capitals", "look", (d) => (at(d, "palette")["fx-ink"] = "#1D1D1F"), "RD3 palette.fx-ink"],
  ["shading of 2 and 5 steps", "look", (d) => (at(d, "shading").steps = 5), null],
  ["shading of 6 steps", "look", (d) => (at(d, "shading").steps = 6), "RD3 shading.steps"],
  ["shading of 1 step", "look", (d) => (at(d, "shading").steps = 1), "RD3 shading.steps"],
  ["a method outside the three", "look", (d) => (d.method = "toon"), "RD3 method"],
  ["a typeface use missing", "look", (d) => delete at(d, "typefaces").neon, "RD3 typefaces.neon"],
  [
    "a typeface use outside the five",
    "look",
    (d) => (at(d, "typefaces").title = { family: "IBM Plex Sans", weight: 400 }),
    "RD2 typefaces.title",
  ],
  ["a negative intensity", "look", (d) => (at(d, "lights", "ambient").intensity = -1), "RD3 lights.ambient.intensity"],
  ["a palette name outside the grammar", "look", (d) => (at(d, "palette").Ink = "#000000"), "RI1 palette"],
  // Spec 008's highlight (T005; FR-015, FR-057; plan.md §3.2): band_px 2 to 8, edge_px 1 to 4, colours by name or value.
  [
    "a highlight of Q5's figures, its edge the look's ink",
    "look",
    (d) => (d.highlight = { band: "#ffd23f", band_px: 3, edge: "fx-ink", edge_px: 1.5 }),
    null,
  ],
  ["a highlight of the least widths", "look", (d) => (d.highlight = { band_px: 2, edge_px: 1 }), null],
  ["a highlight of the greatest widths", "look", (d) => (d.highlight = { band_px: 8, edge_px: 4 }), null],
  ["a highlight band under 2 px", "look", (d) => (d.highlight = { band_px: 1.5 }), "RD3 highlight.band_px"],
  ["a highlight band over 8 px", "look", (d) => (d.highlight = { band_px: 8.5 }), "RD3 highlight.band_px"],
  ["a highlight edge under 1 px", "look", (d) => (d.highlight = { edge_px: 0.5 }), "RD3 highlight.edge_px"],
  ["a highlight edge over 4 px", "look", (d) => (d.highlight = { edge_px: 4.5 }), "RD3 highlight.edge_px"],
  ["a highlight key outside the four", "look", (d) => (d.highlight = { glow: "#ffffff" }), "RD2 highlight.glow"],
  ["a highlight colour that isn't a string", "look", (d) => (d.highlight = { band: 5 }), "RD3 highlight.band"],
  [
    "a refused status of 400 and 499",
    "fixture",
    (d) =>
      (d.turns = [
        { outcome: "refused", status: 400 },
        { outcome: "refused", status: 499 },
      ]),
    null,
  ],
  [
    "a refused status of 399",
    "fixture",
    (d) => (d.turns = [{ outcome: "refused", status: 399 }]),
    "RD3 turns[0].status",
  ],
  [
    "a refused status of 500",
    "fixture",
    (d) => (d.turns = [{ outcome: "refused", status: 500 }]),
    "RD3 turns[0].status",
  ],
  ["an outcome outside the five", "fixture", (d) => (d.turns = [{ outcome: "won" }]), "RD3 turns[0].outcome"],
  [
    "a route that isn't a string",
    "fixture",
    (d) => (d.turns = [{ outcome: "reply", route: 5, cost_micro_usd: 0 }]),
    "RD3 turns[0].route",
  ],
  ["a tier outside the eight", "fixture", (d) => (d.tier = "fast"), "RD3 tier"],
  ["a vignette of none", "lookdev", (d) => (at(d, "vignette").show = []), "RD3 vignette.show"],
  ["a close-up of none", "lookdev", (d) => (at(d, "close_up").frame = []), "RD3 close_up.frame"],
];

describe("the constraints T076 and T077 give, verbatim", () => {
  it.each(CONSTRAINTS)("%s", (_, kind, change, expected, file) => {
    const path = file ?? FILES[kind];
    const { seen } = judge(kind, variant(path, change), path);
    expect(seen).toEqual(expected === null ? [] : [expected]);
  });
});

describe("the defaults", () => {
  const value = (kind: DataKind, file = FILES[kind]): Doc =>
    readFile(kind, file, good.get(file) as Uint8Array).value as Doc;

  it("fills the catalog's", () => {
    const desk = value("catalog");
    expect(desk.stylized_scale).toBe(1);
    expect(at(desk, "anchors", "top").turn).toEqual({ x: 0, y: 0, z: 0 });
    expect(at(desk, "anchors", "top").estimated).toBe(false);
    expect(at(desk, "size").estimated).toBe(true);
    expect(at(desk, "standin", 0).lit).toBe(true);
    expect(at(desk, "standin", 0).turn).toEqual({ x: 0, y: 0, z: 0 });
    expect(desk.live_faces).toEqual([]);
    expect(desk.glows).toEqual([]);
    expect(at(desk, "drawing", "primitives", 1).fill).toBe("none");
    const monitor = value("catalog", MONITOR);
    expect(at(monitor, "glows", 0).level).toBe(1);
    expect(at(monitor, "standin", 1).lit).toBe(false);
    const board = value("catalog", BOARD);
    expect(board.anchors).toEqual({});
  });

  it("fills the scene's", () => {
    const scene = value("scene");
    expect(at(scene, "placements", 0).frame).toBe(false);
    expect(at(scene, "placements", 3, "mount")).toEqual({
      on: "fx-monitor",
      anchor: "top-edge",
      offset: [0, 0, 0],
      turn: { x: 0, y: 0, z: 0 },
      estimated: false,
    });
    expect(at(scene, "placements", 4, "mount").turn).toEqual({ x: 0, y: -10, z: 0 });
    expect(at(scene, "placements", 2, "faces", "screen").atmosphere).toBe(false);
    expect(at(scene, "retired", 0).kinds).toEqual(["piece", "placement"]);
    expect(at(scene, "switches", 0, "poses", "fx-cloud").glows).toEqual([]);
    const bare = readFile(
      "scene",
      FILES.scene,
      variant(FILES.scene, (d) => {
        delete d.live;
        delete at(d, "switches", 0, "cable").drop;
        delete at(d, "switches", 0, "cable").rest;
        at(d, "retired", 0).kinds = undefined;
        delete d.retired;
      }),
    ).value as Doc;
    expect(bare.live).toEqual({ source: "off", poll_s: 30, freshness_s: 35, turn: "off", asset_events: "off" });
    expect(at(bare, "switches", 0, "cable").drop).toBe(0);
    expect(bare.retired).toEqual([]);
    const kinds = readFile(
      "scene",
      FILES.scene,
      variant(FILES.scene, (d) => delete at(d, "retired", 0).kinds),
    ).value as Doc;
    expect(at(kinds, "retired", 0).kinds).toEqual(["piece", "placement", "selectable", "topic"]);
  });

  it("fills a look's highlight with Q5's band and widths, leaving its edge to the look's ink (spec 008, T005)", () => {
    // The fixture look gives no highlight: the compositor draws its edge in the look's ink, its outlines' colour.
    expect(value("look").highlight).toEqual({ band: "#ffd23f", band_px: 3, edge_px: 1.5 });
    const some = readFile(
      "look",
      FILES.look,
      variant(FILES.look, (d) => (d.highlight = { band_px: 4, edge: "#000000" })),
    ).value as Doc;
    expect(some.highlight).toEqual({ band: "#ffd23f", band_px: 4, edge: "#000000", edge_px: 1.5 });
  });

  it("fills the scene's walking block with the spec's defaults, each where it's left out (spec 008, T034)", () => {
    const defaults = {
      speed_mps: 1,
      turn_dps: 90,
      tilt_dps: 45,
      radius_m: 0.12,
      reach_m: 0.8,
      reach_cone_deg: 60,
      camera: { yaw_deg: 60, pitch_deg: [0, 35], min_distance_m: 1.2, focus_height_m: 1.1 },
    };
    expect(value("scene").walking).toEqual(defaults);
    const some = readFile(
      "scene",
      FILES.scene,
      variant(FILES.scene, (d) => (d.walking = { speed_mps: 1.4, camera: { yaw_deg: 30 } })),
    ).value as Doc;
    expect(some.walking).toEqual({ ...defaults, speed_mps: 1.4, camera: { ...defaults.camera, yaw_deg: 30 } });
  });

  it("fills room text's", () => {
    const notes = value("room-text", NOTES);
    expect(at(notes, "lines", 0)).toMatchObject({ about_author: false, pending: false });
    expect(at(notes, "lines", 2).pending).toBe(true);
  });
});

describe("RD5: the data folders hold only their kinds", () => {
  const problems = (changes: Record<string, string | Uint8Array | null>): string[] =>
    loadRoom(overlay(changes))
      .problems.filter((p) => p.rule === "RD5")
      .map((p) => `${p.file}:${p.path}`);
  const fixture = text("apps/web/room/fixtures/fx-sample.yaml");

  it("refuses another extension, a nested folder, a README but the room's, and a file of no kind", () => {
    expect(
      problems({
        "apps/web/room/fixtures/fx-other.yml": fixture,
        "apps/web/room/fixtures/extra/fx-more.yaml": fixture,
        "apps/web/room/looks/README.md": "# Looks\n",
        "apps/web/room/notes.yaml": "version: 1\n",
        "apps/web/content/room/fx-script.json": "{}",
        "apps/web/content/room/outlines/fx-sign-words.json": "{}",
        "apps/web/content/room/extra/fx-more.yaml": "version: 1\n",
      }),
    ).toEqual([
      "apps/web/content/room/extra:-",
      "apps/web/content/room/fx-script.json:-",
      "apps/web/content/room/outlines/fx-sign-words.json:-",
      "apps/web/room/fixtures/extra:-",
      "apps/web/room/fixtures/fx-other.yml:-",
      "apps/web/room/looks/README.md:-",
      "apps/web/room/notes.yaml:-",
    ]);
  });

  it("refuses a stem that differs from the ID or name its file holds", () => {
    expect(
      problems({
        "apps/web/room/fixtures/fx-sample.yaml": fixture.replace("id: fx-sample", "id: fx-other"),
        "apps/web/room/catalog/fx-shell.yaml": text("apps/web/room/catalog/fx-shell.yaml").replace(
          "id: fx-shell",
          "id: fx-hull",
        ),
        "apps/web/content/room/fx-notes.yaml": text(NOTES).replace("block: fx-notes", "block: fx-other"),
      }),
    ).toEqual([
      "apps/web/content/room/fx-notes.yaml:block",
      "apps/web/room/catalog/fx-shell.yaml:id",
      "apps/web/room/fixtures/fx-sample.yaml:id",
    ]);
  });

  it("refuses a file where a data folder belongs, the outlines folder of apps/web/content/room/ among them (core-3)", () => {
    const outline = "apps/web/content/room/outlines/fx-sign-words.outline.json";
    expect(
      problems({
        [outline]: null,
        "apps/web/content/room/outlines": text(outline),
        "apps/web/room/fixtures/fx-sample.yaml": null,
        "apps/web/room/fixtures": fixture,
      }),
    ).toEqual(["apps/web/content/room/outlines:-", "apps/web/room/fixtures:-"]);
  });

  it("refuses a link where a data folder belongs, which the tree never follows, so its files are never lost unsaid (core-3)", () => {
    const root = mkdtempSync(join(tmpdir(), "room-links-"));
    try {
      for (const [path, data] of good) {
        if (!/^apps\/web\/(content\/)?room\//.test(path)) continue;
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), data);
      }
      // Each folder moved out of the data's folders, and a link to it left in its place.
      mkdirSync(join(root, "elsewhere"));
      for (const [dir, moved] of [
        ["apps/web/room/fixtures", "elsewhere/fixtures"],
        ["apps/web/content/room/outlines", "elsewhere/outlines"],
      ] as const) {
        renameSync(join(root, dir), join(root, moved));
        symlinkSync(join(root, moved), join(root, dir));
      }
      const room = loadRoom(fileTree(root));
      expect(room.problems.map((p) => `${p.rule} ${p.file}:${p.path}`)).toEqual([
        "RD5 apps/web/content/room/outlines:-",
        "RD5 apps/web/room/fixtures:-",
      ]);
      expect([room.fixtures, room.outlines]).toEqual([[], []]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves apps/web/room/README.md apart, unread", () => {
    const tree = overlay({ "apps/web/room/README.md": "# The room's data\n" });
    const room = loadRoom(tree);
    expect(room.problems).toEqual([]);
    expect(tree.log).not.toContain("apps/web/room/README.md");
  });

  it("gives the four namespaces' IDs the data defines, for the source scan", () => {
    expect(namespaceIds(loadRoom(overlay({})))).toEqual({
      pieces: [
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
      ],
      placements: [
        "fx-shell",
        "fx-desk",
        "fx-monitor",
        "fx-neon",
        "fx-laptop",
        "fx-board",
        "fx-sign",
        "fx-twin",
        "fx-visitor",
      ],
      selectables: ["fx-workstation", "fx-board"],
      topics: ["fx-work"],
    });
  });

  it("leaves a file that fails RD out of the model, and lists it as failed", () => {
    const room = loadRoom(overlay({ "apps/web/room/catalog/fx-sign.yaml": "version: 2\n" }));
    expect(room.catalog.map((c) => c.file)).not.toContain("apps/web/room/catalog/fx-sign.yaml");
    expect(room.failed.has("apps/web/room/catalog/fx-sign.yaml")).toBe(true);
  });

  it("reports the scene and the UI words missing, and leaves the optional files out", () => {
    const room = loadRoom(
      overlay({
        "apps/web/room/scene.yaml": null,
        "apps/web/room/ui-words.yaml": null,
        "apps/web/room/topics.yaml": null,
        "apps/web/room/lookdev.yaml": null,
      }),
    );
    expect(room.problems.map((p) => `${p.rule} ${p.file}:${p.path}`)).toEqual([
      "RD3 apps/web/room/scene.yaml:-",
      "RD3 apps/web/room/ui-words.yaml:-",
    ]);
    expect([room.scene, room.ui, room.topics, room.lookdev]).toEqual([null, null, null, null]);
  });
});

describe("a finding's path (contracts/room-data-files.md §14)", () => {
  it("joins keys with dots and indices in brackets, and names the whole file -", () => {
    expect(formatPath(["placements", 3, "mount", "anchor"])).toBe("placements[3].mount.anchor");
    expect(formatPath(["faces", "fx-screen", "regions", 0])).toBe("faces.fx-screen.regions[0]");
    expect(formatPath(["words", "tier.not-live"])).toBe("words.tier.not-live");
    expect(formatPath([0, "id"])).toBe("[0].id");
    expect(formatPath([])).toBe("-");
  });

  it("leaves a key out that isn't printable, and everything below it", () => {
    expect(formatPath(["anchors", "Top Edge", "at"])).toBe("anchors");
    expect(formatPath(["anchors", "a\nb"])).toBe("anchors");
    expect(formatPath(["anchors", "fx-top", "at"], (key) => key !== "fx-top")).toBe("anchors");
    expect(formatPath(["Bad Key"])).toBe("-");
  });
});
