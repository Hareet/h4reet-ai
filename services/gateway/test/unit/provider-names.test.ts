// Nothing outside src/adapters/ names a provider (SC-006; contracts/provider-adapter.md §4): the routes, the router,
// admission, the meter, telemetry, and alerts stay provider-agnostic, so a new provider is a new adapter module and a
// routing.yaml entry, and nothing else. The test reads every string and import in src/ with the TypeScript parser,
// so comments, which may explain a provider, don't count.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
/** Provider and adapter-type names, and the SDKs that reach them. "local" and "synthetic" are kinds too, so allowed. */
const PROVIDER = /bedrock|openai|anthropic|openrouter|aws-sdk|aws\.|converse|llama/i;

async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sources(path)));
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

/** Every string literal, template piece, and module specifier in a file. */
function strings(path: string, text: string): string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.ES2023, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) found.push(node.text);
    node.forEachChild(visit);
  };
  visit(file);
  return found;
}

describe("provider names", () => {
  it("appear in no string or import outside src/adapters/", async () => {
    const offenders: string[] = [];
    for (const path of await sources(SRC)) {
      const rel = relative(SRC, path);
      if (rel.startsWith("adapters/")) continue;
      for (const s of strings(path, await readFile(path, "utf8"))) {
        if (PROVIDER.test(s)) offenders.push(`${rel}: ${JSON.stringify(s)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("do appear inside src/adapters/, where the test would catch them if they moved", async () => {
    const texts = await Promise.all(
      (await sources(join(SRC, "adapters"))).map(async (p) => strings(p, await readFile(p, "utf8"))),
    );
    expect(texts.flat().some((s) => PROVIDER.test(s))).toBe(true);
  });
});
