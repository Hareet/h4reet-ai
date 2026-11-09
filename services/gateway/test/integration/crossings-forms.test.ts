// A design can never touch a cause's transaction (spec 011, FR-025; SC-005; plan §2.1, §6.4; tasks.md T008). With the
// registered designed renderers replaced by throwing spies, every place an alert is queued commits its cause, its
// state change, and its outbox row with the plain text and version 2 facts, and no spy is called inside any
// transaction: a warning crossing and a trip, a reset, an init, the auth-failure alert, credentials_expiring,
// fallback_unavailable, and the reminder.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dispatcher } from "../../src/alerts/dispatcher.js";
import { decodeFacts } from "../../src/alerts/facts.js";
import { RENDERERS, type DesignedRenderers } from "../../src/alerts/forms.js";
import { dayKey } from "../../src/core/clock.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;

const T0 = Date.parse("2026-10-29T16:40:03.000Z");

const stacks: TestStack[] = [];
const saved: DesignedRenderers = {};
const spies = {
  telegram: vi.fn((): never => {
    throw new Error("a designed Telegram render inside a transaction");
  }),
  email: vi.fn((): never => {
    throw new Error("a designed email render inside a transaction");
  }),
};

beforeEach(() => {
  Object.assign(saved, RENDERERS);
  RENDERERS.telegram = spies.telegram;
  RENDERERS.email = spies.email;
  spies.telegram.mockClear();
  spies.email.mockClear();
});
afterEach(async () => {
  for (const k of ["telegram", "email"] as const) {
    if (saved[k] === undefined) delete RENDERERS[k];
    else (RENDERERS as Record<string, unknown>)[k] = saved[k];
  }
  for (const s of stacks.splice(0)) await s.close();
});

const post = (s: TestStack, url: string, body: unknown, headers: Record<string, string> = {}) =>
  s.admin.inject({
    method: "POST",
    url,
    headers: { ...s.auth(), "content-type": "application/json", ...headers },
    payload: JSON.stringify(body),
  });

async function rows(s: TestStack): Promise<Rec[]> {
  return (
    await s.db.pg.query<Rec>(
      "SELECT dedupe_key, kind, subject, body, facts, telegram_status, email_status FROM gateway.alert_outbox ORDER BY id",
    )
  ).rows;
}

/** Every row committed with its plain text, and facts that decode to the context and spec it was rendered from. */
function expectPlainAndDecodable(all: Rec[]): void {
  for (const r of all) {
    const key = String(r.dedupe_key);
    expect(String(r.body).split("\n")[0], key).toBe(r.subject);
    expect(r.telegram_status, key).toBe("pending");
    const decoded = decodeFacts(r.facts, key);
    expect(decoded, key).toBeDefined();
    expect(decoded?.spec.kind, key).toBe(r.kind);
    expect(decoded?.ctx.dedupeKey, key).toBe(key);
  }
}

describe("every cause commits with its plain row while the designs throw (FR-025)", () => {
  it("a warning crossing, a trip, the reminder, a reset, and an init, through the gateway's own transactions", async () => {
    const clock = { now: T0 };
    const s = await testStack({ fallback: true, realNow: () => clock.now });
    stacks.push(s);
    const init = await post(s, "/admin/init", { reason: "Fresh dev stack for the forms test.", confirm_zero: true });
    expect(init.statusCode).toBe(200);
    await s.services.gateway.probeAll();
    // Fifty synthetic metered calls at $0.10: the day's warning at $3.50, then the trip at $5.00.
    const run = await post(s, "/admin/test/synthetic", {
      attribution: "metered",
      count: 50,
      reason: "spec eleven: the crossings under failing designs",
    });
    expect(run.statusCode).toBe(200);
    const state = (await s.db.pg.query<Rec>("SELECT state FROM gateway.stack_state")).rows[0];
    expect(state?.state).toBe("degraded");
    // The next morning's reminder, while degraded.
    const d: Dispatcher = s.services.dispatcher;
    clock.now = Date.parse(`${dayKey(T0 + 86_400_000)}T09:00:00Z`);
    expect(await d.remind()).toBe(true);
    const reset = await post(s, "/admin/reset", { reason: "Rehearsal over; restoring local answers." });
    expect(reset.statusCode).toBe(200);
    expect((await s.db.pg.query<Rec>("SELECT state FROM gateway.stack_state")).rows[0]?.state).toBe("normal");
    const all = await rows(s);
    expect(all.map((r) => r.kind)).toEqual(["operator_action", "warn", "trip", "reminder", "operator_action"]);
    expectPlainAndDecodable(all);
    expect(spies.telegram).not.toHaveBeenCalled();
    expect(spies.email).not.toHaveBeenCalled();
  });

  it("the auth-failure alert, credentials_expiring, and fallback_unavailable", async () => {
    const clock = { now: T0 };
    const s = await testStack({ fallback: true, realNow: () => clock.now });
    stacks.push(s);
    expect(
      (await post(s, "/admin/init", { reason: "Fresh dev stack for the forms test.", confirm_zero: true })).statusCode,
    ).toBe(200);
    for (let i = 0; i < 3; i++) {
      const res = await s.admin.inject({
        method: "GET",
        url: "/admin/status",
        headers: { authorization: "Bearer nope" },
      });
      expect(res.statusCode).toBe(401);
    }
    const d: Dispatcher = s.services.dispatcher;
    expect(await d.credentialsExpiring("bedrock", "Bedrock", T0 + 3_600_000)).toBe("queued");
    expect(await d.fallbackUnavailable("bedrock", "circuit_open", "Bedrock")).toBe(true);
    const all = await rows(s);
    expect(all.map((r) => r.kind).sort()).toEqual(
      ["auth_failed", "credentials_expiring", "fallback_unavailable", "operator_action"].sort(),
    );
    expectPlainAndDecodable(all);
    expect(spies.telegram).not.toHaveBeenCalled();
    expect(spies.email).not.toHaveBeenCalled();
  });
});
