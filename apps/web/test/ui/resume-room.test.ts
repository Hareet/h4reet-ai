// The room with Phase 3's interactive resume (spec 002; T029's view inside T040–T045's room; contracts/room-scene.md
// §1; contracts/room-events.md §1). The room owns the resume's panel, its heading, Escape, focus, and the
// resume_opened event; the view, behind src/room/resume-port.ts's adapter, renders inside it once room-data.json has
// loaded. The adapter loads it once, unhides the view, drops the view's own heading and dialog role, wires its "Close"
// and "Download (PDF)" to the room, passes `room:item-selected` on as item_selected, and never wires the view's own
// openers, so nothing opens or counts twice. Here room-data.json comes from the test, never from the network.
import { describe, expect, it } from "vitest";

import { ABSENT } from "../../src/resume/data";
import { LOAD_FAILED, PDF_HREF } from "../../src/resume/view";
import {
  AI_DISCLOSURE,
  axeViolations,
  button,
  fixtureResume,
  flush,
  intoRoom,
  matchesRule,
  parseCss,
  start,
  stylesheets,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";

const panelOf = (v: Visit): HTMLElement => {
  const el = v.doc.querySelector<HTMLElement>(".resume-panel");
  if (!el) throw new Error("no resume panel");
  return el;
};
const viewOf = (v: Visit): HTMLElement | null => panelOf(v).querySelector<HTMLElement>("[data-resume-panel]");
const firstItem = (): string => fixtureResume().sections[0]?.items[0]?.id ?? "";

async function opened(v: Visit): Promise<void> {
  await intoRoom(v);
  button(v.doc, "Resume").click();
  await flush();
}

describe("the room's resume", () => {
  it("shows the real view in the room's panel, unhidden, after a line while room-data.json loads", async () => {
    const v = start();
    await intoRoom(v);
    button(v.doc, "Resume").click();
    expect(textOf(panelOf(v))).toContain("Loading the resume");
    await flush();
    expect(viewOf(v)?.hidden).toBe(false);
    expect(textOf(panelOf(v))).not.toContain("Loading the resume");
    const ids = [...panelOf(v).querySelectorAll("button[data-item-id]")].map((b) => b.getAttribute("data-item-id"));
    expect(ids).toEqual(fixtureResume().sections[0]?.items.map((i) => i.id));
    expect(ids.length).toBeGreaterThan(0);
  });

  it("frames the view with the room's one heading, in the page's flow, never as a dialog", async () => {
    const v = start();
    await opened(v);
    expect([...panelOf(v).querySelectorAll("h1, h2")].map((h) => textOf(h))).toEqual(["The resume"]);
    expect(panelOf(v).querySelector('[role="dialog"], [aria-modal]')).toBeNull();
    expect(panelOf(v).contains(v.doc.activeElement)).toBe(true);
    // Nothing lays the view over the page or the AI disclosure, which stays in view.
    const view = viewOf(v);
    if (!view) throw new Error("no view");
    for (const rule of stylesheets().flatMap((sheet) => parseCss(sheet.text).rules)) {
      if (!matchesRule(view, rule.selector)) continue;
      expect(rule.declarations.get("position") ?? "static", rule.selector).toMatch(/^(static|relative)$/);
      expect(rule.declarations.has("z-index"), rule.selector).toBe(false);
    }
    expect(textOf(v.doc.body)).toContain(AI_DISCLOSURE);
  });

  it("counts one resume_opened an opening, and passes a selected item on as item_selected", async () => {
    // In 3D, so the event list holds no mode_2d.
    const v = start({ webgl: true });
    await opened(v);
    panelOf(v).querySelector<HTMLButtonElement>(`button[data-item-id="${firstItem()}"]`)?.click();
    expect(v.events).toEqual([
      { kind: "resume_kept" },
      { kind: "resume_opened" },
      { kind: "item_selected", id: firstItem() },
    ]);
  });

  it("passes on only items the manifest lists", async () => {
    const data = fixtureResume();
    data.sections[0]?.items.push({ id: "not-in-the-manifest", text: "An item the manifest doesn't list." });
    const v = start({ resumeData: data });
    await opened(v);
    panelOf(v).querySelector<HTMLButtonElement>('button[data-item-id="not-in-the-manifest"]')?.click();
    expect(v.events.filter((e) => e.kind === "item_selected")).toEqual([]);
  });

  it("loads room-data.json once, however often the resume opens", async () => {
    const v = start();
    await opened(v);
    button(v.doc, "Close").click();
    button(v.doc, "Resume").click();
    button(v.doc, "Resume").click();
    await flush();
    expect(v.resumeLoads()).toBe(1);
    expect(v.events.filter((e) => e.kind === "resume_opened")).toHaveLength(2);
    expect(viewOf(v)?.hidden).toBe(false);
  });

  it("loads room-data.json again after a load that failed, and keeps the one that worked", async () => {
    const v = start({ resumeData: [ABSENT, fixtureResume()] });
    await opened(v);
    expect(textOf(panelOf(v))).toContain(LOAD_FAILED);
    button(v.doc, "Close").click();
    button(v.doc, "Resume").click();
    await flush();
    expect(textOf(panelOf(v))).not.toContain(LOAD_FAILED);
    expect(panelOf(v).querySelectorAll("button[data-item-id]").length).toBeGreaterThan(0);
    button(v.doc, "Close").click();
    button(v.doc, "Resume").click();
    await flush();
    expect(v.resumeLoads()).toBe(2);
  });

  it("closes with the view's Close, and with Escape, focus back on Resume", async () => {
    const v = start();
    await opened(v);
    button(v.doc, "Close").click();
    expect(panelOf(v).hidden).toBe(true);
    expect(v.doc.activeElement).toBe(button(v.doc, "Resume"));
    button(v.doc, "Resume").click();
    await flush();
    panelOf(v)
      .querySelector(`button[data-item-id="${firstItem()}"]`)
      ?.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panelOf(v).hidden).toBe(true);
    expect(v.doc.activeElement).toBe(button(v.doc, "Resume"));
  });

  it("counts the view's PDF link as pdf_downloaded", async () => {
    const v = start();
    await opened(v);
    const pdf = panelOf(v).querySelector<HTMLAnchorElement>("a.resume-pdf");
    expect(pdf?.getAttribute("href")).toBe(PDF_HREF);
    pdf?.click();
    expect(v.events.at(-1)).toEqual({ kind: "pdf_downloaded" });
  });

  it("shows the view's message when room-data.json can't be read, beside the PDF link", async () => {
    const v = start({ resumeData: ABSENT });
    await opened(v);
    expect(textOf(panelOf(v))).toContain(LOAD_FAILED);
    expect(panelOf(v).querySelector("a.resume-pdf")).not.toBeNull();
    expect(panelOf(v).querySelectorAll("button[data-item-id]")).toHaveLength(0);
  });

  it("has 0 axe violations with the resume open, an item selected", async () => {
    const v = start({ webgl: true });
    await opened(v);
    panelOf(v).querySelector<HTMLButtonElement>(`button[data-item-id="${firstItem()}"]`)?.click();
    expect(await axeViolations(v)).toEqual([]);
  });
});
