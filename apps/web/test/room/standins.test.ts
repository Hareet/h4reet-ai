// T091 (spec 004; FR-005, FR-022, FR-057, FR-070; R-03, R-27; data-model.md §3's shape table; contracts/room-data-files.md
// §4.1, §10): the stand-ins' nine shapes, and the look they're drawn in, from compose()'s 3D part. Each shape builds its
// three.js geometry from data-model.md §3's size fields and stands at T(at) · R(turn) · S(scale) in its piece's frame,
// read as checks/rg.ts reads it: a cylinder and a capsule along Y, a capsule's length its cylinder part, a torus in the
// XY plane, a plane and a circle facing +Z, a tube's ends and a polygon's points in the shape's own frame, and a
// polygon's depth centred on z = 0. So a drawn shape lies inside the extent RG measured, and reaches it where the
// shape's extremes are vertices. Its colour is a palette name of the look or #rrggbb, and it's lit unless `lit: false`.
// The look (look.ts): inked cel as MeshToonMaterial over a ramp of `shading.steps`, its ink lines drawn by three.js's
// OutlineEffect in the outline's colour and width; painted and flat unlit in base colours; the look's lights; nothing
// baked. Every ID is a synthetic fx- one.
import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  ExtrudeGeometry,
  FrontSide,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  RedFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import type { BufferGeometry, Camera, Color, Material, Object3D, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import { shapeBox } from "../../build/room/checks/rg";
import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import { noPolicy } from "../../build/room/policy";
import type { StandinEntry } from "../../build/room/schema";
import type { Tree } from "../../build/room/source";
import type { Look, Shape } from "../../src/room/compose/bundle";
import type { Box } from "../../src/room/compose/framing";
import { length, multiply, normalize, rotation, sub, transformPoint, translation } from "../../src/room/compose/math";
import type { Mat4, Vec3 } from "../../src/room/compose/math";
import { STANDIN_SHAPES } from "../../src/room/compose/vocabulary";
import { colourOf, createInk, lookLights, lookMaterials, outlineThickness, toonRamp } from "../../src/room/scene/look";
import { shapeGeometry, standin, standinMesh } from "../../src/room/scene/standins";
import { goodFiles, overlay } from "../helpers/room-fixtures";

const decoder = new TextDecoder();
const text = (path: string): string => decoder.decode(goodFiles().get(path));
const SCENE = "apps/web/room/scene.yaml";
const LOOK = "apps/web/room/looks/fx-cel.yaml";
const TURNED = "fx-shapes";
const PLAIN = "fx-plain";

/** A catalog entry standing in with `shapes`, inside generous bounds. */
const piece = (id: string, shapes: string): string => `version: 1
id: ${id}
name: Fixture ${id.slice(3)}
size: { w: 1.2, h: 0.6, d: 0.4 }
origin:
  point: Fixture point at the centre of the shapes' foot
  bounds: { min: [-0.6, 0, -0.2], max: [0.6, 0.6, 0.2] }
standin:
${shapes}drawing: { from: standin }
budget: { gzip_bytes: 100000, triangles: 1000, texture_px: 256, texture_bytes: 349525 }
work_order:
  method: Fixture method for the shapes
  shots: [Fixture shot of the shapes]
  measurements: [Fixture measure of the shapes]
  studio_notes: Fixture studio notes for the shapes
`;

/** One shape of each kind, turned and scaled, its colour a palette name or #rrggbb, two of them unlit. */
const TURNED_SHAPES = `  - { shape: box, size: [0.1, 0.08, 0.06], at: [-0.5, 0.1, 0], turn: { y: 30 }, color: fx-wood }
  - { shape: cylinder, radius: 0.04, height: 0.1, at: [-0.35, 0.1, 0], turn: { x: 90 }, scale: [1, 2, 1], color: "#336699" }
  - { shape: capsule, radius: 0.03, length: 0.08, at: [-0.2, 0.1, 0], turn: { z: 45 }, color: fx-skin }
  - { shape: sphere, radius: 0.05, at: [-0.05, 0.1, 0], scale: [1, 0.5, 1], color: fx-glow, lit: false }
  - { shape: torus, radius: 0.04, tube: 0.01, at: [0.1, 0.1, 0], turn: { y: 90 }, color: fx-ink }
  - { shape: plane, size: [0.1, 0.06], at: [0.25, 0.1, 0.05], turn: { x: -20 }, color: fx-screen, lit: false }
  - { shape: circle, radius: 0.04, at: [0.4, 0.1, 0.05], scale: 1.5, color: "#aa3311" }
  - { shape: tube, from: [-0.05, -0.03, 0], to: [0.05, 0.04, 0.02], radius: 0.01, at: [0.5, 0.1, 0], turn: { y: 15, x: 10, z: 5 }, color: fx-wood }
  - { shape: polygon, points: [[0, 0], [0.06, 0], [0.03, 0.05]], depth: 0.02, at: [0, 0.3, 0], turn: { z: 180 }, scale: [2, 1, 1], color: fx-ink }
`;

/** Each kind unturned and unscaled, and a tube along each axis: every extreme along an axis is a vertex. */
const PLAIN_SHAPES = `  - { shape: box, size: [0.1, 0.08, 0.06], at: [-0.5, 0.1, 0], color: fx-wood }
  - { shape: cylinder, radius: 0.04, height: 0.1, at: [-0.4, 0.1, 0], color: fx-wood }
  - { shape: capsule, radius: 0.03, length: 0.08, at: [-0.3, 0.1, 0], color: fx-wood }
  - { shape: sphere, radius: 0.05, at: [-0.2, 0.1, 0], color: fx-wood }
  - { shape: torus, radius: 0.04, tube: 0.01, at: [-0.1, 0.1, 0], color: fx-wood }
  - { shape: plane, size: [0.1, 0.06], at: [0, 0.1, 0], color: fx-wood }
  - { shape: circle, radius: 0.04, at: [0.1, 0.1, 0], color: fx-wood }
  - { shape: tube, from: [-0.03, 0, 0], to: [0.03, 0, 0], radius: 0.01, at: [0.2, 0.1, 0], color: fx-wood }
  - { shape: tube, from: [0, -0.03, 0], to: [0, 0.03, 0], radius: 0.01, at: [0.3, 0.1, 0], color: fx-wood }
  - { shape: tube, from: [0, 0, -0.03], to: [0, 0, 0.03], radius: 0.01, at: [0.4, 0.1, 0], color: fx-wood }
  - { shape: polygon, points: [[0, 0], [0.06, 0], [0.03, 0.05]], depth: 0.02, at: [0.5, 0.1, 0], color: fx-wood }
`;

/** The fixture set with both pieces placed by the wall, unframed, and the look's file passed through `look`. */
function shapesTree(look: (yaml: string) => string = (yaml) => yaml): Tree {
  const placed =
    `  - { id: ${TURNED}, piece: ${TURNED}, mount: { on: fx-shell, anchor: wall, offset: [1.2, -1.35, 0.3] } }\n` +
    `  - { id: ${PLAIN}, piece: ${PLAIN}, mount: { on: fx-shell, anchor: wall, offset: [-1.2, -1.35, 0.3] } }\n`;
  return overlay({
    [`apps/web/room/catalog/${TURNED}.yaml`]: piece(TURNED, TURNED_SHAPES),
    [`apps/web/room/catalog/${PLAIN}.yaml`]: piece(PLAIN, PLAIN_SHAPES),
    [SCENE]: text(SCENE).replace("switches:\n", `${placed}switches:\n`),
    [LOOK]: look(text(LOOK)),
  });
}

interface Composed {
  readonly result: ComposeResult;
  /** Each piece's shapes as the 3D part holds them, resolved. */
  readonly shapes: (id: string) => readonly Shape[];
  /** Each piece's shapes as the catalog gives them, which RG reads. */
  readonly authored: (id: string) => readonly StandinEntry[];
}

function composed(look?: (yaml: string) => string): Composed {
  const tree = shapesTree(look);
  const result = compose(tree, noPolicy(), { mode: "strict", drafts: false });
  const room = loadRoom(tree);
  return {
    result,
    shapes: (id) => result.scene.pieces[id]?.standin ?? [],
    authored: (id) => room.catalog.find((c) => c.value.id === id)?.value.standin ?? [],
  };
}

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-9, what = ""): void {
  expect(actual.length, what).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    const [a, e] = [actual[i] ?? Number.NaN, expected[i] ?? Number.NaN];
    expect(Math.abs(a - e), `${what}[${i}]: ${a} against ${e}`).toBeLessThanOrEqual(tolerance);
  }
}

