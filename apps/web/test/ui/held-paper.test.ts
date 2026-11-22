// Spec 033 (User Story 2; FR-006, FR-007, FR-009, FR-010; its Q3 and Q4): the paper in the visitor's hand, at the room.
// The 3D stage reports the held paper as the target ID `held-paper`, the code's own (the hand-off and its paper are
// code, spec 004's FR-008), through the same targeting inputs and the same selection every piece uses (spec 008); the
// room highlights it through the stage, and its selection runs the toolbar's "Resume" handler, so both open the same
// resume, sending `resume_opened` and never `object_selected`. "Resume"'s focus is the paper's keyboard path. Nothing
// happens during the hand-off or once the room is in 2D. Through the room's fake 3D stage (test/helpers/room.ts),
// whose `select` and `target` are the room's own handlers.
import { describe, expect, it } from "vitest";

import { HELD_PAPER } from "../../src/room/stage";
import { button, enter, flush, start } from "../helpers/room";
import type { Visit } from "../helpers/room";

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
