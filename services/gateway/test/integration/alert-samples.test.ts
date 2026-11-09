// The samples (spec 011, FR-033 to FR-040, FR-047; SC-006, SC-007; plan §7; tasks.md T034), on PGlite with the test
// clock and the stub channels: POST /admin/alert-samples answers at once with the samples' keys and the delivery mode,
// writes one audit row and nothing else, and the dispatcher delivers every sample on both channels in its designed
// form, marked, from its memory, never the outbox, after any real alert that is due, at most one a second on each
// channel; the samples count under the kind sample alone; the request counts as alert_samples, on its server span too.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { FastifyOtelInstrumentation } from "@fastify/otel";
import { SpanKind, context, trace } from "@opentelemetry/api";
import { metrics as sdkMetrics, node, tracing } from "@opentelemetry/sdk-node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Channels } from "../../src/alerts/dispatcher.js";
import { enqueueAlert } from "../../src/alerts/outbox.js";
import { GatewayMetrics } from "../../src/telemetry/metrics.js";
import { isHealthProbe } from "../../src/telemetry/otel.js";
import { connectionLost } from "../helpers/pglite.js";
import { stubSmtp, type StubSmtp } from "../helpers/stub-smtp.js";
import { telegramStub, type TelegramStub } from "../helpers/stub-telegram.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;

const spans = new tracing.InMemorySpanExporter();
const provider = new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(spans)] });
let fastifyOtel: FastifyOtelInstrumentation;
beforeAll(() => {
  provider.register();
  fastifyOtel = new FastifyOtelInstrumentation({
    registerOnInitialization: true,
    ignorePaths: (route) => isHealthProbe(route.url),
  });
});
afterAll(async () => {
  fastifyOtel?.disable();
  await provider.shutdown();
  trace.disable();
  context.disable();
});

const T0 = Date.parse("2026-11-08T12:00:00.000Z");
const REASON = "A look at every alert design.";

interface Rig {
  s: TestStack;
  telegram: TelegramStub;
  smtp: StubSmtp;
  clock: { now: number };
  collect(): Promise<sdkMetrics.ResourceMetrics>;
}
const rigs: Rig[] = [];
beforeEach(() => spans.reset());
afterEach(async () => {
  for (const r of rigs.splice(0)) {
    await r.s.close();
    await r.telegram.close();
    await r.smtp.close();
  }
});

async function rig(o: { init?: boolean; storeDown?: boolean } = {}): Promise<Rig> {
  const clock = { now: T0 };
  const telegram = await telegramStub();
  const smtp = await stubSmtp();
  const exporter = new sdkMetrics.InMemoryMetricExporter(sdkMetrics.AggregationTemporality.CUMULATIVE);
  const reader = new sdkMetrics.PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  const meterProvider = new sdkMetrics.MeterProvider({ readers: [reader] });
  const channels: Channels = {
    mode: "standin",
    telegram: { base: telegram.url, token: "standin", chatId: "0", timeoutMs: 1_000 },
    email: {
      host: "127.0.0.1",
      port: smtp.port,
      secure: false,
      requireTLS: false,
      ignoreTLS: true,
      from: "alerts@h4reet.local",
      to: "operator@h4reet.local",
      timeoutMs: 2_000,
    },
  };
  const s = await testStack({
    stack: "dev-cpu",
    fallback: true,
    realNow: () => clock.now,
    metrics: new GatewayMetrics(meterProvider.getMeter("alert-samples")),
    channels,
    ...(o.storeDown ? { storeDown: true } : {}),
  });
  const r = { s, telegram, smtp, clock, collect: async () => (await reader.collect()).resourceMetrics };
  rigs.push(r);
  if (o.init !== false && !o.storeDown) {
    const init = await post(r, "/admin/init", { reason: "Fresh dev-cpu stack for the samples.", confirm_zero: true });
    expect(init.statusCode).toBe(200);
    // The init's confirmation alert goes first, a real alert; the stubs then start empty.
    await s.services.dispatcher.tick();
    expect(telegram.requests).toHaveLength(1);
    telegram.requests.length = 0;
    smtp.messages.length = 0;
  }
  return r;
}

