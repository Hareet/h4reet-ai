// T101 (spec 004; FR-006, SC-001, User Story 1 scenarios 1 to 3; R-68; contracts/room-bundle.md §1, §15;
// contracts/room-data-files.md §1): the proof set, each change made on an overlay copy of the committed data, never on
// the files themselves. Each composes in strict mode with no finding, as room:check composes, while every path the
// overlay changes is the room's data and its log shows only the paths contracts/room-data-files.md §1 lists, so no
// source file is read or changed (SC-001):
// - a move: the placement most others are mounted on moves, and everything mounted on it moves with it, in 3D and 2D;
// - an addition of a catalog entry, a placement, a selectable, and a topic, which becomes a labelled, selectable
//   stand-in with a work order, its ID in the events file and its topic in the topic mapping;
// - a removal: a selectable and its members go, their IDs join retired[] and leave the events file, and taking the
//   selectable's ID back is RI3's refusal;
// - a regroup with its move: a member leaves the largest group, which moves until each core is exclusive again (RG6);
// - a retarget: a selectable opens another topic and keeps its ID and its event;
// - a rewording: a selectable's name, a topic's phrase, and a label's word;
// - a switch case for a value its signal already has, on a fixture switch whose piece claims nothing and uses default.
// Where a change needs room in the scene, the test finds it in the committed layout, so a later data edit that takes
// one spot leaves the proof standing: the addition's spot by the kernel's own measures before it composes (see "The
// added piece's spot"), the move and the regroup by composing their few steps. The runtime half: a bundle with an
// added selectable gets a stand-in and a pick area in 3D, and a list button, a 2D cue, and its fixed message, from the
// list and the message T110 builds and the 2D room T109 draws from the bundle. And apps/web/room/README.md, which says
// how to make each change, names no ID the data defines (T114). Synthetic IDs take the reserved prefix fx-; every other
// ID is read from the data, never written here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { readMessages, ROOM_EVENTS_PATH } from "../../build/manifest";
import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { loadRoom, namespaceIds, pathOf, SCENE_FILE, TOPICS_FILE, UI_WORDS_FILE } from "../../build/room/load";
import { readRoomPolicy } from "../../build/room/policy";
import type { Mount, Scene, Topics, UiWords } from "../../build/room/schema";
import { fileTree, overlayTree } from "../../build/room/source";
import type { Tree } from "../../build/room/source";
import { AVATARS } from "../../src/choice/avatars";
import { startRoom } from "../../src/room/app";
import type { RoomScene } from "../../src/room/compose/bundle";
import { framing, withLabel } from "../../src/room/compose/framing";
import type { Box } from "../../src/room/compose/framing";
import { IDENTITY, invert, origin, sub, transformPoint } from "../../src/room/compose/math";
import type { Vec3 } from "../../src/room/compose/math";
import { anchorWorld, mountWorld, resolveMounts } from "../../src/room/compose/mount";
import { CORE_PX, flatCore, listOnly, memberRect, pick, pickAreas } from "../../src/room/compose/pick";
import type { PickArea, Rect } from "../../src/room/compose/pick";
import type { Camera } from "../../src/room/compose/project";
import {
  FLAT_VIEW,
  REFERENCE_DESKTOP,
  REFERENCE_PHONE,
  flatScale,
  smallestFlatStage,
  supportedStages,
} from "../../src/room/compose/stages";
import { reservedBoxes } from "../../src/room/compose/hud";
import type { Stage } from "../../src/room/compose/stages";
import { TIER_VALUES, isSideWallAnchor } from "../../src/room/compose/vocabulary";
import type { RoomEvent } from "../../src/room/events";
import { flatPicker } from "../../src/room/flat";
import { resumeView } from "../../src/room/resume-port";
import { buildRoom, framedBoxes, pickAreasOn, selectablePicker } from "../../src/room/scene/bundle3d";
import {
  FakeClock,
  REPO,
  WEB,
  button,
  fakeScene,
  fixtureResume,
  flush,
  intoRoom,
  makeWindow,
  nameOf,
  repositoryBundle,
  talkLog,
  textOf,
} from "../helpers/room";
import type { Spies, TestWindow, Visit } from "../helpers/room";

const encoder = new TextEncoder();
const policy = readRoomPolicy({ env: process.env, root: REPO });
const MESSAGES = readMessages(join(WEB, "content/messages.yaml"));

/** Where contracts/room-data-files.md §1 lets the compositor read, the policy apart. */
const READABLE = [
  /^apps\/web\/room(\/|$)/,
  /^apps\/web\/content\/room(\/|$)/,
  /^assets\/(room|twin|visitors)(\/|$)/,
  /^apps\/web\/fonts(\/|$)/,
  /^apps\/web\/content\/resume\.yaml$/,
  /^corpus(\/[^/]+\.md|\/facts(\/[^/]+\.yaml)?|\/intake\/private\/denylist\.txt)?$/,
  /^docs\/data-flow-disclosure\.md$/,
  /^intent(\/[^/]+\.md)?$/,
  /^specs(\/[^/]+(\/intent\.md)?)?$/,
  // Spec 012 (its Amendment L8): the hints' figures, from the configuration that enforces them.
  /^config\/(budgets|routing|prices)\.yaml$/,
];
/** The room's data, the only files a data edit changes. */
const DATA = /^apps\/web\/(room|content\/room)\//;

/** The committed data, loaded and schema-checked: what each change starts from, its defaults written out. */
const committed = loadRoom(fileTree(REPO));
/** Spec 012 (its Amendment L8): each file a session hint names in its sources, which strict mode's RT14 reads to see
 *  the tree holds it, and nothing else of it. */
const HINT_SOURCES = new Set(
  (committed.hints?.value.hints ?? []).flatMap((h) => (h.by === "session" ? (h.sources ?? []) : [])),
);
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`the committed data has no ${what}`);
  return value;
}
const SCENE: Scene = must(committed.scene, "scene").value;
const TOPICS: Topics = must(committed.topics, "topics file").value;
const WORDS: UiWords = must(committed.ui, "UI words").value;
const copy = <T>(value: T): T => structuredClone(value);

/** One change of the proof set, made on an overlay: the files it writes (an object as YAML, null to remove), the tree
 *  it composed, and the compose, strict, with drafts, as room:check composes. */
interface Change {
  readonly changed: readonly string[];
  readonly tree: Tree;
  readonly result: ComposeResult;
}

function change(files: Readonly<Record<string, unknown>>): Change {
  const map = new Map<string, Uint8Array | null>();
  for (const [path, value] of Object.entries(files))
    map.set(
      path,
      value === null ? null : encoder.encode(stringify(value, { aliasDuplicateObjects: false, lineWidth: 0 })),
    );
  const tree = overlayTree(fileTree(REPO), map);
  return { changed: [...map.keys()], tree, result: compose(tree, policy, { mode: "strict", drafts: true }) };
}

