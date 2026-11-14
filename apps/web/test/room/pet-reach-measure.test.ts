// T003's measure (spec 026; FR-007, SC-002; the page's Q162; plan.md R-03, §3): before the reach's own test, the twin's
// and the man's arms and spines read from their real models in Node, and the lean each needs to bring the head point of
// a 0.62 m dog at its default home within 0.98 (a + b) of the shoulder on the dog's side. It prints the table plan §3
// records, and asserts only what it reads: the bones are there and the numbers finite. Two leans are measured: about
// the hips (`solveLean`, the plan's closed form, the shoulder turned about the hips) and over `Spine`, `Spine1`, and
// `Spine2` in equal parts (FR-007's applier: each turned by a third about the same world axis), the one the reach moves.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Vector3 } from "three";
import type { Object3D } from "three";
import { describe, expect, it } from "vitest";

import { AVATAR_SHAPES } from "../../src/choice/avatars";
import { stripMorphs } from "../../src/room/scene/avatars";
import { parseModel } from "../../src/room/scene/gltf-images";
import type { Decode } from "../../src/room/scene/gltf-images";
import { solveLean } from "../../src/room/scene/pet-reach";
import type { Vec3 } from "../../src/room/scene/pet-reach";
import { REPO } from "../helpers/room";

/** Node has no createImageBitmap: each image stands in at its asked size, as twin-reach.test.ts does. */
const decode: Decode = (_source, options) =>
  Promise.resolve({
    width: options.resizeWidth ?? 1,
    height: options.resizeHeight ?? 1,
    close: () => undefined,
  } as unknown as ImageBitmap);

const DEG = Math.PI / 180;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
/** A turn about +y by `psi`, three's: +z goes to (sin psi, 0, cos psi). */
const yaw = (p: Vec3, psi: number): Vec3 =>
  v(p.x * Math.cos(psi) + p.z * Math.sin(psi), p.y, -p.x * Math.sin(psi) + p.z * Math.cos(psi));
/** Rodrigues: `r` turned by `t` about the unit axis `k`. */
function turn(r: Vec3, k: Vec3, t: number): Vec3 {
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const kx = v(k.y * r.z - k.z * r.y, k.z * r.x - k.x * r.z, k.x * r.y - k.y * r.x);
  const kr = k.x * r.x + k.y * r.y + k.z * r.z;
  return v(
    r.x * c + kx.x * s + k.x * kr * (1 - c),
    r.y * c + kx.y * s + k.y * kr * (1 - c),
    r.z * c + kx.z * s + k.z * kr * (1 - c),
  );
}

/** The room's numbers (plan §3): the twin's home, the default `turn_max_deg`, and the dog's two estimates. */
const TWIN_HOME = v(0.66, 0, 0.469);
const TURN_MAX = 60 * DEG;
const HOMES: ReadonlyArray<readonly [string, Vec3]> = [
  ["spec 025's estimate [0.36, 0.55]", v(0.36, 0, 0.55)],
  ["Q158's estimate [0.30, 0.45]", v(0.3, 0, 0.45)],
];
/** Where the dog's head is: its picture faces glTF's +z at `heading_deg` 0 (spec 025's R-10, spec 020's fixture), so
 *  the head is +z of its home; the other two are for the page's question, the dog turned away or toward the twin. */
const FACINGS = ["+z (heading_deg 0)", "-z (heading_deg 180)", "toward the twin"] as const;
/** man.glb's height, its precise bounds skinned (Box3), read once for this measure. */
const MAN_HEIGHT = 1.76;
const FIGURES: ReadonlyArray<readonly [string, string, number]> = [
  ["twin", "assets/twin/twin.glb", 1], // the twin's own size, unscaled (spec 016, FR-010)
  ["man", "assets/visitors/man/man.glb", 1.82], // the stand-in, scaled to `figures.twin_height` (the piece's h)
];

async function rig(file: string): Promise<Object3D> {
  const bytes = new Uint8Array(readFileSync(join(REPO, file)));
  const root = (await parseModel(bytes.slice().buffer, { reduced: false, decode })).gltf.scene;
  stripMorphs(root);
  root.updateMatrixWorld(true);
  return root;
}

