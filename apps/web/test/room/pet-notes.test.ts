// T010 (spec 026; FR-024, FR-026, SC-006; Q142, the named deviation; plan.md R-10, R-11): the petting told and logged.
// The director says the line once when a petting starts, never for a skipped one; it gives the frame log one `twin-pet`
// record per petting, done, cut, or skipped, with its start, end, path, and outcome and nothing else; and it sends no
// usage event: it has no emitter to send one through, and config/room-events.yaml names none for it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { PetRecord } from "../../src/room/scene/pet";
import { createFrameLog } from "../../src/room/signals/frame-log";
import { UI_KEYS, uiWord } from "../../src/room/ui-keys";
import { petWorld } from "../helpers/pet-fakes";
import type { PetWorld } from "../helpers/pet-fakes";
import { FakeClock, REPO, repositoryBundle } from "../helpers/room";

const LINE = "The twin pets the dog.";

/** A world whose director says its line and logs its records here. */
function told(
  over: Parameters<typeof petWorld>[0] = {},
): PetWorld & { readonly out: { notes: number; records: PetRecord[] } } {
  const out = { notes: 0, records: [] as PetRecord[] };
  const w = petWorld({
    ...over,
    extra: { note: () => (out.notes += 1), log: (r: PetRecord) => out.records.push(r) },
  });
  return Object.assign(w, { out });
}

describe("the line (FR-024; SC-006)", () => {
  it("is said once when a petting starts, and not again as it goes on and ends", () => {
    const w = told();
    w.pet.select("dog");
    expect(w.out.notes).toBe(1);
    w.run(0.4 + 3.5 + 1);
    expect(w.out.notes).toBe(1);
  });

  it("is never said for a skipped one: under way, in the cooldown, or with the conditions unmet", () => {
    const w = told();
    w.pet.select("dog");
    w.pet.select("dog");
    w.run(0.4 + 3.5 + 1);
    w.pet.select("dog");
    expect(w.out.notes).toBe(1);
    const still = told();
    still.motion = { ...still.motion, animate: false };
    still.pet.select("dog");
    expect(still.out.notes).toBe(0);
  });

  it("is a UI word with no slots, the shipped words'", () => {
    expect((UI_KEYS as Record<string, readonly string[]>)["figures.pet_note"]).toEqual([]);
    expect(uiWord(repositoryBundle().index.ui, "figures.pet_note" as keyof typeof UI_KEYS)).toBe(LINE);
  });
});

describe("the frame log's twin-pet record (FR-026)", () => {
  it("is one per petting that ends done: start, end, path, outcome, nothing else", () => {
    const w = told();
    w.run(1);
    const start = w.clock.now();
    w.pet.select("dog");
    w.run(0.4 + 3.5 + 1);
    expect(w.out.records).toHaveLength(1);
    const [r] = w.out.records as [PetRecord];
    expect(Object.keys(r).sort()).toEqual(["end_ms", "outcome", "path", "start_ms"]);
    expect(r).toMatchObject({ start_ms: start, path: "reach", outcome: "done" });
    expect(r.end_ms).toBeGreaterThan(start + 3500);
    expect(r.end_ms).toBeLessThan(start + 3500 + 500);
  });

  it("takes the clip's path, and a cut", () => {
    const w = told({ twin: { petting_s: 2 } });
    w.pet.select("dog");
    w.run(0.4 + 1);
    w.running = true;
    w.run(0.5);
    expect(w.out.records).toEqual([expect.objectContaining({ path: "clip", outcome: "cut" })]);
  });

  it("logs a cut at once, and a skipped selection, start and end the same", () => {
    const w = told();
    w.pet.select("dog");
    w.run(0.4 + 1);
    w.motion = { ...w.motion, level: 1 };
    w.run(0.1);
    expect(w.out.records.map((r) => r.outcome)).toEqual(["cut"]);
    w.motion = { ...w.motion, level: 0 };
    const at = w.clock.now();
    w.pet.select("dog"); // in the cooldown
    expect(w.out.records.at(-1)).toEqual({ start_ms: at, end_ms: at, path: "reach", outcome: "skipped" });
    expect(w.out.notes).toBe(1);
  });

  it("logs nothing for another piece's selection", () => {
    const w = told();
    w.pet.select("snowboard");
    expect(w.out.records).toEqual([]);
  });

  it("is a kind the frame log takes, hyphenated as twin-state is", () => {
    const clock = new FakeClock();
    const log = createFrameLog({ clock, wall: () => 0, origin: "http://localhost" });
    log.record("twin-pet", { start_ms: 0, end_ms: 3500, path: "reach", outcome: "done" });
    const json = JSON.parse(log.json()) as { entries: Array<{ event: string }> };
    expect(json.entries.map((e) => e.event)).toEqual(["twin-pet"]);
  });
});

describe("no usage event (Q142, the named deviation; R-11)", () => {
  it("has no emitter among the director's inputs, and room-events.yaml names nothing for the petting", () => {
    const w = told();
    w.pet.select("dog");
    w.run(0.4 + 3.5 + 1);
    const events = readFileSync(join(REPO, "config/room-events.yaml"), "utf8");
    expect(events).not.toMatch(/pet/i);
  });
});
