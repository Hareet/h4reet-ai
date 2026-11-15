// T-B02 (spec 028; FR-028; Q17; plan.md R-B8): spec 026's petting is dormant in the room. Its modules and tests stay,
// and it never starts, since its start needs the room's dog shown at home (spec 026's FR-001), which no visit has any
// more (FR-017, FR-018).
// - The stage, on the repository's room with a stand-in renderer (as chase-stage.test.ts stages it): for each chosen
//   avatar, once the hand-off has ended and frames have run, the stage has made no pet director and no run's shell,
//   has said no `pet-note` and logged no `twin-pet`, and a selection of `dog` passed to it starts nothing.
// - The room, on the repository's room with a fixture `dog` selectable added in memory (as dog-selectable.test.ts adds
//   it, never in scene.yaml): selecting it says `object_selected` once and opens its topic's conversation as for any
//   piece; the laptop's opens the same way.
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

import { compose } from "../../build/room/compose";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree, overlayTree } from "../../build/room/source";
import { AVATARS } from "../../src/choice/avatars";
import type { AvatarId } from "../../src/choice/avatars";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { createScene } from "../../src/room/scene";
import type { FigureSignal } from "../../src/room/stage";
import { FakeClock, REPO, button, enter, flush, repositoryBundle, start, talkLog } from "../helpers/room";
import type { TestWindow, Visit } from "../helpers/room";
import { placementLabelled, selectableNamed, topicPhrased } from "../helpers/room-ids";

const made = vi.hoisted(() => ({
  renderer: null as ((parameters: unknown) => unknown) | null,
  pets: 0,
  shells: 0,
}));

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  function WebGLRenderer(parameters?: unknown): unknown {
    return made.renderer ? made.renderer(parameters) : new three.WebGLRenderer(parameters as never);
  }
  return { ...three, WebGLRenderer };
});

// The real pet director and run's shell, counted as the stage makes them.
vi.mock("../../src/room/scene/pet", async (importOriginal) => {
  const own = await importOriginal<typeof import("../../src/room/scene/pet")>();
  return {
    ...own,
    createPet: (options: Parameters<typeof own.createPet>[0]) => {
      made.pets += 1;
      return own.createPet(options);
    },
  };
});
vi.mock("../../src/room/scene/chase-figures", async (importOriginal) => {
  const own = await importOriginal<typeof import("../../src/room/scene/chase-figures")>();
  return {
    ...own,
    createChaseFigures: (options: Parameters<typeof own.createChaseFigures>[0]) => {
      made.shells += 1;
      return own.createChaseFigures(options);
    },
  };
});

afterEach(() => {
  made.renderer = null;
  made.pets = 0;
  made.shells = 0;
});

function staged(avatar: AvatarId) {
  const { index } = repositoryBundle();
  made.renderer = () => ({
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: () => undefined,
    dispose: () => undefined,
  });
  const win = new JSDOM(`<main><div id="view" tabindex="0"></div></main>`, {
    url: "http://127.0.0.1:18105/",
    pretendToBeVisual: true,
  }).window as unknown as TestWindow;
  win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  // Every file's fetch stays pending; the loader's first fetch says the avatars' controller exists.
  let fetches = 0;
  Object.defineProperty(win, "fetch", {
    configurable: true,
    value: () => {
      fetches += 1;
      return new Promise<Response>(() => undefined);
    },
  });
  const clock = new FakeClock();
  const signals: FigureSignal[] = [];
  const stage = createScene({
    win,
    doc: win.document,
    clock,
    room: index,
    avatar,
    reducedMotion: false,
    select: () => undefined,
    onFrame: () => undefined,
    floor: true,
    onFigure: (s) => signals.push(s),
    handoff: Promise.resolve(),
  });
  Object.defineProperty(stage.canvas, "clientWidth", { configurable: true, get: () => 960 });
  Object.defineProperty(stage.canvas, "clientHeight", { configurable: true, get: () => 600 });
  const frames = async (n: number): Promise<void> => {
    for (let k = 0; k < n; k += 1) {
      clock.advance(16);
      await flush();
    }
  };
  const ready = async (): Promise<void> => {
    await vi.waitFor(
      async () => {
        await frames(1);
        if (fetches === 0) throw new Error("no controller yet");
      },
      { timeout: 30_000, interval: 20 },
    );
    await frames(5);
  };
  return { stage, signals, frames, ready };
}

