// T123 (spec 004; FR-067, SC-005, SC-006, SC-010; research.md R-41; contracts/lookdev.md §6, data-model.md §11.6): the
// results a run gives at its end, as one JSON block and as text. The block holds exactly §6's fields, in its order,
// each of its type: schema 1, build drafts, the bundle's digest, the probe or null, the scene, the view, the stage and
// pixel ratio drawn, the look and the sample state, the quality's mode and counts, 120 or 600 seconds, whether the
// scripted load ran, the frames with milliseconds and frame rates to 0.1 and the share to 0.001, each rounded so it
// never reads better than it was, the largest draw calls, triangles, and texture memory, the smallest cap height, and
// one entry per candidate; and nothing else: no file name, path, user agent, time of day, or free text. A run stopped
// early gives no results. The bundle, the look, the sample state, the faces, and the fit inputs are compose()'s, over
// the known-good fixture set.
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import { readCandidate } from "../../src/lookdev/candidate";
import type { Candidate } from "../../src/lookdev/candidate";
import { startRun } from "../../src/lookdev/metrics";
import type { RunReadouts } from "../../src/lookdev/metrics";
import { results, resultsJson, resultsText } from "../../src/lookdev/results";
import type { Probe, Results, RunSetup } from "../../src/lookdev/results";
import { desk } from "../helpers/glb";
import { goodTree } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";
import { FakeClock } from "../helpers/room";

/** The name the picker would reveal, and the folder it came from: neither may appear in the results. */
const PICKED_NAME = "PXL_20261023_fx-picked-name.glb";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 14; fx-phone-model) Chrome/141.0 Mobile";

