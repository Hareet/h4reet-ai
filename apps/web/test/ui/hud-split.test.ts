// Spec 018's split HUD, the panel and the list (T003 starts it: the key cap; T008 to T012, T010 add the rest).
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { keycap } from "../../src/room/hud/keycap";

describe("keycap (T003; FR-013)", () => {
  it("shows its name, hidden from assistive technology, by class only", () => {
    const doc = new JSDOM("<!doctype html><body></body>").window.document;
    const cap = keycap(doc, "Esc");
    expect(cap.textContent).toBe("Esc");
    expect(cap.getAttribute("aria-hidden")).toBe("true");
    expect(cap.className).toBe("hud-keycap");
    expect(cap.getAttribute("style")).toBeNull();
  });
});
