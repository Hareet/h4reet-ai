// rework-024 (spec 024; FR-009, US3 AS5; rv-impl-024's B-1): nothing of the eating advances or schedules while the room
// is paused. The meal's pause is the one pause the eating reads: a flight paused mid-way doesn't land however long the
// pause lasts, and lands after the rest of its flight once resumed; a growth the same; the meal's ledger isn't told of a
// landing or a growth while paused; and a press while paused neither splits the piece nor starts a flight. Stub meshes,
// no GPU, on the room's clock as scene.ts gives it (the meal and the 3D side both on it).
import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial } from "three";
import type { Object3D } from "three";
import { describe, expect, it, vi } from "vitest";

import type { RoomScene } from "../../src/room/compose/bundle";
import { FLIGHT_MS, GROW_MS, createEat3d } from "../../src/room/eat/eat3d";
import { createMeal } from "../../src/room/eat/meal";

type Part = Pick<RoomScene, "pieces" | "placements" | "switches">;

/** A grid of triangles in the plane z = `z`. */
function sheet(w: number, h: number, z: number, x0: number): BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < w; i++)
    for (let j = 0; j < h; j++) {
      const [x, y] = [x0 + i * 0.05, -0.1 + j * 0.05];
      positions.push(x, y, z, x + 0.05, y, z, x, y + 0.05, z);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
  return g;
}

/** A stub piece of two sheets, three chunks, no face. */
function stub(): { root: Group; part: Part } {
  const root = new Group();
  root.name = "model";
  const material = new MeshStandardMaterial({ color: new Color(1, 0, 0) });
  const a = new Mesh(sheet(8, 6, -0.02, -0.15), material);
  a.name = "front";
  const b = new Mesh(sheet(8, 6, -0.3, 0.5), material);
  b.name = "back";
  root.add(a, b);
  root.position.set(1, 0.5, -2);
  root.updateMatrixWorld(true);
  const part = {
    pieces: { stub: { scale: 1, anchors: {}, standin: [], faces: {}, glows: {} } },
    placements: [
      {
        id: "stub",
        piece: "stub",
        mount: null,
        offset: [0, 0, 0],
        turn: { x: 0, y: 0, z: 0 },
        framed: true,
        frame_box: { min: [0, 0, 0], max: [1, 1, 1] },
        label: null,
        model: null,
        edible: { chunks: 3 },
      },
    ],
    switches: [],
  } as unknown as Part;
  return { root, part };
}

function rig() {
  const s = stub();
  const clock = { t: 1000 };
  const meal = createMeal({ regrow_s: 5, now: () => clock.t });
  const landed = vi.spyOn(meal, "landed");
  const grown = vi.spyOn(meal, "grown");
  const refresh = vi.fn();
  const mouth = new Group();
  mouth.position.set(3, 1, 0);
  mouth.updateMatrixWorld(true);
  const eat = createEat3d({
    part: s.part,
    model: (id) => (id === "stub" ? s.root : null),
    figure: () => ({ root: mouth, height: 1.2 }),
    meal,
    highlight: { refresh },
    now: () => clock.t,
    reduced: () => false,
    warn: vi.fn(),
  });
  return { ...s, clock, meal, landed, grown, refresh, eat };
}

/** A chunk's meshes, by index. */
function chunkMeshes(root: Object3D, index: number): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((n) => {
    const tag = n.userData.eat as { kind?: string; chunk?: number } | undefined;
    if (tag?.kind === "chunk" && tag.chunk === index) out.push(n as Mesh);
  });
  return out;
}

const places = (meshes: readonly Mesh[]): number[][] =>
  meshes.map((m) => [...m.position.toArray(), ...m.scale.toArray()]);

