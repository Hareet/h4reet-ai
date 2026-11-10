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
import { HINT_MS } from "../../src/room/loading/hints";
import { LOADING_CEILING_MS } from "../../src/room/quality";
import type { ExpectedFile, SceneOptions } from "../../src/room/stage";
import { announcer, button, enter, flush, radio, roomIndex, start } from "../helpers/room";
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

// --------------------------------------------------------------------------------------------------------------------
// T021 (spec 012; FR-028, FR-030, FR-031, FR-036; contracts/loading-progress.md §5, §6): the hint area below the bar
// --------------------------------------------------------------------------------------------------------------------
describe("the hint area (T021)", () => {
  const hintsOf = (v: Visit): HTMLElement | null => v.doc.querySelector<HTMLElement>(".room-loader-hints");
  const region = (v: Visit): HTMLElement => {
    const el = v.doc.querySelector<HTMLElement>(".room-loader-hint");
    if (!el) throw new Error("no hint region");
    return el;
  };
  /** Everything the hint's live region was given, in order. */
  function heard(v: Visit): () => string[] {
    const lines: string[] = [];
    const seen = new v.win.MutationObserver((records) => {
      for (const r of records)
        if (r.type === "childList" && r.addedNodes.length > 0) lines.push(text(r.target as Element));
    });
    seen.observe(region(v), { childList: true, characterData: true, subtree: true });
    return () => {
      for (const r of seen.takeRecords())
        if (r.type === "childList" && r.addedNodes.length > 0) lines.push(text(r.target as Element));
      return lines;
    };
  }
  const HINTS = roomIndex().hints;

  it("creates its polite live region empty, and gives it the first hint on the next tick", async () => {
    const v = start({ webgl: true });
    v.scene.expected = Promise.resolve(FILES);
    await flush();
    radio(v.doc, "path", "engineer").click();
    radio(v.doc, "avatar", "dog").click();
    button(v.doc, "Enter").click();
    const r = region(v);
    expect(r.getAttribute("aria-live")).toBe("polite");
    expect(r.getAttribute("aria-atomic")).toBe("true");
    expect(text(r)).toBe("");
    const lines = heard(v);
    v.clock.advance(0);
    await flush();
    expect(text(r)).toBe(HINTS[0]);
    expect(lines()).toEqual([HINTS[0]]);
    expect(HINTS[0]).toBe(
      "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure.",
    );
  });

  it("names itself, says its place, and words its rotation control by its state, with no aria-pressed", async () => {
    const v = await entered(FILES);
    v.clock.advance(0);
    const area = hintsOf(v);
    expect(area?.getAttribute("aria-labelledby")).toBe("loader-hints-label");
    expect(text(v.doc.getElementById("loader-hints-label"))).toBe("Hint");
    expect(text(area?.querySelector(".room-loader-position") ?? null)).toBe(`Hint 1 of ${HINTS.length}`);
    const rotate = area?.querySelector<HTMLButtonElement>("button.room-loader-rotate");
    expect(text(rotate ?? null)).toBe("Pause hints");
    expect(rotate?.hasAttribute("aria-pressed")).toBe(false);
    rotate?.click();
    expect(text(rotate ?? null)).toBe("Play hints");
    expect(rotate?.hasAttribute("aria-pressed")).toBe(false);
    for (const name of ["Previous hint", "Next hint"])
      expect(button(v.doc, name).closest(".room-loader-hints")).toBe(area);
  });

  it("says each new hint once as it appears, every 6 seconds", async () => {
    const v = await entered(FILES);
    v.clock.advance(0);
    const lines = heard(v);
    v.clock.advance(HINT_MS);
    await flush();
    expect(text(region(v))).toBe(HINTS[1]);
    expect(text(hintsOf(v)?.querySelector(".room-loader-position") ?? null)).toBe(`Hint 2 of ${HINTS.length}`);
    expect(lines()).toEqual([HINTS[1]]);
  });

  it("steps with Previous hint and Next hint, wrapping, and never moves focus", async () => {
    const v = await entered(FILES);
    v.clock.advance(0);
    const next = button(v.doc, "Next hint");
    next.focus();
    next.click();
    expect(text(region(v))).toBe(HINTS[1]);
    expect(v.doc.activeElement).toBe(next);
    const previous = button(v.doc, "Previous hint");
    previous.focus();
    previous.click();
    previous.click();
    expect(text(region(v))).toBe(HINTS.at(-1));
    expect(v.doc.activeElement).toBe(previous);
    // Focus entered the controls: the rotation stopped, and its control offers to play.
    expect(text(v.doc.querySelector(".room-loader-rotate"))).toBe("Play hints");
  });

  it("puts a hint's words in as text, never as markup", async () => {
    const index = { ...roomIndex(), hints: ["Press <b>Enter</b> & see."] };
    const v = await entered(FILES, { room: index });
    v.clock.advance(0);
    expect(text(region(v))).toBe("Press <b>Enter</b> & see.");
    expect(region(v).querySelector("b")).toBeNull();
  });

  it("shows no hint area where the index holds no hint", async () => {
    const v = await entered(FILES, { room: { ...roomIndex(), hints: [] } });
    expect(card(v)).not.toBeNull();
    expect(hintsOf(v)).toBeNull();
  });

  it("leaves nothing of the hints in the room once the loader gives way", async () => {
    const v = await entered(FILES);
    v.clock.advance(LOADING_CEILING_MS + 250);
    await flush();
    expect(v.doc.querySelector(".room-loader-hints, .room-loader-hint")).toBeNull();
    for (const hint of HINTS) expect(v.doc.body.textContent ?? "").not.toContain(hint);
  });
});

