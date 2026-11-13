// The forward to the serving host's relay block (spec 001 contracts/relay-http.md §3, steps 6 and 7; contracts/
// tunnel.md §4): the host's token, the viewer's address as X-H4-Viewer, the trace context, and the body unchanged.
// Nothing else of the viewer's request goes on: no X-Forwarded-For, X-H4-Client, cookie, or any header but
// Content-Type and Accept. The answer comes back with its status, its body, and only the headers the room reads.
//
// A failure to connect, before a byte of the request was sent, is told apart from a failure after, since only the
// first may be retried on the other host: a request that reached a gateway may already have been metered.
import { request } from "node:http";

import type { HostTarget } from "./config.js";

export type ForwardPath = "/hello" | "/room/turn" | "/room/events";

export interface ForwardRequest {
  readonly path: ForwardPath;
  readonly body: Buffer;
  readonly contentType: string | undefined;
  readonly accept: string | undefined;
  readonly traceparent: string | undefined;
  readonly viewer: string;
  readonly requestId: string;
}

export type ForwardResult =
  | {
      readonly kind: "answer";
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: Buffer;
    }
  /** No connection was made: nothing was sent, so the other host may take it. */
  | { readonly kind: "unsent" }
  /** The request was sent, or its deadline passed: never retried. */
  | { readonly kind: "failed" };

/** The gateway's 20 s deadline (config/routing.yaml's deadline_ms) plus the hops; the room's own timeout is 35 s. */
export const DEADLINE_MS = 25_000;
/** A connection not made in this long is unsent, as the relay blocks' own proxy_connect_timeout. */
export const CONNECT_TIMEOUT_MS = 2_000;
/** The headers of the host's answer the relay passes on; no other one reaches the viewer. */
export const ANSWER_HEADERS = ["content-type", "retry-after", "x-h4-degraded-cause", "cache-control"] as const;
const TRACEPARENT = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

export function forward(
  target: HostTarget,
  req: ForwardRequest,
  deadlineMs: number = DEADLINE_MS,
): Promise<ForwardResult> {
  return new Promise((resolve) => {
    let connected = false;
    let settled = false;
    const settle = (result: ForwardResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(connectTimer);
      resolve(result);
    };
    const headers: Record<string, string> = {
      "x-h4-viewer": req.viewer,
      "x-request-id": req.requestId,
      "content-length": String(req.body.length),
      connection: "close",
    };
    // dev-relay's one host is its stack's gateway, which takes no token (deploy/compose.yaml).
    if (target.token !== "") headers.authorization = `Bearer ${target.token}`;
    if (req.contentType !== undefined) headers["content-type"] = req.contentType;
    if (req.accept !== undefined) headers.accept = req.accept;
    if (req.traceparent !== undefined && TRACEPARENT.test(req.traceparent)) headers.traceparent = req.traceparent;
    const out = request(new URL(req.path, target.url), { method: "POST", agent: false, headers });
    const timer = setTimeout(() => {
      out.destroy();
      settle(connected ? { kind: "failed" } : { kind: "unsent" });
    }, deadlineMs);
    const connectTimer = setTimeout(() => {
      if (connected) return;
      out.destroy();
      settle({ kind: "unsent" });
    }, CONNECT_TIMEOUT_MS);
    out.on("socket", (socket) => {
      socket.once("connect", () => {
        connected = true;
        clearTimeout(connectTimer);
      });
    });
    out.on("response", (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const kept: Record<string, string> = {};
        for (const name of ANSWER_HEADERS) {
          const v = res.headers[name];
          if (typeof v === "string") kept[name] = v;
        }
        settle({ kind: "answer", status: res.statusCode ?? 502, headers: kept, body: Buffer.concat(chunks) });
      });
      res.on("error", () => settle({ kind: "failed" }));
    });
    out.on("error", () => settle(connected ? { kind: "failed" } : { kind: "unsent" }));
    out.end(req.body);
  });
}
