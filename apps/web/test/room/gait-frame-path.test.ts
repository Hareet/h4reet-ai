// fix-019, I-2 (spec 019; FR-011, SC-007; plan.md §2.7): every function on a frame's gait path is read from the source
// and holds no array literal, no `new`, no object literal, and no function made in its body. gait-alloc.test.ts reads
// only `applyGait`'s and `clearGait`'s own bodies; this reads the whole path: the controller's `stepGait`
// (`scene/avatars.ts`) and every function of `scene/gait.ts` it reaches, followed call by call, so a helper added to
// the path is scanned without an edit here. `findLegRig` (and its `names`) run once per instance and stay out (plan
// §2.7). `advance` and `legOffsets` make a new object only when no `out` is given (`if (!out) return …`, `out ?? …`),
// which the controller never does (gait-alloc.test.ts pins its outs by identity); those two branches alone are let
// through. The last block plants allocations in a string and shows the scanner finds each.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const GAIT = source("../../src/room/scene/gait.ts");
const AVATARS = source("../../src/room/scene/avatars.ts");

type Fn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

const parse = (text: string): ts.SourceFile => ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true);

/** The module's own functions by name: its function declarations and its `const name = (…) => …` at the top level. */
function topLevel(file: ts.SourceFile): Map<string, Fn> {
  const out = new Map<string, Fn>();
  for (const s of file.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) out.set(s.name.text, s);
    if (ts.isVariableStatement(s))
      for (const d of s.declarationList.declarations)
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        )
          out.set(d.name.text, d.initializer);
  }
  return out;
}

/** A function declaration by name anywhere in the file (the controller's `stepGait` is inside `createAvatarFigures`). */
function declared(file: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    else ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The plain names a function calls (`f(…)`, not `x.f(…)`). */
function calls(fn: Fn): Set<string> {
  const out = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) out.add(node.expression.text);
    ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return out;
}

const isOut = (node: ts.Node): boolean => ts.isIdentifier(node) && node.text === "out";

/** The branch a pure function takes when no `out` is given: `if (!out) …`'s then, or `out ?? …`'s right side. */
function noOutBranch(node: ts.Node): ts.Node | undefined {
  if (
    ts.isIfStatement(node) &&
    ts.isPrefixUnaryExpression(node.expression) &&
    node.expression.operator === ts.SyntaxKind.ExclamationToken &&
    isOut(node.expression.operand)
  )
    return node.thenStatement;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
    isOut(node.left)
  )
    return node.right;
  return undefined;
}

interface Allocation {
  readonly fn: string;
  readonly kind: "array literal" | "new" | "object literal" | "function";
  readonly text: string;
}

/** What a function's parameters and body make: array and object literals, `new`, and functions (closures). Types are
 *  never counted (a type literal isn't an object literal), nor a destructuring. With `outBranches`, the no-`out`
 *  branches are skipped. */
function allocations(name: string, fn: Fn, outBranches = false): Allocation[] {
  const found: Allocation[] = [];
  const skip = new Set<ts.Node>();
  const visit = (node: ts.Node): void => {
    if (skip.has(node)) return;
    if (outBranches) {
      const branch = noOutBranch(node);
      if (branch) skip.add(branch);
    }
    const kind = ts.isArrayLiteralExpression(node)
      ? "array literal"
      : ts.isNewExpression(node)
        ? "new"
        : ts.isObjectLiteralExpression(node)
          ? "object literal"
          : ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)
            ? "function"
            : null;
    if (kind) found.push({ fn: name, kind, text: node.getText() });
    ts.forEachChild(node, visit);
  };
  for (const p of fn.parameters) visit(p);
  if (fn.body) visit(fn.body);
  return found;
}

/** The frame path: `stepGait`, then every gait function it calls, and every one those call, never `findLegRig`. */
function framePath(
  gait: ts.SourceFile,
  controller: ts.SourceFile,
): { step: ts.FunctionDeclaration; reached: string[] } {
  const step = declared(controller, "stepGait");
  if (!step) throw new Error("stepGait not found in avatars.ts");
  const own = topLevel(gait);
  const queue = [...calls(step)].filter((n) => own.has(n));
  const reached = new Set<string>();
  while (queue.length > 0) {
    const n = queue.pop() as string;
    if (reached.has(n)) continue;
    reached.add(n);
    for (const m of calls(own.get(n) as Fn)) if (own.has(m)) queue.push(m);
  }
  return { step, reached: [...reached].sort() };
}

/** The two pure functions whose no-`out` branch makes the fresh object their callers without an `out` get. */
const WITH_OUT = new Set(["advance", "legOffsets"]);

