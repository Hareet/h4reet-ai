// Spec 033 (User Story 2; FR-006, FR-007, FR-009, FR-010; its Q3 and Q4): the paper in the visitor's hand, at the room.
// The 3D stage reports the held paper as the target ID `held-paper`, the code's own (the hand-off and its paper are
// code, spec 004's FR-008), through the same targeting inputs and the same selection every piece uses (spec 008); the
// room highlights it through the stage, and its selection runs the toolbar's "Resume" handler, so both open the same
// resume, sending `resume_opened` and never `object_selected`. "Resume"'s focus is the paper's keyboard path. Nothing
// happens during the hand-off or once the room is in 2D. Through the room's fake 3D stage (test/helpers/room.ts),
// whose `select` and `target` are the room's own handlers.
import { describe, expect, it } from "vitest";

import { compose } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { HELD_PAPER } from "../../src/room/stage";
import { button, enter, flush, start, stubViewport, throughLoader } from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

const PAPER = "held-paper";

const resumeOpen = (v: Visit): boolean => {
  const panel = v.doc.querySelector(".resume-panel");
  return panel !== null && !panel.hasAttribute("hidden");
};

/** The room in 3D, the hand-off ended, with the stage's options (its select and target handlers). */
async function room3d(): Promise<{ v: Visit; stage: NonNullable<Visit["scene"]["created"][number]> }> {
  const v = start({ webgl: true });
  await enter(v);
  v.clock.advance(5000);
  await flush();
  const stage = v.scene.created[0];
  if (!stage) throw new Error("no 3D stage");
  return { v, stage };
}

describe("the held paper's ID (spec 033)", () => {
  it("is the code's own, held-paper", () => {
    expect(HELD_PAPER).toBe(PAPER);
  });
});

describe("the held paper in the 3D room (spec 033, FR-006, FR-007)", () => {
  it("is targeted by a hovering pointer and a press, and cleared when they name nothing (FR-006)", async () => {
    const { v, stage } = await room3d();
    stage.target?.("pointer", PAPER);
    expect(v.scene.targets.at(-1)).toBe(PAPER);
    stage.target?.("pointer", null);
    expect(v.scene.targets.at(-1)).toBeNull();
    stage.target?.("press", PAPER);
    expect(v.scene.targets.at(-1)).toBe(PAPER);
  });

  it('opens the resume as "Resume" does: the panel, focus on its heading, resume_opened only (FR-007)', async () => {
    const { v, stage } = await room3d();
    stage.target?.("pointer", PAPER);
    stage.select(PAPER);
    await flush();
    expect(resumeOpen(v)).toBe(true);
    expect(v.doc.activeElement?.id).toBe("resume-heading");
    expect(v.events).toEqual([{ kind: "resume_kept" }, { kind: "resume_opened" }]);
    // The selection clears the target in the same call (spec 008, FR-011).
    expect(v.scene.targets.at(-1)).toBeNull();
    // Selected again while it is open: focus on its heading again, and nothing sent.
    stage.select(PAPER);
    expect(v.events).toEqual([{ kind: "resume_kept" }, { kind: "resume_opened" }]);
  });

  it('gives the same events as a press on "Resume" (SC-002)', async () => {
    const a = await room3d();
    a.stage.select(PAPER);
    const b = await room3d();
    button(b.v.doc, "Resume").click();
    expect(a.v.events).toEqual(b.v.events);
  });
});

describe('"Resume", the paper\'s keyboard path (spec 033, FR-009)', () => {
  it("targets the paper while it has focus in 3D, and clears it when focus leaves", async () => {
    const { v } = await room3d();
    const resume = button(v.doc, "Resume");
    resume.focus();
    expect(v.doc.activeElement).toBe(resume);
    expect(v.scene.targets.at(-1)).toBe(PAPER);
    resume.blur();
    expect(v.scene.targets.at(-1)).toBeNull();
  });
});

describe("no paper target or selection where the room doesn't take it (spec 033, FR-010)", () => {
  it("does nothing during the hand-off", async () => {
    const v = start({ webgl: true });
    await enter(v);
    const stage = v.scene.created[0];
    if (!stage) throw new Error("no 3D stage");
    stage.target?.("pointer", PAPER);
    stage.select(PAPER);
    button(v.doc, "Resume").focus();
    expect(v.room.visit.stage).toBe("handoff");
    expect(v.scene.targets).toEqual([]);
    expect(resumeOpen(v)).toBe(false);
    expect(v.events).toEqual([]);
  });

  it("does nothing once the room is in 2D", async () => {
    const { v, stage } = await room3d();
    button(v.doc, "2D view").click();
    expect(v.room.visit.mode).toBe("2d");
    const before = v.events.length;
    stage.select(PAPER);
    expect(resumeOpen(v)).toBe(false);
    expect(v.events.slice(before).map((e) => e.kind)).not.toContain("resume_opened");
  });
});

// The review of 842d8d18, nit 4: the split layout's list marks its selected entry, the piece focused or targeted, else
// the hovered one, else the open conversation's (hud/split.ts). The held paper is no list entry, so its target, by
// "Resume"'s focus or a hover on the paper, never takes that mark from the open conversation's entry.
describe("the held paper and the split layout's list (spec 033, FR-009)", () => {
  it("leaves the open conversation's entry marked while the paper is targeted", async () => {
    const tree = compose(goodTree(), noPolicy(), { mode: "strict", drafts: false }).index;
    const index: RoomIndex = {
      ...tree,
      live: { ...tree.live, turn: "site" },
      topics: tree.topics.map((t) => ({ ...t, ready: true })),
    };
    const viewport = stubViewport({ w: 1920, h: 1080 });
    const v = start({ webgl: true, room: index, viewport: viewport.factory, sendTurn: () => undefined });
    await enter(v, "engineer");
    await throughLoader(v);
    v.clock.advance(5000);
    await flush();
    expect(v.doc.documentElement.getAttribute("data-split")).toBe("on");
    const id = index.selectables.find((s) => s.action.kind === "talk")?.id ?? "";
    const piece = v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${id}"]`);
    if (!piece) throw new Error("no talking piece in the list");
    piece.click();
    await flush();
    expect(piece.getAttribute("aria-current")).toBe("true");
    button(v.doc, "Resume").focus();
    expect(v.scene.targets.at(-1)).toBe(PAPER);
    expect(piece.getAttribute("aria-current"), "while Resume has focus").toBe("true");
    expect(piece.hasAttribute("data-selected"), "its strokes while Resume has focus").toBe(true);
    v.scene.created[0]?.target?.("pointer", PAPER);
    expect(piece.getAttribute("aria-current"), "while the paper is hovered").toBe("true");
  });
});
