// T034 (spec 002; FR-001–FR-004; contracts/room-scene.md §1 and §7; data-model.md §9): the choice of path and avatar.
// Nothing in the room plays until both are chosen and the visitor enters; the AI disclosure and the two links are on
// the screen; a reload is a new visit at the choice; and no cookie, browser storage, or history is touched, from the
// choice to the end of a visit, through spies on every one of them.
import { describe, expect, it } from "vitest";

import {
  AI_DISCLOSURE,
  announcer,
  button,
  enter,
  flush,
  hasButton,
  intoRoom,
  nameOf,
  radio,
  start,
  talkLog,
  textOf,
} from "../helpers/room";

const radios = (doc: Document, group: string): HTMLInputElement[] => [
  ...doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${group}"]`),
];

describe("the choice screen", () => {
  it("asks for a path, engineer or not, and one of intent 000's four placeholder avatars, named, with previews", () => {
    const v = start();
    expect(radios(v.doc, "path").map((r) => [r.value, nameOf(r)])).toEqual([
      ["engineer", "Engineer"],
      ["non-engineer", "Not an engineer"],
    ]);
    expect(radios(v.doc, "avatar").map((r) => [r.value, nameOf(r)])).toEqual([
      ["woman", "Woman"],
      ["man", "Man"],
      ["dinosaur", "Dinosaur"],
      ["dog", "Dog"],
    ]);
    for (const r of radios(v.doc, "avatar")) {
      const preview = r.closest("label")?.querySelector("svg");
      expect(preview, r.value).not.toBeNull();
      expect(preview?.getAttribute("aria-hidden")).toBe("true");
    }
    expect([...v.doc.querySelectorAll("fieldset > legend")].map((l) => textOf(l))).toEqual([
      "Your path",
      "Your avatar",
    ]);
    // Nothing is chosen for the visitor.
    expect([...radios(v.doc, "path"), ...radios(v.doc, "avatar")].some((r) => r.checked)).toBe(false);
  });

  it("keeps Enter disabled until both a path and an avatar are chosen", async () => {
    const v = start();
    await flush();
    const enterButton = button(v.doc, "Enter");
    expect(enterButton.disabled).toBe(true);
    radio(v.doc, "path", "engineer").click();
    expect(enterButton.disabled).toBe(true);
    const other = start();
    radio(other.doc, "avatar", "woman").click();
    expect(button(other.doc, "Enter").disabled).toBe(true);
    radio(v.doc, "avatar", "man").click();
    expect(enterButton.disabled).toBe(false);
  });

  it("plays nothing until both are chosen and Enter is pressed", async () => {
    const v = start({ webgl: true });
    await flush();
    radio(v.doc, "path", "engineer").click();
    const enterButton = button(v.doc, "Enter");
    enterButton.click();
    // Even a click dispatched straight at the disabled button does nothing.
    enterButton.dispatchEvent(new v.win.MouseEvent("click", { bubbles: true }));
    v.clock.advance(10_000);
    expect(v.room.visit.stage).toBe("choosing");
    expect(v.doc.querySelector(".room")).toBeNull();
    expect(v.doc.querySelector("canvas")).toBeNull();
    expect(v.scene.created).toHaveLength(0);
    expect(v.clock.pendingFrames).toBe(0);
    expect(textOf(announcer(v.doc))).toBe("");
    expect(v.events).toEqual([]);
  });

  it("enters with both chosen: the hand-off starts, the choices are kept, and the path can't be changed", async () => {
    const v = start();
    await enter(v, "non-engineer", "dinosaur");
    expect(v.room.visit).toMatchObject({ path: "non-engineer", avatar: "dinosaur", stage: "handoff" });
    expect(radios(v.doc, "path")).toHaveLength(0);
    v.clock.advance(5000);
    button(v.doc, "Keep it for later").click();
    expect(radios(v.doc, "path")).toHaveLength(0);
    expect(radios(v.doc, "avatar")).toHaveLength(0);
    expect(v.room.visit).toMatchObject({ path: "non-engineer", avatar: "dinosaur", stage: "room" });
  });

  it("shows the AI disclosure, the data-flow disclosure link, and the PDF link", () => {
    const v = start();
    expect(textOf(v.doc.body)).toContain(AI_DISCLOSURE);
    const links = [...v.doc.querySelectorAll("#app a")].map((a) => [textOf(a), a.getAttribute("href")]);
    expect(links).toContainEqual(["Download the resume (PDF)", "./resume.pdf"]);
    expect(links).toContainEqual(["How data flows", "./disclosure/"]);
  });

  it("keeps the AI disclosure and the data-flow link in the room", async () => {
    const v = start();
    await intoRoom(v);
    expect(textOf(v.doc.body)).toContain(AI_DISCLOSURE);
    const toolbar = v.doc.querySelector(".room-toolbar");
    expect([...(toolbar?.querySelectorAll("a") ?? [])].map((a) => [textOf(a), a.getAttribute("href")])).toContainEqual([
      "How data flows",
      "./disclosure/",
    ]);
  });

  it("downloads the PDF from the choice screen without entering the room", () => {
    const v = start();
    const pdf = [...v.doc.querySelectorAll<HTMLAnchorElement>("#app a")].find(
      (a) => textOf(a) === "Download the resume (PDF)",
    );
    expect(pdf?.hasAttribute("download")).toBe(true);
    pdf?.click();
    expect(v.events).toEqual([{ kind: "pdf_downloaded" }]);
    expect(v.room.visit.stage).toBe("choosing");
  });

  it("writes no cookie, browser storage, history, or URL through a whole visit", async () => {
    const v = start();
    const href = v.win.location.href;
    const length = v.win.history.length;
    await intoRoom(v);
    // Every button of the "In the room" list, whatever the room's data names them (spec 004, FR-006).
    const list = [...v.doc.querySelectorAll("section")].find((s) => nameOf(s) === "In the room");
    const objects = [...(list?.querySelectorAll("button") ?? [])];
    expect(objects.length).toBeGreaterThan(0);
    for (const object of objects) object.click();
    const text = v.doc.querySelector<HTMLInputElement>("#talk-text");
    if (text) text.value = "hello";
    button(v.doc, "Send").click();
    button(v.doc, "Hold to talk").click();
    button(v.doc, "Resume").click();
    v.doc.activeElement?.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    button(v.doc, "2D view").click();
    v.clock.advance(60_000);
    expect(textOf(talkLog(v.doc))).not.toBe("");
    expect(v.spies.storage).toEqual([]);
    expect(v.spies.history).toEqual([]);
    expect(v.win.location.href).toBe(href);
    expect(v.win.history.length).toBe(length);
  });

  it("starts a new visit at the choice on reload, and the hand-off plays again", async () => {
    const first = start();
    await intoRoom(first);
    // A reload is a new page: nothing carries over, because nothing was kept anywhere.
    const second = start();
    expect(second.room.visit).toMatchObject({ stage: "choosing", path: null, avatar: null, resumeKept: false });
    expect([...radios(second.doc, "path"), ...radios(second.doc, "avatar")].some((r) => r.checked)).toBe(false);
    expect(hasButton(second.doc, "Resume")).toBe(false);
    await enter(second);
    expect(second.room.visit.stage).toBe("handoff");
    expect(textOf(announcer(second.doc))).toContain("hands you a paper");
  });
});
