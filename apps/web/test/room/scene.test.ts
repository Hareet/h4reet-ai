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
import { JSDOM } from "jsdom";
import { Box3, Mesh, Object3D, PerspectiveCamera, ShapeGeometry, Vector3 } from "three";
import type { BufferGeometry, Color, Material, MeshBasicMaterial, Texture } from "three";
import { describe, expect, it, vi } from "vitest";
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
import { createScene } from "../../src/room/scene";
import {
  buildRoom,
  disposeRoom,
  frameCamera,
  framedBoxes,
  showHandoff,
  standinLabel,
} from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { shapeGeometry } from "../../src/room/scene/standins";
import { FakeClock, enter, repositoryBundle, start } from "../helpers/room";
import type { TestWindow } from "../helpers/room";
import { goodFiles, goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";

const decoder = new TextDecoder();
const text = (path: string): string => decoder.decode(goodFiles().get(path));
const SCENE = "apps/web/room/scene.yaml";
const strict = { mode: "strict", drafts: false } as const;
const good = (): ComposeResult => compose(goodTree(), noPolicy(), strict);

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
    const scaled = text(monitor).replace("size: { w: 0.6, h: 0.42, d: 0.05 }\n", "$&stylized_scale: 1.1\n");
    const result = compose(overlay({ [monitor]: scaled }), noPolicy(), strict);
    expect(result.findings).toEqual([]);
    const part = result.scene;
    expect(part.pieces["fx-monitor"]?.scale).toBe(1.1);
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

  it("ends the paper in each avatar's own hand, as spec 002 placed it from the avatar's size, offset from the anchor", () => {
    // Spec 002's hand: left of the figure's centre by 35% of its width, at 60% of its height but never above 0.95 m.
    const hand = (avatar: AvatarId): Vec3 => {
      const { width, height } = AVATAR_SHAPES[avatar];
      return [-width * 0.35, Math.min(0.95, height * 0.6), 0];
    };
    const first = hand(AVATARS[0].id);
    // The visitor turned a little on its mount, so the offset is the visitor's own, not the world's.
    const turned = text(SCENE).replace(
      "mount: { on: fx-shell, anchor: floor, offset: [0, 0, 0.8] }",
      "mount: { on: fx-shell, anchor: floor, offset: [0, 0, 0.8], turn: { y: 20 } }",
    );
    expect(turned).not.toBe(text(SCENE));
    for (const result of [good(), compose(overlay({ [SCENE]: turned }), noPolicy(), strict)]) {
      expect(result.findings).toEqual([]);
      const part = result.scene;
      const visitor = resolved(part).world.get(part.figures.visitor) ?? IDENTITY;
      const at = anchorPoint(part, part.handoff.to);
      for (const { id } of AVATARS) {
        const own = hand(id);
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
    // The dog's hand is 576 mm below the first avatar's, which a single anchor would leave in the air.
    expect(hand("dog")[1] - first[1]).toBeCloseTo(-0.576, 9);
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
    expect(room.twin.rotation.y).toBeCloseTo(0.45, 12);
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
    expect(room.twin.rotation.y).toBe(0);
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
});
