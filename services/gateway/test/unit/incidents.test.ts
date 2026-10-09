// The incident draft's template (tasks.md T078; contracts/alerts.md §7): pure, deterministic, no model call.
// - the template's text and order, with the evidence filled in, amounts in USD with six decimals;
// - the same evidence gives the same bytes, so the row's SHA-256 identifies the draft;
// - the daily totals only for the monthly ceiling;
// - a ceiling crossed on a stack degraded already says so, rather than "set in the same transaction";
// - table cells escape `|`, and the audit trail's reasons stay in the operator's words.
import { describe, expect, it } from "vitest";

import { draftName, renderDraft, type DraftEvidence } from "../../src/incidents/draft.js";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const LEDGER = "c4e2a9d1-8f3b-4c6e-a2d7-5b9f1e3c7a40";
const at = (iso: string): number => Date.parse(iso);

function evidence(o: Partial<DraftEvidence> = {}): DraftEvidence {
  return {
    stack: "dev",
    ceiling: "day",
    periodKey: "2026-11-22",
    crossedAt: at("2026-11-22T08:41:05.123Z"),
    degradedAt: at("2026-11-22T08:41:05.123Z"),
    setDegraded: true,
    crossedAtReal: at("2026-10-09T12:00:00.000Z"),
    crossing: {
      before: 4_900_000n,
      after: 5_000_000n,
      ceiling: 5_000_000n,
      ledgerId: LEDGER,
      traceId: TRACE,
      provider: "synthetic",
      model: "metered-test",
      attribution: "metered",
      costMicro: 100_000n,
    },
    meters: {
      day: {
        period: "2026-11-22",
        spentMicro: 5_000_000n,
        reservedMicro: 0n,
        limitMicro: 5_000_000n,
        warnMicro: 3_500_000n,
      },
      month: {
        period: "2026-11",
        spentMicro: 12_400_000n,
        reservedMicro: 100_000n,
        limitMicro: 20_000_000n,
        warnMicro: 14_000_000n,
      },
      fallbackDay: {
        period: "2026-11-22",
        spentMicro: 2_000_000n,
        reservedMicro: 0n,
        limitMicro: 2_000_000n,
        warnMicro: 1_400_000n,
        grantNo: 3,
      },
    },
    lastCalls: [
      {
        ts: at("2026-11-22T08:41:05.123Z"),
        route: "metered",
        provider: "synthetic",
        model: "metered-test",
        attribution: "metered",
        costMicro: 100_000n,
        traceId: TRACE,
      },
      {
        ts: at("2026-11-22T08:40:59.000Z"),
        route: "metered",
        provider: "synthetic",
        model: "metered-test",
        attribution: "metered",
        costMicro: 100_000n,
        traceId: "0af7651916cd43dd8448eb211c80319c",
      },
    ],
    hourly: [
      {
        hour: at("2026-11-22T08:00:00.000Z"),
        provider: "synthetic",
        model: "metered-test",
        route: "metered",
        calls: 50,
        inputTokens: 0n,
        outputTokens: 50_000n,
        costMicro: 5_000_000n,
      },
    ],
    daily: null,
    audit: [
      {
        ts: at("2026-11-22T08:00:00.000Z"),
        actor: "operator:dev#abcdef01",
        action: "renew",
        reason: "breach test step 6 | again",
      },
      { ts: at("2026-11-22T08:41:05.123Z"), actor: "gateway", action: "trip", reason: null },
    ],
    config: {
      routingSha: "ab".repeat(32),
      priceVersion: "2026-10-08.1",
      effectiveFrom: at("2026-10-08T00:00:00.000Z"),
      dailyMicro: 5_000_000n,
      monthlyMicro: 20_000_000n,
      fallbackDailyMicro: 2_000_000n,
      warnRatioBp: 7_000n,
      inFlight: 4,
    },
    alerts: [
      {
        key: "dev:trip:day:2026-11-22",
        telegram: {
          status: "delivered",
          attempts: 1,
          deliveredAt: at("2026-10-09T12:00:01.000Z"),
          ref: "17",
          error: null,
        },
        email: { status: "failed", attempts: 6, deliveredAt: null, ref: null, error: "smtp_550" },
      },
      {
        key: "dev:warn:day:2026-11-22",
        telegram: {
          status: "delivered",
          attempts: 2,
          deliveredAt: at("2026-10-09T11:50:06.000Z"),
          ref: "12",
          error: null,
        },
        email: {
          status: "delivered",
          attempts: 1,
          deliveredAt: at("2026-10-09T11:50:01.000Z"),
          ref: "250 ABC123",
          error: null,
        },
      },
    ],
    fallbackId: "synthetic",
    ports: { grafana: 18102, langfuse: 18101 },
    ...o,
  };
}

