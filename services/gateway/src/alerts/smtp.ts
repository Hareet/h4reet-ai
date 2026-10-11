// The secondary alert channel: email over SMTP, through nodemailer (contracts/alerts.md §4.1), 10 s.
//
// - Real mode: SMTP_HOST:SMTP_PORT with TLS, either implicit on 465 (`secure: true`) or STARTTLS on 587
//   (`requireTLS: true`), certificates verified, AUTH with SMTP_USER and SMTP_PASSWORD; prod refuses anything else at
//   startup (config-files.md §4.4).
// - Stand-in mode: config/alerts.yaml's in-network Mailpit, plain SMTP, no AUTH, from and to addresses that exist only
//   inside the stack (§4.3).
// From ALERT_EMAIL_FROM to ALERT_EMAIL_TO, text/plain only, with `Auto-Submitted: auto-generated` and
// `X-H4-Alert-Id: <dedupe key>` (nodemailer writes the name X-H4-Alert-ID; header names are case-insensitive).
// Delivered is the server's 250; the reference kept is the reply code and the queue
// ID, read from the server's own reply line: a reply that can't be read keeps none, never an assumed 250 (tasks.md
// T156). A failure is recorded as its class only: timeout, connect, tls, smtp_<reply code>, smtp_<nodemailer code>.
// The gateway connects to the host itself, through c-ares, and hands nodemailer the socket (aresTransport below,
// tasks.md T189). A TLS handshake that fails, a certificate that doesn't verify included, is tls (failedHandshake
// below, tasks.md T190).
import type { LookupAddress } from "node:dns";
import { connect, type LookupFunction, type Socket } from "node:net";
import { checkServerIdentity, type ConnectionOptions, type PeerCertificate } from "node:tls";

import { createTransport } from "nodemailer";

import { aresLookup } from "../core/resolve.js";
import type { DeliveryResult } from "./telegram.js";

export interface EmailChannel {
  host: string;
  port: number;
  /** Implicit TLS, on 465. */
  secure: boolean;
  /** STARTTLS, required, on 587. */
  requireTLS: boolean;
  /** Stand-in mode only: Mailpit speaks plain SMTP inside the stack. */
  ignoreTLS: boolean;
  auth?: { user: string; pass: string };
  from: string;
  to: string;
  timeoutMs: number;
}

/**
 * What the transport is built from: the test asserts it, so TLS and its certificate check can't be dropped by mistake.
 * The default transport adds only its getSocket (aresTransport below).
 */
export function transportOptions(channel: EmailChannel) {
  return {
    host: channel.host,
    port: channel.port,
    secure: channel.secure,
    requireTLS: channel.requireTLS,
    ignoreTLS: channel.ignoreTLS,
    ...(channel.auth === undefined ? {} : { auth: { user: channel.auth.user, pass: channel.auth.pass } }),
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" as const },
    connectionTimeout: channel.timeoutMs,
    greetingTimeout: channel.timeoutMs,
    socketTimeout: channel.timeoutMs,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  };
}

const NODEMAILER_CODE = /^E[A-Z]{2,20}$/;

/** A failed send's class: the server's reply code first, then a timeout, TLS, or the connection, then nodemailer's own. */
export function smtpErrorClass(err: unknown): string {
  const e = err as { code?: unknown; responseCode?: unknown; syscall?: unknown; cause?: { code?: unknown } } | null;
  const reply = e?.responseCode;
  if (typeof reply === "number" && Number.isInteger(reply) && reply >= 200 && reply <= 599) return `smtp_${reply}`;
  const code = typeof e?.code === "string" ? e.code : "";
  const cause = typeof e?.cause?.code === "string" ? e.cause.code : "";
  if (code === "ETIMEDOUT" || cause === "ETIMEDOUT") return "timeout";
  if (code === "ETLS" || /^(ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_|DEPTH_ZERO|SELF_SIGNED)/.test(cause)) return "tls";
  // A refused or unresolvable connection: the default transport reports ECONNECTION or EDNS itself
  // (connectThroughAres); a transport that connects through nodemailer reports ESOCKET on the connect or lookup.
  const connecting = code === "ESOCKET" && (e?.syscall === "connect" || e?.syscall === "getaddrinfo");
  if (
    connecting ||
    code === "ECONNECTION" ||
    code === "EDNS" ||
    ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"].includes(cause)
  ) {
    return "connect";
  }
  return NODEMAILER_CODE.test(code) ? `smtp_${code}` : "smtp_unknown";
}

