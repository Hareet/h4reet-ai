// T111 (spec 004; FR-011, FR-034, FR-063; R-40; contracts/room-bundle.md §3.1, `copy`): the text copy, "Around the
// room", src/room/text-copy.ts, built from the index's copy[] by reference, in its order: a section headed by the UI
// word around.heading; each switch's label and the sentence of the tier the room shows, tier.not-live while nothing
// applies another, replaced in place by setTier, with no live region; the fixed lines the index lists, but "Paused at"
// only while paused; and a face's words only from its renderer's own word list, so a face is left out while it has
// none (T183, T184), as the sign's figures are. src/room/layout.ts places it after the conversation panel and outside
// the stage, in 3D and 2D, open with nothing to expand, in the page from Enter whatever the 3D chunk does; and the
// placeholder note, the UI word standin.note, shows only while stand-ins are in use. Expectations come from compose()
// over the fixture set, whose IDs are synthetic fx- ones.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { TIER_VALUES } from "../../src/room/compose/vocabulary";
import { renderTextCopy } from "../../src/room/text-copy";
import { enter, intoRoom, start, textOf } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

let composed: ComposeResult | null = null;
/** The fixture set, composed once a file, as a release build in strict mode. */
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));

const page = (): Document => new JSDOM("<main></main>").window.document;

/** The lines "Around the room" holds for an index, as copy[] orders them, the tier at `tier`: each switch's label and
 *  its tier's sentence, and each fixed line but "Paused at"; no face, and no figures, while no renderer gives words. */
function expectedLines(index: RoomIndex, tier: string): string[] {
  const out: string[] = [];
  for (const entry of index.copy) {
    if ("switch" in entry) {
      const sw = index.switches.find((s) => s.id === entry.switch);
      out.push(`${index.ui[sw?.label ?? ""] ?? ""}: ${index.ui[`tier.${tier}`] ?? ""}`);
    } else if ("line" in entry && entry.line !== "pause.paused_at") out.push(index.ui[entry.line] ?? "");
  }
  return out;
}

const linesOf = (section: Element): string[] => [...section.querySelectorAll("li")].map((li) => textOf(li));

describe("the text copy (renderTextCopy)", () => {
  it("heads a section with around.heading, listing each switch's state and the fixed lines in copy[]'s order", () => {
    const { index } = fixture();
    // The fixture's copy[] holds every kind of entry: its faces, its switch, the sign's figures, and the fixed lines.
    expect(new Set(index.copy.map((e) => Object.keys(e)[0]))).toEqual(new Set(["face", "switch", "figures", "line"]));
    const copy = renderTextCopy(page(), index);
    const section = copy.element;
    expect(section.localName).toBe("section");
    const heading = section.querySelector("h2");
    expect(textOf(heading)).toBe(index.ui["around.heading"]);
    expect(section.getAttribute("aria-labelledby")).toBe(heading?.id);
    // Visible to every visitor: not a visually hidden heading, and nothing to expand.
    expect(heading?.getAttribute("class") ?? "").not.toContain("visually-hidden");
    expect(section.querySelectorAll("details, [hidden], [aria-expanded], button")).toHaveLength(0);
    expect(linesOf(section)).toEqual(expectedLines(index, "not-live"));
    expect(linesOf(section).length).toBeGreaterThan(index.switches.length);
  });

  it("leaves out the faces and the sign's figures while no renderer words them, and Paused at until paused", () => {
    const { index } = fixture();
    const lines = linesOf(renderTextCopy(page(), index).element);
    const lineEntries = index.copy.filter((e) => "line" in e && e.line !== "pause.paused_at");
    expect(lines).toHaveLength(index.switches.length + lineEntries.length);
    for (const face of index.faces) {
      const label = index.ui[face.label] ?? "";
      expect(label).not.toBe("");
      expect(
        lines.filter((l) => l.startsWith(`${label}:`)),
        face.id,
      ).toEqual([]);
    }
    expect(lines.filter((l) => l.startsWith((index.ui["pause.paused_at"] ?? "").split("{")[0] ?? ""))).toEqual([]);
  });

  it("replaces a switch's sentence in place for each tier value, in no live region, so nothing is announced", () => {
    const { index } = fixture();
    const copy = renderTextCopy(page(), index);
    const items = [...copy.element.querySelectorAll("li")];
    const nodes = copy.element.querySelectorAll("*").length;
    for (const value of [...TIER_VALUES, "not-live" as const]) {
      copy.setTier(value);
      expect(linesOf(copy.element), value).toEqual(expectedLines(index, value));
      // The same elements, their text replaced: nothing added or removed.
      expect([...copy.element.querySelectorAll("li")]).toEqual(items);
      expect(copy.element.querySelectorAll("*")).toHaveLength(nodes);
    }
    for (const el of [copy.element, ...copy.element.querySelectorAll("*")]) {
      expect(el.hasAttribute("aria-live")).toBe(false);
      expect(el.getAttribute("role") ?? "").not.toMatch(/^(log|status|alert|marquee|timer)$/);
    }
  });

  it("puts words in as text, never markup", () => {
    const { index } = fixture();
    const ui = { ...index.ui, "tier.not-live": "<img src=x onerror=alert(1)>" };
    const copy = renderTextCopy(page(), { ...index, ui });
    expect(copy.element.querySelector("img")).toBeNull();
    expect(linesOf(copy.element).filter((l) => l.endsWith(": <img src=x onerror=alert(1)>"))).toHaveLength(
      index.switches.length,
    );
  });
});

describe("in the room", () => {
  it("sits after the conversation panel, outside the stage, in 3D and 2D, with each switch's state", async () => {
    const { index } = fixture();
    for (const webgl of [true, false]) {
      const v = start({ webgl, room: index });
      await intoRoom(v);
      expect(v.room.visit.mode).toBe(webgl ? "3d" : "2d");
      const around = v.doc.querySelector(".room-around");
      if (!around) throw new Error("no text copy in the room");
      expect(around.previousElementSibling?.matches(".talk")).toBe(true);
      expect(around.closest(".room-stage")).toBeNull();
      expect(around.closest("[hidden], [inert], [aria-hidden='true']")).toBeNull();
      expect(linesOf(around)).toEqual(expectedLines(index, "not-live"));
    }
  });

  it("is in the page from Enter, while the 3D chunk hasn't loaded", async () => {
    const { index } = fixture();
    const v = start({ webgl: true, sceneHangs: true, room: index });
    await enter(v);
    expect(v.room.visit.mode).not.toBe("3d");
    const around = v.doc.querySelector(".room-around");
    expect(linesOf(around ?? v.doc.body)).toEqual(expectedLines(index, "not-live"));
  });

  it("shows the placeholder note, the UI word standin.note, only while stand-ins are in use", async () => {
    const { index } = fixture();
    expect(index.build.placeholders).toBe(true);
    for (const placeholders of [true, false]) {
      const v = start({ room: { ...index, build: { ...index.build, placeholders } } });
      await intoRoom(v);
      const note = v.doc.querySelector(".room-note");
      expect(textOf(note)).toBe(index.ui["standin.note"]);
      expect(note?.hasAttribute("hidden"), String(placeholders)).toBe(!placeholders);
    }
  });
});
