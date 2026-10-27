// The look (spec 004; FR-005, FR-022, FR-070; R-27; contracts/room-data-files.md §10): how the room shades what it
// draws, from the 3D part's `look`, which lookdev chooses and ADR 0010 records. Inked cel, the default (the Author's
// answer 2, "Inked cel is fine"), is lit at run time: MeshToonMaterial over a ramp of `shading.steps` bands, and
// three.js's OutlineEffect drawing the ink lines in the look's outline colour and width. `painted` and `flat` draw
// unlit, in base colours; a model's materials take the look through `model()`, which the loader applies (R-28):
// `painted` draws its textures, `flat` its base colours alone, and inked cel both on its ramp. The lights are
// the look's: a hemisphere of its sky and ground for the ambient, and a directional key shining from `from`, which
// casts shadows when the look says so. Nothing is baked (FR-022): no light, shadow, or occlusion map, no emissive
// colour, and no outline geometry; every shade comes from the lights and the ramp as each frame is drawn.
//
// Readings beside the contract's words (plan.md §10):
// - A colour is a palette name of the look or #rrggbb (RI4). The 3D part resolves a shape's, but keeps the outline's
//   as the data gives it, so it's resolved here.
// - `outlines.width` is in CSS pixels of the stage's height. OutlineEffect's thickness is in normalized device units,
//   so it's 2 × width ÷ the stage's height: a line along the view's width is `width` pixels thick, and one along its
//   height `width` × the aspect, as the effect draws it.
// - The ramp's bands run evenly from none of the key light to all of it, so the darkest is the ambient alone, as a
//   cast shadow is.
// - The key's shadow camera holds a sphere around the box it's given, the room's pieces.
import {
  Color,
  DataTexture,
  DirectionalLight,
  FrontSide,
  HemisphereLight,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
} from "three";
import type { Camera, Material, Mesh, MeshStandardMaterial, Object3D, Scene, Side, WebGLRenderer } from "three";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";

import type { Look } from "../compose/bundle";
import type { Box } from "../compose/framing";
import { length, normalize, sub } from "../compose/math";
import type { Vec3 } from "../compose/math";
import { REFERENCE_DESKTOP } from "../compose/stages";

/** A colour by value, as the data writes one: lowercase #rrggbb (contracts/room-data-files.md §2). */
const HEX = /^#[0-9a-f]{6}$/;
/** What a colour that is neither falls to: the compositor's stand-ins take black too. */
const FALLBACK = "#000000";
/** The key's shadow map, a side in texels: spec 002's. */
const SHADOW_MAP = 1024;
/** How far outside the room's sphere the key stands, and the room its shadow camera's planes leave, in metres. */
const KEY_CLEARANCE = 1;
const SHADOW_SLACK = 0.5;

/** A colour of the look: a palette name resolved, #rrggbb kept, and anything else (RI4 refuses it) black. */
export function colourOf(look: Look, value: string): string {
  if (HEX.test(value)) return value;
  return Object.hasOwn(look.palette, value) ? (look.palette[value] as string) : FALLBACK;
}

/** Inked cel's ramp: `steps` texels, evenly from 0 to full, sampled nearest so each band is flat. */
export function toonRamp(steps: number): DataTexture {
  const n = Math.max(2, Math.round(steps));
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) data[i] = Math.round((255 * i) / (n - 1));
  const ramp = new DataTexture(data, n, 1, RedFormat);
  ramp.minFilter = NearestFilter;
  ramp.magFilter = NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

export interface Materials {
  /** Whether the look shades what's lit, at run time: inked cel does; painted and flat draw everything unlit. */
  readonly shaded: boolean;
  /** The material for a colour (a palette name of the look or #rrggbb), lit or unlit, on a side: one of each, shared. */
  of(color: string, lit: boolean, side?: Side): Material;
  /**
   * A model's material in the look, from the one GLTFLoader made (R-28's "the look applied"): inked cel's toon
   * material over its base colour and texture, on the shared ramp; painted's unlit, its texture kept; flat's unlit, in
   * its base colour alone. Never shared or kept here: it goes with the model, its textures the model's own.
   */
  model(source: Material): Material;
  /** Releases every material made, and the ramp. */
  dispose(): void;
}

