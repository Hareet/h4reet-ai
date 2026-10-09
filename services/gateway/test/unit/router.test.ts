// The routing decision (tasks.md T052; contracts/gateway-http.md §2.4, §3; FR-022), as far as a stack without a
// fallback goes: the state read decides first (store_unreachable, store_uninitialized, kill_switch_tripped), then a
// healthy local adapter answers, and otherwise a stack with no fallback answers no_fallback_in_stack. Every degraded
// answer carries its cause's fixed detail text.
import { describe, expect, it } from "vitest";

import {
  DEGRADED_DETAIL,
  ceilingsOf,
  degraded,
  rfc3339Seconds,
  stateDecision,
  wouldDegrade,
} from "../../src/core/router.js";
import type { StateRead } from "../../src/meter/store.js";

const normal: StateRead = {
  kind: "ok",
  state: "normal",
  since: new Date("2026-10-08T16:20:02.123Z"),
  crossed: [],
  fallbackAwaitingRenewal: false,
  fallbackAwaitingSince: null,
  testClockOffsetMs: null,
};
const tripped: StateRead = {
  ...normal,
  state: "degraded",
  since: new Date("2026-10-29T16:40:03.987Z"),
  crossed: ["day:2026-10-29", "month:2026-10", "day:2026-10-30"],
};

describe("the fixed detail texts (gateway-http.md §3)", () => {
  it("are exactly the contract's, for every cause", () => {
    expect(DEGRADED_DETAIL).toEqual({
      store_unreachable: "The kill-switch store can't be read, so the stack fails closed.",
      store_uninitialized: "The kill-switch store is empty. The operator must initialize it: make operator-init.",
      kill_switch_tripped:
        "The kill switch set degraded when a spending ceiling was reached. Only an operator reset restores service.",
      no_fallback_in_stack: "The local model is unavailable, and this stack has no fallback.",
      meter_at_ceiling:
        "The local model is unavailable, and metered calls are refused while a meter is at or above its ceiling.",
      fallback_awaiting_renewal:
        "The local model is unavailable, and the fallback sub-budget ran out. It stays refused until the operator renews it.",
      fallback_spent_today:
        "The local model is unavailable, and calls in flight hold the rest of today's fallback sub-budget.",
      fallback_unavailable: "The local model is unavailable, and so is the fallback.",
      journal_unwritable:
        "The local model is unavailable, and metered calls are refused because the call journal can't be written.",
    });
  });

  it("go into the decision with the cause", () => {
    expect(degraded("no_fallback_in_stack")).toEqual({
      kind: "degraded",
      cause: "no_fallback_in_stack",
      detail: DEGRADED_DETAIL.no_fallback_in_stack,
    });
    expect(degraded("kill_switch_tripped", { ceilings: ["day"], since: "2026-10-29T16:40:03Z" })).toMatchObject({
      ceilings: ["day"],
      since: "2026-10-29T16:40:03Z",
    });
  });
});

describe("the state read decides first (gateway-http.md §2.4 step 4; data-model.md §7.1)", () => {
  it("fails closed on an unreachable store, since the outage began", () => {
    const outage = Date.parse("2026-10-29T16:01:00.500Z");
    expect(stateDecision({ kind: "unreachable" }, { outageSince: outage })).toEqual(
      degraded("store_unreachable", { since: "2026-10-29T16:01:00Z" }),
    );
    expect(stateDecision({ kind: "unreachable" }, {})).toEqual(degraded("store_unreachable"));
  });

  it("fails closed on an empty store, with no since", () => {
    expect(stateDecision({ kind: "uninitialized" }, {})).toEqual(degraded("store_uninitialized"));
  });

  it("answers kill_switch_tripped while degraded, with the crossed ceilings and the state's since", () => {
    expect(stateDecision(tripped, {})).toEqual(
      degraded("kill_switch_tripped", { ceilings: ["day", "month"], since: "2026-10-29T16:40:03Z" }),
    );
  });

  it("lets a normal state through to the adapters", () => {
    expect(stateDecision(normal, {})).toBeUndefined();
  });

  it("reads the crossed ceilings once each, day before month", () => {
    expect(ceilingsOf(["month:2026-10", "day:2026-10-29", "day:2026-10-30"])).toEqual(["day", "month"]);
    expect(ceilingsOf([])).toEqual([]);
  });

  it("writes event times to the second, in UTC", () => {
    expect(rfc3339Seconds(Date.parse("2026-10-08T16:20:02.999Z"))).toBe("2026-10-08T16:20:02Z");
  });
});

