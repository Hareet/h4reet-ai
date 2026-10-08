// A fake Postgres on the sandbox's own loopback, speaking just enough of the wire protocol (v3) for pg to connect:
// no SSL, trust authentication, then ReadyForQuery. In "drop" mode it destroys the socket on the first query, as a
// store that dies under a connection does; in "answer" mode it answers every query with an empty result.
// It lets the tests reach pgDatabase, which the PGlite helper bypasses.
import { createServer, type Socket } from "node:net";

export type FakePostgresMode = "drop" | "answer";

export interface FakePostgres {
  readonly port: number;
  /** Each query's text, from a simple Query or an extended-protocol Parse. */
  readonly queries: string[];
  /** Connections accepted so far. */
  connections(): number;
  close(): Promise<void>;
}

const SSL_REQUEST = 80_877_103;

const int32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};
const cstring = (s: string): Buffer => Buffer.from(`${s}\0`, "utf8");
const message = (type: string, ...parts: Buffer[]): Buffer => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(5);
  head.write(type, 0, "ascii");
  head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
};

const READY = message("Z", Buffer.from("I"));
const STARTED = Buffer.concat([
  message("R", int32(0)), // AuthenticationOk
  message("S", cstring("server_version"), cstring("17.0")),
  message("K", int32(4242), int32(1)), // BackendKeyData
  READY,
]);
const EMPTY_RESULT = Buffer.concat([message("C", cstring("SELECT 0")), READY]);
// Parse, Bind, then Describe (portal) and Execute: ParseComplete, BindComplete, NoData, then the result.
const EXTENDED_RESULT = Buffer.concat([message("1"), message("2"), message("n"), EMPTY_RESULT]);

export async function fakePostgres(mode: FakePostgresMode): Promise<FakePostgres> {
  const queries: string[] = [];
  const sockets = new Set<Socket>();
  let accepted = 0;

  const server = createServer((socket) => {
    accepted += 1;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let started = false;
    let pending = Buffer.alloc(0);

    const onQuery = (text: string): boolean => {
      queries.push(text);
      if (mode === "drop") {
        socket.destroy();
        return false;
      }
      return true;
    };

    socket.on("data", (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      for (;;) {
        if (!started) {
          if (pending.length < 8) return;
          const length = pending.readInt32BE(0);
          if (pending.length < length) return;
          const code = pending.readInt32BE(4);
          pending = pending.subarray(length);
          if (code === SSL_REQUEST) {
            socket.write("N");
            continue;
          }
          started = true;
          socket.write(STARTED);
          continue;
        }
        if (pending.length < 5) return;
        const type = String.fromCharCode(pending[0] as number);
        const length = pending.readInt32BE(1);
        if (pending.length < 1 + length) return;
        const body = pending.subarray(5, 1 + length);
        pending = pending.subarray(1 + length);
        if (type === "X") {
          socket.end(); // Terminate
          return;
        }
        if (type === "Q") {
          if (!onQuery(body.toString("utf8", 0, body.length - 1))) return;
          socket.write(EMPTY_RESULT);
        } else if (type === "P") {
          const nameEnd = body.indexOf(0);
          if (!onQuery(body.toString("utf8", nameEnd + 1, body.indexOf(0, nameEnd + 1)))) return;
        } else if (type === "S") {
          socket.write(EXTENDED_RESULT); // Sync closes an extended-protocol query
        }
        // Bind, Describe, Execute, and Flush need no answer of their own here.
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return {
    port: address.port,
    queries,
    connections: () => accepted,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
