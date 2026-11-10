// The HUD's layout model with real text (spec 005, T008; plan.md §3.3): jsdom lays nothing out, so the rows and lines
// each part of the HUD takes are computed here, from `compose/hud.ts`'s table (the sizes in rem, which
// test/room/stages.test.ts and test/ui/hud.test.ts pin room.css to) and each control's words measured in the page's
// typeface, the vendored IBM Plex Sans, with fontkit, wrapped as flex lines and floats wrap. It began as
// test/ui/a11y.test.ts's 320 × 568 page model, whose measuring helpers moved here; a11y.test.ts reads them from here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { create } from "fontkit";
import type { Font } from "fontkit";

import type { RoomIndex } from "../../src/room/compose/bundle";
import { DEFAULT_METRICS, HUD_PLACEMENTS, OPENING, fitsHud, hudBoxes, layoutFor } from "../../src/room/compose/hud";
import type { Box, HudLayout, HudMetrics, HudState } from "../../src/room/compose/hud";
import { AI_DISCLOSURE, WEB } from "../helpers/room";

let plex: Font | null = null;
/** A text's advance width in CSS pixels, in the page's typeface at `size` px, kerning applied. */
export function textWidth(text: string, size: number): number {
  plex ??= create(readFileSync(join(WEB, "fonts", "IBMPlexSans-Regular.woff"))) as Font;
  return (plex.layout(text).advanceWidth / plex.unitsPerEm) * size;
}

/** How many rows a wrapping flex line of items takes in a width, with a gap between items. */
export function flexRows(widths: readonly number[], width: number, gap: number): number {
  let rows = 0;
  let used = Infinity;
  for (const w of widths) {
    if (used + gap + w <= width) used += gap + w;
    else {
      rows += 1;
      used = w;
    }
  }
  return rows;
}

/** How many lines a paragraph's words wrap to in a width. */
export function textLines(text: string, size: number, width: number): number {
  const space = textWidth(" ", size);
  return flexRows(
    text
      .split(/\s+/)
      .filter((w) => w !== "")
      .map((w) => textWidth(w, size)),
    width,
    space,
  );
}

/** How many lines a run of inline blocks takes beside a float on its first line: each block and the float carry a
 *  right margin of `gap`, and a line holds what fits, margins included, as a browser fills a line box. */
export function floatRows(float: number, widths: readonly number[], width: number, gap: number): number {
  let rows = 1;
  let used = float + gap;
  for (const w of widths) {
    if (used + w + gap <= width) used += w + gap;
    else {
      rows += 1;
      used = w + gap;
    }
  }
  return rows;
}

/** The words the HUD shows, from the bundle's index where it has them. */
export interface HudWords {
  readonly disclosure: string;
  /** The bar's six controls, the full-screen control's longer words and "Credits" counted wherever they could show. */
  readonly bar: readonly string[];
  readonly listHeading: string;
  readonly names: readonly string[];
  readonly talkLabel: string;
  /** The text box's row: Send (the longer of Send and Stop) and the talk button. */
  readonly talkButtons: readonly string[];
  /** The log's header buttons: its toggle and the larger view's (the longer of its two words). */
  readonly logHeader: readonly string[];
}

export function hudWords(index: Pick<RoomIndex, "ui" | "selectables">): HudWords {
  const ui = (key: string, fallback: string): string => index.ui[key] ?? fallback;
  const longer = (a: string, b: string): string => (a.length >= b.length ? a : b);
  return {
    disclosure: AI_DISCLOSURE,
    bar: [
      "Resume",
      "2D view",
      ui("pause.button", "Pause the room"),
      longer(ui("fullscreen.enter", "Full screen"), ui("fullscreen.leave", "Leave full screen")),
      "How data flows",
      ui("toolbar.credits", "Credits"),
    ],
    listHeading: ui("list.heading", "In the room"),
    names: index.selectables.map((s) => s.name),
    talkLabel: "Your message",
    talkButtons: ["Send", "Hold to talk"],
    logHeader: [
      ui("hud.log_toggle", "Conversation"),
      longer(ui("talk.larger", "Larger conversation"), ui("talk.smaller", "Smaller conversation")),
    ],
  };
}

