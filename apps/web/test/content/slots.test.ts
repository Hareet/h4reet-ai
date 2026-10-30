// T022 (spec 002; FR-014; contracts/resume-source.md §2): facts slots in the display text. A filled, public-safe
// slot renders its phrasing with the value; an empty one, or one whose value isn't public-safe, renders its fallback
// or nothing. Nothing is ever estimated: no value appears that a slot doesn't hold as public-safe.
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { fillSlots, parseResume, readFacts, renderResume } from "../../build/content";

const ROOT = fileURLToPath(new URL("../fixtures", import.meta.url));
const facts = readFacts(ROOT);

describe("a slot reference", () => {
  it("renders a filled, public-safe slot's phrasing with its value", () => {
    expect(fillSlots("Designed the lantern service.{{slot:fixture.lanterns}}", facts)).toBe(
      "Designed the lantern service. It lights 12 lanterns.",
    );
  });

  it("renders nothing for an empty slot, and collapses the space it leaves", () => {
    expect(fillSlots("Covers the coast.{{slot:fixture.empty}}", facts)).toBe("Covers the coast.");
    expect(fillSlots("Covers {{slot:fixture.empty}} the coast.", facts)).toBe("Covers the coast.");
  });

  it("renders an empty slot's declared fallback, in the corpus's form or the contract's", () => {
    expect(fillSlots("Covers {{slot:fixture.empty | else: some coves}}.", facts)).toBe("Covers some coves.");
    expect(fillSlots("Covers {{slot:fixture.empty | fallback: some coves}}.", facts)).toBe("Covers some coves.");
  });

  it("never renders a value that isn't public-safe, only its fallback or nothing", () => {
    expect(fillSlots("Counts.{{slot:fixture.unsafe}}", facts)).toBe("Counts.");
    expect(fillSlots("Counts {{slot:fixture.unsafe | else: privately}}.", facts)).toBe("Counts privately.");
  });

  it("renders a filled slot's phrasing, not its fallback, when it has a value", () => {
    expect(fillSlots("Lights.{{slot:fixture.lanterns | else: some lanterns}}", facts)).toBe(
      "Lights. It lights 12 lanterns.",
    );
  });
});

describe("the rendered resume", () => {
  it("fills the slots of the header's lines and every item, and keeps the source's order", () => {
    const doc = {
      version: 1,
      header: {
        room: {
          name: "Robin",
          lines: [
            {
              text: "Lighthouse keeping by background.{{slot:fixture.empty}}",
              claims: [{ file: "corpus/01-fixture.md", quote: "Robin's background is lighthouse keeping" }],
              slots: ["fixture.empty"],
            },
          ],
        },
      },
      sections: [
        {
          id: "work",
          title: "Work",
          items: [
            {
              id: "lantern",
              text: "Designed the lantern service.{{slot:fixture.lanterns}}",
              claims: [{ file: "corpus/01-fixture.md", quote: "Robin designed the lantern service" }],
              slots: ["fixture.lanterns"],
            },
            {
              id: "tide",
              text: "Built the tide clock.",
              claims: [{ file: "corpus/01-fixture.md", quote: "Robin built the tide clock" }],
              slots: [],
            },
          ],
        },
      ],
    };
    expect(renderResume(parseResume(stringify(doc)), facts)).toEqual({
      header: { name: "Robin", lines: ["Lighthouse keeping by background."] },
      sections: [
        {
          id: "work",
          title: "Work",
          items: [
            { id: "lantern", text: "Designed the lantern service. It lights 12 lanterns." },
            { id: "tide", text: "Built the tide clock." },
          ],
        },
      ],
    });
  });
});
