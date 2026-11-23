// The local adapter's own failures (tasks.md T151; contracts/provider-adapter.md §2.5's local column and §3.1), past
// the shared suite's C4 (adapter-contract.ts): the HTTP statuses only the local column lists, a DNS failure, and the
// connect watchdog. Each is one ProviderError kind with §2.5's flags, and carries a status or a Node error code and
// nothing else.
//
// - The statuses come from the in-process stub of llama.cpp's API (test/helpers/stub-openai.ts).
// - The name lookup is core/resolve.ts's, through c-ares (T188). Its A and AAAA queries are replaced for the one host
//   model-server, so nothing leaves the process: A fails as c-ares reports it, never answers, or answers 127.0.0.1
//   alone, and AAAA has no record. The container is IPv4-only, as compose's networks are, so ADDRCONFIG keeps the
//   AAAA query from being asked at all: one address, so no happy-eyeballs attempt timeout can end a connect before
//   the watchdog does, and each test can name every query the adapter made.
// - The watchdog needs a connect that never completes. A listener that accepts and never answers completes it, and
//   the call then ends at the request timeout as `timeout`, which is C4's "a timeout". So this listener never
//   accepts: it runs in a worker thread whose event loop is blocked, and once its queue is full the kernel drops the
//   adapter's SYN. A lookup that never answers is the other way a connect never completes ("DNS lookup included").
// - Everything runs at routing.yaml's own timeouts, connect 1 s and request 10 s, so the watchdog is the 1 s one.
import dns from "node:dns";
import { connect, type Socket } from "node:net";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { factory, type LocalSettings } from "../../src/adapters/local-openai.js";
import { loadConfig } from "../../src/config/validate.js";
import { ProviderError, type CompletionRequest, type ProviderAdapter } from "../../src/core/types.js";
import { stubOpenAI, type StubOpenAI } from "../helpers/stub-openai.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
const quiet = { info() {}, warn() {}, error() {} };
const PROMPT = "local-errors-prompt-4d1e: name a colour.";
const MODEL_SERVER = "model-server";

let settings: LocalSettings;
beforeAll(async () => {
  const config = await loadConfig(FIXTURES, { allowPlanned: false });
  const local = config.routing?.adapters.get("local");
  if (!local) throw new Error("the fixture configuration has no local adapter");
  settings = local.settings as unknown as LocalSettings;
  // gateway-http.md §7: connect 1 s, request 10 s, no retry, as config/routing.yaml has them.
  expect(settings.timeouts).toEqual({ connect_ms: 1_000, request_ms: 10_000 });
});

const adapters: ProviderAdapter[] = [];
afterEach(async () => {
  for (const adapter of adapters.splice(0)) await adapter.close?.();
});

function localAdapter(baseUrl: string): ProviderAdapter {
  const adapter = factory.create("local", settings, {
    env: { LOCAL_MODEL_BASE_URL: baseUrl, LOCAL_MODEL_NAME: "stand-in" },
    logger: quiet,
    realNow: Date.now,
  });
  adapters.push(adapter);
  return adapter;
}

const request = (): CompletionRequest => ({
  requestId: "c0de0c0de0c0de0c0de0c0de0c0de0c0",
  purpose: "contract",
  messages: [{ role: "user", content: PROMPT }],
  maxOutputTokens: 16,
  deadline: Date.now() + 20_000, // past the request timeout, so no deadline ends a call here
  signal: new AbortController().signal,
});

/**
 * The call's rejection, which must be a ProviderError, and how long the call took, on the monotonic clock: WSL's wall
 * clock steps back, and Date.now() gave these calls negative durations.
 */
async function failure(adapter: ProviderAdapter): Promise<{ err: ProviderError; ms: number }> {
  const started = performance.now();
  const err = await adapter.complete(request()).then(
    () => undefined,
    (e: unknown) => e,
  );
  const ms = performance.now() - started;
  expect(err).toBeInstanceOf(ProviderError);
  return { err: err as ProviderError, ms };
}

const flags = (err: ProviderError) => ({
  kind: err.kind,
  retryable: err.retryable,
  possiblyBilled: err.possiblyBilled,
  status: err.status,
  code: err.code,
});

/** C6 for one error: its message is its kind, nothing is attached, and none of the markers reaches it. */
function expectBare(err: ProviderError, ...markers: string[]): void {
  expect(err.message).toBe(err.kind);
  expect(err.cause).toBeUndefined();
  for (const text of [String(err), JSON.stringify(err)]) {
    for (const marker of [PROMPT, ...markers]) expect(text).not.toContain(marker);
  }
}

