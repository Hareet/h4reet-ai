// T124 (spec 004; FR-068; research.md R-41; contracts/lookdev.md §4, plain-model-fit.md §11): the lookdev page's
// SHA-256, pure JavaScript because the phone copy may not be a secure context for crypto.subtle, equals Node's on inputs
// generated when the test runs, from 0 bytes to a few megabytes: every length across the first three blocks, where the
// padding's edges fall (55, 56, and 64 bytes a block), random bytes and repeated patterns, and a view into a larger
// buffer. No digest is written here: each is Node's, computed beside it.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sha256 } from "../../src/lookdev/sha256";

const node = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** Marsaglia's xorshift32 (13, 17, 5), as test/room/gzip.test.ts steps it: `n` bytes, each word little-endian. */
function randomBytes(seed: number, n: number): Uint8Array {
  let x = seed >>> 0;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 4) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    for (let k = 0; k < 4 && i + k < n; k++) out[i + k] = (x >>> (8 * k)) & 0xff;
  }
  return out;
}

/** `n` bytes of one short pattern, repeated. */
function pattern(text: string, n: number): Uint8Array {
  const unit = new TextEncoder().encode(text);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = unit[i % unit.length] ?? 0;
  return out;
}

describe("the lookdev page's SHA-256 (FR-068)", () => {
  it("equals Node's on every length from 0 to 200 bytes, across the padding's edges", () => {
    const source = randomBytes(0x9e3779b9, 200);
    for (let n = 0; n <= 200; n++) {
      const data = source.slice(0, n);
      expect(sha256(data), `${n} bytes`).toBe(node(data));
    }
  });

  it("equals Node's on every single byte value, and on runs of zeros and of 0xff", () => {
    for (let b = 0; b < 256; b++) expect(sha256(Uint8Array.of(b)), `byte ${b}`).toBe(node(Uint8Array.of(b)));
    for (const n of [64, 1000, 65_536]) {
      expect(sha256(new Uint8Array(n)), `${n} zeros`).toBe(node(new Uint8Array(n)));
      expect(sha256(new Uint8Array(n).fill(0xff)), `${n} × 0xff`).toBe(node(new Uint8Array(n).fill(0xff)));
    }
  });

  it("equals Node's on generated inputs up to a few megabytes, random and patterned", () => {
    const cases: [string, Uint8Array][] = [
      ["1,000 random bytes", randomBytes(1, 1000)],
      ["4,095 random bytes", randomBytes(2, 4095)],
      ["4,096 random bytes", randomBytes(3, 4096)],
      ["65,543 random bytes", randomBytes(4, 65_543)],
      ["1,000,003 random bytes", randomBytes(5, 1_000_003)],
      ["2,500,001 patterned bytes", pattern("fx-pattern-", 2_500_001)],
      ["3,000,017 random bytes", randomBytes(6, 3_000_017)],
    ];
    for (const [name, data] of cases) expect(sha256(data), name).toBe(node(data));
  });

  it("hashes a view's bytes alone, leaves its input unchanged, and gives 64 lowercase hexadecimal digits", () => {
    const whole = randomBytes(7, 5000);
    const before = whole.slice();
    const view = whole.subarray(3, 3 + 1001);
    const digest = sha256(view);
    expect(digest).toBe(node(whole.slice(3, 3 + 1001)));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(whole).toEqual(before);
    // The same bytes give the same digest, call after call: no state carries over.
    expect(sha256(view)).toBe(digest);
    expect(sha256(new Uint8Array())).toBe(node(new Uint8Array()));
  });
});
