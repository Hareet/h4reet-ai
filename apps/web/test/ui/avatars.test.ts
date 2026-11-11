// T013 and T014 (spec 009; FR-001, FR-002, FR-004, FR-007, FR-010, FR-013, FR-029, FR-030, FR-032, FR-033, FR-035;
// plan.md R-13, R-14; SC-002, SC-003, SC-004, SC-011, SC-012): the room's screens in jsdom with the stand-in 3D chunk
// (test/helpers/room.ts), which records the options the room gives its stage, so a test reports the stage's figure
// signals as the real stage would (src/room/scene/avatars.ts).
// - The stand-in line, the UI word twin.stand_in, in the stage's note and first in "Around the room", in 3D and in 2D,
//   as text a screen reader reads; spec 003's likeness line nowhere; the AI disclosure as it was; the note passing a tap
//   to the stage, and taking no room in the layout; axe with the line shown.
// - avatar_failed: once a visit, with no identifier, on the first figure file that failed after its retry; never for
//   a skip, a missing file, the floor, or a room in 2D; and no avatar file requested in a visit in 2D from the start.
// - The drafts build's frame log: the figures' picture and clip changes; a release build keeps no log.
// - Degraded (T014): with the live source off, the tier unknown, and the kill switch stubbed degraded, the stage is made
//   for the avatars as always, and with an avatar failed the room stays usable, the list selecting every piece.
// Kept in a file of its own beside live.test.ts and degraded.test.ts, which spec 008 also extends (plan.md §10).
import { describe, expect, it } from "vitest";

