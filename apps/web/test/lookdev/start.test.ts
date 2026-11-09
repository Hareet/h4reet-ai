// The review's page-2 and phone-1 (spec 004; T135, T138; FR-069; contracts/lookdev.md §7.2; plan.md §10, "The phone
// copy's readings"): startLookdev (src/lookdev/main.ts), the page's start, run for real, as the site's page and the
// phone copy run it. When the page can't be built, it says why in its root: that this browser can't draw the room, as
// lookdev needs WebGL 2, only when the renderer can't make its WebGL context, and otherwise "The page didn't start:"
// with the error's message; and it throws the error on, so the phone copy's panel shows "The page didn't start:" with
// the message beside a verdict that said the copy runs (the phone has no console), and the site's page's console has
// it. The drafts build's inputs, which vitest doesn't resolve, are compose()'s over the repository with drafts, as the
// drafts build composes them; jsdom has no WebGL, so a renderer here never makes its context.
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startLookdev } from "../../src/lookdev/main";
import { CAN_RUN, PAGE_FAILED, PHONE_ROOT, startPhone } from "../../src/lookdev/phone";

/** The words a missing WebGL 2 still reads as. */
const NEEDS_WEBGL2 = "This browser can't draw the room here: lookdev needs WebGL 2.";

/** The index's digest the page is given, where a test makes it another than the 3D part's. */
const given = vi.hoisted(() => ({ digest: null as string | null }));

vi.mock("virtual:room-scene", async () => {
  const { repositoryBundle } = await import("../helpers/room");
  return { default: repositoryBundle({ drafts: true }).scene };
});
vi.mock("virtual:room-fixtures", async () => {
  const { repositoryBundle } = await import("../helpers/room");
  return { default: repositoryBundle({ drafts: true }).drafts?.fixtures };
});
vi.mock("virtual:room-lookdev", async () => {
  const { repositoryBundle } = await import("../helpers/room");
  const bundle = repositoryBundle({ drafts: true });
  return {
    default: bundle.drafts?.lookdev,
    get room() {
      return given.digest === null ? bundle.index : { ...bundle.index, digest: given.digest };
    },
    // The drafts build's room text (spec 004, T192).
    text: bundle.roomText,
  };
});

afterEach(() => {
  given.digest = null;
});

/** WebGL's MAX_TEXTURE_SIZE. */
const MAX_TEXTURE_SIZE = 0x0d33;

/**
 * A window as the reference phone opens the copy in: the probe's WebGL 2 context, made with
 * failIfMajorPerformanceCaveat, answers, and createImageBitmap decodes, so the probe says the copy runs; any other
 * context, the renderer's among them, isn't made, as jsdom makes none.
 */
function phoneWindow(): { win: Window; root: HTMLElement } {
  const win = new JSDOM(`<!doctype html><main id="${PHONE_ROOT}"></main>`, { pretendToBeVisual: true }).window;
  win.HTMLCanvasElement.prototype.getContext = ((
    kind: string,
    attributes?: { failIfMajorPerformanceCaveat?: boolean },
  ) =>
    kind === "webgl2" && attributes?.failIfMajorPerformanceCaveat === true
      ? {
          MAX_TEXTURE_SIZE,
          getParameter: (name: number) => (name === MAX_TEXTURE_SIZE ? 4096 : null),
          getExtension: () => ({ loseContext: () => undefined }),
        }
      : null) as unknown as HTMLCanvasElement["getContext"];
  const set = (key: string, value: unknown): void => {
    Object.defineProperty(win, key, { configurable: true, value });
  };
  set("innerWidth", 384);
  set("innerHeight", 740);
  set("devicePixelRatio", 2.8125);
  set("createImageBitmap", () => Promise.resolve({ width: 1, height: 1, close: () => undefined }));
  const root = win.document.getElementById(PHONE_ROOT);
  if (!root) throw new Error("no root");
  return { win: win as unknown as Window, root: root as unknown as HTMLElement };
}

/** The site's page, /lookdev/, as lookdev/index.html gives it. */
function sitePage(): HTMLElement {
  const win = new JSDOM('<!doctype html><main id="lookdev"><p>The page is loading.</p></main>', {
    url: "http://127.0.0.1:18105/lookdev/",
    pretendToBeVisual: true,
  }).window;
  win.HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
  const root = win.document.getElementById("lookdev");
  if (!root) throw new Error("no root");
  return root as unknown as HTMLElement;
}

const text = (e: Element | null | undefined): string => (e?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("the phone copy's page, when it doesn't start (the review's page-2 and phone-1)", () => {
  it("says, under a verdict that it runs, why the page didn't start, and that lookdev needs WebGL 2 where it does", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { win, root } = phoneWindow();
    await startPhone(win, root);
    const [panel, page, ...rest] = [...root.children];
    expect(rest).toEqual([]);
    expect(text(panel?.querySelector("[role=status]"))).toBe(CAN_RUN);
    expect(text(panel)).toContain(`${PAGE_FAILED} THREE.WebGLRenderer: Error creating WebGL context.`);
    expect(text(page)).toBe(NEEDS_WEBGL2);
  });

  it("says why the page didn't start when it fails for another reason, and never that it needs WebGL 2", async () => {
    given.digest = "0".repeat(16);
    const { win, root } = phoneWindow();
    await startPhone(win, root);
    const [panel, page] = [...root.children];
    expect(text(panel?.querySelector("[role=status]"))).toBe(CAN_RUN);
    const why = `${PAGE_FAILED} buildRoom: the 3D part's digest isn't the index's`;
    expect(text(panel)).toContain(why);
    expect(text(page)).toBe(why);
    expect(text(root)).not.toContain("WebGL 2.");
  });
});

describe("the site's page, when it doesn't start (the review's page-2)", () => {
  it("says lookdev needs WebGL 2 where the renderer can't make its context, and throws the error on, for the console", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = sitePage();
    expect(() => startLookdev(root, { phone: false, probe: null })).toThrow(/Error creating WebGL context/);
    expect(text(root)).toBe(NEEDS_WEBGL2);
  });

  it("says why the page didn't start for any other reason, and throws the error on", () => {
    given.digest = "0".repeat(16);
    const root = sitePage();
    expect(() => startLookdev(root, { phone: false, probe: null })).toThrow(/digest isn't the index's/);
    expect(text(root)).toBe(`${PAGE_FAILED} buildRoom: the 3D part's digest isn't the index's`);
  });
});
