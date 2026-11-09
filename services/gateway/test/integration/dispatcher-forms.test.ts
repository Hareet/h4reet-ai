// An alert is never lost to its design (spec 011, FR-026 to FR-030, FR-044, FR-045; SC-004; plan §6; tasks.md T007),
// on PGlite with the test clock, an in-process stub of the Bot API, and a stub SMTP server, with stub designed
// renderers (T030 repeats the cases with the real ones):
// - a Telegram 400 to a designed message, as the HTTP status or as a 200 with error_code 400, is followed at once, in
//   the same attempt, by the plain text, with no entities and no parse_mode; the attempt counts once; the row records
//   telegram_form = 'plain' and entities_refused, and every later attempt sends plain;
// - a 429 or a 503 keeps the designed form on the schedule;
// - an SMTP 554 to the message's data, to the DATA command or to the message's end, is followed at once by today's
//   message, message_refused; a 451 keeps the designed form on the schedule;
// - a row queued before the change goes plain as not_rendered;
// - the claim's lease covers two sends, so a second dispatcher can't claim the row between them;
// - each fallback logs alert.fallback, adds to h4.alert.fallbacks, and raises no alert row; each attempt's span,
//   alert.deliver, holds no text, URL, or token.
import { metrics as sdkMetrics, node, tracing } from "@opentelemetry/sdk-node";
import { afterEach, describe, expect, it } from "vitest";

import { Dispatcher, type Channels } from "../../src/alerts/dispatcher.js";
import type { AlertContext, AlertSpec } from "../../src/alerts/format.js";
import type { DesignedRenderers } from "../../src/alerts/forms.js";
import { enqueueAlert, queueAlert } from "../../src/alerts/outbox.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { ctx, meters, T } from "../helpers/alert-cases.js";
import { stubSmtp, type StubSmtp } from "../helpers/stub-smtp.js";
import { telegramStub, type TelegramStub } from "../helpers/stub-telegram.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;

const T0 = Date.parse("2026-10-29T16:40:03.000Z");
const TOKEN = "123456789:made-for-this-test-and-never-logged-z";
const TIMEOUT_MS = 300;

/** Stub designs: a designed Telegram text with one entity, and an HTML part that says it is designed. */
const STUB_DESIGNS: DesignedRenderers = {
  telegram: (c) => ({ text: `DESIGNED ${c.dedupeKey}`, entities: [{ type: "bold", offset: 0, length: 8 }] }),
  email: (c) => ({
    subject: `🔴 🛑 ${c.prefix} designed`,
    html: `<!DOCTYPE html><html lang="en"><body><table><tr><td>DESIGNED ${c.dedupeKey}</td></tr></table></body></html>`,
  }),
};

const TRIP_KEY = "dev:trip:day:2026-10-29";
const tripCtx = (key = TRIP_KEY): AlertContext =>
  ctx({
    key,
    at: "2026-10-29T16:40:03Z",
    stack: "dev",
    runtime: { state: "degraded", since: T("2026-10-29T16:40:03Z") },
    meters: meters(5_000_000, 8_500_000, 2_000_000),
  });
const TRIP: AlertSpec = { kind: "trip", ceiling: "day" };

interface Rig {
  s: TestStack;
  d: Dispatcher;
  telegram: TelegramStub;
  smtp: StubSmtp;
  clock: { now: number };
  spans: tracing.InMemorySpanExporter;
  collect(): Promise<sdkMetrics.ResourceMetrics>;
  extra: Dispatcher[];
}
const rigs: Rig[] = [];
afterEach(async () => {
  for (const r of rigs.splice(0)) {
    for (const d of [r.d, ...r.extra]) await d.stop();
    await r.s.close();
    await r.telegram.close();
    await r.smtp.close();
  }
});

