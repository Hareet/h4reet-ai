// The room's manifest and its fixed messages (spec 002, T045, T046; data-model.md §5 and §7; contracts/room-events.md
// §3). One source: the objects, avatars, and event kinds the page itself uses (src/), and the resume's item IDs from
// its source. From it come:
// - dist/room-manifest.json, written at build: the objects with `ready: false`, free talk not ready, the items, the
//   avatars, `placeholders: true`, and the event kinds;
// - config/room-events.yaml, committed, which the gateway's events route will read (Phase 6). `npm run manifest -w
//   apps/web` rewrites it, and test/manifest.test.ts fails make test while it's stale;
// - the module `virtual:room-content`, which bundles the manifest and content/messages.yaml into the page, so the
//   room shows its fixed messages without a request.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";
import { parse } from "yaml";

import { AVATARS } from "../src/choice/avatars";
import type { AvatarId } from "../src/choice/avatars";
import type { RoomIndex } from "../src/room/compose/bundle";
import { EVENT_KINDS } from "../src/room/events";
import type { EventKind } from "../src/room/events";
import { ROOM_OBJECTS } from "../src/room/objects";
import type { ObjectId } from "../src/room/objects";
import { MESSAGE_IDS, isMessageId } from "../src/talk/messages";
import type { MessageId, Messages } from "../src/talk/messages";
import { REPO_ROOT } from "./policy";
import type { RoomManifest as BundleManifest } from "./room/emit";

/** Where the gateway reads the events' kinds and IDs, from the repository's root. */
export const ROOM_EVENTS_PATH = "config/room-events.yaml";
/** The resume's source (Phase 3), from the repository's root. */
export const RESUME_SOURCE = "apps/web/content/resume.yaml";
/** An item's ID, as contracts/resume-source.md §1 and data-model.md §2 give it. */
const ITEM_ID = /^[a-z][a-z0-9-]{1,40}$/;

/**
 * Whether the room uses placeholder geometry or avatars: true until spec 003's assets replace them (Phase 10, T078).
 * Spec 001's `make release` refuses a build that says so.
 */
export const PLACEHOLDERS = true;

export interface RoomManifest {
  objects: { id: ObjectId; topic: string; ready: boolean }[];
  free_talk: { ready: boolean };
  items: string[];
  avatars: AvatarId[];
  placeholders: boolean;
  event_kinds: EventKind[];
}

