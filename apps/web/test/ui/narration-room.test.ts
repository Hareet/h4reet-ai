// Narration in the room (spec 002, T053 with T040–T045; FR-004, FR-011; contracts/narration.md §4,
// contracts/room-scene.md §1; Principle VIII). The room's resume view narrates an item at the path the visitor chose,
// stops when the resume closes, and never shows the twin's words without the AI disclosure in view. jsdom lays nothing
// out, so "in view" is read from the page and its stylesheets, at a narrow (320 by 640, portrait) and a wide (1280 by
// 800, landscape) viewport: index.html's disclosure is a child of the body, unhidden, sticky at the top and opaque,
// and no rule at either width gives any other element a z-index that could cover it, puts the narration in a fixed or
// sticky layer, or makes the page scroll inside a box the disclosure isn't in. And the narration says beside its words
// that the AI twin narrates them.
import { describe, expect, it } from "vitest";

import { NARRATION_AI_LINE, WORD_MS } from "../../src/narration/view";
import { narrationFromRoomData, roomDataLoader } from "../../src/room/resume-port";
import {
  AI_DISCLOSURE,
  axeViolations,
  button,
  enter,
  fixtureResume,
  flush,
  matchesRule,
  parseCss,
  px,
  start,
  stylesheets,
  textOf,
} from "../helpers/room";
import type { CssRule, Visit } from "../helpers/room";

const ids = (): string[] => fixtureResume().sections[0]?.items.map((i) => i.id) ?? [];
const WORDS = {
  engineer: "The engineer path's words, about the first fixture item, at the topic sections' depth.",
  "non-engineer": "The plain path's words, about the first fixture item.",
};

/** room-data.json as the build writes it: the fixture's items, the first narrated on both paths. */
function built(): unknown {
  const [first = "", ...rest] = ids();
  const entry = (words: string) => ({ words, approved: true, source: "s", sha256: "h" });
  return {
    resume_state: "approved",
    sections: [
      {
        id: "fixture",
        title: "Fixture section",
        items: [
          {
            id: first,
            text: "x",
            narration: { engineer: entry(WORDS.engineer), "non-engineer": entry(WORDS["non-engineer"]) },
          },
          ...rest.map((id) => ({ id, text: "x", narration: { engineer: null, "non-engineer": null } })),
        ],
      },
    ],
  };
}

/** Into the room on a path, the resume open, the first item selected, its words on screen. */
async function narrating(path: "engineer" | "non-engineer" = "engineer"): Promise<Visit> {
  const v = start({ narration: built() });
  await enter(v, path);
  v.clock.advance(5000);
  button(v.doc, "Keep it for later").click();
  await flush();
  button(v.doc, "Resume").click();
  await flush();
  v.doc.querySelector<HTMLButtonElement>(`.resume-panel button[data-item-id="${ids()[0] ?? ""}"]`)?.click();
  return v;
}

const region = (v: Visit): HTMLElement | null => v.doc.querySelector<HTMLElement>(".resume-panel [data-narration]");
const shown = (v: Visit): string => textOf(region(v)?.querySelector(".narration-words") ?? null);

interface Viewport {
  name: string;
  width: number;
  height: number;
}
const VIEWPORTS: Viewport[] = [
  { name: "narrow", width: 320, height: 640 },
  { name: "wide", width: 1280, height: 800 },
];

/** Whether an @media prelude holds at a viewport, for a visitor with no reduced motion and a fine pointer. A feature
 * this doesn't know holds, so its rules are checked too. */
function holds(prelude: string, vp: Viewport): boolean {
  const query = prelude.replace(/^@media\s+/, "");
  return query.split(",").some((alternative) =>
    alternative.split(/\s+and\s+/).every((part) => {
      const m = /\(\s*([a-z-]+)\s*:\s*([^)]+?)\s*\)/.exec(part);
      if (!m) return !/^\s*(?:print|speech)\s*$/.test(part);
      const [, feature, value = ""] = m;
      if (feature === "min-width") return vp.width >= px(value);
      if (feature === "max-width") return vp.width <= px(value);
      if (feature === "orientation") return value === (vp.width > vp.height ? "landscape" : "portrait");
      if (feature === "prefers-reduced-motion" || feature === "pointer") return false;
      // Spec 005's preference queries, off as the default visitor has them.
      if (["forced-colors", "prefers-contrast", "prefers-reduced-transparency"].includes(feature)) return false;
      return true;
    }),
  );
}

/** Every rule that applies at a viewport, in source order: the top level, then each @media that holds. */
function rulesAt(vp: Viewport): CssRule[] {
  return stylesheets().flatMap((sheet) => {
    const { rules, atRules } = parseCss(sheet.text);
    return [...rules, ...atRules.filter((a) => holds(a.prelude, vp)).flatMap((a) => parseCss(a.body).rules)];
  });
}

/** An element's value for a property at a viewport: the last applicable rule that sets it. */
function valueOf(el: Element, property: string, rules: CssRule[]): string | undefined {
  let value: string | undefined;
  for (const rule of rules) {
    if (matchesRule(el, rule.selector) && rule.declarations.has(property)) value = rule.declarations.get(property);
  }
  return value;
}