const PROBE: Probe = {
  webgl2: true,
  max_texture_size: 4096,
  device_memory: 4,
  create_image_bitmap: true,
  secure_context: false,
  viewport: [384, 740],
  dpr: 2.8125,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const composed = compose(goodTree(), capsPolicy(), { mode: "strict", drafts: true });

/** Two candidates read from picked files: a clean sign, and an unmarked desk off its piece's bounds. */
async function candidates(): Promise<Candidate[]> {
  const pieces = composed.drafts?.lookdev.pieces ?? {};
  const read = (piece: string, data: Uint8Array): Promise<Candidate> => {
    const fit = pieces[piece];
    if (!fit) throw new Error(`no fit inputs for ${piece}`);
    return readCandidate(piece, new File([data.slice()], PICKED_NAME, { lastModified: 1_761_200_000_000 }), fit);
  };
  const sign = modelChanges(["fx-sign"])["assets/room/fx-sign.glb"] as Uint8Array;
  return [await read("fx-sign", sign), await read("fx-desk", desk({ mark: false }).bytes)];
}

/** The setup of a run on the phone's copy, with the fixtures' look, sample state, and first face. */
async function setup(change: Partial<RunSetup> = {}): Promise<RunSetup> {
  return {
    bundle: composed.digest,
    probe: PROBE,
    scene: "room",
    view: "phone",
    stage: [368, 419.6],
    dpr: 2.8125,
    look: composed.drafts?.lookdev.looks[0]?.id ?? "",
    sample: composed.drafts?.fixtures[0]?.id ?? "",
    quality: "auto",
    scriptedLoad: true,
    smallestCap: { face: composed.index.faces[0]?.id ?? "", px: 9.46 },
    candidates: await candidates(),
    ...change,
  };
}

/** Readouts as a run gives them, with frame figures to be rounded. */
const READOUTS: RunReadouts = {
  seconds: 120,
  frames: { count: 7199, p50Ms: 16.66, p95Ms: 33.04, medianFps: 59.96, over33Share: 0.0501 },
  settled: 1,
  stepDowns: 1,
  stepDownsWhileLoading: 0,
  drawCalls: 180,
  triangles: 41_000,
  textureBytes: 96_000_000,
};

/** Every string in a value, at any depth. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

describe("the results block (contracts/lookdev.md §6)", () => {
  it("holds exactly §6's fields, in its order, each of its type", async () => {
    const r = results(await setup(), READOUTS);
    expect(Object.keys(r)).toEqual([
      "schema",
      "build",
      "bundle",
      "probe",
      "scene",
      "view",
      "stage_css",
      "dpr",
      "look",
      "sample",
      "quality",
      "duration_s",
      "scripted_load",
      "frames",
      "draw_calls",
      "triangles",
      "texture_bytes",
      "smallest_cap_css",
      "candidates",
    ]);
    expect([r.schema, r.build, r.bundle, r.scene, r.view, r.look, r.sample]).toEqual([
      1,
      "drafts",
      composed.digest,
      "room",
      "phone",
      "fx-cel",
      "fx-sample",
    ]);
    expect(r.probe).toEqual(PROBE);
    expect(Object.keys(r.probe ?? {})).toEqual([
      "webgl2",
      "max_texture_size",
      "device_memory",
      "create_image_bitmap",
      "secure_context",
      "viewport",
      "dpr",
    ]);
    expect([r.stage_css, r.dpr]).toEqual([[368, 419.6], 2.8125]);
    expect(r.quality).toEqual({ mode: "auto", settled: 1, step_downs: 1, step_downs_while_loading: 0 });
    expect(Object.keys(r.quality)).toEqual(["mode", "settled", "step_downs", "step_downs_while_loading"]);
    expect([r.duration_s, r.scripted_load]).toEqual([120, true]);
    expect(Object.keys(r.frames)).toEqual(["count", "p50_ms", "p95_ms", "median_fps", "over_33ms_share"]);
    expect([r.draw_calls, r.triangles, r.texture_bytes]).toEqual([180, 41_000, 96_000_000]);
    expect(r.smallest_cap_css).toEqual({ face: composed.index.faces[0]?.id, px: 9.4 });
    expect(r.candidates.map((c) => Object.keys(c))).toEqual(
      r.candidates.map(() => ["piece", "sha256", "bytes", "gzip_bytes", "scrubbed", "mark", "findings"]),
    );
  });

  it("keys each candidate by its piece, in order: its SHA-256, bytes, gzip-9 bytes, mark or null, and findings", async () => {
    const s = await setup();
    const r = results(s, READOUTS);
    const [sign, unmarked] = s.candidates;
    expect(r.candidates).toEqual([
      {
        piece: "fx-desk",
        sha256: unmarked?.sha256,
        bytes: unmarked?.bytes,
        gzip_bytes: unmarked?.gzipBytes,
        scrubbed: false,
        mark: null,
        findings: unmarked?.findings,
      },
      {
        piece: "fx-sign",
        sha256: sign?.sha256,
        bytes: sign?.bytes,
        gzip_bytes: sign?.gzipBytes,
        scrubbed: true,
        mark: "model",
        findings: [],
      },
    ]);
    expect(r.candidates[0]?.findings).toContain("RX5 candidate:extensions: not scrubbed");
    for (const c of r.candidates) expect(c.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives milliseconds and frame rates to 0.1 and the share to 0.001, none rounded to read better than it was", async () => {
    const r = results(await setup(), READOUTS);
    // Times and the share up, the frame rate and the cap height down.
    expect(r.frames).toEqual({ count: 7199, p50_ms: 16.7, p95_ms: 33.1, median_fps: 59.9, over_33ms_share: 0.051 });
    expect(r.smallest_cap_css?.px).toBe(9.4);
    const exact = results(await setup({ smallestCap: { face: "fx-board.slate", px: 9 } }), {
      ...READOUTS,
      frames: { count: 3, p50Ms: 16.7, p95Ms: 33.3, medianFps: 60, over33Share: 0.05 },
    });
    expect(exact.frames).toEqual({ count: 3, p50_ms: 16.7, p95_ms: 33.3, median_fps: 60, over_33ms_share: 0.05 });
    expect(exact.smallest_cap_css?.px).toBe(9);
    expect(results(await setup({ stage: [686.44, 640] }), READOUTS).stage_css).toEqual([686.4, 640]);
  });

  it("takes the quality's mode as auto or the pinned level, and the probe as null on the site's page", async () => {
    const pinned = results(await setup({ quality: 2, probe: null, view: "desktop", scene: "vignette" }), {
      ...READOUTS,
      seconds: 600,
      settled: 2,
      stepDowns: 0,
    });
    expect(pinned.quality).toEqual({ mode: 2, settled: 2, step_downs: 0, step_downs_while_loading: 0 });
    expect([pinned.probe, pinned.view, pinned.scene, pinned.duration_s]).toEqual([null, "desktop", "vignette", 600]);
    const closeUp = results(await setup({ view: "close-up", smallestCap: null }), READOUTS);
    expect([closeUp.view, closeUp.smallest_cap_css]).toEqual(["close-up", null]);
  });

  it("holds no file name, path, user agent, time of day, or free text", async () => {
    vi.stubGlobal("navigator", { userAgent: USER_AGENT });
    const dateNow = vi.spyOn(Date, "now");
    const clock = new FakeClock();
    clock.advance(43_210_987);
    const s = await setup();
    const got: Results[] = [];
    startRun({
      clock,
      seconds: 120,
      level: 0,
      sample: () => ({ drawCalls: 50, triangles: 9_000, textureBytes: 4_000_000 }),
      busy: () => false,
      onEnd: (readouts) => got.push(results(s, readouts)),
    });
    clock.advance(120_000, 16);
    expect(got).toHaveLength(1);
    const r = got[0] as Results;
    const json = resultsJson(r);
    const text = resultsText(r).join("\n");
    for (const shown of [json, text]) {
      for (const part of [
        PICKED_NAME,
        "PXL_",
        "fx-picked-name",
        "assets/room",
        "apps/web",
        "Mozilla",
        "fx-phone-model",
      ])
        expect(shown, part).not.toContain(part);
      expect(shown).not.toMatch(/\d{4}-\d{2}-\d{2}T|\d{2}:\d{2}:\d{2}|1761200000000|43210987|43330987/);
    }
    expect(dateNow).not.toHaveBeenCalled();
    // Every string is a digest, an ID or a word of §6's lists, or a finding in §4's form: nothing typed or free.
    for (const value of strings(r)) {
      expect(value).toMatch(/^(?:[0-9a-f]{16,64}|[a-z0-9]+(?:[.-][a-z0-9]+)*|R[XK]\d+ candidate:\S+: .+)$/);
    }
  });

  it("is one JSON block that reads back as the results, and text giving each readout", async () => {
    const r = results(await setup(), READOUTS);
    const json = resultsJson(r);
    expect(JSON.parse(json)).toEqual(r);
    expect(json.trimStart().startsWith("{")).toBe(true);
    const text = resultsText(r);
    for (const part of [
      "p50 16.7 ms",
      "p95 33.1 ms",
      "59.9 frames a second",
      "5.1% over 33 ms",
      "180 draw calls",
      "41,000 triangles",
      "96,000,000 bytes of texture memory",
      "settled at 1",
      "9.4 CSS px",
      "not scrubbed",
      "RX5 candidate:extensions: not scrubbed",
    ])
      expect(text.join("\n"), part).toContain(part);
  });
});

describe("a run stopped early", () => {
  it("gives no results", async () => {
    const s = await setup();
    const clock = new FakeClock();
    const got: Results[] = [];
    const run = startRun({
      clock,
      seconds: 600,
      level: 0,
      sample: () => ({ drawCalls: 1, triangles: 1, textureBytes: 1 }),
      busy: () => false,
      onEnd: (readouts) => got.push(results(s, readouts)),
    });
    clock.advance(599_000, 16);
    run.stop();
    clock.advance(600_000, 16);
    expect(got).toEqual([]);
  });
});
