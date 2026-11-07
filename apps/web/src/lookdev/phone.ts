// The lookdev page's phone copy: its entry (spec 004; FR-069, Q1's answer, "Copy, don't connect, as FR-069 says";
// research.md R-42; contracts/lookdev.md §7.2). vite.phone.config.ts builds the copy from this module, and its first
// panel is the probe, run before anything else, reading what the vignette needs of a phone's browser that opens the copy
// from its files, with no network:
// - WebGL 2 from a context made as the room makes it, with failIfMajorPerformanceCaveat, its MAX_TEXTURE_SIZE read
//   before the context is released, and navigator.deviceMemory where the browser gives it (quality.ts's capability());
// - createImageBitmap decoding a 1 × 1 PNG built in memory, from a Blob, with the GLB images' own options
//   (scene/gltf-images.ts's DECODE): the path the room's models take, which makes no URL;
// - isSecureContext, recorded only, since nothing in the copy depends on it; and the viewport in CSS pixels, with
//   devicePixelRatio.
// The panel shows each, the room's stage at that viewport (compose/stages.ts), and whether the phone is above ADR
// 0010's floor for studio models as the room's loader reads it: below it the room loads no model, so a run there
// measures stand-ins only. With WebGL 2 and createImageBitmap the copy runs: the page, T135's startLookdev, starts in
// its own element after the panel, with the probe; if it throws as it starts, the panel says why under its verdict,
// "The page didn't start:" and the error's message (main.ts's words), since the phone has no console to say it.
// Otherwise the panel says "This browser can't run the vignette from a local file." and the copy stops: lookdev runs
// on the desktop at the phone's stage size and pixel ratio, FR-069's option B. Either way the panel holds the probe as
// JSON, the fields the results carry (results.ts), for the note. The copy imports the site's typefaces, which its build
// inlines as data: fonts, so the panel and the page draw in them.
import "../fonts.css";

import { stageFor } from "../room/compose/stages";
import { count, fixed } from "../room/glb/rules";
import { capability, meetsModelFloor } from "../room/quality";
import { DECODE } from "../room/scene/gltf-images";
import { PAGE_FAILED, startLookdev } from "./main";
import type { Probe } from "./results";

/** What the panel says when the page throws as it starts: the phone has no console to say it. */
export { PAGE_FAILED };

/** The element the copy starts in, which vite.phone.config.ts has build/single-file.ts write into the copy's body. */
export const PHONE_ROOT = "lookdev-phone";

/** The panel's heading: the copy runs on whatever device opens it, a desktop browser among them (FR-069's option B). */
export const PROBE_TITLE = "Lookdev on this device: the probe";

/** The verdicts (lookdev.md §7.2). */
export const CAN_RUN = "This browser can run the vignette from a local file.";
export const CANNOT_RUN = "This browser can't run the vignette from a local file.";
/** What follows a stop: FR-069's option B. */
export const OPTION_B =
  "Delete this copy. Lookdev runs on the desktop instead, at this phone's stage size and pixel ratio: FR-069's option B.";
/** Where the phone stands against ADR 0010's floor for studio models, as the room's loader reads it. */
export const FLOOR_ABOVE = "above it: the room loads studio models";
export const FLOOR_BELOW = "below it: the room loads no model, so a run here measures stand-ins only";

/**
 * A 1 × 1 RGBA PNG, its bytes in the copy itself: the signature, IHDR, one deflated pixel in IDAT, and IEND, each
 * chunk with its CRC. The probe wraps it in a Blob, as the room's image step wraps a GLB's image.
 */
export const PROBE_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x68, 0x68, 0x68, 0xf8, 0x0f, 0x00, 0x05, 0x84, 0x02, 0x80, 0x53, 0x93, 0x74,
  0x36, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

/** Whether createImageBitmap decodes PROBE_PNG from a Blob, with the GLB images' options, as the 1 × 1 image it is. */
async function decodesFromBlob(win: Window): Promise<boolean> {
  if (typeof (win as Partial<Window>).createImageBitmap !== "function") return false;
  try {
    const bitmap = await win.createImageBitmap(new Blob([PROBE_PNG], { type: "image/png" }), DECODE);
    try {
      return bitmap.width === 1 && bitmap.height === 1;
    } finally {
      bitmap.close();
    }
  } catch {
    return false;
  }
}