/** What the page gets at build: its fixed messages and its manifest. */
export interface RoomContent {
  messages: Messages;
  manifest: RoomManifest;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The resume's item IDs, in order, from the tree's resume source; none while there is no source. */
export function itemIds(root: string): string[] {
  const path = join(root, RESUME_SOURCE);
  if (!existsSync(path)) return [];
  const refuse = (why: string): never => {
    throw new Error(`${RESUME_SOURCE}: ${why} (contracts/resume-source.md §1)`);
  };
  const doc = parse(readFileSync(path, "utf8")) as unknown;
  if (!isObject(doc) || !Array.isArray(doc.sections)) return refuse("sections isn't a list");
  const ids: string[] = [];
  doc.sections.forEach((section: unknown, s: number) => {
    if (!isObject(section) || !Array.isArray(section.items)) return refuse(`sections[${s}].items isn't a list`);
    section.items.forEach((item: unknown, i: number) => {
      const at = `sections[${s}].items[${i}]`;
      if (!isObject(item) || typeof item.id !== "string") return refuse(`${at} has no item id`);
      if (!ITEM_ID.test(item.id)) return refuse(`${at}'s item id "${item.id}" isn't ^[a-z][a-z0-9-]{1,40}$`);
      if (ids.includes(item.id)) return refuse(`the item id "${item.id}" appears twice`);
      ids.push(item.id);
    });
  });
  return ids;
}

/** The manifest, from the room's own lists and the tree's resume source. Readiness is false until the twin's spec. */
export function buildManifest(root: string): RoomManifest {
  return {
    objects: ROOM_OBJECTS.map((o) => ({ id: o.id, topic: o.topic, ready: false })),
    free_talk: { ready: false },
    items: itemIds(root),
    avatars: AVATARS.map((a) => a.id),
    placeholders: PLACEHOLDERS,
    event_kinds: [...EVENT_KINDS],
  };
}

const list = (key: string, values: readonly string[]): string =>
  values.length === 0 ? `${key}: []\n` : `${key}:\n${values.map((v) => `  - "${v}"\n`).join("")}`;

/** config/room-events.yaml's text: `{schema: 1, kinds, objects, items}`, every value quoted for any YAML reader. */
export function roomEventsYaml(manifest: RoomManifest): string {
  return [
    ...ROOM_EVENTS_HEADER.map((line) => `${line}\n`),
    "schema: 1\n",
    list("kinds", manifest.event_kinds),
    list(
      "objects",
      manifest.objects.map((o) => o.id),
    ),
    list("items", manifest.items),
  ].join("");
}

const ROOM_EVENTS_HEADER = [
  "# The usage events' kinds and IDs, which the gateway's POST /room/events accepts (spec 002, contracts/room-events.md",
  "# §3). Generated by apps/web/build/manifest.ts from the room's own lists and the resume's source: don't edit it by",
  "# hand. `npm run manifest -w apps/web` rewrites it, and make test fails while it's stale.",
];

// ---- Spec 004's manifest and config files, from the room's data (Amendment B7; contracts/room-bundle.md §6 to §8).
// The compositor (build/room/emit.ts) builds them from a compose's parts; spec 002's buildManifest and
// roomContentModule above stay wired until the room's data replaces ROOM_OBJECTS (spec 004, T096).

/** What B7's manifest is built from, a compose's parts: its index (the build, the live source, the selectables, and
 *  the topics' readiness), the placements and poses that show stand-ins with their reasons, the caps' source and
 *  SHA-256 as the policy read them, and the resume's item IDs. */
export interface ManifestParts {
  readonly index: Pick<RoomIndex, "build" | "live" | "selectables" | "topics">;
  readonly standins: BundleManifest["standins"];
  readonly caps: BundleManifest["caps"];
  readonly items: readonly string[];
}

/** B7's room-manifest.json: the objects from the selectables in scene order, `placeholders` as the index computed it,
 *  the stand-ins and why, the live source, the build's kind, and the caps, beside spec 002's free talk, items, avatars,
 *  and event kinds. Readiness is false until the twin's spec, and null for a resume action. */
export function roomManifest(parts: ManifestParts): BundleManifest {
  const ready = new Map(parts.index.topics.map((t) => [t.id, t.ready]));
  return {
    objects: parts.index.selectables.map((s) =>
      s.action.kind === "talk"
        ? { id: s.id, action: "talk" as const, topic: s.action.topic, ready: ready.get(s.action.topic) ?? false }
        : { id: s.id, action: "resume" as const, topic: null, ready: null },
    ),
    free_talk: { ready: false },
    items: [...parts.items],
    avatars: AVATARS.map((a) => a.id),
    placeholders: parts.index.build.placeholders,
    standins: parts.standins.map((s) => ({ placement: s.placement, reason: s.reason })),
    live_source: parts.index.live.source,
    build_kind: parts.index.build.kind,
    caps: { source: parts.caps.source, sha256: parts.caps.sha256 },
    event_kinds: [...EVENT_KINDS],
  };
}

const GENERATED_EVENTS_HEADER = [
  "# The usage events' kinds and IDs, which the gateway's POST /room/events accepts (spec 002, contracts/room-events.md",
  "# §3); its objects are the room's selectables (spec 004, Amendment B7). Don't edit it by hand:",
  "# `npm run room:generate -w apps/web` writes it from apps/web/room/scene.yaml and the resume's source, and make test",
  "# fails while it's stale.",
];

/** config/room-events.yaml from B7's manifest (contracts/room-bundle.md §7): spec 002's exact shape, `{schema: 1,
 *  kinds, objects, items}`, every value quoted. */
export function roomEventsFile(manifest: Pick<BundleManifest, "event_kinds" | "objects" | "items">): string {
  return [
    ...GENERATED_EVENTS_HEADER.map((line) => `${line}\n`),
    "schema: 1\n",
    list("kinds", manifest.event_kinds),
    list(
      "objects",
      manifest.objects.map((o) => o.id),
    ),
    list("items", manifest.items),
  ].join("");
}

/** A talk selectable's entry in config/room-topics.yaml. */
export interface TopicEntry {
  readonly id: string;
  readonly topic: string;
  readonly corpus: readonly string[];
  readonly lead: string | null;
}

const TOPICS_HEADER = [
  "# The selectables' topics, which the twin's spec reads (spec 004, FR-038; contracts/room-bundle.md §8). Generated by",
  "# `npm run room:generate -w apps/web` from apps/web/room/scene.yaml and topics.yaml: don't edit it by hand. make test",
  "# fails while it's stale.",
];

/** config/room-topics.yaml (contracts/room-bundle.md §8): one entry for each talk selectable, in scene order, every
 *  value double-quoted, `lead` the selectable's or null. It holds no phrase, live value, or quote. */
export function roomTopicsFile(entries: readonly TopicEntry[]): string {
  const quote = (value: string): string => JSON.stringify(value);
  const body =
    entries.length === 0
      ? "selectables: []\n"
      : `selectables:\n${entries
          .map(
            (e) =>
              `  - id: ${quote(e.id)}\n    topic: ${quote(e.topic)}\n    corpus: [${e.corpus.map(quote).join(", ")}]\n` +
              `    lead: ${e.lead === null ? "null" : quote(e.lead)}\n`,
          )
          .join("")}`;
  return [...TOPICS_HEADER.map((line) => `${line}\n`), "schema: 1\n", body].join("");
}

/** The first line where the committed file and the build's differ, for make test's message; null when they agree. */
export function firstDifference(committed: string, fresh: string): string | null {
  const a = committed.split("\n");
  const b = fresh.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}: committed "${a[i] ?? ""}", the build writes "${b[i] ?? ""}"`;
    }
  }
  return null;
}

/** content/messages.yaml, checked: every message data-model.md §7 names, once, with text, and nothing else. */
export function parseMessages(text: string, source: string): Messages {
  const refuse = (why: string): never => {
    throw new Error(`${source}: ${why} (data-model.md §7)`);
  };
  const doc = parse(text) as unknown;
  if (!isObject(doc) || !Array.isArray(doc.messages)) return refuse("messages isn't a list");
  const out: Partial<Record<MessageId, string>> = {};
  doc.messages.forEach((entry: unknown, i: number) => {
    if (!isObject(entry) || typeof entry.id !== "string") return refuse(`messages[${i}] has no id`);
    const id = entry.id;
    if (!isMessageId(id)) return refuse(`"${id}" isn't one of the room's messages`);
    if (out[id] !== undefined) return refuse(`"${id}" appears twice`);
    if (typeof entry.text !== "string" || entry.text.trim() === "") return refuse(`"${id}" has no text`);
    out[id] = entry.text.trim();
  });
  for (const id of MESSAGE_IDS) if (out[id] === undefined) refuse(`"${id}" is missing`);
  if (!out.topic_not_ready?.includes("{topic}")) refuse("topic_not_ready must name the object's {topic}");
  return out as Messages;
}

export function readMessages(path: string): Messages {
  return parseMessages(readFileSync(path, "utf8"), path);
}

const VIRTUAL = "virtual:room-content";
const RESOLVED = `\0${VIRTUAL}`;

/** The Vite plugin: `virtual:room-content` for the page, and dist/room-manifest.json at build. */
export function roomContentModule(options: { root: string; messages: string }): Plugin {
  return {
    name: "h4-room-content",
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      this.addWatchFile(options.messages);
      const content: RoomContent = { messages: readMessages(options.messages), manifest: buildManifest(options.root) };
      return `export const content = ${JSON.stringify(content)};\n`;
    },
    generateBundle() {
      const manifest = buildManifest(options.root);
      this.emitFile({
        type: "asset",
        fileName: "room-manifest.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(REPO_ROOT, ROOM_EVENTS_PATH), roomEventsYaml(buildManifest(REPO_ROOT)));
  console.log(`manifest: wrote ${ROOM_EVENTS_PATH} from the room's lists and ${RESUME_SOURCE}`);
}
