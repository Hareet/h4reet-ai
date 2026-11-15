// T180 (spec 004; FR-034, FR-063, SC-008): "Around the room" holds what the room draws, from the renderers' own word
// lists, so the 3D room, the 2D room, and the text copy can't differ: each bound face's label and words; the monitor's
// note that it is a scripted illustration (around.illustration); the laptop's state; the neon sign's word, labels,
// readings, and second line; and the line saying the project isn't affiliated with or endorsed by Langfuse or its
// owner. Each face's entry equals the 2D drawing's words for it and the 3D faces' display list. The fixture set's IDs
// are synthetic fx- ones; the repository's neon sign gives the real words.
// T264 (spec 004; FR-034, FR-050, FR-063; contracts/turn-cost.md §8): the neon sign's counters follow the room's cost
// channel. In every reading of a run of turns through the twin's sender, each counter's entry equals its face's word
// list from the channel's state and the 2D drawing's words; "est." is marked up as an abbreviation of "estimated"; a
// badge is in brackets; nothing is in a live region, in the talk panel's log, or announced.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { Object3D } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compose } from "../../build/room/compose";
import type { ComposeResult } from "../../build/room/compose";
import { noPolicy } from "../../build/room/policy";
import type { RoomIndex } from "../../src/room/compose/bundle";
import { drawnWords } from "../../src/room/faces/display-list";
import { faceWords, roomTextOf } from "../../src/room/faces/words";
import type { TurnResult } from "../../src/room/signals/turn-cost";
import type { TurnRequest } from "../../src/talk/talk";
import type { RoomText } from "../../src/room/faces/words";
import { buildRoom } from "../../src/room/scene/bundle3d";
import { buildFaceQuads } from "../../src/room/scene/faces3d";
import {
  FakeClock,
  announcer,
  flush,
  intoRoom,
  parseCss,
  repositoryBundle,
  roomIndex,
  start,
  stubViewport,
  tabOrder,
  talkLog,
  textOf,
} from "../helpers/room";
import type { Visit } from "../helpers/room";
import { goodTree } from "../helpers/room-fixtures";

/** The 2D stages the room draws, the latest last, so a face's group is read from the drawing's faces. */
const flats = vi.hoisted(() => [] as { drawing: { faces: ReadonlyMap<string, Element> } }[]);

vi.mock("../../src/room/flat", async (importOriginal) => {
  const flat = await importOriginal<typeof import("../../src/room/flat")>();
  return {
    ...flat,
    renderFlat(...args: Parameters<typeof flat.renderFlat>) {
      const stage = flat.renderFlat(...args);
      flats.push(stage);
      return stage;
    },
  };
});

afterEach(() => {
  flats.length = 0;
});

let composed: ComposeResult | null = null;
const fixture = (): ComposeResult => (composed ??= compose(goodTree(), noPolicy(), { mode: "strict", drafts: true }));
const fixtureData = (): unknown => ({ room_text: fixture().roomText });
const fixtureText = (): RoomText => roomTextOf(fixtureData());

const lines = (v: Visit): string[] => [...v.doc.querySelectorAll(".room-around li")].map((li) => textOf(li));

/** A face's entry in "Around the room": its label, then its renderer's words. */
const entry = (index: RoomIndex, face: RoomIndex["faces"][number], text: RoomText | null): string | null => {
  const words = faceWords(face, { index, text });
  return words === null ? null : `${index.ui[face.label] ?? ""}: ${words.join(" ")}`;
};

/** The words the 2D drawing draws for a face, in its order: each text run, the neon tube's glow pass (drawn under the
 *  tube, at an opacity) left out so each word counts once; and for a sign's traced lettering, a group of paths, the
 *  words of the outline whose paths they are. */
function drawn2d(v: Visit, face: string, text: RoomText): string[] {
  const group = flats.at(-1)?.drawing.faces.get(face);
  // The drawing this visit shows, which the room put on its stage.
  if (!group || !v.doc.querySelector(".flat svg")?.contains(group)) return [];
  const words: string[] = [];
  for (const el of group.querySelectorAll("text, g")) {
    if (el.localName === "text") {
      if (!el.hasAttribute("opacity")) words.push(el.textContent ?? "");
      continue;
    }
    const paths = [...el.children].filter((c) => c.localName === "path").map((p) => p.getAttribute("d"));
    if (paths.length === 0) continue;
    const outline = [...text.blocks.values()].find(
      (b) => JSON.stringify(b.outline?.paths ?? null) === JSON.stringify(paths),
    );
    words.push(outline?.lines[0] ?? "(paths of no outline)");
  }
  return words;
}

