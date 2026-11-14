// T013 (spec 018; FR-016, FR-017, FR-018): the split layout keeps every way in. axe finds nothing at rest or open; Tab
// walks the toolbar, the list, then the conversation; the decoration is hidden from assistive technology and the
// buttons' names carry their keys; reduced motion has no movement; and the type reflows at 200% zoom and with WCAG
// 1.4.12's spacing, by the table and by the rules' units.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { HUD_PLACEMENTS, splitBoxes } from "../../src/room/compose/hud";
import {
  axeViolations,
  button,
  enter,
  flush,
  nameOf,
  stubViewport,
  start,
  tabOrder,
  throughLoader,
} from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

let composed: ComposeResult | null = null;
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }));
const ready = (): RoomIndex => {
  const index = fixture().index;
  return { ...index, live: { ...index.live, turn: "site" }, topics: index.topics.map((t) => ({ ...t, ready: true })) };
};

async function room(): Promise<Visit> {
  // T024 (plan.md §13): a window the split layout takes by FR-001's rule.
  const viewport = stubViewport({ w: 1920, h: 1080 });
  const v = start({ room: ready(), sendTurn: () => undefined, viewport: viewport.factory });
  await enter(v, "engineer");
  await throughLoader(v);
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
  return v;
}
const openIt = async (v: Visit): Promise<void> => {
  const id = ready().selectables.find((s) => s.action.kind === "talk")?.id ?? "";
  (v.doc.querySelector(`.room-list button[data-object-id="${id}"]`) as HTMLButtonElement).click();
  await flush();
};

describe("the split layout's accessibility (FR-016)", () => {
  it("has no axe violations at rest or open", async () => {
    const v = await room();
    expect(await axeViolations(v)).toEqual([]);
    await openIt(v);
    expect(await axeViolations(v)).toEqual([]);
  });

  it("walks the toolbar, then the list, then the conversation, open or not", async () => {
    const v = await room();
    const where = (el: Element): string =>
      el.closest(".hud-bar") ? "toolbar" : el.closest(".room-list") ? "list" : el.closest(".talk") ? "talk" : "other";
    for (const open of [false, true]) {
      if (open) await openIt(v);
      const order = tabOrder(v.doc)
        .map(where)
        .filter((w, i, all) => w !== all[i - 1]);
      const wanted = ["toolbar", "list", "talk"];
      expect(
        order.filter((w) => wanted.includes(w)),
        open ? "open" : "bar",
      ).toEqual(wanted);
    }
  });

  it("hides the decoration from assistive technology and names the buttons with their keys", async () => {
    const v = await room();
    await openIt(v);
    for (const part of [".split-frame", ".split-emblem", ".split-portrait", ".hud-keycap"])
      for (const el of v.doc.querySelectorAll(part)) expect(el.closest("[aria-hidden='true']"), part).not.toBeNull();
    expect(nameOf(v.doc.querySelector(".split-hint") as Element)).toBe("Close, Escape");
    expect(nameOf(v.doc.querySelector(".split-back") as Element)).toBe("Back, Escape");
    // Every key cap's button names its key, so what is drawn is also said.
    for (const cap of v.doc.querySelectorAll(".split-hint .hud-keycap, .split-back .hud-keycap"))
      expect(nameOf(cap.closest("button") as Element)).toContain("Escape");
  });
});

describe("motion, zoom, and spacing (FR-017, FR-018)", () => {
  const css = readFileSync(fileURLToPath(new URL("../../src/room/hud/split.css", import.meta.url)), "utf8");
  it("moves nothing: every animation is a fade or a stroke's drawing, and only without a reduced-motion ask", () => {
    const animated = [...css.matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1]);
    expect(animated.length).toBeGreaterThan(0);
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\n\}\n/, "");
    expect(outside).not.toMatch(/animation:/);
    expect(css).not.toMatch(/translate|@keyframes[^{]*\{[^}]*transform/);
  });
  it("sizes in rem, so 200% text takes twice the window, and falls back to today's layouts where the half is too small", () => {
    expect(css).not.toMatch(/font-size:\s*[\d.]+px/);
    // At 16px per rem a 200% zoom halves the window in CSS pixels: 1920 × 1080 at 200% is 960 × 540, where FR-001's
    // rule takes no split, so today's column layout reflows it.
    expect(splitBoxes({ w: 1920, h: 1080 })).not.toBeNull();
    expect(splitBoxes({ w: 960, h: 540 })).toBeNull();
    // The table is in rem, so a 32-pixel root at 1920 × 1080 is the same as 960 × 540 at 16.
    expect(
      splitBoxes({ w: 1920, h: 1080 }, undefined, { rem: 32, safe: { top: 0, right: 0, bottom: 0, left: 0 } }),
    ).toBeNull();
    expect(HUD_PLACEMENTS.split.panel.titleRem).toBeGreaterThan(0);
  });
  it("lets the text spacing grow without a fixed height on any text: the rows' heights are minimums or table values", () => {
    expect(css).not.toMatch(/\.split-stat[^{]*\{[^}]*(?<![-\w])height:/);
    const open = /\.talk\[data-panel="open"\] \.talk-log \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(open).not.toBe("");
    expect(open).not.toMatch(/(?<![-\w])height:/);
  });
});

// T027 (B2; FR-014): the title's box sits inside a glass box: the title toggle and the hint are in the title row, which
// has the panel's glass behind it and spans the panel's width at its top.
describe("the title row's glass (T027)", () => {
  it("puts the title and the hint inside the glassed title row", async () => {
    const v = await room();
    await openIt(v);
    const head = v.doc.querySelector('.talk[data-panel="open"] .talk-head') as Element;
    expect(head).not.toBeNull();
    for (const part of [".talk-log-toggle", ".split-hint"]) expect(head.querySelector(part), part).not.toBeNull();
    const css = readFileSync(fileURLToPath(new URL("../../src/room/hud/split.css", import.meta.url)), "utf8");
    const body =
      /html\[data-split="on"\]\[data-hud="column"\] \.talk\[data-panel="open"\] \.talk-head \{([^}]*)\}/.exec(
        css,
      )?.[1] ?? "";
    expect(body).toMatch(/background:\s*rgb\(var\(--glass\) \/ var\(--split-glass-alpha\)\)/);
    expect(body).toMatch(/grid-row:\s*1\b/);
    expect(body).toMatch(/grid-column:\s*1 \/ -1/);
  });
});
