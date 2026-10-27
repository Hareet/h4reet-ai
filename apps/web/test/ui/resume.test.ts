// T025 (spec 002; FR-010, FR-018; contracts/room-scene.md §1 and §5): the interactive resume, in jsdom with axe-core.
// Its items are buttons in lists, each selectable; "Download (PDF)" links the built file; it opens from any control
// marked data-resume-open and closes with "Close" or Escape, focus back on that control. The first screen's PDF link
// is plain HTML, so it works without the room or any script. 0 axe violations.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import axe from "axe-core";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { ABSENT, type RoomResume } from "../../src/resume/data";
import { DRAFT_NOTICE, LOAD_FAILED, PDF_HREF, resumePanel, wireResumeOpeners } from "../../src/resume/view";

const INDEX = fileURLToPath(new URL("../../index.html", import.meta.url));

const DATA: RoomResume = {
  resume_state: "approved",
  header: { name: "Robin", lines: ["Lighthouse keeping by background"] },
  sections: [
    {
      id: "lanterns",
      title: "Lanterns",
      items: [
        { id: "lantern", text: "Designed the lantern service." },
        { id: "service", text: "Kept the lantern service running every night." },
      ],
    },
    { id: "harbor", title: "Harbor", items: [{ id: "tide", text: "Built the tide clock." }] },
  ],
};

