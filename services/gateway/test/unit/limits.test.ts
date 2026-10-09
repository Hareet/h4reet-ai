// The per-client cap (tasks.md T053; contracts/gateway-http.md §2.3; FR-025): a token bucket of capacity `burst`
// refilled at requests_per_minute on the real clock, at most requests_per_day per UTC day of the gateway clock, at most
// 10,000 clients tracked (least recently seen evicted), idle entries dropped after a day.
import { describe, expect, it } from "vitest";

import { ClientCap, clientKey } from "../../src/core/limits.js";

const LIMITS = { requestsPerMinute: 20, burst: 5, requestsPerDay: 500 };
const T0 = Date.parse("2026-10-28T10:00:00.000Z");

describe("the per-client cap", () => {
  it("allows a burst of 5, then refuses per_minute until the next token, one every 3 s", () => {
    const cap = new ClientCap(LIMITS);
    for (let i = 0; i < 5; i++) expect(cap.take("a", T0, T0), `request ${i + 1}`).toEqual({ ok: true });
    expect(cap.take("a", T0, T0)).toEqual({ ok: false, limit: "per_minute", retryAfterS: 3 });
    expect(cap.take("a", T0 + 2_000, T0 + 2_000)).toEqual({ ok: false, limit: "per_minute", retryAfterS: 1 });
    expect(cap.take("a", T0 + 3_000, T0 + 3_000)).toEqual({ ok: true });
    expect(cap.take("a", T0 + 3_000, T0 + 3_000)).toEqual({ ok: false, limit: "per_minute", retryAfterS: 3 });
  });

  it("never refills past the burst", () => {
    const cap = new ClientCap(LIMITS);
    expect(cap.take("a", T0, T0).ok).toBe(true);
    const later = T0 + 10 * 60_000;
    for (let i = 0; i < 5; i++) expect(cap.take("a", later, later).ok).toBe(true);
    expect(cap.take("a", later, later).ok).toBe(false);
  });

  it("refuses per_day after requests_per_day in a UTC day of the gateway clock, until 00:00 UTC", () => {
    const cap = new ClientCap({ requestsPerMinute: 600, burst: 600, requestsPerDay: 3 });
    const gw = Date.parse("2026-10-28T23:59:00.000Z"); // the gateway clock: a dev test clock runs ahead of real time
    for (let i = 0; i < 3; i++) expect(cap.take("a", T0, gw).ok).toBe(true);
    expect(cap.take("a", T0, gw)).toEqual({ ok: false, limit: "per_day", retryAfterS: 60 });
    // A new UTC day of the gateway clock starts a new count, whatever the real clock says.
    expect(cap.take("a", T0 + 1_000, gw + 60_000)).toEqual({ ok: true });
  });

  it("counts every request it allows, and never one it refuses", () => {
    const cap = new ClientCap({ requestsPerMinute: 60, burst: 1, requestsPerDay: 2 });
    expect(cap.take("a", T0, T0).ok).toBe(true);
    for (let i = 0; i < 10; i++) expect(cap.take("a", T0, T0)).toMatchObject({ ok: false, limit: "per_minute" });
    expect(cap.take("a", T0 + 1_000, T0 + 1_000).ok).toBe(true);
    expect(cap.take("a", T0 + 2_000, T0 + 2_000)).toMatchObject({ ok: false, limit: "per_day" });
  });

  it("keeps each client to its own bucket: the address and the label together", () => {
    const cap = new ClientCap({ requestsPerMinute: 60, burst: 1, requestsPerDay: 500 });
    expect(clientKey("10.0.0.7", undefined)).not.toBe(clientKey("10.0.0.7", "author-laptop"));
    expect(clientKey("10.0.0.7", "a")).not.toBe(clientKey("10.0.0.8", "a"));
    for (const key of [
      clientKey("10.0.0.7", undefined),
      clientKey("10.0.0.7", "author-laptop"),
      clientKey("10.0.0.8", undefined),
    ]) {
      expect(cap.take(key, T0, T0).ok).toBe(true);
      expect(cap.take(key, T0, T0).ok).toBe(false);
    }
  });

  it("tracks at most 10,000 clients, evicting the least recently seen", () => {
    const cap = new ClientCap({ ...LIMITS, burst: 1, requestsPerMinute: 1 });
    expect(cap.take("first", T0, T0).ok).toBe(true);
    for (let i = 0; i < 9_999; i++) cap.take(`c${i}`, T0, T0);
    expect(cap.size).toBe(10_000);
    expect(cap.take("first", T0, T0).ok).toBe(false); // still tracked, and seen again just now
    cap.take("one-more", T0, T0); // evicts the least recently seen: c0
    expect(cap.size).toBe(10_000);
    expect(cap.take("first", T0, T0).ok).toBe(false);
    expect(cap.take("c0", T0, T0).ok).toBe(true); // forgotten, so it starts with a full bucket
  });

  it("drops entries idle for a day", () => {
    const cap = new ClientCap({ ...LIMITS, burst: 1 });
    expect(cap.take("idle", T0, T0).ok).toBe(true);
    expect(cap.take("busy", T0 + 86_400_000, T0 + 86_400_000).ok).toBe(true);
    expect(cap.size).toBe(1);
  });

  it("answers a whole number of seconds, at least 1", () => {
    const cap = new ClientCap({ requestsPerMinute: 7, burst: 1, requestsPerDay: 500 });
    expect(cap.take("a", T0, T0).ok).toBe(true);
    const refusal = cap.take("a", T0 + 1, T0 + 1);
    expect(refusal).toEqual({ ok: false, limit: "per_minute", retryAfterS: 9 }); // 60 / 7 = 8.57 s
  });
});