/** The look's materials: inked cel's toon material where a shape is lit, else an unlit one in its base colour. */
export function lookMaterials(look: Look): Materials {
  const shaded = look.method === "inked-cel";
  const made = new Map<string, Material>();
  let ramp: DataTexture | null = null;
  return {
    shaded,
    of(color, lit, side = FrontSide) {
      const hex = colourOf(look, color);
      const toon = shaded && lit;
      const key = `${hex} ${toon ? "toon" : "plain"} ${side}`;
      let material = made.get(key);
      if (!material) {
        material = toon
          ? new MeshToonMaterial({ color: hex, gradientMap: (ramp ??= toonRamp(look.shading.steps)), side })
          : new MeshBasicMaterial({ color: hex, side });
        made.set(key, material);
      }
      return material;
    },
    model(source) {
      const s = source as Partial<MeshStandardMaterial>;
      const base = {
        name: source.name,
        color: s.color?.clone() ?? new Color("#ffffff"),
        side: source.side,
        transparent: source.transparent,
        opacity: source.opacity,
        alphaTest: source.alphaTest,
        vertexColors: source.vertexColors,
      };
      if (look.method === "inked-cel")
        return new MeshToonMaterial({
          ...base,
          map: s.map ?? null,
          gradientMap: (ramp ??= toonRamp(look.shading.steps)),
        });
      return new MeshBasicMaterial(look.method === "painted" ? { ...base, map: s.map ?? null } : base);
    },
    dispose() {
      for (const material of made.values()) material.dispose();
      made.clear();
      ramp?.dispose();
      ramp = null;
    },
  };
}

export interface Lights {
  /** The ambient: a hemisphere of the look's sky and ground. */
  readonly ambient: HemisphereLight;
  /** The key, shining from `from` onto the box's centre; its target goes into the scene beside it. */
  readonly key: DirectionalLight;
}

/** The look's lights over a box of the room: the key stands outside a sphere around it, and its shadow camera holds
 *  that sphere. */
export function lookLights(look: Look, box: Box): Lights {
  const { ambient, key } = look.lights;
  const sky = new HemisphereLight(ambient.sky, ambient.ground, ambient.intensity);
  const sun = new DirectionalLight(key.color, key.intensity);
  const centre: Vec3 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  const radius = Math.max(length(sub(box.max, box.min)) / 2, SHADOW_SLACK);
  const from: Vec3 = length(key.from) > 0 ? normalize(key.from) : [0, 1, 0];
  const distance = radius + KEY_CLEARANCE;
  sun.position.set(centre[0] + from[0] * distance, centre[1] + from[1] * distance, centre[2] + from[2] * distance);
  sun.target.position.set(centre[0], centre[1], centre[2]);
  sun.castShadow = key.shadows;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const camera = sun.shadow.camera;
  [camera.left, camera.right, camera.top, camera.bottom] = [-radius, radius, radius, -radius];
  [camera.near, camera.far] = [distance - radius - SHADOW_SLACK, distance + radius + SHADOW_SLACK];
  camera.updateProjectionMatrix();
  return { ambient: sky, key: sun };
}

/** OutlineEffect's thickness, in normalized device units, for lines `width` CSS pixels thick on a stage this high. */
export function outlineThickness(width: number, stageHeight: number): number {
  return (2 * width) / stageHeight;
}

/** How a frame is drawn in the look: inked cel's through its ink lines, the others by the renderer alone. */
export interface Ink {
  /** Whether the look draws ink lines: inked cel's. */
  readonly outlined: boolean;
  /** Gives every drawn material in the scene the lines' one set of parameters, so a resize reaches them all: once
   *  after the room is built, and again when a model swaps in (User Story 3's loader in scene.ts, and the lookdev
   *  stage), never on each frame. */
  prepare(scene: Object3D): void;
  /** Draws a frame: the scene, then for inked cel its lines. */
  render(scene: Scene, camera: Camera): void;
  /** Keeps the lines the look's width on a stage this many CSS pixels high, from the next frame. */
  setStageHeight(height: number): void;
  /** Draws the lines or leaves them out, as the quality levels say (R-35). */
  setOutlines(on: boolean): void;
}

export function createInk(renderer: WebGLRenderer, look: Look): Ink {
  if (look.method !== "inked-cel")
    return {
      outlined: false,
      prepare: () => undefined,
      render: (scene, camera) => renderer.render(scene, camera),
      setStageHeight: () => undefined,
      setOutlines: () => undefined,
    };
  // One set of parameters every drawn material shares once `prepare` has run, a model's swapped in later included, so
  // a resize reaches all.
  const lines = { thickness: outlineThickness(look.outlines.width, REFERENCE_DESKTOP.stage.h) };
  const effect = new OutlineEffect(renderer, {
    defaultThickness: lines.thickness,
    defaultColor: new Color(colourOf(look, look.outlines.color)).toArray(),
  });
  const share = (node: Object3D): void => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    for (const material of ([] as Material[]).concat(mesh.material))
      if (material.userData.outlineParameters !== lines) material.userData.outlineParameters = lines;
  };
  return {
    outlined: true,
    prepare(scene) {
      scene.traverse(share);
    },
    render(scene, camera) {
      effect.render(scene, camera);
    },
    setStageHeight(height) {
      if (height > 0) lines.thickness = outlineThickness(look.outlines.width, height);
    },
    setOutlines(on) {
      effect.enabled = on;
    },
  };
}
