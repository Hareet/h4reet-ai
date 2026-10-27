// T157 (spec 004; FR-057 to FR-062, SC-007, User Story 2 scenarios 4 to 6; contracts/tier-signal.md §9's fault
// injection): the room under each fault this story builds for, in jsdom, every run ending usable: the AI disclosure
// ("You're talking with an AI representation of the Author, not the Author.") visible, a text box that answers, the
// room open with a picture on its stage and its frames still drawn (0 end blank or frozen), and the text copy equal to
// the drawing, its switch sentence the tier whose case the stage shows by the claims rule.
// - The live source off: no request, not-live (scenario 1).
// - Each status failure of §5.2 (network, timeout, status, shape): unknown at once, in 3D and 2D.
// - A model blocked, timed out, failing its integrity check, and failing to decode, through T134's loader in the real 3D
//   stage (scene.ts, with a stand-in renderer, since jsdom has no WebGL): after one retry each piece keeps its stand-in,
//   still selectable, with its switch's state (scenario 4).
// - No WebGL 2: the 2D room, with the same pieces, states, and words (scenario 5).
// - Reduced motion switched on mid-visit, in 3D and 2D.
// - Pause and hide while an answer is in flight: paused wins, and the room comes back on resume and show.
// Later stories add their faults here: room text and typefaces (T182), the turn-cost channel's (T244).
import { Object3D } from "three";
import type { Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import { TIER_VALUES } from "../../src/room/compose/vocabulary";
import type { TierValue } from "../../src/room/compose/vocabulary";
import { MODEL_NODE } from "../../src/room/scene/loader";
import { caseFor } from "../../src/room/signals/tier";
import type { StatusResult } from "../../src/room/signals/tier";
import type { SceneModule } from "../../src/room/stage";
import { ascii } from "../helpers/glb";
import {
  AI_DISCLOSURE,
  WALL0,
  button,
  flush,
  intoRoom,
  roomIndex,
  setHidden,
  setReducedMotion,
  start,
  talkLog,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";

/** What the real scene module draws and draws with in the model runs: their 3D part and a stand-in renderer. */
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

/** The 2D stages the room draws, the latest last, so a case is read by its pose's name from the drawing's switches. */
const flats = vi.hoisted(() => [] as { drawing: { switches: ReadonlyMap<string, ReadonlyMap<string, Element>> } }[]);

vi.mock("../../src/room/flat", async (importOriginal) => {
  const flat = await importOriginal<typeof import("../../src/room/flat")>();
  return {
    ...flat,
    renderFlat(...args: Parameters<typeof flat.renderFlat>) {
      const stage = flat.renderFlat(...args);
      flats.push(stage);
      return stage;
    },
  };
});

afterEach(() => {
  swapped.part = null;
  swapped.renderer = null;
  flats.length = 0;
});

let composed: ComposeResult | null = null;
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));
const site = (index: RoomIndex): RoomIndex => ({ ...index, live: { ...index.live, source: "site" } });

// --------------------------------------------------------------------------------------------------------------------
// What every run ends with
// --------------------------------------------------------------------------------------------------------------------
/** The tier "Around the room" says the index's first switch is in: the value whose sentence its line ends with. */
function copiedTier(v: Visit, index: RoomIndex): TierValue | null {
  const sw = index.switches[0];
  const label = sw ? (index.ui[sw.label] ?? "") : "";
  const line = [...v.doc.querySelectorAll(".room-around li")]
    .map((li) => textOf(li))
    .find((l) => l.startsWith(`${label}:`));
  const sentence = line?.slice(label.length + 1).trim();
  return TIER_VALUES.find((value) => index.ui[`tier.${value}`] === sentence) ?? null;
}

/** The case the stage shows of the index's first switch: the 2D drawing's visible case, by its pose's name in the
 *  drawing's switches, the real 3D stage's visible case in the scene it last drew, or the case the claims rule gives
 *  for the tier last applied to the stand-in 3D stage. */
function drawnCase(v: Visit, index: RoomIndex, real?: Real): string | null {
  const sw = index.switches[0];
  if (!sw) return null;
  if (v.room.visit.mode === "2d") {
    const drawing = flats.at(-1)?.drawing;
    const element = v.doc.querySelector(".flat svg");
    // The drawing this visit shows, which the room put on its stage.
    if (!drawing || !element || ![...(drawing.switches.get(sw.id)?.values() ?? [])].every((g) => element.contains(g)))
      return null;
    const shown = [...(drawing.switches.get(sw.id) ?? [])]
      .filter(([, g]) => g.getAttribute("visibility") === "visible")
      .map(([pose]) => pose);
    return shown.length === 1 ? (shown[0] ?? null) : null;
  }
  if (real) {
    const scene = real.drawn();
    const shown = Object.keys(sw.cases)
      .map((value) => sw.cases[value as TierValue])
      .filter((pose, i, all) => all.indexOf(pose) === i)
      .filter((pose) => scene.getObjectByName(`${sw.id}.${pose}`)?.visible === true);
    return shown.length === 1 ? (shown[0] ?? null) : null;
  }
  const last = v.scene.applied.at(-1)?.value;
  return last === undefined ? null : caseFor(sw, last);
}

