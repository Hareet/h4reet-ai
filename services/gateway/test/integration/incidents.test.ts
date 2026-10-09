// The incident drafts (tasks.md T078; contracts/alerts.md §7; data-model.md §2.8, §7.7), on PGlite, with a real trip
// committed through the meter and the draft written into a fresh state directory:
// - written once both channels of the trip alert are final, or 300 s after the trip, whichever comes first;
// - under incidents/YYYY-MM-DD-<stack>-<ceiling>.intent.md, -2 when the name is taken, through a temporary name, mode
//   0640, its SHA-256 and relative path in the row, and incident.drafted logged;
// - every evidence field the breach test's step 8 checks, filled from the store, and no client identifier or payload;
// - a failed write leaves the row queued with its error class, and the next 10 s pass writes it;
// - GET /admin/incidents reads it back unchanged.
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { metrics as otelMetrics } from "@opentelemetry/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../src/config/validate.js";
import { GatewayClock } from "../../src/core/clock.js";
import type { AdapterResult } from "../../src/core/types.js";
import { IncidentDrafts } from "../../src/incidents/draft.js";
import { Journal } from "../../src/meter/journal.js";
import { Meter } from "../../src/meter/meter.js";
import { readMigrations, Store } from "../../src/meter/store.js";
import type { AdmitRequest, CallEnd } from "../../src/meter/types.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { testDatabase, type TestDatabase } from "../helpers/pglite.js";
import { testStack, type TestStack } from "../helpers/stack.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const HEX64 = "ab".repeat(32);
/** The breach test's first day: the 20th of a month, 08:00 UTC (plan §8). */
const T0 = Date.parse("2026-11-20T08:00:00.000Z");
const DAY = "2026-11-20";
const MONTH = "2026-11";
const CLIENT_LABEL = "author-laptop";

type Rec = Record<string, unknown>;

interface Rig {
  db: TestDatabase;
  store: Store;
  meter: Meter;
  drafts: IncidentDrafts;
  stateDir: string;
  logged: { level: string; record: Rec }[];
  clock: { now: number };
}

const rigs: Rig[] = [];
const stacks: TestStack[] = [];
afterEach(async () => {
  for (const r of rigs.splice(0)) {
    await r.drafts.stop();
    await r.meter.stop();
    await chmod(join(r.stateDir, "incidents"), 0o700).catch(() => {});
    await r.store.close();
    await rm(r.stateDir, { recursive: true, force: true });
  }
  for (const s of stacks.splice(0)) await s.close();
});

async function rig(): Promise<Rig> {
  const clock = { now: T0 };
  const realNow = () => clock.now;
  const logged: Rig["logged"] = [];
  const at = (level: string) => (record: object) => void logged.push({ level, record: record as Rec });
  const logger = { info: at("info"), warn: at("warn"), error: at("error"), fatal: at("fatal") };
  const db = await testDatabase();
  const store = new Store({
    db,
    migrations: await readMigrations(),
    envClass: "dev",
    logger,
    onFatal: () => {},
    realNow,
  });
  await store.start();
  const stateDir = await mkdtemp(join(tmpdir(), "h4-incidents-"));
  const config = await loadConfig(FIXTURES, { allowPlanned: false });
  if (!config.budgets || !config.alerts || !config.prices) throw new Error("fixtures");
  const gatewayClock = new GatewayClock(realNow);
  const metrics = new GatewayMetrics(otelMetrics.getMeter("test"));
  const meter = new Meter({
    stack: "dev",
    envClass: "dev",
    budgets: config.budgets,
    alerts: config.alerts,
    prices: config.prices,
    routingSha: HEX64,
    store,
    journal: new Journal({ stateDir, stack: "dev", realNow }),
    clock: gatewayClock,
    metrics,
    logger,
    realNow,
    hasFallback: true,
  });
  const drafts = new IncidentDrafts({
    stack: "dev",
    envClass: "dev",
    store,
    stateDir,
    budgets: config.budgets,
    prices: config.prices,
    fallbackId: "synthetic",
    env: { H4_GRAFANA_PORT: "18102", H4_LANGFUSE_PORT: "18101" },
    clock: gatewayClock,
    logger,
    realNow,
  });
  await db.pg.query(
    `INSERT INTO gateway.stack_state (id, stack, env, state, since, crossed, fallback_awaiting_renewal,
       fallback_awaiting_since, initialized_at, initialized_by, test_clock_offset_ms, updated_at)
     VALUES (1, 'dev', 'dev', 'normal', $1, '{}', false, NULL, $1, 'operator:dev#abcdef01', NULL, $1)`,
    [new Date(T0 - 3_600_000).toISOString()],
  );
  const r: Rig = { db, store, meter, drafts, stateDir, logged, clock };
  rigs.push(r);
  return r;
}

