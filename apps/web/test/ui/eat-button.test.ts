// T011b (spec 024; FR-001, FR-012; NB-1; plan.md §5.5): the "Eat" tile. A real button `layout.ts`'s `tile` builds, with
// the `eat` icon, the words eat.button, and a "B" key cap, its name "{eat.button}, B" whether or not the cap draws;
// after the walking control in the stage's clear box, placed at --eat-x and --eat-y from compactBoxes's `eat`; the
// option on for a 3D dinosaur visit from its start, from the 3D stage's protector, and never for another visit or in
// 2D; hidden by default, shown only while the 3D side says the eating is available, and pressing it presses the
// stage's eating; never over the AI disclosure, the notes, or the stand-in line.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import {
  compactBoxes,
  DEFAULT_METRICS,
  fitsHud,
  hudBoxes,
  notesBox,
  OPENING,
  splitBoxes,
} from "../../src/room/compose/hud";
import type { Box } from "../../src/room/compose/hud";
import { protectorFor } from "../../src/room/compose/protect";
import type { ProtectScene } from "../../src/room/compose/protect";
import { sweepScreens } from "../../src/room/compose/stages";
import { ICON_PATHS } from "../../src/room/hud/icons";
import { renderRoom } from "../../src/room/layout";
import {
  button,
  enter,
  flush,
  matchesRule,
  nameOf,
  parseCss,
  start,
  stubViewport,
  stylesheets,
  throughLoader,
  WEB,
} from "../helpers/room";
import type { Visit } from "../helpers/room";
import { PROTECT_SCENE } from "../fixtures/room/protect-scene";

const SCENE = PROTECT_SCENE as unknown as ProtectScene;
const WORDS = (parse(readFileSync(join(WEB, "room/ui-words.yaml"), "utf8")) as { words: Record<string, string> }).words;
const EAT = WORDS["eat.button"] as string;

/** A layout alone, with the parts it needs, and the Eat words and key-cap drawer given. */
function layoutWith(keycap?: (doc: Document, name: string) => HTMLElement) {
  const doc = new JSDOM("<!doctype html><html><body></body></html>").window.document;
  const div = (): HTMLElement => doc.createElement("div");
  return renderRoom(doc, {
    list: div(),
    talk: div(),
    around: div(),
    note: "note",
    pause: "Pause the room",
    walk: { enter: "Walk", leave: "Stop walking", region: "region", help: "help" },
    eat: { button: EAT, ...(keycap ? { keycap } : {}) },
  });
}

describe("the Eat tile (FR-012; NB-1)", () => {
  it("is a real button built as a tile: the eat icon, the words, a B key cap hidden from assistive technology", () => {
    const layout = layoutWith();
    const b = layout.eatButton;
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("type")).toBe("button");
    expect(b.classList.contains("room-eat")).toBe(true);
    expect(b.classList.contains("hud-glass")).toBe(true);
    expect(b.classList.contains("hud-tile")).toBe(true);
    expect(ICON_PATHS.eat).toBeTruthy();
    const path = b.querySelector("svg.hud-icon path");
    expect(path?.getAttribute("d")).toBe(ICON_PATHS.eat);
    expect(b.querySelector(".hud-tile-words")?.textContent).toBe(EAT);
    const cap = b.querySelector(".hud-keycap");
    expect(cap?.textContent).toBe("B");
    expect(cap?.getAttribute("aria-hidden")).toBe("true");
    expect(b.getAttribute("aria-label")).toBe(`${EAT}, B`);
    expect(b.getAttribute("aria-keyshortcuts")).toBe("B");
  });

  it("keeps its icon, its words, and its name when the key cap can't be drawn (attempt)", () => {
    const layout = layoutWith(() => {
      throw new Error("no cap");
    });
    const b = layout.eatButton;
    expect(b.querySelector(".hud-keycap")).toBeNull();
    expect(b.querySelector("svg.hud-icon")).not.toBeNull();
    expect(b.querySelector(".hud-tile-words")?.textContent).toBe(EAT);
    expect(b.getAttribute("aria-label")).toBe(`${EAT}, B`);
  });

  it("sits after the walking control in the stage's clear box, hidden by default", () => {
    const layout = layoutWith();
    const kids = [...layout.clear.children];
    const walk = kids.indexOf(layout.walkButton);
    expect(walk).toBeGreaterThanOrEqual(0);
    expect(kids.indexOf(layout.eatButton)).toBeGreaterThan(walk);
    expect(layout.eatButton.hidden).toBe(true);
    layout.setEatOffered(true);
    expect(layout.eatButton.hidden).toBe(false);
    layout.setEatOffered(false);
    expect(layout.eatButton.hidden).toBe(true);
  });
});

