// T-B08 (spec 028; FR-027; SC-006; User Story 5's scenarios 2 and 3; plan.md R-B7): a dog visitor's introduction, his
// words from the index's `dog_visitor_intro`, shown once a visit at the hand-off's end: in 3D in the stage's bubble over
// the twin (`Stage3D.say`) and in the polite live region; in the 2D room in the live region. Nothing enters the
// conversation's log, no turn is sent, nothing leaves; with the slot null, or another avatar chosen, nothing.
import { describe, expect, it } from "vitest";

import type { Stage3D } from "../../src/room/stage";
import type { SendTurn } from "../../src/talk/talk";
import { announcer, enter, flush, roomIndex, start, talkLog, textOf, throughLoader } from "../helpers/room";
import type { Visit } from "../helpers/room";

const LINE = "A made-up sentence for the tests, never the Author's.";

function visit(o: { line: string | null; webgl: boolean }): { v: Visit; said: string[]; turns: number[] } {
  const turns: number[] = [];
  const sendTurn: SendTurn = () => void turns.push(1);
  const v = start({ webgl: o.webgl, room: { ...roomIndex(), dog_visitor_intro: o.line }, sendTurn });
  const said: string[] = [];
  v.scene.onCreate = () => {
    const stage = v.scene.stage as (Stage3D & { say?: (text: string, seconds?: number) => void }) | null;
    if (stage) stage.say = (text) => void said.push(text);
  };
  return { v, said, turns };
}

/** The whole arrival to the hand-off's end, and the live region's words on each step. */
async function arrive(v: Visit, avatar: string): Promise<string[]> {
  const heard: string[] = [];
  await enter(v, "non-engineer", avatar);
  await throughLoader(v);
  for (let t = 0; t < 6000; t += 100) {
    v.clock.advance(100);
    await flush();
    const now = textOf(announcer(v.doc));
    if (heard.at(-1) !== now) heard.push(now);
  }
  return heard;
}

describe("a dog visit's introduction (FR-027)", () => {
  it("in 3D: the bubble over the twin once, and the live region once, at the hand-off's end", async () => {
    const { v, said, turns } = visit({ line: LINE, webgl: true });
    const log = (): number => talkLog(v.doc).children.length;
    const before = log();
    const heard = await arrive(v, "dog");
    expect(said).toEqual([LINE]);
    expect(heard.filter((h) => h.includes(LINE))).toHaveLength(1);
    expect(log()).toBe(before);
    expect(turns).toEqual([]);
    expect(v.spies.network).toEqual([]);
  });

  it("in the 2D room: the live region once, and no bubble", async () => {
    const { v, said, turns } = visit({ line: LINE, webgl: false });
    const heard = await arrive(v, "dog");
    expect(said).toEqual([]);
    expect(heard.filter((h) => h.includes(LINE))).toHaveLength(1);
    expect(turns).toEqual([]);
  });

  it("says nothing with the slot null", async () => {
    const { v, said } = visit({ line: null, webgl: true });
    const heard = await arrive(v, "dog");
    expect(said).toEqual([]);
    expect(heard.some((h) => h.includes(LINE))).toBe(false);
  });

  it.each(["woman", "man", "dinosaur"])("says nothing for the %s", async (avatar) => {
    const { v, said } = visit({ line: LINE, webgl: true });
    const heard = await arrive(v, avatar);
    expect(said).toEqual([]);
    expect(heard.some((h) => h.includes(LINE))).toBe(false);
  });
});
