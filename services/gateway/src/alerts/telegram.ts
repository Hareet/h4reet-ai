// The primary alert channel: the Telegram Bot API's sendMessage (contracts/alerts.md §4.1), 5 s.
//
//   POST {base}/bot<token>/sendMessage   {chat_id, text, disable_web_page_preview: true}             the plain form
//                                        {chat_id, text, entities, disable_web_page_preview: true}   the designed one
//
// Never parse_mode (spec 011, FR-008): the designed form's bold and monospace are message entities, carried beside
// the text as data, so no character of any value is read as markup. A message with no entities is the plain form,
// whose body is exactly the one every alert sent before spec 011 (FR-013).
//
// Delivered is HTTP 200 with "ok": true, and the reference is result.message_id. The URL holds the bot token, so it is
// never logged, stored, or put in an error: a failure is recorded as its class only (timeout, connect, tls,
// http_<status>, telegram_<error_code>). The http instrumentation skips this host, so no client span records the URL
// either (telemetry.md §3.1). In stand-in mode the base is config/alerts.yaml's in-network stand-in, the token the
// fixed dummy `standin`, and the chat 0 (§4.3).
//
// The transport is node:http(s), as the local adapter's is, not fetch: the host resolves through c-ares
// (core/resolve.ts), so a send never waits behind lookups queued on libuv's threadpool. At T084's pre-run every send
// timed out that way while the model server was stopped (T188). It follows no redirect: a 3xx is http_<status>. One
// deadline bounds the whole send, from the lookup to the answer's last byte, and at most 64 KiB of an answer is kept.
// A host that doesn't resolve is `connect`, as a refused connection is. With no agent, a send takes no proxy from the
// environment either; prod reaches api.telegram.org directly through `egress`, and a proxy would need code here.
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";

import { aresLookup } from "../core/resolve.js";

/**
 * One delivery attempt's outcome: delivered, with the reference the provider's own answer gave (null when its answer
 * holds none that can be read), or an error class; never a URL or a response body.
 */
export type DeliveryResult =
  | { ok: true; ref: string | null }
  /** messageRefused: a mail server refused the message itself, a 5xx to its data (spec 011, FR-027; smtp.ts). */
  | { ok: false; errorClass: string; messageRefused?: true };

export interface TelegramChannel {
  base: string;
  token: string;
  chatId: string;
  timeoutMs: number;
}

/** The most of an answer kept: a sendMessage answer is a few hundred bytes. */
const MAX_ANSWER_BYTES = 65_536;

const TLS_CODES =
  /^(ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|HOSTNAME_MISMATCH)/;

/**
 * A failed request's class: timeout, tls, or connect. Only codes are read, never a message. On an https request,
 * EPROTO is what node:https reports when the peer doesn't speak TLS at all ("wrong version number"; Node 24), so it is
 * tls. On plain http it can only come from the network, an ICMP Parameter Problem during the connect, so it stays
 * connect.
 */
export function requestErrorClass(err: unknown, https = false): string {
  const e = err as { name?: unknown; code?: unknown } | null;
  if (e?.name === "TimeoutError") return "timeout";
  const code = typeof e?.code === "string" ? e.code : "";
  if (TLS_CODES.test(code) || (https && code === "EPROTO")) return "tls";
  return "connect";
}

function timeoutError(): Error {
  const err = new Error("the send's deadline passed");
  err.name = "TimeoutError";
  return err;
}

/** POST body to url within timeoutMs: the answer's status and at most MAX_ANSWER_BYTES of its text, or a rejection. */
function post(url: URL, body: string, timeoutMs: number): Promise<{ status: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port === "" ? undefined : url.port,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
      agent: false,
      lookup: aresLookup,
    });
    let settled = false;
    const settle = (err: unknown, answer?: { status: number; raw: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (answer === undefined) reject(err);
      else resolve(answer);
    };
    const deadline = setTimeout(
      () => {
        settle(timeoutError());
        req.destroy();
      },
      Math.max(1, Math.floor(timeoutMs)),
    );
    // Attached first, so destroying the request never raises an 'error' nobody listens for.
    req.on("error", (err) => settle(err));
    req.on("response", (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        if (size < MAX_ANSWER_BYTES) chunks.push(chunk);
        size += chunk.length;
      });
      res.on("end", () =>
        settle(undefined, {
          status: res.statusCode ?? 0,
          raw: Buffer.concat(chunks).toString("utf8").slice(0, MAX_ANSWER_BYTES),
        }),
      );
      res.on("error", (err) => settle(err));
      res.on("close", () => {
        if (!res.complete) settle(Object.assign(new Error("the answer was cut short"), { code: "ECONNRESET" }));
      });
    });
    req.end(body);
  });
}

/** A message to send: the text, and the designed form's entities (spec 011, plan §4.4); none is the plain form. */
export interface TelegramSend {
  text: string;
  entities?: readonly { type: string; offset: number; length: number }[];
}

/** The request's JSON body: today's, unless the message carries entities. */
export function telegramBody(chatId: string, message: string | TelegramSend): string {
  const { text, entities } = typeof message === "string" ? { text: message, entities: undefined } : message;
  if (entities === undefined || entities.length === 0) {
    return JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true });
  }
  return JSON.stringify({ chat_id: chatId, text, entities, disable_web_page_preview: true });
}

export async function sendTelegram(channel: TelegramChannel, message: string | TelegramSend): Promise<DeliveryResult> {
  let status: number;
  let raw: string;
  let https = false;
  try {
    const url = new URL(`${channel.base}/bot${channel.token}/sendMessage`);
    https = url.protocol === "https:";
    const body = telegramBody(channel.chatId, message);
    ({ status, raw } = await post(url, body, channel.timeoutMs));
  } catch (err) {
    return { ok: false, errorClass: requestErrorClass(err, https) };
  }
  if (status !== 200) return { ok: false, errorClass: `http_${status}` };
  let answer: { ok?: unknown; result?: { message_id?: unknown }; error_code?: unknown };
  try {
    answer = JSON.parse(raw) as typeof answer;
  } catch {
    return { ok: false, errorClass: "telegram_malformed" };
  }
  const id = answer?.result?.message_id;
  if (answer?.ok === true && typeof id === "number" && Number.isSafeInteger(id)) return { ok: true, ref: String(id) };
  const code = answer?.error_code;
  return {
    ok: false,
    errorClass: typeof code === "number" && Number.isSafeInteger(code) ? `telegram_${code}` : "telegram_malformed",
  };
}
