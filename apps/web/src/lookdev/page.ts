// The lookdev page (spec 004; FR-023, FR-066 to FR-070, User Story 3 scenarios 1 and 2; research.md R-41;
// contracts/lookdev.md §1 to §6, §9), drafts builds only. createLookdev builds the whole page inside its root, from the
// inputs, renderer, clock, and capability it's given; main.ts's startLookdev gives it the drafts build's own, and the
// tests their stand-ins. The page holds:
// - one canvas (stage.ts), the production runtime at the production framing;
// - the controls of §3: the view, the scene, the look, the sample state, quality, pause, "Load every piece", and
//   "Run 2 minutes" and "Run 10 minutes" (each starting with the scripted load), which turn the other settings off
//   while they measure, so the results describe one setting throughout;
// - the sample state's panel: the tier sentence of the fixture's tier (the text copy's words, User Story 2) and its
//   turns, every figure badged with the UI word `sign.sample` (FR-049);
// - the readouts of §5, live, labelled "close-up" on the desk close-up, which judges nothing;
// - one "Load a candidate…" picker per piece but the figures', each candidate read into memory alone (candidate.ts),
//   its SHA-256, sizes, measures, mark, and findings shown under its piece, swapped in through the room's loader when
//   RX1 and RX2 pass and it names no uri, and "Clear";
// - the results of a run that ends, as text and one JSON block in a read-only text area (results.ts), and none for a
//   run stopped early, by "Stop the run" or by the page being hidden, which draws no frames while the run's timer runs
//   on (a screen that times out, another app or tab in front), which it says;
// - the page's log: the loader's asset events, a pick's object_selected, and the page's own notes.
// Nothing here makes a request but a set model's from the site's own a/ on the site's page, stores anything, or shows a
// picked file's name (§4, §9).
import type { WebGLRenderer } from "three";

import type { RoomFixture } from "../../build/room/emit";
import type { Clock } from "../room/clock";
import { h } from "../room/dom";
import { count } from "../room/glb/rules";
import { MODEL_FLOOR } from "../room/quality";
import type { Capability } from "../room/quality";
import { SCENE_TEXTURE_BYTES } from "../room/scene/ledger";
import { candidatePieces, loadable, markReadout, readCandidate } from "./candidate";
import type { Candidate } from "./candidate";
import { actionButton, filePicker, radioGroup, selectControl, toggleButton } from "./controls";
import type { Control } from "./controls";
import { RUN_SECONDS, startRun } from "./metrics";
import type { Run, RunReadouts, RunSeconds } from "./metrics";
import { results, resultsJson, resultsText } from "./results";
import type { Probe, QualityChoice, SceneChoice, ViewChoice } from "./results";
import { createStage } from "./stage";
import type { LogEntry, LookdevInputs, LookdevStage } from "./stage";

export type { LookdevInputs } from "./stage";

export interface LookdevOptions {
  /** The phone copy: the stage of the device that opened it, and every model from memory (contracts/lookdev.md §3,
   *  §7). */
  readonly phone: boolean;
  /** The phone copy's probe (§7.2); null on the site's page. */
  readonly probe: Probe | null;
}

export interface LookdevDeps {
  readonly win: Window;
  readonly clock: Clock;
  readonly inputs: LookdevInputs;
  /** Makes the page's one renderer on its canvas. */
  readonly renderer: (canvas: HTMLCanvasElement) => WebGLRenderer;
  /** What the device offers models: ADR 0010's floor reads it. */
  readonly capability: () => Capability;
}

export interface LookdevPage {
  readonly stage: LookdevStage;
  dispose(): void;
}

/** How often the live readouts are redrawn, in milliseconds. */
const READOUT_MS = 1000;
/** What a run stopped early says: it gives no results (contracts/lookdev.md §6). */
const STOPPED = "The run was stopped early, so it gives no results.";
/** And one the page lost sight of, whose frames stopped (the review's page-3). */
const HIDDEN =
  "The run stopped early because the page was hidden, so it gives no results: a hidden page draws no frames. " +
  "Keep the screen on and this page in front for the whole run, with a screen timeout longer than the run.";
