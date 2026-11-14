// T013b (spec 026; FR-013 to FR-015, User Story 3; plan.md R-02, R-09): the `dog` selectable with `figure: dog`, on a
// fixture scene (the repository's, the selectable added in memory, never in scene.yaml: FR-016).
// - The stage's `pickable`: the dog's front rectangle counts only while the dog shows its model at home (pet-adapters'
//   `dogPickable`): none while it flees or returns, or its picture is null or shows no model.
// - Without the selectable, no pick area for the dog (spec 025's FR-018 as M5 amends it); with it, no label, frame box,
//   obstacle, or reach target for the figure: the part's placements are the same.
// - The highlight takes the figure's meshes as members' draws (`memberDraws`' figures, the highlight's `figures`).
// - The room's one selection path: `object_selected` `dog` once, the topic's action, the list's button; then
//   `Stage3D.pet?(id)`, unless the talk panel's active conversation is that piece's (`talk.active`), so the director
//   reads no conversation text, and the panel's behaviour is unchanged. A 2D stage has no `pet`.
import { Group, Mesh, MeshBasicMaterial, BoxGeometry, Object3D, Scene } from "three";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree, overlayTree } from "../../build/room/source";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { memberDraws } from "../../src/room/scene/bundle3d";
import type { Room3D } from "../../src/room/scene/bundle3d";
import { createHighlight } from "../../src/room/scene/highlight";
import { createPetAdapters, dogPickable } from "../../src/room/scene/pet-adapters";
import type { PetAvatars } from "../../src/room/scene/pet-adapters";
import type { Chase, ChasePhase } from "../../src/room/scene/chase";
import type { Stage3D } from "../../src/room/stage";
import type { TurnResult } from "../../src/room/signals/turn-cost";
import type { TurnRequest } from "../../src/talk/talk";
import { REPO, button, enter, flush, start, talkLog } from "../helpers/room";
import type { Visit } from "../helpers/room";

const SCENE_PATH = "apps/web/room/scene.yaml";
const DOG_SELECTABLE = {
  id: "dog",
  name: "Dog",
  members: ["dog-sign"],
  figure: "dog",
  action: { talk: { topic: "hobbies-and-travel", lead: "The dog first." } },
};

let composed: { with: ComposeResult; without: ComposeResult } | null = null;
function bundles(): { with: ComposeResult; without: ComposeResult } {
  if (composed) return composed;
  const base = fileTree(REPO);
  const text = new TextDecoder().decode(base.read(SCENE_PATH) ?? new Uint8Array());
  const doc = parse(text) as { selectables: unknown[] };
  doc.selectables = [...doc.selectables, DOG_SELECTABLE];
  const tree = overlayTree(base, new Map([[SCENE_PATH, new TextEncoder().encode(stringify(doc))]]));
  const policy = readRoomPolicy({ env: {}, root: REPO });
  const options = { mode: "strict" as const, drafts: false };
  composed = {
    with: compose(tree, policy, { ...options }),
    without: compose(base, policy, { ...options }),
  };
  return composed;
}

/** The index with nothing ready, as `roomIndex` gives it, with the dog selectable; or with its topic ready and the
 *  turn route on. */
function indexWithDog(ready = false): RoomIndex {
  const index = bundles().with.index;
  const topics = index.topics.map((t) => ({ ...t, ready: ready && t.id === "hobbies-and-travel" }));
  return { ...index, topics, live: { ...index.live, turn: ready ? "site" : index.live.turn } };
}

function listButton(v: Visit, id: string): HTMLButtonElement {
  const found = [...v.doc.querySelectorAll<HTMLButtonElement>(".room-list button")].find(
    (b) => b.getAttribute("data-object-id") === id,
  );
  if (!found) throw new Error(`no button in the list for ${id}`);
  return found;
}

/** Into the room, past the hand-off, with a `pet` spy on the 3D stage. */
async function inRoom(v: Visit): Promise<string[]> {
  await enter(v, "non-engineer");
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
  const pets: string[] = [];
  const stage = v.scene.stage as (Stage3D & { pet?: (id: string) => void }) | null;
  if (!stage) throw new Error("no 3D stage");
  stage.pet = (id) => pets.push(id);
  return pets;
}

describe("the dog's pickable (R-09; M5)", () => {
  function setup(o: { shows: boolean; picture: boolean; phase: ChasePhase }) {
    const dog = new Group();
    const avatars: PetAvatars = {
      wants: { twin: "twin", visitor: "woman", dog: "dog" },
      shows: (id) => (id === "dog" ? o.shows : true),
      pictureOf: (id) => (id === "dog" ? (o.picture ? dog : null) : new Group()),
      clipOf: () => null,
      twinState: () => null,
      reachRigOf: () => null,
    };
    const chase = { phase: (id: string) => (id === "dog" ? o.phase : "home"), runner: () => null } as unknown as Chase;
    return createPetAdapters({ avatars, chase: () => chase, hasDog: true });
  }

  it("is true only while the dog shows its model at home", () => {
    expect(dogPickable(setup({ shows: true, picture: true, phase: "home" }))).toBe(true);
    expect(dogPickable(setup({ shows: true, picture: true, phase: "fleeing" }))).toBe(false);
    expect(dogPickable(setup({ shows: true, picture: true, phase: "returning" }))).toBe(false);
    expect(dogPickable(setup({ shows: false, picture: true, phase: "home" }))).toBe(false);
    expect(dogPickable(setup({ shows: true, picture: false, phase: "home" }))).toBe(false);
  });

  it("is false where the scene has no figures.dog", () => {
    const avatars: PetAvatars = {
      wants: { twin: "twin", visitor: "woman", dog: "dog" },
      shows: () => true,
      pictureOf: () => new Group(),
      clipOf: () => null,
      twinState: () => null,
      reachRigOf: () => null,
    };
    expect(dogPickable(createPetAdapters({ avatars, chase: () => null, hasDog: false }))).toBe(false);
  });
});