async function rig(o: { renderers?: DesignedRenderers } = {}): Promise<Rig> {
  const clock = { now: T0 };
  const exporter = new sdkMetrics.InMemoryMetricExporter(sdkMetrics.AggregationTemporality.CUMULATIVE);
  const reader = new sdkMetrics.PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  const meterProvider = new sdkMetrics.MeterProvider({ readers: [reader] });
  const metrics = new GatewayMetrics(meterProvider.getMeter("dispatcher-forms"));
  const s = await testStack({ fallback: true, realNow: () => clock.now, metrics });
  const telegram = await telegramStub();
  const smtp = await stubSmtp();
  const spans = new tracing.InMemorySpanExporter();
  const tracer = new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(spans)] }).getTracer(
    "dispatcher-forms",
  );
  const channels: Channels = {
    mode: "standin",
    telegram: { base: telegram.url, token: TOKEN, chatId: "0", timeoutMs: TIMEOUT_MS },
    email: {
      host: "127.0.0.1",
      port: smtp.port,
      secure: false,
      requireTLS: false,
      ignoreTLS: true,
      from: "alerts@h4reet.local",
      to: "operator@h4reet.local",
      timeoutMs: 1_000,
    },
  };
  const make = () =>
    new Dispatcher({
      stack: "dev",
      envClass: "dev",
      store: s.store,
      alerts: s.services.alerts,
      budgets: s.services.budgets,
      channels,
      hasFallback: true,
      clock: s.services.clock,
      metrics,
      logger: s.services.logger,
      realNow: () => clock.now,
      renderers: o.renderers ?? STUB_DESIGNS,
      tracer,
    });
  const r: Rig = {
    s,
    d: make(),
    telegram,
    smtp,
    clock,
    spans,
    collect: async () => (await reader.collect()).resourceMetrics,
    extra: [],
  };
  (r as Rig & { make: () => Dispatcher }).make = make;
  rigs.push(r);
  return r;
}

const another = (r: Rig): Dispatcher => {
  const d = (r as Rig & { make: () => Dispatcher }).make();
  r.extra.push(d);
  return d;
};

async function queue(r: Rig, key = TRIP_KEY): Promise<void> {
  await r.s.store.transaction((q) => queueAlert(q, tripCtx(key), TRIP, r.clock.now));
}

async function row(r: Rig): Promise<Rec> {
  return (
    (
      await r.s.db.pg.query<Rec>(
        `SELECT telegram_status, telegram_attempts, telegram_form, telegram_fallback, telegram_error, telegram_next_at,
                email_status, email_attempts, email_form, email_fallback, email_error, body
         FROM gateway.alert_outbox ORDER BY id DESC LIMIT 1`,
      )
    ).rows[0] ?? {}
  );
}

const events = (r: Rig, event: string) => r.s.logged.filter((l) => l.record.event === event).map((l) => l.record);

async function points(r: Rig, name: string): Promise<{ attributes: Rec; value: unknown }[]> {
  const rm = await r.collect();
  const metric = rm.scopeMetrics.flatMap((x) => x.metrics).find((m) => m.descriptor.name === name);
  return (metric?.dataPoints ?? []).map((p) => ({ attributes: p.attributes as Rec, value: p.value }));
}

const REFUSED_ENTITIES = { ok: false, error_code: 400, description: "Bad Request: can't parse entities" };

