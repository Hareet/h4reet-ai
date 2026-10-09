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
// ID. A failure is recorded as its class only: timeout, connect, tls, smtp_<reply code>, smtp_<nodemailer code>.
import { createTransport } from "nodemailer";

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

/** What createTransport is given: the test asserts it, so TLS and its certificate check can't be dropped by mistake. */
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
  // A refused or unresolvable connection: nodemailer reports it as ESOCKET on the connect or lookup call.
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

export async function sendEmail(
  channel: EmailChannel,
  mail: { subject: string; text: string; alertId: string },
  factory: TransportFactory = (options) => createTransport(options),
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
    const response = typeof info.response === "string" ? info.response : "";
    const code = /^([2-5]\d\d)/.exec(response)?.[1] ?? "250";
    const queueId = /queued as ([A-Za-z0-9._-]{1,64})/i.exec(response)?.[1];
    return { ok: true, ref: queueId === undefined ? code : `${code} ${queueId}` };
  } catch (err) {
    return { ok: false, errorClass: smtpErrorClass(err) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    transport.close();
  }
}