describe("T003's measure: the lean the dog's default home needs (Q162)", () => {
  it("reads both rigs and prints the leans, about the hips and over the spine", async () => {
    const rows: string[] = [];
    for (const [name, file, height] of FIGURES) {
      const root = await rig(file);
      // The man scales to the twin's height (avatars.ts, R-05); the twin keeps its own size.
      const scale = name === "twin" ? 1 : height / MAN_HEIGHT;
      const at = (bone: string): Vec3 => {
        const o = root.getObjectByName(`mixamorig${bone}`);
        expect(o, bone).toBeDefined();
        const p = (o as Object3D).getWorldPosition(new Vector3());
        return v(p.x * scale, p.y * scale, p.z * scale);
      };
      // The dog is on the twin's right (−x of a figure facing +z), so the right arm (R-08's side).
      const [S0, E0, M0, H0] = [at("RightArm"), at("RightForeArm"), at("RightHandMiddle1"), at("Hips")];
      const spine = ["Spine", "Spine1", "Spine2"].map(at);
      const a = len(sub(E0, S0));
      const b = len(sub(M0, E0));
      const reach = 0.98 * (a + b);
      for (const x of [a, b, S0.y, H0.y]) expect(Number.isFinite(x) && x > 0).toBe(true);
      rows.push(
        `${name}: shoulder ${S0.y.toFixed(3)} m, a ${a.toFixed(3)} m, b ${b.toFixed(3)} m (to the middle finger's base), ` +
          `hips ${H0.y.toFixed(3)} m, 0.98 (a + b) ${reach.toFixed(3)} m`,
      );
      for (const [label, home] of HOMES) {
        const d = sub(home, TWIN_HOME);
        const psi = Math.max(-TURN_MAX, Math.min(TURN_MAX, Math.atan2(d.x, d.z)));
        const world = (p: Vec3): Vec3 => add(yaw(p, psi), TWIN_HOME);
        const [S, hips] = [world(S0), world(H0)];
        const pts = spine.map(world) as [Vec3, Vec3, Vec3];
        for (const facing of FACINGS) {
          const h = AVATAR_SHAPES.dog.height;
          const toTwin = sub(TWIN_HOME, home);
          const n = Math.hypot(toTwin.x, toTwin.z);
          const fwd =
            facing === FACINGS[0] ? v(0, 0, 1) : facing === FACINGS[1] ? v(0, 0, -1) : v(toTwin.x / n, 0, toTwin.z / n);
          const headPt = v(home.x + fwd.x * 0.35 * h, 0.9 * h, home.z + fwd.z * 0.35 * h);
          const back = sub(TWIN_HOME, headPt);
          const m = Math.hypot(back.x, back.z);
          // R-03's target: the head point lowered 0.03 m and moved 0.05 m toward the twin.
          const T = v(headPt.x + (0.05 * back.x) / m, headPt.y - 0.03, headPt.z + (0.05 * back.z) / m);
          const hipsLean = solveLean(S, hips, T, reach, 89 * DEG);
          const w = sub(T, hips);
          const wn = Math.hypot(w.x, w.z);
          const k = v(w.z / wn, 0, -w.x / wn);
          const chain = (t: number): Vec3 =>
            add(
              pts[0],
              add(
                turn(sub(pts[1], pts[0]), k, t / 3),
                add(turn(sub(pts[2], pts[1]), k, (2 * t) / 3), turn(sub(S, pts[2]), k, t)),
              ),
            );
          let spineLean = NaN;
          for (let deg = 0; deg <= 120; deg += 0.1) {
            if (len(sub(T, chain(deg * DEG))) <= reach) {
              spineLean = deg;
              break;
            }
          }
          const shortAt75 = Math.max(0, len(sub(T, chain(75 * DEG))) - reach);
          rows.push(
            `  ${label}, head ${facing}: turn ${(psi / DEG).toFixed(1)}°, shoulder to target ${len(sub(T, S)).toFixed(3)} m; ` +
              `lean about the hips ${(hipsLean / DEG).toFixed(1)}°; over the spine ` +
              `${Number.isNaN(spineLean) ? "> 120°" : `${spineLean.toFixed(1)}°`}, short at 75° by ${shortAt75.toFixed(3)} m`,
          );
        }
      }
    }
    console.log(rows.join("\n"));
    expect(rows.length).toBe(2 + 2 * HOMES.length * FACINGS.length);
  }, 120_000);
});