/** Every run's end: usable, the disclosure visible, the text box answering, the stage neither blank nor frozen, and
 *  the text copy equal to the drawing. */
async function expectUsable(v: Visit, index: RoomIndex, what: string, real?: Real): Promise<void> {
  // The AI disclosure, visible on every screen.
  const disclosure = v.doc.getElementById("ai-disclosure");
  expect(textOf(disclosure), what).toBe(AI_DISCLOSURE);
  expect(disclosure?.closest("[hidden], [inert], [aria-hidden='true']"), what).toBeNull();
  // The room open: the hand-off over, its controls usable.
  expect(v.room.visit.stage, what).toBe("room");
  for (const part of v.doc.querySelectorAll(".room-toolbar, .room-list, .talk"))
    expect(part.hasAttribute("inert"), what).toBe(false);
  // Not blank: the stage holds the 3D canvas or the 2D drawing, not its loading line.
  const view = v.doc.querySelector(".room-stage-view");
  expect(view?.querySelector("canvas, .flat"), what).not.toBeNull();
  expect(view?.querySelector(".room-loading"), what).toBeNull();
  // Not frozen: a 3D stage keeps drawing frames.
  if (v.room.visit.mode !== "2d") {
    const frames = real ? real.renders() : v.scene.frames;
    v.clock.advance(100);
    expect(real ? real.renders() : v.scene.frames, what).toBeGreaterThan(frames);
    expect(v.clock.pendingFrames, what).toBeGreaterThan(0);
  }
  // The text copy equals the drawing: its tier's case is the one the stage shows.
  const tier = copiedTier(v, index);
  const sw = index.switches[0];
  expect(tier, `${what}: the text copy's tier`).not.toBeNull();
  expect(tier, what).toBe(v.room.live.tier.tier);
  expect(drawnCase(v, index, real), `${what}: the drawn case`).toBe(caseFor(sw ?? { cases: {} }, tier ?? "unknown"));
  // A working text box: a typed turn answers with its fixed message, and a selectable from the list answers too.
  const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
  if (!box) throw new Error(`${what}: no text box`);
  expect(box.disabled, what).toBe(false);
  const before = talkLog(v.doc).childElementCount;
  box.value = "Is anyone there?";
  button(v.doc, "Send").click();
  await flush();
  expect(talkLog(v.doc).childElementCount, what).toBeGreaterThan(before);
  const first = index.selectables[0];
  if (!first) throw new Error("no selectable");
  v.doc.querySelector<HTMLButtonElement>(`button[data-object-id="${first.id}"]`)?.click();
  expect(v.events.at(-1), what).toEqual({ kind: "object_selected", id: first.id });
}

const answer = (v: Visit, local_tier = "up"): StatusResult => ({
  ok: true,
  started: v.clock.now() - 150,
  ended: v.clock.now(),
  endedWall: WALL0 + v.clock.now(),
  answer: { local_tier, state: "normal", cause_now: null },
});

const failure = (v: Visit, why: "network" | "timeout" | "status" | "shape", status?: number): StatusResult => ({
  ok: false,
  started: v.clock.now() - 5_000,
  ended: v.clock.now(),
  endedWall: WALL0 + v.clock.now(),
  why,
  ...(status === undefined ? {} : { status }),
});

// --------------------------------------------------------------------------------------------------------------------
// The tier's faults
// --------------------------------------------------------------------------------------------------------------------
describe("the live source off (scenario 1)", () => {
  for (const webgl of [true, false]) {
    it(`makes no request and ends usable at not-live, in ${webgl ? "3D" : "2D"}`, async () => {
      const index = roomIndex();
      const v = start({ webgl });
      await intoRoom(v);
      v.clock.advance(120_000);
      expect(v.spies.network).toEqual([]);
      expect(v.room.live.tier.tier).toBe("not-live");
      await expectUsable(v, index, `off, ${webgl ? "3D" : "2D"}`);
    });
  }
});

