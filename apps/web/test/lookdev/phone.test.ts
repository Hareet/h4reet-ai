// T125 (spec 004; FR-066, FR-069, Q1's option A; research.md R-42, R-43; contracts/lookdev.md §7.1, §7.2, §8 layer 5):
// the lookdev page's phone copy. `npm run build:lookdev-phone -w apps/web` is Vite's build with vite.phone.config.ts,
// which refuses without ROOM_DRAFTS=1 and writes apps/web/dist-phone/lookdev.html, outside dist/: one <style> and one
// classic inline <script>, with no type="module", no src, and no "</script" inside it, under §7.1's meta policy, first
// in the head after the charset, each hash that of the element it admits; the typefaces as data: fonts; no attribute
// naming a URL on any host; and nothing else in the folder. Two builds are byte-identical. Opened in jsdom from a file:
// URL, the copy makes no request, and its probe stops at option B's words, since jsdom has no WebGL 2. The probe and
// its panel (src/lookdev/phone.ts) run on injected fakes with a stand-in for the page's entry (src/lookdev/main.ts,
// T135's), so they are tested on their own, as are build/single-file.ts's escaping, policy, and plugin.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, inflateSync } from "node:zlib";

import axe from "axe-core";
import { JSDOM, VirtualConsole, requestInterceptor } from "jsdom";
import type { DOMWindow } from "jsdom";
import { build, resolveConfig } from "vite";
import type { Plugin, Rolldown } from "vite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PHONE_FILE,
  PHONE_REFUSAL,
  cspHash,
  phonePolicy,
  scriptText,
  singleFile,
  singleFileHtml,
  styleText,
} from "../../build/single-file";
import type { PhonePage } from "../../build/single-file";
import { startLookdev } from "../../src/lookdev/main";
import {
  CANNOT_RUN,
  CAN_RUN,
  FLOOR_ABOVE,
  FLOOR_BELOW,
  OPTION_B,
  PAGE_FAILED,
  PHONE_ROOT,
  PROBE_PNG,
  canRun,
  probe,
  startPhone,
} from "../../src/lookdev/phone";
import type { Probe } from "../../src/lookdev/results";
import { stageFor } from "../../src/room/compose/stages";
import { DECODE } from "../../src/room/scene/gltf-images";
import { spyOnGlobals } from "../helpers/globals";
import type { GlobalSpies } from "../helpers/globals";

// The page itself is T135's: the copy's entry only hands it the probe, so a stand-in records what it was given.
vi.mock("../../src/lookdev/main", () => ({ startLookdev: vi.fn() }));

const WEB = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const REPO = resolve(WEB, "../..");
const CONFIG = join(WEB, "vite.phone.config.ts");

// --------------------------------------------------------------------------------------------------------------------
// The probe, on a fake phone
// --------------------------------------------------------------------------------------------------------------------

/** WebGL's MAX_TEXTURE_SIZE. */
const MAX_TEXTURE_SIZE = 0x0d33;

/** What a fake phone's browser gives the probe. */
interface Device {
  /** The WebGL 2 context's largest texture side, or null where the browser makes no context. */
  readonly webgl2: number | null;
  /** `navigator.deviceMemory`; absent where the browser doesn't give it. */
  readonly deviceMemory?: number | undefined;
  /** How createImageBitmap answers: it decodes the PNG at its size, is missing, rejects, or gives another size. */
  readonly decode: "decodes" | "missing" | "rejects" | "another size";
  readonly secure: boolean;
  readonly viewport: readonly [number, number];
  readonly dpr: number;
}

/** ADR 0010's reference phone as stages.ts estimates it, above the floor, opening the copy from its files. */
const PHONE: Device = {
  webgl2: 4096,
  deviceMemory: 8,
  decode: "decodes",
  secure: false,
  viewport: [384, 740],
  dpr: 2.8125,
};

interface FakePhone {
  readonly win: Window;
  readonly root: HTMLElement;
  /** Each call the probe made into the device, in order. */
  readonly calls: string[];
  /** What createImageBitmap was given. */
  readonly decoded: { readonly blob: Blob; readonly options: ImageBitmapOptions }[];
}