/** The first of `candidates` that composes with no finding, or the last one tried, whose findings the test prints. */
function firstClean(candidates: Iterable<Readonly<Record<string, unknown>>>): Change {
  let last: Change | null = null;
  for (const files of candidates) {
    last = change(files);
    if (last.result.findings.length === 0) return last;
  }
  if (!last) throw new Error("no candidate change");
  return last;
}

/** A data edit: no finding, only data changed, and only §1's paths read. */
function expectDataOnly(c: Change): void {
  expect(c.result.findings.map((f) => formatFinding(f))).toEqual([]);
  expect(c.changed.length).toBeGreaterThan(0);
  expect(c.changed.filter((path) => !DATA.test(path))).toEqual([]);
  expect(c.tree.log.length).toBeGreaterThan(0);
  expect(c.tree.log.filter((path) => !READABLE.some((re) => re.test(path)) && !HINT_SOURCES.has(path))).toEqual([]);
}

const base = compose(fileTree(REPO), policy, { mode: "strict", drafts: true });
const generatedText = (result: ComposeResult, path: string): string =>
  must(
    result.generated.find((g) => g.path === path),
    path,
  ).text;
const eventObjects = (result: ComposeResult): unknown =>
  (parse(generatedText(result, ROOM_EVENTS_PATH)) as { objects: unknown }).objects;

/** Each placement's world position, by the kernel's resolver over a 3D part. */
function positions(part: RoomScene): Map<string, Vec3> {
  const { world } = resolveMounts(part.placements, part.pieces);
  return new Map([...world].map(([id, m]) => [id, origin(m)]));
}
const near = (a: Vec3, b: Vec3, tolerance = 1e-9): boolean =>
  a.every((v, i) => Math.abs(v - (b[i] ?? NaN)) <= tolerance);

/** The placements mounted on `id`, directly or through others. */
function below(id: string, scene: Scene = SCENE): string[] {
  return scene.placements.filter((p) => p.mount?.on === id).flatMap((p) => [p.id, ...below(p.id, scene)]);
}
const root = must(
  SCENE.placements.find((p) => p.mount === undefined),
  "root placement",
);
/** The root's anchor the most placements mount on directly: the wall, in a room of pieces on a wall. */
const wallAnchor = must(
  [...new Set(SCENE.placements.flatMap((p) => (p.mount?.on === root.id ? [p.mount.anchor] : [])))]
    .map((a) => [a, SCENE.placements.filter((p) => p.mount?.on === root.id && p.mount.anchor === a).length] as const)
    .sort((a, b) => b[1] - a[1])[0]?.[0],
  "anchor on the root",
);

// The added piece, its placement, its selectable, its topic, and its label: synthetic IDs, a name and a label word
// apart, so the 2D cue's name tag and the stand-in's label can't be taken for each other.
const ADDED = "fx-added";
const ADDED_PICK = "fx-added-pick";
const ADDED_TOPIC = "fx-added-topic";
const ADDED_LABEL = `label.${ADDED}`;
const ADDED_NAME = "Fixture selectable";
const ADDED_WORD = "Fixture stand-in";
const ADDED_PHRASE = "fixture topic";
const SIDE = 0.3;
/** The added piece's expected bounds, around the centre of its back. */
const BOUNDS: Box = { min: [-SIDE / 2, -SIDE / 2, 0], max: [SIDE / 2, SIDE / 2, 0.04] };
const addedPiece = {
  version: 1,
  id: ADDED,
  name: "Fixture piece",
  size: { w: SIDE, h: SIDE, d: 0.04 },
  stylized_scale: 1,
  origin: {
    point: "Fixture point at the centre of the piece's back.",
    bounds: BOUNDS,
  },
  standin: [{ shape: "box", size: [SIDE, SIDE, 0.04], at: [0, 0, 0.02], color: "#808080" }],
  drawing: { from: "standin" },
  budget: { gzip_bytes: 100000, triangles: 1000, texture_px: 256, texture_bytes: 349525 },
  work_order: {
    method: "Fixture method for the added piece.",
    shots: ["Fixture shot of the added piece."],
    measurements: ["Fixture measurement of the added piece."],
    studio_notes: "Fixture studio notes for the added piece.",
  },
};

// ---- The added piece's spot ----
// The spot is chosen by the kernel's own measures, the ones RG5 to RG7 take, so the test knows it is free before it
// composes, whatever the committed layout: the added piece's frame box keeps every camera where the committed room
// puts it (each supported stage's aspect and the 2D drawing's), so no other piece moves on screen and no face's cap
// height changes; and at every supported stage, in 3D and in 2D, its 44 × 44 core stays in the view and clear of every
// other selectable's union and core, and no other core meets its rectangle, which is all pick.ts's `pickProblems`
// refuses. A room the rules accept, with room on its wall for one more core, takes the addition clean; one without it
// fails here, where an addition would need a move too, as the regroup's does.
const NO_TURN = { x: 0, y: 0, z: 0 } as const;
/** How far the added piece stands out from the wall anchor's plane, in metres. */
const OUT = 0.02;
/** A grid step over the wall, in metres, and the least clearance kept, in CSS pixels or view-box units. */
const STEP = 0.05;
const CLEAR = 1;

/** The added piece's frame box at an offset on the wall anchor, as the compositor frames it: its bounds through the
 *  kernel's mount, the top raised for the label its stand-in shows (framing.ts's withLabel). */
function addedBox(x: number, y: number): Box {
  const shell = must(base.scene.pieces[root.piece], "root's piece");
  const anchor = must(shell.anchors[wallAnchor], "wall anchor");
  const world = mountWorld(IDENTITY, shell.scale, anchor, [x, y, OUT], NO_TURN);
  const { min, max } = BOUNDS;
  const points: Vec3[] = [];
  for (const px of [min[0], max[0]])
    for (const py of [min[1], max[1]])
      for (const pz of [min[2], max[2]]) points.push(transformPoint(world, [px, py, pz]));
  const along = (k: 0 | 1 | 2): number[] => points.map((p) => p[k]);
  return withLabel({
    min: [Math.min(...along(0)), Math.min(...along(1)), Math.min(...along(2))],
    max: [Math.max(...along(0)), Math.max(...along(1)), Math.max(...along(2))],
  });
}

/** How far apart two rectangles are: above 0 apart, 0 touching, under 0 overlapping (pick.ts lets edges touch). */
const apart = (a: Rect, b: Rect): number =>
  Math.max(b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2]), b[1] - (a[1] + a[3]), a[1] - (b[1] + b[3]));

