// The primary alert channel: the Telegram Bot API's sendMessage (contracts/alerts.md §4.1), plain text, 5 s.
//
//   POST {base}/bot<token>/sendMessage   {chat_id, text, disable_web_page_preview: true}   (no parse_mode)
//
// Delivered is HTTP 200 with "ok": true, and the reference is result.message_id. The URL holds the bot token, so it is
// never logged, stored, or put in an error: a failure is recorded as its class only (timeout, connect, tls,
// http_<status>, telegram_<error_code>). The undici instrumentation skips this host, so no client span records the URL
// either (telemetry.md §3.1). In stand-in mode the base is config/alerts.yaml's in-network stand-in, the token the
// fixed dummy `standin`, and the chat 0 (§4.3).

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
export function fetchErrorClass(err: unknown): string {
  const e = err as { name?: unknown; code?: unknown; cause?: { code?: unknown; name?: unknown } } | null;
  const name = typeof e?.name === "string" ? e.name : "";
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  const code = typeof e?.cause?.code === "string" ? e.cause.code : typeof e?.code === "string" ? e.code : "";
  if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") {
    return "timeout";
  }
  if (TLS_CODES.test(code)) return "tls";
  return "connect";
}

export async function sendTelegram(channel: TelegramChannel, text: string): Promise<DeliveryResult> {
  const url = `${channel.base}/bot${channel.token}/sendMessage`;
  let status: number;
  let raw: string;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: channel.chatId, text, disable_web_page_preview: true }),
      redirect: "error",
      signal: AbortSignal.timeout(channel.timeoutMs),
    });
    status = res.status;
    raw = (await res.text()).slice(0, MAX_ANSWER_BYTES);
  } catch (err) {
    return { ok: false, errorClass: fetchErrorClass(err) };
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