/** A jsdom window with the copy's root, answering the probe as `d` says, and recording each call. */
function fakePhone(d: Device): FakePhone {
  const win = new JSDOM(`<!doctype html><main id="${PHONE_ROOT}"></main>`).window;
  const calls: string[] = [];
  const decoded: { blob: Blob; options: ImageBitmapOptions }[] = [];
  win.HTMLCanvasElement.prototype.getContext = ((kind: string, attributes: unknown) => {
    calls.push(`getContext ${kind} ${JSON.stringify(attributes)}`);
    if (d.webgl2 === null) return null;
    return {
      MAX_TEXTURE_SIZE,
      getParameter: (name: number) => {
        calls.push(`getParameter ${name}`);
        return name === MAX_TEXTURE_SIZE ? d.webgl2 : null;
      },
      getExtension: (name: string) => {
        calls.push(`getExtension ${name}`);
        return { loseContext: () => calls.push("loseContext") };
      },
    };
  }) as unknown as HTMLCanvasElement["getContext"];
  const set = (target: object, key: string, value: unknown): void => {
    Object.defineProperty(target, key, { configurable: true, value });
  };
  if (d.deviceMemory !== undefined) set(win.navigator, "deviceMemory", d.deviceMemory);
  set(win, "isSecureContext", d.secure);
  set(win, "innerWidth", d.viewport[0]);
  set(win, "innerHeight", d.viewport[1]);
  set(win, "devicePixelRatio", d.dpr);
  if (d.decode !== "missing") {
    set(win, "createImageBitmap", (blob: Blob, options: ImageBitmapOptions) => {
      calls.push("createImageBitmap");
      decoded.push({ blob, options });
      if (d.decode === "rejects") return Promise.reject(new Error("The source image could not be decoded."));
      const side = d.decode === "another size" ? 2 : 1;
      return Promise.resolve({ width: side, height: side, close: () => calls.push("close") });
    });
  }
  const root = win.document.getElementById(PHONE_ROOT);
  if (!root) throw new Error("no root");
  return { win: win as unknown as Window, root: root as unknown as HTMLElement, calls, decoded };
}

/** The probe a fake phone should give. */
const expected = (d: Device, over: Partial<Probe> = {}): Probe => ({
  webgl2: d.webgl2 !== null,
  max_texture_size: d.webgl2 ?? 0,
  device_memory: d.deviceMemory ?? null,
  create_image_bitmap: d.decode === "decodes",
  secure_context: d.secure,
  viewport: [d.viewport[0], d.viewport[1]],
  dpr: d.dpr,
  ...over,
});

/** A PNG's chunks, each with its CRC checked. */
function pngChunks(data: Uint8Array): { type: string; body: Buffer }[] {
  const buf = Buffer.from(data);
  expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks: { type: string; body: Buffer }[] = [];
  for (let at = 8; at < buf.length;) {
    const length = buf.readUInt32BE(at);
    const type = buf.subarray(at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + length);
    expect(buf.readUInt32BE(at + 8 + length), `${type.toString("latin1")}'s CRC`).toBe(
      crc32(Buffer.concat([type, body])) >>> 0,
    );
    chunks.push({ type: type.toString("latin1"), body });
    at += 12 + length;
  }
  return chunks;
}

/** The text of an element, whitespace collapsed. */
const text = (e: Element): string => (e.textContent ?? "").replace(/\s+/g, " ").trim();

/** The panel's rows, label to value. */
function rows(panel: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dt of panel.querySelectorAll("dt")) {
    const dd = dt.nextElementSibling;
    if (dd?.tagName !== "DD") throw new Error(`${text(dt)} has no value`);
    out[text(dt)] = text(dd);
  }
  return out;
}

