// T-B04 (spec 028; plan.md §2, R-B2): the scene's director's cost a frame, and no allocation a frame, as spec 025's
// chase-bench.test.ts measures its run.
// - Time: whole scenes, call to gone, on the shipped leave block's figures, frame by frame; the mean a frame stays under
//   0.2 ms, the best of three runs counting, so a loaded machine's pause doesn't.
// - Allocation, read from the source: the director's `frame` and every helper it runs a frame (`step`, `walk`, `at`,
//   `hideAll`, `begin`) hold no array literal, no `new`, no object literal, and no function made in their bodies. A
//   call to `call` or `left` runs once a scene, never a frame, and takes nothing made.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { DT, inputs, made } from "../helpers/dino-scene";

const BUDGET_MS = 0.2;
const FRAME_FUNCTIONS = ["frame", "step", "walk", "at", "hideAll", "begin"];

function bench(): number {
  const i = inputs();
  let frames = 0;
  const t0 = performance.now();
  for (let run = 0; run < 20; run += 1) {
    const t = made();
    while (t.scene.phase !== "gone") {
      t.scene.frame(DT, i);
      frames += 1;
    }
  }
  return (performance.now() - t0) / frames;
}

describe("the director's cost a frame", () => {
  it(`stays under ${BUDGET_MS} ms a frame, the best of three runs`, () => {
    const runs = [bench(), bench(), bench()];
    process.stdout.write(`dino scene: mean ms a frame per run ${runs.map((r) => r.toFixed(4)).join(", ")}\n`);
    expect(Math.min(...runs)).toBeLessThan(BUDGET_MS);
  });
});

/** The allocations in a function's body: array and object literals, `new`, and functions made there. */
function allocations(node: ts.Node, source: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isArrayLiteralExpression(n)) out.push(`array at ${n.getStart(source)}`);
    else if (ts.isObjectLiteralExpression(n)) out.push(`object at ${n.getStart(source)}`);
    else if (ts.isNewExpression(n)) out.push(`new at ${n.getStart(source)}`);
    else if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) out.push(`function at ${n.getStart(source)}`);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return out;
}

function frameBodies(text: string): Map<string, ts.Node> {
  const source = ts.createSourceFile("dino-scene.ts", text, ts.ScriptTarget.Latest, true);
  const found = new Map<string, ts.Node>();
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) && n.name && FRAME_FUNCTIONS.includes(n.name.text) && n.body)
      found.set(n.name.text, n.body);
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name) && FRAME_FUNCTIONS.includes(n.name.text) && n.body)
      found.set(n.name.text, n.body);
    ts.forEachChild(n, visit);
  };
  visit(source);
  return found;
}

describe("no allocation a frame (read from the source)", () => {
  const path = fileURLToPath(new URL("../../src/room/scene/dino-scene.ts", import.meta.url));
  const text = readFileSync(path, "utf8");

  it("finds every function a frame runs", () => {
    expect([...frameBodies(text).keys()].sort()).toEqual([...FRAME_FUNCTIONS].sort());
  });

  it.each(FRAME_FUNCTIONS)("%s makes nothing", (name) => {
    const source = ts.createSourceFile("dino-scene.ts", text, ts.ScriptTarget.Latest, true);
    const body = frameBodies(text).get(name);
    if (!body) throw new Error(`no ${name}`);
    expect(allocations(body, source)).toEqual([]);
  });

  it("finds each allocation planted in a function of that name", () => {
    const planted = `function frame() { const a = [1]; const b = { x: 1 }; const c = new Map(); const d = () => 1; }`;
    const source = ts.createSourceFile("p.ts", planted, ts.ScriptTarget.Latest, true);
    const body = frameBodies(planted).get("frame");
    if (!body) throw new Error("no frame");
    expect(allocations(body, source)).toHaveLength(4);
  });
});