const trace = (): string => randomBytes(16).toString("hex");
const request = (o: Partial<AdmitRequest> = {}): AdmitRequest => ({
  attribution: "metered",
  adapter: {
    id: "synthetic",
    provider: "synthetic",
    model: "metered-test",
    fixedUsage: { inputTokens: 0, outputTokens: 1_000 },
  },
  adapterHealthy: true,
  maxOutputTokens: 128,
  requestId: trace(),
  traceId: trace(),
  purpose: "synthetic",
  routeReason: null,
  ...o,
});
const answered = (now: number): CallEnd => {
  const result: AdapterResult = {
    text: "synthetic response",
    usage: { inputTokens: 0, outputTokens: 1_000 },
    finishReason: "stop",
    responseModel: "metered-test",
    latencyMs: 3,
  };
  return { attempts: [{ outcome: "ok", result, startedAt: now, endedAt: now + 3 }] };
};

/** $4.90 seeded today, then calls of $0.10 a minute apart: the last crosses the daily ceiling. Resolves to its trace. */
async function tripDay(r: Rig, calls = 3): Promise<string> {
  await r.db.pg.query(
    `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no, created_at,
       updated_at)
     VALUES ('day', $1, 4700000, 0, NULL, NULL, $3, $3), ('month', $2, 4700000, 0, NULL, NULL, $3, $3)`,
    [DAY, MONTH, new Date(T0).toISOString()],
  );
  let last = "";
  for (let i = 0; i < calls; i++) {
    r.clock.now += 60_000;
    const a = await r.meter.admit(request());
    if (!a.ok) throw new Error(`refused: ${JSON.stringify(a)}`);
    last = a.admitted.traceId;
    await r.meter.settle(a.admitted, answered(r.clock.now), { clientLabel: CLIENT_LABEL });
  }
  return last;
}

async function incident(r: Rig): Promise<Rec> {
  const row = (await r.db.pg.query<Rec>("SELECT * FROM gateway.incidents ORDER BY id")).rows[0];
  if (row === undefined) throw new Error("no incident");
  return row;
}

const finalize = (r: Rig, key: string) =>
  r.db.pg.query(
    `UPDATE gateway.alert_outbox SET telegram_status = 'delivered', telegram_attempts = 1, telegram_ref = '42',
       telegram_delivered_at = now(), telegram_next_at = NULL, email_status = 'failed', email_attempts = 6,
       email_error = 'smtp_550', email_next_at = NULL
     WHERE dedupe_key = $1`,
    [key],
  );

