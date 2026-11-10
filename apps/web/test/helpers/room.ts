// Helpers for the room's screen tests (spec 002, Phase 4: T034–T039). Each test gets a page made from the real
// index.html in its own jsdom window, a fake clock it moves by hand, spies on every storage, history, network, and
// microphone API the page could reach, a stand-in for the 3D chunk (jsdom has no WebGL), and the room's content and
// index as the build bundles them, composed from the repository's data (spec 004, T096). Nothing here reaches the
// network: jsdom loads no subresource, and every request API is a spy.
import type { Viewport, ViewportChange, WindowMeasures } from "../../src/room/hud/viewport";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import axe from "axe-core";
import { JSDOM, VirtualConsole } from "jsdom";

import { readMessages } from "../../build/manifest";
import type { RoomContent } from "../../build/manifest";
import { compose, formatFinding } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { readRoomPolicy } from "../../build/room/policy";
import type { RoomPolicy } from "../../build/room/policy";
import { twinReadiness } from "../../build/room/readiness";
import { fileTree, overlayTree } from "../../build/room/source";
import { startRoom } from "../../src/room/app";
import type { RoomDeps, RoomHandle } from "../../src/room/app";
import type { Clock } from "../../src/room/clock";
import type { RoomIndex } from "../../src/room/compose/bundle";
import type { RoomEvent } from "../../src/room/events";
import { asRoomNarration } from "../../src/narration/data";
import { resumeView } from "../../src/room/resume-port";
import type { RoomResume } from "../../src/resume";
import type { TierValue } from "../../src/room/compose/vocabulary";
import type { SceneModule, SceneOptions, Stage3D, WalkEnd } from "../../src/room/stage";
import type { CostState } from "../../src/room/signals/turn-cost";
import type { SendTurn } from "../../src/talk/talk";

export const WEB = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
export const REPO = resolve(WEB, "../..");
export const AI_DISCLOSURE = "You're talking with an AI representation of the Author, not the Author.";
export const HANDOFF_LINE = "The twin hands you a paper: the Author's resume.";

const INDEX = readFileSync(join(WEB, "index.html"), "utf8");

/** A clock the test moves: timers run at their time, and frame callbacks every `frameMs` while any is pending. */
export class FakeClock implements Clock {
  private t = 0;
  private seq = 0;
  private readonly timers = new Map<number, { at: number; fn: () => void }>();
  private readonly frames = new Map<number, (time: number) => void>();

  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): number {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn });
    return id;
  }
  clearTimeout(id: number): void {
    this.timers.delete(id);
  }
  requestFrame(fn: (time: number) => void): number {
    const id = ++this.seq;
    this.frames.set(id, fn);
    return id;
  }
  cancelFrame(id: number): void {
    this.frames.delete(id);
  }
  get pendingTimers(): number {
    return this.timers.size;
  }
  get pendingFrames(): number {
    return this.frames.size;
  }

  /** Moves time forward by `ms`: each timer runs at its time, and pending frames run every `frameMs`. */
  advance(ms: number, frameMs = 16): void {
    if (!Number.isFinite(ms) || ms < 0 || !Number.isFinite(frameMs) || frameMs <= 0) {
      throw new Error(`FakeClock.advance(${ms}, ${frameMs}): a step must be finite, and frames must take time`);
    }
    const end = this.t + ms;
    for (;;) {
      let timerAt = Infinity;
      for (const { at } of this.timers.values()) timerAt = Math.min(timerAt, at);
      const frameAt = this.frames.size ? this.t + frameMs : Infinity;
      const next = Math.min(timerAt, frameAt);
      if (next > end) {
        this.t = end;
        return;
      }
      this.t = next;
      if (timerAt <= frameAt) {
        const due = [...this.timers.entries()].filter(([, x]) => x.at <= this.t).sort((a, b) => a[1].at - b[1].at);
        for (const [id, x] of due) {
          if (!this.timers.has(id)) continue;
          this.timers.delete(id);
          x.fn();
        }
      } else {
        const run = [...this.frames.values()];
        this.frames.clear();
        for (const fn of run) fn(this.t);
      }
    }
  }
}

