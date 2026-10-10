// The credentials_expiring alert's row (alerts.md §2, §3; data-model.md §7.7; tasks.md T102): the dispatcher queues one
// per SSO session end, whatever the ticker asks, with the alert's own headline, runbook, and facts. PGlite stands in
// for Postgres; nothing is delivered here, so the channels point nowhere.
import { afterEach, describe, expect, it } from "vitest";

import { Dispatcher, type Channels } from "../../src/alerts/dispatcher.js";
import { testStack, type TestStack } from "../helpers/stack.js";

const T0 = Date.parse("2026-10-29T16:00:04.000Z");
const END = Date.parse("2026-10-29T18:00:00.000Z");

interface Rig {
  s: TestStack;
  d: Dispatcher;
  clock: { now: number };
}
const rigs: Rig[] = [];
afterEach(async () => {
  for (const r of rigs.splice(0)) {
    await r.d.stop();
    await r.s.close();
  }
});

async function rig(): Promise<Rig> {
  const clock = { now: T0 };
  const s = await testStack({ realNow: () => clock.now });
  const channels: Channels = {
    mode: "standin",
    telegram: { base: "http://127.0.0.1:9", token: "standin", chatId: "0", timeoutMs: 300 },
    email: {
      host: "127.0.0.1",
      port: 9,
      secure: false,
      requireTLS: false,
      ignoreTLS: true,
      from: "alerts@h4reet.local",
      to: "operator@h4reet.local",
      timeoutMs: 300,
    },
  };
  const config = s.services;
  const d = new Dispatcher({
    stack: "dev",
    envClass: "dev",
    store: s.store,
    alerts: config.alerts,
    budgets: config.budgets,
    channels,
    hasFallback: true,
    clock: config.clock,
    metrics: config.metrics,
    logger: config.logger,
    realNow: () => clock.now,
  });
  const r = { s, d, clock };
  rigs.push(r);
  return r;
}

const init = (r: Rig) =>
  r.s.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers: { ...r.s.auth(), "content-type": "application/json" },
    payload: JSON.stringify({ reason: "Fresh stack for the credentials test.", confirm_zero: true, renew: true }),
  });

const rows = async (r: Rig) =>
  (
    await r.s.db.pg.query<{ dedupe_key: string; body: string; facts: Record<string, unknown> }>(
      "SELECT dedupe_key, body, facts FROM gateway.alert_outbox WHERE kind = 'credentials_expiring' ORDER BY id",
    )
  ).rows;

describe("the credentials_expiring row (alerts.md §2)", () => {
  it("queues one per session end, with the session's end in its key, its headline, and its facts", async () => {
    const r = await rig();
    expect((await init(r)).statusCode).toBe(200);
    expect(await r.d.credentialsExpiring("bedrock", "Bedrock", END)).toBe("queued");
    r.clock.now += 10_000; // asked again, after a restart say: the dedupe key holds it to one
    expect(await r.d.credentialsExpiring("bedrock", "Bedrock", END)).toBe("present");
    const renewed = END + 8 * 3_600_000; // after make aws-login, a new session
    expect(await r.d.credentialsExpiring("bedrock", "Bedrock", renewed)).toBe("queued");
    const queued = await rows(r);
    expect(queued.map((x) => x.dedupe_key)).toEqual([
      "dev:credentials_expiring:bedrock:2026-10-29T18:00Z",
      "dev:credentials_expiring:bedrock:2026-10-30T02:00Z",
    ]);
    const lines = String(queued[0]?.body).split("\n");
    expect(lines[0]).toBe("[dev] CREDENTIALS EXPIRING: the Bedrock SSO session ends at 2026-10-29T18:00:00Z");
    expect(lines).toContain("Fallback to Bedrock stops then. Run make aws-login in your terminal.");
    expect(lines).toContain("Runbook: docs/runbooks/bedrock-credentials-expiring.md");
    // Facts carry times as toISOString writes them, as every alert kind's do (format.ts).
    expect(queued[0]?.facts).toMatchObject({ adapter: "bedrock", ends_at: "2026-10-29T18:00:00.000Z" });
    expect(
      r.s.logged.filter((l) => l.record.event === "alert.queued" && l.record.kind === "credentials_expiring"),
    ).toHaveLength(2);
  });

  it("answers retry while the store is empty, queueing nothing, and queues it once the store is ready", async () => {
    const r = await rig();
    expect(await r.d.credentialsExpiring("bedrock", "Bedrock", END)).toBe("retry");
    expect(await rows(r)).toEqual([]);
    expect((await init(r)).statusCode).toBe(200);
    r.clock.now += 10_000; // the gateway's next tick asks again (test/unit/credentials-expiring.test.ts)
    expect(await r.d.credentialsExpiring("bedrock", "Bedrock", END)).toBe("queued");
    expect((await rows(r)).map((x) => x.dedupe_key)).toEqual(["dev:credentials_expiring:bedrock:2026-10-29T18:00Z"]);
  });
});
