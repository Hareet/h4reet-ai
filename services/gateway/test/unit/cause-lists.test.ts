// Every closed list of the gateway's degraded causes holds one set (spec 010, FR-022, FR-035; plan §4.5; tasks.md
// T015): the fixed details (core/router.ts), the instruments' causes (telemetry/metrics.ts), and the twin's turns'
// causes; each with adapter_month_spent, which comes right after meter_at_ceiling in admission's precedence.
import { describe, expect, it } from "vitest";

import { DEGRADED_DETAIL } from "../../src/core/router.js";
import { DEGRADED_CAUSES, TWIN_CAUSES } from "../../src/telemetry/metrics.js";

describe("the degraded causes, one set (FR-022, FR-035)", () => {
  it("holds adapter_month_spent in every list, with its fixed detail", () => {
    const details = Object.keys(DEGRADED_DETAIL).sort();
    expect([...DEGRADED_CAUSES].sort()).toEqual(details);
    expect(TWIN_CAUSES.filter((c) => c !== "twin_unavailable" && c !== "none").sort()).toEqual(details);
    expect(details).toContain("adapter_month_spent");
    expect(DEGRADED_DETAIL.adapter_month_spent).toBe(
      "The local model is unavailable, and the paid fallback has reached its monthly cap.",
    );
  });

  it("orders it after meter_at_ceiling and before the sub-budget's causes", () => {
    const at = (cause: string) => DEGRADED_CAUSES.indexOf(cause as (typeof DEGRADED_CAUSES)[number]);
    expect(at("adapter_month_spent")).toBe(at("meter_at_ceiling") + 1);
    expect(at("adapter_month_spent")).toBeLessThan(at("fallback_awaiting_renewal"));
  });
});