import type { FrameLogEntry } from "../../src/room/signals/frame-log";
import { createFrameLog } from "../../src/room/signals/frame-log";
import type { FigureSignal } from "../../src/room/stage";
import {
  AI_DISCLOSURE,
  axeViolations,
  button,
  enter,
  flush,
  intoRoom,
  matchesRule,
  parseCss,
  roomIndex,
  start,
  stylesheets,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";

const STAND_IN = "The twin's figure is a stand-in, not the Author's likeness.";
/** Spec 003's FR-034 line, which would call the figure a likeness of the Author: never shown for a stand-in. */
const LIKENESS = "stylized likeness of the Author";

/** Reports a figure signal as the 3D stage would, through the options the room gave it. */
function signal(v: Visit, s: FigureSignal): void {
  const options = v.scene.created.at(-1);
  if (!options) throw new Error("no 3D stage was made");
  options.onFigure?.(s);
}

const standInLine = (v: Visit): HTMLElement | null => v.doc.querySelector<HTMLElement>(".room-stand-in");
const aroundLines = (v: Visit): string[] => [...v.doc.querySelectorAll(".room-around li")].map((li) => textOf(li));

describe("the stand-in line (FR-013, FR-029, FR-030; R-13; SC-003)", () => {
  it("is the UI word twin.stand_in, and the twin's line slot is first in the index's copy", () => {
    // Spec 016 (FR-014; changed with T017, plan.md R-18): the slot, which shows this line while the twin shows anything
    // but its own picture.
    const index = roomIndex();
    expect(index.ui["twin.stand_in"]).toBe(STAND_IN);
    expect(index.copy[0]).toEqual({ twin_line: true });
  });

  it("shows in the stage's note and first in Around the room in 3D, as text a screen reader reads", async () => {
    const v = start({ webgl: true });
    await enter(v, "engineer", "woman");
    expect(v.room.visit.mode).toBe("3d");
    const line = standInLine(v);
    expect(textOf(line)).toBe(STAND_IN);
    expect(line?.hasAttribute("hidden")).toBe(false);
    expect(line?.closest("[aria-hidden='true'], [hidden], .visually-hidden")).toBeNull();
    expect(line?.closest(".room-stage")).not.toBeNull();
    expect(aroundLines(v)[0]).toBe(STAND_IN);
    expect(v.doc.body.textContent).toContain(AI_DISCLOSURE);
    expect(v.doc.body.textContent).not.toContain(LIKENESS);
  });

  it("gives way in 2D to the twin's line once its still shows, from the start and after the visitor's switch", async () => {
    // Spec 016 (FR-014, FR-034; changed with T050, plan.md R-18): the 2D room shows the twin's still, its own
    // picture, so the slot says the twin's line once the still has loaded; the stand-in line until then.
    const own = roomIndex().twin?.line ?? "";
    const settle = async (x: Visit): Promise<void> => {
      for (let i = 0; i < 40 && textOf(standInLine(x)) !== own; i += 1) await flush();
    };
    const flat = start({ webgl: false });
    await enter(flat, "engineer", "woman");
    expect(flat.room.visit.mode).toBe("2d");
    await settle(flat);
    expect(flat.spies.assets.filter((a) => a.includes("twin-still"))).toHaveLength(1);
    expect(textOf(standInLine(flat))).toBe(own);
    expect(aroundLines(flat)[0]).toBe(own);
    const v = start({ webgl: true });
    await intoRoom(v);
    expect(textOf(standInLine(v))).toBe(STAND_IN);
    button(v.doc, "2D view").click();
    await flush();
    expect(v.room.visit.mode).toBe("2d");
    await settle(v);
    expect(textOf(standInLine(v))).toBe(own);
    expect(v.doc.body.textContent).toContain(AI_DISCLOSURE);
  });

  it("keeps the placeholder note its own paragraph beside it, shown only while stand-ins are in use", async () => {
    const index = roomIndex();
    for (const placeholders of [true, false]) {
      const v = start({ room: { ...index, build: { ...index.build, placeholders } } });
      await intoRoom(v);
      const notes = [...v.doc.querySelectorAll(".room-notes > p")];
      expect(notes.map((p) => p.classList.contains("room-stand-in"))).toEqual([false, true]);
      expect(notes[0]?.hasAttribute("hidden")).toBe(!placeholders);
      expect(notes[1]?.hasAttribute("hidden")).toBe(false);
    }
  });

  it("lets a pointer or a touch pass through the note to the scene, and takes no room in the layout", () => {
    const rules = stylesheets().flatMap((s) => parseCss(s.text).rules);
    const v = start({ webgl: true });
    const probe = v.doc.createElement("div");
    probe.className = "room-notes";
    const declared = (property: string): string | undefined =>
      rules
        .filter((r) => matchesRule(probe, r.selector))
        .find((r) => r.declarations.has(property))
        ?.declarations.get(property);
    expect(declared("pointer-events")).toBe("none");
    expect(declared("position")).toBe("absolute");
  });

  it("passes axe with the line shown", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    expect(textOf(standInLine(v))).toBe(STAND_IN);
    expect(await axeViolations(v)).toEqual([]);
  });
});

