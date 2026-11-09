// The render benchmark (spec 011, plan's Performance Goals; tasks.md T022, T028): both designed forms rendered in under
// 5 ms an alert, measured on the catalogue's entries at their longest facts, each design within its share. The goal
// is generous on purpose, a guard against a renderer that grows slow, not a measurement of the machine; the note
// records the times measured.
import { describe, expect, it } from "vitest";

import { designEmail } from "../../src/alerts/email-design.js";
import { designTelegram } from "../../src/alerts/telegram-design.js";
import { entryCases, longestCases, type GoldenCase } from "../helpers/golden-cases.js";

const ROUNDS = 25;

/** The mean time, in ms, one render takes over every case, ROUNDS times, after a warm-up round. */
function meanMs(render: (c: GoldenCase) => unknown): number {
  const cases = [...entryCases(), ...longestCases()];
  for (const c of cases) render(c);
  const started = performance.now();
  for (let i = 0; i < ROUNDS; i++) for (const c of cases) render(c);
  return (performance.now() - started) / (ROUNDS * cases.length);
}

describe("the render benchmark (plan's Performance Goals)", () => {
  it("renders Telegram's designed message within its share of 5 ms an alert", () => {
    const ms = meanMs((c) => designTelegram(c.ctx, c.spec, c.sample));
    console.info(`alert-render-bench: telegram ${ms.toFixed(4)} ms an alert`);
    expect(ms).toBeLessThan(2.5);
  });

  it("renders both designed forms in under 5 ms an alert (tasks.md T028)", () => {
    const ms = meanMs((c) => {
      designTelegram(c.ctx, c.spec, c.sample);
      designEmail(c.ctx, c.spec, c.sample);
    });
    console.info(`alert-render-bench: both designs ${ms.toFixed(4)} ms an alert`);
    expect(ms).toBeLessThan(5);
  });
});