const OPAQUE = /^(?:#(?:[0-9a-f]{3}|[0-9a-f]{6})|white|black|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))$/i;

describe("narration in the room", () => {
  it("narrates the selected item at the path the visitor chose", async () => {
    for (const path of ["engineer", "non-engineer"] as const) {
      const v = await narrating(path);
      v.clock.advance(WORD_MS * 100);
      expect(shown(v)).toBe(WORDS[path]);
    }
  });

  it("stops at once when the resume closes", async () => {
    const v = await narrating();
    expect(shown(v)).toBe("The");
    button(v.doc, "Close").click();
    expect(region(v)).toBeNull();
    v.clock.advance(WORD_MS * 100);
    button(v.doc, "Resume").click();
    await flush();
    expect(region(v)).toBeNull();
  });

  for (const vp of VIEWPORTS) {
    it(`keeps the AI disclosure in view while narration words are on screen, ${vp.name} (${vp.width} by ${vp.height})`, async () => {
      const v = await narrating();
      v.clock.advance(WORD_MS * 3);
      expect(shown(v).length).toBeGreaterThan(0);
      const rules = rulesAt(vp);

      // The disclosure: on the page, unhidden, a child of the body, at the top, and stacked above: since spec 005 the
      // HUD's strip in the room, fixed over the scene, its dark glass's contrast computed by
      // test/room/hud-contrast.test.ts; sticky and opaque in the stacked layout.
      const disclosure = v.doc.querySelector<HTMLElement>(".disclosure");
      if (!disclosure) throw new Error("no AI disclosure");
      expect(textOf(disclosure)).toContain(AI_DISCLOSURE);
      expect(disclosure.closest("[hidden], [aria-hidden='true']")).toBeNull();
      expect(disclosure.parentElement).toBe(v.doc.body);
      const hud = ["column", "dock"].includes(v.doc.documentElement.getAttribute("data-hud") ?? "");
      expect(valueOf(disclosure, "position", rules)).toBe(hud ? "fixed" : "sticky");
      expect(px(valueOf(disclosure, "top", rules) ?? "") || Number(valueOf(disclosure, "top", rules))).toBe(0);
      const background = valueOf(disclosure, "background", rules) ?? valueOf(disclosure, "background-color", rules);
      if (hud) expect(background).toBe("rgb(var(--glass) / var(--glass-alpha))");
      else expect(background).toMatch(OPAQUE);
      const z = Number(valueOf(disclosure, "z-index", rules));
      expect(z).toBeGreaterThan(0);

      // Nothing covers it: no other element gets a z-index as high, at this width.
      for (const el of v.doc.querySelectorAll("body *")) {
        if (el === disclosure || disclosure.contains(el)) continue;
        const other = valueOf(el, "z-index", rules);
        if (other !== undefined && other !== "auto") expect(Number(other), el.className).toBeLessThan(z);
      }
      // Nothing scrolls it away: the page scrolls in the viewport, not in a box the disclosure isn't in, and the
      // narration and the resume holding it stay in the page's flow.
      for (const el of [v.doc.documentElement, v.doc.body]) {
        expect(valueOf(el, "overflow", rules) ?? "visible", el.tagName).toMatch(/^(visible|clip)$/);
        expect(valueOf(el, "overflow-y", rules) ?? "visible", el.tagName).toMatch(/^(visible|clip)$/);
      }
      // Since spec 005 the resume lies over the room block's clear area, under the strip (FR-027).
      for (let el: Element | null = region(v); el && el !== v.doc.body; el = el.parentElement) {
        expect(valueOf(el, "position", rules) ?? "static", el.className).toMatch(/^(static|relative|absolute)$/);
      }

      // And beside the words, the narration says the AI twin narrates them.
      const line = region(v)?.querySelector<HTMLElement>(".narration-ai");
      expect(line?.textContent).toBe(NARRATION_AI_LINE);
      expect(line?.closest("[hidden], [aria-hidden='true']")).toBeNull();
    });
  }

  it("fetches room-data.json once for the resume and its narration, and again after a load that failed", async () => {
    const answers = [new Error("offline"), { resume_state: "approved" }];
    let fetches = 0;
    const load = roomDataLoader((async () => {
      const answer = answers[Math.min(fetches, answers.length - 1)];
      fetches += 1;
      if (answer instanceof Error) throw answer;
      return new Response(JSON.stringify(answer), { status: 200 });
    }) as typeof fetch);
    expect(await load()).toBeNull();
    expect(await Promise.all([load(), load()])).toEqual([{ resume_state: "approved" }, { resume_state: "approved" }]);
    expect(fetches).toBe(2);
  });

  it("fails a narration load whose room-data.json didn't load, so the narration loads again, as the resume does", async () => {
    let fetches = 0;
    const load = narrationFromRoomData(
      roomDataLoader((async () => {
        fetches += 1;
        if (fetches === 1) throw new Error("offline");
        return new Response(JSON.stringify(built()), { status: 200 });
      }) as typeof fetch),
    );
    await expect(load()).rejects.toThrow(/room-data\.json/);
    expect((await load()).get(ids()[0] ?? "")?.engineer?.words).toBe(WORDS.engineer);
    expect(fetches).toBe(2);
  });

  it("has no axe violations while narrating in the room", async () => {
    const v = await narrating();
    v.clock.advance(WORD_MS * 2);
    expect(await axeViolations(v)).toEqual([]);
  });
});
