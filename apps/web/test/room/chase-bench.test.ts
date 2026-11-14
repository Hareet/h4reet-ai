// T016 (spec 025; FR-029, SC-005): the run's cost a frame, and no allocation a frame.
// - Time: a seeded benchmark of 600 frames on the room's own floor (the composed `scene.yaml`), the dinosaur walking
//   at the walking speed toward the nearer figure with seeded turns, through the shell (chase-figures.ts) over the
//   room's pictures and a controller that does nothing: the director, both figures' steering, and the pictures' places.
//   Its mean a frame stays under 0.2 ms; the best of three runs counts, so a loaded machine's pause doesn't.
// - Allocation, read from the source as gait-frame-path.test.ts reads the gait's path: every function a frame runs
//   (the shell's `frame`, `place`, and `atHome`; the director's `frame` and its helpers; `pursuerPresent` and
//   `dogRole`; chase-steer.ts's `steer`, `walkHome`, and their helpers; spec 008's `slideInto` and its helpers; the
//   controller's `stride`) holds no array literal, no `new`, no object literal, and no function made in its body. An
//   object literal given to `note`, `signal`, or `twinActivity` is let through: each runs once at a start, an end, or a
//   change, never a frame. The last block plants allocations in a string and shows the scanner finds each.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Group, Object3D } from "three";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { floorOfPart } from "../../src/room/compose/floor";
import { origin } from "../../src/room/compose/math";
import { resolveMounts } from "../../src/room/compose/mount";
import { createChaseFigures } from "../../src/room/scene/chase-figures";
import type { ChaseAvatars } from "../../src/room/scene/chase-figures";
import { repositoryBundle } from "../helpers/room";

const FRAMES = 600;
const DT = 1 / 60;
const BUDGET_MS = 0.2;

/** A seeded generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One seeded run of FRAMES frames through the shell on the room's floor: its mean milliseconds a frame. */
function bench(seed: number): number {
  const part = repositoryBundle().scene;
  const floor = floorOfPart(part, part.walking.radius_m);
  if (!floor) throw new Error("no floor");
  const twinAt = origin(resolveMounts(part.placements, part.pieces).world.get(part.figures.twin) as never);
  const root = new Object3D();
  const placement = new Object3D();
  placement.position.set(twinAt[0], 0, twinAt[2]);
  const twin = new Group();
  placement.add(twin);
  root.add(placement);
  const dogHome = part.figures.dog?.home;
  if (!dogHome) throw new Error("no figures.dog");
  const dog = new Group();
  dog.position.set(dogHome.at[0], 0, dogHome.at[1]);
  dog.rotation.set(0, (dogHome.heading_deg * Math.PI) / 180 + Math.PI, 0);
  root.add(dog);
  root.updateMatrixWorld(true);
  const none = (): void => undefined;
  const legs = {} as never;
  const clip = {} as never;
  const avatars: ChaseAvatars = {
    shows: () => true,
    pictureOf: (id) => (id === "twin" ? twin : id === "dog" ? dog : null),
    legsOf: () => legs,
    clipOf: () => clip,
    dogPlays: none,
    twinActivity: none,
    stride: none,
  };
  const pose = { x: floor.start.x, z: floor.start.z, heading: 0, speed: 0, walking: true };
  const walking = { on: true, pose };
  const shell = createChaseFigures({ floor, part, avatars, walking, chosen: "dinosaur" });
  const motion = { animate: true, paused: false, level: 0 };
  const random = seeded(seed);
  const speed = part.walking.speed_mps;
  // The dinosaur's path, made before the clock starts: toward the nearer figure's home with seeded turns, held to the
  // floor's bounds (its obstacles are the steering's to meet, not the benchmark's).
  const path: { x: number; z: number }[] = [];
  let [x, z] = [floor.start.x, floor.start.z];
  for (let i = 0; i < FRAMES; i += 1) {
    const toward = Math.atan2(twinAt[2] - z, twinAt[0] - x) + (random() - 0.5) * 1.5;
    x = Math.min(floor.bounds.x1, Math.max(floor.bounds.x0, x + Math.cos(toward) * speed * DT));
    z = Math.min(floor.bounds.z1, Math.max(floor.bounds.z0, z + Math.sin(toward) * speed * DT));
    path.push({ x, z });
  }
  const t0 = performance.now();
  for (let i = 0; i < FRAMES; i += 1) {
    const p = path[i] as { x: number; z: number };
    pose.x = p.x;
    pose.z = p.z;
    shell.frame(DT, motion);
  }
  return (performance.now() - t0) / FRAMES;
}