function page(body = '<main><h1>The work area</h1><button type="button" data-resume-open>Resume</button></main>') {
  const dom = new JSDOM(`<!doctype html><html lang="en"><head><title>t</title></head><body>${body}</body></html>`, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  return dom;
}

async function axeViolations(dom: JSDOM): Promise<string[]> {
  const win = dom.window as unknown as Window & { eval(code: string): unknown; axe: typeof axe };
  win.eval(axe.source);
  const result = await win.axe.run(win.document, { resultTypes: ["violations"] });
  return result.violations.map((v) => `${v.id}: ${v.help}`);
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function opened(data: RoomResume = DATA) {
  const dom = page();
  const doc = dom.window.document;
  wireResumeOpeners(doc, async () => data);
  const opener = doc.querySelector("[data-resume-open]") as HTMLButtonElement;
  opener.focus();
  opener.click();
  await tick();
  const panel = doc.querySelector<HTMLElement>("[data-resume-panel]");
  if (!panel) throw new Error("no resume panel");
  return { dom, doc, opener, panel };
}

describe("the interactive resume", () => {
  it("shows every item as a button in a list, under its section's heading", () => {
    const doc = page().window.document;
    const panel = resumePanel(doc, DATA);
    const buttons = [...panel.querySelectorAll("ul > li > button[data-item-id]")];
    expect(buttons.map((b) => [b.getAttribute("data-item-id"), b.textContent])).toEqual([
      ["lantern", "Designed the lantern service."],
      ["service", "Kept the lantern service running every night."],
      ["tide", "Built the tide clock."],
    ]);
    for (const b of buttons) expect(b.getAttribute("type")).toBe("button");
    expect([...panel.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Lanterns", "Harbor"]);
    expect(panel.textContent).toContain("Robin");
    expect(panel.textContent).toContain("Lighthouse keeping by background");
  });

  it("links the built PDF as Download (PDF)", () => {
    const panel = resumePanel(page().window.document, DATA);
    const links = [...panel.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toContainEqual(["Download (PDF)", PDF_HREF]);
    expect(PDF_HREF).toBe("./resume.pdf");
  });

  it("makes each item selectable: selecting marks it and tells the room which item it was", async () => {
    const { doc, panel } = await opened();
    const seen: string[] = [];
    doc.addEventListener("room:item-selected", (e) => seen.push((e as CustomEvent<{ id: string }>).detail.id));
    const tide = panel.querySelector('button[data-item-id="tide"]') as HTMLButtonElement;
    tide.click();
    expect(seen).toEqual(["tide"]);
    expect(tide.getAttribute("aria-current")).toBe("true");
    (panel.querySelector('button[data-item-id="lantern"]') as HTMLButtonElement).click();
    expect(tide.hasAttribute("aria-current")).toBe(false);
    expect(seen).toEqual(["tide", "lantern"]);
  });

  it("opens from a data-resume-open control, and closes with Escape, focus back on that control", async () => {
    const { dom, doc, opener, panel } = await opened();
    expect(panel.hidden).toBe(false);
    expect(panel.contains(doc.activeElement)).toBe(true);
    panel.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(doc.activeElement).toBe(opener);
  });

  it("closes with its Close button too, and opens again on the same panel", async () => {
    const { doc, opener, panel } = await opened();
    const close = [...panel.querySelectorAll("button")].find((b) => b.textContent === "Close") as HTMLButtonElement;
    close.click();
    expect(panel.hidden).toBe(true);
    expect(doc.activeElement).toBe(opener);
    opener.click();
    await tick();
    expect(panel.hidden).toBe(false);
    expect(doc.querySelectorAll("[data-resume-panel]")).toHaveLength(1);
  });

  it("has no axe violations, open", async () => {
    const { dom } = await opened();
    expect(await axeViolations(dom)).toEqual([]);
  });
});

describe("a draft resume", () => {
  it("shows the banner above the items when drafts are shown", () => {
    const panel = resumePanel(page().window.document, { ...DATA, resume_state: "draft" });
    expect(panel.querySelector("[data-draft-banner]")?.textContent).toBe(DRAFT_NOTICE);
    expect(panel.querySelectorAll("button[data-item-id]")).toHaveLength(3);
  });

  it("says only that it's a draft when it's withheld, and still links the PDF", async () => {
    const withheld: RoomResume = { resume_state: "withheld", header: null, sections: [] };
    const { dom, panel } = await opened(withheld);
    expect(panel.querySelector("[data-draft-banner]")?.textContent).toBe(DRAFT_NOTICE);
    expect(panel.querySelectorAll("button[data-item-id]")).toHaveLength(0);
    expect([...panel.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain(PDF_HREF);
    expect(await axeViolations(dom)).toEqual([]);
  });
});

describe("opening before room-data.json arrives", () => {
  it("builds one panel for any number of presses while it loads, and that panel closes", async () => {
    const dom = page();
    const doc = dom.window.document;
    let arrive: (data: RoomResume) => void = () => undefined;
    let loads = 0;
    wireResumeOpeners(doc, () => {
      loads++;
      return new Promise<RoomResume>((resolve) => {
        arrive = resolve;
      });
    });
    const opener = doc.querySelector("[data-resume-open]") as HTMLButtonElement;
    opener.focus();
    opener.click();
    opener.click();
    await tick();
    arrive(DATA);
    await tick();
    expect(loads).toBe(1);
    const panels = doc.querySelectorAll<HTMLElement>("[data-resume-panel]");
    expect(panels).toHaveLength(1);
    const panel = panels[0] as HTMLElement;
    expect(panel.hidden).toBe(false);
    panel.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(doc.activeElement).toBe(opener);
  });
});

describe("a resume that couldn't load", () => {
  it("says so, not that it's a draft, and still offers the PDF", async () => {
    const { dom, panel } = await opened(ABSENT);
    expect(panel.querySelector("[data-resume-error]")?.textContent).toBe(LOAD_FAILED);
    expect(panel.querySelector("[data-draft-banner]")).toBeNull();
    expect(panel.querySelectorAll("button[data-item-id]")).toHaveLength(0);
    expect([...panel.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain(PDF_HREF);
    expect(await axeViolations(dom)).toEqual([]);
  });
});

describe("the first screen's PDF link (FR-018)", () => {
  it("is plain HTML to the built file, outside the room, so it works with no script and no room", () => {
    const doc = new JSDOM(readFileSync(INDEX, "utf8")).window.document;
    const link = [...doc.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Download the resume (PDF)");
    expect(link?.getAttribute("href")).toBe(PDF_HREF);
    expect(link?.closest("[hidden], template, noscript, [data-room]")).toBeNull();
  });
});
