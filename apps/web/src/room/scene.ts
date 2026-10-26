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
// the labels it draws on sprites, and the quality levels, and neither of the last two needs a renderer to test.
import {
  CanvasTexture,
  Object3D,
  PerspectiveCamera,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
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
  selectablePicker,
  showHandoff as drawHandoff,
} from "./scene/bundle3d";
import type { LabelFactory } from "./scene/bundle3d";
import { createTextureLedger } from "./scene/ledger";
import type { Loader } from "./scene/loader";
import { createInk } from "./scene/look";
import type { SceneOptions, Stage3D } from "./stage";

/** A label without a renderer: an empty node with the label's name, for the tests and a page with no 2D canvas. */
const namedLabel: LabelFactory = (text) => {
  const node = new Object3D();
  node.name = `label:${text}`;
  return node;
};

export interface QualitySettings {
  /** The most device pixels a CSS pixel gets. */
  pixelRatio: number;
  shadows: boolean;
  /** The look's outlines (spec 004, R-35). */
  outlines: boolean;
  /** The glow cards (spec 004, R-35). */
  glowCards: boolean;
  /** The terminal's typing, in redraws a second; 0 shows its final frame (spec 004, R-35, R-37). */
  typingFps: number;
  /** The live faces' canvas resolution, as a share (spec 004, R-35, R-37). */
  faceScale: number;
  /** The labels' texture resolution, as a share (the placeholders' only textures): R-35's label scale. */
  textureScale: number;
  /** The twin's idle sway: R-35's idle sway. */
  animations: boolean;
}

const LEVELS: readonly QualitySettings[] = [
  {
    pixelRatio: 2,
    shadows: true,
    outlines: true,
    glowCards: true,
    typingFps: 15,
    faceScale: 1,
    textureScale: 1,
    animations: true,
  },
  {
    pixelRatio: 1.25,
    shadows: true,
    outlines: true,
    glowCards: true,
    typingFps: 15,
    faceScale: 1,
    textureScale: 1,
    animations: true,
  },
  {
    pixelRatio: 1,
    shadows: false,
    outlines: false,
    glowCards: false,
    typingFps: 8,
    faceScale: 1,
    textureScale: 1,
    animations: true,
  },
  {
    pixelRatio: 0.75,
    shadows: false,
    outlines: false,
    glowCards: false,
    typingFps: 0,
    faceScale: 0.5,
    textureScale: 0.5,
    animations: false,
  },
];

/**
 * R-04's steps: the pixel ratio first, then shadows, then textures and animations. Spec 004's R-35 (Amendment B13)
 * steps the outlines and glow cards with the shadows, the typing at quality 2 and 3, and the faces with the textures,
 * still in four levels.
 */
export function qualitySettings(level: number): QualitySettings {
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, Math.round(level)))] as QualitySettings;
}

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
  const room = buildRoom(part, { avatar: options.avatar, label: labels.factory, index: options.room });
  const canvas = doc.createElement("canvas");
  canvas.className = "room-canvas";
  canvas.setAttribute("aria-hidden", "true");
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true });
  } catch (error) {
    disposeRoom(room);
    throw error;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const ink = createInk(renderer, part.look);
  ink.prepare(room.scene);

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
  if (part.load_order.length > 0)
    void import("./scene/loader")
      .then(({ createLoader, modelEntries, prepareModel, showModel }) => {
        const entries = modelEntries(part);
        if (disposed || entries.length === 0) return;
        loader = createLoader({
          clock,
          fetch: (url, init) => win.fetch(url, init),
          decode: (source, o) => win.createImageBitmap(source, o),
          floor: floor === undefined ? () => meetsModelFloor(capability(win)) : () => floor,
          figures: Promise.resolve(),
          handoff: options.handoff ?? Promise.resolve(),
          hold: options.hold ?? (() => () => undefined),
          level: options.level ?? (() => 0),
          mode: options.mode ?? (() => "3d"),
          record: options.assets ?? (() => undefined),
          ledger: createTextureLedger(part.scene_texture_bytes),
          uploader: renderer,
          prepare: (piece, model) => {
            const own = Object.hasOwn(part.pieces, piece) ? part.pieces[piece] : undefined;
            if (!own) return;
            prepareModel(model, own, part.look, room.materials);
            // The lines' one set of parameters, the stand-ins', so the stage's height reaches the model's too.
            ink.prepare(model);
          },
          swap: (piece, model) => showModel(room, part, piece, model),
        });
        void loader.load(entries);
      })
      .catch(() => {
        if (disposed) return;
        const outcome = floor === false ? "skipped" : "failed";
        for (const asset of options.room.models)
          options.assets?.(assetEvent({ asset, outcome, ms: 0, bytes: 0, mode: options.mode?.() ?? "3d" }));
      });
  // A restored context lost the models' textures, whose bitmaps were closed: back to stand-ins, and loaded again.
  const restored = (): void => void loader?.reload();
  canvas.addEventListener("webglcontextrestored", restored);

  let settings = qualitySettings(0);
  const camera = new PerspectiveCamera();
  const boxes = framedBoxes(part);
  frameCamera(camera, 16 / 9, boxes);
  const picker = selectablePicker(part, options.room);
  const unbind = bindPointerSelection(canvas, picker.pick, options.select);

  let size = { w: 0, h: 0, ratio: 0 };
  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ratio = Math.min(win.devicePixelRatio || 1, settings.pixelRatio);
    if (!w || !h || (w === size.w && h === size.h && ratio === size.ratio)) return;
    size = { w, h, ratio };
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    // The camera, the pick areas, and the ink's width follow the stage, all from the same framing of the same boxes.
    frameCamera(camera, w / h, boxes);
    picker.resize({ w, h });
    ink.setStageHeight(h);
  };

  let frame = 0;
  const loop = (time: number): void => {
    if (disposed) return;
    options.onFrame(time);
    // The controller may have switched the room to 2D, which disposes this stage.
    if (disposed) return;
    resize();
    room.twin.rotation.z = settings.animations && !options.reducedMotion ? Math.sin(time / 900) * 0.015 : 0;
    ink.render(room.scene, camera);
    frame = clock.requestFrame(loop);
  };
  drawHandoff(room, 0, options.reducedMotion);
  frame = clock.requestFrame(loop);

  return {
    mode: "3d",
    element: canvas,
    canvas,
    showHandoff(progress) {
      drawHandoff(room, progress, options.reducedMotion);
    },
    setQuality(level) {
      const before = settings.shadows;
      settings = qualitySettings(level);
      renderer.shadowMap.enabled = settings.shadows;
      ink.setOutlines(settings.outlines);
      labels.setScale(settings.textureScale);
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
      disposed = true;
      clock.cancelFrame(frame);
      unbind();
      loader?.stop();
      canvas.removeEventListener("webglcontextrestored", restored);
      disposeRoom(room);
      renderer.dispose();
      canvas.remove();
    },
  };
}
