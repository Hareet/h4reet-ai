// The lookdev page's canvas (spec 004; FR-055, FR-056, FR-067, FR-070; R-28, R-35, R-41; contracts/lookdev.md §2,
// §3): the production runtime on one canvas, not a stand-in for it. The 3D part's interpreter (scene/bundle3d.ts's
// buildRoom), the look (scene/look.ts), the stand-ins' labels and the quality levels (scene.ts), the loader
// (scene/loader.ts) with the room's image step and texture ledger, and the real quality controller (quality.ts) with
// its holds, all as the room's 3D stage runs them, after the hand-off. Around them, the page's settings:
// - The view: the reference desktop's stage (≈686 × 640 CSS px at a pixel ratio of 1, compose/stages.ts), the
//   reference phone's (its last measured stage and pixel ratio), each as stages.ts gives it on any device; in the
//   phone copy, this device's own, from its probe, the copy's first view, which on the reference phone re-measures its
//   stage; or the desk close-up, framed over close_up.frame's boxes on the page's primary stage. The camera frames as
//   the room's does, with compose/framing.ts over the framed placements' boxes; the pixel ratio drawn at is the view's,
//   capped by the quality level as the room caps the device's.
// - The scene: the room, or the vignette, where only vignette.show's placements are drawn, and every placement still
//   resolves the mounts. What a placement draws is everything under its node but the placements mounted on it, its
//   switch cases among it, so the laptop's switch shows where the placements its poses mount on show.
// - The look, applied at run time: the room rebuilt in it, and every model it showed loaded again (its decoded bitmaps
//   were closed once uploaded, R-28).
// - The sample state: a fixture's tier applied to each tier switch through the room's own apply (scene/cables.ts), its
//   case by the claims rule, its cable tube, and its glows, as the tier signal applies a reading (User Story 2, T162).
// - Quality: automatic, a controller of its own on the device's target, or pinned at a level for a measurement.
// - Pause: the room's motion store (motion.ts), which the page's Pause drives: the idle sway stops while it doesn't
//   animate, as the room's does, the frame loop drawing still frames (User Story 2, T162).
// - Labels: the stand-ins' labels, each saying "placeholder", draw on a layer of their own, which the page's camera
//   sees while Labels is on, so turning it off hides them from the page's view alone: the room's own 3D stage
//   (scene.ts) makes its labels as it did (the Author's first lookdev run; plan.md §10).
// - Candidates, from page memory, through the loader; the site's page also loads each set model from ../a/, and the
//   phone copy, which makes no request, every model from memory.
// It never polls the status, sends a turn or an event, or stores anything: its asset events go to the page's log with
// the live switch held off, and to the page's status line, which says how a candidate's load ended; and a pick on the
// canvas logs spec 002's object_selected in the log too.
import { PerspectiveCamera, SRGBColorSpace } from "three";
import type { Material, Mesh, Object3D, WebGLRenderer } from "three";

import type { RoomFixture, RoomLookdev } from "../../build/room/emit";
import { createAssetEvents } from "../asset-events";
import type { AssetEvent } from "../asset-events";
import { AVATARS } from "../choice/avatars";
import type { Mode } from "../choice/visit";
import type { Clock } from "../room/clock";
import type { MotionStore } from "../room/motion";
import type { Box, Look, RoomIndex, RoomScene } from "../room/compose/bundle";
import { loadOrder } from "../room/compose/load-order";
import type { LoadEntry } from "../room/compose/load-order";
import { REFERENCE_DESKTOP, REFERENCE_PHONE, stageFor } from "../room/compose/stages";
import type { Stage } from "../room/compose/stages";
import { bindPointerSelection } from "../room/objects";
import { createQualityController, meetsModelFloor, targetFps, watchContext } from "../room/quality";
import type { Capability, QualityController } from "../room/quality";
import { createLabels, qualitySettings } from "../room/scene";
import type { Labels, QualitySettings } from "../room/scene";
import {
  buildRoom,
  disposeRoom,
  frameCamera,
  framedBoxes,
  selectablePicker,
  showHandoff,
} from "../room/scene/bundle3d";
import type { Room3D } from "../room/scene/bundle3d";
import { createTextureLedger } from "../room/scene/ledger";
import { createLoader, modelEntries, prepareModel, showModel } from "../room/scene/loader";
import { caseFor } from "../room/signals/tier";
import type { ModelEntry } from "../room/scene/loader";
import { createInk } from "../room/scene/look";
import type { Ink } from "../room/scene/look";
import type { FrameSample } from "./metrics";
import type { QualityChoice, SceneChoice, ViewChoice } from "./results";