type ResolveDone = (err: NodeJS.ErrnoException | null, addresses: string[]) => void;
type Resolve = (this: dns.Resolver, host: string, ...rest: unknown[]) => void;

/** An error as c-ares reports one: its code, the query, and the host, which the adapter must drop. */
const caresError = (syscall: string, code: string, host: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`${syscall} ${code} ${host}`), { code, syscall, hostname: host });

/**
 * c-ares's queries for model-server alone, as core/resolve.ts asks them: A fails with `code` as c-ares reports it,
 * never answers, or answers one IPv4 address; AAAA has no record (ENODATA). Every other host is asked as usual.
 * Returns the model-server queries seen, as "A model-server" or "AAAA model-server".
 */
function lookupOfModelServer(answer: { code: string } | { address: string } | "never"): string[] {
  const proto = dns.Resolver.prototype as unknown as { resolve4: Resolve; resolve6: Resolve };
  const seen: string[] = [];
  const fake = (type: "A" | "AAAA", real: Resolve): Resolve =>
    function (this: dns.Resolver, host: string, ...rest: unknown[]): void {
      if (host !== MODEL_SERVER) return real.call(this, host, ...rest);
      seen.push(`${type} ${host}`);
      if (answer === "never") return;
      const done = rest[rest.length - 1] as ResolveDone;
      process.nextTick(() => {
        if (type === "AAAA") done(caresError("queryAaaa", "ENODATA", host), []);
        else if ("code" in answer) done(caresError("queryA", answer.code, host), []);
        else done(null, [answer.address]);
      });
    };
  const [real4, real6] = [proto.resolve4, proto.resolve6];
  vi.spyOn(proto, "resolve4").mockImplementation(fake("A", real4));
  vi.spyOn(proto, "resolve6").mockImplementation(fake("AAAA", real6));
  vi.spyOn(os, "networkInterfaces").mockReturnValue({ eth0: [IPV4_ONLY] });
  return seen;
}

/** A compose network's interface: one IPv4 address, and no IPv6. */
const IPV4_ONLY: os.NetworkInterfaceInfo = {
  address: "172.18.0.4",
  netmask: "255.255.0.0",
  family: "IPv4",
  mac: "02:42:ac:12:00:04",
  internal: false,
  cidr: "172.18.0.4/16",
};

/** A connect to 127.0.0.1:port: connected, still pending after `ms`, or failed. A pending one is destroyed. */
async function probe(port: number, ms: number): Promise<{ socket?: Socket; state: "connected" | "pending" }> {
  const socket = connect({ host: "127.0.0.1", port });
  const state = await new Promise<"connected" | "pending" | "failed">((resolve) => {
    const timer = setTimeout(() => resolve("pending"), ms);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve("connected");
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve("failed");
    });
  });
  socket.on("error", () => {});
  if (state === "failed") throw new Error("the listener refused a connection");
  if (state === "pending") {
    socket.destroy();
    return { state };
  }
  return { socket, state };
}

// The listener's thread: it listens with a queue of one, says on which port, then blocks, so nothing ever accepts.
const NEVER_ACCEPTS = `
const { parentPort, workerData } = require("node:worker_threads");
const server = require("node:net").createServer();
server.listen({ host: "127.0.0.1", port: 0, backlog: 1 }, () => {
  parentPort.postMessage(server.address().port);
  Atomics.wait(workerData, 0, 0);
  server.close();
});
`;

/**
 * A listener a connect to never completes: its queue is filled with connections nothing accepts, so the kernel
 * drops any later SYN.
 */
