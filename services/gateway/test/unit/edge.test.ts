import dns from "node:dns";

import { describe, expect, it, vi } from "vitest";

import { edgePeer } from "../../src/core/edge.js";

describe("which peer is edge (gateway-http.md §2.3)", () => {
  it("believes only edge's addresses, written either way", async () => {
    const isEdge = edgePeer({ resolve: async () => ["172.20.0.5"] });
    expect(await isEdge("172.20.0.5")).toBe(true);
    expect(await isEdge("::ffff:172.20.0.5")).toBe(true);
    expect(await isEdge("172.20.0.6")).toBe(false);
  });

  it("believes no one while the lookup fails, and looks again after its TTL", async () => {
    let now = 0;
    let answer: () => Promise<string[]> = async () => {
      throw new Error("no such host");
    };
    const isEdge = edgePeer({ ttlMs: 1_000, now: () => now, resolve: () => answer() });
    expect(await isEdge("172.20.0.5")).toBe(false);
    answer = async () => ["172.20.0.5"];
    expect(await isEdge("172.20.0.5")).toBe(false); // still the failed answer, within its TTL
    now = 1_001;
    expect(await isEdge("172.20.0.5")).toBe(true);
  });

  it("asks c-ares for edge's addresses by default (T189)", async () => {
    // getaddrinfo could never resolve this made-up name, so an answer proves the lookup went to c-ares.
    type Resolve = (this: dns.Resolver, host: string, ...rest: unknown[]) => void;
    const proto = dns.Resolver.prototype as unknown as { resolve4: Resolve; resolve6: Resolve };
    const asked: string[] = [];
    const fake = (type: "A" | "AAAA", real: Resolve): Resolve =>
      function (this: dns.Resolver, host: string, ...rest: unknown[]): void {
        if (host !== "edge.invalid" && host !== "gone.invalid") return real.call(this, host, ...rest);
        asked.push(`${type} ${host}`);
        const done = rest[rest.length - 1] as (err: NodeJS.ErrnoException | null, addresses: string[]) => void;
        const error = (code: string) => Object.assign(new Error(`query${type} ${code} ${host}`), { code });
        setImmediate(() => {
          if (host === "gone.invalid") done(error("ENOTFOUND"), []);
          else if (type === "A") done(null, ["172.20.0.5"]);
          else done(error("ENODATA"), []);
        });
      };
    const [real4, real6] = [proto.resolve4, proto.resolve6];
    vi.spyOn(proto, "resolve4").mockImplementation(fake("A", real4));
    vi.spyOn(proto, "resolve6").mockImplementation(fake("AAAA", real6));
    const isEdge = edgePeer({ host: "edge.invalid" });
    expect(await isEdge("::ffff:172.20.0.5")).toBe(true);
    expect(await isEdge("172.20.0.6")).toBe(false);
    expect(asked).toEqual(["A edge.invalid", "AAAA edge.invalid"]); // every address, once per TTL
    // A name c-ares can't resolve believes no one, as a failed lookup always has.
    const gone = edgePeer({ host: "gone.invalid" });
    expect(await gone("172.20.0.5")).toBe(false);
    expect(asked.slice(2)).toEqual(["A gone.invalid"]);
  });
});
