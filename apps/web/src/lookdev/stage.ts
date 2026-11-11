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
//   case by the claims rule, its cable tube, and its glows, as the tier signal applies a reading (User Story 2, T162);
//   and its turns reported, from "fixture", to a cost channel of its own, configured whatever live.turn says, whose
//   state the neon sign's counters draw, every figure "Sample" (User Story 9, T267; FR-049). A fixture's fallback
//   reply cues nothing: the switch shows the fixture's tier, never row 7's.
// - Quality: automatic, a controller of its own on the device's target, or pinned at a level for a measurement.
// - Pause: the room's motion store (motion.ts), which the page's Pause drives: the idle sway stops while it doesn't
//   animate, as the room's does, the frame loop drawing still frames (User Story 2, T162).
// - Labels: the stand-ins' labels, each saying "placeholder", draw on a layer of their own, which the page's camera
//   sees while Labels is on, so turning it off hides them from the page's view alone: the room's own 3D stage
//   (scene.ts) makes its labels as it did (the Author's first lookdev run; plan.md §10).
// - The live faces and the glow cards (spec 004, T192): the room's own face quads (scene/faces3d.ts), with the drafts
//   build's room text, typing as the room's do, and glow cards (scene/glows.ts), both stilled by Pause, shown in the
//   vignette only on its placements. A face draws at once in its typeface's family list and again as each typeface
//   arrives: the page judges a look, so it never shows a face blank while a typeface loads.
// - Candidates, from page memory, through the loader; the site's page also loads each set model from ../a/, and the
//   phone copy, which makes no request, every model from memory.
// - Spec 008's highlight sample (T019; FR-050): any selectable the page names drawn with the room's own highlight
//   (scene/highlight.ts), its two passes after the look's frame, in the look chosen, following a model as it swaps in
//   or falls back; none by default, and its draws counted in the readouts with the room's. The labels draw after the
//   passes, as the room's do (highlight.ts's drawFrame, on its LABEL_LAYER, the layer this page's Labels shows).
// It never polls the status, sends a turn or an event, or stores anything: its asset events go to the page's log with
// the live switch held off, and to the page's status line, which says how a candidate's load ended; and a pick on the
// canvas logs spec 002's object_selected in the log too.
import { Box3, PerspectiveCamera, SRGBColorSpace } from "three";
import type { AnimationClip, Group, Material, Mesh, Object3D, WebGLRenderer } from "three";

import type { RoomFixture, RoomLookdev } from "../../build/room/emit";
import { createAssetEvents } from "../asset-events";
import type { AssetEvent } from "../asset-events";
import { AVATARS } from "../choice/avatars";
import type { AvatarId, ClipRole } from "../choice/avatars";
import type { Mode } from "../choice/visit";
import type { Clock } from "../room/clock";
import type { MotionStore } from "../room/motion";
import type { Box, Look, RoomIndex, RoomScene } from "../room/compose/bundle";
import type { Camera } from "../room/compose/project";
import { loadTypefaces } from "../room/faces/fonts";
import type { TypefaceLoader } from "../room/faces/fonts";
import type { RoomText } from "../room/faces/words";
import { loadOrder } from "../room/compose/load-order";
import type { LoadEntry } from "../room/compose/load-order";
import { framing } from "../room/compose/framing";
import { frameArea } from "../room/compose/frame";
import { DEFAULT_METRICS, OPENING, compactBoxes, hudBoxes } from "../room/compose/hud";
import { protectSceneOf, protectorFor } from "../room/compose/protect";
import type { Box as ClearBox } from "../room/compose/hud";
import { REFERENCE_DESKTOP, REFERENCE_PHONE, stageFor } from "../room/compose/stages";
import type { Screen, Stage } from "../room/compose/stages";
import { bufferRatio, clearNdc, viewOffsetFor } from "../room/fit";
// The room's own stylesheet, so the window views' HUD boxes carry the room's classes and look (spec 005, PD-25).
import "../room/room.css";
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
import { buildFaceQuads } from "../room/scene/faces3d";
import type { FaceQuads } from "../room/scene/faces3d";
import { buildGlows } from "../room/scene/glows";
import type { GlowCards } from "../room/scene/glows";
import { LABEL_LAYER, createHighlight, drawFrame } from "../room/scene/highlight";
import type { Highlight } from "../room/scene/highlight";
import { createTextureLedger } from "../room/scene/ledger";
import { createLoader, figureEntries, modelEntries, prepareModel, showModel } from "../room/scene/loader";
import { caseFor } from "../room/signals/tier";
import { createCostChannel } from "../room/signals/turn-cost";
import type { CostState, TurnOutcome } from "../room/signals/turn-cost";
import type { ModelEntry } from "../room/scene/loader";
import { createInk } from "../room/scene/look";
import type { Ink } from "../room/scene/look";
import type { FrameSample } from "./metrics";
import { HANDS_NODE, caseLabel, disposeHands, drawHands, handsCases } from "./hands";
import type { HandsDrawn } from "./hands";
import type { QualityChoice, SceneChoice, ViewChoice } from "./results";