/** A visit at a window: its avatar chosen, the 3D stage's protector given (the dinosaur's with the option), through
 *  the loader and the hand-off. */
async function visit(screen: { w: number; h: number }, avatar: string, o: { webgl?: boolean } = {}): Promise<Visit> {
  const viewport = stubViewport(screen);
  const v = start({ webgl: o.webgl ?? true, viewport: viewport.factory });
  v.scene.protect = protectorFor(SCENE, 16, { eat: avatar === "dinosaur" });
  const press = vi.fn(() => true);
  v.scene.onCreate = () => {
    (v.scene.stage as unknown as { eat: { press: () => boolean } }).eat = { press };
  };
  await enter(v, "engineer", avatar);
  await throughLoader(v);
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
  (v as unknown as { press: typeof press }).press = press;
  return v;
}

const px = (v: Visit, name: string): number => Number.parseFloat(v.doc.documentElement.style.getPropertyValue(name));
const eatButton = (v: Visit): HTMLButtonElement => v.doc.querySelector(".room-eat") as HTMLButtonElement;

describe("the option and the place (Q150, Q-R3b)", () => {
  it("places the tile at compactBoxes's eat for a 3D dinosaur visit from its start", async () => {
    const screen = { w: 1920, h: 1200 };
    const v = await visit(screen, "dinosaur");
    const want = compactBoxes(screen, OPENING, DEFAULT_METRICS, { eat: true }).eat as Box;
    expect(v.doc.documentElement.getAttribute("data-eat-place")).toBe("on");
    expect(px(v, "--eat-x")).toBeCloseTo(want.x, 3);
    expect(px(v, "--eat-y")).toBeCloseTo(want.y, 3);
    expect(v.doc.querySelector(".room-clear > .room-eat")).not.toBeNull();
    // Showing and hiding the tile moves nothing.
    const eating = v.scene.created.at(-1)?.eating;
    expect(eating).toBeDefined();
    eating?.available(true);
    await flush();
    expect(px(v, "--eat-x")).toBeCloseTo(want.x, 3);
    eating?.available(false);
    await flush();
    expect(px(v, "--eat-y")).toBeCloseTo(want.y, 3);
  });

  for (const avatar of ["woman", "man", "dog"])
    it(`gives the ${avatar} no Eat box and no tile`, async () => {
      const v = await visit({ w: 1920, h: 1200 }, avatar);
      expect(v.doc.documentElement.getAttribute("data-eat-place")).toBe("off");
      expect(v.doc.documentElement.style.getPropertyValue("--eat-x")).toBe("");
      expect(eatButton(v).hidden).toBe(true);
    });

  it("gives a 2D dinosaur visit no Eat box", async () => {
    const v = await visit({ w: 1920, h: 1200 }, "dinosaur", { webgl: false });
    expect(v.doc.documentElement.getAttribute("data-eat-place")).toBe("off");
    expect(eatButton(v).hidden).toBe(true);
  });

  it("takes the split layout where the option-off visit does", async () => {
    for (const screen of [
      { w: 1920, h: 1080 },
      { w: 1392, h: 783 },
    ]) {
      const dino = await visit(screen, "dinosaur");
      const dog = await visit(screen, "dog");
      expect(dino.doc.documentElement.getAttribute("data-split")).toBe(
        dog.doc.documentElement.getAttribute("data-split"),
      );
      expect(dino.doc.documentElement.getAttribute("data-split")).toBe(splitBoxes(screen) ? "on" : "off");
    }
  });
});

