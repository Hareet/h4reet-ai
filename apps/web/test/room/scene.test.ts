// T090 (spec 004; FR-003, FR-005, FR-008, User Story 1 scenarios 1 and 5; R-16, R-17, R-27; contracts/room-bundle.md
// §3.2): the room drawn from compose()'s 3D part with no renderer, by src/room/scene/bundle3d.ts. buildRoom makes one
// Object3D per placement, mounted under its parent's at compose/mount.ts's world transform (three.js's world matrices
// equal the resolver's within 1e-9), so moving a parent's mount moves everything on it; each holds its stand-in from
// the catalog's shapes, labelled with the UI word standin.label only where the placement has no set model; the figures
// are found by role, the visitor's picture being the chosen avatar's flat cut-out; the hand-off's two anchors come from
// the scene's handoff, its paper staying code (FR-008); each switch case is its own group at its pose's mount, only
// not-live's shown; and the camera frames the framed boxes with compose/framing.ts at the six aspects of
// compose/stages.ts. Expectations come from compose() over the fixture set and its overlays: every ID is a synthetic
// fx- one, never the room's data.
// T098 (spec 004; FR-008, FR-011; R-11, R-27; contracts/room-bundle.md §3.2): the paper ends in the chosen avatar's own
// hand, spec 002's per-avatar placement offset from the scene's anchor, the first avatar's hand; buildRoom refuses a
// part whose digest isn't the index's; and src/room/scene.ts draws the site's own 3D part (the repository's, which
// vitest.config.ts gives the tests as `virtual:room-scene`), refusing it before it makes a renderer when the digest
// differs, so the room falls to 2D as for a chunk that fails to load.
// T112 (spec 004; FR-005, FR-007; R-16, R-18, R-27): scene.ts builds no piece of its own, holds no layout, and picks
// with no raycast, and src/room/framing.ts, spec 002's layout, is gone. Spec 002's work-area cases, which T090 kept in
// work-area.test.ts, end here: its labels' and quality levels' cases move unchanged, since scene.ts keeps both; its
// framing and placeholder cases move onto the site's own room, the repository's bundle; its hand-off cases and its
// visitor's cut-out go, as this file's own cases above hold both of the bundle's room; and where spec 002 hung its
// pieces goes with its layout, FR-078's work area being the data's, which the Author's runs judge (T119).
// T141 (spec 004; FR-055 to FR-057, FR-071; R-28; the lookdev review's runtime-7): src/room/scene.ts's studio models
// end to end, on a 3D part with set models (test/helpers/room-models.ts) and a stand-in renderer, since jsdom has no
// WebGL: the loader's chunk imported, each model fetched as R-28 has it and swapped in for its piece's stand-ins, a
// restored context's reload, and a disposed stage's stop, with the asset events each records.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { Box3, Mesh, Object3D, PerspectiveCamera, ShapeGeometry, Vector3 } from "three";
import type { BufferGeometry, Color, Material, MeshBasicMaterial, Scene, Sprite, Texture } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import roomScene from "virtual:room-scene";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import { AVATARS, AVATAR_SHAPES } from "../../src/choice/avatars";
import type { AvatarId } from "../../src/choice/avatars";
import type { RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import { LABEL_HEIGHT, framing } from "../../src/room/compose/framing";
import { IDENTITY, multiply, origin, scaling, transformDirection } from "../../src/room/compose/math";
import type { Mat4, Vec3 } from "../../src/room/compose/math";
import { anchorWorld, mountWorld, resolveMounts } from "../../src/room/compose/mount";
import type { Resolved } from "../../src/room/compose/mount";
import { projector } from "../../src/room/compose/project";
import { ASPECTS } from "../../src/room/compose/stages";
import type { AssetEvent } from "../../src/asset-events";
import type { Mode } from "../../src/choice/visit";
import { SETTLE_FRAMES } from "../../src/room/quality";
import { createLabels, createScene, qualitySettings } from "../../src/room/scene";
import {
  buildRoom,
  disposeRoom,
  frameCamera,
  framedBoxes,
  showHandoff,
  standinLabel,
} from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { VISITOR_TURN, visitorTurnShare } from "../../src/room/handoff";
import { readImage } from "../../src/room/glb/images";
import { MODEL_NODE, integrity } from "../../src/room/scene/loader";
import { shapeGeometry } from "../../src/room/scene/standins";
import type { SceneOptions } from "../../src/room/stage";
import { uiWord } from "../../src/room/ui-keys";
import { FakeClock, enter, flush, repositoryBundle, start } from "../helpers/room";
import type { TestWindow } from "../helpers/room";
import { PNG_SIGNATURE, bytes, chunk, concat, desk } from "../helpers/glb";
import { goodFiles, goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";

/**
 * What the scene module draws and draws with: the repository's 3D part and three's own renderer, unless a test sets a
 * part of its own and a stand-in renderer here (vitest.config.ts gives `virtual:room-scene` the repository's part).
 */
const swapped = vi.hoisted(() => ({
  part: null as RoomScene | null,
  renderer: null as ((parameters: unknown) => unknown) | null,
}));

vi.mock("virtual:room-scene", async (importOriginal) => {
  const own = await importOriginal<{ default: RoomScene }>();
  return {
    get default() {
      return swapped.part ?? own.default;
    },
  };
});

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return swapped.renderer ? swapped.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

const decoder = new TextDecoder();
const text = (path: string): string => decoder.decode(goodFiles().get(path));
const SCENE = "apps/web/room/scene.yaml";
const strict = { mode: "strict", drafts: false } as const;
const good = (): ComposeResult => compose(goodTree(), noPolicy(), strict);
const TWIN = "apps/web/room/catalog/fx-twin.yaml";
const VISITOR = "apps/web/room/catalog/fx-visitor.yaml";
/** The fixture set mirrored: its twin stands on the visitor's left, its hand on its right, and the visitor's hand
 *  anchor, where the paper goes, on its left, the side nearer the twin. The fixture itself stands its twin on the
 *  visitor's right, as the Author's room does. */
const mirrored = (): ComposeResult =>
  compose(
    overlay({
      [SCENE]: text(SCENE).replace(
        "mount: { on: fx-desk, anchor: top, offset: [0.48, 0, 0.12] }",
        "mount: { on: fx-desk, anchor: top, offset: [-0.48, 0, 0.12] }",
      ),
      [TWIN]: text(TWIN).replace("hand: { at: [-0.1, 0.25, 0.05] }", "hand: { at: [0.1, 0.25, 0.05] }"),
      [VISITOR]: text(VISITOR).replace("hand: { at: [0.1, 0.25, 0.05] }", "hand: { at: [-0.1, 0.25, 0.05] }"),
    }),
    noPolicy(),
    strict,
  );

/** A label with no renderer: an empty node named for the words it would draw, as spec 002's are. */
function named(words: string): Object3D {
  const node = new Object3D();
  node.name = `label:${words}`;
  return node;
}

/** The room from a composition's 3D part and index, its world matrices brought up to date. */
function build(result: ComposeResult, avatar: AvatarId = "dog", index: RoomIndex = result.index): Room3D {
  const room = buildRoom(result.scene, { avatar, label: named, index });
  room.scene.updateMatrixWorld(true);
  return room;
}

/** The kernel's resolution of a 3D part, from the part itself. */
function resolved(part: RoomScene): Resolved {
  const pieces = Object.fromEntries(
    Object.entries(part.pieces).map(([id, p]) => [id, { scale: p.scale, anchors: p.anchors }]),
  );
  return resolveMounts(part.placements, pieces);
}

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-9, what = ""): void {
  expect(actual.length, what).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    const [a, e] = [actual[i] ?? Number.NaN, expected[i] ?? Number.NaN];
    expect(Math.abs(a - e), `${what}[${i}]: ${a} against ${e}`).toBeLessThanOrEqual(tolerance);
  }
}