describe("the eating while the room is paused (FR-009, US3 AS5)", () => {
  it("a flight paused mid-way doesn't land however long the pause, and lands after the rest of its flight", () => {
    const r = rig();
    expect(r.eat.bite("stub")).toBe(true);
    const index = r.meal.states("stub").indexOf("flying");
    const flying = chunkMeshes(r.root, index);
    r.clock.t += 200;
    r.eat.frame();
    const mid = places(flying);
    r.meal.pause();
    for (let k = 0; k < 10; k++) {
      r.clock.t += 100;
      r.eat.frame();
    }
    expect(r.clock.t - 1000).toBeGreaterThan(FLIGHT_MS);
    expect(r.meal.states("stub")[index]).toBe("flying");
    expect(r.landed).not.toHaveBeenCalled();
    expect(r.refresh).not.toHaveBeenCalled();
    expect(places(flying), "nothing of the flight moves while paused").toEqual(mid);
    for (const m of flying) expect(m.visible).toBe(true);
    r.meal.resume();
    r.clock.t += FLIGHT_MS - 200 - 1;
    r.eat.frame();
    expect(r.meal.states("stub")[index]).toBe("flying");
    r.clock.t += 1;
    r.eat.frame();
    expect(r.meal.states("stub")[index]).toBe("eaten");
    expect(r.landed).toHaveBeenCalledTimes(1);
    for (const m of flying) expect(m.visible).toBe(false);
  });

  it("a growth paused mid-way doesn't end however long the pause, and ends after the rest of its growth", () => {
    const r = rig();
    r.eat.bite("stub");
    const index = r.meal.states("stub").indexOf("flying");
    r.clock.t += FLIGHT_MS;
    r.eat.frame();
    expect(r.meal.states("stub")[index]).toBe("eaten");
    r.clock.t += 5000;
    r.eat.frame();
    expect(r.meal.states("stub")[index]).toBe("regrowing");
    r.clock.t += 100;
    r.eat.frame();
    const growing = chunkMeshes(r.root, index);
    const mid = places(growing);
    r.meal.pause();
    for (let k = 0; k < 10; k++) {
      r.clock.t += 100;
      r.eat.frame();
    }
    expect(r.meal.states("stub")[index]).toBe("regrowing");
    expect(r.grown).not.toHaveBeenCalled();
    expect(places(growing), "nothing of the growth moves while paused").toEqual(mid);
    r.meal.resume();
    r.clock.t += GROW_MS - 100 - 1;
    r.eat.frame();
    expect(r.meal.states("stub")[index]).toBe("regrowing");
    r.clock.t += 1;
    r.eat.frame();
    expect(r.meal.states("stub")[index]).toBe("standing");
    expect(r.grown).toHaveBeenCalledTimes(1);
  });

  it("a regrowth comes due no sooner for a pause during the flight: the landing's timer starts at the landing", () => {
    const r = rig();
    r.eat.bite("stub");
    const index = r.meal.states("stub").indexOf("flying");
    r.meal.pause();
    r.clock.t += 60_000;
    r.eat.frame();
    r.meal.resume();
    r.clock.t += FLIGHT_MS;
    r.eat.frame();
    expect(r.meal.states("stub")[index]).toBe("eaten");
    r.clock.t += 5000 - 1;
    r.eat.frame();
    expect(r.meal.states("stub")[index]).toBe("eaten");
    r.clock.t += 1;
    r.eat.frame();
    expect(r.meal.states("stub")[index]).toBe("regrowing");
  });

  it("a press while paused neither splits the piece nor starts a flight", () => {
    const r = rig();
    r.meal.pause();
    expect(r.eat.bite("stub")).toBe(false);
    expect(r.meal.has("stub"), "no split while paused").toBe(false);
    let eatMeshes = 0;
    r.root.traverse((n) => {
      if (n.userData.eat !== undefined) eatMeshes++;
    });
    expect(eatMeshes).toBe(0);
    for (const child of r.root.children) expect(child.visible).toBe(true);
    r.meal.resume();
    expect(r.eat.bite("stub")).toBe(true);
    expect(chunkMeshes(r.root, r.meal.states("stub").indexOf("flying")).length).toBeGreaterThan(0);
  });
});
