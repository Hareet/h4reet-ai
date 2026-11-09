// The email channel's TLS failures (tasks.md T190; contracts/alerts.md §4.1's error classes). A certificate that fails
// to verify, on 465 and after STARTTLS, is `tls`: nodemailer 10.0.16 hands its caller the TLS socket's error with the
// code overwritten to ESOCKET, so the class can't be read from the error alone. Nothing of the certificate reaches the
// class, the outbox, or the log. Every other class stays as it was: a reset before STARTTLS or after the handshake,
// and a refused STARTTLS. The servers run on the sandbox's own loopback, with certificates made at run time
// (helpers/test-certs.ts), and the channel names its host `localhost`, which the gateway's lookup answers itself.
import { createServer, type Server, type Socket } from "node:net";
import os from "node:os";
import type { Duplex } from "node:stream";
import tls, { TLSSocket } from "node:tls";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dispatcher } from "../../src/alerts/dispatcher.js";
import { enqueueAlert } from "../../src/alerts/outbox.js";
import { sendEmail, type EmailChannel } from "../../src/alerts/smtp.js";
import { stubSmtp } from "../helpers/stub-smtp.js";
import { testStack } from "../helpers/stack.js";
import { selfSigned, testAuthority, type TestAuthority, type TestCert } from "../helpers/test-certs.js";

// What must never leave the handshake: the names in the certificates, and what Node's errors say about them.
const SUBJECT = "h4-canary-subject";
const ISSUER = "h4-canary-issuer";
const OTHER_HOST = "h4-canary-other.invalid";
const NODE_MESSAGES = ["self-signed", "Hostname/IP", "altnames", "certificate"];

// A container's interfaces: IPv4 only, so the lookup gives localhost as 127.0.0.1 alone, where the servers listen.
const IPV4_ONLY: os.NetworkInterfaceInfo = {
  address: "172.18.0.4",
  netmask: "255.255.0.0",
  family: "IPv4",
  mac: "02:42:ac:12:00:04",
  internal: false,
  cidr: "172.18.0.4/16",
};

