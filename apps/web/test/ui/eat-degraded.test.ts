// T013 (spec 024; FR-001, FR-009, FR-014, FR-016; US3; SC-004, SC-006): the degraded modes. In each, the tile, the key,
// and the tick do nothing: the room tells the 3D side when it is paused or the loader shows, and offers no tile in 2D
// or for another visitor; the eaten state is kept nowhere but in memory; and nothing leaves the page for the eating:
// no request, beacon, or storage touch through a whole visit of bites and regrowths, and no event kind or event
// config line added.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Group } from "three";
import { describe, expect, it, vi } from "vitest";

import { protectorFor } from "../../src/room/compose/protect";
import type { ProtectScene } from "../../src/room/compose/protect";
import { createEat3d } from "../../src/room/eat/eat3d";
import { createMeal } from "../../src/room/eat/meal";
import { EVENT_KINDS } from "../../src/room/events";
import { pieceModel, roomGlb } from "../helpers/eat-pieces";
import { button, enter, flush, REPO, repositoryBundle, start, throughLoader } from "../helpers/room";
import type { Visit } from "../helpers/room";
import { PROTECT_SCENE } from "../fixtures/room/protect-scene";

async function arrive(avatar: string, o: { webgl?: boolean; through?: boolean } = {}): Promise<Visit> {
  const v = start({ webgl: o.webgl ?? true });
  // The 3D stage's protector, the dinosaur's with the Eat box, as scene.ts gives it (and eat-button.test.ts's visit).
  v.scene.protect = protectorFor(PROTECT_SCENE as unknown as ProtectScene, 16, { eat: avatar === "dinosaur" });
  const press = vi.fn(() => true);
  v.scene.onCreate = () => {
    (v.scene.stage as unknown as { eat: { press: () => boolean } }).eat = { press };
  };
  await enter(v, "engineer", avatar);
  if (o.through === false) return v;
  await throughLoader(v);
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
  return v;
}

const eatButton = (v: Visit): HTMLButtonElement => v.doc.querySelector(".room-eat") as HTMLButtonElement;

// Spec 004's FR-007: no room ID stands in a test, so each real piece is found in the repository's bundle by its
// placement's label words.
const labelled = (words: string): string => {
  const { scene, index } = repositoryBundle();
  const found = scene.placements.filter((p) => p.label !== null && index.ui[p.label] === words);
  if (found.length !== 1 || !found[0]) throw new Error(`${found.length} placements labelled ${words}`);
  return found[0].id;
};

describe("the room's degraded states (US3; FR-001, FR-009)", () => {
  it("tells the 3D side the loader shows, and then that it doesn't", async () => {
    const v = await arrive("dinosaur", { through: false });
    const eating = v.scene.created.at(-1)?.eating;
    expect(eating).toBeDefined();
    if (v.doc.documentElement.getAttribute("data-loading") === "on") expect(eating?.state().loading).toBe(true);
    await throughLoader(v);
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    await flush();
    expect(eating?.state().loading).toBe(false);
  });

  it("tells the 3D side the room is paused, hides the tile, and a press then does nothing", async () => {
    const v = await arrive("dinosaur");
    const eating = v.scene.created.at(-1)?.eating;
    eating?.available?.(true);
    await flush();
    expect(eatButton(v).hidden).toBe(false);
    button(v.doc, "Pause the room").click();
    await flush();
    expect(eating?.state().paused).toBe(true);
    expect(eatButton(v).hidden).toBe(true);
    eatButton(v).click();
    const press = (v.scene.stage as unknown as { eat: { press: ReturnType<typeof vi.fn> } }).eat.press;
    expect(press).not.toHaveBeenCalled();
  });

  it("offers no tile and no eating in 2D, or to another visitor", async () => {
    const flat = await arrive("dinosaur", { webgl: false });
    expect(flat.scene.created).toHaveLength(0);
    expect(eatButton(flat).hidden).toBe(true);
    const dog = await arrive("dog");
    expect(dog.scene.created.at(-1)?.eating).toBeUndefined();
    expect(eatButton(dog).hidden).toBe(true);
  });

  it("leaves the room's existing pages as they were for every other visit (SC-004): the tile hidden, no Eat box", async () => {
    const v = await arrive("woman");
    expect(eatButton(v).hidden).toBe(true);
    expect(v.doc.documentElement.getAttribute("data-eat-place")).toBe("off");
  });
});

describe("nothing leaves for the eating (FR-014, FR-016; SC-006)", () => {
  it("makes no request, beacon, or storage touch through a whole visit of bites and regrowths", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.reject(new Error("no network")));
    const scene = repositoryBundle().scene;
    const models: Record<string, Group> = {};
    for (const id of ["Desk", "Desk sign, busy", "Laptop", "Chalkboard"].map(labelled))
      models[id] = pieceModel(roomGlb(id), scene.pieces[id]?.scale ?? 1);
    const clock = { t: 1000 };
    const meal = createMeal({ regrow_s: 5, now: () => clock.t });
    const mouth = new Group();
    const eat = createEat3d({
      part: scene,
      model: (id) => models[id] ?? null,
      figure: () => ({ root: mouth, height: 1.2 }),
      meal,
      highlight: { refresh: vi.fn() },
      now: () => clock.t,
      reduced: () => false,
      warn: vi.fn(),
    });
    for (let round = 0; round < 3; round++) {
      for (const id of Object.keys(models))
        for (let k = 0; k < 12 && eat.bite(id); k++) {
          clock.t += 700;
          eat.frame();
        }
      clock.t += 5000 * 12;
      for (let k = 0; k < 12; k++) {
        clock.t += 5000;
        eat.frame();
      }
    }
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("keeps nothing in the page's storage, and sends nothing, through a dinosaur visit", async () => {
    const v = await arrive("dinosaur");
    const before = {
      storage: v.spies.storage.length,
      network: v.spies.network.length,
      beacons: v.spies.beacons.length,
    };
    const eating = v.scene.created.at(-1)?.eating;
    const laptop = labelled("Laptop");
    // Its label word's key, as the 3D part carries it.
    const key = repositoryBundle().scene.placements.find((p) => p.id === laptop)?.label as string;
    for (let k = 0; k < 5; k++) {
      eating?.available?.(true);
      eatButton(v).click();
      eating?.said?.(laptop, key);
      eating?.available?.(false);
      v.clock.advance(1000);
      await flush();
    }
    expect(v.spies.storage.length).toBe(before.storage);
    expect(v.spies.network.length).toBe(before.network);
    expect(v.spies.beacons.slice(before.beacons).filter((b) => /eat/i.test(b.body))).toEqual([]);
  });

  it("adds no event kind and no event config line (Q117)", () => {
    expect(EVENT_KINDS.filter((k) => /eat|bite|chunk/.test(k))).toEqual([]);
    const config = readFileSync(join(REPO, "config/room-events.yaml"), "utf8");
    expect(/\b(eat|eating|eaten|bite|chunks?)\b/i.test(config)).toBe(false);
  });
});
