// T019 (spec 012; FR-029, FR-033, FR-034, FR-035; SC-004; contracts/hints.md §5): the repository's own hints,
// apps/web/room/hints.yaml, as the room's build fills them. Fifteen, in The Hint Copy's order and words; the Author's
// three equal his quotes in the intent exactly, typing included, with no `when` (D6, which he approved as taken); every
// word a session hint types in quotation marks, where no UI word holds it exactly, pinned to its source, so a rename
// fails here rather than leaving a hint wrong; every figure the configuration's; and each hint, filled, at most 160
// characters and 25 words.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { formatAmount } from "../../build/room/hints";
import { PATHS } from "../../src/choice/visit";
import { REPO, WEB, repositoryBundle, roomIndex } from "../helpers/room";

interface HintEntry {
  id: string;
  by: "author" | "session";
  text: string;
  words_from?: { file: string; quote: string }[];
  sources?: string[];
  when?: string;
}

const file = (): { version: number; hints: HintEntry[] } =>
  parse(readFileSync(join(WEB, "room/hints.yaml"), "utf8")) as { version: number; hints: HintEntry[] };
const read = (path: string): string => readFileSync(join(REPO, path), "utf8");
const yamlOf = <T>(path: string): T => parse(read(path)) as T;

/** The Hint Copy's rows in spec.md, as they will appear: by, and the text. */
function hintCopy(): { by: string; text: string }[] {
  const spec = read("specs/012-loading-screen/spec.md");
  const section = spec.slice(spec.indexOf("## The Hint Copy"), spec.indexOf("## Constitution Check"));
  return section
    .split("\n")
    .flatMap((row) => {
      const m = /^\| (\d+) \| (the Author|the session) \| (.+?) \| .+ \| .+ \|$/.exec(row);
      return m ? [{ n: Number(m[1]), by: m[2] ?? "", text: m[3] ?? "" }] : [];
    })
    .sort((a, b) => a.n - b.n)
    .map(({ by, text }) => ({ by, text }));
}

/** A text with every dollar amount in it as one token: the figures are the configuration's, checked on their own. */
const figuresOut = (text: string): string => text.replace(/\$\d+(?:\.\d+)?/g, "$N");

const words = (text: string): number => text.split(/\s+/).filter((w) => w !== "").length;

describe("the repository's hints (T019)", () => {
  it("are fifteen, in The Hint Copy's order and words, each built into the index", () => {
    const copy = hintCopy();
    expect(copy).toHaveLength(15);
    const hints = file().hints;
    expect(hints).toHaveLength(15);
    expect(hints.map((h) => (h.by === "author" ? "the Author" : "the session"))).toEqual(copy.map((c) => c.by));
    const built = roomIndex().hints;
    expect(built).toHaveLength(15);
    expect(built.map(figuresOut)).toEqual(copy.map((c) => figuresOut(c.text)));
    expect(repositoryBundle().findings.filter((f) => f.file === "apps/web/room/hints.yaml")).toEqual([]);
  });

  it("give the Author's three exactly as he typed them in the intent, with no when (D6)", () => {
    const intent = read("specs/012-loading-screen/intent.md");
    const author = file().hints.filter((h) => h.by === "author");
    expect(author.map((h) => h.text)).toEqual([
      "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure.",
      "Ask about the latest work",
      "click on objects to have the twin start discussing them",
    ]);
    for (const h of author) {
      expect(h.when, h.id).toBeUndefined();
      expect(h.words_from, h.id).toEqual([{ file: "specs/012-loading-screen/intent.md", quote: h.text }]);
      // In his quotation marks in his words, typing included.
      expect(intent.includes(`"${h.text}"`), h.id).toBe(true);
    }
    expect(
      file()
        .hints.slice(0, 3)
        .every((h) => h.by === "author"),
    ).toBe(true);
  });

  it("cite only files the tree holds", () => {
    for (const h of file().hints.filter((x) => x.by === "session")) {
      expect(h.sources?.length, h.id).toBeGreaterThan(0);
      for (const source of h.sources ?? []) expect(() => read(source), `${h.id}: ${source}`).not.toThrow();
    }
  });

  it("pin each word a session hint types to its source (contracts/hints.md §5)", () => {
    const built = roomIndex().hints;
    const ui = roomIndex().ui;
    // Hint 5: the conversation's submit button's words.
    expect(built[4]).toContain("press Send");
    expect(read("apps/web/src/talk/talk.ts")).toContain('h(doc, "button", { type: "submit" }, "Send")');
    // Hint 6: the paths' names.
    expect(PATHS.map((p) => p.name)).toEqual(["Engineer", "Not an engineer"]);
    for (const name of PATHS.map((p) => p.name)) expect(built[5]).toContain(`"${name}"`);
    // Hint 7: the walking keys, as walk.help names them.
    for (const typed of ["W, A, S, D", "arrow keys", "Q and E"]) {
      expect(built[6]).toContain(typed);
      expect(ui["walk.help"]).toContain(typed);
    }
    // Hint 10: the sign's own marks, the first word of sign.local and the last of sign.estimated.
    expect(built[9]).toContain('"local"');
    expect(built[9]).toContain('"est."');
    expect(ui["sign.local"]?.split(" ")[0]).toBe("local");
    expect(ui["sign.estimated"]?.split(" ").at(-1)).toBe("est.");
  });

  it("fill every figure from the configuration that enforces it (D5)", () => {
    const built = roomIndex().hints;
    const budgets = yamlOf<{ envs: { prod: Record<string, number> } }>("config/budgets.yaml").envs.prod;
    const routing = yamlOf<{ adapters: Record<string, { model?: string }>; envs: { prod: { fallback: string } } }>(
      "config/routing.yaml",
    );
    const model = routing.adapters[routing.envs.prod.fallback]?.model;
    const prices = yamlOf<{ versions: { entries: { model: string; input: number; output: number }[] }[] }>(
      "config/prices.yaml",
    );
    const entry = prices.versions.at(-1)?.entries.find((e) => e.model === model);
    expect(entry, "prod's fallback model in the price table's last version").toBeDefined();
    const amount = (n: number | undefined): string => formatAmount(n ?? Number.NaN) ?? "unfillable";
    expect(built[11]).toContain(`${amount(entry?.input)} per million input tokens`);
    expect(built[11]).toContain(`${amount(entry?.output)} per million output tokens`);
    expect(built[12]).toContain(`inside a ${amount(budgets.fallback_daily_usd)} fallback sub-budget a day`);
    expect(built[13]).toContain(`${amount(budgets.daily_usd)} a day, ${amount(budgets.monthly_usd)} a month`);
    // No figure is typed in the file: each is a slot (RT3).
    for (const h of file().hints) expect(h.text.replace(/\{[^}]*\}/g, ""), h.id).not.toMatch(/\d/);
  });

  it("are each at most 160 characters and 25 words, filled", () => {
    for (const hint of roomIndex().hints) {
      expect(hint.length, hint).toBeLessThanOrEqual(160);
      expect(words(hint), hint).toBeLessThanOrEqual(25);
    }
  });
});
