// T111 (spec 004; FR-011, FR-034, FR-063; R-40; contracts/room-bundle.md §3.1, `copy`): the text copy, "Around the
// room", src/room/text-copy.ts, built from the index's copy[] by reference, in its order: a section headed by the UI
// word around.heading; each switch's label and the sentence of the tier the room shows, tier.not-live while nothing
// applies another, replaced in place by setTier, with no live region; the fixed lines the index lists, but "Paused at"
// only while paused; and a face's words only from its renderer's own word list (spec 004, T183, T184), so a face bound
// to room text is left out until its words come, and the sign's figures wait for their channel (T266).
// src/room/layout.ts places it after the conversation panel and outside
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
import { faceWords } from "../../src/room/faces/words";
import { renderTextCopy } from "../../src/room/text-copy";
import { button, flush, intoRoom, radio, start, textOf } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

let composed: ComposeResult | null = null;
/** The fixture set, composed once a file, as a release build in strict mode. */
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));

const page = (): Document => new JSDOM("<main></main>").window.document;

/** The lines "Around the room" holds for an index, as copy[] orders them, the tier at `tier`, before any room text has
 *  come: each face its renderers word from the UI words, with its label; each switch's label and its tier's sentence;
 *  and each fixed line but "Paused at"; no face bound to room text, and no figures, until their words come. */
function expectedLines(index: RoomIndex, tier: string): string[] {
  const out: string[] = [];
  for (const entry of index.copy) {
    if ("face" in entry) {
      const face = index.faces.find((f) => f.id === entry.face);
      const words = face ? faceWords(face, { index, text: null }) : null;
      if (face && words !== null) out.push(`${index.ui[face.label] ?? ""}: ${words.join(" ")}`);
    } else if ("switch" in entry) {
      const sw = index.switches.find((s) => s.id === entry.switch);
      out.push(`${index.ui[sw?.label ?? ""] ?? ""}: ${index.ui[`tier.${tier}`] ?? ""}`);
    } else if ("line" in entry && entry.line !== "pause.paused_at") out.push(index.ui[entry.line] ?? "");
    // Spec 016's line slot (FR-014; changed with T017, plan.md R-18): the stand-in line until the twin's own picture
    // shows, which no fixture's text copy is told of here.
    else if ("twin_line" in entry) out.push(index.ui["twin.stand_in"] ?? "");
  }
  return out;
}

const linesOf = (section: Element): string[] => [...section.querySelectorAll("li")].map((li) => textOf(li));
/** Spec 028 (T-A06, FR-015; plan.md §R-A5, §R-B8): in the room, the placeholder words are a line of their own after
 *  the line slots while the bundle's pieces are placeholders. */
const inRoom = (index: RoomIndex, lines: string[]): string[] =>
  index.build.placeholders ? [...lines.slice(0, 1), index.ui["standin.note"] ?? "", ...lines.slice(1)] : lines;

describe("the text copy (renderTextCopy)", () => {
  it("heads a section with around.heading, listing each switch's state and the fixed lines in copy[]'s order", () => {
    const { index } = fixture();
    // The fixture's copy[] holds every kind of entry: its faces, its switch, the sign's figures, and the fixed lines.
    // Spec 020's visitor line slot too, which shows nothing until a line is given (changed with its T007, R-04).
    expect(new Set(index.copy.map((e) => Object.keys(e)[0]))).toEqual(
      new Set(["twin_line", "visitor_line", "face", "switch", "figures", "line"]),
    );
    const copy = renderTextCopy(page(), index);
    const section = copy.element;
    expect(section.localName).toBe("section");
    const heading = section.querySelector("h2");
    expect(textOf(heading)).toBe(index.ui["around.heading"]);
    expect(section.getAttribute("aria-labelledby")).toBe(heading?.id);
    // Read by every visitor: not a visually hidden heading of its own, and nothing to expand. Spec 028 (T-A08, FR-016):
    // in the HUD's layouts room.css hides the whole section from view, never from the reading order.
    expect(heading?.getAttribute("class") ?? "").not.toContain("visually-hidden");
    expect(section.querySelectorAll("details, [hidden], [aria-expanded], button")).toHaveLength(0);
    expect(linesOf(section)).toEqual(expectedLines(index, "not-live"));
    expect(linesOf(section).length).toBeGreaterThan(index.switches.length);
  });

  it("leaves out each face bound to room text until its words come, the sign's figures, and Paused at until paused", () => {
    const { index } = fixture();
    const lines = linesOf(renderTextCopy(page(), index).element);
    const lineEntries = index.copy.filter((e) => ("line" in e && e.line !== "pause.paused_at") || "twin_line" in e);
    const worded = index.faces.filter((f) => faceWords(f, { index, text: null }) !== null);
    expect(lines).toHaveLength(worded.length + index.switches.length + lineEntries.length);
    for (const face of index.faces) {
      const label = index.ui[face.label] ?? "";
      expect(label).not.toBe("");
      const fromText = face.regions.some((r) => "room_text" in r.source || "resume_titles" in r.source);
      expect(
        lines.filter((l) => l.startsWith(`${label}:`)),
        face.id,
      ).toHaveLength(fromText ? 0 : 1);
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
      // Right after the room block, whose last part ends with the conversation panel (spec 005).
      expect(around.previousElementSibling?.matches(".room-block")).toBe(true);
      expect(around.previousElementSibling?.querySelector(".hud-panels > .talk:last-child")).not.toBeNull();
      expect(around.closest(".room-stage")).toBeNull();
      expect(around.closest("[hidden], [inert], [aria-hidden='true']")).toBeNull();
      expect(linesOf(around)).toEqual(inRoom(index, expectedLines(index, "not-live")));
    }
  });

  it("is whole from Enter, while the 3D chunk hasn't loaded and neither drawing is on the stage", async () => {
    const { index } = fixture();
    const v = start({ webgl: true, sceneHangs: true, room: index });
    await flush();
    radio(v.doc, "path", "engineer").click();
    radio(v.doc, "avatar", "dog").click();
    button(v.doc, "Enter").click();
    await flush();
    expect(v.room.visit.stage).toBe("handoff");
    expect(v.doc.querySelector(".flat, canvas")).toBeNull();
    const around = v.doc.querySelector(".room-around");
    expect(linesOf(around ?? v.doc.body)).toEqual(inRoom(index, expectedLines(index, "not-live")));
  });

  it("gives the placeholder words, the UI word standin.note, a line of Around the room only while stand-ins are in use (spec 028)", async () => {
    const { index } = fixture();
    expect(index.build.placeholders).toBe(true);
    for (const placeholders of [true, false]) {
      const v = start({ room: { ...index, build: { ...index.build, placeholders } } });
      await intoRoom(v);
      // Spec 014 (FR-053 to FR-055; plan.md §9): the words are their causes', so with nothing missing there are none.
      // Spec 028 (T-A06): "Around the room"'s line, no longer a stage note.
      const note = v.doc.querySelector('.room-around li[data-line="placeholders"]');
      expect(textOf(note)).toBe(placeholders ? index.ui["standin.note"] : "");
      expect(note === null, String(placeholders)).toBe(!placeholders);
      expect(v.doc.querySelector(".room-note")).toBeNull();
    }
  });
});