/** The added piece's clearance in one view: its core's margin inside the view and from every other selectable's union
 *  and core, and every other core's from its rectangle; under 0 where pickProblems would refuse it. A selectable the
 *  view holds (FR-064's carve-out, see listOnly) has no union or core there, only its members, which the core must
 *  clear. Since spec 008, the core clears the view's reserved rectangles too: the walking control's box in 3D (FR-021,
 *  FR-058), as RG6 holds it. */
function clearance(
  rect: Rect,
  others: readonly PickArea[],
  core: number,
  view: Rect,
  held: ReadonlySet<string>,
  reserved: readonly Rect[] = [],
): number {
  const c = must(pickAreas([{ id: ADDED_PICK, members: [{ rect, depth: 0 }] }], core)[0]?.core, "core");
  let least = Math.min(
    c[0] - view[0],
    c[1] - view[1],
    view[0] + view[2] - c[0] - c[2],
    view[1] + view[3] - c[1] - c[3],
  );
  for (const o of others) {
    if (held.has(o.id)) {
      for (const m of o.members) least = Math.min(least, apart(c, m.rect));
      continue;
    }
    if (o.union) least = Math.min(least, apart(c, o.union));
    if (o.core) least = Math.min(least, apart(c, o.core), apart(o.core, rect));
  }
  for (const r of reserved) least = Math.min(least, apart(c, r));
  return least;
}

/** One view the spacing check (RG6) measures: a supported stage's at its production framing, or the 2D drawing's at
 *  a supported stage's scale. */
interface View {
  readonly camera: Camera;
  readonly stage: Stage;
  readonly others: readonly PickArea[];
  readonly core: number;
  /** The 2D drawing's rectangles are on the index's grid, 1e-4 view-box units. */
  readonly grid: boolean;
  /** The selectables FR-064's carve-out holds there, by the kernel's listOnly. */
  readonly held: ReadonlySet<string>;
  /** What no core may lie under there: in 3D the walking control's box (spec 008); nothing in 2D. */
  readonly reserved: readonly Rect[];
}

/** The index's side-wall selectables. */
const sideWallIds = (): ReadonlySet<string> =>
  new Set(base.index.selectables.filter((s) => s.side_wall).map((s) => s.id));

/** Every view RG6 measures, framed over the committed room's framed boxes, and each with the committed selectables'
 *  pick areas there: in 3D as bundle3d.ts's pickAreasOn gives them, in 2D from the index's flat hits at each supported
 *  stage's scale, once a scale. */
function views(): View[] {
  const framed = framedBoxes(base.scene);
  const sideWall = sideWallIds();
  const out: View[] = supportedStages().map((stage) => {
    const camera = framing(stage.w / stage.h, framed);
    const others = pickAreasOn(base.scene, base.index, camera, stage);
    // Every HUD control over the clear area, as RG6 reserves them (spec 005, FR-055).
    const reserved = reservedBoxes(stage);
    const held = listOnly(others, [0, 0, stage.w, stage.h], sideWall, reserved);
    return { camera, stage, others, core: CORE_PX, grid: false, held, reserved };
  });
  const flat = framing(FLAT_VIEW.w / FLAT_VIEW.h, framed);
  const seen = new Map<string, View>();
  for (const stage of supportedStages()) {
    const others = pickAreas(
      base.index.flat.hits.map((h) => ({
        id: h.selectable,
        members: h.rects.map((rect, k) => ({ rect, depth: h.depths[k] ?? 0 })),
      })),
      flatCore(stage),
    );
    const held = listOnly(others, [0, 0, FLAT_VIEW.w, FLAT_VIEW.h], sideWall);
    const key = `${flatScale(stage)}\n${[...held].join("\n")}`;
    if (!seen.has(key))
      seen.set(key, { camera: flat, stage: FLAT_VIEW, others, core: flatCore(stage), grid: true, held, reserved: [] });
  }
  return [...out, ...seen.values()];
}

/** The added piece's least clearance over these views, -Infinity where it moves a camera or falls behind one. */
function clearanceOver(box: Box, over: readonly View[]): number {
  let least = Infinity;
  for (const v of over) {
    if (framing(v.stage.w / v.stage.h, [box]).position[2] > v.camera.position[2]) return -Infinity;
    const member = memberRect(box, v.camera, v.stage);
    if (!member) return -Infinity;
    const q = (n: number): number => (v.grid ? Math.round(n * 1e4) / 1e4 : n);
    const rect: Rect = [q(member.rect[0]), q(member.rect[1]), q(member.rect[2]), q(member.rect[3])];
    least = Math.min(least, clearance(rect, v.others, v.core, [0, 0, v.stage.w, v.stage.h], v.held, v.reserved));
  }
  return least;
}

/** The added piece's offset on the wall anchor: over a grid that covers the committed framed boxes' span, the spot
 *  whose least clearance at every view is the largest, so long as it is at least CLEAR; the smallest stages, the
 *  reference ones, and the 2D drawing rank the spots, and every view then holds the best of them. */
function freeSpot(): [number, number] {
  const all = views();
  const smallest = all.reduce((a, b) => (b.stage.w * b.stage.h < a.stage.w * a.stage.h ? b : a));
  const reference = [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage];
  const ranking = all.filter(
    (v) =>
      v.grid ||
      v === smallest ||
      v.stage.h <= smallest.stage.h ||
      v.stage.w <= smallest.stage.w ||
      reference.some((s) => s.w === v.stage.w && s.h === v.stage.h),
  );
  // The framed boxes' span, in the wall anchor's frame.
  const shell = must(base.scene.pieces[root.piece], "root's piece");
  const frame = must(
    invert(anchorWorld(IDENTITY, shell.scale, must(shell.anchors[wallAnchor], "wall anchor"))),
    "frame",
  );
  const boxes = framedBoxes(base.scene);
  const local = boxes.flatMap((b) =>
    [b.min[0], b.max[0]].flatMap((x) =>
      [b.min[1], b.max[1]].flatMap((y) => [b.min[2], b.max[2]].map((z) => transformPoint(frame, [x, y, z]))),
    ),
  );
  const [x0, x1] = [Math.min(...local.map((p) => p[0])), Math.max(...local.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...local.map((p) => p[1])), Math.max(...local.map((p) => p[1]))];
  const ranked: { spot: [number, number]; room: number }[] = [];
  for (let x = Math.ceil(x0 / STEP) * STEP; x <= x1; x += STEP)
    for (let y = Math.ceil(y0 / STEP) * STEP; y <= y1; y += STEP) {
      const spot: [number, number] = [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6];
      const room = clearanceOver(addedBox(...spot), ranking);
      if (room >= CLEAR) ranked.push({ spot, room });
    }
  ranked.sort((a, b) => b.room - a.room || a.spot[0] - b.spot[0] || a.spot[1] - b.spot[1]);
  for (const { spot } of ranked) if (clearanceOver(addedBox(...spot), all) >= CLEAR) return spot;
  throw new Error(
    `the committed room has no spot on its wall anchor where a 44 × 44 core stays exclusive at every supported stage ` +
      `and in 2D without moving a camera (${ranked.length} spots passed the smallest stages)`,
  );
}

