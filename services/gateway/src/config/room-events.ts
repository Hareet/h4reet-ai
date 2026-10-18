// The room's event list (spec 002, contracts/room-events.md §3): config/room-events.yaml, `{schema: 1, kinds,
// objects, items}`, which apps/web/build/manifest.ts generates from the room's own lists and the resume's source and
// which make test keeps current. The gateway reads it once at start, from the same mounted config/ as its own four
// files, and POST /room/events checks each event's kind and ID against it.
//
// Unlike those four, it never stops the gateway: a missing or invalid file is a reason the startup log records
// (`room_events.unavailable`, telemetry.md §5.2), and every event is then answered 400. A reason names where the file
// is invalid, never a value from it.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { formatPath, parseYaml, type PathSegment } from "./load.js";

export const ROOM_EVENTS_FILE = "room-events.yaml";

/** The kinds and IDs the gateway counts. Every set is bounded, so the counter's series are too (telemetry.md §1). */
export interface RoomEventsConfig {
  kinds: ReadonlySet<string>;
  objects: ReadonlySet<string>;
  items: ReadonlySet<string>;
}

export type RoomEventsLoad =
  { ok: true; config: RoomEventsConfig } | { ok: false; reason: "missing" | "invalid"; path: string };

/** A kind's name, as src/room/events.ts writes them. */
const KIND = /^[a-z][a-z0-9_]{1,31}$/;
/** An object's or an item's ID: the manifest's ITEM_ID (contracts/resume-source.md §1), which the objects' IDs meet. */
const ID = /^[a-z][a-z0-9-]{1,40}$/;

const unique = (list: readonly string[]): boolean => new Set(list).size === list.length;
const names = (pattern: RegExp, max: number) =>
  z.array(z.string().regex(pattern)).max(max).refine(unique, { message: "duplicate" });

const SCHEMA = z.strictObject({
  schema: z.literal(1),
  kinds: names(KIND, 32).min(1),
  objects: names(ID, 64),
  items: names(ID, 256),
});

const invalid = (path: readonly PathSegment[]): RoomEventsLoad => ({
  ok: false,
  reason: "invalid",
  path: formatPath(path),
});

/** The file's text, checked: three sets, or where it's invalid. */
export function parseRoomEvents(text: string): RoomEventsLoad {
  const parsed = parseYaml(`config/${ROOM_EVENTS_FILE}`, text);
  if (parsed.issues.length > 0) return invalid([]);
  const result = SCHEMA.safeParse(parsed.data);
  if (!result.success) {
    const issue = result.error.issues[0];
    if (issue === undefined) return invalid([]);
    // An unknown key is named by the key itself, the one place a name from the file is reported: it is a key.
    const key = issue.code === "unrecognized_keys" ? issue.keys[0] : undefined;
    const path = issue.path.filter((p): p is PathSegment => typeof p === "string" || typeof p === "number");
    return invalid(key !== undefined && path.length === 0 ? [key] : path);
  }
  const { kinds, objects, items } = result.data;
  return { ok: true, config: { kinds: new Set(kinds), objects: new Set(objects), items: new Set(items) } };
}

/** `<dir>/room-events.yaml`, read and checked. It never throws: an unreadable file reads as invalid. */
export async function loadRoomEvents(dir: string): Promise<RoomEventsLoad> {
  let text: string;
  try {
    text = await readFile(join(dir, ROOM_EVENTS_FILE), "utf8");
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? { ok: false, reason: "missing", path: "" } : invalid([]);
  }
  return parseRoomEvents(text);
}
