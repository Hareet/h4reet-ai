// T011a (spec 024; FR-012, SC-004; plan.md §5.5; Q-R2a, Q150, Q-R3b): the "Eat" tile's box, the kernel. With the `eat`
// option off (every visit but a 3D dinosaur's), every compact box, `all`, `walkPlace`, the reserved boxes, the split
// layout's choice, and the protector are today's: the snapshot below was written by this file's first run, against
// T010's code, before the option existed. With it on, the Eat box is the walking control's size, beside it (on its
// left at its height, else above it), inside its band or the clear area, apart from every other box, and listed after
// it; the split layout is taken exactly where it is with the option off; and the protector built with it keeps the
// protected cores clear of the box and holds a side-wall selectable whose core lies under it at spec 005's frame.
import { describe, expect, it } from "vitest";

import { frameArea, MARGIN_REM } from "../../src/room/compose/frame";
import { framing } from "../../src/room/compose/framing";
import {
  alwaysOnCoverage,
  compactBoxes,
  DEFAULT_METRICS,
  EAT_CONTROL,
  eatControlBox,
  fitsHud,
  HUD_PLACEMENTS,
  hudBoxes,
  notesBox,
  OPENING,
  reservedBoxes,
  splitBoxes,
  unionArea,
  walkControlBox,
  WALK_CONTROL,
} from "../../src/room/compose/hud";
import type { Box, CompactBoxes, HudMetrics, HudState } from "../../src/room/compose/hud";
import { CORE_PX, memberRect, pickAreas } from "../../src/room/compose/pick";
import type { Rect } from "../../src/room/compose/pick";
import { protectorFor } from "../../src/room/compose/protect";
import type { ProtectScene } from "../../src/room/compose/protect";
import { stageFor, sweepScreens } from "../../src/room/compose/stages";
import { PROTECT_SCENE } from "../fixtures/room/protect-scene";

const SCENE = PROTECT_SCENE as unknown as ProtectScene;
const COLLAPSED: HudState = { list: "collapsed" };
const STATES: readonly HudState[] = [OPENING, COLLAPSED];
const METRICS: readonly HudMetrics[] = [
  DEFAULT_METRICS,
  { ...DEFAULT_METRICS, rem: 20 },
  { rem: 16, safe: { top: 0, right: 44, bottom: 21, left: 44 } },
  { ...DEFAULT_METRICS, rem: 32 },
];

/** The windows `hud.test.ts` and `hud-split-geometry.test.ts` use. */
const WINDOWS = [
  { w: 1920, h: 1200 },
  { w: 844, h: 390 },
  { w: 568, h: 320 },
  { w: 512, h: 300 },
  { w: 511, h: 300 },
  { w: 800, h: 800 },
  { w: 390, h: 844 },
  { w: 384, h: 740 },
  { w: 1023, h: 600 },
  { w: 1024, h: 600 },
  { w: 1000, h: 600 },
  { w: 1280, h: 720 },
  { w: 320, h: 568 },
  { w: 560, h: 900 },
  { w: 1024, h: 1366 },
  { w: 1366, h: 768 },
  { w: 768, h: 432 },
  { w: 800, h: 500 },
  { w: 700, h: 400 },
  { w: 770, h: 330 },
  { w: 1392, h: 783 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
] as const;

/** The compact boxes as they were before spec 024: every field but its new `eat`. */
function today(c: CompactBoxes) {
  const { layout, strip, bar, column, dock, walk, walkPlace, split, all } = c;
  const s = split && {
    panel: split.panel,
    title: split.title,
    rest: split.rest,
    frame: split.frame,
    list: split.list,
    walk: split.walk,
  };
  return { layout, strip, bar, column, dock, walk, walkPlace, split: s, all };
}

const name = (s: { w: number; h: number }, st: HudState, m: HudMetrics): string =>
  `${s.w} × ${s.h}, ${st.list}, ${m.rem}px, safe ${m.safe.left}`;

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Box, b: Box): boolean =>
  a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
const box = (r: Rect, at: { x: number; y: number } = { x: 0, y: 0 }): Box => ({
  x: at.x + r[0],
  y: at.y + r[1],
  w: r[2],
  h: r[3],
});

/** Every window and state of the sweep a HUD fits, at each metrics, and the windows above. */
function* cases(): Generator<[{ w: number; h: number }, HudState, HudMetrics]> {
  const screens = [...WINDOWS, ...sweepScreens()];
  for (const m of METRICS) for (const s of screens) for (const st of STATES) if (fitsHud(s, st, m)) yield [s, st, m];
}