/** The most lines the log keeps. */
const LOG_MAX = 500;

/** The views; "This device", its own stage from its probe, in the phone copy alone (the review's page-4). */
const VIEWS: readonly { value: ViewChoice; label: string }[] = [
  { value: "desktop", label: "Reference desktop" },
  { value: "phone", label: "Reference phone" },
  { value: "device", label: "This device" },
  { value: "close-up", label: "Desk close-up" },
];
const QUALITIES: readonly { value: "auto" | "0" | "1" | "2" | "3"; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "0", label: "Pinned at 0" },
  { value: "1", label: "Pinned at 1" },
  { value: "2", label: "Pinned at 2" },
  { value: "3", label: "Pinned at 3" },
];

const size = (w: number, h: number): string => `${count(Math.round(w * 10) / 10)} × ${count(Math.round(h * 10) / 10)}`;

/** A fixture's turn, as the sample panel lists it. */
function turnText(turn: RoomFixture["turns"][number]): string {
  switch (turn.outcome) {
    case "reply":
      return `a reply by the ${turn.route} route, costing ${String(turn.cost_micro_usd)} micro-dollars`;
    case "refused":
      return `a turn refused with ${turn.status}`;
    default:
      return `a ${turn.outcome} turn`;
  }
}

export function createLookdev(root: HTMLElement, options: LookdevOptions, deps: LookdevDeps): LookdevPage {
  // What the page has started, released if a later step throws, so a page that can't be built leaves nothing running
  // behind the note that says why (main.ts).
  const undo: (() => void)[] = [];
  try {
    return buildPage(root, options, deps, undo);
  } catch (error) {
    for (const step of undo.reverse()) step();
    throw error;
  }
}