const post = (r: Rig, url: string, body: unknown, headers: Record<string, string> = {}) =>
  r.s.admin.inject({
    method: "POST",
    url,
    headers: { ...r.s.auth(), "content-type": "application/json", ...headers },
    payload: typeof body === "string" ? body : JSON.stringify(body),
  });
const samples = (r: Rig, body: unknown = { reason: REASON }) => post(r, "/admin/alert-samples", body);

/** Pass after pass, a second and a little apart, until every sample is final on both channels, or `max` passes. */
async function deliverAll(r: Rig, max = 40): Promise<void> {
  for (let i = 0; i < max && r.s.services.dispatcher.samplesPending(); i++) {
    r.clock.now += 1_100;
    await r.s.services.dispatcher.tick();
  }
}

async function points(r: Rig, name: string): Promise<{ attributes: Rec; value: unknown }[]> {
  const metric = (await r.collect()).scopeMetrics.flatMap((x) => x.metrics).find((m) => m.descriptor.name === name);
  return (metric?.dataPoints ?? []).map((p) => ({ attributes: p.attributes as Rec, value: p.value }));
}

const ENTRIES = 19;

describe("POST /admin/alert-samples (FR-033; operator-admin.md §2.4)", () => {
  it("answers at once with every entry's key and the delivery mode, and writes one audit row, nothing else", async () => {
    const r = await rig();
    const before = {
      state: (await r.s.db.pg.query<Rec>("SELECT state, since, crossed FROM gateway.stack_state")).rows,
      meters: (await r.s.db.pg.query<Rec>("SELECT * FROM gateway.meters ORDER BY meter, period_key")).rows,
      outbox: (await r.s.db.pg.query<Rec>("SELECT dedupe_key FROM gateway.alert_outbox ORDER BY id")).rows,
    };
    const res = await samples(r);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      action: string;
      audit_id: number;
      delivery: string;
      samples: { entry: string; key: string }[];
    };
    expect(body.action).toBe("alert_samples");
    expect(body.delivery).toBe("standin");
    expect(body.samples).toHaveLength(ENTRIES);
    expect(body.samples[0]).toEqual({ entry: "warn-day", key: `dev-cpu:sample:warn-day:${body.audit_id}` });
    for (const sample of body.samples) expect(sample.key).toBe(`dev-cpu:sample:${sample.entry}:${body.audit_id}`);
    const audit = (
      await r.s.db.pg.query<Rec>(
        "SELECT id, actor, action, reason, before, after, detail FROM gateway.audit_log WHERE action = 'alert_samples'",
      )
    ).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      id: body.audit_id,
      actor: `operator:dev-cpu#${r.s.tokenSha256.slice(0, 8)}`,
      reason: REASON,
      before: null,
      after: null,
      detail: {
        kind: null,
        entries: body.samples.map((x) => x.entry),
        keys: body.samples.map((x) => x.key),
        delivery: "standin",
      },
    });
    // No state, meter, outbox row, or confirmation alert changed; the samples are in memory.
    expect((await r.s.db.pg.query<Rec>("SELECT state, since, crossed FROM gateway.stack_state")).rows).toEqual(
      before.state,
    );
    expect((await r.s.db.pg.query<Rec>("SELECT * FROM gateway.meters ORDER BY meter, period_key")).rows).toEqual(
      before.meters,
    );
    expect((await r.s.db.pg.query<Rec>("SELECT dedupe_key FROM gateway.alert_outbox ORDER BY id")).rows).toEqual(
      before.outbox,
    );
    expect(r.s.services.dispatcher.samplesPending()).toBe(true);
    // No journal record: nothing changed state.
    const dir = join(r.s.stateDir, "journal");
    const journal = (await Promise.all((await readdir(dir)).map((f) => readFile(join(dir, f), "utf8")))).join("");
    expect(journal).not.toContain("alert_samples");
  });

  it("takes one kind's entries with its kind", async () => {
    const r = await rig();
    const res = await samples(r, { reason: REASON, kind: "trip" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { samples: unknown[] }).samples).toEqual([
      { entry: "trip", key: `dev-cpu:sample:trip:${(res.json() as { audit_id: number }).audit_id}` },
    ]);
  });

  it("refuses a short reason, an unknown kind, another key, and a body that isn't JSON", async () => {
    const r = await rig();
    for (const body of [
      { reason: "too short" },
      { reason: REASON, kind: "sample" },
      { reason: REASON, kind: "page" },
      { reason: REASON, extra: 1 },
      [],
    ]) {
      const res = await samples(r, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json(), JSON.stringify(body)).toMatchObject({ error: "invalid_request" });
    }
    expect((await post(r, "/admin/alert-samples", "reason=x", { "content-type": "text/plain" })).statusCode).toBe(415);
    expect((await r.s.db.pg.query("SELECT 1 FROM gateway.audit_log WHERE action = 'alert_samples'")).rows).toEqual([]);
    expect(r.s.services.dispatcher.samplesPending()).toBe(false);
  });

  it("refuses a second request while the first's samples are pending: 409 samples_in_flight", async () => {
    const r = await rig();
    expect((await samples(r)).statusCode).toBe(200);
    const again = await samples(r, { reason: "And once more, please." });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: "samples_in_flight" });
    await deliverAll(r);
    expect((await samples(r, { reason: "Once they are all out." })).statusCode).toBe(200);
  });

  it("answers 503 store_unreachable when the store can't take the audit row, and queues nothing", async () => {
    const r = await rig();
    r.s.db.hook = () => {
      throw connectionLost();
    };
    const res = await samples(r);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "store_unreachable" });
    r.s.db.hook = undefined;
    expect(r.s.services.dispatcher.samplesPending()).toBe(false);
  });

  it("counts the request as alert_samples, and puts h4.action on its server span", async () => {
    const r = await rig();
    spans.reset();
    expect((await samples(r)).statusCode).toBe(200);
    expect(await points(r, "h4.operator.actions")).toEqual(
      expect.arrayContaining([{ attributes: { "h4.action": "alert_samples" }, value: 1 }]),
    );
    const server = spans
      .getFinishedSpans()
      .find((x) => x.kind === SpanKind.SERVER && x.attributes["http.route"] === "/admin/alert-samples");
    expect(server?.attributes).toMatchObject({ "h4.action": "alert_samples", "h4.outcome": "ok" });
    expect(JSON.stringify(server?.attributes)).not.toContain(REASON);
  });
});