export interface Spies {
  /** Every touch of document.cookie, localStorage, sessionStorage, indexedDB, or caches. */
  storage: string[];
  /** Every call to history's methods. */
  history: string[];
  /** Every request but a beacon: fetch, XMLHttpRequest, WebSocket, EventSource, window.open. */
  network: string[];
  /** Each sendBeacon, with its URL and body. */
  beacons: { url: string; body: string }[];
  /** Calls to getUserMedia. */
  microphone: number;
}

function spyOnEverything(win: Window, answer?: (url: string, init: RequestInit) => Promise<Response>): Spies {
  const spies: Spies = { storage: [], history: [], network: [], beacons: [], microphone: 0 };
  const define = (target: object, name: string, descriptor: PropertyDescriptor): void => {
    Object.defineProperty(target, name, { configurable: true, ...descriptor });
  };
  define(win.document, "cookie", {
    get: () => (spies.storage.push("document.cookie read"), ""),
    set: () => spies.storage.push("document.cookie write"),
  });
  for (const name of ["localStorage", "sessionStorage", "indexedDB", "caches"]) {
    define(win, name, { get: () => (spies.storage.push(name), undefined) });
  }
  const history = win.history as unknown as Record<string, unknown>;
  for (const name of ["pushState", "replaceState", "back", "forward", "go"]) {
    history[name] = () => spies.history.push(name);
  }
  define(win, "fetch", {
    value: (input: unknown, init: RequestInit = {}) => {
      spies.network.push(`fetch ${String(input)}`);
      return answer ? answer(String(input), init) : Promise.reject(new Error("no network in the room's tests"));
    },
  });
  class Xhr {
    open(method: string, url: string): void {
      spies.network.push(`XMLHttpRequest ${method} ${url}`);
    }
    send(): void {}
    setRequestHeader(): void {}
  }
  class Socket {
    constructor(url: string) {
      spies.network.push(`${new.target.name} ${url}`);
    }
  }
  define(win, "XMLHttpRequest", { value: Xhr });
  define(win, "WebSocket", { value: class WebSocket extends Socket {} });
  define(win, "EventSource", { value: class EventSource extends Socket {} });
  define(win, "open", { value: (url: string) => (spies.network.push(`open ${url}`), null) });
  define(win.navigator, "sendBeacon", {
    value: (url: string, body: unknown) => (spies.beacons.push({ url, body: String(body) }), true),
  });
  define(win.navigator, "mediaDevices", {
    value: {
      getUserMedia: () => {
        spies.microphone += 1;
        return Promise.reject(new Error("no microphone in the room's tests"));
      },
    },
  });
  return spies;
}

export interface WindowOptions {
  /** prefers-reduced-motion: reduce. */
  reducedMotion?: boolean;
  /** pointer: coarse (a touch-primary device, whose frame target is 30). */
  touch?: boolean;
  /** Whether canvas.getContext("webgl2") gives a context. */
  webgl?: boolean;
  /** The context's MAX_TEXTURE_SIZE, which ADR 0010's floor reads (spec 004, R-28); without it, reading it fails. */
  maxTextureSize?: number;
}

/** Each test window's reduced-motion switch. */
const mediaOf = new WeakMap<object, (on: boolean) => void>();

/** Switches the window's prefers-reduced-motion, as a visitor's system setting does mid-visit, firing each list's
 *  change listeners (spec 004, FR-059). */
export function setReducedMotion(win: object, on: boolean): void {
  const set = mediaOf.get(win);
  if (!set) throw new Error("not a test window");
  set(on);
}

/** Hides or shows the page, as a browser does when the tab goes to the background or comes back: visibilityState,
 *  then visibilitychange. */