const position = (o: Object3D): Vec3 => o.getWorldPosition(new Vector3()).toArray();
const hex = (c: Color): string => `#${c.getHexString()}`;

/** Every placement mounted on `id`, at any depth, and `id` itself. */
function carriedBy(part: RoomScene, id: string): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of part.placements)
      if (p.mount && out.has(p.mount.on) && !out.has(p.id)) {
        out.add(p.id);
        grew = true;
      }
  }
  return out;
}

/** A placement of the part by ID, which the test expects to be there. */
function placementOf(part: RoomScene, id: string): RoomScene["placements"][number] {
  const p = part.placements.find((x) => x.id === id);
  if (!p) throw new Error(`no placement ${id}`);
  return p;
}

/** A placement's anchor in the world, by the kernel. */
function anchorPoint(part: RoomScene, ref: { placement: string; anchor: string }): Vec3 {
  const p = placementOf(part, ref.placement);
  const piece = part.pieces[p.piece];
  const anchor = piece?.anchors[ref.anchor];
  const world = resolved(part).world.get(p.id);
  if (!piece || !anchor || !world) throw new Error(`no anchor ${ref.anchor} on ${ref.placement}`);
  return origin(anchorWorld(world, piece.scale, anchor));
}

describe("the object tree (buildRoom)", () => {
  it("makes one node per placement, under its parent's, at mount.ts's world transform within 1e-9", () => {
    const result = good();
    expect(result.findings).toEqual([]);
    const part = result.scene;
    const room = build(result);
    const { world, model, unresolved } = resolved(part);
    expect(unresolved).toEqual([]);
    expect([...room.placements.keys()]).toEqual(part.placements.map((p) => p.id));
    for (const p of part.placements) {
      const node = room.placements.get(p.id) as Object3D;
      expect(node.parent, p.id).toBe(p.mount ? room.placements.get(p.mount.on) : room.scene);
      expectClose(node.matrixWorld.elements, world.get(p.id) ?? [], 1e-9, `${p.id}'s world`);
      expectClose(position(node), origin(world.get(p.id) ?? IDENTITY), 1e-9, `${p.id}'s position`);
      // Its picture is its piece's frame, mount.ts's Model(p), under its stylized scale; the visitor's cut-out keeps
      // its own size, as the 2D room draws it.
      const picture = room.pictures.get(p.id) as Object3D;
      expect(picture.parent, p.id).toBe(node);
      const frame = p.id === part.figures.visitor ? world.get(p.id) : model.get(p.id);
      expectClose(picture.matrixWorld.elements, frame ?? [], 1e-9, `${p.id}'s picture`);
    }
    expect(part.pieces["fx-sign"]?.scale).toBe(1.25);
  });

  it("moves what's mounted on a parent's anchor with its stylized scale, never scaling it", () => {
    const monitor = "apps/web/room/catalog/fx-monitor.yaml";
    // 1.02: the production camera's lower eye (D1) leaves the known-good set's board no room for a larger monitor.
    const scaled = text(monitor).replace("size: { w: 0.6, h: 0.42, d: 0.05 }\n", "$&stylized_scale: 1.02\n");
    const result = compose(overlay({ [monitor]: scaled }), noPolicy(), strict);
    expect(result.findings).toEqual([]);
    const part = result.scene;
    expect(part.pieces["fx-monitor"]?.scale).toBe(1.02);
    const room = build(result);
    const { world, model } = resolved(part);
    for (const p of part.placements) {
      expectClose((room.placements.get(p.id) as Object3D).matrixWorld.elements, world.get(p.id) ?? [], 1e-9, p.id);
      if (p.id !== part.figures.visitor)
        expectClose((room.pictures.get(p.id) as Object3D).matrixWorld.elements, model.get(p.id) ?? [], 1e-9, p.id);
    }
    // The neon panel on the monitor's top edge rides its scaled anchor at its own scale.
    const neon = room.pictures.get("fx-neon") as Object3D;
    expect(
      neon
        .getWorldScale(new Vector3())
        .toArray()
        .map((v) => Number(v.toFixed(12))),
    ).toEqual([1, 1, 1]);
  });

  it("carries everything mounted on a parent when its mount's offset moves, and nothing else", () => {
    const before = good();
    const scene = text(SCENE).replace(
      "offset: [0, 0, -0.6], estimated: true",
      "offset: [0.04, 0, -0.65], estimated: true",
    );
    const after = compose(overlay({ [SCENE]: scene }), noPolicy(), strict);
    expect(after.findings).toEqual([]);
    const [a, b] = [build(before), build(after)];
    const carried = carriedBy(before.scene, "fx-desk");
    expect(carried.size).toBeGreaterThan(3);
    expect(carried.size).toBeLessThan(before.scene.placements.length);
    for (const p of before.scene.placements) {
      const [from, to] = [position(a.placements.get(p.id) as Object3D), position(b.placements.get(p.id) as Object3D)];
      const shift: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
      expectClose(shift, carried.has(p.id) ? [0.04, 0, -0.05] : [0, 0, 0], 1e-9, p.id);
    }
    // The switch's cases mounted on the desk, or on what stands on it, go with it too.
    for (const sw of before.scene.switches)
      for (const [name, pose] of Object.entries(sw.poses)) {
        const [from, to] = [a, b].map((r) => position(r.switches.get(sw.id)?.get(name) as Object3D));
        const shift: Vec3 = [
          (to?.[0] ?? 0) - (from?.[0] ?? 0),
          (to?.[1] ?? 0) - (from?.[1] ?? 0),
          (to?.[2] ?? 0) - (from?.[2] ?? 0),
        ];
        expectClose(shift, carried.has(pose.mount.on) ? [0.04, 0, -0.05] : [0, 0, 0], 1e-9, `${sw.id}.${name}`);
      }
  });

  it("draws each placement's stand-in from its piece's shapes, one mesh per shape, in its colour", () => {
    const result = good();
    const part = result.scene;
    const room = build(result);
    for (const p of part.placements) {
      if (p.id === part.figures.visitor) continue;
      const shapes = part.pieces[p.piece]?.standin ?? [];
      expect(shapes.length, p.id).toBeGreaterThan(0);
      const picture = room.pictures.get(p.id) as Object3D;
      expect(picture.name).toBe("standin");
      const meshes = picture.children as Mesh[];
      expect(
        meshes.map((m) => m.geometry.type),
        p.id,
      ).toEqual(shapes.map((s) => shapeGeometry(s).type));
      meshes.forEach((m, k) => expect(hex((m.material as MeshBasicMaterial).color), p.id).toBe(shapes[k]?.color));
    }
  });

  it("labels a stand-in with the UI word standin.label, filled with its label word, only where it has no set model", () => {
    const result = good();
    const part = result.scene;
    const ui = result.index.ui;
    const room = build(result);
    const figures = new Set([part.figures.twin, part.figures.visitor]);
    const labelled = part.placements.filter((p) => p.label !== null && p.model === null && !figures.has(p.id));
    expect(labelled.length).toBeGreaterThan(1);
    expect([...room.labels.keys()]).toEqual(labelled.map((p) => p.id));
    // The placements the 2D room labels.
    expect(result.index.flat.labels.map((l) => l.placement)).toEqual(labelled.map((p) => p.id));
    for (const p of labelled) {
      const words = (ui["standin.label"] ?? "?").replace("{name}", ui[p.label ?? ""] ?? "?");
      expect(words).not.toContain("{");
      expect(standinLabel(ui, p.label ?? "")).toBe(words);
      const node = room.labels.get(p.id) as Object3D;
      expect(node.name).toBe(`label:${words}`);
      expect(node.parent).toBe(room.placements.get(p.id));
      // Over the stand-in, where its frame box leaves room: the box's centre, LABEL_HEIGHT under its grown top.
      const [min, max] = [p.frame_box.min, p.frame_box.max];
      expectClose(position(node), [(min[0] + max[0]) / 2, max[1] - LABEL_HEIGHT, (min[2] + max[2]) / 2], 1e-9, p.id);
    }
    let count = 0;
    room.scene.traverse((node) => {
      if (node.name.startsWith("label:")) count += 1;
    });
    expect(count).toBe(labelled.length);
    expect(standinLabel(ui, "label.fx-absent")).toBeNull();
    // The review of T116, R3: the same words as the 2D room's, through uiWord, which fills a slot with the label's word
    // as it is, where String.replaceAll would read "$&" in it as the slot itself.
    const odd = { "standin.label": "Fixture {name} stand-in", "label.fx-odd": "Fixture $& sign" };
    expect(standinLabel(odd, "label.fx-odd")).toBe(uiWord(odd, "standin.label", { name: "Fixture $& sign" }));
    expect(standinLabel(odd, "label.fx-odd")).toBe("Fixture Fixture $& sign stand-in");

    // A set model takes its placement's label away; its stand-in stays, for a failed load (FR-057).
    const set = compose(overlay(modelChanges(["fx-desk"])), capsPolicy(), strict);
    expect(set.findings).toEqual([]);
    const desk = placementOf(set.scene, "fx-desk");
    expect([desk.label, desk.model === null]).toEqual(["label.fx-desk", false]);
    const withModel = build(set);
    expect(labelled.map((p) => p.id)).toContain("fx-desk");
    expect([...withModel.labels.keys()]).toEqual(labelled.map((p) => p.id).filter((id) => id !== "fx-desk"));
    expect(withModel.pictures.get("fx-desk")?.children).toHaveLength(set.scene.pieces["fx-desk"]?.standin.length ?? -1);
  });

  it("finds the figures by role: the twin's stand-in, and the visitor's flat cut-out of the chosen avatar", () => {
    // The twin's placement under another ID: its role finds it.
    const scene = text(SCENE)
      .replace("  - id: fx-twin\n", "  - id: fx-figure\n")
      .replace("from: { placement: fx-twin,", "from: { placement: fx-figure,");
    const result = compose(overlay({ [SCENE]: scene }), noPolicy(), strict);
    expect(result.findings).toEqual([]);
    const part = result.scene;
    expect(part.figures.twin).toBe("fx-figure");
    const visitor = placementOf(part, part.figures.visitor);
    const sizes = new Set<string>();
    for (const { id: avatar } of AVATARS) {
      const room = build(result, avatar);
      const twin = placementOf(part, part.figures.twin);
      expect(room.twin).toBe(room.pictures.get(twin.id));
      expect(room.twin.children).toHaveLength(part.pieces[twin.piece]?.standin.length ?? -1);
      expect(room.labels.has(twin.id)).toBe(false);
      // The visitor's picture is the chosen avatar's flat shape, one polygon a mesh, standing on its placement.
      const shape = AVATAR_SHAPES[avatar];
      expect(room.visitor).toBe(room.pictures.get(visitor.id));
      expect(room.visitor.name).toBe("cutout");
      expect(room.visitor.children).toHaveLength(shape.polygons.length);
      for (const m of room.visitor.children as Mesh[]) {
        expect(m.geometry).toBeInstanceOf(ShapeGeometry);
        expect(hex((m.material as MeshBasicMaterial).color)).toBe(shape.color);
      }
      const points = shape.polygons.flat();
      const box = new Box3().setFromObject(room.visitor);
      const feet = position(room.placements.get(visitor.id) as Object3D);
      expectClose(
        [box.min.x, box.min.y, box.max.x, box.max.y],
        [
          feet[0] + Math.min(...points.map((p) => p[0])),
          feet[1] + Math.min(...points.map((p) => p[1])),
          feet[0] + Math.max(...points.map((p) => p[0])),
          feet[1] + Math.max(...points.map((p) => p[1])),
        ],
        1e-6,
        avatar,
      );
      sizes.add(`${(box.max.x - box.min.x).toFixed(3)} × ${(box.max.y - box.min.y).toFixed(3)}`);
    }
    expect(sizes.size).toBe(AVATARS.length);
  });

  it("takes the hand-off's two anchors from the scene's handoff, the visitor's being the first avatar's hand", () => {
    // The scene's visitor anchor is where the first avatar holds the paper; the next case moves it for the others.
    const first = AVATARS[0].id;
    const check = (result: ComposeResult): Room3D => {
      expect(result.findings).toEqual([]);
      const part = result.scene;
      const room = build(result, first);
      expectClose(room.anchors.twinHand.toArray(), anchorPoint(part, part.handoff.from), 1e-9, "the twin's hand");
      expectClose(room.anchors.visitorHand.toArray(), anchorPoint(part, part.handoff.to), 1e-9, "the visitor's hand");
      expect(part.handoff.from.placement).toBe(part.figures.twin);
      expect(part.handoff.to.placement).toBe(part.figures.visitor);
      return room;
    };
    const before = check(good());
    // The visitor's hand moved in its catalog entry: the hand-off goes there.
    const file = "apps/web/room/catalog/fx-visitor.yaml";
    const moved = text(file).replace("hand: { at: [0.1, 0.25, 0.05] }", "hand: { at: [0.08, 0.3, 0.06] }");
    const after = check(compose(overlay({ [file]: moved }), noPolicy(), strict));
    expectClose(after.anchors.visitorHand.clone().sub(before.anchors.visitorHand).toArray(), [-0.02, 0.05, 0.01]);
    expectClose(after.anchors.twinHand.toArray(), before.anchors.twinHand.toArray(), 1e-12);
  });

  it("ends the paper in each avatar's own hand on the anchor's side, as spec 002 placed it from the avatar's size", () => {
    // Spec 002's hand: off the figure's centre by 35% of its width, at 60% of its height but never above 0.95 m, on
    // the side of the scene's anchor, which the data puts nearer the twin: right in the fixture, left mirrored.
    const hand = (avatar: AvatarId, side: number): Vec3 => {
      const { width, height } = AVATAR_SHAPES[avatar];
      return [side * width * 0.35, Math.min(0.95, height * 0.6), 0];
    };
    const sideOf = (part: RoomScene): number => {
      const visitor = placementOf(part, part.figures.visitor);
      return (part.pieces[visitor.piece]?.anchors[part.handoff.to.anchor]?.at[0] ?? 0) > 0 ? 1 : -1;
    };
    // The visitor turned a little on its mount, so the offset is the visitor's own, not the world's.
    const turned = text(SCENE).replace(
      "mount: { on: fx-shell, anchor: floor, offset: [0, 0, 0.8] }",
      "mount: { on: fx-shell, anchor: floor, offset: [0, 0, 0.8], turn: { y: 20 } }",
    );
    expect(turned).not.toBe(text(SCENE));
    const sides: number[] = [];
    for (const result of [good(), compose(overlay({ [SCENE]: turned }), noPolicy(), strict), mirrored()]) {
      expect(result.findings).toEqual([]);
      const part = result.scene;
      const side = sideOf(part);
      sides.push(side);
      const first = hand(AVATARS[0].id, side);
      const visitor = resolved(part).world.get(part.figures.visitor) ?? IDENTITY;
      const at = anchorPoint(part, part.handoff.to);
      for (const { id } of AVATARS) {
        const own = hand(id, side);
        const offset = transformDirection(visitor, [own[0] - first[0], own[1] - first[1], own[2] - first[2]]);
        const room = build(result, id);
        expectClose(
          room.anchors.visitorHand.toArray(),
          [at[0] + offset[0], at[1] + offset[1], at[2] + offset[2]],
          1e-9,
          id,
        );
        // The paper ends there: the kept sheet waits at the hand, and the travelling one arrives at it.
        showHandoff(room, 1, false);
        expectClose(position(room.paper.sheet), room.anchors.visitorHand.toArray(), 1e-9, `${id}'s paper`);
      }
    }
    const turnedVisitor = compose(overlay({ [SCENE]: turned }), noPolicy(), strict).scene;
    const across = transformDirection(
      resolved(turnedVisitor).world.get(turnedVisitor.figures.visitor) ?? IDENTITY,
      [1, 0, 0],
    );
    expect(across[0]).toBeCloseTo(Math.cos((20 * Math.PI) / 180), 9);
    expect(sides).toEqual([1, 1, -1]);
    // The dog's hand is 576 mm below the first avatar's, which a single anchor would leave in the air, and the man's
    // 21 mm nearer its centre than the first avatar's, on the anchor's side, either side.
    expect(hand("dog", 1)[1] - hand(AVATARS[0].id, 1)[1]).toBeCloseTo(-0.576, 9);
    expect(hand("man", 1)[0] - hand(AVATARS[0].id, 1)[0]).toBeCloseTo(-0.021, 9);
    expect(hand("man", -1)[0] - hand(AVATARS[0].id, -1)[0]).toBeCloseTo(0.021, 9);
  });

  it("refuses a 3D part whose digest isn't the index's, so the room falls to 2D as for a failed load", () => {
    const result = good();
    const options = { avatar: "dog" as const, label: named, index: result.index };
    expect(result.scene.digest).toBe(result.index.digest);
    const other = [...result.index.digest].reverse().join("");
    expect(other).not.toBe(result.index.digest);
    expect(() => buildRoom({ ...result.scene, digest: other }, options)).toThrow(/digest/);
    expect(() => buildRoom(result.scene, { ...options, index: { ...result.index, digest: other } })).toThrow(/digest/);
  });

  it("makes one group per switch case, at its pose's mount, holding its piece's stand-in, only not-live's shown", () => {
    const result = good();
    const part = result.scene;
    const room = build(result);
    const { world } = resolved(part);
    expect(part.switches.length).toBeGreaterThan(0);
    expect([...room.switches.keys()]).toEqual(part.switches.map((s) => s.id));
    for (const sw of part.switches) {
      const cases = room.switches.get(sw.id);
      const shown = result.index.switches.find((s) => s.id === sw.id)?.cases["not-live"];
      expect(shown).toBeDefined();
      expect([...(cases?.keys() ?? [])]).toEqual(Object.keys(sw.poses));
      const piece = part.pieces[sw.piece];
      for (const [name, pose] of Object.entries(sw.poses)) {
        const group = cases?.get(name) as Object3D;
        expect(group.visible, name).toBe(name === shown);
        expect(group.parent, name).toBe(room.placements.get(pose.mount.on));
        const on = placementOf(part, pose.mount.on);
        const parent = part.pieces[on.piece];
        const anchor = parent?.anchors[pose.mount.anchor];
        if (!parent || !anchor || !piece) throw new Error(`${name} doesn't resolve`);
        const at = mountWorld(world.get(on.id) ?? IDENTITY, parent.scale, anchor, pose.mount.offset, pose.mount.turn);
        expectClose(group.matrixWorld.elements, at, 1e-9, name);
        // The switch's piece stands in at its own stylized scale.
        const standin = group.getObjectByName("standin") as Object3D;
        expect(standin.children, name).toHaveLength(piece.standin.length);
        expectClose(standin.matrixWorld.elements, multiply(at, scaling(piece.scale)), 1e-9, `${name}'s stand-in`);
      }
      expect([...(cases?.values() ?? [])].filter((g) => g.visible)).toHaveLength(1);
    }
    // Which case shows is the index's not-live case.
    const index = {
      ...result.index,
      switches: result.index.switches.map((s) => ({ ...s, cases: { ...s.cases, "not-live": "fx-cloud" } })),
    };
    const other = build(result, "dog", index);
    const visible = [...(other.switches.get("fx-power")?.entries() ?? [])].filter(([, g]) => g.visible);
    expect(visible.map(([name]) => name)).toEqual(["fx-cloud"]);
  });

  it("refuses a 3D part it can't build whole, so the room falls to 2D as for a failed load", () => {
    const result = good();
    const part = result.scene;
    const options = { avatar: "dog" as const, label: named, index: result.index };
    const lost = part.placements.map((p) =>
      p.id === "fx-neon" ? { ...p, mount: { on: "fx-gone", anchor: "top" } } : p,
    );
    expect(() => buildRoom({ ...part, placements: lost }, options)).toThrow();
    const anchorless = {
      ...part,
      handoff: { ...part.handoff, to: { placement: part.figures.visitor, anchor: "foot" } },
    };
    expect(() => buildRoom(anchorless, options)).toThrow();
    expect(() => buildRoom({ ...part, figures: { ...part.figures, twin: "fx-gone" } }, options)).toThrow();
  });

  it("releases every geometry, material, and texture it made", () => {
    const room = build(good());
    const made = new Set<BufferGeometry | Material | Texture>();
    room.scene.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      made.add(mesh.geometry);
      for (const m of ([] as Material[]).concat(mesh.material)) {
        made.add(m);
        const ramp = (m as Partial<{ gradientMap: Texture | null }>).gradientMap;
        if (ramp) made.add(ramp);
      }
    });
    expect(made.size).toBeGreaterThan(10);
    const released = new Set<unknown>();
    for (const thing of made) thing.addEventListener("dispose", () => released.add(thing));
    disposeRoom(room);
    expect(released.size).toBe(made.size);
  });
});

