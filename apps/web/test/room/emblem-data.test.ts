// verify-018 (D-V3; spec 018's FR-005, spec 002's FR-007): the conversation panel's emblem is named by the room's data,
// not keyed by the selectable's ID in the room's code. A selectable may carry `emblem`, a name hud/icons.ts draws; the
// index carries it to the room; a selectable without one, or with a name icons.ts doesn't draw, has the speech glyph.
// Every piece of the committed scene has an emblem icons.ts draws, so FR-005's "the open piece's icon" holds for each.
import { describe, expect, it } from "vitest";

import { compose, formatFinding } from "../../build/room/compose";
import { readRoomPolicy } from "../../build/room/policy";
import { fileTree } from "../../build/room/source";
import { EMBLEM_ICONS, emblemIcon, SPEECH_ICON } from "../../src/room/hud/icons";
import { REPO } from "../helpers/room";

const policy = readRoomPolicy({ env: process.env, root: REPO });
const base = compose(fileTree(REPO), policy, { mode: "strict", drafts: true });

describe("the emblem, named by the room's data (verify-018; FR-005, spec 002's FR-007)", () => {
  it("composes the committed room with no finding", () => {
    expect(base.findings.map((f) => formatFinding(f))).toEqual([]);
  });

  it("gives every piece of the committed scene an emblem icons.ts draws, each its own", () => {
    const talk = base.index.selectables.filter((s) => s.action.kind === "talk");
    expect(talk.length).toBeGreaterThan(0);
    const names = talk.map((s) => s.emblem);
    for (const [k, n] of names.entries()) expect(n && n in EMBLEM_ICONS, talk[k]?.id).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("draws an emblem by its name, and the speech glyph for none or for a name it doesn't draw", () => {
    for (const [n, d] of Object.entries(EMBLEM_ICONS)) expect(emblemIcon(n)).toEqual({ name: n, d });
    expect(emblemIcon(null)).toEqual({ name: "speech", d: SPEECH_ICON });
    expect(emblemIcon("zz-not-an-emblem")).toEqual({ name: "speech", d: SPEECH_ICON });
  });
});