const petSignals = (signals: readonly FigureSignal[]): FigureSignal[] =>
  signals.filter((s) => s.kind === "pet-note" || s.kind === "twin-pet" || s.kind === "chase");

describe("the stage starts no petting in any visit (FR-028; Q17)", () => {
  it.each(AVATARS.map((a) => a.id))(
    "the %s chosen: no pet director, no shell, no petting's line or record, and a dog selection starts nothing",
    async (avatar) => {
      expect(repositoryBundle().scene.figures.dog).toBeDefined();
      const r = staged(avatar);
      await r.ready();
      await r.frames(60);
      const stage = r.stage as typeof r.stage & { pet?: (id: string) => void };
      stage.pet?.("dog");
      await r.frames(60);
      expect(made.pets).toBe(0);
      expect(made.shells).toBe(0);
      expect(petSignals(r.signals)).toEqual([]);
      r.stage.dispose();
    },
    60_000,
  );
});

// The fixture `dog` selectable, as dog-selectable.test.ts adds it (spec 026's FR-016: never in scene.yaml).
const SCENE_PATH = "apps/web/room/scene.yaml";
const SIGN = placementLabelled("Desk sign, dog");
const HOBBIES = topicPhrased("hobbies and travel adventures");
const LAPTOP = selectableNamed("Laptop and screen");
const DOG_SELECTABLE = {
  id: "dog",
  name: "Dog",
  members: [SIGN],
  figure: "dog",
  action: { talk: { topic: HOBBIES, lead: "The dog first." } },
};

let withDog: RoomIndex | null = null;
function indexWithDog(): RoomIndex {
  if (withDog) return withDog;
  const base = fileTree(REPO);
  const doc = parse(new TextDecoder().decode(base.read(SCENE_PATH) ?? new Uint8Array())) as { selectables: unknown[] };
  doc.selectables = [...doc.selectables, DOG_SELECTABLE];
  const tree = overlayTree(base, new Map([[SCENE_PATH, new TextEncoder().encode(stringify(doc))]]));
  const index = compose(tree, readRoomPolicy({ env: {}, root: REPO }), { mode: "strict", drafts: false }).index;
  withDog = { ...index, topics: index.topics.map((t) => ({ ...t, ready: false })) };
  return withDog;
}

function listButton(v: Visit, id: string): HTMLButtonElement {
  const found = [...v.doc.querySelectorAll<HTMLButtonElement>(".room-list button")].find(
    (b) => b.getAttribute("data-object-id") === id,
  );
  if (!found) throw new Error(`no button in the list for ${id}`);
  return found;
}

describe("the dog selectable opens its conversation as any piece (FR-028; Q17)", () => {
  it.each(["woman", "man", "dog", "dinosaur"] as const)(
    "the %s chosen: object_selected dog once, and its topic's message in the log, as for the laptop",
    async (avatar) => {
      const v = start({ webgl: true, room: indexWithDog() });
      await enter(v, "non-engineer", avatar);
      v.clock.advance(5000);
      button(v.doc, "Keep it for later").click();
      await flush();
      const before = v.events.length;
      const logBefore = talkLog(v.doc).children.length;
      listButton(v, "dog").click();
      expect(v.events.slice(before).filter((e) => e.kind === "object_selected")).toEqual([
        { kind: "object_selected", id: "dog" },
      ]);
      expect(talkLog(v.doc).children.length).toBeGreaterThan(logBefore);
      expect(talkLog(v.doc).lastElementChild?.textContent ?? "").toMatch(/./);
      const laptopBefore = talkLog(v.doc).children.length;
      listButton(v, LAPTOP).click();
      expect(talkLog(v.doc).children.length).toBeGreaterThan(laptopBefore);
    },
  );
});