/** The addition's files: a catalog entry, a placement at an offset on the wall anchor, a selectable, and a topic. */
function additionFiles(x: number, y: number): Readonly<Record<string, unknown>> {
  const scene = copy(SCENE);
  scene.placements.push({
    id: ADDED,
    piece: ADDED,
    mount: { on: root.id, anchor: wallAnchor, offset: [x, y, OUT], turn: NO_TURN, estimated: true },
    frame: true,
    label: ADDED_LABEL,
  });
  scene.selectables.push({
    id: ADDED_PICK,
    name: ADDED_NAME,
    members: [ADDED],
    action: { talk: { topic: ADDED_TOPIC } },
  });
  const topics = copy(TOPICS);
  const words = must(TOPICS.topics[0], "topic").words_from;
  topics.topics.push({
    id: ADDED_TOPIC,
    phrase: ADDED_PHRASE,
    words_from: copy(words),
    corpus: ["corpus/99-fx-added-topic.md"],
  });
  const ui = copy(WORDS);
  ui.words[ADDED_LABEL] = ADDED_WORD;
  return {
    [SCENE_FILE]: scene,
    [TOPICS_FILE]: topics,
    [UI_WORDS_FILE]: ui,
    [pathOf("catalog", ADDED)]: addedPiece,
  };
}

/** The addition at the free spot, composed once. */
const addition = ((): (() => Change) => {
  let made: Change | null = null;
  return () => (made ??= change(additionFiles(...freeSpot())));
})();

describe("the committed data (R-68)", () => {
  it("composes with no finding, reading only what contracts/room-data-files.md §1 lists: the ground every change stands on", () => {
    expect(base.findings.map((f) => formatFinding(f))).toEqual([]);
    expect(base.index.selectables.length).toBeGreaterThan(0);
  });

  it("flags side-wall selectables in the index, each member hung on the shell's side-wall anchors", () => {
    const flagged = SCENE.selectables.filter((sel) => base.index.selectables.find((x) => x.id === sel.id)?.side_wall);
    expect(flagged.length).toBeGreaterThan(0);
    for (const sel of flagged)
      for (const m of sel.members) {
        const mount = SCENE.placements.find((p) => p.id === m)?.mount;
        expect(mount?.on, m).toBe(root.id);
        expect(isSideWallAnchor(mount?.anchor ?? ""), m).toBe(true);
      }
  });

  // The review of T116, C3: the Author took T302's (b) on the session's words "You keep both taps in 3D on desktop"
  // (spec.md's Clarifications, Session 2026-10-26, D1's condition). A data edit that leaves a side-wall selectable to
  // the list in 3D on the reference desktop breaks that premise, so it fails here.
  it("keeps every side-wall selectable's tap in 3D on the reference desktop, the premise T302's answer stands on", () => {
    const stage = REFERENCE_DESKTOP.stage;
    const areas = pickAreasOn(base.scene, base.index, framing(stage.w / stage.h, framedBoxes(base.scene)), stage);
    expect(sideWallIds().size).toBeGreaterThan(0);
    expect([...listOnly(areas, [0, 0, stage.w, stage.h], sideWallIds())]).toEqual([]);
  });

  // The review of T116, D2: the shell's 2D drawing is the cube as the 2D camera sees it, drawn in the back wall's
  // plane, so its side walls and floor end where that camera projects the cube's open front onto the plane.
  it("draws the shell's open front where the 2D camera projects the cube's front corners onto the back wall", () => {
    const shell = must(
      committed.catalog.find((c) => c.value.id === root.piece),
      "shell",
    ).value;
    const { min, max } = shell.origin.bounds;
    const camera = framing(FLAT_VIEW.w / FLAT_VIEW.h, framedBoxes(base.scene));
    const [cx, cy, cz] = camera.position;
    /** A point projected from the camera onto the back wall's plane, z = min z, in the drawing's x and y. */
    const onBack = ([x, y, z]: Vec3): [number, number] => {
      const t = (min[2] - cz) / (z - cz);
      return [cx + t * (x - cx), cy + t * (y - cy)];
    };
    const front = (x: number, y: number) => onBack([x, y, max[2]]);
    const polygons = (shell.drawing?.primitives ?? []).flatMap((p) => (p.primitive === "polygon" ? [p.points] : []));
    const corners = new Set(polygons.flat().map(([x, y]) => `${x.toFixed(4)}, ${y.toFixed(4)}`));
    const at = ([x, y]: readonly [number, number]): string => `${x.toFixed(4)}, ${y.toFixed(4)}`;
    for (const [name, x, y] of [
      ["the front of the floor, left", min[0], min[1]],
      ["the front of the floor, right", max[0], min[1]],
      ["the front of the left wall's top", min[0], max[1]],
      ["the front of the right wall's top", max[0], max[1]],
    ] as const)
      expect(corners, name).toContain(at(front(x, y)));
    // Every other corner is the back wall's own, where it meets the floor and the side walls.
    const back = new Set([min[0], max[0]].flatMap((x) => [min[1], max[1]].map((y) => at([x, y]))));
    const projected = new Set([min[0], max[0]].flatMap((x) => [min[1], max[1]].map((y) => at(front(x, y)))));
    for (const c of corners) expect(back.has(c) || projected.has(c), c).toBe(true);
  });

  it("names only side-wall selectables in the report's side-wall section", () => {
    const rows = base.report.markdown
      .split("\n")
      .filter((l) => /^\| `[^`]+` \((left-wall|right-wall)(, right-wall)?\) \|/.test(l));
    const named = rows.map((r) => must(/^\| `([^`]+)`/.exec(r)?.[1], "row"));
    for (const id of named) expect(base.index.selectables.find((x) => x.id === id)?.side_wall, id).toBe(true);
  });
});