describe("the samples' delivery (FR-034 to FR-039; SC-006, SC-007)", () => {
  it("delivers every sample on both channels, designed and marked, from memory, never the outbox", async () => {
    const r = await rig();
    const res = await samples(r);
    const keys = (res.json() as { samples: { key: string }[] }).samples.map((x) => x.key);
    await deliverAll(r);
    expect(r.s.services.dispatcher.samplesPending()).toBe(false);
    expect(r.telegram.requests).toHaveLength(ENTRIES);
    for (const [i, request] of r.telegram.requests.entries()) {
      const text = String(request.body.text);
      expect(text.split("\n")[0]).toMatch(
        /^🧪 SAMPLE · A sample, sent by operator #[0-9a-f]{8}: nothing happened on dev-cpu\.$/,
      );
      expect(text).toContain(`id ${keys[i]}`);
      expect(request.body.entities).not.toEqual([]);
    }
    expect(r.smtp.messages).toHaveLength(ENTRIES);
    for (const message of r.smtp.messages) {
      expect(message.data).toMatch(/multipart\/alternative/);
      expect(message.data).toMatch(/text\/html/);
    }
    expect(
      (await r.s.db.pg.query("SELECT 1 FROM gateway.alert_outbox WHERE dedupe_key LIKE '%:sample:%'")).rows,
    ).toEqual([]);
    // Counted under sample alone, with their form, and no delivery lag of theirs: the histogram holds the init
    // alert's two deliveries only.
    const attempts = (await points(r, "h4.alerts")).filter((p) => p.attributes["h4.alert.kind"] === "sample");
    expect(attempts).toEqual(
      expect.arrayContaining([
        {
          attributes: {
            "h4.channel": "telegram",
            "h4.alert.kind": "sample",
            "h4.outcome": "delivered",
            "h4.alert.form": "designed",
          },
          value: ENTRIES,
        },
        {
          attributes: {
            "h4.channel": "email",
            "h4.alert.kind": "sample",
            "h4.outcome": "delivered",
            "h4.alert.form": "designed",
          },
          value: ENTRIES,
        },
      ]),
    );
    const lag = await points(r, "h4.alert.delivery_lag");
    expect(lag.reduce((n, p) => n + Number((p.value as { count?: number }).count ?? 0), 0)).toBe(2);
  });

  it("sends at most one sample a second on each channel", async () => {
    const r = await rig();
    await samples(r);
    r.clock.now += 1_100;
    await r.s.services.dispatcher.tick();
    await r.s.services.dispatcher.tick(); // the same moment: no second sample
    expect(r.telegram.requests).toHaveLength(1);
    expect(r.smtp.messages).toHaveLength(1);
    r.clock.now += 900; // 900 ms after the first: still none
    await r.s.services.dispatcher.tick();
    expect(r.telegram.requests).toHaveLength(1);
    r.clock.now += 200;
    await r.s.services.dispatcher.tick();
    expect(r.telegram.requests).toHaveLength(2);
  });

  it("attempts a real alert that falls due before the next sample", async () => {
    const r = await rig();
    await samples(r);
    r.clock.now += 1_100;
    await r.s.services.dispatcher.tick();
    expect(r.telegram.requests).toHaveLength(1);
    await r.s.store.transaction((q) =>
      enqueueAlert(q, {
        dedupeKey: "dev-cpu:warn:day:2026-11-08",
        kind: "warn",
        stack: "dev-cpu",
        createdAt: new Date(r.clock.now).toISOString(),
        enqueuedAt: r.clock.now,
        subject: "[dev-cpu] WARNING: daily meter at 70%",
        body: "[dev-cpu] WARNING: daily meter at 70%\nRunbook: docs/runbooks/cost-warning.md",
        facts: { kind: "warn" },
      }),
    );
    r.clock.now += 1_100;
    await r.s.services.dispatcher.tick();
    // The pass that found the real alert due sent it, and no sample on that channel.
    expect(r.telegram.requests).toHaveLength(2);
    expect(String(r.telegram.requests[1]?.body.text)).toContain("[dev-cpu] WARNING: daily meter at 70%");
    r.clock.now += 1_100;
    await r.s.services.dispatcher.tick();
    expect(String(r.telegram.requests[2]?.body.text)).toMatch(/^🧪 SAMPLE/);
  });

  it("counts a sample's fallback under sample, and its failure too, as a channel's down", async () => {
    const r = await rig();
    await samples(r, { reason: REASON, kind: "trip" });
    r.telegram.next.push({
      status: 400,
      body: { ok: false, error_code: 400, description: "Bad Request: can't parse entities" },
    });
    await deliverAll(r);
    expect(await points(r, "h4.alert.fallbacks")).toEqual([
      {
        attributes: {
          "h4.channel": "telegram",
          "h4.alert.kind": "sample",
          "h4.alert.fallback_reason": "entities_refused",
        },
        value: 1,
      },
    ]);
    expect(r.telegram.requests).toHaveLength(2);
    expect(r.telegram.requests[1]?.body).not.toHaveProperty("entities");
  });
});
