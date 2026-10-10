// The gateway's other lookups through c-ares (tasks.md T189): the store's connections and the email channel. c-ares's
// queries are replaced for a few made-up hosts, which getaddrinfo could never resolve, so a connection that reaches a
// listener behind one proves its client asked c-ares. dns.lookup, the way to getaddrinfo, is watched for the same
// hosts: a call there is a lookup that could hold one of the two threads libuv gives lookups.
import dns from "node:dns";
import { createServer, type Server } from "node:net";
import os from "node:os";
import { createServer as createTlsServer, TLSSocket, type TlsOptions } from "node:tls";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail, type EmailChannel } from "../../src/alerts/smtp.js";
import { pgDatabase } from "../../src/meter/store.js";
import { fakePostgres } from "../helpers/fake-postgres.js";
import { stubSmtp } from "../helpers/stub-smtp.js";

/** What c-ares answers for each made-up host: an A record, or one error for every query. */
const ANSWERS: Readonly<Record<string, { address: string } | { code: string }>> = {
  "store.invalid": { address: "127.0.0.1" },
  "gone.invalid": { code: "ENOTFOUND" },
  "smtp.invalid": { address: "127.0.0.1" },
  "servfail.invalid": { code: "ESERVFAIL" },
};

type Resolve = (this: dns.Resolver, host: string, ...rest: unknown[]) => void;

/** Replaces c-ares's A and AAAA queries for the made-up hosts. Returns the queries asked for them. */
function fakeAres(): string[] {
  const proto = dns.Resolver.prototype as unknown as { resolve4: Resolve; resolve6: Resolve };
  const asked: string[] = [];
  const fake = (type: "A" | "AAAA", real: Resolve): Resolve =>
    function (this: dns.Resolver, host: string, ...rest: unknown[]): void {
      const answer = ANSWERS[host];
      if (answer === undefined) return real.call(this, host, ...rest);
      asked.push(`${type} ${host}`);
      const done = rest[rest.length - 1] as (err: NodeJS.ErrnoException | null, addresses: string[]) => void;
      const fail = (code: string) => Object.assign(new Error(`query${type} ${code} ${host}`), { code });
      setImmediate(() => {
        if ("code" in answer) done(fail(answer.code), []);
        else if (type === "A") done(null, [answer.address]);
        else done(fail("ENODATA"), []);
      });
    };
  const [real4, real6] = [proto.resolve4, proto.resolve6];
  vi.spyOn(proto, "resolve4").mockImplementation(fake("A", real4));
  vi.spyOn(proto, "resolve6").mockImplementation(fake("AAAA", real6));
  return asked;
}