/** The drafts build's inputs: the 3D part, the index, the lookdev inputs, and the fixtures. */
export interface LookdevInputs {
  readonly part: RoomScene;
  readonly index: RoomIndex;
  readonly lookdev: RoomLookdev;
  readonly fixtures: readonly RoomFixture[];
}

/** A line of the page's log: an asset event, a usage event, or the page's own note. */
export interface LogEntry {
  readonly kind: "asset" | "usage" | "note";
  readonly text: string;
}

export interface StageOptions {
  readonly win: Window;
  readonly clock: Clock;
  /** The room's motion store: idle motion only while it animates; "Pause" sets its pause. */
  readonly motion: Pick<MotionStore, "animate" | "paused" | "setPaused">;
  readonly inputs: LookdevInputs;
  /** Makes the page's one renderer on its canvas. */
  readonly renderer: (canvas: HTMLCanvasElement) => WebGLRenderer;
  readonly capability: Capability;
  /** The viewport and pixel ratio of the device that opened the phone copy, from its probe; null on the site's page. */
  readonly device: { readonly viewport: readonly [number, number]; readonly dpr: number } | null;
  /** Whether set models load from the site's a/: the site's page, never the phone copy. */
  readonly site: boolean;
  readonly log: (entry: LogEntry) => void;
  /** Each change of the quality level, the controller's or a pin's. */
  readonly onLevel: (level: number) => void;
  /** Each asset event the loader records, as it records it: how a candidate's load ended, for the status line. */
  readonly onAsset: (event: AssetEvent) => void;
}

export interface LookdevStage {
  readonly canvas: HTMLCanvasElement;
  readonly room: Room3D;
  readonly camera: PerspectiveCamera;
  readonly look: Look;
  readonly view: ViewChoice;
  /** The stage drawn, in CSS pixels. */
  readonly stage: Stage;
  /** The pixel ratio drawn at. */
  readonly ratio: number;
  readonly scene: SceneChoice;
  readonly sample: RoomFixture | null;
  readonly quality: QualityChoice;
  readonly level: number;
  readonly paused: boolean;
  /** Whether models may load here: ADR 0010's floor. */
  readonly floor: boolean;
  /** Whether a hold is held or a model is loading. */
  readonly busy: boolean;
  /** Whether the page's camera sees the stand-ins' labels. */
  readonly labels: boolean;
  /** The pieces showing a model. */
  readonly loaded: ReadonlySet<string>;
  /** The texture ledger's bytes. */
  readonly textureBytes: number;
  setView(view: ViewChoice): void;
  setScene(scene: SceneChoice): void;
  setLook(id: string): void;
  setSample(id: string): void;
  setQuality(choice: QualityChoice): void;
  setPaused(on: boolean): void;
  /** Shows the stand-ins' labels in the page's view, or hides them from it. */
  setLabels(on: boolean): void;
  /** Shows a candidate for its piece through the loader; null clears it, its set model or its stand-in back. */
  setCandidate(piece: string, entry: ModelEntry | null): void;
  /** The scripted load: every model back to its stand-in, then each loaded again, in load order, under the holds. */
  loadEveryPiece(): Promise<void>;
  /** What the last frame drew. */
  frameSample(): FrameSample;
  dispose(): void;
}

/** The figure the visitor's placement shows: the first avatar, as the scene's anchors are its. */
const AVATAR = AVATARS[0].id;
const IDLE_SWAY = 0.015;
/** The layer the stand-ins' labels draw on, which the page's camera sees beside its own, layer 0, while Labels is on. */
const LABEL_LAYER = 1;

/** Whether an object draws: a mesh, a sprite, a line, or points. */
const drawable = (node: Object3D): boolean => {
  const n = node as Partial<{ isMesh: boolean; isSprite: boolean; isLine: boolean; isPoints: boolean }>;
  return Boolean(n.isMesh || n.isSprite || n.isLine || n.isPoints);
};

export function createStage(options: StageOptions): LookdevStage {
  // What the stage has taken, released if a later step throws: its renderer's WebGL context.
  const undo: (() => void)[] = [];
  try {
    return buildStage(options, undo);
  } catch (error) {
    for (const step of undo.reverse()) step();
    throw error;
  }
}

