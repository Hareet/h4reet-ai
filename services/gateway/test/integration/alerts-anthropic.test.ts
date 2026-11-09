// Spec 010's alerts in spec 011's designs (FR-048; SC-011; plan §12.4; tasks.md T042), on prod's configuration from
// spec 010's test helpers, PGlite, the test clock, and the stub channels. With the route naming the Anthropic API, the
// adapter month's warning reads Warning and its exhaustion Critical, each showing the month against its cap in every
// form, and fallback_unavailable names "the Anthropic API" and its runbook; with Bedrock's route, credentials_expiring
// and fallback_unavailable likewise. Each is delivered in its designed form on both channels.
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import type { Channels } from "../../src/alerts/dispatcher.js";
import type { AdmitRequest, CallEnd } from "../../src/meter/types.js";
import { ANTHROPIC_MODEL, anthropicConfigDir, anthropicFactories } from "../helpers/anthropic-config.js";
import { stubSmtp, type StubSmtp } from "../helpers/stub-smtp.js";
import { telegramStub, type TelegramStub } from "../helpers/stub-telegram.js";
import { testStack, type TestStack } from "../helpers/stack.js";

type Rec = Record<string, unknown>;

const T0 = Date.parse("2026-11-20T08:00:00.000Z");
// A run-time value in the key's shape, so no key-shaped literal sits in this file.
const KEY = `sk-ant-api03-${randomBytes(24).toString("base64url")}`;

interface Rig {
  s: TestStack;
  telegram: TelegramStub;
  smtp: StubSmtp;
  clock: { now: number };
  dir: string;
}
const rigs: Rig[] = [];
afterEach(async () => {
  for (const r of rigs.splice(0)) {
    await r.s.close();
    await r.telegram.close();
    await r.smtp.close();
    await rm(r.dir, { recursive: true, force: true });
  }
});

