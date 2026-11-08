// The 3D highlight (spec 008; FR-014 to FR-019, FR-049; plan.md R-07): the border the room's target shows, drawn at run
// time after the look's frame, in the lazy 3D chunk. Its colours and widths are the look's `highlight`, resolved by the
// compositor (FR-057), and lookdev judges them (SC-002).
// - What it borders: the target's members' draws (scene/bundle3d.ts's memberDraws), each mesh a member's placement
//   draws itself, its stand-in or its model, and nothing mounted on it. Each gets two proxies, one a pass, sharing the
//   mesh's own geometry (its positions and its index, never copied) with a hull normal of their own, and placed each
//   frame where the mesh stands; a mesh that doesn't show hides its proxies.
// - How: two passes, edge then band, each a back-face hull, as three's OutlineEffect draws the look's ink lines: the
//   faces facing away from the camera, each vertex pushed out in screen space, so the hull shows around the mesh's
//   silhouette and the mesh hides the rest; depth-tested, so whatever stands in front hides it, and not depth-written,
//   so the band, drawn second, lies cleanly over the edge. The edge's hull is the band's width plus its own, so the
//   edge shows as the outer frame. Two departures from the ink lines' extrusion, both so the border is exactly its CSS
//   pixels wide (plan.md §10): a hull normal at each vertex, the mean of every normal its position shares, so a
//   hard-edged box or model pushes its corners out whole, with no gap where its faces meet; and the push measured on
//   each axis of the stage, outlineThickness's normalized-device width for the stage's width and for its height, where
//   the ink lines use the height's on both, and so draw vertical lines the aspect's times too thick.
// - Its own material, never the look's OutlineEffect instance, which shares one set of parameters with every material,
//   turns off at quality 2 and 3 (R-35), and draws nothing in the painted and flat looks: so the highlight draws in
//   every look and at every quality level (FR-017), still (FR-018), and changes nothing in the room (FR-019).
// - Nothing without a target: no proxy, and no render call (FR-049). A new target takes its members' draws then;
//   refresh() takes them again after a model swaps in or falls back (the loader's swap), so the border follows what
//   the member draws now (FR-019).
import {
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import type { Camera } from "three";

import type { Highlight as HighlightStyle } from "../compose/bundle";
import { REFERENCE_DESKTOP } from "../compose/stages";
import { memberDraws } from "./bundle3d";
import type { Room3D } from "./bundle3d";
import { outlineThickness } from "./look";

/** The two passes' scenes, by name, in the order they're drawn. */
export const HIGHLIGHT_PASSES = ["highlight:edge", "highlight:band"] as const;

/** How finely positions are matched when their normals are summed: a hundredth of a millimetre. */
const MATCH = 1e5;

const VERTEX = /* glsl */ `
uniform vec2 thickness;
attribute vec3 hullNormal;
#include <common>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  vec4 clip = projectionMatrix * mvPosition;
  // Where the hull normal moves the point on screen, in units that make the push the same CSS pixels on both axes.
  vec4 along = projectionMatrix * vec4( normalMatrix * hullNormal, 0.0 );
  vec2 dir = ( along.xy * clip.w - clip.xy * along.w ) / thickness;
  float len = length( dir );
  if ( len > 1e-6 ) clip.xy += dir / len * thickness * clip.w;
  gl_Position = clip;
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 color;
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4( color, 1.0 );
  #include <colorspace_fragment>
}
`;

/** Each geometry's hull, made once and kept as long as the geometry: it shares the geometry's positions and index. */
const hulls = new WeakMap<BufferGeometry, BufferGeometry>();

/**
 * A geometry's hull for the highlight: its own positions and index, shared, and `hullNormal`, at each vertex the mean
 * of the normals of every vertex at its position, so a box's corner points out along its diagonal and the hull closes;
 * where those normals cancel, or the geometry has none, out from the geometry's centre. Made once a geometry.
 */
export function hullGeometry(source: BufferGeometry): BufferGeometry {
  const known = hulls.get(source);
  if (known) return known;
  const position = source.getAttribute("position");
  const normal = source.hasAttribute("normal") ? source.getAttribute("normal") : null;
  const count = position.count;
  const keys: string[] = [];
  const sums = new Map<string, Vector3>();
  const p = new Vector3();
  const n = new Vector3();
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < count; i += 1) {
    p.fromBufferAttribute(position, i);
    min.min(p);
    max.max(p);
    const key = `${Math.round(p.x * MATCH)},${Math.round(p.y * MATCH)},${Math.round(p.z * MATCH)}`;
    keys.push(key);
    let sum = sums.get(key);
    if (!sum) sums.set(key, (sum = new Vector3()));
    if (normal) sum.add(n.fromBufferAttribute(normal, i));
  }
  const centre = count > 0 ? min.clone().add(max).multiplyScalar(0.5) : new Vector3();
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    n.copy(sums.get(keys[i] as string) as Vector3);
    if (n.lengthSq() < 1e-12) n.fromBufferAttribute(position, i).sub(centre);
    n.normalize();
    out.set([n.x, n.y, n.z], i * 3);
  }
  const hull = new BufferGeometry();
  hull.setAttribute("position", position);
  if (source.index) hull.setIndex(source.index);
  hull.setAttribute("hullNormal", new Float32BufferAttribute(out, 3));
  hulls.set(source, hull);
  return hull;
}

