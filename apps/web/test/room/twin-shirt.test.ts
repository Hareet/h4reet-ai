// T053 (spec 016; FR-036 to FR-038, FR-040, FR-041; plan.md R-12, K3, K4; contracts/twin-data.md §2, §3; SC-007): the
// shirt's lettering on the twin's own model.
// - The `print` renderer's display list: the canvas cleared to transparent, then the outline's paths alone, in #000000,
//   fitted to the region; a drafts build's badge in the same ink. So the canvas has ink only where the outline does.
// - Read from assets/twin/twin.glb, the face's vertex at its top-left as seen from the front (+z) holds texture
//   coordinate (0, 0), glTF's top-left, so the canvas texture takes flipY false and its top-left texel lands there.
// - The face's material, drawn into, keeps its own mesh: alphaTest 0.5, opaque, and the look's ink lines left off it,
//   after Ink.prepare too; no quad is built for it; and nothing is drawn while the twin shows anything but its own model.
// - The index marks the face `surface: model`, and the 2D drawing leaves it out.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Scene } from "three";
import { describe, expect, it } from "vitest";

import { REGISTRY } from "../../src/room/faces/registry";
import { faceList, roomTextOf } from "../../src/room/faces/words";
import { buildFaceQuads, dressSurface } from "../../src/room/scene/faces3d";
import { createInk } from "../../src/room/scene/look";
import { REPO, repositoryBundle } from "../helpers/room";

const drafts = repositoryBundle({ drafts: true, policy: "empty", readiness: "tree" });
const release = repositoryBundle({ drafts: false, policy: "empty", readiness: "tree" });
const shirtOf = (index: typeof drafts.index) => index.faces.find((f) => f.regions.some((r) => r.renderer === "print"));

/** The GLB's JSON and BIN chunks, and an accessor's floats. */
function glbAccessor(name: string, attribute: string): number[][] {
  const data = readFileSync(join(REPO, "assets/twin/twin.glb"));
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8")) as {
    meshes: { name?: string; primitives: { attributes: Record<string, number> }[] }[];
    accessors: { bufferView: number; byteOffset?: number; count: number; type: string }[];
    bufferViews: { byteOffset?: number; byteStride?: number }[];
  };
  const bin = 20 + jsonLength + 8;
  const mesh = json.meshes.find((m) => m.name === name);
  const index = mesh?.primitives[0]?.attributes[attribute];
  if (index === undefined) throw new Error(`no ${attribute} on ${name}`);
  const a = json.accessors[index];
  const view = a && json.bufferViews[a.bufferView];
  if (!a || !view) throw new Error("no accessor");
  const n = { VEC2: 2, VEC3: 3 }[a.type] ?? 1;
  const stride = view.byteStride ?? 4 * n;
  const at = bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return Array.from({ length: a.count }, (_, k) =>
    Array.from({ length: n }, (_, j) => data.readFloatLE(at + k * stride + 4 * j)),
  );
}

describe("the print renderer (FR-036; SC-007)", () => {
  it("draws the outline's paths alone in #000000 on a canvas cleared to transparent, the draft's badge in the same ink", () => {
    expect(REGISTRY.print.background).toBe("transparent");
    const face = shirtOf(drafts.index);
    if (!face) throw new Error("no shirt face in the drafts build");
    const text = roomTextOf({ room_text: drafts.roomText });
    const list = faceList(face, { index: drafts.index, text });
    expect(list).not.toBeNull();
    const [clear, ...rest] = list?.ops ?? [];
    expect(clear).toEqual({ op: "fill", color: "transparent" });
    // Every coloured op is the ink; the draft's badge is the raster's own mark, as every face's (FR-038).
    const colours = new Set(rest.flatMap((op) => ("color" in op ? [op.color] : [])));
    expect([...colours]).toEqual(["#000000"]);
    expect(rest.every((op) => op.op === "path" || op.op === "badge")).toBe(true);
    const paths = rest.filter((op) => op.op === "path");
    expect(paths.length).toBeGreaterThan(0);
    // A drafts build marks it as a draft (FR-038).
    expect(JSON.stringify(rest)).toMatch(/Draft/);
  });

  it("is an atmosphere face whose words reach Around the room under its label, marked as a draft (FR-040)", () => {
    const face = shirtOf(drafts.index);
    expect(face?.atmosphere).toBe(true);
    expect(drafts.index.ui[face?.label ?? ""]).toBe("The twin's shirt");
    expect(drafts.index.copy).toContainEqual({ face: face?.id });
  });
});