describe("when a draft is written (alerts.md §7)", () => {
  it("waits until both channels of the trip alert are final", async () => {
    const r = await rig();
    await tripDay(r);
    expect(await incident(r)).toMatchObject({ status: "queued", trip_alert_key: `dev:trip:day:${DAY}` });
    expect(await r.drafts.tick()).toBe(0);
    expect((await incident(r)).status).toBe("queued");
    await finalize(r, `dev:trip:day:${DAY}`);
    expect(await r.drafts.tick()).toBe(1);
    expect((await incident(r)).status).toBe("written");
  });

  it("or 300 s after the trip, whichever comes first", async () => {
    const r = await rig();
    await tripDay(r);
    r.clock.now += 299_000;
    expect(await r.drafts.tick()).toBe(0);
    r.clock.now += 1_000;
    expect(await r.drafts.tick()).toBe(1);
    // The alert outcomes as they stood: still pending.
    const row = await incident(r);
    const content = await readFile(join(r.stateDir, String(row.path)), "utf8");
    expect(content).toContain(`| dev:trip:day:${DAY} | pending after 0 attempts | pending after 0 attempts |`);
  });

  it("runs every 10 s once started", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const r = await rig();
      await tripDay(r);
      await finalize(r, `dev:trip:day:${DAY}`);
      r.drafts.start();
      await vi.advanceTimersByTimeAsync(10_000);
      vi.useRealTimers();
      await vi.waitFor(async () => expect((await incident(r)).status).toBe("written"));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the draft's file and row (alerts.md §7; data-model.md §2.8)", () => {
  it("writes incidents/<date>-<stack>-<ceiling>.intent.md, mode 0640, with its SHA-256 and path in the row", async () => {
    const r = await rig();
    await tripDay(r);
    await finalize(r, `dev:trip:day:${DAY}`);
    r.clock.now += 5_000;
    expect(await r.drafts.tick()).toBe(1);
    const row = await incident(r);
    expect(row).toMatchObject({ status: "written", path: `incidents/${DAY}-dev-day.intent.md`, error: null });
    const file = join(r.stateDir, String(row.path));
    const bytes = await readFile(file);
    expect(row.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect((await stat(file)).mode & 0o777).toBe(0o640);
    expect((row.written_at as Date).getTime()).toBe(r.clock.now);
    // Through a temporary name: only the draft is left.
    expect(await readdir(join(r.stateDir, "incidents"))).toEqual([`${DAY}-dev-day.intent.md`]);
    expect(r.logged.find((l) => l.record.event === "incident.drafted")).toEqual({
      level: "info",
      record: { event: "incident.drafted", incident_id: row.id, path: row.path, sha256: row.sha256 },
    });
    // Written once: another pass finds nothing queued.
    expect(await r.drafts.tick()).toBe(0);
  });

  it("takes -2, then -3, when the name is taken", async () => {
    const r = await rig();
    await mkdir(join(r.stateDir, "incidents"), { recursive: true });
    await writeFile(join(r.stateDir, "incidents", `${DAY}-dev-day.intent.md`), "an earlier store's draft\n");
    await writeFile(join(r.stateDir, "incidents", `${DAY}-dev-day-2.intent.md`), "and another\n");
    await tripDay(r);
    await finalize(r, `dev:trip:day:${DAY}`);
    await r.drafts.tick();
    expect((await incident(r)).path).toBe(`incidents/${DAY}-dev-day-3.intent.md`);
    expect(await readFile(join(r.stateDir, "incidents", `${DAY}-dev-day.intent.md`), "utf8")).toBe(
      "an earlier store's draft\n",
    );
  });

  it("leaves the row queued with the error class when the write fails, and the next pass writes it", async () => {
    const r = await rig();
    await tripDay(r);
    await finalize(r, `dev:trip:day:${DAY}`);
    await mkdir(join(r.stateDir, "incidents"), { recursive: true });
    await chmod(join(r.stateDir, "incidents"), 0o500);
    expect(await r.drafts.tick()).toBe(0);
    expect(await r.drafts.tick()).toBe(0);
    expect(await incident(r)).toMatchObject({ status: "queued", error: "EACCES", path: null, sha256: null });
    // Logged when the failure starts, not on every pass.
    expect(r.logged.filter((l) => l.record.event === "incident.draft_failed").map((l) => l.record)).toEqual([
      { event: "incident.draft_failed", incident_id: (await incident(r)).id, error_class: "EACCES" },
    ]);
    await chmod(join(r.stateDir, "incidents"), 0o700);
    expect(await r.drafts.tick()).toBe(1);
    expect(await incident(r)).toMatchObject({ status: "written", error: null });
  });
});

describe("the draft's evidence (alerts.md §7; plan §8 step 8)", () => {
  /** The ### sections of a draft, as the breach probe reads them. */
  const sections = (content: string): Map<string, string> =>
    new Map(
      content
        .split(/^### /m)
        .slice(1)
        .map((part) => {
          const nl = part.indexOf("\n");
          return [part.slice(0, nl).trim(), part.slice(nl + 1)];
        }),
    );
  const rows = (body: string | undefined): string[] =>
    (body ?? "")
      .split("\n")
      .filter((l) => l.startsWith("|"))
      .slice(2);

  it("fills every field the breach test checks, from the store, with no client identifier or payload", async () => {
    const r = await rig();
    const crossing = await tripDay(r);
    await finalize(r, `dev:trip:day:${DAY}`);
    await r.drafts.tick();
    const row = await incident(r);
    const content = await readFile(join(r.stateDir, String(row.path)), "utf8");
    expect(content.split("\n").slice(0, 2)).toEqual([
      `# Intent: Respond to the daily ceiling breach on dev, ${DAY}`,
      `Author: the gateway (automated draft). Status: draft. Created: ${DAY}.`,
    ]);
    const s = sections(content);
    expect([...s.keys()]).toEqual([
      "Meters at the crossing",
      "The crossing",
      "The last 10 metered calls",
      "Hourly totals, the 24 hours before the crossing (UTC)",
      "Audit trail, this day",
      "Configuration",
      "Alerts",
      "Links",
    ]);
    expect(rows(s.get("Meters at the crossing"))).toEqual([
      `| day | ${DAY} | 5.000000 | 0.000000 | 5.000000 | 3.500000 |`,
      `| month | ${MONTH} | 5.000000 | 0.000000 | 20.000000 | 14.000000 |`,
      `| fallback_day | ${DAY} | 0.000000 | 0.000000 | 2.000000 (grant 1) | 1.400000 |`,
    ]);
    expect(s.get("The crossing")).toContain(`trace ${crossing}, synthetic metered-test, attribution metered`);
    expect(s.get("The crossing")).toContain("Spend before the call: 4.900000 USD; after: 5.000000 USD.");
    const last = rows(s.get("The last 10 metered calls"));
    expect(last).toHaveLength(3);
    expect(last[0]).toContain(crossing); // newest first
    expect(rows(s.get("Hourly totals, the 24 hours before the crossing (UTC)"))).toEqual([
      "| 2026-11-20T08:00Z | synthetic | metered-test | metered | 3 | 0 | 3000 | 0.300000 |",
    ]);
    expect(rows(s.get("Audit trail, this day"))).toEqual([`| 2026-11-20T08:03:00Z | gateway | trip | – |`]);
    expect(s.get("Configuration")).toMatch(/SHA-256 [0-9a-f]{64}\n/);
    expect(s.get("Configuration")).toContain("- Prices: version 2026-10-08.1, effective from ");
    expect(rows(s.get("Alerts"))[0]).toMatch(
      new RegExp(
        `^\\| dev:trip:day:${DAY} \\| delivered at \\S+ \\(message 42\\) \\| failed after 6 attempts \\(smtp_550\\) \\|$`,
      ),
    );
    expect(s.get("Links")).toContain("http://localhost:18102/d/h4-runtime?from=");
    expect(s.get("Links")).toContain(`http://localhost:18101/project/h4reet-dev/traces/${crossing}`);
    // No client identifier, no payload: the label stays in the ledger.
    expect(content).not.toContain(CLIENT_LABEL);
    expect(content).not.toContain("synthetic response");
    expect(
      (await r.db.pg.query("SELECT count(*)::int AS n FROM gateway.ledger WHERE client_label = $1", [CLIENT_LABEL]))
        .rows,
    ).toEqual([{ n: 3 }]);
  });

  it("adds the month's daily totals to a monthly draft, and its audit trail is the month's", async () => {
    const r = await rig();
    await r.db.pg.query(
      `INSERT INTO gateway.meters (meter, period_key, spent_micro, reserved_micro, allowance_micro, grant_no, created_at,
         updated_at)
       VALUES ('day', $1, 0, 0, NULL, NULL, $3, $3), ('month', $2, 19900000, 0, NULL, NULL, $3, $3)`,
      [DAY, MONTH, new Date(T0).toISOString()],
    );
    r.clock.now += 60_000;
    const a = await r.meter.admit(request());
    if (!a.ok) throw new Error("refused");
    await r.meter.settle(a.admitted, answered(r.clock.now));
    await finalize(r, `dev:trip:month:${MONTH}`);
    await r.drafts.tick();
    const row = await incident(r);
    expect(row).toMatchObject({ ceiling: "month", period_key: MONTH, path: `incidents/${DAY}-dev-month.intent.md` });
    const s = sections(await readFile(join(r.stateDir, String(row.path)), "utf8"));
    expect(rows(s.get("Daily totals this month"))).toEqual([`| ${DAY} | 1 | 0.100000 |`]);
    expect(rows(s.get("Audit trail, this month"))).toHaveLength(1);
  });
});

describe("GET /admin/incidents reads the draft back (operator-admin.md §4.3)", () => {
  it("returns it written, unchanged, with its content", async () => {
    const s = await testStack({ fallback: true });
    stacks.push(s);
    const post = (url: string, body: unknown) =>
      s.admin.inject({
        method: "POST",
        url,
        headers: { ...s.auth(), "content-type": "application/json" },
        payload: JSON.stringify(body),
      });
    expect(
      (await post("/admin/init", { reason: "Fresh dev stack for the draft test.", confirm_zero: true })).statusCode,
    ).toBe(200);
    await s.db.pg.query("UPDATE gateway.meters SET spent_micro = 4900000 WHERE meter IN ('day', 'month')");
    const res = await post("/admin/test/synthetic", {
      attribution: "metered",
      count: 1,
      reason: "One metered call to the daily ceiling.",
    });
    expect(res.statusCode).toBe(200);
    const key = (await s.db.pg.query<{ trip_alert_key: string }>("SELECT trip_alert_key FROM gateway.incidents"))
      .rows[0]?.trip_alert_key;
    await s.db.pg.query(
      `UPDATE gateway.alert_outbox SET telegram_status = 'delivered', email_status = 'delivered' WHERE dedupe_key = $1`,
      [key],
    );
    expect(await s.services.drafts.tick()).toBe(1);
    const read = (await s.admin.inject({ method: "GET", url: "/admin/incidents", headers: s.auth() })).json() as {
      incidents: Rec[];
    };
    expect(read.incidents[0]).toMatchObject({ ceiling: "day", status: "written", sha256_matches: true });
    expect(String(read.incidents[0]?.content)).toContain("### Meters at the crossing");
  });
});
