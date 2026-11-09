// The email's designed form (spec 011, FR-015 to FR-022; Q1's and Q5's answers; plan §5): an HTML part beside the
// plain text, under the designed subject, written by hand as the table-and-inline-style HTML MJML would produce, with
// no package (FR-052; the Author's answer, "Hand-written tables (Recommended)").
//
// - One outer table, 100% wide, and one card, 600 pixels wide at most and fluid below it, on presentation tables, in
//   FR-003's order: a sample's banner; the severity's band; the headline; what to do next; the meters, each with its
//   numbers, its bar, and its warning's tick; the states; the time, the alert's ID, and the runbook path, as text.
// - It loads nothing: only the elements and attributes of plan §5.4, no URL, no link, no image (FR-019). Every value
//   passes through escapeHtml (FR-017).
// - The light palette is inline, so a client that drops <style> shows it; the dark one is under
//   prefers-color-scheme: dark, by class, with !important to win over the inline styles (FR-020). The severity reads
//   in words and emoji as well as colour (FR-007), and every bar has its numbers beside it (FR-021).
import { alertParts, usd, type AlertContext, type AlertSpec, type MeterRow } from "./format.js";
import type { DesignedEmail, SampleMark } from "./forms.js";
import { PALETTE, SAMPLE_EMOJI, marksOf } from "./marks.js";

const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,Menlo,Consolas,monospace";
const LIGHT = PALETTE.light;
const DARK = PALETTE.dark;

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Every value the HTML writes, as text: &, <, >, ", and ' escaped (FR-017). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/** The designed subject (FR-016): the severity's emoji, a space, the kind's, a space, and the first line; 🧪 first for a sample. */
export function designedSubject(ctx: AlertContext, spec: AlertSpec, sample?: SampleMark): string {
  const marks = marksOf(spec);
  const first = alertParts(ctx, spec, sample).firstLine;
  return `${sample === undefined ? "" : `${SAMPLE_EMOJI} `}${marks.severityEmoji} ${marks.kindEmoji} ${first}`;
}

const font = (size: number, line: number, weight = 400, family = SANS): string =>
  `font-family:${family};font-size:${size}px;line-height:${line}px;font-weight:${weight};`;
const TABLE = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';

/** A label above its value, as text. */
const label = (words: string): string =>
  `<span class="h4-label" style="${font(12, 16, 600)}color:${LIGHT.label};text-transform:uppercase;` +
  `letter-spacing:0.06em;">${escapeHtml(words)}</span>`;

/** A meter's share of its full bar, in whole percent, never more than 100 (FR-021). */
function percentOf(value: bigint, full: bigint): number {
  if (full <= 0n) return 0;
  return Number(((value < full ? value : full) * 100n) / full);
}

/** A meter's numbers: spent against its ceiling, and its warning, grant, or month, as the plain text shows them. */
function numbers(row: MeterRow): string {
  const base = `${usd(row.spentMicro)} / ${usd(row.ceilingMicro)} USD`;
  if (row.month !== undefined) return `${base} · ${row.month}`;
  if (row.grantNo !== undefined) {
    return `${base} · grant ${row.grantNo}${row.warnMicro === undefined ? "" : `, warning ${usd(row.warnMicro)}`}`;
  }
  return row.warnMicro === undefined ? base : `${base} · warning ${usd(row.warnMicro)}`;
}

/** One meter: its label and numbers, its bar in the severity's colour, and its warning's tick in its own row. */
function meter(row: MeterRow, fill: string): string {
  const share = percentOf(row.spentMicro, row.ceilingMicro);
  const cell = (cls: string, width: number, color: string): string =>
    `<td class="${cls}" width="${width}%" style="width:${width}%;height:10px;background-color:${color};` +
    `font-size:1px;line-height:10px;">&nbsp;</td>`;
  const bar =
    (share > 0 ? cell("h4-fill", share, fill) : "") + (share < 100 ? cell("h4-track", 100 - share, LIGHT.track) : "");
  const tick =
    row.warnMicro === undefined
      ? ""
      : `<table ${TABLE}><tr>` +
        `<td class="h4-tickpad" width="${percentOf(row.warnMicro, row.ceilingMicro)}%" style="width:` +
        `${percentOf(row.warnMicro, row.ceilingMicro)}%;height:6px;font-size:1px;line-height:6px;">&nbsp;</td>` +
        `<td class="h4-tick" width="2" style="width:2px;height:6px;background-color:${LIGHT.tick};font-size:1px;` +
        `line-height:6px;">&nbsp;</td><td style="height:6px;font-size:1px;line-height:6px;">&nbsp;</td></tr></table>`;
  return (
    `<tr><td style="padding:12px 24px 0 24px;">` +
    `<table ${TABLE}><tr>` +
    `<td class="h4-text" valign="bottom" style="${font(14, 20, 600)}color:${LIGHT.text};">${escapeHtml(row.label)}</td>` +
    `<td class="h4-text" align="right" valign="bottom" style="${font(13, 20, 400, MONO)}color:${LIGHT.text};">` +
    `${escapeHtml(numbers(row))}</td>` +
    `</tr></table>` +
    `<table ${TABLE} style="margin-top:6px;border-radius:5px;"><tr>${bar}</tr></table>` +
    tick +
    `</td></tr>`
  );
}

