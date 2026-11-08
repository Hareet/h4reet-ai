// T046 (spec 002; data-model.md §5 and §7; contracts/room-events.md §3): room-manifest.json and config/room-events.yaml
// come from one source, and the committed config/room-events.yaml must be what the build would write, so make test
// fails when it's stale; and the fixed messages file must hold every message the room shows, and nothing else.
// T094's manifest half (spec 004; FR-009, SC-002; Amendment B7; contracts/room-bundle.md §6, §7): that source is now
// the room's data, so the manifest's expectations come from compose(), never from a list in a test: its objects are
// the selectables in scene order, each with its action, its topic's ID, and its readiness; `placeholders` is computed;
// `standins[]` names each placement and pose that shows a stand-in, and why; `live_source` is the scene's, `off`;
// `build_kind` the build's; and `caps` where the policy read them, beside spec 002's free talk, items, avatars, and
// event kinds. config/room-events.yaml is room:generate's since T108, its objects the selectables' IDs, and
// test/room/generated.test.ts holds the committed file fresh; spec 002's generator and its item reader went with it.
// T234 (spec 004; FR-013, User Story 4 scenario 1): with every piece's studio file set, the manifest names no stand-in,
// so `placeholders` is the avatars' alone, true until spec 003's files arrive; the stand-in rule is held on the room as
// it stood before (`withoutModels`).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { ROOM_EVENTS_PATH, firstDifference, parseMessages, readMessages, roomEventsFile } from "../build/manifest";
import { compose } from "../build/room/compose";
import type { ComposeResult } from "../build/room/compose";
import { loadRoom } from "../build/room/load";
import { noPolicy, policyFrom } from "../build/room/policy";
import type { RoomPolicy } from "../build/room/policy";
import { fileTree, overlayTree } from "../build/room/source";
import { AVATARS } from "../src/choice/avatars";
import { EVENT_KINDS } from "../src/room/events";
import { REPO, WEB, emptyDirPolicy, withoutModels } from "./helpers/room";

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

const RESUME_SOURCE = "apps/web/content/resume.yaml";
const encoder = new TextEncoder();

/** The repository's room composed as the site's build composes it, lenient, with a resume source given, or none,
 *  under the policy given, or the one an empty policy directory gives the global setup's builds (spec 004, T327); with
 *  `standins`, as it stood before its models were set (T234). */
function composed(
  options: {
    readonly resume?: string | null;
    readonly policy?: RoomPolicy;
    readonly drafts?: boolean;
    readonly standins?: boolean;
  } = {},
): ComposeResult {
  const changes = options.standins ? withoutModels() : new Map<string, Uint8Array | null>();
  if (options.resume !== undefined)
    changes.set(RESUME_SOURCE, options.resume === null ? null : encoder.encode(options.resume));
  const result = compose(overlayTree(fileTree(REPO), changes), options.policy ?? emptyDirPolicy(), {
    mode: "lenient",
    drafts: options.drafts ?? false,
  });
  expect(result.findings.filter((f) => !f.lenient)).toEqual([]);
  return result;
}

