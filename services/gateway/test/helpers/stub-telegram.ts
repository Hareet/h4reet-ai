// A stub of the Telegram Bot API's sendMessage on the sandbox's own loopback (spec 011's tests; the same shape as
// test/integration/dispatcher.test.ts's). It records each request's path, body, and arrival time on the monotonic
// clock, and the time it answered; the next answers are queued, then 200 with a message_id. An answer can wait for
// a hook the test supplies before it goes, so a test can act between a refused designed send and the plain one.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

type Rec = Record<string, unknown>;

export type TelegramAnswer = { status: number; body: unknown } | { hang: true };

export interface TelegramStub {
  url: string;
  requests: { path: string; body: Rec; at: number; answeredAt?: number }[];
  /** The next answers, then 200 with a message_id. */
  next: TelegramAnswer[];
  /** Runs before each answer goes out, and is awaited: the request's index is its argument. */
  beforeAnswer: ((index: number) => Promise<void>) | undefined;
  close(): Promise<void>;
}

export async function telegramStub(): Promise<TelegramStub> {
  const stub: TelegramStub = {
    url: "",
    requests: [],
    next: [],
    beforeAnswer: undefined,
    close: async () => {},
  };
  let id = 0;
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    req.on("end", () => {
      const index = stub.requests.length;
      const entry = { path: req.url ?? "", body: JSON.parse(raw || "{}") as Rec, at: performance.now() };
      stub.requests.push(entry);
      const answer = stub.next.shift();
      void (async () => {
        if (stub.beforeAnswer !== undefined) await stub.beforeAnswer(index);
        if (answer !== undefined && "hang" in answer) return; // never answers: the client's timeout ends it
        const status = answer?.status ?? 200;
        const body = answer?.body ?? { ok: true, result: { message_id: (id += 1) } };
        (entry as { answeredAt?: number }).answeredAt = performance.now();
        res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
      })();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  stub.url = `http://127.0.0.1:${port}`;
  stub.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return stub;
}
