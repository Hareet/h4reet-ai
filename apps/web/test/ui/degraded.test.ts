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
// - Room text failing to load (and its retry), or withheld, and a typeface that never arrives (spec 004, T182; FR-061):
//   the faces bound to room text stay plain with their text-copy entries left out, the faces drawn from UI words are
//   drawn with the fallback typeface after 2 seconds, and the text copy equals the 2D drawing face by face.
// - With the poller wired (User Story 8, T244; contracts/tier-signal.md §5, §6): each failure kind, a stale answer,
//   and pause and hide with an answer in flight, every result coming from the room's own GET /api/status, in 3D and
//   2D; each ends usable, and the page asks for nothing but the status.
// Later stories add their faults here: the turn-cost channel's (T264).
import { Object3D } from "three";
import type { Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex, RoomScene } from "../../src/room/compose/bundle";
import { TIER_VALUES } from "../../src/room/compose/vocabulary";
import { TYPEFACE_WAIT_MS } from "../../src/room/faces/fonts";
import { ROOM_TEXT_RETRY_MS, faceWords, roomTextOf } from "../../src/room/faces/words";
import type { RoomText } from "../../src/room/faces/words";
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
  parseCss,
  roomIndex,
  setHidden,
  setReducedMotion,
  start,
  stylesheets,
  talkLog,
  textOf,
} from "../helpers/room";
import type { CssRule, Visit } from "../helpers/room";
import { goodTree, overlay } from "../helpers/room-fixtures";
import { capsPolicy, modelChanges } from "../helpers/room-models";
import * as legacy from "../room/legacy-stages";

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

/** The 2D stages the room draws, the latest last, so a case is read by its pose's name from the drawing's switches,
 *  and a face's words from the drawing's faces. */
const flats = vi.hoisted(
  () =>
    [] as {
      drawing: {
        switches: ReadonlyMap<string, ReadonlyMap<string, Element>>;
        faces: ReadonlyMap<string, Element>;
      };
    }[],
);

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
// With the poller wired (User Story 8; T244)
// --------------------------------------------------------------------------------------------------------------------
type Reply = { status: number; body: string | null; after?: number } | "reject" | "hang";
const VALID_BODY = JSON.stringify({ local_tier: "up", state: "normal", cause_now: null });
const OK: Reply = { status: 200, body: VALID_BODY };

/** The page's fetch for /api/status, answering from `replies` in turn, then a valid answer at once; each URL asked is
 *  kept. The visit's clock delays a late answer. */
function statusFetch(replies: Reply[], urls: string[], clock: () => Visit["clock"] | null) {
  return (url: string): Promise<Response> => {
    urls.push(url);
    const reply = replies.shift() ?? OK;
    if (reply === "reject") return Promise.reject(new TypeError("Failed to fetch"));
    if (reply === "hang") return new Promise<Response>(() => undefined);
    const { body } = reply;
    const res = {
      status: reply.status,
      ok: reply.status === 200,
      headers: new Headers(),
      text: () => (body === null ? new Promise<string>(() => undefined) : Promise.resolve(body)),
    } as unknown as Response;
    const late = reply.after;
    const at = clock();
    if (late === undefined || !at) return Promise.resolve(res);
    return new Promise<Response>((resolve) => at.setTimeout(() => resolve(res), late));
  };
}

/** The fixture room with its live source on and the page's fetch answering the poller. */
function polledVisit(webgl: boolean, replies: Reply[]): { v: Visit; index: RoomIndex; urls: string[] } {
  const { index } = fixture();
  const urls: string[] = [];
  let visit: Visit | null = null;
  const v = start({ webgl, room: site(index), fetch: statusFetch(replies, urls, () => visit?.clock ?? null) });
  visit = v;
  return { v, index, urls };
}

/** Moves the clock in steps, letting the page's fetches settle after each. */
async function steps(v: Visit, ms: number, step = 100): Promise<void> {
  await flush();
  for (let left = ms; left > 0; left -= step) {
    v.clock.advance(Math.min(step, left));
    await flush();
  }
}

