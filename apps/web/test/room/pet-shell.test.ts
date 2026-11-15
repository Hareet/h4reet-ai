// rv-impl3-026's I-1 (spec 026, T014; the page's Q282; spec 025's B-1): the stage's rule for making the run's shell,
// `shellDue(chosen, handedOff, hasDog)` (pet-adapters.ts; chase-figures.ts stays unchanged), and the shell for a
// visitor who didn't choose the dinosaur, wired as scene.ts wires it.
// - shellDue over every AvatarId × handedOff × hasDog: the shell is made once the hand-off has ended, for the
//   dinosaur (spec 025's chaseDue) or, where the scene has the room's dog, for every visitor (Q282).
// - A non-dinosaur visitor, a real controller and its hand-off, the twin's real model, the shell and the pet director
//   made only once shellDue says so: across frames at home with no petting, nothing writes the twin's picture; a
//   petting turns it through the shell; after the petting it is exactly its pose at the hand-off's end; no run starts.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Group } from "three";
import type { AnimationClip, Object3D } from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AVATARS } from "../../src/choice/avatars";
import type { AvatarId } from "../../src/choice/avatars";
import { floorOfPart } from "../../src/room/compose/floor";
import { createAvatarFigures, stripMorphs } from "../../src/room/scene/avatars";
import type { ChaseMotion } from "../../src/room/scene/chase";
import { chaseDue, createChaseFigures } from "../../src/room/scene/chase-figures";
import type { ChaseAvatars } from "../../src/room/scene/chase-figures";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { parseModel } from "../../src/room/scene/gltf-images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { createPet } from "../../src/room/scene/pet";
import type { PetDog } from "../../src/room/scene/pet";
import { createPetAdapters, shellDue } from "../../src/room/scene/pet-adapters";
import { PET_DEFAULTS } from "../../src/room/scene/pet-config";
import { REPO, repositoryBundle } from "../helpers/room";

describe("shellDue: the stage makes the run's shell (I-1; Q282; spec 025's B-1)", () => {
  const cases = AVATARS.flatMap(({ id }) =>
    [false, true].flatMap((handedOff) => [false, true].map((hasDog) => [id, handedOff, hasDog] as const)),
  );
  it("covers every avatar, both hand-off states, and both scenes", () => {
    expect(cases).toHaveLength(AVATARS.length * 4);
    expect(AVATARS.map((a) => a.id)).toContain("dinosaur");
  });
  it.each(cases)("the %s chosen, the hand-off ended %s, the scene's dog %s", (chosen, handedOff, hasDog) => {
    const due = shellDue(chosen as AvatarId, handedOff, hasDog);
    // Never before the hand-off ends, so no home holds its mid-turn rotation (spec 025's B-1).
    if (!handedOff) expect(due).toBe(false);
    // Spec 025's rule, unchanged: the dinosaur, once it has ended.
    if (chaseDue(chosen as AvatarId, handedOff)) expect(due).toBe(true);
    expect(due).toBe(handedOff && (chosen === "dinosaur" || hasDog));
  });
});

const decode: Decode = (_source, options) =>
  Promise.resolve({
    width: options.resizeWidth ?? 1,
    height: options.resizeHeight ?? 1,
    close: () => undefined,
  } as unknown as ImageBitmap);

async function parsed(file: string): Promise<{ root: Object3D; clips: AnimationClip[] }> {
  const bytes = new Uint8Array(readFileSync(join(REPO, file)));
  const gltf = (await parseModel(bytes.slice().buffer, { reduced: false, decode })).gltf;
  stripMorphs(gltf.scene);
  return { root: gltf.scene, clips: gltf.animations };
}

let idleClips: AnimationClip[];
beforeAll(async () => {
  idleClips = (await parsed("assets/twin/idle.glb")).clips;
}, 180_000);

const DT = 1 / 60;
const MOVE: ChaseMotion = { animate: true, paused: false, level: 0 };
const pose = (o: Object3D): number[][] => [o.position.toArray(), o.rotation.toArray().slice(0, 3) as number[]];