describe("the hand-off in 3D", () => {
  /** Where a world point lies across a figure, in its own frame: above 0 on its right (+X), below 0 on its left. */
  const across = (figure: Object3D, point: Vector3): number => {
    const frame = figure.parent;
    if (!frame) return point.x;
    frame.updateWorldMatrix(true, false);
    return frame.worldToLocal(point.clone()).x;
  };

  for (const [setting, result] of [
    ["the twin on the visitor's right", good],
    ["the twin on the visitor's left", mirrored],
  ] as const) {
    it(`turns the visitor toward the twin to take the paper, then back, and the twin toward the visitor, ${setting}`, () => {
      const composed = result();
      expect(composed.findings).toEqual([]);
      for (const { id } of AVATARS) {
        const room = build(composed, id);
        // The paper comes from the twin's hand, and the visitor's own hand waits on the twin's side (the data's).
        const towardTwin = Math.sign(across(room.visitor, room.anchors.twinHand));
        const towardVisitor = Math.sign(across(room.twin, room.anchors.visitorHand));
        expect(towardTwin).toBe(setting.endsWith("right") ? 1 : -1);
        expect(towardVisitor).toBe(-towardTwin);
        expect(Math.sign(across(room.visitor, room.anchors.visitorHand)), id).toBe(towardTwin);
        showHandoff(room, 0, false);
        expect(room.visitor.rotation.y, id).toBeCloseTo(0, 12);
        expect(room.twin.rotation.y, id).toBeCloseTo(0, 12);
        // A positive turn about +Y brings a figure's front, +Z, toward its +X: each turns toward the other.
        showHandoff(room, 0.5, false);
        expect(room.visitor.rotation.y, id).toBeCloseTo(towardTwin * VISITOR_TURN, 12);
        expect(room.twin.rotation.y, id).toBeCloseTo(towardVisitor * 0.45, 12);
        // Then back, once the paper is in its hand.
        showHandoff(room, 1, false);
        expect(room.visitor.rotation.y, id).toBeCloseTo(0, 12);
        expect(room.twin.rotation.y, id).toBeCloseTo(0, 12);
        // Under reduced motion, nothing turns.
        showHandoff(room, 0.5, true);
        expect([room.visitor.rotation.y, room.twin.rotation.y]).toEqual([0, 0]);
      }
    });
  }

  it("turns the visitor only as the paper nears its hand: none at first, all of it by the middle", () => {
    expect([0, 0.2, 0.5, 0.8, 1].map(visitorTurnShare)).toEqual([0, 0, 1, 1, 0]);
    expect(visitorTurnShare(0.35)).toBeCloseTo(0.5, 12);
    expect(visitorTurnShare(0.9)).toBeCloseTo(0.5, 12);
    expect(VISITOR_TURN).toBeGreaterThan(0);
    expect(VISITOR_TURN).toBeLessThan(0.45);
  });

  it("moves the paper from the twin's hand to the visitor's in an arc, the twin turning toward the visitor", () => {
    const room = build(good(), "man");
    const { twinHand, visitorHand } = room.anchors;
    showHandoff(room, 0, false);
    expectClose(position(room.paper.sheet), twinHand.toArray(), 1e-9, "at the start");
    expect([room.paper.atTwin.opacity, room.paper.atVisitor.opacity]).toEqual([1, 0]);
    showHandoff(room, 0.5, false);
    const middle = twinHand
      .clone()
      .lerp(visitorHand, 0.5)
      .add(new Vector3(0, 0.35, 0));
    expectClose(position(room.paper.sheet), middle.toArray(), 1e-9, "at the middle");
    // The fixture's twin stands on the visitor's right, so it turns to its own left.
    expect(room.twin.rotation.y).toBeCloseTo(-0.45, 12);
    showHandoff(room, 1, false);
    expectClose(position(room.paper.sheet), visitorHand.toArray(), 1e-9, "at the end");
    expect(room.twin.rotation.y).toBeCloseTo(0, 12);
  });

  it("crossfades the paper in place under reduced motion", () => {
    const room = build(good(), "woman");
    showHandoff(room, 0, true);
    const start = position(room.paper.sheet);
    expect([room.paper.atTwin.opacity, room.paper.atVisitor.opacity]).toEqual([1, 0]);
    showHandoff(room, 0.5, true);
    expectClose(position(room.paper.sheet), start, 1e-12);
    expect(room.paper.atTwin.opacity).toBeCloseTo(0.5);
    expect(room.paper.atVisitor.opacity).toBeCloseTo(0.5);
    expect([room.twin.rotation.y, room.visitor.rotation.y]).toEqual([0, 0]);
    showHandoff(room, 1, true);
    expect([room.paper.atTwin.opacity, room.paper.atVisitor.opacity]).toEqual([0, 1]);
  });
});