const servers: Server[] = [];
const sockets = new Set<Socket>();
beforeEach(() => {
  vi.spyOn(os, "networkInterfaces").mockReturnValue({ eth0: [IPV4_ONLY] });
});
afterEach(async () => {
  // A listener closes only once its connections have: end them first.
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Makes the client trust `authority`, as it would a public one: its contexts get it as their CA. */
function trust(authority: TestAuthority): void {
  const real = tls.createSecureContext;
  vi.spyOn(tls, "createSecureContext").mockImplementation((options) => real({ ...options, ca: authority.pem }));
}

/** Reads `stream` a CRLF-ended line at a time, handing each to `onLine`, until it calls `stop`. */
function lines(stream: Duplex, onLine: (line: string, stop: () => void) => void): void {
  let buffer = "";
  let stopped = false;
  const stop = (): void => {
    stopped = true;
    stream.off("data", onData);
  };
  const onData = (chunk: Buffer): void => {
    buffer += chunk.toString("latin1");
    for (let eol = buffer.indexOf("\r\n"); eol >= 0 && !stopped; eol = buffer.indexOf("\r\n")) {
      const line = buffer.slice(0, eol);
      buffer = buffer.slice(eol + 2);
      onLine(line, stop);
    }
  };
  stream.on("data", onData);
}

interface TlsSmtp {
  port: number;
  /** TLS handshakes the server completed. */
  handshakes: number;
  /** Messages it accepted over TLS. */
  messages: number;
}

/**
 * An SMTP server with `cert` that speaks TLS from the first byte, as on 465, or after STARTTLS, as on 587. Over TLS it
 * takes a message and queues it as TLS123. Plain SMTP offers STARTTLS; `starttls: 454` refuses it instead. `reset`
 * resets the connection at the first EHLO before TLS, or at the first command over it, after the client has checked
 * the certificate and gone on.
 */
async function tlsSmtp(
  mode: "implicit" | "starttls",
  cert: TestCert,
  o: { reset?: "before-tls" | "after-handshake"; starttls?: 454 } = {},
): Promise<TlsSmtp> {
  const server: TlsSmtp = { port: 0, handshakes: 0, messages: 0 };
  const secure = (socket: Socket): void => {
    const encrypted = new TLSSocket(socket, { isServer: true, secureContext: cert.context });
    encrypted.on("error", () => {});
    encrypted.once("secure", () => (server.handshakes += 1));
    if (mode === "implicit") encrypted.write("220 stub ESMTP\r\n");
    let inData = false;
    lines(encrypted, (line, stop) => {
      if (inData) {
        if (line !== ".") return;
        inData = false;
        server.messages += 1;
        encrypted.write("250 2.0.0 Ok: queued as TLS123\r\n");
        return;
      }
      if (o.reset === "after-handshake") {
        stop();
        socket.resetAndDestroy();
        return;
      }
      const verb = line.split(" ")[0]?.toUpperCase();
      if (verb === "EHLO") encrypted.write("250-stub\r\n250 8BITMIME\r\n");
      else if (verb === "MAIL" || verb === "RCPT") encrypted.write("250 OK\r\n");
      else if (verb === "DATA") {
        inData = true;
        encrypted.write("354 End data with <CR><LF>.<CR><LF>\r\n");
      } else if (verb === "QUIT") encrypted.end("221 Bye\r\n");
      else encrypted.write("502 5.5.1 Not here\r\n");
    });
  };
  const listener = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    if (mode === "implicit") {
      secure(socket);
      return;
    }
    socket.write("220 stub ESMTP\r\n");
    lines(socket, (line, stop) => {
      const verb = line.split(" ")[0]?.toUpperCase();
      if (verb === "EHLO" && o.reset === "before-tls") {
        stop();
        socket.resetAndDestroy();
      } else if (verb === "EHLO") socket.write("250-stub\r\n250 STARTTLS\r\n");
      else if (verb === "STARTTLS" && o.starttls !== undefined)
        socket.write(`${o.starttls} 4.7.0 TLS not available\r\n`);
      else if (verb === "STARTTLS") {
        // The upgrade takes the socket from here: nothing more is read in plain text.
        stop();
        socket.write("220 2.0.0 Ready to start TLS\r\n", () => secure(socket));
      } else socket.write("502 5.5.1 Not here\r\n");
    });
  });
  servers.push(listener);
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  server.port = typeof address === "object" && address !== null ? address.port : 0;
  return server;
}

const channel = (mode: "implicit" | "starttls", port: number): EmailChannel => ({
  host: "localhost",
  port,
  secure: mode === "implicit",
  requireTLS: mode === "starttls",
  ignoreTLS: false,
  from: "alerts@example.org",
  to: "operator@example.org",
  timeoutMs: 2_000,
});
const mail = { subject: "s", text: "t", alertId: "prod:warn:day:2026-10-29" };

