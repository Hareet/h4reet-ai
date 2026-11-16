// The terminal (spec 004; FR-031; R-36, R-37, R-38): the monitor's left half, a Claude Code session in a terminal, in
// IBM Plex Mono. Its block's lines fill its grid's rows from the top, each from the grid's first column, typed once at
// the screens' rate (compose/layout.ts, the rate RT6 holds a script to), a cursor after the last character while it
// types, then held. The 3D room redraws it at the quality level's typing rate, and shows its final frame under reduced
// motion, while paused, at quality 3, and in 2D (scene/faces3d.ts, flat.ts).
// Spec 029 (FR-019; plan.md §R-C3): a block with `ink: green` draws its words and its cursor in the terminal's green;
// with `cursor: blink`, a block cursor stays after the last character once the typing ends, shown in its phase "on" and
// hidden in its phase "off", BLINK_MS each, counted from the typing's end, and shown in the final frame, which is what
// the room holds while it doesn't animate (scene/faces3d.ts). A block without the two keys draws as before.
import { GRID_METRICS, TYPING_CHARS_PER_S, textGrid, typingSeconds } from "../compose/layout";
import { badgeOps, copyOf, typedLines } from "./display-list";
import type { Op } from "./display-list";
import type { FaceRenderer, RegionInput } from "./registry";

/** Where a line's baseline sits in its row, as a share of the row's pitch. */
export const BASELINE = 0.78;
const INK = "#d6dde6";
const CURSOR = "#8fc3ff";
/** The terminal's green (spec 029, FR-019): 4.5:1 or more on its ground, #0f1419. */
export const TERMINAL_GREEN = "#4be37a";
/** How long a blinking cursor is shown, and then hidden: under once a second each way (WCAG 2.2's 2.3.1). */
export const BLINK_MS = 530;

/** The region's grid in its own pixels: its glyph size and line pitch. */
function grid(input: RegionInput): { em: number; pitch: number } {
  const g = textGrid("terminal", input.grid, input.box);
  return g ? { em: g.em, pitch: g.pitch } : { em: 0, pitch: 0 };
}

export const terminal: FaceRenderer = {
  id: "terminal",
  background: "#0f1419",
  layout(input) {
    const { em } = grid(input);
    return {
      words: [...input.lines],
      copy: copyOf(input.lines, input.badge),
      typingMs: typingSeconds(input.lines) * 1000,
      glyph: input.typeface.capRatio * em,
      ...(input.cursor === "blink" ? { blinkMs: BLINK_MS } : {}),
    };
  },
  draw(input, ms = Infinity) {
    const { em, pitch } = grid(input);
    const { box, typeface } = input;
    const typed = typedLines(input.lines, ms, TYPING_CHARS_PER_S);
    const ink = input.ink === "green" ? TERMINAL_GREEN : INK;
    const ops: Op[] = [];
    typed.forEach((text, row) => {
      if (text === "") return;
      ops.push({
        op: "text",
        x: box.x,
        y: box.y + pitch * (row + BASELINE),
        text,
        anchor: "start",
        size: em,
        family: typeface.family,
        weight: typeface.weight,
        color: ink,
        tube: null,
      });
    });
    // While it types, a block cursor after the last character typed: Plex Mono's cells are 0.6 em wide. Once typed, a
    // blinking cursor after the last line's last character, in its phase "on" and in the final frame.
    const typingMs = typingSeconds(input.lines) * 1000;
    const typing = ms < typingMs;
    const blinkOn = input.cursor === "blink" && (ms === Infinity || Math.floor((ms - typingMs) / BLINK_MS) % 2 === 0);
    const last = typing
      ? Math.max(
          0,
          typed.findIndex((t, k) => t.length < [...(input.lines[k] ?? "")].length),
        )
      : blinkOn
        ? input.lines.length - 1
        : -1;
    if (last >= 0) {
      const advance = GRID_METRICS.terminal.advance * em;
      ops.push({
        op: "rect",
        x: box.x + [...(typed[last] ?? "")].length * advance,
        y: box.y + pitch * last + pitch * 0.12,
        w: advance,
        h: pitch * 0.76,
        color: input.ink === "green" ? TERMINAL_GREEN : CURSOR,
      });
    }
    return [...ops, ...badgeOps(input.badge, box, em, typeface.family)];
  },
};
