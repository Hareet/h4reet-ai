// The adapter interface's runtime part, ProviderError, and the shapes contracts/provider-adapter.md §2 fixes.
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ProviderError,
  type AdapterKind,
  type Attribution,
  type DegradedCause,
  type HealthReason,
  type ProviderAdapter,
  type ProviderErrorKind,
  type RouteDecision,
} from "../../src/core/types.js";

describe("ProviderError", () => {
  it("carries the kind as its message, and only the fields §2.5 names", () => {
    const err = new ProviderError("timeout", true, true, 504, "ETIMEDOUT");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProviderError");
    expect(err.message).toBe("timeout");
    expect(String(err)).toBe("ProviderError: timeout");
    expect(err.cause).toBeUndefined();
    expect({ ...err }).toEqual({
      kind: "timeout",
      retryable: true,
      possiblyBilled: true,
      status: 504,
      code: "ETIMEDOUT",
      name: "ProviderError",
    });
  });

  it("leaves status and code out when the provider gave none", () => {
    const err = new ProviderError("provider_error", true, false);
    expect(err.status).toBeUndefined();
    expect(err.code).toBeUndefined();
    expect(JSON.parse(JSON.stringify(err))).toEqual({
      kind: "provider_error",
      retryable: true,
      possiblyBilled: false,
      name: "ProviderError",
    });
  });
});

describe("the contract's unions", () => {
  it("are exactly provider-adapter.md §2's", () => {
    expectTypeOf<AdapterKind>().toEqualTypeOf<"local" | "paid" | "synthetic">();
    expectTypeOf<Attribution>().toEqualTypeOf<"none" | "fallback" | "metered" | "test">();
    expectTypeOf<ProviderErrorKind>().toEqualTypeOf<
      "unavailable" | "timeout" | "rate_limited" | "auth" | "bad_request" | "content_filtered" | "provider_error"
    >();
    expectTypeOf<HealthReason>().toEqualTypeOf<
      "not_ready" | "unreachable" | "timeout" | "credentials" | "circuit_open" | "disabled"
    >();
    expectTypeOf<DegradedCause>().toEqualTypeOf<
      | "store_unreachable"
      | "store_uninitialized"
      | "kill_switch_tripped"
      | "no_fallback_in_stack"
      | "meter_at_ceiling"
      | "adapter_month_spent" // spec 010, Amendment 0-6
      | "fallback_awaiting_renewal"
      | "fallback_spent_today"
      | "fallback_unavailable"
      | "journal_unwritable"
    >();
    expectTypeOf<RouteDecision["kind"]>().toEqualTypeOf<"local" | "fallback" | "metered" | "degraded">();
    expectTypeOf<Extract<RouteDecision, { kind: "metered" }>["attribution"]>().toEqualTypeOf<"metered" | "test">();
    expectTypeOf<Extract<RouteDecision, { kind: "fallback" }>["reason"]>().toEqualTypeOf<
      "local_unhealthy" | "local_failed"
    >();
  });

  it("give the adapter the four members the contract adds to the plan's sketch", () => {
    expectTypeOf<ProviderAdapter["type"]>().toEqualTypeOf<string>();
    expectTypeOf<ProviderAdapter["server"]>().toEqualTypeOf<{ address: string; port?: number }>();
    expectTypeOf<ProviderAdapter["retry"]["on"]>().toEqualTypeOf<readonly ProviderErrorKind[]>();
    expectTypeOf<ProviderAdapter>().toHaveProperty("fixedUsage");
  });
});