describe("the probe (contracts/lookdev.md §7.2)", () => {
  let globals: GlobalSpies;

  beforeEach(() => {
    globals = spyOnGlobals();
    vi.mocked(startLookdev).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads WebGL 2 from a context made as the room makes it, released after its largest texture is read", async () => {
    const phone = fakePhone(PHONE);
    expect(await probe(phone.win)).toEqual(expected(PHONE));
    expect(phone.calls).toEqual([
      'getContext webgl2 {"failIfMajorPerformanceCaveat":true}',
      `getParameter ${MAX_TEXTURE_SIZE}`,
      "getExtension WEBGL_lose_context",
      "loseContext",
      "createImageBitmap",
      "close",
    ]);
  });

  it("decodes a 1 × 1 PNG built in memory, from a Blob, as the GLB images decode, making no URL or request", async () => {
    const phone = fakePhone(PHONE);
    await probe(phone.win);
    expect(phone.decoded).toHaveLength(1);
    const [{ blob, options }] = phone.decoded as [{ blob: Blob; options: ImageBitmapOptions }];
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PROBE_PNG);
    expect(options).toEqual(DECODE);
    // The PNG itself: a signature, then IHDR (1 × 1, 8-bit RGBA), IDAT inflating to one unfiltered pixel, and IEND.
    const chunks = pngChunks(PROBE_PNG);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    const [ihdr, idat, iend] = chunks;
    if (!ihdr || !idat || !iend) throw new Error("not three chunks");
    expect([ihdr.body.readUInt32BE(0), ihdr.body.readUInt32BE(4), ...ihdr.body.subarray(8)]).toEqual([
      1, 1, 8, 6, 0, 0, 0,
    ]);
    const pixel = inflateSync(idat.body);
    expect(pixel).toHaveLength(5);
    expect(pixel[0]).toBe(0);
    expect(iend.body).toHaveLength(0);
    expect(globals.network).toEqual([]);
    expect(globals.storage).toEqual([]);
  });

  it("gives no device memory where the browser doesn't, and records a secure context without needing one", async () => {
    const d: Device = { ...PHONE, deviceMemory: undefined, secure: true };
    expect(await probe(fakePhone(d).win)).toEqual(expected(d));
    expect(expected(d).device_memory).toBeNull();
  });

  it("reads no WebGL 2 where the browser makes no context, and no createImageBitmap where it can't decode the PNG", async () => {
    for (const d of [
      { ...PHONE, webgl2: null },
      { ...PHONE, decode: "missing" },
      { ...PHONE, decode: "rejects" },
      { ...PHONE, decode: "another size" },
    ] as const) {
      const phone = fakePhone(d);
      expect(await probe(phone.win), JSON.stringify(d)).toEqual(expected(d));
      // A bitmap made is closed, whatever its size.
      if (d.decode === "another size") expect(phone.calls).toContain("close");
    }
  });

  it("runs the copy only with both WebGL 2 and createImageBitmap", () => {
    const p = expected(PHONE);
    expect(canRun(p)).toBe(true);
    expect(canRun({ ...p, webgl2: false })).toBe(false);
    expect(canRun({ ...p, create_image_bitmap: false })).toBe(false);
    expect(canRun({ ...p, webgl2: false, create_image_bitmap: false })).toBe(false);
    // Nothing else stops it: no secure context, no device memory given, a small texture side, a phone's viewport.
    expect(canRun({ ...p, secure_context: false, device_memory: null, max_texture_size: 2048 })).toBe(true);
  });
});

