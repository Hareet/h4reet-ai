// T102 (spec 004; FR-013, FR-014, FR-026, FR-038; Amendment B7; R-14; contracts/room-bundle.md §7 to §9, §13): the
// generated files committed beside the room's data are exactly what `npm run room:generate -w apps/web` writes from it,
// held fresh by make test with room:check's own check (build/room/cli.ts's freshness), so a data edit commits its
// generated files with it. The command's compose is repositoryBundle()'s: lenient, a release build, main's policy.
// - config/room-events.yaml and config/room-topics.yaml fail when they differ from what compose() writes, named by
//   their first differing line, spec 002's firstDifference, by its number alone: a generated line can hold a string
//   RT2 refused, which a failure's output mustn't print.
// - The events file keeps spec 002's shape, `{schema: 1, kinds, objects, items}`, its objects the selectables' IDs in
//   scene order, 1 to 64 (B7); the topic mapping gives each talk selectable its topic, corpus, and lead, every value
//   double-quoted, and holds no phrase and no quote (FR-038).
// - A work order fails when stale, missing for a catalog entry, or orphaned, its piece gone (FR-014).
// - The photo guide fails when stale or missing, or when it lacks a fixed part of §9.2: FR-026's steps before the first
//   shot, FR-025's paragraph, the photo-work setup's five steps and their checklist lines (FR-025, FR-026), the
//   tracing steps, and a layout row for each placement on the desk and each on the shell.
// Every ID here comes from the loaded data or compose(), never from a literal; the synthetic one takes `fx-`.
import { join } from "node:path";

