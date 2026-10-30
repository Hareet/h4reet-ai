// T046 (spec 002; data-model.md §5 and §7; contracts/room-events.md §3): room-manifest.json and config/room-events.yaml
// come from one source: the room's objects, avatars, and event kinds in src/, and the resume's item IDs from its source.
// The committed config/room-events.yaml must be what the build would write, so make test fails when it's stale; and the
// fixed messages file must hold every message the room shows, and nothing else.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  ROOM_EVENTS_PATH,
  buildManifest,
  firstDifference,
  itemIds,
  parseMessages,
  readMessages,
  roomEventsYaml,
} from "../build/manifest";
import { REPO, WEB } from "./helpers/room";

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

function tree(resume?: string): string {
  const root = mkdtempSync(join(tmpdir(), "h4-manifest-"));
  made.push(root);
  if (resume !== undefined) {
    mkdirSync(join(root, "apps/web/content"), { recursive: true });
    writeFileSync(join(root, "apps/web/content/resume.yaml"), resume);
  }
  return root;
}

const RESUME = `version: 1
sections:
  - id: work
    title: Work
    items:
      - id: work-one
        text: One.
      - id: work-two
        text: Two.
  - id: open-source
    title: Open source
    items:
      - id: oss-one
        text: Three.
`;

describe("room-manifest.json", () => {
  it("lists the three objects with ready false, free talk not ready, the four avatars, placeholders, the kinds", () => {
    expect(buildManifest(tree())).toEqual({
      objects: [
        { id: "snowboard", topic: "hobbies and general life", ready: false },
        { id: "bicycle", topic: "travel adventures", ready: false },
        { id: "laptop", topic: "work projects", ready: false },
      ],
      free_talk: { ready: false },
      items: [],
      avatars: ["woman", "man", "dinosaur", "dog"],
      placeholders: true,
      event_kinds: [
        "object_selected",
        "item_selected",
        "resume_opened",
        "resume_kept",
        "pdf_downloaded",
        "turn_sent",
        "voice_pressed",
        "mode_2d",
      ],
    });
  });

  it("takes the items from the resume's source, in order", () => {
    expect(itemIds(tree(RESUME))).toEqual(["work-one", "work-two", "oss-one"]);
    expect(buildManifest(tree(RESUME)).items).toEqual(["work-one", "work-two", "oss-one"]);
  });

  it("has no items while the tree has no resume source", () => {
    expect(itemIds(tree())).toEqual([]);
  });

  it("refuses a resume source whose item IDs it can't read, or that repeats one", () => {
    expect(() => itemIds(tree("sections: [{ items: [{ text: no id }] }]\n"))).toThrow(/item/);
    expect(() => itemIds(tree("sections:\n  - items: [{ id: a-one }, { id: a-one }]\n"))).toThrow(/a-one/);
    expect(() => itemIds(tree("sections:\n  - items: [{ id: Bad_ID }]\n"))).toThrow(/Bad_ID/);
  });
});

describe("config/room-events.yaml", () => {
  it("holds the kinds, the object IDs, and the item IDs, from the same source", () => {
    const manifest = buildManifest(tree(RESUME));
    expect(parse(roomEventsYaml(manifest))).toEqual({
      schema: 1,
      kinds: manifest.event_kinds,
      objects: ["snowboard", "bicycle", "laptop"],
      items: ["work-one", "work-two", "oss-one"],
    });
  });

  it("is current: make test fails when the committed file differs from what the build would write", () => {
    const committed = readFileSync(join(REPO, ROOM_EVENTS_PATH), "utf8");
    const fresh = roomEventsYaml(buildManifest(REPO));
    // `npm run manifest -w apps/web` rewrites it.
    expect(firstDifference(committed, fresh)).toBeNull();
  });

  it("names the first line that differs", () => {
    expect(firstDifference("a\nb\nc\n", "a\nx\nc\n")).toBe('line 2: committed "b", the build writes "x"');
    expect(firstDifference("a\n", "a\nb\n")).toBe('line 2: committed "", the build writes "b"');
    expect(firstDifference("same\n", "same\n")).toBeNull();
  });
});

describe("content/messages.yaml", () => {
  it("parses into every fixed message", () => {
    const messages = readMessages(join(WEB, "content/messages.yaml"));
    expect(Object.keys(messages).sort()).toEqual(
      [
        "cannot_talk.budget",
        "cannot_talk.resting",
        "cannot_talk.unavailable",
        "didnt_catch",
        "topic_not_ready",
        "utterance_limit",
        "voice_output_unavailable",
        "voice_unavailable",
      ].sort(),
    );
  });

  const all = readFileSync(join(WEB, "content/messages.yaml"), "utf8");

  it("refuses a file without one of the messages, naming it", () => {
    const without = all.replace(/\n {2}- id: didnt_catch\n {4}text: [^\n]+/, "");
    expect(without).not.toBe(all);
    expect(() => parseMessages(without, "messages.yaml")).toThrow(/didnt_catch/);
  });

  it("refuses an unknown message, a repeated one, and an empty text", () => {
    expect(() => parseMessages(`${all}  - id: hello\n    text: Hi.\n`, "m")).toThrow(/hello/);
    expect(() => parseMessages(`${all}  - id: didnt_catch\n    text: Again.\n`, "m")).toThrow(/didnt_catch/);
    expect(() => parseMessages(all.replace(/(id: didnt_catch\n {4}text: )[^\n]+/, '$1""'), "m")).toThrow(/didnt_catch/);
  });

  it("refuses a topic_not_ready without {topic}", () => {
    const broken = all.replace(/(id: topic_not_ready\n {4}text: )[^\n]+/, "$1The twin can't talk about that yet.");
    expect(() => parseMessages(broken, "m")).toThrow(/topic/);
  });
});