describe("the camera's framing", () => {
  for (const aspect of ASPECTS) {
    it(`frames every framed box with compose/framing.ts at ${aspect}`, () => {
      const part = good().scene;
      const boxes = framedBoxes(part);
      expect(boxes).toEqual(part.placements.filter((p) => p.framed).map((p) => p.frame_box));
      expect(boxes.length).toBeGreaterThan(3);
      const camera = new PerspectiveCamera();
      const spec = frameCamera(camera, aspect, boxes);
      expect(spec).toEqual(framing(aspect, boxes));
      const view = projector(spec, aspect);
      expectClose(camera.matrixWorldInverse.elements, view.view as Mat4, 1e-9, "view");
      expectClose(camera.projectionMatrix.elements, view.projection as Mat4, 1e-9, "projection");
      for (const { min, max } of boxes)
        for (const x of [min[0], max[0]])
          for (const y of [min[1], max[1]])
            for (const z of [min[2], max[2]]) {
              const p = new Vector3(x, y, z).project(camera);
              expectClose(p.toArray(), view.project([x, y, z]), 1e-9, `${x}, ${y}, ${z}`);
              expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
              expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
              expect(p.z).toBeLessThan(1);
            }
    });
  }
});

describe("the scene module (src/room/scene.ts, T098)", () => {
  /** What createScene fails with, or null; jsdom draws no WebGL, so a part it accepts fails only at its renderer, which
   *  says so on the console too. */
  function failure(room: RoomIndex): string | null {
    const win = new JSDOM("<main></main>", { pretendToBeVisual: true }).window as unknown as TestWindow;
    win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const stage = createScene({
        win,
        doc: win.document,
        clock: new FakeClock(),
        room,
        avatar: "dog",
        reducedMotion: false,
        select: () => undefined,
        onFrame: () => undefined,
      });
      stage.dispose();
      return null;
    } catch (error) {
      return String(error);
    }
  }

  it("draws the site's 3D part, refusing it before it makes a renderer when its digest isn't the index's", () => {
    // The tests' virtual:room-scene is the repository's 3D part, as the site's build bundles it (vitest.config.ts).
    const { index } = repositoryBundle();
    expect(roomScene.digest).toBe(index.digest);
    expect(failure({ ...index, digest: [...index.digest].reverse().join("") })).toMatch(/digest/);
    expect(failure(index) ?? "").not.toMatch(/digest/);
  });

  it("leaves the room in 2D when it refuses, as for a chunk that fails to load", async () => {
    const v = start({ webgl: true });
    v.scene.module.createScene = () => {
      throw new Error("the 3D part's digest isn't the index's");
    };
    await enter(v);
    expect(v.room.visit.mode).toBe("2d");
    expect(v.doc.querySelector(".flat")).not.toBeNull();
    expect(v.events.filter((e) => e.kind === "mode_2d")).toHaveLength(1);
  });

  it("builds no piece of its own, holds no layout, and picks with no raycast: the 3D part is the room (T112)", async () => {
    // The stage that draws the bundle's room, its labels, and its quality levels are all the module gives.
    expect(Object.keys(await import("../../src/room/scene")).sort()).toEqual([
      "createLabels",
      "createScene",
      "qualitySettings",
    ]);
    // Spec 002's layout went with its pieces: compose/framing.ts frames the bundle's boxes.
    expect(existsSync(fileURLToPath(new URL("../../src/room/framing.ts", import.meta.url)))).toBe(false);
  });
});

