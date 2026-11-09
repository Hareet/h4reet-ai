// Alert delivery (tasks.md T077; contracts/alerts.md §4; data-model.md §2.7), on PGlite, with a stub of the Telegram
// Bot API and a stub SMTP server on the sandbox's own loopback. Nothing reaches a real service:
// - each channel on its own: Telegram's sendMessage in plain text, email over SMTP with its headers;
// - the retry schedule on the real clock, and a channel given up at 300 s, recorded as error classes only;
// - after a restart, a window that has passed is failed without another attempt;
// - LISTEN wakes the dispatcher;
// - the in-memory store_unreachable alert after 60 s, once per outage;
// - the daily reminder.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { Dispatcher, type Channels } from "../../src/alerts/dispatcher.js";
import { enqueueAlert } from "../../src/alerts/outbox.js";
import { sendEmail, smtpErrorClass, transportOptions, type EmailChannel } from "../../src/alerts/smtp.js";
import { sendTelegram } from "../../src/alerts/telegram.js";
import { dayKey } from "../../src/core/clock.js";
import { connectionLost } from "../helpers/pglite.js";
import { stubSmtp, type StubSmtp } from "../helpers/stub-smtp.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;

interface TelegramStub {
  url: string;
  requests: { path: string; body: Rec }[];
  /** The next answers, then 200 with a message_id. */
  next: ({ status: number; body: unknown } | { hang: true })[];
  close(): Promise<void>;
}

