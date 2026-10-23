// The room's event list as the gateway reads it (spec 002, tasks.md T058/T059; contracts/room-events.md §3):
// config/room-events.yaml, `{schema: 1, kinds, objects, items}`, read once at start from the mounted config/. The
// committed file loads; a missing file and an invalid one each give a reason the startup log records, never a value
// from the file, and the gateway then answers every event 400 (the route's tests, test/integration/room-events.test.ts).
// Which objects the committed file lists is the room's data (spec 004, FR-007, SC-001; its research.md R-16), so its
// case holds the list's bounds and none of its IDs: adding, removing, or retargeting a selectable changes no source
// file. The other cases parse lists of their own, with synthetic IDs in `fx-`, a prefix the room's data never takes.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { parseYaml } from "../../src/config/load.js";
import { ROOM_EVENTS_FILE, loadRoomEvents, parseRoomEvents } from "../../src/config/room-events.js";

const REPO_CONFIG = fileURLToPath(new URL("../../../../config/", import.meta.url));

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function dirWith(text: string | undefined): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "h4-room-events-"));
  dirs.push(dir);
  if (text !== undefined) await writeFile(join(dir, ROOM_EVENTS_FILE), text, "utf8");
  return dir;
}

const VALID = [
  "schema: 1",
  "kinds:",
  '  - "object_selected"',
  '  - "item_selected"',
  '  - "mode_2d"',
  "objects:",
  '  - "fx-desk"',
  "items:",
  '  - "cht-agent"',
  "",
].join("\n");

describe("config/room-events.yaml", () => {
  it("is the file the build commits, and it loads with 1 to 64 unique objects, whichever they are", async () => {
    expect(ROOM_EVENTS_FILE).toBe("room-events.yaml");
    expect(await loadRoomEvents(REPO_CONFIG)).toMatchObject({ ok: true });
    // The list as the file writes it, since a set would hide a repeat.
    const text = await readFile(join(REPO_CONFIG, ROOM_EVENTS_FILE), "utf8");
    const { objects } = parseYaml(`config/${ROOM_EVENTS_FILE}`, text).data as { objects: unknown[] };
    expect(objects.length).toBeGreaterThanOrEqual(1);
    expect(objects.length).toBeLessThanOrEqual(64);
    expect(new Set(objects).size).toBe(objects.length);
  });

  it("parses a small list into its three sets", () => {
    const parsed = parseRoomEvents(VALID);
    expect(parsed).toEqual({
      ok: true,
      config: {
        kinds: new Set(["object_selected", "item_selected", "mode_2d"]),
        objects: new Set(["fx-desk"]),
        items: new Set(["cht-agent"]),
      },
    });
  });

  it("reads as missing when the file isn't there", async () => {
    expect(await loadRoomEvents(await dirWith(undefined))).toEqual({ ok: false, reason: "missing", path: "" });
  });

  it.each([
    ["not YAML", "schema: [1", ""],
    ["two documents", `${VALID}---\n${VALID}`, ""],
    ["a duplicate key", `${VALID}schema: 1\n`, ""],
    ["not a mapping", "- 1\n", ""],
    ["another schema", VALID.replace("schema: 1", "schema: 2"), "schema"],
    ["a key the contract doesn't name", `${VALID}paths:\n  - "engineer"\n`, "paths"],
    ["no kinds", VALID.replace(/kinds:\n( {2}- .*\n)+/, "kinds: []\n"), "kinds"],
    ["a kind that isn't a name", VALID.replace('"mode_2d"', '"Mode 2D"'), "kinds[2]"],
    ["an ID that isn't an ID", VALID.replace('"fx-desk"', '"../fx-desk"'), "objects[0]"],
    ["a number for an ID", VALID.replace('"cht-agent"', "7"), "items[0]"],
    ["the same ID twice", VALID.replace('  - "fx-desk"\n', '  - "fx-desk"\n  - "fx-desk"\n'), "objects"],
    ["the same kind twice", VALID.replace('  - "mode_2d"\n', '  - "mode_2d"\n  - "mode_2d"\n'), "kinds"],
  ])("reads as invalid with %s, naming where and never the value", (_name, text, path) => {
    const parsed = parseRoomEvents(text);
    expect(parsed).toEqual({ ok: false, reason: "invalid", path });
  });

  it("caps each list, so the counter's series stay bounded", () => {
    const many = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `  - "${prefix}${i}"`).join("\n");
    const tooManyItems = VALID.replace('items:\n  - "cht-agent"', `items:\n${many(257, "item-")}`);
    expect(parseRoomEvents(tooManyItems)).toEqual({ ok: false, reason: "invalid", path: "items" });
    const tooManyObjects = VALID.replace('objects:\n  - "fx-desk"', `objects:\n${many(65, "object-")}`);
    expect(parseRoomEvents(tooManyObjects)).toEqual({ ok: false, reason: "invalid", path: "objects" });
    const tooManyKinds = VALID.replace(/kinds:\n( {2}- .*\n)+/, `kinds:\n${many(33, "kind_")}\n`);
    expect(parseRoomEvents(tooManyKinds)).toEqual({ ok: false, reason: "invalid", path: "kinds" });
  });
});