describe("a certificate that fails to verify is tls (alerts/smtp.ts, T190)", () => {
  for (const mode of ["implicit", "starttls"] as const) {
    const as = mode === "implicit" ? "implicit TLS, as on 465" : "after STARTTLS, as on 587";

    it(`is tls when the certificate signs itself: ${as}`, async () => {
      const server = await tlsSmtp(mode, selfSigned({ subject: SUBJECT, dnsNames: ["localhost"] }));
      expect(await sendEmail(channel(mode, server.port), mail)).toEqual({ ok: false, errorClass: "tls" });
      expect(server.messages).toBe(0);
    });

    it(`is tls when a trusted certificate names another host: ${as}`, async () => {
      const authority = testAuthority(ISSUER);
      const server = await tlsSmtp(mode, authority.issue({ subject: SUBJECT, dnsNames: [OTHER_HOST] }));
      trust(authority);
      expect(await sendEmail(channel(mode, server.port), mail)).toEqual({ ok: false, errorClass: "tls" });
      expect(server.messages).toBe(0);
    });

    it(`delivers when the certificate verifies, with the transport's TLS settings: ${as}`, async () => {
      // The control: the same server and client deliver once the certificate is trusted and names the host.
      const authority = testAuthority(ISSUER);
      const server = await tlsSmtp(mode, authority.issue({ subject: SUBJECT, dnsNames: ["localhost"] }));
      trust(authority);
      const connects = vi.spyOn(tls, "connect");
      expect(await sendEmail(channel(mode, server.port), mail)).toEqual({ ok: true, ref: "250 TLS123" });
      expect(server).toMatchObject({ handshakes: 1, messages: 1 });
      expect(connects).toHaveBeenCalledTimes(1);
      expect(connects.mock.calls[0]?.[0]).toMatchObject({
        servername: "localhost",
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      });
    });

    it(`keeps smtp_ESOCKET for a connection reset after the certificate verified: ${as}`, async () => {
      const authority = testAuthority(ISSUER);
      const cert = authority.issue({ subject: SUBJECT, dnsNames: ["localhost"] });
      const server = await tlsSmtp(mode, cert, { reset: "after-handshake" });
      trust(authority);
      expect(await sendEmail(channel(mode, server.port), mail)).toEqual({ ok: false, errorClass: "smtp_ESOCKET" });
      expect(server.handshakes).toBe(1);
    });
  }

  it("is tls when implicit TLS meets a server that speaks plain SMTP, as 465 set against 587", async () => {
    const smtp = await stubSmtp();
    try {
      expect(await sendEmail(channel("implicit", smtp.port), mail)).toEqual({ ok: false, errorClass: "tls" });
      expect(smtp.messages).toEqual([]);
    } finally {
      await smtp.close();
    }
  });

  for (const drop of ["end", "reset"] as const) {
    it(`keeps smtp_ESOCKET when the server drops the connection on 465 before sending a byte (${drop})`, async () => {
      // The review of T190: a load balancer with no backend, or a rate limiter, drops a connection before any TLS.
      // Nothing of a handshake came back, so it isn't tls, which would send the operator to the certificate.
      // 30 ms in, the client has connected and sent its hello: the drop meets its TLS, not its connect.
      const listener = createServer((socket: Socket) => {
        sockets.add(socket); // a half-closed socket would hold the listener open past afterEach
        setTimeout(() => (drop === "reset" ? socket.resetAndDestroy() : socket.end()), 30);
      });
      servers.push(listener);
      await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
      const address = listener.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      expect(await sendEmail(channel("implicit", port), mail)).toEqual({ ok: false, errorClass: "smtp_ESOCKET" });
    });
  }

  it("keeps smtp_ESOCKET for a connection reset before STARTTLS", async () => {
    const server = await tlsSmtp("starttls", selfSigned({ subject: SUBJECT, dnsNames: ["localhost"] }), {
      reset: "before-tls",
    });
    expect(await sendEmail(channel("starttls", server.port), mail)).toEqual({ ok: false, errorClass: "smtp_ESOCKET" });
    expect(server.handshakes).toBe(0);
  });

  it("keeps a refused STARTTLS as its reply code, smtp_454", async () => {
    // nodemailer's code for it is ETLS, but the server's reply code comes first, as for every reply.
    const server = await tlsSmtp("starttls", selfSigned({ subject: SUBJECT, dnsNames: ["localhost"] }), {
      starttls: 454,
    });
    expect(await sendEmail(channel("starttls", server.port), mail)).toEqual({ ok: false, errorClass: "smtp_454" });
    expect(server.handshakes).toBe(0);
  });
});