// T037, the review's I-1 (spec 012; FR-030; SC-005; WCAG 2.2's 2.2.2): a press on "Pause hints" pauses the hints, in
// the browsers that focus a button as it is pressed (Chrome, Edge, and Firefox on Windows and Linux, Chrome on Android),
// whose focus is the press's own and never a stop; only focus that enters the controls from the keyboard stops them.
describe("a press on the rotation control, as browsers send it (T037, I-1)", () => {
  const ptr = (v: Visit, el: Element, type: string, pointerType: string): void => {
    el.dispatchEvent(
      new v.win.PointerEvent(type, {
        bubbles: type !== "pointerenter" && type !== "pointerleave",
        pointerType,
        button: 0,
      }),
    );
  };
  const hintText = (v: Visit): string => text(v.doc.querySelector(".room-loader-hint"));

  it("pauses on a mouse press: pointerdown, the focus it brings, pointerup, click", async () => {
    const v = await entered(FILES);
    v.clock.advance(0);
    const area = v.doc.querySelector(".room-loader-hints") as HTMLElement;
    const rotate = v.doc.querySelector<HTMLButtonElement>("button.room-loader-rotate") as HTMLButtonElement;
    ptr(v, area, "pointerenter", "mouse");
    ptr(v, rotate, "pointerdown", "mouse");
    rotate.focus();
    ptr(v, rotate, "pointerup", "mouse");
    rotate.click();
    expect(text(rotate)).toBe("Play hints");
    const shown = hintText(v);
    ptr(v, area, "pointerleave", "mouse");
    // Within the loader's 7 seconds: no new hint while paused.
    v.clock.advance(HINT_MS + 100);
    expect(hintText(v)).toBe(shown);
    rotate.click();
    expect(text(rotate)).toBe("Pause hints");
  });

  it("pauses on one tap: pointerdown, pointerup, pointerleave, the focus the tap brings, click", async () => {
    const v = await entered(FILES);
    v.clock.advance(0);
    const area = v.doc.querySelector(".room-loader-hints") as HTMLElement;
    const rotate = v.doc.querySelector<HTMLButtonElement>("button.room-loader-rotate") as HTMLButtonElement;
    ptr(v, area, "pointerenter", "touch");
    ptr(v, rotate, "pointerdown", "touch");
    ptr(v, rotate, "pointerup", "touch");
    ptr(v, area, "pointerleave", "touch");
    rotate.focus();
    rotate.click();
    expect(text(rotate)).toBe("Play hints");
    const shown = hintText(v);
    v.clock.advance(HINT_MS + 100);
    expect(hintText(v)).toBe(shown);
  });

  it("still stops on focus from the keyboard, and plays on the press that follows", async () => {
    const v = await entered(FILES);
    v.clock.advance(0);
    const rotate = v.doc.querySelector<HTMLButtonElement>("button.room-loader-rotate") as HTMLButtonElement;
    rotate.focus();
    expect(text(rotate)).toBe("Play hints");
    const shown = hintText(v);
    rotate.click();
    expect(text(rotate)).toBe("Pause hints");
    // Within the loader's 7 seconds, the next hint after 6.
    v.clock.advance(HINT_MS + 100);
    expect(hintText(v)).not.toBe(shown);
  });

  it("stops on keyboard focus after a press elsewhere that brought none", async () => {
    const v = await entered(FILES);
    v.clock.advance(0);
    const next = button(v.doc, "Next hint");
    const rotate = v.doc.querySelector<HTMLButtonElement>("button.room-loader-rotate") as HTMLButtonElement;
    // A press that brings no focus (Safari on a Mac), then Tab into the controls from outside them.
    ptr(v, next, "pointerdown", "mouse");
    ptr(v, next, "pointerup", "mouse");
    next.click();
    expect(text(rotate)).toBe("Pause hints");
    rotate.focus();
    expect(text(rotate)).toBe("Play hints");
  });
});