function buildStage(options: StageOptions, undo: (() => void)[]): LookdevStage {
  const { win, clock, inputs } = options;
  const { part, index, lookdev, fixtures } = inputs;
  const doc = win.document;
  const canvas = doc.createElement("canvas");
  canvas.className = "lookdev-canvas";
  canvas.setAttribute("aria-hidden", "true");

  const camera = new PerspectiveCamera();
  camera.layers.enable(LABEL_LAYER);
  const ledger = createTextureLedger(part.scene_texture_bytes);
  const floor = meetsModelFloor(options.capability);
  const framed = framedBoxes(part);
  const byId = new Map(part.placements.map((p) => [p.id, p]));
  const closeUp: Box[] = lookdev.close_up.frame.flatMap((id) => {
    const p = byId.get(id);
    return p ? [p.frame_box] : [];
  });
  const vignette = new Set(lookdev.vignette.show);
  const figures = new Set([part.figures.twin, part.figures.visitor]);
  const memberOf = new Map<string, number>();
  index.selectables.forEach((s, i) => {
    for (const m of s.members) if (!memberOf.has(m)) memberOf.set(m, i);
  });
  const coarse = (): boolean => typeof win.matchMedia === "function" && win.matchMedia("(pointer: coarse)").matches;

  let look: Look = part.look;
  let labels: Labels = createLabels(doc);
  // The room first: a bundle the 3D reader refuses says so before a renderer takes a WebGL context.
  let room: Room3D = build(look);
  const renderer = options.renderer(canvas);
  undo.push(() => renderer.dispose());
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  // One frame's draw calls and triangles, inked cel's lines among them: reset at each frame, not at each render.
  renderer.info.autoReset = false;
  let ink: Ink = createInk(renderer, look);
  // The lines' one set of parameters, shared once (scene/look.ts), so the view's height reaches every line.
  ink.prepare(room.scene);
  let view: ViewChoice = options.device ? "device" : "desktop";
  let scene: SceneChoice = "room";
  let sample: RoomFixture | null = fixtures[0] ?? null;
  let quality: QualityChoice = "auto";
  let level = 0;
  let settings: QualitySettings = qualitySettings(0);
  const { motion } = options;
  let stage: Stage = REFERENCE_DESKTOP.stage;
  let ratio = 1;
  let holds = 0;
  let disposed = false;
  let last: FrameSample = { drawCalls: 0, triangles: 0, textureBytes: 0 };
  let controller: QualityController | null = makeController();
  /** The drawables the vignette hid, which it alone shows again. */
  const hiddenByScene = new WeakSet<Object3D>();

  function build(next: Look): Room3D {
    labels = createLabels(doc);
    const made = labels;
    // Each label, and the sprite it holds, on the labels' layer alone: Labels hides it from the camera.
    const label = (text: string): Object3D => {
      const node = made.factory(text);
      node.traverse((o) => o.layers.set(LABEL_LAYER));
      return node;
    };
    const built = buildRoom({ ...part, look: next }, { avatar: AVATAR, label, index });
    // The room as a visitor has it after the hand-off.
    showHandoff(built, 1, false);
    return built;
  }

  function makeController(): QualityController {
    return createQualityController({
      target: targetFps(coarse()),
      onQuality: (next) => {
        applyLevel(next);
        options.log({ kind: "note", text: `quality stepped down to level ${next}` });
      },
      onFlat: (reason) => options.log({ kind: "note", text: `the room would go to 2D here (${reason})` }),
    });
  }

  /**
   * The stage and pixel ratio of a view. The reference stages are stages.ts's on whatever device opens the page, the
   * phone's the last measured; this device's, the copy's alone, is the room's layout at its probe's viewport, at its
   * pixel ratio; and the close-up takes the page's primary stage, this device's in the copy (the review's page-4).
   */
  function viewOf(v: ViewChoice): { stage: Stage; dpr: number } {
    const device = options.device;
    const own = device && { stage: stageFor({ w: device.viewport[0], h: device.viewport[1] }), dpr: device.dpr };
    if (v === "phone") return REFERENCE_PHONE;
    if ((v === "device" || v === "close-up") && own) return own;
    return REFERENCE_DESKTOP;
  }

  const picker = selectablePicker(part, index);

  /** The canvas at the view's stage, the camera framed on it, the pick areas and the ink's width following. */
  function fit(): void {
    const v = viewOf(view);
    stage = v.stage;
    ratio = Math.min(v.dpr, settings.pixelRatio);
    // CSSOM, which the site's style-src 'self' allows, unlike a style attribute in markup.
    canvas.style.width = `${stage.w}px`;
    canvas.style.height = `${stage.h}px`;
    renderer.setPixelRatio(ratio);
    renderer.setSize(stage.w, stage.h, false);
    frameCamera(camera, stage.w / stage.h, view === "close-up" ? closeUp : framed);
    picker.resize(stage);
    ink.setStageHeight(stage.h);
  }

  /** The quality level's settings, as the room's 3D stage applies them (scene.ts's setQuality). */
  function applySettings(): void {
    const before = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = settings.shadows;
    ink.setOutlines(settings.outlines);
    labels.setScale(settings.textureScale);
    if (before !== settings.shadows)
      room.scene.traverse((node) => {
        for (const m of ([] as Material[]).concat((node as Partial<Mesh>).material ?? [])) m.needsUpdate = true;
      });
    fit();
  }

  function applyLevel(next: number): void {
    level = next;
    settings = qualitySettings(next);
    applySettings();
    options.onLevel(next);
  }

  /**
   * The scene: in the vignette, only vignette.show's placements draw; the paper, which no placement holds, neither. It
   * hides only drawables that show, and shows again only those it hid, so a node other code hides stays hidden: a
   * model's own face objects, which prepareModel hides since the room draws the faces (the review's page-1).
   */
  function applyScene(): void {
    const nodes = new Set(room.placements.values());
    const set = (node: Object3D, on: boolean): void => {
      if (!on && node.visible) {
        node.visible = false;
        hiddenByScene.add(node);
      } else if (on && hiddenByScene.delete(node)) node.visible = true;
    };
    const mark = (node: Object3D, on: boolean): void => {
      for (const child of node.children) {
        if (nodes.has(child)) continue;
        if (drawable(child)) set(child, on);
        mark(child, on);
      }
    };
    for (const [id, node] of room.placements) mark(node, scene === "room" || vignette.has(id));
    for (const child of room.scene.children) if (!nodes.has(child) && drawable(child)) set(child, scene === "room");
  }

  /** The sample state: the fixture's tier applied to each tier switch through the room's own apply, its case by the
   *  claims rule with its cable tube and glows; without a fixture, not-live's, as the room shows before a reading. */
  function applySample(): void {
    room.cases.apply(sample?.tier ?? "not-live");
  }

  const hold = (): (() => void) => {
    holds += 1;
    const release = controller?.hold();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      holds -= 1;
      release?.();
    };
  };

  // The page's asset events: held off whatever the index says, so they only reach the page's log (§2).
  const assets = createAssetEvents({
    live: "off",
    clock,
    log: (e) =>
      options.log({ kind: "asset", text: `${e.asset} ${e.outcome}, ${e.ms_bucket} ms, ${e.bytes} bytes, ${e.mode}` }),
  });
  const loader = createLoader({
    clock,
    fetch: (url, init) => win.fetch(url, init),
    decode: (source, o) => win.createImageBitmap(source, o),
    floor: () => floor,
    figures: Promise.resolve(),
    handoff: Promise.resolve(),
    hold,
    level: () => level,
    mode: (): Mode => (level === 0 ? "3d" : "reduced"),
    record: (event) => {
      assets.record(event);
      options.onAsset(event);
    },
    ledger,
    uploader: renderer,
    prepare: (piece, model) => {
      const own = Object.hasOwn(part.pieces, piece) ? part.pieces[piece] : undefined;
      if (!own) return;
      prepareModel(model, own, look, room.materials);
      ink.prepare(model);
    },
    swap: (piece, model) => {
      showModel(room, part, piece, model);
      applyScene();
    },
  });

  /** The models from the site's a/, the site's page alone; the page's candidates. */
  const setModels = new Map(options.site ? modelEntries(part, "../").map((e) => [e.piece, e]) : []);
  const candidates = new Map<string, ModelEntry>();
  const sourceOf = (piece: string): ModelEntry | undefined => candidates.get(piece) ?? setModels.get(piece);

  /** Every piece with a model to show, in the kernel's load order: the room's own (compose/load-order.ts). */
  function ordered(only?: ReadonlySet<string>): ModelEntry[] {
    const wanted = (piece: string): string | null => (sourceOf(piece) && (!only || only.has(piece)) ? piece : null);
    const pieceOf = new Map<string, string>();
    const entries: LoadEntry[] = part.placements.map((p) => {
      pieceOf.set(p.id, p.piece);
      return {
        id: p.id,
        model: figures.has(p.id) ? null : wanted(p.piece),
        framed: p.framed,
        selectable: memberOf.get(p.id) ?? null,
        shown: true,
      };
    });
    for (const sw of part.switches) {
      const cases = index.switches.find((s) => s.id === sw.id)?.cases;
      for (const pose of Object.keys(sw.poses)) {
        const id = `${sw.id}.${pose}`;
        pieceOf.set(id, sw.piece);
        entries.push({
          id,
          model: wanted(sw.piece),
          framed: false,
          selectable: null,
          shown: Boolean(
            cases && caseFor(cases, sample?.tier ?? "not-live", (p) => Object.hasOwn(sw.poses, p)) === pose,
          ),
        });
      }
    }
    return loadOrder(entries).flatMap((id) => {
      const entry = sourceOf(pieceOf.get(id) ?? "");
      return entry ? [entry] : [];
    });
  }

  const unbind = bindPointerSelection(
    canvas,
    (ndc) => (view === "close-up" ? null : picker.pick(ndc)),
    (id) => options.log({ kind: "usage", text: `object_selected ${id}` }),
  );
  const unwatch = watchContext(
    canvas,
    clock,
    () => options.log({ kind: "note", text: "the WebGL context was lost and not restored: the room would go to 2D" }),
    { hold },
  );
  const restored = (): void => void loader.reload();
  canvas.addEventListener("webglcontextrestored", restored);

  let frame = 0;
  const loop = (time: number): void => {
    if (disposed) return;
    if (doc.visibilityState === "hidden") controller?.restart();
    else controller?.frame(time);
    room.twin.rotation.z = settings.animations && motion.animate ? Math.sin(time / 900) * IDLE_SWAY : 0;
    renderer.info.reset();
    ink.render(room.scene, camera);
    last = {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textureBytes: ledger.bytes,
    };
    frame = clock.requestFrame(loop);
  };

  applySettings();
  applySample();
  applyScene();
  if (setModels.size > 0) void loader.load(ordered());
  frame = clock.requestFrame(loop);

  return {
    canvas,
    get room() {
      return room;
    },
    camera,
    get look() {
      return look;
    },
    get view() {
      return view;
    },
    get stage() {
      return stage;
    },
    get ratio() {
      return ratio;
    },
    get scene() {
      return scene;
    },
    get sample() {
      return sample;
    },
    get quality() {
      return quality;
    },
    get level() {
      return level;
    },
    get paused() {
      return motion.paused;
    },
    floor,
    get busy() {
      return holds > 0 || loader.busy;
    },
    get labels() {
      return camera.layers.isEnabled(LABEL_LAYER);
    },
    get loaded() {
      return loader.loaded;
    },
    get textureBytes() {
      return ledger.bytes;
    },
    setView(next) {
      view = next;
      fit();
    },
    setScene(next) {
      scene = next;
      applyScene();
    },
    setLook(id) {
      const next = lookdev.looks.find((l) => l.id === id);
      if (!next || next.id === look.id) return;
      // Every model shown goes back to its stand-in and is released with the old room, then loads again in the look.
      const shown = new Set(loader.loaded);
      for (const piece of shown) loader.remove(piece);
      disposeRoom(room);
      look = next;
      room = build(look);
      ink = createInk(renderer, look);
      ink.prepare(room.scene);
      applySettings();
      applySample();
      applyScene();
      if (shown.size > 0) void loader.load(ordered(shown));
    },
    setSample(id) {
      sample = fixtures.find((f) => f.id === id) ?? sample;
      applySample();
    },
    setQuality(choice) {
      quality = choice;
      controller = choice === "auto" ? makeController() : null;
      applyLevel(choice === "auto" ? 0 : choice);
    },
    setPaused(on) {
      motion.setPaused(on);
    },
    setLabels(on) {
      if (on) camera.layers.enable(LABEL_LAYER);
      else camera.layers.disable(LABEL_LAYER);
    },
    setCandidate(piece, entry) {
      if (entry) {
        candidates.set(piece, entry);
        void loader.load([entry]);
        return;
      }
      candidates.delete(piece);
      loader.remove(piece);
      const set = setModels.get(piece);
      if (set) void loader.load([set]);
    },
    loadEveryPiece() {
      for (const piece of [...loader.loaded]) loader.remove(piece);
      return loader.load(ordered());
    },
    frameSample: () => last,
    dispose() {
      disposed = true;
      clock.cancelFrame(frame);
      loader.stop();
      assets.stop();
      unbind();
      unwatch();
      canvas.removeEventListener("webglcontextrestored", restored);
      disposeRoom(room);
      renderer.dispose();
      canvas.remove();
    },
  };
}