describe("a TLS failure is recorded as its class alone (alerts.md §4.1, §5)", () => {
  it("leaves nothing of the certificate in the outbox or the log: the names, the fingerprints, Node's message", async () => {
    const T0 = Date.parse("2026-10-29T16:40:03.000Z");
    const key = "dev:warn:day:2026-10-29";
    const authority = testAuthority(ISSUER);
    const cert = authority.issue({ subject: SUBJECT, dnsNames: [OTHER_HOST] });
    // The canaries are the certificate's own details, which Node's error for this one carries.
    expect([cert.x509.subject, cert.x509.issuer, cert.x509.subjectAltName]).toEqual([
      `CN=${SUBJECT}`,
      `CN=${ISSUER}`,
      `DNS:${OTHER_HOST}`,
    ]);
    const server = await tlsSmtp("implicit", cert);
    trust(authority);
    const s = await testStack({ realNow: () => T0 });
    const d = new Dispatcher({
      stack: "dev",
      envClass: "dev",
      store: s.store,
      alerts: s.services.alerts,
      budgets: s.services.budgets,
      channels: {
        mode: "real",
        telegram: { base: "https://api.telegram.org", token: "unused", chatId: "1", timeoutMs: 300 },
        email: channel("implicit", server.port),
      },
      hasFallback: false,
      clock: s.services.clock,
      metrics: s.services.metrics,
      logger: s.services.logger,
      realNow: () => T0,
      send: { telegram: async () => ({ ok: true, ref: "1" }) },
    });
    try {
      await s.store.transaction((q) =>
        enqueueAlert(q, {
          dedupeKey: key,
          kind: "warn",
          stack: "dev",
          createdAt: new Date(T0).toISOString(),
          enqueuedAt: T0,
          subject: "[dev] WARNING: daily meter at 70%",
          body: "[dev] WARNING: daily meter at 70%",
          facts: { kind: "warn" },
        }),
      );
      await d.tick();
      const rows = (
        await s.db.pg.query<Record<string, unknown>>("SELECT email_status, email_error FROM gateway.alert_outbox")
      ).rows;
      expect(rows).toEqual([{ email_status: "pending", email_error: "tls" }]);
      const retries = s.logged.filter((l) => l.record.event === "alert.retry").map((l) => l.record);
      expect(retries).toEqual([
        {
          event: "alert.retry",
          dedupe_key: key,
          channel: "email",
          attempt: 1,
          error_class: "tls",
          next_in_s: 5,
          form: "plain", // spec 011 (FR-044): each attempt's form
        },
      ]);
      const logged = JSON.stringify(s.logged);
      const { fingerprint, fingerprint256, fingerprint512, serialNumber } = cert.x509;
      for (const detail of [SUBJECT, ISSUER, OTHER_HOST, fingerprint, fingerprint256, fingerprint512, serialNumber]) {
        expect(logged, detail).not.toContain(detail);
      }
      for (const message of NODE_MESSAGES) expect(logged, message).not.toContain(message);
      expect(server.messages).toBe(0);
    } finally {
      await d.stop();
      await s.close();
    }
  });
});