describe("avatar_failed (FR-032, FR-033; R-14; SC-011)", () => {
  it("is sent once a visit, with no identifier, on the first figure file that failed after its retry", async () => {
    const v = start({ webgl: true });
    await enter(v, "engineer", "woman");
    signal(v, { kind: "failed" });
    signal(v, { kind: "failed" });
    signal(v, { kind: "picture", figure: "twin", shows: "fallback", why: "failed" });
    expect(v.events.filter((e) => e.kind === "avatar_failed")).toEqual([{ kind: "avatar_failed" }]);
  });

  it("is never sent for a skip, a missing file, the floor, a room in 2D, or an avatar shown", async () => {
    const v = start({ webgl: true });
    await enter(v, "engineer", "woman");
    for (const why of ["skipped", "no-file", "floor", "2d", "late"] as const)
      signal(v, { kind: "picture", figure: "visitor", shows: "fallback", why });
    signal(v, { kind: "picture", figure: "visitor", shows: "avatar", why: null });
    signal(v, { kind: "clip", figure: "visitor", role: "idle" });
    expect(v.events.filter((e) => e.kind === "avatar_failed")).toEqual([]);
    const flat = start({ webgl: false });
    await intoRoom(flat);
    expect(flat.scene.created).toEqual([]);
    expect(flat.events.filter((e) => e.kind === "avatar_failed")).toEqual([]);
  });

  it("requests no avatar file in a visit in 2D from the start", async () => {
    const v = start({ webgl: false });
    await intoRoom(v);
    expect(v.spies.network.filter((url) => /(^|\/)a\//.test(url))).toEqual([]);
  });
});

describe("the frame log's figures (FR-035)", () => {
  it("records each figure's picture change and clip in a drafts build, in page memory", async () => {
    const v = start({ webgl: true, frameLog: (o) => createFrameLog(o) });
    await enter(v, "engineer", "woman");
    signal(v, { kind: "picture", figure: "visitor", shows: "avatar", why: null });
    signal(v, { kind: "picture", figure: "twin", shows: "fallback", why: "no-file" });
    signal(v, { kind: "clip", figure: "visitor", role: "idle-holding" });
    const log = JSON.parse((v.win as unknown as { h4FrameLog(): string }).h4FrameLog()) as {
      entries: FrameLogEntry[];
    };
    const figures = log.entries.filter((e) => e.event === "figure" || e.event === "clip");
    expect(figures.map(({ event, figure, shows, why, role }) => ({ event, figure, shows, why, role }))).toEqual([
      { event: "figure", figure: "visitor", shows: "avatar", why: null, role: undefined },
      { event: "figure", figure: "twin", shows: "fallback", why: "no-file", role: undefined },
      { event: "clip", figure: "visitor", shows: undefined, why: undefined, role: "idle-holding" },
    ]);
  });

  it("keeps no log in a release build", async () => {
    const v = start({ webgl: true });
    await enter(v, "engineer", "woman");
    signal(v, { kind: "picture", figure: "visitor", shows: "avatar", why: null });
    expect((v.win as unknown as { h4FrameLog?: unknown }).h4FrameLog).toBeUndefined();
  });

  // T072 (spec 016; FR-052; contracts/twin-states.md §7): the twin's pictures (its own model, its still, its drawing),
  // its state changes, and its clips, in page memory, in a drafts build only.
  it("records the twin's pictures, states, and clips in a drafts build (spec 016, FR-052)", async () => {
    const v = start({ webgl: true, frameLog: (o) => createFrameLog(o) });
    await enter(v, "engineer", "woman");
    signal(v, { kind: "picture", figure: "twin", shows: "own", why: null });
    signal(v, { kind: "twin-state", state: "arriving", role: "greeting" });
    signal(v, { kind: "clip", figure: "twin", role: "greeting" });
    signal(v, { kind: "picture", figure: "twin", shows: "still", why: null });
    const log = JSON.parse((v.win as unknown as { h4FrameLog(): string }).h4FrameLog()) as {
      entries: (FrameLogEntry & { state?: string })[];
    };
    const twin = log.entries.filter((e) => ["figure", "clip", "twin-state"].includes(e.event));
    expect(twin.map(({ event, figure, shows, state, role }) => ({ event, figure, shows, state, role }))).toEqual([
      { event: "figure", figure: "twin", shows: "own", state: undefined, role: undefined },
      { event: "twin-state", figure: undefined, shows: undefined, state: "arriving", role: "greeting" },
      { event: "clip", figure: "twin", shows: undefined, state: undefined, role: "greeting" },
      { event: "figure", figure: "twin", shows: "still", state: undefined, role: undefined },
    ]);
  });

  it("keeps no log of the twin in a release build", async () => {
    const v = start({ webgl: true });
    await enter(v, "engineer", "woman");
    signal(v, { kind: "twin-state", state: "resting", role: "desk-lean" });
    expect((v.win as unknown as { h4FrameLog?: unknown }).h4FrameLog).toBeUndefined();
  });
});

describe("degraded (FR-001, FR-002, FR-007; SC-002)", () => {
  it("makes the 3D stage for the avatars as always with the live source off, and the chosen avatar its own", async () => {
    const index = roomIndex();
    expect(index.live.source).toBe("off");
    const v = start({ webgl: true, room: { ...index, live: { ...index.live, source: "off", turn: "off" } } });
    await enter(v, "engineer", "woman");
    expect(v.scene.created).toHaveLength(1);
    expect(v.scene.created[0]?.avatar).toBe("woman");
    expect(typeof v.scene.created[0]?.onFigure).toBe("function");
  });

  it("stays usable with an avatar failed: the disclosure and the stand-in line visible, the list selecting every piece", async () => {
    const v = start({ webgl: true });
    await intoRoom(v);
    signal(v, { kind: "failed" });
    signal(v, { kind: "picture", figure: "twin", shows: "fallback", why: "failed" });
    expect(v.doc.body.textContent).toContain(AI_DISCLOSURE);
    expect(textOf(standInLine(v))).toBe(STAND_IN);
    const index = roomIndex();
    const before = v.events.length;
    for (const s of index.selectables)
      v.doc.querySelector<HTMLButtonElement>(`.room-list button[data-object-id="${s.id}"]`)?.click();
    expect(
      v.events
        .slice(before)
        .filter((e) => e.kind === "object_selected")
        .map((e) => e.id),
    ).toEqual(index.selectables.map((s) => s.id));
    // Nothing went to the network for the failure: the event rides the room's EventSink alone.
    expect(v.spies.network).toEqual([]);
  });
});

// T024's line rule (spec 016; FR-014; contracts/twin-states.md §4; SC-003): one slot, the stage's note's second
// paragraph and the text copy's first line, saying the twin's line, read from main's approval, while and only while the
// twin's own picture shows, and the stand-in line otherwise; never both, nor neither; in place, in no live region.
describe("the twin's line slot (spec 016, FR-014; SC-003)", () => {
  const TWIN_LINE = roomIndex().twin?.line ?? "";

  it("is bundled: the index carries the twin's line, which the page shows nowhere before its picture does", async () => {
    expect(TWIN_LINE).not.toBe("");
    expect(TWIN_LINE).not.toBe(STAND_IN);
    const v = start({ webgl: true });
    await enter(v, "engineer", "woman");
    expect(textOf(standInLine(v))).toBe(STAND_IN);
    expect(v.doc.body.textContent).not.toContain(TWIN_LINE);
  });

  it("says the twin's line while its own model shows, and the stand-in line again when it falls back", async () => {
    const v = start({ webgl: true });
    await enter(v, "engineer", "woman");
    const note = standInLine(v);
    signal(v, { kind: "picture", figure: "twin", shows: "own", why: null });
    expect(textOf(standInLine(v))).toBe(TWIN_LINE);
    expect(standInLine(v)).toBe(note);
    expect(aroundLines(v)[0]).toBe(TWIN_LINE);
    expect(aroundLines(v)).not.toContain(STAND_IN);
    expect(note?.closest("[aria-live]")).toBeNull();
    signal(v, { kind: "picture", figure: "twin", shows: "fallback", why: "failed" });
    expect(textOf(standInLine(v))).toBe(STAND_IN);
    expect(aroundLines(v)[0]).toBe(STAND_IN);
    expect(aroundLines(v)).not.toContain(TWIN_LINE);
    // The stand-in avatar in the twin's figure keeps the stand-in line.
    signal(v, { kind: "picture", figure: "twin", shows: "avatar", why: null });
    expect(textOf(standInLine(v))).toBe(STAND_IN);
  });

  it("says the twin's line while its 2D still shows, and the stand-in line with its drawing", async () => {
    const v = start({ webgl: true });
    await enter(v, "engineer", "woman");
    signal(v, { kind: "picture", figure: "twin", shows: "still", why: null });
    expect(textOf(standInLine(v))).toBe(TWIN_LINE);
    signal(v, { kind: "picture", figure: "twin", shows: "drawing", why: "failed" });
    expect(textOf(standInLine(v))).toBe(STAND_IN);
  });

  it("ignores the visitor's figure's pictures", async () => {
    const v = start({ webgl: true });
    await enter(v, "engineer", "woman");
    signal(v, { kind: "picture", figure: "visitor", shows: "avatar", why: null });
    expect(textOf(standInLine(v))).toBe(STAND_IN);
  });
});
