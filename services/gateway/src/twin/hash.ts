// The twin's hashes (spec 007; FR-030; plan §4, §6, R-11): SHA-256 of canonical JSON, every object's keys sorted, as
// the room's build computes them (apps/web/build/twin-pack.ts and build/room/readiness.ts). The pack's hashes, whole and
// per topic, and the prompt hash over config/twin/prompt.md and lines.yaml together; the shared readiness matrix
// (test/fixtures/twin-readiness-matrix.json) pins both sides to the same function.
import { createHash } from "node:crypto";

/** A value with every object's keys sorted, recursively. */
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonical(object[key])]),
    );
  }
  return value;
}

export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** SHA-256 of a value's canonical JSON, compact. */
export function canonicalHash(value: unknown): string {
  return sha256Hex(JSON.stringify(canonical(value)));
}

/** The prompt hash: the instructions and the fixed lines, as their files' texts. */
export function promptHash(prompt: string, lines: string): string {
  return canonicalHash({ "lines.yaml": lines, "prompt.md": prompt });
}
