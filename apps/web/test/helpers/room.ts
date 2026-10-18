// Helpers for the room's screen tests (spec 002, Phase 4: T034–T039). Each test gets a page made from the real
// index.html in its own jsdom window, a fake clock it moves by hand, spies on every storage, history, network, and
// microphone API the page could reach, a stand-in for the 3D chunk (jsdom has no WebGL), and the room's content as the
// build reads it. Nothing here reaches the network: jsdom loads no subresource, and every request API is a spy.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import axe from "axe-core";
import { JSDOM, VirtualConsole } from "jsdom";

import { buildManifest, readMessages } from "../../build/manifest";
import type { RoomContent } from "../../build/manifest";
import { startRoom } from "../../src/room/app";
import type { RoomHandle } from "../../src/room/app";
import type { Clock } from "../../src/room/clock";
import type { RoomEvent } from "../../src/room/events";
import { resumeView } from "../../src/room/resume-port";
import type { RoomResume } from "../../src/resume";
import type { SceneModule, SceneOptions, Stage3D } from "../../src/room/stage";

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

function spyOnEverything(win: Window): Spies {
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
    value: (input: unknown) => {
      spies.network.push(`fetch ${String(input)}`);
      return Promise.reject(new Error("no network in the room's tests"));
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
  const matches = (query: string): boolean =>
    (options.reducedMotion === true && /prefers-reduced-motion:\s*reduce/.test(query)) ||
    (options.touch === true && /pointer:\s*coarse/.test(query));
  Object.defineProperty(win, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
  const released: string[] = [];
  win.HTMLCanvasElement.prototype.getContext = function getContext(kind: string) {
    if (options.webgl !== true || kind !== "webgl2") return null;
    return {
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
}

export function fakeScene(): FakeScene {
  const fake: FakeScene = {
    loads: 0,
    created: [],
    handoff: [],
    quality: [],
    disposed: 0,
    stage: null,
    module: {
      createScene(options) {
        fake.created.push(options);
        const canvas = options.doc.createElement("canvas");
        let frame = 0;
        const loop = (time: number): void => {
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
          dispose: () => {
            fake.disposed += 1;
            options.clock.cancelFrame(frame);
          },
        };
        fake.stage = stage;
        return stage;
      },
    },
  };
  return fake;
}

/** The room's content, as the build reads it: content/messages.yaml and the manifest. */
export function roomContent(): RoomContent {
  return { messages: readMessages(join(WEB, "content/messages.yaml")), manifest: buildManifest(REPO) };
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
}

/** Opens the page: the room starts on its window, with every spy in place first. */
/** How the stand-in 3D chunk's import ends: it loads, it fails, or it never settles (a stalled download). */
export interface SceneOptionsForTest {
  sceneFails?: boolean;
  sceneHangs?: boolean;
  /** What the resume's room-data.json gives the room's resume view; by default fixtureResume(). */
  resumeData?: RoomResume;
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
  const spies = spyOnEverything(win);
  const clock = new FakeClock();
  const events: RoomEvent[] = [];
  const scene = fakeScene();
  let loads = 0;
  const room = startRoom({
    win,
    content: roomContent(),
    // The real resume view (Phase 3), its room-data.json from the test, never from the network.
    resume: resumeView(() => {
      loads += 1;
      return Promise.resolve(options.resumeData ?? fixtureResume());
    }),
    events: (event) => events.push(event),
    clock,
    loadScene: () => {
      scene.loads += 1;
      if (options.sceneHangs) return new Promise<SceneModule>(() => undefined);
      return options.sceneFails ? Promise.reject(new Error("the chunk didn't load")) : Promise.resolve(scene.module);
    },
  });
  return { dom, win, doc: win.document, clock, events, spies, scene, room, resumeLoads: () => loads };
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