describe("each status failure (FR-041 row 3; scenario 2)", () => {
  for (const webgl of [true, false])
    for (const [why, status] of [
      ["network", undefined],
      ["timeout", undefined],
      ["status", 404],
      ["status", 429],
      ["status", 502],
      ["shape", undefined],
    ] as const) {
      it(`reads unknown at once after a ${why}${status ? ` ${status}` : ""} failure, and ends usable, in ${webgl ? "3D" : "2D"}`, async () => {
        const { index } = fixture();
        const v = start({ webgl, room: site(index) });
        await intoRoom(v);
        v.room.live.complete(answer(v));
        expect(drawnCase(v, index)).toBe(index.switches[0]?.cases.local);
        v.room.live.complete(failure(v, why, status));
        expect(v.room.live.tier.tier).toBe("unknown");
        await expectUsable(v, index, `${why} ${status ?? ""}`);
      });
    }

  it("reads unknown once the last answer is stale, and ends usable", async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: site(index) });
    await intoRoom(v);
    v.room.live.complete(answer(v));
    v.clock.advance(index.live.freshness_ms);
    expect(v.room.live.tier.row).toBe(4);
    await expectUsable(v, index, "stale");
  });
});

describe("no WebGL 2 (scenario 5)", () => {
  it("draws the 2D room with the same switch state and words, and ends usable", async () => {
    const { index } = fixture();
    const v = start({ webgl: false, room: site(index) });
    await intoRoom(v);
    expect(v.room.visit.mode).toBe("2d");
    expect(v.scene.loads).toBe(0);
    await expectUsable(v, index, "2D at Enter");
    v.room.live.complete(answer(v, "down"));
    await expectUsable(v, index, "2D, cloud");
  });
});

describe("reduced motion switched on mid-visit (FR-059)", () => {
  for (const webgl of [true, false]) {
    it(`keeps the room usable and its state applied, in ${webgl ? "3D" : "2D"}`, async () => {
      const { index } = fixture();
      const v = start({ webgl, room: site(index) });
      await intoRoom(v);
      setReducedMotion(v.win, true);
      expect(v.room.motion.reducedMotion).toBe(true);
      v.room.live.complete(answer(v));
      expect(v.room.live.tier.tier).toBe("local");
      await expectUsable(v, index, `reduced motion, ${webgl ? "3D" : "2D"}`);
    });
  }
});

describe("pause and hide while an answer is in flight (FR-042, FR-060; scenario 3)", () => {
  for (const webgl of [true, false])
    for (const how of ["pause", "hide"] as const) {
      it(`reads paused when the answer lands, comes back on ${how === "pause" ? "resume" : "show"}, and ends usable, in ${webgl ? "3D" : "2D"}`, async () => {
        const { index } = fixture();
        const v = start({ webgl, room: site(index) });
        await intoRoom(v);
        v.room.live.complete(answer(v));
        const set = (on: boolean): void => {
          if (how === "hide") setHidden(v.win, on);
          else if (v.room.motion.paused !== on) button(v.doc, index.ui["pause.button"] ?? "Pause the room").click();
        };
        set(true);
        v.clock.advance(2_000);
        // The answer that was in flight lands while paused or hidden: paused still wins.
        v.room.live.complete(answer(v));
        expect(v.room.live.tier.tier).toBe("paused");
        expect(drawnCase(v, index)).not.toBe(index.switches[0]?.cases.local);
        if (how === "pause") await expectUsable(v, index, `${how}d, ${webgl ? "3D" : "2D"}`);
        set(false);
        expect(v.room.live.tier.tier).toBe("local");
        await expectUsable(v, index, `after ${how}, ${webgl ? "3D" : "2D"}`);
      });
    }
});

// --------------------------------------------------------------------------------------------------------------------
// A piece's model failing to load, in the real 3D stage (scenario 4; FR-057)
// --------------------------------------------------------------------------------------------------------------------
/** The pieces whose models the runs set: a placed piece, a selectable's member, and the switch's piece. */
const SET = ["fx-desk", "fx-laptop", "fx-plug"];
let withModels: ComposeResult | null = null;
const models = (): ComposeResult =>
  (withModels ??= compose(overlay(modelChanges(SET)), capsPolicy(), { mode: "lenient", drafts: false }));

/** The real 3D stage's stand-in renderer, as a run reads it: the scene it last drew, and how many times it drew. */
interface Real {
  drawn(): Scene;
  renders(): number;
}

