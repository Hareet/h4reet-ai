// rv-impl-025's N-4 (spec 025; FR-029; plan.md R-10): the avatar controller's frame, `update`, makes no list. The
// figures it walks (`wanting`: the hand-off's two and the room's dog where it wants a model) are a list made once,
// since only the twin's `wants` ever changes, never which figures there are; `both` too. Read from the source, as
// chase-bench.test.ts reads the run's path.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const file = ts.createSourceFile(
  "avatars.ts",
  readFileSync(fileURLToPath(new URL("../../src/room/scene/avatars.ts", import.meta.url)), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);

/** The first node under `scope` that `match` picks. */
function find<T extends ts.Node>(scope: ts.Node, match: (n: ts.Node) => n is T): T | null {
  let out: T | null = null;
  const visit = (n: ts.Node): void => {
    if (out) return;
    if (match(n)) out = n;
    else ts.forEachChild(n, visit);
  };
  ts.forEachChild(scope, visit);
  return out;
}

const controller = find(
  file,
  (n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === "createAvatarFigures",
);
const declared = (name: string): ts.VariableDeclaration | null =>
  controller
    ? find(
        controller,
        (n): n is ts.VariableDeclaration =>
          ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name,
      )
    : null;
const update = controller
  ? find(
      controller,
      (n): n is ts.MethodDeclaration =>
        ts.isMethodDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "update",
    )
  : null;
const isFunction = (n: ts.Node | undefined): boolean =>
  n !== undefined && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));

describe("the controller's frame makes no list (N-4; FR-029)", () => {
  it.each(["wanting", "both"])("has `%s` as a list made once, not a function that makes one a call", (name) => {
    const d = declared(name);
    expect(d, `${name} declared in createAvatarFigures`).not.toBeNull();
    expect(isFunction(d?.initializer)).toBe(false);
  });

  it("walks only lists made once in `update`: each loop's list a name, never a call, and no list literal in it", () => {
    expect(update).not.toBeNull();
    const lists: string[] = [];
    const literals: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isForOfStatement(n)) lists.push(n.expression.getText());
      if (ts.isArrayLiteralExpression(n) || ts.isSpreadElement(n)) literals.push(n.getText());
      ts.forEachChild(n, visit);
    };
    if (update?.body) visit(update.body);
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.filter((l) => l.includes("("))).toEqual([]);
    expect(literals).toEqual([]);
  });
});