describe("Telegram refuses the entities (FR-026, FR-028)", () => {
  for (const [how, answer, errorClass] of [
    ["as its HTTP status", { status: 400, body: REFUSED_ENTITIES }, "http_400"],
    ["as a 200 whose error_code is 400", { status: 200, body: REFUSED_ENTITIES }, "telegram_400"],
  ] as const) {
    it(`sends the plain text at once, in the same attempt, when it answers 400 ${how}`, async () => {
      const r = await rig();
      await queue(r);
      r.telegram.next.push(answer);
      await r.d.tick();
      const [designed, plain] = r.telegram.requests;
      expect(r.telegram.requests).toHaveLength(2);
      expect(designed?.body).toEqual({
        chat_id: "0",
        text: `DESIGNED ${TRIP_KEY}`,
        entities: [{ type: "bold", offset: 0, length: 8 }],
        disable_web_page_preview: true,
      });
      const stored = await row(r);
      expect(plain?.body).toEqual({ chat_id: "0", text: stored.body, disable_web_page_preview: true });
      expect(plain?.body).not.toHaveProperty("parse_mode");
      // No added wait: the plain send starts within 50 ms of the refusal's answer.
      expect((plain?.at ?? Infinity) - (designed?.answeredAt ?? 0)).toBeLessThan(50);
      expect(stored).toMatchObject({
        telegram_status: "delivered",
        telegram_attempts: 1, // the attempt counts once
        telegram_form: "plain",
        telegram_fallback: "entities_refused",
        telegram_error: null,
        email_status: "delivered",
        email_form: "designed",
        email_fallback: null,
      });
      expect(events(r, "alert.fallback")).toEqual([
        {
          event: "alert.fallback",
          dedupe_key: TRIP_KEY,
          kind: "trip",
          channel: "telegram",
          attempt: 1,
          reason: "entities_refused",
          error_class: errorClass,
        },
      ]);
      expect(events(r, "alert.delivered")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ channel: "telegram", form: "plain", fallback_reason: "entities_refused" }),
          expect.objectContaining({ channel: "email", form: "designed" }),
        ]),
      );
      expect(await points(r, "h4.alert.fallbacks")).toEqual([
        {
          attributes: {
            "h4.channel": "telegram",
            "h4.alert.kind": "trip",
            "h4.alert.fallback_reason": "entities_refused",
          },
          value: 1,
        },
      ]);
      // A fallback raises no alert of its own.
      expect((await r.s.db.pg.query("SELECT 1 FROM gateway.alert_outbox")).rows).toHaveLength(1);
    });
  }

  it("sends plain on every later attempt of that alert, and counts the fallback once", async () => {
    const r = await rig();
    await queue(r);
    r.telegram.next.push({ status: 400, body: REFUSED_ENTITIES }, { status: 500, body: { ok: false } });
    await r.d.tick();
    expect(await row(r)).toMatchObject({
      telegram_status: "pending",
      telegram_attempts: 1,
      telegram_form: "plain",
      telegram_fallback: "entities_refused",
      telegram_error: "http_500",
    });
    r.clock.now = T0 + 5_000;
    await r.d.tick();
    expect(r.telegram.requests).toHaveLength(3);
    expect(r.telegram.requests[2]?.body).not.toHaveProperty("entities");
    expect(await row(r)).toMatchObject({
      telegram_status: "delivered",
      telegram_attempts: 2,
      telegram_form: "plain",
      telegram_fallback: "entities_refused",
    });
    expect(events(r, "alert.fallback")).toHaveLength(1);
    expect((await points(r, "h4.alert.fallbacks")).map((p) => p.value)).toEqual([1]);
  });

  for (const status of [429, 503]) {
    it(`keeps the designed form on the schedule after a ${status} (FR-029)`, async () => {
      const r = await rig();
      await queue(r);
      r.telegram.next.push({ status, body: { ok: false, error_code: status } });
      await r.d.tick();
      expect(r.telegram.requests).toHaveLength(1);
      expect(await row(r)).toMatchObject({
        telegram_status: "pending",
        telegram_form: "designed",
        telegram_fallback: null,
        telegram_error: `http_${status}`,
      });
      r.clock.now = T0 + 5_000;
      await r.d.tick();
      expect(r.telegram.requests).toHaveLength(2);
      expect(r.telegram.requests[1]?.body).toHaveProperty("entities");
      expect(await row(r)).toMatchObject({ telegram_status: "delivered", telegram_form: "designed" });
      expect(events(r, "alert.fallback")).toEqual([]);
    });
  }
});

describe("the mail server refuses the message (FR-027)", () => {
  for (const step of ["DATA", "END"] as const) {
    it(`sends today's message at once when a 554 answers ${step === "DATA" ? "the DATA command" : "the message's end"}`, async () => {
      const r = await rig();
      await queue(r);
      r.smtp.refuse(step, 554);
      await r.d.tick();
      const stored = await row(r);
      expect(stored).toMatchObject({
        email_status: "delivered",
        email_attempts: 1,
        email_form: "plain",
        email_fallback: "message_refused",
        email_error: null,
      });
      expect(r.smtp.messages).toHaveLength(1);
      const data = r.smtp.messages[0]?.data ?? "";
      expect(data).toMatch(/^Subject: \[dev\] KILL SWITCH TRIPPED: daily ceiling reached\r$/m);
      expect(data).toMatch(/^Content-Type: text\/plain/m);
      expect(data).not.toMatch(/text\/html/);
      expect(events(r, "alert.fallback")).toEqual([
        expect.objectContaining({ channel: "email", reason: "message_refused", error_class: "smtp_554" }),
      ]);
    });
  }

  it("keeps the designed form on the schedule after a 451, a transient reply", async () => {
    const r = await rig();
    await queue(r);
    r.smtp.refuse("DATA", 451);
    await r.d.tick();
    expect(await row(r)).toMatchObject({
      email_status: "pending",
      email_form: "designed",
      email_fallback: null,
      email_error: "smtp_451",
    });
    r.clock.now = T0 + 5_000;
    await r.d.tick();
    expect(await row(r)).toMatchObject({ email_status: "delivered", email_form: "designed" });
    expect(r.smtp.messages[0]?.data).toMatch(/multipart\/alternative/);
    expect(events(r, "alert.fallback")).toEqual([]);
  });
});