export function setHidden(win: TestWindow, hidden: boolean): void {
  Object.defineProperty(win.document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  win.document.dispatchEvent(new win.Event("visibilitychange"));
}

/** A window holding the real index.html, as the site serves it, with media queries and WebGL as asked. */
export function makeWindow(options: WindowOptions = {}): JSDOM {
  const console = new VirtualConsole();
  // jsdom reports what it doesn't implement (navigation, canvas): the tests stub what the room needs.
  console.on("jsdomError", (error) => {
    if (!/Not implemented/.test(error.message)) throw error;
  });
  const dom = new JSDOM(INDEX, {
    url: "http://127.0.0.1:18105/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  const win = dom.window;
  // Each query's list keeps its change listeners, so setReducedMotion can switch reduced motion mid-visit (spec 004,
  // FR-059: the room reads it throughout the visit).
  const media = { reducedMotion: options.reducedMotion === true };
  const lists: { query: string; listeners: Set<(event: { matches: boolean }) => void> }[] = [];
  const matches = (query: string): boolean =>
    (media.reducedMotion && /prefers-reduced-motion:\s*reduce/.test(query)) ||
    (options.touch === true && /pointer:\s*coarse/.test(query));
  Object.defineProperty(win, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const listeners = new Set<(event: { matches: boolean }) => void>();
      lists.push({ query, listeners });
      return {
        get matches() {
          return matches(query);
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, fn: (event: { matches: boolean }) => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: (event: { matches: boolean }) => void) => listeners.delete(fn),
        addListener: (fn: (event: { matches: boolean }) => void) => listeners.add(fn),
        removeListener: (fn: (event: { matches: boolean }) => void) => listeners.delete(fn),
        dispatchEvent: () => false,
      };
    },
  });
  mediaOf.set(win, (on) => {
    if (media.reducedMotion === on) return;
    media.reducedMotion = on;
    for (const list of lists)
      if (/prefers-reduced-motion/.test(list.query))
        for (const fn of [...list.listeners]) fn({ matches: matches(list.query) });
  });
  const released: string[] = [];
  const MAX_TEXTURE_SIZE = 0x0d33;
  const { maxTextureSize } = options;
  win.HTMLCanvasElement.prototype.getContext = function getContext(kind: string) {
    if (options.webgl !== true || kind !== "webgl2") return null;
    return {
      ...(maxTextureSize === undefined
        ? {}
        : { MAX_TEXTURE_SIZE, getParameter: (name: number) => (name === MAX_TEXTURE_SIZE ? maxTextureSize : null) }),
      getExtension: (name: string) =>
        name === "WEBGL_lose_context" ? { loseContext: () => released.push("lost") } : null,
    };
  } as unknown as HTMLCanvasElement["getContext"];
  return dom;
}

/** A stand-in for the 3D chunk: it builds a canvas, runs a frame loop on the room's clock, and records its calls. */
export interface FakeScene {
  module: SceneModule;
  /** How many times the room imported the chunk. */
  loads: number;
  created: SceneOptions[];
  handoff: number[];
  quality: number[];
  disposed: number;
  stage: Stage3D | null;
  /** Frames the stage's loop has drawn. */
  frames: number;
  /** Each tier value the room applied to the stage (spec 004, T161), with the frames drawn before it: what applies
   *  shows from the next frame on. */
  applied: { value: TierValue; frame: number; at: number }[];
  /** The cost channel's state the room gave the stage at its making, then each it gave through setCost (spec 004,
   *  T264). */
  cost: CostState[];
  /** Each target the room gave the stage through setTarget, in order (spec 008, T007): an ID, or null for none. */
  targets: (string | null)[];
  /** Each call the room made on the stage's walking view, in order (spec 008, T042), with the element `enter` took. */
  walks: ({ call: "enter"; focus: HTMLElement } | { call: "leave" })[];
  /** Ends the walking view as the stage would on its own, and reports why through the room's walkEnded. */
  endWalk(why: WalkEnd): void;
  /** With sceneLate: lets the chunk's import resolve now. */
  release?: () => void;
  /** Spec 009's Stage3D.figures and waitMs (Phase 2), which the next stage made gives the room as set here; absent,
   *  the stage gives none, and the room doesn't wait. */
  figures?: Promise<void>;
  waitMs?: number;
}

export function fakeScene(): FakeScene {
  let walking = false;
  const fake: FakeScene = {
    loads: 0,
    created: [],
    handoff: [],
    quality: [],
    disposed: 0,
    stage: null,
    frames: 0,
    applied: [],
    cost: [],
    targets: [],
    walks: [],
    endWalk(why) {
      walking = false;
      fake.created.at(-1)?.walkEnded?.(why);
    },
    module: {
      createScene(options) {
        fake.created.push(options);
        if (options.cost) fake.cost.push(options.cost);
        const canvas = options.doc.createElement("canvas");
        let frame = 0;
        const loop = (time: number): void => {
          fake.frames += 1;
          options.onFrame(time);
          frame = options.clock.requestFrame(loop);
        };
        frame = options.clock.requestFrame(loop);
        const stage: Stage3D = {
          mode: "3d",
          element: canvas,
          canvas,
          showHandoff: (progress) => fake.handoff.push(progress),
          setQuality: (level) => fake.quality.push(level),
          apply: (value) => fake.applied.push({ value, frame: fake.frames, at: options.clock.now() }),
          setCost: (state) => fake.cost.push(state),
          setTarget: (id) => fake.targets.push(id),
          walk: {
            get walking() {
              return walking;
            },
            enter(focus) {
              fake.walks.push({ call: "enter", focus });
              walking = true;
            },
            leave() {
              fake.walks.push({ call: "leave" });
              walking = false;
            },
          },
          dispose: () => {
            fake.disposed += 1;
            options.clock.cancelFrame(frame);
          },
          ...(fake.figures ? { figures: fake.figures, waitMs: fake.waitMs ?? 0 } : {}),
        };
        fake.stage = stage;
        return stage;
      },
    },
  };
  return fake;
}

const bundles = new Map<string, ComposeResult>();

/**
 * The policy the build reads under an empty policy directory, as the global setup's builds and the phone copy's test
 * are (test/global-build.ts): nothing approved and no header, and the caps as build/room/policy.ts takes them where
 * the directory holds no caps.json, main's in a checkout and the tree's own where there is no .git (spec 004, T327).
 */
export function emptyDirPolicy(): RoomPolicy {
  const dir = mkdtempSync(join(tmpdir(), "h4-web-policy-"));
  try {
    return readRoomPolicy({ env: { ROOM_POLICY_DIR: dir }, root: REPO });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The catalog's folder, from the repository's root. */
const CATALOG = "apps/web/room/catalog";

/**
 * Each catalog file that sets a model, with its `model` line dropped: the repository's room as it stood before the
 * studio's files were set (spec 004, T234), every piece a stand-in, for the tests of what a stand-in shows. An overlay
 * of repository-relative paths, as overlayTree takes it.
 */
export function withoutModels(): Map<string, Uint8Array | null> {
  const changes = new Map<string, Uint8Array | null>();
  for (const name of readdirSync(join(REPO, CATALOG))
    .filter((n) => n.endsWith(".yaml"))
    .sort()) {
    const text = readFileSync(join(REPO, CATALOG, name), "utf8");
    const dropped = text.replace(/^model: .*\n/m, "");
    if (dropped !== text) changes.set(`${CATALOG}/${name}`, new TextEncoder().encode(dropped));
  }
  return changes;
}

/**
 * The room's bundle as the site's build composes the repository's data (spec 004; build/room/plugin.ts): lenient, as
 * a release build unless `drafts`, under main's policy as make test reads it (build/room/policy.ts), or with `empty`,
 * under an empty policy directory, as the global setup's builds are (test/global-build.ts; `emptyDirPolicy`); with
 * `standins`, the room before its models were set (`withoutModels`). Each is composed once a test file, and a finding
 * that would fail the site's build fails the test that asks.
 * The twin's readiness (spec 007, FR-030, FR-037) is `readiness`'s, never the one config/twin-readiness.yaml, the
 * Author's file, happens to hold: `tree` composes with the tree's own, `twinReadiness(tree)`, exactly as the site's
 * build does (build/room/plugin.ts), for the tests that hold a built site to this compose, whose digests and `ready`
 * values then follow the file whatever it marks; `none`, the default, composes with nothing ready, as compose() takes
 * no readiness, for the tests of the room before the twin, which assert it (spec 009's intake gate, F2).
 */
export function repositoryBundle(
  options: {
    readonly drafts?: boolean;
    readonly policy?: "main" | "empty";
    readonly standins?: boolean;
    readonly readiness?: "tree" | "none";
  } = {},
): ComposeResult {
  const drafts = options.drafts ?? false;
  const source = options.policy ?? "main";
  const standins = options.standins ?? false;
  const readiness = options.readiness ?? "none";
  const key = `${source} ${drafts ? "drafts" : "release"}${standins ? " standins" : ""} ${readiness}`;
  const known = bundles.get(key);
  if (known) return known;
  const policy = source === "main" ? readRoomPolicy({ env: process.env, root: REPO }) : emptyDirPolicy();
  const tree = standins ? overlayTree(fileTree(REPO), withoutModels()) : fileTree(REPO);
  const result = compose(tree, policy, {
    mode: "lenient",
    drafts,
    ...(readiness === "tree" ? { readiness: twinReadiness(tree) } : {}),
  });
  const refused = result.findings.filter((f) => !f.lenient).map((f) => formatFinding(f, "lenient"));
  if (refused.length > 0) throw new Error(`the repository's room doesn't compose:\n${refused.join("\n")}`);
  bundles.set(key, result);
  return result;
}

/** The room's content, as the build reads it: content/messages.yaml and the manifest, compose()'s, with nothing ready
 *  (`repositoryBundle`'s `none`): the room before the twin, whatever the Author's readiness file marks. */
export function roomContent(): RoomContent {
  return {
    messages: readMessages(join(WEB, "content/messages.yaml")),
    manifest: repositoryBundle({ readiness: "none" }).manifest,
  };
}

/** The bundle's index, as the build bundles it beside the content, with nothing ready, as `roomContent`'s. */
export function roomIndex(): RoomIndex {
  return repositoryBundle({ readiness: "none" }).index;
}

/** A jsdom window, with its event constructors (Event, KeyboardEvent, PointerEvent) typed. */
export type TestWindow = Window & typeof globalThis;

export interface Visit {
  dom: JSDOM;
  win: TestWindow;
  doc: Document;
  clock: FakeClock;
  events: RoomEvent[];
  spies: Spies;
  scene: FakeScene;
  room: RoomHandle;
  /** How many times the room's resume view loaded room-data.json. */
  resumeLoads: () => number;
  /** How many times the room loaded room-data.json for its room text, at Enter and on its one retry (spec 004, T187). */
  roomDataLoads: () => number;
}

/** The wall clock's time at the fake clock's 0: 26 October 2026, 13:05, local time, so "Paused at" reads 13:05 then. */
export const WALL0 = new Date(2026, 9, 26, 13, 5, 0).getTime();

/** Opens the page: the room starts on its window, with every spy in place first. */
/** How the stand-in 3D chunk's import ends: it loads, it fails, or it never settles (a stalled download). */
export interface SceneOptionsForTest {
  sceneFails?: boolean;
  sceneHangs?: boolean;
  /**
   * What the resume's room-data.json gives the room's resume view, by default fixtureResume(); a list gives each
   * load the next, the last one again once they run out.
   */
  resumeData?: RoomResume | RoomResume[];
  /** room-data.json as the build writes it, for the resume view's narration (Phase 5); without it, no narration. */
  narration?: unknown;
  /**
   * room-data.json as the room's shared loader gives it at Enter, for the room text (spec 004, T187): a list gives each
   * load the next, the last one again once they run out, and null is a load that failed. By default `{}`, a file with
   * no room text, so every face bound to room text stays plain.
   */
  roomData?: unknown[];
  /** The 3D chunk's import settles only when the test calls scene.release(). */
  sceneLate?: boolean;
  /** The bundle's index the room starts with: by default the repository's, as the site's build bundles it. */
  room?: RoomIndex;
  /** The room's content (messages and manifest): by default roomContent(), the repository's, as the build reads it. */
  content?: RoomContent;
  /** The wall clock the room reads (spec 004): by default WALL0 plus the fake clock's time. */
  wall?: (clock: FakeClock) => number;
  /** Imports the 3D chunk in place of the stand-in: the real scene module, with a stand-in renderer (spec 004, T157). */
  loadScene?: () => Promise<SceneModule>;
  /** Answers the page's fetches, after the spy records each: by default every fetch is refused. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** The twin's sender, which the twin's spec gives the room (spec 004, T205): each turn the talk panel would send, by
   *  default to nowhere, since no sender exists until then; its second argument reports the turn's end (T264). */
  sendTurn?: SendTurn;
  /** The drafts build's frame log (spec 004, T246): the factory main.ts gives a drafts build, which the room makes its
   *  log with and puts h4FrameLog() on the window; absent, as in a release build, the room keeps no log. */
  frameLog?: RoomDeps["frameLog"];
  /** Spec 005: the window's measures and their changes (hud/viewport.ts), which a test stubs; by default the page's. */
  viewport?: RoomDeps["viewport"];
}

/** An approved resume of fixture words, under the first two item IDs the manifest lists. */
export function fixtureResume(): RoomResume {
  const ids = roomContent().manifest.items.slice(0, 2);
  return {
    resume_state: "approved",
    header: { name: "Fixture", lines: ["A fixture line for the room's tests."] },
    sections: [
      { id: "fixture", title: "Fixture section", items: ids.map((id) => ({ id, text: `Fixture item ${id}.` })) },
    ],
  };
}

export function start(options: WindowOptions & SceneOptionsForTest = {}): Visit {
  const dom = makeWindow(options);
  const win = dom.window as unknown as TestWindow;
  const spies = spyOnEverything(win, options.fetch);
  const clock = new FakeClock();
  const wall = (): number => (options.wall ? options.wall(clock) : WALL0 + clock.now());
  const events: RoomEvent[] = [];
  const scene = fakeScene();
  let loads = 0;
  let roomDataLoads = 0;
  const room = startRoom({
    win,
    content: options.content ?? roomContent(),
    room: options.room ?? roomIndex(),
    // The real resume view (Phase 3), its room-data.json from the test, never from the network.
    resume: resumeView(
      () => {
        loads += 1;
        const data = options.resumeData ?? fixtureResume();
        const list = Array.isArray(data) ? data : [data];
        return Promise.resolve(list[Math.min(loads, list.length) - 1] ?? fixtureResume());
      },
      options.narration === undefined ? undefined : { load: async () => asRoomNarration(options.narration), clock },
    ),
    events: (event) => events.push(event),
    // The room text's load at Enter, from the test, never from the network.
    roomData: () => {
      roomDataLoads += 1;
      const list = options.roomData ?? [{}];
      return Promise.resolve(list[Math.min(roomDataLoads, list.length) - 1] ?? null);
    },
    clock,
    wall,
    ...(options.sendTurn ? { sendTurn: options.sendTurn } : {}),
    ...(options.frameLog ? { frameLog: options.frameLog } : {}),
    ...(options.viewport ? { viewport: options.viewport } : {}),
    loadScene: () => {
      scene.loads += 1;
      if (options.loadScene) return options.loadScene();
      if (options.sceneHangs) return new Promise<SceneModule>(() => undefined);
      if (options.sceneLate) {
        return new Promise<SceneModule>((resolve) => {
          scene.release = () => resolve(scene.module);
        });
      }
      return options.sceneFails ? Promise.reject(new Error("the chunk didn't load")) : Promise.resolve(scene.module);
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
    resumeLoads: () => loads,
    roomDataLoads: () => roomDataLoads,
  };
}

/** A stand-in for hud/viewport.ts (spec 005): measures a test sets, and the change it reports to the room, "refit" or
 *  "keyboard". Its factory goes to start()'s `viewport`. */
export function stubViewport(initial: Partial<WindowMeasures> = {}) {
  let m: WindowMeasures = {
    w: 1280,
    h: 720,
    dpr: 1,
    rem: 16,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    keyboard: 0,
    strip: 0,
    ...initial,
  };
  const listeners = new Set<(what: ViewportChange) => void>();
  const viewport: Viewport = {
    read: () => m,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => listeners.clear(),
  };
  return {
    factory: (): Viewport => viewport,
    set(next: Partial<WindowMeasures>, what: ViewportChange = "refit"): void {
      m = { ...m, ...next };
      for (const fn of [...listeners]) fn(what);
    },
    get measures(): WindowMeasures {
      return m;
    },
  };
}

/** Spec 005: The page's Fullscreen API, a stand-in: whether the browser offers it, whether it refuses, and what was asked. */
export function stubFullscreen(v: Visit, o: { supported?: boolean; refuse?: boolean } = {}) {
  const doc = v.doc as Document & Record<string, unknown>;
  const root = doc.documentElement as HTMLElement & Record<string, unknown>;
  let element: Element | null = null;
  const asked: unknown[] = [];
  const fire = (name: string): void => {
    doc.dispatchEvent(new v.win.Event(name));
  };
  Object.defineProperty(doc, "fullscreenEnabled", { configurable: true, value: o.supported ?? true });
  Object.defineProperty(doc, "fullscreenElement", { configurable: true, get: () => element });
  root.requestFullscreen = (options?: unknown) => {
    asked.push(options);
    // A refusal as browsers make it: the error event, then the rejection (the review of 60b51de4's nit).
    if (o.refuse) {
      fire("fullscreenerror");
      return Promise.reject(new TypeError("refused"));
    }
    element = root;
    fire("fullscreenchange");
    return Promise.resolve();
  };
  doc.exitFullscreen = () => {
    asked.push("exit");
    element = null;
    fire("fullscreenchange");
    return Promise.resolve();
  };
  return {
    asked,
    /** The browser's own exit: Escape, a system gesture, or a tab switch. */
    exit(): void {
      element = null;
      fire("fullscreenchange");
    },
    enterByBrowser(): void {
      element = root;
      fire("fullscreenchange");
    },
  };
}

/** Lets promises the page started settle (the 3D chunk's import, the stage after Enter). */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
}

const collapse = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** An element's accessible name, as far as these screens need: aria-label, a label's text, or its own text. */
export function nameOf(el: Element): string {
  const label = el.getAttribute("aria-label");
  if (label) return collapse(label);
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    return collapse(
      labelledBy
        .split(/\s+/)
        .map((id) => el.ownerDocument.getElementById(id)?.textContent)
        .join(" "),
    );
  }
  if (el.id) {
    const forLabel = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
    if (forLabel) return collapse(forLabel.textContent);
  }
  const wrapping = el.closest("label");
  if (wrapping && wrapping !== el) return collapse(wrapping.textContent);
  return collapse(el.textContent);
}

export function textOf(el: Element | null): string {
  return collapse(el?.textContent);
}

/** The button with this accessible name, among those a visitor can reach (not hidden, not inert). */
export function button(doc: Document, name: string): HTMLButtonElement {
  const found = [...doc.querySelectorAll("button")].filter((b) => nameOf(b) === name);
  if (found.length === 0) throw new Error(`no button named "${name}"`);
  const reachable = found.filter((b) => !b.closest("[hidden]"));
  return (reachable[0] ?? found[0]) as HTMLButtonElement;
}

export function hasButton(doc: Document, name: string): boolean {
  return [...doc.querySelectorAll("button")].some((b) => nameOf(b) === name && !b.closest("[hidden]"));
}

export function radio(doc: Document, group: string, value: string): HTMLInputElement {
  const input = doc.querySelector<HTMLInputElement>(`input[type="radio"][name="${group}"][value="${value}"]`);
  if (!input) throw new Error(`no ${group} radio "${value}"`);
  return input;
}

/** Chooses a path and an avatar on the choice screen, then "Enter", and waits for the stage. */
export async function enter(v: Visit, path = "engineer", avatar = "dog"): Promise<void> {
  await flush();
  radio(v.doc, "path", path).click();
  radio(v.doc, "avatar", avatar).click();
  button(v.doc, "Enter").click();
  await v.room.settled();
  await flush();
}

/** A whole arrival: the choice, the hand-off to its end, then "Keep it for later". */
export async function intoRoom(v: Visit): Promise<void> {
  await enter(v);
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
}

/** The polite status region the room announces in (the hand-off line). */
export function announcer(doc: Document): HTMLElement {
  const el = doc.querySelector<HTMLElement>('[role="status"]');
  if (!el) throw new Error("no status region");
  return el;
}

/** The conversation's log, where the twin's words and the fixed messages appear. */
export function talkLog(doc: Document): HTMLElement {
  const el = doc.querySelector<HTMLElement>('[role="log"]');
  if (!el) throw new Error("no log region");
  return el;
}

/** The focusable elements in Tab order: document order, skipping the disabled, the hidden, the inert, and tabindex -1. */
export function tabOrder(doc: Document): HTMLElement[] {
  const all = [...doc.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")];
  return all.filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    const index = el.getAttribute("tabindex");
    if (index !== null && Number(index) < 0) return false;
    if (el.closest("[hidden], [inert], [aria-hidden='true']")) return false;
    if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "hidden") return false;
    return true;
  });
}

export async function axeViolations(v: Visit): Promise<string[]> {
  const win = v.dom.window as unknown as Window & { eval(code: string): unknown; axe?: typeof axe };
  if (!win.axe) win.eval(axe.source);
  const result = await (win.axe as typeof axe).run(win.document, { resultTypes: ["violations"] });
  return result.violations.map((x) => `${x.id}: ${x.help} (${x.nodes.map((n) => n.target.join(" ")).join(", ")})`);
}

/** The room's stylesheets: Phase 1's and every one the room's modules import. */
export function stylesheets(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) out.push({ path: full, text: readFileSync(full, "utf8") });
    }
  };
  walk(join(WEB, "src"));
  return out;
}

