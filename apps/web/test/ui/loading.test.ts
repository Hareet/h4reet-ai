// T012 (spec 012; FR-013, FR-016, FR-018, FR-022, FR-037 to FR-039, FR-052; contracts/loading-progress.md §5): the
// loader's card, through startRoom with the 3D stage stubbed. Its DOM as contract §5 draws it, after the room's block and
// before "Around the room"; the bar's first value, which counts the 3D code that arrived behind the choice; the progress
// bar's role, name, values, and value text after each end; the stage line in the UI words; the fill's fraction set
// through the CSS object model, never a style attribute; focus on the loader's heading, so "Loading the room" is said
// once and the status region says nothing then, and the end line said once; the card inert at once as it gives way,
// the hand-off's first frame in the same turn, and the card gone by 250 ms, at once under reduced motion; and focus on
// the room's heading after.
import { afterEach, describe, expect, it, vi } from "vitest";

import { assetEvent } from "../../src/asset-events";
import { LOADING_CEILING_MS } from "../../src/room/quality";
import type { ExpectedFile, SceneOptions } from "../../src/room/stage";
import { announcer, button, enter, flush, radio, start } from "../helpers/room";
import type { Visit } from "../helpers/room";

afterEach(() => {
  vi.restoreAllMocks();
});

const card = (v: Visit): HTMLElement | null => v.doc.querySelector<HTMLElement>("section.room-loader");
const bar = (v: Visit): HTMLElement => {
  const el = v.doc.querySelector<HTMLElement>('.room-loader [role="progressbar"]');
  if (!el) throw new Error("no progress bar");
  return el;
};
const options = (v: Visit): SceneOptions => {
  const made = v.scene.created.at(-1);
  if (!made) throw new Error("no 3D stage made");
  return made;
};
const end = (v: Visit, asset: string, outcome: "loaded" | "failed" | "skipped" = "loaded"): void =>
  options(v).assets?.(assetEvent({ asset, outcome, ms: 10, bytes: 100, mode: "3d" }));
const text = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** 21 files sized so that the first 12 ended give 64 with the three steps (floor(15 + 85 × 5820 / 10000)). */
const FILES: ExpectedFile[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ asset: `fx-a${i}`, bytes: 485 })),
  ...Array.from({ length: 8 }, (_, i) => ({ asset: `fx-b${i}`, bytes: 464 })),
  { asset: "fx-c", bytes: 468 },
];

/** Presses Enter without waiting for the stage, and reads the bar's value in the same turn: its first. */
async function pressAndRead(v: Visit): Promise<string | null> {
  await flush();
  radio(v.doc, "path", "engineer").click();
  radio(v.doc, "avatar", "dog").click();
  button(v.doc, "Enter").click();
  return bar(v).getAttribute("aria-valuenow");
}

/** A 3D visit whose stage will load `list`, entered. */
async function entered(list: readonly ExpectedFile[], o: Parameters<typeof start>[0] = {}): Promise<Visit> {
  const v = start({ webgl: true, ...o });
  v.scene.expected = Promise.resolve(list);
  await enter(v);
  return v;
}

describe("the card's DOM (contract §5)", () => {
  it("is a section after the room's block and before Around the room, with its heading, bar, percentage, and line", async () => {
    const v = await entered(FILES);
    const el = card(v);
    expect(el).not.toBeNull();
    expect(el?.classList.contains("hud-glass")).toBe(true);
    expect(el?.getAttribute("aria-labelledby")).toBe("loader-heading");
    expect(el?.previousElementSibling?.classList.contains("room-block")).toBe(true);
    expect(el?.nextElementSibling?.classList.contains("room-around")).toBe(true);
    const heading = v.doc.getElementById("loader-heading");
    expect(heading?.tagName).toBe("H2");
    expect(heading?.getAttribute("tabindex")).toBe("-1");
    expect(text(heading)).toBe("Loading the room");
    const b = bar(v);
    expect(b.getAttribute("aria-labelledby")).toBe("loader-heading");
    expect([b.getAttribute("aria-valuemin"), b.getAttribute("aria-valuemax")]).toEqual(["0", "100"]);
    expect(b.querySelector(".room-loader-fill")).not.toBeNull();
    const percent = el?.querySelector(".room-loader-percent");
    const stage = el?.querySelector(".room-loader-stage");
    expect(percent?.getAttribute("aria-hidden")).toBe("true");
    expect(stage?.getAttribute("aria-hidden")).toBe("true");
    // In place of the stage's "Loading the room…" (D9).
    expect(v.doc.querySelector(".room-loading")).toBeNull();
    // The card's words are text, never markup; its one size is set through the CSS object model (FR-052).
    expect(el?.querySelector("script, style")).toBeNull();
  });
});

describe("the bar's first value (FR-013)", () => {
  it("counts the 3D code at once where it arrived behind the choice", async () => {
    const v = start({ webgl: true });
    v.scene.expected = new Promise(() => undefined);
    expect(Number(await pressAndRead(v))).toBeGreaterThanOrEqual(10);
  });

  it("is 0 while the 3D code is still on its way", async () => {
    const v = start({ webgl: true, sceneLate: true });
    expect(await pressAndRead(v)).toBe("0");
    await flush();
    expect(text(card(v)?.querySelector(".room-loader-stage") ?? null)).toBe("Loading the room's code");
  });
});