describe("the designed message and the refusal of a message (spec 011, FR-015, FR-016, FR-027; plan §5.5; tasks.md T010)", () => {
  /** A header's value as the reader sees it: folded lines joined, RFC 2047 encoded words decoded. */
  function header(data: string, name: string): string | undefined {
    const unfolded = data.split("\r\n\r\n")[0]?.replace(/\r\n[ \t]+/g, " ") ?? "";
    const line = unfolded.split("\r\n").find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`));
    if (line === undefined) return undefined;
    return line
      .slice(name.length + 1)
      .trim()
      .replace(/\?=\s+=\?/g, "?==?")
      .replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi, (_m, enc: string, text: string) =>
        enc.toUpperCase() === "B"
          ? Buffer.from(text, "base64").toString("utf8")
          : Buffer.from(
              text
                .replace(/_/g, " ")
                .replace(/=([0-9A-F]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16))),
              "latin1",
            ).toString("utf8"),
      );
  }

  const channelFor = (port: number): EmailChannel => ({
    host: "127.0.0.1",
    port,
    secure: false,
    requireTLS: false,
    ignoreTLS: true,
    from: "alerts@h4reet.local",
    to: "operator@h4reet.local",
    timeoutMs: 2_000,
  });
  const TEXT = "[dev] KILL SWITCH TRIPPED: daily ceiling reached\nRunbook: docs/runbooks/kill-switch-trip.md";
  const HTML = '<!DOCTYPE html><html lang="en"><body><table><tr><td>designed</td></tr></table></body></html>';

  it("sends the designed form as one multipart/alternative message, the text part first, with today's headers", async () => {
    const smtp = await stubSmtp();
    try {
      const subject = "🔴 🛑 [dev] KILL SWITCH TRIPPED: daily ceiling reached";
      const sent = await sendEmail(channelFor(smtp.port), {
        subject,
        text: TEXT,
        html: HTML,
        alertId: "dev:trip:day:2026-10-29",
      });
      expect(sent).toEqual({ ok: true, ref: "250 ABC123" });
      const data = smtp.messages[0]?.data ?? "";
      expect(header(data, "Subject")).toBe(subject);
      expect(header(data, "Content-Type")).toMatch(/^multipart\/alternative; boundary=/);
      expect(header(data, "Auto-Submitted")).toBe("auto-generated");
      expect(header(data, "X-H4-Alert-Id")).toBe("dev:trip:day:2026-10-29");
      const plainAt = data.search(/^Content-Type: text\/plain; charset=utf-8\r$/m);
      const htmlAt = data.search(/^Content-Type: text\/html; charset=utf-8\r$/m);
      expect(plainAt).toBeGreaterThan(0);
      expect(htmlAt).toBeGreaterThan(plainAt);
      expect(data.match(/^Content-Type: /gm)).toHaveLength(3); // the message and its two parts, nothing else
      expect(data).not.toMatch(/multipart\/(mixed|related)|Content-Disposition|image\//i);
    } finally {
      await smtp.close();
    }
  });

  it("sends the plain form as today's message exactly: line 1 as its subject, text/plain only", async () => {
    const smtp = await stubSmtp();
    try {
      const subject = "[dev] KILL SWITCH TRIPPED: daily ceiling reached";
      expect(
        await sendEmail(channelFor(smtp.port), { subject, text: TEXT, alertId: "dev:trip:day:2026-10-29" }),
      ).toEqual({
        ok: true,
        ref: "250 ABC123",
      });
      const data = smtp.messages[0]?.data ?? "";
      expect(data).toMatch(/^Subject: \[dev\] KILL SWITCH TRIPPED: daily ceiling reached\r$/m);
      expect(header(data, "Content-Type")).toMatch(/^text\/plain/);
      expect(data).not.toMatch(/multipart|text\/html/);
    } finally {
      await smtp.close();
    }
  });

  it("reads a 5xx to the message's data as the message refused, and keeps the class smtp_<code>", async () => {
    const smtp = await stubSmtp();
    const mail = { subject: "s", text: "t", html: HTML, alertId: "dev:trip:day:2026-10-29" };
    try {
      smtp.refuse("DATA", 554);
      expect(await sendEmail(channelFor(smtp.port), mail)).toEqual({
        ok: false,
        errorClass: "smtp_554",
        messageRefused: true,
      });
      smtp.refuse("END", 552);
      expect(await sendEmail(channelFor(smtp.port), mail)).toEqual({
        ok: false,
        errorClass: "smtp_552",
        messageRefused: true,
      });
      // A refused recipient is no refusal of the message, and a 4xx is transient: both keep the schedule.
      smtp.refuse("RCPT", 550);
      expect(await sendEmail(channelFor(smtp.port), mail)).toEqual({ ok: false, errorClass: "smtp_550" });
      smtp.refuse("DATA", 451);
      expect(await sendEmail(channelFor(smtp.port), mail)).toEqual({ ok: false, errorClass: "smtp_451" });
      smtp.refuse("END", 452);
      expect(await sendEmail(channelFor(smtp.port), mail)).toEqual({ ok: false, errorClass: "smtp_452" });
    } finally {
      await smtp.close();
    }
  });
});