describe('"Around the room" (FR-034, FR-063)', () => {
  it("holds each bound face's label and words, the illustration's note, the switch's state, and the fixed lines", async () => {
    const { index } = fixture();
    const v = start({ room: index, roomData: [fixtureData()] });
    await intoRoom(v);
    const held = lines(v);
    for (const face of index.faces) {
      const want = entry(index, face, fixtureText());
      expect(want, face.id).not.toBeNull();
      expect(held, face.id).toContain(want);
    }
    expect(held).toContain(index.ui["around.illustration"]);
    expect(held).toContain(index.ui["sign.not_affiliated"]);
    const sw = index.switches[0];
    expect(held).toContain(`${index.ui[sw?.label ?? ""]}: ${index.ui["tier.not-live"]}`);
    // In the index's copy order: the faces, the switches, then the fixed lines.
    const order = index.faces.map((f) => held.indexOf(entry(index, f, fixtureText()) ?? ""));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(Math.max(...order)).toBeLessThan(held.indexOf(index.ui["around.illustration"] ?? ""));
  });

  it("holds the repository's neon sign: its word, its counters' labels and readings, and its second line", async () => {
    const index = roomIndex();
    const v = start({ room: index });
    await intoRoom(v);
    const held = lines(v);
    const ui = index.ui;
    expect(held).toContain(`${ui["label.neon-word"]}: ${ui["sign.word"]}`);
    // Spec 007 turns the repository's turn route on (live.turn: site, with row V2; its FR-033, FR-047): "no call yet"
    // and "$0" until the first turn, where spec 004's sign read "cost unavailable" while the route was off.
    expect(held).toContain(`${ui["label.neon-call"]}: ${ui["sign.no_call_yet"]}`);
    expect(held).toContain(`${ui["label.neon-visit"]}: $0`);
    expect(held).toContain(`${ui["label.neon-line"]}: ${ui["sign.second_line"]}`);
    expect(held).toContain(ui["sign.not_affiliated"]);
    expect(held.join("\n")).toContain("Langfuse");
  });

  it("equals the 2D drawing, face by face", async () => {
    const { index } = fixture();
    const v = start({ room: index, roomData: [fixtureData()] });
    await intoRoom(v);
    expect(v.room.visit.mode).toBe("2d");
    for (const face of index.faces) {
      const words = faceWords(face, { index, text: fixtureText() });
      expect(
        drawn2d(v, face.id, fixtureText()).map((w) => (w === index.ui["draft.badge"] ? `[${w}]` : w)),
        face.id,
      ).toEqual(words);
    }
  });

  it("equals the 3D faces' display lists, face by face", () => {
    const { index, scene: part } = fixture();
    const room = buildRoom(part, { avatar: "dog", label: () => new Object3D(), index });
    const faces = buildFaceQuads({
      part,
      index,
      placements: room.placements,
      doc: new JSDOM("<main></main>").window.document,
      clock: new FakeClock(),
      dpr: 1,
      level: 0,
      motion: () => ({ animate: false }),
    });
    faces.setText(fixtureText());
    faces.frame(0);
    for (const face of index.faces) {
      const list = faces.lists.get(face.id);
      expect(list ? drawnWords(list.ops) : null, face.id).toEqual(faceWords(face, { index, text: fixtureText() }));
    }
  });

  it("updates a face's entry in place when its words come, in no live region", async () => {
    const { index } = fixture();
    const v = start({ room: index, roomData: [null, fixtureData()] });
    await intoRoom(v);
    const before = lines(v);
    v.clock.advance(10_000);
    await flush();
    const after = lines(v);
    expect(after.length).toBeGreaterThan(before.length);
    const around = v.doc.querySelector(".room-around");
    for (const el of [around, ...(around?.querySelectorAll("*") ?? [])])
      expect(el?.hasAttribute("aria-live"), el?.localName).toBe(false);
  });

  it("is the repository's own: its faces' words and its fixed lines, from Enter", async () => {
    const repo = repositoryBundle();
    const v = start({ room: repo.index });
    await intoRoom(v);
    for (const face of repo.index.faces) {
      const want = entry(repo.index, face, roomTextOf({}));
      if (want !== null) expect(lines(v), face.id).toContain(want);
    }
  });
});

