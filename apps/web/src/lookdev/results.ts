// The lookdev page's results (spec 004; FR-067, FR-068, SC-005, SC-006, SC-010; research.md R-41; contracts/lookdev.md
// §6, data-model.md §11.6): at a run's end, its readouts and the page's settings as one JSON block, which the Author
// puts in the merge-request note, and as text. The block is built field by field, in §6's order, so it holds exactly
// §6's fields and nothing else: no file name (a candidate is keyed by its piece), path, user agent or other device
// identifier beyond the viewport and the pixel ratio, time of day, or free text. Milliseconds and frame rates are given
// to 0.1 and the share to 0.001, each rounded the way that never reads better than the run was: a time and the share
// up, a frame rate and a cap height down, so a figure at a limit of SC-005's or FR-052's floor never hides a miss. A
// stopped run gives no readouts (metrics.ts), so no results. The page shows the text, and the block in a read-only
// text area (T135).
import { count, fixed } from "../room/glb/rules";
import type { MarkClass } from "../room/glb/rules";
import { markReadout } from "./candidate";
import type { Candidate } from "./candidate";
import type { RunReadouts, RunSeconds } from "./metrics";

/** The phone copy's probe (§7.2), which its first panel runs; the site's page has none. */
export interface Probe {
  readonly webgl2: boolean;
  readonly max_texture_size: number;
  /** `navigator.deviceMemory`, where the browser gives it. */
  readonly device_memory: number | null;
  readonly create_image_bitmap: boolean;
  /** Recorded only: nothing in the copy depends on it. */
  readonly secure_context: boolean;
  /** In CSS pixels. */
  readonly viewport: readonly [number, number];
  readonly dpr: number;
}

export type SceneChoice = "room" | "vignette";
export type ViewChoice = "desktop" | "phone" | "close-up";
/** Automatic, the real controller; or a level pinned for a measurement. */
export type QualityChoice = "auto" | 0 | 1 | 2 | 3;

/** What the page knows of a run beside its readouts. */
export interface RunSetup {
  /** The digest both parts of the bundle carry. */
  readonly bundle: string;
  readonly probe: Probe | null;
  readonly scene: SceneChoice;
  readonly view: ViewChoice;
  /** The stage drawn, in CSS pixels. */
  readonly stage: readonly [number, number];
  /** The pixel ratio drawn at. */
  readonly dpr: number;
  /** The look's ID, and the fixture's. */
  readonly look: string;
  readonly sample: string;
  readonly quality: QualityChoice;
  /** Whether the run began with the scripted load. */
  readonly scriptedLoad: boolean;
  /** The smallest cap height on the view and its face, `<placement>.<role>`; null while no face on it has words. */
  readonly smallestCap: { readonly face: string; readonly px: number } | null;
  /** The candidates the page holds, one per piece. */
  readonly candidates: readonly Candidate[];
}

/** One candidate in the results, keyed by its piece. */
export interface ResultCandidate {
  readonly piece: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly gzip_bytes: number;
  /** False for "not scrubbed". */
  readonly scrubbed: boolean;
  /** The mark's class; null when not scrubbed, or when RX5 refuses the mark. */
  readonly mark: MarkClass | null;
  /** `<rule> candidate:<path>: <reason>`. */
  readonly findings: readonly string[];
}

/** §6's results, exactly. */
export interface Results {
  readonly schema: 1;
  readonly build: "drafts";
  readonly bundle: string;
  readonly probe: Probe | null;
  readonly scene: SceneChoice;
  readonly view: ViewChoice;
  readonly stage_css: readonly [number, number];
  readonly dpr: number;
  readonly look: string;
  readonly sample: string;
  readonly quality: {
    readonly mode: QualityChoice;
    readonly settled: number;
    readonly step_downs: number;
    readonly step_downs_while_loading: number;
  };
  readonly duration_s: RunSeconds;
  readonly scripted_load: boolean;
  readonly frames: {
    readonly count: number;
    readonly p50_ms: number;
    readonly p95_ms: number;
    readonly median_fps: number;
    readonly over_33ms_share: number;
  };
  readonly draw_calls: number;
  readonly triangles: number;
  readonly texture_bytes: number;
  readonly smallest_cap_css: { readonly face: string; readonly px: number } | null;
  readonly candidates: readonly ResultCandidate[];
}

/** Room for floating point at a step's edge. */
const EPS = 1e-9;
/** Up to a step of 1 ÷ `per`: a time or a share never reads under what it was. */
const up = (value: number, per: number): number => Math.ceil(value * per - EPS) / per;
/** Down to a step of 1 ÷ `per`: a frame rate or a cap height never reads over what it was. */
const down = (value: number, per: number): number => Math.floor(value * per + EPS) / per;
/** To the nearest step of 1 ÷ `per`: a size as measured. */
const nearest = (value: number, per: number): number => Math.round(value * per) / per;

const probeOf = (p: Probe): Probe => ({
  webgl2: p.webgl2,
  max_texture_size: p.max_texture_size,
  device_memory: p.device_memory,
  create_image_bitmap: p.create_image_bitmap,
  secure_context: p.secure_context,
  viewport: [p.viewport[0], p.viewport[1]],
  dpr: p.dpr,
});

