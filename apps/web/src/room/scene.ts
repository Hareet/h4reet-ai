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
  keepPaper,
  selectablePicker,
  showHandoff as drawHandoff,
} from "./scene/bundle3d";
import { floorOfPart } from "./compose/floor";
import type { Camera as ViewCamera } from "./compose/project";
import { cutoutDriver } from "./scene/figure";
import { createWalking } from "./scene/walking";
import { createWalkInput } from "./walk/input";
import { reachTargets } from "./walk/reach";
import type { LabelFactory } from "./scene/bundle3d";
import type { AvatarFigures } from "./scene/avatars";
import { buildFaceQuads } from "./scene/faces3d";
import { buildGlows } from "./scene/glows";
import { LABEL_LAYER, createHighlight, drawFrame } from "./scene/highlight";
import { createTextureLedger } from "./scene/ledger";
import type { Loader } from "./scene/loader";
import { qualitySettings } from "./scene/levels";
import { createInk } from "./scene/look";
import type { SceneOptions, Stage3D } from "./stage";

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
  const room = buildRoom(part, { avatar: options.avatar, label: labels.factory, index: options.room });
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
  const highlight = createHighlight({ room, style: part.look.highlight, members: (id) => members.get(id) ?? [] });

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
  let leaving = false;
  const bundled = (id: string | null): boolean => id !== null && Object.hasOwn(part.avatars, id);
  const wantsAvatars = bundled(part.figures.stand_in) || bundled(options.avatar);
  if (part.load_order.length > 0 || wantsAvatars)
    void Promise.all([import("./scene/loader"), wantsAvatars ? import("./scene/avatars") : null])
      .then(([{ createLoader, figureEntries, modelEntries, prepareModel, showModel }, avatars]) => {
        const entries = modelEntries(part);
        const figureFiles = figureEntries(part, options.avatar);
        if (disposed || (entries.length === 0 && figureFiles.length === 0)) return;
        const atFloor = floor === undefined ? (): boolean => meetsModelFloor(capability(win)) : (): boolean => floor;
        figures =
          avatars?.createAvatarFigures(room, part, {
            chosen: options.avatar,
            ...(options.onFigure ? { signal: options.onFigure } : {}),
          }) ?? null;
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
            if (!own && !piece.startsWith("avatar:")) return;
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
        });
        void loader.loadFigures(figureFiles, figuresFetched);
        void loader.load(entries);
        // The kept paper goes to the visitor's holding hand once the hand-off ends (R-09).
        void (options.handoff ?? Promise.resolve()).then(() => figures?.handoffEnded());
      })
      .catch(() => {
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
  const picker = selectablePicker(part, options.room);
  // Spec 008's walking view (T051): the walkable floor and the figure's driver from the 3D part, the input over the
  // canvas, and the orchestrator, which reach and the walking control's room callbacks reach the room through. Where
  // the part gives no floor or no figure, there is no walking view, and entering does nothing.
  const walkable = floorOfPart(part, part.walking.radius_m);
  const visitorNode = room.placements.get(part.figures.visitor);
  const figure = visitorNode ? cutoutDriver({ node: visitorNode, picture: room.visitor }) : null;
  const input = createWalkInput(canvas, win);
  const rates = { turn: (part.walking.turn_dps * Math.PI) / 180, tilt: (part.walking.tilt_dps * Math.PI) / 180 };
  let returning = false;
  const leaveWalk = (): void => {
    if (!walking?.on) return;
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
        })
      : null;
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
    input.unbind();
    try {
      walking?.leave(clock.now());
    } catch {
      // Its own leave failing too: the camera goes back below all the same.
    }
    returning = false;
    if (size.w > 0 && size.h > 0) {
      frameCamera(camera, size.w / size.h, boxes);
      picker.setCamera(null, { w: size.w, h: size.h });
    }
    options.walkEnded?.("failed");
  };
  let lastTime: number | null = null;
  const unbind = bindPointerSelection(canvas, picker.pick, options.select, options.target, (ndc) => {
    if (walking?.on) input.miss(ndc);
  });

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
    highlight.setStage(w, h);
  };

  let frame = 0;
  let level = 0;
  let last: number | null = null;
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
      const stage = { w: size.w, h: size.h };
      if (walking.on) {
        try {
          applyCamera(walking.frame(input.take(dt, rates), stage, time, dt, moving), size.w / size.h);
        } catch {
          failWalk();
        }
      } else if (returning) {
        const back = walking.returning(stage, time, moving);
        if (back) applyCamera(back, size.w / size.h);
        else {
          returning = false;
          frameCamera(camera, size.w / size.h, boxes);
          picker.setCamera(null, stage);
        }
      }
    }
    const sway = settings.animations && moving && !figures?.shows("twin");
    room.twin.rotation.z = sway ? Math.sin(time / 900) * 0.015 : 0;
    // The figures' clips advance only while the motion store animates (spec 009, FR-025 to FR-027).
    figures?.update(last === null ? 0 : Math.max(0, time - last), moving, level);
    last = time;
    faces.frame(time);
    glows.frame(time);
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
    showHandoff(progress) {
      drawHandoff(room, progress, options.reducedMotion);
    },
    apply(value) {
      // The case shows on the next frame the loop draws (spec 004, FR-042, FR-043; scene/cables.ts), its glows with it.
      room.cases.apply(value);
    },
    setText(text) {
      faces.setText(text);
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
      canvas.removeEventListener("webglcontextrestored", restored);
      faces.dispose();
      glows.dispose();
      highlight.dispose();
      disposeRoom(room);
      renderer.dispose();
      canvas.remove();
    },
  };
}
