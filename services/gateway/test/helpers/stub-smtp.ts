// A stub SMTP server on the sandbox's own loopback, speaking just enough of RFC 5321 for nodemailer: the greeting,
// EHLO, AUTH PLAIN, MAIL, RCPT, DATA, RSET, NOOP, and QUIT. It records each message and can refuse one step with a
// reply code, or never greet at all, so the email channel's error classes can be proven without a real server.
// Plain text only: stand-in mode's Mailpit is plain SMTP too. The TLS tests run servers of their own, with certificates
// made at run time (integration/smtp-tls.test.ts, helpers/test-certs.ts; tasks.md T190).
import { createServer, type Socket } from "node:net";

export interface StubMessage {
  from: string;
  to: string[];
  /** The DATA, headers and body, with CRLFs. */
  data: string;
}

export interface StubSmtp {
  readonly port: number;
  readonly messages: StubMessage[];
  /**
   * Reply with this code to the next AUTH, MAIL, RCPT, or DATA command, then go on as usual. END replies with it to
   * the next message's end, after its data (spec 011, FR-027: the server refuses the message itself), and records no
   * message.
   */
  refuse(step: "AUTH" | "MAIL" | "RCPT" | "DATA" | "END", code: number): void;
  /** Accept connections and never send the greeting. */
  silent: boolean;
  close(): Promise<void>;
}

export async function stubSmtp(o: { advertiseAuth?: boolean } = {}): Promise<StubSmtp> {
  const messages: StubMessage[] = [];
  const refusals = new Map<string, number>();
  const sockets = new Set<Socket>();
  const stub: { silent: boolean } = { silent: false };

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    if (stub.silent) return;
    const reply = (line: string): void => void socket.write(`${line}\r\n`);
    reply("220 stub ESMTP");
    let buffer = "";
    let inData = false;
    let current: StubMessage = { from: "", to: [], data: "" };
    const refused = (step: string): boolean => {
      const code = refusals.get(step);
      if (code === undefined) return false;
      refusals.delete(step);
      reply(`${code} refused by the stub`);
      return true;
    };
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          current.data = buffer.slice(0, end + 2);
          buffer = buffer.slice(end + 5);
          inData = false;
          if (!refused("END")) {
            messages.push(current);
            reply("250 2.0.0 Ok: queued as ABC123");
          }
          current = { from: "", to: [], data: "" };
          continue;
        }
        const eol = buffer.indexOf("\r\n");
        if (eol < 0) return;
        const line = buffer.slice(0, eol);
        buffer = buffer.slice(eol + 2);
        const verb = line.split(" ")[0]?.toUpperCase() ?? "";
        if (verb === "EHLO") {
          reply("250-stub");
          if (o.advertiseAuth === true) reply("250-AUTH PLAIN LOGIN");
          reply("250 8BITMIME");
        } else if (verb === "HELO" || verb === "RSET" || verb === "NOOP") {
          reply("250 OK");
        } else if (verb === "AUTH") {
          if (!refused("AUTH")) reply("235 2.7.0 Authentication successful");
        } else if (verb === "MAIL") {
          if (refused("MAIL")) continue;
          current.from = /<([^>]*)>/.exec(line)?.[1] ?? "";
          reply("250 OK");
        } else if (verb === "RCPT") {
          if (refused("RCPT")) continue;
          current.to.push(/<([^>]*)>/.exec(line)?.[1] ?? "");
          reply("250 OK");
        } else if (verb === "DATA") {
          if (refused("DATA")) continue;
          inData = true;
          reply("354 End data with <CR><LF>.<CR><LF>");
        } else if (verb === "QUIT") {
          reply("221 Bye");
          socket.end();
          return;
        } else {
          reply("502 Command not implemented");
        }
      }
    });
  });
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : 0);
    });
  });
  return {
    port,
    messages,
    refuse: (step, code) => void refusals.set(step, code),
    get silent() {
      return stub.silent;
    },
    set silent(v: boolean) {
      stub.silent = v;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