const DAILY = `# Intent: Respond to the daily ceiling breach on dev, 2026-11-22
Author: the gateway (automated draft). Status: draft. Created: 2026-11-22.

## Problem
The dev stack's daily meter reached its ceiling of 5.000000 USD at 2026-11-22T08:41:05Z.
The kill switch set \`degraded\` at 2026-11-22T08:41:05Z, with no human action (FR-033). Every request gets the
degraded response until an operator resets it (FR-034). The evidence below is what the gateway recorded.

## Proposed outcome
To be written by the Author.

## Affected users and systems
The dev stack: its hello endpoint, its gateway, and its fallback (synthetic).
No visitor data flows in spec 000.

## Constraints
Principle V: the system degraded itself, and a human must consciously restore it. The constitution's
Incidents rule: an incident note in docs/incidents/ within seven days, and an eval that would have caught
this. A change to a ceiling, the sub-budget, or a limit needs an ADR and the Author's approval.

## Expected cost impact
Metered spend at the crossing: day 5.000000 USD, month 12.400000 USD. Overshoot past the ceiling:
0.000000 USD, against the bound of 4 calls in flight times the maximum cost per call.

## Data-flow impact
None. This draft was generated inside the stack. It holds no payloads, client identifiers, or secrets.

## Open questions
- What drove the spend? See the hourly totals.
- Did a configuration change or an operator action contribute? See the configuration and the audit trail.
- Which eval or alert would have caught it sooner?

## Evidence

### Meters at the crossing
| Meter | Period | Spent | Reserved | Ceiling or allowance | Warning |
|---|---|---|---|---|---|
| day | 2026-11-22 | 5.000000 | 0.000000 | 5.000000 | 3.500000 |
| month | 2026-11 | 12.400000 | 0.100000 | 20.000000 | 14.000000 |
| fallback_day | 2026-11-22 | 2.000000 | 0.000000 | 2.000000 (grant 3) | 1.400000 |

### The crossing
- Ceiling: day 2026-11-22. Spend before the call: 4.900000 USD; after: 5.000000 USD.
- The crossing call: ledger ${LEDGER}, trace ${TRACE}, synthetic metered-test, attribution metered, cost 0.100000 USD.
- Crossed at 2026-11-22T08:41:05Z. \`degraded\` was set at 2026-11-22T08:41:05Z, in the same transaction.

### The last 10 metered calls
| Time | Route | Provider | Model | Attribution | Cost (USD) | Trace |
|---|---|---|---|---|---|---|
| 2026-11-22T08:41:05Z | metered | synthetic | metered-test | metered | 0.100000 | ${TRACE} |
| 2026-11-22T08:40:59Z | metered | synthetic | metered-test | metered | 0.100000 | 0af7651916cd43dd8448eb211c80319c |

### Hourly totals, the 24 hours before the crossing (UTC)
| Hour | Provider | Model | Route | Calls | Input tokens | Output tokens | Cost (USD) |
|---|---|---|---|---|---|---|---|
| 2026-11-22T08:00Z | synthetic | metered-test | metered | 50 | 0 | 50000 | 5.000000 |

### Audit trail, this day
| Time | Actor | Action | Reason |
|---|---|---|---|
| 2026-11-22T08:00:00Z | operator:dev#abcdef01 | renew | breach test step 6 \\| again |
| 2026-11-22T08:41:05Z | gateway | trip | – |

### Configuration
- Routing: config/routing.yaml, SHA-256 ${"ab".repeat(32)}
- Prices: version 2026-10-08.1, effective from 2026-10-08T00:00:00Z
- Budgets: day 5.000000 USD, month 20.000000 USD, fallback 2.000000 USD a grant, warning ratio 0.70

### Alerts
| Alert | Telegram | Email |
|---|---|---|
| dev:trip:day:2026-11-22 | delivered at 2026-10-09T12:00:01Z (message 17) | failed after 6 attempts (smtp_550) |
| dev:warn:day:2026-11-22 | delivered at 2026-10-09T11:50:06Z (message 12) | delivered at 2026-10-09T11:50:01Z (250 ABC123) |

### Links
- Grafana: http://localhost:18102/d/h4-runtime?from=1791540000000&to=1791549000000&tz=UTC
- The crossing call in Langfuse: http://localhost:18101/project/h4reet-dev/traces/${TRACE}
`;