describe("the option off: today's boxes (SC-004)", () => {
  it("gives every compact box, `all`, `walkPlace`, the split's choice, and the reserved boxes as before", () => {
    const record: Record<string, unknown> = {};
    for (const m of METRICS)
      for (const s of WINDOWS)
        for (const st of STATES) {
          if (!fitsHud(s, st, m)) continue;
          const plain = compactBoxes(s, st, m);
          expect(today(compactBoxes(s, st, m, {}))).toEqual(today(plain));
          expect(today(compactBoxes(s, st, m, { eat: false }))).toEqual(today(plain));
          const clear = hudBoxes(s, st, m).clear;
          record[name(s, st, m)] = {
            compact: today(plain),
            split: splitBoxes(s, st, m) !== null,
            reserved: reservedBoxes(clear, m.rem),
          };
        }
    expect(record).toMatchSnapshot();
  });

  it("gives `eat` null, and `all` without it, at every case of the sweep", () => {
    for (const [s, st, m] of cases()) {
      const c = compactBoxes(s, st, m);
      expect(c.eat, name(s, st, m)).toBeNull();
      expect(splitBoxes(s, st, m)?.eat ?? null).toBeNull();
    }
  });

  it("builds today's protector without the option: its key, no `eat`, and its boxes", () => {
    const plain = protectorFor(SCENE);
    expect(plain.key).toBe(`3d:16:${JSON.stringify(SCENE)}`);
    expect(plain.eat).toBeUndefined();
    expect(protectorFor(SCENE, 16, {}).key).toBe(plain.key);
    expect(protectorFor(SCENE, 16, { eat: false }).key).toBe(plain.key);
    const screen = { w: 1920, h: 1200 };
    const clear = hudBoxes(screen).clear;
    expect(protectorFor(SCENE, 16, { eat: false }).boxes(clear, clear)).toEqual(plain.boxes(clear, clear));
  });
});

