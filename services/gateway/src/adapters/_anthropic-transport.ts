// The Anthropic adapter's transport (spec 010, FR-009, FR-010, FR-016, FR-033; its plan §2.6, D3; departures B2 to
// B4): the `fetch` the official SDK is given, so that one tested place does what the SDK's default fetch can't.
//
// - The origin lock: a URL whose origin isn't the one the transport was built with is refused before a socket opens.
//   Production's origin is https://api.anthropic.com, a constant of the adapter's module; tests build it with a stub's.
// - The name lookup goes through c-ares (core/resolve.ts, tasks.md T188 of spec 000), or the lookup it is given, so a
//   lookup that hangs holds no libuv thread.
// - The connect watchdog: a socket that hasn't connected within connectMs, the lookup and the TLS handshake included,
//   is destroyed, as the local adapter's watchdog does, and the call never reached the API.
// - The headers it sends, it sets itself, from fixed values: `authorization` (the key, as `Bearer <key>`, the pinned
//   SDK's form for an API key, departure B2), `anthropic-version` and `user-agent` (the pinned SDK's), `accept`, and
//   `content-type` and `content-length` with a body. Every header the SDK passes in is dropped: its platform and retry
//   headers, a trace context, and anything ANTHROPIC_CUSTOM_HEADERS adds (departure B3).
// - A failure is an AnthropicTransportError carrying a Node or c-ares code and `reached`: true once the request was
//   written to a connected socket, so a loss after it may have been billed. Its message never words it as a timeout,
//   and it has no `cause`, so the SDK keeps it as its connection error's cause (departure B4).
// - No telemetry of its own: the HTTP instrumentation's ignore hook skips every host that isn't a single in-stack
//   label (contracts/telemetry.md §3.1), so no client span or trace header goes with the request.
import { Agent as HttpAgent, request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import type { LookupFunction, Socket } from "node:net";

import { aresLookup } from "../core/resolve.js";

/** The headers a request to Anthropic carries, and nothing else (FR-016). */
export const SENT_HEADERS = [
  "authorization",
  "anthropic-version",
  "content-type",
  "content-length",
  "accept",
  "user-agent",
] as const;

/** An answer of the Messages API or the model lookup is a few kilobytes; anything past this is not one. */
const MAX_RESPONSE_BYTES = 1_048_576;
/** What a Node or c-ares error code looks like; anything else is never copied onto an error. */
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,40}$/;

/**
 * A request that failed on its way: never reached (refused, unreachable, a failed lookup, the connect watchdog, the
 * origin lock) or reached and then lost. It carries a code and nothing else: no URL, header, body, or key.
 */
export class AnthropicTransportError extends Error {
  constructor(
    readonly code: string | undefined,
    readonly reached: boolean,
  ) {
    super(reached ? "the connection broke after the request was written" : "the request never reached the API");
    this.name = "AnthropicTransportError";
  }
}

export interface TransportOptions {
  /** https://api.anthropic.com in production; a stub's http://127.0.0.1:<port> in tests. */
  origin: string;
  connectMs: number;
  apiKey: string;
  /** The pinned SDK's API version and user agent. */
  version: string;
  userAgent: string;
  /** aresLookup by default. */
  lookup?: LookupFunction;
}

export interface AnthropicTransport {
  readonly origin: string;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /** Closes its sockets, at the adapter's close. */
  destroy(): void;
}

const codeOf = (err: unknown): string | undefined => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && ERROR_CODE.test(code) ? code : undefined;
};

const aborted = (): Error => new DOMException("This operation was aborted", "AbortError");

/** A request body the SDK hands its fetch: a JSON string, or bytes; nothing else is sent. */
function bodyOf(body: RequestInit["body"]): string | Uint8Array | undefined | null {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string" || body instanceof Uint8Array) return body;
  return null;
}