import { format, resolveConfig } from "prettier";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { firstDifference } from "../../build/manifest";
import { freshness } from "../../build/room/cli";
import { loadRoom } from "../../build/room/load";
import { PHOTO_GUIDE, WORK_ORDERS_DIR } from "../../build/room/orders";
import { compareBytewise, fileTree, overlayTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { EVENT_KINDS } from "../../src/room/events";
import { REPO, repositoryBundle } from "../helpers/room";

const EVENTS = "config/room-events.yaml";
const TOPICS = "config/room-topics.yaml";
const GENERATE = "npm run room:generate -w apps/web";
const ID = /^[a-z][a-z0-9-]{1,40}$/;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const repo = (): Tree => fileTree(REPO);
/** A committed file's text, or "" where there is none. */
const committed = (path: string): string => {
  const data = repo().read(path);
  return data === null ? "" : decoder.decode(data);
};
/** What room:generate writes at `path`, as compose() makes it. */
function fresh(path: string): string {
  const found = repositoryBundle().generated.find((g) => g.path === path);
  if (!found) throw new Error(`compose() writes no ${path}`);
  return found.text;
}
/** The first line where two texts differ, by its number alone: spec 002's firstDifference quotes both lines. */
const firstLine = (a: string, b: string): string | null => /^line \d+/.exec(firstDifference(a, b) ?? "")?.[0] ?? null;
/** The repository's loaded data. */
const data = (): ReturnType<typeof loadRoom> => loadRoom(repo());
/** A section's body: the lines after its heading, to the next heading of its level or above. */
function section(text: string, heading: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) return "";
  const level = heading.indexOf(" ");
  const end = lines.findIndex((l, i) => i > start && /^#+ /.test(l) && l.indexOf(" ") <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}
/** What the repository's Prettier writes for `text` at `path`, with the configuration make lint resolves. */
async function prettier(path: string, text: string): Promise<string> {
  const filepath = join(REPO, path);
  return format(text, { ...(await resolveConfig(filepath, { editorconfig: true })), filepath });
}

describe("the committed generated files (contracts/room-bundle.md §13)", () => {
  it("are each what room:generate writes from the committed data: none stale, none missing, no order orphaned", () => {
    expect(freshness(repo(), repositoryBundle().generated).map((l) => l.text)).toEqual([]);
  });

  it("fail when stale, by the first differing line's number, when missing, and when a work order is orphaned", () => {
    const { generated } = repositoryBundle();
    const orders = generated.filter((g) => g.path.startsWith(`${WORK_ORDERS_DIR}/`));
    const [first, second] = orders;
    if (!first || !second) throw new Error("fewer than two work orders");
    const lines = first.text.split("\n");
    lines[2] = `${lines[2] ?? ""} (a change this test made)`;
    const topics = fresh(TOPICS).split("\n");
    const last = topics.findLastIndex((l) => l.trim() !== "");
    topics[last] = `${topics[last] ?? ""} # a change this test made`;
    const changes = new Map<string, Uint8Array | null>(generated.map((g) => [g.path, encoder.encode(g.text)]));
    changes.set(first.path, encoder.encode(lines.join("\n")));
    changes.set(TOPICS, encoder.encode(topics.join("\n")));
    changes.set(second.path, null);
    changes.set(PHOTO_GUIDE, null);
    const orphan = `${WORK_ORDERS_DIR}/fx-gone.md`;
    changes.set(orphan, encoder.encode("# Work order: a piece that's gone\n"));
    const found = freshness(overlayTree(repo(), changes), generated).map((l) => l.text);
    expect(found).toEqual(
      [
        `FR-013 ${TOPICS}:${last + 1}: stale; ${GENERATE} rewrites it`,
        `FR-013 ${PHOTO_GUIDE}:-: missing; ${GENERATE} writes it`,
        `FR-013 ${first.path}:3: stale; ${GENERATE} rewrites it`,
        `FR-013 ${second.path}:-: missing; ${GENERATE} writes it`,
        `FR-013 ${orphan}:-: orphaned: no catalog entry has its stem; ${GENERATE} removes it`,
      ].sort(compareBytewise),
    );
    expect(found.join("\n")).not.toContain("a change this test made");
  });
});

describe("what they hold (contracts/room-bundle.md §9)", () => {
  it("is no path outside the repository, no host or user name, no time, and not the bundle's digest", () => {
    const { generated, digest } = repositoryBundle();
    for (const { path } of generated) {
      const text = committed(path);
      expect(text, path).not.toBe("");
      expect(text, path).not.toContain(digest.slice(0, 16));
      expect(text, path).not.toMatch(/(^|[\s(`"])(\/home|\/tmp|\/srv|\/mnt|\/Users|~\/|[A-Z]:\\)/m);
      expect(text, path).not.toMatch(/\b\d{1,2}:\d{2}(:\d{2})?\b/);
      expect(text, path).not.toMatch(/\b[\w.-]+@[\w-]+(\.[\w-]+)*\b/);
    }
  });
});

describe("config/room-events.yaml (contracts/room-bundle.md §7; Amendment B7)", () => {
  it("is what compose() writes, line for line", () => {
    expect(firstLine(committed(EVENTS), fresh(EVENTS)), `${GENERATE} rewrites ${EVENTS}`).toBeNull();
  });

  it("is spec 002's shape: the kinds, the selectables' IDs in scene order, 1 to 64, and the items, every value quoted", () => {
    const text = committed(EVENTS);
    const { index, manifest } = repositoryBundle();
    const objects = index.selectables.map((s) => s.id);
    expect(parse(text)).toEqual({ schema: 1, kinds: [...EVENT_KINDS], objects, items: manifest.items });
    expect(objects.length).toBeGreaterThanOrEqual(1);
    expect(objects.length).toBeLessThanOrEqual(64);
    expect(new Set(objects).size).toBe(objects.length);
    for (const id of objects) expect(id).toMatch(ID);
    const body = text.split("\n").filter((l) => l !== "" && !l.startsWith("#"));
    for (const line of body.filter((l) => l.startsWith(" "))) expect(line).toMatch(/^ {2}- "[^"]*"$/);
    const header = text
      .split("\n")
      .filter((l) => l.startsWith("#"))
      .join(" ");
    expect(header).toContain(GENERATE);
  });
});

describe("config/room-topics.yaml (contracts/room-bundle.md §8; FR-038)", () => {
  it("is what compose() writes, line for line", () => {
    expect(firstLine(committed(TOPICS), fresh(TOPICS)), `${GENERATE} writes ${TOPICS}`).toBeNull();
  });

  it("maps each talk selectable, in scene order, to its topic, the topic's corpus, and its lead or null", () => {
    const { scene, topics } = data();
    const corpus = new Map((topics?.value.topics ?? []).map((t) => [t.id, t.corpus]));
    const talk = (scene?.value.selectables ?? []).flatMap((s) =>
      s.action.talk ? [{ id: s.id, ...s.action.talk }] : [],
    );
    expect(talk.length).toBeGreaterThan(0);
    expect(parse(committed(TOPICS))).toEqual({
      schema: 1,
      selectables: talk.map((s) => ({ id: s.id, topic: s.topic, corpus: corpus.get(s.topic), lead: s.lead ?? null })),
    });
  });

  it("double-quotes every value, and holds no topic's phrase and no quote of the Author's words", () => {
    const text = committed(TOPICS);
    const values = text
      .split("\n")
      .filter((l) => l.startsWith(" "))
      .map((l) => l.replace(/^ *(- )?([a-z_]+:)?\s*/, ""))
      .filter((v) => v !== "");
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value === "null" || /^"[^"]*"$/.test(value), value).toBe(true);
    for (const t of data().topics?.value.topics ?? []) {
      expect(text).not.toContain(t.phrase);
      for (const q of t.words_from) expect(text).not.toContain(q.quote);
    }
  });
});

describe("the two YAML files (contracts/room-bundle.md §13)", () => {
  it.each([EVENTS, TOPICS])("%s is what Prettier writes", async (path) => {
    const text = committed(path);
    expect(text).not.toBe("");
    expect(await prettier(path, text)).toBe(text);
  });
});

describe("the work orders (contracts/room-bundle.md §9.1; FR-014)", () => {
  it("are one for each catalog entry, by its piece's ID, and no other", () => {
    const orders = data()
      .catalog.map((c) => `${c.value.id}.md`)
      .sort(compareBytewise);
    expect(orders.length).toBeGreaterThan(0);
    expect(repo().list(WORK_ORDERS_DIR)).toEqual(orders);
  });

  it("are each what compose() writes for its piece", () => {
    for (const piece of data().catalog.map((c) => c.value.id)) {
      const path = `${WORK_ORDERS_DIR}/${piece}.md`;
      expect(firstLine(committed(path), fresh(path)), `${GENERATE} writes ${path}`).toBeNull();
    }
  });
});

describe("the photo guide (contracts/room-bundle.md §9.2; FR-025, FR-026)", () => {
  const guide = (): string => committed(PHOTO_GUIDE);

  it("is what compose() writes, line for line", () => {
    expect(firstLine(guide(), fresh(PHOTO_GUIDE)), `${GENERATE} writes ${PHOTO_GUIDE}`).toBeNull();
  });

  it("holds §9.2's parts in order: the fixed template, then the layout checklist", () => {
    const lines = guide().split("\n");
    expect(lines[0]).toBe("# Photo guide");
    expect(lines.slice(1, 4).join(" ")).toContain(GENERATE);
    expect(lines.filter((l) => l.startsWith("## "))).toEqual([
      "## Before the first shot",
      "## Where photo-derived files stay",
      "## Setting up photo work",
      "## The photo-work checklist",
      "## Tracing a sign's lettering",
      "## The layout checklist",
    ]);
  });

  it("gives FR-026's steps before the first shot, and quotes FR-025's paragraph exactly", () => {
    const first = section(guide(), "## Before the first shot").toLowerCase();
    for (const step of [
      "pause camera-roll backup and gallery sync until cleanup",
      "turn location off",
      "move the photos over a usb cable straight into the studio's photos folder",
      "never send one through chat, email, a cloud drive, or an assistant",
      "delete them from the phone and its trash once the studio's copy checks out",
    ])
      expect(first).toContain(step);
    expect(section(guide(), "## Where photo-derived files stay")).toContain(
      "Every file a photo touches SHALL stay inside the photos folder, which, with the blinding key, every Claude " +
        "session on the machine is denied, the studio's own included: ComfyUI's input, output, temp, and user folders " +
        "(its `--input-directory`, `--output-directory`, `--temp-directory`, and `--user-directory`), and any Blender " +
        "file that loads or links a photo, with its temporary files and autosaves. The studio's own Blender files, " +
        "temporary files, and autosaves SHALL sit in the workflows folder. Only what FR-024 lets the studio's agent " +
        "receive from a photo, each after the Author has reviewed it (a style frame, a mesh stripped to geometry, or a " +
        "sign's lettering outlines; FR-032), SHALL leave the photos folder, into the studio's inbox.",
    );
  });

  it("sets up photo work in five steps, each with its line in the photo-work checklist", () => {
    const setup = section(guide(), "## Setting up photo work");
    for (const step of [
      "**Blender's Temporary Files.**",
      "**TMPDIR.**",
      "**The tracing tool's autosave.**",
      "**The tracing tool's recent files.**",
      "**ComfyUI.**",
    ])
      expect(setup).toContain(step);
    expect(setup).toContain("127.0.0.1");
    expect(
      section(guide(), "## The photo-work checklist")
        .split("\n")
        .filter((l) => l.startsWith("- [ ] ")),
    ).toEqual([
      "- [ ] Blender's Temporary Files folder is inside the photos folder.",
      "- [ ] TMPDIR is inside the photos folder.",
      "- [ ] The tracing tool's autosave is off.",
      "- [ ] The tracing tool's recent files are off.",
      "- [ ] ComfyUI listens on 127.0.0.1 alone, and only the Author queues it.",
    ]);
    const tracing = section(guide(), "## Tracing a sign's lettering");
    expect(tracing).toMatch(/offline inside the photos folder/);
    expect(tracing).toMatch(/outline_check\.py/);
    expect(tracing).toMatch(/Move only the outline file to the studio's inbox/);
  });

  it("has a layout row, measured or estimated, for each placement on the desk and each on the shell, the figures apart", () => {
    const scene = data().scene?.value;
    if (!scene) throw new Error("no scene");
    const parent = new Map(scene.placements.map((p) => [p.id, p.mount?.on]));
    const figures = new Set(scene.placements.filter((p) => p.role !== undefined).map((p) => p.id));
    const desk = scene.survey.desk_corner.placement;
    const under = (id: string, top: string): boolean => {
      const seen = new Set<string>();
      for (let at = parent.get(id); at !== undefined && !seen.has(at); at = parent.get(at)) {
        if (at === top) return true;
        seen.add(at);
      }
      return false;
    };
    const root = scene.placements.find((p) => p.mount === undefined)?.id ?? "";
    const onDesk = scene.placements.filter((p) => !figures.has(p.id) && under(p.id, desk));
    const onShell = scene.placements.filter((p) => !figures.has(p.id) && p.mount?.on === root);
    expect(onDesk.length).toBeGreaterThan(0);
    expect(onShell.length).toBeGreaterThan(0);
    const layout = section(guide(), "## The layout checklist");
    const [deskPart = "", shellPart = ""] = layout.split("On the shell, at its anchors:");
    const rows = (text: string): string[] => text.split("\n").filter((l) => l.startsWith("- [ ] "));
    expect(rows(deskPart)).toHaveLength(onDesk.length);
    expect(rows(shellPart)).toHaveLength(onShell.length);
    for (const row of rows(layout)) expect(row).toMatch(/ \((measured|estimated)\)$/);
  });
});