type TransportFactory = (options: ReturnType<typeof transportOptions>) => {
  sendMail(mail: object): Promise<{ response?: unknown }>;
  close(): void;
};

/** The addresses c-ares last found for each SMTP host, which a lookup that fails falls back to. */
const lastFound = new Map<string, LookupAddress[]>();

/** A host with no address, now or before: nodemailer's own code for it, which classes as connect. */
function noAddress(): NodeJS.ErrnoException {
  return Object.assign(new Error("the SMTP host has no address"), { code: "EDNS" });
}

/**
 * The SMTP host's lookup: aresLookup, keeping each answer for the host and giving the last one when a lookup fails, as
 * nodemailer's own cache did through a resolver outage. It asks at every attempt, where nodemailer reused an answer
 * for 5 minutes.
 */
const smtpLookup: LookupFunction = (hostname, options, callback) => {
  aresLookup(hostname, { ...options, all: true }, (err, found) => {
    const fresh = err === null && Array.isArray(found) && found.length > 0 ? found : undefined;
    if (fresh !== undefined) lastFound.set(hostname, fresh);
    const addresses = fresh ?? lastFound.get(hostname);
    const first = addresses?.[0];
    if (addresses === undefined || first === undefined) callback(noAddress(), options.all ? [] : "");
    else if (options.all) callback(null, addresses);
    else callback(null, first.address, first.family);
  });
};

/** One connection's TLS, as far as the gateway can see it: whether the server's certificate passed. */
interface Attempt {
  verified: boolean;
}

/** The errors the email channel's TCP sockets raised themselves, as each raised it (connectThroughAres). */
const raisedByTcp = new WeakSet<object>();

/**
 * Node's own check of the server's identity, which notes whether the certificate passed. Node runs it only once the
 * certificate's chain has verified, and the handshake ends as soon as it passes.
 */
const identityCheck =
  (attempt: Attempt) =>
  (host: string, cert: PeerCertificate): Error | undefined => {
    const mismatch = checkServerIdentity(host, cert);
    attempt.verified = mismatch === undefined;
    return mismatch;
  };

/**
 * nodemailer's getSocket (tasks.md T189): a socket connected to the host through smtpLookup, which nodemailer then
 * speaks SMTP, and TLS, over. net tries each address in turn, 250 ms apiece but the last, as for the Telegram channel,
 * and the connection timeout bounds the lookup and the connect together. A failure takes nodemailer's own codes: the
 * connection timeout is ETIMEDOUT, a host with no address EDNS, and any other failure to connect ECONNECTION. net's
 * own ETIMEDOUT is one address's 250 ms attempt: when every address fails, its error takes the first attempt's code,
 * so it is ECONNECTION here, as nodemailer reported its last address's failure.
 *
 * For failedHandshake (tasks.md T190), the socket marks each error it raises before nodemailer's listeners see it,
 * and nodemailer is handed TLS options of the connection's own: nodemailer merges what getSocket gives into the
 * connection's options, and its TLS, on 465 or after STARTTLS, takes them. They are the transport's, with
 * identityCheck noting in `attempt` whether the server's certificate passed.
 */
function connectThroughAres(
  options: ReturnType<typeof transportOptions>,
  attempt: Attempt,
  callback: (err: Error | null, socketOptions?: { connection: Socket; tls: ConnectionOptions }) => void,
): void {
  attempt.verified = false;
  const socket = connect({ host: options.host, port: options.port, lookup: smtpLookup });
  const timedOut = Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" });
  const timer = setTimeout(() => socket.destroy(timedOut), options.connectionTimeout);
  const fail = (err: NodeJS.ErrnoException): void => {
    clearTimeout(timer);
    const kept = err === timedOut || err.code === "EDNS";
    callback(kept ? err : Object.assign(new Error("the SMTP host couldn't be reached"), { code: "ECONNECTION" }));
  };
  socket.once("error", fail);
  socket.once("connect", () => {
    clearTimeout(timer);
    socket.off("error", fail);
    socket.on("error", (err) => raisedByTcp.add(err));
    callback(null, { connection: socket, tls: { ...options.tls, checkServerIdentity: identityCheck(attempt) } });
  });
}