describe("the proof set, each change a data edit (FR-006, SC-001)", () => {
  it("a move: the placement most others are mounted on moves, and everything on it moves with it, in 3D and 2D", () => {
    const mover = must(
      SCENE.placements.filter((p) => p.mount !== undefined).sort((a, b) => below(b.id).length - below(a.id).length)[0],
      "mounted placement",
    );
    const carried = new Set([mover.id, ...below(mover.id)]);
    expect(carried.size).toBeGreaterThan(1);
    const steps: Vec3[] = [
      [0, 0, 0.002],
      [0, 0, -0.002],
      [0.002, 0, 0],
      [-0.002, 0, 0],
    ];
    const moved = firstClean(
      steps.map((step) => {
        const scene = copy(SCENE);
        const mount = must(scene.placements.find((p) => p.id === mover.id)?.mount, "mount");
        mount.offset = [mount.offset[0] + step[0], mount.offset[1] + step[1], mount.offset[2] + step[2]];
        return { [SCENE_FILE]: scene };
      }),
    );
    expectDataOnly(moved);
    const [before, after] = [positions(base.scene), positions(moved.result.scene)];
    const shift = (id: string): Vec3 => sub(must(after.get(id), id), must(before.get(id), id));
    const by = shift(mover.id);
    expect(Math.hypot(...by)).toBeCloseTo(0.002, 9);
    for (const p of base.scene.placements) {
      if (carried.has(p.id)) expect(near(shift(p.id), by), p.id).toBe(true);
      else expect(near(shift(p.id), [0, 0, 0]), p.id).toBe(true);
    }
    const drawn = (result: ComposeResult): Map<string, string> =>
      new Map(result.index.flat.items.map((i) => [i.placement, JSON.stringify(i.matrix)]));
    const [flatBefore, flatAfter] = [drawn(base), drawn(moved.result)];
    for (const id of carried)
      if (flatBefore.has(id)) expect(flatAfter.get(id), `${id} in 2D`).not.toBe(flatBefore.get(id));
  });

  it("an addition: a catalog entry, a placement, a selectable, and a topic become a labelled, selectable stand-in", () => {
    const added = addition();
    expectDataOnly(added);
    const { scene, index, manifest } = added.result;
    const placement = must(
      scene.placements.find((p) => p.id === ADDED),
      ADDED,
    );
    expect([placement.piece, placement.model, placement.label, placement.framed]).toEqual([
      ADDED,
      null,
      ADDED_LABEL,
      true,
    ]);
    expect(scene.pieces[ADDED]?.standin.length).toBeGreaterThan(0);
    expect(index.ui[ADDED_LABEL]).toBe(ADDED_WORD);
    expect(index.flat.labels.filter((l) => l.placement === ADDED).map((l) => l.label)).toEqual([ADDED_LABEL]);
    expect(index.selectables.at(-1)).toEqual({
      id: ADDED_PICK,
      name: ADDED_NAME,
      members: [ADDED],
      action: { kind: "talk", topic: ADDED_TOPIC },
      side_wall: false,
    });
    expect(index.flat.hits.map((h) => h.selectable)).toContain(ADDED_PICK);
    expect(index.topics).toContainEqual({ id: ADDED_TOPIC, phrase: ADDED_PHRASE, ready: false });
    expect(manifest.objects.at(-1)).toEqual({ id: ADDED_PICK, action: "talk", topic: ADDED_TOPIC, ready: false });
    expect(manifest.standins).toContainEqual({ placement: ADDED, reason: "no-model" });
    // Its work order, its ID in the events file, which the gateway reads from its next start, and its topic's mapping.
    expect(generatedText(added.result, `docs/studio/work-orders/${ADDED}.md`).split("\n")[0]).toBe(
      "# Work order: Fixture piece",
    );
    expect(eventObjects(added.result)).toEqual(index.selectables.map((s) => s.id));
    expect(parse(generatedText(added.result, "config/room-topics.yaml"))).toMatchObject({
      selectables: expect.arrayContaining([
        { id: ADDED_PICK, topic: ADDED_TOPIC, corpus: ["corpus/99-fx-added-topic.md"], lead: null },
      ]) as unknown,
    });
  });

  it("a removal: a selectable and its members go, their IDs join retired[], and the selectable's ID can't come back", () => {
    // The last selectable whose members nothing else in the data names: no mount, pose, glow, cable, hand-off,
    // survey, or lookdev view. Its pieces go with it, if nothing else places them.
    const lookdev = committed.lookdev?.value;
    const named = new Set([
      ...SCENE.placements.flatMap((p) => (p.mount ? [p.mount.on] : [])),
      ...SCENE.switches.flatMap((s) => [
        ...Object.values(s.poses).flatMap((pose) => [pose.mount.on, ...pose.glows.map((g) => g.placement)]),
        ...(s.cable ? [s.cable.to.placement, s.cable.rest?.placement ?? ""] : []),
      ]),
      SCENE.handoff.from.placement,
      SCENE.handoff.to.placement,
      SCENE.survey.desk_corner.placement,
      ...(lookdev ? [...lookdev.vignette.show, ...lookdev.close_up.frame] : []),
    ]);
    const gone = must(
      [...SCENE.selectables].reverse().find((s) => s.members.every((m) => !named.has(m))),
      "selectable with free members",
    );
    const members = SCENE.placements.filter((p) => gone.members.includes(p.id));
    const pieces = [...new Set(members.map((p) => p.piece))].filter(
      (piece) => !SCENE.placements.some((p) => p.piece === piece && !gone.members.includes(p.id)),
    );
    const kinds = new Map<string, Set<"piece" | "placement" | "selectable" | "topic">>();
    const retire = (id: string, kind: "piece" | "placement" | "selectable"): void => {
      kinds.set(id, (kinds.get(id) ?? new Set()).add(kind));
    };
    retire(gone.id, "selectable");
    for (const p of members) retire(p.id, "placement");
    for (const piece of pieces) retire(piece, "piece");
    const scene = copy(SCENE);
    scene.placements = scene.placements.filter((p) => !gone.members.includes(p.id));
    scene.selectables = scene.selectables.filter((s) => s.id !== gone.id);
    scene.retired.push(
      ...[...kinds].map(([id, k]) => ({
        id,
        kinds: (["piece", "placement", "selectable", "topic"] as const).filter((n) => k.has(n)),
        retired: "2026-10-23",
        reason: "Fixture reason for the removal.",
      })),
    );
    // The label words only the removed placements referenced go too (RI11).
    const labels = (s: Scene): Set<string> =>
      new Set([
        ...s.placements.flatMap((p) => [p.label ?? "", ...Object.values(p.faces ?? {}).map((f) => f.label)]),
        ...s.switches.map((w) => w.label),
      ]);
    const still = labels(scene);
    const ui = copy(WORDS);
    for (const key of labels(SCENE)) if (key !== "" && !still.has(key)) delete ui.words[key];
    const files: Record<string, unknown> = { [SCENE_FILE]: scene, [UI_WORDS_FILE]: ui };
    for (const piece of pieces) files[pathOf("catalog", piece)] = null;
    const removed = change(files);
    expectDataOnly(removed);
    const { index, manifest, generated } = removed.result;
    expect(index.selectables.map((s) => s.id)).not.toContain(gone.id);
    expect(manifest.objects.map((o) => o.id)).not.toContain(gone.id);
    expect(eventObjects(removed.result)).toEqual(
      base.index.selectables.map((s) => s.id).filter((id) => id !== gone.id),
    );
    for (const piece of pieces)
      expect(generated.map((g) => g.path)).not.toContain(`docs/studio/work-orders/${piece}.md`);
    // Taking the ID back, on members that are still there, is refused: retired[] only grows.
    const back = copy(scene);
    const other = must(
      SCENE.placements.find((p) => p.frame && !SCENE.selectables.some((s) => s.members.includes(p.id))),
      "framed placement in no selectable",
    );
    back.selectables.push({ ...copy(gone), members: [other.id] });
    const refused = change({ ...files, [SCENE_FILE]: back }).result.findings.map(
      (f) => `${f.rule} ${f.file}:${f.path}`,
    );
    expect(refused).toContain(`RI3 ${SCENE_FILE}:selectables[${back.selectables.length - 1}].id`);
  });

  it("a regroup with its move: a member leaves the largest group, which moves until each core is exclusive (RG6)", () => {
    const group = must([...SCENE.selectables].sort((a, b) => b.members.length - a.members.length)[0], "selectable");
    expect(group.members.length).toBeGreaterThan(1);
    const parent = new Map(SCENE.placements.map((p) => [p.id, p.mount?.on]));
    // A member no other member is mounted on leaves; the rest move with the members no other member carries.
    const leaving = group.members.filter((m) => !group.members.some((o) => parent.get(o) === m)).reverse();
    const candidates = leaving.flatMap((left) => {
      const rest = group.members.filter((m) => m !== left);
      const tops = rest.filter((m) => !rest.includes(parent.get(m) ?? ""));
      return [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4].flatMap((step) =>
        [-step, step].map((dx) => {
          const scene = copy(SCENE);
          must(
            scene.selectables.find((s) => s.id === group.id),
            group.id,
          ).members = rest;
          for (const top of tops) {
            const mount = must(scene.placements.find((p) => p.id === top)?.mount, `${top}'s mount`);
            mount.offset = [mount.offset[0] + dx, mount.offset[1], mount.offset[2]];
          }
          return { [SCENE_FILE]: scene };
        }),
      );
    });
    const regrouped = firstClean(candidates);
    expectDataOnly(regrouped);
    const after = must(
      regrouped.result.index.selectables.find((s) => s.id === group.id),
      group.id,
    );
    expect(after.members.length).toBe(group.members.length - 1);
    const left = group.members.filter((m) => !after.members.includes(m));
    expect(regrouped.result.index.selectables.flatMap((s) => s.members)).not.toContain(left[0]);
    // The group moved, and its ID and every selectable's event stay.
    const [before, moved] = [positions(base.scene), positions(regrouped.result.scene)];
    for (const m of after.members) expect(near(must(moved.get(m), m), must(before.get(m), m)), m).toBe(false);
    expect(eventObjects(regrouped.result)).toEqual(eventObjects(base));
  });

  it("a retarget: a selectable opens another topic, and keeps its ID and its event", () => {
    const scene = copy(SCENE);
    const target = must(
      scene.selectables.find((s) => s.action.talk !== undefined),
      "talk selectable",
    );
    const talk = must(target.action.talk, "talk action");
    const topic = must(
      TOPICS.topics.find((t) => t.id !== talk.topic),
      "another topic",
    );
    talk.topic = topic.id;
    const retargeted = change({ [SCENE_FILE]: scene });
    expectDataOnly(retargeted);
    const { index, manifest } = retargeted.result;
    expect(index.selectables.find((s) => s.id === target.id)?.action).toEqual({ kind: "talk", topic: topic.id });
    expect(manifest.objects.find((o) => o.id === target.id)).toMatchObject({ action: "talk", topic: topic.id });
    expect(index.selectables.map((s) => s.id)).toEqual(base.index.selectables.map((s) => s.id));
    expect(generatedText(retargeted.result, ROOM_EVENTS_PATH)).toBe(generatedText(base, ROOM_EVENTS_PATH));
    const mapped = (parse(generatedText(retargeted.result, "config/room-topics.yaml")) as { selectables: unknown[] })
      .selectables;
    expect(mapped).toContainEqual({ id: target.id, topic: topic.id, corpus: topic.corpus, lead: talk.lead ?? null });
  });

  it("a rewording: a selectable's name, a topic's phrase, and a label's word, the 3D part untouched", () => {
    const scene = copy(SCENE);
    const selectable = must(scene.selectables[0], "selectable");
    selectable.name = "Fixture reworded name";
    const topics = copy(TOPICS);
    const topic = must(topics.topics[0], "topic");
    topic.phrase = "fixture reworded phrase";
    const ui = copy(WORDS);
    const key = must(SCENE.placements.find((p) => p.label !== undefined)?.label, "label");
    ui.words[key] = "Fixture reworded label";
    const reworded = change({ [SCENE_FILE]: scene, [TOPICS_FILE]: topics, [UI_WORDS_FILE]: ui });
    expectDataOnly(reworded);
    const { index, scene: part } = reworded.result;
    expect(index.selectables.find((s) => s.id === selectable.id)?.name).toBe("Fixture reworded name");
    expect(index.topics.find((t) => t.id === topic.id)?.phrase).toBe("fixture reworded phrase");
    expect(index.ui[key]).toBe("Fixture reworded label");
    expect({ ...part, digest: "" }).toEqual({ ...base.scene, digest: "" });
    expect(generatedText(reworded.result, ROOM_EVENTS_PATH)).toBe(generatedText(base, ROOM_EVENTS_PATH));
  });

  it("a new switch case for a value its signal already has, on a fixture switch whose piece claims nothing", () => {
    const LAMP = "fx-lamp";
    const SWITCH = "fx-lamp-switch";
    const lamp = { ...copy(addedPiece), id: LAMP, name: "Fixture lamp" };
    const scene = copy(SCENE);
    const at = (y: number): Mount => ({
      on: root.id,
      anchor: wallAnchor,
      offset: [0, y, 0.3],
      turn: { x: 0, y: 0, z: 0 },
      estimated: false,
    });
    scene.switches.push({
      id: SWITCH,
      signal: "tier",
      piece: LAMP,
      label: `label.${SWITCH}`,
      poses: { "fx-low": { mount: at(0.25), glows: [] }, "fx-high": { mount: at(0.75), glows: [] } },
      cases: {},
      default: "fx-low",
    });
    const ui = copy(WORDS);
    ui.words[`label.${SWITCH}`] = "Fixture switch";
    const files = { [SCENE_FILE]: scene, [UI_WORDS_FILE]: ui, [pathOf("catalog", LAMP)]: lamp };
    const before = change(files);
    expectDataOnly(before);
    const cases = (c: Change): Record<string, string> | undefined =>
      c.result.index.switches.find((s) => s.id === SWITCH)?.cases;
    expect(cases(before)).toEqual(Object.fromEntries(TIER_VALUES.map((v) => [v, "fx-low"])));
    // The case: one value the signal already has, shown by the other pose.
    const value = must(TIER_VALUES[0], "tier value");
    const withCase = copy(scene);
    must(withCase.switches.at(-1), SWITCH).cases = { [value]: "fx-high" };
    const after = change({ ...files, [SCENE_FILE]: withCase });
    expectDataOnly(after);
    expect(cases(after)).toEqual({ ...cases(before), [value]: "fx-high" });
  });
});