describe("room-manifest.json (Amendment B7)", () => {
  it("lists the selectables in scene order, each with its action, its topic's ID, and its readiness, false", () => {
    const { index, manifest } = composed();
    expect(index.selectables.length).toBeGreaterThan(0);
    expect(manifest.objects).toEqual(
      index.selectables.map((s) =>
        s.action.kind === "talk"
          ? { id: s.id, action: "talk", topic: s.action.topic, ready: false }
          : { id: s.id, action: "resume", topic: null, ready: null },
      ),
    );
    // Each topic is one the index carries, not ready until the twin's spec marks it.
    const topics = new Set(index.topics.map((t) => t.id));
    for (const o of manifest.objects) if (o.topic !== null) expect(topics.has(o.topic), o.id).toBe(true);
  });

  it("keeps spec 002's free talk not ready, the four avatars, and the event kinds", () => {
    const { manifest } = composed();
    expect(manifest.free_talk).toEqual({ ready: false });
    expect(manifest.avatars).toEqual(AVATARS.map((a) => a.id));
    expect(manifest.event_kinds).toEqual([...EVENT_KINDS]);
    expect(manifest.event_kinds).toEqual([
      "object_selected",
      "item_selected",
      "resume_opened",
      "resume_kept",
      "pdf_downloaded",
      "turn_sent",
      "voice_pressed",
      "mode_2d",
      "walk_started",
    ]);
  });

  it("names each placement and pose that shows a stand-in, in scene order, and computes placeholders from them", () => {
    // The room as it stood before its models were set (T234), so each piece stands in for want of one.
    const { scene, manifest } = composed({ standins: true });
    const figures = new Set([scene.figures.twin, scene.figures.visitor]);
    // The poses in the scene file's order, which the 3D part's keys, sorted, don't keep.
    const switches = loadRoom(fileTree(REPO)).scene?.value.switches ?? [];
    const shown = [
      ...scene.placements.filter((p) => p.model === null && !figures.has(p.id)).map((p) => p.id),
      ...switches.flatMap((s) => Object.keys(s.poses).map((pose) => `${s.id}.${pose}`)),
    ];
    expect(shown.length).toBeGreaterThan(0);
    expect(manifest.standins).toEqual(shown.map((placement) => ({ placement, reason: "no-model" })));
    expect(manifest.placeholders).toBe(true);
    expect(composed({ standins: true, drafts: true }).manifest.standins).toEqual(manifest.standins);
  });

  it("names none once every piece but the figures has its studio model set, each within its fit and budget (T234, T332)", () => {
    const { scene, manifest } = composed();
    const figures = new Set([scene.figures.twin, scene.figures.visitor]);
    // Every placed piece and the switch's piece, which each of its poses shows, has its file set, the chalkboard's
    // since the Author's re-intake of the studio's rebuild at T308's 1.49 (T331) ended T308's one stand-in; the
    // figures have none. IDs are the data's alone (FR-007), so the test takes the placements without a model from it:
    // each would stand in with the reason no-model, never a refused file's (findings), and there are none.
    const unset = scene.placements.filter((p) => p.model === null && !figures.has(p.id)).map((p) => p.id);
    expect(manifest.standins).toEqual(unset.map((placement) => ({ placement, reason: "no-model" })));
    expect(composed({ drafts: true }).manifest.standins).toEqual(manifest.standins);
    expect(unset).toEqual([]);
    expect(scene.switches.filter((s) => s.model === null).map((s) => s.id)).toEqual([]);
    expect(scene.placements.filter((p) => figures.has(p.id) && p.model !== null).map((p) => p.id)).toEqual([]);
    // So placeholders is the avatars' alone (build/room/emit.ts): true until the twin's GLB is under assets/twin/ and
    // each visitor's under assets/visitors/<avatar>/ (spec 003's files).
    const twin = join(REPO, "assets/twin");
    const arrived =
      existsSync(twin) &&
      readdirSync(twin).some((name) => name.endsWith(".glb")) &&
      AVATARS.every((a) => existsSync(join(REPO, `assets/visitors/${a.id}/${a.id}.glb`)));
    expect(manifest.placeholders).toBe(!arrived);
  });

  it("says the live source is the scene's, off, and the build's kind", () => {
    const release = composed();
    expect(release.manifest.live_source).toBe(release.index.live.source);
    expect(release.manifest.live_source).toBe("off");
    expect(release.manifest.build_kind).toBe("release");
    expect(composed({ drafts: true }).manifest.build_kind).toBe("drafts");
  });

  it("says where the caps came from, as the policy read them", () => {
    // No policy at all: FR-053's starting figures, which the room's budgets are over since the studio's hand-back
    // (T318), so this compose has RK1 and RK3 findings; its manifest still says where the caps came from.
    const none = compose(fileTree(REPO), noPolicy(), { mode: "lenient", drafts: false });
    expect(none.manifest.caps).toEqual({ source: "defaults", sha256: null });
    // An empty policy directory: main's caps in a checkout, the tree's own in the gate's container (T327).
    const empty = emptyDirPolicy();
    expect(["main", "export"]).toContain(empty.caps_source);
    expect(composed().manifest.caps).toEqual({ source: empty.caps_source, sha256: empty.caps_sha256 });
    const caps = encoder.encode(
      JSON.stringify({
        schema: 1,
        per_asset: {
          room: {
            gzip_bytes: 2_500_000,
            triangles: 40_000,
            small_props: [],
            small_prop_texture_px: 1024,
            scene_texture_bytes: 96_000_000,
            legibility_floor_css_px: 9,
          },
        },
      }),
    );
    // Caps of FR-053's starting figures in a policy directory: the same findings, the same manifest field.
    const policy = policyFrom({ caps, approvals: null, header: null }, "policy-dir");
    const given = compose(fileTree(REPO), policy, { mode: "lenient", drafts: false });
    expect(given.manifest.caps).toEqual({
      source: "policy-dir",
      sha256: createHash("sha256").update(caps).digest("hex"),
    });
  });

  it("takes the items from the resume's source, in order, and has none without one", () => {
    expect(composed({ resume: RESUME }).manifest.items).toEqual(["work-one", "work-two", "oss-one"]);
    expect(composed({ resume: null }).manifest.items).toEqual([]);
  });
});

describe("config/room-events.yaml", () => {
  it("holds the kinds, the selectables' IDs, and the item IDs, from the same source", () => {
    const { index, manifest, generated } = composed({ resume: RESUME });
    const text = roomEventsFile(manifest);
    expect(parse(text)).toEqual({
      schema: 1,
      kinds: manifest.event_kinds,
      objects: index.selectables.map((s) => s.id),
      items: ["work-one", "work-two", "oss-one"],
    });
    // What room:generate writes, which test/room/generated.test.ts holds the committed file to.
    expect(generated.find((g) => g.path === ROOM_EVENTS_PATH)?.text).toBe(text);
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
        // Spec 007's Amendment 2-2 (its FR-038).
        "twin_answering",
        "turn_refused.slow_down",
        "turn_refused.unreadable",
        "turn_stopped",
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