/** The drafts build's inputs: the 3D part, the index, the lookdev inputs, the fixtures, and the room text. */
export interface LookdevInputs {
  readonly part: RoomScene;
  readonly index: RoomIndex;
  readonly lookdev: RoomLookdev;
  readonly fixtures: readonly RoomFixture[];
  /** The drafts build's room text (spec 004, T192); absent, the faces bound to room text stay plain. */
  readonly text?: RoomText | null;
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
  /** The room's live faces and glow cards (spec 004, T192), rebuilt with the room in each look. */
  readonly faces: FaceQuads;
  readonly glows: GlowCards;
  readonly camera: PerspectiveCamera;
  /** The kernel's camera the view is framed with, which the readouts measure through. */
  readonly framing: Camera;
  readonly look: Look;
  readonly view: ViewChoice;
  /** The stage drawn, in CSS pixels. */
  readonly stage: Stage;
  /** The pixel ratio drawn at. */
  readonly ratio: number;
  /** Spec 005 (FR-059; plan.md §10.4, PD-25): the window a window view's canvas fills, null in a stage view; the clear
   *  area the room is framed into, in the canvas's CSS pixels; the drawing buffer, in device pixels; the level's pixel
   *  cap in force; and the HUD's docked boxes, static, over a window view's canvas. */
  readonly window: Screen | null;
  readonly clear: ClearBox;
  /** Spec 014 (FR-063; contracts/lookdev.md §6): in a window view, the frame area the room is framed into, its ease, as
   *  the room's kernel gives them; null in a stage view. `clear` is then the frame area too. */
  readonly frame: { readonly area: ClearBox; readonly ease: number } | null;
  readonly buffer: readonly [number, number];
  readonly cap: number;
  readonly hud: HTMLElement;
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
  /** The selectable drawn with the highlight (spec 008, FR-050), or none. */
  readonly highlight: string | null;
  /** Spec 014's hands view (FR-042; PD-24): each case of lookdev.yaml's `hands.avatars`, its words, and why it doesn't
   *  draw, or null where it does; empty where the file lists none. */
  readonly hands: readonly { readonly label: string; readonly why: string | null }[];
  /** Called after each change of the hands view's cases: a model or a clip taken, or a load ended without one. */
  onHands(fn: () => void): void;
  setView(view: ViewChoice): void;
  setScene(scene: SceneChoice): void;
  setLook(id: string): void;
  setSample(id: string): void;
  setQuality(choice: QualityChoice): void;
  setPaused(on: boolean): void;
  /** Shows the stand-ins' labels in the page's view, or hides them from it. */
  setLabels(on: boolean): void;
  /** Draws the room's highlight on a selectable of the index from the next frame, or none (spec 008, FR-050). */
  setHighlight(id: string | null): void;
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

/** A fixture's turn as the outcome it stands for (contracts/turn-cost.md §3): a fixture's degraded turn names no
 *  cause, and none is shown. */
function fixtureOutcome(turn: RoomFixture["turns"][number]): TurnOutcome {
  switch (turn.outcome) {
    case "reply":
      return { kind: "reply", route: turn.route, cost_micro_usd: turn.cost_micro_usd };
    case "refused":
      return { kind: "refused", status: turn.status };
    case "degraded":
      return { kind: "degraded", cause: "" };
    default:
      return { kind: turn.outcome };
  }
}

/** A sample's figures: its turns, from "fixture", to a channel of its own, configured as though the route existed, so
 *  the counters show what they would read; without a fixture, a new channel's. Its fallback cue goes nowhere. */
function sampleCost(fixture: RoomFixture | null, clock: Clock): CostState {
  const channel = createCostChannel({ configured: true, clock });
  for (const turn of fixture?.turns ?? []) channel.report(fixtureOutcome(turn), "fixture");
  return channel.state;
}

/** The groups that hold a placement's face quads and glow cards (scene/faces3d.ts, scene/glows.ts). */
const HOLDER = /^(faces|glows):/;

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

/** A large monitor's window, the third window view (spec 005, FR-059): 2560 × 1440 CSS pixels at a pixel ratio of 1. */
const LARGE_MONITOR: Screen = { w: 2560, h: 1440 };

function buildStage(options: StageOptions, undo: (() => void)[]): LookdevStage {
  const { win, clock, inputs } = options;
  const { part, index, lookdev, fixtures } = inputs;
  /** Spec 014: the frame area's protector over the part, as the room's 3D stage builds it. */
  const protect = protectorFor(protectSceneOf(part, index));
  const doc = win.document;
  const canvas = doc.createElement("canvas");
  canvas.className = "lookdev-canvas";
  canvas.setAttribute("aria-hidden", "true");
  // The window views' HUD: the strip, the bar, and the column or the dock, as static glass boxes (PD-25).
  const hud = doc.createElement("div");
  hud.className = "lookdev-hud";
  hud.hidden = true;
  hud.setAttribute("aria-hidden", "true");
  const hudParts = ["strip", "bar", "panels"].map((part) => {
    const box = doc.createElement("div");
    box.className = `hud-glass lookdev-hud-box lookdev-hud-${part}`;
    hud.append(box);
    return box;
  });

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
  // Spec 014's hands view (FR-042; PD-24): the listed avatars' files through the loader's figure hooks, asked for the
  // first time the view shows, from the site's a/ on the site's page; none in the phone copy, which makes no request.
  const handsCaseList = handsCases(lookdev.hands?.avatars ?? []);
  const handsFiles = new Map<
    AvatarId,
    { model: Object3D | null; clips: Map<ClipRole, AnimationClip>; missed: boolean }
  >();
  for (const c of handsCaseList)
    if (!handsFiles.has(c.avatar)) handsFiles.set(c.avatar, { model: null, clips: new Map(), missed: !options.site });
  let handsAsked = false;
  let handsShown: { group: Group; drawn: HandsDrawn[] } | null = null;
  const handsListeners: (() => void)[] = [];
  const figures = new Set([part.figures.twin, part.figures.visitor]);
  const memberOf = new Map<string, number>();
  index.selectables.forEach((s, i) => {
    for (const m of s.members) if (!memberOf.has(m)) memberOf.set(m, i);
  });
  const coarse = (): boolean => typeof win.matchMedia === "function" && win.matchMedia("(pointer: coarse)").matches;

  let look: Look = part.look;
  let labels: Labels = createLabels(doc);
  // The faces' typefaces, loaded as the room loads them; the page draws each face at once in its family list, and
  // again when a typeface arrives (T192).
  const fonts = loadTypefaces(doc, clock, index.typefaces);
  undo.push(() => fonts.dispose());
  const eager: TypefaceLoader = {
    family: (use) => {
      const t = index.typefaces.find((x) => x.use === use);
      return t ? `${t.family}, ${t.fallback}` : "sans-serif";
    },
    onChange: (fn) => fonts.onChange(fn),
    dispose: () => fonts.dispose(),
    settled: () => fonts.settled(),
  };
  let faces: FaceQuads | null = null;
  let glows: GlowCards | null = null;
  let level = 0;
  let settings: QualitySettings = qualitySettings(0);
  const { motion } = options;
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
  // Spec 008's highlight sample, the room's own, rebuilt with the room in each look.
  const members = new Map(index.selectables.map((s) => [s.id, s.members] as const));
  let highlighted: string | null = null;
  const makeHighlight = (): Highlight => {
    const made = createHighlight({ room, style: look.highlight, members: (id) => members.get(id) ?? [] });
    made.setTarget(highlighted);
    return made;
  };
  let highlight: Highlight = makeHighlight();
  let view: ViewChoice = options.device ? "device" : "desktop";
  let scene: SceneChoice = "room";
  let sample: RoomFixture | null = fixtures[0] ?? null;
  let quality: QualityChoice = "auto";
  let stage: Stage = REFERENCE_DESKTOP.stage;
  let spec: Camera = framing(stage.w / stage.h, framed);
  let ratio = 1;
  let windowed: Screen | null = null;
  let clear: ClearBox = { x: 0, y: 0, w: stage.w, h: stage.h };
  /** Spec 014: the window view's frame area and its ease, or null. */
  let framedArea: { readonly area: ClearBox; readonly ease: number } | null = null;
  let buffer: readonly [number, number] = [0, 0];
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
    // Its live faces, with the drafts build's room text, and its glow cards (T192).
    faces = buildFaceQuads({
      part,
      index,
      placements: built.placements,
      doc,
      clock,
      dpr: win.devicePixelRatio || 1,
      level,
      motion: () => motion,
      typefaces: eager,
    });
    faces.setText(inputs.text ?? null);
    glows = buildGlows({
      part: { ...part, look: next },
      placements: built.placements,
      glow: built.cases.glow,
      motion: () => motion,
    });
    glows.setEnabled(settings.glowCards);
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
  function viewOf(v: ViewChoice): { stage: Stage; dpr: number; window?: Screen } {
    const device = options.device;
    const own = device && { stage: stageFor({ w: device.viewport[0], h: device.viewport[1] }), dpr: device.dpr };
    // Spec 005's window views: the screen's whole window, its clear area the stage (FR-059; PD-25); since spec 014, its
    // frame area, by the room's own kernel over the part (its FR-063).
    const windowed = (screen: Screen, dpr: number): { stage: Stage; dpr: number; window: Screen } => {
      const f = frameArea(screen, OPENING, DEFAULT_METRICS, protect);
      return { stage: { w: f.area.w, h: f.area.h }, dpr, window: screen };
    };
    if (v === "window-desktop") return windowed(REFERENCE_DESKTOP.screen, REFERENCE_DESKTOP.dpr);
    if (v === "window-phone") return windowed(REFERENCE_PHONE.screen, REFERENCE_PHONE.dpr);
    if (v === "window-monitor") return windowed(LARGE_MONITOR, 1);
    if (v === "phone") return REFERENCE_PHONE;
    if ((v === "device" || v === "close-up") && own) return own;
    return REFERENCE_DESKTOP;
  }

  /** The HUD's boxes over a window view's canvas, positioned through the CSS object model, and the room's layout and
   *  blur on the page's root, so room.css draws them as the room does; hidden in a stage view. */
  function placeHud(): void {
    const root = doc.documentElement;
    if (!windowed) {
      hud.hidden = true;
      root.removeAttribute("data-hud");
      root.removeAttribute("data-blur");
      return;
    }
    // Spec 014: the compact boxes the room draws at rest, inside spec 005's bands.
    const b = hudBoxes(windowed);
    const c = compactBoxes(windowed);
    const boxes = [c.strip, c.bar, c.column ?? c.dock ?? c.bar];
    hudParts.forEach((el, k) => {
      const box = boxes[k];
      if (!box) return;
      for (const [name, value] of [
        ["left", box.x],
        ["top", box.y],
        ["width", box.w],
        ["height", box.h],
      ] as const)
        el.style.setProperty(name, `${value}px`);
    });
    hud.hidden = false;
    root.setAttribute("data-hud", b.layout);
    root.setAttribute("data-blur", level <= 1 ? "on" : "off");
  }

  const picker = selectablePicker(part, index);

  /** The canvas at the view's stage, the camera framed on it, the pick areas and the ink's width following. */
  function fit(): void {
    const v = viewOf(view);
    stage = v.stage;
    windowed = v.window ?? null;
    // The canvas: the stage, or in a window view the whole window, the room framed into its clear area (spec 005), since
    // spec 014 its frame area (its FR-063).
    const size = windowed ?? stage;
    const f = windowed ? frameArea(windowed, OPENING, DEFAULT_METRICS, protect) : null;
    framedArea = f ? { area: f.area, ease: f.ease } : null;
    clear = f ? f.area : { x: 0, y: 0, w: stage.w, h: stage.h };
    // The room's buffer ratio: the device's, capped by the level's ratio and its pixel cap (spec 005, PD-11).
    ratio = bufferRatio(v.dpr, settings, size.w, size.h);
    buffer = [Math.floor(size.w * ratio), Math.floor(size.h * ratio)];
    // CSSOM, which the site's style-src 'self' allows, unlike a style attribute in markup.
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.w, size.h, false);
    spec = frameCamera(
      camera,
      stage.w / stage.h,
      scene === "hands" && handsShown ? handsBoxes(handsShown.group) : view === "close-up" ? closeUp : framed,
    );
    if (windowed) {
      const o = viewOffsetFor(clear, windowed);
      camera.setViewOffset(o.fullWidth, o.fullHeight, o.x, o.y, o.width, o.height);
    } else if (camera.view?.enabled) camera.clearViewOffset();
    picker.resize(stage);
    ink.setStageHeight(size.h);
    highlight.setStage(size.w, size.h);
    placeHud();
  }

