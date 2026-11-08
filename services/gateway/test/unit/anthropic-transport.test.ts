// The Anthropic adapter's transport (spec 010, FR-009, FR-010, FR-016, FR-031, SC-003; plan §2.6; tasks.md T008,
// T013): the fetch the SDK is given. It refuses any origin but its own before a socket opens, resolves through c-ares
// (or the lookup it is given), times the connect, tells a call that never reached the API from one that may have, and
// sets every header itself: the key, as a bearer token, only in `authorization`, and no trace context. The key is
// made at run time, never key-shaped.
import { randomBytes } from "node:crypto";
import dns from "node:dns";
import type { LookupFunction } from "node:net";
import os from "node:os";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  AnthropicTransportError,
  createAnthropicTransport,
  SENT_HEADERS,
  type AnthropicTransport,
} from "../../src/adapters/_anthropic-transport.js";
import { stubAnthropic, type StubAnthropic } from "../helpers/stub-anthropic.js";

const KEY = `test-${randomBytes(16).toString("hex")}`;
const VERSION = "2026-10-21";
const PROMPT = "transport-prompt-5c1d: name a colour.";
const UA = "Anthropic/JS 1.3.0";
const BODY = JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 16, messages: [{ role: "user", content: PROMPT }] });

let stub: StubAnthropic;
const transports: AnthropicTransport[] = [];
beforeAll(async () => {
  stub = await stubAnthropic();
});
afterAll(async () => {
  await stub.close();
});
afterEach(() => {
  stub.reset();
  vi.restoreAllMocks();
  for (const t of transports.splice(0)) t.destroy();
});

function transport(o: { origin?: string; connectMs?: number; lookup?: LookupFunction } = {}): AnthropicTransport {
  const t = createAnthropicTransport({
    origin: o.origin ?? stub.origin,
    connectMs: o.connectMs ?? 1_000,
    apiKey: KEY,
    version: VERSION,
    userAgent: UA,
    ...(o.lookup === undefined ? {} : { lookup: o.lookup }),
  });
  transports.push(t);
  return t;
}

const post = (t: AnthropicTransport, init: RequestInit = {}, path = "/v1/messages") =>
  t.fetch(`${(t as unknown as { origin?: string }).origin ?? stub.origin}${path}`, {
    method: "POST",
    body: BODY,
    headers: { "content-type": "application/json" },
    ...init,
  });

async function failure(work: Promise<unknown>): Promise<AnthropicTransportError> {
  const err = await work.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AnthropicTransportError);
  return err as AnthropicTransportError;
}

const TIMEOUT_WORDING = /timed? ?out/i;

describe("the origin lock (FR-005, FR-033)", () => {
  it("refuses another origin before a socket opens, as unavailable's ORIGIN_REFUSED, never reached", async () => {
    const t = transport();
    for (const url of [
      "https://api.anthropic.com/v1/messages",
      `http://localhost:${stub.port}/v1/messages`,
      `https://127.0.0.1:${stub.port}/v1/messages`,
      `http://127.0.0.1:${stub.port + 1}/v1/messages`,
    ]) {
      const err = await failure(t.fetch(url, { method: "POST", body: BODY }));
      expect([err.code, err.reached]).toEqual(["ORIGIN_REFUSED", false]);
    }
    expect(stub.requests()).toEqual([]);
  });
});

