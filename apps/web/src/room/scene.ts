// The 3D chunk (spec 002, T041; FR-005, FR-047, FR-048; contracts/room-scene.md §2–§4; research.md R-03, R-11): the
// work area in Three.js. Since spec 004 (T098; its FR-003, FR-005, FR-008, FR-011; R-11, R-20, R-27), createScene
// draws the room from the bundle's 3D part, `virtual:room-scene`, which only this module imports, so it lands in this
// lazy chunk. It refuses a part whose digest isn't the index's, before it makes a renderer, and the room falls to 2D as
// for a chunk that fails to load; it builds the object tree with scene/bundle3d.ts's buildRoom (each piece's stand-in,
// the figures, the hand-off and its paper), frames the camera over the framed placements' boxes with its frameCamera,
// draws in the look through scene/look.ts's createInk, and picks the index's selectables through compose/pick.ts over
// the same boxes, recomputed whenever the stage's size changes. No photo and no studio output: the stand-ins are
// R-11's placeholders, which spec 003's assets replace.
//
// The room imports this file only after the WebGL 2 check (quality.ts), so Three.js is its own chunk, loaded behind
// the choice screen and never on a device without WebGL 2. Spec 004's T112 took spec 002's placeholders out of it (the
// pieces' builders, their layout, and the raycast picker), since the room is its data's: the module keeps the stage,
// the labels it draws on sprites, and the quality levels, and neither of the last two needs a renderer to test. Spec
// 004's User Story 2 (T160, T161): the stage's `apply` shows the tier switch's case, cable tube and all, and the idle
// sway reads the room's motion store on each frame, so a pause or a change of reduced motion reaches it mid-visit.
// Spec 008's Phase 1 (T015; FR-014 to FR-019; plan.md R-07): the stage takes the room's target and draws the
// highlight's two passes after the look's frame (scene/highlight.ts), at every quality level and in every look, its
// widths following the stage's size; a model that swaps in or falls back is followed; and its pointer reports a
// hovering pointer's pick and a press's to the room as targeting inputs (objects.ts). The review of Phase 1: the
// renderer asks for a stencil buffer, which the highlight's mask needs, and the stand-ins' labels draw on a layer of
// their own, after the passes while there's a target (highlight.ts's drawFrame), so no border paints over a label.
// Spec 012 (its FR-014, FR-021; contracts/loading-progress.md §3; Amendments L6, L11): the stage says what it will load,
// `expected`, each figure's file and each set model with its bytes as served, which the room's loader counts; and it
// keeps one flag, `closed`, turned by the room's `gaveWay` or its own first showHandoff, whichever comes first, from
// which one gate holds the figures' files and the set models (and a set model's swap) until the hand-off ends. Before
// it, while the loader shows, each parses and shows as it arrives. So spec 009's FR-019 (a) wait and FR-022's rule for
// avatars, as spec 012's L11 amends them, hold for the set models too: nothing parses from the giving way to the
// hand-off's end, and one already parsing then shows once it ends.
import {
  CanvasTexture,
  Object3D,
  PerspectiveCamera,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Material, Mesh } from "three";
import part from "virtual:room-scene";

import { assetEvent } from "../asset-events";
import { bindPointerSelection } from "./objects";
import { capability, meetsModelFloor } from "./quality";
import {
  buildRoom,
  disposeRoom,
  frameCamera,
  framedBoxes,
  keepPaper,
  keptPaper,
  selectablePicker,
  showHandoff as drawHandoff,
} from "./scene/bundle3d";
import { floorOfPart } from "./compose/floor";
import { reservedBoxes } from "./compose/hud";
import type { Box } from "./compose/hud";
import { bufferRatio, clearNdc, fillsCanvas, viewOffsetFor } from "./fit";
import { reservedIn } from "./compose/frame";
import type { Rect } from "./compose/pick";
import { protectSceneOf, protectorFor } from "./compose/protect";
import { memberRect } from "./compose/pick";
import type { Box as WorldBox } from "./compose/framing";
import { nearsEdge } from "./walk/hold";
import { startPose } from "./walk/movement";
import type { Camera as ViewCamera } from "./compose/project";
import { cutoutDriver, figureDriverFor } from "./scene/figure";
import { createWalking } from "./scene/walking";
import { createWalkInput } from "./walk/input";
import { reachTargets } from "./walk/reach";
import type { Pose } from "./walk/movement";
import { AVATAR_SHAPES } from "../choice/avatars";
import { EATER, eatingAvailable } from "./eat/available";
import { SPEAK_DEFAULTS, createBubble, speakingSeconds } from "./bubble";
import type { Bubble } from "./bubble";
import { createDinoFigures } from "./scene/dino-scene-figures";
import type { DinoFigures } from "./scene/dino-scene-figures";
import { uiWord } from "./ui-keys";
import { createEat3d } from "./eat/eat3d";
import type { Eat3d } from "./eat/eat3d";
import { createMeal } from "./eat/meal";
import type { Meal } from "./eat/meal";
import { availabilityFor, eatTarget, edibleReach, edibleTargets } from "./eat/press";
import type { LabelFactory } from "./scene/bundle3d";
import type { AvatarFigures } from "./scene/avatars";
import { buildFaceQuads, dressSurface } from "./scene/faces3d";
import { buildGlows } from "./scene/glows";
import { LABEL_LAYER, createHighlight, drawFrame } from "./scene/highlight";
import { createTextureLedger } from "./scene/ledger";
import type { Loader } from "./scene/loader";
import { qualitySettings } from "./scene/levels";
import { createInk } from "./scene/look";
import type { ExpectedFile, FrameGiven, SceneOptions, Stage3D } from "./stage";

