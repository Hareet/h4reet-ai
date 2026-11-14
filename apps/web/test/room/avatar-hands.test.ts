// Spec 009's holding hand on the tree's own avatars (its FR-018 and plan.md R-08, as the Author amended them on
// 2026-11-09: "Count the fingers"; its intake gate, F4). Each avatar the repository's bundle holds a model, an idle,
// and an "idle-holding" for, computed from the tree's assets/visitors/<id>/ folders and never listed (FR-043), is given
// to the figures' controllers as the room's loader gives it: the model parsed through the room's image step, with a
// stand-in decoder, since Node has no createImageBitmap, and the clips by three's GLTFLoader. The hand it finds holds
// the paper: where "idle-holding"'s first frame sets apart from the idle's the channels of one hand's bones alone, read
// here from the clips by name, apart from R-08's rule, it is that hand; and a rig with no hand bones has none, whatever
// its "idle-holding" moves (FR-018), so a later intake of such a rig changes nothing here (the review of 70b3c563, nit
// 2). The studio's woman and man close only their left hands' fingers on the sheet (the intake note's Facts), so the
// left holds for both.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Box3, Object3D, PropertyBinding, Quaternion, Vector3 } from "three";
import type { AnimationClip, KeyframeTrack } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { AVATAR_SHAPES } from "../../src/choice/avatars";
import type { AvatarId } from "../../src/choice/avatars";
import { createAvatarFigures } from "../../src/room/scene/avatars";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { parseModel } from "../../src/room/scene/gltf-images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { REPO, repositoryBundle } from "../helpers/room";
import { dinosaurStage } from "../helpers/room-dinosaur";

/** ADR 0010's two hand bones, as three's loader names them. */
const HANDS = {
  right: PropertyBinding.sanitizeNodeName("mixamorig:RightHand"),
  left: PropertyBinding.sanitizeNodeName("mixamorig:LeftHand"),
} as const;

/** Node has no createImageBitmap: each image stands in at its asked size, or 1 pixel, and closes. */
const decode: Decode = (_source, options) =>
  Promise.resolve({
    width: options.resizeWidth ?? 1,
    height: options.resizeHeight ?? 1,
    close: () => undefined,
  } as unknown as ImageBitmap);

/** A file's bytes as a fresh ArrayBuffer, as the loader parses them. */
const bytesOf = (path: string): ArrayBuffer => new Uint8Array(readFileSync(join(REPO, path))).buffer;

const { scene, index, avatars } = repositoryBundle();
/** Each avatar the bundle holds a model, an idle, and an "idle-holding" for, with those files' paths. */
const holders = [...new Set(avatars.map((a) => a.avatar))].flatMap((id) => {
  const path = (role: string): string | undefined => avatars.find((a) => a.avatar === id && a.role === role)?.path;
  const [model, idle, holding] = [path("model"), path("idle"), path("idle-holding")];
  return model && idle && holding ? [{ id, model, idle, holding }] : [];
});

/** A track's values at 0 s: its first keyframe's, since a glTF clip's times start at 0 or later, and a track holds its
 *  first value before its first time. */
const at0 = (track: KeyframeTrack | undefined): number[] | null =>
  track ? Array.from(track.values.slice(0, track.getValueSize())) : null;

/** The nodes whose channels "idle-holding"'s first frame sets apart from the idle's, by three's names. */
function changed(idle: AnimationClip, holding: AnimationClip): Set<string> {
  const nodes = new Set<string>();
  for (const name of new Set([...idle.tracks, ...holding.tracks].map((t) => t.name))) {
    const [a, b] = [at0(idle.tracks.find((t) => t.name === name)), at0(holding.tracks.find((t) => t.name === name))];
    if (a === null || b === null || a.some((v, i) => Math.abs(v - (b[i] ?? Number.NaN)) > 1e-6))
      nodes.add(PropertyBinding.parseTrackName(name).nodeName);
  }
  return nodes;
}

/** The hand whose bones, itself and those under it, are the only ones `nodes` holds; null where no one hand's are. */
function onlyHand(model: Object3D, nodes: ReadonlySet<string>): string | null {
  const found = Object.values(HANDS).filter((name) => {
    const under = new Set<string>();
    model.getObjectByName(name)?.traverse((o) => under.add(o.name));
    return nodes.size > 0 && [...nodes].every((n) => under.has(n));
  });
  return found.length === 1 ? (found[0] ?? null) : null;
}

