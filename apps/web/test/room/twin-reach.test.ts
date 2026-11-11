// T082 (spec 016; plan.md R-19; the Author's lookdev, T079, 2026-11-11): the twin's reach. At lookdev the twin's left
// foot and hand went through the right wall, so the compositor measures, for the rest pose and each clip the twin plays,
// every 1/30 s, how far its skinned mesh reaches toward each wall of the shell, and RA8 refuses a placement that
// crosses one.
// - The measure is three's: each sampled frame's reach along a direction equals three's own skinning of the delivered
//   model under its own clip, every vertex, within 0.05 mm.
// - This branch's room passes RA8, and the report prints the reach; the placement the lookdev saw, 12 cm to the twin's
//   left, crosses the right wall.
// - In fixtures: a clip whose turn alone crosses a side wall, between its keyframes; the rest pose past the back, every
//   clip with it; a clip the twin doesn't play, left unmeasured; lenient, a warning and the twin kept; and no RA8 where
//   RA6 leaves the twin's own model out, or where the shell names no side wall.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AnimationMixer, Vector3 } from "three";
import type { Mesh, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { twinOf } from "../../build/room/avatars";
import { createContext } from "../../build/room/checks/family";
import { geometryOf } from "../../build/room/checks/rg";
import { compose } from "../../build/room/compose";
import type { ComposeOptions, ComposeResult, Finding } from "../../build/room/compose";
import { loadRoom } from "../../build/room/load";
import { readRoomPolicy } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import { REACH_FPS, reachAt, sampleReach, twinReachOf } from "../../build/room/reach";
import type { TwinReach } from "../../build/room/reach";
import { fileTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { IDENTITY, multiply, translation } from "../../src/room/compose/math";
import type { Vec3 } from "../../src/room/compose/math";
import { stripMorphs } from "../../src/room/scene/avatars";
import { parseModel } from "../../src/room/scene/gltf-images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { TWIN_CLIP_ROLES } from "../../src/room/scene/twin-states";
import { clipGlb } from "../helpers/glb";
import { REPO } from "../helpers/room";
import { SCENE } from "../helpers/room-avatars";
import { goodFiles, overlay, sideWallFiles, sideWallTree } from "../helpers/room-fixtures";
import { TWIN_DIR, twinDefaults, twinFolder, twinPolicy, withLean } from "../helpers/room-twin";

const STRICT: ComposeOptions = { mode: "strict", drafts: true };
const LENIENT: ComposeOptions = { mode: "lenient", drafts: true };
const where = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.rule} ${f.file}:${f.path}`);
const ofRule = (findings: readonly Finding[], rule: string): Finding[] => findings.filter((f) => f.rule === rule);

/** Node has no createImageBitmap: each image stands in at its asked size, or 1 pixel, and closes. */
const decode: Decode = (_source, options) =>
  Promise.resolve({
    width: options.resizeWidth ?? 1,
    height: options.resizeHeight ?? 1,
    close: () => undefined,
  } as unknown as ImageBitmap);

const twinBytes = (name: string): Uint8Array => new Uint8Array(readFileSync(join(REPO, TWIN_DIR, name)));

/** The directions each frame is measured along: the side walls', the back's and the front's, and down, the floor's. */
const DIRECTIONS: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, -1],
  [0, 0, 1],
  [0, -1, 0],
];

/** three's own reach along each direction: every vertex of every mesh, skinned as three skins it, in the root's frame. */
function threeReach(root: Object3D): number[] {
  root.updateMatrixWorld(true);
  const best = DIRECTIONS.map(() => -Infinity);
  const v = new Vector3();
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh !== true) return;
    const count = mesh.geometry.getAttribute("position")?.count ?? 0;
    for (let i = 0; i < count; i++) {
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      DIRECTIONS.forEach((d, k) => {
        const along = d[0] * v.x + d[1] * v.y + d[2] * v.z;
        if (along > (best[k] ?? -Infinity)) best[k] = along;
      });
    }
  });
  return best;
}

describe("the twin's reach is three's skinning, sampled (plan.md R-19)", () => {
  it("measures each frame of the delivered model as three skins it, along each direction, at rest and in every clip", async () => {
    const model = twinBytes("twin.glb");
    const root = (await parseModel(model.slice().buffer, { reduced: false, decode })).gltf.scene;
    stripMorphs(root);
    const at = (t: number, clip: Uint8Array | null): number[] =>
      DIRECTIONS.map((d) => reachAt(model, clip, t, IDENTITY, d));
    // The rest pose first, before any clip has moved a bone.
    const rest = threeReach(root);
    at(0, null).forEach((r, k) => expect(r).toBeCloseTo(rest[k] ?? Number.NaN, 4));
    const loader = new GLTFLoader();
    for (const role of TWIN_CLIP_ROLES) {
      const bytes = twinBytes(`${role}.glb`);
      const clip = (await loader.parseAsync(bytes.slice().buffer, "")).animations[0];
      if (!clip) throw new Error(`${role}.glb holds no animation`);
      for (const k of [0, 1, 2]) {
        const t = (clip.duration * k) / 3;
        const mixer = new AnimationMixer(root);
        mixer.clipAction(clip).play();
        mixer.setTime(t);
        const want = threeReach(root);
        at(t, bytes).forEach((r, i) =>
          expect(r, `${role} at ${t.toFixed(2)} s, direction ${i}`).toBeCloseTo(want[i] ?? Number.NaN, 4),
        );
        mixer.stopAllAction();
        mixer.uncacheRoot(root);
      }
    }
  });
});

/** This branch's tree, its policy main's, composed once, with its twin's reach. */
let branch: { tree: Tree; policy: RoomPolicy; result: ComposeResult; reach: TwinReach | null } | null = null;
function onBranch(): { tree: Tree; policy: RoomPolicy; result: ComposeResult; reach: TwinReach | null } {
  if (branch) return branch;
  const tree = fileTree(REPO);
  const policy = readRoomPolicy({ env: {}, root: REPO });
  const result = compose(tree, policy, { mode: "strict", drafts: false });
  const room = loadRoom(tree);
  const scene = room.scene?.value ?? null;
  const g = geometryOf(createContext(room, policy, { mode: "strict", drafts: false }, tree).ctx);
  branch = { tree, policy, result, reach: twinReachOf(tree, scene, twinOf(tree, policy, scene), g) };
  return branch;
}

describe("RA8 on this branch's room (plan.md R-19)", () => {
  it("passes: at rest and in every clip the twin plays, every 1/30 s, it stays inside the shell's side walls and back", () => {
    const { result, reach } = onBranch();
    expect(where(ofRule(result.findings, "RA8"))).toEqual([]);
    expect(REACH_FPS).toBe(30);
    if (!reach) throw new Error("no reach measured");
    expect(reach.walls.map((w) => w.name)).toEqual(["left-wall", "right-wall", "back"]);
    // The scene's twin block maps every state to its default clip, but since the Author's "Lean off for now" (T086)
    // it has no lean, so the twin rests in its idle and plays four of the five: the lean's clip is never sampled.
    expect(reach.sources.map((s) => s.source)).toEqual(["rest", "idle", "talking", "listening", "greeting"]);
    for (const s of reach.sources) {
      expect(s.frames, s.source).toBeGreaterThan(0);
      for (const w of s.walls) {
        const wall = reach.walls.find((x) => x.name === w.wall);
        expect(w.reach, `${s.source} toward the ${w.wall}`).toBeLessThan(wall?.at ?? Number.NEGATIVE_INFINITY);
      }
    }
    expect(result.report.markdown).toMatch(
      /The twin's reach \(RA8\), over its rest pose and 4 clips every 1\/30 s: \d+\.\d cm inside the shell's right-wall at its nearest \(`[a-z-]+` at \d+\.\d\d s\); \d+\.\d cm inside its left-wall \(.+\); \d+\.\d cm inside its back \(.+\)\./,
    );
  });

  it("passes with the lean's data line put back, when the studio's re-export brings it: the lean sampled too", () => {
    const { tree: branchTree, policy } = onBranch();
    const tree = withLean(branchTree);
    const result = compose(tree, policy, { mode: "strict", drafts: false });
    expect(where(ofRule(result.findings, "RA8"))).toEqual([]);
    const room = loadRoom(tree);
    const scene = room.scene?.value ?? null;
    const g = geometryOf(createContext(room, policy, { mode: "strict", drafts: false }, tree).ctx);
    const reach = twinReachOf(tree, scene, twinOf(tree, policy, scene), g);
    expect(reach?.sources.map((s) => s.source)).toEqual(["rest", ...TWIN_CLIP_ROLES]);
    for (const s of reach?.sources ?? [])
      for (const w of s.walls)
        expect(w.reach, `${s.source} toward the ${w.wall}`).toBeLessThan(
          reach?.walls.find((x) => x.name === w.wall)?.at ?? Number.NEGATIVE_INFINITY,
        );
  });

  it("refuses the placement the Author's lookdev saw, 12 cm to the twin's left: over 9 cm past the right wall", () => {
    const { tree, reach } = onBranch();
    if (!reach) throw new Error("no reach measured");
    const model = tree.read(`${TWIN_DIR}/twin.glb`);
    if (!model) throw new Error("no model");
    const clips = TWIN_CLIP_ROLES.map((role) => {
      const bytes = tree.read(`${TWIN_DIR}/${role}.glb`);
      if (!bytes) throw new Error(`no ${role}`);
      return { role, bytes };
    });
    const before = sampleReach(model, clips, multiply(translation([0.12, 0, 0]), reach.place), reach.walls);
    const right = reach.walls.find((w) => w.name === "right-wall");
    const worst = Math.max(
      ...before.flatMap((s) => s.walls.filter((w) => w.wall === "right-wall").map((w) => w.reach)),
    );
    expect(worst - (right?.at ?? Number.NaN)).toBeGreaterThan(0.09);
  });
});

/** A fixture scene's text with its twin's placement (index 7, the fixtures' fx-twin) mounted on the shell's floor at
 *  `offset`, and a twin block where one is given. */
function sceneAt(text: Uint8Array | undefined, offset: Vec3, twin?: Record<string, unknown>): string {
  const scene = parse(new TextDecoder().decode(text)) as {
    placements: { role?: string; mount?: Record<string, unknown> }[];
    figures?: Record<string, unknown>;
  };
  const p = scene.placements[7];
  if (p?.role !== "twin") throw new Error("the fixture's twin isn't placement 7");
  p.mount = { on: "fx-shell", anchor: "floor", offset: [...offset] };
  if (twin) scene.figures = { ...scene.figures, twin };
  return stringify(scene, { aliasDuplicateObjects: false });
}

/** A talking clip that turns the hips about y from 0 to 0.6 rad over its second: the fixture model's box, 0.5 m wide
 *  and 0.24 m deep, reaches furthest along x at 0.4475 rad, 0.2773 m from its root, between the clip's keyframes. */
const turning = (): Uint8Array =>
  clipGlb("talking", {
    tracks: [
      {
        bone: "mixamorig:Hips",
        path: "rotation",
        values: [
          [0, 0, 0, 1],
          [0, Math.sin(0.3), 0, Math.cos(0.3)],
        ],
      },
    ],
    duration: 1,
  }).bytes;

describe("RA8 in the fixtures (plan.md R-19)", () => {
  // The talking clip turns; listening and greeting take the idle's motion, which turns nothing, so the talking clip
  // alone reaches toward the side wall. The default desk-lean stays: its quaternion's half-angle 0.25 rad turns the
  // hips 0.5 rad, 0.2769 m along x, past the wall at 0.27 m, but the twin never plays it without a lean.
  const idleMotion = (): Uint8Array => {
    const bytes = twinDefaults().clips.idle;
    if (!bytes) throw new Error("the fixture twin has no idle");
    return bytes;
  };
  const sideWall = (o: { offset: Vec3; policy?: RoomPolicy; options?: ComposeOptions }): ComposeResult =>
    compose(
      sideWallTree({
        [SCENE]: sceneAt(sideWallFiles().get(SCENE), o.offset),
        ...twinFolder({ clips: { talking: turning(), listening: idleMotion(), greeting: idleMotion() } }),
      }),
      o.policy ?? twinPolicy({ room: { legibility_floor_css_px: 5 } }),
      o.options ?? STRICT,
    );

  it("refuses a clip whose turn alone crosses a side wall, between its keyframes, and leaves the rest pose in", () => {
    // The side-wall shell's right wall is at x 2: the twin's root 0.27 m from it, its box 0.25 m wide at rest.
    const strict = sideWall({ offset: [1.73, 0, 0] });
    const found = ofRule(strict.findings, "RA8");
    expect(where(found)).toEqual(["RA8 apps/web/room/scene.yaml:placements[7].mount.offset"]);
    expect(found[0]?.reason).toMatch(
      /^the twin's `talking` clip reaches 0\.7 cm past the shell's right-wall at 0\.73 s/,
    );
    expect(found[0]?.lenient).toBe(true);
  });

  it("leaves a clip the twin doesn't play unmeasured: with no lean in the scene, the desk lean", () => {
    // The desk lean would reach 0.7 cm past the wall (above), but the scene gives no lean.
    const strict = sideWall({ offset: [1.73, 0, 0] });
    expect(ofRule(strict.findings, "RA8").some((f) => f.reason.includes("`desk-lean`"))).toBe(false);
  });

  it("warns in a lenient build and keeps the twin's own model", () => {
    const lenient = sideWall({ offset: [1.73, 0, 0], options: LENIENT });
    expect(ofRule(lenient.findings, "RA8").map((f) => f.lenient)).toEqual([true]);
    expect(lenient.scene.twin?.model.url).toMatch(/^a\/twin\.[0-9a-f]{16}\.glb$/);
  });

  it("passes the twin with each frame inside the walls", () => {
    expect(ofRule(sideWall({ offset: [1.7, 0, 0] }).findings, "RA8")).toEqual([]);
  });

  it("refuses the rest pose past the back, and every clip the twin plays with it, each in its own finding", () => {
    // The known-good shell's back is its bounds' min z, −1.25: the twin's box 0.12 m deep behind its root.
    const strict = compose(
      overlay({ [SCENE]: sceneAt(goodFiles().get(SCENE), [0, 0, -1.14]), ...twinFolder() }),
      twinPolicy(),
      STRICT,
    );
    const reasons = ofRule(strict.findings, "RA8").map((f) => f.reason);
    expect(reasons.map((r) => /^the twin's (rest pose|`[a-z-]+` clip) reaches/.exec(r)?.[1])).toEqual([
      "rest pose",
      "`idle` clip",
      "`talking` clip",
      "`listening` clip",
      "`greeting` clip",
    ]);
    expect(reasons[0]).toMatch(/^the twin's rest pose reaches 1\.0 cm past the shell's back at 0\.00 s/);
  });

  it("measures nothing where RA6 leaves the twin's own model out: the stand-in shows", () => {
    const strict = compose(
      overlay({ [SCENE]: sceneAt(goodFiles().get(SCENE), [0, 0, -1.14]), ...twinFolder() }),
      twinPolicy({ likeness: [] }),
      STRICT,
    );
    expect(ofRule(strict.findings, "RA6").length).toBeGreaterThan(0);
    expect(ofRule(strict.findings, "RA8")).toEqual([]);
  });

  it("holds no side wall where the shell names none: the known-good shell has a floor and a back wall", () => {
    const strict = compose(
      overlay({ [SCENE]: sceneAt(goodFiles().get(SCENE), [2.5, 0, 0]), ...twinFolder() }),
      twinPolicy(),
      STRICT,
    );
    expect(ofRule(strict.findings, "RA8")).toEqual([]);
  });
});