describe("the run's cost a frame (FR-029, SC-005)", () => {
  it(`stays under ${BUDGET_MS} ms a frame over ${FRAMES} seeded frames on the room's floor`, () => {
    bench(1); // a warm-up run, so the engine has compiled the path
    const runs = [bench(2), bench(3), bench(4)];
    const best = Math.min(...runs);
    process.stdout.write(
      `chase bench: ${FRAMES} frames, mean ms a frame per run ${runs.map((r) => r.toFixed(4)).join(", ")}; best ${best.toFixed(4)}\n`,
    );
    expect(best).toBeLessThan(BUDGET_MS);
  });
});

// ---- No allocation a frame, read from the source ----

const source = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const parse = (text: string): ts.SourceFile => ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true);

type Body = ts.Node;
interface Allocation {
  readonly where: string;
  readonly kind: string;
  readonly text: string;
}

/** Call targets whose object-literal argument is let through: each runs at a start, an end, or a change. */
const ONCE = new Set(["note", "signal", "twinActivity"]);
const calleeName = (call: ts.CallExpression): string => {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return "";
};

/** Every allocation in a function's body: array and object literals, `new`, and functions made in it. */
function allocations(where: string, body: Body): Allocation[] {
  const found: Allocation[] = [];
  const add = (kind: string, node: ts.Node): void => {
    found.push({ where, kind, text: node.getText().slice(0, 60) });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isArrayLiteralExpression(node)) add("array literal", node);
    else if (ts.isObjectLiteralExpression(node)) {
      const parent = node.parent;
      if (!(ts.isCallExpression(parent) && ONCE.has(calleeName(parent)))) add("object literal", node);
    } else if (ts.isNewExpression(node)) add("new", node);
    else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))
      add("function", node);
    else if (ts.isArrayBindingPattern(node)) add("array destructuring", node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

/** A named function's body anywhere in the file: a function declaration, a `const name = (…) => …`, or a method. */
function bodyOf(file: ts.SourceFile, name: string, within?: string): Body {
  let scope: ts.Node = file;
  if (within) scope = bodyOf(file, within);
  let out: Body | null = null;
  const visit = (node: ts.Node): void => {
    if (out) return;
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.body
    )
      out = node.body;
    else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    )
      out = node.initializer.body;
    else ts.forEachChild(node, visit);
  };
  ts.forEachChild(scope, visit);
  if (!out) throw new Error(`no function ${name}${within ? ` in ${within}` : ""}`);
  return out;
}

const FRAME_PATH: readonly { file: string; names: readonly string[]; within?: string }[] = [
  { file: "../../src/room/scene/chase-figures.ts", names: ["frame"], within: "createChaseFigures" },
  { file: "../../src/room/scene/chase-figures.ts", names: ["place", "atHome"] },
  {
    file: "../../src/room/scene/chase.ts",
    names: ["frame", "flee", "putHome", "back", "off", "away", "moving", "whoOf"],
    within: "createChase",
  },
  { file: "../../src/room/scene/chase.ts", names: ["pursuerPresent", "dogRole"] },
  {
    file: "../../src/room/scene/chase-steer.ts",
    names: ["steer", "walkHome", "travel", "score", "penalty", "clearanceAt", "turnToward"],
  },
  { file: "../../src/room/walk/movement.ts", names: ["slideInto", "clampAxis", "blocks", "headingOf"] },
  { file: "../../src/room/scene/avatars.ts", names: ["stride"], within: "createAvatarFigures" },
];

describe("no allocation a frame (FR-029, SC-005)", () => {
  it("finds none on the run's frame path", () => {
    const found = FRAME_PATH.flatMap(({ file, names, within }) => {
      const parsed = parse(source(file));
      return names.flatMap((n) => allocations(`${file.split("/").at(-1)}:${n}`, bodyOf(parsed, n, within)));
    });
    expect(found).toEqual([]);
  });

  it("finds each planted allocation, and lets a note's object through", () => {
    const planted = parse(`
      function a() { const xs = [1, 2]; }
      function b() { const p = { x: 1 }; }
      function c() { const v = new Thing(); }
      function d() { const f = () => 1; }
      function e() { for (const g of [x, y]) g(); }
      function f() { options.note?.({ state: "started", who: "both" }); avatars.twinActivity({ kind: "flee", on }); }
      function g() { const [m, n] = pair; }
    `);
    const kinds = (n: string): string[] => allocations(n, bodyOf(planted, n)).map((x) => x.kind);
    expect(kinds("a")).toEqual(["array literal"]);
    expect(kinds("b")).toEqual(["object literal"]);
    expect(kinds("c")).toEqual(["new"]);
    expect(kinds("d")).toEqual(["function"]);
    expect(kinds("e")).toEqual(["array literal"]);
    expect(kinds("f")).toEqual([]);
    expect(kinds("g")).toEqual(["array destructuring"]);
  });
});