describe("the incident draft's template (contracts/alerts.md §7)", () => {
  it("fills the template with the evidence, in its order, amounts in USD with six decimals", () => {
    expect(renderDraft(evidence())).toBe(DAILY);
  });

  it("gives the same bytes for the same evidence", () => {
    expect(renderDraft(evidence())).toBe(renderDraft(evidence()));
  });

  it("adds the daily totals for the monthly ceiling only, and names its audit trail's period", () => {
    const monthly = renderDraft(
      evidence({
        ceiling: "month",
        periodKey: "2026-11",
        crossing: { ...evidence().crossing, before: 19_950_000n, after: 20_050_000n, ceiling: 20_000_000n },
        daily: [
          { day: "2026-11-23", calls: 49, costMicro: 4_900_000n },
          { day: "2026-11-24", calls: 26, costMicro: 2_600_000n },
        ],
      }),
    );
    expect(monthly.split("\n")[0]).toBe("# Intent: Respond to the monthly ceiling breach on dev, 2026-11");
    expect(monthly).toContain(
      "The dev stack's monthly meter reached its ceiling of 20.000000 USD at 2026-11-22T08:41:05Z.",
    );
    expect(monthly).toContain("Overshoot past the ceiling:\n0.050000 USD,");
    expect(monthly).toContain(
      "### Daily totals this month\n| Day | Calls | Cost (USD) |\n|---|---|---|\n| 2026-11-23 | 49 | 4.900000 |\n| 2026-11-24 | 26 | 2.600000 |\n\n### Audit trail, this month\n",
    );
    expect(renderDraft(evidence())).not.toContain("Daily totals");
  });

  it("says a stack degraded already was degraded by an earlier crossing, and since when", () => {
    const second = renderDraft(evidence({ setDegraded: false, degradedAt: at("2026-11-22T07:00:00.000Z") }));
    expect(second).toContain(
      "- Crossed at 2026-11-22T08:41:05Z. `degraded` was set already, at 2026-11-22T07:00:00Z, by an earlier crossing.",
    );
    expect(second).toContain("The kill switch set `degraded` at 2026-11-22T07:00:00Z, with no human action (FR-033).");
  });

  it("names no fallback when the stack has none, and says so for alerts not yet final", () => {
    const text = renderDraft(
      evidence({
        fallbackId: null,
        alerts: [
          {
            key: "dev:trip:day:2026-11-22",
            telegram: { status: "pending", attempts: 5, deliveredAt: null, ref: null, error: "connect" },
            email: { status: "pending", attempts: 1, deliveredAt: null, ref: null, error: null },
          },
        ],
      }),
    );
    expect(text).toContain("and its fallback (none).");
    expect(text).toContain(
      "| dev:trip:day:2026-11-22 | pending after 5 attempts (connect) | pending after 1 attempt |",
    );
  });

  it("names the file by the crossing's UTC date on the gateway clock, the stack, and the ceiling, then -2, -3", () => {
    expect(draftName("2026-11-22", "dev", "day", 1)).toBe("2026-11-22-dev-day.intent.md");
    expect(draftName("2026-11-22", "dev-cpu", "month", 2)).toBe("2026-11-22-dev-cpu-month-2.intent.md");
  });
});
