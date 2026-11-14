import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
import { it } from "vitest";
import { DEFAULT_METRICS, HUD_PLACEMENTS, compactBoxes, hudBoxes, notesBox, splitBoxes, unionArea, fitsHud } from "../../src/room/compose/hud";
import type { HudMetrics } from "../../src/room/compose/hud";
import { sweepScreens } from "../../src/room/compose/stages";
it("probe", () => {
  const ms: HudMetrics[] = [DEFAULT_METRICS, { ...DEFAULT_METRICS, rem: 20 }, { rem: 16, safe: { top: 0, right: 44, bottom: 21, left: 44 } }, { ...DEFAULT_METRICS, rem: 32 }];
  for (const m of ms) {
    const rem = m.rem; const g = 0.25 * rem; const ew = 8 * rem, eh = 2.75 * rem;
    let near = 0, splits = 0, headNarrow = 0, headNoAbove = 0, stageNoLeft = 0, stageNoAbove = 0, splitNoLeft = 0, n = 0;
    const screens = [...sweepScreens()];
    for (let w = 1200; w <= 2600; w += 4) for (let h = 600; h <= 1400; h += 4) screens.push({ w, h });
    for (const s of screens) {
      for (const st of [{ list: "open" as const }, { list: "collapsed" as const }]) {
      if (!fitsHud(s, st, m)) continue;
      n++;
      const c = compactBoxes(s, st, m); const b = hudBoxes(s, st, m);
      if (c.split) {
        splits++;
        const sp = c.split; const strip = c.strip, cl = c.bar;
        const cover = unionArea([strip, cl, sp.rest, sp.list, sp.walk, notesBox(b.clear, rem)]) / (s.w * s.h);
        if (cover + (ew * eh) / (s.w * s.h) > HUD_PLACEMENTS.split.coverMax) near++;
        if (sp.walk.x - g - ew < b.column!.x) splitNoLeft++;
      } else if (c.walkPlace === "column") {
        if (c.walk.x - g - ew < b.column!.x) { headNarrow++; if (c.walk.y - g - eh < b.column!.y) headNoAbove++; }
      } else {
        const lx = c.walk.x - g - ew; if (lx < b.clear.x) { stageNoLeft++; if (c.walk.y - g - eh < b.clear.y) stageNoAbove++; }
      }
      }
    }
    require("node:fs").appendFileSync("/tmp/impl024/p2.txt", JSON.stringify({ rem, safe: m.safe.left, n, splits, near, splitNoLeft, headNarrow, headNoAbove, stageNoLeft, stageNoAbove }) + "\n");
  }
});