/** A stand-in for WebGLRenderer: what scene.ts and its ink use of it, each frame's scene kept. */
function standInRenderer(): Real & { renderer: object } {
  let last: Scene | null = null;
  let renders = 0;
  const renderer = {
    autoClear: true,
    outputColorSpace: "",
    shadowMap: { enabled: true },
    setPixelRatio: () => undefined,
    setSize: () => undefined,
    initTexture: () => undefined,
    render: (scene: Scene) => {
      last = scene;
      renders += 1;
    },
    dispose: () => undefined,
  };
  return {
    renderer,
    drawn: () => {
      if (!last) throw new Error("no frame drawn");
      return last;
    },
    renders: () => renders,
  };
}

type Fault = "blocked" | "timed out" | "failing its integrity check" | "failing to decode";

/** The page's fetch for a model under a fault: refused, never answered (aborted at the timeout), refused by the
 *  integrity check, or answered with bytes no glTF reader parses. */
function faulty(fault: Fault, urls: string[]): (url: string, init: RequestInit) => Promise<Response> {
  return (url, init) => {
    urls.push(url);
    switch (fault) {
      case "blocked":
        return Promise.reject(new TypeError("Failed to fetch"));
      case "failing its integrity check":
        return Promise.reject(new TypeError("Failed to fetch: integrity mismatch"));
      case "timed out":
        return new Promise<Response>((_, reject) =>
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        );
      case "failing to decode": {
        const body = ascii("not a glTF file at all");
        return Promise.resolve({
          status: 200,
          arrayBuffer: () => Promise.resolve(body.slice().buffer),
        } as Response);
      }
    }
  };
}

describe("a piece's model failing to load (scenario 4)", () => {
  it.each(["blocked", "timed out", "failing its integrity check", "failing to decode"] as const)(
    "keeps each stand-in after one retry when its model is %s, selectable and in its state, the room usable",
    async (fault) => {
      const result = models();
      const index = site(result.index);
      const part = result.scene;
      expect(part.load_order.length).toBe(SET.length);
      const r = standInRenderer();
      swapped.part = part;
      swapped.renderer = () => r.renderer;
      const urls: string[] = [];
      const v = start({
        webgl: true,
        maxTextureSize: 16384,
        room: index,
        loadScene: () => import("../../src/room/scene") as Promise<SceneModule>,
        fetch: faulty(fault, urls),
      });
      await intoRoom(v);
      expect(v.room.visit.mode).toBe("3d");
      // Each model fetched twice, the first try and its one retry, past each 10-second timeout.
      const wanted = (): number => new Set(urls).size;
      for (let round = 0; round < 12 && (urls.length < 2 * SET.length || wanted() < SET.length); round += 1) {
        for (let i = 0; i < 6; i += 1) {
          await flush();
          v.clock.advance(50);
        }
        v.clock.advance(fault === "timed out" ? 10_000 : 500);
      }
      for (let i = 0; i < 6; i += 1) {
        await flush();
        v.clock.advance(50);
      }
      expect(wanted()).toBe(SET.length);
      for (const url of new Set(urls))
        expect(
          urls.filter((u) => u === url),
          url,
        ).toHaveLength(2);
      // Every piece keeps its stand-in, wherever it shows: its placements, and each case of the plug's switch.
      const scene = r.drawn();
      const holders: Object3D[] = [
        ...part.placements.filter((p) => SET.includes(p.piece)).map((p) => scene.getObjectByName(p.id) as Object3D),
        ...part.switches.flatMap((s) =>
          Object.keys(s.poses).map((pose) => scene.getObjectByName(`${s.id}.${pose}`) as Object3D),
        ),
      ];
      expect(holders.length).toBeGreaterThan(SET.length);
      for (const holder of holders) {
        expect(holder, fault).toBeInstanceOf(Object3D);
        expect(
          holder.children.some((c) => c.name === MODEL_NODE),
          holder.name,
        ).toBe(false);
        expect(holder.children.find((c) => c.name === "standin")?.visible, holder.name).toBe(true);
      }
      // Its state: the switch takes each reading on its stand-ins, the plugged case only for local.
      v.room.live.complete(answer(v));
      v.clock.advance(32);
      await expectUsable(v, index, `${fault}, local`, r);
      v.room.live.complete(failure(v, "network"));
      v.clock.advance(32);
      await expectUsable(v, index, `${fault}, unknown`, r);
      // Still selectable: the member's selectable answers from the list.
      const member = index.selectables.find((s) =>
        s.members.some((m) => part.placements.find((p) => p.id === m)?.piece === "fx-laptop"),
      );
      expect(member).toBeDefined();
      v.doc.querySelector<HTMLButtonElement>(`button[data-object-id="${member?.id ?? ""}"]`)?.click();
      expect(v.events.at(-1)).toEqual({ kind: "object_selected", id: member?.id });
      expect(v.room.visit.mode).toBe("3d");
    },
  );
});