describe("a row queued before the change (FR-030)", () => {
  it("goes plain on both channels, recorded as not_rendered", async () => {
    const r = await rig();
    await r.s.store.transaction((q) =>
      enqueueAlert(q, {
        dedupeKey: "dev:warn:day:2026-10-29",
        kind: "warn",
        stack: "dev",
        createdAt: new Date(T0).toISOString(),
        enqueuedAt: r.clock.now,
        subject: "[dev] WARNING: daily meter at 70%",
        body: "[dev] WARNING: daily meter at 70%\nRunbook: docs/runbooks/cost-warning.md",
        facts: { kind: "warn" },
      }),
    );
    await r.d.tick();
    expect(r.telegram.requests[0]?.body).toEqual({
      chat_id: "0",
      text: "[dev] WARNING: daily meter at 70%\nRunbook: docs/runbooks/cost-warning.md",
      disable_web_page_preview: true,
    });
    expect(await row(r)).toMatchObject({
      telegram_form: "plain",
      telegram_fallback: "not_rendered",
      email_form: "plain",
      email_fallback: "not_rendered",
    });
    expect(r.smtp.messages[0]?.data).not.toMatch(/text\/html/);
    expect((await points(r, "h4.alert.fallbacks")).map((p) => p.attributes["h4.alert.fallback_reason"])).toEqual([
      "not_rendered",
      "not_rendered",
    ]);
  });
});

describe("one lease over both sends (FR-028)", () => {
  it("leases the row for two sends, so a second dispatcher can't claim it between them", async () => {
    const r = await rig();
    await queue(r);
    const d2 = another(r);
    let lease: number | undefined;
    r.telegram.next.push({ status: 400, body: REFUSED_ENTITIES });
    r.telegram.beforeAnswer = async (index) => {
      if (index !== 0) return;
      const { rows } = await r.s.db.pg.query<{ next: Date }>(
        "SELECT telegram_next_at AS next FROM gateway.alert_outbox",
      );
      lease = new Date(rows[0]?.next ?? 0).getTime();
      await d2.tick(); // between the refused designed send and the plain one
    };
    await r.d.tick();
    expect(lease).toBe(T0 + 2 * TIMEOUT_MS + 5_000);
    expect(r.telegram.requests).toHaveLength(2); // the designed send and the plain one, none from d2
    expect(await row(r)).toMatchObject({ telegram_status: "delivered", telegram_attempts: 1 });
  });
});

describe("each attempt's span, alert.deliver (FR-044; plan §9.3)", () => {
  it("records the channel, kind, form, reason, outcome, attempt, and sample flag, and no text, URL, or token", async () => {
    const r = await rig();
    await queue(r);
    r.telegram.next.push({ status: 400, body: REFUSED_ENTITIES });
    await r.d.tick();
    const deliver = r.spans.getFinishedSpans().filter((x) => x.name === "alert.deliver");
    expect(
      deliver.map((x) => x.attributes).sort((a, b) => String(a["h4.channel"]).localeCompare(String(b["h4.channel"]))),
    ).toEqual([
      {
        "h4.channel": "email",
        "h4.alert.kind": "trip",
        "h4.alert.form": "designed",
        "h4.outcome": "delivered",
        "h4.alert.attempt": 1,
        "h4.alert.sample": false,
      },
      {
        "h4.channel": "telegram",
        "h4.alert.kind": "trip",
        "h4.alert.form": "plain",
        "h4.alert.fallback_reason": "entities_refused",
        "h4.outcome": "delivered",
        "h4.alert.attempt": 1,
        "h4.alert.sample": false,
      },
    ]);
    for (const x of deliver) expect(x.parentSpanContext).toBeUndefined(); // a root of its own
    const all = JSON.stringify(deliver.map((x) => [x.attributes, x.events, x.name]));
    for (const never of ["made-for-this-test", "http", "/bot", "KILL SWITCH", "DESIGNED", "operator@", "127.0.0.1"]) {
      expect(all).not.toContain(never);
    }
  });
});