/** A figure's framed box moved from its start to a pose (spec 014, PD-11): its corners turned about Y by the heading's
 *  change about the start, then moved by the pose's offset, as an axis-aligned box. */
function poseBox(
  box: WorldBox,
  start: { readonly x: number; readonly z: number; readonly heading: number } | null,
  pose: { readonly x: number; readonly z: number; readonly heading: number },
): WorldBox {
  if (!start) return box;
  const turn = pose.heading - start.heading;
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const xs: number[] = [];
  const zs: number[] = [];
  for (const x of [box.min[0], box.max[0]])
    for (const z of [box.min[2], box.max[2]]) {
      const [dx, dz] = [x - start.x, z - start.z];
      xs.push(pose.x + c * dx + s * dz);
      zs.push(pose.z - s * dx + c * dz);
    }
  return {
    min: [Math.min(...xs), box.min[1], Math.min(...zs)],
    max: [Math.max(...xs), box.max[1], Math.max(...zs)],
  };
}

/** A frame area the stage can frame into: finite, and of some size (spec 014, FR-004). */
const usable = (b: Box): boolean => [b.x, b.y, b.w, b.h].every((v) => Number.isFinite(v)) && b.w > 0 && b.h > 0;

/** A label without a renderer: an empty node with the label's name, for the tests and a page with no 2D canvas. */
const namedLabel: LabelFactory = (text) => {
  const node = new Object3D();
  node.name = `label:${text}`;
  return node;
};

// The quality levels live in scene/levels.ts, which the faces read too; the stage and the lookdev page read them here.
export { qualitySettings } from "./scene/levels";
export type { QualitySettings } from "./scene/levels";

const PLACEHOLDER = " (placeholder)";

/** A label's lines: its name above "placeholder", or its text on one line. */
function labelLines(text: string): string[] {
  return text.endsWith(PLACEHOLDER) ? [text.slice(0, -PLACEHOLDER.length), "placeholder"] : [text];
}

/** Draws a label on a fresh canvas, its font 28 pixels at scale 1; null where the page has no 2D canvas. */
function drawLabel(doc: Document, text: string, scale: number): HTMLCanvasElement | null {
  const canvas = doc.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const lines = labelLines(text);
  const px = Math.max(8, Math.round(28 * scale));
  const fonts = [`600 ${px}px system-ui, sans-serif`, `400 ${Math.round(px * 0.75)}px system-ui, sans-serif`];
  const width = Math.max(
    ...lines.map((line, i) => {
      ctx.font = fonts[i] ?? fonts[0] ?? "";
      return ctx.measureText(line).width;
    }),
  );
  const lineHeight = Math.round(px * 1.25);
  canvas.width = Math.ceil(width) + px;
  canvas.height = lineHeight * lines.length + Math.round(px / 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    ctx.font = fonts[i] ?? fonts[0] ?? "";
    ctx.fillStyle = i === 0 ? "#1a1a1a" : "#3a3a3a";
    ctx.fillText(line, px / 2, Math.round(px / 4) + i * lineHeight);
  });
  return canvas;
}

function labelTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A sprite's size on screen: about 4% of the view's height a line, whatever its texture's resolution. */
function fitLabel(sprite: Sprite, canvas: HTMLCanvasElement, lines: number): void {
  const height = 0.033 * lines;
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
}

export interface Labels {
  /** Makes a label: a node named `label:<text>`, holding its sprite where the page has a 2D canvas. */
  factory: LabelFactory;
  /**
   * Redraws every label at a texture scale (quality's textureScale), releasing the old textures, at the same size on
   * screen. The placeholders' labels are their only textures, so this is quality 3's "smaller textures" (R-04).
   */
  setScale(scale: number): void;
}

/** The scene's labels, drawn on 2D canvases and shown as sprites of one size on screen at any camera distance. */
export function createLabels(doc: Document): Labels {
  let scale = 1;
  const drawn: { text: string; sprite: Sprite }[] = [];
  return {
    factory(text) {
      const node = namedLabel(text);
      const canvas = drawLabel(doc, text, scale);
      if (!canvas) return node;
      const sprite = new Sprite(
        new SpriteMaterial({ map: labelTexture(canvas), depthTest: false, sizeAttenuation: false }),
      );
      fitLabel(sprite, canvas, labelLines(text).length);
      sprite.renderOrder = 10;
      // On the labels' layer, which the stage's camera sees with its own, and draws last while there's a target.
      sprite.layers.set(LABEL_LAYER);
      node.add(sprite);
      drawn.push({ text, sprite });
      return node;
    },
    setScale(next) {
      if (next === scale) return;
      scale = next;
      for (const { text, sprite } of drawn) {
        const canvas = drawLabel(doc, text, scale);
        if (!canvas) continue;
        const old = sprite.material.map;
        sprite.material.map = labelTexture(canvas);
        sprite.material.needsUpdate = true;
        old?.dispose();
        fitLabel(sprite, canvas, labelLines(text).length);
      }
    },
  };
}

/**
 * The 3D stage: the room from the bundle's 3D part on its own canvas, drawn in its look, the frame loop on the room's
 * clock, the hand-off's drawing, and the pointer's picks. It throws, before it makes a renderer, on a part that isn't
 * the index's or doesn't build whole, and the room goes to 2D.
 */