describe("when the tile shows (FR-001; US1 AS4)", () => {
  it("is hidden until the 3D side says the eating is available, then reachable, and its press goes to the stage", async () => {
    const v = await visit({ w: 1920, h: 1200 }, "dinosaur");
    const b = eatButton(v);
    expect(b.hidden).toBe(true);
    const eating = v.scene.created.at(-1)?.eating;
    eating?.available(true);
    await flush();
    expect(b.hidden).toBe(false);
    expect(b.tabIndex).toBe(0);
    expect(b.closest("[inert]")).toBeNull();
    expect(nameOf(b)).toBe(`${EAT}, B`);
    b.click();
    expect((v as unknown as { press: ReturnType<typeof vi.fn> }).press).toHaveBeenCalledTimes(1);
    // No chunk standing: the 3D side says so, and the tile goes.
    eating?.available(false);
    await flush();
    expect(b.hidden).toBe(true);
  });
});

describe("what the tile never covers", () => {
  const RULES = (() => {
    const out: { selector: string; declarations: Map<string, string> }[] = [];
    const add = (text: string): void => {
      const sheet = parseCss(text);
      for (const r of sheet.rules)
        for (const selector of r.selector.split(","))
          out.push({ selector: selector.trim(), declarations: r.declarations });
      for (const a of sheet.atRules) add(a.body);
    };
    for (const s of stylesheets().filter((x) => /room\.css$/.test(x.path))) add(s.text);
    return out;
  })();

  it("is placed by room.css at --eat-x and --eat-y in each HUD layout, the walking control's size", () => {
    const rule = RULES.find((r) => r.selector === "html[data-hud] .room-eat");
    expect(rule?.declarations.get("left")).toBe("calc(var(--eat-x) - var(--clear-x))");
    expect(rule?.declarations.get("top")).toBe("calc(var(--eat-y) - var(--clear-y))");
    const base = RULES.find((r) => r.selector === ".room-eat" && r.declarations.has("width"));
    expect(base?.declarations.get("width")).toBe("8rem");
    expect(base?.declarations.get("height")).toBe("2.75rem");
  });

  it("lies off the notes and the stand-in line, and off the AI disclosure's panels, at every swept window", () => {
    const wrong: string[] = [];
    for (const screen of sweepScreens())
      for (const st of [OPENING, { list: "collapsed" as const }]) {
        if (!fitsHud(screen, st)) continue;
        const c = compactBoxes(screen, st, DEFAULT_METRICS, { eat: true });
        const eat = c.eat as Box;
        const b = hudBoxes(screen, st);
        const notes = notesBox(b.clear);
        const over = (a: Box, o: Box): boolean =>
          a.x < o.x + o.w && o.x < a.x + a.w && a.y < o.y + o.h && o.y < a.y + a.h;
        // The notes (the placeholder note and the stand-in line) and the panels the AI disclosure lives in: the column's
        // compact content or the split layout's list and rest row, the dock, the strip, and the bar.
        const others = [
          notes,
          b.strip,
          b.bar,
          ...(b.dock ? [b.dock] : []),
          ...(c.split ? [c.split.list, c.split.rest] : c.column ? [c.column] : []),
        ];
        if (others.some((o) => over(eat, o))) wrong.push(`${screen.w} × ${screen.h}, ${st.list}`);
      }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("matches no rule that would show it in the stacked layout over the notes", () => {
    const layout = layoutWith();
    layout.setEatOffered(true);
    expect(matchesRule(layout.eatButton, ".room-eat")).toBe(true);
    const stacked = RULES.find((r) => r.selector === ".room-eat" && r.declarations.has("right"));
    expect(stacked?.declarations.get("right")).toBe("8.75rem");
    expect(stacked?.declarations.get("bottom")).toBe("0.5rem");
  });
});