describe("the selectable adds nothing of a placement for the figure (M5)", () => {
  it("leaves the part's placements, framed boxes, and every other selectable as they are", () => {
    const { with: w, without } = bundles();
    expect(w.scene.placements).toEqual(without.scene.placements);
    expect(w.index.selectables.slice(0, -1)).toEqual(without.index.selectables);
    expect(w.index.selectables.at(-1)).toMatchObject({ id: "dog", members: ["dog-sign"], figure: "dog" });
    expect(without.index.selectables.some((s) => s.figure !== undefined)).toBe(false);
  });
});

describe("the highlight on the figure's meshes (R-09)", () => {
  const mesh = (): Mesh => new Mesh(new BoxGeometry(), new MeshBasicMaterial());

  it("memberDraws gives the members' draws, then the figure's meshes", () => {
    const sign = new Object3D();
    const picture = new Object3D();
    picture.name = "standin";
    const signMesh = mesh();
    picture.add(signMesh);
    sign.add(picture);
    const dog = new Group();
    const body = mesh();
    const head = mesh();
    dog.add(body);
    body.add(head);
    const room = { placements: new Map([["dog-sign", sign]]) } as unknown as Room3D;
    expect(memberDraws(room, ["dog-sign"])).toEqual([signMesh]);
    expect(memberDraws(room, ["dog-sign"], [dog])).toEqual([signMesh, body, head]);
    expect(memberDraws(room, ["dog-sign"], [])).toEqual([signMesh]);
  });

  it("the highlight borders the figure's meshes with the sign's, for the dog selectable only", () => {
    const scene = new Scene();
    const sign = new Object3D();
    const picture = new Object3D();
    picture.name = "standin";
    const signMesh = mesh();
    picture.add(signMesh);
    sign.add(picture);
    scene.add(sign);
    const dog = new Group();
    const body = mesh();
    dog.add(body);
    scene.add(dog);
    const room = { scene, placements: new Map([["dog-sign", sign]]) } as unknown as Room3D;
    const highlight = createHighlight({
      room,
      style: bundles().with.scene.look.highlight,
      members: (id) => (id === "dog" || id === "other" ? ["dog-sign"] : []),
      figures: (id) => (id === "dog" ? [dog] : []),
    });
    highlight.setTarget("dog");
    expect(highlight.draws).toEqual([signMesh, body]);
    highlight.setTarget("other");
    expect(highlight.draws).toEqual([signMesh]);
  });
});

describe("the one selection path (R-02; User Story 3)", () => {
  it("says object_selected dog once, runs the topic's action, and asks the stage to pet", async () => {
    const v = start({ webgl: true, room: indexWithDog() });
    const pets = await inRoom(v);
    const before = v.events.length;
    listButton(v, "dog").click();
    expect(v.events.slice(before).filter((e) => e.kind === "object_selected")).toEqual([
      { kind: "object_selected", id: "dog" },
    ]);
    expect(pets).toEqual(["dog"]);
    // The unready topic's fixed message, as for any piece: the panel's behaviour is unchanged.
    expect(talkLog(v.doc).lastElementChild?.textContent ?? "").toMatch(/./);
    // Another piece: the stage is asked too, and the director answers only the dog.
    listButton(v, "laptop").click();
    expect(pets).toEqual(["dog", "laptop"]);
  });

  it("doesn't ask the stage to pet for the active conversation's own piece, which sends nothing either", async () => {
    const sent: { request: TurnRequest; ended: (r: TurnResult) => void }[] = [];
    const v = start({
      webgl: true,
      room: indexWithDog(true),
      sendTurn: (request, ended) => sent.push({ request, ended }),
    });
    const pets = await inRoom(v);
    listButton(v, "dog").click();
    expect(pets).toEqual(["dog"]);
    expect(sent.map((s) => s.request.feature)).toEqual(["dog"]);
    sent[0]?.ended({
      kind: "response",
      status: 200,
      body: { text: "An opening.", feature: "dog", cost_micro_usd: 0, route: "local" },
    });
    await flush();
    listButton(v, "dog").click();
    expect(pets).toEqual(["dog"]);
    expect(sent).toHaveLength(1);
    // Another piece is no longer the active one's: the stage is asked.
    listButton(v, "laptop").click();
    expect(pets).toEqual(["dog", "laptop"]);
  });
});
