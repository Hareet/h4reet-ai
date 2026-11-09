// An in-process stub of the Anthropic API's two endpoints the adapter uses (spec 010's plan §2.9): node:http on the
// sandbox's own loopback, at a random port, reached as http://127.0.0.1:<port>, the origin the adapter's deps seam
// takes in tests. The contract suite, the error and wire tests, and the integration tests run against it; nothing
// leaves the process, and no key is real.
//
// - POST /v1/messages answers the next behavior queued with next(), or the standing one set with setCompletions(), or
//   else an echo of the last message, in the Messages API's shape: content blocks, a stop_reason, and a usage.
// - GET /v1/models/{id} answers the next behavior queued with nextHealth(), or the standing one, or else the model's
//   description, naming the requested ID.
// - Errors come in the API's shape, {type: "error", error: {type, message}}, with their status.
// - A canary sits in every echo and every error body, so a test can show that the adapter never carries a provider's
//   text into an error or a log (C6).
// - Each request is recorded: its method, path, headers (lowercased), and parsed body.
// - { refuse: true } stops listening at once, so the next connection is refused; the stub listens again at the next
//   call to next(), nextHealth(), restore(), or reset().
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

import type { StubBehavior, StubControl, StubRequest } from "../contract/adapter-contract.js";

/** The contract suite's behaviors, and the Messages API's own answers the adapter's tests need. */
export type AnthropicBehavior =
  | StubBehavior
  /** A 200 with this exact body. */
  | { message: Record<string, unknown> }
  /** The request's body is read whole, then the connection is dropped without an answer. */
  | { resetAfterBody: true }
  /** No answer until the stub closes. */
  | { hang: true };

export interface StubAnthropic extends StubControl {
  /** http://127.0.0.1:<port> */
  readonly origin: string;
  readonly port: number;
  next(behavior: AnthropicBehavior): void;
  nextHealth(behavior: AnthropicBehavior): void;
  /** A behavior that answers every Messages request until cleared, unlike next(), which answers one. */
  setCompletions(behavior: AnthropicBehavior | undefined): void;
  setHealth(behavior: AnthropicBehavior | undefined): void;
  /** The Messages requests alone. */
  messages(): StubRequest[];
  restore(): void;
  close(): Promise<void>;
}

type Ok = Extract<StubBehavior, { ok: unknown }>["ok"];

const MAX_BODY_BYTES = 1_048_576;
const STOP: Record<Ok["finish"], string> = { stop: "end_turn", length: "max_tokens", content_filter: "refusal" };
const ERROR_TYPE: Record<number, string> = {
  400: "invalid_request_error",
  401: "authentication_error",
  403: "permission_error",
  404: "not_found_error",
  413: "request_too_large",
  429: "rate_limit_error",
  500: "api_error",
  529: "overloaded_error",
};

