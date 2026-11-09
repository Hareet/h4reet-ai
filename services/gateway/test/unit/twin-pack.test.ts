// T010 (spec 007; FR-007, FR-054; plan §4, §6): the gateway's loader of the twin's files. It accepts the committed
// pack and recomputes every hash; it refuses a pack with an unknown key, a hash that doesn't recompute, or a
// selectable whose file isn't in the pack; and a pack, prompt, or fixed lines file that is missing or invalid leaves
// the twin unavailable, logged by its reason, while nothing throws, so the gateway still starts.
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { loadTwin, twinFromTexts } from "../../src/config/twin.js";
import { canonicalHash } from "../../src/twin/hash.js";
import { parsePack } from "../../src/twin/pack.js";
import { REPO, committed, committedTexts } from "../helpers/twin.js";

type Rec = Record<string, unknown>;
const packObject = (): Rec => JSON.parse(committed("corpus.json")) as Rec;

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

describe("the pack's loader (FR-007)", () => {
  it("accepts the committed pack and recomputes its hashes, whole and per topic", () => {
    const load = parsePack(committed("corpus.json"));
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    const { pack } = load;
    expect(pack.sections.length).toBeGreaterThan(50);
    // The room's own topics and pieces, as config/room-topics.yaml names them (no ID of the data's stands here).
    const topics = parse(readFileSync(`${REPO}config/room-topics.yaml`, "utf8")) as {
      selectables: { id: string; topic: string }[];
    };
    expect(pack.topics.map((t) => t.id).sort()).toEqual([...new Set(topics.selectables.map((s) => s.topic))].sort());
    expect(pack.selectables.map((s) => s.id).sort()).toEqual(topics.selectables.map((s) => s.id).sort());
    expect(pack.selectables.length).toBeGreaterThanOrEqual(4);
    expect(pack.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const t of pack.topics) expect(t.sha256, t.id).toMatch(/^[0-9a-f]{64}$/);
    // Every hash is distinct: a topic's covers less than the whole.
    expect(new Set([pack.sha256, ...pack.topics.map((t) => t.sha256)]).size).toBe(pack.topics.length + 1);
  });

  it("refuses a pack with an unknown key, at any depth", () => {
    const top = { ...packObject(), extra: 1 };
    expect(parsePack(JSON.stringify(top))).toMatchObject({ ok: false, reason: "invalid" });
    const p = packObject();
    const sections = p.sections as Rec[];
    sections[0] = { ...sections[0], note: "x" };
    expect(parsePack(JSON.stringify(p))).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses a pack whose hashes don't recompute: a changed section, a changed whole hash, a changed topic hash", () => {
    const changedText = packObject();
    const first = (changedText.sections as Rec[])[0] as Rec;
    first.text = `${String(first.text)} and one more word`;
    expect(parsePack(JSON.stringify(changedText))).toMatchObject({ ok: false, reason: "invalid" });

    const changedWhole = { ...packObject(), sha256: canonicalHash({ not: "the pack" }) };
    expect(parsePack(JSON.stringify(changedWhole))).toMatchObject({ ok: false, reason: "invalid" });

    const changedTopic = packObject();
    const topic = (changedTopic.topics as Rec[])[0] as Rec;
    topic.sha256 = canonicalHash({ not: "the topic" });
    expect(parsePack(JSON.stringify(changedTopic))).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses a pack where a selectable names a file the pack doesn't hold", () => {
    const p = packObject();
    const selectables = p.selectables as Rec[];
    selectables[0] = { ...selectables[0], files: ["corpus/99-missing.md"] };
    expect(parsePack(JSON.stringify(p))).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses a pack that isn't JSON, and says so by reason only", () => {
    const load = parsePack("{ not json");
    expect(load).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("the twin's files at start (FR-054)", () => {
  it("is available with the committed pack, prompt, and fixed lines, whatever the readiness file holds", () => {
    const twin = twinFromTexts(committedTexts());
    expect(twin.available).toBe(true);
    if (!twin.available) return;
    expect(twin.files.promptSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(twin.files.lines.withheld.length).toBeGreaterThan(20);
    expect(twin.files.prompt.canary.length).toBeGreaterThan(10);
    expect(twin.readiness).toMatchObject({ ok: false, reason: "missing" });
  });

  for (const [name, texts] of [
    ["the pack missing", { pack: null }],
    ["the pack invalid", { pack: "[]" }],
    ["the prompt missing", { prompt: null }],
    ["the prompt with no marker section", { prompt: "# The twin's instructions\n\n## Who you are\n\nA twin.\n" }],
    ["the fixed lines missing", { lines: null }],
    ["the fixed lines invalid", { lines: "schema: 1\nlines: { other: x }\n" }],
    // The Author's line for a dropped denial is one of the fixed lines (spec 007's plan, D38).
    ["the fixed lines without not_said", { lines: "schema: 1\nlines: { withheld: A fixture line. }\n" }],
  ] as const) {
    it(`is unavailable with ${name}, and throws nothing`, () => {
      const twin = twinFromTexts({ ...committedTexts(), ...texts });
      expect(twin.available).toBe(false);
      if (twin.available) return;
      expect(twin.reason).toMatch(/^(pack|prompt|lines)_(missing|invalid)$/);
    });
  }

  it("loads from a config directory, and reads a missing folder as unavailable without throwing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "h4-twin-"));
    dirs.push(dir);
    expect((await loadTwin(dir)).available).toBe(false);
    await mkdir(join(dir, "twin"));
    for (const name of ["corpus.json", "prompt.md", "lines.yaml"] as const)
      await writeFile(join(dir, "twin", name), committed(name));
    const twin = await loadTwin(dir);
    expect(twin.available).toBe(true);
    expect(twin.readiness).toMatchObject({ ok: false, reason: "missing" });
    await writeFile(join(dir, "twin-readiness.yaml"), "schema: 2\n");
    expect((await loadTwin(dir)).readiness).toMatchObject({ ok: false, reason: "invalid" });
  });
});