async function telegramStub(): Promise<TelegramStub> {
  const requests: TelegramStub["requests"] = [];
  const next: TelegramStub["next"] = [];
  let id = 0;
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    req.on("end", () => {
      requests.push({ path: req.url ?? "", body: JSON.parse(raw || "{}") as Rec });
      const answer = next.shift();
      if (answer !== undefined && "hang" in answer) return; // never answers: the client's timeout ends it
      const status = answer?.status ?? 200;
      const body = answer?.body ?? { ok: true, result: { message_id: (id += 1) } };
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    next,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const T0 = Date.parse("2026-10-29T16:40:03.000Z");

interface Rig {
  s: TestStack;
  d: Dispatcher;
  telegram: TelegramStub;
  smtp: StubSmtp;
  clock: { now: number };
}
const rigs: Rig[] = [];
afterEach(async () => {
  for (const r of rigs.splice(0)) {
    await r.d.stop();
    await r.s.close();
    await r.telegram.close();
    await r.smtp.close();
  }
});

async function rig(o: { intervalMs?: number } = {}): Promise<Rig> {
  const clock = { now: T0 };
  const s = await testStack({ fallback: true, realNow: () => clock.now });
  const telegram = await telegramStub();
  const smtp = await stubSmtp();
  const channels: Channels = {
    mode: "standin",
    telegram: { base: telegram.url, token: "standin", chatId: "0", timeoutMs: 300 },
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
    ...(o.intervalMs === undefined ? {} : { intervalMs: o.intervalMs }),
  });
  const r = { s, d, telegram, smtp, clock };
  rigs.push(r);
  return r;
}

async function enqueue(r: Rig, key = "dev:warn:day:2026-10-29", enqueuedAt = r.clock.now): Promise<void> {
  await r.s.store.transaction((q) =>
    enqueueAlert(q, {
      dedupeKey: key,
      kind: "warn",
      stack: "dev",
      createdAt: new Date(T0).toISOString(),
      enqueuedAt,
      subject: "[dev] WARNING: daily meter at 70%",
      body: "[dev] WARNING: daily meter at 70%\nRuntime: normal · Fallback: available · 2026-10-29T16:40:03Z · id x\nRunbook: docs/runbooks/cost-warning.md",
      facts: { kind: "warn" },
    }),
  );
}

async function row(r: Rig): Promise<Rec> {
  return (
    (
      await r.s.db.pg.query<Rec>(
        `SELECT telegram_status, telegram_attempts, telegram_next_at, telegram_ref, telegram_error, telegram_delivered_at,
              email_status, email_attempts, email_ref, email_error
       FROM gateway.alert_outbox ORDER BY id DESC LIMIT 1`,
      )
    ).rows[0] ?? {}
  );
}

const events = (r: Rig, event: string) => r.s.logged.filter((l) => l.record.event === event).map((l) => l.record);

describe("delivery on both channels (alerts.md §4.1)", () => {
  it("sends Telegram's sendMessage in plain text and an email with its headers, and records each reference", async () => {
    const r = await rig();
    await enqueue(r);
    r.clock.now += 1_500;
    await r.d.tick();
    expect(r.telegram.requests).toEqual([
      {
        path: "/botstandin/sendMessage", // the stand-in's dummy token, never the real one
        body: {
          chat_id: "0",
          text: "[dev] WARNING: daily meter at 70%\nRuntime: normal · Fallback: available · 2026-10-29T16:40:03Z · id x\nRunbook: docs/runbooks/cost-warning.md",
          disable_web_page_preview: true,
        },
      },
    ]);
    const [mail] = r.smtp.messages;
    expect(mail?.from).toBe("alerts@h4reet.local");
    expect(mail?.to).toEqual(["operator@h4reet.local"]);
    expect(mail?.data).toMatch(/^Subject: \[dev\] WARNING: daily meter at 70%\r$/m);
    expect(mail?.data).toMatch(/^Auto-Submitted: auto-generated\r$/m);
    // nodemailer writes the name as X-H4-Alert-ID: header names are case-insensitive (RFC 5322).
    expect(mail?.data).toMatch(/^X-H4-Alert-Id: dev:warn:day:2026-10-29\r$/im);
    expect(mail?.data).toMatch(/^Content-Type: text\/plain/m);
    expect(mail?.data).not.toMatch(/text\/html/);
    expect(await row(r)).toMatchObject({
      telegram_status: "delivered",
      telegram_attempts: 1,
      telegram_ref: "1",
      telegram_error: null,
      telegram_next_at: null,
      email_status: "delivered",
      email_ref: "250 ABC123",
    });
    expect(events(r, "alert.delivered")).toEqual(
      expect.arrayContaining([
        {
          event: "alert.delivered",
          dedupe_key: "dev:warn:day:2026-10-29",
          kind: "warn",
          channel: "telegram",
          attempt: 1,
          lag_s: 1.5,
          provider_ref: "1",
          form: "plain", // spec 011 (FR-044): each attempt's form; no design is registered for this test's rows
        },
        expect.objectContaining({ channel: "email", provider_ref: "250 ABC123" }),
      ]),
    );
  });
});

describe("the retry schedule (alerts.md §4.2)", () => {
  it("retries a failing channel at 5, 20, 50, 110, and 230 s, gives up after, and leaves the other channel alone", async () => {
    const r = await rig();
    await enqueue(r);
    for (let i = 0; i < 6; i++) r.telegram.next.push({ status: 500, body: { ok: false } });
    const attemptsAt: number[] = [];
    for (const at of [0, 5, 20, 50, 110, 230]) {
      r.clock.now = T0 + at * 1_000;
      const before = r.telegram.requests.length;
      await r.d.tick();
      if (r.telegram.requests.length > before) attemptsAt.push(at);
      // Nothing is sent early: one second before the next due time, the tick sends nothing.
      r.clock.now += 1_000;
    }
    expect(attemptsAt).toEqual([0, 5, 20, 50, 110, 230]);
    const final = await row(r);
    expect(final).toMatchObject({
      telegram_status: "failed",
      telegram_attempts: 6,
      telegram_error: "http_500",
      telegram_next_at: null,
      email_status: "delivered", // one channel's failure never delays or stops the other
      email_attempts: 1,
    });
    expect(events(r, "alert.retry")).toHaveLength(5);
    expect(events(r, "alert.retry")[0]).toEqual({
      event: "alert.retry",
      dedupe_key: "dev:warn:day:2026-10-29",
      channel: "telegram",
      attempt: 1,
      error_class: "http_500",
      next_in_s: 5,
      form: "plain",
    });
    expect(events(r, "alert.failed")).toEqual([
      {
        event: "alert.failed",
        dedupe_key: "dev:warn:day:2026-10-29",
        channel: "telegram",
        attempts: 6,
        error_class: "http_500",
        form: "plain",
      },
    ]);
  });

  it("fails a channel whose 300 s window has passed without another attempt, as after a restart", async () => {
    const r = await rig();
    await enqueue(r, "dev:warn:day:2026-10-28", T0 - 301_000);
    await r.d.tick();
    expect(r.telegram.requests).toEqual([]);
    expect(r.smtp.messages).toEqual([]);
    expect(await row(r)).toMatchObject({
      telegram_status: "failed",
      email_status: "failed",
      telegram_error: "expired",
    });
  });

  it("keeps an outcome the store can't take, and writes it when the store answers again", async () => {
    const r = await rig();
    await enqueue(r);
    let down = false;
    r.s.db.hook = (text) => {
      if (down && text.trim().startsWith("UPDATE gateway.alert_outbox SET telegram_status = $2"))
        throw connectionLost();
    };
    down = true;
    r.telegram.next.push({ status: 200, body: { ok: true, result: { message_id: 77 } } });
    await r.d.tick();
    expect(r.telegram.requests).toHaveLength(1);
    expect((await row(r)).telegram_status).toBe("pending"); // delivered, but the outcome couldn't be written
    down = false;
    r.clock.now += 1_000;
    await r.d.tick();
    expect(r.telegram.requests).toHaveLength(1); // not sent twice
    expect(await row(r)).toMatchObject({ telegram_status: "delivered", telegram_ref: "77" });
  });
});

describe("waking (alerts.md §4.1)", () => {
  it("wakes on LISTEN alert_outbox, without waiting for its interval", async () => {
    const r = await rig({ intervalMs: 600_000 });
    r.d.start();
    await new Promise((resolve) => setTimeout(resolve, 100)); // the first pass, which starts LISTEN
    await enqueue(r);
    const started = performance.now(); // monotonic: a step of the wall clock can't move it
    while (r.telegram.requests.length === 0 && performance.now() - started < 5_000) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(r.telegram.requests).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

describe("listening again (alerts.md §4.1; data-model.md §2.1)", () => {
  it("listens again after its LISTEN connection drops, as when Postgres restarts under the running gateway", async () => {
    const r = await rig({ intervalMs: 600_000 });
    r.d.start();
    await vi.waitFor(() => expect(r.s.db.listeners()).toBe(1)); // the first pass starts LISTEN
    await r.s.db.dropListeners(); // the connection ends
    expect(r.s.db.listeners()).toBe(0);
    await r.d.tick(); // the next pass, which the 2 s poll brings
    expect(r.s.db.listeners()).toBe(1);
    // A NOTIFY wakes it again, long before its 600 s interval.
    await enqueue(r);
    await vi.waitFor(() => expect(r.telegram.requests).toHaveLength(1), { timeout: 5_000, interval: 20 });
    // A later pass doesn't open a second connection, and stopping closes the one it has.
    await r.d.tick();
    expect(r.s.db.listeners()).toBe(1);
    await r.d.stop();
    expect(r.s.db.listeners()).toBe(0);
  });
});

describe("the in-memory store_unreachable alert (alerts.md §2, §4.4)", () => {
  it("goes out on both channels once the store has been unreachable for 60 s, once per outage", async () => {
    const r = await rig();
    r.s.db.hook = () => {
      throw connectionLost();
    };
    expect((await r.s.store.readStackState()).kind).toBe("unreachable"); // the outage starts now
    r.clock.now += 59_000;
    await r.d.tick();
    expect(r.telegram.requests).toEqual([]);
    r.clock.now += 1_000;
    await r.d.tick();
    expect(r.telegram.requests).toHaveLength(1);
    expect(String(r.telegram.requests[0]?.body.text).split("\n")).toEqual([
      "[dev] STORE UNREACHABLE: the kill-switch store hasn't answered for 60 s",
      "Runtime: unknown, treated as degraded since 2026-10-29T16:40:03Z · 2026-10-29T16:41:03Z · id dev:store_unreachable:store:2026-10-29T16:40:03Z",
      "Every request gets 503 store_unreachable (fail closed). Meters and alerts resume when the store answers.",
      "Runbook: docs/runbooks/store-unreachable.md",
    ]);
    expect(r.smtp.messages).toHaveLength(1);
    expect(r.smtp.messages[0]?.data).toMatch(/^X-H4-Alert-Id: dev:store_unreachable:store:2026-10-29T16:40:03Z\r$/im);
    r.clock.now += 30_000;
    await r.d.tick();
    expect(r.telegram.requests).toHaveLength(1); // deduplicated in memory
    expect(events(r, "alert.delivered").map((e) => e.kind)).toEqual(["store_unreachable", "store_unreachable"]);
  });
});

describe("the daily reminder (alerts.md §2, §3)", () => {
  it("queues one reminder a day at 09:00 while degraded, for a trip of the day before", async () => {
    const r = await rig();
    await r.s.admin.inject({
      method: "POST",
      url: "/admin/init",
      headers: { ...r.s.auth(), "content-type": "application/json" },
      payload: JSON.stringify({ reason: "Fresh dev stack for the reminder test.", confirm_zero: true, renew: true }),
    });
    await r.s.db.pg.query("UPDATE gateway.stack_state SET state = 'degraded', since = $1, crossed = $2", [
      new Date(T0).toISOString(),
      [`day:${dayKey(T0)}`],
    ]);
    expect(await r.d.remind()).toBe(false); // the trip's own day, after 09:00
    r.clock.now = Date.parse("2026-10-30T08:59:59Z");
    expect(await r.d.remind()).toBe(false);
    r.clock.now = Date.parse("2026-10-30T09:00:00Z");
    expect(await r.d.remind()).toBe(true);
    expect(await r.d.remind()).toBe(false); // once a day: the dedupe key
    const reminder = (
      await r.s.db.pg.query<Rec>("SELECT dedupe_key, body FROM gateway.alert_outbox WHERE kind = 'reminder'")
    ).rows;
    expect(reminder.map((x) => x.dedupe_key)).toEqual(["dev:reminder:daily:2026-10-30"]);
    expect(String(reminder[0]?.body).split("\n")[0]).toBe(
      "[dev] REMINDER: still degraded since 2026-10-29T16:40:03Z (daily ceiling, 2026-10-29)",
    );
  });
});

describe("fallback_unavailable (alerts.md §2, §3; data-model.md §7.7; tasks.md T152)", () => {
  const init = (r: Rig) =>
    r.s.admin.inject({
      method: "POST",
      url: "/admin/init",
      headers: { ...r.s.auth(), "content-type": "application/json" },
      payload: JSON.stringify({ reason: "Fresh dev stack for the fallback test.", confirm_zero: true, renew: true }),
    });
  const rows = async (r: Rig) =>
    (
      await r.s.db.pg.query<Rec>(
        "SELECT dedupe_key, body, facts FROM gateway.alert_outbox WHERE kind = 'fallback_unavailable' ORDER BY id",
      )
    ).rows;

  it("queues one row an hour per adapter, naming the reason, with the meters and the state as they are", async () => {
    const r = await rig();
    expect((await init(r)).statusCode).toBe(200);
    expect(await r.d.fallbackUnavailable("bedrock", "credentials")).toBe(true);
    r.clock.now += 10 * 60_000; // 16:50, the same hour: the dedupe key holds it to one
    expect(await r.d.fallbackUnavailable("bedrock", "circuit_open")).toBe(false);
    r.clock.now += 30 * 60_000; // 17:20, the next hour
    expect(await r.d.fallbackUnavailable("bedrock", "circuit_open")).toBe(true);
    const queued = await rows(r);
    expect(queued.map((x) => x.dedupe_key)).toEqual([
      "dev:fallback_unavailable:bedrock:2026-10-29T16Z",
      "dev:fallback_unavailable:bedrock:2026-10-29T17Z",
    ]);
    expect(String(queued[0]?.body).split("\n")).toEqual([
      "[dev] FALLBACK UNAVAILABLE: bedrock is unhealthy (credentials)",
      "Daily: 0.00 / 5.00 USD (warning 3.50) · Month: 0.00 / 20.00 (warning 14.00) · Fallback today: 0.00 / 2.00 (grant 2) (synthetic spend)",
      "Runtime: normal · Fallback: available · 2026-10-29T16:40:03Z · id dev:fallback_unavailable:bedrock:2026-10-29T16Z",
      "If the local model goes down, hello answers degraded with fallback_unavailable.",
      "Runbook: docs/runbooks/bedrock-unavailable.md",
    ]);
    expect(queued[1]?.facts).toMatchObject({ adapter: "bedrock", reason: "circuit_open" });
    expect(
      r.s.logged.filter((l) => l.record.event === "alert.queued" && l.record.kind === "fallback_unavailable"),
    ).toHaveLength(2);
  });

  it("queues nothing while the store is empty or down: the store's own state answers for the stack then", async () => {
    const r = await rig();
    expect(await r.d.fallbackUnavailable("bedrock", "credentials")).toBe(false); // uninitialized
    expect((await init(r)).statusCode).toBe(200);
    r.s.db.hook = () => {
      throw connectionLost();
    };
    expect(await r.d.fallbackUnavailable("bedrock", "credentials")).toBe(false);
    r.s.db.hook = undefined;
    expect(await rows(r)).toEqual([]);
  });

  it("is what the gateway calls when its paid fallback turns unhealthy", async () => {
    const r = await rig();
    expect((await init(r)).statusCode).toBe(200);
    expect(r.s.services.gateway.onFallbackUnavailable).toBeTypeOf("function");
    r.s.services.gateway.onFallbackUnavailable?.("bedrock", "credentials");
    await vi.waitFor(async () => expect(await rows(r)).toHaveLength(1));
  });
});

describe("the channels' error classes (alerts.md §4.1): a class, never a URL or a body", () => {
  it("classes Telegram's failures: an HTTP status, a refused answer, a timeout, and no listener", async () => {
    const stub = await telegramStub();
    try {
      const channel = {
        base: stub.url,
        token: "123456789:made-for-this-test-and-never-logged-x",
        chatId: "1",
        timeoutMs: 300,
      };
      stub.next.push({ status: 429, body: { ok: false, error_code: 429 } });
      expect(await sendTelegram(channel, "hi")).toEqual({ ok: false, errorClass: "http_429" });
      stub.next.push({ status: 200, body: { ok: false, error_code: 400, description: "Bad Request: chat not found" } });
      expect(await sendTelegram(channel, "hi")).toEqual({ ok: false, errorClass: "telegram_400" });
      stub.next.push({ hang: true });
      expect(await sendTelegram(channel, "hi")).toEqual({ ok: false, errorClass: "timeout" });
    } finally {
      await stub.close();
    }
    const closed = { base: stub.url, token: "x", chatId: "1", timeoutMs: 300 };
    expect(await sendTelegram(closed, "hi")).toEqual({ ok: false, errorClass: "connect" });
  });

  it("classes email's failures: a reply code, a refused connection, and a server that never greets", async () => {
    const smtp = await stubSmtp({ advertiseAuth: true });
    const channel: EmailChannel = {
      host: "127.0.0.1",
      port: smtp.port,
      secure: false,
      requireTLS: false,
      ignoreTLS: true,
      auth: { user: "alerts", pass: "password-made-for-this-test" },
      from: "alerts@example.org",
      to: "operator@example.org",
      timeoutMs: 400,
    };
    const mail = { subject: "s", text: "t", alertId: "dev:warn:day:2026-10-29" };
    try {
      smtp.refuse("AUTH", 535);
      expect(await sendEmail(channel, mail)).toEqual({ ok: false, errorClass: "smtp_535" });
      smtp.refuse("RCPT", 550);
      expect(await sendEmail(channel, mail)).toEqual({ ok: false, errorClass: "smtp_550" });
      smtp.silent = true;
      expect(await sendEmail(channel, mail)).toEqual({ ok: false, errorClass: "timeout" });
    } finally {
      await smtp.close();
    }
    expect(await sendEmail(channel, mail)).toEqual({ ok: false, errorClass: "connect" });
    expect(smtpErrorClass(Object.assign(new Error("x"), { code: "ETLS" }))).toBe("tls");
  });

  it("keeps the reference only from the server's own reply, never an assumed 250 (tasks.md T156)", async () => {
    const channel: EmailChannel = {
      host: "smtp.example.org",
      port: 587,
      secure: false,
      requireTLS: true,
      ignoreTLS: false,
      from: "a@example.org",
      to: "b@example.org",
      timeoutMs: 1_000,
    };
    const mail = { subject: "s", text: "t", alertId: "prod:warn:day:2026-10-29" };
    const replying = (response: unknown) => () => ({
      sendMail: async () => ({ response }),
      close: () => {},
    });
    expect(await sendEmail(channel, mail, replying("250 2.0.0 Ok: queued as ABC123"))).toEqual({
      ok: true,
      ref: "250 ABC123",
    });
    expect(await sendEmail(channel, mail, replying("250 OK"))).toEqual({ ok: true, ref: "250" });
    // nodemailer resolves only once the server accepted the message, so it was delivered; but with no reply to read,
    // there is no reference to keep, and none is made up.
    for (const unreadable of [undefined, "", "OK, queued", 250, { code: 250 }]) {
      expect(await sendEmail(channel, mail, replying(unreadable)), JSON.stringify(unreadable)).toEqual({
        ok: true,
        ref: null,
      });
    }
  });

  it("asks nodemailer for TLS with the certificate checked: implicit on 465, STARTTLS required on 587", () => {
    const base: EmailChannel = {
      host: "smtp.example.org",
      port: 465,
      secure: true,
      requireTLS: false,
      ignoreTLS: false,
      auth: { user: "alerts", pass: "password-made-for-this-test" },
      from: "a@example.org",
      to: "b@example.org",
      timeoutMs: 10_000,
    };
    expect(transportOptions(base)).toMatchObject({
      host: "smtp.example.org",
      port: 465,
      secure: true,
      requireTLS: false,
      ignoreTLS: false,
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
    expect(transportOptions({ ...base, port: 587, secure: false, requireTLS: true })).toMatchObject({
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { rejectUnauthorized: true },
    });
  });
});
