// T012 (spec 024; FR-010; US3): reduced motion and the polite line. Under reduced motion a bite hides its chunk at once
// (no flight) and a regrowth returns it whole at once (no growth); one polite line, eat.first_bite with the piece's
// label, is said at a piece's first bite of the visit and never again for it; the room says it in its live region.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Group, Mesh } from "three";
import type { Object3D } from "three";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { createEat3d } from "../../src/room/eat/eat3d";
import { createMeal } from "../../src/room/eat/meal";
import { pieceModel, roomGlb } from "../helpers/eat-pieces";
import { announcer, button, enter, flush, repositoryBundle, start, throughLoader, WEB } from "../helpers/room";
import type { Visit } from "../helpers/room";

const WORDS = (parse(readFileSync(join(WEB, "room/ui-words.yaml"), "utf8")) as { words: Record<string, string> }).words;

// Spec 004's FR-007: no room ID stands in a test, so each real piece is found in the repository's bundle by its
// placement's label words.
const labelled = (words: string): string => {
  const { scene, index } = repositoryBundle();
  const found = scene.placements.filter((p) => p.label !== null && index.ui[p.label] === words);
  if (found.length !== 1 || !found[0]) throw new Error(`${found.length} placements labelled ${words}`);
  return found[0].id;
};
const SIGN = labelled("Desk sign, busy");
const CHALKBOARD = labelled("Chalkboard");
const LAPTOP = labelled("Laptop");

function shown(node: Object3D, root: Object3D): boolean {
  for (let n: Object3D | null = node; n; n = n === root ? null : n.parent) if (!n.visible) return false;
  return true;
}

const chunkMeshes = (root: Object3D, chunk: number): Mesh[] => {
  const out: Mesh[] = [];
  root.traverse((n) => {
    const eat = n.userData.eat as { kind?: string; chunk?: number } | undefined;
    if (eat?.kind === "chunk" && eat.chunk === chunk) out.push(n as Mesh);
  });
  return out;
};

/** The 3D side over two real pieces, reduced motion as given, the clock and the polite line's calls kept. */
function rig(reduced: boolean) {
  const scene = repositoryBundle().scene;
  const models: Record<string, Group> = {};
  for (const id of [SIGN, CHALKBOARD]) models[id] = pieceModel(roomGlb(id), scene.pieces[id]?.scale ?? 1);
  const clock = { t: 1000 };
  const meal = createMeal({ regrow_s: 5, now: () => clock.t });
  const said = vi.fn();
  const mouth = new Group();
  mouth.position.set(3, 1, 0);
  mouth.updateMatrixWorld(true);
  const eat = createEat3d({
    part: scene,
    model: (id) => models[id] ?? null,
    figure: () => ({ root: mouth, height: 1.2 }),
    meal,
    highlight: { refresh: vi.fn() },
    now: () => clock.t,
    reduced: () => reduced,
    warn: vi.fn(),
    said,
  });
  return { eat, meal, clock, said, models };
}

describe("reduced motion (FR-010)", () => {
  it("hides the bitten chunk at once, no flight, and returns it whole at once, no growth", () => {
    const r = rig(true);
    expect(r.eat.bite(SIGN)).toBe(true);
    const states = r.meal.states(SIGN);
    const index = states.indexOf("eaten");
    expect(index, "eaten at once, never flying").toBeGreaterThanOrEqual(0);
    expect(states).not.toContain("flying");
    const root = r.models[SIGN] as Group;
    for (const m of chunkMeshes(root, index)) expect(shown(m, root)).toBe(false);
    // A second bite needs no frame between: nothing is in flight.
    expect(r.eat.bite(SIGN)).toBe(true);
    r.clock.t += 5000;
    r.eat.frame();
    expect(r.meal.states(SIGN)[index]).toBe("standing");
    for (const m of chunkMeshes(root, index)) {
      expect(shown(m, root)).toBe(true);
      expect(m.scale.toArray()).toEqual([1, 1, 1]);
    }
  });

  it("flies and grows with motion on", () => {
    const r = rig(false);
    r.eat.bite(SIGN);
    expect(r.meal.states(SIGN)).toContain("flying");
  });
});

describe("the polite line (FR-010)", () => {
  it("is asked once for a piece's first bite of the visit, and once for another piece's", () => {
    const r = rig(true);
    r.eat.bite(SIGN);
    r.eat.bite(SIGN);
    r.clock.t += 5000;
    r.eat.frame();
    r.eat.bite(SIGN);
    expect(r.said.mock.calls).toEqual([[SIGN]]);
    r.eat.bite(CHALKBOARD);
    expect(r.said.mock.calls).toEqual([[SIGN], [CHALKBOARD]]);
  });

  async function dinosaurVisit(): Promise<Visit> {
    const v = start({ webgl: true });
    await enter(v, "engineer", "dinosaur");
    await throughLoader(v);
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    await flush();
    return v;
  }

  it("is said by the room in its live region, eat.first_bite with the piece's label", async () => {
    const v = await dinosaurVisit();
    const eating = v.scene.created.at(-1)?.eating;
    expect(eating?.said).toBeDefined();
    // The 3D side gives the placement and its label word's key, as the part carries it.
    const key = repositoryBundle().scene.placements.find((p) => p.id === LAPTOP)?.label as string;
    const label = repositoryBundle().index.ui[key] as string;
    expect(label).toBeTruthy();
    eating?.said?.(LAPTOP, key);
    await flush();
    const region = announcer(v.doc);
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe((WORDS["eat.first_bite"] as string).replace("{name}", label));
  });
});