describe("the site's own room, from the repository's bundle (spec 002's work area, T112)", () => {
  // From a 320-pixel portrait phone's stage to a wide desktop: spec 002 kept its twin, desk, laptop, screen, snowboard,
  // and bicycle on screen; the site's room keeps every framed placement's picture there, each avatar's cut-out too.
  for (const aspect of ASPECTS) {
    it(`keeps every framed piece on screen at ${aspect}`, () => {
      const result = repositoryBundle();
      const framed = result.scene.placements.filter((p) => p.framed);
      expect(framed.length).toBeGreaterThan(3);
      const camera = new PerspectiveCamera();
      frameCamera(camera, aspect, framedBoxes(result.scene));
      for (const { id: avatar } of AVATARS) {
        const room = build(result, avatar);
        for (const p of framed) {
          const b = new Box3().setFromObject(room.pictures.get(p.id) as Object3D);
          expect(b.isEmpty(), p.id).toBe(false);
          for (const x of [b.min.x, b.max.x])
            for (const y of [b.min.y, b.max.y])
              for (const z of [b.min.z, b.max.z]) {
                const q = new Vector3(x, y, z).project(camera);
                expect(Math.abs(q.x), `${p.id} x at ${aspect}, ${avatar}`).toBeLessThanOrEqual(1);
                expect(Math.abs(q.y), `${p.id} y at ${aspect}, ${avatar}`).toBeLessThanOrEqual(1);
                expect(q.z, `${p.id} in front at ${aspect}, ${avatar}`).toBeLessThan(1);
              }
        }
        disposeRoom(room);
      }
    });
  }

  it("labels each stand-in it shows as a placeholder, in the site's own words", () => {
    const room = build(repositoryBundle());
    const words = [...room.labels.values()].map((node) => node.name.slice("label:".length));
    expect(words.length).toBeGreaterThan(3);
    for (const w of words) expect(w).toMatch(/placeholder/i);
    disposeRoom(room);
  });
});