describe("the runtime half: a bundle with an added selectable (R-68)", () => {
  /** The room's page over a bundle, as test/helpers/room.ts's start() opens it over the repository's. */
  function visit(bundle: ComposeResult): Visit {
    const dom = makeWindow({ webgl: true });
    const win = dom.window as unknown as TestWindow;
    const spies: Spies = { storage: [], history: [], network: [], beacons: [], microphone: 0 };
    Object.defineProperty(win, "fetch", {
      configurable: true,
      value: (input: unknown) => {
        spies.network.push(`fetch ${String(input)}`);
        return Promise.reject(new Error("no network in the room's tests"));
      },
    });
    const clock = new FakeClock();
    const events: RoomEvent[] = [];
    const scene = fakeScene();
    const room = startRoom({
      win,
      content: { messages: MESSAGES, manifest: bundle.manifest },
      room: bundle.index,
      resume: resumeView(() => Promise.resolve(fixtureResume())),
      events: (event) => events.push(event),
      clock,
      loadScene: () => {
        scene.loads += 1;
        return Promise.resolve(scene.module);
      },
    });
    return {
      dom,
      win,
      doc: win.document,
      clock,
      events,
      spies,
      scene,
      room,
      resumeLoads: () => 0,
      roomDataLoads: () => 0,
    };
  }

  it("gets a labelled stand-in in 3D, and a pick area its pointer picks", () => {
    const { scene: part, index } = addition().result;
    const named = (words: string): Object3D => Object.assign(new Object3D(), { name: `label:${words}` });
    const room = buildRoom(part, { avatar: must(AVATARS[0], "avatar").id, label: named, index });
    expect(room.pictures.get(ADDED)?.name).toBe("standin");
    expect(room.labels.get(ADDED)?.name).toBe(
      `label:${(index.ui["standin.label"] ?? "").replace("{name}", ADDED_WORD)}`,
    );
    for (const stage of [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage]) {
      const picker = selectablePicker(part, index);
      picker.resize(stage);
      const area = pickAreasOn(part, index, framing(stage.w / stage.h, framedBoxes(part)), stage).find(
        (a) => a.id === ADDED_PICK,
      );
      const core = must(area?.core, "core");
      const [x, y] = [core[0] + core[2] / 2, core[1] + core[3] / 2];
      expect(picker.pick({ x: (x / stage.w) * 2 - 1, y: 1 - (y / stage.h) * 2 })).toBe(ADDED_PICK);
    }
  });

  it("holds side-wall selectables where their cores can't fit, and picks every other as the kernel does", () => {
    const framed = framedBoxes(base.scene);
    const sideWall = sideWallIds();
    let heldSomewhere = 0;
    for (const stage of [REFERENCE_DESKTOP.stage, REFERENCE_PHONE.stage, smallestFlatStage(), { w: 304, h: 640 }]) {
      const areas = pickAreasOn(base.scene, base.index, framing(stage.w / stage.h, framed), stage);
      const held = listOnly(areas, [0, 0, stage.w, stage.h], sideWall);
      heldSomewhere += held.size;
      for (const id of held) expect(sideWall.has(id), id).toBe(true);
      const picker = selectablePicker(base.scene, base.index);
      picker.resize(stage);
      for (const a of areas) {
        const core = must(a.core, "core");
        const [x, y] = [core[0] + core[2] / 2, core[1] + core[3] / 2];
        expect(picker.pick({ x: (x / stage.w) * 2 - 1, y: 1 - (y / stage.h) * 2 })).toBe(pick(areas, [x, y], held));
        if (!held.has(a.id)) expect(pick(areas, [x, y], held), a.id).toBe(a.id);
      }
    }
    // The committed cube leaves its left wall's boards to the list somewhere among these stages.
    expect(heldSomewhere).toBeGreaterThan(0);
  });

  it("holds side-wall selectables in 2D where their cores can't fit, and only side-wall ones", () => {
    const picker = flatPicker(base.index.flat.hits, base.index);
    const box = (st: Stage): Stage => ({ w: FLAT_VIEW.w * flatScale(st), h: FLAT_VIEW.h * flatScale(st) });
    picker.resize(box(smallestFlatStage()));
    expect(picker.held().size).toBeGreaterThan(0);
    for (const id of picker.held()) expect(sideWallIds().has(id), id).toBe(true);
  });

  it('reaches every selectable from the "In the room" list', async () => {
    const v = visit(base);
    await intoRoom(v);
    for (const s of base.index.selectables) {
      const found = [...v.doc.querySelectorAll("button")].filter((b) => b.getAttribute("data-object-id") === s.id);
      expect(found).toHaveLength(1);
      found[0]?.click();
      expect(v.events.at(-1)).toEqual({ kind: "object_selected", id: s.id });
    }
  });

  it("gets a button in the list, which selects it", async () => {
    const v = visit(addition().result);
    await intoRoom(v);
    const found = [...v.doc.querySelectorAll("button")].filter((b) => nameOf(b).startsWith(ADDED_NAME));
    expect(found).toHaveLength(1);
    found[0]?.click();
    expect(v.events.at(-1)).toEqual({ kind: "object_selected", id: ADDED_PICK });
  });

  it("gets a cue in the 2D room, with its name", async () => {
    const v = visit(addition().result);
    await intoRoom(v);
    button(v.doc, "2D view").click();
    await flush();
    expect(textOf(v.doc.querySelector(".flat"))).toContain(ADDED_NAME);
  });

  it("says the twin can't talk about its topic yet, in its phrase, and calls no model", async () => {
    const v = visit(addition().result);
    await intoRoom(v);
    const created = must(v.scene.created[0], "3D scene");
    created.select(ADDED_PICK);
    expect(v.events.at(-1)).toEqual({ kind: "object_selected", id: ADDED_PICK });
    expect(textOf(talkLog(v.doc).lastElementChild)).toBe(MESSAGES.topic_not_ready.replace("{topic}", ADDED_PHRASE));
    expect(v.spies.network).toEqual([]);
  });
});