async function listenerThatNeverAccepts(): Promise<{ port: number; close(): Promise<void> }> {
  const gate = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(NEVER_ACCEPTS, { eval: true, workerData: gate });
  const held: Socket[] = [];
  const close = async (): Promise<void> => {
    for (const socket of held) socket.destroy();
    Atomics.store(gate, 0, 1);
    Atomics.notify(gate, 0);
    await worker.terminate();
  };
  try {
    const port = await new Promise<number>((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    // Linux holds backlog + 1 connections, two here; the loop doesn't rely on that.
    for (;;) {
      const { socket, state } = await probe(port, 200);
      if (state === "pending") break;
      held.push(socket as Socket);
      if (held.length > 8) throw new Error("the listener's queue never filled");
    }
    return { port, close };
  } catch (err) {
    await close();
    throw err;
  }
}

describe("the local adapter's HTTP statuses (provider-adapter.md §2.5, the local column)", () => {
  let stub: StubOpenAI;
  beforeAll(async () => {
    stub = await stubOpenAI({ model: "stand-in" });
  });
  afterAll(async () => {
    await stub?.close();
  });
  beforeEach(() => stub.reset());

  const cases = [
    { status: 404, kind: "bad_request", retryable: false },
    { status: 413, kind: "bad_request", retryable: false },
    { status: 422, kind: "bad_request", retryable: false },
    { status: 502, kind: "unavailable", retryable: true },
    { status: 504, kind: "unavailable", retryable: true },
  ] as const;
  for (const c of cases) {
    it(`maps ${c.status} to ${c.kind}, ${c.retryable ? "retryable" : "not retryable"} and not billed`, async () => {
      stub.next({ status: c.status });
      const { err } = await failure(localAdapter(stub.baseUrl));
      expect(flags(err)).toEqual({
        kind: c.kind,
        retryable: c.retryable,
        possiblyBilled: false,
        status: c.status,
        code: undefined,
      });
      expectBare(err, stub.canary);
      // One request: failing over is the retry (§3.1).
      expect(stub.requests().filter((r) => r.method === "POST")).toHaveLength(1);
    });
  }
});

describe("a DNS failure (provider-adapter.md §2.5: unavailable)", () => {
  // c-ares's codes for a name that doesn't exist and for a resolver that doesn't answer. A real ETIMEOUT comes after
  // c-ares's own 1 s tries, so the 1 s watchdog usually ends the call first, as ETIMEDOUT; this one answers at once, to
  // show the code is kept.
  for (const code of ["ENOTFOUND", "ETIMEOUT"]) {
    it(`maps a lookup that fails with ${code} to unavailable at once, keeping only the code`, async () => {
      const seen = lookupOfModelServer({ code });
      // At once: the call fails before the event loop turns once, so no timer, the 1 s watchdog's or any other, and
      // no I/O ended it or held it, on a loaded machine as on an idle one (a bound in ms failed on load, fix/036).
      let turned = false;
      setImmediate(() => {
        turned = true;
      });
      const { err } = await failure(localAdapter(`http://${MODEL_SERVER}:8080/v1`));
      expect(turned).toBe(false);
      expect(seen).toEqual([`A ${MODEL_SERVER}`]);
      expect(flags(err)).toEqual({
        kind: "unavailable",
        retryable: true,
        possiblyBilled: false,
        status: undefined,
        code,
      }); // the lookup's own code, not the watchdog's ETIMEDOUT
      expectBare(err, MODEL_SERVER, "queryA");
    });
  }
});

describe("the connect watchdog (provider-adapter.md §3.1: connect 1 s, then unavailable ETIMEDOUT)", () => {
  const timedOut = {
    kind: "unavailable",
    retryable: true,
    possiblyBilled: false,
    status: undefined,
    code: "ETIMEDOUT",
  };

  /** The call's timers' delays, and its failure: "at 1 s" without a bound in ms, which a loaded machine broke (4.2 s
   *  against 3 s, 2026-11-11; fix/036). The watchdog is armed for connect_ms, and its error is unavailable ETIMEDOUT;
   *  the 10 s request timeout's is a timeout, and timers that are both due run in the order they fell due, so an error
   *  of the watchdog's means the watchdog ended the call, however late the machine ran it; and not before 1 s. */
  async function watchdogFailure(adapter: ProviderAdapter): Promise<ProviderError> {
    const timers = vi.spyOn(globalThis, "setTimeout");
    const { err, ms } = await failure(adapter);
    expect(flags(err)).toEqual(timedOut);
    expect(timers.mock.calls.map((c) => c[1])).toContain(settings.timeouts.connect_ms);
    expect(ms).toBeGreaterThanOrEqual(900);
    return err;
  }

  it("fails a connect the listener never completes as unavailable at 1 s, long before the 10 s request timeout", async () => {
    const listener = await listenerThatNeverAccepts();
    try {
      const seen = lookupOfModelServer({ address: "127.0.0.1" });
      const err = await watchdogFailure(localAdapter(`http://${MODEL_SERVER}:${listener.port}/v1`));
      expect(seen).toEqual([`A ${MODEL_SERVER}`]); // no AAAA query: ADDRCONFIG, and an IPv4-only container
      expectBare(err);
    } finally {
      await listener.close();
    }
  });

  it("counts the name lookup in the connect: a lookup that never answers fails the same way, at 1 s", async () => {
    const seen = lookupOfModelServer("never");
    const err = await watchdogFailure(localAdapter(`http://${MODEL_SERVER}:8080/v1`));
    expect(seen).toEqual([`A ${MODEL_SERVER}`]);
    expectBare(err, MODEL_SERVER);
  });
});