function scan(gaitText: string, controllerText: string): { reached: string[]; found: Allocation[] } {
  const [gait, controller] = [parse(gaitText), parse(controllerText)];
  const own = topLevel(gait);
  const { step, reached } = framePath(gait, controller);
  const found = [
    ...allocations("stepGait", step),
    ...reached.flatMap((n) => allocations(n, own.get(n) as Fn, WITH_OUT.has(n))),
  ];
  return { reached, found };
}

describe("a frame's gait path, read from the source (FR-011)", () => {
  const gait = parse(GAIT);
  const controller = parse(AVATARS);

  it("follows stepGait into every gait function a frame reaches, and not into findLegRig", () => {
    const { reached } = framePath(gait, controller);
    expect(reached).toEqual([
      "advance",
      "applyGait",
      "clearGait",
      "cycleLength",
      "depth",
      "lay",
      "layLeg",
      "leg",
      "legOffsets",
      "lower",
      "standingLift",
      "unlay",
    ]);
    expect(reached).not.toContain("findLegRig");
  });

  it("calls nothing from stepGait but the gait's own functions, so the path read is the whole of it", () => {
    const step = declared(controller, "stepGait") as ts.FunctionDeclaration;
    const own = topLevel(gait);
    expect([...calls(step)].filter((n) => !own.has(n))).toEqual([]);
  });

  it("has every gait function either on the frame path or named here as once per instance", () => {
    const { reached } = framePath(gait, controller);
    const once = ["findLegRig", "names"];
    expect([...topLevel(gait).keys()].filter((n) => !reached.includes(n) && !once.includes(n))).toEqual([]);
  });

  it("makes no array, object, or function, and calls no `new`, in stepGait or any function it reaches", () => {
    expect(scan(GAIT, AVATARS).found).toEqual([]);
  });
});

describe("the scanner, on planted source", () => {
  const controller = `
    function createAvatarFigures() {
      function stepGait(dt: number) {
        advance(state, 1, 1, dt, true, 1, state);
        applyGait(rig, offsets, 0);
      }
    }`;
  const gait = (body: string): string => `
    export function advance(state: S, d: number, s: number, dt: number, on: boolean, c: number, out?: O): S {
      if (!out) return { phase: 0, amp: 0 };
      out.phase = 0;
      return out;
    }
    export function applyGait(rig: R, offsets: { left: A; right: A }, lift = 0): void {
      lay(rig.left.hip, offsets.left.hip);
    }
    function lay(bone: B, angle: number): void {
      ${body}
    }
    export function findLegRig(root: O): R | null {
      return { left: [new Quaternion()], right: () => root };
    }`;

  it("finds nothing in the clean plant, findLegRig's allocations and advance's no-out branch let through", () => {
    expect(scan(gait("bone.on = true;"), controller)).toEqual({ reached: ["advance", "applyGait", "lay"], found: [] });
  });

  it.each([
    ["const t = [angle, 0];", "array literal"],
    ["bone.base.copy(new Quaternion());", "new"],
    ["bone.last = { angle };", "object literal"],
    ["const f = () => angle;", "function"],
  ] as const)("finds `%s` in a helper stepGait reaches only through applyGait: %s", (body, kind) => {
    const { found } = scan(gait(body), controller);
    expect(found.map((a) => [a.fn, a.kind])).toEqual([["lay", kind]]);
  });

  it("finds an allocation in stepGait itself", () => {
    const planted = controller.replace("applyGait(rig, offsets, 0);", "applyGait(rig, { left, right }, 0);");
    expect(scan(gait("bone.on = true;"), planted).found.map((a) => [a.fn, a.kind])).toEqual([
      ["stepGait", "object literal"],
    ]);
  });

  it("lets through only the no-out branch: an object made outside it, or after `other ??`, is found", () => {
    const outside = gait("bone.on = true;").replace("out.phase = 0;", "out.phase = [0][0];");
    expect(scan(outside, controller).found.map((a) => [a.fn, a.kind])).toEqual([["advance", "array literal"]]);
    const other = gait("bone.on = true;").replace("if (!out) return { phase: 0, amp: 0 };", "const o = state ?? {};");
    expect(scan(other, controller).found.map((a) => [a.fn, a.kind])).toEqual([["advance", "object literal"]]);
  });

  it("never counts a type literal or a destructuring as an object", () => {
    const { found } = scan(gait("const { on } = bone; const x: { a: number } = bone.q; x.a = on ? 1 : 0;"), controller);
    expect(found).toEqual([]);
  });
});