async function rig(fallback: "anthropic" | "bedrock"): Promise<Rig> {
  const clock = { now: T0 };
  const telegram = await telegramStub();
  const smtp = await stubSmtp();
  const channels: Channels = {
    mode: "real",
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
  // A $1.00 cap: the warning at $0.70, the cap at $1.00, ten calls of $0.10 at the helper's made-up price.
  const dir = await anthropicConfigDir({ fallback, cap: "1.00" });
  const s = await testStack({
    stack: "prod",
    configDir: dir,
    factories: (await anthropicFactories("http://127.0.0.1:9")).factories,
    env: { GATEWAY_ANTHROPIC_API_KEY: KEY },
    realNow: () => clock.now,
    channels,
  });
  const r = { s, telegram, smtp, clock, dir };
  rigs.push(r);
  const init = await s.admin.inject({
    method: "POST",
    url: "/admin/init",
    headers: { ...s.auth(), "content-type": "application/json" },
    payload: JSON.stringify({ reason: "Fresh prod stack for spec 011's alerts.", confirm_zero: true, renew: true }),
  });
  expect(init.statusCode).toBe(200);
  await s.services.dispatcher.tick(); // the init's own alert first
  telegram.requests.length = 0;
  smtp.messages.length = 0;
  return r;
}

/** n fallback calls to the Anthropic API of $0.10 each, admitted and committed through prod's own meter. */
async function spend(r: Rig, n: number): Promise<void> {
  const trace = (): string => randomBytes(16).toString("hex");
  for (let i = 0; i < n; i++) {
    const request: AdmitRequest = {
      attribution: "fallback",
      adapter: {
        id: "anthropic",
        provider: "anthropic",
        model: ANTHROPIC_MODEL,
        fixedUsage: { inputTokens: 0, outputTokens: 20_000 },
      },
      adapterHealthy: true,
      maxOutputTokens: 128,
      requestId: trace(),
      traceId: trace(),
      purpose: "hello",
      routeReason: "local_unhealthy",
    };
    const admitted = await r.s.services.meter.admit(request);
    if (!admitted.ok) throw new Error(`refused: ${JSON.stringify(admitted)}`);
    const end: CallEnd = {
      attempts: [
        {
          outcome: "ok",
          result: {
            text: "an answer",
            usage: { inputTokens: 0, outputTokens: 20_000 },
            finishReason: "stop",
            responseModel: ANTHROPIC_MODEL,
            latencyMs: 3,
          },
          startedAt: r.clock.now,
          endedAt: r.clock.now + 3,
        },
      ],
    };
    expect(await r.s.services.meter.settle(admitted.admitted, end)).toEqual({ committed: true, costMicro: 100_000n });
    r.clock.now += 1_000;
  }
}

/** The Telegram request and the email that carried the alert with this headline. */
function delivered(r: Rig, headline: string): { telegram: Rec; email: string } {
  const telegram = r.telegram.requests.find((q) => String(q.body.text).includes(headline));
  const email = r.smtp.messages.find((m) => m.data.includes(headline.slice(0, 20)) || m.data.includes("text/html"));
  if (telegram === undefined || email === undefined) throw new Error(`not delivered: ${headline}`);
  return { telegram: telegram.body, email: email.data };
}

describe("prod routing the Anthropic API (FR-048; SC-011)", () => {
  it("shows the adapter month against its cap, Warning at its warning and Critical at its cap, in every form", async () => {
    const r = await rig("anthropic");
    await spend(r, 10);
    const rows = (
      await r.s.db.pg.query<Rec>(
        "SELECT dedupe_key, body FROM gateway.alert_outbox WHERE dedupe_key LIKE '%adapter_month%' ORDER BY id",
      )
    ).rows;
    const month = new Date(T0).toISOString().slice(0, 7);
    expect(rows.map((x) => x.dedupe_key)).toEqual([
      `prod:warn:adapter_month:anthropic:${month}`,
      `prod:fallback_exhausted:adapter_month:anthropic:${month}`,
    ]);
    await r.s.services.dispatcher.tick();
    const warn = r.telegram.requests.find((q) => String(q.body.text).includes("WARNING: the Anthropic API's month"));
    const capped = r.telegram.requests.find((q) => String(q.body.text).includes("PAID FALLBACK CAPPED"));
    expect(String(warn?.body.text).split("\n").slice(0, 2)).toEqual([
      "🟠 Warning · [h4reet.ai prod]",
      "📈 WARNING: the Anthropic API's month at 70% of its cap",
    ]);
    expect(String(warn?.body.text)).toMatch(new RegExp(`^anthropic +0\\.70 / +1\\.00 USD {3}${month}$`, "m"));
    expect(warn?.body.entities).not.toEqual([]);
    expect(String(capped?.body.text).split("\n").slice(0, 2)).toEqual([
      "🔴 Critical · [h4reet.ai prod]",
      "💸 PAID FALLBACK CAPPED: the Anthropic API's month reached its cap",
    ]);
    expect(String(capped?.body.text)).toMatch(new RegExp(`^anthropic +1\\.00 / +1\\.00 USD {3}${month}$`, "m"));
    expect(String(capped?.body.text)).toContain("docs/runbooks/fallback-renewal.md");
    // Both emails designed: multipart, the HTML part with the month's bar, and the plain text as the text part.
    const html = r.smtp.messages.filter((m) => m.data.includes("multipart/alternative"));
    expect(html).toHaveLength(2);
    // The plain text, as stored, carries the same month and cap: no form adds a fact.
    expect(String(rows[1]?.body)).toContain(`1.00 of 1.00 USD in ${month}.`);
    const outcomes = (
      await r.s.db.pg.query<Rec>(
        "SELECT telegram_form, email_form FROM gateway.alert_outbox WHERE dedupe_key LIKE '%adapter_month%'",
      )
    ).rows;
    expect(outcomes).toEqual([
      { telegram_form: "designed", email_form: "designed" },
      { telegram_form: "designed", email_form: "designed" },
    ]);
  });

  it("names the Anthropic API and its runbook in fallback_unavailable, in every form", async () => {
    const r = await rig("anthropic");
    expect(await r.s.services.dispatcher.fallbackUnavailable("anthropic", "credentials", "the Anthropic API")).toBe(
      true,
    );
    await r.s.services.dispatcher.tick();
    const { telegram } = delivered(r, "FALLBACK UNAVAILABLE");
    expect(String(telegram.text).split("\n").slice(0, 2)).toEqual([
      "🟠 Warning · [h4reet.ai prod]",
      "🔌 FALLBACK UNAVAILABLE: the Anthropic API is unhealthy (credentials)",
    ]);
    expect(String(telegram.text)).toContain("Runbook: docs/runbooks/anthropic-unavailable.md");
    const email = r.smtp.messages[0]?.data ?? "";
    expect(email).toMatch(/multipart\/alternative/);
  });
});

describe("prod routing Bedrock (FR-048)", () => {
  it("renders credentials_expiring and fallback_unavailable as before in plain text, and designed on both channels", async () => {
    const r = await rig("bedrock");
    const ends = T0 + 3_600_000;
    expect(await r.s.services.dispatcher.credentialsExpiring("bedrock", "Bedrock", ends)).toBe("queued");
    expect(await r.s.services.dispatcher.fallbackUnavailable("bedrock", "circuit_open", "Bedrock")).toBe(true);
    const plain = (
      await r.s.db.pg.query<Rec>(
        "SELECT kind, body FROM gateway.alert_outbox WHERE kind <> 'operator_action' ORDER BY id",
      )
    ).rows;
    expect(String(plain[0]?.body).split("\n")[0]).toBe(
      "[h4reet.ai prod] CREDENTIALS EXPIRING: the Bedrock SSO session ends at 2026-11-20T09:00:00Z",
    );
    expect(String(plain[1]?.body).split("\n")[0]).toBe(
      "[h4reet.ai prod] FALLBACK UNAVAILABLE: Bedrock is unhealthy (circuit open)",
    );
    await r.s.services.dispatcher.tick();
    const texts = r.telegram.requests.map((q) => String(q.body.text));
    expect(
      texts
        .find((t) => t.includes("CREDENTIALS EXPIRING"))
        ?.split("\n")
        .slice(0, 2),
    ).toEqual([
      "🟠 Warning · [h4reet.ai prod]",
      "🔑 CREDENTIALS EXPIRING: the Bedrock SSO session ends at 2026-11-20T09:00:00Z",
    ]);
    expect(texts.find((t) => t.includes("CREDENTIALS EXPIRING"))).toContain(
      "Runbook: docs/runbooks/bedrock-credentials-expiring.md",
    );
    expect(texts.find((t) => t.includes("FALLBACK UNAVAILABLE"))).toContain(
      "Runbook: docs/runbooks/bedrock-unavailable.md",
    );
    expect(r.smtp.messages.filter((m) => m.data.includes("multipart/alternative"))).toHaveLength(2);
  });
});
