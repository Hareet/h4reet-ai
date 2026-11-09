// The golden files (spec 011, FR-004, FR-005; SC-001; plan §3.4, D13): every catalogue entry and further case, each
// form pinned byte for byte under test/fixtures/alerts/<case>/. They are written only by this test run with vitest's
// -u, in the task that changes a design, and read in the diff; never by hand, and never in a fix task. The HTML files
// are the Author's offline preview: a browser opens them from the working tree, and they load nothing.
//
//   plain.txt      the plain text, byte for byte
//   telegram.txt   the designed text, then "--- entities (UTF-16 offset, length)", then one line per entity: its type,
//                  offset, length, and the text it covers, JSON-quoted, so each entity reads on its words
import { describe, expect, it } from "vitest";

import { renderAlert } from "../../src/alerts/format.js";
import type { TelegramMessage } from "../../src/alerts/forms.js";
import { designTelegram } from "../../src/alerts/telegram-design.js";
import { caseLongest, entryCases, furtherCases, type GoldenCase } from "../helpers/golden-cases.js";

const telegramOf = (c: GoldenCase): TelegramMessage => designTelegram(c.ctx, c.spec, c.sample);

/** telegram.txt: the text, the marker line, and each entity on its words. */
export function telegramFile(m: TelegramMessage): string {
  const lines = m.entities.map(
    (e) => `${e.type} ${e.offset} ${e.length} ${JSON.stringify(m.text.slice(e.offset, e.offset + e.length))}`,
  );
  return `${m.text}\n--- entities (UTF-16 offset, length)\n${lines.join("\n")}\n`;
}

const cases = (): GoldenCase[] => [...entryCases(), ...furtherCases(), caseLongest((c) => telegramOf(c).text.length)];
const file = (c: GoldenCase, name: string): string => `../fixtures/alerts/${c.name}/${name}`;

describe("the golden files (FR-005; plan §3.4)", () => {
  it("name the 19 entries in FR-004's order, then the further cases", () => {
    expect(cases().map((c) => c.name)).toEqual([
      "01-warn-day",
      "02-warn-month",
      "03-warn-fallback-grant",
      "04-warn-adapter-month",
      "05-trip",
      "06-exhausted-grant",
      "07-exhausted-adapter-month",
      "08-operator-reset",
      "09-operator-renew",
      "10-operator-init",
      "11-studio-opened",
      "12-studio-closed",
      "13-credentials-expiring",
      "14-unavailable-bedrock",
      "15-unavailable-anthropic",
      "16-auth-failed",
      "17-store-unreachable",
      "18-reminder-degraded",
      "19-reminder-awaiting",
      "case-trip-month",
      "case-unavailable-credentials",
      "case-reminder-both",
      "case-reset-none-at-ceiling",
      "case-dev-test-clock",
      "case-longest",
    ]);
  });

  for (const c of cases()) {
    describe(c.name, () => {
      it("pins the plain text", async () => {
        await expect(renderAlert(c.ctx, c.spec, c.sample).body).toMatchFileSnapshot(file(c, "plain.txt"));
      });

      it("pins Telegram's designed message and its entities", async () => {
        await expect(telegramFile(telegramOf(c))).toMatchFileSnapshot(file(c, "telegram.txt"));
      });
    });
  }
});