/** T(at) · R(turn) · S(scale), the kernel's: a shape's frame in its piece's. */
const frameOf = (s: Shape): Mat4 =>
  multiply(multiply(translation(s.at), rotation(s.turn)), [
    s.scale[0],
    0,
    0,
    0,
    0,
    s.scale[1],
    0,
    0,
    0,
    0,
    s.scale[2],
    0,
    0,
    0,
    0,
    1,
  ]);

/** A geometry's vertices, in its own frame. */
function vertices(geometry: BufferGeometry): Vec3[] {
  const position = geometry.getAttribute("position");
  const out: Vec3[] = [];
  for (let i = 0; i < position.count; i += 1) out.push([position.getX(i), position.getY(i), position.getZ(i)]);
  return out;
}

/** A mesh's vertices in its parent's frame, through its own matrix. */
function placed(mesh: Mesh): Vec3[] {
  mesh.updateMatrix();
  const m = mesh.matrix.elements as unknown as Mat4;
  return vertices(mesh.geometry).map((p) => transformPoint(m, p));
}

function boundsOf(points: readonly Vec3[]): Box {
  const axis = (k: 0 | 1 | 2, f: (...v: number[]) => number): number => f(...points.map((p) => p[k]));
  return {
    min: [axis(0, Math.min), axis(1, Math.min), axis(2, Math.min)],
    max: [axis(0, Math.max), axis(1, Math.max), axis(2, Math.max)],
  };
}