describe("the face's texture coordinates (plan.md K3; SC-007)", () => {
  it("put texture coordinate (0, 0), glTF's top-left, at the face's top-left as seen from the front", () => {
    const positions = glbAccessor("twin-shirt-lettering", "POSITION");
    const uvs = glbAccessor("twin-shirt-lettering", "TEXCOORD_0");
    // Seen from the front (+z), the top-left is the least x and the greatest y.
    const score = (p: number[]): number => -(p[0] ?? 0) + (p[1] ?? 0);
    let best = 0;
    positions.forEach((p, k) => {
      if (score(p) > score(positions[best] ?? p)) best = k;
    });
    expect(uvs[best]).toEqual([0, 0]);
  });
});

describe("the face drawn into the twin's own mesh (FR-036, FR-037, FR-041; plan.md R-12, K4)", () => {
  const doc = new JSDOM("<main></main>").window.document;
  const faces = () =>
    buildFaceQuads({
      part: drafts.scene,
      index: drafts.index,
      doc,
      placements: new Map(drafts.scene.placements.map((p) => [p.id, new Object3D()])),
      level: 0,
      dpr: 1,
      clock: { now: () => 0 } as never,
      motion: () => ({ animate: false }),
    });

  it("builds no quad for a surface: model face", () => {
    const face = shirtOf(drafts.index);
    expect(faces().quads.has(face?.id ?? "")).toBe(false);
  });

  it("draws into the mesh of its role's name: a cloned material, the canvas as its map with flipY false, alphaTest 0.5, opaque, no ink lines", () => {
    const face = shirtOf(drafts.index);
    if (!face) throw new Error("no face");
    const instance = new Object3D();
    const original = new MeshStandardMaterial({ color: 0xffffff });
    const mesh = new Mesh(new PlaneGeometry(0.18, 0.07), original);
    mesh.name = face.role;
    instance.add(mesh);
    const quads = faces();
    // Nothing to dress with until the room text has come (FR-038): the shirt stays plain.
    expect(dressSurface(quads, face.id, instance)).toBe(false);
    expect(mesh.material).toBe(original);
    quads.setText(roomTextOf({ room_text: drafts.roomText }));
    expect(dressSurface(quads, face.id, instance)).toBe(true);
    const material = mesh.material as MeshStandardMaterial;
    expect(material).not.toBe(original);
    expect(material.map?.flipY).toBe(false);
    expect(material.alphaTest).toBe(0.5);
    expect(material.transparent).toBe(false);
    expect(material.userData.h4FaceSurface).toBe(true);
    expect(material.userData.outlineParameters).toEqual({ visible: false });
    // Ink.prepare leaves it unlined.
    const renderer = { getContext: () => ({}), domElement: doc.createElement("canvas") } as never;
    const ink = createInk(renderer, drafts.scene.look);
    const scene = new Scene();
    scene.add(instance);
    ink.prepare(scene);
    expect(material.userData.outlineParameters).toEqual({ visible: false });
  });

  it("finds no mesh, and draws nothing, on an instance without the face: the stand-in or the capsule", () => {
    const face = shirtOf(drafts.index);
    expect(dressSurface(faces(), face?.id ?? "", new Object3D())).toBe(false);
  });

  it("marks the index's face surface: model, and leaves it out of the 2D drawing (FR-041)", () => {
    const face = shirtOf(drafts.index);
    expect(face?.surface).toBe("model");
    expect(drafts.index.flat.faces.some((f) => f.face === face?.id)).toBe(false);
  });
});

describe("the release build without the Author's approval (FR-038)", () => {
  it("binds no lettering: the face's words are no room text the release build publishes", () => {
    const text = roomTextOf({ room_text: release.roomText });
    const face = shirtOf(release.index);
    expect(face).toBeDefined();
    expect(faceList(face as never, { index: release.index, text })).toBeNull();
  });
});
