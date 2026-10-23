// T068 (spec 004; FR-010, SC-002's second half; R-12; contracts/room-bundle.md §11): two builds of the same commit and
// policy write byte-identical outputs. The known-good fixture set, with set models so the .gz copies are among the
// outputs, is written to two copies at different absolute paths and composed from the file system under two time
// zones; every output is compared byte for byte (the index, the 3D part, the drafts modules, room_text, the manifest,
// the models' .gz copies, the generated files, and the report), and none of them holds either copy's path.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { serialize } from "../../build/room/emit";
import { fileTree } from "../../build/room/source";
import { goodFiles } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";

const encoder = new TextEncoder();
const made: string[] = [];
afterAll(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The known-good set, three of its pieces' models set, and a resume, written under a new folder; its root. */
function copy(nested: string): string {
  const top = mkdtempSync(join(tmpdir(), "room-determinism-"));
  made.push(top);
  const root = join(top, nested);
  const resume = "sections:\n  - title: Fixture section\n    items:\n      - { id: fx-item-one, title: One }\n";
  const files = new Map<string, Uint8Array>([
    ...goodFiles(),
    ...Object.entries(modelChanges(["fx-board", "fx-desk", "fx-plug"])),
    ["apps/web/content/resume.yaml", encoder.encode(resume)],
  ]);
  for (const [path, data] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), data);
  }
  return root;
}

/** Every output of a compose, as the bytes it is written as, by name. */
function outputs(result: ComposeResult): Map<string, Uint8Array> {
  const text = (value: string): Uint8Array => encoder.encode(value);
  const out = new Map<string, Uint8Array>([
    ["digest", text(result.digest)],
    ["index", text(serialize(result.index))],
    ["scene", text(serialize(result.scene))],
    ["drafts", text(serialize(result.drafts))],
    ["room_text", text(serialize(result.roomText))],
    ["manifest", text(serialize(result.manifest))],
    ["report", text(result.report.markdown)],
    ["findings", text(serialize(result.findings))],
  ]);
  for (const m of result.models) {
    out.set(`model ${m.url}`, text(`${m.piece} ${m.sha256}`));
    out.set(`model ${m.url}.gz`, m.gz);
  }
  for (const c of result.cards) {
    out.set(`card ${c.url}`, text(`${c.piece} ${c.sha256}`));
    out.set(`card ${c.url} bytes`, c.bytes);
  }
  for (const g of result.generated) out.set(`generated ${g.path}`, text(g.text));
  return out;
}

/** compose() in a time zone, from the file system under `root`, and that zone's offset on a date. */
function composeIn(zone: string, root: string): { result: ComposeResult; offset: number } {
  vi.stubEnv("TZ", zone);
  try {
    const result = compose(fileTree(root), capsPolicy(), { mode: "lenient", drafts: true });
    return { result, offset: new Date(Date.UTC(2026, 9, 23)).getTimezoneOffset() };
  } finally {
    vi.unstubAllEnvs();
  }
}

describe("determinism (contracts/room-bundle.md §11)", () => {
  let rootA = "";
  let rootB = "";
  let a: { result: ComposeResult; offset: number };
  let b: { result: ComposeResult; offset: number };
  beforeAll(() => {
    rootA = copy("a");
    rootB = copy(join("b", "a deeper copy"));
    a = composeIn("UTC", rootA);
    b = composeIn("Pacific/Chatham", rootB);
  });

  it("composes under two time zones, from two copies at different absolute paths", () => {
    expect(rootA).not.toBe(rootB);
    expect(a.offset).not.toBe(b.offset);
    expect(a.result.findings).toEqual([]);
    expect(a.result.models).toHaveLength(3);
    expect(a.result.drafts).not.toBeNull();
    expect(a.result.generated.length).toBeGreaterThan(3);
  });

  it("writes every output byte for byte the same", () => {
    const [x, y] = [outputs(a.result), outputs(b.result)];
    expect([...x.keys()]).toEqual([...y.keys()]);
    for (const [name, data] of x) {
      expect(Buffer.compare(Buffer.from(data), Buffer.from(y.get(name) ?? new Uint8Array())), name).toBe(0);
    }
  });

  it("holds neither copy's path, nor the temporary folder's, in any output", () => {
    for (const result of [a.result, b.result]) {
      for (const [name, data] of outputs(result)) {
        for (const root of [rootA, rootB, tmpdir()]) {
          expect(Buffer.from(data).indexOf(Buffer.from(root)), `${name} holds ${root}`).toBe(-1);
        }
      }
    }
  });
});