export function createScene(options: SceneOptions): Stage3D {
  const { win, doc, clock } = options;
  const labels = createLabels(doc);
  // Spec 029 (FR-020): the paper's drawing, in the document, its word in the chalk face once it has arrived.
  const room = buildRoom(part, {
    avatar: options.avatar,
    label: labels.factory,
    index: options.room,
    paper: { doc, ...(options.typefaces ? { typefaces: options.typefaces } : {}) },
  });
  // The live faces and the glow cards (spec 004, T185): each read the motion store on every frame, so a pause or reduced
  // motion stills them mid-visit, and the faces' words come when room-data.json does (setText).
  const animating = (): { animate: boolean } => ({
    animate: options.motion ? options.motion.animate : !options.reducedMotion,
  });
  const faces = buildFaceQuads({
    part,
    index: options.room,
    placements: room.placements,
    doc,
    clock,
    dpr: win.devicePixelRatio || 1,
    level: 0,
    motion: animating,
    ...(options.typefaces ? { typefaces: options.typefaces } : {}),
  });
  if (options.text !== undefined) faces.setText(options.text);
  if (options.cost) faces.setCost(options.cost);
  const glows = buildGlows({ part, placements: room.placements, glow: room.cases.glow, motion: animating });
  const canvas = doc.createElement("canvas");
  canvas.className = "room-canvas";
  canvas.setAttribute("aria-hidden", "true");
  let renderer: WebGLRenderer;
  try {
    // A stencil buffer for the highlight's mask (spec 008; scene/highlight.ts), which three no longer asks for itself.
    renderer = new WebGLRenderer({ canvas, antialias: true, stencil: true });
  } catch (error) {
    faces.dispose();
    glows.dispose();
    disposeRoom(room);
    throw error;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const ink = createInk(renderer, part.look);
  ink.prepare(room.scene);
  // Spec 008's highlight: the target's members' draws bordered in the look's highlight, its passes after the look's.
  const members = new Map(options.room.selectables.map((s) => [s.id, s.members] as const));
  // Spec 026 (R-09) bordered the dog's picture for a selectable with `figure: dog` while the dog stood at home; since
  // spec 028 (FR-028; Q17) no room dog stands at home, so a selectable's members alone are bordered.
  const highlight = createHighlight({
    room,
    style: part.look.highlight,
    members: (id) => members.get(id) ?? [],
  });

  // The studio models the 3D part sets, loaded as R-28 has it (scene/loader.ts): above ADR 0010's floor, which the room
  // read behind the choice (app.ts), so nothing here asks the device during the hand-off; after the hand-off; under the
  // controller's holds; each outcome an asset event. The loader, with three's GLTFLoader, is a chunk of its own,
  // imported only when the part sets a model, so the 3D chunk carries neither until the first studio piece. If that
  // chunk can't load, the stand-ins stay, each model failed (or skipped below the floor) at once: a browser keeps a
  // failed module's failure, so nothing retries it. A stage the room left first records nothing: app.ts skips its
  // models in 2D.
  const { floor } = options;
  let loader: Loader | null = null;
  let disposed = false;
  // Spec 009's figures (its FR-008, FR-011, FR-021; plan.md R-03, R-04): the stand-in's and the chosen avatar's files,
  // loaded first, with the loader, by scene/avatars.ts's controllers, which show each in its figure once ready. Until
  // then, and for good where one fails, the figures keep buildRoom's fallbacks.
  let figures: AvatarFigures | null = null;
  /** Spec 028 (FR-019 to FR-026; plan.md R-B3): the dinosaur's scene, made once in a dinosaur visit after the hand-off,
   *  where the scene has `figures.leave`; its director waits for the dinosaur's model to show (Q11). */
  let dino: DinoFigures | null = null;
  let leaving = false;
  const bundled = (id: string | null): boolean => id !== null && Object.hasOwn(part.avatars, id);
  // Spec 016 (FR-044): the twin's own model counts as the twin's figure's avatar where the part has it.
  const wantsAvatars = part.twin !== null || bundled(part.figures.stand_in) || bundled(options.avatar);
  // Phase 2 (FR-019; R-10): the room waits for both figures before the hand-off, at most wait_ms, and not at all where
  // no avatar loads; a figure file parses before the hand-off starts (the stage's first showHandoff) or after it ends.
  let figuresSettled: () => void = () => undefined;
  const figuresReady = new Promise<void>((resolve) => (figuresSettled = resolve));
  if (!wantsAvatars || floor === false) figuresSettled();
  // Spec 012: closed from the loader's giving way or the hand-off's first frame, whichever comes first; until then the
  // figures' files and the set models parse and show as they arrive.
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    figures?.close();
  };
  void options.gaveWay?.then(close, close);
  const handoffEnded = options.handoff ?? Promise.resolve();
  // Spec 028 (FR-019; plan.md R-B3): the hand-off has ended, so the dinosaur's scene may take the figures' homes (as
  // spec 025's run did, B-1: no home holds the hand-off's mid-turn rotation).
  let handedOff = false;
  void handoffEnded.then(() => {
    handedOff = true;
    // Spec 033 (FR-011): the kept sheet is the one drawn from the hand-off's end, whether or not figures run.
    keptPaper(room);
  });
  const gate = (): Promise<unknown> => (closed ? handoffEnded : Promise.resolve());
  // What the stage will load (spec 012): resolved once the loader's chunk has built the entries; never rejected.
  let sayExpected: (files: readonly ExpectedFile[]) => void = () => undefined;
  const expected = new Promise<readonly ExpectedFile[]>((resolve) => (sayExpected = resolve));
  const asExpected = (entries: readonly { asset: string; bytes: number }[]): ExpectedFile[] =>
    entries.map((e) => ({ asset: e.asset, bytes: e.bytes }));
  if (!(part.load_order.length > 0 || wantsAvatars)) sayExpected([]);
  if (part.load_order.length > 0 || wantsAvatars)
    // The avatars' chunk failing to load leaves the figures their fallbacks, and the room's models load all the same.
    void Promise.all([import("./scene/loader"), wantsAvatars ? import("./scene/avatars").catch(() => null) : null])
      .then(([{ createLoader, figureEntries, modelEntries, prepareModel, showModel, standInEntries }, avatars]) => {
        const entries = modelEntries(part);
        // Without the avatars' chunk nothing could show them, so their files aren't fetched.
        const figureFiles = avatars ? figureEntries(part, options.avatar) : [];
        // Said before any file's end is recorded; below the floor every one is skipped at once, which the room keeps.
        sayExpected(disposed ? [] : asExpected([...figureFiles, ...entries]));
        if (disposed || (entries.length === 0 && figureFiles.length === 0)) return;
        const atFloor = floor === undefined ? (): boolean => meetsModelFloor(capability(win)) : (): boolean => floor;
        figures =
          avatars?.createAvatarFigures(room, part, {
            chosen: options.avatar,
            ...(options.onFigure ? { signal: options.onFigure } : {}),
            // Spec 016 (FR-019 to FR-021): the twin's states on the room's clock.
            clock: () => clock.now(),
            // Spec 016 (FR-036, FR-041): the shirt's lettering into the twin's own model's face, never the stand-in's.
            dress: (instance) => {
              for (const face of options.room.faces)
                if (face.surface === "model" && face.placement === part.figures.twin)
                  dressSurface(faces, face.id, instance);
            },
            // Spec 016 (FR-002, FR-044; plan.md R-05): the stand-in's files, fetched only once the twin's own model
            // has failed; after `expected` resolved, so the loader counts them for nothing (spec 012).
            standIn: () => {
              if (!disposed && !leaving) void loader?.loadFigures(standInEntries(part, options.avatar));
            },
          }) ?? null;
        if (closed) figures?.close();
        if (figures) void figures.settled.then(figuresSettled);
        else figuresSettled();
        // The room's models start once every figure file's fetch has ended (FR-021; Amendment M17).
        let figuresFetched: () => void = () => undefined;
        const fetched = new Promise<void>((resolve) => (figuresFetched = resolve));
        loader = createLoader({
          clock,
          fetch: (url, init) => win.fetch(url, init),
          decode: (source, o) => win.createImageBitmap(source, o),
          floor: atFloor,
          figures: figureFiles.length > 0 ? fetched : Promise.resolve(),
          handoff: options.handoff ?? Promise.resolve(),
          hold: options.hold ?? (() => () => undefined),
          level: options.level ?? (() => 0),
          mode: options.mode ?? (() => "3d"),
          record: options.assets ?? (() => undefined),
          ledger: createTextureLedger(part.scene_texture_bytes),
          uploader: renderer,
          prepare: (piece, model) => {
            const own = Object.hasOwn(part.pieces, piece) ? part.pieces[piece] : undefined;
            // An avatar's model, by its file's key: readied as a room model with no face of its own.
            if (!own && !piece.startsWith("avatar:") && piece !== "twin") return;
            prepareModel(model, own ?? { faces: {} }, part.look, room.materials);
            // The lines' one set of parameters, the stand-ins', so the stage's height reaches the model's too.
            ink.prepare(model);
          },
          swap: (piece, model) => {
            showModel(room, part, piece, model);
            // The highlight follows what the member draws now (spec 008, FR-019).
            highlight.refresh();
          },
          avatar: (entry, model) => figures?.model(entry.figure.avatar, model) ?? false,
          // Spec 016 (FR-045): the twin's own model decodes at its block's side.
          ...(part.twin ? { twinMaxSide: part.twin.block.texture_px } : {}),
          clip: (entry, clips) => {
            if (entry.figure.role !== null) figures?.clip(entry.figure.avatar, entry.figure.role, clips);
          },
          figureEnded: (entry, outcome) => {
            if (outcome === "loaded") return;
            // avatar_failed's source (FR-032): a file that failed after its retry; a skip never sends it.
            if (outcome === "failed") options.onFigure?.({ kind: "failed" });
            const why = outcome === "failed" ? "failed" : leaving ? "2d" : atFloor() ? "skipped" : "floor";
            figures?.missed(entry.figure.avatar, entry.figure.role, why);
          },
          maxSide: part.figures.texture_px,
          // One gate for the figures' files and the set models, and a set model's swap (spec 012, FR-021).
          figureGate: gate,
          modelGate: gate,
          swapGate: gate,
        });
        void loader.loadFigures(figureFiles, figuresFetched);
        void loader.load(entries);
        // The kept paper goes to the visitor's holding hand once the hand-off ends (R-09).
        void (options.handoff ?? Promise.resolve()).then(() => figures?.handoffEnded());
      })
      .catch(() => {
        figuresSettled();
        sayExpected([]);
        if (disposed) return;
        const outcome = floor === false ? "skipped" : "failed";
        for (const asset of options.room.models)
          options.assets?.(assetEvent({ asset, outcome, ms: 0, bytes: 0, mode: options.mode?.() ?? "3d" }));
      });
  // A restored context lost the models' textures, whose bitmaps were closed: back to stand-ins and fallbacks, and loaded
  // again, from the HTTP cache (spec 009, FR-006, for the figures).
  const restored = (): void => {
    if (!loader) return;
    if (figures) {
      figures.reset();
      void import("./scene/loader").then(({ figureEntries }) => {
        if (!disposed) void loader?.loadFigures(figureEntries(part, options.avatar));
      });
    }
    void loader.reload();
  };
  canvas.addEventListener("webglcontextrestored", restored);

  let settings = qualitySettings(0);
  const camera = new PerspectiveCamera();
  camera.layers.enable(LABEL_LAYER);
  const boxes = framedBoxes(part);
  frameCamera(camera, 16 / 9, boxes);
  // Spec 026 (R-09): the dog figure's rectangle picked only while the dog showed its model at home; since spec 028
  // (FR-028; Q17) none does, so it never picks.
  const picker = selectablePicker(part, options.room, () => false);
  // Spec 008's walking view (T051): the walkable floor and the figure's driver from the 3D part, the input over the
  // canvas, and the orchestrator, which reach and the walking control's room callbacks reach the room through. Where
  // the part gives no floor or no figure, there is no walking view, and entering does nothing.
  const walkable = floorOfPart(part, part.walking.radius_m);
  /** Spec 014: the visitor figure's framed box at its place, and its start, for the hold's edge (PD-11). */
  const visitorBox = part.placements.find((p) => p.id === part.figures.visitor)?.frame_box ?? null;
  const floorStart = walkable ? startPose(walkable) : null;
  const visitorNode = room.placements.get(part.figures.visitor);
  const cutout = visitorNode ? cutoutDriver({ node: visitorNode, picture: room.visitor }) : null;
  // Spec 009 (FR-028; R-16): the visitor's avatar's driver while its avatar shows, the cut-out's otherwise, each
  // holding the kept paper walking hands it, the one that takes over mid-walk too.
  const figure = cutout ? figureDriverFor(cutout, () => figures) : null;
  const input = createWalkInput(canvas, win);
  const rates = { turn: (part.walking.turn_dps * Math.PI) / 180, tilt: (part.walking.tilt_dps * Math.PI) / 180 };
  let returning = false;
  // Spec 024 (FR-001, FR-012; plan.md §5.4 to §5.6): the dinosaur's eating, only for a 3D dinosaur visit over a part
  // with an edible placement. The meal ledger on the room's clock, the 3D side over each placement's model, and the
  // press's gate (eat/press.ts) over the edible placements' frame boxes, which key B and the "Eat" tile both take.
  const eatingRoom = options.eating;
  // Only where the bundle carries the dinosaur's model (page Q247): without it the figure shows no dinosaur to eat.
  const eats = options.avatar === EATER && bundled(EATER) && part.placements.some((p) => p.edible !== null);
  const edible = eats ? edibleTargets(part) : [];
  const eatReach = {
    reach: part.walking.reach_m,
    cone: (part.walking.reach_cone_deg * Math.PI) / 180,
    radius: part.walking.radius_m,
  };
  /** A placement's model as the loader shows it: its node's child the loader names `model` (scene/loader.ts's
   *  MODEL_NODE, not imported, so the loader's chunk stays its own). */
  const modelOf = (id: string): Object3D | null =>
    room.placements.get(id)?.children.find((c) => c.name === "model") ?? null;
  let meal: Meal | null = null;
  let eat3d: Eat3d | null = null;
  if (eats) {
    meal = createMeal({ regrow_s: part.eating.regrow_s, now: () => clock.now() });
    eat3d = createEat3d({
      part,
      model: modelOf,
      figure: () => ({ root: room.visitor, height: AVATAR_SHAPES[options.avatar].height }),
      meal,
      highlight,
      now: () => clock.now(),
      reduced: () => (options.motion ? options.motion.reducedMotion : options.reducedMotion),
      ...(eatingRoom?.said
        ? { said: (id: string) => eatingRoom.said?.(id, part.placements.find((p) => p.id === id)?.label ?? null) }
        : {}),
    });
  }
  /** The availability's parts the room and the stage know, apart from the reached piece. */
  const eatBase = () => {
    const state = eatingRoom?.state() ?? { paused: false, loading: false };
    return {
      view: "3d" as const,
      avatar: options.avatar as string,
      figureModel: figures?.shows("visitor") ?? false,
      paused: state.paused,
      loading: state.loading,
      failed: eat3d?.disabled() ?? true,
      // Spec 028 (FR-025; plan.md R-B6): only once the dinosaur's scene has ended or been cut, or at once where the
      // scene has no `figures.leave`; the Eat box stays reserved from the visit's start (spec 024's FR-012, Q150).
      sceneDone: part.figures.leave === undefined || dino?.scene.phase === "gone" || dino?.scene.phase === "cut",
    };
  };
  /** The edible placement the walking figure reaches, or null. */
  const eatReached = (pose: Pose | null): string | null => (pose && eats ? edibleReach(pose, edible, eatReach) : null);
  /** A press, by key B or the tile: a bite where the gate takes it. */
  const eatPress = (pose: Pose | null): void => {
    if (!meal || !eat3d) return;
    const piece = eatTarget(eatBase(), eatReached(pose), meal, (id) => modelOf(id) !== null);
    if (piece !== null) eat3d.bite(piece);
  };
  let eatOffered = false;
  /** FR-009: the eating's one pause, while the room is paused (the toggle, or the page hidden) or the loader shows; the
   *  3D side reads it too. The room calls it on each change (eat.sync()), since a hidden page draws no frames while the
   *  clock runs on (rv-rework-024's I-A); each frame reads it again, as a backstop. */
  const eatSync = (): void => {
    if (!meal) return;
    const base = eatBase();
    if (base.paused || base.loading) meal.pause();
    else meal.resume();
  };
  /** Each frame: the meal's pause, the flights and regrowths, and the tile's availability, told on a change. */
  const eatFrame = (): void => {
    if (!meal || !eat3d) return;
    eatSync();
    const base = eatBase();
    eat3d.frame();
    const pose = walking?.on ? walking.pose : null;
    const on = eatingAvailable(availabilityFor(base, eatReached(pose), meal, (id) => modelOf(id) !== null));
    if (on !== eatOffered) {
      eatOffered = on;
      eatingRoom?.available?.(on);
    }
  };
  const leaveWalk = (): void => {
    if (!walking?.on) return;
    // Spec 024's edge case: leaving walking during a flight lands the chunk at once (rework-024, nit 1).
    eat3d?.settle();
    input.unbind();
    walking.leave(clock.now());
    returning = true;
  };
  const walking =
    walkable && figure
      ? createWalking({
          floor: walkable,
          data: part.walking,
          boxes,
          targets: reachTargets(part, options.room),
          figure,
          picker: { setCamera: (c, stage) => picker.setCamera(c, stage), pick: picker.pick },
          reach: (id) => options.target?.("reach", id),
          select: options.select,
          target: () => highlight.target,
          escape: () => {
            leaveWalk();
            options.walkEnded?.("escape");
          },
          // Spec 014 (FR-032 (b); plan.md PD-11): the visitor figure's framed box moved to its pose, projected at the
          // camera into the area and onto the canvas, against the HUD's compact boxes and the window's edge.
          nearsEdge: (camera, pose, stage) => {
            if (!visitorBox || hud.length === 0) return false;
            const moved = poseBox(visitorBox, floorStart, pose);
            const r = memberRect(moved, camera, { w: stage.w, h: stage.h });
            if (!r) return false;
            const box = { x: area.x + r.rect[0], y: area.y + r.rect[1], w: r.rect[2], h: r.rect[3] };
            return nearsEdge(box, hud, size, rem);
          },
          held: (state, cause) => options.walkHeld?.(state, cause),
          ...(eats ? { eat: (pose: Pose) => eatPress(pose) } : {}),
        })
      : null;
  /** The box the room is framed into, in the canvas's CSS pixels: since spec 014 the room's frame area (its FR-009 to
   *  FR-015; contracts/frame-area.md §7), else spec 005's clear area (its FR-015; plan.md §5), or the whole canvas where
   *  the room gives neither (the stacked layout). */
  let area: Box = { x: 0, y: 0, w: 0, h: 0 };
  /** The HUD's compact boxes over the window, in the canvas's CSS pixels, while the room gives a frame (spec 014): what
   *  the picker reserves, and what a point under one picks: nothing. */
  let hud: readonly Box[] = [];
  /** The root font size the room's metrics gave with the frame, for the hold's 0.5rem (spec 014). */
  let rem = 16;
  /** The area's size, the stage the kernel's framing, the picker, and the walking view measure, with the HUD boxes over
   *  it reserved in its pixels (FR-060); spec 005's walking control's box where the room gives no frame. */
  let reserved: readonly Rect[] | undefined;
  const areaStage = (): { w: number; h: number; reserved?: readonly Rect[] } =>
    reserved === undefined ? { w: area.w, h: area.h } : { w: area.w, h: area.h, reserved };
  /** The camera's projection shifted so the area's frustum spans the canvas at its own scale (PD-12): the room in the
   *  area, the scene continuing behind the panels. An area that is the canvas needs no shift. */
  const shift = (): void => {
    if (fillsCanvas(area, size)) {
      if (camera.view?.enabled) camera.clearViewOffset();
      return;
    }
    const o = viewOffsetFor(area, size);
    camera.setViewOffset(o.fullWidth, o.fullHeight, o.x, o.y, o.width, o.height);
  };
  /** A camera of the kernel's on the stage's camera. */
  const applyCamera = (spec: ViewCamera, aspect: number): void => {
    camera.fov = spec.fov;
    camera.aspect = aspect;
    camera.near = spec.near;
    camera.far = spec.far;
    camera.up.set(0, 1, 0);
    camera.position.set(...spec.position);
    camera.lookAt(...spec.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };
  /** A step that threw: the walk ends at the production framing, the figure at its place, and the room is told
   *  (FR-005), so the scene is never left blank or frozen. */
  const failWalk = (): void => {
    eat3d?.settle();
    input.unbind();
    try {
      walking?.leave(clock.now());
    } catch {
      // Its own leave failing too: the camera goes back below all the same.
    }
    returning = false;
    if (size.w > 0 && size.h > 0) {
      frameCamera(camera, area.w / area.h, boxes);
      shift();
      picker.setCamera(null, areaStage());
    }
    options.walkEnded?.("failed");
  };
  let lastTime: number | null = null;
  // A point of the canvas picks and walks in the area's own coordinates, where the picker's areas are RG6's; a point
  // outside it, under a panel or a safe area, picks nothing (spec 005, PD-13). Since spec 014 a point under a HUD box
  // picks nothing either: the box takes its own pointer in the page (its FR-014), and the stage holds to that too.
  const inArea = (ndc: { x: number; y: number }): { x: number; y: number } | null => {
    const px = ((ndc.x + 1) / 2) * size.w;
    const py = ((1 - ndc.y) / 2) * size.h;
    if (hud.some((b) => px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h)) return null;
    return clearNdc(ndc, size, area);
  };
  const unbind = bindPointerSelection(
    canvas,
    (ndc) => {
      const at = inArea(ndc);
      return at ? picker.pick(at) : null;
    },
    options.select,
    options.target,
    (ndc) => {
      const at = inArea(ndc);
      if (walking?.on && at) input.miss(at);
    },
  );

  let size = { w: 0, h: 0, ratio: 0 };
  const same = (a: Box, b: Box): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  /**
   * The canvas at the window (spec 005, FR-010 to FR-012; plan.md §4.2, §4.4): its buffer at bufferRatio, within the
   * level's pixel cap; the camera framed at the clear area's aspect and shifted into it; the picker's areas in the clear
   * area; the look's lines at the canvas's height; and the highlight's band at the canvas's size, in CSS pixels on
   * screen at any ratio. Read each frame, so a re-fit shows on the next one. The camera, the pick areas, and the ink's
   * width follow the stage, all from the same framing of the same boxes.
   */
  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const ratio = bufferRatio(win.devicePixelRatio || 1, settings, w, h);
    // The room's frame area while the canvas is the window it was computed for (spec 014), its clear area where the
    // frame area isn't finite (FR-004), or spec 005's clear area where the room gives no frame; else the whole canvas.
    let framed: FrameGiven | null;
    try {
      framed = options.frame?.() ?? null;
    } catch {
      framed = null;
    }
    const given = framed
      ? { area: usable(framed.area) ? framed.area : framed.clear, window: framed.window }
      : (options.clear?.() ?? null);
    const fits =
      given !== null &&
      Math.abs(given.window.w - w) <= 1 &&
      Math.abs(given.window.h - h) <= 1 &&
      given.area.w > 0 &&
      given.area.h > 0;
    const next: Box = fits ? given.area : { x: 0, y: 0, w, h };
    const nextHud: readonly Box[] = fits && framed ? framed.hud : [];
    // Spec 024 (rework-024, I-1; page Q215): in the stacked layout, where the room gives neither a frame nor a clear area
    // and the canvas is its own stage, a dinosaur visit reserves the "Eat" tile's box beside the walking control's, where
    // room.css puts the tile. A HUD layout mid-resize (its frame given for another window) also frames the whole canvas
    // until the re-fit, but its tile sits at the HUD's Eat box, so it reserves as every other visit does: the picker's
    // fallback, the walking control's box alone, as before (rework2-024, N-3).
    const stacked = given === null;
    const nextReserved =
      fits && framed
        ? reservedIn(next, nextHud)
        : stacked && eats
          ? reservedBoxes(next, undefined, { eat: true })
          : undefined;
    if (
      w === size.w &&
      h === size.h &&
      ratio === size.ratio &&
      same(next, area) &&
      JSON.stringify(nextReserved) === JSON.stringify(reserved)
    )
      return;
    size = { w, h, ratio };
    area = next;
    hud = nextHud;
    rem = fits && framed ? (framed.rem ?? 16) : 16;
    reserved = nextReserved;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    if (!walking?.on && !returning) frameCamera(camera, area.w / area.h, boxes);
    shift();
    picker.resize(areaStage());
    ink.setStageHeight(h);
    highlight.setStage(w, h);
  };

  let frame = 0;
  let level = 0;
  let last: number | null = null;
  /** Spec 028 (FR-020, FR-027; plan.md R-B5): the speech bubble over the twin, made at its first words. */
  let bubble: Bubble | null = null;
  const reducedNow = (): boolean => (options.motion ? options.motion.reducedMotion : options.reducedMotion);
  /** The twin's speaking time for a line (spec 016's speak_wpm within speak_s; the defaults where the part has no twin
   *  block). */
  const speaking = (text: string): number =>
    speakingSeconds(
      text,
      part.twin?.block.speak_wpm ?? SPEAK_DEFAULTS.speak_wpm,
      part.twin?.block.speak_s ?? SPEAK_DEFAULTS.speak_s,
    );
  /** Shows a line in the bubble over the twin for `seconds`, its host the canvas's container. */
  const say = (text: string, seconds: number): void => {
    if (disposed) return;
    const host = canvas.parentElement;
    if (!host) return;
    if (!bubble || bubble.element.parentElement !== host) {
      bubble?.dispose();
      bubble = createBubble(doc, host);
    }
    bubble.show(text, seconds, clock.now(), { reduced: reducedNow() });
  };
  const head = new Vector3();
  /** The bubble at the twin's head, projected by the room's camera, clamped inside the frame area. */
  const placeBubble = (): void => {
    if (!bubble?.shown) return;
    bubble.tick(clock.now());
    if (!bubble.shown) return;
    const picture = figures?.pictureOf("twin") ?? room.twin;
    picture.updateWorldMatrix(true, false);
    head.setFromMatrixPosition(picture.matrixWorld);
    head.y += part.figures.twin_height + 0.1;
    head.project(camera);
    const x = canvas.offsetLeft + ((head.x + 1) / 2) * size.w;
    const y = canvas.offsetTop + ((1 - head.y) / 2) * size.h;
    bubble.place(x, y, { x: canvas.offsetLeft + area.x, y: canvas.offsetTop + area.y, w: area.w, h: area.h });
  };
  const loop = (time: number): void => {
    if (disposed) return;
    options.onFrame(time);
    // The controller may have switched the room to 2D, which disposes this stage.
    if (disposed) return;
    resize();
    // Idle sway only while the motion store animates: paused, reduced motion, or a hidden page show its final frame,
    // still, and the loop keeps drawing (spec 004, FR-059, FR-060; R-34). An avatar the twin shows has its own idle,
    // so the stand-in's sway stops (spec 009).
    const moving = animating().animate;
    // The walking view's frame before drawing (spec 008, FR-022 to FR-035): its camera, or the way back from it.
    const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    if (walking && size.w > 0 && size.h > 0) {
      // The walking view measures the frame area, and its follow camera takes the production camera's shift, so the
      // figure stays centred in it (spec 005, FR-018; spec 014, FR-034).
      const stage = areaStage();
      if (walking.on) {
        try {
          applyCamera(walking.frame(input.take(dt, rates), stage, time, dt, moving), area.w / area.h);
        } catch {
          failWalk();
        }
      } else if (returning) {
        const back = walking.returning(stage, time, moving);
        if (back) applyCamera(back, area.w / area.h);
        else {
          returning = false;
          frameCamera(camera, area.w / area.h, boxes);
          shift();
          picker.setCamera(null, stage);
        }
      }
    }
    // Spec 025's run (its FR-001 to FR-024) and spec 026's petting (its FR-001) no longer start in the room (spec 028,
    // FR-028; Q10, Q17): the run's shell and the pet director aren't made for any visit; their modules stay, unwired.
    // Spec 028 (FR-019 to FR-026; plan.md R-B3): the dinosaur's scene in their place, after the walking view's pose and
    // before the figures' clips; paused (or a hidden page) apart from reduced motion, which cuts it.
    const leave = part.figures.leave;
    if (!dino && figures && handedOff && options.avatar === EATER && leave) {
      const avatars = figures;
      dino = createDinoFigures({
        leave,
        avatars,
        takenNode: room.placements.get(leave.takes) ?? null,
        root: room.scene,
        chosen: options.avatar,
        handedOff: () => handedOff,
        callSeconds: () =>
          Math.max(
            speaking(uiWord(options.room.ui, "figures.dino_call") ?? ""),
            avatars.clipOf("twin", "greeting")?.duration ?? 0,
          ),
        call: () => {
          const words = uiWord(options.room.ui, "figures.dino_call");
          if (words) say(words, Math.max(speaking(words), avatars.clipOf("twin", "greeting")?.duration ?? 0));
          options.onFigure?.({ kind: "dino-call" });
        },
        left: (who) => options.onFigure?.({ kind: "dino-left", who }),
      });
    }
    dino?.frame(dt, { animate: moving, paused: !moving && !reducedNow(), level, reduced: reducedNow() });
    const sway = settings.animations && moving && !figures?.shows("twin");
    room.twin.rotation.z = sway ? Math.sin(time / 900) * 0.015 : 0;
    // The figures' clips advance only while the motion store animates (spec 009, FR-025 to FR-027).
    figures?.update(last === null ? 0 : Math.max(0, time - last), moving, level);
    last = time;
    faces.frame(time);
    glows.frame(time);
    eatFrame();
    placeBubble();
    // The highlight after the look's frame, whatever the quality level does to its ink lines (spec 008, FR-017), and
    // the labels after the highlight (FR-019).
    drawFrame({
      renderer,
      scene: room.scene,
      camera,
      highlight,
      labels: room.labels.size > 0,
      drawRoom: () => ink.render(room.scene, camera),
    });
    frame = clock.requestFrame(loop);
  };
  drawHandoff(room, 0, options.reducedMotion);
  frame = clock.requestFrame(loop);

  return {
    mode: "3d",
    element: canvas,
    canvas,
    // Spec 014 (FR-010, FR-016): the frame area's protector over this part, which the room's re-fit takes.
    // Spec 024 (Q150, A2): a dinosaur visit's protector reserves the "Eat" tile's box from the visit's start, so the
    // framing doesn't move when the tile shows or hides.
    protect: protectorFor(protectSceneOf(part, options.room), undefined, { eat: eats }),
    showHandoff(progress) {
      // Its first call is the hand-off's start: no figure file or set model parses from then until it ends (R-10), if
      // the loader's giving way hasn't closed the gate already (spec 012).
      close();
      if (figures) figures.showHandoff(progress, options.reducedMotion);
      else drawHandoff(room, progress, options.reducedMotion);
    },
    figures: figuresReady,
    waitMs: part.figures.wait_ms,
    expected,
    // Spec 028 (FR-027; plan.md R-B5, R-B7): a line in the bubble over the twin, for its seconds.
    say(text, seconds) {
      say(text, seconds ?? speaking(text));
    },
    // Spec 016 (FR-022): the conversation's activity, to the twin's states; nothing before the figures' chunk loads.
    twinActivity(activity) {
      figures?.twinActivity(activity);
    },
    apply(value) {
      // The case shows on the next frame the loop draws (spec 004, FR-042, FR-043; scene/cables.ts), its glows with it.
      room.cases.apply(value);
    },
    setText(text) {
      faces.setText(text);
      // The shirt's words have come: the twin's own model, if it shows, takes them (spec 016, FR-036).
      figures?.redress();
    },
    setCost(state) {
      faces.setCost(state);
    },
    setTarget(id) {
      highlight.setTarget(id);
    },
    // Spec 008's walking view (T051): entered and left by the room's walking control, Escape reported through
    // walkEnded, as a failed step is.
    walk: {
      get walking() {
        return walking?.on ?? false;
      },
      enter(focus) {
        if (!walking || walking.on) return;
        // The kept paper into the figure's hand: the driver's, where it has one (spec 009's avatar), else the cut-out's.
        if (figure?.hold) figure.hold(room.paper.kept);
        else keepPaper(room);
        input.bind(focus);
        returning = false;
        walking.enter(clock.now());
      },
      leave: leaveWalk,
    },
    // Spec 024 (FR-012): the "Eat" tile's press, the key's gate; absent where the visit can't eat.
    ...(eats ? { eat: { press: () => eatPress(walking?.on ? walking.pose : null), sync: eatSync } } : {}),
    setQuality(next) {
      const before = settings.shadows;
      level = next;
      settings = qualitySettings(next);
      renderer.shadowMap.enabled = settings.shadows;
      ink.setOutlines(settings.outlines);
      labels.setScale(settings.textureScale);
      faces.setLevel(next);
      glows.setEnabled(settings.glowCards);
      if (before !== settings.shadows) {
        room.scene.traverse((node) => {
          const material = (node as Partial<Mesh>).material;
          for (const m of ([] as Material[]).concat((material as Material | Material[] | undefined) ?? [])) {
            m.needsUpdate = true;
          }
        });
      }
      size = { w: 0, h: 0, ratio: 0 };
    },
    dispose() {
      leaving = true;
      disposed = true;
      clock.cancelFrame(frame);
      unbind();
      input.unbind();
      loader?.stop();
      figures?.dispose();
      dino?.dispose();
      bubble?.dispose();
      canvas.removeEventListener("webglcontextrestored", restored);
      faces.dispose();
      glows.dispose();
      highlight.dispose();
      // Spec 024 (rework-024, nit 3): what the eating built, a split out of the scene included, which disposeRoom's
      // walk of the scene can't reach.
      eat3d?.dispose();
      disposeRoom(room);
      renderer.dispose();
      canvas.remove();
    },
  };
}