/**
 * Whether a send failed in its TLS handshake (tasks.md T190). nodemailer 10.0.16 gives the TLS socket's error the
 * code ESOCKET, overwriting the error's own code (a certificate's, or OpenSSL's) on the error itself, and gives no
 * way to listen on the TLS socket it puts over the connection, on 465 or after STARTTLS. Its ESOCKET is always a
 * socket's error event, though, and the TCP socket marks its own as it raises them: an ESOCKET the TCP socket didn't
 * raise came from the TLS socket over it. Once TLS is over it, the TCP socket raises none of its own: a reset comes
 * through the TLS socket too. So before the server's certificate passed, such an error is a failed handshake; after,
 * it keeps its class. A failure before STARTTLS was the TCP socket's, and a timeout or a reply is not ESOCKET.
 */
function failedHandshake(err: unknown, attempt: Attempt): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { code?: unknown }).code === "ESOCKET" && !raisedByTcp.has(err) && !attempt.verified;
}

/** A failed handshake's error: the class tls, and nothing of the certificate, or of what Node said about it. */
const handshakeFailed = (): Error => Object.assign(new Error("the TLS handshake failed"), { code: "ETLS" });

/**
 * The transport sendEmail uses unless it is handed one (tasks.md T189). nodemailer resolves a host name through
 * c-ares, but falls back to getaddrinfo whenever c-ares finds no address, a SERVFAIL or a timeout included, and a
 * getaddrinfo the resolver doesn't answer holds one of the two threads libuv gives lookups until the resolver gives up.
 * So the gateway connects itself and hands nodemailer the socket: nodemailer resolves nothing, and its TLS, on 465 or
 * after STARTTLS, still asks for the host's name and checks the certificate against it. A failed handshake is
 * reported as handshakeFailed's error (tasks.md T190). sendEmail makes a transport for each send, so each transport
 * makes one connection, and `attempt` is that connection's.
 */
const aresTransport: TransportFactory = (options) => {
  const attempt: Attempt = { verified: false };
  const transport = createTransport({
    ...options,
    getSocket: (_options, callback) => connectThroughAres(options, attempt, callback),
  });
  return {
    sendMail: (mail) =>
      transport.sendMail(mail).catch((err: unknown) => {
        throw failedHandshake(err, attempt) ? handshakeFailed() : err;
      }),
    close: () => transport.close(),
  };
};

export async function sendEmail(
  channel: EmailChannel,
  mail: { subject: string; text: string; alertId: string },
  factory: TransportFactory = aresTransport,
): Promise<DeliveryResult> {
  const transport = factory(transportOptions(channel));
  let timer: NodeJS.Timeout | undefined;
  try {
    // nodemailer's own timeouts end most stalls with their class; this one bounds the whole send.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
        channel.timeoutMs + 500,
      );
    });
    const info = await Promise.race([
      transport.sendMail({
        from: channel.from,
        to: channel.to,
        subject: mail.subject,
        text: mail.text,
        headers: { "Auto-Submitted": "auto-generated", "X-H4-Alert-Id": mail.alertId },
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
      deadline,
    ]);
    // nodemailer resolves only once the server accepted the message: delivered. The reference is the reply's own
    // code and queue ID, or nothing when the reply holds no code that can be read.
    const response = typeof info.response === "string" ? info.response : "";
    const code = /^(2\d\d)\b/.exec(response)?.[1];
    if (code === undefined) return { ok: true, ref: null };
    const queueId = /queued as ([A-Za-z0-9._-]{1,64})/i.exec(response)?.[1];
    return { ok: true, ref: queueId === undefined ? code : `${code} ${queueId}` };
  } catch (err) {
    return { ok: false, errorClass: smtpErrorClass(err) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    transport.close();
  }
}