const hex = (color: Color): string => `#${color.getHexString()}`;

/** The colour the look gives a value: its palette's for a palette name, the value itself for #rrggbb. */
function expected(look: Look, value: string): string {
  return Object.hasOwn(look.palette, value) ? (look.palette[value] as string) : value;
}

describe("the stand-ins' nine shapes (standins.ts)", () => {
  it("come from the catalog through the 3D part, one of each kind, composing with no finding", () => {
    const { result, shapes, authored } = composed();
    expect(result.findings).toEqual([]);
    expect(shapes(TURNED).map((s) => s.shape)).toEqual([...STANDIN_SHAPES]);
    expect(authored(TURNED).map((s) => s.shape)).toEqual([...STANDIN_SHAPES]);
    expect(shapes(PLAIN)).toHaveLength(11);
  });

  it("build each kind's three.js geometry from its size fields (data-model.md §3)", () => {
    const { shapes } = composed();
    for (const s of [...shapes(TURNED), ...shapes(PLAIN)]) {
      const g = shapeGeometry(s);
      switch (s.shape) {
        case "box":
          expect(g).toBeInstanceOf(BoxGeometry);
          expect((g as BoxGeometry).parameters).toMatchObject({
            width: s.size[0],
            height: s.size[1],
            depth: s.size[2],
          });
          break;
        case "cylinder":
          expect(g).toBeInstanceOf(CylinderGeometry);
          expect((g as CylinderGeometry).parameters).toMatchObject({
            radiusTop: s.radius,
            radiusBottom: s.radius,
            height: s.height,
            openEnded: false,
          });
          break;
        case "capsule":
          // The length is three.js's cylinder part: the whole capsule is length + 2 × radius tall.
          expect(g).toBeInstanceOf(CapsuleGeometry);
          expect((g as CapsuleGeometry).parameters).toMatchObject({ radius: s.radius, height: s.length });
          break;
        case "sphere":
          expect(g).toBeInstanceOf(SphereGeometry);
          expect((g as SphereGeometry).parameters).toMatchObject({ radius: s.radius });
          break;
        case "torus":
          expect(g).toBeInstanceOf(TorusGeometry);
          expect((g as TorusGeometry).parameters).toMatchObject({ radius: s.radius, tube: s.tube });
          break;
        case "plane":
        case "circle": {
          expect(g).toBeInstanceOf(s.shape === "plane" ? PlaneGeometry : CircleGeometry);
          expect((g as PlaneGeometry | CircleGeometry).parameters).toMatchObject(
            s.shape === "plane" ? { width: s.size[0], height: s.size[1] } : { radius: s.radius },
          );
          // Flat in the XY plane, facing +Z.
          for (const p of vertices(g)) expect(p[2]).toBe(0);
          const normal = g.getAttribute("normal");
          for (let i = 0; i < normal.count; i += 1)
            expect([normal.getX(i), normal.getY(i), normal.getZ(i)]).toEqual([0, 0, 1]);
          break;
        }
        case "tube": {
          // A closed cylinder of the radius from `from` to `to`, both in the shape's own frame: its caps' centres are
          // the ends, and every vertex lies within the radius of the segment.
          expect(g).toBeInstanceOf(CylinderGeometry);
          const span = length(sub(s.to, s.from));
          expect((g as CylinderGeometry).parameters).toMatchObject({
            radiusTop: s.radius,
            radiusBottom: s.radius,
            openEnded: false,
          });
          expect((g as CylinderGeometry).parameters.height).toBeCloseTo(span, 12);
          const points = vertices(g);
          for (const end of [s.from, s.to])
            expect(
              points.some((p) => length(sub(p, end)) < 1e-9),
              `an end at ${end.join(", ")}`,
            ).toBe(true);
          const axis = normalize(sub(s.to, s.from));
          let farthest = 0;
          for (const p of points) {
            const along = Math.min(
              span,
              Math.max(0, (p[0] - s.from[0]) * axis[0] + (p[1] - s.from[1]) * axis[1] + (p[2] - s.from[2]) * axis[2]),
            );
            const off = length(
              sub(p, [s.from[0] + axis[0] * along, s.from[1] + axis[1] * along, s.from[2] + axis[2] * along]),
            );
            farthest = Math.max(farthest, off);
          }
          expect(farthest).toBeLessThanOrEqual(s.radius + 1e-9);
          expect(farthest).toBeGreaterThan(s.radius - 1e-9);
          break;
        }
        case "polygon": {
          // Its points extruded along Z by its depth, centred on z = 0.
          expect(g).toBeInstanceOf(ExtrudeGeometry);
          expect((g as ExtrudeGeometry).parameters.options).toMatchObject({ depth: s.depth, bevelEnabled: false });
          const points = vertices(g);
          for (const p of points) {
            expect(Math.abs(Math.abs(p[2]) - s.depth / 2)).toBeLessThan(1e-12);
            expect(
              s.points.some(([x, y]) => Math.hypot(p[0] - x, p[1] - y) < 1e-12),
              `${p.join(", ")}`,
            ).toBe(true);
          }
          for (const [x, y] of s.points)
            for (const z of [-s.depth / 2, s.depth / 2])
              expect(points.some((p) => Math.hypot(p[0] - x, p[1] - y, p[2] - z) < 1e-12)).toBe(true);
          break;
        }
      }
    }
  });

  it("stand at T(at) · R(turn) · S(scale) in their piece's frame, turned in Y, then X, then Z, within 1e-9", () => {
    const { result, shapes } = composed();
    const materials = lookMaterials(result.scene.look);
    for (const s of shapes(TURNED)) {
      const mesh = standinMesh(s, materials);
      mesh.updateMatrix();
      expectClose(mesh.matrix.elements, frameOf(s), 1e-9, s.shape);
    }
    // A number for a scale is the same on every axis; a piece's stand-in is its shapes in order.
    const circle = shapes(TURNED).find((s) => s.shape === "circle");
    expect(circle?.scale).toEqual([1.5, 1.5, 1.5]);
    const group = standin(shapes(TURNED), materials);
    expect(group).toBeInstanceOf(Group);
    expect(group.children.map((c) => (c as Mesh).geometry.type)).toEqual(
      shapes(TURNED).map((s) => shapeGeometry(s).type),
    );
  });

  it("lie inside the extent RG measured, turned and scaled, and reach it where their extremes are vertices", () => {
    const { result, shapes, authored } = composed();
    const materials = lookMaterials(result.scene.look);
    const check = (id: string, exact: boolean): void => {
      const [drawn, read] = [shapes(id), authored(id)];
      expect(drawn).toHaveLength(read.length);
      drawn.forEach((s, k) => {
        const entry = read[k] as StandinEntry;
        const [mesh, rg] = [boundsOf(placed(standinMesh(s, materials))), shapeBox(entry)];
        for (const i of [0, 1, 2] as const) {
          const what = `${id} ${s.shape} ${k}, axis ${i}`;
          expect(mesh.min[i], what).toBeGreaterThanOrEqual(rg.min[i] - 1e-9);
          expect(mesh.max[i], what).toBeLessThanOrEqual(rg.max[i] + 1e-9);
          if (exact) {
            expect(Math.abs(mesh.min[i] - rg.min[i]), what).toBeLessThan(1e-9);
            expect(Math.abs(mesh.max[i] - rg.max[i]), what).toBeLessThan(1e-9);
          }
        }
      });
    };
    check(TURNED, false);
    check(PLAIN, true);
  });

  it("take a palette name of the look or #rrggbb as their colour", () => {
    const { result, shapes, authored } = composed();
    const look = result.scene.look;
    const materials = lookMaterials(look);
    const colours = authored(TURNED).map((s) => s.color);
    expect(colours.some((c) => c.startsWith("#"))).toBe(true);
    expect(colours.some((c) => Object.hasOwn(look.palette, c))).toBe(true);
    shapes(TURNED).forEach((s, k) => {
      const want = expected(look, colours[k] as string);
      expect(s.color, s.shape).toBe(want);
      const material = standinMesh(s, materials).material as MeshBasicMaterial | MeshToonMaterial;
      expect(hex(material.color), s.shape).toBe(want);
    });
    // The look resolves a palette name wherever one reaches it, and keeps #rrggbb.
    expect(colourOf(look, "fx-wood")).toBe(look.palette["fx-wood"]);
    expect(colourOf(look, "#123abc")).toBe("#123abc");
  });

  it("are lit unless lit: false: inked cel shades a lit shape with MeshToonMaterial and draws an unlit one plain", () => {
    const { result, shapes, authored } = composed();
    const materials = lookMaterials(result.scene.look);
    expect(result.scene.look.method).toBe("inked-cel");
    const lit = authored(TURNED).map((s) => s.lit);
    expect(lit.filter((l) => !l)).toHaveLength(2);
    shapes(TURNED).forEach((s, k) => {
      expect(s.lit, s.shape).toBe(lit[k]);
      const mesh = standinMesh(s, materials);
      expect(mesh.material, s.shape).toBeInstanceOf(s.lit ? MeshToonMaterial : MeshBasicMaterial);
      // Only what the look shades takes part in its shadows.
      expect([mesh.castShadow, mesh.receiveShadow], s.shape).toEqual([s.lit, s.lit]);
    });
  });
});