describe("the dry run behind GET /health's degraded_cause (gateway-http.md §5)", () => {
  const local = (healthy: boolean) => ({ healthy });

  it("names the cause a hello would get now, in FR-022's order", () => {
    expect(wouldDegrade({ read: { kind: "unreachable" }, local: local(true), hasFallback: false })).toBe(
      "store_unreachable",
    );
    expect(wouldDegrade({ read: { kind: "uninitialized" }, local: local(true), hasFallback: false })).toBe(
      "store_uninitialized",
    );
    expect(wouldDegrade({ read: tripped, local: local(true), hasFallback: false })).toBe("kill_switch_tripped");
    expect(wouldDegrade({ read: normal, local: local(true), hasFallback: false })).toBeNull();
    expect(wouldDegrade({ read: normal, local: local(false), hasFallback: false })).toBe("no_fallback_in_stack");
  });

  it("puts the kill switch before local health: a tripped stack refuses local answers too", () => {
    expect(wouldDegrade({ read: tripped, local: local(false), hasFallback: false })).toBe("kill_switch_tripped");
  });
});

describe("the dry run of the fallback branch (gateway-http.md §2.4 steps 5.3–5.7; tasks.md T074)", () => {
  const ceilings = { day: 5_000_000n, month: 20_000_000n };
  const meters = (o: Partial<{ day: bigint; month: bigint; fallback: bigint; allowance: bigint }> = {}) => ({
    dayLevel: o.day ?? 0n,
    monthLevel: o.month ?? 0n,
    fallbackLevel: o.fallback ?? 0n,
    allowance: o.allowance ?? 2_000_000n,
  });
  const view = (o: {
    read?: StateRead;
    healthy?: boolean;
    meters?: ReturnType<typeof meters>;
    journalUnwritable?: boolean;
  }) => ({
    read: o.read ?? normal,
    local: { healthy: false },
    hasFallback: true,
    fallback: {
      healthy: o.healthy ?? true,
      ceilings,
      journalUnwritable: o.journalUnwritable ?? false,
      ...(o.meters === undefined ? {} : { meters: o.meters }),
    },
  });
  const awaiting: StateRead = { ...normal, fallbackAwaitingRenewal: true, fallbackAwaitingSince: new Date() };

  it("would answer from the fallback while every check passes", () => {
    expect(wouldDegrade(view({ meters: meters() }))).toBeNull();
  });

  it("names the admission causes in their precedence: ceilings, renewal, today's allowance, health, the journal", () => {
    const all = { read: awaiting, healthy: false, journalUnwritable: true };
    expect(wouldDegrade(view({ ...all, meters: meters({ day: 5_000_000n, fallback: 2_000_000n }) }))).toBe(
      "meter_at_ceiling",
    );
    expect(wouldDegrade(view({ ...all, meters: meters({ month: 20_000_000n }) }))).toBe("meter_at_ceiling");
    expect(wouldDegrade(view({ ...all, meters: meters({ fallback: 2_000_000n }) }))).toBe("fallback_awaiting_renewal");
    expect(
      wouldDegrade(view({ healthy: false, journalUnwritable: true, meters: meters({ fallback: 2_000_000n }) })),
    ).toBe("fallback_spent_today");
    expect(wouldDegrade(view({ healthy: false, journalUnwritable: true, meters: meters() }))).toBe(
      "fallback_unavailable",
    );
    expect(wouldDegrade(view({ journalUnwritable: true, meters: meters() }))).toBe("journal_unwritable");
  });

  it("counts reservations, as admission does: a level is spend plus reservations", () => {
    // The view's levels are spend plus reservations already; a renewal's allowance moves the line.
    expect(wouldDegrade(view({ meters: meters({ fallback: 3_999_999n, allowance: 4_000_000n }) }))).toBeNull();
    expect(wouldDegrade(view({ meters: meters({ fallback: 4_000_000n, allowance: 4_000_000n }) }))).toBe(
      "fallback_spent_today",
    );
  });

  it("leaves the meters' two checks out when they couldn't be read", () => {
    expect(wouldDegrade(view({}))).toBeNull();
    expect(wouldDegrade(view({ read: awaiting }))).toBe("fallback_awaiting_renewal");
  });

  it("still puts the state read and a healthy local first", () => {
    expect(wouldDegrade({ ...view({ meters: meters({ day: 9_000_000n }) }), read: tripped })).toBe(
      "kill_switch_tripped",
    );
    expect(wouldDegrade({ ...view({ meters: meters({ day: 9_000_000n }) }), local: { healthy: true } })).toBeNull();
  });
});