describe("with the poller wired: each failure, a stale answer, and pause and hide (User Story 8; T244)", () => {
  for (const webgl of [true, false]) {
    const mode = webgl ? "3D" : "2D";
    for (const [why, reply] of [
      ["network", "reject"],
      ["timeout", "hang"],
      ["status 404", { status: 404, body: "{}" }],
      ["status 429", { status: 429, body: '{"retry_after_s": 40}' }],
      ["status 503", { status: 503, body: "{}" }],
      ["shape", { status: 200, body: '{"local_tier": "up"}' }],
    ] as const) {
      it(`takes the plugged case away after a ${why} failure of the room's own request, and ends usable, in ${mode}`, async () => {
        const { v, index, urls } = polledVisit(webgl, [OK, reply]);
        await intoRoom(v);
        expect(v.room.live.tier.tier).toBe("local");
        expect(drawnCase(v, index)).toBe(index.switches[0]?.claims?.local);
        await steps(v, 30_000);
        expect(urls).toEqual(["/api/status", "/api/status"]);
        expect(v.room.live.tier).toEqual({ tier: "unknown", row: 3, recheckAt: null });
        expect(drawnCase(v, index)).not.toBe(index.switches[0]?.claims?.local);
        await expectUsable(v, index, `polled ${why}, ${mode}`);
        expect(new Set(v.spies.network)).toEqual(new Set(["fetch /api/status"]));
      });
    }

    it(`reads unknown once the answer is stale, its resume's request in flight, and ends usable, in ${mode}`, async () => {
      const { v, index } = polledVisit(webgl, [OK, "hang"]);
      await intoRoom(v);
      const pause = button(v.doc, index.ui["pause.button"] ?? "Pause the room");
      pause.click();
      await steps(v, 29_000, 500);
      pause.click();
      expect(v.room.live.tier.tier).toBe("local");
      v.clock.advance(1_000);
      expect(v.room.live.tier).toEqual({ tier: "unknown", row: 4, recheckAt: null });
      expect(drawnCase(v, index)).not.toBe(index.switches[0]?.claims?.local);
      await expectUsable(v, index, `polled stale, ${mode}`);
    });

    for (const how of ["pause", "hide"] as const) {
      it(`stays paused when the answer in flight lands while ${how === "pause" ? "paused" : "hidden"}, asks nothing more, and ends usable on return, in ${mode}`, async () => {
        const { v, index, urls } = polledVisit(webgl, [OK, { status: 200, body: VALID_BODY, after: 2_000 }]);
        await intoRoom(v);
        await steps(v, 26_000);
        expect(urls).toHaveLength(2);
        const set = (on: boolean): void => {
          if (how === "hide") setHidden(v.win, on);
          else if (v.room.motion.paused !== on) button(v.doc, index.ui["pause.button"] ?? "Pause the room").click();
        };
        set(true);
        await steps(v, 2_000);
        expect(v.room.live.tier.tier).toBe("paused");
        expect(drawnCase(v, index)).not.toBe(index.switches[0]?.claims?.local);
        if (how === "pause") await expectUsable(v, index, `polled, paused, ${mode}`);
        await steps(v, 5 * 60_000, 1_000);
        expect(urls).toHaveLength(2);
        set(false);
        expect(urls).toHaveLength(3);
        await steps(v, 100);
        expect(v.room.live.tier.tier).toBe("local");
        await expectUsable(v, index, `polled, after ${how}, ${mode}`);
      });
    }
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
 *  integrity check, or answered with bytes no glTF reader parses. The status poller's GET /api/status, which these
 *  runs' live source asks too (User Story 8), answers 404 as the local edge does, and isn't a model's URL. */
function faulty(fault: Fault, urls: string[]): (url: string, init: RequestInit) => Promise<Response> {
  return (url, init) => {
    if (url === "/api/status") return Promise.resolve({ status: 404, headers: new Headers() } as Response);
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

// --------------------------------------------------------------------------------------------------------------------
// Room text and typefaces (T182; FR-061)
// --------------------------------------------------------------------------------------------------------------------
describe("room text failing to load or withheld, and a typeface that never arrives (FR-061)", () => {
  let drafted: ComposeResult | null = null;
  /** The fixture set as a drafts build composes it, so its room text is published, as drafts. */
  const drafts = (): ComposeResult => (drafted ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: true }));

  /** "Around the room"'s face entries, by face: its label, then its words; null where it's left out. */
  function faceEntries(v: Visit, index: RoomIndex): Map<string, string | null> {
    const lines = [...v.doc.querySelectorAll(".room-around li")].map((li) => textOf(li));
    return new Map(
      index.faces.map((f) => [f.id, lines.find((l) => l.startsWith(`${index.ui[f.label] ?? "?"}:`)) ?? null]),
    );
  }

  /** The 2D drawing's words for a face, in its order, its tube's glow pass left out, a group of paths read as the
   *  words of the outline whose paths they are; and the families it draws its text in. */
  function drawn(v: Visit, face: string, text: RoomText | null): { words: string[]; families: string[] } {
    const group = flats.at(-1)?.drawing.faces.get(face);
    if (!group || !v.doc.querySelector(".flat svg")?.contains(group)) return { words: [], families: [] };
    const words: string[] = [];
    const families = new Set<string>();
    for (const el of group.querySelectorAll("text, g")) {
      if (el.localName === "text") {
        if (el.hasAttribute("opacity")) continue;
        words.push(el.textContent ?? "");
        families.add(el.getAttribute("font-family") ?? "");
        continue;
      }
      const paths = [...el.children].filter((c) => c.localName === "path").map((p) => p.getAttribute("d"));
      if (paths.length === 0) continue;
      const outline = [...(text?.blocks.values() ?? [])].find(
        (b) => JSON.stringify(b.outline?.paths ?? null) === JSON.stringify(paths),
      );
      words.push(outline?.lines[0] ?? "(paths of no outline)");
    }
    return { words, families: [...families] };
  }

  /** The text copy equals the 2D drawing, face by face: an entry left out is a face drawn plain. */
  function expectCopyIsDrawing(v: Visit, index: RoomIndex, text: RoomText | null, what: string): void {
    const entries = faceEntries(v, index);
    for (const face of index.faces) {
      const words = faceWords(face, { index, text });
      const label = index.ui[face.label] ?? "?";
      expect(entries.get(face.id), `${what}: ${face.id}`).toBe(words === null ? null : `${label}: ${words.join(" ")}`);
      const badge = index.ui["draft.badge"];
      expect(
        drawn(v, face.id, text).words.map((w) => (w === badge ? `[${w}]` : w)),
        `${what}: ${face.id} drawn`,
      ).toEqual(words ?? []);
    }
  }

  const textBound = (index: RoomIndex): string[] =>
    index.faces.filter((f) => f.regions.some((r) => "room_text" in r.source)).map((f) => f.id);

  for (const webgl of [true, false]) {
    const mode = webgl ? "3D" : "2D";

    it(`keeps the faces plain when room-data.json fails to load, and again on its retry, and ends usable, in ${mode}`, async () => {
      const { index } = drafts();
      const v = start({ webgl, room: index, roomData: [null] });
      await intoRoom(v);
      v.clock.advance(ROOM_TEXT_RETRY_MS);
      await flush();
      expect(v.roomDataLoads()).toBe(2);
      const entries = faceEntries(v, index);
      expect(textBound(index).length).toBeGreaterThan(0);
      for (const id of textBound(index)) expect(entries.get(id), id).toBeNull();
      await expectUsable(v, index, `room text failed, ${mode}`);
      if (!webgl) expectCopyIsDrawing(v, index, null, "failed");
    });

    it(`keeps the faces plain when the room text is withheld, a release build's drafts, and ends usable, in ${mode}`, async () => {
      const { index } = fixture();
      const v = start({ webgl, room: index, roomData: [{ room_text: { blocks: [] } }] });
      await intoRoom(v);
      const entries = faceEntries(v, index);
      for (const id of textBound(index)) expect(entries.get(id), id).toBeNull();
      expect(v.roomDataLoads()).toBe(1);
      await expectUsable(v, index, `withheld, ${mode}`);
      if (!webgl) expectCopyIsDrawing(v, index, roomTextOf({ room_text: { blocks: [] } }), "withheld");
    });
  }

  it("draws in the fallback typeface when the typeface never arrives, its text copy equal to the drawing", async () => {
    const { index, roomText } = drafts();
    const data = { room_text: roomText };
    // jsdom has no document.fonts: every typeface counts as late, and never arrives.
    const v = start({ webgl: false, room: index, roomData: [data] });
    await intoRoom(v);
    v.clock.advance(TYPEFACE_WAIT_MS);
    await flush();
    for (const face of index.faces) {
      const { families } = drawn(v, face.id, roomTextOf(data));
      const fallbacks = new Set(index.typefaces.map((t) => t.fallback));
      for (const family of families) expect(fallbacks.has(family), `${face.id}: ${family}`).toBe(true);
    }
    expectCopyIsDrawing(v, index, roomTextOf(data), "late typeface");
    await expectUsable(v, index, "late typeface");
  });
});

// --------------------------------------------------------------------------------------------------------------------
// Targeting under each degraded state (spec 008, T008; FR-001, FR-002, FR-004, SC-012; User Story 6 scenarios 1, 2, 5)
// --------------------------------------------------------------------------------------------------------------------
// Targeting and the highlight run on the device alone, so every state of the tier leaves them as they are: the live
// source off, the tier unknown after a failure, and the kill switch tripped (a valid answer whose state is degraded,
// read as the budget's tier, row 6). Only what a selection opens degrades, as it does today. With the 2D drawing refused
// (flat-failed), there is no stage to draw a highlight on, and the list still selects every piece. The spies record no
// request for targeting: none at all with the live source off, and only the status poller's with it on.
describe("targeting under each degraded state (spec 008, T008)", () => {
  /** The stand-in stage's targeting callback, as its pointer calls it. */
  const targetOf =
    (v: Visit) =>
    (input: "pointer" | "press", id: string | null): void => {
      const target = v.scene.created[0]?.target;
      if (!target) throw new Error("the room gave the stage no targeting callback");
      target(input, id);
    };
  const listButton = (v: Visit, id: string): HTMLButtonElement => {
    const b = v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`);
    if (!b) throw new Error(`no list button for ${id}`);
    return b;
  };

  /** A hover, a press, list focus, and a selection, each as on the happy path; the log's messages counted. */
  async function targetsAsAlways(v: Visit, index: RoomIndex, what: string): Promise<void> {
    const [first, second] = index.selectables;
    if (!first || !second) throw new Error("fewer than two selectables");
    const target = targetOf(v);
    target("pointer", first.id);
    expect(v.scene.targets.at(-1), what).toBe(first.id);
    target("pointer", null);
    expect(v.scene.targets.at(-1), what).toBeNull();
    listButton(v, second.id).focus();
    expect(v.scene.targets.at(-1), what).toBe(second.id);
    target("press", first.id);
    expect(v.scene.targets.at(-1), what).toBe(first.id);
    const [events, messages] = [v.events.length, talkLog(v.doc).childElementCount];
    v.scene.created[0]?.select(first.id);
    await flush();
    expect(v.events.slice(events), what).toEqual([{ kind: "object_selected", id: first.id }]);
    expect(v.scene.targets.at(-1), what).toBeNull();
    // What the selection opens answers as it does in this state: a topic's fixed message in the log.
    if (first.action.kind === "talk") expect(talkLog(v.doc).childElementCount, what).toBeGreaterThan(messages);
  }

  it("works unchanged with the live source off, and asks the network for nothing", async () => {
    const index = roomIndex();
    const v = start({ webgl: true });
    await intoRoom(v);
    await targetsAsAlways(v, index, "the live source off");
    v.clock.advance(60_000);
    expect(v.spies.network).toEqual([]);
    expect(v.spies.beacons).toEqual([]);
    expect(v.spies.storage).toEqual([]);
    await expectUsable(v, index, "targeting, the live source off");
  });

  it("works unchanged with the tier unknown after a status failure, asking only for the status", async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: site(index) });
    await intoRoom(v);
    v.room.live.complete(failure(v, "network"));
    expect(v.room.live.tier.tier).toBe("unknown");
    await targetsAsAlways(v, index, "the tier unknown");
    expect(v.spies.network.filter((r) => r !== "fetch /api/status")).toEqual([]);
    expect(v.spies.beacons).toEqual([]);
    await expectUsable(v, index, "targeting, the tier unknown");
  });

  it("works unchanged with the kill switch tripped, and the selection's topic answers with its fixed message", async () => {
    const { index } = fixture();
    const v = start({ webgl: true, room: site(index) });
    await intoRoom(v);
    v.room.live.complete({
      ok: true,
      started: v.clock.now() - 150,
      ended: v.clock.now(),
      endedWall: WALL0 + v.clock.now(),
      answer: { local_tier: "up", state: "degraded", cause_now: "kill_switch_tripped" },
    });
    expect(v.room.live.tier).toMatchObject({ tier: "budget", row: 6 });
    await targetsAsAlways(v, index, "the kill switch tripped");
    expect(v.spies.network.filter((r) => r !== "fetch /api/status")).toEqual([]);
    await expectUsable(v, index, "targeting, the kill switch tripped");
  });

  // The review of Phase 1's nit: FR-002's other states, each a valid answer of the status: the local tier off, the
  // budget spent, and the kill switch's state unknown.
  it.each([
    ["the local tier off", { local_tier: "down", state: "normal", cause_now: null }, "cloud"],
    ["the budget spent", { local_tier: "up", state: "degraded", cause_now: "meter_at_ceiling" }, "budget"],
    ["the kill switch's state unknown", { local_tier: "up", state: "unknown", cause_now: null }, "unknown"],
  ] as const)("works unchanged with %s, asking only for the status", async (what, answerBody, tier) => {
    const { index } = fixture();
    const v = start({ webgl: true, room: site(index) });
    await intoRoom(v);
    v.room.live.complete({
      ok: true,
      started: v.clock.now() - 150,
      ended: v.clock.now(),
      endedWall: WALL0 + v.clock.now(),
      answer: answerBody,
    });
    expect(v.room.live.tier.tier).toBe(tier);
    await targetsAsAlways(v, index, what);
    expect(v.spies.network.filter((r) => r !== "fetch /api/status")).toEqual([]);
    await expectUsable(v, index, `targeting, ${what}`);
  });

  it("draws no highlight when the 2D drawing refuses, and the list still selects every piece (FR-004)", async () => {
    const { index } = fixture();
    const viewBox = [0, 0, Number.NaN, 200] as unknown as RoomIndex["flat"]["view_box"];
    const broken: RoomIndex = { ...index, flat: { ...index.flat, view_box: viewBox } };
    const v = start({ webgl: false, room: broken });
    await intoRoom(v);
    expect(v.room.visit.mode).toBe("2d");
    const view = v.doc.querySelector(".room-stage-view");
    expect(view?.querySelector(".flat, canvas")).toBeNull();
    expect(textOf(view)).toBe(index.ui["flat-failed"]);
    for (const s of index.selectables) {
      listButton(v, s.id).focus();
      const from = v.events.length;
      listButton(v, s.id).click();
      expect(v.events.slice(from)[0], s.id).toEqual({ kind: "object_selected", id: s.id });
    }
    // Nothing drew a highlight: no stage took a target, and the stage's view holds only flat-failed's line.
    expect(v.scene.targets).toEqual([]);
    expect(view?.children.length).toBe(1);
    expect(v.spies.network).toEqual([]);
    expect(v.spies.storage).toEqual([]);
  });
});

// T010 (spec 005; FR-001 to FR-007; plan.md §5.4, §6.7, §6.11, PD-23): the layout's degraded paths, defined before
// any of the HUD's look. In each of FR-002's states the room block, the HUD's data attributes, and its properties are
// those of the happy path, only the conversation's answers changing; with no WebGL 2 the 2D drawing sits in the clear
// area with the backdrop across the room block and no walking control; a drawing that can't be drawn shows flat-failed's
// words (D9) there as text; the glass is opaque, with no blur, under reduced transparency, more contrast, and no
// backdrop blur, and takes the system's colours under forced colours; and the stacked layout keeps spec 004's grid at
// e324771e, the numbers test/room/legacy-stages.ts froze.
describe("the layout's degraded paths (spec 005, T010)", () => {
  /** The HUD as the room set it on the page's root: its data attributes and its CSS properties. */
  function hudOf(v: Visit): Record<string, string> {
    const root = v.doc.documentElement;
    const out: Record<string, string> = {};
    for (const name of ["hud", "list", "blur"]) out[`data-${name}`] = root.getAttribute(`data-${name}`) ?? "";
    for (const p of ["--strip-h", "--bar-h", "--column-w", "--dock-h", "--clear-x", "--clear-y", "--clear-w"])
      out[p] = root.style.getPropertyValue(p);
    out["--clear-h"] = root.style.getPropertyValue("--clear-h");
    return out;
  }

  it("lays the HUD out in each of FR-002's states exactly as on the happy path", async () => {
    const { index } = fixture();
    const happy = start({ webgl: true, room: index });
    await intoRoom(happy);
    const want = hudOf(happy);
    expect(want["data-hud"]).toBe("column");
    expect(want["--clear-w"]).not.toBe("");
    const states = [
      ["the local tier off", { local_tier: "down", state: "normal", cause_now: null }],
      ["the budget spent", { local_tier: "up", state: "degraded", cause_now: "meter_at_ceiling" }],
      ["the kill switch tripped", { local_tier: "up", state: "degraded", cause_now: "kill_switch_tripped" }],
      ["the kill switch's state unknown", { local_tier: "up", state: "unknown", cause_now: null }],
    ] as const;
    for (const [what, body] of states) {
      const v = start({ webgl: true, room: site(index) });
      await intoRoom(v);
      v.room.live.complete({
        ok: true,
        started: v.clock.now() - 150,
        ended: v.clock.now(),
        endedWall: WALL0 + v.clock.now(),
        answer: body,
      });
      expect(hudOf(v), what).toEqual(want);
    }
    // The live source off, and the tier unknown after a failure.
    const off = start({ webgl: true, room: index });
    await intoRoom(off);
    expect(hudOf(off)).toEqual(want);
    const failed = start({ webgl: true, room: site(index) });
    await intoRoom(failed);
    failed.room.live.complete(failure(failed, "network"));
    expect(failed.room.live.tier.tier).toBe("unknown");
    expect(hudOf(failed)).toEqual(want);
  });

  it("puts the 2D drawing in the clear area with no WebGL 2, the backdrop across the room block, no walking control", async () => {
    const v = start({ webgl: false });
    await intoRoom(v);
    expect(v.room.visit.mode).toBe("2d");
    const view = v.doc.querySelector<HTMLElement>(".room-stage-view");
    expect(view?.querySelector(".flat")).not.toBeNull();
    expect(view?.getAttribute("data-stage")).toBe("2d");
    expect(v.doc.querySelector<HTMLElement>("button.room-walk")?.hidden).toBe(true);
    const sheets = stylesheets().flatMap((s) => parseCss(s.text).rules);
    const stage = sheets.filter((r) => r.selector.split(",").some((p) => p.trim() === ".room-stage"));
    expect(stage.some((r) => r.declarations.get("background") === "#20252b")).toBe(true);
    // In 2D the view is placed at the clear area, the 3D canvas's view at the window; since spec 014 at the 2D
    // drawing's frame area, which holds the clear area (its FR-003; Amendment W2).
    const placed = sheets.filter((r) => r.selector.includes('.room-stage-view[data-stage="2d"]'));
    expect(placed.some((r) => r.declarations.get("left") === "var(--frame-x)")).toBe(true);
    expect(placed.some((r) => r.declarations.get("width") === "var(--frame-w)")).toBe(true);
  });

  it("shows flat-failed's new words in the clear area, as text a screen reader reads, when the drawing can't be drawn", async () => {
    const { index } = fixture();
    const viewBox = [0, 0, Number.NaN, 200] as unknown as RoomIndex["flat"]["view_box"];
    const broken: RoomIndex = { ...index, flat: { ...index.flat, view_box: viewBox } };
    const v = start({ webgl: false, room: broken });
    await intoRoom(v);
    const view = v.doc.querySelector<HTMLElement>(".room-stage-view");
    const line = view?.querySelector(".room-flat-failed");
    expect(textOf(line ?? null)).toBe(
      "This drawing of the room could not be shown. The list of things in the room still works.",
    );
    expect(line?.closest("[aria-hidden='true'], [hidden]")).toBeNull();
    expect(view?.getAttribute("data-stage")).toBe("2d");
    // And the repository's own words, D9's.
    expect(roomIndex().ui["flat-failed"]).toBe(
      "This drawing of the room could not be shown. The list of things in the room still works.",
    );
  });

  /** The rules inside each at-rule whose prelude matches, from every stylesheet. */
  function inside(prelude: RegExp): CssRule[] {
    return stylesheets().flatMap((s) =>
      parseCss(s.text)
        .atRules.filter((a) => prelude.test(a.prelude))
        .flatMap((a) => parseCss(a.body).rules),
    );
  }

  it("makes the glass opaque, with no blur, under reduced transparency, more contrast, and no backdrop blur", () => {
    for (const prelude of [
      /^@media \(prefers-reduced-transparency: reduce\)$/,
      /^@media \(prefers-contrast: more\)$/,
      /^@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)$/,
    ]) {
      const found = inside(prelude);
      expect(found.length, String(prelude)).toBeGreaterThan(0);
      expect(
        found.some((r) => r.declarations.get("--glass-alpha") === "1"),
        `${String(prelude)}: the glass's alpha`,
      ).toBe(true);
      expect(
        found.some((r) => r.declarations.get("backdrop-filter") === "none"),
        `${String(prelude)}: no blur`,
      ).toBe(true);
      expect(
        found.some((r) => r.declarations.get("-webkit-backdrop-filter") === "none"),
        `${String(prelude)}: no WebKit blur`,
      ).toBe(true);
    }
  });

  it("leaves the panels to the system's colours under forced colours", () => {
    const found = inside(/^@media \(forced-colors: active\)$/);
    const values = found.flatMap((r) => [...r.declarations.values()]);
    for (const colour of ["Canvas", "CanvasText", "ButtonFace", "ButtonText", "Highlight"])
      expect(
        values.some((v) => v.split(/\s+/).includes(colour)),
        colour,
      ).toBe(true);
    expect(found.some((r) => r.declarations.get("backdrop-filter") === "none")).toBe(true);
  });

  it("keeps spec 004's grid as the stacked layout, at the numbers of e324771e", () => {
    const S = 'html[data-hud="stacked"]';
    const base = stylesheets().flatMap((s) => parseCss(s.text).rules);
    const get = (rs: CssRule[], selector: string, property: string): string | undefined =>
      rs
        .filter((r) => r.selector.split(",").some((p) => p.trim() === selector))
        .at(-1)
        ?.declarations.get(property);
    const c = legacy.ROOM_CSS;
    expect(get(base, `${S} body.in-room`, "max-width")).toBe(`${c.bodyMaxWidthRem}rem`);
    expect(get(base, `${S} body.in-room`, "padding")).toBe(`${c.bodyPaddingRem}rem`);
    expect(get(base, `${S} .room`, "display")).toBe("grid");
    expect(get(base, `${S} .room`, "gap")).toBe(`${c.gapRem}rem`);
    expect(get(base, `${S} .room`, "grid-template-columns")).toBe("minmax(0, 1fr)");
    expect(get(base, `${S} .room`, "grid-template-areas")).toBe('"toolbar" "stage" "list" "talk" "around" "resume"');
    expect(get(base, `${S} .room-stage`, "height")).toBe(`calc(100dvh - ${c.portraitReserveRem}rem)`);
    expect(get(base, `${S} .room-stage`, "min-height")).toBe(`${c.stageMinHeightRem}rem`);
    expect(get(base, `${S} .room-stage`, "max-height")).toBe(`${c.stageMaxHeightRem}rem`);
    // Every control in the page's flow: the room block and the panels' wrapper give their children to the grid.
    expect(get(base, `${S} .room-block`, "display")).toBe("contents");
    expect(get(base, `${S} .hud-panels`, "display")).toBe("contents");
    expect(get(base, `${S} .hud-bar`, "grid-area")).toBe("toolbar");
    expect(get(base, `${S} .hud-bar`, "position")).toBe("static");
    const narrow = inside(/^@media \(orientation: portrait\) and \(max-width: 34\.99rem\)$/);
    expect(get(narrow, `${S} .room-stage`, "height")).toBe(`calc(100dvh - ${c.narrowReserveRem}rem)`);
    const narrower = inside(/^@media \(orientation: portrait\) and \(max-width: 24\.99rem\)$/);
    expect(get(narrower, `${S} .hud-bar`, "font-size")).toBe("0.875rem");
    const landscape = inside(/^@media \(orientation: landscape\) and \(min-width: 32rem\)$/);
    expect(get(landscape, `${S} .room`, "grid-template-columns")).toBe(
      `minmax(0, ${c.stageFr}fr) minmax(${c.listMinRem}rem, ${c.listFr}fr)`,
    );
    expect(get(landscape, `${S} .room`, "grid-template-areas")).toBe(
      '"toolbar toolbar" "stage list" "stage talk" "around around" "resume resume"',
    );
    expect(get(landscape, `${S} .room-stage`, "height")).toBe(`calc(100dvh - ${c.landscapeReserveRem}rem)`);
  });
});