describe("the headers it sets (FR-016, FR-031, SC-003)", () => {
  it("sends only its own headers, with the key only in authorization, and none the SDK passes in", async () => {
    const t = transport();
    const res = await post(t, {
      headers: {
        "content-type": "application/json",
        "x-api-key": "someone-else",
        authorization: "Bearer someone-else",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "x",
        "user-agent": "other",
        "x-stainless-os": "Linux",
        "x-stainless-retry-count": "0",
        traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
        tracestate: "a=b",
        baggage: "k=v",
        "x-custom": "from ANTHROPIC_CUSTOM_HEADERS",
      },
    });
    expect(res.status).toBe(200);
    const [sent] = stub.requests();
    const names = Object.keys(sent?.headers ?? {}).filter((h) => h !== "host" && h !== "connection");
    expect(names.sort()).toEqual([...SENT_HEADERS].sort());
    expect(sent?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(sent?.headers["anthropic-version"]).toBe(VERSION);
    expect(sent?.headers["user-agent"]).toBe(UA);
    expect(sent?.headers.accept).toBe("application/json");
    expect(sent?.headers["content-type"]).toBe("application/json");
    expect(sent?.headers["content-length"]).toBe(String(Buffer.byteLength(BODY)));
    const others = Object.entries(sent?.headers ?? {}).filter(([k]) => k !== "authorization");
    expect(JSON.stringify(others)).not.toContain(KEY);
    expect(JSON.stringify(sent?.body)).not.toContain(KEY);
  });

  it("sends a GET with no body and no content headers", async () => {
    const t = transport();
    const res = await t.fetch(`${stub.origin}/v1/models/claude-haiku-5-5`, { method: "GET" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "claude-haiku-5-5" });
    const [sent] = stub.requests();
    expect(Object.keys(sent?.headers ?? {})).not.toContain("content-type");
    expect(sent?.headers["content-length"] ?? "0").toBe("0");
  });

  it("hands back the response's status, headers, and body as a standard Response", async () => {
    stub.next({ status: 429 });
    const res = await post(transport());
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toMatchObject({ type: "error", error: { type: "rate_limit_error" } });
  });
});

describe("the name lookup (FR-010; T188)", () => {
  it("resolves through the lookup it is given", async () => {
    const seen: string[] = [];
    const lookup: LookupFunction = (host, _options, callback) => {
      seen.push(host);
      process.nextTick(() => (callback as (e: null, a: string, f: number) => void)(null, "127.0.0.1", 4));
    };
    const t = transport({ origin: `http://anthropic-stub:${stub.port}`, lookup });
    const res = await t.fetch(`http://anthropic-stub:${stub.port}/v1/models/claude-haiku-5-5`, { method: "GET" });
    expect(res.status).toBe(200);
    expect(seen).toEqual(["anthropic-stub"]);
  });

  it("resolves through c-ares by default, never getaddrinfo", async () => {
    const proto = dns.Resolver.prototype as unknown as {
      resolve4: (h: string, cb: (e: NodeJS.ErrnoException | null, a: string[]) => void) => void;
      resolve6: (h: string, cb: (e: NodeJS.ErrnoException | null, a: string[]) => void) => void;
    };
    const asked: string[] = [];
    vi.spyOn(proto, "resolve4").mockImplementation((host, cb) => {
      asked.push(host);
      process.nextTick(() => cb(null, ["127.0.0.1"]));
    });
    vi.spyOn(proto, "resolve6").mockImplementation((_host, cb) => {
      const err: NodeJS.ErrnoException = new Error("no data");
      err.code = "ENODATA";
      process.nextTick(() => cb(err, []));
    });
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      eth0: [
        {
          address: "10.0.0.2",
          netmask: "255.0.0.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "10.0.0.2/8",
        },
      ],
    });
    const getaddrinfo = vi.spyOn(dns, "lookup");
    const t = transport({ origin: `http://anthropic-stub:${stub.port}` });
    const res = await t.fetch(`http://anthropic-stub:${stub.port}/v1/models/claude-haiku-5-5`, { method: "GET" });
    expect(res.status).toBe(200);
    expect(asked).toEqual(["anthropic-stub"]);
    expect(getaddrinfo).not.toHaveBeenCalled();
  });
});

describe("failures, reached or not (FR-009; plan §2.5, §2.6; departure B4)", () => {
  it("a refused connection never reached the API: ECONNREFUSED", async () => {
    stub.next({ refuse: true });
    const err = await failure(post(transport()));
    expect([err.code, err.reached]).toEqual(["ECONNREFUSED", false]);
  });

  it("a lookup that fails never reached the API, keeping only its code", async () => {
    for (const code of ["ENOTFOUND", "ETIMEOUT"]) {
      const lookup: LookupFunction = (_host, _options, callback) => {
        const err: NodeJS.ErrnoException = new Error("no address");
        err.code = code;
        process.nextTick(() => (callback as (e: NodeJS.ErrnoException) => void)(err));
      };
      const t = transport({ origin: `http://anthropic-stub:${stub.port}`, lookup });
      const err = await failure(
        t.fetch(`http://anthropic-stub:${stub.port}/v1/messages`, { method: "POST", body: BODY }),
      );
      expect([err.code, err.reached]).toEqual([code, false]);
    }
  });

  it("the connect watchdog: a connect that never completes, the lookup included, ends at connectMs, unreached", async () => {
    const lookup: LookupFunction = () => {}; // never answers
    const t = transport({ origin: `http://anthropic-stub:${stub.port}`, connectMs: 150, lookup });
    const started = performance.now();
    const err = await failure(
      t.fetch(`http://anthropic-stub:${stub.port}/v1/messages`, { method: "POST", body: BODY }),
    );
    expect([err.code, err.reached]).toEqual(["ETIMEDOUT", false]);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("a connection lost after the body was written may have reached the API", async () => {
    stub.next({ resetAfterBody: true });
    const err = await failure(post(transport()));
    expect(err.reached).toBe(true);
    expect(err.code).toMatch(/^(ECONNRESET|EPIPE|SOCKET_CLOSED)$/);
  });

  it("an abort rejects as fetch's AbortError", async () => {
    stub.next({ hang: true });
    const controller = new AbortController();
    const work = post(transport(), { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    const err = (await work.catch((e: unknown) => e)) as Error;
    expect(err.name).toBe("AbortError");
  });

  it("never words an error as a timeout, so the SDK keeps it as the connection error's cause, and never names the key", async () => {
    stub.next({ refuse: true });
    const refused = await failure(post(transport()));
    const watchdog = await failure(
      transport({ origin: `http://anthropic-stub:${stub.port}`, connectMs: 100, lookup: () => {} }).fetch(
        `http://anthropic-stub:${stub.port}/v1/messages`,
        { method: "POST", body: BODY },
      ),
    );
    for (const err of [refused, watchdog]) {
      expect(String(err)).not.toMatch(TIMEOUT_WORDING);
      expect("cause" in err).toBe(false);
      for (const text of [String(err), JSON.stringify(err), err.stack ?? ""]) {
        expect(text).not.toContain(KEY);
        expect(text).not.toContain(PROMPT);
      }
    }
  });
});
