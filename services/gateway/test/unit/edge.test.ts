import { describe, expect, it } from "vitest";

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
});