  /** The quality level's settings, as the room's 3D stage applies them (scene.ts's setQuality). */
  function applySettings(): void {
    const before = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = settings.shadows;
    ink.setOutlines(settings.outlines);
    labels.setScale(settings.textureScale);
    faces?.setLevel(level);
    glows?.setEnabled(settings.glowCards);
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
        // The faces' and the glows' holders show with their placement: what's inside them, the faces and the glows
        // show or hide themselves, by their words and their levels (T192).
        if (HOLDER.test(child.name)) {
          child.visible = on;
          continue;
        }
        if (drawable(child)) set(child, on);
        mark(child, on);
      }
    };
    for (const [id, node] of room.placements)
      mark(node, scene === "room" || (scene === "vignette" && vignette.has(id)));
    for (const child of room.scene.children)
      if (!nodes.has(child) && child.name !== HANDS_NODE && drawable(child)) set(child, scene === "room");
    // Spec 014's hands view, in place of the room: drawn once its scene first shows, and again as its files arrive.
    if (scene === "hands") {
      askHands();
      if (!handsShown) drawHandsNow();
    }
    if (handsShown) {
      if (handsShown.group.parent !== room.scene) room.scene.add(handsShown.group);
      handsShown.group.visible = scene === "hands";
    }
  }

  /** The hands group's box in world metres, framed as the room's boxes are. */
  function handsBoxes(group: Object3D): Box[] {
    group.updateMatrixWorld(true);
    const b = new Box3().setFromObject(group, true);
    if (b.isEmpty()) return [{ min: [-0.5, 0, -0.5], max: [0.5, 1.8, 0.5] }];
    return [{ min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }];
  }

  /** The hands view's cases drawn again from the files the page has now, in place of the last drawing. */
  function drawHandsNow(): void {
    if (handsShown) disposeHands(handsShown.group);
    handsShown = handsCaseList.length > 0 ? drawHands(handsCaseList, handsFiles, part.figures.grips) : null;
    if (handsShown) {
      room.scene.add(handsShown.group);
      handsShown.group.visible = scene === "hands";
    }
    for (const fn of handsListeners) fn();
  }

  /** The listed avatars' files, asked for once, the site's page alone. */
  function askHands(): void {
    if (handsAsked || !options.site || handsCaseList.length === 0) return;
    handsAsked = true;
    const avatars = [...handsFiles.keys()];
    const entries = avatars.flatMap((avatar) =>
      figureEntries({ figures: { ...part.figures, stand_in: null }, avatars: part.avatars }, avatar, "../"),
    );
    for (const avatar of avatars)
      if (!part.avatars[avatar]) {
        const own = handsFiles.get(avatar);
        if (own) own.missed = true;
      }
    void loader.loadFigures(entries);
  }

  /** A hands file's change: the view drawn again where it shows, its list told. */
  function handsChanged(): void {
    if (scene === "hands") {
      drawHandsNow();
      fit();
    } else {
      if (handsShown) disposeHands(handsShown.group);
      handsShown = null;
      for (const fn of handsListeners) fn();
    }
  }

  /** The sample state: the fixture's tier applied to each tier switch through the room's own apply, its case by the
   *  claims rule with its cable tube and glows; without a fixture, not-live's, as the room shows before a reading. */
  function applySample(): void {
    room.cases.apply(sample?.tier ?? "not-live");
    faces?.setCost(sampleCost(sample, clock));
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
      // Spec 014's hands view: an avatar's model, by its file's key, readied as the room's 3D stage readies one.
      if (!own && !piece.startsWith("avatar:")) return;
      prepareModel(model, own ?? { faces: {} }, look, room.materials);
      ink.prepare(model);
    },
    swap: (piece, model) => {
      showModel(room, part, piece, model);
      applyScene();
      highlight.refresh();
    },
    // Spec 014's hands view: the listed avatars' models and clips, as the room's figures take theirs.
    avatar: (entry, model) => {
      const own = handsFiles.get(entry.figure.avatar);
      if (!own) return false;
      own.model = model;
      handsChanged();
      return true;
    },
    clip: (entry, clips) => {
      const own = handsFiles.get(entry.figure.avatar);
      const first = clips[0];
      if (!own || entry.figure.role === null || !first) return;
      own.clips.set(entry.figure.role, first);
      handsChanged();
    },
    figureEnded: (entry, outcome) => {
      const own = handsFiles.get(entry.figure.avatar);
      if (!own || outcome === "loaded" || entry.figure.role !== null) return;
      own.missed = true;
      handsChanged();
    },
    maxSide: part.figures.texture_px,
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
      const rule = index.switches.find((s) => s.id === sw.id);
      for (const pose of Object.keys(sw.poses)) {
        const id = `${sw.id}.${pose}`;
        pieceOf.set(id, sw.piece);
        entries.push({
          id,
          model: wanted(sw.piece),
          framed: false,
          selectable: null,
          shown: Boolean(rule && caseFor(rule, sample?.tier ?? "not-live", (p) => Object.hasOwn(sw.poses, p)) === pose),
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
    (ndc) => {
      if (view === "close-up") return null;
      // A window view's point moved into its clear area first, as the room's stage does (spec 005, PD-13).
      const at = windowed ? clearNdc(ndc, windowed, clear) : ndc;
      return at ? picker.pick(at) : null;
    },
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
    faces?.frame(time);
    glows?.frame(time);
    renderer.info.reset();
    drawFrame({
      renderer,
      scene: room.scene,
      camera,
      highlight,
      labels: room.labels.size > 0,
      drawRoom: () => ink.render(room.scene, camera),
    });
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
    get faces() {
      return faces as FaceQuads;
    },
    get glows() {
      return glows as GlowCards;
    },
    camera,
    get framing() {
      return spec;
    },
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
    get window() {
      return windowed;
    },
    get frame() {
      return framedArea;
    },
    get clear() {
      return clear;
    },
    get buffer() {
      return buffer;
    },
    get cap() {
      return settings.pixelCap;
    },
    hud,
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
    get highlight() {
      return highlighted;
    },
    get hands() {
      const drawn = handsShown?.drawn;
      return handsCaseList.map((c, i) => {
        const own = handsFiles.get(c.avatar);
        const why = drawn?.[i]?.why ?? (own?.missed ? "no model" : "waiting for its model");
        return { label: caseLabel(c), why: drawn ? (drawn[i]?.why ?? null) : why };
      });
    },
    onHands(fn) {
      handsListeners.push(fn);
    },
    setView(next) {
      view = next;
      fit();
    },
    setScene(next) {
      scene = next;
      applyScene();
      fit();
    },
    setLook(id) {
      const next = lookdev.looks.find((l) => l.id === id);
      if (!next || next.id === look.id) return;
      // Every model shown goes back to its stand-in and is released with the old room, then loads again in the look.
      const shown = new Set(loader.loaded);
      for (const piece of shown) loader.remove(piece);
      faces?.dispose();
      glows?.dispose();
      highlight.dispose();
      disposeRoom(room);
      look = next;
      room = build(look);
      ink = createInk(renderer, look);
      ink.prepare(room.scene);
      highlight = makeHighlight();
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
    setHighlight(id) {
      highlighted = id !== null && members.has(id) ? id : null;
      highlight.setTarget(highlighted);
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
      faces?.dispose();
      glows?.dispose();
      highlight.dispose();
      fonts.dispose();
      if (handsShown) disposeHands(handsShown.group);
      disposeRoom(room);
      renderer.dispose();
      canvas.remove();
    },
  };
}
