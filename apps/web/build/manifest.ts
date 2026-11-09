// The room's manifest, its generated config files, and its fixed messages (spec 002, T045, T046; data-model.md §5 and
// §7; contracts/room-events.md §3; spec 004, Amendment B7, contracts/room-bundle.md §6 to §8). The manifest is B7's,
// built from a compose's parts: build/room/plugin.ts's roomBundle() bundles it with content/messages.yaml into the page
// as `virtual:room-content`, so the room shows its fixed messages without a request, and writes it to
// dist/room-manifest.json (spec 004, T096). From the same parts the compositor (build/room/emit.ts) writes
// config/room-events.yaml, which the gateway's events route reads (spec 002, Phase 6), and config/room-topics.yaml:
// `npm run room:generate -w apps/web` commits them, spec 002's `npm run manifest -w apps/web` is its alias, and
// test/room/generated.test.ts fails make test while either is stale (spec 004, T108).
import { readFileSync } from "node:fs";

import { parse } from "yaml";

import { AVATARS } from "../src/choice/avatars";
import type { RoomIndex } from "../src/room/compose/bundle";
import { EVENT_KINDS } from "../src/room/events";
import { MESSAGE_IDS, isMessageId } from "../src/talk/messages";
import type { MessageId, Messages } from "../src/talk/messages";
import type { RoomManifest as BundleManifest } from "./room/emit";

/** Where the gateway reads the events' kinds and IDs, from the repository's root. */
export const ROOM_EVENTS_PATH = "config/room-events.yaml";

/** What the page gets at build: its fixed messages and its manifest, Amendment B7's; and the twin's per-turn limits
 *  (spec 007, FR-027, FR-041), config/budgets.yaml's limits.twin or FR-027's defaults, which the text box and the
 *  history window follow. */
export interface RoomContent {
  messages: Messages;
  manifest: BundleManifest;
  twin?: { limits: { turnMaxChars: number; historyMaxTurns: number; historyMaxChars: number } };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const list = (key: string, values: readonly string[]): string =>
  values.length === 0 ? `${key}: []\n` : `${key}:\n${values.map((v) => `  - "${v}"\n`).join("")}`;

/** What B7's manifest is built from, a compose's parts: its index (the build, the live source, the selectables, and
 *  the topics' readiness), the placements and poses that show stand-ins with their reasons, the caps' source and
 *  SHA-256 as the policy read them, and the resume's item IDs. */
export interface ManifestParts {
  readonly index: Pick<RoomIndex, "build" | "live" | "selectables" | "topics">;
  /** Free talk's readiness, by FR-030's rule (spec 007, FR-037); not ready without it. */
  readonly freeTalkReady?: boolean;
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
    free_talk: { ready: parts.freeTalkReady ?? false },
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

/** A value double-quoted as JSON writes it, but each double quote inside it as YAML's `\x22`: Prettier rewrites a
 *  double-quoted value in single quotes when `\"` is its only escape, and keeps one that holds any other. JSON's
 *  escapes are YAML's too, and a `"` in JSON's text only ever follows the backslash of its own `\"`. */
const yamlQuoted = (value: string): string => `"${JSON.stringify(value).slice(1, -1).replaceAll('\\"', "\\x22")}"`;

/** config/room-topics.yaml (contracts/room-bundle.md §8): one entry for each talk selectable, in scene order, every
 *  value double-quoted, `lead` the selectable's or null. It holds no phrase, live value, or quote. It is written in the
 *  form Prettier writes at any length (§13): `corpus` a block list, one path a line, never a flow list that a long
 *  line would break, and a value's double quotes `\x22`. */
export function roomTopicsFile(entries: readonly TopicEntry[]): string {
  const corpus = (paths: readonly string[]): string =>
    paths.length === 0 ? "    corpus: []\n" : `    corpus:\n${paths.map((p) => `      - ${yamlQuoted(p)}\n`).join("")}`;
  const body =
    entries.length === 0
      ? "selectables: []\n"
      : `selectables:\n${entries
          .map(
            (e) =>
              `  - id: ${yamlQuoted(e.id)}\n    topic: ${yamlQuoted(e.topic)}\n${corpus(e.corpus)}` +
              `    lead: ${e.lead === null ? "null" : yamlQuoted(e.lead)}\n`,
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
