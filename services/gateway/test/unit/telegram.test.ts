// The Telegram channel's transport (alerts/telegram.ts; contracts/alerts.md §4.1; tasks.md T188): node:http(s) with
// its host resolved through c-ares, so a send never waits on libuv's threadpool, one deadline over the whole send, and
// no redirect followed. A local listener stands in for the Bot API. c-ares's queries are replaced for one made-up
// host, which getaddrinfo could never resolve, so a delivery to it proves the send asked c-ares. The host has an AAAA
// record, as api.telegram.org does, and the container is IPv4-only, as compose's networks are.
import { execFileSync } from "node:child_process";
import dns from "node:dns";
import { closeSync, constants, open, openSync, rmSync, mkdtempSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { sendTelegram } from "../../src/alerts/telegram.js";

const HOST = "telegram-standin.invalid";
const TOKEN = "123456789:made-for-this-test-and-never-logged-y";

type Resolve = (this: dns.Resolver, host: string, ...rest: unknown[]) => void;

/** A compose network's interface: one IPv4 address, and no IPv6. */
const IPV4_ONLY: os.NetworkInterfaceInfo = {
  address: "172.18.0.4",
  netmask: "255.255.0.0",
  family: "IPv4",
  mac: "02:42:ac:12:00:04",
  internal: false,
  cidr: "172.18.0.4/16",
};

/**
 * c-ares's answers for HOST alone: A answers 127.0.0.1 (or never answers), and AAAA answers a documentation address
 * nothing listens on. The interfaces are IPv4-only. Returns the HOST queries asked.
 */
function resolveHost(a: "127.0.0.1" | "never"): string[] {
  const proto = dns.Resolver.prototype as unknown as { resolve4: Resolve; resolve6: Resolve };
  const asked: string[] = [];
  const fake = (type: "A" | "AAAA", real: Resolve): Resolve =>
    function (this: dns.Resolver, host: string, ...rest: unknown[]): void {
      if (host !== HOST) return real.call(this, host, ...rest);
      asked.push(`${type} ${host}`);
      if (type === "A" && a === "never") return;
      const done = rest[rest.length - 1] as (err: NodeJS.ErrnoException | null, addresses: string[]) => void;
      setImmediate(() => done(null, [type === "A" ? a : "2001:db8::7"]));
    };
  const [real4, real6] = [proto.resolve4, proto.resolve6];
  vi.spyOn(proto, "resolve4").mockImplementation(fake("A", real4));
  vi.spyOn(proto, "resolve6").mockImplementation(fake("AAAA", real6));
  vi.spyOn(os, "networkInterfaces").mockReturnValue({ eth0: [IPV4_ONLY] });
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

const delivered = json(200, { ok: true, result: { message_id: 41 } });

/** Whether dns.lookup, which runs on libuv's threadpool, answers within ms. */
function lookupAnswersWithin(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    dns.lookup("localhost", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

describe("the Telegram channel's transport (alerts.md §4.1, T188)", () => {
  it("resolves its host through c-ares, with ADDRCONFIG: no AAAA query from an IPv4-only container", async () => {
    const asked = resolveHost("127.0.0.1");
    const api = await listener(delivered);
    const channel = { base: `http://${HOST}:${api.port}`, token: TOKEN, chatId: "0", timeoutMs: 2_000 };
    expect(await sendTelegram(channel, "hi")).toEqual({ ok: true, ref: "41" });
    expect(asked).toEqual([`A ${HOST}`]);
    expect(api.seen).toEqual([`POST /bot${TOKEN}/sendMessage`]);
  });

  it("delivers while libuv's four threads are held, as hung getaddrinfo lookups held them", async () => {
    // Four opens of a FIFO with no writer each block a threadpool thread until a writer comes.
    resolveHost("127.0.0.1");
    const api = await listener(delivered);
    const dir = mkdtempSync(join(os.tmpdir(), "h4-threadpool-"));
    const fifo = join(dir, "held");
    execFileSync("mkfifo", [fifo]);
    const held: Promise<number>[] = [];
    try {
      for (let i = 0; i < 4; i++) {
        held.push(new Promise((resolve, reject) => open(fifo, "r", (err, fd) => (err ? reject(err) : resolve(fd)))));
      }
      expect(await lookupAnswersWithin(300)).toBe(false); // the threadpool is full: getaddrinfo waits
      const channel = { base: `http://${HOST}:${api.port}`, token: TOKEN, chatId: "0", timeoutMs: 2_000 };
      expect(await sendTelegram(channel, "hi")).toEqual({ ok: true, ref: "41" });
    } finally {
      const writer = openSync(fifo, constants.O_WRONLY | constants.O_NONBLOCK); // releases every blocked open
      for (const fd of await Promise.all(held)) closeSync(fd);
      closeSync(writer);
      rmSync(dir, { recursive: true, force: true });
    }
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

  it("keeps at most 64 KiB of an answer: a longer one doesn't parse, and is telegram_malformed", async () => {
    resolveHost("127.0.0.1");
    const long = JSON.stringify({ ok: true, result: { message_id: 7 }, pad: "x".repeat(70_000) });
    const api = await listener((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(long);
    });
    const channel = { base: `http://${HOST}:${api.port}`, token: TOKEN, chatId: "0", timeoutMs: 2_000 };
    expect(await sendTelegram(channel, "hi")).toEqual({ ok: false, errorClass: "telegram_malformed" });
  });

  it("speaks TLS for an https base, as prod's api.telegram.org: a server that doesn't is tls", async () => {
    // The real path, the one that carries the bot token. A plain-HTTP listener answers the TLS hello with HTTP.
    resolveHost("127.0.0.1");
    const api = await listener(delivered);
    const channel = { base: `https://${HOST}:${api.port}`, token: TOKEN, chatId: "0", timeoutMs: 2_000 };
    expect(await sendTelegram(channel, "hi")).toEqual({ ok: false, errorClass: "tls" });
    expect(api.seen).toEqual([]); // no request was ever made in the clear
  });
});