describe("the holding hand of the tree's own avatars (FR-018; R-08; the Author's answer of 2026-11-09)", () => {
  it("finds avatars with a holding clip in the repository's bundle", () => {
    expect(holders.length).toBeGreaterThan(0);
  });

  for (const h of holders) {
    it(`${h.id}: the hand whose bones alone "idle-holding" sets apart from the idle holds the paper, none with no hand bone`, async () => {
      const model = (await parseModel(bytesOf(h.model), { reduced: false, decode })).gltf.scene;
      const clip = async (path: string): Promise<AnimationClip> => {
        const first = (await new GLTFLoader().parseAsync(bytesOf(path), "")).animations[0];
        if (!first) throw new Error(`${path} holds no animation`);
        return first;
      };
      const [idle, holding] = [await clip(h.idle), await clip(h.holding)];
      const expected = onlyHand(model, changed(idle, holding));
      // The hand bones the rig has (FR-018): with neither, as a dog's or a dinosaur's rig may ship, no hand holds,
      // whatever its "idle-holding" moves; with one, that one.
      const present = Object.values(HANDS).filter((name) => model.getObjectByName(name) !== undefined);
      const room = buildRoom(scene, { avatar: h.id, label: () => new Object3D(), index });
      const figures = createAvatarFigures(room, scene, { chosen: h.id as AvatarId });
      expect(figures.model(h.id, model)).toBe(true);
      figures.clip(h.id, "idle", [idle]);
      figures.clip(h.id, "idle-holding", [holding]);
      expect(figures.shows("visitor")).toBe(true);
      const found = figures.handOf("visitor")?.name ?? null;
      if (present.length < 2) expect(found, `${h.id}'s rig has ${present.length} hand bones`).toBe(present[0] ?? null);
      // A clip that changes more than one hand's bones has no answer here but that a hand holds.
      else if (expected === null) expect(present).toContain(found);
      else expect(found, `${h.id}'s "idle-holding" changes only ${expected}'s bones`).toBe(expected);
      figures.dispose();
    });
  }
});

// Spec 021 (T002; FR-008, FR-009, SC-003; plan.md R-07): the dinosaur's rig has neither hand bone and no Mixamo name
// (test/helpers/glb.ts's dinosaurGlb, the contract's eighteen raw names), so no hand holds, and the paper stays at the
// hand anchor (spec 009's FR-018). The figure is scaled to the avatar table's 1.2 m and stands at the visitor's
// placement (spec 009's FR-016, FR-017). Expected to pass on the line's code, so these are pins (plan R-07).
describe("spec 021: the dinosaur, a rig with no hand bone (FR-008, FR-009)", () => {
  it("holds no hand, plays take once in the hand-off, leaves the paper at the anchor, and logs no console error", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const s = await dinosaurStage({ ended: false });
      expect(s.figures.shows("visitor")).toBe(true);
      expect(s.figures.handOf("visitor")).toBeNull();
      expect(() => {
        s.figures.update(16, true, 0);
        s.figures.showHandoff(1, false);
        expect(s.figures.playing("visitor")).toBe("take");
        s.figures.update(16, true, 0);
        s.figures.handoffEnded();
      }).not.toThrow();
      // No "idle-holding": after the hand-off, the idle (spec 009's FR-019 with its idle in a missing clip's place).
      expect(s.figures.playing("visitor")).toBe("idle");
      expect(s.room.paper.kept.parent).not.toBe(s.avatar());
      expect(s.room.paper.kept.parent?.name ?? "").not.toMatch(/Hand|Jaw|Head/);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it("stands 1.2 m high, its lowest point on the floor at the visitor's placement, centred on it, facing +z", async () => {
    const s = await dinosaurStage();
    let root: Object3D = s.room.visitor;
    while (root.parent) root = root.parent;
    root.updateMatrixWorld(true);
    const avatar = s.avatar() as Object3D;
    const box = new Box3().setFromObject(avatar, true);
    const at = new Vector3().setFromMatrixPosition(s.room.visitor.matrixWorld);
    expect(box.max.y - box.min.y).toBeCloseTo(AVATAR_SHAPES.dinosaur.height, 3);
    expect(box.min.y).toBeCloseTo(at.y, 3);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(at.x, 3);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(at.z, 3);
    const forward = new Vector3(0, 0, 1).applyQuaternion(avatar.getWorldQuaternion(new Quaternion()));
    const placed = new Vector3(0, 0, 1).applyQuaternion(s.room.visitor.getWorldQuaternion(new Quaternion()));
    expect(forward.dot(placed)).toBeCloseTo(1, 3);
  });
});