/** A stand-in for WebGLRenderer, which "draws" a scene by calling each visible mesh's onBeforeRender, as the renderer
 *  does, and records the materials of each pass. */
function fakeRenderer(): { renderer: WebGLRenderer; passes: Material[][] } {
  const passes: Material[][] = [];
  const fake = {
    autoClear: true,
    shadowMap: { enabled: true },
    render(scene: Scene, camera: Camera): void {
      const drawn: Material[] = [];
      scene.traverseVisible((node: Object3D) => {
        const mesh = node as Mesh;
        if (!mesh.isMesh) return;
        const material = mesh.material as Material;
        mesh.onBeforeRender(fake as unknown as WebGLRenderer, scene, camera, mesh.geometry, material, null as never);
        drawn.push(material);
      });
      passes.push(drawn);
    },
  };
  return { renderer: fake as unknown as WebGLRenderer, passes };
}

/** A uniform of an outline pass's material. */
const uniform = <T>(m: Material, name: string): T => (m as ShaderMaterial).uniforms[name]?.value as T;

describe("the look (look.ts)", () => {
  const good = (look?: (yaml: string) => string): Composed => composed(look);
  const method = (name: string) => (yaml: string) => yaml.replace("method: inked-cel", `method: ${name}`);

  it("shades inked cel over a ramp of shading.steps bands, dark to full, nearest-filtered, without mipmaps", () => {
    for (const steps of [2, 3, 4, 5]) {
      const ramp = toonRamp(steps);
      expect(ramp).toBeInstanceOf(DataTexture);
      expect([ramp.image.width, ramp.image.height]).toEqual([steps, 1]);
      expect(ramp.format).toBe(RedFormat);
      expect([ramp.minFilter, ramp.magFilter]).toEqual([NearestFilter, NearestFilter]);
      expect(ramp.generateMipmaps).toBe(false);
      const data = [...(ramp.image.data as Uint8Array)];
      expect(data).toHaveLength(steps);
      expect([data[0], data[steps - 1]]).toEqual([0, 255]);
      for (let i = 1; i < steps; i += 1) expect(data[i] ?? 0).toBeGreaterThan(data[i - 1] ?? 0);
    }
    // The look's own steps reach every lit stand-in.
    const { result, shapes } = good((yaml) => yaml.replace("shading: { steps: 3 }", "shading: { steps: 4 }"));
    expect(result.findings).toEqual([]);
    const materials = lookMaterials(result.scene.look);
    for (const s of shapes(TURNED).filter((x) => x.lit)) {
      const material = standinMesh(s, materials).material as MeshToonMaterial;
      expect(material.gradientMap?.image.width, s.shape).toBe(4);
    }
  });

  it("draws painted and flat unlit, every shape in its base colour", () => {
    for (const name of ["painted", "flat"]) {
      const { result, shapes } = good(method(name));
      expect(result.findings, name).toEqual([]);
      expect(result.scene.look.method).toBe(name);
      const materials = lookMaterials(result.scene.look);
      for (const s of shapes(TURNED)) {
        const mesh = standinMesh(s, materials);
        expect(mesh.material, `${name} ${s.shape}`).toBeInstanceOf(MeshBasicMaterial);
        expect(hex((mesh.material as MeshBasicMaterial).color)).toBe(s.color);
        expect([mesh.castShadow, mesh.receiveShadow]).toEqual([false, false]);
      }
    }
  });

  it("shares one material per colour, lighting, and side", () => {
    const { result } = good();
    const materials = lookMaterials(result.scene.look);
    expect(materials.of("fx-wood", true)).toBe(materials.of(result.scene.look.palette["fx-wood"] as string, true));
    expect(materials.of("fx-wood", true)).not.toBe(materials.of("fx-wood", false));
    expect(materials.of("fx-wood", true)).not.toBe(materials.of("fx-wood", true, DoubleSide));
    expect(materials.of("fx-wood", true).side).toBe(FrontSide);
    expect(materials.of("fx-wood", true, DoubleSide).side).toBe(DoubleSide);
  });

  it("bakes nothing (FR-022): no light, shadow, or occlusion map, no emissive colour, no texture but the ramp", () => {
    for (const name of ["inked-cel", "painted", "flat"]) {
      const { result, shapes } = good(method(name));
      const materials = lookMaterials(result.scene.look);
      for (const s of shapes(TURNED)) {
        const material = standinMesh(s, materials).material as Partial<MeshToonMaterial>;
        const what = `${name} ${s.shape}`;
        for (const map of ["map", "lightMap", "aoMap", "emissiveMap", "bumpMap", "normalMap", "alphaMap"] as const)
          expect(material[map] ?? null, `${what}: ${map}`).toBeNull();
        if (material.emissive) expect(material.emissive.getHex(), what).toBe(0);
        expect(material.vertexColors, what).toBe(false);
        if (material instanceof MeshToonMaterial) expect(material.gradientMap, what).toBeInstanceOf(DataTexture);
      }
    }
  });

  it("lights the room with the look's lights: a hemisphere of its sky and ground, and a key from `from`", () => {
    const { result } = good();
    const look = result.scene.look;
    const room: Box = { min: [-2, -0.05, -1.25], max: [2, 2.6, 1.75] };
    const { ambient, key } = lookLights(look, room);
    expect(ambient).toBeInstanceOf(HemisphereLight);
    expect([hex(ambient.color), hex(ambient.groundColor), ambient.intensity]).toEqual([
      look.lights.ambient.sky,
      look.lights.ambient.ground,
      look.lights.ambient.intensity,
    ]);
    expect(key).toBeInstanceOf(DirectionalLight);
    expect([hex(key.color), key.intensity, key.castShadow]).toEqual([
      look.lights.key.color,
      look.lights.key.intensity,
      look.lights.key.shadows,
    ]);
    // The key shines from `from` onto the room, and its shadow camera holds every corner of the box it was given.
    const from = key.position.clone().sub(key.target.position).normalize();
    expectClose(from.toArray(), normalize(look.lights.key.from), 1e-9, "from");
    key.updateMatrixWorld();
    key.target.updateMatrixWorld();
    key.shadow.updateMatrices(key);
    for (const x of [room.min[0], room.max[0]])
      for (const y of [room.min[1], room.max[1]])
        for (const z of [room.min[2], room.max[2]]) {
          const p = new Vector3(x, y, z).applyMatrix4(key.shadow.matrix);
          for (const v of p.toArray()) {
            expect(v, `${x}, ${y}, ${z}`).toBeGreaterThanOrEqual(0);
            expect(v, `${x}, ${y}, ${z}`).toBeLessThanOrEqual(1);
          }
        }
    // A look without shadows casts none.
    const plain = good((yaml) => yaml.replace("shadows: true", "shadows: false")).result.scene.look;
    expect(lookLights(plain, room).key.castShadow).toBe(false);
  });

  it("draws inked cel's lines through OutlineEffect in the outline's colour, a palette name resolved, at its width", () => {
    const { result } = good();
    const look = result.scene.look;
    expect(Object.hasOwn(look.palette, look.outlines.color)).toBe(true);
    const { renderer, passes } = fakeRenderer();
    const ink = createInk(renderer, look);
    expect(ink.outlined).toBe(true);
    const scene = new Scene();
    const materials = lookMaterials(look);
    scene.add(standin(result.scene.pieces["fx-desk"]?.standin ?? [], materials));
    const camera = new PerspectiveCamera();

    // The width is CSS pixels of the stage's height: the effect's thickness, in normalized device units, is 2w ÷ H.
    expect(outlineThickness(look.outlines.width, 420)).toBeCloseTo((2 * look.outlines.width) / 420, 15);
    for (const height of [420, 640]) {
      ink.setStageHeight(height);
      const before = passes.length;
      ink.render(scene, camera);
      expect(passes.length - before, "the scene, then its lines").toBe(2);
      const [shaded, lines] = [passes[before] ?? [], passes[before + 1] ?? []];
      expect(shaded.every((m) => m instanceof MeshToonMaterial)).toBe(true);
      expect(lines).toHaveLength(shaded.length);
      for (const m of lines) {
        expect(m).toBeInstanceOf(ShaderMaterial);
        expect(hex(uniform<Color>(m, "outlineColor"))).toBe(expected(look, look.outlines.color));
        expect(uniform<number>(m, "outlineThickness")).toBeCloseTo(outlineThickness(look.outlines.width, height), 12);
      }
      // The scene's own materials come back after the lines.
      scene.traverse((node) => {
        if ((node as Mesh).isMesh) expect((node as Mesh).material).toBeInstanceOf(MeshToonMaterial);
      });
    }

    // Off at the quality levels that drop them (R-35): the scene alone.
    ink.setOutlines(false);
    const before = passes.length;
    ink.render(scene, camera);
    expect(passes.length - before).toBe(1);
  });

  it("draws painted and flat with the renderer alone, with no lines", () => {
    for (const name of ["painted", "flat"]) {
      const { result } = good(method(name));
      const { renderer, passes } = fakeRenderer();
      const ink = createInk(renderer, result.scene.look);
      expect(ink.outlined, name).toBe(false);
      const scene = new Scene();
      scene.add(standin(result.scene.pieces["fx-desk"]?.standin ?? [], lookMaterials(result.scene.look)));
      ink.setStageHeight(420);
      ink.render(scene, new PerspectiveCamera());
      expect(passes, name).toHaveLength(1);
      expect(
        (passes[0] ?? []).every((m) => m instanceof MeshBasicMaterial),
        name,
      ).toBe(true);
    }
  });
});