/** The probe: lookdev.md §7.2's fields, in the order the results carry them. */
export async function probe(win: Window): Promise<Probe> {
  const device = capability(win);
  return {
    webgl2: device.webgl2,
    max_texture_size: device.maxTextureSize,
    device_memory: device.deviceMemory,
    create_image_bitmap: await decodesFromBlob(win),
    secure_context: win.isSecureContext === true,
    viewport: [win.innerWidth, win.innerHeight],
    dpr: win.devicePixelRatio,
  };
}

/** The verdict: the copy runs with WebGL 2 and createImageBitmap, whatever else the probe read. */
export function canRun(p: Probe): boolean {
  return p.webgl2 && p.create_image_bitmap;
}

const yes = (value: boolean): string => (value ? "yes" : "no");
/** CSS pixels: whole as counted, else to 0.1. */
const px = (n: number): string => (Number.isInteger(n) ? count(n) : fixed(n, 1));
const size = (w: number, h: number): string => `${px(w)} × ${px(h)} CSS px`;

/** The panel's rows: each field, the room's stage at the viewport, and the floor. */
function readings(p: Probe): (readonly [string, string])[] {
  const [w, h] = p.viewport;
  const stage = stageFor({ w, h });
  const floor = meetsModelFloor({
    webgl2: p.webgl2,
    maxTextureSize: p.max_texture_size,
    deviceMemory: p.device_memory,
  });
  return [
    ["WebGL 2", yes(p.webgl2)],
    ["Largest texture", `${count(p.max_texture_size)} px`],
    ["Device memory", p.device_memory === null ? "not given" : `${p.device_memory} GB`],
    ["createImageBitmap from a Blob", yes(p.create_image_bitmap)],
    ["Secure context", `${yes(p.secure_context)}, recorded only`],
    ["Viewport", `${size(w, h)}, at a pixel ratio of ${p.dpr}`],
    ["The room's stage here", size(stage.w, stage.h)],
    ["ADR 0010's floor for studio models", floor ? FLOOR_ABOVE : FLOOR_BELOW],
  ];
}

/**
 * The copy's start: the probe's panel first in `root`, then, if the verdict lets it, the page in its own element after
 * the panel. Resolves with the probe.
 */
export async function startPhone(win: Window, root: HTMLElement): Promise<Probe> {
  const doc = root.ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const panel = make("section");
  panel.className = "lookdev-probe";
  panel.setAttribute("aria-labelledby", "lookdev-probe-title");
  const title = make("h1", PROBE_TITLE);
  title.id = "lookdev-probe-title";
  const verdict = make("p", "Running the probe…");
  verdict.setAttribute("role", "status");
  panel.append(title, verdict);
  root.append(panel);

  const p = await probe(win);
  const runs = canRun(p);
  verdict.textContent = runs ? CAN_RUN : CANNOT_RUN;
  verdict.dataset.verdict = runs ? "runs" : "stops";
  const list = make("dl");
  for (const [name, value] of readings(p)) list.append(make("dt", name), make("dd", value));
  const label = make("label", "The probe, for the merge-request note");
  label.htmlFor = "lookdev-probe-json";
  const json = make("textarea", JSON.stringify(p, null, 2));
  json.id = "lookdev-probe-json";
  json.readOnly = true;
  json.rows = 12;
  panel.append(...(runs ? [] : [make("p", OPTION_B)]), list, label, json);
  if (!runs) return p;

  const page = make("div");
  root.append(page);
  try {
    startLookdev(page, { phone: true, probe: p });
  } catch (error) {
    verdict.after(make("p", `${PAGE_FAILED} ${error instanceof Error ? error.message : String(error)}`));
  }
  return p;
}

// The copy's own start, at load: its HTML holds the root. Imported anywhere else (a test, in Node), it starts nothing.
const root = typeof document === "undefined" ? null : document.getElementById(PHONE_ROOT);
if (root !== null) void startPhone(window, root);