/** A row of labelled values: the states, then the details. */
function facts(rows: readonly [string, string, boolean][]): string {
  const line = ([name, value, mono]: [string, string, boolean]): string =>
    `<tr><td class="h4-label" valign="top" width="96" style="width:96px;padding:4px 12px 4px 0;${font(13, 20, 600)}` +
    `color:${LIGHT.label};">${escapeHtml(name)}</td>` +
    `<td class="h4-text" valign="top" style="padding:4px 0;${font(14, 20, 400, mono ? MONO : SANS)}` +
    `color:${LIGHT.text};word-break:break-all;">${escapeHtml(value)}</td></tr>`;
  return `<table ${TABLE}>${rows.map(line).join("")}</table>`;
}

export function designEmail(ctx: AlertContext, spec: AlertSpec, sample?: SampleMark): DesignedEmail {
  const p = alertParts(ctx, spec, sample);
  const marks = marksOf(spec);
  const band = { light: LIGHT.band[marks.severity], dark: DARK.band[marks.severity] };
  const subject = designedSubject(ctx, spec, sample);
  const rows: string[] = [];
  if (p.sampleLine !== undefined) {
    rows.push(
      `<tr><td style="padding:16px 24px 4px 24px;"><table ${TABLE}><tr>` +
        `<td class="h4-sample h4-text" style="border:2px dashed ${LIGHT.label};border-radius:6px;padding:10px 14px;` +
        `${font(14, 20)}color:${LIGHT.text};">${SAMPLE_EMOJI} <strong>SAMPLE</strong> · ${escapeHtml(p.sampleLine)}</td>` +
        `</tr></table></td></tr>`,
    );
  }
  rows.push(
    `<tr><td class="h4-band" style="background-color:${band.light.background};color:${band.light.text};` +
      `padding:14px 24px;${font(14, 20, 700)}letter-spacing:0.04em;">` +
      `${marks.severityEmoji} ${escapeHtml(marks.name.toUpperCase())} · ${escapeHtml(ctx.prefix)}</td></tr>`,
    `<tr><td class="h4-text" style="padding:20px 24px 4px 24px;${font(20, 28, 700)}color:${LIGHT.text};">` +
      `${marks.kindEmoji} ${escapeHtml(p.headline)}</td></tr>`,
  );
  if (p.sentence !== undefined) {
    rows.push(
      `<tr><td style="padding:12px 24px 0 24px;">${label("What to do next")}<br>` +
        `<span class="h4-text" style="${font(15, 22)}color:${LIGHT.text};">${escapeHtml(p.sentence)}</span></td></tr>`,
    );
  }
  if (p.meters.length > 0) {
    rows.push(`<tr><td style="padding:22px 24px 0 24px;">${label("Meters")}</td></tr>`);
    for (const row of p.meters) rows.push(meter(row, band.light.background));
    if (p.synthetic) {
      rows.push(
        `<tr><td class="h4-label" style="padding:8px 24px 0 24px;${font(12, 16)}color:${LIGHT.label};">` +
          `(synthetic spend)</td></tr>`,
      );
    }
  }
  const states: [string, string, boolean][] = [["Runtime", p.runtime, false]];
  if (p.fallback !== undefined) states.push(["Fallback", p.fallback, false]);
  rows.push(`<tr><td style="padding:22px 24px 0 24px;">${facts(states)}</td></tr>`);
  rows.push(
    `<tr><td style="padding:16px 24px 24px 24px;"><table ${TABLE} style="border-top:1px solid ${LIGHT.track};">` +
      `<tr><td style="padding-top:12px;">` +
      facts([
        ["Time", p.time, false],
        ["Alert ID", ctx.dedupeKey, true],
        ["Runbook", p.runbookPath, true],
      ]) +
      `</td></tr></table></td></tr>`,
  );

  const css =
    ":root{color-scheme:light dark;supported-color-schemes:light dark}\n" +
    "a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;" +
    "font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important}\n" +
    "@media (prefers-color-scheme: dark){\n" +
    `.h4-page{background-color:${DARK.page} !important}\n` +
    `.h4-card{background-color:${DARK.card} !important}\n` +
    `.h4-text{color:${DARK.text} !important}\n` +
    `.h4-label{color:${DARK.label} !important}\n` +
    `.h4-band{background-color:${band.dark.background} !important;color:${band.dark.text} !important}\n` +
    `.h4-fill{background-color:${band.dark.background} !important}\n` +
    `.h4-track{background-color:${DARK.track} !important}\n` +
    `.h4-tick{background-color:${DARK.tick} !important}\n` +
    `.h4-sample{border-color:${DARK.label} !important}\n` +
    "}\n";

  const html =
    "<!DOCTYPE html>\n" +
    '<html lang="en" dir="ltr">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="color-scheme" content="light dark">\n' +
    '<meta name="supported-color-schemes" content="light dark">\n' +
    '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">\n' +
    `<title>${escapeHtml(subject)}</title>\n` +
    `<style>\n${css}</style>\n` +
    "</head>\n" +
    `<body class="h4-page" style="margin:0;padding:0;background-color:${LIGHT.page};">\n` +
    `<table ${TABLE} class="h4-page" style="background-color:${LIGHT.page};">\n` +
    `<tr><td align="center" style="padding:24px 12px;">\n` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="h4-card" ` +
    `style="width:100%;max-width:600px;background-color:${LIGHT.card};border-radius:8px;">\n` +
    `${rows.join("\n")}\n` +
    "</table>\n</td></tr>\n</table>\n</body>\n</html>\n";
  return { subject, html };
}