describe("apps/web/room/README.md (T114; R-01)", () => {
  const text = (): string => readFileSync(join(WEB, "room/README.md"), "utf8");

  it("says how to add, move, regroup, retarget, reword, and remove a piece, and gives the commands", () => {
    const headings = text()
      .split("\n")
      .filter((l) => l.startsWith("#"))
      .join("\n")
      .toLowerCase();
    for (const change of ["add", "move", "regroup", "retarget", "reword", "remove", "switch"])
      expect(headings, change).toContain(change);
    for (const command of ["npm run room:generate -w apps/web", "room:check", "room:report"])
      expect(text()).toContain(command);
  });

  it("names no ID the room's data defines", () => {
    const { pieces, placements, selectables, topics } = namespaceIds(committed);
    const ids = [...new Set([...pieces, ...placements, ...selectables, ...topics])];
    expect(ids.length).toBeGreaterThan(0);
    const holds = (id: string): boolean => new RegExp(`(?<![a-z0-9])${id}(?![a-z0-9])`, "i").test(text());
    expect(ids.filter(holds)).toEqual([]);
  });
});

// T005 (spec 008; FR-057, SC-006): the highlight's colours and widths are look data. Changing the band of the scene's
// look in a data copy composes with no finding, changes no source file, and reaches the 3D part's look and the index's
// flat.highlight, resolved; the look's name is read from the committed scene, never written here.
describe("the proof set, spec 008's highlight (FR-057, SC-006)", () => {
  it("a highlight colour: the band of the scene's look changes, and the 3D part and the index follow", () => {
    const look = must(
      committed.looks.find((l) => l.value.id === SCENE.look),
      "the scene's look",
    );
    expect(base.scene.look.highlight.band).toBe("#ffd23f");
    expect(base.index.flat.highlight.band).toBe("#ffd23f");
    const value = copy(look.value) as unknown as Record<string, unknown>;
    // A light yellow, which gives at least 3:1 against every colour darker than the look's ink can hold.
    value.highlight = { ...(value.highlight as object), band: "#ffe066" };
    const c = change({ [look.file]: value });
    expectDataOnly(c);
    expect(c.changed).toEqual([pathOf("look", SCENE.look)]);
    expect(c.result.scene.look.highlight).toEqual({ ...base.scene.look.highlight, band: "#ffe066" });
    expect(c.result.index.flat.highlight).toEqual({ ...base.index.flat.highlight, band: "#ffe066" });
  });

  it("a highlight width: the edge of the scene's look widens, and the 3D part and the index follow", () => {
    const look = must(
      committed.looks.find((l) => l.value.id === SCENE.look),
      "the scene's look",
    );
    const value = copy(look.value) as unknown as Record<string, unknown>;
    value.highlight = { ...(value.highlight as object), edge_px: 2 };
    const c = change({ [look.file]: value });
    expectDataOnly(c);
    expect(c.result.scene.look.highlight.edge_px).toBe(2);
    expect(c.result.index.flat.highlight.edge_px).toBe(2);
  });
});