describe("quality levels", () => {
  it("lower the pixel ratio, then shadows, then textures and animations, never raising any", () => {
    const levels = [0, 1, 2, 3].map(qualitySettings);
    for (let i = 1; i < levels.length; i += 1) {
      const [a, b] = [levels[i - 1], levels[i]];
      if (!a || !b) throw new Error("missing level");
      expect(b.pixelRatio).toBeLessThanOrEqual(a.pixelRatio);
      expect(Number(b.shadows)).toBeLessThanOrEqual(Number(a.shadows));
      expect(b.textureScale).toBeLessThanOrEqual(a.textureScale);
      expect(Number(b.animations)).toBeLessThanOrEqual(Number(a.animations));
    }
    expect(levels[0]).toMatchObject({ shadows: true, animations: true });
    expect(levels[3]).toMatchObject({ shadows: false, animations: false });
    expect(levels[1]?.pixelRatio).toBeLessThan(levels[0]?.pixelRatio ?? 0);
  });
});

describe("the labels' textures", () => {
  /** A jsdom document whose canvases draw on a stand-in 2D context that measures text by its font's size. */
  function documentWith2d(): Document {
    const win = new JSDOM("<p>").window;
    win.HTMLCanvasElement.prototype.getContext = function getContext(kind: string) {
      if (kind !== "2d") return null;
      const ctx = {
        font: "",
        fillStyle: "",
        textBaseline: "",
        measureText: (text: string) => ({ width: text.length * 0.55 * Number(/(\d+)px/.exec(ctx.font)?.[1] ?? 10) }),
        fillRect: () => undefined,
        fillText: () => undefined,
      };
      return ctx;
    } as unknown as HTMLCanvasElement["getContext"];
    return win.document as unknown as Document;
  }

  it("are redrawn at quality 3's smaller scale, the old texture released and the size on screen kept", () => {
    const labels = createLabels(documentWith2d());
    const node = labels.factory("Snowboard (placeholder)");
    expect(node.name).toBe("label:Snowboard (placeholder)");
    const sprite = node.children[0] as Sprite;
    const first = sprite.material.map as Texture;
    const height = (first.image as HTMLCanvasElement).height;
    const onScreen = sprite.scale.clone();
    let released = 0;
    first.addEventListener("dispose", () => (released += 1));

    labels.setScale(qualitySettings(3).textureScale);
    const second = sprite.material.map as Texture;
    expect(second).not.toBe(first);
    expect(released).toBe(1);
    expect((second.image as HTMLCanvasElement).height).toBeLessThanOrEqual(Math.ceil(height / 2) + 1);
    expect((second.image as HTMLCanvasElement).height).toBeGreaterThanOrEqual(Math.floor(height / 2) - 1);
    expect(sprite.scale.x).toBeCloseTo(onScreen.x, 2);
    expect(sprite.scale.y).toBeCloseTo(onScreen.y, 5);

    // The same scale again changes nothing.
    labels.setScale(qualitySettings(3).textureScale);
    expect(sprite.material.map).toBe(second);
  });

  it("are left as named nodes where the page has no 2D canvas", () => {
    const win = new JSDOM("<p>").window;
    win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
    const labels = createLabels(win.document as unknown as Document);
    const node = labels.factory("Desk (placeholder)");
    expect(node.name).toBe("label:Desk (placeholder)");
    expect(node.children).toHaveLength(0);
    labels.setScale(0.5);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// The studio models in the 3D stage (T134; T141, the lookdev review's runtime-7)
// --------------------------------------------------------------------------------------------------------------------
/** WebGL's MAX_TEXTURE_SIZE. */
const MAX_TEXTURE_SIZE = 0x0d33;

/** A stand-in for WebGLRenderer: what scene.ts and OutlineEffect use of it, each frame's scene kept. */
function standInRenderer(): { renderer: object; drawn(): Scene; disposed(): boolean } {
  let last: Scene | null = null;
  let gone = false;
  const renderer = {
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: (scene: Scene) => {
      last = scene;
    },
    dispose: () => {
      gone = true;
    },
  };
  return {
    renderer,
    drawn: () => {
      if (!last) throw new Error("no frame drawn");
      return last;
    },
    disposed: () => gone,
  };
}

/** One fetch the page made, which the test answers; an aborted one rejects, as a browser's does. */
interface Fetched {
  readonly url: string;
  readonly init: RequestInit;
  answer(body: Uint8Array | undefined): void;
}

interface Staged {
  readonly win: TestWindow;
  readonly clock: FakeClock;
  readonly stage: ReturnType<typeof createScene>;
  readonly result: ComposeResult;
  readonly fetched: Fetched[];
  readonly events: AssetEvent[];
  /** Each set model's plain file, by piece. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  /** The visit's mode, which the stage's events read. */
  mode: Mode;
  /** The holds taken and not yet let go. */
  held(): number;
  /** The WebGL 2 contexts asked for since the stage was made: capability()'s probes, the renderer being a stand-in. */
  probes(): number;
  /** The scene the last frame drew. */
  drawn(): Scene;
  disposed(): boolean;
}

/** The pieces whose models the stage loads: a placed piece, and the piece a switch shows in each of its cases. */
const SET = ["fx-desk", "fx-plug"];
let composedWithModels: ComposeResult | null = null;

/**
 * The fixture room with set models on SET, composed under main's caps, drawn by the scene module with a stand-in
 * renderer, on a window whose fetch is a spy the test answers and whose WebGL 2 context reports 16384-pixel textures.
 */
function staged(
  options: Partial<SceneOptions> = {},
  part?: (own: RoomScene) => RoomScene,
  make: typeof createScene = createScene,
): Staged {
  composedWithModels ??= compose(overlay(modelChanges(SET)), capsPolicy(), { mode: "lenient", drafts: false });
  const result = composedWithModels;
  const changes = modelChanges(SET);
  const r = standInRenderer();
  swapped.part = part ? part(result.scene) : result.scene;
  swapped.renderer = () => r.renderer;
  const win = new JSDOM("<main></main>", { url: "http://127.0.0.1:18105/", pretendToBeVisual: true })
    .window as unknown as TestWindow;
  let probes = 0;
  win.HTMLCanvasElement.prototype.getContext = ((kind: string) => {
    if (kind !== "webgl2") return null;
    probes += 1;
    return {
      MAX_TEXTURE_SIZE,
      getParameter: (name: number) => (name === MAX_TEXTURE_SIZE ? 16384 : null),
      getExtension: () => ({ loseContext: () => undefined }),
    };
  }) as unknown as HTMLCanvasElement["getContext"];
  // createImageBitmap, which jsdom lacks: a bitmap of the image header's size, or the resize asked for.
  Object.defineProperty(win, "createImageBitmap", {
    configurable: true,
    value: async (source: Blob, o: ImageBitmapOptions = {}) => {
      const size = readImage(new Uint8Array(await source.arrayBuffer())).header;
      if (!size) throw new Error("undecodable");
      return { width: o.resizeWidth ?? size.width, height: o.resizeHeight ?? size.height, close: () => undefined };
    },
  });
  const fetched: Fetched[] = [];
  Object.defineProperty(win, "fetch", {
    configurable: true,
    value: (url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        fetched.push({
          url,
          init,
          answer: (body) =>
            resolve({
              status: 200,
              arrayBuffer: () => Promise.resolve((body ?? new Uint8Array()).slice().buffer),
            } as Response),
        });
      }),
  });
  const clock = new FakeClock();
  const events: AssetEvent[] = [];
  let held = 0;
  const s: Omit<Staged, "stage"> & { stage: Staged["stage"] | null } = {
    win,
    clock,
    stage: null,
    result,
    fetched,
    events,
    files: new Map(SET.map((piece) => [piece, changes[`assets/room/${piece}.glb`] as Uint8Array])),
    mode: "3d",
    held: () => held,
    probes: () => probes,
    drawn: r.drawn,
    disposed: r.disposed,
  };
  s.stage = make({
    win,
    doc: win.document,
    clock,
    room: result.index,
    avatar: "dog",
    reducedMotion: false,
    select: () => undefined,
    onFrame: () => undefined,
    handoff: Promise.resolve(),
    hold: () => {
      held += 1;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        held -= 1;
      };
    },
    level: () => 0,
    mode: () => s.mode,
    assets: (event) => events.push(event),
    ...options,
  });
  return s as Staged;
}

/** Whether a holder (a placement's node, or a switch's case) shows a model, and whether its stand-in shows. */
function showing(holder: Object3D | undefined): { model: boolean; standin: boolean | undefined } {
  return {
    model: holder?.children.some((c) => c.name === MODEL_NODE) ?? false,
    standin: holder?.children.find((c) => c.name === "standin")?.visible,
  };
}

/** Every holder the set pieces show in: the desk's placement, and each case of the plug's switch. */
function holdersOf(s: Staged): Object3D[] {
  const scene = s.drawn();
  const part = s.result.scene;
  const sw = part.switches.find((x) => x.piece === "fx-plug");
  const names = [
    ...part.placements.filter((p) => p.piece === "fx-desk").map((p) => p.id),
    ...Object.keys(sw?.poses ?? {}).map((pose) => `${sw?.id ?? ""}.${pose}`),
  ];
  expect(names.length).toBeGreaterThan(2);
  return names.map((name) => scene.getObjectByName(name) as Object3D);
}

/** A loaded event of a set piece's model: its .gz copy's length. */
function loadedEvent(s: Staged, piece: string): AssetEvent {
  const bytes = s.result.models.find((m) => m.piece === piece)?.gz.length ?? -1;
  return { asset: piece, outcome: "loaded", ms_bucket: "<250", bytes, mode: "full" };
}

const byAsset = (events: readonly AssetEvent[]): AssetEvent[] =>
  [...events].sort((a, b) => a.asset.localeCompare(b.asset));

/** Answers the stage's fetches from `from` on with each model's plain file, and waits for their events. */
async function answerAll(s: Staged, from: number): Promise<void> {
  const before = s.events.length;
  const answering = s.fetched.slice(from);
  for (const f of answering) f.answer(s.files.get(SET.find((piece) => f.url.startsWith(`a/${piece}.`)) ?? ""));
  await vi.waitFor(() => expect(s.events.length - before).toBe(answering.length));
}

describe("the room's studio models in its 3D stage (scene.ts with scene/loader.ts; T134, T141)", () => {
  afterEach(() => {
    swapped.part = null;
    swapped.renderer = null;
  });

  it("fetches each set model in load_order as R-28 has it, and swaps it in for its piece's stand-ins", async () => {
    const s = staged();
    const part = s.result.scene;
    const desk = part.placements.find((p) => p.piece === "fx-desk")?.model;
    const plug = part.switches.find((x) => x.piece === "fx-plug")?.model;
    expect(part.load_order).toHaveLength(2);
    await vi.waitFor(() => expect(s.fetched).toHaveLength(2));
    // Same-origin a/ URLs, in load_order, each with its plain file's SHA-256 as its integrity and no redirect.
    expect(s.fetched.map((f) => f.url)).toEqual([desk?.url, plug?.url]);
    expect(s.fetched.map((f) => f.init.integrity)).toEqual([
      integrity(desk?.sha256 ?? ""),
      integrity(plug?.sha256 ?? ""),
    ]);
    for (const f of s.fetched)
      expect(f.init).toMatchObject({ redirect: "error", mode: "same-origin", credentials: "same-origin" });
    s.clock.advance(16);
    for (const holder of holdersOf(s)) expect(showing(holder), holder.name).toEqual({ model: false, standin: true });
    await answerAll(s, 0);
    expect(byAsset(s.events)).toEqual([loadedEvent(s, "fx-desk"), loadedEvent(s, "fx-plug")]);
    // Held from each parse until two frames after its swap.
    expect(s.held()).toBe(2);
    s.clock.advance(SETTLE_FRAMES * 16);
    expect(s.held()).toBe(0);
    for (const holder of holdersOf(s)) expect(showing(holder), holder.name).toEqual({ model: true, standin: false });
    s.stage.dispose();
    expect(s.events).toHaveLength(2);
  });

  it("puts every swapped piece back to its stand-ins when a lost context is restored, then loads it again", async () => {
    const s = staged();
    await vi.waitFor(() => expect(s.fetched).toHaveLength(2));
    await answerAll(s, 0);
    s.clock.advance(SETTLE_FRAMES * 16);
    s.stage.canvas.dispatchEvent(new s.win.Event("webglcontextrestored"));
    // At once: the stand-ins back, wherever the pieces show.
    for (const holder of holdersOf(s)) expect(showing(holder), holder.name).toEqual({ model: false, standin: true });
    await vi.waitFor(() => expect(s.fetched).toHaveLength(4));
    expect(s.fetched.slice(2).map((f) => f.url)).toEqual(s.fetched.slice(0, 2).map((f) => f.url));
    await answerAll(s, 2);
    s.clock.advance(SETTLE_FRAMES * 16);
    for (const holder of holdersOf(s)) expect(showing(holder), holder.name).toEqual({ model: true, standin: false });
    expect(byAsset(s.events.slice(2))).toEqual([loadedEvent(s, "fx-desk"), loadedEvent(s, "fx-plug")]);
    expect(s.held()).toBe(0);
    s.stage.dispose();
  });

  it("stops its loader when disposed: the fetch on its way aborted, and the model not loaded skipped in 2D", async () => {
    const s = staged();
    await vi.waitFor(() => expect(s.fetched).toHaveLength(2));
    const [desk, plug] = s.fetched;
    desk?.answer(s.files.get("fx-desk"));
    await vi.waitFor(() => expect(s.events).toHaveLength(1));
    // The room goes to 2D within the desk's two settle frames, the plug still on its way.
    s.mode = "2d";
    s.stage.dispose();
    expect(plug?.init.signal?.aborted).toBe(true);
    expect(s.held()).toBe(0);
    expect(s.disposed()).toBe(true);
    expect(s.events).toEqual([
      loadedEvent(s, "fx-desk"),
      { asset: "fx-plug", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "2d" },
    ]);
    // Nothing more: a restore reloads nothing, and the answer comes too late.
    s.stage.canvas.dispatchEvent(new s.win.Event("webglcontextrestored"));
    plug?.answer(s.files.get("fx-plug"));
    await flush();
    s.clock.advance(1000);
    await flush();
    expect(s.fetched).toHaveLength(2);
    expect(s.events).toHaveLength(2);
  });

  it("gives every model it swaps in inked cel's one set of line parameters, the stand-ins' (US1's ink.prepare)", async () => {
    // The review of T116, R3, shares the lines' parameters once after the room is built, not on each frame, "and again
    // when a model swaps in" (scene/look.ts), so the stage's height reaches a model's lines as it does the stand-ins'.
    const s = staged();
    expect(s.result.scene.look.method).toBe("inked-cel");
    await vi.waitFor(() => expect(s.fetched).toHaveLength(2));
    await answerAll(s, 0);
    s.clock.advance(SETTLE_FRAMES * 16);
    const lines = new Set<unknown>();
    let models = 0;
    s.drawn().traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      for (let n: Object3D | null = node; n; n = n.parent)
        if (n.name === MODEL_NODE) {
          models += 1;
          break;
        }
      for (const m of ([] as Material[]).concat(mesh.material)) lines.add(m.userData.outlineParameters);
    });
    expect(models).toBeGreaterThan(0);
    expect(lines.size).toBe(1);
    expect([...lines][0]).toBeDefined();
    s.stage.dispose();
  });

  it("takes ADR 0010's floor from the room, which read it behind the choice, asking the device nothing itself", async () => {
    const above = staged({ floor: true });
    await vi.waitFor(() => expect(above.fetched).toHaveLength(2));
    expect(above.probes()).toBe(0);
    above.stage.dispose();
    // Below it every model is skipped and nothing fetched, whatever the device would answer during the hand-off.
    const below = staged({ floor: false });
    await vi.waitFor(() => expect(below.events).toHaveLength(2));
    expect(below.probes()).toBe(0);
    expect(below.fetched).toEqual([]);
    expect(byAsset(below.events)).toEqual(
      SET.map((asset) => ({ asset, outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "full" })),
    );
    below.stage.dispose();
  });

  it("holds its texture ledger to the caps' scene_texture_bytes the compose used, raised or lowered", async () => {
    // A PNG whose header alone says side × side, which the stand-in decoder sizes its bitmap from: no pixels to make.
    const be = (n: number): Uint8Array => bytes((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
    const claimed = (side: number): Uint8Array =>
      concat(
        PNG_SIGNATURE,
        chunk("IHDR", concat(be(side), be(side), bytes(8, 2, 0, 0, 0))),
        chunk("IDAT", bytes(0)),
        chunk("IEND", new Uint8Array()),
      );
    // Raised by the Author: a desk whose top alone is 8192 × 8192 pixels, 357,913,941 bytes, over FR-053's starting
    // 96,000,000, loads.
    const raised = staged({}, (own) => ({ ...own, scene_texture_bytes: 400_000_000 }));
    await vi.waitFor(() => expect(raised.fetched).toHaveLength(2));
    raised.fetched[0]?.answer(desk({ top: claimed(8192) }).bytes);
    await vi.waitFor(() => expect(raised.events).toHaveLength(1));
    expect(raised.events).toEqual([loadedEvent(raised, "fx-desk")]);
    raised.stage.dispose();
    // Lowered under the plain desk's three small images: it keeps its stand-in, skipped.
    const lowered = staged({}, (own) => ({ ...own, scene_texture_bytes: 1000 }));
    await vi.waitFor(() => expect(lowered.fetched).toHaveLength(2));
    lowered.fetched[0]?.answer(desk().bytes);
    await vi.waitFor(() => expect(lowered.events).toHaveLength(1));
    expect(lowered.events).toEqual([
      { asset: "fx-desk", outcome: "skipped", ms_bucket: "<250", bytes: 0, mode: "full" },
    ]);
    lowered.clock.advance(SETTLE_FRAMES * 16);
    expect(showing(lowered.drawn().getObjectByName("fx-desk"))).toEqual({ model: false, standin: true });
    lowered.stage.dispose();
  });

  it("fetches nothing when disposed before its loader's chunk arrives", async () => {
    const s = staged();
    s.mode = "2d";
    s.stage.dispose();
    await flush();
    s.clock.advance(1000);
    await flush();
    expect(s.fetched).toEqual([]);
    expect(s.held()).toBe(0);
  });

  it("records each set model failed when its loader's chunk won't load, but for a stage the room left first", async () => {
    // A browser keeps a failed module's failure, so there is no retry: the stand-ins stay, each model failed (FR-057).
    vi.doMock("../../src/room/scene/loader", () => {
      throw new Error("the loader's chunk didn't load");
    });
    vi.resetModules();
    try {
      const { createScene: blocked } = await import("../../src/room/scene");
      const s = staged({ floor: true }, undefined, blocked);
      await vi.waitFor(() => expect(s.events).toHaveLength(2));
      expect(byAsset(s.events)).toEqual(
        SET.map((asset) => ({ asset, outcome: "failed", ms_bucket: "<250", bytes: 0, mode: "full" })),
      );
      expect(s.fetched).toEqual([]);
      s.clock.advance(16);
      for (const holder of holdersOf(s)) expect(showing(holder), holder.name).toEqual({ model: false, standin: true });
      s.stage.dispose();
      expect(s.events).toHaveLength(2);
      // A stage the room left first records nothing: the room skips its models in 2D (app.ts).
      const left = staged({ floor: true }, undefined, blocked);
      left.mode = "2d";
      left.stage.dispose();
      await flush();
      await flush();
      expect(left.events).toEqual([]);
      expect(left.fetched).toEqual([]);
    } finally {
      vi.doUnmock("../../src/room/scene/loader");
      vi.resetModules();
    }
  });
});
