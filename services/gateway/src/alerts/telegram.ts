// The primary alert channel: the Telegram Bot API's sendMessage (contracts/alerts.md §4.1), plain text, 5 s.
//
//   POST {base}/bot<token>/sendMessage   {chat_id, text, disable_web_page_preview: true}   (no parse_mode)
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
// deadline bounds the whole send, from the lookup to the answer's last byte.
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";

import { aresLookup } from "../core/resolve.js";

/**
 * One delivery attempt's outcome: delivered, with the reference the provider's own answer gave (null when its answer
 * holds none that can be read), or an error class; never a URL or a response body.
 */
export type DeliveryResult = { ok: true; ref: string | null } | { ok: false; errorClass: string };

export interface TelegramChannel {
  base: string;
  token: string;
  chatId: string;
  timeoutMs: number;
}

/** The longest answer read back: a sendMessage answer is a few hundred bytes. */
const MAX_ANSWER_BYTES = 65_536;

const TLS_CODES =
  /^(ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|HOSTNAME_MISMATCH)/;

/** A failed request's class: timeout, tls, or connect. Only codes are read, never a message. */
export function requestErrorClass(err: unknown): string {
  const e = err as { name?: unknown; code?: unknown } | null;
  if (e?.name === "TimeoutError") return "timeout";
  const code = typeof e?.code === "string" ? e.code : "";
  if (TLS_CODES.test(code)) return "tls";
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

export async function sendTelegram(channel: TelegramChannel, text: string): Promise<DeliveryResult> {
  let status: number;
  let raw: string;
  try {
    const url = new URL(`${channel.base}/bot${channel.token}/sendMessage`);
    const body = JSON.stringify({ chat_id: channel.chatId, text, disable_web_page_preview: true });
    ({ status, raw } = await post(url, body, channel.timeoutMs));
  } catch (err) {
    return { ok: false, errorClass: requestErrorClass(err) };
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