const candidateOf = (c: Candidate): ResultCandidate => ({
  piece: c.piece,
  sha256: c.sha256,
  bytes: c.bytes,
  gzip_bytes: c.gzipBytes,
  scrubbed: c.scrubbed,
  mark: c.mark,
  findings: [...c.findings],
});

/** A finished run's results, from its setup and its readouts. */
export function results(setup: RunSetup, run: RunReadouts): Results {
  const f = run.frames;
  return {
    schema: 1,
    build: "drafts",
    bundle: setup.bundle,
    probe: setup.probe === null ? null : probeOf(setup.probe),
    scene: setup.scene,
    view: setup.view,
    stage_css: [nearest(setup.stage[0], 10), nearest(setup.stage[1], 10)],
    dpr: nearest(setup.dpr, 1e4),
    look: setup.look,
    sample: setup.sample,
    quality: {
      mode: setup.quality,
      settled: run.settled,
      step_downs: run.stepDowns,
      step_downs_while_loading: run.stepDownsWhileLoading,
    },
    duration_s: run.seconds,
    scripted_load: setup.scriptedLoad,
    frames: {
      count: f.count,
      p50_ms: up(f.p50Ms, 10),
      p95_ms: up(f.p95Ms, 10),
      median_fps: down(f.medianFps, 10),
      over_33ms_share: up(f.over33Share, 1000),
    },
    draw_calls: run.drawCalls,
    triangles: run.triangles,
    texture_bytes: run.textureBytes,
    smallest_cap_css:
      setup.smallestCap === null ? null : { face: setup.smallestCap.face, px: down(setup.smallestCap.px, 10) },
    candidates: [...setup.candidates]
      .sort((a, b) => (a.piece < b.piece ? -1 : a.piece > b.piece ? 1 : 0))
      .map(candidateOf),
  };
}

/** The results as the one JSON block the page shows in a read-only text area. */
export function resultsJson(r: Results): string {
  return `${JSON.stringify(r, null, 2)}\n`;
}

const yes = (value: boolean): string => (value ? "yes" : "no");
const size = (s: readonly [number, number]): string => `${count(s[0])} × ${count(s[1])}`;

/** The results as text, a line for each readout, and each candidate's findings beneath it. */
export function resultsText(r: Results): string[] {
  const p = r.probe;
  const q = r.quality;
  const f = r.frames;
  const plural = (n: number, word: string): string => `${count(n)} ${word}${n === 1 ? "" : "s"}`;
  const lines = [
    `Lookdev results: bundle ${r.bundle}, ${r.build} build`,
    p === null
      ? "Probe: none, on the site's page"
      : `Probe: WebGL 2 ${yes(p.webgl2)}; largest texture ${count(p.max_texture_size)} px; device memory ` +
        `${p.device_memory === null ? "not given" : `${p.device_memory} GB`}; createImageBitmap ` +
        `${yes(p.create_image_bitmap)}; secure context ${yes(p.secure_context)}; viewport ${size(p.viewport)} ` +
        `CSS px at a pixel ratio of ${p.dpr}`,
    `Scene ${r.scene}, view ${r.view}${r.view === "close-up" ? ", which judges nothing" : ""}: a stage of ` +
      `${size(r.stage_css)} CSS px at a pixel ratio of ${r.dpr}`,
    `Look ${r.look}, sample state ${r.sample}`,
    `Quality ${q.mode === "auto" ? "automatic" : `pinned at ${q.mode}`}: settled at ${q.settled}, after ` +
      `${plural(q.step_downs, "step-down")}, ${q.step_downs_while_loading} while a hold was held or a piece loaded`,
    `${r.duration_s / 60} minutes, ${r.scripted_load ? "with" : "without"} the scripted load`,
    `Frames: ${count(f.count)}; p50 ${fixed(f.p50_ms, 1)} ms, p95 ${fixed(f.p95_ms, 1)} ms; a median of ` +
      `${fixed(f.median_fps, 1)} frames a second; ${fixed(f.over_33ms_share * 100, 1)}% over 33 ms`,
    `Largest over the run: ${count(r.draw_calls)} draw calls, ${count(r.triangles)} triangles, ` +
      `${count(r.texture_bytes)} bytes of texture memory`,
    r.smallest_cap_css === null
      ? "Smallest cap height: none, as no face on the view has words"
      : `Smallest cap height: ${fixed(r.smallest_cap_css.px, 1)} CSS px, on ${r.smallest_cap_css.face}`,
  ];
  for (const c of r.candidates) {
    lines.push(
      `Candidate for ${c.piece}: SHA-256 ${c.sha256}; ${count(c.bytes)} bytes, ${count(c.gzip_bytes)} gzip-9 bytes; ` +
        `mark ${markReadout(c)}; ${c.findings.length === 0 ? "no finding" : plural(c.findings.length, "finding")}`,
      ...c.findings.map((finding) => `  ${finding}`),
    );
  }
  return lines;
}