describe("a non-dinosaur visitor, wired as scene.ts wires it (I-1)", () => {
  it("writes nothing to the twin's picture at home, turns it for a petting, and leaves it at its post-hand-off pose", async () => {
    const chosen: AvatarId = "woman";
    const model = (await parsed("assets/twin/twin.glb")).root;
    const bundle = repositoryBundle();
    const part = bundle.scene;
    expect(part.figures.dog).toBeDefined();
    const room = buildRoom(part, { avatar: chosen, label: () => new Group(), index: bundle.index });
    const t = { now: 0 };
    const figures = createAvatarFigures(room, part, { chosen, clock: () => t.now });
    expect(figures.model("twin", model)).toBe(true);
    figures.clip("twin", "idle", idleClips);
    const twin = figures.pictureOf("twin");
    if (!twin) throw new Error("no twin picture");

    // The hand-off, through the real controller: the stage makes no shell before it ends.
    let handedOff = false;
    const hasDog = part.figures.dog !== undefined;
    let turned = 0;
    for (const p of [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1]) {
      figures.showHandoff(p, false);
      turned = Math.max(turned, Math.abs(twin.rotation.y));
      expect(shellDue(chosen, handedOff, hasDog)).toBe(false);
    }
    expect(turned).toBeGreaterThan(0.4);
    figures.handoffEnded();
    handedOff = true;
    const afterHandoff = pose(twin);

    // The stage's rule, then the shell and the director as scene.ts makes them.
    expect(shellDue(chosen, handedOff, hasDog)).toBe(true);
    const floor = floorOfPart(part, part.walking.radius_m);
    if (!floor) throw new Error("no floor");
    const avatars: ChaseAvatars = {
      shows: (id) => figures.shows(id),
      pictureOf: (id) => figures.pictureOf(id),
      legsOf: (id) => figures.legsOf(id),
      clipOf: (a, r) => figures.clipOf(a, r),
      dogPlays: (r) => figures.dogPlays(r),
      twinActivity: (a) => figures.twinActivity(a),
      stride: (f, x, z, s, m) => figures.stride(f, x, z, s, m),
    };
    const walking = { on: false, pose: { x: -0.7, z: 0.58 } };
    const shell = createChaseFigures({ floor, part, avatars, walking, chosen });
    const adapters = createPetAdapters({ avatars: figures, chase: () => shell.chase, hasDog });
    // The dog's view at the scene's dog home: its model isn't on the line (rv-impl3-026's N-1).
    const dogHome = part.figures.dog?.home.at ?? [0.3, 0.45];
    const dogView: PetDog = {
      home: { x: dogHome[0], z: dogHome[1], heading: Math.PI },
      phase: "home",
      headPoint(out) {
        out.x = dogHome[0];
        out.y = 0.9 * 0.62;
        out.z = dogHome[1] + 0.35 * 0.62;
        return out;
      },
    };
    const pet = createPet({
      config: part.figures.pet ?? null,
      clock: { now: () => t.now },
      motion: () => ({ animate: true, paused: false, level: 0, live: true }),
      twin: adapters.twin,
      dog: () => dogView,
      chase: adapters.chase,
      signal: (a) => figures.twinActivity(a),
    });
    figures.pet({ reach: () => pet.reach, finished: () => pet.finished(), config: part.figures.pet ?? PET_DEFAULTS });

    const writes = [
      vi.spyOn(twin.position, "copy"),
      vi.spyOn(twin.position, "set"),
      vi.spyOn(twin.rotation, "copy"),
      vi.spyOn(twin.rotation, "set"),
    ];
    const written = (): number => writes.reduce((n, w) => n + w.mock.calls.length, 0);
    const frame = (n: number): void => {
      for (let i = 0; i < n; i += 1) {
        t.now += DT * 1000;
        pet.frame(DT);
        shell.frame(DT, MOVE);
        figures.update(DT * 1000, true, 0);
        // No run starts: the visitor isn't the pursuer (FR-001).
        expect(shell.chase.phase("twin")).toBe("home");
        expect(shell.chase.phase("dog")).toBe("home");
      }
    };

    // At home, no petting: nothing writes the twin's picture.
    frame(120);
    expect(written()).toBe(0);
    expect(pose(twin)).toEqual(afterHandoff);

    // A petting: the twin turns through the shell, its one writer.
    expect(pet.select("dog")).toBe(true);
    let frames = 0;
    let away = false;
    while (pet.phase !== "idle" && frames < 60 * 8) {
      frame(1);
      frames += 1;
      if (twin.rotation.y !== afterHandoff[1]?.[1]) away = true;
    }
    expect(pet.phase).toBe("idle");
    expect(away).toBe(true);
    expect(written()).toBeGreaterThan(0);

    // After it: exactly the post-hand-off pose, and nothing written again at home.
    frame(2);
    expect(pose(twin)).toEqual(afterHandoff);
    const after = written();
    frame(120);
    expect(written()).toBe(after);
    expect(pose(twin)).toEqual(afterHandoff);
  }, 180_000);
});