function buildPage(root: HTMLElement, options: LookdevOptions, deps: LookdevDeps, undo: (() => void)[]): LookdevPage {
  const doc = root.ownerDocument;
  const { inputs, clock } = deps;
  const { part, index, lookdev, fixtures } = inputs;
  const capability = deps.capability();
  const word = (key: string, fallback: string): string =>
    (Object.hasOwn(index.ui, key) ? index.ui[key] : undefined) ?? fallback;
  const sampleBadge = word("sign.sample", "Sample");

  // ---- The log ----
  const logList = h(doc, "ol", { class: "lookdev-log" });
  const log = (entry: LogEntry): void => {
    const label = entry.kind === "asset" ? "asset event" : entry.kind === "usage" ? "usage event" : "note";
    logList.append(h(doc, "li", { class: `lookdev-log-${entry.kind}` }, `${label}: ${entry.text}`));
    while (logList.children.length > LOG_MAX) logList.firstElementChild?.remove();
  };

  // ---- The canvas, made first: without a renderer there is no page to build ----
  let run: Run | null = null;
  const device = options.phone && options.probe ? { viewport: options.probe.viewport, dpr: options.probe.dpr } : null;
  const views = VIEWS.filter((v) => v.value !== "device" || device !== null);
  const stage = createStage({
    win: deps.win,
    clock,
    inputs,
    renderer: deps.renderer,
    capability,
    device,
    site: !options.phone,
    log,
    onLevel: (level) => {
      run?.quality(level);
      showReadouts();
    },
  });
  undo.push(() => stage.dispose());
  if (options.phone && options.probe === null) {
    // A phone copy without its probe falls back to the reference phone's last measured stage.
    stage.setView("phone");
  }

  // ---- The stage panel ----
  const caption = h(doc, "p", { class: "lookdev-caption" });
  const below = floorNote();
  const stagePanel = h(
    doc,
    "section",
    { class: "lookdev-stage-panel", "aria-label": "The room at the chosen view" },
    h(doc, "div", { class: "lookdev-stage" }, stage.canvas),
    caption,
    ...(below ? [below] : []),
  );

  function floorNote(): HTMLElement | null {
    if (stage.floor) return null;
    return h(
      doc,
      "p",
      { class: "lookdev-floor" },
      `This device is below ADR 0010's floor for studio models (WebGL 2, at least ${MODEL_FLOOR.deviceMemory} GB ` +
        `where the browser reports it, and ${count(MODEL_FLOOR.maxTextureSize)}-pixel textures): the room loads no ` +
        "model here, so a run measures stand-ins only.",
    );
  }

  // ---- The sample state's panel ----
  const samplePanel = h(doc, "div", { class: "lookdev-sample", "aria-live": "polite" });
  function showSample(): void {
    const fixture = stage.sample;
    if (!fixture) {
      samplePanel.replaceChildren(h(doc, "p", {}, "No sample state: the drafts build has no fixture."));
      return;
    }
    const badge = (): HTMLElement => h(doc, "span", { class: "lookdev-badge" }, sampleBadge);
    samplePanel.replaceChildren(
      h(doc, "p", {}, `The tier switch shows: ${word(`tier.${fixture.tier}`, fixture.tier)} `, badge()),
      h(
        doc,
        "ul",
        { class: "lookdev-turns" },
        ...fixture.turns.map((t) => h(doc, "li", {}, `${turnText(t)} `, badge())),
      ),
      h(
        doc,
        "p",
        { class: "lookdev-later" },
        "The neon sign's figures join with User Story 9, and the cable states with User Story 2.",
      ),
    );
  }

  // ---- The controls ----
  const controls: Control[] = [];
  const viewGroup = radioGroup(doc, {
    legend: "View",
    choices: views,
    value: stage.view,
    onChange: (v) => {
      stage.setView(v);
      showReadouts();
    },
  });
  const sceneGroup = radioGroup<SceneChoice>(doc, {
    legend: "Scene",
    choices: [
      { value: "room", label: "Room" },
      { value: "vignette", label: "Vignette" },
    ],
    value: stage.scene,
    onChange: (s) => {
      stage.setScene(s);
      showCandidates();
    },
  });
  const lookSelect = selectControl(doc, {
    label: "Look",
    choices: lookdev.looks.map((l) => ({ value: l.id, label: `${l.id} (${l.method})` })),
    value: stage.look.id,
    onChange: (id) => {
      stage.setLook(id);
      showReadouts();
    },
  });
  const sampleSelect = selectControl(doc, {
    label: "Sample state",
    choices: fixtures.map((f) => ({ value: f.id, label: `${f.id} (${f.tier})` })),
    value: stage.sample?.id ?? "",
    onChange: (id) => {
      stage.setSample(id);
      showSample();
    },
  });
  const qualityGroup = radioGroup(doc, {
    legend: "Quality",
    choices: QUALITIES,
    value: "auto",
    onChange: (q) => {
      stage.setQuality(q === "auto" ? "auto" : (Number(q) as QualityChoice));
      showReadouts();
    },
  });
  const pause = toggleButton(doc, { label: "Pause", pressed: false, onChange: (on) => stage.setPaused(on) });
  const loadEvery = actionButton(doc, "Load every piece", () => void stage.loadEveryPiece());
  const runButtons = RUN_SECONDS.map((seconds) =>
    actionButton(doc, `Run ${seconds / 60} minutes`, () => begin(seconds)),
  );
  const stopButton = actionButton(doc, "Stop the run", () => stop());
  stopButton.disabled = true;
  controls.push(viewGroup, sceneGroup, lookSelect, sampleSelect, qualityGroup, pause);
  const controlPanel = h(
    doc,
    "section",
    { class: "lookdev-controls", "aria-labelledby": "lookdev-controls-heading" },
    h(doc, "h2", { id: "lookdev-controls-heading" }, "Controls"),
    viewGroup.element,
    sceneGroup.element,
    lookSelect.element,
    sampleSelect.element,
    samplePanel,
    qualityGroup.element,
    h(doc, "div", { class: "lookdev-actions" }, pause.element, loadEvery, ...runButtons, stopButton),
  );

  // ---- The readouts ----
  const readoutHeading = h(doc, "h2", { id: "lookdev-readouts-heading" }, "Readouts");
  const readoutList = h(doc, "dl", { class: "lookdev-figures" });
  const readouts = h(
    doc,
    "section",
    { class: "lookdev-readouts", "aria-labelledby": "lookdev-readouts-heading" },
    readoutHeading,
    readoutList,
  );
  let measured: RunReadouts | null = null;
  function showReadouts(): void {
    const closeUp = stage.view === "close-up";
    readoutHeading.textContent = closeUp ? "Readouts, close-up: they judge nothing" : "Readouts";
    const label = views.find((v) => v.value === stage.view)?.label ?? stage.view;
    // Only this device's own stage says so: the reference stages are stages.ts's wherever the page runs.
    caption.textContent =
      `${closeUp ? "close-up, " : ""}${label}: a stage of ${size(stage.stage.w, stage.stage.h)} CSS px at a pixel ` +
      `ratio of ${stage.ratio}${closeUp && device ? ", this device's own" : ""}`;
    const frame = stage.frameSample();
    const f = measured?.frames;
    const rows: [string, string][] = [
      [
        "View",
        `${closeUp ? "close-up: " : ""}${label}, ${size(stage.stage.w, stage.stage.h)} CSS px at ${stage.ratio}`,
      ],
      [
        "Quality",
        `${stage.quality === "auto" ? "automatic" : `pinned at ${stage.quality}`}, at level ${stage.level}` +
          (measured ? `; ${measured.stepDowns} step-downs, ${measured.stepDownsWhileLoading} while loading` : ""),
      ],
      ["Frame time", f ? `p50 ${f.p50Ms.toFixed(1)} ms, p95 ${f.p95Ms.toFixed(1)} ms` : "measured during a run"],
      ["Median frame rate", f ? `${f.medianFps.toFixed(1)} frames a second` : "measured during a run"],
      ["Frames over 33 ms", f ? `${(f.over33Share * 100).toFixed(1)}%` : "measured during a run"],
      ["Draw calls", count(measured?.drawCalls ?? frame.drawCalls)],
      ["Triangles", count(measured?.triangles ?? frame.triangles)],
      ["Texture memory", `${count(stage.textureBytes)} of ${count(SCENE_TEXTURE_BYTES)} bytes`],
      ["Smallest cap height", "none yet: the faces are drawn with User Story 5"],
    ];
    readoutList.replaceChildren(...rows.flatMap(([term, value]) => [h(doc, "dt", {}, term), h(doc, "dd", {}, value)]));
  }
  let readoutTimer = clock.setTimeout(function tick() {
    if (run?.running) measured = run.readouts();
    showReadouts();
    readoutTimer = clock.setTimeout(tick, READOUT_MS);
  }, READOUT_MS);
  undo.push(() => clock.clearTimeout(readoutTimer));

  // ---- The candidates ----
  const candidates = new Map<string, Candidate>();
  const rows = new Map<string, HTMLElement>();
  const pickers: Control[] = [];
  const clears: HTMLButtonElement[] = [];
  const pieceName = (piece: string): string => {
    const placed = part.placements.find((p) => p.piece === piece && p.label !== null);
    const sw = index.switches.find((s) => part.switches.some((x) => x.id === s.id && x.piece === piece));
    const key = placed?.label ?? sw?.label;
    return key ? `${word(key, piece)} (${piece})` : piece;
  };
  const inVignette = (piece: string): boolean =>
    part.placements.some((p) => p.piece === piece && lookdev.vignette.show.includes(p.id)) ||
    part.switches.some(
      (sw) =>
        sw.piece === piece && Object.values(sw.poses).some((pose) => lookdev.vignette.show.includes(pose.mount.on)),
    );

  function showCandidate(piece: string): void {
    const row = rows.get(piece);
    if (!row) return;
    const c = candidates.get(piece);
    if (!c) {
      row.replaceChildren(h(doc, "p", { class: "lookdev-none" }, "No candidate: the piece shows its stand-in."));
      return;
    }
    const m = c.measures;
    const findings =
      c.findings.length === 0
        ? [h(doc, "p", {}, "Findings: none")]
        : [
            h(doc, "p", {}, `Findings: ${count(c.findings.length)}`),
            h(doc, "ul", { class: "lookdev-findings" }, ...c.findings.map((line) => h(doc, "li", {}, line))),
          ];
    row.replaceChildren(
      h(doc, "p", {}, "SHA-256: ", h(doc, "code", { class: "lookdev-hash" }, c.sha256)),
      h(doc, "p", {}, `${count(c.bytes)} bytes; ${count(c.gzipBytes)} bytes at gzip level 9`),
      h(
        doc,
        "p",
        {},
        m.triangles === null
          ? "No measures: RX1 or RX2 refuses the file."
          : `${count(m.triangles)} triangles; ${count(m.textureBytes ?? 0)} bytes of texture memory`,
      ),
      h(doc, "p", {}, `Mark: ${markReadout(c)}`),
      ...findings,
      ...(c.swappable
        ? []
        : [
            h(
              doc,
              "p",
              { class: "lookdev-refused" },
              "Not swapped in: RX1 or RX2 refuses the file, or it names a uri, which the page never fetches.",
            ),
          ]),
      ...(stage.scene === "vignette" && !inVignette(piece)
        ? [h(doc, "p", { class: "lookdev-later" }, "Not in the vignette: the room scene shows it.")]
        : []),
    );
  }
  function showCandidates(): void {
    for (const piece of rows.keys()) showCandidate(piece);
  }

  const pieceSections = candidatePieces(part, lookdev.pieces).map((piece) => {
    const inputsOf = lookdev.pieces[piece];
    const readout = h(doc, "div", { class: "lookdev-candidate", "data-candidate": piece, "aria-live": "polite" });
    rows.set(piece, readout);
    const picker = filePicker(doc, {
      piece,
      name: pieceName(piece),
      onPick: (file) => {
        if (!inputsOf) return;
        void readCandidate(piece, file, inputsOf).then((c) => {
          candidates.set(piece, c);
          showCandidate(piece);
          stage.setCandidate(
            piece,
            c.swappable
              ? { piece, asset: piece, bytes: c.gzipBytes, source: { kind: "memory", read: () => loadable(c) } }
              : null,
          );
        });
      },
    });
    pickers.push(picker);
    const clear = actionButton(doc, "Clear", () => {
      candidates.delete(piece);
      stage.setCandidate(piece, null);
      showCandidate(piece);
    });
    clears.push(clear);
    showCandidate(piece);
    return h(
      doc,
      "section",
      { class: "lookdev-piece" },
      h(doc, "h3", {}, pieceName(piece)),
      h(doc, "div", { class: "lookdev-piece-actions" }, picker.element, clear),
      readout,
    );
  });
  const candidatePanel = h(
    doc,
    "section",
    { class: "lookdev-candidates", "aria-labelledby": "lookdev-candidates-heading" },
    h(doc, "h2", { id: "lookdev-candidates-heading" }, "Candidates"),
    h(
      doc,
      "p",
      {},
      "Each file you pick stays in this page's memory: it is never sent, stored, or copied, and a reload forgets it. " +
        "Approve only a SHA-256 shown here, of a scrubbed file with no finding.",
    ),
    ...pieceSections,
  );

  // ---- Runs and their results ----
  const resultsPanel = h(
    doc,
    "section",
    { class: "lookdev-results", "aria-labelledby": "lookdev-results-heading", "aria-live": "polite" },
    h(doc, "h2", { id: "lookdev-results-heading" }, "Results"),
    h(doc, "p", {}, "A run's results appear here when it ends. A run stopped early gives none."),
  );

  function setRunning(on: boolean): void {
    for (const c of [...controls, ...pickers]) c.setEnabled(!on);
    for (const b of [loadEvery, ...clears]) b.disabled = on;
    for (const b of runButtons) b.disabled = on;
    stopButton.disabled = !on;
  }

  function begin(seconds: RunSeconds): void {
    if (run?.running) return;
    setRunning(true);
    measured = null;
    resultsPanel.replaceChildren(
      h(doc, "h2", { id: "lookdev-results-heading" }, "Results"),
      h(doc, "p", {}, `Running for ${seconds / 60} minutes, the scripted load first.`),
    );
    void stage.loadEveryPiece();
    doc.addEventListener("visibilitychange", onVisibility);
    run = startRun({
      clock,
      seconds,
      level: stage.level,
      sample: () => stage.frameSample(),
      busy: () => stage.busy,
      onEnd: (readout) => {
        run = null;
        measured = readout;
        doc.removeEventListener("visibilitychange", onVisibility);
        setRunning(false);
        const r = results(
          {
            bundle: part.digest,
            probe: options.probe,
            scene: stage.scene,
            view: stage.view,
            stage: [stage.stage.w, stage.stage.h],
            dpr: stage.ratio,
            look: stage.look.id,
            sample: stage.sample?.id ?? "",
            quality: stage.quality,
            scriptedLoad: true,
            smallestCap: null,
            candidates: [...candidates.values()],
          },
          readout,
        );
        const area = h(doc, "textarea", { readonly: true, rows: 20, "aria-label": "The results as JSON" });
        area.value = resultsJson(r);
        resultsPanel.replaceChildren(
          h(doc, "h2", { id: "lookdev-results-heading" }, "Results"),
          h(doc, "ul", { class: "lookdev-results-text" }, ...resultsText(r).map((line) => h(doc, "li", {}, line))),
          area,
        );
        showReadouts();
      },
    });
  }

  function stop(why = STOPPED): void {
    if (!run) return;
    run.stop();
    run = null;
    measured = null;
    doc.removeEventListener("visibilitychange", onVisibility);
    setRunning(false);
    resultsPanel.replaceChildren(h(doc, "h2", { id: "lookdev-results-heading" }, "Results"), h(doc, "p", {}, why));
  }

  /** A hidden page draws no frames while the run's timer runs on, so a run the page loses sight of stops early. */
  function onVisibility(): void {
    if (doc.visibilityState === "hidden") stop(HIDDEN);
  }

  // ---- The page ----
  root.replaceChildren(
    h(
      doc,
      "header",
      { class: "lookdev-header" },
      h(doc, "h1", {}, "Lookdev"),
      h(
        doc,
        "p",
        { class: "lookdev-drafts" },
        "Drafts only: this page exists in drafts builds and never in a release. It makes no request but for the " +
          "site's own files, stores nothing, and sends no event.",
      ),
      h(doc, "p", {}, "Bundle ", h(doc, "code", {}, part.digest)),
    ),
    h(
      doc,
      "div",
      { class: "lookdev-layout" },
      stagePanel,
      controlPanel,
      readouts,
      candidatePanel,
      resultsPanel,
      h(
        doc,
        "section",
        { class: "lookdev-events", "aria-labelledby": "lookdev-log-heading" },
        h(doc, "h2", { id: "lookdev-log-heading" }, "Events"),
        h(doc, "p", {}, "The page's own log: nothing here is sent."),
        logList,
      ),
    ),
  );
  showSample();
  showReadouts();

  return {
    stage,
    dispose() {
      run?.stop();
      doc.removeEventListener("visibilitychange", onVisibility);
      clock.clearTimeout(readoutTimer);
      stage.dispose();
    },
  };
}