// ---- T264: the counters' readings in the text copy ----

/** The index with its first talk selectable's topic ready and the turn route on, as the twin's spec will set them. */
function talking(index: RoomIndex): { index: RoomIndex; selectable: string } {
  const s = index.selectables.find((x) => x.action.kind === "talk");
  if (!s || s.action.kind !== "talk") throw new Error("no talk selectable");
  const topic = s.action.topic;
  return {
    index: {
      ...index,
      live: { ...index.live, turn: "site" },
      topics: index.topics.map((t) => (t.id === topic ? { ...t, ready: true } : t)),
    },
    selectable: s.id,
  };
}

/** The counters' faces: each face whose every region reads the turn's cost. */
const counters = (index: RoomIndex): RoomIndex["faces"] =>
  index.faces.filter((f) => f.regions.length > 0 && f.regions.every((r) => "signal" in r.source));

const ok = (route: string, cost: unknown): TurnResult => ({
  kind: "response",
  status: 200,
  body: { text: "t", feature: "f", route, cost_micro_usd: cost },
});

describe("the counters' readings (T264; contracts/turn-cost.md §8)", () => {
  for (const drafts of [false, true]) {
    it(`equal each counter face's word list in every reading, in a ${drafts ? "drafts" : "release"} build`, async () => {
      const { index, selectable } = talking(repositoryBundle({ drafts }).index);
      expect(counters(index)).toHaveLength(2);
      const sent: { request: TurnRequest; ended: (result: TurnResult) => void }[] = [];
      const v = start({ room: index, sendTurn: (request, ended) => sent.push({ request, ended }) });
      await intoRoom(v);
      expect(v.room.visit.mode).toBe("2d");
      const button = [...v.doc.querySelectorAll<HTMLButtonElement>(".room-list button")].find(
        (b) => b.getAttribute("data-object-id") === selectable,
      );
      button?.click();
      const results: (TurnResult | null)[] = [
        null,
        ok("local", 0),
        ok("fallback", 950),
        { kind: "error", error: "aborted" },
        ok("fallback", 1840),
        { kind: "response", status: 429, body: {} },
        { kind: "response", status: 503, body: { state: "degraded", cause: "meter_at_ceiling" } },
        ok("metered", 1200),
      ];
      const seen: string[] = [];
      for (const result of results) {
        if (result !== null) {
          const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
          if (box) box.value = "a turn";
          [...v.doc.querySelectorAll<HTMLButtonElement>("button")].find((b) => textOf(b) === "Send")?.click();
          sent.at(-1)?.ended(result);
        }
        await flush();
        const state = v.room.cost.state;
        for (const face of counters(index)) {
          const words = faceWords(face, { index, text: null, cost: state });
          expect(words, face.id).not.toBeNull();
          const want = `${index.ui[face.label] ?? ""}: ${(words ?? []).join(" ")}`;
          expect(lines(v), face.id).toContain(want);
          seen.push(want);
          // The 2D drawing draws the same words, the badge in brackets.
          const badge = (w: string): string =>
            w === index.ui["sign.test"] || w === index.ui["sign.sample"] ? `[${w}]` : w;
          expect(drawn2d(v, face.id, roomTextOf({})).map(badge), face.id).toEqual(words);
        }
      }
      const tail = drafts ? ` [${index.ui["sign.test"] ?? ""}]` : "";
      expect(seen).toContain(`This call: no call yet`);
      expect(seen).toContain(`This visit: $0${tail}`);
      expect(seen).toContain(`This call: local · $0${tail}`);
      expect(seen).toContain(`This call: $0.000950 est.${tail}`);
      expect(seen).toContain(`This visit: at least $0.000950 est.${tail}`);
      expect(seen).toContain(`This visit: at least $0.002790 est.${tail}`);
      expect(seen).toContain(`This call: cost unavailable`);
      // "est." is an abbreviation of "estimated", wherever it shows.
      const around = v.doc.querySelector(".room-around");
      const abbrs = [...(around?.querySelectorAll("abbr") ?? [])];
      expect(abbrs.length).toBeGreaterThan(0);
      for (const abbr of abbrs) {
        expect(abbr.textContent).toBe("est.");
        expect(abbr.getAttribute("title")).toBe("estimated");
      }
      // No live region, nothing in the talk panel's log, nothing announced.
      for (const el of [around, ...(around?.querySelectorAll("*") ?? [])])
        expect(el?.hasAttribute("aria-live"), el?.localName).toBe(false);
      expect(textOf(talkLog(v.doc))).not.toMatch(/\$0|est\.|cost unavailable/);
      expect(textOf(announcer(v.doc))).not.toMatch(/\$0|est\.|cost unavailable/);
      expect(v.spies.network).toEqual([]);
      expect(v.spies.storage).toEqual([]);
    });
  }

  it('marks every "est." of an entry, and only there, as the abbreviation', async () => {
    const { index, selectable } = talking(roomIndex());
    const sent: { request: TurnRequest; ended: (result: TurnResult) => void }[] = [];
    const v = start({ room: index, sendTurn: (request, ended) => sent.push({ request, ended }) });
    await intoRoom(v);
    [...v.doc.querySelectorAll<HTMLButtonElement>(".room-list button")]
      .find((b) => b.getAttribute("data-object-id") === selectable)
      ?.click();
    const box = v.doc.querySelector<HTMLInputElement>("#talk-text");
    if (box) box.value = "a turn";
    [...v.doc.querySelectorAll<HTMLButtonElement>("button")].find((b) => textOf(b) === "Send")?.click();
    sent[0]?.ended(ok("fallback", 950));
    const entries = [...v.doc.querySelectorAll(".room-around li")].filter((li) => textOf(li).includes("est."));
    expect(entries).toHaveLength(2);
    for (const li of entries) {
      expect(li.querySelectorAll("abbr")).toHaveLength(1);
      expect(li.querySelector("abbr")?.textContent).toBe("est.");
    }
    // No other entry carries one.
    expect(v.doc.querySelectorAll(".room-around abbr")).toHaveLength(2);
  });
});