describe("the bar's values and its stage line (FR-016, FR-037)", () => {
  it("reads 64%: Loading the room's pieces: 12 of 21 after twelve of the files have ended", async () => {
    const v = await entered(FILES);
    const b = bar(v);
    expect(b.getAttribute("aria-valuetext")).toBe(`15%: Loading the room's pieces: 0 of 21`);
    for (const f of FILES.slice(0, 12)) end(v, f.asset);
    await flush();
    expect(b.getAttribute("aria-valuenow")).toBe("64");
    expect(b.getAttribute("aria-valuetext")).toBe("64%: Loading the room's pieces: 12 of 21");
    expect(text(card(v)?.querySelector(".room-loader-percent") ?? null)).toBe("64%");
    expect(text(card(v)?.querySelector(".room-loader-stage") ?? null)).toBe("Loading the room's pieces: 12 of 21");
    let last = 64;
    for (const f of FILES.slice(12, 20)) {
      end(v, f.asset, "failed");
      await flush();
      const now = Number(b.getAttribute("aria-valuenow"));
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it("says Finishing the room while only the typefaces remain", async () => {
    const waiting: (() => void)[] = [];
    const arrive = (): void => {
      for (const resolve of waiting.splice(0)) resolve();
    };
    const v = await entered([{ asset: "fx-a", bytes: 10 }], {
      fonts: { load: () => new Promise<unknown>((resolve) => waiting.push(() => resolve([]))) },
    });
    end(v, "fx-a");
    await flush();
    expect(text(card(v)?.querySelector(".room-loader-stage") ?? null)).toBe("Finishing the room");
    expect(bar(v).getAttribute("aria-valuetext")).toBe("97%: Finishing the room");
    arrive();
    await flush();
    expect(v.doc.documentElement.getAttribute("data-loading")).not.toBe("on");
  });

  it("sets the fill's fraction through the CSS object model, never a style attribute (FR-052)", async () => {
    const v = start({ webgl: true });
    v.scene.expected = Promise.resolve(FILES);
    const setProperty = vi.spyOn(v.win.CSSStyleDeclaration.prototype, "setProperty");
    const setAttribute = vi.spyOn(v.win.Element.prototype, "setAttribute");
    await enter(v);
    for (const f of FILES.slice(0, 12)) end(v, f.asset);
    await flush();
    const fractions = setProperty.mock.calls.filter(([name]) => name === "--loader-fraction").map(([, value]) => value);
    expect(fractions).toContain("0.64");
    expect(bar(v).style.getPropertyValue("--loader-fraction")).toBe("0.64");
    expect(setAttribute.mock.calls.filter(([name]) => name === "style")).toEqual([]);
  });
});

describe("what is said, and where focus goes (FR-038, FR-039)", () => {
  it("puts focus on the loader's heading, the status region saying nothing then", async () => {
    const v = await entered(FILES);
    expect(v.doc.activeElement?.id).toBe("loader-heading");
    expect(text(announcer(v.doc))).toBe("");
    for (const f of FILES.slice(0, 5)) end(v, f.asset);
    await flush();
    // Nothing announces a change of the value.
    expect(text(announcer(v.doc))).toBe("");
  });

  it("says the room is ready once at the end, with the hand-off's line, and focuses the room's heading", async () => {
    const v = await entered(FILES);
    for (const f of FILES) end(v, f.asset);
    await flush();
    const said = text(announcer(v.doc));
    expect(said.match(/The room is ready\./g)).toHaveLength(1);
    expect(v.doc.activeElement?.tagName).toBe("H1");
  });

  it("says the loading was cut short once at the ceiling, and focuses the room's heading", async () => {
    const v = await entered(FILES);
    v.clock.advance(LOADING_CEILING_MS);
    await flush();
    const said = text(announcer(v.doc));
    expect(
      said.match(/The room opens now\. Some pieces are still on their way and appear as they arrive\./g),
    ).toHaveLength(1);
    expect(v.doc.activeElement?.tagName).toBe("H1");
  });
});

describe("the fade (FR-022; PD-19)", () => {
  it("makes the card inert at once, starts the hand-off in the same turn, and removes the card by 250 ms", async () => {
    const v = await entered(FILES);
    const el = card(v);
    v.clock.advance(LOADING_CEILING_MS - 1);
    await flush();
    expect(v.scene.handoff).toEqual([]);
    v.clock.advance(1);
    // The same turn: no promise has settled since the ceiling's timer ran.
    expect(el?.hasAttribute("inert")).toBe(true);
    expect(v.scene.handoff.length).toBeGreaterThan(0);
    expect(el?.isConnected).toBe(true);
    v.clock.advance(250);
    await flush();
    expect(el?.isConnected).toBe(false);
    expect(card(v)).toBeNull();
    expect(v.doc.documentElement.hasAttribute("data-loading")).toBe(false);
  });

  it("removes the card at once under reduced motion, with no fade", async () => {
    const v = await entered(FILES, { reducedMotion: true });
    const el = card(v);
    v.clock.advance(LOADING_CEILING_MS);
    expect(el?.isConnected).toBe(false);
    expect(v.doc.documentElement.hasAttribute("data-loading")).toBe(false);
  });
});