export async function stubAnthropic(opts: { model?: string } = {}): Promise<StubAnthropic> {
  const model = opts.model ?? "claude-haiku-5-5";
  const canary = `canary-${randomBytes(6).toString("hex")}`;
  const completions: AnthropicBehavior[] = [];
  const health: AnthropicBehavior[] = [];
  let completionsDefault: AnthropicBehavior | undefined;
  let healthDefault: AnthropicBehavior | undefined;
  const recorded: StubRequest[] = [];
  const sockets = new Set<Socket>();
  const timers = new Set<NodeJS.Timeout>();
  let served = 0;
  let refusing = false;
  let closed = false;

  const server: Server = createServer((req, res) => void handle(req, res));
  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });

  function refuse(): void {
    if (refusing || closed) return;
    refusing = true;
    server.close();
    for (const socket of sockets) socket.destroy();
  }

  function restore(): void {
    if (!refusing || closed) return;
    refusing = false;
    server.listen(port, "127.0.0.1");
  }

  const later = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        timers.delete(t);
        resolve();
      }, ms);
      timers.add(t);
    });

  async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY_BYTES) throw new Error("body too large");
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  const send = (res: ServerResponse, status: number, body: string): void => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
      "request-id": `req_stub_${served}`,
    });
    res.end(body);
  };
  const errorBody = (status: number): string =>
    JSON.stringify({
      type: "error",
      error: { type: ERROR_TYPE[status] ?? "api_error", message: `stub error ${status}: ${canary}` },
    });

  /** An answer as the API gives it: the output cut at max_tokens, and then a stop of max_tokens. */
  function message(request: Record<string, unknown>, ok: Ok): string {
    const cap = typeof request.max_tokens === "number" ? request.max_tokens : Number.POSITIVE_INFINITY;
    const outputTokens = Math.min(ok.outputTokens, cap);
    const finish = outputTokens < ok.outputTokens ? "length" : ok.finish;
    served += 1;
    return JSON.stringify({
      id: `msg_stub_${served}`,
      type: "message",
      role: "assistant",
      model: typeof request.model === "string" ? request.model : model,
      content: [{ type: "text", text: ok.text }],
      stop_reason: STOP[finish],
      stop_sequence: null,
      usage: {
        input_tokens: ok.inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    });
  }

  function echo(request: Record<string, unknown>): Ok {
    const messages = Array.isArray(request.messages) ? (request.messages as { content?: unknown }[]) : [];
    const last = messages.at(-1)?.content;
    return {
      text: `echo: ${typeof last === "string" ? last : ""} ${canary}`,
      inputTokens: 71,
      outputTokens: 14,
      finish: "stop",
    };
  }

  async function answer(
    req: IncomingMessage,
    res: ServerResponse,
    behavior: AnthropicBehavior | undefined,
    ok: () => string,
    gone: () => boolean,
  ): Promise<void> {
    if (behavior === undefined || "ok" in behavior) return send(res, 200, ok());
    if ("message" in behavior) return send(res, 200, JSON.stringify(behavior.message));
    if ("delayMs" in behavior) {
      await later(behavior.delayMs);
      if (gone()) return;
      return send(res, 200, ok());
    }
    if ("hang" in behavior) return;
    if ("resetAfterBody" in behavior) {
      req.socket.destroy();
      return;
    }
    if ("refuse" in behavior) {
      refuse();
      res.socket?.destroy();
      return;
    }
    if ("status" in behavior) return send(res, behavior.status, behavior.body ?? errorBody(behavior.status));
    if ("throttleOnce" in behavior) return send(res, 429, errorBody(429));
    // malformed: a 200 the adapter can't use, with no usage.
    return send(
      res,
      200,
      JSON.stringify({ id: "msg_malformed", type: "message", content: [{ type: "text", text: canary }] }),
    );
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let gone = false;
    res.on("close", () => {
      gone = !res.writableFinished;
    });
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    let text: string;
    try {
      text = await readBody(req);
    } catch {
      return send(res, 413, errorBody(413));
    }
    let body: unknown = text;
    if (text !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
    recorded.push({ method: req.method ?? "", path, headers, body });

    if (req.method === "POST" && path === "/v1/messages") {
      const request = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const behavior = completions.shift() ?? completionsDefault;
      const ok = behavior !== undefined && "ok" in behavior ? behavior.ok : echo(request);
      return answer(
        req,
        res,
        behavior,
        () => message(request, ok),
        () => gone,
      );
    }
    const model$ = /^\/v1\/models\/([^/]+)$/.exec(path);
    if (req.method === "GET" && model$ !== null) {
      const behavior = health.shift() ?? healthDefault;
      const id = decodeURIComponent(model$[1] as string);
      if (behavior !== undefined && "malformed" in behavior) return send(res, 200, JSON.stringify({ data: canary }));
      const info = () =>
        JSON.stringify({ type: "model", id, display_name: "Claude (stub)", created_at: "2026-10-01T00:00:00Z" });
      return answer(req, res, behavior, info, () => gone);
    }
    return send(res, 404, errorBody(404));
  }

  const queue = (into: AnthropicBehavior[], behavior: AnthropicBehavior): void => {
    restore();
    if ("refuse" in behavior) refuse();
    else into.push(behavior);
  };

  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    canary,
    next: (behavior) => queue(completions, behavior),
    nextHealth: (behavior) => queue(health, behavior),
    setCompletions(behavior) {
      completionsDefault = behavior;
    },
    setHealth(behavior) {
      healthDefault = behavior;
    },
    requests: () => [...recorded],
    messages: () => recorded.filter((r) => r.method === "POST" && r.path === "/v1/messages"),
    reset() {
      completions.length = 0;
      health.length = 0;
      completionsDefault = undefined;
      healthDefault = undefined;
      recorded.length = 0;
      restore();
    },
    restore,
    close: () =>
      new Promise<void>((resolve) => {
        closed = true;
        for (const t of timers) clearTimeout(t);
        timers.clear();
        for (const socket of sockets) socket.destroy();
        if (refusing) return resolve();
        server.close(() => resolve());
      }),
  };
}