/** What the model finds at a screen: each part's rows or lines, and where the text box's row sits. */
export interface HudModel {
  readonly layout: HudLayout | "stacked";
  readonly stripLines: number;
  readonly barRows: number;
  /** The list's rows beside its header button: the dock's strip, or the column's list. */
  readonly listRows: number;
  /** The text box's row: its input, Send, and the talk button, wrapping. */
  readonly talkRows: number;
  /** The column's least content (the list's header row, the log's header row, the status line, the label, and the
   *  text box's rows) within the column's height: the text box's row is in view. True in the dock layout. */
  readonly columnHolds: boolean;
  /** The text box's row's foot, from the window's top, in the dock layout; the column's foot in the column layout. */
  readonly talkBottom: number;
  readonly clear: Box;
}

/** The model of the HUD at a screen, a panel state, and the window's metrics. */
export function hudModel(
  screen: { readonly w: number; readonly h: number },
  words: HudWords,
  state: HudState = OPENING,
  metrics: HudMetrics = DEFAULT_METRICS,
): HudModel {
  const t = HUD_PLACEMENTS;
  const rem = metrics.rem;
  const border = 2 * t.borderPx;
  const across = screen.w - metrics.safe.left - metrics.safe.right;
  const boxes = hudBoxes(screen, state, metrics);
  const layout = fitsHud(screen, state, metrics) ? layoutFor(screen, metrics) : "stacked";

  const stripLines = textLines(words.disclosure, t.strip.fontRem * rem, across - 2 * t.strip.padXRem * rem);

  const tile = (word: string): number =>
    Math.max(t.bar.tileRem * rem, textWidth(word, t.bar.fontRem * rem) + 2 * t.bar.tilePadXRem * rem + border);
  const barRows = flexRows(words.bar.map(tile), across - 2 * t.bar.padRem * rem, t.bar.gapRem * rem);

  const listButton = (name: string): number =>
    Math.max(t.list.rowRem * rem, textWidth(name, t.list.fontRem * rem) + 2 * t.list.padXRem * rem + border);
  const header =
    textWidth(words.listHeading, t.list.fontRem * rem) +
    (t.list.iconRem + t.list.iconGapRem + 2 * t.list.padXRem) * rem +
    border;
  const panelWidth =
    layoutFor(screen, metrics) === "column"
      ? (boxes.column?.w ?? 0) - metrics.safe.right - 2 * t.column.padRem * rem
      : across - 2 * t.dock.padRem * rem;
  const listRows = floatRows(header, words.names.map(listButton), panelWidth, t.list.gapRem * rem);

  const talkButton = (word: string): number =>
    Math.max(t.talk.rowRem * rem, textWidth(word, rem) + 2 * t.talk.buttonPadXRem * rem + border);
  const talkRows = flexRows(
    [t.talk.inputMinRem * rem, ...words.talkButtons.map(talkButton)],
    panelWidth,
    t.talk.rowGapRem * rem,
  );
  const talkHeight =
    t.talk.labelRem * t.talk.lineHeight * rem +
    t.talk.gapRem * rem +
    talkRows * t.talk.rowRem * rem +
    (talkRows - 1) * t.talk.rowGapRem * rem;

  let columnHolds = true;
  let talkBottom = screen.h - boxes.bar.h;
  if (boxes.column) {
    const row = (t.list.rowRem + t.list.gapRem) * rem;
    const least = row + row + t.talk.statusRem * rem + talkHeight + 2 * t.column.padRem * rem;
    columnHolds = least <= boxes.column.h;
    talkBottom = boxes.column.y + boxes.column.h;
  }
  return { layout, stripLines, barRows, listRows, talkRows, columnHolds, talkBottom, clear: boxes.clear };
}