/** Watches dns.lookup for the made-up hosts, answering each ENOTFOUND at once. Returns the hosts it was asked for. */
function watchGetaddrinfo(): string[] {
  const asked: string[] = [];
  const real = dns.lookup as unknown as (host: string, ...rest: unknown[]) => void;
  vi.spyOn(dns, "lookup").mockImplementation(((host: string, ...rest: unknown[]) => {
    if (ANSWERS[host] === undefined) return real(host, ...rest);
    asked.push(host);
    const done = rest[rest.length - 1] as (err: NodeJS.ErrnoException) => void;
    setImmediate(() => done(Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" })));
  }) as unknown as typeof dns.lookup);
  return asked;
}

// A container's interfaces: IPv4 only, so ADDRCONFIG keeps the A query alone and the lists below are exact.
const IPV4_ONLY: os.NetworkInterfaceInfo = {
  address: "172.18.0.4",
  netmask: "255.255.0.0",
  family: "IPv4",
  mac: "02:42:ac:12:00:04",
  internal: false,
  cidr: "172.18.0.4/16",
};

const servers: Server[] = [];
beforeEach(() => {
  vi.spyOn(os, "networkInterfaces").mockReturnValue({ eth0: [IPV4_ONLY] });
});
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A TLS listener on 127.0.0.1 with no certificate: it records the name each client asks for, then ends the handshake. */
function sniOptions(names: string[]): TlsOptions {
  return {
    SNICallback: (name, callback) => {
      names.push(name);
      callback(new Error("no certificate here"));
    },
  };
}

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return typeof address === "object" && address !== null ? address.port : 0;
}

/** Implicit TLS, as on 465. */
async function implicitTls(): Promise<{ port: number; names: string[] }> {
  const names: string[] = [];
  const server = createTlsServer(sniOptions(names));
  server.on("tlsClientError", () => {});
  return { port: await listen(server), names };
}

/** Plain SMTP that offers STARTTLS, as on 587, and upgrades when asked. */
async function startTls(): Promise<{ port: number; names: string[] }> {
  const names: string[] = [];
  const server = createServer((socket) => {
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    socket.write("220 stub ESMTP\r\n");
    let buffer = "";
    const onData = (chunk: string): void => {
      buffer += chunk;
      for (let eol = buffer.indexOf("\r\n"); eol >= 0; eol = buffer.indexOf("\r\n")) {
        const verb = buffer.slice(0, eol).split(" ")[0]?.toUpperCase();
        buffer = buffer.slice(eol + 2);
        if (verb === "EHLO") socket.write("250-stub\r\n250 STARTTLS\r\n");
        else if (verb === "STARTTLS") {
          socket.off("data", onData);
          socket.write("220 2.0.0 Ready to start TLS\r\n", () => {
            new TLSSocket(socket, { isServer: true, ...sniOptions(names) }).on("error", () => {});
          });
          return;
        } else socket.write("502 Command not implemented\r\n");
      }
    };
    socket.on("data", onData);
  });
  return { port: await listen(server), names };
}

describe("the store's connections (meter/store.ts, T189)", () => {
  it("resolve the store's host through c-ares", async () => {
    const asked = fakeAres();
    const fallback = watchGetaddrinfo();
    const store = await fakePostgres("answer");
    const db = pgDatabase({
      host: "store.invalid",
      port: store.port,
      database: "gateway",
      user: "gateway",
      password: "x",
    });
    try {
      await db.query("SELECT 1");
      expect(store.connections()).toBe(1);
      expect(asked).toEqual(["A store.invalid"]);
      expect(fallback).toEqual([]);
    } finally {
      await db.close();
      await store.close();
    }
  });

  it("fail at once on a host c-ares can't resolve, and never ask getaddrinfo", async () => {
    const asked = fakeAres();
    const fallback = watchGetaddrinfo();
    const db = pgDatabase({ host: "gone.invalid", port: 5432, database: "gateway", user: "gateway", password: "x" });
    try {
      await expect(db.query("SELECT 1")).rejects.toMatchObject({ code: "ENOTFOUND" });
      expect(asked).toEqual(["A gone.invalid"]);
      expect(fallback).toEqual([]);
    } finally {
      await db.close();
    }
  });
});

describe("the email channel (alerts/smtp.ts, T189)", () => {
  const channel = (o: Partial<EmailChannel>): EmailChannel => ({
    host: "smtp.invalid",
    port: 25,
    secure: false,
    requireTLS: false,
    ignoreTLS: true,
    from: "alerts@example.org",
    to: "operator@example.org",
    timeoutMs: 2_000,
    ...o,
  });
  const mail = { subject: "s", text: "t", alertId: "dev:warn:day:2026-10-29" };

  it("delivers to a host only c-ares can name", async () => {
    const asked = fakeAres();
    const fallback = watchGetaddrinfo();
    const smtp = await stubSmtp();
    try {
      expect(await sendEmail(channel({ port: smtp.port }), mail)).toEqual({ ok: true, ref: "250 ABC123" });
      expect(smtp.messages).toHaveLength(1);
      expect(asked).toEqual(["A smtp.invalid"]);
      expect(fallback).toEqual([]);
    } finally {
      await smtp.close();
    }
  });

  it("is connect when c-ares finds no address, and never falls back to getaddrinfo", async () => {
    // nodemailer's own resolver reads a SERVFAIL as no address, and asks dns.lookup next.
    const asked = fakeAres();
    const fallback = watchGetaddrinfo();
    expect(await sendEmail(channel({ host: "servfail.invalid" }), mail)).toEqual({ ok: false, errorClass: "connect" });
    expect(asked).toEqual(["A servfail.invalid"]);
    expect(fallback).toEqual([]);
  });

  it("asks TLS for the host's name while it connects to the address: implicit, as on 465", async () => {
    fakeAres();
    const tls = await implicitTls();
    const sent = await sendEmail(channel({ port: tls.port, secure: true, ignoreTLS: false }), mail);
    expect(sent).toMatchObject({ ok: false });
    expect(tls.names).toEqual(["smtp.invalid"]);
  });

  it("asks TLS for the host's name while it connects to the address: STARTTLS, as on 587", async () => {
    fakeAres();
    const tls = await startTls();
    const sent = await sendEmail(channel({ port: tls.port, requireTLS: true, ignoreTLS: false }), mail);
    expect(sent).toMatchObject({ ok: false });
    expect(tls.names).toEqual(["smtp.invalid"]);
  });
});