// T-A08 (spec 028; FR-016; Q7 as reworked after rv-spec-028's B-1, Q22; the Author's answer "Hide, keep for readers
// (Recommended)": "no panel below the room on screen; screen readers and the phone layout still get the text"): in the
// split and column layouts (`html[data-hud="column"]`, the split being that layout with data-split on) "Around the
// room" takes the room's visually hidden declarations, so it takes no space on screen and a screen reader still reads
// it in its place, the last Tab stop; while it holds focus there it shows as an overlay at the window's foot centre,
// still taking no space in the layout (WCAG 2.4.7; N-2). In the dock and stacked layouts, where phones are (390 × 844
// and 320 × 568 take the dock), it shows below the room as before. The overlay is absolute, not fixed: spec 005's
// FR-044 pin (test/ui/hud-a11y.test.ts) allows no fixed part but the strip, and the room block is the window.
describe('"Around the room" hidden from view in the split and column layouts, kept for readers (spec 028, T-A08; FR-016)', () => {
  const CSS = parseCss(readFileSync(fileURLToPath(new URL("../../src/room/room.css", import.meta.url)), "utf8"));
  const rules = [...CSS.rules, ...CSS.atRules.flatMap((a) => parseCss(a.body).rules)];
  const declared = (selector: string): Map<string, string> => {
    const out = new Map<string, string>();
    for (const r of rules)
      if (r.selector.split(",").some((p) => p.trim() === selector)) for (const [k, v] of r.declarations) out.set(k, v);
    return out;
  };
  const HIDDEN = declared(".visually-hidden");
  /** room.css's top-level rules applied to an element, in source order: each rule one of whose selectors it matches. */
  const applied = (el: Element): Map<string, string> => {
    const out = new Map<string, string>();
    for (const r of CSS.rules)
      if (r.selector.split(",").some((p) => el.matches(p.trim()))) for (const [k, v] of r.declarations) out.set(k, v);
    return out;
  };
  const hidden = (el: Element): boolean => applied(el).get("clip-path") === HIDDEN.get("clip-path");

  it("takes the room's visually hidden declarations in the column layout (the split layout's among them), not in the dock layout (B-1)", () => {
    expect(HIDDEN.get("clip-path")).toBe("inset(50%)");
    const got = declared('html[data-hud="column"] .room-around:not(:focus-within)');
    for (const [k, v] of HIDDEN) expect(got.get(k), k).toBe(v);
    expect(got.get("position")).toBe("absolute");
    for (const r of rules.filter((x) => /data-hud="dock"\] \.room-around/.test(x.selector))) {
      expect(r.declarations.get("clip-path") ?? "none", r.selector).toBe("none");
      expect(r.declarations.get("position") ?? "static", r.selector).not.toBe("absolute");
    }
  });

  it("shows while it holds focus in the column and split layouts, at the window's foot centre, over the room, taking no layout space (N-2, Q22)", () => {
    const got = declared('html[data-hud="column"] .room-around:focus-within');
    expect(got.get("position")).toBe("absolute");
    expect(got.get("clip-path")).toBe("none");
    expect(got.get("bottom")).toBe("1rem");
    expect(got.get("left")).toBe("1rem");
    expect(got.get("right")).toBe("1rem");
    expect(got.get("margin")).toBe("0 auto");
    expect(got.get("max-width")).toBe("48rem");
    expect(got.get("overflow-y")).toBe("auto");
    expect(Number(got.get("z-index"))).toBeGreaterThan(3);
  });

  it("shows in the dock and stacked layouts: no rule there hides it (B-1, Q7 as reworked)", () => {
    for (const r of rules.filter((x) => /data-hud="(stacked|dock)"\] \.room-around/.test(x.selector))) {
      expect(r.declarations.get("clip-path") ?? "none").toBe("none");
      expect(r.declarations.get("position") ?? "static").not.toBe("absolute");
    }
  });

  for (const [name, screen, layout, shown] of [
    ["split", { w: 1920, h: 1080 }, "column", false],
    ["column", { w: 844, h: 390 }, "column", false],
    ["dock (390 × 844)", { w: 390, h: 844 }, "dock", true],
    ["dock (320 × 568)", { w: 320, h: 568 }, "dock", true],
    ["stacked", { w: 300, h: 500 }, "stacked", true],
  ] as const)
    it(`is ${shown ? "shown" : "hidden from view"} in the ${name} layout${shown ? "" : ", and shown while it holds focus"} (B-1, N-2)`, async () => {
      const view = stubViewport(screen);
      const v = start({ webgl: true, viewport: view.factory });
      await intoRoom(v);
      const around = v.doc.querySelector<HTMLElement>(".room-around");
      if (!around) throw new Error('no "Around the room"');
      expect(v.doc.documentElement.getAttribute("data-hud") ?? "stacked").toBe(layout);
      expect(v.doc.documentElement.getAttribute("data-split")).toBe(name === "split" ? "on" : "off");
      expect(hidden(around)).toBe(!shown);
      around.focus();
      expect(v.doc.activeElement).toBe(around);
      expect(hidden(around)).toBe(false);
      if (!shown) expect(applied(around).get("position")).toBe("absolute");
      around.blur();
      expect(hidden(around)).toBe(!shown);
    });

  for (const [name, screen] of [
    ["split", { w: 1920, h: 1080 }],
    ["column", { w: 844, h: 390 }],
    ["dock", { w: 390, h: 844 }],
  ] as const)
    it(`is the room's last Tab stop in the ${name} layout, in the accessibility tree, its lines whole`, async () => {
      const view = stubViewport(screen);
      const v = start({ webgl: true, viewport: view.factory });
      await intoRoom(v);
      const around = v.doc.querySelector<HTMLElement>(".room-around");
      if (!around) throw new Error('no "Around the room"');
      expect(v.doc.documentElement.getAttribute("data-split")).toBe(name === "split" ? "on" : "off");
      const stops = tabOrder(v.doc).filter(
        (el) => el.closest(".room") !== null && el.closest(".resume-panel") === null,
      );
      expect(stops.at(-1)).toBe(around);
      expect(around.closest("[hidden], [inert], [aria-hidden='true']")).toBeNull();
      expect(around.querySelectorAll("li").length).toBeGreaterThan(0);
    });
});
