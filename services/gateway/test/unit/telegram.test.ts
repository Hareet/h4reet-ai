// The Telegram channel's transport (alerts/telegram.ts; contracts/alerts.md §4.1; tasks.md T188): node:http with its
// host resolved through c-ares, so a send never waits on libuv's threadpool, one deadline over the whole send, and no
// redirect followed. A local listener stands in for the Bot API; c-ares's queries are replaced for one made-up host,
// which getaddrinfo could never resolve, so a delivery to it proves the send asked c-ares.
import dns from "node:dns";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { sendTelegram } from "../../src/alerts/telegram.js";

const HOST = "telegram-standin.invalid";
const TOKEN = "123456789:made-for-this-test-and-never-logged-y";

type Resolve = (this: dns.Resolver, host: string, ...rest: unknown[]) => void;

/** c-ares's answers for HOST alone: A answers 127.0.0.1 (or never answers), AAAA has no record. */
function resolveHost(a: "127.0.0.1" | "never"): string[] {
  const proto = dns.Resolver.prototype as unknown as { resolve4: Resolve; resolve6: Resolve };
  const asked: string[] = [];
  const fake = (type: "A" | "AAAA", real: Resolve): Resolve =>
    function (this: dns.Resolver, host: string, ...rest: unknown[]): void {
      if (host !== HOST) return real.call(this, host, ...rest);
      asked.push(`${type} ${host}`);
      if (type === "A" && a === "never") return;
      const done = rest[rest.length - 1] as (err: NodeJS.ErrnoException | null, addresses: string[]) => void;
      setImmediate(() => {
        if (type === "A") done(null, [a]);
        else done(Object.assign(new Error(`queryAaaa ENODATA ${host}`), { code: "ENODATA" }), []);
      });
    };
  const [real4, real6] = [proto.resolve4, proto.resolve6];
  vi.spyOn(proto, "resolve4").mockImplementation(fake("A", real4));
  vi.spyOn(proto, "resolve6").mockImplementation(fake("AAAA", real6));
  return asked;
}

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A listener on 127.0.0.1 that answers every request with `reply`; it records each request's method and path. */
async function listener(
  reply: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ port: number; seen: string[] }> {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    req.resume();
    req.on("end", () => reply(req, res));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, seen };
}

const json =
  (status: number, body: unknown, headers: Record<string, string> = {}) =>
  (_req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };

describe("the Telegram channel's transport (alerts.md §4.1, T188)", () => {
  it("resolves its host through c-ares, and delivers", async () => {
    const asked = resolveHost("127.0.0.1");
    const api = await listener(json(200, { ok: true, result: { message_id: 41 } }));
    const channel = { base: `http://${HOST}:${api.port}`, token: TOKEN, chatId: "0", timeoutMs: 2_000 };
    expect(await sendTelegram(channel, "hi")).toEqual({ ok: true, ref: "41" });
    expect(asked[0]).toBe(`A ${HOST}`);
    expect(api.seen).toEqual([`POST /bot${TOKEN}/sendMessage`]);
  });

  it("ends a send whose lookup never answers at its deadline, as timeout", async () => {
    resolveHost("never");
    const channel = { base: `http://${HOST}:9`, token: TOKEN, chatId: "0", timeoutMs: 300 };
    const started = Date.now();
    expect(await sendTelegram(channel, "hi")).toEqual({ ok: false, errorClass: "timeout" });
    const ms = Date.now() - started;
    expect(ms).toBeGreaterThanOrEqual(250);
    expect(ms).toBeLessThan(2_000);
  });

  it("follows no redirect: a 3xx is http_<status>, and the listener sees one request", async () => {
    resolveHost("127.0.0.1");
    const api = await listener(json(302, {}, { location: "http://127.0.0.1:9/elsewhere" }));
    const channel = { base: `http://${HOST}:${api.port}`, token: TOKEN, chatId: "0", timeoutMs: 2_000 };
    expect(await sendTelegram(channel, "hi")).toEqual({ ok: false, errorClass: "http_302" });
    expect(api.seen).toHaveLength(1);
  });

  it("reads at most 64 KiB of an answer: a longer one doesn't parse, and is telegram_malformed", async () => {
    resolveHost("127.0.0.1");
    const long = JSON.stringify({ ok: true, result: { message_id: 7 }, pad: "x".repeat(70_000) });
    const api = await listener((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(long);
    });
    const channel = { base: `http://${HOST}:${api.port}`, token: TOKEN, chatId: "0", timeoutMs: 2_000 };
    expect(await sendTelegram(channel, "hi")).toEqual({ ok: false, errorClass: "telegram_malformed" });
  });
});
