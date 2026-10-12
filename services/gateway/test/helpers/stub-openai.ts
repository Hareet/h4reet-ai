// An in-process stub of the OpenAI-compatible API that llama.cpp serves (contracts/provider-adapter.md §5.3):
// node:http on the sandbox's own loopback, at a random port, reached as http://localhost:<port>/v1, a single-label
// host as the local adapter requires. The local adapter's contract test and the hello integration test run against
// it; nothing leaves the process.
//
// - POST /v1/chat/completions answers the next behavior queued with next(), or the standing one set with
//   setCompletions(), or else an echo of the last message.
// - GET /v1/models answers the next behavior queued with nextHealth(), or the one set with setHealth(), or else the
//   model list, which names the configured model. The two queues are separate, so a background health probe never
//   takes a completion's behavior.
// - A canary sits in every echo and every error body, so a test can show that the adapter never carries a
//   provider's text into an error or a log (C6).
// - { refuse: true } stops listening at once, so the next connection is refused, as with a stopped model server.
//   The stub listens again, on the same port, at the next call to next(), nextHealth(), restore(), or reset().
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

import type { StubBehavior, StubControl, StubRequest } from "../contract/adapter-contract.js";

export interface StubOpenAI extends StubControl {
  /** http://localhost:<port>/v1 */
  readonly baseUrl: string;
  readonly port: number;
  /** The model the stub lists and answers as. */
  readonly model: string;
  nextHealth(behavior: StubBehavior): void;
  /** A behavior that answers every completion until it is cleared, unlike next(), which answers one. */
  setCompletions(behavior: StubBehavior | undefined): void;
  /** The same for GET /v1/models. */
  setHealth(behavior: StubBehavior | undefined): void;
  /** Listen again after { refuse: true }. */
  restore(): void;
  close(): Promise<void>;
}

type Ok = Extract<StubBehavior, { ok: unknown }>["ok"];

const MAX_BODY_BYTES = 1_048_576;

export async function stubOpenAI(opts: { model?: string } = {}): Promise<StubOpenAI> {
  const model = opts.model ?? "stand-in";
  const canary = `canary-${randomBytes(6).toString("hex")}`;
  const completions: StubBehavior[] = [];
  const health: StubBehavior[] = [];
  let completionsDefault: StubBehavior | undefined;
  let healthDefault: StubBehavior | undefined;
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

  /** Stop listening now: the port refuses connections until restore(). */
  function refuse(): void {
    if (refusing || closed) return;
    refusing = true;
    server.close();
    for (const socket of sockets) socket.destroy();
  }

  function restore(): void {
    if (!refusing || closed) return;
    refusing = false;
    // listen() binds synchronously for an IP address, so the port answers again before this returns.
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
    res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.end(body);
  };
  const errorBody = (status: number): string =>
    JSON.stringify({ error: { code: status, message: `stub error ${status}: ${canary}`, type: "stub" } });

  /** An answer as llama.cpp gives it: the output cut at max_tokens, and then a finish of length. */
  function completion(request: Record<string, unknown>, ok: Ok): string {
    const cap = typeof request.max_tokens === "number" ? request.max_tokens : Number.POSITIVE_INFINITY;
    const outputTokens = Math.min(ok.outputTokens, cap);
    const finish = outputTokens < ok.outputTokens ? "length" : ok.finish;
    served += 1;
    return JSON.stringify({
      id: `chatcmpl-stub-${served}`,
      object: "chat.completion",
      created: 1_791_446_400,
      model: typeof request.model === "string" ? request.model : model,
      choices: [{ index: 0, message: { role: "assistant", content: ok.text }, finish_reason: finish }],
      usage: {
        prompt_tokens: ok.inputTokens,
        completion_tokens: outputTokens,
        total_tokens: ok.inputTokens + outputTokens,
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
    res: ServerResponse,
    behavior: StubBehavior | undefined,
    ok: () => string,
    gone: () => boolean,
  ): Promise<void> {
    if (behavior === undefined || "ok" in behavior) return send(res, 200, ok());
    if ("delayMs" in behavior) {
      await later(behavior.delayMs);
      if (gone()) return;
      return send(res, 200, ok());
    }
    if ("refuse" in behavior) {
      // A standing refusal: this connection was accepted already, so it is dropped, and the next ones refused.
      refuse();
      res.socket?.destroy();
      return;
    }
    if ("status" in behavior) return send(res, behavior.status, behavior.body ?? errorBody(behavior.status));
    if ("throttleOnce" in behavior) return send(res, 429, errorBody(429));
    // malformed: a 200 the adapter can't use, with no usage.
    return send(res, 200, JSON.stringify({ id: "chatcmpl-malformed", choices: [{ message: { content: canary } }] }));
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

    if (req.method === "POST" && path === "/v1/chat/completions") {
      const request = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const behavior = completions.shift() ?? completionsDefault;
      const ok = behavior !== undefined && "ok" in behavior ? behavior.ok : echo(request);
      return answer(
        res,
        behavior,
        () => completion(request, ok),
        () => gone,
      );
    }
    if (req.method === "GET" && path === "/v1/models") {
      const behavior = health.shift() ?? healthDefault;
      if (behavior !== undefined && "malformed" in behavior) return send(res, 200, JSON.stringify({ data: canary }));
      const list = () => JSON.stringify({ object: "list", data: [{ id: model, object: "model", owned_by: "stub" }] });
      return answer(res, behavior, list, () => gone);
    }
    return send(res, 404, errorBody(404));
  }

  const queue = (into: StubBehavior[], behavior: StubBehavior): void => {
    restore();
    if ("refuse" in behavior) refuse();
    else into.push(behavior);
  };

  return {
    baseUrl: `http://localhost:${port}/v1`,
    port,
    model,
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