/** What the highlight draws with: the renderer's render and its autoClear, which it turns off for its passes. */
export interface HighlightRenderer {
  autoClear: boolean;
  render(scene: Scene, camera: Camera): void;
}

export interface HighlightOptions {
  readonly room: Room3D;
  /** The look's highlight, resolved. */
  readonly style: HighlightStyle;
  /** A selectable's members, by its ID: the index's; none for an ID it doesn't list. */
  members(id: string): readonly string[];
}

export interface Highlight {
  /** The selectable bordered, or none. */
  readonly target: string | null;
  /** The meshes the passes border now: the target's draws that show. */
  readonly draws: readonly Mesh[];
  /** Borders a selectable's members' draws from the next frame drawn; null clears it. */
  setTarget(id: string | null): void;
  /** Takes the target's draws again: after a member's model swaps in, or falls back to its stand-in. */
  refresh(): void;
  /** The stage's size in CSS pixels: the passes' widths follow it from the next frame. */
  setStage(width: number, height: number): void;
  /** Draws the two passes, edge then band, after the look's frame; nothing, and no call, without a target. */
  render(renderer: HighlightRenderer, camera: Camera): void;
  /** Releases the passes' materials; the hulls stay with their geometries. */
  dispose(): void;
}

interface Pair {
  readonly source: Mesh;
  readonly proxies: readonly [Mesh, Mesh];
}

export function createHighlight(options: HighlightOptions): Highlight {
  const { room, style } = options;
  const pass = (name: string, color: string): { scene: Scene; material: ShaderMaterial } => {
    const scene = new Scene();
    scene.name = name;
    // The proxies' world matrices are their meshes', copied each frame: nothing recomputes them.
    scene.matrixWorldAutoUpdate = false;
    const material = new ShaderMaterial({
      name,
      uniforms: { color: { value: new Color(color) }, thickness: { value: new Vector2() } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: BackSide,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    return { scene, material };
  };
  const [edgeName, bandName] = HIGHLIGHT_PASSES;
  const edge = pass(edgeName, style.edge);
  const band = pass(bandName, style.band);
  let target: string | null = null;
  let pairs: Pair[] = [];

  const setStage = (width: number, height: number): void => {
    if (!(width > 0 && height > 0)) return;
    const outer = style.band_px + style.edge_px;
    (edge.material.uniforms.thickness?.value as Vector2).set(
      outlineThickness(outer, width),
      outlineThickness(outer, height),
    );
    (band.material.uniforms.thickness?.value as Vector2).set(
      outlineThickness(style.band_px, width),
      outlineThickness(style.band_px, height),
    );
  };
  setStage(REFERENCE_DESKTOP.stage.w, REFERENCE_DESKTOP.stage.h);

  /** Whether a mesh shows: it and every node above it visible, up to the room's scene. */
  const shown = (mesh: Mesh): boolean => {
    for (let node: typeof mesh.parent | Mesh = mesh; node; node = node.parent) {
      if (!node.visible) return false;
      if (node === room.scene) return true;
    }
    return false;
  };

  const proxy = (geometry: BufferGeometry, material: ShaderMaterial): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  };

  const take = (): void => {
    for (const { proxies } of pairs) for (const p of proxies) p.removeFromParent();
    pairs = [];
    if (target === null) return;
    for (const source of memberDraws(room, options.members(target))) {
      const geometry = hullGeometry(source.geometry);
      const proxies = [proxy(geometry, edge.material), proxy(geometry, band.material)] as const;
      edge.scene.add(proxies[0]);
      band.scene.add(proxies[1]);
      pairs.push({ source, proxies });
    }
  };

  return {
    get target() {
      return target;
    },
    get draws() {
      return pairs.filter((pair) => shown(pair.source)).map((pair) => pair.source);
    },
    setTarget(id) {
      if (id === target) return;
      target = id;
      take();
    },
    refresh: take,
    setStage,
    render(renderer, camera) {
      if (pairs.length === 0) return;
      for (const { source, proxies } of pairs) {
        const on = shown(source);
        if (on) source.updateWorldMatrix(true, false);
        for (const p of proxies) {
          p.visible = on;
          if (on) p.matrixWorld.copy(source.matrixWorld);
        }
      }
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      try {
        renderer.render(edge.scene, camera);
        renderer.render(band.scene, camera);
      } finally {
        renderer.autoClear = auto;
      }
    },
    dispose() {
      target = null;
      take();
      edge.material.dispose();
      band.material.dispose();
    },
  };
}
