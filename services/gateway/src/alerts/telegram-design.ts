// Telegram's designed message (spec 011, FR-003, FR-008 to FR-012, FR-014; plan §4.1 to §4.3): the plain text's
// parts in short labelled lines, with message entities, and never parse_mode, so every value is carried as itself.
//
//   🧪 SAMPLE · A sample, sent by operator #1a2b3c4d: nothing happened on prod.     a sample only; SAMPLE in bold
//   🔴 Critical · [h4reet.ai prod]                                                  the severity's emoji and name
//   🛑 KILL SWITCH TRIPPED: daily ceiling reached                                    the kind's emoji; bold headline
//   Next: Every request now gets the degraded response, …                            where the kind has a sentence
//   Meters                                                                           where the alert has meters
//   Daily      5.00 /  5.00 USD   warning  3.50                                      one pre block, aligned columns
//   …
//   Runtime: degraded since 2026-10-29T16:40:03Z
//   Fallback: available                                                              where the plain text shows it
//   Time: 2026-10-29T16:40:03Z
//   id prod:trip:day:2026-10-29                                                      code over the key (FR-012)
//   Runbook: docs/runbooks/kill-switch-trip.md                                       code over the path
//
// The builder appends segments to one string and records each entity at the string's length before its segment, so
// offsets and lengths count UTF-16 code units, as the Bot API does: an emoji before an entity moves it by its true
// length (D4). No emoji enters the block. forms.ts checks the result before it is used (FR-014).
import { alertParts, usd, type AlertContext, type AlertSpec, type MeterRow } from "./format.js";
import type { SampleMark, TelegramEntity, TelegramMessage } from "./forms.js";
import { SAMPLE_EMOJI, marksOf } from "./marks.js";

class Builder {
  text = "";
  readonly entities: TelegramEntity[] = [];

  add(segment: string, type?: TelegramEntity["type"]): this {
    if (type !== undefined && segment.length > 0) {
      this.entities.push({ type, offset: this.text.length, length: segment.length });
    }
    this.text += segment;
    return this;
  }

  line(): this {
    this.text += "\n";
    return this;
  }
}

/** The meters block's rows (plan §4.1): the label, the spend against its ceiling, and its warning, grant, or month. */
export function meterBlock(rows: readonly MeterRow[], synthetic: boolean): string[] {
  const labelWidth = Math.max(...rows.map((r) => r.label.length));
  const spentWidth = Math.max(...rows.map((r) => usd(r.spentMicro).length));
  const ceilingWidth = Math.max(...rows.map((r) => usd(r.ceilingMicro).length));
  const warnings = rows.filter((r) => r.grantNo === undefined && r.warnMicro !== undefined);
  const warnWidth = Math.max(0, ...warnings.map((r) => usd(r.warnMicro as bigint).length));
  const out = rows.map((r) => {
    const amounts = `${usd(r.spentMicro).padStart(spentWidth)} / ${usd(r.ceilingMicro).padStart(ceilingWidth)} USD`;
    let extra: string;
    if (r.month !== undefined) extra = r.month;
    else if (r.grantNo !== undefined)
      extra = `grant ${r.grantNo}${r.warnMicro === undefined ? "" : `, warning ${usd(r.warnMicro)}`}`;
    else extra = r.warnMicro === undefined ? "" : `warning ${usd(r.warnMicro).padStart(warnWidth)}`;
    return `${r.label.padEnd(labelWidth)}  ${amounts}${extra === "" ? "" : `   ${extra}`}`;
  });
  if (synthetic) out.push("(synthetic spend)");
  return out;
}

export function designTelegram(ctx: AlertContext, spec: AlertSpec, sample?: SampleMark): TelegramMessage {
  const p = alertParts(ctx, spec, sample);
  const marks = marksOf(spec);
  const b = new Builder();
  if (p.sampleLine !== undefined) {
    b.add(`${SAMPLE_EMOJI} `).add("SAMPLE", "bold").add(` · ${p.sampleLine}`).line();
  }
  b.add(`${marks.severityEmoji} ${marks.name} · ${ctx.prefix}`).line();
  b.add(`${marks.kindEmoji} `).add(p.headline, "bold").line();
  if (p.sentence !== undefined) b.add(`Next: ${p.sentence}`).line();
  if (p.meters.length > 0) b.add("Meters").line().add(meterBlock(p.meters, p.synthetic).join("\n"), "pre").line();
  b.add(`Runtime: ${p.runtime}`).line();
  if (p.fallback !== undefined) b.add(`Fallback: ${p.fallback}`).line();
  b.add(`Time: ${p.time}`).line();
  b.add("id ").add(ctx.dedupeKey, "code").line();
  b.add("Runbook: ").add(p.runbookPath, "code");
  return { text: b.text, entities: b.entities };
}