// T034 (spec 008; FR-056, SC-006): the walking view's figures are data. The walking speed, a camera limit, and the
// reach, each changed in a data copy of the scene's walking block, compose with no finding and no source file changed,
// and reach the 3D part's walking block.
describe("the proof set, spec 008's walking data (FR-056, SC-006)", () => {
  it.each([
    [
      "the walking speed",
      (w: Record<string, unknown>): void => {
        w.speed_mps = 1.5;
      },
      (s: RoomScene): number => s.walking.speed_mps,
      1.5,
    ],
    [
      "a camera limit",
      (w: Record<string, unknown>): void => {
        (w.camera as Record<string, unknown>).yaw_deg = 40;
      },
      (s: RoomScene): number => s.walking.camera.yaw_deg,
      40,
    ],
    [
      "the reach",
      (w: Record<string, unknown>): void => {
        w.reach_m = 1.0;
      },
      (s: RoomScene): number => s.walking.reach_m,
      1.0,
    ],
  ] as const)("%s: a data edit, which the 3D part carries", (_, edit, read, value) => {
    const scene = copy(SCENE) as unknown as Record<string, unknown>;
    const walking = structuredClone(scene.walking) as Record<string, unknown>;
    expect(walking).toBeDefined();
    edit(walking);
    scene.walking = walking;
    const c = change({ [SCENE_FILE]: scene });
    expectDataOnly(c);
    expect(read(c.result.scene)).toBe(value);
    expect(read(base.scene)).not.toBe(value);
  });
});

// T037 (spec 014; FR-044, FR-045, FR-049; SC-007; Amendment W10): the neon sign's glow is a path along its tube, the
// arrow's outline, a data edit: the composed part's sign gives a path and a spread and no radius, so the room draws no
// disc behind it; and the ribbon covers less of the sign's plane than the disc did, 0.3 m in radius, both at the sign's
// stylized scale, so less of any screen it is projected onto.
describe("the neon sign's path glow (spec 014, T037)", () => {
  it("gives the sign's tube-glow a path and a spread, no radius, and less area than the disc", () => {
    const { scene: part } = repositoryBundle();
    // The sign by its glow's ID, the scan keeping the room's piece IDs out of code (FR-007).
    const sign = Object.values(part.pieces).find((p) => Object.hasOwn(p.glows, "tube-glow"));
    const glow = (sign?.glows["tube-glow"] ?? {}) as {
      path?: [number, number, number][];
      spread?: number;
      radius?: number;
    };
    expect(glow.radius).toBeUndefined();
    expect(glow.path?.length).toBeGreaterThanOrEqual(2);
    expect(glow.spread).toBeGreaterThan(0);
    const s = sign?.scale ?? 1;
    let length = 0;
    for (let i = 0; i + 1 < (glow.path?.length ?? 0); i += 1) {
      const a: [number, number, number] = glow.path?.[i] ?? [0, 0, 0];
      const b: [number, number, number] = glow.path?.[i + 1] ?? [0, 0, 0];
      length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    const ribbon = length * 2 * (glow.spread ?? 0) * s * s;
    const disc = Math.PI * (0.3 * s) ** 2;
    expect(ribbon).toBeLessThan(disc);
    // The laptop's charge light and the screens keep their discs (FR-048).
    for (const piece of Object.values(part.pieces))
      for (const [id, g] of Object.entries(piece.glows))
        if (id !== "tube-glow") expect((g as { radius?: number }).radius, id).toBeGreaterThan(0);
  });
});