describe("the probe's panel, the copy's first (§7.2)", () => {
  let globals: GlobalSpies;

  beforeEach(() => {
    globals = spyOnGlobals();
    vi.mocked(startLookdev).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows each field, the room's stage at the viewport, and the floor, then starts the page with the probe", async () => {
    const phone = fakePhone(PHONE);
    const p = await startPhone(phone.win, phone.root);
    expect(p).toEqual(expected(PHONE));
    const [panel, page, ...rest] = [...phone.root.children];
    expect(rest).toEqual([]);
    if (!panel || !page) throw new Error("no panel, or no page");
    expect(panel.querySelector("h1, h2")).not.toBeNull();
    const stage = stageFor({ w: 384, h: 740 });
    expect(stage).toEqual({ w: 368, h: 420 });
    expect(rows(panel)).toEqual({
      "WebGL 2": "yes",
      "Largest texture": "4,096 px",
      "Device memory": "8 GB",
      "createImageBitmap from a Blob": "yes",
      "Secure context": "no, recorded only",
      Viewport: "384 × 740 CSS px, at a pixel ratio of 2.8125",
      "The room's stage here": "368 × 420 CSS px",
      "ADR 0010's floor for studio models": FLOOR_ABOVE,
    });
    const verdict = panel.querySelector("[role=status]");
    expect(verdict && text(verdict)).toBe(CAN_RUN);
    expect(verdict?.getAttribute("data-verdict")).toBe("runs");
    expect(text(panel)).not.toContain(OPTION_B);
    // The probe as the results carry it, for the note, in a read-only text area with its label.
    const area = panel.querySelector("textarea");
    expect(area?.readOnly).toBe(true);
    expect(JSON.parse(area?.value ?? "")).toEqual(p);
    expect(area && panel.querySelector(`label[for="${area.id}"]`)).not.toBeNull();
    // The page, in its own element after the panel, with the probe: T135's startLookdev.
    expect(startLookdev).toHaveBeenCalledTimes(1);
    expect(startLookdev).toHaveBeenCalledWith(page, { phone: true, probe: p });
    expect(globals.network).toEqual([]);
    expect(globals.storage).toEqual([]);
  });

  it("says when the phone is below ADR 0010's floor that a run there measures stand-ins only, and still runs", async () => {
    for (const d of [
      { ...PHONE, deviceMemory: 2 },
      { ...PHONE, webgl2: 2048 },
    ]) {
      vi.mocked(startLookdev).mockClear();
      const phone = fakePhone(d);
      await startPhone(phone.win, phone.root);
      const [panel] = [...phone.root.children];
      if (!panel) throw new Error("no panel");
      expect(rows(panel)["ADR 0010's floor for studio models"], JSON.stringify(d)).toBe(FLOOR_BELOW);
      expect(startLookdev).toHaveBeenCalledTimes(1);
    }
    expect(FLOOR_BELOW).toContain("stand-ins only");
  });

  it("stops with option B's words without WebGL 2 or createImageBitmap, and never starts the page", async () => {
    for (const d of [
      { ...PHONE, webgl2: null },
      { ...PHONE, decode: "missing" },
      { ...PHONE, decode: "rejects" },
    ] as const) {
      const phone = fakePhone(d);
      const p = await startPhone(phone.win, phone.root);
      const [panel, ...rest] = [...phone.root.children];
      expect(rest, JSON.stringify(d)).toEqual([]);
      if (!panel) throw new Error("no panel");
      const verdict = panel.querySelector("[role=status]");
      expect(verdict && text(verdict)).toBe(CANNOT_RUN);
      expect(verdict?.getAttribute("data-verdict")).toBe("stops");
      expect(text(panel)).toContain(OPTION_B);
      expect(JSON.parse(panel.querySelector("textarea")?.value ?? "")).toEqual(p);
      if (d.webgl2 === null) expect(rows(panel)["ADR 0010's floor for studio models"]).toBe(FLOOR_BELOW);
    }
    expect(CANNOT_RUN).toBe("This browser can't run the vignette from a local file.");
    expect(startLookdev).not.toHaveBeenCalled();
  });

  it("shows on the panel why the page didn't start, if it throws as it starts", async () => {
    vi.mocked(startLookdev).mockImplementationOnce(() => {
      throw new Error("no WebGL context");
    });
    const phone = fakePhone(PHONE);
    await startPhone(phone.win, phone.root);
    const [panel] = [...phone.root.children];
    expect(panel && text(panel)).toContain(`${PAGE_FAILED} no WebGL context`);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// build/single-file.ts on its own
// --------------------------------------------------------------------------------------------------------------------

const sha256Base64 = (s: string): string => createHash("sha256").update(s, "utf8").digest("base64");
const PAGE: PhonePage = { title: "Lookdev, the phone's copy", root: PHONE_ROOT };

describe("single-file.ts (§7.1)", () => {
  it("escapes what would end or re-enter a classic script, in any case, and keeps what the code means", () => {
    const code =
      'var a="</script>",b="<SCRIPT src=x>",c="<!-- x",d=`</Script\t`,e=/<\\/script>/.source,f="x<y</scripts";' +
      "globalThis.out=[a,b,c,d,e,f];";
    const escaped = scriptText(code);
    expect(escaped).not.toMatch(/<\/script|<script|<!--/i);
    expect(escaped).toBe(
      'var a="\\x3C/script>",b="\\x3CSCRIPT src=x>",c="\\x3C!-- x",d=`\\x3C/Script\t`,e=/<\\/script>/.source,' +
        'f="x<y\\x3C/scripts";globalThis.out=[a,b,c,d,e,f];',
    );
    const run = (source: string): unknown =>
      new Function("globalThis", `${source}; return globalThis.out;`)({} as Record<string, unknown>);
    expect(run(escaped)).toEqual(run(code));
    expect(scriptText("a<b&&c>d")).toBe("a<b&&c>d");
  });

  it("refuses a script or a style an HTML parser would change, and a style that would end its element", () => {
    for (const bad of ["a\r\nb", "a\rb", "a\0b", "a\ud800b"]) {
      expect(() => scriptText(bad), JSON.stringify(bad)).toThrow(/single-file/);
      expect(() => styleText(bad), JSON.stringify(bad)).toThrow(/single-file/);
    }
    expect(() => styleText("a{b:c}</STYLE>")).toThrow(/<\/style/);
    expect(styleText("a{b:c}")).toBe("a{b:c}");
  });

  it("admits the one script and the one style by their hashes, and allows nothing else to load or connect", () => {
    expect(cspHash("x")).toBe(`'sha256-${sha256Base64("x")}'`);
    expect(phonePolicy("s", "t")).toBe(
      `default-src 'none'; script-src 'sha256-${sha256Base64("s")}'; style-src 'sha256-${sha256Base64("t")}'; ` +
        "font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });

  /** The plugin's generateBundle, called as Vite calls it, over `bundle`; what it emitted lands in the bundle. */
  function generate(plugin: Plugin, bundle: Rolldown.OutputBundle): void {
    const hook = plugin.generateBundle;
    const handler = typeof hook === "function" ? hook : hook?.handler;
    if (!handler) throw new Error("no generateBundle");
    const context = {
      emitFile(file: { type: string; fileName: string; source: string }): string {
        (bundle as Record<string, unknown>)[file.fileName] = { ...file };
        return file.fileName;
      },
      error(message: string): never {
        throw new Error(message);
      },
    };
    const run = handler as unknown as (this: unknown, options: unknown, bundle: Rolldown.OutputBundle) => void;
    run.call(context, {}, bundle);
  }

  const chunk = (fileName: string, code: string, isEntry = true): unknown => ({
    type: "chunk",
    fileName,
    code,
    isEntry,
  });
  const asset = (fileName: string, source: string | Uint8Array): unknown => ({ type: "asset", fileName, source });

  it("ends the build with one file, lookdev.html, from its one chunk and its CSS, dropping what else it wrote", () => {
    const code = 'var h4LookdevPhone=function(){"use strict";return{a:"</script>"}}();\n';
    const css = "body{font-family:x}\n";
    const bundle = {
      "lookdev.js": chunk("lookdev.js", code),
      // As Vite's library mode extracts it: with its own hash marker, a comment its app builds strip.
      "lookdev.css": asset("lookdev.css", new TextEncoder().encode(`${css}/*$vite$:1*/`)),
      "room-manifest.json": asset("room-manifest.json", "{}"),
      "a/desk.0123456789abcdef.glb.gz": asset("a/desk.0123456789abcdef.glb.gz", new Uint8Array(3)),
    } as unknown as Rolldown.OutputBundle;
    generate(singleFile(PAGE), bundle);
    expect(Object.keys(bundle)).toEqual([PHONE_FILE]);
    const html = (bundle[PHONE_FILE] as { source: string }).source;
    expect(html).toBe(singleFileHtml(PAGE, code, css));
    expect(html).toContain(`<style>${styleText(css)}</style>`);
    expect(html).toContain(`<script>${scriptText(code)}</script>`);
    expect(html).toContain(`content="${phonePolicy(scriptText(code), styleText(css))}"`);
  });

  it("refuses more than one chunk, or more than one stylesheet: the copy's dynamic imports and CSS are inlined", () => {
    const two = {
      "lookdev.js": chunk("lookdev.js", "a()"),
      "scene-0123.js": chunk("scene-0123.js", "b()", false),
    } as unknown as Rolldown.OutputBundle;
    expect(() => generate(singleFile(PAGE), two)).toThrow(/one chunk/);
    const styles = {
      "lookdev.js": chunk("lookdev.js", "a()"),
      "a.css": asset("a.css", "a{}"),
      "b.css": asset("b.css", "b{}"),
    } as unknown as Rolldown.OutputBundle;
    expect(() => generate(singleFile(PAGE), styles)).toThrow(/stylesheet/);
  });
});

// --------------------------------------------------------------------------------------------------------------------
// The build: npm run build:lookdev-phone
// --------------------------------------------------------------------------------------------------------------------

/** Runs `body` with these environment variables set (undefined: unset), then puts them back. */
async function withEnv<T>(env: Readonly<Record<string, string | undefined>>, body: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const apply = (values: Record<string, string | undefined>): void => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  apply({ ...env });
  try {
    return await body();
  } finally {
    apply(saved);
  }
}

/** A build of the copy into `outDir` with ROOM_DRAFTS=1, under an empty policy directory: a checkout's, with nothing
 *  on main, as the image's empty policy context gives it. */
async function buildCopy(outDir: string, policy: string): Promise<void> {
  await withEnv({ ROOM_DRAFTS: "1", ROOM_POLICY_DIR: policy }, async () => {
    await build({ root: WEB, configFile: CONFIG, logLevel: "silent", build: { outDir, emptyOutDir: true } });
  });
}

/** What a folder holds, each file by its path with its SHA-256 and each folder with "-"; null when it doesn't exist. */
function snapshot(dir: string): Record<string, string> | null {
  if (!existsSync(dir)) return null;
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir, { recursive: true, encoding: "utf8" }).sort()) {
    const path = join(dir, name);
    out[name] = statSync(path).isFile() ? createHash("sha256").update(readFileSync(path)).digest("hex") : "-";
  }
  return out;
}

/** A URL on some host: a scheme with an authority, or a scheme-relative one. */
const HOST_URL = /[a-z][a-z0-9+.-]*:\/\/|^\s*\/\//i;

/** §7.1's policy, exactly, with its two hashes captured. */
const POLICY =
  /^default-src 'none'; script-src 'sha256-([A-Za-z0-9+/]{43}=)'; style-src 'sha256-([A-Za-z0-9+/]{43}=)'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'$/;

/** What the copy did as it opened in jsdom: its requests, and jsdom's errors. */
interface Opened {
  readonly dom: JSDOM;
  readonly network: string[];
  readonly errors: { readonly type: string; readonly message: string }[];
}

/** Opens the copy as a phone's browser opens it from its files: from a file: URL, scripts running. Every way out is
 *  recorded and served nothing: jsdom's subresource loads, and fetch, XMLHttpRequest, WebSocket, EventSource,
 *  sendBeacon, and object URLs on the window. */
async function openCopy(file: string): Promise<Opened> {
  const network: string[] = [];
  const errors: { type: string; message: string }[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => {
    errors.push({ type: (e as Error & { type?: string }).type ?? "", message: e.message });
  });
  const dom = await JSDOM.fromFile(file, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    resources: {
      interceptors: [
        requestInterceptor((request) => {
          network.push(`${request.method} ${request.url}`);
          return new Response("", { status: 404 });
        }),
      ],
    },
    beforeParse(window: DOMWindow) {
      const w = window as unknown as Record<string, unknown>;
      w.fetch = (input: unknown) => {
        network.push(`fetch ${String(input)}`);
        return Promise.reject(new TypeError("no network"));
      };
      w.XMLHttpRequest = class {
        open(method: string, url: string): void {
          network.push(`XMLHttpRequest ${method} ${url}`);
        }
        send(): void {}
      };
      for (const name of ["WebSocket", "EventSource"]) {
        w[name] = class {
          constructor(url: string) {
            network.push(`${name} ${url}`);
          }
        };
      }
      Object.defineProperty(window.navigator, "sendBeacon", {
        configurable: true,
        value: (url: string) => (network.push(`sendBeacon ${url}`), true),
      });
      Object.defineProperty(window.URL, "createObjectURL", {
        configurable: true,
        value: () => (network.push("URL.createObjectURL"), "blob:refused"),
      });
    },
  });
  return { dom, network, errors };
}

/** Waits up to `ms` for `ready` to hold, a few milliseconds at a time. */
async function until(ready: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((done) => setTimeout(done, 5));
  }
}

describe("npm run build:lookdev-phone (§7.1, §8 layer 5)", () => {
  const made: string[] = [];
  let first = "";
  let second = "";
  let html = "";

  beforeAll(async () => {
    const policy = mkdtempSync(join(tmpdir(), "h4-phone-policy-"));
    first = mkdtempSync(join(tmpdir(), "h4-phone-a-"));
    second = mkdtempSync(join(tmpdir(), "h4-phone-b-"));
    made.push(policy, first, second);
    await buildCopy(first, policy);
    await buildCopy(second, policy);
    html = readFileSync(join(first, PHONE_FILE), "utf8");
  });

  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  });

  /** The copy parsed, its scripts left alone. */
  const parsed = (): Document => new JSDOM(html).window.document;

  it("is Vite's build of vite.phone.config.ts: an IIFE library from phone.ts, into apps/web/dist-phone/", async () => {
    const pkg = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["build:lookdev-phone"]).toBe("vite build --config vite.phone.config.ts");
    const config = await withEnv({ ROOM_DRAFTS: "1" }, () =>
      resolveConfig({ root: WEB, configFile: CONFIG, logLevel: "silent" }, "build"),
    );
    expect(config.build.outDir).toBe(join(WEB, "dist-phone"));
    const lib = config.build.lib;
    if (!lib) throw new Error("not library mode");
    expect(lib.entry).toBe(join(WEB, "src/lookdev/phone.ts"));
    expect(lib.formats).toEqual(["iife"]);
    // Outside dist/, which the image's runtime stage copies; the root .gitignore keeps it out of every commit.
    expect(config.build.outDir.startsWith(join(WEB, "dist") + "/")).toBe(false);
    const gitignore = readFileSync(join(REPO, ".gitignore"), "utf8").split("\n");
    expect(gitignore).toContain("apps/web/dist-phone/");
  });

  it("refuses to run without ROOM_DRAFTS=1, and writes nothing", async () => {
    const out = join(WEB, "dist-phone");
    const before = snapshot(out);
    for (const value of [undefined, "", "0", "true"]) {
      const env = { ...process.env };
      delete env.ROOM_DRAFTS;
      if (value !== undefined) env.ROOM_DRAFTS = value;
      const run = spawnSync("npm", ["run", "build:lookdev-phone", "-w", "apps/web"], {
        cwd: REPO,
        env,
        encoding: "utf8",
      });
      expect(run.status, `ROOM_DRAFTS=${String(value)}`).not.toBe(0);
      expect(`${run.stdout}${run.stderr}`).toContain(PHONE_REFUSAL);
    }
    expect(snapshot(out)).toEqual(before);
    // Vite's own build refuses it the same way, before it makes its folder.
    const fresh = join(tmpdir(), `h4-phone-refused-${process.pid}`);
    await withEnv({ ROOM_DRAFTS: undefined }, async () => {
      await expect(
        build({ root: WEB, configFile: CONFIG, logLevel: "silent", build: { outDir: fresh } }),
      ).rejects.toThrow(PHONE_REFUSAL);
    });
    expect(existsSync(fresh)).toBe(false);
  });

  it("writes one file, lookdev.html, and two builds of one tree are byte-identical", () => {
    expect(readdirSync(first)).toEqual([PHONE_FILE]);
    expect(readdirSync(second)).toEqual([PHONE_FILE]);
    expect(readFileSync(join(second, PHONE_FILE)).equals(readFileSync(join(first, PHONE_FILE)))).toBe(true);
  });

  it("has one style and one classic inline script, with no '</script' inside it, and nothing that loads", () => {
    expect(html.match(/<style\b/gi)).toHaveLength(1);
    expect(html.match(/<\/style/gi)).toHaveLength(1);
    expect(html.match(/<script\b/gi)).toHaveLength(1);
    expect(html.match(/<\/script/gi)).toHaveLength(1);
    expect(html).not.toContain("<!--");
    const doc = parsed();
    const scripts = [...doc.querySelectorAll("script")];
    expect(scripts).toHaveLength(1);
    const [script] = scripts as [HTMLScriptElement];
    expect(script.getAttributeNames()).toEqual([]);
    expect(script.text).not.toMatch(/<\/script|<script|<!--/i);
    expect(script.text.length).toBeGreaterThan(0);
    expect(doc.querySelectorAll("style")).toHaveLength(1);
    expect(doc.querySelectorAll("link, base, iframe, frame, object, embed, img, source, video, audio")).toHaveLength(0);
    expect(doc.querySelector(`main#${PHONE_ROOT}`)).not.toBeNull();
    expect(doc.querySelector('meta[name="h4-lookdev"]')?.getAttribute("content")).toBe("drafts-only");
  });

  it("puts §7.1's policy first in the head after the charset, exactly, each hash the hash of its element", () => {
    const doc = parsed();
    const [charset, policy] = [...doc.head.children];
    expect(charset?.getAttribute("charset")).toBe("utf-8");
    expect(policy?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(doc.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]')).toHaveLength(1);
    const match = POLICY.exec(policy?.getAttribute("content") ?? "");
    if (!match) throw new Error(`not §7.1's policy: ${policy?.getAttribute("content")}`);
    const [script] = [...doc.querySelectorAll("script")] as [HTMLScriptElement];
    const [style] = [...doc.querySelectorAll("style")] as [HTMLStyleElement];
    expect(match[1]).toBe(sha256Base64(script.text));
    expect(match[2]).toBe(sha256Base64(style.textContent ?? ""));
    for (const e of [script, style]) {
      expect(policy?.compareDocumentPosition(e) ?? 0, e.tagName).toBe(4); // DOCUMENT_POSITION_FOLLOWING
    }
  });

  it("holds the typefaces as data: fonts, each the file apps/web/fonts/ vendors, no other url(), and no comment", () => {
    const style = parsed().querySelector("style")?.textContent ?? "";
    // Base64 never holds "*", so any "/*" would be a comment the minified CSS doesn't have.
    expect(style).not.toContain("/*");
    const urls = [...style.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].map((m) => m[2] ?? "");
    expect(urls.length).toBeGreaterThan(0);
    const fonts = new Set<string>();
    for (const url of urls) {
      const data = /^data:font\/woff;base64,([A-Za-z0-9+/=]+)$/.exec(url);
      if (!data) throw new Error(`not a data: font: ${url.slice(0, 60)}`);
      fonts.add(
        createHash("sha256")
          .update(Buffer.from(data[1] ?? "", "base64"))
          .digest("hex"),
      );
    }
    const vendored = readdirSync(join(WEB, "fonts"))
      .filter((name) => name.endsWith(".woff"))
      .map((name) =>
        createHash("sha256")
          .update(readFileSync(join(WEB, "fonts", name)))
          .digest("hex"),
      );
    expect([...fonts].sort()).toEqual(vendored.sort());
  });

  it("names no URL on any host in any attribute", () => {
    const doc = parsed();
    for (const e of doc.querySelectorAll("*")) {
      for (const name of e.getAttributeNames()) {
        expect(HOST_URL.test(e.getAttribute(name) ?? ""), `${e.tagName} ${name}`).toBe(false);
      }
    }
  });

  it("opened in jsdom from a file: URL, makes no request, and its probe stops at option B's words", async () => {
    const opened = await openCopy(join(first, PHONE_FILE));
    const doc = opened.dom.window.document;
    expect(doc.URL.startsWith("file:///")).toBe(true);
    await until(() => doc.querySelector("[data-verdict]") !== null);
    const root = doc.getElementById(PHONE_ROOT);
    if (!root) throw new Error("no root");
    const [panel, ...rest] = [...root.children];
    expect(rest).toEqual([]);
    if (!panel) throw new Error("no panel");
    const verdict = panel.querySelector("[data-verdict]");
    expect(verdict && text(verdict)).toBe(CANNOT_RUN);
    expect(text(panel)).toContain(OPTION_B);
    // jsdom's own window: no WebGL 2, no createImageBitmap, not a secure context, 1024 × 768 at a pixel ratio of 1.
    expect(JSON.parse(panel.querySelector("textarea")?.value ?? "")).toEqual({
      webgl2: false,
      max_texture_size: 0,
      device_memory: null,
      create_image_bitmap: false,
      secure_context: false,
      viewport: [1024, 768],
      dpr: 1,
    });
    expect(opened.network).toEqual([]);
    // jsdom has no canvas, and says so; anything else it reports is the copy's own failure.
    const failures = opened.errors.filter((e) => !(e.type === "not-implemented" && e.message.includes("getContext")));
    expect(failures.filter((e) => e.type !== "css-parsing")).toEqual([]);
    opened.dom.window.close();
  });

  it("stops with no axe violation", async () => {
    const opened = await openCopy(join(first, PHONE_FILE));
    const win = opened.dom.window as unknown as Window & { eval(code: string): unknown; axe: typeof axe };
    await until(() => win.document.querySelector("[data-verdict]") !== null);
    win.eval(axe.source);
    const result = await win.axe.run(win.document, { resultTypes: ["violations"] });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(opened.network).toEqual([]);
    opened.dom.window.close();
  });
});