export interface CssRule {
  selector: string;
  declarations: Map<string, string>;
}

/** The top-level rules of a stylesheet (at-rules apart), and each at-rule's prelude with its body's text. */
export function parseCss(text: string): { rules: CssRule[]; atRules: { prelude: string; body: string }[] } {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  const atRules: { prelude: string; body: string }[] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const prelude = src.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth += 1;
      else if (src[j] === "}") depth -= 1;
      j += 1;
    }
    const body = src.slice(open + 1, j - 1);
    if (prelude.startsWith("@")) {
      atRules.push({ prelude, body });
    } else {
      const declarations = new Map<string, string>();
      for (const part of body.split(";")) {
        const colon = part.indexOf(":");
        if (colon > 0) declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
      }
      rules.push({ selector: prelude, declarations });
    }
    i = j;
  }
  return { rules, atRules };
}

/** A CSS length in pixels, for px and rem (16 px); NaN for anything else. */
export function px(value: string | undefined): number {
  const m = /^(-?[\d.]+)(px|rem)$/.exec((value ?? "").trim());
  if (!m) return NaN;
  return Number(m[1]) * (m[2] === "rem" ? 16 : 1);
}

/** Whether an element matches any selector of a rule's list (a selector jsdom can't parse matches nothing). */
export function matchesRule(el: Element, selector: string): boolean {
  return selector.split(",").some((part) => {
    try {
      return el.matches(part.trim());
    } catch {
      return false;
    }
  });
}
