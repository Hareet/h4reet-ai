// The paper's drawing (spec 029; FR-020; plan.md §R-C4): the sheet the twin hands over and the visitor keeps, an
// off-white page with a thin rule border and its word, the UI word `paper.word` ("RESUME"), set across it along its
// diagonal, lower left to upper right, in the look's `chalk` face. Pure: a layout from the word and the sheet's size,
// and its drawing on a canvas context, which the 3D room's sheet takes as its texture (scene/bundle3d.ts); the 2D room
// draws the same layout as SVG (flat.ts). Lengths are in the sheet's own units, from its top left, y down, so a turn
// from lower left to upper right is minus the diagonal's angle.
//
// The word's size comes from its length, not from measuring it: each character is taken as ADVANCE_EM wide, an estimate
// over Patrick Hand's capitals that errs wide, so the word's run is at most RUN of the diagonal and its ends stay
// inside the border where the sheet narrows round the diagonal; the canvas's own maxWidth holds it there too.

/** The page and the ink: the ink at well over 3:1 on the page. */
export const PAPER_PAGE = "#f7f3ea";
export const PAPER_INK = "#2a2f3a";

/** The border's inset and its rule's width, as shares of the sheet's width. */
const INSET = 0.04;
const RULE = 0.006;
/** The word's run, as a share of the sheet's diagonal, and the width taken for each character, in ems. */
const RUN = 0.7;
const ADVANCE_EM = 0.62;
/** Where the baseline sits below the word's centre, in ems: about half a capital's height. */
const BASELINE_EM = 0.35;

export interface PaperLayout {
  readonly page: string;
  readonly ink: string;
  readonly border: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly width: number;
  };
  readonly word: {
    readonly text: string;
    /** Its centre on the sheet. */
    readonly x: number;
    readonly y: number;
    /** Its turn about its centre, in radians. */
    readonly angle: number;
    /** Its em, and its run, the longest it is drawn. */
    readonly size: number;
    readonly run: number;
    /** Its baseline below its centre, along its own up. */
    readonly baseline: number;
  };
}

/** The sheet's drawing at w × h. */
export function paperLayout(word: string, w: number, h: number): PaperLayout {
  const inset = INSET * w;
  const run = RUN * Math.hypot(w, h);
  const size = run / (Math.max(1, [...word].length) * ADVANCE_EM);
  return {
    page: PAPER_PAGE,
    ink: PAPER_INK,
    border: {
      x: inset,
      y: inset,
      w: w - 2 * inset,
      h: h - 2 * inset,
      width: RULE * w,
    },
    word: {
      text: word,
      x: w / 2,
      y: h / 2,
      angle: -Math.atan2(h, w),
      size,
      run,
      baseline: BASELINE_EM * size,
    },
  };
}

/** The layout drawn on a canvas context of w × h, its word in `family` (a family list, as a font's family is written). */
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  layout: PaperLayout,
  w: number,
  h: number,
  family: string,
): void {
  const { border, word } = layout;
  ctx.fillStyle = layout.page;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = layout.ink;
  ctx.lineWidth = border.width;
  ctx.strokeRect(border.x, border.y, border.w, border.h);
  if (word.text === "") return;
  ctx.save();
  ctx.translate(word.x, word.y);
  ctx.rotate(word.angle);
  ctx.fillStyle = layout.ink;
  ctx.font = `400 ${word.size}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(word.text, 0, word.baseline, word.run);
  ctx.restore();
}