export function createAnthropicTransport(o: TransportOptions): AnthropicTransport {
  const base = new URL(o.origin);
  const secure = base.protocol === "https:";
  const lookup = o.lookup ?? aresLookup;
  const agent = secure
    ? new HttpsAgent({ keepAlive: true, maxSockets: 8, lookup })
    : new HttpAgent({ keepAlive: true, maxSockets: 8, lookup });

  function send(url: URL, method: string, body: string | Uint8Array | undefined, signal: AbortSignal | undefined) {
    return new Promise<Response>((resolve, reject) => {
      const headers: Record<string, string> = {
        authorization: `Bearer ${o.apiKey}`,
        "anthropic-version": o.version,
        accept: "application/json",
        "user-agent": o.userAgent,
      };
      if (body !== undefined) {
        headers["content-type"] = "application/json";
        headers["content-length"] = String(Buffer.byteLength(body));
      }
      const options = {
        host: url.hostname,
        port: url.port === "" ? (secure ? 443 : 80) : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method,
        agent,
        headers,
        lookup,
        ...(secure ? { servername: url.hostname } : {}),
      };
      const req: ClientRequest = secure ? httpsRequest(options) : httpRequest(options);
      let settled = false;
      let connected = false;
      let written = false;
      let watchdog: NodeJS.Timeout | undefined;
      const reached = (): boolean => connected && written;
      const settle = (err: Error | undefined, res?: Response): void => {
        if (settled) return;
        settled = true;
        if (watchdog !== undefined) clearTimeout(watchdog);
        signal?.removeEventListener("abort", abort);
        if (err !== undefined) reject(err);
        else resolve(res as Response);
      };
      const abort = (): void => {
        settle(aborted());
        req.destroy();
      };
      // Attached first, so destroying the request never raises an 'error' nobody listens for.
      req.on("error", (err) => settle(new AnthropicTransportError(codeOf(err), reached())));
      if (signal?.aborted === true) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
      req.on("socket", (socket: Socket) => {
        if (!socket.connecting) {
          connected = true;
          return;
        }
        watchdog = setTimeout(() => {
          settle(new AnthropicTransportError("ETIMEDOUT", false));
          req.destroy();
        }, o.connectMs);
        watchdog.unref();
        socket.once(secure ? "secureConnect" : "connect", () => {
          connected = true;
          if (watchdog !== undefined) clearTimeout(watchdog);
          watchdog = undefined;
        });
      });
      req.on("finish", () => {
        written = true;
      });
      req.on("response", (res: IncomingMessage) => {
        if (settled) {
          res.resume();
          return;
        }
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) for (const v of value) responseHeaders.append(name, v);
          else if (typeof value === "string") responseHeaders.set(name, value);
        }
        const status = res.statusCode ?? 0;
        if ([101, 204, 205, 304].includes(status)) {
          res.resume();
          settle(undefined, new Response(null, { status, headers: responseHeaders }));
          return;
        }
        let size = 0;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            res.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > MAX_RESPONSE_BYTES) {
                controller.error(new AnthropicTransportError("RESPONSE_TOO_LARGE", true));
                req.destroy();
                return;
              }
              controller.enqueue(new Uint8Array(chunk));
            });
            res.on("end", () => {
              try {
                controller.close();
              } catch {
                // already errored or closed
              }
            });
            res.on("error", (err) => controller.error(new AnthropicTransportError(codeOf(err), true)));
            res.on("close", () => {
              if (!res.complete) {
                try {
                  controller.error(new AnthropicTransportError("SOCKET_CLOSED", true));
                } catch {
                  // already closed
                }
              }
            });
          },
          cancel() {
            req.destroy();
          },
        });
        settle(
          undefined,
          new Response(stream, { status, statusText: res.statusMessage ?? "", headers: responseHeaders }),
        );
      });
      req.end(body);
    });
  }

  return {
    origin: base.origin,
    fetch(input, init) {
      let url: URL;
      try {
        url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      } catch {
        return Promise.reject(new AnthropicTransportError("ORIGIN_REFUSED", false));
      }
      if (url.origin !== base.origin) return Promise.reject(new AnthropicTransportError("ORIGIN_REFUSED", false));
      const body = bodyOf(init?.body);
      if (body === null) return Promise.reject(new AnthropicTransportError("BODY_REFUSED", false));
      return send(url, (init?.method ?? "GET").toUpperCase(), body, init?.signal ?? undefined);
    },
    destroy() {
      agent.destroy();
    },
  };
}