describe("the option on: the Eat box (Q-R2a)", () => {
  it("is the walking control's size, beside it on its left at its height or above it, a gap apart", () => {
    expect([EAT_CONTROL.widthRem, EAT_CONTROL.heightRem]).toEqual([WALK_CONTROL.widthRem, WALK_CONTROL.heightRem]);
    const places = { left: 0, above: 0 };
    const missing: string[] = [];
    for (const [s, st, m] of cases()) {
      const c = compactBoxes(s, st, m, { eat: true });
      const { eat, walk } = c;
      if (!eat) {
        missing.push(name(s, st, m));
        continue;
      }
      const gap = EAT_CONTROL.gapRem * m.rem;
      expect([eat.w, eat.h]).toEqual([walk.w, walk.h]);
      const left = eat.y === walk.y && Math.abs(eat.x + eat.w + gap - walk.x) < 1e-9;
      const above = Math.abs(eat.x + eat.w - (walk.x + walk.w)) < 1e-9 && Math.abs(eat.y + eat.h + gap - walk.y) < 1e-9;
      expect(left || above, name(s, st, m)).toBe(true);
      if (left) places.left += 1;
      else places.above += 1;
    }
    expect(missing.slice(0, 5)).toEqual([]);
    expect(places.left).toBeGreaterThan(0);
  });

  it("lies inside its band or the clear area, apart from every other box of `all`, listed right after `walk`", () => {
    const seen = new Set<string>();
    const wrong: string[] = [];
    for (const [s, st, m] of cases()) {
      const c = compactBoxes(s, st, m, { eat: true });
      const b = hudBoxes(s, st, m);
      const eat = c.eat as Box;
      const where = c.split ? "split" : c.walkPlace;
      seen.add(where);
      const within = where === "stage" ? b.clear : (b.column as Box);
      if (!inside(eat, within))
        wrong.push(`${name(s, st, m)}: outside its ${where === "stage" ? "clear area" : "band"}`);
      const k = c.all.indexOf(eat);
      if (k < 0 || c.all[k - 1] !== c.walk) wrong.push(`${name(s, st, m)}: not listed after walk`);
      for (const [j, other] of c.all.entries())
        if (j !== k && overlaps(eat, other)) wrong.push(`${name(s, st, m)}: over all[${j}]`);
      expect(c.all.length).toBe(compactBoxes(s, st, m).all.length + 1);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    for (const where of ["stage", "column", "split"]) expect(seen.has(where), where).toBe(true);
  });

  it("ends the split layout's list above it where it sits above `walk`, its height still positive", () => {
    for (const [s, st, m] of cases()) {
      const on = splitBoxes(s, st, m, { eat: true });
      const off = splitBoxes(s, st, m);
      if (!on || !off) continue;
      const eat = on.eat as Box;
      expect(on.list.h).toBeGreaterThan(0);
      if (eat.y < on.walk.y) {
        expect(on.list.y + on.list.h, name(s, st, m)).toBeLessThanOrEqual(
          eat.y - HUD_PLACEMENTS.split.walkGapRem * m.rem + 1e-9,
        );
      } else expect(on.list).toEqual(off.list);
      for (const k of ["panel", "title", "rest", "frame", "walk"] as const) expect(on[k]).toEqual(off[k]);
    }
  });

  it("puts the stage's corner box where eatControlBox does, at every supported clear area", () => {
    let corners = 0;
    for (const [s, st, m] of cases()) {
      const c = compactBoxes(s, st, m, { eat: true });
      if (c.walkPlace !== "stage" || c.split) continue;
      corners += 1;
      const clear = hudBoxes(s, st, m).clear;
      const want = eatControlBox(clear, m.rem);
      expect(want, name(s, st, m)).not.toBeNull();
      expect(c.eat).toEqual(box(want as Rect, clear));
      expect(c.walk).toEqual(box(walkControlBox(clear, m.rem), clear));
    }
    expect(corners).toBeGreaterThan(0);
  });

  it("reserves the walking control's box and the Eat box with the option", () => {
    for (const clear of [
      { w: 1472, h: 1120.5 },
      { w: 384, h: 422 },
      { w: 328, h: 268 },
    ]) {
      expect(reservedBoxes(clear, 16, { eat: true })).toEqual([walkControlBox(clear, 16), eatControlBox(clear, 16)]);
      expect(reservedBoxes(clear, 16)).toEqual([walkControlBox(clear, 16)]);
    }
  });
});

describe("the option on: the cover rule (e) doesn't count the Eat box (RV-2, Q-R3b)", () => {
  it("takes the split layout with the option exactly where it does without", () => {
    let near = 0;
    const wrong: string[] = [];
    for (const [s, st, m] of cases()) {
      const off = splitBoxes(s, st, m);
      if ((splitBoxes(s, st, m, { eat: true }) === null) !== (off === null)) wrong.push(name(s, st, m));
      if (!off) continue;
      const b = hudBoxes(s, st, m);
      const c = compactBoxes(s, st, m);
      const cover = unionArea([c.strip, c.bar, off.rest, off.list, off.walk, notesBox(b.clear, m.rem)]) / (s.w * s.h);
      const eatArea = EAT_CONTROL.widthRem * EAT_CONTROL.heightRem * m.rem * m.rem;
      if (cover <= HUD_PLACEMENTS.split.coverMax && cover + eatArea / (s.w * s.h) > HUD_PLACEMENTS.split.coverMax)
        near += 1;
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    // Windows whose cover lies within one Eat box's area under coverMax: where counting it would have moved the choice.
    expect(near).toBeGreaterThan(0);
  });

  it("leaves alwaysOnCoverage as the option-off boxes give it", () => {
    for (const m of METRICS)
      for (const s of WINDOWS) {
        if (!fitsHud(s, OPENING, m)) continue;
        const c = compactBoxes(s, OPENING, m);
        const clear = hudBoxes(s, OPENING, m).clear;
        expect(alwaysOnCoverage(s, m)).toBe(unionArea([...c.all, notesBox(clear, m.rem)]) / (s.w * s.h));
      }
  });
});

/** The stub: SCENE with one more side-wall selectable, front right, whose core, at the clear area's frame, lies
 *  under the Eat box and clear of the walking control's box and of every other core. */
function stubUnderEat(screen: { w: number; h: number }): { scene: ProtectScene; core: Box } {
  const clear = hudBoxes(screen).clear;
  const stage = { w: clear.w, h: clear.h };
  const camera = framing(stage.w / stage.h, SCENE.framed);
  const eat = box(eatControlBox(clear) as Rect);
  const walk = box(walkControlBox(clear));
  const others = pickAreas(
    SCENE.selectables.map((s) => ({
      id: s.id,
      members: s.boxes.flatMap((b) => {
        const r = memberRect(b, camera, stage);
        return r ? [r] : [];
      }),
    })),
  ).flatMap((a) => (a.core ? [box(a.core)] : []));
  // A small box anywhere in the shell's front half; only its `sideWall` flag makes it a side-wall selectable.
  for (let x = 1.03; x > 0; x -= 0.02)
    for (let y = 0; y < 1; y += 0.02)
      for (let z = -0.03; z > -0.6; z -= 0.02) {
        const b = { min: [x, y, z - 0.03], max: [x + 0.03, y + 0.03, z] } as ProtectScene["framed"][number];
        const r = memberRect(b, camera, stage);
        if (!r) continue;
        const u = r.rect;
        const core: Box = {
          x: u[0] + u[2] / 2 - CORE_PX / 2,
          y: u[1] + u[3] / 2 - CORE_PX / 2,
          w: CORE_PX,
          h: CORE_PX,
        };
        if (!overlaps(core, eat) || overlaps(core, walk) || others.some((o) => overlaps(o, core))) continue;
        if (core.x < 0 || core.y < 0 || core.x + core.w > stage.w || core.y + core.h > stage.h) continue;
        const scene = {
          ...SCENE,
          selectables: [...SCENE.selectables, { id: "under-eat", boxes: [b], sideWall: true }],
        };
        return { scene: scene as ProtectScene, core };
      }
  throw new Error(`no box under the Eat box at ${screen.w} × ${screen.h}`);
}

describe("the option on: the framing and the reserve (Q150)", () => {
  it("builds a protector with `eat` set and a key of its own", () => {
    const eat = protectorFor(SCENE, 16, { eat: true });
    expect(eat.eat).toBe(true);
    expect(eat.key).not.toBe(protectorFor(SCENE).key);
  });

  it("frames every protected core clear of the Eat box by the margin, and the stage reserves it", () => {
    const protect = protectorFor(SCENE, 16, { eat: true });
    const margin = MARGIN_REM * DEFAULT_METRICS.rem;
    let eased = 0;
    for (const screen of [...WINDOWS, ...sweepScreens().filter((_, i) => i % 23 === 0)])
      for (const st of STATES) {
        if (!fitsHud(screen, st, DEFAULT_METRICS)) continue;
        const f = frameArea(screen, st, DEFAULT_METRICS, protect);
        const c = compactBoxes(screen, st, DEFAULT_METRICS, { eat: true });
        const eat = c.eat as Box;
        const stage = stageFor(screen, protect, st);
        // The stage's reserved boxes hold the Eat box where it lies over the frame area.
        if (overlaps(eat, f.area)) {
          const x0 = Math.max(eat.x, f.area.x);
          const y0 = Math.max(eat.y, f.area.y);
          const want: Rect = [
            x0 - f.area.x,
            y0 - f.area.y,
            Math.min(eat.x + eat.w, f.area.x + f.area.w) - x0,
            Math.min(eat.y + eat.h, f.area.y + f.area.h) - y0,
          ];
          expect(stage.reserved, name(screen, st, DEFAULT_METRICS)).toContainEqual(want);
        }
        if (f.fellBack || f.ease === 1) continue;
        eased += 1;
        const clear = hudBoxes(screen, st, DEFAULT_METRICS).clear;
        for (const p of protect.boxes(f.area, clear) ?? [])
          expect(
            p.x < eat.x + eat.w + margin &&
              eat.x - margin < p.x + p.w &&
              p.y < eat.y + eat.h + margin &&
              eat.y - margin < p.y + p.h,
            name(screen, st, DEFAULT_METRICS),
          ).toBe(false);
      }
    expect(eased).toBeGreaterThan(0);
  });

  it("holds a side-wall selectable whose core lies under the Eat box at spec 005's frame: held with the option, pressable without", () => {
    const screen = { w: 1920, h: 1200 };
    const clear = hudBoxes(screen).clear;
    const { scene, core } = stubUnderEat(screen);
    const at = { ...core, x: clear.x + core.x, y: clear.y + core.y };
    const without = protectorFor(scene).boxes(clear, clear) ?? [];
    const withEat = protectorFor(scene, 16, { eat: true }).boxes(clear, clear) ?? [];
    expect(without).toContainEqual(at);
    expect(withEat).not.toContainEqual(at);
    expect(withEat).toHaveLength(without.length - 1);
  });
});
