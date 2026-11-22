// Spec 033 (User Story 3; FR-011; SC-003; "The flicker's cause"): the paper in the visitor's hand shows its whole face,
// steadily. The cause, reproduced with the tree's own avatars: at the hand-off's end the travelling sheet was left in
// the scene at the visitor's grip, at opacity 0 but still drawn (three draws a visible mesh whatever its opacity, and
// a transparent material writes depth by default), so whenever three's back-to-front sort put it first, the held
// sheet's pixels behind its plane failed the depth test and showed the room: its top half, on and off about every 2 s
// as "idle-holding"'s 4 s loop moved the hand through that plane twice.
// - Through the real buildRoom and createAvatarFigures, with each avatar the bundle holds a model, an idle, a "take",
//   and an "idle-holding" for (the man and the woman), their files parsed as avatar-hands.test.ts parses them: the
//   hand-off played to its end, then 8 s of "idle-holding" at 50 ms steps, seen from the room's camera at 16:9. At each
//   step, every other paper mesh three would draw that writes depth and sorts before the held sheet (opaque meshes
//   always do; transparent ones when their centre is farther, as WebGLRenderLists' reversePainterSortStable sorts)
//   must hide none of a 21 × 21 grid of the held sheet's points along the camera's rays.
// - The hand-off's endings, each with exactly one sheet drawn at its end, the kept one, at full opacity: travelling
//   with a holding hand, appearing (the twin's own model), under reduced motion, and travelling with no hand (the
//   dinosaur, whose rig has no hand bone); and no sheet at opacity 0 is drawn at any progress.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Matrix4, Object3D, PerspectiveCamera, Plane, Ray, Vector3 } from "three";
import type { AnimationClip, Material, Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import type { AvatarId } from "../../src/choice/avatars";
import { createAvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom, frameCamera, framedBoxes, showHandoff } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { parseModel } from "../../src/room/scene/gltf-images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { SHEET_SIZE } from "../../src/room/scene/grip";
import { REPO, repositoryBundle } from "../helpers/room";
import { dinosaurStage } from "../helpers/room-dinosaur";

/** Node has no createImageBitmap: each image stands in at its asked size, or 1 pixel, and closes. */
const decode: Decode = (_source, options) =>
  Promise.resolve({
    width: options.resizeWidth ?? 1,
    height: options.resizeHeight ?? 1,
    close: () => undefined,
  } as unknown as ImageBitmap);

const bytesOf = (path: string): ArrayBuffer => new Uint8Array(readFileSync(join(REPO, path))).buffer;

const { scene, index, avatars } = repositoryBundle();
/** Each avatar the bundle holds a model, an idle, a "take", and an "idle-holding" for, with those files' paths. */
const holders = [...new Set(avatars.map((a) => a.avatar))].flatMap((id) => {
  const path = (role: string): string | undefined => avatars.find((a) => a.avatar === id && a.role === role)?.path;
  const [model, idle, take, holding] = [path("model"), path("idle"), path("take"), path("idle-holding")];
  return model && idle && take && holding ? [{ id, model, idle, take, holding }] : [];
});

const clipOf = async (path: string): Promise<AnimationClip> => {
  const first = (await new GLTFLoader().parseAsync(bytesOf(path), "")).animations[0];
  if (!first) throw new Error(`${path} holds no animation`);
  return first;
};

/** Whether three's renderer would draw a mesh: it and every parent visible, up to the room's scene, and its material
 *  visible (WebGLRenderer's projectObject); its opacity isn't asked. */
function drawnByThree(room: Room3D, mesh: Mesh): boolean {
  let at: Object3D | null = mesh;
  for (; at; at = at.parent) {
    if (!at.visible) return false;
    if (at === room.scene) return (mesh.material as Material).visible;
  }
  return false;
}

/** The paper's meshes: each sheet and the back it holds. */
function paperMeshes(room: Room3D): { sheet: Mesh[]; kept: Mesh[] } {
  const all = (root: Mesh): Mesh[] => {
    const out: Mesh[] = [];
    root.traverse((n) => {
      if ((n as Mesh).isMesh) out.push(n as Mesh);
    });
    return out;
  };
  return { sheet: all(room.paper.sheet), kept: all(room.paper.kept) };
}

/** The held sheet's grid points, in the world, that a drawn, depth-writing paper mesh sorted before it hides from the
 *  camera: each point whose ray from the camera crosses that mesh's rectangle nearer than the point. */
function hiddenSamples(room: Room3D, camera: PerspectiveCamera): number {
  room.scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const projection = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const depth = (m: Mesh): number => new Vector3().setFromMatrixPosition(m.matrixWorld).applyMatrix4(projection).z;
  const { sheet, kept } = paperMeshes(room);
  const held = room.paper.kept;
  const [hw, hh] = [SHEET_SIZE[0] / 2, SHEET_SIZE[1] / 2];
  const others = sheet.filter((m) => {
    const material = m.material as Material;
    if (!drawnByThree(room, m) || !material.depthWrite) return false;
    return !material.transparent || depth(m) > depth(held);
  });
  let hidden = 0;
  for (const other of others) {
    const normal = new Vector3(0, 0, 1).transformDirection(other.matrixWorld);
    const plane = new Plane().setFromNormalAndCoplanarPoint(
      normal,
      new Vector3().setFromMatrixPosition(other.matrixWorld),
    );
    const back = other.matrixWorld.clone().invert();
    for (let i = 0; i <= 20; i += 1)
      for (let j = 0; j <= 20; j += 1) {
        const point = new Vector3((i / 10 - 1) * hw, (j / 10 - 1) * hh, 0).applyMatrix4(held.matrixWorld);
        const ray = new Ray(camera.position.clone(), point.clone().sub(camera.position).normalize());
        const hit = ray.intersectPlane(plane, new Vector3());
        if (!hit) continue;
        const local = hit.clone().applyMatrix4(back);
        const inside = Math.abs(local.x) <= hw && Math.abs(local.y) <= hh;
        if (inside && hit.distanceTo(camera.position) < point.distanceTo(camera.position) - 1e-7) hidden += 1;
      }
  }
  // The held sheet's own back draws its back face only, so it never hides its front.
  expect(kept.length).toBeGreaterThan(0);
  return hidden;
}

/** The sheets drawn at the end, by which they are, with the kept one's opacity. */
function drawnSheets(room: Room3D): { drawn: string[]; kept: number } {
  const drawn: string[] = [];
  if (drawnByThree(room, room.paper.sheet)) drawn.push("travelling");
  if (drawnByThree(room, room.paper.kept)) drawn.push("kept");
  return { drawn, kept: room.paper.atVisitor.opacity };
}

describe("the paper held steady (spec 033, FR-011, SC-003)", () => {
  it("finds avatars with a holding hand's clips in the repository's bundle", () => {
    expect(holders.length).toBeGreaterThan(0);
  });

  for (const h of holders) {
    it(`${h.id}: no drawn sheet hides any part of the held one over 8 s of "idle-holding"`, async () => {
      const model = (await parseModel(bytesOf(h.model), { reduced: false, decode })).gltf.scene;
      const room = buildRoom(scene, { avatar: h.id, label: () => new Object3D(), index });
      const figures = createAvatarFigures(room, scene, { chosen: h.id as AvatarId });
      expect(figures.model(h.id, model)).toBe(true);
      figures.clip(h.id, "idle", [await clipOf(h.idle)]);
      figures.clip(h.id, "take", [await clipOf(h.take)]);
      figures.clip(h.id, "idle-holding", [await clipOf(h.holding)]);
      const duration = 4500;
      figures.update(0, true, 0);
      for (let t = 0; t < duration; t += 16) {
        figures.showHandoff(t / duration, false);
        figures.update(16, true, 0);
      }
      figures.showHandoff(1, false);
      figures.handoffEnded();
      expect(figures.playing("visitor")).toBe("idle-holding");
      const ended = drawnSheets(room);
      const camera = new PerspectiveCamera();
      frameCamera(camera, 16 / 9, framedBoxes(scene));
      const blank: string[] = [];
      for (let t = 0; t < 8000; t += 50) {
        figures.update(50, true, 0);
        const hidden = hiddenSamples(room, camera);
        if (hidden > 0) blank.push(`${t} ms: ${hidden} of 441`);
      }
      expect(blank, `${h.id}: frames with part of the held sheet hidden`).toEqual([]);
      expect(ended).toEqual({ drawn: ["kept"], kept: 1 });
      figures.dispose();
    }, 120_000);
  }
});

describe("one sheet drawn at the hand-off's end, by every way it ends (spec 033, FR-011)", () => {
  const plain = (): Room3D => buildRoom(scene, { avatar: "dog", label: () => new Object3D(), index });

  it("draws no sheet at opacity 0, at any progress, travelling, appearing, or under reduced motion", () => {
    for (const [mode, reduced] of [
      ["travel", false],
      ["travel", true],
      ["appear", false],
      ["appear", true],
    ] as const) {
      const room = plain();
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        showHandoff(room, p, reduced, mode);
        for (const [mesh, opacity] of [
          [room.paper.sheet, room.paper.atTwin.opacity],
          [room.paper.kept, room.paper.atVisitor.opacity],
        ] as const)
          expect(drawnByThree(room, mesh), `${mode}${reduced ? ", reduced" : ""} at ${p}: a sheet at ${opacity}`).toBe(
            opacity > 0,
          );
      }
    }
  });

  it("ends with the kept sheet drawn and the travelling one not, under reduced motion and with a holding hand", async () => {
    const h = holders[0];
    if (!h) throw new Error("no holding avatar");
    for (const reduced of [false, true]) {
      const model = (await parseModel(bytesOf(h.model), { reduced: false, decode })).gltf.scene;
      const room = buildRoom(scene, { avatar: h.id, label: () => new Object3D(), index });
      const figures = createAvatarFigures(room, scene, { chosen: h.id as AvatarId });
      figures.model(h.id, model);
      figures.clip(h.id, "idle", [await clipOf(h.idle)]);
      figures.clip(h.id, "idle-holding", [await clipOf(h.holding)]);
      for (const p of [0, 0.5, 1]) figures.showHandoff(p, reduced);
      figures.handoffEnded();
      expect(drawnSheets(room), reduced ? "reduced motion" : "travelling").toEqual({ drawn: ["kept"], kept: 1 });
      figures.dispose();
    }
  });

  it("ends with the kept sheet drawn where the visitor's figure has no holding hand (the dinosaur)", async () => {
    const s = await dinosaurStage({ ended: false });
    expect(s.figures.handOf("visitor")).toBeNull();
    s.figures.showHandoff(0, false);
    s.figures.showHandoff(1, false);
    s.figures.handoffEnded();
    expect(drawnSheets(s.room)).toEqual({ drawn: ["kept"], kept: 1 });
  });
});
